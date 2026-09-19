/**
 * Register der statusentscheidenden Quellen der Rückrechnung (`data/imports/bayernrecht/reconstruction-sources.json`).
 *
 * Jede Verkündung, die der Gang einer Kette gelesen hat – zurückgenommene Änderung, noch nicht geltende Änderung,
 * Beleg des Beginns der Stichtagsfassung –, steht hier genau einmal mit: Adresse, Fundstelle, Verkündungs- und
 * Ausfertigungsdatum, Amtlichkeit (GVBl. `printed-official`, BayMBl. `electronic-official`), SHA-256 der
 * abgerufenen Seite bzw. PDF (bei PDF auch die veröffentlichte Prüfsumme und das Ausgabenverzeichnis), und je Fall
 * die Rolle, den Abschnitt und den Wortlaut der maßgeblichen Stelle (Inkrafttretensvorschrift). Deterministisch
 * sortiert, ohne Laufzeitstempel.
 */
import { IMPORT_DATA_DIR } from '../common/constants.ts';
import { SOURCE_AUTHORITY } from './pages.ts';
import type { AnyReconstructionRecipe } from './recipe.ts';
import type { WalkResult, WalkStep } from './walk.ts';

export const RECONSTRUCTION_SOURCES_PATH = `${IMPORT_DATA_DIR}/reconstruction-sources.json`;
export const SOURCE_REGISTER_SCHEMA = 'bayernrecht-reconstruction-sources/1' as const;

/** `restoration-base`/`restoration-prior`: Stammverkündung und Änderungen vor dem Stichtag, aus denen Alttext stammt (Lauf 7). */
export type SourceRole = 'reversed-amendment' | 'future-amendment' | 'baseline-start' | 'restoration-base' | 'restoration-prior';

export interface RegisteredSource {
  url: string;
  kind: 'html' | 'pdf';
  citation: string;
  organ: string;
  publicationAuthority: string;
  digitalRepresentation: string;
  /** Verkündungsdatum (Register oder Seite). */
  eventDate?: string;
  enactmentDate?: string;
  sha256: string;
  retrievedAt?: string;
  gazettePdfUrl?: string;
  gazettePdfSha256Published?: string;
  pdf?: { issue: string; pages: string; indexUrl: string; indexSha256: string; publishedSha256: string };
  /** Verknüpfung zu den Fällen: Rolle, Abschnitt, maßgeblicher Wortlaut, Inkrafttreten. */
  cases: Array<{ documentId: string; role: SourceRole; section?: string; namedAs: string; effectiveDates: string[]; relevant: string[]; decisive: boolean }>;
}

export interface SourceRegister {
  schemaVersion: typeof SOURCE_REGISTER_SCHEMA;
  totals: { sources: number; html: number; pdf: number; decisive: number; byAuthority: Record<string, number> };
  sources: RegisteredSource[];
}

export function buildSourceRegister(outcomes: ReadonlyArray<{ documentId: string; walk?: WalkResult; recipe?: AnyReconstructionRecipe }>): SourceRegister {
  const byUrl = new Map<string, RegisteredSource>();
  const add = (documentId: string, step: WalkStep, role: SourceRole, decisive: boolean): void => {
    const authority = SOURCE_AUTHORITY[step.ref.organ];
    const existing = byUrl.get(step.page.url) ?? {
      url: step.page.url,
      kind: step.page.kind,
      citation: step.citation,
      organ: step.ref.organ,
      publicationAuthority: authority.publicationAuthority,
      digitalRepresentation: authority.digitalRepresentation,
      ...(step.eventDate ? { eventDate: step.eventDate } : {}),
      ...(step.enactmentDate ? { enactmentDate: step.enactmentDate } : {}),
      sha256: step.page.sha256,
      ...(step.page.retrievedAt ? { retrievedAt: step.page.retrievedAt } : {}),
      ...(step.page.gazettePdfUrl ? { gazettePdfUrl: step.page.gazettePdfUrl } : {}),
      ...(step.page.gazettePdfSha256Published ? { gazettePdfSha256Published: step.page.gazettePdfSha256Published } : {}),
      ...(step.page.pdf ? { pdf: step.page.pdf } : {}),
      cases: [],
    };
    if (!existing.cases.some((entry) => entry.documentId === documentId && entry.role === role && entry.section === step.section)) {
      existing.cases.push({ documentId, role, ...(step.section ? { section: step.section } : {}), namedAs: step.namedAs, effectiveDates: [...step.effectiveDates].sort(), relevant: step.effectiveDateEvidence, decisive });
    }
    byUrl.set(step.page.url, existing);
  };
  for (const outcome of outcomes) {
    const walk = outcome.walk;
    if (!walk) continue;
    const decisive = outcome.recipe !== undefined;
    for (const step of walk.steps) add(outcome.documentId, step, 'reversed-amendment', decisive);
    for (const step of walk.future) add(outcome.documentId, step, 'future-amendment', decisive);
    for (const step of walk.witnesses) add(outcome.documentId, step, 'baseline-start', decisive);
    // Quellen der Wiederherstellung (nur mit Rezept): Stammverkündung und Änderungen vor dem Stichtag.
    for (const source of outcome.recipe?.restoration?.sources ?? []) {
      const role: SourceRole = source.role === 'base-publication' ? 'restoration-base' : 'restoration-prior';
      const existing = byUrl.get(source.url) ?? {
        url: source.url,
        kind: 'html' as const,
        citation: source.citation.replace(/\s+\(.*\)$/u, ''),
        organ: /^GVBl/u.test(source.citation) ? 'gvbl' : /^BayMBl/u.test(source.citation) ? 'baymbl' : source.citation.split('.')[0]!.toLowerCase(),
        publicationAuthority: source.authority,
        digitalRepresentation: source.representation,
        ...(source.publishedAt ? { eventDate: source.publishedAt } : {}),
        sha256: source.sha256,
        ...(source.retrievedAt ? { retrievedAt: source.retrievedAt } : {}),
        cases: [],
      };
      if (!existing.cases.some((entry) => entry.documentId === outcome.documentId && entry.role === role)) {
        existing.cases.push({ documentId: outcome.documentId, role, ...(source.section ? { section: source.section } : {}), namedAs: source.citation, effectiveDates: [], relevant: [role === 'restoration-base' ? 'Alttext nicht umkehrbarer Befehle (Stammfassung)' : 'vor dem Stichtag, zur Probe der Wiederherstellung zurückgenommen'], decisive: true });
      }
      byUrl.set(source.url, existing);
    }
  }
  const sources = [...byUrl.values()].sort((left, right) => (left.url < right.url ? -1 : 1));
  for (const source of sources) source.cases.sort((left, right) => (left.documentId < right.documentId ? -1 : left.documentId > right.documentId ? 1 : left.role < right.role ? -1 : 1));
  const byAuthority: Record<string, number> = {};
  for (const source of sources) byAuthority[source.publicationAuthority] = (byAuthority[source.publicationAuthority] ?? 0) + 1;
  return {
    schemaVersion: SOURCE_REGISTER_SCHEMA,
    totals: { sources: sources.length, html: sources.filter((source) => source.kind === 'html').length, pdf: sources.filter((source) => source.kind === 'pdf').length, decisive: sources.filter((source) => source.cases.some((entry) => entry.decisive)).length, byAuthority },
    sources,
  };
}
