/**
 * Lauf der unabhängigen Registerabgleich-Nachrechnung (netzfrei).
 *
 *   node packages/importers/juris-sh/src/audit/register-crosscheck-run.ts [--write]
 *
 * Eingaben (nur lesend):
 *   - `data/imports/juris-sh/events/ledger.json`          Registereinträge mit Ereignissen (Nenner der Inventur)
 *   - `.cache/schleswig-holstein/raw|pagetext/…`           amtliche Register (Systematische Übersicht, Erlassverzeichnis)
 *   - `data/audits/juris-sh/corpus-inventory.json`         enumerierte juris-Dokumente mit Titel, Nummer, Ausgang
 *   - `.cache/juris-sh/<cacheKey>.bin`                     PDF-Gesamtausgaben (Kopf: Datum, Fundstelle, Gl.-Nr.)
 *   - `data/audits/juris-sh/register-crosscheck/manual-review.json` (optional) Urteile der Handprüfung
 *
 * Ausgaben (nur mit `--write`): `data/audits/juris-sh/register-crosscheck/register-crosscheck.json` und
 * `REGISTER_CROSSCHECK.md`. Die Kopfangaben der 5 197 PDFs werden in `.cache/juris-sh-audit/` zwischengespeichert
 * (SHA-256 der PDF als Schlüssel), damit ein Wiederholungslauf nicht erneut alle PDFs liest.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cacheKey } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';

import { CACHE_DIR } from '../common/constants.ts';
import { DISCOVERY_CACHE_DIR, EVENT_SOURCES } from '../events/build.ts';
import { extractPdfPages } from '../events/pdf-text.ts';
import { parseErlassverzeichnis, parseSystematicOverview } from '../events/registers.ts';
import { pdfExportUrl } from '../export/client.ts';
import { isoDate, parseJurisPdf } from '../parse/juris-pdf.ts';
import { layoutFromPdf } from '../parse/pdf-layout.ts';
import {
  buildDocumentIndex,
  coverage,
  exclusionFigures,
  glKey,
  matchRegisterEntry,
  type Area,
  type CoverageFigures,
  type EntryMatch,
  type ExclusionFigures,
  type JurisDocument,
  type RegisterRecord,
  type RegisterSourceId,
} from './register-crosscheck.ts';

export const OUTPUT_DIR = 'data/audits/juris-sh/register-crosscheck';
export const OUTPUT_JSON = `${OUTPUT_DIR}/register-crosscheck.json`;
export const OUTPUT_MD = `${OUTPUT_DIR}/REGISTER_CROSSCHECK.md`;
export const MANUAL_REVIEW = `${OUTPUT_DIR}/manual-review.json`;
const HEADER_CACHE = '.cache/juris-sh-audit/document-headers.json';
/** Urteile der Handprüfung, nach denen ein Titel-Treffer der Altregel nicht die registrierte Norm belegt. */
export const REJECTING_VERDICTS: readonly string[] = ['andere Norm', 'gleiche Vorschrift, andere Fassung'];

const REGISTERS: ReadonlyArray<{ source: RegisterSourceId; area: Area }> = [
  { source: 'gvobl-systematische-uebersicht', area: 'landesrecht' },
  { source: 'ab-erlassverzeichnis', area: 'vwv' },
];

interface LedgerFile {
  sources: Array<{ id: string; asOf?: string }>;
  events: Array<{ sourceId: string; targetGliederungsnummer?: string; targetTitle: string; targetIdentityHints: string[] }>;
}

interface InventoryFile {
  registerCrosscheck: Array<{ source: string; registerNumbers: number; found: number; coverage: number; excludedAmendingOrAgreement: number }>;
  entries: Array<{ documentId: string; area: Area; outcome: string; title?: string; gliederungsnummer?: string }>;
}

interface HeaderFacts {
  sha256: string;
  gliederungsnummer?: string;
  dates: string[];
  fundstelle?: string;
  title?: string;
}

export interface ManualVerdict {
  source: RegisterSourceId;
  gliederungsnummer: string;
  kind: 'false-positive-check' | 'false-negative-check';
  verdict: string;
  reason: string;
}

/* ------------------------------------------------------------------------------------ Eingaben */

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function hint(hints: readonly string[], prefix: string): string | undefined {
  return hints.find((entry) => entry.startsWith(`${prefix}:`))?.slice(prefix.length + 1);
}

/**
 * Nenner der Inventur: Nummern mit mindestens einem Registerereignis, letzter Titel gewinnt – genau wie
 * `buildInventoryReport` in `bulk.ts`, damit die gemeldete Zahl reproduziert wird.
 *
 * Befund: Ein Änderungsbefehl („Art. 1 ändert Gl.Nr. 221-24“) ist ein Ereignis der **Zielnummer**, trägt aber
 * Titel und Kopfangaben des **ändernden** Gesetzes (Hinweis `gl-nr:` ≠ Zielnummer). Gewinnt ein solches Ereignis,
 * steht die Stammnorm mit dem Titel des Änderungsgesetzes im Nenner und fällt unter die Ausschlussregel.
 * `foreignTitle` markiert diese Fälle.
 */
export function ledgerRecords(ledger: LedgerFile, source: RegisterSourceId): Array<RegisterRecord & { foreignTitle: boolean }> {
  const byNumber = new Map<string, RegisterRecord & { foreignTitle: boolean }>();
  for (const event of ledger.events) {
    if (event.sourceId !== source || !event.targetGliederungsnummer) continue;
    const issuedDate = hint(event.targetIdentityHints, 'ausfertigung');
    const citation = hint(event.targetIdentityHints, 'stammfundstelle');
    const own = hint(event.targetIdentityHints, 'gl-nr');
    const foreignTitle = own !== undefined && glKey(own) !== glKey(event.targetGliederungsnummer);
    byNumber.set(glKey(event.targetGliederungsnummer), { source, gliederungsnummer: event.targetGliederungsnummer, title: event.targetTitle, ...(issuedDate ? { issuedDate } : {}), ...(citation ? { citation } : {}), inLedger: true, foreignTitle });
  }
  return [...byNumber.values()];
}

/** Voller Registerbestand: jeder Kopf des amtlichen Registers, auch ohne Ereigniszeile. */
export async function fullRegisterRecords(root: string, source: RegisterSourceId, ledgerNumbers: Set<string>): Promise<RegisterRecord[]> {
  const definition = EVENT_SOURCES.find((entry) => entry.id === source);
  if (!definition) throw new Error(`Registerquelle ${source} unbekannt`);
  const pdf = join(root, DISCOVERY_CACHE_DIR, 'raw', definition.file);
  const pages = extractPdfPages(pdf, { pageTextDir: join(root, DISCOVERY_CACHE_DIR, 'pagetext'), offline: true })
    .filter((page) => page.status !== 'unreadable')
    .map((page) => ({ page: page.page, text: page.text }));
  const parsed = source === 'gvobl-systematische-uebersicht' ? parseSystematicOverview(pages) : parseErlassverzeichnis(pages);
  return parsed.entries.map((entry) => ({
    source,
    gliederungsnummer: entry.gliederungsnummer,
    title: entry.title,
    ...(entry.issuedDate ? { issuedDate: entry.issuedDate } : {}),
    ...(entry.citation ? { citation: entry.citation } : {}),
    inLedger: ledgerNumbers.has(glKey(entry.gliederungsnummer)),
  }));
}

/** Kopfangaben der PDF-Gesamtausgabe je Dokument (Cache mit SHA-256 der PDF als Gültigkeitsbeleg). */
async function documentHeaders(root: string, ids: readonly string[], log: (line: string) => void): Promise<Map<string, HeaderFacts>> {
  const cachePath = join(root, HEADER_CACHE);
  const cached: Record<string, HeaderFacts> = existsSync(cachePath) ? await readJson(cachePath) : {};
  const result = new Map<string, HeaderFacts>();
  let parsed = 0;
  for (const id of ids) {
    const base = join(root, CACHE_DIR, cacheKey(pdfExportUrl(id, 'gesamtausgabe')));
    if (!existsSync(`${base}.bin`) || !existsSync(`${base}.json`)) continue;
    const sha256 = (await readJson<{ sha256: string }>(`${base}.json`)).sha256;
    const hit = cached[id];
    if (hit && hit.sha256 === sha256) {
      result.set(id, hit);
      continue;
    }
    try {
      const pdf = parseJurisPdf(layoutFromPdf(await readFile(`${base}.bin`)));
      const header = pdf.header;
      const gl = header['Gliederungs-Nr'];
      const facts: HeaderFacts = {
        sha256,
        dates: [...new Set([header.Ausfertigungsdatum, header.Neugefasst, header.Erlassdatum].map((value) => isoDate(value)).filter((value): value is string => value !== undefined))],
        ...(gl ? { gliederungsnummer: gl } : {}),
        ...(header.Fundstelle ?? header.Fundstellen ? { fundstelle: (header.Fundstelle ?? header.Fundstellen)! } : {}),
        ...(pdf.title ? { title: pdf.title } : {}),
      };
      cached[id] = facts;
      result.set(id, facts);
    } catch (error) {
      log(`${id}: Kopf nicht lesbar (${String(error).slice(0, 120)})`);
    }
    parsed += 1;
    if (parsed % 500 === 0) log(`${parsed} PDF-Köpfe gelesen`);
  }
  if (parsed > 0) {
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify(cached));
  }
  return result;
}

/* ------------------------------------------------------------------------------------ Auswertung */

function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().replace(/ß/gu, 'ss').split(/[^a-z0-9äöü]+/u).filter((word) => word.length >= 4));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}

interface DocumentView {
  id: string;
  gliederungsnummer?: string;
  dates: string[];
  fundstelle?: string;
  outcome?: string;
  title?: string;
}

function view(document: JurisDocument): DocumentView {
  return { id: document.id, ...(document.gliederungsnummer ? { gliederungsnummer: document.gliederungsnummer } : {}), dates: document.dates, ...(document.fundstelle ? { fundstelle: document.fundstelle } : {}), ...(document.outcome ? { outcome: document.outcome } : {}), ...(document.title ? { title: document.title.slice(0, 140) } : {}) };
}

interface RegisterView {
  gliederungsnummer: string;
  title: string;
  issuedDate?: string;
  citation?: string;
  inLedger: boolean;
}

const registerView = (record: RegisterRecord): RegisterView => ({ gliederungsnummer: record.gliederungsnummer, title: record.title.slice(0, 160), ...(record.issuedDate ? { issuedDate: record.issuedDate } : {}), ...(record.citation ? { citation: record.citation } : {}), inLedger: record.inLedger });

/** Automatische Einordnung eines Titel-only-Treffers der Altregel (Handprüfung ergänzt sie). */
function titleOnlyAssessment(match: EntryMatch, documents: readonly JurisDocument[]): 'corroborated' | 'corroborated-by-split-gl' | 'contradicted-by-date' | 'ambiguous-several-candidates' | 'uncorroborated' {
  if (match.tier === 'gl') return 'corroborated-by-split-gl';
  if (match.tier === 'gl-variant' || match.tier === 'fundstelle' || match.tier === 'title-date') return 'corroborated';
  const date = match.record.issuedDate;
  const candidates = documents.filter((document) => match.titleCandidates.includes(document.id));
  if (date && candidates.length > 0 && candidates.every((document) => document.dates.length > 0 && !document.dates.includes(date))) return 'contradicted-by-date';
  if (candidates.length > 1) return 'ambiguous-several-candidates';
  return 'uncorroborated';
}

export interface RegisterResult {
  source: RegisterSourceId;
  area: Area;
  asOf?: string;
  /** Inventur, wie in `corpus-inventory.json` gemeldet. */
  reported?: { registerNumbers: number; found: number; coverage: number; excluded: number };
  /** Nenner der Inventur (Nummern mit Registerereignis). */
  ledgerSubset: {
    entries: number;
    excluded: number;
    figures: CoverageFigures;
    /** Nummern, deren Titel im Nenner von einem Änderungsbefehl stammt (Titel des ändernden Gesetzes). */
    foreignTitle: { total: number; excluded: number; excludedButFoundByNumber: number; numbers: string[] };
    /** Nummern des Nenners, die im Register keinen eigenen Kopf haben. */
    notInRegister: string[];
  };
  /** Voller Registerbestand (jeder Kopf des Registers). */
  fullRegister: { entries: number; withoutEvents: number; excluded: number; figures: CoverageFigures; figuresWithoutEvents: CoverageFigures };
  exclusions: { ledgerSubset: ExclusionFigures[]; fullRegister: ExclusionFigures[] };
  /** Alle Treffer der Altregel, die nicht über die (ungeteilte) Nummer zustande kamen. */
  legacyTitleMatches: Array<{ register: RegisterView; tier: string; assessment: string; candidates: DocumentView[] }>;
  /** Streng nicht gefunden (Stufe none oder title-only) mit dem ähnlichsten juris-Titel. */
  strictMissing: Array<{ register: RegisterView; tier: string; nearest?: DocumentView & { similarity: number } }>;
  /** Ausgänge der streng zugeordneten juris-Dokumente. */
  matchedOutcomes: Record<string, number>;
  /** Auswertung der Handprüfung der Titel-Treffer (Falsch-positiv-Stichprobe). */
  titleMatchReview: {
    reviewed: number;
    unreviewed: string[];
    verdicts: { ledgerSubset: Record<string, number>; fullRegister: Record<string, number> };
    /** Altregel abzüglich der als „andere Norm“ oder „andere Fassung“ beurteilten Titel-Treffer. */
    legacyCorrected: { ledgerSubset: { found: number; rate: number }; fullRegister: { found: number; rate: number } };
  };
}

export interface CrosscheckReport {
  schemaVersion: 'juris-sh-register-crosscheck/1';
  generatedFrom: string[];
  documents: { enumerated: number; withHeader: number };
  registers: RegisterResult[];
  manualReview: ManualVerdict[];
}

export async function runRegisterCrosscheck(root: string, log: (line: string) => void = () => {}): Promise<CrosscheckReport> {
  const ledger = await readJson<LedgerFile>(join(root, 'data/imports/juris-sh/events/ledger.json'));
  const inventory = await readJson<InventoryFile>(join(root, 'data/audits/juris-sh/corpus-inventory.json'));
  const headers = await documentHeaders(root, inventory.entries.map((entry) => entry.documentId), log);
  const documents: JurisDocument[] = inventory.entries.map((entry) => {
    const header = headers.get(entry.documentId);
    return {
      id: entry.documentId,
      area: entry.area,
      ...(entry.title ? { title: entry.title } : {}),
      // Kopf der PDF ist die Primärquelle; die Inventur trägt dieselbe Angabe (ohne Aufteilung).
      ...((header?.gliederungsnummer ?? entry.gliederungsnummer) ? { gliederungsnummer: (header?.gliederungsnummer ?? entry.gliederungsnummer)! } : {}),
      dates: header?.dates ?? [],
      ...(header?.fundstelle ? { fundstelle: header.fundstelle } : {}),
      outcome: entry.outcome,
    };
  });
  const manualPath = join(root, MANUAL_REVIEW);
  const manualReview: ManualVerdict[] = existsSync(manualPath) ? (await readJson<{ verdicts: ManualVerdict[] }>(manualPath)).verdicts : [];

  const registers: RegisterResult[] = [];
  for (const { source, area } of REGISTERS) {
    const index = buildDocumentIndex(documents, area);
    const subset = ledgerRecords(ledger, source);
    const subsetMatches = subset.map((record) => matchRegisterEntry(record, index));
    const full = await fullRegisterRecords(root, source, new Set(subset.map((record) => glKey(record.gliederungsnummer))));
    const fullNumbers = new Set(full.map((record) => glKey(record.gliederungsnummer)));
    const fullMatches = full.map((record) => matchRegisterEntry(record, index));
    const reported = inventory.registerCrosscheck.find((entry) => entry.source === source);
    const byId = new Map(index.documents.map((document) => [document.id, document]));
    const legacyTitleMatches = fullMatches
      .filter((match) => !match.exclusion && match.legacyFound && !match.legacyByNumber)
      .map((match) => ({ register: registerView(match.record), tier: match.tier, assessment: titleOnlyAssessment(match, index.documents), candidates: [...new Set([...match.documentIds, ...match.titleCandidates])].map((id) => view(byId.get(id)!)).slice(0, 8) }))
      .sort((left, right) => left.register.gliederungsnummer.localeCompare(right.register.gliederungsnummer, 'de', { numeric: true }));
    const titleTokens = index.documents.filter((document) => document.title).map((document) => ({ document, words: tokens(document.title!) }));
    const strictMissing = fullMatches
      .filter((match) => !match.exclusion && (match.tier === 'none' || match.tier === 'title-only' || match.tier === 'gl-amendment-only'))
      .map((match) => {
        const words = tokens(match.record.title);
        let best: { document: JurisDocument; similarity: number } | undefined;
        for (const candidate of titleTokens) {
          const similarity = jaccard(words, candidate.words);
          if (!best || similarity > best.similarity) best = { document: candidate.document, similarity };
        }
        return { register: registerView(match.record), tier: match.tier, ...(best && best.similarity >= 0.3 ? { nearest: { ...view(best.document), similarity: Math.round(best.similarity * 100) / 100 } } : {}) };
      })
      .sort((left, right) => left.register.gliederungsnummer.localeCompare(right.register.gliederungsnummer, 'de', { numeric: true }));
    const matchedOutcomes: Record<string, number> = {};
    for (const match of fullMatches.filter((entry) => !entry.exclusion && ['gl', 'gl-variant', 'fundstelle', 'title-date'].includes(entry.tier))) {
      for (const id of match.documentIds) matchedOutcomes[byId.get(id)?.outcome ?? 'unknown'] = (matchedOutcomes[byId.get(id)?.outcome ?? 'unknown'] ?? 0) + 1;
    }
    const reviewFor = new Map(manualReview.filter((entry) => entry.source === source && entry.kind === 'false-positive-check').map((entry) => [glKey(entry.gliederungsnummer), entry.verdict]));
    const tally = (list: typeof legacyTitleMatches): Record<string, number> => list.reduce<Record<string, number>>((acc, entry) => {
      const verdict = reviewFor.get(glKey(entry.register.gliederungsnummer)) ?? 'ungeprüft';
      return { ...acc, [verdict]: (acc[verdict] ?? 0) + 1 };
    }, {});
    const rejected = (list: typeof legacyTitleMatches): number => list.filter((entry) => REJECTING_VERDICTS.includes(reviewFor.get(glKey(entry.register.gliederungsnummer)) ?? '')).length;
    const subsetNumbers = new Set(subset.map((record) => glKey(record.gliederungsnummer)));
    // Die Titel-Treffer des Inventur-Nenners: dieselben Einträge, gefiltert auf Nummern mit Registerereignis.
    const subsetTitleMatches = legacyTitleMatches.filter((entry) => subsetNumbers.has(glKey(entry.register.gliederungsnummer)));
    const subsetFigures = coverage(subsetMatches);
    const fullFigures = coverage(fullMatches);
    const corrected = (figures: CoverageFigures, list: typeof legacyTitleMatches): { found: number; rate: number } => {
      const found = figures.legacy.found - rejected(list);
      return { found, rate: figures.considered === 0 ? 0 : Math.round((found / figures.considered) * 10_000) / 10_000 };
    };
    const titleMatchReview: RegisterResult['titleMatchReview'] = {
      reviewed: legacyTitleMatches.filter((entry) => reviewFor.has(glKey(entry.register.gliederungsnummer))).length,
      unreviewed: legacyTitleMatches.filter((entry) => !reviewFor.has(glKey(entry.register.gliederungsnummer))).map((entry) => entry.register.gliederungsnummer),
      verdicts: { ledgerSubset: tally(subsetTitleMatches), fullRegister: tally(legacyTitleMatches) },
      legacyCorrected: { ledgerSubset: corrected(subsetFigures, subsetTitleMatches), fullRegister: corrected(fullFigures, legacyTitleMatches) },
    };
    const asOf = ledger.sources.find((entry) => entry.id === source)?.asOf;
    registers.push({
      source,
      area,
      ...(asOf ? { asOf } : {}),
      ...(reported ? { reported: { registerNumbers: reported.registerNumbers, found: reported.found, coverage: reported.coverage, excluded: reported.excludedAmendingOrAgreement } } : {}),
      ledgerSubset: {
        entries: subset.length,
        excluded: subsetMatches.filter((match) => match.exclusion).length,
        figures: subsetFigures,
        foreignTitle: {
          total: subset.filter((record) => record.foreignTitle).length,
          excluded: subsetMatches.filter((match, position) => subset[position]!.foreignTitle && match.exclusion).length,
          excludedButFoundByNumber: subsetMatches.filter((match, position) => subset[position]!.foreignTitle && match.exclusion && match.tier === 'gl').length,
          numbers: subset.filter((record) => record.foreignTitle).map((record) => record.gliederungsnummer),
        },
        notInRegister: subset.filter((record) => !fullNumbers.has(glKey(record.gliederungsnummer))).map((record) => record.gliederungsnummer),
      },
      fullRegister: {
        entries: full.length,
        withoutEvents: full.filter((record) => !record.inLedger).length,
        excluded: fullMatches.filter((match) => match.exclusion).length,
        figures: fullFigures,
        figuresWithoutEvents: coverage(fullMatches.filter((match) => !match.record.inLedger)),
      },
      exclusions: { ledgerSubset: exclusionFigures(subsetMatches), fullRegister: exclusionFigures(fullMatches) },
      legacyTitleMatches,
      strictMissing,
      matchedOutcomes,
      titleMatchReview,
    });
  }
  return {
    schemaVersion: 'juris-sh-register-crosscheck/1',
    generatedFrom: ['data/imports/juris-sh/events/ledger.json', 'data/audits/juris-sh/corpus-inventory.json', `${DISCOVERY_CACHE_DIR}/raw (Register-PDF, SHA-256 laut EVENT_SOURCES)`, `${CACHE_DIR} (PDF-Köpfe)`, MANUAL_REVIEW],
    documents: { enumerated: documents.length, withHeader: headers.size },
    registers,
    manualReview,
  };
}

/* ------------------------------------------------------------------------------------ Bericht */

const pct = (value: number): string => `${(value * 100).toFixed(1)} %`;
const cell = (value: string | undefined): string => (value ?? '–').replace(/\|/gu, '/').replace(/\s+/gu, ' ');

export function renderReport(report: CrosscheckReport): string {
  const lines: string[] = [];
  lines.push('# Registerabgleich juris SH – unabhängige Nachrechnung');
  lines.push('');
  lines.push('Erzeugt von `node packages/importers/juris-sh/src/audit/register-crosscheck-run.ts --write` (netzfrei). Prüft die');
  lines.push('Readiness-Kennzahl `zweite-quelle` der Inventur (`CORPUS_INVENTORY.md` §3). **Die Schwelle ist ein Prüfindikator,');
  lines.push('kein Ziel**; hier wird nichts auf sie hin optimiert, und es werden keine neuen Ausschlüsse eingeführt.');
  lines.push('');
  lines.push(`Enumerierte juris-Dokumente: ${report.documents.enumerated}, davon mit gelesenem PDF-Kopf ${report.documents.withHeader}.`);
  lines.push('');
  lines.push('Stufen: `gl` Gliederungsnummer (VwV-Köpfe mit mehreren Nummern werden geteilt) · `gl-variant` Nummer bis auf');
  lines.push('führende Nullen · `fundstelle` Blatt/Jahrgang/Seite **und** Ausfertigungsdatum gleich · `title-date` Titelanfang **und**');
  lines.push('Datum gleich · `gl-amendment-only` Nummer nur an Änderungsakten (Stammfassung nicht belegt) · `title-only` nur Titelanfang (Altregel) · `none`. „Streng“ = gl + gl-variant + fundstelle + title-date.');
  lines.push('');
  for (const register of report.registers) {
    const subset = register.ledgerSubset.figures;
    const full = register.fullRegister.figures;
    lines.push(`## ${register.source} (${register.area}, Stand ${register.asOf ?? '?'})`);
    lines.push('');
    lines.push('| Kennzahl | Nenner der Inventur (nur Einträge mit Registerereignis) | voller Registerbestand |');
    lines.push('| --- | --- | --- |');
    if (register.reported) lines.push(`| Inventur gemeldet | ${register.reported.found}/${register.reported.registerNumbers} = ${pct(register.reported.coverage)} | – |`);
    lines.push(`| Einträge / ausgeschlossen | ${register.ledgerSubset.entries} / ${register.ledgerSubset.excluded} | ${register.fullRegister.entries} / ${register.fullRegister.excluded} (davon ohne Ereignis ${register.fullRegister.withoutEvents}) |`);
    lines.push(`| Altregel nachgerechnet (Nummer ungeteilt oder Titelanfang) | ${subset.legacy.found}/${subset.considered} = ${pct(subset.legacy.rate)} | ${full.legacy.found}/${full.considered} = ${pct(full.legacy.rate)} |`);
    lines.push(`| davon allein über den Titelanfang | ${subset.legacyTitleOnly} | ${full.legacyTitleOnly} |`);
    lines.push(`| Nummer in irgendeinem juris-Dokument (gl + gl-amendment-only) | ${subset.glRaw.found} = ${pct(subset.glRaw.rate)} | ${full.glRaw.found} = ${pct(full.glRaw.rate)} |`);
    lines.push(`| **nur Gliederungsnummer (gl, ohne reine Änderungsakt-Treffer)** | **${subset.idOnly.found}/${subset.considered} = ${pct(subset.idOnly.rate)}** | **${full.idOnly.found}/${full.considered} = ${pct(full.idOnly.rate)}** |`);
    lines.push(`| stabile Kennung (gl + gl-variant + fundstelle) | ${subset.stableId.found} = ${pct(subset.stableId.rate)} | ${full.stableId.found} = ${pct(full.stableId.rate)} |`);
    lines.push(`| streng (stabile Kennung + title-date) | ${subset.strict.found} = ${pct(subset.strict.rate)} | ${full.strict.found} = ${pct(full.strict.rate)} |`);
    lines.push(`| Nenner-Titel aus Änderungsbefehl (fremder Titel) / davon ausgeschlossen / davon per Nummer in juris | ${register.ledgerSubset.foreignTitle.total} / ${register.ledgerSubset.foreignTitle.excluded} / ${register.ledgerSubset.foreignTitle.excludedButFoundByNumber} | – |`);
    lines.push(`| Nenner-Nummern ohne eigenen Registerkopf | ${register.ledgerSubset.notInRegister.length}${register.ledgerSubset.notInRegister.length > 0 ? ` (${register.ledgerSubset.notInRegister.join(', ')})` : ''} | – |`);
    lines.push(`| je Stufe | ${Object.entries(subset.byTier).map(([tier, count]) => `${tier} ${count}`).join(' · ')} | ${Object.entries(full.byTier).map(([tier, count]) => `${tier} ${count}`).join(' · ')} |`);
    const noEvents = register.fullRegister.figuresWithoutEvents;
    lines.push(`| nur Einträge ohne Registerereignis: gl / streng | – | ${noEvents.idOnly.found}/${noEvents.considered} = ${pct(noEvents.idOnly.rate)} / ${pct(noEvents.strict.rate)} |`);
    lines.push('');
    lines.push('**Ausschlüsse je Kategorie (voller Registerbestand).** Gegenbeispiel = ausgeschlossen, obwohl juris ein Dokument mit derselben Nummer (oder Fundstelle + Datum) führt.');
    lines.push('');
    lines.push('| Kategorie | Einträge | Gegenbeispiele | ohne jedes Merkmal |');
    lines.push('| --- | --- | --- | --- |');
    for (const entry of register.exclusions.fullRegister) lines.push(`| ${entry.category} | ${entry.entries} | ${entry.withOwnJurisDocument} | ${entry.withoutAnyMatch} |`);
    lines.push('');
    const examples = register.exclusions.fullRegister.flatMap((entry) => entry.examples.map((example) => ({ category: entry.category, ...example })));
    if (examples.length > 0) {
      lines.push(`Gegenbeispiele: ${examples.map((example) => `${example.gliederungsnummer} (${example.category})`).join(', ')}.`);
      lines.push('');
    }
    const review = register.titleMatchReview;
    lines.push(`**Handprüfung der Titel-Treffer:** ${review.reviewed}/${register.legacyTitleMatches.length} geprüft${review.unreviewed.length > 0 ? ` (ungeprüft: ${review.unreviewed.join(', ')})` : ''}. Urteile im Inventur-Nenner: ${Object.entries(review.verdicts.ledgerSubset).map(([key, value]) => `${key} ${value}`).join(' · ')}; im vollen Bestand: ${Object.entries(review.verdicts.fullRegister).map(([key, value]) => `${key} ${value}`).join(' · ')}.`);
    lines.push('');
    lines.push(`**Altregel nach Handprüfung** (Titel-Treffer „andere Norm“/„andere Fassung“ abgezogen): Inventur-Nenner ${review.legacyCorrected.ledgerSubset.found}/${subset.considered} = ${pct(review.legacyCorrected.ledgerSubset.rate)} · voller Bestand ${review.legacyCorrected.fullRegister.found}/${full.considered} = ${pct(review.legacyCorrected.fullRegister.rate)}.`);
    lines.push('');
    lines.push(`**Titel-Treffer der Altregel ohne Nummerntreffer: ${register.legacyTitleMatches.length}** (automatische Einordnung: ${Object.entries(register.legacyTitleMatches.reduce<Record<string, number>>((acc, entry) => ({ ...acc, [entry.assessment]: (acc[entry.assessment] ?? 0) + 1 }), {})).map(([key, value]) => `${key} ${value}`).join(' · ')}).`);
    lines.push('');
    lines.push(`**Streng nicht gefunden: ${register.strictMissing.length}** (none ${register.strictMissing.filter((entry) => entry.tier === 'none').length}, title-only ${register.strictMissing.filter((entry) => entry.tier === 'title-only').length}, gl-amendment-only ${register.strictMissing.filter((entry) => entry.tier === 'gl-amendment-only').length}); Ausgänge der streng zugeordneten Dokumente: ${Object.entries(register.matchedOutcomes).map(([key, value]) => `${key} ${value}`).join(' · ')}.`);
    lines.push('');
  }
  const manual = report.manualReview;
  if (manual.length > 0) {
    for (const kind of ['false-positive-check', 'false-negative-check'] as const) {
      const own = manual.filter((entry) => entry.kind === kind);
      if (own.length === 0) continue;
      const verdicts = own.reduce<Record<string, number>>((acc, entry) => ({ ...acc, [entry.verdict]: (acc[entry.verdict] ?? 0) + 1 }), {});
      lines.push(`## Handprüfung: ${kind === 'false-positive-check' ? 'Titel-only-Treffer (Falsch-positiv-Stichprobe)' : 'als fehlend gemeldete Einträge (Falsch-negativ-Stichprobe)'} – ${own.length} Fälle`);
      lines.push('');
      lines.push(`Urteile: ${Object.entries(verdicts).map(([key, value]) => `${key} ${value}`).join(' · ')}`);
      lines.push('');
      const label = (entry: ManualVerdict): string => `${entry.source === 'gvobl-systematische-uebersicht' ? 'GVOBl.' : 'Amtsbl.'} ${entry.gliederungsnummer}`;
      for (const verdict of Object.keys(verdicts)) {
        const cases = own.filter((entry) => entry.verdict === verdict);
        // Seltene Urteile mit Begründung, häufige nur als Nummernliste; Begründungen je Fall: manual-review.json.
        if (cases.length <= 3) for (const entry of cases) lines.push(`- ${verdict}: ${label(entry)} – ${cell(entry.reason)}`);
        else lines.push(`- ${verdict} (${cases.length}): ${cases.map(label).join(', ')}`);
      }
      lines.push('');
    }
  }
  lines.push('Einzelfälle (alle Titel-Treffer, alle streng fehlenden Einträge mit nächstem juris-Titel): `register-crosscheck.json`.');
  lines.push('Einordnung und Empfehlung zur Readiness: `docs/NSH_SOURCE_RIGHTS_AND_PROVENANCE.md`, Abschnitt „Registerabgleich“.');
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
  const write = process.argv.includes('--write');
  const report = await runRegisterCrosscheck(root, (line) => console.error(line));
  for (const register of report.registers) {
    const full = register.fullRegister.figures;
    const subset = register.ledgerSubset.figures;
    console.log(`${register.source}: Inventur-Nenner legacy ${pct(subset.legacy.rate)}, gl ${pct(subset.idOnly.rate)}, streng ${pct(subset.strict.rate)} | voller Bestand legacy ${pct(full.legacy.rate)}, gl ${pct(full.idOnly.rate)}, streng ${pct(full.strict.rate)}`);
  }
  if (!write) return;
  await mkdir(join(root, OUTPUT_DIR), { recursive: true });
  await writeFile(join(root, OUTPUT_JSON), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(root, OUTPUT_MD), renderReport(report));
  console.log(`geschrieben: ${OUTPUT_JSON}, ${OUTPUT_MD}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

