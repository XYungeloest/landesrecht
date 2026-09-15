import { isJurisdictionId, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { resolveJurisdictionSegment } from '@landesrecht/legal-core/lib/routes.ts';

/** Die API akzeptiert die interne ID (`baywue`) und das öffentliche URL-Segment (`bayern-wuerttemberg`). */
export function resolveApiJurisdiction(value: string | undefined): JurisdictionId | undefined {
  if (!value) return undefined;
  if (isJurisdictionId(value)) return value;
  return resolveJurisdictionSegment(value);
}
