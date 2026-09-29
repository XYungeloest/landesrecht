/**
 * `sources:intake` (docs/MAINTENANCE.md): wertet die manuelle Source-Inbox `imports/` aus und orchestriert die bestehenden
 * Bausteine – Quelleninventar (`inventory/scan.ts`), Akquisitionsliste und Vollständigkeit (`completeness/`), Ledger und
 * Verkündungen (nur lesend). Kein eigener Importer, keine zweite Datenquelle, keine Websuche, kein Löschen oder
 * Verschieben in der Inbox, keine Rohquelle im Git.
 *
 * Standard ist Dry-run; der Bericht `data/audits/source-intake/latest.json` beschreibt den Stand der Inbox gegenüber dem
 * Repository (ohne Zeitstempel – identische Läufe sind byteidentisch). `--write` führt nur sichere Schritte aus:
 *  - Inventar schreiben, wenn jede neue Landesdatei eindeutig einer Lücke zugeordnet ist (`matched`);
 *  - Queue-Eintrag `open` → `candidate-found` für eindeutige Zuordnungen;
 *  - `candidate-found` → `resolved`, sobald die Quelle inventarisiert, von einer Verkündung oder einem Ledger-Ereignis
 *    belegt und die Lücke im Vollständigkeitsaudit geschlossen ist;
 *  - danach `completeness --write` (Queue, Dokus, Status).
 * Nie automatisch: schwache oder mehrdeutige Zuordnungen, neue unbekannte Quellen, widersprüchliche Landeszuordnung,
 * mögliche Baseline-Evidenz (`freeze-review-candidate`, eingefrorene Länder werden nie verändert).
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

import { readJsonFile, writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { JURISDICTION_IDS, SIMULATION_BASELINE_DATE, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';

import { readBaselineLockFile } from '../common/baseline-locks.ts';
import { ARCHIVE_CONTAINER, ARCHIVE_DIR, ARCHIVE_FOLDERS, IGNORED_ARCHIVE_DIRECTORIES, IGNORED_ARCHIVE_ENTRIES, INVENTORY_PATH, NON_SIMULATION_ARCHIVE_FOLDERS } from '../common/paths.ts';
import { runCompleteness } from '../completeness/command.ts';
import { completenessPath, parseCompletenessFile, type CompletenessFile, type SourceGap } from '../completeness/schema.ts';
import { detectFacts, type DetectedFacts } from '../inventory/detect.ts';
import { extractDocx, extractPdf, extractPlainText, mediaTypeFor } from '../inventory/extract.ts';
import { scanArchive, type SourceInventory } from '../inventory/scan.ts';
import { writeInventoryFiles } from '../inventory/report.ts';
import { ledgerPath, type LedgerEvent, type LedgerFile } from '../ledger/sync.ts';
import { matchGap, rankMatches, titleOverlap, type GapMatch, type QueueGap } from './match.ts';

export const INTAKE_REPORT_PATH = 'data/audits/source-intake/latest.json';
export const INTAKE_REPORT_SCHEMA = 'landesrecht-source-intake/1';

export const INTAKE_RESULTS = ['matched', 'possible-match', 'new-untracked-source', 'already-known', 'irrelevant/non-simulation', 'needs-human-review'] as const;
export type IntakeResult = (typeof INTAKE_RESULTS)[number];

/** Länder, deren Sim-Quellen die Inbox bedient (Ost wird ausschließlich in OstRecht gepflegt). */
const SIM_JURISDICTIONS: readonly JurisdictionId[] = ['west', 'nsh', 'baywue'];

export interface FreezeReviewCandidate {
  jurisdiction: JurisdictionId;
  source: { path: string; sha256: string; title: string | null; date: string | null };
  newEvidence: string;
  currentExclusion: string;
  expectedBenefit: string;
  freezeCommit: string | null;
  events: string[];
  norms: string[];
}

export interface IntakeFileReport {
  path: string;
  sha256: string;
  jurisdiction: JurisdictionId | null;
  mediaType: string;
  documentType: string | null;
  result: IntakeResult;
  confidence: 'exact' | 'high' | 'medium' | 'low' | 'n/a';
  queueMatch?: GapMatch;
  alternatives?: GapMatch[];
  events: string[];
  norms: string[];
  pipeline: string;
  freezeAffected: boolean;
  note?: string;
  freezeReviewCandidate?: FreezeReviewCandidate;
}

export interface IntakeAction {
  kind: 'inventory' | 'candidate-found' | 'resolve';
  jurisdiction?: JurisdictionId;
  gapId?: string;
  sha256?: string;
  detail: string;
}

export interface IntakeReport {
  schemaVersion: typeof INTAKE_REPORT_SCHEMA;
  inbox: { dir: string; files: number; fingerprint: string };
  totals: Record<string, number>;
  queue: Record<string, number>;
  files: IntakeFileReport[];
  freezeReviewCandidates: FreezeReviewCandidate[];
  /** Sichere Schritte, die `--write` ausführen würde (nach einem `--write`-Lauf leer). */
  pendingActions: IntakeAction[];
}

export interface IntakeOptions {
  write: boolean;
  json?: boolean;
  /** Datum für `foundAt`/`resolvedAt` (Standard heute, ISO). */
  today?: string;
}

interface InboxFile {
  relativePath: string;
  absolute: string;
  area: 'jurisdiction' | 'non-simulation' | 'container' | 'unassigned';
  jurisdiction?: JurisdictionId;
}

/** Alle Dateien der Inbox (sortiert), mit Bereich: Landesordner, `bund/` (keine Sim-Quelle), Container, nicht zugeordnet. */
export async function listInbox(root: string): Promise<InboxFile[]> {
  const inbox = join(root, ARCHIVE_DIR);
  let top: import('node:fs').Dirent[];
  try {
    top = await readdir(inbox, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: InboxFile[] = [];
  const walk = async (directory: string, area: InboxFile['area'], jurisdiction?: JurisdictionId): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (IGNORED_ARCHIVE_ENTRIES.has(entry.name) || entry.name.startsWith('._')) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_ARCHIVE_DIRECTORIES.has(entry.name)) await walk(absolute, area, jurisdiction);
      } else if (entry.isFile()) files.push({ relativePath: relative(inbox, absolute).normalize('NFC'), absolute, area, ...(jurisdiction ? { jurisdiction } : {}) });
    }
  };
  for (const entry of top) {
    if (IGNORED_ARCHIVE_ENTRIES.has(entry.name) || entry.name.startsWith('._')) continue;
    const absolute = join(inbox, entry.name);
    if (entry.isFile()) {
      files.push({ relativePath: entry.name.normalize('NFC'), absolute, area: entry.name === ARCHIVE_CONTAINER ? 'container' : 'unassigned' });
      continue;
    }
    if (!entry.isDirectory() || IGNORED_ARCHIVE_DIRECTORIES.has(entry.name)) continue;
    if (NON_SIMULATION_ARCHIVE_FOLDERS.has(entry.name)) await walk(absolute, 'non-simulation');
    else {
      const jurisdiction = ARCHIVE_FOLDERS[entry.name.normalize('NFC')] ?? ARCHIVE_FOLDERS[entry.name];
      await walk(absolute, jurisdiction ? 'jurisdiction' : 'unassigned', jurisdiction);
    }
  }
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'de'));
}

interface RepositoryState {
  inventory: SourceInventory | undefined;
  inventoryBySha: Map<string, SourceInventory['sources'][number]>;
  completeness: Map<JurisdictionId, CompletenessFile>;
  ledgers: Map<JurisdictionId, LedgerEvent[]>;
  /** SHA-256 → Verkündungs-Slugs und Ledger-Ereignisse, die die Datei als Beleg führen. */
  publicationsBySha: Map<string, string[]>;
  eventsBySha: Map<string, string[]>;
  freezeCommits: Map<JurisdictionId, string>;
}

async function loadState(root: string): Promise<RepositoryState> {
  const inventory = await readJsonFile<SourceInventory>(join(root, INVENTORY_PATH));
  const completeness = new Map<JurisdictionId, CompletenessFile>();
  const ledgers = new Map<JurisdictionId, LedgerEvent[]>();
  const publicationsBySha = new Map<string, string[]>();
  const eventsBySha = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, sha: unknown, id: string): void => {
    if (typeof sha !== 'string') return;
    const list = map.get(sha) ?? [];
    if (!list.includes(id)) list.push(id);
    map.set(sha, list);
  };
  for (const jurisdiction of SIM_JURISDICTIONS) {
    const raw = await readJsonFile<unknown>(join(root, completenessPath(jurisdiction)));
    if (raw !== undefined) completeness.set(jurisdiction, parseCompletenessFile(raw, completenessPath(jurisdiction)));
    const ledger = await readJsonFile<LedgerFile>(join(root, ledgerPath(jurisdiction)));
    const events = ledger?.events ?? [];
    ledgers.set(jurisdiction, events);
    for (const event of events) {
      add(eventsBySha, (event.publication as { sha256?: unknown } | null | undefined)?.sha256, event.id);
      for (const sha of Array.isArray(event.evidence) ? event.evidence : []) add(eventsBySha, sha, event.id);
    }
    let names: string[] = [];
    try {
      names = (await readdir(join(root, 'content/publications', jurisdiction))).filter((name) => name.endsWith('.json')).sort();
    } catch {
      names = [];
    }
    for (const name of names) {
      const publication = JSON.parse(await readFile(join(root, 'content/publications', jurisdiction, name), 'utf8')) as { slug: string; sourceReferences?: Array<{ sha256?: string }> };
      for (const reference of publication.sourceReferences ?? []) add(publicationsBySha, reference.sha256, publication.slug);
    }
  }
  const locks = await readBaselineLockFile(root);
  const freezeCommits = new Map<JurisdictionId, string>();
  for (const jurisdiction of JURISDICTION_IDS) {
    const lock = locks?.jurisdictions[jurisdiction];
    if (lock?.freeze) freezeCommits.set(jurisdiction, lock.commit);
  }
  return { inventory, inventoryBySha: new Map((inventory?.sources ?? []).map((source) => [source.sha256, source])), completeness, ledgers, publicationsBySha, eventsBySha, freezeCommits };
}

function queueGaps(state: RepositoryState): QueueGap[] {
  const gaps: QueueGap[] = [];
  for (const [jurisdiction, file] of state.completeness) for (const gap of file.sourceGaps) if (gap.acquisition) gaps.push({ jurisdiction, gap });
  return gaps;
}

async function extractFor(file: InboxFile, mediaType: string, bytes: Uint8Array): Promise<{ text: string; textLayer: string }> {
  if (mediaType === 'application/pdf') {
    const extracted = await extractPdf(file.absolute);
    return { text: extracted.layout, textLayer: extracted.textLayer };
  }
  if (mediaType.endsWith('wordprocessingml.document')) return { text: (await extractDocx(file.absolute)).layout, textLayer: 'not-applicable' };
  if (mediaType.startsWith('text/')) return { text: (await extractPlainText(bytes)).layout, textLayer: 'not-applicable' };
  return { text: '', textLayer: 'none' };
}

const PIPELINE = {
  known: 'keine (Inhalt bereits inventarisiert)',
  matched: 'inventory --write → Evidenzprüfung (sources.json) → Verkündung/Ledger → completeness --write; --write setzt candidate-found',
  possible: 'Human Review: Zuordnung bestätigen oder verwerfen; keine automatische Änderung',
  untracked: 'Human Review: Evidenzprüfung (sources.json), ggf. neue Lücke oder Ledger-Ereignis; danach inventory --write',
  freeze: 'keine automatische Änderung: Human Review, ggf. Freeze-Ausnahme kind "added" zum Freeze-Commit (docs/MAINTENANCE.md)',
  review: 'Human Review (Datei prüfen); keine OCR, keine automatische Verarbeitung',
  none: 'keine',
} as const;

function gapFor(state: RepositoryState, match: GapMatch): SourceGap | undefined {
  return state.completeness.get(match.jurisdiction)?.sourceGaps.find((gap) => gap.id === match.gapId);
}

/** Mögliche Baseline-Evidenz: Dokument vor dem Ausgangsrechtsstand oder Titel einer aus dem Freeze ausgeschlossenen Zielnorm. */
function freezeCandidate(state: RepositoryState, jurisdiction: JurisdictionId, file: { path: string; sha256: string }, facts: DetectedFacts): FreezeReviewCandidate | undefined {
  const date = facts.documentDate ?? facts.issueDate ?? null;
  const events: string[] = [];
  const norms = new Set<string>();
  for (const event of state.ledgers.get(jurisdiction) ?? []) {
    if (event.status !== 'blocked' || event.reasonCode !== 'missing-baseline-target') continue;
    for (const target of event.targets ?? []) {
      if (titleOverlap(target.title, facts.title) >= 0.5) {
        events.push(event.id);
        if (target.slug) norms.add(target.slug);
      }
    }
  }
  const preBaseline = date !== null && date <= SIMULATION_BASELINE_DATE;
  if (!preBaseline && events.length === 0) return undefined;
  return {
    jurisdiction,
    source: { path: file.path, sha256: file.sha256, title: facts.title ?? null, date },
    newEvidence: preBaseline ? `Dokumentdatum ${date} liegt nicht nach dem Ausgangsrechtsstand ${SIMULATION_BASELINE_DATE}` : 'Titel entspricht einer aus dem eingefrorenen Bestand ausgeschlossenen Zielnorm',
    currentExclusion: events.length > 0 ? `missing-baseline-target (${[...norms].join(', ') || 'Ziel ohne Slug'}); Zielnorm nicht im eingefrorenen Ausgangsrechtsstand` : 'Ausgangsrechtsstand eingefroren; Stichtagsfassungen nur über Freeze-Ausnahme',
    expectedBenefit: events.length > 0 ? `könnte ${events.length} gesperrte(s) Sim-Ereignis(se) entsperren` : 'mögliche Stichtagsevidenz; Nutzen erst im Human Review bestimmbar',
    freezeCommit: state.freezeCommits.get(jurisdiction) ?? null,
    events,
    norms: [...norms],
  };
}

function blocksFreeze(state: RepositoryState, jurisdiction: JurisdictionId, gap: SourceGap | undefined): boolean {
  if (!gap) return false;
  const ids = new Set(gap.blocks.events);
  return (state.ledgers.get(jurisdiction) ?? []).some((event) => ids.has(event.id) && event.reasonCode === 'missing-baseline-target');
}

async function classify(root: string, state: RepositoryState): Promise<IntakeReport> {
  const inbox = await listInbox(root);
  const gaps = queueGaps(state);
  const files: IntakeFileReport[] = [];
  const fingerprint = createHash('sha256');
  for (const file of inbox) {
    const bytes = new Uint8Array(await readFile(file.absolute));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    fingerprint.update(`${file.relativePath}\u0000${sha256}\n`);
    const mediaType = mediaTypeFor(file.relativePath, bytes);
    const base = { path: file.relativePath, sha256, jurisdiction: file.jurisdiction ?? null, mediaType, events: [] as string[], norms: [] as string[] };
    if (file.area === 'non-simulation' || file.area === 'container') {
      files.push({ ...base, documentType: null, result: 'irrelevant/non-simulation', confidence: 'n/a', pipeline: PIPELINE.none, freezeAffected: false, note: file.area === 'container' ? 'Container des Archivs (nur Abgleich mit dem Ordnerinhalt)' : 'Bundesportal-Material (imports/bund/), keine Sim-Quelle' });
      continue;
    }
    if (file.area === 'unassigned' || !file.jurisdiction) {
      files.push({ ...base, documentType: null, result: 'needs-human-review', confidence: 'n/a', pipeline: PIPELINE.review, freezeAffected: false, note: 'keinem Landesordner zugeordnet (imports/west|nsh|baywü/)' });
      continue;
    }
    const known = state.inventoryBySha.get(sha256);
    if (known) {
      const candidateOf = gaps.find((entry) => entry.gap.acquisition?.candidate?.sha256 === sha256 || entry.gap.acquisition?.resolution?.resolvedBySha256 === sha256);
      files.push({
        ...base,
        documentType: known.detected.documentType,
        result: 'already-known',
        confidence: 'exact',
        ...(candidateOf ? { queueMatch: { jurisdiction: candidateOf.jurisdiction, gapId: candidateOf.gap.id, priority: candidateOf.gap.acquisition!.priority, status: candidateOf.gap.acquisition!.status, level: 'exact' as const, signals: ['hash' as const] } } : {}),
        events: state.eventsBySha.get(sha256) ?? [],
        norms: [],
        pipeline: PIPELINE.known,
        freezeAffected: false,
        ...(known.paths.includes(file.relativePath) ? {} : { note: `Inhalt bekannt unter ${known.paths[0]}` }),
      });
      continue;
    }
    if (mediaType === 'application/octet-stream') {
      files.push({ ...base, documentType: null, result: 'needs-human-review', confidence: 'n/a', pipeline: PIPELINE.review, freezeAffected: false, note: 'Dateityp nicht unterstützt (PDF, DOCX, TXT, MD, HTML)' });
      continue;
    }
    const extracted = await extractFor(file, mediaType, bytes);
    const facts = detectFacts(extracted.text, file.relativePath);
    if (extracted.textLayer === 'none' || extracted.textLayer === 'sparse') {
      files.push({ ...base, documentType: facts.documentType, result: 'needs-human-review', confidence: 'n/a', pipeline: PIPELINE.review, freezeAffected: false, note: `keine auswertbare Textebene (${extracted.textLayer}); keine OCR` });
      continue;
    }
    const input = { sha256, fileName: basename(file.relativePath), facts, text: extracted.text.slice(0, 20_000) };
    const matches = rankMatches(gaps.filter((entry) => entry.gap.acquisition && (entry.gap.acquisition.status === 'open' || entry.gap.acquisition.status === 'candidate-found')).map((entry) => matchGap(input, entry)).filter((match): match is GapMatch => match !== undefined));
    const firm = matches.filter((match) => match.level !== 'weak');
    const report: IntakeFileReport = { ...base, documentType: facts.documentType, result: 'new-untracked-source', confidence: 'n/a', events: [], norms: [], pipeline: PIPELINE.untracked, freezeAffected: false };
    if (firm.length > 1) {
      Object.assign(report, { result: 'needs-human-review', confidence: 'medium', alternatives: firm, pipeline: PIPELINE.review, note: 'mehrdeutig: mehrere Lücken passen eindeutig' });
    } else if (firm.length === 1 && firm[0]!.jurisdiction !== file.jurisdiction) {
      Object.assign(report, { result: 'needs-human-review', confidence: 'medium', queueMatch: firm[0], pipeline: PIPELINE.review, note: `widersprüchlich: Datei liegt im Ordner ${file.jurisdiction}, passt aber zu ${firm[0]!.jurisdiction}` });
    } else if (firm.length === 1) {
      const gap = gapFor(state, firm[0]!);
      Object.assign(report, { result: 'matched', confidence: firm[0]!.level === 'exact' ? 'exact' : 'high', queueMatch: firm[0], events: gap?.blocks.events ?? [], norms: gap?.blocks.norms ?? [], pipeline: PIPELINE.matched, freezeAffected: blocksFreeze(state, file.jurisdiction, gap), ...(matches.length > 1 ? { alternatives: matches.slice(1) } : {}) });
    } else if (matches.length > 0) {
      const gap = gapFor(state, matches[0]!);
      Object.assign(report, { result: 'possible-match', confidence: matches[0]!.signals.length >= 2 ? 'medium' : 'low', queueMatch: matches[0], events: gap?.blocks.events ?? [], norms: gap?.blocks.norms ?? [], pipeline: PIPELINE.possible, freezeAffected: blocksFreeze(state, file.jurisdiction, gap), ...(matches.length > 1 ? { alternatives: matches.slice(1) } : {}) });
    }
    if (report.result === 'new-untracked-source' || report.result === 'possible-match') {
      // Nur gegen eingefrorene Länder: mögliche Baseline-Evidenz wird nie importiert, sondern zur Freeze-Prüfung gemeldet.
      const candidate = state.freezeCommits.has(file.jurisdiction) ? freezeCandidate(state, file.jurisdiction, { path: file.relativePath, sha256 }, facts) : undefined;
      if (candidate) Object.assign(report, { result: 'needs-human-review', pipeline: PIPELINE.freeze, freezeAffected: true, freezeReviewCandidate: candidate, events: candidate.events, norms: candidate.norms, note: 'freeze-review-candidate' });
    }
    files.push(report);
  }

  const pendingActions = planActions(state, files);
  const totals: Record<string, number> = {};
  for (const result of INTAKE_RESULTS) totals[result] = files.filter((file) => file.result === result).length;
  const queue: Record<string, number> = { all: gaps.length };
  for (const entry of gaps) queue[entry.gap.acquisition!.status] = (queue[entry.gap.acquisition!.status] ?? 0) + 1;
  return {
    schemaVersion: INTAKE_REPORT_SCHEMA,
    inbox: { dir: ARCHIVE_DIR, files: inbox.length, fingerprint: fingerprint.digest('hex') },
    totals,
    queue: Object.fromEntries(Object.entries(queue).sort(([a], [b]) => a.localeCompare(b))),
    files,
    freezeReviewCandidates: files.flatMap((file) => (file.freezeReviewCandidate ? [file.freezeReviewCandidate] : [])),
    pendingActions,
  };
}

/** Sichere Schritte aus dem Befund (ausgeführt von `applyActions`). */
function planActions(state: RepositoryState, files: readonly IntakeFileReport[]): IntakeAction[] {
  const actions: IntakeAction[] = [];
  const newLandFiles = files.filter((file) => file.jurisdiction && file.result !== 'already-known' && file.result !== 'irrelevant/non-simulation');
  const matched = files.filter((file) => file.result === 'matched');
  if (matched.length > 0 && newLandFiles.every((file) => file.result === 'matched')) actions.push({ kind: 'inventory', detail: `${matched.length} eindeutig zugeordnete Datei(en) ins Quelleninventar (${INVENTORY_PATH})` });
  for (const file of matched) {
    const gap = gapFor(state, file.queueMatch!);
    if (gap?.acquisition?.status === 'open') actions.push({ kind: 'candidate-found', jurisdiction: file.queueMatch!.jurisdiction, gapId: gap.id, sha256: file.sha256, detail: `${gap.id}: open → candidate-found (${file.path})` });
  }
  for (const [jurisdiction, completeness] of state.completeness) {
    for (const gap of completeness.sourceGaps) {
      const resolution = resolutionFor(state, completeness, gap);
      if (resolution) actions.push({ kind: 'resolve', jurisdiction, gapId: gap.id, sha256: gap.acquisition!.candidate!.sha256, detail: `${gap.id}: candidate-found → resolved (Verkündung ${resolution.publications.join(', ') || '–'}, Ereignisse ${resolution.events.join(', ') || '–'})` });
    }
  }
  return actions;
}

/** Auflösbar erst, wenn die Kandidatquelle inventarisiert, als Beleg verwendet und die Lücke im Audit geschlossen ist. */
function resolutionFor(state: RepositoryState, completeness: CompletenessFile, gap: SourceGap): { publications: string[]; events: string[] } | undefined {
  const candidate = gap.acquisition?.status === 'candidate-found' ? gap.acquisition.candidate : undefined;
  if (!candidate || !state.inventoryBySha.has(candidate.sha256)) return undefined;
  const publications = state.publicationsBySha.get(candidate.sha256) ?? [];
  const events = state.eventsBySha.get(candidate.sha256) ?? [];
  if (publications.length + events.length === 0) return undefined;
  if (gap.series !== undefined && !(completeness.series.find((entry) => entry.gazette === gap.series)?.presentIssues.includes(gap.issue!) ?? false)) return undefined;
  const ledger = new Map((state.ledgers.get(completeness.jurisdiction) ?? []).map((event) => [event.id, event]));
  const stillMissing = gap.blocks.events.some((id) => {
    const event = ledger.get(id);
    return event && (event.status === 'review' || event.status === 'blocked') && event.reasonCode === 'missing-source';
  });
  return stillMissing ? undefined : { publications, events };
}

/** Schreibt Kandidaten und Auflösungen in die Bewertungen (nur die betroffenen Einträge; Schlüsselfolge bleibt). */
async function applyActions(root: string, state: RepositoryState, actions: readonly IntakeAction[], today: string, inbox: Map<string, string>): Promise<string[]> {
  const done: string[] = [];
  if (actions.some((action) => action.kind === 'inventory')) {
    const inventory = await scanArchive(root);
    if (await writeInventoryFiles(root, inventory)) done.push(`Geschrieben: ${INVENTORY_PATH}`);
  }
  const touched = new Map<JurisdictionId, string>();
  for (const jurisdiction of SIM_JURISDICTIONS) {
    const own = actions.filter((action) => action.jurisdiction === jurisdiction && (action.kind === 'candidate-found' || action.kind === 'resolve'));
    if (own.length === 0) continue;
    const path = join(root, completenessPath(jurisdiction));
    const raw = JSON.parse(await readFile(path, 'utf8')) as { sourceGaps: Array<{ id: string; acquisition?: Record<string, unknown> }> };
    for (const action of own) {
      const gap = raw.sourceGaps.find((entry) => entry.id === action.gapId);
      if (!gap?.acquisition) continue;
      if (action.kind === 'candidate-found') {
        gap.acquisition = { ...gap.acquisition, status: 'candidate-found', candidate: { sha256: action.sha256!, path: inbox.get(action.sha256!) ?? '', foundAt: today } };
      } else {
        const completeness = state.completeness.get(jurisdiction)!;
        const parsed = completeness.sourceGaps.find((entry) => entry.id === action.gapId)!;
        const resolution = resolutionFor(state, completeness, parsed);
        if (!resolution) continue;
        gap.acquisition = { ...gap.acquisition, status: 'resolved', resolution: { resolvedBySha256: action.sha256!, resolvedAt: today, sourceInventoryId: action.sha256!, publications: resolution.publications, events: resolution.events } };
      }
      done.push(action.detail);
    }
    const text = `${JSON.stringify(raw, null, 2)}\n`;
    parseCompletenessFile(JSON.parse(text), completenessPath(jurisdiction));
    const previous = await readFile(path, 'utf8');
    if (await writeFileAtomic(path, text, { skipIfUnchanged: true })) touched.set(jurisdiction, previous);
  }
  if (touched.size > 0) {
    // Erst prüfen (Dry-run der Vollständigkeit samt Statusberechnung), dann schreiben; bei Widerspruch alles zurück.
    const lines: string[] = [];
    const sink = { print: (line: string) => lines.push(line), error: (line: string) => lines.push(line) };
    try {
      if ((await runCompleteness({ write: false, json: false }, root, sink)) !== 0) throw new Error(lines.join(' | '));
    } catch (error) {
      for (const [jurisdiction, previous] of touched) await writeFileAtomic(join(root, completenessPath(jurisdiction)), previous);
      throw new Error(`Vollständigkeitsprüfung nach Intake fehlgeschlagen, Bewertungen unverändert: ${(error as Error).message}`);
    }
    lines.length = 0;
    await runCompleteness({ write: true, json: false }, root, sink);
    done.push(...lines.filter((line) => line.startsWith('Geschrieben')));
  }
  return done;
}

export function renderIntakeLines(report: IntakeReport): string[] {
  const lines = [`Inbox ${report.inbox.dir}/: ${report.inbox.files} Datei(en) · ${INTAKE_RESULTS.map((result) => `${result} ${report.totals[result] ?? 0}`).join(' · ')}`];
  lines.push(`Queue: ${Object.entries(report.queue).map(([key, value]) => `${key} ${value}`).join(' · ')}`);
  for (const file of report.files) {
    if (file.result === 'already-known' && !file.queueMatch) continue;
    if (file.result === 'irrelevant/non-simulation') continue;
    lines.push(`- ${file.result.padEnd(20)} ${file.sha256.slice(0, 12)} ${file.jurisdiction ?? '–'} ${file.path}`);
    lines.push(`    Typ ${file.mediaType}${file.documentType ? ` / ${file.documentType}` : ''} · Confidence ${file.confidence}${file.queueMatch ? ` · Queue ${file.queueMatch.gapId} (${file.queueMatch.priority ?? '–'}, ${file.queueMatch.level}: ${file.queueMatch.signals.join('+')})` : ''}${file.freezeAffected ? ' · FREEZE betroffen' : ''}`);
    if (file.events.length + file.norms.length > 0) lines.push(`    betrifft ${[...file.events, ...file.norms].join(', ')}`);
    lines.push(`    → ${file.pipeline}${file.note ? ` (${file.note})` : ''}`);
  }
  for (const candidate of report.freezeReviewCandidates) lines.push(`freeze-review-candidate ${candidate.jurisdiction}: ${candidate.source.path} – ${candidate.newEvidence}; ${candidate.currentExclusion}; Freeze-Commit ${candidate.freezeCommit?.slice(0, 12) ?? '–'}`);
  if (report.pendingActions.length === 0) lines.push('Keine sicheren automatischen Schritte offen.');
  else for (const action of report.pendingActions) lines.push(`Aktion (${action.kind}): ${action.detail}`);
  return lines;
}

export async function runIntake(options: IntakeOptions, root: string, io: { print: (line: string) => void; error: (line: string) => void }): Promise<number> {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  let state = await loadState(root);
  let report = await classify(root, state);
  if (options.write && report.pendingActions.length > 0) {
    const inbox = new Map(report.files.map((file) => [file.sha256, file.path]));
    for (const line of await applyActions(root, state, report.pendingActions, today, inbox)) io.print(line);
    // Der Bericht beschreibt den Stand nach den Schritten: ein zweiter identischer Lauf ist byteidentisch.
    state = await loadState(root);
    report = await classify(root, state);
  }
  const text = `${JSON.stringify(report, null, 2)}\n`;
  const written = await writeFileAtomic(join(root, INTAKE_REPORT_PATH), text, { skipIfUnchanged: true });
  if (options.json) io.print(text.trimEnd());
  else for (const line of renderIntakeLines(report)) io.print(line);
  io.print(`${written ? 'Geschrieben' : 'Unverändert'}: ${INTAKE_REPORT_PATH}${options.write ? '' : ' · Dry-run: keine Daten geändert (--write führt die sicheren Schritte aus)'}`);
  return 0;
}
