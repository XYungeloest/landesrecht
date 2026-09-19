/**
 * Der `decisionTrace`: die Antwort, die jede übernommene Norm schuldet.
 *
 * Eine Norm des Ausgangsbestands behauptet, am **2023-12-01** gegolten zu haben. Diese Behauptung
 * steht nicht im Normtext und lässt sich ihm auch nicht ansehen – sie ergibt sich aus einer Kette:
 * Umfangsentscheidung → Stichtagsklassifikation → Weg, auf dem der Stichtagstext gewonnen wurde →
 * die Quelle, aus der er stammt. Der Trace trägt diese Kette am Manifesteintrag, maschinenlesbar und
 * ohne Rückgriff auf Dateien, die später überschrieben werden könnten.
 *
 * Er ist bewusst redundant zu `scope.json` und `baseline.json`: Diese Dateien sind Zwischenstände
 * eines Arbeitsflusses und werden neu gebaut; der Manifesteintrag ist der Nachweis am Bestand. Wer
 * in einem Jahr fragt, warum eine Norm im Ausgangsrechtsstand steht, soll die Antwort am Eintrag
 * finden und nicht in einem Lauf rekonstruieren müssen.
 */
import type { BaselineDecision, BaselineEvidence } from '../baseline/classify.ts';
import type { BaselineRecoveryMethod } from '../common/manifest.ts';
import { recipeAmendments, type AnyReconstructionRecipe } from '../reconstruction/recipe.ts';
import type { BulkCandidate } from './select.ts';

export const DECISION_TRACE_SCHEMA = 'bayernrecht-decision-trace/1' as const;

export interface DecisionTrace {
  schemaVersion: typeof DECISION_TRACE_SCHEMA;
  documentId: string;
  baselineDate: string;
  /** Die Antwort in einem Satz – für Menschen, die keinen Code lesen. */
  statement: string;
  scope: { decision: 'include' | 'review'; reason: string; evidence: string[] };
  baseline: {
    class: BaselineDecision['class'];
    status: BaselineDecision['status'];
    method: BaselineDecision['method'];
    reason: string;
    blockers: string[];
    evidence: BaselineEvidence[];
  };
  /** Weg, auf dem der Stichtagsstand gewonnen wurde (Vokabular des Manifests), mit Begründung. */
  recovery: { method: BaselineRecoveryMethod; note: string };
  source: {
    zipUrl: string;
    documentUrl: string;
    sha256: string;
    retrievedAt: string;
    /** Ausfertigungsdatum laut Quelle (Existenz der Vorschrift). */
    documentDate?: string;
    /** Beginn der Geltung des übernommenen Textes laut Quelle (Textgeltung). */
    textInForceFrom?: string;
    parserVersion: string;
    transformerVersion: string;
  };
  /** Belegkette in Leserichtung; jede Zeile nennt Beleg und Fundort. */
  evidenceChain: string[];
}

/**
 * Weg der Stichtagsgewinnung: Klassifikationsmethode → Manifestvokabular.
 *
 * Nur `current-unchanged` ist eine Feststellung an der Quelle („der gezeigte Text gilt seit vor dem
 * Stichtag“) und wird deshalb zu `current-source`. Die übrigen Werte bezeichnen einen **vorgesehenen**
 * Weg, der in diesem Lauf nicht gegangen wird; sie stehen nur an Einträgen, die nicht übernommen
 * werden (`needs-review`, `not-at-baseline`), und behaupten dort nichts über den Bestand. Das
 * Manifestfeld kennt keinen Wert „noch offen“ – diese Zuordnung macht die Lücke sichtbar, statt sie
 * mit einem beliebigen Wert zu füllen.
 */
export const RECOVERY_METHOD_MAPPING: Readonly<Record<BaselineDecision['method'], BaselineRecoveryMethod>> = {
  'current-unchanged': 'current-source',
  'official-historical-fulltext': 'reconstructed-from-publications',
  'reverse-amendment': 'reverse-post-baseline-event',
  'forward-reconstruction': 'reconstructed-from-publications',
  'baseline-only-recovered': 'reconstructed-from-publications',
  undetermined: 'reverse-post-baseline-event',
};

/** Die zurückgenommenen Änderungen in Klartext, älteste zuerst („A (Wirkung ab …), dann B (…)“). */
export function reversedAmendmentsText(recipe: AnyReconstructionRecipe): string {
  return [...recipeAmendments(recipe)].reverse().map((amendment) => `${amendment.citation} (Wirkung ab ${amendment.effectiveDate})`).join(', dann ');
}

/** Hinweis auf wiederhergestellten Alttext: Die Änderungsbefehle nennen ihn nicht, er stammt aus der Stammverkündung. */
function restorationNote(recipe: AnyReconstructionRecipe): string {
  const restoration = recipe.restoration;
  if (!restoration) return '';
  const base = restoration.sources.find((source) => source.role === 'base-publication');
  return `; Alttext von ${restoration.restoredSteps} Schritt${restoration.restoredSteps === 1 ? '' : 'en'} aus der Stammverkündung ${base?.citation ?? ''} wiederhergestellt, Wortlautvergleich bestanden`.replace(/\s+wiederhergestellt/u, ' wiederhergestellt');
}

export function recoveryMethodFor(decision: BaselineDecision | undefined, recipe?: AnyReconstructionRecipe): { method: BaselineRecoveryMethod; note: string } {
  if (!decision) {
    return { method: 'reverse-post-baseline-event', note: 'Ohne Stichtagsklassifikation ist kein Weg bestimmt; der Eintrag wird nicht übernommen.' };
  }
  const method = RECOVERY_METHOD_MAPPING[decision.method];
  if (decision.method === 'current-unchanged') {
    return { method, note: 'Der gezeigte Text gilt seit vor dem Stichtag unverändert; die abgerufene Quellfassung ist zugleich die Stichtagsfassung.' };
  }
  // Gegangen ist der Weg nur mit bewiesenem Rezept (Rundlauf in norm.ts); dann – und nur dann – nennt die
  // Notiz ihn als gegangen.
  if (decision.method === 'reverse-amendment' && recipe) {
    return {
      method,
      note: `Stichtagsfassung durch Rücknahme ${recipeAmendments(recipe).length === 1 ? 'der Änderung' : `von ${recipeAmendments(recipe).length} Änderungen`} ${reversedAmendmentsText(recipe)} aus dem heutigen Text zurückgerechnet${restorationNote(recipe)}; Rezept data/imports/bayernrecht/reconstruction/${recipe.documentId}.json, Rundlauf bestanden.`,
    };
  }
  return {
    method,
    note: `Der Stichtagsstand ist nicht gewonnen. ${method} bezeichnet den vorgesehenen Weg (Klassifikation: ${decision.method}); der Eintrag wird nicht übernommen.`,
  };
}

export interface BuildDecisionTraceInput {
  candidate: BulkCandidate;
  baselineDate: string;
  sha256: string;
  retrievedAt: string;
  documentDate?: string;
  textInForceFrom?: string;
  parserVersion: string;
  transformerVersion: string;
  /** Wurde die Norm in diesem Lauf übernommen? Nur dann behauptet der Satz eine Geltung. */
  imported: boolean;
  /** Bewiesene Rückrechnung (Rundlauf bestanden) und belegter Beginn der Stichtagsfassung. */
  reconstruction?: { recipe: AnyReconstructionRecipe; baselineTextFrom: string };
}

export function buildDecisionTrace(input: BuildDecisionTraceInput): DecisionTrace {
  const { candidate, baselineDate } = input;
  const decision = candidate.baseline;
  const recovery = recoveryMethodFor(decision, input.reconstruction?.recipe);
  const evidenceChain: string[] = [
    `Scope: ${candidate.scopeDecision} – ${candidate.scopeReason}${candidate.scopeEvidence.length > 0 ? ` (${candidate.scopeEvidence.join(', ')})` : ''}`,
    ...(decision
      ? [
          `Stichtag: ${decision.class} / ${decision.status} / ${decision.method} – ${decision.reason}`,
          ...decision.evidence.map((item) => `Beleg ${item.kind}: ${item.value} (${item.source})`),
          ...decision.blockers.map((blocker) => `Offen: ${blocker}`),
        ]
      : ['Stichtag: keine Entscheidung in baseline.json']),
    `Quelle: ${candidate.zipUrl} (SHA-256 ${input.sha256.slice(0, 16)}…, abgerufen ${input.retrievedAt})`,
    `Werkzeuge: ${input.parserVersion}, ${input.transformerVersion}`,
  ];
  const reconstructed = input.reconstruction;
  const statement = input.imported && decision && reconstructed
    ? recipeAmendments(reconstructed.recipe).length === 1
      ? `Der heutige Text gilt erst seit ${recipeAmendments(reconstructed.recipe)[0]!.effectiveDate} (${recipeAmendments(reconstructed.recipe)[0]!.citation}); die Fassung davor galt seit ${reconstructed.baselineTextFrom} und damit am ${baselineDate}. Sie wurde durch Rücknahme genau dieser Änderung zurückgerechnet; der Rundlauf ergibt byteidentisch den heutigen Text.`
      : `Der Text wurde nach dem Stichtag ${recipeAmendments(reconstructed.recipe).length}-mal geändert: ${reversedAmendmentsText(reconstructed.recipe)}. Die Fassung vor der ersten dieser Änderungen galt seit ${reconstructed.baselineTextFrom} und damit am ${baselineDate}. Sie wurde durch Rücknahme aller Änderungen in umgekehrter Reihenfolge zurückgerechnet; die Vorwärtsanwendung ergibt byteidentisch den heutigen Text.`
    : input.imported && decision
    ? `Die Vorschrift wurde am ${input.documentDate ?? '?'} ausgefertigt und ihr gezeigter Text gilt seit ${input.textInForceFrom ?? '?'} unverändert; damit galt genau dieser Text am ${baselineDate}.`
    : decision
      ? `Nicht übernommen: ${decision.reason} (${decision.class}, ${decision.status}).`
      : 'Nicht übernommen: Der Stichtagsstand dieser Vorschrift ist nicht klassifiziert.';

  return {
    schemaVersion: DECISION_TRACE_SCHEMA,
    documentId: candidate.documentId,
    baselineDate,
    statement,
    scope: { decision: candidate.scopeDecision, reason: candidate.scopeReason, evidence: [...candidate.scopeEvidence] },
    baseline: decision
      ? { class: decision.class, status: decision.status, method: decision.method, reason: decision.reason, blockers: [...decision.blockers], evidence: [...decision.evidence] }
      : { class: 'identity-or-validity-uncertain', status: 'undetermined', method: 'undetermined', reason: 'not-classified', blockers: ['Keine Stichtagsentscheidung vorhanden'], evidence: [] },
    recovery,
    source: {
      zipUrl: candidate.zipUrl,
      documentUrl: candidate.sourceUrl,
      sha256: input.sha256,
      retrievedAt: input.retrievedAt,
      ...(input.documentDate ? { documentDate: input.documentDate } : {}),
      ...(input.textInForceFrom ? { textInForceFrom: input.textInForceFrom } : {}),
      parserVersion: input.parserVersion,
      transformerVersion: input.transformerVersion,
    },
    evidenceChain,
  };
}

/**
 * Schemaprüfung eines Traces (fail-closed). Sie prüft, was der Trace beantworten können muss:
 * Umfang, Klasse, Status, Methode, Begründung, Belegkette und die Quelle, aus der der Text stammt.
 */
export function decisionTraceProblems(value: unknown, where = 'decisionTrace'): string[] {
  const problems: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${where}: kein Objekt`];
  const trace = value as Record<string, unknown>;
  if (trace.schemaVersion !== DECISION_TRACE_SCHEMA) problems.push(`${where}: schemaVersion ist ${String(trace.schemaVersion)}`);
  if (typeof trace.documentId !== 'string' || trace.documentId === '') problems.push(`${where}: documentId fehlt`);
  if (typeof trace.baselineDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(String(trace.baselineDate))) problems.push(`${where}: baselineDate ist kein ISO-Datum`);
  if (typeof trace.statement !== 'string' || trace.statement.trim() === '') problems.push(`${where}: statement fehlt`);
  const scope = trace.scope as Record<string, unknown> | undefined;
  if (!scope || typeof scope.reason !== 'string' || scope.reason === '' || !Array.isArray(scope.evidence)) problems.push(`${where}.scope: Entscheidung, Grund oder Beleg fehlt`);
  const baseline = trace.baseline as Record<string, unknown> | undefined;
  if (!baseline) problems.push(`${where}.baseline fehlt`);
  else {
    for (const field of ['class', 'status', 'method', 'reason'] as const) {
      if (typeof baseline[field] !== 'string' || baseline[field] === '') problems.push(`${where}.baseline.${field} fehlt`);
    }
    if (!Array.isArray(baseline.evidence)) problems.push(`${where}.baseline.evidence fehlt`);
    if (!Array.isArray(baseline.blockers)) problems.push(`${where}.baseline.blockers fehlt`);
  }
  const recovery = trace.recovery as Record<string, unknown> | undefined;
  if (!recovery || typeof recovery.method !== 'string' || typeof recovery.note !== 'string') problems.push(`${where}.recovery: Methode oder Begründung fehlt`);
  const source = trace.source as Record<string, unknown> | undefined;
  if (!source) problems.push(`${where}.source fehlt`);
  else {
    if (typeof source.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(String(source.sha256))) problems.push(`${where}.source.sha256 ist kein SHA-256`);
    for (const field of ['zipUrl', 'retrievedAt', 'parserVersion', 'transformerVersion'] as const) {
      if (typeof source[field] !== 'string' || source[field] === '') problems.push(`${where}.source.${field} fehlt`);
    }
  }
  if (!Array.isArray(trace.evidenceChain) || trace.evidenceChain.length === 0) problems.push(`${where}.evidenceChain fehlt oder ist leer`);
  return problems;
}
