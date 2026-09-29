/**
 * Getrenntes Sim-Statusmodell (docs/SIMULATION_IMPORT.md, Abschnitt 7.2): berechnet Blattabdeckung, Einzelakt-Abdeckung,
 * Evidenzlücken, mögliche Lücken und Ereigniszahlen aus `completeness.json` und dem Ledger des Landes. Der Gesamtstatus
 * ist streng: COMPLETE nur ohne fehlende Ausgabe (A), ohne fehlenden Einzelakt (B), ohne unvollständige Evidenz (C) und
 * ohne Ereignis, das aus Quellengründen in Prüfung oder gesperrt ist. Mögliche Lücken (D) sperren nie – hypothetische
 * Veröffentlichungen müssen nicht widerlegt werden. Der in der Datei erklärte Status muss dem berechneten entsprechen.
 */
import type { SimulationSourceStatus } from '@landesrecht/legal-core/config/inventory-status.ts';

import { CompletenessValidationError, type CompletenessFile } from './schema.ts';

/** Gründe, aus denen ein Ereignis wegen der Quelle (nicht wegen Bestand oder Inhalt) offen ist. */
export const SOURCE_REASON_CODES: readonly string[] = ['missing-source', 'promulgation-unclear', 'effective-date-undetermined', 'draft-only'];

export interface AssessmentEvent {
  id: string;
  status: string;
  eventDate?: string | null;
  reasonCode?: string;
  targets?: Array<{ slug?: string; title?: string }>;
}

export interface SourceAssessmentOptions {
  /** Ob eine Norm eine Fassung am Ausgangsrechtsstand hat (Bestand); prüft `missing-baseline-target` fail-closed. */
  hasBaselineVersion?: (slug: string) => boolean;
}

export interface SourceAssessment {
  sources: SimulationSourceStatus;
  /** Warum der Gesamtstatus PARTIAL ist (leer bei COMPLETE). */
  partialReasons: string[];
}

export function assessSimulationSources(file: CompletenessFile, events: readonly AssessmentEvent[], options: SourceAssessmentOptions = {}): SourceAssessment {
  const path = `data/simulation/${file.jurisdiction}/completeness.json`;
  const eventIds = new Set(events.map((event) => event.id));
  for (const gap of file.sourceGaps) {
    for (const id of gap.blocks.events) if (!eventIds.has(id)) throw new CompletenessValidationError(`${path}: Lücke ${gap.id} nennt unbekanntes Ledger-Ereignis ${id}`);
  }
  const byClass = (kind: string) => file.sourceGaps.filter((gap) => gap.class === kind);
  // Klasse A ohne Blattreihe: angekündigte Ausgabe, die in keiner Nummernfolge steht – zählt zusätzlich als bekannt.
  const announced = byClass('gazette-issue-missing').filter((gap) => gap.series === undefined).length;
  const knownIssues = file.series.reduce((sum, entry) => sum + entry.knownIssues.length, 0) + announced;
  const presentIssues = file.series.reduce((sum, entry) => sum + entry.presentIssues.length, 0);
  const missingIssues = knownIssues - presentIssues;
  const suspiciousIssues = file.series.reduce((sum, entry) => sum + entry.suspiciousIssues.length, 0);
  const standaloneMissing = byClass('standalone-act-missing').length;
  const evidenceIncomplete = byClass('evidence-incomplete').length;

  const counts = { applied: 0, pending: 0, review: 0, blocked: 0, notPromulgated: 0 };
  const byReason: Record<string, number> = {};
  let sourceCaused = 0;
  let baselineEvents = 0;
  const excluded = new Set<string>();
  const outside = new Set<string>();
  let lastSourceDate: string | null = null;
  for (const event of events) {
    if (event.status === 'applied') counts.applied += 1;
    else if (event.status === 'pending') counts.pending += 1;
    else if (event.status === 'review') counts.review += 1;
    else if (event.status === 'blocked') counts.blocked += 1;
    else if (event.status === 'not-promulgated') counts.notPromulgated += 1;
    else throw new CompletenessValidationError(`ledger ${file.jurisdiction}: Ereignis ${event.id} hat unbekannten Status ${event.status}`);
    if (event.status === 'review' || event.status === 'blocked') {
      const reason = event.reasonCode ?? 'ohne-reasonCode';
      byReason[reason] = (byReason[reason] ?? 0) + 1;
      if (SOURCE_REASON_CODES.includes(reason)) sourceCaused += 1;
    }
    if (event.status === 'blocked' && event.reasonCode === 'missing-baseline-target') {
      baselineEvents += 1;
      for (const target of event.targets ?? []) {
        if (target.slug) {
          // `missing-baseline-target` heißt: Ziel steht nicht im eingefrorenen Ausgangsbestand. Steht es doch darin, ist
          // der Grund falsch – nie still übergehen, nie während eines Sim-Laufs einfügen.
          if (options.hasBaselineVersion?.(target.slug)) throw new CompletenessValidationError(`ledger ${file.jurisdiction}: ${event.id}: Ziel ${target.slug} steht im Ausgangsbestand, reasonCode missing-baseline-target ist falsch`);
          excluded.add(target.slug);
        } else outside.add(target.title ?? event.id);
      }
    }
    if (event.status !== 'not-promulgated' && event.eventDate && (lastSourceDate === null || event.eventDate > lastSourceDate)) lastSourceDate = event.eventDate;
  }

  const partialReasons: string[] = [];
  if (missingIssues > 0) partialReasons.push(`${missingIssues} bekannte Blattausgabe(n) fehlen`);
  if (standaloneMissing > 0) partialReasons.push(`${standaloneMissing} belegte Einzelverkündung(en) fehlen`);
  if (evidenceIncomplete > 0) partialReasons.push(`${evidenceIncomplete} Quelle(n) mit unvollständiger Evidenz`);
  if (sourceCaused > 0) partialReasons.push(`${sourceCaused} Ereignis(se) aus Quellengründen in Prüfung oder gesperrt`);
  const simulationStatus = partialReasons.length === 0 ? 'COMPLETE' : 'PARTIAL';

  if (simulationStatus === 'PARTIAL' && file.status !== 'SIM SOURCES PARTIAL') throw new CompletenessValidationError(`${path}: status ${file.status}, berechnet PARTIAL (${partialReasons.join('; ')})`);
  if (simulationStatus === 'COMPLETE' && file.status === 'SIM SOURCES PARTIAL') throw new CompletenessValidationError(`${path}: status SIM SOURCES PARTIAL, berechnet COMPLETE – Status fortschreiben`);
  if (file.status === 'SIM LEGAL STATE COMPLETE' && counts.review + counts.blocked > 0) throw new CompletenessValidationError(`${path}: SIM LEGAL STATE COMPLETE verträgt keine Ereignisse in Prüfung oder Sperre (${counts.review + counts.blocked})`);

  return {
    sources: {
      simulationStatus,
      gazetteCoverage: { status: missingIssues === 0 ? 'COMPLETE' : 'PARTIAL', knownIssues, presentIssues, missingIssues, suspiciousIssues },
      standaloneSourceCoverage: { status: standaloneMissing === 0 ? 'COMPLETE' : 'PARTIAL', present: file.standaloneActs.present, evidenceOnly: file.standaloneActs.evidenceOnly, missing: standaloneMissing },
      missingSourceCount: missingIssues + standaloneMissing,
      evidenceIncompleteCount: evidenceIncomplete,
      possibleGapCount: byClass('possible-gap').length,
      knownUnclearPeriods: file.unclearPeriods.length,
      events: {
        total: events.length,
        ...counts,
        sourceCaused,
        blockedByBaselineTarget: { events: baselineEvents, targets: excluded.size + outside.size, excludedFromFrozenBaseline: excluded.size, notInBaselineInventory: outside.size },
        byReason: Object.fromEntries(Object.entries(byReason).sort(([a, x], [b, y]) => y - x || a.localeCompare(b))),
      },
      lastSourceDate,
    },
    partialReasons,
  };
}
