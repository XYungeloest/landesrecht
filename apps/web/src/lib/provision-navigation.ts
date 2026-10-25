/** Navigation ausschließlich über echte Struktureinheiten der gewählten Fassung. */
import { getProvisionEntries, type AnchorMap, type ProvisionEntry } from '@landesrecht/legal-core/lib/body.ts';
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { getProvisionUrl } from '@landesrecht/legal-core/lib/routes.ts';
export interface ProvisionNavItem { anchor: string; label: string; title?: string; context: string; url: string }
export interface ProvisionNavigationModel {
  current: ProvisionNavItem;
  previous?: ProvisionNavItem;
  next?: ProvisionNavItem;
  groups: Array<{ label: string; items: ProvisionNavItem[] }>;
}
export function buildProvisionNavigation(body: readonly NormBodyBlock[], anchors: AnchorMap, jurisdiction: JurisdictionId, slug: string, currentAnchor: string, versionId?: string): ProvisionNavigationModel {
  const entries = getProvisionEntries(body, anchors);
  const items = entries.map((entry): ProvisionNavItem => {
    const context: string[] = [];
    let siblings = body;
    for (const index of entry.path.slice(0,-1)) {
      const ancestor = siblings[index]!;
      const label = [ancestor.label,ancestor.title].filter(Boolean).join(' ');
      if (label) context.push(label);
      siblings = ancestor.children ?? [];
    }
    return {anchor:entry.anchor,label:entry.block.label ?? entry.block.title ?? 'Vorschrift',title:entry.block.title,context:context.join(' · '),url:getProvisionUrl(jurisdiction,slug,entry.anchor,versionId)};
  });
  const index = items.findIndex((item)=>item.anchor === currentAnchor);
  if (index < 0) throw new Error('Aktuelle Vorschrift fehlt in der Fassungsnavigation');
  const groups: ProvisionNavigationModel['groups'] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last?.label === item.context) last.items.push(item);
    else groups.push({label:item.context,items:[item]});
  }
  return {current:items[index]!,previous:items[index-1],next:items[index+1],groups};
}
/** Native GET-Auswahl: ausschließlich ein auf dieser Fassung vorhandenes Ziel zulassen. */
export function resolveProvisionSelection(params: URLSearchParams, entries: readonly ProvisionEntry[]): ProvisionEntry | undefined {
  const values = params.getAll('vorschrift');
  if (values.length !== 1 || !values[0] || values[0].length > 512) return undefined;
  return entries.find((entry)=>entry.anchor === values[0]);
}
