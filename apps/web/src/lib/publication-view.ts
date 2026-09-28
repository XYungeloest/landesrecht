/**
 * Ansichtsmodell der Verkündungsseiten: Links der Einträge auf Norm oder entstandene Fassung. Ein Eintrag
 * verweist auf die geltende Fassung, wenn seine Fassung die maßgebliche ist, sonst auf die unveränderliche
 * Fassungsadresse; Änderungsvorschriften öffnen als Vorschrift mit Sprung zur Historie. Normen, die der Store
 * nicht kennt, bleiben ohne Link (nie ein toter Verweis).
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { formatDate } from '@landesrecht/legal-core/lib/display.ts';
import { getNormSubpageUrl, getNormUrl, getNormVersionUrl } from '@landesrecht/legal-core/lib/routes.ts';
import type { Publication, PublicationEntry } from '@landesrecht/legal-core/lib/schema.ts';
import type { NormStore, NormSummary } from '@landesrecht/runtime/store.ts';

export interface PublicationEntryLink {
  href: string;
  label: string;
  /** Historie der Änderungsvorschrift („Auswirkungen auf geltendes Recht“). */
  historyUrl?: string;
}

export function entryLinkKey(entry: Pick<PublicationEntry, 'normSlug' | 'versionId'>): string {
  return `${entry.normSlug}#${entry.versionId ?? ''}`;
}

/** Link eines Eintrags aus der Normübersicht; `undefined`, wenn die Norm nicht im Bestand ist. */
export function entryLinkFor(jurisdiction: JurisdictionId, entry: Pick<PublicationEntry, 'normSlug' | 'versionId'>, summary: NormSummary | null | undefined): PublicationEntryLink | undefined {
  if (!summary) return undefined;
  if (summary.type === 'aenderungsvorschrift') return { href: getNormUrl(jurisdiction, entry.normSlug), label: 'Als Vorschrift öffnen', historyUrl: getNormSubpageUrl(jurisdiction, entry.normSlug, 'historie') };
  if (entry.versionId && entry.versionId !== summary.currentVersionId) {
    const label = /^\d{4}-\d{2}-\d{2}$/u.test(entry.versionId) ? `Fassung vom ${formatDate(entry.versionId)}` : `Fassung ${entry.versionId}`;
    return { href: getNormVersionUrl(jurisdiction, entry.normSlug, entry.versionId), label };
  }
  return { href: getNormUrl(jurisdiction, entry.normSlug), label: 'Geltende Fassung' };
}

/** Links aller Einträge der Ausgaben; je Norm eine Übersichtsabfrage, nie der gesamte Bestand. */
export async function resolveEntryLinks(store: NormStore, jurisdiction: JurisdictionId, publications: readonly Publication[]): Promise<Map<string, PublicationEntryLink | undefined>> {
  const slugs = [...new Set(publications.flatMap((publication) => publication.entries.map((entry) => entry.normSlug)))];
  const summaries = new Map(await Promise.all(slugs.map(async (slug) => [slug, await store.getNormSummary(slug)] as const)));
  const links = new Map<string, PublicationEntryLink | undefined>();
  for (const publication of publications) {
    for (const entry of publication.entries) links.set(entryLinkKey(entry), entryLinkFor(jurisdiction, entry, summaries.get(entry.normSlug)));
  }
  return links;
}
