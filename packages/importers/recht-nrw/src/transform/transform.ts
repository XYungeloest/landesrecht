/**
 * Transformation Nordrhein-Westfalen → Land Westdeutschland.
 *
 * Ablauf: (1) Erlassorgan nur aus ausdrücklicher Formel bestimmen (organs.ts), (2) alle
 * landesbezogenen Bezeichnungen auf dem unveränderten Quelltext erkennen und entscheiden
 * (detection.ts), (3) nur die Landesbezeichnung nach benannten Regeln überleiten (rules.ts),
 * (4) nach der Transformation prüfen: Residuen, nicht angewandte Regeln, stille Änderungen.
 *
 * Quellmetadaten bleiben unverändert: Quellen-URLs, SHA-256, reales Quellintervall, reale
 * Fundstelle (`sourceCitation`), Fußnoten/Quellhinweise, Änderungshistorie und das historische
 * Erlassorgan (`originEnactingBody`). Die Simulationsfundstelle (`citation`, `initialCitation`)
 * ist davon getrennt und enthält keine reale Fundstelle.
 */
import { getJurisdiction, SIMULATION_BASELINE_DATE, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { NormBodyBlock, NormMeta, NormRecord, NormVersion, VersionSourceStatus } from '@landesrecht/legal-core/lib/schema.ts';
import { parseNormHistory, parseNormMeta, parseNormVersion, validateNormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import { slugify, type ImportFinding, type SourceLaw, type TransformContext } from '@landesrecht/importer-common/pipeline.ts';

import { SOURCE_STATE_NAME, TARGET_JURISDICTION } from '../common/constants.ts';
import { auditTransformation, detectReferences, summarizeDecisions, type DetectedReference, type DetectionField, type PostTransformAudit, type ReferenceCategory, type ReferenceDecision } from './detection.ts';
import { extractSourceOrgans, mapEnactingBody, type EnactingBodyMapping, type OrganEvidence } from './organs.ts';
import { applySegments, planTransformation, targetProperName, TRANSFORMATION_RULES, TRANSFORMER_VERSION } from './rules.ts';

export interface TransformationChange {
  path: string;
  rule: string;
  from: string;
  to: string;
}

/** Erkennung mit Entscheidung `manual-review` (kompatible Kurzliste im Report und Manifest). */
export interface UnresolvedReference {
  path: string;
  term: string;
  context: string;
  category: ReferenceCategory;
  decision: ReferenceDecision;
  reason: string;
  manualDecisionRequired: true;
}

export interface TransformationReport {
  schemaVersion: 'recht-nrw-transformation-report/2';
  source: string;
  target: JurisdictionId;
  sourceArea: 'lrgv' | 'lrmb';
  sourceIdentity: string;
  slug: string;
  baselineDate: string;
  transformerVersion: string;
  rules: string[];
  /** Alle Erkennungen vor der Transformation mit Kategorie und Entscheidung. */
  detections: DetectedReference[];
  /** Kategorie → Entscheidung → Anzahl. */
  decisions: Record<string, Record<string, number>>;
  changes: TransformationChange[];
  unresolved: UnresolvedReference[];
  postTransformAudit: PostTransformAudit;
  organs: { source?: OrganEvidence; candidates: OrganEvidence[]; conflict: boolean; enactingBody?: string; decision: EnactingBodyMapping['decision']; reason: string };
  citations: { source: string; sourceVersion: string; simulation: string };
  /** Felder, die bewusst unverändert blieben. */
  protectedFields: string[];
}

export interface TransformOptions {
  sourceArea?: 'lrgv' | 'lrmb';
  /** Kopfzeilen außerhalb des Normkörpers (z. B. Erlasskopf „Runderlass des Ministeriums …“). */
  headLines?: Array<{ path: string; text: string }>;
  sourceStatus?: VersionSourceStatus;
  /** Zusatz zum Änderungshinweis der Fassung (z. B. Rekonstruktionspfad). */
  provenanceNote?: string;
  dateNote?: string;
}

export interface TransformResult {
  record: NormRecord;
  report: TransformationReport;
  findings: ImportFinding[];
}

const TARGET = getJurisdiction(TARGET_JURISDICTION);

/** Wendet die Regeln auf einen Text an (Schutzmuster bleiben unverändert) und protokolliert jede Ersetzung. */
export function transformText(value: string, path: string, changes: TransformationChange[]): string {
  const { segments } = planTransformation(value);
  for (const segment of segments) changes.push({ path, rule: segment.rule, from: segment.from, to: segment.to });
  return applySegments(value, segments);
}

interface TextField {
  path: string;
  get(): string | undefined;
  set(value: string): void;
}

function collectBodyFields(blocks: NormBodyBlock[], path: string, fields: TextField[]): void {
  blocks.forEach((block, index) => {
    const blockPath = `${path}[${index}]`;
    // Fußnoten sind Quellhinweise (Provenienz) und bleiben unverändert.
    if (block.type === 'footnote') return;
    for (const key of ['label', 'title', 'text'] as const) {
      if (typeof block[key] === 'string') fields.push({ path: `${blockPath}.${key}`, get: () => block[key], set: (value) => { block[key] = value; } });
    }
    if (block.children) collectBodyFields(block.children, `${blockPath}.children`, fields);
  });
}

/** Deterministischer Slug: Abkürzung (transformiert) oder Kurzbezeichnung, sonst Titel. */
export function deriveSlug(transformedAbbr: string | undefined, transformedShortTitle: string | undefined, transformedTitle: string): string {
  const base = transformedAbbr ? slugify(transformedAbbr) : transformedShortTitle ? slugify(transformedShortTitle) : truncateSlug(slugify(transformedTitle), 72);
  const shortTarget = slugify(TARGET.shortName);
  const stateSlug = slugify(targetProperName());
  if (base.endsWith(`-${shortTarget}`) || base.endsWith(stateSlug)) return base;
  return `${base}-${shortTarget}`;
}

export function transformToWest(law: SourceLaw, context: TransformContext, options: TransformOptions = {}): TransformResult {
  const changes: TransformationChange[] = [];
  const findings: ImportFinding[] = [];
  if (context.targetJurisdiction !== TARGET_JURISDICTION) throw new Error(`Der RECHT.NRW-Transformer bedient nur ${TARGET_JURISDICTION}, nicht ${context.targetJurisdiction}`);
  if (context.baselineDate !== SIMULATION_BASELINE_DATE) throw new Error(`Ausgangsrechtsstand ${context.baselineDate} weicht von ${SIMULATION_BASELINE_DATE} ab`);

  // 1. Erlassorgan nur aus ausdrücklicher Formel.
  const organs = extractSourceOrgans(options.headLines ? { blocks: law.body, headLines: options.headLines } : { blocks: law.body });
  const mapping = mapEnactingBody(organs.enactingBody?.name);
  if (organs.conflict) findings.push({ severity: 'warning', code: 'organ-formula-conflict', message: `Widersprüchliche Erlassformeln (${[...new Set(organs.candidates.map((candidate) => candidate.name))].join(' / ')}); kein Erlassorgan übernommen` });
  if (mapping.decision === 'manual-review') findings.push({ severity: 'warning', code: 'enacting-body-mapping-required', message: `Erlassorgan der Quelle „${organs.enactingBody?.name}“ ohne sichere Entsprechung; Simulationsorgan bleibt leer (manuelle Entscheidung)` });

  // 2. Erkennung auf dem unveränderten Quelltext.
  const body: NormBodyBlock[] = structuredClone(law.body);
  const bodyFields: TextField[] = [];
  collectBodyFields(body, 'body', bodyFields);
  const detectionFields: DetectionField[] = [{ path: 'meta.title', text: law.title }];
  if (law.shortTitle) detectionFields.push({ path: 'meta.shortTitle', text: law.shortTitle });
  if (law.abbr) detectionFields.push({ path: 'meta.abbr', text: law.abbr });
  if (mapping.decision === 'safe-auto-transform' && organs.enactingBody) detectionFields.push({ path: 'meta.enactingBody', text: organs.enactingBody.name });
  for (const field of bodyFields) {
    const value = field.get();
    if (value) detectionFields.push({ path: field.path, text: value });
  }
  const detections = detectReferences(detectionFields);

  // 3. Transformation der Landesbezeichnungen.
  const audited: Array<{ path: string; source: string; transformed: string }> = [];
  const transform = (value: string, path: string): string => {
    const transformed = transformText(value, path, changes);
    audited.push({ path, source: value, transformed });
    return transformed;
  };
  const title = transform(law.title, 'meta.title');
  const shortTitle = law.shortTitle ? transform(law.shortTitle, 'meta.shortTitle') : undefined;
  const abbr = law.abbr ? transform(law.abbr, 'meta.abbr') : undefined;
  const enactingBody = mapping.decision === 'safe-auto-transform' && organs.enactingBody ? transform(organs.enactingBody.name, 'meta.enactingBody') : undefined;
  for (const field of bodyFields) {
    const value = field.get();
    if (!value) continue;
    const transformed = transform(value, field.path);
    if (transformed !== value) field.set(transformed);
  }

  // 4. Prüfung nach der Transformation.
  const postTransformAudit = auditTransformation(audited, detections, changes);
  if (!postTransformAudit.ok) {
    const unexplained = postTransformAudit.residuals.filter((residual) => residual.status === 'unexplained');
    findings.push({ severity: 'error', code: 'post-transform-audit', message: `Prüfung nach der Transformation fehlgeschlagen: ${unexplained.length} unerklärte Landesbezeichnung(en)${unexplained.length ? ` (${unexplained.slice(0, 3).map((entry) => `${entry.path}: „${entry.term}“`).join('; ')})` : ''}, ${postTransformAudit.unappliedTransforms.length} Regelabweichung(en), ${postTransformAudit.unrecordedChanges.length} nicht protokollierte Änderung(en)` });
  }

  const slug = context.reserveSlug(deriveSlug(abbr, shortTitle, title));
  const simulationCitation = `${title} in der am ${formatBaseline(context.baselineDate)} übernommenen Fassung (Ausgangsrechtsstand ${TARGET.shortName})`;
  const sourceVersionCitation = law.fullCitation ?? law.citation;
  const sourceInterval = `${law.sourceValidFrom ?? '?'} bis ${law.sourceValidTo ?? 'offen'}`;

  const meta: NormMeta = parseNormMeta({
    id: `${TARGET_JURISDICTION}:${slug}`,
    slug,
    jurisdiction: TARGET_JURISDICTION,
    title,
    shortTitle,
    abbr,
    shortTitleSource: shortTitle || abbr ? 'official' : undefined,
    type: law.type,
    status: 'in-force',
    enactingBody,
    originEnactingBody: organs.enactingBody?.name,
    subjects: law.subjects,
    keywords: law.keywords,
    initialCitation: simulationCitation,
    sourceCitation: law.citation,
    summary: undefined,
    documentDate: law.documentDate,
    effectiveDate: context.baselineDate,
    dateNote: options.dateNote ?? `Übernommen zum Ausgangsrechtsstand ${context.baselineDate}; die reale Quellfassung galt ab ${law.sourceValidFrom ?? '?'}${law.sourceValidTo ? ` bis ${law.sourceValidTo}` : ''}.`,
    predecessor: null,
    successor: null,
    relations: [],
    externalIdentifiers: law.externalIdentifiers,
    sourceReferences: law.sourceReferences,
  }, `${slug}/meta.json`);

  const version: NormVersion = parseNormVersion({
    versionId: context.baselineDate,
    simulationValidFrom: context.baselineDate,
    simulationValidTo: null,
    sourceValidFrom: law.sourceValidFrom,
    sourceValidTo: law.sourceValidTo,
    citation: simulationCitation,
    sourceCitation: sourceVersionCitation,
    sourceStatus: options.sourceStatus ?? { validity: 'exact', text: 'direct' },
    changeNote: `Ausgangsfassung zum Ausgangsrechtsstand ${context.baselineDate}: übernommener Rechtsstand des Landes ${SOURCE_STATE_NAME} (Quellfassung gültig ${sourceInterval}), übergeleitet auf ${TARGET.name}.${options.provenanceNote ? ` ${options.provenanceNote}` : ''}`,
    sourceReferences: law.sourceReferences,
    sourceNotes: law.sourceNotes,
    body,
  }, `${slug}/versions/${context.baselineDate}.json`);

  const history = parseNormHistory({
    initialVersionId: context.baselineDate,
    entries: [
      {
        date: context.baselineDate,
        type: 'initial',
        title: `Ausgangsfassung zum Ausgangsrechtsstand ${formatBaseline(context.baselineDate)} (Rechtsüberleitung ${SOURCE_STATE_NAME} → ${TARGET.name}).`,
        citation: simulationCitation,
        affectingVersionId: context.baselineDate,
        note: `Quelle: ${law.citation}.${law.changeHistory ? ` Reale Änderungshistorie der Quelle: ${law.changeHistory}` : ''}`,
      },
    ],
  }, `${slug}/history.json`);

  const record = validateNormRecord({ meta, history, versions: [version] }, `${TARGET_JURISDICTION}/${slug}`);
  const organReport: TransformationReport['organs'] = { candidates: organs.candidates, conflict: organs.conflict, decision: mapping.decision, reason: mapping.reason };
  if (organs.enactingBody) organReport.source = organs.enactingBody;
  if (enactingBody) organReport.enactingBody = enactingBody;
  const report: TransformationReport = {
    schemaVersion: 'recht-nrw-transformation-report/2',
    source: SOURCE_STATE_NAME,
    target: TARGET_JURISDICTION,
    sourceArea: options.sourceArea ?? 'lrgv',
    sourceIdentity: law.sourceIdentity ?? '',
    slug,
    baselineDate: context.baselineDate,
    transformerVersion: TRANSFORMER_VERSION,
    rules: TRANSFORMATION_RULES.map((rule) => rule.id),
    detections,
    decisions: summarizeDecisions(detections),
    changes,
    unresolved: detections.filter((detection) => detection.decision === 'manual-review').map((detection) => ({ path: detection.path, term: detection.term, context: detection.context, category: detection.category, decision: detection.decision, reason: detection.reason, manualDecisionRequired: true as const })),
    postTransformAudit,
    organs: organReport,
    citations: { source: law.citation, sourceVersion: sourceVersionCitation, simulation: simulationCitation },
    protectedFields: ['meta.sourceReferences', 'meta.sourceCitation', 'meta.originEnactingBody', 'meta.externalIdentifiers', 'version.sourceReferences', 'version.sourceNotes', 'version.sourceValidFrom', 'version.sourceValidTo', 'version.sourceCitation', 'history.entries[0].note'],
  };
  return { record, report, findings };
}

/** Kürzt einen Slug an einer Wortgrenze (Bindestrich), nie mitten im Wort. */
export function truncateSlug(slug: string, maxLength: number): string {
  if (slug.length <= maxLength) return slug;
  const cut = slug.lastIndexOf('-', maxLength);
  return (cut > maxLength / 2 ? slug.slice(0, cut) : slug.slice(0, maxLength)).replace(/-+$/u, '');
}

export function formatBaseline(iso: string): string {
  const [year, month, day] = iso.split('-');
  const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  return `${Number.parseInt(day!, 10)}. ${months[Number.parseInt(month!, 10) - 1]} ${year}`;
}
