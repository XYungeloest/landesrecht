/**
 * Normtypen des importierten West-Bestands: Audit gegen den echten Bestand (`content/norms/west/`, Manifest).
 * Zulässig sind nur die Typen, die der RECHT.NRW-Import erzeugt (IMPORTED_NORM_TYPES); jeder unbekannte Typ ist
 * ein Fehler – auch wenn er im allgemeinen Schema (NORM_TYPES) erlaubt wäre.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { NORM_TYPES } from '@landesrecht/legal-core/lib/schema.ts';
import { IMPORTED_NORM_TYPES } from '@landesrecht/importer-recht-nrw/common/coverage.ts';
import { readManifest } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { classifyLrmbDocumentType } from '@landesrecht/importer-recht-nrw/lrmb/classify.ts';

const root = resolveRepositoryRoot();
const LRGV_SOURCE_TYPES = new Set(['gesetz', 'rechtsverordnung']);
const LRMB_SOURCE_TYPES = new Set(['verwaltungsvorschrift', 'allgemeine-verwaltungsvorschrift', 'runderlass', 'richtlinie', 'durchfuehrungserlass', 'sonstige-verwaltungsvorschrift']);

describe('Normtypen des RECHT.NRW-Imports', () => {
  it('die zulässigen Importtypen sind eine echte Teilmenge des Schemas', () => {
    expect(IMPORTED_NORM_TYPES).toEqual(['gesetz', 'verordnung', 'runderlass', 'foerderrichtlinie', 'richtlinie', 'verwaltungsvorschrift', 'allgemeine-verwaltungsvorschrift', 'durchfuehrungserlass', 'zustimmungsgesetz', 'verfassung']);
    for (const type of IMPORTED_NORM_TYPES) expect(NORM_TYPES).toContain(type);
    expect(NORM_TYPES.length).toBeGreaterThan(IMPORTED_NORM_TYPES.length);
    // Typen, die der Import nie erzeugen darf (Satzungen, Einzelakte, Bekanntmachungen).
    for (const forbidden of ['satzung', 'allgemeinverfuegung', 'bekanntmachung', 'berichtigung']) expect(IMPORTED_NORM_TYPES).not.toContain(forbidden);
    // Die LRMB-Klassifikation liefert für die dokumentierten Quelltypen nur zulässige Zieltypen.
    for (const [title, decreeKind] of [['Allgemeine Verwaltungsvorschriften zum Landesreisekostengesetz', 'runderlass'], ['Richtlinien zur Förderung von Sportstätten', 'runderlass'], ['Runderlass über Dienstreisen', 'runderlass'], ['Verwaltungsvorschriften zum Landeshundegesetz', 'runderlass'], ['Durchführungserlass zum Gesetz', 'runderlass'], ['Bekanntgabe', 'runderlass']] as const) {
      const classified = classifyLrmbDocumentType({ title, decreeKind });
      expect(IMPORTED_NORM_TYPES, title).toContain(classified.normType);
      expect(LRMB_SOURCE_TYPES.has(classified.sourceDocumentType), title).toBe(true);
    }
  });

  it('jede Norm unter content/norms/west/ trägt einen zulässigen Importtyp und die Jurisdiktion west', async () => {
    const directory = join(root, 'content', 'norms', 'west');
    const slugs = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name);
    expect(slugs.length).toBeGreaterThan(0);
    const counts: Record<string, number> = {};
    const unknown: string[] = [];
    for (const slug of slugs) {
      const meta = JSON.parse(await readFile(join(directory, slug, 'meta.json'), 'utf8')) as { type: string; jurisdiction: string; slug: string };
      counts[meta.type] = (counts[meta.type] ?? 0) + 1;
      if (!(IMPORTED_NORM_TYPES as readonly string[]).includes(meta.type)) unknown.push(`${slug}: ${meta.type}`);
      expect(meta.jurisdiction, slug).toBe('west');
      expect(meta.slug, slug).toBe(slug);
    }
    expect(unknown).toEqual([]);
    expect(Object.keys(counts).every((type) => (NORM_TYPES as readonly string[]).includes(type))).toBe(true);
  });

  it('jeder Manifesteintrag trägt einen dokumentierten Quelltyp seines Bereichs; übernommene Einträge zeigen auf Normen zulässigen Typs', async () => {
    const manifest = await readManifest(root);
    const problems: string[] = [];
    for (const entry of manifest.entries) {
      const allowed = entry.sourceArea === 'lrgv' ? LRGV_SOURCE_TYPES : LRMB_SOURCE_TYPES;
      if (!allowed.has(entry.sourceDocumentType)) problems.push(`${entry.sourceIdentity}: ${entry.sourceArea}/${entry.sourceDocumentType}`);
      if (entry.targetJurisdiction !== 'west') problems.push(`${entry.sourceIdentity}: Jurisdiktion ${entry.targetJurisdiction}`);
      if ((entry.importStatus === 'imported' || entry.importStatus === 'imported-with-warnings') && entry.targetSlug) {
        const meta = JSON.parse(await readFile(join(root, 'content', 'norms', 'west', entry.targetSlug, 'meta.json'), 'utf8').catch(() => '{"type":"<fehlt>"}')) as { type: string };
        if (!(IMPORTED_NORM_TYPES as readonly string[]).includes(meta.type)) problems.push(`${entry.targetSlug}: ${meta.type}`);
        if (entry.sourceArea === 'lrgv' && !['gesetz', 'verordnung', 'zustimmungsgesetz', 'verfassung'].includes(meta.type)) problems.push(`${entry.targetSlug}: LRGV-Quelle mit Zieltyp ${meta.type}`);
        if (entry.sourceArea === 'lrmb' && ['gesetz', 'verordnung', 'zustimmungsgesetz', 'verfassung'].includes(meta.type)) problems.push(`${entry.targetSlug}: LRMB-Quelle mit Zieltyp ${meta.type}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
