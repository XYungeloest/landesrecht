/**
 * Kennzahlen des BayWü-Bestands (`npm run import:bayernrecht:coverage`).
 *
 *   data/audits/bayernrecht/coverage.json   maschinenlesbar
 *   data/audits/bayernrecht/COVERAGE.md     Lesefassung derselben Zahlen
 *
 * Vier Fragen, die der Stand beantworten kann:
 *
 *   1. **Wie viel ist enumeriert?** Je Bereich und Normtyp, mit dem Stand aus beiden Quellen
 *      (Fortführungsnachweis und Portalfacette) und der Zahl derer, die nur die Facette führt.
 *   2. **Wie weit ist die Verarbeitung?** Manifeststatus je Bereich – solange kein Bulk gelaufen ist,
 *      sind das Nullen, und genau das soll die Tabelle zeigen, statt die Frage zu verschweigen.
 *   3. **Was deckt der Beispielkorpus ab?** Je Strukturfall die Zahl der Normen, an deren Paket er
 *      nachgewiesen ist – nicht die Zahl derer, für die er vorgesehen war.
 *   4. **Wie groß ist die Stichtagsfrage?** Anteil der Normen, deren Fortführungsnachweis nach dem
 *      Stichtag eine Änderung nennt. Für sie ist der heutige Text nicht der Stichtagstext; für die
 *      übrigen ist er es, und das ist ein Beleg aus der Quelle, keine Annahme. Ohne datierte Notiz
 *      bleibt der Fall „unbekannt“ – er wird nicht dem einen oder anderen Lager zugeschlagen.
 *
 * **Deterministisch.** Die Zahlen hängen nur vom Bestand ab; `generatedAt` ist ein Laufmetadatum und
 * wird vom gespeicherten Bericht übernommen, solange der Fingerabdruck gleich bleibt. Ein zweiter Lauf
 * schreibt deshalb nichts („Unverändert“).
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { readJsonFile, writeFileAtomic, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { stableStringify } from '@landesrecht/importer-recht-nrw/common/stable-json.ts';

import { AUDIT_DIR, BASELINE_DATE, SOURCE_AREAS, SOURCE_SYSTEM, TARGET_JURISDICTION, type SourceArea } from '../common/constants.ts';
import { IMPORT_STATUSES, readManifest, REVIEW_STATUSES, type ImportManifest, type ImportStatus, type ReviewStatus } from '../common/manifest.ts';
import { COVERAGE_PATH } from '../common/paths.ts';
import { CORPUS_PATH, type CorpusFile } from '../corpus/run.ts';
import { readEnumeration, type EnumerationFile } from '../enumerate/enumeration.ts';
import { STRUCTURE_CASES, type StructureCase } from '../corpus/inspect.ts';
import { NORM_TYPE_LABELS, type NormType } from '../enumerate/portal.ts';

export const COVERAGE_SCHEMA = 'bayernrecht-coverage/1' as const;
export const COVERAGE_MARKDOWN_PATH = `${AUDIT_DIR}/COVERAGE.md`;
export { COVERAGE_PATH };

/** Bereiche mit Enumeration; `events` erzeugt keine Normen und hat deshalb keine Abdeckungszahl. */
const ENUMERABLE_AREAS: readonly SourceArea[] = ['landesrecht', 'vwv'];

export interface AreaCoverage {
  area: SourceArea;
  /** Dokumente der Enumeration (Facette und Fortführungsnachweis zusammengeführt). */
  documents: number;
  fortfuehrungsnachweisEntries: number;
  facetDocuments: number;
  onlyFacet: number;
  byNormType: Array<{ normType: NormType | 'unbekannt'; label: string; documents: number }>;
  /** Änderungslage relativ zum Stichtag, aus dem Fortführungsnachweis. */
  baseline: { changedAfter: number; unchanged: number; unknown: number };
  /** Manifeststatus der Stammnormen dieses Bereichs. */
  manifest: { entries: number; byImportStatus: Record<ImportStatus, number>; byReviewStatus: Record<ReviewStatus, number> };
}

export interface CoverageReport {
  schemaVersion: typeof COVERAGE_SCHEMA;
  jurisdiction: typeof TARGET_JURISDICTION;
  sourceSystem: typeof SOURCE_SYSTEM;
  baselineDate: string;
  /** Laufmetadatum; bleibt unverändert, solange der Fingerabdruck gleich ist. */
  generatedAt: string;
  contentFingerprint: string;
  areas: AreaCoverage[];
  totals: {
    documents: number;
    manifestEntries: number;
    imported: number;
    baseline: { changedAfter: number; unchanged: number; unknown: number; changedAfterShare: number | null };
  };
  corpus: {
    entries: number;
    /** Je Strukturfall die Zahl der Normen, an deren Paket er nachgewiesen ist. */
    byStructureCase: Array<{ case: StructureCase; norms: number }>;
    /** Strukturfälle, die kein Paket des Korpus zeigt. */
    uncovered: StructureCase[];
    requirements: { total: number; met: number };
  } | null;
}

export interface CoverageInput {
  enumerations: ReadonlyMap<SourceArea, EnumerationFile>;
  manifest: Pick<ImportManifest, 'entries'>;
  corpus: CorpusFile | undefined;
  baselineDate: string;
  now: string;
}

const emptyImportStatusCounts = (): Record<ImportStatus, number> => Object.fromEntries(IMPORT_STATUSES.map((status) => [status, 0])) as Record<ImportStatus, number>;
const emptyReviewStatusCounts = (): Record<ReviewStatus, number> => Object.fromEntries(REVIEW_STATUSES.map((status) => [status, 0])) as Record<ReviewStatus, number>;

/** Anteil mit drei Nachkommastellen; ohne Grundgesamtheit `null` statt einer erfundenen Null. */
export function share(part: number, total: number): number | null {
  return total === 0 ? null : Math.round((part / total) * 1000) / 1000;
}

function coverageFingerprint(report: Omit<CoverageReport, 'generatedAt' | 'contentFingerprint'>): string {
  return createHash('sha256').update(stableStringify({ ...report })).digest('hex');
}

export function computeCoverage(input: CoverageInput): CoverageReport {
  const areas: AreaCoverage[] = [];
  for (const area of SOURCE_AREAS) {
    const file = input.enumerations.get(area);
    if (!file && !ENUMERABLE_AREAS.includes(area)) continue;
    const entries = input.manifest.entries.filter((entry) => entry.sourceArea === area);
    const byImportStatus = emptyImportStatusCounts();
    const byReviewStatus = emptyReviewStatusCounts();
    for (const entry of entries) {
      byImportStatus[entry.importStatus] += 1;
      byReviewStatus[entry.reviewStatus] += 1;
    }
    const items = file?.items ?? [];
    const normTypes = new Map<NormType | 'unbekannt', number>();
    let changedAfter = 0;
    let unchanged = 0;
    let unknown = 0;
    for (const item of items) {
      const normType = (item.normType ?? 'unbekannt') as NormType | 'unbekannt';
      normTypes.set(normType, (normTypes.get(normType) ?? 0) + 1);
      if (item.changedAfterBaseline === true) changedAfter += 1;
      else if (item.changedAfterBaseline === false) unchanged += 1;
      else unknown += 1;
    }
    areas.push({
      area,
      documents: items.length,
      fortfuehrungsnachweisEntries: file?.crosscheck.fortfuehrungsnachweisEntries ?? 0,
      facetDocuments: file?.crosscheck.facetDocuments ?? 0,
      onlyFacet: file?.crosscheck.onlyFacet ?? 0,
      byNormType: [...normTypes.entries()]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([normType, documents]) => ({ normType, label: normType === 'unbekannt' ? 'ohne Normtyp' : NORM_TYPE_LABELS[normType], documents })),
      baseline: { changedAfter, unchanged, unknown },
      manifest: { entries: entries.length, byImportStatus, byReviewStatus },
    });
  }

  const totals = {
    documents: areas.reduce((sum, area) => sum + area.documents, 0),
    manifestEntries: input.manifest.entries.length,
    imported: input.manifest.entries.filter((entry) => entry.importStatus === 'imported' || entry.importStatus === 'imported-with-warnings').length,
    baseline: {
      changedAfter: areas.reduce((sum, area) => sum + area.baseline.changedAfter, 0),
      unchanged: areas.reduce((sum, area) => sum + area.baseline.unchanged, 0),
      unknown: areas.reduce((sum, area) => sum + area.baseline.unknown, 0),
      changedAfterShare: null as number | null,
    },
  };
  // Bezugsgröße ist, was die Quelle datiert beantwortet: unbekannte Fälle verzerren den Anteil sonst.
  totals.baseline.changedAfterShare = share(totals.baseline.changedAfter, totals.baseline.changedAfter + totals.baseline.unchanged);

  const corpus = input.corpus
    ? {
        entries: input.corpus.entries.length,
        byStructureCase: STRUCTURE_CASES.map((structureCase) => ({ case: structureCase, norms: input.corpus!.entries.filter((entry) => entry.cases.includes(structureCase)).length })),
        uncovered: STRUCTURE_CASES.filter((structureCase) => !input.corpus!.entries.some((entry) => entry.cases.includes(structureCase))),
        requirements: { total: input.corpus.coverage.requirements.length, met: input.corpus.coverage.requirements.filter((requirement) => requirement.ok).length },
      }
    : null;

  const body = {
    schemaVersion: COVERAGE_SCHEMA,
    jurisdiction: TARGET_JURISDICTION,
    sourceSystem: SOURCE_SYSTEM,
    baselineDate: input.baselineDate,
    areas,
    totals,
    corpus,
  } satisfies Omit<CoverageReport, 'generatedAt' | 'contentFingerprint'>;
  return { ...body, generatedAt: input.now, contentFingerprint: coverageFingerprint(body) };
}

/**
 * Liest den Bestand und rechnet die Kennzahlen. `now` ist nur ein Laufmetadatum – und selbst das
 * verschwindet, sobald ein gespeicherter Bericht denselben Fingerabdruck trägt: Dann gilt dessen
 * `generatedAt` weiter, und auch die Ausgabe auf der Konsole ist zwischen zwei Läufen byteidentisch.
 */
export async function collectCoverage(root: string, now: string = new Date().toISOString()): Promise<CoverageReport> {
  const enumerations = new Map<SourceArea, EnumerationFile>();
  for (const area of ENUMERABLE_AREAS) {
    const file = await readEnumeration(root, area);
    if (file) enumerations.set(area, file);
  }
  const manifest = await readManifest(root);
  const corpus = await readJsonFile<CorpusFile>(join(root, CORPUS_PATH));
  const report = computeCoverage({ enumerations, manifest, corpus, baselineDate: BASELINE_DATE, now });
  const stored = await readJsonFile<CoverageReport>(join(root, COVERAGE_PATH));
  return stored?.contentFingerprint === report.contentFingerprint ? { ...report, generatedAt: stored.generatedAt } : report;
}

const percent = (value: number | null): string => (value === null ? '–' : `${(value * 100).toFixed(1)} %`);

export function renderCoverageMarkdown(report: CoverageReport): string {
  const lines: string[] = [
    `# Abdeckung des BayWü-Bestands (${report.sourceSystem} → ${report.jurisdiction})`,
    '',
    `Stichtag ${report.baselineDate}. Erzeugt von \`npm run import:bayernrecht:coverage -- --write\`; die Zahlen`,
    'hängen allein vom Bestand ab (Enumeration, Manifest, Beispielkorpus), nicht vom Zeitpunkt des Laufs.',
    '',
    '## Enumeration je Bereich',
    '',
    '| Bereich | Dokumente | Fortführungsnachweis | Portalfacette | nur Facette |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...report.areas.map((area) => `| ${area.area} | ${area.documents} | ${area.fortfuehrungsnachweisEntries} | ${area.facetDocuments} | ${area.onlyFacet} |`),
    `| **gesamt** | **${report.totals.documents}** | | | |`,
    '',
    '## Enumeration je Normtyp',
    '',
    '| Bereich | Normtyp | Bezeichnung | Dokumente |',
    '| --- | --- | --- | ---: |',
    ...report.areas.flatMap((area) => area.byNormType.map((type) => `| ${area.area} | ${type.normType} | ${type.label} | ${type.documents} |`)),
    '',
    '## Manifeststatus',
    '',
    `Der Bestand entsteht erst mit dem Bulk-Lauf; solange keiner gelaufen ist, stehen hier Nullen – ausgewiesen,`,
    'nicht weggelassen.',
    '',
    '| Bereich | Einträge | ' + IMPORT_STATUSES.join(' | ') + ' |',
    '| --- | ---: |' + IMPORT_STATUSES.map(() => ' ---: |').join(''),
    ...report.areas.map((area) => `| ${area.area} | ${area.manifest.entries} | ${IMPORT_STATUSES.map((status) => area.manifest.byImportStatus[status]).join(' | ')} |`),
    '',
    '## Änderungslage relativ zum Stichtag',
    '',
    'Für Normen ohne Änderung nach dem Stichtag ist der heutige Text zugleich der Stichtagstext – belegt aus dem',
    'Fortführungsnachweis. Ohne datierte Notiz bleibt der Fall unbekannt und wird keinem Lager zugeschlagen.',
    '',
    '| Bereich | geändert nach Stichtag | unverändert | unbekannt |',
    '| --- | ---: | ---: | ---: |',
    ...report.areas.map((area) => `| ${area.area} | ${area.baseline.changedAfter} | ${area.baseline.unchanged} | ${area.baseline.unknown} |`),
    `| **gesamt** | **${report.totals.baseline.changedAfter}** | **${report.totals.baseline.unchanged}** | **${report.totals.baseline.unknown}** |`,
    '',
    `Anteil der datiert beantworteten Fälle mit Änderung nach dem Stichtag: **${percent(report.totals.baseline.changedAfterShare)}**.`,
    '',
    '## Beispielkorpus je Strukturfall',
    '',
  ];
  if (!report.corpus) {
    lines.push('Kein Beispielkorpus vorhanden (`npm run import:bayernrecht:sample -- --write`).', '');
  } else {
    lines.push(
      `${report.corpus.entries} Normen, ${report.corpus.requirements.met} von ${report.corpus.requirements.total} Abdeckungsanforderungen erfüllt.`,
      'Gezählt wird, was am abgelegten Paket nachgewiesen ist – nicht, was vorgesehen war.',
      '',
      '| Strukturfall | Normen |',
      '| --- | ---: |',
      ...report.corpus.byStructureCase.map((entry) => `| ${entry.case} | ${entry.norms} |`),
      '',
    );
    if (report.corpus.uncovered.length > 0) lines.push(`Ohne Beleg im Korpus: ${report.corpus.uncovered.join(', ')}.`, '');
  }
  lines.push(`Fingerabdruck des Inhalts: \`${report.contentFingerprint}\`.`, '');
  return lines.join('\n');
}

/**
 * Schreibt beide Dateien atomar. Ist der Inhalt unverändert, bleibt `generatedAt` des gespeicherten
 * Berichts erhalten – ein Wiederholungslauf erzeugt dann keinen Diff und meldet „Unverändert“.
 */
export async function writeCoverage(root: string, report: CoverageReport): Promise<{ written: string[]; unchanged: string[] }> {
  const stored = await readJsonFile<CoverageReport>(join(root, COVERAGE_PATH));
  const next = stored?.contentFingerprint === report.contentFingerprint ? { ...report, generatedAt: stored.generatedAt } : report;
  const written: string[] = [];
  const unchanged: string[] = [];
  (await writeJsonAtomic(join(root, COVERAGE_PATH), next)) ? written.push(COVERAGE_PATH) : unchanged.push(COVERAGE_PATH);
  (await writeFileAtomic(join(root, COVERAGE_MARKDOWN_PATH), renderCoverageMarkdown(next))) ? written.push(COVERAGE_MARKDOWN_PATH) : unchanged.push(COVERAGE_MARKDOWN_PATH);
  return { written, unchanged };
}

/** Kurzfassung für die Konsole (ohne `--json`, ohne `--write`). */
export function coverageSummary(report: CoverageReport): string[] {
  const lines = [
    `Abdeckung ${report.jurisdiction.toUpperCase()} (${report.sourceSystem}), Stichtag ${report.baselineDate}: ${report.totals.documents} enumerierte Dokumente`,
  ];
  for (const area of report.areas) {
    lines.push(`  ${area.area}: ${area.documents} Dokumente (${area.byNormType.map((type) => `${type.normType} ${type.documents}`).join(', ') || 'keine'}); Manifest ${area.manifest.entries}, geändert nach Stichtag ${area.baseline.changedAfter}, unverändert ${area.baseline.unchanged}, unbekannt ${area.baseline.unknown}`);
  }
  lines.push(`  Manifest gesamt: ${report.totals.manifestEntries} Einträge, davon ${report.totals.imported} übernommen`);
  lines.push(`  Änderung nach dem Stichtag: ${percent(report.totals.baseline.changedAfterShare)} der datiert beantworteten Fälle`);
  if (report.corpus) lines.push(`  Beispielkorpus: ${report.corpus.entries} Normen, ${report.corpus.byStructureCase.filter((entry) => entry.norms > 0).length} von ${STRUCTURE_CASES.length} Strukturfällen belegt${report.corpus.uncovered.length > 0 ? ` (ohne Beleg: ${report.corpus.uncovered.join(', ')})` : ''}`);
  else lines.push('  Beispielkorpus: nicht vorhanden');
  return lines;
}
