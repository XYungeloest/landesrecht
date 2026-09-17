/**
 * Portaladressen (Permalinks) – **nicht** aus den XML-IDs gebildet.
 *
 * Die Discovery belegt, dass `gliederungsid`/`einzelnormid` und die Portal-Dokument-IDs auseinander
 * laufen: Die fünf Hauptteile der Bayerischen Verfassung tragen im XML `G_1`, `G_12`, `G_13`, `G_17`,
 * `G_22`, im Portal heißen sie `BayVerf-G1` … `BayVerf-G5`, ihre Kinder `BayVerf-G1_1` … Wer die URL
 * aus dem Attribut ableitet, erzeugt falsche Permalinks. Bei `BayAbmG` fallen beide Nummerierungen
 * zufällig zusammen – genau deshalb ist die falsche Regel dort nicht zu erkennen.
 *
 * Deshalb zählt der Parser den Positionspfad beim Durchlaufen selbst mit:
 *
 *   Gliederung   `<Kurz>-G<i>[_<j>…]`   i, j … 1-basierte Position unter den Geschwistergliederungen
 *   Vorschrift   `<Kurz>-<para.nr>`     ohne „Art. “/„§ “ und ohne Leerraum (`BayVerf-3a`)
 *   ohne Nummer  `<Kurz>-NN<i>`         i … 1-basierte Position unter den nummernlosen Vorschriften
 *   Anlage       `<Kurz>-ANL_<i>`       i … 1-basierte Position unter den Anlagen
 *
 * Für Verwaltungsvorschriften ist das Gliederungssuffix rein numerisch (`-0`, `-13`, `-19`, …) und
 * seine Bildungsregel ungeklärt (offener Punkt 5 der Discovery). Dort wird **keine** Adresse geraten;
 * `vv.ts` vergibt nur die Dokumentadresse und meldet die Lücke.
 */
export const PORTAL_DOCUMENT_BASE = 'https://www.gesetze-bayern.de/Content/Document';
export const PORTAL_PDF_BASE = 'https://www.gesetze-bayern.de/Content/Pdf';
export const PORTAL_ZIP_BASE = 'https://www.gesetze-bayern.de/Content/Zip';

export type PortalAddressKind = 'document' | 'division' | 'provision' | 'annex';

export interface PortalAddress {
  /** Portal-Dokument-ID, z. B. `BayVerf-G1_1`. */
  documentId: string;
  kind: PortalAddressKind;
  label?: string;
  title?: string;
  /** Positionspfad, wie ihn der Parser mitgezählt hat (1-basiert). */
  position: number[];
  /** Indexpfad in `SourceLaw.body`, damit Adresse und Block zusammenfinden. */
  blockPath: number[];
  url: string;
  /** Nur bei Gliederungen/Vorschriften: die XML-ID, die eben **nicht** die Portal-ID ist. */
  xmlId?: string;
}

/**
 * Ein Knoten, für den der Positionspfad mitgezählt ist, für den die Bildungsregel der Portal-ID aber
 * **nicht** belegt ist (Gliederungen von Verwaltungsvorschriften). Es wird kein Permalink geraten.
 */
export interface UnresolvedAddress {
  kind: PortalAddressKind;
  label?: string;
  title?: string;
  position: number[];
  blockPath: number[];
  reason: string;
}

export function documentUrl(documentId: string): string {
  return `${PORTAL_DOCUMENT_BASE}/${documentId}`;
}

export function pdfUrl(documentId: string): string {
  return `${PORTAL_PDF_BASE}/${documentId}?all=False`;
}

export function zipUrl(documentId: string): string {
  return `${PORTAL_ZIP_BASE}/${documentId}`;
}

/**
 * Vorschriftensuffix aus der Artikel-/Paragraphenbezeichnung: „Art. 3a“ → `3a`, „§ 12“ → `12`.
 * Gibt `undefined` zurück, wenn nach dem Abtrennen nichts Adressierbares bleibt – dann greift `NN<i>`.
 */
export function provisionSuffix(label: string): string | undefined {
  const stripped = label
    .replace(/^\s*(?:Artikel|Art\.|Art|§§|§)\s*/u, '')
    .replace(/\s+/gu, '')
    .trim();
  return /^[0-9]+[0-9a-zA-Z]*$/u.test(stripped) ? stripped : undefined;
}
