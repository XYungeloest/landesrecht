/**
 * OstRecht-Kompatibilität: eine kleine synthetische Norm im OstRecht-Format (Struktur wie das
 * Ostdeutsche Schulgesetz) wird über den Adapter verlustfrei übernommen. Liegt das
 * Schwesterprojekt ../staatsregierung vor, wird zusätzlich die reale Schulgesetz-Norm nur
 * lesend geprüft; sie wird nie kopiert.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { countBlockTypes } from '@landesrecht/legal-core/lib/body.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { importOstRechtNorm } from '@landesrecht/importer-ostrecht/index.ts';
import { adaptOstRechtRecord, adaptOstRechtSource } from '@landesrecht/providers/ostrecht.ts';
import { createOstRechtProvider } from '@landesrecht/providers/ostrecht-provider.ts';
import { createLegalReference } from '@landesrecht/legal-core/lib/references.ts';
import { buildProjectionPlan } from '@landesrecht/runtime/projection.ts';

const REVOSAX_SOURCE = {
  kind: 'revosax-snapshot',
  label: 'Amtliche REVOSax-Fassung, gültig 2023-08-01 bis 2023-12-31',
  availability: 'versioned',
  localSource: 'data/recht/sources/revosax/ostdeutsches-schulgesetz/4192.30.html',
  url: 'https://www.revosax.sachsen.de/vorschrift/4192.30',
  retrievedAt: '2026-08-23',
  sha256: '3d1792a483a1f733746bfe6c38744a10877dfb16398bbaa1dc7d525815719066',
  lawId: '4192',
  sourceValidFrom: '2023-08-01',
  sourceValidTo: '2023-12-31',
  fsnNumber: '710-1',
};

const SYNTHETIC_OSTRECHT_RECORD = {
  meta: {
    id: 'synthetisches-schulgesetz',
    slug: 'synthetisches-schulgesetz',
    title: 'Synthetisches Schulgesetz für den Freistaat Ostdeutschland',
    shortTitle: 'Synthetisches Schulgesetz',
    abbr: 'SynSchulG',
    shortTitleSource: 'official',
    type: 'gesetz',
    originEnactingBody: 'Sächsischer Landtag',
    responsibleMinistry: 'Staatsministerium für Kultus',
    subjects: ['Bildungswesen'],
    primarySubject: 'Bildungswesen',
    keywords: [],
    initialCitation: 'Synthetisches Schulgesetz in der Fassung der Bekanntmachung vom 27. September 2018 (SächsGVBl. S. 648)',
    predecessor: null,
    successor: null,
    predecessorSlug: 'altes-schulgesetz',
    status: 'in-force',
    documentDate: '2018-09-27',
    sourceReferences: [REVOSAX_SOURCE, { kind: 'amendment-source', label: 'OGVBl. 2026 Nr. 52', availability: 'versioned', localSource: 'Gesetze/OGVBl. 2026 Nr. 52.html' }],
    affectedByNorms: ['sportneuordnungsgesetz'],
    relatedNorms: ['schulordnung'],
  },
  history: {
    initialVersionId: '2023-11-01',
    entries: [
      { date: '2023-11-01', type: 'initial', title: 'Vollständige Ausgangsfassung zum verbindlichen Stichtag.', citation: 'Zitat', affectingVersionId: '2023-11-01' },
      { date: '2026-07-21', type: 'amendment', title: 'Schulsport ergänzt.', citation: 'Gesetz vom 20. Juli 2026 (OGVBl. 2026 Nr. 52)', affectingVersionId: '2026-07-21', relatedNorm: 'sportneuordnungsgesetz' },
    ],
  },
  versions: [
    {
      versionId: '2023-11-01',
      title: 'Synthetisches Schulgesetz',
      validFrom: '2023-11-01',
      validTo: '2026-07-20',
      isCurrent: false,
      citation: 'Zitat',
      changeNote: 'Ausgangsfassung zum Rechtsüberleitungsstichtag 2023-11-01.',
      sourceReferences: [REVOSAX_SOURCE],
      sourceNotes: [{ label: '1', text: '§ 1 geändert durch Gesetz vom 2. Februar 2023 (SächsGVBl. S. 62)' }],
      body: [
        { type: 'paragraphText', text: 'Vom 27. September 2018' },
        { type: 'section', label: '1.', title: 'Teil Allgemeine Vorschriften', children: [
          { type: 'paragraph', label: '§ 1', title: 'Erziehungs- und Bildungsauftrag der Schule', children: [
            { type: 'subparagraph', label: '(1)', text: 'Die Schule unterrichtet und erzieht junge Menschen.', children: [] },
            { type: 'subparagraph', label: '(5)', text: 'Die Schüler sollen insbesondere lernen,', children: [] },
            { type: 'item', label: '1.', text: 'selbstständig zu handeln,', level: 0, numberingStyle: 'decimal', children: [] },
            { type: 'item', label: '2.', text: 'gemeinsam zu lernen.', level: 0, numberingStyle: 'decimal', children: [] },
          ] },
        ] },
        { type: 'annex', label: 'Anlage', title: 'Stundentafel', children: [
          { type: 'table', columns: 2, children: [
            { type: 'tableRow', children: [{ type: 'tableHeaderCell', text: 'Fach', scope: 'col' }, { type: 'tableHeaderCell', text: 'Stunden', scope: 'col' }] },
            { type: 'tableRow', children: [{ type: 'tableCell', text: 'Deutsch' }, { type: 'tableCell', text: '' }] },
          ] },
        ] },
      ],
    },
    {
      versionId: '2026-07-21',
      validFrom: '2026-07-21',
      validTo: null,
      isCurrent: true,
      citation: 'Zitat 2',
      changeNote: 'Folgefassung.',
      body: [{ type: 'paragraph', label: '§ 1', title: 'Auftrag', children: [{ type: 'subparagraph', label: '(1)', text: 'Neu.', children: [] }] }],
    },
  ],
};

describe('OstRecht-Kompatibilität (synthetisch)', () => {
  it('übersetzt einen OstRecht-Datensatz verlustfrei in das kanonische Modell', () => {
    const record = adaptOstRechtRecord(SYNTHETIC_OSTRECHT_RECORD);
    expect(record.meta.jurisdiction).toBe('ost');
    expect(record.meta.id).toBe('ost:synthetisches-schulgesetz');
    expect(record.meta.externalIdentifiers).toEqual([
      { system: 'ostrecht', value: 'synthetisches-schulgesetz', url: undefined },
      { system: 'revosax', value: '4192', url: 'https://www.revosax.sachsen.de/vorschrift/4192' },
    ]);
    expect(record.meta.responsibleBody).toBe('Staatsministerium für Kultus');
    expect(record.meta.originEnactingBody).toBe('Sächsischer Landtag');
    expect(record.meta.predecessorTarget).toEqual({ slug: 'altes-schulgesetz' });
    expect(record.meta.relations).toEqual([
      { type: 'amended-by', target: { slug: 'sportneuordnungsgesetz' } },
      { type: 'related', target: { slug: 'schulordnung' } },
    ]);
    const snapshot = record.meta.sourceReferences[0]!;
    expect(snapshot.kind).toBe('official-portal-snapshot');
    expect(snapshot.system).toBe('revosax');
    expect(snapshot.externalId).toBe('4192');
    expect(snapshot.sourceNumber).toBe('710-1');
    expect(snapshot.availability).toBe('external');
    expect(snapshot.note).toContain('data/recht/sources/revosax');

    const [baseline, next] = record.versions;
    expect(baseline!.simulationValidFrom).toBe('2023-11-01');
    expect(baseline!.simulationValidTo).toBe('2026-07-20');
    expect(baseline!.sourceValidFrom).toBe('2023-08-01');
    expect(baseline!.sourceValidTo).toBe('2023-12-31');
    expect(next!.simulationValidTo).toBeNull();
    expect('isCurrent' in baseline!).toBe(false);
    expect(baseline!.body).toEqual(SYNTHETIC_OSTRECHT_RECORD.versions[0]!.body);
    expect(baseline!.sourceNotes).toEqual(SYNTHETIC_OSTRECHT_RECORD.versions[0]!.sourceNotes);
    expect(record.history.entries[1]!.relatedNorm).toEqual({ slug: 'sportneuordnungsgesetz' });
  });

  it('projiziert den adaptierten Datensatz und löst Verweise auf OstRecht auf', async () => {
    const record = adaptOstRechtRecord(SYNTHETIC_OSTRECHT_RECORD);
    const plan = buildProjectionPlan([record], { jurisdiction: 'ost', full: true, now: '2026-01-01T00:00:00.000Z', asOf: '2026-09-01' });
    expect(plan.stats.versions).toBe(2);
    expect(plan.stats.searchUnits).toBeGreaterThan(2);
    const provider = createOstRechtProvider({ records: [record], asOf: '2026-09-01' });
    expect(provider.providesNorms).toBe(true);
    expect((await provider.listVersions('ost', 'synthetisches-schulgesetz')).map((version) => version.versionId)).toEqual(['2023-11-01', '2026-07-21']);
    const resolved = await provider.resolveReference(createLegalReference('ost', 'SynSchulG', { provision: '§ 1' }));
    expect(resolved?.url).toBe('https://recht.freistaat-ostdeutschland.de/norm/synthetisches-schulgesetz/#paragraph-1');
  });

  it('bildet die Quellenarten von OstRecht auf generische Quellen ab', () => {
    expect(adaptOstRechtSource({ kind: 'structured-html-transcription', label: 'HTML', availability: 'versioned', localSource: 'Gesetze/x.html' }).source).toMatchObject({ kind: 'structured-transcription', system: 'ostrecht', availability: 'external' });
    expect(adaptOstRechtSource({ kind: 'primary-pdf', label: 'PDF', availability: 'versioned', localSource: 'Gesetze/x.pdf', mediaType: 'application/pdf' }).source).toMatchObject({ kind: 'primary-pdf', mediaType: 'application/pdf' });
  });
});

const sisterNorm = resolve(resolveRepositoryRoot(), '..', 'staatsregierung', 'content', 'normen', 'ostdeutsches-schulgesetz');

describe.skipIf(!existsSync(join(sisterNorm, 'meta.json')))('OstRecht-Kompatibilität (reale Norm, nur lesend)', () => {
  it('liest das Ostdeutsche Schulgesetz aus ../staatsregierung ohne Informationsverlust', async () => {
    const record = await importOstRechtNorm(sisterNorm);
    expect(record.meta.jurisdiction).toBe('ost');
    expect(record.meta.slug).toBe('ostdeutsches-schulgesetz');
    expect(record.versions.length).toBeGreaterThanOrEqual(2);
    expect(record.meta.externalIdentifiers.some((identifier) => identifier.system === 'revosax')).toBe(true);
    const baseline = record.versions[0]!;
    expect(baseline.sourceValidFrom).toBeDefined();
    const counts = countBlockTypes(baseline.body);
    expect(counts.paragraph).toBeGreaterThan(50);
    expect(counts.subparagraph).toBeGreaterThan(100);
    const plan = buildProjectionPlan([record], { jurisdiction: 'ost', full: true, now: '2026-01-01T00:00:00.000Z', asOf: '2026-09-12' });
    expect(plan.stats.blocks).toBe(record.versions.reduce((sum, version) => sum + version.body.length, 0));
  });
});
