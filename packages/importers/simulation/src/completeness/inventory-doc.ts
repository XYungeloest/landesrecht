/**
 * `docs/SIM_PUBLICATION_INVENTORY.md`: konkrete Suchliste der fehlenden Hefte, Drucksachen und Akte je Land, erzeugt
 * aus `data/simulation/<land>/completeness.json` (Serien, fehlende und verdächtige Ausgaben, ungeklärte Zeiträume,
 * Hinweise) – kein eigener Datenbestand; `completeness --write` schreibt sie mit.
 */
import type { SimulationSourceStatus } from '@landesrecht/legal-core/config/inventory-status.ts';
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { getJurisdiction } from '@landesrecht/legal-core/config/jurisdictions.ts';

import type { CompletenessFile, SourceGap } from './schema.ts';

const GAP_SECTIONS: ReadonlyArray<[SourceGap['class'], string]> = [
  ['gazette-issue-missing', 'A – Blattausgabe fehlt'],
  ['standalone-act-missing', 'B – amtlicher Einzelakt fehlt (Existenz sonst belegt)'],
  ['evidence-incomplete', 'C – Evidenz unvollständig (Quelle vorhanden)'],
  ['possible-gap', 'D – mögliche Lücke (nie als fehlende Quelle gezählt)'],
];

export const PUBLICATION_INVENTORY_DOC_PATH = 'docs/SIM_PUBLICATION_INVENTORY.md';

export function renderPublicationInventory(files: ReadonlyArray<{ jurisdiction: JurisdictionId; file: CompletenessFile; sources?: SimulationSourceStatus }>): string {
  const lines: string[] = [
    '# Sim-Verkündungsinventar: bekannte, vorhandene und fehlende Quellen',
    '',
    'Erzeugt von `npm run import:simulation:completeness -- --write` aus `data/simulation/<land>/completeness.json`. Eine',
    'Ausgabe gilt als bekannt, wenn Nummernfolge, Querverweis oder Verkündungsmitteilung sie belegen; „fehlend“ ist die',
    'konkrete Suchliste. Eine bislang fehlende Quelle, die im Archiv `imports/` auftaucht, wird über das Inventar und die',
    'Bewertung nachgetragen (Status je Land bleibt `SIM SOURCES PARTIAL`, bis alle bekannten Lücken geschlossen sind).',
    '',
    'Blattabdeckung und Gesamtstatus sind getrennt (docs/SIMULATION_IMPORT.md, Abschnitt 7.2): „alle bekannten Ausgaben',
    'vorhanden“ heißt nicht, dass der Sim-Rechtsstand vollständig belegt ist. Beschaffbare Quellen: `docs/SIM_SOURCE_ACQUISITION.md`.',
    '',
  ];
  for (const { jurisdiction, file, sources } of files) {
    lines.push(`## ${getJurisdiction(jurisdiction).name} (\`${jurisdiction}\`) – ${file.status}, Stand ${file.assessedAt}`, '');
    if (sources) {
      lines.push(
        `- Blattabdeckung: **${sources.gazetteCoverage.status}** (${sources.gazetteCoverage.presentIssues}/${sources.gazetteCoverage.knownIssues} bekannte Ausgaben, ${sources.gazetteCoverage.suspiciousIssues} verdächtig)`,
        `- Einzelverkündungen: **${sources.standaloneSourceCoverage.status}** (${sources.standaloneSourceCoverage.present} vorhanden, ${sources.standaloneSourceCoverage.evidenceOnly} nur als Beleg, ${sources.standaloneSourceCoverage.missing} fehlend)`,
        `- Sim-Quellen gesamt: **${sources.simulationStatus}** · fehlende Quellen ${sources.missingSourceCount} · Evidenz unvollständig ${sources.evidenceIncompleteCount} · mögliche Lücken ${sources.possibleGapCount} + ${sources.knownUnclearPeriods} Zeiträume`,
        `- Ereignisse: ${sources.events.applied} applied, ${sources.events.pending} pending, ${sources.events.review} review, ${sources.events.blocked} blocked (davon ${sources.events.blockedByBaselineTarget.events} wegen Zielnorm außerhalb des eingefrorenen Bestands), ${sources.events.notPromulgated} not-promulgated; quellenbedingt offen ${sources.events.sourceCaused}; letzte Quelle ${sources.lastSourceDate ?? '–'}`,
        '',
      );
    }
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
    for (const [kind, label] of GAP_SECTIONS) {
      const gaps = file.sourceGaps.filter((gap) => gap.class === kind);
      if (gaps.length === 0) continue;
      lines.push(`Lücken ${label}:`, '');
      for (const gap of gaps) lines.push(`- \`${gap.id}\` ${gap.title}${gap.acquisition ? ` (${gap.acquisition.priority})` : ''}`);
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
