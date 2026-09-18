/**
 * Auswahl des Bulk-Laufs: **wer** importiert wird – und warum alle anderen nicht.
 *
 * Drei Bedingungen müssen zusammenkommen, und jede hat ihre eigene, bereits getroffene Quelle:
 *
 *   1. Scope  `data/imports/bayernrecht/scope.json` – nur `include` ist Kandidat.
 *   2. Stichtag  `data/imports/bayernrecht/baseline.json` – nur `active-at-baseline` ohne Blocker,
 *      und nur auf zwei Wegen: `current-unchanged` (der heutige Text **ist** der Stichtagstext) oder
 *      `reverse-amendment` **mit** einem Rezept unter `data/imports/bayernrecht/reconstruction/`
 *      (der Stichtagstext entsteht durch Zurücknehmen der einzigen späteren Änderung; ob das Rezept
 *      auf das Paket passt und den Rundlauf besteht, entscheidet `norm.ts` am geparsten Körper).
 *      Alles andere wartet auf die Rekonstruktion.
 *   3. Text vollständig – das entscheidet sich erst am Paket (Parser, Überleitung, Schemaprüfung)
 *      und steht deshalb nicht hier, sondern in `norm.ts`.
 *
 * Dieses Modul entscheidet nichts neu. Es führt die vorhandenen Entscheidungen zusammen und macht
 * aus jeder Ablehnung einen benannten Grund – im Zweifel gegen die Übernahme.
 *
 * **Der Sonderfall ohne Stichtagsentscheidung.** `baseline.json` klassifiziert nur Kandidaten, deren
 * Exportpaket zur Zeit des Laufs im Cache lag; der Cache wächst mit der Beschaffung weiter. Ein
 * Kandidat ohne Entscheidung ist deshalb kein Review-Fall (an ihm ist nichts strittig), sondern eine
 * offene Arbeit des vorgelagerten Schritts: Er wird als `skipped-unclassified` gezählt und der Lauf
 * sagt in einem Satz, dass `baseline --write` erneut zu laufen hat. Ein Review-Fall wäre hier
 * Papierlärm – 1 000 Fälle mit derselben, nicht in diesem Lauf lösbaren Ursache.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { CorruptStateError, readJsonFile } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { BASELINE_DATE, type SourceArea } from '../common/constants.ts';
import { RECIPE_SCHEMA, type ReconstructionRecipe } from '../reconstruction/recipe.ts';
import type { ReviewItemInput } from '../common/review.ts';
import { compareSourceIdentity } from '../common/paths.ts';
import type { BaselineDecision } from '../baseline/classify.ts';
import { BASELINE_PATH, type BaselineFile } from '../baseline/run.ts';
import { SCOPE_PATH, type ScopeFile } from '../scope/run.ts';
import { readEnumeration, type EnumerationItem } from '../enumerate/enumeration.ts';
import type { BulkResult } from './state.ts';

/** Bereiche mit Enumeration; `events` erzeugt keine Normen und wird nie importiert. */
export const SELECTABLE_AREAS: readonly SourceArea[] = ['landesrecht', 'vwv'];

/** Scope-Entscheidungen, die der Lauf überhaupt anfasst. `exclude` wird nur gezählt. */
export const HANDLED_SCOPE_DECISIONS = ['include', 'review'] as const;

export interface BulkCandidate {
  documentId: string;
  sourceArea: SourceArea;
  title: string;
  normType: string;
  /** Adresse des Exportpakets – der Bulk liest genau diese aus dem Cache. */
  zipUrl: string;
  /** Dokumentseite im Portal (der Mensch schaut dort nach, nicht im ZIP). */
  sourceUrl: string;
  bayRsNumber?: string;
  scopeDecision: 'include' | 'review';
  scopeReason: string;
  scopeEvidence: string[];
  /** Stichtagsentscheidung; fehlt sie, ist der Kandidat noch nicht klassifiziert. */
  baseline?: BaselineDecision;
  /** Jüngste datierte Änderung laut Fortführungsnachweis (Beleg, kein Grund). */
  latestChange?: string;
  changedAfterBaseline?: boolean;
  /** Rückrechnungsrezept (`reverse-amendment`); nur mit ihm ist dieser Weg überhaupt gangbar. */
  recipe?: ReconstructionRecipe;
}

/** Rezepte der Rückrechnung, ein JSON je Dokument (`<documentId>.json`). */
export const RECONSTRUCTION_DIR = 'data/imports/bayernrecht/reconstruction';

/**
 * Liest alle Rückrechnungsrezepte. Andere JSON-Dateien im Verzeichnis (Berichte, Warteschlangen) werden
 * übergangen; ein Rezept, dessen Kennung nicht zum Dateinamen passt, ist ein Widerspruch im Zustand.
 */
export async function readReconstructionRecipes(root: string): Promise<Map<string, ReconstructionRecipe>> {
  let names: string[];
  try {
    names = await readdir(join(root, RECONSTRUCTION_DIR));
  } catch {
    return new Map();
  }
  const recipes = new Map<string, ReconstructionRecipe>();
  for (const name of names.filter((entry) => entry.endsWith('.json')).sort()) {
    const path = `${RECONSTRUCTION_DIR}/${name}`;
    const recipe = await readJsonFile<ReconstructionRecipe>(join(root, path));
    if (!recipe || recipe.schemaVersion !== RECIPE_SCHEMA) continue;
    if (`${recipe.documentId}.json` !== name) throw new CorruptStateError(path, `Rezept für ${recipe.documentId} liegt unter fremdem Namen`);
    if (recipe.method !== 'reverse-amendment') throw new CorruptStateError(path, `unbekannte Methode ${String(recipe.method)}`);
    recipes.set(recipe.documentId, recipe);
  }
  return recipes;
}

export interface Selection {
  /** Dokumente, die dieser Lauf anfasst, in stabiler Reihenfolge (Bereich, dann Kennung). */
  queue: BulkCandidate[];
  totals: {
    /* Bestandszahlen: sie beschreiben den Scope, nicht diesen Lauf – auch bei --area und --only. */
    scopeDocuments: number;
    include: number;
    exclude: number;
    scopeReview: number;
    /* Laufzahlen: sie beziehen sich auf die Warteschlange, also auf die gefilterte Auswahl. */
    withBaselineDecision: number;
    eligible: number;
  };
  /** Widersprüche zwischen den Zustandsdateien – systemisch, der Lauf startet nicht. */
  problems: string[];
}

export interface LoadSelectionOptions {
  area?: SourceArea;
  /** Nur diese Dokument-IDs (CLI `--only`). */
  only?: readonly string[];
}

async function readScopeFile(root: string): Promise<ScopeFile> {
  const file = await readJsonFile<ScopeFile>(join(root, SCOPE_PATH));
  if (!file) throw new Error(`${SCOPE_PATH} fehlt – zuerst „scope --write“ ausführen`);
  if (!Array.isArray(file.entries)) throw new CorruptStateError(SCOPE_PATH, 'entries fehlt');
  return file;
}

async function readBaselineFile(root: string): Promise<BaselineFile> {
  const file = await readJsonFile<BaselineFile>(join(root, BASELINE_PATH));
  if (!file) throw new Error(`${BASELINE_PATH} fehlt – zuerst „baseline --write“ ausführen`);
  if (!Array.isArray(file.decisions)) throw new CorruptStateError(BASELINE_PATH, 'decisions fehlt');
  return file;
}

/**
 * Liest Scope, Stichtagsklassifikation und Enumeration und führt sie zu einer Warteschlange zusammen.
 * Ein Scope-Eintrag ohne Enumerationseintrag ist ein Widerspruch der Zustandsdateien und kein
 * Einzelfall, den der Lauf überginge – er erscheint in `problems` und hält den Lauf an.
 */
export async function loadSelection(root: string, options: LoadSelectionOptions = {}): Promise<Selection> {
  const scope = await readScopeFile(root);
  const baseline = await readBaselineFile(root);
  const decisions = new Map(baseline.decisions.map((decision) => [decision.documentId, decision]));
  const recipes = await readReconstructionRecipes(root);

  const items = new Map<string, { area: SourceArea; item: EnumerationItem }>();
  for (const area of SELECTABLE_AREAS) {
    const file = await readEnumeration(root, area);
    if (!file) throw new Error(`Enumeration ${area} fehlt – zuerst „enumerate --area ${area} --write“ ausführen`);
    for (const item of file.items) items.set(item.documentId, { area, item });
  }

  const only = options.only && options.only.length > 0 ? new Set(options.only) : undefined;
  const problems: string[] = [];
  const queue: BulkCandidate[] = [];
  const totals = { scopeDocuments: scope.entries.length, include: 0, exclude: 0, scopeReview: 0, withBaselineDecision: 0, eligible: 0 };

  for (const entry of scope.entries) {
    if (entry.decision === 'include') totals.include += 1;
    else if (entry.decision === 'review') totals.scopeReview += 1;
    else {
      totals.exclude += 1;
      continue;
    }
    const found = items.get(entry.documentId);
    if (!found) {
      problems.push(`${entry.documentId}: Scope-Eintrag ohne Enumerationseintrag – Scope und Enumeration stammen aus verschiedenen Ständen`);
      continue;
    }
    if (options.area && found.area !== options.area) continue;
    if (only && !only.has(entry.documentId)) continue;
    const decision = decisions.get(entry.documentId);
    if (decision) totals.withBaselineDecision += 1;
    const candidate: BulkCandidate = {
      documentId: entry.documentId,
      sourceArea: found.area,
      title: found.item.title,
      normType: found.item.normType,
      zipUrl: found.item.zipUrl,
      sourceUrl: found.item.sourceUrl,
      scopeDecision: entry.decision,
      scopeReason: entry.reason,
      scopeEvidence: [...(entry.evidence ?? [])],
      ...(found.item.bayRsNumber ? { bayRsNumber: found.item.bayRsNumber } : {}),
      ...(decision ? { baseline: decision } : {}),
      ...(found.item.latestChange ? { latestChange: found.item.latestChange } : {}),
      ...(found.item.changedAfterBaseline === undefined ? {} : { changedAfterBaseline: found.item.changedAfterBaseline }),
      ...(recipes.has(entry.documentId) ? { recipe: recipes.get(entry.documentId)! } : {}),
    };
    if (baselineGate(candidate).admit) totals.eligible += 1;
    queue.push(candidate);
  }

  queue.sort((left, right) => SELECTABLE_AREAS.indexOf(left.sourceArea) - SELECTABLE_AREAS.indexOf(right.sourceArea) || compareSourceIdentity(left.documentId, right.documentId));
  return { queue, totals, problems };
}

/** Ablehnung der Auswahl: Ergebnis, Grund und – wo es einen gibt – der Review-Fall dazu. */
export interface GateRejection {
  admit: false;
  result: BulkResult;
  code: string;
  message: string;
  /** Review-Fall, unter dem der Vorgang weiterverfolgt wird (fehlt, wo nichts zu entscheiden ist). */
  review?: ReviewItemInput;
  /** Importstatus des Manifesteintrags; fehlt, wo kein Eintrag entsteht. */
  importStatus?: 'needs-review' | 'not-at-baseline';
}

/** Zulassung; bei `reverse-amendment` mit dem Rezept, das `norm.ts` am geparsten Körper beweisen muss. */
export type GateVerdict = { admit: true; reconstruction?: ReconstructionRecipe } | GateRejection;

const reviewItem = (category: ReviewItemInput['category'], key: string, summary: string, details: string[]): ReviewItemInput => ({
  category,
  key,
  severity: 'blocking',
  summary,
  details,
});

/**
 * Entscheidet allein aus Scope und Stichtagsklassifikation – ohne das Paket zu lesen.
 *
 * Die Reihenfolge ist bindend: Erst der Umfang (gehört die Vorschrift überhaupt in den Bestand?),
 * dann die Geltung am Stichtag, dann die Beschaffbarkeit des Stichtagstextes. Ein Kandidat wird nur
 * zugelassen, wenn alle drei positiv beantwortet sind; jede andere Lage hat einen benannten Ausgang.
 */
export function baselineGate(candidate: BulkCandidate): GateVerdict {
  if (candidate.scopeDecision === 'review') {
    return {
      admit: false,
      result: 'review',
      code: 'scope-review',
      message: `Der Vorschriftencharakter ist nicht entschieden (${candidate.scopeReason}); ohne Entscheidung wird nichts übernommen`,
      importStatus: 'needs-review',
      review: reviewItem('normativity', 'scope-review', 'Scope-Entscheidung offen: Vorschriftencharakter nicht eindeutig', [
        `Scope-Grund: ${candidate.scopeReason}`,
        ...candidate.scopeEvidence.map((entry) => `Beleg: ${entry}`),
        'Der Bulk übernimmt nur Dokumente mit der Scope-Entscheidung include.',
      ]),
    };
  }

  const decision = candidate.baseline;
  if (!decision) {
    return {
      admit: false,
      result: 'skipped-unclassified',
      code: 'baseline-not-classified',
      message: `Keine Stichtagsentscheidung in ${BASELINE_PATH}; die Klassifikation ist erneut auszuführen (baseline --write)`,
    };
  }

  if (decision.status === 'not-at-baseline') {
    return {
      admit: false,
      result: 'not-at-baseline',
      code: decision.reason,
      message: `Die Vorschrift gehört nicht zum Ausgangsbestand (${decision.class}, ${decision.reason})`,
      importStatus: 'not-at-baseline',
    };
  }

  if (decision.status === 'undetermined') {
    return {
      admit: false,
      result: 'review',
      code: decision.reason,
      message: `Die Geltung am Stichtag ist unbestimmt (${decision.class}, ${decision.reason})`,
      importStatus: 'needs-review',
      review: reviewItem(
        // Geltungsfrage, keine Textfrage: Ob die Vorschrift am Stichtag galt, ist offen – ihr Text
        // wäre verfügbar. Deshalb `validity` und nicht `reconstruction-required`.
        'validity',
        `baseline-${decision.reason}`,
        `Stichtagsgeltung unbestimmt: ${decision.reason}`,
        [
          `Klasse: ${decision.class}, Status: ${decision.status}, Methode: ${decision.method}`,
          ...decision.blockers.map((blocker) => `Blocker: ${blocker}`),
          ...decision.evidence.map((item) => `${item.kind} ${item.value} (${item.source})`),
        ],
      ),
    };
  }

  if (decision.blockers.length > 0) {
    const reconstruction = decision.class === 'changed-after-baseline';
    return {
      admit: false,
      result: 'review',
      code: decision.reason,
      message: `Die Vorschrift galt am Stichtag, ihr Stichtagstext liegt aber nicht vor (${decision.blockers[0]})`,
      importStatus: 'needs-review',
      review: reviewItem(
        reconstruction ? 'reconstruction-required' : 'validity',
        `baseline-${decision.reason}`,
        reconstruction ? 'Stichtagsfassung fehlt; der heutige Text ist jünger' : `Stichtagsentscheidung mit offenen Punkten: ${decision.reason}`,
        [
          `Klasse: ${decision.class}, Status: ${decision.status}, Methode: ${decision.method}`,
          ...decision.blockers.map((blocker) => `Blocker: ${blocker}`),
          ...decision.evidence.map((item) => `${item.kind} ${item.value} (${item.source})`),
          'Den heutigen Text zu übernehmen wäre eine Rückdatierung; er wird nicht übernommen.',
        ],
      ),
    };
  }

  // Rückrechnung: zugelassen nur mit Rezept, und nur, wenn Rezept und Klassifikation dieselbe Lage
  // beschreiben – geänderter Text, Geltung am Stichtag, Änderung erst nach dem Stichtag in Kraft. Ob das
  // Rezept auf genau dieses Paket passt und den Rundlauf besteht, prüft `norm.ts` am geparsten Körper.
  if (decision.method === 'reverse-amendment') {
    const recipe = candidate.recipe;
    const problem = !recipe
      ? 'kein Rezept unter data/imports/bayernrecht/reconstruction/'
      : recipe.documentId !== candidate.documentId
        ? `Rezept gehört zu ${recipe.documentId}`
        : recipe.baselineDate !== BASELINE_DATE
          ? `Rezept rechnet auf ${recipe.baselineDate} zurück, nicht auf ${BASELINE_DATE}`
          : decision.class !== 'changed-after-baseline'
            ? `Klasse ${decision.class} passt nicht zu einer Rückrechnung`
            : !(recipe.amendment.effectiveDate > BASELINE_DATE)
              ? `Die Änderung trat am ${recipe.amendment.effectiveDate} in Kraft – nicht nach dem Stichtag; sie gehört zur Stichtagsfassung`
              : undefined;
    if (problem || !recipe) {
      return {
        admit: false,
        result: 'review',
        code: 'reconstruction-recipe-unusable',
        message: `Rückrechnung vorgesehen, aber nicht anwendbar: ${problem}`,
        importStatus: 'needs-review',
        review: reviewItem('reconstruction-required', 'baseline-reconstruction-recipe', 'Rückrechnungsrezept fehlt oder passt nicht', [
          `Klasse: ${decision.class}, Status: ${decision.status}, Methode: ${decision.method}`,
          `Befund: ${problem}`,
        ]),
      };
    }
    return { admit: true, reconstruction: recipe };
  }

  // Ohne Blocker, aber auf einem Weg, den diese Ausbaustufe nicht geht: Nur `current-unchanged`
  // trägt die Gleichsetzung „heutiger Text = Stichtagstext“ aus der Quelle selbst. Jeder andere Weg
  // setzt eine Rekonstruktion voraus, die dieser Lauf nicht leistet – und nicht behaupten darf.
  if (decision.method !== 'current-unchanged' || decision.class !== 'unchanged-since-baseline') {
    return {
      admit: false,
      result: 'review',
      code: 'recovery-method-not-available',
      message: `Der Stichtagsstand müsste über ${decision.method} gewonnen werden; diese Ausbaustufe übernimmt nur unveränderte Fassungen`,
      importStatus: 'needs-review',
      review: reviewItem('reconstruction-required', `baseline-method-${decision.method}`, `Stichtagsstand nur über ${decision.method} zu gewinnen`, [
        `Klasse: ${decision.class}, Status: ${decision.status}, Methode: ${decision.method}`,
        ...decision.evidence.map((item) => `${item.kind} ${item.value} (${item.source})`),
      ]),
    };
  }

  return { admit: true };
}
