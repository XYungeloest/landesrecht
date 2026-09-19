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
import type { RecipeTitle } from './title.ts';

export type { RecipeTitle } from './title.ts';

export const RECIPE_SCHEMA = 'bayernrecht-reverse-amendment/1' as const;
/** Mehrstufige Rückrechnung: `amendments` (jüngste zuerst), je Änderung eigene Schritte. */
export const RECIPE_SCHEMA_V2 = 'bayernrecht-reverse-amendment/2' as const;

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
  /** Lauf 9: innerhalb des Satzes der Halbsatz (Teil zwischen Semikola), wenn der Satz Semikola trägt. */
  halfSentence?: number;
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
  /**
   * `title`: Der Schritt ändert die **Überschrift der Norm** (Titelzeile samt Abkürzungszeile, `title.ts`), nicht den
   * Körper; `scope` adressiert dann das einzige Feld des synthetischen Titelkörpers (`TITLE_FIELD`).
   */
  target?: 'title';
  /** Offensichtlicher Satzfehler der Quelle, den der Schritt toleriert – mit Beleg (nur, wo das Ergebnis eindeutig ist). */
  sourceDefect?: string;
  /**
   * Alttext aus den Verkündungen (Lauf 7): Fundstelle der Stammverkündung, deren Stand am Stichtag den Wortlaut
   * vor dem Befehl trägt (`restoration` im Rezept). Nur an Operationen `replace-text`/`replace-blocks`.
   */
  restoredFrom?: string;
}

/**
 * Alttext aus den Verkündungen (Lauf 7, `forward-from-publication`): Nicht umkehrbare Befehle (Neufassung, Aufhebung,
 * Streichung ohne Anker) sind mit dem Wortlaut zurückgenommen, den die Stammverkündung am Stichtag trägt. Gebaut wird
 * dieser Stand **vorwärts** aus den genannten Verkündungen; der ganze zurückgerechnete Stichtagskörper stimmt mit ihm
 * im Wortlaut überein (`agreement`).
 */
export interface RecipeRestoration {
  method: 'forward-from-publication';
  /** Verkündungen des Stands am Stichtag: Stammverkündung, dann Änderungen vor dem Stichtag (vorwärts angewandt). */
  sources: Array<{
    role: 'base-publication' | 'prior-amendment';
    citation: string;
    url: string;
    sha256: string;
    retrievedAt?: string;
    publishedAt?: string;
    authority: string;
    representation: string;
    effectiveDate?: string;
    /** Änderungen vor dem Stichtag: Abschnitt und Einleitungssatz (Einheit der Seite) des Befehlsblocks für die Norm. */
    section?: string;
    introIndex?: number;
  }>;
  /** Umsetzer der Verkündungsseite (`baseline-only/html.ts`). */
  converter: string;
  /** SHA-256 des normalisierten Seitentexts der Stammverkündung. */
  pageTextSha256: string;
  /** Fingerabdruck der Stammverkündung im Blockmodell der Verkündung. */
  publicationFingerprint: string;
  /**
   * Nur mit Änderungen vor dem Stichtag: Fingerabdruck der Stammfassung in Portalgestalt, erreicht durch Rücknahme aller
   * Änderungen vor dem Stichtag (`prior-amendment`, jüngste zuerst) vom Stichtagskörper aus; Zahl ihrer Schritte.
   */
  stammfassungFingerprint?: string;
  priorSteps?: number;
  /** Wortlautvergleich: zurückgerechneter Stichtagskörper ↔ Stand der Verkündungen. */
  agreement: { normalization: string; characters: number; detail: string };
  /** Zahl der Schritte mit wiederhergestelltem Alttext (`restoredFrom`). */
  restoredSteps: number;
  /**
   * Lauf 8: Befunde der Kette über Veröffentlichungen **nach** dem Stichtag außerhalb der Kette (Registerereignis, andere
   * Verkündung mit Änderungsbefehl, Änderungsverlauf, Fortführungsnachweis), die nur die Wortlautprobe ausräumt: Der
   * Stichtagskörper gleicht der Stammverkündung, also hat keine dieser Veröffentlichungen den Wortlaut geändert. Dann kann
   * `restoredSteps` 0 sein – die Stammverkündung ist hier Beleg, nicht Quelle von Text.
   */
  chainChecks?: Array<{ reason: string; detail: string }>;
  /**
   * Lauf 9: Wie der Stand am Stichtag belegt ist. `forward`: Stammverkündung, darauf die Änderungen vor dem Stichtag
   * (`prior-amendment`, ältest zuerst) **vorwärts** angewandt (`forward.ts`); dieser Stand ist Quelle des Alttexts und
   * Maßstab der Wortlautprobe, sein Fingerabdruck `forwardFingerprint`, die Zahl der angewandten Befehle `priorSteps`.
   * Fehlt das Feld: Lauf 7 – Rücknahme der Änderungen vor dem Stichtag bis zur Stammfassung (`stammfassungFingerprint`).
   */
  derivation?: 'forward';
  forwardFingerprint?: string;
}

/** Überschrift der Norm heute und am Stichtag – nur in Rezepten mit Titelschritten. */
export interface RecipeTitleChange {
  current: RecipeTitle;
  baseline: RecipeTitle;
}

/** Eine zurückgenommene Änderung (v1: `amendment`; v2: Eintrag in `amendments`, dort mit eigenen `steps`). */
export interface RecipeAmendment {
  /** Ereignis des Registers; bei einer vor dem Stichtag verkündeten Änderung `publication:<organ>-<jahr>-<stelle>`. */
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
  /** Inkrafttreten der Änderung für diese Norm (spätestes, wenn Teile verschieden in Kraft treten). */
  effectiveDate: string;
  /** Alle Inkrafttretensdaten der Änderung für diese Norm (v2). */
  effectiveDates?: string[];
  /** Wortlaut der Inkrafttretensvorschrift, aus dem das Datum folgt. */
  effectiveDateEvidence: string[];
  section?: string;
  /** Einleitungssatz des Änderungsabschnitts, wörtlich. */
  intro: string;
  /** Die im Einleitungssatz genannte vorangehende Änderung („zuletzt durch … geändert“). */
  priorAmendment?: string;
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
  amendment: RecipeAmendment;
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
  /** Nur wenn ein Schritt die Überschrift der Norm ändert: `applyReverseRecipeToLaw` statt `applyReverseRecipe`. */
  title?: RecipeTitleChange;
  /** Nur wenn Schritte ihren Alttext aus den Verkündungen haben (`restoredFrom`). */
  restoration?: RecipeRestoration;
  whitespace: string;
  expected: {
    /** Fingerabdruck des heutigen geparsten Körpers (kanonisches JSON, SHA-256). */
    currentFingerprint: string;
    /** Fingerabdruck des rückgerechneten Stichtagskörpers. */
    baselineFingerprint: string;
  };
}

/** Eine zurückgenommene Änderung im v2-Rezept: Felder wie im v1-`amendment`, dazu ihre eigenen Schritte. */
export interface RecipeAmendmentV2 extends RecipeAmendment {
  steps: RecipeStep[];
  /** Fingerabdrücke des Körpers vor und nach dieser Änderung (vorwärts gelesen). */
  expected: { beforeFingerprint: string; afterFingerprint: string };
}

/** Verkündung, die eine Entscheidung trägt (für Archiv und Bulk): zurückgenommene Änderung oder Beleg des Beginns. */
export interface RecipeSource {
  role: 'reversed-amendment' | 'baseline-start';
  citation: string;
  url: string;
  sha256: string;
  retrievedAt?: string;
}

/**
 * Mehrstufiges Rezept: `current → Änderung N → … → Fassung am Stichtag`. `amendments` stehen **jüngste zuerst**;
 * rückwärts werden sie in dieser Reihenfolge angewandt (je Änderung ihre Schritte in umgekehrter Reihenfolge),
 * vorwärts in umgekehrter (älteste zuerst, je Änderung in Befehlsreihenfolge).
 */
export interface ReconstructionRecipeV2 {
  schemaVersion: typeof RECIPE_SCHEMA_V2;
  documentId: string;
  baselineDate: string;
  method: 'reverse-amendment';
  source: ReconstructionRecipe['source'];
  amendments: RecipeAmendmentV2[];
  baselineTextInForce: ReconstructionRecipe['baselineTextInForce'];
  /** Belege für die Vollständigkeit der Kette. */
  chain: string[];
  /** Alle Verkündungen des Rezepts mit Adresse und Prüfsumme. */
  sources: RecipeSource[];
  /** Nur wenn ein Schritt die Überschrift der Norm ändert: `applyReverseRecipeToLaw` statt `applyReverseRecipe`. */
  title?: RecipeTitleChange;
  /** Nur wenn Schritte ihren Alttext aus den Verkündungen haben (`restoredFrom`). */
  restoration?: RecipeRestoration;
  whitespace: string;
  expected: {
    currentFingerprint: string;
    baselineFingerprint: string;
  };
}

export type AnyReconstructionRecipe = ReconstructionRecipe | ReconstructionRecipeV2;

export const isRecipeV2 = (recipe: AnyReconstructionRecipe): recipe is ReconstructionRecipeV2 => recipe.schemaVersion === RECIPE_SCHEMA_V2;

/**
 * Die zurückgenommenen Änderungen eines Rezepts, **jüngste zuerst**, je mit ihren Schritten – für v1 und v2
 * gleich. `[0]` ist die jüngste (ihr Inkrafttreten = `inkraft` des heutigen Pakets), `.at(-1)` die älteste.
 */
export function recipeAmendments(recipe: AnyReconstructionRecipe): Array<RecipeAmendment & { steps: RecipeStep[] }> {
  if (isRecipeV2(recipe)) return recipe.amendments;
  return [{ ...recipe.amendment, steps: recipe.steps }];
}

/** Alle Verkündungen eines Rezepts (zurückgenommene Änderungen und Belege des Beginns) mit Adresse und SHA-256. */
export function recipeSources(recipe: AnyReconstructionRecipe): RecipeSource[] {
  if (isRecipeV2(recipe)) return recipe.sources;
  return [
    { role: 'reversed-amendment', citation: recipe.amendment.citation, url: recipe.amendment.url, sha256: recipe.amendment.sha256, ...(recipe.amendment.retrievedAt ? { retrievedAt: recipe.amendment.retrievedAt } : {}) },
    ...(recipe.baselineTextInForce.sources ?? []).map((source) => ({ role: 'baseline-start' as const, citation: source.citation, url: source.url, sha256: source.sha256, ...(source.retrievedAt ? { retrievedAt: source.retrievedAt } : {}) })),
  ];
}

/** Trägt das Rezept Schritte mit Alttext aus den Verkündungen? */
export const recipeRestores = (recipe: AnyReconstructionRecipe): boolean => recipe.restoration !== undefined || recipeAmendments(recipe).some((amendment) => amendment.steps.some((step) => step.restoredFrom !== undefined));

/** Ändert das Rezept die Überschrift der Norm? */
export const recipeChangesTitle = (recipe: AnyReconstructionRecipe): boolean => recipe.title !== undefined || recipeAmendments(recipe).some((amendment) => amendment.steps.some((step) => step.target === 'title'));

/** Alle Schritte in Vorwärtsreihenfolge (älteste Änderung zuerst). */
export function forwardOrder(recipe: AnyReconstructionRecipe): RecipeStep[] {
  return [...recipeAmendments(recipe)].reverse().flatMap((amendment) => amendment.steps);
}

/** Kanonischer Fingerabdruck eines Körpers. */
export function bodyFingerprint(blocks: readonly NormBodyBlock[]): string {
  return createHash('sha256').update(stableStringify(blocks)).digest('hex');
}

export { stableStringify };

/**
 * Formale Prüfung eines Rezepts (v1 und v2) vor jeder Anwendung. Liefert die Liste der Verstöße (leer = gültig):
 * Schema, Methode, jede Änderung mit belegtem Inkrafttreten nach dem Stichtag, das jüngste = `inkraft` des heutigen
 * Pakets, die Inkrafttreten in Kettenreihenfolge, belegter Beginn der Stichtagsfassung am oder vor dem Stichtag,
 * je Änderung mindestens ein Schritt.
 */
export function recipeProblems(recipe: AnyReconstructionRecipe): string[] {
  const problems: string[] = [];
  const iso = /^\d{4}-\d{2}-\d{2}$/u;
  const schema = (recipe as { schemaVersion?: unknown }).schemaVersion;
  if (schema !== RECIPE_SCHEMA && schema !== RECIPE_SCHEMA_V2) {
    problems.push(`unbekannte Schemaversion ${String(schema)}`);
    return problems;
  }
  if (recipe.method !== 'reverse-amendment') problems.push(`Methode ${String(recipe.method)} statt reverse-amendment`);
  const amendments = isRecipeV2(recipe)
    ? (Array.isArray(recipe.amendments) ? recipe.amendments : [])
    : recipe.amendment
      ? [{ ...recipe.amendment, steps: recipe.steps }]
      : [];
  if (amendments.length === 0) problems.push('keine zurückgenommene Änderung');
  if (isRecipeV2(recipe) && amendments.length < 2) problems.push('v2-Rezept mit weniger als zwei Änderungen (einstufig ist v1)');
  amendments.forEach((amendment, index) => {
    const label = amendments.length > 1 ? `Änderung ${index + 1} (${amendment?.citation ?? '?'})` : 'Änderung';
    if (!iso.test(amendment?.effectiveDate ?? '')) problems.push(`Inkrafttreten der ${label} fehlt`);
    else if (amendment.effectiveDate <= recipe.baselineDate) problems.push(`${label} tritt am ${amendment.effectiveDate} in Kraft – nicht nach dem Stichtag`);
    else if ((amendment.effectiveDates ?? []).some((date) => !iso.test(date) || date <= recipe.baselineDate || date > amendment.effectiveDate)) problems.push(`Inkrafttretensdaten der ${label} widersprüchlich (${(amendment.effectiveDates ?? []).join(', ')})`);
    if (!Array.isArray(amendment?.effectiveDateEvidence) || amendment.effectiveDateEvidence.length === 0) problems.push(`Inkrafttreten der ${label} ohne Wortlaut der Inkrafttretensvorschrift`);
    if (!amendment?.url || !/^[0-9a-f]{64}$/u.test(amendment.sha256 ?? '')) problems.push(`${label} ohne Verkündungsadresse oder SHA-256`);
    if (!Array.isArray(amendment?.steps) || amendment.steps.length === 0) problems.push(`keine Schritte (${label})`);
  });
  const newest = amendments[0];
  if (newest && iso.test(newest.effectiveDate ?? '') && newest.effectiveDate !== recipe.source?.inForceFrom) {
    problems.push(`Inkrafttreten der ${amendments.length > 1 ? 'jüngsten ' : ''}Änderung (${newest.effectiveDate}) ≠ inkraft des heutigen Pakets (${recipe.source?.inForceFrom ?? '–'})`);
  }
  for (let index = 1; index < amendments.length; index += 1) {
    const newer = amendments[index - 1]!;
    const older = amendments[index]!;
    const newerEarliest = [...(newer.effectiveDates ?? [newer.effectiveDate])].sort()[0]!;
    if (older.effectiveDate > newerEarliest) problems.push(`Inkrafttreten nicht in Kettenreihenfolge: ${older.citation} (${older.effectiveDate}) nach ${newer.citation} (${newerEarliest})`);
  }
  const start = recipe.baselineTextInForce;
  if (!start || !iso.test(start.date ?? '') || !Array.isArray(start.evidence) || start.evidence.length === 0) problems.push('Beginn der Stichtagsfassung nicht belegt (baselineTextInForce)');
  else if (start.date > recipe.baselineDate) problems.push(`Beginn der Stichtagsfassung ${start.date} liegt nach dem Stichtag`);
  if (!isRecipeV2(recipe) && (!Array.isArray(recipe.steps) || recipe.steps.length === 0) && !problems.some((problem) => problem.startsWith('keine Schritte'))) problems.push('keine Schritte');
  const titleSteps = amendments.some((amendment) => Array.isArray(amendment?.steps) && amendment.steps.some((step) => step.target === 'title'));
  if (titleSteps && !recipe.title) problems.push('Titelschritte ohne Überschrift heute/am Stichtag (title)');
  if (!titleSteps && recipe.title) problems.push('Überschrift (title) ohne Titelschritt');
  if (recipe.title && (typeof recipe.title.current?.title !== 'string' || typeof recipe.title.baseline?.title !== 'string')) problems.push('Überschrift heute oder am Stichtag ohne Titel');
  const restoredSteps = amendments.flatMap((amendment) => (Array.isArray(amendment?.steps) ? amendment.steps : [])).filter((step) => step.restoredFrom !== undefined);
  const restoration = recipe.restoration;
  if (restoredSteps.length > 0 && !restoration) problems.push('Schritte mit Alttext aus den Verkündungen ohne Beleg (restoration)');
  if (restoration) {
    if (restoredSteps.length === 0 && !(Array.isArray(restoration.chainChecks) && restoration.chainChecks.length > 0)) problems.push('Beleg der Wiederherstellung (restoration) ohne wiederhergestellten Schritt und ohne Befund der Kette (chainChecks)');
    if (restoration.method !== 'forward-from-publication') problems.push(`Wiederherstellung mit unbekannter Methode ${String(restoration.method)}`);
    const sources = Array.isArray(restoration.sources) ? restoration.sources : [];
    if (!sources.some((source) => source.role === 'base-publication')) problems.push('Wiederherstellung ohne Stammverkündung');
    if (sources.some((source) => !source.url || !/^[0-9a-f]{64}$/u.test(source.sha256 ?? ''))) problems.push('Quelle der Wiederherstellung ohne Adresse oder SHA-256');
    if (restoredSteps.some((step) => !sources.some((source) => source.citation === step.restoredFrom))) problems.push('Schritt nennt eine Quelle, die die Wiederherstellung nicht führt');
    if (restoredSteps.some((step) => step.operation.kind !== 'replace-text' && step.operation.kind !== 'replace-blocks')) problems.push('wiederhergestellter Schritt ohne Operation replace-text/replace-blocks');
    if (restoration.restoredSteps !== restoredSteps.length) problems.push(`Zahl der wiederhergestellten Schritte ${restoration.restoredSteps} ≠ ${restoredSteps.length}`);
    if (!/^[0-9a-f]{64}$/u.test(restoration.publicationFingerprint ?? '') || !restoration.agreement?.detail) problems.push('Wiederherstellung ohne Fingerabdruck oder Wortlautvergleich');
  }
  return problems;
}
