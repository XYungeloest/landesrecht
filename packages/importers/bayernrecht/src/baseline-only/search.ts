/**
 * Ausgangsverkündung einer Norm, die der Aufhebungsbefehl **ohne Fundstelle** zitiert („1.22 Richtlinien für das
 * Aufstellen von Bauwerksentwürfen (RAB-ING), Ausgabe 2016, Einführungshinweise vom 26. Oktober 2016,“, BayMBl. 2024
 * Nr. 467; „Bekanntmachung … über die Würdigung ehrenamtlicher/freiwilliger Tätigkeit … vom 13. Januar 2015, die durch
 * Bekanntmachung vom 24. Februar 2015 (KWMBl. S. 16) geändert worden ist“, BayMBl. 2024 Nr. 611).
 *
 * Nur die Amtsblätter 2009–2018 haben vollständige Inhaltsübersichten mit Erlassdatum, Titel und Seite. Gesucht wird in
 * den Ausgaben ab dem Erlass bis Ende des Folgejahres. Eine Zeile ist die Norm nur, wenn
 *   - ihr Erlassdatum dem zitierten Ausfertigungsdatum gleicht,
 *   - ihr Titel zum zitierten Titel passt – über Wortüberdeckung (≥ 0,6 in einer Richtung) oder gleiche Abkürzung, nie
 *     nur über die Erlassstelle (ein Zitat nur mit Erlassstelle bestimmt ohne Fundstelle nichts),
 *   - und genau eine Zeile so passt.
 * Nennt das Zitat ein Aktenzeichen, muss die Seite es in ihrer Datumszeile tragen (Prüfung beim Aufrufer). Danach geht
 * die Norm den gewöhnlichen Weg (`resolveBase`: Kopfdatum, Titel, Kette).
 */
import { titleCheck } from './base.ts';
import { isPageMiss, parseAmtsblattIssue, parseAmtsblattVolume, type Platform } from './platform.ts';
import { amtsblattIssueUrl, amtsblattVolumeUrl, MINISTERIAL_JOURNALS, type GazetteReference, type MinisterialJournal } from './references.ts';

export interface ListingMatch {
  reference: GazetteReference;
  journal: MinisterialJournal;
  volume: number;
  title: string;
  issuePublishedAt: string;
}

export type ListingSearch =
  | { ok: true; match: ListingMatch; examined: number; evidence: string }
  | { ok: false; pending?: string; reason: string; examined: number };

/** Zulässiger Zeitraum: Die Amtsblätter mit Inhaltsübersicht erschienen 2009 bis 2018. */
export const LISTING_FIRST_YEAR = 2009;
export const LISTING_LAST_YEAR = 2018;

export async function findInAmtsblattListings(platform: Platform, input: { documentDate: string; citedTitle: string }): Promise<ListingSearch> {
  const year = Number(input.documentDate.slice(0, 4));
  if (year < LISTING_FIRST_YEAR || year > LISTING_LAST_YEAR) return { ok: false, reason: `Erlass ${input.documentDate} außerhalb der Amtsblätter 2009–2018`, examined: 0 };
  const until = `${Math.min(year + 1, LISTING_LAST_YEAR)}-12-31`;
  const rows: Array<{ journal: MinisterialJournal; volume: number; issuePublishedAt: string; page: number; title: string; score: number }> = [];
  let examined = 0;
  for (const volume of [year, year + 1].filter((value) => value <= LISTING_LAST_YEAR)) {
    for (const journal of Object.keys(MINISTERIAL_JOURNALS) as MinisterialJournal[]) {
      const volumeUrl = amtsblattVolumeUrl(journal, volume);
      const volumePage = await platform.get(volumeUrl);
      if (isPageMiss(volumePage)) return { ok: false, pending: volumeUrl, reason: `${volumeUrl}: ${volumePage.detail}`, examined };
      for (const issue of parseAmtsblattVolume(volumePage.html)) {
        if (issue.publishedAt < input.documentDate || issue.publishedAt > until) continue;
        const issueUrl = amtsblattIssueUrl(issue.htmlPath);
        const issuePage = await platform.get(issueUrl);
        if (isPageMiss(issuePage)) return { ok: false, pending: issueUrl, reason: `${issueUrl}: ${issuePage.detail}`, examined };
        examined += 1;
        for (const row of parseAmtsblattIssue(issuePage.html).documents) {
          if (row.enactmentDate !== input.documentDate || !row.htmlPath) continue;
          const check = titleCheck(row.title, input.citedTitle);
          const bySubject = check.overlap >= 0.6 || check.reverseOverlap >= 0.6 || check.sameAbbreviation !== undefined;
          if (bySubject) rows.push({ journal, volume, issuePublishedAt: issue.publishedAt, page: row.page, title: row.title, score: Math.max(check.overlap, check.reverseOverlap) });
        }
      }
    }
  }
  if (rows.length === 0) return { ok: false, reason: `Keine Veröffentlichung vom ${input.documentDate} mit passendem Titel in ${examined} Inhaltsübersicht(en) der Amtsblätter ${year}${year < LISTING_LAST_YEAR ? `–${year + 1}` : ''}`, examined };
  if (rows.length > 1) return { ok: false, reason: `${rows.length} Veröffentlichungen vom ${input.documentDate} passen zum Titel (${rows.map((row) => `${row.journal}. ${row.volume} S. ${row.page}`).join(', ')}) – nicht eindeutig`, examined };
  const row = rows[0]!;
  const reference: GazetteReference = { organ: row.journal, explicitVolume: row.volume, kind: 'page', position: row.page, text: `${row.journal}. ${row.volume} S. ${row.page}` };
  return {
    ok: true,
    match: { reference, journal: row.journal, volume: row.volume, title: row.title, issuePublishedAt: row.issuePublishedAt },
    examined,
    evidence: `Zitat ohne Fundstelle; Inhaltsübersichten der Amtsblätter ${year}${year < LISTING_LAST_YEAR ? `–${year + 1}` : ''} (${examined} Ausgaben ab dem Erlass): genau eine Veröffentlichung vom ${input.documentDate} mit passendem Titel – ${reference.text} „${row.title.slice(0, 120)}“`,
  };
}
