/**
 * Gemeinsames Fließtext- und Tabellenmodell beider BAYERN.RECHT-DTDs.
 *
 * Die beiden Dokumentmodelle `byrecht-norm` und `byrecht-vv` teilen nach der Quellen-Discovery
 * „fast nichts außer dem Tabellenvokabular und `verweis.norm`“. Tatsächlich teilen sie den ganzen
 * Fließtextvorrat – `p`, `br`, `span`, `sup`, `ul`/`li`/`symbol`, `table`/`tr`/`td`/`th` und die
 * Verweiselemente. Dieses Modul deckt genau diesen gemeinsamen Teil ab; die unterschiedlichen
 * Gerüste (Gliederung, Vorschrift, Anlage, Metadaten) bauen die beiden Frontends `norm.ts` und
 * `vv.ts` darauf auf.
 *
 * Ein einziger Unterschied ist dialektabhängig und deshalb hier verankert:
 *
 *   `byrecht-norm`  Satznummern stehen als eigenes Element `<satz.nr id="xx">1</satz.nr>` **vor** dem
 *                   Satz; `<sup>` ist echte Hochstellung („m<sup>3</sup>“, belegt in BayKVzKG).
 *   `byrecht-vv`    Es gibt kein `satz.nr`; die Satzzählung steckt in `<sup>`. Ob ein `<sup>` eine
 *                   Satznummer oder eine echte Hochstellung trägt, markiert das Modell nicht
 *                   (offener Punkt 7 der Discovery). Der Parser entscheidet strukturell: eine reine
 *                   Zahl am Anfang eines Textlaufs oder nach Leerraum ist eine Satznummer, alles
 *                   andere wird als Hochstellung übernommen **und als Befund gemeldet** – nie still.
 *
 * Satznummern und Hochstellungen werden beide als Unicode-Hochzahlen in den Text geschrieben
 * (`¹Die Abmarkung …`). Damit bleibt die Information erhalten, ohne dass das Blockmodell um eine
 * Inline-Auszeichnung erweitert werden müsste, die es nicht kennt.
 */
import type { NormBodyAsset, NormBodyBlock, TableHeaderScope } from '@landesrecht/legal-core/lib/schema.ts';
import { ImportPipelineError, type ImportFinding } from '@landesrecht/importer-common/pipeline.ts';

import { attribute, elementChildren, isElement, type XmlElement, type XmlNode } from './xml.ts';

export type BayernRechtDialect = 'byrecht-norm' | 'byrecht-vv';

/**
 * `throw` (Vorgabe): Eine unbekannte Struktur bricht den Lauf mit `ImportPipelineError` ab.
 * `report`: Der Inhalt wird als Text erhalten und der Elementname erscheint als `error`-Befund –
 * der Aufrufer macht daraus einen Review-Fall (`unknown-structure`). Stilles Weglassen gibt es nicht.
 */
export type UnknownPolicy = 'throw' | 'report';

/**
 * Zierbilder und Logos sind kein Normbestandteil. Erkannt wird nur die ausdrückliche Beschreibung (`Desc`);
 * Wappen, Siegel und Zeichen bleiben übernommen, weil sie in Normen regelmäßig selbst Regelungsgegenstand sind.
 */
export const DECORATIVE_DESCRIPTION = /\b(?:Logo|Signet|Zierleiste|Zierbild|Dekoration)\b/iu;

/**
 * Eine Abbildung aus `<graphic>`. Liegt die Bilddatei lesbar im Exportpaket, entsteht an der Aufrufstelle ein
 * `figure`-Block mit Asset-Referenz (die Datei selbst wird eigenes, inhaltsadressiertes Asset); die
 * Bildbeschreibung ist Alternativtext, nie Normtext. Ohne Datei oder bei Zierbildern bleibt es beim Befund.
 */
export interface GraphicReference {
  /** `@FileRef`, wie im XML notiert (teils mit Präfix `resources/`). */
  fileRef: string;
  /** Dateiname ohne Präfix – so steht er als Beilage im Paketmanifest. */
  fileName: string;
  fileFormat?: string;
  description?: string;
  /** Als `figure`-Block übernommen (Beilage im Paket vorhanden). */
  transferred?: boolean;
  /** Nicht übernommen, weil die Beschreibung ein Logo oder Zierbild ausweist (kein Normbestandteil). */
  decorative?: boolean;
}

/** Ein Verweis aus `<a href="resources/…">` auf eine Datei des Exportpakets. */
export interface ResourceLink {
  href: string;
  fileName: string;
  text: string;
}

/** Ein Zitat aus `verweis.norm`: `@ersatz` ist die Ziel-Dokument-ID im Herkunftssystem. */
export interface CitationTarget {
  target: string;
  text: string;
  element: 'v.norm' | 'v.abk';
}

export interface ParseContext {
  dialect: BayernRechtDialect;
  unknown: UnknownPolicy;
  findings: ImportFinding[];
  citations: CitationTarget[];
  graphics: GraphicReference[];
  resourceLinks: ResourceLink[];
  /**
   * Bildbeilagen des Pakets nach Dateiname (klein geschrieben): Aus `<graphic>` wird an Ort und Stelle ein
   * `figure`-Block mit der Referenz auf das Asset. Ohne Beilage (Parser ohne Paket) bleibt es beim Befund.
   */
  figureAssets?: ReadonlyMap<string, NormBodyAsset>;
  /**
   * Baut `<Aenderungsinhalt>` (zitierter Normtext eines Änderungsbefehls). Das Frontend `norm.ts`
   * setzt den Haken, weil der Aufbau den Vorschriftenbaum und die Adressbuchführung braucht; der
   * Fließtext kennt beides nicht, trifft das Element aber an beliebiger Stelle (auch in `<li>`).
   */
  quotedProvision?: (element: XmlElement, ctx: ParseContext, where: string) => NormBodyBlock[];
  /** Namen aller unbekannt gebliebenen Elemente – erscheinen namentlich im Befund (Fehler). */
  unknownElements: Set<string>;
  /** Namen unbekannter Attribute – reine Typografie, deshalb Warnung statt Fehler. */
  unknownAttributes: Set<string>;
  /**
   * Überschriften tragen ihre Struktur im Zeilenumbruch des Quelltextes: `<gliederung.titel><p>1. Teil
   * ⏎ Allgemeine Vorschriften</p>` ist Gliederungszeichen **und** Überschrift. Im Fließtext ist
   * derselbe Umbruch bloße Einrückung. Deshalb wird er nur beim Lesen von Überschriften erhalten.
   */
  preserveLines: boolean;
  counters: {
    footnotes: number;
    /** Fußnoten ohne eigenes Aufrufzeichen (`<fn.text />`). */
    unmarkedFootnotes: number;
    sentenceMarkers: number;
    superscripts: number;
    tables: number;
    ambiguousSuperscripts: number;
    quotedProvisions: number;
    /** Gliederungen unterhalb der zweiten Ebene (Verwaltungsvorschriften) und ihre größte Tiefe. */
    deepSections: number;
    maxSectionDepth: number;
  };
}

export function createParseContext(dialect: BayernRechtDialect, unknown: UnknownPolicy = 'throw'): ParseContext {
  return {
    dialect,
    unknown,
    findings: [],
    citations: [],
    graphics: [],
    resourceLinks: [],
    unknownElements: new Set<string>(),
    unknownAttributes: new Set<string>(),
    preserveLines: false,
    counters: { footnotes: 0, unmarkedFootnotes: 0, sentenceMarkers: 0, superscripts: 0, tables: 0, ambiguousSuperscripts: 0, quotedProvisions: 0, deepSections: 0, maxSectionDepth: 0 },
  };
}

export function addFinding(ctx: ParseContext, severity: ImportFinding['severity'], code: string, message: string): void {
  const existing = ctx.findings.find((entry) => entry.code === code && entry.message === message);
  if (!existing) ctx.findings.push({ severity, code, message });
}

/**
 * Fail-closed-Kern: Ein Element, das der Parser nicht kennt, wird entweder zum Abbruch oder zum
 * benannten Befund – nie übergangen. Im Meldemodus bleibt sein Textinhalt erhalten.
 */
export function reportUnknownElement(ctx: ParseContext, element: XmlElement, where: string): void {
  ctx.unknownElements.add(element.name);
  const message = `Unbekanntes Element <${element.name}> in ${where} (Zeile ${element.line})`;
  if (ctx.unknown === 'throw') throw new ImportPipelineError('parse-source-format', message);
  addFinding(ctx, 'error', 'unknown-element', message);
}

/** Unbekannte Attribute tragen in beiden DTDs nur Typografie; sie werden gemeldet, nicht verworfen. */
export function checkAttributes(ctx: ParseContext, element: XmlElement, allowed: readonly string[], where: string): void {
  for (const name of Object.keys(element.attributes)) {
    if (allowed.includes(name)) continue;
    ctx.unknownAttributes.add(`${element.name}@${name}`);
    addFinding(ctx, 'warning', 'unknown-attribute', `Unbekanntes Attribut ${element.name}@${name} in ${where} (Zeile ${element.line})`);
  }
}

/* ------------------------------------------------------------------ Textnormalisierung */

/** Platzhalter für einen harten Umbruch (`<br/>`, Absatzgrenze in Zellen); überlebt die Leerraumglättung. */
const HARD_BREAK = '\u0001';
/**
 * Weiche Wortgrenze: an der Stelle eines Elements, das im Text nichts hinterlässt, aber Wörter trennt
 * (Fußnotenaufruf ohne Zeichen, `DM<fn.call>…</fn.call>nicht`). `normalizeInline` macht daraus ein
 * Leerzeichen, wenn links und rechts Wortzeichen stehen, sonst nichts – so entsteht weder „DMnicht“ noch
 * „DM .“, und es wird kein Zeichen erfunden.
 */
const SOFT_BOUNDARY = '\u0002';

const SUPERSCRIPT_CHARS: Readonly<Record<string, string>> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  n: 'ⁿ', i: 'ⁱ',
  '¹': '¹', '²': '²', '³': '³',
};

/** Hochstellung als Unicode. `mapped: false`, wenn ein Zeichen keine Hochstellung besitzt. */
export function toSuperscript(value: string): { text: string; mapped: boolean } {
  const trimmed = value.trim();
  let mapped = trimmed !== '';
  let text = '';
  for (const character of trimmed) {
    const superscript = SUPERSCRIPT_CHARS[character];
    if (superscript === undefined) {
      mapped = false;
      text += character;
    } else {
      text += superscript;
    }
  }
  return { text, mapped };
}

/** Leerraum glätten, harte Umbrüche als Zeilenumbruch erhalten, Zeilen einzeln trimmen. */
export function normalizeInline(raw: string): string {
  return raw
    .replace(/(?<=[\p{L}\p{Nd}])\u0002+(?=[\p{L}\p{Nd}])/gu, ' ')
    .replace(/\u0002/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/ ?\u0001 ?/gu, '\n')
    .split('\n')
    .map((entry) => entry.trim())
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .replace(/^\n+|\n+$/gu, '')
    .trim();
}

interface InlineBuffer {
  text: string;
  footnotes: NormBodyBlock[];
  /** Textlänge direkt nach dem zuletzt angehängten Fußnotenzeichen (Erkennung unmittelbar folgender Aufrufe). */
  footnoteMarkerEnd?: number;
}

function newBuffer(): InlineBuffer {
  return { text: '', footnotes: [] };
}

/**
 * Ein Fußnotenzeichen verschmilzt nie mit einer unmittelbar folgenden Ziffer: Aus „1“ und „¹“ (BayVV_7912_0_U_108
 * wiederholt das Zeichen als `<sup>`) oder aus zwei Aufrufen „3“ und „4“ würde sonst eine Zahl, die die Quelle nicht
 * nennt. Getrennt wird mit einem Leerzeichen – nur zwischen zwei Wortzeichen (auch Hochzahlen), nie mit einem Zeichen.
 */
function separateFromFootnoteMarker(buffer: InlineBuffer, next: string): void {
  if (buffer.footnoteMarkerEnd === buffer.text.length && /[\p{L}\p{N}]$/u.test(buffer.text) && /^\p{N}/u.test(next)) buffer.text += ' ';
}

/**
 * Fundstellenwert eines Verkündungsblatts. Das GVBl. zählt Seiten (`S=318`), das BayMBl. zählt
 * Bekanntmachungen (`Nr=277`, belegt an BayVV_631_J_10511). Beide Präfixe werden abgetrennt und die
 * Zählart festgehalten; eine unbekannte Schreibweise bleibt unverändert und wird gemeldet.
 */
export function normalizeGazetteNumber(raw: string | undefined, ctx: ParseContext, where: string): { value?: string; kind?: 'seite' | 'nummer' } {
  const value = (raw ?? '').replace(/\s+/gu, ' ').trim();
  if (value === '') return {};
  const page = /^S\s*=\s*(.+)$/u.exec(value);
  if (page) return { value: page[1]!.trim(), kind: 'seite' };
  const number = /^Nr\s*=\s*(.+)$/u.exec(value);
  if (number) return { value: number[1]!.trim(), kind: 'nummer' };
  addFinding(ctx, 'info', 'gazette-page-format', `Fundstellenwert ${JSON.stringify(value)} in ${where} trägt weder „S=“ noch „Nr=“ und bleibt unverändert`);
  return { value };
}

/* ------------------------------------------------------------------ Inline-Inhalt */

const INLINE_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  br: [],
  hr: ['class', 'style'],
  a: ['href', 'target', 'class', 'style', 'id', 'name', 'title'],
  graphic: ['FileRef', 'FileFormat', 'Desc', 'class', 'style'],
  span: ['class', 'style'],
  sup: ['class', 'style'],
  sub: ['class', 'style'],
  'satz.nr': ['id'],
  // `@role="nichtamtlich"` kennzeichnet eine redaktionelle Anmerkung (belegt an BayBwEgauquVertr).
  'fn.call': ['id', 'role'],
  'fn.text': [],
  'fn.def': [],
  'verweis.norm': ['id', 'anfrage'],
  'v.norm': ['ersatz'],
  'v.abk': ['ersatz'],
  symbol: ['id'],
  p: ['typ', 'style', 'class', 'align', 'ausrichtung'],
  ul: ['class', 'style'],
  li: ['class', 'style'],
};

function isInlineName(name: string): boolean {
  return name === 'br' || name === 'hr' || name === 'span' || name === 'sup' || name === 'sub'
    || name === 'a' || name === 'graphic'
    || name === 'satz.nr' || name === 'fn.call' || name === 'verweis.norm' || name === 'v.norm' || name === 'v.abk';
}

/** Dateiname einer Paketreferenz: `resources/BayBoFiV_…gif` und `BayBoFiV_…gif` meinen dieselbe Datei. */
export function packageFileName(reference: string): string {
  const trimmed = reference.trim().replace(/^\.?\//u, '');
  const withoutPrefix = trimmed.replace(/^resources\//u, '');
  const slash = withoutPrefix.lastIndexOf('/');
  return slash < 0 ? withoutPrefix : withoutPrefix.slice(slash + 1);
}

/**
 * Steht an dieser Stelle ein Satzanfang? Leerraum, Textanfang und satzschließende Zeichen zählen
 * dazu – die Quelle schreibt die Satznummer teils unmittelbar hinter den Punkt
 * (`… nicht verwendet werden.<sup> 5</sup>Änderungsvorschriften …`, belegt in BayVwV312180).
 * Ein Buchstabe oder eine Ziffer davor spricht dagegen (`m<sup>2</sup>`, `50.000 m<sup>3</sup>`).
 */
function endsOpen(text: string): boolean {
  if (text === '') return true;
  const last = text.charAt(text.length - 1);
  return last === ' ' || last === HARD_BREAK || last === '\n' || last === '\t'
    || last === '.' || last === '!' || last === '?' || last === ';' || last === ':'
    || last === '“' || last === '”' || last === '"' || last === ')';
}

function appendSuperscript(buffer: InlineBuffer, element: XmlElement, ctx: ParseContext, where: string): void {
  const raw = rawInlineText(element);
  // `In<sup> </sup>allen` (BayVV_2030_2_3_G_15657): Eine Hochstellung aus reinem Leerraum ist keine
  // Hochstellung, sondern die Wortgrenze. Sie zu verwerfen klebte die Wörter zusammen („Inallen“).
  if (raw.trim() === '') {
    if (raw !== '') buffer.text += ' ';
    return;
  }
  const { text, mapped } = toSuperscript(raw);
  const numeric = /^\d+$/u.test(raw.trim());
  if (ctx.dialect === 'byrecht-vv') {
    if (numeric && endsOpen(buffer.text)) {
      ctx.counters.sentenceMarkers += 1;
    } else {
      ctx.counters.ambiguousSuperscripts += 1;
      addFinding(ctx, 'warning', 'vv-superscript-ambiguous',
        `<sup>${raw.trim()}</sup> in ${where} (Zeile ${element.line}) steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznummer gezählt`);
    }
  }
  ctx.counters.superscripts += 1;
  if (!mapped) {
    addFinding(ctx, 'info', 'superscript-unmapped',
      `Hochstellung ${JSON.stringify(raw.trim())} in ${where} (Zeile ${element.line}) hat keine Unicode-Entsprechung und bleibt unverändert`);
  }
  separateFromFootnoteMarker(buffer, text);
  buffer.text += text;
}

function appendSentenceNumber(buffer: InlineBuffer, element: XmlElement, ctx: ParseContext, where: string): void {
  const raw = rawInlineText(element).trim();
  ctx.counters.sentenceMarkers += 1;
  if (!/^\d+$/u.test(raw)) {
    addFinding(ctx, 'warning', 'sentence-number-not-numeric',
      `Satznummer ${JSON.stringify(raw)} in ${where} (Zeile ${element.line}) ist keine Zahl und wird unverändert übernommen`);
    separateFromFootnoteMarker(buffer, raw);
    buffer.text += raw;
    return;
  }
  const superscript = toSuperscript(raw).text;
  separateFromFootnoteMarker(buffer, superscript);
  buffer.text += superscript;
}

function appendFootnote(buffer: InlineBuffer, element: XmlElement, ctx: ParseContext, where: string): void {
  checkAttributes(ctx, element, INLINE_ATTRIBUTES['fn.call']!, where);
  ctx.counters.footnotes += 1;
  const ordinal = ctx.counters.footnotes;
  const markerElement = element.children.find((node): node is XmlElement => isElement(node) && node.name === 'fn.text');
  const definitionElement = element.children.find((node): node is XmlElement => isElement(node) && node.name === 'fn.def');
  for (const child of elementChildren(element)) {
    if (child.name !== 'fn.text' && child.name !== 'fn.def') reportUnknownElement(ctx, child, `${where} → <fn.call>`);
  }
  const marker = markerElement ? normalizeInline(rawInlineText(markerElement)) : '';
  const definitionBuffer = newBuffer();
  if (definitionElement) for (const child of definitionElement.children) appendInline(child, definitionBuffer, ctx, `${where} → Fußnotentext`);
  const definition = normalizeInline(definitionBuffer.text);

  let label = marker;
  if (label === '') {
    // `<fn.text />` kommt vor (BayVerf, Art. 13). Ein Fußnotenzeichen ist im Zielmodell Pflicht;
    // deshalb eine mechanische, als solche erkennbare Ersatzmarke plus Befund – keine stille Erfindung.
    label = `Fn ${ordinal}`;
    ctx.counters.unmarkedFootnotes += 1;
    addFinding(ctx, 'warning', 'footnote-marker-missing',
      `Fußnote ohne Aufrufzeichen (<fn.text/>) in ${where} (Zeile ${element.line}); ersatzweise als „${label}“ geführt`);
    buffer.text += SOFT_BOUNDARY;
  } else {
    // Folgt ein Aufruf unmittelbar auf einen anderen („Selbstpflege<fn.call>3</fn.call><fn.call>4</fn.call>“),
    // bleiben die Zeichen getrennt: sonst stünde „Selbstpflege34“ da – eine Zahl, die die Quelle nicht nennt.
    separateFromFootnoteMarker(buffer, marker);
    buffer.text += marker;
    buffer.footnoteMarkerEnd = buffer.text.length;
  }
  if (definition === '') {
    addFinding(ctx, 'warning', 'footnote-without-text',
      `Fußnote ${JSON.stringify(label)} in ${where} (Zeile ${element.line}) hat keinen Text`);
    return;
  }
  buffer.footnotes.push({ type: 'footnote', label, text: definition });
  buffer.footnotes.push(...definitionBuffer.footnotes);
}

function recordCitation(element: XmlElement, ctx: ParseContext): void {
  const target = attribute(element, 'ersatz');
  if (!target) return;
  ctx.citations.push({ target, text: normalizeInline(rawInlineText(element)), element: element.name as 'v.norm' | 'v.abk' });
}

/** Reiner Textinhalt eines Inline-Teilbaums, ohne Fußnoten- und Hochstellungsbehandlung. */
function rawInlineText(node: XmlNode): string {
  if (node.kind === 'text') return node.value;
  return node.children.map(rawInlineText).join('');
}

export function appendInline(node: XmlNode, buffer: InlineBuffer, ctx: ParseContext, where: string): void {
  if (node.kind === 'text') {
    separateFromFootnoteMarker(buffer, node.value);
    buffer.text += ctx.preserveLines ? node.value.replace(/\r\n|\r|\n/gu, HARD_BREAK) : node.value;
    return;
  }
  const allowed = INLINE_ATTRIBUTES[node.name];
  if (allowed) checkAttributes(ctx, node, allowed, where);
  switch (node.name) {
    case 'br':
    // `<hr/>` ist eine typografische Trennlinie ohne Textinhalt (belegt an BayVV_631_J_10511);
    // sie wird zum Absatzumbruch, es geht kein Text verloren.
    case 'hr':
      buffer.text += HARD_BREAK;
      return;
    case 'span':
    case 'sub':
      for (const child of node.children) appendInline(child, buffer, ctx, where);
      return;
    case 'sup':
      appendSuperscript(buffer, node, ctx, where);
      return;
    case 'satz.nr':
      appendSentenceNumber(buffer, node, ctx, where);
      return;
    case 'fn.call':
      appendFootnote(buffer, node, ctx, where);
      return;
    case 'verweis.norm':
      for (const child of node.children) appendInline(child, buffer, ctx, where);
      return;
    case 'graphic': {
      // Hier entsteht nie Text: Eine Bildbeschreibung ist kein Normtext.
      const fileRef = attribute(node, 'FileRef') ?? '';
      const description = attribute(node, 'Desc');
      const fileName = packageFileName(fileRef);
      const decorative = description !== undefined && DECORATIVE_DESCRIPTION.test(description);
      const asset = decorative ? undefined : ctx.figureAssets?.get(fileName.toLowerCase());
      ctx.graphics.push({
        fileRef,
        fileName,
        fileFormat: attribute(node, 'FileFormat'),
        description: description && description.trim() !== '' ? description.trim() : undefined,
        transferred: asset !== undefined,
        ...(decorative ? { decorative: true } : {}),
      });
      // Normative Abbildung: ein eigener Block mit Asset-Referenz an der Aufrufstelle (wie eine Fußnote an den
      // Absatz gehängt; steht sie allein, wird sie ein eigener Block). Eine Bildbeschreibung (`Desc`) ist
      // Alternativtext des Assets, nie Normtext.
      if (asset) {
        buffer.footnotes.push({ type: 'figure', asset: { ...asset, ...(description && description.trim() !== '' ? { description: description.trim() } : {}) } });
      }
      return;
    }
    case 'a': {
      // Verweis auf eine Datei des Exportpakets (`resources/…`) oder nach außen: Text bleibt stehen.
      const href = attribute(node, 'href');
      const before = buffer.text.length;
      for (const child of node.children) appendInline(child, buffer, ctx, where);
      if (href) ctx.resourceLinks.push({ href, fileName: packageFileName(href), text: normalizeInline(buffer.text.slice(before)) });
      return;
    }
    case 'v.norm':
    case 'v.abk':
      recordCitation(node, ctx);
      for (const child of node.children) appendInline(child, buffer, ctx, where);
      return;
    case 'symbol':
    // `titelangaben` wiederholt Kurzbezeichnung und amtliche Abkürzung als Kindelemente im Fließtext.
    case 'kurzbezeichnung':
    case 'amtlicheAbk':
      for (const child of node.children) appendInline(child, buffer, ctx, where);
      return;
    case 'p':
      buffer.text += HARD_BREAK;
      for (const child of node.children) appendInline(child, buffer, ctx, where);
      buffer.text += HARD_BREAK;
      return;
    case 'ul':
      // Liste in einem reinen Textzusammenhang (Tabellenzelle, Fußnotentext, Überschrift).
      for (const item of elementChildren(node)) {
        if (item.name !== 'li') {
          reportUnknownElement(ctx, item, `${where} → <ul>`);
          continue;
        }
        buffer.text += HARD_BREAK;
        for (const child of item.children) appendInline(child, buffer, ctx, where);
      }
      buffer.text += HARD_BREAK;
      return;
    case 'table': {
      // Tabelle in einem reinen Textzusammenhang (Fußnotentext in einer Tabellenzelle, BayBSOF): Das Zielmodell
      // kennt dort nur Text. Jede Zeile wird eine eigene Zeile, Zellen durch ein Leerzeichen getrennt – kein
      // eingefügtes Trennzeichen, der Wortlaut bleibt vollständig; die verlorene Spaltenform ist ein Befund.
      const rows = descendantRows(node);
      addFinding(ctx, 'warning', 'table-flattened-in-text',
        `Tabelle in ${where} (Zeile ${node.line}) als ${rows.length} Textzeilen übernommen; die Spaltenform geht verloren`);
      for (const row of rows) {
        const cells: string[] = [];
        for (const cell of elementChildren(row)) {
          if (cell.name !== 'td' && cell.name !== 'th') {
            reportUnknownElement(ctx, cell, `${where} → <tr>`);
            continue;
          }
          // Absätze einer Zelle bleiben in ihrer Zeile; Fußnoten der Zelle wandern an die Aufrufstelle.
          const cellBuffer = newBuffer();
          for (const child of cell.children) appendInline(child, cellBuffer, ctx, where);
          cells.push(normalizeInline(cellBuffer.text).replace(/\s*\n\s*/gu, ' '));
          buffer.footnotes.push(...cellBuffer.footnotes);
        }
        buffer.text += HARD_BREAK + cells.filter((text) => text !== '').join(' ');
      }
      buffer.text += HARD_BREAK;
      return;
    }
    default:
      reportUnknownElement(ctx, node, where);
      // Meldemodus: Text bleibt erhalten, damit nichts verloren geht.
      for (const child of node.children) appendInline(child, buffer, ctx, where);
  }
}

/** Zeilen einer Tabelle in Dokumentreihenfolge (`thead`/`tbody`/`tfoot` oder direkt); `colgroup` trägt keinen Text. */
function descendantRows(table: XmlElement): XmlElement[] {
  const rows: XmlElement[] = [];
  for (const child of elementChildren(table)) {
    if (child.name === 'tr') rows.push(child);
    else if (child.name === 'thead' || child.name === 'tbody' || child.name === 'tfoot') rows.push(...elementChildren(child).filter((row) => row.name === 'tr'));
  }
  return rows;
}

/** Zusammengesetzter Inline-Inhalt eines Elements (Text plus Fußnotenblöcke an der Aufrufstelle). */
export function inlineContent(element: XmlElement, ctx: ParseContext, where: string): { text: string; footnotes: NormBodyBlock[] } {
  const buffer = newBuffer();
  for (const child of element.children) appendInline(child, buffer, ctx, where);
  return { text: normalizeInline(buffer.text), footnotes: buffer.footnotes };
}

/**
 * Überschrift eines Elements, zeilenweise. Anders als im Fließtext bleibt der Zeilenumbruch des
 * Quelltextes erhalten: In `<gliederung.titel>` trennt er Gliederungszeichen und Überschrift.
 */
export function headingContent(element: XmlElement, ctx: ParseContext, where: string): { lines: string[]; footnotes: NormBodyBlock[] } {
  const previous = ctx.preserveLines;
  ctx.preserveLines = true;
  try {
    const { text, footnotes } = inlineContent(element, ctx, where);
    return { lines: text.split('\n').map((entry) => entry.trim()).filter((entry) => entry !== ''), footnotes };
  } finally {
    ctx.preserveLines = previous;
  }
}

/* ------------------------------------------------------------------ Blockinhalt */

function paragraphBlocks(text: string, footnotes: NormBodyBlock[]): NormBodyBlock[] {
  if (text === '') return footnotes;
  const block: NormBodyBlock = { type: 'paragraphText', text };
  if (footnotes.length > 0) block.children = footnotes;
  return [block];
}

/**
 * Gemischte Folge aus Fließtext, Listen und Tabellen (`absatz.text`, `gliederung`, `li`, `rumpf`).
 * Freistehender Text ohne `<p>` geht nicht verloren, sondern wird zu einem Fließtextblock – mit Befund.
 */
export function flowBlocks(nodes: readonly XmlNode[], ctx: ParseContext, where: string, listLevel = 0): NormBodyBlock[] {
  const blocks: NormBodyBlock[] = [];
  let pending: InlineBuffer | undefined;
  const flush = (): void => {
    if (!pending) return;
    blocks.push(...paragraphBlocks(normalizeInline(pending.text), pending.footnotes));
    pending = undefined;
  };
  for (const node of nodes) {
    if (node.kind === 'text') {
      if (node.value.trim() === '') continue;
      pending ??= newBuffer();
      pending.text += node.value;
      continue;
    }
    if (node.name === 'p') {
      flush();
      checkAttributes(ctx, node, INLINE_ATTRIBUTES['p']!, where);
      const { text, footnotes } = inlineContent(node, ctx, where);
      blocks.push(...paragraphBlocks(text, footnotes));
      continue;
    }
    if (node.name === 'ul') {
      flush();
      blocks.push(...listBlocks(node, ctx, listLevel + 1, where));
      continue;
    }
    if (node.name === 'table') {
      flush();
      blocks.push(tableBlock(node, ctx, where));
      continue;
    }
    if (node.name === 'Aenderungsinhalt' && ctx.quotedProvision) {
      flush();
      blocks.push(...ctx.quotedProvision(node, ctx, where));
      continue;
    }
    if (isInlineName(node.name)) {
      pending ??= newBuffer();
      appendInline(node, pending, ctx, where);
      continue;
    }
    flush();
    reportUnknownElement(ctx, node, where);
    const recovered = newBuffer();
    for (const child of node.children) appendInline(child, recovered, ctx, where);
    blocks.push(...paragraphBlocks(normalizeInline(recovered.text), recovered.footnotes));
  }
  flush();
  return blocks;
}

/**
 * Unbekanntes Element in einem Blockzusammenhang: melden (in der Vorgabe: abbrechen) und im
 * Meldemodus den Inhalt als gewöhnlichen Fließtext retten. Es geht nie Text verloren.
 */
export function recoverUnknown(element: XmlElement, ctx: ParseContext, where: string): NormBodyBlock[] {
  reportUnknownElement(ctx, element, where);
  return flowBlocks(element.children, ctx, `${where} → <${element.name}>`);
}

/** `<ul>` → `item` (Ebene 1) bzw. `subitem` (tiefer); `<symbol>` trägt das Gliederungszeichen. */
export function listBlocks(list: XmlElement, ctx: ParseContext, level: number, where: string): NormBodyBlock[] {
  checkAttributes(ctx, list, INLINE_ATTRIBUTES['ul']!, where);
  const blocks: NormBodyBlock[] = [];
  for (const node of list.children) {
    if (node.kind === 'text') {
      if (node.value.trim() !== '') {
        addFinding(ctx, 'warning', 'loose-list-text', `Text unmittelbar in <ul> in ${where} (Zeile ${list.line}) wird als eigener Punkt geführt`);
        blocks.push({ type: level === 1 ? 'item' : 'subitem', text: normalizeInline(node.value), level });
      }
      continue;
    }
    if (node.name !== 'li') {
      reportUnknownElement(ctx, node, `${where} → <ul>`);
      continue;
    }
    checkAttributes(ctx, node, INLINE_ATTRIBUTES['li']!, where);
    const symbol = node.children.find((child): child is XmlElement => isElement(child) && child.name === 'symbol');
    const label = symbol ? normalizeInline(rawInlineText(symbol)) : undefined;
    const rest = node.children.filter((child) => child !== symbol);
    const content = flowBlocks(rest, ctx, `${where} → Listenpunkt`, level);

    const block: NormBodyBlock = { type: level === 1 ? 'item' : 'subitem', level };
    if (label) block.label = label;
    const first = content[0];
    if (first && first.type === 'paragraphText' && first.children === undefined) {
      block.text = first.text;
      if (content.length > 1) block.children = content.slice(1);
    } else if (content.length > 0) {
      block.children = content;
    }
    if (block.label === undefined && block.text === undefined && (block.children === undefined || block.children.length === 0)) continue;
    blocks.push(block);
  }
  return blocks;
}

/* ------------------------------------------------------------------ Tabellen */

const TABLE_ATTRIBUTES = ['rules', 'frame', 'border', 'cellpadding', 'cellspacing', 'width', 'class', 'style', 'align', 'valign'];
const CELL_ATTRIBUTES = ['colspan', 'rowspan', 'style', 'valign', 'align', 'class', 'width', 'scope'];

function span(element: XmlElement, name: 'colspan' | 'rowspan', ctx: ParseContext, where: string): number {
  const raw = attribute(element, name);
  if (raw === undefined) return 1;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1) {
    addFinding(ctx, 'warning', 'table-span-invalid', `Ungültiges ${name}=${JSON.stringify(raw)} in ${where} (Zeile ${element.line}); als 1 gelesen`);
    return 1;
  }
  return value;
}

function cellBlock(cell: XmlElement, ctx: ParseContext, scope: TableHeaderScope | undefined, where: string): NormBodyBlock {
  checkAttributes(ctx, cell, CELL_ATTRIBUTES, where);
  const buffer = newBuffer();
  for (const child of cell.children) appendInline(child, buffer, ctx, where);
  const block: NormBodyBlock = { type: cell.name === 'th' ? 'tableHeaderCell' : 'tableCell', text: normalizeInline(buffer.text) };
  const colspan = span(cell, 'colspan', ctx, where);
  const rowspan = span(cell, 'rowspan', ctx, where);
  if (colspan > 1) block.colspan = colspan;
  if (rowspan > 1) block.rowspan = rowspan;
  if (block.type === 'tableHeaderCell' && scope) block.scope = scope;
  if (buffer.footnotes.length > 0) block.children = buffer.footnotes;
  return block;
}

function rowBlocks(section: XmlElement, ctx: ParseContext, header: boolean, where: string): NormBodyBlock[] {
  checkAttributes(ctx, section, TABLE_ATTRIBUTES, where);
  const rows: NormBodyBlock[] = [];
  for (const row of elementChildren(section)) {
    if (row.name !== 'tr') {
      reportUnknownElement(ctx, row, `${where} → <${section.name}>`);
      continue;
    }
    rows.push(rowBlock(row, ctx, header, where));
  }
  return rows;
}

function rowBlock(row: XmlElement, ctx: ParseContext, header: boolean, where: string): NormBodyBlock {
  checkAttributes(ctx, row, TABLE_ATTRIBUTES, where);
  const cells: NormBodyBlock[] = [];
  for (const cell of elementChildren(row)) {
    if (cell.name !== 'td' && cell.name !== 'th') {
      reportUnknownElement(ctx, cell, `${where} → <tr>`);
      continue;
    }
    cells.push(cellBlock(cell, ctx, cell.name === 'th' ? (header ? 'col' : 'row') : undefined, where));
  }
  return { type: 'tableRow', children: cells };
}

/**
 * `table` → Blockmodell aus `legal-core`. Die Rasterbreite wird mit derselben Belegungsrechnung
 * ermittelt, die `parseBodyBlock` später prüft (colspan **und** rowspan). Weicht eine Zeile ab, wird
 * das gemeldet – es werden keine Zellen erfunden, um ein Raster glattzuziehen.
 */
export function tableBlock(table: XmlElement, ctx: ParseContext, where: string): NormBodyBlock {
  checkAttributes(ctx, table, TABLE_ATTRIBUTES, where);
  ctx.counters.tables += 1;
  let declaredColumns = 0;
  const rows: NormBodyBlock[] = [];
  for (const child of elementChildren(table)) {
    switch (child.name) {
      case 'colgroup':
        checkAttributes(ctx, child, [...TABLE_ATTRIBUTES, 'span'], where);
        for (const column of elementChildren(child)) {
          if (column.name !== 'col') {
            reportUnknownElement(ctx, column, `${where} → <colgroup>`);
            continue;
          }
          checkAttributes(ctx, column, [...TABLE_ATTRIBUTES, 'span'], where);
          declaredColumns += 1;
        }
        break;
      case 'thead':
        rows.push(...rowBlocks(child, ctx, true, where));
        break;
      case 'tbody':
      case 'tfoot':
        rows.push(...rowBlocks(child, ctx, false, where));
        break;
      case 'tr':
        rows.push(rowBlock(child, ctx, false, where));
        break;
      default:
        reportUnknownElement(ctx, child, `${where} → <table>`);
    }
  }

  const width = gridWidth(rows, ctx, where, table.line);
  const block: NormBodyBlock = { type: 'table', children: rows };
  if (width > 0) block.columns = width;
  if (declaredColumns > 0 && width > 0 && declaredColumns !== width) {
    addFinding(ctx, 'warning', 'table-colgroup-mismatch',
      `Tabelle in ${where} (Zeile ${table.line}) deklariert ${declaredColumns} Spalten, das Zellenraster ergibt ${width}`);
  }
  return block;
}

/** Belegungsrechnung wie in `legal-core/lib/schema.ts`; meldet ein lückenhaftes Raster. */
function gridWidth(rows: readonly NormBodyBlock[], ctx: ParseContext, where: string, line: number): number {
  const occupied: boolean[][] = [];
  rows.forEach((row, rowIndex) => {
    occupied[rowIndex] ??= [];
    let column = 0;
    for (const cell of row.children ?? []) {
      const current = occupied[rowIndex]!;
      while (current[column]) column += 1;
      const rowspan = cell.rowspan ?? 1;
      const colspan = cell.colspan ?? 1;
      for (let rowOffset = 0; rowOffset < rowspan; rowOffset += 1) {
        occupied[rowIndex + rowOffset] ??= [];
        const target = occupied[rowIndex + rowOffset]!;
        for (let columnOffset = 0; columnOffset < colspan; columnOffset += 1) {
          if (target[column + columnOffset]) {
            addFinding(ctx, 'warning', 'table-cell-overlap', `Tabelle in ${where} (Zeile ${line}): Zelle in Zeile ${rowIndex + 1} überlappt eine andere`);
          }
          target[column + columnOffset] = true;
        }
      }
      column += colspan;
    }
  });
  const width = occupied.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  if (width === 0) return width;

  // Kurze Zeilen auf die Rasterbreite auffüllen.
  //
  // Die Quelle führt sie wirklich: `<tr><td colspan="1"><p>nachrichtlich</p></td></tr>` in einer
  // zweispaltigen Tabelle (belegt an BayVV_2242_K_727). Im Browser rendert eine solche Zeile mit
  // leerer zweiter Spalte – die Lücke sitzt am Ende, das ist in HTML eindeutig.
  //
  // Zuvor wurde nichts ergänzt und nur gemeldet. Das war konservativ gemeint, hatte aber einen
  // teuren Preis: `validateNormRecord` verlangt ein volles Raster, und so fiel die **ganze** Norm
  // aus dem Bestand – acht Vorschriften mitsamt ihrem vollständigen Text, wegen einer leeren Zelle.
  // Eine leere Zelle zu ergänzen verliert nichts und erfindet nichts; eine Norm zu verwerfen schon.
  const short: number[] = [];
  rows.forEach((row, rowIndex) => {
    const filled = (occupied[rowIndex] ?? []).filter(Boolean).length;
    if (filled >= width) return;
    short.push(rowIndex + 1);
    const cells = row.children ?? (row.children = []);
    for (let missing = width - filled; missing > 0; missing -= 1) cells.push({ type: 'tableCell', text: '' });
  });
  if (short.length > 0) {
    addFinding(ctx, 'warning', 'table-ragged',
      `Tabelle in ${where} (Zeile ${line}): ${short.length} Zeile(n) belegen weniger als ${width} Spalten (Zeile ${short.slice(0, 5).join(', ')}${short.length > 5 ? ' …' : ''}); die fehlenden Zellen werden am Zeilenende leer ergänzt, wie die Quelle sie darstellt`);
  }
  return width;
}
