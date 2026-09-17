/**
 * Kennzahlen und Strukturprüfungen je Norm (offline): Blockzahlen, Textlänge, Sucheinheiten,
 * Tabellen, Anlagen, Fußnoten sowie Sprungziel-/Inhaltsübersichtsprüfung über den Legal-Core.
 * Reine Funktionen über NormRecord; werden von mehreren Audits und Tests gemeinsam verwendet.
 */
import { buildAnchorMap, buildOutline, countBlockTypes, type OutlineEntry } from '@landesrecht/legal-core/lib/body.ts';
import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import type { NormBodyBlock, NormRecord, NormVersion } from '@landesrecht/legal-core/lib/schema.ts';
import { getApplicableVersion } from '@landesrecht/legal-core/lib/versions.ts';
import { collectBodyUnits } from '@landesrecht/search/units.ts';

export interface NormStats {
  slug: string;
  type: string;
  abbr?: string;
  title: string;
  versionId: string;
  blocks: number;
  textChars: number;
  units: number;
  outlineEntries: number;
  anchors: number;
  tables: number;
  annexes: number;
  footnotes: number;
  sourceNotes: number;
  quotedProvisions: number;
  maxDepth: number;
  blockTypes: Record<string, number>;
}

export function currentVersion(record: NormRecord): NormVersion {
  return getApplicableVersion(record, EDITORIAL_REFERENCE_DATE);
}

function textLength(blocks: readonly NormBodyBlock[]): number {
  let total = 0;
  const visit = (entries: readonly NormBodyBlock[]): void => {
    for (const block of entries) {
      total += (block.text?.length ?? 0) + (block.title?.length ?? 0) + (block.label?.length ?? 0);
      if (block.children) visit(block.children);
    }
  };
  visit(blocks);
  return total;
}

function maxDepth(blocks: readonly NormBodyBlock[], depth = 1): number {
  let result = blocks.length > 0 ? depth : 0;
  for (const block of blocks) if (block.children) result = Math.max(result, maxDepth(block.children, depth + 1));
  return result;
}

function countOutline(entries: readonly OutlineEntry[]): number {
  return entries.reduce((sum, entry) => sum + 1 + countOutline(entry.children), 0);
}

export function computeNormStats(record: NormRecord, version = currentVersion(record)): NormStats {
  const blockTypes = countBlockTypes(version.body);
  const anchors = buildAnchorMap(version.body);
  const outline = buildOutline(version.body, anchors);
  const { units } = collectBodyUnits(version.body);
  const stats: NormStats = {
    slug: record.meta.slug,
    type: record.meta.type,
    title: version.title ?? record.meta.title,
    versionId: version.versionId,
    blocks: Object.values(blockTypes).reduce((sum, count) => sum + count, 0),
    textChars: textLength(version.body),
    units: units.length,
    outlineEntries: countOutline(outline),
    anchors: anchors.size,
    tables: blockTypes.table ?? 0,
    annexes: blockTypes.annex ?? 0,
    footnotes: blockTypes.footnote ?? 0,
    sourceNotes: version.sourceNotes?.length ?? 0,
    quotedProvisions: blockTypes.quotedProvision ?? 0,
    maxDepth: maxDepth(version.body),
    blockTypes,
  };
  const abbr = version.abbr ?? record.meta.abbr;
  if (abbr !== undefined) stats.abbr = abbr;
  return stats;
}

export interface AnchorAuditResult {
  slug: string;
  anchors: number;
  outlineEntries: number;
  /** Gliederungsblöcke, die kein Sprungziel erhalten haben (Pfad). */
  unanchoredContainers: string[];
  /** Sprungziele mit Kollisionssuffix („--0-3“) – semantisch nicht eindeutige Adressen. */
  collisionAnchors: string[];
  /** §-/Artikel-Blöcke, deren Sprungziel nicht aus dem Label folgt („paragraph-0-4“ statt „paragraph-3“). */
  positionalUnitAnchors: string[];
  /** Fußnotenzeichen, die mehrfach mit identischem Text vorkommen. */
  duplicateFootnotes: string[];
  /** Fußnotenblöcke ohne Zeichen oder Text (sollte der Parser verhindern). */
  malformedFootnotes: number;
  /** Fußnotenzeichen im Text, für die weder Fußnotenblock noch Quellhinweis existiert. */
  footnoteMarksWithoutDefinition: string[];
  /** Tabellen, deren erste Zeile keine Kopfzellen hat (nur Datenzellen). */
  tablesWithoutHeaderRow: number;
  tables: number;
  /** Querverweise auf Paragraphen der eigenen Norm, die es dort nicht gibt („§ 99“ ohne § 99). */
  danglingInternalParagraphRefs: string[];
  paragraphLabels: number;
}

const PATH_PATTERN = /^(?:[a-z]+-)?\d+(?:-\d+)*$/u;

export function auditNormAnchors(record: NormRecord, version = currentVersion(record)): AnchorAuditResult {
  const anchors = buildAnchorMap(version.body);
  const outline = buildOutline(version.body, anchors);
  const result: AnchorAuditResult = {
    slug: record.meta.slug,
    anchors: anchors.size,
    outlineEntries: countOutline(outline),
    unanchoredContainers: [],
    collisionAnchors: [],
    positionalUnitAnchors: [],
    duplicateFootnotes: [],
    malformedFootnotes: 0,
    footnoteMarksWithoutDefinition: [],
    tablesWithoutHeaderRow: 0,
    tables: 0,
    danglingInternalParagraphRefs: [],
    paragraphLabels: 0,
  };
  const footnotes = new Map<string, Set<string>>();
  const footnoteLabels = new Set<string>();
  const paragraphNumbers = new Set<string>();
  const texts: string[] = [];

  const visit = (entries: readonly NormBodyBlock[], path: number[], quoted: boolean): void => {
    entries.forEach((block, index) => {
      const currentPath = [...path, index];
      const key = currentPath.join('.');
      const isContainer = ['book', 'part', 'chapter', 'section', 'subsection', 'paragraph', 'article', 'annex', 'preamble'].includes(block.type);
      if (isContainer) {
        const anchor = anchors.get(key);
        if (!anchor) result.unanchoredContainers.push(key);
        else {
          if (anchor.includes('--')) result.collisionAnchors.push(anchor);
          if ((block.type === 'paragraph' || block.type === 'article') && block.label && !quoted) {
            const stem = anchor.replace(/^(?:artikel|anlage)-[^-]+(?:-[^-]+)*?-(paragraph|artikel)-/u, '$1-');
            if (PATH_PATTERN.test(stem) && /\d/u.test(block.label) && !/^(?:paragraph|artikel)-[0-9]+[a-z]?(?:-[0-9a-z]+)*$/u.test(stem)) result.positionalUnitAnchors.push(anchor);
          }
        }
        if (block.type === 'paragraph' && !quoted) {
          result.paragraphLabels += 1;
          const number = (block.label ?? '').match(/\d+[a-z]?/iu)?.[0];
          if (number) paragraphNumbers.add(number.toLowerCase());
        }
      }
      if (block.type === 'footnote') {
        if (!block.label || !block.text) result.malformedFootnotes += 1;
        else {
          footnoteLabels.add(block.label.trim());
          const set = footnotes.get(block.label.trim()) ?? new Set<string>();
          if (set.has(block.text.trim()) && !result.duplicateFootnotes.includes(block.label.trim())) result.duplicateFootnotes.push(block.label.trim());
          set.add(block.text.trim());
          footnotes.set(block.label.trim(), set);
        }
      }
      if (block.type === 'table') {
        result.tables += 1;
        const firstRow = block.children?.[0];
        if (firstRow && !(firstRow.children ?? []).some((cell) => cell.type === 'tableHeaderCell')) result.tablesWithoutHeaderRow += 1;
      }
      if (block.text && block.type !== 'footnote' && !quoted) texts.push(block.text);
      if (block.children) visit(block.children, currentPath, quoted || block.type === 'quotedProvision');
    });
  };
  visit(version.body, [], false);

  for (const note of version.sourceNotes ?? []) footnoteLabels.add(note.label.trim());
  // Fußnotenzeichen der Form „Wort1)“ / „Wort²“ im Fließtext (Legacy-Word-HTML): nur prüfen, wenn es Fußnoten gibt.
  if (footnoteLabels.size > 0) {
    const marks = new Set<string>();
    // Nur unmittelbar an ein Wort angehängte Zeichen („Gesetz1)“, „Absatz2)“ ohne Leerzeichen); „(Absatz 1)“ ist kein Fußnotenzeichen.
    for (const text of texts) for (const match of text.matchAll(/(?<=[A-Za-zÄÖÜäöüß])(\d{1,2})\)(?=\s|$)/gu)) marks.add(match[1]!);
    for (const mark of [...marks].sort()) if (!footnoteLabels.has(mark) && !footnoteLabels.has(`${mark})`)) result.footnoteMarksWithoutDefinition.push(mark);
  }
  if (paragraphNumbers.size >= 3) {
    const referenced = new Set<string>();
    for (const text of texts) for (const match of text.matchAll(/§\s?(\d{1,3}[a-z]?)\b(?![\s\S]{0,40}\b(?:des|der|BGB|SGB|GG|VwVfG|LVwG|StGB|ZPO|StPO|VwGO|GewO|AO|EStG|HGB|BauGB|GO|KrO|LWG|WHG|BNatSchG|LNatSchG|LBO|BauO|SchulG|LBG|BeamtStG|LHO|GkG|GKG|TVöD|TV-L)\b)/gu)) referenced.add(match[1]!.toLowerCase());
    const maximum = Math.max(...[...paragraphNumbers].map((number) => Number.parseInt(number, 10)));
    for (const number of [...referenced].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))) {
      // Nur deutlich außerhalb des eigenen Zählbereichs liegende Verweise sind verdächtig (fremde Norm ohne Zusatz ist häufig).
      if (!paragraphNumbers.has(number) && Number.parseInt(number, 10) > maximum) result.danglingInternalParagraphRefs.push(`§ ${number}`);
    }
  }
  return result;
}
