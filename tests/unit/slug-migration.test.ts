/**
 * Slugmigration sachlich falscher Slugs (Nutzerentscheidung Run 5): neuer Slug aus dem bereinigten Titel, alter Slug
 * stillgelegt und nie wieder vergeben, permanente Umleitung alt → neu im Worker. Keine Massenmigration.
 */
import { describe, expect, it } from 'vitest';

import { createSlugReserver, emptySlugRegistry, validateSlugRegistry, type SlugMigration } from '@landesrecht/importer-bayernrecht/common/slug-registry.ts';
import { parseSlugRedirects, SLUG_REDIRECTS_SCHEMA } from '@landesrecht/legal-core/config/slug-redirects.ts';

import { normRedirectLocation } from '../../apps/web/src/lib/norm-redirects.ts';

const OLD = 'staatsvertrag-zwischen-den-koenigreichen-bayern-wuerttemberg-und-baywue';
const migration: SlugMigration = { id: 'm1', sourceIdentity: 'StVIller', from: OLD, reason: 'historical-name-mis-transformed', evidence: 'x', decidedBy: 'Test', decidedAt: '2026-09-18' };

function registryWithOld() {
  const registry = emptySlugRegistry();
  registry.entries.push({ slug: OLD, sourceIdentity: 'StVIller', candidate: OLD, assignment: 'derived' });
  registry.entries.push({ slug: 'bestg-baywue', sourceIdentity: 'BayBestG', candidate: 'bestg-baywue', assignment: 'derived' });
  return registry;
}

describe('Slug-Registry: Migration und Stilllegung', () => {
  it('vergibt den neuen Slug aus dem heutigen Kandidaten und legt den alten still', () => {
    const registry = registryWithOld();
    const reserver = createSlugReserver(registry, new Set([OLD, 'bestg-baywue']), [migration]);
    const reservation = reserver.reserve('StVIller', 'staatsvertrag-zwischen-den-koenigreichen-bayern-und-baywue');
    expect(reservation).toMatchObject({ slug: 'staatsvertrag-zwischen-den-koenigreichen-bayern-und-baywue', newlyReserved: true, migratedFrom: OLD });
    expect(registry.retired).toEqual([{ slug: OLD, sourceIdentity: 'StVIller', successor: 'staatsvertrag-zwischen-den-koenigreichen-bayern-und-baywue', migration: 'm1' }]);
    expect(() => validateSlugRegistry(registry)).not.toThrow();
    // Zweiter Lauf: stabil, keine erneute Migration.
    const again = createSlugReserver(registry, new Set(), [migration]).reserve('StVIller', 'staatsvertrag-zwischen-den-koenigreichen-bayern-und-baywue');
    expect(again).toMatchObject({ slug: 'staatsvertrag-zwischen-den-koenigreichen-bayern-und-baywue', newlyReserved: false });
    expect(again.migratedFrom).toBeUndefined();
  });

  it('vergibt einen stillgelegten Slug nie wieder – auch nicht an eine andere Norm', () => {
    const registry = registryWithOld();
    createSlugReserver(registry, new Set(), [migration]).reserve('StVIller', 'staatsvertrag-neu-baywue');
    const other = createSlugReserver(registry, new Set(), []).reserve('BayAndere', OLD);
    expect(other.slug).not.toBe(OLD);
    expect(other.collision?.heldBy).toBe('stillgelegter Slug');
    registry.entries.push({ slug: OLD, sourceIdentity: 'BayDritte', candidate: OLD, assignment: 'derived' });
    expect(() => validateSlugRegistry(registry)).toThrow(/stillgelegt/u);
  });

  it('migriert nur mit Migrationseintrag und nur den genannten Slug – keine Massenmigration', () => {
    const registry = registryWithOld();
    const reservation = createSlugReserver(registry, new Set(), []).reserve('StVIller', 'staatsvertrag-neu-baywue');
    expect(reservation).toMatchObject({ slug: OLD, newlyReserved: false, candidateChanged: { previous: OLD, current: 'staatsvertrag-neu-baywue' } });
    const wrongFrom = createSlugReserver(registry, new Set(), [{ ...migration, from: 'anderer-slug-baywue' }]).reserve('StVIller', 'staatsvertrag-neu-baywue');
    expect(wrongFrom.slug).toBe(OLD);
    expect(registry.retired).toBeUndefined();
  });
});

describe('Umleitung stillgelegter Slugs', () => {
  const lookup = (jurisdiction: string, slug: string): string | undefined => (jurisdiction === 'baywue' && slug === OLD ? 'staatsvertrag-neu-baywue' : undefined);

  it('leitet Normseiten mit Unterpfad und Abfrage sowie die API permanent um', () => {
    const at = (path: string) => normRedirectLocation(new URL(`https://example.test${path}`), lookup as never);
    expect(at(`/bayern-wuerttemberg/norm/${OLD}/`)).toBe('/bayern-wuerttemberg/norm/staatsvertrag-neu-baywue/');
    expect(at(`/bayern-wuerttemberg/norm/${OLD}`)).toBe('/bayern-wuerttemberg/norm/staatsvertrag-neu-baywue/');
    expect(at(`/bayern-wuerttemberg/norm/${OLD}/quellen/?x=1`)).toBe('/bayern-wuerttemberg/norm/staatsvertrag-neu-baywue/quellen/?x=1');
    expect(at(`/bayern-wuerttemberg/norm/${OLD}/version/2023-12-01/`)).toBe('/bayern-wuerttemberg/norm/staatsvertrag-neu-baywue/version/2023-12-01/');
    expect(at(`/api/v1/norms/baywue/${OLD}`)).toBe('/api/v1/norms/baywue/staatsvertrag-neu-baywue');
    expect(at(`/api/v1/norms/bayern-wuerttemberg/${OLD}/versions`)).toBe('/api/v1/norms/bayern-wuerttemberg/staatsvertrag-neu-baywue/versions');
  });

  it('lässt alles andere unberührt – andere Slugs, andere Länder, andere Pfade', () => {
    const at = (path: string) => normRedirectLocation(new URL(`https://example.test${path}`), lookup as never);
    expect(at('/bayern-wuerttemberg/norm/bestg-baywue/')).toBeUndefined();
    expect(at(`/west/norm/${OLD}/`)).toBeUndefined();
    expect(at('/suche?q=Iller')).toBeUndefined();
    expect(at(`/unbekannt/norm/${OLD}/`)).toBeUndefined();
  });

  it('prüft die Umleitungsdatei: bekannte Länder, wohlgeformte Slugs, keine Ketten', () => {
    expect(parseSlugRedirects({ schemaVersion: SLUG_REDIRECTS_SCHEMA, jurisdictions: { baywue: { [OLD]: 'neu-baywue' } } }).get('baywue')?.get(OLD)).toBe('neu-baywue');
    expect(() => parseSlugRedirects({ schemaVersion: SLUG_REDIRECTS_SCHEMA, jurisdictions: { sachsen: {} } })).toThrow(/Jurisdiktion/u);
    expect(() => parseSlugRedirects({ schemaVersion: SLUG_REDIRECTS_SCHEMA, jurisdictions: { baywue: { a: 'b', b: 'c' } } })).toThrow(/Umleitungskette/u);
    expect(() => parseSlugRedirects({ schemaVersion: SLUG_REDIRECTS_SCHEMA, jurisdictions: { baywue: { 'A B': 'c' } } })).toThrow(/ungültig/u);
  });
});
