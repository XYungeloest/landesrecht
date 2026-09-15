import type { NormStatus, NormType, SourceTextStatus, SourceValidityStatus } from './schema.ts';
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
    history: 'Fassungen und Änderungen',
    compare: 'Fassungsvergleich',
    sources: 'Quellen',
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
