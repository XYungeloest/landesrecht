/**
 * Erste Erkennung aus dem Textauszug – Titel, Daten, Serie, Nummer, Organ, Dokumentart und Bezüge.
 *
 * Das ist eine Vorsortierung für die Evidenzprüfung, keine Rechtsentscheidung: Nichts hier wird allein aus dem
 * Dateinamen abgeleitet, und kein Befund macht eine Datei zu geltendem Recht. Die fachliche Einordnung
 * (`documentType`, `promulgationStatus`) wird in der Evidenzprüfung je Land bestätigt oder verworfen.
 */

export const DOCUMENT_TYPES = [
  'gazette',
  'ministerial-gazette',
  'promulgation-notice',
  'repeal-notice',
  'standalone-official-act',
  'legislative-document',
  'draft',
  'annex',
  'press-release',
  'informational',
  'unknown',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const PROMULGATION_STATUSES = ['promulgated', 'promulgation-evidence-only', 'not-promulgated', 'superseded', 'repealed', 'uncertain'] as const;
export type PromulgationStatus = (typeof PROMULGATION_STATUSES)[number];

export interface DetectedFacts {
  /** Erkannter Titel (erste inhaltliche Zeile bzw. Blatttitel). */
  title?: string;
  /** Datum des Dokuments (Ausfertigung, „vom …“), ISO. */
  documentDate?: string;
  /** Ausgabedatum eines Blatts („Ausgegeben zu … am …“), ISO. */
  issueDate?: string;
  /** Alle im Kopf gefundenen Daten (ISO), zur Kontrolle. */
  dates: string[];
  /** Behörde/Normgeber laut Kopf oder Unterschrift. */
  authority?: string;
  /** Blatt oder Serie („Gesetz- und Verordnungsblatt für das Land Westdeutschland“, „Landtag … Drucksache“). */
  series?: string;
  /** Kurzform der Serie, wenn erkennbar (GVBl, MBl, Drucksache, …). */
  seriesKind?: 'gvbl' | 'mbl' | 'abl' | 'drucksache' | 'other';
  /** Herausgabeort („Ausgegeben zu Mainz“). */
  place?: string;
  year?: number;
  /** Ausgabe-/Drucksachennummer wie gedruckt („2“, „03/2025“, „02/19“). */
  number?: string;
  /** Wahlperiode einer Drucksache (römisch, wie gedruckt). */
  legislativePeriod?: string;
  documentType: DocumentType;
  /** Anhaltspunkte für die Einstufung (welche Muster griffen). */
  signals: string[];
  /** Erkannte Bezüge auf andere Dokumente (Drucksachen, Blattfundstellen, genannte Rechtsakte). */
  references: DetectedReference[];
  /** Erlassdatum/Inkrafttreten laut Text („tritt am … in Kraft“), ISO oder Formel. */
  commencement?: string;
  /** Aufhebungs-/Außerkrafttretensformeln. */
  repealMentions: string[];
}

export interface DetectedReference {
  kind: 'drucksache' | 'gazette-citation' | 'act-title' | 'attachment';
  value: string;
}

const MONTHS: Readonly<Record<string, string>> = {
  januar: '01', februar: '02', märz: '03', maerz: '03', april: '04', mai: '05', juni: '06', juli: '07', august: '08', september: '09', oktober: '10', november: '11', dezember: '12',
};

function isCalendarDate(iso: string): boolean {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

/** Deutsche Datumsschreibungen in ISO; behält die Reihenfolge des Auftretens. */
export function findDates(text: string): Array<{ iso: string; index: number; raw: string }> {
  const results: Array<{ iso: string; index: number; raw: string }> = [];
  const long = /\b(\d{1,2})\.\s*(Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})\b/giu;
  for (const match of text.matchAll(long)) {
    const month = MONTHS[match[2]!.toLowerCase()];
    if (!month) continue;
    results.push({ iso: `${match[3]}-${month}-${match[1]!.padStart(2, '0')}`, index: match.index ?? 0, raw: match[0] });
  }
  const numeric = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/gu;
  for (const match of text.matchAll(numeric)) {
    results.push({ iso: `${match[3]}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}`, index: match.index ?? 0, raw: match[0] });
  }
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/gu;
  for (const match of text.matchAll(iso)) results.push({ iso: match[0], index: match.index ?? 0, raw: match[0] });
  // Nur Kalenderdaten, die es gibt („31.02.2026“ fällt heraus).
  return results.filter((date) => isCalendarDate(date.iso)).sort((left, right) => left.index - right.index);
}

const SERIES_PATTERNS: Array<{ pattern: RegExp; kind: DetectedFacts['seriesKind'] }> = [
  { pattern: /Gesetz(?:es)?-?\s*und\s*Verordnungsblatt[^\n]{0,80}/iu, kind: 'gvbl' },
  { pattern: /Ministerialblatt[^\n]{0,80}/iu, kind: 'mbl' },
  { pattern: /Amtsblatt[^\n]{0,80}/iu, kind: 'abl' },
  { pattern: /Landtag[^\n]{0,60}Drucksache[^\n]{0,40}/iu, kind: 'drucksache' },
  { pattern: /Drucksache\s+\d{1,2}\/\d{1,3}/iu, kind: 'drucksache' },
];

const AUTHORITY_PATTERNS = [
  /Ministerpräsident(?:in)?(?:\s+(?:des|von|der)\s+[^\n,]{3,60})?/u,
  /Staatsministerium\s+(?:für|des|der)\s+[^\n,]{3,80}/u,
  /Ministerium\s+(?:für|des|der)\s+[^\n,]{3,80}/u,
  /Landesregierung(?:\s+(?:des|von|der)\s+[^\n,]{3,60})?/u,
  /Staatsregierung(?:\s+(?:des|von|der)\s+[^\n,]{3,60})?/u,
  /Staatskanzlei(?:\s+[^\n,]{3,60})?/u,
  /Landtag(?:\s+[^\n,]{3,60})?/u,
  /Senat(?:\s+[^\n,]{3,60})?/u,
];

function normalizeLine(line: string): string {
  return line.replace(/\s+/gu, ' ').trim();
}

function firstContentLine(lines: string[]): string | undefined {
  for (const raw of lines) {
    const line = normalizeLine(raw);
    if (line.length < 8) continue;
    if (/^(?:Seite|Inhalt|Amtlicher Teil|Nr\.|\d+\s*$)/u.test(line)) continue;
    return line.slice(0, 200);
  }
  return undefined;
}

function detectDocumentType(head: string, full: string, series: DetectedFacts['seriesKind'] | undefined, signals: string[]): DocumentType {
  const lower = head.toLowerCase();
  if (/pressemitteilung|presseinformation|\bpm\b/u.test(lower)) { signals.push('pressemitteilung'); return 'press-release'; }
  if (series === 'gvbl') { signals.push('blatttitel gvbl'); return 'gazette'; }
  if (series === 'mbl' || series === 'abl') { signals.push('blatttitel mbl/abl'); return 'ministerial-gazette'; }
  if (series === 'drucksache') { signals.push('drucksache'); return 'legislative-document'; }
  if (/verkünd(?:e|ige)\s+ich|kraft\s+meines\s+amtes\s+verkünd/u.test(full.toLowerCase())) { signals.push('verkündungsformel'); return 'promulgation-notice'; }
  if (/\b(?:hebe\s+ich|wird\s+aufgehoben|werden\s+aufgehoben|tritt\s+außer\s+kraft|treten\s+außer\s+kraft)\b/u.test(lower) && !/§\s*\d/u.test(head)) { signals.push('aufhebungsformel ohne paragraphen'); return 'repeal-notice'; }
  if (/\banlage\b/u.test(lower) && !/§\s*\d/u.test(head)) { signals.push('anlage'); return 'annex'; }
  if (/\b(?:entwurf|gesetzentwurf)\b/u.test(lower) && !/ausgefertigt|verkündet/u.test(full.toLowerCase())) { signals.push('entwurf'); return 'draft'; }
  if (/\b(?:verordnung|erlass|organisationserlass|gesetz|bekanntmachung|geschäftsordnung|verfügung|satzung)\b/u.test(lower) && /(?:§\s*\d|artikel\s+\d|art\.\s*\d)/iu.test(full)) { signals.push('rechtsakt mit gliederung'); return 'standalone-official-act'; }
  if (/\bmitteilung\b/u.test(lower)) { signals.push('mitteilung'); return 'informational'; }
  return 'unknown';
}

export function detectFacts(text: string, fileName: string): DetectedFacts {
  const lines = text.split('\n');
  const headLines = lines.slice(0, 80);
  const head = headLines.join('\n');
  const signals: string[] = [];
  const references: DetectedReference[] = [];

  let series: string | undefined;
  let seriesKind: DetectedFacts['seriesKind'];
  for (const { pattern, kind } of SERIES_PATTERNS) {
    const match = pattern.exec(head);
    if (match) { series = normalizeLine(match[0]); seriesKind = kind; break; }
  }

  const dates = findDates(head);
  const issue = /Ausgegeben\s+(?:zu|in)\s+([A-ZÄÖÜ][\wäöüß-]+)\s+am\s+(\d{1,2}\.\s*\w+\s+\d{4}|\d{1,2}\.\d{1,2}\.\d{4})/u.exec(head);
  const place = issue?.[1];
  const issueDate = issue ? findDates(issue[2]!)[0]?.iso : undefined;
  const dated = /\b(?:vom|ausgefertigt\s+(?:am|in\s+\S+,?)|am)\s+(\d{1,2}\.\s*\w+\s+\d{4}|\d{1,2}\.\d{1,2}\.\d{4})/iu.exec(head);
  const documentDate = dated ? findDates(dated[1]!)[0]?.iso : dates[0]?.iso;

  let number: string | undefined;
  let year: number | undefined;
  let legislativePeriod: string | undefined;
  const drucksache = /Drucksache\s+(\d{1,2}\/\d{1,3})/iu.exec(head);
  if (drucksache) {
    number = drucksache[1];
    const period = /([IVX]+)\.\s*Wahlperiode/u.exec(head);
    if (period) legislativePeriod = period[1];
  } else {
    const numbered = /\bNr\.?\s*(\d{1,3}(?:\/\d{2,4})?)\b/u.exec(head);
    if (numbered) number = numbered[1];
  }
  const yearMatch = /\b(20[2-9]\d)\b/u.exec(head);
  if (yearMatch) year = Number(yearMatch[1]);
  if (number?.includes('/') && !drucksache) {
    const [, tail] = number.split('/');
    if (tail && tail.length === 4) year = Number(tail);
  }

  let authority: string | undefined;
  for (const pattern of AUTHORITY_PATTERNS) {
    const match = pattern.exec(head);
    if (match) { authority = normalizeLine(match[0]); break; }
  }
  if (!authority) {
    const signature = /Gez(?:eichnet)?\.?:?\s*\n?\s*([^\n]{3,80})/iu.exec(text);
    if (signature) authority = `gez. ${normalizeLine(signature[1]!)}`;
  }

  for (const match of text.matchAll(/Drucksache(?:n)?\s+(\d{1,2}\/\d{1,3}(?:\s*(?:,|und|bis|-|–)\s*\d{1,2}\/?\d{0,3})*)/giu)) references.push({ kind: 'drucksache', value: normalizeLine(match[1]!) });
  for (const match of text.matchAll(/\((?:GV(?:Bl|OBl)?\.?|MBl\.?|ABl\.?|GVBl\.?)\s*[^)]{2,40}\)/gu)) references.push({ kind: 'gazette-citation', value: normalizeLine(match[0]) });
  for (const match of text.matchAll(/\b(?:Gesetz|Verordnung|Erlass)\s+(?:zur|über|zum|betreffend)\s+[^\n.;]{5,120}/gu)) {
    if (references.filter((reference) => reference.kind === 'act-title').length >= 40) break;
    references.push({ kind: 'act-title', value: normalizeLine(match[0]) });
  }
  if (/\bAnlage\s+\d/u.test(text)) references.push({ kind: 'attachment', value: 'Anlagen genannt' });

  const commencementMatch = /tritt\s+(?:am|mit\s+wirkung\s+(?:vom|zum)|zum)\s+([^\n.]{4,60}?)\s+in\s+kraft|tritt\s+am\s+tag(?:e)?\s+nach\s+(?:seiner|ihrer|der)\s+verkündung\s+in\s+kraft/iu.exec(text);
  const commencement = commencementMatch ? normalizeLine(commencementMatch[0]) : undefined;
  const repealMentions = [...text.matchAll(/[^\n.]{0,80}(?:wird\s+aufgehoben|werden\s+aufgehoben|tritt\s+außer\s+kraft|treten\s+außer\s+kraft|außer\s+kraft\s+gesetzt)[^\n.]{0,60}/giu)].map((match) => normalizeLine(match[0])).slice(0, 20);

  const documentType = detectDocumentType(head, text, seriesKind, signals);
  const title = seriesKind === 'gvbl' || seriesKind === 'mbl' || seriesKind === 'abl' ? series : firstContentLine(headLines);
  if (!text.trim()) signals.push(`kein Text (${fileName})`);

  const unique = new Map(references.map((reference) => [`${reference.kind}:${reference.value}`, reference]));
  return {
    ...(title ? { title } : {}),
    ...(documentDate ? { documentDate } : {}),
    ...(issueDate ? { issueDate } : {}),
    dates: [...new Set(dates.map((date) => date.iso))],
    ...(authority ? { authority } : {}),
    ...(series ? { series } : {}),
    ...(seriesKind ? { seriesKind } : {}),
    ...(place ? { place } : {}),
    ...(year !== undefined ? { year } : {}),
    ...(number ? { number } : {}),
    ...(legislativePeriod ? { legislativePeriod } : {}),
    documentType,
    signals,
    references: [...unique.values()],
    ...(commencement ? { commencement } : {}),
    repealMentions,
  };
}
