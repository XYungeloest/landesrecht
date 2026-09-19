/**
 * Maschinenlesbares Audit je rückgerechneter Stichtagsfassung (`data/audits/bayernrecht/reconstruction-audit.json`).
 *
 * Für jedes Rezept: Methode, Basisquelle (heutiges Paket) mit Prüfsumme, jede zurückgenommene Änderung mit
 * Verkündung, Prüfsumme, Inkrafttreten und ihren Operationen, der Beleg des Beginns der Stichtagsfassung mit
 * Quellen, die Fingerabdrücke (heute, je Zwischenstand, Stichtag) und das Ergebnis des Forward-Checks.
 *
 * **Offline neu berechnet und deterministisch:** Das Audit liest nur Rezepte und Cache, parst das heutige Paket
 * neu, wendet das Rezept rückwärts und vorwärts an und prüft die Prüfsumme jeder Verkündung gegen den Cache. Es
 * enthält keine Uhrzeit des Laufs; zwei Läufe über denselben Stand ergeben dieselbe Datei, Byte für Byte.
 */
import { CONVERTER_VERSION } from '../baseline-only/html.ts';
import { AUDIT_DIR, EVALUATION_DATE, PARSER_VERSION } from '../common/constants.ts';
import { applyReverseRecipeToLaw, verifyRoundTripLaw } from './apply.ts';
import { bodyFingerprint, isRecipeV2, recipeAmendments, recipeSources, type AnyReconstructionRecipe } from './recipe.ts';
import { gazetteUnits } from './gazette.ts';
import { cachePlatform, loadPublicationBase, proveRestoration, type PriorAmendment } from './publication.ts';
import { wordingAgreement, type FormConventions } from './restore.ts';
import { forwardPublicationBase } from './forward.ts';
import { commandBlocks } from './structure.ts';
import { titleState } from './title.ts';
import { packageUrl, parseCurrentNorm, readCached } from './source.ts';

export const RECONSTRUCTION_AUDIT_PATH = `${AUDIT_DIR}/reconstruction-audit.json`;
export const AUDIT_SCHEMA = 'bayernrecht-reconstruction-audit/1' as const;

export interface AuditEntry {
  documentId: string;
  method: 'reverse-amendment';
  recipe: { path: string; schema: string };
  /** Basisquelle: heutiges Exportpaket, auf dem die Rückrechnung arbeitet. */
  base: { url: string; sha256: string; cacheSha256?: string; parserVersion: string; inForceFrom: string };
  /** Zurückgenommene Änderungen, jüngste zuerst. */
  amendments: Array<{
    citation: string;
    url: string;
    sha256: string;
    cacheSha256?: string;
    eventDate: string;
    effectiveDate: string;
    effectiveDates: string[];
    section?: string;
    operations: Array<{ id: string; formula: string; kind: string; location: string }>;
  }>;
  baselineTextInForce: { date: string; evidence: number; sources: Array<{ citation: string; url: string; sha256: string; cacheSha256?: string }> };
  fingerprints: { current: string; baseline: string; intermediate: string[] };
  /** Forward-Check: Stichtagskörper plus alle Änderungen ergibt exakt den heutigen Körper. */
  forwardCheck: { ok: boolean; detail: string };
  /** Jede Verkündung liegt mit der im Rezept genannten Prüfsumme im Cache. */
  sourceCheck: { ok: boolean; mismatches: string[] };
  /**
   * Nur bei wiederhergestelltem Alttext (Lauf 7): Stammverkündung aus dem Cache neu umgesetzt, Fingerabdruck wie im
   * Rezept, zurückgerechneter Stichtagskörper im Wortlaut gleich dem Stand der Verkündungen.
   */
  restorationCheck?: { ok: boolean; detail: string; sources: Array<{ role: string; citation: string; url: string; sha256: string; cacheSha256?: string }> };
}

export interface ReconstructionAudit {
  schemaVersion: typeof AUDIT_SCHEMA;
  baselineDate: string;
  parserVersion: string;
  totals: { recipes: number; single: number; multi: number; forwardCheckPassed: number; sourceCheckPassed: number; restored?: number; restorationCheckPassed?: number };
  entries: AuditEntry[];
}

export async function auditRecipe(root: string, recipe: AnyReconstructionRecipe, conventions?: FormConventions): Promise<AuditEntry> {
  const cachedPackage = await readCached(root, packageUrl(recipe.documentId));
  let forwardCheck: AuditEntry['forwardCheck'];
  if (!cachedPackage) forwardCheck = { ok: false, detail: 'Heutiges Paket nicht im Cache' };
  else {
    try {
      const norm = parseCurrentNorm(recipe.documentId, cachedPackage, EVALUATION_DATE);
      // Die Quellen einer Wiederherstellung prüft dieses Audit unten selbst (Cache, Umsetzung, Wortlaut).
      forwardCheck = verifyRoundTripLaw(norm.document.law, recipe, { restorationChecked: true });
    } catch (error) {
      forwardCheck = { ok: false, detail: `Paket nicht lesbar: ${(error as Error).message}` };
    }
  }
  const mismatches: string[] = [];
  const cacheSha = async (url: string, expected: string): Promise<string | undefined> => {
    const cached = await readCached(root, url);
    if (!cached) mismatches.push(`${url}: nicht im Cache`);
    else if (cached.sha256 !== expected) mismatches.push(`${url}: Cache ${cached.sha256.slice(0, 16)}… ≠ Rezept ${expected.slice(0, 16)}…`);
    return cached?.sha256;
  };
  if (cachedPackage && cachedPackage.sha256 !== recipe.source.sha256) mismatches.push(`${recipe.source.url}: Cache ${cachedPackage.sha256.slice(0, 16)}… ≠ Rezept ${recipe.source.sha256.slice(0, 16)}…`);
  const amendments: AuditEntry['amendments'] = [];
  for (const amendment of recipeAmendments(recipe)) {
    const cacheSha256 = await cacheSha(amendment.url, amendment.sha256);
    amendments.push({
      citation: amendment.citation,
      url: amendment.url,
      sha256: amendment.sha256,
      ...(cacheSha256 ? { cacheSha256 } : {}),
      eventDate: amendment.eventDate,
      effectiveDate: amendment.effectiveDate,
      effectiveDates: amendment.effectiveDates ?? [amendment.effectiveDate],
      ...(amendment.section ? { section: amendment.section } : {}),
      operations: amendment.steps.map((step) => ({ id: step.id, formula: step.formula, kind: step.operation.kind, location: step.location })),
    });
  }
  const startSources: AuditEntry['baselineTextInForce']['sources'] = [];
  for (const source of recipeSources(recipe).filter((entry) => entry.role === 'baseline-start')) {
    const cacheSha256 = await cacheSha(source.url, source.sha256);
    startSources.push({ citation: source.citation, url: source.url, sha256: source.sha256, ...(cacheSha256 ? { cacheSha256 } : {}) });
  }
  let restorationCheck: AuditEntry['restorationCheck'];
  if (recipe.restoration) {
    const sources: NonNullable<AuditEntry['restorationCheck']>['sources'] = [];
    for (const source of recipe.restoration.sources) {
      const cacheSha256 = await cacheSha(source.url, source.sha256);
      sources.push({ role: source.role, citation: source.citation, url: source.url, sha256: source.sha256, ...(cacheSha256 ? { cacheSha256 } : {}) });
    }
    restorationCheck = { ...(await recheckRestoration(root, recipe, cachedPackage, conventions)), sources };
  }
  return {
    documentId: recipe.documentId,
    method: 'reverse-amendment',
    recipe: { path: `data/imports/bayernrecht/reconstruction/${recipe.documentId}.json`, schema: recipe.schemaVersion },
    base: { url: recipe.source.url, sha256: recipe.source.sha256, ...(cachedPackage ? { cacheSha256: cachedPackage.sha256 } : {}), parserVersion: recipe.source.parserVersion, inForceFrom: recipe.source.inForceFrom },
    amendments,
    baselineTextInForce: { date: recipe.baselineTextInForce.date, evidence: recipe.baselineTextInForce.evidence.length, sources: startSources },
    fingerprints: {
      current: recipe.expected.currentFingerprint,
      baseline: recipe.expected.baselineFingerprint,
      intermediate: isRecipeV2(recipe) ? recipe.amendments.slice(0, -1).map((amendment) => amendment.expected.beforeFingerprint) : [],
    },
    forwardCheck,
    sourceCheck: { ok: mismatches.length === 0, mismatches },
    ...(restorationCheck ? { restorationCheck } : {}),
  };
}

/**
 * Nachrechnung einer Wiederherstellung aus dem Cache: Stammverkündung neu aufgelöst und umgesetzt (Fingerabdruck wie im
 * Rezept), Stichtagskörper aus dem Rezept, dann die Änderungen vor dem Stichtag (Befehlsblock je Einleitungssatz) rückwärts
 * bis zur Stammfassung – im Wortlaut gleich der Stammverkündung.
 */
async function recheckRestoration(root: string, recipe: AnyReconstructionRecipe, cachedPackage: Awaited<ReturnType<typeof readCached>>, conventions?: FormConventions): Promise<{ ok: boolean; detail: string }> {
  const restoration = recipe.restoration!;
  if (!cachedPackage) return { ok: false, detail: 'Heutiges Paket nicht im Cache' };
  if (restoration.converter !== CONVERTER_VERSION) return { ok: false, detail: `Umsetzer ${restoration.converter} ≠ ${CONVERTER_VERSION}` };
  try {
    const norm = parseCurrentNorm(recipe.documentId, cachedPackage, EVALUATION_DATE);
    const loaded = await loadPublicationBase(cachePlatform(root), norm);
    if (!loaded.ok) return { ok: false, detail: `Stammverkündung: ${loaded.detail}` };
    const baseSource = restoration.sources.find((source) => source.role === 'base-publication');
    if (!baseSource || loaded.base.sources[0]!.url !== baseSource.url || loaded.base.sources[0]!.sha256 !== baseSource.sha256) return { ok: false, detail: 'Stammverkündung im Cache ist nicht die des Rezepts' };
    if (bodyFingerprint(loaded.base.body) !== restoration.publicationFingerprint) return { ok: false, detail: 'Blockmodell der Stammverkündung weicht vom Rezept ab' };
    const prior: PriorAmendment[] = [];
    for (const source of restoration.sources.filter((entry) => entry.role === 'prior-amendment')) {
      const page = await readCached(root, source.url);
      if (!page) return { ok: false, detail: `${source.citation}: nicht im Cache` };
      const block = commandBlocks(gazetteUnits(new TextDecoder().decode(page.bytes)), norm.identity).blocks.find((entry) => entry.intro.index === source.introIndex);
      if (!block) return { ok: false, detail: `${source.citation}: Befehlsblock (Einheit ${source.introIndex ?? '–'}) nicht gefunden` };
      prior.push({ label: source.citation, block, url: source.url, sha256: source.sha256, authority: source.authority, representation: source.representation });
    }
    const baseline = applyReverseRecipeToLaw(norm.document.law, recipe, { restorationChecked: true });
    if (restoration.derivation === 'forward') {
      // Lauf 9: Stand am Stichtag vorwärts neu gewonnen (Quellen in Reihenfolge ältest zuerst), dann die Wortlautprobe.
      const state = forwardPublicationBase(loaded.base, [...prior].reverse());
      if (!state.ok) return { ok: false, detail: state.detail };
      if (bodyFingerprint(state.base.body) !== restoration.forwardFingerprint) return { ok: false, detail: 'Vorwärts gewonnener Stand am Stichtag weicht vom Rezept ab' };
      const agreement = wordingAgreement(baseline.body, state.base);
      return agreement.ok ? { ok: true, detail: `vorwärts über ${prior.length} Änderung(en): ${agreement.detail}` } : { ok: false, detail: agreement.detail };
    }
    // Wie im Lauf: Portalgestalt aus dem heutigen Portalkörper und den Konventionen des Amtsblatts.
    const proof = proveRestoration(baseline.body, titleState(baseline), prior, { ...loaded.base, portal: norm.body, ...(conventions ? { conventions } : {}) });
    if (!proof.ok) return { ok: false, detail: proof.detail };
    if (restoration.stammfassungFingerprint && proof.stammfassungFingerprint !== restoration.stammfassungFingerprint) return { ok: false, detail: 'Stammfassung (Portalgestalt) weicht vom Rezept ab' };
    return { ok: true, detail: proof.agreement.detail };
  } catch (error) {
    return { ok: false, detail: `Nachrechnung gescheitert: ${(error as Error).message}` };
  }
}

export async function buildAudit(root: string, recipes: readonly AnyReconstructionRecipe[], baselineDate: string, conventions?: FormConventions): Promise<ReconstructionAudit> {
  const entries: AuditEntry[] = [];
  for (const recipe of [...recipes].sort((left, right) => (left.documentId < right.documentId ? -1 : 1))) entries.push(await auditRecipe(root, recipe, conventions));
  return {
    schemaVersion: AUDIT_SCHEMA,
    baselineDate,
    parserVersion: PARSER_VERSION,
    totals: {
      recipes: entries.length,
      single: entries.filter((entry) => entry.amendments.length === 1).length,
      multi: entries.filter((entry) => entry.amendments.length > 1).length,
      forwardCheckPassed: entries.filter((entry) => entry.forwardCheck.ok).length,
      sourceCheckPassed: entries.filter((entry) => entry.sourceCheck.ok).length,
      ...(entries.some((entry) => entry.restorationCheck) ? { restored: entries.filter((entry) => entry.restorationCheck).length, restorationCheckPassed: entries.filter((entry) => entry.restorationCheck?.ok).length } : {}),
    },
    entries,
  };
}

/** Fingerabdruck des Audits selbst (für die Prüfung auf Determinismus). */
export const auditFingerprint = (audit: ReconstructionAudit): string => bodyFingerprint([audit as never]);
