/**
 * Registry der Stores je Jurisdiktion. Sie ist die einzige Stelle, die weiß, welche
 * Jurisdiktion in welcher Datenbank liegt. Eine Suche über „alle Länder“ fragt jeden Store
 * einzeln und führt die Seiten zusammen (mergeSearchPages).
 */
import { JURISDICTION_IDS, JURISDICTIONS, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { mergeSearchPages, type SearchResultPage, type SearchState } from '@landesrecht/search/index.ts';

import { RUNTIME_D1_BINDINGS } from './bindings.ts';
import { createD1NormStore } from './d1-store.ts';
import type { D1Database } from './d1-types.ts';
import { createOstRechtD1Store } from './ostrecht-d1-store.ts';
import { createReadOnlyD1 } from './read-only-d1.ts';
import { getStoreSearchCoverage, type NormStore, type SearchCoverage } from './store.ts';

/**
 * Verfügbarkeit einer Jurisdiktion in der Registry. In Produktion ist jede Jurisdiktion `available` (fehlende Bindings sind
 * ein Konfigurationsfehler, `assertCompleteBindings`). Nur im lokalen Entwicklungs-/Testbetrieb kann eine externe Quelle
 * fehlen (`unavailable-local`: kein Store, Anfragen an diese Jurisdiktion → 503) oder eine lokale Kopie/Testfixture
 * dienen (`fixture`: Teilbestand, nur Entwicklung, nie als vollständig ausgegeben).
 */
export type JurisdictionAvailabilityState = 'available' | 'unavailable-local' | 'fixture';

export interface JurisdictionAvailability {
  state: JurisdictionAvailabilityState;
  /** `development` für jeden Zustand außer `available` (nie in Produktion). */
  mode?: 'development';
  /** Diagnose ohne Umgebungswerte (Binding-Namen, Contract-Befund). */
  reason?: string;
}

/** Anfrage an eine lokal nicht verfügbare Jurisdiktion (nur Entwicklung): 503 statt 500 für die ganze Website. */
export class JurisdictionUnavailableError extends Error {
  readonly jurisdiction: JurisdictionId;
  readonly availability: JurisdictionAvailability;

  constructor(jurisdiction: JurisdictionId, availability: JurisdictionAvailability) {
    super(`Jurisdiktion „${jurisdiction}“ ist lokal nicht verfügbar (${availability.state}${availability.reason ? `: ${availability.reason}` : ''}).`);
    this.name = 'JurisdictionUnavailableError';
    this.jurisdiction = jurisdiction;
    this.availability = availability;
  }
}

export function isJurisdictionUnavailableError(error: unknown): error is JurisdictionUnavailableError {
  return error instanceof JurisdictionUnavailableError || (error instanceof Error && error.name === 'JurisdictionUnavailableError');
}

export interface StoreRegistry {
  get(jurisdiction: JurisdictionId): NormStore;
  has(jurisdiction: JurisdictionId): boolean;
  list(): NormStore[];
  /** Jurisdiktionsübergreifende Suche; leere Jurisdiktionsliste bedeutet alle. */
  search(state: SearchState): Promise<SearchResultPage>;
  /** Suchabdeckung je Jurisdiktion (leere Liste: alle konfigurierten). */
  searchCoverage(jurisdictions?: readonly JurisdictionId[]): Promise<Array<SearchCoverage & { jurisdiction: JurisdictionId }>>;
  /** Verfügbarkeit (Produktion: immer `available` für konfigurierte Stores). */
  availability(jurisdiction: JurisdictionId): JurisdictionAvailability;
  /** Jurisdiktionen, die nicht `available` sind (nur Entwicklung), mit Diagnose. */
  unavailable(): Array<{ jurisdiction: JurisdictionId } & JurisdictionAvailability>;
}

export function createStoreRegistry(stores: Partial<Record<JurisdictionId, NormStore>>, availability: Partial<Record<JurisdictionId, JurisdictionAvailability>> = {}): StoreRegistry {
  const availabilityOf = (jurisdiction: JurisdictionId): JurisdictionAvailability => availability[jurisdiction] ?? (stores[jurisdiction] ? { state: 'available' } : { state: 'unavailable-local', mode: 'development', reason: 'kein Store konfiguriert' });
  return {
    get(jurisdiction) {
      const store = stores[jurisdiction];
      if (!store && availability[jurisdiction]?.state === 'unavailable-local') throw new JurisdictionUnavailableError(jurisdiction, availability[jurisdiction]!);
      if (!store) throw new Error(`Für die Jurisdiktion „${jurisdiction}“ ist kein Store konfiguriert.`);
      return store;
    },
    availability: availabilityOf,
    unavailable() {
      return JURISDICTION_IDS.flatMap((jurisdiction) => {
        const entry = availabilityOf(jurisdiction);
        return entry.state === 'available' ? [] : [{ jurisdiction, ...entry }];
      });
    },
    has(jurisdiction) {
      return Boolean(stores[jurisdiction]);
    },
    list() {
      return JURISDICTION_IDS.flatMap((jurisdiction) => (stores[jurisdiction] ? [stores[jurisdiction]] : []));
    },
    async searchCoverage(jurisdictions = []) {
      const targets = (jurisdictions.length > 0 ? [...jurisdictions] : [...JURISDICTION_IDS]).filter((jurisdiction) => stores[jurisdiction]);
      return Promise.all(targets.map(async (jurisdiction) => ({ jurisdiction, ...(await getStoreSearchCoverage(stores[jurisdiction]!)) })));
    },
    async search(state) {
      // Nur lokal nicht verfügbare Jurisdiktionen angefragt: klarer Fehler statt leerer Treffermenge. Gemischte Anfragen
      // laufen über die verfügbaren Stores; die Lücke weist `unavailable()` aus (Such-API, Suchseite).
      const requested = state.jurisdictions;
      const missing = requested.filter((jurisdiction) => !stores[jurisdiction] && availability[jurisdiction]?.state === 'unavailable-local');
      if (requested.length > 0 && missing.length === requested.length) throw new JurisdictionUnavailableError(missing[0]!, availability[missing[0]!]!);
      const targets = (state.jurisdictions.length > 0 ? state.jurisdictions : [...JURISDICTION_IDS]).filter((jurisdiction) => stores[jurisdiction]);
      if (targets.length === 1) return stores[targets[0]!]!.search(state);
      // Jeder Store liefert seine Seite ab Offset 0 bis offset+limit; die Zusammenführung schneidet die Seite global.
      const perStore: SearchState = { ...state, offset: 0, limit: state.offset + state.limit };
      const pages = await Promise.all(targets.map((jurisdiction) => stores[jurisdiction]!.search({ ...perStore, jurisdictions: [jurisdiction] })));
      return mergeSearchPages(pages, state);
    },
  };
}

/**
 * Bindet die D1-Datenbanken aus der Worker-Umgebung an die Jurisdiktionen. Ost liest über eine Read-only-Hülle aus der
 * OstRecht-D1 (`OSTRECHT_RECHT`); `LANDESRECHT_OST` wird hier bewusst nicht verwendet.
 */
export function createRegistryFromEnv(env: Record<string, unknown>, options: { availability?: Partial<Record<JurisdictionId, JurisdictionAvailability>> } = {}): StoreRegistry {
  const stores: Partial<Record<JurisdictionId, NormStore>> = {};
  for (const jurisdiction of JURISDICTION_IDS) {
    // Lokal nicht verfügbare Jurisdiktion (nur Entwicklung): kein Store, auch wenn ein leeres lokales Binding existiert.
    if (options.availability?.[jurisdiction]?.state === 'unavailable-local') continue;
    const binding = env[RUNTIME_D1_BINDINGS[jurisdiction]];
    if (!binding || typeof (binding as D1Database).prepare !== 'function') continue;
    stores[jurisdiction] = JURISDICTIONS[jurisdiction].runtimeSource === 'ostrecht-d1'
      ? createOstRechtD1Store(createReadOnlyD1(binding as D1Database))
      : createD1NormStore(binding as D1Database, jurisdiction);
  }
  return createStoreRegistry(stores, options.availability);
}

export function missingBindings(env: Record<string, unknown>): string[] {
  return [...new Set(JURISDICTION_IDS.map((jurisdiction) => RUNTIME_D1_BINDINGS[jurisdiction]))].filter((binding) => !env[binding]);
}
