/**
 * Statischer Barrierefreiheits-/Strukturprüfer (scripts/lib/html-audit.ts) an synthetischem HTML, an den
 * vorgerenderten Seiten des Builds (apps/web/dist/client, falls vorhanden) und Regressionsschutz für die
 * Normdarstellung im Quelltext: Trennzeichen zwischen Kennzeichen und Titel, benannte Einheitenlinks,
 * eindeutige Absatz-ids, versteckte Beschriftungen (.visually-hidden).
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';

import { auditAccessibility, auditOutlineAnchors, byTag, collectIds, headingOutline, normalizedText, parseHtml, summarizeTables } from '../../scripts/lib/html-audit.ts';

const root = resolveRepositoryRoot();
const page = (body: string, head = '<title>Test</title>'): string => `<!doctype html><html lang="de"><head>${head}</head><body><a class="skip-link" href="#main">Zum Inhalt</a><main id="main">${body}</main></body></html>`;
const codes = (html: string): string[] => auditAccessibility(parseHtml(html)).map((finding) => finding.code).sort();

describe('HTML-Parser', () => {
  it('baut einen Baum mit Attributen, Entities und Rohtextelementen', () => {
    const document = parseHtml('<div id="a" class="x y" data-flag><p>T&amp;U &#x56;<br>&#87;</p><script>if (a < b) {}</script><table><tr><td colspan=2>1</td></tr><tr><th scope="col">h</th><td>2</td></tr></table></div>');
    const div = byTag(document, 'div')[0]!;
    expect(div.attrs).toEqual({ id: 'a', class: 'x y', 'data-flag': '' });
    expect(normalizedText(byTag(document, 'p')[0]!)).toBe('T&U VW');
    expect(byTag(document, 'script').length).toBe(1);
    expect(normalizedText(document)).not.toContain('a < b');
    const [table] = summarizeTables(document);
    expect(table).toMatchObject({ rows: 2, columns: 2, headerCells: 1, headerCellsWithoutScope: 0, spanCells: 1, irregularRows: 0 });
    expect(collectIds(document).get('a')).toBe(1);
  });
});

describe('Barrierefreiheitsprüfung', () => {
  it('meldet fehlende Grundstruktur', () => {
    expect(codes('<html><head></head><body><p>x</p></body></html>')).toEqual(['h1-count', 'html-lang-missing', 'main-landmark', 'skip-link-missing', 'title-missing']);
  });

  it('akzeptiert eine korrekte Seite', () => {
    expect(codes(page('<h1>Titel</h1><h2>A</h2><h3>B</h3><form role="search"><label for="q">Suche</label><input id="q" name="q"><select aria-label="Land" name="j"></select><button type="submit">Suchen</button></form><nav aria-label="x"><a href="#main">Inhalt</a></nav>'))).toEqual([]);
  });

  it('erkennt Überschriftensprünge, doppelte ids, fehlende Beschriftungen und Sprungziele', () => {
    const html = page('<h1>T</h1><h3>Sprung</h3><h4></h4><p id="d"></p><p id="d"></p><input name="n"><label for="ghost">L</label><a href="#nirgends">x</a><a href="/y"></a><section aria-labelledby="fehlt"></section><img src="a.png">');
    expect(codes(html)).toEqual(['anchor-target-missing', 'aria-reference-missing', 'duplicate-id', 'form-control-unlabeled', 'heading-empty', 'heading-skip', 'img-alt', 'label-for-dangling', 'link-name']);
  });

  it('prüft Tabellen und ihre Container', () => {
    const html = page('<h1>T</h1><div class="norm-table-wrap" tabindex="0" role="region" aria-label="Tabelle"><table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table></div><table><tr><th>k</th></tr><tr><td>v</td></tr></table>');
    expect(codes(html)).toEqual(['table-irregular-rows', 'table-no-header-cells', 'table-not-scrollable', 'table-th-without-scope']);
  });

  it('liest die Inhaltsübersicht und ihre Sprungziele', () => {
    const document = parseHtml(page('<h1>T</h1><nav class="norm-outline" aria-label="Inhaltsübersicht"><h2>Inhaltsübersicht</h2><ol><li><a href="#paragraph-1">§ 1</a></li><li><a href="#paragraph-2">§ 2</a></li></ol></nav><section id="paragraph-1"><h3>§ 1 <span>Zweck</span></h3></section>'));
    expect(auditOutlineAnchors(document)).toEqual({ total: 2, missing: ['#paragraph-2'], outlineHeading: true });
    expect(headingOutline(document).map((heading) => `${heading.level}:${heading.text}`)).toEqual(['1:T', '2:Inhaltsübersicht', '3:§ 1 Zweck']);
  });
});

describe('Vorgerenderte Seiten des Builds', () => {
  const client = join(root, 'apps', 'web', 'dist', 'client');
  const pages = ['index.html', join('hilfe', 'index.html'), join('impressum', 'index.html')].filter((file) => existsSync(join(client, file)));
  it.skipIf(pages.length === 0)('haben keine Barrierefreiheitsfehler', async () => {
    for (const file of pages) {
      const document = parseHtml(await readFile(join(client, file), 'utf8'));
      const errors = auditAccessibility(document).filter((finding) => finding.severity === 'error');
      expect(errors, file).toEqual([]);
      expect(headingOutline(document)[0]?.level, file).toBe(1);
    }
  });
});

describe('Normdarstellung (Quelltext-Regressionen)', () => {
  const web = join(root, 'apps', 'web', 'src');
  it('trennt Kennzeichen und Titel in Überschriften und benennt Einheitenlinks', async () => {
    const source = await readFile(join(web, 'components', 'NormBody.astro'), 'utf8');
    expect(source.match(/\{block\.label && block\.title && ' '\}/gu)?.length).toBe(2);
    expect(source).toMatch(/class="norm-unit__link"[^>]*aria-label=/u);
    expect(source).toContain('unitPath={anchor ? childPath : unitPath}');
    expect(source).toContain('repeatedLabels');
  });

  it('definiert die Screenreader-Klasse für versteckte Beschriftungen', async () => {
    const css = await readFile(join(web, 'styles', 'base.css'), 'utf8');
    expect(css).toMatch(/\.visually-hidden\s*\{[^}]*position:\s*absolute/u);
    const searchForm = await readFile(join(web, 'components', 'SearchForm.astro'), 'utf8');
    expect(searchForm).toContain('class="visually-hidden" for="suche-q"');
  });
});
