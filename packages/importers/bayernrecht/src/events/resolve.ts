/**
 * Zielauflösung: Welche Norm des heutigen Bestands meint ein Verkündungsereignis?
 *
 * Abgleichbestand sind die beiden Enumerationsdateien
 * `data/imports/bayernrecht/enumeration-landesrecht.json` (935 Gesetze, Verordnungen, Verträge; 872
 * davon mit BayRS-Gliederungsnummer) und `…-vwv.json` (1 478 Verwaltungsvorschriften). Beide werden
 * nur **gelesen**; sie entstehen in einem anderen Strang.
 *
 * Fünf strukturierte Identitätsmerkmale sind zugelassen – und nur sie:
 *
 * | Merkmal | Woher | Eindeutigkeit |
 * | --- | --- | --- |
 * | `bayrs` | Gliederungsnummer der Veröffentlichung bzw. aus dem Verkündungstext | global eindeutig |
 * | `fundstelle` | die Fundstelle der Veröffentlichung taucht im Änderungsverlauf der Norm auf | global eindeutig |
 * | `abbreviation` | amtliche Abkürzung, aus dem Verkündungstext | im Bestand zu prüfen |
 * | `exact-title` | vollständiger, nicht bloß ähnlicher Titel | im Bestand zu prüfen |
 * | `ausfertigungsdatum` | Datum der Ausfertigung der Zielnorm | nie allein |
 *
 * **Ähnliche Titel sind kein Merkmal.** Es gibt hier absichtlich kein unscharfes Verfahren: Wer ein
 * Ziel nur „ungefähr“ wiedererkennt, bekommt keine starke Auflösung, sondern einen Reviewfall. Ein
 * Fuzzy-Treffer wäre in einem Register, aus dem später ein Rechtsbestand rekonstruiert wird, der
 * gefährlichste aller Fehler: Er sieht aus wie ein Ergebnis.
 *
 * Für Verwaltungsvorschriften ist die Lage schwächer als für Gesetze: Der Fortführungsnachweis zum
 * BayMBl. führt Gliederungsnummern nur an den **Sachgebietsüberschriften**, nicht an der einzelnen
 * Vorschrift (belegt in `tests/fixtures/bayernrecht/ffn-mbl-excerpt.html`). Die Gliederungsnummer einer
 * BayMBl.-Veröffentlichung (`2230.2-A`) bezeichnet deshalb ein Sachgebiet mit mehreren Vorschriften und
 * ist für sich **kein** Identitätsmerkmal. Sie wird als Sachgebietshinweis mitgeführt; die Identität
 * trägt dort die Fundstelle im Änderungsverlauf oder der exakte Titel.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { IMPORT_DATA_DIR } from '../common/constants.ts';
import { isBayRsNumber, normalizeBayRsNumber } from '../common/paths.ts';
import type { EvidenceStrength } from '../common/evidence.ts';
import type { TargetMatchCriterion, TargetResolution } from './ledger.ts';

export type StockArea = 'landesrecht' | 'vwv';

export interface StockEntry {
  sourceIdentity: string;
  area: StockArea;
  title: string;
  /** Titel ohne Ressortpräfix, Ausfertigungszusatz und Klammerzusätze, kleingeschrieben. */
  normalizedTitle: string;
  bayRsNumber?: string;
  /** Amtliche Abkürzungen aus dem Titel (`(BayKiBiG)`, `(Redaktionsrichtlinien - RedR)`). */
  abbreviations: string[];
  /** Ausfertigungsdatum aus dem Titel, soweit er eines nennt. */
  enactmentDate?: string;
  /** Sachgebiet (Blatt des `sectionPath`) – Hinweis, kein Identitätsmerkmal. */
  sectionLeaf?: string;
  /** Normalisierte Fundstellen aus dem Änderungsverlauf (`baymbl:2023-584`, `gvbl:2024-682`). */
  changeReferences: string[];
}

export interface StockIndex {
  entries: StockEntry[];
  byBayRs: Map<string, StockEntry[]>;
  byAbbreviation: Map<string, StockEntry[]>;
  byNormalizedTitle: Map<string, StockEntry[]>;
  byChangeReference: Map<string, StockEntry[]>;
  bySectionLeaf: Map<string, StockEntry[]>;
  /** Quelle und Stand des Abgleichbestands – erscheint im Bericht. */
  sources: { area: StockArea; path: string; items: number; generatedAt?: string }[];
}

const MONTHS: Readonly<Record<string, string>> = {
  januar: '01', februar: '02', märz: '03', maerz: '03', april: '04', mai: '05', juni: '06',
  juli: '07', august: '08', september: '09', oktober: '10', november: '11', dezember: '12',
};

/** `8. Juli 2005` → `2005-07-08`. Nur die ausgeschriebene deutsche Form; sonst `undefined`. */
export function parseLongGermanDate(value: string): string | undefined {
  const match = /(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\s+(\d{4})/u.exec(value);
  if (!match) return undefined;
  const month = MONTHS[match[2]!.toLowerCase()];
  if (month === undefined) return undefined;
  return `${match[3]}-${month}-${match[1]!.padStart(2, '0')}`;
}

/**
 * Vergleichsform eines Normtitels. Entfernt das Ressortpräfix des Fortführungsnachweises
 * (`Bek StMJ: …`), den Ausfertigungszusatz (`vom 8. Juli 2005 (S. 236)`), Klammerzusätze mit der
 * Abkürzung und alles, was die beiden Quellen unterschiedlich schreiben (Anführungszeichen,
 * Bindestriche, Leerraum). Der Rest muss **Zeichen für Zeichen** übereinstimmen – es gibt keine
 * Ähnlichkeitsschwelle.
 */
export function normalizeTitle(value: string): string {
  return value
    .replace(/^(?:Gem)?Bek\s+[^:]{1,40}:\s*/u, '')
    .replace(/\s*\((?:[^()]|\([^()]*\))*\)\s*$/gu, ' ')
    .replace(/\s+vom\s+\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4}.*$/u, ' ')
    .replace(/\s+in\s+der\s+Fassung\s+der\s+Bekanntmachung\s+vom\s+.*$/u, ' ')
    .replace(/\s*\((?:[^()]|\([^()]*\))*\)\s*/gu, ' ')
    .replace(/[„“”"»«‚‘’']/gu, '')
    .replace(/[\u2010-\u2015\u2212]/gu, '-')
    .replace(/[\u00a0\u202f\u2009]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

/** Abkürzungen aus einem Titel: `(BayKiBiG)`, `(Redaktionsrichtlinien - RedR)`, `(ARD-StV)`. */
export function extractAbbreviations(title: string): string[] {
  const found = new Set<string>();
  for (const match of title.matchAll(/\(([^()]{1,80})\)/gu)) {
    const inner = match[1]!.replace(/[\u2010-\u2015\u2212]/gu, '-');
    // Ein Klammerzusatz kann „Langform - Kurzform“ enthalten; die Abkürzung ist der letzte Teil.
    for (const part of inner.split(/\s+-\s+/u)) {
      const candidate = part.trim();
      if (candidate === '' || candidate.length > 40) continue;
      // Abkürzungen tragen mindestens zwei Großbuchstaben und keine Leerzeichen.
      if (/\s/u.test(candidate)) continue;
      if ((candidate.match(/[A-ZÄÖÜ]/gu) ?? []).length < 2) continue;
      found.add(candidate);
    }
  }
  return [...found];
}

/**
 * Fundstellen aus dem Änderungsverlauf des Fortführungsnachweises in eine Vergleichsform bringen.
 * Erfasst werden die beiden Formen, die die Quellen benutzen:
 *   `Änderung vom 21.11.2023, BayMBl. 2023 Nr. 584`   → `baymbl:2023-584`
 *   `(§ 3 Nr. 1 b V v. 08.03.2001, S. 172)`           → `gvbl:2001-172` (Jahr aus dem Datum)
 *   `(Art. 2 Abk. v. 14.03.2025, 350; 713)`           → `gvbl:2025-350`, `gvbl:2025-713`
 */
export function changeReferences(note: string): string[] {
  const references = new Set<string>();
  for (const match of note.matchAll(/BayMBl\.\s*(\d{4})\s*Nr\.\s*(\d+)/gu)) references.add(`baymbl:${match[1]}-${match[2]}`);
  const gvblYear = /BayMBl\./u.test(note) ? undefined : /v\.\s*\d{1,2}\.\d{1,2}\.(\d{4})/u.exec(note)?.[1];
  if (gvblYear !== undefined) {
    // Der Fortführungsnachweis nennt die GVBl.-Seiten hinter dem Ausfertigungsdatum, mit eigenem
    // Jahrgang, wenn die Verkündung im Folgejahr lag: „v. 14.04.2020, 450; 2021, 14“.
    const tail = note.slice(note.indexOf(gvblYear) + 4);
    let currentYear = gvblYear;
    for (const part of tail.split(/[;]/u)) {
      const explicit = /(\d{4}),\s*(\d{1,4})/u.exec(part);
      if (explicit) {
        currentYear = explicit[1]!;
        references.add(`gvbl:${currentYear}-${explicit[2]}`);
        continue;
      }
      for (const page of part.matchAll(/(?:S\.\s*)?(\d{1,4})\b/gu)) {
        const value = page[1]!;
        if (value.length === 4 && /^(?:19|20)\d{2}$/u.test(value)) continue;
        references.add(`gvbl:${currentYear}-${value}`);
      }
    }
  }
  return [...references];
}

/** Vergleichsform einer Fundstelle einer Veröffentlichung: `baymbl:2023-584`, `gvbl:2024-682`. */
export function publicationReference(organ: 'gvbl' | 'baymbl', volume: number, position: number): string {
  return `${organ}:${volume}-${position}`;
}

interface EnumerationFile {
  generatedAt?: string;
  items?: StockRecord[];
}

/** Rohdatensatz des Abgleichbestands, so wie die Enumerationsdateien ihn führen. */
export interface StockRecord {
  documentId?: string;
  sourceIdentity?: string;
  title?: string;
  bayRsNumber?: string;
  sectionPath?: string[];
  changeNotes?: string[];
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * Baut die Suchindizes aus Rohdatensätzen. Ohne Dateizugriff, damit die Zuordnungsregeln für sich
 * prüfbar bleiben – genau diese Funktion benutzen die Tests mit einem Miniaturbestand.
 */
export function createStockIndex(groups: readonly { area: StockArea; path: string; generatedAt?: string; items: readonly StockRecord[] }[]): StockIndex {
  const index: StockIndex = {
    entries: [],
    byBayRs: new Map(),
    byAbbreviation: new Map(),
    byNormalizedTitle: new Map(),
    byChangeReference: new Map(),
    bySectionLeaf: new Map(),
    sources: [],
  };
  for (const group of groups) {
    index.sources.push({ area: group.area, path: group.path, items: group.items.length, ...(group.generatedAt ? { generatedAt: group.generatedAt } : {}) });
    for (const item of group.items) {
      const sourceIdentity = item.documentId ?? item.sourceIdentity;
      const title = item.title ?? '';
      if (sourceIdentity === undefined || title === '') continue;
      const enactmentDate = parseLongGermanDate(title);
      const entry: StockEntry = {
        sourceIdentity,
        area: group.area,
        title,
        normalizedTitle: normalizeTitle(title),
        ...(item.bayRsNumber && isBayRsNumber(item.bayRsNumber) ? { bayRsNumber: normalizeBayRsNumber(item.bayRsNumber) } : {}),
        abbreviations: extractAbbreviations(title),
        ...(enactmentDate ? { enactmentDate } : {}),
        ...(item.sectionPath?.at(-1) ? { sectionLeaf: item.sectionPath.at(-1)! } : {}),
        changeReferences: (item.changeNotes ?? []).flatMap((note) => changeReferences(note)),
      };
      index.entries.push(entry);
      if (entry.bayRsNumber) push(index.byBayRs, entry.bayRsNumber, entry);
      for (const abbreviation of entry.abbreviations) push(index.byAbbreviation, abbreviation.toLowerCase(), entry);
      if (entry.normalizedTitle !== '') push(index.byNormalizedTitle, entry.normalizedTitle, entry);
      for (const reference of entry.changeReferences) push(index.byChangeReference, reference, entry);
      if (entry.sectionLeaf) push(index.bySectionLeaf, entry.sectionLeaf, entry);
    }
  }
  return index;
}

/** Liest beide Enumerationsdateien und baut die Suchindizes. Schreibt nichts. */
export async function loadStock(root: string): Promise<StockIndex> {
  const groups: { area: StockArea; path: string; generatedAt?: string; items: StockRecord[] }[] = [];
  for (const area of ['landesrecht', 'vwv'] as const) {
    const path = `${IMPORT_DATA_DIR}/enumeration-${area}.json`;
    let file: EnumerationFile;
    try {
      file = JSON.parse(await readFile(join(root, path), 'utf8')) as EnumerationFile;
    } catch {
      throw new Error(`Abgleichbestand fehlt: ${path}. Ohne Enumeration gibt es keine Zielauflösung – erst „enumerate --write“ laufen lassen.`);
    }
    groups.push({ area, path, ...(file.generatedAt ? { generatedAt: file.generatedAt } : {}), items: file.items ?? [] });
  }
  return createStockIndex(groups);
}

export interface TargetCandidate {
  /** Gliederungsnummer, wie die Quelle sie nennt (GVBl.: BayRS; BayMBl.: Sachgebiet mit Ressortkürzel). */
  gliederungsnummer?: string;
  title?: string;
  /**
   * Weitere Lesarten des Titels aus dem Fließtext (siehe `CitedNorm.titleCandidates`). Geprüft wird
   * jede – aber immer nur auf **vollständige** Übereinstimmung. Mehrere Lesarten erhöhen die
   * Trefferquote, nicht die Unschärfe: Was nicht Zeichen für Zeichen passt, passt nicht.
   */
  titleCandidates?: readonly string[];
  abbreviation?: string;
  enactmentDate?: string;
  /** Fundstelle der **Zielnorm** („GVBl. S. 236“), nicht die der Veröffentlichung. */
  targetCitation?: string;
  /** Fundstelle der Veröffentlichung selbst – trifft sie den Änderungsverlauf, ist das Ziel eindeutig. */
  publicationReference?: string;
  /** Belegt das Ereignis das Ende der Vorschrift? Dann gibt es kein `not-applicable`. */
  terminating: boolean;
  /** Ereignis richtet sich gegen eine vorbestehende Vorschrift (amend/repeal/replace/recast/…)? */
  addressesExistingNorm: boolean;
}

/** Kanonische BayRS-Form, soweit die Zeichenkette überhaupt eine sein kann. */
export function canonicalBayRs(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === '' || !isBayRsNumber(trimmed)) return undefined;
  return normalizeBayRsNumber(trimmed);
}

function unique(entries: readonly StockEntry[]): StockEntry | undefined {
  const identities = new Set(entries.map((entry) => entry.sourceIdentity));
  return identities.size === 1 ? entries[0] : undefined;
}

/**
 * Wie stark ist eine Zuordnung? `bayrs` und `fundstelle` sind global eindeutige Kennungen und tragen
 * allein; Abkürzung und exakter Titel tragen allein nur, wenn der Abgleich sie im Bestand als eindeutig
 * bestätigt hat; das Ausfertigungsdatum trägt nie allein. Ohne Bestandsbestätigung (Fall
 * `absent-from-portal`) sind zwei Merkmale nötig, weil Eindeutigkeit dort nicht prüfbar ist.
 */
export function matchStrength(criteria: readonly TargetMatchCriterion[], confirmedInStock: boolean): EvidenceStrength {
  if (criteria.length === 0) return 'insufficient';
  const decisive = criteria.includes('bayrs') || criteria.includes('fundstelle');
  if (confirmedInStock) {
    if (decisive || criteria.includes('abbreviation') || criteria.includes('exact-title')) return 'strong';
    return 'supporting';
  }
  // Ohne Bestandsbestätigung zählt nur, was die Quelle selbst an Merkmalen liefert: mindestens zwei,
  // und mindestens eines davon muss die Vorschrift benennen (Nummer, Fundstelle, Abkürzung oder
  // vollständiger Titel). Ein Ausfertigungsdatum allein benennt keine Vorschrift.
  const naming = criteria.filter((criterion) => criterion !== 'ausfertigungsdatum');
  if (criteria.length >= 2 && naming.length >= 1) return 'strong';
  return 'supporting';
}

/**
 * Löst ein Ziel gegen den Bestand auf. Reine Funktion: kein Datei- und kein Netzzugriff, damit die
 * Regel für sich prüfbar bleibt.
 */
export function resolveTarget(index: StockIndex, candidate: TargetCandidate): TargetResolution {
  const criteria: TargetMatchCriterion[] = [];
  const bayRs = canonicalBayRs(candidate.gliederungsnummer);
  const titles = [...new Set([...(candidate.title === undefined ? [] : [candidate.title]), ...(candidate.titleCandidates ?? [])].map((value) => normalizeTitle(value)).filter((value) => value !== ''))];
  const normalizedTitle = titles[0] ?? '';
  /** Trifft eine der Lesarten den Titel eines Bestandseintrags vollständig? */
  const titleMatches = (entry: StockEntry): boolean => titles.includes(entry.normalizedTitle);
  /** Eine festgestellte, aber noch nicht endgültige Mehrdeutigkeit – die übrigen Merkmale kommen noch. */
  let ambiguity: TargetResolution | undefined;

  // 1. Fundstelle der Veröffentlichung im Änderungsverlauf – die stärkste Zuordnung überhaupt:
  //    Der Bestand selbst sagt, dass genau diese Verkündung genau diese Norm geändert hat.
  if (candidate.publicationReference) {
    const hits = index.byChangeReference.get(candidate.publicationReference) ?? [];
    const hit = unique(hits);
    if (hit) {
      return {
        status: 'resolved',
        matchStrength: matchStrength(['fundstelle'], true),
        sourceIdentity: hit.sourceIdentity,
        ...(bayRs ? { bayRsNumber: bayRs } : {}),
        matchedOn: ['fundstelle'],
        note: `Der Änderungsverlauf von ${hit.sourceIdentity} führt diese Verkündung als Fundstelle (${candidate.publicationReference}).`,
      };
    }
    if (hits.length > 1) {
      // Mantelakt: Eine Verkündung ändert mehrere Normen und steht deshalb in mehreren
      // Änderungsverläufen. Die Fundstelle allein entscheidet dann nicht – aber zusammen mit der
      // Gliederungsnummer, der Abkürzung oder dem vollständigen Titel meistens doch.
      const narrowed = hits.filter(
        (entry) =>
          (bayRs !== undefined && entry.bayRsNumber === bayRs) ||
          titleMatches(entry) ||
          (candidate.abbreviation !== undefined && entry.abbreviations.some((value) => value.toLowerCase() === candidate.abbreviation!.toLowerCase())),
      );
      const narrowHit = unique(narrowed);
      if (narrowHit) {
        const narrowCriteria: TargetMatchCriterion[] = ['fundstelle'];
        if (bayRs !== undefined && narrowHit.bayRsNumber === bayRs) narrowCriteria.push('bayrs');
        if (candidate.abbreviation && narrowHit.abbreviations.some((value) => value.toLowerCase() === candidate.abbreviation!.toLowerCase())) narrowCriteria.push('abbreviation');
        if (titleMatches(narrowHit)) narrowCriteria.push('exact-title');
        if (candidate.enactmentDate && narrowHit.enactmentDate === candidate.enactmentDate) narrowCriteria.push('ausfertigungsdatum');
        return {
          status: 'resolved',
          matchStrength: matchStrength(narrowCriteria, true),
          sourceIdentity: narrowHit.sourceIdentity,
          ...(narrowHit.bayRsNumber ?? bayRs ? { bayRsNumber: (narrowHit.bayRsNumber ?? bayRs)! } : {}),
          matchedOn: narrowCriteria,
          note: `Mantelakt: Die Fundstelle ${candidate.publicationReference} steht im Änderungsverlauf mehrerer Normen; eindeutig wird sie durch ${narrowCriteria.filter((entry) => entry !== 'fundstelle').join(', ')} (${narrowHit.sourceIdentity}).`,
        };
      }
      // Nicht eingrenzbar: Die übrigen Merkmale werden trotzdem noch geprüft, und erst wenn auch sie
      // nichts hergeben, bleibt es bei der Mehrdeutigkeit.
      ambiguity = {
        status: 'ambiguous',
        matchStrength: 'supporting',
        ...(bayRs ? { bayRsNumber: bayRs } : {}),
        matchedOn: ['fundstelle'],
        candidates: [...new Set(hits.map((entry) => entry.sourceIdentity))].sort(),
        note: `Die Fundstelle ${candidate.publicationReference} steht im Änderungsverlauf mehrerer Normen (Mantelakt) und ließ sich mit keinem weiteren Merkmal eingrenzen; keine automatische Entscheidung.`,
      };
    }
  }

  // 2. BayRS-Gliederungsnummer – im Landesrecht global eindeutig.
  if (bayRs) {
    const hits = index.byBayRs.get(bayRs) ?? [];
    const hit = unique(hits);
    if (hit) {
      criteria.push('bayrs');
      if (candidate.abbreviation && hit.abbreviations.some((value) => value.toLowerCase() === candidate.abbreviation!.toLowerCase())) criteria.push('abbreviation');
      if (titleMatches(hit)) criteria.push('exact-title');
      if (candidate.enactmentDate && hit.enactmentDate === candidate.enactmentDate) criteria.push('ausfertigungsdatum');
      return {
        status: 'resolved',
        matchStrength: matchStrength(criteria, true),
        sourceIdentity: hit.sourceIdentity,
        bayRsNumber: bayRs,
        matchedOn: criteria,
        note: `Gliederungsnummer ${bayRs} im Bestand eindeutig (${hit.sourceIdentity}).`,
      };
    }
    if (hits.length > 1) {
      return {
        status: 'ambiguous',
        matchStrength: 'supporting',
        bayRsNumber: bayRs,
        matchedOn: ['bayrs'],
        candidates: [...new Set(hits.map((entry) => entry.sourceIdentity))].sort(),
        note: `Gliederungsnummer ${bayRs} trifft mehrere Bestandseinträge; keine automatische Entscheidung.`,
      };
    }
  }

  // 3. Amtliche Abkürzung – nur, wenn sie im Bestand genau einmal vorkommt.
  if (candidate.abbreviation) {
    const hits = index.byAbbreviation.get(candidate.abbreviation.toLowerCase()) ?? [];
    const hit = unique(hits);
    if (hit) {
      criteria.push('abbreviation');
      if (titleMatches(hit)) criteria.push('exact-title');
      if (candidate.enactmentDate && hit.enactmentDate === candidate.enactmentDate) criteria.push('ausfertigungsdatum');
      return {
        status: 'resolved',
        matchStrength: matchStrength(criteria, true),
        sourceIdentity: hit.sourceIdentity,
        ...(hit.bayRsNumber ? { bayRsNumber: hit.bayRsNumber } : bayRs ? { bayRsNumber: bayRs } : {}),
        matchedOn: criteria,
        note: `Abkürzung ${candidate.abbreviation} im Bestand eindeutig (${hit.sourceIdentity}).`,
      };
    }
  }

  // 4. Exakter Titel – Zeichen für Zeichen nach Normalisierung, keine Ähnlichkeit. Geprüft werden alle
  //    Lesarten; passt genau eine davon auf genau einen Bestandseintrag, ist das Ziel bestimmt.
  if (titles.length > 0) {
    const hits = titles.flatMap((value) => index.byNormalizedTitle.get(value) ?? []);
    const hit = unique(hits);
    if (hit) {
      criteria.push('exact-title');
      if (candidate.enactmentDate && hit.enactmentDate === candidate.enactmentDate) criteria.push('ausfertigungsdatum');
      return {
        status: 'resolved',
        matchStrength: matchStrength(criteria, true),
        sourceIdentity: hit.sourceIdentity,
        ...(hit.bayRsNumber ? { bayRsNumber: hit.bayRsNumber } : bayRs ? { bayRsNumber: bayRs } : {}),
        matchedOn: criteria,
        note: `Titel stimmt nach Normalisierung vollständig mit ${hit.sourceIdentity} überein.`,
      };
    }
    if (hits.length > 1) {
      return {
        status: 'ambiguous',
        matchStrength: 'supporting',
        ...(bayRs ? { bayRsNumber: bayRs } : {}),
        matchedOn: ['exact-title'],
        candidates: [...new Set(hits.map((entry) => entry.sourceIdentity))].sort(),
        note: 'Mehrere Bestandseinträge tragen denselben Titel; keine automatische Entscheidung.',
      };
    }
  }

  // 5. Kein Bestandstreffer. Die Quelle benennt das Ziel aber möglicherweise eindeutig – genau das ist
  //    der interessante Fall: Eine Norm, die es heute nicht mehr gibt.
  const sourceCriteria: TargetMatchCriterion[] = [];
  if (bayRs) sourceCriteria.push('bayrs');
  if (candidate.abbreviation) sourceCriteria.push('abbreviation');
  if (normalizedTitle !== '') sourceCriteria.push('exact-title');
  if (candidate.enactmentDate) sourceCriteria.push('ausfertigungsdatum');
  if (candidate.targetCitation && candidate.targetCitation.trim() !== '') sourceCriteria.push('fundstelle');

  if (ambiguity) return ambiguity;

  if (sourceCriteria.length > 0) {
    const sectionHint = candidate.gliederungsnummer === undefined ? undefined : index.bySectionLeaf.get(candidate.gliederungsnummer.replace(/-[A-Za-zÄÖÜ]+$/u, ''));
    return {
      status: 'absent-from-portal',
      matchStrength: matchStrength(sourceCriteria, false),
      ...(bayRs ? { bayRsNumber: bayRs } : {}),
      matchedOn: sourceCriteria,
      note:
        `Die Quelle benennt das Ziel (${sourceCriteria.join(', ')}), der heutige Portalbestand führt es nicht mehr` +
        (sectionHint === undefined ? '.' : `; im selben Sachgebiet stehen noch ${sectionHint.length} Vorschrift(en).`),
    };
  }

  if (candidate.terminating) {
    return {
      status: 'missing-predecessor',
      matchStrength: 'insufficient',
      matchedOn: [],
      note: 'Die Quelle nennt kein bestimmbares Ziel; das Ende einer Vorschrift ohne benannten Vorgänger bleibt ein Reviewfall.',
    };
  }
  if (!candidate.addressesExistingNorm) {
    return {
      status: 'not-applicable',
      matchStrength: 'insufficient',
      matchedOn: [],
      note: 'Die Veröffentlichung richtet sich nicht gegen eine vorbestehende Vorschrift.',
    };
  }
  return {
    status: 'unidentified',
    matchStrength: 'insufficient',
    matchedOn: [],
    note: 'Kein strukturiertes Identitätsmerkmal in der Quelle; Titelähnlichkeit allein trägt keine Zuordnung.',
  };
}
