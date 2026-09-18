/**
 * Bericht der offenen Organzuordnungen (`enacting-body-mapping-required`): welche Erlassorgane der Quelle ohne
 * festgelegte Entsprechung im Freistaat Bayern-Württemberg sind, gruppiert nach Ressortkern. Der Bericht entscheidet
 * nichts – er ist die Arbeitsliste für das Institution-Mapping-Review (`institution-mapping.json`). Es werden keine
 * Behörden erfunden; eine Zuordnung entsteht nur durch einen Registereintrag mit Begründung.
 */
import { join } from 'node:path';

import { writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { AUDIT_DIR } from '../common/constants.ts';
import type { ImportManifest } from '../common/manifest.ts';

export const INSTITUTIONS_REPORT_PATH = join(AUDIT_DIR, 'INSTITUTIONS.md');

/** Ressortkern nach Schlüsselwort der Bezeichnung; mehrere Ressorts in einer Formel sind eine eigene Gruppe. */
const GROUPS: ReadonlyArray<readonly [string, RegExp]> = [
  ['Staatskanzlei, Ministerpräsident, ohne Ressort', /Staatskanzlei|Ministerpräsident|^Bayerisches Staatsministerium$/u],
  ['Inneres', /des Innern/u],
  ['Justiz', /der Justiz/u],
  ['Finanzen', /der Finanzen/u],
  ['Unterricht, Kultus, Bildung', /Unterricht|Kultus/u],
  ['Wissenschaft und Kunst', /Wissenschaft/u],
  ['Ernährung, Landwirtschaft, Forsten', /Landwirtschaft|Ernährung/u],
  ['Wohnen, Bau, Verkehr', /Wohnen, Bau/u],
  ['Umwelt, Landesentwicklung', /Umwelt|Landesentwicklung und Umweltfragen/u],
  ['Arbeit, Soziales, Familie', /Arbeit|Familie/u],
  ['Gesundheit', /Gesundheit/u],
  ['Wirtschaft, Energie, Verkehr', /Wirtschaft/u],
  ['Digitales', /Digitales/u],
];

const JOINT = /\s(?:und|sowie)\s+(?:das|des)\s+Bayerischen?\s+Staatsministeri/u;

export interface InstitutionGroup {
  group: string;
  warnings: number;
  names: Array<{ name: string; warnings: number }>;
}

export function groupMappingWarnings(manifest: Pick<ImportManifest, 'entries'>, code = 'enacting-body-mapping-required'): { total: number; distinct: number; groups: InstitutionGroup[] } {
  const byName = new Map<string, number>();
  for (const entry of manifest.entries) {
    for (const finding of entry.findings) {
      if (finding.code !== code) continue;
      const name = /„(.*)“/u.exec(finding.message)?.[1] ?? finding.message;
      byName.set(name, (byName.get(name) ?? 0) + 1);
    }
  }
  const groups = new Map<string, InstitutionGroup>();
  for (const [name, warnings] of byName) {
    const group = JOINT.test(name) || /soweit|nach Beschluss|\*$/u.test(name)
      ? 'Mehrere Ressorts oder Zusatz in der Formel'
      : GROUPS.find(([, pattern]) => pattern.test(name))?.[0] ?? 'Ohne Zuordnung zu einem Ressortkern';
    const bucket = groups.get(group) ?? { group, warnings: 0, names: [] };
    bucket.warnings += warnings;
    bucket.names.push({ name, warnings });
    groups.set(group, bucket);
  }
  const sorted = [...groups.values()].sort((left, right) => right.warnings - left.warnings || left.group.localeCompare(right.group, 'de'));
  for (const group of sorted) group.names.sort((left, right) => right.warnings - left.warnings || left.name.localeCompare(right.name, 'de'));
  return { total: [...byName.values()].reduce((sum, count) => sum + count, 0), distinct: byName.size, groups: sorted };
}

export function renderInstitutionsReport(summary: ReturnType<typeof groupMappingWarnings>, before?: { total: number; distinct: number }, historical?: ReturnType<typeof groupMappingWarnings>): string {
  const lines = [
    '# Offene Organzuordnungen BayWü (Institution-Mapping-Review)',
    '',
    'Erzeugt von `bayernrecht coverage --write` aus den Manifestbefunden `enacting-body-mapping-required`. Jede Zeile ist ein Erlassorgan der Quelle, für das `data/imports/bayernrecht/institution-mapping.json` keine Entsprechung festlegt. Der Normtext bleibt unverändert, das Quellorgan bleibt als `originEnactingBody` erhalten, die Übernahme ist nicht blockiert (`imported-with-warnings`).',
    '',
    'Eingetragen sind nur Verfassungsorgane mit unstrittiger Entsprechung (Landtag, Staatsregierung, Ministerpräsident). Staatsministerien und Behörden bleiben Prüffälle, weil ihr Zuschnitt im Freistaat Bayern-Württemberg nicht festgelegt ist – es werden keine Behörden erfunden.',
    '',
    `- Befunde: **${summary.total}**${before ? ` (vorher ${before.total})` : ''}`,
    `- Unterschiedliche Bezeichnungen: **${summary.distinct}**${before ? ` (vorher ${before.distinct})` : ''}`,
    `- Ressortgruppen: **${summary.groups.length}**`,
    ...(historical ? [
      `- Historische Erlassorgane (am Stichtag nicht mehr bestehend, Beleg StRGVV § 2; nur Provenienz, kein Prüffall): **${historical.total}** Befunde, ${historical.distinct} Bezeichnungen`,
    ] : []),
    '',
    '| Ressortgruppe | Befunde | Bezeichnungen |',
    '| --- | ---: | ---: |',
    ...summary.groups.map((group) => `| ${group.group} | ${group.warnings} | ${group.names.length} |`),
    '',
  ];
  for (const group of summary.groups) {
    lines.push(`## ${group.group} (${group.warnings})`, '');
    for (const name of group.names) lines.push(`- ${name.warnings} × ${name.name.replace(/\|/gu, '\\|')}`);
    lines.push('');
  }
  if (historical && historical.total > 0) {
    lines.push('## Historische Erlassorgane (nur Provenienz)', '', '`historical-source-only` in `institution-mapping.json`: kein Simulationsorgan, Quellorgan bleibt `originEnactingBody`, Normtext unverändert.', '');
    for (const group of historical.groups) lines.push(`- ${group.group}: ${group.warnings} (${group.names.map((name) => `${name.warnings} × ${name.name.replace(/\|/gu, '\\|')}`).join('; ')})`);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export async function writeInstitutionsReport(root: string, manifest: Pick<ImportManifest, 'entries'>, before?: { total: number; distinct: number }): Promise<boolean> {
  return writeFileAtomic(join(root, INSTITUTIONS_REPORT_PATH), renderInstitutionsReport(groupMappingWarnings(manifest), before, groupMappingWarnings(manifest, 'enacting-body-historical')));
}
