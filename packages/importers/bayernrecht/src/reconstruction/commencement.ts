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

/** Glieder im Gegenstand eines Satzes („§ 2“, „die §§ 61 bis 73“, „Nr. 1.3“, „die Nrn. 1.2, 1.13“). */
function subjectRefs(subject: string): string[] | undefined {
  const refs: string[] = [];
  const text = subject.replace(/\s+/gu, ' ').trim();
  for (const match of text.matchAll(/(§§?|Art\.|Nrn?\.)\s*(\d+[a-z]?(?:\.\d+[a-z]?)*)((?:\s*(?:,|und|bis)\s*\d+[a-z]?(?:\.\d+[a-z]?)*)*)/gu)) {
    const kind = match[1]!.startsWith('§') ? '§' : match[1]!.startsWith('Art') ? 'Art.' : 'Nr.';
    if (/bis/u.test(match[3] ?? '')) {
      const bounds = [match[2]!, ...(match[3] ?? '').split(/\s*(?:,|und|bis)\s*/u).filter(Boolean)];
      const range = /(\d+)\s*bis\s*(\d+)/u.exec(`${match[2]}${match[3]}`);
      if (range && !bounds.some((value) => value.includes('.'))) {
        for (let value = Number(range[1]); value <= Number(range[2]); value += 1) refs.push(`${kind} ${value}`);
        continue;
      }
      return undefined;
    }
    refs.push(`${kind} ${match[2]}`);
    for (const extra of (match[3] ?? '').split(/\s*(?:,|und)\s*/u).filter(Boolean)) refs.push(`${kind} ${extra}`);
  }
  return refs.length > 0 ? refs : undefined;
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
      const full = `${unit.label ?? ''} ${unit.text}`.trim();
      const inside = balance > 0 || /^[„‚]/u.test(full);
      balance = Math.max(0, balance + (full.match(/[„‚]/gu)?.length ?? 0) - (full.match(/[“”‘]/gu)?.length ?? 0));
      if (!inside) candidates.push(unit);
    }
  }
  for (const unit of candidates) {
    if (!/in\s+Kraft/u.test(unit.text)) continue;
    // In Sätze zerlegen: an Satznummern, Absatzzeichen und Satzenden vor einem Großbuchstaben.
    const sentences = unit.text
      // Nicht nach „1.“ vor „Januar“ trennen: Satzende ist ein Punkt hinter einem Kleinbuchstaben oder einer Klammer.
      .split(/(?=[¹²³⁴⁵⁶⁷⁸⁹](?=\S))|(?<=[a-zäöüß)\]]\.)\s+(?=[A-ZÄÖÜ(])|(?=\(\d+\)\s)/u)
      .map((sentence) => sentence.replace(/^[¹²³⁴⁵⁶⁷⁸⁹]+|^\(\d+\)\s*/u, '').trim())
      .filter((sentence) => sentence !== '');
    for (const sentence of sentences) {
      // Nur Sätze der Form „… tritt/treten … in Kraft“; „wann sie in Kraft tritt“ ist Normtext, keine Schlussvorschrift.
      if (!/(?:tritt|treten)(?![\p{L}])[\s\S]*\bin\s+Kraft/u.test(sentence)) {
        if (/[Aa]bweichend/u.test(sentence)) unreadable.push(sentence);
        continue;
      }
      if (/außer\s+Kraft/u.test(sentence) && !/(?:^|\s)in\s+Kraft/u.test(sentence.replace(/außer\s+Kraft/gu, ''))) continue;
      const general = /^(?:Dieses|Diese|Die|Das)\s+(?:Gesetz|Verordnung|Bekanntmachung|Satzung|Änderungssatzung|Statut|Richtlinie|Richtlinien|Verwaltungsvorschrift|Änderungsbekanntmachung|Änderungsverordnung)\s+(?:tritt|treten)\s+([\s\S]+?)\s+in\s+Kraft\.?$/u.exec(sentence);
      if (general) {
        const date = commencementDate(general[1]!, eventDate);
        statements.push({ text: sentence, refs: null, ...(date ? { date } : {}) });
        if (!date) unreadable.push(sentence);
        continue;
      }
      // „Abweichend von Satz 1 tritt § 2 am 1. Januar 2027 in Kraft.“ / „… treten die Nrn. 1.2, 1.13 am … in Kraft.“
      const deviation = /(?:tritt|treten)\s+([\s\S]+?)\s+((?:rückwirkend\s+)?(?:am|zum|mit\s+Wirkung\s+vom|mit\s+Wirkung\s+zum)\s+\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})\s+in\s+Kraft\.?$/u.exec(sentence);
      if (deviation && !/\s(?:am|zum)\s+\d/u.test(deviation[1]!)) {
        const refs = subjectRefs(deviation[1]!);
        const date = commencementDate(deviation[2]!, eventDate);
        if (refs && date) {
          statements.push({ text: sentence, refs, date });
          continue;
        }
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
  }
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
 * Beginn der Geltung einer **Stammfassung**, belegt durch die Inkrafttretensvorschrift der Norm selbst –
 * gelesen im **rückgerechneten** Stichtagskörper, also in genau dem Text, dessen Geltung belegt werden
 * soll. Ausfertigung ist nicht Textgeltung; ein Datum wird nie aus dem Ausfertigungsdatum abgeleitet.
 *
 * Belegt ist nur ein **ausdrückliches Kalenderdatum** („tritt am 1. Januar 2005 in Kraft“, „mit Wirkung
 * vom …“). „Am Tag nach der Verkündung“ gilt nicht als Beleg: Die Verkündungen vor dem Stichtag liegen
 * nicht im Cache. Genau eine Vorschrift mit der Überschrift „Inkrafttreten“ muss es geben; jede weitere
 * Inkrafttretensregel darin (abweichende Teile) muss ebenfalls datiert sein.
 */
export function ownCommencement(body: readonly NormBodyBlock[], baselineDate: string): OwnCommencement {
  const titled: NormBodyBlock[] = [];
  const visit = (blocks: readonly NormBodyBlock[]): void => {
    for (const block of blocks) {
      if (typeof block.title === 'string' && COMMENCEMENT_TITLE.test(block.title)) titled.push(block);
      if (block.children) visit(block.children);
    }
  };
  visit(body);
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
  for (const expiry of allText.matchAll(/(?:Dieses|Diese)\s+(?:Gesetz|Verordnung|Bekanntmachung|Satzung|Richtlinie|Richtlinien|Verwaltungsvorschrift)\s+tritt\s+(?:(?!außer\s+Kraft)[\s\S]){0,120}?außer\s+Kraft/gu)) {
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
  for (const sentence of sentences) {
    // Aufzählung: „Abweichend von Abs. 1 treten in Kraft: Art. 9 Nr. 5 mit Wirkung vom 25. März 2020 und Art. 8a … am 1. Mai 2021.“
    const list = /(?:tritt|treten)\s+in\s+Kraft\s*:([\s\S]*)$/u.exec(sentence);
    if (list) {
      const phrases = [...list[1]!.matchAll(DATE_PHRASE)].map((match) => match[0]);
      if (phrases.length === 0 || /Tag\s+nach|Verkündung|Bekanntmachung\s+(?:dieses|dieser)/u.test(list[1]!)) return { ok: false, evidence, reason: `Inkrafttreten der Stammfassung ohne Kalenderdatum: „${sentence.slice(0, 160)}“` };
      for (const phrase of phrases) dates.push(commencementDate(phrase, baselineDate)!);
      evidence.push(`Inkrafttretensvorschrift im Stichtagstext, ${[block.label, block.title].filter(Boolean).join(' ')}: „${sentence}“`);
      continue;
    }
    const statement = /(?:tritt|treten)\s+([\s\S]+?)\s+in\s+Kraft/u.exec(sentence);
    const phrase = statement ? /((?:rückwirkend\s+)?(?:am|zum|mit\s+Wirkung\s+vom|mit\s+Wirkung\s+zum)\s+\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})\s*$/u.exec(statement[1]!) : null;
    const date = phrase ? commencementDate(phrase[1]!, baselineDate) : undefined;
    if (!date) return { ok: false, evidence, reason: `Inkrafttreten der Stammfassung ohne Kalenderdatum: „${sentence.slice(0, 160)}“` };
    if (/^(?:Dieses|Diese|Die|Das)\s+(?:Gesetz|Verordnung|Bekanntmachung|Satzung|Statut|Richtlinie|Richtlinien|Verwaltungsvorschrift|Verwaltungsvorschriften)\s+(?:tritt|treten)/u.test(sentence)) general += 1;
    dates.push(date);
    evidence.push(`Inkrafttretensvorschrift im Stichtagstext, ${[block.label, block.title].filter(Boolean).join(' ')}: „${sentence}“`);
  }
  if (general !== 1) return { ok: false, evidence, reason: `${general} Grundregeln zum Inkrafttreten der Stammfassung` };
  const latest = [...dates].sort().at(-1)!;
  if (latest > baselineDate) return { ok: false, evidence, reason: `Teile der Stammfassung treten erst am ${latest} in Kraft – nach dem Stichtag` };
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
