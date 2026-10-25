import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { extractionToolIdentity } from '@landesrecht/importer-simulation/inventory/extract.ts';
import type { SourceInventory } from '@landesrecht/importer-simulation/inventory/scan.ts';
import { compareInventoryReproducibility } from '../../scripts/lib/simulation-gates.ts';

const digest = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
function inventory(version = '26.07.0'): SourceInventory {
  const tool = `pdftotext version ${version}`;
  return {
    schemaVersion: 'landesrecht-simulation-source-inventory/1', archiveDir: 'imports', scannedAt: '2026-09-28', tools: { [tool]: tool },
    totals: { files: 1, sources: 1, duplicateFiles: 0, byJurisdiction: { west: 1 }, byMediaType: { 'application/pdf': 1 }, byTextLayer: { text: 1 }, byDocumentType: { gazette: 1 } },
    container: { file: 'imports/Archiv.zip', present: false },
    sources: [{ sha256: 'a'.repeat(64), paths: ['west/a.pdf'], fileName: 'a.pdf', jurisdictionCandidate: 'west', mediaType: 'application/pdf', byteLength: 2000, pageCount: 2, textLayer: 'text', charactersPerPage: 300,
      extraction: { tool, textPath: '.cache/a.txt', layoutPath: '.cache/a.layout.txt', textSha256: digest('alter Text'), layoutSha256: digest('alter  Text') },
      pdfInfo: { title: 'Verkündungsblatt', producer: 'PDF', creator: 'Test', creationDate: '2026-01-01' },
      detected: { documentType: 'gazette', title: 'Verkündungsblatt', number: '1', year: 2026, issueDate: '2026-01-01', dates: [], signals: [], references: [], repealMentions: [] },
    }],
  };
}

describe('G9: Werkzeugversion und fachliche Reproduzierbarkeit', () => {
  it('trennt ausschließlich erkannte Versionsangaben vom Werkzeugnamen', () => {
    expect(extractionToolIdentity('pdftotext version 26.10.0')).toEqual({ name: 'pdftotext', version: '26.10.0' });
    for (const tool of ['utf-8', 'unzip word/document.xml', 'pdftotext (Version unbekannt)', 'anderes Werkzeug version 26.10.0']) expect(extractionToolIdentity(tool)).toEqual({ name: tool });
  });

  it('akzeptiert eine andere pdftotext-Version bei identischen Fachfeldern und Extraktionshashes mit Hinweis', () => {
    const current = inventory('26.10.0'); current.scannedAt = '2026-10-25';
    const report = compareInventoryReproducibility(inventory(), current);
    expect(report.problems).toEqual([]);
    expect(report.notes).toContainEqual(expect.stringContaining('Werkzeugversion pdftotext: 26.07.0 → 26.10.0'));
    expect(report.notes).toContain('2 gespeicherte Extraktionsprüfsumme(n) geprüft');
  });

  it.each(['textSha256', 'layoutSha256'] as const)('erkennt geänderte Extraktionsbytes über %s trotz identischer Länge und unveränderter Dokumentdaten', (key) => {
    const current = inventory('26.10.0');
    current.sources[0]!.extraction[key] = digest(key === 'textSha256' ? 'neuer Text' : 'alter Text ');
    expect(compareInventoryReproducibility(inventory(), current).problems).toContainEqual(expect.stringContaining(`Extraktionsprüfsumme ${key} weicht ab`));
  });

  it('lehnt fehlende oder ungültige gespeicherte/neu berechnete Prüfsummen ab', () => {
    for (const key of ['textSha256', 'layoutSha256'] as const) {
      const current = inventory('26.10.0'); delete current.sources[0]!.extraction[key];
      expect(compareInventoryReproducibility(inventory(), current).problems.length).toBeGreaterThan(0);
      current.sources[0]!.extraction[key] = 'ungültig';
      expect(compareInventoryReproducibility(inventory(), current).problems).toContainEqual(expect.stringContaining('ungültige Extraktionsprüfsumme'));
    }
  });

  const mutations: Array<[string, (value: SourceInventory) => void]> = [
    ['Quelldatei', (v) => { v.sources[0]!.paths[0] = 'west/andere.pdf'; }],
    ['Quellhash', (v) => { v.sources[0]!.sha256 = 'b'.repeat(64); }],
    ['Größe', (v) => { v.sources[0]!.byteLength++; }],
    ['Seiten', (v) => { v.sources[0]!.pageCount = 3; }],
    ['Textebene', (v) => { v.sources[0]!.textLayer = 'sparse'; }],
    ['Zeichenzahl', (v) => { v.sources[0]!.charactersPerPage = 301; }],
    ['Publikationsidentität', (v) => { v.sources[0]!.detected.number = '2'; }],
    ['Dokumentdatum', (v) => { v.sources[0]!.detected.issueDate = '2026-01-02'; }],
    ['PDF-Metadaten', (v) => { v.sources[0]!.pdfInfo!.producer = 'anderer Producer'; }],
    ['Extraktionspfad', (v) => { v.sources[0]!.extraction.textPath = '.cache/anderer.txt'; }],
    ['Werkzeug', (v) => { v.sources[0]!.extraction.tool = 'anderer Extraktor'; }],
    ['Unbekannte Werkzeugversion', (v) => { v.sources[0]!.extraction.tool = 'pdftotext (Version unbekannt)'; }],
    ['Werkzeugregister', (v) => { v.tools['pdftotext version 26.11.0'] = 'anderes Werkzeug'; }],
    ['Summen', (v) => { v.totals.files++; }],
    ['Archivstruktur', (v) => { v.container.present = true; }],
  ];
  it.each(mutations)('bleibt bei geänderten relevanten Daten rot: %s', (_label, mutate) => {
    const current = inventory('26.10.0'); mutate(current);
    expect(compareInventoryReproducibility(inventory(), current).problems.length).toBeGreaterThan(0);
  });

  it('benennt bei Altinventaren ohne Hashes die begrenzte Beweiskraft, ohne Hashes rückwirkend zu behaupten', () => {
    const stored = inventory();
    delete stored.sources[0]!.extraction.textSha256; delete stored.sources[0]!.extraction.layoutSha256;
    const current = inventory('26.10.0');
    const report = compareInventoryReproducibility(stored, current);
    expect(report.problems).toEqual([]);
    expect(report.notes).toContainEqual(expect.stringContaining('keine nachgewiesene Textbytegleichheit'));
    expect(report.notes).toContain('0 gespeicherte Extraktionsprüfsumme(n) geprüft');
    current.sources[0]!.pageCount = 3;
    expect(compareInventoryReproducibility(stored, current).problems.length).toBeGreaterThan(0);
  });
});
