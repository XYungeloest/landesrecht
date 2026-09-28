/**
 * Lauf 12: Reviewentscheidungen zur Rückrechnung – für Fragen, die keine Quelle beantwortet und die deshalb ein Mensch
 * entscheidet, mit Namen, Datum und Begründung im Rezept.
 *
 * Bisher eine Art: `relabel-form` – die **Gestalt** einer bisherigen Gliederungsbezeichnung, wenn ein Befehl sie
 * umbenennt und die Bezeichnung selbst nicht zu zweifeln steht, wohl aber ihre Schreibweise im Portal („die Abschnitte I.
 * und II. werden die Kapitel 1 und 2“, GVBl. 2024 S. 630: im Bestand stehen Gliederungsteile als „Abschnitt I“, „I.
 * Abschnitt“ oder „I.“). Ohne Entscheidung bleibt die Norm mit `relabel-form-ambiguous` offen.
 *
 * Datei: `data/imports/bayernrecht/reconstruction-decisions.json` (von Hand gepflegt; fehlt sie, gibt es keine
 * Entscheidungen). Jede Entscheidung gilt für genau eine Norm und eine Verkündung und nennt die neue Bezeichnung, wie
 * das Portal sie heute führt (`to`), und die bisherige, wie sie ins Rezept geht (`from`).
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { IMPORT_DATA_DIR } from '../common/constants.ts';

export const RECONSTRUCTION_DECISIONS_PATH = `${IMPORT_DATA_DIR}/reconstruction-decisions.json`;
export const DECISIONS_SCHEMA = 'bayernrecht-reconstruction-decisions/v1';

export interface ReconstructionDecision {
  documentId: string;
  kind: 'relabel-form';
  /** Verkündung des Befehls („GVBl. 2024 S. 630“). */
  citation: string;
  /** Bezeichnung nach dem Befehl, wie das Portal sie führt („Kapitel 1“). */
  to: string;
  /** Bisherige Bezeichnung in der entschiedenen Gestalt („Abschnitt I“). */
  from: string;
  decidedBy: string;
  /** ISO-Datum. */
  decidedAt: string;
  reason: string;
}

/** Entscheidung, wie sie an einem Schritt des Rezepts steht. */
export interface LabelFormDecision {
  from: string;
  note: string;
}

const STRING_FIELDS = ['documentId', 'citation', 'to', 'from', 'decidedBy', 'decidedAt', 'reason'] as const;

export function parseDecisions(text: string): ReconstructionDecision[] {
  const parsed = JSON.parse(text) as { schema?: unknown; decisions?: unknown };
  if (parsed.schema !== DECISIONS_SCHEMA) throw new Error(`${RECONSTRUCTION_DECISIONS_PATH}: Schema „${String(parsed.schema)}“ statt „${DECISIONS_SCHEMA}“`);
  if (!Array.isArray(parsed.decisions)) throw new Error(`${RECONSTRUCTION_DECISIONS_PATH}: „decisions“ fehlt oder ist keine Liste`);
  return parsed.decisions.map((entry, index) => {
    const record = entry as Record<string, unknown>;
    for (const field of STRING_FIELDS) {
      if (typeof record[field] !== 'string' || (record[field] as string).trim() === '') throw new Error(`${RECONSTRUCTION_DECISIONS_PATH}: Entscheidung ${index + 1} ohne „${field}“`);
    }
    if (record.kind !== 'relabel-form') throw new Error(`${RECONSTRUCTION_DECISIONS_PATH}: Entscheidung ${index + 1}: Art „${String(record.kind)}“ unbekannt`);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(record.decidedAt as string)) throw new Error(`${RECONSTRUCTION_DECISIONS_PATH}: Entscheidung ${index + 1}: „decidedAt“ ist kein ISO-Datum`);
    return { documentId: record.documentId as string, kind: 'relabel-form', citation: record.citation as string, to: record.to as string, from: record.from as string, decidedBy: record.decidedBy as string, decidedAt: record.decidedAt as string, reason: record.reason as string };
  });
}

/** Alle Entscheidungen aus der Datei; ohne Datei keine. */
export async function loadDecisions(root: string): Promise<ReconstructionDecision[]> {
  let text: string;
  try {
    text = await readFile(join(root, RECONSTRUCTION_DECISIONS_PATH), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return parseDecisions(text);
}

/** Entschiedene Gestalten der bisherigen Bezeichnungen je neuer Bezeichnung – für eine Norm und eine Verkündung. */
export function labelFormsFor(decisions: readonly ReconstructionDecision[], documentId: string, citation: string): ReadonlyMap<string, LabelFormDecision> {
  const forms = new Map<string, LabelFormDecision>();
  for (const decision of decisions) {
    if (decision.kind !== 'relabel-form' || decision.documentId !== documentId || decision.citation !== citation) continue;
    if (forms.has(decision.to)) throw new Error(`${RECONSTRUCTION_DECISIONS_PATH}: zwei Entscheidungen für ${documentId}, ${citation}, „${decision.to}“`);
    forms.set(decision.to, { from: decision.from, note: `Gestalt der bisherigen Bezeichnung „${decision.from}“ nach Reviewentscheidung (${decision.decidedBy}, ${decision.decidedAt}): ${decision.reason}` });
  }
  return forms;
}
