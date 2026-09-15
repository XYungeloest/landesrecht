/**
 * Kleine DOM-Helfer über parse5 (dieselbe Bibliothek wie der OstRecht-Importer). Kein eigener
 * HTML-Tokenizer: RECHT.NRW liefert fehlertolerantes Word-HTML und Drupal-Markup.
 */
import { parse, parseFragment } from 'parse5';
import type { DefaultTreeAdapterTypes as Tree } from 'parse5';

export type HtmlNode = Tree.Node;
export type HtmlElement = Tree.Element;
export type HtmlDocument = Tree.Document;

export function parseHtml(html: string): HtmlDocument {
  return parse(html);
}

export function parseHtmlFragment(html: string): Tree.DocumentFragment {
  return parseFragment(html);
}

export function isElement(node: HtmlNode | undefined | null): node is HtmlElement {
  return Boolean(node) && typeof (node as HtmlElement).tagName === 'string';
}

export function isTextNode(node: HtmlNode): node is Tree.TextNode {
  return node.nodeName === '#text';
}

export function attr(node: HtmlElement, name: string): string | undefined {
  return node.attrs.find((entry) => entry.name.toLowerCase() === name)?.value;
}

export function classes(node: HtmlElement): string[] {
  return (attr(node, 'class') ?? '').split(/\s+/u).filter(Boolean);
}

export function hasClass(node: HtmlElement, className: string): boolean {
  return classes(node).includes(className);
}

export function children(node: HtmlNode): HtmlNode[] {
  return (node as Tree.ParentNode).childNodes ?? [];
}

export function elementChildren(node: HtmlNode): HtmlElement[] {
  return children(node).filter(isElement);
}

export function descendants(node: HtmlNode, predicate: (element: HtmlElement) => boolean, output: HtmlElement[] = []): HtmlElement[] {
  for (const child of children(node)) {
    if (isElement(child)) {
      if (predicate(child)) output.push(child);
      descendants(child, predicate, output);
    }
  }
  return output;
}

export function findFirst(node: HtmlNode, predicate: (element: HtmlElement) => boolean): HtmlElement | undefined {
  for (const child of children(node)) {
    if (isElement(child)) {
      if (predicate(child)) return child;
      const nested = findFirst(child, predicate);
      if (nested) return nested;
    }
  }
  return undefined;
}

export function byId(node: HtmlNode, id: string): HtmlElement | undefined {
  return findFirst(node, (element) => attr(element, 'id') === id);
}

export function byClass(node: HtmlNode, className: string): HtmlElement | undefined {
  return findFirst(node, (element) => hasClass(element, className));
}

export function allByClass(node: HtmlNode, className: string): HtmlElement[] {
  return descendants(node, (element) => hasClass(element, className));
}

export function allByTag(node: HtmlNode, tagName: string): HtmlElement[] {
  return descendants(node, (element) => element.tagName === tagName);
}

/** Sichtbarer Text mit Whitespace-Normalisierung; `<br>` wird zu einem Zeilenumbruch. */
export function textOf(node: HtmlNode | undefined, options: { breaks?: boolean } = {}): string {
  if (!node) return '';
  const parts: string[] = [];
  const visit = (current: HtmlNode): void => {
    if (isTextNode(current)) {
      parts.push(current.value);
      return;
    }
    if (isElement(current)) {
      if (current.tagName === 'br') {
        parts.push(options.breaks ? '\n' : ' ');
        return;
      }
      if (current.tagName === 'script' || current.tagName === 'style') return;
    }
    for (const child of children(current)) visit(child);
  };
  visit(node);
  return normalizeWhitespace(parts.join(''), options.breaks ?? false);
}

export function normalizeWhitespace(value: string, keepBreaks = false): string {
  const unified = value.replace(/ /gu, ' ').replace(/\r\n?/gu, '\n').replace(/[\t\f\v]+/gu, ' ');
  if (!keepBreaks) return unified.replace(/\s+/gu, ' ').trim();
  return unified
    .split('\n')
    .map((line) => line.replace(/ +/gu, ' ').trim())
    .filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== ''))
    .join('\n')
    .trim();
}

/** Serialisiert die Tag-Namen eines Elements zur Diagnose („p.lrdetail > a“). */
export function describeElement(element: HtmlElement): string {
  const className = classes(element).slice(0, 2).join('.');
  return className ? `${element.tagName}.${className}` : element.tagName;
}
