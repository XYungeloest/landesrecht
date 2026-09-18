/**
 * Konsistenzprüfung des BayWü-Bestands (`npm run import:bayernrecht:audit`).
 *
 * Der Befehl **liest nur**. Er repariert nichts, ergänzt nichts und schreibt nichts – auch nicht mit
 * `--write`: Ein Audit, das den geprüften Zustand nebenbei verändert, prüft anschließend sich selbst.
 *
 * Geprüft wird, ob die Teile des Zustands dasselbe sagen. Jeder Teil für sich ist bereits
 * schemageprüft (Manifest, Review-Queue, Slug-Registry und Overrides prüfen sich beim Lesen selbst);
 * was bleibt, sind die Widersprüche **zwischen** ihnen:
 *
 *   Enumeration ↔ Manifest    Eine verarbeitete Stammnorm muss in der Enumeration stehen, und ein
 *                             Eintrag der Enumeration, der als verarbeitet gilt, muss ein Manifest haben.
 *   Manifest ↔ Slug-Registry  Ein übernommener Eintrag führt seinen Slug, und die Registry führt
 *                             denselben – Slugs sind dauerhaft, eine Abweichung ist ein Bruch.
 *   Enumeration ↔ Korpus      Der Beispielkorpus zieht aus der Enumeration; ein Korpuseintrag ohne
 *                             Enumerationseintrag (oder mit anderem Normtyp) ist ein Widerspruch.
 *   Rohquellen                Jedes Exportpaket unter `sources/bayernrecht/` hat eine Begleitdatei,
 *                             und deren SHA-256 gilt für genau diese Bytes – nachgerechnet, nicht geglaubt.
 *   Review ↔ Manifest         Ein Review-Fall gehört zu einer Stammnorm, die das Manifest führt.
 *   Overrides ↔ Manifest      Ein Override greift in einen Eintrag ein, den es geben muss.
 *   baseline-only ↔ Rezept    Eine wiederhergestellte heute fehlende Stichtagsnorm (Bereich `events`) hat ihr
 *                             Rezept unter `data/imports/bayernrecht/baseline-only/`, und das Rezept beschreibt
 *                             genau die Verkündung und die Bytes, die der Eintrag führt – und umgekehrt.
 *
 * **Abweichung oder Hinweis.** Eine Abweichung (`findings`) ist ein Widerspruch im Bestand und führt
 * zu Exit 1. Ein Hinweis (`notices`) ist etwas, das in dieser Arbeitskopie fehlt, ohne dass der
 * Bestand widersprüchlich wäre – vor allem die Exportpakete, die nach `sources/README.md` bewusst
 * nicht in Git liegen. Jede Zeile nennt die Kennung, um die es geht.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readJsonFile } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { SOURCE_AREAS, SOURCE_SYSTEM, TARGET_JURISDICTION, type SourceArea } from '../common/constants.ts';
import { isImportedStatus, readManifest, type ImportManifest, type ManifestEntry } from '../common/manifest.ts';
import { readOverrides, type OverrideRegistry } from '../common/overrides.ts';
import { compareSourceIdentity } from '../common/paths.ts';
import { openReviewItems, readReviewQueue, type ReviewQueue } from '../common/review.ts';
import { readSlugRegistry, SLUG_REGISTRY_PATH, type SlugRegistry } from '../common/slug-registry.ts';
import { corpusPackagePath, corpusSidecarPath, CORPUS_PATH, CORPUS_SOURCE_DIR, type CorpusFile, type CorpusSourceRecord } from '../corpus/run.ts';
import { baselineOnlyMarker, isBaselineOnlyEntry, readRecipeHeads, RECIPE_SCHEMA as BASELINE_ONLY_RECIPE_SCHEMA, type StoredRecipeHead } from '../baseline-only/recognize.ts';
import { readEnumeration, type EnumerationFile, type EnumerationItem } from '../enumerate/enumeration.ts';

/** Bereiche mit Enumeration; `events` hat keine und kann deshalb nicht gegengeprüft werden. */
export const ENUMERABLE_AREAS: readonly SourceArea[] = ['landesrecht', 'vwv'];

/** Enumerationsstatus, die einen Manifesteintrag voraussetzen (die Stammnorm wurde angefasst). */
export const PROCESSED_STATUSES = ['done', 'review', 'failed', 'excluded'] as const;

export interface AuditFinding {
  /** Kurzkennung der Prüfung – stabil, damit Abweichungen über Läufe hinweg vergleichbar bleiben. */
  check: string;
  /** Kennung des betroffenen Gegenstands: Quellidentität, Slug, Override-Kennung oder Pfad. */
  identity: string;
  detail: string;
}

export interface AuditReport {
  jurisdiction: typeof TARGET_JURISDICTION;
  sourceSystem: typeof SOURCE_SYSTEM;
  counts: {
    enumeration: Record<string, number>;
    manifestEntries: number;
    imported: number;
    slugRegistry: number;
    corpusEntries: number;
    reviewItems: number;
    openReviewItems: number;
    overrides: number;
    /** Wiederhergestellte heute fehlende Stichtagsnormen (Bereich `events`, übernommen). */
    baselineOnlyRestored: number;
    /** Exportpakete, die in dieser Arbeitskopie unter `sources/bayernrecht/` liegen. */
    sourcePackages: number;
  };
  /** Widersprüche im Bestand; leer heißt in Ordnung. */
  findings: AuditFinding[];
  /** Was in dieser Arbeitskopie fehlt, ohne dass der Bestand widersprüchlich wäre. */
  notices: string[];
  ok: boolean;
}

const byIdentityThenCheck = (left: AuditFinding, right: AuditFinding): number => compareSourceIdentity(left.identity, right.identity) || (left.check < right.check ? -1 : left.check > right.check ? 1 : 0);

/* ------------------------------------------------------------------------------------------ */
/* Die Einzelprüfungen – reine Funktionen über bereits gelesenen Daten                          */

/** Enumeration ↔ Manifest: beide Richtungen, damit weder ein Eintrag verschwindet noch einer auftaucht. */
export function checkEnumerationAgainstManifest(enumerations: ReadonlyMap<SourceArea, EnumerationFile>, manifest: Pick<ImportManifest, 'entries'>): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const items = new Map<string, { area: SourceArea; item: EnumerationItem }>();
  for (const [area, file] of enumerations) for (const item of file.items) items.set(item.sourceIdentity, { area, item });

  for (const entry of manifest.entries) {
    if (!ENUMERABLE_AREAS.includes(entry.sourceArea)) continue;
    const found = items.get(entry.sourceIdentity);
    if (!found) {
      findings.push({ check: 'manifest-ohne-enumeration', identity: entry.sourceIdentity, detail: `Manifesteintrag (${entry.sourceArea}, ${entry.importStatus}) steht in keiner Enumeration – die Enumeration führt jede verarbeitete Stammnorm` });
      continue;
    }
    if (found.area !== entry.sourceArea) findings.push({ check: 'bereich-abweichung', identity: entry.sourceIdentity, detail: `Manifest führt den Bereich ${entry.sourceArea}, die Enumeration ${found.area}` });
    const outcome = found.item.outcome;
    if (outcome?.targetSlug && outcome.targetSlug !== entry.targetSlug) findings.push({ check: 'slug-abweichung-enumeration', identity: entry.sourceIdentity, detail: `Enumeration vermerkt den Slug ${outcome.targetSlug}, das Manifest ${entry.targetSlug || '(leer)'}` });
    if (outcome?.importStatus && outcome.importStatus !== entry.importStatus) findings.push({ check: 'status-abweichung-enumeration', identity: entry.sourceIdentity, detail: `Enumeration vermerkt den Importstatus ${outcome.importStatus}, das Manifest ${entry.importStatus}` });
  }

  const manifestIdentities = new Set(manifest.entries.map((entry) => entry.sourceIdentity));
  for (const [identity, { area, item }] of items) {
    if (manifestIdentities.has(identity)) continue;
    if ((PROCESSED_STATUSES as readonly string[]).includes(item.status)) findings.push({ check: 'enumeration-ohne-manifest', identity, detail: `Enumeration ${area} führt den Eintrag als ${item.status}, ein Manifesteintrag fehlt` });
    else if (item.signals.manifest) findings.push({ check: 'enumeration-ohne-manifest', identity, detail: `Enumeration ${area} führt den Eintrag aus dem Manifest (signals.manifest), ein Manifesteintrag fehlt` });
  }
  return findings;
}

/** Manifest ↔ Slug-Registry: Slugs sind dauerhaft vergeben; eine Abweichung ist ein Bruch, keine Variante. */
export function checkSlugRegistry(manifest: Pick<ImportManifest, 'entries'>, registry: Pick<SlugRegistry, 'entries'>): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const registered = new Map(registry.entries.map((entry) => [entry.sourceIdentity, entry]));
  const manifestByIdentity = new Map(manifest.entries.map((entry) => [entry.sourceIdentity, entry]));
  for (const entry of manifest.entries) {
    const reservation = registered.get(entry.sourceIdentity);
    if (isImportedStatus(entry.importStatus)) {
      if (!reservation) findings.push({ check: 'slug-nicht-registriert', identity: entry.sourceIdentity, detail: `übernommener Eintrag mit Slug ${entry.targetSlug} ohne Reservierung in ${SLUG_REGISTRY_PATH}` });
      else if (reservation.slug !== entry.targetSlug) findings.push({ check: 'slug-abweichung', identity: entry.sourceIdentity, detail: `Registry führt ${reservation.slug}, das Manifest ${entry.targetSlug}` });
    } else if (reservation && entry.targetSlug === '') {
      findings.push({ check: 'slug-reserviert-ohne-uebernahme', identity: entry.sourceIdentity, detail: `Registry hält ${reservation.slug}, der Eintrag ist aber ${entry.importStatus} und führt keinen Slug` });
    }
  }
  for (const entry of registry.entries) {
    if (!manifestByIdentity.has(entry.sourceIdentity)) findings.push({ check: 'slug-ohne-manifest', identity: entry.sourceIdentity, detail: `${SLUG_REGISTRY_PATH} reserviert ${entry.slug}, das Manifest kennt die Quellidentität nicht` });
  }
  return findings;
}

/** Enumeration ↔ Beispielkorpus: der Korpus zieht aus der Enumeration und darf ihr nicht widersprechen. */
export function checkCorpusAgainstEnumeration(corpus: CorpusFile | undefined, enumerations: ReadonlyMap<SourceArea, EnumerationFile>): AuditFinding[] {
  if (!corpus) return [];
  const findings: AuditFinding[] = [];
  const items = new Map<string, { area: SourceArea; item: EnumerationItem }>();
  for (const [area, file] of enumerations) for (const item of file.items) items.set(item.documentId, { area, item });
  for (const entry of corpus.entries) {
    const found = items.get(entry.documentId);
    if (!found) {
      findings.push({ check: 'korpus-ohne-enumeration', identity: entry.documentId, detail: `Korpuseintrag (${entry.sourceArea}, ${entry.normType}) steht in keiner Enumeration` });
      continue;
    }
    if (found.area !== entry.sourceArea) findings.push({ check: 'korpus-bereich-abweichung', identity: entry.documentId, detail: `Korpus führt den Bereich ${entry.sourceArea}, die Enumeration ${found.area}` });
    if (entry.normType !== 'unbekannt' && found.item.normType !== entry.normType) findings.push({ check: 'korpus-normtyp-abweichung', identity: entry.documentId, detail: `Korpus führt den Normtyp ${entry.normType}, die Enumeration ${found.item.normType ?? '(keiner)'}` });
    if (entry.bayRsNumber && found.item.bayRsNumber && entry.bayRsNumber !== found.item.bayRsNumber) findings.push({ check: 'korpus-bayrs-abweichung', identity: entry.documentId, detail: `Korpus führt die BayRS-Nummer ${entry.bayRsNumber}, die Enumeration ${found.item.bayRsNumber}` });
  }
  return findings;
}

/** Review ↔ Manifest: ein Fall gehört zu einer Stammnorm, die das Manifest führt. */
export function checkReviewAgainstManifest(queue: Pick<ReviewQueue, 'items'>, manifest: Pick<ImportManifest, 'entries'>): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const entries = new Map(manifest.entries.map((entry) => [entry.sourceIdentity, entry]));
  const open = new Set(queue.items.filter((item) => item.status === 'open').map((item) => item.sourceIdentity));
  for (const item of queue.items) {
    const entry = entries.get(item.sourceIdentity);
    if (!entry) {
      findings.push({ check: 'review-ohne-manifest', identity: item.sourceIdentity, detail: `Review-Fall ${item.id} (${item.category}, ${item.status}) ohne Manifesteintrag` });
      continue;
    }
    if (item.sourceArea !== entry.sourceArea) findings.push({ check: 'review-bereich-abweichung', identity: item.sourceIdentity, detail: `Review-Fall ${item.id} führt den Bereich ${item.sourceArea}, das Manifest ${entry.sourceArea}` });
    if (item.targetSlug && entry.targetSlug && item.targetSlug !== entry.targetSlug) findings.push({ check: 'review-slug-abweichung', identity: item.sourceIdentity, detail: `Review-Fall ${item.id} führt den Slug ${item.targetSlug}, das Manifest ${entry.targetSlug}` });
  }
  for (const entry of manifest.entries) {
    const hasOpen = open.has(entry.sourceIdentity);
    if ((entry.reviewStatus === 'open') !== hasOpen) findings.push({ check: 'review-status-abweichung', identity: entry.sourceIdentity, detail: `Manifest führt reviewStatus ${entry.reviewStatus}, offene Fälle in der Queue: ${hasOpen ? 'ja' : 'nein'}` });
  }
  return findings;
}

/** Overrides ↔ Manifest: ein Override greift in einen Eintrag ein, den es geben muss. */
export function checkOverridesAgainstManifest(overrides: Pick<OverrideRegistry, 'entries'>, manifest: Pick<ImportManifest, 'entries'>): AuditFinding[] {
  const identities = new Set(manifest.entries.map((entry) => entry.sourceIdentity));
  const applied = new Map<string, Set<string>>();
  for (const entry of manifest.entries) applied.set(entry.sourceIdentity, new Set(entry.overrides.map((override) => override.id ?? override.field)));
  const findings: AuditFinding[] = [];
  for (const override of overrides.entries) {
    if (!identities.has(override.sourceIdentity)) {
      findings.push({ check: 'override-ohne-manifest', identity: override.sourceIdentity, detail: `Override ${override.id} (${override.field}) verweist auf eine Quellidentität, die das Manifest nicht führt` });
      continue;
    }
    const seen = applied.get(override.sourceIdentity);
    if (seen && !seen.has(override.id) && !seen.has(override.field)) findings.push({ check: 'override-nicht-angewandt', identity: override.sourceIdentity, detail: `Override ${override.id} (${override.field}) ist dokumentiert, der Manifesteintrag vermerkt ihn nicht` });
  }
  return findings;
}

/**
 * baseline-only ↔ Rezept: Jeder wiederhergestellte Eintrag verweist auf ein vorhandenes Rezept derselben Kennung, das
 * dieselbe Ausgangsverkündung (Adresse, SHA-256) beschreibt; jedes Rezept hat seinen Eintrag.
 */
export function checkBaselineOnly(manifest: Pick<ImportManifest, 'entries'>, recipes: readonly StoredRecipeHead[]): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const entries = manifest.entries.filter(isBaselineOnlyEntry);
  for (const entry of entries) {
    const marker = baselineOnlyMarker(entry)!;
    const recipe = byId.get(entry.sourceIdentity);
    if (!recipe) {
      findings.push({ check: 'baseline-only-ohne-rezept', identity: entry.sourceIdentity, detail: `Eintrag verweist auf ${marker.recipe}, das Rezept fehlt` });
      continue;
    }
    if (recipe.path !== marker.recipe) findings.push({ check: 'baseline-only-rezeptpfad', identity: entry.sourceIdentity, detail: `Eintrag verweist auf ${marker.recipe}, das Rezept liegt unter ${recipe.path}` });
    if (recipe.schemaVersion !== BASELINE_ONLY_RECIPE_SCHEMA) findings.push({ check: 'baseline-only-rezeptschema', identity: entry.sourceIdentity, detail: `Rezept ${recipe.path} hat das Schema ${recipe.schemaVersion || '–'}` });
    if (recipe.base.url !== entry.sourceUrl || recipe.base.sha256 !== entry.sha256) findings.push({ check: 'baseline-only-rezept-abweichung', identity: entry.sourceIdentity, detail: `Rezept beschreibt ${recipe.base.url} (${recipe.base.sha256.slice(0, 16)}…), der Eintrag ${entry.sourceUrl} (${entry.sha256.slice(0, 16)}…)` });
    if (!entry.rawDocuments.some((raw) => raw.role === 'gazette' && raw.url === entry.sourceUrl && raw.sha256 === entry.sha256)) findings.push({ check: 'baseline-only-ohne-rohquelle', identity: entry.sourceIdentity, detail: 'Die Ausgangsverkündung fehlt unter den Rohquellen (Rolle gazette) – r2-sync archivierte sie nicht' });
  }
  const identities = new Set(entries.map((entry) => entry.sourceIdentity));
  for (const recipe of recipes) {
    if (!identities.has(recipe.id)) findings.push({ check: 'baseline-only-rezept-ohne-manifest', identity: recipe.id || recipe.path, detail: `${recipe.path} ohne Manifesteintrag im Bereich events` });
  }
  return findings;
}

/* ------------------------------------------------------------------------------------------ */
/* Rohquellen: Begleitdatei und nachgerechneter SHA-256                                        */

export interface RawSourceAudit {
  findings: AuditFinding[];
  notices: string[];
  packages: number;
}

/**
 * Jedes Exportpaket unter `sources/bayernrecht/` muss eine Begleitdatei haben, und deren SHA-256 muss
 * für genau diese Bytes gelten – nachgerechnet, nicht übernommen. Umgekehrt ist ein Korpuseintrag
 * ohne lokales Paket kein Widerspruch: Die Pakete liegen nach `sources/README.md` bewusst nicht in Git.
 */
export async function auditRawSources(root: string, corpus: CorpusFile | undefined): Promise<RawSourceAudit> {
  const findings: AuditFinding[] = [];
  const notices: string[] = [];
  const corpusById = new Map((corpus?.entries ?? []).map((entry) => [entry.documentId, entry]));
  let directories: string[] = [];
  try {
    directories = (await readdir(join(root, CORPUS_SOURCE_DIR), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(compareSourceIdentity);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    if (corpusById.size > 0) notices.push(`${CORPUS_SOURCE_DIR}/ fehlt in dieser Arbeitskopie; ${corpusById.size} Exportpakete des Beispielkorpus sind nicht lokal (sources/README.md)`);
    return { findings, notices, packages: 0 };
  }

  let packages = 0;
  for (const documentId of directories) {
    const packagePath = corpusPackagePath(documentId);
    const sidecarPath = corpusSidecarPath(documentId);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(join(root, packagePath)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      findings.push({ check: 'rohquelle-ohne-paket', identity: documentId, detail: `${CORPUS_SOURCE_DIR}/${documentId}/ enthält kein ${documentId}.zip` });
      continue;
    }
    packages += 1;
    const sidecar = await readJsonFile<CorpusSourceRecord>(join(root, sidecarPath));
    if (!sidecar) {
      findings.push({ check: 'rohquelle-ohne-begleitdatei', identity: documentId, detail: `${packagePath} liegt ohne ${sidecarPath}; ohne Begleitdatei ist nicht belegt, von welcher Adresse die Bytes stammen` });
      continue;
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sidecar.documentId !== documentId) findings.push({ check: 'rohquelle-kennung-abweichung', identity: documentId, detail: `${sidecarPath} führt die Kennung ${sidecar.documentId}` });
    if (sidecar.sha256 !== sha256) findings.push({ check: 'rohquelle-hash-abweichung', identity: documentId, detail: `${packagePath}: SHA-256 der Bytes ${sha256.slice(0, 16)}…, Begleitdatei ${String(sidecar.sha256).slice(0, 16)}…` });
    if (sidecar.byteLength !== bytes.byteLength) findings.push({ check: 'rohquelle-groesse-abweichung', identity: documentId, detail: `${packagePath}: ${bytes.byteLength} Bytes, Begleitdatei ${sidecar.byteLength}` });
    const entry = corpusById.get(documentId);
    if (!entry) findings.push({ check: 'rohquelle-ohne-korpuseintrag', identity: documentId, detail: `${packagePath} gehört zu keinem Eintrag in ${CORPUS_PATH}` });
    else if (entry.package.sha256 !== sha256) findings.push({ check: 'korpus-hash-abweichung', identity: documentId, detail: `${CORPUS_PATH} führt den SHA-256 ${entry.package.sha256.slice(0, 16)}…, die Bytes ergeben ${sha256.slice(0, 16)}…` });
  }

  const missing = [...corpusById.keys()].filter((documentId) => !directories.includes(documentId)).sort(compareSourceIdentity);
  if (missing.length > 0) notices.push(`${missing.length} Exportpaket(e) des Beispielkorpus liegen nicht in dieser Arbeitskopie (${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ', …' : ''}); nach sources/README.md bewusst nicht in Git`);
  return { findings, notices, packages };
}

/* ------------------------------------------------------------------------------------------ */
/* Gesamtlauf                                                                                  */

export interface AuditOptions {
  /** Die Rohquellen nicht nachrechnen (Tests; im Betrieb nie gesetzt). */
  skipRawSources?: boolean;
}

export async function runAudit(root: string, options: AuditOptions = {}): Promise<AuditReport> {
  const findings: AuditFinding[] = [];
  const notices: string[] = [];

  const manifest = await readManifest(root);
  const enumerations = new Map<SourceArea, EnumerationFile>();
  const enumerationCounts: Record<string, number> = {};
  for (const area of SOURCE_AREAS) {
    if (!ENUMERABLE_AREAS.includes(area)) continue;
    const file = await readEnumeration(root, area);
    if (!file) {
      notices.push(`Enumeration ${area} fehlt; die Gegenprüfung gegen Manifest und Korpus entfällt für diesen Bereich (npm run import:bayernrecht:enumerate -- --area ${area} --write)`);
      continue;
    }
    enumerations.set(area, file);
    enumerationCounts[area] = file.items.length;
  }

  const corpus = await readJsonFile<CorpusFile>(join(root, CORPUS_PATH));
  if (!corpus) notices.push(`${CORPUS_PATH} fehlt; der Beispielkorpus wird nicht gegengeprüft (npm run import:bayernrecht:sample -- --write)`);

  findings.push(...checkEnumerationAgainstManifest(enumerations, manifest));
  findings.push(...checkCorpusAgainstEnumeration(corpus, enumerations));

  let registry: SlugRegistry | undefined;
  try {
    registry = await readSlugRegistry(root);
    findings.push(...checkSlugRegistry(manifest, registry));
  } catch (error) {
    findings.push({ check: 'slug-registry-ungueltig', identity: SLUG_REGISTRY_PATH, detail: (error as Error).message });
  }

  let queue: ReviewQueue | undefined;
  try {
    queue = await readReviewQueue(root);
    findings.push(...checkReviewAgainstManifest(queue, manifest));
  } catch (error) {
    findings.push({ check: 'review-queue-ungueltig', identity: 'review', detail: (error as Error).message });
  }

  let overrides: OverrideRegistry | undefined;
  try {
    overrides = await readOverrides(root);
    findings.push(...checkOverridesAgainstManifest(overrides, manifest));
  } catch (error) {
    findings.push({ check: 'overrides-ungueltig', identity: 'overrides', detail: (error as Error).message });
  }

  findings.push(...checkBaselineOnly(manifest, await readRecipeHeads(root)));

  let sourcePackages = 0;
  if (options.skipRawSources !== true) {
    const raw = await auditRawSources(root, corpus);
    findings.push(...raw.findings);
    notices.push(...raw.notices);
    sourcePackages = raw.packages;
  }

  findings.sort(byIdentityThenCheck);
  return {
    jurisdiction: TARGET_JURISDICTION,
    sourceSystem: SOURCE_SYSTEM,
    counts: {
      enumeration: enumerationCounts,
      manifestEntries: manifest.entries.length,
      imported: manifest.entries.filter((entry: ManifestEntry) => isImportedStatus(entry.importStatus)).length,
      slugRegistry: registry?.entries.length ?? 0,
      corpusEntries: corpus?.entries.length ?? 0,
      reviewItems: queue?.items.length ?? 0,
      openReviewItems: queue ? openReviewItems(queue).length : 0,
      overrides: overrides?.entries.length ?? 0,
      baselineOnlyRestored: manifest.entries.filter((entry: ManifestEntry) => isBaselineOnlyEntry(entry) && isImportedStatus(entry.importStatus)).length,
      sourcePackages,
    },
    findings,
    notices: notices.sort(),
    ok: findings.length === 0,
  };
}

/** Lesefassung des Berichts (eine Zeile je Abweichung, mit Kennung). */
export function auditSummary(report: AuditReport): string[] {
  const counts = report.counts;
  const enumeration = Object.entries(counts.enumeration).map(([area, count]) => `${area} ${count}`).join(', ') || 'keine';
  const lines = [
    `Audit ${report.jurisdiction.toUpperCase()} (${report.sourceSystem}): ${report.ok ? 'keine Abweichung' : `${report.findings.length} Abweichung(en)`}`,
    `  Enumeration: ${enumeration}`,
    `  Manifest: ${counts.manifestEntries} Einträge, davon ${counts.imported} übernommen · Slug-Registry ${counts.slugRegistry} · Overrides ${counts.overrides}`,
    `  Review: ${counts.reviewItems} Fälle, offen ${counts.openReviewItems} · Beispielkorpus ${counts.corpusEntries} Normen, ${counts.sourcePackages} Exportpakete lokal`,
    `  baseline-only wiederhergestellt: ${counts.baselineOnlyRestored} (Bereich events, Rezepte unter data/imports/bayernrecht/baseline-only/)`,
  ];
  for (const finding of report.findings) lines.push(`  [${finding.check}] ${finding.identity}: ${finding.detail}`);
  for (const notice of report.notices) lines.push(`  Hinweis: ${notice}`);
  return lines;
}
