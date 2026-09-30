/**
 * Listenzustand der Länder- und Änderungsseiten: Rechtsstand-Reiter (`stand`), Normtyp (`type`), Anfangsbuchstabe
 * (`buchstabe`), Seite (`seite`). Adressen sind teilbar; unbekannte Werte werden ignoriert (fail-safe wie die Suche).
 * Es gibt kein sichtbares Listenlimit: Der ganze Bestand ist über Seiten, Buchstaben und Filter erreichbar.
 */
import { ADMINISTRATIVE_REGULATION_TYPES, expandNormTypeFilter, isNormType, NORM_TYPES, type NormType } from '@landesrecht/legal-core/lib/schema.ts';
import { isSimulationChangeKind, type SimulationChangeKind } from '@landesrecht/legal-core/lib/simulation-change.ts';

export const PAGE_SIZE = 50;
export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '#'] as const;

/** Öffentliche Werte des Reiters „Rechtsstand“ in der Adresse. */
export const STAND_PARAMS: Readonly<Record<string, SimulationChangeKind>> = { changed: 'baseline-changed', new: 'simulation-new', unchanged: 'baseline-unchanged' };
export const STAND_VALUES: Readonly<Record<SimulationChangeKind, string>> = { 'baseline-changed': 'changed', 'simulation-new': 'new', 'baseline-unchanged': 'unchanged' };

export interface ListingState {
  changeKind?: SimulationChangeKind;
  type?: NormType;
  letter?: string;
  page: number;
}

export function parseListingState(params: URLSearchParams): ListingState {
  const stand = params.get('stand') ?? '';
  const type = params.get('type') ?? '';
  const letter = (params.get('buchstabe') ?? '').toUpperCase();
  const page = Number.parseInt(params.get('seite') ?? '1', 10);
  const state: ListingState = { page: Number.isFinite(page) && page > 1 ? page : 1 };
  const changeKind = STAND_PARAMS[stand] ?? (isSimulationChangeKind(stand) ? stand : undefined);
  if (changeKind) state.changeKind = changeKind;
  if (isNormType(type)) state.type = type;
  if ((LETTERS as readonly string[]).includes(letter)) state.letter = letter;
  return state;
}

/** Adresse einer Listenansicht; `page` 1 und leere Filter entfallen. */
export function listingUrl(basePath: string, state: Partial<ListingState>): string {
  const search = new URLSearchParams();
  if (state.changeKind) search.set('stand', STAND_VALUES[state.changeKind]);
  if (state.type) search.set('type', state.type);
  if (state.letter) search.set('buchstabe', state.letter);
  if (state.page && state.page > 1) search.set('seite', String(state.page));
  const query = search.toString();
  return query ? `${basePath}${basePath.includes('?') ? '&' : '?'}${query}` : basePath;
}

/** Typen einer Filterwahl (Familie der Verwaltungsvorschriften als Ganzes). */
export function listingTypes(type: NormType | undefined): NormType[] | undefined {
  return type ? expandNormTypeFilter([type]) : undefined;
}

export function isAdministrativeType(type: NormType): boolean {
  return (ADMINISTRATIVE_REGULATION_TYPES as readonly string[]).includes(type);
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/** Seitenzahlen für die Seitennavigation: erste, letzte, Umgebung der aktuellen; Lücken als `null`. */
export function pageWindow(current: number, total: number): Array<number | null> {
  const pages = new Set<number>([1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total));
  const sorted = [...pages].sort((left, right) => left - right);
  const result: Array<number | null> = [];
  for (const [index, page] of sorted.entries()) {
    if (index > 0 && page - sorted[index - 1]! > 1) result.push(null);
    result.push(page);
  }
  return result;
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Ansichtsmodell der Normliste (Reiter, Typfilter, A–Z, Seiten) – reine Daten für `NormListing.astro`.          */

export interface ListingLink {
  label: string;
  url: string;
  current: boolean;
  count?: number;
}

export interface ListingView {
  tabs: ListingLink[];
  types: ListingLink[];
  letters: Array<ListingLink & { letter: string; empty: boolean }>;
  pages: Array<{ kind: 'page'; page: number; url: string; current: boolean } | { kind: 'gap' }>;
  previousUrl?: string;
  nextUrl?: string;
  page: number;
  pageCount: number;
  firstIndex: number;
  sortedByChange: boolean;
}

export interface ListingViewInput {
  basePath: string;
  state: ListingState;
  total: number;
  byType: ReadonlyArray<{ type: NormType; count: number }>;
  byLetter: ReadonlyArray<{ letter: string; count: number }>;
  tabCounts: Record<SimulationChangeKind, number>;
  tabs: 'full' | 'changes';
  labels: { all: string; typeAll: string; administrativeFamily: string; changeKind: Record<SimulationChangeKind, string>; typeLabel: (type: NormType) => string };
}

export function buildListingView(input: ListingViewInput): ListingView {
  const { basePath, state, labels } = input;
  const url = (patch: Partial<ListingState>, reset: string[] = ['page']): string => {
    const merged: Record<string, unknown> = { ...state, ...patch };
    const next: Partial<ListingState> = {};
    for (const [key, value] of Object.entries(merged)) if (!reset.includes(key) && value !== undefined) (next as Record<string, unknown>)[key] = value;
    return listingUrl(basePath, next);
  };
  const totalAll = input.tabCounts['baseline-unchanged'] + input.tabCounts['baseline-changed'] + input.tabCounts['simulation-new'];
  const tabs: ListingLink[] = [];
  if (input.tabs === 'full') tabs.push({ label: labels.all, url: url({ changeKind: undefined }, ['page', 'letter', 'changeKind']), current: state.changeKind === undefined, count: totalAll });
  for (const kind of ['baseline-changed', 'simulation-new'] as const) tabs.push({ label: labels.changeKind[kind], url: url({ changeKind: kind }, ['page', 'letter']), current: state.changeKind === kind, count: input.tabCounts[kind] });

  const typeTotal = input.byType.reduce((sum, entry) => sum + entry.count, 0);
  const types: ListingLink[] = [];
  if (typeTotal > 0) {
    types.push({ label: labels.typeAll, url: url({}, ['page', 'type']), current: state.type === undefined, count: typeTotal });
    const counts = new Map(input.byType.map((entry) => [entry.type, entry.count]));
    for (const type of NORM_TYPES) {
      const count = counts.get(type) ?? 0;
      if (count > 0 && !isAdministrativeType(type)) types.push({ label: labels.typeLabel(type), url: url({ type }), current: state.type === type, count });
    }
    const administrative = input.byType.filter((entry) => isAdministrativeType(entry.type)).reduce((sum, entry) => sum + entry.count, 0);
    if (administrative > 0) types.push({ label: labels.administrativeFamily, url: url({ type: 'verwaltungsvorschrift' }), current: state.type === 'verwaltungsvorschrift', count: administrative });
    for (const type of NORM_TYPES) {
      const count = counts.get(type) ?? 0;
      if (count > 0 && isAdministrativeType(type) && type !== 'verwaltungsvorschrift') types.push({ label: labels.typeLabel(type), url: url({ type }), current: state.type === type, count });
    }
  }

  const letterCounts = new Map(input.byLetter.map((entry) => [entry.letter, entry.count]));
  const letters = [{ letter: '', label: 'Alle', url: url({}, ['page', 'letter']), current: state.letter === undefined, empty: false }, ...LETTERS.map((letter) => {
    const count = letterCounts.get(letter) ?? 0;
    return { letter, label: letter === '#' ? 'Ziffern und Sonstiges' : letter, url: url({ letter }), current: state.letter === letter, count, empty: count === 0 };
  })];

  const pageTotal = pageCount(input.total);
  const page = Math.min(Math.max(1, state.page), pageTotal);
  const pages: ListingView['pages'] = pageWindow(page, pageTotal).map((entry) => (entry === null ? { kind: 'gap' } : { kind: 'page', page: entry, url: url({ page: entry }, []), current: entry === page }));
  const view: ListingView = { tabs, types, letters, pages, page, pageCount: pageTotal, firstIndex: (page - 1) * PAGE_SIZE, sortedByChange: state.changeKind !== undefined };
  if (page > 1) view.previousUrl = url({ page: page - 1 }, []);
  if (page < pageTotal) view.nextUrl = url({ page: page + 1 }, []);
  return view;
}
