/**
 * Stand am Stichtag aus den Verkündungen (Lauf 7): die Stammverkündung einer Portalnorm finden, belegen und in das
 * Blockmodell der Verkündung umsetzen – mit den Modulen der Wiederherstellung heute fehlender Normen
 * (`baseline-only/`: Fundstelle → Adresse, Identität über Ausfertigungsdatum und Titel, HTML → Blockmodell mit
 * Textintegrität). Nur lesend und nur aus dem Cache; den Abruf fehlender Seiten übernimmt `reconstruction-queue --fetch`.
 *
 * Genutzt wird die Stammverkündung, wenn die Stammfassung die Fassung am Stichtag ist (die Kette endet ohne vorangehende
 * Änderung vor dem Stichtag) oder die Kette über den Stichtag hinaus bis zur Stammfassung lesbar ist (`walk.ts`, `deep`):
 * Dann wird die Wiederherstellung durch Rücknahme auch der Änderungen vor dem Stichtag geprüft (`proveRestoration`).
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import { resolveBase } from '../baseline-only/base.ts';
import { CONVERTER_VERSION, ConversionError, convertGazetteHtml } from '../baseline-only/html.ts';
import { createPlatform, type Platform } from '../baseline-only/platform.ts';
import { ownPublicationDate } from '../baseline-only/relative.ts';
import { locateBase, parseParenthetical } from '../baseline-only/references.ts';
import { bodyFingerprint } from './recipe.ts';
import { wordingAgreement, type PublicationBase } from './restore.ts';
import type { CurrentNorm } from './source.ts';
import { reverseAmendment } from './steps.ts';
import type { CommandBlock } from './structure.ts';
import type { RecipeTitle } from './title.ts';

export type BaseLoad = { ok: true; base: PublicationBase } | { ok: false; code: 'base-none' | 'base-paper-only' | 'base-pdf-only' | 'base-not-cached' | 'base-mismatch' | 'base-unconvertible'; detail: string; urls?: string[] };

/** Plattform nur aus dem Cache (kein Netz, kein Prüfpunkt). */
export function cachePlatform(root: string): Platform {
  return createPlatform({ root, offline: true, checkpoint: false });
}

/** Die Stammverkündung einer Portalnorm, umgesetzt in das Blockmodell der Verkündung. */
export async function loadPublicationBase(platform: Platform, norm: CurrentNorm): Promise<BaseLoad> {
  const identity = norm.identity;
  // Eine Neubekanntmachung („in der Fassung der Bekanntmachung“) trägt nicht den Text der Stammverkündung.
  if (identity.versionDate && identity.versionDate !== identity.documentDate) return { ok: false, code: 'base-none', detail: 'Norm in der Fassung einer Neubekanntmachung – deren Text ist nicht die Stammverkündung' };
  const referenceText = identity.references[0];
  if (!referenceText || !identity.documentDate) return { ok: false, code: 'base-none', detail: 'Norm ohne Fundstelle oder Ausfertigungsdatum' };
  const reference = parseParenthetical(referenceText).primary;
  if (!reference) return { ok: false, code: 'base-none', detail: `Fundstelle „${referenceText}“ nicht lesbar` };
  const location = locateBase(reference, identity.documentDate);
  if (location.availability === 'paper-only') return { ok: false, code: 'base-paper-only', detail: location.reason };
  const title = norm.document.law.title;
  const resolved = await resolveBase(platform, { location, documentDate: identity.documentDate, citedTitle: title, ledgerTitle: title });
  if (!resolved.ok) {
    const code = resolved.code === 'base-not-fetched' ? 'base-not-cached' : resolved.code === 'base-pdf-only' ? 'base-pdf-only' : 'base-mismatch';
    return { ok: false, code, detail: resolved.detail, urls: resolved.urls };
  }
  const publication = resolved.publication;
  return publicationBaseFromHtml(publication.page.html, {
    organ: publication.organ,
    citation: publication.citation,
    url: publication.page.url,
    sha256: publication.page.sha256,
    ...(publication.page.retrievedAt ? { retrievedAt: publication.page.retrievedAt } : {}),
    ...(publication.publishedAt ? { listedAt: publication.publishedAt } : {}),
    authority: publication.authority,
    representation: publication.representation,
  });
}

/**
 * Stand der Stammverkündung aus ihrer Seite: Umsetzung in das Blockmodell der Verkündung (`baseline-only/html.ts`, mit
 * Textintegrität), beim GVBl. mit hergestellter Gliederung (`nestLaw`); Verkündungsdatum, wie die Seite es selbst
 * druckt – nur wenn es mit dem der Übersicht (`listedAt`, Ausgabe) übereinstimmt.
 */
export function publicationBaseFromHtml(html: string, source: { organ: string; citation: string; url: string; sha256: string; retrievedAt?: string; listedAt?: string; authority: string; representation: string }): BaseLoad {
  let blocks: NormBodyBlock[];
  let pageTextSha256: string;
  try {
    const converted = convertGazetteHtml(html);
    blocks = source.organ === 'GVBl' ? nestLaw(converted.blocks) : converted.blocks;
    pageTextSha256 = converted.pageTextSha256;
  } catch (error) {
    if (error instanceof ConversionError) return { ok: false, code: 'base-unconvertible', detail: `${source.url}: ${error.message}` };
    throw error;
  }
  const printed = ownPublicationDate(html, source.organ);
  const publishedAt = printed && (!source.listedAt || source.listedAt === printed) ? printed : undefined;
  const attachments = publicationAttachments(html);
  return {
    ok: true,
    base: {
      body: blocks,
      converter: CONVERTER_VERSION,
      pageTextSha256,
      citation: source.citation,
      ...(publishedAt ? { publishedAt } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
      sources: [
        {
          role: 'base-publication',
          citation: source.citation,
          url: source.url,
          sha256: source.sha256,
          ...(source.retrievedAt ? { retrievedAt: source.retrievedAt } : {}),
          ...((publishedAt ?? source.listedAt) ? { publishedAt: (publishedAt ?? source.listedAt)! } : {}),
          authority: source.authority,
          representation: source.representation,
        },
      ],
    },
  };
}

/**
 * Anhänge der Verkündung (Block „Anlagen“ hinter dem Textkörper, `p.attachment` mit Liste): Bezeichnung und Adresse. Die
 * Plattform führt Anlagen dort als PDF – nie als Text der Seite; ein Glied „Anlage …“, das im Textkörper fehlt, steht dann
 * nur im Anhang (Lauf 8: Grund `restore-annex-attachment` statt „nicht gefunden“).
 */
export function publicationAttachments(html: string): Array<{ label: string; url: string }> {
  const start = html.search(/<p class="attachment"/u);
  if (start < 0) return [];
  const list = /<ul>([\s\S]*?)<\/ul>/u.exec(html.slice(start));
  if (!list) return [];
  return [...list[1]!.matchAll(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gu)].map((match) => ({ url: match[1]!.startsWith('/') ? `https://www.verkuendung-bayern.de${match[1]!}` : match[1]!, label: match[2]!.replace(/<[^>]+>/gu, '').replace(/&#160;|&nbsp;/gu, ' ').replace(/\s+/gu, ' ').trim() }));
}

/* ------------------------------------------------------------------ Gesetze und Verordnungen des GVBl. */

const CONTAINER = /^(Teil|Kapitel|Abschnitt|Unterabschnitt)\s+(\S+)\s*(.*)$/u;
const CONTAINER_RANK: Readonly<Record<string, number>> = { Teil: 0, Kapitel: 1, Abschnitt: 2, Unterabschnitt: 3 };
const UNIT_HEADING = /^(§\s*\d+[a-z]?|Art\.\s*\d+[a-z]?)\s*(.*)$/u;
const PARAGRAPH_START = /^\((\d+[a-z]?)\)\s+/u;

function itemLevel(label: string | undefined): number {
  const clean = (label ?? '').trim();
  if (/^\d+[a-z]?\.$/u.test(clean)) return 1;
  if (/^[a-z]\)$/u.test(clean)) return 2;
  if (/^([a-z])\1\)$/u.test(clean)) return 3;
  if (/^([a-z])\1\1\)$/u.test(clean)) return 4;
  return 1;
}

/**
 * GVBl.-Seiten setzt der Umsetzer flach (Überschrift „§ 2 …“, Absatz „(1) …“, Listenglieder). Für die Auflösung von
 * Orten („Art. 8 Abs. 2“) und den Feldvergleich wird die Gliederung hergestellt, wie das Portal sie führt: Teil/Abschnitt
 * → § bzw. Art. (Bezeichnung und Überschrift) → Absatz „(n)“ (Bezeichnung, Text) → Nummern und Buchstaben; Text nach einer
 * Aufzählung bleibt beim Absatz. Der Wortlaut bleibt unverändert – nur die Absatzbezeichnung steht als Bezeichnung statt
 * am Textanfang. Die Unterschrift („München, den …“) und alles danach gehören nicht zum Normtext.
 */
export function nestLaw(blocks: readonly NormBodyBlock[]): NormBodyBlock[] {
  const flat: NormBodyBlock[] = [];
  const visit = (entries: readonly NormBodyBlock[]): void => {
    for (const block of entries) {
      // Tabellen (und Abbildungen) bleiben ganz: Ihre Zeilen und Zellen sind keine Gliederung der Vorschrift.
      if (block.type === 'table' || (block.type as string) === 'figure') {
        flat.push(block);
        continue;
      }
      const { children, ...own } = block;
      flat.push(own as NormBodyBlock);
      if (children) visit(children);
    }
  };
  visit(blocks);
  // Ältere Seiten setzen die Überschrift als zwei Absätze („§ 1“ – „Anwendungszweck“, GVBl. 2010 S. 777).
  for (let at = 0; at < flat.length; at += 1) {
    const block = flat[at]!;
    const next = flat[at + 1];
    if (block.type !== 'paragraphText' || typeof block.text !== 'string' || !/^(?:§\s*\d+[a-z]?|Art\.\s*\d+[a-z]?|(?:Teil|Kapitel|Abschnitt|Unterabschnitt)\s+\S+)$/u.test(block.text.trim())) continue;
    const title = next && next.type === 'paragraphText' && typeof next.text === 'string' && !PARAGRAPH_START.test(next.text) && !/[.:;,]$/u.test(next.text.trim()) && next.text.length < 160 && !/^(?:§|Art\.)\s*\d/u.test(next.text) ? next.text.trim() : undefined;
    flat.splice(at, title ? 2 : 1, { type: 'heading', title: title ? `${block.text.trim()} ${title}` : block.text.trim() } as NormBodyBlock);
  }
  // Die Inhaltsübersicht führt das Portal nicht: vom Kopf „Inhaltsübersicht“ bis vor die Wiederholung ihres ersten Eintrags
  // (dort beginnt der Text). Ohne Wiederholung bleibt sie stehen (die Wortlautprobe scheitert dann an ihr).
  const toc = flat.findIndex((block) => /^Inhalts(?:übersicht|verzeichnis)$/u.test(String(block.title ?? block.text ?? '').trim()) && block.label === undefined);
  if (toc >= 0 && flat[toc + 1]) {
    const key = (block: NormBodyBlock): string => `${block.label ?? ''}|${block.title ?? ''}|${block.text ?? ''}`.replace(/\s+/gu, ' ').trim();
    const first = key(flat[toc + 1]!);
    const repeat = flat.findIndex((block, index) => index > toc + 1 && key(block) === first);
    if (repeat > 0) flat.splice(toc, repeat - toc);
  }
  const root: NormBodyBlock[] = [];
  const containers: Array<{ rank: number; block: NormBodyBlock }> = [];
  let unit: NormBodyBlock | undefined;
  let paragraph: NormBodyBlock | undefined;
  let items: NormBodyBlock[] = [];
  const target = (): NormBodyBlock[] => {
    const owner = paragraph ?? unit ?? containers.at(-1)?.block;
    if (!owner) return root;
    owner.children ??= [];
    return owner.children;
  };
  for (const block of flat) {
    if ((block.type as string) === 'signature') break;
    if (block.type === 'paragraphText' && typeof block.text === 'string' && /^München,\s+den\s/u.test(block.text)) break;
    const heading = block.type === 'heading' && typeof block.title === 'string' && block.label === undefined && block.text === undefined ? block.title.trim() : undefined;
    const container = heading ? CONTAINER.exec(heading) : null;
    if (container) {
      const rank = CONTAINER_RANK[container[1]!]!;
      while (containers.length > 0 && containers.at(-1)!.rank >= rank) containers.pop();
      const node: NormBodyBlock = { type: rank === 0 ? 'part' : rank === 1 ? 'chapter' : 'section', label: `${container[1]} ${container[2]}`, ...(container[3] ? { title: container[3] } : {}), children: [] } as NormBodyBlock;
      (containers.at(-1)?.block.children ?? root).push(node);
      containers.push({ rank, block: node });
      unit = undefined;
      paragraph = undefined;
      items = [];
      continue;
    }
    const unitHeading = heading ? UNIT_HEADING.exec(heading) : null;
    if (unitHeading) {
      const label = unitHeading[1]!.replace(/\s+/gu, ' ');
      const node: NormBodyBlock = { type: label.startsWith('§') ? 'paragraph' : 'article', label, ...(unitHeading[2] ? { title: unitHeading[2] } : {}), children: [] } as NormBodyBlock;
      (containers.at(-1)?.block.children ?? root).push(node);
      unit = node;
      paragraph = undefined;
      items = [];
      continue;
    }
    if (unit && block.type === 'paragraphText' && typeof block.text === 'string' && PARAGRAPH_START.test(block.text)) {
      const match = PARAGRAPH_START.exec(block.text)!;
      const node: NormBodyBlock = { type: 'subparagraph', label: `(${match[1]})`, text: block.text.slice(match[0].length) } as NormBodyBlock;
      unit.children!.push(node);
      paragraph = node;
      items = [];
      continue;
    }
    if (block.type === 'item') {
      const level = itemLevel(block.label);
      while (items.length > 0 && itemLevel(items.at(-1)!.label) >= level) items.pop();
      const owner = items.at(-1);
      // Wie das Portal: Gliederungsebene der Aufzählung als `level`, ab der zweiten Ebene `subitem`.
      const depth = items.length + 1;
      const node = { ...block, type: depth === 1 ? 'item' : 'subitem', level: depth } as NormBodyBlock;
      if (owner) (owner.children ??= []).push(node);
      else target().push(node);
      items.push(node);
      continue;
    }
    // Text nach einer Aufzählung gehört zum Absatz, nicht zum letzten Listenglied.
    items = [];
    target().push(block);
  }
  return root;
}

/* ------------------------------------------------------------------ Probe der Wiederherstellung */

/** Eine Änderung vor dem Stichtag (Glied der Kette bis zur Stammfassung) mit ihrem Befehlsblock für die Norm. */
export interface PriorAmendment {
  label: string;
  block?: CommandBlock;
  url: string;
  sha256: string;
  retrievedAt?: string;
  publishedAt?: string;
  authority: string;
  representation: string;
  section?: string;
}

export interface UsedPriorAmendment {
  citation: string;
  url: string;
  sha256: string;
  retrievedAt?: string;
  publishedAt?: string;
  authority: string;
  representation: string;
  section?: string;
  introIndex: number;
  steps: number;
}

/**
 * Probe der Wiederherstellung (Lauf 7): vom zurückgerechneten Stichtagskörper weiter rückwärts über alle Änderungen vor
 * dem Stichtag (`prior`, jüngste zuerst; Alttext wiederum aus der Stammverkündung, aber **ohne** Rückfall auf ganze
 * Glieder) bis zur Stammfassung – die dann im ganzen Wortlaut der Stammverkündung gleichen muss. Ohne Änderungen vor dem
 * Stichtag ist der Stichtagskörper selbst die Stammfassung.
 */
export function proveRestoration(
  baselineBody: readonly NormBodyBlock[],
  baselineTitle: RecipeTitle | undefined,
  prior: readonly PriorAmendment[],
  base: PublicationBase,
): { ok: true; agreement: ReturnType<typeof wordingAgreement>; prior: UsedPriorAmendment[]; stammfassungFingerprint: string } | { ok: false; reason: string; detail: string } {
  let body = structuredClone(baselineBody) as NormBodyBlock[];
  let title = baselineTitle;
  const used: UsedPriorAmendment[] = [];
  for (const [index, step] of prior.entries()) {
    if (!step.block) return { ok: false, reason: 'restoration-prior-unreadable', detail: `${step.label}: kein Befehlsblock` };
    const reversal = reverseAmendment(body, step.block, `p${index + 1}-`, title, base);
    if (reversal.failures.length > 0) return { ok: false, reason: 'restoration-prior-reverse', detail: `Änderung vor dem Stichtag ${step.label}: ${reversal.failures[0]!.detail}` };
    body = reversal.before!;
    if (reversal.titleBefore) title = reversal.titleBefore;
    used.push({
      citation: step.label,
      url: step.url,
      sha256: step.sha256,
      ...(step.retrievedAt ? { retrievedAt: step.retrievedAt } : {}),
      ...(step.publishedAt ? { publishedAt: step.publishedAt } : {}),
      authority: step.authority,
      representation: step.representation,
      ...(step.section ? { section: step.section } : {}),
      introIndex: step.block.intro.index,
      steps: reversal.steps.length,
    });
  }
  const agreement = wordingAgreement(body, base);
  if (!agreement.ok) return { ok: false, reason: 'restoration-disagrees', detail: `${prior.length > 0 ? `nach Rücknahme von ${prior.length} Änderung(en) vor dem Stichtag: ` : ''}${agreement.detail}` };
  return { ok: true, agreement, prior: used, stammfassungFingerprint: bodyFingerprint(body) };
}
