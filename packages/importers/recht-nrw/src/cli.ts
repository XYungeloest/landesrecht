/**
 * Entwickler-CLI des RECHT.NRW-Importers (Aufruf über scripts/import-recht-nrw.ts):
 *
 *   inspect --url <url>            Fassungsseite analysieren: Metadaten, Fassungsliste, Stichtagsauswahl
 *   import  --url <url> [--write]  Vollständiger Importpfad; ohne --write nur Dry-run
 *   sample  [--write]              Validierungskorpus aus data/imports/recht-nrw/sample-corpus.json
 *   audit                          Manifest, Rohquellen-Hashes und kanonische Dateien prüfen
 *
 * Gemeinsame Optionen: --offline (nur Cache), --cache-dir <pfad>, --baseline <datum>.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { loadNorm } from '@landesrecht/legal-core/lib/loader.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';

import { TARGET_JURISDICTION } from './constants.ts';
import { createRechtNrwFetcher, decodeHtml, type RechtNrwFetcher } from './fetcher.ts';
import { readManifest, readSampleCorpus, type ManifestEntry } from './manifest.ts';
import { importRechtNrwNorm, type ImportResult } from './pipeline.ts';
import { parseVersionUrl } from './source-identity.ts';
import { selectSourceVersionAtBaseline } from './version-selection.ts';
import { parseVersionPage } from './version-page.ts';

export interface CliOptions {
  command: string;
  url?: string;
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
    else if (argument === '--cache-dir') options.cacheDir = rest[++index];
    else if (argument === '--baseline') options.baseline = rest[++index] ?? options.baseline;
    else if (argument.startsWith('--url=')) options.url = argument.slice(6);
    else throw new Error(`Unbekannte Option: ${argument}`);
  }
  return options;
}

function createFetcher(options: CliOptions, root: string): RechtNrwFetcher {
  const fetcherOptions: Parameters<typeof createRechtNrwFetcher>[0] = { cacheDir: options.cacheDir ?? join(root, '.cache', 'recht-nrw'), offline: options.offline };
  return createRechtNrwFetcher(fetcherOptions);
}

function printFindings(result: ImportResult, print: (line: string) => void): void {
  for (const finding of result.findings) print(`  [${finding.severity}] ${finding.code}: ${finding.message}`);
}

export function summarizeResult(result: ImportResult): string {
  const lines: string[] = [];
  lines.push(`Status: ${result.status} (Stufe ${result.stage})`);
  if (result.page) lines.push(`Quelle: ${result.page.title} | Fassung ${result.page.validFrom ?? '?'} – ${result.page.validTo ?? 'offen'} | Format ${result.page.content.format} | Stammnorm term:${result.page.stemTermId ?? '?'}`);
  if (result.selection) lines.push(`Stichtagsauswahl: ${result.selection.status}${result.selection.selected ? ` → ab ${result.selection.selected.validFrom} bis ${result.selection.selected.validTo ?? 'offen'}` : ''} (${result.selection.candidates.length} Fassungen geprüft)`);
  if (result.sourceLaw) lines.push(`Source-Normalized: ${result.sourceLaw.title}${result.sourceLaw.abbr ? ` (${result.sourceLaw.abbr})` : ''} | ${result.sourceLaw.stats.units} Einheiten, ${result.sourceLaw.stats.tables} Tabellen, ${result.sourceLaw.annexes.length} Anlagen, ${result.sourceLaw.footnotes.length} Fußnoten`);
  if (result.record) lines.push(`Kanonisch: ${TARGET_JURISDICTION}/${result.record.meta.slug} | ${result.record.meta.title}${result.record.meta.abbr ? ` (${result.record.meta.abbr})` : ''} | Fassung ${result.record.versions[0]!.versionId}`);
  if (result.report) lines.push(`Transformation: ${result.report.changes.length} Ersetzungen, ${result.report.unresolved.length} unresolved`);
  if (result.integrity) lines.push(`Integrität: fetch→parse ${result.integrity.fetchParse.ok ? 'ok' : 'FEHLER'}, source→canonical ${result.integrity.sourceCanonical.ok ? 'ok' : 'FEHLER'}`);
  if (result.projection) lines.push(`D1-Plan west: ${result.projection.norms} Normen, ${result.projection.versions} Fassungen, ${result.projection.searchUnits} Sucheinheiten`);
  if (result.writtenFiles.length > 0) lines.push(`Geschrieben: ${result.writtenFiles.length} Dateien`);
  return lines.join('\n');
}

export async function runCli(argv: readonly string[], io: { print: (line: string) => void; error: (line: string) => void } = { print: console.log, error: console.error }): Promise<number> {
  const options = parseCliArguments(argv);
  const root = resolveRepositoryRoot();

  if (options.command === 'help' || options.command === '--help') {
    io.print('Befehle: inspect --url <url> | import --url <url> [--write] | sample [--write] | audit  (Optionen: --offline, --cache-dir, --baseline, --json)');
    return 0;
  }

  if (options.command === 'inspect') {
    if (!options.url) throw new Error('inspect benötigt --url');
    const address = parseVersionUrl(options.url);
    if (!address) throw new Error(`${options.url} ist keine RECHT.NRW-Fassungsadresse`);
    const fetcher = createFetcher(options, root);
    const document = await fetcher.fetch(address.url);
    const page = parseVersionPage(decodeHtml(document), address.url);
    const selection = selectSourceVersionAtBaseline(page.versions.map((entry) => (entry.url ? { validFrom: entry.validFrom, url: entry.url, available: !entry.notRenderable } : { validFrom: entry.validFrom, available: !entry.notRenderable, ...(entry.isCurrentPage ? { url: page.address.url, validTo: page.validTo ?? (page.versions.some((other) => other.validFrom > entry.validFrom) ? undefined : null) } : {}) })), options.baseline);
    if (options.json) {
      io.print(JSON.stringify({ page: { ...page, content: page.content.format === 'native' ? { format: 'native', bodyHtmlLength: page.content.bodyHtml.length } : page.content }, selection }, null, 2));
      return 0;
    }
    io.print(`${page.title}`);
    io.print(`Adresse: ${page.address.url} (${page.address.documentType}, Pfaddatum ${page.address.pathDate})`);
    io.print(`Stammnorm: term:${page.stemTermId ?? '?'} | Ausfertigung ${page.issuedOn ?? '–'} | Gültig ${page.validFrom ?? '?'} – ${page.validTo ?? 'offen'} | Format ${page.content.format}`);
    if (page.promulgation) io.print(`Verkündet durch: ${page.promulgation}`);
    if (page.fullCitation) io.print(`Vollzitat: ${page.fullCitation}`);
    io.print(`Fassungen (${page.versions.length}):`);
    for (const entry of page.versions) io.print(`  ${entry.validFrom}${entry.isCurrentPage ? ' (diese Seite)' : ''}${entry.notRenderable ? ' (nicht darstellbar)' : ''}${entry.url ? ` ${entry.url}` : ''}`);
    io.print(`Anlagen: ${page.attachments.map((attachment) => `${attachment.label} [${attachment.mediaType}]`).join(', ') || '–'} | PDF: ${page.pdfUrl ?? '–'}`);
    io.print(`Stichtagsauswahl ${options.baseline}: ${selection.status}${selection.selected ? ` → ${selection.selected.validFrom} – ${selection.selected.validTo ?? 'offen'} ${selection.selected.url ?? ''}` : ''}`);
    for (const problem of selection.problems) io.print(`  ! ${problem}`);
    for (const finding of page.findings) io.print(`  [${finding.severity}] ${finding.code}: ${finding.message}`);
    io.print(`Abrufe: ${fetcher.stats.networkRequests} Netz, ${fetcher.stats.cacheHits} Cache`);
    return 0;
  }

  if (options.command === 'import') {
    if (!options.url) throw new Error('import benötigt --url');
    const fetcher = createFetcher(options, root);
    const corpus = await readSampleCorpus(root).catch(() => null);
    const address = parseVersionUrl(options.url);
    const corpusEntry = corpus?.entries.find((entry) => parseVersionUrl(entry.url)?.url === address?.url);
    const importOptions: Parameters<typeof importRechtNrwNorm>[0] = { url: options.url, root, fetcher, write: options.write, baselineDate: options.baseline, log: (message) => io.print(`  … ${message}`) };
    if (corpusEntry?.overrides) importOptions.overrides = corpusEntry.overrides;
    const result = await importRechtNrwNorm(importOptions);
    io.print(summarizeResult(result));
    printFindings(result, io.print);
    if (!options.write) io.print('Dry-run: nichts geschrieben. Mit --write werden Rohquellen, content/norms/west/<slug>/, Transformationsreport und Manifest geschrieben.');
    io.print(`Abrufe: ${fetcher.stats.networkRequests} Netz, ${fetcher.stats.cacheHits} Cache`);
    return result.status === 'failed' ? 1 : 0;
  }

  if (options.command === 'sample') {
    const corpus = await readSampleCorpus(root);
    const fetcher = createFetcher(options, root);
    let manifest = await readManifest(root);
    let failures = 0;
    for (const entry of corpus.entries) {
      io.print(`\n### ${entry.url}`);
      io.print(`Begründung: ${entry.rationale}`);
      const importOptions: Parameters<typeof importRechtNrwNorm>[0] = { url: entry.url, root, fetcher, write: options.write, baselineDate: options.baseline, manifest, log: (message) => io.print(`  … ${message}`) };
      if (entry.overrides) importOptions.overrides = entry.overrides;
      let result: ImportResult;
      try {
        result = await importRechtNrwNorm(importOptions);
      } catch (error) {
        result = { status: 'failed', stage: 'exception', findings: [{ severity: 'error', code: 'exception', message: (error as Error).message }], writtenFiles: [] };
      }
      if (result.manifest) manifest = result.manifest;
      io.print(summarizeResult(result));
      printFindings(result, io.print);
      if (result.status === 'failed') failures += 1;
    }
    io.print(`\nKorpus: ${corpus.entries.length} Vorschriften, ${failures} fehlgeschlagen. Abrufe: ${fetcher.stats.networkRequests} Netz, ${fetcher.stats.cacheHits} Cache.${options.write ? '' : ' (Dry-run)'}`);
    return failures > 0 ? 1 : 0;
  }

  if (options.command === 'audit') {
    const manifest = await readManifest(root);
    const problems: string[] = [];
    for (const entry of manifest.entries) problems.push(...(await auditEntry(root, entry)));
    io.print(`Manifest: ${manifest.entries.length} Einträge (Stichtag ${manifest.baselineDate})`);
    for (const entry of manifest.entries) io.print(`  ${entry.sourceIdentity.padEnd(12)} ${entry.targetSlug.padEnd(28)} ${entry.importStatus.padEnd(24)} Quelle ${entry.sourceValidFrom} – ${entry.sourceValidTo ?? 'offen'} | ${entry.transformation.changes} Ersetzungen, ${entry.transformation.unresolved} unresolved`);
    if (problems.length > 0) {
      for (const problem of problems) io.error(`  ! ${problem}`);
      return 1;
    }
    io.print('Audit ok: Rohquellen-Hashes, kanonische Dateien und Reports stimmen mit dem Manifest überein.');
    return 0;
  }

  throw new Error(`Unbekannter Befehl: ${options.command}`);
}

async function auditEntry(root: string, entry: ManifestEntry): Promise<string[]> {
  const problems: string[] = [];
  if (entry.importStatus === 'dry-run' || entry.importStatus === 'failed') return problems;
  for (const raw of entry.rawDocuments) {
    if (!raw.localSource) continue;
    try {
      const bytes = await readFile(join(root, raw.localSource));
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (digest !== raw.sha256) problems.push(`${raw.localSource}: SHA-256 ${digest} ≠ Manifest ${raw.sha256}`);
    } catch {
      problems.push(`${raw.localSource}: archivierte Rohquelle fehlt`);
    }
  }
  try {
    const record = await loadNorm(TARGET_JURISDICTION, entry.targetSlug, root);
    const version = record.versions.find((candidate) => candidate.versionId === entry.baselineDate);
    if (!version) problems.push(`${entry.targetSlug}: Ausgangsfassung ${entry.baselineDate} fehlt`);
    else if ((version.sourceValidTo ?? null) !== entry.sourceValidTo || version.sourceValidFrom !== entry.sourceValidFrom) problems.push(`${entry.targetSlug}: Quellintervall der Fassung weicht vom Manifest ab`);
    if (!record.meta.externalIdentifiers.some((identifier) => identifier.system === 'recht-nrw' && identifier.value === entry.sourceIdentity)) problems.push(`${entry.targetSlug}: externe Kennung ${entry.sourceIdentity} fehlt`);
  } catch (error) {
    problems.push(`${entry.targetSlug}: ${(error as Error).message}`);
  }
  if (entry.transformation.reportPath) {
    try {
      await readFile(join(root, entry.transformation.reportPath), 'utf8');
    } catch {
      problems.push(`${entry.targetSlug}: Transformationsreport ${entry.transformation.reportPath} fehlt`);
    }
  }
  return problems;
}
