/**
 * Frontend für die DTD `byrecht-norm` (Gesetze, Rechtsverordnungen, Verfassung).
 *
 * Gerüst, an vier Exportinstanzen belegt:
 *
 *   byrecht-norm[@builddate]
 *     kopf
 *       angaben.versunabh   dokumentation[@doktyp @dokid], ausfertigung(ausfertigungsdatum, fundstelle.GVBl)
 *       angaben.versabh     inkraft, fassung(fassungsdatum, fundstelle.GVBl), gliederungsNr.BayRS,
 *                           kurzbezeichnung, titelangaben, amtlicheAbk
 *     rumpf
 *       aenderungsverlauf · normzitat · gliederung* (schachtelbar) · einzelnorm*
 *     annex*                (Geschwister von `rumpf`)
 *
 * Vorkehrungen aus Abschnitt 11.2 der Discovery, die hier sitzen:
 *   - `@builddate` ist der tagesaktuelle Konsolidierungszeitpunkt. Er wird als Metadatum
 *     zurückgegeben, geht aber **nicht** in den `SourceLaw` ein – sonst gälte jeder Bestand am
 *     nächsten Tag als geändert.
 *   - Leere Pflichtfelder (`kurzbezeichnung`, `amtlicheAbk`, `para.nr`, `annex.titel`, `jahr`, `seite`)
 *     sind zulässig und werden zu `undefined`, nicht zu Leerstrings.
 *   - Seitenangaben tragen das Präfix `S=` (`S=318` → `318`).
 *   - `gliederungsNr.BayRS` trägt einen abschließenden Zeilenumbruch.
 *   - Ausfertigung und Fassung haben je eine eigene Fundstelle; die Verfassung zeigt, warum man sie
 *     nicht verwechseln darf (1946 gegenüber 1998).
 *   - Aufgehobene Vorschriften stehen als Platzhalter mit leerem `absatz.text` und dem Titel
 *     „(aufgehoben)“; sie bleiben als Block erhalten.
 *   - `annex.nummer` kommt doppelt vor; die Variante mit `@int` ist die maschinell brauchbare.
 */
import type { NormBodyBlock, NormType } from '@landesrecht/legal-core/lib/schema.ts';
import { ImportPipelineError } from '@landesrecht/importer-common/pipeline.ts';

import { documentUrl, provisionSuffix, type PortalAddress, type UnresolvedAddress } from './addresses.ts';
import { addFinding, checkAttributes, flowBlocks, headingContent, inlineContent, normalizeGazetteNumber, recoverUnknown, reportUnknownElement, type ParseContext } from './flow.ts';
import { attribute, childElement, childElements, collapseWhitespace, elementChildren, rawText, type XmlElement, type XmlNode } from './xml.ts';

export interface GazetteReference {
  year?: string;
  page?: string;
  /** `seite` (GVBl.) oder `nummer` (BayMBl.); leer, wenn der Wert kein bekanntes Präfix trug. */
  pageKind?: 'seite' | 'nummer';
  /**
   * Verkündungsorgan aus `<sonstigeFundstelle><publikation>` – nur gesetzt, wenn die Fundstelle
   * nicht im GVBl. steht (belegt an VVBayHO: `FMBl. 1973 S. 259`). Fehlt der Wert, ist es das GVBl.
   */
  publication?: string;
}

export interface NormHead {
  documentId: string;
  documentType: string;
  normType: NormType;
  title: string;
  titleLines: string[];
  /** Wie viele Zeilen von `titleLines` der Titel umfasst; die übrigen stehen als Überschrift im Körper. */
  titleLineCount: number;
  /**
   * Fußnoten des Titelblocks.
   *
   * `<titelangaben>` trägt bei Staatsverträgen eine `<fn.call role="nichtamtlich">` mit der
   * Ratifikationsliste aller Länder – teils hundert Zeilen. Sie wurde verworfen, weil nur die
   * Zeilen des Blocks weitergereicht wurden; die Textintegritätsprüfung meldete daraufhin bei 179
   * Dokumenten Textverlust. Fachlich ist es nichtamtlicher redaktioneller Hinweis, also kein
   * Normtext – verloren gehen darf er trotzdem nicht.
   */
  titleFootnotes: NormBodyBlock[];
  shortTitle?: string;
  abbr?: string;
  bayRsNumber?: string;
  /** Ausfertigungsdatum (ISO). */
  documentDate?: string;
  /** Datum der geführten Fassung (ISO). */
  versionDate?: string;
  /** Beginn der Geltung der geführten Fassung (ISO). */
  inForceFrom?: string;
  issueReference: GazetteReference;
  versionReference: GazetteReference;
  /** `version.id` der geführten Zeitschicht; im gesamten Bestand bisher nur `p`. */
  versionKey?: string;
}

export interface NormDocument {
  head: NormHead;
  /** Knoten, deren Portal-ID nicht belegt ist (Inhalt von Anlagen). */
  unresolvedAddresses: UnresolvedAddress[];
  /** Konsolidierungszeitpunkt (`@builddate`) – tagesaktuell, nie gleichheitsrelevant. */
  buildDate?: string;
  body: NormBodyBlock[];
  addresses: PortalAddress[];
  fullCitation?: string;
  changeHistory?: string;
}

const ROOT_ATTRIBUTES = ['builddate'];
const DIVISION_ATTRIBUTES = ['gliederungsid', 'version', 'inkraft'];
const PROVISION_ATTRIBUTES = ['einzelnormid', 'version', 'inkraft'];
const QUOTED_ATTRIBUTES = ['hochkomma'];
const ANNEX_ATTRIBUTES = ['annexid', 'version', 'inkraft'];

/**
 * Gliederungsnummer der Verwaltungsvorschriften, wie die Quelle sie **vor** den Titel setzt:
 * `237-B`, `2038.3.13-B`, `2230.1.1.1-WK`, `3033.3-J`, `103-S`. Ziffern, punktgetrennt, dann ein
 * Ressortkürzel aus ein bis drei Großbuchstaben.
 *
 * Sie erscheint mal auf einer eigenen Zeile, mal dem Titel vorangestellt. Beides ist keine
 * Titelangabe: Bliebe sie stehen, hieße eine Aktenordnung „3033.3-J“.
 */
const DIVISION_NUMBER = /^\d+(?:\.\d+)*-[A-ZÄÖÜ]{1,3}$/u;
const DIVISION_NUMBER_PREFIX = /^(\d+(?:\.\d+)*-[A-ZÄÖÜ]{1,3})\s+(?=\S)/u;

/** Zeilen, die nie Teil des Titels sind: Abkürzung „(BestG)“, Datum „Vom 20. April 1999“. */
export const TITLE_STOP_LINE = /^(?:\(|[Vv]om\s+\d)/u;
/** Wörter, nach denen ein Titel nicht enden kann. */
const TITLE_OPEN_ENDINGS = new Set(['den', 'der', 'die', 'das', 'des', 'dem', 'über', 'zu', 'zur', 'zum', 'für', 'von', 'und', 'zwischen', 'mit', 'betreffend', 'nach', 'bei']);
/** Gattungswörter, die allein nie ein ganzer Titel sind: „Staatsvertrag ⏎ zwischen …“, „Stiftungsurkunde ⏎ Seiner Majestät …“. */
const TITLE_HEADS = new Set(['Staatsvertrag', 'Vertrag', 'Abkommen', 'Konkordat', 'Stiftungsurkunde', 'Urkunde', 'Vereinbarung', 'Verwaltungsabkommen', 'Übereinkommen', 'Protokoll']);

/**
 * Setzt einen über mehrere `<br/>`-Zeilen laufenden Titel zusammen – nur, wo der Satz erkennbar weiterläuft:
 * die Zeile endet mit Komma oder einem Wort, nach dem kein Titel endet, die Folgezeile beginnt klein, oder die
 * Zeile ist ein bloßes Gattungswort. Abkürzungs- und Datumszeilen beenden den Titel immer. Höchstens fünf Zeilen.
 */
export function continuedTitle(lines: readonly string[]): { title: string; lines: number } {
  let title = lines[0]!;
  let used = 1;
  while (used < lines.length && used < 5) {
    const next = lines[used]!;
    if (TITLE_STOP_LINE.test(next)) break;
    const lastWord = title.split(/\s+/u).at(-1) ?? '';
    const opens = title.endsWith(',') || TITLE_OPEN_ENDINGS.has(lastWord) || /^\p{Ll}/u.test(next) || (used === 1 && TITLE_HEADS.has(title));
    if (!opens) break;
    title = `${title} ${next}`;
    used += 1;
  }
  return { title, lines: used };
}

/** Entfernt Fußnotenzeichen am Titelende („Biersteuer1)“, „Reichsversicherungsordnung1)2)“); die Fußnote bleibt im Körper. */
export function stripTrailingMarkers(title: string, footnotes: readonly NormBodyBlock[]): string {
  const labels = footnotes.map((footnote) => footnote.label).filter((label): label is string => Boolean(label) && !/^Fn \d+$/u.test(label!));
  let result = title;
  for (let changed = true; changed;) {
    changed = false;
    for (const label of labels) {
      if (result.length > label.length && result.endsWith(label)) {
        result = result.slice(0, -label.length).trimEnd();
        changed = true;
      }
    }
  }
  return result;
}

/**
 * Trennt die vorangestellte Gliederungsnummer vom Titel.
 *
 * Gibt die bereinigten Zeilen und die gefundene Nummer zurück. Die Nummer wird nicht verworfen: Wo
 * `gliederungsNr.BayRS` leer ist, ist sie der einzige Beleg der Gliederungsstelle im Dokument.
 */
export function splitDivisionNumber(lines: readonly string[]): { lines: string[]; divisionNumber?: string } {
  const rest = [...lines];
  let divisionNumber: string | undefined;
  while (rest.length > 1 && DIVISION_NUMBER.test(rest[0]!)) {
    divisionNumber ??= rest[0]!;
    rest.shift();
  }
  const prefix = rest[0] ? DIVISION_NUMBER_PREFIX.exec(rest[0]) : null;
  if (prefix) {
    divisionNumber ??= prefix[1]!;
    rest[0] = rest[0]!.slice(prefix[0].length);
  }
  return divisionNumber === undefined ? { lines: rest } : { lines: rest, divisionNumber };
}

/** Normtypen des Portals (`dokumentation/@doktyp`). Alles andere bricht ab. */
const DOCUMENT_TYPES: Readonly<Record<string, NormType>> = {
  gesetz: 'gesetz',
  verordnung: 'verordnung',
  vv: 'verwaltungsvorschrift',
  /** Verwaltungsvorschriften kommen auch in der Norm-DTD vor (belegt an VVBayHO). */
  vwv: 'verwaltungsvorschrift',
  vertrag: 'staatsvertrag',
  /**
   * Tarifverträge führt das Portal im Landesrechtsbestand mit (belegt an TV_L). Das Zielmodell kennt
   * keinen eigenen Typ dafür; `verwaltungsabkommen` ist der nächstliegende Vertragstyp. Ob
   * Tarifverträge fachlich in den Bestand gehören, entscheidet das Review nach docs/LEGAL_SCOPE.md –
   * der Parser liest sie, er wählt nicht aus.
   */
  tarifvertrag: 'verwaltungsabkommen',
  // `vertr` ist der Facettenfilterwert des Portals; als @doktyp bisher nicht belegt, aber naheliegend.
  vertr: 'staatsvertrag',
  satzung: 'satzung',
  /**
   * „Sonstige Norm“ – belegt an der Bodensee-Schifffahrts-Ordnung (BayBodSchO). Das Portal führt
   * darunter Vorschriften, die keine eigene Gliederungsstelle der Bayerischen Rechtssammlung haben,
   * weil sie in Bayern als **Anhang einer anderen Vorschrift** in Kraft gesetzt sind (dort: als
   * Anhang zur EV-BodenseeSchO, dreistaatlich einheitlich erlassen). `gliederungsNr.BayRS` ist bei
   * ihnen leer.
   *
   * Als Verordnung geführt, weil das die Rechtsform der Inkraftsetzung ist – aber immer mit Befund:
   * Ob ein solcher Anhang als eigene Norm geführt oder der Stammnorm zugeschlagen wird, ist eine
   * redaktionelle Entscheidung nach docs/LEGAL_SCOPE.md, keine des Parsers.
   */
  normsonst: 'verordnung',
  /**
   * Bekanntmachung – belegt an zehn Dokumenten des Bestands, von der Wappen- und Flaggen-
   * Bekanntmachung über das Begnadigungsrecht bis zur Biersteuer-Bekanntmachung von 1924.
   *
   * Das Zielmodell führt `bekanntmachung` als eigenen Typ. Ob eine Bekanntmachung in den
   * Landesrechtsbestand gehört, ist damit **nicht** entschieden: `docs/LEGAL_SCOPE.md` nimmt sie nur
   * auf, wenn sie Regelungsgehalt trägt. Deshalb steht sie zugleich in `TYPES_REQUIRING_REVIEW` –
   * der Parser liest sie, die Normativität entscheidet das Review.
   */
  bekanntmachung: 'bekanntmachung',
};

/** Gliederungswörter → Blocktyp. Reihenfolge ist die Rangfolge im bayerischen Sprachgebrauch. */
const DIVISION_WORDS: Readonly<Record<string, NormBodyBlock['type']>> = {
  Buch: 'book',
  Hauptteil: 'part',
  Teil: 'part',
  Kapitel: 'chapter',
  Abteilung: 'section',
  Abschnitt: 'section',
  Unterabschnitt: 'subsection',
  Untertitel: 'subsection',
  Titel: 'subsection',
};

/**
 * Normtypen, die das Zielmodell nicht als eigenen Typ führt. Der Parser liest sie – ob sie fachlich
 * in den Landesrechtsbestand gehören, entscheidet das Review nach docs/LEGAL_SCOPE.md.
 */
const TYPES_REQUIRING_REVIEW: Readonly<Record<string, string>> = {
  tarifvertrag: 'Tarifverträge sind keine Rechtsnormen des Landes; das Zielmodell kennt keinen eigenen Typ. Geführt als „verwaltungsabkommen“ – die Aufnahme in den Bestand ist eine Entscheidung nach docs/LEGAL_SCOPE.md.',
  normsonst:
    'Sonstige Norm ohne eigene Gliederungsstelle der Bayerischen Rechtssammlung; in Bayern regelmäßig als Anhang einer anderen Vorschrift in Kraft gesetzt. Geführt als „verordnung“ – ob eigene Norm oder Teil der Stammnorm, entscheidet das Review nach docs/LEGAL_SCOPE.md.',
  bekanntmachung:
    'Bekanntmachung: nach docs/LEGAL_SCOPE.md nur aufzunehmen, wenn sie Regelungsgehalt trägt. Der Parser liest sie; über die Normativität entscheidet das Review.',
};

const DIVISION_WORD_PATTERN = /\b(Buch|Hauptteil|Teil|Kapitel|Abteilung|Unterabschnitt|Abschnitt|Untertitel|Titel)\b/u;
const DIVISION_BY_DEPTH: readonly NormBodyBlock['type'][] = ['part', 'section', 'subsection', 'subsection', 'subsection'];

function fail(message: string): never {
  throw new ImportPipelineError('parse-source-format', message);
}

/** Kommt das Element irgendwo im Teilbaum vor? (Für die Unterscheidung „leer“ gegen „nur Abbildung“.) */
function containsElement(node: XmlElement, name: string): boolean {
  for (const child of elementChildren(node)) {
    if (child.name === name || containsElement(child, name)) return true;
  }
  return false;
}

function optionalText(element: XmlElement | undefined): string | undefined {
  if (!element) return undefined;
  const value = collapseWhitespace(rawText(element));
  return value === '' ? undefined : value;
}

/**
 * Fundstelle einer Ausfertigung oder Fassung. Neben `fundstelle.GVBl` kommt `sonstigeFundstelle` mit
 * eigenem Verkündungsorgan vor (belegt an VVBayHO: `<publikation>FMBl.</publikation>`). Ist die
 * GVBl.-Fundstelle leer und eine sonstige vorhanden, gilt die sonstige.
 */
function gazetteReference(parent: XmlElement | undefined, ctx: ParseContext, where: string): GazetteReference {
  if (!parent) return {};
  const readEntry = (reference: XmlElement, known: readonly string[]): GazetteReference => {
    checkAttributes(ctx, reference, [], where);
    for (const child of elementChildren(reference)) {
      if (!known.includes(child.name)) reportUnknownElement(ctx, child, `${where} → <${reference.name}>`);
    }
    const page = normalizeGazetteNumber(optionalText(childElement(reference, 'seite')), ctx, `${where} → <seite>`);
    return {
      year: optionalText(childElement(reference, 'jahr')),
      page: page.value,
      pageKind: page.kind,
      publication: optionalText(childElement(reference, 'publikation')),
    };
  };

  const gazette = childElement(parent, 'fundstelle.GVBl');
  const primary = gazette ? readEntry(gazette, ['jahr', 'seite']) : {};
  const other = childElement(parent, 'sonstigeFundstelle');
  if (!other) return primary;
  const secondary = readEntry(other, ['jahr', 'seite', 'publikation']);
  if (primary.year === undefined && primary.page === undefined) return secondary;
  addFinding(ctx, 'info', 'gazette-reference-ambiguous',
    `${where}: neben <fundstelle.GVBl> steht eine <sonstigeFundstelle> (${[secondary.publication, secondary.year, secondary.page].filter(Boolean).join(' ')}); die GVBl.-Fundstelle hat Vorrang`);
  return primary;
}

function isoDate(element: XmlElement | undefined, ctx: ParseContext, where: string): string | undefined {
  const value = optionalText(element);
  if (value === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    addFinding(ctx, 'warning', 'date-format', `Datum ${JSON.stringify(value)} in ${where} ist kein ISO-Datum und wird nicht übernommen`);
    return undefined;
  }
  return value;
}

/* ------------------------------------------------------------------ Kopf */

export function parseNormHead(kopf: XmlElement, ctx: ParseContext): NormHead {
  checkAttributes(ctx, kopf, [], 'kopf');
  const independent = childElement(kopf, 'angaben.versunabh');
  const dependent = childElement(kopf, 'angaben.versabh');
  for (const child of elementChildren(kopf)) {
    if (child.name !== 'angaben.versunabh' && child.name !== 'angaben.versabh') reportUnknownElement(ctx, child, '<kopf>');
  }
  if (!independent) fail('Der Kopf enthält kein <angaben.versunabh>');
  if (!dependent) fail('Der Kopf enthält kein <angaben.versabh>');
  checkAttributes(ctx, independent, [], '<angaben.versunabh>');
  checkAttributes(ctx, dependent, ['version.id'], '<angaben.versabh>');

  for (const child of elementChildren(independent)) {
    if (child.name !== 'dokumentation' && child.name !== 'ausfertigung') reportUnknownElement(ctx, child, '<angaben.versunabh>');
  }
  const known = new Set(['inkraft', 'fassung', 'gliederungsNr.BayRS', 'kurzbezeichnung', 'titelangaben', 'amtlicheAbk', 'ausserkraft']);
  for (const child of elementChildren(dependent)) {
    if (!known.has(child.name)) reportUnknownElement(ctx, child, '<angaben.versabh>');
  }

  const documentation = childElement(independent, 'dokumentation');
  if (!documentation) fail('<angaben.versunabh> enthält kein <dokumentation> und damit keine Dokument-ID');
  checkAttributes(ctx, documentation, ['doktyp', 'dokid', 'ersatz'], '<dokumentation>');
  const documentId = attribute(documentation, 'dokid');
  const documentType = attribute(documentation, 'doktyp');
  if (!documentId) fail('<dokumentation> trägt kein @dokid; ohne Dokument-ID wird keine Identität erfunden');
  if (!documentType) fail(`<dokumentation> von ${documentId} trägt kein @doktyp`);

  const titleElement = childElement(dependent, 'titelangaben');
  const titleContent = titleElement ? headingContent(titleElement, ctx, '<titelangaben>') : { lines: [] as string[], footnotes: [] as NormBodyBlock[] };
  const rawTitleLines = titleContent.lines;
  // Die Quelle stellt Verwaltungsvorschriften ihre Gliederungsnummer voran – teils auf eigener
  // Zeile, teils als Präfix. Sie ist kein Titel.
  const { lines: titleLines, divisionNumber } = splitDivisionNumber(rawTitleLines);
  const shortTitle = optionalText(childElement(dependent, 'kurzbezeichnung'));
  const abbr = optionalText(childElement(dependent, 'amtlicheAbk'));
  // `titelangaben` setzt den Titel mit `<br/>` um. Zeile 1 ist der Titel – außer der Satz läuft erkennbar
  // weiter (continuedTitle): „Verordnung, ⏎ Ausführungsvorschriften …“, „Staatsvertrag ⏎ zwischen dem Land …“.
  // Abkürzungs- und Datumszeilen werden nie angefügt. Fußnotenzeichen am Titelende gehören zur Fußnote.
  const continued = titleLines.length > 0 ? continuedTitle(titleLines) : undefined;
  const title = continued ? stripTrailingMarkers(continued.title, titleContent.footnotes) : shortTitle;
  if (!title) fail(`${documentId}: weder <titelangaben> noch <kurzbezeichnung> nennen einen Titel`);
  if (continued && continued.lines > 1) {
    addFinding(ctx, 'info', 'title-continued',
      `${documentId}: Der Titel läuft über ${continued.lines} Zeilen von <titelangaben> und wird zusammengesetzt: „${title}“`);
  } else if (titleLines.length > 1 && title.split(/\s+/u).length <= 3 && !TITLE_STOP_LINE.test(titleLines[1]!)) {
    addFinding(ctx, 'warning', 'title-possibly-truncated',
      `${documentId}: <titelangaben> beginnt mit der kurzen Zeile „${title}“ und läuft weiter („${titleLines[1]!.slice(0, 60)}…“); der Titel könnte über mehrere Zeilen gesetzt sein`);
  }

  if (divisionNumber) {
    addFinding(ctx, 'info', 'division-number-before-title',
      `${documentId}: <titelangaben> stellt die Gliederungsnummer „${divisionNumber}“ vor den Titel; sie wird als Gliederungsnummer geführt, nicht als Titelbestandteil`);
  }

  let normType = DOCUMENT_TYPES[documentType];
  if (!normType) fail(`${documentId}: unbekannter Normtyp @doktyp="${documentType}"`);
  // Die Verfassung wird im Portal als `doktyp="gesetz"` geführt; das Zielmodell kennt `verfassung`.
  if (normType === 'gesetz' && /^Verfassung\b/u.test(title)) {
    normType = 'verfassung';
    addFinding(ctx, 'info', 'norm-type-refined', `${documentId}: @doktyp="gesetz" mit Titel „${title}“ wird als Normtyp „verfassung“ geführt`);
  }
  const review = TYPES_REQUIRING_REVIEW[documentType];
  if (review) {
    addFinding(ctx, 'warning', 'norm-type-out-of-model', `${documentId}: @doktyp="${documentType}". ${review}`);
  }
  // Zwei Verwaltungsabkommen mit Baden-Württemberg führt das Portal als `bekanntmachung`; der Titel
  // sagt, was sie sind. Die Verfeinerung gilt deshalb für beide Ausgangstypen.
  if (normType === 'bekanntmachung' && /^Verwaltungsabkommen\b/u.test(title)) {
    normType = 'verwaltungsabkommen';
    addFinding(ctx, 'info', 'norm-type-refined', `${documentId}: @doktyp="${documentType}" mit Titel „${title}“ wird als Normtyp „verwaltungsabkommen“ geführt`);
  }
  // `doktyp="vertrag"` fasst Staatsverträge und Verwaltungsabkommen zusammen; der Titel trennt sie.
  if (normType === 'staatsvertrag' && /^Verwaltungsabkommen\b/u.test(title)) {
    normType = 'verwaltungsabkommen';
    addFinding(ctx, 'info', 'norm-type-refined', `${documentId}: @doktyp="${documentType}" mit Titel „${title}“ wird als Normtyp „verwaltungsabkommen“ geführt`);
  } else if (normType === 'staatsvertrag' && !/^Staatsvertrag\b/u.test(title)) {
    addFinding(ctx, 'info', 'norm-type-assumed', `${documentId}: @doktyp="${documentType}" umfasst Verträge und sonstige Rechtsquellen; der Titel „${title}“ nennt keine Vertragsart – geführt als „staatsvertrag“`);
  }

  const ausfertigung = childElement(independent, 'ausfertigung');
  if (ausfertigung) {
    checkAttributes(ctx, ausfertigung, [], '<ausfertigung>');
    for (const child of elementChildren(ausfertigung)) {
      if (!['ausfertigungsdatum', 'fundstelle.GVBl', 'sonstigeFundstelle'].includes(child.name)) reportUnknownElement(ctx, child, '<ausfertigung>');
    }
  }
  const fassung = childElement(dependent, 'fassung');
  if (fassung) {
    checkAttributes(ctx, fassung, [], '<fassung>');
    for (const child of elementChildren(fassung)) {
      if (!['fassungsdatum', 'fundstelle.GVBl', 'sonstigeFundstelle'].includes(child.name)) reportUnknownElement(ctx, child, '<fassung>');
    }
  }

  const bayRsRaw = optionalText(childElement(dependent, 'gliederungsNr.BayRS'));
  return {
    documentId,
    documentType,
    titleFootnotes: titleContent.footnotes,
    normType,
    title,
    titleLines,
    titleLineCount: continued?.lines ?? (titleLines.length > 0 ? 1 : 0),
    shortTitle,
    abbr,
    bayRsNumber: bayRsRaw ? bayRsRaw.replace(/^BayRS\s+/u, '').trim() : undefined,
    documentDate: isoDate(ausfertigung ? childElement(ausfertigung, 'ausfertigungsdatum') : undefined, ctx, '<ausfertigung>'),
    versionDate: isoDate(fassung ? childElement(fassung, 'fassungsdatum') : undefined, ctx, '<fassung>'),
    inForceFrom: isoDate(childElement(dependent, 'inkraft'), ctx, '<inkraft>'),
    issueReference: gazetteReference(ausfertigung, ctx, '<ausfertigung>'),
    versionReference: gazetteReference(fassung, ctx, '<fassung>'),
    versionKey: attribute(dependent, 'version.id'),
  };
}

/* ------------------------------------------------------------------ Rumpf */

interface BodyState {
  documentId: string;
  addresses: PortalAddress[];
  /** Knoten ohne belegte Portal-ID (Inhalt von Anlagen). */
  unresolved: UnresolvedAddress[];
  /** Laufende Nummer der nummernlosen Vorschriften (`-NN<i>`). */
  unnumbered: number;
  annexes: number;
  /**
   * Schachtelungstiefe innerhalb einer Anlage. Für Anlagen ist nur `<Kurz>-ANL_<i>` belegt; wie das
   * Portal Vorschriften **innerhalb** einer Anlage adressiert, ist unbekannt. Dort wird deshalb kein
   * Permalink gebildet, sondern nur der Positionspfad geführt.
   */
  insideAnnex: number;
  /**
   * Schachtelungstiefe innerhalb eines `<Aenderungsinhalt>`. Der dort eingebettete Text ist **Zitat**
   * (der neue Wortlaut, den ein Änderungsbefehl anordnet), nicht geltender Text der zitierenden
   * Vorschrift. Zitierte Vorschriften bekommen weder eine Adresse noch eine NN-Nummer.
   */
  quoted: number;
}

/**
 * `<gliederung.titel>` trägt Gliederungszeichen und Überschrift in **einer** Zeile je Teil:
 *
 *   „1. Teil ⏎ Allgemeine Vorschriften“   →  label „1. Teil“,        title „Allgemeine Vorschriften“
 *   „Erster Hauptteil ⏎ Aufbau …“         →  label „Erster Hauptteil“, title „Aufbau …“
 *   „Inhaltsübersicht“                    →  nur title
 *
 * Aufgeteilt wird nur, wenn die erste Zeile ein bekanntes Gliederungswort nennt. Sonst bleibt der
 * ganze Text Überschrift – eine über mehrere Quellzeilen umbrochene Überschrift wird nicht zerrissen.
 */
function divisionHeading(lines: readonly string[], depth: number, ctx: ParseContext, where: string, number?: string): { type: NormBodyBlock['type']; label?: string; title?: string } {
  const byDepth = DIVISION_BY_DEPTH[Math.min(depth, DIVISION_BY_DEPTH.length) - 1] ?? 'subsection';
  // `<gliederung.nr>` trägt das Gliederungszeichen ausdrücklich (belegt an BayBhV: „I.“); dann wird
  // die Überschrift nicht mehr an der Quellzeile getrennt.
  if (number) {
    const word = DIVISION_WORD_PATTERN.exec(number)?.[1];
    return { type: word ? DIVISION_WORDS[word] ?? byDepth : byDepth, label: number, title: lines.length > 0 ? lines.join(' ') : undefined };
  }
  if (lines.length === 0) return { type: byDepth };
  const first = lines[0]!;
  const word = DIVISION_WORD_PATTERN.exec(first)?.[1];
  if (!word) {
    addFinding(ctx, 'info', 'division-word-unmapped',
      `Gliederungsüberschrift ${JSON.stringify(lines.join(' '))} in ${where} nennt kein bekanntes Gliederungswort; Ebene ${depth} wird als „${byDepth}“ geführt`);
    return { type: byDepth, title: lines.join(' ') };
  }
  const type = DIVISION_WORDS[word] ?? byDepth;
  return lines.length > 1 ? { type, label: first, title: lines.slice(1).join(' ') } : { type, label: first };
}

/**
 * `<Aenderungsinhalt>` → `quotedProvision`.
 *
 * Der eingebettete Baum ist der **neue Wortlaut**, den ein Änderungsbefehl anordnet – also ein Zitat
 * innerhalb der zitierenden Vorschrift, nicht deren eigener Text (belegt an BayRadG, TV_L, VVBayHO).
 * Würde er wie gewöhnlicher Normkörper behandelt, erschiene fremder Text als eigener: Der zitierte
 * `Art. 1` einer anderen Norm würde zu einem Artikel *dieser* Norm, samt Permalink. Deshalb ein
 * eigener Blocktyp, keine Adresse und keine NN-Zählung für alles darin. `@hochkomma` nennt das
 * verwendete Anführungszeichen und ist reine Typografie.
 */
function quotedProvisionBlocks(element: XmlElement, ctx: ParseContext, state: BodyState, where: string, blockPath: number[]): NormBodyBlock[] {
  checkAttributes(ctx, element, QUOTED_ATTRIBUTES, where);
  ctx.counters.quotedProvisions += 1;
  state.quoted += 1;
  const children: NormBodyBlock[] = [];
  try {
    for (const child of elementChildren(element)) {
      switch (child.name) {
        case 'einzelnorm':
          children.push(provisionBlock(child, ctx, state, [...blockPath, children.length]));
          break;
        case 'gliederung':
          children.push(divisionBlock(child, ctx, state, [children.length + 1], [...blockPath, children.length]));
          break;
        case 'p':
        case 'ul':
        case 'table':
          children.push(...flowBlocks([child], ctx, `${where} → <Aenderungsinhalt>`));
          break;
        default:
          children.push(...recoverUnknown(child, ctx, `${where} → <Aenderungsinhalt>`));
      }
    }
  } finally {
    state.quoted -= 1;
  }
  if (children.length === 0) {
    addFinding(ctx, 'warning', 'quoted-provision-empty', `${where}: <Aenderungsinhalt> ohne Inhalt; der zitierte Wortlaut fehlt`);
    return [];
  }
  return [{ type: 'quotedProvision', children }];
}

function subparagraphBlocks(jurAbsatz: XmlElement, ctx: ParseContext, state: BodyState, where: string, blockPath: number[]): NormBodyBlock[] {
  checkAttributes(ctx, jurAbsatz, ['id', 'version'], where);
  const numberElement = childElement(jurAbsatz, 'absatz.nr');
  const textElement = childElement(jurAbsatz, 'absatz.text');
  for (const child of elementChildren(jurAbsatz)) {
    if (child.name !== 'absatz.nr' && child.name !== 'absatz.text') reportUnknownElement(ctx, child, `${where} → <jurAbsatz>`);
  }
  // Fußnoten an der Absatznummer tragen oft Vermerke von Gewicht (BayIntG Art. 12 Abs. 3: Nichtigkeit laut
  // BayVerfGH); sie gehören wie bei `para.nr` an den Absatz, statt mit dem Kennzeichen zu verschwinden.
  const number = numberElement ? inlineContent(numberElement, ctx, `${where} → <absatz.nr>`) : { text: '', footnotes: [] as NormBodyBlock[] };
  const label = collapseWhitespace(number.text);
  const content = textElement ? absatzBlocks(textElement, ctx, state, where, blockPath) : [];

  // Absatz ohne Kennzeichen: der Inhalt gehört unmittelbar zur Vorschrift; ein leeres
  // Gliederungszeichen wird nicht erfunden.
  if (label === '') return [...number.footnotes, ...content];

  const block: NormBodyBlock = { type: 'subparagraph', label };
  const first = content[0];
  if (first && first.type === 'paragraphText' && first.children === undefined) {
    block.text = first.text;
    if (content.length > 1) block.children = content.slice(1);
  } else if (content.length > 0) {
    block.children = content;
  }
  if (number.footnotes.length > 0) block.children = [...number.footnotes, ...(block.children ?? [])];
  return [block];
}

/** Inhalt eines `<absatz.text>`: gewöhnlicher Fließtext, dazwischen ggf. zitierter Normtext. */
function absatzBlocks(textElement: XmlElement, ctx: ParseContext, state: BodyState, where: string, blockPath: number[]): NormBodyBlock[] {
  const blocks: NormBodyBlock[] = [];
  let run: XmlNode[] = [];
  const flushRun = (): void => {
    if (run.length === 0) return;
    blocks.push(...flowBlocks(run, ctx, `${where} → <absatz.text>`));
    run = [];
  };
  for (const node of textElement.children) {
    if (node.kind === 'element' && node.name === 'Aenderungsinhalt') {
      flushRun();
      blocks.push(...quotedProvisionBlocks(node, ctx, state, where, [...blockPath, blocks.length]));
      continue;
    }
    run.push(node);
  }
  flushRun();
  return blocks;
}

function provisionBlock(element: XmlElement, ctx: ParseContext, state: BodyState, blockPath: number[]): NormBodyBlock {
  checkAttributes(ctx, element, PROVISION_ATTRIBUTES, '<einzelnorm>');
  const numberElement = childElement(element, 'para.nr');
  const titleElement = childElement(element, 'para.titel');
  const where = `<einzelnorm ${attribute(element, 'einzelnormid') ?? '?'}>`;

  const number = numberElement ? inlineContent(numberElement, ctx, `${where} → <para.nr>`) : { text: '', footnotes: [] as NormBodyBlock[] };
  const heading = titleElement ? inlineContent(titleElement, ctx, `${where} → <para.titel>`) : { text: '', footnotes: [] as NormBodyBlock[] };
  const label = collapseWhitespace(number.text);
  const title = collapseWhitespace(heading.text);

  const children: NormBodyBlock[] = [...number.footnotes, ...heading.footnotes];
  for (const child of elementChildren(element)) {
    switch (child.name) {
      case 'para.nr':
      case 'para.titel':
        break;
      case 'jurAbsatz':
        children.push(...subparagraphBlocks(child, ctx, state, where, [...blockPath, children.length]));
        break;
      case 'table':
        // Tabelle unmittelbar in der Vorschrift, ohne umschließenden Absatz (belegt an BayBSOF). Sie
        // ist **struktureller** Normtext; der gemeinsame Fließtextleser baut sie wie jede andere
        // Tabelle – mit Spaltenraster und Auffüllen kurzer Zeilen.
        children.push(...flowBlocks([child], ctx, where));
        break;
      default:
        children.push(...recoverUnknown(child, ctx, where));
    }
  }

  const type: NormBodyBlock['type'] = label === ''
    ? 'preamble'
    : /^(?:Art\.?|Artikel)\b/u.test(label) ? 'article' : 'paragraph';
  const block: NormBodyBlock = { type };
  if (label !== '') block.label = label;
  if (title !== '') block.title = title;
  block.children = children;

  if (children.length === 0) {
    // Belegte Platzhaltertexte: „(aufgehoben)“ (BayVerf), „(weggefallen)“, „(nicht mehr belegt)“ (BayVSO).
    const repealed = /\((?:aufgehoben|weggefallen|nicht mehr belegt|entfällt|gestrichen)\)/u.test(title);
    // Eine Vorschrift, die nur eine Abbildung trägt, ist nicht leer – ihr Inhalt liegt als Beilage
    // im Paket und wird nur nicht in den Normkörper übernommen (belegt an BayBoFiV, Anhang II).
    const graphicOnly = !repealed && containsElement(element, 'graphic');
    addFinding(ctx, repealed || graphicOnly ? 'info' : 'warning',
      repealed ? 'repealed-provision' : graphicOnly ? 'provision-graphic-only' : 'empty-provision',
      repealed
        ? `${label || title || where} ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten`
        : graphicOnly
          ? `${label || title || where} enthält nur eine Abbildung; sie liegt als Beilage im Exportpaket und wird nicht in den Normkörper übernommen`
          : `${label || title || where} hat keinen Textinhalt`);
  }

  // Zitierter Normtext ist nicht Text dieser Norm: keine Adresse, keine NN-Zählung.
  if (state.quoted > 0) return block;
  if (state.insideAnnex > 0) {
    state.unresolved.push({
      kind: 'provision',
      label: label || undefined,
      title: title || undefined,
      position: [...blockPath],
      blockPath: [...blockPath],
      reason: 'Das Portal adressiert Anlagen nur als Ganzes (`-ANL_<i>`); wie es Vorschriften innerhalb einer Anlage adressiert, ist nicht belegt.',
    });
    return block;
  }

  const suffix = label === '' ? undefined : provisionSuffix(label);
  let documentId: string;
  if (suffix) {
    documentId = `${state.documentId}-${suffix}`;
  } else {
    state.unnumbered += 1;
    documentId = `${state.documentId}-NN${state.unnumbered}`;
  }
  state.addresses.push({
    documentId,
    kind: 'provision',
    label: label || undefined,
    title: title || undefined,
    position: [...blockPath],
    blockPath: [...blockPath],
    url: documentUrl(documentId),
    xmlId: attribute(element, 'einzelnormid'),
  });
  return block;
}

function annexBlock(element: XmlElement, ctx: ParseContext, state: BodyState, blockPath: number[]): NormBodyBlock {
  checkAttributes(ctx, element, ANNEX_ATTRIBUTES, '<annex>');
  state.annexes += 1;
  const position = state.annexes;
  const where = `<annex ${attribute(element, 'annexid') ?? position}>`;

  const bodies = childElements(element, 'annex.koerper');
  for (const child of elementChildren(element)) {
    if (child.name !== 'annex.koerper') reportUnknownElement(ctx, child, where);
  }
  if (bodies.length === 0) fail(`${where}: <annex.koerper> fehlt`);

  const children: NormBodyBlock[] = [];
  let label: string | undefined;
  let title: string | undefined;
  state.insideAnnex += 1;
  try {
  for (const body of bodies) {
    checkAttributes(ctx, body, ['version', 'inkraft'], where);
    // `annex.nummer` erscheint doppelt – einmal ohne, einmal mit `@int`. Die Variante mit `@int` ist
    // die maschinell brauchbare; ihr Text ist der Anzeigename, der Attributwert die Ordnungszahl.
    const numbers = childElements(body, 'annex.nummer');
    const preferred = numbers.find((entry) => attribute(entry, 'int') !== undefined);
    for (const entry of numbers) checkAttributes(ctx, entry, ['int'], where);
    // `@int` ist über den ganzen Beispielkorpus **immer** `1` – es ist ein Kennzeichen der
    // maschinell brauchbaren Kurzform, keine Ordnungszahl. Ein anderer Wert wäre unverstanden.
    const flag = preferred ? attribute(preferred, 'int') : undefined;
    if (flag !== undefined && flag !== '1') {
      addFinding(ctx, 'warning', 'annex-number-flag-unknown', `${where}: annex.nummer@int="${flag}"; belegt ist nur der Wert 1 (Kennzeichen der Kurzform)`);
    }
    // Nur ein ausdrückliches Kennzeichen wird Label. Ohne `annex.nummer` trägt die Anlage ihren Titel (BayGLKrWO:
    // „Anlagenverzeichnis zur GLKrWO“); der ganze Anlagenkörper als Label verdoppelte den Text.
    const chosen = preferred ?? numbers[0];
    if (chosen) label = collapseWhitespace(rawText(chosen)) || label;
    if (!preferred && numbers.length > 0) {
      addFinding(ctx, 'warning', 'annex-number-flag-missing', `${where}: keine <annex.nummer> mit @int; ersatzweise gilt die erste Schreibweise „${label ?? ''}“`);
    }
    // Die Langform („Anlage 1 (zu § 7 Abs. 1)“) trägt den Bezug in die Norm hinein und darf nicht
    // verloren gehen; sie steht als eigene Überschriftszeile am Anfang der Anlage.
    const long = numbers.map((entry) => collapseWhitespace(rawText(entry))).find((entry) => entry !== '' && entry !== label);
    if (long) children.push({ type: 'heading', text: long });
    title = optionalText(childElement(body, 'annex.titel')) ?? title;

    let divisionIndex = 0;
    for (const child of elementChildren(body)) {
      switch (child.name) {
        case 'annex.nummer':
        case 'annex.titel':
          break;
        case 'annex.text':
          // Fließtext, Tabellen und Listen unmittelbar in der Anlage (belegt an BayBhV, BayGUW_GebO,
          // BAY_791_3_150_U, MStV, BayVSO).
          checkAttributes(ctx, child, [], where);
          children.push(...flowBlocks(child.children, ctx, `${where} → <annex.text>`));
          break;
        case 'annex.einleitungssatz':
          // Einleitungssatz einer Anlage (belegt an BayIsraelKultVertrag, BaySalKonvVertr) – das
          // Gegenstück zum Einleitungssatz des Rumpfs und wie dieser **Normtext**. Er steht vor dem
          // übrigen Inhalt der Anlage.
          checkAttributes(ctx, child, ['version'], where);
          children.push(...flowBlocks(child.children, ctx, `${where} → <annex.einleitungssatz>`));
          break;
        case 'einzelnorm':
          children.push(provisionBlock(child, ctx, state, [...blockPath, children.length]));
          break;
        case 'gliederung':
          // Anlagen können den vollen Gliederungsbaum wiederverwenden (belegt an BayBhV, TV_L).
          divisionIndex += 1;
          children.push(divisionBlock(child, ctx, state, [divisionIndex], [...blockPath, children.length]));
          break;
        case 'p':
        case 'ul':
        case 'table':
          children.push(...flowBlocks([child], ctx, where));
          break;
        default:
          children.push(...recoverUnknown(child, ctx, where));
      }
    }
  }

  } finally {
    state.insideAnnex -= 1;
  }

  if (!label && !title) {
    label = `Anlage ${position}`;
    addFinding(ctx, 'warning', 'annex-label-missing', `${where} trägt weder <annex.nummer> noch <annex.titel>; ersatzweise „${label}“`);
  }

  const documentId = `${state.documentId}-ANL_${position}`;
  state.addresses.push({
    documentId,
    kind: 'annex',
    label,
    title,
    position: [position],
    blockPath: [...blockPath],
    url: documentUrl(documentId),
    xmlId: attribute(element, 'annexid'),
  });

  const block: NormBodyBlock = { type: 'annex' };
  if (label) block.label = label;
  if (title) block.title = title;
  block.children = children;
  return block;
}

function divisionBlock(element: XmlElement, ctx: ParseContext, state: BodyState, position: number[], blockPath: number[]): NormBodyBlock {
  checkAttributes(ctx, element, DIVISION_ATTRIBUTES, '<gliederung>');
  const where = `<gliederung ${attribute(element, 'gliederungsid') ?? position.join('_')}>`;
  const titleElement = childElement(element, 'gliederung.titel');
  const numberElement = childElement(element, 'gliederung.nr');
  const heading = titleElement ? headingContent(titleElement, ctx, `${where} → <gliederung.titel>`) : { lines: [] as string[], footnotes: [] as NormBodyBlock[] };
  // Fußnoten am Gliederungszeichen (BayKonk: „Artikel 3“ mit dem Hinweis auf den Notenwechsel) gehören wie die
  // der Überschrift an den Abschnitt.
  const numbered = numberElement ? inlineContent(numberElement, ctx, `${where} → <gliederung.nr>`) : { text: '', footnotes: [] as NormBodyBlock[] };
  const number = collapseWhitespace(numbered.text);
  const { type, label, title } = divisionHeading(heading.lines, position.length, ctx, where, number || undefined);

  const children: NormBodyBlock[] = [...numbered.footnotes, ...heading.footnotes];
  let divisionIndex = 0;
  for (const child of elementChildren(element)) {
    switch (child.name) {
      case 'gliederung.titel':
      case 'gliederung.nr':
        break;
      case 'gliederung.text':
        checkAttributes(ctx, child, [], where);
        children.push(...flowBlocks(child.children, ctx, `${where} → <gliederung.text>`));
        break;
      case 'gliederung':
        divisionIndex += 1;
        children.push(divisionBlock(child, ctx, state, [...position, divisionIndex], [...blockPath, children.length]));
        break;
      case 'einzelnorm':
        children.push(provisionBlock(child, ctx, state, [...blockPath, children.length]));
        break;
      case 'annex':
        children.push(annexBlock(child, ctx, state, [...blockPath, children.length]));
        break;
      case 'p':
      case 'ul':
      case 'table':
        children.push(...flowBlocks([child], ctx, where));
        break;
      default:
        children.push(...recoverUnknown(child, ctx, where));
    }
  }

  if (state.quoted > 0) {
    // Zitierte Gliederung: kein Permalink, kein Eintrag – sie gehört einer anderen Norm.
  } else if (state.insideAnnex > 0) {
    state.unresolved.push({
      kind: 'division',
      label,
      title,
      position: [...position],
      blockPath: [...blockPath],
      reason: 'Das Portal adressiert Anlagen nur als Ganzes (`-ANL_<i>`); wie es Gliederungen innerhalb einer Anlage adressiert, ist nicht belegt.',
    });
  } else {
    const documentId = `${state.documentId}-G${position.join('_')}`;
    state.addresses.push({
      documentId,
      kind: 'division',
      label,
      title,
      position: [...position],
      blockPath: [...blockPath],
      url: documentUrl(documentId),
      xmlId: attribute(element, 'gliederungsid'),
    });
  }

  // `book`/`part`/… verlangen im Zielmodell eine Überschrift. Fehlt sie, wird keine erfunden: Der
  // Abschnitt bleibt als überschriftenloser Container erhalten und der Befund nennt ihn.
  const headless = !label && !title;
  if (headless) {
    addFinding(ctx, 'warning', 'division-without-heading', `${where} hat weder <gliederung.titel>-Text noch Gliederungszeichen und wird als überschriftenloser Abschnitt geführt`);
  }
  const block: NormBodyBlock = { type: headless ? 'preamble' : type };
  if (label) block.label = label;
  if (title) block.title = title;
  block.children = children;
  return block;
}

/** Liest das Wurzelelement `byrecht-norm`. */
export function parseNormDocument(root: XmlElement, ctx: ParseContext): NormDocument {
  if (root.name !== 'byrecht-norm') fail(`Erwartet <byrecht-norm>, gefunden <${root.name}>`);
  checkAttributes(ctx, root, ROOT_ATTRIBUTES, '<byrecht-norm>');
  const buildDate = attribute(root, 'builddate');

  const kopf = childElement(root, 'kopf');
  if (!kopf) fail('<byrecht-norm> enthält keinen <kopf>');
  const head = parseNormHead(kopf, ctx);

  const rumpf = childElement(root, 'rumpf');
  if (!rumpf) fail(`${head.documentId}: <byrecht-norm> enthält keinen <rumpf>`);
  checkAttributes(ctx, rumpf, [], '<rumpf>');

  const state: BodyState = { documentId: head.documentId, addresses: [], unresolved: [], unnumbered: 0, annexes: 0, insideAnnex: 0, quoted: 0 };
  // `<Aenderungsinhalt>` kommt nicht nur in `<absatz.text>` vor, sondern auch in Listenpunkten
  // (belegt an BayRadG). Der Haken macht ihn an jeder Fließtextstelle lesbar.
  ctx.quotedProvision = (element, context, where) => quotedProvisionBlocks(element, context, state, where, []);
  const body: NormBodyBlock[] = [];
  let fullCitation: string | undefined;
  let changeHistory: string | undefined;

  // Die Titelangaben jenseits der ersten Zeile (Kurzbezeichnung, Ausfertigungsdatum, Fundstelle,
  // BayRS-Nummer) sind Quelltext und bleiben im Körper stehen; die erste Zeile ist der Titel.
  if (head.titleLines.length > head.titleLineCount) body.push({ type: 'heading', text: head.titleLines.slice(Math.max(1, head.titleLineCount)).join('\n') });
  // Fußnoten des Titelblocks stehen hinter dem Titel, wie in der Quelle. Sie sind Quelltext und
  // gehen sonst verloren – bei Staatsverträgen ist das die vollständige Ratifikationsliste.
  body.push(...head.titleFootnotes);

  let divisionIndex = 0;
  for (const child of elementChildren(rumpf)) {
    switch (child.name) {
      case 'aenderungsverlauf': {
        checkAttributes(ctx, child, [], '<aenderungsverlauf>');
        const blocks = flowBlocks(child.children, ctx, '<aenderungsverlauf>');
        changeHistory = blocksToText(blocks);
        break;
      }
      case 'normzitat':
        checkAttributes(ctx, child, [], '<normzitat>');
        fullCitation = collapseWhitespace(inlineContent(child, ctx, '<normzitat>').text) || undefined;
        break;
      case 'einleitungssatz': {
        // Eingangsformel („Der Landtag … hat das folgende Gesetz beschlossen …“). Sie gehört zum
        // Normtext und steht vor der ersten Gliederung (belegt an BayAGGlueStV, BayBauPAV, VVBayHO).
        checkAttributes(ctx, child, ['version'], '<einleitungssatz>');
        for (const entry of elementChildren(child)) {
          if (entry.name !== 'einleitungssatz.text') {
            body.push(...recoverUnknown(entry, ctx, '<einleitungssatz>'));
            continue;
          }
          checkAttributes(ctx, entry, [], '<einleitungssatz.text>');
          body.push(...flowBlocks(entry.children, ctx, '<einleitungssatz.text>'));
        }
        break;
      }
      case 'gliederung':
        divisionIndex += 1;
        body.push(divisionBlock(child, ctx, state, [divisionIndex], [body.length]));
        break;
      case 'einzelnorm':
        body.push(provisionBlock(child, ctx, state, [body.length]));
        break;
      case 'annex':
        body.push(annexBlock(child, ctx, state, [body.length]));
        break;
      case 'p':
      case 'ul':
      case 'table':
        body.push(...flowBlocks([child], ctx, '<rumpf>'));
        break;
      default:
        body.push(...recoverUnknown(child, ctx, '<rumpf>'));
    }
  }

  for (const child of elementChildren(root)) {
    switch (child.name) {
      case 'kopf':
      case 'rumpf':
        break;
      case 'annex':
        body.push(annexBlock(child, ctx, state, [body.length]));
        break;
      default:
        body.push(...recoverUnknown(child, ctx, '<byrecht-norm>'));
    }
  }

  return { head, buildDate, body, addresses: state.addresses, unresolvedAddresses: state.unresolved, fullCitation, changeHistory };
}

/** Flache Textfassung einer Blockfolge (Änderungsverlauf; wandert nicht in den Normkörper). */
export function blocksToText(blocks: readonly NormBodyBlock[]): string | undefined {
  const lines: string[] = [];
  const walk = (block: NormBodyBlock): void => {
    const head = [block.label, block.title, block.text].filter((entry) => entry && entry !== '').join(' ');
    if (head) lines.push(head);
    for (const child of block.children ?? []) walk(child);
  };
  for (const block of blocks) walk(block);
  const text = lines.join('\n').trim();
  return text === '' ? undefined : text;
}
