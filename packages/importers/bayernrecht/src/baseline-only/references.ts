/**
 * Fundstellen der Ausgangsverkündung und ihr Weg auf die Verkündungsplattform Bayern.
 *
 * Ein Aufhebungsbefehl zitiert die aufgehobene Vorschrift mit Ausfertigungsdatum und Fundstelle:
 * „… vom 25. Februar 2021 (BayMBl. Nr. 182)“, „… vom 27. Juli 2016 (KWMBl. S. 194)“,
 * „… vom 23. April 1976 (KWMBl. I S. 133)“. Aus der Fundstelle folgt, **ob** die Ausgangsfassung
 * elektronisch vorliegt und **wo**:
 *
 * | Blatt | Jahrgang | Lage (Nutzungshinweise zum BayMBl., Abschnitt „Amts- und Ministerialblätter bis 2018“) |
 * | --- | --- | --- |
 * | BayMBl. | ab 2019 | amtlich elektronisch, Detailseite `/baymbl/<jahr>-<nr>/` |
 * | AllMBl., KWMBl., FMBl., JMBl. | 2009–2018 | „ausschließlich elektronisch bekannt gemacht“, amtliche elektronische Fassung unter „Ausgaben der Amtsblätter 2009-2018“ (`/amtsblatt/…`) |
 * | dieselben Blätter | vor 2009 | „ausschließlich in gedruckter Form“ – nur Papier |
 * | GVBl. | – | amtlich ist die Druckausgabe; die HTML-Detailseite `/gvbl/<jahr>-<seite>/` ist nachrichtlich |
 * | alle übrigen (StAnz., LMBl., AMBl., WVMBl., …) | – | nicht auf der Plattform – nur Papier |
 *
 * Nichts wird geraten: Ohne Jahrgang in der Fundstelle gilt der Jahrgang des Ausfertigungsdatums; bei einer
 * Ausfertigung im Dezember kommt der Folgejahrgang als zweiter Kandidat hinzu. Welcher zutrifft, entscheidet
 * erst die abgerufene Seite (Ausfertigungsdatum im Seitenkopf) – nie die Wahrscheinlichkeit.
 */

export const PLATFORM_ORIGIN = 'https://www.verkuendung-bayern.de';

/** Verkündungsblätter, deren Namen in Fundstellen vorkommen. `AIIMBl` ist ein in Quellen belegter Satzfehler für `AllMBl`. */
export const GAZETTE_NAMES = ['GVBl', 'BayMBl', 'AllMBl', 'AIIMBl', 'KWMBl', 'JMBl', 'FMBl', 'MABl', 'StAnz', 'LMBl', 'AMBl', 'WVMBl', 'KMBl', 'LUMBl', 'BayBSVELF', 'BayBSVI', 'BayBSVK', 'BayBSVJu', 'BayBSVFin', 'BayBSVWiV', 'BayBS', 'BAnz', 'BGBl'] as const;
export type GazetteName = (typeof GAZETTE_NAMES)[number];

/** Die vier Amts- und Ministerialblätter 2009–2018 mit ihrer Kennung im Suchformular (`journal`). */
export const MINISTERIAL_JOURNALS = { AllMBl: 1, FMBl: 2, JMBl: 3, KWMBl: 4 } as const;
export type MinisterialJournal = keyof typeof MINISTERIAL_JOURNALS;

export interface GazetteReference {
  /** Kanonischer Blattname (`AllMBl` statt `AIIMBl`). */
  organ: GazetteName;
  /** Teil des Blatts (`I` beim KWMBl. bis 2008). */
  part?: string;
  /** Jahrgang, soweit die Fundstelle ihn ausdrücklich nennt. */
  explicitVolume?: number;
  /** `page` (S.) oder `number` (Nr.). */
  kind: 'page' | 'number';
  position: number;
  /** Wortlaut der Fundstelle, wie sie in der Klammer steht. */
  text: string;
}

export interface ParsedParenthetical {
  /** Erste Fundstelle: die Verkündung der Stammfassung. */
  primary?: GazetteReference;
  /** Weitere Fundstellen derselben Klammer (Parallelveröffentlichungen, z. B. `StAnz. Nr. 49`). */
  others: GazetteReference[];
  /** Berichtigungen („ber. 1983, S. 102“, „ber. Nr. 405“). */
  corrections: string[];
  /** BayRS-Gliederungsnummer, soweit die Klammer eine nennt. */
  bayRsNumber?: string;
  /** Aktenzeichen statt Fundstelle („Az. 25-P 2526-2/45“): ein nicht verkündetes Schreiben. */
  aktenzeichenOnly: boolean;
}

const ORGAN_PATTERN = new RegExp(String.raw`\b(${[...GAZETTE_NAMES].sort((left, right) => right.length - left.length).join('|')})\.?\s*(I{1,2}\s+)?(?:(\d{4})\s*,?\s*)?(S\.|Nr\.)\s*(\d+)`, 'gu');

function canonicalOrgan(name: string): GazetteName {
  return (name === 'AIIMBl' ? 'AllMBl' : name) as GazetteName;
}

/** Zerlegt die Fundstellenklammer eines Normzitats. Ein Aktenzeichen allein ist keine Fundstelle. */
export function parseParenthetical(value: string): ParsedParenthetical {
  const text = value.replace(/[   ]/gu, ' ').replace(/\s+/gu, ' ').trim();
  const references: GazetteReference[] = [];
  const corrections: string[] = [];
  // Berichtigungen zuerst abtrennen: „ber. 1983, S. 102“ ist keine zweite Verkündung der Stammfassung.
  const correctionPattern = /\bber\.\s*((?:\d{4}\s*,?\s*)?(?:S\.|Nr\.)\s*\d+(?:\s*(?:,|und)\s*\d+)*)/gu;
  for (const match of text.matchAll(correctionPattern)) corrections.push(match[0].trim());
  const withoutCorrections = text.replace(correctionPattern, ' ');
  for (const match of withoutCorrections.matchAll(ORGAN_PATTERN)) {
    references.push({
      organ: canonicalOrgan(match[1]!),
      ...(match[2] ? { part: match[2].trim() } : {}),
      ...(match[3] ? { explicitVolume: Number(match[3]) } : {}),
      kind: match[4] === 'Nr.' ? 'number' : 'page',
      position: Number(match[5]),
      text: match[0].trim(),
    });
  }
  const bayRs = /BayRS\s*([0-9A-Za-zÄÖÜäöü]+(?:[.\-/][0-9A-Za-zÄÖÜäöü]+)*)/u.exec(text)?.[1];
  return {
    ...(references[0] ? { primary: references[0] } : {}),
    others: references.slice(1),
    corrections,
    ...(bayRs ? { bayRsNumber: bayRs } : {}),
    aktenzeichenOnly: references.length === 0 && /\bAz\.?/u.test(text),
  };
}

/** Kandidatenjahrgänge einer Fundstelle: ausdrücklich genannt, sonst Ausfertigungsjahr (Dezember: auch Folgejahr). */
export function candidateVolumes(reference: GazetteReference, documentDate: string | undefined): number[] {
  if (reference.explicitVolume !== undefined) return [reference.explicitVolume];
  if (!documentDate) return [];
  const year = Number(documentDate.slice(0, 4));
  return documentDate.slice(5, 7) === '12' ? [year, year + 1] : [year];
}

/**
 * Wie liegt die Ausgangsverkündung vor?
 *   baymbl-html        BayMBl. ab 2019: amtliche elektronische Veröffentlichung mit HTML-Detailseite
 *   amtsblatt-html     AllMBl./KWMBl./FMBl./JMBl. 2009–2018: amtliche elektronische Fassung, HTML über die Ausgabe
 *   gvbl-html          GVBl.: HTML-Detailseite (nachrichtlich; amtlich ist die Druckausgabe)
 *   paper-only         Blatt oder Jahrgang ist nur gedruckt erschienen (vor 2009, andere Blätter)
 */
export type BaseAvailability = 'baymbl-html' | 'amtsblatt-html' | 'gvbl-html' | 'paper-only';

export interface BaseLocation {
  availability: BaseAvailability;
  reference: GazetteReference;
  volumes: number[];
  /** Kurzform der Fundstelle mit Jahrgang (`BayMBl. 2021 Nr. 182`); bei mehreren Jahrgängen der erste. */
  citation: string;
  reason: string;
}

export function formatReference(organ: GazetteName, volume: number | undefined, kind: 'page' | 'number', position: number, part?: string): string {
  return `${organ}.${part ? ` ${part}` : ''}${volume !== undefined ? ` ${volume}` : ''} ${kind === 'number' ? 'Nr.' : 'S.'} ${position}`;
}

export function locateBase(reference: GazetteReference, documentDate: string | undefined): BaseLocation {
  let volumes = candidateVolumes(reference, documentDate);
  // Das BayMBl. gibt es erst seit 2019: Eine im Dezember 2018 erlassene Vorschrift „(BayMBl. Nr. 76)“ steht im
  // Jahrgang 2019 (belegt: BayMBl. 2024 Nr. 262 zitiert so eine Bekanntmachung vom 6. Dezember 2018).
  if (reference.organ === 'BayMBl' && reference.explicitVolume === undefined && volumes.some((volume) => volume >= 2019)) volumes = volumes.filter((volume) => volume >= 2019);
  // Amtsblätter 2009–2018 ohne Jahrgang im Zitat: Die Verkündung kann im Folgejahr liegen (Erlass im Herbst,
  // Veröffentlichung im Januar); welcher Jahrgang es ist, entscheidet die Ausgabe, die nach dem Erlass erschien.
  if (reference.organ in MINISTERIAL_JOURNALS && reference.explicitVolume === undefined && documentDate) {
    const year = Number(documentDate.slice(0, 4));
    volumes = [year, year + 1].filter((volume) => volume >= 2009 && volume <= 2018 || volume === year);
  }
  const citation = formatReference(reference.organ, volumes[0], reference.kind, reference.position, reference.part);
  const base = { reference, volumes, citation };
  if (volumes.length === 0) return { ...base, availability: 'paper-only', reason: `Fundstelle ${reference.text} ohne bestimmbaren Jahrgang` };
  if (reference.organ === 'BayMBl') {
    if (reference.kind !== 'number') return { ...base, availability: 'paper-only', reason: `${reference.text}: das BayMBl. zählt nach Nummern, nicht nach Seiten – Fundstelle nicht auflösbar` };
    if (volumes.every((volume) => volume >= 2019)) return { ...base, availability: 'baymbl-html', reason: 'BayMBl. ab 2019: amtliche elektronische Veröffentlichung auf der Verkündungsplattform' };
    return { ...base, availability: 'paper-only', reason: `${reference.text}: BayMBl. erst ab 2019` };
  }
  if (reference.organ in MINISTERIAL_JOURNALS) {
    if (reference.kind !== 'page') return { ...base, availability: 'paper-only', reason: `${reference.text}: Seitenangabe erwartet` };
    if (reference.part === undefined && volumes.every((volume) => volume >= 2009 && volume <= 2018)) {
      return { ...base, availability: 'amtsblatt-html', reason: `${reference.organ}. ${volumes.join('/')}: seit Januar 2009 ausschließlich elektronisch bekannt gemacht; amtliche elektronische Fassung unter „Ausgaben der Amtsblätter 2009-2018“` };
    }
    return { ...base, availability: 'paper-only', reason: `${reference.organ}. ${volumes.join('/')}: vor 2009 erschienene Ausgaben gibt es nur gedruckt (Nutzungshinweise zum BayMBl.)` };
  }
  if (reference.organ === 'GVBl') {
    if (reference.kind !== 'page') return { ...base, availability: 'paper-only', reason: `${reference.text}: Seitenangabe erwartet` };
    return { ...base, availability: 'gvbl-html', reason: 'GVBl.: HTML-Detailseite der Verkündungsplattform (nachrichtlich; amtlich ist die Druckausgabe)' };
  }
  return { ...base, availability: 'paper-only', reason: `${reference.organ}.: Blatt nicht auf der Verkündungsplattform Bayern; nur gedruckt` };
}

export const baymblDetailUrl = (volume: number, number: number): string => `${PLATFORM_ORIGIN}/baymbl/${volume}-${number}/`;
export const gvblDetailUrl = (volume: number, page: number): string => `${PLATFORM_ORIGIN}/gvbl/${volume}-${page}/`;
export const amtsblattVolumeUrl = (journal: MinisterialJournal, volume: number): string => `${PLATFORM_ORIGIN}/amtsblatt/?volume=${volume}&journal=${MINISTERIAL_JOURNALS[journal]}`;
export const amtsblattIssueUrl = (path: string): string => `${PLATFORM_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
export const baymblGlnrListingUrl = (glnr: string, offset: number): string =>
  `${PLATFORM_ORIGIN}/baymbl/?referencenumber=${encodeURIComponent(glnr)}&itemsPerPage=50${offset > 0 ? `&offset=${offset + 1}` : ''}`;
/** Volltextsuche des BayMBl. (Feld „Volltext“; die Wörter werden UND-verknüpft, Phrasen in Anführungszeichen finden nichts). */
export const baymblFulltextUrl = (query: string, offset: number): string =>
  `${PLATFORM_ORIGIN}/baymbl/?query=${encodeURIComponent(query)}&itemsPerPage=50${offset > 0 ? `&offset=${offset + 1}` : ''}`;

const LONG_MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'] as const;

/**
 * Suchwörter, die **jedes** Zitat der Norm trägt: Ausfertigungsdatum in Langform und Fundstelle
 * (`25. Februar 2021 BayMBl. Nr. 182`, `12. Oktober 2018 AllMBl. S. 962`). Ein Zitat ohne diese Angaben erkennt
 * auch `citationsOfBase` nicht – Suche und Prüfung haben dasselbe Kriterium.
 */
export function fulltextQuery(documentDate: string, reference: Pick<GazetteReference, 'organ' | 'kind' | 'position'>): string {
  const [year, month, day] = documentDate.split('-');
  return `${Number(day)}. ${LONG_MONTHS[Number(month) - 1]} ${year} ${reference.organ}. ${reference.kind === 'number' ? 'Nr.' : 'S.'} ${reference.position}`;
}

/** Stabile Kennung einer Verkündung: `baymbl-2021-182`, `gvbl-2019-594`, `kwmbl-2016-10-194`. */
export function publicationIdentity(input: { organ: GazetteName; volume: number; position: number; issue?: string; suffix?: string }): string {
  const organ = input.organ.toLowerCase();
  return [organ, String(input.volume), ...(input.issue ? [input.issue] : []), String(input.position), ...(input.suffix ? [input.suffix] : [])].join('-');
}

/** Gleiche Fundstelle? Jahrgang zählt nur, wenn beide ihn kennen. */
export function sameReference(left: GazetteReference, right: GazetteReference, leftVolume?: number, rightVolume?: number): boolean {
  if (left.organ !== right.organ || left.kind !== right.kind || left.position !== right.position) return false;
  if ((left.part ?? '') !== (right.part ?? '')) return false;
  const a = left.explicitVolume ?? leftVolume;
  const b = right.explicitVolume ?? rightVolume;
  return a === undefined || b === undefined || a === b;
}
