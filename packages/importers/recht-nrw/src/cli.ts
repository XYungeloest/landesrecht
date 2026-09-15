/**
 * Entwickler-CLI des RECHT.NRW-Imports (Aufruf über scripts/import-recht-nrw.ts):
 *
 *   inspect  --url <url>                     Seite analysieren (LRGV oder LRMB, aus der Adresse)
 *   import   --url <url> [--write]           Importpfad LRGV oder LRMB; ohne --write nur Dry-run
 *   sample   [--area lrgv|lrmb] [--write]    Validierungskorpus eines Bereichs (Standard: lrgv)
 *   audit                                    Manifest, Rohquellen-Hashes, kanonische Dateien, Reports,
 *                                            Rekonstruktionen, Review-Queue und Coverage prüfen
 *   coverage [--write]                       Coverage-Report aus Manifest und Review-Queue
 *   review   [--area lrgv|lrmb]              offene Review-Fälle
 *
 * Gemeinsame Optionen: --offline (nur Cache), --cache-dir <pfad>, --baseline <datum>, --json,
 * --area lrgv|lrmb (bei import/inspect muss sie zur Adresse passen).
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { loadNorm } from '@landesrecht/legal-core/lib/loader.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';

import { TARGET_JURISDICTION } from './common/constants.ts';
import { computeCoverage, COVERAGE_PATH, writeCoverage, type CoverageReport } from './common/coverage.ts';
import { createRechtNrwFetcher, decodeHtml, type RechtNrwFetcher } from './common/fetcher.ts';
import { readLrmbSampleCorpus, readManifest, readSampleCorpus, SOURCE_AREAS, type ManifestEntry, type SourceArea } from './common/manifest.ts';
import { readReviewQueue, type ReviewQueue } from './common/review-queue.ts';
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
  cacheDir?: string;
  baseline: string;
  json: boolean;
}

export function parseCliArguments(argv: readonly string[]): CliOptions {
  const [command = 'help', ...rest] = argv;
  const options: CliOptions = { command, write: false, offline: false, baseline: SIMULATION_BASELINE_DATE, json: false };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]!;
    if (argument === '--write') options.write = true;
    else if (argument === '--offline') options.offline = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--url') options.url = rest[++index];
    else if (argument.startsWith('--url=')) options.url = argument.slice(6);
    else if (argument === '--cache-dir') options.cacheDir = rest[++index];
    else if (argument === '--baseline') options.baseline = rest[++index] ?? options.baseline;
    else if (argument === '--area') {
      const area = rest[++index];
      if (!area || !(SOURCE_AREAS as readonly string[]).includes(area)) throw new Error(`--area erwartet ${SOURCE_AREAS.join('|')}`);
      options.area = area as SourceArea;
    } else throw new Error(`Unbekannte Option: ${argument}`);
  }
  return options;
}

type Io = { print: (line: string) => void; error: (line: string) => void };

function createFetcher(options: CliOptions, root: string): RechtNrwFetcher {
  return createRechtNrwFetcher({ cacheDir: options.cacheDir ?? join(root, '.cache', 'recht-nrw'), offline: options.offline });
}

function printFindings(findings: ImportResult['findings'], print: (line: string) => void): void {
  for (const finding of findings) print(`  [${finding.severity}] ${finding.code}: ${finding.message}`);
}

export function summarizeResult(result: ImportResult): string {
  const lines: string[] = [];
  lines.push(`Status: ${result.status} (Stufe ${result.stage})`);
  if (result.page) lines.push(`Quelle: ${result.page.title} | Fassung ${result.page.validFrom ?? '?'} – ${result.page.validTo ?? 'offen'} | Format ${result.page.content.format} | Stammnorm term:${result.page.stemTermId ?? '?'}`);
  if (result.selection) lines.push(`Stichtagsauswahl: ${result.selection.status}${result.selection.selected ? ` → ab ${result.selection.selected.validFrom} bis ${result.selection.selected.validTo ?? 'offen'}` : ''} (${result.selection.candidates.length} Fassungen geprüft${result.selection.warnings.length ? `, ${result.selection.warnings.length} historische Befunde` : ''})`);
  if (result.sourceLaw) lines.push(`Source-Normalized: ${result.sourceLaw.title}${result.sourceLaw.abbr ? ` (${result.sourceLaw.abbr})` : ''} | ${result.sourceLaw.stats.units} Einheiten, ${result.sourceLaw.stats.tables} Tabellen, ${result.sourceLaw.annexes.length} Anlagen, ${result.sourceLaw.footnotes.length} Fußnoten`);
  if (result.record) lines.push(`Kanonisch: ${TARGET_JURISDICTION}/${result.record.meta.slug} | ${result.record.meta.title}${result.record.meta.abbr ? ` (${result.record.meta.abbr})` : ''} | Fassung ${result.record.versions[0]!.versionId} | Erlassorgan ${result.record.meta.enactingBody ?? '–'} (Quelle: ${result.record.meta.originEnactingBody ?? '–'})`);
  if (result.report) lines.push(`Transformation: ${result.report.changes.length} Ersetzungen, ${result.report.detections.length} Erkennungen, ${result.report.unresolved.length} manuelle Entscheidungen, Prüfung nach Transformation ${result.report.postTransformAudit.ok ? 'ok' : 'FEHLER'}`);
  if (result.integrity) lines.push(`Integrität: fetch→parse ${result.integrity.fetchParse.ok ? 'ok' : 'FEHLER'}, source→canonical ${result.integrity.sourceCanonical.ok ? 'ok' : 'FEHLER'}`);
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
  if (result.parse) lines.push(`Erlasskopf: ${result.parse.head.decreeKind ?? '–'} ${result.parse.head.issuingAuthorityText ?? ''} | Az. ${result.parse.head.fileReference ?? '–'} | vom ${result.parse.head.issuedOn ?? '–'} | Gliederung ${result.parse.style}, ${result.parse.stats.units} Nummern, ${result.parse.stats.tables} Tabellen, ${result.parse.stats.footnotes} Fußnoten`);
  if (result.changeNote) lines.push(`Fundstellenverlauf: ${result.changeNote.raw}`);
  for (const amendment of result.amendments ?? []) lines.push(`  Änderung ${amendment.note.decreeDate ?? amendment.note.decreeDateText} ${amendment.note.citation?.text ?? (amendment.note.unpublished ? 'n. v.' : '')}: ${amendment.incorporated ? 'eingearbeitet' : 'nicht eingearbeitet'}, in Kraft ${amendment.inForce ?? '?'} (${amendment.inForceDerivation})${amendment.gazetteUrl ? ` ← ${amendment.gazetteUrl}` : ''}`);
  if (result.validity) lines.push(`Stichtag: ${result.validity.baselineStatus} | Text ${result.validity.textStatus} | Quellintervall ${result.validity.sourceValidFrom ?? '?'} – ${result.validity.sourceValidTo ?? 'offen'} (${result.validity.sourceValidity})`);
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

  if (options.command === 'help' || options.command === '--help') {
    io.print('Befehle: inspect --url <url> | import --url <url> [--write] | sample [--area lrgv|lrmb] [--write] | audit | coverage [--write] | review [--area lrgv|lrmb]  (Optionen: --offline, --cache-dir, --baseline, --json)');
    return 0;
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
    if (area === 'lrmb') {
      const result = await importRechtNrwLrmbDocument({ url: options.url, root, fetcher, write: options.write, baselineDate: options.baseline, log: (message) => io.print(`  … ${message}`) });
      io.print(summarizeLrmbResult(result));
      printFindings(result.findings, io.print);
      if (!options.write) io.print('Dry-run: nichts geschrieben. Mit --write werden Rohquellen, Norm (falls übernommen), Audit-Report, Manifest und Review-Queue geschrieben.');
      io.print(`Abrufe: ${fetcher.stats.networkRequests} Netz, ${fetcher.stats.cacheHits} Cache`);
      return result.status === 'failed' ? 1 : 0;
    }
    const corpus = await readSampleCorpus(root).catch(() => null);
    const address = parseVersionUrl(options.url);
    const corpusEntry = corpus?.entries.find((entry) => parseVersionUrl(entry.url)?.url === address?.url);
    const importOptions: Parameters<typeof importRechtNrwNorm>[0] = { url: options.url, root, fetcher, write: options.write, baselineDate: options.baseline, log: (message) => io.print(`  … ${message}`) };
    if (corpusEntry?.overrides) importOptions.overrides = corpusEntry.overrides;
    const result = await importRechtNrwNorm(importOptions);
    io.print(summarizeResult(result));
    printFindings(result.findings, io.print);
    if (!options.write) io.print('Dry-run: nichts geschrieben. Mit --write werden Rohquellen, content/norms/west/<slug>/, Transformationsreport, Manifest und Review-Queue geschrieben.');
    io.print(`Abrufe: ${fetcher.stats.networkRequests} Netz, ${fetcher.stats.cacheHits} Cache`);
    return result.status === 'failed' ? 1 : 0;
  }

  if (options.command === 'sample') {
    const area = options.area ?? 'lrgv';
    const fetcher = createFetcher(options, root);
    let manifest = await readManifest(root);
    let reviewQueue: ReviewQueue = await readReviewQueue(root);
    let failures = 0;
    let deviations = 0;
    if (area === 'lrmb') {
      const corpus = await readLrmbSampleCorpus(root);
      for (const entry of corpus.entries) {
        io.print(`\n### ${entry.url}`);
        io.print(`Begründung: ${entry.rationale}`);
        let result: LrmbImportResult;
        try {
          result = await importRechtNrwLrmbDocument({ url: entry.url, root, fetcher, write: options.write, baselineDate: options.baseline, manifest, reviewQueue, log: (message) => io.print(`  … ${message}`) });
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
      const importOptions: Parameters<typeof importRechtNrwNorm>[0] = { url: entry.url, root, fetcher, write: options.write, baselineDate: options.baseline, manifest, reviewQueue, log: (message) => io.print(`  … ${message}`) };
      if (entry.overrides) importOptions.overrides = entry.overrides;
      let result: ImportResult;
      try {
        result = await importRechtNrwNorm(importOptions);
      } catch (error) {
        result = { status: 'failed', stage: 'exception', findings: [{ severity: 'error', code: 'exception', message: (error as Error).message }], reviewItems: [], writtenFiles: [] };
      }
      if (result.manifest) manifest = result.manifest;
      if (result.reviewQueue) reviewQueue = result.reviewQueue;
      io.print(summarizeResult(result));
      printFindings(result.findings, io.print);
      if (result.status === 'failed') failures += 1;
    }
    io.print(`\nKorpus: ${corpus.entries.length} Vorschriften, ${failures} fehlgeschlagen. Abrufe: ${fetcher.stats.networkRequests} Netz, ${fetcher.stats.cacheHits} Cache.${options.write ? '' : ' (Dry-run)'}`);
    return failures > 0 ? 1 : 0;
  }

  if (options.command === 'coverage') {
    const manifest = await readManifest(root);
    const queue = await readReviewQueue(root);
    const report = computeCoverage(manifest, queue, { now: new Date().toISOString(), scope: 'sample' });
    if (options.json) io.print(JSON.stringify(report, null, 2));
    else printCoverage(report, io.print);
    if (options.write) io.print(`Geschrieben: ${await writeCoverage(root, report)}`);
    return 0;
  }

  if (options.command === 'review') {
    const queue = await readReviewQueue(root);
    const open = queue.items.filter((item) => item.status === 'open' && (!options.area || item.sourceArea === options.area));
    if (options.json) {
      io.print(JSON.stringify(open, null, 2));
      return 0;
    }
    io.print(`Offene Review-Fälle: ${open.length} (davon blockierend ${open.filter((item) => item.severity === 'blocking').length})`);
    for (const item of open.sort((left, right) => left.sourceIdentity.localeCompare(right.sourceIdentity) || left.category.localeCompare(right.category))) {
      io.print(`  ${item.sourceArea} ${item.sourceIdentity.padEnd(12)} ${item.category.padEnd(26)} ${item.severity === 'blocking' ? 'blockierend' : 'offen      '} ${item.occurrence === 'current' ? '' : '(nicht reproduziert) '}${item.summary}`);
    }
    return 0;
  }

  if (options.command === 'audit') {
    const manifest = await readManifest(root);
    const queue = await readReviewQueue(root);
    const problems: string[] = [];
    for (const entry of manifest.entries) problems.push(...(await auditEntry(root, entry, queue)));
    for (const item of queue.items.filter((candidate) => candidate.status === 'open' && candidate.occurrence === 'current')) {
      const entry = manifest.entries.find((candidate) => candidate.sourceIdentity === item.sourceIdentity);
      if (entry && entry.reviewStatus === 'none') problems.push(`${item.sourceIdentity}: offener Review-Fall ${item.category}, Manifest meldet reviewStatus none`);
    }
    try {
      const stored = JSON.parse(await readFile(join(root, COVERAGE_PATH), 'utf8')) as CoverageReport;
      const recomputed = computeCoverage(manifest, queue, { now: stored.generatedAt, scope: stored.scope, enumerated: { lrgv: stored.lrgv.enumerated, lrmb: stored.lrmb.enumerated } });
      for (const section of ['lrgv', 'lrmb', 'reviewQueue', 'quality'] as const) {
        if (JSON.stringify(stored[section]) !== JSON.stringify(recomputed[section])) problems.push(`${COVERAGE_PATH}: Abschnitt ${section} entspricht nicht Manifest und Review-Queue (neu erzeugen mit coverage --write)`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') problems.push(`${COVERAGE_PATH}: ${(error as Error).message}`);
    }
    for (const area of SOURCE_AREAS) {
      const entries = manifest.entries.filter((entry) => entry.sourceArea === area);
      io.print(`${area.toUpperCase()}: ${entries.length} Einträge (Stichtag ${manifest.baselineDate})`);
      for (const entry of entries) io.print(`  ${entry.sourceIdentity.padEnd(12)} ${(entry.targetSlug || '–').padEnd(48).slice(0, 48)} ${entry.importStatus.padEnd(22)} ${entry.baselineStatus.padEnd(22)} ${entry.reconstructionStatus.padEnd(24)} review ${entry.reviewStatus}`);
    }
    io.print(`Review-Queue: ${queue.items.length} Fälle, offen ${queue.items.filter((item) => item.status === 'open').length}`);
    if (problems.length > 0) {
      for (const problem of problems) io.error(`  ! ${problem}`);
      return 1;
    }
    io.print('Audit ok: Rohquellen-Hashes, kanonische Dateien, Reports, Rekonstruktionen, Review-Status und Coverage stimmen mit dem Manifest überein.');
    return 0;
  }

  throw new Error(`Unbekannter Befehl: ${options.command}`);
}

function printCoverage(report: CoverageReport, print: (line: string) => void): void {
  print(`Coverage (${report.scope}, Stichtag ${report.baselineDate})`);
  print(`  LRGV: enumeriert ${report.lrgv.enumerated} | am Stichtag ${report.lrgv.atBaseline} | importiert ${report.lrgv.imported} | Review ${report.lrgv.review} | nicht verfügbar ${report.lrgv.unavailable} | ausgeschlossen ${report.lrgv.excluded}`);
  print(`  LRMB: enumeriert ${report.lrmb.enumerated} | normativ ${report.lrmb.normative} | am Stichtag ${report.lrmb.atBaseline} | direkt ${report.lrmb.direct} | rekonstruiert ${report.lrmb.reconstructed} | Review ${report.lrmb.review} | ausgeschlossen ${report.lrmb.excluded}`);
  print(`  Review-Queue: offen ${report.reviewQueue.open} (blockierend ${report.reviewQueue.openBlocking}) ${JSON.stringify(report.reviewQueue.byCategory)}`);
  print(`  Qualität: Integritätsfehler ${report.quality.integrityFailures}, Prüfung nach Transformation fehlgeschlagen ${report.quality.postTransformAuditFailures}, manuelle Entscheidungen ${report.quality.unresolvedReferences}, fehlgeschlagene Importe ${report.quality.failedImports}`);
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
  for (const raw of entry.rawDocuments) if (raw.localSource) await verifyHash(root, raw.localSource, raw.sha256, problems);
  if (entry.transformation.reportPath) {
    try {
      await readFile(join(root, entry.transformation.reportPath), 'utf8');
    } catch {
      problems.push(`${entry.sourceIdentity}: Report ${entry.transformation.reportPath} fehlt`);
    }
  }
  if (entry.reviewStatus === 'open' && !queue.items.some((item) => item.sourceIdentity === entry.sourceIdentity && item.status === 'open')) problems.push(`${entry.sourceIdentity}: reviewStatus open ohne offenen Review-Fall`);
  const imported = entry.importStatus === 'imported' || entry.importStatus === 'imported-with-warnings';
  if (!imported) {
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
