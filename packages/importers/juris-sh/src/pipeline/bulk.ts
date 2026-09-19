/**
 * Inventur (`inventory`) und Bulk (`bulk`) des NSH-Bestands – netzfrei aus dem Cache von `fetch-corpus`.
 *
 * Je Dokument der Enumeration derselbe Vollweg wie in der Stichprobe (`document.ts`): öffentliche PDF-Ausgabe
 * → Parser → SH-Modell → Stichtag (Ausgabe; bei späteren Änderungen die am Stichtag geltenden
 * Einzelfassungen) → Überleitung SH → NSH → legal-core-Validierung → Textintegrität. Dazu die Stichtagsbelege
 * mit dem **bestehenden** Ereignisregister (`baseline-evidence.ts`, Regeln A/B/C).
 *
 * Regeln wie im BayWü-/West-Muster:
 *   - Dry-run ist die Voreinstellung: Ohne `--write` wird nichts geschrieben; die Aussage ist dieselbe.
 *   - `inventory --write` schreibt nur die Auswertung (`data/audits/juris-sh/corpus-inventory.json`,
 *     `CORPUS_INVENTORY.md`), nie Normen.
 *   - `bulk --write` schreibt übernommene Normen nach `content/norms/nsh/<slug>/`, dazu Manifest,
 *     Review-Dateien, Slug-Registry und Fortschritt – nur, wenn die Readiness grün ist (prüft der Aufrufer).
 *   - Übernommen wird nur `import-ready` mit Stichtagsbeleg nach Regel B. Review-Fälle bleiben draußen; es
 *     gibt keine automatische Freigabe und keinen Freeze.
 *   - Kein Netzzugriff: Fehlt ein PDF im Cache, ist das `not-cached` und Sache von `fetch-corpus`.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { readJsonFile, writeFileAtomic, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { cacheKey, RechtNrwFetchError } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';

import { validateNormRecord } from '@landesrecht/legal-core/lib/schema.ts';

import { permaUrl } from '../access/policy.ts';
import { AUDIT_DIR, BASELINE_DATE, CACHE_DIR, IMPORT_DATA_DIR, PARSER_VERSION, TARGET_JURISDICTION } from '../common/constants.ts';
import { createJurisShFetcher } from '../common/fetcher.ts';
import { isImportedStatus, manifestEntryDefaults, readManifest, writeManifestEntry, type ImportStatus, type ManifestEntry } from '../common/manifest.ts';
import { mergeReviewItems, readReviewQueue, writeReviewShard, type ReviewItemInput, type ReviewQueue } from '../common/review.ts';
import { createSlugReserver, readSlugRegistry, seedSlugRegistryFromManifest, writeSlugRegistry } from '../common/slug-registry.ts';
import { ENUMERABLE_AREAS, readEnumeration, type EnumerableArea } from '../enumerate/enumeration.ts';
import { isBaselineOnlyCandidate, type LedgerEvent } from '../events/ledger.ts';
import { createExportClient, ExportError, pdfExportUrl } from '../export/client.ts';
import { readInstitutionRegistry } from '../transform/institution-registry.ts';
import { TRANSFORMER_VERSION } from '../transform/rules.ts';
import { assignSeparateAnnexes, attachAnnexes, titleKey } from './annexes.ts';
import { baselineEvidence, buildLedgerIndex, eventTargetDate, matchLedgerEvents, normalizeGliederungsnummer, type BaselineEvidenceResult } from './baseline-evidence.ts';
import { collectOfficialAbbreviations, OFFICIAL_ABBREVIATIONS_PATH } from './abbreviations.ts';
import { readCorpusState } from './corpus.ts';
import { gazetteVolumesFromLedger } from '../parse/source-law.ts';
import { processDocument, STAND_UNDETERMINED, type DocumentBlocker, type DocumentResult } from './document.ts';
import { listExistingSlugs, recoverInterruptedNormWrites, removeOwnNormDirectory, writeNormRecord } from './persist.ts';
import { loadUnits, sitemapUnits } from './units.ts';

export const INVENTORY_JSON_PATH = `${AUDIT_DIR}/corpus-inventory.json`;
export const INVENTORY_REPORT_PATH = `${AUDIT_DIR}/CORPUS_INVENTORY.md`;
export const BULK_STATE_PATH = `${IMPORT_DATA_DIR}/bulk-state.json`;
export const INVENTORY_SCHEMA = 'juris-sh-corpus-inventory/1' as const;
export const BULK_STATE_SCHEMA = 'juris-sh-bulk-state/1' as const;
export const LEDGER_PATH = `${IMPORT_DATA_DIR}/events/ledger.json`;

export type BulkMode = 'inventory' | 'bulk';
export type InventoryOutcome = DocumentResult['outcome'] | 'not-cached';

export interface InventoryEntry {
  documentId: string;
  area: EnumerableArea;
  outcome: InventoryOutcome;
  manifestStatus?: ImportStatus;
  baselineClass?: string;
  baselineStatus?: string;
  rule?: string;
  title?: string;
  type?: string;
  gliederungsnummer?: string;
  slug?: string;
  integrity?: string;
  pages?: number;
  blockers: Array<Pick<DocumentBlocker, 'kind' | 'code'>>;
  reason?: string;
  warnings: number;
  ledger: { matched: number; postBaseline: number; contradictions: number };
  historical?: { units: number; selected: number; omitted: number; problems: number };
}

export interface InventoryReport {
  schemaVersion: typeof INVENTORY_SCHEMA;
  baselineDate: string;
  parserVersion: string;
  transformerVersion: string;
  totals: {
    enumerated: number;
    processed: number;
    byOutcome: Record<string, number>;
    byArea: Record<string, Record<string, number>>;
    byBaselineClass: Record<string, number>;
    byIntegrity: Record<string, number>;
    byType: Record<string, number>;
    byManifestStatus: Record<string, number>;
    blockers: Record<string, number>;
    evidenceRules: Record<string, number>;
  };
  /** Zweite Quelle: Gliederungsnummern der amtlichen Register (Systematische Übersicht GVOBl., Erlassverzeichnis Amtsbl.) im Bestand. */
  registerCrosscheck: RegisterCrosscheckSummary[];
  baselineOnly: { candidates: number; matched: number; byOutcome: Record<string, number>; entries: Array<{ eventId: string; eventDate: string; gliederungsnummer?: string; title: string; documentIds: string[]; outcomes: string[] }> };
  entries: InventoryEntry[];
}

/**
 * Zweite Quelle je Register (Audit „NSH-Audit“, `audit/register-crosscheck.ts`): Zählbasis sind die **Registerköpfe**
 * des vollen amtlichen Registers, nicht Änderungsereignisse. Gefunden zählt nur eine stabile Kennung (Gliederungsnummer,
 * Variante, Fundstelle mit Datum) oder Titel **mit** gleichem Datum; ein bloßer Titeltreffer zählt nie. Die Quote ist
 * Indikator, kein Gate; jeder nicht gefundene Kopf ist klassifiziert.
 */
export interface RegisterCrosscheckSummary {
  source: string;
  area: EnumerableArea;
  asOf?: string;
  /** Registerköpfe nach Ausschluss (Änderungs-/Aufhebungs-/Mantelakte, Tarifverträge). */
  registerNumbers: number;
  excludedAmendingOrAgreement: number;
  /** Streng gefunden (gl, gl-variant, fundstelle, title-date). */
  found: number;
  coverage: number;
  /** Nur Gliederungsnummer (ehrliche Untergrenze). */
  idOnly: { found: number; rate: number };
  byTier: Record<string, number>;
  /** Titeltreffer werden nie als gefunden gezählt. */
  titleOnlyCounted: false;
  missing: Array<{ gliederungsnummer: string; title: string; tier: string; classification: 'nicht-in-juris' | 'nur-aenderungsakt-in-juris' | 'nur-titelaehnlichkeit-ungeprueft' }>;
}

/** Registerabgleich über die vollen Registerköpfe mit den Stufen des Audit-Moduls. */
export async function computeRegisterCrosscheck(root: string, ledger: { events: LedgerEvent[]; sources: Array<{ id: string; asOf?: string }> }, documents: ReadonlyArray<{ id: string; area: EnumerableArea; gl?: string | undefined; dates?: string[]; title?: string | undefined; fundstelle?: string | undefined; outcome?: string }>): Promise<RegisterCrosscheckSummary[]> {
  const { buildDocumentIndex, coverage, matchRegisterEntry, glKey } = await import('../audit/register-crosscheck.ts');
  const { fullRegisterRecords } = await import('../audit/register-crosscheck-run.ts');
  const jurisDocuments = documents.map((document) => ({ id: document.id, area: document.area, ...(document.title ? { title: document.title } : {}), ...(document.gl ? { gliederungsnummer: document.gl } : {}), dates: document.dates ?? [], ...(document.fundstelle ? { fundstelle: document.fundstelle } : {}), ...(document.outcome ? { outcome: document.outcome } : {}) }));
  const summaries: RegisterCrosscheckSummary[] = [];
  for (const [source, area] of [['gvobl-systematische-uebersicht', 'landesrecht'], ['ab-erlassverzeichnis', 'vwv']] as const) {
    const ledgerNumbers = new Set(ledger.events.filter((event) => event.sourceId === source && event.targetGliederungsnummer).map((event) => glKey(event.targetGliederungsnummer!)));
    let records;
    try {
      records = await fullRegisterRecords(root, source, ledgerNumbers);
    } catch {
      continue; // Register im Discovery-Cache nicht lesbar: kein Abgleich (Readiness meldet das)
    }
    const index = buildDocumentIndex(jurisDocuments, area);
    const matches = records.map((record) => matchRegisterEntry(record, index));
    const figures = coverage(matches);
    const classify = (tier: string): RegisterCrosscheckSummary['missing'][number]['classification'] => (tier === 'gl-amendment-only' ? 'nur-aenderungsakt-in-juris' : tier === 'title-only' ? 'nur-titelaehnlichkeit-ungeprueft' : 'nicht-in-juris');
    const missing = matches
      .filter((match) => !match.exclusion && (match.tier === 'none' || match.tier === 'title-only' || match.tier === 'gl-amendment-only'))
      .map((match) => ({ gliederungsnummer: match.record.gliederungsnummer, title: match.record.title.slice(0, 120), tier: match.tier, classification: classify(match.tier) }))
      .sort((left, right) => left.gliederungsnummer.localeCompare(right.gliederungsnummer));
    const asOf = ledger.sources.find((entry) => entry.id === source)?.asOf;
    summaries.push({
      source,
      area,
      ...(asOf ? { asOf } : {}),
      registerNumbers: figures.considered,
      excludedAmendingOrAgreement: matches.filter((match) => match.exclusion).length,
      found: figures.strict.found,
      coverage: figures.strict.rate,
      idOnly: figures.idOnly,
      byTier: figures.byTier,
      titleOnlyCounted: false,
      missing,
    });
  }
  return summaries;
}

export interface BulkStateFile {
  schemaVersion: typeof BULK_STATE_SCHEMA;
  parserVersion: string;
  transformerVersion: string;
  entries: Record<string, { outcome: InventoryOutcome; manifestStatus?: ImportStatus; slug?: string; sha256?: string }>;
}

export interface BulkOptions {
  root: string;
  mode: BulkMode;
  write: boolean;
  only?: readonly string[];
  /** Beobachter je verarbeitetem Dokument (Diagnose einzelner Dokumente mit `--only`). */
  onResult?: (result: DocumentResult) => void;
  limit?: number;
  now?: string;
  log?: (line: string) => void;
  signal?: AbortSignal;
}

export interface BulkResult {
  report: InventoryReport;
  written: string[];
  normsWritten: number;
  normsUnchanged: number;
  normsRemoved: number;
  stop?: 'limit' | 'interrupted';
}

const increment = (counts: Record<string, number>, key: string): void => {
  counts[key] = (counts[key] ?? 0) + 1;
};

/** Review-Fälle aus den strukturierten Sperrgründen und den Stichtagsbelegen. */
export function reviewInputsFor(result: DocumentResult, evidence: BaselineEvidenceResult | undefined): ReviewItemInput[] {
  const inputs: ReviewItemInput[] = [];
  for (const blocker of result.blockers) {
    const base = { key: `${blocker.kind}:${blocker.code}`, severity: 'blocking' as const, details: [blocker.detail].filter(Boolean) };
    switch (blocker.kind) {
      case 'parse':
      case 'parse-units':
        if (blocker.code === 'figure') inputs.push({ ...base, category: 'pdf-only', summary: 'Abbildung der PDF-Ausgabe nicht sicher übernehmbar (verzerrt gesetzt, Text überdeckt oder nicht auslesbar)' });
        else if (blocker.code === 'annex-separate-document') inputs.push({ ...base, category: 'incomplete-annex', summary: 'Anlage(n) als eigenes juris-Dokument geführt, Stammnorm nicht eindeutig – ohne Zusammenführung unvollständig' });
        else if (blocker.code === 'annex-document-unusable') inputs.push({ ...base, category: 'incomplete-annex', summary: 'Angehängtes Anlagendokument nicht verwendbar (Stichtagsfassung offen oder Parserfehler)' });
        else if (blocker.code === 'figure-unbound') inputs.push({ ...base, category: 'pdf-only', summary: 'Abbildung ohne belegte Herkunft in einer PDF-Ausgabe' });
        else if (blocker.code === 'incomplete-source-text') inputs.push({ ...base, category: /PDF-Datei/u.test(blocker.detail) ? 'incomplete-annex' : 'pdf-only', summary: /PDF-Datei/u.test(blocker.detail) ? 'Inhalt (meist Anlage) liegt in juris nur als gesonderte PDF-Datei vor, nicht in der Gesamtausgabe' : 'Technischer Vermerk der Ausgabe: Normtext unvollständig' });
        else if (blocker.code === 'vwv-annex-document') inputs.push({ ...base, category: 'incomplete-annex', summary: 'Anlage einer Verwaltungsvorschrift als eigenes Dokument – Zuordnung zum Hauptdokument offen' });
        else if (blocker.code === 'table-layout') inputs.push({ ...base, category: 'unknown-structure', summary: 'Tabellenlayout – Zeilen-/Spaltenstruktur aus der Textebene nicht sicher rekonstruierbar' });
        else inputs.push({ ...base, category: 'unknown-structure', summary: `Struktur: ${blocker.code} (Verzeichnis und Normkörper stimmen nicht überein)` });
        break;
      case 'integrity':
        inputs.push({ ...base, category: 'unknown-structure', summary: `Textintegrität ${blocker.code} – Normtext nicht vollständig belegt` });
        break;
      case 'baseline':
        inputs.push({ ...base, category: 'validity', summary: 'Stichtagsgeltung aus der Ausgabe nicht bestimmbar' });
        break;
      case 'historical':
        inputs.push({ ...base, category: 'historical-gap', summary: 'Einzelfassungen am Stichtag nicht eindeutig zuzuordnen' });
        break;
      case 'units-missing':
        inputs.push({ ...base, key: 'reconstruction:units', category: 'reconstruction-required', summary: 'Am Stichtag galt eine andere Fassung; Einzelfassungen der juris-Historie noch nicht (vollständig) geladen' });
        break;
      case 'transform':
        inputs.push({ ...base, category: 'institution-mapping', summary: `Überleitung SH → NSH: ${blocker.code}` });
        break;
      case 'schema':
        inputs.push({ ...base, category: 'unknown-structure', summary: `Verarbeitung fehlgeschlagen: ${blocker.code}` });
        break;
    }
  }
  if (evidence && result.outcome !== 'not-at-baseline' && result.outcome !== 'failed') {
    if (evidence.contradictions.length > 0) {
      inputs.push({ category: 'contradictory-evidence', key: 'ledger-post-baseline-change', severity: 'blocking', summary: 'Ereignisregister belegt eine Änderung nach dem Stichtag, die Ausgabe zeigt die Norm als unverändert (Rückwirkung, weggefallene Einheit oder Zuordnung prüfen)', details: evidence.contradictions });
    } else if (evidence.assessment.status !== 'active-at-baseline' && result.blockers.length === 0) {
      inputs.push({ category: 'validity', key: `evidence:${evidence.assessment.rule}`, severity: 'blocking', summary: `Stichtagsbelege tragen keine Übernahme (${evidence.assessment.status})`, details: evidence.assessment.reasons.slice(0, 6) });
    }
  }
  return inputs;
}

function manifestStatusFor(result: DocumentResult, reviewBlocking: boolean): ImportStatus {
  if (result.outcome === 'not-at-baseline') return 'not-at-baseline';
  // Anlage einer Stammnorm: keine eigene Norm (dort angehängt).
  if (result.outcome === 'part-of-main') return 'excluded';
  if (result.outcome === 'failed') return 'failed';
  if (result.outcome === 'import-ready' && !reviewBlocking) return result.warnings.length > 0 ? 'imported-with-warnings' : 'imported';
  return 'needs-review';
}

/** Frühestes belegtes Datum der benutzten Fassung – Pflichtfeld `sourceValidFrom`. */
function sourceValidFrom(result: DocumentResult, evidence: BaselineEvidenceResult | undefined): string | undefined {
  const begin = evidence?.evidence.find((item) => item.dimension === 'begin' && item.kind.startsWith('portal'))?.date;
  const facts = result.source;
  return result.historical?.validFrom ?? begin ?? facts?.latestUnitFrom ?? facts?.editionValidFrom ?? facts?.headerValidFrom ?? facts?.versionDate ?? facts?.documentDates[0];
}

function manifestEntryFor(result: DocumentResult, status: ImportStatus, evidence: BaselineEvidenceResult | undefined, slug: string | undefined, reviewStatus: ManifestEntry['reviewStatus'], now: string, unitRaw: Array<{ url: string; sha256: string; byteLength: number; retrievedAt: string }>): ManifestEntry | undefined {
  const validFrom = sourceValidFrom(result, evidence);
  if (!validFrom || !result.raw.sha256) return undefined;
  const validTo = result.historical ? (result.historical.validTo ?? null) : (result.source?.editionValidTo ?? result.source?.headerValidTo ?? null);
  const baselineStatus = status === 'not-at-baseline' ? 'not-active-at-baseline' : evidence?.assessment.status === 'active-at-baseline' ? 'active-at-baseline' : evidence?.assessment.status ?? 'undetermined';
  const pdf = (raw: { url: string; sha256: string; byteLength: number; retrievedAt: string }) => ({ role: 'pdf' as const, url: raw.url, finalUrl: raw.url, sha256: raw.sha256, contentType: 'application/pdf', retrievedAt: raw.retrievedAt, byteLength: raw.byteLength });
  const nonInfo = result.findings.filter((finding) => finding.severity !== 'info');
  return {
    ...manifestEntryDefaults(),
    sourceArea: result.area,
    sourceIdentity: result.documentId,
    sourceTitle: result.title || result.documentId,
    sourceType: result.type ?? (result.area === 'vwv' ? 'verwaltungsvorschrift' : 'unbestimmt'),
    sourceUrl: permaUrl(result.documentId),
    sourceVersion: { url: result.raw.url, validFrom, validTo },
    selectedVersionUrl: result.historical ? permaUrl(result.documentId) : result.raw.url,
    sourceValidFrom: validTo !== null && validTo < validFrom ? validTo : validFrom,
    sourceValidTo: validTo,
    baselineStatus: baselineStatus as ManifestEntry['baselineStatus'],
    baselineRecoveryMethod: result.historical ? 'historical-juris-version' : 'current-source',
    sourceProvenance: {
      publicationAuthority: 'unknown',
      digitalRepresentation: 'born-digital',
      note: `Konsolidierte juris-Fassung (Bürgerservice Schleswig-Holstein), PDF-Ausgabe der Datenbank; amtlich ist allein die Verkündung${result.source?.fundstelle ? ` (${result.source.fundstelle})` : ''}.`,
    },
    validityEvidence: evidence?.evidence ?? [],
    retrievedAt: result.raw.retrievedAt,
    sha256: result.raw.sha256,
    contentType: 'application/pdf',
    parserVersion: PARSER_VERSION,
    transformerVersion: TRANSFORMER_VERSION,
    targetSlug: isImportedStatus(status) && slug ? slug : '',
    importStatus: status,
    reviewStatus,
    // Abbildungen: je Bild eine Rohquelle (Bytes aus der genannten PDF-Ausgabe, Lage darin), inhaltsadressiert archiviert.
    rawDocuments: [pdf(result.raw), ...unitRaw.map(pdf), ...(result.annexDocuments ?? []).map((annex) => ({ ...pdf(annex.raw), role: 'annex' as const })), ...(result.figures ?? []).map((figure) => ({ role: 'figure' as const, url: figure.pdf.url, finalUrl: figure.pdf.url, sha256: figure.sha256, contentType: figure.mediaType, retrievedAt: figure.pdf.retrievedAt, byteLength: figure.byteLength, packagePath: figure.sourcePath, packageSha256: figure.pdf.sha256 }))],
    versionsConsidered: result.historical
      ? [{ validFrom: result.historical.validFrom ?? validFrom, validTo: result.historical.validTo ?? null, url: permaUrl(result.documentId), selected: true }, { validFrom: result.source?.editionValidFrom ?? result.source?.latestUnitFrom ?? validFrom, validTo: result.source?.editionValidTo ?? null, url: result.raw.url, selected: false }]
      : [{ validFrom, validTo, url: result.raw.url, selected: status !== 'not-at-baseline' && status !== 'failed' }],
    findings: [...nonInfo, ...result.findings.filter((finding) => finding.code === 'slug-collision'), ...result.warnings.map((warning) => ({ severity: 'warning' as const, code: /^[a-z-]+(?=:)/u.exec(warning)?.[0] ?? 'import-warning', message: warning.slice(0, 300) }))].slice(0, 50),
    integrity: { fetchParse: result.outcome !== 'failed', sourceCanonical: ['exact', 'normalized-equivalent', 'explained-difference'].includes(result.integrity?.class ?? '') },
    transformation: { changes: result.transform?.changes ?? 0, unresolved: result.transform?.unresolved ?? 0, ...(result.transform ? { postTransformAudit: result.transform.auditOk } : {}) },
    importedAt: now,
  };
}

export async function runBulk(options: BulkOptions): Promise<BulkResult> {
  const { root } = options;
  const log = options.log ?? ((): void => undefined);
  const now = options.now ?? new Date().toISOString();
  const writeNorms = options.mode === 'bulk' && options.write;
  if (writeNorms) {
    const recovered = await recoverInterruptedNormWrites(root);
    for (const action of recovered) log(`Wiederherstellung: ${action}`);
  }
  const client = createExportClient({ root, offline: true });
  const institutions = await readInstitutionRegistry(root);
  const unitsByFrame = await sitemapUnits(createJurisShFetcher({ root, offline: true }));
  const corpus = await readCorpusState(root);
  const ledgerFile = await readJsonFile<{ events: LedgerEvent[]; sources: Array<{ id: string; asOf?: string }> }>(join(root, LEDGER_PATH));
  if (!ledgerFile) throw new Error(`${LEDGER_PATH} fehlt – das Ereignisregister wird weiterverwendet, nicht neu gebaut`);
  const ledgerIndex = buildLedgerIndex(ledgerFile.events);
  const abbreviations = await collectOfficialAbbreviations(root, { write: options.write });
  const knownStateAbbreviations = abbreviations.known;
  const gazetteVolumes = gazetteVolumesFromLedger(ledgerFile.sources as Array<{ id: string; url: string; sha256: string }>);
  log(`${options.mode}: ${knownStateAbbreviations.size} amtliche Abkürzungen mit Landeskürzel im Bestand`);

  const items: Array<{ id: string; area: EnumerableArea }> = [];
  for (const area of ENUMERABLE_AREAS) {
    const file = await readEnumeration(root, area);
    if (!file) throw new Error(`Enumeration ${area} fehlt`);
    for (const item of file.items) items.push({ id: item.key, area });
  }
  const selected = options.only?.length ? items.filter((item) => options.only!.includes(item.id)) : items;

  const manifest = await readManifest(root);
  // Registry aus übernommenen Manifesteinträgen ergänzen (Reparatur nach einem abgebrochenen Lauf: Verzeichnis und
  // Manifest geschrieben, Registry noch nicht) – sonst gälte das eigene Verzeichnis als fremd.
  const registry = seedSlugRegistryFromManifest(await readSlugRegistry(root), manifest);
  const existingSlugs = await listExistingSlugs(root);
  const reserver = createSlugReserver(registry, existingSlugs);
  const slugCandidates = new Map<string, string>();
  let review: ReviewQueue = await readReviewQueue(root);
  const previousByIdentity = new Map(manifest.entries.map((entry) => [entry.sourceIdentity, entry]));
  const state: BulkStateFile = (await readJsonFile<BulkStateFile>(join(root, BULK_STATE_PATH))) ?? { schemaVersion: BULK_STATE_SCHEMA, parserVersion: PARSER_VERSION, transformerVersion: TRANSFORMER_VERSION, entries: {} };
  state.parserVersion = PARSER_VERSION;
  state.transformerVersion = TRANSFORMER_VERSION;

  // Erster Durchgang: Parsen (für die Eindeutigkeit der Gliederungsnummern braucht die Registerzuordnung alle Dokumente).
  const results: Array<{ item: { id: string; area: EnumerableArea }; result?: DocumentResult; unitRaw: Array<{ url: string; sha256: string; byteLength: number; retrievedAt: string }> }> = [];
  let stop: BulkResult['stop'];
  let processed = 0;
  for (const item of selected) {
    if (options.signal?.aborted) {
      stop = 'interrupted';
      break;
    }
    if (options.limit !== undefined && processed >= options.limit) {
      stop = 'limit';
      break;
    }
    processed += 1;
    // Maßgeblich ist der Cache (der Abrufzustand ist Buchführung): Fehlt das PDF dort, ist das Dokument `not-cached`.
    if (corpus.documents[item.id]?.status === 'failed') {
      results.push({ item, unitRaw: [] });
      continue;
    }
    let pdf;
    try {
      pdf = await client.pdf(item.id, 'gesamtausgabe');
    } catch (error) {
      if (error instanceof ExportError || error instanceof RechtNrwFetchError) {
        results.push({ item, unitRaw: [] });
        continue;
      }
      throw error;
    }
    const document = { documentId: item.id, area: item.area, url: pdfExportUrl(item.id, 'gesamtausgabe'), sha256: pdf.sha256, retrievedAt: pdf.retrievedAt, byteLength: pdf.bytes.byteLength } as const;
    const context = {
      targetJurisdiction: TARGET_JURISDICTION,
      baselineDate: BASELINE_DATE,
      reserveSlug: (candidate: string): string => {
        slugCandidates.set(item.id, candidate);
        return reserver.preview(item.id, candidate);
      },
    };
    let result = processDocument(pdf.bytes, document, { institutions, context, knownStateAbbreviations, gazetteVolumes });
    let unitRaw: Array<{ url: string; sha256: string; byteLength: number; retrievedAt: string }> = [];
    const unitDecidable = result.baseline?.class === 'undetermined' && STAND_UNDETERMINED.test(result.baseline.basis) && result.outcome === 'review';
    if (result.outcome === 'reconstruction' || unitDecidable) {
      const unitIds = unitsByFrame.get(item.id) ?? [];
      const missingUnits = unitIds.filter((unitId) => !existsSync(join(root, CACHE_DIR, `${cacheKey(pdfExportUrl(unitId, 'dokument'))}.bin`))).length;
      if (unitIds.length === 0) {
        result.reasons.push('keine Einzelfassungen in der Sitemap');
      } else if (missingUnits > 0) {
        // Nicht teilweise parsen: Erst wenn alle Einzelfassungen im Cache liegen, wird zusammengesetzt.
        result.reasons.push(`Einzelfassungen nicht vollständig im Cache (${unitIds.length - missingUnits}/${unitIds.length}; npm run import:juris-sh:fetch-corpus -- --phase units)`);
      } else {
        try {
          const units = await loadUnits(client, unitIds);
          result = processDocument(pdf.bytes, document, { institutions, context, units, knownStateAbbreviations, gazetteVolumes });
          const selectedIds = new Set(result.historical?.selectedUnitIds ?? []);
          unitRaw = units.filter((unit) => selectedIds.has(unit.documentId)).map((unit) => unit.raw);
        } catch (error) {
          if (!(error instanceof ExportError) && !(error instanceof RechtNrwFetchError)) throw error;
          result.reasons.push(`Einzelfassungen nicht vollständig im Cache (${unitIds.length} Einheiten; npm run import:juris-sh:fetch-corpus -- --phase units)`);
        }
      }
    }
    options.onResult?.(result);
    results.push({ item, result, unitRaw });
    if (processed % 250 === 0) log(`${options.mode}: ${processed}/${selected.length} Dokumente verarbeitet`);
  }

  // Eindeutigkeit der Gliederungsnummern im Bestand (je Bereich).
  const glCount = new Map<string, number>();
  for (const { item, result } of results) {
    const gl = result?.source?.gliederungsnummer;
    if (!gl) continue;
    const key = `${item.area}:${normalizeGliederungsnummer(gl)}`;
    glCount.set(key, (glCount.get(key) ?? 0) + 1);
  }

  // VwV-Anlagen, die juris als eigenes Dokument führt („Zum Hauptdokument : <Titel>“): der Stammnorm anhängen
  // (`annexes.ts`). Nur eindeutige Zuordnungen; die Anlage ist danach keine eigene Norm.
  const annexAssignment = assignSeparateAnnexes(results.map(({ item, result }) => ({ id: item.id, area: item.area, result })));
  const resultById = new Map(results.map(({ item, result }) => [item.id, result]));
  for (const [mainId, annexIds] of annexAssignment.annexesOf) {
    const main = resultById.get(mainId);
    if (!main) continue;
    const annexes = annexIds.map((id) => ({ id, result: resultById.get(id)! })).filter((entry) => entry.result);
    const attached = attachAnnexes(main, annexes);
    if (main.record && attached.length > 0) main.record = validateNormRecord(main.record, `${TARGET_JURISDICTION}/${main.record.meta.slug}`);
    for (const id of annexIds) {
      const annex = resultById.get(id);
      if (!annex) continue;
      const attachedHere = attached.includes(id);
      annex.outcome = 'part-of-main';
      annex.partOf = mainId;
      annex.reasons = [attachedHere ? `Anlage der Stammnorm ${mainId} (dort angehängt)` : `Anlage der Stammnorm ${mainId}; am Stichtag nicht geltend oder nicht verwendbar (${annex.baseline?.class ?? annex.outcome})`];
      annex.blockers = [];
      annex.findings.push({ severity: 'info', code: 'annex-of-main', message: `Bestandteil der Stammnorm ${mainId}${attachedHere ? ' (als Anlage angehängt)' : ''}` });
      delete annex.record;
      delete annex.slug;
    }
  }
  for (const [mainId, annexIds] of annexAssignment.ambiguousMains) {
    const main = resultById.get(mainId);
    if (!main) continue;
    main.blockers.push({ kind: 'parse', code: 'annex-separate-document', detail: `Anlagendokument(e) ${annexIds.slice(0, 5).join(', ')} mehreren Stammnormen zuzuordnen` });
    main.reasons.push(`Anlagendokument(e) ${annexIds.slice(0, 5).join(', ')} nicht eindeutig zuzuordnen`);
    if (main.outcome === 'import-ready') main.outcome = 'review';
  }
  for (const [annexId, reason] of annexAssignment.unresolved) {
    const annex = resultById.get(annexId);
    if (annex) annex.findings.push({ severity: 'info', code: 'annex-unassigned', message: `Stammnorm nicht eindeutig: ${reason}` });
  }

  const entries: InventoryEntry[] = [];
  const written: string[] = [];
  let normsWritten = 0;
  let normsUnchanged = 0;
  let normsRemoved = 0;
  for (const { item, result, unitRaw } of results) {
    if (!result) {
      entries.push({ documentId: item.id, area: item.area, outcome: 'not-cached', blockers: [], warnings: 0, ledger: { matched: 0, postBaseline: 0, contradictions: 0 } });
      state.entries[item.id] = { outcome: 'not-cached' };
      continue;
    }
    const matches = result.source ? matchLedgerEvents(ledgerIndex, { area: item.area, ...(result.source.gliederungsnummer ? { gliederungsnummer: result.source.gliederungsnummer } : {}), documentDates: result.source.documentDates }, glCount) : [];
    const evidence = result.outcome === 'failed' ? undefined : baselineEvidence(result, matches);
    // Anlage einer Stammnorm: Review-Fälle gehören zur Stammnorm (dort übernommen), nicht zur Anlage.
    const inputs = result.outcome === 'part-of-main' ? [] : reviewInputsFor(result, evidence);
    const reviewBlocking = inputs.some((input) => input.severity === 'blocking');
    const status = manifestStatusFor(result, reviewBlocking);
    const outcome = result.outcome === 'import-ready' && reviewBlocking ? 'review' : result.outcome;
    const previous = previousByIdentity.get(item.id);
    let slug: string | undefined;
    if (isImportedStatus(status) && result.record) {
      // Reserviert wird erst jetzt, in Dokumentreihenfolge (auch im Dry-run, nur im Speicher). Weicht der Slug von der
      // Vorschau ab (gleicher Kandidat bei zwei Normen dieses Laufs), werden Kennung und Slug der Norm nachgezogen.
      const reservation = reserver.reserve(item.id, slugCandidates.get(item.id) ?? result.record.meta.slug);
      slug = reservation.slug;
      if (slug !== result.record.meta.slug) {
        result.record = validateNormRecord({ ...result.record, meta: { ...result.record.meta, id: `${TARGET_JURISDICTION}:${slug}`, slug } }, `${TARGET_JURISDICTION}/${slug}`);
        result.slug = slug;
      }
      // Akzeptierte technische Kollision (wie BayWü): Der öffentliche Slug ist eindeutig (Kennungssuffix) und in der
      // Registry stabil – Befund (info) im Manifest, kein Review-Fall, keine Warnung.
      if (reservation.collision) result.findings.push({ severity: 'info', code: 'slug-collision', message: `Slugkandidat ${reservation.collision.candidate} bereits vergeben (${reservation.collision.heldBy}); eindeutiger Slug ${slug}` });
    }
    // Regression: früher übernommen, jetzt nicht mehr → Verzeichnis zurücknehmen, Review-Fall.
    if (previous && isImportedStatus(previous.importStatus) && !isImportedStatus(status)) {
      inputs.push({ category: 'import-regression', key: 'imported-before', severity: 'blocking', summary: `Früher übernommen (${previous.targetSlug}), im Wiederholungslauf nicht mehr übernahmefähig`, details: result.reasons.slice(0, 5) });
      const removed = await removeOwnNormDirectory({ root, slug: previous.targetSlug, sourceIdentity: item.id, write: writeNorms });
      if (removed) {
        normsRemoved += 1;
        if (writeNorms) written.push(removed);
      }
    }
    const sourceUrl = permaUrl(item.id);
    review = mergeReviewItems(review, { sourceArea: item.area, sourceIdentity: item.id, sourceUrl, ...(slug ? { targetSlug: slug } : {}), now }, inputs);
    const reviewStatus = review.items.some((entry) => entry.sourceIdentity === item.id && entry.status === 'open' && entry.occurrence === 'current') ? 'open' : review.items.some((entry) => entry.sourceIdentity === item.id) ? 'resolved' : 'none';

    if (writeNorms) {
      if (slug && result.record) {
        const write = await writeNormRecord({ root, record: result.record, sourceIdentity: item.id, baselineDate: BASELINE_DATE, write: true });
        if (write.finding) throw new Error(`${item.id}: ${write.finding.message}`);
        if (write.changed) {
          normsWritten += 1;
          written.push(...write.files);
        } else normsUnchanged += 1;
      }
      const entry = manifestEntryFor(result, status, evidence, slug, reviewStatus, now, unitRaw);
      // Archivstand (Staging/R2) gleicher Rohquellen bleibt erhalten – ein Bulk-Lauf stuft nie zurück.
      if (entry && previous) {
        for (const raw of entry.rawDocuments) {
          const archived = previous.rawDocuments.find((candidate) => candidate.role === raw.role && candidate.url === raw.url && candidate.sha256 === raw.sha256 && candidate.archiveStatus);
          if (archived) Object.assign(raw, { ...(archived.bucket ? { bucket: archived.bucket } : {}), ...(archived.objectKey ? { objectKey: archived.objectKey } : {}), archiveStatus: archived.archiveStatus });
        }
      }
      if (entry) {
        const manifestWrite = await writeManifestEntry(root, entry);
        if (manifestWrite.changed) written.push(manifestWrite.path);
      }
      const shard = await writeReviewShard(root, review, item.area, item.id);
      if (shard.changed) written.push(shard.path);
    } else if (slug && result.record) {
      const check = await writeNormRecord({ root, record: result.record, sourceIdentity: item.id, baselineDate: BASELINE_DATE, write: false });
      if (check.changed) normsWritten += 1;
      else normsUnchanged += 1;
    }
    state.entries[item.id] = { outcome, manifestStatus: status, ...(slug ? { slug } : {}), sha256: result.raw.sha256 };
    entries.push({
      documentId: item.id,
      area: item.area,
      outcome,
      manifestStatus: status,
      ...(result.baseline ? { baselineClass: result.baseline.class } : {}),
      ...(evidence ? { baselineStatus: status === 'not-at-baseline' ? 'not-active-at-baseline' : evidence.assessment.status, rule: evidence.assessment.rule } : {}),
      ...(result.title ? { title: result.title.slice(0, 160) } : {}),
      ...(result.type ? { type: result.type } : {}),
      ...(result.source?.gliederungsnummer ? { gliederungsnummer: result.source.gliederungsnummer } : {}),
      ...(slug ? { slug } : {}),
      ...(result.integrity ? { integrity: result.integrity.class } : {}),
      ...(result.counts ? { pages: result.counts.pages } : {}),
      blockers: [...result.blockers.map((blocker) => ({ kind: blocker.kind, code: blocker.code })), ...(evidence && evidence.contradictions.length > 0 ? [{ kind: 'baseline' as const, code: 'ledger-contradiction' }] : [])],
      ...(result.reasons[0] ? { reason: result.reasons.join(' | ').slice(0, 300) } : {}),
      warnings: result.warnings.length,
      ledger: { matched: matches.length, postBaseline: evidence?.postBaselineEvents ?? 0, contradictions: evidence?.contradictions.length ?? 0 },
      ...(result.historical ? { historical: { units: result.historical.units, selected: result.historical.selected, omitted: result.historical.omitted, problems: result.historical.problems.length } } : {}),
    });
  }

  const documentFacts = results.map(({ item, result }) => ({ id: item.id, area: item.area, ...(result?.source ? { gl: result.source.gliederungsnummer, dates: result.source.documentDates, fundstelle: result.source.fundstelle } : {}), ...(result?.title ? { title: result.title } : {}), ...(result ? { outcome: result.outcome } : {}) }));
  const registerCrosscheck = options.only?.length ? [] : await computeRegisterCrosscheck(root, ledgerFile, documentFacts);
  const report = buildInventoryReport(entries, items.length, ledgerFile, documentFacts, registerCrosscheck);

  if (options.write) {
    if (abbreviations.written) written.push(OFFICIAL_ABBREVIATIONS_PATH);
    if (writeNorms) {
      if (reserver.changed && (await writeSlugRegistry(root, registry))) written.push('data/imports/juris-sh/slug-registry.json');
      // Teilbestand in der Oberfläche ausweisen (ein Land ohne Eintrag gälte als vollständig) – nur nach einem Vollauf.
      if (!options.only?.length && stop === undefined) {
        const { buildNshInventoryStatus, writeNshInventoryStatus, INVENTORY_STATUS_PATH } = await import('./inventory-status.ts');
        if (await writeNshInventoryStatus(root, buildNshInventoryStatus(report, await readManifest(root)))) written.push(INVENTORY_STATUS_PATH);
      }
      if (await writeJsonAtomic(join(root, BULK_STATE_PATH), { ...state, entries: Object.fromEntries(Object.entries(state.entries).sort(([left], [right]) => (left < right ? -1 : 1))) })) written.push(BULK_STATE_PATH);
    }
    if (!options.only?.length && stop === undefined) {
      if (await writeJsonAtomic(join(root, INVENTORY_JSON_PATH), report)) written.push(INVENTORY_JSON_PATH);
      const { renderCorpusInventory } = await import('../reports/render.ts');
      if (await writeFileAtomic(join(root, INVENTORY_REPORT_PATH), renderCorpusInventory(report))) written.push(INVENTORY_REPORT_PATH);
    }
  }
  return { report, written, normsWritten, normsUnchanged, normsRemoved, ...(stop ? { stop } : {}) };
}

/** Registereinträge ohne eigene konsolidierte Fassung: Änderungs-, Aufhebungs- und Mantelgesetze, Tarifverträge. */
export const REGISTER_NON_CONSOLIDATED = /^(?:(?:Erstes|Zweites|Drittes|Viertes|Fünftes|Sechstes|\d+\.)\s+)?(?:Gesetz|Landesverordnung|Verordnung)\s+(?:zur|über die)\s+(?:Änderung|Aufhebung|Bereinigung|Neuregelung|Neuordnung|Anpassung|Neufassung)\b|^(?:Tarifvertr|Bundes-Angestelltentarifvertrag|Manteltarifvertrag|Lohngruppenverzeichnis|Änderungstarifvertrag)/u;

/** Titelvergleich Register ↔ Bestand: Kleinbuchstaben, nur Buchstaben und Ziffern (Registertitel sind oft gekürzt). */
export { titleKey };

export function buildInventoryReport(entries: InventoryEntry[], enumerated: number, ledger: { events: LedgerEvent[]; sources: Array<{ id: string; asOf?: string }> }, documents: Array<{ id: string; area: EnumerableArea; gl?: string | undefined; dates?: string[]; title?: string | undefined }>, registerCrosscheck: RegisterCrosscheckSummary[] = []): InventoryReport {
  const totals: InventoryReport['totals'] = { enumerated, processed: entries.length, byOutcome: {}, byArea: {}, byBaselineClass: {}, byIntegrity: {}, byType: {}, byManifestStatus: {}, blockers: {}, evidenceRules: {} };
  for (const entry of entries) {
    increment(totals.byOutcome, entry.outcome);
    totals.byArea[entry.area] ??= {};
    increment(totals.byArea[entry.area]!, entry.outcome);
    if (entry.baselineClass) increment(totals.byBaselineClass, entry.baselineClass);
    if (entry.integrity) increment(totals.byIntegrity, entry.integrity);
    if (entry.type) increment(totals.byType, entry.type);
    if (entry.manifestStatus) increment(totals.byManifestStatus, entry.manifestStatus);
    if (entry.rule) increment(totals.evidenceRules, entry.rule);
    for (const blocker of new Set(entry.blockers.map((item) => `${item.kind}:${item.code}`))) increment(totals.blockers, blocker);
  }
  // baseline-only-Kandidaten des Registers gegen den Bestand.
  const byId = new Map(entries.map((entry) => [entry.documentId, entry]));
  const candidates = ledger.events.filter((event) => isBaselineOnlyCandidate(event));
  const baselineOnlyEntries: InventoryReport['baselineOnly']['entries'] = [];
  const byOutcome: Record<string, number> = {};
  for (const event of candidates) {
    const organArea: EnumerableArea = event.organ === 'amtsblatt' ? 'vwv' : 'landesrecht';
    const number = event.targetGliederungsnummer ? normalizeGliederungsnummer(event.targetGliederungsnummer) : undefined;
    const target = eventTargetDate(event);
    const sameNumber = number ? documents.filter((document) => document.area === organArea && document.gl && normalizeGliederungsnummer(document.gl) === number) : [];
    const matched = target ? sameNumber.filter((document) => document.dates?.includes(target)) : sameNumber.length === 1 ? sameNumber : [];
    const outcomes = matched.map((document) => byId.get(document.id)?.outcome ?? 'unknown');
    for (const outcome of outcomes.length > 0 ? outcomes : ['not-matched']) increment(byOutcome, outcome);
    baselineOnlyEntries.push({ eventId: event.id, eventDate: event.eventDate ?? '', ...(event.targetGliederungsnummer ? { gliederungsnummer: event.targetGliederungsnummer } : {}), title: event.targetTitle.slice(0, 160), documentIds: matched.map((document) => document.id), outcomes });
  }
  return {
    schemaVersion: INVENTORY_SCHEMA,
    baselineDate: BASELINE_DATE,
    parserVersion: PARSER_VERSION,
    transformerVersion: TRANSFORMER_VERSION,
    totals,
    registerCrosscheck,
    baselineOnly: { candidates: candidates.length, matched: baselineOnlyEntries.filter((entry) => entry.documentIds.length > 0).length, byOutcome, entries: baselineOnlyEntries },
    entries,
  };
}
