/**
 * Registry der Stores je Jurisdiktion. Sie ist die einzige Stelle, die weiß, welche
 * Jurisdiktion in welcher Datenbank liegt. Eine Suche über „alle Länder“ fragt jeden Store
 * einzeln und führt die Seiten zusammen (mergeSearchPages).
 */
import { JURISDICTION_IDS, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { mergeSearchPages, type SearchResultPage, type SearchState } from '@landesrecht/search/index.ts';

import { D1_BINDINGS } from './bindings.ts';
import { createD1NormStore } from './d1-store.ts';
import type { D1Database } from './d1-types.ts';
import type { NormStore } from './store.ts';

export interface StoreRegistry {
  get(jurisdiction: JurisdictionId): NormStore;
  has(jurisdiction: JurisdictionId): boolean;
  list(): NormStore[];
  /** Jurisdiktionsübergreifende Suche; leere Jurisdiktionsliste bedeutet alle. */
  search(state: SearchState): Promise<SearchResultPage>;
}

export function createStoreRegistry(stores: Partial<Record<JurisdictionId, NormStore>>): StoreRegistry {
  return {
    get(jurisdiction) {
      const store = stores[jurisdiction];
      if (!store) throw new Error(`Für die Jurisdiktion „${jurisdiction}“ ist kein Store konfiguriert.`);
      return store;
    },
    has(jurisdiction) {
      return Boolean(stores[jurisdiction]);
    },
    list() {
      return JURISDICTION_IDS.flatMap((jurisdiction) => (stores[jurisdiction] ? [stores[jurisdiction]] : []));
    },
    async search(state) {
      const targets = (state.jurisdictions.length > 0 ? state.jurisdictions : [...JURISDICTION_IDS]).filter((jurisdiction) => stores[jurisdiction]);
      if (targets.length === 1) return stores[targets[0]!]!.search(state);
      // Jeder Store liefert seine Seite ab Offset 0 bis offset+limit; die Zusammenführung schneidet die Seite global.
      const perStore: SearchState = { ...state, offset: 0, limit: state.offset + state.limit };
      const pages = await Promise.all(targets.map((jurisdiction) => stores[jurisdiction]!.search({ ...perStore, jurisdictions: [jurisdiction] })));
      return mergeSearchPages(pages, state);
    },
  };
}

/** Bindet die D1-Datenbanken aus der Worker-Umgebung an die Jurisdiktionen. */
export function createRegistryFromEnv(env: Record<string, unknown>): StoreRegistry {
  const stores: Partial<Record<JurisdictionId, NormStore>> = {};
  for (const jurisdiction of JURISDICTION_IDS) {
    const binding = env[D1_BINDINGS[jurisdiction]];
    if (binding && typeof (binding as D1Database).prepare === 'function') {
      stores[jurisdiction] = createD1NormStore(binding as D1Database, jurisdiction);
    }
  }
  return createStoreRegistry(stores);
}

export function missingBindings(env: Record<string, unknown>): string[] {
  return JURISDICTION_IDS.map((jurisdiction) => D1_BINDINGS[jurisdiction]).filter((binding) => !env[binding]);
}
