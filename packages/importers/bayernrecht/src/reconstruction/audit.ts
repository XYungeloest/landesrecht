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
import { AUDIT_DIR, EVALUATION_DATE, PARSER_VERSION } from '../common/constants.ts';
import { verifyRoundTrip } from './apply.ts';
import { bodyFingerprint, isRecipeV2, recipeAmendments, recipeSources, type AnyReconstructionRecipe } from './recipe.ts';
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
}

export interface ReconstructionAudit {
  schemaVersion: typeof AUDIT_SCHEMA;
  baselineDate: string;
  parserVersion: string;
  totals: { recipes: number; single: number; multi: number; forwardCheckPassed: number; sourceCheckPassed: number };
  entries: AuditEntry[];
}

export async function auditRecipe(root: string, recipe: AnyReconstructionRecipe): Promise<AuditEntry> {
  const cachedPackage = await readCached(root, packageUrl(recipe.documentId));
  let forwardCheck: AuditEntry['forwardCheck'];
  if (!cachedPackage) forwardCheck = { ok: false, detail: 'Heutiges Paket nicht im Cache' };
  else {
    try {
      const norm = parseCurrentNorm(recipe.documentId, cachedPackage, EVALUATION_DATE);
      forwardCheck = verifyRoundTrip(norm.body, recipe);
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
  };
}

export async function buildAudit(root: string, recipes: readonly AnyReconstructionRecipe[], baselineDate: string): Promise<ReconstructionAudit> {
  const entries: AuditEntry[] = [];
  for (const recipe of [...recipes].sort((left, right) => (left.documentId < right.documentId ? -1 : 1))) entries.push(await auditRecipe(root, recipe));
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
    },
    entries,
  };
}

/** Fingerabdruck des Audits selbst (für die Prüfung auf Determinismus). */
export const auditFingerprint = (audit: ReconstructionAudit): string => bodyFingerprint([audit as never]);
