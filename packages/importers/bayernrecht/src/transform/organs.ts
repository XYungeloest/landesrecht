/**
 * Erlassorgane: Die Quelle führt kein maschinenlesbares Feld für das erlassende Organ. Ein Organ
 * wird deshalb nur aus einer ausdrücklichen Formel im Quelltext übernommen – nie aus dem Normtyp
 * abgeleitet:
 *
 *   legislative-resolution  „Der Bayerische Landtag hat das folgende Gesetz beschlossen“
 *   ordinance-formula       „… erlässt das Bayerische Staatsministerium der Finanzen folgende
 *                            Verordnung:“, „Die Bayerische Staatsregierung erlässt folgende
 *                            Verordnung:“
 *   decree-head             „Bekanntmachung des Bayerischen Staatsministeriums der Finanzen“
 *
 * Unpersönliche Formeln („Auf Grund des Art. 5 wird verordnet:“) benennen kein Organ und führen zu
 * keinem Organ. Unterschriften („Der Ministerpräsident“) belegen die Ausfertigung, nicht das
 * Erlassorgan, und werden nicht verwendet. Findet sich keine Formel oder widersprechen sich
 * Formeln, bleibt das Organ leer.
 *
 * Gesucht wird im Vorspann des Normkörpers (alles vor der ersten Gliederungseinheit) und in
 * mitgegebenen Kopfzeilen. Bayerische Titelangaben stehen dabei mehrzeilig in **einem** Block
 * (`<br/>`-getrennt: Gliederungsnummer, Titel, Kurzbezeichnung, Erlasskopf, Datum, Fundstelle).
 * Die Formeln werden deshalb zusätzlich Zeile für Zeile geprüft – sonst träfe ein am Zeilenanfang
 * verankerter Erlasskopf nie, weil vor ihm noch die Gliederungsnummer stünde.
 *
 * Überleitung ins Simulationsrecht nur, wenn sicher: Verfassungsorgane (Landtag, Staatsregierung,
 * Ministerpräsidentin/Ministerpräsident) bestehen in jedem Land; ihre Bezeichnung wird wie der
 * Normtext übergeleitet. Andere Organe – die Staatsministerien zuerst – nur über die zentrale
 * Institutionen-Zuordnung (`map` mit Ziel, `preserve`); sonst bleibt das Simulationsorgan leer
 * (Review nicht blockierend), das historische Organ bleibt als `originEnactingBody` erhalten.
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import { SOURCE_STATE } from '../common/constants.ts';
import type { CompiledInstitutionRegistry } from './institution-registry.ts';
import { APPENDED_GUARD, applySegments, planTransformation, SOURCE_ADJECTIVE, targetStateName, type TransformationOptions, type TransformSegment } from './rules.ts';

export type OrganFormula = 'legislative-resolution' | 'ordinance-formula' | 'decree-head';

export interface OrganEvidence {
  /** Organ im Nominativ, wie es die Formel nennt (nur Kopfwort grammatisch normalisiert). */
  name: string;
  formula: OrganFormula;
  /** Wörtlicher Ausschnitt der Quelle. */
  text: string;
  path: string;
}

export interface SourceOrganExtraction {
  enactingBody?: OrganEvidence;
  candidates: OrganEvidence[];
  conflict: boolean;
}

export interface EnactingBodyMapping {
  enactingBody?: string;
  /** registry-map: Zuordnung laut Institutionen-Mapping; source-only: nur Provenienz, kein Review. */
  decision: 'safe-auto-transform' | 'registry-map' | 'source-only' | 'manual-review' | 'not-available';
  reason: string;
  segments: TransformSegment[];
  mappingEntry?: string;
}

const ADJECTIVE_HEAD = SOURCE_ADJECTIVE.slice(0, 1);
const ADJECTIVE = String.raw`[${ADJECTIVE_HEAD.toLocaleUpperCase('de-DE')}${ADJECTIVE_HEAD}]${SOURCE_ADJECTIVE.slice(1)}(?:e[mnrs]?)?`;
const STATE = String.raw`${SOURCE_STATE}${APPENDED_GUARD}(?![\p{L}])`;
const OF_STATE = String.raw`(?:von\s+|des\s+(?:Freistaates|Freistaats|Landes)\s+)?`;
const MINISTRY_HEAD = String.raw`(?:Staatsregierung|Staatskanzlei|Landesregierung|Ministerpräsident(?:in|en)?|(?:[A-ZÄÖÜ][a-zäöüß]+)?[Ss]taatsministeri(?:ums|um)|(?:[A-ZÄÖÜ][a-zäöüß]+)?[Ss]taatsminister(?:in|s)?|(?:[A-ZÄÖÜ][a-zäöüß]+)?[Mm]inisteri(?:ums|um)|(?:[A-ZÄÖÜ][a-zäöüß]+)?[Mm]inister(?:in|s)?)`;
const ORGAN_HEAD = String.raw`(?:${ADJECTIVE}\s+)?${MINISTRY_HEAD}`;
/**
 * Ein Komma beendet den Ressortzuschnitt – außer es beginnt eine Fortsetzung der Aufzählung. Die
 * bayerischen Ressortbezeichnungen setzen mit einem großgeschriebenen Nomen („für Familie, Arbeit
 * und Soziales“) oder mit „für“ fort („des Innern, für Sport und Integration“); alles andere ist
 * ein neuer Satzteil („…, im Einvernehmen mit …“) und gehört nicht mehr zum Organ.
 */
const PORTFOLIO_CONTINUATION = String.raw`\s*(?:[A-ZÄÖÜ]|für\b)`;
const ORGAN_TAIL = String.raw`(?:\s+(?:für|des|der)\s+(?:[^,:;()]|,(?=${PORTFOLIO_CONTINUATION}))+?)?(?:\s+${OF_STATE}${STATE})?`;
const ORGAN = `${ORGAN_HEAD}${ORGAN_TAIL}`;

const FORMULAS: ReadonlyArray<{ formula: OrganFormula; pattern: RegExp }> = [
  {
    formula: 'legislative-resolution',
    pattern: new RegExp(
      String.raw`\b(?:Der|Die)\s+((?:${ADJECTIVE}\s+)?Landtag(?:\s+${OF_STATE}${STATE})?)\s+hat\s+(?:am\s+[^,]+?\s+)?(?:das\s+folgende|die\s+folgenden|folgendes|folgendes\s+verfassungsänderndes?)\s+Gesetz\s+beschlossen`,
      'u',
    ),
  },
  {
    formula: 'ordinance-formula',
    pattern: new RegExp(
      String.raw`\b(?:erlässt|erläßt|erlassen|verordnet|verordnen|bestimmt)\s+(?:die|das|der)\s+(${ORGAN})(?=\s*(?:,(?!${PORTFOLIO_CONTINUATION})|:|;|$|\s+(?:im\s+Einvernehmen|mit\s+Zustimmung|nach\s+Anhörung|im\s+Benehmen|nach\s+Beteiligung|die\s+folgende|das\s+folgende|das\s+als|folgende|folgendes|nachstehende|hiermit|zugleich|unter\s+Beachtung)))`,
      'u',
    ),
  },
  {
    formula: 'ordinance-formula',
    pattern: new RegExp(
      String.raw`\b(?:Der|Die|Das)\s+(${ORGAN})\s+(?:erlässt|erläßt|verordnet)(?=\s*:|\s+(?:auf\s+Grund|aufgrund|nach\s+Anhörung|im\s+Einvernehmen|mit\s+Zustimmung|hiermit|folgende|folgendes|nachstehende))`,
      'u',
    ),
  },
  {
    formula: 'decree-head',
    pattern: new RegExp(
      String.raw`^(?:Gemeinsame(?:r|s)?\s+)?(?:Bekanntmachung|Allgemeine\s+Verwaltungsvorschrift|Verwaltungsvorschrift(?:en)?|Rechtsverordnung|Verordnung|Richtlinie(?:n)?|Erlass)\s+(?:des|der|d\.)\s+(${ORGAN})(?=\s*(?:$|[-–—]|Az\.|Vom\s|vom\s|v\.\s*\d|über\s|zur\s|zum\s|betreffend\s|\d))`,
      'u',
    ),
  },
];

/**
 * Genitiv des Kopfworts → Nominativ („Staatsministeriums“ → „Staatsministerium“, „Landtages“ →
 * „Landtag“). Anschließend wird die schwache Adjektivform nach Artikel („das Bayerische
 * Staatsministerium“, „des Bayerischen Staatsministeriums“) in die starke Nominativform gebracht;
 * deren Endung richtet sich nach dem Genus des Kopfworts („Bayerisches Staatsministerium“,
 * „Bayerischer Landtag“, „Bayerische Staatsregierung“).
 */
export function nominativeOrganName(value: string): string {
  const cleaned = value.replace(/\s+/gu, ' ').trim();
  const adjective = new RegExp(String.raw`^([${ADJECTIVE_HEAD.toLocaleUpperCase('de-DE')}${ADJECTIVE_HEAD}])${SOURCE_ADJECTIVE.slice(1)}e[mnrs]?\s+`, 'u').exec(cleaned);
  const head = (adjective ? cleaned.slice(adjective[0].length) : cleaned)
    .replace(/^((?:[A-ZÄÖÜ][a-zäöüß]+)?(?:[Ss]taatsministerium|[Mm]inisterium))s\b/u, '$1')
    .replace(/^((?:[A-ZÄÖÜ][a-zäöüß]+)?(?:[Ss]taatsminister|[Mm]inister))s\b/u, '$1')
    .replace(/^(Ministerpräsident)en\b/u, '$1')
    .replace(/^(Landtag)e?s\b/u, '$1');
  if (!adjective) return head;
  const ending = /^(?:[A-ZÄÖÜ][a-zäöüß]+)?(?:[Ss]taatsministerium|[Mm]inisterium)\b/u.test(head)
    ? 's'
    : /^(?:Landtag|Ministerpräsident|Rechnungshof|Verfassungsgerichtshof|Verwaltungsgerichtshof|Senat|Rundfunk)\b/u.test(head) ||
        /^(?:[A-ZÄÖÜ][a-zäöüß]+)?(?:[Ss]taatsminister|[Mm]inister)\b/u.test(head)
      ? 'r'
      : '';
  return `${adjective[1]}${SOURCE_ADJECTIVE.slice(1)}e${ending} ${head}`;
}

/** Gliederungseinheiten; vor ihnen steht der Vorspann mit der Eingangsformel. */
const STRUCTURE_TYPES = ['paragraph', 'article', 'part', 'chapter', 'section', 'subsection', 'book', 'annex'];

function formulaAreaTexts(blocks: readonly NormBodyBlock[]): Array<{ path: string; text: string }> {
  const area: Array<{ path: string; text: string }> = [];
  for (const [index, block] of blocks.entries()) {
    if (STRUCTURE_TYPES.includes(block.type)) break;
    if (block.text) area.push({ path: `body[${index}].text`, text: block.text });
    if (block.type === 'preamble') for (const [childIndex, child] of (block.children ?? []).entries()) if (child.text) area.push({ path: `body[${index}].children[${childIndex}].text`, text: child.text });
  }
  return area;
}

/** Sucht ausdrückliche Erlassformeln im Vorspann des Normkörpers und in Kopfzeilen (Erlasskopf). */
export function extractSourceOrgans(input: { blocks: readonly NormBodyBlock[]; headLines?: ReadonlyArray<{ path: string; text: string }> }): SourceOrganExtraction {
  const candidates: OrganEvidence[] = [];
  const texts = [...(input.headLines ?? []), ...formulaAreaTexts(input.blocks)];
  for (const { path, text } of texts) {
    // Ganzer Block und zusätzlich jede Zeile: mehrzeilige Titelangaben tragen den Erlasskopf in
    // einer eigenen Zeile, ein am Zeilenanfang verankertes Muster träfe sonst nie.
    const units = [text, ...(text.includes('\n') ? text.split(/\n+/u) : [])];
    for (const unit of units) {
      const flat = unit.replace(/\s+/gu, ' ').trim();
      if (!flat) continue;
      for (const { formula, pattern } of FORMULAS) {
        const match = pattern.exec(flat);
        if (!match?.[1]) continue;
        const name = nominativeOrganName(match[1]);
        if (candidates.some((candidate) => candidate.name === name && candidate.formula === formula && candidate.path === path)) continue;
        candidates.push({ name, formula, text: match[0], path });
      }
    }
  }
  const names = new Set(candidates.map((candidate) => candidate.name));
  const extraction: SourceOrganExtraction = { candidates, conflict: names.size > 1 };
  if (names.size === 1) extraction.enactingBody = candidates[0]!;
  return extraction;
}

const CONSTITUTIONAL_ORGAN = new RegExp(String.raw`^(?:(?:${ADJECTIVE}\s+)?(?:Landtag|Staatsregierung)|Ministerpräsident(?:in)?)(?:\s+${OF_STATE}${STATE})?$`, 'u');

/** Überleitung des Erlassorgans in die Simulationsjurisdiktion – Verfassungsorgane oder zentrale Zuordnung. */
export function mapEnactingBody(origin: string | undefined, options: { institutions?: CompiledInstitutionRegistry; transformation?: TransformationOptions } = {}): EnactingBodyMapping {
  if (!origin) return { decision: 'not-available', reason: 'Die Quelle nennt kein Erlassorgan in einer ausdrücklichen Formel; es wird kein Organ angenommen.', segments: [] };
  if (CONSTITUTIONAL_ORGAN.test(origin)) {
    const { segments } = planTransformation(origin, options.transformation);
    return { enactingBody: applySegments(origin, segments), decision: 'safe-auto-transform', reason: 'Verfassungsorgan des Landes; nur die Landesbezeichnung wird übergeleitet.', segments };
  }
  const resolved = options.institutions?.resolve(origin);
  if (resolved?.entry && resolved.status === 'map' && resolved.entry.target) {
    return { enactingBody: resolved.entry.target, decision: 'registry-map', reason: `Institutionen-Zuordnung ${resolved.entry.id}: ${resolved.entry.reason}`, segments: [], mappingEntry: resolved.entry.id };
  }
  if (resolved?.entry && resolved.status === 'preserve') {
    return { enactingBody: origin, decision: 'registry-map', reason: `Institutionen-Zuordnung ${resolved.entry.id} (preserve): ${resolved.entry.reason}`, segments: [], mappingEntry: resolved.entry.id };
  }
  if (resolved?.entry && resolved.status === 'historical-source-only') {
    return { decision: 'source-only', reason: `Institutionen-Zuordnung ${resolved.entry.id} (historical-source-only): ${resolved.entry.reason}`, segments: [], mappingEntry: resolved.entry.id };
  }
  const mapping: EnactingBodyMapping = {
    decision: 'manual-review',
    reason: `Ressort- oder Behördenbezeichnung des Herkunftslandes; Zuschnitt im ${targetStateName()} nicht festgelegt. Das historische Organ bleibt als Quellorgan erhalten.`,
    segments: [],
  };
  if (resolved?.entry) mapping.mappingEntry = resolved.entry.id;
  return mapping;
}
