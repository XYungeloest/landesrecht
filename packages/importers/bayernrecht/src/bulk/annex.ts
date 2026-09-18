/**
 * Normative Anlagen, die das Portal als eigene Dokumente führt, werden als Anlage ihrer Stammnorm übernommen
 * (Scope `annex-merged-into-related-norm`). Beleg und Anlass: BayBodSchO, „von den zuständigen Verordnungsgebern
 * einheitlich erlassen, in Bayern als Anhang zur EV-BodenseeSchO“.
 *
 * Die Anlage wird vollständig angehängt – als Anlagenblock mit eigenem Sprungziel, durchsuchbar und zitierbar –, und
 * sie muss dieselben Prüfungen bestehen wie jede Norm: eigene Stichtagsentscheidung (unverändert seit dem Stichtag),
 * Paket lesbar, Identität, kein Parserfehler, Textintegrität. Scheitert eine davon, wird die **Stammnorm** gesperrt:
 * Eine Stammnorm ohne ihre Anlage wäre unvollständig, die Anlage allein wäre ein Doppelimport.
 */
import type { SourceReference, NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import type { ManifestRawDocument } from '../common/manifest.ts';
import { assessTextIntegrity } from '../inventory/document.ts';
import { parseBayernRechtPackage } from '../parse/index.ts';
import { readBayernRechtPackage } from '../parse/package.ts';
import { isCachedPackageProblem, readCachedPackage } from './cache.ts';
import type { FigurePackage } from './figures.ts';
import type { MergedAnnex } from './select.ts';

export interface LoadedAnnexes {
  blocks: NormBodyBlock[];
  references: SourceReference[];
  raw: ManifestRawDocument[];
  keywords: string[];
  notes: string[];
  /** Pakete der Anlagen als Herkunft ihrer Abbildungen (`figures.ts`). */
  packages: FigurePackage[];
}

export type AnnexLoadResult = { ok: true; annexes: LoadedAnnexes } | { ok: false; code: string; message: string; details: string[] };

/** Die Anlage trägt nur, wenn ihr heutiger Text belegt der Stichtagstext ist. */
function annexAdmitted(annex: MergedAnnex): string | undefined {
  const decision = annex.baseline;
  if (!decision) return 'keine Stichtagsentscheidung (baseline --write ausführen)';
  if (decision.status !== 'active-at-baseline') return `Stichtagsstatus ${decision.status} (${decision.reason})`;
  if (decision.blockers.length > 0) return `offene Punkte: ${decision.blockers.join('; ')}`;
  if (decision.method !== 'current-unchanged' || decision.class !== 'unchanged-since-baseline') return `Stichtagsstand nur über ${decision.method} zu gewinnen`;
  return undefined;
}

export async function loadMergedAnnexes(annexes: readonly MergedAnnex[], cacheDir: string): Promise<AnnexLoadResult> {
  const loaded: LoadedAnnexes = { blocks: [], references: [], raw: [], keywords: [], notes: [], packages: [] };
  for (const annex of annexes) {
    const refusal = annexAdmitted(annex);
    if (refusal) return { ok: false, code: 'merged-annex-not-at-baseline', message: `Anlage ${annex.documentId} trägt am Stichtag nicht: ${refusal}`, details: [`Anlage ${annex.documentId} (${annex.title})`, 'Die Stammnorm wird ohne ihre Anlage nicht übernommen.'] };
    const cached = await readCachedPackage(cacheDir, annex.zipUrl);
    if (!cached || isCachedPackageProblem(cached)) return { ok: false, code: 'merged-annex-not-cached', message: `Exportpaket der Anlage ${annex.documentId} fehlt oder ist beschädigt`, details: [annex.zipUrl] };
    const document = parseBayernRechtPackage({ portal: 'bayernrecht', url: annex.zipUrl, retrievedAt: cached.retrievedAt, mediaType: cached.contentType, sha256: cached.sha256 }, cached.bytes, { unknown: 'report' });
    if (document.documentId !== annex.documentId) return { ok: false, code: 'merged-annex-identity', message: `Paket ${annex.zipUrl} trägt ${document.documentId}, erwartet ${annex.documentId}`, details: [] };
    const errors = document.law.findings.filter((finding) => finding.severity === 'error');
    if (errors.length > 0) return { ok: false, code: 'merged-annex-unknown-structure', message: `Anlage ${annex.documentId}: ${errors[0]!.message}`, details: errors.map((finding) => finding.message) };
    const integrity = assessTextIntegrity(document, readBayernRechtPackage(cached.bytes).xml);
    if (integrity.class === 'mismatch') return { ok: false, code: 'merged-annex-text-integrity', message: `Anlage ${annex.documentId}: Textintegrität verletzt (${integrity.missing} fehlen, ${integrity.extra} zusätzlich)`, details: [integrity.lostExcerpt ?? '', integrity.duplicatedExcerpt ?? ''].filter(Boolean) };
    if (document.law.body.length === 0) return { ok: false, code: 'merged-annex-empty', message: `Anlage ${annex.documentId} hat keinen Normtext`, details: [] };

    loaded.blocks.push({ type: 'annex', label: 'Anhang', title: document.law.title, children: document.law.body });
    loaded.references.push(...document.law.sourceReferences.map((reference) => ({ ...reference, label: `Anhang: ${reference.label}`, note: [reference.note, `Als Anhang übernommen: ${annex.documentId} (${document.law.title})`].filter(Boolean).join(' · ') })));
    loaded.raw.push({ role: 'annex', url: annex.zipUrl, finalUrl: annex.zipUrl, sha256: cached.sha256, contentType: cached.contentType, retrievedAt: cached.retrievedAt, byteLength: cached.byteLength });
    loaded.packages.push({ url: annex.zipUrl, sha256: cached.sha256, retrievedAt: cached.retrievedAt, attachments: document.attachments });
    loaded.keywords.push(...[document.law.title, document.law.shortTitle, document.law.abbr].filter((value): value is string => Boolean(value)));
    loaded.notes.push(`${annex.documentId} (${document.law.title}) als Anhang übernommen; Textintegrität ${integrity.class}`);
  }
  return { ok: true, annexes: loaded };
}
