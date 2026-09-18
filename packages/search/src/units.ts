/**
 * Sucheinheiten („Provisions“) aus dem Normkörper – der Flattening-Vertrag aus OstRecht:
 *  - Trefferstellen sind Paragraphen, Artikel, Abschnitte, Unterabschnitte, Anlagen und
 *    Vorbemerkungen, sofern sie eigenen Text tragen.
 *  - Text unterhalb einer Trefferstelle (Absätze, Nummern, Tabellen) gehört zu ihr.
 *  - Zitierte Vorschriften (`quotedProvision`) bilden keine eigenen Trefferstellen.
 *  - Überschriften werden nicht in den Text dupliziert; Text außerhalb jeder Trefferstelle
 *    und Überschriften textloser Einheiten wandern in den Ergänzungstext (`supplement`).
 *  - Jede Einheit trägt eine Strukturadresse (Paragraph/Artikel/Absätze), damit eine Suche
 *    nach „§ 3 Absatz 2“ auf die richtige Stelle verweisen kann.
 */
import { buildAnchorMap, getStructuralReference, isProvisionBlock, type StructuralReference } from '@landesrecht/legal-core/lib/body.ts';
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { getNormAliases, getNormVersionIdentity, getPublicNormSummary } from '@landesrecht/legal-core/lib/identity.ts';
import { getNormUrl, getNormVersionUrl } from '@landesrecht/legal-core/lib/routes.ts';
import type { NormBodyBlock, NormRecord, NormStatus, NormType, NormVersion, StructureType } from '@landesrecht/legal-core/lib/schema.ts';
import { classifyNormVersion, getNormLastChangeDate, type VersionTemporalKind } from '@landesrecht/legal-core/lib/versions.ts';

export const SYNTHETIC_UNIT_TYPES = ['metadata', 'supplement'] as const;

/**
 * Externe Kennungen, die als Gliederungsnummer suchbar sind (Metadatenblock: Bezeichnung und Wert, etwa
 * „BayRS 2011-I“). Nur ausdrücklich gelistete Systeme: Jede weitere Kennung verändert den Suchbestand ihres
 * Landes und damit dessen D1-Projektion – sie gehört bewusst hierher, nicht über eine Wildcard.
 */
export const SEARCHABLE_IDENTIFIER_SYSTEMS: Readonly<Record<string, string>> = { bayrs: 'BayRS' };

function searchableIdentifiers(record: NormRecord): string[] {
  return record.meta.externalIdentifiers.flatMap((entry) => {
    const label = SEARCHABLE_IDENTIFIER_SYSTEMS[entry.system];
    return label ? [`${label} ${entry.value}`] : [];
  });
}
export type SearchUnitType = StructureType | (typeof SYNTHETIC_UNIT_TYPES)[number];

export interface SearchUnit {
  /** Laufende Nummer innerhalb der Fassung (Reihenfolge im Normkörper). */
  index: number;
  type: SearchUnitType;
  /** Sprungziel auf der Normseite („paragraph-3“); leer bei synthetischen Einheiten. */
  anchor: string;
  label: string;
  heading: string;
  body: string;
  references?: StructuralReference;
}

export interface SearchDocument {
  id: string;
  jurisdiction: JurisdictionId;
  slug: string;
  versionId: string;
  url: string;
  versionUrl: string;
  versionKind: VersionTemporalKind;
  title: string;
  shortTitle: string;
  abbr?: string;
  aliases: string[];
  type: NormType;
  status: NormStatus;
  subjects: string[];
  keywords: string[];
  summary?: string;
  citation: string;
  simulationValidFrom: string;
  simulationValidTo: string | null;
  lastChangeDate: string | null;
  units: SearchUnit[];
}

interface CollectedBody {
  units: SearchUnit[];
  supplement: string;
}

export function collectBodyUnits(blocks: readonly NormBodyBlock[]): CollectedBody {
  const anchors = buildAnchorMap(blocks);
  const units: SearchUnit[] = [];
  const supplement: string[] = [];

  interface OpenUnit { unit: SearchUnit; textParts: string[] }

  function visit(entries: readonly NormBodyBlock[], path: number[], open: OpenUnit | null, quoted: boolean): void {
    entries.forEach((block, index) => {
      const currentPath = [...path, index];
      if (block.type === 'signature') return;
      const nextQuoted = quoted || block.type === 'quotedProvision';

      if (!quoted && isProvisionBlock(block)) {
        const textParts: string[] = [];
        const unit: SearchUnit = {
          index: -1,
          type: block.type,
          anchor: anchors.get(currentPath.join('.')) ?? '',
          label: block.label ?? '',
          heading: block.title ?? block.label ?? '',
          body: '',
        };
        const reference = getStructuralReference(block);
        if (reference) unit.references = reference;
        if (block.text) textParts.push(block.text);
        if (block.children) visit(block.children, currentPath, { unit, textParts }, nextQuoted);
        if (textParts.length > 0) {
          unit.index = units.length;
          unit.body = textParts.join('\n\n');
          units.push(unit);
        } else if (unit.heading) {
          supplement.push(unit.heading);
        }
        return;
      }

      if (block.text) {
        if (open) open.textParts.push(block.text);
        else supplement.push(block.text);
      } else if (!open && (block.title || block.label) && block.type !== 'quotedProvision') {
        supplement.push([block.label, block.title].filter(Boolean).join(' '));
      }
      if (block.children) visit(block.children, currentPath, open, nextQuoted);
    });
  }

  visit(blocks, [], null, false);
  return { units, supplement: supplement.join('\n\n') };
}

export function buildSearchDocument(record: NormRecord, version: NormVersion, asOf: string): SearchDocument {
  const identity = getNormVersionIdentity(record, version);
  const { units, supplement } = collectBodyUnits(version.body);
  const summary = getPublicNormSummary(identity);
  const metadataBody = [
    summary,
    ...record.meta.keywords,
    ...record.meta.subjects,
    record.meta.initialCitation,
    version.citation,
    ...getNormAliases(record, identity),
    ...searchableIdentifiers(record),
  ].filter((entry): entry is string => Boolean(entry)).join('\n');

  const allUnits: SearchUnit[] = [...units];
  if (supplement) allUnits.push({ index: allUnits.length, type: 'supplement', anchor: '', label: '', heading: '', body: supplement });
  allUnits.push({ index: allUnits.length, type: 'metadata', anchor: '', label: '', heading: '', body: metadataBody });

  const document: SearchDocument = {
    id: `${record.meta.jurisdiction}:${record.meta.slug}:${version.versionId}`,
    jurisdiction: record.meta.jurisdiction,
    slug: record.meta.slug,
    versionId: version.versionId,
    url: getNormUrl(record.meta.jurisdiction, record.meta.slug),
    versionUrl: getNormVersionUrl(record.meta.jurisdiction, record.meta.slug, version.versionId),
    versionKind: classifyNormVersion(record, version, asOf),
    title: identity.title,
    shortTitle: identity.shortTitle,
    aliases: getNormAliases(record, identity),
    type: record.meta.type,
    status: record.meta.status,
    subjects: record.meta.subjects,
    keywords: record.meta.keywords,
    citation: version.citation,
    simulationValidFrom: version.simulationValidFrom,
    simulationValidTo: version.simulationValidTo,
    lastChangeDate: getNormLastChangeDate(record, asOf),
    units: allUnits,
  };
  if (identity.abbr !== undefined) document.abbr = identity.abbr;
  if (summary !== undefined) document.summary = summary;
  return document;
}

export function isSyntheticUnit(unit: Pick<SearchUnit, 'type'>): boolean {
  return (SYNTHETIC_UNIT_TYPES as readonly string[]).includes(unit.type);
}
