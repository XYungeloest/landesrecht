/**
 * Importpfad für eine RECHT.NRW-Stammnorm entlang der gemeinsamen Pipeline:
 *
 *   Fetch → Archive Raw Source → Parse Source Format → Normalize Source Law
 *     → Select Source Version at Baseline → Transform into Simulation Jurisdiction → Validate
 *     → Write Canonical JSON → Project to D1 → Audit
 *
 * Standard ist der Dry-run: nichts wird geschrieben. Erst `write: true` legt Rohquellen,
 * kanonische JSON-Dateien, Transformationsreport und Manifesteintrag an. Jeder Befund der
 * Stufe „error“ bricht den Schreiblauf vor dem Schreiben ab (fail closed).
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { loadJurisdictionNorms } from '@landesrecht/legal-core/lib/loader.ts';
import type { NormBodyBlock, NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import { assertBaselineConsistency } from '@landesrecht/legal-core/lib/versions.ts';
import type { ImportFinding, TransformContext } from '@landesrecht/importer-common/pipeline.ts';
import { buildProjectionPlan, type ProjectionPlan } from '@landesrecht/runtime/projection.ts';

import { TARGET_JURISDICTION } from './constants.ts';
import { decodeHtml, type FetchedDocument, type RechtNrwFetcher } from './fetcher.ts';
import { bodyMetrics, checkParseIntegrity, checkTransformIntegrity, rawMetrics, type IntegrityReport } from './integrity.ts';
import { parseLegacyDocument } from './legacy-parser.ts';
import { AUDIT_DIR, RAW_ARCHIVE_DIR, readManifest, upsertManifestEntry, writeManifest, type ImportManifest, type ManifestEntry, type ManifestOverride, type ManifestRawDocument } from './manifest.ts';
import { parseNativeDocument } from './native-parser.ts';
import { normalizeSourceLaw, type RechtNrwSourceLaw } from './normalize.ts';
import { isImportableLrgvType, parseVersionUrl } from './source-identity.ts';
import { transformToWest, type TransformationReport } from './transform.ts';
import { selectSourceVersionAtBaseline, type SelectionResult, type SourceVersionCandidate } from './version-selection.ts';
import { parseVersionPage, type RechtNrwVersionPage } from './version-page.ts';

export interface ImportOptions {
  url: string;
  root: string;
  fetcher: RechtNrwFetcher;
  write?: boolean;
  baselineDate?: string;
  overrides?: ManifestOverride[];
  /** Vorhandenes Manifest (wird im Schreiblauf fortgeschrieben). */
  manifest?: ImportManifest;
  now?: () => Date;
  log?: (message: string) => void;
}

export interface ImportResult {
  status: ManifestEntry['importStatus'];
  stage: string;
  findings: ImportFinding[];
  page?: RechtNrwVersionPage;
  selection?: SelectionResult;
  sourceLaw?: RechtNrwSourceLaw;
  record?: NormRecord;
  report?: TransformationReport;
  integrity?: { fetchParse: IntegrityReport; sourceCanonical: IntegrityReport };
  projection?: ProjectionPlan['stats'];
  manifestEntry?: ManifestEntry;
  writtenFiles: string[];
  manifest?: ImportManifest;
}

function hasErrors(findings: readonly ImportFinding[]): boolean {
  return findings.some((finding) => finding.severity === 'error');
}

function archivePath(termId: string, document: FetchedDocument, role: ManifestRawDocument['role']): string {
  const extension = /pdf/iu.test(document.contentType) ? 'pdf' : 'html';
  return join(RAW_ARCHIVE_DIR, `term-${termId}`, `${document.sha256.slice(0, 16)}-${role}.${extension}`).replace(/\\/gu, '/');
}

async function reserveSlugFactory(root: string, manifest: ImportManifest, sourceIdentity: string): Promise<TransformContext['reserveSlug']> {
  const existing = new Set(await readdir(join(root, 'content', 'norms', TARGET_JURISDICTION)).catch(() => [] as string[]));
  const ownEntry = manifest.entries.find((entry) => entry.sourceIdentity === sourceIdentity);
  return (candidate) => {
    if (ownEntry?.targetSlug === candidate) return candidate;
    const takenByOther = existing.has(candidate) && manifest.entries.some((entry) => entry.targetSlug === candidate && entry.sourceIdentity !== sourceIdentity);
    const fixtureCollision = existing.has(candidate) && !manifest.entries.some((entry) => entry.targetSlug === candidate);
    if (!takenByOther && !fixtureCollision) return candidate;
    return `${candidate}-${sourceIdentity.replace(/^term:/u, '')}`;
  };
}

export async function importRechtNrwNorm(options: ImportOptions): Promise<ImportResult> {
  const baseline = options.baselineDate ?? SIMULATION_BASELINE_DATE;
  const log = options.log ?? (() => undefined);
  const now = options.now ?? (() => new Date());
  const findings: ImportFinding[] = [];
  const result: ImportResult = { status: 'dry-run', stage: 'fetch', findings, writtenFiles: [] };
  const manifest = options.manifest ?? (await readManifest(options.root));

  // --- Fetch (Einstiegsseite) ---------------------------------------------------------------
  const address = parseVersionUrl(options.url);
  if (!address) {
    findings.push({ severity: 'error', code: 'invalid-url', message: `${options.url} ist keine RECHT.NRW-Fassungsadresse` });
    return { ...result, status: 'failed' };
  }
  if (address.section !== 'lrgv' || !isImportableLrgvType(address.documentType)) {
    findings.push({ severity: 'error', code: 'not-lrgv', message: `Nur Gesetze und Rechtsverordnungen des Bereichs LRGV werden importiert (${address.section}/${address.documentType})` });
    return { ...result, status: 'failed' };
  }
  log(`Abruf ${address.url}`);
  let pageDocument = await options.fetcher.fetch(address.url);
  let page = parseVersionPage(decodeHtml(pageDocument), address.url);
  result.page = page;

  // --- Select Source Version at Baseline -------------------------------------------------
  result.stage = 'select-source-version-at-baseline';
  const overrides = options.overrides ?? [];
  const candidates: SourceVersionCandidate[] = page.versions.map((entry) => {
    const candidate: SourceVersionCandidate = { validFrom: entry.validFrom, available: !entry.notRenderable, label: entry.label };
    if (entry.url) candidate.url = entry.url;
    if (entry.isCurrentPage) {
      candidate.url = page.address.url;
      if (page.validTo) candidate.validTo = page.validTo;
      else if (page.validFrom) candidate.validTo = page.versions.some((other) => other.validFrom > entry.validFrom) ? undefined : null;
    }
    return candidate;
  });
  let selection = selectSourceVersionAtBaseline(applyOverrides(candidates, page, overrides), baseline);
  result.selection = selection;
  if (selection.status !== 'selected' || !selection.selected) {
    findings.push({ severity: 'error', code: `selection-${selection.status}`, message: selection.problems.join('; ') || `Keine Stichtagsfassung (${selection.status})` });
    return { ...result, status: 'failed' };
  }
  const selectedUrl = selection.selected.url;
  if (!selectedUrl) {
    findings.push({ severity: 'error', code: 'selection-no-url', message: 'Die Stichtagsfassung hat keine Adresse' });
    return { ...result, status: 'failed' };
  }
  if (selectedUrl !== page.address.url) {
    log(`Stichtagsfassung ab ${selection.selected.validFrom}: ${selectedUrl}`);
    pageDocument = await options.fetcher.fetch(selectedUrl);
    page = parseVersionPage(decodeHtml(pageDocument), selectedUrl);
    result.page = page;
    // Die Infobox der gewählten Seite muss den Stichtag bestätigen (URL ist nicht maßgeblich).
    const confirmed = selectSourceVersionAtBaseline(applyOverrides([{ validFrom: page.validFrom, validTo: page.validTo ?? null, available: true, url: page.address.url }], page, overrides), baseline);
    if (confirmed.status !== 'selected') {
      findings.push({ severity: 'error', code: 'selection-not-confirmed', message: `Die Infobox der gewählten Fassung (${page.validFrom ?? '?'} bis ${page.validTo ?? 'offen'}) deckt den Stichtag ${baseline} nicht ab` });
      return { ...result, status: 'failed' };
    }
    selection = { ...selection, selected: { ...selection.selected, ...confirmed.selected } };
    result.selection = selection;
  }
  if (!page.stemTermId) {
    findings.push({ severity: 'error', code: 'missing-stem-id', message: 'Keine Stammnorm-Kennung' });
    return { ...result, status: 'failed' };
  }
  const termId = page.stemTermId;
  const effectiveValidTo = overrideValue(overrides, 'sourceValidTo', page.validTo ?? null);
  if (effectiveValidTo !== (page.validTo ?? null)) {
    page = { ...page, findings: page.findings.filter((finding) => finding.code !== 'invalid-validity-interval') };
    if (effectiveValidTo) page.validTo = effectiveValidTo;
    else delete page.validTo;
    findings.push({ severity: 'info', code: 'override-applied', message: `sourceValidTo per dokumentierter Entscheidung auf ${effectiveValidTo ?? 'offen'} gesetzt` });
    result.page = page;
  }

  // --- Fetch (Text, Anlagen) + Parse Source Format ------------------------------------------
  result.stage = 'parse-source-format';
  let textDocument: FetchedDocument | undefined;
  let body: Parameters<typeof normalizeSourceLaw>[0]['body'];
  let rawHtmlForMetrics: string;
  if (page.content.format === 'legacy-file') {
    log(`Abruf Textdokument ${page.content.fileUrl}`);
    textDocument = await options.fetcher.fetch(page.content.fileUrl);
    rawHtmlForMetrics = decodeHtml(textDocument);
    const parsed = parseLegacyDocument(rawHtmlForMetrics);
    body = { blocks: parsed.blocks, footnotes: parsed.footnotes, findings: parsed.findings, stats: parsed.stats, titleLines: parsed.head.titleLines };
    if (parsed.head.issuedLine) body.issuedLine = parsed.head.issuedLine;
    if (parsed.head.citationNote) body.citationNote = parsed.head.citationNote;
  } else {
    rawHtmlForMetrics = page.content.bodyHtml;
    const parsed = parseNativeDocument(page.content.bodyHtml);
    body = { blocks: parsed.blocks, footnotes: parsed.footnotes, findings: parsed.findings, stats: parsed.stats };
    if (parsed.issuedLine) body.issuedLine = parsed.issuedLine;
  }
  const annexes: NonNullable<Parameters<typeof normalizeSourceLaw>[0]['annexes']> = [];
  for (const attachment of page.attachments) {
    if (attachment.mediaType === 'text/html') {
      log(`Abruf Anlage ${attachment.url}`);
      const document = await options.fetcher.fetch(attachment.url);
      const parsed = parseLegacyDocument(decodeHtml(document));
      const annexFindings = parsed.findings.map((finding) => ({ ...finding, message: `Anlage ${attachment.label}: ${finding.message}` }));
      annexes.push({ label: attachment.label, document, blocks: parsed.blocks, findings: annexFindings, parsed: true });
    } else {
      // PDF-Anlagen werden als Quelle registriert, aber nicht als Text übernommen.
      const document = await options.fetcher.fetch(attachment.url);
      annexes.push({ label: attachment.label, document, blocks: [], findings: [{ severity: 'warning', code: 'annex-pdf-only', message: `Anlage „${attachment.label}“ liegt nur als ${attachment.mediaType} vor und wird nur als Quelle registriert` }], parsed: false });
    }
  }

  // --- Archive Raw Source (Pfade deterministisch; Dateien nur im Schreiblauf) ---------------
  result.stage = 'archive-raw-source';
  const archivedPaths: Record<string, string> = { [pageDocument.sha256]: archivePath(termId, pageDocument, 'version-page') };
  if (textDocument) archivedPaths[textDocument.sha256] = archivePath(termId, textDocument, 'legacy-text');
  for (const annex of annexes) archivedPaths[annex.document.sha256] = archivePath(termId, annex.document, 'annex');

  // --- Normalize Source Law -----------------------------------------------------------------
  result.stage = 'normalize-source-law';
  const normalizeInput: Parameters<typeof normalizeSourceLaw>[0] = { page, pageDocument, body, annexes, archivedPaths };
  if (textDocument) normalizeInput.textDocument = textDocument;
  const sourceLaw = normalizeSourceLaw(normalizeInput);
  const pdfReference = page.pdfUrl;
  if (pdfReference) {
    sourceLaw.sourceReferences.push({
      kind: 'primary-pdf',
      system: 'recht-nrw',
      label: 'RECHT.NRW-PDF der konsolidierten Fassung (nicht abgerufen; visuelle Kontrolle)',
      availability: 'external',
      url: pdfReference,
      mediaType: 'application/pdf',
      sourceRole: 'visual-control',
      externalId: `term:${termId}`,
    });
  }
  result.sourceLaw = sourceLaw;
  findings.push(...sourceLaw.findings.filter((finding) => finding.code !== 'invalid-validity-interval' || effectiveValidTo === (page.validTo ?? null)));

  // Fetch → Parse wird für das Hauptdokument geprüft; Anlagen sind eigene Dokumente.
  const fetchParse = checkParseIntegrity(rawMetrics(page.content.format, rawHtmlForMetrics), bodyMetrics(body.blocks));
  for (const check of fetchParse.checks) if (!check.ok) findings.push({ severity: 'error', code: `integrity-parse-${check.name}`, message: `${check.message ?? check.name} (erwartet ${check.expected}, gefunden ${check.actual})` });

  // --- Transform into Simulation Jurisdiction ---------------------------------------------
  result.stage = 'transform-into-simulation-jurisdiction';
  const reserveSlug = await reserveSlugFactory(options.root, manifest, sourceLaw.sourceIdentity ?? `term:${termId}`);
  const { record, report, findings: transformFindings } = transformToWest(sourceLaw, { targetJurisdiction: TARGET_JURISDICTION, baselineDate: baseline, reserveSlug });
  findings.push(...transformFindings);
  result.record = record;
  result.report = report;
  const sourceCanonical = checkTransformIntegrity(bodyMetrics(sourceLaw.body), bodyMetrics(record.versions[0]!.body));
  for (const check of sourceCanonical.checks) if (!check.ok) findings.push({ severity: 'error', code: `integrity-transform-${check.name}`, message: `${check.message ?? check.name} (erwartet ${check.expected}, gefunden ${check.actual})` });
  result.integrity = { fetchParse, sourceCanonical };
  if (report.unresolved.length > 0) findings.push({ severity: 'warning', code: 'unresolved-source-references', message: `${report.unresolved.length} NRW-spezifische Bezeichnung(en) ohne automatische Entsprechung (siehe Transformationsreport)` });

  // --- Validate ------------------------------------------------------------------------------
  result.stage = 'validate';
  try {
    assertBaselineConsistency(record);
    assertSourceMetadataProtected(sourceLaw, record, findings);
  } catch (error) {
    findings.push({ severity: 'error', code: 'validation', message: (error as Error).message });
  }

  // --- Project to D1 (Plan) ---------------------------------------------------------------------
  result.stage = 'project-to-d1';
  const existingWest = (await loadJurisdictionNorms(TARGET_JURISDICTION, options.root).catch(() => [] as NormRecord[])).filter((entry) => entry.meta.slug !== record.meta.slug);
  const plan = buildProjectionPlan([...existingWest, record], { jurisdiction: TARGET_JURISDICTION, full: true, now: now().toISOString() });
  result.projection = plan.stats;

  // --- Audit / Manifest ---------------------------------------------------------------------
  result.stage = 'audit';
  const failed = hasErrors(findings);
  const status: ManifestEntry['importStatus'] = failed ? 'failed' : options.write ? (findings.some((finding) => finding.severity === 'warning') ? 'imported-with-warnings' : 'imported') : 'dry-run';
  const rawDocuments: ManifestRawDocument[] = sourceLaw.rawDocuments.map((entry) => ({ ...entry }));
  const entry: ManifestEntry = {
    sourceSystem: 'recht-nrw',
    sourceIdentity: `term:${termId}`,
    sourceTitle: page.title,
    sourceType: page.address.documentType,
    sourceUrl: address.url,
    stemUrl: `https://recht.nrw.de/taxonomy/term/${termId}`,
    selectedVersionUrl: page.address.url,
    sourceValidFrom: page.validFrom ?? '',
    sourceValidTo: effectiveValidTo,
    retrievedAt: pageDocument.retrievedAt,
    sha256: pageDocument.sha256,
    contentType: pageDocument.contentType,
    contentFormat: page.content.format,
    parserVersion: sourceLaw.parserVersion,
    targetJurisdiction: TARGET_JURISDICTION,
    targetSlug: record.meta.slug,
    baselineDate: baseline,
    importStatus: status,
    importedAt: now().toISOString(),
    rawDocuments,
    versionsConsidered: selection.candidates.map((candidate) => (candidate.url ? { validFrom: candidate.validFrom, validTo: candidate.validTo, url: candidate.url, selected: candidate.validFrom === selection.selected!.validFrom } : { validFrom: candidate.validFrom, validTo: candidate.validTo, selected: candidate.validFrom === selection.selected!.validFrom })),
    overrides,
    findings: findings.filter((finding) => finding.severity !== 'info'),
    integrity: { fetchParse: fetchParse.ok, sourceCanonical: sourceCanonical.ok },
    transformation: { changes: report.changes.length, unresolved: report.unresolved.length, reportPath: `${AUDIT_DIR}/${record.meta.slug}.json`.replace(/\\/gu, '/') },
  };
  result.manifestEntry = entry;
  result.status = status;
  if (failed || !options.write) return result;

  // --- Write Canonical JSON + Archive + Report + Manifest -----------------------------------
  result.stage = 'write-canonical-json';
  const written: string[] = [];
  const writeJson = async (relative: string, value: unknown): Promise<void> => {
    const target = join(options.root, relative);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    written.push(relative);
  };
  const writeBytes = async (relative: string, bytes: Uint8Array): Promise<void> => {
    const target = join(options.root, relative);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, bytes);
    written.push(relative);
  };
  await writeBytes(archivedPaths[pageDocument.sha256]!, pageDocument.bytes);
  if (textDocument) await writeBytes(archivedPaths[textDocument.sha256]!, textDocument.bytes);
  for (const annex of annexes) await writeBytes(archivedPaths[annex.document.sha256]!, annex.document.bytes);

  const normDir = join('content', 'norms', TARGET_JURISDICTION, record.meta.slug);
  const versionsDir = join(options.root, normDir, 'versions');
  // Nur die Ausgangsfassung darf entstehen; vorhandene Fassungsdateien werden nie überschrieben.
  const existingVersions = await readdir(versionsDir).catch(() => [] as string[]);
  const foreignVersions = existingVersions.filter((file) => file !== `${baseline}.json`);
  if (foreignVersions.length > 0) {
    findings.push({ severity: 'error', code: 'existing-versions', message: `Für ${record.meta.slug} liegen bereits weitere Fassungen vor (${foreignVersions.join(', ')}); der Initialimport überschreibt nichts` });
    return { ...result, status: 'failed', writtenFiles: written };
  }
  await rm(join(options.root, normDir), { recursive: true, force: true });
  await writeJson(join(normDir, 'meta.json'), record.meta);
  await writeJson(join(normDir, 'history.json'), record.history);
  await writeJson(join(normDir, 'versions', `${baseline}.json`), record.versions[0]);
  await writeJson(join(AUDIT_DIR, `${record.meta.slug}.json`), { ...report, integrity: result.integrity, generatedAt: now().toISOString() });
  const updatedManifest = upsertManifestEntry(manifest, entry);
  await writeManifest(options.root, updatedManifest);
  written.push(join('data', 'imports', 'recht-nrw', 'manifest.json'));
  result.manifest = updatedManifest;
  result.writtenFiles = written;
  return result;
}

function applyOverrides(candidates: SourceVersionCandidate[], page: RechtNrwVersionPage, overrides: readonly ManifestOverride[]): SourceVersionCandidate[] {
  const validTo = overrides.find((override) => override.field === 'sourceValidTo');
  if (!validTo) return candidates;
  return candidates.map((candidate) => (candidate.validFrom === page.validFrom ? { ...candidate, validTo: validTo.value } : candidate));
}

function overrideValue(overrides: readonly ManifestOverride[], field: ManifestOverride['field'], fallback: string | null): string | null {
  const override = overrides.find((entry) => entry.field === field);
  return override ? override.value : fallback;
}

/** Quellmetadaten dürfen die Transformation nicht durchlaufen haben. */
function assertSourceMetadataProtected(source: RechtNrwSourceLaw, record: NormRecord, findings: ImportFinding[]): void {
  const version = record.versions[0]!;
  const checks: Array<[string, unknown, unknown]> = [
    ['meta.sourceReferences', source.sourceReferences, record.meta.sourceReferences],
    ['version.sourceReferences', source.sourceReferences, version.sourceReferences],
    ['version.sourceValidFrom', source.sourceValidFrom, version.sourceValidFrom],
    ['version.sourceValidTo', source.sourceValidTo, version.sourceValidTo],
    ['meta.initialCitation', source.citation, record.meta.initialCitation],
    ['version.sourceNotes', source.sourceNotes, version.sourceNotes],
  ];
  for (const [path, expected, actual] of checks) {
    if (stableStringify(expected) !== stableStringify(actual)) findings.push({ severity: 'error', code: 'source-metadata-transformed', message: `${path} wurde durch die Transformation verändert` });
  }
  for (const reference of record.meta.sourceReferences) {
    if (reference.url && !reference.url.includes('recht.nrw.de')) findings.push({ severity: 'error', code: 'source-url-rewritten', message: `Quellen-URL ${reference.url} zeigt nicht mehr auf recht.nrw.de` });
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).filter((key) => (value as Record<string, unknown>)[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Liest eine bereits geschriebene Fassung (für Audits). */
export async function readCanonicalVersionBody(root: string, slug: string, versionId: string): Promise<NormBodyBlock[]> {
  const raw = JSON.parse(await readFile(join(root, 'content', 'norms', TARGET_JURISDICTION, slug, 'versions', `${versionId}.json`), 'utf8')) as { body: NormBodyBlock[] };
  return raw.body;
}
