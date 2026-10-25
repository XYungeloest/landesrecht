import { evaluateDocument } from '@landesrecht/search/ranking.ts';
import { buildSearchDocument } from '@landesrecht/search/units.ts';
import { describe, expect, it } from 'vitest';
import { buildAnchorMap, getProvisionEntries } from '@landesrecht/legal-core/lib/body.ts';
import { getProvisionUrl } from '@landesrecht/legal-core/lib/routes.ts';
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { article, paragraph, norm, FIXTURE_REFERENCE_DATE } from '../helpers/fixture-corpus.ts';
import { buildSearchQueryPlan, createSearchState, parsePublicSearchState, parseSearchState } from '@landesrecht/search/query.ts';
import { createFileNormStore } from '@landesrecht/runtime/file-store.ts';

const body: NormBodyBlock[] = [
  { type: 'chapter', label: 'Kapitel I', children: [paragraph('§ 8', 'Aufgaben', 'Wortlaut'), paragraph('§ 8a', 'Ergänzung', 'Text')] },
  { type: 'quotedProvision', children: [paragraph('§ 8', 'Zitat', 'Fremdtext')] },
  { type: 'annex', label: 'Anlage 1', children: [paragraph('§ 8', 'Anlage', 'Anlagentext')] },
  article('Art. IV', 'Römisch', 'Artikeltext'), article('Art. 5', 'Freiheit', 'Alle sind frei.'),
];
describe('Einzelvorschriften und öffentlicher Suchumfang', () => {
  it('behält Originalpfade und Anker, grenzt Zitate und Anlagen ab', () => {
    const anchors = buildAnchorMap(body);
    const entries = getProvisionEntries(body, anchors);
    expect(entries.map((entry) => entry.anchor)).toEqual(['paragraph-8', 'paragraph-8a', 'anlage-1-paragraph-8', 'artikel-iv', 'artikel-5']);
    expect(entries[0]!.path).toEqual([0, 0]);
    expect(entries.find((entry) => entry.anchor === 'paragraph-9')).toBeUndefined();
    expect(getProvisionUrl('ost', 'ostdeutsches-hochschulgesetz', entries[0]!.anchor)).toBe('/ost/norm/ostdeutsches-hochschulgesetz/paragraph-8/');
    expect(getProvisionUrl('ost', 'osthsg', 'paragraph-8', '2023-12-01')).toBe('/ost/norm/osthsg/version/2023-12-01/paragraph-8/');
  });
  it('ändert nur den öffentlichen Standard, explizite Typen bleiben erreichbar', () => {
    expect(parseSearchState(new URLSearchParams()).bereich).toBeUndefined();
    expect(parsePublicSearchState(new URLSearchParams()).bereich).toBe('gesetze');
    expect(parsePublicSearchState(new URLSearchParams('type=verwaltungsvorschrift')).bereich).toBe('alle');
    expect(parsePublicSearchState(new URLSearchParams('scope=body&bereich=alle')).scope).toBe('body');
  });
  it('findet Identität, Artikel, Volltext und alle Länder; erweiterte Vorschriften bleiben erhalten', async () => {
    for (const jurisdiction of ['west', 'nsh', 'ost', 'baywue'] as const) {
      const make = (slug: string, type: string, title: string, abbr: string, blocks = body) => norm({ jurisdiction, slug, meta: { type, title, shortTitle: title, abbr }, versions: [{ versionId: '2023-12-01', simulationValidFrom: '2023-12-01', body: blocks }] });
      const records = [make('hsg', 'gesetz', 'Ostdeutsches Hochschulgesetz', 'OstHSG'), make('pvdg', 'gesetz', 'Polizeivollzugsdienstgesetz', 'PVDG'), make('vv', 'verwaltungsvorschrift', 'Verwaltung', 'VV'), make('abkommen', 'verwaltungsabkommen', 'Abkommen', 'VA'), make('erwaehnung', 'gesetz', 'Andere Norm', 'AN', [paragraph('§ 1', 'Bezug', 'Polizeivollzugsdienstgesetz '.repeat(30))])];
      const store = createFileNormStore(jurisdiction, records, { asOf: FIXTURE_REFERENCE_DATE });
      const search = (q: string, params = '') => store.search(parsePublicSearchState(new URLSearchParams(`q=${encodeURIComponent(q)}&jurisdiction=${jurisdiction}&${params}`)));
      expect((await search('Polizeivollzugsdienstgesetz')).hits[0]!.slug).toBe('pvdg');
      expect((await search('OstHSG')).hits[0]!.slug).toBe('hsg');
      expect((await search('§ 8 OstHSG')).hits[0]!.unit!.url).toBe(getProvisionUrl(jurisdiction, 'hsg', 'paragraph-8'));
      expect((await search('Art. 5')).hits[0]!.unit!.url).toContain('/artikel-5/');
      expect((await search('Wortlaut')).total).toBe(2);
      expect((await search('')).total).toBe(3);
      expect((await search('', 'bereich=alle')).total).toBe(5);
      expect((await search('', 'type=verwaltungsvorschrift')).hits[0]!.slug).toBe('vv');
      expect((await search('', 'bereich=gesetze&type=verwaltungsabkommen')).hits[0]!.slug).toBe('abkommen');
      expect((await store.search(createSearchState({ q: '§ 9 OstHSG' }))).total).toBe(0);
    }
  });
});

it('priorisiert Hauptvorschriften, löst eindeutige verschachtelte Adressen auf und behauptet bei Mehrdeutigkeit keine Einzeladresse', () => {
  const run = (blocks: NormBodyBlock[]) => {
    const record = norm({ jurisdiction: 'west', slug: 'nested', versions: [{ versionId: '2023-12-01', simulationValidFrom: '2023-12-01', body: blocks }] });
    return evaluateDocument(buildSearchDocument(record, record.versions[0]!, FIXTURE_REFERENCE_DATE), buildSearchQueryPlan(createSearchState({ q: '§ 8' })))!;
  };
  expect(run(body).unit!.url).toBe('/west/norm/nested/paragraph-8/');
  expect(run([body[2]!]).unit!.url).toBe('/west/norm/nested/anlage-1-paragraph-8/');
  expect(run([body[2]!, { type: 'annex', label: 'Anlage 2', children: [paragraph('§ 8', 'Weitere Anlage', 'Text')] }]).unit!.url).toContain('/#anlage-1-paragraph-8');
});
