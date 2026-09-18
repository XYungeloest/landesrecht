/**
 * Der ganze Weg an einem Dokument: ZIP → XML → Parser → Überleitung → `NormRecord` →
 * `validateNormRecord`.
 *
 * Diese Datei kennt kein Dateisystem und keine Uhr. Sie bekommt die Bytes eines Exportpakets und
 * gibt einen Inventureintrag zurück – auch dann, wenn unterwegs etwas scheitert. **Nichts wirft
 * nach außen:** Ein Fehler an einem Dokument ist der Ausgang dieses Dokuments, nicht das Ende des
 * Laufs. Genau darauf beruht die Aussage über den ganzen Bestand.
 */
import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { ImportFinding, TransformContext } from '@landesrecht/importer-common/pipeline.ts';

import { EVALUATION_DATE, type SourceArea } from '../common/constants.ts';
import { parseBayernRechtDocument, type BayernRechtDocument } from '../parse/index.ts';
import { readBayernRechtPackage } from '../parse/package.ts';
import { readXmlDocument } from '../parse/xml.ts';
import { auditRecord } from '../transform/audit-record.ts';
import type { CompiledInstitutionRegistry } from '../transform/institution-registry.ts';
import { transformToBayWue } from '../transform/transform.ts';
import { worstOutcome, type InventoryEntry, type InventoryFinding, type InventoryOutcome, type InventoryPhase, type TextIntegrityResult } from './model.ts';
import { abortFinding, collectFindings, excerptOf, type FindingContext } from './signature.ts';
import { blockText, compareTextIntegrity, repeatedSourceText, transferredFootnoteMarkers } from './text.ts';

export interface InventoryDocumentInput {
  documentId: string;
  sourceArea: SourceArea;
  /** Titel aus der Enumeration; der geparste Titel ersetzt ihn, sobald er vorliegt. */
  title: string;
  /** Adresse des Exportpakets (Provenienz; sie wird nicht abgerufen). */
  url: string;
  bytes: Uint8Array;
  sha256: string;
  byteLength: number;
  institutions?: CompiledInstitutionRegistry;
}

/** Zeilenzugriff auf den XML-Text für den Ausschnitt eines Befundes. */
function lineAccessor(xml: string): (line: number) => string | undefined {
  let lines: string[] | undefined;
  return (line: number) => {
    lines ??= xml.split('\n');
    return lines[line - 1];
  };
}

/**
 * Ein Abbruch des Parsers ist entweder eine unbekannte Struktur (die Quelle führt etwas, das das
 * Modell nicht kennt) oder eine beschädigte Quelle (die Quelle hält ihr eigenes Modell nicht ein).
 * Die Unterscheidung steht in der Meldung – der Parser benennt Unbekanntes ausdrücklich als solches.
 */
function parseAbortOutcome(error: unknown): InventoryOutcome {
  const message = error instanceof Error ? error.message : String(error);
  return /unbekannt/iu.test(message) ? 'unknown-structure' : 'source-corrupt';
}

/**
 * Textintegrität eines geparsten Dokuments: sichtbarer Quelltext gegen kanonischen Text, mit den benannten
 * Erklärungen zulässiger Unterschiede. Inventur **und** Bulk rufen genau diese Funktion auf – vorher prüfte nur
 * die Inventur, und der Bulk übernahm Normen, die sie als `mismatch` meldete.
 */
export function assessTextIntegrity(document: BayernRechtDocument, xml: string): TextIntegrityResult {
  const { root } = readXmlDocument(xml);
  const canonicalParts = document.dialect === 'byrecht-norm'
    ? [document.law.title, blockText(document.law.body), document.law.changeHistory, document.law.fullCitation]
    : [blockText(document.law.body), document.law.fullCitation];
  const explained: Array<{ reason: string; text: string }> = [];
  const divisionNumber = document.law.findings.find((finding) => finding.code === 'division-number-before-title');
  if (divisionNumber) {
    const value = /„([^“]*)“/u.exec(divisionNumber.message)?.[1];
    if (value) explained.push({ reason: 'division-number-before-title', text: value });
  }
  const repeated = repeatedSourceText(root);
  if (repeated.length > 0) explained.push({ reason: 'annex-number-repeated-in-source', text: repeated.join(' ') });
  const markers = transferredFootnoteMarkers(root, document.dialect);
  if (markers.length > 0) explained.push({ reason: 'footnote-label-repeats-call-marker', text: markers.join(' ') });
  // Ersatzmarken („Fn 3“) für Fußnoten ohne eigenes Aufrufzeichen stehen im Zielkörper und in
  // keiner Quelle – auch die der Fußnoten in <titelangaben>: Der Parser führt sie seit der Korrektur
  // der Titelfußnoten (titleFootnotes) im Körper, samt Marke.
  const substitutes = document.law.findings
    .filter((finding) => finding.code === 'footnote-marker-missing')
    .map((finding) => /„([^“]*)“/u.exec(finding.message)?.[1])
    .filter((label): label is string => Boolean(label));
  if (substitutes.length > 0) explained.push({ reason: 'footnote-marker-substituted', text: substitutes.join(' ') });
  return compareTextIntegrity({ dialect: document.dialect, root, canonicalParts, explained });
}

export function inventoryDocument(input: InventoryDocumentInput): InventoryEntry {
  const base: InventoryEntry = {
    documentId: input.documentId,
    sourceArea: input.sourceArea,
    title: input.title,
    outcome: 'parsed',
    phase: 'package',
    sha256: input.sha256,
    byteLength: input.byteLength,
    findings: [],
    codes: [],
  };
  const context: FindingContext = { documentId: input.documentId, phase: 'package' };

  // 1. Paket: Manifest gegen Paketinhalt, genau ein Normdokument, bekannte Medienarten.
  let archive;
  try {
    archive = readBayernRechtPackage(input.bytes);
  } catch (error) {
    return finish({ ...base, outcome: 'source-corrupt', phase: 'package', findings: [abortFinding(error, 'package-unreadable', context)] });
  }
  base.documentPath = archive.documentPath;
  const lineAt = lineAccessor(archive.xml);
  const parseContext: FindingContext = { documentId: input.documentId, phase: 'parse', lineAt };

  // 2. Parser, meldend: Eine unbekannte Struktur wird benannt, nicht übergangen – und bricht nicht ab.
  let document;
  try {
    document = parseBayernRechtDocument(
      // `retrievedAt` ist bewusst die Auswertungskonstante und nicht die Abrufzeit des Cacheeintrags:
      // Die Inventur soll über denselben Cache dasselbe Ergebnis liefern, auch nach einem Neuabruf.
      { portal: 'bayernrecht', url: input.url, retrievedAt: EVALUATION_DATE, mediaType: 'application/zip', sha256: input.sha256 },
      archive.xml,
      { unknown: 'report', attachments: archive.attachments, packageWarnings: archive.warnings },
    );
  } catch (error) {
    const outcome = parseAbortOutcome(error);
    return finish({ ...base, outcome, phase: 'parse', findings: [abortFinding(error, outcome === 'unknown-structure' ? 'parse-unknown-structure' : 'parse-source-format', parseContext)] });
  }

  base.dialect = document.dialect;
  base.title = document.law.title;
  base.documentType = document.documentType;
  base.normType = document.law.type;
  base.graphics = document.graphics.length;
  base.attachments = {
    pdf: document.attachments.filter((attachment) => attachment.kind === 'pdf').length,
    image: document.attachments.filter((attachment) => attachment.kind === 'image').length,
  };
  const findings: InventoryFinding[] = collectFindings(document.law.findings, parseContext);

  // 3. Textintegrität: sichtbarer Quelltext gegen kanonischen Text.
  try {
    base.textIntegrity = assessTextIntegrity(document, archive.xml);
    // Ein Integritätsbefund gehört auch in die Klassenbildung: Wo der Text verloren geht, ist eine
    // Struktureigenschaft der Quelle (meist ein bestimmtes Element) – und damit eine Klasse.
    const integrityFinding = textIntegrityFinding(base.textIntegrity, input.documentId);
    if (integrityFinding) findings.push(integrityFinding);
  } catch (error) {
    findings.push(abortFinding(error, 'text-integrity-unavailable', parseContext));
  }

  // 4. Überleitung und Schemaprüfung; `validateNormRecord` läuft in `transformToBayWue`.
  const transformContext: TransformContext = {
    targetJurisdiction: 'baywue',
    baselineDate: SIMULATION_BASELINE_DATE,
    // Keine Slugvergabe über den Bestand: Sie hinge an der Laufreihenfolge und machte einen
    // fortgesetzten Lauf unvergleichbar. Kollisionen weist die Inventur gesondert aus.
    reserveSlug: (candidate: string) => candidate,
  };
  const transformFindings: ImportFinding[] = [];
  try {
    const result = transformToBayWue(document.law, transformContext, {
      sourceArea: input.sourceArea,
      ...(input.institutions ? { institutions: input.institutions } : {}),
    });
    base.slug = result.record.meta.slug;
    transformFindings.push(...result.findings, ...auditRecord(result.record));
  } catch (error) {
    const schema = error instanceof Error && error.name === 'ContentValidationError';
    const phase: InventoryPhase = schema ? 'validate' : 'transform';
    findings.push(abortFinding(error, schema ? 'schema-invalid' : 'transform-aborted', { documentId: input.documentId, phase, lineAt }));
    return finish({ ...base, outcome: schema ? 'schema-failed' : 'transform-failed', phase, findings });
  }
  findings.push(...collectFindings(transformFindings, { documentId: input.documentId, phase: 'transform' }));

  // 5. Ausgang: der schwerste Befund gewinnt.
  const candidates: InventoryOutcome[] = [];
  let decidingPhase: InventoryPhase = 'validate';
  // Ein Fehlerbefund des Parsers ist eine unbekannte Struktur; der Integritätsbefund hat seinen
  // eigenen Ausgang und darf hier nicht mitzählen.
  if (findings.some((finding) => finding.severity === 'error' && finding.phase === 'parse' && !finding.code.startsWith('text-integrity'))) {
    candidates.push('unknown-structure');
    decidingPhase = 'parse';
  }
  if (findings.some((finding) => finding.severity === 'error' && (finding.phase === 'transform' || finding.phase === 'validate'))) {
    candidates.push('transform-failed');
    decidingPhase = 'transform';
  }
  if (base.textIntegrity?.class === 'mismatch') candidates.push('integrity-mismatch');
  if (findings.some((finding) => finding.code === 'referenced-file-missing')) candidates.push('missing-assets');
  if (findings.some((finding) => finding.severity === 'warning')) candidates.push('parsed-with-warnings');
  const outcome = worstOutcome(candidates.length > 0 ? candidates : ['parsed']);
  const phase: InventoryPhase = outcome === 'unknown-structure' || outcome === 'transform-failed' ? decidingPhase : 'validate';
  return finish({ ...base, outcome, phase, findings });
}

/**
 * Der Integritätsbefund als Strukturbefund. Die Signatur nennt das Element, in dem der verlorene
 * Abschnitt steht – zwei Dokumente, die denselben Elementtyp verlieren, gehören zusammen.
 */
function textIntegrityFinding(integrity: TextIntegrityResult, documentId: string): InventoryFinding | undefined {
  if (integrity.class !== 'mismatch' && integrity.class !== 'review') return undefined;
  const element = /^<([^>]+)>/u.exec(integrity.lostExcerpt ?? '')?.[1];
  const kind = integrity.lostExcerpt ? `verlorener Abschnitt in <${element}>` : integrity.extra > integrity.missing ? 'zusätzlicher Text im Zielkörper' : 'fehlende Wörter ohne zusammenhängenden Abschnitt';
  return {
    code: `text-integrity-${integrity.class}`,
    severity: integrity.class === 'mismatch' ? 'error' : 'warning',
    phase: 'parse',
    signature: `text-integrity:${integrity.class}:${element ? `<${element}>` : kind}`,
    excerpt: excerptOf(integrity.lostExcerpt ?? integrity.duplicatedExcerpt ?? `${documentId}: ${integrity.missing} Wörter fehlen, ${integrity.extra} zusätzlich`),
  };
}

/** Eintrag mit sortierten Befunden und der Codeliste, auf der die Kennzahlen beruhen. */
function finish(entry: InventoryEntry): InventoryEntry {
  const findings = [...entry.findings].sort((left, right) => (left.signature < right.signature ? -1 : left.signature > right.signature ? 1 : 0));
  return { ...entry, findings, codes: [...new Set(findings.map((finding) => finding.code))].sort() };
}

/** Eintrag eines Dokuments, dessen Exportpaket nicht im Cache liegt – kein Fehler, nur nicht geprüft. */
export function notCachedEntry(documentId: string, sourceArea: SourceArea, title: string): InventoryEntry {
  return {
    documentId,
    sourceArea,
    title,
    outcome: 'skipped-not-cached',
    phase: 'package',
    sha256: '',
    byteLength: 0,
    findings: [],
    codes: [],
  };
}
