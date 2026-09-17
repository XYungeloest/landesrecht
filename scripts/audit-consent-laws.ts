#!/usr/bin/env node
/**
 * Audit 10: Zustimmungsgesetze (Staatsverträge) des West-Bestands – Titel, Zustimmungsformel, Normtyp, Anlagen,
 * Suchfilter und Darstellung (offline vollständig; `--online` prüft eine deterministische Stichprobe gegen die Website).
 *
 *   node scripts/audit-consent-laws.ts [--online] [--base-url https://…] [--sample 5] [--budget 10]
 *
 * Nur Befund und Klassifikation, nichts wird geändert. Schreibt data/audits/recht-nrw/quality/consent-laws.{json,md}.
 */
import type { NormBodyBlock, NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import { readManifest, type ManifestEntry } from '@landesrecht/importer-recht-nrw/common/manifest.ts';

import { createPageFetcher, DEPLOYED_SITE_URL, loadWestCorpus, mdTable, parseCliArgs, repositoryRoot, seededSample, writeAuditReport } from './lib/audit-common.ts';
import { byTag, collectIds, normalizedText, parseHtml, queryAll } from './lib/html-audit.ts';

const { flags, values } = parseCliArgs(process.argv.slice(2));
const online = flags.has('online');
const baseUrl = (values.get('base-url') ?? DEPLOYED_SITE_URL).replace(/\/$/u, '');
const sampleSize = Number.parseInt(values.get('sample') ?? '5', 10);
const budget = Number.parseInt(values.get('budget') ?? '10', 10);

const root = repositoryRoot();
const manifest = await readManifest(root);
const norms = await loadWestCorpus(root);
const bySlug = new Map(norms.map((record) => [record.meta.slug, record]));

/** Zustimmungsformeln, wie RECHT.NRW sie druckt (Artikel 1 / § 1): „Dem … wird zugestimmt.“ oder „… wird Zustimmung erteilt“. */
const FORMULA = /\bwird zugestimmt\b|\bzugestimmt wird\b|\bZustimmung erteilt\b|\bstimmt .* zu\b/u;
const SOURCE_STATE = /Nordrhein-Westfalen|nordrhein-westfälisch|\bNRW\b/u;

function walk(blocks: readonly NormBodyBlock[], visit: (block: NormBodyBlock) => void): void {
  for (const block of blocks) {
    visit(block);
    if (block.children) walk(block.children, visit);
  }
}

interface ConsentFinding {
  sourceIdentity: string;
  slug: string;
  importStatus: ManifestEntry['importStatus'];
  type: string | undefined;
  abbr: string | undefined;
  title: string;
  titleResidualSourceState: boolean;
  formulaFound: boolean;
  formulaText?: string;
  treatyTextLocation: string;
  annexes: number;
  tables: number;
  pdfAttachments: number;
  textCompleteness: string | undefined;
  blocks: number;
  classification: 'vollständig' | 'formel-fehlt' | 'vertragstext-extern' | 'typ-abweichend';
  note: string;
}

const findings: ConsentFinding[] = manifest.entries.filter((entry) => entry.consentLaw?.detected).map((entry) => {
  const record: NormRecord | undefined = bySlug.get(entry.targetSlug);
  const body = record?.versions[0]?.body ?? [];
  let formulaText: string | undefined;
  let annexes = 0;
  let tables = 0;
  let blocks = 0;
  walk(body, (block) => {
    blocks += 1;
    if (block.type === 'annex') annexes += 1;
    if (block.type === 'table') tables += 1;
    if (!formulaText && block.text && FORMULA.test(block.text)) formulaText = block.text.slice(0, 160);
  });
  const pdfAttachments = (entry.attachments ?? []).filter((attachment) => /pdf/iu.test(attachment.mediaType)).length;
  const location = entry.consentLaw?.treatyTextLocation ?? 'unknown';
  const type = record?.meta.type;
  let classification: ConsentFinding['classification'] = 'vollständig';
  let note = 'Formel im Gesetzestext, Typ zustimmungsgesetz';
  if (type !== 'zustimmungsgesetz') {
    classification = 'typ-abweichend';
    note = `Normtyp ${type ?? 'ohne Inhalt'} statt zustimmungsgesetz`;
  } else if (!formulaText) {
    classification = 'formel-fehlt';
    note = 'keine Zustimmungsformel im übernommenen Text erkannt (Titel/Erkennung tragen die Einordnung)';
  } else if (location === 'pdf-attachment' || (location === 'unknown' && annexes === 0)) {
    classification = 'vertragstext-extern';
    note = location === 'pdf-attachment' ? `Vertragstext nur als PDF-Anlage (${pdfAttachments} PDF, ${entry.textCompleteness ?? '–'})` : 'Vertragstext nicht im HTML enthalten (Ort unbekannt)';
  }
  return {
    sourceIdentity: entry.sourceIdentity,
    slug: entry.targetSlug,
    importStatus: entry.importStatus,
    type,
    abbr: record?.meta.abbr,
    title: record?.meta.title ?? entry.sourceTitle,
    titleResidualSourceState: SOURCE_STATE.test(record?.meta.title ?? ''),
    formulaFound: formulaText !== undefined,
    ...(formulaText ? { formulaText } : {}),
    treatyTextLocation: location,
    annexes,
    tables,
    pdfAttachments,
    textCompleteness: entry.textCompleteness,
    blocks,
    classification,
    note,
  };
}).sort((left, right) => left.slug.localeCompare(right.slug));

const contentConsent = norms.filter((record) => record.meta.type === 'zustimmungsgesetz').map((record) => record.meta.slug);
const manifestSlugs = new Set(findings.map((finding) => finding.slug));
const typeWithoutDetection = contentConsent.filter((slug) => !manifestSlugs.has(slug));

/* ---- Online-Stichprobe: Normseite, Länderseite mit Typfilter, Such-API mit Typfilter ---------------------- */

interface PageCheck {
  slug: string;
  url: string;
  status: number;
  durationMs: number;
  h1: string;
  titleMatches: boolean;
  typeLabelShown: boolean;
  formulaRendered: boolean;
  annexHeadings: number;
  tables: number;
  duplicateIds: number;
  problems: string[];
}

const pageChecks: PageCheck[] = [];
let listCheck: { url: string; status: number; count: number | null; listed: number; expected: number; ok: boolean } | undefined;
let apiCheck: { url: string; status: number; total: number | null; typesOnlyConsent: boolean; sampleFound: string[]; sampleMissing: string[] } | undefined;

if (online) {
  const fetcher = createPageFetcher({ budget, delayMs: 300 });
  const sample = seededSample(findings.map((finding) => finding.slug), sampleSize);
  for (const slug of sample) {
    const finding = findings.find((entry) => entry.slug === slug)!;
    const url = `${baseUrl}/west/norm/${slug}/`;
    const page = await fetcher.get(url);
    const document = parseHtml(page.body);
    const h1 = normalizedText(byTag(document, 'h1')[0] ?? document).slice(0, 120);
    const text = normalizedText(document);
    const duplicateIds = [...collectIds(document).values()].filter((count) => count > 1).length;
    const annexHeadings = queryAll(document, (element) => /^h[2-6]$/u.test(element.tag) && /^Anlage\b/u.test(normalizedText(element))).length;
    const problems: string[] = [];
    if (!page.ok) problems.push(`HTTP ${page.status}`);
    const titleMatches = h1.length > 0 && finding.title.toLowerCase().startsWith(h1.replace(/…$/u, '').slice(0, 40).toLowerCase());
    if (!titleMatches) problems.push('Titel der Seite weicht vom Bestand ab');
    const typeLabelShown = /Zustimmungsgesetz/u.test(text);
    if (!typeLabelShown) problems.push('Typbezeichnung „Zustimmungsgesetz“ nicht auf der Seite');
    const formulaRendered = finding.formulaText ? text.includes(finding.formulaText.slice(0, 60)) : false;
    if (finding.formulaText && !formulaRendered) problems.push('Zustimmungsformel nicht im gerenderten Text');
    if (duplicateIds > 0) problems.push(`${duplicateIds} doppelte ids`);
    pageChecks.push({ slug, url, status: page.status, durationMs: page.durationMs, h1, titleMatches, typeLabelShown, formulaRendered, annexHeadings, tables: byTag(document, 'table').length, duplicateIds, problems });
  }
  const listUrl = `${baseUrl}/west/?type=zustimmungsgesetz`;
  const list = await fetcher.get(listUrl);
  // Die Überschrift nennt den Gesamtbestand; die gefilterte Zählung steht in „N von M Normen: <Typ>.“ und in der Trefferliste.
  const countMatch = /(\d+) von (\d+) Normen: Zustimmungsgesetz/u.exec(list.body);
  const listed = (list.body.match(/<h3 class="hit__title"/gu) ?? []).length;
  const count = countMatch ? Number(countMatch[1]) : null;
  listCheck = { url: listUrl, status: list.status, count, listed, expected: contentConsent.length, ok: list.ok && count === contentConsent.length && listed === contentConsent.length };
  const apiUrl = `${baseUrl}/api/v1/search?q=Staatsvertrag&jurisdiction=west&type=zustimmungsgesetz&limit=50`;
  const api = await fetcher.get(apiUrl);
  let total: number | null = null;
  let typesOnlyConsent = false;
  const found = new Set<string>();
  try {
    const parsed = JSON.parse(api.body) as { total?: number; hits?: Array<{ slug: string; type: string }> };
    total = parsed.total ?? null;
    typesOnlyConsent = (parsed.hits ?? []).length > 0 && (parsed.hits ?? []).every((hit) => hit.type === 'zustimmungsgesetz');
    for (const hit of parsed.hits ?? []) found.add(hit.slug);
  } catch {
    total = null;
  }
  apiCheck = { url: apiUrl, status: api.status, total, typesOnlyConsent, sampleFound: sample.filter((slug) => found.has(slug)), sampleMissing: sample.filter((slug) => !found.has(slug)) };
}

/* ---- Report ---------------------------------------------------------------------------------------------- */

const byClassification = findings.reduce<Record<string, number>>((acc, finding) => { acc[finding.classification] = (acc[finding.classification] ?? 0) + 1; return acc; }, {});
const byLocation = findings.reduce<Record<string, number>>((acc, finding) => { acc[finding.treatyTextLocation] = (acc[finding.treatyTextLocation] ?? 0) + 1; return acc; }, {});
const summary = {
  consentLaws: findings.length,
  contentTypeConsent: contentConsent.length,
  typeWithoutDetection,
  byClassification,
  byLocation,
  formulaFound: findings.filter((finding) => finding.formulaFound).length,
  titleResidualSourceState: findings.filter((finding) => finding.titleResidualSourceState).length,
  withAbbr: findings.filter((finding) => finding.abbr).length,
  online: online ? { pages: pageChecks.length, pagesWithProblems: pageChecks.filter((check) => check.problems.length > 0).length, listOk: listCheck?.ok ?? null, apiTypesOnlyConsent: apiCheck?.typesOnlyConsent ?? null } : null,
};

const markdown = `# Zustimmungsgesetze (Staatsverträge) – Audit

Erzeugt mit \`npm run audit:consent-laws\`${online ? ' -- --online' : ''}. Offline: alle im Manifest erkannten Zustimmungsgesetze
(\`consentLaw.detected\`) gegen den Bestand \`content/norms/west/\`: Titel (Rest der Quell-Landesbezeichnung?), Zustimmungsformel
im Text, Normtyp, Ort des Vertragstexts, Anlagen/Tabellen/PDF. Online: deterministische Stichprobe (Seed 20231201) der Normseiten,
Länderseite mit Typfilter und Such-API mit Typfilter. Nur Befund, keine Änderung.

## Ergebnis

| Kennzahl | Wert |
| --- | --- |
| Zustimmungsgesetze laut Manifest | ${summary.consentLaws} |
| Normen mit Typ \`zustimmungsgesetz\` im Bestand | ${summary.contentTypeConsent}${typeWithoutDetection.length ? ` (ohne Manifesterkennung: ${typeWithoutDetection.join(', ')})` : ''} |
| Zustimmungsformel im Text erkannt | ${summary.formulaFound} / ${summary.consentLaws} |
| Titel mit Rest der Quell-Landesbezeichnung | ${summary.titleResidualSourceState} |
| mit Abkürzung | ${summary.withAbbr} |
| Klassifikation | ${Object.entries(byClassification).sort().map(([key, count]) => `${key} ${count}`).join(', ')} |
| Ort des Vertragstexts | ${Object.entries(byLocation).sort().map(([key, count]) => `${key} ${count}`).join(', ')} |

Klassifikation: \`vollständig\` = Typ, Formel und Vertragstext (HTML-Anlage oder inline) vorhanden; \`vertragstext-extern\` = Zustimmungs-
gesetz vollständig, Vertragstext nur als PDF-Anlage bzw. nicht im HTML (Quellenlage RECHT.NRW, kein Importfehler – Anlage ist
archiviert und auf der Quellenseite verlinkt); \`formel-fehlt\` = keine Formel im Text erkannt (Einordnung beruht auf Titel und
Erkennungsbelegen); \`typ-abweichend\` = Normtyp weicht ab (Prüfbedarf).

## Alle Zustimmungsgesetze (${findings.length})

${mdTable(['Norm', 'Abk.', 'Typ', 'Formel', 'Vertragstext', 'Anlagen', 'Tabellen', 'PDF', 'Klassifikation', 'Hinweis'], findings.map((finding) => [finding.slug, finding.abbr ?? '', finding.type ?? '', finding.formulaFound ? 'ja' : 'nein', finding.treatyTextLocation, finding.annexes, finding.tables, finding.pdfAttachments, finding.classification, finding.note]))}

## Stichprobe online (${pageChecks.length})

${online ? `Basis \`${baseUrl}\`.

${mdTable(['Norm', 'HTTP', 'ms', 'h1', 'Titel ok', 'Typ sichtbar', 'Formel gerendert', 'Anlagen-Überschriften', 'Tabellen', 'doppelte ids', 'Befunde'], pageChecks.map((check) => [check.slug, check.status, check.durationMs, check.h1, check.titleMatches ? 'ja' : 'nein', check.typeLabelShown ? 'ja' : 'nein', check.formulaRendered ? 'ja' : 'nein', check.annexHeadings, check.tables, check.duplicateIds, check.problems.join('; ')]))}

Länderseite mit Typfilter: \`${listCheck?.url}\` → HTTP ${listCheck?.status}, Zählung „${listCheck?.count ?? '–'} von … Normen“, ${listCheck?.listed} Listeneinträge (erwartet ${listCheck?.expected}) – ${listCheck?.ok ? 'ok' : 'ABWEICHUNG'}.

Such-API mit Typfilter: \`${apiCheck?.url}\` → HTTP ${apiCheck?.status}, ${apiCheck?.total ?? '–'} Treffer, nur Typ zustimmungsgesetz: ${apiCheck?.typesOnlyConsent ? 'ja' : 'nein'};
Stichprobe gefunden: ${apiCheck?.sampleFound.join(', ') || '–'}${apiCheck?.sampleMissing.length ? `; nicht gefunden: ${apiCheck.sampleMissing.join(', ')}` : ''}.` : 'Nicht ausgeführt (`--online`).'}
`;

const paths = await writeAuditReport({ name: 'consent-laws', json: { summary, findings, online: online ? { baseUrl, pageChecks, listCheck, apiCheck } : null }, markdown }, root);
console.log(`Zustimmungsgesetze: ${findings.length} (${Object.entries(byClassification).sort().map(([key, count]) => `${key} ${count}`).join(', ')})${online ? `; online ${pageChecks.length} Seiten, ${summary.online?.pagesWithProblems} mit Befund` : ''} → ${paths.markdown}`);
