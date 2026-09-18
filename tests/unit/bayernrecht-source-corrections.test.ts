/**
 * Quellkorrekturen: zweifelsfreie Tippfehler, einzeln entschieden, an Paket-SHA-256 und Wortlaut gebunden.
 * Anlass: BayVwV96990, Kurztitel „Geschäftsordnung des Bayerischne Landesbeirats …“ (Titel: „Bayerischen“).
 */
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { SourceLaw } from '@landesrecht/importer-common/pipeline.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { applySourceCorrections, readSourceCorrections, sourceCorrectionProblems, type SourceCorrection } from '@landesrecht/importer-bayernrecht/common/source-corrections.ts';
import { inventoryDocument } from '@landesrecht/importer-bayernrecht/inventory/document.ts';

import { buildZipArchive, fixture } from '../helpers/bayernrecht-parse.ts';

const SHA = 'de0ab50ce60d5b3c3a787a34156e11f559ce077985aa1669061063ac5fc9438b';
const correction: SourceCorrection = {
  id: 'BayVwV96990-kurztitel-bayerischne', sourceIdentity: 'BayVwV96990', sourceSha256: SHA, field: 'shortTitle', sourceElement: 'bayernrecht_kurztitel',
  original: 'Bayerischne', corrected: 'Bayerischen', occurrences: 1, reason: 'obvious-source-typo', evidence: 'Titel desselben Dokuments', decidedBy: 'Nutzerentscheidung', decidedAt: '2026-09-18',
};
const law = (shortTitle: string): SourceLaw => ({
  portal: 'bayernrecht', externalIdentifiers: [], title: 'Geschäftsordnung des Bayerischen Landesbeirats für Familienfragen', shortTitle,
  type: 'verwaltungsvorschrift', citation: 'x', subjects: [], keywords: [], body: [], sourceReferences: [], findings: [],
});

describe('Quellkorrekturen', () => {
  it('korrigiert genau den belegten Wortlaut und hält Original, Korrektur und Paket fest', () => {
    const result = applySourceCorrections(law('Geschäftsordnung des Bayerischne Landesbeirats für Familienfragen'), [correction], SHA);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.law.shortTitle).toBe('Geschäftsordnung des Bayerischen Landesbeirats für Familienfragen');
    expect(result.applied).toEqual([expect.objectContaining({ original: 'Bayerischne', corrected: 'Bayerischen', sourceIdentity: 'BayVwV96990', sourceSha256: SHA, reason: 'obvious-source-typo' })]);
    expect(result.law.sourceNotes).toContainEqual(expect.objectContaining({ label: 'Quellkorrektur' }));
    // Nur das korrigierte Feld ändert sich.
    expect(result.law.title).toBe(law('').title);
  });

  it('korrigiert nicht still, wenn das Paket ein anderes ist oder der Wortlaut nicht mehr passt', () => {
    expect(applySourceCorrections(law('Geschäftsordnung des Bayerischne Landesbeirats'), [correction], 'f'.repeat(64))).toMatchObject({ ok: false });
    expect(applySourceCorrections(law('Geschäftsordnung des Bayerischen Landesbeirats'), [correction], SHA)).toMatchObject({ ok: false });
    expect(applySourceCorrections(law('Bayerischne und Bayerischne'), [correction], SHA)).toMatchObject({ ok: false });
  });

  it('verlangt Grund, Beleg und ein korrigierbares Feld – Normtext des Körpers ist ausgeschlossen', () => {
    expect(sourceCorrectionProblems({ schemaVersion: 'bayernrecht-source-corrections/1', corrections: [{ ...correction, field: 'body' }] })).toContainEqual(expect.stringMatching(/nicht korrigierbar/u));
    expect(sourceCorrectionProblems({ schemaVersion: 'bayernrecht-source-corrections/1', corrections: [{ ...correction, reason: 'spelling' }] })).toContainEqual(expect.stringMatching(/Grund/u));
  });

  it('die Registerdatei des Bestands ist gültig und enthält nur den entschiedenen Einzelfall', async () => {
    const corrections = await readSourceCorrections(resolveRepositoryRoot());
    expect(corrections.map((entry) => entry.id)).toEqual(['BayVwV96990-kurztitel-bayerischne']);
  });

  it('die Inventur geht denselben Weg wie der Bulk: ohne Korrektur Überleitungsfehler, mit Korrektur übernahmefähig', () => {
    // Echte Verwaltungsvorschrift mit dem Tippfehler im Kurztitel (wie BayVwV96990).
    const bytes = buildZipArchive([
      { path: 'mimetype', content: 'bayportalvv+zip' },
      { path: 'META-INF/manifest.xml', content: '<?xml version="1.0" encoding="iso-8859-1"?>\n<manifest xmlns="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">\n\t<file-entry media-type="application/beck.bayportalvv.text" full-path="/bayportalvv/BayVwV312180.xml" />\n</manifest>' },
      { path: 'bayportalvv/BayVwV312180.xml', content: fixture('redaktionsrichtlinien').replace('<bayernrecht_kurztitel>Redaktionsrichtlinien</bayernrecht_kurztitel>', '<bayernrecht_kurztitel>Richtlinien des Bayerischne Landesbeirats</bayernrecht_kurztitel>') },
    ]);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const input = { documentId: 'BayVwV312180', sourceArea: 'vwv' as const, title: 'Redaktionsrichtlinien', url: 'https://www.gesetze-bayern.de/Content/Zip/BayVwV312180', bytes, sha256, byteLength: bytes.byteLength };
    expect(inventoryDocument(input).outcome).toBe('transform-failed');
    const bound: SourceCorrection = { ...correction, id: 'test', sourceIdentity: 'BayVwV312180', sourceSha256: sha256 };
    expect(inventoryDocument({ ...input, sourceCorrections: [bound] }).outcome).toMatch(/^parsed/u);
    // Eine an ein anderes Paket gebundene Korrektur korrigiert nichts und ist selbst ein Befund.
    const stale = inventoryDocument({ ...input, sourceCorrections: [{ ...bound, sourceSha256: 'f'.repeat(64) }] });
    expect(stale.codes).toContain('source-correction-stale');
  });
});
