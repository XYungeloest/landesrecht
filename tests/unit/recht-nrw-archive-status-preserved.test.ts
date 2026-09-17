import { describe, expect, it } from 'vitest';

import { preservedArchiveStatus } from '@landesrecht/importer-recht-nrw/lrgv/pipeline.ts';

/**
 * Regeneration aus dem Cache legt Rohquellen erneut im Staging ab. Objekte, die laut vorherigem Manifesteintrag
 * unter demselben inhaltsadressierten Schlüssel bereits nach R2 übertragen und geprüft wurden, bleiben „verified“
 * – sonst meldete der Bestand nach jeder Parserkorrektur zehntausend Objekte erneut zum Upload an.
 */
describe('Archivstatus bei Regeneration', () => {
  const previous = { rawDocuments: [{ role: 'version-page' as const, url: 'u', finalUrl: 'u', sha256: 'a'.repeat(64), contentType: 'text/html', retrievedAt: 't', byteLength: 1, objectKey: 'west/recht-nrw/2023-12-01/term-1/aaaaaaaaaaaaaaaa-version-page.html', archiveStatus: 'verified' as const }] };

  it('behält „verified“ für denselben Schlüssel und lässt neue oder geänderte Objekte „staged“', () => {
    expect(preservedArchiveStatus('staged', previous.rawDocuments[0]!.objectKey, previous)).toBe('verified');
    expect(preservedArchiveStatus('staged', 'west/recht-nrw/2023-12-01/term-1/bbbbbbbbbbbbbbbb-version-page.html', previous)).toBe('staged');
    expect(preservedArchiveStatus('staged', previous.rawDocuments[0]!.objectKey, undefined)).toBe('staged');
    expect(preservedArchiveStatus('staged', undefined, previous)).toBe('staged');
  });

  it('überschreibt nie einen bereits stärkeren oder anderen Status', () => {
    expect(preservedArchiveStatus('verified', previous.rawDocuments[0]!.objectKey, previous)).toBe('verified');
    expect(preservedArchiveStatus('versioned', previous.rawDocuments[0]!.objectKey, previous)).toBe('versioned');
    const stagedBefore = { rawDocuments: [{ ...previous.rawDocuments[0]!, archiveStatus: 'staged' as const }] };
    expect(preservedArchiveStatus('staged', previous.rawDocuments[0]!.objectKey, stagedBefore)).toBe('staged');
  });
});
