/**
 * Veraltete Parser-/Transformerstände (Staleness): Erkennung je Importstatus, Auswahl im Bulk-Runner
 * (`--regenerate-stale`), Regressionsschutz mit dokumentierten Legacy-Ausnahmen (weiter ausliefern oder
 * kontrolliert depublizieren) und der Versionsreport, aus dem die Readiness ihre Regel ableitet. Kein Netz.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { defaultItemProcessor, runBulkImport } from '@landesrecht/importer-recht-nrw/common/bulk-runner.ts';
import { PARSER_VERSION } from '@landesrecht/importer-recht-nrw/common/constants.ts';
import { buildEnumeration, writeEnumeration } from '@landesrecht/importer-recht-nrw/common/enumeration.ts';
import { createTestEnvironment } from '@landesrecht/importer-recht-nrw/common/environment.ts';
import { RechtNrwFetchError, type FetchedDocument, type RechtNrwFetcher } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import { LEGACY_EXCEPTIONS_PATH, LEGACY_EXCEPTIONS_SCHEMA, legacyExceptionObsolete, matchLegacyException, readLegacyExceptions, validateLegacyException, validateLegacyExceptionRegistry, type LegacyException, type LegacyExceptionRegistry } from '@landesrecht/importer-recht-nrw/common/legacy-exceptions.ts';
import { emptyManifest, readManifest, readManifestEntry, writeManifestEntry, type ManifestEntry } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { decideReviewItem, readReviewQueue, writeReviewShard } from '@landesrecht/importer-recht-nrw/common/review-queue.ts';
import { syntheticLrgvSource } from '@landesrecht/importer-recht-nrw/common/simulation.ts';
import { readSlugRegistry } from '@landesrecht/importer-recht-nrw/common/slug-registry.ts';
import { currentParserVersion, isRegenerableEnumerationStatus, isStaleEntry, STALE_REGENERATION_STATUSES, staleReasons } from '@landesrecht/importer-recht-nrw/common/staleness.ts';
import { computeVersionReport, collectVersionReport, renderVersionReportLines } from '@landesrecht/importer-recht-nrw/common/version-report.ts';
import { importRechtNrwNorm } from '@landesrecht/importer-recht-nrw/lrgv/pipeline.ts';
import { importRechtNrwLrmbDocument } from '@landesrecht/importer-recht-nrw/lrmb/pipeline.ts';
import { LRMB_PARSER_VERSION } from '@landesrecht/importer-recht-nrw/lrmb/parser.ts';
import { TRANSFORMER_VERSION } from '@landesrecht/importer-recht-nrw/transform/rules.ts';

import { cleanupTempBases, enumerationOnDisk, fixedNow, NOW, prepareRoot, runOptions, stubManifestEntry, stubProcessor, tempBase, termOf } from '../helpers/recht-nrw-bulk-stub.ts';

const fixtures = join(process.cwd(), 'tests', 'fixtures', 'recht-nrw');
const NATIVE_URL = 'https://recht.nrw.de/lrgv/rechtsverordnung/30032018-testverordnung-nordrhein-westfalen-testvo-nrw';
const ANNEX_URL = 'https://recht.nrw.de/system/files/BA/4242-1-anlage.htm';
const ANNEX_PDF_URL = 'https://recht.nrw.de/system/files/BA/4242-2-anlage.pdf';
const IDENTITY = 'term:515151';
const OLD_PARSER = 'recht-nrw-parser/1.1.0';
const sha = (input: string | Uint8Array): string => createHash('sha256').update(input).digest('hex');

afterAll(cleanupTempBases);

function inlineFetcher(files: Record<string, string>): RechtNrwFetcher {
  return {
    stats: { networkRequests: 0, cacheHits: 0 },
    async fetch(url: string): Promise<FetchedDocument> {
      const text = files[url];
      if (text === undefined) throw new Error(`nicht vorgesehen: ${url}`);
      const bytes = new TextEncoder().encode(text);
      return { url, finalUrl: url, status: 200, contentType: url.endsWith('.pdf') ? 'application/pdf' : 'text/html; charset=UTF-8', retrievedAt: '2026-09-15T10:00:00.000Z', sha256: sha(bytes), bytes, fromCache: false };
    },
  };
}

function exceptionFor(overrides: Partial<LegacyException> = {}): LegacyException {
  const text = sha('sichtbarer Text');
  // legacyAssessment gehört nur zu deliver-legacy; Depublikationen tragen es nicht.
  const { legacyAssessment, ...base } = {
    id: 'legacy-515151',
    sourceIdentity: IDENTITY,
    sourceArea: 'lrgv',
    targetSlug: 'testvo-west',
    disposition: 'deliver-legacy',
    source: { url: NATIVE_URL, sha256: 'a'.repeat(64) },
    legacy: { parserVersion: OLD_PARSER, transformerVersion: TRANSFORMER_VERSION, importStatus: 'imported-with-warnings' },
    current: { parserVersion: PARSER_VERSION, findings: ['structure-unnumbered-section'] },
    textIntegrity: { method: 'sichtbarer Text der Fassung, zeilenweise', legacySha256: text, currentSha256: text, legacyChars: 100, currentChars: 100, identical: true },
    structuralDefect: 'Sektion 3 ohne Nummernfeld; ihr Text hängt in der gespeicherten Fassung an § 2',
    reason: 'Text vollständig und identisch; nur die Zuordnung eines Absatzes weicht ab',
    preparedAt: '2026-09-17',
    preparedBy: 'automated-review',
    approvalStatus: 'pending-human-review',
    legacyAssessment: { unclassifiedSections: [3], expectedLabels: ['§ 3'], impact: 'structure-only', resolution: 'override-proposed' },
    ...overrides,
  } as LegacyException;
  return base.disposition === 'deliver-legacy' && legacyAssessment ? { ...base, legacyAssessment } : base;
}

async function writeExceptions(root: string, entries: LegacyException[]): Promise<void> {
  const registry: LegacyExceptionRegistry = { schemaVersion: LEGACY_EXCEPTIONS_SCHEMA, entries };
  await mkdir(join(root, 'data', 'imports', 'recht-nrw'), { recursive: true });
  await writeFile(join(root, LEGACY_EXCEPTIONS_PATH), JSON.stringify(registry, null, 2));
}

describe('Staleness: veraltete Parser-/Transformerstände je Importstatus', () => {
  const entry = (overrides: Partial<ManifestEntry>): Parameters<typeof isStaleEntry>[0] => ({ sourceArea: 'lrgv', parserVersion: PARSER_VERSION, transformerVersion: TRANSFORMER_VERSION, ...overrides });

  it('erkennt jeden persistierten Status als veraltet, sobald Parser oder Transformer abweichen', () => {
    expect(STALE_REGENERATION_STATUSES).toEqual(['imported', 'imported-with-warnings', 'needs-review', 'failed', 'excluded', 'not-at-baseline']);
    for (const importStatus of STALE_REGENERATION_STATUSES) {
      expect(isStaleEntry(entry({ importStatus }))).toBe(false);
      expect(isStaleEntry(entry({ importStatus, parserVersion: 'recht-nrw-parser/1.0.0' }))).toBe(true);
      expect(isStaleEntry(entry({ importStatus, transformerVersion: 'recht-nrw-transformer/2.0.0' }))).toBe(true);
    }
    // LRMB: 496 Einträge mit Status excluded auf Parser 1.0.0 gelten als veraltet (Neubewertung, kein Statuswechsel).
    expect(isStaleEntry({ sourceArea: 'lrmb', importStatus: 'excluded', parserVersion: 'recht-nrw-lrmb-parser/1.0.0', transformerVersion: TRANSFORMER_VERSION })).toBe(true);
    expect(isStaleEntry({ sourceArea: 'lrmb', importStatus: 'excluded', parserVersion: LRMB_PARSER_VERSION, transformerVersion: TRANSFORMER_VERSION })).toBe(false);
    expect(staleReasons(entry({ parserVersion: 'recht-nrw-parser/1.1.0', transformerVersion: 'recht-nrw-transformer/2.0.0' }))).toEqual([`Parser recht-nrw-parser/1.1.0 ≠ ${PARSER_VERSION}`, `Transformer recht-nrw-transformer/2.0.0 ≠ ${TRANSFORMER_VERSION}`]);
    // dry-run wird nie persistiert und nie regeneriert.
    expect(isStaleEntry(entry({ importStatus: 'dry-run', parserVersion: 'recht-nrw-parser/1.0.0' }))).toBe(false);
    // Ohne Statusangabe (Coverage) zählt allein die Version.
    expect(isStaleEntry(entry({ parserVersion: 'recht-nrw-parser/1.0.0' }))).toBe(true);
  });

  it('erfasst in der Enumeration alle abgeschlossenen Status (done, review, failed, excluded)', () => {
    expect(['done', 'review', 'failed', 'excluded'].every((status) => isRegenerableEnumerationStatus(status as 'done'))).toBe(true);
    expect(isRegenerableEnumerationStatus('pending')).toBe(false);
    expect(isRegenerableEnumerationStatus('processing')).toBe(false);
  });
});

describe('Bulk-Runner: --regenerate-stale bewertet veraltete excluded/review/failed/not-at-baseline neu', () => {
  it('wählt nur veraltete Einträge; ein aktueller excluded-Eintrag bleibt unberührt, ein weiterhin ausgeschlossener bleibt excluded', async () => {
    const { root, order } = await prepareRoot(8);
    // Erster Lauf: 1 excluded (veraltet), 2 excluded (aktuell), 3 review, 4 failed, 5 not-at-baseline, 6 done (Transformer alt), 7 done (aktuell).
    const plan: Record<number, { status: 'done' | 'review' | 'failed' | 'excluded'; importStatus?: ManifestEntry['importStatus'] }> = { 1: { status: 'excluded' }, 2: { status: 'excluded' }, 3: { status: 'review' }, 4: { status: 'failed' }, 5: { status: 'done', importStatus: 'not-at-baseline' }, 6: { status: 'done' }, 7: { status: 'done' } };
    const decide = (item: { key: string }): { status: 'done' | 'review' | 'failed' | 'excluded'; importStatus?: ManifestEntry['importStatus'] } => plan[order.indexOf(item.key)] ?? { status: 'done' };
    const first = stubProcessor({ decide });
    await runBulkImport(runOptions(root, { processor: first.processor, runId: 'stale-statuses-0' }));
    expect(first.calls).toHaveLength(8);
    const manifest = await readManifest(root);
    // Ausgeschlossene und gescheiterte Einträge erhalten ihre Manifesteinträge wie im LRMB-/LRGV-Pfad (mit Version).
    const enumeration = await enumerationOnDisk(root);
    const itemAt = (position: number) => enumeration.items.find((item) => item.key === order[position])!;
    for (const [position, importStatus] of [[1, 'excluded'], [2, 'excluded'], [4, 'failed']] as const) {
      const item = itemAt(position);
      manifest.entries.push(stubManifestEntry({ item, sourceIdentity: termOf(item), slug: '', importStatus, runId: 'stale-statuses-0', now: NOW.toISOString() }));
    }
    const stale = new Set([1, 3, 4, 5, 6].map((position) => termOf(itemAt(position))));
    for (const entry of manifest.entries) {
      if (!stale.has(entry.sourceIdentity)) continue;
      if (entry.sourceIdentity === termOf(itemAt(6))) entry.transformerVersion = 'recht-nrw-transformer/2.0.0';
      else entry.parserVersion = 'recht-nrw-parser/1.0.0';
    }
    expect(manifest.entries.filter((entry) => isStaleEntry(entry)).map((entry) => entry.sourceIdentity).sort()).toEqual([...stale].sort());

    // Zweiter Lauf: nur die veralteten fünf; Eintrag 1 wird erneut ausgeschlossen (Status bleibt excluded).
    const second = stubProcessor({ decide: (item) => (order.indexOf(item.key) === 1 ? { status: 'excluded' } : { status: 'done' }) });
    const { summary } = await runBulkImport(runOptions(root, { processor: second.processor, resume: true, regenerateStale: true, manifest, runId: 'stale-statuses-1' }));
    expect(second.calls).toEqual([1, 3, 4, 5, 6].map((position) => order[position]));
    expect(summary).toMatchObject({ runStatus: 'completed', selected: 5, processed: 5, outcomes: { excluded: 1, imported: 4 } });
    const after = await enumerationOnDisk(root);
    expect(after.items.find((item) => item.key === order[1])).toMatchObject({ status: 'excluded', attempts: 2 });
    expect(after.items.find((item) => item.key === order[2])).toMatchObject({ status: 'excluded', attempts: 1 });
    expect(after.items.find((item) => item.key === order[7])).toMatchObject({ status: 'done', attempts: 1 });
    for (const position of [3, 4, 5, 6]) expect(after.items.find((item) => item.key === order[position])).toMatchObject({ status: 'done', attempts: 2, outcome: { importStatus: 'imported', parserVersion: currentParserVersion('lrgv'), transformerVersion: TRANSFORMER_VERSION } });
    // Ohne veraltete Einträge tut der Lauf nichts.
    const third = await runBulkImport(runOptions(root, { processor: stubProcessor().processor, resume: true, regenerateStale: true, manifest: await readManifest(root), runId: 'stale-statuses-2' }));
    expect(third.summary.runStatus).toBe('nothing-to-do');
  });
});

describe('Legacy-Ausnahmen: Schema und Übereinstimmung', () => {
  it('validiert Pflichtfelder, Hashes, Dispositionen und Eindeutigkeit', () => {
    expect(() => validateLegacyException(exceptionFor())).not.toThrow();
    expect(() => validateLegacyException(exceptionFor({ disposition: 'deliver-legacy', textIntegrity: { ...exceptionFor().textIntegrity, currentSha256: 'b'.repeat(64), identical: false } }))).toThrow(/deliver-legacy verlangt identischen Text/u);
    expect(() => validateLegacyException(exceptionFor({ disposition: 'depublish', textIntegrity: { ...exceptionFor().textIntegrity, currentSha256: 'b'.repeat(64), identical: false } }))).not.toThrow();
    expect(() => validateLegacyException(exceptionFor({ textIntegrity: { ...exceptionFor().textIntegrity, identical: false } }))).toThrow(/widerspricht den Hashes/u);
    expect(() => validateLegacyException(exceptionFor({ current: { parserVersion: OLD_PARSER, findings: ['x'] } }))).toThrow(/keine Legacy-Lage/u);
    expect(() => validateLegacyException(exceptionFor({ current: { parserVersion: PARSER_VERSION, findings: [] } }))).not.toThrow();
    expect(() => validateLegacyException(exceptionFor({ current: { parserVersion: PARSER_VERSION } as LegacyException['current'] }))).toThrow(/current\.findings/u);
    expect(() => validateLegacyException(exceptionFor({ preparedAt: 'gestern' }))).toThrow(/preparedAt/u);
    expect(() => validateLegacyException(exceptionFor({ approvalStatus: 'freigegeben' as LegacyException['approvalStatus'] }))).toThrow(/approvalStatus/u);
    expect(() => validateLegacyException(exceptionFor({ source: { url: 'https://example.org/x', sha256: 'a'.repeat(64) } }))).toThrow(/RECHT\.NRW-Adresse/u);
    expect(() => validateLegacyException(exceptionFor({ disposition: 'archive' as 'depublish' }))).toThrow(/disposition/u);
    expect(() => validateLegacyExceptionRegistry({ schemaVersion: LEGACY_EXCEPTIONS_SCHEMA, entries: [exceptionFor(), exceptionFor({ id: 'legacy-anders' })] })).toThrow(/mehrere Ausnahmen für term:515151/u);
    expect(() => validateLegacyExceptionRegistry({ schemaVersion: 'recht-nrw-legacy-exceptions/0' as typeof LEGACY_EXCEPTIONS_SCHEMA, entries: [] })).toThrow(/Schemaversion/u);
  });

  it('greift nur für genau die freigegebene Lage (Quelle, gespeicherter Stand, aktueller Parser, Fehlercodes)', () => {
    const exception = exceptionFor();
    const previous = { parserVersion: OLD_PARSER, transformerVersion: TRANSFORMER_VERSION, importStatus: 'imported-with-warnings' as const, targetSlug: 'testvo-west' };
    expect(matchLegacyException(exception, { sourceSha256: 'a'.repeat(64), previous, currentErrorCodes: ['structure-unnumbered-section', 'import-regression'] })).toEqual({ applies: true, mismatches: [] });
    expect(matchLegacyException(exception, { sourceSha256: 'b'.repeat(64), previous, currentErrorCodes: ['structure-unnumbered-section'] }).mismatches).toEqual([expect.stringContaining('Quelle geändert')]);
    expect(matchLegacyException(exception, { sourceSha256: 'a'.repeat(64), previous: { ...previous, parserVersion: 'recht-nrw-parser/1.0.0' }, currentErrorCodes: ['structure-unnumbered-section'] }).mismatches).toEqual([expect.stringContaining('gespeicherter Parserstand')]);
    expect(matchLegacyException(exception, { sourceSha256: 'a'.repeat(64), previous, currentErrorCodes: ['structure-unnumbered-section', 'integrity-parse-textLength'] }).mismatches).toEqual(['nicht freigegebene Fehlercodes: integrity-parse-textLength']);
    expect(matchLegacyException(exceptionFor({ current: { parserVersion: 'recht-nrw-parser/9.9.9', findings: ['structure-unnumbered-section'] } }), { sourceSha256: 'a'.repeat(64), previous, currentErrorCodes: [] }).mismatches).toEqual([expect.stringContaining('aktueller Parser')]);
    expect(legacyExceptionObsolete(exception, { parserVersion: OLD_PARSER, importStatus: 'imported-with-warnings' })).toBe(false);
    expect(legacyExceptionObsolete(exception, { parserVersion: PARSER_VERSION, importStatus: 'imported-with-warnings' })).toBe(true);
    expect(legacyExceptionObsolete(exception, { parserVersion: OLD_PARSER, importStatus: 'needs-review' })).toBe(true);
    expect(legacyExceptionObsolete(exception, undefined)).toBe(true);
  });
});

describe('Versionsreport: aktuelle und ältere Stände je Bereich und Status, begründete Ausnahmen', () => {
  it('zählt je Status, trennt begründete von unbegründeten Altständen und leitet Readiness-Blocker und Hinweise ab', async () => {
    const { root, order } = await prepareRoot(6);
    const file = await enumerationOnDisk(root);
    const manifest = emptyManifest();
    const make = (position: number, importStatus: ManifestEntry['importStatus'], patch: Partial<ManifestEntry> = {}): ManifestEntry => {
      const item = file.items.find((candidate) => candidate.key === order[position])!;
      const entry = stubManifestEntry({ item, sourceIdentity: termOf(item), slug: importStatus.startsWith('imported') ? `synth-${position}-west` : '', importStatus, runId: 'r', now: NOW.toISOString() });
      Object.assign(entry, patch);
      manifest.entries.push(entry);
      return entry;
    };
    make(0, 'imported');
    const legacy = make(1, 'imported-with-warnings', { parserVersion: OLD_PARSER });
    const unjustified = make(2, 'imported', { parserVersion: OLD_PARSER });
    const excludedOld = make(3, 'excluded', { parserVersion: 'recht-nrw-parser/1.0.0' });
    make(4, 'needs-review');
    const pending = make(5, 'imported-with-warnings', { parserVersion: OLD_PARSER });
    const lrmb = make(0, 'excluded', { sourceArea: 'lrmb', sourceIdentity: 'term:1', parserVersion: 'recht-nrw-lrmb-parser/1.0.0' });
    lrmb.sourceIdentity = 'term:1';
    const exceptions: LegacyExceptionRegistry = {
      schemaVersion: LEGACY_EXCEPTIONS_SCHEMA,
      entries: [
        exceptionFor({ id: 'legacy-a', sourceIdentity: legacy.sourceIdentity, targetSlug: legacy.targetSlug, source: { url: legacy.sourceUrl, sha256: legacy.sha256 } }),
        // Depublikation freigegeben, aber nicht ausgeführt: bleibt ein Blocker mit konkretem Befehl.
        exceptionFor({ id: 'legacy-b', sourceIdentity: pending.sourceIdentity, targetSlug: pending.targetSlug, disposition: 'depublish', source: { url: pending.sourceUrl, sha256: pending.sha256 } }),
        // Gegenstandslos: Eintrag ist bereits aktuell.
        exceptionFor({ id: 'legacy-c', sourceIdentity: manifest.entries[0]!.sourceIdentity, targetSlug: 'synth-0-west', source: { url: manifest.entries[0]!.sourceUrl, sha256: manifest.entries[0]!.sha256 } }),
      ],
    };
    const report = computeVersionReport({ manifest, exceptions, generatedAt: '2026-09-17T00:00:00.000Z' });
    expect(report.areas.lrgv).toMatchObject({ entries: 6, currentParserVersion: PARSER_VERSION, currentTransformerVersion: TRANSFORMER_VERSION });
    expect(report.areas.lrgv.byStatus).toEqual({
      imported: { entries: 2, current: 1, outdated: 1, outdatedVersions: { [`${OLD_PARSER} · ${TRANSFORMER_VERSION}`]: 1 } },
      'imported-with-warnings': { entries: 2, current: 0, outdated: 2, outdatedVersions: { [`${OLD_PARSER} · ${TRANSFORMER_VERSION}`]: 2 } },
      'needs-review': { entries: 1, current: 1, outdated: 0, outdatedVersions: {} },
      excluded: { entries: 1, current: 0, outdated: 1, outdatedVersions: { [`recht-nrw-parser/1.0.0 · ${TRANSFORMER_VERSION}`]: 1 } },
    });
    expect(report.areas.lrgv.outdated.justified.map((entry) => [entry.sourceIdentity, entry.exception?.id])).toEqual([[legacy.sourceIdentity, 'legacy-a']]);
    expect(report.areas.lrgv.outdated.unjustified.map((entry) => entry.sourceIdentity).sort()).toEqual([unjustified.sourceIdentity, excludedOld.sourceIdentity, pending.sourceIdentity].sort());
    expect(report.areas.lrgv.outdated.unjustified.find((entry) => entry.sourceIdentity === pending.sourceIdentity)?.problem).toContain(`--only ${pending.sourceIdentity} --offline --write`);
    expect(report.areas.lrgv.obsoleteExceptions).toEqual(['legacy-c']);
    expect(report.areas.lrmb.byStatus.excluded).toEqual({ entries: 1, current: 0, outdated: 1, outdatedVersions: { [`recht-nrw-lrmb-parser/1.0.0 · ${TRANSFORMER_VERSION}`]: 1 } });
    expect(report.ready).toBe(false);
    expect(report.blockers).toHaveLength(2);
    expect(report.blockers[0]).toMatch(/^LRGV: 3 Einträge mit veralteter Parser-\/Transformerversion ohne dokumentierte Legacy-Ausnahme \(Status excluded, imported, imported-with-warnings;/u);
    expect(report.blockers[0]).toContain('--area lrgv --regenerate-stale --offline --write --resume');
    expect(report.blockers[1]).toMatch(/^LRMB: 1 Einträge .* \(Status excluded; term:1 \(excluded, recht-nrw-lrmb-parser\/1\.0\.0\)\)/u);
    expect(report.notices).toEqual([expect.stringContaining(`LRGV: 1 begründete Legacy-Ausnahme(n) mit älterem Parserstand (${legacy.sourceIdentity} → legacy-a)`), expect.stringContaining('LRGV: 1 gegenstandslose Legacy-Ausnahme(n)')]);
    const lines = renderVersionReportLines(report);
    expect(lines[0]).toBe(`LRGV: Parser ${PARSER_VERSION}, Transformer ${TRANSFORMER_VERSION} · 6 Einträge, 4 veraltet (1 begründet, 3 unbegründet)`);
    expect(lines.some((line) => /excluded\s+aktuell\s+0\s+älter\s+1/u.test(line))).toBe(true);

    // Ohne Altstände: READY ohne Hinweise.
    const clean = computeVersionReport({ manifest: { ...manifest, entries: manifest.entries.filter((entry) => !isStaleEntry(entry)) }, exceptions: { schemaVersion: LEGACY_EXCEPTIONS_SCHEMA, entries: [] }, generatedAt: '2026-09-17T00:00:00.000Z' });
    expect(clean).toMatchObject({ ready: true, blockers: [], notices: [] });
    // Eine ungültige Ausnahmedatei ist ein harter Fehler (kein stilles Übergehen).
    await writeFile(join(root, LEGACY_EXCEPTIONS_PATH), JSON.stringify({ schemaVersion: LEGACY_EXCEPTIONS_SCHEMA, entries: [{ id: 'kaputt' }] }));
    await expect(collectVersionReport(root, { manifest })).rejects.toThrow(/Ausnahme kaputt/u);
  });
});

describe('Regressionsschutz mit Legacy-Ausnahmen (LRGV-Importpfad, Fixtures)', () => {
  const now = (): Date => new Date('2026-09-17T12:00:00.000Z');
  let root: string;
  let files: Record<string, string>;
  let regressed: Record<string, string>;
  let regressedSha: string;

  async function prepare(): Promise<void> {
    root = join(await tempBase('recht-nrw-staleness-'), 'root');
    await mkdir(join(root, 'content', 'norms', 'west'), { recursive: true });
    await writeFile(join(root, 'package.json'), '{"name":"tmp"}');
    const native = await readFile(join(fixtures, 'version-page-native.html'), 'utf8');
    const annex = await readFile(join(fixtures, 'annex.htm'), 'utf8');
    files = { [NATIVE_URL]: native, [ANNEX_URL]: annex, [ANNEX_PDF_URL]: '%PDF-1.4 fake' };
    // Dieselbe Norm mit einer Sektion ohne Nummernfeld (Quelldefekt, Parser 1.2.0 fail-closed): Reimport ergibt needs-review.
    const unnumbered = (await readFile(join(fixtures, 'broken-html', 'native-unnumbered-section.html'), 'utf8')).replace(/<!--[\s\S]*?-->/u, '');
    const start = native.indexOf('<div class="field field--field_body">');
    const end = native.indexOf('<div class="field field--field_conclusions');
    regressed = { ...files, [NATIVE_URL]: `${native.slice(0, start)}${unnumbered}\n${native.slice(end)}` };
    regressedSha = sha(new TextEncoder().encode(regressed[NATIVE_URL]!));
    const first = await importRechtNrwNorm({ url: NATIVE_URL, root, fetcher: inlineFetcher(files), write: true, now });
    expect(first.status).toBe('imported-with-warnings');
    expect(first.manifestEntry?.targetSlug).toBe('testvo-west');
    // Simulierter Altstand: Parser 1.1.0 hatte genau diese (defekte) Quelle stillschweigend übernommen.
    // Rohquellen wie im Bulk (R2-Staging statt versioniertem Beispielkorpus), sonst ließe der Runner den Eintrag als Beispielkorpus aus.
    const stored = (await readManifestEntry(root, 'lrgv', IDENTITY))!;
    const rawDocuments = stored.rawDocuments.map((raw) => {
      const { localSource: _local, ...rest } = raw;
      return { ...rest, ...(raw.role === 'version-page' ? { sha256: regressedSha } : {}), archiveStatus: 'staged' as const, bucket: 'landesrecht-quellen', objectKey: `west/recht-nrw/2023-12-01/term-515151/${raw.sha256.slice(0, 16)}-${raw.role}.html` };
    });
    await writeManifestEntry(root, { ...stored, parserVersion: OLD_PARSER, sha256: regressedSha, rawDocuments });
  }

  const contentExists = async (): Promise<boolean> => stat(join(root, 'content', 'norms', 'west', 'testvo-west', 'versions', '2023-12-01.json')).then(() => true, () => false);
  const codesOf = (result: { findings: Array<{ severity: string; code: string }> }, severity: string): string[] => result.findings.filter((finding) => finding.severity === severity).map((finding) => finding.code);

  it('ohne Ausnahme: import-regression, Manifest und Inhalt bleiben beim alten Parserstand; --regenerate-stale wählt den Eintrag, ändert ihn aber nicht', async () => {
    await prepare();
    const result = await importRechtNrwNorm({ url: NATIVE_URL, root, fetcher: inlineFetcher(regressed), write: true, now });
    expect(result.status).toBe('needs-review');
    expect(codesOf(result, 'error')).toEqual(['structure-unnumbered-section', 'import-regression']);
    expect(result.manifestEntry).toMatchObject({ importStatus: 'imported-with-warnings', parserVersion: OLD_PARSER, targetSlug: 'testvo-west' });
    expect(await readManifestEntry(root, 'lrgv', IDENTITY)).toMatchObject({ importStatus: 'imported-with-warnings', parserVersion: OLD_PARSER });
    expect(await contentExists()).toBe(true);
    const queue = await readReviewQueue(root);
    const openCategories = queue.items.filter((item) => item.sourceIdentity === IDENTITY && item.status === 'open').map((item) => item.category);
    expect(openCategories).toEqual(expect.arrayContaining(['other', 'unknown-structure']));
    expect(queue.items.filter((item) => item.sourceIdentity === IDENTITY && item.category === 'other').map((item) => item.key)).toEqual(['import-regression']);

    // Bulk: der Eintrag ist done mit veraltetem Manifest → --regenerate-stale wählt ihn; der Regressionsschutz hält.
    const source = syntheticLrgvSource('<html>synthetisch</html>', 1);
    const enumeration = buildEnumeration({ area: 'lrgv', sitemap: source.sitemap, search: source.search, now: NOW.toISOString() });
    const item = enumeration.items[0]!;
    Object.assign(item, { key: IDENTITY, sourceIdentity: IDENTITY, entryUrl: NATIVE_URL, urls: [NATIVE_URL], status: 'done', attempts: 1, outcome: { importStatus: 'imported-with-warnings', targetSlug: 'testvo-west', parserVersion: OLD_PARSER, transformerVersion: TRANSFORMER_VERSION } });
    await writeEnumeration(root, enumeration);
    const manifest = await readManifest(root);
    const run = await runBulkImport({ root, area: 'lrgv', write: true, resume: true, regenerateStale: true, fetcher: inlineFetcher(regressed), environment: createTestEnvironment(root, { slugRegistry: await readSlugRegistry(root) }), manifest, reviewQueue: await readReviewQueue(root), processor: defaultItemProcessor, runId: 'regen-regression', now: fixedNow });
    expect(run.summary).toMatchObject({ selected: 1, processed: 1, outcomes: { review: 1 } });
    expect(run.enumeration.items[0]).toMatchObject({ status: 'review', outcome: { importStatus: 'needs-review', parserVersion: OLD_PARSER } });
    expect(await readManifestEntry(root, 'lrgv', IDENTITY)).toMatchObject({ importStatus: 'imported-with-warnings', parserVersion: OLD_PARSER });
    expect(await contentExists()).toBe(true);
    // Versionsreport: unbegründeter Altstand → NOT READY.
    const report = await collectVersionReport(root);
    expect(report.ready).toBe(false);
    expect(report.areas.lrgv.outdated.unjustified.map((entry) => entry.sourceIdentity)).toEqual([IDENTITY]);
  });

  it('deliver-legacy: Warnung statt Fehler, Fassung bleibt, Review-Entscheidung bleibt bei identischem Befund erhalten, Report meldet begründete Ausnahme', async () => {
    let queue = await readReviewQueue(root);
    const structure = queue.items.find((item) => item.sourceIdentity === IDENTITY && item.category === 'unknown-structure')!;
    queue = decideReviewItem(queue, structure.id, { decision: 'deferred', reason: 'fehlendes Kennzeichen wird redaktionell geklärt', decidedAt: '2026-09-17T13:00:00.000Z', decidedBy: 'Redaktion' });
    await writeReviewShard(root, queue, 'lrgv', IDENTITY);

    // Eine Ausnahme, die nicht zur Lage passt (anderer Fehlercode freigegeben), greift nicht: weiter import-regression.
    await writeExceptions(root, [exceptionFor({ source: { url: NATIVE_URL, sha256: regressedSha }, current: { parserVersion: PARSER_VERSION, findings: ['content-pdf-only'] } })]);
    const mismatch = await importRechtNrwNorm({ url: NATIVE_URL, root, fetcher: inlineFetcher(regressed), write: true, now });
    expect(codesOf(mismatch, 'error')).toEqual(['structure-unnumbered-section', 'import-regression']);
    expect(mismatch.findings.find((finding) => finding.code === 'import-regression')?.message).toContain('Legacy-Ausnahme legacy-515151 greift nicht: nicht freigegebene Fehlercodes: structure-unnumbered-section');

    await writeExceptions(root, [exceptionFor({ source: { url: NATIVE_URL, sha256: regressedSha } })]);
    expect((await readLegacyExceptions(root)).entries).toHaveLength(1);
    const result = await importRechtNrwNorm({ url: NATIVE_URL, root, fetcher: inlineFetcher(regressed), write: true, now: () => new Date('2026-09-18T12:00:00.000Z') });
    expect(result.status).toBe('needs-review');
    expect(codesOf(result, 'error')).toEqual(['structure-unnumbered-section']);
    expect(codesOf(result, 'warning')).toContain('import-regression-legacy');
    expect(result.findings.find((finding) => finding.code === 'import-regression-legacy')?.message).toContain('wird laut Legacy-Ausnahme legacy-515151 (vorbereitet 2026-09-17, Freigabestatus pending-human-review) weiter ausgeliefert');
    expect(result.manifestEntry).toMatchObject({ importStatus: 'imported-with-warnings', parserVersion: OLD_PARSER, targetSlug: 'testvo-west' });
    expect(await readManifestEntry(root, 'lrgv', IDENTITY)).toMatchObject({ importStatus: 'imported-with-warnings', parserVersion: OLD_PARSER });
    expect(await contentExists()).toBe(true);
    queue = await readReviewQueue(root);
    expect(queue.items.find((item) => item.id === structure.id)).toMatchObject({ status: 'deferred', occurrence: 'current', decision: { decidedBy: 'Redaktion' } });
    // Der frühere Regressionsfall (Kategorie other) tritt nicht mehr auf und wird abgelöst, nie gelöscht.
    expect(queue.items.filter((item) => item.sourceIdentity === IDENTITY && item.category === 'other').map((item) => [item.status, item.occurrence])).toEqual([['superseded', 'not-reproduced']]);
    const report = await collectVersionReport(root);
    expect(report.ready).toBe(true);
    expect(report.areas.lrgv.outdated.justified.map((entry) => [entry.sourceIdentity, entry.exception?.id])).toEqual([[IDENTITY, 'legacy-515151']]);
    expect(report.notices).toEqual([expect.stringContaining('LRGV: 1 begründete Legacy-Ausnahme(n)')]);
  });

  it('depublish: Dry-run entfernt nichts; Schreiblauf entfernt Inhalt und Report, Manifest trägt den aktuellen Befund, Slug bleibt reserviert', async () => {
    await writeExceptions(root, [exceptionFor({ disposition: 'depublish', source: { url: NATIVE_URL, sha256: regressedSha }, reason: 'Zuordnung des Absatzes ist ohne Kennzeichen nicht sicher; bis zur redaktionellen Entscheidung nicht ausliefern' })]);
    const dry = await importRechtNrwNorm({ url: NATIVE_URL, root, fetcher: inlineFetcher(regressed), now });
    expect(codesOf(dry, 'warning')).toContain('import-regression-depublished');
    expect(dry.manifestEntry).toMatchObject({ importStatus: 'needs-review', parserVersion: PARSER_VERSION, targetSlug: '' });
    expect(await contentExists()).toBe(true);
    expect(await readManifestEntry(root, 'lrgv', IDENTITY)).toMatchObject({ importStatus: 'imported-with-warnings', parserVersion: OLD_PARSER });

    const result = await importRechtNrwNorm({ url: NATIVE_URL, root, fetcher: inlineFetcher(regressed), write: true, now });
    expect(result.status).toBe('needs-review');
    expect(codesOf(result, 'error')).toEqual(['structure-unnumbered-section']);
    expect(codesOf(result, 'warning')).toContain('import-regression-depublished');
    expect(result.writtenFiles).toContain('content/norms/west/testvo-west/ (entfernt)');
    expect(await contentExists()).toBe(false);
    expect(await stat(join(root, 'content', 'norms', 'west', 'testvo-west')).then(() => true, () => false)).toBe(false);
    expect(await stat(join(root, 'data', 'audits', 'recht-nrw', 'testvo-west.json')).then(() => true, () => false)).toBe(false);
    expect(await readManifestEntry(root, 'lrgv', IDENTITY)).toMatchObject({ importStatus: 'needs-review', parserVersion: PARSER_VERSION, targetSlug: '', reviewStatus: 'open' });
    expect((await readSlugRegistry(root)).entries.map((entry) => entry.slug)).toContain('testvo-west');
    // Nach der Depublikation ist der Eintrag aktuell; die Ausnahme ist gegenstandslos (Hinweis, kein Blocker).
    const report = await collectVersionReport(root);
    expect(report).toMatchObject({ ready: true, blockers: [] });
    expect(report.areas.lrgv.outdated.total).toBe(0);
    expect(report.areas.lrgv.obsoleteExceptions).toEqual(['legacy-515151']);
    // Wiederholung ist idempotent (nichts mehr zu entfernen, kein Fehler).
    const again = await importRechtNrwNorm({ url: NATIVE_URL, root, fetcher: inlineFetcher(regressed), write: true, now });
    expect(again.status).toBe('needs-review');
    expect(codesOf(again, 'error')).toEqual(['structure-unnumbered-section']);
    await rm(join(root, LEGACY_EXCEPTIONS_PATH), { force: true });
  });
});

describe('Regressionsschutz mit Legacy-Ausnahmen (LRMB-Importpfad, Fixtures)', () => {
  const now = (): Date => new Date('2026-09-17T12:00:00.000Z');
  const lrmbFixtures = join(fixtures, 'lrmb');
  const DIRECT = 'https://recht.nrw.de/lrmb/verwaltungsvorschrift/01062022-runderlass-testbestimmungen-fuer-die-ordnungsbehoerden';
  const PDF = 'https://recht.nrw.de/system/files/pdf/ministerial-journal/2022/03/16/abc/anlage-testbestimmungen.pdf';
  const FILES: Record<string, string> = { [DIRECT]: 'page-direct.html', [PDF]: 'pdf', 'https://recht.nrw.de/mblnrw/2020-s446-0': 'mbl-2020-s446-0.html', 'https://recht.nrw.de/mblnrw/2024-s805': 'mbl-2024-s805.html' };
  const lrmbFetcher = (): RechtNrwFetcher => ({
    stats: { networkRequests: 0, cacheHits: 0 },
    async fetch(url: string): Promise<FetchedDocument> {
      const file = FILES[url];
      if (!file) throw new RechtNrwFetchError('not-found', url, `HTTP 404 für ${url}`, 404);
      const bytes = file === 'pdf' ? new TextEncoder().encode('%PDF-1.4 Testanlage') : new Uint8Array(await readFile(join(lrmbFixtures, file)));
      return { url, finalUrl: url, status: 200, contentType: file === 'pdf' ? 'application/pdf' : 'text/html; charset=UTF-8', retrievedAt: '2026-09-15T10:00:00.000Z', sha256: sha(bytes), bytes, fromCache: false };
    },
  });
  const SLUG = 'runderlass-testbestimmungen-fuer-die-ordnungsbehoerden-west';
  const OLD_LRMB_PARSER = 'recht-nrw-lrmb-parser/1.2.0';

  it('depublish: Vorschrift, die der neue Bewerter nicht mehr übernimmt, wird kontrolliert entfernt; Manifest trägt aktuellen Status und Parserversion', async () => {
    const root = join(await tempBase('recht-nrw-staleness-lrmb-'), 'root');
    await mkdir(join(root, 'content', 'norms', 'west'), { recursive: true });
    await writeFile(join(root, 'package.json'), '{"name":"tmp"}');
    const first = await importRechtNrwLrmbDocument({ url: DIRECT, root, fetcher: lrmbFetcher(), write: true, now });
    expect(first.status).toBe('imported-with-warnings');
    const identity = first.manifestEntry!.sourceIdentity;
    const pageSha = first.manifestEntry!.sha256;
    const stored = (await readManifestEntry(root, 'lrmb', identity))!;
    await writeManifestEntry(root, { ...stored, parserVersion: OLD_LRMB_PARSER });
    const contentExists = async (): Promise<boolean> => stat(join(root, 'content', 'norms', 'west', SLUG, 'versions', '2023-12-01.json')).then(() => true, () => false);
    // Neuer Bewerter (simuliert über dokumentiertes Override): Ausschluss → Regression der übernommenen Vorschrift.
    const exclude = [{ id: 'test-exclude', sourceIdentity: identity, field: 'normativity' as const, value: 'exclude', reason: 'Testentscheidung', evidence: { source: 'Test' }, reviewedAt: '2026-09-17' }];
    const guarded = await importRechtNrwLrmbDocument({ url: DIRECT, root, fetcher: lrmbFetcher(), write: true, now, overrides: exclude });
    expect(guarded.status).toBe('excluded');
    expect(guarded.findings.filter((finding) => finding.severity === 'error').map((finding) => finding.code)).toEqual(['import-regression']);
    expect(await readManifestEntry(root, 'lrmb', identity)).toMatchObject({ importStatus: 'imported-with-warnings', parserVersion: OLD_LRMB_PARSER, targetSlug: SLUG });
    expect(await contentExists()).toBe(true);

    await writeExceptions(root, [exceptionFor({ id: 'legacy-lrmb', sourceIdentity: identity, sourceArea: 'lrmb', targetSlug: SLUG, disposition: 'depublish', source: { url: DIRECT, sha256: pageSha }, legacy: { parserVersion: OLD_LRMB_PARSER, transformerVersion: TRANSFORMER_VERSION, importStatus: 'imported-with-warnings' }, current: { parserVersion: LRMB_PARSER_VERSION, findings: [] }, reason: 'Im Zweifel Review statt unbelegter Übernahme' })]);
    const dry = await importRechtNrwLrmbDocument({ url: DIRECT, root, fetcher: lrmbFetcher(), now, overrides: exclude });
    expect(dry.findings.map((finding) => finding.code)).toContain('import-regression-depublished');
    expect(await contentExists()).toBe(true);
    const result = await importRechtNrwLrmbDocument({ url: DIRECT, root, fetcher: lrmbFetcher(), write: true, now, overrides: exclude });
    expect(result.status).toBe('excluded');
    expect(result.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
    expect(result.findings.find((finding) => finding.code === 'import-regression-depublished')?.message).toContain(`Vorschrift ${SLUG} ergibt jetzt excluded`);
    expect(result.writtenFiles).toContain(`content/norms/west/${SLUG}/ (entfernt)`);
    expect(await contentExists()).toBe(false);
    expect(await stat(join(root, 'data', 'audits', 'recht-nrw', `${SLUG}.json`)).then(() => true, () => false)).toBe(false);
    expect(await readManifestEntry(root, 'lrmb', identity)).toMatchObject({ importStatus: 'excluded', parserVersion: LRMB_PARSER_VERSION, targetSlug: '' });
    expect((await readSlugRegistry(root)).entries.map((entry) => entry.slug)).toContain(SLUG);
    const report = await collectVersionReport(root);
    expect(report).toMatchObject({ ready: true, blockers: [] });
    expect(report.areas.lrmb.obsoleteExceptions).toEqual(['legacy-lrmb']);
  });
});
