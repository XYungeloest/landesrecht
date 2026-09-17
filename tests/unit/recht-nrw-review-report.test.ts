/**
 * Review-Auswertung des RECHT.NRW-Imports ohne Netz: Statistik der Review-Queue (Befunde ≠ Stammnormen,
 * Blocker vs. nichtblockierend, Kombinationen, gruppierte Sichten), reproduzierbarer Prioritätsscore,
 * Arbeitslisten und Zusammenfassung, PDF-Fälle mit Transkriptionspriorität, historische Lücken (Belegklassen,
 * Nachfolgebelege) und die Gruppierung der Rekonstruktionsqueue.
 */
import { deflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import type { SourceArea, ImportManifest, ManifestEntry, ManifestRawDocument } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { analyzeReviewQueue, generalizeKey } from '@landesrecht/importer-recht-nrw/common/review-analysis.ts';
import { bandOf, buildReferenceCounts, reviewPriority } from '@landesrecht/importer-recht-nrw/common/review-priority.ts';
import { emptyReviewQueue, reviewItemId, type ReviewCategory, type ReviewItem, type ReviewItemStatus } from '@landesrecht/importer-recht-nrw/common/review-queue.ts';
import { buildReviewReport, computePriorities, renderReviewSummary, renderWorkListMarkdown } from '@landesrecht/importer-recht-nrw/common/review-report.ts';
import { plainTextOf, type OfflineSourceReader } from '@landesrecht/importer-recht-nrw/common/review-sources.ts';
import { classifyEvidence, gapReasonOf, smblNumberOf } from '@landesrecht/importer-recht-nrw/lrmb/historical-gap.ts';
import { estimatePdfTextChars, transcriptionPriority, type PdfCase } from '@landesrecht/importer-recht-nrw/lrmb/pdf-cases.ts';
import { groupReconstructionQueue, uncertaintyPattern, type ReconstructionQueueItem } from '@landesrecht/importer-recht-nrw/lrmb/reconstruction-queue.ts';
import { PARSER_VERSION } from '@landesrecht/importer-recht-nrw/common/constants.ts';
import { LRMB_PARSER_VERSION } from '@landesrecht/importer-recht-nrw/lrmb/parser.ts';
import { TRANSFORMER_VERSION } from '@landesrecht/importer-recht-nrw/transform/rules.ts';

const NOW = '2026-09-16T12:00:00.000Z';
const BASELINE = '2023-12-01';
const VV = 'https://recht.nrw.de/lrmb/verwaltungsvorschrift';

function manifestEntry(sourceArea: SourceArea, sourceIdentity: string, overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  const type = sourceArea === 'lrgv' ? 'gesetz' : 'verwaltungsvorschrift';
  const url = `${sourceArea === 'lrgv' ? 'https://recht.nrw.de/lrgv' : 'https://recht.nrw.de/lrmb'}/${type}/01012020-vorschrift-${sourceIdentity.replace(/\D/gu, '')}`;
  return {
    sourceSystem: 'recht-nrw', sourceArea, sourceDocumentType: sourceArea === 'lrgv' ? 'gesetz' : 'runderlass', sourceIdentity, sourceTitle: `Vorschrift ${sourceIdentity}`, sourceType: type, sourceUrl: url, stemUrl: `https://recht.nrw.de/taxonomy/term/${sourceIdentity.replace(/\D/gu, '')}`,
    sourceVersion: { url, validFrom: '2020-01-01', validTo: null }, selectedVersionUrl: url, sourceValidFrom: '2020-01-01', sourceValidTo: null, baselineStatus: 'active-at-baseline', validityEvidence: [], retrievedAt: NOW,
    sha256: 'a'.repeat(64), contentType: 'text/html', contentFormat: 'native', parserVersion: sourceArea === 'lrgv' ? PARSER_VERSION : LRMB_PARSER_VERSION, transformerVersion: TRANSFORMER_VERSION, targetJurisdiction: 'west', targetSlug: '', baselineDate: BASELINE,
    importStatus: 'imported', reviewStatus: 'none', reconstructionStatus: 'direct', reconstructionSources: [], reconstructionSteps: [], importedAt: NOW, rawDocuments: [], versionsConsidered: [], overrides: [], findings: [],
    integrity: { fetchParse: true, sourceCanonical: true }, transformation: { changes: 0, unresolved: 0 },
    ...overrides,
  };
}

function reviewItem(sourceIdentity: string, category: ReviewCategory, key: string, options: { status?: ReviewItemStatus; severity?: 'blocking' | 'non-blocking'; details?: string[]; summary?: string; sourceArea?: SourceArea; targetSlug?: string } = {}): ReviewItem {
  const item: ReviewItem = {
    id: reviewItemId(sourceIdentity, category, key), sourceArea: options.sourceArea ?? 'lrmb', sourceIdentity, sourceUrl: `${VV}/x-${sourceIdentity.replace(/\D/gu, '')}`, category, key, severity: options.severity ?? 'blocking',
    summary: options.summary ?? `${category}: ${key}`, details: options.details ?? [], firstSeenAt: NOW, updatedAt: NOW, occurrence: 'current', status: options.status ?? 'open',
  };
  if (options.targetSlug) item.targetSlug = options.targetSlug;
  return item;
}

const manifestOf = (entries: ManifestEntry[]): ImportManifest => ({ schemaVersion: 'recht-nrw-import-manifest/2', sourceSystem: 'recht-nrw', baselineDate: BASELINE, entries });

/** Bestand: undatierte Lücke (2 Befunde), Normativität, PDF-Kopferlass, übernommene Norm mit Institutionen, LRGV-Gesetz mit Parserfehler. */
function fixture(): { manifest: ImportManifest; items: ReviewItem[] } {
  const gap = manifestEntry('lrmb', 'term:10', { sourceUrl: `${VV}/x-10`, sourceTitle: 'Verwaltungsvorschriften zum Landesorganisationsgesetz RdErl. d. Landesregierung v. 12 2. 1963 — 1/16.30 ¹)', sourceDocumentType: 'verwaltungsvorschrift', importStatus: 'needs-review', reviewStatus: 'open', baselineStatus: 'undetermined', validityProvenance: 'undetermined', sourceVersion: { url: `${VV}/x-10`, validTo: null }, sourceValidFrom: '', reconstructionStatus: 'not-applicable', findings: [{ severity: 'error', code: 'validity-undetermined', message: 'Undatierter Datensatz ohne Beleg der Geltung am Stichtag: kein belegter Beginn vor dem Stichtag' }], transformation: { changes: 0, unresolved: 0, reportPath: 'data/audits/recht-nrw/lrmb/term-10.json' } });
  const normativity = manifestEntry('lrmb', 'term:11', { sourceUrl: `${VV}/x-11`, sourceTitle: 'Hinweise zur Berücksichtigung des ÖPNV', sourceDocumentType: 'sonstige-verwaltungsvorschrift', sourceType: 'bekanntmachung', importStatus: 'needs-review', reviewStatus: 'open', baselineStatus: 'undetermined', normativity: { decision: 'review', reasons: ['Hinweise'] }, reconstructionStatus: 'not-applicable' });
  const pdf = manifestEntry('lrmb', 'term:12', { sourceTitle: 'Verwaltungsvorschriften zur Landeshaushaltsordnung (VV zur LHO)', sourceDocumentType: 'verwaltungsvorschrift', importStatus: 'needs-review', reviewStatus: 'open', baselineStatus: 'active-at-baseline', normativity: { decision: 'include', reasons: [] }, textCompleteness: 'pdf-only-essential-attachments', validityEvidence: [{ kind: 'portal-version-interval', supports: 'active-at-baseline', strength: 'strong', statement: 'gültig' }], attachments: [{ label: 'Anhang VV zur LHO (PDF)', url: 'https://recht.nrw.de/system/files/BA/1-smbl_631_x.pdf', mediaType: 'application/pdf', essential: true, handling: 'review', pdf: { pages: 169, textLayer: true, scanLike: false, encrypted: false } }, { label: 'Muster 1 (PDF)', url: 'https://recht.nrw.de/system/files/BA/2.pdf', mediaType: 'application/pdf', essential: true, handling: 'review', pdf: { pages: 3, textLayer: false, scanLike: true, encrypted: false } }], rawDocuments: [rawDocument({ role: 'pdf', url: 'https://recht.nrw.de/system/files/BA/1-smbl_631_x.pdf', contentType: 'application/pdf', sha256: 'c'.repeat(64), byteLength: 980941 })] });
  const imported = manifestEntry('lrmb', 'term:13', { sourceUrl: `${VV}/x-13`, sourceTitle: 'Runderlass Kostentragung in der Kampfmittelbeseitigung', importStatus: 'imported-with-warnings', reviewStatus: 'open', targetSlug: 'kampfmittel-west', validityEvidence: [{ kind: 'portal-version-interval', supports: 'active-at-baseline', strength: 'strong', statement: 'gültig' }] });
  const law = manifestEntry('lrgv', 'term:20', { sourceTitle: 'Polizeigesetz des Landes Nordrhein-Westfalen (PolG NRW)', importStatus: 'needs-review', reviewStatus: 'open', validityEvidence: [{ kind: 'portal-version-interval', supports: 'active-at-baseline', strength: 'strong', statement: 'gültig' }] });
  const citing = manifestEntry('lrgv', 'term:21', { sourceTitle: 'Verordnung zur Durchführung des PolG NRW', sourceDocumentType: 'rechtsverordnung', sourceType: 'rechtsverordnung' });
  const items = [
    reviewItem('term:10', 'historical-gap', 'validity-undetermined', { summary: 'Undatierter Datensatz ohne Beleg der Geltung am Stichtag: kein belegter Beginn vor dem Stichtag' }),
    reviewItem('term:10', 'unknown-structure', 'structure-numbering:Auffälligkeiten der Nummernfolge: Nummernfolge 2 → 4', { severity: 'non-blocking' }),
    reviewItem('term:11', 'normativity', 'normativity-review', { summary: 'Normativität manuell prüfen: Hinweise' }),
    reviewItem('term:12', 'attachment', 'attachment-pdf-only-essential:Wesentlicher Regelungsgehalt steht nur in 2 PDF-Anlage(n)', { summary: 'Wesentlicher Regelungsgehalt steht nur in 2 PDF-Anlage(n)' }),
    reviewItem('term:13', 'institution-mapping', 'detections:authority', { severity: 'non-blocking', targetSlug: 'kampfmittel-west', summary: '3 Bezeichnung(en) der Kategorie authority ohne automatische Entsprechung', details: ['Bezirksregierung ×2 (body[1], body[2])', 'Bezirksregierung Arnsberg ×1 (body[3])'] }),
    reviewItem('term:13', 'institution-mapping', 'enacting-body', { severity: 'non-blocking', targetSlug: 'kampfmittel-west', summary: 'Erlassorgan ohne Zuordnung' }),
    reviewItem('term:20', 'unknown-structure', 'unparsed-unit-heading:Einheitennummer nicht erkannt: „Artikel 3“', { sourceArea: 'lrgv', summary: 'Einheitennummer nicht erkannt' }),
    reviewItem('term:20', 'text-integrity', 'integrity-parse-textLength', { sourceArea: 'lrgv', status: 'superseded' }),
    reviewItem('url:https://recht.nrw.de/lrmb/verwaltungsvorschrift/ohne-term', 'other', 'missing-stem-id', { summary: 'Keine Stammnorm-Kennung' }),
  ];
  return { manifest: manifestOf([gap, normativity, pdf, imported, law, citing]), items };
}

function rawDocument(overrides: Partial<ManifestRawDocument> = {}): ManifestRawDocument {
  return { role: 'version-page', url: `${VV}/x`, finalUrl: `${VV}/x`, sha256: 'b'.repeat(64), contentType: 'text/html', retrievedAt: NOW, byteLength: 100, ...overrides };
}

describe('Review-Statistik: Befunde, Stammnormen, Kombinationen, Gruppen', () => {
  const { manifest, items } = fixture();
  const analysis = analyzeReviewQueue({ ...emptyReviewQueue(), items }, manifest, NOW);

  it('trennt Befunde von Stammnormen und Blocker von nichtblockierenden Befunden', () => {
    expect(analysis.totals).toEqual({ items: 9, open: 8, openBlocking: 5, openNonBlocking: 3, decided: 0, superseded: 1, identities: 6, identitiesWithBlocking: 5, identitiesNonBlockingOnly: 1, identitiesWithoutManifestEntry: 1 });
    expect(analysis.byStatus).toEqual({ open: 8, superseded: 1 });
    expect(analysis.byArea).toEqual({ lrgv: { open: 1, blocking: 1, identities: 1, identitiesWithBlocking: 1 }, lrmb: { open: 7, blocking: 4, identities: 5, identitiesWithBlocking: 4 } });
    expect(analysis.findingsPerIdentity).toEqual([{ findings: 1, identities: 4 }, { findings: 2, identities: 2 }]);
  });

  it('zählt Kategorien je Bereich mit alleinigen Blockern und generalisierten Schlüsseln', () => {
    const gap = analysis.byCategory.find((category) => category.category === 'historical-gap')!;
    expect(gap).toMatchObject({ sourceArea: 'lrmb', open: 1, blocking: 1, nonBlocking: 0, identities: 1, soleBlockerIdentities: 1 });
    const structure = analysis.byCategory.find((category) => category.category === 'unknown-structure' && category.sourceArea === 'lrmb')!;
    expect(structure.keys[0]).toMatchObject({ pattern: 'structure-numbering:Auffälligkeiten der Nummernfolge: Nummernfolge # → #', open: 1, blocking: 0, identities: 1 });
    expect(generalizeKey('unparsed-unit-heading:Einheitennummer nicht erkannt: „Artikel 3“ vom 2023-12-01 https://x/y 12,5')).toBe('unparsed-unit-heading:Einheitennummer nicht erkannt: „…“ vom <datum> <url> #');
  });

  it('bildet Kombinationen je Stammnorm und gruppiert Institutionen-Bezeichnungen nur in der Darstellung', () => {
    expect(analysis.combinations.find((combination) => combination.categories.length === 2)).toEqual({ categories: ['historical-gap', 'unknown-structure'], identities: 1, withBlocking: 1, examples: ['term:10'] });
    expect(analysis.combinations.map((combination) => combination.categories.join('+'))).toEqual(['attachment', 'historical-gap+unknown-structure', 'institution-mapping', 'normativity', 'other', 'unknown-structure']);
    expect(analysis.groups.institutionTerms).toEqual([
      { term: 'Bezirksregierung', detectionCategory: 'authority', identities: 1, occurrences: 2, examples: ['term:13'] },
      { term: 'Bezirksregierung Arnsberg', detectionCategory: 'authority', identities: 1, occurrences: 1, examples: ['term:13'] },
    ]);
    expect(analysis.groups.parserFindings.map((group) => group.pattern)).toEqual(['lrgv unparsed-unit-heading:Einheitennummer nicht erkannt: „…“', 'lrmb structure-numbering:Auffälligkeiten der Nummernfolge: Nummernfolge # → #']);
    const imported = analysis.identities.find((summary) => summary.sourceIdentity === 'term:13')!;
    expect(imported).toMatchObject({ open: 2, blocking: 0, targetSlug: 'kampfmittel-west', blockingCategories: [], nonBlockingCategories: ['institution-mapping'], importStatus: 'imported-with-warnings' });
    const unresolved = analysis.identities.find((summary) => summary.sourceIdentity.startsWith('url:'))!;
    expect(unresolved).toMatchObject({ open: 1, blocking: 1 });
    expect(unresolved.title).toBeUndefined();
  });
});

describe('Prioritätsscore reviewPriority (deterministisch, dokumentiert)', () => {
  const { manifest, items } = fixture();
  const entries = new Map(manifest.entries.map((entry) => [entry.sourceIdentity, entry]));
  const itemsOf = (identity: string): ReviewItem[] => items.filter((item) => item.sourceIdentity === identity);

  it('summiert benannte Faktoren und bildet Bänder', () => {
    const law = reviewPriority(entries.get('term:20'), itemsOf('term:20'), { baselineDate: BASELINE, referenceCount: 1 });
    expect(law).toEqual({ score: 30 + 25 + 5 + 3 + 15 + 8 + 5, band: 'A', factors: ['Quelltyp gesetz (+30)', 'am Stichtag geltend (+25)', 'breiter Anwenderkreis laut Titel (+5)', 'Referenzhäufigkeit 1 Titelnennung(en) (+3)', '1 blockierende(r) Befund(e), Norm fehlt im Bestand (+15)', 'starke Belege vorhanden (+8)', 'blockierender Parserbefund (systematisch behebbar) (+5)'] });
    const gap = reviewPriority(entries.get('term:10'), itemsOf('term:10'), { baselineDate: BASELINE, indexSignals: { nodeId: '1', dateOfIssue: '1963-02-12', historically: true } });
    expect(gap).toEqual({ score: 22 + 10 + 10 + 15 - 5 - 1 - 5, band: 'B', factors: ['Quelltyp verwaltungsvorschrift (+22)', 'Geltung am Stichtag unbestimmt (+10)', 'Vorschrift zu einem Gesetz oder einer Verordnung (+10)', '1 blockierende(r) Befund(e), Norm fehlt im Bestand (+15)', 'keine Belege zur Geltung (−5)', '2 offene Befunde (−1)', 'undatierter Altdatensatz, Ausfertigung 1963 (−5)'] });
    const notice = reviewPriority(entries.get('term:11'), itemsOf('term:11'), { baselineDate: BASELINE, indexSignals: { nodeId: '2', outforceDate: '2010-01-01' } });
    expect(notice.factors).toContain('Portaltyp Bekanntmachung (selten normativ) (−10)');
    expect(notice.factors).toContain('Suchindex nennt Außerkrafttreten 2010-01-01 (Hinweis, kein Beleg) (−15)');
    expect(notice.score).toBe(8 - 10 + 10 + 15 - 5 - 15);
    const pdf = reviewPriority(entries.get('term:12'), itemsOf('term:12'), { baselineDate: BASELINE });
    expect(pdf.factors).toContain('Regelungsgehalt nur als PDF (172 Seiten) (−18)');
    const imported = reviewPriority(entries.get('term:13'), itemsOf('term:13'), { baselineDate: BASELINE });
    expect(imported.factors).not.toContain(expect.stringMatching(/blockierende/u));
    expect(imported.score).toBe(15 + 25 + 8 - 1);
    expect(reviewPriority(undefined, itemsOf('url:https://recht.nrw.de/lrmb/verwaltungsvorschrift/ohne-term'), { baselineDate: BASELINE })).toEqual({ score: 20, band: 'C', factors: ['ohne Manifesteintrag (Quelle ohne Stammnorm-Kennung) (+5)', '1 blockierende(r) Befund(e), Norm fehlt im Bestand (+15)'] });
    expect([bandOf(60), bandOf(59), bandOf(40), bandOf(20), bandOf(19)]).toEqual(['A', 'B', 'B', 'C', 'D']);
  });

  it('zählt Referenzen der Abkürzung nur in fremden Titeln und rechnet Prioritäten reproduzierbar', () => {
    const references = buildReferenceCounts(manifest.entries);
    expect(references.get('term:20')).toBe(1);
    expect(references.get('term:12')).toBeUndefined();
    const first = computePriorities({ manifest, queue: { ...emptyReviewQueue(), items }, enumerations: {}, baselineDate: BASELINE });
    const second = computePriorities({ manifest, queue: { ...emptyReviewQueue(), items }, enumerations: {}, baselineDate: BASELINE });
    expect([...first.entries()]).toEqual([...second.entries()]);
    expect(first.get('term:20')!.score).toBe(91);
  });
});

describe('PDF-Fälle und Transkriptionspriorität', () => {
  it('schätzt den Textumfang aus Textoperatoren unkomprimierter und komprimierter Ströme', () => {
    const content = 'BT /F1 12 Tf (Verwaltungsvorschriften) Tj [(zur) -250 (LHO)] TJ <00410042> Tj ET';
    const plain = new TextEncoder().encode(`%PDF-1.4\n1 0 obj << /Type /Font >> endobj\n2 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj\n`);
    expect(estimatePdfTextChars(plain)).toBe('Verwaltungsvorschriften'.length + 'zurLHO'.length + 2);
    const deflated = deflateSync(Buffer.from(content, 'latin1'));
    const header = new TextEncoder().encode(`%PDF-1.4\n2 0 obj << /Length ${deflated.length} /Filter /FlateDecode >> stream\n`);
    const compressed = new Uint8Array([...header, ...deflated, ...new TextEncoder().encode('\nendstream endobj\n')]);
    expect(estimatePdfTextChars(compressed)).toBe('Verwaltungsvorschriften'.length + 'zurLHO'.length + 2);
    expect(estimatePdfTextChars(new TextEncoder().encode('kein pdf'))).toBe(0);
  });

  it('ordnet Kopferlasse mit Textlayer vor Scans und großen Anlagen ein', () => {
    const base: Omit<PdfCase, 'transcriptionPriority'> = { sourceIdentity: 'term:12', sourceArea: 'lrmb', title: 'VV zur LHO', sourceUrl: `${VV}/x`, importStatus: 'needs-review', baselineStatus: 'active-at-baseline', normativity: 'include', textCompleteness: 'pdf-only-essential-attachments', mainText: 'html-with-essential-pdf', pdfDocuments: 2, htmlAttachments: 0, pagesKnown: 172, textLayerDocuments: 2, scanDocuments: 0, unknownDocuments: 0, estimatedTextChars: 400_000, documents: [], reviewPriority: { score: 40, band: 'B', factors: [] } };
    expect(transcriptionPriority(base)).toEqual({ score: 40 + 20 + 10 + 5 - 17, band: 'B', factors: ['Review-Priorität der Stammnorm (+40)', 'Regelungsgehalt nur im PDF (+20)', 'Textlayer in allen geprüften PDF-Dateien (+10)', 'Normativität eindeutig (+5)', 'Aufwand 172 Seiten (−17)'] });
    expect(transcriptionPriority({ ...base, mainText: 'html', scanDocuments: 1, textLayerDocuments: 1, pagesKnown: 4, normativity: 'review' })).toEqual({ score: 40 - 10, band: 'C', factors: ['Review-Priorität der Stammnorm (+40)', '1 Scan-PDF (manuelle Transkription) (−10)'] });
    expect(transcriptionPriority({ ...base, mainText: 'essential-missing', pdfDocuments: 0, textLayerDocuments: 0, pagesKnown: 0 }).factors).toContain('wesentliche Anlage nicht verlinkt (Quelle fehlt) (−20)');
  });
});

describe('Historische Lücken: Gründe, SMBl-Nummer, Belegklassen', () => {
  it('klassifiziert Gründe und liest die SMBl-Nummer aus Anlagenadressen', () => {
    expect(gapReasonOf('Undatierter Datensatz ohne Beleg der Geltung am Stichtag: kein belegter Beginn vor dem Stichtag')).toBe('no-start-evidence');
    expect(gapReasonOf('…: Beginn belegt, aber keine Änderung nach dem Stichtag als Beleg für den Fortbestand')).toBe('no-continuity-amendment');
    expect(gapReasonOf('…: spätere Änderung ohne Kontinuitätsbeleg (same-stem)')).toBe('continuity-failed');
    expect(gapReasonOf('etwas anderes')).toBe('other');
    const { manifest } = fixture();
    expect(smblNumberOf(manifest.entries.find((entry) => entry.sourceIdentity === 'term:12')!)).toBe('631');
    expect(smblNumberOf(manifest.entries.find((entry) => entry.sourceIdentity === 'term:10')!, '2005')).toBe('2005');
    expect(smblNumberOf(manifest.entries.find((entry) => entry.sourceIdentity === 'term:10')!)).toBeUndefined();
  });

  it('stuft Belegklassen in fester Reihenfolge ein (Selbstaussage > Nachfolger > Fundstellenverlauf > Klausel > Index)', () => {
    const none = { selfStatements: [], successorEvidence: [], inForceClause: false };
    expect(classifyEvidence(none, BASELINE)).toBe('no-signal');
    expect(classifyEvidence({ ...none, indexSignals: { nodeId: '1', outforceDate: '2001-01-01' } }, BASELINE)).toBe('index-outforce-only');
    expect(classifyEvidence({ ...none, inForceClause: true }, BASELINE)).toBe('in-force-clause-only');
    expect(classifyEvidence({ ...none, changeNote: { amendments: 2, identified: 0, complete: true, latestAfterBaseline: false } }, BASELINE)).toBe('amendment-chain-unidentified');
    expect(classifyEvidence({ ...none, changeNote: { amendments: 2, identified: 1, complete: true, latestAfterBaseline: false } }, BASELINE)).toBe('amendment-chain-identified');
    const weak = { citingUrl: `${VV}/y`, kind: 'repealed' as const, level: 'weak' as const, matched: ['date' as const], text: 'x', effectiveDerivation: 'ohne Zeitangabe', strength: 'insufficient' as const };
    expect(classifyEvidence({ ...none, successorEvidence: [weak] }, BASELINE)).toBe('successor-weak');
    expect(classifyEvidence({ ...none, successorEvidence: [{ ...weak, level: 'strong', matched: ['date', 'smbl-number'] }] }, BASELINE)).toBe('successor-strong');
    expect(classifyEvidence({ ...none, selfStatements: [{ kind: 'expired', text: 'Sie treten mit Ablauf des Haushaltsjahres 2016 außer Kraft.', effective: { kind: 'end-of-year', date: '2016-12-31', text: 'mit Ablauf des Haushaltsjahres 2016' } }] }, BASELINE)).toBe('self-expiry-before-baseline');
    expect(classifyEvidence({ ...none, selfStatements: [{ kind: 'expired', text: 'x', effective: { kind: 'end-of-year', date: '2027-12-31', text: 'y' } }] }, BASELINE)).toBe('no-signal');
  });

  it('extrahiert Normtext netzfrei mit Blockgrenzen als Satzgrenzen', () => {
    const html = '<html><body><div class="info-box">Stammnorm</div><section class="legaldoc-article"><p><strong>3 Inkrafttreten, Aufhebung</strong></p><p>3.2 Der Runderlass vom 25.6.2013 (&nbsp;MBl. NRW. S. 202&nbsp;) wird aufgehoben.</p></section><script>x()</script></body></html>';
    expect(plainTextOf(html)).toBe('3 Inkrafttreten, Aufhebung ; 3.2 Der Runderlass vom 25.6.2013 ( MBl. NRW. S. 202 ) wird aufgehoben. ;');
    expect(plainTextOf('<p>ohne Container</p>')).toBe('');
  });
});

describe('Review-Report: Arbeitslisten, Zusammenfassung, Nachfolgebelege aus Quellen', () => {
  const { manifest, items } = fixture();
  const pages: Record<string, string> = {
    [`${VV}/x-10`]: '<section class="legaldoc-article"><h1>Verwaltungsvorschriften zum Landesorganisationsgesetz</h1><div class="tex2jax_process"><p>1 Die Behörden gelten.</p><p>Sie treten mit Ablauf des Haushaltsjahres 2016 außer Kraft.</p></div></section>',
    [`${VV}/x-11`]: '<section class="legaldoc-article"><div class="tex2jax_process"><p>Hinweise.</p><p>Der RdErl. d. Landesregierung v. 12.2.1963 (SMBl. NRW. 2005) wird aufgehoben.</p></div></section>',
    [`${VV}/x-13`]: '<section class="legaldoc-article"><div class="tex2jax_process"><p>Der Runderlass des Ministeriums vom 12. Februar 1963 wird aufgehoben.</p></div></section>',
  };
  const reader: OfflineSourceReader = {
    stats: { local: 0, cache: 0, missing: 0 },
    async read(url) {
      const html = pages[url];
      if (!html) {
        this.stats.missing += 1;
        return undefined;
      }
      this.stats.cache += 1;
      const bytes = new TextEncoder().encode(html);
      return { url, finalUrl: url, status: 200, contentType: 'text/html; charset=UTF-8', retrievedAt: NOW, sha256: 'd'.repeat(64), bytes, fromCache: true };
    },
  };

  it('erzeugt reproduzierbare Arbeitslisten mit Belegklassen, Nachfolgebelegen und PDF-Angaben', async () => {
    const build = () => buildReviewReport({ root: '/nicht/vorhanden', manifest, queue: { ...emptyReviewQueue(), items }, enumerations: {}, recipes: new Set(), baselineDate: BASELINE, now: NOW, limit: 5, reader });
    const report = await build();
    const again = await build();
    expect(JSON.stringify(report)).toBe(JSON.stringify(again));
    const gaps = report.workLists.find((list) => list.name === 'historische-luecken')!;
    expect(gaps.total).toBe(1);
    expect(gaps.items[0]).toMatchObject({ sourceIdentity: 'term:10', rank: 1, blockingCategories: ['historical-gap'], nonBlockingCategories: ['unknown-structure'], detail: { grund: 'no-start-evidence', belegklasse: 'self-expiry-before-baseline', ausfertigung: '1963-02-12', nachfolgebelege: 2, selbstaussage: 'Sie treten mit Ablauf des Haushaltsjahres 2016 außer Kraft.' } });
    const gapCase = report.historicalGaps.cases[0]!;
    expect(gapCase.issuedOnSource).toBe('title');
    expect(gapCase.successorEvidence.map((evidence) => [evidence.citingIdentity, evidence.level, evidence.matched])).toEqual([['term:11', 'weak', ['date']], ['term:13', 'weak', ['date']]]);
    expect(report.historicalGaps.summary).toMatchObject({ cases: 1, byEvidenceClass: { 'self-expiry-before-baseline': 1 }, withSuccessorWeak: 1, withSelfExpiryBeforeBaseline: 1 });
    expect(report.historicalGaps.scanned).toMatchObject({ lrmbPages: 3, gazetteEntries: 0, statementsOther: 2, statementsSelf: 1 });
    const pdf = report.workLists.find((list) => list.name === 'pdf-only')!;
    expect(pdf.items[0]).toMatchObject({ sourceIdentity: 'term:12', detail: { regelungsgehalt: 'html-with-essential-pdf', pdfDateien: 2, seiten: 172, textlayer: '1/2' } });
    expect(report.pdfCases.cases[0]!.documents.map((document) => [document.label, document.available, document.pages])).toEqual([['Anhang VV zur LHO (PDF)', 'not-available', 169], ['Muster 1 (PDF)', 'not-available', 3]]);
    expect(report.workLists.find((list) => list.name === 'normativitaet')!.items[0]).toMatchObject({ sourceIdentity: 'term:11', detail: { portaltyp: 'bekanntmachung', gruende: 'Hinweise' } });
    expect(report.workLists.find((list) => list.name === 'parser-normen')!.items.map((item) => item.sourceIdentity)).toEqual(['term:20', 'term:10']);
    expect(report.groupedLists.find((list) => list.name === 'institutionen-bezeichnungen')!.groups[0]).toMatchObject({ label: 'Bezirksregierung [authority]', identities: 1, occurrences: 2 });
    expect(report.bandDistribution.A + report.bandDistribution.B + report.bandDistribution.C + report.bandDistribution.D).toBe(6);
    expect(report.priorities[0]!.sourceIdentity).toBe('term:20');
  });

  it('rendert Markdown mit Kennzahlen, Kategorien, Prioritätsmodell und nächsten Schritten', async () => {
    const report = await buildReviewReport({ root: '/nicht/vorhanden', manifest, queue: { ...emptyReviewQueue(), items }, enumerations: {}, recipes: new Set(), baselineDate: BASELINE, now: NOW, limit: 5 });
    const summary = renderReviewSummary(report);
    expect(summary).toContain('Review-Fälle gesamt: 9 (offen 8, blockierend 5');
    expect(summary).toContain('Betroffene Stammnormen mit offenen Befunden: 6 – davon mit Blocker (nicht übernommen) 5');
    expect(summary).toContain('| lrmb | historical-gap | 1 | 1 | 1 | 1 |');
    expect(summary).toContain('## Prioritätsmodell');
    expect(summary).toContain('Nächste fachliche Schritte');
    expect(summary).toContain('keine Absenkung von Belegstandards');
    const list = renderWorkListMarkdown(report.workLists.find((candidate) => candidate.name === 'historische-luecken')!);
    expect(list).toContain('| 1 | term:10 | lrmb |');
    expect(list).toContain('kein Rechtsstatus');
    expect(report.historicalGaps.scanned.lrmbPages).toBe(0);
    expect(report.historicalGaps.cases[0]!.evidenceClass).toBe('no-signal');
  });
});

describe('Rekonstruktionsqueue: Gruppierung', () => {
  const item = (sourceIdentity: string, overrides: Partial<ReconstructionQueueItem>): ReconstructionQueueItem => ({ sourceIdentity, title: sourceIdentity, sourceDocumentType: 'runderlass', category: 'reconstruction-required', status: 'queued', group: 'source-incomplete', groupReasons: [], priority: { score: 0, factors: [] }, amendments: 1, recipePath: '', recipeExists: false, blockers: [], otherBlockingCategories: [], ...overrides });

  it('gruppiert nach Richtung, Änderungen, Quellenlage und Unsicherheitsmuster', () => {
    const groups = groupReconstructionQueue([
      item('term:1', { direction: 'reverse', sourceCompleteness: 1 }),
      item('term:2', { direction: 'forward', amendments: 3, sourceCompleteness: 0.5 }),
      item('term:3', { status: 'blocked-uncertain', category: 'reconstruction-uncertain', amendments: 0, blockers: ['Runderlass vom 16.7.2001 (MBl. NRW. 2001 S. 1226): Inkrafttreten nicht belegbar (Ministerialblatt-Eintrag nicht zugeordnet)'] }),
      item('term:4', { status: 'blocked-uncertain', category: 'reconstruction-uncertain', amendments: 0, blockers: ['Runderlass vom 3. März 2019 (n. v.): Inkrafttreten nicht belegbar (nicht veröffentlicht)'] }),
      item('term:5', { status: 'imported', direction: 'reverse', amendments: 7, sourceCompleteness: 1 }),
    ]);
    expect(groups.byDirection).toEqual({ reverse: 2, forward: 1, mixed: 0, unknown: 2 });
    expect(groups.byAmendments).toEqual({ '0': 2, '1': 1, '2': 0, '3-5': 1, '6+': 1 });
    expect(groups.bySourceCompleteness).toEqual({ complete: 2, partial: 1, unknown: 2 });
    expect(groups.byStatus).toEqual({ queued: 2, 'recipe-draft': 0, imported: 1, 'blocked-uncertain': 2 });
    expect(groups.readyForRecipe).toEqual(['term:1']);
    expect(groups.uncertainReasons).toEqual([{ pattern: 'Runderlass vom <datum> (…)', identities: ['term:3', 'term:4'] }]);
    expect(uncertaintyPattern('Fundstellenverlauf nicht vollständig lesbar: „MBl. NRW. 2013 S. 116 …“')).toBe('Fundstellenverlauf nicht vollständig lesbar');
  });
});
