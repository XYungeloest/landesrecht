/**
 * Gemeinsamer Ausgangszustand eines Rückrechnungslaufs (Rückrechnung und gezielter Abruf): Stichtagsentscheidungen,
 * Ereignisregister, Fortführungsnachweise, Detailseiten nach dem Stichtag. Nur Dateien und Cache, kein Netz.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { BASELINE_PATH, EVENT_LEDGER_PATH, type BaselineFile } from '../baseline/run.ts';
import { BASELINE_DATE, EVALUATION_DATE, IMPORT_DATA_DIR } from '../common/constants.ts';
import { gazetteUnits, type GazetteUnit } from './gazette.ts';
import { publicationKey } from './pages.ts';
import { readCached } from './source.ts';
import { amendingCitations, type NormCitation } from './structure.ts';
import type { Platform } from '../baseline-only/platform.ts';
import type { FormConventions } from './restore.ts';
import type { WalkLedgerEvent } from './walk.ts';

/** Ereignis des Registers, soweit die Rückrechnung es braucht. */
export interface LedgerRecord extends WalkLedgerEvent {
  sourceSha256?: string;
  effectiveDate?: string;
  subtype?: string;
  targetResolution?: { status?: string; matchStrength?: string; sourceIdentity?: string };
}

export interface RunContext {
  root: string;
  baselineDate: string;
  evaluationDate: string;
  baseline: BaselineFile;
  ledger: LedgerRecord[];
  /** Änderungsnotizen des Fortführungsnachweises je Norm. */
  registerNotes: Map<string, string[]>;
  postBaselinePublications: Set<string>;
  /** Ein Ereignis je Veröffentlichung (für das Verkündungsdatum). */
  ledgerByPublication: Map<string, LedgerRecord>;
  /** Stark zugeordnete Ereignisse nach dem Stichtag je Norm, chronologisch. */
  eventsByDocument: Map<string, LedgerRecord[]>;
  /** Je Detailseite nach dem Stichtag die Normzitate mit Änderungsbefehl. */
  amendingByPage: Map<string, NormCitation[]>;
  units: Map<string, GazetteUnit[]>;
  /** Verkündungsplattform aus dem Cache (Stammverkündungen, Lauf 7); angelegt beim ersten Gebrauch. */
  platform?: Platform;
  /** Darstellungskonventionen des Portals je Amtsblatt (Lauf 7, `portalConventions`). */
  conventions?: FormConventions;
}

const DETAIL_URL = /^https:\/\/www\.verkuendung-bayern\.de\/(gvbl|baymbl)\/(\d{4})-(\d+)\/$/u;

export async function loadRunContext(root: string, options: { baselineDate?: string; evaluationDate?: string } = {}): Promise<RunContext> {
  const baselineDate = options.baselineDate ?? BASELINE_DATE;
  const evaluationDate = options.evaluationDate ?? EVALUATION_DATE;
  const baseline = JSON.parse(await readFile(join(root, BASELINE_PATH), 'utf8')) as BaselineFile;
  const ledger = (JSON.parse(await readFile(join(root, EVENT_LEDGER_PATH), 'utf8')) as { events: LedgerRecord[] }).events;
  const postBaseline = ledger.filter((event) => (event.eventDate ?? '') > baselineDate);
  const postBaselinePublications = new Set<string>();
  const ledgerByPublication = new Map<string, LedgerRecord>();
  for (const event of ledger) {
    const match = DETAIL_URL.exec(event.sourceUrl) ?? /^(GVBl|BayMBl)\.\s*(\d{4})\s*(?:S\.|Nr\.)\s*(\d+)/u.exec(event.citation);
    if (!match) continue;
    const key = publicationKey({ organ: match[1]!.toLowerCase() === 'gvbl' ? 'gvbl' : 'baymbl', volume: Number(match[2]), position: Number(match[3]) });
    if (!ledgerByPublication.has(key)) ledgerByPublication.set(key, event);
    if ((event.eventDate ?? '') > baselineDate) postBaselinePublications.add(key);
  }
  const registerNotes = new Map<string, string[]>();
  for (const file of ['enumeration-landesrecht.json', 'enumeration-vwv.json']) {
    try {
      const parsed = JSON.parse(await readFile(join(root, IMPORT_DATA_DIR, file), 'utf8')) as { items?: Array<{ documentId?: string; changeNotes?: string[] }> };
      for (const item of parsed.items ?? []) if (item.documentId && item.changeNotes && item.changeNotes.length > 0) registerNotes.set(item.documentId, item.changeNotes);
    } catch {
      // Ohne Enumeration fehlt nur eine der Gegenproben.
    }
  }
  const eventsByDocument = new Map<string, LedgerRecord[]>();
  for (const event of postBaseline) {
    const resolution = event.targetResolution;
    if (resolution?.status !== 'resolved' || resolution.matchStrength !== 'strong' || !resolution.sourceIdentity) continue;
    eventsByDocument.set(resolution.sourceIdentity, [...(eventsByDocument.get(resolution.sourceIdentity) ?? []), event]);
  }
  for (const list of eventsByDocument.values()) list.sort((left, right) => (left.eventDate! < right.eventDate! ? -1 : left.eventDate! > right.eventDate! ? 1 : left.id < right.id ? -1 : 1));
  const ctx: RunContext = { root, baselineDate, evaluationDate, baseline, ledger, registerNotes, postBaselinePublications, ledgerByPublication, eventsByDocument, amendingByPage: new Map(), units: new Map() };
  for (const url of [...new Set(postBaseline.map((event) => event.sourceUrl).filter((url) => DETAIL_URL.test(url)))].sort()) {
    const units = await pageUnits(ctx, url);
    if (!units) continue;
    ctx.amendingByPage.set(url, amendingCitations(units).map((entry) => entry.citation));
  }
  return ctx;
}

export async function pageUnits(ctx: Pick<RunContext, 'root' | 'units'>, url: string): Promise<GazetteUnit[] | undefined> {
  if (ctx.units.has(url)) return ctx.units.get(url);
  const cached = await readCached(ctx.root, url);
  if (!cached) return undefined;
  const units = gazetteUnits(new TextDecoder().decode(cached.bytes));
  ctx.units.set(url, units);
  return units;
}
