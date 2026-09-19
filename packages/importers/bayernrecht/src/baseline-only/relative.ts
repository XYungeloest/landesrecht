/**
 * Relatives Inkrafttreten („am Tag nach der Veröffentlichung“, „am ersten Tag des auf die Verkündung folgenden
 * Monats“) – zulässig nach der Entscheidung des Koordinators zu Lauf 7, nur unter zwei Bedingungen:
 *
 * 1. Das Datum folgt eindeutig aus dem **amtlich gedruckten Veröffentlichungsdatum der Verkündung selbst**: dem
 *    Seitenkopf der BayMBl.-Detailseite („Veröffentlichung BayMBl. 2023 Nr. 295 vom 14.06.2023“), dem Ausgabevermerk
 *    der Amtsblatt-Detailseite („KWMBl. 2016/10 vom 13.09.2016“) bzw. der GVBl.-Ausgabe („Ausgabe 2024/11 vom
 *    14.06.2024“).
 * 2. Dieses Datum stimmt mit dem **Register** überein: dem Ereignisregister (Verkündungen ab dem 2. Dezember 2023),
 *    sonst der Trefferliste bzw. Inhaltsübersicht der Plattform, aus der die Verkündung stammt.
 *
 * Das Veröffentlichungsdatum selbst ist nie das Inkrafttreten: „am Tag der Veröffentlichung“ wird nicht gelesen,
 * und ohne ausdrückliche Vorschrift gibt es kein Datum. Dieselbe Regel wie `reconstruction/commencement.ts#
 * datedCommencement` (Agent R, Lauf 6); hier zusätzlich „Veröffentlichung“ und „Bekanntgabe“, weil die
 * Veröffentlichung auf der Verkündungsplattform die amtliche Bekanntmachung ist (Nutzungshinweise zum BayMBl.).
 */
import { htmlToText, parseGermanDate } from '../events/listings.ts';

/** Gegenstand einer eigenen Inkrafttretensvorschrift („Diese Bekanntmachung“, „Die Dienstvereinbarung“ …). */
export const RELATIVE_SUBJECT = String.raw`(?:Diese[rs]?|Die|Das|Sie|Er|Es)(?:\s+(?:Gemeinsame\s+)?(?:Bekanntmachung|Richtlinien?|Verwaltungsvorschriften?|Vorschriften|Verordnung|Regelungen|Bestimmungen|Grundsätze|Anordnung|Dienstanweisung|Dienstordnung|Dienstvereinbarung|Vereinbarung|Geschäftsordnung|Hinweise|Satzung|Änderungsbekanntmachung))?`;
const PUBLICATION_NOUN = String.raw`(?:Verkündung|Bekanntmachung|Veröffentlichung|Bekanntgabe)`;
const POSSESSIVE = String.raw`(?:der|ihrer|seiner|dieser)`;
const ORGAN_TAIL = String.raw`(?:\s+(?:im|in\s+dem)\s+(?:Bayerischen\s+Ministerialblatt|Allgemeinen\s+Ministerialblatt|Amtsblatt[\p{L}\s]*?|BayMBl\.|AllMBl\.))?`;

const DAY_AFTER = new RegExp(String.raw`^${RELATIVE_SUBJECT}\s+(?:tritt|treten)\s+am\s+Tag(?:e)?\s+nach\s+${POSSESSIVE}\s+${PUBLICATION_NOUN}${ORGAN_TAIL}\s+in\s+Kraft\b`, 'u');
const FIRST_OF_NEXT_MONTH = new RegExp(String.raw`^${RELATIVE_SUBJECT}\s+(?:tritt|treten)\s+am\s+ersten\s+Tag\s+des\s+auf\s+(?:die|ihre|seine)\s+${PUBLICATION_NOUN}${ORGAN_TAIL}\s+folgenden\s+(?:Kalender)?[Mm]onats\s+in\s+Kraft\b`, 'u');

export type RelativeRule = 'day-after-publication' | 'first-day-of-following-month';

export function addIsoDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function firstOfNextMonth(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

/** Welche relative Regel spricht der Satz aus? `undefined`, wenn keine (dann gilt er nicht als relatives Inkrafttreten). */
export function relativeRule(sentence: string): RelativeRule | undefined {
  const text = sentence.replace(/\s+/gu, ' ').trim();
  if (DAY_AFTER.test(text)) return 'day-after-publication';
  if (FIRST_OF_NEXT_MONTH.test(text)) return 'first-day-of-following-month';
  return undefined;
}

/** Datum aus Regel und Veröffentlichungsdatum. */
export function relativeDate(rule: RelativeRule, publishedAt: string): string {
  return rule === 'day-after-publication' ? addIsoDays(publishedAt, 1) : firstOfNextMonth(publishedAt);
}

/**
 * Das Veröffentlichungsdatum, das die Verkündung **selbst** druckt: BayMBl. im Seitenkopf („Veröffentlichung BayMBl.
 * 2023 Nr. 295 vom 14.06.2023“), Amtsblätter im Ausgabevermerk des PDF-Verweises („KWMBl. 2016/10 vom 13.09.2016“ –
 * der Seitenkopf der Amtsblätter nennt das Erlassdatum), GVBl. in der Ausgabe („Ausgabe 2024/11 vom 14.06.2024“).
 */
export function ownPublicationDate(html: string, organ: string): string | undefined {
  if (organ === 'BayMBl') {
    const headline = htmlToText(/<h1[^>]*>([\s\S]*?)<\/h1>/u.exec(html)?.[1] ?? '');
    if (!/^Veröffentlichung\s+BayMBl\./u.test(headline)) return undefined;
    return parseGermanDate(/vom\s+(\d{1,2}\.\d{1,2}\.\d{4})/u.exec(headline)?.[1] ?? '');
  }
  const label = /aria-label="Link zum PDF\s*([^"]*)"/u.exec(html)?.[1] ?? '';
  if (organ === 'GVBl') return parseGermanDate(/vom\s+(\d{1,2}\.\d{1,2}\.\d{4})/u.exec(label)?.[1] ?? '');
  const issue = new RegExp(String.raw`^${organ}\.\s*\d{4}/\d+\s+vom\s+(\d{1,2}\.\d{1,2}\.\d{4})`, 'u').exec(label.trim());
  return issue ? parseGermanDate(issue[1]!) : undefined;
}

export interface PublicationDate {
  ok: boolean;
  date?: string;
  reason?: string;
  evidence: string[];
}

/**
 * Bedingung 1 und 2: Veröffentlichungsdatum der Verkündung selbst und des Registers, beide lesbar und gleich.
 * `registerSource` benennt das Register (Ereignisregister, Trefferliste, Inhaltsübersicht) für den Beleg.
 */
export function checkedPublicationDate(input: { ownDate?: string; registerDate?: string; url: string; registerSource: string }): PublicationDate {
  if (!input.ownDate) return { ok: false, reason: `Veröffentlichungsdatum nicht in der Verkündung selbst lesbar (${input.url})`, evidence: [] };
  if (!input.registerDate) return { ok: false, reason: `Veröffentlichungsdatum ${input.ownDate} ohne Gegenstück im Register (${input.registerSource})`, evidence: [] };
  if (input.ownDate !== input.registerDate) return { ok: false, reason: `Veröffentlichungsdatum widersprüchlich: Verkündung ${input.ownDate}, ${input.registerSource} ${input.registerDate}`, evidence: [] };
  return { ok: true, date: input.ownDate, evidence: [`Veröffentlichungsdatum ${input.ownDate} laut Verkündung selbst (${input.url}) und ${input.registerSource}`] };
}

/**
 * Inkrafttretensvorschriften der Plattformfassung sprechen oft von der „Veröffentlichung“; `commencement.ts` liest nur
 * „Verkündung“ und „Bekanntmachung“. Für dessen Regeln wird in relativen Inkrafttretenssätzen („… tritt am Tag nach der
 * Veröffentlichung in Kraft“, „… am ersten Tag des auf die Veröffentlichung folgenden Monats in Kraft“) nur dieses eine
 * Wort angeglichen; jeder andere Text bleibt, wie er ist.
 */
export function alignPublicationNoun(text: string): string {
  return text
    .replace(/(\b(?:tritt|treten)\s+am\s+Tag(?:e)?\s+nach\s+(?:der|ihrer|seiner|dieser)\s+)(?:Veröffentlichung|Bekanntgabe)(?=(?:\s+(?:im|in\s+dem)\s+[^.]{0,60}?)?\s+in\s+Kraft\b)/gu, '$1Verkündung')
    .replace(/(\b(?:tritt|treten)\s+am\s+ersten\s+Tag\s+des\s+auf\s+(?:die|ihre|seine)\s+)(?:Veröffentlichung|Bekanntgabe)(?=(?:\s+(?:im|in\s+dem)\s+[^.]{0,60}?)?\s+folgenden\s+(?:Kalender)?[Mm]onats\s+in\s+Kraft\b)/gu, '$1Verkündung');
}

/**
 * Quellfehler „tritt mit am 22. Juni 2023 in Kraft“ (BayMBl. 2023 Nr. 310): Beide denkbaren Lesarten – „mit Wirkung vom
 * 22. Juni 2023“ und „am 22. Juni 2023“ – ergeben denselben Tag. Gelesen als „am“, die Korrektur steht als Beleg im
 * Rezept (wie `reconstruction/commencement.ts#repairCommencementSentence`).
 */
export function repairOwnCommencement(sentence: string): { sentence: string; defects: string[] } {
  const defects: string[] = [];
  const repaired = sentence.replace(/\b(tritt|treten)\s+mit\s+am\s+(\d{1,2}\.)/gu, (match, verb: string, day: string) => {
    defects.push(`Quellfehler in der Inkrafttretensregel: „${verb} mit am“ – beide Lesarten („mit Wirkung vom“, „am“) ergeben denselben Tag; gelesen als „${verb} am“`);
    return `${verb} am ${day}`;
  });
  return { sentence: repaired, defects };
}
