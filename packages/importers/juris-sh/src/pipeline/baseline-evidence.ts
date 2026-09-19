/**
 * Stichtagsbelege je Dokument: Portalbelege der Ausgabe (Geltungsintervall, Verzeichnisdaten, Stand-Vermerk)
 * und das **bestehende** Ereignisregister (`data/imports/juris-sh/events/ledger.json`, 5 857 Ereignisse; hier
 * nur gelesen, nicht neu gebaut) als unabhängige Gegenprobe. Entschieden wird mit den Regeln A/B/C aus
 * `common/evidence.ts` – derselben Regelmaschine, die der Adapter für alle Stichtagsfragen benutzt.
 *
 * Zuordnung Register → Dokument (konservativ, nie geraten):
 *   - gleiches Verkündungsblatt (GVOBl. ↔ Landesrecht, Amtsbl. ↔ Verwaltungsvorschriften) und gleiche
 *     Gliederungsnummer (Leerraum ignoriert) **und**
 *   - gleiches Ausfertigungs-/Neufassungs-/Erlassdatum des Ziels (Registerhinweis `ausfertigung:` der
 *     Übersichten bzw. „Ändert … vom <Datum>“ der Jahresinhaltsverzeichnisse) – oder, wenn das Register kein
 *     Zieldatum nennt, die Gliederungsnummer ist im Bestand eindeutig.
 *
 * Widerspruch: Zeigt die Ausgabe die Norm als am Stichtag unverändert (heutige Ausgabe = Stichtagsfassung),
 * das Register aber eine nach dem Stichtag ausgefertigte Änderung derselben Norm, ist das ein Widerspruch
 * (Rückwirkung, weggefallene Einheit oder falsche Zuordnung) – Regel C, Review, keine Übernahme.
 */
import { BASELINE_DATE } from '../common/constants.ts';
import { assessBaselineValidity, type BaselineAssessment, type ValidityEvidence } from '../common/evidence.ts';
import { isFullTermination, isPostBaseline, type LedgerEvent } from '../events/ledger.ts';
import { parseGermanDate } from '../events/registers.ts';
import type { DocumentResult } from './document.ts';

export function normalizeGliederungsnummer(value: string): string {
  return value.replace(/\s+/gu, '').toUpperCase();
}

/** Ausfertigungsdatum der Zielnorm laut Registerzeile – nur, wenn das Register es nennt. */
export function eventTargetDate(event: LedgerEvent): string | undefined {
  const hint = (prefix: string): string | undefined => event.targetIdentityHints.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
  const relation = hint('beziehung:');
  if (relation) {
    const match = /\bvom\s+(.+?)(?:,|$)/u.exec(relation);
    return match ? parseGermanDate(match[1]!) : undefined;
  }
  // Systematische Übersicht und Erlassverzeichnis führen die Zielnorm selbst mit ihrem Datum.
  if (event.sourceId === 'gvobl-systematische-uebersicht' || event.sourceId === 'ab-erlassverzeichnis') return hint('ausfertigung:');
  return undefined;
}

export interface LedgerIndex {
  byKey: Map<string, LedgerEvent[]>;
  events: number;
}

const organFor = (area: 'landesrecht' | 'vwv'): LedgerEvent['organ'] => (area === 'vwv' ? 'amtsblatt' : 'gvobl');

export function buildLedgerIndex(events: readonly LedgerEvent[]): LedgerIndex {
  const byKey = new Map<string, LedgerEvent[]>();
  let count = 0;
  for (const event of events) {
    if (!event.targetGliederungsnummer || event.processingStatus !== 'recorded') continue;
    const key = `${event.organ}:${normalizeGliederungsnummer(event.targetGliederungsnummer)}`;
    const list = byKey.get(key) ?? [];
    list.push(event);
    byKey.set(key, list);
    count += 1;
  }
  return { byKey, events: count };
}

export interface LedgerMatch {
  event: LedgerEvent;
  basis: 'gliederungsnummer+datum' | 'gliederungsnummer-eindeutig';
}

/**
 * Registerereignisse eines Dokuments. `glCount` zählt Dokumente je (Bereich, Gliederungsnummer) im Bestand;
 * ohne Zieldatum trägt nur eine eindeutige Gliederungsnummer die Zuordnung.
 */
export function matchLedgerEvents(index: LedgerIndex, document: { area: 'landesrecht' | 'vwv'; gliederungsnummer?: string; documentDates: readonly string[] }, glCount: ReadonlyMap<string, number>): LedgerMatch[] {
  if (!document.gliederungsnummer) return [];
  const normalized = normalizeGliederungsnummer(document.gliederungsnummer);
  const candidates = index.byKey.get(`${organFor(document.area)}:${normalized}`) ?? [];
  const unique = (glCount.get(`${document.area}:${normalized}`) ?? 0) === 1;
  const matches: LedgerMatch[] = [];
  for (const event of candidates) {
    const target = eventTargetDate(event);
    if (target) {
      if (document.documentDates.includes(target)) matches.push({ event, basis: 'gliederungsnummer+datum' });
    } else if (unique) {
      matches.push({ event, basis: 'gliederungsnummer-eindeutig' });
    }
  }
  return matches;
}

export interface BaselineEvidenceResult {
  evidence: ValidityEvidence[];
  assessment: BaselineAssessment;
  /** Registerereignisse nach dem Stichtag (Änderung/Neufassung/Aufhebung), die der Norm zugeordnet sind. */
  postBaselineEvents: number;
  contradictions: string[];
}

const dateOnly = (timestamp: string): string => timestamp.slice(0, 10);

/**
 * Belege aus Ausgabe und Register, bewertet nach A/B/C. `baselineVersion` beschreibt, welche Fassung als
 * Stichtagsfassung dient: die heutige Ausgabe (`current`) oder die aus Einzelfassungen zusammengesetzte
 * (`historical`).
 */
export function baselineEvidence(result: DocumentResult, matches: readonly LedgerMatch[], baseline = BASELINE_DATE): BaselineEvidenceResult {
  const evidence: ValidityEvidence[] = [];
  const source = result.source ?? { documentDates: [] };
  const url = result.raw.url;
  const sha256 = result.raw.sha256 || undefined;
  const portal = (item: Omit<ValidityEvidence, 'sourceUrl' | 'sha256'>): ValidityEvidence => ({ ...item, sourceUrl: url, ...(sha256 ? { sha256 } : {}) });
  const retrieved = result.raw.retrievedAt ? dateOnly(result.raw.retrievedAt) : undefined;
  const baselineClass = result.baseline?.class;
  const isVwv = result.area === 'vwv';

  if (baselineClass === 'repealed-before-baseline' && source.headerValidTo) {
    evidence.push(portal({ kind: 'portal-version-interval', dimension: 'end', strength: 'strong', date: source.headerValidTo, statement: `Ausgabe: gültig bis ${source.headerValidTo} (vor dem Stichtag)` }));
  } else if (baselineClass === 'enacted-after-baseline') {
    const begin = source.headerValidFrom ?? source.documentDates[0];
    if (begin) evidence.push(portal({ kind: 'portal-version-interval', dimension: 'begin', strength: 'strong', date: begin, statement: `Ausgabe: gültig ab ${begin} (nach dem Stichtag)` }));
  } else if (result.historical) {
    const from = result.historical.validFrom;
    if (from) evidence.push(portal({ kind: 'portal-version-interval', dimension: 'begin', strength: 'strong', date: from, statement: `Einzelfassungen: ${result.historical.selected} am Stichtag geltende Fassungen, spätester Beginn ${from}` }));
    const to = result.historical.validTo ?? retrieved;
    if (to) evidence.push(portal({ kind: 'portal-version-interval', dimension: 'validity', strength: 'strong', date: to, statement: result.historical.validTo ? `Einzelfassungen: frühestes Ende einer gewählten Fassung ${to} (am oder nach dem Stichtag)` : `Einzelfassungen: gewählte Fassungen ohne Ende, abgerufen ${to}` }));
    if (source.headerValidTo && source.headerValidTo >= baseline) evidence.push(portal({ kind: 'portal-version-interval', dimension: 'end', strength: 'strong', date: source.headerValidTo, statement: `Ausgabe: Norm gültig bis ${source.headerValidTo} (nach dem Stichtag)` }));
  } else if (baselineClass === 'unchanged-since-baseline') {
    const begin = isVwv ? (source.headerValidFrom ?? source.versionDate) : (source.latestUnitFrom ?? source.editionValidFrom ?? source.headerValidFrom);
    if (begin) evidence.push(portal({ kind: isVwv ? 'portal-version-interval' : 'portal-change-history', dimension: 'begin', strength: 'strong', date: begin, statement: isVwv ? `Ausgabe: Fassung vom ${source.versionDate ?? '?'}, gültig ab ${begin}` : `Verzeichnis: alle Einheiten gültig spätestens ab ${begin}` }));
    const to = source.editionValidTo ?? source.headerValidTo ?? source.editionCurrentAsOf ?? retrieved;
    if (to) evidence.push(portal({ kind: 'portal-version-interval', dimension: 'validity', strength: 'strong', date: to, statement: source.editionValidTo || source.headerValidTo ? `Ausgabe gültig bis ${to}` : `Ausgabe: aktuellste Fassung zum ${to}, unverändert seit ${begin ?? '?'}` }));
    if (source.standDate) evidence.push(portal({ kind: 'portal-change-history', dimension: 'amendment', strength: 'supporting', date: source.standDate, statement: `Stand-Vermerk: letzte berücksichtigte Änderung vom ${source.standDate}` }));
  }

  const contradictions: string[] = [];
  let postBaselineEvents = 0;
  for (const { event, basis } of matches) {
    const statement = `Register (${event.sourceId}, S. ${event.sourcePage}): ${event.eventType}${event.subtype ? `/${event.subtype}` : ''} ${event.eventDate ?? 'ohne Datum'} – ${event.targetTitle.slice(0, 120)} [Zuordnung: ${basis}]`;
    const common = { sourceUrl: event.sourceUrl, sha256: event.sourceSha256, ...(event.citation ? { citation: event.citation } : {}), excerpt: event.excerpt };
    const date = event.eventDate;
    const isChange = event.eventType === 'amend' || event.eventType === 'recast';
    const terminates = isFullTermination(event);
    if (!date || (!isChange && !terminates)) continue;
    const post = isPostBaseline(event);
    if (post) postBaselineEvents += 1;
    // Widerspruch: heutige Ausgabe als Stichtagsfassung, Register belegt eine spätere Änderung.
    if (post && isChange && !result.historical && baselineClass === 'unchanged-since-baseline' && event.evidenceStrength === 'strong') {
      evidence.push({ kind: 'gazette-amendment', dimension: 'amendment', strength: 'contradictory', date, statement: `${statement}; die Ausgabe zeigt keine Einheit mit Beginn nach dem Stichtag`, ...common });
      contradictions.push(`${event.eventType} ${date} (${event.citation || event.sourceId})`);
      continue;
    }
    const strength = event.evidenceStrength === 'strong' ? 'strong' : 'supporting';
    if (terminates) {
      evidence.push({ kind: event.eventType === 'expire' ? 'text-expiry-clause' : 'successor-repeal', dimension: 'end', strength, date, statement, ...common });
    } else {
      evidence.push({ kind: 'gazette-amendment', dimension: 'amendment', strength: post ? strength : 'supporting', date, statement, ...common });
    }
  }
  const assessment = assessBaselineValidity({ baseline, evidence });
  return { evidence, assessment, postBaselineEvents, contradictions };
}
