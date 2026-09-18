/**
 * Amtliche GVBl.-Ausgaben als PDF – **nur Textlayer, nie OCR** – als Beleg für das Inkrafttreten einer
 * vorangehenden Änderung aus Jahrgängen, die die Verkündungsplattform nicht als HTML führt (etwa GVBl. 2006).
 *
 * Verwendet wird ein PDF nur, wenn
 *
 * 1. seine SHA-256 der von der Plattform im Ausgabenverzeichnis veröffentlichten Prüfsumme entspricht,
 * 2. es einen Textlayer hat und kein Scan ist (`inspectPdf` des West-Adapters, nur gelesen), nicht verschlüsselt,
 * 3. die Schriften eine bekannte Kodierung tragen (MacRoman, WinAnsi, Differences mit bekannten Glyphennamen)
 *    – was nicht sicher dekodierbar ist, gilt als nicht lesbar.
 *
 * Aus dem Textlayer wird **nur** die Inkrafttretensvorschrift gelesen, nie ein Änderungsbefehl, und nur unter
 * strengen Grenzen, die ohne Layoutdeutung auskommen (`pdfPageCommencement`): Die Seiten von der Anfangsseite der
 * Verkündung bis zu ihrer Unterschrift tragen Seitenzahl und Kopfzeile, genau einen Titelzusatz (ihren) und genau eine
 * Unterschrift (ihre, mit dem Ausfertigungsdatum) – dann gehört nichts auf ihnen zu einer anderen Verkündung – und
 * **genau eine** Inkrafttretensregel, eine Grundregel mit Kalenderdatum. Alles andere bleibt Review.
 */
import { inflateSync } from 'node:zlib';

import { inspectPdf } from '@landesrecht/importer-recht-nrw/common/pdf.ts';

import { parseLongGermanDate } from '../events/resolve.ts';
import type { GazettePage } from './pages.ts';
import { longGermanDate } from './pages.ts';
import { readCached } from './source.ts';

const latin1 = (bytes: Uint8Array): string => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1');

interface PdfObject {
  body: string;
  stream?: Uint8Array;
}

function inflate(raw: Uint8Array): Uint8Array | undefined {
  for (const candidate of [raw, raw.subarray(0, Math.max(0, raw.length - 1)), raw.subarray(0, Math.max(0, raw.length - 2))]) {
    try {
      return new Uint8Array(inflateSync(candidate));
    } catch {
      // Zeilenende vor `endstream` gehört nicht zum Strom: kürzer versuchen.
    }
  }
  return undefined;
}

/**
 * Objekte `n g obj … endobj` einer PDF, auch in Objektströmen (`/Type /ObjStm`). Ströme werden über ihre direkte
 * `/Length` begrenzt (ein Strom kann das Wort „endobj“ enthalten); bei mehrfach definierten Objekten (inkrementelle
 * Aktualisierung) gilt das letzte.
 */
function objects(bytes: Uint8Array): Map<number, PdfObject> {
  const text = latin1(bytes);
  const found = new Map<number, PdfObject>();
  const header = /(\d+)\s+\d+\s+obj\b/gu;
  let match: RegExpExecArray | null;
  while ((match = header.exec(text))) {
    const bodyStart = match.index + match[0].length;
    const streamAt = text.indexOf('stream', bodyStart);
    const endAt = text.indexOf('endobj', bodyStart);
    if (endAt < 0) break;
    if (streamAt < 0 || streamAt > endAt && !/\/Length/u.test(text.slice(bodyStart, streamAt))) {
      found.set(Number(match[1]), { body: text.slice(bodyStart, endAt) });
      header.lastIndex = endAt;
      continue;
    }
    const dictionary = text.slice(bodyStart, streamAt);
    if (/endobj/u.test(dictionary)) {
      found.set(Number(match[1]), { body: text.slice(bodyStart, endAt) });
      header.lastIndex = endAt;
      continue;
    }
    const dataStart = streamAt + 'stream'.length + (text[streamAt + 6] === '\r' && text[streamAt + 7] === '\n' ? 2 : 1);
    const length = /\/Length\s+(\d+)(?!\s+\d+\s+R)/u.exec(dictionary);
    const dataEnd = length ? dataStart + Number(length[1]) : text.indexOf('endstream', dataStart);
    const raw = bytes.subarray(dataStart, dataEnd);
    const stream = /\/Filter\s*\/FlateDecode/u.test(dictionary) ? inflate(raw) : /\/Filter/u.test(dictionary) ? undefined : raw;
    found.set(Number(match[1]), { body: dictionary, ...(stream ? { stream } : {}) });
    const close = text.indexOf('endobj', dataEnd);
    header.lastIndex = close < 0 ? dataEnd : close;
  }
  // Objektströme: `/N` Paare (Nummer, Versatz) ab `/First`; nur Objekte, die nicht direkt stehen.
  for (const object of [...found.values()]) {
    if (!/\/Type\s*\/ObjStm/u.test(object.body) || !object.stream) continue;
    const count = Number(/\/N\s+(\d+)/u.exec(object.body)?.[1] ?? 0);
    const first = Number(/\/First\s+(\d+)/u.exec(object.body)?.[1] ?? 0);
    const content = latin1(object.stream);
    const numbers = content.slice(0, first).trim().split(/\s+/u).map(Number);
    for (let index = 0; index < count; index += 1) {
      const id = numbers[index * 2]!;
      const offset = first + numbers[index * 2 + 1]!;
      const next = index + 1 < count ? first + numbers[index * 2 + 3]! : content.length;
      if (!found.has(id)) found.set(id, { body: content.slice(offset, next) });
    }
  }
  return found;
}

const refs = (value: string): number[] => [...value.matchAll(/(\d+)\s+0\s+R/gu)].map((match) => Number(match[1]));

/** Wert eines Schlüssels im Wörterbuch (Referenz, Name, Array oder inneres Wörterbuch). */
function entry(dictionary: string, key: string): string | undefined {
  const at = new RegExp(`/${key}(?![A-Za-z])\\s*`, 'u').exec(dictionary);
  if (!at) return undefined;
  const rest = dictionary.slice(at.index + at[0].length);
  if (rest.startsWith('<<')) {
    let depth = 0;
    for (let index = 0; index < rest.length - 1; index += 1) {
      if (rest.startsWith('<<', index)) {
        depth += 1;
        index += 1;
      } else if (rest.startsWith('>>', index)) {
        depth -= 1;
        index += 1;
        if (depth === 0) return rest.slice(0, index + 1);
      }
    }
    return undefined;
  }
  if (rest.startsWith('[')) return rest.slice(0, rest.indexOf(']') + 1);
  return /^(?:\d+\s+0\s+R|\/[^\s/<>[\]()]+|[^\s/<>[\]()]+)/u.exec(rest)?.[0];
}

const GLYPHS: Readonly<Record<string, string>> = {
  space: ' ', exclam: '!', quotedbl: '"', numbersign: '#', dollar: '$', percent: '%', ampersand: '&', quotesingle: "'", parenleft: '(', parenright: ')', asterisk: '*', plus: '+', comma: ',', hyphen: '-', period: '.', slash: '/',
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', colon: ':', semicolon: ';', less: '<', equal: '=', greater: '>', question: '?', at: '@',
  bracketleft: '[', backslash: '\\', bracketright: ']', underscore: '_', braceleft: '{', bar: '|', braceright: '}',
  adieresis: 'ä', odieresis: 'ö', udieresis: 'ü', Adieresis: 'Ä', Odieresis: 'Ö', Udieresis: 'Ü', germandbls: 'ß', section: '§', paragraph: '¶', degree: '°',
  endash: '–', emdash: '—', quotedblbase: '„', quotedblleft: '“', quotedblright: '”', quotesinglbase: '‚', quoteleft: '‘', quoteright: '’', bullet: '•', ellipsis: '…', Euro: '€', euro: '€',
  eacute: 'é', egrave: 'è', agrave: 'à', aacute: 'á', ccedilla: 'ç', minus: '−', multiply: '×', periodcentered: '·', nbspace: ' ', uni00A0: ' ', fi: 'fi', fl: 'fl',
};

function glyphName(name: string): string | undefined {
  if (GLYPHS[name] !== undefined) return GLYPHS[name];
  if (/^[A-Za-z]$/u.test(name)) return name;
  const uni = /^uni([0-9A-F]{4})$/u.exec(name);
  if (uni) return String.fromCodePoint(Number.parseInt(uni[1]!, 16));
  return undefined;
}

interface FontDecoder {
  decode(bytes: number[]): string | undefined;
}

/** ToUnicode-CMap: Zeichencode (als Hex) → Unicode; `width` = Bytes je Code laut `codespacerange`. */
function toUnicodeMap(cmap: string): { width: number; map: Map<number, string> } | undefined {
  const hexToString = (hex: string): string => {
    let output = '';
    for (let at = 0; at + 4 <= hex.length; at += 4) output += String.fromCharCode(Number.parseInt(hex.slice(at, at + 4), 16));
    return hex.length === 2 ? String.fromCharCode(Number.parseInt(hex, 16)) : output;
  };
  const space = /begincodespacerange\s*<([0-9A-Fa-f]+)>/u.exec(cmap);
  const width = space ? space[1]!.length / 2 : 1;
  const map = new Map<number, string>();
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/gu)) {
    for (const pair of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/gu)) map.set(Number.parseInt(pair[1]!, 16), hexToString(pair[2]!));
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/gu)) {
    for (const range of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([^\]]*)\])/gu)) {
      const low = Number.parseInt(range[1]!, 16);
      const high = Number.parseInt(range[2]!, 16);
      if (high - low > 65535) return undefined;
      if (range[3] !== undefined) {
        const base = hexToString(range[3]);
        for (let code = low; code <= high; code += 1) map.set(code, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + (code - low)));
      } else {
        const targets = [...range[4]!.matchAll(/<([0-9A-Fa-f]+)>/gu)].map((item) => hexToString(item[1]!));
        for (let code = low; code <= high; code += 1) if (targets[code - low] !== undefined) map.set(code, targets[code - low]!);
      }
    }
  }
  return { width, map };
}

function fontDecoder(objectsById: Map<number, PdfObject>, fontDictionary: string): FontDecoder | undefined {
  const toUnicodeRef = entry(fontDictionary, 'ToUnicode');
  const cmapStream = toUnicodeRef && /^\d+\s+0\s+R$/u.test(toUnicodeRef) ? objectsById.get(refs(toUnicodeRef)[0]!)?.stream : undefined;
  const cmap = cmapStream ? toUnicodeMap(latin1(cmapStream)) : undefined;
  if (/\/Subtype\s*\/Type0/u.test(fontDictionary)) {
    // Zusammengesetzte Schrift (Identity-H): nur mit ToUnicode-CMap, jeder Code muss abgebildet sein.
    if (!cmap || !/\/Encoding\s*\/Identity-H/u.test(fontDictionary)) return undefined;
    return {
      decode(bytes) {
        let output = '';
        for (let at = 0; at + cmap.width <= bytes.length; at += cmap.width) {
          let code = 0;
          for (let offset = 0; offset < cmap.width; offset += 1) code = code * 256 + bytes[at + offset]!;
          const mapped = cmap.map.get(code);
          if (mapped === undefined) return undefined;
          output += mapped;
        }
        return output;
      },
    };
  }
  const simple = simpleDecoder(objectsById, fontDictionary);
  if (!cmap || cmap.width !== 1) return simple;
  // Einfache Schrift mit ToUnicode: die CMap zuerst, sonst die Kodierung.
  return {
    decode(bytes) {
      let output = '';
      for (const byte of bytes) {
        const mapped = cmap.map.get(byte) ?? simple?.decode([byte]);
        if (mapped === undefined) return undefined;
        output += mapped;
      }
      return output;
    },
  };
}

function simpleDecoder(objectsById: Map<number, PdfObject>, fontDictionary: string): FontDecoder | undefined {
  let encoding = entry(fontDictionary, 'Encoding');
  let base = 'StandardEncoding';
  let differences = new Map<number, string>();
  if (encoding && /^\d+\s+0\s+R$/u.test(encoding)) encoding = objectsById.get(refs(encoding)[0]!)?.body;
  if (encoding?.startsWith('/')) base = encoding.slice(1);
  else if (encoding?.startsWith('<<')) {
    base = entry(encoding, 'BaseEncoding')?.slice(1) ?? 'StandardEncoding';
    const list = entry(encoding, 'Differences');
    if (list) {
      let code = 0;
      for (const token of list.slice(1, -1).match(/\d+|\/[^\s/[\]]+/gu) ?? []) {
        if (/^\d+$/u.test(token)) code = Number(token);
        else {
          differences.set(code, token.slice(1));
          code += 1;
        }
      }
    }
  }
  const decoder = base === 'MacRomanEncoding' ? new TextDecoder('macintosh') : base === 'WinAnsiEncoding' ? new TextDecoder('windows-1252') : base === 'StandardEncoding' ? new TextDecoder('windows-1252') : undefined;
  if (!decoder) return undefined;
  differences = new Map(differences);
  return {
    decode(bytes) {
      let output = '';
      for (const byte of bytes) {
        const name = differences.get(byte);
        if (name !== undefined) {
          const glyph = glyphName(name);
          if (glyph === undefined) return undefined;
          output += glyph;
          continue;
        }
        // StandardEncoding weicht nur oberhalb von 0x7F von WinAnsi ab: dort nicht raten.
        if (base === 'StandardEncoding' && byte > 0x7e) return undefined;
        output += decoder.decode(new Uint8Array([byte]));
      }
      return output;
    },
  };
}

/** Zeichenketten eines Inhaltsstroms samt Operator (`Tj`, `TJ`, `'`, `"`) und Schriftwechseln. */
function contentStrings(content: string): Array<{ font?: string; bytes: number[][]; op: string }> {
  const output: Array<{ font?: string; bytes: number[][]; op: string }> = [];
  let font: string | undefined;
  let operands: Array<number[] | number[][]> = [];
  let index = 0;
  const readLiteral = (): number[] => {
    const bytes: number[] = [];
    let depth = 1;
    index += 1;
    while (index < content.length && depth > 0) {
      const character = content[index]!;
      if (character === '\\') {
        const next = content[index + 1]!;
        const octal = /^[0-7]{1,3}/u.exec(content.slice(index + 1, index + 4));
        if (octal) {
          bytes.push(Number.parseInt(octal[0], 8) & 0xff);
          index += 1 + octal[0].length;
          continue;
        }
        const escapes: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
        if (escapes[next] !== undefined) bytes.push(escapes[next]!);
        index += 2;
        continue;
      }
      if (character === '(') depth += 1;
      if (character === ')') {
        depth -= 1;
        if (depth === 0) {
          index += 1;
          break;
        }
      }
      bytes.push(character.charCodeAt(0) & 0xff);
      index += 1;
    }
    return bytes;
  };
  while (index < content.length) {
    const character = content[index]!;
    if (character === '(') {
      operands.push(readLiteral());
      continue;
    }
    if (character === '<' && content[index + 1] !== '<') {
      const end = content.indexOf('>', index);
      if (end < 0) break;
      const hex = content.slice(index + 1, end).replace(/\s+/gu, '');
      const bytes: number[] = [];
      for (let at = 0; at < hex.length; at += 2) bytes.push(Number.parseInt(hex.slice(at, at + 2).padEnd(2, '0'), 16));
      operands.push(bytes);
      index = end + 1;
      continue;
    }
    if (character === '[') {
      const items: number[][] = [];
      index += 1;
      while (index < content.length && content[index] !== ']') {
        if (content[index] === '(') items.push(readLiteral());
        else if (content[index] === '<') {
          const end = content.indexOf('>', index);
          if (end < 0) {
            index = content.length;
            break;
          }
          const hex = content.slice(index + 1, end).replace(/\s+/gu, '');
          const bytes: number[] = [];
          for (let at = 0; at < hex.length; at += 2) bytes.push(Number.parseInt(hex.slice(at, at + 2).padEnd(2, '0'), 16));
          items.push(bytes);
          index = end + 1;
        } else {
          const number = /^-?\d*\.?\d+/u.exec(content.slice(index, index + 20));
          // Ein großer negativer Abstand im TJ-Array ist ein Wortzwischenraum.
          if (number && Number(number[0]) < -250) items.push([32]);
          index += number ? number[0].length : 1;
        }
      }
      index += 1;
      operands.push(items);
      continue;
    }
    const word = /^[A-Za-z'"*]+/u.exec(content.slice(index, index + 4));
    if (word) {
      const op = word[0];
      if (op === 'Tf') {
        const name = /\/([^\s/]+)\s+[-\d.]+\s*$/u.exec(content.slice(Math.max(0, index - 40), index));
        font = name?.[1];
      } else if (op === 'Tj' || op === "'" || op === '"') {
        const last = operands.at(-1);
        if (Array.isArray(last) && typeof last[0] !== 'object') output.push({ ...(font ? { font } : {}), bytes: [last as number[]], op });
      } else if (op === 'TJ') {
        const last = operands.at(-1);
        if (Array.isArray(last) && (last.length === 0 || typeof last[0] === 'object')) output.push({ ...(font ? { font } : {}), bytes: last as number[][], op });
      }
      operands = [];
      index += op.length;
      continue;
    }
    index += 1;
  }
  return output;
}

export interface PdfText {
  ok: boolean;
  reason?: string;
  /** Text je Seite, Leerraum normalisiert, in Stromreihenfolge. */
  pages: string[];
}

/** Textlayer einer PDF je Seite – ohne OCR, ohne Layoutdeutung; `ok: false`, wenn eine Schrift nicht sicher dekodierbar ist. */
export function pdfText(bytes: Uint8Array): PdfText {
  const inspection = inspectPdf(bytes);
  if (!inspection.isPdf) return { ok: false, reason: 'keine PDF', pages: [] };
  if (inspection.encrypted) return { ok: false, reason: 'PDF verschlüsselt', pages: [] };
  if (!inspection.textLayer || inspection.scanLike) return { ok: false, reason: `kein verwertbarer Textlayer (${inspection.extractable}); OCR ist keine Rechtsquelle`, pages: [] };
  const byId = objects(bytes);
  const catalog = [...byId.values()].find((object) => /\/Type\s*\/Catalog/u.test(object.body));
  const rootPages = catalog ? refs(entry(catalog.body, 'Pages') ?? '')[0] : undefined;
  if (rootPages === undefined) return { ok: false, reason: 'Seitenbaum nicht lesbar', pages: [] };
  const pageObjects: Array<{ id: number; resources?: string }> = [];
  const visit = (id: number, inherited: string | undefined, depth: number): void => {
    const object = byId.get(id);
    if (!object || depth > 20) return;
    const resources = entry(object.body, 'Resources') ?? inherited;
    if (/\/Type\s*\/Pages/u.test(object.body)) {
      for (const kid of refs(entry(object.body, 'Kids') ?? '')) visit(kid, resources, depth + 1);
      return;
    }
    pageObjects.push({ id, ...(resources ? { resources } : {}) });
  };
  visit(rootPages, undefined, 0);
  const pages: string[] = [];
  for (const page of pageObjects) {
    const object = byId.get(page.id)!;
    let resources = page.resources;
    if (resources && /^\d+\s+0\s+R$/u.test(resources)) resources = byId.get(refs(resources)[0]!)?.body;
    let fonts = resources ? entry(resources, 'Font') : undefined;
    if (fonts && /^\d+\s+0\s+R$/u.test(fonts)) fonts = byId.get(refs(fonts)[0]!)?.body;
    const decoders = new Map<string, FontDecoder | undefined>();
    for (const match of (fonts ?? '').matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+0\s+R/gu)) {
      const font = byId.get(Number(match[2]));
      decoders.set(match[1]!, font ? fontDecoder(byId, font.body) : undefined);
    }
    const contents = entry(object.body, 'Contents') ?? '';
    const streams = refs(contents).map((id) => byId.get(id)?.stream);
    if (streams.some((stream) => stream === undefined)) return { ok: false, reason: `Inhaltsstrom der Seite ${pages.length + 1} nicht lesbar`, pages };
    const pieces: string[] = [];
    for (const stream of streams) {
      for (const item of contentStrings(latin1(stream!))) {
        const decoder = item.font ? decoders.get(item.font) : undefined;
        if (!decoder) return { ok: false, reason: `Schrift ${item.font ?? '–'} auf Seite ${pages.length + 1} ohne sicher dekodierbare Kodierung`, pages };
        let text = '';
        for (const bytesOf of item.bytes) {
          const decoded = decoder.decode(bytesOf);
          if (decoded === undefined) return { ok: false, reason: `Zeichen der Schrift ${item.font} auf Seite ${pages.length + 1} nicht sicher dekodierbar`, pages };
          text += decoded;
        }
        pieces.push(text);
      }
    }
    pages.push(pieces.join(' ').replace(/\s+/gu, ' ').trim());
  }
  return { ok: true, pages };
}

export interface PdfCommencement {
  ok: boolean;
  date?: string;
  evidence: string[];
  reason?: string;
}

const COMMENCEMENT_SENTENCE = /(?:Dieses|Diese|Die|Das)\s+(?:Gesetz|Verordnung|Bekanntmachung)\s+tritt\s+am\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})\s+in\s+Kraft\s*\./gu;

/**
 * Inkrafttreten einer Verkündung aus dem Textlayer ihrer PDF-Ausgabe – nur unter den im Modulkopf genannten
 * Grenzen. `page.pdf.pages` ist der Seitenbereich der Ausgabe laut Ausgabenverzeichnis.
 */
export async function pdfCommencement(root: string, page: GazettePage, enactmentDate: string | undefined): Promise<PdfCommencement> {
  const evidence: string[] = [];
  const fail = (reason: string): PdfCommencement => ({ ok: false, evidence, reason });
  if (!page.pdf) return fail('keine PDF-Ausgabe');
  if (!enactmentDate) return fail('Ausfertigungsdatum der Verkündung unbekannt');
  const cached = await readCached(root, page.url);
  if (!cached) return fail(`PDF nicht im Cache: ${page.url}`);
  if (cached.sha256 !== page.pdf.publishedSha256) return fail(`SHA-256 der PDF (${cached.sha256.slice(0, 16)}…) ≠ veröffentlichte Prüfsumme (${page.pdf.publishedSha256.slice(0, 16)}…)`);
  evidence.push(`PDF ${page.url}, SHA-256 ${cached.sha256} = von der Plattform veröffentlichte Prüfsumme (Ausgabenverzeichnis ${page.pdf.indexUrl})`);
  const range = /^(\d+)\s*-\s*(\d+)$/u.exec(page.pdf.pages);
  if (!range) return fail(`Seitenbereich der Ausgabe nicht lesbar („${page.pdf.pages}“)`);
  const first = Number(range[1]);
  const position = page.ref.position;
  const text = pdfText(cached.bytes);
  if (!text.ok) return fail(`Textlayer nicht verwertbar: ${text.reason}`);
  const result = pdfPageCommencement(text.pages, { first, position, enactmentDate });
  return { ...result, evidence: [...evidence, ...result.evidence] };
}

/**
 * Reine Prüfung auf dem Textlayer (Seitentexte der Ausgabe, erste Seite = Inhaltsverzeichnis mit Seitenzahl
 * `first`): Die Verkündung auf S. `position` (= erste Inhaltsseite) trägt Seitenzahl und Kopfzeile, genau einen
 * Titelzusatz und genau eine Unterschrift mit dem Ausfertigungsdatum und **genau eine** Inkrafttretensregel – eine
 * Grundregel mit Kalenderdatum.
 */
export function pdfPageCommencement(pages: readonly string[], input: { first: number; position: number; enactmentDate: string }): PdfCommencement {
  const evidence: string[] = [];
  const fail = (reason: string): PdfCommencement => ({ ok: false, evidence, reason });
  const { first, position, enactmentDate } = input;
  const long = longGermanDate(enactmentDate);
  // Sperrsatz und Unterschneidung im Titelzusatz („Vo m 9. Mai 2006“): Leerzeichen zwischen den Buchstaben sind zulässig.
  // Neuere Ausgaben (GVBl. 2017) setzen den Titel mit Gliederungsnummer und kleinem „vom“: „300-12-6-J Verordnung zur
  // Änderung der Aufbewahrungsverordnung vom 30. Mai 2017“ – ein Zitat im Text trägt keine Gliederungsnummer davor.
  const titlesOf = (text: string): RegExpMatchArray[] => [
    ...text.matchAll(/V\s?o\s?m\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})/gu),
    ...text.matchAll(/(?<![\p{L}\d-])\d{2,4}(?:-\d+[a-z]?)*-[A-Z]{1,3}(?:\/[A-Z])?\s+(?:Gesetz|Verordnung|Bekanntmachung|Satzung|Haushaltsgesetz)\b[^.„“]{0,300}?\svom\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})/gu),
  ];
  const signaturesOf = (text: string): RegExpMatchArray[] => [...text.matchAll(/München,\s+den\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})/gu)];
  // Die Verkündung beginnt auf S. `position` und endet auf der Seite ihrer Unterschrift. Auf diesen Seiten darf es genau
  // einen Titelzusatz (ihren, auf der ersten) und genau eine Unterschrift (ihre, auf der letzten) geben: Dann enthalten
  // die Seiten nichts von einer anderen Verkündung – der Rest der vorangehenden endete mit deren Unterschrift, die
  // nächste begänne mit ihrem Titelzusatz. Ohne Layoutdeutung.
  const start = position - first;
  const span: string[] = [];
  // Eine Verkündung umfasst höchstens 30 Seiten dieser Prüfung (GVBl. 2017 S. 283–301: 19 Seiten Tabelle).
  for (let index = start; index < pages.length && index <= start + 29; index += 1) {
    const content = pages[index]!;
    const pageNumber = first + index;
    if (!new RegExp(`(?:^|\\s)${pageNumber}(?:\\s|$)`, 'u').test(content) || !/Gesetz-\s*und\s+Verordnungsblatt/u.test(content)) return fail(`PDF-Seite ${index + 1} trägt nicht Seitenzahl ${pageNumber} mit Kopfzeile des GVBl.`);
    span.push(content);
    if (signaturesOf(content).length > 0) break;
  }
  if (span.length === 0) return fail(`PDF hat keine Seite ${start + 1}`);
  // Silbentrennung am Zeilenende erscheint im Textlayer als „Verord - nung“ (Leerzeichen um den Strich); für die
  // Prüfung wird sie zusammengezogen. Ein echter Bindestrich („Sonn- und“) hat kein Leerzeichen davor.
  const text = span.join(' ').replace(/(\p{Ll}) - (\p{Ll})/gu, '$1$2');
  const titles = titlesOf(text);
  const signatures = signaturesOf(text);
  if (titles.length !== 1 || parseLongGermanDate(titles[0]![1]!) !== enactmentDate || titlesOf(span[0]!).length !== 1) return fail(`S. ${position}–${position + span.length - 1} tragen nicht genau einen Titelzusatz „Vom ${long}“ auf der ersten Seite (${titles.map((title) => title[0]).join(', ') || 'keinen'})`);
  if (signatures.length !== 1 || parseLongGermanDate(signatures[0]![1]!) !== enactmentDate) return fail(`S. ${position}–${position + span.length - 1} tragen nicht genau eine Unterschrift „München, den ${long}“ (${signatures.map((signature) => signature[0]).join(', ') || 'keine'})`);
  const statements = [...text.matchAll(/(?:tritt|treten)\s(?:[^.]|(?<=\d)\.){0,200}?in\s+Kraft/gu)];
  const sentences = [...text.matchAll(COMMENCEMENT_SENTENCE)];
  if (statements.length !== 1 || sentences.length !== 1) return fail(`S. ${position}–${position + span.length - 1} enthalten ${statements.length} Inkrafttretensregeln; verlangt ist genau eine Grundregel mit Kalenderdatum`);
  const date = parseLongGermanDate(sentences[0]![1]!);
  if (!date) return fail(`Datum der Inkrafttretensregel nicht lesbar („${sentences[0]![0]}“)`);
  evidence.push(`Textlayer S. ${position}${span.length > 1 ? `–${position + span.length - 1}` : ''} (PDF-Seite ${start + 1}${span.length > 1 ? `–${start + span.length}` : ''}): Titelzusatz „${titles[0]![0]}“, Unterschrift „${signatures[0]![0]}“, einzige Inkrafttretensregel „${sentences[0]![0]}“`);
  return { ok: true, date, evidence };
}
