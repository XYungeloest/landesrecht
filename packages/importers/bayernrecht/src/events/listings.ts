/**
 * Zerlegung der drei Übersichtsformate der Verkündungsplattform Bayern.
 *
 * Alle drei sind reine GET-Formulare ohne Sitzung und ohne Token
 * (`docs/BAYERN_SOURCE_DISCOVERY.md`, Abschnitt 7):
 *
 *   1. **Ausgabenverzeichnis GVBl.** `/gesetz-und-verordnungsblatt/alle-ausgaben-des-gvbl-ab-1945/?volume=<jahr>`
 *      Eine Zeile je Ausgabe mit Verkündungsdatum, Seitenbereich, PDF-Adresse und – ungewöhnlich
 *      komfortabel – der **von der Plattform selbst veröffentlichten SHA-256** im Popover-Attribut
 *      `data-content`. Damit ist der PDF-Bestand prüfbar referenzierbar, ohne ihn zu laden.
 *   2. **Trefferliste GVBl.** `/gvbl/?volume=<jahr>&itemsPerPage=50&offset=<n>` mit den Spalten
 *      Fundstelle · Verkündung · Titel · Gl-Nr. · Ausfertigung.
 *   3. **Trefferliste BayMBl.** `/baymbl/?itemsPerPage=50&offset=<n>` mit den Spalten
 *      Fundstelle · Verkündung · Titel · Gl-Nr. · Erlass · Ressort. Ein Jahrgangsfilter existiert hier
 *      nicht (`reference=<jahr>` liefert keine Treffer, geprüft); die Liste ist nach Fundstelle
 *      absteigend sortiert und wird deshalb bis zum Zieljahrgang durchgeblättert.
 *
 * Der Jahreslisten-Export des BayMBl. (`/ministerialblatt/jahreslisten-exportieren/`) ist ein
 * POST-Formular. Ein GET mit denselben Feldern liefert nur die Formularseite zurück – geprüft, siehe
 * `docs/BAYERN_EVENT_LEDGER.md`. Er wird nicht erzwungen; ausgewertet werden die Übersichtsseiten.
 *
 * Die Zerlegung ist bewusst grob und fehlertolerant: Sie liest die `data-label`-Zellen der Tabelle,
 * statt sich auf eine Spaltenreihenfolge zu verlassen. Was nicht gelesen werden kann, fehlt – es wird
 * nichts ergänzt.
 */

/** Trennt Spalten anhand des `data-label`-Attributs, unabhängig von der Spaltenreihenfolge. */
const CELL = /<td[^>]*data-label="([^"]*)"[^>]*>([\s\S]*?)<\/td>/giu;
const ROW = /<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/giu;

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', shy: '', ndash: '–', mdash: '—',
  bdquo: '„', ldquo: '“', rdquo: '”', sbquo: '‚', lsquo: '‘', rsquo: '’', euro: '€', hellip: '…', szlig: 'ß',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', deg: '°', sect: '§', para: '¶',
};

/** HTML-Entitäten auflösen (benannte und numerische). Unbekannte Namen bleiben unverändert stehen. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/gu, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    return ENTITIES[body] ?? match;
  });
}

/**
 * Sichtbarer Text eines HTML-Ausschnitts. Geschützte Leerzeichen werden zu gewöhnlichen – die Quelle
 * setzt sie mitten in Zitate („vom 22.&#160;Dezember&#160;1998“), und jede weitere Verarbeitung würde
 * sonst zwei Schreibweisen desselben Datums kennen.
 */
export function htmlToText(fragment: string): string {
  return decodeEntities(
    fragment
      .replace(/<(script|style)[\s\S]*?<\/\1>/giu, ' ')
      .replace(/<br\s*\/?>/giu, ' ')
      .replace(/<\/(p|li|h[1-6]|div|tr|td)>/giu, ' ')
      .replace(/<[^>]+>/gu, ''),
  )
    .replace(/[\u00a0\u202f\u2009]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** `30.12.2024` → `2024-12-30`. Liefert `undefined`, wenn kein vollständiges Datum dasteht. */
export function parseGermanDate(value: string): string | undefined {
  const match = /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/u.exec(value);
  if (!match) return undefined;
  const [, day, month, year] = match;
  const iso = `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  return isRealDate(iso) ? iso : undefined;
}

export function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(iso)) return false;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso;
}

/* ------------------------------------------------------------------ Ausgabenverzeichnis GVBl. */

export interface IssueRow {
  volume: number;
  /** Ausgabennummer, zweistellig wie im Dateipfad (`24`); das Jahresinhaltsverzeichnis trägt `00`. */
  issue: string;
  publishedAt: string;
  pages?: string;
  pdfPath: string;
  sha256Published: string;
}

/**
 * Ausgabenverzeichnis eines GVBl.-Jahrgangs. Die Prüfsumme steht im `data-content` des Popover-Buttons
 * unmittelbar nach dem PDF-Link derselben Zeile; fehlt sie, wird die Ausgabe **nicht** aufgenommen –
 * ein Integritätsbeleg wird nicht erfunden.
 */
export function parseGvblIssueIndex(html: string): IssueRow[] {
  const rows: IssueRow[] = [];
  for (const match of html.matchAll(ROW)) {
    const body = match[1]!;
    const cells = new Map<string, string>();
    for (const cell of body.matchAll(CELL)) cells.set(cell[1]!.toLowerCase(), cell[2]!);
    const pdfPath = /href="(\/files\/gvbl\/[^"#]+\.pdf)/u.exec(body)?.[1];
    const sha256 = /data-content="([0-9a-fA-F]{64})"/u.exec(body)?.[1];
    const volume = Number.parseInt(htmlToText(cells.get('jahr') ?? ''), 10);
    const publishedAt = parseGermanDate(htmlToText(cells.get('verkündung') ?? ''));
    if (pdfPath === undefined || sha256 === undefined || !Number.isInteger(volume) || publishedAt === undefined) continue;
    const pages = htmlToText(cells.get('seiten') ?? '');
    const issueLabel = htmlToText(cells.get('ausgabe') ?? '');
    // Das Jahresinhaltsverzeichnis trägt statt einer Nummer den Text „Jahresinhaltsverzeichnis 2023“;
    // der Dateipfad führt es unter `00`. Maßgeblich ist deshalb der Pfad, sobald die Zelle keine
    // reine Zahl enthält.
    const issue = /^\d{1,3}$/u.test(issueLabel) ? issueLabel.padStart(2, '0') : (/\/(\d{2})\//u.exec(pdfPath)?.[1] ?? '00');
    rows.push({ volume, issue, publishedAt, ...(pages === '' ? {} : { pages }), pdfPath, sha256Published: sha256.toLowerCase() });
  }
  return rows;
}

/* ----------------------------------------------------------------------------- Trefferlisten */

export interface ListingRow {
  /**
   * Pfad der Detailseite, z. B. `/gvbl/2024-682/` oder `/baymbl/2024-100/`. **Optional**: Einzelne
   * Einträge – regelmäßig Berichtigungen – führt die Trefferliste ohne Verweis auf eine Detailseite.
   * Sie werden trotzdem erfasst, nur eben allein aus den Listenangaben.
   */
  detailPath?: string;
  /** Fundstelle, wie die Liste sie druckt: `2024 S. 682` bzw. `2024 Nr. 100`. */
  reference: string;
  volume: number;
  /** Gedruckte Seite (GVBl.) bzw. laufende Nummer (BayMBl.). */
  position: number;
  /** Verkündungsdatum – das für die Stichtagsprüfung maßgebliche Datum. */
  publishedAt?: string;
  title: string;
  /** Gliederungsnummern der Spalte „Gl-Nr.“; die Liste führt gelegentlich mehrere. */
  gliederungsnummern: string[];
  /** Ausfertigungs- (GVBl.) bzw. Erlassdatum (BayMBl.) – nie Ersatz für das Verkündungsdatum. */
  enactmentDate?: string;
  ressort?: string;
}

export interface ListingPage {
  rows: ListingRow[];
  /**
   * Zahl der Ergebniszeilen auf dieser Seite – einschließlich der Zeilen ohne Detailverweis. Nur
   * daran darf die Blätterlogik hängen: Zählte sie die verwertbaren Zeilen, bräche sie mitten im
   * Jahrgang ab, sobald eine Berichtigung ohne Detailseite darunter ist.
   */
  rowsSeen: number;
  /** Trefferzahl, wie die Seite sie selbst angibt (`5.405 Treffer gefunden`). */
  totalHits?: number;
}

const DETAIL_HREF = /href="(\/(?:gvbl|baymbl)\/(\d{4})-(\d+)\/?)"/u;
/** Fundstelle der Trefferliste: `2023 S. 586` (GVBl.) bzw. `2024 Nr. 100` (BayMBl.). */
const REFERENCE = /^(\d{4})\s+(?:S\.|Nr\.)\s*(\d+)/u;

/** Eine Trefferliste (GVBl. oder BayMBl.) in Zeilen zerlegen. */
export function parseListingPage(html: string): ListingPage {
  const rows: ListingRow[] = [];
  let rowsSeen = 0;
  for (const match of html.matchAll(ROW)) {
    const body = match[1]!;
    const cells = new Map<string, string>();
    for (const cell of body.matchAll(CELL)) cells.set(cell[1]!.toLowerCase(), cell[2]!);
    const reference = htmlToText(cells.get('fundstelle') ?? '');
    if (reference === '') continue;
    rowsSeen += 1;
    const title = htmlToText(cells.get('titel') ?? '');
    if (title === '') continue;
    const href = DETAIL_HREF.exec(body);
    const fromReference = REFERENCE.exec(reference);
    const volume = Number.parseInt(href?.[2] ?? fromReference?.[1] ?? '', 10);
    const position = Number.parseInt(href?.[3] ?? fromReference?.[2] ?? '', 10);
    if (!Number.isInteger(volume) || !Number.isInteger(position)) continue;
    const gliederung = htmlToText(cells.get('gl-nr.') ?? '');
    const enactment = parseGermanDate(htmlToText(cells.get('ausfertigung') ?? cells.get('erlass') ?? ''));
    const published = parseGermanDate(htmlToText(cells.get('verkündung') ?? ''));
    const ressort = htmlToText(cells.get('ressort') ?? '');
    rows.push({
      ...(href ? { detailPath: href[1]!.endsWith('/') ? href[1]! : `${href[1]!}/` } : {}),
      reference,
      volume,
      position,
      ...(published ? { publishedAt: published } : {}),
      title,
      gliederungsnummern: splitGliederungsnummern(gliederung),
      ...(enactment ? { enactmentDate: enactment } : {}),
      ...(ressort === '' ? {} : { ressort }),
    });
  }
  const total = /result-count"[^>]*>\s*([\d.,]+)\s*Treffer/u.exec(html)?.[1];
  return { rows, rowsSeen, ...(total === undefined ? {} : { totalHits: Number.parseInt(total.replace(/[.,]/gu, ''), 10) }) };
}

/**
 * Die Spalte „Gl-Nr.“ führt gelegentlich mehrere Nummern (ein Mantelgesetz ändert mehrere
 * Vorschriften). Getrennt wird an Leerraum und Komma; alles, was nicht wie eine BayRS-Nummer aussieht,
 * wird verworfen statt geraten.
 */
export function splitGliederungsnummern(value: string): string[] {
  const seen = new Set<string>();
  for (const candidate of value.split(/[\s,;]+/u)) {
    const trimmed = candidate.trim().replace(/[.,;]+$/u, '');
    if (trimmed === '' || !/^\d[0-9A-Za-zÄÖÜäöü]*(?:[.\-/][0-9A-Za-zÄÖÜäöü]+)*$/u.test(trimmed)) continue;
    // Eine reine Jahreszahl oder Seitenzahl ist keine Gliederungsnummer.
    if (/^\d+$/u.test(trimmed) && trimmed.length <= 4) continue;
    seen.add(trimmed);
  }
  return [...seen];
}
