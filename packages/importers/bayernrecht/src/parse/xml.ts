/**
 * Fail-closed XML-Leser für die beiden BAYERN.RECHT-Exportformate.
 *
 * Warum ein eigener Leser und keine Bibliothek: Die Exporte tragen eine `<!DOCTYPE>`-Deklaration mit
 * einer **Netz-URL** (`http://gesetze-bayern.de/schema/byrecht.normen.dtd` bzw. `…/byrecht.vv.dtd`).
 * Ein DTD-auflösender Parser würde beim Parsen einen HTTP-Abruf auslösen – im Importlauf unzulässig
 * und in einem Offline-Lauf ein Fehler ohne erkennbare Ursache. Dieser Leser
 *
 *   - liest die Deklaration nur als Angabe (Wurzelname, Public-ID, System-ID) und **ruft nie etwas ab**,
 *   - lehnt eine interne DTD-Teilmenge (`<!DOCTYPE … [ … ]>`) ab, statt Entitätsdeklarationen zu deuten,
 *   - kennt ausschließlich die fünf vordefinierten Entitäten und numerische Zeichenreferenzen; jede
 *     andere Entität bricht mit Namensnennung ab (sie wäre nur über die externe DTD auflösbar),
 *   - entfernt eine BOM am Dateianfang (alle vier untersuchten Exporte beginnen mit `EF BB BF`),
 *   - bricht bei nicht geschlossenen, falsch geschachtelten oder doppelt attributierten Elementen ab.
 *
 * Namensräume gibt es in beiden DTDs nicht (belegt an vier Exportinstanzen), deshalb auch keine
 * Namensraumbehandlung: Elementnamen wie `absatz.text`, `gliederungsNr.BayRS` oder `satz.nr` tragen
 * den Punkt als gewöhnliches Namenszeichen, nicht als Trenner.
 */
import { ImportPipelineError } from '@landesrecht/importer-common/pipeline.ts';

export interface XmlElement {
  readonly kind: 'element';
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlNode[];
  /** 1-basierte Zeile des öffnenden Tags (nur für Fehlermeldungen und Befunde). */
  readonly line: number;
}

export interface XmlText {
  readonly kind: 'text';
  readonly value: string;
}

export type XmlNode = XmlElement | XmlText;

export interface XmlDoctype {
  readonly name: string;
  readonly publicId?: string;
  /** Die System-ID wird festgehalten, aber niemals abgerufen. */
  readonly systemId?: string;
}

export interface XmlDocument {
  readonly doctype?: XmlDoctype;
  readonly root: XmlElement;
}

const PREDEFINED_ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const NAME_START = /[A-Za-z_:]/u;
const NAME_CHAR = /[A-Za-z0-9_.:·-]/u;
/** Ein `&`, dem keine vollständige, wohlgeformte Referenz folgt. */
const LOOSE_AMPERSAND = /&(?!(?:#x[0-9A-Fa-f]+|#\d+|[A-Za-z][A-Za-z0-9]*);)/u;
const ENTITY_REFERENCE = /&(#x[0-9A-Fa-f]+|#\d+|[A-Za-z][A-Za-z0-9]*);/gu;

/** Entfernt eine UTF-8-BOM am Dateianfang. Alle vier untersuchten Exporte tragen eine. */
export function stripByteOrderMark(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function isSpace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

function parseError(message: string, line: number): ImportPipelineError {
  return new ImportPipelineError('parse-source-format', `${message} (Zeile ${line})`);
}

/**
 * Liest ein vollständiges XML-Dokument. Wirft `ImportPipelineError` bei jeder Abweichung – der Leser
 * repariert nichts und überliest nichts.
 */
export function readXmlDocument(source: string): XmlDocument {
  const text = stripByteOrderMark(source);
  let pos = 0;
  let line = 1;

  const fail = (message: string): never => {
    throw parseError(message, line);
  };

  /** Konsumiert bis `index` und zählt dabei die Zeilenumbrüche mit. */
  const advanceTo = (index: number): string => {
    const chunk = text.slice(pos, index);
    for (let offset = 0; offset < chunk.length; offset += 1) if (chunk.charCodeAt(offset) === 0x0a) line += 1;
    pos = index;
    return chunk;
  };

  const literal = (value: string): void => {
    if (!text.startsWith(value, pos)) fail(`erwartet ${JSON.stringify(value)}`);
    advanceTo(pos + value.length);
  };

  const skipSpace = (): void => {
    let index = pos;
    while (index < text.length && isSpace(text.charCodeAt(index))) index += 1;
    advanceTo(index);
  };

  const readName = (): string => {
    let index = pos;
    if (index < text.length && NAME_START.test(text.charAt(index))) {
      index += 1;
      while (index < text.length && NAME_CHAR.test(text.charAt(index))) index += 1;
    }
    if (index === pos) fail('erwartet einen XML-Namen');
    return advanceTo(index);
  };

  const decode = (raw: string, where: string): string => {
    if (!raw.includes('&')) return raw;
    if (LOOSE_AMPERSAND.test(raw)) fail(`Unvollständige Entitätsreferenz in ${where}`);
    return raw.replace(ENTITY_REFERENCE, (_match, body: string) => {
      if (body.startsWith('#x')) return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
      if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
      const resolved = PREDEFINED_ENTITIES[body];
      if (resolved === undefined) {
        // Nur die externe DTD könnte diese Entität definieren – und die wird bewusst nicht aufgelöst.
        throw parseError(`Unbekannte Entität &${body}; in ${where}: externe Entitäten und DTD-Auflösung sind abgeschaltet`, line);
      }
      return resolved;
    });
  };

  const readQuoted = (where: string): string => {
    const quote = text.charAt(pos);
    if (quote !== '"' && quote !== "'") fail(`erwartet einen Anführungsstrich für ${where}`);
    advanceTo(pos + 1);
    const end = text.indexOf(quote, pos);
    if (end < 0) fail(`nicht beendeter Wert für ${where}`);
    const raw = advanceTo(end);
    advanceTo(end + 1);
    return decode(raw, where);
  };

  const readDoctype = (): XmlDoctype => {
    literal('<!DOCTYPE');
    skipSpace();
    const name = readName();
    skipSpace();
    let publicId: string | undefined;
    let systemId: string | undefined;
    if (text.startsWith('PUBLIC', pos)) {
      advanceTo(pos + 6);
      skipSpace();
      publicId = readQuoted('Public-ID der DTD');
      skipSpace();
      if (text.charAt(pos) === '"' || text.charAt(pos) === "'") {
        systemId = readQuoted('System-ID der DTD');
        skipSpace();
      }
    } else if (text.startsWith('SYSTEM', pos)) {
      advanceTo(pos + 6);
      skipSpace();
      systemId = readQuoted('System-ID der DTD');
      skipSpace();
    }
    if (text.charAt(pos) === '[') {
      fail('Interne DTD-Teilmenge im <!DOCTYPE>: Entitätsdeklarationen werden nicht ausgewertet');
    }
    literal('>');
    return { name, publicId, systemId };
  };

  const parseElement = (): XmlElement => {
    const startLine = line;
    literal('<');
    const name = readName();
    const attributes: Record<string, string> = {};
    let selfClosing = false;
    for (;;) {
      const hadSpace = isSpace(text.charCodeAt(pos));
      skipSpace();
      if (text.startsWith('/>', pos)) {
        advanceTo(pos + 2);
        selfClosing = true;
        break;
      }
      if (text.startsWith('>', pos)) {
        advanceTo(pos + 1);
        break;
      }
      if (!hadSpace) fail(`fehlender Abstand vor einem Attribut von <${name}>`);
      const attributeName = readName();
      skipSpace();
      literal('=');
      skipSpace();
      if (Object.prototype.hasOwnProperty.call(attributes, attributeName)) fail(`Attribut ${attributeName} kommt an <${name}> doppelt vor`);
      attributes[attributeName] = readQuoted(`Attribut ${name}@${attributeName}`).replace(/[\t\n\r]/gu, ' ');
    }
    if (selfClosing) return { kind: 'element', name, attributes, children: [], line: startLine };
    return { kind: 'element', name, attributes, children: parseContent(name, startLine), line: startLine };
  };

  const parseContent = (parentName: string, openedAt: number): XmlNode[] => {
    const children: XmlNode[] = [];
    const pushText = (value: string): void => {
      if (value === '') return;
      const last = children[children.length - 1];
      if (last && last.kind === 'text') children[children.length - 1] = { kind: 'text', value: last.value + value };
      else children.push({ kind: 'text', value });
    };
    for (;;) {
      const next = text.indexOf('<', pos);
      if (next < 0) throw parseError(`<${parentName}> wird nicht geschlossen`, openedAt);
      if (next > pos) pushText(decode(advanceTo(next), `Inhalt von <${parentName}>`));
      if (text.startsWith('</', pos)) {
        advanceTo(pos + 2);
        const closing = readName();
        skipSpace();
        literal('>');
        if (closing !== parentName) fail(`</${closing}> schließt <${parentName}> nicht`);
        return children;
      }
      if (text.startsWith('<!--', pos)) {
        const end = text.indexOf('-->', pos);
        if (end < 0) fail('nicht beendeter Kommentar');
        advanceTo(end + 3);
        continue;
      }
      if (text.startsWith('<![CDATA[', pos)) {
        const end = text.indexOf(']]>', pos);
        if (end < 0) fail('nicht beendeter CDATA-Abschnitt');
        advanceTo(pos + 9);
        pushText(advanceTo(end));
        advanceTo(end + 3);
        continue;
      }
      if (text.startsWith('<?', pos)) {
        const end = text.indexOf('?>', pos);
        if (end < 0) fail('nicht beendete Verarbeitungsanweisung');
        advanceTo(end + 2);
        continue;
      }
      if (text.startsWith('<!', pos)) fail(`Deklaration im Inhalt von <${parentName}> ist nicht zulässig`);
      children.push(parseElement());
    }
  };

  /** Prolog und Epilog: Leerraum, XML-Deklaration, Kommentare, Verarbeitungsanweisungen, DOCTYPE. */
  const skipMisc = (allowDoctype: boolean): XmlDoctype | undefined => {
    let doctype: XmlDoctype | undefined;
    for (;;) {
      skipSpace();
      if (text.startsWith('<?', pos)) {
        const end = text.indexOf('?>', pos);
        if (end < 0) fail('nicht beendete Verarbeitungsanweisung');
        advanceTo(end + 2);
        continue;
      }
      if (text.startsWith('<!--', pos)) {
        const end = text.indexOf('-->', pos);
        if (end < 0) fail('nicht beendeter Kommentar');
        advanceTo(end + 3);
        continue;
      }
      if (text.startsWith('<!DOCTYPE', pos)) {
        if (!allowDoctype) fail('<!DOCTYPE> darf nur einmal und nur vor dem Wurzelelement stehen');
        if (doctype) fail('mehr als eine <!DOCTYPE>-Deklaration');
        doctype = readDoctype();
        continue;
      }
      return doctype;
    }
  };

  const doctype = skipMisc(true);
  if (pos >= text.length || text.charAt(pos) !== '<') fail('kein Wurzelelement gefunden');
  const root = parseElement();
  skipMisc(false);
  if (pos !== text.length) fail('Inhalt nach dem Wurzelelement');
  return { doctype, root };
}

export function isElement(node: XmlNode): node is XmlElement {
  return node.kind === 'element';
}

export function isText(node: XmlNode): node is XmlText {
  return node.kind === 'text';
}

export function elementChildren(element: XmlElement): XmlElement[] {
  return element.children.filter(isElement);
}

export function childElement(element: XmlElement, name: string): XmlElement | undefined {
  return element.children.find((node): node is XmlElement => isElement(node) && node.name === name);
}

export function childElements(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((node): node is XmlElement => isElement(node) && node.name === name);
}

export function attribute(element: XmlElement, name: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(element.attributes, name) ? element.attributes[name] : undefined;
}

/** Roher Textinhalt eines Teilbaums, ohne Auszeichnung und ohne Normalisierung. */
export function rawText(node: XmlNode): string {
  if (isText(node)) return node.value;
  return node.children.map(rawText).join('');
}

/** Leerraumfolgen zu einem Leerzeichen, außen getrimmt. */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

/** Zeilenweise getrimmter Text; die Zeilen selbst bleiben erhalten (Quelltext der Kopfangaben). */
export function trimmedLines(value: string): string[] {
  return value
    .split(/\r\n|\r|\n/u)
    .map((entry) => entry.replace(/\s+/gu, ' ').trim())
    .filter((entry) => entry !== '');
}
