/**
 * `restore-baseline-only`: heute fehlende Stichtagsnormen aus amtlichen Verkündungen wiederherstellen.
 *
 * Ablauf: Kandidaten des Ereignisregisters (`isBaselineOnlyCandidate`) → Analyse je Kandidat und je Norm
 * (`analyze.ts`) → Rezept je sicherer Norm → Wiederherstellung auf dem Weg aller Normen (`restore.ts`). Ohne
 * `--write` wird alles gerechnet und geprüft, aber nichts geschrieben; Quellen werden – außer mit `--offline` –
 * im Abrufbudget in den Cache geholt (Beschaffung, kein Schreiben in den Bestand).
 *
 * Mit `--write` entstehen: Rezepte `data/imports/bayernrecht/baseline-only/<id>.json`, die Kandidatenliste
 * `candidates.json`, der Bericht `data/audits/bayernrecht/BASELINE_ONLY.md` sowie je sicherer Norm
 * `content/norms/baywue/<slug>/…`, ein Manifesteintrag im Bereich `events` und die Slug-Reservierung. `--only`
 * begrenzt auf Kennungen (Ausgangsverkündung, Ereignis) und schreibt dann weder Kandidatenliste noch Bericht.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readJsonFile, writeFileAtomic, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { EVALUATION_DATE, IMPORT_DATA_DIR } from '../common/constants.ts';
import { readManifest, writeManifestEntry, type ManifestRawDocument } from '../common/manifest.ts';
import { mergeReviewItems, readReviewQueue, reviewStatusFor, writeReviewShard } from '../common/review.ts';
import { readSlugRegistry, writeSlugRegistry } from '../common/slug-registry.ts';
import { isBaselineOnlyCandidate, type EventLedger, type LedgerEvent } from '../events/ledger.ts';
import { listExistingSlugs, writeNormRecord } from '../bulk/persist.ts';
import { readInstitutionRegistry } from '../transform/institution-registry.ts';
import { analyzeCandidate, analyzeNorm, type CandidateWork, type NormResult } from './analyze.ts';
import { titleKey } from './identity.ts';
import { normalizeTitle, subjectReading } from '../events/resolve.ts';
import { CONVERTER_VERSION } from './html.ts';
import { BASELINE_ONLY_DIR, BASELINE_ONLY_REPORT_PATH, CANDIDATES_PATH, CANDIDATES_SCHEMA, MISSING_LINKS, OUTCOMES, recipePath, type BaselineOnlyRecipe, type CandidateRecord, type CandidatesFile, type Metrics, type Outcome } from './model.ts';
import { createPlatform, type Platform, type PlatformStats } from './platform.ts';
import { renderReport } from './report.ts';
import { isBaselineOnlyEntry } from './recognize.ts';
import { RecipeError, restoreNorm, type RestoredNorm } from './restore.ts';

export const LEDGER_PATH = `${IMPORT_DATA_DIR}/events/ledger.json`;
/** Standard-Abrufbudget eines Laufs (Netzabrufe); der Auftrag setzt insgesamt etwa 1 200. */
export const DEFAULT_MAX_REQUESTS = 400;

export interface BaselineOnlyOptions {
  root: string;
  write: boolean;
  offline: boolean;
  only?: readonly string[];
  maxRequests?: number;
  baselineDate: string;
  evaluationDate?: string;
  /** Austauschbar für Tests (sonst Fetcher über den Cache). */
  platform?: Platform;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface RestoredSummary {
  id: string;
  slug: string;
  title: string;
  type: string;
  status: string;
  amendments: number;
  sourceValidFrom: string;
  sourceValidTo: string | null;
  files: string[];
  changed: boolean;
}

export interface BaselineOnlyRun {
  candidates: CandidateRecord[];
  norms: NormResult[];
  recipes: BaselineOnlyRecipe[];
  restored: RestoredSummary[];
  metrics: Metrics;
  network: PlatformStats;
  written: string[];
  /** Fehler der Wiederherstellung (Rezept gültig, Überleitung oder Schema scheitert) – dann kein Eintrag. */
  restoreFailures: Array<{ id: string; code: string; message: string }>;
}

export async function readLedger(root: string): Promise<EventLedger> {
  return JSON.parse(await readFile(join(root, LEDGER_PATH), 'utf8')) as EventLedger;
}

const emptyByOutcome = (): Record<Outcome, number> => Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0])) as Record<Outcome, number>;

export function computeMetrics(candidates: readonly CandidateRecord[]): Metrics {
  const byOutcome = emptyByOutcome();
  const byMissingLink: Record<string, number> = {};
  for (const candidate of candidates) {
    byOutcome[candidate.outcome] += 1;
    if (candidate.missing) byMissingLink[candidate.missing.code] = (byMissingLink[candidate.missing.code] ?? 0) + 1;
  }
  return {
    candidates: candidates.length,
    strongIdentity: candidates.filter((candidate) => candidate.funnel.strongIdentity).length,
    baseFound: candidates.filter((candidate) => candidate.funnel.baseFound).length,
    fullChain: candidates.filter((candidate) => candidate.funnel.fullChain).length,
    safelyReconstructed: candidates.filter((candidate) => candidate.funnel.safe).length,
    safeNorms: new Set(candidates.filter((candidate) => candidate.funnel.safe).map((candidate) => candidate.normId)).size,
    duplicates: candidates.filter((candidate) => candidate.duplicateOf !== undefined).length,
    byOutcome,
    byMissingLink: Object.fromEntries(Object.entries(byMissingLink).sort(([left], [right]) => (left < right ? -1 : 1))),
  };
}

function matchesOnly(only: readonly string[] | undefined, work: CandidateWork): boolean {
  if (!only || only.length === 0) return true;
  return only.some((value) => value === work.event.id || value === work.record.normId || value === work.event.sourceId || work.record.fundstelle === value);
}

/**
 * Betreff eines Titels oder Zitats ohne Artikel, Dokumentart und Erlassstelle, in der Vergleichsform
 * `normalizeTitle`: „Die Bekanntmachung des … über die Führung des Schiffsregisters …“ → „führung des
 * schiffsregisters …“; ein Titel in Anführungszeichen („… Energie „Richtlinien für …““) ist selbst der Betreff.
 */
export function subjectKey(title: string): string {
  const text = title.replace(/\s+/gu, ' ').trim().replace(/^(?:die|das|der)\s+/iu, '');
  const reading = subjectReading(text) ?? /^(?:Gemeinsamen?\s+)?(?:Bekanntmachung|Verwaltungsvorschrift(?:en)?|Richtlinien?|Schreiben)\b.*?\s(?<![\p{L}])(?:über|betreffend)(?![\p{L}])\s+(?:(?:die|den|das|dem)\s+)?(.+)$/u.exec(text)?.[1];
  if (reading) return normalizeTitle(reading);
  const quoted = /„([^“”]{6,})[“”]/u.exec(text);
  return normalizeTitle(quoted ? quoted[1]! : text);
}

/** Gleicher Betreff: vollständig gleich oder einer ist Wortanfang des anderen (Titel der Veröffentlichung gekürzt). */
const sameSubject = (left: string, right: string): boolean => {
  if (left === right) return true;
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  return short.length >= 12 && long.startsWith(short) && /^[\s,;.(-]/u.test(long.slice(short.length));
};

/**
 * Verbindet ein Ereignis ohne Zitat (Ziel nur aus dem Titel der Veröffentlichung, Zuordnung daher nicht stark)
 * mit dem Ereignis derselben Veröffentlichung, dessen Zitat die Analyse im Text belegt hat – wenn genau eines
 * denselben Betreff trägt (Vergleich nach `normalizeTitle`; der Titel der Veröffentlichung darf gekürzt sein, dann
 * muss er Wortanfang des Zitats sein – keine Ähnlichkeit, und nur innerhalb derselben Veröffentlichung).
 */
export function linkTitleDuplicates(works: readonly CandidateWork[]): Map<CandidateWork, CandidateWork> {
  const links = new Map<CandidateWork, CandidateWork>();
  for (const work of works) {
    if (work.record.missing?.code !== 'identity-not-strong') continue;
    const key = subjectKey(work.event.targetTitle);
    if (key.length < 6) continue;
    const twins = works.filter((other) => other !== work && other.event.sourceId === work.event.sourceId && other.citation !== undefined && sameSubject(subjectKey(other.citation.citedTitle), key));
    if (twins.length === 1) links.set(work, twins[0]!);
  }
  return links;
}

/** Übernimmt `bucket`, `objectKey` und `archiveStatus` einer gleichen Rohquelle des bisherigen Eintrags. */
export function keepArchiveState(raw: ManifestRawDocument, previous: readonly ManifestRawDocument[]): ManifestRawDocument {
  const same = previous.find((entry) => entry.url === raw.url && entry.role === raw.role && entry.sha256 === raw.sha256 && entry.objectKey !== undefined);
  if (!same) return raw;
  return { ...raw, ...(same.bucket ? { bucket: same.bucket } : {}), objectKey: same.objectKey!, ...(same.archiveStatus ? { archiveStatus: same.archiveStatus } : {}) };
}

export async function runBaselineOnly(options: BaselineOnlyOptions): Promise<BaselineOnlyRun> {
  const log = options.log ?? ((): void => undefined);
  const now = options.now ?? ((): Date => new Date());
  const evaluationDate = options.evaluationDate ?? EVALUATION_DATE;
  const platform = options.platform ?? createPlatform({ root: options.root, offline: options.offline, maxRequests: options.maxRequests ?? DEFAULT_MAX_REQUESTS, log });
  const ledger = await readLedger(options.root);
  const events: LedgerEvent[] = ledger.events.filter((event) => isBaselineOnlyCandidate(event, evaluationDate));
  const ctx = { platform, baselineDate: options.baselineDate, evaluationDate, log };

  // Kandidatenstufe (immer vollständig: `--only` kennt die Kennung der Ausgangsverkündung erst danach).
  const works: CandidateWork[] = [];
  for (const event of events) {
    const work = await analyzeCandidate(ctx, event);
    if (matchesOnly(options.only, work)) works.push(work);
  }

  // Doppelte Register-Ereignisse derselben Aufhebung (Titel der Veröffentlichung ↔ Zitat im Text) verbinden.
  const duplicates = linkTitleDuplicates(works);

  // Normstufe: Kandidaten derselben Ausgangsverkündung gemeinsam.
  const groups = new Map<string, CandidateWork[]>();
  for (const work of works) {
    if (work.record.outcome !== 'safe' || !work.publication) continue;
    const group = groups.get(work.publication.identity) ?? [];
    group.push(work);
    groups.set(work.publication.identity, group);
  }
  const norms: NormResult[] = [];
  for (const [id, group] of [...groups.entries()].sort(([left], [right]) => (left < right ? -1 : 1))) {
    log(`  Norm ${id} (${group.length} Kandidat${group.length === 1 ? '' : 'en'})`);
    const result = await analyzeNorm(ctx, group);
    norms.push(result);
    for (const work of group) {
      work.record.outcome = result.outcome;
      if (result.missing) work.record.missing = result.missing;
      work.record.funnel.fullChain = result.fullChain;
    }
  }

  // Duplikate übernehmen das Ergebnis ihres zitierten Zwillings; ihre Kennung gehört zum Ende der Norm.
  for (const [duplicate, twin] of duplicates) {
    duplicate.record.duplicateOf = twin.event.id;
    duplicate.record.outcome = twin.record.outcome;
    if (twin.record.missing) duplicate.record.missing = twin.record.missing;
    else delete duplicate.record.missing;
    for (const field of ['normId', 'documentDate', 'fundstelle', 'baseUrl', 'lastDay'] as const) if (twin.record[field] !== undefined) duplicate.record[field] = twin.record[field];
    duplicate.record.funnel = { ...twin.record.funnel };
    const norm = norms.find((entry) => entry.id === twin.record.normId);
    if (norm?.recipe && !norm.recipe.end.eventIds.includes(duplicate.event.id)) norm.recipe.end.eventIds = [...norm.recipe.end.eventIds, duplicate.event.id].sort();
  }

  // Wiederherstellung: derselbe Weg wie jede Norm; Fehler machen aus „safe“ einen Review-Fall.
  const recipes = norms.filter((norm) => norm.recipe).map((norm) => norm.recipe!);
  const registry = await readSlugRegistry(options.root);
  const registrySize = registry.entries.length;
  const existingSlugs = await listExistingSlugs(options.root);
  const institutions = await readInstitutionRegistry(options.root);
  const manifest = await readManifest(options.root);
  const runId = `baseline-only-${now().toISOString().slice(0, 10)}`;
  const restoredNorms: Array<{ recipe: BaselineOnlyRecipe; restored: RestoredNorm }> = [];
  const restoreFailures: BaselineOnlyRun['restoreFailures'] = [];
  const markOutcome = (id: string, outcome: Outcome, missing: NonNullable<NormResult['missing']>): void => {
    const norm = norms.find((entry) => entry.id === id)!;
    norm.outcome = outcome;
    norm.missing = missing;
    delete norm.recipe;
    for (const work of works) {
      if (work.record.normId !== id) continue;
      work.record.outcome = outcome;
      work.record.missing = missing;
      work.record.funnel.fullChain = false;
    }
  };
  for (const recipe of recipes) {
    // Kein Eintrag, der eine Norm des Bestands doppelt führte: gleiche Verkündung oder gleicher Titel (zwei am
    // Stichtag geltende Vorschriften mit demselben Titel sind ein Widerspruch zum „heute fehlt“ des Registers).
    // Einträge, die am Stichtag nicht galten oder ausgeschlossen sind (z. B. die heutige Nachfolgerin), zählen nicht.
    const clash = manifest.entries.find(
      (entry) =>
        !(isBaselineOnlyEntry(entry) && entry.sourceIdentity === recipe.id) &&
        entry.importStatus !== 'not-at-baseline' &&
        entry.importStatus !== 'excluded' &&
        (entry.sourceUrl === recipe.base.url || titleKey(entry.sourceTitle) === titleKey(recipe.norm.title)),
    );
    if (clash) {
      markOutcome(recipe.id, MISSING_LINKS['present-in-bestand'], {
        code: 'present-in-bestand',
        detail: `Der Bestand führt bereits ${clash.sourceIdentity} (Bereich ${clash.sourceArea}, ${clash.sourceUrl}, Quellgeltung ab ${clash.sourceValidFrom ?? '?'}) mit ${clash.sourceUrl === recipe.base.url ? 'derselben Verkündung' : `demselben Titel „${recipe.norm.title.slice(0, 120)}“`} – das Register nennt die Norm „heute fehlend“, der Bestand widerspricht`,
      });
      continue;
    }
    try {
      const restored = await restoreNorm({ root: options.root, recipe, registry, existingSlugs, institutions, runId, now: now().toISOString() });
      restoredNorms.push({ recipe, restored });
    } catch (error) {
      const code = error instanceof RecipeError ? error.code : 'crash';
      restoreFailures.push({ id: recipe.id, code, message: (error as Error).message });
      markOutcome(recipe.id, 'undetermined', { code: 'record-invalid', detail: `${code}: ${(error as Error).message}` });
    }
  }
  const written: string[] = [];
  const restored: RestoredSummary[] = [];
  const kept: BaselineOnlyRecipe[] = [];
  for (const { recipe, restored: norm } of restoredNorms) {
    const write = await writeNormRecord({ root: options.root, record: norm.record, baselineDate: options.baselineDate, write: options.write });
    if (write.finding) {
      restoreFailures.push({ id: recipe.id, code: write.finding.code, message: write.finding.message });
      markOutcome(recipe.id, 'undetermined', { code: 'record-invalid', detail: `${write.finding.code}: ${write.finding.message}` });
      continue;
    }
    kept.push(recipe);
    restored.push({
      id: recipe.id,
      slug: norm.record.meta.slug,
      title: norm.record.meta.title,
      type: norm.record.meta.type,
      status: norm.entry.importStatus,
      amendments: recipe.amendments.length,
      sourceValidFrom: norm.entry.sourceValidFrom,
      sourceValidTo: norm.entry.sourceValidTo,
      files: write.files,
      changed: write.changed,
    });
    if (options.write) {
      written.push(...(write.changed ? write.files : []));
      // Prüffälle (nicht blockierend) in die Review-Queue, Status am Manifesteintrag wie im Bulk.
      const queue = mergeReviewItems(await readReviewQueue(options.root), { sourceArea: 'events', sourceIdentity: norm.entry.sourceIdentity, sourceUrl: norm.entry.sourceUrl, now: now().toISOString(), targetSlug: norm.entry.targetSlug }, norm.reviewItems);
      norm.entry.reviewStatus = reviewStatusFor(queue, norm.entry.sourceIdentity);
      const shard = await writeReviewShard(options.root, queue, 'events', norm.entry.sourceIdentity);
      if (shard.changed) written.push(shard.path);
      // Archivstand unveränderter Rohquellen übernehmen (gleiche Adresse, Rolle und SHA-256): Der Objektschlüssel
      // ist inhaltsadressiert, eine schon verifizierte Quelle muss r2-sync nicht erneut bereitstellen.
      const previous = manifest.entries.find((entry) => entry.sourceArea === 'events' && entry.sourceIdentity === norm.entry.sourceIdentity);
      if (previous) norm.entry.rawDocuments = norm.entry.rawDocuments.map((raw) => keepArchiveState(raw, previous.rawDocuments));
      const manifestWrite = await writeManifestEntry(options.root, norm.entry);
      if (manifestWrite.changed) written.push(manifestWrite.path);
      if (await writeJsonAtomic(join(options.root, recipePath(recipe.id)), recipe)) written.push(recipePath(recipe.id));
    }
  }
  if (options.write && registry.entries.length !== registrySize) {
    if (await writeSlugRegistry(options.root, registry)) written.push('data/imports/bayernrecht/slug-registry.json');
  }
  for (const [duplicate, twin] of duplicates) {
    duplicate.record.outcome = twin.record.outcome;
    if (twin.record.missing) duplicate.record.missing = twin.record.missing;
    duplicate.record.funnel = { ...twin.record.funnel };
  }
  for (const work of works) work.record.funnel.safe = work.record.outcome === 'safe';
  const candidates = works.map((work) => work.record);
  const metrics = computeMetrics(candidates);
  const network = platform.stats;
  const run: BaselineOnlyRun = { candidates, norms, recipes: kept, restored, metrics, network, written, restoreFailures };
  if (options.write && (!options.only || options.only.length === 0)) {
    const file: CandidatesFile = { schemaVersion: CANDIDATES_SCHEMA, baselineDate: options.baselineDate, evaluationDate, converterVersion: CONVERTER_VERSION, totals: metrics, candidates };
    if (await writeJsonAtomic(join(options.root, CANDIDATES_PATH), file)) written.push(CANDIDATES_PATH);
    if (await writeFileAtomic(join(options.root, BASELINE_ONLY_REPORT_PATH), renderReport(run, { baselineDate: options.baselineDate, evaluationDate }))) written.push(BASELINE_ONLY_REPORT_PATH);
  }
  return run;
}

/** Rezepte, die im Bestand liegen (für Audit und Tests). */
export async function readRecipes(root: string): Promise<BaselineOnlyRecipe[]> {
  let files: string[];
  try {
    files = (await readdir(join(root, BASELINE_ONLY_DIR))).filter((file) => file.endsWith('.json') && file !== 'candidates.json').sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const recipes: BaselineOnlyRecipe[] = [];
  for (const file of files) {
    const recipe = await readJsonFile<BaselineOnlyRecipe>(join(root, BASELINE_ONLY_DIR, file));
    if (recipe) recipes.push(recipe);
  }
  return recipes;
}

export function baselineOnlySummary(run: BaselineOnlyRun, options: { write: boolean }): string[] {
  const m = run.metrics;
  const lines = [
    `Baseline-only (heute fehlende Stichtagsnormen): ${m.candidates} Kandidaten des Ereignisregisters`,
    `  starke Identität ${m.strongIdentity} · Ausgangsverkündung gefunden ${m.baseFound} · Kette vollständig ${m.fullChain} · sicher wiederhergestellt ${m.safelyReconstructed} (${m.safeNorms} Normen) · Doppelerfassungen verbunden ${m.duplicates}`,
    `  ${OUTCOMES.map((outcome) => `${outcome} ${m.byOutcome[outcome]}`).join(' · ')}`,
    ...Object.entries(m.byMissingLink).map(([code, count]) => `    ${String(count).padStart(4)}  ${code} (${MISSING_LINKS[code as keyof typeof MISSING_LINKS]})`),
    `  Netzabrufe ${run.network.networkRequests}, aus dem Cache ${run.network.cacheHits}, 404 ${run.network.notFound}${run.network.pending.length > 0 ? `, offen ${new Set(run.network.pending).size}${run.network.budgetExhausted ? ' (Budget erreicht – erneut ausführen)' : ''}` : ''}`,
  ];
  for (const norm of run.restored) lines.push(`  ${options.write ? (norm.changed ? 'geschrieben' : 'unverändert') : 'Dry-run'}: ${norm.slug} (${norm.id}, ${norm.type}, ${norm.sourceValidFrom} bis ${norm.sourceValidTo ?? 'offen'}${norm.amendments > 0 ? `, ${norm.amendments} Änderung(en)` : ''})`);
  for (const failure of run.restoreFailures) lines.push(`  ! ${failure.id}: ${failure.code} – ${failure.message.slice(0, 200)}`);
  if (!options.write) lines.push(`Dry-run: nichts geschrieben (${BASELINE_ONLY_DIR}/, ${BASELINE_ONLY_REPORT_PATH}, content/norms/baywue/, Manifest events, Slug-Registry). Mit --write speichern.`);
  else lines.push(run.written.length === 0 ? 'Unverändert: keine Datei neu geschrieben.' : `Geschrieben: ${run.written.length} Datei(en)`);
  return lines;
}
