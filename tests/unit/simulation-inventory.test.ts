/**
 * Inventar der Sim-Rechtsquellensammlung: Hash-Dubletten, Textextraktion ohne OCR, Zip-Abgleich, Vorsortierung.
 * Das Inventar ist die Grundlage der Evidenzprüfung und muss aus dem Archiv reproduzierbar sein (Gate G9).
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterAll, describe, expect, it } from 'vitest';

import { detectFacts, findDates } from '@landesrecht/importer-simulation/inventory/detect.ts';
import { extractPdf, extractPlainText, mediaTypeFor } from '@landesrecht/importer-simulation/inventory/extract.ts';
import { scanArchive } from '@landesrecht/importer-simulation/inventory/scan.ts';
import { listZipEntries } from '@landesrecht/importer-simulation/inventory/zip.ts';
import { canonicalJson, sha256 } from '@landesrecht/importer-simulation/engine/hash.ts';

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'landesrecht-simulation-inventory-'));
  roots.push(root);
  return root;
}

afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});

/** Minimales PDF mit einer Seite und einer Textebene (Helvetica), ohne Fremdwerkzeug erzeugt. */
function tinyPdf(text: string): Uint8Array {
  const content = `BT /F1 12 Tf 50 700 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

async function hasPdftotext(): Promise<boolean> {
  try {
    await execFileAsync('pdftotext', ['-v']);
    return true;
  } catch {
    return false;
  }
}

describe('Vorsortierung aus dem Textauszug', () => {
  it('liest deutsche Datumsschreibungen in Reihenfolge des Auftretens', () => {
    expect(findDates('vom 17. Mai 2026, ausgefertigt 12.05.2026, 2026-05-18').map((date) => date.iso)).toEqual(['2026-05-17', '2026-05-12', '2026-05-18']);
    expect(findDates('am 31.02.2026').map((date) => date.iso)).toEqual([]);
  });

  it('erkennt ein Verkündungsblatt mit Ausgabevermerk, Nummer und Ort – ohne Dateinamen', () => {
    const facts = detectFacts('Gesetzes und Verordnungsblatt\nfür das Land Westdeutschland\n\n2026    Ausgegeben zu Mainz am 17. Mai 2026    Nr. 2\n\nInhalt\nGesetz zur Einführung eines Landessolargesetzes 3\n', 'irrelevant.bin');
    expect(facts).toMatchObject({ documentType: 'gazette', seriesKind: 'gvbl', place: 'Mainz', issueDate: '2026-05-17', number: '2', year: 2026 });
    expect(facts.title).toContain('Gesetzes und Verordnungsblatt');
  });

  it('erkennt Drucksachen, Verkündungsmitteilungen, Einzelakte und Pressemitteilungen', () => {
    expect(detectFacts('Landtag Niedersachsen-Holstein   Drucksache 05/06\nV. Wahlperiode   01.08.2025\nGesetzesentwurf der Landesregierung\n', 'x')).toMatchObject({ documentType: 'legislative-document', number: '05/06', legislativePeriod: 'V' });
    expect(detectFacts('17. September 2024:\nKraft meines Amtes verkünde ich die Drucksachen 02/19 und 02/20.\nGezeichnet:\nHorst Thorsten Röttgen, MdL\n', 'x')).toMatchObject({ documentType: 'promulgation-notice' });
    expect(detectFacts('17. September 2024:\nKraft meines Amtes verkünde ich die Drucksachen 02/19 und 02/20.', 'x').references).toContainEqual({ kind: 'drucksache', value: '02/19 und 02/20' });
    const act = detectFacts('Verordnung zur Anordnung von Trauerbeflaggung\nvom 29. Juni 2024\n§ 1 Zweck\n(1) Diese Verordnung dient …\n§ 4 Inkrafttreten\n(1) Diese Verordnung tritt am Tage nach ihrer Verkündung in Kraft.\nAusgefertigt in München, 29. Juni 2024\nGez. Erwin Baumüller', 'x');
    expect(act).toMatchObject({ documentType: 'standalone-official-act', documentDate: '2024-06-29' });
    expect(act.commencement).toMatch(/tritt am Tage nach ihrer Verkündung in Kraft/u);
    expect(detectFacts('Staatsministerium für Digitales\nPressemitteilung Nr. 12\nDie Ministerin erklärt …', 'x').documentType).toBe('press-release');
    expect(detectFacts('', 'leer.pdf').documentType).toBe('unknown');
  });
});

describe('Textextraktion und Medienart', () => {
  it('bestimmt die Medienart aus dem Inhalt, nicht aus der Endung', () => {
    expect(mediaTypeFor('x.txt', new TextEncoder().encode('%PDF-1.4\n'))).toBe('application/pdf');
    expect(mediaTypeFor('x.pdf', new TextEncoder().encode('kein pdf'))).toBe('application/octet-stream');
    expect(mediaTypeFor('x.txt', new TextEncoder().encode('hallo'))).toBe('text/plain');
  });

  it('liest Text unverändert (CRLF → LF) und stuft Textdateien als nicht zutreffend ein', async () => {
    const extracted = await extractPlainText(new TextEncoder().encode('a\r\nb'));
    expect(extracted).toMatchObject({ raw: 'a\nb', textLayer: 'not-applicable' });
  });

  it('extrahiert eine PDF-Textebene ohne OCR und erkennt fehlende Textebenen', async () => {
    if (!(await hasPdftotext())) return;
    const root = await tempRoot();
    const withText = join(root, 'text.pdf');
    await writeFile(withText, tinyPdf('Verordnung ueber die Pruefung'));
    const extracted = await extractPdf(withText);
    expect(extracted.pageCount).toBe(1);
    expect(extracted.raw).toContain('Verordnung ueber die Pruefung');
    // Eine Seite mit 29 Zeichen liegt unter der Schwelle von 150 Zeichen je Seite: als Scan/Deckblatt gekennzeichnet.
    expect(extracted.textLayer).toBe('sparse');
  });
});

describe('Archivscan', () => {
  it('führt nur hashidentische Dateien zusammen, kopiert Originale in den Cache und gleicht das Zip ab', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'imports', 'west'), { recursive: true });
    await mkdir(join(root, 'imports', 'nsh'), { recursive: true });
    await mkdir(join(root, 'imports', '__MACOSX', 'west'), { recursive: true });
    const same = 'Verordnung über Kühlräume\nvom 3. März 2024\n§ 1 Geltung\n(1) Diese Verordnung gilt.';
    await writeFile(join(root, 'imports', 'west', 'Verordnung Kühlräume.txt'), same);
    await writeFile(join(root, 'imports', 'west', 'Verordnung Kühlräume (1).txt'), same);
    await writeFile(join(root, 'imports', 'west', 'Verordnung Kühlräume (2).txt'), `${same} Ergänzt.`);
    await writeFile(join(root, 'imports', 'nsh', 'mitteilung.txt'), '30. März 2024:\nKraft meines Amtes verkünde ich die Drucksache 01/05.');
    await writeFile(join(root, 'imports', 'west', '.DS_Store'), 'x');
    await writeFile(join(root, 'imports', '__MACOSX', 'west', '._Verordnung Kühlräume.txt'), 'x');
    await execFileAsync('zip', ['-q', '-r', join(root, 'imports', 'Archiv.zip'), 'west', 'nsh'], { cwd: join(root, 'imports') });

    const inventory = await scanArchive(root);
    expect(inventory.totals).toMatchObject({ files: 4, sources: 3, duplicateFiles: 1, byJurisdiction: { nsh: 1, west: 2 } });
    const merged = inventory.sources.find((source) => source.paths.length === 2)!;
    expect(merged.paths).toEqual(['west/Verordnung Kühlräume (1).txt', 'west/Verordnung Kühlräume.txt']);
    expect(inventory.sources.filter((source) => source.fileName.startsWith('Verordnung'))).toHaveLength(2);
    expect(inventory.container).toMatchObject({ present: true, entries: 4, onlyInContainer: [], onlyInFolder: [] });
    const archived = await readFile(join(root, '.cache/simulation/archive', `${merged.sha256}.txt`), 'utf8');
    expect(archived).toBe(same);
    expect(merged.detected.documentType).toBe('standalone-official-act');
    // Original unverändert.
    expect(await readFile(join(root, 'imports', 'west', 'Verordnung Kühlräume.txt'), 'utf8')).toBe(same);
  });

  it('liest Zip-Einträge NFC-normalisiert aus dem zentralen Verzeichnis', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'a'), { recursive: true });
    await writeFile(join(root, 'a', 'Änderung.txt'), 'x');
    await execFileAsync('zip', ['-q', '-r', join(root, 'z.zip'), 'a'], { cwd: root });
    const entries = await listZipEntries(join(root, 'z.zip'));
    expect(entries.filter((entry) => !entry.endsWith('/'))).toEqual(['a/Änderung.txt'.normalize('NFC')]);
  });
});

describe('Kanonische Prüfsumme (OstRecht-kompatibel)', () => {
  it('ist unabhängig von der Schlüsselreihenfolge und unterscheidet Strings von Objekten', () => {
    expect(sha256({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(sha256({ a: [{ c: 3, d: 2 }], b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toEqual({ a: 2, b: 1 });
    expect(sha256('x')).not.toBe(sha256({ x: 'x' }));
    expect(sha256({ title: 'T', body: [] })).toMatch(/^[a-f0-9]{64}$/u);
  });
});
