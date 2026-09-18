/**
 * Quellkorrekturen (`data/imports/bayernrecht/source-corrections.json`): zweifelsfreie Tippfehler der Quelle, die im
 * kanonischen Datensatz richtig geschrieben werden – einzeln entschieden, nie über eine allgemeine Rechtschreibprüfung.
 *
 * Jede Korrektur ist an genau eine Quellfassung gebunden (Dokumentkennung **und** SHA-256 des Exportpakets), an ein
 * Feld des geparsten Datensatzes, an den Originalwortlaut und an die erwartete Zahl seiner Vorkommen. Passt eines davon
 * nicht mehr – neues Paket, anderer Wortlaut, andere Trefferzahl –, wird nichts still korrigiert: Die Norm wird
 * gesperrt, bis die Korrektur neu geprüft ist. Die Rohquelle (ZIP/XML) bleibt unverändert; der Originalwert steht mit
 * der Korrektur im Manifest (`sourceCorrections`) und als Quellnotiz an der Fassung.
 */
import { join } from 'node:path';

import { readJsonFile } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import type { SourceLaw } from '@landesrecht/importer-common/pipeline.ts';

import { SOURCE_CORRECTIONS_PATH } from './paths.ts';

export const SOURCE_CORRECTIONS_SCHEMA = 'bayernrecht-source-corrections/1' as const;
export const SOURCE_CORRECTION_REASONS = ['obvious-source-typo'] as const;
export type SourceCorrectionReason = (typeof SOURCE_CORRECTION_REASONS)[number];
/** Felder des geparsten Datensatzes, die korrigiert werden dürfen – bewusst keine Normtextfelder des Körpers. */
export const SOURCE_CORRECTION_FIELDS = ['title', 'shortTitle', 'abbr'] as const;
export type SourceCorrectionField = (typeof SOURCE_CORRECTION_FIELDS)[number];

export interface SourceCorrection {
  id: string;
  sourceIdentity: string;
  /** SHA-256 des Exportpakets, für das die Korrektur geprüft ist. */
  sourceSha256: string;
  field: SourceCorrectionField;
  /** Element der Quelle, aus dem das Feld stammt (Provenienz), z. B. `bayernrecht_kurztitel`. */
  sourceElement: string;
  original: string;
  corrected: string;
  /** Wie oft `original` im Feld stehen muss. */
  occurrences: number;
  reason: SourceCorrectionReason;
  /** Beleg dafür, dass die Korrektur zweifelsfrei ist. */
  evidence: string;
  decidedBy: string;
  decidedAt: string;
}

export interface SourceCorrectionRegistry {
  schemaVersion: typeof SOURCE_CORRECTIONS_SCHEMA;
  description?: string;
  corrections: SourceCorrection[];
}

/** Eine angewandte Korrektur, wie sie im Manifest steht. */
export interface AppliedSourceCorrection {
  id: string;
  sourceIdentity: string;
  sourceSha256: string;
  field: SourceCorrectionField;
  sourceElement: string;
  original: string;
  corrected: string;
  reason: SourceCorrectionReason;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

export function sourceCorrectionProblems(registry: unknown): string[] {
  const problems: string[] = [];
  if (!registry || typeof registry !== 'object') return ['kein JSON-Objekt'];
  const file = registry as Partial<SourceCorrectionRegistry>;
  if (file.schemaVersion !== SOURCE_CORRECTIONS_SCHEMA) problems.push(`schemaVersion ${String(file.schemaVersion)}`);
  if (!Array.isArray(file.corrections)) return [...problems, 'corrections fehlt'];
  const ids = new Set<string>();
  file.corrections.forEach((entry, index) => {
    const where = `corrections[${index}]`;
    if (!entry.id || ids.has(entry.id)) problems.push(`${where}: id fehlt oder doppelt`);
    ids.add(entry.id);
    if (!entry.sourceIdentity) problems.push(`${where}: sourceIdentity fehlt`);
    if (!SHA256.test(entry.sourceSha256 ?? '')) problems.push(`${where}: sourceSha256 ist kein SHA-256`);
    if (!(SOURCE_CORRECTION_FIELDS as readonly string[]).includes(entry.field)) problems.push(`${where}: Feld ${String(entry.field)} ist nicht korrigierbar`);
    if (!(SOURCE_CORRECTION_REASONS as readonly string[]).includes(entry.reason)) problems.push(`${where}: Grund ${String(entry.reason)} unbekannt`);
    if (!entry.original || !entry.corrected || entry.original === entry.corrected) problems.push(`${where}: original/corrected fehlen oder sind gleich`);
    if (!Number.isInteger(entry.occurrences) || entry.occurrences < 1) problems.push(`${where}: occurrences muss ≥ 1 sein`);
    if (!entry.evidence || !entry.decidedBy || !ISO_DATE.test(entry.decidedAt ?? '')) problems.push(`${where}: Beleg, Entscheider oder Datum fehlen`);
    if (!entry.sourceElement) problems.push(`${where}: sourceElement fehlt`);
  });
  return problems;
}

export async function readSourceCorrections(root: string): Promise<SourceCorrection[]> {
  const file = await readJsonFile<SourceCorrectionRegistry>(join(root, SOURCE_CORRECTIONS_PATH));
  if (!file) return [];
  const problems = sourceCorrectionProblems(file);
  if (problems.length > 0) throw new Error(`${SOURCE_CORRECTIONS_PATH}: ${problems.join('; ')}`);
  return file.corrections;
}

const occurrencesOf = (value: string, needle: string): number => value.split(needle).length - 1;

/**
 * Wendet die Korrekturen eines Dokuments an. Ergebnis: der korrigierte Datensatz und die angewandten Korrekturen –
 * oder ein Problem, das die Übernahme sperrt (Quellfassung oder Wortlaut passen nicht mehr).
 */
export function applySourceCorrections(law: SourceLaw, corrections: readonly SourceCorrection[], sourceSha256: string):
  { ok: true; law: SourceLaw; applied: AppliedSourceCorrection[] } | { ok: false; problem: string } {
  let result: SourceLaw = law;
  const applied: AppliedSourceCorrection[] = [];
  for (const correction of corrections) {
    if (correction.sourceSha256 !== sourceSha256) {
      return { ok: false, problem: `Quellkorrektur ${correction.id} gilt für das Paket ${correction.sourceSha256.slice(0, 16)}…, vorliegend ist ${sourceSha256.slice(0, 16)}… – neu prüfen` };
    }
    const value = result[correction.field];
    const found = typeof value === 'string' ? occurrencesOf(value, correction.original) : 0;
    if (found !== correction.occurrences) {
      return { ok: false, problem: `Quellkorrektur ${correction.id}: „${correction.original}“ steht ${found}-mal in ${correction.field}, erwartet ${correction.occurrences}-mal – neu prüfen` };
    }
    result = { ...result, [correction.field]: (value as string).split(correction.original).join(correction.corrected) };
    applied.push({
      id: correction.id,
      sourceIdentity: correction.sourceIdentity,
      sourceSha256: correction.sourceSha256,
      field: correction.field,
      sourceElement: correction.sourceElement,
      original: correction.original,
      corrected: correction.corrected,
      reason: correction.reason,
    });
  }
  if (applied.length > 0) {
    result = {
      ...result,
      sourceNotes: [
        ...(result.sourceNotes ?? []),
        ...applied.map((entry) => ({
          label: 'Quellkorrektur',
          text: `Offensichtlicher Tippfehler der Quelle berichtigt: „${entry.original}“ → „${entry.corrected}“ (${entry.sourceElement}, ${entry.sourceIdentity}, Paket-SHA-256 ${entry.sourceSha256.slice(0, 16)}…; Grund ${entry.reason}). Die Rohquelle bleibt unverändert.`,
        })),
      ],
    };
  }
  return { ok: true, law: result, applied };
}
