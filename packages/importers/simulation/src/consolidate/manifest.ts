/**
 * Konsolidierungsmanifest je Land (`data/simulation/<land>/consolidation-manifest.json`, Schema S9): der
 * Nachweis, dass jede Sim-Fassung aus Baseline + Rezepten bzw. aus einem Sim-Akt reproduzierbar ist –
 * je Akt und je Rezept die geschriebene Fassung mit SHA-256 der Datei, der Seedhash, gesperrte Ziele mit Grund
 * und das Ergebnis der Wortlautprobe. `consolidate --check` vergleicht den fachlichen Kern (`comparableManifest`).
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';

export const CONSOLIDATION_MANIFEST_SCHEMA = 'landesrecht-simulation-consolidation-manifest/1' as const;

export const BLOCKED_TARGET_CODES = [
  /** Zielnorm ist nicht im Bestand (kein Verzeichnis unter content/norms/<land>/). */
  'target-missing',
  /** Keine gespeicherte Fassung vor dem Wirkdatum. */
  'seed-missing',
  /** Hash- oder Alttexterwartung des Rezepts stimmt nicht mit der gespeicherten Fassung überein. */
  'hash-mismatch',
  /** Zielanker null- oder mehrdeutig. */
  'anchor-mismatch',
  /** Andere Verletzung des Operationsvertrags. */
  'recipe-failed',
  /** Ein früheres Rezept derselben Zielnorm ist gesperrt; spätere Rezepte werden nicht angewandt. */
  'blocked-by-earlier-recipe',
  /** Ausgangsfassung ohne akzeptierten Baseline-Seed oder mit abweichendem Inhalt (data/simulation/baseline-locks.json). */
  'seed-unaccepted',
] as const;
export type BlockedTargetCode = (typeof BLOCKED_TARGET_CODES)[number];

export interface BlockedTarget {
  target: string;
  amendmentAct: string;
  recipe: string;
  effectiveDate: string;
  code: BlockedTargetCode;
  reason: string;
}

export interface ManifestTextCheck {
  blocks: number;
  found: number;
  foundLoosely: number;
  missing: number;
  /** Wortlautprobe nicht ausführbar (Textauszug fehlt); nur mit Override zulässig. */
  skipped?: string;
}

export interface ManifestAct {
  slug: string;
  versionId: string;
  versionSha256: string;
  metaSha256: string;
  historySha256: string;
  /** Blattausgabe; `null` bei Einzelakt ohne Blattausgabe. */
  publication: string | null;
  transcribedFrom: string;
  textCheck: ManifestTextCheck;
  textCheckOverride?: string;
}

export interface ManifestRecipe {
  recipe: string;
  amendmentAct: string;
  target: string;
  effectiveDate: string;
  sameDayOrder?: number;
  /** `correction`: deklaratorische Berichtigung der Fassung `versionId` (kein Fassungswechsel). */
  kind?: 'correction';
  repealsLaw: boolean;
  seedVersionId: string;
  seedHash: string;
  /** Erzeugte Fassung; `null` bei einer Aufhebung (keine neue Fassung). */
  versionId: string | null;
  versionSha256: string | null;
}

export interface ConsolidationManifest {
  schemaVersion: typeof CONSOLIDATION_MANIFEST_SCHEMA;
  jurisdiction: JurisdictionId;
  generatedAt: string;
  baselineDate: string;
  referenceDate: string;
  counts: { acts: number; recipes: number; versions: number; repeals: number; blockedTargets: number };
  acts: ManifestAct[];
  recipes: ManifestRecipe[];
  blockedTargets: BlockedTarget[];
}

/** Fachlicher Kern des Manifests ohne Laufmetadaten – Grundlage des `--check`-Vergleichs. */
export function comparableManifest(manifest: ConsolidationManifest): string {
  return JSON.stringify({
    jurisdiction: manifest.jurisdiction,
    baselineDate: manifest.baselineDate,
    referenceDate: manifest.referenceDate,
    acts: [...manifest.acts].sort((left, right) => left.slug.localeCompare(right.slug)).map((act) => ({ slug: act.slug, versionId: act.versionId, versionSha256: act.versionSha256, metaSha256: act.metaSha256, historySha256: act.historySha256, textCheckOverride: act.textCheckOverride ?? null })),
    recipes: [...manifest.recipes].sort((left, right) => left.recipe.localeCompare(right.recipe)),
    blockedTargets: [...manifest.blockedTargets].sort((left, right) => left.recipe.localeCompare(right.recipe)),
  });
}
