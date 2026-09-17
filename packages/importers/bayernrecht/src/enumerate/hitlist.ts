/**
 * Trefferliste der Portalfacette `NORMTYP` (`/Search/Filter/NORMTYP/<typ>`, Folgeseiten
 * `/Search/Page/<n>`). Sie ist die zweite, vom Fortführungsnachweis unabhängige Enumerationsquelle:
 * Nur sie nennt zu jeder Dokument-ID den amtlich geführten **Normtyp**, und nur sie zählt den
 * vollständigen Portalbestand (2.413 Vorschriften gegenüber 2.311 im Fortführungsnachweis).
 *
 * Aufbau einer Seite (belegt an echten Antworten, Fixtures unter `tests/fixtures/bayernrecht/`):
 *
 *   <p id="readable">241 Treffer in 241 Gesetze</p>
 *   <li class="hitlistItem"> … <p class="hltitel"><a href="/Content/Document/BayAbmG?hl=true">…</a></p>
 *                              <p class="hlSubTitel">Rechtsstand: 01.08.2015</p> … </li>
 *   <div id="pager"> … <a href="/Search/Page/2">2</a> … </div>
 *
 * Zehn Treffer je Seite, keine einstellbare Seitengröße. Der Trefferzähler ist die einzige Angabe der
 * Sollmenge; fehlt er, ist die Seite keine Trefferliste (etwa die Meldung „Bitte führen Sie eine Suche
 * aus.“, die das Portal ohne Sitzungszustand ausliefert) – dann wird ein Fehler geworfen, nie eine
 * leere Liste als Erfolg gemeldet.
 */
import { isDocumentId, textOf } from './portal.ts';

/** Treffer je Seite; nicht einstellbar, aus den Antworten des Portals abgelesen. */
export const HITLIST_PAGE_SIZE = 10;

export interface HitlistEntry {
  documentId: string;
  title: string;
  /** „Rechtsstand: 04.08.1997“ der Trefferzeile, als ISO-Datum; fehlt bei manchen Einträgen. */
  legalStatusDate?: string;
}

export interface HitlistPage {
  /** Sollmenge laut Trefferzähler der Seite. */
  total: number;
  /** Beschriftung des Trefferzählers, wörtlich (z. B. „241 Treffer in 241 Gesetze“). */
  totalLabel: string;
  entries: HitlistEntry[];
  /** Höchste im Seitenwähler genannte Seitenzahl (der Wähler zeigt ein Fenster, nicht alle Seiten). */
  maxPagerPage: number;
  /** Aktive Seite laut Seitenwähler; fehlt, wenn es nur eine Seite gibt. */
  currentPage?: number;
}

/** „Bitte führen Sie eine Suche aus.“ – das Portal ohne Sitzungszustand. */
export function isEmptySearchState(html: string): boolean {
  return /Bitte\s+f(?:&#xFC;|ü)hren\s+Sie\s+eine\s+Suche\s+aus/u.test(html);
}

const GERMAN_DATE = /(\d{2})\.(\d{2})\.(\d{4})/u;

/** `04.08.1997` → `1997-08-04`; alles andere bleibt unübersetzt (kein geratenes Datum). */
export function parseGermanDate(value: string): string | undefined {
  const match = GERMAN_DATE.exec(value);
  if (!match) return undefined;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? undefined : iso;
}

export function parseHitlistPage(html: string): HitlistPage {
  if (isEmptySearchState(html)) throw new Error('Trefferliste ohne Sitzungszustand („Bitte führen Sie eine Suche aus.“) – die Facette wurde nicht gesetzt');
  const counter = /<p id="readable">([^<]*)<\/p>/u.exec(html);
  if (!counter) throw new Error('Trefferliste ohne Trefferzähler (<p id="readable">) – die Antwort ist keine Trefferliste');
  const totalLabel = textOf(counter[1]!);
  const totalMatch = /^(\d+)/u.exec(totalLabel);
  if (!totalMatch) throw new Error(`Trefferzähler ${JSON.stringify(totalLabel)} beginnt nicht mit einer Zahl`);
  const entries: HitlistEntry[] = [];
  for (const item of html.matchAll(/<li class="hitlistItem">([\s\S]*?)<\/li>/gu)) {
    const body = item[1]!;
    const link = /<a href="\/Content\/Document\/([^"?#]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/u.exec(body);
    if (!link) continue;
    const documentId = decodeURIComponent(link[1]!);
    if (!isDocumentId(documentId)) throw new Error(`Trefferzeile mit unbrauchbarer Dokument-ID ${JSON.stringify(documentId)}`);
    const entry: HitlistEntry = { documentId, title: textOf(link[2]!) };
    const status = /<p class="hlSubTitel">([\s\S]*?)<\/p>/u.exec(body);
    const date = status ? parseGermanDate(textOf(status[1]!)) : undefined;
    if (date) entry.legalStatusDate = date;
    entries.push(entry);
  }
  const pagerPages = [...html.matchAll(/href="\/Search\/Page\/(\d+)"/gu)].map((match) => Number.parseInt(match[1]!, 10));
  const current = /<li class="active"><a href="\/Search\/Page\/(\d+)">/u.exec(html);
  const page: HitlistPage = {
    total: Number.parseInt(totalMatch[1]!, 10),
    totalLabel,
    entries,
    maxPagerPage: pagerPages.length > 0 ? Math.max(...pagerPages) : 0,
  };
  if (current) page.currentPage = Number.parseInt(current[1]!, 10);
  return page;
}

/** Seitenzahl einer Trefferliste aus der Sollmenge – zehn Treffer je Seite, mindestens eine Seite. */
export function hitlistPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / HITLIST_PAGE_SIZE));
}
