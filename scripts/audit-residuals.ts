#!/usr/bin/env node
/**
 * Audit 11: Reste der Quell-Landesbezeichnung in Abkürzungen und Texten sowie Slug-Qualität (offline, nur Report).
 *
 *   node scripts/audit-residuals.ts
 *
 * Abkürzungen mit „NW“/„NRW“ werden klassifiziert (amtliche Abkürzung mit Landeszusatz, geschütztes Zitat,
 * externe Institution/Programmname, Parserfehler, unklar); Textstellen mit „NW“/„NRW“ nach Kontext gezählt
 * (Fundstellen wie „GV. NW.“ sind geschützt). Slugs: Kollisionssuffixe, Quellreste, doppelte Landeszusätze,
 * rein generische, sehr kurze/mehrdeutige, am Funktionswort abgeschnittene, sehr lange. Keine Migration – Slugs sind
 * dauerhafte Adressen; Vorschläge betreffen künftige Ableitungen. Schreibt data/audits/recht-nrw/quality/residuals.{json,md}.
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { transformationRules } from '@landesrecht/importer-recht-nrw/transform/rules.ts';

import { loadWestCorpus, mdTable, repositoryRoot, writeAuditReport } from './lib/audit-common.ts';

const root = repositoryRoot();
const norms = await loadWestCorpus(root);

/* ---- Abkürzungen ------------------------------------------------------------------------------------------- */

type AbbrCategory = 'amtliche-abkuerzung-mit-landeszusatz' | 'geschuetztes-zitat' | 'externe-institution-oder-programm' | 'parserfehler' | 'unklar';

interface AbbrFinding {
  slug: string;
  abbr: string;
  shortTitleSource: string | undefined;
  type: string;
  title: string;
  category: AbbrCategory;
  reasoning: string;
  recommendation: string;
}

const GAZETTE = /\b(?:GV|SGV|MBl|SMBl|ABl)\.?\s*(?:NRW|NW)\b/u;
const INSTITUTION = /\b(?:IT|VITAL|NRW\.BANK|Fraunhofer)\b|\.NRW\b/u;

function classifyAbbreviation(abbr: string, shortTitleSource: string | undefined): { category: AbbrCategory; reasoning: string; recommendation: string } {
  if (GAZETTE.test(abbr)) return { category: 'geschuetztes-zitat', reasoning: 'Fundstellenkürzel der historischen Verkündung (bleibt unverändert)', recommendation: 'keine Änderung' };
  if (INSTITUTION.test(abbr)) return { category: 'externe-institution-oder-programm', reasoning: 'Eigenname einer Einrichtung oder eines Programms', recommendation: 'Institutionen-Zuordnung (institution-mapping.json), keine Textersetzung' };
  const suffix = /^(?<base>[A-ZÄÖÜ][\p{L}\d-]*[\p{L}\d])\s+(?<state>NRW|NW)$/u.exec(abbr);
  if (suffix) {
    if (suffix.groups!.state === 'NW') return { category: 'amtliche-abkuerzung-mit-landeszusatz', reasoning: `amtliche Abkürzung „${suffix.groups!.base}“ mit Landeszusatz in der Kurzform „NW“; Transformregeln decken nur „NRW“ ab (jurisdiction-abbreviation-known-law-*), die Kurzform bleibt daher als Quellrest stehen`, recommendation: `Regelvorschlag (nicht angewendet, erfordert Transformer-Versionssprung + Regenerationslauf): Kurzform „NW“ nach bekannter Gesetzesabkürzung → „${suffix.groups!.base} West“; nur mit known-law-Menge, keine pauschale NW-Ersetzung` };
    return { category: 'parserfehler', reasoning: 'Landeszusatz „NRW“ nicht transformiert, obwohl die Regel greifen müsste', recommendation: 'Transformlauf prüfen (Regel jurisdiction-abbreviation)' };
  }
  if (shortTitleSource !== 'official') return { category: 'parserfehler', reasoning: 'nicht amtliche Abkürzung mit Landesbezeichnung', recommendation: 'Herkunft der Abkürzung prüfen' };
  return { category: 'unklar', reasoning: 'Landesbezeichnung an unerwarteter Position', recommendation: 'Review' };
}

const abbrFindings: AbbrFinding[] = norms
  .filter((record) => record.meta.abbr && /\b(?:NRW|NW)\b|\.NRW\b/u.test(record.meta.abbr))
  .map((record) => ({ slug: record.meta.slug, abbr: record.meta.abbr!, shortTitleSource: record.meta.shortTitleSource, type: record.meta.type, title: record.meta.title, ...classifyAbbreviation(record.meta.abbr!, record.meta.shortTitleSource) }));

/* ---- Textreste „NW“ / „NRW“ ----------------------------------------------------------------------------- */

interface ResidualContext {
  context: string;
  count: number;
  norms: number;
  protectedCitation: boolean;
  examples: string[];
}

const CONTEXTS: Array<{ context: string; pattern: RegExp; protectedCitation: boolean }> = [
  { context: 'Fundstelle GV./SGV. NW.', pattern: /\b(?:GV|SGV)\.\s*NW\.?/gu, protectedCitation: true },
  { context: 'Fundstelle MBl./SMBl. NW.', pattern: /\b(?:MBl|SMBl)\.\s*NW\.?/gu, protectedCitation: true },
  { context: 'Abkürzung + NW (z. B. „GnO NW“)', pattern: /(?<![\p{L}\d.])[A-ZÄÖÜ][\p{L}\d-]*[\p{L}\d]\s+NW(?![\p{L}\d])/gu, protectedCitation: false },
  { context: 'NW sonstig (Wortgrenze)', pattern: /(?<![\p{L}\d.])NW(?![\p{L}\d])/gu, protectedCitation: false },
  { context: 'NRW (Wortgrenze, nach Transformation verbleibend)', pattern: /(?<![\p{L}\d.])NRW(?![\p{L}\d])/gu, protectedCitation: false },
  { context: 'Eigenname mit .NRW / NRW.BANK', pattern: /\b\w+\.NRW\b|\bNRW\.BANK\b/gu, protectedCitation: true },
];

function texts(blocks: readonly NormBodyBlock[], out: string[] = []): string[] {
  for (const block of blocks) {
    if (block.text) out.push(block.text);
    if (block.title) out.push(block.title);
    if (block.children) texts(block.children, out);
  }
  return out;
}

const contexts: ResidualContext[] = CONTEXTS.map((entry) => ({ context: entry.context, count: 0, norms: 0, protectedCitation: entry.protectedCitation, examples: [] }));
for (const record of norms) {
  const version = record.versions[0];
  if (!version) continue;
  const lines = texts(version.body);
  const seen = new Set<number>();
  for (const line of lines) {
    let remaining = line;
    // Kontexte in Reihenfolge: gefundene Fundstellen werden entfernt, damit „NW sonstig“ nur echte Reste zählt.
    CONTEXTS.forEach((entry, index) => {
      const matches = remaining.match(entry.pattern);
      if (!matches) return;
      contexts[index]!.count += matches.length;
      seen.add(index);
      if (contexts[index]!.examples.length < 5) contexts[index]!.examples.push(`${record.meta.slug}: …${line.slice(Math.max(0, line.search(entry.pattern) - 40), line.search(entry.pattern) + 50).replace(/\s+/gu, ' ')}…`);
      remaining = remaining.replace(entry.pattern, ' ');
    });
  }
  for (const index of seen) contexts[index]!.norms += 1;
}

/* ---- Slugs --------------------------------------------------------------------------------------------- */

const STOPWORDS = /-(?:des|der|die|und|zum|zur|fuer|von|im|in|mit|das|dem|den|ueber|auf|zu|bei|nach|aus|am|an)-west(?:-\d+)?$/u;
const GENERIC = /^(?:gesetz|verordnung|richtlinie|richtlinien|runderlass|erlass|bekanntmachung|verwaltungsvorschrift|verwaltungsvorschriften|satzung|ordnung|vertrag|staatsvertrag)-west(?:-\d+)?$/u;

interface SlugCategory {
  code: string;
  label: string;
  severity: 'info' | 'warning';
  slugs: string[];
  assessment: string;
}

const slugs = norms.map((record) => record.meta.slug);
const titles = new Map(norms.map((record) => [record.meta.slug, record.meta.title]));
const stem = (slug: string): string => slug.replace(/-west(?:-\d+)?$/u, '');
const stemGroups = new Map<string, string[]>();
for (const slug of slugs) stemGroups.set(stem(slug), [...(stemGroups.get(stem(slug)) ?? []), slug]);
const collisionGroups = [...stemGroups.entries()].filter(([, group]) => group.length > 1).map(([base, group]) => ({ base, slugs: group.sort(), sameTitle: new Set(group.map((slug) => titles.get(slug))).size === 1 }));

const categories: SlugCategory[] = [
  { code: 'slug-collision-suffix', label: 'Kollisionssuffix (numerische Term-ID angehängt)', severity: 'info', slugs: slugs.filter((slug) => /-west-\d+$/u.test(slug)).sort(), assessment: 'technisch korrekt und stabil; redaktionell unschön, wenn zwei Stammnormen denselben Titel tragen (Neufassung als eigener Datensatz). Keine Migration.' },
  { code: 'slug-double-jurisdiction-suffix', label: 'doppelter Landeszusatz („-west-west“)', severity: 'warning', slugs: slugs.filter((slug) => /-west-west(?:-\d+)?$/u.test(slug)).sort(), assessment: 'wäre ein Ableitungsfehler.' },
  { code: 'slug-jurisdiction-in-title-no-suffix', label: 'Landesname im Titel, kein „-west“-Suffix (endet auf „-westdeutschland“)', severity: 'info', slugs: slugs.filter((slug) => /-westdeutschland(?:-\d+)?$/u.test(slug)).sort(), assessment: 'gewollt: der transformierte Titel endet auf „Westdeutschland“, ein zusätzliches „-west“ würde doppeln; eindeutig und lesbar.' },
  { code: 'slug-residual-source-state', label: 'Rest der Quell-Landesbezeichnung (nrw/nw)', severity: 'warning', slugs: slugs.filter((slug) => /(?:^|-)(?:nrw|nw)(?:-|$)/u.test(slug)).sort(), assessment: 'aus amtlichen Abkürzungen („GnO NW“) oder Eigennamen (IT.NRW, NRW.BANK, VITAL.NRW, Servicekonto.NRW) abgeleitet; Adressen bleiben, Bewertung in der Abkürzungstabelle.' },
  { code: 'slug-generic-only', label: 'rein generisch (nur Gattungswort + Landeszusatz)', severity: 'warning', slugs: slugs.filter((slug) => GENERIC.test(slug)).sort(), assessment: 'nicht unterscheidbar; müsste aus Abkürzung oder Titelteil ergänzt werden.' },
  { code: 'slug-very-short-ambiguous', label: 'sehr kurz (Basis ≤ 3 Zeichen), potenziell mehrdeutig', severity: 'info', slugs: slugs.filter((slug) => stem(slug).length <= 3).sort(), assessment: 'aus amtlichen Abkürzungen (GO, LBG, HG …) – amtlich und gebräuchlich, im Land eindeutig.' },
  { code: 'slug-truncated-title', label: 'am Funktionswort abgeschnitten („…-des-west“)', severity: 'info', slugs: slugs.filter((slug) => STOPWORDS.test(slug)).sort(), assessment: 'Längenkürzung vor dem Landeszusatz; unverständliches Ende, aber eindeutig. Vorschlag nur für künftige Ableitungen: auf Wortgrenze kürzen und Funktionswörter am Ende entfernen (siehe naming.md).' },
  { code: 'slug-long', label: 'sehr lang (≥ 80 Zeichen)', severity: 'info', slugs: slugs.filter((slug) => slug.length >= 80).sort(), assessment: 'innerhalb der Längengrenze, keine Änderung.' },
  { code: 'slug-digit-leading', label: 'beginnt mit Ziffer', severity: 'info', slugs: slugs.filter((slug) => /^\d/u.test(slug)).sort(), assessment: 'aus dem Titel („3. Rundfunkänderungsgesetz“), gültig.' },
];

/* ---- Report ---------------------------------------------------------------------------------------------- */

const rulesCoverNw = transformationRules({ knownStateLawAbbreviations: new Set(['GnO']) }).some((rule) => rule.pattern.source.includes('NW(?') && !rule.pattern.source.includes('GV'));
const abbrByCategory = abbrFindings.reduce<Record<string, number>>((acc, finding) => { acc[finding.category] = (acc[finding.category] ?? 0) + 1; return acc; }, {});
const summary = {
  norms: norms.length,
  abbreviationsWithSourceState: abbrFindings.length,
  abbrByCategory,
  transformerCoversShortFormNw: rulesCoverNw,
  textResiduals: contexts.map(({ examples: _examples, ...rest }) => rest),
  slugCategories: categories.map((category) => ({ code: category.code, severity: category.severity, count: category.slugs.length })),
  collisionGroups: collisionGroups.length,
  collisionGroupsSameTitle: collisionGroups.filter((group) => group.sameTitle).length,
};

const markdown = `# Quellreste (Abkürzungen, Text) und Slug-Qualität – Audit

Erzeugt mit \`npm run audit:residuals\` (offline, alle ${norms.length} West-Normen). Nur Befund und Klassifikation; es wird nichts
geändert. Grundsatz aus \`docs/RECHT_NRW_BULK_READINESS.md\`: keine pauschale Ersetzung „NRW → West“, korrekter Text vor
kosmetischer Umbenennung. Slugs sind dauerhafte Adressen (keine Migration).

## Abkürzungen mit Landesbezeichnung (${abbrFindings.length})

| Kategorie | Anzahl |
| --- | --- |
${Object.entries(abbrByCategory).sort().map(([category, count]) => `| ${category} | ${count} |`).join('\n')}

Transformer deckt die Kurzform „NW“ nach Gesetzesabkürzungen ab: ${rulesCoverNw ? 'ja' : 'nein (nur „NRW“; siehe Regelvorschlag)'}.

${abbrFindings.length === 0 ? 'Keine.' : mdTable(['Norm', 'Abkürzung', 'Quelle', 'Typ', 'Kategorie', 'Begründung', 'Empfehlung'], abbrFindings.map((finding) => [finding.slug, finding.abbr, finding.shortTitleSource, finding.type, finding.category, finding.reasoning, finding.recommendation]))}

## Textstellen mit „NW“ / „NRW“ nach Kontext

Fundstellen (\`GV. NW.\`, \`MBl. NW.\`) und Eigennamen sind geschützt (Regel \`gazette-nw\` bzw. Institutionenregister) und
bleiben bewusst stehen. Zeilen ohne Schutz sind Kandidaten für die Transformlücke „NW“ oder Review.

${mdTable(['Kontext', 'geschützt', 'Vorkommen', 'Normen', 'Beispiele'], contexts.map((context) => [context.context, context.protectedCitation ? 'ja' : 'nein', context.count, context.norms, context.examples.slice(0, 2).join(' ‖ ')]))}

## Slug-Qualität

${mdTable(['Code', 'Schwere', 'Anzahl', 'Bewertung'], categories.map((category) => [category.code, category.severity, category.slugs.length, category.assessment]))}

Kollisionsgruppen (gleicher Stamm, Term-ID als Suffix): ${collisionGroups.length}, davon mit identischem Titel ${collisionGroups.filter((group) => group.sameTitle).length}.
Detailtabellen mit Vorschlägen: \`naming.md\` (Codes \`slug-truncated-title\`, Kollisionssuffixe).

${categories.filter((category) => category.severity === 'warning' && category.slugs.length > 0).map((category) => `### ${category.label} (${category.slugs.length})\n\n${category.slugs.map((slug) => `- \`${slug}\` – ${titles.get(slug)}`).join('\n')}`).join('\n\n') || 'Keine Warnungen.'}

### Kollisionsgruppen (${collisionGroups.length})

${collisionGroups.length === 0 ? 'Keine.' : mdTable(['Stamm', 'Slugs', 'gleicher Titel'], collisionGroups.map((group) => [group.base, group.slugs.join(', '), group.sameTitle ? 'ja' : 'nein']))}
`;

const paths = await writeAuditReport({ name: 'residuals', json: { summary, abbreviations: abbrFindings, textResiduals: contexts, slugCategories: categories, collisionGroups }, markdown }, root);
console.log(`Quellreste: ${abbrFindings.length} Abkürzungen (${Object.entries(abbrByCategory).sort().map(([key, count]) => `${key} ${count}`).join(', ')}); Slug-Warnungen ${categories.filter((category) => category.severity === 'warning').reduce((sum, category) => sum + category.slugs.length, 0)} → ${paths.markdown}`);
