/**
 * Verkündungs-HTML → Blockmodell von legal-core (`NormBodyBlock[]`).
 *
 * Quelle ist der Textkörper einer Einzelveröffentlichung der Verkündungsplattform Bayern
 * (`article#documentbox > div.text_html`). Er liegt in drei Satzformen vor: BayMBl. ab 2019 (`p.MBL…`,
 * `h3` mit `span.titlenr`/`span.titlecaption`, `dl.MBL1Listenebene`), Amts- und Ministerialblätter
 * 2009–2018 (`div.BY-Standard`, `dt`/`dd`, `div.berschriftTitelBetreff`) und GVBl. (`p.EBENE…`, `h3`).
 *
 * **Grundsatz: vollständig und in Reihenfolge, Struktur nur, wo sicher.**
 *
 * 1. Der Baum wird in Segmente zerlegt – Absatz, Überschrift, Listenglied (mit Gliederungszeichen aus `dt`,
 *    `span.titlenr`, `span.nummerierung`, `span.olzhlr`), Tabelle, Unterschrift. Jeder Textknoten landet in
 *    genau einem Segment. Unbekannte Elemente und Bilder brechen ab (`unsupported`) – es wird nichts
 *    übergangen, was Text tragen könnte.
 * 2. Der Kopf (Gliederungsnummer, Titel, Erlassstelle, Datumszeile mit Aktenzeichen) wird an seinem Wortlaut
 *    erkannt, nicht an Klassen, weil die Satzformen verschiedene Klassen führen.
 * 3. Eine dezimale Gliederung (`1.`, `1.1`, `1.1.1`) wird nur dann verschachtelt, wenn die Folge der Nummern
 *    lückenlos aufgeht (jede Nummer Nachfolger oder erstes Kind einer vorangehenden). Sonst bleibt der Körper
 *    flach – der Text ist derselbe, nur ohne Gliederungsebenen.
 * 4. Tabellen nur mit schlüssigem Raster (Zeilen × Spalten einschließlich `rowspan`/`colspan`), sonst Abbruch.
 *
 * **Textintegrität.** Der kanonische Text des Ergebnisses (Kopf, Körper, Unterschrift in Leserichtung) muss
 * ohne Leerraum Zeichen für Zeichen dem Seitentext entsprechen. Nur Gliederungszeichen, die die Seite per
 * Stil (Aufzählungsstrich einer `ul`) statt als Text setzt, sind ausgenommen und werden gezählt.
 *
 * Normalisiert wird wie in `reconstruction/gazette.ts`: Entitäten aufgelöst, geschützte und schmale
 * Leerzeichen → Leerzeichen, Leerraumfolgen → ein Leerzeichen, weiche Trennzeichen entfernt,
 * `<sup>1</sup>` → Unicode-Hochstellung (`¹`, wie die Satznummern des Portals).
 */
import { createHash } from 'node:crypto';

import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { parseBodyBlocks } from '@landesrecht/legal-core/lib/schema.ts';

import { decodeEntities as decodeKnownEntities } from '../events/listings.ts';
import { toSuperscript } from '../parse/flow.ts';

/** Version des Umsetzers; jede Änderung, die die Ausgabe verändern kann, erhöht sie. */
export const CONVERTER_VERSION = 'bayernrecht-gazette-html/1.0.0';

/* ------------------------------------------------------------------------------ Entitäten */

/**
 * Benannte Entitäten, die die Verkündungsseiten über `events/listings.ts#decodeEntities` hinaus führen
 * (`&ensp;`, `&thinsp;` …). Eine unbekannte Entität bleibt stehen – und fällt dann in der Textintegrität
 * nicht auf, weil beide Seiten sie gleich führen; sichtbar wird sie im Text. Deshalb ist die Liste großzügig.
 */
const MORE_ENTITIES: Readonly<Record<string, string>> = {
  ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', zwnj: '\u200c', zwj: '\u200d', lrm: '', rlm: '',
  middot: '·', bull: '•', laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›', times: '×', divide: '÷', minus: '−',
  frac12: '½', frac14: '¼', frac34: '¾', sup1: '¹', sup2: '²', sup3: '³', copy: '©', reg: '®', trade: '™',
  plusmn: '±', le: '≤', ge: '≥', ne: '≠', asymp: '≈', infin: '∞', permil: '‰', prime: '′', Prime: '″',
  micro: 'µ', ordm: 'º', ordf: 'ª', iquest: '¿', iexcl: '¡', cent: '¢', pound: '£', yen: '¥', curren: '¤',
  brvbar: '¦', uml: '¨', macr: '¯', acute: '´', cedil: '¸', not: '¬', larr: '←', rarr: '→', uarr: '↑', darr: '↓',
  harr: '↔', rArr: '⇒', lArr: '⇐', hArr: '⇔', dagger: '†', Dagger: '‡', loz: '◊', check: '✓',
  Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Aring: 'Å', AElig: 'Æ', Ccedil: 'Ç', Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë',
  Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î', Iuml: 'Ï', Ntilde: 'Ñ', Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Oslash: 'Ø',
  Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Yacute: 'Ý', agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', aring: 'å', aelig: 'æ',
  ccedil: 'ç', egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï', ntilde: 'ñ',
  ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', oslash: 'ø', ugrave: 'ù', uacute: 'ú', ucirc: 'û', yacute: 'ý', yuml: 'ÿ',
  oelig: 'œ', OElig: 'Œ', scaron: 'š', Scaron: 'Š', zcaron: 'ž', Zcaron: 'Ž', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ',
  mu: 'μ', pi: 'π', sigma: 'σ', Omega: 'Ω', omega: 'ω', lambda: 'λ', Delta: 'Δ', Sigma: 'Σ', sum: '∑', radic: '√',
};

export function decodeEntities(value: string): string {
  return decodeKnownEntities(value).replace(/&([a-zA-Z][a-zA-Z0-9]*);/gu, (match, name: string) => MORE_ENTITIES[name] ?? match);
}

/* ------------------------------------------------------------------------------ DOM-Baum */

export interface ElementNode {
  kind: 'element';
  tag: string;
  attributes: Record<string, string>;
  children: HtmlNode[];
}
export interface TextNode {
  kind: 'text';
  text: string;
}
export type HtmlNode = ElementNode | TextNode;

const VOID = new Set(['br', 'wbr', 'img', 'hr', 'meta', 'link', 'input', 'col', 'area', 'base', 'source']);
/** Elemente, die ein offenes gleichnamiges Element implizit schließen (HTML-Parsing-Regeln, vereinfacht). */
const IMPLIED_END: Readonly<Record<string, readonly string[]>> = {
  p: ['p'],
  li: ['li'],
  dt: ['dt', 'dd'],
  dd: ['dt', 'dd'],
  tr: ['tr', 'td', 'th'],
  td: ['td', 'th'],
  th: ['td', 'th'],
};

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu)) {
    attributes[match[1]!.toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

/** Toleranter Parser für die Verkündungsseiten: schließt offene Elemente beim passenden Endtag, ignoriert verwaiste Endtags. */
export function parseHtml(html: string): HtmlNode[] {
  const root: ElementNode = { kind: 'element', tag: '#root', attributes: {}, children: [] };
  const stack: ElementNode[] = [root];
  const source = html.replace(/<!--[\s\S]*?-->/gu, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/giu, '');
  for (const match of source.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)|(<)/gu)) {
    if (match[4] !== undefined || match[5] !== undefined) {
      stack.at(-1)!.children.push({ kind: 'text', text: match[4] ?? match[5]! });
      continue;
    }
    const tag = match[2]!.toLowerCase();
    if (match[1] === '/') {
      const at = stack.map((node) => node.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      continue;
    }
    const implied = IMPLIED_END[tag];
    if (implied) {
      // Nur innerhalb des nächsten Containers schließen (eine `dd` schließt keine `dd` einer äußeren Liste).
      const current = stack.at(-1)!;
      if (implied.includes(current.tag)) stack.pop();
    }
    const element: ElementNode = { kind: 'element', tag, attributes: parseAttributes(match[3] ?? ''), children: [] };
    stack.at(-1)!.children.push(element);
    if (!VOID.has(tag) && !(match[3] ?? '').trimEnd().endsWith('/')) stack.push(element);
  }
  return root.children;
}

export function findElement(nodes: readonly HtmlNode[], predicate: (node: ElementNode) => boolean): ElementNode | undefined {
  for (const node of nodes) {
    if (node.kind !== 'element') continue;
    if (predicate(node)) return node;
    const inner = findElement(node.children, predicate);
    if (inner) return inner;
  }
  return undefined;
}

const hasClass = (node: ElementNode, name: string): boolean => (node.attributes.class ?? '').split(/\s+/u).includes(name);
const classOf = (node: ElementNode): string => node.attributes.class ?? '';

/**
 * Der Textkörper einer Verkündungsseite: der Inhalt von `article#documentbox` ohne den Anlagenblock
 * (`p.attachment` und die folgende Linkliste). Nicht nur `div.text_html`: Ältere Seiten schließen diesen
 * Container vorzeitig, der Text steht dann als Geschwister dahinter.
 */
export function textBody(html: string): ElementNode | undefined {
  const tree = parseHtml(html);
  const article = findElement(tree, (node) => node.tag === 'article' && node.attributes.id === 'documentbox');
  if (!article) return undefined;
  // Der Anlagenblock kann – bei nicht geschlossenen Elementen der Seite – auch tiefer im Baum hängen.
  const strip = (nodes: readonly HtmlNode[]): HtmlNode[] => {
    const kept: HtmlNode[] = [];
    let attachments = false;
    for (const child of nodes) {
      if (child.kind === 'element' && child.tag === 'p' && hasClass(child, 'attachment')) {
        attachments = true;
        continue;
      }
      // Die Linkliste der Anlagen folgt dem Absatz „Anlage(n)“ als `ul`.
      if (attachments && child.kind === 'element' && child.tag === 'ul') continue;
      kept.push(child.kind === 'element' ? { ...child, children: strip(child.children) } : child);
    }
    return kept;
  };
  return { kind: 'element', tag: 'div', attributes: { class: 'documentbox' }, children: strip(article.children) };
}

/* ---------------------------------------------------------------------------- Normalisierung */

/** Leerraum wie im Portaltext; weiche Trennzeichen, breitenlose Zeichen und Steuerzeichen entfallen. */
export function normalizeText(value: string): string {
  return value
    // Steuerzeichen sind nie sichtbarer Text (kein Browser stellt sie dar). jmbl-2014-5-66 trägt acht NUL-Bytes nach dem
    // letzten Absatz – ein Defekt der Seite, kein Normtext. Zeilenumbruch und Tabulator bleiben Leerraum.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .replace(/[­​‌‍﻿]/gu, '')
    .replace(/[        ]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

const INLINE = new Set(['span', 'a', 'strong', 'b', 'em', 'i', 'u', 'sup', 'sub', 'nobr', 'wbr', 'br', 'font', 'abbr', 'small', 'big', 's', 'strike', 'mark', 'code', 'q', 'cite', 'time', 'del', 'ins', 'label']);
const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'section', 'article', 'center', 'address', 'header', 'footer', 'main', 'aside', 'figure', 'figcaption', 'pre']);
const LIST = new Set(['dl', 'ul', 'ol']);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

export class ConversionError extends Error {
  readonly code: 'unsupported-element' | 'image-in-body' | 'table-irregular' | 'empty-body' | 'head-unreadable' | 'integrity-mismatch' | 'schema';
  constructor(code: ConversionError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'ConversionError';
  }
}

interface InlineResult {
  text: string;
  label?: string;
  title?: string;
}

/** Inline-Inhalt eines Elements als Text; `span.titlenr`/`span.titlecaption`/`span.nummerierung` getrennt. */
function inlineText(nodes: readonly HtmlNode[], out: { text: string; label: string; title: string; mode: 'text' | 'label' | 'title' }): void {
  for (const node of nodes) {
    if (node.kind === 'text') {
      const decoded = decodeEntities(node.text);
      if (out.mode === 'label') out.label += decoded;
      else if (out.mode === 'title') out.title += decoded;
      else out.text += decoded;
      continue;
    }
    const tag = node.tag;
    if (tag === 'br') {
      if (out.mode === 'title') out.title += ' ';
      else if (out.mode === 'text') out.text += ' ';
      continue;
    }
    if (tag === 'wbr') continue;
    if (tag === 'img') throw new ConversionError('image-in-body', `Bild im Textkörper (${node.attributes.src ?? '?'})`);
    if (tag === 'sup' || (tag === 'span' && hasClass(node, 'sup'))) {
      const inner = { text: '', label: '', title: '', mode: 'text' as const };
      inlineText(node.children, inner);
      const raw = normalizeText(inner.text);
      const converted = toSuperscript(raw);
      const value = converted.mapped ? converted.text : raw;
      if (out.mode === 'label') out.label += value;
      else if (out.mode === 'title') out.title += value;
      else out.text += value;
      continue;
    }
    if (tag === 'span' && (hasClass(node, 'titlenr') || hasClass(node, 'nummerierung') || hasClass(node, 'olzhlr'))) {
      const previous = out.mode;
      out.mode = 'label';
      inlineText(node.children, out);
      out.mode = previous;
      continue;
    }
    if (tag === 'span' && hasClass(node, 'titlecaption')) {
      const previous = out.mode;
      out.mode = 'title';
      inlineText(node.children, out);
      out.mode = previous;
      continue;
    }
    if (INLINE.has(tag)) {
      inlineText(node.children, out);
      continue;
    }
    if (BLOCK.has(tag)) {
      // Ein Block in einem Inline-Element (`<span><div>…</div></span>`): Text bleibt, getrennt durch Leerraum.
      if (out.mode === 'text') out.text += ' ';
      inlineText(node.children, out);
      if (out.mode === 'text') out.text += ' ';
      continue;
    }
    throw new ConversionError('unsupported-element', `Element <${tag}> innerhalb eines Absatzes`);
  }
}

function inline(nodes: readonly HtmlNode[]): InlineResult {
  const out = { text: '', label: '', title: '', mode: 'text' as 'text' | 'label' | 'title' };
  inlineText(nodes, out);
  const text = normalizeText(out.text);
  const label = normalizeText(out.label);
  const title = normalizeText(out.title);
  return { text, ...(label ? { label } : {}), ...(title ? { title } : {}) };
}

/* --------------------------------------------------------------------------------- Segmente */

export interface TableCellSegment {
  header: boolean;
  text: string;
  rowspan?: number;
  colspan?: number;
}

export interface Segment {
  kind: 'text' | 'heading' | 'item' | 'table' | 'signature';
  tag: string;
  className: string;
  text?: string;
  label?: string;
  /** Gliederungszeichen, das die Seite per Stil setzt (Aufzählungsstrich) – nicht Teil des Seitentexts. */
  styledLabel?: boolean;
  title?: string;
  rows?: TableCellSegment[][];
}

/**
 * Aufzählungszeichen einer `ul`, das die Seite per Stil setzt: Punkt für `…SpiegelstrichPunkt`, sonst Strich
 * (Klassennamen der Verkündung). Es ist Gliederungszeichen, kein Wortlaut, und steht nicht im Seitentext.
 */
function styledBullet(item: ElementNode, list: ElementNode): string {
  return /Punkt/u.test(`${classOf(item)} ${classOf(list)}`) ? '•' : '–';
}

const ENUMERATION_LABEL = /^(?:\d+(?:\.\d+)*\.?|[a-z]{1,3}\)|\(\d+[a-z]?\)|\d+\)|[IVXLC]+\.|[A-Z]\.|[a-z]\.|–|-|—|•|·)$/u;

function isBlockContainer(node: ElementNode): boolean {
  return node.children.some((child) => child.kind === 'element' && (BLOCK.has(child.tag) || LIST.has(child.tag) || child.tag === 'table'));
}

function tableSegment(node: ElementNode): Segment {
  const rows: TableCellSegment[][] = [];
  const visit = (nodes: readonly HtmlNode[]): void => {
    for (const child of nodes) {
      if (child.kind !== 'element') {
        if (normalizeText(decodeEntities(child.text)) !== '') throw new ConversionError('table-irregular', 'Text außerhalb einer Tabellenzelle');
        continue;
      }
      if (['thead', 'tbody', 'tfoot', 'colgroup', 'col', 'caption'].includes(child.tag)) {
        if (child.tag === 'caption') throw new ConversionError('table-irregular', 'Tabellenüberschrift (caption) wird nicht abgebildet');
        visit(child.children);
        continue;
      }
      if (child.tag !== 'tr') throw new ConversionError('table-irregular', `Element <${child.tag}> in einer Tabelle`);
      const cells: TableCellSegment[] = [];
      for (const cell of child.children) {
        if (cell.kind !== 'element') {
          if (normalizeText(decodeEntities(cell.text)) !== '') throw new ConversionError('table-irregular', 'Text zwischen Tabellenzellen');
          continue;
        }
        if (cell.tag !== 'td' && cell.tag !== 'th') throw new ConversionError('table-irregular', `Element <${cell.tag}> in einer Tabellenzeile`);
        const parts: string[] = [];
        const collect = (nodes: readonly HtmlNode[]): void => {
          const buffer: HtmlNode[] = [];
          const flush = (): void => {
            if (buffer.length === 0) return;
            const value = inline(buffer.splice(0)).text;
            if (value) parts.push(value);
          };
          for (const inner of nodes) {
            if (inner.kind === 'element' && (BLOCK.has(inner.tag) || LIST.has(inner.tag) || ['li', 'dt', 'dd'].includes(inner.tag))) {
              flush();
              collect(inner.children);
            } else if (inner.kind === 'element' && inner.tag === 'table') {
              throw new ConversionError('table-irregular', 'Tabelle in einer Tabellenzelle');
            } else buffer.push(inner);
          }
          flush();
        };
        collect(cell.children);
        const rowspan = Number(cell.attributes.rowspan ?? '1');
        const colspan = Number(cell.attributes.colspan ?? '1');
        cells.push({ header: cell.tag === 'th', text: parts.join(' '), ...(rowspan > 1 ? { rowspan } : {}), ...(colspan > 1 ? { colspan } : {}) });
      }
      // Eine Zeile ohne Zellen trägt keinen Text; sie ist Satzrest, keine Tabellenzeile.
      if (cells.length > 0) rows.push(cells);
    }
  };
  visit(node.children);
  if (rows.length === 0) throw new ConversionError('table-irregular', 'Tabelle ohne Zeilen');
  return { kind: 'table', tag: 'table', className: classOf(node), rows };
}

/**
 * Zerlegt den Textkörper in Segmente (Leserichtung). Jeder Textknoten gehört zu genau einem Segment.
 */
export function segments(body: ElementNode): Segment[] {
  const output: Segment[] = [];
  const emitText = (nodes: readonly HtmlNode[], element: ElementNode, extra: Partial<Segment> = {}): void => {
    const result = inline(nodes);
    if (!result.text && !result.label && !result.title && !extra.label) return;
    if (HEADINGS.has(element.tag)) {
      output.push({ kind: 'heading', tag: element.tag, className: classOf(element), ...(result.label ? { label: result.label } : {}), ...(result.title ? { title: result.title, ...(result.text ? { text: result.text } : {}) } : { title: result.text }) });
      return;
    }
    const label = extra.label ?? result.label;
    output.push({
      kind: label ? 'item' : 'text',
      tag: element.tag,
      className: classOf(element),
      ...(label ? { label } : {}),
      ...(extra.styledLabel ? { styledLabel: true } : {}),
      ...(result.title ? { title: result.title } : {}),
      text: result.text,
    });
  };

  const walk = (element: ElementNode): void => {
    if (element.tag === 'table') {
      output.push(tableSegment(element));
      return;
    }
    if (element.tag === 'img') throw new ConversionError('image-in-body', `Bild im Textkörper (${element.attributes.src ?? '?'})`);
    if (element.tag === 'hr') return;
    if (element.tag === 'dl') {
      let pendingLabel: string | undefined;
      for (const child of element.children) {
        if (child.kind === 'text') {
          if (normalizeText(decodeEntities(child.text)) !== '') throw new ConversionError('unsupported-element', 'Text unmittelbar in einer Definitionsliste');
          continue;
        }
        if (child.tag === 'dt') {
          if (pendingLabel !== undefined) output.push({ kind: 'text', tag: 'dt', className: classOf(child), text: pendingLabel });
          const text = inline(child.children).text;
          pendingLabel = text === '' ? undefined : text;
          if (pendingLabel !== undefined && !ENUMERATION_LABEL.test(pendingLabel)) {
            // Kein Gliederungszeichen („An“ vor einer Empfängerliste): eigener Absatz.
            output.push({ kind: 'text', tag: 'dt', className: classOf(child), text: pendingLabel });
            pendingLabel = undefined;
          }
          continue;
        }
        if (child.tag === 'dd') {
          if (isBlockContainer(child)) {
            if (pendingLabel !== undefined) {
              output.push({ kind: 'item', tag: 'dt', className: classOf(child), label: pendingLabel, text: '' });
              pendingLabel = undefined;
            }
            walkChildren(child);
          } else {
            emitText(child.children, child, pendingLabel !== undefined ? { label: pendingLabel } : {});
            pendingLabel = undefined;
          }
          continue;
        }
        if (BLOCK.has(child.tag) || LIST.has(child.tag) || child.tag === 'table') {
          if (pendingLabel !== undefined) {
            output.push({ kind: 'text', tag: 'dt', className: classOf(element), text: pendingLabel });
            pendingLabel = undefined;
          }
          walk(child);
          continue;
        }
        throw new ConversionError('unsupported-element', `Element <${child.tag}> in einer Definitionsliste`);
      }
      if (pendingLabel !== undefined) output.push({ kind: 'text', tag: 'dt', className: classOf(element), text: pendingLabel });
      return;
    }
    if (element.tag === 'ul' || element.tag === 'ol') {
      for (const child of element.children) {
        if (child.kind === 'text') {
          if (normalizeText(decodeEntities(child.text)) !== '') throw new ConversionError('unsupported-element', 'Text unmittelbar in einer Liste');
          continue;
        }
        if (child.tag !== 'li') throw new ConversionError('unsupported-element', `Element <${child.tag}> in einer Liste`);
        if (isBlockContainer(child)) {
          // Listenglied mit Absätzen: Gliederungszeichen am ersten Absatz, die übrigen folgen als Absätze.
          const start = output.length;
          walkChildren(child);
          const first = output[start];
          if (!first || first.kind === 'table' || first.kind === 'heading') throw new ConversionError('unsupported-element', 'Listenglied, das nicht mit einem Absatz beginnt');
          if (!first.label) {
            if (element.tag !== 'ul') throw new ConversionError('unsupported-element', 'Nummerierte Liste ohne ausgeschriebene Nummern (die Zählung setzt nur der Browser)');
            output[start] = { ...first, kind: 'item', label: styledBullet(child, element), styledLabel: true };
          }
          continue;
        }
        const result = inline(child.children);
        if (result.label) {
          emitText(child.children, child);
        } else if (element.tag === 'ul') {
          // Aufzählungsstrich per Stil: Gliederungszeichen „–“ wie im Portaltext, nicht Teil des Seitentexts.
          output.push({ kind: 'item', tag: 'li', className: classOf(child), label: styledBullet(child, element), styledLabel: true, text: result.text });
        } else {
          throw new ConversionError('unsupported-element', 'Nummerierte Liste ohne ausgeschriebene Nummern (die Zählung setzt nur der Browser)');
        }
      }
      return;
    }
    if (BLOCK.has(element.tag) || element.tag === 'li' || element.tag === 'dd' || element.tag === 'dt' || element.tag === 'td') {
      if (isBlockContainer(element)) {
        walkChildren(element);
        return;
      }
      emitText(element.children, element);
      return;
    }
    if (INLINE.has(element.tag)) {
      emitText([element], element);
      return;
    }
    throw new ConversionError('unsupported-element', `Element <${element.tag}> im Textkörper`);
  };

  /** Gemischter Inhalt: Inline-Folgen zwischen Blöcken werden eigene Segmente. */
  const walkChildren = (element: ElementNode): void => {
    let buffer: HtmlNode[] = [];
    const flush = (): void => {
      if (buffer.length > 0) emitText(buffer, element);
      buffer = [];
    };
    for (const child of element.children) {
      if (child.kind === 'element' && (BLOCK.has(child.tag) || LIST.has(child.tag) || child.tag === 'table' || child.tag === 'hr' || child.tag === 'img')) {
        flush();
        walk(child);
      } else buffer.push(child);
    }
    flush();
  };

  walkChildren(body);
  return output;
}

/** Seitentext: alle Textknoten des Körpers in Leserichtung, mit derselben Inline-Normalisierung. */
export function pageText(body: ElementNode): string {
  const parts: string[] = [];
  const visit = (nodes: readonly HtmlNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'text') parts.push(decodeEntities(node.text));
      else if (node.tag === 'sup' || (node.tag === 'span' && hasClass(node, 'sup'))) {
        const raw = normalizeText(inline(node.children).text);
        const converted = toSuperscript(raw);
        parts.push(converted.mapped ? converted.text : raw);
      } else visit(node.children);
    }
  };
  visit(body.children);
  return parts.join(' ');
}

/* -------------------------------------------------------------------------------------- Kopf */

export interface GazetteHead {
  gliederungsnummer?: string;
  title: string;
  /** Erlassstelle („Bekanntmachung des Bayerischen Staatsministeriums …“). */
  issuer?: string;
  /** Datumszeile („vom 25. Februar 2021, Az. 11-H 1007-1/8“). */
  dateLine?: string;
}

export const GLNR = /^\d[\dA-Za-z.\-–/]*[-–][A-ZÄÖÜ][A-Za-zÄÖÜ]{0,4}(?:\s*[,;]\s*\d[\dA-Za-z.\-–/]*[-–][A-ZÄÖÜ][A-Za-zÄÖÜ]{0,4})*$/u;
export const DATE_LINE = /^[Vv]om\s+\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4}\b/u;
export const ISSUER = /^(?:Gemeinsame\s+)?(?:Bekanntmachung(?:en)?|Richtlinien?|Schreiben|Verwaltungsvorschrift(?:en)?|Anordnung|Erlass)\s+(?:des|der)\s/u;

/**
 * Kopf der Verkündung: alles vor der Datumszeile. Titel ist, was weder Gliederungsnummer noch Erlassstelle
 * ist; die Erlassstelle ist „Bekanntmachung des/der …“ (ein Titel „Bekanntmachung über …“ bleibt Titel).
 */
export function splitHead(all: readonly Segment[]): { head: GazetteHead; body: Segment[]; headSegments: Segment[] } {
  const dateAt = all.findIndex((segment, index) => index < 8 && segment.kind !== 'table' && DATE_LINE.test(segment.text ?? segment.title ?? ''));
  if (dateAt < 0) throw new ConversionError('head-unreadable', 'Keine Datumszeile („vom …“) im Kopf der Verkündung');
  const headSegments = all.slice(0, dateAt + 1);
  const titleParts: string[] = [];
  let gliederungsnummer: string | undefined;
  let issuer: string | undefined;
  for (const segment of headSegments.slice(0, -1)) {
    const value = [segment.label, segment.title, segment.text].filter(Boolean).join(' ').trim();
    if (value === '') continue;
    if (gliederungsnummer === undefined && titleParts.length === 0 && issuer === undefined && GLNR.test(value)) {
      gliederungsnummer = value;
      continue;
    }
    if (issuer === undefined && ISSUER.test(value)) {
      issuer = value;
      continue;
    }
    titleParts.push(value);
  }
  if (titleParts.length === 0) throw new ConversionError('head-unreadable', 'Kein Titel im Kopf der Verkündung');
  const dateSegment = headSegments.at(-1)!;
  return {
    head: {
      ...(gliederungsnummer ? { gliederungsnummer } : {}),
      title: titleParts.join(' '),
      ...(issuer ? { issuer } : {}),
      dateLine: [dateSegment.label, dateSegment.title, dateSegment.text].filter(Boolean).join(' ').trim(),
    },
    body: all.slice(dateAt + 1),
    headSegments,
  };
}

/* -------------------------------------------------------------------------------------- Körper */

const DECIMAL = /^(\d+(?:\.\d+)*)\.?$/u;
const SIGNATURE_ROLE = /^(?:Ministerialdirektor(?:in)?|Ministerialdirigent(?:in)?|Staatsminister(?:in)?|Staatssekretär(?:in)?|Ministerpräsident(?:in)?|Präsident(?:in)?|Leitende[rn]?\s+Ministerialr[aä]t(?:in)?|Ministerialr[aä]t(?:in)?|Amtschef(?:in)?|Generalsekretär(?:in)?|Vorsitzende[rn]?)\b/u;

export interface BodyResult {
  blocks: NormBodyBlock[];
  /** Blöcke, deren Gliederungszeichen nur per Stil gesetzt ist (nicht im Seitentext). */
  styledBlocks: ReadonlySet<NormBodyBlock>;
  /** Die dezimale Gliederung ist aufgegangen und verschachtelt. */
  nested: boolean;
  /** Gliederungszeichen, die nur per Stil gesetzt sind (nicht im Seitentext). */
  styledLabels: number;
  notes: string[];
}

function decimalParts(label: string | undefined): number[] | undefined {
  const match = label ? DECIMAL.exec(label) : null;
  return match ? match[1]!.split('.').map(Number) : undefined;
}

/** Geht die dezimale Nummernfolge lückenlos auf? Jede Nummer: erstes Kind oder Nachfolger einer offenen Ebene. */
export function decimalSequenceConsistent(labels: readonly number[][]): boolean {
  const open: number[] = [];
  for (const parts of labels) {
    const depth = parts.length;
    if (depth > open.length + 1) return false;
    const prefixOk = parts.slice(0, -1).every((value, index) => open[index] === value);
    if (!prefixOk) return false;
    const last = parts.at(-1)!;
    const expected = depth === open.length + 1 ? 1 : open[depth - 1]! + 1;
    if (last !== expected) return false;
    open.length = depth;
    open[depth - 1] = last;
  }
  return true;
}

function tableBlock(segment: Segment): NormBodyBlock {
  const rows = segment.rows!.map((row) => ({
    type: 'tableRow' as const,
    children: row.map((cell) => ({ type: (cell.header ? 'tableHeaderCell' : 'tableCell') as NormBodyBlock['type'], text: cell.text, ...(cell.rowspan ? { rowspan: cell.rowspan } : {}), ...(cell.colspan ? { colspan: cell.colspan } : {}) })),
  }));
  const table: NormBodyBlock = { type: 'table', children: rows };
  try {
    parseBodyBlocks([table], 'tabelle');
  } catch (error) {
    throw new ConversionError('table-irregular', `Tabelle ohne schlüssiges Raster: ${(error as Error).message}`);
  }
  return table;
}

function leafBlock(segment: Segment): NormBodyBlock {
  switch (segment.kind) {
    case 'table':
      return tableBlock(segment);
    case 'signature':
      return { type: 'signature', ...(segment.text ? { text: segment.text } : {}), ...(segment.title ? { title: segment.title } : {}) };
    case 'heading':
      return segment.label
        ? { type: 'heading', title: [segment.label, segment.title, segment.text].filter(Boolean).join(' ') }
        : { type: 'heading', title: [segment.title, segment.text].filter(Boolean).join(' ') };
    case 'item':
      return { type: 'item', label: segment.label!, ...(segment.title ? { title: segment.title } : {}), ...(segment.text ? { text: segment.text } : {}) };
    default:
      return { type: 'paragraphText', text: segment.text! };
  }
}

/** Unterschrift am Ende: Name und Amtsbezeichnung (BayMBl.: `p.MBLAusfertigerName`/`…Zeile2`). */
function markSignature(body: Segment[]): Segment[] {
  const output = [...body];
  const nameAt = output.findIndex((segment) => /MBLAusfertigerName|AbschlussMinister/u.test(segment.className));
  if (nameAt >= 0) {
    const name = output[nameAt]!;
    const role = output[nameAt + 1];
    const hasRole = role !== undefined && /MBLAusfertigerZeile|AbschlussBayerischesStaatsministerium/u.test(role.className);
    output.splice(nameAt, hasRole ? 2 : 1, { kind: 'signature', tag: name.tag, className: name.className, text: name.text ?? '', ...(hasRole ? { title: role!.text ?? '' } : {}) });
    return output;
  }
  // Amtsblätter: letzte zwei Absätze „Vorname Name“ + Amtsbezeichnung.
  for (let index = output.length - 1; index >= 1; index -= 1) {
    const role = output[index]!;
    const name = output[index - 1]!;
    if (role.kind !== 'text' || name.kind !== 'text') continue;
    if (!SIGNATURE_ROLE.test(role.text ?? '') || (role.text ?? '').length > 60) continue;
    if (!/^(?:Dr\.\s+|Prof\.\s+)*[A-ZÄÖÜ][\p{L}.-]+(?:\s+[A-ZÄÖÜ][\p{L}.-]+){0,3}$/u.test(name.text ?? '')) continue;
    // Nur am Ende des Körpers (danach höchstens Ort/Datum).
    if (output.slice(index + 1).some((segment) => segment.kind !== 'text' || (segment.text ?? '').length > 60)) continue;
    output.splice(index - 1, 2, { kind: 'signature', tag: name.tag, className: name.className, text: name.text ?? '', title: role.text ?? '' });
    break;
  }
  return output;
}

/**
 * Körper aus Segmenten. Verschachtelt wird nur die dezimale Gliederung, und nur wenn sie aufgeht: Eine
 * nummerierte Überschrift (`h3` mit `1.`) wird Abschnitt (`section`), ein nummerierter Absatz Glied (`item`);
 * nicht nummerierte Absätze, Buchstabenglieder und Tabellen gehören zum zuletzt geöffneten Glied.
 */
export function buildBody(body: readonly Segment[]): BodyResult {
  const segmentsWithSignature = markSignature([...body]);
  const notes: string[] = [];
  const styledLabels = segmentsWithSignature.filter((segment) => segment.styledLabel).length;
  const numbered = segmentsWithSignature.filter((segment) => (segment.kind === 'item' || segment.kind === 'heading') && decimalParts(segment.label));
  const sequence = numbered.map((segment) => decimalParts(segment.label)!);
  const nest = sequence.length > 0 && decimalSequenceConsistent(sequence);
  if (sequence.length > 0 && !nest) notes.push(`Dezimale Gliederung nicht lückenlos (${numbered.slice(0, 12).map((segment) => segment.label).join(', ')}${numbered.length > 12 ? ', …' : ''}); Körper bleibt flach`);

  const blocks: NormBodyBlock[] = [];
  const styledBlocks = new Set<NormBodyBlock>();
  const leaf = (segment: Segment): NormBodyBlock => {
    const block = leafBlock(segment);
    if (segment.styledLabel) styledBlocks.add(block);
    return block;
  };
  if (!nest) {
    for (const segment of segmentsWithSignature) blocks.push(leaf(segment));
    return { blocks, styledBlocks, nested: false, styledLabels, notes };
  }
  const stack: Array<{ depth: number; block: NormBodyBlock }> = [];
  const target = (): NormBodyBlock[] => {
    const top = stack.at(-1);
    if (!top) return blocks;
    top.block.children ??= [];
    return top.block.children;
  };
  for (const segment of segmentsWithSignature) {
    const parts = (segment.kind === 'item' || segment.kind === 'heading') ? decimalParts(segment.label) : undefined;
    if (segment.kind === 'signature') {
      // Die Unterschrift steht nach der Gliederung, nie in einem Glied.
      stack.length = 0;
      blocks.push(leaf(segment));
      continue;
    }
    if (!parts) {
      target().push(leaf(segment));
      continue;
    }
    while (stack.length > 0 && stack.at(-1)!.depth >= parts.length) stack.pop();
    const block: NormBodyBlock = segment.kind === 'heading'
      ? { type: 'section', label: segment.label!, ...(segment.title ? { title: segment.title } : {}), ...(segment.text ? { text: segment.text } : {}), children: [] }
      : { type: 'item', label: segment.label!, ...(segment.title ? { title: segment.title } : {}), ...(segment.text ? { text: segment.text } : {}) };
    target().push(block);
    stack.push({ depth: parts.length, block });
  }
  return { blocks, styledBlocks, nested: true, styledLabels, notes };
}

/* ---------------------------------------------------------------------------- Textintegrität */

export interface CanonicalParts {
  head: GazetteHead;
  headSegments: readonly Segment[];
  blocks: readonly NormBodyBlock[];
  /** Blöcke mit Gliederungszeichen nur per Stil; ihr Zeichen fehlt im Seitentext. */
  styledBlocks?: ReadonlySet<NormBodyBlock>;
}

/** Kanonischer Text in Leserichtung: Kopfsegmente, dann Körper (Gliederungszeichen, Überschrift, Text). */
export function canonicalText(parts: CanonicalParts, options: { skipStyledLabels?: boolean } = {}): string {
  const styledBlocks = parts.styledBlocks ?? new Set<NormBodyBlock>();
  const out: string[] = [];
  for (const segment of parts.headSegments) out.push(...[segment.label, segment.title, segment.text].filter((value): value is string => Boolean(value)));
  const visit = (blocks: readonly NormBodyBlock[]): void => {
    for (const block of blocks) {
      const styled = options.skipStyledLabels === true && styledBlocks.has(block);
      if (block.type === 'signature') {
        if (block.text) out.push(block.text);
        if (block.title) out.push(block.title);
        continue;
      }
      if (block.type === 'heading') {
        if (block.title) out.push(block.title);
        if (block.text) out.push(block.text);
        continue;
      }
      if (block.label && !styled) out.push(block.label);
      if (block.title) out.push(block.title);
      if (block.text) out.push(block.text);
      if (block.children) visit(block.children);
    }
  };
  visit(parts.blocks);
  return out.join(' ');
}

const compact = (value: string): string => normalizeText(value).replace(/\s+/gu, '');

export interface IntegrityResult {
  ok: boolean;
  pageCharacters: number;
  canonicalCharacters: number;
  /** Erste Abweichung mit Umgebung (nur bei `ok: false`). */
  detail?: string;
}

/**
 * Textintegrität: Seitentext und kanonischer Text müssen ohne Leerraum zeichengleich sein – kein Zeichen
 * verloren, keines verdoppelt, keines umgestellt. `styledLabels` werden aus dem kanonischen Text genommen,
 * weil die Seite sie nicht als Text führt; die Seite liefert sie per Stil.
 */
export function checkIntegrity(page: string, canonical: string): IntegrityResult {
  const left = compact(page);
  const right = compact(canonical);
  if (left === right) return { ok: true, pageCharacters: left.length, canonicalCharacters: right.length };
  let at = 0;
  while (at < left.length && left[at] === right[at]) at += 1;
  return {
    ok: false,
    pageCharacters: left.length,
    canonicalCharacters: right.length,
    detail: `Abweichung bei Zeichen ${at}: Seite „…${left.slice(Math.max(0, at - 40), at + 40)}…“, kanonisch „…${right.slice(Math.max(0, at - 40), at + 40)}…“`,
  };
}

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/* ------------------------------------------------------------------------------ Gesamtumsetzung */

export interface ConvertedGazette {
  head: GazetteHead;
  blocks: NormBodyBlock[];
  nested: boolean;
  notes: string[];
  /** Seitentext (normalisiert) und sein Fingerabdruck – Ausgangstext-Fingerabdruck der Quelle. */
  pageText: string;
  pageTextSha256: string;
  integrity: IntegrityResult;
  styledLabels: number;
}

/** Verkündungsseite → Kopf + Körper, mit Textintegritätsprüfung. Wirft `ConversionError`, nie still. */
export function convertGazetteHtml(html: string): ConvertedGazette {
  const body = textBody(html);
  if (!body) throw new ConversionError('empty-body', 'Seite ohne Textkörper (article#documentbox > div.text_html)');
  const all = segments(body);
  if (all.length === 0) throw new ConversionError('empty-body', 'Textkörper ohne Text');
  const { head, body: bodySegments, headSegments } = splitHead(all);
  if (bodySegments.length === 0) throw new ConversionError('empty-body', 'Verkündung ohne Text nach dem Kopf');
  const built = buildBody(bodySegments);
  const page = normalizeText(pageText(body));
  const canonical = canonicalText({ head, headSegments, blocks: built.blocks, styledBlocks: built.styledBlocks }, { skipStyledLabels: true });
  const integrity = checkIntegrity(page, canonical);
  if (!integrity.ok) throw new ConversionError('integrity-mismatch', `Textintegrität verletzt: ${integrity.detail}`);
  try {
    parseBodyBlocks(built.blocks, 'body');
  } catch (error) {
    throw new ConversionError('schema', `Blockmodell ungültig: ${(error as Error).message}`);
  }
  return { head, blocks: built.blocks, nested: built.nested, notes: built.notes, pageText: page, pageTextSha256: sha256(page), integrity, styledLabels: built.styledLabels };
}
