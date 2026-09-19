/**
 * Vollweg je Dokument: öffentliche PDF-Ausgabe → Layout → Parser → SH-Modell (`SourceLaw`) → Stichtag →
 * Überleitung SH → NSH → legal-core (`validateNormRecord` in `transformToNsh`) → Restpostenprüfung – mit
 * Textintegritätsprüfung vor jeder Übernahme. Schreibt nichts; entscheidet nur.
 *
 * Ausgänge:
 *   import-ready    Stichtagsfassung belegt (aktuelle Ausgabe galt unverändert am Stichtag), Text vollständig
 *                   (Integrität exact/normalized-equivalent/explained-difference), keine Warnung von Parser
 *                   oder Überleitung.
 *   review          Text oder Struktur nicht sicher (Tabellenlayout, Abbildung, Verzeichnisabweichung,
 *                   Integrität review/mismatch, Überleitung mit manueller Entscheidung, Stichtag unbestimmt).
 *   reconstruction  Am Stichtag galt eine andere Fassung (geändert nach dem Stichtag; nach dem Stichtag
 *                   aufgehoben) – Stichtagsfassung aus historischen Einheiten zu gewinnen, nie der heutige Text.
 *   not-at-baseline Nach dem Stichtag erlassen oder davor außer Kraft.
 *   failed          Parser- oder Schemafehler.
 */
import type { ImportFinding, TransformContext } from '@landesrecht/importer-common/pipeline.ts';
import type { NormBodyBlock, NormRecord } from '@landesrecht/legal-core/lib/schema.ts';

import { auditRecord } from '../transform/audit-record.ts';
import type { CompiledInstitutionRegistry } from '../transform/institution-registry.ts';
import { transformToNsh } from '../transform/transform.ts';
import { compareIntegrity, type IntegrityResult } from '../parse/integrity.ts';
import { bodyText, isoDate, joinLines, parseJurisPdf, type ParsedJurisPdf } from '../parse/juris-pdf.ts';
import { readFigureImages, withoutBytes } from '../parse/pdf-figures.ts';
import { layoutFromPdf } from '../parse/pdf-layout.ts';
import { classifyEdition, standAmendmentDate, toSourceLaw, SYSTEM, type EditionBaseline, type GazetteVolume, type SourceDocument } from '../parse/source-law.ts';
import { permaUrl } from '../access/policy.ts';
import { retrievalDate } from '@landesrecht/importer-common/pipeline.ts';
import type { SourceReference } from '@landesrecht/legal-core/lib/schema.ts';
import { assembleBaseline, consistencyProblems, selectBaselineUnits, type HistoricalAssembly, type UnitVersion } from './historical.ts';

/**
 * Einordnungen `undetermined`, die die Einzelfassungen entscheiden können (starker Beleg: Gültigkeitszeitraum je
 * Einheit): Stand-Vermerk nach dem Stichtag ohne späteres Einheitsdatum, fehlendes oder undatiertes Verzeichnis,
 * Ausgabe ohne Normtext. Nicht darunter: eine Befristungsfußnote zum Titel – sie widerspricht der Ausgabe selbst.
 */
export const STAND_UNDETERMINED = /letzte berücksichtigte Änderung vom \d{4}-\d{2}-\d{2} \(nach dem Stichtag|kein Verzeichnis mit Gültigkeitsdaten|Verzeichniseinträge ohne Gültigkeitsdatum|Ausgabe ohne Normtext/u;

/** `part-of-main`: Anlage einer VwV als eigenes juris-Dokument, der Stammnorm angehängt (`annexes.ts`) – keine eigene Norm. */
export const DOCUMENT_OUTCOMES = ['import-ready', 'review', 'reconstruction', 'not-at-baseline', 'failed', 'part-of-main'] as const;
export type DocumentOutcome = (typeof DOCUMENT_OUTCOMES)[number];

/** Parserbefunde, die eine Übernahme sperren (Review). */
export const REVIEW_PARSE_CODES: readonly string[] = ['table-layout', 'figure', 'toc-unit-missing', 'body-unit-not-in-toc', 'toc-order', 'vwv-annex-document', 'empty-footnote', 'incomplete-source-text'];
export const ACCEPTED_INTEGRITY: readonly IntegrityResult['class'][] = ['exact', 'normalized-equivalent', 'explained-difference'];

/**
 * Überleitungsbefunde, die nach der Institutionen-Zuordnung **nicht** sperren (`data/imports/juris-sh/
 * institution-mapping.json`: Ressorts, Behörden, Kommunen, Geographie laufen über den Standardstatus `review`
 * „nicht bulk-blockierend (imported-with-warnings), mit unverändertem Normtext und erhaltenem Quellorgan“).
 * Alles andere – Restbezeichnungen nach der Überleitung, widersprüchliche Formeln, unentscheidbare Kürzel –
 * führt in den Review.
 */
export const NON_BLOCKING_TRANSFORM_CODES: readonly string[] = ['enacting-body-mapping-required'];

export interface DocumentResult {
  documentId: string;
  area: 'landesrecht' | 'vwv';
  outcome: DocumentOutcome;
  reasons: string[];
  /** Strukturierte Sperrgründe (Art + Code) – Grundlage der Review-Fälle. */
  blockers: DocumentBlocker[];
  /** Nicht sperrende Hinweise (Übernahme mit Warnungen). */
  warnings: string[];
  title?: string;
  type?: string;
  abbr?: string;
  gliederungsnummer?: string;
  baseline?: EditionBaseline;
  integrity?: IntegrityResult;
  counts?: { pages: number; blocks: number; units: number; tocEntries: number; footnotes: number; tables: number };
  findings: ImportFinding[];
  record?: NormRecord;
  slug?: string;
  transform?: { changes: number; unresolved: number; auditOk: boolean };
  /** Datums- und Identitätsangaben der Ausgabe (Kopf, Ausgabevermerk, Stand, Verzeichnis) – Grundlage der Belege. */
  source?: DocumentSourceFacts;
  /** VwV-Anlage als eigenes Dokument: Titel des Hauptdokuments („Zum Hauptdokument : …“). */
  mainDocument?: string;
  /** Stichtagsfassung aus historischen Einzelfassungen (nur bei geänderten bzw. nach dem Stichtag aufgehobenen Normen). */
  historical?: { units: number; selected: number; omitted: number; problems: string[]; validFrom?: string; validTo?: string; integrity: HistoricalAssembly['integrity']['class']; selectedUnitIds: string[] };
  raw: Pick<SourceDocument, 'url' | 'sha256' | 'byteLength' | 'retrievedAt'>;
  /** Abbildungen der übernommenen Fassung (`figure`-Blöcke) mit der PDF-Ausgabe, aus der jedes Bild stammt. */
  figures?: DocumentFigure[];
  /** Angehängte Anlagendokumente (VwV-Anlagen als eigene juris-Dokumente), je mit ihrer PDF-Ausgabe. */
  annexDocuments?: Array<{ documentId: string; raw: Pick<SourceDocument, 'url' | 'sha256' | 'byteLength' | 'retrievedAt'> }>;
  /** Nur `part-of-main`: Stammnorm, der diese Anlage angehängt ist. */
  partOf?: string;
}

export interface DocumentFigure {
  sha256: string;
  mediaType: 'image/png' | 'image/jpeg';
  byteLength: number;
  /** Lage in der PDF-Ausgabe (`seite-<n>/bild-<k>.<endung>`). */
  sourcePath: string;
  /** Dokument (Rahmen oder Einzelfassung), dessen PDF-Ausgabe das Bild trägt. */
  sourceDocumentId: string;
  pdf: Pick<SourceDocument, 'url' | 'sha256' | 'byteLength' | 'retrievedAt'>;
}

/** Alle `figure`-Assets eines Normkörpers, je SHA-256 einmal, in Dokumentreihenfolge. */
export function figureAssets(blocks: readonly NormBodyBlock[], into: NonNullable<NormBodyBlock['asset']>[] = []): NonNullable<NormBodyBlock['asset']>[] {
  for (const block of blocks) {
    if (block.type === 'figure' && block.asset && !into.some((asset) => asset.sha256 === block.asset!.sha256)) into.push(block.asset);
    if (block.children) figureAssets(block.children, into);
  }
  return into;
}

export const BLOCKER_KINDS = ['parse', 'parse-units', 'integrity', 'baseline', 'historical', 'units-missing', 'transform', 'schema'] as const;
export interface DocumentBlocker {
  kind: (typeof BLOCKER_KINDS)[number];
  code: string;
  detail: string;
}

export interface DocumentSourceFacts {
  gliederungsnummer?: string;
  /** Ausfertigungs-, Neufassungs- bzw. Erlassdatum (ISO) – Identitätsmerkmal gegenüber dem Ereignisregister. */
  documentDates: string[];
  headerValidFrom?: string;
  headerValidTo?: string;
  editionValidFrom?: string;
  editionValidTo?: string;
  editionCurrentAsOf?: string;
  /** VwV: „Fassung vom“. */
  versionDate?: string;
  /** Späteste Ausfertigung einer im Stand-Vermerk genannten Änderung. */
  standDate?: string;
  /** Spätester Beginn einer Einheit laut Verzeichnis. */
  latestUnitFrom?: string;
  fundstelle?: string;
}

function sourceFacts(parsed: ParsedJurisPdf): DocumentSourceFacts {
  const header = parsed.header;
  const glNr = header['Gliederungs-Nr'];
  const documentDates = [header.Ausfertigungsdatum, header.Neugefasst, header.Erlassdatum].map((value) => isoDate(value)).filter((value): value is string => value !== undefined);
  const latestUnitFrom = parsed.toc.map((entry) => entry.validFrom).filter((value): value is string => value !== undefined).sort().at(-1);
  const facts: DocumentSourceFacts = { documentDates: [...new Set(documentDates)] };
  if (glNr && glNr !== '-' && glNr !== '0' && !/keine Angaben/u.test(glNr)) facts.gliederungsnummer = glNr;
  const assign = (key: keyof DocumentSourceFacts, value: string | undefined): void => {
    if (value !== undefined) (facts as unknown as Record<string, string>)[key] = value;
  };
  assign('headerValidFrom', isoDate(header['Gültig ab']));
  assign('headerValidTo', isoDate(header['Gültig bis']));
  assign('editionValidFrom', parsed.edition?.validFrom);
  assign('editionValidTo', parsed.edition?.validTo);
  assign('editionCurrentAsOf', parsed.edition?.currentAsOf);
  assign('versionDate', isoDate(header['Fassung vom']));
  assign('standDate', standAmendmentDate(parsed.stand));
  assign('latestUnitFrom', latestUnitFrom);
  assign('fundstelle', header.Fundstelle ?? header.Fundstellen);
  return facts;
}

function countBlocks(parsed: ParsedJurisPdf): DocumentResult['counts'] {
  let blocks = 0;
  let units = 0;
  let footnotes = 0;
  const walk = (list: ParsedJurisPdf['body']): void => {
    for (const block of list) {
      blocks += 1;
      if (block.type === 'paragraph' || block.type === 'article' || block.type === 'annex') units += 1;
      if (block.type === 'footnote') footnotes += 1;
      if (block.children) walk(block.children);
    }
  };
  walk(parsed.body);
  return { pages: parsed.pages, blocks, units, tocEntries: parsed.toc.length, footnotes, tables: parsed.findings.filter((finding) => finding.code === 'table-layout').length };
}

export interface ProcessOptions {
  institutions: CompiledInstitutionRegistry;
  context: TransformContext;
  /** Einzelfassungen des Rahmendokuments (für die Stichtagsfassung geänderter Normen). */
  units?: readonly UnitVersion[];
  /** Amtliche Abkürzungen des Bestands mit abgesetztem Landeskürzel (`pipeline/abbreviations.ts`). */
  knownStateAbbreviations?: ReadonlySet<string>;
  /** Amtliche Jahrgangsbände mit belegter Adresse (Ereignisregister) für Verweise auf die Verkündung. */
  gazetteVolumes?: readonly GazetteVolume[];
}

function frameHistoricalReference(document: SourceDocument, units: number, validFrom: string | undefined, validTo: string | undefined): SourceReference {
  return {
    kind: 'official-portal-snapshot',
    system: SYSTEM,
    label: `Bürgerservice Schleswig-Holstein (juris), Stichtagsfassung aus ${units} Einzelfassungen (${document.documentId})`,
    availability: 'external',
    url: permaUrl(document.documentId),
    retrievedAt: retrievalDate(document.retrievedAt),
    externalId: document.documentId,
    mediaType: 'application/pdf',
    sourceRole: 'structure-bearing',
    ...(validFrom ? { sourceValidFrom: validFrom } : {}),
    ...(validTo ? { sourceValidTo: validTo } : {}),
    note: 'Je Einheit die am Stichtag geltende Fassung aus der PDF-Ausgabe „genau dieses Dokument“; Einzelfassungen mit Prüfsummen im Importmanifest.',
  };
}

export function unitReference(unit: UnitVersion): SourceReference {
  return {
    kind: 'official-portal-snapshot',
    system: SYSTEM,
    label: `Bürgerservice Schleswig-Holstein (juris), Einzelfassung ${unit.key} (${unit.documentId})`,
    availability: 'external',
    url: unit.raw.url,
    retrievedAt: retrievalDate(unit.raw.retrievedAt),
    sha256: unit.raw.sha256,
    externalId: unit.documentId,
    mediaType: 'application/pdf',
    pageCount: unit.parsed.pages,
    sourceRole: 'structure-bearing',
    ...(unit.validFrom ? { sourceValidFrom: unit.validFrom } : {}),
    ...(unit.validTo ? { sourceValidTo: unit.validTo } : {}),
    note: `Permalink „genau dieses Dokument“: ${permaUrl(unit.documentId)}.`,
  };
}

export function processDocument(bytes: Uint8Array, document: SourceDocument, options: ProcessOptions): DocumentResult {
  const raw = { url: document.url, sha256: document.sha256, byteLength: document.byteLength, retrievedAt: document.retrievedAt };
  const base = { documentId: document.documentId, area: document.area, raw };
  let parsed: ParsedJurisPdf;
  try {
    const layout = layoutFromPdf(bytes);
    parsed = parseJurisPdf(layout, { images: readFigureImages(bytes)?.map(withoutBytes) ?? null });
  } catch (error) {
    return { ...base, outcome: 'failed', reasons: [`Parser: ${(error as Error).message}`], blockers: [{ kind: 'schema', code: 'parser-error', detail: (error as Error).message.slice(0, 300) }], warnings: [], findings: [] };
  }
  const isVwv = document.area === 'vwv';
  // Als Metadaten übernommene Zeilen (VwV: wiederholter Titel, „Gl.Nr.“, „Fundstelle:“) sind erklärt, nicht verloren.
  const integrity = compareIntegrity(parsed.sourceText, bodyText(parsed.body), parsed.relocated, joinLines);
  const baseline = classifyEdition(parsed, isVwv);
  const { law, findings } = toSourceLaw(parsed, document, options.gazetteVolumes ? { gazetteVolumes: options.gazetteVolumes } : {});
  const result: DocumentResult = {
    ...base,
    outcome: 'import-ready',
    reasons: [],
    blockers: [],
    warnings: [],
    title: law.title,
    type: law.type,
    ...(law.abbr ? { abbr: law.abbr } : {}),
    ...(law.externalIdentifiers[1] ? { gliederungsnummer: law.externalIdentifiers[1].value } : {}),
    baseline,
    source: sourceFacts(parsed),
    ...(parsed.mainDocument ? { mainDocument: parsed.mainDocument } : {}),
    integrity,
    counts: countBlocks(parsed),
    findings,
  };
  const errors = findings.filter((finding) => finding.severity === 'error');
  if (errors.length > 0) return { ...result, outcome: 'failed', reasons: errors.map((finding) => `${finding.code}: ${finding.message}`), blockers: errors.map((finding) => ({ kind: 'schema' as const, code: finding.code, detail: finding.message })) };
  if (baseline.class === 'repealed-before-baseline' || baseline.class === 'enacted-after-baseline') return { ...result, outcome: 'not-at-baseline', reasons: [`${baseline.class}: ${baseline.basis}`] };
  const reasons: string[] = [];
  const blockers: DocumentBlocker[] = [];
  let sourceStatus: { validity: 'exact'; text: 'direct'; note?: string } = { validity: 'exact', text: 'direct' };
  let figureSources: Array<{ sha256: string; documentId: string; raw: DocumentFigure['pdf'] }> = parsed.figures.map((figure) => ({ sha256: figure.sha256, documentId: document.documentId, raw }));
  let provenanceNote: string | undefined;
  // Unbestimmte Einordnung, die die Einzelfassungen entscheiden können (siehe STAND_UNDETERMINED), sofern geladen.
  const standUndetermined = baseline.class === 'undetermined' && STAND_UNDETERMINED.test(baseline.basis);
  if (baseline.class === 'changed-after-baseline' || baseline.class === 'repealed-after-baseline' || (standUndetermined && options.units && options.units.length > 0)) {
    if (!options.units || options.units.length === 0) return { ...result, outcome: 'reconstruction', reasons: [`${baseline.class}: ${baseline.basis}; Einzelfassungen noch nicht geladen`], blockers: [{ kind: 'units-missing', code: baseline.class, detail: baseline.basis }] };
    // Stichtagsfassung aus den am Stichtag geltenden Einzelfassungen – nie der heutige Text.
    const rawSelection = selectBaselineUnits(options.units);
    const selection = { ...rawSelection, problems: [...rawSelection.problems, ...consistencyProblems(rawSelection.selected, { title: parsed.title, ...(parsed.header['Gliederungs-Nr'] ? { gliederungsnummer: parsed.header['Gliederungs-Nr'] } : {}) })] };
    const unitErrors = options.units.filter((unit) => unit.parsed.findings.some((finding) => finding.severity === 'error')).map((unit) => `${unit.documentId}: ${unit.parsed.findings.filter((finding) => finding.severity === 'error').map((finding) => finding.code).join(', ')}`);
    const assembly = assembleBaseline(selection.selected, isVwv);
    result.historical = { units: options.units.length, selected: selection.selected.length, omitted: selection.omitted.length, problems: [...selection.problems, ...unitErrors], ...(assembly.validFrom ? { validFrom: assembly.validFrom } : {}), ...(assembly.validTo ? { validTo: assembly.validTo } : {}), integrity: assembly.integrity.class, selectedUnitIds: selection.selected.map((unit) => unit.documentId) };
    result.integrity = assembly.integrity;
    if (selection.problems.length > 0 || unitErrors.length > 0) return { ...result, outcome: 'reconstruction', reasons: [`${baseline.class}: Einzelfassungen nicht eindeutig: ${[...selection.problems, ...unitErrors].slice(0, 3).join('; ')}`], blockers: [...selection.problems, ...unitErrors].map((problem) => ({ kind: 'historical' as const, code: 'unit-selection', detail: problem })) };
    if (selection.selected.length === 0) return { ...result, outcome: 'not-at-baseline', reasons: ['keine Einzelfassung galt am Stichtag'] };
    law.body = assembly.body;
    figureSources = assembly.figureSources;
    law.sourceValidFrom = assembly.validFrom;
    law.sourceValidTo = assembly.validTo;
    if (!law.sourceValidFrom) delete law.sourceValidFrom;
    if (!law.sourceValidTo) delete law.sourceValidTo;
    // Öffentlich genügt die Dokumentnummer der Norm als Provenienzkennung; die einzelnen juris-Einzelfassungen
    // (Einheiten-Segmentierung der Datenbank) stehen nur im Manifest (Audit B9).
    law.sourceReferences = [...law.sourceReferences.filter((reference) => reference.kind === 'official-gazette'), frameHistoricalReference(document, selection.selected.length, assembly.validFrom, assembly.validTo)];
    law.sourceNotes = [...(law.sourceNotes ?? []).filter((note) => note.label !== 'Ausgabe (juris)'), { label: 'Stichtagsfassung', text: `Zusammengesetzt aus ${selection.selected.length} am ${options.context.baselineDate} geltenden Einzelfassungen der juris-Historie${selection.omitted.length ? `; ${selection.omitted.length} Einheit(en) galten am Stichtag nicht (${selection.omitted.slice(0, 3).map((entry) => `${entry.key}: ${entry.reason}`).join('; ')})` : ''}.` }];
    sourceStatus = { validity: 'exact', text: 'direct', note: 'Stichtagsfassung aus den am Stichtag geltenden Einzelfassungen der juris-Historie (Fassung je Einheit mit Gültigkeitszeitraum).' };
    provenanceNote = `Stichtagsfassung aus ${selection.selected.length} historischen Einzelfassungen (juris), nicht aus dem heutigen Text.`;
    for (const finding of assembly.findings) findings.push({ severity: finding.severity, code: finding.code, message: finding.message });
    const assembled = new Set(assembly.findings.map((finding) => finding.code));
    const blockingAssembly = [...assembled].filter((code) => REVIEW_PARSE_CODES.includes(code));
    if (blockingAssembly.length > 0) {
      reasons.push(`Parserbefunde (Einzelfassungen): ${blockingAssembly.join(', ')}`);
      for (const code of blockingAssembly) blockers.push({ kind: 'parse-units', code, detail: assembly.findings.filter((finding) => finding.code === code).map((finding) => finding.message).slice(0, 3).join(' | ') });
    }
  }

  if (baseline.class === 'undetermined' && !result.historical) {
    reasons.push(`Stichtag unbestimmt: ${baseline.basis}`);
    blockers.push({ kind: 'baseline', code: 'undetermined', detail: baseline.basis });
  }
  if (!ACCEPTED_INTEGRITY.includes(result.integrity!.class)) {
    reasons.push(`Textintegrität ${result.integrity!.class} (fehlend ${result.integrity!.missing}, zusätzlich ${result.integrity!.extra})`);
    blockers.push({ kind: 'integrity', code: result.integrity!.class, detail: `fehlend ${result.integrity!.missing}, zusätzlich ${result.integrity!.extra}` });
  }
  if (!result.historical) {
    const blocking = [...new Set(findings.filter((finding) => REVIEW_PARSE_CODES.includes(finding.code)).map((finding) => finding.code))];
    if (blocking.length > 0) {
      reasons.push(`Parserbefunde: ${blocking.join(', ')}`);
      for (const code of blocking) blockers.push({ kind: 'parse', code, detail: findings.filter((finding) => finding.code === code).map((finding) => finding.message).slice(0, 3).join(' | ') });
    }
  }

  try {
    const transformed = transformToNsh(law, options.context, { sourceArea: document.area, institutions: options.institutions, sourceStatus, ...(provenanceNote ? { provenanceNote } : {}), ...(options.knownStateAbbreviations ? { transformation: { knownStateLawAbbreviations: options.knownStateAbbreviations } } : {}) });
    const audit = auditRecord(transformed.record);
    result.findings.push(...transformed.findings, ...audit);
    result.record = transformed.record;
    result.slug = transformed.record.meta.slug;
    const figures: DocumentFigure[] = [];
    for (const asset of transformed.record.versions.flatMap((version) => figureAssets(version.body))) {
      const source = figureSources.find((candidate) => candidate.sha256 === asset.sha256);
      if (!source) {
        reasons.push(`Abbildung ${asset.sourcePath} ohne belegte Herkunft`);
        blockers.push({ kind: 'parse', code: 'figure-unbound', detail: `${asset.sourcePath} (${asset.sha256.slice(0, 16)}…)` });
        continue;
      }
      if (figures.some((figure) => figure.sha256 === asset.sha256)) continue;
      figures.push({ sha256: asset.sha256, mediaType: asset.mediaType as DocumentFigure['mediaType'], byteLength: asset.byteLength, sourcePath: asset.sourcePath, sourceDocumentId: source.documentId, pdf: source.raw });
    }
    if (figures.length > 0) result.figures = figures;
    result.transform = { changes: transformed.report.changes.length, unresolved: transformed.report.unresolved.length, auditOk: transformed.report.postTransformAudit.ok };
    const transformProblems = [...transformed.findings, ...audit].filter((finding) => finding.severity !== 'info');
    const blockingTransform = transformProblems.filter((finding) => !NON_BLOCKING_TRANSFORM_CODES.includes(finding.code));
    if (blockingTransform.length > 0) {
      reasons.push(`Überleitung: ${[...new Set(blockingTransform.map((finding) => finding.code))].join(', ')}`);
      for (const code of new Set(blockingTransform.map((finding) => finding.code))) blockers.push({ kind: 'transform', code, detail: blockingTransform.filter((finding) => finding.code === code).map((finding) => finding.message).slice(0, 3).join(' | ') });
    }
    for (const finding of transformProblems.filter((entry) => NON_BLOCKING_TRANSFORM_CODES.includes(entry.code))) result.warnings.push(`${finding.code}: ${finding.message}`);
    if (transformed.report.unresolved.length > 0) result.warnings.push(`${transformed.report.unresolved.length} Bezeichnung(en) des Herkunftslandes unverändert (Kategoriestandard review, nicht sperrend): ${[...new Set(transformed.report.unresolved.map((entry) => entry.category))].join(', ')}`);
  } catch (error) {
    return { ...result, outcome: 'failed', reasons: [...reasons, `Überleitung/Schema: ${(error as Error).message.slice(0, 300)}`], blockers: [...blockers, { kind: 'schema', code: 'transform-or-schema', detail: (error as Error).message.slice(0, 300) }] };
  }
  if (reasons.length > 0) return { ...result, outcome: 'review', reasons, blockers };
  return result;
}
