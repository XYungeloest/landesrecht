/**
 * Parser der amtlichen Register Schleswig-Holsteins:
 *
 *   „Systematische Übersicht“ (GVOBl.)   Register der geltenden Gesetze und Verordnungen mit
 *                                        vollständiger Änderungshistorie, Stand Jahresende 2024
 *   „Erlassverzeichnis“ (Amtsbl.)        Register der geltenden Verwaltungsvorschriften mit
 *                                        Gliederungsnummer, Stand 30. September 2024
 *
 * Beide Register führen je Vorschrift einen Kopf (Ressort, Gliederungsnummer, Titel, Ausfertigung mit
 * Fundstelle) und darunter eingerückte Ereigniszeilen. Der Parser arbeitet ausschließlich auf diesen
 * Zeilen; er kennt keine Seitenstruktur außer Kopf- und Fußzeilen, die er überspringt.
 *
 * Fail-closed in drei Punkten:
 *   1. Eine Ereigniszeile, die zu keinem bekannten Muster passt, wird als `unknown` mit ihrem Rohtext
 *      erfasst – nicht verworfen, nicht geraten.
 *   2. Ein Datum wird nur übernommen, wenn die Zeile es nennt; es wird nie aus dem Kontext ergänzt.
 *   3. Die in Schleswig-Holstein übliche Kombination `außer Kraft <Datum>` + später
 *      `geänd./entfristet` wird ausdrücklich erkannt. Das Außerkrafttreten ist dann entschärft und gilt
 *      nicht als Ende der Vorschrift (`defused-by-entfristung`). Ein reiner „außer Kraft“-Parser würde
 *      hunderte weiterhin geltender Landesverordnungen fälschlich als erloschen führen.
 *
 * Die Module hier liefern nur Struktur und Einordnung; Ereigniskennung, Beweisklasse und Sortierung
 * entstehen in `ledger.ts`, das Zusammenführen in `build.ts`.
 */
import type { EventSubtype, EventType } from './ledger.ts';

/** Eine Zeile einer Registerseite mit Herkunft und Einrückung. */
export interface RegisterLine {
  page: number;
  line: number;
  indent: number;
  text: string;
}

/** Ein Registereintrag: Kopfdaten der Vorschrift plus die zugehörigen (zusammengefügten) Ereigniszeilen. */
export interface RegisterEntry {
  ressort?: string;
  gliederungsnummer: string;
  title: string;
  abbreviation?: string;
  /** Art der Ausfertigung laut Register: `Vom`, `Bek.`, `Erl.`, `Rd.Erl.`, `Gem.Erl.` … */
  issuedAs?: string;
  issuedDate?: string;
  /** Fundstelle der Stammfassung, so wie das Register sie führt. */
  citation: string;
  page: number;
  line: number;
  eventLines: RegisterLine[];
}

export interface RegisterParseResult {
  entries: RegisterEntry[];
  /** Gliederungsnummern ohne Titel und ohne Ausfertigung (Platzhalter im Register). */
  emptyEntries: { gliederungsnummer: string; page: number; line: number }[];
  /** Gliederungsüberschriften ohne Vorschrift – nur gezählt, nicht als Ereignis geführt. */
  headings: number;
  /** Übersprungene Kopf-/Fußzeilen. */
  skipped: number;
}

/* ------------------------------------------------------------------ Datums- und Fundstellenformate */

const MONTHS: Readonly<Record<string, string>> = {
  januar: '01', februar: '02', märz: '03', maerz: '03', april: '04', mai: '05', juni: '06',
  juli: '07', august: '08', september: '09', oktober: '10', november: '11', dezember: '12',
};

const NUMERIC_DATE = /(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})/u;
const VERBOSE_DATE = /(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s+(\d{4})/u;

function isoDate(day: string, month: string, year: string): string | undefined {
  const dayNumber = Number(day);
  const monthNumber = Number(month);
  const yearNumber = Number(year);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) return undefined;
  if (yearNumber < 1800 || yearNumber > 2100) return undefined;
  const value = `${year}-${String(monthNumber).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
  // Kalendarische Gegenprobe: ein erfundenes Datum wie 31.2. darf nicht durchgehen.
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? undefined : value;
}

/**
 * Erstes Datum in `text` als ISO-Datum. Beherrscht `8.3.2024`, `08.03.2024` und `22. Oktober 2018`.
 * Liefert `undefined`, wenn der Text kein Datum nennt – es wird keines erfunden.
 */
export function parseGermanDate(text: string): string | undefined {
  const verbose = VERBOSE_DATE.exec(text);
  const numeric = NUMERIC_DATE.exec(text);
  const verboseIndex = verbose?.index ?? Number.MAX_SAFE_INTEGER;
  const numericIndex = numeric?.index ?? Number.MAX_SAFE_INTEGER;
  if (verbose && verboseIndex <= numericIndex) {
    const month = MONTHS[verbose[2]!.toLowerCase()];
    if (month) return isoDate(verbose[1]!, month, verbose[3]!);
  }
  if (numeric) return isoDate(numeric[1]!, numeric[2]!, numeric[3]!);
  return undefined;
}

const GAZETTE_CITATION =
  /(?:GVOBl\.|Amtsbl\.|GS\.|RGBl\.|BGBl\.|Reg\.Amtsbl\.|GVBl\.)(?:\s*Schl\.-H\.)?(?:\s*(?:I+|I\s*)?)?(?:\s*\d{4})?\s*S\.\s*\d+(?:\s*,\s*\d+)*/gu;
const ELECTRONIC_CITATION = /(?:GVOBl\.|Amtsbl\.)(?:\s*Schl\.-H\.)?\s*\d{4}\/\d{1,4}/gu;

/**
 * Fundstelle(n) einer Registerzeile. Erkennt die drei in Schleswig-Holstein üblichen Formen
 * (`GVOBl. Schl.-H. S. 1282`, `GVOBl. 2024 S. 75`, `Amtsbl. Schl.-H. 2024/128`) und normalisiert
 * nur den Leerraum – der Wortlaut bleibt der des Registers.
 */
export function extractCitations(text: string): string[] {
  return [...new Set(locateCitations(text).map((entry) => entry.citation))];
}

/**
 * Fundstellen mit ihrer Position in der Zeile.
 *
 * Eine Registerzeile kann mehrere Ereignisse tragen:
 * `geänd. (LVO v. 27.11.2023, GVOBl. S. 631), aufgehoben (Art. 2 LVO v. 19.12.2023, GVOBl. 2024 S. 75)`
 * nennt zwei Fundstellen, und nur die zweite gehört zur Aufhebung. Ohne Position bekäme jedes
 * Ereignis der Zeile die erste – also die falsche.
 */
export function locateCitations(text: string): Array<{ citation: string; index: number }> {
  return [...text.matchAll(GAZETTE_CITATION), ...text.matchAll(ELECTRONIC_CITATION)]
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .map((match) => ({ citation: match[0].replace(/\s+/gu, ' ').trim(), index: match.index ?? 0 }));
}

/**
 * Die Fundstelle, die zum Ereignis gehört: die erste ab dem Schlüsselwort, das den Ereignistyp
 * bestimmt hat. Steht dahinter keine mehr, gilt die erste der Zeile – dann trägt die Zeile nur ein
 * Ereignis, oder die Fundstelle steht ausnahmsweise davor.
 */
export function citationForEvent(text: string, keywordEnd: number | undefined): string | undefined {
  const located = locateCitations(text);
  if (located.length === 0) return undefined;
  if (keywordEnd === undefined) return located[0]!.citation;
  return (located.find((entry) => entry.index >= keywordEnd) ?? located[0]!).citation;
}

/**
 * Fundstelle des Erlassverzeichnisses: Die rechte Spalte führt nur `Seite` oder `Jahrgang/Seite`.
 * Sie wird in die amtliche Zitierform überführt, ohne den Jahrgang zu erfinden.
 */
export function amtsblattCitation(column: string): string | undefined {
  const withYear = /^(\d{4})\/(\d{1,4})$/u.exec(column.trim());
  if (withYear) return `Amtsbl. Schl.-H. ${withYear[1]} S. ${withYear[2]}`;
  const pageOnly = /^(\d{1,4})$/u.exec(column.trim());
  return pageOnly ? `Amtsbl. Schl.-H. S. ${pageOnly[1]}` : undefined;
}

/* ------------------------------------------------------------------------- Zeilenklassifikation */

export interface ClassifiedLine {
  eventType: EventType;
  subtype?: EventSubtype;
  eventDate?: string;
  effectiveDate?: string;
  citations: string[];
  /** Teilbereich der Vorschrift, auf den sich das Ereignis bezieht (`§ 59 Abs. 2a`, `Teile 2, 4, …`). */
  scope?: string;
  /** Die Zeile hebt eine Befristung auf (`geänd./entfristet`, `Befristung aufgeh.`, `Keine Befristung`). */
  removesExpiry: boolean;
  /** Gliederungsnummer, die die Zeile ausdrücklich als Ziel nennt (`Art. 1 ändert Gl.Nr. 100-5`). */
  referencedGliederungsnummer?: string;
  /**
   * Ende des Schlüsselworts, das den Ereignistyp bestimmt hat. Trägt eine Zeile mehrere Ereignisse,
   * gehört zum Ereignis die erste Fundstelle **ab** dieser Stelle, nicht die erste der Zeile.
   */
  keywordEnd?: number;
}

const BULLET = /^[•·∙-]\s*/u;

/** Entfernt den Aufzählungspunkt und normalisiert Leerraum – der Wortlaut bleibt erhalten. */
export function normalizeEventLine(text: string): string {
  return text.replace(BULLET, '').replace(/\s+/gu, ' ').trim();
}

/**
 * Teilbereich einer Vorschrift, auf den sich ein Ereignis bezieht. Nur ein struktureller Verweis
 * (`§ 59 Abs. 2a`, `Teile 2, 4 …`, `Anl. 1`, `teilw.`) zählt als Teilbereich. Steht vor dem
 * Schlüsselwort dagegen ein **eigenes** Ereignis mit Fundstelle – wie in
 * `geänd. (LVO v. 27.11.2023, GVOBl. S. 631), aufgehoben (Art. 2 LVO v. 19.12.2023, …)` –, dann ist das
 * kein Teilbereich, und die Aufhebung betrifft die ganze Vorschrift. Diese Unterscheidung entscheidet
 * darüber, ob eine Vorschrift als baseline-only-Kandidat geführt wird.
 */
const STRUCTURAL_REFERENCE = /(?:§|Art\.|Artikel|Anl\.|Anlage|Teile?|Nr\.|Nummer|Abschnitt|Überschrift|Kapitel|Buchst\.|Ziffern?|Ziff\.|teilw\.|teilweise)/u;

export function scopeBefore(prefix: string): string | undefined {
  const trimmed = prefix.replace(/[\s,;]+$/u, '').trim();
  if (trimmed === '') return undefined;
  if (trimmed.includes('(')) return undefined;
  return STRUCTURAL_REFERENCE.test(trimmed) ? trimmed : undefined;
}

/** Datum nach einem Schlüsselwort, aber vor der Klammer; sonst das erste Datum der Zeile. */
function dateAfterKeyword(text: string, keywordEnd: number): string | undefined {
  const tail = text.slice(keywordEnd);
  const beforeParenthesis = tail.split('(')[0] ?? '';
  return parseGermanDate(beforeParenthesis) ?? parseGermanDate(tail);
}

/**
 * Ordnet eine Registerzeile einem Ereignistyp zu. Die Reihenfolge der Prüfungen ist fachlich bindend:
 * `Befristung aufgeh.` ist eine Entfristung und keine Aufhebung, `geänd./entfristet` eine Änderung mit
 * Entfristungswirkung, und erst danach greifen die allgemeinen Muster.
 */
export function classifyRegisterLine(rawText: string): ClassifiedLine {
  const text = normalizeEventLine(rawText);
  const citations = extractCitations(text);
  const base = { citations, removesExpiry: false } as const;

  // 1 – Entfristungen. Sie heben eine Befristung auf und müssen vor jedem Aufhebungsmuster greifen.

  // 1a – Ausdrückliche Feststellung unbefristeter Geltung (`gilt unbefristet (§ 62 Abs. 2 Nr. 2 LVwG)`).
  // Kein Ereignis im engeren Sinn, aber ein Beleg für den Fortbestand – und er hebt eine vorherige
  // Befristung auf, genau wie eine Entfristung.
  if (/\bgilt\s+unbefristet\b/iu.test(text)) {
    return {
      ...base,
      eventType: 'amend',
      subtype: 'unbefristet',
      removesExpiry: true,
      ...(parseGermanDate(text) ? { eventDate: parseGermanDate(text)! } : {}),
    };
  }

  if (/Befristung\s+aufgeh\.?/iu.test(text) || /\bkeine\s+Befristung\b/iu.test(text) || /entfristet\b/iu.test(text) || /\bgestrichen\/entfristet\b/iu.test(text)) {
    const scope = scopeBefore(/^(.*?)\s*(?:geänd\.|gestrichen)?\/?entfristet\b/u.exec(text)?.[1] ?? '');
    return {
      ...base,
      eventType: 'amend',
      subtype: 'entfristung',
      removesExpiry: true,
      ...(parseGermanDate(text) ? { eventDate: parseGermanDate(text)! } : {}),
      ...(scope ? { scope } : {}),
    };
  }

  // 2 – Befristungsverlängerungen (Erlassverzeichnis). Das genannte Datum ist das neue Fristende.
  const extension = /Verlängerung\s+der\s+Geltungsdauer\s+bis\s+zum\s+(\d{1,2}\s*\.\s*\d{1,2}\s*\.\s*\d{4}|\d{1,2}\.\s*[A-Za-zÄÖÜäöüß]+\s+\d{4})/iu.exec(text);
  if (extension) {
    const until = parseGermanDate(extension[1]!);
    const decided = parseGermanDate(text.slice((extension.index ?? 0) + extension[0].length));
    return {
      ...base,
      eventType: 'amend',
      subtype: 'befristungsverlaengerung',
      ...(decided ? { eventDate: decided } : {}),
      ...(until ? { effectiveDate: until } : {}),
    };
  }
  if (/\bweiter\s+befristet\b/iu.test(text) || /\bVerlängerung\s+Fristablauf\b/iu.test(text)) {
    return { ...base, eventType: 'amend', subtype: 'befristungsverlaengerung', ...(parseGermanDate(text) ? { eventDate: parseGermanDate(text)! } : {}) };
  }
  if (/\bWeitergeltung\s+der\s+Befristung\b/iu.test(text)) {
    return { ...base, eventType: 'amend', subtype: 'kollektive-weitergeltung', ...(parseGermanDate(text) ? { eventDate: parseGermanDate(text)! } : {}) };
  }

  // 3 – Neufassung („Bekanntmachung der geltenden Fassung“).
  if (/Bek\.\s*d\.\s*g\.\s*F\./iu.test(text)) {
    const keyword = /Bek\.\s*d\.\s*g\.\s*F\.\s*(?:vom|v\.)?/iu.exec(text)!;
    const date = dateAfterKeyword(text, (keyword.index ?? 0) + keyword[0].length);
    return { ...base, eventType: 'recast', subtype: 'neufassung', ...(date ? { eventDate: date } : {}) };
  }

  // 3a – Neufassung in der Kurzform des Erlassverzeichnisses (`NF Erl. v. …`, `NF v. …`).
  // Zwischen `NF` und dem Datum kann der Gegenstand der Neufassung stehen: `NF Anl. Erl. v. …`,
  // `NF Anl. 1 und 2 Erl. v. …`, `NF Loseblattsammlung … Stand Dez. 1995`.
  const newVersion = /^NF\s+(?:Anl(?:age)?\.?(?:\s*\d+(?:\s*(?:,|und)\s*\d+)*)?\s+|Loseblattsammlung\s+)?(?:Bek\.|Erl\.|Rd\.Erl\.|Gem\.\s?Erl\.)?\s*(?:vom|v\.)\s*/iu.exec(text);
  if (newVersion) {
    const date = dateAfterKeyword(text, newVersion[0].length);
    return { ...base, eventType: 'recast', subtype: 'neufassung', ...(date ? { eventDate: date } : {}) };
  }

  // 3b – Aufhebung einer anderen Vorschrift durch einen Artikel dieses Gesetzes.
  const repealCommand = /Art\.\s*\d+[a-z]?\s+Aufhebung\s+Gl\.Nr\.\s*([0-9][0-9.\-]*)/iu.exec(text);
  if (repealCommand) {
    return { ...base, eventType: 'repeal', subtype: 'aenderungsbefehl', referencedGliederungsnummer: repealCommand[1]!.replace(/[.,;]$/u, '') };
  }

  // 4 – Aufhebung. `aufgehoben` (Systematische Übersicht) und `aufgeh.` (Erlassverzeichnis).
  const repeal = /(?:^|[\s,;])(?:aufgehoben|aufgeh\.)(?=$|[\s,;])/iu.exec(text);
  if (repeal) {
    const scope = scopeBefore(text.slice(0, repeal.index ?? 0));
    const date = dateAfterKeyword(text, (repeal.index ?? 0) + repeal[0].length);
    return {
      ...base,
      eventType: 'repeal',
      keywordEnd: (repeal.index ?? 0) + repeal[0].length,
      ...(scope ? { subtype: 'teilaufhebung' as EventSubtype, scope } : {}),
      ...(date ? { eventDate: date } : {}),
    };
  }

  // 5 – Außerkrafttreten / Ablauf einer Befristung.
  const expiry = /außer\s+Kraft/iu.exec(text);
  if (expiry) {
    const scope = scopeBefore(text.slice(0, expiry.index ?? 0));
    const date = dateAfterKeyword(text, (expiry.index ?? 0) + expiry[0].length);
    return {
      ...base,
      eventType: 'expire',
      keywordEnd: (expiry.index ?? 0) + expiry[0].length,
      ...(scope ? { subtype: 'teilausserkrafttreten' as EventSubtype, scope } : {}),
      ...(date ? { eventDate: date } : {}),
    };
  }

  // 6 – Ablauf der Wahlperiode (Erlassverzeichnis, Berufungen in den Landtag): Ende ohne Datum.
  if (/Ablauf\s+der\s+(?:Legislaturperiode|Wahlperiode)/iu.test(text) || /^Zeitablauf\b/iu.test(text)) {
    const year = /\b(19|20)\d{2}\b/u.exec(text)?.[0];
    return { ...base, eventType: 'expire', subtype: 'ablauf-legislaturperiode', ...(year ? { scope: `Ablauf ${year}` } : {}) };
  }

  // 7 – Ressortbezeichnungen: formale Anpassung, zugleich Beleg für den Fortbestand der Vorschrift.
  // `\s*` statt `\s+`: Das Register schreibt stellenweise `Ressortbezeichnungenersetzt` ohne Leerzeichen.
  if (/Zuständigkeiten\s+(?:und\s+Ressortbezeichnungen\s*)?(?:ersetzt|angepasst)/iu.test(text) || /Ressortbezeichnungen\s*(?:ersetzt|angepasst)/iu.test(text)) {
    return { ...base, eventType: 'amend', subtype: 'ressortbezeichnung', ...(parseGermanDate(text) ? { eventDate: parseGermanDate(text)! } : {}) };
  }

  // Übertragung von Zuständigkeiten auf eine andere Stelle: eigener Vorgang, keine bloße
  // Bezeichnungsanpassung – und zugleich ein Beleg, dass die Vorschrift zu diesem Zeitpunkt galt.
  if (/Zuständigkeiten\s+übertragen/iu.test(text)) {
    return { ...base, eventType: 'amend', subtype: 'zustaendigkeitsuebertragung', ...(parseGermanDate(text) ? { eventDate: parseGermanDate(text)! } : {}) };
  }

  // 8 – Berichtigung.
  if (/^ber\.\s/iu.test(text) || /(?:^|[\s,;])ber\.\s+(?:GVOBl|Amtsbl|S\.)/u.test(text)) {
    return { ...base, eventType: 'correction', subtype: 'berichtigung', ...(parseGermanDate(text) ? { eventDate: parseGermanDate(text)! } : {}) };
  }

  // 9 – Änderungsbefehl eines Artikelgesetzes auf eine andere Gliederungsnummer.
  const command = /Art\.\s*\d+[a-z]?\s+(?:ändert|ersetzt)\s+Gl\.Nr\.\s*([0-9][0-9.\-]*)/iu.exec(text);
  if (command) {
    return { ...base, eventType: 'amend', subtype: 'aenderungsbefehl', referencedGliederungsnummer: command[1]!.replace(/[.,;]$/u, '') };
  }

  // 10 – Inkrafttreten / Übergangsrecht als eigene Artikelzeile.
  if (/^Art\.\s*\d+[a-z]?\s+Inkrafttreten/iu.test(text) || /^Inkrafttreten\b/iu.test(text)) {
    return { ...base, eventType: 'commencement', ...(parseGermanDate(text) ? { eventDate: parseGermanDate(text)! } : {}) };
  }
  if (/^(?:Art\.\s*\d+[a-z]?\s+)?(?:Übergangs|Schluss)(?:vorschriften|regelungen|bestimmungen)?\b/iu.test(text)) {
    return { ...base, eventType: 'publication-only' };
  }

  // 10a – redaktionelle Hinweiszeilen des Registers (keine Rechtsänderung).
  if (/^Hinweis\b/iu.test(text)) {
    return { ...base, eventType: 'publication-only' };
  }

  // 11 – Änderungen jeder Art. Bewusst als letztes Muster vor `unknown`.
  const amendment = /(?:^|[\s,;/])(geänd[.,]|geändert|eingef\.|eingefügt|erg\.|ergänzt|ersetzt|gestrichen|neu\s+gefasst|angefügt|umbenannt|berichtigt)(?=$|[\s,;.)/])/iu.exec(text);
  if (amendment) {
    const scope = scopeBefore(text.slice(0, amendment.index ?? 0));
    const keywordEnd = (amendment.index ?? 0) + amendment[0].length;
    const date = dateAfterKeyword(text, keywordEnd);
    return {
      ...base,
      eventType: 'amend',
      ...(date ? { eventDate: date } : {}),
      ...(scope ? { scope } : {}),
    };
  }

  // 12 – bloße Artikelüberschrift eines Artikelgesetzes (`Art. 5 Kostenerstattung`): keine Rechtsfolge
  //       für eine andere Vorschrift, aber auch keine unbekannte Zeile.
  if (/^Art\.\s*\d+[a-z]?\s+[A-ZÄÖÜ]\S/u.test(text)) {
    return { ...base, eventType: 'publication-only' };
  }

  return { ...base, eventType: 'unknown' };
}

/* --------------------------------------------------------------------------- Blockbildung (roh) */

const SKIP_PATTERNS: readonly RegExp[] = [
  /^\s*$/u,
  /^\s*Zuständigkeit\b/u,
  /^\s*zuständiges\s*$/u,
  /^\s*Ressort\s+Gl\.Nr\./u,
  /^\s*Ressort\s*$/u,
  /^\s*Gl\.Nr\.\s*$/u,
  /^\s*Titel\s*$/u,
  /^\s*\(Jahr\/\)\s*$/u,
  /^\s*Seite\s*$/u,
  /^\s*Systematische\s+Übersicht\s*$/u,
  /^\s*Stand:\s/u,
  /^\s*Die\s+im\s+Jahr/u,
  /^\s*\d{1,4}\s*$/u,
  /^\s*\d{1,3}\s+s\.\s*auch\b/u,
];

function skipLine(text: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(text));
}

function indentOf(text: string): number {
  return text.length - text.trimStart().length;
}

/** Abkürzung aus dem Titel: `(Landesverfassungsgerichtsgesetz - LVerfGG)` → `LVerfGG`. */
export function extractAbbreviation(title: string): string | undefined {
  const parenthesis = /\(([^()]{2,120})\)/u.exec(title);
  if (!parenthesis) return undefined;
  const inner = parenthesis[1]!.trim();
  const dashed = inner.split(/\s+[–-]\s+/u);
  const candidate = (dashed.length > 1 ? dashed[dashed.length - 1]! : inner).trim();
  return /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9.\-–/§ ]{1,40}$/u.test(candidate) && /[A-ZÄÖÜ].*[A-ZÄÖÜ]/u.test(candidate) ? candidate : undefined;
}

interface BlockShape {
  ressort?: string;
  gliederungsnummer: string;
  firstTitlePart: string;
  page: number;
  line: number;
  indent: number;
}

interface RegisterGrammar {
  /** Erkennt den Kopf eines Eintrags (Ressort, Gliederungsnummer, Titelanfang). */
  matchHeader(text: string): BlockShape | undefined;
  /** Erkennt die Ausfertigungszeile und trennt damit Titel von Ereigniszeilen. */
  matchIssue(text: string): { issuedAs: string; issuedDate?: string; citation: string; column?: string } | undefined;
  /** Ist die Zeile die Fortsetzung der vorigen Ereigniszeile? */
  isContinuation(text: string, previousIndent: number): boolean;
  /**
   * Beginnt hier die Ereignisliste, obwohl keine eigene Ausfertigungszeile gefunden wurde? Im
   * Erlassverzeichnis tragen einzelne Einträge ihr Datum im Titel („Tarifvertrag … vom 24. Februar
   * 1972“) und setzen sofort mit Aufzählungspunkten fort.
   */
  startsEvents?(text: string): boolean;
}

function parseWithGrammar(pages: readonly { page: number; text: string }[], grammar: RegisterGrammar): RegisterParseResult {
  const entries: RegisterEntry[] = [];
  const emptyEntries: RegisterParseResult['emptyEntries'] = [];
  let headings = 0;
  let skipped = 0;

  let open: { shape: BlockShape; titleParts: string[]; issue?: ReturnType<RegisterGrammar['matchIssue']>; issueIndent: number; eventLines: RegisterLine[]; lastEventIndent: number } | undefined;

  const close = (): void => {
    if (!open) return;
    const title = open.titleParts.join(' ').replace(/\s+/gu, ' ').trim();
    // Eine Gliederungsnummer mit Punkt (Verwaltungsvorschriften) oder Bindestrich (Gesetze und
    // Verordnungen) bezeichnet immer eine Vorschrift; eine reine Zahl ist eine Gliederungsüberschrift.
    const isNorm = /[.\-]/u.test(open.shape.gliederungsnummer);
    if (!isNorm || title === '') {
      if (isNorm) emptyEntries.push({ gliederungsnummer: open.shape.gliederungsnummer, page: open.shape.page, line: open.shape.line });
      else headings += 1;
      open = undefined;
      return;
    }
    // Einträge ohne eigene Ausfertigungszeile bleiben im Bestand, aber ohne Datum und ohne Fundstelle –
    // beides wird nicht aus dem Titel erraten.
    const issue = open.issue ?? { issuedAs: '', citation: '' };
    const abbreviation = extractAbbreviation(title);
    entries.push({
      ...(open.shape.ressort ? { ressort: open.shape.ressort } : {}),
      gliederungsnummer: open.shape.gliederungsnummer,
      title,
      ...(abbreviation ? { abbreviation } : {}),
      ...(issue.issuedAs !== undefined && issue.issuedAs !== '' ? { issuedAs: issue.issuedAs } : {}),
      ...(issue.issuedDate ? { issuedDate: issue.issuedDate } : {}),
      citation: issue.citation,
      page: open.shape.page,
      line: open.shape.line,
      eventLines: open.eventLines,
    });
    open = undefined;
  };

  for (const { page, text } of pages) {
    for (const [index, rawLine] of text.split('\n').entries()) {
      const lineNumber = index + 1;
      if (skipLine(rawLine)) {
        skipped += 1;
        continue;
      }
      const header = grammar.matchHeader(rawLine);
      if (header) {
        close();
        open = { shape: { ...header, page, line: lineNumber }, titleParts: header.firstTitlePart === '' ? [] : [header.firstTitlePart], issueIndent: Number.MAX_SAFE_INTEGER, eventLines: [], lastEventIndent: Number.MAX_SAFE_INTEGER };
        continue;
      }
      if (!open) continue;
      const indent = indentOf(rawLine);
      const trimmed = rawLine.trim();
      if (!open.issue) {
        const issue = grammar.matchIssue(rawLine);
        if (issue) {
          open.issue = issue;
          open.issueIndent = indent;
          continue;
        }
        if (grammar.startsEvents?.(rawLine) === true) {
          // Kopf ohne eigene Ausfertigungszeile: Der Eintrag wird geführt, aber ohne Ausfertigungsdatum
          // und ohne Fundstelle der Stammfassung – beides wird nicht aus dem Titel erraten.
          open.issue = { issuedAs: '', citation: '' };
          open.issueIndent = indent;
        } else {
          open.titleParts.push(trimmed);
          continue;
        }
      }
      // Auch die Ausfertigungszeile bricht um („Vom 13.12.1949 i.d.F. des Gesetzes … / Schleswig-Holstein
      // vom 13.6.1990, GVOBl. S. 391“). Solange noch kein Ereignis erfasst ist, gehört eine Zeile ohne
      // erkennbares Ereignismuster auf gleicher oder geringerer Einrückung noch zum Kopf.
      if (open.eventLines.length === 0 && indent <= open.issueIndent && classifyRegisterLine(trimmed).eventType === 'unknown') {
        if (open.issue.citation === '') {
          const citation = extractCitations(trimmed)[0];
          if (citation) open.issue.citation = citation;
        }
        continue;
      }
      if (open.eventLines.length > 0 && grammar.isContinuation(rawLine, open.lastEventIndent)) {
        const last = open.eventLines[open.eventLines.length - 1]!;
        last.text = `${last.text} ${trimmed}`;
        continue;
      }
      open.eventLines.push({ page, line: lineNumber, indent, text: trimmed });
      open.lastEventIndent = indent;
    }
  }
  close();
  return { entries, emptyEntries, headings, skipped };
}

/* ------------------------------------------------------ Systematische Übersicht (GVOBl., Gesetze) */

const SYS_HEADER = /^\s*(?:(?<ressort>[A-ZÄÖÜ][A-Za-z0-9ÄÖÜäöüß./-]{0,7}(?:\s+[A-Za-z0-9ÄÖÜäöüß./-]{1,7}){0,3})\s{2,})?(?<gl>(?:B\s+)?\d{1,4}(?:-\d{1,4}[a-z]?)*)\s{2,}(?<title>\S.*)$/u;
const SYS_ISSUE = /^\s*(?<issuedAs>Vom|vom)\s+(?<rest>\S.*)$/u;

export function parseSystematicOverview(pages: readonly { page: number; text: string }[]): RegisterParseResult {
  return parseWithGrammar(pages, {
    matchHeader(text) {
      // Ein Eintrag beginnt links am Blattrand oder in der Gl.Nr.-Spalte; Fortsetzungen des Titels
      // stehen weiter rechts und dürfen nie als neuer Eintrag gelesen werden.
      if (indentOf(text) > 24) return undefined;
      const match = SYS_HEADER.exec(text);
      if (!match?.groups) return undefined;
      const gl = match.groups.gl!.replace(/\s+/gu, ' ').trim();
      return { ...(match.groups.ressort ? { ressort: match.groups.ressort.trim() } : {}), gliederungsnummer: gl, firstTitlePart: match.groups.title!.trim(), page: 0, line: 0, indent: indentOf(text) };
    },
    matchIssue(text) {
      const match = SYS_ISSUE.exec(text);
      if (!match?.groups) return undefined;
      const rest = match.groups.rest!;
      const date = parseGermanDate(rest);
      const citations = extractCitations(rest);
      return { issuedAs: 'Vom', ...(date ? { issuedDate: date } : {}), citation: citations[0] ?? '' };
    },
    isContinuation(text, previousIndent) {
      return indentOf(text) > previousIndent;
    },
  });
}

/* ----------------------------------------------- Erlassverzeichnis (Amtsbl., Verwaltungsvorschriften) */

const VWV_HEADER = /^\s*(?:(?<ressort>[A-ZÄÖÜ][A-Za-z0-9ÄÖÜäöüß./-]{0,7}(?:\s+[A-Za-z0-9ÄÖÜäöüß./-]{1,7}){0,3})\s{2,})?(?<gl>\d{1,4}(?:\.\d{1,3})?)\s{2,}(?<title>\S.*)$/u;
const VWV_ISSUE = /^\s*(?:Anl\.\s*\d*\s+)?(?<issuedAs>(?:Gem\.\s?)?(?:Rd\.Erl\.|Erl\.|Bek\.|Beschl\.|Verf\.|AV)(?:\s*\(Bek\.\))?)\s+(?:vom|v)\.?\s+(?<rest>\S.*)$/u;

export function parseErlassverzeichnis(pages: readonly { page: number; text: string }[]): RegisterParseResult {
  return parseWithGrammar(pages, {
    matchHeader(text) {
      if (indentOf(text) > 22) return undefined;
      const match = VWV_HEADER.exec(text);
      if (!match?.groups) return undefined;
      return { ...(match.groups.ressort ? { ressort: match.groups.ressort.trim() } : {}), gliederungsnummer: match.groups.gl!, firstTitlePart: match.groups.title!.trim(), page: 0, line: 0, indent: indentOf(text) };
    },
    matchIssue(text) {
      const match = VWV_ISSUE.exec(text);
      if (!match?.groups) return undefined;
      const rest = match.groups.rest!;
      const date = parseGermanDate(rest);
      const column = /\s(\d{4}\/\d{1,4}|\d{1,4})\s*$/u.exec(rest)?.[1] ?? '';
      return {
        issuedAs: match.groups.issuedAs!.replace(/\s+/gu, ' ').trim(),
        ...(date ? { issuedDate: date } : {}),
        citation: amtsblattCitation(column) ?? '',
        column,
      };
    },
    isContinuation(text, _previousIndent) {
      // Im Erlassverzeichnis beginnt jede Ereigniszeile mit einem Aufzählungspunkt; alles andere ist
      // Fortsetzung der vorigen Zeile (typisch: das Datum der Bekanntmachung in der Folgezeile).
      return !BULLET.test(text.trim());
    },
    startsEvents(text) {
      return BULLET.test(text.trim());
    },
  });
}

/** Fundstelle einer Ereigniszeile des Erlassverzeichnisses aus der rechten Spalte. */
export function erlassverzeichnisEventCitation(text: string): string {
  const column = /\s(\d{4}\/\d{1,4}|\d{1,4})\s*$/u.exec(text)?.[1] ?? '';
  return amtsblattCitation(column) ?? '';
}
