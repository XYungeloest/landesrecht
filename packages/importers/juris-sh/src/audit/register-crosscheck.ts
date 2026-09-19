/**
 * Unabhängige Nachrechnung des Registerabgleichs („zweite Quelle“, Readiness-Prüfung `zweite-quelle`).
 *
 * Die Inventur (`pipeline/bulk.ts`, `buildInventoryReport`) meldet je Register eine einzige Abdeckungszahl:
 * Gliederungsnummer **oder** Titelanfang, nach Ausschluss von Änderungs-/Mantelgesetzen und Tarifverträgen.
 * Dieses Modul zerlegt dieselbe Frage in getrennt ausgewiesene Stufen, damit sichtbar wird, wie viel der
 * Abdeckung auf stabilen Kennungen beruht und wie viel auf einem bloßen Titelvergleich:
 *
 *   gl           Gliederungsnummer gleich (juris führt bei VwV mehrere Nummern kommagetrennt – jede zählt)
 *   gl-variant   Gliederungsnummer gleich bis auf führende Nullen je Segment („2122-10-02“ = „2122-10-2“)
 *   (Unter derselben Nummer führt juris bei VwV oft nur die **Änderungs**bekanntmachung, nicht die Stammfassung.
 *   Tragen ausschließlich solche Dokumente die Nummer, zählt das nicht als Nummerntreffer, sondern als
 *   `gl-amendment-only` – außer Fundstelle oder Titel mit Datum belegen die Stammfassung.)
 *   fundstelle   amtliche Fundstelle gleich (Blatt, Jahrgang, Seite/Nummer) **und** Ausfertigungsdatum gleich **und**
 *                Titelähnlichkeit ≥ 0,5 (Wortmenge). Ohne die Ähnlichkeit trifft die Stufe Artikel desselben
 *                Mantelgesetzes und andere Gesetze gleichen Tages auf derselben Seite (Regressionsfall 2020-33).
 *   title-date   Titelanfang gleich (Altregel) **und** Ausfertigungs-/Erlassdatum gleich
 *   title-only   nur der Titelanfang (Altregel), kein zweites Merkmal – wird ausgewiesen, zählt aber in der
 *                strengen Abdeckung nicht als gefunden
 *   none         kein Merkmal
 *
 * Nichts hier optimiert auf eine Schwelle; es wird gemessen und ausgewiesen. Die Ausschlussregel der Inventur
 * wird nicht verändert, sondern je Kategorie mit Gegenbeispielen (Ausschluss trotz eigener juris-Fassung)
 * ausgewertet.
 */
import { REGISTER_NON_CONSOLIDATED, titleKey } from '../pipeline/bulk.ts';

export type RegisterSourceId = 'gvobl-systematische-uebersicht' | 'ab-erlassverzeichnis';
export type Area = 'landesrecht' | 'vwv';

/** Ein Registereintrag (Kopf einer Vorschrift im amtlichen Register). */
export interface RegisterRecord {
  source: RegisterSourceId;
  gliederungsnummer: string;
  title: string;
  /** Ausfertigungs-/Erlassdatum laut Register (ISO), nur wenn das Register es nennt. */
  issuedDate?: string;
  /** Fundstelle der Stammfassung laut Register („GVOBl. S. 558“, „Amtsbl. Schl.-H. 2023 S. 189“). */
  citation?: string;
  /** Eintrag hat mindestens eine Ereigniszeile, d. h. er steht im Ereignisregister (`ledger.json`). */
  inLedger: boolean;
}

/** Ein enumeriertes juris-Dokument mit den Kopfangaben der PDF-Ausgabe. */
export interface JurisDocument {
  id: string;
  area: Area;
  /** Titel, wie ihn die Inventur führt (auf 160 Zeichen gekürzt) – Grundlage der Altregel. */
  title?: string;
  /** Kopffeld „Gliederungs-Nr“ (roh; bei VwV oft mehrere Nummern, kommagetrennt). */
  gliederungsnummer?: string;
  /** Ausfertigungsdatum, Neugefasst, Erlassdatum (ISO). */
  dates: string[];
  /** Kopffeld „Fundstelle“ (juris-Schreibweise, z. B. „GVOBl. 2017, 558“, „Amtsbl SH 2023, 613“). */
  fundstelle?: string;
  outcome?: string;
}

export const MATCH_TIERS = ['gl', 'gl-variant', 'fundstelle', 'title-date', 'gl-amendment-only', 'title-only', 'none'] as const;
export type MatchTier = (typeof MATCH_TIERS)[number];
/** Stufen, die in der strengen Abdeckung als „gefunden“ zählen. */
export const STRICT_TIERS: readonly MatchTier[] = ['gl', 'gl-variant', 'fundstelle', 'title-date'];

export const EXCLUSION_CATEGORIES = ['aenderung', 'aufhebung', 'bereinigung', 'neuregelung-neuordnung', 'anpassung', 'neufassung', 'tarifvertrag'] as const;
export type ExclusionCategory = (typeof EXCLUSION_CATEGORIES)[number];

/* ------------------------------------------------------------------------------------ Kennungen */

/** Wie `normalizeGliederungsnummer` der Inventur: ohne Leerraum, Großbuchstaben. */
export function glKey(value: string): string {
  return value.replace(/\s+/gu, '').toUpperCase();
}

/** Zusätzlich führende Nullen je Zahlensegment entfernt („2122-10-02“ → „2122-10-2“). */
export function glVariantKey(value: string): string {
  return glKey(value).replace(/(^|[^0-9])0+(?=[0-9])/gu, '$1');
}

/**
 * Gliederungsnummern eines juris-Kopfs. VwV führen oft mehrere, kommagetrennt („5602-1, 341.2“): die
 * Aktenplannummer des Ressorts und die Nummer des Erlassverzeichnisses. Die Inventur vergleicht den ganzen
 * String und verfehlt damit jede solche VwV über die Nummer.
 */
export function splitGliederungsnummern(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;]/u)
    .map((part) => part.trim())
    .filter((part) => part !== '' && part !== '-' && part !== '0' && !/keine Angaben/iu.test(part));
}

/* ------------------------------------------------------------------------------------ Fundstellen */

export interface CitationKey {
  gazette: 'gvobl' | 'amtsbl' | 'gs';
  year?: string;
  /** Seite oder Nummer (elektronische Ausgabe), jeweils ohne führende Nullen. */
  locator: string;
  kind: 'page' | 'number';
}

const strip = (value: string): string => value.replace(/^0+(?=\d)/u, '');

function gazetteOf(text: string): CitationKey['gazette'] | undefined {
  if (/^\s*GVOBl\b/u.test(text)) return 'gvobl';
  if (/^\s*Amtsbl\b/u.test(text)) return 'amtsbl';
  if (/^\s*GS\b/u.test(text)) return 'gs';
  return undefined;
}

/**
 * Fundstelle des Registers. Das Register nennt den Jahrgang nur, wenn er vom Ausfertigungsjahr abweicht
 * („GVOBl. 2019 S. 8“ für eine LVO vom 4.12.2018); sonst gilt das Ausfertigungsjahr. Elektronische Ausgaben:
 * „GVOBl. 2024/128“.
 */
export function parseRegisterCitation(citation: string | undefined, issuedDate: string | undefined): CitationKey | undefined {
  if (!citation) return undefined;
  const gazette = gazetteOf(citation);
  if (!gazette) return undefined;
  const electronic = /(\d{4})\/(\d{1,4})\b/u.exec(citation);
  if (electronic) return { gazette, year: electronic[1]!, locator: strip(electronic[2]!), kind: 'number' };
  const page = /(?:(\d{4})\s+)?S\.\s*(\d{1,4})/u.exec(citation);
  if (!page) return undefined;
  const year = page[1] ?? issuedDate?.slice(0, 4);
  return { gazette, ...(year ? { year } : {}), locator: strip(page[2]!), kind: 'page' };
}

/** Fundstelle des juris-Kopfs: „GVOBl. 2017, 558“, „Amtsbl SH 2023, 613“, „GVOBl. 2024, Nr. 12“, „GS. 1920, 543“. */
export function parseJurisFundstelle(fundstelle: string | undefined): CitationKey | undefined {
  if (!fundstelle) return undefined;
  const gazette = gazetteOf(fundstelle);
  if (!gazette) return undefined;
  const numbered = /(\d{4}),\s*Nr\.\s*(\d{1,4})/u.exec(fundstelle);
  if (numbered) return { gazette, year: numbered[1]!, locator: strip(numbered[2]!), kind: 'number' };
  const paged = /(\d{4}),\s*(?:S\.\s*)?(\d{1,4})\b/u.exec(fundstelle);
  if (!paged) return undefined;
  return { gazette, year: paged[1]!, locator: strip(paged[2]!), kind: 'page' };
}

export function sameCitation(left: CitationKey | undefined, right: CitationKey | undefined): boolean {
  if (!left || !right || left.year === undefined || right.year === undefined) return false;
  return left.gazette === right.gazette && left.year === right.year && left.kind === right.kind && left.locator === right.locator;
}

/* ------------------------------------------------------------------------------------ Titel */

/** Wortmengen-Ähnlichkeit (Jaccard über Wörter ab vier Zeichen) – nur als Zusatzmerkmal der Fundstellenstufe. */
export function titleSimilarity(left: string, right: string): number {
  const words = (value: string): Set<string> => new Set(value.toLowerCase().replace(/ß/gu, 'ss').split(/[^a-z0-9äöü]+/u).filter((word) => word.length >= 4));
  const a = words(left);
  const b = words(right);
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

export const FUNDSTELLE_MIN_SIMILARITY = 0.5;

/** Altregel der Inventur (`bulk.ts`): Titelschlüssel ≥ 25 Zeichen, einer ist Anfang des anderen. */
export const LEGACY_TITLE_MIN_KEY = 25;

export function legacyTitleMatch(registerTitle: string, documentTitle: string): boolean {
  const key = titleKey(registerTitle);
  const candidate = titleKey(documentTitle);
  return key.length >= LEGACY_TITLE_MIN_KEY && (candidate.startsWith(key) || key.startsWith(candidate));
}

/**
 * Titel eines Änderungs-, Ergänzungs- oder Verlängerungsakts („Änderung der Richtlinie …“, „2. Änderung …“,
 * „Verlängerung der Geltungsdauer …“). Ein solches juris-Dokument unter der Nummer einer Stamm-VwV belegt
 * nicht, dass juris die Stammfassung führt.
 */
export const AMENDING_INSTRUMENT = /^(?:\d+\.\s*|(?:Erste|Zweite|Dritte|Vierte|Fünfte)\s+)?(?:Änderung(?:en)?|Ergänzung(?:en)?|Verlängerung|Berichtigung|Aufhebung|Neufassung des Erlasses|Richtlinien? zur Änderung)\b/u;

export function isAmendingInstrument(title: string | undefined): boolean {
  return title !== undefined && AMENDING_INSTRUMENT.test(title.trim());
}

/* ------------------------------------------------------------------------------------ Ausschlüsse */

/**
 * Kategorie der Ausschlussregel `REGISTER_NON_CONSOLIDATED` (Inventur). Die Regel selbst bleibt die der
 * Inventur; hier wird nur benannt, welcher Zweig gegriffen hat, damit jede Kategorie für sich geprüft werden kann.
 */
export function exclusionCategory(title: string): ExclusionCategory | undefined {
  if (!REGISTER_NON_CONSOLIDATED.test(title)) return undefined;
  if (/^(?:Tarifvertr|Bundes-Angestelltentarifvertrag|Manteltarifvertrag|Lohngruppenverzeichnis|Änderungstarifvertrag)/u.test(title)) return 'tarifvertrag';
  const verb = /(?:zur|über die)\s+(Änderung|Aufhebung|Bereinigung|Neuregelung|Neuordnung|Anpassung|Neufassung)\b/u.exec(title)?.[1];
  switch (verb) {
    case 'Änderung':
      return 'aenderung';
    case 'Aufhebung':
      return 'aufhebung';
    case 'Bereinigung':
      return 'bereinigung';
    case 'Neuregelung':
    case 'Neuordnung':
      return 'neuregelung-neuordnung';
    case 'Anpassung':
      return 'anpassung';
    case 'Neufassung':
      return 'neufassung';
    default:
      return undefined;
  }
}

/* ------------------------------------------------------------------------------------ Abgleich */

export interface EntryMatch {
  record: RegisterRecord;
  exclusion?: ExclusionCategory;
  tier: MatchTier;
  /** Treffer der Altregel (Nummer oder Titelanfang, ohne weiteres Merkmal) – zur Nachrechnung der Inventur. */
  legacyFound: boolean;
  /** Altregel traf über die (ungeteilte) Nummer; sonst, bei `legacyFound`, allein über den Titelanfang. */
  legacyByNumber: boolean;
  /** Kennungen der Dokumente, die die maßgebliche Stufe tragen. */
  documentIds: string[];
  /** Dokumente, die nur über den Titelanfang (Altregel) passen – unabhängig von der Stufe. */
  titleCandidates: string[];
}

export interface DocumentIndex {
  area: Area;
  documents: JurisDocument[];
  byGl: Map<string, JurisDocument[]>;
  byGlVariant: Map<string, JurisDocument[]>;
  citations: Array<{ document: JurisDocument; key: CitationKey }>;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function buildDocumentIndex(documents: readonly JurisDocument[], area: Area): DocumentIndex {
  const own = documents.filter((document) => document.area === area);
  const byGl = new Map<string, JurisDocument[]>();
  const byGlVariant = new Map<string, JurisDocument[]>();
  const citations: DocumentIndex['citations'] = [];
  for (const document of own) {
    for (const number of splitGliederungsnummern(document.gliederungsnummer)) {
      push(byGl, glKey(number), document);
      push(byGlVariant, glVariantKey(number), document);
    }
    const key = parseJurisFundstelle(document.fundstelle);
    if (key) citations.push({ document, key });
  }
  return { area, documents: own, byGl, byGlVariant, citations };
}

/** Altregel der Inventur, Nummernteil: ganzer Kopf-String normalisiert (ohne Aufteilung an Kommas). */
function legacyGlSet(index: DocumentIndex): Set<string> {
  return new Set(index.documents.filter((document) => document.gliederungsnummer).map((document) => glKey(document.gliederungsnummer!)));
}

export function matchRegisterEntry(record: RegisterRecord, index: DocumentIndex, legacyNumbers: Set<string> = legacyGlSet(index)): EntryMatch {
  const exclusion = exclusionCategory(record.title);
  const titleCandidates = index.documents.filter((document) => document.title && legacyTitleMatch(record.title, document.title));
  const legacyByNumber = legacyNumbers.has(glKey(record.gliederungsnummer));
  const legacyFound = legacyByNumber || titleCandidates.length > 0;
  const base = { record, ...(exclusion ? { exclusion } : {}), legacyFound, legacyByNumber, titleCandidates: titleCandidates.map((document) => document.id) };
  const ids = (list: readonly JurisDocument[]): string[] => [...new Set(list.map((document) => document.id))];

  // Nummerntreffer, die nur aus Änderungsakten bestehen, während der Registertitel selbst keiner ist.
  const registerIsAmending = isAmendingInstrument(record.title) || exclusion !== undefined;
  const substantive = (list: readonly JurisDocument[]): JurisDocument[] => (registerIsAmending ? [...list] : list.filter((document) => !isAmendingInstrument(document.title)));
  const byGl = index.byGl.get(glKey(record.gliederungsnummer)) ?? [];
  if (substantive(byGl).length > 0) return { ...base, tier: 'gl', documentIds: ids(substantive(byGl)) };
  const byVariant = index.byGlVariant.get(glVariantKey(record.gliederungsnummer)) ?? [];
  if (substantive(byVariant).length > 0) return { ...base, tier: 'gl-variant', documentIds: ids(substantive(byVariant)) };
  const amendmentOnly = byGl.length > 0 ? byGl : byVariant;

  const citation = parseRegisterCitation(record.citation, record.issuedDate);
  if (citation && record.issuedDate) {
    const byCitation = index.citations
      .filter((entry) => sameCitation(citation, entry.key) && entry.document.dates.includes(record.issuedDate!) && titleSimilarity(record.title, entry.document.title ?? '') >= FUNDSTELLE_MIN_SIMILARITY)
      .map((entry) => entry.document);
    if (byCitation.length > 0) return { ...base, tier: 'fundstelle', documentIds: ids(byCitation) };
  }
  if (record.issuedDate) {
    const dated = titleCandidates.filter((document) => document.dates.includes(record.issuedDate!));
    if (dated.length > 0) return { ...base, tier: 'title-date', documentIds: ids(dated) };
  }
  if (amendmentOnly.length > 0) return { ...base, tier: 'gl-amendment-only', documentIds: ids(amendmentOnly) };
  if (titleCandidates.length > 0) return { ...base, tier: 'title-only', documentIds: ids(titleCandidates) };
  return { ...base, tier: 'none', documentIds: [] };
}

/* ------------------------------------------------------------------------------------ Kennzahlen */

export interface CoverageFigures {
  /** Einträge nach Ausschluss (Nenner). */
  considered: number;
  /** Anzahl je Stufe (nur nicht ausgeschlossene Einträge). */
  byTier: Record<MatchTier, number>;
  /** Nur Gliederungsnummer (gl, ohne reine Änderungsakt-Treffer), die ehrliche Untergrenze. */
  idOnly: { found: number; rate: number };
  /** Nummer in irgendeinem juris-Dokument, auch wenn es nur Änderungsakte sind (gl + gl-amendment-only). */
  glRaw: { found: number; rate: number };
  /** Stabile Kennung: gl + gl-variant + fundstelle. */
  stableId: { found: number; rate: number };
  /** Streng: stabile Kennung + Titel mit gleichem Datum. */
  strict: { found: number; rate: number };
  /** Altregel der Inventur (Nummer ganz oder Titelanfang). */
  legacy: { found: number; rate: number };
  /** Titel-only-Anteil der Altregel: gefunden nur über den Titelanfang, nicht über die Nummer. */
  legacyTitleOnly: number;
}

const rate = (found: number, total: number): number => (total === 0 ? 0 : Math.round((found / total) * 10_000) / 10_000);

export function coverage(matches: readonly EntryMatch[]): CoverageFigures {
  const considered = matches.filter((match) => !match.exclusion);
  const byTier = Object.fromEntries(MATCH_TIERS.map((tier) => [tier, 0])) as Record<MatchTier, number>;
  for (const match of considered) byTier[match.tier] += 1;
  const count = (tiers: readonly MatchTier[]): number => considered.filter((match) => tiers.includes(match.tier)).length;
  const legacy = considered.filter((match) => match.legacyFound).length;
  const legacyTitleOnly = considered.filter((match) => match.legacyFound && !match.legacyByNumber).length;
  return {
    considered: considered.length,
    byTier,
    idOnly: { found: byTier.gl, rate: rate(byTier.gl, considered.length) },
    glRaw: { found: byTier.gl + byTier['gl-amendment-only'], rate: rate(byTier.gl + byTier['gl-amendment-only'], considered.length) },
    stableId: { found: count(['gl', 'gl-variant', 'fundstelle']), rate: rate(count(['gl', 'gl-variant', 'fundstelle']), considered.length) },
    strict: { found: count(STRICT_TIERS), rate: rate(count(STRICT_TIERS), considered.length) },
    legacy: { found: legacy, rate: rate(legacy, considered.length) },
    legacyTitleOnly,
  };
}

export interface ExclusionFigures {
  category: ExclusionCategory;
  entries: number;
  /** Gegenbeispiele: Eintrag ausgeschlossen, juris führt aber ein Dokument mit derselben Nummer. */
  withOwnJurisDocument: number;
  /** Ausgeschlossen, und kein Merkmal (auch kein Titel) trifft ein juris-Dokument. */
  withoutAnyMatch: number;
  examples: Array<{ gliederungsnummer: string; title: string; documentIds: string[] }>;
}

export function exclusionFigures(matches: readonly EntryMatch[]): ExclusionFigures[] {
  return EXCLUSION_CATEGORIES.map((category) => {
    const own = matches.filter((match) => match.exclusion === category);
    const counter = own.filter((match) => match.tier === 'gl' || match.tier === 'gl-variant' || match.tier === 'fundstelle');
    return {
      category,
      entries: own.length,
      withOwnJurisDocument: counter.length,
      withoutAnyMatch: own.filter((match) => match.tier === 'none').length,
      examples: counter.map((match) => ({ gliederungsnummer: match.record.gliederungsnummer, title: match.record.title.slice(0, 140), documentIds: match.documentIds })),
    };
  }).filter((entry) => entry.entries > 0);
}
