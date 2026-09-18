/**
 * Lauf der Strukturinventur über den Scope-Bestand.
 *
 * Kandidat ist, was `data/imports/bayernrecht/scope.json` als `include` führt – und nur das. Was im
 * Cache liegt, wird geprüft; was fehlt, ist `skipped-not-cached` und **kein Fehler**: Der
 * Beschaffungslauf läuft nebenher, und die Inventur soll mit dem arbeiten, was da ist, ohne je das
 * Netz anzufassen.
 *
 * Wiederholbar: Die Kandidaten werden nach Dokument-ID sortiert abgearbeitet, `generatedAt` ist eine
 * Konstante, und in den Eintrag geht nur ein, was am Paket hängt. Zwei Läufe über denselben Cache
 * schreiben dieselbe Datei.
 *
 * Fortsetzbar: `--resume` übernimmt Einträge eines früheren Laufs, solange der SHA-256 des
 * Cacheeintrags unverändert ist; `--limit` begrenzt die neu geprüften Dokumente. Was der Lauf nicht
 * erreicht hat, steht als `pending` in den Kennzahlen – es wird nicht als „geprüft“ ausgegeben.
 *
 * Speicher: Die Pakete werden **einzeln** gelesen und nach dem Eintrag wieder freigegeben; nie liegt
 * mehr als ein Exportpaket gleichzeitig im Speicher. Bei über tausend Paketen und mehreren hundert
 * Megabyte ist das der Unterschied zwischen einem Lauf und einem Abbruch.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readJsonFile, writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { BASELINE_DATE, CACHE_DIR, EVALUATION_DATE, SOURCE_AREAS, type SourceArea } from '../common/constants.ts';
import { readEnumeration } from '../enumerate/enumeration.ts';
import { cacheEntryPaths, isCorruptCacheEntry, peekCachedPackage } from '../fetch/cache.ts';
import { zipUrl } from '../parse/addresses.ts';
import { readInstitutionRegistry } from '../transform/institution-registry.ts';
import { readSourceCorrections } from '../common/source-corrections.ts';
import { SCOPE_PATH, type ScopeFile } from '../scope/run.ts';
import { inventoryDocument, notCachedEntry } from './document.ts';
import {
  emptyIntegrityCounter,
  emptyOutcomeCounter,
  INVENTORY_PATH,
  INVENTORY_SCHEMA,
  type InventoryEntry,
  type InventoryFile,
  type InventoryTotals,
  type StructureClass,
} from './model.ts';
import { clusterFindings, EXAMPLES_PER_CLASS, excerptOf } from './signature.ts';

export interface InventoryRunOptions {
  root: string;
  area?: SourceArea;
  limit?: number;
  only?: readonly string[];
  resume?: boolean;
  cacheDir?: string;
  log?: (line: string) => void;
}

export interface InventoryRunResult {
  file: InventoryFile;
  path: string;
  /** Dokumente, die dieser Lauf selbst geprüft hat. */
  processed: number;
  /** Einträge, die aus einem früheren Lauf übernommen wurden (`--resume`). */
  reused: number;
  /** Der Lauf endete am Budget `--limit`; der Rest bleibt offen. */
  stoppedAtLimit: boolean;
}

interface Candidate {
  documentId: string;
  sourceArea: SourceArea;
  title: string;
  url: string;
}

/** Kandidaten: die `include`-Entscheidungen des Scope, angereichert um die Paketadresse. */
export async function inventoryCandidates(root: string, options: { area?: SourceArea; only?: readonly string[] } = {}): Promise<Candidate[]> {
  const scope = await readJsonFile<ScopeFile>(join(root, SCOPE_PATH));
  if (!scope) throw new Error(`${SCOPE_PATH} fehlt – ohne Scope-Entscheidung gibt es keine Kandidaten (npm run import:bayernrecht:scope -- --write)`);

  const addresses = new Map<string, { url: string; title: string }>();
  for (const area of SOURCE_AREAS) {
    if (area === 'events') continue;
    const enumeration = await readEnumeration(root, area);
    for (const item of enumeration?.items ?? []) addresses.set(item.documentId, { url: item.zipUrl, title: item.title });
  }

  const only = options.only && options.only.length > 0 ? new Set(options.only) : undefined;
  return scope.entries
    .filter((entry) => entry.decision === 'include')
    .filter((entry) => !options.area || entry.sourceArea === options.area)
    .filter((entry) => !only || only.has(entry.documentId))
    .map((entry) => ({
      documentId: entry.documentId,
      sourceArea: entry.sourceArea as SourceArea,
      title: addresses.get(entry.documentId)?.title ?? entry.title,
      url: addresses.get(entry.documentId)?.url ?? zipUrl(entry.documentId),
    }))
    .sort((left, right) => (left.documentId < right.documentId ? -1 : left.documentId > right.documentId ? 1 : 0));
}

export async function runInventory(options: InventoryRunOptions): Promise<InventoryRunResult> {
  const { root } = options;
  const log = options.log ?? ((): void => undefined);
  const cacheDir = options.cacheDir ?? join(root, CACHE_DIR);
  const candidates = await inventoryCandidates(root, { ...(options.area ? { area: options.area } : {}), ...(options.only ? { only: options.only } : {}) });
  const institutions = await readInstitutionRegistry(root);
  const sourceCorrections = await readSourceCorrections(root);
  const previous = options.resume ? await readInventory(root) : undefined;
  const earlier = new Map((previous?.entries ?? []).map((entry) => [entry.documentId, entry]));

  const entries: InventoryEntry[] = [];
  let processed = 0;
  let reused = 0;
  let stoppedAtLimit = false;

  for (const candidate of candidates) {
    const cached = await peekCachedPackage(cacheDir, candidate.url);
    if (cached === undefined) {
      entries.push(notCachedEntry(candidate.documentId, candidate.sourceArea, candidate.title));
      continue;
    }
    if (isCorruptCacheEntry(cached)) {
      entries.push(corruptCacheEntry(candidate, cached.corrupt));
      continue;
    }
    const known = earlier.get(candidate.documentId);
    if (known && known.sha256 === cached.sha256 && known.outcome !== 'skipped-not-cached') {
      entries.push(known);
      reused += 1;
      continue;
    }
    if (options.limit !== undefined && processed >= options.limit) {
      stoppedAtLimit = true;
      continue;
    }
    // Ein Paket zur Zeit: lesen, auswerten, freigeben.
    const bytes = new Uint8Array(await readFile(cacheEntryPaths(cacheDir, candidate.url).bytes));
    entries.push(inventoryDocument({
      documentId: candidate.documentId,
      sourceArea: candidate.sourceArea,
      title: candidate.title,
      url: candidate.url,
      bytes,
      sha256: cached.sha256,
      byteLength: cached.byteLength,
      institutions,
      sourceCorrections: sourceCorrections.filter((correction) => correction.sourceIdentity === candidate.documentId),
    }));
    processed += 1;
    if (processed % 200 === 0) log(`  ${processed} Dokumente geprüft …`);
  }

  entries.sort((left, right) => (left.documentId < right.documentId ? -1 : left.documentId > right.documentId ? 1 : 0));
  const file: InventoryFile = {
    schemaVersion: INVENTORY_SCHEMA,
    baselineDate: BASELINE_DATE,
    generatedAt: EVALUATION_DATE,
    totals: inventoryTotals(entries, candidates.length),
    classes: inventoryClasses(entries),
    entries,
  };
  return { file, path: INVENTORY_PATH, processed, reused, stoppedAtLimit };
}

/** Ein Cacheeintrag, der vorhanden, aber unbrauchbar ist: beschädigte Quelle, kein fehlendes Paket. */
function corruptCacheEntry(candidate: Candidate, reason: string): InventoryEntry {
  return {
    documentId: candidate.documentId,
    sourceArea: candidate.sourceArea,
    title: candidate.title,
    outcome: 'source-corrupt',
    phase: 'package',
    sha256: '',
    byteLength: 0,
    findings: [{ code: 'cache-entry-corrupt', severity: 'error', phase: 'package', signature: 'cache-entry-corrupt', excerpt: excerptOf(reason) }],
    codes: ['cache-entry-corrupt'],
  };
}

export function inventoryTotals(entries: readonly InventoryEntry[], candidates: number): InventoryTotals {
  const byOutcome = emptyOutcomeCounter();
  const byDialect: Record<string, Record<string, number>> = {};
  const byNormType: Record<string, Record<string, number>> = {};
  const byTextIntegrity = emptyIntegrityCounter();
  const normTypeOutOfModel: Record<string, number> = {};
  const slugs = new Map<string, number>();
  let divisionNumberBeforeTitle = 0;
  let imageDocuments = 0;
  let imageWithGraphicFinding = 0;
  let imageWithFigures = 0;

  for (const entry of entries) {
    byOutcome[entry.outcome] += 1;
    if (entry.dialect) {
      byDialect[entry.dialect] ??= {};
      byDialect[entry.dialect]![entry.outcome] = (byDialect[entry.dialect]![entry.outcome] ?? 0) + 1;
    }
    if (entry.normType) {
      byNormType[entry.normType] ??= {};
      byNormType[entry.normType]![entry.outcome] = (byNormType[entry.normType]![entry.outcome] ?? 0) + 1;
    }
    if (entry.textIntegrity) byTextIntegrity[entry.textIntegrity.class] += 1;
    if (entry.codes.includes('division-number-before-title')) divisionNumberBeforeTitle += 1;
    for (const finding of entry.findings) {
      if (finding.code !== 'norm-type-out-of-model') continue;
      const doktyp = /@doktyp="([^"]*)"/u.exec(finding.signature)?.[1] ?? entry.documentType ?? '(unbenannt)';
      normTypeOutOfModel[doktyp] = (normTypeOutOfModel[doktyp] ?? 0) + 1;
    }
    if ((entry.attachments?.image ?? 0) > 0) {
      imageDocuments += 1;
      if (entry.codes.includes('graphic-not-transferred')) imageWithGraphicFinding += 1;
      if (entry.codes.includes('figures-transferred')) imageWithFigures += 1;
    }
    if (entry.slug) slugs.set(entry.slug, (slugs.get(entry.slug) ?? 0) + 1);
  }

  return {
    candidates,
    checked: entries.filter((entry) => entry.outcome !== 'skipped-not-cached').length,
    notCached: byOutcome['skipped-not-cached'],
    pending: Math.max(0, candidates - entries.length),
    byOutcome,
    byDialect: sortRecord(byDialect),
    byNormType: sortRecord(byNormType),
    byTextIntegrity,
    signals: {
      divisionNumberBeforeTitle,
      normTypeOutOfModel: Object.fromEntries(Object.entries(normTypeOutOfModel).sort(([left], [right]) => (left < right ? -1 : 1))),
      imageAttachments: { documents: imageDocuments, withFigures: imageWithFigures, withGraphicFinding: imageWithGraphicFinding, withoutGraphicFinding: imageDocuments - imageWithGraphicFinding },
      slugCollisions: [...slugs.values()].filter((count) => count > 1).length,
    },
  };
}

function sortRecord(record: Record<string, Record<string, number>>): Record<string, Record<string, number>> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => (left < right ? -1 : 1)).map(([key, value]) => [key, Object.fromEntries(Object.entries(value).sort(([left], [right]) => (left < right ? -1 : 1)))]));
}

/**
 * Strukturklassen, ergänzt um die Slugkollisionen.
 *
 * Die Kollision hängt nicht am einzelnen Dokument, sondern an zwei Dokumenten zugleich – sie ist
 * deshalb keine Eigenschaft eines Eintrags, sondern eine Klasse über dem Bestand. Der Bulk-Lauf
 * löst sie mit einem Zähler auf; die Inventur weist nur aus, wie oft er das tun müsste.
 */
export function inventoryClasses(entries: readonly InventoryEntry[]): StructureClass[] {
  const classes = clusterFindings(entries);
  const bySlug = new Map<string, string[]>();
  for (const entry of entries) {
    if (!entry.slug) continue;
    bySlug.set(entry.slug, [...(bySlug.get(entry.slug) ?? []), entry.documentId]);
  }
  const collisions = [...bySlug.entries()].filter(([, ids]) => ids.length > 1).sort(([left], [right]) => (left < right ? -1 : 1));
  if (collisions.length > 0) {
    classes.push({
      signature: 'slug-collision',
      code: 'slug-collision',
      phase: 'transform',
      severity: 'warning',
      documents: collisions.reduce((sum, [, ids]) => sum + ids.length, 0),
      examples: collisions.slice(0, EXAMPLES_PER_CLASS).map(([slug, ids]) => ({ documentId: ids[0]!, excerpt: excerptOf(`${slug}: ${ids.join(', ')}`) })),
    });
  }
  return classes.sort((left, right) => right.documents - left.documents || (left.signature < right.signature ? -1 : left.signature > right.signature ? 1 : 0));
}

export async function readInventory(root: string): Promise<InventoryFile | undefined> {
  const file = await readJsonFile<InventoryFile>(join(root, INVENTORY_PATH));
  if (!file) return undefined;
  if (file.schemaVersion !== INVENTORY_SCHEMA || !Array.isArray(file.entries)) throw new Error(`${INVENTORY_PATH}: keine gültige Inventur`);
  return file;
}

/**
 * Serialisierung mit einem Eintrag je Zeile: Bei mehreren Tausend Dokumenten bleibt die Datei
 * zeilenweise diffbar – ein geänderter Ausgang ändert genau eine Zeile.
 */
export function inventoryJsonText(file: InventoryFile): string {
  const { entries, ...header } = file;
  const head = JSON.stringify(header, null, 2).replace(/\n\}$/u, '');
  return `${head},\n  "entries": [\n${entries.map((entry) => `    ${JSON.stringify(entry)}`).join(',\n')}\n  ]\n}\n`;
}

export async function writeInventory(root: string, file: InventoryFile): Promise<boolean> {
  return writeFileAtomic(join(root, INVENTORY_PATH), inventoryJsonText(file));
}
