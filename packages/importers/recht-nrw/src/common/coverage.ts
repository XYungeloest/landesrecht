/**
 * Coverage-Report des RECHT.NRW-Imports – zentraler Freigabenachweis für den Bulkimport
 * (`data/audits/recht-nrw/coverage.json` und menschenlesbar `COVERAGE.md`).
 *
 * Grundlage: Enumeration je Bereich (Basis „enumerierte Stammnormen“), gemeinsames Manifest, Review-Queue,
 * Slug-Registry, Inhalte unter `content/norms/west/`, Rekonstruktionsrezepte und Laufzusammenfassungen.
 * Jede Kennzahl steht absolut und als Anteil an der Basis; noch nicht verarbeitete Einträge werden
 * ausgewiesen, damit nie ein „100 %“ ohne offene Fälle entsteht. Ohne Enumeration (Beispielkorpus) ist die
 * Basis die Zahl der geprüften Quellen (`scope: sample`).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readInstitutionRegistry, type InstitutionRegistry } from '../transform/institution-registry.ts';
import { writeFileAtomic, writeJsonAtomic } from './atomic.ts';
import { readEnumeration, type EnumerationCrosscheck, type EnumerationFile } from './enumeration.ts';
import { AUDIT_DIR, isImportedStatus, readManifest, type ImportManifest, type ManifestEntry, type SourceArea } from './manifest.ts';
import { listExistingSlugs } from './persist.ts';
import { readReviewQueue, type ReviewQueue } from './review-queue.ts';
import { readSlugRegistry, type SlugRegistry } from './slug-registry.ts';
import { isStaleEntry, regenerationCommand } from './staleness.ts';

export const COVERAGE_SCHEMA = 'recht-nrw-coverage/2' as const;
export const COVERAGE_PATH = join(AUDIT_DIR, 'coverage.json');
export const COVERAGE_MARKDOWN_PATH = join(AUDIT_DIR, 'COVERAGE.md');
export const RUNS_DIR = join(AUDIT_DIR, 'runs');

export interface CountMetric {
  count: number;
  /** Anteil an der Basis in Prozent (eine Nachkommastelle); `null` bei Basis 0. */
  percent: number | null;
}

export interface AreaCoverage {
  scope: 'sample' | 'bulk';
  base: { label: string; count: number };
  metrics: Record<string, CountMetric>;
  crosscheck?: EnumerationCrosscheck & { manifestWithoutEnumeration: number; enumerationWithoutManifest: number };
  stale: { count: number; identities: string[]; suggestion?: string };
}

export interface CoverageReport {
  schemaVersion: typeof COVERAGE_SCHEMA;
  generatedAt: string;
  baselineDate: string;
  lrgv: AreaCoverage;
  lrmb: AreaCoverage;
  consistency: { importedWithoutContent: string[]; contentWithoutManifest: string[]; slugRegistryMismatches: string[]; ok: boolean };
  reviewQueue: { open: number; openBlocking: number; openIdentities: number; byCategory: Record<string, number>; byStatus: Record<string, number> };
  institutions: { openReferences: number; byCategory: Record<string, number>; enactingBodyWithoutMapping: number; registryEntriesByStatus: Record<string, number> };
  archive: Record<string, number>;
  reconstruction: { required: number; reconstructed: number; recipes: number; uncertain: number };
  quality: { integrityFailures: number; postTransformAuditFailures: number; unresolvedReferences: number; failedImports: number; documentIdentityMismatch: number; documentIdentityReview: number };
  runs: Array<{ runId: string; sourceArea: string; runStatus: string; endedAt: string; processed: number }>;
}

export interface CoverageInput {
  manifest: ImportManifest;
  queue: ReviewQueue;
  enumerations: Partial<Record<SourceArea, EnumerationFile>>;
  contentSlugs: ReadonlySet<string>;
  slugRegistry?: SlugRegistry;
  institutionRegistry?: InstitutionRegistry;
  recipes?: ReadonlySet<string>;
  runs?: CoverageReport['runs'];
  now: string;
}

export function percent(count: number, base: number): number | null {
  return base > 0 ? Math.round((count * 1000) / base) / 10 : null;
}

const metric = (count: number, base: number): CountMetric => ({ count, percent: percent(count, base) });
const hasFinding = (entry: ManifestEntry, pattern: RegExp): boolean => entry.findings.some((finding) => pattern.test(finding.code));

function areaCoverage(area: SourceArea, input: CoverageInput): AreaCoverage {
  const entries = input.manifest.entries.filter((entry) => entry.sourceArea === area);
  const enumeration = input.enumerations[area];
  const candidates = enumeration ? enumeration.items.filter((item) => !item.mergedInto && item.role === 'norm-candidate') : [];
  const evidenceItems = enumeration ? enumeration.items.filter((item) => !item.mergedInto && item.role === 'evidence') : [];
  const withEntry = new Set(entries.map((entry) => entry.sourceIdentity));
  const base = enumeration ? candidates.length : entries.length;
  const pendingItems = candidates.filter((item) => item.status === 'pending' || item.status === 'processing');
  const excludedWithoutEntry = candidates.filter((item) => item.status === 'excluded' && !(item.sourceIdentity && withEntry.has(item.sourceIdentity))).length;
  const failedWithoutEntry = candidates.filter((item) => item.status === 'failed' && !(item.sourceIdentity && withEntry.has(item.sourceIdentity))).length;
  const imported = entries.filter((entry) => isImportedStatus(entry.importStatus));
  const count = (predicate: (entry: ManifestEntry) => boolean): number => entries.filter(predicate).length;
  const metrics: Record<string, CountMetric> = {};
  const put = (key: string, value: number): void => {
    metrics[key] = metric(value, base);
  };
  put('enumeratedTerms', base);
  put('processed', entries.length);
  put('pending', pendingItems.length);
  if (area === 'lrgv') {
    put('activeAtBaseline', count((entry) => entry.baselineStatus === 'active-at-baseline'));
    put('notActive', count((entry) => entry.baselineStatus === 'not-active-at-baseline'));
    put('imported', imported.length);
    put('importedWithWarnings', count((entry) => entry.importStatus === 'imported-with-warnings'));
    put('review', count((entry) => entry.importStatus === 'needs-review'));
    put('failed', count((entry) => entry.importStatus === 'failed') + failedWithoutEntry);
    put('notRenderable', count((entry) => entry.findings.some((finding) => /not-available|not-renderable/u.test(`${finding.code} ${finding.message}`) && finding.code.startsWith('selection-'))));
    put('pdfAttachmentReview', count((entry) => (entry.attachments ?? []).some((attachment) => /pdf/iu.test(attachment.mediaType) && attachment.handling !== 'structured-transcription')));
    put('versionConflict', count((entry) => hasFinding(entry, /^selection-/u)));
    put('excluded', count((entry) => entry.importStatus === 'excluded') + excludedWithoutEntry);
    put('consentLaws', count((entry) => entry.consentLaw?.detected === true));
    put('evidenceNotices', evidenceItems.length);
  } else {
    put('likelyNormative', count((entry) => entry.normativity?.decision === 'include') + pendingItems.filter((item) => item.preclassification.decision === 'likely-include').length);
    put('excluded', count((entry) => entry.importStatus === 'excluded') + excludedWithoutEntry);
    put('reviewNormativity', count((entry) => hasFinding(entry, /^normativity-review$/u)));
    put('activeAtBaseline', count((entry) => entry.baselineStatus === 'active-at-baseline'));
    put('notActive', count((entry) => entry.baselineStatus === 'not-active-at-baseline'));
    put('undetermined', count((entry) => entry.baselineStatus === 'undetermined' && entry.importStatus !== 'excluded'));
    put('directImport', imported.filter((entry) => entry.reconstructionStatus === 'direct').length);
    put('reconstructed', imported.filter((entry) => entry.reconstructionStatus === 'reconstructed').length);
    put('reconstructionRequired', count((entry) => entry.reconstructionStatus === 'reconstruction-required'));
    put('pdfOnly', count((entry) => entry.textCompleteness === 'pdf-only' || entry.textCompleteness === 'pdf-only-essential-attachments' || entry.textCompleteness === 'essential-attachment-missing'));
    put('attachmentIncomplete', imported.filter((entry) => (entry.attachments ?? []).some((attachment) => /pdf/iu.test(attachment.mediaType) && attachment.handling !== 'structured-transcription')).length);
    put('historicalGap', count((entry) => hasFinding(entry, /^validity-undetermined$/u)));
    put('documentIdentityReview', count((entry) => entry.documentIdentity?.status === 'review' || entry.documentIdentity?.status === 'mismatch'));
    put('failed', count((entry) => entry.importStatus === 'failed') + failedWithoutEntry);
  }
  const staleEntries = imported.filter((entry) => isStaleEntry(entry));
  const coverage: AreaCoverage = {
    scope: enumeration ? 'bulk' : 'sample',
    base: { label: enumeration ? 'enumerierte Stammnorm-Kandidaten (Enumeration; Dubletten werden im Bulk-Lauf zusammengeführt)' : 'geprüfte Quellen (Beispielkorpus, keine Enumeration)', count: base },
    metrics,
    stale: { count: staleEntries.length, identities: staleEntries.map((entry) => entry.sourceIdentity) },
  };
  if (staleEntries.length > 0) coverage.stale.suggestion = regenerationCommand(area);
  if (enumeration) {
    const identities = new Set(enumeration.items.map((item) => item.sourceIdentity ?? item.mergedInto).filter(Boolean));
    const entryIdentities = new Set(entries.map((entry) => entry.sourceIdentity));
    // Verarbeitete Einträge ohne Manifest fielen sonst stillschweigend aus allen Kennzahlen (keine Summe = Basis).
    const enumerationWithoutManifest = enumeration.items.filter((item) => !item.mergedInto && item.role !== 'evidence' && (item.status === 'done' || item.status === 'review') && !(item.sourceIdentity && entryIdentities.has(item.sourceIdentity))).length;
    coverage.crosscheck = { ...enumeration.crosscheck, manifestWithoutEnumeration: entries.filter((entry) => !identities.has(entry.sourceIdentity)).length, enumerationWithoutManifest };
  }
  return coverage;
}

export function computeCoverage(input: CoverageInput): CoverageReport {
  const { manifest, queue } = input;
  const open = queue.items.filter((item) => item.status === 'open');
  const byCategory: Record<string, number> = {};
  for (const item of open) byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
  const byStatus: Record<string, number> = {};
  for (const item of queue.items) byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
  const imported = manifest.entries.filter((entry) => isImportedStatus(entry.importStatus));
  const importedSlugs = new Set(imported.map((entry) => entry.targetSlug));
  const registryBySlug = new Map((input.slugRegistry?.entries ?? []).map((entry) => [entry.sourceIdentity, entry.slug]));
  const consistency: CoverageReport['consistency'] = {
    importedWithoutContent: imported.filter((entry) => !input.contentSlugs.has(entry.targetSlug)).map((entry) => entry.targetSlug).sort(),
    contentWithoutManifest: [...input.contentSlugs].filter((slug) => !importedSlugs.has(slug)).sort(),
    slugRegistryMismatches: input.slugRegistry ? imported.filter((entry) => registryBySlug.get(entry.sourceIdentity) !== entry.targetSlug).map((entry) => `${entry.sourceIdentity}: ${entry.targetSlug} ≠ ${registryBySlug.get(entry.sourceIdentity) ?? '–'}`).sort() : [],
    ok: false,
  };
  consistency.ok = consistency.importedWithoutContent.length === 0 && consistency.contentWithoutManifest.length === 0 && consistency.slugRegistryMismatches.length === 0;

  const institutionItems = open.filter((item) => item.category === 'institution-mapping');
  const institutionsByCategory: Record<string, number> = {};
  let openReferences = 0;
  for (const item of institutionItems) {
    const category = item.key.startsWith('detections:') ? item.key.slice('detections:'.length) : item.key;
    const references = item.details.reduce((sum, detail) => sum + Number(/×(\d+)/u.exec(detail)?.[1] ?? 1), 0);
    institutionsByCategory[category] = (institutionsByCategory[category] ?? 0) + references;
    openReferences += references;
  }
  const registryEntriesByStatus: Record<string, number> = {};
  for (const entry of input.institutionRegistry?.entries ?? []) registryEntriesByStatus[entry.status] = (registryEntriesByStatus[entry.status] ?? 0) + 1;
  const archive: Record<string, number> = {};
  for (const entry of manifest.entries) for (const raw of entry.rawDocuments) archive[raw.archiveStatus ?? (raw.localSource ? 'versioned' : 'unknown')] = (archive[raw.archiveStatus ?? (raw.localSource ? 'versioned' : 'unknown')] ?? 0) + 1;

  const lrgv = areaCoverage('lrgv', input);
  const lrmb = areaCoverage('lrmb', input);
  // „Verarbeitet ohne Manifest“ (Abbruch vor der Stammnorm-Kennung) bleibt als Kennzahl sichtbar, ist aber ein
  // normlokaler Befund und kein Konsistenzfehler: Manifest, Inhalte und Slug-Registry stimmen weiterhin überein.

  return {
    schemaVersion: COVERAGE_SCHEMA,
    generatedAt: input.now,
    baselineDate: manifest.baselineDate,
    lrgv,
    lrmb,
    consistency,
    reviewQueue: { open: open.length, openBlocking: open.filter((item) => item.severity === 'blocking').length, openIdentities: new Set(open.map((item) => item.sourceIdentity)).size, byCategory: Object.fromEntries(Object.entries(byCategory).sort(([left], [right]) => left.localeCompare(right))), byStatus: Object.fromEntries(Object.entries(byStatus).sort(([left], [right]) => left.localeCompare(right))) },
    institutions: { openReferences, byCategory: Object.fromEntries(Object.entries(institutionsByCategory).sort(([left], [right]) => left.localeCompare(right))), enactingBodyWithoutMapping: manifest.entries.filter((entry) => entry.findings.some((finding) => finding.code === 'enacting-body-mapping-required')).length, registryEntriesByStatus },
    archive: Object.fromEntries(Object.entries(archive).sort(([left], [right]) => left.localeCompare(right))),
    reconstruction: {
      required: manifest.entries.filter((entry) => entry.reconstructionStatus === 'reconstruction-required').length,
      reconstructed: imported.filter((entry) => entry.reconstructionStatus === 'reconstructed').length,
      recipes: input.recipes?.size ?? 0,
      uncertain: new Set(open.filter((item) => item.category === 'reconstruction-uncertain').map((item) => item.sourceIdentity)).size,
    },
    quality: {
      integrityFailures: imported.filter((entry) => !entry.integrity.fetchParse || !entry.integrity.sourceCanonical).length,
      postTransformAuditFailures: manifest.entries.filter((entry) => entry.transformation.postTransformAudit === false).length,
      unresolvedReferences: manifest.entries.reduce((sum, entry) => sum + entry.transformation.unresolved, 0),
      failedImports: manifest.entries.filter((entry) => entry.importStatus === 'failed').length,
      documentIdentityMismatch: manifest.entries.filter((entry) => entry.documentIdentity?.status === 'mismatch').length,
      documentIdentityReview: manifest.entries.filter((entry) => entry.documentIdentity?.status === 'review').length,
    },
    runs: input.runs ?? [],
  };
}

/** Vergleichsform ohne Laufmetadaten (Audit: gespeicherter Report ↔ Neuberechnung). */
export function coverageComparable(report: CoverageReport): string {
  const { generatedAt: _generatedAt, runs: _runs, ...rest } = report;
  return JSON.stringify(rest);
}

export async function readRunSummaries(root: string, limitPerArea = 5): Promise<CoverageReport['runs']> {
  let files: string[];
  try {
    files = (await readdir(join(root, RUNS_DIR))).filter((file) => file.endsWith('.json')).sort();
  } catch {
    return [];
  }
  const runs: CoverageReport['runs'] = [];
  for (const file of files) {
    try {
      const summary = JSON.parse(await readFile(join(root, RUNS_DIR, file), 'utf8')) as { runId: string; sourceArea: string; runStatus: string; endedAt: string; processed: number };
      runs.push({ runId: summary.runId, sourceArea: summary.sourceArea, runStatus: summary.runStatus, endedAt: summary.endedAt, processed: summary.processed });
    } catch {
      // unlesbare Zusammenfassungen zählen nicht
    }
  }
  const latest: CoverageReport['runs'] = [];
  for (const area of ['lrgv', 'lrmb']) latest.push(...runs.filter((run) => run.sourceArea === area).sort((left, right) => right.endedAt.localeCompare(left.endedAt)).slice(0, limitPerArea));
  return latest;
}

export async function collectCoverageInput(root: string, now: string): Promise<CoverageInput> {
  const recipes = new Set<string>();
  try {
    for (const file of await readdir(join(root, 'data', 'imports', 'recht-nrw', 'reconstructions'))) if (/^term-\d+\.json$/u.test(file)) recipes.add(`term:${file.slice(5, -5)}`);
  } catch {
    // keine Rezepte
  }
  const enumerations: CoverageInput['enumerations'] = {};
  for (const area of ['lrgv', 'lrmb'] as const) {
    const file = await readEnumeration(root, area);
    if (file) enumerations[area] = file;
  }
  return {
    manifest: await readManifest(root),
    queue: await readReviewQueue(root),
    enumerations,
    contentSlugs: await listExistingSlugs(root),
    slugRegistry: await readSlugRegistry(root),
    institutionRegistry: (await readInstitutionRegistry(root)).registry,
    recipes,
    runs: await readRunSummaries(root),
    now,
  };
}

const LABELS: Record<string, string> = {
  enumeratedTerms: 'Enumerierte Stammnormen (Basis)',
  processed: 'Verarbeitet (Manifesteintrag)',
  pending: 'Noch nicht verarbeitet',
  activeAtBaseline: 'Am Stichtag geltend',
  notActive: 'Am Stichtag nicht geltend',
  imported: 'Übernommen',
  importedWithWarnings: 'davon mit Warnungen',
  review: 'Review',
  failed: 'Fehlgeschlagen',
  notRenderable: 'Stichtagsfassung nicht darstellbar',
  pdfAttachmentReview: 'PDF-Anlagen (Review, nicht blockierend)',
  versionConflict: 'Konflikt der Stichtagsauswahl',
  excluded: 'Ausgeschlossen',
  consentLaws: 'Zustimmungsgesetze',
  evidenceNotices: 'Bekanntmachungen (Evidenzquellen, keine Normen)',
  likelyNormative: 'Voraussichtlich normativ',
  reviewNormativity: 'Review Normativität',
  undetermined: 'Geltung unbestimmt',
  directImport: 'Direkt übernommen',
  reconstructed: 'Rekonstruiert übernommen',
  reconstructionRequired: 'Rekonstruktion erforderlich',
  pdfOnly: 'Regelungsgehalt nur als PDF oder Anlage fehlt',
  attachmentIncomplete: 'Übernommen mit PDF-Anlage ohne strukturierten Text',
  historicalGap: 'Historische Lücke (undatiert, ohne Beleg)',
  documentIdentityReview: 'Dokumentidentität prüfen',
};

function renderArea(title: string, coverage: AreaCoverage): string[] {
  const lines = [`## ${title}`, '', `Umfang: ${coverage.scope === 'bulk' ? 'Bulk (Enumeration)' : 'Beispielkorpus'} · Basis: ${coverage.base.label} = ${coverage.base.count}`, '', '| Kennzahl | Anzahl | Anteil |', '| --- | ---: | ---: |'];
  for (const [key, value] of Object.entries(coverage.metrics)) lines.push(`| ${LABELS[key] ?? key} | ${value.count} | ${value.percent === null ? '–' : `${value.percent.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`} |`);
  if (coverage.crosscheck) {
    const cross = coverage.crosscheck;
    lines.push('', '**Abgleich Sitemap ↔ Suchindex ↔ Manifest**', '', '| Kennzahl | Wert |', '| --- | ---: |');
    for (const [label, value] of [['Sitemap-Adressen', cross.sitemapUrls], ['Sitemap-Slug-Stämme', cross.sitemapStems], ['Suchindex-Treffer', cross.searchHits], ['davon in der Sitemap', cross.searchHitsInSitemap], ['nicht in der Sitemap', cross.searchHitsNotInSitemap], ['Vereinigung', cross.union], ['Schnittmenge', cross.intersection], ['nur Sitemap', cross.onlySitemap], ['nur Suchindex', cross.onlySearch], ['Einträge', cross.items], ['aufgelöste Term-IDs', cross.resolvedTerms], ['Vorklassifikation Review', cross.review], ['ohne Seitenabruf ausgeschlossen', cross.excluded], ['Adressen ohne Eintrag', cross.unassignedUrls], ['Adressen mehrfach zugeordnet', cross.duplicateUrlAssignments], ['Term-Konflikte', cross.termConflicts], ['Manifest ohne Enumeration', cross.manifestWithoutEnumeration], ['Verarbeitet ohne Manifest', cross.enumerationWithoutManifest]] as const) lines.push(`| ${label} | ${value} |`);
    lines.push('', `Abgleich: ${cross.ok ? 'ok' : `**Abweichungen:** ${cross.problems.join('; ')}`}`);
  }
  lines.push('', `Veraltete Importe (Parser/Transformer): ${coverage.stale.count}${coverage.stale.suggestion ? ` – Regeneration: \`${coverage.stale.suggestion}\`` : ''}`, '');
  return lines;
}

export function renderCoverageMarkdown(report: CoverageReport): string {
  const lines = [
    '# Coverage RECHT.NRW → Land Westdeutschland',
    '',
    `Stichtag ${report.baselineDate}. Erzeugt mit \`npm run import:recht-nrw:coverage -- --write\`. Anteile beziehen sich auf die Basis des Bereichs; offene und nicht verarbeitete Fälle sind ausgewiesen.`,
    '',
    ...renderArea('LRGV (Gesetze, Rechtsverordnungen)', report.lrgv),
    ...renderArea('LRMB (Verwaltungsvorschriften)', report.lrmb),
    '## Konsistenz Manifest ↔ Inhalte ↔ Slug-Registry',
    '',
    `- Übernommen ohne Inhalt: ${report.consistency.importedWithoutContent.length}`,
    `- Inhalt ohne Manifesteintrag: ${report.consistency.contentWithoutManifest.length}${report.consistency.contentWithoutManifest.length ? ` (${report.consistency.contentWithoutManifest.join(', ')})` : ''}`,
    `- Slug-Registry abweichend: ${report.consistency.slugRegistryMismatches.length}`,
    '',
    '## Review-Queue',
    '',
    `Offen: ${report.reviewQueue.open} (blockierend ${report.reviewQueue.openBlocking}, ${report.reviewQueue.openIdentities} Quellen)`,
    '',
    '| Kategorie | offen |',
    '| --- | ---: |',
    ...Object.entries(report.reviewQueue.byCategory).map(([category, count]) => `| ${category} | ${count} |`),
    '',
    `Status aller Fälle: ${Object.entries(report.reviewQueue.byStatus).map(([status, count]) => `${status} ${count}`).join(', ') || '–'}`,
    '',
    '## Institutionen',
    '',
    `Offene Bezeichnungen ohne Entsprechung: ${report.institutions.openReferences} (${Object.entries(report.institutions.byCategory).map(([category, count]) => `${category} ${count}`).join(', ') || '–'}); Erlassorgan ohne Simulationsorgan: ${report.institutions.enactingBodyWithoutMapping}; Zuordnungseinträge: ${Object.entries(report.institutions.registryEntriesByStatus).map(([status, count]) => `${status} ${count}`).join(', ') || '–'}.`,
    '',
    '## Rohquellen, Rekonstruktion, Qualität',
    '',
    `- Archivstatus der Rohquellen: ${Object.entries(report.archive).map(([status, count]) => `${status} ${count}`).join(', ') || '–'}`,
    `- Rekonstruktion: erforderlich ${report.reconstruction.required}, rekonstruiert ${report.reconstruction.reconstructed}, Rezepte ${report.reconstruction.recipes}, unsicher ${report.reconstruction.uncertain}`,
    `- Integritätsfehler ${report.quality.integrityFailures}, Prüfung nach Transformation fehlgeschlagen ${report.quality.postTransformAuditFailures}, manuelle Entscheidungen ${report.quality.unresolvedReferences}, fehlgeschlagene Importe ${report.quality.failedImports}, Dokumentidentität Widerspruch ${report.quality.documentIdentityMismatch} / Review ${report.quality.documentIdentityReview}`,
    '',
    '## Letzte Läufe',
    '',
    ...(report.runs.length ? report.runs.map((run) => `- ${run.runId}: ${run.runStatus}, ${run.processed} verarbeitet (Ende ${run.endedAt})`) : ['- keine']),
    '',
  ];
  return lines.join('\n');
}

export async function writeCoverage(root: string, report: CoverageReport): Promise<string[]> {
  await writeJsonAtomic(join(root, COVERAGE_PATH), report);
  await writeFileAtomic(join(root, COVERAGE_MARKDOWN_PATH), renderCoverageMarkdown(report));
  return [COVERAGE_PATH, COVERAGE_MARKDOWN_PATH].map((path) => path.replace(/\\/gu, '/'));
}
