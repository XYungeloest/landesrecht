/**
 * Reproduzierbarer Prioritätsscore `reviewPriority` für die Arbeitsplanung der Review-Queue.
 *
 * Der Score ist eine Arbeitshilfe: Er ordnet, welche Stammnormen zuerst fachlich geprüft, recherchiert
 * oder transkribiert werden sollten. Er ist **kein** Rechtsstatus, keine Geltungsaussage und ändert keine
 * Entscheidung – die Belegpflicht (`docs/RECHT_NRW_LRMB_IMPORT.md`) bleibt unberührt.
 *
 * Faktoren (alle deterministisch aus Manifest, Review-Queue und Enumeration; Summe = Score):
 *
 *   Quelltyp             Gesetz +30, Rechtsverordnung +25, Allgemeine VwV +25, VwV +22, Durchführungserlass +18,
 *                        Runderlass +15, Richtlinie +15, sonstige +8, unbekannt +5; Portaltyp Bekanntmachung −10
 *   Stichtagsrelevanz    am Stichtag geltend +25, unbestimmt +10, nicht geltend −40, ausgeschlossen −40
 *   Gesetzesbezug        Titel „… zum/zur … gesetz/verordnung“, „VV zu §“, Ausführungs-/Durchführungsvorschrift +10
 *   Verwaltungsrelevanz  breiter Anwenderkreis laut Titel (Beamte, Haushalt, Polizei, Schule, Bau, Vergabe …) +5
 *   Referenzhäufigkeit   Nennungen der Abkürzung in anderen Titeln des Bestands: +3 je Nennung, höchstens +15
 *   Blocker              mindestens ein blockierender Befund (Norm fehlt im Bestand) +15
 *   Beleglage            starke Belege vorhanden +8, nur unterstützende +3, keine Belege bei unbestimmter Geltung −5
 *   PDF-only             Normtext oder Regelungsgehalt nur als PDF −10, zusätzlich −1 je 20 Seiten (höchstens −15);
 *                        Anlage „nicht abgedruckt“ und nicht verlinkt −15
 *   Rekonstruktion       geschätzte Befehle −1 je 5 (höchstens −20); Änderungsquellen unvollständig −5;
 *                        Rekonstruktion unsicher −5
 *   Parserbefund         blockierender Struktur-/Integritätsbefund +5 (systematisch behebbar, wirkt auf viele Normen)
 *   Offene Befunde       −1 je weiterem offenen Befund (höchstens −10)
 *   Altdatensatz         undatiert und Ausfertigung vor 1990 −5; Suchindex nennt Außerkrafttreten vor dem Stichtag
 *                        −15 (nur Hinweis, kein Beleg)
 *
 * Bänder: A ≥ 60, B ≥ 40, C ≥ 20, D darunter. Gleichstand wird nach Term-ID aufgelöst.
 */
import { splitTitle } from '../lrgv/normalize.ts';
import type { SearchSignals } from './enumeration.ts';
import type { ManifestEntry } from './manifest.ts';
import type { ReviewItem } from './review-queue.ts';

export type PriorityBand = 'A' | 'B' | 'C' | 'D';

export interface ReviewPriority {
  score: number;
  band: PriorityBand;
  factors: string[];
}

export interface PriorityContext {
  baselineDate: string;
  /** Nennungen der Abkürzung/Kurzbezeichnung in anderen Titeln des Bestands. */
  referenceCount?: number;
  indexSignals?: SearchSignals;
}

const TYPE_WEIGHT: Record<string, number> = { gesetz: 30, rechtsverordnung: 25, 'allgemeine-verwaltungsvorschrift': 25, verwaltungsvorschrift: 22, durchfuehrungserlass: 18, runderlass: 15, richtlinie: 15, 'sonstige-verwaltungsvorschrift': 8 };
const LAW_RELATION = /\b(?:zum|zur|zu\s+§|zu\s+den|zu\s+Artikel)\b[^()]*?(?:gesetz|verordnung|ordnung|LHO|GO|BauO|LBG|SGB)\b|\bVV\s+zu\s+§|\b(?:Ausführungs|Durchführungs)(?:bestimmungen|vorschriften|verordnung|erlass)\b|\bAG\s+\p{Lu}/u;
const BROAD_SUBJECTS = /Beamt|Besoldung|Beihilfe|Haushalt|Polizei|Schul|Hochschul|Steuer|Bau|Umwelt|Kommun|Gemeinde|Ordnungsbeh|Datenschutz|Reisekosten|Vergabe|Zuwendung|Förder|Verwaltungsverfahren|Personal|Dienst|Kranken|Rettung|Feuerwehr|Katastroph|Wasser|Abfall|Immission|Verkehr|Straßen|Wohn|Sozial|Jugend|Kinder|Ausländer|Wahl/u;

export function bandOf(score: number): PriorityBand {
  if (score >= 60) return 'A';
  if (score >= 40) return 'B';
  if (score >= 20) return 'C';
  return 'D';
}

function pdfPages(entry: ManifestEntry): number {
  return (entry.attachments ?? []).filter((attachment) => /pdf/iu.test(attachment.mediaType)).reduce((sum, attachment) => sum + (attachment.pdf?.pages ?? 0), 0);
}

export function reviewPriority(entry: ManifestEntry | undefined, items: readonly ReviewItem[], context: PriorityContext): ReviewPriority {
  const factors: string[] = [];
  let score = 0;
  const add = (value: number, label: string): void => {
    if (value === 0) return;
    score += value;
    factors.push(`${label} (${value > 0 ? '+' : '−'}${Math.abs(value)})`);
  };
  const open = items.filter((item) => item.status === 'open');
  const blocking = open.filter((item) => item.severity === 'blocking');

  if (entry) {
    add(TYPE_WEIGHT[entry.sourceDocumentType] ?? 5, `Quelltyp ${entry.sourceDocumentType}`);
    if (entry.sourceType === 'bekanntmachung') add(-10, 'Portaltyp Bekanntmachung (selten normativ)');
    if (entry.importStatus === 'excluded') add(-40, 'ausgeschlossen (Normativität)');
    else if (entry.baselineStatus === 'active-at-baseline') add(25, 'am Stichtag geltend');
    else if (entry.baselineStatus === 'undetermined') add(10, 'Geltung am Stichtag unbestimmt');
    else add(-40, 'nicht am Stichtag geltend');
    if (LAW_RELATION.test(entry.sourceTitle)) add(10, 'Vorschrift zu einem Gesetz oder einer Verordnung');
    if (BROAD_SUBJECTS.test(entry.sourceTitle)) add(5, 'breiter Anwenderkreis laut Titel');
  } else {
    add(5, 'ohne Manifesteintrag (Quelle ohne Stammnorm-Kennung)');
  }
  const references = Math.min(15, 3 * (context.referenceCount ?? 0));
  if (references > 0) add(references, `Referenzhäufigkeit ${context.referenceCount} Titelnennung(en)`);
  if (blocking.length > 0) add(15, `${blocking.length} blockierende(r) Befund(e), Norm fehlt im Bestand`);

  if (entry) {
    const evidence = entry.validityEvidence.filter((item) => item.supports !== 'contradiction');
    if (evidence.some((item) => item.strength === 'strong')) add(8, 'starke Belege vorhanden');
    else if (evidence.some((item) => item.strength === 'supporting')) add(3, 'nur unterstützende Belege');
    else if (entry.baselineStatus === 'undetermined' && entry.importStatus !== 'excluded') add(-5, 'keine Belege zur Geltung');

    if (entry.textCompleteness === 'pdf-only' || entry.textCompleteness === 'pdf-only-essential-attachments') {
      const pages = pdfPages(entry);
      add(-10 - Math.min(15, Math.floor(pages / 20)), `Regelungsgehalt nur als PDF (${pages} Seiten)`);
    } else if (entry.textCompleteness === 'essential-attachment-missing') {
      add(-15, 'wesentliche Anlage nicht verlinkt');
    }
    if (entry.reconstructionPlan) {
      const effort = Math.min(20, Math.floor(entry.reconstructionPlan.estimatedSteps / 5));
      add(-effort, `Rekonstruktionsaufwand ${entry.reconstructionPlan.estimatedSteps} Befehle`);
      if (entry.reconstructionPlan.sourceCompleteness < 1) add(-5, `Änderungsquellen unvollständig (${Math.round(entry.reconstructionPlan.sourceCompleteness * 100)} %)`);
    }
  }
  if (blocking.some((item) => item.category === 'reconstruction-uncertain')) add(-5, 'Rekonstruktion unsicher');
  if (blocking.some((item) => item.category === 'unknown-structure' || item.category === 'text-integrity')) add(5, 'blockierender Parserbefund (systematisch behebbar)');
  if (open.length > 1) add(-Math.min(10, open.length - 1), `${open.length} offene Befunde`);

  if (entry?.sourceArea === 'lrmb' && !entry.sourceVersion.validFrom) {
    const issued = context.indexSignals?.dateOfIssue ?? entry.sourceValidFrom;
    if (issued && issued < '1990-01-01') add(-5, `undatierter Altdatensatz, Ausfertigung ${issued.slice(0, 4)}`);
  }
  const outforce = context.indexSignals?.outforceDate;
  if (outforce && outforce <= context.baselineDate) add(-15, `Suchindex nennt Außerkrafttreten ${outforce} (Hinweis, kein Beleg)`);

  return { score, band: bandOf(score), factors };
}

/**
 * Referenzhäufigkeit: Wie oft nennt ein anderer Titel des Bestands die Abkürzung dieser Vorschrift?
 * Nur Abkürzungen mit mindestens drei Buchstaben; Zählung wortgenau, Groß-/Kleinschreibung beachtet.
 */
export function buildReferenceCounts(entries: readonly ManifestEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  const corpus = entries.map((entry) => `${entry.sourceIdentity}\t${entry.sourceTitle.replace(/\s+/gu, ' ')}`).join('\n');
  const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  for (const entry of entries) {
    const abbr = splitTitle(entry.sourceTitle).abbr?.replace(/\s+(?:NRW|NW)$/u, '').trim();
    if (!abbr || abbr.replace(/[^\p{L}]/gu, '').length < 3) continue;
    const pattern = new RegExp(`^(?!${escape(entry.sourceIdentity)}\\t).*(?<![\\p{L}\\d])${escape(abbr)}(?![\\p{L}\\d])`, 'gmu');
    const count = (corpus.match(pattern) ?? []).length;
    if (count > 0) counts.set(entry.sourceIdentity, count);
  }
  return counts;
}
