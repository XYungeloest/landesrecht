/**
 * Anlagen einer Verwaltungsvorschrift, die juris als eigenes Dokument führt („Zum Hauptdokument : <Titel>“).
 *
 * Eine solche Anlage ist keine eigene Norm, sondern Bestandteil ihrer Stammnorm (Audit Run 7, Punkt 8). Zugeordnet
 * wird nur eindeutig: Stammnorm ist die einzige VwV ohne eigenen Hauptdokument-Vermerk, deren Titel dem genannten
 * Hauptdokument entspricht (gleich; sonst Präfix in beide Richtungen, mindestens 20 Zeichen) und – soweit beide sie
 * tragen – dieselbe Gliederungsnummer hat; bei gleichnamigen Kandidaten (Änderungsbekanntmachungen) entscheidet das
 * gemeinsame Erlassdatum. Mehrdeutige oder fehlende Stammnormen bleiben Review.
 *
 * Die Anlage wird als `annex`-Block an den Normkörper der Stammnorm angehängt (Reihenfolge: Nummer der Anlage, sonst
 * Dokumentnummer); ihre PDF-Ausgabe und Abbildungen werden Rohquellen der Stammnorm. Sperrgründe der Anlage (Tabellen,
 * Integrität, Überleitung) werden Sperrgründe der Stammnorm – eine unvollständige Anlage macht die Stammnorm
 * unvollständig. Eine Anlage, die am Stichtag nicht galt (vor dem Stichtag aufgehoben, danach erlassen), gehört nicht
 * zur Stichtagsfassung und wird nicht angehängt.
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import { normalizeGliederungsnummer } from './baseline-evidence.ts';
import type { DocumentBlocker, DocumentResult } from './document.ts';

export interface AnnexAssignment {
  /** Anlagendokument → Stammnorm. */
  mainOf: Map<string, string>;
  /** Stammnorm → Anlagendokumente (Reihenfolge der Anlagen). */
  annexesOf: Map<string, string[]>;
  /** Anlagendokumente ohne eindeutige Stammnorm, mit Grund. */
  unresolved: Map<string, string>;
  /** Stammnormen, denen eine Anlage mehrdeutig zugeordnet wäre (Review). */
  ambiguousMains: Map<string, string[]>;
}

export function titleKey(title: string): string {
  return title.toLowerCase().replace(/ß/gu, 'ss').replace(/[^a-z0-9äöü]+/gu, '');
}

/** „Anlage 2: Mustersatzung II“ → { label: „Anlage 2“, title: „Mustersatzung II“ }. */
export function annexLabel(text: string | undefined): { label: string; title?: string } | undefined {
  const match = /\b(Anlage|Anhang)\s+([0-9]+[a-z]?|[IVX]+)\b\s*[:.-]?\s*(.*)$/u.exec(text ?? '');
  if (!match) return undefined;
  const title = match[3]!.trim();
  return { label: `${match[1]} ${match[2]}`, ...(title ? { title } : {}) };
}

function annexNumber(label: string | undefined): number | undefined {
  const match = /\b(?:Anlage|Anhang)\s+(\d+)/u.exec(label ?? '');
  return match ? Number(match[1]) : undefined;
}

export function assignSeparateAnnexes(documents: ReadonlyArray<{ id: string; area: string; result?: DocumentResult | undefined }>): AnnexAssignment {
  const assignment: AnnexAssignment = { mainOf: new Map(), annexesOf: new Map(), unresolved: new Map(), ambiguousMains: new Map() };
  const mains = documents.filter((document) => document.area === 'vwv' && document.result && !document.result.mainDocument && document.result.title);
  const byKey = new Map<string, typeof mains>();
  for (const main of mains) {
    const key = titleKey(main.result!.title!);
    byKey.set(key, [...(byKey.get(key) ?? []), main]);
  }
  for (const annex of documents) {
    const mainTitle = annex.result?.mainDocument;
    if (!mainTitle) continue;
    const key = titleKey(mainTitle);
    let candidates = byKey.get(key) ?? [];
    if (candidates.length === 0 && key.length >= 20) candidates = mains.filter((main) => {
      const other = titleKey(main.result!.title!);
      return other.length >= 20 && (other.startsWith(key) || key.startsWith(other));
    });
    const gl = annex.result!.source?.gliederungsnummer;
    if (gl && candidates.length > 1) {
      const sameGl = candidates.filter((main) => main.result!.source?.gliederungsnummer && normalizeGliederungsnummer(main.result!.source.gliederungsnummer) === normalizeGliederungsnummer(gl));
      if (sameGl.length > 0) candidates = sameGl;
    }
    if (gl) candidates = candidates.filter((main) => !main.result!.source?.gliederungsnummer || normalizeGliederungsnummer(main.result!.source.gliederungsnummer) === normalizeGliederungsnummer(gl));
    // Wiederkehrende Titel (Änderungsbekanntmachungen gleichen Namens): Anlage und Stammnorm tragen dasselbe
    // Erlassdatum – eine Bekanntmachung und ihre Anlagen werden gemeinsam erlassen (Run 8). Nur eindeutig.
    const dates = new Set(annex.result!.source?.documentDates ?? []);
    if (candidates.length > 1 && dates.size > 0) {
      const sameDate = candidates.filter((main) => (main.result!.source?.documentDates ?? []).some((date) => dates.has(date)));
      if (sameDate.length === 1) candidates = sameDate;
    }
    if (candidates.length === 1) {
      assignment.mainOf.set(annex.id, candidates[0]!.id);
      assignment.annexesOf.set(candidates[0]!.id, [...(assignment.annexesOf.get(candidates[0]!.id) ?? []), annex.id]);
    } else if (candidates.length === 0) {
      assignment.unresolved.set(annex.id, `keine VwV mit dem Titel „${mainTitle.slice(0, 80)}“${gl ? ` und Gliederungsnummer ${gl}` : ''} im Bestand`);
    } else {
      assignment.unresolved.set(annex.id, `mehrdeutig: ${candidates.map((main) => main.id).join(', ')}`);
      for (const main of candidates) assignment.ambiguousMains.set(main.id, [...(assignment.ambiguousMains.get(main.id) ?? []), annex.id]);
    }
  }
  // Reihenfolge je Stammnorm: Nummer der Anlage, sonst Dokumentnummer.
  const byId = new Map(documents.map((document) => [document.id, document]));
  for (const [main, annexes] of assignment.annexesOf) {
    const order = (id: string): number => annexNumber(annexLabel(byId.get(id)?.result?.title)?.label ?? firstAnnexLabel(byId.get(id)?.result)) ?? Number.MAX_SAFE_INTEGER;
    assignment.annexesOf.set(main, [...annexes].sort((left, right) => order(left) - order(right) || (left < right ? -1 : 1)));
  }
  return assignment;
}

function firstAnnexLabel(result: DocumentResult | undefined): string | undefined {
  const first = result?.record?.versions[0]?.body[0];
  return first?.type === 'annex' ? first.label : undefined;
}

/** `annex`-Block aus dem (übergeleiteten) Normkörper eines Anlagendokuments. */
export function annexBlockFor(result: DocumentResult): NormBodyBlock {
  const body = result.record!.versions[0]!.body;
  const first = body[0];
  if (first?.type === 'annex') return { ...first, children: [...(first.children ?? []), ...body.slice(1)] };
  const labelled = annexLabel(result.title);
  return { type: 'annex', label: labelled?.label ?? 'Anlage', ...(labelled?.title ? { title: labelled.title } : {}), children: body };
}

const NOT_AT_BASELINE = new Set(['repealed-before-baseline', 'enacted-after-baseline']);

/**
 * Hängt die Anlagendokumente an die Stammnorm an (Normkörper, Abbildungen, Rohquellen) und übernimmt ihre
 * Sperrgründe. Gibt die angehängten Anlagen zurück.
 */
export function attachAnnexes(main: DocumentResult, annexes: ReadonlyArray<{ id: string; result: DocumentResult }>): string[] {
  const attached: string[] = [];
  const blockers: DocumentBlocker[] = [];
  const reasons: string[] = [];
  for (const { id, result } of annexes) {
    if (result.baseline && NOT_AT_BASELINE.has(result.baseline.class)) continue;
    if (!result.record || result.outcome === 'failed' || result.outcome === 'not-at-baseline' || result.outcome === 'reconstruction') {
      reasons.push(`Anlagendokument ${id}: ${result.outcome}${result.reasons[0] ? ` (${result.reasons[0].slice(0, 120)})` : ''}`);
      blockers.push({ kind: result.outcome === 'reconstruction' ? 'historical' : 'parse', code: 'annex-document-unusable', detail: `${id}: ${result.outcome}` });
      continue;
    }
    const own = result.blockers.filter((blocker) => blocker.code !== 'vwv-annex-document');
    for (const blocker of own) blockers.push({ ...blocker, detail: `Anlagendokument ${id}: ${blocker.detail}`.slice(0, 300) });
    if (own.length > 0) reasons.push(`Anlagendokument ${id}: ${[...new Set(own.map((blocker) => `${blocker.kind}:${blocker.code}`))].join(', ')}`);
    if (main.record) for (const version of main.record.versions) version.body = [...version.body, annexBlockFor(result)];
    for (const figure of result.figures ?? []) {
      if (!(main.figures ?? []).some((existing) => existing.sha256 === figure.sha256)) main.figures = [...(main.figures ?? []), figure];
    }
    main.annexDocuments = [...(main.annexDocuments ?? []), { documentId: id, raw: result.raw }];
    main.warnings.push(...result.warnings.map((warning) => `Anlagendokument ${id}: ${warning}`));
    attached.push(id);
  }
  if (blockers.length > 0) {
    main.blockers.push(...blockers);
    main.reasons.push(...reasons);
    if (main.outcome === 'import-ready') main.outcome = 'review';
  }
  return attached;
}
