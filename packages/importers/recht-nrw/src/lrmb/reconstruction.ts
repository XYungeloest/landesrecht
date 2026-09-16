/**
 * Rekonstruktion der Stichtagsfassung einer LRMB-Vorschrift – nie still, nie heuristisch.
 *
 * Eine Rekonstruktion ist nur mit einem geprüften Rezept zulässig
 * (`data/imports/recht-nrw/reconstructions/term-<id>.json`). Das Rezept nennt:
 *   - die Basis (Portalseite; ihr Text-Fingerabdruck wird festgehalten),
 *   - jede Änderung mit Fundstelle und Ministerialblatt-Adresse,
 *   - jeden Schritt mit dem wörtlichen Änderungsbefehl, Ziel (Gliederungsraum + Nummer) und Operation,
 *   - die erwarteten Fingerabdrücke vor und nach der Rekonstruktion.
 *
 * Die Anwendung prüft fail-closed:
 *   1. Die Änderungen des Rezepts sind genau die, die die Stichtagsprüfung verlangt (nichts fehlt, nichts zu viel).
 *   2. Jeder Änderungsbefehl steht wörtlich im archivierten Ministerialblatt-Eintrag.
 *   3. Die zitierten Wortlaute des Befehls („…“) stimmen mit den Schrittdaten überein.
 *   4. Das Ziel existiert genau einmal; der zu ändernde Wortlaut kommt darin genau einmal vor.
 *   5. Basis- und Ergebnis-Fingerabdruck entsprechen dem Rezept; eine zweite Anwendung ergibt dasselbe Ergebnis.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import { RECONSTRUCTIONS_DIR, type ReconstructionSource, type ReconstructionStepRecord } from '../common/manifest.ts';
import { stableStringify } from '../common/persist.ts';
import type { AmendmentEvidence } from './validity.ts';

export const RECONSTRUCTION_SCHEMA = 'recht-nrw-lrmb-reconstruction/1' as const;

export const RECONSTRUCTION_OPERATIONS = [
  /** Rückgängig machen einer Einfügung: der eingefügte Wortlaut wird entfernt. */
  'remove-inserted-text',
  /** Rückgängig machen einer Ersetzung: neuer Wortlaut (`to`) → alter Wortlaut (`from`). */
  'revert-replacement',
  /** Vorwärts: Wortlaut ersetzen (`from` → `to`). */
  'apply-replacement',
  /** Vorwärts: Wortlaut nach einem eindeutigen Anker einfügen. */
  'insert-text-after',
  /** Vorwärts: Wortlaut streichen. */
  'remove-text',
] as const;
export type ReconstructionOperation = (typeof RECONSTRUCTION_OPERATIONS)[number];

export interface ReconstructionStep {
  id: string;
  /** Wörtlicher Änderungsbefehl aus dem Ministerialblatt. */
  instruction: string;
  operation: ReconstructionOperation;
  target: { scope?: string; label: string };
  text?: string;
  from?: string;
  to?: string;
  anchor?: string;
}

export interface ReconstructionRecipe {
  schemaVersion: typeof RECONSTRUCTION_SCHEMA;
  sourceIdentity: string;
  title: string;
  baselineDate: string;
  mode: 'reverse' | 'forward';
  base: { url: string; description: string };
  amendments: Array<{ decreeDate: string; citation: string; gazetteUrl: string; steps: ReconstructionStep[] }>;
  review: { reviewedAt: string; note: string };
  expected: { baseFingerprint: string; resultFingerprint: string };
}

export interface GazetteDocument {
  url: string;
  text: string;
  sha256: string;
  retrievedAt: string;
  localSource?: string;
  objectKey?: string;
}

export interface ReconstructionResult {
  ok: boolean;
  blocks: NormBodyBlock[];
  baseFingerprint: string;
  resultFingerprint: string;
  steps: ReconstructionStepRecord[];
  sources: ReconstructionSource[];
  findings: ImportFinding[];
}

export function bodyFingerprint(blocks: readonly NormBodyBlock[]): string {
  return createHash('sha256').update(stableStringify(blocks)).digest('hex');
}

export async function readReconstructionRecipe(root: string, sourceIdentity: string): Promise<ReconstructionRecipe | undefined> {
  const file = join(root, RECONSTRUCTIONS_DIR, `${sourceIdentity.replace(/^term:/u, 'term-')}.json`);
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  const recipe = JSON.parse(raw) as ReconstructionRecipe;
  if (recipe.schemaVersion !== RECONSTRUCTION_SCHEMA) throw new Error(`${file}: unbekannte Schemaversion ${recipe.schemaVersion}`);
  if (recipe.sourceIdentity !== sourceIdentity) throw new Error(`${file}: Quellidentität ${recipe.sourceIdentity} passt nicht zu ${sourceIdentity}`);
  return recipe;
}

/** Vereinheitlicht Leerraum und Anführungszeichen für den Wortlautvergleich. */
export function normalizeWording(value: string): string {
  return value.replace(/[„“”"]/gu, '"').replace(/[‘’‚]/gu, "'").replace(/[–—]/gu, '-').replace(/\(\s+/gu, '(').replace(/\s+\)/gu, ')').replace(/\s+([,.;:])/gu, '$1').replace(/\s+/gu, ' ').trim();
}

/** Zitate auf oberster Ebene („…“, verschachtelte „…“ bleiben Teil des äußeren Zitats). */
export function topLevelQuotes(value: string): string[] {
  const quotes: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '„') {
      if (depth > 0) current += char;
      depth += 1;
      continue;
    }
    if (char === '“' && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        quotes.push(current.trim());
        current = '';
      } else {
        current += char;
      }
      continue;
    }
    if (depth > 0) current += char;
  }
  return quotes;
}

const PROVISION = new Set(['section', 'subsection']);

function findUnit(blocks: readonly NormBodyBlock[], target: ReconstructionStep['target']): NormBodyBlock[] {
  let scopeBlocks: readonly NormBodyBlock[] = blocks;
  if (target.scope) {
    const scopes = blocks.filter((block) => (block.type === 'part' || block.type === 'annex') && block.label === target.scope);
    if (scopes.length !== 1) return [];
    scopeBlocks = scopes[0]!.children ?? [];
  }
  const found: NormBodyBlock[] = [];
  const visit = (entries: readonly NormBodyBlock[]): void => {
    for (const block of entries) {
      if (PROVISION.has(block.type) && block.label === target.label) found.push(block);
      if (block.children) visit(block.children);
    }
  };
  visit(scopeBlocks);
  return found;
}

/** Textfelder einer Einheit ohne untergeordnete Einheiten (mit Elternliste für das Entfernen leerer Blöcke). */
function ownTextBlocks(unit: NormBodyBlock): Array<{ block: NormBodyBlock; parent: NormBodyBlock[] }> {
  const output: Array<{ block: NormBodyBlock; parent: NormBodyBlock[] }> = [];
  const visit = (entries: NormBodyBlock[]): void => {
    for (const block of entries) {
      if (PROVISION.has(block.type) || block.type === 'footnote') continue;
      if (typeof block.text === 'string') output.push({ block, parent: entries });
      if (block.children) visit(block.children);
    }
  };
  visit(unit.children ?? []);
  return output;
}

function occurrences(haystack: string, needle: string): number[] {
  const positions: number[] = [];
  if (!needle) return positions;
  let index = haystack.indexOf(needle);
  while (index >= 0) {
    positions.push(index);
    index = haystack.indexOf(needle, index + needle.length);
  }
  return positions;
}

function spliceText(value: string, start: number, length: number, insert: string): string {
  let before = value.slice(0, start);
  let after = value.slice(start + length);
  if (!insert) {
    if (before.endsWith(' ') && after.startsWith(' ')) after = after.slice(1);
    if (!before.trim()) after = after.trimStart();
    if (!after.trim()) before = before.trimEnd();
  }
  return `${before}${insert}${after}`;
}

export function applyReconstruction(recipe: ReconstructionRecipe, input: { blocks: readonly NormBodyBlock[]; baselineDate: string; required: readonly AmendmentEvidence[]; gazettes: ReadonlyMap<string, GazetteDocument>; baseSource: Omit<ReconstructionSource, 'role' | 'label'> }): ReconstructionResult {
  const findings: ImportFinding[] = [];
  const blocks: NormBodyBlock[] = structuredClone(input.blocks) as NormBodyBlock[];
  const baseFingerprint = bodyFingerprint(blocks);
  const steps: ReconstructionStepRecord[] = [];
  const sources: ReconstructionSource[] = [{ role: 'base', label: recipe.base.description, ...input.baseSource }];
  const fail = (code: string, message: string): void => {
    findings.push({ severity: 'error', code: `reconstruction-${code}`, message });
  };

  if (recipe.baselineDate !== input.baselineDate) fail('recipe-baseline', `Rezept für Stichtag ${recipe.baselineDate}, Import für ${input.baselineDate}`);
  if (baseFingerprint !== recipe.expected.baseFingerprint) fail('base-changed', `Basistext weicht vom geprüften Rezept ab (Fingerabdruck ${baseFingerprint.slice(0, 16)} ≠ ${recipe.expected.baseFingerprint.slice(0, 16)})`);

  const requiredKeys = new Set(input.required.map((amendment) => `${amendment.note.decreeDate}|${amendment.note.citation?.text ?? ''}`));
  const recipeKeys = new Set(recipe.amendments.map((amendment) => `${amendment.decreeDate}|${amendment.citation}`));
  const missing = [...requiredKeys].filter((key) => !recipeKeys.has(key));
  const extra = [...recipeKeys].filter((key) => !requiredKeys.has(key));
  if (missing.length > 0 || extra.length > 0) fail('recipe-mismatch', `Rezept und Stichtagsprüfung stimmen nicht überein (fehlend: ${missing.join(', ') || '–'}; überzählig: ${extra.join(', ') || '–'})`);

  for (const amendment of recipe.amendments) {
    const gazette = input.gazettes.get(amendment.gazetteUrl);
    if (!gazette) {
      fail('source-missing', `Ministerialblatt-Eintrag ${amendment.gazetteUrl} wurde nicht abgerufen`);
      continue;
    }
    const required = input.required.find((entry) => entry.note.decreeDate === amendment.decreeDate);
    const source: ReconstructionSource = { role: 'amendment', label: `Runderlass vom ${amendment.decreeDate} (${amendment.citation})`, url: gazette.url, sha256: gazette.sha256, retrievedAt: gazette.retrievedAt, citation: amendment.citation };
    if (gazette.localSource) source.localSource = gazette.localSource;
    if (gazette.objectKey) source.objectKey = gazette.objectKey;
    if (required?.inForce) source.inForce = required.inForce;
    sources.push(source);
    const normalizedGazette = normalizeWording(gazette.text);
    // Reverse: Schritte in umgekehrter Reihenfolge anwenden (spätere Befehle zuerst zurücknehmen).
    const ordered = recipe.mode === 'reverse' ? [...amendment.steps].reverse() : amendment.steps;
    for (const step of ordered) {
      const before = bodyFingerprint(blocks);
      if (!normalizedGazette.includes(normalizeWording(step.instruction))) {
        fail('instruction-not-in-source', `Schritt ${step.id}: Befehl steht nicht wörtlich in ${amendment.citation}`);
        continue;
      }
      const quotes = topLevelQuotes(step.instruction).map(normalizeWording);
      const expectQuotes = (values: Array<string | undefined>): boolean => values.every((value, position) => value !== undefined && quotes[position] === normalizeWording(value));
      const units = findUnit(blocks, step.target);
      if (units.length !== 1) {
        fail('target-not-unique', `Schritt ${step.id}: Ziel ${step.target.scope ?? ''} ${step.target.label} ${units.length === 0 ? 'nicht gefunden' : `${units.length}-mal gefunden`}`);
        continue;
      }
      const fields = ownTextBlocks(units[0]!);
      let removedBlocks = 0;
      const locate = (needle: string): { block: NormBodyBlock; parent: NormBodyBlock[]; index: number } | undefined => {
        const hits = fields.flatMap(({ block, parent }) => occurrences(block.text!, needle).map((index) => ({ block, parent, index })));
        if (hits.length !== 1) {
          fail('wording-not-unique', `Schritt ${step.id}: Wortlaut „${needle.slice(0, 60)}…“ kommt in ${step.target.label} ${hits.length}-mal vor`);
          return undefined;
        }
        return hits[0];
      };
      let applied = false;
      switch (step.operation) {
        case 'remove-inserted-text':
        case 'remove-text': {
          if (!step.text || !expectQuotes([step.text])) {
            fail('quote-mismatch', `Schritt ${step.id}: eingefügter Wortlaut stimmt nicht mit dem Zitat im Befehl überein`);
            break;
          }
          const hit = locate(step.text);
          if (hit) {
            hit.block.text = spliceText(hit.block.text!, hit.index, step.text.length, '');
            // Eine als eigener Absatz eingefügte Angabe hinterlässt keinen leeren Absatz.
            if (!hit.block.text.trim() && !(hit.block.children?.length)) {
              hit.parent.splice(hit.parent.indexOf(hit.block), 1);
              removedBlocks += 1;
            }
            applied = true;
          }
          break;
        }
        case 'revert-replacement':
        case 'apply-replacement': {
          if (!step.from || !step.to || !expectQuotes([step.from, step.to])) {
            fail('quote-mismatch', `Schritt ${step.id}: alter/neuer Wortlaut stimmt nicht mit den Zitaten im Befehl überein`);
            break;
          }
          const [search, replacement] = step.operation === 'revert-replacement' ? [step.to, step.from] : [step.from, step.to];
          const hit = locate(search);
          if (hit) {
            hit.block.text = spliceText(hit.block.text!, hit.index, search.length, replacement);
            applied = true;
          }
          break;
        }
        case 'insert-text-after': {
          if (!step.text || !step.anchor || !expectQuotes([step.text])) {
            fail('quote-mismatch', `Schritt ${step.id}: einzufügender Wortlaut stimmt nicht mit dem Zitat im Befehl überein`);
            break;
          }
          const hit = locate(step.anchor);
          if (hit) {
            hit.block.text = spliceText(hit.block.text!, hit.index + step.anchor.length, 0, ` ${step.text}`);
            applied = true;
          }
          break;
        }
        default:
          fail('unknown-operation', `Schritt ${step.id}: unbekannte Operation ${String(step.operation)}`);
      }
      if (applied) steps.push({ id: step.id, amendment: amendment.citation, mode: recipe.mode, operation: step.operation, target: `${step.target.scope ? `${step.target.scope} ` : ''}${step.target.label}`, instruction: step.instruction, beforeFingerprint: before, afterFingerprint: bodyFingerprint(blocks), ...(removedBlocks > 0 ? { removedBlocks } : {}) });
    }
  }

  const resultFingerprint = bodyFingerprint(blocks);
  if (findings.length === 0 && resultFingerprint !== recipe.expected.resultFingerprint) fail('result-mismatch', `Ergebnis weicht vom geprüften Rezept ab (Fingerabdruck ${resultFingerprint.slice(0, 16)} ≠ ${recipe.expected.resultFingerprint.slice(0, 16)})`);
  return { ok: findings.length === 0, blocks, baseFingerprint, resultFingerprint, steps, sources, findings };
}
