/**
 * Coverage-Report, Rekonstruktionsqueue, Institutionen-Zuordnung, Zustimmungsgesetze und Aktualität des
 * Importbestands – ohne Netz, mit synthetischen Eingaben aus den echten Hilfsfunktionen.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { PARSER_VERSION } from '@landesrecht/importer-recht-nrw/common/constants.ts';
import { computeCoverage, coverageComparable, percent, renderCoverageMarkdown, type CoverageInput, type CoverageReport } from '@landesrecht/importer-recht-nrw/common/coverage.ts';
import { buildEnumeration, type EnumerationFile, type EnumerationItem, type SearchHit } from '@landesrecht/importer-recht-nrw/common/enumeration.ts';
import type { ImportManifest, ManifestEntry, ManifestRawDocument, SourceArea } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { emptyReviewQueue, reviewItemId, type ReviewCategory, type ReviewItem, type ReviewItemStatus } from '@landesrecht/importer-recht-nrw/common/review-queue.ts';
import { emptySlugRegistry, type SlugRegistry } from '@landesrecht/importer-recht-nrw/common/slug-registry.ts';
import { currentParserVersion, isStaleEntry, regenerationCommand } from '@landesrecht/importer-recht-nrw/common/staleness.ts';
import { detectConsentLaw, parseTreatyInForceNotice } from '@landesrecht/importer-recht-nrw/lrgv/treaty.ts';
import { LRMB_PARSER_VERSION } from '@landesrecht/importer-recht-nrw/lrmb/parser.ts';
import { buildReconstructionQueue, priorityFor } from '@landesrecht/importer-recht-nrw/lrmb/reconstruction-queue.ts';
import {
  compileInstitutionRegistry,
  emptyInstitutionRegistry,
  INSTITUTION_REGISTRY_SCHEMA,
  INSTITUTION_STATUSES,
  readInstitutionRegistry,
  type InstitutionEntry,
  type InstitutionRegistry,
  type InstitutionStatus,
} from '@landesrecht/importer-recht-nrw/transform/institution-registry.ts';
import { TRANSFORMER_VERSION } from '@landesrecht/importer-recht-nrw/transform/rules.ts';

const NOW = '2026-09-15T12:00:00.000Z';
const LATER = '2026-09-16T08:00:00.000Z';
const VV = 'https://recht.nrw.de/lrmb/verwaltungsvorschrift';
const LRGV = 'https://recht.nrw.de/lrgv';
const repoRoot = process.cwd();

function manifestEntry(sourceArea: SourceArea, sourceIdentity: string, overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  const type = sourceArea === 'lrgv' ? 'gesetz' : 'verwaltungsvorschrift';
  const url = `${sourceArea === 'lrgv' ? LRGV : 'https://recht.nrw.de/lrmb'}/${type}/01012020-vorschrift-${sourceIdentity.replace(/\D/gu, '')}`;
  return {
    sourceSystem: 'recht-nrw', sourceArea, sourceDocumentType: type, sourceIdentity, sourceTitle: `Vorschrift ${sourceIdentity}`, sourceType: type, sourceUrl: url, stemUrl: `https://recht.nrw.de/taxonomy/term/${sourceIdentity.replace(/\D/gu, '')}`,
    sourceVersion: { url, validFrom: '2020-01-01', validTo: null }, selectedVersionUrl: url, sourceValidFrom: '2020-01-01', sourceValidTo: null, baselineStatus: 'active-at-baseline', validityEvidence: [], retrievedAt: NOW,
    sha256: 'a'.repeat(64), contentType: 'text/html', contentFormat: 'native', parserVersion: currentParserVersion(sourceArea), transformerVersion: TRANSFORMER_VERSION, targetJurisdiction: 'west', targetSlug: '', baselineDate: '2023-12-01',
    importStatus: 'imported', reviewStatus: 'none', reconstructionStatus: 'direct', reconstructionSources: [], reconstructionSteps: [], importedAt: NOW, rawDocuments: [], versionsConsidered: [], overrides: [], findings: [],
    integrity: { fetchParse: true, sourceCanonical: true }, transformation: { changes: 0, unresolved: 0 },
    ...overrides,
  };
}

function rawDocument(overrides: Partial<ManifestRawDocument> = {}): ManifestRawDocument {
  return { role: 'version-page', url: `${VV}/x`, finalUrl: `${VV}/x`, sha256: 'b'.repeat(64), contentType: 'text/html', retrievedAt: NOW, byteLength: 100, ...overrides };
}

function reviewItem(sourceIdentity: string, category: ReviewCategory, key: string, options: { status?: ReviewItemStatus; severity?: 'blocking' | 'non-blocking'; details?: string[]; summary?: string; sourceArea?: SourceArea } = {}): ReviewItem {
  return {
    id: reviewItemId(sourceIdentity, category, key), sourceArea: options.sourceArea ?? 'lrmb', sourceIdentity, sourceUrl: `${VV}/x`, category, key, severity: options.severity ?? 'blocking',
    summary: options.summary ?? `${category}: ${key}`, details: options.details ?? [], firstSeenAt: NOW, updatedAt: NOW, occurrence: 'current', status: options.status ?? 'open',
  };
}

const manifestOf = (entries: ManifestEntry[]): ImportManifest => ({ schemaVersion: 'recht-nrw-import-manifest/2', sourceSystem: 'recht-nrw', baselineDate: '2023-12-01', entries });

/**
 * LRMB-Enumeration mit elf Einträgen: drei verarbeitet (term:1 übernommen, term:2 Review, term:3 ausgeschlossen),
 * fünf offen, einer fehlgeschlagen ohne Manifesteintrag, einer ohne Seitenabruf ausgeschlossen, einer in term:1
 * zusammengeführt (zählt nicht zur Basis). Basis = 10.
 */
const LRMB_TITLES = [
  'Runderlass zum Landesbeamtengesetz',
  'Verwaltungsvorschrift zum Schulgesetz',
  'Erlass über Ehrungen',
  'Runderlass Dienstreisen',
  'Richtlinie Sportförderung',
  'Hinweise zur Datenverarbeitung',
  'Bekanntgabe Landeswettbewerb',
  'Satzung der Architektenkammer',
  'Erlass über Zuständigkeiten',
  'Stellenausschreibung Referat 3',
  'Runderlass zum Landesbeamtengesetz (frühere Adresse)',
] as const;

const lrmbKey = (index: number): string => `stem:verwaltungsvorschrift/vv-${String(index).padStart(2, '0')}`;

function lrmbEnumeration(): EnumerationFile {
  const urls = LRMB_TITLES.map((_, index) => `${VV}/01012020-vv-${String(index).padStart(2, '0')}`);
  const hits: SearchHit[] = urls.map((url, index) => ({ nodeId: String(index + 1), url, indexType: 'state_law_ministerial_gazette', title: LRMB_TITLES[index]! }));
  const file = buildEnumeration({ area: 'lrmb', sitemap: { pages: 1, urls }, search: { total: hits.length, hits }, now: NOW });
  const item = (index: number): EnumerationItem => file.items.find((candidate) => candidate.key === lrmbKey(index))!;
  Object.assign(item(0), { sourceIdentity: 'term:1', status: 'done', attempts: 1 });
  Object.assign(item(1), { sourceIdentity: 'term:2', status: 'review', attempts: 1 });
  Object.assign(item(2), { sourceIdentity: 'term:3', status: 'done', attempts: 1 });
  Object.assign(item(8), { status: 'failed', attempts: 1, lastError: { code: 'http', message: 'HTTP 500' } });
  Object.assign(item(10), { mergedInto: 'term:1', status: 'done' });
  return file;
}

/** LRGV-Enumeration: zwei Gesetze/Verordnungen (eines verarbeitet) und eine Bekanntmachung als Evidenzquelle. Basis = 2. */
function lrgvEnumeration(): EnumerationFile {
  const law = `${LRGV}/gesetz/01082005-schulgesetz`;
  const regulation = `${LRGV}/rechtsverordnung/01012019-ausbildungsordnung`;
  const notice = `${LRGV}/bekanntmachung/01012021-inkrafttreten-staatsvertrag`;
  const hits: SearchHit[] = [
    { nodeId: '50', url: law, indexType: 'state_law_and_regulations', title: 'Schulgesetz für das Land Nordrhein-Westfalen' },
    { nodeId: '51', url: regulation, indexType: 'state_law_and_regulations', title: 'Ausbildungsordnung' },
    { nodeId: '52', url: notice, indexType: 'state_law_and_regulations', title: 'Bekanntmachung über das Inkrafttreten des Staatsvertrages über die Hochschulzulassung' },
  ];
  const file = buildEnumeration({ area: 'lrgv', sitemap: { pages: 1, urls: [law, regulation, notice] }, search: { total: 3, hits }, now: NOW });
  Object.assign(file.items.find((item) => item.key === 'stem:gesetz/schulgesetz')!, { sourceIdentity: 'term:50', status: 'done', attempts: 1 });
  return file;
}

function baseEntries(): ManifestEntry[] {
  return [
    manifestEntry('lrmb', 'term:1', { importStatus: 'imported', reconstructionStatus: 'direct', normativity: { decision: 'include', reasons: [] }, targetSlug: 'rda-west', transformation: { changes: 4, unresolved: 7 }, rawDocuments: [rawDocument({ archiveStatus: 'verified' }), rawDocument({ localSource: 'sources/recht-nrw/x.html' })] }),
    manifestEntry('lrmb', 'term:2', { importStatus: 'needs-review', reviewStatus: 'open', reconstructionStatus: 'reconstruction-required', normativity: { decision: 'review', reasons: [] }, findings: [{ severity: 'error', code: 'normativity-review', message: 'zweifelhaft' }], transformation: { changes: 0, unresolved: 0, postTransformAudit: false } }),
    manifestEntry('lrmb', 'term:3', { importStatus: 'excluded', baselineStatus: 'undetermined', reconstructionStatus: 'not-applicable', normativity: { decision: 'exclude', reasons: [] }, documentIdentity: { status: 'mismatch', signals: [] } }),
    manifestEntry('lrgv', 'term:50', {
      importStatus: 'imported-with-warnings', targetSlug: 'schulg-west', reviewStatus: 'open',
      consentLaw: { detected: true, treatyTextLocation: 'html-annex', evidence: [] },
      attachments: [{ label: 'Anlage 1', url: `${LRGV}/anlage.pdf`, mediaType: 'application/pdf', essential: false, handling: 'archived-source-only' }],
      findings: [{ severity: 'warning', code: 'enacting-body-mapping-required', message: 'Erlassorgan ohne Simulationsorgan' }],
      transformation: { changes: 2, unresolved: 2 }, rawDocuments: [rawDocument()],
    }),
  ];
}

function baseQueueItems(): ReviewItem[] {
  return [
    reviewItem('term:2', 'normativity', 'normativity-review'),
    reviewItem('term:2', 'reconstruction-required', 'reconstruction-required'),
    reviewItem('term:1', 'institution-mapping', 'detections:authority', { severity: 'non-blocking', details: ['Bezirksregierung ×2 (body[1].text, body[2].text)', 'Landesamt für Natur (body[4].text)'] }),
    reviewItem('term:1', 'institution-mapping', 'detections:ministry', { severity: 'non-blocking', details: ['Ministerium des Innern ×4 (body[5].text)'] }),
    reviewItem('term:50', 'attachment', 'annex-pdf-only:Anlage 1', { status: 'accepted', severity: 'non-blocking', sourceArea: 'lrgv' }),
    reviewItem('term:3', 'reconstruction-uncertain', 'step-3'),
    reviewItem('term:3', 'normativity', 'normativity-review', { status: 'superseded' }),
  ];
}

function slugRegistryOf(entries: Array<[string, string]>): SlugRegistry {
  const registry = emptySlugRegistry();
  registry.entries = entries.map(([sourceIdentity, slug]) => ({ slug, sourceIdentity, candidate: slug, assignment: 'derived' as const }));
  return registry;
}

const syntheticInstitutionRegistry: InstitutionRegistry = {
  schemaVersion: INSTITUTION_REGISTRY_SCHEMA,
  defaults: { 'external-name': 'preserve', authority: 'review' },
  entries: [
    { id: 'bund', group: 'Bundesorgane', category: 'external-name', match: ['Bundesministerium des Innern'], status: 'preserve', reason: 'Bundesorgan bleibt unverändert.', reviewedAt: '2026-09-15' },
    { id: 'landesaemter', group: 'Landesämter', category: 'authority', pattern: '^Landesamt\\b', status: 'map', target: 'Landesamt Westdeutschland', reason: 'Festgelegte Entsprechung.', reviewedAt: '2026-09-15' },
    { id: 'lds-alt', group: 'Landesämter', category: 'authority', match: ['Landesamt für Datenverarbeitung und Statistik'], status: 'historical-source-only', reason: 'Historische Bezeichnung.', reviewedAt: '2026-09-15' },
  ],
};

function baseInput(overrides: Partial<CoverageInput> = {}): CoverageInput {
  return {
    manifest: manifestOf(baseEntries()),
    queue: { ...emptyReviewQueue(), items: baseQueueItems() },
    enumerations: { lrmb: lrmbEnumeration(), lrgv: lrgvEnumeration() },
    contentSlugs: new Set(['rda-west', 'schulg-west']),
    slugRegistry: slugRegistryOf([['term:1', 'rda-west'], ['term:50', 'schulg-west']]),
    institutionRegistry: syntheticInstitutionRegistry,
    recipes: new Set(['term:2', 'term:7']),
    now: NOW,
    ...overrides,
  };
}

let emptyRoot: string;
beforeAll(async () => {
  emptyRoot = await mkdtemp(join(tmpdir(), 'landesrecht-coverage-'));
});
afterAll(async () => {
  await rm(emptyRoot, { recursive: true, force: true });
});

describe('RECHT.NRW Coverage: Kennzahlen und Basis', () => {
  it('rundet Anteile auf eine Nachkommastelle und liefert bei Basis 0 null', () => {
    expect(percent(3, 10)).toBe(30);
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(2, 3)).toBe(66.7);
    expect(percent(2, 7)).toBe(28.6);
    expect(percent(0, 5)).toBe(0);
    expect(percent(5, 0)).toBeNull();
  });

  it('bezieht LRMB-Kennzahlen auf die enumerierten Kandidaten und weist Offenes aus (3 von 10 verarbeitet ≠ 100 %)', () => {
    const report = computeCoverage(baseInput());
    const lrmb = report.lrmb;
    expect(lrmb.scope).toBe('bulk');
    expect(lrmb.base.count).toBe(10);
    expect(lrmb.base.label).toMatch(/^enumerierte Stammnorm-Kandidaten/u);
    expect(lrmb.metrics).toEqual({
      enumeratedTerms: { count: 10, percent: 100 },
      processed: { count: 3, percent: 30 },
      pending: { count: 5, percent: 50 },
      likelyNormative: { count: 3, percent: 30 },
      excluded: { count: 2, percent: 20 },
      reviewNormativity: { count: 1, percent: 10 },
      activeAtBaseline: { count: 2, percent: 20 },
      notActive: { count: 0, percent: 0 },
      undetermined: { count: 0, percent: 0 },
      directImport: { count: 1, percent: 10 },
      reconstructed: { count: 0, percent: 0 },
      reconstructionRequired: { count: 1, percent: 10 },
      pdfOnly: { count: 0, percent: 0 },
      attachmentIncomplete: { count: 0, percent: 0 },
      historicalGap: { count: 0, percent: 0 },
      documentIdentityReview: { count: 1, percent: 10 },
      failed: { count: 1, percent: 10 },
    });
    // Jeder Kandidat ist genau einmal verbucht: verarbeitet, offen, ohne Seitenabruf ausgeschlossen oder fehlgeschlagen.
    expect(lrmb.metrics.processed!.count + lrmb.metrics.pending!.count + 1 + 1).toBe(lrmb.base.count);
    for (const [key, value] of Object.entries(lrmb.metrics)) if (key !== 'enumeratedTerms') expect(value.percent, key).toBeLessThan(100);
    expect(lrmb.crosscheck).toMatchObject({ sitemapUrls: 11, items: 11, excluded: 1, manifestWithoutEnumeration: 0, ok: true });
    expect(lrmb.stale).toEqual({ count: 0, identities: [] });
  });

  it('zählt LRGV-Bekanntmachungen als Evidenzquellen außerhalb der Basis', () => {
    const lrgv = computeCoverage(baseInput()).lrgv;
    expect(lrgv.scope).toBe('bulk');
    expect(lrgv.base.count).toBe(2);
    expect(lrgv.metrics).toEqual({
      enumeratedTerms: { count: 2, percent: 100 },
      processed: { count: 1, percent: 50 },
      pending: { count: 1, percent: 50 },
      activeAtBaseline: { count: 1, percent: 50 },
      notActive: { count: 0, percent: 0 },
      imported: { count: 1, percent: 50 },
      importedWithWarnings: { count: 1, percent: 50 },
      review: { count: 0, percent: 0 },
      failed: { count: 0, percent: 0 },
      notRenderable: { count: 0, percent: 0 },
      pdfAttachmentReview: { count: 1, percent: 50 },
      versionConflict: { count: 0, percent: 0 },
      excluded: { count: 0, percent: 0 },
      consentLaws: { count: 1, percent: 50 },
      evidenceNotices: { count: 1, percent: 50 },
    });
    // Der Abgleich ist der Stand beim Aufbau der Enumeration (Term-ID erst danach im Bulk-Lauf gesetzt).
    expect(lrgv.crosscheck).toMatchObject({ items: 3, resolvedTerms: 0, manifestWithoutEnumeration: 0 });
  });

  it('nutzt ohne Enumeration die geprüften Quellen als Basis (Beispielkorpus) und liefert bei leerer Basis keine Anteile', () => {
    const report = computeCoverage(baseInput({ enumerations: {}, manifest: manifestOf(baseEntries().filter((entry) => entry.sourceArea === 'lrgv')) }));
    expect(report.lrgv).toMatchObject({ scope: 'sample', base: { count: 1 } });
    expect(report.lrgv.base.label).toMatch(/^geprüfte Quellen/u);
    expect(report.lrgv.crosscheck).toBeUndefined();
    expect(report.lrgv.metrics.processed).toEqual({ count: 1, percent: 100 });
    expect(report.lrgv.metrics.pending).toEqual({ count: 0, percent: 0 });
    expect(report.lrgv.metrics.evidenceNotices).toEqual({ count: 0, percent: 0 });
    expect(report.lrmb).toMatchObject({ scope: 'sample', base: { count: 0 } });
    expect(Object.values(report.lrmb.metrics).every((value) => value.count === 0 && value.percent === null)).toBe(true);
    expect(renderCoverageMarkdown(report)).toContain('| Verarbeitet (Manifesteintrag) | 0 | – |');
  });

  it('fasst Review-Queue, Institutionen, Rohquellen, Rekonstruktion und Qualität zusammen', () => {
    const report = computeCoverage(baseInput());
    expect(report).toMatchObject({ schemaVersion: 'recht-nrw-coverage/2', generatedAt: NOW, baselineDate: '2023-12-01', runs: [] });
    expect(report.reviewQueue).toEqual({ open: 5, openBlocking: 3, openIdentities: 3, byCategory: { 'institution-mapping': 2, normativity: 1, 'reconstruction-required': 1, 'reconstruction-uncertain': 1 }, byStatus: { accepted: 1, open: 5, superseded: 1 } });
    expect(Object.keys(report.reviewQueue.byCategory)).toEqual(['institution-mapping', 'normativity', 'reconstruction-required', 'reconstruction-uncertain']);
    expect(report.institutions).toEqual({ openReferences: 7, byCategory: { authority: 3, ministry: 4 }, enactingBodyWithoutMapping: 1, registryEntriesByStatus: { preserve: 1, map: 1, 'historical-source-only': 1 } });
    expect(report.archive).toEqual({ unknown: 1, verified: 1, versioned: 1 });
    expect(report.reconstruction).toEqual({ required: 1, reconstructed: 0, recipes: 2, uncertain: 1 });
    expect(report.quality).toEqual({ integrityFailures: 0, postTransformAuditFailures: 1, unresolvedReferences: 9, failedImports: 0, documentIdentityMismatch: 1, documentIdentityReview: 0 });
    expect(report.consistency).toEqual({ importedWithoutContent: [], contentWithoutManifest: [], slugRegistryMismatches: [], ok: true });
  });
});

describe('RECHT.NRW Coverage: Konsistenz und Aktualität', () => {
  it('erkennt Manifesteinträge ohne Enumerationseintrag', () => {
    const entries = [...baseEntries(), manifestEntry('lrmb', 'term:99', { targetSlug: 'extra-west' })];
    const report = computeCoverage(baseInput({ manifest: manifestOf(entries), contentSlugs: new Set(['rda-west', 'schulg-west', 'extra-west']), slugRegistry: slugRegistryOf([['term:1', 'rda-west'], ['term:50', 'schulg-west'], ['term:99', 'extra-west']]) }));
    expect(report.lrmb.crosscheck?.manifestWithoutEnumeration).toBe(1);
    expect(report.lrmb.metrics.processed).toEqual({ count: 4, percent: 40 });
    expect(report.lrgv.crosscheck?.manifestWithoutEnumeration).toBe(0);
    expect(renderCoverageMarkdown(report)).toContain('| Manifest ohne Enumeration | 1 |');
  });

  it('erkennt Übernahmen ohne Inhalt, Inhalte ohne Manifesteintrag und Abweichungen der Slug-Registry', () => {
    const report = computeCoverage(baseInput({ contentSlugs: new Set(['rda-west', 'fremd-west']), slugRegistry: slugRegistryOf([['term:50', 'schulg-anders-west']]) }));
    expect(report.consistency).toEqual({
      importedWithoutContent: ['schulg-west'],
      contentWithoutManifest: ['fremd-west'],
      slugRegistryMismatches: ['term:1: rda-west ≠ –', 'term:50: schulg-west ≠ schulg-anders-west'],
      ok: false,
    });
    const withoutRegistry = computeCoverage(baseInput({ contentSlugs: new Set(['rda-west', 'schulg-west']) , slugRegistry: undefined }));
    expect(withoutRegistry.consistency).toEqual({ importedWithoutContent: [], contentWithoutManifest: [], slugRegistryMismatches: [], ok: true });
    const markdown = renderCoverageMarkdown(report);
    expect(markdown).toContain('- Übernommen ohne Inhalt: 1');
    expect(markdown).toContain('- Inhalt ohne Manifesteintrag: 1 (fremd-west)');
    expect(markdown).toContain('- Slug-Registry abweichend: 2');
  });

  it('meldet übernommene Einträge mit abweichender Parser- oder Transformerversion als veraltet', () => {
    const entries = baseEntries().map((entry) => {
      if (entry.sourceIdentity === 'term:1') return { ...entry, transformerVersion: 'recht-nrw-transformer/1.0.0' };
      if (entry.sourceIdentity === 'term:2') return { ...entry, parserVersion: 'recht-nrw-lrmb-parser/0.9.0' }; // nicht übernommen → nicht veraltet
      if (entry.sourceIdentity === 'term:50') return { ...entry, parserVersion: LRMB_PARSER_VERSION }; // Parser des falschen Bereichs
      return entry;
    });
    const report = computeCoverage(baseInput({ manifest: manifestOf(entries) }));
    expect(report.lrmb.stale).toEqual({ count: 1, identities: ['term:1'], suggestion: regenerationCommand('lrmb') });
    expect(report.lrgv.stale).toEqual({ count: 1, identities: ['term:50'], suggestion: regenerationCommand('lrgv') });
    expect(renderCoverageMarkdown(report)).toContain('Veraltete Importe (Parser/Transformer): 1 – Regeneration: `npm run import:recht-nrw:bulk -- --area lrmb --regenerate-stale --offline --write --resume`');
  });

  it('prüft die Aktualität je Bereich gegen die aktuellen Parser- und Transformerversionen', () => {
    expect(currentParserVersion('lrgv')).toBe(PARSER_VERSION);
    expect(currentParserVersion('lrmb')).toBe(LRMB_PARSER_VERSION);
    expect(isStaleEntry({ sourceArea: 'lrgv', parserVersion: PARSER_VERSION, transformerVersion: TRANSFORMER_VERSION })).toBe(false);
    expect(isStaleEntry({ sourceArea: 'lrmb', parserVersion: LRMB_PARSER_VERSION, transformerVersion: TRANSFORMER_VERSION })).toBe(false);
    expect(isStaleEntry({ sourceArea: 'lrmb', parserVersion: PARSER_VERSION, transformerVersion: TRANSFORMER_VERSION })).toBe(true);
    expect(isStaleEntry({ sourceArea: 'lrgv', parserVersion: PARSER_VERSION, transformerVersion: 'recht-nrw-transformer/1.0.0' })).toBe(true);
    expect(regenerationCommand('lrgv')).toBe('npm run import:recht-nrw:bulk -- --area lrgv --regenerate-stale --offline --write --resume');
  });
});

describe('RECHT.NRW Coverage: Markdown und Vergleichsform', () => {
  it('enthält die zentralen Kennzahlen mit Basis, Anteilen und offenen Fällen', () => {
    const runs: CoverageReport['runs'] = [{ runId: 'lauf-1', sourceArea: 'lrmb', runStatus: 'completed', endedAt: '2026-09-15T13:00:00.000Z', processed: 3 }];
    const markdown = renderCoverageMarkdown(computeCoverage(baseInput({ runs })));
    for (const expected of [
      '# Coverage RECHT.NRW → Land Westdeutschland',
      'Stichtag 2023-12-01.',
      '## LRGV (Gesetze, Rechtsverordnungen)',
      '## LRMB (Verwaltungsvorschriften)',
      'Umfang: Bulk (Enumeration) · Basis: enumerierte Stammnorm-Kandidaten (Enumeration; Dubletten werden im Bulk-Lauf zusammengeführt) = 10',
      '| Enumerierte Stammnormen (Basis) | 10 | 100,0 % |',
      '| Verarbeitet (Manifesteintrag) | 3 | 30,0 % |',
      '| Noch nicht verarbeitet | 5 | 50,0 % |',
      '| Ausgeschlossen | 2 | 20,0 % |',
      '| Fehlgeschlagen | 1 | 10,0 % |',
      '| Bekanntmachungen (Evidenzquellen, keine Normen) | 1 | 50,0 % |',
      '| Zustimmungsgesetze | 1 | 50,0 % |',
      '| Manifest ohne Enumeration | 0 |',
      'Abgleich: ok',
      'Veraltete Importe (Parser/Transformer): 0',
      'Offen: 5 (blockierend 3, 3 Quellen)',
      '| institution-mapping | 2 |',
      'Status aller Fälle: accepted 1, open 5, superseded 1',
      'Offene Bezeichnungen ohne Entsprechung: 7 (authority 3, ministry 4); Erlassorgan ohne Simulationsorgan: 1; Zuordnungseinträge: preserve 1, map 1, historical-source-only 1.',
      '- Archivstatus der Rohquellen: unknown 1, verified 1, versioned 1',
      '- Rekonstruktion: erforderlich 1, rekonstruiert 0, Rezepte 2, unsicher 1',
      '- lauf-1: completed, 3 verarbeitet (Ende 2026-09-15T13:00:00.000Z)',
    ]) expect(markdown).toContain(expected);
    expect(markdown).not.toContain('- keine');
    expect(markdown).not.toMatch(/\| Verarbeitet \(Manifesteintrag\) \| \d+ \| 100,0 % \|/u);
  });

  it('zeigt Abgleichsprobleme der Enumeration im Markdown an', () => {
    const lrmb = lrmbEnumeration();
    lrmb.crosscheck = { ...lrmb.crosscheck, ok: false, problems: ['2 Sitemap-Adressen ohne Eintrag'] };
    const markdown = renderCoverageMarkdown(computeCoverage(baseInput({ enumerations: { lrmb, lrgv: lrgvEnumeration() } })));
    expect(markdown).toContain('Abgleich: **Abweichungen:** 2 Sitemap-Adressen ohne Eintrag');
    expect(markdown).toContain('- keine');
  });

  it('vergleicht Reports ohne Laufmetadaten (Zeitpunkt, Läufe), aber mit allen fachlichen Änderungen', () => {
    const stored = computeCoverage(baseInput());
    const recomputed = computeCoverage(baseInput({ now: LATER, runs: [{ runId: 'lauf-2', sourceArea: 'lrgv', runStatus: 'completed', endedAt: LATER, processed: 1 }] }));
    expect(recomputed.generatedAt).not.toBe(stored.generatedAt);
    expect(coverageComparable(recomputed)).toBe(coverageComparable(stored));
    const changedQueue = computeCoverage(baseInput({ queue: { ...emptyReviewQueue(), items: [...baseQueueItems(), reviewItem('term:1', 'attachment', 'annex-pdf-only:Anlage 2')] } }));
    expect(coverageComparable(changedQueue)).not.toBe(coverageComparable(stored));
  });
});

describe('RECHT.NRW Coverage: Rekonstruktionsqueue', () => {
  const plan = (sourceCompleteness: number, estimatedSteps: number): NonNullable<ManifestEntry['reconstructionPlan']> => ({
    direction: 'reverse', sourceCompleteness, estimatedSteps,
    amendments: [{ citation: 'MBl. NRW. 2024 S. 1', instructionCount: 3, direction: 'reverse' }, { citation: 'MBl. NRW. 2025 S. 2', instructionCount: 2, direction: 'reverse' }],
  });
  const source = (role: 'base' | 'amendment'): ManifestEntry['reconstructionSources'][number] => ({ role, label: role, url: `${VV}/quelle`, sha256: 'c'.repeat(64), retrievedAt: NOW });
  const entries = (): ManifestEntry[] => [
    manifestEntry('lrmb', 'term:10', { sourceDocumentType: 'allgemeine-verwaltungsvorschrift', sourceTitle: 'Allgemeine Verwaltungsvorschrift zum Beamtenversorgungsgesetz', importStatus: 'needs-review', reconstructionStatus: 'reconstruction-required', reconstructionPlan: plan(1, 12) }),
    manifestEntry('lrmb', 'term:11', { sourceDocumentType: 'runderlass', sourceTitle: 'Runderlass über Dienstreisen', importStatus: 'needs-review', reconstructionStatus: 'reconstruction-required', reconstructionSources: [source('base'), source('amendment'), source('amendment')] }),
    manifestEntry('lrmb', 'term:9', { sourceDocumentType: 'verwaltungsvorschrift', sourceTitle: 'VV Hundehaltung', importStatus: 'imported', reconstructionStatus: 'reconstructed' }),
    manifestEntry('lrmb', 'term:13', { sourceDocumentType: 'richtlinie', sourceTitle: 'Richtlinie Sportstätten', importStatus: 'imported', reconstructionStatus: 'direct' }),
    manifestEntry('lrmb', 'term:14', { sourceTitle: 'Direkt übernommen', importStatus: 'imported', reconstructionStatus: 'direct' }),
    manifestEntry('lrgv', 'term:60', { sourceTitle: 'Gesetz', importStatus: 'needs-review', reconstructionStatus: 'reconstruction-required' }),
    manifestEntry('lrmb', 'term:15', { sourceDocumentType: 'sonstige-verwaltungsvorschrift', sourceTitle: 'Hinweise für Vereine', importStatus: 'needs-review', reconstructionStatus: 'reconstruction-required', reconstructionPlan: plan(0.5, 150) }),
    manifestEntry('lrmb', 'term:100', { sourceDocumentType: 'runderlass', sourceTitle: 'Runderlass Ordnungsbehörden', importStatus: 'needs-review', reconstructionStatus: 'reconstruction-required' }),
  ];
  const review = () => ({
    ...emptyReviewQueue(),
    items: [
      reviewItem('term:13', 'reconstruction-uncertain', 'step-3', { summary: 'Rückwärtsschritt 3 nicht eindeutig' }),
      reviewItem('term:100', 'reconstruction-uncertain', 'step-1', { summary: 'Änderungsbefehl 1 mehrdeutig' }),
      reviewItem('term:9', 'reconstruction-uncertain', 'step-2', { status: 'resolved' }),
      reviewItem('term:14', 'attachment', 'annex-pdf-only:Anlage'),
    ],
  });

  it('berechnet die Priorität nachvollziehbar aus Dokumenttyp, Gesetzesbezug, Anwenderkreis, Quellenlage und Aufwand', () => {
    const [first, , , , , , unfinished] = entries();
    expect(priorityFor(first!)).toEqual({ score: 63, factors: ['Dokumenttyp allgemeine-verwaltungsvorschrift (+30)', 'Vorschrift zu einem Gesetz oder einer Verordnung (+10)', 'breiter Anwenderkreis laut Titel (+5)', 'alle Änderungsquellen zugeordnet (+20)', 'geschätzter Aufwand 12 Befehle (−2)'] });
    expect(priorityFor(unfinished!)).toEqual({ score: -10, factors: ['Dokumenttyp sonstige-verwaltungsvorschrift (+10)', 'Änderungsquellen unvollständig (50 %)', 'geschätzter Aufwand 150 Befehle (−20)'] });
    expect(priorityFor(manifestEntry('lrmb', 'term:1', { sourceDocumentType: 'unbekannt', sourceTitle: 'Bekanntgabe' }))).toEqual({ score: 10, factors: ['Dokumenttyp unbekannt (+10)'] });
  });

  it('ordnet Fälle nach Priorität (bei Gleichstand numerisch nach Term-ID) und leitet den Status ab', () => {
    const queue = buildReconstructionQueue(manifestOf(entries()), review(), new Set(['term:11', 'term:9', 'term:100']));
    expect(queue.items.map((item) => [item.sourceIdentity, item.priority.score, item.status, item.category])).toEqual([
      ['term:10', 63, 'queued', 'reconstruction-required'],
      ['term:9', 25, 'imported', 'reconstruction-required'],
      ['term:100', 25, 'blocked-uncertain', 'reconstruction-uncertain'],
      ['term:11', 20, 'recipe-draft', 'reconstruction-required'],
      ['term:13', 15, 'blocked-uncertain', 'reconstruction-uncertain'],
      ['term:15', -10, 'queued', 'reconstruction-required'],
    ]);
    expect(queue.summary).toEqual({ total: 6, queued: 2, recipeDraft: 1, imported: 1, blockedUncertain: 2, byGroup: { 'recipe-ready': 0, 'likely-reconstructable': 0, 'source-incomplete': 3, uncertain: 2, blocked: 0, imported: 1 } });
    expect(queue.schemaVersion).toBe('recht-nrw-reconstruction-queue/1');
    expect(queue.note).toMatch(/keine rechtliche Bewertung/u);

    const byId = new Map(queue.items.map((item) => [item.sourceIdentity, item]));
    expect(byId.get('term:10')).toEqual({
      sourceIdentity: 'term:10', title: 'Allgemeine Verwaltungsvorschrift zum Beamtenversorgungsgesetz', sourceDocumentType: 'allgemeine-verwaltungsvorschrift', category: 'reconstruction-required', status: 'queued',
      priority: priorityFor(entries()[0]!), amendments: 2, sourceCompleteness: 1, direction: 'reverse', estimatedSteps: 12,
      recipePath: 'data/imports/recht-nrw/reconstructions/term-10.json', recipeExists: false, blockers: [], otherBlockingCategories: [],
      group: 'source-incomplete', groupReasons: ['2 Änderung(en) ohne zugeordneten Ministerialblatt-Eintrag', '2 Änderung(en) ohne belegtes Inkrafttreten'],
    });
    expect(byId.get('term:11')).toMatchObject({ amendments: 2, recipeExists: true, recipePath: 'data/imports/recht-nrw/reconstructions/term-11.json' });
    expect(byId.get('term:11')!.sourceCompleteness).toBeUndefined();
    expect(byId.get('term:100')).toMatchObject({ recipeExists: true, blockers: ['Änderungsbefehl 1 mehrdeutig'] });
    expect(byId.get('term:13')).toMatchObject({ recipeExists: false, blockers: ['Rückwärtsschritt 3 nicht eindeutig'] });
    expect(byId.has('term:14')).toBe(false);
    expect(byId.has('term:60')).toBe(false);
  });

  it('liefert für einen Bestand ohne Rekonstruktionsfälle eine leere Queue', () => {
    const queue = buildReconstructionQueue(manifestOf([manifestEntry('lrmb', 'term:1')]), emptyReviewQueue(), new Set(['term:1']));
    expect(queue.items).toEqual([]);
    expect(queue.summary).toEqual({ total: 0, queued: 0, recipeDraft: 0, imported: 0, blockedUncertain: 0, byGroup: { 'recipe-ready': 0, 'likely-reconstructable': 0, 'source-incomplete': 0, uncertain: 0, blocked: 0, imported: 0 } });
  });
});

describe('RECHT.NRW Coverage: Institutionen-Zuordnung', () => {
  it('liest die zentrale Zuordnungsdatei: Verfassungsorgane sicher übergeleitet, Gerichte nicht pauschal umbenannt', async () => {
    const compiled = await readInstitutionRegistry(repoRoot);
    const { registry } = compiled;
    expect(registry.schemaVersion).toBe(INSTITUTION_REGISTRY_SCHEMA);
    expect(registry.entries.every((entry) => (INSTITUTION_STATUSES as readonly string[]).includes(entry.status))).toBe(true);
    expect(registry.entries.filter((entry) => entry.status === 'safe-transform').every((entry) => entry.target?.includes('Westdeutschland'))).toBe(true);

    // Landtag: Kategorie legislature, Eintrag und Standard sind safe-transform.
    expect(registry.defaults.legislature).toBe('safe-transform');
    const landtag = compiled.resolve('Landtag  des Landes\nNordrhein-Westfalen', 'legislature');
    expect(landtag).toMatchObject({ status: 'safe-transform', source: 'entry', entry: { id: 'landtag', target: 'Landtag Westdeutschland' } });
    expect(compiled.resolve('Landtag', 'legislature')).toEqual({ status: 'safe-transform', source: 'default' });
    expect(compiled.resolve('Ministerpräsidentin des Landes Nordrhein-Westfalen', 'institution')).toMatchObject({ status: 'safe-transform', entry: { id: 'ministerpraesident', target: 'Ministerpräsident des Landes Westdeutschland' } });
    expect(compiled.resolve('Landesregierung Nordrhein-Westfalen', 'institution')).toMatchObject({ status: 'safe-transform', entry: { id: 'landesregierung' } });

    // Gerichte: kein Ziel, Status review.
    for (const court of ['Oberverwaltungsgericht für das Land Nordrhein-Westfalen', 'Landessozialgericht Nordrhein-Westfalen', 'Oberlandesgericht Hamm']) {
      const resolved = compiled.resolve(court, 'institution');
      expect(resolved, court).toMatchObject({ status: 'review', source: 'entry', entry: { id: 'gerichte-land' } });
      expect(resolved.entry?.target, court).toBeUndefined();
    }
    const courtEntries = registry.entries.filter((entry) => /gericht/iu.test(`${entry.id} ${entry.group}`));
    expect(courtEntries.length).toBeGreaterThan(0);
    expect(courtEntries.every((entry) => entry.status !== 'map' && entry.status !== 'safe-transform' && entry.target === undefined)).toBe(true);
    expect(compiled.resolve('Verwaltungsgericht Köln', 'institution')).toEqual({ status: 'review', source: 'default' });

    // Ministerien und Behörden: Review, spezifischer Eintrag vor dem Sammeleintrag.
    expect(compiled.resolve('Ministerium des Innern', 'ministry')).toMatchObject({ status: 'review', entry: { id: 'innenministerium' } });
    expect(compiled.resolve('Ministerium für Heimat, Kommunales, Bau und Digitalisierung', 'ministry')).toMatchObject({ status: 'review', entry: { id: 'sonstige-ministerien' } });
    expect(compiled.resolve('Bezirksregierung Düsseldorf', 'authority')).toMatchObject({ status: 'review', entry: { id: 'bezirksregierungen' } });
    expect(compiled.resolve('Irgendetwas', 'other')).toEqual({ status: 'review', source: 'none' });
  });

  it('löst preserve, map und historical-source-only auf; exakte Bezeichnungen vor Mustern, Kategorie filtert', () => {
    const compiled = compileInstitutionRegistry(syntheticInstitutionRegistry);
    expect(compiled.resolve('Bundesministerium des Innern', 'external-name')).toMatchObject({ status: 'preserve', source: 'entry', entry: { id: 'bund' } });
    expect(compiled.resolve('Bundesamt für Justiz', 'external-name')).toEqual({ status: 'preserve', source: 'default' });
    expect(compiled.resolve('Landesamt für Natur, Umwelt und Verbraucherschutz', 'authority')).toMatchObject({ status: 'map', entry: { id: 'landesaemter', target: 'Landesamt Westdeutschland' } });
    expect(compiled.resolve('Landesamt für Datenverarbeitung und Statistik', 'authority')).toMatchObject({ status: 'historical-source-only', entry: { id: 'lds-alt' } });
    expect(compiled.resolve('Landesamt für Datenverarbeitung und Statistik', 'authority').entry?.target).toBeUndefined();
    expect(compiled.resolve('Landesamt für Natur', 'ministry')).toEqual({ status: 'review', source: 'none' });
    expect(compiled.resolve('Unbekannte Behörde', 'authority')).toEqual({ status: 'review', source: 'default' });
  });

  it('weist ungültige Zuordnungen fail-closed zurück', () => {
    const valid: InstitutionEntry = { id: 'x', group: 'X', category: 'authority', match: ['X-Amt'], status: 'review', reason: 'Begründung.', reviewedAt: '2026-09-15' };
    const registryWith = (entries: InstitutionEntry[], defaults: InstitutionRegistry['defaults'] = {}): InstitutionRegistry => ({ schemaVersion: INSTITUTION_REGISTRY_SCHEMA, defaults, entries });
    expect(() => compileInstitutionRegistry(registryWith([valid]))).not.toThrow();
    const cases: Array<[InstitutionRegistry, RegExp]> = [
      [{ ...registryWith([valid]), schemaVersion: 'recht-nrw-institution-mapping/0' as typeof INSTITUTION_REGISTRY_SCHEMA }, /unbekannte Schemaversion/u],
      [registryWith([valid, { ...valid }]), /fehlende oder doppelte Kennung/u],
      [registryWith([{ ...valid, status: 'rename' as InstitutionStatus }]), /unbekannter Status rename/u],
      [registryWith([{ ...valid, match: [] }]), /match oder pattern erforderlich/u],
      [registryWith([{ ...valid, status: 'map' }]), /Status map braucht target/u],
      [registryWith([{ ...valid, status: 'safe-transform' }]), /Status safe-transform braucht target/u],
      [registryWith([{ ...valid, target: 'Y-Amt' }]), /target nur bei map oder safe-transform/u],
      [registryWith([{ ...valid, status: 'preserve', target: 'Y-Amt' }]), /target nur bei map oder safe-transform/u],
      [registryWith([{ ...valid, status: 'historical-source-only', target: 'Y-Amt' }]), /target nur bei map oder safe-transform/u],
      [registryWith([{ ...valid, reason: '  ' }]), /Begründung fehlt/u],
      [registryWith([{ ...valid, reviewedAt: '15.09.2026' }]), /reviewedAt fehlt/u],
      [registryWith([{ ...valid, match: undefined, pattern: '(' }]), /Invalid regular expression/u],
      [registryWith([valid], { ministry: 'rename' as InstitutionStatus }), /unbekannter Standardstatus rename/u],
    ];
    for (const [registry, message] of cases) expect(() => compileInstitutionRegistry(registry), String(message)).toThrow(message);
  });

  it('verwendet ohne Zuordnungsdatei eine leere Zuordnung (alles Review)', async () => {
    const compiled = await readInstitutionRegistry(emptyRoot);
    expect(compiled.registry).toEqual(emptyInstitutionRegistry());
    expect(compiled.resolve('Landtag Nordrhein-Westfalen', 'legislature')).toEqual({ status: 'review', source: 'none' });
  });
});

describe('RECHT.NRW Coverage: Staatsverträge und Zustimmungsgesetze', () => {
  const TITLE = 'Gesetz zu dem Staatsvertrag über den Rundfunk im vereinten Deutschland';
  const FORMULA = 'Dem in Berlin unterzeichneten Staatsvertrag über den Rundfunk im vereinten Deutschland wird zugestimmt.';

  it('erkennt ein Zustimmungsgesetz nur mit Titel und Zustimmungsformel (detected)', () => {
    const blocks: NormBodyBlock[] = [
      { type: 'article', label: 'Artikel 1', children: [{ type: 'paragraphText', text: FORMULA }] },
      { type: 'annex', label: 'Anlage', title: 'Staatsvertrag über den Rundfunk im vereinten Deutschland', children: [{ type: 'paragraphText', text: 'Präambel' }] },
    ];
    expect(detectConsentLaw({ title: TITLE, blocks, attachments: [] })).toEqual({
      detected: true,
      partial: false,
      treatyTitle: 'Staatsvertrag über den Rundfunk im vereinten Deutschland',
      treatyTextLocation: 'html-annex',
      evidence: [`Titel: „${TITLE}“`, 'Zustimmungsformel: „Dem in Berlin unterzeichneten Staatsvertrag über den Rundfunk im vereinten Deutschland wird zugestimmt“'],
    });
    const inline = detectConsentLaw({
      title: 'Gesetz über die Zustimmung zum Staatsvertrag über die Hochschulzulassung',
      blocks: [{ type: 'article', label: 'Artikel 1', text: 'Dem Staatsvertrag über die Hochschulzulassung wird hiermit zugestimmt' }, { type: 'article', label: 'Staatsvertrag', children: [{ type: 'paragraphText', text: 'Präambel' }, { type: 'paragraphText', text: 'Die Länder schließen folgenden Vertrag' }] }],
      attachments: [],
    });
    expect(inline).toMatchObject({ detected: true, partial: false, treatyTitle: 'Staatsvertrag über die Hochschulzulassung', treatyTextLocation: 'inline' });
  });

  it('führt nur einen Beleg als partial (Titel ohne Formel oder Formel ohne Titel)', () => {
    const titleOnly = detectConsentLaw({
      title: 'Gesetz zum Abkommen über die Zentralstelle der Länder für Sicherheitstechnik (ZSL-Abkommen)',
      blocks: [{ type: 'paragraph', label: '§ 1', text: 'Das Abkommen wird im Gesetzblatt veröffentlicht.' }],
      attachments: [{ label: 'Anlage 1', mediaType: 'application/pdf' }],
    });
    expect(titleOnly).toMatchObject({ detected: false, partial: true, treatyTitle: 'Abkommen über die Zentralstelle der Länder für Sicherheitstechnik', treatyTextLocation: 'pdf-attachment' });
    expect(titleOnly.evidence).toHaveLength(1);

    const formulaOnly = detectConsentLaw({ title: 'Landesmediengesetz', blocks: [{ type: 'article', text: 'Der Vereinbarung der Länder über die Filmförderung wird hiermit zugestimmt' }], attachments: [] });
    expect(formulaOnly).toMatchObject({ detected: false, partial: true, treatyTextLocation: 'unknown' });
    expect(formulaOnly.treatyTitle).toBeUndefined();
    expect(formulaOnly.evidence[0]).toMatch(/^Zustimmungsformel: „Der Vereinbarung/u);
  });

  it('meldet gewöhnliche Gesetze ohne Beleg als none', () => {
    expect(detectConsentLaw({ title: 'Schulgesetz für das Land Nordrhein-Westfalen (Schulgesetz NRW - SchulG)', blocks: [{ type: 'paragraph', label: '§ 1', text: 'Dieses Gesetz regelt das Schulwesen. Der Vertrag mit dem Träger wird geschlossen.' }], attachments: [{ label: 'Formular', mediaType: 'application/pdf' }] })).toEqual({
      detected: false,
      partial: false,
      treatyTextLocation: 'unknown',
      evidence: [],
    });
  });

  it('liest Bekanntmachungen über das Inkrafttreten eines Staatsvertrags als Evidenz', () => {
    expect(parseTreatyInForceNotice('Bekanntmachung über das Inkrafttreten des Staatsvertrages über die Errichtung einer gemeinsamen Einrichtung')).toEqual({ treatyTitle: 'Staatsvertrages über die Errichtung einer gemeinsamen Einrichtung' });
    expect(parseTreatyInForceNotice('Bekanntmachung  des Inkrafttretens\n des Abkommens zwischen den Ländern')).toEqual({ treatyTitle: 'Abkommens zwischen den Ländern' });
    expect(parseTreatyInForceNotice('Bekanntmachung über das Inkrafttreten der Verordnung über Zuständigkeiten')).toBeUndefined();
    expect(parseTreatyInForceNotice('Bekanntmachung der Neufassung des Landesbeamtengesetzes')).toBeUndefined();
    expect(parseTreatyInForceNotice('Gesetz zu dem Staatsvertrag über den Rundfunk')).toBeUndefined();
  });
});
