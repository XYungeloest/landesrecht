/**
 * Analyse je Kandidat und je Norm: Vom Ereignis des Registers zur sicheren Wiederherstellung – oder zum Review
 * mit dem genau benannten fehlenden Glied.
 *
 * Reihenfolge der Prüfungen (die erste, die scheitert, benennt das Glied):
 *
 *   Kandidat  1 Identität     starke Zuordnung im Register, Zitat in der Aufhebungsverkündung genau einmal
 *             2 Ende          Aufhebungs-/Außerkrafttretensbefehl und sein Wirksamwerden (`commencement.ts`)
 *             3 Stichtag      nach dem Stichtag beendet, vor ihm ausgefertigt
 *             4 Fundstelle    verkündet? elektronisch amtlich (BayMBl. ab 2019, Amtsblätter 2009–2018) oder GVBl.?
 *             5 Ausgangsseite abgerufen, Datum und Fundstelle stimmen, Titel passt
 *   Norm      6 Umfang        Erlassstelle der Staatsregierung/eines Staatsministeriums, kein Prüffall nach LEGAL_SCOPE
 *             7 Vollständigkeit keine Anlage nur als PDF, kein Bild, Text vollständig umsetzbar (`html.ts`)
 *             8 Beginn        Inkrafttretensvorschrift mit Kalenderdatum, am oder vor dem Stichtag
 *             9 Weitergeltung VwVWBek (Verwaltungsvorschriften bis 2015 nur mit Positivliste)
 *            10 Kette         Gegenprobe über die Gliederungsnummern, Änderungen anwenden, Berichtigungen, frühere Enden
 *            11 Ende der Fassung  erste Änderung nach dem Stichtag begrenzt die Textgeltung
 */
import { createHash } from 'node:crypto';

import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { stableStringify } from '@landesrecht/importer-recht-nrw/common/persist.ts';

import type { ValidityEvidence } from '../common/evidence.ts';
import { commencementDate, commencementStatements } from '../reconstruction/commencement.ts';
import { findInAmtsblattListings } from './search.ts';
import { checkedPublicationDate, ownPublicationDate, relativeDate, relativeRule, repairOwnCommencement, type RelativeRule } from './relative.ts';
import { pdfText } from '../reconstruction/pdf.ts';
import type { GazetteUnit } from '../reconstruction/gazette.ts';
import { gazetteUnits } from '../reconstruction/gazette.ts';
import { parseLongGermanDate } from '../events/resolve.ts';
import type { LedgerEvent } from '../events/ledger.ts';
import { headDates, resolveBase, sourceRef, type GazettePublication, type SourceDocumentRef } from './base.ts';
import { AMTSBLATT_FULL_READ_CAP, AMTSBLATT_ISSUE_CAP, amendmentCommencement, applyAmendment, baymblListedDate, normIdentityOf, scanChain } from './chain.ts';
import { findInPositivliste, loadPositivliste, POSITIVLISTE_CITATION, POSITIVLISTE_URL, type Positivliste, type PositivlisteRow } from './positivliste.ts';

/** Nr. 1 VwVWBek: bis zu diesem Tag erlassene Verwaltungsvorschriften gelten nur mit Aufnahme in die Positivliste fort. */
const VWVWBEK_CUTOFF = '2015-12-31';

import { convertGazetteHtml, ConversionError, CONVERTER_VERSION, type ConvertedGazette } from './html.ts';
import { addDays, determineEndAcross, locateCitation, type EndDetermination, type LocatedCitation } from './identity.ts';
import { MISSING_LINKS, RECIPE_SCHEMA, type BaselineOnlyRecipe, type CandidateRecord, type MissingLink, type MissingLinkRecord, type Outcome, type RecipeAmendment, type RecipeSource } from './model.ts';
import { isPageMiss, type Platform } from './platform.ts';
import { locateBase, parseParenthetical, PLATFORM_ORIGIN, sameReference, type BaseLocation, type GazetteReference } from './references.ts';

const DATE = String.raw`\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4}`;

export const bodyFingerprint = (blocks: readonly NormBodyBlock[]): string => createHash('sha256').update(stableStringify(blocks)).digest('hex');

export function formatLongDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  return `${Number(day)}. ${months[Number(month) - 1]} ${year}`;
}

export interface AnalyzeContext {
  platform: Platform;
  baselineDate: string;
  evaluationDate: string;
  log?: (line: string) => void;
}

/** Ergebnis der Kandidatenstufe; `work` trägt, was die Normstufe braucht. */
export interface CandidateWork {
  record: CandidateRecord;
  event: LedgerEvent;
  citation?: LocatedCitation;
  end?: EndDetermination;
  location?: BaseLocation;
  publication?: GazettePublication;
  repealSha256?: string;
  /** Zitat ohne Fundstelle: Beleg der Suche in den Inhaltsübersichten (`search.ts`). */
  foundBy?: string;
}

const outcomeOf = (code: MissingLink): Outcome => MISSING_LINKS[code];

function fail(work: CandidateWork, code: MissingLink, detail: string): CandidateWork {
  work.record.outcome = outcomeOf(code);
  work.record.missing = { code, detail };
  return work;
}

/* --------------------------------------------------------------------------------- Kandidat */

export async function analyzeCandidate(ctx: AnalyzeContext, event: LedgerEvent): Promise<CandidateWork> {
  const record: CandidateRecord = {
    eventId: event.id,
    registerTitle: event.targetTitle,
    matchStrength: event.targetResolution.matchStrength,
    repeal: { url: event.sourceUrl, citation: event.citation, ...(event.eventDate ? { publishedAt: event.eventDate } : {}) },
    outcome: 'undetermined',
    funnel: { strongIdentity: false, baseFound: false, fullChain: false, safe: false },
  };
  const work: CandidateWork = { record, event };
  if (event.targetResolution.matchStrength !== 'strong') return fail(work, 'identity-not-strong', `Zuordnung im Ereignisregister nur ${event.targetResolution.matchStrength} (${event.targetResolution.matchedOn.join(', ') || 'ohne Merkmal'})`);
  const registerDate = event.targetIdentityHints.find((hint) => hint.startsWith('zitat-ausfertigung:'))?.slice('zitat-ausfertigung:'.length);
  if (!registerDate) return fail(work, 'identity-date-missing', 'Das Register führt kein Ausfertigungsdatum des Zitats; ohne Datum keine Identität');

  const repealPage = await ctx.platform.get(event.sourceUrl);
  if (isPageMiss(repealPage)) return fail(work, 'base-not-fetched', `Aufhebungsverkündung nicht verfügbar: ${repealPage.detail}`);
  work.repealSha256 = repealPage.sha256;
  const units = gazetteUnits(repealPage.html);
  const located = locateCitation(units, { title: event.targetTitle, documentDate: registerDate });
  if (!located.ok) return fail(work, located.code, located.detail);
  const citation = located.citation;
  work.citation = citation;
  record.documentDate = citation.documentDate;
  if (citation.parenthetical) record.fundstelle = citation.parenthetical;
  if (citation.priorClause) record.priorClause = citation.priorClause;
  record.funnel.strongIdentity = true;
  // Nach dem Stichtag ausgefertigt: Die Norm gab es am Stichtag nicht – gleich, wann und wie sie endete (belegt:
  // Aufhebungen von Stellenausschreibungen ohne Inkrafttretensvorschrift, BayMBl. 2025 Nr. 219 und Nr. 268).
  if (citation.documentDate > ctx.baselineDate) return fail(work, 'enacted-after-baseline', `Ausgefertigt am ${citation.documentDate}, nach dem Stichtag ${ctx.baselineDate}`);

  const end = determineEndAcross(units, located.citations, event.eventDate ?? '', ownPublicationDate(repealPage.html, event.organ === 'gvbl' ? 'GVBl' : 'BayMBl'));
  work.end = end;
  if (!end.ok) return fail(work, end.code === 'not-a-repeal' ? 'not-a-repeal' : 'end-undetermined', end.reason ?? 'Ende nicht lesbar');
  record.lastDay = end.lastDay!;
  if (end.lastDay! < ctx.baselineDate) return fail(work, 'ended-before-baseline', `Letzter Geltungstag ${end.lastDay} liegt vor dem Stichtag ${ctx.baselineDate} (${end.evidence.at(-1) ?? ''})`);

  let primary = citation.fundstelle.primary;
  let searched = '';
  if (!primary) {
    // Ohne Fundstelle: in den Inhaltsübersichten der Amtsblätter 2009–2018 nach Erlassdatum und Titel (`search.ts`).
    const search = await findInAmtsblattListings(ctx.platform, { documentDate: citation.documentDate, citedTitle: citation.citedTitle });
    if (!search.ok && search.pending) return fail(work, 'base-not-fetched', `Suche ohne Fundstelle: ${search.reason}`);
    if (search.ok) {
      primary = search.match.reference;
      work.foundBy = search.evidence;
      record.fundstelle = search.match.reference.text;
    } else searched = ` Suche in den Inhaltsübersichten: ${search.reason}.`;
  }
  if (!primary) {
    return fail(work, 'base-unpublished', citation.fundstelle.aktenzeichenOnly || citation.aktenzeichen
      ? `Zitiert nur mit Aktenzeichen (${citation.aktenzeichen ?? citation.parenthetical ?? ''}): ein nicht verkündetes Schreiben – keine amtliche Veröffentlichung der Ausgangsfassung.${searched}`
      : `Zitiert ohne Fundstelle („${citation.unitText.slice(0, 160)}“) – keine amtliche Veröffentlichung der Ausgangsfassung belegt.${searched}`);
  }
  const location = locateBase(primary, citation.documentDate);
  work.location = location;
  if (location.availability === 'paper-only') return fail(work, 'base-paper-only', `${primary.text}: ${location.reason}`);
  const alternativeTitles = [...new Set(located.citations.map((entry) => entry.citedTitle))].filter((title) => title !== citation.citedTitle);
  const resolved = await resolveBase(ctx.platform, { location, documentDate: citation.documentDate, citedTitle: citation.citedTitle, ...(alternativeTitles.length > 0 ? { alternativeTitles } : {}), ledgerTitle: event.targetTitle });
  if (!resolved.ok) {
    const code: MissingLink = resolved.code === 'base-not-fetched' ? 'base-not-fetched' : resolved.code === 'base-pdf-only' ? 'base-pdf-only' : resolved.code === 'base-identity-mismatch' ? 'base-identity-mismatch' : resolved.code === 'base-no-text' ? 'base-no-text' : 'base-not-found';
    return fail(work, code, resolved.detail);
  }
  if (work.foundBy && citation.aktenzeichen) {
    // Ohne Fundstelle gefunden: Das zitierte Aktenzeichen muss in der Verkündung stehen.
    const compact = (value: string): string => value.replace(/[\s\u2010-\u2015\u2212-]+/gu, '').toLowerCase();
    const pageText = compact(resolved.publication.units.slice(0, 8).map((unit) => unit.text).join(' '));
    if (!pageText.includes(compact(citation.aktenzeichen.replace(/^Az\.?:?\s*/u, '')))) {
      return fail(work, 'base-identity-mismatch', `${resolved.publication.page.url}: ohne Fundstelle gefunden, trägt aber nicht das zitierte Aktenzeichen ${citation.aktenzeichen}`);
    }
  }
  work.publication = resolved.publication;
  record.normId = resolved.publication.identity;
  record.baseUrl = resolved.publication.page.url;
  record.fundstelle = resolved.publication.citation;
  record.funnel.baseFound = true;
  record.outcome = 'safe'; // vorläufig; die Normstufe entscheidet
  return work;
}

/* ------------------------------------------------------------------------------------ Norm */

const STATE_ISSUER = /\b(?:Staatsregierung|Staatskanzlei|Staatsministeri(?:um|ums|en)|Obersten\s+Baubehörde|Ministerpräsident)/u;
const NON_STATE_ISSUER = /\b(?:Deutschlandradios?|Rundfunks?|Rundfunkanstalt|ZDF|ARD|Landeszentrale\s+für\s+neue\s+Medien|Kammer|Hochschule|Universität|Verband|Verbandes|Landesamts?\s+für\s+Statistik)\b/u;
/** Prüffälle nach docs/LEGAL_SCOPE.md („Muster und Vordrucke“, „Merkblätter, Leitfäden“, „Empfehlungen“ …). */
const NORMATIVITY_REVIEW = /\b(?:Satzung|Stiftungssatzung|Dienstvereinbarung|Zeugnismuster|Muster|Vordrucke?|Formulare?|Merkblatt|Merkblätter|Leitfaden|Empfehlungen?|Telemedienkonzepte?|Hörfunkprogramme|Wahlergebnisse|Stellenausschreibung|Ausschreibung\s+der\s+Stelle)\b/u;

export interface ScopeDecision {
  ok: boolean;
  code?: MissingLink;
  detail: string;
}

/**
 * Bekanntmachung, die nur mitteilt, dass ein Dokument einer Rundfunkanstalt veröffentlicht wird oder wurde
 * (Telemedienkonzepte nach § 11f Abs. 7 RStV / § 32 Abs. 7 MStV, Hörfunkprogramme nach § 11c Abs. 4 RStV / § 29 Abs. 4
 * MStV). Kein eigener Regelungsgehalt des Staatsministeriums; das Dokument ist eines der Anstalt – nach
 * docs/LEGAL_SCOPE.md „Presse- und Informationsmitteilungen“, „Reine Tatsachenbekanntmachungen“, nicht aufzunehmen.
 */
const PUBLICATION_NOTICES: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /^(?:Das|Der)\s+Staatsministerium\b[^.]{0,120}?\bweist\s+darauf\s+hin,\s+dass\b[\s\S]{0,1500}?\b(?:veröffentlicht|bekannt\s*gemacht)\s+worden\s+(?:ist|sind)\b/u, reason: 'Hinweis, dass ein Dokument einer Rundfunkanstalt an anderer Stelle veröffentlicht worden ist' },
  { pattern: /^(?:Das|Die)\s+Telemedienkonzepte?\b[\s\S]{0,600}?\bveröffentlicht\s+worden\s+und\s+k(?:ann|önnen)\s+unter\s+\S+\s+abgerufen\s+werden\b/u, reason: 'Hinweis, dass das Telemedienkonzept einer Rundfunkanstalt im Internet veröffentlicht worden ist' },
  { pattern: /^In\s+der\s+Anlage\s+veröffentlicht\s+das\s+Staatsministerium\b[\s\S]{0,700}?\bgemäß\s+§\s*(?:11f|32)\s+Abs(?:\.|atz)\s*7\b[\s\S]{0,700}?\bTelemedienkonzept/u, reason: 'Veröffentlichung des Telemedienkonzepts einer Rundfunkanstalt (§ 11f Abs. 7 RStV, § 32 Abs. 7 MStV) – das Staatsministerium macht nur bekannt' },
  { pattern: /^Die\s+in\s+der\s+ARD\s+zusammengeschlossenen\s+Landesrundfunkanstalten\s+und\s+das\s+Deutschlandradio\s+veröffentlichen\s+gemäß\s+§\s*(?:11c|29)\s+Abs\.\s*4\b[\s\S]{0,400}?\bAuflistung\b[\s\S]{0,200}?\bHörfunkprogramme\b/u, reason: 'Auflistung der Hörfunkprogramme durch die Rundfunkanstalten (§ 11c Abs. 4 RStV, § 29 Abs. 4 MStV) – Tatsachenbekanntmachung der Anstalten' },
];
const BROADCAST_TITLE = /\b(?:Telemedienkonzepte?|Hörfunkprogramme)\b/u;

/**
 * Zeugnismuster als normative Anlage einer Schulordnung: Die Bekanntmachung des Staatsministeriums schreibt allen
 * Schulen der Schulart vor, die Zeugnisse nach den beigefügten Mustern auszustellen – abstrakt-generell, landesweit,
 * verbindlich, amtlich veröffentlicht. Die Muster sind PDF-Anlagen einer im HTML vollständigen Vorschrift
 * (docs/LEGAL_SCOPE.md, „Text nur als PDF“).
 */
const CERTIFICATE_FORMS_TITLE = /;\s*hier:\s*Zeugnismuster\b/u;

export function scopeDecision(head: { title: string; issuer?: string }, text?: string): ScopeDecision {
  const issuer = head.issuer ?? '';
  if (text !== undefined && BROADCAST_TITLE.test(head.title)) {
    const own = text.replace(/\s+/gu, ' ').trim();
    const notice = PUBLICATION_NOTICES.find((entry) => entry.pattern.test(own));
    if (notice) return { ok: false, code: 'scope-publication-notice', detail: `${notice.reason}; kein Regelungsgehalt einer Stelle der Staatsverwaltung (docs/LEGAL_SCOPE.md: Informationsmitteilungen, Tatsachenbekanntmachungen)` };
  }
  if (NON_STATE_ISSUER.test(issuer)) return { ok: false, code: 'scope-not-state-regulation', detail: `Erlassstelle „${issuer}“ ist keine Stelle der Staatsverwaltung; keine Vorschrift des Landesrechts (docs/LEGAL_SCOPE.md)` };
  if (!STATE_ISSUER.test(issuer)) return { ok: false, code: 'scope-normativity-review', detail: `Erlassstelle „${issuer || '–'}“ nicht als Staatsregierung, Staatskanzlei oder Staatsministerium belegt; Vorschriftencharakter nicht eindeutig` };
  if (text !== undefined && CERTIFICATE_FORMS_TITLE.test(head.title) && DECLARED_FORMS.test(text.replace(/\s+/gu, ' '))) {
    return { ok: true, detail: `Erlassstelle „${issuer}“; Vorschrift über die Zeugnisse der Schulart – alle Schulen haben sie nach den beigefügten Mustern auszustellen (Muster als Anlage, docs/LEGAL_SCOPE.md „Text nur als PDF“)` };
  }
  const hit = NORMATIVITY_REVIEW.exec(`${head.title}`);
  if (hit) return { ok: false, code: 'scope-normativity-review', detail: `Prüffall nach docs/LEGAL_SCOPE.md („${hit[0]}“ im Titel „${head.title.slice(0, 120)}“): Vorschriftencharakter wird nicht automatisch festgestellt` };
  return { ok: true, detail: `Erlassstelle „${issuer}“; Verwaltungsvorschrift der Staatsverwaltung` };
}

/** Sätze eines Körpers (Satznummern, Absatzzählung, Satzende vor Großbuchstaben). */
/**
 * Sätze der Blöcke – **je Block** zerlegt, nie über Blockgrenzen hinweg: Eine Zwischenüberschrift ohne Punkt
 * („Inkrafttreten, Außerkrafttreten“, BayMBl. 2020 Nr. 36) verschmölze sonst mit dem folgenden Satz, und dessen
 * Anfang („Diese Bekanntmachung tritt …“) wäre nicht mehr erkennbar.
 */
function sentencesOf(texts: readonly string[]): string[] {
  return texts.flatMap((text) =>
    text
      .split(/(?=[¹²³⁴⁵⁶⁷⁸⁹](?=\S))|(?<=[a-zäöüß)\]]\.)\s+(?=[A-ZÄÖÜ(])|(?=\(\d+\)\s)/u)
      .map((sentence) => sentence.replace(/^[¹²³⁴⁵⁶⁷⁸⁹]+|^\(\d+\)\s*/u, '').trim())
      .filter((sentence) => sentence !== ''),
  );
}

function blockTexts(blocks: readonly NormBodyBlock[]): string[] {
  const out: string[] = [];
  const visit = (items: readonly NormBodyBlock[]): void => {
    for (const block of items) {
      if (block.type === 'table' || block.type === 'signature') continue;
      if (typeof block.text === 'string' && block.text !== '') out.push(block.text);
      if (block.children) visit(block.children);
    }
  };
  visit(blocks);
  return out;
}

/** Subjekt einer Schlussvorschrift der Norm selbst („Diese Bekanntmachung …“, „Die Richtlinie …“). */
const OWN_SUBJECT = String.raw`(?:Diese[rs]?|Die|Das|Sie|Er|Es)(?:\s+(?:Gemeinsame\s+)?(?:Bekanntmachung|Richtlinien?|Verwaltungsvorschriften?|Vorschriften|Verordnung|Regelungen|Bestimmungen|Grundsätze|Anordnung|Dienstanweisung|Dienstordnung|Geschäftsordnung|Hinweise|Vereinbarung|Satzung|Änderungsbekanntmachung))?`;
const COMMENCEMENT_PHRASE = String.raw`(?:rückwirkend\s+)?(?:am|zum|mit\s+Wirkung\s+vom|mit\s+Wirkung\s+zum)\s+${DATE}`;

export interface OwnBegin {
  begin?: { date: string; evidence: string };
  /**
   * Relatives Inkrafttreten der Stammfassung („am Tag nach der Veröffentlichung“). Das Datum rechnet erst der Aufrufer,
   * wenn das Veröffentlichungsdatum der Verkündung selbst und des Registers belegt und gleich sind (`relative.ts`).
   */
  relative?: { rule: RelativeRule; evidence: string };
  /** Quellfehler der Inkrafttretensvorschrift mit nur einer Lesart (Beleg im Rezept). */
  defects?: string[];
  code?: MissingLink;
  detail?: string;
}

/**
 * Beginn der Norm aus ihrer eigenen Inkrafttretensvorschrift – ein **ausdrückliches Kalenderdatum**
 * (`commencement.ts#commencementDate`) oder ein relatives Inkrafttreten nach der Veröffentlichung (`relative.ts`), nie
 * das Ausfertigungs- oder Verkündungsdatum selbst. Die Satzform „tritt am X in Kraft und mit Ablauf des Y außer Kraft“
 * wird in ihre Glieder zerlegt (commencement.ts liest nur Sätze, die auf „in Kraft“ enden); dessen Grundregeln müssen,
 * wo es sie liest, dasselbe Datum tragen.
 */
export function ownBegin(blocks: readonly NormBodyBlock[], units: readonly GazetteUnit[], publishedAt: string): OwnBegin {
  const defects: string[] = [];
  // Belegt wird der Wortlaut der Quelle; gelesen wird die berichtigte Lesart (nur Quellfehler mit einer Lesart).
  const sentences = sentencesOf(blockTexts(blocks)).map((original) => {
    const repaired = repairOwnCommencement(original);
    defects.push(...repaired.defects);
    return { original, sentence: repaired.sentence };
  });
  const begins: Array<{ date: string; evidence: string }> = [];
  const relatives: Array<{ rule: RelativeRule; evidence: string }> = [];
  const relative: string[] = [];
  const beginPattern = new RegExp(String.raw`^${OWN_SUBJECT}\s+(?:tritt|treten)\s+(${COMMENCEMENT_PHRASE})\s+in\s+Kraft\b`, 'u');
  const anyBegin = new RegExp(String.raw`^${OWN_SUBJECT}\s+(?:tritt|treten)\s+(?:(?!außer\s+Kraft).){0,120}?\bin\s+Kraft\b`, 'u');
  for (const { original, sentence } of sentences) {
    const begin = beginPattern.exec(sentence);
    if (begin) {
      const date = commencementDate(begin[1]!, publishedAt);
      if (date) begins.push({ date, evidence: original });
      else relative.push(sentence);
      continue;
    }
    const rule = relativeRule(sentence);
    if (rule) relatives.push({ rule, evidence: sentence });
    else if (anyBegin.test(sentence)) relative.push(sentence);
  }
  const withDefects = defects.length > 0 ? { defects } : {};
  const official = commencementStatements(units, publishedAt).statements.filter((statement) => statement.refs === null && statement.date);
  const distinct = [...new Set(begins.map((entry) => entry.date))];
  if (distinct.length === 0) {
    if (relatives.length === 1 && relative.length === 0) return { relative: relatives[0]!, ...withDefects };
    if (relatives.length > 1) return { code: 'begin-unreadable', detail: `Mehrere relative Inkrafttretensregeln (${relatives.map((entry) => `„${entry.evidence.slice(0, 120)}“`).join('; ')})` };
    if (relative.length > 0) return { code: 'begin-not-calendar-date', detail: `Inkrafttretensvorschrift ohne Kalenderdatum und ohne belegbaren Bezug auf die Veröffentlichung: „${relative[0]!.slice(0, 200)}“` };
    return { code: 'begin-no-commencement-clause', detail: 'Keine Inkrafttretensvorschrift im Text der Stammverkündung; Beginn der Geltung nicht belegt (Ausfertigung ist nicht Textgeltung)' };
  }
  if (distinct.length > 1 || relative.length > 0 || relatives.length > 0) return { code: 'begin-unreadable', detail: `Mehrere Inkrafttretensregeln (${[...begins.map((entry) => `„${entry.evidence.slice(0, 120)}“`), ...[...relative, ...relatives.map((entry) => entry.evidence)].map((sentence) => `„${sentence.slice(0, 120)}“`)].join('; ')})` };
  if (official.some((statement) => statement.date !== distinct[0])) return { code: 'begin-unreadable', detail: `commencement.ts liest ein anderes Datum (${official.map((statement) => statement.date).join(', ')}) als die Inkrafttretensvorschrift (${distinct[0]})` };
  return { begin: begins[0]!, ...withDefects };
}

export interface OwnExpiry {
  expiry?: { date: string; evidence: string };
  code?: MissingLink;
  detail?: string;
}

/** Eigene Befristung der Norm („… und mit Ablauf des 31. Dezember 2025 außer Kraft“, „Die Richtlinie gilt bis …“). */
export function ownExpiry(blocks: readonly NormBodyBlock[]): OwnExpiry {
  const expiries: Array<{ date: string; evidence: string }> = [];
  const unreadable: string[] = [];
  for (const sentence of sentencesOf(blockTexts(blocks))) {
    if (new RegExp(String.raw`^${OWN_SUBJECT}\s+(?:tritt|treten)\b`, 'u').test(sentence) && /außer\s+Kraft/u.test(sentence)) {
      const expiry = new RegExp(String.raw`mit\s+Ablauf\s+des\s+(${DATE})\s+außer\s+Kraft`, 'u').exec(sentence);
      // „… tritt am 1. August 2011 in Kraft und am 31. August 2026 außer Kraft“: letzter Geltungstag ist der Vortag.
      const onDay = expiry ? null : new RegExp(String.raw`(?:^|\s)(?:am|zum|mit\s+Wirkung\s+vom)\s+(${DATE})\s+außer\s+Kraft`, 'u').exec(sentence);
      const date = expiry ? parseLongGermanDate(expiry[1]!) : onDay ? addDays(parseLongGermanDate(onDay[1]!) ?? '', -1) : undefined;
      if (date && /^\d{4}-\d{2}-\d{2}$/u.test(date)) expiries.push({ date, evidence: sentence });
      else unreadable.push(sentence);
    }
    const until = new RegExp(String.raw`^${OWN_SUBJECT}\s+(?:gilt|gelten)\s+bis\s+(?:zum\s+|einschließlich\s+)?(${DATE})`, 'u').exec(sentence);
    if (until) {
      const date = parseLongGermanDate(until[1]!);
      if (date) expiries.push({ date, evidence: sentence });
    } else if (new RegExp(String.raw`^${OWN_SUBJECT}\s+(?:gilt|gelten)\s+bis\b`, 'u').test(sentence)) unreadable.push(sentence);
  }
  if (unreadable.length > 0) return { code: 'own-expiry-unreadable', detail: `Befristung der Norm ohne lesbares Datum: „${unreadable[0]!.slice(0, 200)}“` };
  const dates = [...new Set(expiries.map((entry) => entry.date))];
  if (dates.length > 1) return { code: 'own-expiry-unreadable', detail: `Mehrere Befristungen (${dates.join(', ')})` };
  return expiries[0] ? { expiry: expiries[0] } : {};
}

/* -------------------------------------------------------------------------------- Titelteile */

/** „Richtlinie … (Rückforderungsrichtlinie – RZVR)“ → Titel ohne Klammer, Kurzbezeichnung, Abkürzung. */
export function titleParts(title: string): { title: string; shortTitle?: string; abbr?: string } {
  const match = /^(.*\S)\s*\(([^()]+)\)\s*$/u.exec(title);
  if (!match) return { title };
  const inner = match[2]!.replace(/[‐-―−]/gu, '–');
  const parts = inner.split(/\s+–\s+|\s+-\s+/u).map((part) => part.trim()).filter(Boolean);
  const last = parts.at(-1)!;
  const isAbbreviation = (value: string): boolean => !/\s/u.test(value) && (value.match(/[A-ZÄÖÜ]/gu) ?? []).length >= 2 && value.length <= 30;
  if (!isAbbreviation(last)) return { title };
  const short = parts.length === 2 ? parts[0] : undefined;
  if (parts.length > 2) return { title };
  return { title: match[1]!, ...(short ? { shortTitle: short } : {}), abbr: last };
}

/* ------------------------------------------------------------------------ Anlagen als Datei */

/**
 * Anlagen, die nur als Datei vorliegen und den Regelungsgehalt **nicht** tragen: Vordrucke, Muster, Anträge,
 * Bescheinigungen, Zeugnisse, Teilnehmer- und Schulverzeichnisse, Stundentafeln, Übersichten
 * (docs/LEGAL_SCOPE.md: „PDF-Anlagen einer im HTML vollständigen Vorschrift (Muster, Vordrucke, Übersichten) werden
 * archiviert und als Quelle registriert; die Norm wird mit Hinweis übernommen“). Unbenannte Anlagen („Anlage 1“)
 * sind nicht bestimmbar und bleiben Review.
 */
const ANNEX_PREFIX = String.raw`^(?:(?:Anlage|Anhang)\s*(?:[\dIVX]+(?:\.\d+)*)?\s*[a-z]?\s*:\s*)?`;
/** Formulare im engen Sinn: Ihr Inhalt ist das auszufüllende Formular, nie eine Regel. */
const FORM_ONLY = String.raw`(?:Muster|Vordruck|Antrag|Auszahlungsantrag|Formular|Erklärung|Bescheinigung|\p{L}*[Zz]eugnis|Zeugnis|Urkunde|Verwendungs(?:nachweis|bestätigung)|Abnahmeprotokoll|Meldebogen)`;
const FORM_ANNEX = new RegExp(String.raw`${ANNEX_PREFIX}(?:${FORM_ONLY}|Teilnehmer|Versuchsschulen|Stundentafel|Übersicht|Verzeichnis)(?![\p{L}-])`, 'u');
const STRICT_FORM_ANNEX = new RegExp(String.raw`${ANNEX_PREFIX}${FORM_ONLY}(?![\p{L}-])`, 'u');
/**
 * Die Vorschrift erklärt ihre Anlagen selbst zu Mustern: „Die nach der Berufsschulordnung … zu erteilenden Zeugnisse
 * sind nach den in der Anlage beigefügten Mustern … auszustellen“ (BayMBl. 2022 Nr. 231, 317, 364, 365, 367, 392, 575);
 * „… werden die anliegenden Vordrucke … bekannt gemacht und verbindlich eingeführt“ (BayMBl. 2021 Nr. 64).
 */
const DECLARED_FORMS = /\b(?:Zeugnisse|Bescheinigungen|Urkunden|Vordrucke|Formulare)\b[^.]{0,200}?\bsind\s+nach\s+den\s+(?:in\s+der\s+Anlage\s+beigefügten\s+|beigefügten\s+)?Mustern\b[^.]{0,160}?\bauszustellen\b|\bwerden\s+die\s+(?:anliegenden|beigefügten)\s+(?:Vordrucke|Muster|Formulare)\b[^¹²³⁴⁵⁶⁷⁸⁹]{0,2000}?\b(?:bekannt\s*gemacht|verbindlich\s+eingeführt)\b/u;
/** Kopf- oder Bekanntgabeerlass: Der Regelungsgehalt steht in der Anlage (vgl. recht-nrw `common/pdf.ts`). */
const COVER_DECREE: readonly RegExp[] = [
  /\b(?:werden|wird|sind|ist)\s+(?:[^.]{0,60}\s)?nicht\s+abgedruckt\b/u,
  /\b(?:Verwaltungsvorschrift(?:en)?|Richtlinien?|Bestimmungen|Baubestimmungen|Vorschriften|Regelungen|VV)\b[^.]{0,200}?\b(?:als\s+Anlagen?|in\s+(?:der|den)\s+Anlagen?)\s+(?:zu\s+dieser\s+(?:Veröffentlichung|Bekanntmachung)\s+)?(?:beigefügt|einsehbar|veröffentlicht|bekannt\s*gegeben|bekannt\s*gemacht|abgedruckt|enthalten)\b/u,
  /\bin\s+der\s+Anlage\s+enthaltenen\b/u,
];
/** Unterhalb dieser Länge des Körpers (ohne Kopf) ist eine Veröffentlichung mit Anlage ein Kopferlass. */
const COVER_DECREE_MAX_LENGTH = 2500;

export function annexDecision(converted: ConvertedGazette, attachments: readonly { title: string; href: string }[]): { ok: true; declaredForms?: true } | { ok: false; detail: string } {
  const texts: string[] = [];
  const visit = (blocks: readonly NormBodyBlock[]): void => {
    for (const block of blocks) {
      for (const value of [block.title, block.text]) if (typeof value === 'string') texts.push(value);
      if (block.children) visit(block.children);
    }
  };
  visit(converted.blocks);
  const text = texts.join(' ');
  const plain = text.replace(/\s+/gu, ' ');
  if (COVER_DECREE.some((pattern) => pattern.test(text))) return { ok: false, detail: 'Kopf- oder Bekanntgabeerlass: Der Text verweist für den Regelungsgehalt auf die Anlage' };
  // Erklärt der Text seine Anlagen selbst zu Mustern, ist jede Anlage ein Formular und der Text die ganze Regel –
  // gleich wie kurz er ist.
  if (attachments.length > 0 && DECLARED_FORMS.test(plain)) return { ok: true, declaredForms: true };
  // Nur Formulare im engen Sinn: Der Text trägt die Regel („… ist der Vordruck der Anlage zu verwenden“).
  const formsOnly = attachments.length > 0 && attachments.every((attachment) => STRICT_FORM_ANNEX.test(attachment.title.trim()));
  if (!formsOnly && plain.length < COVER_DECREE_MAX_LENGTH) return { ok: false, detail: `Kopferlass (${plain.length} Zeichen Text neben ${attachments.length} Anlage(n))` };
  const unknown = attachments.filter((attachment) => !FORM_ANNEX.test(attachment.title.trim()));
  if (unknown.length > 0) return { ok: false, detail: `Anlage(n) mit möglichem Regelungsgehalt (weder Vordruck noch Übersicht): ${unknown.map((attachment) => `„${attachment.title.slice(0, 80)}“`).join('; ')}` };
  return { ok: true };
}

/**
 * Das BayMBl. zählt seit 2019 nur nach Nummern; „BayMBl. S. 285“ in einer Änderungsklausel (BayMBl. 2021 Nr. 825 zu
 * KWMBl. 2016 S. 194) meint die Nummer 285. Gilt nur zusammen mit dem Ausfertigungsdatum der Änderung.
 */
function baymblPageAsNumber(named: GazetteReference, own: GazetteReference): boolean {
  return named.organ === 'BayMBl' && own.organ === 'BayMBl' && named.kind === 'page' && own.kind === 'number' && named.position === own.position && (named.explicitVolume === undefined || own.explicitVolume === undefined || named.explicitVolume === own.explicitVolume);
}

/** Text der Blöcke in Lesereihenfolge (Überschriften und Texte, ohne Unterschrift), Leerraum normalisiert. */
export function plainText(blocks: readonly NormBodyBlock[]): string {
  const texts: string[] = [];
  const visit = (items: readonly NormBodyBlock[]): void => {
    for (const block of items) {
      if (block.type === 'signature') continue;
      for (const value of [block.title, block.text]) if (typeof value === 'string' && value !== '') texts.push(value);
      if (block.children) visit(block.children);
    }
  };
  visit(blocks);
  return texts.join(' ').replace(/\s+/gu, ' ').trim();
}

/** Anlage, die die Verkündungsseite nur mit ihrer Nummer verlinkt („Anlage 1“, „Anhang“). */
const BARE_ANNEX = /^(?:Anlage|Anhang)\s*[\dIVX]*\s*[a-z]?$/u;

/**
 * Bezeichnung einer nur nummerierten Anlage aus dem **Textlayer** ihrer PDF (`pdfText`, kein OCR): der Anfang der
 * ersten Seite hinter „Anlage <n>“. Ohne sicher dekodierbaren Textlayer oder ohne „Anlage <n>“ am Anfang bleibt die
 * Anlage unbestimmt (Review).
 */
export function annexHeading(bytes: Uint8Array, title: string): string | undefined {
  const text = pdfText(bytes);
  if (!text.ok || text.pages.length === 0) return undefined;
  const first = text.pages[0]!.replace(/\s+/gu, ' ').trim();
  const number = /[\dIVX]+\s*[a-z]?$/u.exec(title.trim())?.[0]?.replace(/\s+/gu, '');
  const lead = new RegExp(String.raw`^(?:Anlage|Anhang)\s*${number ? number.split('').join('\\s*') : ''}(?![\dIVX])\s*[:.)–-]?\s*`, 'u').exec(first);
  if (!lead) return undefined;
  const heading = first.slice(lead[0].length).slice(0, 160).trim();
  return heading === '' ? undefined : heading;
}

/* ---------------------------------------------------------------------------- Normstufe */

export interface NormResult {
  id: string;
  outcome: Outcome;
  missing?: MissingLinkRecord;
  recipe?: BaselineOnlyRecipe;
  fullChain: boolean;
  /** Umgesetzter Körper der Stammfassung (Test und Diagnose). */
  converted?: ConvertedGazette;
}

const headBlocks = (converted: ConvertedGazette): NormBodyBlock[] => [
  ...(converted.head.issuer ? [{ type: 'paragraphText' as const, text: converted.head.issuer }] : []),
  ...(converted.head.dateLine ? [{ type: 'paragraphText' as const, text: converted.head.dateLine }] : []),
];

/** Quellkörper der Stammfassung: Erlassstelle und Datumszeile als Vorspann, dann der umgesetzte Körper. */
export const sourceBody = (converted: ConvertedGazette): NormBodyBlock[] => [...headBlocks(converted), ...converted.blocks];

export async function analyzeNorm(ctx: AnalyzeContext, works: readonly CandidateWork[]): Promise<NormResult> {
  const first = works[0]!;
  const publication = first.publication!;
  const citation = first.citation!;
  const id = publication.identity;
  const reference = first.location!.reference as GazetteReference;
  const failNorm = (code: MissingLink, detail: string, extra: Partial<NormResult> = {}): NormResult => ({ id, outcome: MISSING_LINKS[code], missing: { code, detail }, fullChain: false, ...extra });

  // Mehrere Aufhebungen derselben Norm: das früheste Ende zählt; Datum und Fundstelle müssen übereinstimmen.
  if (works.some((work) => work.citation!.documentDate !== citation.documentDate)) return failNorm('duplicate-conflicting-end', `Kandidaten derselben Verkündung mit verschiedenem Ausfertigungsdatum (${[...new Set(works.map((work) => work.citation!.documentDate))].join(', ')})`);
  const ends = works.map((work) => ({ work, lastDay: work.end!.lastDay! })).sort((left, right) => (left.lastDay < right.lastDay ? -1 : left.lastDay > right.lastDay ? 1 : 0));
  const endWork = ends[0]!.work;

  // 6 – Umfang.
  let converted: ConvertedGazette;
  try {
    converted = convertGazetteHtml(publication.page.html);
  } catch (error) {
    if (error instanceof ConversionError) {
      if (error.code === 'image-in-body') return failNorm('text-image-in-body', `${publication.page.url}: ${error.message} – Bildblöcke werden nicht erfunden; Abbildung im Körper nicht strukturiert verfügbar`);
      return failNorm('text-structure-unsupported', `${publication.page.url}: ${error.message}`);
    }
    throw error;
  }
  const scope = scopeDecision({ title: converted.head.title, ...(converted.head.issuer ? { issuer: converted.head.issuer } : {}) }, plainText(converted.blocks));
  if (!scope.ok) return failNorm(scope.code!, scope.detail, { converted });

  // 7 – Anlagen nur als Datei (docs/LEGAL_SCOPE.md, „Text nur als PDF“): Vordrucke und Übersichten einer im HTML
  // vollständigen Vorschrift werden archiviert und referenziert; trägt eine Anlage den Regelungsgehalt, bleibt es Review.
  const annexSources: RecipeSource[] = [];
  if (publication.head.attachments.length > 0) {
    const annexUrl = (href: string): string => (href.startsWith('http') ? href : `${PLATFORM_ORIGIN}${href.startsWith('/') ? '' : '/'}${href}`);
    // Nur nummerierte Anlagen: Bezeichnung aus dem Textlayer der PDF – erst wenn der Text die Vorschrift trägt.
    let attachments = publication.head.attachments;
    const precheck = annexDecision(converted, []);
    if (precheck.ok && attachments.some((attachment) => BARE_ANNEX.test(attachment.title.trim()))) {
      const named: typeof attachments[number][] = [];
      for (const attachment of attachments) {
        if (!BARE_ANNEX.test(attachment.title.trim())) { named.push(attachment); continue; }
        const page = await ctx.platform.get(annexUrl(attachment.href));
        if (isPageMiss(page)) return failNorm('base-not-fetched', `Anlage „${attachment.title}“ nicht verfügbar: ${page.detail}`, { converted });
        const heading = annexHeading(page.bytes, attachment.title);
        named.push(heading ? { ...attachment, title: `${attachment.title.trim()}: ${heading}` } : attachment);
      }
      attachments = named;
    }
    const annex = annexDecision(converted, attachments);
    if (!annex.ok) return failNorm('annex-pdf-only', `${annex.detail} – Anlage(n): ${attachments.map((attachment) => `„${attachment.title.slice(0, 80)}“ (${attachment.href})`).join('; ')}`, { converted });
    for (const attachment of attachments) {
      const page = await ctx.platform.get(annexUrl(attachment.href));
      if (isPageMiss(page)) return failNorm('base-not-fetched', `Anlage „${attachment.title.slice(0, 80)}“ nicht verfügbar: ${page.detail}`, { converted });
      if (!page.contentType.includes('pdf') && !/^%PDF-/u.test(page.html.slice(0, 8))) return failNorm('annex-pdf-only', `Anlage „${attachment.title.slice(0, 80)}“ ist keine PDF-Datei (${page.contentType})`, { converted });
      annexSources.push({ role: 'annex', ...sourceRef(page), citation: `Anlage zu ${publication.citation}: ${attachment.title}` });
    }
  }

  // 8 – Beginn.
  const baseBody = sourceBody(converted);
  const own = ownBegin(converted.blocks, publication.units, publication.publishedAt);
  let start: { date: string; evidence: string; notes: string[]; listing?: SourceDocumentRef };
  if (own.begin) start = { ...own.begin, notes: own.defects ?? [] };
  else if (own.relative) {
    // Relativ zur Veröffentlichung: Datum der Verkündung selbst gegen das Register der Plattform.
    const ownDate = ownPublicationDate(publication.page.html, publication.organ);
    let registerDate: string | undefined;
    let registerSource: string;
    let listing: SourceDocumentRef | undefined;
    if (publication.organ === 'BayMBl') {
      const listed = await baymblListedDate(ctx.platform, publication);
      if (listed.missing) return failNorm('base-not-fetched', `Gliederungssuche für das Veröffentlichungsdatum nicht verfügbar: ${listed.missing}`, { converted });
      registerDate = listed.date;
      listing = listed.listing;
      registerSource = `Gliederungssuche des BayMBl.${listed.listing ? ` (${listed.listing.url})` : ''}`;
    } else {
      registerDate = publication.publishedAt;
      registerSource = `Inhaltsübersicht der Ausgabe (${publication.listings.at(-1)?.url ?? publication.citation})`;
    }
    const checked = checkedPublicationDate({ ownDate, registerDate, url: publication.page.url, registerSource });
    if (!checked.ok) return failNorm('begin-not-calendar-date', `Relatives Inkrafttreten „${own.relative.evidence.slice(0, 160)}“: ${checked.reason}`, { converted });
    start = { date: relativeDate(own.relative.rule, checked.date!), evidence: own.relative.evidence, notes: [...(own.defects ?? []), ...checked.evidence], ...(listing ? { listing } : {}) };
  } else return failNorm(own.code!, own.detail!, { converted });
  if (start.date > ctx.baselineDate) return failNorm('begin-after-baseline', `Inkrafttreten am ${start.date}, nach dem Stichtag: „${start.evidence}“`, { converted });

  // 9 – Weitergeltung nach der VwVWBek (AllMBl. 2016 S. 1555): Positivliste.
  let positivliste: { list: Positivliste; row: PositivlisteRow } | undefined;
  if (citation.documentDate <= VWVWBEK_CUTOFF) {
    const loaded = await loadPositivliste(ctx.platform);
    if (!loaded.ok) return failNorm(loaded.pending ? 'base-not-fetched' : 'vwvwbek-positivliste', `Ausgefertigt am ${citation.documentDate}, also nur mit Aufnahme in die Positivliste der VwVWBek fortgeltend: ${loaded.reason}`, { converted });
    const match = findInPositivliste(loaded.list, { documentDate: citation.documentDate, gliederungsnummern: publication.head.gliederungsnummern, title: converted.head.title });
    if (match.status === 'not-listed') {
      return failNorm('vwvwbek-not-listed', `Ausgefertigt am ${citation.documentDate}; nach Nr. 1 VwVWBek (AllMBl. 2016 S. 1555) mit Ablauf des 31. Dezember 2015 außer Kraft getreten, weil nicht im ${POSITIVLISTE_CITATION} (${POSITIVLISTE_URL}, SHA-256 ${loaded.list.page.sha256}, ${loaded.list.rows.length} Zeilen vollständig gelesen): ${match.detail} – galt am Stichtag nicht; die spätere Aufhebung bereinigt nur`, { converted });
    }
    if (match.status === 'ambiguous') return failNorm('vwvwbek-positivliste', `Positivliste mehrdeutig: ${match.detail}`, { converted });
    const row = match.row;
    if (row.anwendungsende && row.anwendungsende < ctx.baselineDate) return failNorm('ended-before-baseline', `Positivliste: Anwendungsende ${row.anwendungsende} vor dem Stichtag („${row.title.slice(0, 120)}“)`, { converted });
    // Fassungsdatum ≠ Erlassdatum: vor 2016 geändert. Die Gegenprobe (Schritt 10) liest die Amtsblätter ab der
    // Verkündung vollständig; sie muss eine Änderung mit diesem Datum finden, sonst bleibt die Kette offen.
    // Fassungsdatum = Erlassdatum belegt keine Unverändertheit: BayMBl. 2026 Nr. 294 nennt eine Änderung der
    // KWMBl.-Bekanntmachung vom 2. Januar 2013 vom 14. Juli 2015, die Liste führt Fassungsdatum = Erlassdatum.
    // Die Gegenprobe beginnt deshalb immer mit der Verkündung der Norm.
    positivliste = { list: loaded.list, row };
  }

  // 10 – Kette.
  if (publication.organ === 'GVBl') return failNorm('chain-organ-unsearchable', `${publication.citation}: Änderungen von Gesetzen und Verordnungen erscheinen im GVBl.; eine Gegenprobe im GVBl. ist nicht umgesetzt`, { converted });
  const until = ends.reduce((latest, entry) => ((entry.work.event.eventDate ?? '') > latest ? entry.work.event.eventDate! : latest), '');
  const repealUrls = new Set(works.map((work) => work.event.sourceUrl));
  const { scan, pages } = await scanChain(ctx.platform, publication, citation.documentDate, reference, until, [...repealUrls]);
  if (scan.missing.length > 0) return failNorm('chain-scan-incomplete', `Gegenprobe unvollständig, ${scan.missing.length} Seite(n) nicht verfügbar (${scan.missing.slice(0, 3).join(', ')}${scan.missing.length > 3 ? ', …' : ''})`, { converted });
  if (scan.fulltext && !scan.fulltext.verified) {
    return failNorm('chain-fulltext-unverified', `BayMBl.-Volltextsuche „${scan.fulltext.query}“ (${scan.fulltext.hits} Treffer) findet ${scan.fulltext.unmatched.length > 0 ? `die zitierende(n) Seite(n) ${scan.fulltext.unmatched.join(', ')} nicht` : 'keine bekannte zitierende Seite'} – die Suche ist für diese Norm nicht belegt`, { converted });
  }
  if (scan.amtsblatt && !scan.amtsblatt.fullRead) {
    return failNorm(
      'chain-amtsblatt-unsearchable',
      `Zeitraum ${publication.publishedAt} bis 2018 in den Amtsblättern (ohne Volltextsuche): ${scan.amtsblatt.documents > 0 ? '' : 'mindestens '}${scan.amtsblatt.issues} Ausgaben${scan.amtsblatt.documents > 0 ? `, ${scan.amtsblatt.documents} Veröffentlichungen` : ''}${scan.amtsblatt.withoutHtml > 0 ? `, davon ${scan.amtsblatt.withoutHtml} ohne HTML` : ''} – mehr als ${scan.amtsblatt.documents > 0 ? `${AMTSBLATT_FULL_READ_CAP} Veröffentlichungen` : `${AMTSBLATT_ISSUE_CAP} Ausgaben`} werden nicht vollständig gelesen; die Gliederungsnummern allein schließen Sammeländerungen nicht aus`,
      { converted },
    );
  }
  if (citation.fundstelle.corrections.length > 0) return failNorm('chain-correction', `Fundstelle mit Berichtigung (${citation.fundstelle.corrections.join('; ')}); Berichtigungen werden nicht angewandt`, { converted });

  // Genannte Änderungen (Klauseln des Aufhebungsbefehls und jeder Änderung) müssen die Gegenprobe als Änderung führen.
  const citing = [...pages.entries()].filter(([url]) => !repealUrls.has(url));
  const amendmentPages = citing.filter(([, entry]) => entry.citations.some((item) => item.relation === 'amends')).map(([url, entry]) => ({ url, ...entry }));
  const corrections = citing.filter(([, entry]) => entry.citations.some((item) => item.relation === 'corrects'));
  if (corrections.length > 0) return failNorm('chain-correction', `Berichtigung(en) im amtlichen Organ: ${corrections.map(([url, entry]) => `${entry.citation} (${url})`).join('; ')} – werden nicht angewandt`, { converted });
  const endPages = citing.filter(([, entry]) => entry.citations.some((item) => item.relation === 'ends'));
  for (const [url, entry] of endPages) {
    const lastDay = entry.citations.find((item) => item.relation === 'ends')!.lastDay;
    if (lastDay && lastDay < ctx.baselineDate) return failNorm('chain-earlier-end', `${entry.citation} (${url}) beendet die Norm mit letztem Geltungstag ${lastDay} – vor dem Stichtag`, { converted });
  }
  const namedAmendments = [
    ...works.flatMap((work) => work.citation!.priorAmendments.map((amendment) => ({ amendment, by: `Der Aufhebungsbefehl ${work.event.citation}` }))),
    ...citing.flatMap(([, entry]) => entry.citations.filter((item) => item.relation !== 'mentions').flatMap((item) => item.priorAmendments.map((amendment) => ({ amendment, by: entry.citation })))),
  ];
  for (const { amendment, by } of namedAmendments) {
    const named = parseParenthetical(amendment.reference ?? '').primary;
    const match = named && amendment.date ? amendmentPages.find((page) => {
      const own = parseParenthetical(page.citation).primary;
      return own !== undefined && (sameReference(named, own) || baymblPageAsNumber(named, own)) && headDates(page.units).includes(amendment.date!);
    }) : undefined;
    if (!match) {
      return failNorm('chain-named-amendment-missing', `${by} nennt die Änderung „${amendment.text}“, die Gegenprobe findet sie nicht als Änderung der Norm (gefunden: ${amendmentPages.map((page) => page.citation).join(', ') || 'keine Änderung'})`, { converted });
    }
  }

  if (positivliste && positivliste.row.fassungsdatum !== citation.documentDate) {
    const fassung = positivliste.row.fassungsdatum;
    if (!amendmentPages.some((page) => page.publishedAt < '2016-01-01' && headDates(page.units).includes(fassung))) {
      return failNorm('vwvwbek-amended-before-2016', `Positivliste: Fassungsdatum ${fassung}, Erlassdatum ${positivliste.row.erlassdatum} – vor 2016 geändert, die Gegenprobe findet aber keine Änderung vom ${fassung} (gefunden: ${amendmentPages.map((page) => page.citation).join(', ') || 'keine Änderung'})`, { converted });
    }
  }

  // Änderungen chronologisch anwenden (vor dem Stichtag in Kraft), danach die erste spätere als Ende der Fassung.
  let identity = normIdentityOf(publication, citation.documentDate, reference, titleParts(converted.head.title).abbr);
  let body = baseBody;
  const applied: RecipeAmendment[] = [];
  let textValidTo: { date: string; reason: string } | undefined;
  const sortedAmendments = [...amendmentPages].sort((left, right) => (left.publishedAt < right.publishedAt ? -1 : left.publishedAt > right.publishedAt ? 1 : left.url < right.url ? -1 : 1));
  let stichtagTitle = converted.head.title;
  for (const [index, page] of sortedAmendments.entries()) {
    const attempt = applyAmendment(body, page.units, identity, `a${index + 1}-`, stichtagTitle);
    const commencement = amendmentCommencement(page.units, page.publishedAt, attempt.section, { html: page.page.html, organ: page.citation.replace(/\..*$/su, ''), url: page.url });
    if (!commencement.ok) {
      if (page.publishedAt > ctx.baselineDate) {
        // Nach dem Stichtag verkündet: berührt den Stichtagstext nur rückwirkend – das ist ohne Datum nicht auszuschließen.
        return failNorm('amendment-commencement-undetermined', `${page.citation} (${page.url}), verkündet ${page.publishedAt}: Inkrafttreten nicht mit Kalenderdatum lesbar (${commencement.reason}); eine Rückwirkung auf den Stichtag ist nicht ausgeschlossen`, { converted });
      }
      return failNorm('amendment-commencement-undetermined', `${page.citation} (${page.url}): ${commencement.reason}`, { converted });
    }
    const effective = commencement.effectiveDate!;
    if (effective > ctx.baselineDate) {
      // Tritt erst nach dem Stichtag in Kraft: gehört nicht zum Stichtagstext, begrenzt aber dessen Geltung.
      const lastDay = addDays(commencement.effectiveDates[0]!, -1);
      if (!textValidTo || lastDay < textValidTo.date) textValidTo = { date: lastDay, reason: `${page.citation} tritt am ${commencement.effectiveDates[0]} in Kraft („${commencement.effectiveEvidence[0]?.slice(0, 160) ?? ''}“)` };
      continue;
    }
    if (commencement.effectiveDates.some((date) => date > ctx.baselineDate)) return failNorm('amendment-commencement-undetermined', `${page.citation}: Teile treten vor, Teile nach dem Stichtag in Kraft (${commencement.effectiveDates.join(', ')}) – abschnittsweise Anwendung wird nicht geraten`, { converted });
    if (page.publishedAt > ctx.baselineDate) return failNorm('amendment-retroactive', `${page.citation} (${page.url}), verkündet ${page.publishedAt}, wirkt am ${effective} auf den Stichtag zurück – rückwirkende Änderungen werden nicht in den Stichtagstext übernommen`, { converted });
    if (textValidTo) return failNorm('amendment-commencement-undetermined', `${page.citation} tritt am ${effective} in Kraft, nach einer bereits späteren Änderung – Reihenfolge der Kette widersprüchlich`, { converted });
    if (!attempt.ok) return failNorm(attempt.code!, `${page.citation} (${page.url}): ${attempt.reason}`, { converted });
    body = attempt.after!;
    if (attempt.title !== undefined) {
      // Spätere Änderungen zitieren die Norm unter ihrer geänderten Überschrift (BayMBl. 2021 Nr. 649: „… 2017 bis 2021“).
      stichtagTitle = attempt.title;
      identity = { ...identity, title: stichtagTitle };
    }
    applied.push({
      citation: page.citation,
      documentDate: headDates(page.units)[0] ?? page.publishedAt,
      url: page.url,
      sha256: page.page.sha256,
      publishedAt: page.publishedAt,
      effectiveDate: effective,
      effectiveEvidence: commencement.effectiveEvidence,
      ...(attempt.section ? { section: attempt.section } : {}),
      intro: attempt.intro ?? '',
      steps: attempt.steps,
      ...(attempt.titleChanges ? { titleChanges: attempt.titleChanges } : {}),
      afterFingerprint: bodyFingerprint(body),
    });
  }

  // Eigene Befristung (im Stichtagstext, nach allen Änderungen).
  const own2 = ownExpiry(body);
  if (own2.code) return failNorm(own2.code, own2.detail!, { converted });
  const expiry = own2.expiry;
  if (expiry && expiry.date < ctx.baselineDate) return failNorm('own-expiry-before-baseline', `Die Norm befristet sich selbst bis ${expiry.date} („${expiry.evidence.slice(0, 200)}“), das Ereignisregister belegt ihre Aufhebung erst nach dem Stichtag`, { converted });

  const beginDate = [start.date, ...applied.map((amendment) => amendment.effectiveDate)].sort().at(-1)!;
  let lastDay = endWork.end!.lastDay!;
  const endEvidence = [...endWork.end!.evidence];
  if (expiry && expiry.date < lastDay) {
    endEvidence.push(`Die Norm befristet sich selbst bis ${expiry.date}: „${expiry.evidence}“ – dieses Ende liegt vor der Aufhebung`);
    lastDay = expiry.date;
  }
  for (const [url, entry] of endPages) {
    const other = entry.citations.find((item) => item.relation === 'ends')!.lastDay;
    if (other && other < lastDay) {
      endEvidence.push(`Früheres Ende durch ${entry.citation} (${url}): letzter Geltungstag ${other}`);
      lastDay = other;
    }
  }
  if (lastDay < ctx.baselineDate) return failNorm('ended-before-baseline', `Letzter Geltungstag ${lastDay} vor dem Stichtag`, { converted });
  if (textValidTo && textValidTo.date < ctx.baselineDate) return failNorm('amendment-retroactive', `Textfassung endet vor dem Stichtag (${textValidTo.reason})`, { converted });

  // 11 – Rezept.
  const repealPage = await ctx.platform.get(endWork.event.sourceUrl);
  if (isPageMiss(repealPage)) return failNorm('base-not-fetched', `Aufhebungsverkündung nicht verfügbar: ${repealPage.detail}`, { converted });
  // Überschrift am Stichtag: die der Stammfassung, geändert durch die angewandten Änderungen (Metadatum, nicht Körper).
  const parts = titleParts(stichtagTitle);
  // GVBl.-Normen enden vor der Kette (`chain-organ-unsearchable`); hier bleiben Ministerialblätter.
  const type = 'verwaltungsvorschrift' as const;
  const lastAmendment = applied.at(-1);
  const fullCitation = `${converted.head.title} vom ${formatLongDate(citation.documentDate)} (${publication.citation})${lastAmendment ? `, die zuletzt durch Bekanntmachung vom ${formatLongDate(lastAmendment.documentDate)} (${lastAmendment.citation}) geändert worden ist` : ''}`;

  const sources: RecipeSource[] = [
    {
      role: 'base',
      ...sourceRef(publication.page),
      citation: publication.citation,
      publishedAt: publication.publishedAt,
      authority: publication.authority,
      representation: publication.representation,
      ...(publication.pdf ? { pdf: publication.pdf } : {}),
    },
    ...applied.map((amendment) => {
      const page = pages.get(amendment.url)!.page;
      return { role: 'amendment' as const, ...sourceRef(page), citation: amendment.citation, publishedAt: amendment.publishedAt, authority: 'electronic-official' as const, representation: 'official-electronic-edition' as const };
    }),
    {
      role: 'repeal',
      ...sourceRef(repealPage),
      citation: endWork.event.citation,
      ...(endWork.event.eventDate ? { publishedAt: endWork.event.eventDate } : {}),
      authority: endWork.event.publicationAuthority,
      representation: endWork.event.digitalRepresentation,
      ...(endWork.event.gazettePdfUrl ? { pdf: { url: endWork.event.gazettePdfUrl, ...(endWork.event.gazettePdfSha256Published ? { sha256Published: endWork.event.gazettePdfSha256Published } : {}) } } : {}),
    },
    ...publication.listings.map((listing) => ({ role: 'listing' as const, ...listing })),
    ...(positivliste ? [{ role: 'registry' as const, ...sourceRef(positivliste.list.page), citation: POSITIVLISTE_CITATION }] : []),
    ...annexSources,
    ...scan.listings.map((listing) => ({ role: 'listing' as const, ...listing })),
    ...(start.listing ? [{ role: 'listing' as const, ...start.listing }] : []),
    ...scan.examined.filter((entry) => entry.relations.length > 0 && !applied.some((amendment) => amendment.url === entry.url) && !repealUrls.has(entry.url)).map((entry) => {
      const page = pages.get(entry.url)!.page;
      return { role: 'chain-publication' as const, ...sourceRef(page), citation: entry.citation, publishedAt: entry.publishedAt };
    }),
  ];
  const uniqueSources = sources.filter((source, index) => sources.findIndex((other) => other.role === source.role && other.url === source.url) === index);

  const evidence: ValidityEvidence[] = [
    {
      kind: 'text-in-force-clause',
      dimension: 'begin',
      strength: 'strong',
      statement: applied.length > 0 ? `Die Stichtagsfassung gilt seit ${beginDate}: Inkrafttreten der letzten Änderung vor dem Stichtag (${lastAmendment!.citation}): „${lastAmendment!.effectiveEvidence[0] ?? ''}“; Stammfassung seit ${start.date}: „${start.evidence}“` : `Inkrafttretensvorschrift der Stammverkündung: „${start.evidence}“`,
      date: beginDate,
      sourceUrl: applied.length > 0 ? lastAmendment!.url : publication.page.url,
      sha256: applied.length > 0 ? lastAmendment!.sha256 : publication.page.sha256,
      citation: applied.length > 0 ? lastAmendment!.citation : publication.citation,
    },
    {
      kind: 'successor-repeal',
      dimension: 'successor',
      strength: 'strong',
      statement: `${endWork.end!.kind === 'expiry' ? 'Außerkrafttreten' : 'Aufhebung'} durch ${endWork.event.citation}; letzter Geltungstag ${lastDay} (nach dem Stichtag)`,
      date: addDays(lastDay, 1),
      sourceUrl: endWork.event.sourceUrl,
      sha256: repealPage.sha256,
      citation: endWork.event.citation,
    },
    {
      kind: 'gazette-publication',
      dimension: 'identity',
      strength: 'supporting',
      statement: `Stammverkündung ${publication.citation}, ausgefertigt am ${citation.documentDate}, verkündet am ${publication.publishedAt}; ${publication.authorityNote}`,
      date: publication.publishedAt,
      sourceUrl: publication.page.url,
      sha256: publication.page.sha256,
      citation: publication.citation,
    },
    ...(positivliste
      ? [
          {
            kind: 'registry-position' as const,
            dimension: 'validity' as const,
            strength: 'supporting' as const,
            statement: `Fortgeltung ab 1. Januar 2016 nach Nr. 1 VwVWBek: in der Positivliste als „${positivliste.row.title.slice(0, 160)}“ (Erlassdatum ${positivliste.row.erlassdatum}, Fassungsdatum ${positivliste.row.fassungsdatum}) geführt`,
            date: '2016-01-01',
            sourceUrl: POSITIVLISTE_URL,
            sha256: positivliste.list.page.sha256,
            citation: POSITIVLISTE_CITATION,
          } satisfies ValidityEvidence,
        ]
      : []),
    ...applied.map((amendment): ValidityEvidence => ({
      kind: 'gazette-amendment',
      dimension: 'amendment',
      strength: 'strong',
      statement: `Geändert durch ${amendment.citation} mit Wirkung vom ${amendment.effectiveDate} (${amendment.steps.length} Schritt${amendment.steps.length === 1 ? '' : 'e'}, Rundlauf bestanden)`,
      date: amendment.effectiveDate,
      sourceUrl: amendment.url,
      sha256: amendment.sha256,
      citation: amendment.citation,
    })),
  ];

  const recipe: BaselineOnlyRecipe = {
    schemaVersion: RECIPE_SCHEMA,
    id,
    baselineDate: ctx.baselineDate,
    method: 'reconstructed-from-publications',
    converterVersion: CONVERTER_VERSION,
    norm: {
      title: parts.title,
      ...(stichtagTitle !== converted.head.title ? { originalTitle: converted.head.title } : {}),
      ...(parts.shortTitle ? { shortTitle: parts.shortTitle } : {}),
      ...(parts.abbr ? { abbr: parts.abbr } : {}),
      type,
      ...(publication.head.publicationType ? { publicationType: publication.head.publicationType } : {}),
      documentDate: citation.documentDate,
      fundstelle: publication.citation,
      gliederungsnummern: publication.head.gliederungsnummern,
      ...(citation.fundstelle.bayRsNumber ? { bayRsNumber: citation.fundstelle.bayRsNumber } : {}),
      ...(converted.head.issuer ? { issuer: converted.head.issuer } : {}),
      ...(converted.head.dateLine ? { dateLine: converted.head.dateLine } : {}),
      citation: fullCitation,
    },
    sources: uniqueSources,
    base: {
      url: publication.page.url,
      sha256: publication.page.sha256,
      pageTextSha256: converted.pageTextSha256,
      bodyFingerprint: bodyFingerprint(baseBody),
      integrity: { pageCharacters: converted.integrity.pageCharacters, canonicalCharacters: converted.integrity.canonicalCharacters, styledLabels: converted.styledLabels },
      nested: converted.nested,
      titleCheck: publication.titleCheck,
    },
    amendments: applied,
    begin: { date: beginDate, commencementDate: start.date, evidence: [`Stammverkündung ${publication.citation}: „${start.evidence}“`, ...start.notes, ...applied.map((amendment) => `${amendment.citation}: ${amendment.effectiveEvidence.map((text) => `„${text}“`).join(' ')}`)] },
    end: {
      lastDay,
      kind: endWork.end!.kind!,
      eventIds: works.map((work) => work.event.id).sort(),
      repeal: { url: endWork.event.sourceUrl, citation: endWork.event.citation, publishedAt: endWork.event.eventDate ?? '', sha256: repealPage.sha256 },
      evidence: endEvidence,
    },
    ...(textValidTo ? { textValidTo } : {}),
    chain: {
      method: scan.method,
      complete: scan.complete,
      ...(scan.fulltext ? { fulltext: { query: scan.fulltext.query, hits: scan.fulltext.hits } } : {}),
      ...(scan.amtsblatt ? { amtsblattDocuments: scan.amtsblatt.documents } : {}),
      examined: scan.examined.length,
      citing: scan.examined.filter((entry) => entry.relations.length > 0).map((entry) => ({ url: entry.url, citation: entry.citation, relations: entry.relations })),
      evidence: [
        citation.priorClause ? `Aufhebungsbefehl nennt ${citation.priorClauseLast ? 'als letzte Änderung' : 'die Änderung'}: „${citation.priorClause}“` : 'Aufhebungsbefehl zitiert die Norm ohne Änderungszusatz (für Verwaltungsvorschriften nach RedR Nr. 8 nur Hinweis, kein Beleg)',
        ...(positivliste
          ? [
              `Positivliste der VwVWBek: „${positivliste.row.title}“ (${positivliste.row.gliederungsnummern.join(', ')}), Erlassdatum ${positivliste.row.erlassdatum}, Fassungsdatum ${positivliste.row.fassungsdatum}, Anwendungsbeginn ${positivliste.row.anwendungsbeginn}${positivliste.row.anwendungsende ? `, Anwendungsende ${positivliste.row.anwendungsende}` : ''} – fortgeltend ab 1. Januar 2016 (Nr. 1 VwVWBek); Änderungen belegt allein die Gegenprobe ab der Verkündung`,
            ]
          : []),
        `Gegenprobe im amtlichen Organ: ${scan.method}`,
        applied.length > 0 ? `Angewandt: ${applied.map((amendment) => `${amendment.citation} (Wirkung ${amendment.effectiveDate})`).join(', ')}` : 'Keine Änderung vor dem Stichtag',
        ...(textValidTo ? [`Nach dem Stichtag: ${textValidTo.reason}`] : []),
      ],
    },
    identity: {
      citedTitle: citation.citedTitle,
      ...(citation.parenthetical ? { parenthetical: citation.parenthetical } : {}),
      ...(citation.priorClause ? { priorClause: citation.priorClause } : {}),
      registerTitle: first.event.targetTitle,
      ...(citation.registerDate ? { registerDate: citation.registerDate } : {}),
      ...(first.foundBy ? { foundBy: first.foundBy } : {}),
    },
    evidence,
    expected: { baselineFingerprint: bodyFingerprint(body) },
  };
  return { id, outcome: 'safe', recipe, fullChain: true, converted };
}

