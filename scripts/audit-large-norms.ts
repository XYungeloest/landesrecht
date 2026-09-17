#!/usr/bin/env node
/**
 * Audit 3: große Normen – Top 20 nach Body-Blöcken, Textlänge und Sucheinheiten (offline) und optional
 * Renderprüfung gegen die Website (Abrufzeit, Inhaltsübersicht/Sprungziele, vollständige Darstellung,
 * Auffindbarkeit über die Such-API).
 *
 *   node scripts/audit-large-norms.ts [--online] [--base-url https://…] [--budget 60] [--html-cache <dir>]
 *
 * Online werden höchstens die ersten 30 Normen der Vereinigungsmenge (sortiert nach Blockzahl) geprüft:
 * je Norm eine Seite und eine Suchanfrage. Report: data/audits/recht-nrw/quality/large-norms.{json,md}.
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import { createPageFetcher, DEPLOYED_SITE_URL, loadWestCorpus, mdTable, parseCliArgs, percentile, repositoryRoot, writeAuditReport } from './lib/audit-common.ts';
import { computeNormStats, currentVersion, type NormStats } from './lib/corpus-stats.ts';
import { auditOutlineAnchors, byTag, hasClass, normalizedText, parseHtml, queryAll } from './lib/html-audit.ts';

const { flags, values } = parseCliArgs(process.argv.slice(2));
const online = flags.has('online');
const baseUrl = (values.get('base-url') ?? DEPLOYED_SITE_URL).replace(/\/+$/u, '');
const root = repositoryRoot();
const norms = await loadWestCorpus(root);
const bySlug = new Map(norms.map((record) => [record.meta.slug, record]));
const stats = norms.map((record) => computeNormStats(record));

const top = (key: keyof Pick<NormStats, 'blocks' | 'textChars' | 'units'>): NormStats[] => [...stats].sort((left, right) => right[key] - left[key] || left.slug.localeCompare(right.slug)).slice(0, 20);
const topBlocks = top('blocks');
const topChars = top('textChars');
const topUnits = top('units');
const unionSlugs = [...new Set([...topBlocks, ...topChars, ...topUnits].map((entry) => entry.slug))];
const union = unionSlugs.map((slug) => stats.find((entry) => entry.slug === slug)!).sort((left, right) => right.blocks - left.blocks || left.slug.localeCompare(right.slug));

/** Blöcke, die NormBody.astro als `<p class="norm-text">` ausgibt (Text an Listen-, Gliederungs-, Absatz- und Fließtextblöcken). */
const TEXT_RENDERING_TYPES = new Set(['item', 'subitem', 'book', 'part', 'chapter', 'section', 'subsection', 'preamble', 'paragraph', 'article', 'annex', 'subparagraph', 'paragraphText']);
function countRenderedTextBlocks(blocks: readonly NormBodyBlock[]): number {
  let count = 0;
  const visit = (entries: readonly NormBodyBlock[], inTable: boolean): void => {
    for (const block of entries) {
      const table = inTable || block.type === 'table';
      if (!table && block.text && TEXT_RENDERING_TYPES.has(block.type)) count += 1;
      if (block.children) visit(block.children, table && block.type !== 'tableCell' ? table : (block.type === 'tableCell' ? false : table));
    }
  };
  visit(blocks, false);
  return count;
}
function lastText(blocks: readonly NormBodyBlock[]): string | undefined {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]!;
    const inner = block.children ? lastText(block.children) : undefined;
    if (inner) return inner;
    if (block.text && block.type !== 'signature') return block.text;
  }
  return undefined;
}

interface OnlineCheck {
  slug: string;
  url: string;
  status: number;
  durationMs: number;
  bytes: number;
  outlineLinks: number;
  outlineMissing: number;
  expectedOutline: number;
  renderedTextBlocks: number;
  expectedTextBlocks: number;
  units: number;
  expectedUnits: number;
  lastTextPresent: boolean;
  htmlComplete: boolean;
  searchQuery: string;
  searchStatus: number;
  searchTotal: number | null;
  foundInSearch: boolean | null;
  searchRank: number | null;
  problems: string[];
}

const onlineChecks: OnlineCheck[] = [];
let requests = 0;
if (online) {
  const fetcher = createPageFetcher({ budget: Number.parseInt(values.get('budget') ?? '60', 10) || 60, ...(values.get('html-cache') ? { cacheDir: values.get('html-cache')! } : {}) });
  for (const entry of union.slice(0, 30)) {
    const record = bySlug.get(entry.slug)!;
    const version = currentVersion(record);
    const url = `${baseUrl}/west/norm/${entry.slug}/`;
    const page = await fetcher.get(url);
    const document = parseHtml(page.body);
    const outline = auditOutlineAnchors(document);
    const renderedTextBlocks = queryAll(document, (element) => element.tag === 'p' && hasClass(element, 'norm-text')).length;
    const units = queryAll(document, (element) => element.attrs['data-norm-unit'] !== undefined).length;
    const expectedUnits = Object.entries(entry.blockTypes).filter(([type]) => ['paragraph', 'article', 'annex'].includes(type)).reduce((sum, [, count]) => sum + count, 0);
    const tail = lastText(version.body);
    const pageText = normalizedText(byTag(document, 'main')[0] ?? document);
    const lastTextPresent = tail ? pageText.includes(tail.replace(/\s+/gu, ' ').trim().slice(0, 80)) : true;
    // Abkürzung, sonst der Titel ohne Klammerzusatz und ohne §-Angaben (die Suche deutet „§ 94 Absatz 2“ als Strukturadresse), gekürzt auf die Suchlängengrenze.
    const abbr = entry.abbr && entry.abbr.replace(/\s+West$/u, '').length >= 3 ? entry.abbr : undefined;
    const searchQuery = abbr ?? entry.title.replace(/\s+/gu, ' ').split(/\s*[(§]/u)[0]!.trim().slice(0, 200);
    const search = await fetcher.get(`${baseUrl}/api/v1/search?q=${encodeURIComponent(searchQuery)}&jurisdiction=west&limit=20`);
    let searchTotal: number | null = null;
    let foundInSearch: boolean | null = null;
    let searchRank: number | null = null;
    try {
      const payload = JSON.parse(search.body) as { total: number; hits: Array<{ slug: string }> };
      searchTotal = payload.total;
      searchRank = payload.hits.findIndex((hit) => hit.slug === entry.slug);
      foundInSearch = searchRank >= 0;
      if (searchRank < 0) searchRank = null; else searchRank += 1;
    } catch {
      // keine JSON-Antwort
    }
    const problems: string[] = [];
    if (page.status !== 200) problems.push(`HTTP ${page.status}`);
    if (!page.body.includes('</html>')) problems.push('HTML unvollständig (kein </html>)');
    if (outline.missing.length > 0) problems.push(`${outline.missing.length} Sprungziele der Inhaltsübersicht fehlen`);
    if (outline.total !== entry.outlineEntries) problems.push(`Inhaltsübersicht ${outline.total} statt ${entry.outlineEntries} Einträge`);
    if (renderedTextBlocks !== countRenderedTextBlocks(version.body)) problems.push(`Textblöcke ${renderedTextBlocks} statt ${countRenderedTextBlocks(version.body)}`);
    if (units !== expectedUnits) problems.push(`Einheiten ${units} statt ${expectedUnits}`);
    if (!lastTextPresent) problems.push('letzter Textblock fehlt auf der Seite (Truncation?)');
    if (foundInSearch === false) problems.push(`Suche „${searchQuery}“ findet die Norm nicht (Top 20)`);
    if (foundInSearch === null) problems.push(`Such-API antwortete nicht mit JSON (HTTP ${search.status})`);
    onlineChecks.push({ slug: entry.slug, url, status: page.status, durationMs: page.durationMs, bytes: page.bytes, outlineLinks: outline.total, outlineMissing: outline.missing.length, expectedOutline: entry.outlineEntries, renderedTextBlocks, expectedTextBlocks: countRenderedTextBlocks(version.body), units, expectedUnits, lastTextPresent, htmlComplete: page.body.includes('</html>'), searchQuery, searchStatus: search.status, searchTotal, foundInSearch, searchRank, problems });
    console.log(`${page.status} ${String(page.durationMs).padStart(5)}ms ${String(Math.round(page.bytes / 1024)).padStart(5)}KB ${entry.slug} ${problems.length ? `– ${problems.join('; ')}` : 'ok'}`);
  }
  requests = fetcher.requests;
}

const durations = onlineChecks.map((check) => check.durationMs);
const result = {
  corpus: {
    norms: stats.length,
    totalBlocks: stats.reduce((sum, entry) => sum + entry.blocks, 0),
    totalTextChars: stats.reduce((sum, entry) => sum + entry.textChars, 0),
    totalUnits: stats.reduce((sum, entry) => sum + entry.units, 0),
    blocksP50: percentile(stats.map((entry) => entry.blocks), 0.5),
    blocksP90: percentile(stats.map((entry) => entry.blocks), 0.9),
    textCharsP50: percentile(stats.map((entry) => entry.textChars), 0.5),
    textCharsP90: percentile(stats.map((entry) => entry.textChars), 0.9),
  },
  topBlocks: topBlocks.map(({ blockTypes: _b, ...rest }) => rest),
  topTextChars: topChars.map(({ blockTypes: _b, ...rest }) => rest),
  topUnits: topUnits.map(({ blockTypes: _b, ...rest }) => rest),
  union: union.map((entry) => entry.slug),
  online: online ? { baseUrl, requests, checked: onlineChecks.length, durationP50: percentile(durations, 0.5), durationMax: Math.max(0, ...durations), withProblems: onlineChecks.filter((check) => check.problems.length > 0).length, checks: onlineChecks } : null,
};

const statsTable = (rows: NormStats[]): string => mdTable(['Norm', 'Typ', 'Blöcke', 'Zeichen', 'Sucheinheiten', 'Übersicht', 'Tabellen', 'Anlagen', 'Fußnoten', 'Tiefe'], rows.map((entry) => [entry.slug, entry.type, entry.blocks, entry.textChars, entry.units, entry.outlineEntries, entry.tables, entry.annexes, entry.footnotes, entry.maxDepth]));

const markdown = `# Große Normen – Audit

Erzeugt mit \`npm run audit:large-norms\`${online ? ' -- --online' : ''}. Offline-Kennzahlen aus \`content/norms/west/**\` (geltende Fassung,
Blockzahl rekursiv, Textlänge = Zeichen in text/title/label, Sucheinheiten wie \`packages/search\`). Online-Prüfung: je Norm ein Seitenabruf und eine
Anfrage an \`/api/v1/search\` (Abkürzung, sonst erste sechs Titelwörter), höchstens 30 Normen der Vereinigungsmenge der drei Top-20-Listen.
Abrufzeiten sind Momentaufnahmen (nicht deterministisch); alle übrigen Werte sind reproduzierbar.

## Bestand

| Kennzahl | Wert |
| --- | --- |
| Normen | ${result.corpus.norms} |
| Blöcke gesamt | ${result.corpus.totalBlocks} (Median ${result.corpus.blocksP50}, P90 ${result.corpus.blocksP90}) |
| Zeichen gesamt | ${result.corpus.totalTextChars} (Median ${result.corpus.textCharsP50}, P90 ${result.corpus.textCharsP90}) |
| Sucheinheiten gesamt | ${result.corpus.totalUnits} |

## Top 20 nach Blöcken

${statsTable(topBlocks)}

## Top 20 nach Textlänge

${statsTable(topChars)}

## Top 20 nach Sucheinheiten

${statsTable(topUnits)}

## Online-Prüfung${online ? ` (${baseUrl}, ${requests} Abrufe)` : ''}

${online
    ? `${onlineChecks.length} Normen geprüft, ${result.online!.withProblems} mit Befunden; Abrufzeit Median ${result.online!.durationP50} ms, Maximum ${result.online!.durationMax} ms.

${mdTable(['Norm', 'HTTP', 'ms', 'KB', 'Übersicht (Soll)', 'fehlende Ziele', 'Textblöcke (Soll)', 'Einheiten (Soll)', 'Ende vorhanden', 'Suche', 'Rang', 'Befunde'], onlineChecks.map((check) => [check.slug, check.status, check.durationMs, Math.round(check.bytes / 1024), `${check.outlineLinks} (${check.expectedOutline})`, check.outlineMissing, `${check.renderedTextBlocks} (${check.expectedTextBlocks})`, `${check.units} (${check.expectedUnits})`, check.lastTextPresent ? 'ja' : 'nein', check.foundInSearch === null ? '?' : check.foundInSearch ? `ja (${check.searchTotal})` : `nein (${check.searchTotal})`, check.searchRank, check.problems.join('; ')]))}`
    : 'Nicht ausgeführt (Option `--online`).'}
`;

const paths = await writeAuditReport({ name: 'large-norms', json: result, markdown }, root);
console.log(`Große Normen: ${union.length} Normen in der Vereinigungsmenge${online ? `, ${onlineChecks.length} online geprüft (${result.online!.withProblems} mit Befunden, ${requests} Abrufe)` : ''} → ${paths.markdown}`);
