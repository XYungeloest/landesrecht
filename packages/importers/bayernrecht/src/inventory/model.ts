/**
 * Strukturinventur des vollständigen BayWü-Korpus: Begriffe, Ausgänge, Eintragsform.
 *
 * Die Inventur lässt jeden Scope-Kandidaten mit vorhandenem Exportpaket **einmal ganz** durch den
 * Weg laufen – ZIP → XML → Parser → Überleitung → `NormRecord` → `validateNormRecord` – und hält
 * fest, was dabei herauskommt. Sie schreibt keine Norm und kein Manifest; sie zählt.
 *
 * Zwei Festlegungen tragen alles Weitere:
 *
 * 1. **Meldend, nicht abbrechend.** Der Parser läuft mit `unknown: 'report'`; ein Fehler an einem
 *    Dokument beendet den Lauf nicht, sondern wird zum Ausgang dieses einen Dokuments. Nur so
 *    entsteht eine Aussage über den *ganzen* Bestand statt über den Anfang bis zum ersten Abbruch.
 * 2. **Die Signatur ist der Schlüssel.** Fünfhundert Einzelfehler sind keine Arbeitsliste. Jeder
 *    Befund trägt eine strukturelle Signatur (Element, Elternpfad, Attributkombination, Muster);
 *    zwei Dokumente mit demselben unbekannten Element an derselben Stelle gehören in dieselbe
 *    Klasse. Gezählt werden Dokumente je Klasse, nicht Vorkommen.
 *
 * Determinismus: In den Eintrag gehen nur Eigenschaften des Pakets ein, nie die Uhr. `@builddate`
 * des XML bleibt außen vor (das Portal baut den Export täglich neu) und wird in Ausschnitten
 * maskiert; `generatedAt` ist die Projektkonstante `EVALUATION_DATE`, kein Tagesdatum.
 */
import { join } from 'node:path';

import { AUDIT_DIR, IMPORT_DATA_DIR, type SourceArea } from '../common/constants.ts';

export const INVENTORY_SCHEMA = 'bayernrecht-inventory/1' as const;

export const INVENTORY_PATH = join(IMPORT_DATA_DIR, 'inventory.json');
export const STRUCTURE_REPORT_PATH = join(AUDIT_DIR, 'FULL_CORPUS_STRUCTURE_REPORT.md');
export const TEXT_INTEGRITY_REPORT_PATH = join(AUDIT_DIR, 'TEXT_INTEGRITY.md');

/**
 * Ausgang eines Dokuments – genau einer je Dokument.
 *
 * `skipped-not-cached` ist kein Ausgang des Weges, sondern seine Abwesenheit: Das Paket liegt nicht
 * im Cache, das Dokument wurde nicht geprüft. Das ist **kein Fehler** (der Beschaffungslauf läuft
 * noch), es wird nur getrennt gezählt.
 */
export const INVENTORY_OUTCOMES = [
  'parsed',
  'parsed-with-warnings',
  'unknown-structure',
  'integrity-mismatch',
  'schema-failed',
  'transform-failed',
  'missing-assets',
  'source-corrupt',
  'skipped-not-cached',
] as const;
export type InventoryOutcome = (typeof INVENTORY_OUTCOMES)[number];

/** Stufe des Weges, auf der der Befund entstanden ist. */
export const INVENTORY_PHASES = ['package', 'parse', 'transform', 'validate'] as const;
export type InventoryPhase = (typeof INVENTORY_PHASES)[number];

/**
 * Vorrang der Ausgänge, wenn mehrere zutreffen: Der schwerste gewinnt, und zwar der, der dem
 * Bulk-Lauf am meisten im Weg steht. Ein Dokument mit unbekannter Struktur *und* fehlender Beilage
 * ist ein Strukturfall – die Beilage ist erst danach interessant.
 */
const OUTCOME_ORDER: readonly InventoryOutcome[] = [
  'skipped-not-cached',
  'source-corrupt',
  'unknown-structure',
  'schema-failed',
  'transform-failed',
  'integrity-mismatch',
  'missing-assets',
  'parsed-with-warnings',
  'parsed',
];

/** Der schwerste der genannten Ausgänge; ohne Angabe `parsed`. */
export function worstOutcome(candidates: readonly InventoryOutcome[]): InventoryOutcome {
  let best: InventoryOutcome = 'parsed';
  let bestRank = OUTCOME_ORDER.indexOf('parsed');
  for (const candidate of candidates) {
    const rank = OUTCOME_ORDER.indexOf(candidate);
    if (rank >= 0 && rank < bestRank) {
      best = candidate;
      bestRank = rank;
    }
  }
  return best;
}

/** Ausgänge, die einen Bulk-Lauf an diesem Dokument hindern. */
export const BLOCKING_OUTCOMES: readonly InventoryOutcome[] = ['source-corrupt', 'unknown-structure', 'schema-failed', 'transform-failed', 'integrity-mismatch'];

/**
 * Klassen der Textintegrität – sichtbarer Quelltext gegen kanonischen Text.
 *
 * Erlaubt sind Leerraum, Entitäten, typografische Normalisierung und strukturelle
 * Neuzusammensetzung **ohne Textverlust**. Nicht erlaubt sind verlorene Sätze, Tabellen, Fußnoten
 * und Anlageninhalte – und keine Verdopplung. `mismatch` ist ein Importhindernis.
 */
export const TEXT_INTEGRITY_CLASSES = ['exact', 'normalized-equivalent', 'explained-difference', 'review', 'mismatch'] as const;
export type TextIntegrityClass = (typeof TEXT_INTEGRITY_CLASSES)[number];

/** Ein Befund an einem Dokument, mit der Signatur, unter der er sich mit anderen zusammenfassen lässt. */
export interface InventoryFinding {
  code: string;
  severity: 'info' | 'warning' | 'error';
  phase: InventoryPhase;
  /** Strukturelle Signatur – der Schlüssel der Klassenbildung. */
  signature: string;
  /** DTD-Element, soweit der Befund eines nennt. */
  element?: string;
  /** Elternpfad im XML, soweit ermittelbar (`<rumpf> → <absatz.text>`). */
  parentPath?: string;
  /** Zeile im Exportdokument, soweit der Befund sie nennt. */
  line?: number;
  /** Der Ausschnitt, an dem es hängt: die Quellzeile, sonst die Befundmeldung. */
  excerpt: string;
}

/** Ergebnis der Textintegritätsprüfung eines Dokuments. */
export interface TextIntegrityResult {
  class: TextIntegrityClass;
  /** Inhaltstragende Wörter im sichtbaren Quelltext bzw. im kanonischen Text. */
  sourceTokens: number;
  canonicalTokens: number;
  /** Wörter, die der kanonische Text gegenüber der Quelle verliert bzw. zusätzlich führt. */
  missing: number;
  extra: number;
  /** Benannte Erklärungen für zulässige Unterschiede (z. B. Gliederungsnummer vor dem Titel). */
  explanations: string[];
  /**
   * Der Quellabschnitt, dem die meisten Wörter fehlen – der Beleg für `review` und `mismatch`, mit
   * seiner Position im XML. Er trägt auch die Signatur, unter der sich gleichartige Verluste
   * zusammenfassen lassen.
   */
  lostExcerpt?: string;
  /** Wort, das der kanonische Text häufiger führt als die Quelle (Verdopplungsverdacht). */
  duplicatedExcerpt?: string;
}

/** Ein Eintrag der Inventur: ein Dokument, ein Ausgang. */
export interface InventoryEntry {
  documentId: string;
  sourceArea: SourceArea;
  title: string;
  outcome: InventoryOutcome;
  /** Stufe, auf der der Ausgang entschieden wurde. */
  phase: InventoryPhase;
  /** DTD des Exportdokuments – Erfolg wird je DTD getrennt ausgewiesen. */
  dialect?: 'byrecht-norm' | 'byrecht-vv';
  /** `dokumentation/@doktyp` bzw. `bayernrecht_dokumentklasse/@wert`. */
  documentType?: string;
  /** Normtyp des Zielmodells nach dem Parser. */
  normType?: string;
  /** Pfad des Normdokuments im Exportpaket. */
  documentPath?: string;
  /** SHA-256 des Exportpakets (Cachebytes). */
  sha256: string;
  byteLength: number;
  /** Slug, den die Überleitung vergeben würde; Kollisionen werden gesondert ausgewiesen. */
  slug?: string;
  attachments?: { pdf: number; image: number };
  /** Abbildungen aus `<graphic>` im XML. */
  graphics?: number;
  textIntegrity?: TextIntegrityResult;
  /** Befunde, nach Signatur entdoppelt und deterministisch sortiert. */
  findings: InventoryFinding[];
  /** Befundschlüssel dieses Dokuments, sortiert – Grundlage der Kennzahlen. */
  codes: string[];
}

/** Eine Strukturklasse: alle Dokumente, deren Befund dieselbe Signatur trägt. */
export interface StructureClass {
  signature: string;
  code: string;
  phase: InventoryPhase;
  severity: InventoryFinding['severity'];
  element?: string;
  parentPath?: string;
  /** Zahl der betroffenen Dokumente (nicht der Vorkommen). */
  documents: number;
  /** Bis zu fünf echte Beispiele mit Dokument-ID und dem Ausschnitt, an dem es hängt. */
  examples: Array<{ documentId: string; line?: number; excerpt: string }>;
}

export interface InventoryTotals {
  /** Kandidaten laut Scope (`include`). */
  candidates: number;
  /** Davon geprüft (Paket im Cache vorhanden). */
  checked: number;
  notCached: number;
  /** Kandidaten, die dieser Lauf nicht erreicht hat (Budget `--limit`); sie fehlen in `entries`. */
  pending: number;
  byOutcome: Record<InventoryOutcome, number>;
  byDialect: Record<string, Record<string, number>>;
  byNormType: Record<string, Record<string, number>>;
  byTextIntegrity: Record<TextIntegrityClass, number>;
  /** Kennzahlen, nach denen ausdrücklich gefragt ist. */
  signals: {
    divisionNumberBeforeTitle: number;
    normTypeOutOfModel: Record<string, number>;
    imageAttachments: { documents: number; withFigures: number; withGraphicFinding: number; withoutGraphicFinding: number };
    slugCollisions: number;
  };
}

export interface InventoryFile {
  schemaVersion: typeof INVENTORY_SCHEMA;
  baselineDate: string;
  /** Konstante, kein Tagesdatum: Ein zweiter Lauf über denselben Cache schreibt dieselbe Datei. */
  generatedAt: string;
  totals: InventoryTotals;
  classes: StructureClass[];
  entries: InventoryEntry[];
}

export function emptyOutcomeCounter(): Record<InventoryOutcome, number> {
  const counter = {} as Record<InventoryOutcome, number>;
  for (const outcome of INVENTORY_OUTCOMES) counter[outcome] = 0;
  return counter;
}

export function emptyIntegrityCounter(): Record<TextIntegrityClass, number> {
  const counter = {} as Record<TextIntegrityClass, number>;
  for (const value of TEXT_INTEGRITY_CLASSES) counter[value] = 0;
  return counter;
}
