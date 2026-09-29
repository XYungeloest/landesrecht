/**
 * Untergruppen der offenen Anlagenfälle (`incomplete-annex`, Run 16): Warum fehlt ein Teil der Vorschrift, und ist er
 * normativ? Grundlage ist die PDF-Ausgabe im Cache (kein Netz) und die Zuordnung aus dem Review. Nichts wird
 * entschieden oder veröffentlicht; die Gruppen steuern nur die Freeze-Readiness (`reports/freeze-readiness.ts`).
 *
 *   1 `non-normative-missing`   Stammnorm vollständig, nur eine ausdrücklich nichtnormative Anlage fehlt
 *                               („nachrichtlich“, „Erläuterungen“, „Hinweise“, „Beispiel“, „Anschriften“) – nicht sperrend.
 *   2 `normative-separate`      normative Anlage fehlt in der Ausgabe, liegt aber als eigenes juris-Dokument vor.
 *   3 `normative-pdf-only`      normative Anlage (auch Muster, Karte, Formular) nur als nicht zugängliche PDF-Datei.
 *   4 `assignment-unclear`      Anlagendokument ohne eindeutige Stammnorm bzw. Stammnorm mit mehrdeutigen Anlagen.
 *   5 `completely-missing`      die Ausgabe enthält keinen Normtext (nur der Vermerk).
 *
 * Normativ ist eine Anlage im Zweifel immer: Nur die ausdrückliche Kennzeichnung im Anlagentitel macht sie nichtnormativ.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cacheKey } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import { CACHE_DIR } from '../common/constants.ts';
import { pdfExportUrl } from '../export/client.ts';
import { parseJurisPdf, type ParsedJurisPdf } from '../parse/juris-pdf.ts';
import { layoutFromPdf } from '../parse/pdf-layout.ts';

export const ANNEX_GAP_GROUPS = ['non-normative-missing', 'normative-separate', 'normative-pdf-only', 'assignment-unclear', 'completely-missing'] as const;
export type AnnexGapGroup = (typeof ANNEX_GAP_GROUPS)[number];

export const ANNEX_GAP_LABELS: Record<AnnexGapGroup, string> = {
  'non-normative-missing': 'Stammnorm vollständig, nur nichtnormative Anlage fehlt',
  'normative-separate': 'normative Anlage separat vorhanden',
  'normative-pdf-only': 'normative Anlage nur als nicht zugängliche PDF-Datei',
  'assignment-unclear': 'Zuordnung unklar',
  'completely-missing': 'Normtext vollständig fehlend',
};

/** Ausdrückliche Kennzeichnung einer nichtnormativen Anlage im Titel. */
export const NON_NORMATIVE_ANNEX = /\b(?:nachrichtlich|nicht\s*amtlich|nichtamtlich|Erläuterung(?:en)?|Hinweise?|Beispiel(?:e|rechnung)?|Anschriften(?:verzeichnis)?|Adressen)\b/iu;

export interface AnnexGapCase {
  sourceIdentity: string;
  reviewKey: string;
  group: AnnexGapGroup;
  /** Einheit, in der der Vermerk steht (aus dem Befund), und ihr Titel in der Ausgabe. */
  unit?: string;
  unitTitle?: string;
  /** Zeichen des übrigen Normtexts der Ausgabe (ohne Vermerk). */
  bodyCharacters: number;
  reason: string;
}

function text(blocks: readonly NormBodyBlock[] | undefined): string {
  return (blocks ?? []).map((block) => [block.label, block.title, block.text, text(block.children)].filter(Boolean).join(' ')).join(' ');
}

function findUnit(blocks: readonly NormBodyBlock[], label: string): NormBodyBlock | undefined {
  for (const block of blocks) {
    if (block.label && label.startsWith(block.label) && ['annex', 'paragraph', 'article', 'preamble'].includes(block.type)) return block;
    const inner = findUnit(block.children ?? [], label);
    if (inner) return inner;
  }
  return undefined;
}

/**
 * Gruppe eines Anlagenfalls. `details` ist der Befundtext des Review-Falls („Anlage 1 (zu § 24 …): juris-Vermerk …“),
 * `separateAnnexLabels` die Bezeichnungen der Anlagen, die juris als eigene, dieser Stammnorm zugeordnete Dokumente führt.
 */
export function classifyAnnexGap(input: { sourceIdentity: string; reviewKey: string; details: string; parsed?: ParsedJurisPdf; separateAnnexLabels?: readonly string[] }): AnnexGapCase {
  const { sourceIdentity, reviewKey, details, parsed } = input;
  const base = { sourceIdentity, reviewKey };
  if (reviewKey === 'parse:vwv-annex-document' || reviewKey === 'parse:annex-separate-document') {
    return { ...base, group: 'assignment-unclear', bodyCharacters: parsed ? text(parsed.body).length : 0, reason: 'Anlage als eigenes juris-Dokument, Stammnorm nicht eindeutig' };
  }
  const unit = /^(?:Anlagendokument\s+\S+:\s*)?((?:Anlage|Anhang|§|Art(?:ikel|\.)|Präambel|Eingangsformel)[^:]{0,110}):\s*(?:juris-Vermerk|Technischer Vermerk)/u.exec(details)?.[1]?.trim();
  const bodyCharacters = parsed ? text(parsed.body).replace(/\s+/gu, ' ').trim().length : 0;
  if (parsed && bodyCharacters < 200) return { ...base, group: 'completely-missing', ...(unit ? { unit } : {}), bodyCharacters, reason: 'Ausgabe ohne Normtext außer dem Vermerk' };
  const block = unit && parsed ? findUnit(parsed.body, unit) : undefined;
  const unitTitle = block?.title ?? (unit ? unit.replace(/^(?:Anlage|Anhang)\s+\S+\s*/u, '') : undefined);
  const annexLabel = unit ? /^(?:Anlage|Anhang)\s+[0-9]+[a-z]?|^(?:Anlage|Anhang)\s+[IVX]+\b|^(?:Anlage|Anhang)\b/u.exec(unit)?.[0] : undefined;
  if (annexLabel && (input.separateAnnexLabels ?? []).some((label) => label === annexLabel)) {
    return { ...base, group: 'normative-separate', unit: unit!, ...(unitTitle ? { unitTitle } : {}), bodyCharacters, reason: `${annexLabel} liegt als eigenes juris-Dokument vor` };
  }
  if (annexLabel && unitTitle && NON_NORMATIVE_ANNEX.test(unitTitle)) {
    return { ...base, group: 'non-normative-missing', unit: unit!, unitTitle, bodyCharacters, reason: `Anlagentitel kennzeichnet sie als nichtnormativ („${NON_NORMATIVE_ANNEX.exec(unitTitle)![0]}“)` };
  }
  return { ...base, group: 'normative-pdf-only', ...(unit ? { unit } : {}), ...(unitTitle ? { unitTitle } : {}), bodyCharacters, reason: unit ? `${unit.slice(0, 60)} nur als gesonderte PDF-Datei (Links der juris-Ausgabe nicht abrufbar)` : 'Teil der Vorschrift nur als gesonderte PDF-Datei' };
}

/**
 * Untergruppen aller offenen Anlagenfälle aus der PDF-Ausgabe im Cache (kein Netz). `parts` ordnet Anlagendokumente
 * (`part-of-main`/`excluded` mit `partOf`) ihrer Stammnorm zu.
 */
export function annexGapGroupsFromCache(root: string, items: ReadonlyArray<{ id: string; sourceIdentity: string; category: string; key: string; details: string[] | string }>, parts: ReadonlyArray<{ sourceIdentity: string; partOf?: string }>): Map<string, AnnexGapCase> {
  const partsOf = new Map<string, string[]>();
  for (const entry of parts) if (entry.partOf) partsOf.set(entry.partOf, [...(partsOf.get(entry.partOf) ?? []), entry.sourceIdentity]);
  const cache = new Map<string, ParsedJurisPdf | undefined>();
  const parsed = (id: string): ParsedJurisPdf | undefined => {
    if (!cache.has(id)) {
      const file = join(root, CACHE_DIR, `${cacheKey(pdfExportUrl(id, 'gesamtausgabe'))}.bin`);
      let value: ParsedJurisPdf | undefined;
      try {
        value = existsSync(file) ? parseJurisPdf(layoutFromPdf(new Uint8Array(readFileSync(file))), { images: null }) : undefined;
      } catch {
        value = undefined;
      }
      cache.set(id, value);
    }
    return cache.get(id);
  };
  const result = new Map<string, AnnexGapCase>();
  for (const item of items.filter((entry) => entry.category === 'incomplete-annex')) {
    const separateAnnexLabels = (partsOf.get(item.sourceIdentity) ?? []).map((id) => /\b(?:Anlage|Anhang)\s+(?:[0-9]+[a-z]?|[IVX]+)\b/u.exec(parsed(id)?.title ?? '')?.[0]).filter((label): label is string => Boolean(label));
    const document = parsed(item.sourceIdentity);
    result.set(item.id, classifyAnnexGap({ sourceIdentity: item.sourceIdentity, reviewKey: item.key, details: Array.isArray(item.details) ? item.details.join(' | ') : item.details, ...(document ? { parsed: document } : {}), separateAnnexLabels }));
  }
  return result;
}
