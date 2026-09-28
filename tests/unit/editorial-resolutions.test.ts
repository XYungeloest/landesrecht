import { describe, expect, it } from 'vitest';

import { resolveRelationNote, sourceStatusResolutions } from '@landesrecht/legal-core/lib/editorial-resolutions.ts';

describe('Redaktionelle Auflösungen', () => {
  const relation = { type: 'amends' as const, target: { slug: 'verfassung' }, note: 'Artikel 1; Rezept gesperrt' };
  const meta = {
    editorialResolutions: [
      { id: 'r1', kind: 'superseded-technical-note', date: '2026-09-29', relation: { type: 'amends', target: 'verfassung' }, supersededNote: 'Artikel 1; Rezept gesperrt', statement: 'Artikel 1; Rezept angewandt' },
      { id: 'q1', kind: 'source-status', date: '2026-09-29', statement: 'Original-Verkündungsblatt fehlt.' },
      { id: 'alt', quelle: 'übernommen' },
    ],
  };

  it('zeigt die aktuelle Aussage und kennzeichnet die überholte Notiz, nur bei exakt passender Beziehung und Notiz', () => {
    expect(resolveRelationNote(meta, relation)).toEqual({ note: 'Artikel 1; Rezept angewandt', superseded: { note: 'Artikel 1; Rezept gesperrt', date: '2026-09-29' } });
    expect(resolveRelationNote(meta, { ...relation, note: 'anders' })).toEqual({ note: 'anders' });
    expect(resolveRelationNote(meta, { ...relation, type: 'related' })).toEqual({ note: 'Artikel 1; Rezept gesperrt' });
    expect(resolveRelationNote({}, { type: 'related', target: { slug: 'x' } })).toEqual({});
  });

  it('liefert Hinweise zur Quellenlage', () => {
    expect(sourceStatusResolutions(meta)).toEqual([{ id: 'q1', statement: 'Original-Verkündungsblatt fehlt.', date: '2026-09-29' }]);
  });
});
