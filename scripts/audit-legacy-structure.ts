#!/usr/bin/env node
/**
 * Audit 12: Tabellen ohne Kopfzeile und mehrfach eingebettete Fußnoten – technische Klassifikation (offline) und
 * Darstellungs-/Barrierefreiheitsfolgen auf der Website (`--online`, kleine deterministische Stichprobe).
 *
 *   node scripts/audit-legacy-structure.ts [--online] [--base-url https://…] [--budget 8]
 *
 * Nur Befund: keine Normstrukturänderung. Schreibt data/audits/recht-nrw/quality/legacy-structure.{json,md}.
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { readManifest } from '@landesrecht/importer-recht-nrw/common/manifest.ts';

import { createPageFetcher, DEPLOYED_SITE_URL, loadWestCorpus, mdTable, parseCliArgs, repositoryRoot, writeAuditReport } from './lib/audit-common.ts';
import { byTag, collectIds, hasClass, parseHtml, queryAll, summarizeTables } from './lib/html-audit.ts';

const { flags, values } = parseCliArgs(process.argv.slice(2));
const online = flags.has('online');
const baseUrl = (values.get('base-url') ?? DEPLOYED_SITE_URL).replace(/\/$/u, '');
const budget = Number.parseInt(values.get('budget') ?? '8', 10);

const root = repositoryRoot();
const norms = await loadWestCorpus(root);
const manifest = await readManifest(root);
const formatBySlug = new Map(manifest.entries.filter((entry) => entry.targetSlug).map((entry) => [entry.targetSlug, entry.contentFormat]));

type TableKind = 'kopfzeilen-kandidat' | 'datenzeile-zuerst' | 'einspaltig-oder-layout' | 'einzeilig' | 'nummernspalte';

interface TableFinding {
  slug: string;
  format: string;
  index: number;
  rows: number;
  columns: number;
  kind: TableKind;
  firstRow: string;
  headerCells: number;
  caption: boolean;
}

interface FootnoteFinding {
  slug: string;
  format: string;
  footnotes: number;
  distinct: number;
  duplicated: number;
  maxRepeats: number;
  example: string;
}

function walk(blocks: readonly NormBodyBlock[], visit: (block: NormBodyBlock) => void): void {
  for (const block of blocks) {
    visit(block);
    if (block.children) walk(block.children, visit);
  }
}

function classifyTable(block: NormBodyBlock): { kind: TableKind; rows: number; columns: number; firstRow: string; headerCells: number } {
  const rows = block.children ?? [];
  const first = rows[0]?.children ?? [];
  const cellText = (cell: NormBodyBlock): string => (cell.text ?? (cell.children ?? []).map((child) => child.text ?? '').join(' ')).replace(/\s+/gu, ' ').trim();
  const firstTexts = first.map(cellText);
  const headerCells = rows.reduce((sum, row) => sum + (row.children ?? []).filter((cell) => cell.type === 'tableHeaderCell').length, 0);
  const columns = Math.max(0, ...rows.map((row) => (row.children ?? []).length));
  const allShort = firstTexts.length > 0 && firstTexts.every((text) => text.length > 0 && text.length <= 40 && !/[.;:]$/u.test(text));
  const numeric = firstTexts.length > 0 && firstTexts.every((text) => /^\d+[.)]?$/u.test(text) || text === '');
  let kind: TableKind;
  if (rows.length <= 1) kind = 'einzeilig';
  else if (first.length <= 1) kind = 'einspaltig-oder-layout';
  else if (numeric) kind = 'nummernspalte';
  else if (allShort) kind = 'kopfzeilen-kandidat';
  else kind = 'datenzeile-zuerst';
  return { kind, rows: rows.length, columns, firstRow: firstTexts.join(' | ').slice(0, 120), headerCells };
}

const tables: TableFinding[] = [];
const footnotes: FootnoteFinding[] = [];
let headerCellsTotal = 0;
for (const record of norms) {
  const version = record.versions[0];
  if (!version) continue;
  const format = formatBySlug.get(record.meta.slug) ?? 'unbekannt';
  let index = 0;
  const counts = new Map<string, number>();
  walk(version.body, (block) => {
    if (block.type === 'table') {
      const classified = classifyTable(block);
      headerCellsTotal += classified.headerCells;
      tables.push({ slug: record.meta.slug, format, index, rows: classified.rows, columns: classified.columns, kind: classified.kind, firstRow: classified.firstRow, headerCells: classified.headerCells, caption: Boolean(block.title) });
      index += 1;
    }
    if (block.type === 'footnote') {
      const key = `${block.label ?? ''}␟${block.text ?? ''}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  });
  const duplicated = [...counts.entries()].filter(([, count]) => count > 1);
  if (duplicated.length > 0) {
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    const [exampleKey, repeats] = duplicated.sort((left, right) => right[1] - left[1])[0]!;
    footnotes.push({ slug: record.meta.slug, format, footnotes: total, distinct: counts.size, duplicated: duplicated.length, maxRepeats: repeats, example: `${exampleKey.split('␟')[0]} ×${repeats}: ${exampleKey.split('␟')[1]!.slice(0, 80)}` });
  }
}

const tablesByKind = tables.reduce<Record<string, number>>((acc, table) => { acc[table.kind] = (acc[table.kind] ?? 0) + 1; return acc; }, {});
const tablesByFormat = tables.reduce<Record<string, number>>((acc, table) => { acc[table.format] = (acc[table.format] ?? 0) + 1; return acc; }, {});
const footnotesByFormat = footnotes.reduce<Record<string, number>>((acc, finding) => { acc[finding.format] = (acc[finding.format] ?? 0) + 1; return acc; }, {});

/* ---- Online: Darstellung und Barrierefreiheit der auffälligsten Seiten --------------------------------- */

interface PageCheck {
  slug: string;
  reason: string;
  status: number;
  durationMs: number;
  duplicateIds: number;
  tables: number;
  tablesWithoutTh: number;
  tablesInScrollRegion: number;
  footnotesRendered: number;
  footnotesExpected: number;
  problems: string[];
}

const pageChecks: PageCheck[] = [];
if (online) {
  const fetcher = createPageFetcher({ budget, delayMs: 300 });
  const tableCounts = new Map<string, number>();
  for (const table of tables) tableCounts.set(table.slug, (tableCounts.get(table.slug) ?? 0) + 1);
  const mostTables = [...tableCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 2).map(([slug]) => ({ slug, reason: 'meiste Tabellen' }));
  const mostFootnotes = [...footnotes].sort((left, right) => right.footnotes - left.footnotes || left.slug.localeCompare(right.slug)).slice(0, 2).map((finding) => ({ slug: finding.slug, reason: 'meiste eingebettete Fußnoten' }));
  const previouslyFlagged = ['lostv-west', 'gesetz-ueber-die-fachhochschulen-fuer-den-oeffentlichen-dienst-im-lande-west'].map((slug) => ({ slug, reason: 'accessibility.md: doppelte ids (Vorbefund)' }));
  const seen = new Set<string>();
  for (const { slug, reason } of [...previouslyFlagged, ...mostTables, ...mostFootnotes]) {
    if (seen.has(slug) || !norms.some((record) => record.meta.slug === slug)) continue;
    seen.add(slug);
    const page = await fetcher.get(`${baseUrl}/west/norm/${slug}/`);
    const document = parseHtml(page.body);
    const duplicateIds = [...collectIds(document).values()].filter((count) => count > 1).length;
    const summaries = summarizeTables(document);
    const footnotesRendered = queryAll(document, (element) => element.tag === 'p' && hasClass(element, 'norm-footnote')).length;
    let footnotesExpected = 0;
    walk(norms.find((record) => record.meta.slug === slug)!.versions[0]!.body, (block) => { if (block.type === 'footnote') footnotesExpected += 1; });
    const problems: string[] = [];
    if (!page.ok) problems.push(`HTTP ${page.status}`);
    if (duplicateIds > 0) problems.push(`${duplicateIds} doppelte ids (Fehler)`);
    if (footnotesRendered !== footnotesExpected) problems.push(`Fußnoten ${footnotesRendered} statt ${footnotesExpected}`);
    if (summaries.some((table) => !table.inScrollRegion)) problems.push('Tabelle ohne Scroll-Region');
    pageChecks.push({ slug, reason, status: page.status, durationMs: page.durationMs, duplicateIds, tables: byTag(document, 'table').length, tablesWithoutTh: summaries.filter((table) => table.headerCells === 0 && table.rows > 1).length, tablesInScrollRegion: summaries.filter((table) => table.inScrollRegion).length, footnotesRendered, footnotesExpected, problems });
  }
}

/* ---- Report ---------------------------------------------------------------------------------------------- */

const summary = {
  norms: norms.length,
  tables: tables.length,
  tablesWithHeaderCells: tables.filter((table) => table.headerCells > 0).length,
  headerCellsTotal,
  tablesByKind,
  tablesByFormat,
  normsWithTables: new Set(tables.map((table) => table.slug)).size,
  normsWithDuplicatedFootnotes: footnotes.length,
  footnotesByFormat,
  duplicatedFootnoteDefinitions: footnotes.reduce((sum, finding) => sum + finding.duplicated, 0),
  online: online ? { pages: pageChecks.length, pagesWithProblems: pageChecks.filter((check) => check.problems.length > 0).length, duplicateIdPages: pageChecks.filter((check) => check.duplicateIds > 0).length } : null,
};

const markdown = `# Tabellen ohne Kopfzeile, mehrfach eingebettete Fußnoten – technische Klassifikation

Erzeugt mit \`npm run audit:legacy-structure\`${online ? ' -- --online' : ''}. Offline über alle ${norms.length} West-Normen; Format je Norm aus dem
Manifest (\`contentFormat\`: native = RECHT.NRW-HTML, legacy-file = Word-Altdatei). Keine Normstrukturänderung – die Einordnung
beschreibt, was ein Parser aus der Quelle ableiten könnte, und was die Website daraus macht.

## Tabellen (${tables.length} in ${summary.normsWithTables} Normen)

| Kennzahl | Wert |
| --- | --- |
| Tabellen mit Kopfzellen (\`tableHeaderCell\`) | ${summary.tablesWithHeaderCells} (${headerCellsTotal} Kopfzellen) |
| nach Format | ${Object.entries(tablesByFormat).sort().map(([key, count]) => `${key} ${count}`).join(', ')} |
| nach Klasse | ${Object.entries(tablesByKind).sort().map(([key, count]) => `${key} ${count}`).join(', ')} |

Klassen: \`kopfzeilen-kandidat\` = erste Zeile besteht aus kurzen Bezeichnern ohne Satzende (ein Parser könnte sie als
Kopfzeile markieren – erst nach Prüfung je Quelle, da RECHT.NRW keine \`<th>\` liefert); \`datenzeile-zuerst\` = erste Zeile ist
Inhalt (keine Kopfzeile in der Quelle, \`<th>\` wäre falsch); \`einspaltig-oder-layout\` = Layout-/Aufzählungstabelle;
\`einzeilig\` = nur eine Zeile; \`nummernspalte\` = erste Zeile nummeriert.

Darstellung/A11y: Die Website rendert \`<th scope>\` sobald Kopfzellen im Blockmodell vorkommen (NormBody.astro), jede Tabelle
liegt in einer benannten, fokussierbaren Scroll-Region (\`role="region"\`, \`tabindex="0"\`) mit optionaler \`<caption>\`. Tabellen ohne
\`<th>\` sind ein Hinweis (Screenreader lesen Zellen ohne Kopfbezug), kein Fehler; die Ursache liegt in der Quelle/im Parser, nicht
in der Darstellung. Keine Änderung in \`apps/web\`.

### Kopfzeilen-Kandidaten (${tables.filter((table) => table.kind === 'kopfzeilen-kandidat').length}, erste 40)

${mdTable(['Norm', 'Format', 'Nr.', 'Zeilen', 'Spalten', 'erste Zeile'], tables.filter((table) => table.kind === 'kopfzeilen-kandidat').slice(0, 40).map((table) => [table.slug, table.format, table.index + 1, table.rows, table.columns, table.firstRow]))}

## Mehrfach eingebettete Fußnoten (${footnotes.length} Normen)

| Kennzahl | Wert |
| --- | --- |
| Normen mit mehrfach eingebetteten Fußnoten | ${footnotes.length} (${Object.entries(footnotesByFormat).sort().map(([key, count]) => `${key} ${count}`).join(', ')}) |
| doppelte Definitionen (gleiches Zeichen, gleicher Text) | ${summary.duplicatedFootnoteDefinitions} |

Einordnung: Der Legacy-Parser bettet die Fußnotendefinition an jeder Verweisstelle erneut ein (Quelle: Word-HTML ohne stabile
Fußnotenanker). Fachlich ist der Text vollständig und an jeder Stelle lesbar; die Quellzählung steht in den Quellhinweisen. Die
Website rendert jede eingebettete Fußnote als \`<p class="norm-footnote">\` ohne \`id\` – keine doppelten ids, kein A11y-Fehler,
Redundanz ist reine Textwiederholung. Eine Deduplizierung wäre eine Parser-/Strukturänderung (Fußnotenblock je Zeichen mit
Verweisen) und keine Darstellungskorrektur.

${footnotes.length === 0 ? 'Keine.' : mdTable(['Norm', 'Format', 'Fußnoten', 'davon eindeutig', 'mehrfach', 'max. Wiederholung', 'Beispiel'], [...footnotes].sort((left, right) => right.maxRepeats - left.maxRepeats || left.slug.localeCompare(right.slug)).slice(0, 40).map((finding) => [finding.slug, finding.format, finding.footnotes, finding.distinct, finding.duplicated, finding.maxRepeats, finding.example]))}

## Stichprobe online (${pageChecks.length})

${online ? `Basis \`${baseUrl}\`: Vorbefund-Seiten aus \`accessibility.md\` (doppelte ids) sowie Normen mit den meisten Tabellen bzw. eingebetteten Fußnoten.

${mdTable(['Norm', 'Grund', 'HTTP', 'ms', 'doppelte ids', 'Tabellen', 'ohne th', 'in Scroll-Region', 'Fußnoten (Soll)', 'Befunde'], pageChecks.map((check) => [check.slug, check.reason, check.status, check.durationMs, check.duplicateIds, check.tables, check.tablesWithoutTh, check.tablesInScrollRegion, `${check.footnotesRendered} (${check.footnotesExpected})`, check.problems.join('; ')]))}` : 'Nicht ausgeführt (`--online`).'}
`;

const paths = await writeAuditReport({ name: 'legacy-structure', json: { summary, tables, footnotes, online: online ? { baseUrl, pageChecks } : null }, markdown }, root);
console.log(`Legacy-Struktur: ${tables.length} Tabellen (${Object.entries(tablesByKind).sort().map(([key, count]) => `${key} ${count}`).join(', ')}), ${footnotes.length} Normen mit mehrfach eingebetteten Fußnoten${online ? `; online ${pageChecks.length} Seiten, ${summary.online?.pagesWithProblems} mit Befund` : ''} → ${paths.markdown}`);
