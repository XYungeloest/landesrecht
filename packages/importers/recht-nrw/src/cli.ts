/**
 * CLI des RECHT.NRW-Imports (Aufruf über scripts/import-recht-nrw.ts). Dry-run ist überall Standard.
 *
 *   inspect  --url <url>                      Seite analysieren (LRGV oder LRMB, aus der Adresse)
 *   import   --url <url> [--write]            Importpfad LRGV oder LRMB (Einzelimport, Beispielarchiv)
 *   sample   [--area lrgv|lrmb] [--write]     Validierungskorpus eines Bereichs (Standard: lrgv)
 *   enumerate --area lrgv|lrmb [--write]      Vollständige Enumeration (Sitemaps + Suchindex) mit Abgleich
 *   bulk     --area lrgv|lrmb [--write] [--resume] [--limit n] [--only a,b] [--retry-failed] [--retry-review]
 *            [--regenerate-stale] [--refresh] [--offline] [--max-requests n] [--max-runtime 8h]
 *            [--max-bytes n] [--min-delay ms] [--archive staging|r2] [--r2-transport s3|wrangler]
 *            [--staging-dir dir] [--output-root dir]
 *   r2-sync  [--write] [--limit n] [--r2-transport s3|wrangler]   gestagte Rohquellen nach R2 (Rücklesung)
 *   coverage [--write]                        Coverage-Report (JSON + COVERAGE.md)
 *   review   [--area lrgv|lrmb] [--decide <id> --status <s> --reason <text> [--by <name>] [--override <id>] --write]
 *   reconstruction-queue [--write]            Rekonstruktionsqueue mit Priorisierungshilfe
 *   search-audit [--jurisdiction west] [--limit n]   Suchintegrität
 *   readiness [--json]                        READY / NOT READY mit Blockern
 *   audit                                     Manifest, Rohquellen, Inhalte, Reports, Rekonstruktionen, Queue,
 *                                             Slug-Registry, Enumeration und Coverage prüfen
 *
 * Gemeinsame Optionen: --offline (nur Cache), --refresh (kontrolliert neu abrufen), --cache-dir <pfad>,
 * --baseline <datum>, --json.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { loadNorm } from '@landesrecht/legal-core/lib/loader.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';

import { runBulkCommand, runCoverageCommand, runEnumerateCommand, runR2SyncCommand, runReadinessCommand, runReconstructionQueueCommand, runSearchAuditCommand } from './cli-bulk.ts';
import { TARGET_JURISDICTION } from './common/constants.ts';
import { collectCoverageInput, computeCoverage, coverageComparable, COVERAGE_PATH, type CoverageReport } from './common/coverage.ts';
import { readEnumeration } from './common/enumeration.ts';
import { loadImportEnvironment } from './common/environment.ts';
import { createRechtNrwFetcher, decodeHtml, DEFAULT_MIN_DELAY_MS, type RechtNrwFetcher } from './common/fetcher.ts';
import { isImportedStatus, RAW_ARCHIVE_DIR, readLrmbSampleCorpus, readManifest, readSampleCorpus, SOURCE_AREAS, type ManifestEntry, type SourceArea } from './common/manifest.ts';
import { decideReviewItem, readReviewQueue, REVIEW_ITEM_STATUSES, writeReviewShard, type ReviewDecision, type ReviewQueue } from './common/review-queue.ts';
import { readSlugRegistry } from './common/slug-registry.ts';
import { parseVersionUrl } from './common/source-identity.ts';
import { selectSourceVersionAtBaseline, type SourceVersionCandidate } from './common/version-selection.ts';
import { parseVersionPage } from './common/version-page.ts';
import { importRechtNrwNorm, type ImportResult } from './lrgv/pipeline.ts';
import { assessNormativity, classifyLrmbDocumentType } from './lrmb/classify.ts';
import { parseLrmbDocument } from './lrmb/parser.ts';
import { importRechtNrwLrmbDocument, type LrmbImportResult } from './lrmb/pipeline.ts';
import { readReconstructionRecipe } from './lrmb/reconstruction.ts';
import { parseChangeNote, parseDecreeFromTitle, parseValidityClauses } from './lrmb/text-metadata.ts';

export interface CliOptions {
  command: string;
  url?: string;
  area?: SourceArea;
  write: boolean;
  offline: boolean;
  refresh: boolean;
  cacheDir?: string;
  baseline: string;
  json: boolean;
  resume: boolean;
  limit?: number;
  only: string[];
  retryFailed: boolean;
  retryReview: boolean;
  regenerateStale: boolean;
  maxRequests?: number;
  maxRuntimeMs?: number;
  maxBytes?: number;
  minDelayMs?: number;
  archive?: 'staging' | 'r2';
  r2Transport?: 's3' | 'wrangler';
  stagingDir?: string;
  outputRoot?: string;
  decide?: string;
  status?: string;
  reason?: string;
  by?: string;
  override?: string;
  jurisdiction?: string;
}

/** „90s“, „15m“, „8h“, „2d“ oder Sekunden → Millisekunden. */
export function parseDuration(value: string | undefined): number {
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/u.exec((value ?? '').trim());
  if (!match) throw new Error(`Ungültige Dauer: ${value} (z. B. 90s, 15m, 8h)`);
  const amount = Number(match[1]);
  const factor = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] ?? 's'] ?? 1_000;
  return Math.round(amount * factor);
}

function positiveInteger(value: string | undefined, option: string): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 0 || String(parsed) !== (value ?? '').trim()) throw new Error(`${option} erwartet eine ganze Zahl ≥ 0`);
  return parsed;
}

export function parseCliArguments(argv: readonly string[]): CliOptions {
  const [command = 'help', ...rest] = argv;
  const options: CliOptions = { command, write: false, offline: false, refresh: false, baseline: SIMULATION_BASELINE_DATE, json: false, resume: false, only: [], retryFailed: false, retryReview: false, regenerateStale: false };
  const value = (index: number, name: string): string => {
    const next = rest[index];
    if (next === undefined || next.startsWith('--')) throw new Error(`${name} erwartet einen Wert`);
    return next;
  };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]!;
    const [flag, inline] = argument.includes('=') && argument.startsWith('--') ? [argument.slice(0, argument.indexOf('=')), argument.slice(argument.indexOf('=') + 1)] : [argument, undefined];
    const take = (): string => inline ?? value(++index, flag);
    switch (flag) {
      case '--write': options.write = true; break;
      case '--dry-run': options.write = false; break;
      case '--offline': options.offline = true; break;
      case '--refresh': options.refresh = true; break;
      case '--json': options.json = true; break;
      case '--resume': options.resume = true; break;
      case '--retry-failed': options.retryFailed = true; break;
      case '--retry-review': options.retryReview = true; break;
      case '--regenerate-stale': options.regenerateStale = true; break;
      case '--url': options.url = take(); break;
      case '--cache-dir': options.cacheDir = take(); break;
      case '--baseline': options.baseline = take(); break;
      case '--limit': options.limit = positiveInteger(take(), '--limit'); break;
      case '--only': options.only.push(...take().split(',').map((entry) => entry.trim()).filter(Boolean)); break;
      case '--max-requests': options.maxRequests = positiveInteger(take(), '--max-requests'); break;
      case '--max-bytes': options.maxBytes = positiveInteger(take(), '--max-bytes'); break;
      case '--max-runtime': options.maxRuntimeMs = parseDuration(take()); break;
      case '--min-delay': options.minDelayMs = positiveInteger(take(), '--min-delay'); break;
      case '--staging-dir': options.stagingDir = take(); break;
      case '--output-root': options.outputRoot = take(); break;
      case '--decide': options.decide = take(); break;
      case '--status': options.status = take(); break;
      case '--reason': options.reason = take(); break;
      case '--by': options.by = take(); break;
      case '--override': options.override = take(); break;
      case '--jurisdiction': options.jurisdiction = take(); break;
      case '--archive': {
        const archive = take();
        if (archive !== 'staging' && archive !== 'r2') throw new Error('--archive erwartet staging|r2');
        options.archive = archive;
        break;
      }
      case '--r2-transport': {
        const transport = take();
        if (transport !== 's3' && transport !== 'wrangler') throw new Error('--r2-transport erwartet s3|wrangler');
        options.r2Transport = transport;
        break;
      }
      case '--area': {
        const area = take();
        if (!(SOURCE_AREAS as readonly string[]).includes(area)) throw new Error(`--area erwartet ${SOURCE_AREAS.join('|')}`);
        options.area = area as SourceArea;
        break;
      }
      default:
        throw new Error(`Unbekannte Option: ${argument}`);
    }
  }
  if (options.offline && options.refresh) throw new Error('--offline und --refresh schließen sich aus');
  return options;
}

export type Io = { print: (line: string) => void; error: (line: string) => void };

function createFetcher(options: CliOptions, root: string): RechtNrwFetcher {
  return createRechtNrwFetcher({ cacheDir: options.cacheDir ?? join(root, '.cache', 'recht-nrw'), offline: options.offline, refresh: options.refresh, minDelayMs: options.minDelayMs ?? DEFAULT_MIN_DELAY_MS });
}

function printFindings(findings: ImportResult['findings'], print: (line: string) => void): void {
  for (const finding of findings) print(`  [${finding.severity}] ${finding.code}: ${finding.message}`);
}

export function summarizeResult(result: ImportResult): string {
  const lines: string[] = [];
  lines.push(`Status: ${result.status} (Stufe ${result.stage})`);
  if (result.page) lines.push(`Quelle: ${result.page.title} | Fassung ${result.page.validFrom ?? '?'} – ${result.page.validTo ?? 'offen'} | Format ${result.page.content.format} | Stammnorm term:${result.page.stemTermId ?? '?'}`);
  if (result.selection) lines.push(`Stichtagsauswahl: ${result.selection.status}${result.selection.selected ? ` → ab ${result.selection.selected.validFrom} bis ${result.selection.selected.validTo ?? 'offen'}` : ''} (${result.selection.candidates.length} Fassungen geprüft${result.selection.warnings.length ? `, ${result.selection.warnings.length} historische Befunde` : ''})`);
  if (result.sanity) lines.push(`Dokumentidentität: ${result.sanity.status}${result.sanity.titleSimilarity !== undefined ? ` (Titelübereinstimmung ${result.sanity.titleSimilarity})` : ''}`);
  if (result.sourceLaw) lines.push(`Source-Normalized: ${result.sourceLaw.title}${result.sourceLaw.abbr ? ` (${result.sourceLaw.abbr})` : ''} | Typ ${result.sourceLaw.type} | ${result.sourceLaw.stats.units} Einheiten, ${result.sourceLaw.stats.tables} Tabellen, ${result.sourceLaw.annexes.length} Anlagen, ${result.sourceLaw.footnotes.length} Fußnoten`);
  if (result.completeness) lines.push(`Textvollständigkeit: ${result.completeness.completeness}${result.completeness.attachments.length ? ` (${result.completeness.attachments.map((attachment) => `${attachment.label}: ${attachment.handling}`).join('; ')})` : ''}`);
  if (result.record) lines.push(`Kanonisch: ${TARGET_JURISDICTION}/${result.record.meta.slug} | ${result.record.meta.title}${result.record.meta.abbr ? ` (${result.record.meta.abbr})` : ''} | Fassung ${result.record.versions[0]!.versionId} | Erlassorgan ${result.record.meta.enactingBody ?? '–'} (Quelle: ${result.record.meta.originEnactingBody ?? '–'})`);
  if (result.report) lines.push(`Transformation: ${result.report.changes.length} Ersetzungen, ${result.report.detections.length} Erkennungen, ${result.report.unresolved.length} manuelle Entscheidungen, Prüfung nach Transformation ${result.report.postTransformAudit.ok ? 'ok' : 'FEHLER'}`);
  if (result.integrity) lines.push(`Integrität: fetch→parse ${result.integrity.fetchParse.ok ? 'ok' : 'FEHLER'}${result.integrity.sourceCanonical ? `, source→canonical ${result.integrity.sourceCanonical.ok ? 'ok' : 'FEHLER'}` : ''}`);
  if (result.projection) lines.push(`D1-Plan west: ${result.projection.norms} Normen, ${result.projection.versions} Fassungen, ${result.projection.searchUnits} Sucheinheiten`);
  if (result.reviewItems.length > 0) lines.push(`Review: ${result.reviewItems.length} Fall/Fälle (${[...new Set(result.reviewItems.map((item) => `${item.category}${item.severity === 'blocking' ? '!' : ''}`))].join(', ')})`);
  if (result.writtenFiles.length > 0) lines.push(`Geschrieben: ${result.writtenFiles.length} Dateien`);
  return lines.join('\n');
}

export function summarizeLrmbResult(result: LrmbImportResult): string {
  const lines: string[] = [];
  lines.push(`Status: ${result.status} (Stufe ${result.stage})`);
  if (result.page) lines.push(`Quelle: ${result.page.title} | ${result.page.address.pathDate ? `Fassung ${result.page.validFrom ?? '?'} – ${result.page.validTo ?? 'offen'}` : 'undatierter Datensatz'} | Stammnorm term:${result.page.stemTermId ?? '?'}`);
  if (result.classification && result.normativity) lines.push(`Dokumenttyp: ${result.classification.sourceDocumentType} → ${result.classification.normType} | Normativität: ${result.normativity.decision} (${result.normativity.reasons.join('; ')})`);
  if (result.sanity) lines.push(`Dokumentidentität: ${result.sanity.status}${result.sanity.titleSimilarity !== undefined ? ` (Titelübereinstimmung ${result.sanity.titleSimilarity})` : ''}`);
  if (result.completeness) lines.push(`Textvollständigkeit: ${result.completeness.completeness}`);
  if (result.parse) lines.push(`Erlasskopf: ${result.parse.head.decreeKind ?? '–'} ${result.parse.head.issuingAuthorityText ?? ''} | Az. ${result.parse.head.fileReference ?? '–'} | vom ${result.parse.head.issuedOn ?? '–'} | Gliederung ${result.parse.style}, ${result.parse.stats.units} Nummern, ${result.parse.stats.tables} Tabellen, ${result.parse.stats.footnotes} Fußnoten`);
  if (result.changeNote) lines.push(`Fundstellenverlauf: ${result.changeNote.raw}`);
  for (const amendment of result.amendments ?? []) lines.push(`  Änderung ${amendment.note.decreeDate ?? amendment.note.decreeDateText} ${amendment.note.citation?.text ?? (amendment.note.unpublished ? 'n. v.' : '')}: ${amendment.incorporated ? 'eingearbeitet' : 'nicht eingearbeitet'}, in Kraft ${amendment.inForce ?? '?'} (${amendment.inForceDerivation})${amendment.gazetteUrl ? ` ← ${amendment.gazetteUrl}` : ''}`);
  if (result.validity) lines.push(`Stichtag: ${result.validity.baselineStatus} | Text ${result.validity.textStatus} | Quellintervall ${result.validity.sourceValidFrom ?? '?'} – ${result.validity.sourceValidTo ?? 'offen'} (${result.validity.provenance})${result.validity.continuity ? ` | Kontinuität ${result.validity.continuity.supported ? 'belegt' : `nicht belegt (${result.validity.continuity.checks.filter((check) => !check.ok).map((check) => check.id).join(', ')})`}` : ''}`);
  if (result.reconstruction) lines.push(`Rekonstruktion: ${result.reconstruction.ok ? 'ok' : 'FEHLER'} | ${result.reconstruction.steps.length} Schritte | Basis ${result.reconstruction.baseFingerprint.slice(0, 16)} → Ergebnis ${result.reconstruction.resultFingerprint.slice(0, 16)}`);
  if (result.record) lines.push(`Kanonisch: ${TARGET_JURISDICTION}/${result.record.meta.slug} | ${result.record.meta.title} | Typ ${result.record.meta.type} | Erlassorgan ${result.record.meta.enactingBody ?? '–'} (Quelle: ${result.record.meta.originEnactingBody ?? '–'})`);
  if (result.report) lines.push(`Transformation: ${result.report.changes.length} Ersetzungen, ${result.report.detections.length} Erkennungen, ${result.report.unresolved.length} manuelle Entscheidungen, Prüfung nach Transformation ${result.report.postTransformAudit.ok ? 'ok' : 'FEHLER'}`);
  if (result.integrity) lines.push(`Integrität: fetch→parse ${result.integrity.fetchParse.ok ? 'ok' : 'FEHLER'}${result.integrity.sourceCanonical ? `, source→canonical ${result.integrity.sourceCanonical.ok ? 'ok' : 'FEHLER'}` : ''}`);
  if (result.reviewItems.length > 0) lines.push(`Review: ${result.reviewItems.length} Fall/Fälle (${[...new Set(result.reviewItems.map((item) => `${item.category}${item.severity === 'blocking' ? '!' : ''}`))].join(', ')})`);
  if (result.writtenFiles.length > 0) lines.push(`Geschrieben: ${result.writtenFiles.length} Dateien`);
  return lines.join('\n');
}

function areaOf(options: CliOptions): SourceArea {
  const address = options.url ? parseVersionUrl(options.url) : null;
  if (options.url && !address) throw new Error(`${options.url} ist keine RECHT.NRW-Adresse`);
  if (address && options.area && address.section !== options.area) throw new Error(`Die Adresse gehört zum Bereich ${address.section}, nicht ${options.area}`);
  return address?.section ?? options.area ?? 'lrgv';
}

export async function runCli(argv: readonly string[], io: Io = { print: console.log, error: console.error }): Promise<number> {
  const options = parseCliArguments(argv);
  const root = resolveRepositoryRoot();

  switch (options.command) {
    case 'help':
    case '--help':
      io.print('Befehle: inspect | import | sample | enumerate | bulk | r2-sync | coverage | review | reconstruction-queue | search-audit | readiness | audit (Details: packages/importers/recht-nrw/src/cli.ts, docs/RECHT_NRW_BULK_READINESS.md)');
      return 0;
    case 'enumerate':
      return runEnumerateCommand(options, root, io);
    case 'bulk':
      return runBulkCommand(options, root, io);
    case 'r2-sync':
      return runR2SyncCommand(options, root, io);
    case 'coverage':
      return runCoverageCommand(options, root, io);
    case 'readiness':
      return runReadinessCommand(options, root, io);
    case 'search-audit':
      return runSearchAuditCommand(options, root, io);
    case 'reconstruction-queue':
      return runReconstructionQueueCommand(options, root, io);
    default:
      break;
  }

  if (options.command === 'inspect') {
    if (!options.url) throw new Error('inspect benötigt --url');
    const area = areaOf(options);
    const address = parseVersionUrl(options.url)!;
    const fetcher = createFetcher(options, root);
    const document = await fetcher.fetch(address.url);
    const page = parseVersionPage(decodeHtml(document), address.url);
    const candidates: SourceVersionCandidate[] = page.versions.map((entry) => {
      const candidate: SourceVersionCandidate = { validFrom: entry.validFrom, available: !entry.notRenderable };
      if (entry.url) candidate.url = entry.url;
      if (entry.isCurrentPage) {
        candidate.url = page.address.url;
        candidate.validTo = page.validTo ?? (page.versions.some((other) => other.validFrom > entry.validFrom) ? undefined : null);
      }
      return candidate;
    });
    const selection = page.versions.length > 0 ? selectSourceVersionAtBaseline(candidates, options.baseline) : undefined;
    io.print(`${page.title}`);
    io.print(`Adresse: ${page.address.url} (${page.address.section}/${page.address.documentType}, Pfaddatum ${page.address.pathDate ?? 'undatiert'})`);
    io.print(`Stammnorm: term:${page.stemTermId ?? '?'} | Ausfertigung ${page.issuedOn ?? '–'} | Gültig ${page.validFrom ?? '?'} – ${page.validTo ?? 'offen'} | Format ${page.content.format}`);
    if (page.promulgation) io.print(`Verkündet durch: ${page.promulgation}`);
    if (page.fullCitation) io.print(`Vollzitat: ${page.fullCitation}`);
    for (const item of page.changeHistoryItems) io.print(`Änderungshistorie: ${item}`);
    io.print(`Fassungen (${page.versions.length}):`);
    for (const entry of page.versions) io.print(`  ${entry.validFrom}${entry.isCurrentPage ? ' (diese Seite)' : ''}${entry.notRenderable ? ' (nicht darstellbar)' : ''}${entry.url ? ` ${entry.url}` : ''}`);
    io.print(`Anlagen: ${page.attachments.map((attachment) => `${attachment.label} [${attachment.mediaType}]`).join(', ') || '–'} | PDF: ${page.pdfUrl ?? '–'}`);
    if (selection) {
      io.print(`Stichtagsauswahl ${options.baseline}: ${selection.status}${selection.selected ? ` → ${selection.selected.validFrom} – ${selection.selected.validTo ?? 'offen'} ${selection.selected.url ?? ''}` : ''}`);
      for (const problem of selection.problems) io.print(`  ! ${problem}`);
      for (const warning of selection.warnings) io.print(`  ~ ${warning} (historisch, nicht blockierend)`);
    }
    if (area === 'lrmb' && page.content.format === 'native') {
      const parsed = parseLrmbDocument(page.content.bodyHtml);
      const titleDecree = parseDecreeFromTitle(page.title);
      const title = titleDecree?.title ?? page.title;
      const decreeKind = parsed.head.decreeKind ?? (titleDecree ? 'runderlass' : undefined);
      const type = classifyLrmbDocumentType(decreeKind ? { title, decreeKind } : { title });
      const normativity = assessNormativity({ portalType: address.documentType, title, ...(decreeKind ? { decreeKind } : {}), bodyText: parsed.bodyTexts.join(' ') });
      const clauses = parseValidityClauses(parsed.bodyTexts);
      io.print(`LRMB: ${type.sourceDocumentType} → ${type.normType} | Normativität ${normativity.decision} (${normativity.reasons.join('; ')})`);
      io.print(`Erlasskopf: ${parsed.head.decreeText ?? titleDecree?.decreeText ?? '–'} | Az. ${parsed.head.fileReference ?? titleDecree?.fileReference ?? '–'} | vom ${parsed.head.issuedOn ?? titleDecree?.issuedOn ?? '–'}`);
      io.print(`Gliederung: ${parsed.style}, ${parsed.stats.units} Nummern, ${parsed.stats.parts} Teile, ${parsed.stats.tables} Tabellen, ${parsed.stats.footnotes} Fußnoten${parsed.stats.numberingIssues.length ? `, ${parsed.stats.numberingIssues.length} Nummernhinweise` : ''}`);
      if (parsed.changeNoteText) {
        const note = parseChangeNote(parsed.changeNoteText);
        io.print(`Fundstellenverlauf: ${note.raw} (${note.amendments.length} Änderung(en)${note.complete ? '' : ', unvollständig gelesen'})`);
      }
      io.print(`Geltungsklauseln: Inkrafttreten ${clauses.inForce ? `${clauses.inForce.kind} ${clauses.inForce.date ?? ''}` : '–'} | Außerkrafttreten ${clauses.expiry?.date ?? '–'}`);
      printFindings(parsed.findings, io.print);
    }
    for (const finding of page.findings) io.print(`  [${finding.severity}] ${finding.code}: ${finding.message}`);
    io.print(`Abrufe: ${fetcher.stats.networkRequests} Netz, ${fetcher.stats.cacheHits} Cache`);
    return 0;
  }

  if (options.command === 'import') {
    if (!options.url) throw new Error('import benötigt --url');
    const area = areaOf(options);
    const fetcher = createFetcher(options, root);
    const manifest = await readManifest(root);
    const environment = await loadImportEnvironment(root, { mode: 'sample', manifest });
    const common = { url: options.url, root, fetcher, write: options.write, baselineDate: options.baseline, manifest, environment, log: (message: string) => io.print(`  … ${message}`) };
    const result = area === 'lrmb' ? await importRechtNrwLrmbDocument(common) : await importRechtNrwNorm(common);
    io.print(area === 'lrmb' ? summarizeLrmbResult(result as LrmbImportResult) : summarizeResult(result as ImportResult));
    printFindings(result.findings, io.print);
    if (!options.write) io.print('Dry-run: nichts geschrieben. Mit --write werden Rohquellen (Beispielarchiv), Norm, Report, Manifest und Review-Queue geschrieben.');
    io.print(`Abrufe: ${fetcher.stats.networkRequests} Netz, ${fetcher.stats.cacheHits} Cache`);
    return result.status === 'failed' ? 1 : 0;
  }

  if (options.command === 'sample') {
    const area = options.area ?? 'lrgv';
    const fetcher = createFetcher(options, root);
    let manifest = await readManifest(root);
    let reviewQueue: ReviewQueue = await readReviewQueue(root);
    const environment = await loadImportEnvironment(root, { mode: 'sample', manifest });
    let failures = 0;
    let deviations = 0;
    const log = (message: string): void => io.print(`  … ${message}`);
    if (area === 'lrmb') {
      const corpus = await readLrmbSampleCorpus(root);
      for (const entry of corpus.entries) {
        io.print(`\n### ${entry.url}`);
        io.print(`Begründung: ${entry.rationale}`);
        let result: LrmbImportResult;
        try {
          result = await importRechtNrwLrmbDocument({ url: entry.url, root, fetcher, write: options.write, baselineDate: options.baseline, manifest, reviewQueue, environment, log });
        } catch (error) {
          result = { status: 'failed', stage: 'exception', findings: [{ severity: 'error', code: 'exception', message: (error as Error).message }], reviewItems: [], writtenFiles: [] };
        }
        if (result.manifest) manifest = result.manifest;
        if (result.reviewQueue) reviewQueue = result.reviewQueue;
        io.print(summarizeLrmbResult(result));
        printFindings(result.findings, io.print);
        if (result.status === 'failed') failures += 1;
        const actual = { decision: result.normativity?.decision ?? '–', baselineStatus: result.validity?.baselineStatus ?? 'undetermined', textStatus: result.reconstruction?.ok && result.record ? 'reconstructed' : result.validity?.textStatus ?? 'not-applicable' };
        const mismatches = (Object.keys(entry.expected) as Array<keyof typeof entry.expected>).filter((key) => entry.expected[key] !== actual[key]);
        if (mismatches.length > 0) {
          deviations += 1;
          io.print(`Erwartung ABWEICHEND: ${mismatches.map((key) => `${key} erwartet ${entry.expected[key]}, erhalten ${actual[key]}`).join('; ')}`);
        } else {
          io.print(`Erwartung erfüllt: ${actual.decision} / ${actual.baselineStatus} / ${actual.textStatus}`);
        }
      }
      io.print(`\nLRMB-Korpus: ${corpus.entries.length} Dokumente, ${failures} fehlgeschlagen, ${deviations} Abweichung(en) von der Erwartung. Abrufe: ${fetcher.stats.networkRequests} Netz, ${fetcher.stats.cacheHits} Cache.${options.write ? '' : ' (Dry-run)'}`);
      return failures + deviations > 0 ? 1 : 0;
    }
    const corpus = await readSampleCorpus(root);
    for (const entry of corpus.entries) {
      io.print(`\n### ${entry.url}`);
      io.print(`Begründung: ${entry.rationale}`);
      let result: ImportResult;
      try {
        result = await importRechtNrwNorm({ url: entry.url, root, fetcher, write: options.write, baselineDate: options.baseline, manifest, reviewQueue, environment, log });
      } catch (error) {
        result = { status: 'failed', stage: 'exception', findings: [{ severity: 'error', code: 'exception', message: (error as Error).message }], reviewItems: [], writtenFiles: [] };
      }
      if (result.manifest) manifest = result.manifest;
      if (result.reviewQueue) reviewQueue = result.reviewQueue;
      io.print(summarizeResult(result));
      printFindings(result.findings, io.print);
      if (result.status === 'failed' || result.status === 'needs-review') failures += 1;
    }
    io.print(`\nKorpus: ${corpus.entries.length} Vorschriften, ${failures} nicht übernommen. Abrufe: ${fetcher.stats.networkRequests} Netz, ${fetcher.stats.cacheHits} Cache.${options.write ? '' : ' (Dry-run)'}`);
    return failures > 0 ? 1 : 0;
  }

  if (options.command === 'review') {
    let queue = await readReviewQueue(root);
    if (options.decide) {
      if (!options.status || !(REVIEW_ITEM_STATUSES as readonly string[]).includes(options.status) || options.status === 'open') throw new Error(`--status erwartet ${REVIEW_ITEM_STATUSES.filter((status) => status !== 'open').join('|')}`);
      if (!options.reason) throw new Error('--reason ist Pflicht');
      const decision: ReviewDecision = { decision: options.status as ReviewDecision['decision'], reason: options.reason, decidedAt: new Date().toISOString() };
      if (options.by) decision.decidedBy = options.by;
      if (options.override) decision.override = options.override;
      queue = decideReviewItem(queue, options.decide, decision);
      const item = queue.items.find((candidate) => candidate.id === options.decide)!;
      io.print(`${item.id}: ${item.status} – ${decision.reason}`);
      if (options.write) io.print(`Geschrieben: ${(await writeReviewShard(root, queue, item.sourceArea, item.sourceIdentity)).path}`);
      else io.print('Dry-run: Entscheidung nicht gespeichert (mit --write speichern).');
      return 0;
    }
    const open = queue.items.filter((item) => item.status === 'open' && (!options.area || item.sourceArea === options.area));
    if (options.json) {
      io.print(JSON.stringify(open, null, 2));
      return 0;
    }
    io.print(`Offene Review-Fälle: ${open.length} (davon blockierend ${open.filter((item) => item.severity === 'blocking').length})`);
    for (const item of open) {
      io.print(`  ${item.sourceArea} ${item.sourceIdentity.padEnd(12)} ${item.category.padEnd(26)} ${item.severity === 'blocking' ? 'blockierend' : 'offen      '} ${item.id} ${item.summary}`);
    }
    return 0;
  }

  if (options.command === 'audit') {
    const manifest = await readManifest(root);
    const queue = await readReviewQueue(root);
    const registry = await readSlugRegistry(root);
    const problems: string[] = [];
    const notes: string[] = [];
    for (const entry of manifest.entries) problems.push(...(await auditEntry(root, entry, queue)));
    for (const item of queue.items.filter((candidate) => candidate.status === 'open' && candidate.occurrence === 'current')) {
      const entry = manifest.entries.find((candidate) => candidate.sourceIdentity === item.sourceIdentity);
      if (entry && entry.reviewStatus === 'none') problems.push(`${item.sourceIdentity}: offener Review-Fall ${item.category}, Manifest meldet reviewStatus none`);
    }
    for (const entry of manifest.entries.filter((candidate) => isImportedStatus(candidate.importStatus))) {
      const reserved = registry.entries.find((candidate) => candidate.sourceIdentity === entry.sourceIdentity);
      if (!reserved) problems.push(`${entry.sourceIdentity}: Slug ${entry.targetSlug} nicht in der Slug-Registry`);
      else if (reserved.slug !== entry.targetSlug) problems.push(`${entry.sourceIdentity}: Slug-Registry ${reserved.slug} ≠ Manifest ${entry.targetSlug}`);
    }
    for (const area of SOURCE_AREAS) {
      const enumeration = await readEnumeration(root, area);
      if (!enumeration) {
        notes.push(`${area}: keine Enumeration`);
        continue;
      }
      const known = new Set(enumeration.items.flatMap((item) => [item.sourceIdentity, item.mergedInto]).filter(Boolean));
      const missing = manifest.entries.filter((entry) => entry.sourceArea === area && !known.has(entry.sourceIdentity));
      if (missing.length > 0) problems.push(`${area}: ${missing.length} Manifesteinträge ohne Enumerationseintrag (${missing.slice(0, 5).map((entry) => entry.sourceIdentity).join(', ')})`);
      if (!enumeration.crosscheck.ok) problems.push(`${area}: Enumerationsabgleich mit Abweichungen (${enumeration.crosscheck.problems.join('; ')})`);
    }
    try {
      const sampleDirs = (await readdir(join(root, RAW_ARCHIVE_DIR))).filter((name) => name.startsWith('term-'));
      const sampleIdentities = new Set(manifest.entries.filter((entry) => entry.archive?.mode !== 'r2').map((entry) => entry.sourceIdentity.replace(/^term:/u, 'term-')));
      const leaked = sampleDirs.filter((name) => !sampleIdentities.has(name));
      if (leaked.length > 0) problems.push(`${RAW_ARCHIVE_DIR}: ${leaked.length} Verzeichnisse ohne Beispielkorpus-Manifesteintrag (${leaked.slice(0, 5).join(', ')}) – Bulkquellen gehören nach R2`);
    } catch {
      notes.push(`${RAW_ARCHIVE_DIR} fehlt`);
    }
    try {
      const stored = JSON.parse(await readFile(join(root, COVERAGE_PATH), 'utf8')) as CoverageReport;
      const recomputed = computeCoverage(await collectCoverageInput(root, stored.generatedAt));
      if (stored.schemaVersion !== recomputed.schemaVersion || coverageComparable(stored) !== coverageComparable(recomputed)) problems.push(`${COVERAGE_PATH}: entspricht nicht Manifest, Queue, Enumeration und Inhalten (neu erzeugen mit coverage --write)`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') problems.push(`${COVERAGE_PATH}: ${(error as Error).message}`);
      else notes.push(`${COVERAGE_PATH} fehlt`);
    }
    for (const area of SOURCE_AREAS) {
      const entries = manifest.entries.filter((entry) => entry.sourceArea === area);
      io.print(`${area.toUpperCase()}: ${entries.length} Einträge (Stichtag ${manifest.baselineDate})`);
      if (entries.length <= 60) for (const entry of entries) io.print(`  ${entry.sourceIdentity.padEnd(12)} ${(entry.targetSlug || '–').padEnd(48).slice(0, 48)} ${entry.importStatus.padEnd(22)} ${entry.baselineStatus.padEnd(22)} ${entry.reconstructionStatus.padEnd(24)} review ${entry.reviewStatus}`);
    }
    io.print(`Review-Queue: ${queue.items.length} Fälle, offen ${queue.items.filter((item) => item.status === 'open').length}; Slug-Registry: ${registry.entries.length} Einträge`);
    for (const note of notes) io.print(`  Hinweis: ${note}`);
    if (problems.length > 0) {
      for (const problem of problems) io.error(`  ! ${problem}`);
      return 1;
    }
    io.print('Audit ok: Rohquellen-Hashes, kanonische Dateien, Reports, Rekonstruktionen, Review-Status, Slug-Registry, Enumeration und Coverage stimmen mit dem Manifest überein.');
    return 0;
  }

  throw new Error(`Unbekannter Befehl: ${options.command}`);
}

async function verifyHash(root: string, localSource: string, sha256: string, problems: string[]): Promise<void> {
  try {
    const digest = createHash('sha256').update(await readFile(join(root, localSource))).digest('hex');
    if (digest !== sha256) problems.push(`${localSource}: SHA-256 ${digest} ≠ Manifest ${sha256}`);
  } catch {
    problems.push(`${localSource}: archivierte Rohquelle fehlt`);
  }
}

async function auditEntry(root: string, entry: ManifestEntry, queue: ReviewQueue): Promise<string[]> {
  const problems: string[] = [];
  if (entry.importStatus === 'dry-run' || entry.importStatus === 'failed') return problems;
  for (const raw of entry.rawDocuments) {
    if (raw.localSource) await verifyHash(root, raw.localSource, raw.sha256, problems);
    else if (!raw.objectKey) problems.push(`${entry.sourceIdentity}: Rohquelle ${raw.url} weder versioniert noch in R2 adressiert`);
  }
  if (entry.transformation.reportPath) {
    try {
      await stat(join(root, entry.transformation.reportPath));
    } catch {
      problems.push(`${entry.sourceIdentity}: Report ${entry.transformation.reportPath} fehlt`);
    }
  }
  if (entry.reviewStatus === 'open' && !queue.items.some((item) => item.sourceIdentity === entry.sourceIdentity && item.status === 'open')) problems.push(`${entry.sourceIdentity}: reviewStatus open ohne offenen Review-Fall`);
  if (!isImportedStatus(entry.importStatus)) {
    if (entry.targetSlug) problems.push(`${entry.sourceIdentity}: nicht übernommener Eintrag (${entry.importStatus}) mit Ziel-Slug ${entry.targetSlug}`);
    return problems;
  }
  try {
    const record = await loadNorm(TARGET_JURISDICTION, entry.targetSlug, root);
    const version = record.versions.find((candidate) => candidate.versionId === entry.baselineDate);
    if (!version) problems.push(`${entry.targetSlug}: Ausgangsfassung ${entry.baselineDate} fehlt`);
    else {
      if ((version.sourceValidTo ?? null) !== entry.sourceValidTo || (version.sourceValidFrom ?? '') !== entry.sourceValidFrom) problems.push(`${entry.targetSlug}: Quellintervall der Fassung weicht vom Manifest ab`);
      if (entry.sourceArea === 'lrmb' && entry.reconstructionStatus === 'reconstructed' && version.sourceStatus?.text !== 'reconstructed') problems.push(`${entry.targetSlug}: rekonstruierte Fassung ohne Quellenlage „reconstructed“`);
      if (!version.sourceCitation) problems.push(`${entry.targetSlug}: Fundstelle der Quelle (sourceCitation) fehlt`);
      const expectedAvailability = entry.archive?.mode === 'r2' ? 'r2-archived' : 'versioned';
      const archived = (version.sourceReferences ?? []).filter((reference) => reference.availability !== 'external');
      if (archived.some((reference) => reference.availability !== expectedAvailability)) problems.push(`${entry.targetSlug}: Quellenreferenzen passen nicht zum Archivmodus ${entry.archive?.mode ?? 'versioned-sample'}`);
    }
    if (!record.meta.externalIdentifiers.some((identifier) => identifier.system === 'recht-nrw' && identifier.value === entry.sourceIdentity)) problems.push(`${entry.targetSlug}: externe Kennung ${entry.sourceIdentity} fehlt`);
  } catch (error) {
    problems.push(`${entry.targetSlug}: ${(error as Error).message}`);
  }
  if (entry.reconstructionStatus === 'reconstructed') {
    const recipe = await readReconstructionRecipe(root, entry.sourceIdentity).catch((error: Error) => {
      problems.push(`${entry.sourceIdentity}: Rekonstruktionsrezept nicht lesbar (${error.message})`);
      return undefined;
    });
    if (!recipe) problems.push(`${entry.sourceIdentity}: rekonstruiert ohne Rezept`);
    const lastStep = entry.reconstructionSteps[entry.reconstructionSteps.length - 1];
    if (recipe && lastStep?.afterFingerprint !== recipe.expected.resultFingerprint) problems.push(`${entry.sourceIdentity}: Ergebnis-Fingerabdruck der Rekonstruktion weicht vom Rezept ab`);
    for (const source of entry.reconstructionSources) if (source.localSource) await verifyHash(root, source.localSource, source.sha256, problems);
  }
  return problems;
}
