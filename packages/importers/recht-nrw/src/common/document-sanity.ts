/**
 * DocumentIdentityAndBodySanityCheck: Gehört der tatsächliche Dokumentkörper zur behaupteten Vorschrift?
 *
 * Läuft nach Fetch/Parse, vor der endgültigen Normativitätsentscheidung und vor dem Schreiben einer Norm.
 * Nicht URL oder Portaltyp entscheiden, sondern ob Portaltitel, eingebetteter Dokumenttitel, Erlasskopf,
 * Fundstelle, Datum, Aktenzeichen und Normkörper plausibel dasselbe amtliche Regelwerk bilden.
 *
 * Gesetzgebungsmaterialien (Gesetzentwurf, Drucksache, Beschlussempfehlung, Vorblatt, A. Problem /
 * B. Lösung, Begründung mit Allgemeinem/Besonderem Teil, „Zu § …“) werden erkannt – aber nie allein als
 * Ausschlussgrund gewertet: Begriffe im Fließtext zählen kaum, Überschriften zählen, und ein amtlicher
 * Erlass- oder Verkündungsbeleg (Erlasskopf, Ministerialblatt-Fundstelle, Erlassformel „ergehen folgende
 * Verwaltungsvorschriften“, Eingangsformel eines Gesetzes) überwiegt eine kommentarartige Gliederung.
 * Regressionstest: VV zum Landeshundegesetz (Allgemeiner/Besonderer Teil, „Zu § …“) ist `consistent`.
 *
 *   consistent  keine Zweifel
 *   review      Zweifel (Datums-/Aktenzeichenwiderspruch, schwache Titelübereinstimmung ohne Erlassbeleg,
 *               Materialienstruktur trotz Erlassbeleg, fast leerer Normkörper) → Review-Queue
 *   mismatch    anderes Dokument eingebettet (Titel widersprechen) oder Materialien ohne jeden Erlassbeleg
 *               → blockiert
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';

export type DocumentSanityStatus = 'consistent' | 'review' | 'mismatch';

export interface SanitySignal {
  code: string;
  kind: 'identity' | 'materials' | 'enactment' | 'date' | 'reference' | 'structure';
  effect: 'supports' | 'doubts' | 'contradicts';
  message: string;
}

export interface DocumentSanityInput {
  sourceArea: 'lrgv' | 'lrmb';
  portalType: string;
  /** Titel der Portalseite (`<h1>`). */
  portalTitle: string;
  /** Titelzeilen im eingebetteten Dokument (Legacy-Datei, LRMB-Kopf). */
  documentTitleLines?: readonly string[];
  head?: { decreeKind?: string; decreeText?: string; issuingAuthorityText?: string; fileReference?: string; issuedOn?: string };
  /** Erlassangabe aus dem Portaltitel (Altdatensätze). */
  titleDecree?: { issuedOn?: string; fileReference?: string };
  infoboxIssuedOn?: string;
  /** Fundstelle der Stammfassung (Fundstellenverlauf) oder Verkündungsangabe der Infobox. */
  baseCitation?: string;
  /** Ministerialblatt-Einträge, die die Vorschrift nachweislich (Datum + Fundstelle) nennen. */
  identifiedGazetteEntries?: number;
  blocks: readonly NormBodyBlock[];
  attachments?: ReadonlyArray<{ label: string; mediaType: string }>;
}

export interface DocumentSanityResult {
  status: DocumentSanityStatus;
  signals: SanitySignal[];
  materials: { structural: boolean; headingMarkers: string[]; textMarkers: string[] };
  enactment: { strong: string[]; supporting: string[] };
  titleSimilarity?: number;
  findings: ImportFinding[];
}

const STOPWORDS = new Set(['und', 'oder', 'des', 'der', 'die', 'das', 'dem', 'den', 'für', 'fuer', 'zur', 'zum', 'über', 'ueber', 'von', 'vom', 'mit', 'nach', 'bei', 'auf', 'aus', 'einer', 'eines', 'einem', 'sowie', 'land', 'landes', 'nordrhein', 'westfalen', 'nrw', 'vom', 'fassung', 'bekanntmachung', 'neufassung',
  // Allgemeine Dokumenttypwörter tragen keine Identität („Verwaltungsvorschriften zum …“ gegen „Verwaltungsvorschriften zur …“).
  'allgemeine', 'allgemeinen', 'verwaltungsvorschrift', 'verwaltungsvorschriften', 'gesetz', 'gesetzes', 'verordnung', 'rechtsverordnung', 'runderlass', 'runderlasses', 'erlass', 'erlasses', 'richtlinie', 'richtlinien', 'bestimmungen', 'vorschriften', 'hinweise', 'durchfuehrung', 'ausfuehrung', 'aenderung']);

export function significantTokens(value: string): Set<string> {
  const normalized = value.toLocaleLowerCase('de-DE').replace(/ä/gu, 'ae').replace(/ö/gu, 'oe').replace(/ü/gu, 'ue').replace(/ß/gu, 'ss');
  return new Set((normalized.match(/[a-z0-9]{4,}/gu) ?? []).filter((token) => !STOPWORDS.has(token) && !/^\d+$/u.test(token)));
}

/**
 * Flexionsvarianten („Landeshundegesetz“/„Landeshundegesetzes“, „Verwaltungsvorschrift“/„…vorschriften“)
 * gelten als dasselbe Wort; ein bloß gemeinsamer Wortanfang zusammengesetzter Wörter („Landes…“) nicht.
 * Der gemeinsame Anfang muss das kürzere Wort bis auf höchstens drei Zeichen abdecken.
 */
function sameWordStem(token: string, other: string): boolean {
  if (token.length < 6 || other.length < 6) return false;
  const length = Math.max(6, Math.min(token.length, other.length) - 3);
  return token.slice(0, length) === other.slice(0, length);
}

/** Überlappungskoeffizient der signifikanten Wörter (0 … 1). */
export function titleOverlap(left: string, right: string): { similarity: number; comparable: boolean } {
  const a = significantTokens(left);
  const b = significantTokens(right);
  const smaller = Math.min(a.size, b.size);
  // Nach Entfernen der Typwörter reicht ein identitätstragendes Wort („Landeshundegesetz“) für den Vergleich.
  if (smaller < 1) return { similarity: 1, comparable: false };
  let shared = 0;
  for (const token of a) if (b.has(token) || [...b].some((other) => sameWordStem(token, other))) shared += 1;
  return { similarity: shared / smaller, comparable: true };
}

interface TextEntry {
  text: string;
  heading: boolean;
}

/** §-/Artikel-Einheit: ihre Überschrift („§ 5 Begründung“) ist Normtext, keine Gliederung eines Materialiendokuments. */
const isLegalUnit = (block: NormBodyBlock): boolean => (block.type === 'paragraph' || block.type === 'article') && /^(?:§|Art)/u.test(block.label ?? '');

function collectTexts(blocks: readonly NormBodyBlock[], output: TextEntry[] = []): TextEntry[] {
  for (const block of blocks) {
    if (block.title) output.push({ text: block.title, heading: !isLegalUnit(block) });
    if (block.label && /[A-Za-zÄÖÜäöü]{3,}/u.test(block.label)) output.push({ text: block.label, heading: true });
    if (block.text) output.push({ text: block.text, heading: block.type === 'heading' || (block.text.length <= 90 && !/[.;:]\s*$/u.test(block.text.trim())) });
    if (block.children) collectTexts(block.children, output);
  }
  return output;
}

const HEADING_MARKERS: ReadonlyArray<{ code: string; pattern: RegExp }> = [
  { code: 'gesetzentwurf', pattern: /^(?:Gesetzentwurf|Gesetzesentwurf|Entwurf\s+eines\s+Gesetzes)\b/u },
  { code: 'beschlussempfehlung', pattern: /^Beschlussempfehlung\b/u },
  { code: 'ausschussbericht', pattern: /^Bericht\s+des\s+[\p{L}\s-]*Ausschusses\b/u },
  { code: 'vorblatt', pattern: /^Vorblatt$/u },
  { code: 'problem', pattern: /^A\.?\s+Problem(?:\s+und\s+Ziel)?$/u },
  { code: 'loesung', pattern: /^B\.?\s+Lösung$/u },
  { code: 'alternativen', pattern: /^C\.?\s+Alternativen$/u },
  { code: 'kosten', pattern: /^D\.?\s+(?:Kosten|Gesetzesfolgen|Haushaltsausgaben)\b/u },
  { code: 'begruendung', pattern: /^(?:[A-Z]\.\s+)?(?:Begründung|Einzelbegründung)$/u },
  { code: 'allgemeiner-teil', pattern: /^(?:(?:[A-Z]|[IVX]+)\.\s+)?Allgemeiner\s+Teil$/u },
  { code: 'besonderer-teil', pattern: /^(?:(?:[A-Z]|[IVX]+)\.\s+)?Besonderer\s+Teil$/u },
  { code: 'zu-paragraph', pattern: /^Zu\s+(?:§|Artikel|Art\.)\s*\d/u },
];

const TEXT_MARKERS: ReadonlyArray<{ code: string; pattern: RegExp }> = [
  { code: 'drucksache', pattern: /\b(?:Landtags)?[Dd]rucksache\s+\d+\/\d+/u },
  { code: 'landtag-wolle-beschliessen', pattern: /\bDer\s+Landtag\s+wolle\s+beschließen\b/u },
  { code: 'landesregierung-legt-entwurf', pattern: /\bDie\s+Landesregierung\s+(?:legt|bringt)\s+[^.]{0,120}\bEntwurf\b/u },
];

const LRGV_ENACTMENT: readonly RegExp[] = [
  /\bhat\s+(?:am\s+[^,]{3,40}\s+)?(?:das\s+folgende|folgendes|folgendes\s+verfassungsändernde)\s+Gesetz\s+beschlossen\b/u,
  /\b(?:verordnet|verordnen|wird\s+verordnet|werden\s+verordnet)\b/u,
  /\bwird\s+(?:nachstehend\s+)?der\s+Wortlaut\s+[^.]{0,200}\bbekannt\s*gemacht\b/u,
  /\bDas\s+vorstehende\s+Gesetz\s+wird\s+hiermit\s+verkündet\b/u,
];

const LRMB_ENACTMENT: readonly RegExp[] = [
  /\b(?:ergehen|ergeht|erlasse|erlassen|werden|wird)\s+(?:ich\s+|hiermit\s+)*(?:die\s+)?folgende[n]?\s+(?:allgemeine[n]?\s+)?(?:Verwaltungsvorschrift(?:en)?|Richtlinie[n]?|Bestimmungen|Grundsätze|Regelungen)\b/u,
  /\b(?:Dieser|Diese|Der|Die)\s+(?:Runderlass|Erlass|Verwaltungsvorschrift(?:en)?|Richtlinie[n]?|Bestimmungen|Durchführungserlass)\b[^.]{0,160}\b(?:tritt|treten)\b[^.]{0,120}\bin\s+Kraft\b/u,
  /\b(?:Hiermit\s+)?(?:bestimme|erlasse|gebe)\s+ich\b/u,
];

function normalizeReference(value: string | undefined): string | undefined {
  return value?.replace(/[\s–—-]+/gu, '').toLowerCase() || undefined;
}

export function checkDocumentIdentityAndBody(input: DocumentSanityInput): DocumentSanityResult {
  const signals: SanitySignal[] = [];
  const texts = collectTexts(input.blocks);
  const bodyText = texts.map((entry) => entry.text).join(' ').replace(/\s+/gu, ' ');

  // --- Materialien ------------------------------------------------------------------------------
  const headingMarkers = new Set<string>();
  for (const entry of texts.filter((candidate) => candidate.heading)) {
    const text = entry.text.replace(/\s+/gu, ' ').trim();
    for (const marker of HEADING_MARKERS) if (marker.pattern.test(text)) headingMarkers.add(marker.code);
  }
  const textMarkers = new Set<string>();
  for (const marker of TEXT_MARKERS) if (marker.pattern.test(bodyText)) textMarkers.add(marker.code);
  const has = (code: string): boolean => headingMarkers.has(code);
  const structural = has('gesetzentwurf') || has('beschlussempfehlung') || has('vorblatt') || has('ausschussbericht') || (has('problem') && has('loesung')) || (has('begruendung') && (has('allgemeiner-teil') || has('besonderer-teil') || has('zu-paragraph'))) || textMarkers.has('landtag-wolle-beschliessen') || textMarkers.has('landesregierung-legt-entwurf');
  const commentaryStructure = !structural && (has('allgemeiner-teil') || has('besonderer-teil') || has('zu-paragraph'));
  if (structural) signals.push({ code: 'materials-structure', kind: 'materials', effect: 'doubts', message: `Gliederung eines Gesetzgebungsmaterials (${[...headingMarkers, ...textMarkers].join(', ')})` });
  else if (commentaryStructure) signals.push({ code: 'commentary-structure', kind: 'materials', effect: 'doubts', message: `Erläuternde Gliederung (${[...headingMarkers].join(', ')}), für Verwaltungsvorschriften zu Gesetzen üblich` });
  if (textMarkers.has('drucksache') && !structural) signals.push({ code: 'drucksache-reference', kind: 'materials', effect: 'supports', message: 'Drucksachenverweis im Fließtext (kein Hinweis auf ein Materialiendokument)' });

  // --- Erlass- und Verkündungsbelege --------------------------------------------------------------
  const strong: string[] = [];
  const supporting: string[] = [];
  const formulas = input.sourceArea === 'lrgv' ? LRGV_ENACTMENT : LRMB_ENACTMENT;
  const formula = formulas.map((pattern) => pattern.exec(bodyText)?.[0]).find(Boolean);
  if (formula) strong.push(`Erlass-/Eingangsformel „${formula.slice(0, 120)}“`);
  if (input.head?.decreeKind && input.head.issuingAuthorityText) strong.push(`Erlasskopf „${(input.head.decreeText ?? `${input.head.decreeKind} ${input.head.issuingAuthorityText}`).slice(0, 120)}“`);
  if ((input.identifiedGazetteEntries ?? 0) > 0) strong.push(`${input.identifiedGazetteEntries} Ministerialblatt-Eintrag/Einträge nennen die Vorschrift mit Datum und Fundstelle`);
  if (input.baseCitation) supporting.push(`Fundstelle ${input.baseCitation}`);
  if (input.titleDecree?.issuedOn) supporting.push('Erlassangabe im Portaltitel');
  const units = input.blocks.flatMap(function flatten(block): NormBodyBlock[] { return [block, ...(block.children ?? []).flatMap(flatten)]; }).filter((block) => block.type === 'paragraph' || block.type === 'article');
  if (input.sourceArea === 'lrgv' && units.length > 0) supporting.push(`${units.length} §/Artikel-Einheiten`);
  for (const entry of strong) signals.push({ code: 'enactment-strong', kind: 'enactment', effect: 'supports', message: entry });
  for (const entry of supporting) signals.push({ code: 'enactment-supporting', kind: 'enactment', effect: 'supports', message: entry });

  // --- Titelidentität ----------------------------------------------------------------------------
  let titleSimilarity: number | undefined;
  let titleContradiction = false;
  let titleWeak = false;
  const documentTitle = (input.documentTitleLines ?? []).join(' ').replace(/\s+/gu, ' ').trim();
  if (documentTitle) {
    const overlap = titleOverlap(input.portalTitle, documentTitle);
    if (overlap.comparable) {
      titleSimilarity = Math.round(overlap.similarity * 100) / 100;
      if (overlap.similarity >= 0.5) signals.push({ code: 'title-consistent', kind: 'identity', effect: 'supports', message: `Portaltitel und Dokumenttitel stimmen überein (${titleSimilarity})` });
      else if (overlap.similarity < 0.2) {
        titleContradiction = true;
        signals.push({ code: 'title-contradiction', kind: 'identity', effect: 'contradicts', message: `Eingebettetes Dokument „${documentTitle.slice(0, 120)}“ passt nicht zum Portaltitel „${input.portalTitle.slice(0, 120)}“ (${titleSimilarity})` });
      } else {
        titleWeak = true;
        signals.push({ code: 'title-weak', kind: 'identity', effect: 'doubts', message: `Portaltitel und Dokumenttitel stimmen nur teilweise überein (${titleSimilarity})` });
      }
    }
  }

  // --- Datum und Aktenzeichen --------------------------------------------------------------------
  const dates = [input.head?.issuedOn, input.titleDecree?.issuedOn, input.infoboxIssuedOn].filter((value): value is string => Boolean(value));
  if (new Set(dates).size > 1) signals.push({ code: 'date-conflict', kind: 'date', effect: 'doubts', message: `Widersprüchliche Ausgabedaten (${[...new Set(dates)].join(' / ')})` });
  else if (dates.length > 1) signals.push({ code: 'date-consistent', kind: 'date', effect: 'supports', message: `Ausgabedatum übereinstimmend ${dates[0]}` });
  const references = [normalizeReference(input.head?.fileReference), normalizeReference(input.titleDecree?.fileReference)].filter((value): value is string => Boolean(value));
  if (references.length === 2 && references[0] !== references[1] && !references[0]!.includes(references[1]!) && !references[1]!.includes(references[0]!)) signals.push({ code: 'file-reference-conflict', kind: 'reference', effect: 'doubts', message: `Aktenzeichen im Kopf (${input.head?.fileReference}) und im Titel (${input.titleDecree?.fileReference}) weichen ab` });

  // --- Struktur ------------------------------------------------------------------------------------
  const nearlyEmpty = bodyText.length < 150 && (input.attachments?.length ?? 0) === 0;
  if (nearlyEmpty) signals.push({ code: 'body-nearly-empty', kind: 'structure', effect: 'doubts', message: `Normkörper nahezu leer (${bodyText.length} Zeichen) ohne Anlagen` });
  if (input.sourceArea === 'lrgv' && units.length === 0 && !formula && ['gesetz', 'rechtsverordnung'].includes(input.portalType)) signals.push({ code: 'no-legal-units', kind: 'structure', effect: 'doubts', message: 'Gesetz/Rechtsverordnung ohne §/Artikel-Einheiten und ohne Eingangsformel' });

  // --- Entscheidung ---------------------------------------------------------------------------------
  const enacted = strong.length > 0;
  let status: DocumentSanityStatus = 'consistent';
  const reasons: string[] = [];
  if (titleContradiction) {
    status = 'mismatch';
    reasons.push('eingebettetes Dokument gehört nicht zum Portaltitel');
  } else if (structural && !enacted) {
    status = 'mismatch';
    reasons.push('Gliederung eines Gesetzgebungsmaterials ohne amtlichen Erlass- oder Verkündungsbeleg');
  } else {
    if (structural) reasons.push('Materialienstruktur trotz Erlassbeleg');
    if (commentaryStructure && !enacted && supporting.length === 0) reasons.push('erläuternde Gliederung ohne Erlassbeleg');
    if (titleWeak && !enacted) reasons.push('Titel nur teilweise übereinstimmend ohne Erlassbeleg');
    if (signals.some((signal) => signal.code === 'date-conflict')) reasons.push('Datumswiderspruch');
    if (signals.some((signal) => signal.code === 'file-reference-conflict')) reasons.push('Aktenzeichenwiderspruch');
    if (nearlyEmpty) reasons.push('Normkörper nahezu leer');
    if (signals.some((signal) => signal.code === 'no-legal-units')) reasons.push('keine Normstruktur');
    if (reasons.length > 0) status = 'review';
  }
  const findings: ImportFinding[] = [];
  if (status === 'mismatch') findings.push({ severity: 'error', code: 'document-identity-mismatch', message: `Dokumentidentität: ${reasons.join('; ')}` });
  if (status === 'review') findings.push({ severity: 'warning', code: 'document-identity-review', message: `Dokumentidentität prüfen: ${reasons.join('; ')}` });
  const result: DocumentSanityResult = { status, signals, materials: { structural, headingMarkers: [...headingMarkers], textMarkers: [...textMarkers] }, enactment: { strong, supporting }, findings };
  if (titleSimilarity !== undefined) result.titleSimilarity = titleSimilarity;
  return result;
}
