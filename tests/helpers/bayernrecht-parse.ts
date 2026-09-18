/**
 * Prüfhilfen für den BAYERN.RECHT-Parser.
 *
 * Die Fixtures unter `tests/fixtures/bayernrecht/` sind **echte, gekürzte Ausschnitte** aus den vier
 * im Cache abgelegten Exporten (`BayAbmG`, `BayVerf`, `BayKVzKG`, `BayVwV312180`) – einschließlich
 * BOM, DOCTYPE mit Netz-URL, Leerraum und der Eigenheiten, um die es geht. Es ist kein erfundenes
 * XML darunter; die einzige Bearbeitung ist das Weglassen ganzer Zweige und das Kürzen langer
 * Tabellenkörper auf wenige Zeilen.
 *
 * `buildZipArchive` baut aus denselben Fixtures ein echtes Exportpaket (ZIP, Speicherverfahren),
 * damit der Paketleser gegen reale Manifeste und reale Nutzdaten läuft.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ArchivedSource } from '@landesrecht/importer-common/pipeline.ts';

export const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'bayernrecht');

export const FIXTURES = {
  abmarkungsgesetz: 'byrecht-norm-abmarkungsgesetz.xml',
  verfassung: 'byrecht-norm-verfassung.xml',
  kostenverzeichnis: 'byrecht-norm-kostenverzeichnis.xml',
  redaktionsrichtlinien: 'byrecht-vv-redaktionsrichtlinien.xml',
  beihilfeverordnung: 'byrecht-norm-beihilfeverordnung.xml',
  haushaltsvorschriften: 'byrecht-norm-haushaltsvorschriften.xml',
  bodenfischerei: 'byrecht-norm-bodenfischerei.xml',
  radverkehrsgesetz: 'byrecht-norm-radverkehrsgesetz.xml',
  schulordnung: 'byrecht-norm-schulordnung.xml',
  manifestAbmarkungsgesetz: 'manifest-abmarkungsgesetz.xml',
  manifestKostenverzeichnis: 'manifest-kostenverzeichnis.xml',
  manifestVv: 'manifest-vv.xml',
  manifestBodenfischerei: 'manifest-bodenfischerei.xml',
  manifestNaturschutzgebiet: 'manifest-naturschutzgebiet.xml',
} as const;

export function fixture(name: keyof typeof FIXTURES): string {
  return readFileSync(join(FIXTURE_DIR, FIXTURES[name]), 'utf8');
}

export function fixtureBytes(name: keyof typeof FIXTURES): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURE_DIR, FIXTURES[name])));
}

/** Archivierte Rohquelle, wie sie die Pipeline dem Parser reicht. */
export function archivedSource(overrides: Partial<ArchivedSource> = {}): ArchivedSource {
  return {
    portal: 'bayernrecht',
    url: 'https://www.gesetze-bayern.de/Content/Zip/BayAbmG',
    retrievedAt: '2026-09-17T09:52:00.000Z',
    mediaType: 'application/zip',
    sha256: 'a'.repeat(64),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ ZIP-Schreiber (Speicherverfahren) */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipInput {
  path: string;
  content: Uint8Array | string;
}

/** Minimales ZIP ohne Kompression – genügt dem Paketleser und bleibt im Test nachvollziehbar. */
export function buildZipArchive(entries: readonly ZipInput[]): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const data = typeof entry.content === 'string' ? encoder.encode(entry.content) : entry.content;
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 0, true); // gespeichert
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const directorySize = centrals.reduce((sum, entry) => sum + entry.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, directorySize, true);
  eocdView.setUint32(16, offset, true);

  const total = offset + directorySize + eocd.length;
  const archive = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...locals, ...centrals, eocd]) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  return archive;
}

/** Exportpaket einer Verwaltungsvorschrift mit den beiden echten PDF-Beilagen (Inhalt ersetzt). */
export function vvPackage(): Uint8Array {
  return buildZipArchive([
    { path: 'mimetype', content: 'bayportalvv+zip' },
    { path: 'META-INF/manifest.xml', content: fixture('manifestVv') },
    { path: 'bayportalvv/BayVwV312180.xml', content: fixtureBytes('redaktionsrichtlinien') },
    { path: 'pdf/BayVwV312180_BayVwV312180-A1-N1.pdf', content: '%PDF-1.4 Beilage 1' },
    { path: 'pdf/BayVwV312180_BayVV103-S-064-KF-005-Anhang-001.pdf', content: '%PDF-1.4 Beilage 2' },
  ]);
}

/**
 * Exportpaket mit Bildbeilagen: Das Manifest von BayBoFiV deklariert `image/jpg` für Dateien mit
 * Endung `.gif` – die Abweichung, die der Paketleser melden soll. Der Bildinhalt ist ersetzt.
 */
export function imagePackage(): Uint8Array {
  const manifest = fixture('manifestBodenfischerei');
  const images = [...manifest.matchAll(/full-path="\/(img\/[^"]+)"/gu)].map((match) => match[1]!);
  return buildZipArchive([
    { path: 'mimetype', content: 'bayportalnorm+zip' },
    { path: 'META-INF/manifest.xml', content: manifest },
    { path: 'bayportalnorm/BayBoFiV.xml', content: fixtureBytes('bodenfischerei') },
    ...images.map((path) => ({ path, content: gifBytes(40, 30, path) })),
  ]);
}

/** Kleinste GIF-Kopfzeile (Signatur, Breite, Höhe) plus Kennung, damit jede Datei einen eigenen SHA-256 hat. */
export function gifBytes(width: number, height: number, tag: string): Uint8Array {
  const tail = new TextEncoder().encode(tag);
  const bytes = new Uint8Array(10 + tail.length);
  bytes.set(new TextEncoder().encode('GIF89a'), 0);
  bytes.set([width & 0xff, width >> 8, height & 0xff, height >> 8], 6);
  bytes.set(tail, 10);
  return bytes;
}

/** Exportpaket eines Gesetzes ohne Beilagen. */
export function normPackage(): Uint8Array {
  return buildZipArchive([
    { path: 'mimetype', content: 'bayportalnorm+zip' },
    { path: 'META-INF/manifest.xml', content: fixture('manifestAbmarkungsgesetz') },
    { path: 'bayportalnorm/BayAbmG.xml', content: fixtureBytes('abmarkungsgesetz') },
  ]);
}

/** Alle Blöcke eines Normkörpers in Dokumentreihenfolge. */
export function flatten<T extends { children?: T[] }>(blocks: readonly T[]): T[] {
  const output: T[] = [];
  const walk = (block: T): void => {
    output.push(block);
    for (const child of block.children ?? []) walk(child);
  };
  for (const block of blocks) walk(block);
  return output;
}
