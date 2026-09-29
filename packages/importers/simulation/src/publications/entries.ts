/**
 * Inhaltsverzeichnis der Sim-Verkündungen (docs/SIMULATION_IMPORT.md, Abschnitt 4): Eine Publication beschreibt, was in
 * der Ausgabe tatsächlich abgedruckt ist. Quelle ist das Evidenzinventar `data/simulation/<land>/sources.json` – je Ausgabe
 * `acts[]`. Jeder abgedruckte Akt steht als Eintrag in `content/publications/<land>/<slug>.json`, gleich ob er als
 * Portalnorm veröffentlicht, in Prüfung, gesperrt oder nicht übernommen ist. Die Verknüpfung zur Portalnorm (`normSlug`,
 * `versionId`) steht nur bei sicherer Zuordnung (`actSlug` des Inventars mit vorhandener Norm); sonst verweist der Eintrag
 * auf die Ledger-Ereignisse und nennt deren Stand (`consolidationStatus`). Keine Rechtswirkung wird abgeleitet.
 *
 * `syncPublicationEntries` ergänzt fehlende Einträge (bestehende bleiben unverändert, nur neu einsortiert) und schreibt
 * den Stand nicht veröffentlichter Akte fort; `auditPublicationEntries` ist das Gate G12 (fail-closed):
 *  - jede Ausgabe mit inventarisierten Akten hat eine Publication, und jeder Akt einen Eintrag (sonst dokumentierte Ausnahme
 *    in `data/simulation/publication-entry-exceptions.json`);
 *  - Publikationsidentität (Jahr, Nummer, Datum, Blatt) stimmt mit dem Inventar überein;
 *  - Einträge ohne Portalnorm haben Titel, Seiten und Datum ihres Akts, gültige Ledger-Bezüge und einen aktuellen Stand;
 *  - keine doppelten Einträge.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readJsonFile, writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { getPublicationLabel } from '@landesrecht/legal-core/lib/publications.ts';
import { NORM_TYPES, parsePublication, PUBLICATION_ENTRY_STATUSES, type NormType, type Publication, type PublicationEntry, type PublicationEntryStatus } from '@landesrecht/legal-core/lib/schema.ts';

import { SIMULATION_DATA_DIR } from '../common/paths.ts';
import { ledgerPath, type LedgerEvent } from '../ledger/sync.ts';

export const PUBLICATION_ENTRY_EXCEPTIONS_PATH = `${SIMULATION_DATA_DIR}/publication-entry-exceptions.json`;

interface SourceAct {
  title?: string;
  abbr?: string | null;
  kind?: string;
  pages?: string | null;
  documentDate?: string | null;
  actSlug?: string | null;
}

interface InventorySource {
  sha256: string;
  publication?: { slug?: string; seriesCode?: string; year?: number; number?: string; date?: string } | null;
  acts?: SourceAct[];
}

interface EntryException {
  jurisdiction: JurisdictionId;
  publication: string;
  actTitle: string;
  reason: string;
}

export interface PublicationEntrySync {
  jurisdiction: JurisdictionId;
  publication: string;
  added: PublicationEntry[];
  statusUpdates: Array<{ title: string; from: string | undefined; to: string | undefined }>;
}

export interface PublicationEntryReport {
  jurisdiction: JurisdictionId;
  publications: number;
  acts: number;
  entries: number;
  emptyBefore: number;
  emptyAfter: number;
  changes: PublicationEntrySync[];
  problems: string[];
  written: string[];
}

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function longDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return `${day}. ${MONTHS[month! - 1]} ${year}`;
}

export function normalizeTitle(value: string | undefined | null): string {
  return (value ?? '').normalize('NFC').toLowerCase().replace(/[„“”"'‚‘’()]/gu, '').replace(/\s+/gu, ' ').trim();
}

function tokens(value: string | undefined | null): Set<string> {
  return new Set(normalizeTitle(value).replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter((token) => token.length >= 4));
}

function overlap(left: string | undefined | null, right: string | undefined | null): number {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  return common / Math.max(a.size, b.size);
}

/** Titel des Eintrags wie gedruckt: Titel des Akts, ergänzt um seine Kurzbezeichnung, wenn der Titel sie nicht enthält. */
export function actEntryTitle(act: SourceAct): string {
  const title = (act.title ?? '').trim();
  const abbr = act.abbr?.trim();
  return abbr && !normalizeTitle(title).includes(normalizeTitle(abbr)) ? `${title} (${abbr})` : title;
}

export function firstPage(pages: string | null | undefined): number | undefined {
  const match = /^\s*(\d+)/u.exec(pages ?? '');
  return match ? Number(match[1]) : undefined;
}

const KIND_WORD: Readonly<Record<string, string>> = {
  verfassung: 'Verfassung', gesetz: 'Gesetz', zustimmungsgesetz: 'Gesetz', verordnung: 'Verordnung', runderlass: 'Runderlass',
  bekanntmachung: 'Bekanntmachung', verwaltungsvorschrift: 'Verwaltungsvorschrift', richtlinie: 'Richtlinie', staatsvertrag: 'Staatsvertrag',
};

/** Dokumentwort der Fundstelle: aus der Dokumentart, bei Änderungsvorschriften aus dem Titelanfang (Gesetz, Verordnung, …). */
function citationWord(act: SourceAct): string {
  if (act.kind && KIND_WORD[act.kind]) return KIND_WORD[act.kind]!;
  const head = /\b(Gesetz|Verordnung|Richtlinie|Runderlass|Bekanntmachung|Verwaltungsvorschrift|Erlass)/u.exec(act.title ?? '');
  return head ? head[1]! : 'Bekanntmachung';
}

/**
 * Fundstellenkopf der Ausgabe wie in den vorhandenen Einträgen derselben Blattreihe („GV. West 2025 Nr. 05“,
 * „NSH GVBl. LAH-I Teil 1/2025“); ohne Vorbild die übliche Bezeichnung (`getPublicationLabel`).
 */
export function citationHead(publication: Publication, siblings: readonly Publication[]): string {
  for (const sibling of siblings) {
    if (sibling.gazette !== publication.gazette) continue;
    for (const entry of sibling.entries) {
      if (entry.citation.includes(`${sibling.gazette} Teil ${sibling.issue}/${sibling.year}`)) return `${publication.gazette} Teil ${publication.issue}/${publication.year}`;
    }
  }
  return getPublicationLabel(publication);
}

export function entryCitation(act: SourceAct, head: string): string {
  const page = firstPage(act.pages);
  const where = `${head}${page !== undefined ? ` S. ${page}` : ''}`;
  return act.documentDate && /^\d{4}-\d{2}-\d{2}$/u.test(act.documentDate) ? `${citationWord(act)} vom ${longDate(act.documentDate)} (${where})` : `${citationWord(act)} (${where})`;
}

/** Ledger-Ereignisse eines Akts: über `actSlug`, sonst über Titel innerhalb der Ereignisse dieser Ausgabe bzw. Quelle. */
export function eventsForAct(act: SourceAct, source: InventorySource, publicationSlug: string, events: readonly LedgerEvent[]): LedgerEvent[] {
  if (act.actSlug) {
    const bySlug = events.filter((event) => event.act?.slug === act.actSlug);
    if (bySlug.length > 0) return bySlug;
  }
  const local = events.filter((event) => (event.publication as { slug?: string } | null | undefined)?.slug === publicationSlug || (Array.isArray(event.evidence) && (event.evidence as unknown[]).includes(source.sha256)));
  const exact = local.filter((event) => normalizeTitle(event.act?.title) === normalizeTitle(act.title));
  if (exact.length > 0) return exact;
  const scored = local.map((event) => ({ event, score: overlap(event.act?.title, act.title) })).filter((entry) => entry.score >= 0.75).sort((a, b) => b.score - a.score);
  if (scored.length === 0) return [];
  // Nur eindeutig beste Zuordnung (bei Gleichstand keine – nie raten).
  if (scored.length > 1 && scored[0]!.score === scored[1]!.score && normalizeTitle(scored[0]!.event.act?.title) !== normalizeTitle(scored[1]!.event.act?.title)) return [];
  const best = normalizeTitle(scored[0]!.event.act?.title);
  return scored.filter((entry) => normalizeTitle(entry.event.act?.title) === best).map((entry) => entry.event);
}

/** Gemeinsamer Stand nicht veröffentlichter Akte; gemischte oder übernommene Ereignisse ergeben keinen Stand. */
export function commonStatus(events: readonly LedgerEvent[]): PublicationEntryStatus | undefined {
  const statuses = new Set(events.map((event) => event.status));
  if (statuses.size !== 1) return undefined;
  const [status] = statuses;
  return (PUBLICATION_ENTRY_STATUSES as readonly string[]).includes(status!) ? (status as PublicationEntryStatus) : undefined;
}

/** Ob ein vorhandener Eintrag den Akt abdeckt (Norm-Slug, Ledger-Bezug, gleicher Titel oder gleiche Startseite mit ähnlichem Titel). */
export function entryCoversAct(entry: PublicationEntry, act: SourceAct, actEvents: readonly LedgerEvent[]): boolean {
  if (act.actSlug && entry.normSlug === act.actSlug) return true;
  if (entry.ledgerEvents && actEvents.some((event) => entry.ledgerEvents!.includes(event.id))) return true;
  if (normalizeTitle(entry.title) === normalizeTitle(act.title) || normalizeTitle(entry.title) === normalizeTitle(actEntryTitle(act))) return true;
  const start = firstPage(act.pages);
  return start !== undefined && (entry.startPage ?? firstPage(entry.pages)) === start && overlap(entry.title, act.title) >= 0.5;
}

async function listNormVersions(root: string, jurisdiction: JurisdictionId, slug: string): Promise<Array<{ versionId: string; publicationSlugs: string[] }> | undefined> {
  const directory = join(root, 'content', 'norms', jurisdiction, slug, 'versions');
  let names: string[];
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  } catch {
    return undefined;
  }
  return Promise.all(names.map(async (name) => {
    const version = JSON.parse(await readFile(join(directory, name), 'utf8')) as { versionId: string; sourceReferences?: Array<{ publicationSlug?: string }> };
    return { versionId: version.versionId, publicationSlugs: (version.sourceReferences ?? []).flatMap((reference) => (reference.publicationSlug ? [reference.publicationSlug] : [])) };
  }));
}

function sortEntries(entries: PublicationEntry[]): PublicationEntry[] {
  // Stabil nach Startseite; Einträge ohne Seitenangabe behalten ihre Reihenfolge am Ende.
  return entries.map((entry, index) => ({ entry, index, page: entry.startPage ?? firstPage(entry.pages) ?? Number.POSITIVE_INFINITY })).sort((a, b) => a.page - b.page || a.index - b.index).map((item) => item.entry);
}

/** Einträge in der Schlüsselfolge der vorhandenen Dateien (title, type, citation, normSlug, versionId, pages, startPage, documentDate, …). */
function orderedEntry(entry: PublicationEntry): Record<string, unknown> {
  const order = ['title', 'type', 'citation', 'normSlug', 'versionId', 'pages', 'startPage', 'documentDate', 'ledgerEvents', 'consolidationStatus'] as const;
  return Object.fromEntries(order.flatMap((key) => (entry[key] !== undefined ? [[key, entry[key]]] : [])));
}

export async function syncPublicationEntries(root: string, jurisdiction: JurisdictionId, options: { write: boolean }): Promise<PublicationEntryReport> {
  const sources = ((await readJsonFile<{ sources: InventorySource[] }>(join(root, SIMULATION_DATA_DIR, jurisdiction, 'sources.json')))?.sources ?? []).filter((source) => source.publication?.slug);
  const events = (await readJsonFile<{ events: LedgerEvent[] }>(join(root, ledgerPath(jurisdiction))))?.events ?? [];
  const eventIds = new Map(events.map((event) => [event.id, event]));
  const exceptions = ((await readJsonFile<{ exceptions?: EntryException[] }>(join(root, PUBLICATION_ENTRY_EXCEPTIONS_PATH)))?.exceptions ?? []).filter((entry) => entry.jurisdiction === jurisdiction);
  const directory = join(root, 'content', 'publications', jurisdiction);
  let names: string[] = [];
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  } catch {
    names = [];
  }
  const raw = new Map<string, Record<string, unknown>>();
  const publications = new Map<string, Publication>();
  for (const name of names) {
    const value = JSON.parse(await readFile(join(directory, name), 'utf8')) as Record<string, unknown>;
    const publication = parsePublication(value, `content/publications/${jurisdiction}/${name}`);
    raw.set(publication.slug, value);
    publications.set(publication.slug, publication);
  }
  const report: PublicationEntryReport = { jurisdiction, publications: publications.size, acts: 0, entries: 0, emptyBefore: [...publications.values()].filter((publication) => publication.entries.length === 0).length, emptyAfter: 0, changes: [], problems: [], written: [] };
  const all = [...publications.values()];

  for (const source of sources) {
    const slug = source.publication!.slug!;
    const context = `content/publications/${jurisdiction}/${slug}.json`;
    const publication = publications.get(slug);
    const acts = source.acts ?? [];
    report.acts += acts.length;
    if (!publication) {
      if (acts.length > 0) report.problems.push(`${context}: Ausgabe mit ${acts.length} inventarisierten Akt(en) (sources.json ${source.sha256.slice(0, 12)}) hat keine Publication`);
      continue;
    }
    // Publikationsidentität: Inventar und Publication beschreiben dieselbe Ausgabe.
    const identity = source.publication!;
    if (identity.year !== undefined && identity.year !== publication.year) report.problems.push(`${context}: Jahr ${publication.year} ≠ Inventar ${identity.year}`);
    if (identity.number !== undefined && identity.number !== publication.issue) report.problems.push(`${context}: Nummer ${publication.issue} ≠ Inventar ${identity.number}`);
    if (identity.date !== undefined && identity.date !== publication.date) report.problems.push(`${context}: Datum ${publication.date} ≠ Inventar ${identity.date}`);
    if (identity.seriesCode !== undefined && identity.seriesCode !== publication.gazette) report.problems.push(`${context}: Blatt ${publication.gazette} ≠ Inventar ${identity.seriesCode}`);

    const head = citationHead(publication, all);
    const entries = [...publication.entries];
    const change: PublicationEntrySync = { jurisdiction, publication: slug, added: [], statusUpdates: [] };
    for (const act of acts) {
      const actEvents = eventsForAct(act, source, slug, events);
      if (entries.some((entry) => entryCoversAct(entry, act, actEvents))) continue;
      if (exceptions.some((exception) => exception.publication === slug && normalizeTitle(exception.actTitle) === normalizeTitle(act.title))) continue;
      const entry: PublicationEntry = { title: actEntryTitle(act), citation: entryCitation(act, head) };
      if (act.kind && (NORM_TYPES as readonly string[]).includes(act.kind)) entry.type = act.kind as NormType;
      if (act.pages) entry.pages = act.pages;
      const start = firstPage(act.pages);
      if (start !== undefined) entry.startPage = start;
      if (act.documentDate && /^\d{4}-\d{2}-\d{2}$/u.test(act.documentDate)) entry.documentDate = act.documentDate;
      // Sichere Zuordnung nur über den kuratierten actSlug mit vorhandener Norm; Fassung nur, wenn sie diese Ausgabe belegt.
      const versions = act.actSlug ? await listNormVersions(root, jurisdiction, act.actSlug) : undefined;
      if (act.actSlug && versions) {
        entry.normSlug = act.actSlug;
        const fromHere = versions.filter((version) => version.publicationSlugs.includes(slug));
        if (fromHere.length === 1) entry.versionId = fromHere[0]!.versionId;
      } else {
        if (actEvents.length === 0) {
          report.problems.push(`${context}: Akt „${entry.title}“ (S. ${act.pages ?? '–'}) ohne Portalnorm und ohne zuordenbares Ledger-Ereignis – Ledger ergänzen oder Ausnahme in ${PUBLICATION_ENTRY_EXCEPTIONS_PATH}`);
          continue;
        }
        entry.ledgerEvents = actEvents.map((event) => event.id);
        const status = commonStatus(actEvents);
        if (status) entry.consolidationStatus = status;
      }
      entries.push(entry);
      change.added.push(entry);
    }
    // Stand nicht veröffentlichter Akte folgt dem Ledger (nie veraltet).
    for (const entry of entries) {
      if (entry.normSlug || !entry.ledgerEvents) continue;
      const linked = entry.ledgerEvents.map((id) => eventIds.get(id));
      if (linked.some((event) => !event)) {
        report.problems.push(`${context}: Eintrag „${entry.title}“ nennt unbekannte Ledger-Ereignisse ${entry.ledgerEvents.filter((id) => !eventIds.has(id)).join(', ')}`);
        continue;
      }
      const status = commonStatus(linked as LedgerEvent[]);
      if (status !== entry.consolidationStatus) {
        change.statusUpdates.push({ title: entry.title, from: entry.consolidationStatus, to: status });
        if (status) entry.consolidationStatus = status;
        else delete entry.consolidationStatus;
      }
    }
    // Einträge ohne Portalnorm entsprechen einem Akt der Ausgabe (Titel, Seiten, Datum).
    for (const entry of entries) {
      if (entry.normSlug) continue;
      const act = acts.find((candidate) => normalizeTitle(candidate.title) === normalizeTitle(entry.title) || normalizeTitle(actEntryTitle(candidate)) === normalizeTitle(entry.title));
      if (!act) {
        report.problems.push(`${context}: Eintrag „${entry.title}“ ohne Portalnorm entspricht keinem inventarisierten Akt der Ausgabe`);
        continue;
      }
      if ((act.pages ?? undefined) !== entry.pages) report.problems.push(`${context}: Eintrag „${entry.title}“: Seiten ${entry.pages ?? '–'} ≠ Inventar ${act.pages ?? '–'}`);
      const documentDate = act.documentDate && /^\d{4}-\d{2}-\d{2}$/u.test(act.documentDate) ? act.documentDate : undefined;
      if (documentDate !== entry.documentDate) report.problems.push(`${context}: Eintrag „${entry.title}“: Datum ${entry.documentDate ?? '–'} ≠ Inventar ${documentDate ?? '–'}`);
    }
    // Keine doppelten Einträge.
    const keys = entries.map((entry) => (entry.normSlug ? `norm:${entry.normSlug}#${entry.versionId ?? ''}#${entry.startPage ?? ''}` : `akt:${normalizeTitle(entry.title)}#${entry.startPage ?? ''}`));
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    if (duplicates.length > 0) report.problems.push(`${context}: doppelte Einträge ${[...new Set(duplicates)].join(', ')}`);

    const sorted = change.added.length > 0 ? sortEntries(entries) : entries;
    report.entries += sorted.length;
    if (sorted.length === 0 && acts.length > 0 && change.added.length === 0 && !exceptions.some((exception) => exception.publication === slug)) report.problems.push(`${context}: ${acts.length} inventarisierte Akt(e), aber keine Einträge`);
    if (change.added.length > 0 || change.statusUpdates.length > 0) {
      report.changes.push(change);
      publication.entries = sorted;
      if (options.write) {
        const value = { ...raw.get(slug)!, entries: sorted.map(orderedEntry) };
        parsePublication(value, context);
        if (await writeFileAtomic(join(root, context), `${JSON.stringify(value, null, 2)}\n`, { skipIfUnchanged: true })) report.written.push(context);
      }
    }
  }
  report.emptyAfter = [...publications.values()].filter((publication) => publication.entries.length === 0).length;
  return report;
}

/** Gate G12: Prüfung ohne Schreiben; offene Ergänzungen oder veraltete Stände sind Verstöße. */
export async function auditPublicationEntries(root: string, jurisdiction: JurisdictionId): Promise<PublicationEntryReport> {
  const report = await syncPublicationEntries(root, jurisdiction, { write: false });
  for (const change of report.changes) {
    for (const entry of change.added) report.problems.push(`content/publications/${jurisdiction}/${change.publication}.json: abgedruckter Akt „${entry.title}“ (S. ${entry.pages ?? '–'}) fehlt im Inhaltsverzeichnis (\`import:simulation:publications -- --write\`)`);
    for (const update of change.statusUpdates) report.problems.push(`content/publications/${jurisdiction}/${change.publication}.json: Stand von „${update.title}“ veraltet (${update.from ?? '–'} → ${update.to ?? '–'})`);
  }
  return report;
}

export function renderPublicationEntryLines(report: PublicationEntryReport): string[] {
  const lines = [`${report.jurisdiction}: ${report.publications} Ausgabe(n), ${report.acts} inventarisierte Akt(e), ${report.entries} Einträge · leer vorher ${report.emptyBefore}, nachher ${report.emptyAfter} · ergänzt ${report.changes.reduce((sum, change) => sum + change.added.length, 0)}, Stand aktualisiert ${report.changes.reduce((sum, change) => sum + change.statusUpdates.length, 0)}`];
  for (const change of report.changes) {
    for (const entry of change.added) lines.push(`  + ${change.publication}: S. ${entry.pages ?? '–'} ${entry.title.slice(0, 90)} → ${entry.normSlug ? `Norm ${entry.normSlug}${entry.versionId ? `@${entry.versionId}` : ''}` : `ohne Portalnorm (${entry.consolidationStatus ?? 'Stand gemischt'})`}`);
    for (const update of change.statusUpdates) lines.push(`  ~ ${change.publication}: ${update.title.slice(0, 80)}: ${update.from ?? '–'} → ${update.to ?? '–'}`);
  }
  for (const problem of report.problems) lines.push(`  ! ${problem}`);
  for (const path of report.written) lines.push(`  Geschrieben: ${path}`);
  return lines;
}
