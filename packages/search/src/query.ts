/**
 * Suchanfragen: Normalisierung, Strukturadressen („§ 3 Absatz 2“, „Art. 5“), Phrasen, Token,
 * Filter und der daraus abgeleitete Abfrageplan. Der Plan ist reine Daten: Stores (D1 oder
 * Datei) übersetzen ihn in SQL beziehungsweise In-Memory-Bewertung, ohne die Eingabe erneut
 * zu interpretieren. Übernommen und verallgemeinert aus OstRecht (packages/recht-search).
 */
import { isJurisdictionId, JURISDICTION_IDS, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { isNormStatus, isNormType, type NormStatus, type NormType } from '@landesrecht/legal-core/lib/schema.ts';
import { VERSION_TEMPORAL_KINDS, type VersionTemporalKind } from '@landesrecht/legal-core/lib/versions.ts';

export const SEARCH_SCOPES = ['all', 'title', 'body'] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];
export const SEARCH_SORTS = ['relevance', 'title', 'activity'] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];
export type VersionScope = VersionTemporalKind | 'all';

/**
 * Verknüpfung der Suchwörter im FTS-Ausdruck:
 *  - `or-prefix`: großzügiges OR aller Wörter, jedes als Präfix (Kandidaten + bm25-Rang); je Wort zusätzlich eine
 *    AND-Bedingung auf Normebene (Unterabfragen). Bei häufigen Präfixen („west“*, „das“*) läuft die Kandidatenabfrage
 *    über nahezu den ganzen Index.
 *  - `and-first`: alle Wörter müssen in derselben Sucheinheit vorkommen (Titelspalten stehen an jeder Einheit),
 *    Präfix nur implizit am letzten Wort (Tippvervollständigung) und wo `*` steht; ohne Treffer fällt der Store auf
 *    den `or-prefix`-Plan zurück (Wörter aus verschiedenen Einheiten, Präfixe auf früheren Wörtern).
 */
export const SEARCH_MATCH_MODES = ['or-prefix', 'and-first'] as const;
export type SearchMatchMode = (typeof SEARCH_MATCH_MODES)[number];
/** Standard seit der Auswertung des Golden Sets (docs/SEARCH.md): gleiche Qualität, 10–15× schneller. */
export const DEFAULT_SEARCH_MATCH_MODE: SearchMatchMode = 'and-first';

export interface SearchState {
  q: string;
  scope: SearchScope;
  jurisdictions: JurisdictionId[];
  types: NormType[];
  statuses: NormStatus[];
  subjects: string[];
  versionScope: VersionScope;
  /** Geltungstag der Simulationsachse; wählt die an diesem Tag geltende Fassung. */
  validOn?: string;
  sort: SearchSort;
  offset: number;
  limit: number;
  /** Verknüpfung der Suchwörter; fehlt der Wert, gilt DEFAULT_SEARCH_MATCH_MODE. */
  matchMode?: SearchMatchMode;
}

export interface QueryToken {
  raw: string;
  normalized: string;
  variants: string[];
  prefix: boolean;
}

export interface StructuralIntent {
  kind: 'paragraph' | 'article' | 'subsection' | 'number';
  number: string;
  subsection?: string;
}

export interface SearchQueryPlan {
  tokens: QueryToken[];
  phrases: string[];
  references: StructuralIntent[];
  /** Normalisierte Gesamtanfrage (für Identitätstreffer auf Abkürzung/Kurztitel/Titel). */
  identityVariants: string[];
  /** Gesamtanfrage nur kleingeschrieben (Umlaute erhalten): unterscheidet „LÖG West“ von „LOG West“ unter Identitätstreffern. */
  identityRaw: string;
  /** Anfrage ohne Strukturadressen und Phrasen („§ 1 LÖG West“ → „LÖG West“): Schreibvarianten und Rohform für Adresstreffer. */
  subjectVariants: string[];
  subjectRaw: string;
  scope: SearchScope;
  sort: SearchSort;
  freeText: boolean;
  matchMode: SearchMatchMode;
}

export const DEFAULT_SEARCH_LIMIT = 20;
export const MAX_SEARCH_LIMIT = 100;
export const MAX_QUERY_LENGTH = 200;

export function transliterateGermanUmlauts(value: string): string {
  return value.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue');
}

export function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase('de-DE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9*]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Normalisierung, die „ß“ behält (der FTS5-Tokenizer unicode61 faltet ß nicht zu ss). */
export function normalizeSearchTextKeepSharpS(value: string): string {
  return value
    .toLocaleLowerCase('de-DE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ß*]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Umgekehrte Transliteration („ue“ → „ü“, „ss“ → „ß“) für Eingaben ohne Umlaute; mehrdeutig, daher nur als Zusatzvariante. */
export function reverseTransliterateGermanUmlauts(value: string): string {
  return value.replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/ue/g, 'ü').replace(/Ae/g, 'Ä').replace(/Oe/g, 'Ö').replace(/Ue/g, 'Ü').replace(/AE/g, 'Ä').replace(/OE/g, 'Ö').replace(/UE/g, 'Ü');
}

/**
 * Schreibvarianten: normalisiert (ß→ss), mit erhaltenem ß, mit ae/oe/ue-Transliteration sowie – bei Eingaben mit
 * ae/oe/ue oder ss – die Rückübersetzung („Buergerentscheid“ → „burgerentscheid“ wie der Index das Wort „Bürger…“
 * ablegt; „Bussgeld“ → „bußgeld“, weil der FTS5-Tokenizer ß nicht faltet). Überflüssige Varianten treffen nichts.
 */
export function buildSearchVariants(value: string): string[] {
  const variants = [normalizeSearchText(value), normalizeSearchTextKeepSharpS(value), normalizeSearchText(transliterateGermanUmlauts(value))];
  if (/[aou]e/iu.test(value)) variants.push(normalizeSearchText(reverseTransliterateGermanUmlauts(value)));
  if (/ss/iu.test(value)) variants.push(normalizeSearchTextKeepSharpS(value.replace(/ss/giu, 'ß')));
  return [...new Set(variants.filter(Boolean))];
}

// Die Paragraphennummer endet an einer Wortgrenze: „§ 59MBG“ (fehlendes Leerzeichen der Quelle) ist keine Adresse „§ 59m“.
const PARAGRAPH_PATTERN = /§{1,2}\s*([0-9]+[a-z]?(?![\p{L}\d])(?:\s*(?:,|und)\s*[0-9]+[a-z]?(?![\p{L}\d]))*)(?:\s+(?:Abs(?:atz)?\.?)\s*([0-9]+[a-z]?))?/giu;
// Römische Artikelnummern („Art. IV“) nur als ganzes Wort, damit „Artikel vom …“ keine Adresse wird.
const ARTICLE_PATTERN = /\b(?:Artikel|Art\.)\s*([0-9]+[a-z]?|[IVXLC]+(?![\p{L}\d]))(?:\s+(?:Abs(?:atz)?\.?)\s*([0-9]+[a-z]?))?/giu;
const SUBSECTION_PATTERN = /\b(?:Absatz|Abs\.)\s*([0-9]+[a-z]?)/giu;
const NUMBER_PATTERN = /\b(?:Nr\.|Nummer|Ziffer|Ziff\.)\s*(\d{1,2}(?:\.\d{1,2}){0,5})(?![\d.]*\d)\.?/giu;

export function extractStructuralIntents(value: string): { references: StructuralIntent[]; remaining: string } {
  const references: StructuralIntent[] = [];
  const seen = new Set<string>();
  const push = (intent: StructuralIntent): void => {
    const key = `${intent.kind}:${intent.number}:${intent.subsection ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      references.push(intent);
    }
  };
  let remaining = value.replace(PARAGRAPH_PATTERN, (_match, numbers: string, subsection?: string) => {
    for (const number of numbers.split(/\s*(?:,|und)\s*/u)) {
      const intent: StructuralIntent = { kind: 'paragraph', number: number.toLowerCase().replace(/\s+/g, '') };
      if (subsection) intent.subsection = subsection.toLowerCase();
      push(intent);
    }
    return ' ';
  });
  remaining = remaining.replace(ARTICLE_PATTERN, (_match, number: string, subsection?: string) => {
    const intent: StructuralIntent = { kind: 'article', number: number.toLowerCase() };
    if (subsection) intent.subsection = subsection.toLowerCase();
    push(intent);
    return ' ';
  });
  remaining = remaining.replace(SUBSECTION_PATTERN, (_match, number: string) => {
    push({ kind: 'subsection', number: number.toLowerCase() });
    return ' ';
  });
  // „Nr. 2.3“ adressiert Nummern von Verwaltungsvorschriften – nicht als Nummer innerhalb eines Paragraphen.
  if (!references.some((intent) => intent.kind === 'paragraph' || intent.kind === 'article')) {
    remaining = remaining.replace(NUMBER_PATTERN, (_match, number: string) => {
      push({ kind: 'number', number });
      return ' ';
    });
  }
  return { references, remaining };
}

export function removeQuotedPhrases(value: string): { phrases: string[]; remaining: string } {
  const phrases: string[] = [];
  const remaining = value.replace(/"([^"]+)"|„([^“]+)“/gu, (_match, plain?: string, typographic?: string) => {
    const phrase = (plain ?? typographic ?? '').trim();
    if (phrase) phrases.push(phrase);
    return ' ';
  });
  return { phrases, remaining };
}

export function parseQueryTokens(value: string): QueryToken[] {
  const tokens: QueryToken[] = [];
  const seen = new Set<string>();
  for (const match of value.matchAll(/[\p{L}\p{N}]+\*?/gu)) {
    const raw = match[0];
    const prefix = raw.endsWith('*');
    const bare = prefix ? raw.slice(0, -1) : raw;
    const normalized = normalizeSearchText(bare);
    if (!normalized) continue;
    const key = `${normalized}:${prefix}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push({ raw: bare, normalized, variants: buildSearchVariants(bare), prefix });
  }
  return tokens;
}

/** Kürzeste Wortlänge (normalisiert), ab der das letzte Suchwort im Modus `and-first` implizit als Präfix gilt. */
export const IMPLICIT_PREFIX_MIN_LENGTH = 4;

/**
 * Wörter, die im Modus `and-first` nie implizit zum Präfix werden: Funktionswörter (ein Präfix „die“* träfe
 * „dienst“, „diese“ …) und der Landeszusatz „West“, der in nahezu jeder Abkürzung und über 23 000 Einheiten steht.
 */
export const NO_IMPLICIT_PREFIX_TOKENS: ReadonlySet<string> = new Set([
  'uber', 'ueber', 'fur', 'fuer', 'nach', 'oder', 'sowie', 'vom', 'zum', 'zur', 'des', 'der', 'die', 'das', 'und',
  'den', 'dem', 'mit', 'von', 'bei', 'aus', 'ohne', 'eine', 'einer', 'eines', 'einem', 'einen', 'durch', 'gegen',
  'west', 'westdeutschland',
]);

/** Implizites Präfix nur am letzten Wort und nur, wenn es lang genug, keine Zahl und kein Funktionswort ist. */
export function qualifiesForImplicitPrefix(token: QueryToken): boolean {
  return token.normalized.length >= IMPLICIT_PREFIX_MIN_LENGTH && !/^\d+$/u.test(token.normalized) && !NO_IMPLICIT_PREFIX_TOKENS.has(token.normalized);
}

/** Präfixpolitik des Modus `and-first`: das letzte Wort wird (sofern geeignet) zum Präfix, alle anderen bleiben exakt. */
export function applyPrefixPolicy(tokens: readonly QueryToken[], matchMode: SearchMatchMode): QueryToken[] {
  if (matchMode !== 'and-first') return [...tokens];
  return tokens.map((token, index) => (index === tokens.length - 1 && !token.prefix && qualifiesForImplicitPrefix(token) ? { ...token, prefix: true } : token));
}

/** Kleingeschrieben, Leerraum gebündelt, Diakritika erhalten (Vergleich der exakten Bezeichnung). */
export function rawIdentityKey(value: string): string {
  return value.toLocaleLowerCase('de-DE').replace(/\s+/gu, ' ').trim();
}

export function buildSearchQueryPlan(state: SearchState): SearchQueryPlan {
  const matchMode = state.matchMode ?? DEFAULT_SEARCH_MATCH_MODE;
  const { phrases, remaining: withoutPhrases } = removeQuotedPhrases(state.q);
  const { references, remaining } = extractStructuralIntents(withoutPhrases);
  const tokens = applyPrefixPolicy(parseQueryTokens(remaining), matchMode);
  return {
    tokens,
    phrases,
    references,
    identityVariants: references.length === 0 && phrases.length === 0 ? buildSearchVariants(state.q) : [],
    identityRaw: rawIdentityKey(state.q),
    subjectVariants: buildSearchVariants(remaining),
    subjectRaw: rawIdentityKey(remaining),
    scope: state.scope,
    sort: state.sort,
    freeText: tokens.length > 0 || phrases.length > 0,
    matchMode,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* FTS5-Ausdrücke (zweischichtig wie in OstRecht: großzügiges OR für rank, je Token ein AND).  */

export function ftsTerm(value: string): string {
  return `"${value.replace(/"/gu, '""')}"`;
}

/** Wortausdruck des `or-prefix`-Plans: jede Schreibvariante als Präfix. */
export function ftsTokenExpression(token: QueryToken): string {
  return `(${token.variants.map((variant) => `${ftsTerm(variant)}*`).join(' OR ')})`;
}

/** Wortausdruck des `and-first`-Plans: Präfix nur, wo die Präfixpolitik oder ein `*` es vorsieht. */
export function ftsExactTokenExpression(token: QueryToken): string {
  return `(${token.variants.map((variant) => `${ftsTerm(variant)}${token.prefix ? '*' : ''}`).join(' OR ')})`;
}

export function ftsPhraseExpression(phrase: string): string {
  return `(${buildSearchVariants(phrase).map(ftsTerm).join(' OR ')})`;
}

export function searchScopeColumns(scope: SearchScope): string | null {
  if (scope === 'title') return '{title short_title abbr}';
  if (scope === 'body') return '{label heading body}';
  return null;
}

export function buildFtsColumnMatch(columns: string | null, expression: string): string {
  return columns ? `${columns}: ${expression}` : expression;
}

/** Großzügiger OR-Ausdruck aller Begriffe; `null`, wenn die Anfrage keinen Freitext enthält. */
export function buildFtsMatch(plan: SearchQueryPlan): string | null {
  const parts = [...plan.tokens.map(ftsTokenExpression), ...plan.phrases.map(ftsPhraseExpression)];
  if (parts.length === 0) return null;
  return buildFtsColumnMatch(searchScopeColumns(plan.scope), parts.join(' OR '));
}

/**
 * Strenger AND-Ausdruck des Modus `and-first`: alle Wörter und Phrasen in derselben Einheit; `null` ohne Freitext.
 * Für Titelwörter ist das keine Einschränkung (Titel, Kurztitel und Abkürzung stehen an jeder Einheit der Norm).
 */
export function buildFtsAndMatch(plan: SearchQueryPlan): string | null {
  const parts = [...plan.tokens.map(ftsExactTokenExpression), ...plan.phrases.map(ftsPhraseExpression)];
  if (parts.length === 0) return null;
  const columns = searchScopeColumns(plan.scope);
  const expression = parts.join(' AND ');
  return columns ? `${columns}: (${expression})` : expression;
}

/**
 * Titelbeschränkter AND-Ausdruck (Titel, Kurztitel, Abkürzung) im Präfixstil des jeweiligen Plans: liefert die
 * Fassungen, deren Bezeichnung alle Suchwörter trägt (Titeltreffer), damit sie in der Kandidatenauswahl nicht hinter
 * Volltexttreffern mit vielen Nennungen verschwinden. `null` ohne Freitext oder wenn der Plan ohnehin titelbeschränkt ist.
 */
export function buildFtsTitleMatch(plan: SearchQueryPlan): string | null {
  if (!plan.freeText || plan.scope === 'title') return null;
  const tokenExpression = plan.matchMode === 'and-first' ? ftsExactTokenExpression : ftsTokenExpression;
  const parts = [...plan.tokens.map(tokenExpression), ...plan.phrases.map(ftsPhraseExpression)];
  return `${searchScopeColumns('title')}: (${parts.join(' AND ')})`;
}

/** Je Begriff ein Ausdruck; jeder muss in mindestens einer Einheit der Norm vorkommen. */
export function buildFtsConjuncts(plan: SearchQueryPlan): string[] {
  const columns = searchScopeColumns(plan.scope);
  return [
    ...plan.tokens.map((token) => buildFtsColumnMatch(columns, ftsTokenExpression(token))),
    ...plan.phrases.map((phrase) => buildFtsColumnMatch(columns, ftsPhraseExpression(phrase))),
  ];
}

/* ------------------------------------------------------------------------------------------ */
/* Zustandsparser (fail-safe: unbekannte Werte schränken nicht ein).                            */

export function parseSearchState(params: URLSearchParams): SearchState {
  const q = (params.get('q') ?? '').slice(0, MAX_QUERY_LENGTH).trim();
  const scope = params.get('scope');
  const sort = params.get('sort');
  const versionScope = params.get('versionScope');
  const validOn = params.get('validOn') ?? params.get('geltungstag');
  const matchMode = params.get('match');
  const state: SearchState = {
    q,
    scope: (SEARCH_SCOPES as readonly string[]).includes(scope ?? '') ? (scope as SearchScope) : 'all',
    jurisdictions: params.getAll('jurisdiction').flatMap((entry) => entry.split(',')).map((entry) => entry.trim()).filter(isJurisdictionId),
    types: params.getAll('type').flatMap((entry) => entry.split(',')).map((entry) => entry.trim()).filter(isNormType),
    statuses: params.getAll('status').flatMap((entry) => entry.split(',')).map((entry) => entry.trim()).filter(isNormStatus),
    subjects: [...new Set(params.getAll('subject').map((entry) => entry.trim()).filter(Boolean))].slice(0, 20),
    versionScope: versionScope === 'all' || (VERSION_TEMPORAL_KINDS as readonly string[]).includes(versionScope ?? '')
      ? (versionScope as VersionScope)
      : 'current',
    sort: (SEARCH_SORTS as readonly string[]).includes(sort ?? '') ? (sort as SearchSort) : q ? 'relevance' : 'title',
    offset: clampInteger(params.get('offset'), 0, 5000, 0),
    limit: clampInteger(params.get('limit'), 1, MAX_SEARCH_LIMIT, DEFAULT_SEARCH_LIMIT),
  };
  if (validOn && isIsoCalendarDate(validOn)) state.validOn = validOn;
  if ((SEARCH_MATCH_MODES as readonly string[]).includes(matchMode ?? '')) state.matchMode = matchMode as SearchMatchMode;
  if (state.jurisdictions.length === 0) state.jurisdictions = [...JURISDICTION_IDS];
  return state;
}

export function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function clampInteger(value: string | null, minimum: number, maximum: number, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function createSearchState(overrides: Partial<SearchState> = {}): SearchState {
  return {
    q: '',
    scope: 'all',
    jurisdictions: [...JURISDICTION_IDS],
    types: [],
    statuses: [],
    subjects: [],
    versionScope: 'current',
    sort: overrides.q ? 'relevance' : 'title',
    offset: 0,
    limit: DEFAULT_SEARCH_LIMIT,
    ...overrides,
  };
}
