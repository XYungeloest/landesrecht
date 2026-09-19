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
import { datedCommencement, sectionRef } from './commencement.ts';
import { pdfCommencement } from './pdf.ts';
import { candidateRefs, lookupPage, publicationCitation, publicationKey, type GazettePage, type PublicationRef } from './pages.ts';
import { amendingCitations, blockFromCandidate, citationMatches, commandBlocks, isBlockFailure, isStrongMatch, normCitations, referenceKey, weakIntroCandidates, type CommandBlock, type NormCitation, type NormIdentity } from './structure.ts';

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
  /** Lauf 11: Berichtigung des Normtexts; wirksam mit ihrer Bekanntmachung (die Probe in `run.ts` verlangt, dass der Stichtagskörper nicht von ihr abhängt). */
  correction?: boolean;
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
  /**
   * Nur mit `deep` (Lauf 7): die Änderungen vor dem Stichtag bis zur Stammfassung – die letzte(n) Änderung(en) der
   * Stichtagsfassung und ihre Vorgänger, jüngste zuerst, je mit Befehlsblock. Scheitert der Gang dorthin, steht der Grund
   * in `priorFailure`; die Kette selbst (Schritte, Belege) bleibt davon unberührt.
   */
  prior?: WalkStep[];
  priorFailure?: WalkFailure;
  /**
   * Nur mit `provisional` (Lauf 8): Befunde über Veröffentlichungen **nach** dem Stichtag, die die Kette nicht enthält
   * (Registerereignis, andere Verkündung mit Änderungsbefehl, Eintrag im Änderungsverlauf oder Fortführungsnachweis). Sie
   * halten die Kette nicht an, gelten aber nur, wenn die Wortlautprobe gegen die Stammverkündung sie ausräumt: Hätte eine
   * solche Veröffentlichung den Text geändert, trüge der zurückgerechnete Stichtagskörper ihre Änderung und wiche von der
   * Stammverkündung ab.
   */
  provisional?: WalkFailure[];
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
  /** Lauf 7: auch die Änderungen vor dem Stichtag bis zur Stammfassung gehen (`prior`). */
  deep?: boolean;
  /** Lauf 8: Befunde über Veröffentlichungen nach dem Stichtag außerhalb der Kette vorläufig hinnehmen (`provisional`). */
  provisional?: boolean;
}

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
  /** Lauf 11: Berichtigung des Normtexts (Register: `correction`), ohne eigene Inkrafttretensvorschrift – die berichtigte Fassung. */
  correction?: Candidate;
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
  // Je Verkündung das Ereignis der Norm. Führt das Register mehrere (GVBl. 2024 S. 229: § 1 ändert die FGV, § 2 hebt eine
  // in sie übernommene Verordnung auf – beide der FGV zugeordnet), zählt für einen Änderungsschritt das Änderungsereignis,
  // nicht ein Aufhebungs- oder Endeereignis; gleichrangige bleiben in Registerreihenfolge (erstes).
  const TEXT_EVENT_RANK: Readonly<Record<string, number>> = { amend: 0, correction: 1, recast: 2, new: 3, commencement: 4, notice: 5, treaty: 6, unknown: 7, expire: 8, repeal: 9 };
  const ledgerKeys = new Map<string, WalkLedgerEvent>();
  for (const event of input.ledgerEvents) {
    const key = publicationKey(refOfUrl(event.sourceUrl) ?? { organ: 'gvbl', volume: 0, position: 0 });
    const present = ledgerKeys.get(key);
    if (!present || (TEXT_EVENT_RANK[event.eventType] ?? 7) < (TEXT_EVENT_RANK[present.eventType] ?? 7)) ledgerKeys.set(key, event);
  }

  // Die Norm selbst (ihre eigene Fundstelle) ist erst nach dem Stichtag verkündet (BayMBl. 2023 Nr. 629, 633): Dann gab es
  // am Stichtag keine Fassung dieser Norm zurückzurechnen – die Stichtagsklassifikation ist zu prüfen, nicht die Kette.
  // Eigene Fundstelle: aus den Metadaten, sonst aus dem Vollzitat („… vom 1. Dezember 2023 (BayMBl. Nr. 629)“ mit dem
  // Ausfertigungsdatum der Norm). Ohne Jahrgang zählt das Jahr der Ausfertigung oder das folgende.
  const ownRefs = [...input.identity.references];
  if (input.identity.documentDate && input.fullCitation) {
    const first = normCitations(input.fullCitation).find((cited) => cited.date === input.identity.documentDate);
    if (first) ownRefs.push(...first.references);
  }
  const documentYear = input.identity.documentDate ? Number(input.identity.documentDate.slice(0, 4)) : undefined;
  const isOwn = (citation: string): boolean => {
    const key = referenceKey(citation);
    if (!key) return false;
    const [organ, year, position] = key.split('|');
    return ownRefs.some((reference) => {
      const own = referenceKey(reference);
      if (!own) return false;
      const [ownOrgan, ownYear, ownPosition] = own.split('|');
      if (ownOrgan !== organ || ownPosition !== position) return false;
      if (ownYear) return ownYear === year;
      return documentYear !== undefined && (Number(year) === documentYear || Number(year) === documentYear + 1);
    });
  };
  const ownLate = input.ledgerEvents.filter((event) => isOwn(event.citation) && event.eventDate !== undefined && event.eventDate > input.baselineDate);
  if (ownLate.length > 0) {
    const event = ownLate[0]!;
    return fail('contradictory', 'norm-published-after-baseline', `Die Norm selbst ist erst nach dem Stichtag verkündet: ${event.citation} (eigene Fundstelle, Register: ${event.eventType} am ${event.eventDate}); am Stichtag gab es diese Fassung nicht – die Einstufung „am Stichtag in Kraft“ ist zu prüfen (die Stichtagsnorm ist gegebenenfalls ein Vorgänger)`);
  }

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
    const { blocks: strongBlocks, failures: blockFailures } = commandBlocks(page.units, input.identity);
    let blocks = strongBlocks;
    if (blocks.length === 0) {
      // Die Seite ist durch den amtlichen Verweis als Änderung dieser Norm bestimmt: Genau ein Einleitungssatz, der die
      // Norm über Ausfertigungsdatum oder BayRS-Nummer bezeichnet und keinem Merkmal widerspricht, ist ihrer.
      // Nennt der Verweis einen Abschnitt („Art. 3 des Staatsvertrages …“), zählen nur Kandidaten in diesem Abschnitt
      // (GVBl. 2025 S. 350: ARD- und ZDF-Staatsvertrag tragen dasselbe Datum, in Art. 2 und Art. 3).
      const weakAll = weakIntroCandidates(page.units, input.identity);
      const weakBlocks = weakAll.map((candidate) => ({ candidate, block: blockFromCandidate(page.units, candidate) }));
      const weak = ref.sections.length > 0
        ? weakBlocks.filter((entry) => {
          const section = isBlockFailure(entry.block) ? undefined : sectionRef(entry.block.section, entry.block.intro.label?.replace(/^[„‚]/u, ''));
          return section !== undefined && ref.sections.includes(section);
        })
        : weakBlocks;
      if (weak.length === 1) {
        const block = weak[0]!.block;
        if (!isBlockFailure(block)) {
          blocks = [block];
          result.evidence.push(`${page.citation}: Einleitungssatz nur über ${weak[0]!.candidate.matched.join('+')} bezeichnet (Titel oder Fundstelle abweichend); die Seite ist durch „${ref.text.slice(0, 120)}“ als Änderung dieser Norm bestimmt, und kein anderer Einleitungssatz ${ref.sections.length > 0 ? `im genannten Abschnitt (${ref.sections.join(', ')}) ` : ''}trägt ein Merkmal der Norm`);
        } else blockFailures.push(block);
      }
    }
    const withSection = blocks.map((block) => ({ block, section: sectionRef(block.section, block.intro.label?.replace(/^[„‚]/u, '')) }));
    let chosen = ref.sections.length > 0 ? withSection.filter((entry) => entry.section !== undefined && ref.sections.includes(entry.section)) : withSection;
    // Anpassungsverordnungen: Der Block der Norm ist ein Glied der Liste in „§ 1“ („100. Die Verordnung … wird wie folgt
    // geändert:“, GVBl. 2014 S. 286); die Seite führt den Paragraphen nicht als Abschnitt des Blocks. Genau ein stark
    // zugeordneter Block ohne eigenen Abschnitt auf der genannten Seite ist dann der genannte.
    if (chosen.length === 0 && ref.sections.length === 1 && withSection.length === 1 && withSection[0]!.block.section === undefined && strongBlocks.length === 1) {
      chosen = withSection.map((entry) => ({ ...entry, section: ref.sections[0]! }));
      result.evidence.push(`${page.citation}: der Block der Norm (${withSection[0]!.section ?? 'Glied der Liste'}) steht ohne eigenen Abschnitt – als „${ref.sections[0]}“ des Verweises genommen, einziger Block der Norm auf der Seite`);
    }
    const found: Candidate[] = chosen.map((entry) => ({ ref: page.ref, page, block: entry.block, ...(entry.section ? { section: entry.section } : {}), namedAs: ref.text, ...(enactmentDate ? { enactmentDate } : {}) }));
    // Ein genannter Abschnitt ohne lesbaren Befehlsblock kann nur noch Beleg für den Beginn sein (sein Inkrafttreten
    // folgt aus Abschnitt und Schlussvorschrift); zurückgenommen wird er nie.
    const missingSections = ref.sections.filter((section) => !chosen.some((entry) => entry.section === section));
    const blockMissing = `${page.citation}${ref.sections.length > 0 ? ` (${ref.sections.join(', ')})` : ''}: kein eindeutig lesbarer Änderungsbefehl für die Norm${blockFailures.length > 0 ? ` (${blockFailures.map((failure) => `${failure.code}: ${failure.detail}`).join('; ').slice(0, 200)})` : ''}`;
    for (const section of missingSections) found.push({ ref: page.ref, page, section, namedAs: ref.text, blockMissing, ...(enactmentDate ? { enactmentDate } : {}) });
    if (found.length === 0) found.push({ ref: page.ref, page, namedAs: ref.text, blockMissing, ...(enactmentDate ? { enactmentDate } : {}) });
    return found;
  };

  const commencementOf = async (candidate: Candidate): Promise<Pick<WalkStep, 'effectiveDates' | 'effectiveDateEvidence' | 'calendarDates' | 'eventDate' | 'eventDateSource' | 'ledgerEvent'> & { ok: boolean; reason?: string; publicationDated?: boolean }> => {
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
    const dated = datedCommencement(units, section, mantel, { ...(candidate.page.publishedAt ? { publishedAt: candidate.page.publishedAt } : {}), ...(any?.eventDate ? { registerDate: any.eventDate } : {}), url: candidate.page.url });
    // Berichtigung ohne Inkrafttretensvorschrift: Sie berichtigt den Wortlaut der Fassung, die sie nennt, und gilt für diese
    // Fassung – mit deren Inkrafttreten (BayMBl. 2026 Nr. 114 berichtigt die Fassung nach BayMBl. 2025 Nr. 214, in Kraft
    // 2025-04-01; so auch das Paket). Der Stichtagskörper hängt davon nicht ab: `run.ts` verlangt, dass ihr Wortlaut dort fehlt.
    if (!dated.ok && candidate.correction) {
      const corrected = await commencementOf(candidate.correction);
      if (!corrected.ok) return { ...base, ok: false, reason: `berichtigte Fassung: ${corrected.reason ?? ''}`, effectiveDates: [], effectiveDateEvidence: [], calendarDates: false };
      return { ...base, ok: true, effectiveDates: corrected.effectiveDates, effectiveDateEvidence: [`Berichtigung (bekannt gemacht ${eventDate ?? '–'}) der Fassung nach ${publicationCitation(candidate.correction.ref)}; gilt mit dieser Fassung: ${corrected.effectiveDateEvidence.join('; ').slice(0, 200)}`], calendarDates: corrected.calendarDates, ...(corrected.publicationDated ? { publicationDated: true } : {}) };
    }
    if (!dated.ok) return { ...base, ok: false, reason: dated.reason, effectiveDates: [], effectiveDateEvidence: [], calendarDates: false };
    return { ...base, ...(dated.eventDate ? { eventDate: dated.eventDate } : {}), ok: true, effectiveDates: dated.dates, effectiveDateEvidence: dated.evidence, calendarDates: dated.calendar, publicationDated: dated.publicationDated };
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
    // Lauf 11: Eine Berichtigung des Normtexts nach dem Stichtag, die als vorangehende Änderung genau die letzte Änderung
    // des Vollzitats nennt („…, zuletzt geändert durch die Bekanntmachung vom 7. April 2025 (BayMBl. Nr. 214), wird wie
    // folgt berichtigt:“, BayMBl. 2026 Nr. 114), ist das jüngste Glied der Kette – das Vollzitat führt sie nur bei der Fundstelle.
    for (const event of input.ledgerEvents.filter((entry) => entry.eventType === 'correction' && entry.eventDate !== undefined && entry.eventDate > input.baselineDate)) {
      const ref = refOfUrl(event.sourceUrl);
      if (!ref || !event.enactmentDate) continue;
      // Nur eine Prüfung: Scheitert die Auflösung, bleibt es beim Befund der Gegenprobe (Register), nicht bei diesem.
      const failuresBefore = result.failures.length;
      const resolved = await resolve({ text: event.citation, enactmentDate: event.enactmentDate, reference: ref.organ === 'gvbl' ? `GVBl. ${ref.volume} S. ${ref.position}` : `BayMBl. ${ref.volume} Nr. ${ref.position}`, sections: [], self: false }, undefined);
      if (resolved === 'stop') {
        result.failures.length = failuresBefore;
        continue;
      }
      for (const candidate of resolved) {
        const prior = candidate.block?.priorAmendmentClause;
        if (!prior) continue;
        const named = amendmentRefs(prior).filter((entry) => !entry.self).map((entry) => candidateRefs(entry.reference, entry.enactmentDate ?? '')[0]).filter((entry): entry is PublicationRef => entry !== undefined);
        if (named.length !== 1 || !pending.some((head) => sameRef(head.ref, named[0]!))) continue;
        pending.push({ ...candidate, correction: pending.find((head) => sameRef(head.ref, named[0]!))! });
        result.evidence.push(`${event.citation}: Berichtigung des Normtexts nach der letzten Änderung des Vollzitats („${prior.slice(0, 120)}“) – jüngstes Glied der Kette`);
      }
    }
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
      ...(newest.correction ? { correction: true } : {}),
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
        // Staatsverträge nennen ihre vorangehende Änderung ohne Fundstelle („zuletzt geändert durch den Fünften
        // Medienänderungsstaatsvertrag vom 27. Februar bis 6. März 2024“) – deren Verkündung ist so nicht bestimmt.
        if (refs.length === 0 && step.block?.citation.parenthetical === '' && !/\(/u.test(step.priorClause)) return fail('missing-base', 'prior-treaty-without-reference', `Die vorangehende Änderung „${step.priorClause.slice(0, 140)}“ ist ohne Fundstelle zitiert (Staatsvertrag); ihre Verkündung ist so nicht bestimmt`);
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
      if (!proof.calendarDates && !proof.publicationDated) return fail('partial-chain', 'prior-amendment-in-force-unproven', `Inkrafttreten der vorangehenden Änderung ${label} ohne Kalenderdatum („${proof.effectiveDateEvidence.join(' ').slice(0, 160)}“) und ohne Verkündungsdatum aus der Verkündung selbst`);
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

  // 2b – Parallele Änderungen: Das Register führt eine weitere Änderung nach dem Stichtag, die die Kette der Verweise nicht
  // nennt, weil sie auf **dieselbe** vorangehende Änderung aufsetzt wie ein Glied der Kette (GVBl. 2024 S. 98 und S. 155
  // nennen beide GVBl. 2024 S. 34 als letzte Änderung der GesV). Sie wird als Schritt aufgenommen, wenn ihre Seite die
  // Norm stark und eindeutig zitiert, ihr Einleitungssatz eine Änderung der Kette (Schritt oder letzte Änderung vor dem
  // Stichtag) als vorangehende nennt und ihr Inkrafttreten ganz zwischen Stichtag und Auswertungsstichtag liegt. Die
  // Schritte werden nach Inkrafttreten geordnet; der Rundlauf prüft, dass die Reihenfolge trägt.
  const chainRefs = [...result.steps, ...result.witnesses].map((step) => step.ref);
  const chainOrder = result.steps.map((step) => step.key);
  let siblings = 0;
  for (const event of input.ledgerEvents) {
    const ref = refOfUrl(event.sourceUrl);
    if (!ref || event.eventType !== 'amend' || !event.enactmentDate) continue;
    if ([...result.steps, ...result.future].some((step) => sameRef(step.ref, ref))) continue;
    const lookup = await lookupPage(input.root, [ref], event.enactmentDate);
    if (lookup.status !== 'found' || lookup.page.kind !== 'html') continue;
    const page = lookup.page;
    const { blocks } = commandBlocks(page.units, input.identity);
    if (blocks.length !== 1) continue;
    const block = blocks[0]!;
    const priorRefs = block.priorAmendmentClause ? amendmentRefs(block.priorAmendmentClause).filter((entry) => !entry.self) : [];
    if (priorRefs.length === 0 || !priorRefs.every((entry) => candidateRefs(entry.reference, entry.enactmentDate).some((candidate) => chainRefs.some((chained) => sameRef(chained, candidate))))) continue;
    const section = sectionRef(block.section, block.intro.label?.replace(/^[„‚]/u, ''));
    const candidate: Candidate = { ref: page.ref, page, block, ...(section ? { section } : {}), namedAs: event.citation, enactmentDate: event.enactmentDate };
    const proof = await commencementOf(candidate);
    if (!proof.ok || proof.effectiveDates.some((date) => date <= input.baselineDate || date > input.evaluationDate)) continue;
    result.steps.push({
      key: stepKey(page.ref, section, block.intro.index),
      ref: page.ref,
      page,
      citation: publicationCitation(page.ref),
      ...(section ? { section } : {}),
      block,
      namedAs: event.citation,
      enactmentDate: event.enactmentDate,
      ...(proof.eventDate ? { eventDate: proof.eventDate } : {}),
      eventDateSource: proof.eventDateSource,
      ...(proof.ledgerEvent ? { ledgerEvent: proof.ledgerEvent } : {}),
      effectiveDates: proof.effectiveDates,
      effectiveDateEvidence: proof.effectiveDateEvidence,
      calendarDates: proof.calendarDates,
      ...(block.priorAmendmentClause ? { priorClause: block.priorAmendmentClause } : {}),
    });
    result.evidence.push(`Parallele Änderung ${publicationCitation(page.ref)}${section ? ` (${section})` : ''}: nicht in der Kette der Verweise, aber ihr Einleitungssatz nennt dieselbe vorangehende Änderung (${priorRefs.map((entry) => entry.text.slice(0, 80)).join('; ')}); Inkrafttreten ${proof.effectiveDates.join(', ')}; eingeordnet nach Inkrafttreten`);
    siblings += 1;
  }
  if (siblings > 0) {
    // Jüngste zuerst: nach spätestem Inkrafttreten, bei Gleichstand nach Verkündung. Die Glieder der Kette behalten ihre
    // Reihenfolge – sonst ist die Einordnung nicht eindeutig.
    result.steps.sort((left, right) => {
      const a = [...left.effectiveDates].sort().at(-1)!;
      const b = [...right.effectiveDates].sort().at(-1)!;
      if (a !== b) return a < b ? 1 : -1;
      return (left.eventDate ?? '') < (right.eventDate ?? '') ? 1 : (left.eventDate ?? '') > (right.eventDate ?? '') ? -1 : 0;
    });
    const order = result.steps.map((step) => step.key).filter((key) => chainOrder.includes(key));
    if (order.join('|') !== chainOrder.join('|')) return fail('partial-chain', 'chain-parallel-order', 'Eine parallele Änderung lässt sich nicht eindeutig in die Kette einordnen (Reihenfolge nach Inkrafttreten weicht von der Kette ab)');
  }

  // 3 – Gegenproben.
  const reversedRefs = [...result.steps, ...result.future].map((step) => step.ref);
  const unexplained = input.ledgerEvents.filter((event) => {
    const ref = refOfUrl(event.sourceUrl);
    return !ref || !reversedRefs.some((reversed) => sameRef(reversed, ref));
  });
  // Lauf 8: nur vorläufig, wenn jede dieser Veröffentlichungen nach dem Stichtag liegt und die Stammverkündung vorliegt.
  const provisional = (state: ReconstructionState, reason: string, detail: string, allAfterBaseline: boolean): boolean => {
    if (!input.provisional || !allAfterBaseline) return false;
    (result.provisional ??= []).push({ state, reason, detail });
    result.evidence.push(`Vorläufig (nur mit Wortlautprobe gegen die Stammverkündung): ${detail}`);
    return true;
  };
  if (unexplained.length > 0) {
    const nonInvertible = unexplained.filter((event) => NON_INVERTIBLE_EVENT_TYPES.includes(event.eventType));
    const state = nonInvertible.length > 0 ? 'non-invertible-amendment' : 'partial-chain';
    const detail = `Das Register führt ${unexplained.map((event) => `${event.citation} (${event.eventType})`).join(', ')} für die Norm; die Kette der amtlichen Verweise enthält ${unexplained.length === 1 ? 'diese Veröffentlichung' : 'diese Veröffentlichungen'} nicht`;
    if (!provisional(state, 'chain-ledger-unexplained', detail, unexplained.every((event) => event.eventDate !== undefined && event.eventDate > input.baselineDate))) return fail(state, 'chain-ledger-unexplained', detail);
  } else {
    result.evidence.push(`Register: jedes stark zugeordnete Ereignis nach dem Stichtag (${input.ledgerEvents.length}) ist ein Schritt der Kette`);
  }

  const others: string[] = [];
  for (const [url, citations] of input.amendingByPage) {
    const ref = refOfUrl(url);
    if (!ref || reversedRefs.some((reversed) => sameRef(reversed, ref))) continue;
    if (citations.some((citation) => isStrongMatch(citationMatches(citation, input.identity)))) others.push(url);
  }
  if (others.length > 0) {
    const detail = `Weitere Verkündung(en) nach dem Stichtag zitieren die Norm mit einem Änderungsbefehl: ${others.sort().join(', ')}`;
    if (!provisional('partial-chain', 'chain-other-publication', detail, true)) return fail('partial-chain', 'chain-other-publication', detail);
  } else result.evidence.push('Keine andere Verkündung nach dem Stichtag zitiert die Norm mit einem Änderungsbefehl');

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
    if (post.length > 0) {
      const detail = `Änderungsverlauf führt nach dem Stichtag Änderungen, die die Kette nicht zurücknimmt: ${post.map((entry) => entry.entry.text.slice(0, 80)).join('; ')}`;
      if (!provisional('partial-chain', 'chain-history-steps', detail, true)) return fail('partial-chain', 'chain-history-steps', detail);
    }
    const missing = result.steps.map((step) => step.ref).filter((reversed) => !history.some((entry) => entry.kind === 'reversed' && candidateKeys(entry.entry.reference ?? '', entry.entry.date).some((key) => sameKey(key, reversed))));
    if (missing.length > 0) return fail('contradictory', 'chain-history-mismatch', `Änderungsverlauf führt ${missing.map(publicationCitation).join(', ')} nicht`);
    const earlier = history.filter((entry) => entry.kind === 'pre' || entry.kind === 'witness');
    if (result.stammfassung && earlier.length > 0) return fail('contradictory', 'chain-stamm-history-mismatch', `Die älteste zurückgenommene Änderung nennt keine vorangehende, der Änderungsverlauf aber ${earlier.length}`);
    if (!result.stammfassung && earlier.at(-1)?.kind !== 'witness') return fail('contradictory', 'chain-prior-history-mismatch', `Die letzte Änderung vor der Kette (${result.witnesses.map((witness) => witness.citation).join(', ')}) ist nicht der letzte Eintrag vor dem Stichtag im Änderungsverlauf („${earlier.at(-1)?.entry.text ?? '–'}“)`);
    if (post.length === 0) result.evidence.push(`Änderungsverlauf: nach dem Stichtag genau die zurückgenommenen Änderungen${result.stammfassung ? ', davor keine' : `, davor zuletzt ${result.witnesses.map((witness) => witness.citation).join(', ')}`}`);
  }

  const notes = (input.registerNotes ?? []).map((note) => ({ note, ...registerNote(note) }));
  if (notes.length > 0) {
    const undated = notes.find((entry) => entry.date === undefined);
    if (undated) return fail('partial-chain', 'chain-register-undated', `Fortführungsnachweis mit nicht lesbarer Notiz („${undated.note.slice(0, 100)}“)`);
    const classified = notes.map((entry) => ({ ...entry, kind: classify(entry.keys, entry.date) }));
    const post = classified.filter((entry) => entry.kind === 'post');
    if (post.length > 0) {
      const detail = `Fortführungsnachweis führt nach dem Stichtag Änderungen, die die Kette nicht zurücknimmt: ${post.map((entry) => entry.note).join('; ')}`;
      if (!provisional('partial-chain', 'chain-register-steps', detail, true)) return fail('partial-chain', 'chain-register-steps', detail);
    }
    const missing = result.steps.map((step) => step.ref).filter((reversed) => !classified.some((entry) => entry.kind === 'reversed' && entry.keys.some((key) => sameKey(key, reversed))));
    if (missing.length > 0) return fail('contradictory', 'chain-register-mismatch', `Fortführungsnachweis führt ${missing.map(publicationCitation).join(', ')} nicht`);
    const earlier = classified.filter((entry) => entry.kind === 'pre' || entry.kind === 'witness');
    if (result.stammfassung && earlier.length > 0) return fail('contradictory', 'chain-stamm-register-mismatch', `Die älteste zurückgenommene Änderung nennt keine vorangehende, der Fortführungsnachweis aber ${earlier.length}`);
    if (post.length === 0) result.evidence.push(`Fortführungsnachweis: nach dem Stichtag genau die zurückgenommenen Änderungen${result.stammfassung ? ', davor keine' : ''}`);
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
  let newestLatest = [...result.steps[0]!.effectiveDates].sort().at(-1)!;
  // Lauf 8: Das Paket gilt seit einem früheren Tag, als die jüngsten Änderungen in Kraft treten – das Portal hat sie noch
  // nicht eingearbeitet, wenn die nächstältere Änderung genau an diesem Tag in Kraft trat. Dann gehören die jüngeren nicht
  // zum heutigen Text; das gilt nur mit Wortlautprobe gegen die Stammverkündung (hätte das Portal sie doch eingearbeitet,
  // trüge der Stichtagskörper ihre Änderungen und wiche ab).
  if (input.provisional && input.inForceFrom && newestLatest > input.inForceFrom) {
    const lagging: WalkStep[] = [];
    while (result.steps.length > 1 && [...result.steps[0]!.effectiveDates].sort()[0]! > input.inForceFrom) lagging.push(result.steps.shift()!);
    const remaining = [...result.steps[0]!.effectiveDates].sort().at(-1)!;
    if (lagging.length > 0 && remaining === input.inForceFrom) {
      const detail = `Der heutige Text gilt laut Paket seit ${input.inForceFrom}; ${lagging.map((step) => `${step.citation}${step.section ? ` (${step.section})` : ''} (in Kraft ${step.effectiveDates.join(', ')})`).join(', ')} ist darin noch nicht eingearbeitet – die nächstältere Änderung ${result.steps[0]!.citation} trat genau an diesem Tag in Kraft`;
      provisional('contradictory', 'portal-in-force-lag', detail, true);
      result.future.push(...lagging);
      newestLatest = remaining;
    } else result.steps.unshift(...lagging);
  }
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

  // 6 – Lauf 7, nur auf Wunsch: die Änderungen vor dem Stichtag bis zur Stammfassung (`prior`), je mit Befehlsblock.
  if (input.deep && result.witnesses.length > 0) {
    const deepFail = (reason: string, detail: string): WalkResult => {
      result.priorFailure = { state: 'missing-base', reason, detail };
      delete result.prior;
      return result;
    };
    const prior: WalkStep[] = [];
    const known = new Set(result.witnesses.map((witness) => witness.key));
    const asStep = (candidate: Candidate): WalkStep => ({
      key: stepKey(candidate.ref, candidate.section, candidate.block?.intro.index),
      ref: candidate.ref,
      page: candidate.page,
      citation: publicationCitation(candidate.ref),
      ...(candidate.section ? { section: candidate.section } : {}),
      ...(candidate.block ? { block: candidate.block } : {}),
      namedAs: candidate.namedAs,
      ...(candidate.enactmentDate ? { enactmentDate: candidate.enactmentDate } : {}),
      ...(candidate.page.publishedAt ? { eventDate: candidate.page.publishedAt } : {}),
      eventDateSource: candidate.page.publishedAt ? 'page' : 'none',
      effectiveDates: [],
      effectiveDateEvidence: [],
      calendarDates: false,
      ...(candidate.block?.priorAmendmentClause ? { priorClause: candidate.block.priorAmendmentClause } : {}),
    });
    let frontier: WalkStep[] = [...result.witnesses];
    for (let guard = 0; guard < 60 && frontier.length > 0; guard += 1) {
      const found: Candidate[] = [];
      for (const step of frontier) {
        if (step.page.kind === 'pdf' || !step.block) return deepFail('prior-block-missing', `${step.citation}${step.section ? ` (${step.section})` : ''}: vor dem Stichtag, aber ohne lesbaren Befehlsblock${step.page.kind === 'pdf' ? ' (nur PDF)' : ''}`);
        if (!step.priorClause) continue;
        const refs = amendmentRefs(step.priorClause);
        if (refs.length === 0) return deepFail('prior-clause-unreadable', `Vorangehende Änderung im Befehl von ${step.citation} nicht lesbar („${step.priorClause.slice(0, 120)}“)`);
        for (const ref of refs) {
          const failures = result.failures.length;
          const resolved = await resolve(ref, step.page, step.enactmentDate);
          if (resolved === 'stop') {
            const failure = result.failures.splice(failures)[0];
            return deepFail(failure?.reason ?? 'prior-unresolved', failure?.detail ?? ref.text);
          }
          found.push(...resolved);
        }
      }
      const fresh = [...new Map(found.map((candidate) => [stepKey(candidate.ref, candidate.section, candidate.block?.intro.index), candidate])).values()].filter((candidate) => !known.has(stepKey(candidate.ref, candidate.section, candidate.block?.intro.index)));
      for (const candidate of fresh) {
        if (!candidate.block) return deepFail('prior-block-missing', candidate.blockMissing ?? `${publicationCitation(candidate.ref)}: kein lesbarer Befehlsblock`);
        known.add(stepKey(candidate.ref, candidate.section, candidate.block.intro.index));
      }
      frontier = fresh.sort(compareCandidates).reverse().map(asStep);
      prior.push(...frontier);
    }
    // Jüngste zuerst über die ganze Folge (Letzte Änderung(en) der Stichtagsfassung eingeschlossen).
    const all = [...result.witnesses.map((witness) => ({ step: witness, candidate: { ref: witness.ref, page: witness.page, namedAs: witness.namedAs, ...(witness.section ? { section: witness.section } : {}), ...(witness.block ? { block: witness.block } : {}), ...(witness.enactmentDate ? { enactmentDate: witness.enactmentDate } : {}) } as Candidate })), ...prior.map((step) => ({ step, candidate: { ref: step.ref, page: step.page, namedAs: step.namedAs, ...(step.section ? { section: step.section } : {}), ...(step.block ? { block: step.block } : {}), ...(step.enactmentDate ? { enactmentDate: step.enactmentDate } : {}) } as Candidate }))];
    all.sort((left, right) => compareCandidates(right.candidate, left.candidate));
    result.prior = all.map((entry) => entry.step);
    // Vollständigkeit: Jede Änderung vor dem Stichtag aus Änderungsverlauf und Fortführungsnachweis ist ein Glied.
    const deepRefs = result.prior.map((step) => step.ref);
    const listed = [
      ...historyEntries(input.changeHistory).map((entry) => ({ text: entry.text, date: entry.date, keys: entry.reference ? candidateKeys(entry.reference, entry.date) : [] })),
      ...(input.registerNotes ?? []).map((note) => ({ text: note, ...registerNote(note) })),
    ].filter((entry) => entry.date !== undefined && entry.date <= input.baselineDate && !result.steps.some((step) => entry.keys.some((key) => sameKey(key, step.ref))));
    const missing = listed.filter((entry) => !entry.keys.some((key) => deepRefs.some((ref) => sameKey(key, ref))));
    if (missing.length > 0) return deepFail('prior-list-mismatch', `Änderungsverlauf/Fortführungsnachweis führen vor dem Stichtag ${missing.map((entry) => `„${entry.text.slice(0, 80)}“`).join(', ')}; die Kette der Verweise bis zur Stammfassung enthält ${missing.length === 1 ? 'sie' : 'sie'} nicht`);
  }
  return result;
}
