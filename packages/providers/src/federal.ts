/**
 * Bundesrecht: extern unter gesetze-sim-internet.de. Dieses Modul ist die einzige Stelle, die
 * externe Bundesrechts-URLs bildet. Es nimmt keine Annahmen über den Tech-Stack oder die
 * Datenbank des Bundesrechts an und liefert keine Normdaten – nur stabile Links.
 */
import { FEDERAL_JURISDICTION_ID } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { parseProvision, type LegalReference } from '@landesrecht/legal-core/lib/references.ts';

import type { LegalProvider, ResolvedReference } from './provider.ts';

export const FEDERAL_SITE_URL = 'https://gesetze-sim-internet.de';
export const FEDERAL_SYSTEM_LABEL = 'Bundesrecht (gesetze-sim-internet.de)';

/** Normkennung im Bundesportal: Abkürzung in Kleinschreibung ohne Sonderzeichen („BGB“ → „bgb“). */
export function federalNormKey(norm: string): string {
  return norm
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9_-]+/g, '');
}

export function buildFederalNormUrl(norm: string, provision?: string): string {
  const key = federalNormKey(norm);
  if (!key) throw new TypeError('Bundesnorm ohne Kennung');
  const url = new URL('/gesetz.php', FEDERAL_SITE_URL);
  url.searchParams.set('g', key);
  const parsed = parseProvision(provision);
  if (parsed) {
    url.searchParams.set(parsed.kind === 'paragraph' ? 'p' : 'art', parsed.number);
    if (parsed.subsection) url.searchParams.set('abs', parsed.subsection);
  }
  return url.toString();
}

export function formatReferenceLabel(reference: LegalReference): string {
  return reference.provision ? `${reference.norm} ${reference.provision}` : reference.norm;
}

export function createFederalProvider(): LegalProvider {
  return {
    id: 'federal',
    label: FEDERAL_SYSTEM_LABEL,
    jurisdictions: [FEDERAL_JURISDICTION_ID],
    providesNorms: false,
    async getNorm() {
      return null;
    },
    async getNormVersion() {
      return null;
    },
    async listVersions() {
      return [];
    },
    async search(state) {
      return { total: 0, offset: state.offset, limit: state.limit, hits: [] };
    },
    async resolveReference(reference) {
      if (reference.jurisdiction !== FEDERAL_JURISDICTION_ID) return null;
      const resolved: ResolvedReference = {
        reference,
        url: buildFederalNormUrl(reference.norm, reference.provision),
        external: true,
        label: formatReferenceLabel(reference),
        system: FEDERAL_SYSTEM_LABEL,
      };
      return resolved;
    },
  };
}
