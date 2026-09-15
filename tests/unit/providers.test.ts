import { describe, expect, it } from 'vitest';

import { createLegalReference, parseLegalReference, parseProvision } from '@landesrecht/legal-core/lib/references.ts';
import { createContentProvider } from '@landesrecht/providers/content-provider.ts';
import { buildFederalNormUrl, createFederalProvider, federalNormKey } from '@landesrecht/providers/federal.ts';
import { buildOstRechtNormUrl, createOstRechtProvider } from '@landesrecht/providers/ostrecht-provider.ts';
import { createReferenceResolver } from '@landesrecht/providers/resolver.ts';
import { createFileNormStore } from '@landesrecht/runtime/file-store.ts';
import { createStoreRegistry } from '@landesrecht/runtime/registry.ts';

import { buildFixtureNorms, FIXTURE_REFERENCE_DATE } from '../helpers/fixture-corpus.ts';

const norms = buildFixtureNorms();
const registry = createStoreRegistry(Object.fromEntries((['west', 'nsh', 'ost', 'baywue'] as const).map((jurisdiction) => [jurisdiction, createFileNormStore(jurisdiction, norms, { asOf: FIXTURE_REFERENCE_DATE })])));

describe('Bundesrechtsresolver', () => {
  it('bildet stabile externe Links an genau einer Stelle', async () => {
    expect(buildFederalNormUrl('BGB')).toBe('https://gesetze-sim-internet.de/gesetz.php?g=bgb');
    expect(buildFederalNormUrl('GG')).toBe('https://gesetze-sim-internet.de/gesetz.php?g=gg');
    expect(buildFederalNormUrl('BGB', '§ 823')).toBe('https://gesetze-sim-internet.de/gesetz.php?g=bgb&p=823');
    expect(buildFederalNormUrl('GG', 'Art. 5 Abs. 1')).toBe('https://gesetze-sim-internet.de/gesetz.php?g=gg&art=5&abs=1');
    expect(federalNormKey('StVO ')).toBe('stvo');
    const provider = createFederalProvider();
    expect(provider.providesNorms).toBe(false);
    const resolved = await provider.resolveReference(createLegalReference('bund', 'BGB', { provision: '§ 823' }));
    expect(resolved).toMatchObject({ external: true, label: 'BGB § 823', url: 'https://gesetze-sim-internet.de/gesetz.php?g=bgb&p=823' });
    expect(await provider.resolveReference(createLegalReference('west', 'x'))).toBeNull();
  });
});

describe('Rechtsverweise', () => {
  it('parst strukturierte Verweise ohne URL', () => {
    const reference = parseLegalReference({ type: 'legalReference', jurisdiction: 'bund', norm: 'BGB', provision: '§ 823' });
    expect(reference).toEqual({ type: 'legalReference', jurisdiction: 'bund', norm: 'BGB', provision: '§ 823' });
    expect(() => parseLegalReference({ type: 'legalReference', jurisdiction: 'sachsen', norm: 'x' })).toThrow(/Rechtsordnung/u);
    expect(parseProvision('Art. 5 Abs. 1')).toEqual({ kind: 'article', number: '5', subsection: '1' });
    expect(parseProvision('§ 12a')).toEqual({ kind: 'paragraph', number: '12a' });
  });

  it('der Resolver leitet je Rechtsordnung an den richtigen Provider', async () => {
    const resolver = createReferenceResolver([
      createFederalProvider(),
      createOstRechtProvider({ siteUrl: 'https://recht.freistaat-ostdeutschland.de' }),
      createContentProvider(registry, { jurisdictions: ['west', 'nsh', 'baywue'] }),
    ]);
    expect((await resolver.resolve(createLegalReference('bund', 'GG')))?.url).toBe('https://gesetze-sim-internet.de/gesetz.php?g=gg');
    expect((await resolver.resolve(createLegalReference('ost', 'ostdeutsches-schulgesetz', { provision: '§ 1' })))).toMatchObject({ external: true, url: 'https://recht.freistaat-ostdeutschland.de/norm/ostdeutsches-schulgesetz/#paragraph-1' });
    expect((await resolver.resolve(createLegalReference('west', 'WTestG', { provision: '§ 2 Abs. 3' })))).toMatchObject({ external: false, url: '/west/norm/testgesetz-west/#paragraph-2' });
    expect((await resolver.resolve(createLegalReference('baywue', 'LO BayWü', { provision: 'Art. 5', versionId: '2023-12-01' })))?.url).toBe('/bayern-wuerttemberg/norm/landesordnung-baywue/version/2023-12-01/#artikel-5');
    expect(await resolver.resolve(createLegalReference('nsh', 'unbekannt'))).toBeNull();
    expect(resolver.providerFor('ost')?.id).toBe('ostrecht');
    expect(resolver.providerFor('west')?.id).toBe('landesrecht');
    expect(buildOstRechtNormUrl('https://x.test/', 'a', '2024-01-01', 'paragraph-1')).toBe('https://x.test/norm/a/version/2024-01-01/#paragraph-1');
  });

  it('der ContentProvider liefert Normen, Fassungen und Suche über die Registry', async () => {
    const provider = createContentProvider(registry);
    const record = await provider.getNorm('west', 'testgesetz-west');
    expect(record?.versions).toHaveLength(2);
    expect((await provider.listVersions('west', 'testgesetz-west')).map((version) => version.versionId)).toEqual(['2023-12-01', '2026-03-01']);
    expect((await provider.getNormVersion('west', 'testgesetz-west', '2023-12-01'))?.body).toHaveLength(1);
    expect(await provider.getNorm('west', 'fehlt')).toBeNull();
  });
});
