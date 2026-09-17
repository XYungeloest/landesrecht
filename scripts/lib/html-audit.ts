/**
 * Kleiner HTML-Baumparser und statische Barrierefreiheits-/Strukturprüfungen für die vom Portal
 * gerenderten Seiten (Astro erzeugt wohlgeformtes HTML). Kein Ersatz für axe/Playwright, aber
 * ausreichend für Überschriftenhierarchie, Formularbeschriftungen, Tabellenköpfe, Sprungziele,
 * ARIA-Referenzen und Linktexte – ohne neue Abhängigkeit.
 */

export interface HtmlElement {
  type: 'element';
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
  parent: HtmlElement | null;
}

export interface HtmlText {
  type: 'text';
  text: string;
  parent: HtmlElement | null;
}

export type HtmlNode = HtmlElement | HtmlText;

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);
/** Elemente, deren Öffnen ein offenes gleichnamiges Element implizit schließt (Formatierungsrestfehler abfangen). */
const SELF_CLOSING_ON_REPEAT = new Set(['p', 'li', 'dt', 'dd', 'option', 'tr', 'td', 'th']);

const ENTITY_MAP: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return ENTITY_MAP[entity.toLowerCase()] ?? match;
  });
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/gu;
  for (const match of source.matchAll(pattern)) {
    const name = match[1]!.toLowerCase();
    attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

export function parseHtml(html: string): HtmlElement {
  const root: HtmlElement = { type: 'element', tag: '#document', attrs: {}, children: [], parent: null };
  let current = root;
  let position = 0;
  const length = html.length;

  const appendText = (text: string): void => {
    if (!text) return;
    current.children.push({ type: 'text', text: decodeEntities(text), parent: current });
  };

  while (position < length) {
    const open = html.indexOf('<', position);
    if (open === -1) { appendText(html.slice(position)); break; }
    appendText(html.slice(position, open));
    if (html.startsWith('<!--', open)) {
      const end = html.indexOf('-->', open + 4);
      position = end === -1 ? length : end + 3;
      continue;
    }
    if (html.startsWith('<!', open) || html.startsWith('<?', open)) {
      const end = html.indexOf('>', open);
      position = end === -1 ? length : end + 1;
      continue;
    }
    const close = findTagEnd(html, open);
    if (close === -1) { appendText(html.slice(open)); break; }
    const raw = html.slice(open + 1, close);
    position = close + 1;
    if (raw.startsWith('/')) {
      const tag = raw.slice(1).trim().toLowerCase();
      let node: HtmlElement | null = current;
      while (node && node !== root && node.tag !== tag) node = node.parent;
      if (node && node !== root) current = node.parent ?? root;
      continue;
    }
    const selfClosing = raw.endsWith('/');
    const body = selfClosing ? raw.slice(0, -1) : raw;
    const nameMatch = body.match(/^([a-zA-Z][^\s/>]*)/u);
    if (!nameMatch) { appendText(`<${raw}>`); continue; }
    const tag = nameMatch[1]!.toLowerCase();
    const attrs = parseAttributes(body.slice(nameMatch[0].length));
    if (SELF_CLOSING_ON_REPEAT.has(tag)) {
      let node: HtmlElement | null = current;
      while (node && node !== root && node.tag !== tag && !isBlockBoundary(node.tag)) node = node.parent;
      if (node && node !== root && node.tag === tag) current = node.parent ?? root;
    }
    const element: HtmlElement = { type: 'element', tag, attrs, children: [], parent: current };
    current.children.push(element);
    if (selfClosing || VOID_ELEMENTS.has(tag)) continue;
    if (RAW_TEXT_ELEMENTS.has(tag)) {
      const endTag = html.toLowerCase().indexOf(`</${tag}`, position);
      const end = endTag === -1 ? length : endTag;
      element.children.push({ type: 'text', text: html.slice(position, end), parent: element });
      const closeEnd = html.indexOf('>', end);
      position = closeEnd === -1 ? length : closeEnd + 1;
      continue;
    }
    current = element;
  }
  return root;
}

function isBlockBoundary(tag: string): boolean {
  return ['div', 'section', 'article', 'main', 'nav', 'header', 'footer', 'aside', 'ul', 'ol', 'dl', 'table', 'tbody', 'thead', 'form', 'fieldset', 'blockquote', 'body', 'html'].includes(tag);
}

function findTagEnd(html: string, start: number): number {
  let quote: string | null = null;
  for (let index = start + 1; index < html.length; index += 1) {
    const char = html[index]!;
    if (quote) { if (char === quote) quote = null; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '>') return index;
  }
  return -1;
}

export function walk(node: HtmlNode, visitor: (element: HtmlElement) => void): void {
  if (node.type !== 'element') return;
  visitor(node);
  for (const child of node.children) walk(child, visitor);
}

export function queryAll(node: HtmlNode, predicate: (element: HtmlElement) => boolean): HtmlElement[] {
  const result: HtmlElement[] = [];
  walk(node, (element) => { if (predicate(element)) result.push(element); });
  return result;
}

export function byTag(node: HtmlNode, ...tags: string[]): HtmlElement[] {
  const wanted = new Set(tags);
  return queryAll(node, (element) => wanted.has(element.tag));
}

export function byId(node: HtmlNode, id: string): HtmlElement | undefined {
  return queryAll(node, (element) => element.attrs.id === id)[0];
}

export function hasClass(element: HtmlElement, className: string): boolean {
  return (element.attrs.class ?? '').split(/\s+/u).includes(className);
}

export function textContent(node: HtmlNode): string {
  if (node.type === 'text') return node.text;
  if (RAW_TEXT_ELEMENTS.has(node.tag)) return '';
  return node.children.map(textContent).join('');
}

export function normalizedText(node: HtmlNode): string {
  return textContent(node).replace(/\s+/gu, ' ').trim();
}

export function closest(element: HtmlElement, predicate: (candidate: HtmlElement) => boolean): HtmlElement | null {
  let node: HtmlElement | null = element.parent;
  while (node) {
    if (predicate(node)) return node;
    node = node.parent;
  }
  return null;
}

export function collectIds(document: HtmlElement): Map<string, number> {
  const ids = new Map<string, number>();
  walk(document, (element) => {
    const id = element.attrs.id;
    if (id !== undefined && id !== '') ids.set(id, (ids.get(id) ?? 0) + 1);
  });
  return ids;
}

export interface A11yFinding {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  /** Beispiel (erstes Vorkommen) – hilft beim Nachvollziehen. */
  sample?: string;
  count?: number;
}

export interface HeadingEntry {
  level: number;
  text: string;
  id?: string;
}

export function headingOutline(document: HtmlElement): HeadingEntry[] {
  return byTag(document, 'h1', 'h2', 'h3', 'h4', 'h5', 'h6').map((heading) => {
    const entry: HeadingEntry = { level: Number.parseInt(heading.tag.slice(1), 10), text: normalizedText(heading) };
    if (heading.attrs.id) entry.id = heading.attrs.id;
    return entry;
  });
}

function labelledBy(control: HtmlElement, labelsByFor: Map<string, HtmlElement[]>, ids: Map<string, number>): boolean {
  if (control.attrs['aria-label']?.trim()) return true;
  if (control.attrs['aria-labelledby']) return control.attrs['aria-labelledby'].split(/\s+/u).every((id) => ids.has(id));
  if (control.attrs.id && (labelsByFor.get(control.attrs.id)?.length ?? 0) > 0) return true;
  if (closest(control, (candidate) => candidate.tag === 'label')) return true;
  return control.attrs.type === 'hidden' || control.attrs.type === 'submit' || control.attrs.type === 'button';
}

function accessibleLinkName(link: HtmlElement): string {
  const text = normalizedText(link);
  if (text) return text;
  if (link.attrs['aria-label']?.trim()) return link.attrs['aria-label'].trim();
  if (link.attrs.title?.trim()) return link.attrs.title.trim();
  const image = byTag(link, 'img').find((img) => img.attrs.alt?.trim());
  return image?.attrs.alt?.trim() ?? '';
}

/**
 * Statische Prüfungen einer gerenderten Seite. Rückgabe ist deterministisch geordnet (Reihenfolge der
 * Prüfungen, dann des Auftretens).
 */
export function auditAccessibility(document: HtmlElement): A11yFinding[] {
  const findings: A11yFinding[] = [];
  const ids = collectIds(document);
  const push = (finding: A11yFinding): void => { findings.push(finding); };

  const html = byTag(document, 'html')[0];
  if (!html) push({ severity: 'error', code: 'no-html-element', message: 'Kein <html>-Element gefunden' });
  else if (!html.attrs.lang?.trim()) push({ severity: 'error', code: 'html-lang-missing', message: '<html> ohne lang-Attribut' });

  const title = byTag(document, 'title')[0];
  if (!title || !normalizedText(title)) push({ severity: 'error', code: 'title-missing', message: 'Seite ohne <title>' });

  if (byTag(document, 'main').length !== 1) push({ severity: 'error', code: 'main-landmark', message: `Erwartet genau ein <main>, gefunden ${byTag(document, 'main').length}` });

  const duplicates = [...ids.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort();
  if (duplicates.length > 0) push({ severity: 'error', code: 'duplicate-id', message: `${duplicates.length} doppelte id-Werte`, sample: duplicates[0], count: duplicates.length });

  const headings = headingOutline(document);
  const h1Count = headings.filter((heading) => heading.level === 1).length;
  if (h1Count !== 1) push({ severity: 'error', code: 'h1-count', message: `Erwartet genau eine <h1>, gefunden ${h1Count}` });
  let previous = 0;
  const skips: string[] = [];
  const empty: string[] = [];
  for (const heading of headings) {
    if (!heading.text) empty.push(`h${heading.level}${heading.id ? `#${heading.id}` : ''}`);
    if (previous > 0 && heading.level > previous + 1) skips.push(`h${previous} → h${heading.level} („${heading.text.slice(0, 60)}“)`);
    previous = heading.level;
  }
  if (headings.length > 0 && headings[0]!.level !== 1) push({ severity: 'warning', code: 'first-heading-not-h1', message: `Erste Überschrift ist h${headings[0]!.level}` });
  if (skips.length > 0) push({ severity: 'warning', code: 'heading-skip', message: `${skips.length} Überschriftensprünge`, sample: skips[0], count: skips.length });
  if (empty.length > 0) push({ severity: 'error', code: 'heading-empty', message: `${empty.length} leere Überschriften`, sample: empty[0], count: empty.length });

  const skipLink = queryAll(document, (element) => element.tag === 'a' && hasClass(element, 'skip-link'))[0];
  if (!skipLink) push({ severity: 'warning', code: 'skip-link-missing', message: 'Kein Sprunglink zum Inhalt' });
  else if (!skipLink.attrs.href?.startsWith('#') || !ids.has(skipLink.attrs.href.slice(1))) push({ severity: 'error', code: 'skip-link-target', message: `Sprunglink zeigt auf fehlendes Ziel ${skipLink.attrs.href ?? ''}` });

  const labelsByFor = new Map<string, HtmlElement[]>();
  for (const label of byTag(document, 'label')) {
    const target = label.attrs.for;
    if (!target) continue;
    labelsByFor.set(target, [...(labelsByFor.get(target) ?? []), label]);
  }
  const unlabeled: string[] = [];
  for (const control of byTag(document, 'input', 'select', 'textarea')) {
    if (!labelledBy(control, labelsByFor, ids)) unlabeled.push(`${control.tag}[name=${control.attrs.name ?? '?'}]`);
  }
  if (unlabeled.length > 0) push({ severity: 'error', code: 'form-control-unlabeled', message: `${unlabeled.length} Formularfelder ohne Beschriftung`, sample: unlabeled[0], count: unlabeled.length });
  for (const [target] of labelsByFor) if (!ids.has(target)) push({ severity: 'error', code: 'label-for-dangling', message: `<label for="${target}"> ohne Ziel` });

  const fieldsetsWithoutLegend = byTag(document, 'fieldset').filter((fieldset) => !fieldset.children.some((child) => child.type === 'element' && child.tag === 'legend'));
  if (fieldsetsWithoutLegend.length > 0) push({ severity: 'warning', code: 'fieldset-legend', message: `${fieldsetsWithoutLegend.length} <fieldset> ohne <legend>`, count: fieldsetsWithoutLegend.length });

  const buttonsWithoutName = byTag(document, 'button').filter((button) => !normalizedText(button) && !button.attrs['aria-label']?.trim());
  if (buttonsWithoutName.length > 0) push({ severity: 'error', code: 'button-name', message: `${buttonsWithoutName.length} Schaltflächen ohne Namen`, count: buttonsWithoutName.length });

  const links = byTag(document, 'a').filter((link) => !hasClass(link, 'skip-link'));
  const linksWithoutHref = links.filter((link) => link.attrs.href === undefined || link.attrs.href === '');
  if (linksWithoutHref.length > 0) push({ severity: 'error', code: 'link-href-missing', message: `${linksWithoutHref.length} Links ohne href`, sample: normalizedText(linksWithoutHref[0]!).slice(0, 60), count: linksWithoutHref.length });
  const linksWithoutName = links.filter((link) => !accessibleLinkName(link));
  if (linksWithoutName.length > 0) push({ severity: 'error', code: 'link-name', message: `${linksWithoutName.length} Links ohne Linktext`, sample: linksWithoutName[0]!.attrs.href, count: linksWithoutName.length });
  const undefinedHrefs = links.filter((link) => /\/undefined(?:\/|$)|#undefined$/u.test(link.attrs.href ?? ''));
  if (undefinedHrefs.length > 0) push({ severity: 'error', code: 'link-href-undefined', message: `${undefinedHrefs.length} Links mit „undefined“ in der Adresse`, sample: undefinedHrefs[0]!.attrs.href, count: undefinedHrefs.length });
  const brokenAnchors = links.filter((link) => (link.attrs.href ?? '').startsWith('#') && (link.attrs.href ?? '').length > 1 && !ids.has(decodeURIComponent((link.attrs.href ?? '').slice(1))));
  if (brokenAnchors.length > 0) push({ severity: 'error', code: 'anchor-target-missing', message: `${brokenAnchors.length} Sprungziele fehlen auf der Seite`, sample: brokenAnchors[0]!.attrs.href, count: brokenAnchors.length });

  const ariaRefs: string[] = [];
  walk(document, (element) => {
    for (const attribute of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
      const value = element.attrs[attribute];
      if (!value) continue;
      for (const id of value.split(/\s+/u)) if (id && !ids.has(id)) ariaRefs.push(`${element.tag}[${attribute}=${id}]`);
    }
  });
  if (ariaRefs.length > 0) push({ severity: 'error', code: 'aria-reference-missing', message: `${ariaRefs.length} ARIA-Referenzen ohne Ziel`, sample: ariaRefs[0], count: ariaRefs.length });

  const invalidCurrent = queryAll(document, (element) => element.attrs['aria-current'] !== undefined && !['page', 'step', 'location', 'date', 'time', 'true', 'false'].includes(element.attrs['aria-current']!));
  if (invalidCurrent.length > 0) push({ severity: 'error', code: 'aria-current-invalid', message: `${invalidCurrent.length} ungültige aria-current-Werte`, count: invalidCurrent.length });

  const positiveTabindex = queryAll(document, (element) => Number.parseInt(element.attrs.tabindex ?? '0', 10) > 0);
  if (positiveTabindex.length > 0) push({ severity: 'warning', code: 'tabindex-positive', message: `${positiveTabindex.length} Elemente mit positivem tabindex`, count: positiveTabindex.length });

  const imagesWithoutAlt = byTag(document, 'img').filter((img) => img.attrs.alt === undefined);
  if (imagesWithoutAlt.length > 0) push({ severity: 'error', code: 'img-alt', message: `${imagesWithoutAlt.length} Bilder ohne alt`, count: imagesWithoutAlt.length });

  const navs = byTag(document, 'nav');
  const unnamedNavs = navs.filter((nav) => !nav.attrs['aria-label']?.trim() && !nav.attrs['aria-labelledby']);
  if (navs.length > 1 && unnamedNavs.length > 0) push({ severity: 'warning', code: 'nav-unnamed', message: `${unnamedNavs.length} von ${navs.length} <nav> ohne Namen`, count: unnamedNavs.length });

  const sectionsWithLabelledBy = queryAll(document, (element) => element.tag === 'section' && element.attrs['aria-labelledby'] !== undefined);
  const sectionsWithEmptyHeading = sectionsWithLabelledBy.filter((section) => {
    const heading = byId(document, section.attrs['aria-labelledby']!);
    return heading !== undefined && !normalizedText(heading);
  });
  if (sectionsWithEmptyHeading.length > 0) push({ severity: 'error', code: 'section-label-empty', message: `${sectionsWithEmptyHeading.length} Abschnitte mit leerer Überschrift als Name`, sample: sectionsWithEmptyHeading[0]!.attrs.id, count: sectionsWithEmptyHeading.length });

  findings.push(...auditTables(document));
  return findings;
}

export interface TableSummary {
  index: number;
  rows: number;
  columns: number;
  headerCells: number;
  headerCellsWithoutScope: number;
  hasCaption: boolean;
  inScrollRegion: boolean;
  regionNamed: boolean;
  spanCells: number;
  emptyHeaderCells: number;
  irregularRows: number;
}

export function summarizeTables(document: HtmlElement): TableSummary[] {
  return byTag(document, 'table').map((table, index) => {
    const rows = byTag(table, 'tr');
    const widths = rows.map((row) => row.children.filter((child): child is HtmlElement => child.type === 'element' && (child.tag === 'td' || child.tag === 'th')).reduce((sum, cell) => sum + (Number.parseInt(cell.attrs.colspan ?? '1', 10) || 1), 0));
    const headerCells = byTag(table, 'th');
    const wrapper = closest(table, (candidate) => hasClass(candidate, 'norm-table-wrap'));
    const cells = byTag(table, 'td', 'th');
    // Zeilen ohne rowspan-Einfluss: nur einfache Breitenabweichung zählen (rowspan-Zeilen dürfen schmaler sein).
    const hasRowspan = cells.some((cell) => (Number.parseInt(cell.attrs.rowspan ?? '1', 10) || 1) > 1);
    const maxWidth = Math.max(0, ...widths);
    return {
      index,
      rows: rows.length,
      columns: maxWidth,
      headerCells: headerCells.length,
      headerCellsWithoutScope: headerCells.filter((cell) => !cell.attrs.scope).length,
      hasCaption: byTag(table, 'caption').length > 0,
      inScrollRegion: wrapper !== null,
      regionNamed: wrapper !== null && wrapper.attrs.role === 'region' && Boolean(wrapper.attrs['aria-label']?.trim() || wrapper.attrs['aria-labelledby']) && wrapper.attrs.tabindex === '0',
      spanCells: cells.filter((cell) => (Number.parseInt(cell.attrs.colspan ?? '1', 10) || 1) > 1 || (Number.parseInt(cell.attrs.rowspan ?? '1', 10) || 1) > 1).length,
      emptyHeaderCells: headerCells.filter((cell) => !normalizedText(cell)).length,
      irregularRows: hasRowspan ? 0 : widths.filter((width) => width !== maxWidth).length,
    };
  });
}

function auditTables(document: HtmlElement): A11yFinding[] {
  const findings: A11yFinding[] = [];
  const tables = summarizeTables(document);
  if (tables.length === 0) return findings;
  const withoutHeaders = tables.filter((table) => table.headerCells === 0 && table.rows > 1);
  if (withoutHeaders.length > 0) findings.push({ severity: 'warning', code: 'table-no-header-cells', message: `${withoutHeaders.length} von ${tables.length} Tabellen ohne Kopfzellen (<th>)`, sample: `Tabelle ${withoutHeaders[0]!.index}`, count: withoutHeaders.length });
  const scopeless = tables.filter((table) => table.headerCellsWithoutScope > 0);
  if (scopeless.length > 0) findings.push({ severity: 'info', code: 'table-th-without-scope', message: `${scopeless.length} Tabellen mit <th> ohne scope`, count: scopeless.length });
  const noRegion = tables.filter((table) => !table.inScrollRegion);
  if (noRegion.length > 0) findings.push({ severity: 'warning', code: 'table-not-scrollable', message: `${noRegion.length} Tabellen ohne horizontal scrollbaren Container`, count: noRegion.length });
  const unnamedRegion = tables.filter((table) => table.inScrollRegion && !table.regionNamed);
  if (unnamedRegion.length > 0) findings.push({ severity: 'error', code: 'table-region-unnamed', message: `${unnamedRegion.length} Tabellencontainer ohne role=region/aria-label/tabindex`, count: unnamedRegion.length });
  const irregular = tables.filter((table) => table.irregularRows > 0);
  if (irregular.length > 0) findings.push({ severity: 'error', code: 'table-irregular-rows', message: `${irregular.length} Tabellen mit ungleicher Spaltenzahl je Zeile`, sample: `Tabelle ${irregular[0]!.index}`, count: irregular.length });
  const emptyHeaders = tables.filter((table) => table.emptyHeaderCells > 0);
  if (emptyHeaders.length > 0) findings.push({ severity: 'info', code: 'table-empty-th', message: `${emptyHeaders.length} Tabellen mit leeren Kopfzellen`, count: emptyHeaders.length });
  return findings;
}

/** Sprungziele der Inhaltsübersicht („.norm-outline a[href^=#]“) und Prüfung gegen die ids der Seite. */
export function auditOutlineAnchors(document: HtmlElement): { total: number; missing: string[]; outlineHeading: boolean } {
  const outline = queryAll(document, (element) => element.tag === 'nav' && hasClass(element, 'norm-outline'))[0];
  if (!outline) return { total: 0, missing: [], outlineHeading: false };
  const ids = collectIds(document);
  const hrefs = byTag(outline, 'a').map((link) => link.attrs.href ?? '').filter((href) => href.startsWith('#'));
  return {
    total: hrefs.length,
    missing: hrefs.filter((href) => !ids.has(decodeURIComponent(href.slice(1)))),
    outlineHeading: byTag(outline, 'h2').length === 1,
  };
}

export function elementSummary(element: HtmlElement): string {
  const attrs = ['id', 'class', 'href', 'name', 'for'].filter((name) => element.attrs[name]).map((name) => `${name}="${element.attrs[name]}"`).join(' ');
  return `<${element.tag}${attrs ? ` ${attrs}` : ''}>`;
}
