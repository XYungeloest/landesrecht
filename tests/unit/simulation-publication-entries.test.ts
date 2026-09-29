/**
 * Inhaltsverzeichnis der Sim-Verkündungen (packages/importers/simulation/src/publications/entries.ts, Gate G12): jeder in
 * einer Ausgabe abgedruckte Akt steht als Eintrag in ihrer Publication – auch ohne veröffentlichte Portalnorm.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { parsePublication } from '@landesrecht/legal-core/lib/schema.ts';
import { actEntryTitle, auditPublicationEntries, citationHead, entryCitation, syncPublicationEntries } from '@landesrecht/importer-simulation/publications/entries.ts';

import { entryLinkFor, entryStatusLabel } from '../../apps/web/src/lib/publication-view.ts';
import { cleanupTempRoots, tempRoot } from '../helpers/bayernrecht-state.ts';

afterAll(cleanupTempRoots);

const SHA = 'a'.repeat(64);

async function put(root: string, path: string, value: unknown): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
}

const publication = (entries: unknown[] = []) => ({ slug: 'mbl-west-2026-3-20260909', jurisdiction: 'west', title: 'MBl. WD 2026 Nr. 3', gazette: 'MBl. WD', year: 2026, issue: '3', date: '2026-09-09', entries });

async function repository(options: { entries?: unknown[]; ledgerStatus?: string; exceptions?: unknown[] } = {}): Promise<string> {
  const root = await tempRoot('landesrecht-publication-entries-');
  await put(root, 'data/simulation/west/sources.json', { schemaVersion: 1, jurisdiction: 'west', sources: [{ sha256: SHA, publication: { slug: 'mbl-west-2026-3-20260909', seriesCode: 'MBl. WD', year: 2026, number: '3', date: '2026-09-09' }, acts: [
    { title: 'Runderlass zur Trauerbeflaggung', kind: 'runderlass', pages: '3–4', documentDate: '2026-09-09' },
    { title: 'Gesetz zur Förderung der Jugend', kind: 'gesetz', pages: '5', documentDate: '2026-09-08', actSlug: 'jugendg-west' },
  ] }] });
  await put(root, 'data/simulation/west/ledger.json', { schemaVersion: 'landesrecht-simulation-ledger/1', jurisdiction: 'west', events: [
    { id: 'e-trauer', type: 'temporary-rule', status: options.ledgerStatus ?? 'review', reasonCode: 'promulgation-unclear', act: { slug: null, title: 'Runderlass zur Trauerbeflaggung' }, publication: { slug: 'mbl-west-2026-3-20260909' }, evidence: [SHA] },
    { id: 'e-jugend', type: 'enact', status: 'applied', act: { slug: 'jugendg-west', title: 'Gesetz zur Förderung der Jugend' }, publication: { slug: 'mbl-west-2026-3-20260909' }, evidence: [SHA] },
  ] });
  await put(root, 'content/norms/west/jugendg-west/versions/2026-09-09.json', { versionId: '2026-09-09', sourceReferences: [{ publicationSlug: 'mbl-west-2026-3-20260909' }] });
  await put(root, 'content/publications/west/mbl-west-2026-3-20260909.json', publication(options.entries ?? []));
  if (options.exceptions) await put(root, 'data/simulation/publication-entry-exceptions.json', { exceptions: options.exceptions });
  return root;
}

describe('Modell: Eintrag ohne Portalnorm', () => {
  it('normSlug und versionId sind optional; versionId nur mit normSlug, Stand nur ohne normSlug', () => {
    const entry = { title: 'Runderlass', citation: 'Runderlass (MBl. WD 2026 Nr. 3 S. 3)', ledgerEvents: ['e'], consolidationStatus: 'review' };
    expect(parsePublication(publication([entry])).entries[0]).toEqual(entry);
    expect(() => parsePublication(publication([{ ...entry, versionId: '2026-09-09' }]))).toThrow(/nur zusammen mit normSlug/u);
    expect(() => parsePublication(publication([{ ...entry, normSlug: 'x-west' }]))).toThrow(/nur ohne normSlug/u);
    expect(() => parsePublication(publication([{ ...entry, consolidationStatus: 'applied' }]))).toThrow(/consolidationStatus/u);
  });

  it('UI: ohne Portalnorm kein Link, sondern der Stand', () => {
    expect(entryLinkFor('west', { title: 'x' } as never, null)).toBeUndefined();
    expect(entryStatusLabel({ consolidationStatus: 'review' })).toBe('in Prüfung');
    expect(entryStatusLabel({ consolidationStatus: 'blocked' })).toBe('Konsolidierung gesperrt');
    expect(entryStatusLabel({ consolidationStatus: 'not-promulgated' })).toBe('nicht im veröffentlichten Bestand');
    expect(entryStatusLabel({})).toBe('nicht im veröffentlichten Bestand');
    expect(entryStatusLabel({ normSlug: 'fehlt-west' })).toBe('nicht im Bestand');
  });
});

describe('Inhaltsverzeichnis aus dem Quelleninventar', () => {
  it('leere Ausgabe: Gate schlägt fehl, --write ergänzt jeden Akt, danach grün und idempotent', async () => {
    const root = await repository();
    const before = await auditPublicationEntries(root, 'west');
    expect(before.problems.join('\n')).toMatch(/Runderlass zur Trauerbeflaggung.*fehlt im Inhaltsverzeichnis/u);
    expect(before.emptyBefore).toBe(1);
    const sync = await syncPublicationEntries(root, 'west', { write: true });
    expect(sync.emptyAfter).toBe(0);
    const written = parsePublication(JSON.parse(await readFile(join(root, 'content/publications/west/mbl-west-2026-3-20260909.json'), 'utf8')));
    expect(written.entries).toEqual([
      { title: 'Runderlass zur Trauerbeflaggung', type: 'runderlass', citation: 'Runderlass vom 9. September 2026 (MBl. WD 2026 Nr. 3 S. 3)', pages: '3–4', startPage: 3, documentDate: '2026-09-09', ledgerEvents: ['e-trauer'], consolidationStatus: 'review' },
      // Sichere Zuordnung über actSlug mit vorhandener Norm; die Fassung belegt diese Ausgabe.
      { title: 'Gesetz zur Förderung der Jugend', type: 'gesetz', citation: 'Gesetz vom 8. September 2026 (MBl. WD 2026 Nr. 3 S. 5)', normSlug: 'jugendg-west', versionId: '2026-09-09', pages: '5', startPage: 5, documentDate: '2026-09-08' },
    ]);
    expect((await auditPublicationEntries(root, 'west')).problems).toEqual([]);
    const again = await syncPublicationEntries(root, 'west', { write: true });
    expect(again.written).toEqual([]);
  });

  it('bestehende Einträge bleiben unverändert; ein veralteter Stand wird erkannt und fortgeschrieben', async () => {
    const existing = { title: 'Gesetz zur Förderung der Jugend', type: 'gesetz', citation: 'Gesetz vom 8. September 2026 (MBl. WD 2026 Nr. 3 S. 5)', normSlug: 'jugendg-west', versionId: '2026-09-09', pages: '5', startPage: 5, documentDate: '2026-09-08' };
    const stale = { title: 'Runderlass zur Trauerbeflaggung', type: 'runderlass', citation: 'Runderlass vom 9. September 2026 (MBl. WD 2026 Nr. 3 S. 3)', pages: '3–4', startPage: 3, documentDate: '2026-09-09', ledgerEvents: ['e-trauer'], consolidationStatus: 'review' };
    const root = await repository({ entries: [stale, existing], ledgerStatus: 'blocked' });
    expect((await auditPublicationEntries(root, 'west')).problems.join('\n')).toMatch(/Stand von „Runderlass zur Trauerbeflaggung“ veraltet \(review → blocked\)/u);
    await syncPublicationEntries(root, 'west', { write: true });
    const written = parsePublication(JSON.parse(await readFile(join(root, 'content/publications/west/mbl-west-2026-3-20260909.json'), 'utf8')));
    expect(written.entries[1]).toEqual(existing);
    expect(written.entries[0]!.consolidationStatus).toBe('blocked');
  });

  it('Gate: Dubletten, falsche Seiten, falsche Identität; dokumentierte Ausnahme erlaubt eine Lücke', async () => {
    const trauer = { title: 'Runderlass zur Trauerbeflaggung', citation: 'x', pages: '9', startPage: 9, documentDate: '2026-09-09', ledgerEvents: ['e-trauer'], consolidationStatus: 'review' };
    const jugend = { title: 'Gesetz zur Förderung der Jugend', citation: 'y', normSlug: 'jugendg-west', startPage: 5 };
    const root = await repository({ entries: [trauer, jugend, jugend] });
    const problems = (await auditPublicationEntries(root, 'west')).problems.join('\n');
    expect(problems).toMatch(/Seiten 9 ≠ Inventar 3–4/u);
    expect(problems).toMatch(/doppelte Einträge/u);
    const excepted = await repository({ entries: [jugend], exceptions: [{ jurisdiction: 'west', publication: 'mbl-west-2026-3-20260909', actTitle: 'Runderlass zur Trauerbeflaggung', reason: 'Beleg unklar' }] });
    expect((await auditPublicationEntries(excepted, 'west')).problems).toEqual([]);
    const wrongIdentity = await repository({ entries: [trauer, jugend] });
    await put(wrongIdentity, 'content/publications/west/mbl-west-2026-3-20260909.json', { ...publication([{ ...trauer, pages: '3–4', startPage: 3 }, jugend]), issue: '2' });
    expect((await auditPublicationEntries(wrongIdentity, 'west')).problems.join('\n')).toMatch(/Nummer 2 ≠ Inventar 3/u);
  });

  it('Eintragstitel wie gedruckt: Kurzbezeichnung ergänzt, wenn der Titel sie nicht enthält', () => {
    expect(actEntryTitle({ title: 'Westdeutsche Brandsoforthilfeverordnung', abbr: 'WBrSHV' })).toBe('Westdeutsche Brandsoforthilfeverordnung (WBrSHV)');
    expect(actEntryTitle({ title: 'Schulisches Sprachgebrauchsgesetz (SchuSprG)', abbr: 'SchuSprG' })).toBe('Schulisches Sprachgebrauchsgesetz (SchuSprG)');
    expect(actEntryTitle({ title: 'Runderlass', abbr: null })).toBe('Runderlass');
  });

  it('Fundstellenkopf folgt der Blattreihe (Teil n/Jahr bei NSH)', () => {
    const nsh = { slug: 'a', jurisdiction: 'nsh', title: 't', gazette: 'NH GVBl. MAL-I', year: 2024, issue: '1', date: '2024-02-12', entries: [], sourceReferences: [] } as never;
    const sibling = { slug: 'b', jurisdiction: 'nsh', title: 't', gazette: 'NH GVBl. MAL-I', year: 2024, issue: '2', date: '2024-03-04', entries: [{ title: 'x', citation: 'Gesetz vom 3. März 2024 (NH GVBl. MAL-I Teil 2/2024 S. 3–7)' }], sourceReferences: [] } as never;
    expect(citationHead(nsh, [sibling])).toBe('NH GVBl. MAL-I Teil 1/2024');
    expect(entryCitation({ title: 'Landesverfassung', kind: 'verfassung', pages: '4–26', documentDate: '2024-02-10' }, 'NH GVBl. MAL-I Teil 1/2024')).toBe('Verfassung vom 10. Februar 2024 (NH GVBl. MAL-I Teil 1/2024 S. 4)');
  });
});
