/**
 * Rezeptformat der Rückrechnung (`data/imports/bayernrecht/reconstruction/<documentId>.json`).
 *
 * Ein Rezept ist **offline deterministisch wiederholbar**: Es nennt die Prüfsumme des heutigen Pakets und
 * den Fingerabdruck seines geparsten Körpers, die Fundstelle und Prüfsumme der Verkündung, das
 * Inkrafttreten, jeden Befehl wörtlich mit Formel, Ort und aufgelöstem Bereich, und die Fingerabdrücke
 * vor und nach der Rückrechnung. Wer das Rezept auf denselben Körper anwendet, erhält byteidentisch
 * denselben Stichtagskörper – oder einen Fehler.
 *
 * Vorlage war West (`packages/importers/recht-nrw/src/lrmb/reconstruction.ts`, nur gelesen); anders als
 * dort ist der Bereich jedes Schritts bereits aufgelöst (Indexpfad der Blöcke), und die Rückrechnung
 * wird **vorwärts** gegen den heutigen Text bewiesen (Rundlauf).
 */
import { createHash } from 'node:crypto';

import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { stableStringify } from '@landesrecht/importer-recht-nrw/common/persist.ts';

import type { FormulaId, Operation } from './formulas.ts';
import type { FieldRef } from './location.ts';

export const RECIPE_SCHEMA = 'bayernrecht-reverse-amendment/1' as const;

/**
 * Leerraumnormalisierung, die zwischen Verkündung und Portaltext gilt – und nur sie. Der Rundlauf selbst
 * vergleicht **ohne** jede Normalisierung (kanonisches JSON des Körpers, Byte für Byte).
 */
export const WHITESPACE_NORMALIZATION =
  'Verkündung: HTML-Entitäten aufgelöst; geschützte und schmale Leerzeichen → Leerzeichen; Leerraumfolgen → ein Leerzeichen; weiche Trennzeichen entfernt; <sup>n</sup> → Unicode-Hochstellung; Fußnotenzeichen der Verkündung entfernt. Ein Zitat, das mit Leerzeichen und Satzzeichen beginnt („ , Forsten“), schließt ohne Leerzeichen an das vorangehende Wort an. Rundlauf: exakt, ohne Normalisierung.';

export interface ScopeRecord {
  /** Textfelder des Bereichs, adressiert über den Indexpfad der Blöcke im geparsten Körper. */
  fields: FieldRef[];
  /** Eingrenzung auf einen Satz über die Satznummern (¹, ², …) des einzigen Feldes. */
  sentence?: number;
  /** Strukturell belegte Stufen der Ortsangabe. */
  resolved: string[];
  /** Stufen, die der Körper nicht auszeichnet; der Bereich ist dort Obermenge des zitierten Orts. */
  widened: string[];
}

export interface RecipeStep {
  id: string;
  /** Befehl wörtlich, wie er in der Verkündung steht (Listenglied oder Ein-Satz-Befehl). */
  command: string;
  /** Gliederungszeichen der Befehlskette (`1.`, `a)`, `aa)`), von außen nach innen. */
  commandPath: string[];
  formula: FormulaId;
  /** Zitierter Ort einschließlich der übergeordneten Befehle („Art. 53 Abs. 2 Satz 3“). */
  location: string;
  scope: ScopeRecord;
  /** Die Operation in Vorwärtsrichtung (Stichtagstext → heutiger Text). */
  operation: Operation;
  /** Vorher-/Nachher-Beleg: Ausschnitt um die Stelle im Stichtags- und im heutigen Text. */
  evidence: { baseline: string; current: string };
}

export interface ReconstructionRecipe {
  schemaVersion: typeof RECIPE_SCHEMA;
  documentId: string;
  baselineDate: string;
  method: 'reverse-amendment';
  /** Das heutige Exportpaket, auf das sich das Rezept bezieht. */
  source: {
    url: string;
    sha256: string;
    retrievedAt?: string;
    parserVersion: string;
    /** Beginn der Geltung des heutigen Textes laut Paket (`inkraft`). */
    inForceFrom: string;
    fullCitation?: string;
  };
  amendment: {
    eventId: string;
    citation: string;
    organ: string;
    publicationAuthority: string;
    digitalRepresentation: string;
    url: string;
    sha256: string;
    retrievedAt?: string;
    gazettePdfUrl?: string;
    gazettePdfSha256Published?: string;
    /** Verkündungsdatum. */
    eventDate: string;
    enactmentDate?: string;
    /** Inkrafttreten der Änderung für diese Norm. */
    effectiveDate: string;
    /** Wortlaut der Inkrafttretensvorschrift, aus dem das Datum folgt. */
    effectiveDateEvidence: string[];
    section?: string;
    /** Einleitungssatz des Änderungsabschnitts, wörtlich. */
    intro: string;
    /** Die im Einleitungssatz genannte vorangehende Änderung („zuletzt durch … geändert“). */
    priorAmendment?: string;
  };
  /**
   * Belegter Beginn der Stichtagsfassung (≤ Stichtag): Inkrafttreten der Fassung, die das Rezept
   * herstellt. Ohne diesen Beleg gibt es kein Rezept – verkündet ist nicht in Kraft, und Ausfertigung ist
   * nicht Textgeltung.
   */
  baselineTextInForce: {
    date: string;
    evidence: string[];
    /** Verkündungen, die den Beginn belegen (vorangehende Änderung); werden mit dem Paket archiviert. */
    sources?: Array<{ url: string; sha256: string; citation: string; retrievedAt?: string }>;
  };
  /** Belege dafür, dass diese Änderung der einzige Schritt zwischen Stichtag und heute ist. */
  chain: string[];
  steps: RecipeStep[];
  whitespace: string;
  expected: {
    /** Fingerabdruck des heutigen geparsten Körpers (kanonisches JSON, SHA-256). */
    currentFingerprint: string;
    /** Fingerabdruck des rückgerechneten Stichtagskörpers. */
    baselineFingerprint: string;
  };
}

/** Kanonischer Fingerabdruck eines Körpers. */
export function bodyFingerprint(blocks: readonly NormBodyBlock[]): string {
  return createHash('sha256').update(stableStringify(blocks)).digest('hex');
}

export { stableStringify };

/**
 * Formale Prüfung eines Rezepts vor jeder Anwendung. Liefert die Liste der Verstöße (leer = gültig):
 * Schema, Methode, Inkrafttreten der Änderung = `inkraft` des heutigen Pakets, beides nach dem Stichtag,
 * belegter Beginn der Stichtagsfassung am oder vor dem Stichtag, mindestens ein Schritt.
 */
export function recipeProblems(recipe: ReconstructionRecipe): string[] {
  const problems: string[] = [];
  const iso = /^\d{4}-\d{2}-\d{2}$/u;
  if (recipe.schemaVersion !== RECIPE_SCHEMA) problems.push(`unbekannte Schemaversion ${String(recipe.schemaVersion)}`);
  if (recipe.method !== 'reverse-amendment') problems.push(`Methode ${String(recipe.method)} statt reverse-amendment`);
  if (!iso.test(recipe.amendment?.effectiveDate ?? '')) problems.push('Inkrafttreten der Änderung fehlt');
  else if (recipe.amendment.effectiveDate !== recipe.source?.inForceFrom) problems.push(`Inkrafttreten der Änderung (${recipe.amendment.effectiveDate}) ≠ inkraft des heutigen Pakets (${recipe.source?.inForceFrom ?? '–'})`);
  else if (recipe.amendment.effectiveDate <= recipe.baselineDate) problems.push(`Änderung tritt am ${recipe.amendment.effectiveDate} in Kraft – nicht nach dem Stichtag`);
  const start = recipe.baselineTextInForce;
  if (!start || !iso.test(start.date ?? '') || !Array.isArray(start.evidence) || start.evidence.length === 0) problems.push('Beginn der Stichtagsfassung nicht belegt (baselineTextInForce)');
  else if (start.date > recipe.baselineDate) problems.push(`Beginn der Stichtagsfassung ${start.date} liegt nach dem Stichtag`);
  if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) problems.push('keine Schritte');
  return problems;
}
