/**
 * Importpfad für eine RECHT.NRW-Stammnorm des Bereichs LRGV (Gesetze und Rechtsverordnungen):
 *
 *   Fetch → Select Source Version at Baseline → Parse Source Format → Document Identity and Body Sanity
 *     → Attachments (PDF-Policy, Transkriptionen) → Archive → Normalize Source Law (Zustimmungsgesetz)
 *     → Transform into Simulation Jurisdiction → Validate → Project → Write → Audit
 *
 * Standard ist der Dry-run: nichts wird geschrieben. Erst `write: true` legt Rohquellen (Beispielkorpus
 * versioniert, Bulk in R2), kanonische JSON-Dateien, Report, Manifesteintrag und Review-Fälle an. Jeder
 * Befund der Stufe „error“ verhindert die Übernahme (fail closed): Datenbefunde (Stichtagsauswahl,
 * Dokumentidentität, PDF-only) führen zu `needs-review`, technische Fehler zu `failed`; Normen ohne
 * Fassung am Stichtag zu `not-at-baseline`.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { loadJurisdictionNorms } from '@landesrecht/legal-core/lib/loader.ts';
import type { NormBodyBlock, NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import { assertBaselineConsistency } from '@landesrecht/legal-core/lib/versions.ts';
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';
import { buildProjectionPlan, type ProjectionPlan } from '@landesrecht/runtime/projection.ts';

import type { ArchivedObject } from '../common/archive.ts';
import { PARSER_VERSION, TARGET_JURISDICTION } from '../common/constants.ts';
import { checkDocumentIdentityAndBody, type DocumentSanityResult } from '../common/document-sanity.ts';
import { loadImportEnvironment, slugReservationFor, type ImportEnvironment } from '../common/environment.ts';
import { decodeHtml, RechtNrwFetchError, RUN_STOPPING_FETCH_ERRORS, type FetchedDocument, type RechtNrwFetcher } from '../common/fetcher.ts';
import { bodyMetrics, checkParseIntegrity, checkTransformIntegrity, rawMetrics, type IntegrityReport } from '../common/integrity.ts';
import { parseLegacyDocument } from '../common/legacy-parser.ts';
import { AUDIT_DIR, isImportedStatus, readManifest, type ImportManifest, type ManifestEntry, type ManifestOverride, type ManifestRawDocument, type RawDocumentRole, type ValidityEvidence } from '../common/manifest.ts';
import { parseNativeDocument } from '../common/native-parser.ts';
import { overridesFor, type ImportOverride } from '../common/overrides.ts';
import { assessTextCompleteness, type AttachmentInput, type TextCompletenessAssessment } from '../common/pdf.ts';
import { FileWriter, persistReview, stableStringify, writeInitialNorm } from '../common/persist.ts';
import { deriveReviewItems } from '../common/review-derivation.ts';
import { readReviewQueue, type ReviewItemInput, type ReviewQueue } from '../common/review-queue.ts';
import { writeSlugRegistry } from '../common/slug-registry.ts';
import { isImportableLrgvType, parseVersionUrl } from '../common/source-identity.ts';
import { readTranscriptions, usableTranscription } from '../common/transcription.ts';
import { selectSourceVersionAtBaseline, type SelectionResult, type SourceVersionCandidate } from '../common/version-selection.ts';
import { parseVersionPage, type RechtNrwVersionPage } from '../common/version-page.ts';
import { TRANSFORMER_VERSION } from '../transform/rules.ts';
import { transformToWest, type TransformationReport } from '../transform/transform.ts';
import { normalizeSourceLaw, type RechtNrwSourceLaw } from './normalize.ts';
import { detectConsentLaw, type ConsentLawDetection } from './treaty.ts';

export const LRGV_AUDIT_DIR = join(AUDIT_DIR, 'lrgv');

export interface ImportOptions {
  url: string;
  root: string;
  fetcher: RechtNrwFetcher;
  write?: boolean;
  baselineDate?: string;
  /** Zusätzliche dokumentierte Overrides (Tests); produktiv aus `data/imports/recht-nrw/overrides.json`. */
  overrides?: ImportOverride[];
  /** Vorhandenes Manifest (wird im Schreiblauf fortgeschrieben). */
  manifest?: ImportManifest;
  /** Vorhandene Review-Queue (wird im Schreiblauf fortgeschrieben). */
  reviewQueue?: ReviewQueue;
  /** Importumgebung (Archiv, Registries); ohne Angabe die des Beispielkorpus. */
  environment?: ImportEnvironment;
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
  integrity?: { fetchParse: IntegrityReport; sourceCanonical?: IntegrityReport };
  sanity?: DocumentSanityResult;
  completeness?: TextCompletenessAssessment;
  consentLaw?: ConsentLawDetection;
  projection?: ProjectionPlan['stats'];
  manifestEntry?: ManifestEntry;
  reviewItems: ReviewItemInput[];
  writtenFiles: string[];
  manifest?: ImportManifest;
  reviewQueue?: ReviewQueue;
  /** Term-ID und alle Fassungsadressen der Stammnorm (Zusammenführung in der Enumeration). */
  termId?: string;
  versionUrls?: string[];
}

/** Datenbefunde, die eine Übernahme verhindern, aber keine technischen Fehler sind (→ needs-review). */
const REVIEW_CLASS_ERRORS = /^(?:selection-|document-identity-|attachment-|annex-not-parsed|existing-versions|post-transform-audit|missing-issue-date)/u;

function hasErrors(findings: readonly ImportFinding[]): boolean {
  return findings.some((finding) => finding.severity === 'error');
}

export function versionUrlsOf(page: RechtNrwVersionPage): string[] {
  return [...new Set([page.address.url, ...page.versions.map((entry) => entry.url).filter((url): url is string => Boolean(url))].map((url) => parseVersionUrl(url)?.url ?? url))].sort();
}

function textOf(blocks: readonly NormBodyBlock[]): string {
  const parts: string[] = [];
  const visit = (entries: readonly NormBodyBlock[]): void => {
    for (const block of entries) {
      if (block.text) parts.push(block.text);
      if (block.children) visit(block.children);
    }
  };
  visit(blocks);
  return parts.join(' ');
}

/** Öffentlicher Einstieg: Import + Review-Queue + Manifest (Schreiblauf) bzw. nur Bericht (Dry-run). */
export async function importRechtNrwNorm(options: ImportOptions): Promise<ImportResult> {
  const now = options.now ?? (() => new Date());
  const manifest = options.manifest ?? (await readManifest(options.root));
  const reviewQueue = options.reviewQueue ?? (await readReviewQueue(options.root));
  const environment = options.environment ?? (await loadImportEnvironment(options.root, { mode: 'sample', manifest }));
  const result = await runLrgvImport({ ...options, manifest, now, environment });
  const previous = result.manifestEntry ? manifest.entries.find((entry) => entry.sourceIdentity === result.manifestEntry!.sourceIdentity) : undefined;
  const regression = Boolean(previous && isImportedStatus(previous.importStatus) && result.manifestEntry && !isImportedStatus(result.status) && result.status !== 'dry-run');
  if (regression) result.findings.push({ severity: 'error', code: 'import-regression', message: `Bereits übernommene Norm ${previous!.targetSlug} ergibt jetzt ${result.status}; Manifest und Inhalt bleiben beim zuletzt übernommenen Stand (manuelle Prüfung)` });
  result.reviewItems = deriveReviewItems(result.findings, result.report);
  const sourceIdentity = result.manifestEntry?.sourceIdentity ?? (result.page?.stemTermId ? `term:${result.page.stemTermId}` : `url:${parseVersionUrl(options.url)?.url ?? options.url}`);
  const run: Parameters<typeof persistReview>[0]['run'] = { sourceArea: 'lrgv', sourceIdentity, sourceUrl: result.manifestEntry?.sourceUrl ?? options.url, now: now().toISOString() };
  if (result.record) run.targetSlug = result.record.meta.slug;
  const persistOptions: Parameters<typeof persistReview>[0] = { root: options.root, write: Boolean(options.write), manifest, reviewQueue, run, items: result.reviewItems };
  if (result.manifestEntry && !regression) persistOptions.entry = result.manifestEntry;
  const persisted = await persistReview(persistOptions);
  result.writtenFiles.push(...persisted.written);
  result.manifest = persisted.manifest;
  result.reviewQueue = persisted.reviewQueue;
  if (regression) result.manifestEntry = previous!;
  return result;
}

interface LrgvState {
  entryPage?: RechtNrwVersionPage;
  pageDocument?: FetchedDocument;
  textDocument?: FetchedDocument;
  effectiveValidTo?: string | null;
  fetchParse?: IntegrityReport;
  sourceCanonical?: IntegrityReport;
  slugs?: Awaited<ReturnType<typeof slugReservationFor>>;
}

async function runLrgvImport(options: ImportOptions & { manifest: ImportManifest; now: () => Date; environment: ImportEnvironment }): Promise<ImportResult> {
  const env = options.environment;
  const baseline = options.baselineDate ?? SIMULATION_BASELINE_DATE;
  const log = options.log ?? (() => undefined);
  const now = options.now;
  const findings: ImportFinding[] = [];
  const result: ImportResult = { status: 'dry-run', stage: 'fetch', findings, reviewItems: [], writtenFiles: [] };
  const fetched: Array<{ role: RawDocumentRole; document: FetchedDocument }> = [];
  const fetchDocument = async (url: string, role: RawDocumentRole): Promise<FetchedDocument> => {
    log(`Abruf ${url}`);
    const document = await options.fetcher.fetch(url);
    fetched.push({ role, document });
    return document;
  };
  const state: LrgvState = {};

  // --- Fetch (Einstiegsseite) ---------------------------------------------------------------
  const address = parseVersionUrl(options.url);
  if (!address) {
    findings.push({ severity: 'error', code: 'invalid-url', message: `${options.url} ist keine RECHT.NRW-Fassungsadresse` });
    return { ...result, status: 'failed' };
  }
  if (address.section !== 'lrgv' || !isImportableLrgvType(address.documentType)) {
    findings.push({ severity: 'error', code: 'not-lrgv', message: `Nur Gesetze und Rechtsverordnungen des Bereichs LRGV werden über diesen Pfad importiert (${address.section}/${address.documentType})` });
    return { ...result, status: 'failed' };
  }
  let pageDocument = await fetchDocument(address.url, 'version-page');
  let page = parseVersionPage(decodeHtml(pageDocument), address.url);
  state.entryPage = page;
  state.pageDocument = pageDocument;
  result.page = page;
  result.versionUrls = versionUrlsOf(page);
  if (page.stemTermId) result.termId = page.stemTermId;
  const overrides: ImportOverride[] = [...(page.stemTermId ? overridesFor(env.overrides, `term:${page.stemTermId}`) : []), ...(options.overrides ?? [])];

  const finish = async (status: ManifestEntry['importStatus']): Promise<ImportResult> => finishLrgv({ status, result, state, env, options, address, baseline, overrides, fetched, now });

  // --- Select Source Version at Baseline (lokal fail-closed) ---------------------------------
  result.stage = 'select-source-version-at-baseline';
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
    if (selection.status === 'no-version-at-baseline') {
      findings.push({ severity: 'info', code: 'validity-not-at-baseline', message: selection.problems.join('; ') || `Keine Fassung deckt den Stichtag ${baseline} ab` });
      return finish('not-at-baseline');
    }
    findings.push({ severity: 'error', code: `selection-${selection.status}`, message: selection.problems.join('; ') || `Keine Stichtagsfassung (${selection.status})` });
    pushHistoricalSelectionFindings(selection, findings);
    return finish('needs-review');
  }
  // Historische Befunde (weit vom Stichtag) blockieren nicht, bleiben aber im Befund und im Review.
  pushHistoricalSelectionFindings(selection, findings);
  const selectedUrl = selection.selected.url;
  if (!selectedUrl) {
    findings.push({ severity: 'error', code: 'selection-no-url', message: 'Die Stichtagsfassung hat keine Adresse' });
    return finish('needs-review');
  }
  if (selectedUrl !== page.address.url) {
    log(`Stichtagsfassung ab ${selection.selected.validFrom}: ${selectedUrl}`);
    fetched[0]!.role = 'stem-page';
    pageDocument = await fetchDocument(selectedUrl, 'version-page');
    page = parseVersionPage(decodeHtml(pageDocument), selectedUrl);
    state.pageDocument = pageDocument;
    result.page = page;
    // Die Infobox der gewählten Seite muss den Stichtag bestätigen (URL ist nicht maßgeblich).
    const confirmed = selectSourceVersionAtBaseline(applyOverrides([{ validFrom: page.validFrom, validTo: page.validTo ?? null, available: true, url: page.address.url }], page, overrides), baseline);
    if (confirmed.status !== 'selected') {
      findings.push({ severity: 'error', code: 'selection-not-confirmed', message: `Die Infobox der gewählten Fassung (${page.validFrom ?? '?'} bis ${page.validTo ?? 'offen'}) deckt den Stichtag ${baseline} nicht ab` });
      return finish('needs-review');
    }
    // Die Seite darf der Fassungsliste nicht widersprechen (Beginn; ausdrückliches Ende gegen Folgefassung).
    const listed = selection.selected;
    const pageValidTo = overrideValue(overrides, 'sourceValidTo', page.validTo ?? null);
    const contradictions: string[] = [];
    if (page.validFrom !== listed.validFrom) contradictions.push(`„Gültig ab“ der Fassungsseite (${page.validFrom ?? '–'}) weicht von der Fassungsliste (${listed.validFrom}) ab`);
    if (pageValidTo !== null && listed.validTo !== null && pageValidTo !== listed.validTo) contradictions.push(`„Gültig bis“ der Fassungsseite (${pageValidTo}) widerspricht dem Ende laut Fassungsfolge (${listed.validTo})`);
    if (pageValidTo !== null && listed.validTo === null) contradictions.push(`Die Fassungsseite nennt ein Ende (${pageValidTo}), die Fassungsfolge weist die Fassung als offen aus`);
    if (contradictions.length > 0) {
      findings.push({ severity: 'error', code: 'selection-page-contradiction', message: contradictions.join('; ') });
      return finish('needs-review');
    }
    selection = { ...selection, selected: { ...selection.selected, ...confirmed.selected } };
    result.selection = selection;
  }
  if (!page.stemTermId) {
    findings.push({ severity: 'error', code: 'missing-stem-id', message: 'Keine Stammnorm-Kennung' });
    return { ...result, status: 'failed' };
  }
  const termId = page.stemTermId;
  result.termId = termId;
  result.versionUrls = [...new Set([...(result.versionUrls ?? []), ...versionUrlsOf(page)])].sort();
  const effectiveValidTo = overrideValue(overrides, 'sourceValidTo', page.validTo ?? null);
  state.effectiveValidTo = effectiveValidTo;
  if (effectiveValidTo !== (page.validTo ?? null)) {
    page = { ...page, findings: page.findings.filter((finding) => finding.code !== 'invalid-validity-interval') };
    if (effectiveValidTo) page.validTo = effectiveValidTo;
    else delete page.validTo;
    findings.push({ severity: 'info', code: 'override-applied', message: `sourceValidTo per dokumentierter Entscheidung auf ${effectiveValidTo ?? 'offen'} gesetzt` });
    result.page = page;
  }

  // --- Fetch (Text) + Parse Source Format ------------------------------------------------------
  result.stage = 'parse-source-format';
  let textDocument: FetchedDocument | undefined;
  let body: Parameters<typeof normalizeSourceLaw>[0]['body'];
  let rawHtmlForMetrics: string;
  let documentTitleLines: string[] = [];
  if (page.content.format === 'legacy-file') {
    textDocument = await fetchDocument(page.content.fileUrl, 'legacy-text');
    state.textDocument = textDocument;
    rawHtmlForMetrics = decodeHtml(textDocument);
    const parsed = parseLegacyDocument(rawHtmlForMetrics);
    body = { blocks: parsed.blocks, footnotes: parsed.footnotes, findings: parsed.findings, stats: parsed.stats, titleLines: parsed.head.titleLines };
    documentTitleLines = parsed.head.titleLines;
    if (parsed.head.issuedLine) body.issuedLine = parsed.head.issuedLine;
    if (parsed.head.citationNote) body.citationNote = parsed.head.citationNote;
  } else {
    rawHtmlForMetrics = page.content.bodyHtml;
    const parsed = parseNativeDocument(page.content.bodyHtml);
    body = { blocks: parsed.blocks, footnotes: parsed.footnotes, findings: parsed.findings, stats: parsed.stats };
    if (parsed.issuedLine) body.issuedLine = parsed.issuedLine;
  }

  // --- Document Identity and Body Sanity ------------------------------------------------------
  result.stage = 'document-identity';
  const sanity = checkDocumentIdentityAndBody({
    sourceArea: 'lrgv',
    portalType: address.documentType,
    portalTitle: page.title,
    ...(documentTitleLines.length > 0 ? { documentTitleLines } : {}),
    ...(page.issuedOn ? { infoboxIssuedOn: page.issuedOn } : {}),
    ...(page.promulgation ? { baseCitation: page.promulgation } : {}),
    blocks: body.blocks,
    attachments: page.attachments,
  });
  result.sanity = sanity;
  findings.push(...sanity.findings);

  // --- Attachments (HTML-Anlagen, PDF-Policy, Transkriptionen) ---------------------------------
  result.stage = 'attachments';
  const annexes: NonNullable<Parameters<typeof normalizeSourceLaw>[0]['annexes']> = [];
  const attachmentInputs: AttachmentInput[] = [];
  const transcriptions = await readTranscriptions(env.root, `term:${termId}`);
  let missingAttachments = 0;
  for (const attachment of page.attachments) {
    let document: FetchedDocument;
    try {
      document = await fetchDocument(attachment.url, 'annex');
    } catch (error) {
      // Budget, Sperre und Abbruch beenden den Lauf; eine fehlende Anlage ist ein Befund dieser Norm.
      if (!(error instanceof RechtNrwFetchError) || RUN_STOPPING_FETCH_ERRORS.includes(error.kind)) throw error;
      findings.push({ severity: 'error', code: 'attachment-fetch-failed', message: `Anlage „${attachment.label}“ nicht abrufbar (${error.message}); Text unvollständig, nicht übernommen` });
      missingAttachments += 1;
      continue;
    }
    if (attachment.mediaType === 'text/html') {
      const parsed = parseLegacyDocument(decodeHtml(document));
      const annexFindings = parsed.findings.map((finding) => ({ ...finding, message: `Anlage ${attachment.label}: ${finding.message}` }));
      annexes.push({ label: attachment.label, document, blocks: parsed.blocks, findings: annexFindings, parsed: true });
      continue;
    }
    const transcription = transcriptions.find((candidate) => candidate.target.type === 'attachment' && candidate.target.label === attachment.label);
    const usable = transcription ? usableTranscription(transcription, document) : undefined;
    if (transcription && usable && !usable.ok) findings.push({ severity: 'warning', code: 'attachment-transcription-unusable', message: `Transkription der Anlage „${attachment.label}“ nicht verwendbar: ${usable.reason}` });
    if (transcription && usable?.ok) {
      annexes.push({ label: attachment.label, document, blocks: [{ type: 'annex', label: attachment.label, children: transcription.body }], findings: [], parsed: true, transcription: true });
      findings.push({ severity: 'info', code: 'attachment-transcription-applied', message: `Anlage „${attachment.label}“: ${usable.reason}` });
    } else {
      annexes.push({ label: attachment.label, document, blocks: [], findings: [], parsed: false });
    }
    const handling = overrides.find((override) => override.field === 'attachmentHandling' && (override.value as { label: string }).label === attachment.label)?.value as { handling: AttachmentInput['handlingOverride'] } | undefined;
    const input: AttachmentInput = { label: attachment.label, url: attachment.url, mediaType: attachment.mediaType === 'unknown' ? document.contentType : attachment.mediaType, bytes: document.bytes, transcription: Boolean(usable?.ok) };
    if (handling?.handling) input.handlingOverride = handling.handling;
    attachmentInputs.push(input);
  }
  const completeness = assessTextCompleteness({ bodyText: textOf(body.blocks), bodyUnits: body.stats.units, attachments: attachmentInputs });
  result.completeness = completeness;
  findings.push(...completeness.findings);
  if (missingAttachments > 0) return finish('needs-review');

  // --- Archive Raw Source (Ablageorte deterministisch; Schreiben nur im Schreiblauf) -----------
  result.stage = 'archive-raw-source';
  const objects: Record<string, ArchivedObject> = {};
  for (const { role, document } of fetched) objects[document.sha256] ??= env.archive.locate(document, { termId, sourceArea: 'lrgv', role });

  // --- Normalize Source Law ---------------------------------------------------------------------
  result.stage = 'normalize-source-law';
  const normalizeInput: Parameters<typeof normalizeSourceLaw>[0] = { page, pageDocument, body, annexes, archived: { objects, referenceFields: (object) => env.archive.referenceFields(object) } };
  if (textDocument) normalizeInput.textDocument = textDocument;
  const sourceLaw = normalizeSourceLaw(normalizeInput);
  if (page.pdfUrl) {
    sourceLaw.sourceReferences.push({
      kind: 'primary-pdf',
      system: 'recht-nrw',
      label: 'RECHT.NRW-PDF der konsolidierten Fassung (nicht abgerufen; visuelle Kontrolle)',
      availability: 'external',
      url: page.pdfUrl,
      mediaType: 'application/pdf',
      sourceRole: 'visual-control',
      externalId: `term:${termId}`,
    });
  }
  const consentLaw = detectConsentLaw({ title: sourceLaw.title, blocks: sourceLaw.body, attachments: page.attachments });
  result.consentLaw = consentLaw;
  if (consentLaw.detected) {
    sourceLaw.type = 'zustimmungsgesetz';
    findings.push({ severity: 'info', code: 'consent-law-detected', message: `Zustimmungsgesetz erkannt (${consentLaw.evidence.join('; ')}); Vertragstext: ${consentLaw.treatyTextLocation}` });
  } else if (consentLaw.partial) {
    findings.push({ severity: 'info', code: 'consent-law-partial', message: `Nur ein Beleg für ein Zustimmungsgesetz (${consentLaw.evidence.join('; ')}); Typ bleibt Gesetz` });
  }
  result.sourceLaw = sourceLaw;
  findings.push(...sourceLaw.findings.filter((finding) => finding.code !== 'invalid-validity-interval' || effectiveValidTo === (page.validTo ?? null)));

  // Fetch → Parse wird für das Hauptdokument geprüft; Anlagen sind eigene Dokumente.
  const fetchParse = checkParseIntegrity(rawMetrics(page.content.format, rawHtmlForMetrics), bodyMetrics(body.blocks));
  state.fetchParse = fetchParse;
  for (const check of fetchParse.checks) if (!check.ok) findings.push({ severity: 'error', code: `integrity-parse-${check.name}`, message: `${check.message ?? check.name} (erwartet ${check.expected}, gefunden ${check.actual})` });

  // --- Transform into Simulation Jurisdiction ---------------------------------------------
  result.stage = 'transform-into-simulation-jurisdiction';
  const sourceIdentity = sourceLaw.sourceIdentity ?? `term:${termId}`;
  const slugs = await slugReservationFor(env, sourceIdentity);
  state.slugs = slugs;
  const { record, report, findings: transformFindings } = transformToWest(sourceLaw, { targetJurisdiction: TARGET_JURISDICTION, baselineDate: baseline, reserveSlug: slugs.reserveSlug }, { sourceArea: 'lrgv', transformation: env.transformation, institutions: env.institutions });
  findings.push(...transformFindings);
  for (const collision of slugs.collisions) findings.push({ severity: 'warning', code: 'slug-collision', message: `Slug ${collision}` });
  for (const note of slugs.notes) findings.push({ severity: 'info', code: 'slug-stable', message: note });
  result.record = record;
  result.report = report;
  const sourceCanonical = checkTransformIntegrity(bodyMetrics(sourceLaw.body), bodyMetrics(record.versions[0]!.body));
  state.sourceCanonical = sourceCanonical;
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
  if (env.projection === 'full-plan') {
    const existingWest = (await loadJurisdictionNorms(TARGET_JURISDICTION, options.root).catch(() => [] as NormRecord[])).filter((entry) => entry.meta.slug !== record.meta.slug);
    result.projection = buildProjectionPlan([...existingWest, record], { jurisdiction: TARGET_JURISDICTION, full: true, now: now().toISOString() }).stats;
  } else {
    result.projection = buildProjectionPlan([record], { jurisdiction: TARGET_JURISDICTION, full: true, now: now().toISOString() }).stats;
  }

  // --- Status -----------------------------------------------------------------------------------
  result.stage = 'audit';
  const errors = findings.filter((finding) => finding.severity === 'error');
  if (errors.length > 0) return finish(errors.every((finding) => REVIEW_CLASS_ERRORS.test(finding.code)) ? 'needs-review' : 'failed');
  return finish(options.write ? (findings.some((finding) => finding.severity === 'warning') ? 'imported-with-warnings' : 'imported') : 'dry-run');
}

async function finishLrgv(input: {
  status: ManifestEntry['importStatus'];
  result: ImportResult;
  state: LrgvState;
  env: ImportEnvironment;
  options: ImportOptions;
  address: NonNullable<ReturnType<typeof parseVersionUrl>>;
  baseline: string;
  overrides: readonly ImportOverride[];
  fetched: ReadonlyArray<{ role: RawDocumentRole; document: FetchedDocument }>;
  now: () => Date;
}): Promise<ImportResult> {
  const { status, result, state, env, options, address, baseline, now } = input;
  result.status = status;
  const page = result.page!;
  const termId = page.stemTermId ?? state.entryPage?.stemTermId;
  if (!termId) return result;
  const imported = isImportedStatus(status) || status === 'dry-run';
  const record = imported ? result.record : undefined;
  const selection = result.selection;
  const selected = selection?.status === 'selected';
  const pageDocument = state.pageDocument!;
  const effectiveValidTo = state.effectiveValidTo !== undefined ? state.effectiveValidTo : page.validTo ?? null;

  const rawDocuments: ManifestRawDocument[] = record && result.sourceLaw
    ? result.sourceLaw.rawDocuments.map((entry) => ({ ...entry }))
    : input.fetched.map(({ role, document }) => {
      const object = env.archive.locate(document, { termId, sourceArea: 'lrgv', role });
      const raw: ManifestRawDocument = { role, url: document.url, finalUrl: document.finalUrl, sha256: document.sha256, contentType: document.contentType, retrievedAt: document.retrievedAt, byteLength: document.bytes.byteLength, archiveStatus: object.status };
      if (object.localSource) raw.localSource = object.localSource;
      if (object.bucket) raw.bucket = object.bucket;
      if (object.objectKey) raw.objectKey = object.objectKey;
      return raw;
    });
  const validityEvidence: ValidityEvidence[] = [];
  if (selection) {
    validityEvidence.push({ kind: 'portal-version-list', supports: selected ? 'active-at-baseline' : 'contradiction', strength: 'strong', statement: `Fassungsliste mit ${selection.candidates.length} Fassung(en); lokale Stichtagsauswahl ${selection.status}${selection.warnings.length ? ` (${selection.warnings.length} historische Befunde)` : ''}`, sourceUrl: address.url });
    if (selected) validityEvidence.push({ kind: 'portal-version-interval', supports: 'active-at-baseline', strength: 'strong', statement: `Infobox der gewählten Fassung: Gültig ab ${page.validFrom ?? '?'} bis ${effectiveValidTo ?? 'offen'}`, sourceUrl: page.address.url, sha256: pageDocument.sha256 });
  }
  for (const override of input.overrides.filter((entry) => entry.field === 'sourceValidTo' || entry.field === 'sourceValidFrom')) validityEvidence.push({ kind: 'override', supports: override.field === 'sourceValidTo' ? 'valid-to' : 'valid-from', strength: 'strong', statement: `Dokumentierte Entscheidung ${override.id}: ${override.field} = ${String(override.value ?? 'offen')} (${override.reason})` });
  const baselineStatus: ManifestEntry['baselineStatus'] = status === 'not-at-baseline' ? 'not-active-at-baseline' : selected ? 'active-at-baseline' : 'undetermined';
  const reportPath = (record ? join(AUDIT_DIR, `${record.meta.slug}.json`) : join(LRGV_AUDIT_DIR, `term-${termId}.json`)).replace(/\\/gu, '/');
  const entry: ManifestEntry = {
    sourceSystem: 'recht-nrw',
    sourceArea: 'lrgv',
    sourceDocumentType: page.address.documentType,
    sourceIdentity: `term:${termId}`,
    sourceTitle: page.title,
    sourceType: page.address.documentType,
    sourceUrl: address.url,
    stemUrl: `https://recht.nrw.de/taxonomy/term/${termId}`,
    sourceVersion: { url: page.address.url, ...(page.validFrom ? { validFrom: page.validFrom } : {}), validTo: effectiveValidTo },
    selectedVersionUrl: page.address.url,
    sourceValidFrom: page.validFrom ?? '',
    sourceValidTo: effectiveValidTo,
    baselineStatus,
    validityProvenance: baselineStatus === 'undetermined' ? 'undetermined' : 'exact',
    validityEvidence,
    retrievedAt: pageDocument.retrievedAt,
    sha256: pageDocument.sha256,
    contentType: pageDocument.contentType,
    contentFormat: page.content.format,
    parserVersion: result.sourceLaw?.parserVersion ?? PARSER_VERSION,
    transformerVersion: TRANSFORMER_VERSION,
    targetJurisdiction: TARGET_JURISDICTION,
    targetSlug: record ? record.meta.slug : '',
    baselineDate: baseline,
    importStatus: status,
    reviewStatus: 'none',
    reconstructionStatus: record ? 'direct' : 'not-applicable',
    reconstructionSources: [],
    reconstructionSteps: [],
    archive: env.archive.mode === 'r2' ? { mode: 'r2', bucket: rawDocuments.find((raw) => raw.bucket)?.bucket ?? 'landesrecht-quellen' } : { mode: 'versioned-sample' },
    importedAt: now().toISOString(),
    rawDocuments,
    versionsConsidered: selection ? selection.candidates.map((candidate) => (candidate.url ? { validFrom: candidate.validFrom, validTo: candidate.validTo, url: candidate.url, selected: candidate.validFrom === selection.selected?.validFrom } : { validFrom: candidate.validFrom, validTo: candidate.validTo, selected: candidate.validFrom === selection.selected?.validFrom })) : [],
    overrides: input.overrides.filter((override) => override.field !== 'attachmentHandling' && override.field !== 'institutionMapping').map((override): ManifestOverride => ({ id: override.id, field: override.field, value: override.value, reason: override.reason, evidence: override.evidence, reviewedAt: override.reviewedAt })),
    findings: result.findings.filter((finding) => finding.severity !== 'info'),
    integrity: { fetchParse: state.fetchParse?.ok ?? false, sourceCanonical: state.sourceCanonical?.ok ?? false },
    transformation: { changes: result.report?.changes.length ?? 0, unresolved: result.report?.unresolved.length ?? 0, detections: result.report?.detections.length ?? 0, ...(result.report ? { postTransformAudit: result.report.postTransformAudit.ok } : {}), reportPath },
  };
  if (env.runId) entry.runId = env.runId;
  if (result.sanity) entry.documentIdentity = { status: result.sanity.status, signals: result.sanity.signals.map((signal) => `${signal.effect}:${signal.code}`) };
  if (result.completeness) {
    entry.textCompleteness = result.completeness.completeness;
    if (result.completeness.attachments.length > 0) entry.attachments = result.completeness.attachments;
  }
  if (result.consentLaw && (result.consentLaw.detected || result.consentLaw.partial)) {
    entry.consentLaw = { detected: result.consentLaw.detected, treatyTextLocation: result.consentLaw.treatyTextLocation, evidence: result.consentLaw.evidence, ...(result.consentLaw.treatyTitle ? { treatyTitle: result.consentLaw.treatyTitle } : {}) };
  }
  result.manifestEntry = entry;
  if (record && state.slugs) state.slugs.commit();
  if (!options.write || status === 'dry-run' || status === 'failed') return result;

  // Reihenfolge der Checkpoints: Rohquellen → Slug-Registry → Norm → Report; Manifest und Queue danach.
  result.stage = 'write-canonical-json';
  const writer = new FileWriter(env.root);
  const documents = new Map(input.fetched.map(({ document }) => [document.sha256, document]));
  for (const raw of rawDocuments) {
    const document = documents.get(raw.sha256);
    if (!document) continue;
    const object = env.archive.locate(document, { termId, sourceArea: 'lrgv', role: raw.role });
    const stored = await env.archive.store(document, object);
    raw.archiveStatus = stored.status;
    if (object.localSource) writer.written.push(object.localSource);
  }
  if (record) {
    await writeSlugRegistry(env.root, env.slugRegistry);
    const blocked = await writeInitialNorm(writer, record, baseline, { protectVersionedSources: env.mode === 'bulk' });
    if (blocked) {
      result.findings.push(blocked);
      result.status = 'failed';
      entry.importStatus = 'failed';
      entry.targetSlug = '';
      entry.findings.push(blocked);
      result.writtenFiles.push(...writer.written);
      return result;
    }
    await writer.jsonStable(reportPath, { ...result.report, integrity: result.integrity, documentIdentity: result.sanity, textCompleteness: result.completeness, consentLaw: result.consentLaw, generatedAt: now().toISOString() });
  } else {
    await writer.jsonStable(reportPath, {
      schemaVersion: 'recht-nrw-lrgv-audit/1',
      sourceIdentity: entry.sourceIdentity,
      sourceUrl: entry.sourceUrl,
      selectedVersionUrl: entry.selectedVersionUrl,
      importStatus: entry.importStatus,
      generatedAt: now().toISOString(),
      selection: selection ? { status: selection.status, problems: selection.problems, warnings: selection.warnings, selected: selection.selected } : undefined,
      documentIdentity: result.sanity,
      textCompleteness: result.completeness,
      consentLaw: result.consentLaw,
      integrity: result.integrity,
      transformation: result.report,
      findings: result.findings,
    });
  }
  result.writtenFiles.push(...writer.written);
  return result;
}

function pushHistoricalSelectionFindings(selection: SelectionResult, findings: ImportFinding[]): void {
  for (const finding of selection.findings) {
    if (finding.severity === 'warning') findings.push({ severity: 'warning', code: `version-${finding.code}`, message: finding.message });
  }
}

function applyOverrides(candidates: SourceVersionCandidate[], page: RechtNrwVersionPage, overrides: ReadonlyArray<{ field: string; value: unknown }>): SourceVersionCandidate[] {
  const validTo = overrides.find((override) => override.field === 'sourceValidTo');
  const validFrom = overrides.find((override) => override.field === 'sourceValidFrom');
  if (!validTo && !validFrom) return candidates;
  return candidates.map((candidate) => {
    if (candidate.validFrom !== page.validFrom) return candidate;
    const next = { ...candidate };
    if (validTo) next.validTo = validTo.value as string | null;
    if (validFrom) next.validFrom = validFrom.value as string;
    return next;
  });
}

function overrideValue(overrides: ReadonlyArray<{ field: string; value: unknown }>, field: string, fallback: string | null): string | null {
  const override = overrides.find((entry) => entry.field === field);
  return override ? (override.value as string | null) : fallback;
}

/** Quellmetadaten dürfen die Transformation nicht durchlaufen haben. */
export function assertSourceMetadataProtected(source: Pick<RechtNrwSourceLaw, 'sourceReferences' | 'sourceValidFrom' | 'sourceValidTo' | 'citation' | 'fullCitation' | 'sourceNotes'>, record: NormRecord, findings: ImportFinding[]): void {
  const version = record.versions[0]!;
  const checks: Array<[string, unknown, unknown]> = [
    ['meta.sourceReferences', source.sourceReferences, record.meta.sourceReferences],
    ['version.sourceReferences', source.sourceReferences, version.sourceReferences],
    ['version.sourceValidFrom', source.sourceValidFrom, version.sourceValidFrom],
    ['version.sourceValidTo', source.sourceValidTo, version.sourceValidTo],
    ['meta.sourceCitation', source.citation, record.meta.sourceCitation],
    ['version.sourceCitation', source.fullCitation ?? source.citation, version.sourceCitation],
    ['version.sourceNotes', source.sourceNotes, version.sourceNotes],
  ];
  for (const [path, expected, actual] of checks) {
    if (stableStringify(expected) !== stableStringify(actual)) findings.push({ severity: 'error', code: 'source-metadata-transformed', message: `${path} wurde durch die Transformation verändert` });
  }
  for (const reference of record.meta.sourceReferences) {
    if (reference.url && !reference.url.includes('recht.nrw.de')) findings.push({ severity: 'error', code: 'source-url-rewritten', message: `Quellen-URL ${reference.url} zeigt nicht mehr auf recht.nrw.de` });
  }
}

/** Liest eine bereits geschriebene Fassung (für Audits). */
export async function readCanonicalVersionBody(root: string, slug: string, versionId: string): Promise<NormBodyBlock[]> {
  const raw = JSON.parse(await readFile(join(root, 'content', 'norms', TARGET_JURISDICTION, slug, 'versions', `${versionId}.json`), 'utf8')) as { body: NormBodyBlock[] };
  return raw.body;
}
