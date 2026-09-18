/**
 * Das Exportpaket von BAYERN.RECHT (`/Content/Zip/<Kurzbezeichnung>`).
 *
 * Aufbau nach OpenDocument-Packaging-Konvention und an vier Instanzen belegt:
 *
 *   mimetype                     Klartext, Wert wechselt mit dem Paketinhalt
 *                                (`bayportalnorm+zip`, `bayportalvv+zip`, `pdf+zip`)
 *   META-INF/manifest.xml        Verzeichnis aller Nutzdateien mit Medientyp
 *   bayportalnorm/<id>.xml       Normdokument (DTD `byrecht-norm`)
 *   bayportalvv/<id>.xml         Verwaltungsvorschrift (DTD `byrecht-vv`)
 *   pdf/<…>.pdf                  Beilagen – aus dem XML **nicht** referenziert
 *   img/<…>.jpg|.gif             Abbildungen – aus dem XML über `graphic@FileRef` bzw. `a@href`
 *                                referenziert, im Manifest als `image/jpg` deklariert
 *
 * Fail-closed: Genau ein Manifesteintrag darf ein Normdokument sein, jeder Manifesteintrag muss im
 * Paket liegen, und jeder Paketeintrag außer `mimetype` und `META-INF/manifest.xml` muss im Manifest
 * stehen. Eine unbekannte Medienart oder eine Datei, die nur auf einer der beiden Seiten vorkommt,
 * bricht ab – sie würde sonst stillschweigend verloren gehen.
 *
 * Der ZIP-Leser ist bewusst klein und ohne Abhängigkeit: zentrales Verzeichnis lesen, lokale Köpfe
 * auswerten, `deflate` über `node:zlib` auspacken. Zip64 kommt in den Exporten nicht vor und wird
 * ausdrücklich abgelehnt statt falsch gelesen.
 */
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

import { ImportPipelineError } from '@landesrecht/importer-common/pipeline.ts';

import { attribute, childElements, readXmlDocument } from './xml.ts';

export const MIMETYPE_ENTRY = 'mimetype';
export const MANIFEST_ENTRY = 'META-INF/manifest.xml';

/** Medientypen des Manifests – belegt am Beispielkorpus (28 Pakete). */
export const NORM_MEDIA_TYPE = 'application/beck.bayportalnorm.text';
export const VV_MEDIA_TYPE = 'application/beck.bayportalvv.text';
export const PDF_MEDIA_TYPE = 'application/pdf';
/**
 * Das Portal deklariert Bildbeilagen als `image/jpg` – **nicht** als das standardkonforme
 * `image/jpeg` –, und zwar auch für Dateien mit Endung `.gif` (belegt an BayBauPAV, BayBoFiV,
 * BayNatSchWachtV, BayVSO, BayVwV267724, VVBayHO, BAY_791_3_150_U). Zugelassen ist genau der
 * vorkommende Wert; jeder andere bricht ab, und die Abweichung zwischen deklarierter Medienart und
 * Dateiendung wird gemeldet, statt sie glattzuziehen.
 */
export const IMAGE_MEDIA_TYPE = 'image/jpg';

/** Dateiendungen, die zu einer deklarierten Medienart passen. */
const EXPECTED_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  [NORM_MEDIA_TYPE]: ['.xml'],
  [VV_MEDIA_TYPE]: ['.xml'],
  [PDF_MEDIA_TYPE]: ['.pdf'],
  [IMAGE_MEDIA_TYPE]: ['.jpg', '.jpeg'],
};

export interface ManifestFileEntry {
  /** Pfad wie im Manifest notiert, mit führendem `/`. */
  fullPath: string;
  mediaType: string;
}

export interface PackageAttachment {
  /** Pfad im Paket, ohne führenden `/`. */
  path: string;
  /** Dateiname ohne Verzeichnis – so referenziert ihn `graphic@FileRef` bzw. `a@href`. */
  fileName: string;
  /** Medienart, wie das Manifest sie deklariert (unverändert, auch wenn sie nicht zur Endung passt). */
  mediaType: string;
  /** `pdf`: unverortete Beilage · `image`: Abbildung, aus dem XML über `graphic`/`a` referenziert. */
  kind: 'pdf' | 'image';
  byteLength: number;
  sha256: string;
  /**
   * Bildbeilagen: tatsächliche Medienart und Abmessungen aus den ersten Bytes. Das Manifest deklariert alle
   * Bilder als `image/jpg`, auch GIF und PNG; die Deklaration bleibt in `mediaType` unverändert (Provenienz).
   */
  image?: { mediaType: 'image/gif' | 'image/jpeg' | 'image/png'; width?: number; height?: number };
}

/** Medienart und Abmessungen eines Bildes aus seinen ersten Bytes (GIF, PNG, JPEG); `undefined` bei anderem Format. */
export function sniffImage(bytes: Uint8Array): PackageAttachment['image'] {
  const ascii = (start: number, length: number): string => String.fromCharCode(...bytes.subarray(start, start + length));
  if (bytes.length >= 10 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) {
    return { mediaType: 'image/gif', width: bytes[6]! | (bytes[7]! << 8), height: bytes[8]! | (bytes[9]! << 8) };
  }
  if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(1, 3) === 'PNG') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { mediaType: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    // SOFn-Marker suchen (außer DHT C4, JPG C8, DAC CC); Höhe und Breite stehen dahinter.
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1]!;
      const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { mediaType: 'image/jpeg', height: (bytes[offset + 5]! << 8) | bytes[offset + 6]!, width: (bytes[offset + 7]! << 8) | bytes[offset + 8]! };
      }
      if (marker === 0xd9 || marker === 0xda) break;
      offset += 2 + length;
    }
    return { mediaType: 'image/jpeg' };
  }
  return undefined;
}

export interface BayernRechtPackage {
  /** Inhalt der Datei `mimetype`. */
  mimetype: string;
  manifest: ManifestFileEntry[];
  /** Pfad des Normdokuments im Paket, ohne führenden `/`. */
  documentPath: string;
  documentMediaType: typeof NORM_MEDIA_TYPE | typeof VV_MEDIA_TYPE;
  /** Das Normdokument als Text (BOM bleibt erhalten; der XML-Leser entfernt sie). */
  xml: string;
  /** Beilagen des Pakets: PDF (im XML nicht referenziert) und Bilder (über `graphic`/`a` referenziert). */
  attachments: PackageAttachment[];
  /** Beobachtungen, die den Lauf nicht abbrechen (z. B. Medienart passt nicht zur Dateiendung). */
  warnings: string[];
}

interface ZipEntry {
  path: string;
  bytes: Uint8Array;
}

function fail(message: string): never {
  throw new ImportPipelineError('parse-source-format', message);
}

/**
 * Eine Datei aus einem Exportpaket (Pfad ohne führenden `/`), ohne das Paket als Ganzes zu deuten – für das
 * R2-Staging der Abbildungs-Assets. `undefined`, wenn der Pfad im Paket fehlt.
 */
export function readPackageFile(bytes: Uint8Array, path: string): Uint8Array | undefined {
  return readZipEntries(bytes).get(path);
}

function readZipEntries(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (offset: number): number => view.getUint32(offset, true);
  const u16 = (offset: number): number => view.getUint16(offset, true);

  // End of Central Directory: rückwärts suchen (Kommentar darf bis 65.535 Byte lang sein).
  let eocd = -1;
  const lowest = Math.max(0, bytes.length - 0xffff - 22);
  for (let offset = bytes.length - 22; offset >= lowest; offset -= 1) {
    if (u32(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) fail('Das Exportpaket ist kein ZIP-Archiv (kein End-of-Central-Directory gefunden)');

  const entryCount = u16(eocd + 10);
  const directorySize = u32(eocd + 12);
  const directoryOffset = u32(eocd + 16);
  if (directoryOffset === 0xffffffff || directorySize === 0xffffffff || entryCount === 0xffff) {
    fail('Zip64-Archive werden nicht gelesen; das Exportpaket wäre nur unvollständig auswertbar');
  }

  const entries: ZipEntry[] = [];
  let cursor = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.length || u32(cursor) !== 0x02014b50) fail(`Beschädigtes zentrales Verzeichnis am Eintrag ${index + 1}`);
    const method = u16(cursor + 10);
    const compressedSize = u32(cursor + 20);
    const uncompressedSize = u32(cursor + 24);
    const nameLength = u16(cursor + 28);
    const extraLength = u16(cursor + 30);
    const commentLength = u16(cursor + 32);
    const localOffset = u32(cursor + 42);
    const path = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;

    if (path.endsWith('/')) continue; // Verzeichniseintrag
    if (u32(localOffset) !== 0x04034b50) fail(`Beschädigter lokaler Dateikopf für ${path}`);
    const localNameLength = u16(localOffset + 26);
    const localExtraLength = u16(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);
    let content: Uint8Array;
    if (method === 0) content = raw;
    else if (method === 8) content = new Uint8Array(inflateRawSync(raw));
    else fail(`Unbekanntes Kompressionsverfahren ${method} für ${path}`);
    if (content.length !== uncompressedSize) fail(`${path}: entpackte Größe ${content.length} weicht vom Verzeichniseintrag ${uncompressedSize} ab`);
    entries.push({ path, bytes: content });
  }

  const files = new Map<string, Uint8Array>();
  for (const entry of entries) {
    if (files.has(entry.path)) fail(`Der Paketeintrag ${entry.path} kommt doppelt vor`);
    files.set(entry.path, entry.bytes);
  }
  return files;
}

/** Liest `META-INF/manifest.xml`. Der Manifest-Namensraum wird als Angabe hingenommen, nicht ausgewertet. */
export function readPackageManifest(manifestXml: string): ManifestFileEntry[] {
  const { root } = readXmlDocument(manifestXml);
  if (root.name !== 'manifest') fail(`Das Paketmanifest hat das Wurzelelement <${root.name}> statt <manifest>`);
  const entries = childElements(root, 'file-entry').map((entry) => {
    const fullPath = attribute(entry, 'full-path');
    const mediaType = attribute(entry, 'media-type');
    if (!fullPath) fail('Ein Manifesteintrag trägt kein Attribut full-path');
    if (!mediaType) fail(`Der Manifesteintrag ${fullPath} trägt kein Attribut media-type`);
    return { fullPath, mediaType };
  });
  const unknown = root.children.filter((node) => node.kind === 'element' && node.name !== 'file-entry');
  if (unknown.length > 0) fail(`Unbekanntes Element <${(unknown[0] as { name: string }).name}> im Paketmanifest`);
  if (entries.length === 0) fail('Das Paketmanifest nennt keine Datei');
  return entries;
}

/**
 * Öffnet ein Exportpaket. Wirft `ImportPipelineError`, sobald Manifest und Paketinhalt auseinanderfallen
 * oder eine Medienart unbekannt ist – nichts wird stillschweigend übergangen.
 */
export function readBayernRechtPackage(bytes: Uint8Array): BayernRechtPackage {
  const files = readZipEntries(bytes);
  // `ignoreBOM` erhält die BOM: Der Paketleser normalisiert nichts, das der XML-Leser entfernt.
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

  const mimetypeBytes = files.get(MIMETYPE_ENTRY);
  if (!mimetypeBytes) fail(`Das Exportpaket enthält keinen Eintrag ${MIMETYPE_ENTRY}`);
  const mimetype = decoder.decode(mimetypeBytes).trim();
  if (!/^[a-z0-9][a-z0-9.+-]*$/u.test(mimetype)) fail(`Unerwartete Paketkennung ${JSON.stringify(mimetype)} in ${MIMETYPE_ENTRY}`);

  const manifestBytes = files.get(MANIFEST_ENTRY);
  if (!manifestBytes) fail(`Das Exportpaket enthält kein ${MANIFEST_ENTRY}`);
  const manifest = readPackageManifest(decoder.decode(manifestBytes));

  const documents = manifest.filter((entry) => entry.mediaType === NORM_MEDIA_TYPE || entry.mediaType === VV_MEDIA_TYPE);
  if (documents.length !== 1) fail(`Das Paketmanifest nennt ${documents.length} Normdokumente; genau eines wird erwartet`);
  const document = documents[0]!;

  const attachments: PackageAttachment[] = [];
  const warnings: string[] = [];
  const named = new Set<string>([MIMETYPE_ENTRY, MANIFEST_ENTRY]);
  for (const entry of manifest) {
    const path = entry.fullPath.replace(/^\//u, '');
    named.add(path);
    const content = files.get(path);
    if (!content) fail(`Das Paketmanifest nennt ${entry.fullPath}, die Datei fehlt im Paket`);

    const dot = path.lastIndexOf('.');
    const extension = dot < 0 ? '' : path.slice(dot).toLowerCase();
    const expected = EXPECTED_EXTENSIONS[entry.mediaType];
    if (expected && !expected.includes(extension)) {
      warnings.push(`${entry.fullPath}: Das Manifest deklariert ${entry.mediaType}, die Dateiendung ist ${extension || '(keine)'}; die deklarierte Medienart wird unverändert übernommen`);
    }

    if (entry.mediaType === PDF_MEDIA_TYPE || entry.mediaType === IMAGE_MEDIA_TYPE) {
      const slash = path.lastIndexOf('/');
      attachments.push({
        path,
        fileName: slash < 0 ? path : path.slice(slash + 1),
        mediaType: entry.mediaType,
        kind: entry.mediaType === PDF_MEDIA_TYPE ? 'pdf' : 'image',
        byteLength: content.length,
        sha256: createHash('sha256').update(content).digest('hex'),
        ...(entry.mediaType === IMAGE_MEDIA_TYPE && sniffImage(content) ? { image: sniffImage(content)! } : {}),
      });
    } else if (entry !== document) {
      fail(`Unbekannte Medienart ${entry.mediaType} für ${entry.fullPath} im Paketmanifest`);
    }
  }

  const orphans = [...files.keys()].filter((path) => !named.has(path)).sort();
  if (orphans.length > 0) fail(`Paketeinträge ohne Manifesteintrag: ${orphans.join(', ')}`);

  const documentPath = document.fullPath.replace(/^\//u, '');
  const xmlBytes = files.get(documentPath)!;
  let xml: string;
  try {
    xml = decoder.decode(xmlBytes);
  } catch {
    return fail(`${documentPath} ist nicht UTF-8-kodiert`);
  }

  attachments.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return {
    mimetype,
    manifest,
    documentPath,
    documentMediaType: document.mediaType as typeof NORM_MEDIA_TYPE | typeof VV_MEDIA_TYPE,
    xml,
    attachments,
    warnings,
  };
}
