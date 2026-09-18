/**
 * Beschaffung des BAYERN.RECHT-Bestands (`fetch-corpus`): Wiederanlauf, Budgets, Unversehrtheit der
 * Rohquelle, ZIP-Prüfung und Determinismus des Fortschrittszustands.
 *
 * Kein Test geht ins Netz: Die Abrufe laufen über eine vorgegebene `fetch`-Implementierung, die Uhr und
 * die Wartezeiten sind gestellt. Geprüft wird an den Eigenschaften, auf die sich ein stundenlanger Lauf
 * verlässt – nicht an der Formulierung einzelner Meldungen:
 *
 *   - Was im Cache liegt, wird nicht erneut geholt (der Wiederanlauf ist der Normalfall).
 *   - Ein Budgetende ist ein sauberer Halt: Offenes bleibt offen, der nächste Lauf macht weiter.
 *   - Andere Bytes an derselben Adresse sind ein **Befund**, kein stiller Ersatz – der Cacheeintrag
 *     bleibt Byte für Byte, wie er war.
 *   - Eine Antwort, die kein ZIP ist, wird als Fehler geführt und **nicht** als Bestand behalten.
 *   - Zweimal derselbe Stand, zweimal dieselbe Zustandsdatei.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { cacheKey } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import { CACHE_DIR, type SourceArea } from '@landesrecht/importer-bayernrecht/common/constants.ts';
import { enumerationFingerprint, ENUMERATION_SCHEMA, type EnumerationFile, type EnumerationItem } from '@landesrecht/importer-bayernrecht/enumerate/enumeration.ts';
import { peekCachedPackage } from '@landesrecht/importer-bayernrecht/fetch/cache.ts';
import { renderFetchReport } from '@landesrecht/importer-bayernrecht/fetch/report.ts';
import { formatBytes, runFetchCorpus, zipProblem, VERIFY_SUBDIR, type FetchCorpusOptions, type FetchCorpusResult } from '@landesrecht/importer-bayernrecht/fetch/run.ts';
import { FETCH_STATE_PATH, readFetchState } from '@landesrecht/importer-bayernrecht/fetch/state.ts';
import { cleanupTempRoots, tempRoot } from '../helpers/bayernrecht-state.ts';

afterAll(cleanupTempRoots);

const zipUrl = (documentId: string): string => `https://www.gesetze-bayern.de/Content/Zip/${documentId}`;
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Bytes, die als Paket durchgehen: ZIP-Signatur „PK\x03\x04“ und beliebiger Inhalt (nie entpackt). */
function zipBytes(payload: string): Uint8Array {
  return new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...Buffer.from(payload, 'utf8')]);
}

function enumerationItem(documentId: string, overrides: Partial<EnumerationItem> = {}): EnumerationItem {
  return {
    key: documentId,
    sourceIdentity: documentId,
    documentId,
    title: `Titel ${documentId}`,
    titleSource: 'fortfuehrungsnachweis',
    normType: 'ges',
    normTypeSource: 'facet-hitlist',
    sourceUrl: `https://www.gesetze-bayern.de/Content/Document/${documentId}`,
    zipUrl: zipUrl(documentId),
    listingUrl: 'https://www.gesetze-bayern.de/Content/Document/ffn',
    sourceSha256: 'b'.repeat(64),
    retrievedAt: '2026-09-17T07:48:50.997Z',
    listings: [{ kind: 'fortfuehrungsnachweis', url: 'https://www.gesetze-bayern.de/Content/Document/ffn', sha256: 'b'.repeat(64), retrievedAt: '2026-09-17T07:48:50.997Z' }],
    status: 'pending',
    signals: { fortfuehrungsnachweis: true, facet: true, manifest: false },
    attempts: 0,
    ...overrides,
  };
}

function enumerationFixture(area: SourceArea, items: EnumerationItem[]): EnumerationFile {
  const file: EnumerationFile = {
    schemaVersion: ENUMERATION_SCHEMA,
    sourceArea: area,
    baselineDate: '2023-12-01',
    generatedAt: '2026-09-17T09:38:02.482Z',
    contentFingerprint: '',
    sources: {
      fortfuehrungsnachweis: { url: 'https://www.gesetze-bayern.de/Content/Document/ffn', sha256: 'b'.repeat(64), retrievedAt: '2026-09-17T07:48:50.997Z', byteLength: 1000, entries: items.length, sections: 1, unlinkedRows: 0 },
      facets: { normTypes: ['ges'], pages: 1, documents: items.length, total: items.length, complete: true, inventoryPath: 'data/audits/bayernrecht/facet-inventory.json', inventoryFingerprint: 'c'.repeat(64) },
    },
    crosscheck: {
      fortfuehrungsnachweisEntries: items.length,
      fortfuehrungsnachweisUnlinkedRows: 0,
      facetDocuments: items.length,
      facetTotal: items.length,
      inBoth: items.length,
      onlyFortfuehrungsnachweis: 0,
      onlyFacet: 0,
      onlyFortfuehrungsnachweisIds: [],
      onlyFacetIds: [],
      items: items.length,
      withNormType: items.length,
      withBayRsNumber: 0,
      carriedFromManifest: 0,
      duplicateIds: 0,
      ok: true,
      problems: [],
      notes: [],
    },
    items,
  };
  return { ...file, contentFingerprint: enumerationFingerprint(file) };
}

/** Temporäres Root mit Enumeration beider Bereiche – der echte Bestand wird nie angefasst. */
async function fixtureRoot(landesrecht: string[], vwv: string[] = []): Promise<string> {
  const root = await tempRoot('landesrecht-bayernrecht-fetch-');
  await mkdir(join(root, 'data/imports/bayernrecht'), { recursive: true });
  await writeFile(join(root, 'data/imports/bayernrecht/enumeration-landesrecht.json'), JSON.stringify(enumerationFixture('landesrecht', landesrecht.map((id) => enumerationItem(id))), null, 2), 'utf8');
  await writeFile(join(root, 'data/imports/bayernrecht/enumeration-vwv.json'), JSON.stringify(enumerationFixture('vwv', vwv.map((id) => enumerationItem(id, { normType: 'vv' }))), null, 2), 'utf8');
  return root;
}

/** Legt einen Cacheeintrag an – genau in der Form, die der gemeinsame Fetcher schreibt. */
async function seedCache(root: string, url: string, bytes: Uint8Array, contentType = 'application/zip'): Promise<string> {
  const directory = join(root, CACHE_DIR);
  await mkdir(directory, { recursive: true });
  const key = cacheKey(url);
  const digest = sha256(bytes);
  await writeFile(join(directory, `${key}.bin`), bytes);
  await writeFile(join(directory, `${key}.json`), `${JSON.stringify({ url, finalUrl: url, status: 200, contentType, retrievedAt: '2026-09-17T09:38:17.000Z', sha256: digest, byteLength: bytes.byteLength }, null, 2)}\n`, 'utf8');
  return digest;
}

interface FakeResponse {
  bytes?: Uint8Array;
  contentType?: string;
  status?: number;
  /** Zeit, die dieser Abruf verstreichen lässt (gestellte Uhr). */
  elapsedMs?: number;
}

interface Harness {
  options: Partial<FetchCorpusOptions>;
  requested: string[];
  time: { value: number };
}

/** Lauf ohne Netz: vorgegebene Antworten, gestellte Uhr, keine echten Wartezeiten, viel Plattenplatz. */
function harness(responses: Record<string, FakeResponse | 'unerwartet'>, overrides: Partial<FetchCorpusOptions> = {}): Harness {
  const requested: string[] = [];
  const time = { value: 1_000 };
  const fetchImplementation = (async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    requested.push(url);
    const response = responses[url];
    if (response === undefined || response === 'unerwartet') throw new Error(`Unerwarteter Netzabruf: ${url}`);
    time.value += response.elapsedMs ?? 10;
    const bytes = response.bytes ?? zipBytes(url);
    return new Response(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, { status: response.status ?? 200, headers: { 'content-type': response.contentType ?? 'application/zip' } });
  }) as unknown as typeof fetch;
  return {
    requested,
    time,
    options: {
      write: true,
      fetchImplementation,
      sleep: async (): Promise<void> => undefined,
      clock: (): number => time.value,
      now: (): Date => new Date('2026-09-18T06:00:00.000Z'),
      freeDiskBytes: async (): Promise<number> => 100 * 1024 ** 3,
      ...overrides,
    },
  };
}

const run = (root: string, hostess: Harness, extra: Partial<FetchCorpusOptions> = {}): Promise<FetchCorpusResult> => runFetchCorpus({ root, write: true, ...hostess.options, ...extra } as FetchCorpusOptions);

const entryOf = (result: FetchCorpusResult, documentId: string): ReturnType<typeof entryFinder> => entryFinder(result, documentId);
function entryFinder(result: FetchCorpusResult, documentId: string) {
  const entry = result.state.entries.find((candidate) => candidate.documentId === documentId);
  if (!entry) throw new Error(`Kein Zustandseintrag für ${documentId}`);
  return entry;
}

describe('Beschaffung: Wiederanlauf', () => {
  it('überspringt, was schon im Cache liegt, und holt nur den Rest', async () => {
    const root = await fixtureRoot(['BayA', 'BayB'], ['BayVwVC']);
    await seedCache(root, zipUrl('BayA'), zipBytes('paket-a'));
    await seedCache(root, zipUrl('BayVwVC'), zipBytes('paket-c'));
    const hostess = harness({ [zipUrl('BayB')]: { bytes: zipBytes('paket-b') }, [zipUrl('BayA')]: 'unerwartet', [zipUrl('BayVwVC')]: 'unerwartet' });

    const result = await run(root, hostess);

    expect(hostess.requested).toEqual([zipUrl('BayB')]);
    expect(result.fetched).toBe(1);
    expect(result.fromCache).toBe(2);
    expect(result.state.totals).toMatchObject({ enumerated: 3, cached: 3, failed: 0, skipped: 0 });
    expect(entryOf(result, 'BayA')).toMatchObject({ status: 'cached', sha256: sha256(zipBytes('paket-a')), contentType: 'application/zip', retrievedAt: '2026-09-17T09:38:17.000Z' });
    expect(entryOf(result, 'BayB')).toMatchObject({ status: 'cached', sha256: sha256(zipBytes('paket-b')), byteLength: zipBytes('paket-b').byteLength, retrievedAt: '2026-09-18T06:00:00.000Z' });
  });

  it('ist beim zweiten Lauf vollständig netzfrei und schreibt nichts neu', async () => {
    const root = await fixtureRoot(['BayA', 'BayB']);
    const erster = harness({ [zipUrl('BayA')]: {}, [zipUrl('BayB')]: {} });
    await run(root, erster);
    const vorher = await readFile(join(root, FETCH_STATE_PATH), 'utf8');

    const zweiter = harness({ [zipUrl('BayA')]: 'unerwartet', [zipUrl('BayB')]: 'unerwartet' });
    const result = await run(root, zweiter);

    expect(zweiter.requested).toEqual([]);
    expect(result.fetched).toBe(0);
    expect(result.fromCache).toBe(2);
    expect(result.written).toBe(false);
    expect(await readFile(join(root, FETCH_STATE_PATH), 'utf8')).toBe(vorher);
  });

  it('holt im Dry-run nichts und schreibt nichts, sagt aber, was zu holen wäre', async () => {
    const root = await fixtureRoot(['BayA', 'BayB']);
    await seedCache(root, zipUrl('BayA'), zipBytes('paket-a'));
    const hostess = harness({ [zipUrl('BayB')]: 'unerwartet' }, { write: false });

    const result = await run(root, hostess, { write: false });

    expect(hostess.requested).toEqual([]);
    expect(result.wouldFetch).toBe(1);
    expect(result.written).toBe(false);
    expect(result.state.totals).toMatchObject({ cached: 1, skipped: 1 });
    await expect(readFile(join(root, FETCH_STATE_PATH), 'utf8')).rejects.toThrow();
  });
});

describe('Beschaffung: Budgets sind Halte, keine Fehler', () => {
  it('hält beim Abrufbudget sauber an und setzt im nächsten Lauf fort', async () => {
    const root = await fixtureRoot(['BayA', 'BayB', 'BayC']);
    const erster = harness({ [zipUrl('BayA')]: {}, [zipUrl('BayB')]: {}, [zipUrl('BayC')]: {} });

    const result = await run(root, erster, { limit: 1 });

    expect(result.fetched).toBe(1);
    expect(result.stopReason).toBe('limit');
    expect(result.state.totals).toMatchObject({ cached: 1, failed: 0, skipped: 2 });
    expect(erster.requested).toHaveLength(1);
    // Der Halt ist im Zustand sichtbar und wiederaufnehmbar: alles Offene steht als „skipped“.
    const zustand = await readFetchState(root);
    expect(zustand?.entries.filter((entry) => entry.status === 'skipped').map((entry) => entry.documentId)).toEqual(['BayB', 'BayC']);

    const zweiter = harness({ [zipUrl('BayA')]: 'unerwartet', [zipUrl('BayB')]: {}, [zipUrl('BayC')]: {} });
    const fortsetzung = await run(root, zweiter);
    expect(zweiter.requested).toEqual([zipUrl('BayB'), zipUrl('BayC')]);
    expect(fortsetzung.state.totals).toMatchObject({ cached: 3, skipped: 0 });
    expect(fortsetzung.stopReason).toBeUndefined();
  });

  it('hält beim Laufzeitbudget an, ohne den laufenden Abruf zu zerreißen', async () => {
    const root = await fixtureRoot(['BayA', 'BayB', 'BayC']);
    const hostess = harness({ [zipUrl('BayA')]: { elapsedMs: 60_000 }, [zipUrl('BayB')]: { elapsedMs: 60_000 }, [zipUrl('BayC')]: {} });

    const result = await run(root, hostess, { maxRuntimeMs: 90_000 });

    expect(result.fetched).toBe(2);
    expect(result.stopReason).toBe('max-runtime');
    expect(result.state.totals).toMatchObject({ cached: 2, skipped: 1 });
    expect(entryOf(result, 'BayC').status).toBe('skipped');
  });

  it('hält an, wenn der freie Plattenplatz unter die Schranke fällt', async () => {
    const root = await fixtureRoot(['BayA', 'BayB']);
    const hostess = harness({ [zipUrl('BayA')]: 'unerwartet', [zipUrl('BayB')]: 'unerwartet' }, { freeDiskBytes: async (): Promise<number> => 2 * 1024 ** 3 });

    const result = await run(root, hostess);

    expect(hostess.requested).toEqual([]);
    expect(result.stopReason).toBe('disk-space');
    expect(result.stopDetail).toContain('5,0 GB');
    expect(result.state.totals.skipped).toBe(2);
  });
});

describe('Beschaffung: die Rohquelle bleibt unverändert', () => {
  it('meldet andere Bytes an derselben Adresse als Befund, statt den Cacheeintrag zu ersetzen', async () => {
    const root = await fixtureRoot(['BayA']);
    const alt = zipBytes('fassung-2026-09-17');
    const neu = zipBytes('fassung-2026-09-18-andere-bytes');
    const altHash = await seedCache(root, zipUrl('BayA'), alt);
    const hostess = harness({ [zipUrl('BayA')]: { bytes: neu } });

    const result = await run(root, hostess, { refresh: true });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ kind: 'source-changed', documentId: 'BayA', cachedSha256: altHash, fetchedSha256: sha256(neu), cachedByteLength: alt.byteLength, fetchedByteLength: neu.byteLength });
    // Der Bestand ist unberührt: gleiche Bytes, gleicher Hash im Zustand.
    expect(new Uint8Array(await readFile(join(root, CACHE_DIR, `${cacheKey(zipUrl('BayA'))}.bin`)))).toEqual(alt);
    expect(entryOf(result, 'BayA')).toMatchObject({ status: 'cached', sha256: altHash, sourceChanged: true });
    // Die neu geholten Bytes liegen nicht im Bestand, auch nicht im Prüfverzeichnis.
    expect(await peekCachedPackage(join(root, CACHE_DIR, VERIFY_SUBDIR), zipUrl('BayA'))).toBeUndefined();
  });

  it('bestätigt unveränderte Quellen ohne Befund', async () => {
    const root = await fixtureRoot(['BayA']);
    const bytes = zipBytes('unveraendert');
    const hash = await seedCache(root, zipUrl('BayA'), bytes);
    const hostess = harness({ [zipUrl('BayA')]: { bytes } });

    const result = await run(root, hostess, { refresh: true });

    expect(result.findings).toEqual([]);
    expect(entryOf(result, 'BayA')).toMatchObject({ status: 'cached', sha256: hash });
    expect(entryOf(result, 'BayA').sourceChanged).toBeUndefined();
  });
});

describe('Beschaffung: geprüft wird nur, dass es ein ZIP ist', () => {
  it('erkennt Signatur und Content-Type – und sonst nichts', () => {
    expect(zipProblem('application/zip', zipBytes('x'))).toBeUndefined();
    expect(zipProblem('text/html;charset=utf-8', new Uint8Array(Buffer.from('<html>', 'utf8')))).toContain('kein ZIP-Paket');
    expect(zipProblem('application/zip', new Uint8Array(Buffer.from('<html>', 'utf8')))).toContain('PK');
    expect(zipProblem('text/html', zipBytes('x'))).toContain('Content-Type');
  });

  it('führt eine Nicht-ZIP-Antwort als Fehler und behält sie nicht als Bestand', async () => {
    const root = await fixtureRoot(['BayA']);
    const hostess = harness({ [zipUrl('BayA')]: { bytes: new Uint8Array(Buffer.from('<html>Fehlerseite</html>', 'utf8')), contentType: 'text/html;charset=utf-8' } });

    const result = await run(root, hostess);

    expect(result.state.totals).toMatchObject({ cached: 0, failed: 1 });
    expect(entryOf(result, 'BayA')).toMatchObject({ status: 'failed', httpStatus: 200 });
    expect(entryOf(result, 'BayA').error).toContain('kein ZIP-Paket');
    // Nicht im Cache geblieben: Der nächste Lauf versucht es erneut, statt Müll für ein Paket zu halten.
    expect(await peekCachedPackage(join(root, CACHE_DIR), zipUrl('BayA'))).toBeUndefined();
    const zweiter = harness({ [zipUrl('BayA')]: { bytes: zipBytes('jetzt-richtig') } });
    const fortsetzung = await run(root, zweiter);
    expect(zweiter.requested).toEqual([zipUrl('BayA')]);
    expect(fortsetzung.state.totals).toMatchObject({ cached: 1, failed: 0 });
  });

  it('führt einen HTTP-Fehler mit Status und Ursache, ohne den Lauf abzubrechen', async () => {
    const root = await fixtureRoot(['BayA', 'BayB']);
    const hostess = harness({ [zipUrl('BayA')]: { status: 404, bytes: new Uint8Array(0), contentType: 'text/plain' }, [zipUrl('BayB')]: {} });

    const result = await run(root, hostess);

    expect(entryOf(result, 'BayA')).toMatchObject({ status: 'failed', httpStatus: 404 });
    expect(entryOf(result, 'BayB').status).toBe('cached');
    expect(result.state.totals).toMatchObject({ cached: 1, failed: 1, skipped: 0 });
  });
});

describe('Beschaffung: Zustand und Bericht', () => {
  it('schreibt eine deterministische, sortierte Zustandsdatei', async () => {
    const root = await fixtureRoot(['BayZ', 'BayA', 'Bay2', 'Bay10'], ['BayVwVB']);
    const hostess = harness(Object.fromEntries(['BayZ', 'BayA', 'Bay2', 'Bay10', 'BayVwVB'].map((id) => [zipUrl(id), {} as FakeResponse])));
    const result = await run(root, hostess);
    const ersteDatei = await readFile(join(root, FETCH_STATE_PATH), 'utf8');

    expect(result.state.entries.map((entry) => `${entry.sourceArea}/${entry.documentId}`)).toEqual(['landesrecht/Bay2', 'landesrecht/Bay10', 'landesrecht/BayA', 'landesrecht/BayZ', 'vwv/BayVwVB']);

    // Zweiter Lauf auf demselben Stand: identischer Inhalt, identische Datei – auch `updatedAt`.
    const wiederholung = harness({}, { now: (): Date => new Date('2026-09-19T12:00:00.000Z') });
    const zweiter = await run(root, wiederholung);
    expect(zweiter.state.contentFingerprint).toBe(result.state.contentFingerprint);
    expect(await readFile(join(root, FETCH_STATE_PATH), 'utf8')).toBe(ersteDatei);
    expect(zweiter.state.updatedAt).toBe('2026-09-18T06:00:00.000Z');
  });

  it('checkpointet nach jedem Dokument, nicht am Ende – und jeder Checkpoint ist vollständig', async () => {
    const root = await fixtureRoot(['BayA', 'BayB', 'BayC']);
    const gesehen: number[] = [];
    const umfang: number[] = [];
    const hostess = harness({ [zipUrl('BayA')]: {}, [zipUrl('BayB')]: {}, [zipUrl('BayC')]: {} });
    const spy = hostess.options.fetchImplementation!;
    hostess.options.fetchImplementation = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      // Vor jedem weiteren Abruf muss der Fortschritt der vorherigen Dokumente schon auf der Platte stehen.
      const zwischenstand = await readFetchState(root);
      gesehen.push(zwischenstand?.totals.cached ?? -1);
      umfang.push(zwischenstand?.totals.enumerated ?? -1);
      return spy(input as string, init);
    }) as unknown as typeof fetch;

    await run(root, hostess);

    expect(gesehen).toEqual([-1, 1, 2]);
    // Ein Zwischenstand verschweigt nichts: Er führt von Anfang an alle enumerierten Dokumente, die
    // noch offenen als „skipped“. Nach einem Abbruch ist damit ablesbar, was fehlt.
    expect(umfang).toEqual([-1, 3, 3]);
  });

  it('bilanziert im Bericht Bestand, Fehler, Befunde und Abbruchgrund', async () => {
    const root = await fixtureRoot(['BayA', 'BayB', 'BayC']);
    const hostess = harness({ [zipUrl('BayA')]: {}, [zipUrl('BayB')]: { bytes: new Uint8Array(Buffer.from('<html>', 'utf8')), contentType: 'text/html' }, [zipUrl('BayC')]: {} });
    const result = await run(root, hostess, { limit: 2 });
    const markdown = renderFetchReport(result, '2026-09-18T06:00:00.000Z');

    expect(markdown).toContain('| enumerierte Dokumente | 3 |');
    expect(markdown).toContain('kein ZIP-Paket');
    expect(markdown).toContain('**limit**');
    expect(markdown).toContain('Keine. Kein vorhandener Cacheeintrag wurde ersetzt.');
    expect(markdown.startsWith('# Beschaffung BAYERN.RECHT')).toBe(true);
  });

  it('meldet Größen in lesbarer Form', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(13_421_773)).toBe('12,8 MB');
    expect(formatBytes(5 * 1024 ** 3)).toBe('5,0 GB');
  });
});
