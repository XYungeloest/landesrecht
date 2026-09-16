/**
 * Synthetischer Skalierungsbestand für D1-Tests (`tests/unit/d1-scale.test.ts`, `scripts/d1-scale-test.ts`).
 * Erzeugt deterministisch mehrere Tausend Normen im kanonischen Modell – nur im Speicher, nie als Inhalt
 * unter `content/`. Außerdem ein inhaltlicher Fingerabdruck einer projizierten Datenbank (ohne Zeitstempel und
 * Zeilen-IDs) für die Äquivalenzprüfung inkrementell ↔ vollständig. Nur Node.
 */
import { createHash } from 'node:crypto';

import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { parseNormHistory, parseNormMeta, parseNormVersion, validateNormRecord, type NormBodyBlock, type NormRecord, type NormType } from '@landesrecht/legal-core/lib/schema.ts';

import type { SqliteD1Database } from './sqlite-d1.ts';

const WORDS = ['Behörde', 'Antrag', 'Verfahren', 'Zuständigkeit', 'Frist', 'Bescheid', 'Gemeinde', 'Aufsicht', 'Förderung', 'Prüfung', 'Maßnahme', 'Bericht', 'Genehmigung', 'Anzeige', 'Verzeichnis', 'Kosten', 'Erstattung', 'Aufgabe', 'Ausschuss', 'Landesamt', 'Datenschutz', 'Hochschule', 'Schule', 'Umwelt'];
const TYPES: readonly NormType[] = ['gesetz', 'verordnung', 'verwaltungsvorschrift', 'runderlass'];
const LABEL: Record<string, string> = { gesetz: 'Gesetz', verordnung: 'Verordnung', verwaltungsvorschrift: 'Verwaltungsvorschrift', runderlass: 'Runderlass' };

function random(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function sentence(next: () => number, words = 16): string {
  const parts: string[] = [];
  for (let index = 0; index < words; index += 1) parts.push(WORDS[Math.floor(next() * WORDS.length)]!.toLowerCase());
  const text = parts.join(' ');
  return `${text[0]!.toUpperCase()}${text.slice(1)}.`;
}

export function scaleSlug(index: number): string {
  return `skalierung-${String(index).padStart(5, '0')}-west`;
}

function body(index: number, type: NormType, revision: number, paragraphs: number): NormBodyBlock[] {
  const next = random(index * 7919 + revision * 104729);
  if (type === 'verwaltungsvorschrift' || type === 'runderlass') {
    return Array.from({ length: Math.max(2, Math.ceil(paragraphs / 3)) }, (_unused, section) => ({
      type: 'section' as const,
      label: String(section + 1),
      title: `${WORDS[(index + section) % WORDS.length]} und ${WORDS[(index * 3 + section) % WORDS.length]}`,
      children: [
        { type: 'paragraphText' as const, text: sentence(next) },
        ...Array.from({ length: 3 }, (_inner, sub) => ({ type: 'subsection' as const, label: `${section + 1}.${sub + 1}`, children: [{ type: 'paragraphText' as const, text: `${sentence(next)} ${sentence(next, 10)}` }] })),
      ],
    }));
  }
  return Array.from({ length: paragraphs }, (_unused, paragraph) => ({
    type: 'paragraph' as const,
    label: `§ ${paragraph + 1}`,
    title: `${WORDS[(index + paragraph) % WORDS.length]}`,
    children: [
      { type: 'subparagraph' as const, label: '(1)', text: sentence(next), children: [] },
      { type: 'subparagraph' as const, label: '(2)', text: `${sentence(next)} ${sentence(next, 12)}`, children: [] },
    ],
  }));
}

export interface ScaleNormOptions {
  paragraphs?: number;
  /** Textrevision (Änderung des Normkörpers). */
  revision?: number;
  /** Zusätzliche Fassung ab diesem Datum. */
  laterVersionFrom?: string;
}

export function buildScaleNorm(index: number, options: ScaleNormOptions = {}): NormRecord {
  const type = TYPES[index % TYPES.length]!;
  const slug = scaleSlug(index);
  const administrative = type === 'verwaltungsvorschrift' || type === 'runderlass';
  const title = `Skalierungsprüfung ${LABEL[type]} ${index} über ${WORDS[index % WORDS.length]} und ${WORDS[(index * 7) % WORDS.length]}`;
  const abbr = administrative ? undefined : `SkT${index}`;
  const paragraphs = options.paragraphs ?? 12;
  const citation = `${title} (synthetischer Skalierungsbestand)`;
  const secondVersionFrom = options.laterVersionFrom ?? (index % 10 === 0 ? '2025-07-01' : undefined);
  const versions: Array<Record<string, unknown>> = [{ versionId: SIMULATION_BASELINE_DATE, simulationValidFrom: SIMULATION_BASELINE_DATE, simulationValidTo: null, sourceValidFrom: '2023-01-01', citation, changeNote: 'Ausgangsfassung', body: body(index, type, options.revision ?? 0, paragraphs) }];
  if (secondVersionFrom) {
    const previousDay = new Date(`${secondVersionFrom}T00:00:00Z`);
    previousDay.setUTCDate(previousDay.getUTCDate() - 1);
    versions[0]!.simulationValidTo = previousDay.toISOString().slice(0, 10);
    versions.push({ versionId: secondVersionFrom, simulationValidFrom: secondVersionFrom, simulationValidTo: null, citation, changeNote: 'Folgefassung', body: body(index, type, (options.revision ?? 0) + 1, paragraphs) });
  }
  const meta = parseNormMeta({ id: `west:${slug}`, slug, jurisdiction: 'west', title, shortTitle: `Skalierung ${index}`, ...(abbr ? { abbr } : {}), type, status: 'in-force', subjects: ['Skalierungstest'], keywords: [], initialCitation: citation, predecessor: null, successor: null, externalIdentifiers: [{ system: 'scale-test', value: String(index) }] }, `${slug}/meta.json`);
  const history = parseNormHistory({ initialVersionId: SIMULATION_BASELINE_DATE, entries: versions.map((version, position) => ({ date: String(version.simulationValidFrom), type: position === 0 ? 'initial' : 'amendment', title: position === 0 ? 'Ausgangsfassung' : 'Änderung', citation, affectingVersionId: String(version.versionId) })) }, `${slug}/history.json`);
  return validateNormRecord({ meta, history, versions: versions.map((version) => parseNormVersion(version, `${slug}/versions/${String(version.versionId)}.json`)) }, `west/${slug}`);
}

export function buildScaleCorpus(count: number, options: Omit<ScaleNormOptions, 'revision' | 'laterVersionFrom'> = {}): NormRecord[] {
  return Array.from({ length: count }, (_unused, position) => buildScaleNorm(position + 1, options));
}

export interface ScaleMutation {
  records: NormRecord[];
  changedText: string[];
  newVersions: string[];
  added: string[];
  removed: string[];
}

/** Deterministische Änderung eines Skalierungsbestands: Textänderungen, neue Fassungen, Neuaufnahmen, Entfernungen. */
export function mutateScaleCorpus(records: readonly NormRecord[], counts: { changed: number; added: number; removed: number }): ScaleMutation {
  const kept = records.slice(0, Math.max(0, records.length - counts.removed));
  const removed = records.slice(kept.length).map((record) => record.meta.slug);
  const step = Math.max(1, Math.floor(kept.length / Math.max(1, counts.changed)));
  const changedText: string[] = [];
  const newVersions: string[] = [];
  const next = kept.map((record, position) => {
    if (position % step !== 0 || changedText.length + newVersions.length >= counts.changed) return record;
    const index = Number(record.meta.slug.match(/(\d+)/u)![1]);
    if ((changedText.length + newVersions.length) % 2 === 0 && record.versions.length === 1) {
      changedText.push(record.meta.slug);
      return buildScaleNorm(index, { revision: 7 });
    }
    newVersions.push(record.meta.slug);
    return buildScaleNorm(index, { laterVersionFrom: record.versions.length > 1 ? '2026-03-01' : '2026-01-01' });
  });
  const added = Array.from({ length: counts.added }, (_unused, offset) => buildScaleNorm(records.length + offset + 1));
  return { records: [...next, ...added], changedText, newVersions, added: added.map((record) => record.meta.slug), removed };
}

export const SNAPSHOT_TABLES = ['law_norms', 'law_versions', 'law_version_blocks', 'law_source_objects', 'law_norm_history', 'law_norm_relations', 'law_norm_subjects', 'law_external_identifiers', 'law_search_units', 'law_runtime_meta'] as const;
const VOLATILE_COLUMNS = new Set(['id', 'updated_at']);
const VOLATILE_META_KEYS = new Set(['last_projected_at']);

/** Inhaltlicher Fingerabdruck je Tabelle (ohne Zeilen-IDs, Zeitstempel und Projektionszeitpunkt). */
export function snapshotDatabase(db: SqliteD1Database): Record<string, { rows: number; sha256: string }> {
  const snapshot: Record<string, { rows: number; sha256: string }> = {};
  for (const table of SNAPSHOT_TABLES) {
    const columns = (db.native.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name).filter((name) => !VOLATILE_COLUMNS.has(name));
    const rows = db.native.prepare(`SELECT ${columns.join(', ')} FROM ${table} ORDER BY ${columns.join(', ')}`).all() as Array<Record<string, unknown>>;
    const relevant = table === 'law_runtime_meta' ? rows.filter((row) => !VOLATILE_META_KEYS.has(String(row.key))) : rows;
    const hash = createHash('sha256');
    for (const row of relevant) hash.update(`${JSON.stringify(columns.map((column) => row[column]))}\n`);
    snapshot[table] = { rows: relevant.length, sha256: hash.digest('hex') };
  }
  return snapshot;
}
