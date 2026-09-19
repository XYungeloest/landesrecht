/**
 * Stichprobe des Vollwegs (Befehl `sample`): repräsentative Normen je Familie über den öffentlichen
 * PDF-Ausgabeweg abrufen (Cache, anonyme Sitzung eines Permalink-Aufrufs), parsen, überleiten, validieren und
 * die Textintegrität prüfen. Schreibt keine Normen – nur den Bericht.
 */
import { join } from 'node:path';

import { readJsonFile, writeFileAtomic, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';

import { AUDIT_DIR, TARGET_JURISDICTION } from '../common/constants.ts';
import { createExportClient, ExportError, pdfExportUrl, type ExportClientOptions } from '../export/client.ts';
import { readInstitutionRegistry } from '../transform/institution-registry.ts';
import { processDocument, type DocumentResult } from './document.ts';
import { createJurisShFetcher } from '../common/fetcher.ts';
import { loadUnits, sitemapUnits } from './units.ts';
import { readKnownStateAbbreviations } from './abbreviations.ts';
import { gazetteVolumesFromLedger } from '../parse/source-law.ts';

/** Stichprobe: Einzelfassungen nur für Rahmendokumente bis zu dieser Zahl von Einheiten (große folgen im Vollkorpus). */
export const SAMPLE_UNIT_LIMIT = 100;

export const SAMPLE_PATH = `${AUDIT_DIR}/sample.json`;
export const SAMPLE_REPORT_PATH = `${AUDIT_DIR}/SAMPLE_REPORT.md`;
export const SAMPLE_SCHEMA = 'juris-sh-sample/1' as const;

export interface SampleNorm {
  id: string;
  area: 'landesrecht' | 'vwv';
  /** Warum die Norm in der Stichprobe ist (Familie, Merkmal). */
  purpose: string;
}

/** 38 Normen: gezielte Fälle aus Suchindex und Permalink-Auflösung sowie eine Schichtung über die Sitemap. */
export const SAMPLE_NORMS: readonly SampleNorm[] = [
  { id: 'jlr-NNLSH00002D11', area: 'landesrecht', purpose: 'Landesverfassung' },
  { id: 'jlr-NNLSH00002B40', area: 'landesrecht', purpose: 'Gesetz, groß, Änderungshistorie (Fassungen V57/V69)' },
  { id: 'jlr-NNLSH00002AAF', area: 'landesrecht', purpose: 'Gesetz, groß, amtliche Inhaltsübersicht' },
  { id: 'jlr-NNLSH00002E60', area: 'landesrecht', purpose: 'Gesetz mit Abbildungen (Karten)' },
  { id: 'jlr-NNLSH00002DF2', area: 'landesrecht', purpose: 'Gesetz' },
  { id: 'jlr-NNLSH00002A85', area: 'landesrecht', purpose: 'Gesetz, größtes Rahmendokument, Tabellen (Besoldungsordnungen)' },
  { id: 'jlr-NNLSH00002AC8', area: 'landesrecht', purpose: 'Gesetz (Schichtung Sitemap)' },
  { id: 'jlr-NNLSH00002C9A', area: 'landesrecht', purpose: 'Zustimmungsgesetz zu einem Länderabkommen (Staatsvertrag-Fall)' },
  { id: 'jlr-NNLSH00002B25', area: 'landesrecht', purpose: 'Verordnung mit Anlagen/Tabellen (Gebührentarif)' },
  { id: 'jlr-NNLSH00002BC4', area: 'landesrecht', purpose: 'Verordnung, historisch geändert (§ 5 Fassung V7 galt am Stichtag)' },
  { id: 'jlr-NNLSH00002AA1', area: 'landesrecht', purpose: 'Verordnung mit Zukunftsfassung' },
  { id: 'jlr-NNLSH00002B00', area: 'landesrecht', purpose: 'Verordnung' },
  { id: 'jlr-NNLSH00002D22', area: 'landesrecht', purpose: 'Verordnung, nach dem Stichtag erlassen' },
  { id: 'jlr-NNLSH00003321', area: 'landesrecht', purpose: 'Verordnung, klein' },
  { id: 'jlr-NNLSH00003328', area: 'landesrecht', purpose: 'Verordnung mit Titelfußnote' },
  { id: 'jlr-NNLSH00002CFB', area: 'landesrecht', purpose: 'Verordnung (Schichtung)' },
  { id: 'jlr-NNLSH00002DB8', area: 'landesrecht', purpose: 'Verordnung (Schichtung)' },
  { id: 'jlr-NNLSH00003099', area: 'landesrecht', purpose: 'Verordnung (Schichtung)' },
  { id: 'jlr-NNLSH000035A5', area: 'landesrecht', purpose: 'Verordnung, einseitig (Schichtung)' },
  { id: 'jlr-NNLSH00002B72', area: 'landesrecht', purpose: 'Verordnung (Schichtung)' },
  { id: 'jlr-NNLSH00002E58', area: 'landesrecht', purpose: 'Verordnung (Schichtung)' },
  { id: 'jlr-NNLSH00003051', area: 'landesrecht', purpose: 'Naturschutzverordnung mit Karten' },
  { id: 'jlr-NNLSH000032A6', area: 'landesrecht', purpose: 'Naturschutzverordnung mit Karte (Schichtung)' },
  { id: 'jlr-NNLSH00003577', area: 'landesrecht', purpose: 'Verordnung mit Karte (Schichtung)' },
  { id: 'jlr-NNLSH00002B66', area: 'landesrecht', purpose: 'aufgehoben nach dem Stichtag (baseline-only-Kandidat 2011-0-21)' },
  { id: 'jlr-NNLSH00002D40', area: 'landesrecht', purpose: 'aufgehoben nach dem Stichtag (gültig bis 2024-08-30)' },
  { id: 'jlr-NNLSH00002D66', area: 'landesrecht', purpose: 'aufgehobene Verordnung (baseline-only-Kandidat 2030-16-34)' },
  { id: 'jlr-NNLSH00002F02', area: 'landesrecht', purpose: 'aufgehobene Verordnung' },
  { id: 'jlr-NNLSH00002F8C', area: 'landesrecht', purpose: 'aufgehobene Verordnung (Schichtung)' },
  { id: 'jlr-NNLSH00002FFF', area: 'landesrecht', purpose: 'aufgehobene Verordnung (Schichtung)' },
  { id: 'jlr-NNLSH000033AF', area: 'landesrecht', purpose: 'aufgehoben 2020' },
  { id: 'jlr-NNLSH0000312E', area: 'landesrecht', purpose: 'aufgehobene Verordnung (Schichtung)' },
  { id: 'jlr-NNLSH0000350B', area: 'landesrecht', purpose: 'aufgehobene Verordnung (Schichtung)' },
  { id: 'VVSH-VVSH000004586', area: 'vwv', purpose: 'Verwaltungsvorschrift (Runderlass) mit Fußnote' },
  { id: 'VVSH-VVSH000000003', area: 'vwv', purpose: 'Verwaltungsvorschrift (Bekanntmachung)' },
  { id: 'VVSH-VVSH000001829', area: 'vwv', purpose: 'Verwaltungsvorschrift (Richtlinie, Schichtung)' },
  { id: 'VVSH-VVSH000007253', area: 'vwv', purpose: 'Anlage einer Verwaltungsvorschrift als eigenes Dokument' },
  { id: 'VVSH-VVSH000010460', area: 'vwv', purpose: 'Verwaltungsvorschrift nach dem Stichtag, befristet' },
];

export interface SampleReport {
  schemaVersion: typeof SAMPLE_SCHEMA;
  baselineDate: string;
  norms: Array<Omit<DocumentResult, 'record'> & { purpose: string }>;
  totals: Record<string, number>;
  integrity: Record<string, number>;
  network: { requests: number; cacheHits: number; sessionsOpened: number };
}

export interface SampleOptions {
  root: string;
  write: boolean;
  offline: boolean;
  cacheDir?: string;
  log?: (line: string) => void;
  client?: ExportClientOptions;
}

export async function runSample(options: SampleOptions): Promise<{ report: SampleReport; results: DocumentResult[]; written: string[] }> {
  const log = options.log ?? ((): void => undefined);
  const client = createExportClient({ root: options.root, offline: options.offline, budget: { maxRequests: 600 }, ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}), ...options.client });
  const institutions = await readInstitutionRegistry(options.root);
  const reserved = new Set<string>();
  const context = {
    targetJurisdiction: TARGET_JURISDICTION,
    baselineDate: SIMULATION_BASELINE_DATE,
    reserveSlug: (candidate: string): string => {
      let slug = candidate;
      let suffix = 2;
      while (reserved.has(slug)) slug = `${candidate}-${suffix++}`;
      reserved.add(slug);
      return slug;
    },
  };
  const results: DocumentResult[] = [];
  const norms: SampleReport['norms'] = [];
  const knownStateAbbreviations = await readKnownStateAbbreviations(options.root);
  const ledger = await readJsonFile<{ sources: Array<{ id: string; url: string; sha256: string }> }>(join(options.root, 'data/imports/juris-sh/events/ledger.json'));
  const gazetteVolumes = gazetteVolumesFromLedger(ledger?.sources ?? []);
  const unitsByFrame = await sitemapUnits(createJurisShFetcher({ root: options.root, offline: options.offline, ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}) }));
  for (const norm of SAMPLE_NORMS) {
    let result: DocumentResult;
    try {
      const pdf = await client.pdf(norm.id, 'gesamtausgabe');
      const document = { documentId: norm.id, area: norm.area, url: pdfExportUrl(norm.id, 'gesamtausgabe'), sha256: pdf.sha256, retrievedAt: pdf.retrievedAt, byteLength: pdf.bytes.byteLength } as const;
      result = processDocument(pdf.bytes, document, { institutions, context, knownStateAbbreviations, gazetteVolumes });
      const unitIds = unitsByFrame.get(norm.id) ?? [];
      if (result.outcome === 'reconstruction' && unitIds.length > 0 && unitIds.length <= SAMPLE_UNIT_LIMIT) {
        reserved.delete(result.slug ?? '');
        result = processDocument(pdf.bytes, document, { institutions, context, units: await loadUnits(client, unitIds), knownStateAbbreviations, gazetteVolumes });
      }
    } catch (error) {
      if (!(error instanceof ExportError)) throw error;
      result = { documentId: norm.id, area: norm.area, outcome: 'failed', reasons: [error.message], blockers: [{ kind: 'schema', code: error.code, detail: error.message }], warnings: [], findings: [], raw: { url: pdfExportUrl(norm.id, 'gesamtausgabe'), sha256: '', byteLength: 0, retrievedAt: '' } };
    }
    results.push(result);
    const { record: _record, ...rest } = result;
    norms.push({ ...rest, purpose: norm.purpose });
    log(`${norm.id} ${result.outcome.padEnd(15)} ${result.integrity?.class ?? '-'} ${(result.title ?? '').slice(0, 60)}${result.reasons.length ? ` · ${result.reasons.join(' | ').slice(0, 160)}` : ''}`);
  }
  const totals: Record<string, number> = {};
  const integrity: Record<string, number> = {};
  for (const result of results) {
    totals[result.outcome] = (totals[result.outcome] ?? 0) + 1;
    if (result.integrity) integrity[result.integrity.class] = (integrity[result.integrity.class] ?? 0) + 1;
  }
  const report: SampleReport = {
    schemaVersion: SAMPLE_SCHEMA,
    baselineDate: SIMULATION_BASELINE_DATE,
    norms,
    totals,
    integrity,
    network: { requests: client.stats.network.networkRequests, cacheHits: client.stats.network.cacheHits, sessionsOpened: client.stats.client.sessionsOpened },
  };
  const written: string[] = [];
  if (options.write) {
    // Laufzeitwerte (Abrufzeit) bleiben im Bericht; ein Wiederholungslauf aus dem Cache ändert ihn nicht.
    const previous = await readJsonFile<SampleReport>(join(options.root, SAMPLE_PATH));
    const stable = { ...report, network: previous && report.network.requests === 0 ? previous.network : report.network };
    if (await writeJsonAtomic(join(options.root, SAMPLE_PATH), stable)) written.push(SAMPLE_PATH);
    const { renderSampleReport } = await import('../reports/render.ts');
    if (await writeFileAtomic(join(options.root, SAMPLE_REPORT_PATH), renderSampleReport(stable))) written.push(SAMPLE_REPORT_PATH);
  }
  return { report, results, written };
}
