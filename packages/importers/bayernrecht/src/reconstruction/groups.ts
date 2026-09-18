/**
 * Gruppen der Rekonstruktionsschlange: **genau eine** Gruppe je Norm, dazu beliebig viele Gründe.
 *
 * Die Gruppe sagt, welche Art Arbeit zwischen heutigem Text und Stichtagsfassung liegt; sie folgt der
 * Arbeitsreihenfolge (erst einfache, exakt invertierbare Fälle, dann mehrstufige, komplexe zuletzt). Vergeben wird
 * nach Vorrang – die schwerste zutreffende Lage gewinnt, weil sie jede leichtere Arbeit überflüssig macht:
 *
 * | Vorrang | Gruppe | trifft zu, wenn |
 * | ---: | --- | --- |
 * | 1 | `contradictory-evidence` | Belege widersprechen einander (Inkrafttreten ≠ `inkraft`, Verlauf ≠ Kette, Änderung erst nach dem Auswertungsstichtag im heutigen Text …) |
 * | 2 | `baseline-only-predecessor` | der heutige Text ist eine Stammfassung, die erst nach dem Stichtag in Kraft trat – am Stichtag galt ein Vorgänger (oder nichts) |
 * | 3 | `full-recast` | eine Änderung der Kette fasst die ganze Norm neu (auch Neubekanntmachung, Ereignistyp `recast`) |
 * | 4 | `annex-replacement` | eine Anlage oder ein Anhang wird ersetzt oder neu gefasst |
 * | 5 | `table-replacement` | eine Tabelle (Zeile, Spalte) wird ersetzt oder neu gefasst |
 * | 6 | `image-replacement` | eine Abbildung (Muster, Grafik, Karte) wird ersetzt, oder ein eingefügtes Glied enthält eine |
 * | 7 | `missing-predecessor-text` | ein Befehl trägt den Alttext nicht (Neufassung eines Glieds, Aufhebung, Streichung ohne Anker) |
 * | 8 | `single-amendment` / `two-amendments` / `three-or-more-amendments` | sonst: nach der Zahl der Änderungen nach dem Stichtag |
 *
 * Die Gruppen 1–3 der Aufgabenstellung (eine, zwei, drei oder mehr Änderungen) sind also die Fälle, deren Befehle
 * grundsätzlich exakt umkehrbar sind; was sie noch aufhält (fehlende Verkündung, Mehrdeutigkeit, Formel), steht in
 * den Gründen.
 */
import type { FormulaId } from './formulas.ts';

export const GROUPS = [
  'single-amendment',
  'two-amendments',
  'three-or-more-amendments',
  'full-recast',
  'annex-replacement',
  'table-replacement',
  'image-replacement',
  'missing-predecessor-text',
  'baseline-only-predecessor',
  'contradictory-evidence',
] as const;
export type ReconstructionGroup = (typeof GROUPS)[number];

export const GROUP_LABELS: Readonly<Record<ReconstructionGroup, string>> = {
  'single-amendment': 'genau 1 Änderung nach dem Stichtag',
  'two-amendments': '2 Änderungen',
  'three-or-more-amendments': '3 oder mehr Änderungen',
  'full-recast': 'vollständige Neufassung',
  'annex-replacement': 'Anlagenersetzung',
  'table-replacement': 'Tabellenersetzung',
  'image-replacement': 'Bildersetzung',
  'missing-predecessor-text': 'fehlender Vorgängertext',
  'baseline-only-predecessor': 'baseline-only predecessor',
  'contradictory-evidence': 'contradictory evidence',
};

/** Befund der Befehle aller Änderungen einer Norm (Kette und Register), unabhängig vom Ausgang der Rückrechnung. */
export interface CommandSurvey {
  formulas: FormulaId[];
  /** Ein Befehl fasst die ganze Norm neu. */
  fullRecast: string[];
  annex: string[];
  table: string[];
  image: string[];
  /** Befehle ohne Alttext (Neufassung eines Glieds, Aufhebung, Streichung ohne Anker). */
  withoutOldText: string[];
}

export const emptySurvey = (): CommandSurvey => ({ formulas: [], fullRecast: [], annex: [], table: [], image: [], withoutOldText: [] });

export interface GroupReason {
  state: string;
  reason: string;
  detail: string;
}

export interface GroupInput {
  /** Maßgeblicher Zustand der Schlange (`recipe-ready`, `contradictory` …). */
  state: string;
  reason: string;
  /** Zahl der Änderungen nach dem Stichtag (Kette, sonst Register). */
  amendments: number;
  survey: CommandSurvey;
  /** Alle Befunde der Prüfungen (maßgeblicher zuerst). */
  failures: GroupReason[];
  /** Der heutige Text ist eine Stammfassung, die erst nach dem Stichtag in Kraft trat. */
  stammfassungAfterBaseline?: string;
}

const IMAGE_WORDS = /\b(?:Abbildung(?:en)?|Muster|Grafik(?:en)?|Karte(?:n)?|Lageplan|Bild(?:er)?|Wappen|Siegel|Skizze(?:n)?|Zeichnung(?:en)?|Piktogramm(?:e)?)\b/u;
const TABLE_WORDS = /\b(?:Tabelle(?:n)?|Zeile(?:n)?|Spalte(?:n)?|Tabellenzeile|Kopfzeile)\b/u;
/** Befehl, dessen Gegenstand die Anlage selbst ist („Anlage 2 wird wie folgt gefasst“, „Die Anlage erhält folgende Fassung“, „Die bisherige Anlage wird durch …“). */
const ANNEX_TARGET = /^(?:(?:Die|Der)\s+)?(?:bisherigen?\s+)?(?:Anlagen?|Anhang|Anhänge|Anlageteil)(?:\s+[\dIVX]+[a-z]?(?:\s*(?:,|und|bis)\s*[\dIVX]+[a-z]?)*)?(?:\s+(?:zu|zur|zum)\s+[^,]{1,40}?)?\s+(?:wird|werden|erhält|erhalten)\b/u;
const TABLE_TARGET = /^(?:(?:Die|Der)\s+)?(?:bisherigen?\s+)?(?:Tabelle|Tabellen)(?:\s+\d+[a-z]?)?\s+(?:wird|werden|erhält|erhalten)\b/u;

/** Ordnet einen einzelnen Befehl in die Befundklassen ein. */
export function surveyCommand(survey: CommandSurvey, command: string, formulas: readonly FormulaId[], topLevelRecast: boolean): void {
  survey.formulas.push(...formulas);
  const replacing = formulas.some((formula) => formula === 'recast' || formula === 'annex-recast' || formula === 'repeal-unit');
  if (topLevelRecast) survey.fullRecast.push(command);
  // Ersetzt wird die Anlage (der Anhang) selbst – nicht ein Glied in ihr („In Anlage 2 wird Nr. 3 wie folgt gefasst“).
  const target = command;
  if (formulas.includes('annex-recast') || (replacing && ANNEX_TARGET.test(target))) survey.annex.push(command);
  if (replacing && (TABLE_TARGET.test(target) || (TABLE_WORDS.test(command) && !ANNEX_TARGET.test(target)))) survey.table.push(command);
  if ((replacing || formulas.includes('insert-unit') || formulas.includes('unrecognized')) && IMAGE_WORDS.test(command)) survey.image.push(command);
  if (formulas.some((formula) => formula === 'recast' || formula === 'repeal-unit' || formula === 'delete-words')) survey.withoutOldText.push(command);
}

export function assignGroup(input: GroupInput): { group: ReconstructionGroup; reasons: GroupReason[] } {
  const reasons: GroupReason[] = [...input.failures];
  const add = (state: string, reason: string, detail: string): void => {
    if (!reasons.some((entry) => entry.reason === reason)) reasons.push({ state, reason, detail });
  };
  const survey = input.survey;
  if (survey.fullRecast.length > 0) add('non-invertible-amendment', 'full-recast', `Neufassung der ganzen Norm: „${survey.fullRecast[0]!.slice(0, 160)}“`);
  if (survey.annex.length > 0) add('asset-missing', 'annex-replacement', `Anlage ersetzt oder neu gefasst: „${survey.annex[0]!.slice(0, 160)}“`);
  if (survey.table.length > 0) add('non-invertible-amendment', 'table-replacement', `Tabelle ersetzt oder neu gefasst: „${survey.table[0]!.slice(0, 160)}“`);
  if (survey.image.length > 0) add('asset-missing', 'image-replacement', `Abbildung ersetzt oder eingefügt: „${survey.image[0]!.slice(0, 160)}“`);
  if (survey.withoutOldText.length > 0) add('non-invertible-amendment', 'missing-predecessor-text', `${survey.withoutOldText.length} Befehl(e) ohne Alttext, etwa „${survey.withoutOldText[0]!.slice(0, 160)}“`);
  if (input.stammfassungAfterBaseline) add('contradictory', 'stammfassung-in-force-after-baseline', input.stammfassungAfterBaseline);

  const byCount = (): ReconstructionGroup => (input.amendments >= 3 ? 'three-or-more-amendments' : input.amendments === 2 ? 'two-amendments' : 'single-amendment');
  if (input.state === 'recipe-ready') return { group: byCount(), reasons: [] };
  if (input.state === 'contradictory' || input.failures.some((failure) => failure.state === 'contradictory')) return { group: 'contradictory-evidence', reasons };
  if (input.stammfassungAfterBaseline) return { group: 'baseline-only-predecessor', reasons };
  if (survey.fullRecast.length > 0) return { group: 'full-recast', reasons };
  if (survey.annex.length > 0 || input.failures.some((failure) => failure.reason === 'annex-recast')) return { group: 'annex-replacement', reasons };
  if (survey.table.length > 0) return { group: 'table-replacement', reasons };
  if (survey.image.length > 0 || input.failures.some((failure) => /image/u.test(failure.reason))) return { group: 'image-replacement', reasons };
  if (survey.withoutOldText.length > 0 || input.failures.some((failure) => failure.state === 'non-invertible-amendment')) return { group: 'missing-predecessor-text', reasons };
  return { group: byCount(), reasons };
}
