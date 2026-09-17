#!/usr/bin/env node
/**
 * Audit 6: Abkürzungen und Slugs des West-Bestands (offline, nur Report – nichts wird geändert).
 *
 *   node scripts/audit-naming.ts
 *
 * Schreibt data/audits/recht-nrw/quality/naming.{json,md}: generische/zu kurze/doppelte Abkürzungen,
 * Reste der Quell-Landesbezeichnung, „West West“, sehr lange oder abgeschnittene Slugs, Kollisionssuffixe
 * mit Einordnung (gleicher Titel vs. echte Kollision) und sichere Vorschläge.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadWestCorpus, mdTable, repositoryRoot, writeAuditReport } from './lib/audit-common.ts';
import { auditNaming } from './lib/naming-audit.ts';

const root = repositoryRoot();
const norms = await loadWestCorpus(root);
const result = auditNaming(norms);

interface RegistryFile { entries: Array<{ slug: string; sourceIdentity: string; assignment: string }> }
const registry = JSON.parse(await readFile(join(root, 'data', 'imports', 'recht-nrw', 'slug-registry.json'), 'utf8')) as RegistryFile;
const registrySlugs = new Set(registry.entries.map((entry) => entry.slug));
const normSlugs = new Set(norms.map((record) => record.meta.slug));
const registryCheck = {
  entries: registry.entries.length,
  byAssignment: registry.entries.reduce<Record<string, number>>((acc, entry) => { acc[entry.assignment] = (acc[entry.assignment] ?? 0) + 1; return acc; }, {}),
  normsWithoutRegistryEntry: [...normSlugs].filter((slug) => !registrySlugs.has(slug)).sort(),
  registryEntriesWithoutNorm: registry.entries.filter((entry) => !normSlugs.has(entry.slug)).length,
};

const { summary, issues, collisions, duplicateAbbrs } = result;
const codeTable = mdTable(['Code', 'Anzahl'], Object.entries(summary.issueCodes).sort(([left], [right]) => left.localeCompare(right)).map(([code, count]) => [code, count]));
const bySeverity = (severity: string): typeof issues => issues.filter((issue) => issue.severity === severity && issue.code !== 'abbr-duplicate');
const truncated = issues.filter((issue) => issue.code === 'slug-truncated-title');
const truncatedTails = truncated.reduce<Record<string, number>>((acc, issue) => { const tail = issue.message.match(/„([^“]+)“/u)?.[1] ?? '?'; acc[tail] = (acc[tail] ?? 0) + 1; return acc; }, {});
const otherWarnings = bySeverity('warning').filter((issue) => issue.code !== 'slug-truncated-title');
const titles = new Map(norms.map((record) => [record.meta.slug, record.meta.title]));

const markdown = `# Abkürzungs- und Slug-Audit – West

Quelle: \`content/norms/west/**/meta.json\` und \`data/imports/recht-nrw/slug-registry.json\`. Erzeugt mit
\`npm run audit:naming\`; Prüflogik in \`scripts/lib/naming-audit.ts\`. Geprüft werden alle ${summary.norms} Normen.
Es wird nichts geändert: Slugs sind dauerhafte Adressen, Vorschläge betreffen die Registry künftiger Importe
oder eine redaktionelle Entscheidung.

## Ergebnis

| Kennzahl | Wert |
| --- | --- |
| Normen | ${summary.norms} |
| mit Abkürzung | ${summary.withAbbr} |
| ohne Abkürzung | ${summary.withoutAbbr} (${Object.entries(summary.withoutAbbrByType).sort().map(([type, count]) => `${type} ${count}`).join(', ')}) |
| Fehler / Warnungen / Hinweise | ${summary.errors} / ${summary.warnings} / ${summary.infos} |
| längster Slug | ${summary.slugLength.max} Zeichen (über 80: ${summary.slugLength.over80}, über 100: ${summary.slugLength.over100}) |
| Slugs mit Kollisionssuffix | ${summary.collisionSuffixSlugs} |
| mehrfach vergebene Abkürzungen | ${summary.duplicateAbbrGroups} Gruppen |
| Registry-Einträge | ${registryCheck.entries} (${Object.entries(registryCheck.byAssignment).sort().map(([key, count]) => `${key} ${count}`).join(', ')}) |
| Normen ohne Registry-Eintrag | ${registryCheck.normsWithoutRegistryEntry.length} |
| Registry-Einträge ohne Norm | ${registryCheck.registryEntriesWithoutNorm} |

## Befunde nach Code

${codeTable}

## Fehler (${bySeverity('error').length})

${bySeverity('error').length === 0 ? 'Keine.' : mdTable(['Norm', 'Code', 'Wert', 'Meldung', 'Vorschlag'], bySeverity('error').map((issue) => [issue.slug, issue.code, issue.value, issue.message, issue.suggestion]))}

## Abgeschnittene Titel-Slugs (${truncated.length})

Die abgeleiteten Slugs kürzen lange Titel und hängen „-west“ an; endet der Rest auf einem Funktionswort, ist die Adresse
unverständlich („…-des-west“). Bestehende Adressen bleiben (dauerhafte Links); Vorschlag für künftige Ableitungen: vor dem
Anhängen des Landeszusatzes auf Wortgrenze kürzen und Funktionswörter am Ende entfernen. Verteilung nach Endwort:
${Object.entries(truncatedTails).sort(([, left], [, right]) => right - left).map(([tail, count]) => `„${tail}“ ${count}`).join(', ')}.
Vollständige Liste in \`naming.json\` (Code \`slug-truncated-title\`); erste ${Math.min(30, truncated.length)} Beispiele:

${truncated.length === 0 ? 'Keine.' : mdTable(['Norm', 'Titel'], truncated.slice(0, 30).map((issue) => [issue.slug, titles.get(issue.slug)]))}

## Weitere Warnungen (${otherWarnings.length})

${otherWarnings.length === 0 ? 'Keine.' : mdTable(['Norm', 'Code', 'Wert', 'Meldung', 'Vorschlag'], otherWarnings.map((issue) => [issue.slug, issue.code, issue.value, issue.message, issue.suggestion]))}

## Mehrfach vergebene Abkürzungen (${duplicateAbbrs.length})

${duplicateAbbrs.length === 0 ? 'Keine.' : mdTable(['Abkürzung', 'Normen'], duplicateAbbrs.map((group) => [group.abbr, group.slugs.join(', ')]))}

## Kollisionssuffixe (${collisions.length})

Einordnung: „gleicher Titel“ = zwei Stammnormen mit identischem Titel (z. B. Neufassung als eigener Portaldatensatz) – technisch
korrekt, redaktionell zu prüfen; „abweichende Abkürzung“ = Kollision, obwohl eine sprechende Abkürzung verfügbar wäre (Vorschlag
nur für künftige Registry-Einträge).

${collisions.length === 0 ? 'Keine.' : mdTable(['Slug', 'Basis', 'gleicher Titel', 'Titel', 'Titel der Basis', 'Abkürzung', 'Abkürzung der Basis', 'Vorschlag'], collisions.map((entry) => [entry.slug, entry.base, entry.sameTitle ? 'ja' : 'nein', entry.title, entry.baseTitle, entry.abbr, entry.baseAbbr, entry.suggestion]))}

## Hinweise (${bySeverity('info').length})

${bySeverity('info').length === 0 ? 'Keine.' : mdTable(['Norm', 'Code', 'Wert', 'Meldung'], bySeverity('info').map((issue) => [issue.slug, issue.code, issue.value, issue.message]))}
`;

const paths = await writeAuditReport({ name: 'naming', json: { ...result, registry: registryCheck }, markdown }, root);
console.log(`Benennungs-Audit: ${summary.norms} Normen, ${summary.errors} Fehler, ${summary.warnings} Warnungen, ${summary.infos} Hinweise → ${paths.markdown}`);
