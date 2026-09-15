/**
 * Stichtagsauswahl: Aus der Fassungsfolge einer Stammnorm wird genau die reale Fassung
 * bestimmt, für die gilt
 *
 *   sourceValidFrom <= baseline AND (sourceValidTo IS NULL OR sourceValidTo >= baseline).
 *
 * Lokal fail-closed: Blockiert wird nur, was die Stichtagsfassung selbst betrifft –
 *   - keine oder mehrere Fassungen decken den Stichtag ab,
 *   - die Stichtagsfassung ist nicht darstellbar,
 *   - ihr Intervall ist widersprüchlich (Ende vor Beginn),
 *   - Lücke oder Überlappung zur unmittelbaren Vor- oder Folgefassung,
 *   - Vor-/Folgefassung ist mehrdeutig (gleicher Beginn) oder selbst widersprüchlich,
 *   - eine Fassung ohne Datum (ihre Lage ist unbekannt, die Auswahl wäre geraten).
 * Lücken, Überlappungen und Datenfehler weit vor oder nach dem Stichtag betreffen die gewählte
 * Fassung nicht; sie werden als historische Befunde (Warnung) gemeldet, aber nie verschwiegen.
 * Die URL oder das Datum im Pfad sind nicht maßgeblich – nur die Gültigkeitsangaben.
 */
import { previousDay } from '@landesrecht/legal-core/lib/schema.ts';

export interface SourceVersionCandidate {
  /** Geltungsbeginn (ISO). Fehlt bei unvollständigen Metadaten. */
  validFrom?: string;
  /** Geltungsende (ISO); `null` = offen; `undefined` = unbekannt (wird aus dem Nachfolger abgeleitet). */
  validTo?: string | null;
  url?: string;
  available: boolean;
  label?: string;
}

export interface ResolvedCandidate extends SourceVersionCandidate {
  validFrom: string;
  validTo: string | null;
  /** Ob validTo aus dem Beginn der Folgefassung abgeleitet wurde. */
  validToDerived: boolean;
}

export type SelectionStatus = 'selected' | 'no-version-at-baseline' | 'ambiguous' | 'gap' | 'overlap' | 'missing-dates' | 'not-available' | 'inconsistent-interval';

/** Befundkategorien der Stichtagsauswahl. `baseline-*` blockiert, `history-*` ist eine Warnung. */
export const SELECTION_FINDING_CODES = [
  'baseline-undated-version',
  'baseline-no-version',
  'baseline-gap',
  'baseline-multiple-versions',
  'baseline-version-not-renderable',
  'baseline-contradictory-interval',
  'baseline-adjacent-gap',
  'baseline-adjacent-overlap',
  'baseline-neighbour-ambiguous',
  'baseline-neighbour-contradictory',
  'history-gap',
  'history-overlap',
  'history-same-start',
  'history-contradictory-interval',
] as const;
export type SelectionFindingCode = (typeof SELECTION_FINDING_CODES)[number];

export interface SelectionFinding {
  code: SelectionFindingCode;
  /** `local`: betrifft die Stichtagsfassung oder ihre unmittelbaren Nachbarn; `historical`: weit entfernt. */
  scope: 'local' | 'historical';
  severity: 'error' | 'warning';
  message: string;
  /** Geltungsbeginne der beteiligten Fassungen. */
  versions: string[];
}

export interface SelectionResult {
  status: SelectionStatus;
  baseline: string;
  selected?: ResolvedCandidate;
  candidates: ResolvedCandidate[];
  findings: SelectionFinding[];
  /** Meldungen der blockierenden (lokalen) Befunde. */
  problems: string[];
  /** Meldungen der historischen Befunde. */
  warnings: string[];
}

function local(code: SelectionFindingCode, message: string, versions: string[]): SelectionFinding {
  return { code, scope: 'local', severity: 'error', message, versions };
}

function historical(code: SelectionFindingCode, message: string, versions: string[]): SelectionFinding {
  return { code, scope: 'historical', severity: 'warning', message, versions };
}

function result(status: SelectionStatus, baseline: string, candidates: ResolvedCandidate[], findings: SelectionFinding[], selected?: ResolvedCandidate): SelectionResult {
  const output: SelectionResult = {
    status,
    baseline,
    candidates,
    findings,
    problems: findings.filter((finding) => finding.severity === 'error').map((finding) => finding.message),
    warnings: findings.filter((finding) => finding.severity === 'warning').map((finding) => finding.message),
  };
  if (selected) output.selected = selected;
  return output;
}

const contradictory = (candidate: ResolvedCandidate): boolean => candidate.validTo !== null && candidate.validTo < candidate.validFrom;
const covers = (candidate: ResolvedCandidate, baseline: string): boolean => !contradictory(candidate) && candidate.validFrom <= baseline && (candidate.validTo === null || candidate.validTo >= baseline);
const describe = (candidate: ResolvedCandidate): string => `ab ${candidate.validFrom} (bis ${candidate.validTo ?? 'offen'})`;

/** Beziehung zweier aufeinanderfolgender Fassungen (nach Beginn sortiert). */
function pairIssue(current: ResolvedCandidate, next: ResolvedCandidate): { kind: 'same-start' | 'overlap' | 'gap'; message: string } | null {
  if (current.validFrom === next.validFrom) return { kind: 'same-start', message: `Zwei Fassungen beginnen am ${current.validFrom}` };
  if (contradictory(current)) return null;
  if (current.validTo === null || current.validTo >= next.validFrom) return { kind: 'overlap', message: `Fassung ${describe(current)} überlappt mit Fassung ab ${next.validFrom}` };
  if (current.validTo !== previousDay(next.validFrom)) return { kind: 'gap', message: `Lücke zwischen Fassung bis ${current.validTo} und Fassung ab ${next.validFrom}` };
  return null;
}

/**
 * Löst unbekannte Enden aus der Fassungsfolge auf (Ende = Tag vor Beginn der nächsten später
 * beginnenden Fassung; die letzte Fassung endet offen) und wählt die Stichtagsfassung.
 */
export function selectSourceVersionAtBaseline(input: readonly SourceVersionCandidate[], baseline: string): SelectionResult {
  const findings: SelectionFinding[] = [];
  const dated = input.filter((candidate): candidate is SourceVersionCandidate & { validFrom: string } => Boolean(candidate.validFrom));
  const sorted = [...dated].sort((left, right) => left.validFrom.localeCompare(right.validFrom));
  const candidates: ResolvedCandidate[] = sorted.map((candidate) => {
    const next = sorted.find((other) => other.validFrom > candidate.validFrom);
    const derived = candidate.validTo === undefined;
    const validTo = derived ? (next ? previousDay(next.validFrom) : null) : (candidate.validTo as string | null);
    return { ...candidate, validFrom: candidate.validFrom, validTo, validToDerived: derived };
  });

  // Fassungen ohne Datum: ihre Lage ist unbekannt – jede Auswahl wäre geraten.
  const undated = input.filter((candidate) => !candidate.validFrom);
  if (undated.length > 0) {
    for (const candidate of undated) findings.push(local('baseline-undated-version', `Fassung ohne Geltungsbeginn: ${candidate.label ?? candidate.url ?? '?'}`, []));
    return result('missing-dates', baseline, candidates, findings);
  }

  const matching = candidates.filter((candidate) => covers(candidate, baseline));
  const selectedIndex = matching.length === 1 ? candidates.indexOf(matching[0]!) : -1;
  const localFindings: SelectionFinding[] = [];
  let status: SelectionStatus = 'selected';
  const block = (entryStatus: SelectionStatus, finding: SelectionFinding): void => {
    if (status === 'selected') status = entryStatus;
    localFindings.push(finding);
  };

  if (matching.length > 1) {
    const sameStart = new Set(matching.map((candidate) => candidate.validFrom)).size < matching.length;
    block(sameStart ? 'ambiguous' : 'overlap', local('baseline-multiple-versions', `${matching.length} Fassungen decken den Stichtag ${baseline} ab: ${matching.map(describe).join('; ')}${sameStart ? '' : ' (überlappt)'}`, matching.map((candidate) => candidate.validFrom)));
  } else if (matching.length === 0) {
    const started = candidates.filter((candidate) => candidate.validFrom <= baseline);
    const last = started[started.length - 1];
    const next = candidates.find((candidate) => candidate.validFrom > baseline);
    if (last && contradictory(last)) block('inconsistent-interval', local('baseline-contradictory-interval', `Fassung ab ${last.validFrom} endet vor ihrem Beginn (${last.validTo}); der Stichtag ${baseline} ist nicht bestimmbar`, [last.validFrom]));
    else if (last && next) block('gap', local('baseline-gap', `Keine Fassung deckt den Stichtag ${baseline} ab: Lücke zwischen Fassung bis ${last.validTo ?? 'offen'} und Fassung ab ${next.validFrom}`, [last.validFrom, next.validFrom]));
    else block('no-version-at-baseline', local('baseline-no-version', `Keine Fassung deckt den Stichtag ${baseline} ab`, []));
  } else {
    const selected = candidates[selectedIndex]!;
    const sameStart = candidates.filter((candidate) => candidate !== selected && candidate.validFrom === selected.validFrom);
    if (sameStart.length > 0) block('ambiguous', local('baseline-neighbour-ambiguous', `Neben der Stichtagsfassung beginnt eine weitere Fassung am ${selected.validFrom}`, [selected.validFrom]));
    const predecessor = candidates[selectedIndex - 1];
    if (predecessor && predecessor.validFrom !== selected.validFrom) {
      if (contradictory(predecessor)) {
        block('inconsistent-interval', local('baseline-neighbour-contradictory', `Vorfassung ab ${predecessor.validFrom} endet vor ihrem Beginn (${predecessor.validTo})`, [predecessor.validFrom, selected.validFrom]));
      } else {
        const issue = pairIssue(predecessor, selected);
        if (issue?.kind === 'overlap') block('overlap', local('baseline-adjacent-overlap', `Vorfassung ${describe(predecessor)} überlappt mit der Stichtagsfassung ab ${selected.validFrom}`, [predecessor.validFrom, selected.validFrom]));
        if (issue?.kind === 'gap') block('gap', local('baseline-adjacent-gap', `Lücke zwischen Vorfassung bis ${predecessor.validTo} und Stichtagsfassung ab ${selected.validFrom}`, [predecessor.validFrom, selected.validFrom]));
      }
    }
    const successor = candidates[selectedIndex + 1];
    if (successor && successor.validFrom !== selected.validFrom) {
      if (contradictory(successor)) block('inconsistent-interval', local('baseline-neighbour-contradictory', `Folgefassung ab ${successor.validFrom} endet vor ihrem Beginn (${successor.validTo})`, [selected.validFrom, successor.validFrom]));
      const issue = pairIssue(selected, successor);
      if (issue?.kind === 'overlap') block('overlap', local('baseline-adjacent-overlap', `Stichtagsfassung ${describe(selected)} überlappt mit der Folgefassung ab ${successor.validFrom}`, [selected.validFrom, successor.validFrom]));
      if (issue?.kind === 'gap') block('gap', local('baseline-adjacent-gap', `Lücke zwischen Stichtagsfassung bis ${selected.validTo} und Folgefassung ab ${successor.validFrom}`, [selected.validFrom, successor.validFrom]));
    }
    if (!selected.available) block('not-available', local('baseline-version-not-renderable', `Die Stichtagsfassung ab ${selected.validFrom} ist auf RECHT.NRW nicht darstellbar`, [selected.validFrom]));
  }

  // Historische Befunde: alles, was weder die Stichtagsfassung, ihre Nachbarn noch einen lokalen Befund betrifft.
  const involved = new Set(localFindings.flatMap((finding) => finding.versions));
  const neighbourIndexes = new Set(selectedIndex >= 0 ? [selectedIndex - 1, selectedIndex, selectedIndex + 1] : []);
  for (let index = 0; index < candidates.length - 1; index += 1) {
    if (selectedIndex >= 0 && (index === selectedIndex - 1 || index === selectedIndex)) continue;
    const current = candidates[index]!;
    const next = candidates[index + 1]!;
    if (involved.has(current.validFrom) && involved.has(next.validFrom)) continue;
    const issue = pairIssue(current, next);
    if (issue) findings.push(historical(issue.kind === 'same-start' ? 'history-same-start' : issue.kind === 'overlap' ? 'history-overlap' : 'history-gap', issue.message, [current.validFrom, next.validFrom]));
  }
  candidates.forEach((candidate, index) => {
    if (contradictory(candidate) && !neighbourIndexes.has(index) && !involved.has(candidate.validFrom)) findings.push(historical('history-contradictory-interval', `Fassung ab ${candidate.validFrom} endet vor ihrem Beginn (${candidate.validTo})`, [candidate.validFrom]));
  });

  if (status !== 'selected') return result(status, baseline, candidates, [...localFindings, ...findings]);
  const selected = candidates[selectedIndex]!;
  return result('selected', baseline, candidates, findings, selected);
}
