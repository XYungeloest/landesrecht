#!/usr/bin/env node
/**
 * Audit 7: Sprungziele, Inhaltsübersicht, Fußnoten, Tabellen und Querverweise.
 *
 *   node scripts/audit-anchors.ts [--online] [--base-url https://…] [--sample 60] [--budget 70] [--html-cache <dir>]
 *
 * Offline werden alle Normen geprüft (Legal-Core-Anker: jeder Gliederungsblock hat ein Sprungziel, Kollisions-
 * suffixe, positionsbasierte §-Anker, Fußnoten doppelt/ohne Definition, Tabellen ohne Kopfzeile, verdächtige
 * §-Verweise). Online wird eine deterministische Stichprobe gerendert (Seed 20231201: 20 Normen mit Fußnoten,
 * 15 mit Tabellen, 15 mit Anlagen, Rest zufällig) und gegen die Offline-Erwartung geprüft.
 * Report: data/audits/recht-nrw/quality/anchors.{json,md}.
 */
import { AUDIT_SEED, createPageFetcher, DEPLOYED_SITE_URL, loadWestCorpus, mdTable, parseCliArgs, repositoryRoot, seededSample, writeAuditReport } from './lib/audit-common.ts';
import { auditNormAnchors, computeNormStats, currentVersion } from './lib/corpus-stats.ts';
import { auditOutlineAnchors, byTag, collectIds, hasClass, normalizedText, parseHtml, queryAll, summarizeTables } from './lib/html-audit.ts';
import { buildAnchorMap } from '@landesrecht/legal-core/lib/body.ts';

const { flags, values } = parseCliArgs(process.argv.slice(2));
const online = flags.has('online');
const baseUrl = (values.get('base-url') ?? DEPLOYED_SITE_URL).replace(/\/+$/u, '');
const sampleSize = Number.parseInt(values.get('sample') ?? '60', 10) || 60;
const root = repositoryRoot();
const norms = await loadWestCorpus(root);
const bySlug = new Map(norms.map((record) => [record.meta.slug, record]));

const offline = norms.map((record) => auditNormAnchors(record));
const stats = new Map(norms.map((record) => [record.meta.slug, computeNormStats(record)]));
const count = (predicate: (entry: (typeof offline)[number]) => boolean): number => offline.filter(predicate).length;
const offlineSummary = {
  norms: offline.length,
  anchorsTotal: offline.reduce((sum, entry) => sum + entry.anchors, 0),
  outlineEntriesTotal: offline.reduce((sum, entry) => sum + entry.outlineEntries, 0),
  normsWithoutOutline: count((entry) => entry.outlineEntries === 0),
  normsWithUnanchoredContainers: count((entry) => entry.unanchoredContainers.length > 0),
  normsWithCollisionAnchors: count((entry) => entry.collisionAnchors.length > 0),
  collisionAnchorsTotal: offline.reduce((sum, entry) => sum + entry.collisionAnchors.length, 0),
  normsWithPositionalUnitAnchors: count((entry) => entry.positionalUnitAnchors.length > 0),
  normsWithFootnotes: count((entry) => (stats.get(entry.slug)?.footnotes ?? 0) > 0),
  footnotesTotal: [...stats.values()].reduce((sum, entry) => sum + entry.footnotes, 0),
  normsWithDuplicateFootnotes: count((entry) => entry.duplicateFootnotes.length > 0),
  normsWithFootnoteMarksWithoutDefinition: count((entry) => entry.footnoteMarksWithoutDefinition.length > 0),
  malformedFootnotes: offline.reduce((sum, entry) => sum + entry.malformedFootnotes, 0),
  normsWithTables: count((entry) => entry.tables > 0),
  tablesTotal: offline.reduce((sum, entry) => sum + entry.tables, 0),
  tablesWithoutHeaderRow: offline.reduce((sum, entry) => sum + entry.tablesWithoutHeaderRow, 0),
  normsWithDanglingParagraphRefs: count((entry) => entry.danglingInternalParagraphRefs.length > 0),
  normsWithSourceNotes: [...stats.values()].filter((entry) => entry.sourceNotes > 0).length,
};
const offlineFindings = offline.filter((entry) => entry.unanchoredContainers.length > 0 || entry.collisionAnchors.length > 0 || entry.positionalUnitAnchors.length > 0 || entry.duplicateFootnotes.length > 0 || entry.footnoteMarksWithoutDefinition.length > 0 || entry.malformedFootnotes > 0);
const withoutOutline = offline.filter((entry) => entry.outlineEntries === 0).map((entry) => ({ slug: entry.slug, type: bySlug.get(entry.slug)!.meta.type, blocks: stats.get(entry.slug)!.blocks, units: stats.get(entry.slug)!.units }));

interface OnlineCheck {
  slug: string;
  status: number;
  durationMs: number;
  ids: number;
  duplicateIds: string[];
  outlineLinks: number;
  outlineMissing: string[];
  anchorsExpected: number;
  anchorsMissingInHtml: string[];
  footnotesRendered: number;
  footnotesExpected: number;
  sourceNotesRendered: number;
  sourceNotesExpected: number;
  tablesRendered: number;
  tablesExpected: number;
  tablesWithoutTh: number;
  tablesIrregular: number;
  headingsWithoutSeparator: number;
  genericUnitLinks: number;
  problems: string[];
}

const onlineChecks: OnlineCheck[] = [];
let requests = 0;
let sampleSlugs: string[] = [];
if (online) {
  const withFootnotes = norms.filter((record) => (stats.get(record.meta.slug)?.footnotes ?? 0) > 0).map((record) => record.meta.slug);
  const withTables = norms.filter((record) => (stats.get(record.meta.slug)?.tables ?? 0) > 0).map((record) => record.meta.slug);
  const withAnnexes = norms.filter((record) => (stats.get(record.meta.slug)?.annexes ?? 0) > 0).map((record) => record.meta.slug);
  const chosen = new Set<string>([...seededSample(withFootnotes, Math.round(sampleSize / 3), AUDIT_SEED), ...seededSample(withTables, Math.round(sampleSize / 4), AUDIT_SEED + 1), ...seededSample(withAnnexes, Math.round(sampleSize / 4), AUDIT_SEED + 2)]);
  for (const slug of seededSample(norms.map((record) => record.meta.slug), sampleSize, AUDIT_SEED + 3)) {
    if (chosen.size >= sampleSize) break;
    chosen.add(slug);
  }
  sampleSlugs = [...chosen].sort();
  const fetcher = createPageFetcher({ budget: Number.parseInt(values.get('budget') ?? '70', 10) || 70, ...(values.get('html-cache') ? { cacheDir: values.get('html-cache')! } : {}) });
  for (const slug of sampleSlugs) {
    const record = bySlug.get(slug)!;
    const version = currentVersion(record);
    const expected = stats.get(slug)!;
    const page = await fetcher.get(`${baseUrl}/west/norm/${slug}/`);
    const document = parseHtml(page.body);
    const ids = collectIds(document);
    const outline = auditOutlineAnchors(document);
    const anchors = [...buildAnchorMap(version.body).values()];
    const anchorsMissingInHtml = anchors.filter((anchor) => !ids.has(anchor));
    const footnotesRendered = queryAll(document, (element) => element.tag === 'p' && hasClass(element, 'norm-footnote')).length;
    const sourceNotesSection = queryAll(document, (element) => element.tag === 'section' && hasClass(element, 'norm-source-notes'))[0];
    const sourceNotesRendered = sourceNotesSection ? byTag(sourceNotesSection, 'li').length : 0;
    const tables = summarizeTables(document);
    const headingsWithoutSeparator = (page.body.match(/<\/span><span class="norm-title">/gu) ?? []).length;
    const genericUnitLinks = queryAll(document, (element) => element.tag === 'a' && hasClass(element, 'norm-unit__link') && normalizedText(element) === 'Link' && !element.attrs['aria-label']).length;
    const problems: string[] = [];
    if (page.status !== 200) problems.push(`HTTP ${page.status}`);
    const duplicateIds = [...ids.entries()].filter(([, occurrences]) => occurrences > 1).map(([id]) => id).sort();
    if (duplicateIds.length > 0) problems.push(`${duplicateIds.length} doppelte ids (${duplicateIds[0]})`);
    if (outline.missing.length > 0) problems.push(`${outline.missing.length} Übersichtsziele fehlen`);
    if (anchorsMissingInHtml.length > 0) problems.push(`${anchorsMissingInHtml.length} Legal-Core-Anker fehlen im HTML (${anchorsMissingInHtml[0]})`);
    if (footnotesRendered !== expected.footnotes) problems.push(`Fußnoten ${footnotesRendered} statt ${expected.footnotes}`);
    if (sourceNotesRendered !== expected.sourceNotes) problems.push(`Quellhinweise ${sourceNotesRendered} statt ${expected.sourceNotes}`);
    if (tables.length !== expected.tables) problems.push(`Tabellen ${tables.length} statt ${expected.tables}`);
    if (tables.some((table) => table.irregularRows > 0)) problems.push('Tabelle mit ungleicher Spaltenzahl');
    if (tables.some((table) => !table.regionNamed)) problems.push('Tabellencontainer ohne benannte Region');
    if (headingsWithoutSeparator > 0) problems.push(`${headingsWithoutSeparator} Überschriften ohne Trennzeichen zwischen Kennzeichen und Titel`);
    if (genericUnitLinks > 0) problems.push(`${genericUnitLinks} Einheitenlinks nur mit Text „Link“`);
    onlineChecks.push({ slug, status: page.status, durationMs: page.durationMs, ids: ids.size, duplicateIds, outlineLinks: outline.total, outlineMissing: outline.missing, anchorsExpected: anchors.length, anchorsMissingInHtml, footnotesRendered, footnotesExpected: expected.footnotes, sourceNotesRendered, sourceNotesExpected: expected.sourceNotes, tablesRendered: tables.length, tablesExpected: expected.tables, tablesWithoutTh: tables.filter((table) => table.headerCells === 0 && table.rows > 1).length, tablesIrregular: tables.filter((table) => table.irregularRows > 0).length, headingsWithoutSeparator, genericUnitLinks, problems });
    console.log(`${page.status} ${String(page.durationMs).padStart(5)}ms ${slug} ${problems.length ? `– ${problems.join('; ')}` : 'ok'}`);
  }
  requests = fetcher.requests;
}

const result = {
  offline: { summary: offlineSummary, withoutOutline, findings: offlineFindings, paragraphReferenceHints: offline.filter((entry) => entry.danglingInternalParagraphRefs.length > 0).map((entry) => ({ slug: entry.slug, references: entry.danglingInternalParagraphRefs })) },
  online: online ? { baseUrl, requests, sampleSize: sampleSlugs.length, sample: sampleSlugs, withProblems: onlineChecks.filter((check) => check.problems.length > 0).length, checks: onlineChecks } : null,
};

const problemCodes = onlineChecks.flatMap((check) => check.problems.map((problem) => problem.replace(/\d+/gu, 'n').replace(/\(.*\)/u, '').trim())).reduce<Record<string, number>>((acc, code) => { acc[code] = (acc[code] ?? 0) + 1; return acc; }, {});

const markdown = `# Sprungziele, Fußnoten, Tabellen – Audit

Erzeugt mit \`npm run audit:anchors\`${online ? ' -- --online' : ''}. Offline: alle ${offlineSummary.norms} Normen über die Legal-Core-Funktionen
(\`buildAnchorMap\`, \`buildOutline\`), Prüflogik in \`scripts/lib/corpus-stats.ts\`. Online: deterministische Stichprobe (Seed ${AUDIT_SEED}) gerenderter Seiten,
je Seite Abgleich der ids mit den erwarteten Ankern, Fußnoten-, Quellhinweis- und Tabellenzahlen sowie Überschriften-/Linktext-Prüfung.

## Offline (alle Normen)

| Kennzahl | Wert |
| --- | --- |
| Sprungziele gesamt | ${offlineSummary.anchorsTotal} |
| Einträge der Inhaltsübersicht gesamt | ${offlineSummary.outlineEntriesTotal} |
| Normen ohne Inhaltsübersicht (keine Gliederungsblöcke) | ${offlineSummary.normsWithoutOutline} |
| Normen mit Gliederungsblöcken ohne Sprungziel | ${offlineSummary.normsWithUnanchoredContainers} |
| Normen mit Kollisionssuffix-Ankern (\`--pfad\`) | ${offlineSummary.normsWithCollisionAnchors} (${offlineSummary.collisionAnchorsTotal} Anker) |
| Normen mit positionsbasierten §/Artikel-Ankern | ${offlineSummary.normsWithPositionalUnitAnchors} |
| Normen mit Fußnoten / Fußnoten gesamt | ${offlineSummary.normsWithFootnotes} / ${offlineSummary.footnotesTotal} |
| Normen mit Quellhinweisen (sourceNotes) | ${offlineSummary.normsWithSourceNotes} |
| Normen mit doppelten Fußnoten (gleiches Zeichen, gleicher Text) | ${offlineSummary.normsWithDuplicateFootnotes} |
| Normen mit Fußnotenzeichen ohne Definition | ${offlineSummary.normsWithFootnoteMarksWithoutDefinition} |
| fehlerhafte Fußnotenblöcke | ${offlineSummary.malformedFootnotes} |
| Normen mit Tabellen / Tabellen gesamt | ${offlineSummary.normsWithTables} / ${offlineSummary.tablesTotal} |
| Tabellen ohne Kopfzeile (erste Zeile ohne tableHeaderCell) | ${offlineSummary.tablesWithoutHeaderRow} |
| Normen mit §-Verweisen oberhalb des eigenen Zählbereichs (Hinweis) | ${offlineSummary.normsWithDanglingParagraphRefs} |

Einordnung: Kollisionssuffix-Anker entstehen, wenn dieselbe Gliederungsbezeichnung mehrfach vorkommt (z. B. „Erster Abschnitt“ in
mehreren Teilen); der Legal-Core vergibt dann pfadbasierte, stabile Adressen – funktional korrekt, aber nicht sprechend. Doppelte
Fußnoten sind Fußnotendefinitionen, die der Legacy-Word-Parser an jeder Verweisstelle erneut einbettet (gleiches Zeichen, gleicher
Text); die Quellzählung bleibt in den Quellhinweisen erhalten. Tabellenkopfzellen (\`tableHeaderCell\`) kommen im gesamten Bestand nicht
vor – die Parser markieren Kopfzeilen nicht; die Website rendert daher keine \`<th>\`. Der Hinweis zu §-Verweisen (Verweise oberhalb des
eigenen Zählbereichs ohne erkennbaren Normzusatz) ist eine ungeprüfte Heuristik und nur im JSON enthalten.

### Normen ohne Gliederungsblöcke (${withoutOutline.length})

Keine Inhaltsübersicht, keine Sprungziele, Suche nur über den Ergänzungstext. Bei mehr als 100 Blöcken ist eine nicht erkannte
Gliederung wahrscheinlich (Parserbefund).

${mdTable(['Norm', 'Typ', 'Blöcke', 'Sucheinheiten'], withoutOutline.map((entry) => [entry.slug, entry.type, entry.blocks, entry.units]))}

### Offline-Befunde (${offlineFindings.length} Normen)

${offlineFindings.length === 0 ? 'Keine.' : mdTable(['Norm', 'ohne Anker', 'Kollisionsanker', 'positionsbasiert', 'doppelte Fußnoten', 'Fußnoten ohne Definition', 'fehlerhaft'], offlineFindings.map((entry) => [entry.slug, entry.unanchoredContainers.length, entry.collisionAnchors.slice(0, 3).join(', ') + (entry.collisionAnchors.length > 3 ? ` (+${entry.collisionAnchors.length - 3})` : ''), entry.positionalUnitAnchors.slice(0, 3).join(', ') + (entry.positionalUnitAnchors.length > 3 ? ` (+${entry.positionalUnitAnchors.length - 3})` : ''), entry.duplicateFootnotes.join(', '), entry.footnoteMarksWithoutDefinition.join(', '), entry.malformedFootnotes]))}

## Online-Stichprobe${online ? ` (${baseUrl}, ${requests} Abrufe, ${sampleSlugs.length} Seiten)` : ''}

Prüfstand ist der abgefragte Server: Änderungen an \`apps/web/src\` wirken auf der deployten Site erst nach einem Redeploy;
lokale Gegenprüfung mit \`npm run audit:anchors -- --online --base-url http://localhost:<port>\` (Dev-Server in \`apps/web\`).

${online
    ? `${result.online!.withProblems} von ${onlineChecks.length} Seiten mit Befunden. Befundarten: ${Object.entries(problemCodes).sort().map(([code, total]) => `${code} ×${total}`).join('; ') || 'keine'}.

${mdTable(['Norm', 'HTTP', 'ms', 'ids', 'Übersicht', 'fehlend', 'Anker (Soll)', 'fehlend im HTML', 'Fußnoten (Soll)', 'Quellhinweise (Soll)', 'Tabellen (Soll)', 'ohne th', 'Befunde'], onlineChecks.map((check) => [check.slug, check.status, check.durationMs, check.ids, check.outlineLinks, check.outlineMissing.length, `${check.anchorsExpected}`, check.anchorsMissingInHtml.length, `${check.footnotesRendered} (${check.footnotesExpected})`, `${check.sourceNotesRendered} (${check.sourceNotesExpected})`, `${check.tablesRendered} (${check.tablesExpected})`, check.tablesWithoutTh, check.problems.join('; ')]))}`
    : 'Nicht ausgeführt (Option `--online`).'}
`;

const paths = await writeAuditReport({ name: 'anchors', json: result, markdown }, root);
console.log(`Anker-Audit: ${offlineFindings.length} Normen mit Offline-Befunden${online ? `, online ${result.online!.withProblems}/${onlineChecks.length} Seiten mit Befunden (${requests} Abrufe)` : ''} → ${paths.markdown}`);
