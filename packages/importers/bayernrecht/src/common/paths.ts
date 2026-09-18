/**
 * Ableitung aller Zustandspfade des BAYERN.RECHT-Adapters aus Quellbereich und Quellidentität.
 *
 * Alles, was der Adapter schreibt, liegt unter `data/imports/bayernrecht/` (fachlicher Zustand) und
 * `data/audits/bayernrecht/` (Auswertungen, Laufberichte). Wie bei RECHT.NRW/West und juris-SH/NSH ist
 * der Zustand bulkfähig geschardet: eine Datei je Stammnorm, damit ein Lauf nach jeder Stammnorm atomar
 * checkpointen kann und ein Abbruch keine anderen Einträge beschädigt.
 *
 * Der Dateiname wird ausschließlich hier gebildet. Die bayerische Quellidentität ist besonders
 * heikel: Sie trägt regelmäßig die amtliche BayRS-Gliederungsnummer, und die kennt Punkte,
 * Schrägstriche, römische Ziffern und angehängte Buchstaben (`2170-1-1-I`, `26.2`, `2038-3-4-1/2`).
 * Punkte sind auf Dateisystemen gefährlich (`.`, `..`, versteckte Dateien, abgeschnittene Endungen),
 * Groß-/Kleinschreibung unterscheidet auf macOS und Windows nicht. Deshalb gilt dieselbe Regel wie im
 * NSH-Adapter, die für jede Identität hält:
 *
 *   <kleingeschriebenes, entschärftes Label>-<12 Hex-Zeichen SHA-256 der vollen Identität>
 *
 * Damit ist der Name deterministisch, dateisystemsicher (nur `a-z0-9-`), kollisionsfrei über den Hash
 * der *vollen* Identität – `2170.1.1` und `2170-1-1` entschärfen zum selben Label, bekommen aber
 * verschiedene Namen – und trotzdem lesbar. Ein reserviertes Gerätekürzel (`con`, `nul`, …) kann nicht
 * entstehen, weil immer der Hashteil folgt.
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { AUDIT_DIR, IMPORT_DATA_DIR, SOURCE_AREAS, type SourceArea } from './constants.ts';

/** Höchstlänge des lesbaren Namensteils; der Hashteil kommt immer dazu. */
const LABEL_MAX_LENGTH = 48;

/** Kurzer, deterministischer Fingerabdruck der vollen Quellidentität (auch Kollisionssuffix für Slugs). */
export function identityHash(sourceIdentity: string): string {
  const trimmed = sourceIdentity.trim();
  if (trimmed === '') throw new Error('Quellidentität ist leer – es wird keine Kennung erfunden');
  return createHash('sha256').update(trimmed).digest('hex').slice(0, 12);
}

/** Dateisystemsicherer, deterministischer Dateiname (ohne Endung) einer Quellidentität. */
export function identityFileName(sourceIdentity: string): string {
  const hash = identityHash(sourceIdentity);
  const label = sourceIdentity
    .trim()
    .toLowerCase()
    .replace(/[äÄ]/gu, 'ae')
    .replace(/[öÖ]/gu, 'oe')
    .replace(/[üÜ]/gu, 'ue')
    .replace(/ß/gu, 'ss')
    // Punkte, Schrägstriche und alles Übrige werden zu Bindestrichen: `..`, führende Punkte und
    // scheinbare Dateiendungen können so nicht entstehen.
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, LABEL_MAX_LENGTH)
    .replace(/-+$/u, '');
  return label === '' ? `id-${hash}` : `${label}-${hash}`;
}

/**
 * Amtliche BayRS-Gliederungsnummer (Bayerische Rechtssammlung). Zugelassen sind die im Portal
 * geführten Formen mit Punkt, Bindestrich oder Schrägstrich als Trenner und angehängten Buchstaben
 * bzw. römischen Ziffern – aber kein Leerraum innerhalb der Nummer und kein erfundener Freitext.
 * Das Präfix „BayRS“ darf vorangestellt sein; `normalizeBayRsNumber` entfernt es.
 */
export const BAYRS_NUMBER_PATTERN = /^(?:BayRS[\s ]+)?\d[0-9A-Za-z]*(?:[.\-/][0-9A-Za-z]+)*$/u;

export function isBayRsNumber(value: string): boolean {
  return BAYRS_NUMBER_PATTERN.test(value.trim());
}

/**
 * Kanonische Schreibweise einer BayRS-Nummer: ohne Präfix, Trenner einheitlich `-`, Buchstaben groß
 * (`BayRS 2170.1.1-i` → `2170-1-1-I`). Nur für Vergleich und Anzeige – die Quellidentität selbst wird
 * nie umgeschrieben, damit die Provenienz unverändert bleibt.
 */
export function normalizeBayRsNumber(value: string): string {
  const trimmed = value.trim();
  if (!isBayRsNumber(trimmed)) throw new Error(`${JSON.stringify(value)} ist keine BayRS-Gliederungsnummer`);
  return trimmed.replace(/^BayRS[\s ]+/u, '').replace(/[.\/]/gu, '-').toUpperCase();
}

/**
 * Deterministische Ordnung der Quellidentitäten: Ziffernfolgen werden numerisch verglichen
 * (`2170-1-2` vor `2170-1-10`), alles andere nach Codepunkten – unabhängig von der Locale. Das ist
 * für BayRS-Nummern zugleich die fachlich richtige Ordnung der Gliederung.
 */
export function compareSourceIdentity(left: string, right: string): number {
  const chunks = (value: string): string[] => value.match(/\d+|\D+/gu) ?? [];
  const leftChunks = chunks(left);
  const rightChunks = chunks(right);
  for (let index = 0; index < Math.max(leftChunks.length, rightChunks.length); index += 1) {
    const a = leftChunks[index];
    const b = rightChunks[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    const bothNumeric = /^\d+$/u.test(a) && /^\d+$/u.test(b);
    if (bothNumeric && a !== b) return Number(a) - Number(b);
    if (!bothNumeric && a !== b) return a < b ? -1 : 1;
  }
  return 0;
}

export function assertSourceArea(area: string): SourceArea {
  if (!(SOURCE_AREAS as readonly string[]).includes(area)) throw new Error(`Unbekannter Quellbereich ${area} (erwartet ${SOURCE_AREAS.join('|')})`);
  return area as SourceArea;
}

/** Repo-relative Pfade mit `/` als Trenner (Manifest, Reports und Tests vergleichen sie als Zeichenketten). */
const posix = (path: string): string => path.replace(/\\/gu, '/');

/* Verzeichnisse des fachlichen Zustands (git-versioniert). */
export const MANIFEST_DIR = join(IMPORT_DATA_DIR, 'manifest');
export const REVIEW_DIR = join(IMPORT_DATA_DIR, 'review');
export const EVIDENCE_DIR = join(IMPORT_DATA_DIR, 'evidence');
export const RECONSTRUCTION_DIR = join(IMPORT_DATA_DIR, 'reconstructions');
export const SLUG_REGISTRY_PATH = posix(join(IMPORT_DATA_DIR, 'slug-registry.json'));
export const OVERRIDES_PATH = posix(join(IMPORT_DATA_DIR, 'overrides.json'));
export const SOURCE_CORRECTIONS_PATH = posix(join(IMPORT_DATA_DIR, 'source-corrections.json'));
/** Reserviert für den Transformationsstrang (Institutionen Bayern → Bayern-Württemberg); noch nicht gelesen. */
export const INSTITUTION_MAPPING_PATH = posix(join(IMPORT_DATA_DIR, 'institution-mapping.json'));
export const RECONSTRUCTION_QUEUE_PATH = posix(join(IMPORT_DATA_DIR, 'reconstruction-queue.json'));

/* Verzeichnisse der Auswertungen. */
export const RUNS_DIR = join(AUDIT_DIR, 'runs');
export const COVERAGE_PATH = posix(join(AUDIT_DIR, 'coverage.json'));

/** `data/imports/bayernrecht/manifest/<bereich>/<identität>.json` */
export function manifestEntryPath(area: SourceArea, sourceIdentity: string): string {
  return posix(join(MANIFEST_DIR, assertSourceArea(area), `${identityFileName(sourceIdentity)}.json`));
}

export function manifestAreaDir(area: SourceArea): string {
  return posix(join(MANIFEST_DIR, assertSourceArea(area)));
}

/** `data/imports/bayernrecht/review/<bereich>/<identität>.json` */
export function reviewShardPath(area: SourceArea, sourceIdentity: string): string {
  return posix(join(REVIEW_DIR, assertSourceArea(area), `${identityFileName(sourceIdentity)}.json`));
}

export function reviewAreaDir(area: SourceArea): string {
  return posix(join(REVIEW_DIR, assertSourceArea(area)));
}

/** Evidenzakte je Stammnorm (Belege des Evidence Pass, getrennt vom Manifest lesbar). */
export function evidenceRecordPath(area: SourceArea, sourceIdentity: string): string {
  return posix(join(EVIDENCE_DIR, assertSourceArea(area), `${identityFileName(sourceIdentity)}.json`));
}

export function evidenceAreaDir(area: SourceArea): string {
  return posix(join(EVIDENCE_DIR, assertSourceArea(area)));
}

/** Enumerationsdatei je Bereich: `data/imports/bayernrecht/enumeration-<bereich>.json` */
export function enumerationPath(area: SourceArea): string {
  return posix(join(IMPORT_DATA_DIR, `enumeration-${assertSourceArea(area)}.json`));
}

/**
 * Quellen ohne auflösbare Stammnorm: `data/audits/bayernrecht/<bereich>/unresolved/<hash der URL>.json`.
 * Schlüssel ist die Einstiegsadresse – es wird keine Quellidentität erfunden.
 */
export function unresolvedSourcePath(area: SourceArea, url: string): string {
  return posix(join(AUDIT_DIR, assertSourceArea(area), 'unresolved', `${createHash('sha256').update(url).digest('hex').slice(0, 16)}.json`));
}

export function unresolvedAreaDir(area: SourceArea): string {
  return posix(join(AUDIT_DIR, assertSourceArea(area), 'unresolved'));
}

/** Laufbericht: `data/audits/bayernrecht/runs/<runId>.json`; die Lauf-ID muss selbst dateisystemsicher sein. */
export function runReportPath(runId: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(runId)) throw new Error(`Ungültige Lauf-ID ${runId} (erlaubt: a-z, 0-9, Bindestrich)`);
  return posix(join(RUNS_DIR, `${runId}.json`));
}

/** Alle Verzeichnisse des Adapterzustands – für Aufräum- und Prüfläufe (z. B. Temp-Dateien nach Abbruch). */
export function stateDirectories(): string[] {
  return [
    ...SOURCE_AREAS.map((area) => manifestAreaDir(area)),
    ...SOURCE_AREAS.map((area) => reviewAreaDir(area)),
    ...SOURCE_AREAS.map((area) => evidenceAreaDir(area)),
    ...SOURCE_AREAS.map((area) => unresolvedAreaDir(area)),
    posix(RUNS_DIR),
  ];
}
