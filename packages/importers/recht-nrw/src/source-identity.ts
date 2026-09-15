/**
 * Quellidentität auf RECHT.NRW.
 *
 * Eine Fassungsseite hat die Adresse `/lrgv/<dokumentart>/<TTMMJJJJ>-<slug>`; das Datum im Pfad
 * ist der Geltungsbeginn der Fassung („Gültig ab“), nicht der Simulationsstichtag. Die
 * Stammnorm ist über den Link „Link zur aktuellsten Fassung“ als Drupal-Taxonomie-Term
 * (`/taxonomy/term/<id>`) adressiert; diese numerische ID ist die stabile Quellkennung der
 * Stammnorm und wird als `externalIdentifier { system: "recht-nrw", value: "term:<id>" }`
 * übernommen. Sie ist keine amtliche Nummer (die SGV-Gliederungsnummer wird auf der Seite nicht
 * ausgewiesen), aber eine echte, stabile Kennung des Portals.
 */
import { BASE_URL, LRGV_ALL_TYPES, LRGV_IMPORTABLE_TYPES, type LrgvDocumentType } from './constants.ts';

export interface RechtNrwVersionAddress {
  /** Absolute, normalisierte URL ohne nachgestellten Schrägstrich. */
  url: string;
  section: 'lrgv' | 'lrmb';
  documentType: (typeof LRGV_ALL_TYPES)[number];
  /** Geltungsbeginn der Fassung aus dem Pfad (ISO-Datum). */
  pathDate: string;
  slug: string;
}

const VERSION_PATH = /^\/(lrgv|lrmb)\/(gesetz|rechtsverordnung|verwaltungsvorschrift|bekanntmachung)\/(\d{2})(\d{2})(\d{4})-([a-z0-9-]+)\/?$/u;

export function normalizeVersionUrl(value: string): string {
  const url = new URL(value, BASE_URL);
  url.search = '';
  url.hash = '';
  return `${url.origin}${url.pathname.replace(/\/+$/u, '')}`;
}

export function parseVersionUrl(value: string): RechtNrwVersionAddress | null {
  let url: URL;
  try {
    url = new URL(value, BASE_URL);
  } catch {
    return null;
  }
  if (url.origin !== BASE_URL) return null;
  const match = VERSION_PATH.exec(url.pathname);
  if (!match) return null;
  const [, section, documentType, day, month, year, slug] = match;
  return {
    url: normalizeVersionUrl(value),
    section: section as 'lrgv' | 'lrmb',
    documentType: documentType as RechtNrwVersionAddress['documentType'],
    pathDate: `${year}-${month}-${day}`,
    slug: slug!,
  };
}

export function isImportableLrgvType(documentType: string): documentType is LrgvDocumentType {
  return (LRGV_IMPORTABLE_TYPES as readonly string[]).includes(documentType);
}

/** `/taxonomy/term/28924` → `28924`. */
export function parseTaxonomyTermId(href: string | undefined): string | undefined {
  if (!href) return undefined;
  return /\/taxonomy\/term\/(\d+)/u.exec(href)?.[1];
}

/** Externe Kennung der Stammnorm im kanonischen Modell. */
export function stemIdentifier(termId: string): { system: 'recht-nrw'; value: string; url: string } {
  return { system: 'recht-nrw', value: `term:${termId}`, url: `${BASE_URL}/taxonomy/term/${termId}` };
}

/** Deutsches Datum „19.12.2008“ → ISO. */
export function parseGermanDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /(\d{1,2})\.(\d{1,2})\.(\d{4})/u.exec(value);
  if (!match) return undefined;
  const [, day, month, year] = match;
  const iso = `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso ? undefined : iso;
}

const GERMAN_MONTHS: Record<string, string> = {
  januar: '01', februar: '02', märz: '03', maerz: '03', april: '04', mai: '05', juni: '06',
  juli: '07', august: '08', september: '09', oktober: '10', november: '11', dezember: '12',
};

/** „Vom 5. April 2005“ → 2005-04-05. */
export function parseGermanLongDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /(\d{1,2})\.\s*(Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/iu.exec(value);
  if (!match) return undefined;
  const month = GERMAN_MONTHS[match[2]!.toLowerCase()];
  return month ? `${match[3]}-${month}-${match[1]!.padStart(2, '0')}` : undefined;
}
