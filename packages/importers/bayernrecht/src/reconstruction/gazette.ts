/**
 * Detailseite einer Einzelverkündung (`/gvbl/<jahr>-<seite>/`, `/baymbl/<jahr>-<nummer>/`) als Folge
 * von **Einheiten**: je Absatz, Überschrift, Listen- oder Tabellenglied eine Einheit mit Gliederungszeichen
 * (`1.`, `a)`, `aa)`, `1.2.1`) und Text.
 *
 * `events/documents.ts` zerlegt dieselben Seiten für das Ereignisregister – dort genügt Fließtext. Für die
 * Rückrechnung reicht das nicht: Wer einen Änderungsbefehl anwenden will, muss wissen, welche Zeile ein
 * Befehl ist, welche ihn gliedert und welche den einzufügenden Wortlaut trägt. Diese Zerlegung ist deshalb
 * eigens und behält Gliederungszeichen, Hochstellungen und Elementklassen.
 *
 * Die Zerlegung **normalisiert** genau vier Dinge, und nur sie (dokumentiert in
 * `docs/BAYWUE_RECONSTRUCTION.md`, Abschnitt „Leerraum“):
 *
 * 1. HTML-Entitäten werden aufgelöst.
 * 2. Geschützte und schmale Leerzeichen werden gewöhnliche Leerzeichen, Leerraumfolgen ein Leerzeichen –
 *    wie im Portaltext, dessen Parser `\s+` ebenfalls zusammenfasst.
 * 3. Weiche Trennzeichen (`&#173;`) entfallen; sie sind Satzhilfe der Verkündung, kein Wortlaut.
 * 4. `<sup>n</sup>` wird zur Unicode-Hochstellung (`³`) wie im Portaltext; ein Fußnotenzeichen der
 *    Verkündung (`<sup>1)</sup>`) entfällt, weil es auf eine Fußnote der Verkündung verweist.
 */
import { decodeEntities } from '../events/listings.ts';
import { toSuperscript } from '../parse/flow.ts';

export interface GazetteUnit {
  /** Laufende Nummer in der Seite (0-basiert). */
  index: number;
  /** Blockelement, das die Einheit trägt (`p`, `h3`, `dd`, `li`, `td` …). */
  tag: string;
  /** Klassenattribut des Blockelements (`EBENE2NummerierteListeABC`, `MBL1Listenebene` …). */
  className: string;
  /** Gliederungszeichen aus `span.nummerierung`, `span.olzhlr` oder dem vorangehenden `dt`. */
  label?: string;
  text: string;
  heading: boolean;
}

const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'dt', 'dd', 'li', 'td', 'th', 'tr', 'div', 'table', 'ol', 'ul', 'dl', 'section', 'blockquote', 'article']);
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const LABEL_CLASSES = /\b(?:nummerierung|olzhlr)\b/u;
const DOCUMENT_BOX = /<article[^>]*id="documentbox"[^>]*>([\s\S]*?)<\/article>/iu;

/** Leerraum wie im Portaltext; weiche Trennzeichen und Breitenloses entfallen. */
export function normalizeGazetteText(value: string): string {
  return value
    .replace(/[­​‌‍﻿]/gu, '')
    .replace(/[    ]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Textkörper der Detailseite; `undefined`, wenn die Seite keinen trägt (kein OCR, keine Vermutung). */
export function documentBox(html: string): string | undefined {
  return DOCUMENT_BOX.exec(html)?.[1];
}

/**
 * Zerlegt den Textkörper in Einheiten. Wirft nie; eine Seite ohne Textkörper ergibt eine leere Folge.
 */
export function gazetteUnits(html: string): GazetteUnit[] {
  const box = documentBox(html);
  if (box === undefined) return [];
  const source = box.replace(/<!--[\s\S]*?-->/gu, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/giu, '');
  const units: GazetteUnit[] = [];
  const blocks: Array<{ tag: string; className: string }> = [];
  const spans: boolean[] = [];
  let text = '';
  let label = '';
  let pendingLabel: string | undefined;
  let supDepth = 0;
  let supBuffer = '';

  const append = (value: string): void => {
    if (supDepth > 0) supBuffer += value;
    else if (spans.includes(true)) label += value;
    else text += value;
  };

  const flush = (): void => {
    const current = blocks.at(-1) ?? { tag: 'div', className: '' };
    const body = normalizeGazetteText(text);
    const mark = normalizeGazetteText(label);
    text = '';
    label = '';
    if (body === '' && mark === '') return;
    if (current.tag === 'dt') {
      // Das Gliederungszeichen einer Definitionsliste steht im `dt`, der Text im folgenden `dd`.
      pendingLabel = [pendingLabel, body, mark].filter(Boolean).join(' ');
      return;
    }
    const effectiveLabel = mark !== '' ? mark : pendingLabel;
    pendingLabel = undefined;
    units.push({
      index: units.length,
      tag: current.tag,
      className: current.className,
      ...(effectiveLabel ? { label: effectiveLabel } : {}),
      text: body,
      heading: HEADING_TAGS.has(current.tag),
    });
  };

  for (const match of source.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)/gu)) {
    if (match[4] !== undefined) {
      append(decodeEntities(match[4]));
      continue;
    }
    const closing = match[1] === '/';
    const tag = match[2]!.toLowerCase();
    const attributes = match[3] ?? '';
    const className = /\bclass="([^"]*)"/u.exec(attributes)?.[1] ?? '';
    if (BLOCK_TAGS.has(tag)) {
      flush();
      if (closing) {
        const at = blocks.map((entry) => entry.tag).lastIndexOf(tag);
        if (at >= 0) blocks.length = at;
      } else {
        blocks.push({ tag, className });
      }
      continue;
    }
    if (tag === 'br') {
      append(' ');
      continue;
    }
    if (tag === 'span') {
      if (closing) spans.pop();
      else if (!attributes.trimEnd().endsWith('/')) spans.push(LABEL_CLASSES.test(className));
      continue;
    }
    if (tag === 'sup') {
      if (!closing) {
        supDepth += 1;
        continue;
      }
      supDepth = Math.max(0, supDepth - 1);
      if (supDepth === 0) {
        const raw = normalizeGazetteText(decodeEntities(supBuffer));
        supBuffer = '';
        // `1)` ist ein Fußnotenzeichen der Verkündung, kein Wortlaut der geänderten Norm.
        if (/^\d+\)$/u.test(raw)) continue;
        const converted = toSuperscript(raw);
        append(converted.mapped ? converted.text : raw);
      }
      continue;
    }
    // Übrige Inline-Elemente (`strong`, `em`, `a`, `i`, `b`, `u`, `sub`) tragen keinen eigenen Text.
  }
  flush();
  return units;
}
