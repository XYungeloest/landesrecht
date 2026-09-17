/**
 * Frontend für die DTD `byrecht-vv` (veröffentlichte Verwaltungsvorschriften).
 *
 * Eigenes Modell mit eigener Metadatenwelt; mit `byrecht-norm` teilt es nur den Fließtext- und
 * Tabellenvorrat:
 *
 *   byrecht-vv
 *     verwaltungsdaten[@doknr @worddokid]
 *     metadaten > bayernrecht > bayernrecht_langtitel · _kurztitel · _abkuerzung ·
 *                               _dokumentklasse[@wert] · _fundstellen(_organ[@wert], _jahrgang,
 *                               _seite) · _inkraft
 *     textdaten > vv1.0 > kopf(titel) + rumpf
 *       rumpf: p[@typ=titel|subtitel|vollzitat] · gliederung[@ebene @inkraft] (rekursiv)
 *       gliederung: gliederung.nr > p · gliederung.titel > p · p · ul · table · gliederung
 *
 * Unterschiede, die hier sitzen:
 *   - **kein `@builddate`** (die VV-DTD kennt ihn nicht),
 *   - **keine BayRS-Nummer als Element** – sie steht als erste Zeile im `<p typ="titel">` und wird
 *     nur übernommen, wenn sie das Muster einer Gliederungsnummer trifft,
 *   - **kein Ausfertigungsdatum als Feld** – es steht als Fließtext im Subtitel und im Vollzitat und
 *     wird **nicht** herausgeparst (kein Datum wird erfunden),
 *   - Absätze sind schlichte `<p>`, Satznummern stecken in `<sup>` (siehe `flow.ts`),
 *   - `gliederung` trägt ein optionales `@inkraft` – abschnittsweise Zeitinformation, die das
 *     Normmodell nicht kennt; sie wird als Metadatum geführt,
 *   - Anlagen gibt es nur als PDF im Paket, nicht als `<annex>`.
 */
import type { NormBodyBlock, NormType } from '@landesrecht/legal-core/lib/schema.ts';
import { ImportPipelineError } from '@landesrecht/importer-common/pipeline.ts';

import { isBayRsNumber } from '../common/paths.ts';

import type { PortalAddress, UnresolvedAddress } from './addresses.ts';
import { addFinding, checkAttributes, flowBlocks, headingContent, inlineContent, normalizeGazetteNumber, recoverUnknown, reportUnknownElement, type ParseContext } from './flow.ts';
import { attribute, childElement, collapseWhitespace, elementChildren, rawText, type XmlElement } from './xml.ts';

export interface VvGazetteReference {
  organ?: string;
  year?: string;
  page?: string;
  /** `seite` (AllMBl., `S=319`) oder `nummer` (BayMBl., `Nr=277`). */
  pageKind?: 'seite' | 'nummer';
}

export interface VvHead {
  documentId: string;
  /** Wortdokument-ID des Redaktionssystems; nur Provenienz. */
  wordDocumentId?: string;
  normType: NormType;
  title: string;
  shortTitle?: string;
  abbr?: string;
  /** `bayernrecht_dokumentklasse/@wert` – Klassenschlüssel des Portals, unverändert übernommen. */
  documentClass?: string;
  gazette: VvGazetteReference;
  inForceFrom?: string;
  /** Erste Zeile des `<p typ="titel">`, sofern sie eine Gliederungsnummer ist (z. B. `103-S`). */
  bayRsNumber?: string;
}

export interface VvSectionEffectiveDate {
  label?: string;
  title?: string;
  date: string;
}

export interface VvDocument {
  head: VvHead;
  body: NormBodyBlock[];
  addresses: PortalAddress[];
  unresolvedAddresses: UnresolvedAddress[];
  fullCitation?: string;
  sectionEffectiveDates: VvSectionEffectiveDate[];
}

// `anlage` trägt in Verwaltungsvorschriften eine Abbildung (belegt an BayVwV267724).
const KNOWN_PARAGRAPH_TYPES = ['titel', 'subtitel', 'vollzitat', 'anlage'];
/** Ebene 1 und 2 sind belegt; tiefere Ebenen bleiben `subsection` (beide sind adressierbare Provisions). */
const VV_LEVELS: readonly NormBodyBlock['type'][] = ['section', 'subsection', 'subsection', 'subsection', 'subsection'];

function fail(message: string): never {
  throw new ImportPipelineError('parse-source-format', message);
}

function optionalText(element: XmlElement | undefined): string | undefined {
  if (!element) return undefined;
  const value = collapseWhitespace(rawText(element));
  return value === '' ? undefined : value;
}

export function parseVvHead(root: XmlElement, ctx: ParseContext): VvHead {
  const administrative = childElement(root, 'verwaltungsdaten');
  if (!administrative) fail('<byrecht-vv> enthält kein <verwaltungsdaten> und damit keine Dokument-ID');
  checkAttributes(ctx, administrative, ['doknr', 'worddokid'], '<verwaltungsdaten>');
  const documentId = attribute(administrative, 'doknr');
  if (!documentId) fail('<verwaltungsdaten> trägt kein @doknr; ohne Dokument-ID wird keine Identität erfunden');

  const metadata = childElement(root, 'metadaten');
  const bavarian = metadata ? childElement(metadata, 'bayernrecht') : undefined;
  if (metadata) checkAttributes(ctx, metadata, [], '<metadaten>');
  if (!bavarian) fail(`${documentId}: <metadaten><bayernrecht> fehlt`);
  checkAttributes(ctx, bavarian, [], '<bayernrecht>');

  const known = new Set([
    'bayernrecht_langtitel', 'bayernrecht_kurztitel', 'bayernrecht_abkuerzung', 'bayernrecht_dokumentklasse',
    'bayernrecht_fundstellen', 'bayernrecht_inkraft', 'bayernrecht_ausserkraft',
  ]);
  for (const child of elementChildren(bavarian)) {
    if (!known.has(child.name)) reportUnknownElement(ctx, child, '<bayernrecht>');
  }

  const references = childElement(bavarian, 'bayernrecht_fundstellen');
  const gazette: VvGazetteReference = {};
  if (references) {
    checkAttributes(ctx, references, [], '<bayernrecht_fundstellen>');
    for (const child of elementChildren(references)) {
      switch (child.name) {
        case 'bayernrecht_fundstellen_organ':
          checkAttributes(ctx, child, ['wert'], '<bayernrecht_fundstellen_organ>');
          gazette.organ = attribute(child, 'wert') ?? optionalText(child);
          break;
        case 'bayernrecht_fundstellen_jahrgang':
          gazette.year = optionalText(child);
          break;
        case 'bayernrecht_fundstellen_seite': {
          // Das BayMBl. zählt Bekanntmachungen (`Nr=277`), die Vorgängerblätter Seiten (`S=319`).
          const value = normalizeGazetteNumber(optionalText(child), ctx, '<bayernrecht_fundstellen_seite>');
          gazette.page = value.value;
          gazette.pageKind = value.kind;
          break;
        }
        default:
          reportUnknownElement(ctx, child, '<bayernrecht_fundstellen>');
      }
    }
  }

  const documentClassElement = childElement(bavarian, 'bayernrecht_dokumentklasse');
  if (documentClassElement) checkAttributes(ctx, documentClassElement, ['wert'], '<bayernrecht_dokumentklasse>');

  const textData = childElement(root, 'textdaten');
  const vv = textData ? childElement(textData, 'vv1.0') : undefined;
  const header = vv ? childElement(vv, 'kopf') : undefined;
  const headerTitle = header ? optionalText(childElement(header, 'titel')) : undefined;

  const title = optionalText(childElement(bavarian, 'bayernrecht_langtitel')) ?? headerTitle;
  if (!title) fail(`${documentId}: weder <bayernrecht_langtitel> noch <kopf><titel> nennen einen Titel`);

  const inForce = optionalText(childElement(bavarian, 'bayernrecht_inkraft'));
  if (inForce !== undefined && !/^\d{4}-\d{2}-\d{2}$/u.test(inForce)) {
    addFinding(ctx, 'warning', 'date-format', `<bayernrecht_inkraft> ${JSON.stringify(inForce)} ist kein ISO-Datum und wird nicht übernommen`);
  }

  return {
    documentId,
    wordDocumentId: attribute(administrative, 'worddokid'),
    normType: 'verwaltungsvorschrift',
    title,
    shortTitle: optionalText(childElement(bavarian, 'bayernrecht_kurztitel')),
    abbr: optionalText(childElement(bavarian, 'bayernrecht_abkuerzung')),
    documentClass: documentClassElement ? attribute(documentClassElement, 'wert') ?? optionalText(documentClassElement) : undefined,
    gazette,
    inForceFrom: inForce !== undefined && /^\d{4}-\d{2}-\d{2}$/u.test(inForce) ? inForce : undefined,
  };
}

interface VvState {
  documentId: string;
  unresolved: UnresolvedAddress[];
  effectiveDates: VvSectionEffectiveDate[];
}

function sectionBlock(element: XmlElement, ctx: ParseContext, state: VvState, position: number[], blockPath: number[]): NormBodyBlock {
  checkAttributes(ctx, element, ['ebene', 'inkraft', 'id'], '<gliederung>');
  const where = `<gliederung ebene=${attribute(element, 'ebene') ?? '?'} Position ${position.join('.')}>`;
  const depth = position.length;
  const declared = attribute(element, 'ebene');
  if (declared !== undefined && Number.parseInt(declared, 10) !== depth) {
    addFinding(ctx, 'warning', 'vv-level-mismatch', `${where}: @ebene=${declared}, tatsächliche Schachtelungstiefe ${depth}; für die Blockebene zählt die Schachtelung`);
  }
  ctx.counters.maxSectionDepth = Math.max(ctx.counters.maxSectionDepth, depth);
  if (depth > 2) ctx.counters.deepSections += 1;

  const numberElement = childElement(element, 'gliederung.nr');
  const titleElement = childElement(element, 'gliederung.titel');
  const label = numberElement ? collapseWhitespace(inlineContent(numberElement, ctx, `${where} → <gliederung.nr>`).text) : '';
  const heading = titleElement ? headingContent(titleElement, ctx, `${where} → <gliederung.titel>`) : { lines: [] as string[], footnotes: [] as NormBodyBlock[] };
  const title = heading.lines.join(' ');

  const effective = attribute(element, 'inkraft');
  if (effective) {
    state.effectiveDates.push({ label: label || undefined, title: title || undefined, date: effective });
  }

  const children: NormBodyBlock[] = [...heading.footnotes];
  let sectionIndex = 0;
  for (const child of elementChildren(element)) {
    switch (child.name) {
      case 'gliederung.nr':
      case 'gliederung.titel':
        break;
      case 'gliederung':
        sectionIndex += 1;
        children.push(sectionBlock(child, ctx, state, [...position, sectionIndex], [...blockPath, children.length]));
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

  state.unresolved.push({
    kind: 'division',
    label: label || undefined,
    title: title || undefined,
    position: [...position],
    blockPath: [...blockPath],
    reason: 'Das Gliederungssuffix einer Verwaltungsvorschrift ist im Portal rein numerisch und seine Bildungsregel ungeklärt; es wird kein Permalink geraten.',
  });

  const headless = label === '' && title === '';
  if (headless) {
    addFinding(ctx, 'warning', 'division-without-heading', `${where} trägt weder Gliederungsnummer noch Überschrift und wird als überschriftenloser Abschnitt geführt`);
  }
  const block: NormBodyBlock = { type: headless ? 'preamble' : VV_LEVELS[Math.min(depth, VV_LEVELS.length) - 1] ?? 'subsection' };
  if (label) block.label = label;
  if (title) block.title = title;
  block.children = children;
  return block;
}

/** Liest das Wurzelelement `byrecht-vv`. */
export function parseVvDocument(root: XmlElement, ctx: ParseContext): VvDocument {
  if (root.name !== 'byrecht-vv') fail(`Erwartet <byrecht-vv>, gefunden <${root.name}>`);
  checkAttributes(ctx, root, [], '<byrecht-vv>');
  if (attribute(root, 'builddate') !== undefined) {
    addFinding(ctx, 'info', 'vv-builddate-present', '<byrecht-vv> trägt ein @builddate; die VV-DTD kennt es nicht – es bleibt außerhalb aller Gleichheitsvergleiche');
  }

  const head = parseVvHead(root, ctx);
  for (const child of elementChildren(root)) {
    if (child.name !== 'verwaltungsdaten' && child.name !== 'metadaten' && child.name !== 'textdaten') reportUnknownElement(ctx, child, '<byrecht-vv>');
  }

  const textData = childElement(root, 'textdaten');
  if (!textData) fail(`${head.documentId}: <textdaten> fehlt`);
  checkAttributes(ctx, textData, [], '<textdaten>');
  const vv = childElement(textData, 'vv1.0');
  if (!vv) fail(`${head.documentId}: <textdaten><vv1.0> fehlt`);
  checkAttributes(ctx, vv, [], '<vv1.0>');
  for (const child of elementChildren(vv)) {
    if (child.name !== 'kopf' && child.name !== 'rumpf') reportUnknownElement(ctx, child, '<vv1.0>');
  }
  const header = childElement(vv, 'kopf');
  if (header) {
    checkAttributes(ctx, header, [], '<kopf>');
    for (const child of elementChildren(header)) {
      if (child.name !== 'titel') reportUnknownElement(ctx, child, '<kopf>');
    }
  }
  const rumpf = childElement(vv, 'rumpf');
  if (!rumpf) fail(`${head.documentId}: <vv1.0><rumpf> fehlt`);
  checkAttributes(ctx, rumpf, [], '<rumpf>');

  const state: VvState = { documentId: head.documentId, unresolved: [], effectiveDates: [] };
  const body: NormBodyBlock[] = [];
  let fullCitation: string | undefined;
  let bayRsNumber: string | undefined;
  let sectionIndex = 0;

  for (const child of elementChildren(rumpf)) {
    switch (child.name) {
      case 'p': {
        const type = attribute(child, 'typ');
        const { text, footnotes } = inlineContent(child, ctx, `<p typ=${type ?? '-'}>`);
        if (type !== undefined && !KNOWN_PARAGRAPH_TYPES.includes(type)) {
          addFinding(ctx, 'warning', 'vv-paragraph-type-unknown', `Unbekannter Absatztyp <p typ="${type}"> (Zeile ${child.line}); der Text bleibt als Fließtext erhalten`);
        }
        if (type === 'vollzitat') {
          fullCitation = collapseWhitespace(text) || undefined;
          break;
        }
        if (type === 'titel') {
          // Erste Zeile ist im Portal die Gliederungsnummer (`103-S`); übernommen wird sie nur,
          // wenn sie dem Muster einer Gliederungsnummer entspricht – sonst bleibt sie reiner Text.
          const first = text.split('\n')[0]?.trim() ?? '';
          if (first !== '' && isBayRsNumber(first)) bayRsNumber = first;
          else if (first !== '') {
            addFinding(ctx, 'info', 'vv-bayrs-number-absent', `Die erste Zeile des Titelabsatzes (${JSON.stringify(first)}) ist keine Gliederungsnummer; es wird keine erfunden`);
          }
        }
        if (text !== '') {
          const block: NormBodyBlock = { type: type === 'titel' ? 'heading' : 'paragraphText', text };
          if (footnotes.length > 0) block.children = footnotes;
          body.push(block);
        } else {
          body.push(...footnotes);
        }
        break;
      }
      case 'gliederung':
        sectionIndex += 1;
        body.push(sectionBlock(child, ctx, state, [sectionIndex], [body.length]));
        break;
      case 'ul':
      case 'table':
        body.push(...flowBlocks([child], ctx, '<rumpf>'));
        break;
      default:
        body.push(...recoverUnknown(child, ctx, '<rumpf>'));
    }
  }

  if (state.unresolved.length > 0) {
    addFinding(ctx, 'info', 'vv-section-address-unresolved',
      `${state.unresolved.length} Gliederungen ohne Permalink: das numerische Gliederungssuffix der Verwaltungsvorschriften (BayVwV…-0, -13, -19, …) ist ungeklärt; der Positionspfad ist mitgezählt, eine Portal-ID wird nicht geraten`);
  }
  if (state.effectiveDates.length > 0) {
    const dates = [...new Set(state.effectiveDates.map((entry) => entry.date))].sort();
    addFinding(ctx, 'info', 'vv-section-effective-dates',
      `${state.effectiveDates.length} Gliederungen tragen @inkraft (${dates.join(', ')}); abschnittsweise Zeitinformation, die das Normmodell nicht kennt`);
  }

  head.bayRsNumber = bayRsNumber;
  return { head, body, addresses: [], unresolvedAddresses: state.unresolved, fullCitation, sectionEffectiveDates: state.effectiveDates };
}
