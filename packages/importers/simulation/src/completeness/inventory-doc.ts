/**
 * `docs/SIM_PUBLICATION_INVENTORY.md`: konkrete Suchliste der fehlenden Hefte, Drucksachen und Akte je Land, erzeugt
 * aus `data/simulation/<land>/completeness.json` (Serien, fehlende und verdächtige Ausgaben, ungeklärte Zeiträume,
 * Hinweise) – kein eigener Datenbestand; `completeness --write` schreibt sie mit.
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { getJurisdiction } from '@landesrecht/legal-core/config/jurisdictions.ts';

import type { CompletenessFile } from './schema.ts';

export const PUBLICATION_INVENTORY_DOC_PATH = 'docs/SIM_PUBLICATION_INVENTORY.md';

export function renderPublicationInventory(files: ReadonlyArray<{ jurisdiction: JurisdictionId; file: CompletenessFile }>): string {
  const lines: string[] = [
    '# Sim-Verkündungsinventar: bekannte, vorhandene und fehlende Quellen',
    '',
    'Erzeugt von `npm run import:simulation:completeness -- --write` aus `data/simulation/<land>/completeness.json`. Eine',
    'Ausgabe gilt als bekannt, wenn Nummernfolge, Querverweis oder Verkündungsmitteilung sie belegen; „fehlend“ ist die',
    'konkrete Suchliste. Eine bislang fehlende Quelle, die im Archiv `imports/` auftaucht, wird über das Inventar und die',
    'Bewertung nachgetragen (Status je Land bleibt `SIM SOURCES PARTIAL`, bis alle bekannten Lücken geschlossen sind).',
    '',
  ];
  for (const { jurisdiction, file } of files) {
    lines.push(`## ${getJurisdiction(jurisdiction).name} (\`${jurisdiction}\`) – ${file.status}, Stand ${file.assessedAt}`, '');
    lines.push('| Blattreihe | bekannt | vorhanden | fehlend | verdächtig |', '| --- | ---: | ---: | --- | --- |');
    for (const series of file.series) {
      lines.push(`| ${series.gazette}${series.seriesTitle ? ` – ${series.seriesTitle}` : ''} | ${series.knownIssues.length} | ${series.presentIssues.length} | ${series.missingIssues.length ? series.missingIssues.join('; ') : '–'} | ${series.suspiciousIssues.length ? series.suspiciousIssues.join('; ') : '–'} |`);
    }
    lines.push('', `Einzelakte ohne Blattausgabe: ${file.standaloneActs.present} vorhanden, ${file.standaloneActs.evidenceOnly} nur als Verkündungsbeleg.`, '');
    if (file.unclearPeriods.length > 0) {
      lines.push('Ungeklärte Zeiträume (Suchliste):', '');
      for (const period of file.unclearPeriods) lines.push(`- ${period.from} – ${period.to}: ${period.note}`);
      lines.push('');
    }
    const missing = file.notes.filter((note) => /^Fehlende Quellen?:|fehlt|fehlen/u.test(note));
    if (missing.length > 0) {
      lines.push('Hinweise zu fehlenden Quellen:', '');
      for (const note of missing) lines.push(`- ${note}`);
      lines.push('');
    }
  }
  return `${lines.join('\n')}\n`;
}
