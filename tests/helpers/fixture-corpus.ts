/**
 * Synthetischer Testbestand für Unit-Tests. Kein Zugriff auf Dateisystem oder Umgebung;
 * alles läuft durch die kanonischen Parser. Der committete Bestand unter content/ ist ein
 * zweiter, unabhängiger Testbestand (Loader- und Integrationstests).
 */
import { SIMULATION_BASELINE_DATE, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { parseNormHistory, parseNormMeta, parseNormVersion, validateNormRecord, type NormBodyBlock, type NormHistory, type NormMeta, type NormRecord, type NormVersion } from '@landesrecht/legal-core/lib/schema.ts';

export const FIXTURE_REFERENCE_DATE = '2026-09-01';

export function paragraph(label: string, title: string, ...texts: string[]): NormBodyBlock {
  return {
    type: 'paragraph',
    label,
    title,
    children: texts.map((text, index) => ({ type: 'subparagraph', label: `(${index + 1})`, text, children: [] })),
  };
}

export function article(label: string, title: string, ...texts: string[]): NormBodyBlock {
  return { type: 'article', label, title, children: texts.map((text) => ({ type: 'paragraphText', text })) };
}

export interface NormInput {
  jurisdiction: JurisdictionId;
  slug: string;
  meta?: Record<string, unknown> | NormMeta;
  history?: Record<string, unknown> | NormHistory;
  versions: Array<Record<string, unknown> | NormVersion>;
}

export function norm({ jurisdiction, slug, meta = {}, history, versions }: NormInput): NormRecord {
  const record: NormRecord = {
    meta: parseNormMeta({
      id: `${jurisdiction}:${slug}`,
      slug,
      jurisdiction,
      title: `Testgesetz ${slug}`,
      shortTitle: `Test ${slug}`,
      abbr: `T${slug.replace(/[^a-z0-9]/g, '').slice(0, 6).toUpperCase()}`,
      type: 'gesetz',
      status: 'in-force',
      subjects: ['Testsachgebiet'],
      keywords: [],
      initialCitation: `Gesetz vom 1. Januar 2020 (Testblatt S. 1)`,
      predecessor: null,
      successor: null,
      ...meta,
    }, `${slug}/meta.json`),
    history: parseNormHistory(history ?? {
      initialVersionId: String(versions[0]!.versionId),
      entries: [{ date: String(versions[0]!.simulationValidFrom), type: 'initial', title: 'Ausgangsfassung', citation: 'Gesetz vom 1. Januar 2020 (Testblatt S. 1)', affectingVersionId: String(versions[0]!.versionId) }],
    }, `${slug}/history.json`),
    versions: versions.map((version) => parseNormVersion({
      citation: 'Gesetz vom 1. Januar 2020 (Testblatt S. 1)',
      changeNote: 'Test',
      simulationValidTo: null,
      ...version,
    }, `${slug}/versions/${String(version.versionId)}.json`)),
  };
  return validateNormRecord(record, `${jurisdiction}/${slug}`);
}

/** Ein Bestand mit je einer Norm pro Jurisdiktion; West trägt zwei Fassungen. */
export function buildFixtureNorms(): NormRecord[] {
  return [
    norm({
      jurisdiction: 'west',
      slug: 'testgesetz-west',
      meta: { title: 'Westdeutsches Testgesetz', shortTitle: 'Testgesetz West', abbr: 'WTestG', keywords: ['Prüfstand'], externalIdentifiers: [{ system: 'recht-nrw', value: 'SYN-1' }] },
      history: {
        initialVersionId: SIMULATION_BASELINE_DATE,
        entries: [
          { date: SIMULATION_BASELINE_DATE, type: 'initial', title: 'Ausgangsfassung', citation: 'Stammzitat', affectingVersionId: SIMULATION_BASELINE_DATE },
          { date: '2026-03-01', type: 'amendment', title: '§ 2 neu gefasst', citation: 'Gesetz vom 20. Februar 2026', affectingVersionId: '2026-03-01' },
        ],
      },
      versions: [
        {
          versionId: SIMULATION_BASELINE_DATE,
          simulationValidFrom: SIMULATION_BASELINE_DATE,
          simulationValidTo: '2026-02-28',
          sourceValidFrom: '2023-08-01',
          sourceValidTo: '2024-01-31',
          body: [
            { type: 'section', label: '1. Abschnitt', title: 'Allgemeines', children: [
              paragraph('§ 1', 'Zweck', 'Dieses Gesetz regelt den Prüfstand des Landesrechtsportals.'),
              paragraph('§ 2', 'Begriffe', 'Prüfstand ist die Gesamtheit der Testfälle.', 'Ein Testfall ist ein reproduzierbarer Ablauf.'),
            ] },
          ],
        },
        {
          versionId: '2026-03-01',
          simulationValidFrom: '2026-03-01',
          simulationValidTo: null,
          changeNote: 'Folgefassung',
          body: [
            { type: 'section', label: '1. Abschnitt', title: 'Allgemeines', children: [
              paragraph('§ 1', 'Zweck', 'Dieses Gesetz regelt den Prüfstand des Landesrechtsportals.'),
              paragraph('§ 2', 'Begriffe', 'Prüfstand ist die Gesamtheit der Testfälle.', 'Ein Testfall ist ein reproduzierbarer Ablauf mit Sollergebnis.', 'Ein Sollergebnis ist verbindlich.'),
            ] },
          ],
        },
      ],
    }),
    norm({
      jurisdiction: 'nsh',
      slug: 'deichgesetz-nsh',
      meta: { title: 'Deichgesetz Niedersachsen-Holstein', shortTitle: 'Deichgesetz', abbr: 'DeichG NSH', type: 'gesetz', subjects: ['Wasserwirtschaft'] },
      versions: [{ versionId: SIMULATION_BASELINE_DATE, simulationValidFrom: SIMULATION_BASELINE_DATE, body: [paragraph('§ 1', 'Deiche', 'Deiche schützen die Küste vor Sturmfluten.')] }],
    }),
    norm({
      jurisdiction: 'ost',
      slug: 'testverordnung-ost',
      meta: { title: 'Ostdeutsche Testverordnung', shortTitle: 'Testverordnung', abbr: 'OstTestVO', type: 'verordnung' },
      versions: [{ versionId: '2024-02-01', simulationValidFrom: '2024-02-01', body: [article('Artikel 1', 'Änderung', 'Die Schulordnung wird geändert.'), { type: 'quotedProvision', children: [paragraph('§ 9', 'Zitiert', 'Zitierter Text darf keine Trefferstelle sein.')] }] }],
    }),
    norm({
      jurisdiction: 'baywue',
      slug: 'landesordnung-baywue',
      meta: { title: 'Landesordnung Bayern-Württemberg', shortTitle: 'Landesordnung', abbr: 'LO BayWü', subjects: ['Kommunalrecht'] },
      versions: [{ versionId: SIMULATION_BASELINE_DATE, simulationValidFrom: SIMULATION_BASELINE_DATE, body: [article('Art. 1', 'Gemeinden', 'Die Gemeinden ordnen ihre Angelegenheiten selbst.'), { type: 'article', label: 'Art. 5', title: 'Gemeinderat', children: [{ type: 'subparagraph', label: '(1)', text: 'Der Gemeinderat besteht aus Mitgliedern.', children: [] }, { type: 'subparagraph', label: '(2)', text: 'Die Zahl richtet sich nach der Einwohnerzahl.', children: [] }] }] }],
    }),
  ];
}
