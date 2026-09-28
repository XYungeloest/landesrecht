/**
 * `ledger-sync`: gleicht die Ereignisstatus in `data/simulation/<land>/ledger.json` mit dem Konsolidierungsmanifest ab.
 *
 * Ein Ereignis mit Status `pending` wird `applied`, sobald seine Rechtswirkung im Bestand steht: Der Akt ist
 * materialisiert (Manifest `acts`), und – bei `amend`, `repeal`, `replace`, `recast`, `correction` – ein Rezept des
 * Akts auf eine Zielnorm des Ereignisses ist angewandt (Manifest `recipes`; der Pfad wird als `recipe` eingetragen).
 * Ein `expire`-Ereignis gilt als angewandt, wenn die Norm selbst ihr `expiryDate` trägt (befristete Regelung).
 * `review`, `blocked` und `not-promulgated` bleiben unberührt: Das sind fachliche Entscheidungen, keine Ableitungen.
 * Umgekehrt ist ein `applied`-Ereignis ohne materialisierten Akt ein Fehler (der Bestand widerspricht dem Ledger).
 */
import { join } from 'node:path';

import { readJsonFile, writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';

import { SIMULATION_DATA_DIR } from '../common/paths.ts';
import { jsonText, manifestPath, normRelativeDir } from '../consolidate/files.ts';
import type { ConsolidationManifest } from '../consolidate/manifest.ts';

export const LEDGER_SCHEMA = 'landesrecht-simulation-ledger/1' as const;

/** Ereignisarten, deren Rechtswirkung ein angewandtes Rezept auf die Zielnorm verlangt. */
const RECIPE_EVENT_TYPES = new Set(['amend', 'repeal', 'replace', 'recast', 'correction']);

export interface LedgerEvent {
  id: string;
  type: string;
  status: string;
  effectiveDate?: string | null;
  act?: { slug?: string | null; title?: string } | null;
  targets?: Array<{ slug?: string; kind?: string; title?: string }>;
  recipe?: string;
  [key: string]: unknown;
}

export interface LedgerFile {
  schemaVersion: typeof LEDGER_SCHEMA;
  jurisdiction: JurisdictionId;
  events: LedgerEvent[];
  [key: string]: unknown;
}

export interface LedgerSyncChange {
  id: string;
  from: string;
  to: string;
  recipe?: string;
}

export interface LedgerSyncResult {
  jurisdiction: JurisdictionId;
  path: string;
  changes: LedgerSyncChange[];
  /** `pending`-Ereignisse, deren Rechtswirkung noch nicht im Bestand steht (mit Grund). */
  pending: Array<{ id: string; reason: string }>;
  /** Widersprüche zwischen Ledger und Bestand (Exit 1). */
  errors: string[];
  counts: Record<string, number>;
  written: boolean;
}

export function ledgerPath(jurisdiction: JurisdictionId): string {
  return `${SIMULATION_DATA_DIR}/${jurisdiction}/ledger.json`;
}

function withRecipe(event: LedgerEvent, recipe: string): LedgerEvent {
  if (event.recipe === recipe) return event;
  // `recipe` direkt hinter `status`, wie im dokumentierten Beispiel; die übrige Schlüsselfolge bleibt.
  const entries = Object.entries(event).filter(([key]) => key !== 'recipe');
  const index = entries.findIndex(([key]) => key === 'status');
  entries.splice(index + 1, 0, ['recipe', recipe]);
  return Object.fromEntries(entries) as LedgerEvent;
}

export async function syncLedger(root: string, jurisdiction: JurisdictionId, options: { write: boolean }): Promise<LedgerSyncResult> {
  const path = ledgerPath(jurisdiction);
  const ledger = await readJsonFile<LedgerFile>(join(root, path));
  if (!ledger || ledger.schemaVersion !== LEDGER_SCHEMA || !Array.isArray(ledger.events)) throw new Error(`${path}: kein Ledger (${LEDGER_SCHEMA})`);
  if (ledger.jurisdiction !== jurisdiction) throw new Error(`${path}: jurisdiction ${ledger.jurisdiction} passt nicht zu ${jurisdiction}`);
  const manifest = await readJsonFile<ConsolidationManifest>(join(root, manifestPath(jurisdiction)));
  const materialized = new Set((manifest?.acts ?? []).map((act) => act.slug));
  const recipes = new Map((manifest?.recipes ?? []).map((recipe) => [`${recipe.amendmentAct}\u0000${recipe.target}`, recipe.recipe]));

  const result: LedgerSyncResult = { jurisdiction, path, changes: [], pending: [], errors: [], counts: {}, written: false };
  const events: LedgerEvent[] = [];
  for (const event of ledger.events) {
    const slug = event.act?.slug ?? undefined;
    const targets = (event.targets ?? []).map((target) => target.slug).filter((target): target is string => typeof target === 'string');
    const recipe = slug ? targets.map((target) => recipes.get(`${slug}\u0000${target}`)).find((found) => found !== undefined) : undefined;
    let next = event;
    if (event.status === 'applied') {
      if (!slug || !materialized.has(slug)) result.errors.push(`${event.id}: applied, aber Akt ${slug ?? '(ohne slug)'} ist nicht materialisiert`);
      else if (RECIPE_EVENT_TYPES.has(event.type) && recipe === undefined) result.errors.push(`${event.id}: applied, aber kein angewandtes Rezept von ${slug} auf ${targets.join(', ') || '(kein Ziel)'}`);
      else if (recipe !== undefined) next = withRecipe(event, recipe);
    } else if (event.status === 'pending') {
      if (!slug || !materialized.has(slug)) result.pending.push({ id: event.id, reason: slug ? `Akt ${slug} nicht materialisiert` : 'kein Akt' });
      else if (RECIPE_EVENT_TYPES.has(event.type)) {
        if (recipe === undefined) result.pending.push({ id: event.id, reason: `kein angewandtes Rezept von ${slug} auf ${targets.join(', ') || '(kein Ziel)'}` });
        else next = withRecipe({ ...event, status: 'applied' }, recipe);
      } else if (event.type === 'expire') {
        const meta = await readJsonFile<{ expiryDate?: string | null }>(join(root, normRelativeDir(jurisdiction, slug), 'meta.json'));
        if (targets.every((target) => target === slug) && typeof meta?.expiryDate === 'string') next = { ...event, status: 'applied' };
        else result.pending.push({ id: event.id, reason: `Außerkrafttreten nicht am Akt ${slug} vermerkt (expiryDate)` });
      } else next = { ...event, status: 'applied' };
      if (next !== event) result.changes.push({ id: event.id, from: event.status, to: next.status, ...(next.recipe ? { recipe: next.recipe } : {}) });
    }
    events.push(next);
    result.counts[next.status] = (result.counts[next.status] ?? 0) + 1;
  }
  const text = jsonText({ ...ledger, events });
  if (options.write && result.errors.length === 0 && result.changes.length > 0) {
    await writeFileAtomic(join(root, path), text, { skipIfUnchanged: true });
    result.written = true;
  }
  return result;
}

export function renderLedgerSyncLines(result: LedgerSyncResult): string[] {
  const lines = [`Ledger ${result.jurisdiction}: ${Object.entries(result.counts).map(([status, count]) => `${status} ${count}`).join(', ')}`];
  for (const change of result.changes) lines.push(`  ${change.id}: ${change.from} → ${change.to}${change.recipe ? ` (${change.recipe})` : ''}`);
  for (const entry of result.pending) lines.push(`  offen: ${entry.id} – ${entry.reason}`);
  for (const error of result.errors) lines.push(`Fehler: ${error}`);
  if (result.errors.length > 0) lines.push('Nichts geschrieben (Widerspruch zwischen Ledger und Bestand).');
  else if (result.written) lines.push(`Geschrieben: ${result.path}`);
  else if (result.changes.length === 0) lines.push(`${result.path} unverändert.`);
  else lines.push(`Dry-run: ${result.changes.length} Ereignis(se) würden auf applied gesetzt (--write).`);
  return lines;
}
