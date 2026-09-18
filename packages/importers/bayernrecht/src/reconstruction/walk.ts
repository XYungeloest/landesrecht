/**
 * Die Änderungskette einer Norm vom heutigen Text zurück bis zur Fassung am Stichtag – **über die amtlichen
 * Verweise, nicht über Vermutungen**.
 *
 * Jede Änderung nennt in ihrem Einleitungssatz die vorangehende („…, die zuletzt durch § 2 des Gesetzes vom
 * 9. Mai 2006 (GVBl. S. 190) geändert worden ist, …“); das Vollzitat des Portals nennt die letzte. Der Gang
 * beginnt dort und folgt diesen Verweisen rückwärts:
 *
 * - Tritt die genannte Änderung (für den Abschnitt, der die Norm ändert) **nach** dem Stichtag in Kraft, wird
 *   sie zurückgenommen, und der Gang folgt ihrem eigenen Verweis. Das gilt auch für eine Änderung, die **vor**
 *   dem Stichtag verkündet wurde und erst danach in Kraft trat (sie fehlt im Ereignisregister, das nach
 *   Verkündung ordnet).
 * - Tritt sie **am oder vor** dem Stichtag in Kraft, ist sie die letzte Änderung der Stichtagsfassung; ihr
 *   Inkrafttreten belegt den Beginn der Stichtagsfassung – nur mit **Kalenderdatum** („am Tag nach der
 *   Verkündung“ zählt nicht).
 * - Nennt die älteste zurückgenommene Änderung keine vorangehende, ist die Stichtagsfassung die Stammfassung;
 *   ihren Beginn belegt die eigene Inkrafttretensvorschrift (`ownCommencement`, im rückgerechneten Text).
 *
 * Nennt ein Einleitungssatz mehrere vorangehende Änderungen („zuletzt durch A und durch B“), werden alle
 * weitergeführt; die jüngste wird zuerst betrachtet. Eine Verkündung, die dieselbe Norm in zwei Abschnitten
 * ändert („§ 2 Weitere Änderung …, das zuletzt durch § 1 dieses Gesetzes geändert worden ist“), ergibt zwei
 * Schritte.
 *
 * Danach die Gegenproben, jede für sich notwendig:
 *
 * 1. Jedes stark zugeordnete Ereignis des Registers nach dem Stichtag ist ein Schritt des Gangs (sonst gibt es
 *    eine Änderung, die der Gang nicht erklärt – etwa eine Normenkontrollentscheidung).
 * 2. Keine andere Verkündung nach dem Stichtag zitiert die Norm mit einem Änderungsbefehl.
 * 3. Änderungsverlauf und Fortführungsnachweis: Was nicht zurückgenommen wird, liegt vor dem Stichtag; die
 *    jüngste davon ist die, deren Inkrafttreten den Beginn belegt; bei der Stammfassung gibt es keine.
 * 4. Die Inkrafttreten der zurückgenommenen Änderungen folgen der Reihenfolge der Kette, liegen alle nach dem
 *    Stichtag und nicht nach dem Auswertungsstichtag; das jüngste ist das `inkraft` des heutigen Pakets.
 * 5. Die Vorgänger der Stichtagsfassung (ein Schritt weiter zurück) treten nicht erst nach dem Stichtag in
 *    Kraft – sonst enthielte die „Stichtagsfassung“ eine Änderung, die am Stichtag noch nicht galt.
 */
import { NON_INVERTIBLE_EVENT_TYPES, type ReconstructionState } from '../baseline/reconstruction.ts';
import { parseLongGermanDate } from '../events/resolve.ts';
import { candidateKeys, historyEntries, lastAmendmentClause, registerNote, type PublicationKey } from './chain.ts';
import { commencementFor, sectionRef } from './commencement.ts';
import { pdfCommencement } from './pdf.ts';
import { candidateRefs, lookupPage, publicationCitation, publicationKey, type GazettePage, type PublicationRef } from './pages.ts';
import { amendingCitations, citationMatches, commandBlocks, isStrongMatch, type CommandBlock, type NormCitation, type NormIdentity } from './structure.ts';

/** Ereignis des Registers, soweit der Gang es braucht. */
export interface WalkLedgerEvent {
  id: string;
  sourceUrl: string;
  citation: string;
  eventDate?: string;
  enactmentDate?: string;
  eventType: string;
  organ: string;
  publicationAuthority: string;
  digitalRepresentation: string;
  gazettePdfUrl?: string;
  gazettePdfSha256Published?: string;
}

export interface WalkFailure {
  state: ReconstructionState;
  reason: string;
  detail: string;
}

/** Eine genannte Änderung: Fundstelle, Ausfertigung, Abschnitte (§ 2, Art. 7, Nr. 1) oder „dieses Gesetzes“. */
export interface AmendmentRef {
  text: string;
  enactmentDate?: string;
  reference?: string;
  sections: string[];
  self: boolean;
}

/** Platzhalter für eine nicht lesbare Abschnittsangabe (führt zum Abbruch des Gangs). */
const UNREADABLE_SECTION = '<unlesbar>';

const SECTION_KIND = (word: string): string => (word.startsWith('§') ? '§' : word.startsWith('Art') ? 'Art.' : 'Nr.');

function expandSections(kindWord: string, values: string): string[] | undefined {
  const kind = SECTION_KIND(kindWord);
  const parts = values.split(/\s*(?:,|und)\s*/u).filter(Boolean);
  const output: string[] = [];
  for (const part of parts) {
    const range = /^(\d+)\s*bis\s*(\d+)$/u.exec(part);
    if (range) {
      for (let value = Number(range[1]); value <= Number(range[2]); value += 1) output.push(`${kind} ${value}`);
      continue;
    }
    if (!/^\d+[a-z]?$/u.test(part)) return undefined;
    output.push(`${kind} ${part}`);
  }
  return output;
}

const SECTION_LIST = String.raw`(§§?|Art\.|Artikel|Nrn?\.)\s*(\d+[a-z]?(?:\s*(?:,|und|bis)\s*\d+[a-z]?)*)`;

/** „§ 2 des Gesetzes vom … (GVBl. S. 190) und durch Verordnung vom … (GVBl. S. 12)“ → Verweise. */
export function amendmentRefs(clause: string): AmendmentRef[] {
  const refs: AmendmentRef[] = [];
  let last = 0;
  for (const part of clause.matchAll(/vom\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})(?:\s*,\s*Az\.[^()]{0,80}?)?\s*\(([^)]*)\)/gu)) {
    const before = clause.slice(last, part.index);
    const head = new RegExp(String.raw`(?:die\s+)?${SECTION_LIST}(?:\s+(?:Abs\.|Nr\.|Satz)\s*\d+[a-z]?)*\s+(?:des|der)\s+[\p{L}-]+\s*$`, 'u').exec(before);
    const sections = head ? expandSections(head[1]!, head[2]!) : [];
    const date = parseLongGermanDate(part[1]!);
    refs.push({
      text: `${head ? head[0] : ''}${part[0]}`.trim(),
      ...(date ? { enactmentDate: date } : {}),
      reference: part[2]!.trim(),
      sections: sections ?? [UNREADABLE_SECTION],
      self: false,
    });
    last = part.index! + part[0].length;
  }
  for (const self of clause.matchAll(new RegExp(String.raw`(?:die\s+)?${SECTION_LIST}\s+(?:dieses\s+Gesetzes|dieser\s+Verordnung|dieser\s+Bekanntmachung|dieses\s+Staatsvertrags)`, 'gu'))) {
    refs.push({ text: self[0], sections: expandSections(self[1]!, self[2]!) ?? [UNREADABLE_SECTION], self: true });
  }
  return refs;
}

/** Ein Schritt der Kette: eine Änderung (Verkündung und Abschnitt) mit ihrem Befehlsblock für die Norm. */
export interface WalkStep {
  key: string;
  ref: PublicationRef;
  page: GazettePage;
  citation: string;
  /** Abschnitt der Verkündung (`§ 2`, `Art. 7`, `Nr. 1`), soweit gegliedert. */
  section?: string;
  block?: CommandBlock;
  /** Wie der Verweis sie nennt (Vollzitat, Einleitungssatz der jüngeren Änderung). */
  namedAs: string;
  enactmentDate?: string;
  /** Verkündungsdatum: aus dem Register, sonst aus der Seite. */
  eventDate?: string;
  eventDateSource: 'ledger' | 'page' | 'none';
  ledgerEvent?: WalkLedgerEvent;
  effectiveDates: string[];
  effectiveDateEvidence: string[];
  /** Alle Inkrafttretensregeln sind ausdrückliche Kalenderdaten. */
  calendarDates: boolean;
  priorClause?: string;
}

export interface WalkResult {
  /** Zurückzunehmende Änderungen, jüngste zuerst. */
  steps: WalkStep[];
  /** Genannte Änderungen, die erst nach dem Auswertungsstichtag in Kraft treten (nicht im heutigen Text). */
  future: WalkStep[];
  /** Letzte Änderung(en) der Stichtagsfassung – ihr Inkrafttreten belegt den Beginn. */
  witnesses: WalkStep[];
  /** Die älteste zurückgenommene Änderung nennt keine vorangehende. */
  stammfassung: boolean;
  failures: WalkFailure[];
  /** Fehlende Quellen (Adressen), die ein Abruf beschaffen könnte. */
  needs: string[];
  evidence: string[];
  /** Hinweise ohne Einfluss auf das Ergebnis (etwa ein nicht prüfbarer Vorvorgänger). */
  notes: string[];
}

export interface WalkInput {
  root: string;
  baselineDate: string;
  evaluationDate: string;
  identity: NormIdentity;
  inForceFrom?: string;
  fullCitation?: string;
  changeHistory?: string;
  registerNotes?: readonly string[];
  /** Stark zugeordnete Ereignisse nach dem Stichtag für diese Norm. */
  ledgerEvents: readonly WalkLedgerEvent[];
  /** Alle Ereignisse des Registers je Veröffentlichung (für das Verkündungsdatum). */
  ledgerByPublication: ReadonlyMap<string, WalkLedgerEvent>;
  /** Alle Veröffentlichungen nach dem Stichtag laut Register. */
  postBaselinePublications: ReadonlySet<string>;
  /** Je Detailseite nach dem Stichtag die Normzitate mit Änderungsbefehl. */
  amendingByPage: ReadonlyMap<string, NormCitation[]>;
}

const CALENDAR = /\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4}/u;

const refOfUrl = (url: string): PublicationRef | undefined => {
  const match = /\/(gvbl|baymbl)\/(\d{4})-(\d+)\/$/u.exec(url);
  return match ? { organ: match[1] as 'gvbl' | 'baymbl', volume: Number(match[2]), position: Number(match[3]) } : undefined;
};

const stepKey = (ref: PublicationRef, section: string | undefined, unitIndex: number | undefined): string => `${publicationKey(ref)}${section ? `#${section}` : unitIndex !== undefined ? `@${unitIndex}` : ''}`;

interface Candidate {
  ref: PublicationRef;
  page: GazettePage;
  section?: string;
  block?: CommandBlock;
  namedAs: string;
  enactmentDate?: string;
  /** Der genannte Abschnitt trägt keinen lesbaren Befehlsblock (nur als Beleg für den Beginn verwendbar). */
  blockMissing?: string;
}

/** Ordnung der Kette: Ausfertigung, Fundstelle, Stelle in der Verkündung. */
function compareCandidates(left: Candidate, right: Candidate): number {
  const a = left.enactmentDate ?? '';
  const b = right.enactmentDate ?? '';
  if (a !== b) return a < b ? -1 : 1;
  const keyA = [left.ref.volume, left.ref.organ === 'gvbl' ? 0 : 1, left.ref.position];
  const keyB = [right.ref.volume, right.ref.organ === 'gvbl' ? 0 : 1, right.ref.position];
  for (let index = 0; index < keyA.length; index += 1) if (keyA[index] !== keyB[index]) return (keyA[index] as number) - (keyB[index] as number);
  return (left.block?.intro.index ?? 0) - (right.block?.intro.index ?? 0);
}

const sameRef = (left: PublicationRef, right: PublicationRef): boolean => left.organ === right.organ && left.volume === right.volume && left.position === right.position;
const sameKey = (left: PublicationKey, right: PublicationRef): boolean => left.organ === right.organ && left.volume === right.volume && left.position === right.position;

export async function walkChain(input: WalkInput): Promise<WalkResult> {
  const result: WalkResult = { steps: [], future: [], witnesses: [], stammfassung: false, failures: [], needs: [], evidence: [], notes: [] };
  const fail = (state: ReconstructionState, reason: string, detail: string): WalkResult => {
    result.failures.push({ state, reason, detail });
    return result;
  };
  const ledgerKeys = new Map(input.ledgerEvents.map((event) => [publicationKey(refOfUrl(event.sourceUrl) ?? { organ: 'gvbl', volume: 0, position: 0 }), event]));

  // Seiten auflösen: Verweis → Kandidaten (Verkündung, Abschnitt, Block).
  const resolve = async (ref: AmendmentRef, selfPage: GazettePage | undefined, selfEnactment?: string): Promise<Candidate[] | 'stop'> => {
    if (ref.sections.includes(UNREADABLE_SECTION)) {
      fail('contradictory', 'chain-prior-unreadable', `Abschnittsangabe der genannten Änderung nicht lesbar („${ref.text.slice(0, 140)}“)`);
      return 'stop';
    }
    let page: GazettePage;
    if (ref.self) {
      if (!selfPage) {
        fail('contradictory', 'chain-prior-unreadable', `„${ref.text}“ ohne Bezugsverkündung`);
        return 'stop';
      }
      page = selfPage;
    } else {
      if (!ref.enactmentDate) {
        fail('contradictory', 'chain-prior-undated', `Genannte Änderung ohne Ausfertigungsdatum („${ref.text.slice(0, 140)}“)`);
        return 'stop';
      }
      const refs = candidateRefs(ref.reference, ref.enactmentDate);
      if (refs.length === 0) {
        fail('missing-base', 'prior-source-not-on-platform', `Die genannte Änderung „${ref.text.slice(0, 160)}“ ist nicht im GVBl. oder BayMBl. verkündet; ihre Verkündung ist auf der Verkündungsplattform nicht abrufbar`);
        return 'stop';
      }
      const lookup = await lookupPage(input.root, refs, ref.enactmentDate);
      if (lookup.status === 'missing') {
        result.needs.push(...lookup.needs);
        fail('missing-base', 'prior-source-missing', `Verkündung von „${ref.text.slice(0, 140)}“ nicht im Cache (${lookup.needs.join(', ')})`);
        return 'stop';
      }
      if (lookup.status === 'unavailable') {
        fail('missing-base', 'prior-source-unavailable', `Verkündung von „${ref.text.slice(0, 140)}“ nicht verfügbar: ${lookup.reason} (${lookup.tried.join(', ')})`);
        return 'stop';
      }
      page = lookup.page;
    }
    const enactmentDate = ref.enactmentDate ?? (ref.self ? selfEnactment : undefined);
    if (page.kind === 'pdf') {
      return [{ ref: page.ref, page, namedAs: ref.text, ...(enactmentDate ? { enactmentDate } : {}), ...(ref.sections.length === 1 ? { section: ref.sections[0]! } : {}) }];
    }
    const { blocks, failures: blockFailures } = commandBlocks(page.units, input.identity);
    const withSection = blocks.map((block) => ({ block, section: sectionRef(block.section, block.intro.label?.replace(/^[„‚]/u, '')) }));
    const chosen = ref.sections.length > 0 ? withSection.filter((entry) => entry.section !== undefined && ref.sections.includes(entry.section)) : withSection;
    const found: Candidate[] = chosen.map((entry) => ({ ref: page.ref, page, block: entry.block, ...(entry.section ? { section: entry.section } : {}), namedAs: ref.text, ...(enactmentDate ? { enactmentDate } : {}) }));
    // Ein genannter Abschnitt ohne lesbaren Befehlsblock kann nur noch Beleg für den Beginn sein (sein Inkrafttreten
    // folgt aus Abschnitt und Schlussvorschrift); zurückgenommen wird er nie.
    const missingSections = ref.sections.filter((section) => !chosen.some((entry) => entry.section === section));
    const blockMissing = `${page.citation}${ref.sections.length > 0 ? ` (${ref.sections.join(', ')})` : ''}: kein eindeutig lesbarer Änderungsbefehl für die Norm${blockFailures.length > 0 ? ` (${blockFailures.map((failure) => `${failure.code}: ${failure.detail}`).join('; ').slice(0, 200)})` : ''}`;
    for (const section of missingSections) found.push({ ref: page.ref, page, section, namedAs: ref.text, blockMissing, ...(enactmentDate ? { enactmentDate } : {}) });
    if (found.length === 0) found.push({ ref: page.ref, page, namedAs: ref.text, blockMissing, ...(enactmentDate ? { enactmentDate } : {}) });
    return found;
  };

  const commencementOf = async (candidate: Candidate): Promise<Pick<WalkStep, 'effectiveDates' | 'effectiveDateEvidence' | 'calendarDates' | 'eventDate' | 'eventDateSource' | 'ledgerEvent'> & { ok: boolean; reason?: string }> => {
    const key = publicationKey(candidate.ref);
    const own = ledgerKeys.get(key);
    const any = own ?? input.ledgerByPublication.get(key);
    const eventDate = any?.eventDate ?? candidate.page.publishedAt;
    const base = { eventDateSource: (any?.eventDate ? 'ledger' : candidate.page.publishedAt ? 'page' : 'none') as WalkStep['eventDateSource'], ...(eventDate ? { eventDate } : {}), ...(own ? { ledgerEvent: own } : {}) };
    if (candidate.page.kind === 'pdf') {
      const proof = await pdfCommencement(input.root, candidate.page, candidate.enactmentDate);
      if (!proof.ok) return { ...base, ok: false, reason: proof.reason, effectiveDates: [], effectiveDateEvidence: [], calendarDates: false };
      return { ...base, ok: true, effectiveDates: [proof.date!], effectiveDateEvidence: proof.evidence, calendarDates: true };
    }
    const units = candidate.page.units;
    const mantel = new Set(amendingCitations(units).map((entry) => entry.unit.index)).size > 1;
    const section = candidate.section ?? sectionRef(candidate.block?.section, candidate.block?.intro.label?.replace(/^[„‚]/u, ''));
    const commencement = commencementFor(units, eventDate ?? '0000-00-00', section, mantel);
    if (!commencement.ok) return { ...base, ok: false, reason: commencement.reason, effectiveDates: [], effectiveDateEvidence: [], calendarDates: false };
    const relative = commencement.applicable.some((statement) => /[Vv]erkünd|[Bb]ekanntmachung/u.test(statement.text.replace(/(?:Diese|Die|Das)\s+Bekanntmachung\s+tritt/u, '')) || !CALENDAR.test(statement.text));
    if (relative && !eventDate) return { ...base, ok: false, reason: 'Inkrafttreten bezieht sich auf die Verkündung, deren Datum nicht belegt ist', effectiveDates: [], effectiveDateEvidence: [], calendarDates: false };
    return { ...base, ok: true, effectiveDates: commencement.dates, effectiveDateEvidence: commencement.applicable.map((statement) => statement.text), calendarDates: !relative };
  };

  // 1 – Anfang: Vollzitat des Portals, sonst das jüngste Ereignis des Registers.
  const clause = lastAmendmentClause(input.fullCitation);
  let pending: Candidate[] = [];
  if (clause !== undefined) {
    const refs = amendmentRefs(clause).filter((ref) => !ref.self);
    if (refs.length === 0) return fail('contradictory', 'chain-last-amendment', `Vollzitat nennt keine lesbare letzte Änderung („${clause.slice(0, 140)}“)`);
    for (const ref of refs) {
      const resolved = await resolve(ref, undefined);
      if (resolved === 'stop') return result;
      pending.push(...resolved);
    }
    result.evidence.push(`Vollzitat des Portals: letzte Änderung „${clause.slice(0, 200)}“`);
  } else if (input.ledgerEvents.length > 0) {
    const newest = [...input.ledgerEvents].sort((left, right) => ((left.eventDate ?? '') < (right.eventDate ?? '') ? -1 : 1)).at(-1)!;
    const ref = refOfUrl(newest.sourceUrl);
    if (!ref) return fail('missing-base', 'no-detail-page', `Das jüngste Ereignis verweist auf keine Detailseite (${newest.sourceUrl})`);
    const resolved = await resolve({ text: newest.citation, ...(newest.enactmentDate ? { enactmentDate: newest.enactmentDate } : {}), reference: newest.organ === 'gvbl' ? `GVBl. ${ref.volume} S. ${ref.position}` : `BayMBl. ${ref.volume} Nr. ${ref.position}`, sections: [], self: false }, undefined);
    if (resolved === 'stop') return result;
    pending.push(...resolved);
    result.evidence.push(`Kein Vollzitat mit letzter Änderung; Anfang ist das jüngste Ereignis des Registers ${newest.citation}`);
  } else {
    return fail('missing-base', 'no-post-baseline-event', 'Weder ein Vollzitat mit letzter Änderung noch ein Ereignis nach dem Stichtag: die Kette ist unbekannt');
  }

  // 2 – Rückwärts, jüngste genannte Änderung zuerst.
  const seen = new Set<string>();
  for (let guard = 0; guard < 40; guard += 1) {
    pending = pending.filter((candidate) => !seen.has(stepKey(candidate.ref, candidate.section, candidate.block?.intro.index)));
    const unique = new Map(pending.map((candidate) => [stepKey(candidate.ref, candidate.section, candidate.block?.intro.index), candidate]));
    pending = [...unique.values()].sort(compareCandidates);
    const newest = pending.at(-1);
    if (!newest) break;
    const commencement = await commencementOf(newest);
    const citation = `${publicationCitation(newest.ref)}${newest.section ? ` (${newest.section})` : ''}`;
    if (!commencement.ok) return fail('effective-date-undetermined', 'commencement-unreadable', `${citation}: ${commencement.reason ?? 'Inkrafttreten nicht lesbar'}`);
    const dates = commencement.effectiveDates;
    const step: WalkStep = {
      key: stepKey(newest.ref, newest.section, newest.block?.intro.index),
      ref: newest.ref,
      page: newest.page,
      citation: publicationCitation(newest.ref),
      ...(newest.section ? { section: newest.section } : {}),
      ...(newest.block ? { block: newest.block } : {}),
      namedAs: newest.namedAs,
      ...(newest.enactmentDate ? { enactmentDate: newest.enactmentDate } : {}),
      ...(commencement.eventDate ? { eventDate: commencement.eventDate } : {}),
      eventDateSource: commencement.eventDateSource,
      ...(commencement.ledgerEvent ? { ledgerEvent: commencement.ledgerEvent } : {}),
      effectiveDates: dates,
      effectiveDateEvidence: commencement.effectiveDateEvidence,
      calendarDates: commencement.calendarDates,
      ...(newest.block?.priorAmendmentClause ? { priorClause: newest.block.priorAmendmentClause } : {}),
    };
    const after = dates.every((date) => date > input.baselineDate);
    const before = dates.every((date) => date <= input.baselineDate);
    if (after) {
      if (newest.page.kind === 'pdf') return fail('missing-base', 'pdf-only-amendment', `${citation} tritt nach dem Stichtag in Kraft und liegt nur als PDF vor; Befehle werden nicht aus einem PDF-Textlayer angewandt`);
      if (!newest.block) return fail('command-unreadable', 'chain-block-not-found', `${newest.blockMissing ?? citation}; die Änderung tritt nach dem Stichtag in Kraft und müsste zurückgenommen werden`);
      const future = dates.every((date) => date > input.evaluationDate);
      if (!future && dates.some((date) => date > input.evaluationDate)) return fail('partial-chain', 'chain-partially-in-force', `${citation} tritt teils bis, teils erst nach dem Auswertungsstichtag in Kraft (${dates.join(', ')}); der heutige Text enthält nur einen Teil der Änderung`);
      if (future) {
        // Noch nicht in Kraft: nicht Teil des heutigen Textes – übersprungen, der Gang folgt ihrem Verweis.
        result.future.push(step);
        result.evidence.push(`${citation} tritt erst am ${dates.join(', ')} in Kraft – nach dem Auswertungsstichtag; nicht Teil des heutigen Textes`);
      } else {
        result.steps.push(step);
      }
      seen.add(step.key);
      pending = pending.filter((candidate) => candidate !== newest);
      if (step.priorClause) {
        const refs = amendmentRefs(step.priorClause);
        if (refs.length === 0) return fail('contradictory', 'chain-prior-unreadable', `Vorangehende Änderung im Befehl von ${citation} nicht lesbar („${step.priorClause.slice(0, 120)}“)`);
        for (const ref of refs) {
          const resolved = await resolve(ref, newest.page, newest.enactmentDate);
          if (resolved === 'stop') return result;
          pending.push(...resolved);
        }
      } else if (pending.length === 0) {
        result.stammfassung = true;
      }
      continue;
    }
    if (!before) return fail('partial-chain', 'chain-split-commencement', `${citation} tritt teils vor, teils nach dem Stichtag in Kraft (${dates.join(', ')}); die Stichtagsfassung enthält nur einen Teil der Änderung`);
    // Letzte Änderung(en) der Stichtagsfassung: alle noch offenen müssen vor dem Stichtag in Kraft sein.
    for (const candidate of pending) {
      const proof = candidate === newest ? commencement : await commencementOf(candidate);
      const label = `${publicationCitation(candidate.ref)}${candidate.section ? ` (${candidate.section})` : ''}`;
      if (!proof.ok) return fail('partial-chain', 'prior-amendment-in-force-unproven', `Inkrafttreten der vorangehenden Änderung ${label} nicht lesbar: ${proof.reason}`);
      if (proof.effectiveDates.some((date) => date > input.baselineDate)) return fail('partial-chain', 'chain-commencement-order', `Die vorangehende Änderung ${label} tritt erst am ${proof.effectiveDates.join(', ')} in Kraft – nach dem Stichtag, aber vor einer jüngeren Änderung, die schon vorher galt`);
      if (!proof.calendarDates) return fail('partial-chain', 'prior-amendment-in-force-unproven', `Inkrafttreten der vorangehenden Änderung ${label} ohne Kalenderdatum („${proof.effectiveDateEvidence.join(' ').slice(0, 160)}“); „am Tag nach der Verkündung“ belegt den Beginn der Stichtagsfassung nicht`);
      result.witnesses.push({
        ...step,
        key: stepKey(candidate.ref, candidate.section, candidate.block?.intro.index),
        ref: candidate.ref,
        page: candidate.page,
        citation: publicationCitation(candidate.ref),
        ...(candidate.section ? { section: candidate.section } : {}),
        ...(candidate.block ? { block: candidate.block } : { block: undefined }),
        namedAs: candidate.namedAs,
        ...(candidate.enactmentDate ? { enactmentDate: candidate.enactmentDate } : {}),
        effectiveDates: proof.effectiveDates,
        effectiveDateEvidence: proof.effectiveDateEvidence,
        calendarDates: proof.calendarDates,
        ...(candidate.block?.priorAmendmentClause ? { priorClause: candidate.block.priorAmendmentClause } : { priorClause: undefined }),
      });
    }
    pending = [];
    break;
  }

  if (result.steps.length === 0) return fail('contradictory', 'chain-no-post-baseline-amendment', `Die letzte Änderung (${result.witnesses.map((witness) => witness.citation).join(', ') || '–'}) trat vor dem Stichtag in Kraft; eine spätere, die den heutigen Text trägt, nennt die Kette nicht`);

  // 3 – Gegenproben.
  const reversedRefs = [...result.steps, ...result.future].map((step) => step.ref);
  const unexplained = input.ledgerEvents.filter((event) => {
    const ref = refOfUrl(event.sourceUrl);
    return !ref || !reversedRefs.some((reversed) => sameRef(reversed, ref));
  });
  if (unexplained.length > 0) {
    const nonInvertible = unexplained.filter((event) => NON_INVERTIBLE_EVENT_TYPES.includes(event.eventType));
    return fail(
      nonInvertible.length > 0 ? 'non-invertible-amendment' : 'partial-chain',
      'chain-ledger-unexplained',
      `Das Register führt ${unexplained.map((event) => `${event.citation} (${event.eventType})`).join(', ')} für die Norm; die Kette der amtlichen Verweise enthält ${unexplained.length === 1 ? 'diese Veröffentlichung' : 'diese Veröffentlichungen'} nicht`,
    );
  }
  result.evidence.push(`Register: jedes stark zugeordnete Ereignis nach dem Stichtag (${input.ledgerEvents.length}) ist ein Schritt der Kette`);

  const others: string[] = [];
  for (const [url, citations] of input.amendingByPage) {
    const ref = refOfUrl(url);
    if (!ref || reversedRefs.some((reversed) => sameRef(reversed, ref))) continue;
    if (citations.some((citation) => isStrongMatch(citationMatches(citation, input.identity)))) others.push(url);
  }
  if (others.length > 0) return fail('partial-chain', 'chain-other-publication', `Weitere Verkündung(en) nach dem Stichtag zitieren die Norm mit einem Änderungsbefehl: ${others.sort().join(', ')}`);
  result.evidence.push('Keine andere Verkündung nach dem Stichtag zitiert die Norm mit einem Änderungsbefehl');

  const witnessRefs = result.witnesses.map((witness) => witness.ref);
  const classify = (keys: readonly PublicationKey[], date: string | undefined): 'reversed' | 'witness' | 'post' | 'pre' | 'unknown' => {
    if (keys.some((key) => reversedRefs.some((reversed) => sameKey(key, reversed)))) return 'reversed';
    if (keys.some((key) => witnessRefs.some((witness) => sameKey(key, witness)))) return 'witness';
    if (keys.some((key) => input.postBaselinePublications.has(`${key.organ}|${key.volume}|${key.position}`))) return 'post';
    if (!date) return 'unknown';
    return date > input.baselineDate ? 'post' : 'pre';
  };

  const history = historyEntries(input.changeHistory).map((entry) => ({ entry, kind: classify(entry.reference ? candidateKeys(entry.reference, entry.date) : [], entry.date) }));
  if (history.length > 0) {
    const unknown = history.find((entry) => entry.kind === 'unknown');
    if (unknown) return fail('partial-chain', 'chain-history-undated', `Änderungsverlauf mit nicht datierbarem Eintrag („${unknown.entry.text.slice(0, 100)}“)`);
    const post = history.filter((entry) => entry.kind === 'post');
    if (post.length > 0) return fail('partial-chain', 'chain-history-steps', `Änderungsverlauf führt nach dem Stichtag Änderungen, die die Kette nicht zurücknimmt: ${post.map((entry) => entry.entry.text.slice(0, 80)).join('; ')}`);
    const missing = result.steps.map((step) => step.ref).filter((reversed) => !history.some((entry) => entry.kind === 'reversed' && candidateKeys(entry.entry.reference ?? '', entry.entry.date).some((key) => sameKey(key, reversed))));
    if (missing.length > 0) return fail('contradictory', 'chain-history-mismatch', `Änderungsverlauf führt ${missing.map(publicationCitation).join(', ')} nicht`);
    const earlier = history.filter((entry) => entry.kind === 'pre' || entry.kind === 'witness');
    if (result.stammfassung && earlier.length > 0) return fail('contradictory', 'chain-stamm-history-mismatch', `Die älteste zurückgenommene Änderung nennt keine vorangehende, der Änderungsverlauf aber ${earlier.length}`);
    if (!result.stammfassung && earlier.at(-1)?.kind !== 'witness') return fail('contradictory', 'chain-prior-history-mismatch', `Die letzte Änderung vor der Kette (${result.witnesses.map((witness) => witness.citation).join(', ')}) ist nicht der letzte Eintrag vor dem Stichtag im Änderungsverlauf („${earlier.at(-1)?.entry.text ?? '–'}“)`);
    result.evidence.push(`Änderungsverlauf: nach dem Stichtag genau die zurückgenommenen Änderungen${result.stammfassung ? ', davor keine' : `, davor zuletzt ${result.witnesses.map((witness) => witness.citation).join(', ')}`}`);
  }

  const notes = (input.registerNotes ?? []).map((note) => ({ note, ...registerNote(note) }));
  if (notes.length > 0) {
    const undated = notes.find((entry) => entry.date === undefined);
    if (undated) return fail('partial-chain', 'chain-register-undated', `Fortführungsnachweis mit nicht lesbarer Notiz („${undated.note.slice(0, 100)}“)`);
    const classified = notes.map((entry) => ({ ...entry, kind: classify(entry.keys, entry.date) }));
    const post = classified.filter((entry) => entry.kind === 'post');
    if (post.length > 0) return fail('partial-chain', 'chain-register-steps', `Fortführungsnachweis führt nach dem Stichtag Änderungen, die die Kette nicht zurücknimmt: ${post.map((entry) => entry.note).join('; ')}`);
    const missing = result.steps.map((step) => step.ref).filter((reversed) => !classified.some((entry) => entry.kind === 'reversed' && entry.keys.some((key) => sameKey(key, reversed))));
    if (missing.length > 0) return fail('contradictory', 'chain-register-mismatch', `Fortführungsnachweis führt ${missing.map(publicationCitation).join(', ')} nicht`);
    const earlier = classified.filter((entry) => entry.kind === 'pre' || entry.kind === 'witness');
    if (result.stammfassung && earlier.length > 0) return fail('contradictory', 'chain-stamm-register-mismatch', `Die älteste zurückgenommene Änderung nennt keine vorangehende, der Fortführungsnachweis aber ${earlier.length}`);
    result.evidence.push(`Fortführungsnachweis: nach dem Stichtag genau die zurückgenommenen Änderungen${result.stammfassung ? ', davor keine' : ''}`);
  }

  if (clause === undefined && history.length === 0 && notes.length === 0) return fail('partial-chain', 'chain-unverifiable', 'Weder Vollzitat mit letzter Änderung noch Änderungsverlauf noch Fortführungsnachweis: die Vollständigkeit der Kette ist nicht belegbar');

  // 4 – Reihenfolge der Inkrafttreten.
  const chronological = [...result.steps].reverse();
  for (let index = 1; index < chronological.length; index += 1) {
    const older = chronological[index - 1]!;
    const newer = chronological[index]!;
    const olderLatest = [...older.effectiveDates].sort().at(-1)!;
    const newerEarliest = [...newer.effectiveDates].sort()[0]!;
    if (olderLatest > newerEarliest) return fail('partial-chain', 'chain-commencement-order', `${older.citation}${older.section ? ` (${older.section})` : ''} tritt am ${olderLatest} in Kraft, die jüngere ${newer.citation}${newer.section ? ` (${newer.section})` : ''} schon am ${newerEarliest}; die Reihenfolge der Fassungen ist nicht die der Verkündungen`);
  }
  const newestLatest = [...result.steps[0]!.effectiveDates].sort().at(-1)!;
  if (input.inForceFrom !== newestLatest) return fail('contradictory', 'portal-in-force-mismatch', `Der heutige Text gilt laut Paket seit ${input.inForceFrom ?? '–'}, die jüngste Änderung ${result.steps[0]!.citation} tritt am ${result.steps[0]!.effectiveDates.join(', ')} in Kraft`);
  result.evidence.push(`Inkrafttreten in Kettenreihenfolge, alle nach dem Stichtag: ${chronological.map((step) => `${step.citation}${step.section ? ` ${step.section}` : ''} → ${step.effectiveDates.join('/')}`).join('; ')}; das jüngste = inkraft des Pakets (${input.inForceFrom})`);

  // 5 – Ein Schritt weiter zurück: Die Vorgänger der Stichtagsfassung dürfen nicht erst nach dem Stichtag gelten.
  for (const witness of result.witnesses) {
    if (witness.page.kind === 'pdf') {
      result.notes.push(`Vorgänger der Stichtagsfassung vor ${witness.citation} nicht geprüft: der Beleg stammt aus dem PDF-Textlayer, dessen Einleitungssatz nicht als Befehlsblock gelesen wird`);
      continue;
    }
    if (!witness.priorClause) continue;
    for (const ref of amendmentRefs(witness.priorClause)) {
      if (ref.self) continue;
      const refs = candidateRefs(ref.reference, ref.enactmentDate);
      if (refs.length === 0) {
        result.notes.push(`Vorgänger der Stichtagsfassung „${ref.text.slice(0, 120)}“ nicht auf der Verkündungsplattform; sein Inkrafttreten ist nicht geprüft`);
        continue;
      }
      const lookup = await lookupPage(input.root, refs, ref.enactmentDate);
      if (lookup.status === 'missing') {
        result.needs.push(...lookup.needs);
        return fail('missing-base', 'predecessor-source-missing', `Verkündung des Vorgängers „${ref.text.slice(0, 140)}“ nicht im Cache (${lookup.needs.join(', ')}); ohne sie ist nicht ausgeschlossen, dass er erst nach dem Stichtag in Kraft trat`);
      }
      if (lookup.status === 'unavailable') {
        result.notes.push(`Vorgänger der Stichtagsfassung „${ref.text.slice(0, 120)}“: ${lookup.reason}; sein Inkrafttreten ist nicht geprüft`);
        continue;
      }
      const candidates = await resolve({ ...ref }, undefined);
      if (candidates === 'stop') {
        // Kein lesbarer Block: Das Inkrafttreten der ganzen Verkündung genügt nicht zur Zuordnung – nur vermerken.
        result.failures.pop();
        result.notes.push(`Vorgänger der Stichtagsfassung „${ref.text.slice(0, 120)}“: kein lesbarer Befehlsblock; sein Inkrafttreten ist nicht geprüft`);
        continue;
      }
      for (const candidate of candidates) {
        const proof = await commencementOf(candidate);
        if (!proof.ok) {
          result.notes.push(`Vorgänger der Stichtagsfassung ${publicationCitation(candidate.ref)}: Inkrafttreten nicht lesbar (${proof.reason})`);
          continue;
        }
        if (proof.effectiveDates.some((date) => date > input.baselineDate)) return fail('partial-chain', 'chain-delayed-predecessor', `Der Vorgänger der Stichtagsfassung ${publicationCitation(candidate.ref)} tritt erst am ${proof.effectiveDates.join(', ')} in Kraft – nach dem Stichtag; die Stichtagsfassung enthielte eine Änderung, die am Stichtag nicht galt`);
        result.evidence.push(`Vorgänger der Stichtagsfassung ${publicationCitation(candidate.ref)} in Kraft ${proof.effectiveDates.join(', ')} – vor dem Stichtag`);
      }
    }
  }
  return result;
}
