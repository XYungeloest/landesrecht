/**
 * Rekonstruktionsschlange: Für welche Normen der Klasse `changed-after-baseline` lässt sich die
 * Fassung vom Stichtag beschaffen – und in welcher Reihenfolge lohnt der Aufwand?
 *
 * Die Schlange **entscheidet nichts über den Normtext**. Sie ordnet, was zu tun ist, nach dem, was
 * die Belege hergeben. Wie viele Schritte zwischen Stichtag und heute liegen, ist aus dem
 * Ereignisregister ablesbar; ob ein einzelner Schritt rückwärts anwendbar ist, entscheidet erst der
 * Blick in den Änderungsbefehl – und wo er das nicht hergibt, bleibt es bei
 * `non-invertible-amendment`.
 *
 * Die Reihenfolge folgt dem Ertrag je Aufwand: Eine Norm mit einer einzigen Änderung nach dem
 * Stichtag ist meist in einem Schritt zurückzurechnen; eine mit einer Neufassung ist es gar nicht.
 * Wer die langen Ketten zuerst angeht, gewinnt am Ende weniger Bestand.
 */
export const RECONSTRUCTION_STATES = [
  /** Alle Schritte belegt und rückwärts anwendbar – ein Rezept lässt sich schreiben. */
  'recipe-ready',
  /** Ein Teil der Kette ist belegt, ein Teil nicht. */
  'partial-chain',
  /** Keine amtliche Volltextfassung vor dem Stichtag bekannt. */
  'missing-base',
  /** Mindestens ein Schritt ist eine Neufassung oder Ersetzung ohne Alttext. */
  'non-invertible-amendment',
  /** Eine Anlage, Tabelle oder Abbildung fehlt, ohne die der Text unvollständig bliebe. */
  'asset-missing',
  /** Die Belege widersprechen einander. */
  'contradictory',
  /**
   * Der Änderungsbefehl für diese Norm ist in der Verkündung nicht genau einmal auffindbar oder seine
   * Gliederung ist nicht lesbar (`src/reconstruction/structure.ts`).
   */
  'command-unreadable',
  /**
   * Der Befehl bestimmt die vorherige Fassung womöglich, aber in einer Formel, die das Modell nicht
   * maschinell anwendet (Einfügung ganzer Glieder, Umnummerierung, unerkannte Formel).
   */
  'unsupported-formula',
  /** Ort oder zu ändernder Wortlaut ist im heutigen Text nicht eindeutig bestimmt. */
  'ambiguous-target',
  /** Das Inkrafttreten der Änderung für diese Norm ist nicht sicher bestimmbar. */
  'effective-date-undetermined',
  /** Rückwärts und wieder vorwärts ergibt nicht exakt den heutigen Text. */
  'round-trip-failed',
] as const;
export type ReconstructionState = (typeof RECONSTRUCTION_STATES)[number];

/** Ereignistypen, die sich nicht rückwärts anwenden lassen, weil sie den Alttext nicht mitführen. */
export const NON_INVERTIBLE_EVENT_TYPES: readonly string[] = ['recast', 'replace'];

export interface ReconstructionEvent {
  eventType: string;
  eventDate: string;
  citation?: string;
  evidenceStrength?: string;
}

export interface ReconstructionEntry {
  documentId: string;
  state: ReconstructionState;
  /** Zahl der belegten Änderungsschritte zwischen Stichtag und Auswertungsstichtag. */
  steps: number;
  /** Kleinere Zahl = früher angehen. Ergibt sich aus Zustand und Schrittzahl. */
  priority: number;
  reason: string;
  events: ReconstructionEvent[];
}

export interface ReconstructionInput {
  documentId: string;
  /** Ereignisse nach dem Stichtag, die genau diese Norm betreffen. */
  events: readonly ReconstructionEvent[];
  /** Eine amtliche Volltextfassung vor dem Stichtag ist bekannt. */
  hasPreBaselineFullText?: boolean;
  /** Eine Anlage oder Abbildung fehlt. */
  missingAssets?: boolean;
  /** Die Belege widersprechen einander (etwa zwei Fassungen zum selben Tag). */
  contradictory?: boolean;
}

/**
 * Ordnet eine Norm der Klasse `changed-after-baseline` ein.
 *
 * Reihenfolge der Prüfungen ist bindend und geht vom Schwersten zum Leichtesten: Ein Widerspruch
 * schlägt alles, eine fehlende Anlage schlägt die Rückrechnung, eine Neufassung schlägt die Zahl der
 * Schritte. Erst wenn nichts davon zutrifft, entscheidet die Kette.
 */
export function classifyReconstruction(input: ReconstructionInput): ReconstructionEntry {
  const events = [...input.events].sort((left, right) => (left.eventDate < right.eventDate ? -1 : 1));
  const steps = events.length;
  const base = { documentId: input.documentId, steps, events };

  if (input.contradictory) {
    return { ...base, state: 'contradictory', priority: 900, reason: 'Belege widersprechen einander; vor jeder Rekonstruktion zu klären' };
  }
  if (input.missingAssets) {
    return { ...base, state: 'asset-missing', priority: 800, reason: 'Anlage oder Abbildung fehlt; der Text bliebe unvollständig' };
  }
  const nonInvertible = events.filter((event) => NON_INVERTIBLE_EVENT_TYPES.includes(event.eventType));
  if (nonInvertible.length > 0) {
    return {
      ...base,
      state: 'non-invertible-amendment',
      priority: 700 + steps,
      reason: `${nonInvertible.length} Schritt(e) sind Neufassung oder Ersetzung (${nonInvertible.map((event) => `${event.eventType} ${event.eventDate}`).join(', ')}); der Alttext folgt daraus nicht`,
    };
  }
  if (steps === 0) {
    // Der Text ist jünger als der Stichtag, aber kein Ereignis belegt den Schritt. Ohne Beleg gibt es
    // nichts rückzurechnen – die Lücke liegt im Register, nicht in der Norm.
    return { ...base, state: 'missing-base', priority: 600, reason: 'Kein Ereignis nach dem Stichtag belegt die Änderung; die Kette ist unbekannt' };
  }
  if (!input.hasPreBaselineFullText) {
    // Rückrechnung ist trotzdem möglich – sie braucht nur keine Basisfassung, sondern die
    // umgekehrten Änderungsbefehle. Das entscheidet der Blick in den einzelnen Befehl.
    return { ...base, state: 'partial-chain', priority: 100 + steps, reason: `${steps} belegte(r) Änderungsschritt(e); Rückrechnung je Befehl zu prüfen` };
  }
  return { ...base, state: 'recipe-ready', priority: steps, reason: `Amtliche Fassung vor dem Stichtag und ${steps} belegte(r) Schritt(e)` };
}

/**
 * Zustände, die nach der Prüfung des einzelnen Befehls vergeben werden (`src/reconstruction/run.ts`),
 * mit ihrer Priorität in der Schlange. `recipe-ready` ist erledigt und steht vorn; die übrigen ordnen den
 * verbleibenden Aufwand – ein nur nicht angewandter Befehl ist näher an einem Rezept als eine Neufassung.
 */
export const COMMAND_STATE_PRIORITY: Readonly<Record<ReconstructionState, number>> = {
  'recipe-ready': 0,
  'unsupported-formula': 150,
  'ambiguous-target': 200,
  'round-trip-failed': 250,
  'effective-date-undetermined': 300,
  'command-unreadable': 350,
  'partial-chain': 100,
  'missing-base': 600,
  'non-invertible-amendment': 700,
  'asset-missing': 800,
  contradictory: 900,
};

/** Sortiert die Schlange: kleinere Priorität zuerst, bei Gleichstand nach Dokument-ID. */
export function orderQueue(entries: readonly ReconstructionEntry[]): ReconstructionEntry[] {
  return [...entries].sort((left, right) => (left.priority !== right.priority ? left.priority - right.priority : left.documentId < right.documentId ? -1 : 1));
}
