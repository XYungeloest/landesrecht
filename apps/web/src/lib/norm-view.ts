/**
 * Ansichtsmodell einer Normseite: geltende oder gewählte Fassung, Bezeichnung, Zeitstatus,
 * Inhaltsübersicht und Fassungsnavigation. Wird von Normtext-, Fassungs-, Daten-, Historien-
 * und Quellenseite gemeinsam verwendet.
 */
import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { getJurisdiction, type Jurisdiction, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { buildAnchorMap, buildOutline, type AnchorMap, type OutlineEntry } from '@landesrecht/legal-core/lib/body.ts';
import { formatDate, referenceDateLabel, statusLabel, typeLabel, versionKindLabel, VOCABULARY } from '@landesrecht/legal-core/lib/display.ts';
import { getNormVersionIdentity, getPublicNormSummary, type NormVersionIdentity } from '@landesrecht/legal-core/lib/identity.ts';
import { getNormSubpageUrl, getNormUrl, getNormVersionUrl, resolveJurisdictionSegment, type NormSubpage } from '@landesrecht/legal-core/lib/routes.ts';
import type { NormRecord, NormVersion } from '@landesrecht/legal-core/lib/schema.ts';
import { classifyNormVersion, getApplicableVersion, type VersionTemporalKind } from '@landesrecht/legal-core/lib/versions.ts';
import type { NormStore } from '@landesrecht/runtime/store.ts';

export interface VersionNavEntry {
  versionId: string;
  kind: VersionTemporalKind;
  kindLabel: string;
  simulationValidFrom: string;
  simulationValidTo: string | null;
  url: string;
  selected: boolean;
}

export interface NormView {
  jurisdiction: Jurisdiction;
  record: NormRecord;
  version: NormVersion;
  identity: NormVersionIdentity;
  summary?: string;
  kind: VersionTemporalKind;
  kindLabel: string;
  bandLabel: string;
  isCurrent: boolean;
  typeLabel: string;
  statusLabel: string;
  legalStatusText: string;
  validityText: string;
  sourceValidityText?: string;
  url: string;
  versionUrl: string;
  canonicalUrl: string;
  subpages: Array<{ key: 'text' | NormSubpage; label: string; url: string }>;
  versions: VersionNavEntry[];
  outline: OutlineEntry[];
  anchors: AnchorMap;
}

export async function loadNormView(store: NormStore, slug: string, versionId?: string): Promise<NormView | null> {
  const record = await store.getNorm(slug, versionId ? [versionId] : 'current');
  if (!record) return null;
  return buildNormView(record, versionId);
}

export function buildNormView(record: NormRecord, versionId?: string): NormView | null {
  const current = getApplicableVersion(record, EDITORIAL_REFERENCE_DATE);
  const version = versionId ? record.versions.find((entry) => entry.versionId === versionId) : current;
  if (!version) return null;
  const jurisdiction = getJurisdiction(record.meta.jurisdiction);
  const identity = getNormVersionIdentity(record, version);
  const kind = classifyNormVersion(record, version, EDITORIAL_REFERENCE_DATE);
  const isCurrent = version.versionId === current.versionId && kind === 'current';
  const url = getNormUrl(record.meta.jurisdiction, record.meta.slug);
  const versionUrl = getNormVersionUrl(record.meta.jurisdiction, record.meta.slug, version.versionId);
  const explicitVersion = versionId !== undefined;
  const subpageVersion = explicitVersion ? version.versionId : undefined;
  const anchors = buildAnchorMap(version.body);

  const view: NormView = {
    jurisdiction,
    record,
    version,
    identity,
    kind,
    kindLabel: versionKindLabel(kind),
    bandLabel: versionKindLabel(kind, 'band'),
    isCurrent,
    typeLabel: typeLabel(record.meta.type),
    statusLabel: statusLabel(record.meta.status),
    legalStatusText: isCurrent ? referenceDateLabel(EDITORIAL_REFERENCE_DATE) : `${VOCABULARY.version.label} vom ${formatDate(version.simulationValidFrom)}`,
    validityText: version.simulationValidTo
      ? `Gültig in der Simulation vom ${formatDate(version.simulationValidFrom)} bis ${formatDate(version.simulationValidTo)}`
      : `Gültig in der Simulation seit ${formatDate(version.simulationValidFrom)}`,
    url,
    versionUrl,
    canonicalUrl: explicitVersion ? versionUrl : url,
    subpages: [
      { key: 'text', label: VOCABULARY.sections.text, url: explicitVersion ? versionUrl : url },
      { key: 'daten', label: VOCABULARY.sections.facts, url: getNormSubpageUrl(record.meta.jurisdiction, record.meta.slug, 'daten', subpageVersion) },
      { key: 'historie', label: VOCABULARY.sections.history, url: getNormSubpageUrl(record.meta.jurisdiction, record.meta.slug, 'historie') },
      { key: 'vergleich', label: VOCABULARY.sections.compare, url: getNormSubpageUrl(record.meta.jurisdiction, record.meta.slug, 'vergleich') },
      { key: 'quellen', label: VOCABULARY.sections.sources, url: getNormSubpageUrl(record.meta.jurisdiction, record.meta.slug, 'quellen', subpageVersion) },
    ],
    versions: record.versions.map((entry) => {
      const entryKind = classifyNormVersion(record, entry, EDITORIAL_REFERENCE_DATE);
      return {
        versionId: entry.versionId,
        kind: entryKind,
        kindLabel: versionKindLabel(entryKind),
        simulationValidFrom: entry.simulationValidFrom,
        simulationValidTo: entry.simulationValidTo,
        url: entry.versionId === current.versionId && entryKind === 'current' ? url : getNormVersionUrl(record.meta.jurisdiction, record.meta.slug, entry.versionId),
        selected: entry.versionId === version.versionId,
      };
    }),
    outline: buildOutline(version.body, anchors),
    anchors,
  };
  const summary = getPublicNormSummary(identity);
  if (summary !== undefined) view.summary = summary;
  if (version.sourceValidFrom || version.sourceValidTo) {
    view.sourceValidityText = `Reale Quellfassung gültig ${version.sourceValidFrom ? `ab ${formatDate(version.sourceValidFrom)}` : ''}${version.sourceValidTo ? ` bis ${formatDate(version.sourceValidTo)}` : ''}`.replace(/\s+/g, ' ').trim();
  }
  return view;
}

export function jurisdictionFromParam(param: string | undefined): { id: JurisdictionId; jurisdiction: Jurisdiction } | null {
  const id = resolveJurisdictionSegment(param);
  return id ? { id, jurisdiction: getJurisdiction(id) } : null;
}
