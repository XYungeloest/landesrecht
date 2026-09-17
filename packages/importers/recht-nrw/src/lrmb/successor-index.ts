/**
 * Nachfolgebeleg-Index (P2, Evidence Pass): alle Aufhebungs-, Außerkrafttretens- und Ablösungsaussagen über
 * andere Vorschriften im netzfreien Bestand (LRMB-Seiten des Manifests, Ministerialblatt-Einträge des Caches),
 * jeweils mit den Metadaten der zitierenden Quelle, die das Wirksamkeitsdatum tragen:
 *
 *   Aussage           „Der RdErl. v. 12.11.1975 (SMBl. NRW. 20322) wird aufgehoben.“  (`repeal-patterns.ts`)
 *   zitierende Quelle Ausfertigungsdatum, eigene Inkrafttretensklausel, Veröffentlichungsdatum (Ministerialblatt),
 *                     „Gültig ab“ (datierte Fassung), SHA-256 der archivierten Seite
 *
 * Wirksamkeit einer Aufhebung (`resolveSuccessorEffective`), nur aus amtlichen Angaben:
 *   1. Datum in der Formel („tritt mit Ablauf des 31.12.2008 außer Kraft“, „mit Ablauf des Haushaltsjahres 2016“)
 *   2. sonst Inkrafttreten der aufhebenden Vorschrift: Klausel mit Datum; „am Tag nach der Veröffentlichung“ plus
 *      Veröffentlichungsdatum des Ministerialblatt-Eintrags; „Gültig ab“ der datierten Portalfassung
 *   3. sonst kein Datum – der Beleg bleibt `supporting` (kein automatischer Status)
 *
 * Beweisklasse einer Zuordnung (`matchSuccessors`):
 *   strong        Datum + Fundstelle/SMBl-Nummer/Aktenzeichen stimmen überein (`matchRepealStatements`, `strong`),
 *                 Formel hebt auf / setzt außer Kraft / ersetzt, Wirksamkeitsdatum belegt
 *   supporting    starke Zuordnung, aber Wirksamkeit nicht datierbar, oder Formel nur „gegenstandslos“,
 *                 „nicht mehr anzuwenden“, „neu gefasst“
 *   insufficient  nur Datumsgleichheit (ggf. Titelstichwort) – nie Grundlage einer Entscheidung
 *
 * Der Index ist ein Audit-Artefakt (`data/audits/recht-nrw/lrmb/successor-index.json`), erzeugt vom Review-Report
 * (`review-report --write`); die Pipeline liest ihn nur, ohne ihn zu verändern. Fehlt er, gibt es keine
 * Nachfolgebelege (Review wie bisher). Keine `successor`-Relation im kanonischen Normmodell.
 */
import { join } from 'node:path';

import { readJsonFile } from '../common/atomic.ts';
import { decodeHtml } from '../common/fetcher.ts';
import { AUDIT_DIR, compareSourceIdentity, type EvidenceStrength, type ImportManifest, type SuccessorEvidenceRecord } from '../common/manifest.ts';
import { plainTextOf, type OfflineSourceReader } from '../common/review-sources.ts';
import { parseVersionPage } from '../common/version-page.ts';
import { nextDay, parseGazetteEntry } from './gazette.ts';
import { parseLrmbDocument } from './parser.ts';
import { detectRepealStatements, matchRepealStatements, otherStatements, selfStatements, type RepealMatch, type RepealStatement, type RepealTarget } from './repeal-patterns.ts';
import { parseChangeNote, parseDecreeFromTitle, parseValidityClauses, type ValidityClause } from './text-metadata.ts';

export const SUCCESSOR_INDEX_SCHEMA = 'recht-nrw-lrmb-successor-index/1' as const;
export const SUCCESSOR_INDEX_PATH = join(AUDIT_DIR, 'lrmb', 'successor-index.json');

export interface CitingSource {
  url: string;
  sha256: string;
  kind: 'lrmb-page' | 'gazette-entry';
  identity?: string;
  title?: string;
  issuedOn?: string;
  /** Eigene Inkrafttretensklausel der zitierenden Vorschrift. */
  inForce?: { kind: ValidityClause['kind']; date?: string; text: string };
  /** Veröffentlichungsdatum des Ministerialblatt-Eintrags. */
  publishedOn?: string;
  /** „Gültig ab“ der zitierenden Fassung (datierte LRMB-Seite). */
  validFrom?: string;
  baseCitation?: string;
}

export interface IndexedRepealStatement {
  /** Position der zitierenden Quelle in `sources`. */
  source: number;
  statement: RepealStatement;
}

export interface SuccessorIndexScan {
  lrmbPages: number;
  gazetteEntries: number;
  statementsOther: number;
  statementsSelf: number;
}

/** Identitätsmerkmale einer LRMB-Seite des Bestands (Eindeutigkeitsprüfung der Vorgängeridentität). */
export interface IndexedPageIdentity {
  identity?: string;
  url: string;
  issuedOn?: string;
  /** Stammfundstelle im Ministerialblatt (Seite ohne Buchstabenzusatz, Jahr). */
  gazettePage?: string;
  gazetteYear?: number;
}

export interface SuccessorIndex {
  schemaVersion: typeof SUCCESSOR_INDEX_SCHEMA;
  generatedAt: string;
  scanned: SuccessorIndexScan;
  sources: CitingSource[];
  /** Nur Aussagen über andere Vorschriften mit mindestens einem lesbaren Datum. */
  statements: IndexedRepealStatement[];
  /** Alle gescannten LRMB-Seiten mit Ausfertigungsdatum (Eindeutigkeit von Datum + Stammfundstelle im Bestand). */
  pages: IndexedPageIdentity[];
}

export interface SuccessorEffective {
  date?: string;
  derivation: string;
  /** Ob das Datum amtlich belegt ist (Formel oder Inkrafttreten der aufhebenden Vorschrift). */
  strong: boolean;
}

export interface SuccessorMatch {
  source: CitingSource;
  statement: RepealStatement;
  level: RepealMatch['level'];
  matched: RepealMatch['matched'];
  effective: SuccessorEffective;
  strength: EvidenceStrength;
  /** Andere LRMB-Seiten des Bestands mit demselben Ausfertigungsdatum und derselben Stammfundstelle (Identität nicht eindeutig). */
  ambiguousWith?: string[];
  /** Strukturierter Beleg für Manifest/Audit. */
  record: SuccessorEvidenceRecord;
}

export function emptySuccessorIndex(generatedAt: string): SuccessorIndex {
  return { schemaVersion: SUCCESSOR_INDEX_SCHEMA, generatedAt, scanned: { lrmbPages: 0, gazetteEntries: 0, statementsOther: 0, statementsSelf: 0 }, sources: [], statements: [], pages: [] };
}

interface ScanSource {
  url: string;
  identity?: string;
  title?: string;
  localSource?: string;
  gazette: boolean;
}

/**
 * Baut den Index deterministisch (Quellen nach URL sortiert) aus dem netzfreien Bestand: LRMB-Seiten des Manifests,
 * ihre archivierten Ministerialblatt-Einträge und weitere Ministerialblatt-Adressen.
 */
export async function buildSuccessorIndex(input: { manifest: ImportManifest; reader?: OfflineSourceReader; gazetteUrls?: readonly string[]; now: string; log?: (message: string) => void }): Promise<SuccessorIndex> {
  const index = emptySuccessorIndex(input.now);
  if (!input.reader) return index;
  const byUrl = new Map<string, ScanSource>();
  for (const entry of [...input.manifest.entries].filter((candidate) => candidate.sourceArea === 'lrmb').sort((left, right) => compareSourceIdentity(left.sourceIdentity, right.sourceIdentity))) {
    const page = entry.rawDocuments.find((raw) => raw.role === 'version-page');
    const url = page?.url ?? entry.sourceUrl;
    if (!byUrl.has(url)) byUrl.set(url, { url, identity: entry.sourceIdentity, title: entry.sourceTitle, gazette: false, ...(page?.localSource ? { localSource: page.localSource } : {}) });
    for (const raw of entry.rawDocuments.filter((candidate) => candidate.role === 'gazette-amendment')) {
      if (!byUrl.has(raw.url)) byUrl.set(raw.url, { url: raw.url, gazette: true, ...(raw.localSource ? { localSource: raw.localSource } : {}) });
    }
  }
  for (const url of input.gazetteUrls ?? []) if (!byUrl.has(url)) byUrl.set(url, { url, gazette: true });
  const sources = [...byUrl.values()].sort((left, right) => (left.url < right.url ? -1 : left.url > right.url ? 1 : 0));
  for (const [position, source] of sources.entries()) {
    if (input.log && position % 500 === 0) input.log(`Nachfolgebelege ${position + 1}/${sources.length}`);
    const document = await input.reader.read(source.url, source.localSource);
    if (!document || !/html/iu.test(document.contentType)) continue;
    const html = decodeHtml(document);
    const text = plainTextOf(html);
    if (!text) continue;
    const citing: CitingSource = { url: source.url, sha256: document.sha256, kind: source.gazette ? 'gazette-entry' : 'lrmb-page' };
    if (source.identity) citing.identity = source.identity;
    if (source.title) citing.title = source.title;
    let bodyTexts: string[] = [];
    if (source.gazette) {
      index.scanned.gazetteEntries += 1;
      try {
        const entry = parseGazetteEntry(html, source.url);
        if (entry.title) citing.title = entry.title;
        if (entry.publishedOn) citing.publishedOn = entry.publishedOn;
        if (entry.inForce) citing.inForce = { kind: entry.inForce.kind, text: entry.inForce.text, ...(entry.inForce.date ? { date: entry.inForce.date } : {}) };
        if (entry.parse.head.issuedOn) citing.issuedOn = entry.parse.head.issuedOn;
        bodyTexts = entry.parse.bodyTexts;
      } catch {
        bodyTexts = [];
      }
    } else {
      index.scanned.lrmbPages += 1;
      try {
        const page = parseVersionPage(html, source.url);
        if (page.title) citing.title = page.title;
        if (page.validFrom) citing.validFrom = page.validFrom;
        const parse = parseLrmbDocument(page.content.format === 'native' ? page.content.bodyHtml : '');
        const titleDecree = parseDecreeFromTitle(page.title);
        const issuedOn = parse.head.issuedOn ?? titleDecree?.issuedOn ?? page.issuedOn;
        if (issuedOn) citing.issuedOn = issuedOn;
        const base = parse.changeNoteText ? parseChangeNote(parse.changeNoteText).base : undefined;
        if (base) citing.baseCitation = base.text;
        if (issuedOn) {
          const pageIdentity: IndexedPageIdentity = { url: source.url, issuedOn };
          if (source.identity) pageIdentity.identity = source.identity;
          if (base?.gazette === 'MBl. NRW.' && base.page) {
            pageIdentity.gazettePage = base.page.replace(/[a-z]$/u, '');
            pageIdentity.gazetteYear = base.year;
          }
          index.pages.push(pageIdentity);
        }
        bodyTexts = parse.bodyTexts;
        if (bodyTexts.length > 0) {
          const clauses = parseValidityClauses(bodyTexts);
          if (clauses.inForce) citing.inForce = { kind: clauses.inForce.kind, text: clauses.inForce.text, ...(clauses.inForce.date ? { date: clauses.inForce.date } : {}) };
        }
      } catch {
        bodyTexts = [];
      }
    }
    // Ohne parsbaren Normkörper (Legacy-Format, Minimalseite) dient der Fließtext der Seite als Grundlage.
    const statements = detectRepealStatements(bodyTexts.length > 0 ? bodyTexts : text);
    index.scanned.statementsSelf += selfStatements(statements).length;
    const others = otherStatements(statements);
    index.scanned.statementsOther += others.length;
    const dated = others.filter((statement) => statement.references.some((reference) => reference.date));
    if (dated.length === 0) continue;
    const sourceIndex = index.sources.push(citing) - 1;
    for (const statement of dated) index.statements.push({ source: sourceIndex, statement });
  }
  return index;
}

const loaded = new Map<string, Promise<SuccessorIndex | undefined>>();

/** Liest den Index eines Repositories (einmal je Prozess); `undefined`, wenn er fehlt oder ein anderes Schema hat. */
export function loadSuccessorIndex(root: string): Promise<SuccessorIndex | undefined> {
  let pending = loaded.get(root);
  if (!pending) {
    pending = readJsonFile<SuccessorIndex>(join(root, SUCCESSOR_INDEX_PATH)).then((index) => (index?.schemaVersion === SUCCESSOR_INDEX_SCHEMA && Array.isArray(index.sources) && Array.isArray(index.statements) && Array.isArray(index.pages) ? index : undefined)).catch(() => undefined);
    loaded.set(root, pending);
  }
  return pending;
}

/** Nur für Tests: vergisst geladene Indizes. */
export function resetSuccessorIndexCache(): void {
  loaded.clear();
}

/** Wirksamkeit einer Aufhebung/Ablösung aus Formel und zitierender Quelle – nie geraten. */
export function resolveSuccessorEffective(statement: RepealStatement, source: Pick<CitingSource, 'inForce' | 'publishedOn' | 'validFrom' | 'kind'>): SuccessorEffective {
  const effective = statement.effective;
  if (effective?.kind === 'date' || effective?.kind === 'end-of-year') {
    if (effective.date) return { date: effective.date, derivation: `Zeitpunkt in der Formel („${effective.text}“)`, strong: true };
  }
  if (effective?.kind === 'event') return { derivation: `ereignisabhängig („${effective.text}“) – nicht datierbar`, strong: false };
  const prefix = effective?.kind === 'simultaneous' ? `„${effective.text}“: ` : 'ohne Zeitangabe: ';
  if (source.inForce?.date) return { date: source.inForce.date, derivation: `${prefix}Inkrafttreten der aufhebenden Vorschrift laut Klausel (${source.inForce.date})`, strong: true };
  if (source.inForce?.kind === 'day-after-publication' && source.publishedOn) return { date: nextDay(source.publishedOn), derivation: `${prefix}Tag nach der Veröffentlichung der aufhebenden Vorschrift am ${source.publishedOn}`, strong: true };
  if (source.validFrom) return { date: source.validFrom, derivation: `${prefix}„Gültig ab“ der aufhebenden Portalfassung (${source.validFrom})`, strong: true };
  if (source.publishedOn) return { date: source.publishedOn, derivation: `${prefix}nur Veröffentlichungsdatum der aufhebenden Vorschrift (${source.publishedOn}), Inkrafttreten nicht belegt`, strong: false };
  return { derivation: `${prefix}Inkrafttreten der aufhebenden Vorschrift nicht belegt`, strong: false };
}

const DECIDING_KINDS = new Set<RepealStatement['kind']>(['repealed', 'expired', 'replaced']);

export function successorStrength(level: RepealMatch['level'], kind: RepealStatement['kind'], effective: SuccessorEffective): EvidenceStrength {
  if (level !== 'strong') return 'insufficient';
  return DECIDING_KINDS.has(kind) && effective.strong && effective.date ? 'strong' : 'supporting';
}

export interface SuccessorTarget extends RepealTarget {
  /** Quellidentität und Seitenadresse der Zielvorschrift (Selbstzitate werden ausgeschlossen). */
  identity?: string;
  url?: string;
}

/**
 * Andere Seiten des Bestands, die dieselbe Vorgängeridentität tragen (Ausfertigungsdatum + Stammfundstelle): Dann ist
 * die Zuordnung eines Nachfolgebelegs über Datum und Fundstelle nicht eindeutig (Seitenkollision im Ministerialblatt).
 */
export function ambiguousIdentities(pages: readonly IndexedPageIdentity[], target: SuccessorTarget): string[] {
  if (!target.issuedOn || !target.gazettePage) return [];
  const targetPage = target.gazettePage.replace(/[a-z]$/u, '');
  return pages
    .filter((page) => page.issuedOn === target.issuedOn && page.gazettePage === targetPage && (!page.gazetteYear || !target.gazetteYear || page.gazetteYear === target.gazetteYear) && page.identity !== target.identity && page.url !== target.url)
    .map((page) => page.identity ?? page.url)
    .sort();
}

/** Ordnet die Aussagen des Index einer Zielvorschrift zu (Datum Pflicht; Beweisklasse siehe Modulkopf). Deterministisch sortiert. */
export function matchSuccessors(index: Pick<SuccessorIndex, 'sources' | 'statements'> & Partial<Pick<SuccessorIndex, 'pages'>>, target: SuccessorTarget): SuccessorMatch[] {
  if (!target.issuedOn) return [];
  const ambiguous = ambiguousIdentities(index.pages ?? [], target);
  const matches: SuccessorMatch[] = [];
  for (const indexed of index.statements) {
    if (!indexed.statement.references.some((reference) => reference.date === target.issuedOn)) continue;
    const source = index.sources[indexed.source];
    if (!source) continue;
    if ((target.identity && source.identity === target.identity) || (target.url && source.url === target.url)) continue;
    for (const match of matchRepealStatements([indexed.statement], target)) {
      const effective = resolveSuccessorEffective(match.statement, source);
      // Datum + Fundstelle identifizieren nur dann eindeutig, wenn keine andere Seite des Bestands dieselben Merkmale trägt;
      // eine Zuordnung über SMBl-Nummer oder Aktenzeichen bleibt davon unberührt.
      const identityUnique = ambiguous.length === 0 || match.matched.some((item) => item === 'smbl-number' || item === 'file-reference');
      const strength = identityUnique ? successorStrength(match.level, match.statement.kind, effective) : match.level === 'strong' ? 'supporting' : 'insufficient';
      const citations = match.reference.citations.map((citation) => citation.text);
      const record: SuccessorEvidenceRecord = {
        predecessorIdentity: `${match.statement.head ?? 'Vorschrift'} vom ${match.reference.date}${citations.length ? ` (${citations.join(' / ')})` : ''}${match.reference.fileReference ? ` – ${match.reference.fileReference}` : ''}`,
        successorTitle: source.title ?? source.url,
        statementKind: match.statement.kind,
        effectiveDerivation: identityUnique ? effective.derivation : `${effective.derivation}; Vorgängeridentität nicht eindeutig (auch ${ambiguous.join(', ')} trägt Datum und Fundstelle)`,
        citation: citations.join(' / ') || (match.reference.fileReference ? `Az. ${match.reference.fileReference}` : 'keine Fundstelle'),
        matched: [...match.matched],
        sourceUrl: source.url,
        sha256: source.sha256,
        evidenceStrength: strength,
      };
      if (source.identity) record.successorIdentity = source.identity;
      if (effective.date) record.effectiveDate = effective.date;
      const successorMatch: SuccessorMatch = { source, statement: match.statement, level: match.level, matched: match.matched, effective, strength, record };
      if (!identityUnique) successorMatch.ambiguousWith = ambiguous;
      matches.push(successorMatch);
    }
  }
  const rank: Record<EvidenceStrength, number> = { strong: 0, supporting: 1, insufficient: 2, contradictory: 3 };
  return matches.sort((left, right) => rank[left.strength] - rank[right.strength] || (left.effective.date ?? '9999').localeCompare(right.effective.date ?? '9999') || (left.source.url < right.source.url ? -1 : left.source.url > right.source.url ? 1 : 0) || left.statement.offset - right.statement.offset);
}
