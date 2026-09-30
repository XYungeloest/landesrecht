import { EDITORIAL_REFERENCE_DATE } from '../config/editorial.ts';
import type { NormStatus, NormType, SourceTextStatus, SourceValidityStatus } from './schema.ts';
import type { SimulationChangeKind } from './simulation-change.ts';
import type { VersionTemporalKind } from './versions.ts';

/**
 * Eine Wortliste für Geltung, Fassung und Rechtsstand (Prinzip aus OstRecht): dieselbe Sache
 * heißt überall gleich. Oberfläche und API lesen die Bezeichnungen hier.
 */
export const VOCABULARY = {
  portalName: 'Landesrecht',
  portalSubtitle: 'Gemeinsames Rechtsportal der Länder der politischen Simulation',
  simulationNotice: 'Dies ist eine fiktive Website innerhalb einer politischen Simulation. Die Inhalte sind keine amtlichen Veröffentlichungen realer Länder.',
  officialNote: 'Amtlich ist allein die in den Verkündungsblättern der Simulation veröffentlichte Fassung.',
  baselineLabel: 'Ausgangsrechtsstand',
  legalStatus: { label: 'Rechtsstand', asOf: 'Rechtsstand vom' },
  validity: {
    label: 'Geltung',
    byStatus: {
      'in-force': 'in Kraft',
      'future-effective': 'künftig in Kraft',
      'pending-effective': 'Inkrafttreten nicht belegt',
      repealed: 'außer Kraft',
      historical: 'außer Kraft',
      'one-time-act': 'einmaliger Rechtsakt',
      planned: 'nicht verkündet',
    } satisfies Record<NormStatus, string>,
  },
  version: {
    label: 'Fassung',
    byKind: {
      current: { one: 'Geltende Fassung', many: 'Geltende Fassungen', band: 'GELTENDE FASSUNG' },
      historical: { one: 'Historische Fassung', many: 'Historische Fassungen', band: 'HISTORISCHE FASSUNG' },
      future: { one: 'Künftige Fassung', many: 'Künftige Fassungen', band: 'KÜNFTIGE FASSUNG' },
      'unknown-effective': { one: 'Fassung mit ungeklärtem Inkrafttreten', many: 'Fassungen mit ungeklärtem Inkrafttreten', band: 'INKRAFTTRETEN NICHT BELEGT' },
    } satisfies Record<VersionTemporalKind, { one: string; many: string; band: string }>,
  },
  types: {
    verfassung: 'Verfassung',
    gesetz: 'Gesetz',
    verordnung: 'Verordnung',
    verwaltungsvorschrift: 'Verwaltungsvorschrift',
    'allgemeine-verwaltungsvorschrift': 'Allgemeine Verwaltungsvorschrift',
    runderlass: 'Runderlass',
    richtlinie: 'Richtlinie',
    durchfuehrungserlass: 'Durchführungserlass',
    foerderrichtlinie: 'Förderrichtlinie',
    allgemeinverfuegung: 'Allgemeinverfügung',
    bekanntmachung: 'Bekanntmachung',
    berichtigung: 'Berichtigung',
    staatsvertrag: 'Staatsvertrag',
    verwaltungsabkommen: 'Verwaltungsabkommen',
    zustimmungsgesetz: 'Zustimmungsgesetz',
    aenderungsvorschrift: 'Änderungsvorschrift',
    satzung: 'Satzung',
  } satisfies Record<NormType, string>,
  sourceStatus: {
    label: 'Quellenlage',
    validity: {
      exact: 'Quellintervall ausdrücklich belegt',
      'verified-active-at-baseline': 'Geltung am Ausgangsrechtsstand durch Belege nachgewiesen',
      reconstructed: 'Quellintervall aus Änderungsbelegen hergeleitet',
    } satisfies Record<SourceValidityStatus, string>,
    text: {
      direct: 'Text unverändert aus der Quellfassung übernommen',
      reconstructed: 'Stichtagsfassung rekonstruiert',
    } satisfies Record<SourceTextStatus, string>,
    reconstructedHint: 'Stichtagsfassung rekonstruiert',
  },
  typeFilter: {
    all: 'Alle',
    administrativeFamily: 'Verwaltungsvorschriften (alle Arten)',
  },
  /** Öffentliche Bezeichnungen der Klassifikation gegenüber dem Ausgangsrechtsstand (lib/simulation-change.ts). */
  simulationChange: {
    label: 'Rechtsstand',
    byKind: {
      'baseline-unchanged': 'Seit dem Ausgangsstand unverändert',
      'baseline-changed': 'In der Simulation geändert',
      'simulation-new': 'Neu in der Simulation',
    },
    filter: {
      all: 'Alle Vorschriften',
      'baseline-changed': 'In der Simulation geändert',
      'simulation-new': 'Neu in der Simulation',
      'baseline-unchanged': 'Seit Ausgangsstand unverändert',
    },
    baselineVersion: 'Ausgangsfassung',
    currentVersion: 'Geltende Fassung',
    simulationVersion: 'Simulationsänderung',
    compareCta: 'Was hat sich geändert?',
    changesSince: 'Änderungen seit dem Ausgangsstand',
    notConsolidated: 'Noch nicht im konsolidierten Rechtsbestand',
    notPromulgated: 'Entwurf / nicht verkündet',
  },
  history: {
    initial: 'Stammfassung',
    amendment: 'Änderung',
    repeal: 'Aufhebung',
    correction: 'Berichtigung',
    notice: 'Hinweis',
  },
  sections: {
    text: 'Normtext',
    facts: 'Vorschriftendaten',
    history: 'Frühere Fassungen',
    compare: 'Änderungen',
    sources: 'Quellen und Nachweise',
  },
} as const;

export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '–';
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  return `${day}. ${['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'][month - 1]} ${year}`;
}

export function formatDateShort(isoDate: string | null | undefined): string {
  if (!isoDate) return '–';
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}

export function typeLabel(type: NormType): string {
  return VOCABULARY.types[type];
}

export function statusLabel(status: NormStatus): string {
  return VOCABULARY.validity.byStatus[status];
}

export function versionKindLabel(kind: VersionTemporalKind, form: 'one' | 'many' | 'band' = 'one'): string {
  return VOCABULARY.version.byKind[kind][form];
}

export function referenceDateLabel(referenceDate: string): string {
  return `${VOCABULARY.legalStatus.asOf} ${formatDate(referenceDate)}`;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function simulationChangeLabel(kind: SimulationChangeKind): string {
  return VOCABULARY.simulationChange.byKind[kind];
}

/**
 * Redaktionelle Arbeitsnotizen (Rückrechnungsrezepte, Dateipfade, Bestands- und Prüfvermerke) gehören nicht in
 * die öffentliche Ansicht. Die gespeicherten Fassungen bleiben unverändert; ausgeblendet wird allein bei der Anzeige.
 * Im Zweifel wird eine Notiz eher ausgeblendet als gezeigt.
 */
const INTERNAL_NOTE_PATTERN = /Baseline|blockiert|gesperrt|\bSlug\b|Rezept|Rundlauf|\bReview\b|Ledger|\bSeed\b|Freeze|eingefroren|Fingerabdruck|SHA-256|Manifest|Exportpaket|Medienpaket|Rückrechnung|Vorwärts angewandt|Stichtagsfassung aus|Je Einheit die am Stichtag|Permalink|Textdatei|\bImport|\bR2\b|\bD1\b|data\/|sources\/|imports\/|\.json\b|\.txt\b|https?:\/\//u;

/** Öffentlich zeigbare Notiz oder `undefined`, wenn sie redaktionelle Arbeitssprache enthält. */
export function publicNote(note: string | null | undefined): string | undefined {
  const text = note?.trim();
  if (!text || INTERNAL_NOTE_PATTERN.test(text)) return undefined;
  return text;
}

/**
 * Datum der jüngsten Simulationsänderung in Lesersprache: bis zum redaktionellen Stichtag „zuletzt geändert am …“,
 * danach (bereits verkündet, noch nicht wirksam) „Änderung wirksam ab …“.
 */
export function simulationChangeDateText(date: string, referenceDate: string = EDITORIAL_REFERENCE_DATE): string {
  return date > referenceDate ? `Änderung wirksam ab ${formatDate(date)}` : `zuletzt geändert am ${formatDate(date)}`;
}
