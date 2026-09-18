/**
 * Scope-Entscheidung für BAYERN.RECHT (`docs/LEGAL_SCOPE.md`, Nutzerentscheidung 2026-09-18).
 *
 * Geprüft wird nicht, ob die Entscheidung richtig ist – das ist eine redaktionelle Frage –, sondern
 * dass sie vollzogen wird wie beschlossen: jedes enumerierte Dokument genau einmal, mit dem
 * maschinenlesbaren Grund, der später wörtlich in Manifest und Coverage erscheint.
 */
import { describe, expect, it } from 'vitest';

import {
  classifyScope,
  GAP_GROUP_REASONS,
  OUT_OF_SCOPE_DOCUMENT_TYPES,
  SCOPE_REASONS,
  SCOPE_REASON_LABELS,
  type ScopeEntry,
} from '@landesrecht/importer-bayernrecht/scope/decisions.ts';
import { scopeProblems, type ScopeFile } from '@landesrecht/importer-bayernrecht/scope/run.ts';
import type { EnumerationItem } from '@landesrecht/importer-bayernrecht/enumerate/enumeration.ts';

function item(overrides: Partial<EnumerationItem> = {}): EnumerationItem {
  return {
    key: 'BayTestG',
    sourceIdentity: 'BayTestG',
    documentId: 'BayTestG',
    title: 'Bayerisches Testgesetz',
    titleSource: 'fortfuehrungsnachweis',
    normType: 'ges',
    normTypeSource: 'facet-hitlist',
    sourceUrl: 'https://www.gesetze-bayern.de/Content/Document/BayTestG',
    zipUrl: 'https://www.gesetze-bayern.de/Content/Zip/BayTestG',
    listingUrl: 'https://www.gesetze-bayern.de/Content/Document/ffn',
    sourceSha256: 'a'.repeat(64),
    retrievedAt: '2026-09-17T07:48:50.997Z',
    listings: [],
    status: 'pending',
    signals: { fortfuehrungsnachweis: true, facet: true, manifest: false },
    ...overrides,
  } as EnumerationItem;
}

const classify = (overrides: Parameters<typeof classifyScope>[0]) => classifyScope(overrides);

describe('Scope: die drei entschiedenen Klassen', () => {
  it('schließt einen Tarifvertrag aus, den das XML selbst als solchen ausweist', () => {
    const entry = classify({ item: item({ normType: 'vertr' }), sourceArea: 'landesrecht', documentType: 'tarifvertrag' });
    expect(entry.decision).toBe('exclude');
    expect(entry.reason).toBe('collective-agreement-out-of-landesrecht-scope');
    expect(entry.evidence).toEqual(['xml:@doktyp=tarifvertrag']);
  });

  it('schließt einen Tarifvertrag auch allein aufgrund der Gruppenzuordnung aus', () => {
    // Solange das Paket nicht geladen ist, gibt es kein @doktyp – die Abdeckungslücke trägt die Last.
    const entry = classify({ item: item({ normType: 'vertr' }), sourceArea: 'landesrecht', gapGroup: 'tarifvertrag' });
    expect(entry.decision).toBe('exclude');
    expect(entry.reason).toBe('collective-agreement-out-of-landesrecht-scope');
    expect(entry.evidence).toEqual(['gap-group:tarifvertrag']);
  });

  it('lässt das Dokument selbst der Gruppenzuordnung vorgehen', () => {
    // @doktyp ist eine Eigenschaft der Quelle, die Gruppe eine Herleitung aus dem Fehlen im Register.
    const entry = classify({
      item: item(),
      sourceArea: 'vwv',
      gapGroup: 'bundeseinheitliche-anordnung',
      documentType: 'tarifvertrag',
    });
    expect(entry.reason).toBe('collective-agreement-out-of-landesrecht-scope');
    expect(entry.evidence).toEqual(['xml:@doktyp=tarifvertrag']);
  });

  it('schließt eine bundeseinheitliche Anordnung ohne Übernahmebeleg aus', () => {
    const entry = classify({ item: item({ normType: 'vv' }), sourceArea: 'vwv', gapGroup: 'bundeseinheitliche-anordnung' });
    expect(entry.decision).toBe('exclude');
    expect(entry.reason).toBe('federal-uniform-order-not-independent-state-law');
  });

  it('macht aus einer behaupteten Übernahme keine Aufnahme, sondern eine Einzelprüfung', () => {
    // Die Ausnahme nach docs/LEGAL_SCOPE.md verlangt einen bayerischen Rechtsakt. Ein Beleg macht
    // den Fall entscheidungsreif – entschieden wird er redaktionell, nicht hier.
    const entry = classify({
      item: item({ normType: 'vv' }),
      sourceArea: 'vwv',
      gapGroup: 'bundeseinheitliche-anordnung',
      exceptionEvidence: ['BayMBl. 2019 Nr. 218: eigene Inkraftsetzung'],
    });
    expect(entry.decision).toBe('review');
    expect(entry.reason).toBe('normativity-review-required');
    expect(entry.exceptionEvidence).toEqual(['BayMBl. 2019 Nr. 218: eigene Inkraftsetzung']);
  });

  it('führt ein ungeklärtes Dokument als Prüffall, nicht als Ausschluss', () => {
    const entry = classify({ item: item({ normType: 'vv' }), sourceArea: 'vwv', gapGroup: 'ungeklaert' });
    expect(entry.decision).toBe('review');
    expect(entry.reason).toBe('document-class-unexplained');
  });

  it('nimmt alles Übrige als Landesrecht auf', () => {
    const entry = classify({ item: item(), sourceArea: 'landesrecht' });
    expect(entry.decision).toBe('include');
    expect(entry.reason).toBe('state-law-in-scope');
  });

  it('kennt zu jedem Grund einen Klartext', () => {
    for (const reason of SCOPE_REASONS) expect(SCOPE_REASON_LABELS[reason]).toBeTruthy();
  });

  it('bildet die beiden entschiedenen Gruppen auf die beschlossenen Gründe ab', () => {
    expect(GAP_GROUP_REASONS['tarifvertrag']).toBe('collective-agreement-out-of-landesrecht-scope');
    expect(GAP_GROUP_REASONS['bundeseinheitliche-anordnung']).toBe('federal-uniform-order-not-independent-state-law');
    expect(OUT_OF_SCOPE_DOCUMENT_TYPES['tarifvertrag']).toBe('collective-agreement-out-of-landesrecht-scope');
  });
});

describe('Scope: Quellvollständigkeit', () => {
  const entry = (documentId: string): ScopeEntry => ({
    documentId,
    sourceArea: 'landesrecht',
    normType: 'ges',
    title: documentId,
    decision: 'include',
    reason: 'state-law-in-scope',
    evidence: [],
  });
  const file = (entries: ScopeEntry[]): ScopeFile =>
    ({ schemaVersion: 'bayernrecht-scope/1', baselineDate: '2023-12-01', generatedAt: '2026-09-18', totals: { documents: entries.length, byDecision: { include: 0, exclude: 0, review: 0 }, byReason: {}, byArea: {} }, entries }) as ScopeFile;

  it('meldet nichts, wenn jedes enumerierte Dokument genau einen Eintrag hat', () => {
    expect(scopeProblems(file([entry('A'), entry('B')]), ['A', 'B'])).toEqual([]);
  });

  it('meldet ein enumeriertes Dokument ohne Einordnung', () => {
    // Das ist die eigentliche Zusage: Keine Coverage-Lücke bedeutet, dass kein Dokument
    // unentschieden bleibt – nicht, dass alles importiert wird.
    const problems = scopeProblems(file([entry('A')]), ['A', 'B']);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('ohne Scope-Eintrag');
    expect(problems[0]).toContain('B');
  });

  it('meldet einen doppelt entschiedenen Fall', () => {
    const problems = scopeProblems(file([entry('A'), entry('A')]), ['A']);
    expect(problems.some((problem) => problem.includes('mehrfach entschieden'))).toBe(true);
  });

  it('meldet eine Einordnung ohne enumeriertes Dokument', () => {
    const problems = scopeProblems(file([entry('A'), entry('Z')]), ['A']);
    expect(problems.some((problem) => problem.includes('ohne enumeriertes Dokument'))).toBe(true);
  });
});
