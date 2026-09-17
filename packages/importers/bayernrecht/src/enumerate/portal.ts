/**
 * Adressen und Textwerkzeuge des Portals BAYERN.RECHT (`www.gesetze-bayern.de`).
 *
 * Alles, was an diesem Portal adressiert wird, wird genau hier gebildet – kein Modul setzt URLs
 * selbst zusammen. Die Muster stammen aus `docs/BAYERN_SOURCE_DISCOVERY.md` Abschnitt 5 und sind dort
 * an realen Abrufen belegt.
 *
 * Zwei Eigenheiten des Portals prägen diese Datei:
 *
 *  1. **Die Trefferliste ist sitzungsbehaftet.** `/Search/Page/<n>` liefert die n-te Seite der im
 *     Sitzungszustand hinterlegten Suche – dieselbe Adresse bedeutet je nach Sitzung etwas anderes.
 *     Ein Cache, der nach Adresse schlüsselt, würde Seiten verschiedener Normtypen vermischen.
 *     `hitlistPageUrl` hängt deshalb den Normtyp als Abfrageparameter an: Der Server wertet ihn nicht
 *     aus (die Seite kommt aus dem Sitzungszustand), der Cacheschlüssel wird dadurch aber eindeutig.
 *     Das ist keine Umgehung, sondern eine Unterscheidung im eigenen Cache.
 *  2. **Es gibt keine XML-Namensräume und keine Entity-Definitionen**, wohl aber numerische
 *     HTML-Entities (`&#xFC;`). `decodeEntities` löst genau die auf, die im gelieferten HTML
 *     vorkommen; alles Unbekannte bleibt unverändert stehen, statt stillschweigend zu verschwinden.
 */
import type { SourceArea } from '../common/constants.ts';

export const BASE_URL = 'https://www.gesetze-bayern.de';

/** Normtypen der Portalfacette `NORMTYP` (Werte aus dem Facettenbaum der Trefferliste). */
export const NORM_TYPES = ['ges', 'rv', 'vv', 'vertr'] as const;
export type NormType = (typeof NORM_TYPES)[number];

export const NORM_TYPE_LABELS: Readonly<Record<NormType, string>> = {
  ges: 'Gesetz',
  rv: 'Rechtsverordnung',
  vv: 'Verwaltungsvorschrift',
  vertr: 'Vertrag, sonstige Rechtsquelle',
};

/**
 * Welche Normtypen zu welchem Quellbereich gehören. Der Fortführungsnachweis `ffn` führt die in die
 * Bayerische Rechtssammlung aufgenommenen Vorschriften (Gesetze, Rechtsverordnungen, Staatsverträge),
 * `ffn-mbl` die Verwaltungsvorschriften der Amtsblätter. Der Bereich `events` (Verkündungsereignisse)
 * hat keine Portalfacette und keinen Fortführungsnachweis – er wird nicht enumeriert.
 */
export const AREA_NORM_TYPES: Readonly<Record<SourceArea, readonly NormType[]>> = {
  landesrecht: ['ges', 'rv', 'vertr'],
  vwv: ['vv'],
  events: [],
};

/** Fortführungsnachweis des Bereichs (unpaginierte, statische HTML-Seite). */
export const FORTFUEHRUNGSNACHWEIS_PATH: Readonly<Record<SourceArea, string | undefined>> = {
  landesrecht: '/Content/Document/ffn',
  vwv: '/Content/Document/ffn-mbl',
  events: undefined,
};

export function fortfuehrungsnachweisUrl(area: SourceArea): string {
  const path = FORTFUEHRUNGSNACHWEIS_PATH[area];
  if (!path) throw new Error(`Der Bereich ${area} hat keinen Fortführungsnachweis – es wird keine Quelle erfunden`);
  return `${BASE_URL}${path}`;
}

/** Dokumentseite einer Norm (Portal-Dokument-ID, nicht die XML-ID – siehe Discovery Abschnitt 5). */
export function documentUrl(documentId: string): string {
  return `${BASE_URL}/Content/Document/${encodeURIComponent(documentId)}`;
}

/** Gesamtansicht (alle Vorschriften einer Norm auf einer Seite). */
export function fullDocumentUrl(documentId: string): string {
  return `${BASE_URL}/Content/Document/${encodeURIComponent(documentId)}/true`;
}

/** XML-Export einer Norm als ZIP-Paket; immer normweit, nie artikelweise. */
export function zipUrl(documentId: string): string {
  return `${BASE_URL}/Content/Zip/${encodeURIComponent(documentId)}`;
}

/**
 * Aufwärmaufruf vor einer Facette: Das Portal legt den Sitzungszustand erst mit dem ersten Aufruf an;
 * eine Facette als allererste Anfrage liefert noch „Bitte führen Sie eine Suche aus.“ (belegt). Der
 * Parameter `session` ist serverseitig folgenlos und unterscheidet nur den Cacheschlüssel je Normtyp,
 * damit jede Facette ihre eigene Sitzung bekommt.
 */
export function sessionWarmupUrl(normType: NormType): string {
  return `${BASE_URL}/?session=${normType}`;
}

/** Erster Aufruf einer Normtyp-Facette; setzt den Suchzustand der Sitzung und liefert Seite 1. */
export function facetFilterUrl(normType: NormType): string {
  return `${BASE_URL}/Search/Filter/NORMTYP/${normType}`;
}

/** Folgeseite der Trefferliste. Der Parameter `normtyp` unterscheidet nur den Cacheschlüssel (s. o.). */
export function hitlistPageUrl(normType: NormType, page: number): string {
  if (!Number.isInteger(page) || page < 1) throw new Error(`Seitenzahl ${page} ist keine positive ganze Zahl`);
  return `${BASE_URL}/Search/Page/${page}?normtyp=${normType}`;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  shy: '­',
  ndash: '–',
  mdash: '—',
  szlig: 'ß',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
};

/** HTML-Entities des Portals auflösen; Unbekanntes bleibt wörtlich stehen. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/gu, (entity, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : entity;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : entity;
    }
    return NAMED_ENTITIES[body] ?? entity;
  });
}

/** Sichtbarer Text eines HTML-Ausschnitts: Auszeichnung entfernen, Entities auflösen, Leerraum normalisieren. */
export function textOf(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/giu, ' ').replace(/<[^>]*>/gu, '')).replace(/\s+/gu, ' ').trim();
}

/**
 * Portal-Dokument-IDs sind Kurzbezeichnungen (`BayVerf`, `BayVwV312180`, `BAY_110_1984_201`). Erlaubt
 * sind Buchstaben, Ziffern, Unterstrich, Bindestrich und Punkt – nichts, was in einer Adresse oder
 * einem Dateinamen überrascht. Leere oder abweichende Werte werden nicht stillschweigend übernommen.
 */
export const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;

export function isDocumentId(value: string): boolean {
  return DOCUMENT_ID_PATTERN.test(value);
}
