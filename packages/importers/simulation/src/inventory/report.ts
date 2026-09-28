/**
 * Bericht `docs/SIM_SOURCE_INVENTORY.md` aus dem Inventar: Kennzahlen, Container-Abgleich, je Land eine Tabelle
 * aller Quellen mit Erkennungsbefund. Der Bericht behauptet nichts über Geltung – er dokumentiert, was im
 * Archiv liegt und was die Vorsortierung erkannt hat.
 */
import { JURISDICTIONS } from '@landesrecht/legal-core/config/jurisdictions.ts';

import type { InventorySource, SourceInventory } from './scan.ts';

const escape = (value: string | undefined): string => (value ?? '–').replace(/\|/gu, '\\|').replace(/\n/gu, ' ');

function sourceRow(source: InventorySource): string {
  const facts = source.detected;
  const number = facts.number ? `${facts.seriesKind === 'drucksache' ? 'Drs. ' : 'Nr. '}${facts.number}` : '–';
  return `| ${escape(source.paths[0])}${source.paths.length > 1 ? ` (+${source.paths.length - 1} Dublette${source.paths.length > 2 ? 'n' : ''})` : ''} | \`${source.sha256.slice(0, 12)}\` | ${source.mediaType.replace('application/', '').replace('vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx')} | ${source.pageCount ?? '–'} | ${source.textLayer} | ${escape(facts.title?.slice(0, 90))} | ${facts.documentDate ?? '–'} | ${facts.issueDate ?? '–'} | ${escape(facts.authority?.slice(0, 50))} | ${escape(facts.series?.slice(0, 50))} | ${number} | ${facts.documentType} |`;
}

export function renderInventoryReport(inventory: SourceInventory): string {
  const lines: string[] = [];
  lines.push('# Inventar der Sim-Rechtsquellensammlung');
  lines.push('');
  lines.push(`Erzeugt von \`npm run import:simulation:inventory -- --write\` am ${inventory.scannedAt} aus \`${inventory.archiveDir}/\` (Originalarchiv unverändert; Kopien und Textauszüge unter \`.cache/simulation/\`, maschinenlesbar \`data/simulation/source-inventory.json\`).`);
  lines.push('');
  lines.push('Die Tabellen zeigen die **Vorsortierung** aus Textauszug und Dokumentkopf. Sie ist keine Rechtsentscheidung: Welche Datei ein verkündeter Rechtsakt ist, entscheidet die Evidenzprüfung je Land (`data/simulation/<land>/sources.json`). Kein Befund stammt allein aus dem Dateinamen. Dubletten sind nur hashidentische Dateien; ähnlich benannte Dateien bleiben getrennt.');
  lines.push('');
  lines.push('## Kennzahlen');
  lines.push('');
  lines.push(`- Dateien im Archiv: **${inventory.totals.files}**, davon hashidentische Dubletten ${inventory.totals.duplicateFiles} → **${inventory.totals.sources} Quellen**`);
  lines.push(`- Je Land: ${Object.entries(inventory.totals.byJurisdiction).map(([jurisdiction, total]) => `${JURISDICTIONS[jurisdiction as keyof typeof JURISDICTIONS]?.shortName ?? jurisdiction} ${total}`).join(' · ')}`);
  lines.push(`- Medienart: ${Object.entries(inventory.totals.byMediaType).map(([type, total]) => `${type} ${total}`).join(' · ')}`);
  lines.push(`- Textebene: ${Object.entries(inventory.totals.byTextLayer).map(([layer, total]) => `${layer} ${total}`).join(' · ')} (\`none\`/\`sparse\` = Scan oder Deckblatt, keine OCR)`);
  lines.push(`- Vorsortierte Dokumentart: ${Object.entries(inventory.totals.byDocumentType).map(([type, total]) => `${type} ${total}`).join(' · ')}`);
  lines.push(`- Werkzeuge: ${Object.keys(inventory.tools).join('; ')}`);
  lines.push('');
  lines.push('## Container-Abgleich');
  lines.push('');
  if (!inventory.container.present) lines.push(`\`${inventory.container.file}\` liegt nicht vor.`);
  else {
    lines.push(`\`${inventory.container.file}\`: ${inventory.container.entries} Einträge (ohne \`__MACOSX\`/\`.DS_Store\`). Nur im Zip: ${inventory.container.onlyInContainer?.length ? inventory.container.onlyInContainer.map((name) => `\`${name}\``).join(', ') : 'keine'}. Nur im Ordner: ${inventory.container.onlyInFolder?.length ? inventory.container.onlyInFolder.map((name) => `\`${name}\``).join(', ') : 'keine'}. Der Zip-Inhalt wird nicht gesondert inventarisiert.`);
  }
  lines.push('');
  for (const jurisdiction of ['west', 'nsh', 'baywue'] as const) {
    const sources = inventory.sources.filter((source) => source.jurisdictionCandidate === jurisdiction);
    if (sources.length === 0) continue;
    lines.push(`## ${JURISDICTIONS[jurisdiction].name} (${sources.length} Quellen)`);
    lines.push('');
    lines.push('| Datei | SHA-256 | Typ | S. | Textebene | Titel (erkannt) | Dokumentdatum | Ausgabedatum | Organ | Blatt/Serie | Nummer | Dokumentart (vorsortiert) |');
    lines.push('| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const source of sources) lines.push(sourceRow(source));
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
