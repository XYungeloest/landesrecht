/**
 * Verkündungsseiten und -API: Adressen nur über routes.ts, Worker-Routen mit `prerender = false`, Links der
 * Einträge (geltende Fassung, entstandene Fassung, Änderungsvorschrift), Brotkrume mit heutiger Jurisdiktion,
 * Quellenbelege ohne Bilddaten, Teilbestandshinweis mit getrennter Baseline- und Sim-Normzahl.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { getApiPublicationsUrl, getApiPublicationUrl, getPublicationsUrl, getPublicationUrl } from '@landesrecht/legal-core/lib/routes.ts';
import type { NormSummary } from '@landesrecht/runtime/store.ts';

import { entryLinkFor, entryLinkKey } from '../../apps/web/src/lib/publication-view.ts';

const web = join(resolveRepositoryRoot(), 'apps', 'web', 'src');
const read = (relative: string): Promise<string> => readFile(join(web, relative), 'utf8');

describe('Adressen der Verkündungen', () => {
  it('bildet Übersicht, Ausgabe und API-Adressen aus dem öffentlichen Segment', () => {
    expect(getPublicationsUrl('baywue')).toBe('/bayern-wuerttemberg/verkuendungen/');
    expect(getPublicationUrl('west', 'gv-west-2026-2-20260517')).toBe('/west/verkuendungen/gv-west-2026-2-20260517/');
    expect(getPublicationUrl('west', 'gv-west-2026-2-20260517-a1b2c3d4')).not.toBe(getPublicationUrl('west', 'gv-west-2026-2-20260517'));
    expect(getApiPublicationsUrl('nsh')).toBe('/api/v1/publications/nsh');
    expect(getApiPublicationUrl('nsh', 'gvobl-nsh-2024-1')).toBe('/api/v1/publications/nsh/gvobl-nsh-2024-1');
  });
});

describe('Links der Verkündungseinträge', () => {
  const summary = (overrides: Partial<NormSummary> = {}): NormSummary => ({ jurisdiction: 'west', slug: 'schulg-west', title: 'Schulgesetz', shortTitle: 'SchulG', type: 'gesetz', status: 'in-force', currentVersionId: '2026-05-18', currentValidFrom: '2026-05-18', versionCount: 2, lastChangeDate: '2026-05-18', subjects: [], url: '/west/norm/schulg-west/', simulationChangeKind: 'baseline-changed', lastSimulationChangeDate: '2026-05-18', ...overrides });

  it('führt zur geltenden Fassung, zur entstandenen Fassung oder als Vorschrift mit Historie; unbekannte Normen bleiben ohne Link', () => {
    expect(entryLinkFor('west', { normSlug: 'schulg-west', versionId: '2026-05-18' }, summary())).toEqual({ href: '/west/norm/schulg-west/', label: 'Geltende Fassung' });
    expect(entryLinkFor('west', { normSlug: 'schulg-west' }, summary())).toEqual({ href: '/west/norm/schulg-west/', label: 'Geltende Fassung' });
    expect(entryLinkFor('west', { normSlug: 'schulg-west', versionId: '2024-04-23' }, summary())).toEqual({ href: '/west/norm/schulg-west/version/2024-04-23/', label: 'Fassung vom 23. April 2024' });
    expect(entryLinkFor('west', { normSlug: 'aendg-west', versionId: '2026-05-18' }, summary({ slug: 'aendg-west', type: 'aenderungsvorschrift' }))).toEqual({ href: '/west/norm/aendg-west/', label: 'Als Vorschrift öffnen', historyUrl: '/west/norm/aendg-west/historie/' });
    expect(entryLinkFor('west', { normSlug: 'fehlt-west' }, null)).toBeUndefined();
    expect(entryLinkKey({ normSlug: 'a', versionId: 'b' })).toBe('a#b');
    expect(entryLinkKey({ normSlug: 'a' })).toBe('a#');
  });
});

describe('Seiten und API (Quelltext-Regressionen)', () => {
  it('die Verkündungsrouten laufen im Worker und bilden Adressen nur über routes.ts', async () => {
    for (const file of ['pages/[jurisdiction]/verkuendungen/index.astro', 'pages/[jurisdiction]/verkuendungen/[slug].astro', 'pages/api/v1/publications/[jurisdiction]/index.ts', 'pages/api/v1/publications/[jurisdiction]/[slug].ts']) {
      const source = await read(file);
      expect(source, file).toContain('export const prerender = false;');
      expect(source, file).not.toMatch(/['`]\/verkuendungen\//u);
      expect(source, file).toMatch(/getPublicationUrl|getPublicationsUrl|getApiPublicationUrl/u);
    }
  });

  it('die Übersicht zeigt Blattname wie gedruckt, Datum, Nummer, Einträge und die heutige Jurisdiktion in der Brotkrume', async () => {
    const source = await read('pages/[jurisdiction]/verkuendungen/index.astro');
    expect(source).toContain('listPublications()');
    expect(source).toContain('publication.seriesTitle ?? publication.gazette');
    expect(source).toContain('getPublicationLabel(publication)');
    expect(source).toContain('resolveEntryLinks');
    expect(source).toContain('<li><a href={getJurisdictionUrl(id)}>{jurisdiction.name}</a></li><li>Verkündungen</li>');
    expect(source).toContain('<InventoryNotice jurisdiction={id} />');
  });

  it('die Ausgabe zeigt Einträge mit Seiten und Quellen ohne Speichertechnik (kein SHA-256, kein Archivobjekt), ohne Bilddaten', async () => {
    const source = await read('pages/[jurisdiction]/verkuendungen/[slug].astro');
    expect(source).toContain('getPublication(Astro.params.slug)');
    expect(source).toContain('<SourceList sources={publication.sourceReferences} jurisdiction={id} />');
    expect(source).toContain('publicationEntryPages(entry)');
    expect(source).not.toContain('<img');
    expect(source).toContain('getPublicationsUrl(id)}>Verkündungen</a>');
    expect(source).not.toMatch(/SHA-256|Archivobjekt/u);
    const sources = await read('components/SourceList.astro');
    expect(sources).not.toMatch(/<dt>SHA-256<\/dt>|<dt>Archivobjekt<\/dt>|objectKey\}|source\.sha256\}/u);
    expect(sources).toContain("'simulation-gazette': 'Verkündungsblatt der Simulation'");
  });

  it('Historie und Länderseite verlinken Verkündungen', async () => {
    const historie = await read('pages/[jurisdiction]/norm/[slug]/historie.astro');
    expect(historie).toContain('publicationSlugsByVersion(record.versions)');
    expect(historie).toContain('store.getPublication(slug)');
    expect(historie).toContain('publicationFor(entry.versionId)');
    const index = await read('pages/[jurisdiction]/index.astro');
    expect(index).toContain('getPublicationsUrl(id)');
    expect(index).toContain('store.listPublications()');
  });

  it('der Bestandshinweis ist ein knapper fachlicher Satz ohne Arbeitsbegriffe und hängt allein an den Daten', async () => {
    const notice = await read('components/InventoryNotice.astro');
    expect(notice).toContain('getInventoryNotice(jurisdiction)');
    expect(notice).toContain('Ausgangspunkt der Simulation ist der Rechtsstand vom');
    expect(notice).toContain('Einzelne historische oder veröffentlichte Quellen sind noch nicht vollständig erschlossen.');
    expect(notice).toContain('PORTAL_PATHS.about');
    expect(notice).not.toMatch(/FROZEN|PARTIAL|Baseline-Status|eingefroren|Fingerabdruck|Ausgaben liegen vor|in Prüfung|gesperrt|2023-12-01|West|BayWü/u);
  });
});
