/**
 * Inkrafttreten einer Änderung **für die Zielnorm**.
 *
 * Ein Änderungsgesetz tritt nicht zwingend am Verkündungstag in Kraft, und nicht zwingend auf einmal.
 * Gelesen wird die Schlussvorschrift der Verkündung (außerhalb jedes Zitats): eine Grundregel
 * („Dieses Gesetz tritt am 1. Dezember 2025 in Kraft.“) und etwaige Abweichungen („Abweichend von Satz 1
 * tritt § 2 am 1. Januar 2027 in Kraft.“).
 *
 * Für die Zielnorm gelten die Grundregel und jede Abweichung, die ihren Änderungsabschnitt (oder einen
 * Teil davon) nennt. Abweichungen für andere Abschnitte eines Mantelgesetzes gelten nicht. Eine
 * Abweichung, deren Gegenstand nicht lesbar ist, gilt vorsorglich; eine, deren **Datum** nicht lesbar
 * ist, macht das Inkrafttreten unbestimmt – dann wird nicht zurückgerechnet.
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import { relativeDate, relativeRule } from '../baseline-only/relative.ts';
import { parseLongGermanDate } from '../events/resolve.ts';
import type { GazetteUnit } from './gazette.ts';

export interface CommencementStatement {
  /** Wortlaut des Satzes. */
  text: string;
  /** Gegenstand: `null` = ganze Verkündung (Grundregel), sonst die genannten Glieder. */
  refs: string[] | null;
  date?: string;
}

export type CommencementResult =
  | { ok: true; dates: string[]; statements: CommencementStatement[]; applicable: CommencementStatement[] }
  | { ok: false; reason: string; statements: CommencementStatement[] };

const DATE = String.raw`\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4}`;

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function firstOfNextMonth(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

/** Datumswendung vor „in Kraft“ → ISO-Datum; `undefined`, wenn nicht lesbar. */
export function commencementDate(phrase: string, eventDate: string): string | undefined {
  const text = phrase.replace(/\s+/gu, ' ').trim();
  let match = new RegExp(`^(?:rückwirkend\\s+)?(?:am|zum|mit\\s+Wirkung\\s+vom|mit\\s+Wirkung\\s+zum)\\s+(${DATE})$`, 'u').exec(text);
  if (match) return parseLongGermanDate(match[1]!);
  if (/^am\s+Tag(?:e)?\s+nach\s+(?:der|ihrer|seiner)\s+(?:Verkündung|Bekanntmachung)$/u.test(text)) return addDays(eventDate, 1);
  if (/^(?:am\s+Tag(?:e)?|mit\s+dem\s+Tag(?:e)?)\s+(?:der|ihrer|seiner)\s+(?:Verkündung|Bekanntmachung)$/u.test(text)) return eventDate;
  if (/^am\s+ersten\s+Tag\s+des\s+auf\s+(?:die|ihre|seine)\s+(?:Verkündung|Bekanntmachung)\s+folgenden\s+(?:Kalender)?[Mm]onats$/u.test(text)) return firstOfNextMonth(eventDate);
  match = null;
  return undefined;
}

/**
 * Glieder im Gegenstand eines Satzes („§ 2“, „die §§ 61 bis 73“, „Nr. 1.3“, „die Nrn. 1.2, 1.13“, „§ 1 Nr. 5
 * Buchst. b“). Ein Glied mit Untergliederung („§ 1 Nr. 5“) bleibt **ein** Verweis – es betrifft nur einen Teil
 * des Abschnitts, nie den ganzen.
 */
export function subjectRefs(subject: string): string[] | undefined {
  const refs: string[] = [];
  const text = subject.replace(/\s+/gu, ' ').trim();
  const SUB = String.raw`(?:\s+(?:Abs\.|Nrn?\.|Buchst\.|Satz|Sätze|Doppelbuchst\.)\s*[\da-z]+[a-z]?(?:\.\d+[a-z]?)*(?:\s*(?:,|und|bis)\s*[\da-z]+[a-z]?(?:\.\d+[a-z]?)*)*)*`;
  const pattern = new RegExp(String.raw`(§§?|Art\.|Artikel|Nrn?\.)\s*(\d+[a-z]?(?:\.\d+[a-z]?)*)((?:\s*(?:,|und|bis)\s*\d+[a-z]?(?:\.\d+[a-z]?)*)*)(${SUB})`, 'gu');
  for (const match of text.matchAll(pattern)) {
    const kind = match[1]!.startsWith('§') ? '§' : match[1]!.startsWith('Art') ? 'Art.' : 'Nr.';
    const sub = (match[4] ?? '').trim();
    if (sub !== '') {
      // Untergliederung nur an einem einzelnen Glied lesbar („§ 1 Nr. 5“), nicht an einer Aufzählung.
      if ((match[3] ?? '').trim() !== '') return undefined;
      refs.push(`${kind} ${match[2]} ${sub.replace(/\s+/gu, ' ')}`);
      continue;
    }
    if (/bis/u.test(match[3] ?? '')) {
      const bounds = [match[2]!, ...(match[3] ?? '').split(/\s*(?:,|und|bis)\s*/u).filter(Boolean)];
      const range = /(\d+)\s*bis\s*(\d+)/u.exec(`${match[2]}${match[3]}`);
      if (range && !bounds.some((value) => value.includes('.') || /[a-z]/u.test(value))) {
        for (let value = Number(range[1]); value <= Number(range[2]); value += 1) refs.push(`${kind} ${value}`);
        continue;
      }
      // „die Nrn. 1.1 bis 1.18, 1.20 und 1.21“: Bereich nur mit gleichem Präfix.
      const parts = `${match[2]}${match[3]}`.split(/\s*(?:,|und)\s*/u).filter(Boolean);
      const expanded: string[] = [];
      for (const part of parts) {
        const dotted = /^((?:\d+\.)+)(\d+)\s*bis\s*((?:\d+\.)+)(\d+)$/u.exec(part);
        if (dotted && dotted[1] === dotted[3] && Number(dotted[2]) <= Number(dotted[4])) {
          for (let value = Number(dotted[2]); value <= Number(dotted[4]); value += 1) expanded.push(`${kind} ${dotted[1]}${value}`);
        } else if (/^\d+[a-z]?(?:\.\d+[a-z]?)*$/u.test(part)) expanded.push(`${kind} ${part}`);
        else return undefined;
      }
      refs.push(...expanded);
      continue;
    }
    refs.push(`${kind} ${match[2]}`);
    for (const extra of (match[3] ?? '').split(/\s*(?:,|und)\s*/u).filter(Boolean)) refs.push(`${kind} ${extra}`);
  }
  return refs.length > 0 ? refs : undefined;
}

const DATE_PHRASE = String.raw`(?:rückwirkend\s+)?(?:am|zum|mit\s+Wirkung\s+vom|mit\s+Wirkung\s+zum)\s+\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4}`;

/**
 * Eine Abweichung als Folge „Gegenstand Datum“: „§ 16 am 2. August 2024 und § 20 am 1. Januar 2025“ oder ein
 * Listenglied „die §§ 11 und 13 am 1. Oktober 2025,“. Jeder Gegenstand muss lesbar sein, sonst `undefined`.
 */
function deviationPairs(text: string, eventDate: string): Array<{ refs: string[]; date: string }> | undefined {
  const cleaned = text.replace(/\s+/gu, ' ').replace(/[,;.]?\s*(?:und|sowie)?\s*$/u, '').trim();
  const pairs: Array<{ refs: string[]; date: string }> = [];
  let rest = cleaned;
  const pattern = new RegExp(String.raw`^(?:(?:,|und|sowie)\s+)?([\s\S]+?)\s+(${DATE_PHRASE})(?=\s*(?:,|und|sowie|$))`, 'u');
  while (rest !== '') {
    const match = pattern.exec(rest);
    if (!match) return undefined;
    if (/\s(?:am|zum)\s+\d/u.test(match[1]!)) return undefined;
    const refs = subjectRefs(match[1]!);
    const date = commencementDate(match[2]!, eventDate);
    if (!refs || !date) return undefined;
    pairs.push({ refs, date });
    rest = rest.slice(match[0].length).trim();
  }
  return pairs.length > 0 ? pairs : undefined;
}

/**
 * Sätze der Schlussvorschrift, die ein Inkrafttreten regeln. Einheiten innerhalb eines Zitats (neu
 * gefasste Vorschriften mit eigenem Inkrafttreten) werden übergangen.
 */
export function commencementStatements(units: readonly GazetteUnit[], eventDate: string): { statements: CommencementStatement[]; unreadable: string[] } {
  const statements: CommencementStatement[] = [];
  const unreadable: string[] = [];
  // Gegliederte Verkündung (GVBl.): Die Schlussvorschrift steht unter „§ n Inkrafttreten“. Dann zählt nur,
  // was dort steht – ein nicht geschlossenes Zitat weiter oben kann sie nicht verdecken.
  const headingAt = units.map((unit, index) => (unit.heading && /^(?:§|Art\.|Artikel)\s*\d+[a-z]?\s+(?:[\p{L}\s,]*\s)?(?:In-?Kraft-?Treten|Inkrafttreten)/u.test(unit.text) ? index : -1)).filter((index) => index >= 0);
  let candidates: GazetteUnit[];
  if (headingAt.length > 0) {
    const start = headingAt.at(-1)! + 1;
    const next = units.findIndex((unit, index) => index >= start && unit.heading);
    candidates = units.slice(start, next < 0 ? units.length : next).filter((unit) => !/^Abschluss/u.test(unit.className));
  } else {
    candidates = [];
    let balance = 0;
    for (const unit of units) {
      if (unit.heading) {
        balance = 0;
        continue;
      }
      // Ein Glied der obersten Befehlsebene des BayMBl. („2. Diese Bekanntmachung tritt … in Kraft.“, Klasse
      // `MBL1Listenebene`) steht nie in einem Zitat: Ein weiter oben nicht geschlossenes Zitat (Satzfehler „…"“,
      // BayMBl. 2025 Nr. 233) verdeckt es nicht.
      if (/\bMBL1Listenebene\b/u.test(unit.className) && /^\d+\.$/u.test((unit.label ?? '').trim())) balance = 0;
      const full = `${unit.label ?? ''} ${unit.text}`.trim();
      // Eine Einheit, die nur „§ 2“ oder „Art. 3“ trägt, beginnt einen neuen Abschnitt (Amtsblätter setzen die
      // Paragraphenzeile als Absatz, nicht als Überschrift: FMBl. 2018 S. 221): Kein Zitat reicht über sie hinweg.
      if (/^(?:§|Art\.)\s*\d+[a-z]?$/u.test(full)) {
        balance = 0;
        continue;
      }
      const inside = balance > 0 || /^[„‚]/u.test(full);
      // Ein Zitat über mehrere Absätze öffnet jeden Absatz neu und schließt nur am Ende („1.1.4 … – „1.1.5 … “, AllMBl.
      // 2018 S. 419): Das öffnende Zeichen am Anfang eines Absatzes innerhalb eines Zitats vertieft es nicht.
      const opening = (full.match(/[„‚]/gu)?.length ?? 0) - (balance > 0 && /^[„‚]/u.test(full) ? 1 : 0);
      // Ein gerades Anführungszeichen am Ende eines Zitats schließt es (Satzfehler „…Nordwert N (North).\"“, FMBl. 2018 S. 221).
      const straight = balance + opening > 0 && /\S"[.;,]?$/u.test(full) ? 1 : 0;
      balance = Math.max(0, balance + opening - (full.match(/[“”‘]/gu)?.length ?? 0) - straight);
      if (!inside) candidates.push(unit);
    }
  }
  for (let position = 0; position < candidates.length; position += 1) {
    const unit = candidates[position]!;
    if (!/in\s+Kraft/u.test(unit.text) && !/Abweichend\s+von\s+[^:]{1,60}?\s+(?:tritt|treten)$/u.test(unit.text.trim())) continue;
    // In Sätze zerlegen: an Satznummern, Absatzzeichen und Satzenden vor einem Großbuchstaben.
    const sentences = unit.text
      // Nicht nach „1.“ vor „Januar“ trennen: Satzende ist ein Punkt hinter einem Kleinbuchstaben oder einer Klammer.
      .split(/(?=[¹²³⁴⁵⁶⁷⁸⁹](?=\S))|(?<=[a-zäöüß)\]]\.)\s+(?=[A-ZÄÖÜ(])|(?=\(\d+\)\s)/u)
      .map((sentence) => sentence.replace(/^[¹²³⁴⁵⁶⁷⁸⁹]+|^\(\d+\)\s*/u, '').trim())
      .filter((sentence) => sentence !== '');
    for (const sentence of sentences) {
      // Aufzählung über Einheiten: „Abweichend von Satz 1 treten“ – „1. § 8 mit Wirkung vom 1. August 2022,“ – … – „in Kraft.“
      if (/^Abweichend\s+von\s+[^:]{1,60}?\s+(?:tritt|treten)$/u.test(sentence) && sentence === sentences.at(-1)) {
        const items: GazetteUnit[] = [];
        let at = position + 1;
        while (at < candidates.length && /^(?:\d+\.|[a-z]\))$/u.test(candidates[at]!.label ?? '')) items.push(candidates[at++]!);
        const closing = candidates[at];
        if (items.length === 0 || !closing || !/^in\s+Kraft\.?$/u.test(closing.text.trim())) {
          unreadable.push(sentence);
          continue;
        }
        position = at;
        for (const item of items) {
          const pairs = deviationPairs(item.text, eventDate);
          if (!pairs) {
            unreadable.push(`${sentence} ${item.label} ${item.text} in Kraft`);
            continue;
          }
          for (const pair of pairs) statements.push({ text: `${sentence} ${item.label} ${item.text} in Kraft.`, refs: pair.refs, date: pair.date });
        }
        continue;
      }
      // Aufzählung: „Abweichend von Abs. 1 treten in Kraft:“ – die folgenden Listenglieder sind je eine Abweichung.
      if (/^Abweichend\s+von\s+[^:]{1,60}?\s+(?:tritt|treten)\s+in\s+Kraft\s*:$/u.test(sentence)) {
        let consumed = 0;
        let broken = false;
        while (position + 1 < candidates.length && /^(?:\d+\.|[a-z]\))$/u.test(candidates[position + 1]!.label ?? '')) {
          const item = candidates[position + 1]!;
          position += 1;
          consumed += 1;
          const pairs = deviationPairs(item.text, eventDate);
          if (!pairs) {
            unreadable.push(`${sentence} ${item.label} ${item.text}`);
            broken = true;
            continue;
          }
          for (const pair of pairs) statements.push({ text: `${sentence} ${item.label} ${item.text}`, refs: pair.refs, date: pair.date });
        }
        if (consumed === 0 && !broken) unreadable.push(sentence);
        continue;
      }
      // Nur Sätze der Form „… tritt/treten … in Kraft“; „wann sie in Kraft tritt“ ist Normtext, keine Schlussvorschrift.
      if (!/(?:tritt|treten)(?![\p{L}])[\s\S]*\bin\s+Kraft/u.test(sentence)) {
        if (/[Aa]bweichend/u.test(sentence)) unreadable.push(sentence);
        continue;
      }
      if (/außer\s+Kraft/u.test(sentence) && !/(?:^|\s)in\s+Kraft/u.test(sentence.replace(/außer\s+Kraft/gu, ''))) continue;
      // Auch Staatsverträge und Abkommen („Dieser Staatsvertrag tritt am 1. Dezember 2025 in Kraft.“); ihre
      // Ratifikationsklausel („Sind bis zum … nicht alle Ratifikationsurkunden hinterlegt, wird der Staatsvertrag
      // gegenstandslos“) kann das Inkrafttreten nur verhindern, nicht verschieben.
      const general = /^(?:Dieses|Diese|Dieser|Die|Das|Der)\s+(?:Gesetz|Verordnung|Bekanntmachung|Satzung|Änderungssatzung|Statut|Richtlinie|Richtlinien|Verwaltungsvorschrift|Änderungsbekanntmachung|Änderungsverordnung|Staatsvertrag|Änderungsstaatsvertrag|Abkommen|Änderung\s+der\s+(?:Bekanntmachung|Geschäftsordnung|Verwaltungsvorschrift|Richtlinien?|Satzung))\s+(?:tritt|treten)\s+([\s\S]+?)\s+in\s+Kraft\.?$/u.exec(sentence);
      if (general) {
        const date = commencementDate(general[1]!, eventDate);
        statements.push({ text: sentence, refs: null, ...(date ? { date } : {}) });
        if (!date) unreadable.push(sentence);
        continue;
      }
      // „Abweichend von Satz 1 tritt § 2 am 1. Januar 2027 in Kraft.“ / „… treten die Nrn. 1.2, 1.13 am … in Kraft.“ /
      // „… tritt § 16 am 2. August 2024 und § 20 am 1. Januar 2025 in Kraft.“
      const deviation = /(?:tritt|treten)\s+([\s\S]+?)\s+in\s+Kraft\.?$/u.exec(sentence);
      const pairs = deviation ? deviationPairs(deviation[1]!, eventDate) : undefined;
      if (pairs) {
        for (const pair of pairs) statements.push({ text: sentence, refs: pair.refs, date: pair.date });
        continue;
      }
      unreadable.push(sentence);
    }
  }
  return { statements, unreadable };
}

/** Kennung des Änderungsabschnitts für den Abgleich mit Abweichungen: `§ 2`, `Art. 3`, `Nr. 1`. */
export function sectionRef(section: string | undefined, introLabel: string | undefined): string | undefined {
  const heading = section ? /^(§|Art\.|Artikel)\s*(\d+[a-z]?)/u.exec(section) : null;
  if (heading) return `${heading[1] === 'Artikel' ? 'Art.' : heading[1]} ${heading[2]}`;
  const label = introLabel?.replace(/\.$/u, '');
  if (label && /^\d+$/u.test(label)) return `Nr. ${label}`;
  return undefined;
}

const CALENDAR_PHRASE = /\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4}/u;

export interface DatedCommencement {
  ok: boolean;
  reason?: string;
  dates: string[];
  /** Wortlaut der angewandten Inkrafttretensregeln, bei relativem Inkrafttreten dazu der Beleg des Verkündungsdatums. */
  evidence: string[];
  /** Alle angewandten Regeln nennen ein Kalenderdatum. */
  calendar: boolean;
  /** Relatives Inkrafttreten, berechnet aus dem Verkündungsdatum, das die Verkündung selbst nennt. */
  publicationDated: boolean;
  /** Das zugrunde gelegte Verkündungsdatum (bei relativem Inkrafttreten das der Verkündung selbst). */
  eventDate?: string;
}

/**
 * Inkrafttreten der Änderung für die Zielnorm mit Kalenderdatum – oder relativ zur Verkündung („am Tag nach der
 * Verkündung“, „am ersten Tag des auf die Verkündung folgenden Monats“). Relativ nur mit dem Verkündungsdatum, das die
 * **Verkündung selbst** nennt (`publishedAt`: GVBl. „Ausgabe 2024/11 vom 14.06.2024“, BayMBl. „Veröffentlichung BayMBl.
 * 2025 Nr. 486 vom 26.11.2025“); nennt das Register ein anderes Datum, widersprechen sich die Belege. Das Verkündungsdatum
 * wird nie ungeprüft zum Inkrafttreten: Es zählt nur, wenn die Inkrafttretensvorschrift ausdrücklich darauf verweist.
 */
export function datedCommencement(units: readonly GazetteUnit[], section: string | undefined, mantel: boolean, input: { publishedAt?: string; registerDate?: string; url: string }): DatedCommencement {
  const eventDate = input.registerDate ?? input.publishedAt;
  const commencement = commencementFor(units, eventDate ?? '0000-00-00', section, mantel);
  if (!commencement.ok) return { ok: false, reason: commencement.reason, dates: [], evidence: [], calendar: false, publicationDated: false };
  const relative = commencement.applicable.some((statement) => /[Vv]erkünd|[Bb]ekanntmachung/u.test(statement.text.replace(/(?:Diese|Die|Das)\s+Bekanntmachung\s+tritt/u, '')) || !CALENDAR_PHRASE.test(statement.text));
  if (!relative) return { ok: true, dates: commencement.dates, evidence: commencement.applicable.map((statement) => statement.text), calendar: true, publicationDated: false, ...(eventDate ? { eventDate } : {}) };
  const published = input.publishedAt;
  if (!published) return { ok: false, reason: 'Inkrafttreten bezieht sich auf die Verkündung, deren Datum die Verkündung selbst nicht nennt', dates: [], evidence: [], calendar: false, publicationDated: false };
  if (input.registerDate && input.registerDate !== published) return { ok: false, reason: `Verkündungsdatum widersprüchlich: Verkündung ${published}, Register ${input.registerDate}`, dates: [], evidence: [], calendar: false, publicationDated: false };
  const dated = published === eventDate ? commencement : commencementFor(units, published, section, mantel);
  if (!dated.ok) return { ok: false, reason: dated.reason, dates: [], evidence: [], calendar: false, publicationDated: false };
  return {
    ok: true,
    dates: dated.dates,
    evidence: [...dated.applicable.map((statement) => statement.text), `Verkündungsdatum ${published} laut Verkündung selbst (${input.url})`],
    calendar: false,
    publicationDated: true,
    eventDate: published,
  };
}

/**
 * Inkrafttretensdaten der Änderung für die Zielnorm. `mantel` sagt, ob die Verkündung mehrere Normen
 * ändert – nur dann können Abweichungen einen fremden Abschnitt betreffen.
 */
export function commencementFor(units: readonly GazetteUnit[], eventDate: string, section: string | undefined, mantel: boolean): CommencementResult {
  const { statements, unreadable } = commencementStatements(units, eventDate);
  if (unreadable.length > 0) return { ok: false, reason: `Inkrafttretensvorschrift nicht lesbar: „${unreadable[0]!.slice(0, 160)}“`, statements };
  const generals = statements.filter((statement) => statement.refs === null);
  if (generals.length !== 1) return { ok: false, reason: generals.length === 0 ? 'Keine Grundregel zum Inkrafttreten gefunden' : `${generals.length} Grundregeln zum Inkrafttreten`, statements };
  const applicable: CommencementStatement[] = [generals[0]!];
  let whole = false;
  for (const statement of statements) {
    if (statement.refs === null) continue;
    if (!mantel) {
      // Die ganze Verkündung ändert nur die Zielnorm: jede Abweichung betrifft einen Teil von ihr.
      applicable.push(statement);
      continue;
    }
    if (!section) return { ok: false, reason: 'Abweichendes Inkrafttreten in einer Mantelverkündung, deren Änderungsabschnitt keine Bezeichnung trägt', statements };
    const touches = statement.refs.some((ref) => ref === section || ref.startsWith(`${section} `) || (section.startsWith('Nr. ') && ref.startsWith(`${section}.`)));
    if (touches) applicable.push(statement);
    // Nennt die Abweichung den ganzen Abschnitt („treten die §§ 61 bis 73 am … in Kraft“), gilt die Grundregel für ihn nicht.
    if (statement.refs.includes(section)) whole = true;
  }
  if (whole) applicable.shift();
  const dates = [...new Set(applicable.map((statement) => statement.date!))].sort();
  return { ok: true, dates, statements, applicable };
}

/* ------------------------------------------------------------ Inkrafttreten der Stammfassung */

export interface OwnCommencement {
  ok: boolean;
  /** Spätestes Inkrafttreten aller Teile der Stammfassung (ISO), wenn belegt. */
  date?: string;
  evidence: string[];
  reason?: string;
}

const COMMENCEMENT_TITLE = /(?:In-?Kraft-?Treten|Inkrafttreten)/iu;

/**
 * Quellfehler in einer Inkrafttretensregel, die nur eine Lesart zulassen: „mir Wirkung vom 1. August 2022“
 * (BayVV_2235_1_1_5_K_13224, BayMBl. 2022 Nr. 485) ist „mit Wirkung vom“. Die Korrektur steht als Beleg im Rezept.
 */
export function repairCommencementSentence(sentence: string): { sentence: string; defects: string[] } {
  const defects: string[] = [];
  const repaired = sentence.replace(/\bmir(\s+Wirkung\s+(?:vom|zum)\s+\d{1,2}\.)/gu, (match, rest: string) => {
    defects.push(`Quellfehler in der Inkrafttretensregel: „${match.replace(/\s+\d{1,2}\.$/u, '')}“ als „mit${rest.replace(/\s+\d{1,2}\.$/u, '')}“ gelesen (einzige Lesart)`);
    return `mit${rest}`;
  });
  return { sentence: repaired, defects };
}

/**
 * Beginn der Geltung einer **Stammfassung**, belegt durch die Inkrafttretensvorschrift der Norm selbst –
 * gelesen im **rückgerechneten** Stichtagskörper, also in genau dem Text, dessen Geltung belegt werden
 * soll. Ausfertigung ist nicht Textgeltung; ein Datum wird nie aus dem Ausfertigungsdatum abgeleitet.
 *
 * Belegt ist nur ein **ausdrückliches Kalenderdatum** („tritt am 1. Januar 2005 in Kraft“, „mit Wirkung
 * vom …“). „Am Tag nach der Verkündung“ gilt nicht als Beleg: Die Verkündungen vor dem Stichtag liegen
 * nicht im Cache. Genau eine Vorschrift mit der Überschrift „Inkrafttreten“ muss es geben; jede weitere
 * Inkrafttretensregel darin (abweichende Teile) muss ebenfalls datiert sein.
 */
/** Anfang einer Grundregel zum Inkrafttreten („¹Diese Bekanntmachung tritt am … in Kraft“). */
/** Selbstbezeichnung einer Norm in ihrer Grundregel („Diese Geschäftsordnung tritt …“). */
const OWN_NOUN = String.raw`(?:Gesetz|Verordnung|Bekanntmachung|Satzung|Statut|Richtlinie|Richtlinien|Verwaltungsvorschrift|Verwaltungsvorschriften|Geschäftsordnung|Dienstordnung|Dienstanweisung|Anordnung|Ordnung|Vereinbarung|Dienstvereinbarung)`;
const GENERAL_RULE_START = new RegExp(String.raw`^[¹]?(?:Diese|Dieses|Die|Das)\s+${OWN_NOUN}\s+(?:tritt|treten)\s[\s\S]{0,120}?\bin\s+Kraft\b`, 'u');

/**
 * `relative`: Verkündungsdatum der Stammverkündung, wie sie es **selbst** druckt (Lauf 7, `publication.ts`) – nur damit
 * wird eine relative Grundregel („Diese Bekanntmachung tritt am Tag nach ihrer Veröffentlichung in Kraft.“) gelesen
 * (`baseline-only/relative.ts`, dieselbe Regel wie `datedCommencement`).
 */
export function ownCommencement(body: readonly NormBodyBlock[], baselineDate: string, relative?: { publishedAt: string; url: string }): OwnCommencement {
  const titled: NormBodyBlock[] = [];
  const visit = (blocks: readonly NormBodyBlock[]): void => {
    for (const block of blocks) {
      if (typeof block.title === 'string' && COMMENCEMENT_TITLE.test(block.title)) titled.push(block);
      if (block.children) visit(block.children);
    }
  };
  visit(body);
  if (titled.length === 0) {
    // Verwaltungsvorschriften ohne Überschrift „Inkrafttreten“ (BayMBl. 2022 Nr. 190: „5. ¹Diese Bekanntmachung tritt am
    // 6. April 2022 in Kraft. …“): Die Grundregel benennt sich selbst. Genau ein Glied der obersten Ebene, dessen Text
    // mit ihr beginnt, ist die Vorschrift.
    const own = body.filter((block) => {
      const texts = [block.text, ...(block.children ?? []).filter((child) => child.type === 'paragraphText').map((child) => child.text)].filter((text): text is string => typeof text === 'string');
      return texts.length > 0 && GENERAL_RULE_START.test(texts[0]!);
    });
    if (own.length === 1) titled.push(own[0]!);
  }
  if (titled.length !== 1) return { ok: false, evidence: [], reason: titled.length === 0 ? 'Keine Vorschrift „Inkrafttreten“ im Normtext' : `${titled.length} Vorschriften „Inkrafttreten“ im Normtext` };
  const block = titled[0]!;
  const texts: string[] = [];
  const collect = (entry: NormBodyBlock): void => {
    if (typeof entry.text === 'string') texts.push(entry.text);
    for (const child of entry.children ?? []) if (child.type !== 'footnote') collect(child);
  };
  collect(block);
  const sentences = texts
    .join(' ')
    .split(/(?=[¹²³⁴⁵⁶⁷⁸⁹](?=\S))|(?<=[a-zäöüß)\]]\.)\s+(?=[A-ZÄÖÜ(])|(?=\(\d+\)\s)/u)
    .map((sentence) => sentence.replace(/^[¹²³⁴⁵⁶⁷⁸⁹]+|^\(\d+\)\s*/u, '').trim())
    .filter((sentence) => /(?:tritt|treten)(?![\p{L}])[\s\S]*\bin\s+Kraft/u.test(sentence));
  if (sentences.length === 0) return { ok: false, evidence: [], reason: `„${block.label ?? ''} ${block.title}“ enthält keine Inkrafttretensregel` };
  // Eine Geltungsgrenze der Norm selbst („gelten bis …“, „Dieses Gesetz tritt … außer Kraft“) macht die
  // Geltung am Stichtag zu einer eigenen Frage; sie wird hier nicht entschieden.
  // Nur ein ausdrückliches Außerkrafttreten der ganzen Norm **nach** dem Stichtag ist unschädlich.
  const allText = texts.join(' ');
  const indefinite = /(?:gelten|gilt)\s+bis\b(?:(?!\.\s+[A-ZÄÖÜ¹²³⁴⁵⁶⁷⁸⁹]).)*/u.exec(allText);
  if (indefinite) return { ok: false, evidence: [], reason: `Die Norm begrenzt ihre eigene Geltung („${indefinite[0].slice(0, 140)}“); ob sie am Stichtag galt, ist eine Frage der Stichtagsklassifikation, nicht der Rückrechnung` };
  const expiryEvidence: string[] = [];
  for (const expiry of allText.matchAll(new RegExp(String.raw`(?:Dieses|Diese)\s+${OWN_NOUN}\s+tritt\s+(?:(?!außer\s+Kraft)[\s\S]){0,120}?außer\s+Kraft`, 'gu'))) {
    const date = /(?:mit\s+Ablauf\s+des|am)\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})\s+außer\s+Kraft$/u.exec(expiry[0]);
    const iso = date ? parseLongGermanDate(date[1]!) : undefined;
    if (!iso) return { ok: false, evidence: [], reason: `Außerkrafttreten der Norm ohne lesbares Datum („${expiry[0].slice(0, 140)}“)` };
    if (iso < baselineDate) return { ok: false, evidence: [], reason: `Die Norm tritt nach ihrem eigenen Text am ${iso} außer Kraft – vor dem Stichtag` };
    expiryEvidence.push(`Außerkrafttreten der Norm erst ${iso}, nach dem Stichtag: „${expiry[0]}“`);
  }
  const dates: string[] = [];
  const evidence: string[] = [];
  let general = 0;
  const DATE_PHRASE = /(?:rückwirkend\s+)?(?:am|zum|mit\s+Wirkung\s+vom|mit\s+Wirkung\s+zum)\s+\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4}/gu;
  for (const original of sentences) {
    const { sentence, defects } = repairCommencementSentence(original);
    evidence.push(...defects);
    // Aufzählung: „Abweichend von Abs. 1 treten in Kraft: Art. 9 Nr. 5 mit Wirkung vom 25. März 2020 und Art. 8a … am 1. Mai 2021.“
    const list = /(?:tritt|treten)\s+in\s+Kraft\s*:([\s\S]*)$/u.exec(sentence);
    if (list) {
      const phrases = [...list[1]!.matchAll(DATE_PHRASE)].map((match) => match[0]);
      if (phrases.length === 0 || /Tag\s+nach|Verkündung|Bekanntmachung\s+(?:dieses|dieser)/u.test(list[1]!)) return { ok: false, evidence, reason: `Inkrafttreten der Stammfassung ohne Kalenderdatum: „${sentence.slice(0, 160)}“` };
      for (const phrase of phrases) dates.push(commencementDate(phrase, baselineDate)!);
      evidence.push(`Inkrafttretensvorschrift im Stichtagstext, ${[block.label, block.title].filter(Boolean).join(' ')}: „${original}“`);
      continue;
    }
    const statement = /(?:tritt|treten)\s+([\s\S]+?)\s+in\s+Kraft/u.exec(sentence);
    const phrase = statement ? /((?:rückwirkend\s+)?(?:am|zum|mit\s+Wirkung\s+vom|mit\s+Wirkung\s+zum)\s+\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})\s*$/u.exec(statement[1]!) : null;
    const date = phrase ? commencementDate(phrase[1]!, baselineDate) : undefined;
    if (!date) {
      const rule = relative ? relativeRule(sentence) : undefined;
      if (!rule || !relative) return { ok: false, evidence, reason: `Inkrafttreten der Stammfassung ohne Kalenderdatum: „${sentence.slice(0, 160)}“` };
      const computed = relativeDate(rule, relative.publishedAt);
      general += 1;
      dates.push(computed);
      evidence.push(`Inkrafttretensvorschrift im Stichtagstext, ${[block.label, block.title].filter(Boolean).join(' ')}: „${original}“`, `Verkündungsdatum ${relative.publishedAt} laut Stammverkündung selbst (${relative.url}); ${rule === 'day-after-publication' ? 'Tag danach' : 'erster Tag des Folgemonats'}: ${computed}`);
      continue;
    }
    if (new RegExp(String.raw`^(?:Dieses|Diese|Die|Das)\s+${OWN_NOUN}\s+(?:tritt|treten)`, 'u').test(sentence)) general += 1;
    dates.push(date);
    evidence.push(`Inkrafttretensvorschrift im Stichtagstext, ${[block.label, block.title].filter(Boolean).join(' ')}: „${original}“`);
  }
  if (general !== 1) return { ok: false, evidence, reason: `${general} Grundregeln zum Inkrafttreten der Stammfassung` };
  const latest = [...dates].sort().at(-1)!;
  if (latest > baselineDate) return { ok: false, date: latest, evidence, reason: `Teile der Stammfassung treten erst am ${latest} in Kraft – nach dem Stichtag` };
  return { ok: true, date: latest, evidence: [...evidence, ...expiryEvidence] };
}

export type EffectiveDateVerdict = { ok: true; date: string } | { ok: false; reason: 'effective-on-or-before-baseline' | 'effective-after-evaluation' | 'portal-in-force-mismatch'; detail: string };

/**
 * Ist die Änderung nach dem Stichtag in Kraft getreten – und ist sie die, die den heutigen Text trägt?
 *
 * - Tritt sie (auch nur teilweise) **vor oder am Stichtag** in Kraft, gehört sie zur Stichtagsfassung und
 *   wird **nicht** zurückgerechnet.
 * - Tritt sie (teilweise) erst nach dem Auswertungsstichtag in Kraft, kann der heutige Text sie noch
 *   nicht enthalten.
 * - Das späteste Inkrafttreten muss dem `inkraft` des heutigen Pakets entsprechen; sonst trägt eine
 *   andere Änderung den heutigen Text.
 */
export function effectiveDateVerdict(dates: readonly string[], input: { baselineDate: string; evaluationDate: string; inForceFrom?: string }): EffectiveDateVerdict {
  const sorted = [...dates].sort();
  const early = sorted.filter((date) => date <= input.baselineDate);
  if (early.length > 0) return { ok: false, reason: 'effective-on-or-before-baseline', detail: `Die Änderung tritt (teilweise) am ${early.join(', ')} in Kraft – vor oder am Stichtag; sie gehört zur Stichtagsfassung und wird nicht zurückgerechnet` };
  const late = sorted.filter((date) => date > input.evaluationDate);
  if (late.length > 0) return { ok: false, reason: 'effective-after-evaluation', detail: `Die Änderung tritt (teilweise) erst am ${late.join(', ')} in Kraft; der heutige Text kann sie noch nicht enthalten` };
  const latest = sorted.at(-1)!;
  if (input.inForceFrom !== latest) return { ok: false, reason: 'portal-in-force-mismatch', detail: `Der heutige Text gilt laut Paket seit ${input.inForceFrom ?? '–'}, die Änderung tritt am ${sorted.join(', ')} in Kraft` };
  return { ok: true, date: latest };
}
