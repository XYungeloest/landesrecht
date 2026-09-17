/**
 * Provenienz des echten West-Bestands: jede übernommene Norm trägt Quellfundstelle, archivierte amtliche
 * Portalfassung (R2 oder versionierter Beispielkorpus) mit Hash, der mit dem Importmanifest übereinstimmt,
 * sowie Quellenlage und Quellgültigkeit der Fassung. Fehlende Provenienz ist ein Testfehler.
 * Prüflogik: scripts/lib/provenance-audit.ts (identisch mit `npm run audit:provenance`).
 */
import { describe, expect, it } from 'vitest';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';

import { loadWestCorpus } from '../../scripts/lib/audit-common.ts';
import { auditProvenance, R2_BUCKET, type ProvenanceAuditResult } from '../../scripts/lib/provenance-audit.ts';

const root = resolveRepositoryRoot();
let cached: Promise<ProvenanceAuditResult> | undefined;
const audit = (): Promise<ProvenanceAuditResult> => (cached ??= loadWestCorpus(root).then((norms) => auditProvenance(norms, root)));

describe('Provenienz des West-Bestands', () => {
  it('umfasst den vollständigen Bestand', async () => {
    const { summary } = await audit();
    expect(summary.norms).toBeGreaterThan(1000);
    expect(summary.r2Norms + summary.versionedNorms.length).toBe(summary.norms);
  });

  it('hat keine Norm ohne Fundstelle, archivierte Portalfassung, Hash oder Manifesteintrag', async () => {
    const { summary, issues } = await audit();
    const errors = issues.filter((issue) => issue.severity === 'error');
    expect(errors.map((issue) => `${issue.slug}: ${issue.code} – ${issue.message}`)).toEqual([]);
    expect(summary.normsWithErrors).toBe(0);
    for (const code of ['source-citation-missing', 'official-snapshot-missing', 'manifest-entry-missing', 'manifest-hash-mismatch', 'sha256-missing', 'retrieved-at-missing', 'source-status-missing', 'source-valid-from-missing']) {
      expect(summary.issueCodes[code] ?? 0).toBe(0);
    }
  });

  it('archiviert Bulk-Quellen ausschließlich in R2 mit geprüftem Hash', async () => {
    const { summary } = await audit();
    expect(summary.byAvailability['r2-archived'] ?? 0).toBeGreaterThan(0);
    expect(Object.keys(summary.byArchiveStatus).sort()).toEqual(expect.arrayContaining(['verified']));
    expect(summary.byArchiveStatus.staged ?? 0).toBe(0);
    expect(summary.verifiedHashes).toBeGreaterThanOrEqual(summary.byAvailability['r2-archived'] ?? 0);
    expect(R2_BUCKET).toBe('landesrecht-quellen');
  });

  it('kennzeichnet die Quellenlage jeder Fassung und hält die rekonstruierte VV LHundG konsistent', async () => {
    const { summary } = await audit();
    const validityTotal = Object.values(summary.bySourceValidity).reduce((sum, count) => sum + count, 0);
    expect(validityTotal).toBe(summary.norms);
    expect(summary.bySourceText.reconstructed).toBe(1);
    expect(summary.bySourceValidity.reconstructed).toBe(1);
    expect(summary.versionedNorms).toContain('vv-lhundg-west');
  });
});
