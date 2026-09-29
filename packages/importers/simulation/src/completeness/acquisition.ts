/**
 * Akquisitionsliste der Sim-Quellen: `data/simulation/source-acquisition-queue.json` und `docs/SIM_SOURCE_ACQUISITION.md`,
 * beide erzeugt aus den `sourceGaps` mit Akquisitionseintrag in `data/simulation/<land>/completeness.json` – keine eigene
 * Datenquelle. Nur nützliche Quellen stehen darin: mögliche Lücken (Klasse D) und Mängel ohne erreichbare Abhilfe tragen
 * keinen Akquisitionseintrag. Prioritäten: P1 entsperrt mehrere Akte oder eine zentrale Norm (nie spekulativ), P2 schließt
 * eine klare Publikationslücke, P3 dient nur Vollständigkeit oder Provenienz.
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { getJurisdiction } from '@landesrecht/legal-core/config/jurisdictions.ts';

import type { AcquisitionCandidate, AcquisitionResolution, AcquisitionStatus, CompletenessFile, SourceGap } from './schema.ts';

export const ACQUISITION_QUEUE_PATH = 'data/simulation/source-acquisition-queue.json';
export const ACQUISITION_DOC_PATH = 'docs/SIM_SOURCE_ACQUISITION.md';
export const ACQUISITION_QUEUE_SCHEMA = 'landesrecht-simulation-source-acquisition-queue/1';

const CLASS_LABEL: Record<SourceGap['class'], string> = {
  'gazette-issue-missing': 'A – Blattausgabe fehlt',
  'standalone-act-missing': 'B – Einzelakt fehlt',
  'evidence-incomplete': 'C – Evidenz unvollständig',
  'possible-gap': 'D – mögliche Lücke',
};

const MISSING_LABEL: Record<string, string> = {
  wording: 'Wortlaut',
  promulgation: 'Verkündung',
  'effective-date': 'Wirkdatum',
  signature: 'Unterschrift/Ausfertigung',
  annex: 'Anlage',
  'publication-identity': 'Publikationsidentität',
};

export interface AcquisitionQueueEntry {
  id: string;
  jurisdiction: JurisdictionId;
  sourceType: SourceGap['class'];
  expectedTitle: string;
  expectedDate: string | null;
  expectedPublication: string | null;
  existenceEvidence: string;
  missing: string[];
  blocks: { events: string[]; norms: string[] };
  priority: 'P1' | 'P2' | 'P3';
  confidence: 'high' | 'medium' | 'low';
  status: AcquisitionStatus;
  candidate?: AcquisitionCandidate;
  resolution?: AcquisitionResolution;
  supersededBy?: string;
  reason?: string;
  note?: string;
}

/** Noch zu beschaffen (Ausgabe von `sources:needed`): offen oder Kandidat gefunden, aber nicht verarbeitet. */
export function isNeeded(entry: Pick<AcquisitionQueueEntry, 'status'>): boolean {
  return entry.status === 'open' || entry.status === 'candidate-found';
}

type Assessed = ReadonlyArray<{ jurisdiction: JurisdictionId; file: CompletenessFile }>;

export function buildAcquisitionQueue(files: Assessed): AcquisitionQueueEntry[] {
  const entries: AcquisitionQueueEntry[] = [];
  for (const { jurisdiction, file } of files) {
    for (const gap of file.sourceGaps) {
      if (!gap.acquisition) continue;
      entries.push({
        id: gap.id,
        jurisdiction,
        sourceType: gap.class,
        expectedTitle: gap.title,
        expectedDate: gap.expectedDate ?? null,
        expectedPublication: gap.expectedPublication ?? null,
        existenceEvidence: gap.existenceEvidence,
        missing: gap.missing,
        blocks: gap.blocks,
        ...gap.acquisition,
        ...(gap.note ? { note: gap.note } : {}),
      });
    }
  }
  return entries.sort((a, b) => a.priority.localeCompare(b.priority) || a.jurisdiction.localeCompare(b.jurisdiction) || a.id.localeCompare(b.id));
}

export function acquisitionQueueFile(files: Assessed): { schemaVersion: string; totals: Record<string, number>; byStatus: Record<string, number>; entries: AcquisitionQueueEntry[] } {
  const entries = buildAcquisitionQueue(files);
  const totals: Record<string, number> = { all: entries.length, P1: 0, P2: 0, P3: 0 };
  const byStatus: Record<string, number> = {};
  for (const entry of entries) {
    totals[entry.priority] = (totals[entry.priority] ?? 0) + 1;
    byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
  }
  return { schemaVersion: ACQUISITION_QUEUE_SCHEMA, totals, byStatus: Object.fromEntries(Object.entries(byStatus).sort(([a], [b]) => a.localeCompare(b))), entries };
}

/** Kurzgrund einer Queue-Zeile: was fehlt und was die Quelle entsperrt. */
export function neededReason(entry: AcquisitionQueueEntry): string {
  const what = `${CLASS_LABEL[entry.sourceType]}${entry.missing.length ? ` (${entry.missing.map((key) => MISSING_LABEL[key] ?? key).join(', ')})` : ''}`;
  return `${what}; entsperrt ${unblocks(entry)}`;
}

/** Kompakte Liste „Was soll ich besorgen?“ je Priorität, optional nach Land und Priorität gefiltert. */
export function renderNeededLines(entries: readonly AcquisitionQueueEntry[], filter: { jurisdiction?: JurisdictionId; priority?: 'P1' | 'P2' | 'P3' } = {}): string[] {
  const selected = entries.filter((entry) => isNeeded(entry) && (!filter.jurisdiction || entry.jurisdiction === filter.jurisdiction) && (!filter.priority || entry.priority === filter.priority));
  const lines: string[] = [];
  for (const priority of ['P1', 'P2', 'P3'] as const) {
    const group = selected.filter((entry) => entry.priority === priority);
    if (group.length === 0) continue;
    lines.push(`${priority} (${group.length})`);
    for (const entry of group) {
      lines.push(`  ${getJurisdiction(entry.jurisdiction).shortName.padEnd(6)} ${entry.expectedTitle}${entry.status === 'candidate-found' ? ` [Kandidat ${entry.candidate!.sha256.slice(0, 12)} liegt vor – verarbeiten]` : ''}`);
      lines.push(`         ${neededReason(entry)} · ${entry.confidence} · ${entry.id}`);
    }
  }
  if (lines.length === 0) lines.push('Keine offenen Quellen für diesen Filter.');
  return lines;
}

function unblocks(entry: AcquisitionQueueEntry): string {
  const parts: string[] = [];
  if (entry.blocks.events.length > 0) parts.push(`${entry.blocks.events.length} Ledger-Ereignis${entry.blocks.events.length === 1 ? '' : 'se'}`);
  if (entry.blocks.norms.length > 0) parts.push(`Norm${entry.blocks.norms.length === 1 ? '' : 'en'} ${entry.blocks.norms.map((slug) => `\`${slug}\``).join(', ')}`);
  return parts.length > 0 ? parts.join(', ') : 'nichts (nur Vollständigkeit/Provenienz)';
}

export function renderAcquisitionDoc(files: Assessed): string {
  const entries = buildAcquisitionQueue(files);
  const lines: string[] = [
    '# Sim-Quellenakquise',
    '',
    `Erzeugt von \`npm run import:simulation:completeness -- --write\` aus den \`sourceGaps\` in \`data/simulation/<land>/completeness.json\`;`,
    `maschinenlesbar: \`${ACQUISITION_QUEUE_PATH}\`. Nur nützliche Quellen; mögliche Lücken (Klasse D) und bekannte Sackgassen stehen`,
    'nicht darin. P1 entsperrt mehrere Akte oder eine zentrale Norm, P2 schließt eine klare Publikationslücke, P3 dient nur',
    'Vollständigkeit oder Provenienz. Eine beschaffte Quelle wird archiviert, im Inventar erfasst und die Lücke in',
    '`completeness.json` geschlossen; Ost ist nicht Teil der Liste (OstRecht ist vorgelagertes Quellsystem).',
    '',
    `Summe: ${entries.length} (P1 ${entries.filter((e) => e.priority === 'P1').length}, P2 ${entries.filter((e) => e.priority === 'P2').length}, P3 ${entries.filter((e) => e.priority === 'P3').length}); noch zu beschaffen: ${entries.filter(isNeeded).length}. Kurzliste im Terminal: \`npm run sources:needed\` (\`--land <land>\`, \`--priority P1\`); neue Dateien: \`npm run sources:intake\` (docs/MAINTENANCE.md).`,
    '',
  ];
  for (const priority of ['P1', 'P2', 'P3'] as const) {
    const group = entries.filter((entry) => entry.priority === priority);
    if (group.length === 0) continue;
    lines.push(`## ${priority}`, '');
    for (const entry of group) {
      lines.push(`### ${getJurisdiction(entry.jurisdiction).shortName}: ${entry.expectedTitle}`, '');
      lines.push(`- **Was fehlt:** ${CLASS_LABEL[entry.sourceType]}${entry.missing.length ? ` (${entry.missing.map((key) => MISSING_LABEL[key] ?? key).join(', ')})` : ''}${entry.expectedPublication ? `; erwartet: ${entry.expectedPublication}` : ''}${entry.expectedDate ? `, ${entry.expectedDate}` : ''}.`);
      lines.push(`- **Existenzbeleg:** ${entry.existenceEvidence}`);
      lines.push(`- **Entsperrt:** ${unblocks(entry)}.`);
      lines.push(`- **Sicherheit / Status:** ${entry.confidence} / ${entry.status} (\`${entry.id}\`).${entry.note ? ` ${entry.note}` : ''}`);
      if (entry.candidate) lines.push(`- **Kandidat:** \`${entry.candidate.sha256.slice(0, 12)}\` (${entry.candidate.path}, gefunden ${entry.candidate.foundAt}).`);
      if (entry.resolution) lines.push(`- **Aufgelöst:** ${entry.resolution.resolvedAt} durch \`${entry.resolution.resolvedBySha256.slice(0, 12)}\`${entry.resolution.publications.length ? `, Verkündung ${entry.resolution.publications.join(', ')}` : ''}${entry.resolution.events.length ? `, Ereignisse ${entry.resolution.events.join(', ')}` : ''}.`);
      if (entry.supersededBy) lines.push(`- **Ersetzt durch:** \`${entry.supersededBy}\`.`);
      if (entry.reason) lines.push(`- **Verworfen:** ${entry.reason}`);
      lines.push('');
    }
  }
  return `${lines.join('\n')}\n`;
}
