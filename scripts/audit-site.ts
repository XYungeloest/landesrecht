#!/usr/bin/env node
/**
 * Audit 1 + 2: Website-Stichprobe (Status, Inhalt, Fehlerseiten) und statischer Barrierefreiheits-Smoke
 * gegen die deployte Site oder einen lokalen Server.
 *
 *   node scripts/audit-site.ts [--base-url https://…] [--budget 60] [--html-cache <dir>]
 *
 * Deterministische Seitenauswahl: Start, Länderseite, Typfilter, Suche (erste/mittlere/letzte Seite einer
 * breiten Anfrage, Typ- und Strukturfilter), Normseiten (ohne Abkürzung, längste Norm, VwV, rekonstruierte
 * VV, meiste Tabellen, meiste Anlagen, meiste Importwarnungen), Unterseiten (Quellen, Daten, Historie,
 * Vergleich, Fassung), API und Fehlerseiten. Je HTML-Seite: Statuscode, Abrufzeit, Größe, Prüfungen aus
 * scripts/lib/html-audit.ts (Überschriften, Formulare, Tabellen, Links, ARIA) und seitenspezifische
 * Erwartungen. Reports: data/audits/recht-nrw/quality/site-smoke.{json,md} und accessibility.{json,md}.
 */
import { readManifest } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { expandNormTypeFilter, type NormType } from '@landesrecht/legal-core/lib/schema.ts';

import { createPageFetcher, DEPLOYED_SITE_URL, loadWestCorpus, mdTable, parseCliArgs, repositoryRoot, writeAuditReport } from './lib/audit-common.ts';
import { computeNormStats, currentVersion } from './lib/corpus-stats.ts';
import { auditAccessibility, auditOutlineAnchors, byTag, hasClass, headingOutline, normalizedText, parseHtml, queryAll, summarizeTables, type A11yFinding, type HtmlElement } from './lib/html-audit.ts';

const { values } = parseCliArgs(process.argv.slice(2));
const baseUrl = (values.get('base-url') ?? DEPLOYED_SITE_URL).replace(/\/+$/u, '');
const root = repositoryRoot();
const norms = await loadWestCorpus(root);
const stats = norms.map((record) => computeNormStats(record));
const statsBySlug = new Map(stats.map((entry) => [entry.slug, entry]));
const manifest = await readManifest(root);
const warningsBySlug = new Map(manifest.entries.filter((entry) => entry.importStatus.startsWith('imported')).map((entry) => [entry.targetSlug, entry.findings.filter((finding) => finding.severity === 'warning').length]));
const typeCounts = norms.reduce<Record<string, number>>((acc, record) => { acc[record.meta.type] = (acc[record.meta.type] ?? 0) + 1; return acc; }, {});
const countForFilter = (type: NormType): number => expandNormTypeFilter([type]).reduce((sum, expanded) => sum + (typeCounts[expanded] ?? 0), 0);

const pick = (predicate: (index: number) => boolean, key: keyof Pick<(typeof stats)[number], 'blocks' | 'tables' | 'annexes'>): string => [...stats.keys()].filter(predicate).sort((left, right) => stats[right]![key] - stats[left]![key] || stats[left]!.slug.localeCompare(stats[right]!.slug)).map((index) => stats[index]!.slug)[0]!;
const selection = {
  withoutAbbr: norms.filter((record) => record.meta.abbr === undefined && record.meta.type === 'gesetz').map((record) => record.meta.slug).sort()[0]!,
  longest: pick(() => true, 'blocks'),
  administrative: pick((index) => norms[index]!.meta.type === 'verwaltungsvorschrift' && norms[index]!.meta.slug !== 'vv-lhundg-west', 'blocks'),
  reconstructed: 'vv-lhundg-west',
  mostTables: pick(() => true, 'tables'),
  mostAnnexes: pick(() => true, 'annexes'),
  mostWarnings: [...warningsBySlug.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]![0],
  reference: 'lhundg-west',
};

interface PageSpec { key: string; path: string; kind: 'html' | 'json' | 'text'; expectStatus: number; norm?: string; check?: (document: HtmlElement, page: { body: string; status: number }) => string[] }
const normChecks = (slug: string): PageSpec['check'] => (document) => {
  const record = norms.find((entry) => entry.meta.slug === slug)!;
  const expected = statsBySlug.get(slug)!;
  const version = currentVersion(record);
  const problems: string[] = [];
  const h1 = normalizedText(byTag(document, 'h1')[0] ?? document);
  if (h1 !== (version.title ?? record.meta.title).replace(/\s+/gu, ' ').trim()) problems.push(`h1 „${h1.slice(0, 60)}“ ≠ Titel`);
  const outline = auditOutlineAnchors(document);
  if (outline.total !== expected.outlineEntries) problems.push(`Inhaltsübersicht ${outline.total} statt ${expected.outlineEntries}`);
  if (outline.missing.length > 0) problems.push(`${outline.missing.length} Übersichtsziele fehlen`);
  const tables = summarizeTables(document);
  if (tables.length !== expected.tables) problems.push(`Tabellen ${tables.length} statt ${expected.tables}`);
  const footnotes = queryAll(document, (element) => element.tag === 'p' && hasClass(element, 'norm-footnote')).length;
  if (footnotes !== expected.footnotes) problems.push(`Fußnoten ${footnotes} statt ${expected.footnotes}`);
  const units = queryAll(document, (element) => element.attrs['data-norm-unit'] !== undefined).length;
  const expectedUnits = (expected.blockTypes.paragraph ?? 0) + (expected.blockTypes.article ?? 0) + (expected.blockTypes.annex ?? 0);
  if (units !== expectedUnits) problems.push(`Einheiten ${units} statt ${expectedUnits}`);
  if (version.sourceStatus?.text === 'reconstructed' && !normalizedText(document).includes('rekonstruiert')) problems.push('Rekonstruktionshinweis fehlt');
  if (!byTag(document, 'main')[0] || normalizedText(byTag(document, 'main')[0]!).length < 200) problems.push('Hauptinhalt leer');
  return problems;
};

const specs: PageSpec[] = [
  { key: 'start', path: '/', kind: 'html', expectStatus: 200, check: (document) => (byTag(document, 'form').some((form) => form.attrs.role === 'search') ? [] : ['Suchformular fehlt']) },
  { key: 'west', path: '/west/', kind: 'html', expectStatus: 200, check: (document) => {
    const problems: string[] = [];
    const heading = byTag(document, 'h2').map(normalizedText).find((text) => text.startsWith('Vorhandene Normen')) ?? '';
    if (!heading.includes(`(${norms.length})`)) problems.push(`Normzahl „${heading}“ ≠ ${norms.length}`);
    const hits = queryAll(document, (element) => element.tag === 'li' && hasClass(element, 'hit')).length;
    if (hits !== Math.min(500, norms.length)) problems.push(`Liste zeigt ${hits} statt ${Math.min(500, norms.length)} Normen`);
    const filters = queryAll(document, (element) => element.tag === 'ul' && hasClass(element, 'type-filter'))[0];
    if (!filters) problems.push('Typfilter fehlt');
    else if (!byTag(filters, 'a').some((link) => link.attrs['aria-current'] === 'true')) problems.push('Typfilter ohne aria-current');
    return problems;
  } },
  ...(['gesetz', 'verordnung', 'verwaltungsvorschrift', 'runderlass'] as NormType[]).map((type): PageSpec => ({ key: `west-type-${type}`, path: `/west/?type=${type}`, kind: 'html', expectStatus: 200, check: (document) => {
    const hits = queryAll(document, (element) => element.tag === 'li' && hasClass(element, 'hit')).length;
    const expected = countForFilter(type);
    const problems = hits === expected ? [] : [`Filter ${type}: ${hits} statt ${expected} Normen`];
    const current = queryAll(document, (element) => element.tag === 'a' && element.attrs['aria-current'] === 'true' && (element.attrs.href ?? '').includes(`type=${type}`)).length;
    if (current !== 1) problems.push('Filterlink ohne aria-current');
    return problems;
  } })),
  { key: 'nsh', path: '/nsh/', kind: 'html', expectStatus: 200 },
  { key: 'ost', path: '/ost/', kind: 'html', expectStatus: 200 },
  { key: 'baywue', path: '/bayern-wuerttemberg/', kind: 'html', expectStatus: 200 },
  { key: 'search-empty', path: '/suche/', kind: 'html', expectStatus: 200, check: (document) => (byTag(document, 'fieldset').length >= 3 ? [] : ['Filterformular unvollständig']) },
  { key: 'search-first', path: '/suche/?q=gesetz&jurisdiction=west', kind: 'html', expectStatus: 200 },
  { key: 'search-type', path: '/suche/?q=gesetz&jurisdiction=west&type=verordnung', kind: 'html', expectStatus: 200 },
  { key: 'search-filter-only', path: '/suche/?jurisdiction=west&type=verwaltungsvorschrift', kind: 'html', expectStatus: 200 },
  { key: 'search-structural', path: '/suche/?q=%C2%A7+3+Absatz+2+LHundG&jurisdiction=west', kind: 'html', expectStatus: 200, check: (document) => (queryAll(document, (element) => element.tag === 'a' && (element.attrs.href ?? '').includes('/west/norm/lhundg-west/#paragraph-3')).length > 0 ? [] : ['Strukturtreffer § 3 LHundG fehlt']) },
  { key: 'search-nohit', path: '/suche/?q=xyzzyqwertz&jurisdiction=west', kind: 'html', expectStatus: 200, check: (document) => (normalizedText(document).includes('0 Treffer') ? [] : ['Leere Trefferliste ohne „0 Treffer“']) },
  { key: 'norm-without-abbr', path: `/west/norm/${selection.withoutAbbr}/`, kind: 'html', expectStatus: 200, norm: selection.withoutAbbr, check: normChecks(selection.withoutAbbr) },
  { key: 'norm-longest', path: `/west/norm/${selection.longest}/`, kind: 'html', expectStatus: 200, norm: selection.longest, check: normChecks(selection.longest) },
  { key: 'norm-administrative', path: `/west/norm/${selection.administrative}/`, kind: 'html', expectStatus: 200, norm: selection.administrative, check: normChecks(selection.administrative) },
  { key: 'norm-reconstructed', path: `/west/norm/${selection.reconstructed}/`, kind: 'html', expectStatus: 200, norm: selection.reconstructed, check: normChecks(selection.reconstructed) },
  { key: 'norm-most-tables', path: `/west/norm/${selection.mostTables}/`, kind: 'html', expectStatus: 200, norm: selection.mostTables, check: normChecks(selection.mostTables) },
  { key: 'norm-most-annexes', path: `/west/norm/${selection.mostAnnexes}/`, kind: 'html', expectStatus: 200, norm: selection.mostAnnexes, check: normChecks(selection.mostAnnexes) },
  { key: 'norm-most-warnings', path: `/west/norm/${selection.mostWarnings}/`, kind: 'html', expectStatus: 200, norm: selection.mostWarnings, check: normChecks(selection.mostWarnings) },
  { key: 'norm-reference', path: `/west/norm/${selection.reference}/`, kind: 'html', expectStatus: 200, norm: selection.reference, check: normChecks(selection.reference) },
  { key: 'sources-reconstructed', path: `/west/norm/${selection.reconstructed}/quellen/`, kind: 'html', expectStatus: 200, check: (document) => {
    const record = norms.find((entry) => entry.meta.slug === selection.reconstructed)!;
    const expected = new Set([...record.meta.sourceReferences, ...(currentVersion(record).sourceReferences ?? [])].map((reference) => reference.sha256).filter(Boolean));
    const shown = new Set(byTag(document, 'code').map(normalizedText).filter((text) => /^[a-f0-9]{64}$/u.test(text)));
    return [...expected].every((sha) => shown.has(sha!)) ? [] : ['Nicht alle SHA-256 der Quellen sichtbar'];
  } },
  { key: 'sources-reference', path: `/west/norm/${selection.reference}/quellen/`, kind: 'html', expectStatus: 200, check: (document) => (byTag(document, 'code').some((code) => normalizedText(code).startsWith('west/recht-nrw/')) ? [] : ['Archivobjekt nicht sichtbar']) },
  { key: 'facts-reference', path: `/west/norm/${selection.reference}/daten/`, kind: 'html', expectStatus: 200 },
  { key: 'history-reference', path: `/west/norm/${selection.reference}/historie/`, kind: 'html', expectStatus: 200 },
  { key: 'compare-reference', path: `/west/norm/${selection.reference}/vergleich/`, kind: 'html', expectStatus: 200 },
  { key: 'version-reference', path: `/west/norm/${selection.reference}/version/2023-12-01/`, kind: 'html', expectStatus: 200, check: (document) => (byTag(document, 'link').some((link) => link.attrs.rel === 'canonical' && (link.attrs.href ?? '').endsWith(`/west/norm/${selection.reference}/version/2023-12-01/`)) ? [] : ['Fassungsseite ohne kanonische Fassungsadresse']) },
  { key: 'help', path: '/hilfe/', kind: 'html', expectStatus: 200 },
  { key: 'imprint', path: '/impressum/', kind: 'html', expectStatus: 200 },
  { key: 'not-found-norm', path: '/west/norm/diese-norm-gibt-es-nicht/', kind: 'html', expectStatus: 404 },
  { key: 'not-found-jurisdiction', path: '/nirgendwo/', kind: 'html', expectStatus: 404 },
  { key: 'not-found-version', path: `/west/norm/${selection.reference}/version/1999-01-01/`, kind: 'html', expectStatus: 404 },
  { key: 'api-jurisdictions', path: '/api/v1/jurisdictions', kind: 'json', expectStatus: 200 },
  { key: 'api-norm', path: `/api/v1/norms/west/${selection.reference}`, kind: 'json', expectStatus: 200 },
  { key: 'api-search', path: '/api/v1/search?q=hund&jurisdiction=west', kind: 'json', expectStatus: 200 },
  { key: 'simrecht', path: '/.well-known/simrecht.json', kind: 'json', expectStatus: 200 },
  { key: 'robots', path: '/robots.txt', kind: 'text', expectStatus: 200 },
];

interface PageResult { key: string; path: string; status: number; expectStatus: number; durationMs: number; bytes: number; contentType: string; ok: boolean; problems: string[]; headings?: string[]; a11y?: A11yFinding[]; tables?: number; searchTotal?: number; hits?: number }

const fetcher = createPageFetcher({ budget: Number.parseInt(values.get('budget') ?? '60', 10) || 60, ...(values.get('html-cache') ? { cacheDir: values.get('html-cache')! } : {}) });
const results: PageResult[] = [];
let searchTotal: number | undefined;

async function runSpec(spec: PageSpec): Promise<PageResult> {
  const page = await fetcher.get(`${baseUrl}${spec.path}`);
  const problems: string[] = [];
  if (page.status !== spec.expectStatus) problems.push(`HTTP ${page.status} statt ${spec.expectStatus}`);
  if (page.error) problems.push(page.error);
  const result: PageResult = { key: spec.key, path: spec.path, status: page.status, expectStatus: spec.expectStatus, durationMs: page.durationMs, bytes: page.bytes, contentType: page.contentType, ok: true, problems };
  if (spec.kind === 'html' && page.status >= 500) {
    // Serverfehler: keine Strukturprüfung eines leeren Fehlerkörpers, nur der Statusbefund.
    problems.push(`Serverfehler (${page.body.slice(0, 80).replace(/\s+/gu, ' ').trim() || 'leerer Antwortkörper'})`);
  } else if (spec.kind === 'html') {
    if (!page.contentType.includes('text/html')) problems.push(`Content-Type ${page.contentType || '–'}`);
    const document = parseHtml(page.body);
    if (!page.body.includes('</html>')) problems.push('HTML unvollständig');
    const main = byTag(document, 'main')[0];
    if (!main || normalizedText(main).length < 40) problems.push('Seite ohne Hauptinhalt');
    result.headings = headingOutline(document).slice(0, 12).map((heading) => `h${heading.level} ${heading.text.slice(0, 50)}`);
    result.a11y = auditAccessibility(document);
    result.tables = summarizeTables(document).length;
    if (spec.key.startsWith('search-') && spec.key !== 'search-empty') {
      const heading = byTag(document, 'h2').map(normalizedText).find((text) => /Treffer/u.test(text)) ?? '';
      const total = Number.parseInt(heading, 10);
      if (!Number.isNaN(total)) result.searchTotal = total;
      result.hits = queryAll(document, (element) => element.tag === 'li' && hasClass(element, 'hit')).length;
      if (spec.key === 'search-first') searchTotal = result.searchTotal;
      if (spec.key !== 'search-nohit' && (result.hits ?? 0) === 0) problems.push('keine Treffer gerendert');
    }
    if (spec.check) problems.push(...spec.check(document, page));
    if (result.a11y.some((finding) => finding.severity === 'error')) problems.push(`${result.a11y.filter((finding) => finding.severity === 'error').length} A11y-Fehler`);
  } else if (spec.kind === 'json') {
    try {
      JSON.parse(page.body);
      if (!page.contentType.includes('json')) problems.push(`Content-Type ${page.contentType || '–'}`);
    } catch {
      problems.push('keine gültige JSON-Antwort');
    }
  }
  result.ok = problems.length === 0;
  console.log(`${String(page.status).padStart(3)} ${String(page.durationMs).padStart(5)}ms ${spec.key.padEnd(24)} ${spec.path} ${problems.length ? `– ${problems.join('; ')}` : 'ok'}`);
  return result;
}

for (const spec of specs) results.push(await runSpec(spec));
// Suchpagination: mittlere und letzte Seite aus dem Gesamttreffer der ersten Seite (Seitengröße 20).
if (searchTotal && searchTotal > 20) {
  const pageSize = 20;
  const lastOffset = Math.floor((searchTotal - 1) / pageSize) * pageSize;
  const middleOffset = Math.floor(lastOffset / 2 / pageSize) * pageSize;
  for (const [key, offset] of [['search-middle', middleOffset], ['search-last', lastOffset]] as const) {
    results.push(await runSpec({ key, path: `/suche/?q=gesetz&jurisdiction=west&offset=${offset}`, kind: 'html', expectStatus: 200, check: (document) => {
      const list = queryAll(document, (element) => element.tag === 'ol' && hasClass(element, 'hit-list'))[0];
      const problems: string[] = [];
      if (list?.attrs.start !== String(offset + 1)) problems.push(`Liste beginnt bei ${list?.attrs.start ?? '–'} statt ${offset + 1}`);
      const links = byTag(document, 'a').filter((link) => hasClass(link, 'button-link')).map(normalizedText);
      if (!links.includes('Zurück')) problems.push('kein „Zurück“-Link');
      if (key === 'search-last' && links.includes('Weiter')) problems.push('„Weiter“-Link auf der letzten Seite');
      if (key === 'search-middle' && !links.includes('Weiter')) problems.push('kein „Weiter“-Link auf der mittleren Seite');
      return problems;
    } }));
  }
}

const a11yByCode = results.flatMap((result) => (result.a11y ?? []).map((finding) => ({ ...finding, page: result.key }))).reduce<Record<string, { severity: string; pages: string[]; message: string }>>((acc, finding) => {
  const entry = acc[finding.code] ?? { severity: finding.severity, pages: [], message: finding.message };
  entry.pages.push(finding.page);
  acc[finding.code] = entry;
  return acc;
}, {});
const durations = results.map((result) => result.durationMs).sort((left, right) => left - right);
const smoke = {
  baseUrl,
  requests: fetcher.requests,
  cacheHits: fetcher.cacheHits,
  selection,
  pages: results.length,
  failures: results.filter((result) => !result.ok).length,
  durationP50: durations[Math.floor(durations.length / 2)] ?? 0,
  durationMax: durations.at(-1) ?? 0,
  results: results.map(({ a11y: _a11y, ...rest }) => rest),
};
const accessibility = {
  baseUrl,
  method: 'Statische HTML-Prüfung (scripts/lib/html-audit.ts): Überschriftenhierarchie, Landmarks, Sprunglink, Formularbeschriftungen, Tabellen (Kopfzellen, Container, Spaltenzahl), Linktexte/-ziele, ARIA-Referenzen, aria-current, tabindex, Bilder. Kein Browser, keine Kontrast-/Fokusprüfung im Rendering.',
  pages: results.filter((result) => result.a11y).map((result) => ({ key: result.key, path: result.path, headings: result.headings, tables: result.tables, findings: result.a11y })),
  byCode: a11yByCode,
  errorCodes: Object.entries(a11yByCode).filter(([, entry]) => entry.severity === 'error').map(([code]) => code),
};

const smokeMarkdown = `# Website-Stichprobe (Smoke) – ${baseUrl}

Erzeugt mit \`npm run audit:site\` (${fetcher.requests} Abrufe${fetcher.cacheHits ? `, ${fetcher.cacheHits} aus lokalem HTML-Cache` : ''}). Seitenauswahl deterministisch aus dem Bestand:
ohne Abkürzung = erstes Gesetz ohne \`abbr\` (Slug-Reihenfolge), längste Norm = meiste Blöcke, VwV = umfangreichste Verwaltungsvorschrift,
Tabellen/Anlagen = Maximum je Kennzahl, Warnungen = meiste Importwarnungen im Manifest. Suchpagination aus der Gesamttrefferzahl der
Anfrage „gesetz“ (Seitengröße 20). Abrufzeiten sind Momentaufnahmen. Prüfstand ist der abgefragte Server: Änderungen an
\`apps/web/src\` wirken auf der deployten Site erst nach einem Redeploy; lokale Gegenprüfung mit \`--base-url http://localhost:<port>\`.

| Kennzahl | Wert |
| --- | --- |
| Seiten | ${smoke.pages} |
| Seiten mit Befunden | ${smoke.failures} |
| Abrufzeit Median / Maximum | ${smoke.durationP50} ms / ${smoke.durationMax} ms |
| Auswahl | ${Object.entries(selection).map(([key, slug]) => `${key}: ${slug}`).join('; ')} |

## Seiten

${mdTable(['Seite', 'Pfad', 'HTTP (Soll)', 'ms', 'KB', 'Treffer', 'Befunde'], results.map((result) => [result.key, result.path, `${result.status} (${result.expectStatus})`, result.durationMs, Math.round(result.bytes / 1024), result.searchTotal !== undefined ? `${result.hits} von ${result.searchTotal}` : '', result.problems.join('; ') || 'ok']))}
`;

const a11yMarkdown = `# Barrierefreiheits-Smoke – ${baseUrl}

${accessibility.method}
Geprüfte Seiten: ${accessibility.pages.length} (Start, Länderseite mit Filtern, Suche, Normseiten, Unterseiten, Fehlerseiten).

## Befunde nach Code

${Object.keys(a11yByCode).length === 0 ? 'Keine Befunde.' : mdTable(['Code', 'Schwere', 'Seiten', 'Beispiel'], Object.entries(a11yByCode).sort(([left], [right]) => left.localeCompare(right)).map(([code, entry]) => [code, entry.severity, `${entry.pages.length}: ${entry.pages.slice(0, 6).join(', ')}${entry.pages.length > 6 ? ' …' : ''}`, entry.message]))}

## Überschriftenstruktur je Seite (Auszug)

${accessibility.pages.map((page) => `### ${page.key} (${page.path})\n\n${(page.headings ?? []).map((heading) => `- ${heading}`).join('\n') || '- keine Überschriften'}\n\nBefunde: ${(page.findings ?? []).length === 0 ? 'keine' : (page.findings ?? []).map((finding) => `${finding.severity} ${finding.code}${finding.sample ? ` (${finding.sample})` : ''}`).join('; ')}`).join('\n\n')}
`;

const smokePaths = await writeAuditReport({ name: 'site-smoke', json: smoke, markdown: smokeMarkdown }, root);
await writeAuditReport({ name: 'accessibility', json: accessibility, markdown: a11yMarkdown }, root);
console.log(`Website-Stichprobe: ${smoke.pages} Seiten, ${smoke.failures} mit Befunden, ${fetcher.requests} Abrufe → ${smokePaths.markdown}`);
