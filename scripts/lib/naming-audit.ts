/**
 * Abkürzungs- und Slug-Audit des West-Bestands (offline, nur Befunde und sichere Vorschläge – es wird
 * nichts geändert). Slugs sind dauerhafte Adressen; Vorschläge gelten daher für die Registry künftiger
 * Importe bzw. für eine redaktionelle Entscheidung, nie für automatische Umbenennung.
 */
import { getJurisdiction } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';

export interface NamingIssue {
  slug: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
  value: string;
  message: string;
  suggestion?: string;
}

export interface NamingAuditResult {
  summary: {
    norms: number;
    withAbbr: number;
    withoutAbbr: number;
    withoutAbbrByType: Record<string, number>;
    issueCodes: Record<string, number>;
    errors: number;
    warnings: number;
    infos: number;
    slugLength: { max: number; over80: number; over100: number };
    collisionSuffixSlugs: number;
    duplicateAbbrGroups: number;
  };
  issues: NamingIssue[];
  collisions: Array<{ slug: string; base: string; title: string; baseTitle?: string; sameTitle: boolean; abbr?: string; baseAbbr?: string; suggestion?: string }>;
  duplicateAbbrs: Array<{ abbr: string; slugs: string[] }>;
}

const GENERIC_ABBRS = new Set(['nrw', 'nw', 'west', 'land', 'g', 'vo', 'vv', 'gesetz', 'verordnung', 'verwaltungsvorschrift', 'richtlinie', 'runderlass', 'erlass', 'bekanntmachung', 'ag', 'dvo', 'eu', 'eg', 'bund', 'de']);
const TRUNCATION_TAILS = ['des', 'der', 'die', 'das', 'und', 'oder', 'zur', 'zum', 'im', 'in', 'am', 'an', 'auf', 'aus', 'bei', 'fuer', 'von', 'vom', 'mit', 'nach', 'ueber', 'durch', 'als', 'ab', 'zu', 'den', 'dem', 'ein', 'eine', 'einer', 'eines', 'sowie', 'gemaess', 'zwischen'];
const COLLISION_SUFFIX = /^(?<base>.+)-(?<term>\d{4,6})$/u;

export function slugFromText(value: string): string {
  return value
    .replace(/ä/gu, 'ae').replace(/ö/gu, 'oe').replace(/ü/gu, 'ue').replace(/Ä/gu, 'Ae').replace(/Ö/gu, 'Oe').replace(/Ü/gu, 'Ue').replace(/ß/gu, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

export function auditNaming(norms: readonly NormRecord[]): NamingAuditResult {
  const jurisdiction = getJurisdiction('west');
  const issues: NamingIssue[] = [];
  const bySlug = new Map(norms.map((record) => [record.meta.slug, record]));
  const abbrGroups = new Map<string, string[]>();
  const summary: NamingAuditResult['summary'] = {
    norms: norms.length,
    withAbbr: 0,
    withoutAbbr: 0,
    withoutAbbrByType: {},
    issueCodes: {},
    errors: 0,
    warnings: 0,
    infos: 0,
    slugLength: { max: 0, over80: 0, over100: 0 },
    collisionSuffixSlugs: 0,
    duplicateAbbrGroups: 0,
  };
  const collisions: NamingAuditResult['collisions'] = [];
  const jurisdictionNames = new Set([jurisdiction.name, jurisdiction.shortName, 'Westdeutschland', 'Land Westdeutschland', 'West'].map((value) => value.toLowerCase()));

  for (const record of norms) {
    const { slug, abbr, title, type } = record.meta;
    const push = (severity: NamingIssue['severity'], code: string, value: string, message: string, suggestion?: string): void => {
      const issue: NamingIssue = { slug, severity, code, value, message };
      if (suggestion !== undefined) issue.suggestion = suggestion;
      issues.push(issue);
    };

    // ---- Abkürzungen ----
    if (abbr === undefined) {
      summary.withoutAbbr += 1;
      increment(summary.withoutAbbrByType, type);
    } else {
      summary.withAbbr += 1;
      const trimmed = abbr.trim();
      const lower = trimmed.toLowerCase();
      const base = trimmed.replace(/\s+West$/u, '').trim();
      abbrGroups.set(lower, [...(abbrGroups.get(lower) ?? []), slug]);
      if (trimmed.length < 2) push('error', 'abbr-too-short', trimmed, 'Abkürzung kürzer als zwei Zeichen');
      if (GENERIC_ABBRS.has(lower)) push('error', 'abbr-generic', trimmed, 'Abkürzung ist ein generisches Wort ohne Normbezug', 'Abkürzung entfernen (nur Kurztitel führen)');
      if (jurisdictionNames.has(lower)) push('error', 'abbr-equals-jurisdiction', trimmed, 'Abkürzung ist identisch mit der Jurisdiktionsbezeichnung', 'Abkürzung entfernen');
      if (/\bWest\s+West\b/u.test(trimmed) || /\bWest-West\b/u.test(trimmed)) push('error', 'abbr-double-suffix', trimmed, 'Rest von „West West“', trimmed.replace(/\bWest[\s-]+West\b/gu, 'West'));
      if (/\bNRW\b|Nordrhein|\bNW\b/u.test(trimmed)) push('error', 'abbr-residual-source-state', trimmed, 'Abkürzung enthält noch die Quell-Landesbezeichnung', trimmed.replace(/\bNRW\b|\bNW\b/gu, 'West').replace(/Nordrhein-Westfalen/gu, 'Westdeutschland'));
      if (/\sWest$/u.test(trimmed) && base.length > 0 && base.length < 2) push('warning', 'abbr-stem-too-short', trimmed, 'Abkürzung besteht nur aus einem Zeichen plus Landeszusatz');
      if (/\sWest$/u.test(trimmed) && GENERIC_ABBRS.has(base.toLowerCase())) push('warning', 'abbr-generic-with-suffix', trimmed, 'Abkürzungsstamm ist ein generisches Wort', 'Abkürzung entfernen oder redaktionell festlegen');
      if (trimmed.length > 40) push('warning', 'abbr-too-long', trimmed, `Abkürzung mit ${trimmed.length} Zeichen (eher Kurztitel als Abkürzung)`);
      if (lower === title.trim().toLowerCase()) push('info', 'abbr-equals-title', trimmed, 'Abkürzung ist identisch mit dem Langtitel');
      if (/\s{2,}|^\s|\s$/u.test(abbr)) push('warning', 'abbr-whitespace', abbr, 'Abkürzung mit überflüssigem Leerraum', trimmed.replace(/\s+/gu, ' '));
      if (!/[A-Za-zÄÖÜäöü]/u.test(trimmed)) push('error', 'abbr-no-letters', trimmed, 'Abkürzung ohne Buchstaben');
    }

    // ---- Slugs ----
    summary.slugLength.max = Math.max(summary.slugLength.max, slug.length);
    if (slug.length > 80) summary.slugLength.over80 += 1;
    if (slug.length > 100) summary.slugLength.over100 += 1;
    if (slug.length > 80) push('warning', 'slug-very-long', slug, `Slug mit ${slug.length} Zeichen`);
    if (/^\d+(?:-west)?$/u.test(slug)) push('error', 'slug-numeric-only', slug, 'Slug besteht nur aus Ziffern');
    if (/(?:^|-)west-west(?:-|$)/u.test(slug)) push('warning', 'slug-west-west', slug, 'Muster „west-west“ im Slug', slug.replace(/-west-west(?=-|$)/gu, '-west'));
    if (/(?:^|-)(?:nrw|nw|nordrhein-westfalen)(?:-|$)/u.test(slug)) push('warning', 'slug-residual-source-state', slug, 'Slug enthält noch die Quell-Landesbezeichnung (nrw/nw)');
    const segments = slug.split('-');
    const repeated = segments.filter((segment, index) => index > 0 && segment === segments[index - 1] && segment.length > 1 && segment !== 'west');
    if (repeated.length > 0) push('warning', 'slug-repeated-segment', slug, `Doppeltes Segment „${repeated[0]}“`);
    const tail = segments.at(-1) === 'west' ? segments.at(-2) : segments.at(-1);
    if (tail && TRUNCATION_TAILS.includes(tail) && !COLLISION_SUFFIX.test(slug)) push('warning', 'slug-truncated-title', slug, `Slug endet auf Funktionswort „${tail}“ (abgeschnittener Titel)`);
    const collision = slug.match(COLLISION_SUFFIX);
    if (collision) {
      summary.collisionSuffixSlugs += 1;
      const base = collision.groups!.base!;
      const baseRecord = bySlug.get(base);
      const baseTail = base.split('-').at(-1) === 'west' ? base.split('-').at(-2) : base.split('-').at(-1);
      if (baseTail && TRUNCATION_TAILS.includes(baseTail)) push('warning', 'slug-truncated-title', slug, `Slug endet auf Funktionswort „${baseTail}“ vor dem Kollisionssuffix (abgeschnittener Titel)`);
      const entry: NamingAuditResult['collisions'][number] = { slug, base, title, sameTitle: baseRecord?.meta.title === title };
      if (abbr !== undefined) entry.abbr = abbr;
      if (baseRecord) {
        entry.baseTitle = baseRecord.meta.title;
        if (baseRecord.meta.abbr !== undefined) entry.baseAbbr = baseRecord.meta.abbr;
      }
      if (!baseRecord) push('warning', 'slug-collision-without-base', slug, `Kollisionssuffix, aber kein Slug „${base}“ im Bestand`);
      else if (entry.sameTitle) push('info', 'slug-collision-same-title', slug, `Zwei Normen mit identischem Titel „${title}“ (Basis ${base})`);
      else if (abbr && baseRecord.meta.abbr && abbr !== baseRecord.meta.abbr) {
        const candidate = `${slugFromText(abbr.replace(/\s+West$/u, ''))}-west`;
        if (candidate !== base && !bySlug.has(candidate)) entry.suggestion = candidate;
        push('info', 'slug-collision-distinct-abbr', slug, `Kollision trotz abweichender Abkürzung („${abbr}“ vs. „${baseRecord.meta.abbr}“)`, entry.suggestion);
      }
      collisions.push(entry);
    }
  }

  const duplicateAbbrs = [...abbrGroups.entries()].filter(([, slugs]) => slugs.length > 1).map(([abbr, slugs]) => ({ abbr, slugs: [...slugs].sort() })).sort((left, right) => left.abbr.localeCompare(right.abbr));
  summary.duplicateAbbrGroups = duplicateAbbrs.length;
  for (const group of duplicateAbbrs) {
    for (const slug of group.slugs) issues.push({ slug, severity: 'warning', code: 'abbr-duplicate', value: group.abbr, message: `Abkürzung mehrfach vergeben (${group.slugs.length} Normen)` });
  }

  for (const issue of issues) {
    increment(summary.issueCodes, issue.code);
    if (issue.severity === 'error') summary.errors += 1;
    else if (issue.severity === 'warning') summary.warnings += 1;
    else summary.infos += 1;
  }
  issues.sort((left, right) => left.slug.localeCompare(right.slug) || left.code.localeCompare(right.code));
  collisions.sort((left, right) => left.slug.localeCompare(right.slug));
  return { summary, issues, collisions, duplicateAbbrs };
}
