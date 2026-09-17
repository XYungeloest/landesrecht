#!/usr/bin/env node
/**
 * Audit 4: SourceReference-Integrität aller West-Normen (offline).
 *
 *   node scripts/audit-provenance.ts [--strict]
 *
 * Prüft je Norm sourceCitation, sourceReferences (r2-archived: bucket, objectKey, sha256, url,
 * retrievedAt; versioned: Datei und Hash), Hashabgleich mit dem Manifest, sourceStatus und
 * sourceValidFrom. Schreibt data/audits/recht-nrw/quality/provenance.{json,md}. Mit --strict
 * Exit-Code 1 bei Fehlern.
 */
import { loadWestCorpus, mdTable, parseCliArgs, repositoryRoot, writeAuditReport } from './lib/audit-common.ts';
import { auditProvenance } from './lib/provenance-audit.ts';

const { flags } = parseCliArgs(process.argv.slice(2));
const root = repositoryRoot();
const norms = await loadWestCorpus(root);
const result = await auditProvenance(norms, root);
const { summary, issues } = result;

const countTable = (record: Record<string, number>): string => mdTable(['Wert', 'Anzahl'], Object.entries(record).sort(([left], [right]) => left.localeCompare(right)).map(([key, count]) => [key, count]));

const markdown = `# Provenienz-Audit (SourceReferences) – West

Quelle: \`content/norms/west/**\` gegen \`data/imports/recht-nrw/manifest/**\`. Erzeugt mit \`npm run audit:provenance\`;
Prüflogik in \`scripts/lib/provenance-audit.ts\` (identisch mit \`tests/unit/content-provenance.test.ts\`).
Geprüft werden alle Normen (keine Stichprobe), jeweils die am Stichtag geltende Fassung.

## Ergebnis

| Kennzahl | Wert |
| --- | --- |
| Normen | ${summary.norms} |
| Normen mit Fehlern | ${summary.normsWithErrors} |
| Normen mit Warnungen | ${summary.normsWithWarnings} |
| Fehler gesamt | ${summary.errors} |
| Warnungen gesamt | ${summary.warnings} |
| Normen mit R2-Archivquellen | ${summary.r2Norms} |
| Normen mit versionierten Quellen (Beispielkorpus) | ${summary.versionedNorms.length} |
| Hashabgleiche bestanden (Manifest bzw. Datei) | ${summary.verifiedHashes} |

## Quellenreferenzen nach Verfügbarkeit

${countTable(summary.byAvailability)}

## Quellenreferenzen nach Art

${countTable(summary.byKind)}

## Archivstatus laut Manifest (je referenziertes Objekt)

${countTable(summary.byArchiveStatus)}

## Quellenlage der Fassungen

Geltung: ${Object.entries(summary.bySourceValidity).sort().map(([key, count]) => `${key} ${count}`).join(', ') || '–'} · Text: ${Object.entries(summary.bySourceText).sort().map(([key, count]) => `${key} ${count}`).join(', ') || '–'}

## Importstatus laut Manifest

${countTable(summary.byImportStatus)}

## Befunde nach Code

${countTable(summary.issueCodes)}

## Normen mit versionierten Quellen

${summary.versionedNorms.map((slug) => `- ${slug}`).join('\n') || '–'}

## Befunde (${issues.length})

${issues.length === 0 ? 'Keine Befunde.' : mdTable(['Norm', 'Schwere', 'Code', 'Meldung'], issues.map((issue) => [issue.slug, issue.severity, issue.code, issue.message]))}
`;

const paths = await writeAuditReport({ name: 'provenance', json: result, markdown }, root);
console.log(`Provenienz-Audit: ${summary.norms} Normen, ${summary.errors} Fehler, ${summary.warnings} Warnungen → ${paths.markdown}`);
if (flags.has('strict') && summary.errors > 0) process.exitCode = 1;
