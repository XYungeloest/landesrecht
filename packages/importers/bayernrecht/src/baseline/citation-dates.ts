/**
 * Datumsangaben aus dem Zitiervorschlag einer Verwaltungsvorschrift.
 *
 * **Warum das hier steht und nicht im Parser:** Die Norm-DTD führt `ausfertigungsdatum` als eigenes
 * Feld; die VwV-DTD tut das nicht – über 1 400 Verwaltungsvorschriften kämen sonst ohne
 * Ausfertigungsdatum aus dem Parser, und die Stichtagsprüfung müsste sie als „unklar“ führen. Dabei
 * steht das Datum in der Quelle, nur eben im Fließtext des Zitiervorschlags:
 *
 * ```text
 * Zitiervorschlag: Redaktionsrichtlinien (RedR) vom 16. Juni 2015 (AllMBl. S. 319),
 * die zuletzt durch Bekanntmachung vom 16. Dezember 2025 (BayMBl. Nr. 587) geändert worden ist
 * ```
 *
 * Aus Prosa ein Datum zu gewinnen ist eine **Schlussfolgerung**, keine Strukturinformation. Sie
 * gehört deshalb zur Stichtagsbegründung, wo sie als solche kenntlich bleibt – und nicht in den
 * Parser, der wiedergibt, was im XML steht.
 *
 * Die Regel ist eng gefasst: Das **erste** „vom <Datum>“ ist die Ausfertigung der Stammfassung, ein
 * Datum nach „zuletzt geändert/geändert durch“ ist die letzte Änderung. Trifft keines der Muster,
 * wird nichts geraten.
 */
const MONTHS: Readonly<Record<string, string>> = {
  januar: '01', februar: '02', 'märz': '03', maerz: '03', april: '04', mai: '05', juni: '06',
  juli: '07', august: '08', september: '09', oktober: '10', november: '11', dezember: '12',
};

/** `16. Juni 2015`, `28.11.2019`, `1.12.2023`, `01.12.2023`. */
const LONG_DATE = /\b(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s+(\d{4})\b/u;
const SHORT_DATE = /\b(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})\b/u;

/**
 * Baut ein ISO-Datum – und nur, wenn es das im Kalender gibt.
 *
 * Ohne die Kalenderprüfung wird aus „32. Mai 2020“ ein `2020-05-32`, aus dem 29. Februar eines
 * Nicht-Schaltjahres ein gültig aussehendes Datum. Ein falsches Ausfertigungsdatum ist schlimmer als
 * gar keines: Es entscheidet still über die Stichtagsklasse.
 */
function isoFrom(day: string, month: string, year: string): string | undefined {
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10) === iso ? iso : undefined;
}

/** Ein deutsches Datum am Anfang des Ausschnitts; `undefined`, wenn dort keines steht. */
export function parseGermanDate(text: string): string | undefined {
  const long = LONG_DATE.exec(text);
  if (long) {
    const month = MONTHS[long[2]!.toLocaleLowerCase('de-DE')];
    if (month) return isoFrom(long[1]!, month, long[3]!);
  }
  const short = SHORT_DATE.exec(text);
  if (short) return isoFrom(short[1]!, short[2]!, short[3]!);
  return undefined;
}

export interface CitationDates {
  /** Ausfertigung der Stammfassung: das erste „vom <Datum>“. */
  issueDate?: string;
  /** Letzte Änderung, soweit der Zitiervorschlag sie nennt. */
  lastAmendmentDate?: string;
}

/**
 * Liest Ausfertigung und letzte Änderung aus einem Zitiervorschlag.
 *
 * Reihenfolge ist wesentlich: Erst wird der Änderungsteil abgetrennt („zuletzt durch … geändert“),
 * dann im verbleibenden Kopf das erste „vom“ gesucht. Andernfalls gewänne man bei einer geänderten
 * Vorschrift das Änderungsdatum als Ausfertigung – und hielte eine alte Vorschrift für neu.
 */
export function citationDates(citation: string | undefined): CitationDates {
  if (!citation) return {};

  // Ausfertigung: das **erste** „vom“, dem ein lesbares Datum folgt. Der Zitiervorschlag nennt die
  // Stammfassung immer zuerst.
  //
  // Ein früherer Versuch suchte stattdessen zuerst den Änderungsteil und schnitt ihn ab. Er brach an
  // einem Titel: „… Anlagen für Notfälle/Gefahren **mit** Anschluss an die Polizei vom 23. Juli 2019“.
  // Das Wort „mit“ löste die Änderungserkennung aus, der Schnitt fiel vor die Ausfertigung – und die
  // Vorschrift galt als datumslos. Auslöserwörter mitten im Titel sind kein Hinweis auf eine Änderung.
  let issueDate: string | undefined;
  for (const match of citation.matchAll(/\bvom\s+/giu)) {
    const parsed = parseGermanDate(citation.slice((match.index ?? 0) + match[0].length));
    if (parsed) {
      issueDate = parsed;
      break;
    }
  }

  // Letzte Änderung: das letzte „vom <Datum>“, auf das kurz darauf „geändert“ folgt. Ohne diese
  // Bedingung wäre jedes Datum im Titel ein Änderungsdatum.
  //
  // Das Fenster darf Punkte enthalten – „16. Dezember 2025“ trägt selbst einen. Ein Fenster, das an
  // Punkten abbricht, endet mitten im Datum und findet nie ein „geändert“.
  let lastAmendmentDate: string | undefined;
  for (const match of citation.matchAll(/\bvom\s+/giu)) {
    const after = citation.slice((match.index ?? 0) + match[0].length);
    const parsed = parseGermanDate(after);
    if (!parsed) continue;
    if (/^.{0,140}?\bge(?:ä|ae)ndert\b/iu.test(after)) lastAmendmentDate = parsed;
  }
  if (lastAmendmentDate === issueDate) lastAmendmentDate = undefined;

  return {
    ...(issueDate ? { issueDate } : {}),
    ...(lastAmendmentDate ? { lastAmendmentDate } : {}),
  };
}
