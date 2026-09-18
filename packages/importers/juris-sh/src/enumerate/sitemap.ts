/**
 * Sitemap des Bürgerservice Schleswig-Holstein und Einordnung der Dokumentkennungen.
 *
 * Die Sitemap ist in der robots.txt deklariert (`Sitemap: …/sitemapindex.xml`) und die einzige öffentliche,
 * maschinenlesbare Gesamtliste des Portals. Sie führt ausschließlich Dokumentadressen
 * `/bssh/document/<ID>` – keine Titel, keine Typen, keine Geltungsdaten.
 *
 * Kennungsfamilien (am 2026-09-18 aus der Sitemap selbst gezählt, siehe SOURCE_INVENTORY.md):
 *
 *   jlr-NNLSH<8 Hex>                 Rahmendokument einer Norm des Landesrechts (Gesetz oder Verordnung)
 *   jlr-NNLSH<8 Hex>NN<11 Ziffern>   Einheit (§, Artikel, Anlage, Gliederung) dieses Rahmendokuments
 *   jlr-FFN…SH                       Register des Fundstellennachweises (Abkürzungen, Inhalt, System, …)
 *   VVSH-VVSH<9 Ziffern>             Verwaltungsvorschrift
 *   VVSH-<Gl.Nr.>-…                  Verwaltungsvorschrift in Gliederungsnummer-Kennung (in der Sitemap nicht geführt)
 *   VB-SH-AD-<Blatt><Jahr>-…         Verkündungsblatt (GVOBl., Amtsbl., SchlHA) – Veröffentlichung, keine Norm
 *   KRSH…                            Ortsrecht (kommunales Satzungsrecht)
 *   NJRE…                            Rechtsprechung
 *
 * **Quellidentität** ist die juris-Dokumentnummer (DOKNR) des Rahmendokuments bzw. der Verwaltungsvorschrift.
 * Sprechende Kennungen wie `jlr-VerfSH2014rahmen` sind Aliase: Der dokumentierte Permalink
 * `/perma?d=jlr-VerfSH2014rahmen` leitet serverseitig auf `query=DOKNR:jlr-NNLSH00002D11` weiter. Die URL
 * selbst ist keine Identität – sie wird aus der DOKNR gebildet.
 */
import { PORTAL_ORIGIN } from '../access/policy.ts';

export const DOCUMENT_FAMILIES = ['landesrecht-frame', 'landesrecht-unit', 'ffn-register', 'vwv', 'vwv-legacy', 'gazette', 'ortsrecht', 'rechtsprechung', 'portal-page', 'unknown'] as const;
export type DocumentFamily = (typeof DOCUMENT_FAMILIES)[number];

export interface ClassifiedId {
  family: DocumentFamily;
  /** Für Einheiten: DOKNR des Rahmendokuments. */
  frameId?: string;
}

const FRAME = /^jlr-NNLSH[0-9A-F]{8}$/u;
const UNIT = /^(jlr-NNLSH[0-9A-F]{8})NN\d{11}$/u;

export function classifyDocumentId(id: string): ClassifiedId {
  if (FRAME.test(id)) return { family: 'landesrecht-frame' };
  const unit = UNIT.exec(id);
  if (unit) return { family: 'landesrecht-unit', frameId: unit[1]! };
  if (/^jlr-FFN[A-Za-z0-9]+SH$/u.test(id)) return { family: 'ffn-register' };
  if (/^VVSH-VVSH\d{9}$/u.test(id)) return { family: 'vwv' };
  if (/^VVSH-\d{2,4}(?:\.\d+)*-/u.test(id)) return { family: 'vwv-legacy' };
  if (/^VB-SH-/u.test(id)) return { family: 'gazette' };
  if (/^KRSH[A-Z]*\d+$/u.test(id)) return { family: 'ortsrecht' };
  if (/^NJRE\d+$/u.test(id)) return { family: 'rechtsprechung' };
  return { family: 'unknown' };
}

/** Einordnung je Familie nach docs/LEGAL_SCOPE.md – auf Familienebene, ohne Dokumentinhalt. */
export const FAMILY_SCOPE: Readonly<Record<DocumentFamily, { scope: 'candidate' | 'register' | 'excluded' | 'review'; reason: string }>> = {
  'landesrecht-frame': { scope: 'candidate', reason: 'Rahmendokument einer Norm des Landesrechts (Gesetz/Verordnung); Normtyp und Geltung erst aus dem Dokument bestimmbar' },
  'landesrecht-unit': { scope: 'candidate', reason: 'Einheit eines Rahmendokuments; zählt zur Norm, nicht als eigene Norm' },
  'ffn-register': { scope: 'register', reason: 'Register des Fundstellennachweises – Enumerationsquelle, keine Norm' },
  vwv: { scope: 'candidate', reason: 'Verwaltungsvorschrift; normativ/landesweit oder rein informativ erst aus dem Dokument bestimmbar' },
  'vwv-legacy': { scope: 'review', reason: 'Verwaltungsvorschrift in Gliederungsnummer-Kennung; die Sitemap führt sie nicht (Stichprobe: auch am Stichtag geltende VwV fehlen)' },
  gazette: { scope: 'excluded', reason: 'Verkündungsblatt (Veröffentlichung, keine konsolidierte Norm) – allenfalls Beleg für Rekonstruktionen' },
  ortsrecht: { scope: 'excluded', reason: 'Ortsrecht/kommunales Satzungsrecht (LEGAL_SCOPE: raus)' },
  rechtsprechung: { scope: 'excluded', reason: 'Rechtsprechung (LEGAL_SCOPE: raus)' },
  'portal-page': { scope: 'excluded', reason: 'Portalseite ohne Dokument' },
  unknown: { scope: 'review', reason: 'unbekannte Kennungsfamilie' },
};

const DOCUMENT_PREFIX = `${PORTAL_ORIGIN}/bssh/document/`;

/** Dokumentkennung aus einer Sitemap-Adresse; `undefined` für Portalseiten ohne Dokument. */
export function documentIdFromUrl(url: string): string | undefined {
  if (!url.startsWith(DOCUMENT_PREFIX)) return undefined;
  const rest = url.slice(DOCUMENT_PREFIX.length);
  if (rest === '' || rest.includes('/') || rest.includes('?')) return undefined;
  return decodeURIComponent(rest);
}

export class SitemapFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SitemapFormatError';
  }
}

/** `<loc>`-Einträge einer Sitemap bzw. eines Sitemap-Index; das Wurzelelement muss passen. */
export function parseSitemapLocations(xml: string, kind: 'sitemapindex' | 'urlset'): string[] {
  if (!new RegExp(`<${kind}[\\s>]`, 'u').test(xml)) throw new SitemapFormatError(`kein <${kind}>-Dokument`);
  if (!new RegExp(`</${kind}>\\s*$`, 'u').test(xml)) throw new SitemapFormatError(`<${kind}> nicht abgeschlossen – Abruf unvollständig?`);
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gu)].map((match) => match[1]!.replace(/&amp;/gu, '&'));
}

export interface SitemapInventory {
  /** Alle Dokumentkennungen in Sitemap-Reihenfolge (ohne Portalseiten). */
  documentIds: string[];
  /** Adressen, die kein Dokument sind (z. B. die Startseite). */
  otherUrls: string[];
  /** Dokumentkennungen, die mehrfach vorkommen. */
  duplicates: string[];
  byFamily: Record<DocumentFamily, number>;
  /** Rahmendokumente mit Zahl ihrer Einheiten. */
  frames: Map<string, number>;
  /** Einheiten, deren Rahmendokument die Sitemap nicht führt. */
  orphanUnits: string[];
  vwv: string[];
  registers: string[];
  unknown: string[];
}

export function inventorySitemaps(locationLists: readonly string[][]): SitemapInventory {
  const byFamily = Object.fromEntries(DOCUMENT_FAMILIES.map((family) => [family, 0])) as Record<DocumentFamily, number>;
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const documentIds: string[] = [];
  const otherUrls: string[] = [];
  const frames = new Map<string, number>();
  const units = new Map<string, number>();
  const vwv: string[] = [];
  const registers: string[] = [];
  const unknown: string[] = [];
  for (const url of locationLists.flat()) {
    const id = documentIdFromUrl(url);
    if (id === undefined) {
      otherUrls.push(url);
      byFamily['portal-page'] += 1;
      continue;
    }
    if (seen.has(id)) {
      duplicates.push(id);
      continue;
    }
    seen.add(id);
    documentIds.push(id);
    const classified = classifyDocumentId(id);
    byFamily[classified.family] += 1;
    if (classified.family === 'landesrecht-frame') frames.set(id, frames.get(id) ?? 0);
    else if (classified.family === 'landesrecht-unit') units.set(classified.frameId!, (units.get(classified.frameId!) ?? 0) + 1);
    else if (classified.family === 'vwv') vwv.push(id);
    else if (classified.family === 'ffn-register') registers.push(id);
    else if (classified.family === 'unknown') unknown.push(id);
  }
  const orphanUnits: string[] = [];
  for (const [frameId, count] of units) {
    if (frames.has(frameId)) frames.set(frameId, count);
    else orphanUnits.push(frameId);
  }
  return { documentIds, otherUrls, duplicates, byFamily, frames, orphanUnits, vwv, registers, unknown };
}
