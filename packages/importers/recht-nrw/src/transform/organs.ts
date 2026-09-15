/**
 * Erlassorgane: RECHT.NRW führt kein Feld für das erlassende Organ. Ein Organ wird deshalb nur
 * aus einer ausdrücklichen Formel im Quelltext übernommen – nie aus dem Normtyp abgeleitet:
 *
 *   legislative-resolution  „Der Landtag Nordrhein-Westfalen hat … folgendes Gesetz beschlossen“
 *   ordinance-formula       „… verordnet das Ministerium für Kinder, Familie, Flüchtlinge und Integration …“
 *   decree-head             „Runderlass des Ministeriums des Innern“, „RdErl. d. Finanzministers“
 *
 * Unterschriften („Der Innenminister“) belegen die Ausfertigung, nicht das Erlassorgan, und werden
 * nicht verwendet. Findet sich keine Formel oder widersprechen sich Formeln, bleibt das Organ leer.
 *
 * Überleitung ins Simulationsrecht nur, wenn sicher: Verfassungsorgane (Landtag, Landesregierung,
 * Ministerpräsident) existieren in jedem Land; ihre Bezeichnung wird wie der Normtext übergeleitet.
 * Ministerien und Behörden bleiben ohne Simulationsorgan (Ressortzuschnitt ungeklärt, manuelle
 * Entscheidung); das historische Organ bleibt als `originEnactingBody` erhalten.
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import { applySegments, planTransformation, type TransformSegment } from './rules.ts';

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
  decision: 'safe-auto-transform' | 'manual-review' | 'not-available';
  reason: string;
  segments: TransformSegment[];
}

const MINISTRY_HEAD = '(?:Landesregierung|Staatskanzlei|Ministerpräsident(?:in|en)?|(?:[A-ZÄÖÜ][a-zäöüß]+)?[Mm]inisteri(?:um|ums)|(?:[A-ZÄÖÜ][a-zäöüß]+)?[Mm]inister(?:in|s)?)';
const ORGAN_TAIL = '(?:\\s+(?:für|des|der)\\s+(?:[^,:;()]|,(?=\\s*[A-ZÄÖÜ]))+?)?(?:\\s+(?:des\\s+Landes\\s+)?Nordrhein-Westfalen)?';

const FORMULAS: ReadonlyArray<{ formula: OrganFormula; pattern: RegExp }> = [
  { formula: 'legislative-resolution', pattern: /\b(?:Der|Die)\s+(Landtag(?:\s+(?:von\s+)?Nordrhein-Westfalen)?)\s+hat\s+(?:am\s+[^,]+?\s+)?(?:das\s+folgende|folgendes|folgendes\s+verfassungsändernde)\s+Gesetz\s+beschlossen/u },
  { formula: 'ordinance-formula', pattern: new RegExp(`\\b(?:verordnet|verordnen|erlässt|erlassen)\\s+(?:die|das|der)\\s+(${MINISTRY_HEAD}${ORGAN_TAIL})(?=\\s*(?:,(?!\\s*[A-ZÄÖÜ])|:|;|$|\\s+(?:im\\s+Einvernehmen|mit\\s+Zustimmung|nach\\s+Anhörung|im\\s+Benehmen|nach\\s+Beteiligung|die\\s+folgende|das\\s+folgende|folgende|unter\\s+Beachtung|zugleich)))`, 'u') },
  { formula: 'decree-head', pattern: new RegExp(`^(?:Gemeinsamer\\s+)?(?:Runderlass|RdErl\\.|Erlass|Verwaltungsvorschrift)\\s+(?:des|der|d\\.)\\s+(${MINISTRY_HEAD}${ORGAN_TAIL})(?=\\s*(?:$|[-–]|Az\\.|Vom\\s|v\\.\\s*\\d|\\d))`, 'u') },
];

/** Genitiv des Kopfworts → Nominativ („Ministeriums“ → „Ministerium“, „Innenministers“ → „Innenminister“). */
export function nominativeOrganName(value: string): string {
  const cleaned = value.replace(/\s+/gu, ' ').trim();
  return cleaned
    .replace(/^((?:[A-ZÄÖÜ][a-zäöüß]+)?[Mm]inisterium)s\b/u, '$1')
    .replace(/^((?:[A-ZÄÖÜ][a-zäöüß]+)?[Mm]inister)s\b/u, '$1')
    .replace(/^(Ministerpräsident)en\b/u, '$1');
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

/** Sucht ausdrückliche Erlassformeln im Vorspann des Normkörpers und in Kopfzeilen (Erlasskopf). */
export function extractSourceOrgans(input: { blocks: readonly NormBodyBlock[]; headLines?: ReadonlyArray<{ path: string; text: string }> }): SourceOrganExtraction {
  const candidates: OrganEvidence[] = [];
  const texts = [...(input.headLines ?? []), ...formulaAreaTexts(input.blocks)];
  for (const { path, text } of texts) {
    const flat = text.replace(/\s+/gu, ' ').trim();
    for (const { formula, pattern } of FORMULAS) {
      const match = pattern.exec(flat);
      if (!match?.[1]) continue;
      candidates.push({ name: nominativeOrganName(match[1]), formula, text: match[0], path });
    }
  }
  const names = new Set(candidates.map((candidate) => candidate.name));
  const extraction: SourceOrganExtraction = { candidates, conflict: names.size > 1 };
  if (names.size === 1) extraction.enactingBody = candidates[0]!;
  return extraction;
}

const CONSTITUTIONAL_ORGAN = /^(?:Landtag|Landesregierung|Ministerpräsident(?:in)?)(?:\s+(?:von\s+|des\s+Landes\s+)?Nordrhein-Westfalen)?$/u;

/** Überleitung des Erlassorgans in die Simulationsjurisdiktion – nur für Verfassungsorgane. */
export function mapEnactingBody(origin: string | undefined): EnactingBodyMapping {
  if (!origin) return { decision: 'not-available', reason: 'Die Quelle nennt kein Erlassorgan in einer ausdrücklichen Formel; es wird kein Organ angenommen.', segments: [] };
  if (CONSTITUTIONAL_ORGAN.test(origin)) {
    const { segments } = planTransformation(origin);
    return { enactingBody: applySegments(origin, segments), decision: 'safe-auto-transform', reason: 'Verfassungsorgan des Landes; nur die Landesbezeichnung wird übergeleitet.', segments };
  }
  return { decision: 'manual-review', reason: 'Ressort- oder Behördenbezeichnung des Herkunftslandes; Zuschnitt im Land Westdeutschland nicht festgelegt. Das historische Organ bleibt als Quellorgan erhalten.', segments: [] };
}
