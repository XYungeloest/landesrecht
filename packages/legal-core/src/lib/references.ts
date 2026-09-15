/**
 * Strukturiertes Modell juristischer Verweise. Ein Verweis nennt Rechtsordnung, Norm und
 * optional die Vorschrift; er enthält nie eine URL. Wohin ein Verweis führt, entscheidet
 * ausschließlich der Resolver in @landesrecht/providers.
 *
 * Beispiel: { "type": "legalReference", "jurisdiction": "bund", "norm": "BGB", "provision": "§ 823" }
 */
import { FEDERAL_JURISDICTION_ID, isJurisdictionId, type ReferenceJurisdictionId } from '../config/jurisdictions.ts';

export interface LegalReference {
  type: 'legalReference';
  jurisdiction: ReferenceJurisdictionId;
  /** Abkürzung oder Slug der Norm im Zielsystem („BGB“, „schulgesetz“). */
  norm: string;
  /** Vorschrift innerhalb der Norm („§ 823“, „Art. 5 Abs. 1“); optional. */
  provision?: string;
  /** Fassungskennung, wenn eine bestimmte Fassung gemeint ist. */
  versionId?: string;
}

export function isReferenceJurisdictionId(value: unknown): value is ReferenceJurisdictionId {
  return value === FEDERAL_JURISDICTION_ID || isJurisdictionId(value);
}

export function createLegalReference(
  jurisdiction: ReferenceJurisdictionId,
  norm: string,
  options: { provision?: string; versionId?: string } = {},
): LegalReference {
  const reference: LegalReference = { type: 'legalReference', jurisdiction, norm: norm.trim() };
  if (options.provision) reference.provision = options.provision.trim();
  if (options.versionId) reference.versionId = options.versionId;
  return reference;
}

export function parseLegalReference(value: unknown, path = 'legalReference'): LegalReference {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${path}: muss ein Objekt sein`);
  const object = value as Record<string, unknown>;
  if (object.type !== 'legalReference') throw new TypeError(`${path}.type: muss "legalReference" sein`);
  if (!isReferenceJurisdictionId(object.jurisdiction)) throw new TypeError(`${path}.jurisdiction: unbekannte Rechtsordnung`);
  if (typeof object.norm !== 'string' || !object.norm.trim()) throw new TypeError(`${path}.norm: darf nicht leer sein`);
  const options: { provision?: string; versionId?: string } = {};
  if (object.provision !== undefined) {
    if (typeof object.provision !== 'string') throw new TypeError(`${path}.provision: muss ein String sein`);
    options.provision = object.provision;
  }
  if (object.versionId !== undefined) {
    if (typeof object.versionId !== 'string') throw new TypeError(`${path}.versionId: muss ein String sein`);
    options.versionId = object.versionId;
  }
  return createLegalReference(object.jurisdiction, object.norm, options);
}

/** Zerlegt eine Vorschriftenangabe in Paragraph/Artikel und Absatz („§ 3 Abs. 2“). */
export interface ParsedProvision {
  kind: 'paragraph' | 'article';
  number: string;
  subsection?: string;
}

const PROVISION_PATTERN = /^(§{1,2}|Art(?:ikel|\.)?)\s*([0-9]+[a-z]?)(?:\s*(?:Abs(?:atz|\.)?)\s*([0-9]+[a-z]?))?/iu;

export function parseProvision(value: string | undefined): ParsedProvision | undefined {
  if (!value) return undefined;
  const match = value.trim().match(PROVISION_PATTERN);
  if (!match) return undefined;
  const marker = match[1]!;
  const provision: ParsedProvision = { kind: marker.startsWith('§') ? 'paragraph' : 'article', number: match[2]!.toLowerCase() };
  if (match[3]) provision.subsection = match[3].toLowerCase();
  return provision;
}

/** Sprungziel-Fragment einer Vorschrift innerhalb einer Normseite (ohne Kollisionsauflösung). */
export function provisionAnchor(provision: ParsedProvision): string {
  return provision.kind === 'paragraph' ? `paragraph-${provision.number}` : `artikel-${provision.number}`;
}
