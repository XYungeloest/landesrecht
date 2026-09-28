/**
 * Erlassorgane: Die Quelle führt kein maschinenlesbares Feld für das erlassende Organ. Ein Organ
 * wird deshalb nur aus einer ausdrücklichen Formel im Quelltext übernommen – nie aus dem Normtyp
 * abgeleitet:
 *
 *   legislative-resolution  „Der Schleswig-Holsteinische Landtag hat das folgende Gesetz beschlossen“
 *   ordinance-formula       „… verordnet das Ministerium für Inneres …“, „Die Landesregierung verordnet:“
 *   decree-head             „Runderlass des Innenministeriums“, „Erlass des Ministeriums für Bildung“
 *
 * Unpersönliche Formeln („Aufgrund des § 5 wird verordnet:“) benennen kein Organ und führen zu
 * keinem Organ. Unterschriften („Die Ministerpräsidentin“) belegen die Ausfertigung, nicht das
 * Erlassorgan, und werden nicht verwendet. Findet sich keine Formel oder widersprechen sich
 * Formeln, bleibt das Organ leer.
 *
 * Überleitung ins Simulationsrecht nur, wenn sicher: Verfassungsorgane (Landtag, Landesregierung,
 * Ministerpräsidentin/Ministerpräsident) bestehen in jedem Land; ihre Bezeichnung wird wie der
 * Normtext übergeleitet. Andere Organe nur über die zentrale Institutionen-Zuordnung (`map` mit
 * Ziel, `preserve`); sonst bleibt das Simulationsorgan leer (Review nicht blockierend), das
 * historische Organ bleibt als `originEnactingBody` erhalten.
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import type { CompiledInstitutionRegistry } from './institution-registry.ts';
import { applySegments, NAME_SEPARATOR, planTransformation, targetStateName, type TransformationOptions, type TransformSegment } from './rules.ts';

export type OrganFormula = 'legislative-resolution' | 'ordinance-formula' | 'decree-head';

export interface OrganEvidence {
  /** Organ im Nominativ, wie es die Formel nennt (nur Kopfwort grammatisch normalisiert, Zusätze hinter dem Namen abgeschnitten). */
  name: string;
  formula: OrganFormula;
  /** Wörtlicher Ausschnitt der Quelle. */
  text: string;
  path: string;
  /** Die Formel weist dem Organ bestimmte Vorschriften zu („… die folgenden §§ 1 bis 8“): Teil einer gemeinsamen Verordnung. */
  scoped?: boolean;
}

export interface SourceOrganExtraction {
  enactingBody?: OrganEvidence;
  candidates: OrganEvidence[];
  conflict: boolean;
  /**
   * Wie mehrere Formeln zu einem Organ geführt haben (Run 9): `same-organ` – dieselbe Bezeichnung in Varianten (Kopfwort,
   * Landeszusatz, Kommata); `joint-enactment` – gemeinsame Verordnung mehrerer Organe, jede Formel weist Vorschriften zu;
   * `normgeber` – der juris-Kopf „Normgeber“ nennt genau eines der Formelorgane (Bekanntmachungen verschiedener Ressorts
   * über die Zeit).
   */
  resolution?: 'same-organ' | 'joint-enactment' | 'normgeber';
}

export interface EnactingBodyMapping {
  enactingBody?: string;
  /** registry-map: Zuordnung laut Institutionen-Mapping; source-only: nur Provenienz, kein Review. */
  decision: 'safe-auto-transform' | 'registry-map' | 'source-only' | 'manual-review' | 'not-available';
  reason: string;
  segments: TransformSegment[];
  mappingEntry?: string;
}

const STATE = String.raw`Schleswig${NAME_SEPARATOR}Holstein`;
const ADJECTIVE = String.raw`[Ss]chleswig${NAME_SEPARATOR}[Hh]olsteinisch(?:e[mnrs]?)?`;
const MINISTRY_HEAD = `(?:Landesregierung|Staatskanzlei|Ministerpräsident(?:in|en)?|(?:[A-ZÄÖÜ][a-zäöüß]+)?[Mm]inisteri(?:um|ums)|(?:[A-ZÄÖÜ][a-zäöüß]+)?[Mm]inister(?:in|s)?)`;
const ORGAN_HEAD = `(?:${ADJECTIVE}\\s+)?${MINISTRY_HEAD}`;
const ORGAN_TAIL = `(?:\\s+(?:für|des|der)\\s+(?:[^,:;()]|,(?=\\s*[A-ZÄÖÜ]))+?)?(?:\\s+(?:des\\s+Landes\\s+)?${STATE})?`;
const ORGAN = `${ORGAN_HEAD}${ORGAN_TAIL}`;

const FORMULAS: ReadonlyArray<{ formula: OrganFormula; pattern: RegExp }> = [
  {
    formula: 'legislative-resolution',
    pattern: new RegExp(String.raw`\b(?:Der|Die)\s+((?:${ADJECTIVE}\s+)?Landtag(?:\s+(?:von\s+|des\s+Landes\s+)?${STATE})?)\s+hat\s+(?:am\s+[^,]+?\s+)?(?:das\s+folgende|die\s+folgenden|folgendes|folgendes\s+verfassungsänderndes?)\s+Gesetz\s+beschlossen`, 'u'),
  },
  {
    formula: 'ordinance-formula',
    pattern: new RegExp(`\\b(?:verordnet|verordnen|erlässt|erlassen)\\s+(?:die|das|der)\\s+(${ORGAN})(?=\\s*(?:,(?!\\s*[A-ZÄÖÜ])|:|;|$|\\s+(?:im\\s+Einvernehmen|mit\\s+Zustimmung|nach\\s+Anhörung|im\\s+Benehmen|nach\\s+Beteiligung|die\\s+folgende|das\\s+folgende|den\\s+folgenden|folgende|unter\\s+Beachtung|zugleich)))`, 'u'),
  },
  {
    formula: 'ordinance-formula',
    pattern: new RegExp(`\\b(?:Der|Die|Das)\\s+(${ORGAN})\\s+verordnet(?=\\s*:|\\s+(?:auf\\s+Grund|aufgrund|nach\\s+Anhörung|im\\s+Einvernehmen|mit\\s+Zustimmung|hiermit))`, 'u'),
  },
  {
    formula: 'decree-head',
    pattern: new RegExp(`^(?:Gemeinsamer?\\s+)?(?:Runderlass|RdErl\\.|Erlass|Bekanntmachung|Allgemeine\\s+Verwaltungsvorschrift|Verwaltungsvorschrift|Landesverordnung|Verordnung)\\s+(?:des|der|d\\.)\\s+(${ORGAN})(?=\\s*(?:$|[-–—]|Az\\.|Vom\\s|vom\\s|v\\.\\s*\\d|über\\s|zur\\s|zum\\s|\\d))`, 'u'),
  },
];

/**
 * Genitiv des Kopfworts → Nominativ („Ministeriums“ → „Ministerium“, „Innenministers“ →
 * „Innenminister“). Zusätzlich wird die schwache Adjektivform nach Artikel („Der
 * Schleswig-Holsteinische Landtag“) in die starke Nominativform gebracht.
 */
export function nominativeOrganName(value: string): string {
  const cleaned = value.replace(/\s+/gu, ' ').trim();
  return cleaned
    .replace(/^((?:[A-ZÄÖÜ][a-zäöüß]+)?[Mm]inisterium)s\b/u, '$1')
    .replace(/^((?:[A-ZÄÖÜ][a-zäöüß]+)?[Mm]inister)s\b/u, '$1')
    .replace(/^(Ministerpräsident)en\b/u, '$1')
    .replace(/^(Landtag)(?:e?s)\b/u, '$1')
    .replace(new RegExp(String.raw`^([Ss]chleswig${NAME_SEPARATOR}[Hh]olsteinische)(?=\s)`, 'u'), '$1r');
}

function formulaAreaTexts(blocks: readonly NormBodyBlock[]): Array<{ path: string; text: string }> {
  // Eingangsformeln stehen vor der ersten Gliederungseinheit (Vorspann, Präambel).
  const area: Array<{ path: string; text: string }> = [];
  for (const [index, block] of blocks.entries()) {
    if (['paragraph', 'article', 'part', 'chapter', 'section', 'book', 'annex'].includes(block.type)) break;
    if (block.text) area.push({ path: `body[${index}].text`, text: block.text });
    if (block.type === 'preamble') for (const [childIndex, child] of (block.children ?? []).entries()) if (child.text) area.push({ path: `body[${index}].children[${childIndex}].text`, text: child.text });
  }
  return area;
}

/**
 * Zusatz hinter der Organbezeichnung, der nicht zum Namen gehört: Zuständigkeitsvorbehalt („als zuständige Stelle nach
 * § 46“), Ermächtigung („auf der Grundlage von § 35“), Geltungsbereich („für den örtlichen Geltungsbereich nach § 3“)
 * oder die zugewiesenen Vorschriften („die folgenden §§ 1 bis 8“).
 */
const NAME_TAIL = /\s+(?:als\s|auf\s+der\s+Grundlage\b|auf\s+Grund\b|aufgrund\b|gemäß\b|nach\s+(?:§|Artikel|Art\.|Anhörung|Maßgabe|Beteiligung)|im\s+Rahmen\b|im\s+Einvernehmen\b|im\s+Benehmen\b|mit\s+Zustimmung\b|in\s+Verbindung\b|für\s+den\s+örtlichen\s+Geltungsbereich\b|(?:die|den|das)\s+folgenden?\b|folgende[ns]?\b|eine[nrs]?\s|hiermit\b|unter\s)/u;

/** Organbezeichnung ohne Zusätze und ohne nachlaufenden Artikel („… Fischerei den“ vor „folgenden § 5“). */
export function organCore(name: string): string {
  const flat = name.replace(/\s+/gu, ' ').trim();
  const cut = NAME_TAIL.exec(flat);
  return (cut ? flat.slice(0, cut.index) : flat).replace(/\s+(?:den|die|das|der|dem)$/u, '').trim();
}

/**
 * Vergleichsschlüssel zweier Formelorgane: Kopfwort Minister/Ministerin/Ministerium gleichgesetzt (dasselbe Ressort in
 * verschiedenen Formeln und im juris-Kopf „Normgeber“), Landeszusatz, Kommata und Leerraum unbeachtet.
 */
export function organKey(name: string): string {
  return organCore(name)
    .replace(new RegExp(String.raw`\s+(?:des\s+Landes\s+)?${STATE}$`, 'u'), '')
    .replace(/^((?:[A-ZÄÖÜ][a-zäöüß]+)?)[Mm]inister(?:in|ium)?\b/u, '$1ministerium')
    .replace(/,/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

/** Zuweisung von Vorschriften hinter dem Organ: „die folgenden §§ 1 bis 8“, „den folgenden § 5“, „die folgenden Artikel 1 und 4“, „… Geltungsbereich nach § 3 … die §§ 1, 2“. */
const SCOPE_AFTER = /^\s*(?:(?:für\s+den\s+örtlichen\s+Geltungsbereich\b|im\s+Rahmen\s+ihrer\s+jeweiligen\s+Zuständigkeit\b)[^;:]*?)?\s*(?:(?:die|den|das)\s+)?(?:folgenden?\s+)?(?:§§?|Artikel|Art\.)\s*\d/u;
/** Mehrere Organe in einer Formel („verordnen das Ministerium A und das Ministerium B“). */
const JOINT_SPLIT = new RegExp(String.raw`\s+und\s+(?:das|die|der)\s+(?=${ORGAN_HEAD})`, 'u');

/**
 * Sucht ausdrückliche Erlassformeln im Vorspann des Normkörpers und in Kopfzeilen (Erlasskopf). `normgeber` ist der
 * juris-Kopf „Normgeber“ der Verwaltungsvorschriften – er entscheidet nur zwischen Formelorganen, ersetzt keine Formel.
 */
export function extractSourceOrgans(input: { blocks: readonly NormBodyBlock[]; headLines?: ReadonlyArray<{ path: string; text: string }>; normgeber?: string }): SourceOrganExtraction {
  const candidates: OrganEvidence[] = [];
  const texts = [...(input.headLines ?? []), ...formulaAreaTexts(input.blocks)];
  for (const { path, text } of texts) {
    const flat = text.replace(/\s+/gu, ' ').trim();
    for (const { formula, pattern } of FORMULAS) {
      const match = pattern.exec(flat);
      if (!match?.[1]) continue;
      let raw = match[1];
      const rawStart = match.index + match[0].indexOf(raw);
      // Fehlendes Leerzeichen der Quelle vor „folgenden“ („… Fischereiden folgenden § 5“).
      if (/\p{Ll}den$/u.test(raw) && /^\s*folgenden?\b/u.test(flat.slice(rawStart + raw.length))) raw = raw.slice(0, -3);
      const parts = formula === 'ordinance-formula' ? organCore(raw).split(JOINT_SPLIT) : [organCore(raw)];
      const after = flat.slice(rawStart + organCore(raw).length);
      const scoped = formula === 'ordinance-formula' && SCOPE_AFTER.test(after);
      for (const part of parts) {
        const name = nominativeOrganName(part);
        if (!name) continue;
        candidates.push({ name, formula, text: match[0], path, ...(scoped ? { scoped: true } : {}) });
      }
    }
  }
  const groups = new Map<string, OrganEvidence[]>();
  for (const candidate of candidates) {
    const key = organKey(candidate.name);
    const group = groups.get(key);
    if (group) group.push(candidate);
    else groups.set(key, [candidate]);
  }
  const extraction: SourceOrganExtraction = { candidates, conflict: false };
  if (groups.size === 1) {
    extraction.enactingBody = candidates[0]!;
    if (new Set(candidates.map((candidate) => candidate.name)).size > 1) extraction.resolution = 'same-organ';
    return extraction;
  }
  if (groups.size === 0) return extraction;
  // Gemeinsame Verordnung: Jede Formel weist ihrem Organ bestimmte Vorschriften zu („verordnet der Minister A die folgenden
  // §§ 1 bis 8 …; verordnet der Minister B den folgenden § 5“). Erlassorgane sind alle genannten, in Reihenfolge der Formeln.
  if (candidates.every((candidate) => candidate.formula === 'ordinance-formula' && candidate.scoped)) {
    const first = candidates[0]!;
    extraction.enactingBody = { name: [...groups.values()].map((group) => group[0]!.name).join(' und '), formula: 'ordinance-formula', text: [...groups.values()].map((group) => group[0]!.text).join(' … '), path: first.path, scoped: true };
    extraction.resolution = 'joint-enactment';
    return extraction;
  }
  // Bekanntmachungen verschiedener Ressorts über die Zeit (Erlasskopf, Änderungsbekanntmachungen): Der juris-Kopf
  // „Normgeber“ nennt genau eines der Formelorgane.
  const normgeber = input.normgeber ? groups.get(organKey(input.normgeber)) : undefined;
  if (normgeber) {
    extraction.enactingBody = normgeber[0]!;
    extraction.resolution = 'normgeber';
    return extraction;
  }
  extraction.conflict = true;
  return extraction;
}

const CONSTITUTIONAL_ORGAN = new RegExp(
  String.raw`^(?:(?:${ADJECTIVE}\s+)?(?:Landtag|Landesregierung)|Ministerpräsident(?:in)?)(?:\s+(?:von\s+|des\s+Landes\s+)?${STATE})?$`,
  'u',
);

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
  const mapping: EnactingBodyMapping = { decision: 'manual-review', reason: `Ressort- oder Behördenbezeichnung des Herkunftslandes; Zuschnitt im ${targetStateName()} nicht festgelegt. Das historische Organ bleibt als Quellorgan erhalten.`, segments: [] };
  if (resolved?.entry) mapping.mappingEntry = resolved.entry.id;
  return mapping;
}
