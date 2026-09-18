/**
 * Stichtagsklassifikation für BayWü: Galt diese Vorschrift am **2023-12-01**, und ist ihr
 * Stichtagstext beschaffbar?
 *
 * Der Ausgangspunkt ist eine Schwierigkeit der Quelle. BAYERN.RECHT führt nur den **heutigen** Stand
 * und keine außer Kraft getretenen Vorschriften. Der Stichtagsbestand ist deshalb weder der heutige
 * Bestand noch aus ihm allein herleitbar. Was das Portal je Norm liefert, sind drei Daten – und
 * genau ihr Verhältnis trägt die Entscheidung:
 *
 * ```text
 * ausfertigungsdatum   wann die Vorschrift erlassen wurde        (Existenz)
 * fassungsdatum        Datum der geführten Fassung
 * inkraft              ab wann der gezeigte Text gilt            (Textgeltung)
 * ```
 *
 * **Ausfertigung ist nicht Textgeltung.** Eine Vorschrift von 1976, deren gezeigter Text seit 2024
 * gilt, existierte am Stichtag – aber mit einem anderen Text. Sie zu übernehmen hieße, eine Fassung
 * zurückzudatieren. Das ist der häufigste und gefährlichste Fehlschluss in diesem Bestand, und die
 * Klassen unten trennen genau daran.
 */
import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';

export const BASELINE_CLASSES = [
  /** Der gezeigte Text galt schon am Stichtag – er **ist** der Stichtagstext. */
  'unchanged-since-baseline',
  /** Existierte am Stichtag, der gezeigte Text ist jünger – die Stichtagsfassung fehlt. */
  'changed-after-baseline',
  /** Erst nach dem Stichtag erlassen – gehört nicht in den Ausgangsbestand. */
  'enacted-after-baseline',
  /** Datenlage unklar oder widersprüchlich. */
  'identity-or-validity-uncertain',
] as const;
export type BaselineClass = (typeof BASELINE_CLASSES)[number];

export const BASELINE_STATUSES = ['active-at-baseline', 'not-at-baseline', 'undetermined'] as const;
export type BaselineStatus = (typeof BASELINE_STATUSES)[number];

export const RECOVERY_METHODS = [
  /** Der heutige Text gilt unverändert seit vor dem Stichtag. */
  'current-unchanged',
  /** Eine amtliche Veröffentlichung liefert den Volltext nahe am Stichtag. */
  'official-historical-fulltext',
  /** Eine Änderung nach dem Stichtag lässt sich sicher rückwärts anwenden. */
  'reverse-amendment',
  /** Eine amtliche Fassung vor dem Stichtag plus alle Änderungen bis zum Stichtag. */
  'forward-reconstruction',
  /** Heute nicht mehr geführt, über ein Post-Baseline-Ereignis wiedergefunden. */
  'baseline-only-recovered',
  /** Kein sicherer Weg bekannt. */
  'undetermined',
] as const;
export type RecoveryMethod = (typeof RECOVERY_METHODS)[number];

export interface BaselineEvidence {
  kind: 'issue-date' | 'issue-year' | 'text-in-force' | 'version-date' | 'register-absent' | 'post-baseline-event' | 'change-note';
  value: string;
  source: string;
}

export interface BaselineDecision {
  documentId: string;
  class: BaselineClass;
  status: BaselineStatus;
  method: RecoveryMethod;
  /** Maschinenlesbare Begründung – jede Entscheidung muss sich ohne diesen Code nachvollziehen lassen. */
  reason: string;
  evidence: BaselineEvidence[];
  /** Offene Punkte, die eine Übernahme verhindern. */
  blockers: string[];
}

export interface BaselineInput {
  documentId: string;
  /** Ausfertigungsdatum (ISO) – wann die Vorschrift erlassen wurde. */
  documentDate?: string;
  /**
   * Jahrgang des Verkündungsorgans, wenn kein Tagesdatum zu gewinnen ist.
   *
   * Ein Jahr ist kein Ausfertigungsdatum – aber für die Stichtagsfrage oft trotzdem entscheidend:
   * Eine Vorschrift im AllMBl. **2000** ist zweifelsfrei vor dem 2023-12-01 erlassen. Nur der
   * Jahrgang des Stichtagsjahres selbst bleibt mehrdeutig, denn er umschließt den Stichtag.
   */
  issueYear?: string;
  /** Beginn der Geltung des gezeigten Textes (ISO). */
  inForceFrom?: string;
  /** Datum der geführten Fassung (ISO). */
  versionDate?: string;
  /** Der Fortführungsnachweis führt die Vorschrift nicht (Hinweis auf die Geltung). */
  registerAbsent?: boolean;
  /** Datierte Änderungsvermerke der Quelle, aufsteigend. */
  changeNotes?: string[];
  /** Belegte Ereignisse nach dem Stichtag aus dem Ereignisregister. */
  postBaselineEvents?: Array<{ type: string; date: string; citation?: string }>;
  baselineDate?: string;
}

const evidence = (kind: BaselineEvidence['kind'], value: string, source: string): BaselineEvidence => ({ kind, value, source });

/**
 * Entscheidet für eine Norm des heutigen Bestands.
 *
 * Die Reihenfolge ist bindend und folgt der Beweiskraft: Erst wird geklärt, ob die Vorschrift am
 * Stichtag überhaupt existierte (Ausfertigung), dann, ob der gezeigte Text der Stichtagstext ist
 * (Textgeltung). Nie umgekehrt – aus einer alten Textgeltung folgt nichts über die Existenz, und aus
 * einer frühen Ausfertigung nichts über den Text.
 */
export function classifyBaseline(input: BaselineInput): BaselineDecision {
  const baseline = input.baselineDate ?? SIMULATION_BASELINE_DATE;
  const facts: BaselineEvidence[] = [];
  if (input.documentDate) facts.push(evidence('issue-date', input.documentDate, 'xml:ausfertigungsdatum'));
  if (!input.documentDate && input.issueYear) facts.push(evidence('issue-year', input.issueYear, 'xml:fundstelle/jahr'));
  if (input.inForceFrom) facts.push(evidence('text-in-force', input.inForceFrom, 'xml:inkraft'));
  if (input.versionDate) facts.push(evidence('version-date', input.versionDate, 'xml:fassungsdatum'));
  if (input.registerAbsent) facts.push(evidence('register-absent', 'nicht im Fortführungsnachweis', 'enumeration'));
  for (const event of input.postBaselineEvents ?? []) {
    facts.push(evidence('post-baseline-event', `${event.type} ${event.date}${event.citation ? ` (${event.citation})` : ''}`, 'event-ledger'));
  }

  const base = { documentId: input.documentId, evidence: facts };

  // 1 – Ohne Ausfertigungsdatum ist die Existenz am Stichtag nicht belegt. Die Textgeltung allein
  //     beweist sie nicht: Sie sagt, seit wann der gezeigte Text gilt, nicht seit wann die Norm gilt.
  const baselineYear = baseline.slice(0, 4);
  let issueDate = input.documentDate;
  if (!issueDate && input.issueYear) {
    // Der Jahrgang genügt, solange er den Stichtag nicht umschließt. Das Jahr des Stichtags selbst
    // lässt offen, ob die Verkündung davor oder danach lag – da wird nicht geraten.
    if (input.issueYear < baselineYear) issueDate = `${input.issueYear}-12-31`;
    else if (input.issueYear > baselineYear) issueDate = `${input.issueYear}-01-01`;
  }
  if (!issueDate) {
    const detail = input.issueYear
      ? `Kein Ausfertigungsdatum; der Jahrgang ${input.issueYear} umschließt den Stichtag und lässt offen, ob die Verkündung davor oder danach lag`
      : 'Ausfertigungsdatum fehlt; die Existenz am Stichtag ist nicht belegt';
    return {
      ...base,
      class: 'identity-or-validity-uncertain',
      status: 'undetermined',
      method: 'undetermined',
      reason: input.issueYear ? 'issue-year-spans-baseline' : 'no-issue-date',
      blockers: [detail],
    };
  }

  // 2 – Nach dem Stichtag erlassen: gehört nicht in den Ausgangsbestand. Eindeutig und ohne Review.
  if (issueDate > baseline) {
    return {
      ...base,
      class: 'enacted-after-baseline',
      status: 'not-at-baseline',
      method: 'undetermined',
      reason: 'issued-after-baseline',
      blockers: [],
    };
  }

  // 3 – Existierte am Stichtag. Jetzt die eigentliche Frage: Ist der gezeigte Text der Stichtagstext?
  if (!input.inForceFrom) {
    return {
      ...base,
      class: 'identity-or-validity-uncertain',
      status: 'undetermined',
      method: 'undetermined',
      reason: 'no-text-validity-date',
      blockers: ['Beginn der Textgeltung fehlt; ob der gezeigte Text am Stichtag galt, ist offen'],
    };
  }

  if (input.inForceFrom <= baseline) {
    // Der gezeigte Text gilt seit vor dem Stichtag und ist bis heute der geführte – also galt er auch
    // am Stichtag. Das ist ein Beleg aus der Quelle, keine Annahme.
    const blockers = input.registerAbsent
      ? ['Der Fortführungsnachweis führt die Vorschrift nicht; ob sie am Stichtag noch galt, ist gesondert zu klären']
      : [];
    return {
      ...base,
      class: 'unchanged-since-baseline',
      status: blockers.length > 0 ? 'undetermined' : 'active-at-baseline',
      method: blockers.length > 0 ? 'undetermined' : 'current-unchanged',
      reason: blockers.length > 0 ? 'register-absent-validity-open' : 'text-unchanged-since-before-baseline',
      blockers,
    };
  }

  // 4 – Existierte am Stichtag, aber der gezeigte Text ist jünger. Die Stichtagsfassung fehlt und
  //     muss beschafft werden; den heutigen Text zu übernehmen wäre eine Rückdatierung.
  return {
    ...base,
    class: 'changed-after-baseline',
    status: 'active-at-baseline',
    method: 'undetermined',
    reason: 'text-changed-after-baseline',
    blockers: [`Der gezeigte Text gilt erst ab ${input.inForceFrom}; die Fassung vom ${baseline} ist zu beschaffen`],
  };
}
