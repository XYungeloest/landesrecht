/**
 * Quellparser BAYERN.RECHT: zwei DTD-Frontends, ein gemeinsames Zielmodell.
 *
 * Das Ergebnis ist ein `SourceLaw` nach `@landesrecht/importer-common/pipeline.ts` – also **echtes
 * bayerisches Recht**, noch nicht nach Bayern-Württemberg übergeleitet. Die Überleitung ist Sache
 * der Transformationsstufe.
 *
 * Zwei Dinge, die diesen Parser von den Geschwistern unterscheiden:
 *
 * 1. **`@builddate` ist tagesaktuell.** Das Wurzelelement von `byrecht-norm` trägt den
 *    Konsolidierungszeitpunkt (`17.09.2026_02:00`), und der ändert sich jede Nacht. Er wird als
 *    Metadatum zurückgegeben (`BayernRechtDocument.buildDate`), landet aber weder im `SourceLaw`
 *    noch im Fingerabdruck. Sonst gälte am nächsten Tag der gesamte Bestand als geändert. Aus
 *    demselben Grund bleiben auch `retrievedAt` und der SHA-256 des Exportpakets aus dem
 *    Fingerabdruck heraus: Das Paket enthält das `builddate` und ändert seinen Hash täglich mit.
 * 2. **Fail-closed.** Eine unbekannte Struktur wird nie übergangen. Vorgabe ist der Abbruch mit
 *    `ImportPipelineError`; mit `unknown: 'report'` bleibt der Inhalt als Text erhalten und der
 *    Elementname erscheint namentlich als `error`-Befund, aus dem der Bulk-Lauf einen Review-Fall
 *    der Kategorie `unknown-structure` macht.
 */
import { createHash } from 'node:crypto';

import type { ExternalIdentifier, NormBodyBlock, SourceReference } from '@landesrecht/legal-core/lib/schema.ts';
import {
  ImportPipelineError,
  retrievalDate,
  type ArchivedSource,
  type ImportFinding,
  type SourceLaw,
  type SourceParser,
  type SourcePortal,
} from '@landesrecht/importer-common/pipeline.ts';

import { documentUrl, pdfUrl, type PortalAddress, type UnresolvedAddress } from './addresses.ts';
import { createParseContext, type BayernRechtDialect, type CitationTarget, type GraphicReference, type ParseContext, type ResourceLink, type UnknownPolicy } from './flow.ts';
import { readBayernRechtPackage, type PackageAttachment } from './package.ts';
import { parseNormDocument, type NormHead } from './norm.ts';
import { parseVvDocument, type VvHead, type VvSectionEffectiveDate } from './vv.ts';
import { readXmlDocument, stripByteOrderMark } from './xml.ts';

export const PORTAL: SourcePortal = 'bayernrecht';
export const SOURCE_LABEL = 'BAYERN.RECHT';

export type { BayernRechtDialect, CitationTarget, GraphicReference, ResourceLink, UnknownPolicy } from './flow.ts';
export type { PortalAddress, UnresolvedAddress } from './addresses.ts';
export type { PackageAttachment, BayernRechtPackage } from './package.ts';
export type { NormHead, NormDocument } from './norm.ts';
export type { VvHead, VvDocument, VvSectionEffectiveDate } from './vv.ts';
export { readBayernRechtPackage, readPackageManifest } from './package.ts';
export { readXmlDocument, stripByteOrderMark } from './xml.ts';
export { documentUrl, pdfUrl, zipUrl, provisionSuffix } from './addresses.ts';
export { toSuperscript, normalizeInline } from './flow.ts';

export interface BayernRechtParseOptions {
  /** `throw` (Vorgabe) bricht bei unbekannter Struktur ab, `report` erzeugt einen benannten Befund. */
  unknown?: UnknownPolicy;
  /** Beilagen aus dem Paketmanifest (PDF und Bilder); ohne Paket leer. */
  attachments?: readonly PackageAttachment[];
  /** Beobachtungen des Paketlesers, die als Befund erscheinen sollen. */
  packageWarnings?: readonly string[];
}

export interface BayernRechtDocument {
  dialect: BayernRechtDialect;
  documentId: string;
  /** `dokumentation/@doktyp` bzw. `bayernrecht_dokumentklasse/@wert`. */
  documentType?: string;
  bayRsNumber?: string;
  /**
   * Konsolidierungszeitpunkt aus `byrecht-norm/@builddate` (`TT.MM.JJJJ_HH:MM`). Tagesaktuell –
   * darf in keinen Fingerabdruck und in keinen Determinismusvergleich eingehen. Die VV-DTD kennt
   * ihn nicht, dort bleibt das Feld leer.
   */
  buildDate?: string;
  head: NormHead | VvHead;
  law: SourceLaw;
  /** Portal-Permalinks, aus dem beim Parsen mitgezählten Positionspfad gebildet. */
  addresses: PortalAddress[];
  /** Knoten mit gezähltem Positionspfad, für die keine Portal-ID belegt ist (VV-Gliederungen). */
  unresolvedAddresses: UnresolvedAddress[];
  attachments: PackageAttachment[];
  citations: CitationTarget[];
  /** Abbildungen aus `<graphic>`: als Beilage im Paket, nicht im Normkörper. */
  graphics: GraphicReference[];
  /** Verweise aus `<a href="resources/…">` auf Dateien des Exportpakets. */
  resourceLinks: ResourceLink[];
  sectionEffectiveDates: VvSectionEffectiveDate[];
  /** Deterministischer Inhaltsabdruck **ohne** `builddate`, Abrufzeit und Paket-Hash. */
  fingerprint: string;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const DIALECT_PATTERN = /<!DOCTYPE\s+(byrecht-norm|byrecht-vv)\b|<(byrecht-norm|byrecht-vv)[\s>]/u;

/** Erkennt das Dokumentmodell an DOCTYPE oder Wurzelelement, ohne das Dokument zu parsen. */
export function detectBayernRechtDialect(content: string): BayernRechtDialect | undefined {
  const match = DIALECT_PATTERN.exec(stripByteOrderMark(content).slice(0, 4096));
  const name = match?.[1] ?? match?.[2];
  return name === 'byrecht-norm' || name === 'byrecht-vv' ? name : undefined;
}

function germanDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(iso);
  if (!match) return undefined;
  const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  return `${Number.parseInt(match[3]!, 10)}. ${months[Number.parseInt(match[2]!, 10) - 1]} ${match[1]}`;
}

function mainSourceReference(source: ArchivedSource, documentId: string): SourceReference {
  const availability: SourceReference['availability'] = source.objectKey ? 'r2-archived' : source.localSource ? 'versioned' : 'external';
  const reference: SourceReference = {
    kind: 'official-portal-snapshot',
    system: 'bayernrecht',
    label: `${SOURCE_LABEL} XML-Export ${documentId}`,
    availability,
    url: source.url,
    retrievedAt: retrievalDate(source.retrievedAt),
    externalId: documentId,
    mediaType: 'application/xml',
    sourceRole: 'structure-bearing',
  };
  if (source.objectKey) reference.objectKey = source.objectKey;
  if (source.localSource) reference.localSource = source.localSource;
  if (SHA256_PATTERN.test(source.sha256 ?? '')) reference.sha256 = source.sha256;
  return reference;
}

/**
 * Beilagen als Quellenreferenz. PDF-Beilagen sind unverortet (das XML referenziert sie nicht);
 * Bildbeilagen sind über `graphic@FileRef` bzw. `a@href` verortet, werden aber nicht in den
 * Normkörper übernommen, weil das Blockmodell keinen Bildblock kennt. Für Bilder bleibt `mediaType`
 * leer: Der Vorrat von `legal-core` kennt keine Bildmedienart, und die Deklaration des Portals
 * (`image/jpg`) wird nicht stillschweigend auf einen anderen Wert umgeschrieben.
 */
function attachmentReferences(attachments: readonly PackageAttachment[], source: ArchivedSource): SourceReference[] {
  return attachments.map((attachment) => {
    const reference: SourceReference = {
      kind: 'primary-pdf',
      system: 'bayernrecht',
      label: `Beilage ${attachment.path}`,
      availability: 'external',
      url: source.url,
      sha256: attachment.sha256,
      sourceRole: 'visual-control',
      derivedSource: attachment.path,
      note: attachment.kind === 'pdf'
        ? 'Unverortete PDF-Beilage aus dem Exportpaket; das XML referenziert sie nicht, eine Zuordnung zur Textstelle ist aus dem Export nicht herstellbar.'
        : `Bildbeilage aus dem Exportpaket, im Manifest als ${attachment.mediaType} deklariert; im XML über <graphic>/<a> referenziert, im Normkörper nicht enthalten.`,
    };
    if (attachment.kind === 'pdf') reference.mediaType = 'application/pdf';
    return reference;
  });
}

/** Kanonische JSON-Darstellung mit sortierten Objektschlüsseln (Grundlage des Fingerabdrucks). */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Deterministischer Inhaltsabdruck einer geparsten Fassung.
 *
 * Bewusst **nicht** enthalten: `findings` (Diagnose, kein Inhalt), `sourceReferences` (tragen
 * Abrufzeit, R2-Schlüssel und den SHA-256 des Exportpakets – und der ändert sich täglich mit dem
 * `builddate` im XML). Die Beilagen gehen stattdessen mit Pfad, Größe und eigenem Hash ein; die sind
 * stabil.
 */
export function sourceLawFingerprint(law: SourceLaw, attachments: readonly PackageAttachment[] = []): string {
  const { findings: _findings, sourceReferences: _references, ...content } = law;
  const input = {
    ...content,
    attachments: attachments.map((entry) => ({ path: entry.path, sha256: entry.sha256, byteLength: entry.byteLength })),
  };
  return createHash('sha256').update(canonicalize(input)).digest('hex');
}

function finalizeFindings(ctx: ParseContext, documentId: string, packageWarnings: readonly string[] = []): ImportFinding[] {
  const findings = [...ctx.findings];
  if (packageWarnings.length > 0) {
    findings.push({
      severity: 'warning',
      code: 'package-media-type-mismatch',
      message: `${documentId}: ${packageWarnings.length} Beilagen, deren deklarierte Medienart nicht zur Dateiendung passt – ${packageWarnings.slice(0, 3).join(' · ')}${packageWarnings.length > 3 ? ` … (+${packageWarnings.length - 3})` : ''}`,
    });
  }
  const counters = ctx.counters;
  if (counters.footnotes > 0) {
    findings.push({ severity: 'info', code: 'footnotes', message: `${counters.footnotes} Fußnoten aus <fn.call> an der Aufrufstelle übernommen (${counters.unmarkedFootnotes} ohne eigenes Aufrufzeichen)` });
  }
  if (counters.sentenceMarkers > 0) {
    findings.push({ severity: 'info', code: 'sentence-numbers', message: `${counters.sentenceMarkers} Satznummern als Inline-Marker übernommen (Unicode-Hochzahl vor dem Satz)` });
  }
  if (counters.tables > 0) {
    findings.push({ severity: 'info', code: 'tables', message: `${counters.tables} Tabellen nach dem Blockmodell übernommen` });
  }
  if (counters.deepSections > 0) {
    findings.push({
      severity: 'info',
      code: 'vv-depth-beyond-model',
      message: `${counters.deepSections} Gliederungen liegen unterhalb der zweiten Ebene (größte Tiefe ${counters.maxSectionDepth}); sie werden als „subsection“ geführt, weil das Zielmodell darunter keine eigene Ebene kennt`,
    });
  }
  if (ctx.graphics.length > 0) {
    const names = ctx.graphics.map((entry) => entry.fileName || entry.fileRef);
    const shown = names.slice(0, 8).join(', ');
    findings.push({
      severity: 'warning',
      code: 'graphic-not-transferred',
      message: `${ctx.graphics.length} Abbildungen aus <graphic> liegen als Beilage im Exportpaket und werden nicht in den Normkörper übernommen (das Blockmodell kennt keinen Bildblock): ${shown}${names.length > 8 ? ` … (+${names.length - 8})` : ''}`,
    });
  }
  if (counters.quotedProvisions > 0) {
    findings.push({
      severity: 'info',
      code: 'quoted-provisions',
      message: `${counters.quotedProvisions}× <Aenderungsinhalt>: zitierter Normtext eines Änderungsbefehls, als „quotedProvision“ geführt – kein geltender Text dieser Vorschrift, deshalb ohne Permalink`,
    });
  }
  if (ctx.unknownElements.size > 0) {
    findings.push({
      severity: 'error',
      code: 'unknown-structure',
      message: `${documentId}: unbekannte Strukturen im Export – ${[...ctx.unknownElements].sort().join(', ')}`,
    });
  }
  if (ctx.unknownAttributes.size > 0) {
    findings.push({
      severity: 'warning',
      code: 'unknown-attributes',
      message: `${documentId}: unbekannte Attribute im Export – ${[...ctx.unknownAttributes].sort().join(', ')}; ihr Vorrat ist in beiden DTDs typografisch, der Inhalt bleibt unverändert`,
    });
  }
  return findings;
}

/** Parst ein einzelnes Exportdokument (XML-Text, mit oder ohne BOM). */
export function parseBayernRechtDocument(source: ArchivedSource, content: string, options: BayernRechtParseOptions = {}): BayernRechtDocument {
  const dialect = detectBayernRechtDialect(content);
  if (!dialect) {
    throw new ImportPipelineError('parse-source-format', `${source.url}: weder <byrecht-norm> noch <byrecht-vv> – das Dokument wird nicht erkannt`);
  }
  const { root, doctype } = readXmlDocument(content);
  if (doctype && doctype.name !== root.name) {
    throw new ImportPipelineError('parse-source-format', `${source.url}: <!DOCTYPE ${doctype.name}> passt nicht zum Wurzelelement <${root.name}>`);
  }

  const ctx = createParseContext(dialect, options.unknown ?? 'throw');
  const attachments = [...(options.attachments ?? [])];

  let documentId: string;
  let documentType: string | undefined;
  let bayRsNumber: string | undefined;
  let buildDate: string | undefined;
  let head: NormHead | VvHead;
  let body: NormBodyBlock[];
  let addresses: PortalAddress[];
  let unresolvedAddresses: UnresolvedAddress[] = [];
  let sectionEffectiveDates: VvSectionEffectiveDate[] = [];
  let fullCitation: string | undefined;
  let changeHistory: string | undefined;
  let title: string;
  let shortTitle: string | undefined;
  let abbr: string | undefined;
  let normType: SourceLaw['type'];
  let documentDate: string | undefined;
  let sourceValidFrom: string | undefined;
  let fallbackCitation: string;

  if (dialect === 'byrecht-norm') {
    const parsed = parseNormDocument(root, ctx);
    head = parsed.head;
    documentId = parsed.head.documentId;
    documentType = parsed.head.documentType;
    bayRsNumber = parsed.head.bayRsNumber;
    buildDate = parsed.buildDate;
    body = parsed.body;
    addresses = parsed.addresses;
    unresolvedAddresses = parsed.unresolvedAddresses;
    fullCitation = parsed.fullCitation;
    changeHistory = parsed.changeHistory;
    title = parsed.head.title;
    shortTitle = parsed.head.shortTitle;
    abbr = parsed.head.abbr;
    normType = parsed.head.normType;
    documentDate = parsed.head.documentDate;
    sourceValidFrom = parsed.head.inForceFrom;
    const version = parsed.head.versionReference;
    const reference = version.year || version.page
      ? `GVBl. ${[version.year, version.page ? `${version.pageKind === 'nummer' ? 'Nr.' : 'S.'} ${version.page}` : undefined].filter(Boolean).join(' ')}`
      : undefined;
    fallbackCitation = [
      title,
      germanDate(parsed.head.documentDate) ? `vom ${germanDate(parsed.head.documentDate)}` : undefined,
      reference ? `(${reference})` : undefined,
      parsed.head.bayRsNumber ? `BayRS ${parsed.head.bayRsNumber}` : undefined,
    ].filter(Boolean).join(' ');
  } else {
    const parsed = parseVvDocument(root, ctx);
    head = parsed.head;
    documentId = parsed.head.documentId;
    documentType = parsed.head.documentClass;
    bayRsNumber = parsed.head.bayRsNumber;
    body = parsed.body;
    addresses = parsed.addresses;
    unresolvedAddresses = parsed.unresolvedAddresses;
    sectionEffectiveDates = parsed.sectionEffectiveDates;
    fullCitation = parsed.fullCitation;
    title = parsed.head.title;
    shortTitle = parsed.head.shortTitle;
    abbr = parsed.head.abbr;
    normType = parsed.head.normType;
    // Die VV-DTD führt kein Ausfertigungsdatum als Feld; es steht nur als Fließtext im Subtitel.
    documentDate = undefined;
    sourceValidFrom = parsed.head.inForceFrom;
    const gazette = parsed.head.gazette;
    const reference = gazette.organ || gazette.year || gazette.page
      ? `${[gazette.organ, gazette.year, gazette.page ? `${gazette.pageKind === 'nummer' ? 'Nr.' : 'S.'} ${gazette.page}` : undefined].filter(Boolean).join(' ')}`
      : undefined;
    fallbackCitation = [title, reference ? `(${reference})` : undefined].filter(Boolean).join(' ');
  }

  // Jede im XML referenzierte Datei muss als Beilage im Paket liegen. Die Schreibweise stimmt dabei
  // nicht immer überein: das XML schreibt `Bay_791_3_150_U_…jpg` und `…-A001.PDF`, das Manifest
  // `BAY_791_3_150_U_…jpg` und `…-a001.pdf`. Der Abgleich ignoriert deshalb Groß-/Kleinschreibung
  // und meldet die Abweichung eigens – geraten wird nichts, und glattgezogen wird auch nichts.
  if (attachments.length > 0) {
    const available = new Map(attachments.map((entry) => [entry.fileName.toLowerCase(), entry.fileName]));
    const referenced = [...new Set([...ctx.graphics.map((entry) => entry.fileName), ...ctx.resourceLinks.map((entry) => entry.fileName)])]
      .filter((name) => name !== '' && /\.(?:jpe?g|gif|png|pdf)$/iu.test(name));
    const missing = referenced.filter((name) => !available.has(name.toLowerCase()));
    const misspelled = referenced.filter((name) => available.has(name.toLowerCase()) && available.get(name.toLowerCase()) !== name);
    if (missing.length > 0) {
      ctx.findings.push({ severity: 'warning', code: 'referenced-file-missing', message: `${documentId}: im XML referenzierte Dateien fehlen im Exportpaket: ${missing.join(', ')}` });
    }
    if (misspelled.length > 0) {
      ctx.findings.push({
        severity: 'info',
        code: 'referenced-file-case-mismatch',
        message: `${documentId}: ${misspelled.length} Dateiverweise weichen in der Groß-/Kleinschreibung vom Paketmanifest ab (${misspelled.slice(0, 3).map((name) => `${name} → ${available.get(name.toLowerCase())}`).join(', ')})`,
      });
    }
  }

  const sourceNotes: Array<{ label: string; text: string }> = [];
  const pdfAttachments = attachments.filter((entry) => entry.kind === 'pdf');
  const imageAttachments = attachments.filter((entry) => entry.kind === 'image');
  if (pdfAttachments.length > 0) {
    sourceNotes.push({
      label: 'Unverortete Beilagen',
      text: `Das Exportpaket enthält ${pdfAttachments.length} PDF-Beilagen, die das XML nicht referenziert: ${pdfAttachments.map((entry) => entry.path).join(', ')}.`,
    });
  }
  if (imageAttachments.length > 0) {
    sourceNotes.push({
      label: 'Abbildungen',
      text: `Das Exportpaket enthält ${imageAttachments.length} Abbildungen, die das XML über <graphic>/<a> referenziert und die nicht in den Normkörper übernommen werden: ${imageAttachments.map((entry) => entry.path).join(', ')}.`,
    });
  }
  if (sectionEffectiveDates.length > 0) {
    sourceNotes.push({
      label: 'Abschnittsweises Inkrafttreten',
      text: sectionEffectiveDates.map((entry) => `${[entry.label, entry.title].filter(Boolean).join(' ') || '(ohne Überschrift)'}: ${entry.date}`).join('\n'),
    });
  }

  const externalIdentifiers: ExternalIdentifier[] = [{ system: 'bayernrecht', value: documentId, url: documentUrl(documentId) }];
  if (bayRsNumber) externalIdentifiers.push({ system: 'bayrs', value: bayRsNumber });

  // Die Dokumentadresse steht immer voran; sie ist die einzige, die auch für Verwaltungsvorschriften
  // belegt ist.
  addresses = [{ documentId, kind: 'document', label: abbr, title, position: [], blockPath: [], url: documentUrl(documentId) }, ...addresses];

  const law: SourceLaw = {
    portal: PORTAL,
    externalIdentifiers,
    title,
    shortTitle,
    abbr,
    type: normType,
    sourceValidFrom,
    documentDate,
    citation: fullCitation ?? fallbackCitation ?? title,
    subjects: [],
    keywords: [],
    body,
    sourceNotes: sourceNotes.length > 0 ? sourceNotes : undefined,
    sourceReferences: [mainSourceReference(source, documentId), ...attachmentReferences(attachments, source)],
    findings: finalizeFindings(ctx, documentId, options.packageWarnings),
    sourceIdentity: documentId,
    sourceUrl: documentUrl(documentId),
    pdfUrl: pdfUrl(documentId),
    fullCitation,
    changeHistory,
  };

  return {
    dialect,
    documentId,
    documentType,
    bayRsNumber,
    buildDate,
    head,
    law,
    addresses,
    unresolvedAddresses,
    attachments,
    citations: ctx.citations,
    graphics: ctx.graphics,
    resourceLinks: ctx.resourceLinks,
    sectionEffectiveDates,
    fingerprint: sourceLawFingerprint(law, attachments),
  };
}

/** Parst ein vollständiges Exportpaket (`/Content/Zip/<Kurzbezeichnung>`) einschließlich Beilagen. */
export function parseBayernRechtPackage(source: ArchivedSource, bytes: Uint8Array, options: BayernRechtParseOptions = {}): BayernRechtDocument {
  const archive = readBayernRechtPackage(bytes);
  return parseBayernRechtDocument(source, archive.xml, { ...options, attachments: archive.attachments, packageWarnings: archive.warnings });
}

/**
 * Parser nach dem Vertrag aus `importer-common/pipeline.ts`. `content` ist der XML-Text des
 * Exportdokuments; Beilagen kommen über `options.attachments` aus dem Paketmanifest.
 */
export function createBayernRechtParser(options: BayernRechtParseOptions = {}): SourceParser {
  return {
    portal: PORTAL,
    detect(_source: ArchivedSource, content: string): boolean {
      return detectBayernRechtDialect(content) !== undefined;
    },
    async parse(source: ArchivedSource, content: string): Promise<SourceLaw> {
      return parseBayernRechtDocument(source, content, options).law;
    },
  };
}
