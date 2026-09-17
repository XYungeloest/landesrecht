/**
 * Importpfad für eine LRMB-Vorschrift (Verwaltungsvorschriften, Runderlasse, Richtlinien aus dem
 * Ministerialblatt) von RECHT.NRW → Land Westdeutschland:
 *
 *   Fetch (Einstieg, jüngste Fassung) → Select Source Version at Baseline (lokal, datierte Stammnormen)
 *     → Parse (LRMB-Parser, Erlasskopf, Fundstellenverlauf) → Document Identity and Body Sanity
 *     → Text Completeness (PDF-Policy, Kopferlass) → Classify (Dokumenttyp, Normativität, Override)
 *     → Resolve Amendments (Ministerialblatt, Zuordnung über Datum und Fundstelle, Inkrafttreten)
 *     → Assess Validity (Stichtag, Kontinuität undatierter Datensätze, Textstand)
 *     → Reconstruct (nur mit geprüftem Rezept) → Integrity → Attachments → Normalize → Transform
 *     → Validate → Project → Write (Rohquellen → Slug-Registry → Norm → Report) → Audit
 *
 * Ergebnisse: importiert (direkt oder rekonstruiert), ausgeschlossen (Normativität), nicht am
 * Stichtag geltend, Review. Nur `versions/<Stichtag>.json` entsteht; die reale Historie steht in
 * Manifest, Belegen, Rekonstruktionsdaten und Audit. Dry-run ist Standard.
 */
import { join } from 'node:path';

import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { loadJurisdictionNorms } from '@landesrecht/legal-core/lib/loader.ts';
import type { NormBodyBlock, NormRecord, SourceReference, SourceRole, VersionSourceStatus } from '@landesrecht/legal-core/lib/schema.ts';
import { assertBaselineConsistency } from '@landesrecht/legal-core/lib/versions.ts';
import type { ImportFinding, SourceLaw } from '@landesrecht/importer-common/pipeline.ts';
import { buildProjectionPlan, type ProjectionPlan } from '@landesrecht/runtime/projection.ts';

import { SOURCE_SYSTEM, TARGET_JURISDICTION } from '../common/constants.ts';
import { checkDocumentIdentityAndBody, type DocumentSanityResult } from '../common/document-sanity.ts';
import { loadImportEnvironment, slugReservationFor, type ImportEnvironment } from '../common/environment.ts';
import { decodeHtml, RechtNrwFetchError, RUN_STOPPING_FETCH_ERRORS, type FetchedDocument, type RechtNrwFetcher } from '../common/fetcher.ts';
import { bodyMetrics, checkTransformIntegrity, type IntegrityCheck, type IntegrityReport } from '../common/integrity.ts';
import { AUDIT_DIR, isImportedStatus, readManifest, readManifestEntry, type ImportManifest, type ManifestEntry, type ManifestOverride, type ManifestRawDocument, type ReconstructionPlan } from '../common/manifest.ts';
import { recordUnresolvedSource } from '../common/unresolved.ts';
import { overridesFor, overrideValue, type ImportOverride } from '../common/overrides.ts';
import { assessTextCompleteness, type AttachmentInput, type TextCompletenessAssessment } from '../common/pdf.ts';
import { FileWriter, persistReview, writeInitialNorm } from '../common/persist.ts';
import { deriveReviewItems } from '../common/review-derivation.ts';
import { readReviewQueue, type ReviewItemInput, type ReviewQueue } from '../common/review-queue.ts';
import { writeSlugRegistry } from '../common/slug-registry.ts';
import { parseVersionUrl, stemIdentifier } from '../common/source-identity.ts';
import { readTranscriptions, usableTranscription } from '../common/transcription.ts';
import { selectSourceVersionAtBaseline, type SelectionResult, type SourceVersionCandidate } from '../common/version-selection.ts';
import { parseVersionPage, type RechtNrwVersionPage } from '../common/version-page.ts';
import { splitTitle } from '../lrgv/normalize.ts';
import { assertSourceMetadataProtected, preservedArchiveStatus, versionUrlsOf } from '../lrgv/pipeline.ts';
import { TRANSFORMER_VERSION } from '../transform/rules.ts';
import { formatBaseline, transformToWest, type TransformationReport } from '../transform/transform.ts';
import { applyNormativityOverride, assessNormativity, classifyLrmbDocumentType, type DocumentTypeClassification, type NormativityDecision } from './classify.ts';
import { gazetteEntryUrlCandidates, identifiesBaseDocument, parseGazetteEntry, resolveInForceDate, type GazetteEntry } from './gazette.ts';
import { LRMB_PARSER_VERSION, lrmbRawMetrics, parseLrmbDocument, type LrmbParseResult } from './parser.ts';
import { applyReconstruction, readReconstructionRecipe, type GazetteDocument, type ReconstructionRecipe, type ReconstructionResult } from './reconstruction.ts';
import { parseChangeNote, parseDecreeFromTitle, parsePublicationHistoryItem, parseValidityClauses, type ChangeNote, type ChangeNoteAmendment } from './text-metadata.ts';
import { assessLrmbValidity, type AmendmentEvidence, type LrmbValidityAssessment } from './validity.ts';

export const LRMB_AUDIT_DIR = join(AUDIT_DIR, 'lrmb');

export interface LrmbImportOptions {
  url: string;
  root: string;
  fetcher: RechtNrwFetcher;
  write?: boolean;
  baselineDate?: string;
  manifest?: ImportManifest;
  reviewQueue?: ReviewQueue;
  environment?: ImportEnvironment;
  /** Zusätzliche dokumentierte Overrides (Tests); produktiv aus `data/imports/recht-nrw/overrides.json`. */
  overrides?: ImportOverride[];
  now?: () => Date;
  log?: (message: string) => void;
}

export interface LrmbImportResult {
  status: ManifestEntry['importStatus'];
  stage: string;
  /** Datensatz einer Quelle ohne Stammnorm-Kennung (`data/audits/recht-nrw/lrmb/unresolved/`). */
  unresolvedReport?: string;
  findings: ImportFinding[];
  page?: RechtNrwVersionPage;
  latestPage?: RechtNrwVersionPage;
  selection?: SelectionResult;
  parse?: LrmbParseResult;
  classification?: DocumentTypeClassification;
  normativity?: NormativityDecision;
  sanity?: DocumentSanityResult;
  completeness?: TextCompletenessAssessment;
  changeNote?: ChangeNote;
  amendments?: AmendmentEvidence[];
  validity?: LrmbValidityAssessment;
  reconstruction?: ReconstructionResult;
  record?: NormRecord;
  report?: TransformationReport;
  integrity?: { fetchParse: IntegrityReport; sourceCanonical?: IntegrityReport };
  projection?: ProjectionPlan['stats'];
  manifestEntry?: ManifestEntry;
  reviewItems: ReviewItemInput[];
  writtenFiles: string[];
  manifest?: ImportManifest;
  reviewQueue?: ReviewQueue;
  termId?: string;
  versionUrls?: string[];
}

interface RawEntry {
  role: ManifestRawDocument['role'];
  document: FetchedDocument;
  label: string;
}

const hasErrors = (findings: readonly ImportFinding[]): boolean => findings.some((finding) => finding.severity === 'error');
const longDate = (iso: string | undefined): string => (iso ? formatBaseline(iso) : 'unbekanntem Datum');

/** Öffentlicher Einstieg: Import + Review-Queue + Manifest (Schreiblauf) bzw. nur Bericht (Dry-run). */
export async function importRechtNrwLrmbDocument(options: LrmbImportOptions): Promise<LrmbImportResult> {
  const now = options.now ?? (() => new Date());
  const manifest = options.manifest ?? (await readManifest(options.root));
  const reviewQueue = options.reviewQueue ?? (await readReviewQueue(options.root));
  const environment = options.environment ?? (await loadImportEnvironment(options.root, { mode: 'sample', manifest }));
  const result = await runLrmbImport({ ...options, manifest, now, environment });
  // Wie im LRGV-Pfad: Der gespeicherte Stand muss auch dann gefunden werden, wenn der Bulk-Runner die Identität
  // vor dem Abruf nicht kannte (Slug-Stamm ohne Term-Kennung).
  const previous = result.manifestEntry
    ? manifest.entries.find((entry) => entry.sourceIdentity === result.manifestEntry!.sourceIdentity) ?? (await readManifestEntry(options.root, 'lrmb', result.manifestEntry.sourceIdentity))
    : undefined;
  const regression = Boolean(previous && isImportedStatus(previous.importStatus) && result.manifestEntry && !isImportedStatus(result.status) && result.status !== 'dry-run');
  if (regression) result.findings.push({ severity: 'error', code: 'import-regression', message: `Bereits übernommene Vorschrift ${previous!.targetSlug} ergibt jetzt ${result.status}; Manifest und Inhalt bleiben beim zuletzt übernommenen Stand (manuelle Prüfung)` });
  result.reviewItems = deriveReviewItems(result.findings, result.report);
  const sourceIdentity = result.manifestEntry?.sourceIdentity ?? (result.page?.stemTermId ? `term:${result.page.stemTermId}` : `url:${parseVersionUrl(options.url)?.url ?? options.url}`);
  const run: Parameters<typeof persistReview>[0]['run'] = { sourceArea: 'lrmb', sourceIdentity, sourceUrl: options.url, now: now().toISOString() };
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

interface LrmbState {
  validity?: LrmbValidityAssessment;
  reconstruction?: ReconstructionResult;
  recipe?: ReconstructionRecipe;
  fetchParse?: IntegrityReport;
  sourceCanonical?: IntegrityReport;
  record?: NormRecord;
  report?: TransformationReport;
  slugs?: Awaited<ReturnType<typeof slugReservationFor>>;
  attachmentsLoaded?: boolean;
}

async function runLrmbImport(options: LrmbImportOptions & { manifest: ImportManifest; now: () => Date; environment: ImportEnvironment }): Promise<LrmbImportResult> {
  const env = options.environment;
  const baseline = options.baselineDate ?? SIMULATION_BASELINE_DATE;
  const log = options.log ?? (() => undefined);
  const findings: ImportFinding[] = [];
  const result: LrmbImportResult = { status: 'dry-run', stage: 'fetch', findings, reviewItems: [], writtenFiles: [] };
  const rawEntries: RawEntry[] = [];
  const fetchDocument = async (url: string, role: RawEntry['role'], label: string): Promise<FetchedDocument> => {
    log(`Abruf ${url}`);
    const document = await options.fetcher.fetch(url);
    rawEntries.push({ role, document, label });
    return document;
  };

  // --- Fetch ------------------------------------------------------------------------------------
  const address = parseVersionUrl(options.url);
  if (!address) {
    findings.push({ severity: 'error', code: 'invalid-url', message: `${options.url} ist keine RECHT.NRW-Adresse` });
    return { ...result, status: 'failed' };
  }
  if (address.section !== 'lrmb') {
    findings.push({ severity: 'error', code: 'not-lrmb', message: `Nur Dokumente des Bereichs LRMB werden über diesen Pfad importiert (${address.section}/${address.documentType})` });
    return { ...result, status: 'failed' };
  }
  let pageDocument = await fetchDocument(address.url, 'version-page', 'RECHT.NRW-Seite der gewählten Fassung');
  let page = parseVersionPage(decodeHtml(pageDocument), address.url);
  result.page = page;
  result.versionUrls = versionUrlsOf(page);
  if (!page.stemTermId) {
    findings.push({ severity: 'error', code: 'missing-stem-id', message: 'Keine Stammnorm-Kennung (Taxonomie-Term)' });
    // Expliziter Datensatz statt stillem Abbruch (URL, Titel, Grund, Abrufstatus, Hashes); keine Kennung wird erfunden.
    const unresolved = await recordUnresolvedSource({ root: options.root, write: Boolean(options.write), area: 'lrmb', url: address.url, ...(page.title ? { title: page.title } : {}), importStatus: 'failed', findings, documents: rawEntries, ...(env.runId ? { runId: env.runId } : {}), now: options.now().toISOString() });
    result.unresolvedReport = unresolved.path;
    if (unresolved.written) result.writtenFiles.push(unresolved.path);
    return { ...result, status: 'failed' };
  }
  const termId = page.stemTermId;
  result.termId = termId;
  const undated = !address.pathDate;
  const overrides: ImportOverride[] = [...overridesFor(env.overrides, `term:${termId}`), ...(options.overrides ?? [])];
  const locate = (document: FetchedDocument, role: RawEntry['role']) => env.archive.locate(document, { termId, sourceArea: 'lrmb', role });

  // --- Jüngste Fassung der Stammnorm (Fundstellenverlauf, Veröffentlichungsvermerke) ------------
  result.stage = 'stem-history';
  let latestPage = page;
  let latestDocument = pageDocument;
  const newest = [...page.versions].sort((left, right) => right.validFrom.localeCompare(left.validFrom))[0];
  if (newest && !newest.isCurrentPage && newest.url) {
    latestDocument = await fetchDocument(newest.url, 'stem-page', `RECHT.NRW-Seite der jüngsten Fassung (ab ${newest.validFrom})`);
    latestPage = parseVersionPage(decodeHtml(latestDocument), newest.url);
  }
  result.latestPage = latestPage;

  // --- Select Source Version at Baseline (datierte Stammnormen) --------------------------------
  result.stage = 'select-source-version-at-baseline';
  let selection: SelectionResult | undefined;
  if (!undated) {
    const entryPage = page;
    const candidates: SourceVersionCandidate[] = entryPage.versions.map((entry) => {
      const candidate: SourceVersionCandidate = { validFrom: entry.validFrom, available: !entry.notRenderable, label: entry.label };
      if (entry.url) candidate.url = entry.url;
      if (entry.isCurrentPage) {
        candidate.url = entryPage.address.url;
        if (entryPage.validTo) candidate.validTo = entryPage.validTo;
        else if (entryPage.validFrom) candidate.validTo = entryPage.versions.some((other) => other.validFrom > entry.validFrom) ? undefined : null;
      }
      return candidate;
    });
    selection = selectSourceVersionAtBaseline(candidates, baseline);
    result.selection = selection;
    for (const finding of selection.findings) if (finding.severity === 'warning') findings.push({ severity: 'warning', code: `version-${finding.code}`, message: finding.message });
    const selectedUrl = selection.status === 'selected' ? selection.selected?.url : undefined;
    if (selectedUrl && selectedUrl !== page.address.url) {
      rawEntries[0]!.role = 'stem-page';
      rawEntries[0]!.label = 'RECHT.NRW-Seite (Einstiegsfassung)';
      const reuse = latestPage.address.url === selectedUrl;
      if (reuse) {
        const latestEntry = rawEntries.find((entry) => entry.document === latestDocument);
        if (latestEntry) {
          latestEntry.role = 'version-page';
          latestEntry.label = 'RECHT.NRW-Seite der gewählten Fassung';
        }
        pageDocument = latestDocument;
        page = latestPage;
      } else {
        pageDocument = await fetchDocument(selectedUrl, 'version-page', `RECHT.NRW-Seite der gewählten Fassung (ab ${selection.selected!.validFrom})`);
        page = parseVersionPage(decodeHtml(pageDocument), selectedUrl);
      }
      result.page = page;
      const listed = selection.selected!;
      const contradictions: string[] = [];
      if (page.validFrom !== listed.validFrom) contradictions.push(`„Gültig ab“ der Fassungsseite (${page.validFrom ?? '–'}) weicht von der Fassungsliste (${listed.validFrom}) ab`);
      if (page.validTo && listed.validTo && page.validTo !== listed.validTo) contradictions.push(`„Gültig bis“ der Fassungsseite (${page.validTo}) widerspricht der Fassungsfolge (${listed.validTo})`);
      if (contradictions.length > 0) findings.push({ severity: 'error', code: 'selection-page-contradiction', message: contradictions.join('; ') });
    }
  }
  result.versionUrls = [...new Set([...(result.versionUrls ?? []), ...versionUrlsOf(page), ...versionUrlsOf(latestPage)])].sort();

  // --- Parse -------------------------------------------------------------------------------------
  result.stage = 'parse-source-format';
  findings.push(...page.findings);
  if (page.content.format !== 'native') findings.push({ severity: 'error', code: 'structure-lrmb-legacy-format', message: 'LRMB-Fassung im Legacy-Dateiformat; der LRMB-Parser übernimmt nur das native Format (Review)' });
  const parse = parseLrmbDocument(page.content.format === 'native' ? page.content.bodyHtml : '');
  result.parse = parse;
  findings.push(...parse.findings);
  const titleDecree = parseDecreeFromTitle(page.title);
  const title = titleDecree?.title ?? page.title;
  const decreeKind = parse.head.decreeKind ?? (titleDecree ? 'runderlass' : undefined);
  const issuedOn = parse.head.issuedOn ?? titleDecree?.issuedOn ?? page.issuedOn;
  const headLines = parse.headLines.length > 0 ? parse.headLines : titleDecree ? [{ path: 'page.title', text: titleDecree.decreeText }] : [];
  const changeNote = parse.changeNoteText ? parseChangeNote(parse.changeNoteText) : undefined;
  if (changeNote) result.changeNote = changeNote;

  const state: LrmbState = {};
  const finish = async (status: ManifestEntry['importStatus']): Promise<LrmbImportResult> => finishLrmb({ status, result, state, env, options, address, termId, baseline, overrides, rawEntries, pageDocument, page, locate, now: options.now });

  // --- Document Identity and Body Sanity ------------------------------------------------------
  result.stage = 'document-identity';
  const titleDecreeSignals: { issuedOn?: string; fileReference?: string } = {};
  if (titleDecree?.issuedOn) titleDecreeSignals.issuedOn = titleDecree.issuedOn;
  if (titleDecree?.fileReference) titleDecreeSignals.fileReference = titleDecree.fileReference;
  const sanity = checkDocumentIdentityAndBody({
    sourceArea: 'lrmb',
    portalType: address.documentType,
    portalTitle: title,
    documentTitleLines: parse.head.titleLines,
    head: parse.head,
    ...(titleDecree ? { titleDecree: titleDecreeSignals } : {}),
    ...(page.issuedOn ? { infoboxIssuedOn: page.issuedOn } : {}),
    ...(changeNote?.base ? { baseCitation: changeNote.base.text } : {}),
    blocks: parse.blocks,
    attachments: page.attachments,
  });
  result.sanity = sanity;
  findings.push(...sanity.findings);

  // --- Classify -----------------------------------------------------------------------------------
  result.stage = 'classify';
  const classification = classifyLrmbDocumentType(decreeKind ? { title, decreeKind } : { title });
  const normativityOverride = overrideValue<string>(overrides, 'normativity');
  const normativity = applyNormativityOverride(assessNormativity({ portalType: address.documentType, title, ...(decreeKind ? { decreeKind } : {}), bodyText: parse.bodyTexts.join(' ') }), normativityOverride ? { value: normativityOverride.value, reason: normativityOverride.override.reason, id: normativityOverride.override.id } : undefined);
  result.classification = classification;
  result.normativity = normativity;

  // --- Anlagen laden (PDF-Policy, Transkriptionen) ------------------------------------------------
  const transcriptions = await readTranscriptions(env.root, `term:${termId}`);
  const attachmentBlocks: NormBodyBlock[] = [];
  const loadAttachments = async (): Promise<AttachmentInput[]> => {
    const inputs: AttachmentInput[] = [];
    if (!state.attachmentsLoaded) state.attachmentsLoaded = true;
    for (const attachment of page.attachments) {
      const role: RawEntry['role'] = attachment.mediaType === 'text/html' ? 'annex' : 'pdf';
      let document: FetchedDocument | undefined = rawEntries.find((entry) => entry.document.url === attachment.url)?.document;
      if (!document) {
        try {
          document = await fetchDocument(attachment.url, role, `RECHT.NRW-Anlage: ${attachment.label}`);
        } catch (error) {
          if (error instanceof RechtNrwFetchError && RUN_STOPPING_FETCH_ERRORS.includes(error.kind)) throw error;
          findings.push({ severity: 'error', code: 'attachment-fetch-failed', message: `Anlage „${attachment.label}“ nicht abrufbar (${(error as Error).message}); nicht archiviert` });
        }
      }
      const input: AttachmentInput = { label: attachment.label, url: attachment.url, mediaType: attachment.mediaType === 'unknown' ? document?.contentType ?? 'application/octet-stream' : attachment.mediaType };
      if (document) input.bytes = document.bytes;
      const handling = overrides.find((override) => override.field === 'attachmentHandling' && (override.value as { label: string }).label === attachment.label)?.value as { handling: AttachmentInput['handlingOverride'] } | undefined;
      if (handling?.handling) input.handlingOverride = handling.handling;
      const transcription = transcriptions.find((candidate) => candidate.target.type === 'attachment' && candidate.target.label === attachment.label);
      if (transcription && document) {
        const usable = usableTranscription(transcription, document);
        if (usable.ok) {
          input.transcription = true;
          attachmentBlocks.push({ type: 'annex', label: attachment.label, children: transcription.body });
          findings.push({ severity: 'info', code: 'attachment-transcription-applied', message: `Anlage „${attachment.label}“: ${usable.reason}` });
        } else {
          findings.push({ severity: 'warning', code: 'attachment-transcription-unusable', message: `Transkription der Anlage „${attachment.label}“ nicht verwendbar: ${usable.reason}` });
        }
      }
      inputs.push(input);
    }
    return inputs;
  };

  // --- Text Completeness: Kopferlass mit Regelungsgehalt nur in PDF-Anlagen -------------------------
  result.stage = 'text-completeness';
  const bodyText = parse.bodyTexts.join(' ');
  const preliminary = assessTextCompleteness({ bodyText, bodyUnits: parse.stats.units, attachments: page.attachments.map((attachment) => ({ label: attachment.label, url: attachment.url, mediaType: attachment.mediaType })) });
  // Blockierte Textvollständigkeit verhindert jede Übernahme. Ist die Normativität des Kopferlasses
  // eindeutig, wird die Geltung am Stichtag trotzdem bestimmt (Coverage, Transkriptionspriorität).
  let textBlocked = false;
  if (preliminary.blocking) {
    const completeness = assessTextCompleteness({ bodyText, bodyUnits: parse.stats.units, attachments: await loadAttachments() });
    result.completeness = completeness;
    if (completeness.blocking) {
      textBlocked = true;
      findings.push(...completeness.findings);
      if (normativity.decision === 'review') findings.push({ severity: 'info', code: 'normativity-deferred', message: `Normativität erst nach Transkription entscheidbar: ${normativity.reasons.join('; ')}` });
      if (normativity.decision !== 'include') return finish('needs-review');
    }
  }
  result.stage = 'classify';

  if (sanity.status === 'mismatch') return finish('needs-review');
  if (normativity.decision === 'exclude') {
    findings.push({ severity: 'info', code: 'normativity-exclude', message: `Nicht übernommen (docs/LEGAL_SCOPE.md): ${normativity.reasons.join('; ')}` });
    return finish('excluded');
  }
  if (normativity.decision === 'review') {
    findings.push({ severity: 'error', code: 'normativity-review', message: `Normativität manuell prüfen: ${normativity.reasons.join('; ')}` });
    return finish('needs-review');
  }

  // --- Resolve Amendments ------------------------------------------------------------------------
  result.stage = 'resolve-amendments';
  const latestParse = latestPage === page ? parse : latestPage.content.format === 'native' ? parseLrmbDocument(latestPage.content.bodyHtml) : undefined;
  const latestChangeNote = latestParse?.changeNoteText ? parseChangeNote(latestParse.changeNoteText) : undefined;
  const publicationItems = latestPage.changeHistoryItems.map((item) => parsePublicationHistoryItem(item)).filter((item): item is ChangeNoteAmendment => item !== undefined);
  const completenessText = latestPage.changeHistoryItems.find((item) => /Redaktioneller Hinweis/u.test(item));
  const amendments = new Map<string, AmendmentEvidence>();
  const keyOf = (note: ChangeNoteAmendment): string => note.decreeDate ?? note.decreeDateText;
  for (const note of changeNote?.amendments ?? []) amendments.set(keyOf(note), { note, incorporated: true, inForceDerivation: 'nicht bestimmt' });
  for (const note of latestChangeNote?.amendments ?? []) if (!amendments.has(keyOf(note))) amendments.set(keyOf(note), { note, incorporated: false, inForceDerivation: 'nicht bestimmt' });
  for (const note of publicationItems) {
    if (amendments.has(keyOf(note))) continue;
    const evidence: AmendmentEvidence = { note, incorporated: false, inForceDerivation: note.inForce ? 'Veröffentlichungsvermerk des Portals („in Kraft getreten am …“)' : 'Veröffentlichungsvermerk ohne Inkrafttreten' };
    if (note.inForce) evidence.inForce = note.inForce;
    amendments.set(keyOf(note), evidence);
  }
  const baseCitation = changeNote?.base ?? latestChangeNote?.base;
  const gazettes = new Map<string, { entry: GazetteEntry; document: FetchedDocument }>();
  for (const amendment of amendments.values()) {
    const citation = amendment.note.citation;
    if (!citation || citation.gazette !== 'MBl. NRW.') {
      if (!amendment.inForce) amendment.inForceDerivation = amendment.note.unpublished ? 'nicht veröffentlicht (n. v.) – Inkrafttreten nicht belegbar' : `Fundstelle ${citation?.text ?? '–'} ohne abrufbaren Ministerialblatt-Eintrag`;
      continue;
    }
    const attempts: string[] = [];
    for (const candidate of gazetteEntryUrlCandidates(citation)) {
      let document: FetchedDocument;
      try {
        log(`Abruf Ministerialblatt ${candidate}`);
        document = await options.fetcher.fetch(candidate);
      } catch (error) {
        if (error instanceof RechtNrwFetchError && RUN_STOPPING_FETCH_ERRORS.includes(error.kind)) throw error;
        attempts.push(`${candidate}: ${(error as Error).message}`);
        continue;
      }
      const entry = parseGazetteEntry(decodeHtml(document), candidate);
      const identification = identifiesBaseDocument(entry, { ...(issuedOn ? { issuedOn } : {}), ...(baseCitation ? { citation: baseCitation } : {}) });
      if (!identification.ok) {
        attempts.push(`${candidate}: ${identification.reason}`);
        continue;
      }
      rawEntries.push({ role: 'gazette-amendment', document, label: `Ministerialblatt ${citation.text}: ${entry.title}` });
      gazettes.set(candidate, { entry, document });
      const inForce = resolveInForceDate(entry);
      amendment.gazetteUrl = candidate;
      amendment.gazetteSha256 = document.sha256;
      amendment.gazetteTitle = entry.title;
      amendment.gazetteText = entry.text;
      if (entry.publishedOn) amendment.publishedOn = entry.publishedOn;
      amendment.identification = identification;
      if (inForce.date) amendment.inForce = inForce.date;
      amendment.inForceDerivation = inForce.derivation;
      if (entry.predecessor) amendment.predecessor = { latest: entry.predecessor.latest, ...(entry.predecessor.date ? { date: entry.predecessor.date } : {}) };
      break;
    }
    if (!amendment.gazetteUrl) {
      amendment.identification = { ok: false, reason: attempts.join('; ') || 'keine Kandidatenadresse' };
      if (!amendment.inForce) amendment.inForceDerivation = 'Ministerialblatt-Eintrag nicht zugeordnet';
    }
  }
  result.amendments = [...amendments.values()].sort((left, right) => (left.note.decreeDate ?? '').localeCompare(right.note.decreeDate ?? ''));

  // --- Assess Validity ----------------------------------------------------------------------------
  result.stage = 'assess-validity';
  const clauses = parseValidityClauses(parse.bodyTexts);
  const validityInput: Parameters<typeof assessLrmbValidity>[0] = {
    baseline,
    page: { url: page.address.url, sha256: pageDocument.sha256, undated, hasLaterVersions: page.versions.some((entry) => Boolean(page.validFrom) && entry.validFrom > page.validFrom!) },
    clauses,
    amendments: result.amendments,
    versionStarts: page.versions.map((entry) => entry.validFrom),
    contraryTexts: [...new Set([...page.changeHistoryItems, ...latestPage.changeHistoryItems])].filter((item) => !/Redaktioneller Hinweis/u.test(item)),
  };
  if (page.validFrom) validityInput.page.validFrom = page.validFrom;
  if (page.validTo) validityInput.page.validTo = page.validTo;
  if (selection) validityInput.selection = selection;
  if (completenessText) validityInput.completenessNotice = { text: completenessText.replace(/^Redaktioneller Hinweis\s*:?\s*/u, ''), url: latestPage.address.url, sha256: latestDocument.sha256 };
  if (changeNote) validityInput.changeNote = changeNote;
  if (issuedOn) validityInput.issuedOn = issuedOn;
  const signals = env.searchSignals.get(page.address.url) ?? env.searchSignals.get(address.url);
  if (signals) {
    validityInput.indexSignals = {};
    if (signals.historically !== undefined) validityInput.indexSignals.historically = signals.historically;
    if (signals.outforceDate) validityInput.indexSignals.outforceDate = signals.outforceDate;
    if (signals.effectiveFrom) validityInput.indexSignals.effectiveFrom = signals.effectiveFrom;
  }
  const validity = assessLrmbValidity(validityInput);
  state.validity = validity;
  result.validity = validity;
  findings.push(...validity.findings);
  if (validity.baselineStatus === 'not-active-at-baseline') return finish('not-at-baseline');
  if (validity.baselineStatus === 'undetermined') return finish('needs-review');
  if (textBlocked) return finish('needs-review');

  // --- Reconstruct ------------------------------------------------------------------------------
  let blocks: NormBodyBlock[] = parse.blocks;
  if (validity.textStatus === 'reconstruction-required') {
    result.stage = 'reconstruct';
    const blocking = findings.filter((finding) => finding.severity === 'error' && finding.code !== 'reconstruction-required');
    const recipe = blocking.length === 0 ? await readReconstructionRecipe(options.root, `term:${termId}`) : undefined;
    if (!recipe) {
      if (blocking.length === 0) findings.push({ severity: 'info', code: 'reconstruction-recipe-missing', message: `Kein geprüftes Rekonstruktionsrezept (data/imports/recht-nrw/reconstructions/term-${termId}.json)` });
      return finish('needs-review');
    }
    state.recipe = recipe;
    const required = recipe.mode === 'reverse' ? validity.postBaselineAmendments : validity.missingPreBaselineAmendments;
    const documents = new Map<string, GazetteDocument>();
    for (const [url, { entry, document }] of gazettes) {
      const object = locate(document, 'gazette-amendment');
      const gazette: GazetteDocument = { url, text: entry.text, sha256: document.sha256, retrievedAt: document.retrievedAt };
      if (object.localSource) gazette.localSource = object.localSource;
      if (object.objectKey) gazette.objectKey = object.objectKey;
      documents.set(url, gazette);
    }
    const baseObject = locate(pageDocument, 'version-page');
    const reconstructionInput: Parameters<typeof applyReconstruction>[1] = { blocks: parse.blocks, baselineDate: baseline, required, gazettes: documents, baseSource: { url: pageDocument.finalUrl, sha256: pageDocument.sha256, retrievedAt: pageDocument.retrievedAt, ...(baseObject.localSource ? { localSource: baseObject.localSource } : {}), ...(baseObject.objectKey ? { objectKey: baseObject.objectKey } : {}) } };
    const reconstruction = applyReconstruction(recipe, reconstructionInput);
    state.reconstruction = reconstruction;
    result.reconstruction = reconstruction;
    findings.push(...reconstruction.findings);
    const repeated = applyReconstruction(recipe, reconstructionInput);
    if (repeated.resultFingerprint !== reconstruction.resultFingerprint) findings.push({ severity: 'error', code: 'reconstruction-nondeterministic', message: 'Wiederholte Rekonstruktion liefert ein anderes Ergebnis' });
    if (!reconstruction.ok || hasErrors(findings.filter((finding) => finding.code !== 'reconstruction-required'))) return finish('needs-review');
    const requiredIndex = findings.findIndex((finding) => finding.code === 'reconstruction-required');
    if (requiredIndex >= 0) findings.splice(requiredIndex, 1, { severity: 'info', code: 'reconstruction-applied', message: `Stichtagsfassung mit geprüftem Rezept rekonstruiert (${reconstruction.steps.length} Schritte; Basis ${reconstruction.baseFingerprint.slice(0, 12)} → Ergebnis ${reconstruction.resultFingerprint.slice(0, 12)})` });
    blocks = reconstruction.blocks;
  }

  // --- Integrity ------------------------------------------------------------------------------------
  result.stage = 'integrity';
  const raw = lrmbRawMetrics(page.content.format === 'native' ? page.content.bodyHtml : '');
  const checks: IntegrityCheck[] = [];
  const same = (name: string, expected: number, actual: number, message: string): void => {
    checks.push(expected === actual ? { name, expected, actual, ok: true } : { name, expected, actual, ok: false, message });
  };
  same('numberedUnits', raw.numberedParagraphs, parse.stats.units, 'Anzahl der nummerierten Einheiten weicht vom Roh-HTML ab');
  same('tables', raw.tables, parse.stats.tables, 'Tabellen fehlen oder wurden zusätzlich erzeugt');
  same('footnoteMarkers', raw.footnoteMarkers, parse.stats.footnoteMarkers, 'Fußnotenverweise fehlen oder sind zusätzlich');
  same('duplicateUnits', 0, parse.stats.duplicateLabels.length, `Doppelte Nummern: ${parse.stats.duplicateLabels.join(', ')}`);
  const parsedTotal = parse.stats.textLength + parse.stats.excludedTextLength;
  const tolerance = Math.max(200, Math.round(raw.textLength * 0.03));
  checks.push(Math.abs(parsedTotal - raw.textLength) <= tolerance ? { name: 'textLength', expected: raw.textLength, actual: parsedTotal, ok: true } : { name: 'textLength', expected: raw.textLength, actual: parsedTotal, ok: false, message: `Textumfang weicht um mehr als ${tolerance} Zeichen vom Roh-HTML ab` });
  if (state.reconstruction) {
    const before = bodyMetrics(parse.blocks);
    const after = bodyMetrics(blocks);
    const removed = state.reconstruction.steps.reduce((sum, step) => sum + (step.removedBlocks ?? 0), 0);
    same('reconstructionBlocks', before.blocks - removed, after.blocks, 'Die Rekonstruktion hat Blöcke hinzugefügt oder entfernt (außer dokumentiert entfallenen leeren Absätzen)');
    same('reconstructionTables', before.tables, after.tables, 'Die Rekonstruktion hat Tabellen verändert');
  }
  const fetchParse: IntegrityReport = { stage: 'fetch-parse', ok: checks.every((check) => check.ok), checks };
  state.fetchParse = fetchParse;
  result.integrity = { fetchParse };
  for (const check of checks) if (!check.ok) findings.push({ severity: 'error', code: `integrity-parse-${check.name}`, message: `${check.message} (erwartet ${check.expected}, gefunden ${check.actual})` });
  if (hasErrors(findings)) return finish('needs-review');

  // --- Attachments ---------------------------------------------------------------------------------
  result.stage = 'attachments';
  const attachmentInputs = await loadAttachments();
  for (const attachment of page.attachments) {
    if (attachment.mediaType === 'text/html' && !attachmentInputs.find((input) => input.label === attachment.label)?.transcription) findings.push({ severity: 'error', code: 'annex-html-not-parsed', message: `HTML-Anlage „${attachment.label}“ wird vom LRMB-Parser nicht als Text übernommen (Review)` });
  }
  const completeness = assessTextCompleteness({ bodyText, bodyUnits: parse.stats.units, attachments: attachmentInputs.filter((input) => input.mediaType !== 'text/html') });
  result.completeness = completeness;
  findings.push(...completeness.findings);
  if (hasErrors(findings)) return finish('needs-review');
  if (attachmentBlocks.length > 0) blocks = [...blocks, ...attachmentBlocks];

  // --- Normalize -----------------------------------------------------------------------------------
  result.stage = 'normalize-source-law';
  const split = splitTitle(title);
  const textAmendments = [...amendments.values()].filter((amendment) => (amendment.incorporated && !validity.postBaselineAmendments.includes(amendment)) || validity.missingPreBaselineAmendments.includes(amendment)).sort((left, right) => (left.note.decreeDate ?? '').localeCompare(right.note.decreeDate ?? ''));
  const baseCitationText = baseCitation?.text;
  const citation = `${split.title} vom ${longDate(issuedOn)}${baseCitationText ? ` (${baseCitationText})` : ''}`;
  const last = textAmendments[textAmendments.length - 1];
  const fullCitation = last ? `${citation}, zuletzt geändert durch Runderlass vom ${longDate(last.note.decreeDate)}${last.note.citation ? ` (${last.note.citation.text})` : ''}` : citation;
  const referenceOf = (entry: RawEntry, sourceRole: SourceRole, note?: string): SourceReference => {
    const pdf = /pdf/iu.test(entry.document.contentType);
    const object = locate(entry.document, entry.role);
    const reference: SourceReference = { kind: entry.role === 'gazette-amendment' ? 'amendment-source' : pdf ? 'primary-pdf' : 'official-portal-snapshot', system: SOURCE_SYSTEM, label: entry.label, ...env.archive.referenceFields(object), url: entry.document.finalUrl, retrievedAt: entry.document.retrievedAt.slice(0, 10), sha256: entry.document.sha256, externalId: `term:${termId}`, mediaType: pdf ? 'application/pdf' : 'text/html', sourceRole };
    if (reference.localSource === undefined) delete reference.localSource;
    if (reference.bucket === undefined) delete reference.bucket;
    if (reference.objectKey === undefined) delete reference.objectKey;
    if (note) reference.note = note;
    return reference;
  };
  const sourceReferences: SourceReference[] = [];
  for (const entry of rawEntries) {
    if (entry.role === 'version-page') {
      const reference = referenceOf(entry, 'official-snapshot', state.reconstruction ? 'Basis der Rekonstruktion (konsolidierter Portaltext)' : undefined);
      if (validity.sourceValidFrom) reference.sourceValidFrom = validity.sourceValidFrom;
      if (validity.sourceValidTo) reference.sourceValidTo = validity.sourceValidTo;
      sourceReferences.push(reference);
    } else if (entry.role === 'stem-page') {
      sourceReferences.push(referenceOf(entry, 'official-snapshot', 'Weitere Fassungsseite der Stammnorm (Fundstellenverlauf, Veröffentlichungsvermerke)'));
    } else if (entry.role === 'gazette-amendment') {
      const amendment = [...amendments.values()].find((candidate) => candidate.gazetteSha256 === entry.document.sha256);
      sourceReferences.push(referenceOf(entry, 'amendment-evidence', amendment ? `Inkrafttreten ${amendment.inForce ?? 'unbekannt'} (${amendment.inForceDerivation}); ${amendment.identification?.reason ?? ''}${validity.postBaselineAmendments.includes(amendment) ? '; nach dem Stichtag – für die Stichtagsfassung zurückgenommen' : ''}` : undefined));
    } else if (entry.role === 'pdf' || entry.role === 'annex') {
      const transcribed = attachmentInputs.find((input) => input.url === entry.document.url)?.transcription;
      sourceReferences.push(referenceOf(entry, 'structure-bearing', transcribed ? 'Anlage nur als PDF; Text aus geprüfter strukturierter Transkription' : 'Anlage nur als PDF; nicht als Text übernommen'));
    }
  }
  const law: SourceLaw = {
    portal: 'recht-nrw',
    externalIdentifiers: [stemIdentifier(termId)],
    title: split.title,
    type: classification.normType,
    citation,
    fullCitation,
    subjects: [],
    keywords: [],
    body: blocks,
    sourceReferences,
    findings: [],
    sourceIdentity: `term:${termId}`,
    sourceUrl: page.address.url,
  };
  if (split.shortTitle) law.shortTitle = split.shortTitle;
  if (split.abbr) law.abbr = split.abbr;
  if (validity.sourceValidFrom) law.sourceValidFrom = validity.sourceValidFrom;
  if (validity.sourceValidTo) law.sourceValidTo = validity.sourceValidTo;
  if (issuedOn) law.documentDate = issuedOn;
  if (changeNote) law.changeHistory = changeNote.raw;
  const sourceNotes: Array<{ label: string; text: string }> = [];
  const headText = [parse.head.decreeText ?? titleDecree?.decreeText, parse.head.issuedText].filter(Boolean).join(' ');
  if (headText) sourceNotes.push({ label: 'Erlasskopf der Quelle', text: headText });
  if (changeNote) sourceNotes.push({ label: 'Fundstellenverlauf der Quelle', text: changeNote.raw });
  if (sourceNotes.length > 0) law.sourceNotes = sourceNotes;

  // --- Transform ------------------------------------------------------------------------------------
  result.stage = 'transform-into-simulation-jurisdiction';
  const sourceIdentity = `term:${termId}`;
  const slugs = await slugReservationFor(env, sourceIdentity);
  state.slugs = slugs;
  const sourceStatus: VersionSourceStatus = state.reconstruction
    ? { validity: 'reconstructed', text: 'reconstructed', note: `Stichtagsfassung rekonstruiert: konsolidierter Portaltext abzüglich ${validity.postBaselineAmendments.length > 0 ? `der nach dem Stichtag in Kraft getretenen Änderung(en) (${validity.postBaselineAmendments.map((entry) => `Runderlass vom ${longDate(entry.note.decreeDate)}, ${entry.note.citation?.text ?? ''}`).join('; ')})` : ''}${validity.missingPreBaselineAmendments.length > 0 ? `zuzüglich ${validity.missingPreBaselineAmendments.length} Änderung(en) vor dem Stichtag` : ''}; jeder Schritt ist im Quellenbereich belegt.` }
    : { validity: validity.sourceValidity, text: 'direct', ...(validity.sourceValidity === 'verified-active-at-baseline' ? { note: 'Textstand am Stichtag über den Fundstellenverlauf und die Ministerialblatt-Einträge der Änderungen belegt.' } : {}) };
  const transformOptions: Parameters<typeof transformToWest>[2] = {
    sourceArea: 'lrmb',
    headLines,
    sourceStatus,
    dateNote: `Übernommen zum Ausgangsrechtsstand ${baseline}; Textstand der Quelle ${validity.sourceValidFrom ?? '?'} bis ${validity.sourceValidTo ?? 'offen'} (${sourceStatus.validity}).`,
    transformation: env.transformation,
    institutions: env.institutions,
  };
  if (sourceStatus.note) transformOptions.provenanceNote = sourceStatus.note;
  const { record, report, findings: transformFindings } = transformToWest(law, { targetJurisdiction: TARGET_JURISDICTION, baselineDate: baseline, reserveSlug: slugs.reserveSlug }, transformOptions);
  findings.push(...transformFindings);
  for (const collision of slugs.collisions) findings.push({ severity: 'warning', code: 'slug-collision', message: `Slug ${collision}` });
  for (const note of slugs.notes) findings.push({ severity: 'info', code: 'slug-stable', message: note });
  state.record = record;
  state.report = report;
  result.record = record;
  result.report = report;
  const sourceCanonical = checkTransformIntegrity(bodyMetrics(law.body), bodyMetrics(record.versions[0]!.body));
  state.sourceCanonical = sourceCanonical;
  result.integrity = { fetchParse, sourceCanonical };
  for (const check of sourceCanonical.checks) if (!check.ok) findings.push({ severity: 'error', code: `integrity-transform-${check.name}`, message: `${check.message ?? check.name} (erwartet ${check.expected}, gefunden ${check.actual})` });
  if (report.unresolved.length > 0) findings.push({ severity: 'warning', code: 'unresolved-source-references', message: `${report.unresolved.length} NRW-spezifische Bezeichnung(en) ohne automatische Entsprechung (siehe Transformationsreport)` });

  // --- Validate -------------------------------------------------------------------------------------
  result.stage = 'validate';
  try {
    assertBaselineConsistency(record);
    assertSourceMetadataProtected(law, record, findings);
  } catch (error) {
    findings.push({ severity: 'error', code: 'validation', message: (error as Error).message });
  }

  // --- Project to D1 (Plan) ---------------------------------------------------------------------------
  result.stage = 'project-to-d1';
  if (env.projection === 'full-plan') {
    const existingWest = (await loadJurisdictionNorms(TARGET_JURISDICTION, options.root).catch(() => [] as NormRecord[])).filter((entry) => entry.meta.slug !== record.meta.slug);
    result.projection = buildProjectionPlan([...existingWest, record], { jurisdiction: TARGET_JURISDICTION, full: true, now: options.now().toISOString() }).stats;
  } else {
    result.projection = buildProjectionPlan([record], { jurisdiction: TARGET_JURISDICTION, full: true, now: options.now().toISOString() }).stats;
  }

  if (hasErrors(findings)) return finish('failed');
  return finish(options.write ? (findings.some((finding) => finding.severity === 'warning') ? 'imported-with-warnings' : 'imported') : 'dry-run');
}

async function finishLrmb(input: {
  status: ManifestEntry['importStatus'];
  result: LrmbImportResult;
  state: LrmbState;
  env: ImportEnvironment;
  options: LrmbImportOptions & { now: () => Date };
  address: NonNullable<ReturnType<typeof parseVersionUrl>>;
  termId: string;
  baseline: string;
  overrides: readonly ImportOverride[];
  rawEntries: RawEntry[];
  pageDocument: FetchedDocument;
  page: RechtNrwVersionPage;
  locate: (document: FetchedDocument, role: RawEntry['role']) => ReturnType<ImportEnvironment['archive']['locate']>;
  now: () => Date;
}): Promise<LrmbImportResult> {
  const { status, result, state, env, options, termId, baseline } = input;
  result.status = status;
  const page = result.page ?? input.page;
  const pageDocument = input.rawEntries.find((entry) => entry.role === 'version-page')?.document ?? input.pageDocument;
  const entry = buildManifestEntry({ ...input, page, pageDocument });
  result.manifestEntry = entry;
  const imported = (isImportedStatus(status) || status === 'dry-run') && state.record !== undefined;
  if (imported && state.slugs) state.slugs.commit();
  if (!options.write || status === 'dry-run') return result;
  if (status === 'failed' && env.mode !== 'bulk') {
    // Außerhalb des Bulkmodus werden Rohquellen gescheiterter Importe nicht abgelegt: kein Archivstatus ohne Datei.
    for (const raw of entry.rawDocuments) { delete raw.archiveStatus; delete raw.bucket; delete raw.objectKey; }
    return result;
  }

  // Reihenfolge der Checkpoints: Rohquellen → Slug-Registry → Norm → Report; Manifest und Queue danach.
  // Im Bulkmodus auch für gescheiterte Importe (Beleg für die Fehleranalyse), die danach ohne Norm enden.
  const writer = new FileWriter(env.root);
  // Bereits nach R2 übertragene und geprüfte Objekte (gleicher inhaltsadressierter Schlüssel) behalten „verified“.
  const previousEntry = options.manifest?.entries.find((candidate) => candidate.sourceIdentity === `term:${termId}`) ?? (await readManifestEntry(options.root, 'lrmb', `term:${termId}`));
  for (const raw of input.rawEntries) {
    const object = input.locate(raw.document, raw.role);
    const stored = await env.archive.store(raw.document, object);
    const manifestRaw = entry.rawDocuments.find((candidate) => candidate.sha256 === raw.document.sha256 && candidate.role === raw.role);
    if (manifestRaw) manifestRaw.archiveStatus = preservedArchiveStatus(stored.status, object.objectKey, previousEntry);
    if (object.localSource) writer.written.push(object.localSource);
  }
  if (status === 'failed') return result;
  if (imported && state.record) {
    result.stage = 'write-canonical-json';
    await writeSlugRegistry(env.root, env.slugRegistry);
    const blocked = await writeInitialNorm(writer, state.record, baseline, { protectVersionedSources: env.mode === 'bulk' });
    if (blocked) {
      result.findings.push(blocked);
      entry.findings.push(blocked);
      result.status = 'failed';
      entry.importStatus = 'failed';
      entry.targetSlug = '';
      result.writtenFiles.push(...writer.written);
      return result;
    }
  }
  await writer.jsonStable(entry.transformation.reportPath!, auditReport(result, entry, input.now()));
  result.writtenFiles.push(...writer.written);
  return result;
}

const INSTRUCTION = /\b(?:eingefügt|ersetzt|gestrichen|aufgehoben|angefügt|gefasst|neu\s+gefasst)\b/gu;

/** Arbeitsgrundlage der Rekonstruktionsqueue: Richtung, Änderungen, Quellenlage, geschätzte Schritte. */
export function reconstructionPlanFor(validity: LrmbValidityAssessment): ReconstructionPlan | undefined {
  const entries = [...validity.missingPreBaselineAmendments.map((amendment) => ({ amendment, direction: 'forward' as const })), ...validity.postBaselineAmendments.map((amendment) => ({ amendment, direction: 'reverse' as const }))];
  if (entries.length === 0) return undefined;
  const amendments = entries.map(({ amendment, direction }) => {
    const planned: ReconstructionPlan['amendments'][number] = { instructionCount: [...(amendment.gazetteText ?? '').matchAll(INSTRUCTION)].length, direction };
    if (amendment.note.decreeDate) planned.decreeDate = amendment.note.decreeDate;
    if (amendment.note.citation) planned.citation = amendment.note.citation.text;
    if (amendment.inForce) planned.inForce = amendment.inForce;
    if (amendment.gazetteUrl) planned.gazetteUrl = amendment.gazetteUrl;
    if (amendment.gazetteSha256) planned.gazetteSha256 = amendment.gazetteSha256;
    return planned;
  });
  const directions = new Set(entries.map((entry) => entry.direction));
  return {
    direction: directions.size > 1 ? 'mixed' : entries[0]!.direction,
    amendments,
    sourceCompleteness: Math.round((entries.filter(({ amendment }) => amendment.gazetteUrl && amendment.identification?.ok).length / entries.length) * 100) / 100,
    estimatedSteps: amendments.reduce((sum, amendment) => sum + amendment.instructionCount, 0),
  };
}

function buildManifestEntry(input: {
  address: NonNullable<ReturnType<typeof parseVersionUrl>>;
  page: RechtNrwVersionPage;
  pageDocument: FetchedDocument;
  termId: string;
  baseline: string;
  status: ManifestEntry['importStatus'];
  result: LrmbImportResult;
  state: LrmbState;
  env: ImportEnvironment;
  overrides: readonly ImportOverride[];
  rawEntries: RawEntry[];
  locate: (document: FetchedDocument, role: RawEntry['role']) => ReturnType<ImportEnvironment['archive']['locate']>;
  now: () => Date;
}): ManifestEntry {
  const { page, state, result } = input;
  const imported = state.record !== undefined && (input.status === 'imported' || input.status === 'imported-with-warnings' || input.status === 'dry-run');
  const reportPath = (imported && state.record ? join(AUDIT_DIR, `${state.record.meta.slug}.json`) : join(LRMB_AUDIT_DIR, `term-${input.termId}.json`)).replace(/\\/gu, '/');
  const validity = state.validity;
  const reconstructionStatus: ManifestEntry['reconstructionStatus'] = state.reconstruction?.ok && imported ? 'reconstructed' : validity?.textStatus === 'direct' ? 'direct' : validity?.textStatus === 'reconstruction-required' ? 'reconstruction-required' : 'not-applicable';
  const classification = result.classification ?? classifyLrmbDocumentType({ title: page.title });
  const entry: ManifestEntry = {
    sourceSystem: 'recht-nrw',
    sourceArea: 'lrmb',
    sourceDocumentType: classification.sourceDocumentType,
    sourceIdentity: `term:${input.termId}`,
    sourceTitle: page.title,
    sourceType: input.address.documentType,
    sourceUrl: input.address.url,
    stemUrl: `https://recht.nrw.de/taxonomy/term/${input.termId}`,
    sourceVersion: { url: page.address.url, ...(page.validFrom ? { validFrom: page.validFrom } : {}), validTo: page.validTo ?? null },
    selectedVersionUrl: page.address.url,
    sourceValidFrom: validity?.sourceValidFrom ?? page.validFrom ?? '',
    sourceValidTo: validity?.sourceValidTo ?? page.validTo ?? null,
    baselineStatus: validity?.baselineStatus ?? 'undetermined',
    validityProvenance: validity ? (state.reconstruction?.ok && imported ? 'reconstructed' : validity.provenance) : 'undetermined',
    validityEvidence: validity?.evidence ?? [],
    retrievedAt: input.pageDocument.retrievedAt,
    sha256: input.pageDocument.sha256,
    contentType: input.pageDocument.contentType,
    contentFormat: page.content.format,
    parserVersion: LRMB_PARSER_VERSION,
    transformerVersion: TRANSFORMER_VERSION,
    targetJurisdiction: TARGET_JURISDICTION,
    targetSlug: imported && state.record ? state.record.meta.slug : '',
    baselineDate: input.baseline,
    importStatus: input.status,
    reviewStatus: 'none',
    reconstructionStatus,
    reconstructionSources: state.reconstruction?.sources ?? [],
    reconstructionSteps: state.reconstruction?.steps ?? [],
    normativity: result.normativity ? { decision: result.normativity.decision, reasons: result.normativity.reasons } : { decision: 'review', reasons: ['nicht bestimmt'] },
    archive: input.env.archive.mode === 'r2' ? { mode: 'r2', bucket: 'landesrecht-quellen' } : { mode: 'versioned-sample' },
    importedAt: input.now().toISOString(),
    rawDocuments: input.rawEntries.map((raw) => {
      const object = input.locate(raw.document, raw.role);
      const document: ManifestRawDocument = { role: raw.role, url: raw.document.url, finalUrl: raw.document.finalUrl, sha256: raw.document.sha256, contentType: raw.document.contentType, retrievedAt: raw.document.retrievedAt, byteLength: raw.document.bytes.byteLength, archiveStatus: object.status };
      if (object.localSource) document.localSource = object.localSource;
      if (object.bucket) document.bucket = object.bucket;
      if (object.objectKey) document.objectKey = object.objectKey;
      return document;
    }),
    versionsConsidered: result.selection ? result.selection.candidates.map((candidate) => ({ validFrom: candidate.validFrom, validTo: candidate.validTo, ...(candidate.url ? { url: candidate.url } : {}), selected: candidate.validFrom === result.selection!.selected?.validFrom })) : [],
    overrides: input.overrides.filter((override) => override.field !== 'attachmentHandling' && override.field !== 'institutionMapping').map((override): ManifestOverride => ({ id: override.id, field: override.field, value: override.value, reason: override.reason, evidence: override.evidence, reviewedAt: override.reviewedAt })),
    findings: result.findings.filter((finding) => finding.severity !== 'info'),
    integrity: { fetchParse: state.fetchParse?.ok ?? false, sourceCanonical: state.sourceCanonical?.ok ?? false },
    transformation: { changes: state.report?.changes.length ?? 0, unresolved: state.report?.unresolved.length ?? 0, detections: state.report?.detections.length ?? 0, ...(state.report ? { postTransformAudit: state.report.postTransformAudit.ok } : {}), reportPath },
  };
  if (input.env.runId) entry.runId = input.env.runId;
  if (result.sanity) entry.documentIdentity = { status: result.sanity.status, signals: result.sanity.signals.map((signal) => `${signal.effect}:${signal.code}`) };
  if (result.completeness) {
    entry.textCompleteness = result.completeness.completeness;
    if (result.completeness.attachments.length > 0) entry.attachments = result.completeness.attachments;
  } else if (result.parse && page.attachments.length === 0 && entry.baselineStatus === 'active-at-baseline') {
    entry.textCompleteness = 'html-complete';
  }
  if (validity?.textStatus === 'reconstruction-required') {
    const plan = reconstructionPlanFor(validity);
    if (plan) entry.reconstructionPlan = plan;
  }
  return entry;
}

function auditReport(result: LrmbImportResult, entry: ManifestEntry, generatedAt: Date): unknown {
  return {
    schemaVersion: 'recht-nrw-lrmb-audit/1',
    sourceIdentity: entry.sourceIdentity,
    sourceUrl: entry.sourceUrl,
    selectedVersionUrl: entry.selectedVersionUrl,
    importStatus: entry.importStatus,
    generatedAt: generatedAt.toISOString(),
    head: result.parse?.head,
    classification: result.classification,
    normativity: result.normativity,
    documentIdentity: result.sanity,
    textCompleteness: result.completeness,
    changeNote: result.changeNote,
    amendments: result.amendments?.map(({ gazetteText: _text, ...amendment }) => amendment),
    validity: result.validity ? { baselineStatus: result.validity.baselineStatus, textStatus: result.validity.textStatus, sourceValidFrom: result.validity.sourceValidFrom, sourceValidTo: result.validity.sourceValidTo, sourceValidity: result.validity.sourceValidity, provenance: result.validity.provenance, continuity: result.validity.continuity, evidence: result.validity.evidence } : undefined,
    reconstruction: result.reconstruction ? { ok: result.reconstruction.ok, baseFingerprint: result.reconstruction.baseFingerprint, resultFingerprint: result.reconstruction.resultFingerprint, steps: result.reconstruction.steps, sources: result.reconstruction.sources } : undefined,
    reconstructionPlan: entry.reconstructionPlan,
    parseStats: result.parse?.stats,
    integrity: result.integrity,
    transformation: result.report,
    findings: result.findings,
  };
}
