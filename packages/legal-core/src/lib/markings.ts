/** Anzeigeadressen aus vorhandener Rechtsstruktur; keine Satz-/Wortlautzerlegung. */
import { anchorSlug, getProvisionEntries, getSubsectionNumber, type AnchorMap } from './body.ts';
import type { NormBodyBlock } from './schema.ts';

export const MAX_MARKINGS = 50;
export const MAX_MARK_QUERY_LENGTH = 8192;
const validId = (id: string) => /^[a-z0-9-]{1,160}$/u.test(id);
export interface MarkingTarget {
  id: string;
  path: string;
  provisionId: string;
  /** Eindeutige Adresse einschließlich umgebender Artikel/Anlagen. */
  provisionLabel: string;
  subsection?: string;
}
function provisionLabel(block: NormBodyBlock): string | undefined {
  const label = (block.label ?? '').trim();
  if (block.type === 'paragraph') {
    const number = label.match(/^§\s*(\d+[a-z]?)$/iu)?.[1];
    return number ? `§ ${number}` : undefined;
  }
  if (block.type === 'article') {
    const number = label.match(/^(?:Art\.?|Artikel)\s+(\d+[a-z]?|[IVXLCDM]+)$/iu)?.[1];
    return number ? `Art. ${/^\d/u.test(number) ? number : number.toUpperCase()}` : undefined;
  }
  return undefined;
}
export function getMarkingTargets(body: readonly NormBodyBlock[], anchors: AnchorMap): MarkingTarget[] {
  const candidates: MarkingTarget[] = [];
  for (const entry of getProvisionEntries(body, anchors)) {
    const label = provisionLabel(entry.block);
    if (!label || !validId(entry.anchor)) continue;
    let siblings = body;
    const context: string[] = [];
    let reliable = true;
    for (const index of entry.path.slice(0,-1)) {
      const parent = siblings[index]!;
      if (parent.type === 'annex' || parent.type === 'article' || parent.type === 'paragraph') {
        const parentLabel = parent.type === 'annex' ? parent.label?.trim() : provisionLabel(parent);
        if (!parentLabel) reliable = false;
        else context.push(parentLabel);
      }
      siblings = parent.children ?? [];
    }
    if (!reliable) continue;
    const address = [...context,label].join(', ');
    const unit: MarkingTarget = {id:entry.anchor,path:entry.path.join('.'),provisionId:entry.anchor,provisionLabel:address};
    candidates.push(unit);
    const children = entry.block.children ?? [];
    const numbers = children.map((child) => (child.type === 'subparagraph' || child.type === 'paragraphText') ? getSubsectionNumber(child) : undefined);
    children.forEach((child,index) => {
      const number = numbers[index];
      // Direkte, einmalig bezeichnete Absätze; keine zitierten/verschachtelten Scheineinheiten.
      if (!number || numbers.filter((value) => value === number).length !== 1) return;
      const id = `${entry.anchor}-abs-${anchorSlug(child.label!)}`;
      if (validId(id)) candidates.push({...unit,id,path:[...entry.path,index].join('.'),subsection:number});
    });
  }
  const units = candidates.filter((target) => !target.subsection);
  const ambiguous = new Set(units.filter((unit) => units.filter((other) => other.provisionLabel === unit.provisionLabel).length > 1).map((unit) => unit.provisionId));
  return candidates.filter((target) => !ambiguous.has(target.provisionId));
}
/** Begrenzte URL-Eingabe gegen die tatsächlich dargestellten Ziele; Reihenfolge stets Dokumentreihenfolge. */
export function parseMarkings(params: URLSearchParams, targets: readonly MarkingTarget[]): string[] {
  const values = params.getAll('mark');
  if (values.reduce((sum,value)=>sum+value.length,0)>MAX_MARK_QUERY_LENGTH) return [];
  const requested = new Set(values.flatMap((value)=>value.split(',')).slice(0,MAX_MARKINGS).filter(validId));
  return targets.filter((target)=>requested.has(target.id)).map((target)=>target.id).slice(0,MAX_MARKINGS);
}
export function formatMarkedCitation(targets: readonly MarkingTarget[], ids: readonly string[], normName: string, versionNote?: string): string {
  const selected = new Set(ids);
  const groups = new Map<string, MarkingTarget[]>();
  for (const target of targets) if (selected.has(target.id)) groups.set(target.provisionId,[...(groups.get(target.provisionId) ?? []),target]);
  const citations = [...groups.values()].map((group) => {
    const numbers = group.filter((target)=>target.subsection).map((target)=>target.subsection!);
    const joined = numbers.length < 2 ? numbers.join('') : `${numbers.slice(0,-1).join(', ')} und ${numbers.at(-1)}`;
    const subsection = group.some((target)=>!target.subsection) || !joined ? '' : ` Abs. ${joined}`;
    return `${group[0]!.provisionLabel}${subsection} ${normName}`;
  });
  return citations.length ? `${citations.join('; ')}${versionNote ? ` (${versionNote})` : ''}` : '';
}
