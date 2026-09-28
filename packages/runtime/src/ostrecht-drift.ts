/**
 * Drift-/Freshness-Audit der OstRecht-D1 aus Sicht des Landesrecht-Adapters (`npm run audit:ost-drift`).
 *
 * Nur Leseabfragen über dieselbe Read-only-Hülle wie der Worker. Geprüft werden Schema-Contract, `sync_state`,
 * Projektionsidentität (`projection_fingerprint`, `corpus_hash`, `last_sync_at`), Zähler (Normen, Fassungen,
 * Sucheinheiten, Suchdokumente, Verkündungen) sowie eine deterministische Store-Stichprobe: Übersicht und Datensatz
 * des Adapters gegen die Rohzeilen von OstRecht (Version-IDs, Baseline-Regel, Titel, Status), Suchparität (FTS-Treffer
 * von OstRecht vs. Kandidaten des Adapters) und Verkündungsadaption. Die Laufzeit braucht kein lokales Repository;
 * der Abgleich D1 ↔ OstRecht-Git ist ein zusätzlicher, optionaler Schritt der CLI.
 */
import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { createSearchState } from '@landesrecht/search/query.ts';

import { checkOstRechtSchemaContract, type OstRechtContractReport } from './ostrecht-contract.ts';
import { createOstRechtD1Store, OSTRECHT_RUNTIME_META_KEYS } from './ostrecht-d1-store.ts';
import type { ReadOnlyD1Database } from './read-only-d1.ts';

export interface OstRechtDriftCounts {
  norms: number;
  normsInScope: number;
  versions: number;
  versionsInScope: number;
  searchUnits: number;
  /** Fassungen mit Sucheinheiten (OstRecht indexiert nur die an seinem Stichtag geltende Fassung). */
  indexedVersions: number;
  /** Am Landesrecht-Stichtag geltende Fassungen ohne Sucheinheiten: in der Suche unsichtbar (OstRecht-Stichtag hinkt). */
  currentVersionsWithoutUnits: number;
  searchDocuments: number;
  publications: number;
}

export interface OstRechtDriftSample {
  slug: string;
  ok: boolean;
  problems: string[];
  versionIds: string[];
  baselineVersionId: string | null;
}

export interface OstRechtSearchParity {
  query: string;
  upstreamFtsVersions: number;
  adapterTotal: number;
  firstHit: string | null;
  ok: boolean;
}

export interface OstRechtDriftReport {
  ok: boolean;
  checkedAt: string;
  contract: OstRechtContractReport;
  identity: { syncState: string | null; syncedAt: string | null; corpusHash: string | null; projectionFingerprint: string | null; projectionScope: string | null; syncMode: string | null };
  metaCounts: { normCount: number | null; publicationCount: number | null; searchDocumentCount: number | null };
  counts: OstRechtDriftCounts;
  samples: OstRechtDriftSample[];
  searchParity: OstRechtSearchParity[];
  publications: { checked: number; problems: string[] };
  problems: string[];
}

export interface OstRechtDriftOptions {
  /** Anzahl der Normen der Stichprobe (deterministisch: gleichmäßig über die sortierte Kennungsliste verteilt). */
  sample?: number;
  /** Zusätzliche, immer geprüfte Kennungen (etwa Normen mit mehreren Fassungen). */
  slugs?: string[];
  /** Suchanfragen für die Paritätsprüfung. */
  queries?: string[];
  /** Landesrecht-Stichtag (Standard: EDITORIAL_REFERENCE_DATE). */
  asOf?: string;
  now?: () => Date;
}

const DEFAULT_QUERIES = ['Gesetz', 'Verordnung', 'Gemeindeordnung', 'Schulgesetz'];

async function count(db: Pick<ReadOnlyD1Database, 'prepare'>, sql: string): Promise<number> {
  return Number((await db.prepare(sql).first<{ n: number }>())?.n ?? 0);
}

export async function auditOstRechtDrift(db: ReadOnlyD1Database, options: OstRechtDriftOptions = {}): Promise<OstRechtDriftReport> {
  const now = options.now ?? (() => new Date());
  const problems: string[] = [];
  const contract = await checkOstRechtSchemaContract(db, now);
  if (!contract.ok) {
    return {
      ok: false,
      checkedAt: now().toISOString(),
      contract,
      identity: { syncState: contract.meta.sync_state ?? null, syncedAt: null, corpusHash: null, projectionFingerprint: null, projectionScope: null, syncMode: null },
      metaCounts: { normCount: null, publicationCount: null, searchDocumentCount: null },
      counts: { norms: 0, normsInScope: 0, versions: 0, versionsInScope: 0, searchUnits: 0, indexedVersions: 0, currentVersionsWithoutUnits: 0, searchDocuments: 0, publications: 0 },
      samples: [],
      searchParity: [],
      publications: { checked: 0, problems: [] },
      problems: [...contract.problems],
    };
  }
  const meta = contract.meta;
  const identity = {
    syncState: meta[OSTRECHT_RUNTIME_META_KEYS.syncState] ?? null,
    syncedAt: meta[OSTRECHT_RUNTIME_META_KEYS.lastSyncAt] ?? null,
    corpusHash: meta[OSTRECHT_RUNTIME_META_KEYS.corpusHash] ?? null,
    projectionFingerprint: meta[OSTRECHT_RUNTIME_META_KEYS.projectionFingerprint] ?? null,
    projectionScope: meta[OSTRECHT_RUNTIME_META_KEYS.projectionScope] ?? null,
    syncMode: meta[OSTRECHT_RUNTIME_META_KEYS.syncMode] ?? null,
  };
  const metaCounts = {
    normCount: meta.norm_count ? Number(meta.norm_count) : null,
    publicationCount: meta.publication_count ? Number(meta.publication_count) : null,
    searchDocumentCount: meta.search_document_count ? Number(meta.search_document_count) : null,
  };

  const baseline = `'${SIMULATION_BASELINE_DATE}'`;
  const asOf = options.asOf ?? EDITORIAL_REFERENCE_DATE;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(asOf)) throw new Error(`Kein ISO-Datum: ${asOf}`);
  const counts: OstRechtDriftCounts = {
    norms: await count(db, 'SELECT count(*) AS n FROM law_norms'),
    normsInScope: await count(db, `SELECT count(*) AS n FROM law_norms n WHERE EXISTS (SELECT 1 FROM law_versions x WHERE x.norm_id = n.id AND (x.valid_to IS NULL OR x.valid_to >= ${baseline}))`),
    versions: await count(db, 'SELECT count(*) AS n FROM law_versions'),
    versionsInScope: await count(db, `SELECT count(*) AS n FROM law_versions x WHERE x.valid_to IS NULL OR x.valid_to >= ${baseline}`),
    searchUnits: await count(db, 'SELECT count(*) AS n FROM law_search_units'),
    indexedVersions: await count(db, 'SELECT count(*) AS n FROM (SELECT DISTINCT norm_id, version_id FROM law_search_units)'),
    currentVersionsWithoutUnits: await count(db, `SELECT count(*) AS n FROM law_versions v JOIN law_norms n ON n.id = v.norm_id
      WHERE v.valid_from <= '${asOf}' AND (v.valid_to IS NULL OR v.valid_to >= '${asOf}') AND n.status NOT IN ('repealed', 'historical', 'pending-effective')
        AND NOT EXISTS (SELECT 1 FROM law_search_units u WHERE u.norm_id = v.norm_id AND u.version_id = v.version_id)`),
    searchDocuments: await count(db, 'SELECT count(*) AS n FROM law_search_documents'),
    publications: await count(db, 'SELECT count(*) AS n FROM law_publications'),
  };
  if (metaCounts.normCount !== null && metaCounts.normCount !== counts.norms) problems.push(`norm_count ${metaCounts.normCount} ≠ law_norms ${counts.norms}`);
  if (metaCounts.publicationCount !== null && metaCounts.publicationCount !== counts.publications) problems.push(`publication_count ${metaCounts.publicationCount} ≠ law_publications ${counts.publications}`);
  if (metaCounts.searchDocumentCount !== null && metaCounts.searchDocumentCount !== counts.searchDocuments) problems.push(`search_document_count ${metaCounts.searchDocumentCount} ≠ law_search_documents ${counts.searchDocuments}`);
  if (counts.searchDocuments !== counts.versions) problems.push(`law_search_documents ${counts.searchDocuments} ≠ law_versions ${counts.versions}`);
  const ftsRows = await count(db, 'SELECT count(*) AS n FROM law_search');
  if (ftsRows !== counts.searchUnits) problems.push(`law_search (FTS) ${ftsRows} ≠ law_search_units ${counts.searchUnits}`);
  if (counts.currentVersionsWithoutUnits > 0) problems.push(`${counts.currentVersionsWithoutUnits} am Landesrecht-Stichtag ${asOf} geltende Fassung(en) ohne Sucheinheiten (OstRecht-Sync mit jüngerem Stichtag nötig)`);

  // Der Contract wurde oben vollständig geprüft; der Store nutzt den Cache (Remote: jede Abfrage ist ein Wrangler-Aufruf).
  const store = createOstRechtD1Store(db);
  const stats = await store.getStats();
  if (stats.normCount !== counts.normsInScope) problems.push(`Store normCount ${stats.normCount} ≠ Normen im Bestand ${counts.normsInScope}`);
  if (stats.versionCount !== counts.versionsInScope) problems.push(`Store versionCount ${stats.versionCount} ≠ Fassungen im Bestand ${counts.versionsInScope}`);

  // Stichprobe: gleichmäßig über die sortierte Kennungsliste, plus explizite Kennungen.
  const sampleSize = Math.max(0, options.sample ?? 12);
  const ids = (await db.prepare('SELECT id FROM law_norms ORDER BY id').all<{ id: string }>()).results.map((row) => row.id);
  const picked = new Set<string>(options.slugs ?? []);
  for (let index = 0; index < sampleSize && ids.length > 0; index += 1) picked.add(ids[Math.floor((index * ids.length) / Math.max(sampleSize, 1))]!);
  const samples: OstRechtDriftSample[] = [];
  for (const slug of [...picked].sort()) {
    const sample: OstRechtDriftSample = { slug, ok: true, problems: [], versionIds: [], baselineVersionId: null };
    const raw = await db.prepare('SELECT id, title, status, meta_json FROM law_norms WHERE id = ?').bind(slug).first<{ id: string; title: string; status: string; meta_json: string }>();
    if (!raw) {
      sample.problems.push('nicht in law_norms');
    } else {
      const rawVersions = (await db.prepare('SELECT version_id, valid_from, valid_to FROM law_versions WHERE norm_id = ? ORDER BY valid_from').bind(slug).all<{ version_id: string; valid_from: string; valid_to: string | null }>()).results;
      const inScope = rawVersions.filter((version) => version.valid_to === null || version.valid_to >= SIMULATION_BASELINE_DATE);
      const summary = await store.getNormSummary(slug);
      const record = await store.getNorm(slug, 'none');
      if (inScope.length === 0) {
        if (summary || record) sample.problems.push('ohne Fassung am Ausgangsrechtsstand, aber im Store sichtbar');
      } else {
        if (!summary || !record) sample.problems.push('im Store nicht lesbar');
        else {
          sample.versionIds = record.versions.map((version) => version.versionId);
          if (sample.versionIds.join('|') !== inScope.map((version) => version.version_id).join('|')) sample.problems.push(`Version-IDs ${sample.versionIds.join(',')} ≠ OstRecht ${inScope.map((version) => version.version_id).join(',')}`);
          const first = record.versions[0]!;
          const rawFirst = inScope[0]!;
          sample.baselineVersionId = rawFirst.valid_from < SIMULATION_BASELINE_DATE ? rawFirst.version_id : null;
          if (rawFirst.valid_from < SIMULATION_BASELINE_DATE && first.simulationValidFrom !== SIMULATION_BASELINE_DATE) sample.problems.push(`Baseline-Regel: erste Fassung beginnt ${first.simulationValidFrom}`);
          if (rawFirst.valid_from >= SIMULATION_BASELINE_DATE && first.simulationValidFrom !== rawFirst.valid_from) sample.problems.push(`Eigene Fassung verschoben: ${first.simulationValidFrom} ≠ ${rawFirst.valid_from}`);
          if (summary.versionCount !== inScope.length) sample.problems.push(`versionCount ${summary.versionCount} ≠ ${inScope.length}`);
          const meta = JSON.parse(raw.meta_json) as { slug?: string; title?: string };
          if (meta.slug !== slug) sample.problems.push('meta_json.slug weicht von der Kennung ab');
          // law_norms.title trägt die aktuelle Bezeichnung (Umbenennung durch Fassung), meta_json.title die ursprüngliche.
          if (record.meta.title !== meta.title) sample.problems.push('Titel weicht von meta_json ab');
          if (summary.title !== raw.title) sample.problems.push('Übersichtstitel weicht von law_norms.title ab');
          if (!record.meta.externalIdentifiers.some((identifier) => identifier.system === 'ostrecht' && identifier.value === slug)) sample.problems.push('OstRecht-Kennung fehlt in externalIdentifiers');
        }
      }
    }
    sample.ok = sample.problems.length === 0;
    samples.push(sample);
  }

  // Suchparität: OstRecht-FTS (Fassungen mit Treffer) gegen die Gesamtzahl des Adapters über alle Fassungen.
  const searchParity: OstRechtSearchParity[] = [];
  for (const query of options.queries ?? DEFAULT_QUERIES) {
    const upstream = await count(db, `SELECT count(*) AS n FROM (SELECT DISTINCT u.norm_id, u.version_id FROM law_search s JOIN law_search_units u ON u.id = s.rowid JOIN law_versions v ON v.norm_id = u.norm_id AND v.version_id = u.version_id WHERE law_search MATCH '"${query.replace(/"/gu, '""')}"' AND (v.valid_to IS NULL OR v.valid_to >= ${baseline}))`);
    const page = await store.search(createSearchState({ q: query, jurisdictions: ['ost'], versionScope: 'all', limit: 5 }));
    // Der Adapter zählt im Plan `and-first` dieselbe Menge; ein OR-Plan kann mehr liefern, nie weniger.
    const ok = page.total >= upstream || upstream === 0;
    searchParity.push({ query, upstreamFtsVersions: upstream, adapterTotal: page.total, firstHit: page.hits[0]?.slug ?? null, ok });
    if (!ok) problems.push(`Suchparität „${query}“: Adapter ${page.total} < OstRecht-FTS ${upstream}`);
  }

  const publicationProblems: string[] = [];
  let checked = 0;
  try {
    const publications = await store.listPublications();
    checked = publications.length;
    if (publications.length !== counts.publications) publicationProblems.push(`Store liefert ${publications.length} von ${counts.publications} Verkündungen`);
  } catch (error) {
    publicationProblems.push(String((error as Error)?.message ?? error));
  }
  problems.push(...publicationProblems);
  for (const sample of samples) if (!sample.ok) problems.push(`Stichprobe ${sample.slug}: ${sample.problems.join('; ')}`);

  return {
    ok: problems.length === 0 && contract.ok,
    checkedAt: now().toISOString(),
    contract,
    identity,
    metaCounts,
    counts,
    samples,
    searchParity,
    publications: { checked, problems: publicationProblems },
    problems,
  };
}
