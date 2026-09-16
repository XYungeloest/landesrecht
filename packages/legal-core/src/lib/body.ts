/**
 * Helfer für den Normkörper: Sprungziele, Inhaltsübersicht, Textextraktion und
 * Strukturadressen. Reine Funktionen über NormBodyBlock, ohne Oberflächenbezug; werden von
 * Suche, Projektion und Oberfläche gemeinsam genutzt.
 */
import { PROVISION_TYPES, STRUCTURAL_CONTAINER_TYPES, type NormBodyBlock, type StructureType } from './schema.ts';

const ANCHOR_PREFIX: Partial<Record<StructureType, string>> = {
  book: 'buch',
  part: 'teil',
  chapter: 'kapitel',
  section: 'abschnitt',
  subsection: 'unterabschnitt',
  paragraph: 'paragraph',
  article: 'artikel',
  annex: 'anlage',
  preamble: 'vorbemerkung',
};

export function anchorSlug(value: string): string {
  return value
    .replace(/§/gu, 'paragraph')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isAnchoredBlock(block: NormBodyBlock): boolean {
  return STRUCTURAL_CONTAINER_TYPES.includes(block.type);
}

export function isProvisionBlock(block: NormBodyBlock): boolean {
  return PROVISION_TYPES.includes(block.type);
}

/** Gliederungswörter, die im Sprungziel durch den Typpräfix ersetzt werden („Art. 5“ → „artikel-5“). */
const LABEL_TYPE_WORDS = /^(?:§{1,2}|Artikel|Art\.?|Anlage|Teil|Buch|Kapitel|Unterabschnitt|Abschnitt|Vorbemerkung)\s*|\s*(?:Teil|Buch|Kapitel|Unterabschnitt|Abschnitt)$/giu;

export function labelAnchorSlug(label: string): string {
  return anchorSlug(label.replace(LABEL_TYPE_WORDS, ' ').trim()) || anchorSlug(label);
}

function baseAnchor(path: readonly number[], block: NormBodyBlock, namespace?: string): string {
  const prefix = ANCHOR_PREFIX[block.type] ?? block.type;
  const source = block.label ? labelAnchorSlug(block.label) : '';
  const stem = source ? `${prefix}-${source}` : `${prefix}-${path.join('-')}`;
  return namespace ? `${namespace}-${stem}` : stem;
}

export type AnchorMap = Map<string, string>;

/**
 * Berechnet kollisionsfreie, semantische Sprungziele („paragraph-3“, „artikel-7a“) für alle
 * Gliederungsblöcke. Schlüssel ist der Pfad („0.2“). Zitierte Vorschriften erhalten den
 * Namensraum `zitat`, damit sie die Adressen der eigenen Norm nicht belegen. Blöcke innerhalb
 * eines Artikels oder einer Anlage tragen dessen Sprungziel als Namensraum
 * („artikel-12-paragraph-1“, „anlage-2-paragraph-1“), weil dort die Zählung neu beginnt.
 */
export function buildAnchorMap(blocks: readonly NormBodyBlock[]): AnchorMap {
  const anchors: AnchorMap = new Map();
  const used = new Set<string>();

  function visit(entries: readonly NormBodyBlock[], path: number[], namespace?: string): void {
    entries.forEach((block, index) => {
      const currentPath = [...path, index];
      if (isAnchoredBlock(block)) {
        let candidate = baseAnchor(currentPath, block, namespace);
        if (used.has(candidate)) {
          candidate = `${candidate}--${currentPath.join('-')}`;
          let counter = 2;
          while (used.has(candidate)) {
            candidate = `${baseAnchor(currentPath, block, namespace)}--${currentPath.join('-')}-${counter}`;
            counter += 1;
          }
        }
        used.add(candidate);
        anchors.set(currentPath.join('.'), candidate);
      }
      if (!block.children) return;
      const scoped = (block.type === 'article' || block.type === 'annex') ? anchors.get(currentPath.join('.')) : undefined;
      visit(block.children, currentPath, block.type === 'quotedProvision' ? 'zitat' : scoped ?? namespace);
    });
  }

  visit(blocks, []);
  return anchors;
}

export function getBlockAnchor(anchors: AnchorMap, path: readonly number[]): string | undefined {
  return anchors.get(path.join('.'));
}

export interface OutlineEntry {
  anchor: string;
  type: StructureType;
  label?: string;
  title?: string;
  depth: number;
  children: OutlineEntry[];
}

/** Inhaltsübersicht aus Gliederungsblöcken (ohne zitierte Vorschriften). */
export function buildOutline(blocks: readonly NormBodyBlock[], anchors: AnchorMap = buildAnchorMap(blocks)): OutlineEntry[] {
  function visit(entries: readonly NormBodyBlock[], path: number[], depth: number): OutlineEntry[] {
    const result: OutlineEntry[] = [];
    entries.forEach((block, index) => {
      const currentPath = [...path, index];
      if (block.type === 'quotedProvision') return;
      if (isAnchoredBlock(block)) {
        const anchor = anchors.get(currentPath.join('.'));
        if (anchor) {
          const entry: OutlineEntry = { anchor, type: block.type, depth, children: block.children ? visit(block.children, currentPath, depth + 1) : [] };
          if (block.label !== undefined) entry.label = block.label;
          if (block.title !== undefined) entry.title = block.title;
          result.push(entry);
        }
        return;
      }
      if (block.children) result.push(...visit(block.children, currentPath, depth));
    });
    return result;
  }
  return visit(blocks, [], 0);
}

/** Vollständiger Text eines Blocks einschließlich Nachkommen (Absatz für Absatz). */
export function collectBlockText(block: NormBodyBlock, includeHeading = false): string[] {
  const parts: string[] = [];
  if (includeHeading && (block.label || block.title)) parts.push([block.label, block.title].filter(Boolean).join(' '));
  if (block.text) parts.push(block.text);
  for (const child of block.children ?? []) parts.push(...collectBlockText(child, includeHeading));
  return parts;
}

export interface StructuralReference {
  /** Nummer des Paragraphen („3“, „12a“). */
  paragraph?: string;
  /** Nummer des Artikels. */
  article?: string;
  /** Absatznummern unterhalb der Einheit. */
  subsections?: string[];
  /** Dezimalnummer einer Verwaltungsvorschrift („2.3“). */
  number?: string;
}

/** Nummer aus einem Einheitenkennzeichen: „§ 3a“ → „3a“; römische Artikel („Artikel IV“) → „iv“. */
export function getStructuralReferenceNumber(label: string | undefined): string | undefined {
  const normalized = (label ?? '').trim().toLowerCase();
  return normalized.match(/[0-9]+[a-z]?/u)?.[0] ?? normalized.match(/^(?:artikel|art\.?)\s+([ivxlcdm]+)$/u)?.[1];
}

export function getSubsectionNumber(block: NormBodyBlock): string | undefined {
  return (block.label ?? '').trim().match(/^\(\s*([0-9]+[a-z]?)\s*\)$/iu)?.[1]?.toLowerCase();
}

/** Strukturadresse einer Provision („§ 3 Absatz 2“ → { paragraph: '3', subsections: ['1','2'] }). */
export function getStructuralReference(block: NormBodyBlock): StructuralReference | undefined {
  // Dezimalnummern von Verwaltungsvorschriften („2.3.1“) sind eigene Strukturadressen („Nr. 2.3.1“).
  if ((block.type === 'section' || block.type === 'subsection') && /^\d{1,2}(?:\.\d{1,2}){0,5}\.?$/u.test((block.label ?? '').trim())) return { number: block.label!.trim().replace(/\.$/u, '') };
  const number = getStructuralReferenceNumber(block.label);
  if (!number) return undefined;
  const subsections: string[] = [];
  function visit(entries: readonly NormBodyBlock[]): void {
    for (const child of entries) {
      if (child.type === 'quotedProvision') continue;
      if (child.type === 'subparagraph') {
        const subsection = getSubsectionNumber(child);
        if (subsection) subsections.push(subsection);
      }
      if (child.children) visit(child.children);
    }
  }
  visit(block.children ?? []);
  if (block.type === 'paragraph') return subsections.length > 0 ? { paragraph: number, subsections } : { paragraph: number };
  if (block.type === 'article') return subsections.length > 0 ? { article: number, subsections } : { article: number };
  return undefined;
}

/** Zählt Blocktypen rekursiv (für Audits und Kompatibilitätstests). */
export function countBlockTypes(blocks: readonly NormBodyBlock[]): Record<string, number> {
  const counts: Record<string, number> = {};
  function visit(entries: readonly NormBodyBlock[]): void {
    for (const block of entries) {
      counts[block.type] = (counts[block.type] ?? 0) + 1;
      if (block.children) visit(block.children);
    }
  }
  visit(blocks);
  return counts;
}
