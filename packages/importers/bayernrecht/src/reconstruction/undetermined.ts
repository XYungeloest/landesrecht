/**
 * Die unbestimmten Geltungsfälle (`baseline.json`, `status: undetermined`) mit dem Ereignisregister neu prüfen.
 *
 * Gesucht wird **starke amtliche Evidenz** nach dem Stichtag: eine Verkündung, die die Norm mit zwei unabhängigen
 * Merkmalen (Ausfertigungsdatum oder BayRS-Nummer plus Fundstelle, Abkürzung oder Titel) zitiert **und** einen
 * Änderungs- oder Aufhebungsbefehl an sie richtet – entweder als stark zugeordnetes Ereignis des Registers oder im
 * Volltext einer Detailseite nach dem Stichtag. Eine solche Verkündung setzt voraus, dass die Norm an ihrem Tag
 * galt; gilt der heutige Text laut Paket seit einem Tag vor dem Stichtag und nennt die Verkündung keine Änderung
 * dazwischen („zuletzt geändert durch …“ fehlt oder liegt vor dem Stichtag), galt die Norm auch am Stichtag.
 *
 * Nur die **Geltung** wird so entschieden. Hat die spätere Verkündung den Text geändert, bleibt die Methode
 * `undetermined` mit Blocker – der heutige Text ist dann nicht der Stichtagstext. Alles andere bleibt unbestimmt;
 * ein Titel allein, eine gleiche Fundstelle in einem anderen Jahrgang, ein Datum allein sind keine Evidenz.
 */
import type { BaselineDecision } from '../baseline/classify.ts';
import type { BaselineFile } from '../baseline/run.ts';
import { commencementFor, sectionRef } from './commencement.ts';
import { pageUnits, type RunContext } from './context.ts';
import { packageUrl, parseCurrentNorm, readCached } from './source.ts';
import { amendingCitations, citationMatches, commandAfterCitation, isStrongMatch } from './structure.ts';

export interface UndeterminedEvidence {
  url: string;
  citation: string;
  sha256: string;
  eventDate?: string;
  /** Wortlaut des Zitats mit Befehl. */
  statement: string;
  matched: string[];
  command: 'amend' | 'repeal';
  /** Nennt die Verkündung eine vorangehende Änderung? */
  priorClause?: string;
  effectiveDates?: string[];
}

export interface UndeterminedResult {
  documentId: string;
  before: { status: string; method: string; reason: string };
  after: { status: string; method: string; reason: string };
  changed: boolean;
  finding: string;
  evidence: UndeterminedEvidence[];
  decision?: BaselineDecision;
}

const EVIDENCE_SOURCE = 'reconstruction-undetermined';

export async function recheckUndetermined(ctx: RunContext): Promise<UndeterminedResult[]> {
  const results: UndeterminedResult[] = [];
  const postPages = [...ctx.amendingByPage.keys()].sort();
  for (const decision of ctx.baseline.decisions.filter((entry) => entry.status === 'undetermined' || entry.evidence.some((item) => item.source === EVIDENCE_SOURCE))) {
    const original = restore(decision);
    const before = { status: original.status, method: original.method, reason: original.reason };
    const source = await readCached(ctx.root, packageUrl(decision.documentId));
    if (!source) {
      results.push({ documentId: decision.documentId, before, after: before, changed: false, finding: 'Heutiges Paket nicht im Cache', evidence: [] });
      continue;
    }
    const norm = parseCurrentNorm(decision.documentId, source, ctx.evaluationDate);
    const evidence: UndeterminedEvidence[] = [];
    for (const url of postPages) {
      const units = await pageUnits(ctx, url);
      if (!units) continue;
      for (const entry of amendingCitations(units)) {
        const matched = citationMatches(entry.citation, norm.identity);
        if (!isStrongMatch(matched)) continue;
        const command = commandAfterCitation(entry.unit.text, entry.citation);
        if (!command) continue;
        const cached = await readCached(ctx.root, url);
        const event = ctx.ledger.find((item) => item.sourceUrl === url);
        const commencement = event?.eventDate ? commencementFor(units, event.eventDate, sectionRef(undefined, entry.unit.label), false) : undefined;
        evidence.push({
          url,
          citation: event?.citation ?? url,
          sha256: cached?.sha256 ?? '',
          ...(event?.eventDate ? { eventDate: event.eventDate } : {}),
          statement: entry.unit.text.slice(Math.max(0, entry.citation.anchorStart - 200), entry.citation.end + 120),
          matched,
          command: /aufgehoben/u.test(command.command) ? 'repeal' : 'amend',
          ...(command.priorClause ? { priorClause: command.priorClause } : {}),
          ...(commencement?.ok ? { effectiveDates: commencement.dates } : {}),
        });
      }
    }
    const inForce = norm.inForceFrom;
    const usable = evidence.filter((item) => item.eventDate && item.eventDate > ctx.baselineDate);
    if (usable.length === 0 || !inForce || inForce > ctx.baselineDate) {
      results.push({
        documentId: decision.documentId,
        before,
        after: before,
        changed: false,
        finding: usable.length === 0 ? 'Keine Verkündung nach dem Stichtag zitiert die Norm stark mit einem Änderungs- oder Aufhebungsbefehl; kein stark zugeordnetes Ereignis – bleibt unbestimmt' : `Der heutige Text gilt laut Paket erst seit ${inForce ?? '–'} – bleibt unbestimmt`,
        evidence,
        decision: original,
      });
      continue;
    }
    // Eine vorangehende Änderung nach dem Stichtag würde die Lücke nicht schließen.
    const first = [...usable].sort((left, right) => (left.eventDate! < right.eventDate! ? -1 : 1))[0]!;
    if (first.priorClause) {
      results.push({ documentId: decision.documentId, before, after: before, changed: false, finding: `${first.citation} nennt eine vorangehende Änderung („${first.priorClause.slice(0, 120)}“), die nicht belegt ist – bleibt unbestimmt`, evidence, decision: original });
      continue;
    }
    const textChanged = usable.some((item) => item.command === 'amend');
    const blockers = textChanged
      ? [`Geltung am Stichtag belegt; der Text wurde nach dem Stichtag geändert (${usable.filter((item) => item.command === 'amend').map((item) => `${item.citation}${item.effectiveDates ? `, Wirkung ${item.effectiveDates.join('/')}` : ''}`).join('; ')}), das Paket nennt inkraft ${inForce} – der heutige Text ist nicht der Stichtagstext, die Stichtagsfassung ist zu beschaffen`]
      : [];
    const updated: BaselineDecision = {
      ...original,
      status: 'active-at-baseline',
      method: textChanged ? 'undetermined' : original.method,
      reason: 'validity-proven-by-post-baseline-publication',
      evidence: [
        ...original.evidence,
        ...usable.map((item) => ({
          kind: 'post-baseline-event' as const,
          value: `${item.citation} (${item.eventDate}) ${item.command === 'repeal' ? 'hebt' : 'ändert'} die Norm (Zitat: ${item.matched.join('+')}, ohne vorangehende Änderung): „${item.statement.replace(/\s+/gu, ' ').slice(0, 240)}“ – ${item.url}, SHA-256 ${item.sha256}`,
          source: EVIDENCE_SOURCE,
        })),
        { kind: 'text-in-force' as const, value: inForce, source: EVIDENCE_SOURCE },
        { kind: 'post-baseline-event' as const, value: `${PREVIOUS}${JSON.stringify({ status: original.status, method: original.method, reason: original.reason, blockers: original.blockers })}`, source: EVIDENCE_SOURCE },
      ],
      blockers: textChanged ? blockers : original.blockers.filter((blocker) => !/Fortführungsnachweis|Existenz am Stichtag/u.test(blocker)),
    };
    results.push({
      documentId: decision.documentId,
      before,
      after: { status: updated.status, method: updated.method, reason: updated.reason },
      changed: true,
      finding: `Geltung am Stichtag belegt: ${first.citation} vom ${first.eventDate} ${first.command === 'repeal' ? 'hebt' : 'ändert'} die Norm (starkes Zitat: ${first.matched.join('+')}), ohne eine Änderung dazwischen zu nennen; der Text gilt laut Paket seit ${inForce}${textChanged ? '. Der Text wurde danach geändert – Methode bleibt unbestimmt' : ''}`,
      evidence,
      decision: updated,
    });
  }
  return results;
}

const PREVIOUS = 'vorherige Entscheidung: ';

/** Stellt die Entscheidung vor einem früheren Lauf wieder her (idempotent). */
function restore(decision: BaselineDecision): BaselineDecision {
  const previous = decision.evidence.find((item) => item.source === EVIDENCE_SOURCE && item.value.startsWith(PREVIOUS));
  if (!previous) return decision;
  const parsed = JSON.parse(previous.value.slice(PREVIOUS.length)) as Pick<BaselineDecision, 'status' | 'method' | 'reason' | 'blockers'>;
  return { ...decision, ...parsed, evidence: decision.evidence.filter((item) => item.source !== EVIDENCE_SOURCE) };
}

export function applyUndeterminedDecisions(baseline: BaselineFile, results: readonly UndeterminedResult[]): BaselineFile {
  const byId = new Map(results.filter((result) => result.decision).map((result) => [result.documentId, result.decision!]));
  return { ...baseline, decisions: baseline.decisions.map((decision) => byId.get(decision.documentId) ?? decision) };
}
