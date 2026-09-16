/**
 * Suchintegrität nach einem Import (Teil des Bulk-Audits): Der Bestand wird wie in D1 in eine lokale
 * SQLite-Datenbank projiziert; für jede übernommene West-Norm wird geprüft, ob sie über Titel und Abkürzung
 * gefunden wird, ob §-/Artikel- und LRMB-Nummernadressen auf die richtige Stelle zeigen, ob Typfilter und
 * Jurisdiktionsgrenzen greifen und ob die länderübergreifende Suche sie liefert. Außerdem: keine synthetische
 * Fixture im Produktionsbestand, keine doppelten Sucheinheiten oder Sprungziele, FTS5-Integrität.
 */
import { join } from 'node:path';

import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { JURISDICTION_IDS, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { loadJurisdictionNorms } from '@landesrecht/legal-core/lib/loader.ts';
import { ADMINISTRATIVE_REGULATION_TYPES, type NormRecord, type NormType } from '@landesrecht/legal-core/lib/schema.ts';
import { getApplicableVersion } from '@landesrecht/legal-core/lib/versions.ts';
import { createD1NormStore } from '@landesrecht/runtime/d1-store.ts';
import { buildProjectionPlan } from '@landesrecht/runtime/projection.ts';
import { createStoreRegistry } from '@landesrecht/runtime/registry.ts';
import { checkSearchIndexIntegrity, executePlan, openSqliteD1 } from '@landesrecht/runtime/sqlite-d1.ts';
import type { NormStore } from '@landesrecht/runtime/store.ts';
import { buildSearchDocument } from '@landesrecht/search/index.ts';
import { createSearchState, extractStructuralIntents, MAX_QUERY_LENGTH } from '@landesrecht/search/query.ts';

export const SEARCH_AUDIT_CHECKS = ['title', 'abbreviation', 'structure', 'number', 'type-filter', 'jurisdiction-scope', 'all-jurisdictions', 'fixtures', 'duplicates', 'fts-integrity'] as const;
export type SearchAuditCheck = (typeof SEARCH_AUDIT_CHECKS)[number];

export interface SearchAuditResult {
  ok: boolean;
  norms: number;
  searchUnits: number;
  checks: Record<SearchAuditCheck, { passed: number; failed: number; skipped: number }>;
  failures: Array<{ slug: string; check: SearchAuditCheck; detail: string }>;
}

export function isSyntheticFixture(record: Pick<NormRecord, 'meta'>): boolean {
  return (record.meta as { dataset?: string }).dataset === 'synthetic-fixture' || record.meta.slug.startsWith('testfixture-');
}

function queryText(value: string): string {
  const text = value.replace(/\s+/gu, ' ').trim();
  if (text.length <= MAX_QUERY_LENGTH) return text;
  const cut = text.lastIndexOf(' ', MAX_QUERY_LENGTH);
  return text.slice(0, cut > 40 ? cut : MAX_QUERY_LENGTH);
}

export async function runSearchAudit(root: string, options: { jurisdictions?: readonly JurisdictionId[]; limit?: number } = {}): Promise<SearchAuditResult> {
  const db = await openSqliteD1(':memory:', { migrationsDir: join(root, 'data', 'd1') });
  const records = new Map<JurisdictionId, NormRecord[]>();
  const stores: Partial<Record<JurisdictionId, NormStore>> = {};
  for (const jurisdiction of JURISDICTION_IDS) {
    const norms = await loadJurisdictionNorms(jurisdiction, root);
    records.set(jurisdiction, norms);
    executePlan(db, buildProjectionPlan(norms, { jurisdiction, full: false, now: '2026-01-01T00:00:00.000Z' }));
    stores[jurisdiction] = createD1NormStore(db, jurisdiction);
  }
  const registry = createStoreRegistry(stores);
  const result: SearchAuditResult = { ok: true, norms: 0, searchUnits: 0, checks: Object.fromEntries(SEARCH_AUDIT_CHECKS.map((check) => [check, { passed: 0, failed: 0, skipped: 0 }])) as SearchAuditResult['checks'], failures: [] };
  const record = (check: SearchAuditCheck, slug: string, ok: boolean | undefined, detail = ''): void => {
    if (ok === undefined) {
      result.checks[check].skipped += 1;
      return;
    }
    if (ok) result.checks[check].passed += 1;
    else {
      result.checks[check].failed += 1;
      if (result.failures.length < 100) result.failures.push({ slug, check, detail });
    }
  };

  try {
    checkSearchIndexIntegrity(db);
    record('fts-integrity', '*', true);
  } catch (error) {
    record('fts-integrity', '*', false, (error as Error).message);
  }
  const duplicateUnits = db.native.prepare('SELECT norm_id, version_id, unit_index, COUNT(*) AS c FROM law_search_units GROUP BY norm_id, version_id, unit_index HAVING c > 1').all();
  const duplicateAnchors = db.native.prepare("SELECT norm_id, version_id, anchor, COUNT(*) AS c FROM law_search_units WHERE anchor <> '' GROUP BY norm_id, version_id, anchor HAVING c > 1").all() as Array<{ norm_id: string; anchor: string; c: number }>;
  record('duplicates', '*', duplicateUnits.length === 0 && duplicateAnchors.length === 0, `${duplicateUnits.length} doppelte Einheiten, ${duplicateAnchors.length} doppelte Sprungziele${duplicateAnchors.length ? ` (${duplicateAnchors.slice(0, 5).map((row) => `${row.norm_id}#${row.anchor}`).join(', ')})` : ''}`);
  result.searchUnits = Number((db.native.prepare('SELECT COUNT(*) AS c FROM law_search_units').get() as { c: number }).c);

  for (const [jurisdiction, norms] of records) for (const norm of norms) record('fixtures', norm.meta.slug, !isSyntheticFixture(norm), `synthetische Fixture ${jurisdiction}:${norm.meta.slug} im Produktionsbestand`);

  const targets = options.jurisdictions ?? ['west'];
  for (const jurisdiction of targets) {
    const store = stores[jurisdiction]!;
    const norms = (records.get(jurisdiction) ?? []).filter((norm) => !isSyntheticFixture(norm)).slice(0, options.limit ?? Number.POSITIVE_INFINITY);
    for (const norm of norms) {
      result.norms += 1;
      const slug = norm.meta.slug;
      const title = queryText(norm.meta.title);
      const found = async (state: Parameters<NormStore['search']>[0], target: NormStore | typeof registry = store): Promise<ReturnType<NormStore['search']> extends Promise<infer Page> ? Page : never> => target.search(state) as never;
      const titlePage = await found(createSearchState({ q: title, jurisdictions: [jurisdiction], limit: 20 }));
      record('title', slug, titlePage.hits.some((hit) => hit.slug === slug), `Titelsuche „${title}“ liefert die Norm nicht unter den ersten 20`);
      record('jurisdiction-scope', slug, titlePage.hits.every((hit) => hit.jurisdiction === jurisdiction), 'Suche mit Jurisdiktionsfilter liefert fremde Länder');
      if (norm.meta.abbr) {
        const abbrPage = await found(createSearchState({ q: norm.meta.abbr, jurisdictions: [jurisdiction], limit: 20 }));
        record('abbreviation', slug, abbrPage.hits.some((hit) => hit.slug === slug), `Abkürzung „${norm.meta.abbr}“ nicht gefunden`);
      } else record('abbreviation', slug, undefined);
      const allPage = await found(createSearchState({ q: title, limit: 50 }), registry);
      record('all-jurisdictions', slug, allPage.hits.some((hit) => hit.slug === slug && hit.jurisdiction === jurisdiction), 'länderübergreifende Suche liefert die Norm nicht');
      const typeFilter = norm.meta.type;
      const otherFamily: NormType = (ADMINISTRATIVE_REGULATION_TYPES as readonly string[]).includes(typeFilter) ? 'gesetz' : 'verwaltungsvorschrift';
      const typed = await found(createSearchState({ q: title, jurisdictions: [jurisdiction], types: [typeFilter], limit: 20 }));
      const foreign = await found(createSearchState({ q: title, jurisdictions: [jurisdiction], types: [otherFamily], limit: 50 }));
      record('type-filter', slug, typed.hits.some((hit) => hit.slug === slug) && !foreign.hits.some((hit) => hit.slug === slug), `Typfilter ${typeFilter}/${otherFamily} wirkt nicht`);

      const version = getApplicableVersion(norm, EDITORIAL_REFERENCE_DATE);
      const units = buildSearchDocument(norm, version, EDITORIAL_REFERENCE_DATE).units;
      // Strukturangaben im Titel („zu § 74 Absatz 4“) würden sonst als zusätzliche Adresse gelesen.
      const identity = extractStructuralIntents(norm.meta.abbr ?? norm.meta.shortTitle ?? title).remaining.replace(/\s+/gu, ' ').trim() || title;
      const provision = units.find((unit) => unit.references?.paragraph || unit.references?.article);
      if (provision?.references) {
        const address = provision.references.paragraph ? `§ ${provision.references.paragraph}` : `Art. ${provision.references.article}`;
        const page = await found(createSearchState({ q: queryText(`${address} ${identity}`), jurisdictions: [jurisdiction], limit: 20 }));
        const hit = page.hits.find((candidate) => candidate.slug === slug);
        record('structure', slug, Boolean(hit && hit.unit?.anchor === provision.anchor), `„${address} ${identity}“ zeigt nicht auf ${provision.anchor}`);
      } else record('structure', slug, undefined);
      const numbered = units.find((unit) => unit.references?.number);
      if (numbered?.references?.number) {
        const page = await found(createSearchState({ q: queryText(`Nr. ${numbered.references.number} ${identity}`), jurisdictions: [jurisdiction], limit: 20 }));
        const hit = page.hits.find((candidate) => candidate.slug === slug);
        record('number', slug, Boolean(hit && hit.unit?.references?.number === numbered.references.number), `„Nr. ${numbered.references.number} ${identity}“ zeigt nicht auf ${numbered.anchor}`);
      } else record('number', slug, undefined);
    }
  }
  db.close();
  result.ok = Object.values(result.checks).every((check) => check.failed === 0);
  return result;
}
