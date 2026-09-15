/**
 * Stichtagsauswahl: Aus der Fassungsfolge einer Stammnorm wird genau die reale Fassung
 * bestimmt, für die gilt
 *
 *   sourceValidFrom <= baseline AND (sourceValidTo IS NULL OR sourceValidTo >= baseline).
 *
 * Fail-closed: Lücken, Überlappungen, fehlende Datumsangaben, mehrere Kandidaten oder ein
 * nicht darstellbarer Kandidat führen zu einem Ergebnis `status !== 'selected'`; es wird nie
 * geraten. Die URL oder das Datum im Pfad sind nicht maßgeblich – nur die Gültigkeitsangaben.
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

export interface SelectionResult {
  status: SelectionStatus;
  baseline: string;
  selected?: ResolvedCandidate;
  candidates: ResolvedCandidate[];
  problems: string[];
}

function fail(status: SelectionStatus, baseline: string, candidates: ResolvedCandidate[], problems: string[]): SelectionResult {
  return { status, baseline, candidates, problems };
}

/**
 * Löst unbekannte Enden aus der Fassungsfolge auf (Ende = Tag vor Beginn der nächsten Fassung;
 * die letzte Fassung endet offen) und wählt die Stichtagsfassung.
 */
export function selectSourceVersionAtBaseline(input: readonly SourceVersionCandidate[], baseline: string): SelectionResult {
  const problems: string[] = [];
  if (input.some((candidate) => !candidate.validFrom)) {
    return fail('missing-dates', baseline, [], input.filter((candidate) => !candidate.validFrom).map((candidate) => `Fassung ohne Geltungsbeginn: ${candidate.label ?? candidate.url ?? '?'}`));
  }
  const sorted = [...input].sort((left, right) => left.validFrom!.localeCompare(right.validFrom!));
  const candidates: ResolvedCandidate[] = sorted.map((candidate, index) => {
    const next = sorted[index + 1];
    const derived = candidate.validTo === undefined;
    const validTo = candidate.validTo === undefined ? (next ? previousDay(next.validFrom!) : null) : candidate.validTo;
    const resolved: ResolvedCandidate = { ...candidate, validFrom: candidate.validFrom!, validTo, validToDerived: derived };
    return resolved;
  });

  for (const candidate of candidates) {
    if (candidate.validTo !== null && candidate.validTo < candidate.validFrom) {
      problems.push(`Fassung ab ${candidate.validFrom} endet vor ihrem Beginn (${candidate.validTo})`);
    }
  }
  if (problems.length > 0) return fail('inconsistent-interval', baseline, candidates, problems);

  for (let index = 0; index < candidates.length - 1; index += 1) {
    const current = candidates[index]!;
    const next = candidates[index + 1]!;
    if (current.validFrom === next.validFrom) problems.push(`Zwei Fassungen beginnen am ${current.validFrom}`);
    if (current.validTo === null || current.validTo >= next.validFrom) {
      problems.push(`Fassung ab ${current.validFrom} (bis ${current.validTo ?? 'offen'}) überlappt mit Fassung ab ${next.validFrom}`);
    } else if (current.validTo !== previousDay(next.validFrom)) {
      problems.push(`Lücke zwischen Fassung bis ${current.validTo} und Fassung ab ${next.validFrom}`);
    }
  }
  const overlaps = problems.some((problem) => problem.includes('überlappt') || problem.includes('Zwei Fassungen'));
  const gaps = problems.some((problem) => problem.startsWith('Lücke'));

  const matching = candidates.filter((candidate) => candidate.validFrom <= baseline && (candidate.validTo === null || candidate.validTo >= baseline));
  if (matching.length > 1) return fail(overlaps ? 'overlap' : 'ambiguous', baseline, candidates, [...problems, `${matching.length} Fassungen decken den Stichtag ${baseline} ab`]);
  if (matching.length === 0) {
    if (gaps) return fail('gap', baseline, candidates, [...problems, `Keine Fassung deckt den Stichtag ${baseline} ab (Lücke in der Fassungsfolge)`]);
    return fail('no-version-at-baseline', baseline, candidates, [...problems, `Keine Fassung deckt den Stichtag ${baseline} ab`]);
  }
  // Überlappungen oder Lücken an anderer Stelle der Folge machen die Auswahl unsicher:
  // die abgeleiteten Enden wären dann nicht verlässlich.
  if (overlaps) return fail('overlap', baseline, candidates, problems);
  if (gaps) return fail('gap', baseline, candidates, problems);

  const selected = matching[0]!;
  if (!selected.available) return fail('not-available', baseline, candidates, [`Die Stichtagsfassung ab ${selected.validFrom} ist auf RECHT.NRW nicht darstellbar`]);
  return { status: 'selected', baseline, selected, candidates, problems };
}
