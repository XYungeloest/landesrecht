/**
 * Stichtagsklassifikation über den Bestand: Welche Normen galten am **2023-12-01**, und bei welchen
 * ist der heutige Text zugleich der Stichtagstext?
 *
 * Ergebnis: `data/imports/bayernrecht/baseline.json` – je aufzunehmender Norm genau eine Entscheidung
 * mit maschinenlesbarer Begründung und Belegkette. Das ist der `decisionTrace`, den jede importierte
 * Norm später vorweisen muss.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { BASELINE_DATE, CACHE_DIR, IMPORT_DATA_DIR } from '../common/constants.ts';
import { parseBayernRechtPackage } from '../parse/index.ts';
import type { NormHead } from '../parse/norm.ts';
import type { VvHead } from '../parse/vv.ts';
import { readScopeOverrides } from '../scope/run.ts';
import { citationDates } from './citation-dates.ts';
import { classifyBaseline, type BaselineClass, type BaselineDecision, type BaselineStatus, type RecoveryMethod } from './classify.ts';

export const BASELINE_PATH = join(IMPORT_DATA_DIR, 'baseline.json');
export const SCOPE_FILE_PATH = join(IMPORT_DATA_DIR, 'scope.json');
export const EVENT_LEDGER_PATH = join(IMPORT_DATA_DIR, 'events', 'ledger.json');

export interface BaselineFile {
  schemaVersion: 'bayernrecht-baseline/1';
  baselineDate: string;
  evaluationDate: string;
  totals: {
    candidates: number;
    examined: number;
    notCached: number;
    unreadable: number;
    byClass: Record<string, number>;
    /** Normen mit mindestens einem stark zugeordneten Ereignis nach dem Stichtag. */
    withPostBaselineEvents: number;
    byStatus: Record<string, number>;
    byMethod: Record<string, number>;
    /** Woher das Ausfertigungsdatum stammt – die VwV-DTD führt es nicht als Feld. */
    issueDateSource: Record<string, number>;
  };
  decisions: BaselineDecision[];
}

/** Ein Ereignis des Registers, soweit die Stichtagsprüfung es braucht. */
interface LedgerEvent {
  eventType: string;
  eventDate?: string;
  citation?: string;
  evidenceStrength?: string;
  targetResolution?: { status?: string; sourceIdentity?: string; matchStrength?: string };
}

/**
 * Ereignisse nach dem Stichtag, nach der Norm gruppiert, die sie betreffen.
 *
 * Nur **stark** aufgelöste Zuordnungen zählen. Eine schwache Zuordnung als Beleg zu führen hieße,
 * eine Rekonstruktion auf eine Vermutung zu stützen – und ein falsch zugeordnetes Ereignis ändert
 * die Stichtagsklasse einer unbeteiligten Norm.
 */
export async function readPostBaselineEvents(root: string): Promise<Map<string, LedgerEvent[]>> {
  const byDocument = new Map<string, LedgerEvent[]>();
  let raw: string;
  try {
    raw = await readFile(join(root, EVENT_LEDGER_PATH), 'utf8');
  } catch {
    return byDocument;
  }
  const parsed = JSON.parse(raw) as { events?: LedgerEvent[] };
  for (const event of parsed.events ?? []) {
    const resolution = event.targetResolution;
    if (resolution?.status !== 'resolved' || resolution.matchStrength !== 'strong') continue;
    const target = resolution.sourceIdentity;
    if (!target) continue;
    const list = byDocument.get(target);
    if (list) list.push(event);
    else byDocument.set(target, [event]);
  }
  return byDocument;
}

const cacheKey = (url: string): string => createHash('sha256').update(url).digest('hex').slice(0, 40);

/**
 * Datumsangaben aus dem Kopf – beide DTDs führen unterschiedliche Felder.
 *
 * Dass `VvHead` kein `documentDate` kennt, ist keine Lücke der Typen, sondern der Quelle: Die
 * VwV-DTD führt das Ausfertigungsdatum nicht als Feld. Genau deshalb wird es dort aus dem
 * Zitiervorschlag abgeleitet.
 */
function headDates(head: NormHead | VvHead): { documentDate?: string; inForceFrom?: string; versionDate?: string; issueYear?: string } {
  const inForceFrom = head.inForceFrom;
  // Unterschieden wird an `gazette`: Das Feld führt nur die VwV-DTD. An `documentDate` ließe sich
  // nicht unterscheiden – es ist auf `NormHead` optional, ein Fehlen also kein Merkmal.
  if ('gazette' in head) {
    // Die VwV-DTD führt kein Ausfertigungsdatum, wohl aber den Jahrgang des Verkündungsorgans.
    // Er ist kein Datum, entscheidet die Stichtagsfrage aber überall dort, wo er den Stichtag nicht
    // umschließt.
    const issueYear = head.gazette?.year;
    return {
      ...(inForceFrom ? { inForceFrom } : {}),
      ...(issueYear ? { issueYear } : {}),
    };
  }
  return {
    ...(head.documentDate ? { documentDate: head.documentDate } : {}),
    ...(inForceFrom ? { inForceFrom } : {}),
    ...(head.versionDate ? { versionDate: head.versionDate } : {}),
  };
}

export interface BuildBaselineOptions {
  evaluationDate: string;
  /** Höchstens so viele Kandidaten prüfen (Probelauf). */
  limit?: number;
}

export async function buildBaseline(root: string, options: BuildBaselineOptions): Promise<BaselineFile> {
  const scope = JSON.parse(await readFile(join(root, SCOPE_FILE_PATH), 'utf8')) as {
    entries: Array<{ documentId: string; decision: string }>;
  };
  const overrides = await readScopeOverrides(root);
  const eventsByDocument = await readPostBaselineEvents(root);
  const candidates = scope.entries.filter((entry) => entry.decision === 'include');
  const decisions: BaselineDecision[] = [];
  const issueDateSource: Record<string, number> = { xml: 0, citation: 0, none: 0 };
  let notCached = 0;
  let unreadable = 0;

  for (const entry of candidates.slice(0, options.limit ?? candidates.length)) {
    const url = `https://www.gesetze-bayern.de/Content/Zip/${entry.documentId}`;
    let bytes: Buffer;
    try {
      bytes = await readFile(join(root, CACHE_DIR, `${cacheKey(url)}.bin`));
    } catch {
      notCached += 1;
      continue;
    }
    try {
      const doc = parseBayernRechtPackage(
        { portal: 'bayernrecht', url, sha256: '', retrievedAt: options.evaluationDate, contentType: 'application/zip', bytes: 0 } as never,
        new Uint8Array(bytes),
        { unknown: 'report' },
      );
      // Die Norm-DTD führt das Ausfertigungsdatum als Feld, die VwV-DTD nicht. Dort steht es im
      // Zitiervorschlag – eine Ableitung aus Prosa, die als solche kenntlich bleibt.
      const fromCitation = citationDates(doc.law.citation);
      const dates = headDates(doc.head);
      const documentDate = dates.documentDate ?? fromCitation.issueDate;
      const source = dates.documentDate ? 'xml' : fromCitation.issueDate ? 'citation' : 'none';
      issueDateSource[source] = (issueDateSource[source] ?? 0) + 1;
      const decision = classifyBaseline({
        documentId: entry.documentId,
        ...(documentDate ? { documentDate } : {}),
        ...(dates.inForceFrom ? { inForceFrom: dates.inForceFrom } : {}),
        ...(dates.versionDate ? { versionDate: dates.versionDate } : {}),
        ...(dates.issueYear ? { issueYear: dates.issueYear } : {}),
        ...(overrides.get(entry.documentId)?.registerAbsent ? { registerAbsent: true } : {}),
        ...(eventsByDocument.has(entry.documentId)
          ? {
              postBaselineEvents: eventsByDocument.get(entry.documentId)!.map((event) => ({
                type: event.eventType,
                date: event.eventDate ?? '',
                ...(event.citation ? { citation: event.citation } : {}),
              })),
            }
          : {}),
      });
      if (!dates.documentDate && fromCitation.issueDate) {
        decision.evidence.push({ kind: 'issue-date', value: fromCitation.issueDate, source: 'citation:Zitiervorschlag' });
      }
      if (fromCitation.lastAmendmentDate) {
        decision.evidence.push({ kind: 'change-note', value: fromCitation.lastAmendmentDate, source: 'citation:zuletzt geändert' });
      }
      decisions.push(decision);
    } catch {
      unreadable += 1;
    }
  }

  decisions.sort((left, right) => (left.documentId < right.documentId ? -1 : left.documentId > right.documentId ? 1 : 0));
  const byClass: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byMethod: Record<string, number> = {};
  for (const decision of decisions) {
    byClass[decision.class as BaselineClass] = (byClass[decision.class] ?? 0) + 1;
    byStatus[decision.status as BaselineStatus] = (byStatus[decision.status] ?? 0) + 1;
    byMethod[decision.method as RecoveryMethod] = (byMethod[decision.method] ?? 0) + 1;
  }

  const withPostBaselineEvents = decisions.filter((decision) => decision.evidence.some((entry) => entry.kind === 'post-baseline-event')).length;
  return {
    schemaVersion: 'bayernrecht-baseline/1',
    baselineDate: BASELINE_DATE,
    evaluationDate: options.evaluationDate,
    totals: { candidates: candidates.length, examined: decisions.length, notCached, unreadable, byClass, withPostBaselineEvents, byStatus, byMethod, issueDateSource },
    decisions,
  };
}

export async function writeBaseline(root: string, file: BaselineFile): Promise<boolean> {
  return writeJsonAtomic(join(root, BASELINE_PATH), file);
}

/** Normen, deren heutiger Text zugleich der Stichtagstext ist – der Teil ohne Rekonstruktionsbedarf. */
export function directlyImportable(file: BaselineFile): string[] {
  return file.decisions
    .filter((decision) => decision.status === 'active-at-baseline' && decision.method === 'current-unchanged' && decision.blockers.length === 0)
    .map((decision) => decision.documentId);
}
