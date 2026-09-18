/**
 * Ist diese Änderung **der einzige Schritt** zwischen Stichtag und heutigem Text?
 *
 * Das Ereignisregister kennt für die Norm genau ein stark zugeordnetes Ereignis nach dem Stichtag. Das
 * allein beweist wenig: Das Register ordnet je Veröffentlichung nur zu, was es strukturell erkennt, und
 * Verwaltungsvorschriften ohne Gliederungsnummer lädt es nicht im Volltext. Deshalb prüft die
 * Rückrechnung die Kette aus vier weiteren, voneinander unabhängigen Richtungen:
 *
 * 1. **Vorwärts, aus dem Portal:** Das Vollzitat des heutigen Textes („…, das zuletzt durch § 2 des
 *    Gesetzes vom 21. November 2025 (GVBl. S. 573) geändert worden ist“) muss genau diese Verkündung
 *    als letzte Änderung nennen – sonst gab es danach noch eine.
 * 2. **Der Änderungsverlauf des Portals** (soweit geführt) darf nach dem Stichtag genau diesen einen
 *    Eintrag tragen.
 * 3. **Rückwärts, aus dem Befehl:** Der Einleitungssatz nennt die vorangehende Änderung („die zuletzt
 *    durch Verordnung vom … geändert worden ist“). Sie muss vor dem Stichtag verkündet sein – sonst lag
 *    zwischen Stichtag und dieser Änderung noch eine. **Verkündet ist nicht in Kraft:** Dass die
 *    vorangehende Fassung am Stichtag galt, muss ihr Inkrafttreten belegen. Die Kette selbst meldet deshalb
 *    jede vorangehende Änderung als `prior-amendment-in-force-unproven`; belegen kann es nur ihre eigene
 *    Verkündung (`priorAmendmentInForce` in `run.ts`, Kalenderdatum aus der Inkrafttretensvorschrift). Ohne
 *    sie bleibt die Norm `partial-chain`. Die Stammfassung belegt ihre eigene Inkrafttretensvorschrift
 *    (`ownCommencement`).
 * 4. **Seitwärts, aus allen übrigen Verkündungen:** Keine andere Verkündung nach dem Stichtag darf die
 *    Norm mit einem Änderungsbefehl zitieren.
 */
import { parseLongGermanDate } from '../events/resolve.ts';
import { clauseAmendments, referenceKey } from './structure.ts';

export interface PublicationKey {
  organ: 'gvbl' | 'baymbl';
  volume: number;
  position: number;
}

export const publicationKeyString = (key: PublicationKey): string => `${key.organ}|${key.volume}|${key.position}`;

/** `GVBl. 2025 S. 573` / `BayMBl. 2024 Nr. 666` → Schlüssel. */
export function publicationKeyFromCitation(citation: string): PublicationKey | undefined {
  const match = /^(GVBl|BayMBl)\.\s*(\d{4})\s*(?:S\.|Nr\.)\s*(\d+)/u.exec(citation.trim());
  if (!match) return undefined;
  return { organ: match[1] === 'GVBl' ? 'gvbl' : 'baymbl', volume: Number(match[2]), position: Number(match[3]) };
}

/**
 * Mögliche Schlüssel einer Fundstelle ohne Jahrgang: Jahrgang des Ausfertigungsdatums, bei einer
 * Ausfertigung im Dezember auch der Folgejahrgang (Verkündung im Januar).
 */
export function candidateKeys(reference: string, date: string | undefined): PublicationKey[] {
  const key = referenceKey(reference);
  if (!key) return [];
  const [organ, year, page] = key.split('|');
  if (organ !== 'gvbl' && organ !== 'baymbl') return [];
  if (year) return [{ organ, volume: Number(year), position: Number(page) }];
  if (!date) return [];
  const volume = Number(date.slice(0, 4));
  const keys: PublicationKey[] = [{ organ, volume, position: Number(page) }];
  if (date.slice(5, 7) === '12') keys.push({ organ, volume: volume + 1, position: Number(page) });
  return keys;
}

const sameKey = (left: PublicationKey, right: PublicationKey): boolean => left.organ === right.organ && left.volume === right.volume && left.position === right.position;

export interface ChainInput {
  baselineDate: string;
  event: PublicationKey;
  /** Vollzitat des heutigen Textes. */
  fullCitation?: string;
  /** Änderungsverlauf des Portals (nur Norm-DTD). */
  changeHistory?: string;
  /** Klausel „zuletzt durch … geändert“ aus dem Einleitungssatz des Änderungsbefehls. */
  priorClause?: string;
  /** Alle Veröffentlichungen mit Verkündung nach dem Stichtag (aus dem Ereignisregister). */
  postBaselinePublications: ReadonlySet<string>;
  /** Andere Verkündungen nach dem Stichtag, deren Einleitungssatz die Norm mit einem Befehl zitiert. */
  otherAmendingPublications: readonly string[];
  /** Änderungsnotizen des Fortführungsnachweises (`enumeration-*.json`, Feld `changeNotes`). */
  registerNotes?: readonly string[];
}

/**
 * Notiz des Fortführungsnachweises → Datum und Fundstelle.
 * `7) §§ 1, 3, 5 geänd. (V v. 21.11.2025, S. 605)` · `(G v. 21.12.2010; 2011, S. 20)` ·
 * `Änderung vom 22.05.2026, BayMBl. 2026 Nr. 225`.
 */
export function registerNote(note: string): { date?: string; keys: PublicationKey[] } {
  const law = /v\.\s*(\d{2})\.(\d{2})\.(\d{4})(?:;\s*(\d{4}))?,\s*S\.\s*(\d+)/u.exec(note);
  if (law) {
    const date = `${law[3]}-${law[2]}-${law[1]}`;
    const keys = law[4] ? [{ organ: 'gvbl' as const, volume: Number(law[4]), position: Number(law[5]) }] : candidateKeys(`GVBl. S. ${law[5]}`, date);
    return { date, keys };
  }
  const vv = /vom\s+(\d{2})\.(\d{2})\.(\d{4}),\s*((?:GVBl|BayMBl|AllMBl|JMBl|FMBl|KWMBl|MABl|StAnz)\.\s*\d{4}\s*(?:S\.|Nr\.)\s*\d+)/u.exec(note);
  if (vv) {
    const date = `${vv[3]}-${vv[2]}-${vv[1]}`;
    return { date, keys: candidateKeys(vv[4]!, date) };
  }
  return { keys: [] };
}

export interface ChainFailure {
  state: 'partial-chain' | 'contradictory';
  reason: string;
  detail: string;
}

/**
 * `failures` leer = die Kette ist einschrittig belegt. `stammfassung`: Der Befehl nennt keine vorangehende
 * Änderung – der Beginn der Stichtagsfassung ist dann über die Inkrafttretensvorschrift der Norm zu belegen.
 */
export interface ChainResult {
  failures: ChainFailure[];
  evidence: string[];
  stammfassung: boolean;
}

/** „zuletzt durch … geändert worden ist“ im Vollzitat → Klausel. */
export function lastAmendmentClause(fullCitation: string | undefined): string | undefined {
  if (!fullCitation) return undefined;
  const match = /(?:die|das|der)\s+(?:zuletzt\s+)?durch\s+([\s\S]+?)\s+geändert\s+worden\s+(?:ist|sind)/u.exec(fullCitation);
  return match?.[1];
}

export interface HistoryEntry {
  text: string;
  date?: string;
  reference?: string;
}

/** Änderungsverlauf „10. § 2 Gesetz … vom 21.11.2025\n(GVBl. S. 573)“ → Einträge. */
export function historyEntries(changeHistory: string | undefined): HistoryEntry[] {
  if (!changeHistory) return [];
  const body = changeHistory.replace(/^Änderungen\s*/u, '');
  const parts = body.split(/\n(?=\d+\.\s)/u).map((part) => part.replace(/\s+/gu, ' ').trim()).filter(Boolean);
  return parts.map((text) => {
    const short = /vom\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/u.exec(text);
    const long = /vom\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})/u.exec(text);
    const date = short ? `${short[3]}-${short[2]!.padStart(2, '0')}-${short[1]!.padStart(2, '0')}` : long ? parseLongGermanDate(long[1]!) : undefined;
    const reference = /\(((?:GVBl|BayMBl|AllMBl|JMBl|FMBl|KWMBl|MABl|StAnz)\.[^)]*)\)/u.exec(text)?.[1]?.trim();
    return { text, ...(date ? { date } : {}), ...(reference ? { reference } : {}) };
  });
}

function isPostBaseline(date: string | undefined, reference: string | undefined, input: ChainInput): { post: boolean; ours: boolean; unknown: boolean } {
  const keys = reference ? candidateKeys(reference, date) : [];
  const ours = keys.some((key) => sameKey(key, input.event));
  if (ours) return { post: true, ours: true, unknown: false };
  const inLedger = keys.some((key) => input.postBaselinePublications.has(publicationKeyString(key)));
  if (inLedger) return { post: true, ours: false, unknown: false };
  if (date && date > input.baselineDate) return { post: true, ours: false, unknown: false };
  if (!date && keys.length === 0) return { post: false, ours: false, unknown: true };
  return { post: false, ours: false, unknown: false };
}

export function checkChain(input: ChainInput): ChainResult {
  const evidence: string[] = [];
  const failures: ChainFailure[] = [];
  const result = (stammfassung: boolean): ChainResult => ({ failures, evidence, stammfassung });
  const stop = (state: ChainFailure['state'], reason: string, detail: string): ChainResult => {
    failures.push({ state, reason, detail });
    return result(input.priorClause === undefined);
  };

  // 1 – Vollzitat des Portals.
  const clause = lastAmendmentClause(input.fullCitation);
  if (clause !== undefined) {
    const amendments = clauseAmendments(clause);
    if (amendments.length !== 1) return stop('partial-chain', 'chain-last-amendment', `Vollzitat nennt ${amendments.length} letzte Änderungen („${clause.slice(0, 120)}“); die Kette ist nicht einschrittig belegt`);
    const only = amendments[0]!;
    const keys = only.reference ? candidateKeys(only.reference, only.date) : [];
    if (!keys.some((key) => sameKey(key, input.event))) return stop('partial-chain', 'chain-last-amendment', `Vollzitat nennt als letzte Änderung „${only.text}“, nicht diese Verkündung`);
    evidence.push(`Vollzitat des Portals: „…${input.fullCitation!.slice(input.fullCitation!.indexOf(clause) - 20).trim()}“ – letzte Änderung ist diese Verkündung`);
  }

  // 2 – Änderungsverlauf des Portals.
  const entries = historyEntries(input.changeHistory);
  if (entries.length > 0) {
    const classified = entries.map((entry) => ({ entry, ...isPostBaseline(entry.date, entry.reference, input) }));
    const unknown = classified.filter((entry) => entry.unknown);
    if (unknown.length > 0) return stop('contradictory', 'chain-history-undated', `Änderungsverlauf mit nicht datierbarem Eintrag („${unknown[0]!.entry.text.slice(0, 100)}“)`);
    const post = classified.filter((entry) => entry.post);
    const ours = post.filter((entry) => entry.ours);
    if (ours.length !== 1) return stop('contradictory', 'chain-history-mismatch', `Änderungsverlauf führt diese Verkündung ${ours.length}-mal`);
    if (post.length !== 1) return stop('partial-chain', 'chain-history-steps', `Änderungsverlauf führt ${post.length} Änderungen nach dem Stichtag (${post.map((entry) => entry.entry.text.slice(0, 60)).join('; ')})`);
    evidence.push(`Änderungsverlauf: nach dem Stichtag nur „${ours[0]!.entry.text}“`);
  }

  // 2a – Fortführungsnachweis (für Verwaltungsvorschriften oft die einzige Änderungsliste).
  const notes = (input.registerNotes ?? []).map((note) => ({ note, ...registerNote(note) }));
  if (notes.length > 0) {
    const undated = notes.filter((entry) => entry.date === undefined);
    if (undated.length > 0) return stop('contradictory', 'chain-register-undated', `Fortführungsnachweis mit nicht lesbarer Notiz („${undated[0]!.note.slice(0, 100)}“)`);
    const classified = notes.map((entry) => ({ ...entry, ours: entry.keys.some((key) => sameKey(key, input.event)), inLedger: entry.keys.some((key) => input.postBaselinePublications.has(publicationKeyString(key))) }));
    const ours = classified.filter((entry) => entry.ours);
    const post = classified.filter((entry) => entry.ours || entry.inLedger || entry.date! > input.baselineDate);
    if (ours.length !== 1) return stop('contradictory', 'chain-register-mismatch', `Fortführungsnachweis führt diese Verkündung ${ours.length}-mal`);
    if (post.length !== 1) return stop('partial-chain', 'chain-register-steps', `Fortführungsnachweis führt ${post.length} Änderungen nach dem Stichtag (${post.map((entry) => entry.note).join('; ')})`);
    if (input.priorClause === undefined && classified.length > 1) return stop('contradictory', 'chain-stamm-register-mismatch', `Der Befehl nennt keine vorangehende Änderung, der Fortführungsnachweis aber ${classified.length - 1}`);
    evidence.push(`Fortführungsnachweis: nach dem Stichtag nur „${ours[0]!.note}“${input.priorClause === undefined ? ', davor keine Änderung' : ''}`);
  }

  if (clause === undefined && entries.length === 0 && notes.length === 0) return stop('partial-chain', 'chain-unverifiable', 'Weder Vollzitat mit letzter Änderung noch Änderungsverlauf noch Fortführungsnachweis: die Einschrittigkeit ist nicht belegbar');

  // 4 – Andere Verkündungen (vor 3, weil 3 nie besteht, wenn es eine vorangehende Änderung gibt).
  if (input.otherAmendingPublications.length > 0) {
    return stop('partial-chain', 'chain-other-publication', `Weitere Verkündung(en) nach dem Stichtag zitieren die Norm mit einem Änderungsbefehl: ${input.otherAmendingPublications.join(', ')}`);
  }
  evidence.push('Keine andere Verkündung nach dem Stichtag zitiert die Norm mit einem Änderungsbefehl');

  // 3 – Vorangehende Änderung laut Befehl.
  if (input.priorClause !== undefined) {
    const prior = clauseAmendments(input.priorClause);
    if (prior.length === 0) return stop('contradictory', 'chain-prior-unreadable', `Vorangehende Änderung im Befehl nicht lesbar („${input.priorClause.slice(0, 120)}“)`);
    for (const amendment of prior) {
      if (!amendment.date) return stop('contradictory', 'chain-prior-undated', `Vorangehende Änderung ohne Datum („${amendment.text}“)`);
      if (isPostBaseline(amendment.date, amendment.reference, input).post) return stop('partial-chain', 'chain-prior-after-baseline', `Vorangehende Änderung „${amendment.text}“ liegt nach dem Stichtag`);
    }
    // Die vorangehende Änderung muss im Änderungsverlauf die letzte vor dieser sein.
    if (entries.length > 0) {
      const pre = entries.filter((entry) => !isPostBaseline(entry.date, entry.reference, input).post);
      const last = pre.at(-1);
      const matchesLast = last?.reference !== undefined && prior.some((amendment) => {
        const priorKeys = amendment.reference ? candidateKeys(amendment.reference, amendment.date) : [];
        const lastKeys = candidateKeys(last.reference!, last.date);
        return priorKeys.some((key) => lastKeys.some((other) => sameKey(key, other)));
      });
      if (!matchesLast) return stop('contradictory', 'chain-prior-history-mismatch', `Vorangehende Änderung laut Befehl („${prior.map((entry) => entry.text).join('; ')}“) ist nicht der letzte Eintrag vor dem Stichtag im Änderungsverlauf („${last?.text ?? '–'}“)`);
    }
    evidence.push(`Vorangehende Änderung laut Befehl: ${prior.map((entry) => entry.text).join('; ')} – vor dem Stichtag verkündet`);
    // Verkündet ist nicht in Kraft. Das Inkrafttreten der vorangehenden Änderung ist offline nicht belegbar.
    failures.push({
      state: 'partial-chain',
      reason: 'prior-amendment-in-force-unproven',
      detail: `Die vorangehende Änderung (${prior.map((entry) => entry.text).join('; ')}) ist vor dem Stichtag verkündet, ihr Inkrafttreten vor dem Stichtag aber aus dem Cache nicht belegt; ohne diesen Beleg ist der Beginn der Stichtagsfassung offen`,
    });
    return result(false);
  }
  evidence.push('Einleitungssatz nennt keine vorangehende Änderung (Stammfassung)');
  const pre = entries.filter((entry) => !isPostBaseline(entry.date, entry.reference, input).post);
  if (pre.length > 0) return stop('contradictory', 'chain-stamm-history-mismatch', `Der Befehl nennt keine vorangehende Änderung, der Änderungsverlauf aber ${pre.length}`);
  return result(true);
}
