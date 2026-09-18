/**
 * Assets normativer Abbildungen (`figure`-Blöcke): inhaltsadressiert im privaten R2-Bucket `landesrecht-quellen`,
 * je Land unter einem eigenen Präfix. Der Worker liefert sie über `/assets/<land>/<sha256>.<endung>` aus
 * (`apps/web/src/pages/assets/[jurisdiction]/[file].ts`) – nur Schlüssel unter diesem Präfix, gebildet aus einem
 * geprüften SHA-256 und einer erlaubten Endung. Der Bucket selbst bleibt privat; Normseiten lesen weiterhin nur D1.
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';

/** Präfix der Abbildungs-Assets je Land; Länder ohne Eintrag haben keine Assets. */
export const NORM_ASSET_PREFIXES: Readonly<Partial<Record<JurisdictionId, string>>> = {
  baywue: 'baywue/bayernrecht/2023-12-01/assets/',
};

const SHA256 = /^[0-9a-f]{64}$/u;
const EXTENSIONS = new Set(['gif', 'jpg', 'png']);

/** R2-Schlüssel eines Assets; `undefined` für Länder ohne Assets oder ungültige Angaben. */
export function normAssetObjectKey(jurisdiction: JurisdictionId, sha256: string, extension: string): string | undefined {
  const prefix = NORM_ASSET_PREFIXES[jurisdiction];
  if (!prefix || !SHA256.test(sha256) || !EXTENSIONS.has(extension)) return undefined;
  return `${prefix}${sha256}.${extension}`;
}
