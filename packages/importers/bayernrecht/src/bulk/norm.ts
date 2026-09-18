/**
 * Der Weg einer einzelnen Norm im Bulk-Lauf: Paket → Parser → Auswahl → Überleitung → Prüfung →
 * Bestand. Ein Kandidat, ein Ergebnis, ein Manifesteintrag.
 *
 * **Warum erst das Paket und dann die Auswahl.** Ein abgelehnter Kandidat soll nicht nur abgelehnt
 * sein, sondern belegbar abgelehnt: Der Manifesteintrag trägt Quelladresse, SHA-256, Titel, reale
 * Quellgeltung und den `decisionTrace`. Diese Angaben stehen im Exportpaket, nicht in der
 * Klassifikation. Deshalb wird jedes klassifizierte Dokument gelesen und geparst und erst danach
 * entschieden – transformiert wird nur, was übernommen werden darf.
 *
 * **Sperrgründe.** Keine Norm wird übernommen, solange einer von ihnen gilt:
 *   Stichtag         `undetermined`, nichtleere `blockers[]`, ein anderer Weg als `current-unchanged`
 *                    oder `reverse-amendment` mit Rezept
 *   Rückrechnung     Rezept passt nicht zum Paket (Prüfsumme, Inkrafttreten), Beginn der Stichtagsfassung
 *                    nicht belegt, Änderungsbeleg fehlt im Cache, oder der Rundlauf (rückwärts, dann
 *                    vorwärts) ergibt nicht byteidentisch den heutigen Körper
 *   Umfang           Scope-Entscheidung `review` (Normativitätsreview)
 *   Parserabweichung ein `error`-Befund des Parsers (unbekannte Struktur)
 *   Assets           im XML referenzierte Beilagen fehlen im Paket (`referenced-file-missing`)
 *   Identität        das Paket trägt eine andere Dokumentkennung als angefordert
 *   Unversehrtheit   der nachgerechnete SHA-256 weicht von der Begleitdatei ab
 *   Überleitung      `error`-Befund der Transformation, Restpostenprüfung oder Schemaprüfung
 *   Evidenz          die Belegkette trägt die Stichtagsgeltung nicht (Regeln A/B/C in evidence.ts)
 * Jeder Sperrgrund erzeugt einen Review-Fall mit Begründung; keiner bricht den Lauf ab.
 *
 * **Zeitmodell.** `simulationValidFrom` ist für jede übernommene Norm der Stichtag – die Simulation
 * beginnt dort. Die reale Quellgeltung (`sourceValidFrom`/`sourceValidTo`) bleibt davon getrennt und
 * trägt, was die Quelle sagt; im Regelfall dieser Ausbaustufe liegt sie **vor** dem Stichtag und
 * reicht darüber hinaus. Beides in einem Feld zu führen wäre der Fehler, den dieser Adapter nicht
 * machen darf.
 *
 * **Reihenfolge der Schreibvorgänge** (jeder für sich atomar): Norm → Slug-Registry → Manifest →
 * Review. Bricht der Lauf dazwischen ab, bleibt der Kandidat im Zustand `processing` und wird beim
 * Resume vollständig wiederholt; jeder Schritt ist für sich wiederholbar, und der Vergleich vor dem
 * Schreiben verhindert, dass die Wiederholung etwas verändert.
 */
import { retrievalDate, type ImportFinding } from '@landesrecht/importer-common/pipeline.ts';
import { previousDay, type NormRecord, type SourceReference } from '@landesrecht/legal-core/lib/schema.ts';

import { TARGET_JURISDICTION, PARSER_VERSION, type SourceArea } from '../common/constants.ts';
import { assessBaselineValidity, type ValidityEvidence } from '../common/evidence.ts';
import {
  isImportedStatus,
  manifestEntryDefaults,
  validateManifestEntry,
  writeManifestEntry,
  type ImportStatus,
  type ManifestEntry,
  type SourceProvenance,
} from '../common/manifest.ts';
import { isBayRsNumber } from '../common/paths.ts';
import {
  mergeReviewItems,
  reviewStatusFor,
  writeReviewShard,
  type ReviewItemInput,
  type ReviewQueue,
} from '../common/review.ts';
import { createSlugReserver, writeSlugRegistry, type SlugRegistry, type SlugReservation } from '../common/slug-registry.ts';
import { parseBayernRechtPackage, type BayernRechtDocument } from '../parse/index.ts';
import { readBayernRechtPackage } from '../parse/package.ts';
import { assessTextIntegrity } from '../inventory/document.ts';
import { auditRecord } from '../transform/audit-record.ts';
import type { CompiledInstitutionRegistry } from '../transform/institution-registry.ts';
import { TRANSFORMER_VERSION } from '../transform/rules.ts';
import { transformToBayWue } from '../transform/transform.ts';
import { applyReverseRecipe, verifyRoundTrip } from '../reconstruction/apply.ts';
import { recipeProblems, type ReconstructionRecipe } from '../reconstruction/recipe.ts';
import { isCachedPackageProblem, readCachedPackage, type CachedPackage } from './cache.ts';
import { writeNormRecord } from './persist.ts';
import { baselineGate, type BulkCandidate, type GateVerdict } from './select.ts';
import type { BulkPhase, BulkResult } from './state.ts';
import { buildDecisionTrace, recoveryMethodFor, type DecisionTrace } from './trace.ts';

/**
 * Manifesteintrag dieses Adapters mit dem Nachweis der Stichtagsgeltung.
 *
 * Der Trace ist eine Erweiterung des gemeinsamen Eintrags, keine Änderung an ihm: Die Zustandsschicht
 * (`common/manifest.ts`) bleibt unberührt, ihre Schemaprüfung gilt unverändert, und ein Leser, der
 * den Trace nicht kennt, liest denselben Eintrag wie zuvor.
 */
export interface BulkManifestEntry extends ManifestEntry {
  decisionTrace: DecisionTrace;
}

export interface ProcessCandidateOptions {
  root: string;
  write: boolean;
  cacheDir: string;
  runId: string;
  baselineDate: string;
  candidate: BulkCandidate;
  /** Wird bei einer Neureservierung verändert; der Aufrufer schreibt sie nach dem Lauf. */
  registry: SlugRegistry;
  existingSlugs: ReadonlySet<string>;
  institutions: CompiledInstitutionRegistry;
  /** Vorhandene Review-Fälle **dieser** Norm. */
  reviewQueue: ReviewQueue;
  /** Vorhandener Manifesteintrag dieser Norm (Unveränderlichkeit, Regressionsschutz). */
  previous?: ManifestEntry;
  now: () => Date;
}

export interface ProcessCandidateResult {
  result: BulkResult;
  phase: BulkPhase;
  code?: string;
  message?: string;
  targetSlug?: string;
  reviewCategories: string[];
  findings: ImportFinding[];
  entry?: BulkManifestEntry | ManifestEntry;
  /** Review-Fälle dieser Norm nach dem Lauf (auch im Dry-run vollständig berechnet). */
  reviewQueue: ReviewQueue;
  written: string[];
  /** Hat dieser Kandidat den Bestand verändert? Im Dry-run immer falsch. */
  changed: boolean;
}

const errorFindings = (findings: readonly ImportFinding[]): ImportFinding[] => findings.filter((finding) => finding.severity === 'error');

/**
 * Befundcode → Review-Kategorie. Ein unbekannter Code wird als Strukturfall geführt, nicht
 * stillschweigend übergangen: Lieber ein Fall zu viel in der Queue als ein Befund, den niemand sieht.
 */
export function reviewCategoryForCode(code: string): ReviewItemInput['category'] {
  switch (code) {
    case 'referenced-file-missing':
      return 'incomplete-annex';
    // Befunde der Überleitung hängen alle an derselben Frage: Wie wird eine Bezeichnung des
    // Quelllandes auf das Zielland geführt? Restposten, Doppelbildung und ein nicht zuzuordnendes
    // Erlassorgan gehören deshalb in dieselbe Arbeitsliste.
    case 'post-transform-audit':
    case 'residual-source-state-reference':
    case 'doubled-target-name':
    case 'enacting-body-mapping-required':
      return 'institution-mapping';
    case 'document-identity-mismatch':
    case 'slug-collision':
      return 'identity';
    case 'source-hash-mismatch':
      return 'metadata-conflict';
    case 'baseline-evidence-insufficient':
      return 'contradictory-evidence';
    case 'reconstruction-recipe-mismatch':
    case 'reconstruction-evidence-missing':
    case 'reconstruction-roundtrip-failed':
      return 'reconstruction-required';
    default:
      return 'unknown-structure';
  }
}

/**
 * Provenienz der benutzten Darstellung. Sie sagt etwas über die **Quelle**, nie über den Normtext.
 * Für das konsolidierte Landesrecht ist die amtliche Verkündung die Druckausgabe des GVBl.; das
 * Portal liefert dazu eine born-digital konsolidierte Fassung. Für Verwaltungsvorschriften hängt die
 * Amtlichkeit vom Verkündungsorgan und vom Jahr ab (AllMBl., BayMBl.) und wird am Einzeldokument
 * nicht festgestellt – dort bleibt es bei `unknown`, statt eine Einstufung zu behaupten.
 */
export function provenanceFor(area: SourceArea): SourceProvenance {
  if (area === 'vwv') {
    return {
      publicationAuthority: 'unknown',
      digitalRepresentation: 'born-digital',
      note: 'XML-Export der konsolidierten Fassung aus BAYERN.RECHT. Verwaltungsvorschriften erscheinen im AllMBl. bzw. BayMBl.; welche Ausgabe amtlich ist, hängt vom Verkündungsjahr ab und wird am Einzeldokument nicht festgestellt.',
    };
  }
  return {
    publicationAuthority: 'printed-official',
    digitalRepresentation: 'born-digital',
    note: 'XML-Export der konsolidierten Fassung aus BAYERN.RECHT (Bayerische Rechtssammlung); amtlich verkündet ist die Druckausgabe des GVBl., die elektronische Darstellung ist nachrichtlich.',
  };
}

/**
 * Belege der Stichtagsgeltung aus den Quellfakten – jede Zeile eine Aussage der Quelle, keine
 * Folgerung des Laufs. Die Folgerung zieht `assessBaselineValidity` daraus (Regeln A/B/C).
 */
export function validityEvidenceFor(input: {
  candidate: BulkCandidate;
  documentDate?: string;
  textInForceFrom?: string;
  retrievedAt: string;
  sha256: string;
  citation: string;
}): ValidityEvidence[] {
  const evidence: ValidityEvidence[] = [];
  if (input.textInForceFrom) {
    evidence.push({
      kind: 'text-in-force-clause',
      dimension: 'begin',
      strength: 'strong',
      statement: `Der geführte Text gilt laut Quelle ab ${input.textInForceFrom}`,
      date: input.textInForceFrom,
      sourceUrl: input.candidate.sourceUrl,
    });
  }
  evidence.push({
    kind: 'portal-version-interval',
    dimension: 'validity',
    strength: 'strong',
    statement: `Das Portal führt am ${retrievalDate(input.retrievedAt)} genau diesen Text als geltende Fassung; ein Fassungsende ist nicht vermerkt`,
    date: retrievalDate(input.retrievedAt),
    sourceUrl: input.candidate.zipUrl,
    sha256: input.sha256,
  });
  if (input.documentDate) {
    evidence.push({
      kind: 'gazette-publication',
      dimension: 'begin',
      strength: 'supporting',
      statement: `Ausgefertigt am ${input.documentDate}`,
      date: input.documentDate,
      citation: input.citation,
    });
  }
  if (input.candidate.bayRsNumber) {
    evidence.push({
      kind: 'registry-position',
      dimension: 'identity',
      strength: 'supporting',
      statement: `Geführt unter der BayRS-Gliederungsnummer ${input.candidate.bayRsNumber}`,
      sourceUrl: input.candidate.sourceUrl,
    });
  }
  return evidence;
}

/** Belegter Beginn der Stichtagsfassung, den das Rezept mitbringt (Inkrafttreten der Vorfassung). */
export type BaselineTextInForce = ReconstructionRecipe['baselineTextInForce'];

/**
 * Belege der Stichtagsgeltung einer rückgerechneten Fassung. Regel B trägt sie nur mit beidem: einem
 * starken Beginn der Stichtagsfassung am oder vor dem Stichtag (aus dem Rezept, belegt – nicht aus der
 * Ausfertigung geschlossen) und dem starken Fortbestand durch die spätere, amtlich verkündete Änderung.
 */
export function reconstructionEvidenceFor(input: {
  candidate: BulkCandidate;
  recipe: ReconstructionRecipe;
  begin: BaselineTextInForce;
  retrievedAt: string;
  sha256: string;
}): ValidityEvidence[] {
  const { recipe, begin } = input;
  const evidence: ValidityEvidence[] = [
    {
      kind: 'reconstruction',
      dimension: 'begin',
      strength: 'strong',
      statement: `Die Stichtagsfassung gilt seit ${begin.date}: ${begin.evidence.join('; ')}`,
      date: begin.date,
      citation: recipe.amendment.priorAmendment ?? recipe.source.fullCitation ?? recipe.amendment.citation,
      // Belegt durch die Verkündung der vorangehenden Änderung, sonst durch die Inkrafttretensvorschrift im Paket.
      sourceUrl: begin.sources?.[0]?.url ?? recipe.source.url,
      ...(begin.sources?.[0] ? { sha256: begin.sources[0].sha256 } : {}),
    },
    {
      kind: 'gazette-amendment',
      dimension: 'amendment',
      strength: 'strong',
      statement: `Geändert durch ${recipe.amendment.citation} mit Wirkung vom ${recipe.amendment.effectiveDate}; die Rücknahme dieser Änderung ergibt die Stichtagsfassung, der Rundlauf bestätigt den heutigen Text`,
      date: recipe.amendment.effectiveDate,
      citation: recipe.amendment.citation,
      sourceUrl: recipe.amendment.url,
      sha256: recipe.amendment.sha256,
    },
    {
      kind: 'portal-version-interval',
      dimension: 'validity',
      strength: 'supporting',
      statement: `Das Portal führt am ${retrievalDate(input.retrievedAt)} den heutigen Text (gültig ab ${recipe.source.inForceFrom}); er ist Grundlage der Rückrechnung, nicht der Stichtagstext`,
      date: retrievalDate(input.retrievedAt),
      sourceUrl: input.candidate.zipUrl,
      sha256: input.sha256,
    },
  ];
  if (input.candidate.bayRsNumber) {
    evidence.push({
      kind: 'registry-position',
      dimension: 'identity',
      strength: 'supporting',
      statement: `Geführt unter der BayRS-Gliederungsnummer ${input.candidate.bayRsNumber}`,
      sourceUrl: input.candidate.sourceUrl,
    });
  }
  return evidence;
}

/** Die Verkündung der zurückgenommenen Änderung als Quellreferenz der Fassung (Änderungsbeleg). */
export function amendmentSourceReference(recipe: ReconstructionRecipe, retrievedAt: string): SourceReference {
  return {
    kind: 'official-gazette',
    system: 'bayernrecht',
    label: `Zurückgenommene Änderung: ${recipe.amendment.citation}`,
    availability: 'external',
    url: recipe.amendment.url,
    retrievedAt: retrievalDate(retrievedAt),
    sha256: recipe.amendment.sha256,
    mediaType: 'text/html',
    sourceRole: 'amendment-evidence',
    note: `Rückrechnung auf ${recipe.baselineDate}: Rezept data/imports/bayernrecht/reconstruction/${recipe.documentId}.json (${recipe.steps.length} Schritt${recipe.steps.length === 1 ? '' : 'e'}, Rundlauf bestanden)`,
  };
}

/** Die Verkündung der vorangehenden Änderung als Beleg des Beginns der Stichtagsfassung. */
export function beginSourceReference(source: NonNullable<BaselineTextInForce['sources']>[number], retrievedAt: string, date: string): SourceReference {
  return {
    kind: 'official-gazette',
    system: 'bayernrecht',
    label: `Beginn der Stichtagsfassung: vorangehende Änderung ${source.citation.replace(/^vom\s+/u, 'vom ')}`,
    availability: 'external',
    url: source.url,
    retrievedAt: retrievalDate(retrievedAt),
    sha256: source.sha256,
    mediaType: 'text/html',
    sourceRole: 'amendment-evidence',
    note: `Inkrafttretensvorschrift der vorangehenden Änderung belegt den Beginn der Stichtagsfassung am ${date}`,
  };
}

/** Datumsangaben der beiden DTD-Köpfe (die VwV-DTD führt kein Ausfertigungsdatum). */
function headDates(document: BayernRechtDocument): { documentDate?: string; textInForceFrom?: string } {
  const head = document.head;
  return {
    ...('documentDate' in head && head.documentDate ? { documentDate: head.documentDate } : {}),
    ...(head.inForceFrom ? { textInForceFrom: head.inForceFrom } : {}),
  };
}

export async function processCandidate(options: ProcessCandidateOptions): Promise<ProcessCandidateResult> {
  const { candidate, root } = options;
  const nowIso = options.now().toISOString();
  const gate: GateVerdict = baselineGate(candidate);
  const empty = { reviewCategories: [] as string[], findings: [] as ImportFinding[], reviewQueue: options.reviewQueue, written: [] as string[], changed: false };

  // Ohne Stichtagsentscheidung entsteht nichts: kein Eintrag, kein Review-Fall, keine Behauptung.
  // Die Arbeit liegt beim vorgelagerten Schritt, nicht an dieser Norm.
  if (!gate.admit && gate.result === 'skipped-unclassified') {
    return { ...empty, result: gate.result, phase: 'auswahl', code: gate.code, message: gate.message };
  }

  /* ------------------------------------------------------------------ Paket (nur aus dem Cache) */
  const cached = await readCachedPackage(options.cacheDir, candidate.zipUrl);
  if (cached === undefined) {
    return { ...empty, result: 'skipped-not-cached', phase: 'paket', code: 'not-cached', message: `Kein Exportpaket im Cache (${candidate.zipUrl}); zuerst fetch-corpus` };
  }
  if (isCachedPackageProblem(cached)) {
    return { ...empty, result: 'failed', phase: 'paket', code: 'cache-corrupt', message: cached.problem };
  }

  /* ------------------------------------------------------------------ Parser */
  let document: BayernRechtDocument;
  try {
    document = parseBayernRechtPackage(
      { portal: 'bayernrecht', url: candidate.zipUrl, retrievedAt: cached.retrievedAt, mediaType: cached.contentType, sha256: cached.sha256 },
      cached.bytes,
      { unknown: 'report' },
    );
  } catch (error) {
    // Ein Paket, das sich nicht lesen lässt, trägt keine Quellfakten – und ohne sie gibt es keinen
    // Manifesteintrag (das Manifest verlangt Titel, Quellgeltung und Hash). Der Fall wird deshalb als
    // Fehlschlag des Laufs geführt, nicht als Review-Fall: Ein Review ohne Manifesteintrag wäre ein
    // Widerspruch im Bestand, den das Audit zu Recht meldet.
    return { ...empty, result: 'failed', phase: 'parse', code: 'source-unreadable', message: (error as Error).message };
  }

  const law = document.law;
  const dates = headDates(document);
  const findings: ImportFinding[] = [...law.findings];
  const reviewItems: ReviewItemInput[] = [];
  const blocking: string[] = [];

  const block = (code: string, message: string, details: string[], severity: ImportFinding['severity'] = 'error'): void => {
    findings.push({ severity, code, message });
    blocking.push(code);
    reviewItems.push({ category: reviewCategoryForCode(code), key: code, severity: 'blocking', summary: message, details });
  };

  // Identitätsbruch: Das Paket gehört zu einer anderen Vorschrift. Daraus entsteht **kein** Eintrag –
  // ein Manifesteintrag mit den Quellfakten eines fremden Dokuments wäre schlimmer als keiner.
  if (document.documentId !== candidate.documentId) {
    return {
      ...empty,
      result: 'failed',
      phase: 'parse',
      code: 'document-identity-mismatch',
      message: `Das Paket ${candidate.zipUrl} trägt die Dokumentkennung ${document.documentId}, angefordert war ${candidate.documentId}`,
      findings: [...law.findings],
    };
  }
  // Befunde am Text sind dort ein Sperrgrund, wo der Text übernommen werden soll. Bei einem Kandidaten,
  // den schon die Auswahl ablehnt, bleiben sie Befunde am Eintrag: Ein Review-Fall zur Struktur einer
  // Vorschrift, die ohnehin nicht übernommen wird, verstellt die Arbeitsliste.
  if (gate.admit) {
    if (cached.sha256 !== cached.declaredSha256) {
      block('source-hash-mismatch', `Der nachgerechnete SHA-256 (${cached.sha256.slice(0, 16)}…) weicht von der Begleitdatei (${cached.declaredSha256.slice(0, 16)}…) ab`, [
        'Der Cacheeintrag ist beschädigt oder wurde nachträglich verändert; das Paket wird nicht übernommen.',
      ]);
    }
    for (const finding of errorFindings(law.findings)) {
      blocking.push(finding.code);
      reviewItems.push({ category: reviewCategoryForCode(finding.code), key: finding.code, severity: 'blocking', summary: finding.message, details: [`Parserbefund ${finding.code}`, `Quelle: ${candidate.zipUrl}`] });
    }
    for (const finding of law.findings.filter((entry) => entry.code === 'referenced-file-missing')) {
      blocking.push(finding.code);
      reviewItems.push({ category: 'incomplete-annex', key: finding.code, severity: 'blocking', summary: finding.message, details: ['Im XML referenzierte Beilagen fehlen im Exportpaket; der Text wäre unvollständig.'] });
    }
    // Textintegrität wie in der Inventur (dieselbe Funktion): sichtbarer Quelltext gegen kanonischen Text.
    // `mismatch` (Textverlust, Verdopplung) ist ein Sperrgrund; `review` (bis zu drei unerklärte Wörter)
    // bleibt übernehmbar, aber sichtbar – als Warnung und als nicht blockierender Review-Fall.
    const integrity = assessTextIntegrity(document, readBayernRechtPackage(cached.bytes).xml);
    const integrityDetails = [
      `Quelle ${integrity.sourceTokens} Wörter, kanonisch ${integrity.canonicalTokens}; es fehlen ${integrity.missing}, zusätzlich ${integrity.extra}`,
      ...(integrity.explanations.length > 0 ? [`erklärt: ${integrity.explanations.join(', ')}`] : []),
      ...(integrity.lostExcerpt ? [`fehlender Abschnitt: ${integrity.lostExcerpt}`] : []),
      ...(integrity.duplicatedExcerpt ? [`Verdopplungsverdacht: ${integrity.duplicatedExcerpt}`] : []),
    ];
    if (integrity.class === 'mismatch') {
      block('text-integrity-mismatch', `Textintegrität verletzt: ${integrity.missing} Wörter fehlen, ${integrity.extra} zusätzlich`, integrityDetails);
    } else if (integrity.class === 'review') {
      findings.push({ severity: 'warning', code: 'text-integrity-review', message: `Textintegrität: ${integrity.missing + integrity.extra} unerklärte(s) Wort/Wörter (${integrityDetails[0]})` });
      reviewItems.push({ category: 'unknown-structure', key: 'text-integrity-review', severity: 'non-blocking', summary: 'Textintegrität: Einzelfall mit bis zu drei unerklärten Wörtern', details: integrityDetails });
    }
  }

  /* ------------------------------------------------------------------ Rückrechnung */
  // Der Stichtagskörper entsteht aus dem heutigen, indem das Rezept die einzige spätere Änderung zurücknimmt –
  // aber nur, wenn das Rezept genau dieses Paket beschreibt, der Beginn der Stichtagsfassung belegt ist, der
  // Änderungsbeleg im Cache liegt und der Rundlauf (rückwärts, dann vorwärts) byteidentisch den heutigen Körper
  // ergibt. Alles andere ist ein Review-Fall; der heutige Text wird nie als Stichtagstext übernommen.
  let sourceLaw = law;
  let reconstruction: { recipe: ReconstructionRecipe; begin: BaselineTextInForce; gazette: CachedPackage; priorGazettes: CachedPackage[] } | undefined;
  if (gate.admit && gate.reconstruction && blocking.length === 0) {
    const recipe = gate.reconstruction;
    const begin = recipe.baselineTextInForce;
    // Formale Prüfung des Rezepts (recipeProblems) und dann die Übereinstimmung mit genau diesem Paket.
    const mismatch = recipeProblems(recipe)[0]
      ?? (recipe.source.sha256 !== cached.sha256
        ? `Das Rezept gilt für das Paket ${recipe.source.sha256.slice(0, 16)}…, im Cache liegt ${cached.sha256.slice(0, 16)}…`
        : recipe.amendment.effectiveDate !== law.sourceValidFrom
          ? `Das Rezept nimmt eine Änderung mit Wirkung vom ${recipe.amendment.effectiveDate} zurück, der heutige Text gilt laut Paket aber ab ${law.sourceValidFrom ?? '?'}`
          : begin.date > options.baselineDate
            ? `Die Stichtagsfassung gilt laut Rezept erst ab ${begin.date} – nach dem Stichtag`
            : undefined);
    if (mismatch) {
      block('reconstruction-recipe-mismatch', `Rückrechnungsrezept nicht anwendbar: ${mismatch}`, [mismatch, `Rezept: data/imports/bayernrecht/reconstruction/${recipe.documentId}.json`]);
    } else {
      const gazette = await readCachedPackage(options.cacheDir, recipe.amendment.url);
      // Belege für den Beginn der Stichtagsfassung (Verkündung der vorangehenden Änderung) – ebenfalls unverändert im Cache.
      const priorGazettes: CachedPackage[] = [];
      let priorProblem: string | undefined;
      for (const source of begin.sources ?? []) {
        const prior = await readCachedPackage(options.cacheDir, source.url);
        if (!prior || isCachedPackageProblem(prior) || prior.sha256 !== source.sha256) {
          priorProblem = `Beleg des Beginns ${source.url} liegt nicht unverändert im Cache`;
          break;
        }
        priorGazettes.push(prior);
      }
      if (priorProblem) {
        block('reconstruction-evidence-missing', priorProblem, ['Ohne den archivierbaren Beleg wird keine Rückrechnung übernommen.']);
      } else if (!gazette || isCachedPackageProblem(gazette) || gazette.sha256 !== recipe.amendment.sha256) {
        block('reconstruction-evidence-missing', `Der Änderungsbeleg ${recipe.amendment.url} liegt nicht unverändert im Cache`, [
          gazette && !isCachedPackageProblem(gazette) ? `SHA-256 im Cache ${gazette.sha256.slice(0, 16)}…, im Rezept ${recipe.amendment.sha256.slice(0, 16)}…` : 'Kein oder beschädigter Cacheeintrag',
          'Ohne den archivierbaren Beleg wird keine Rückrechnung übernommen.',
        ]);
      } else {
        const proof = verifyRoundTrip(law.body, recipe);
        if (!proof.ok) {
          block('reconstruction-roundtrip-failed', 'Der Rundlauf der Rückrechnung ist nicht bestanden', [proof.detail]);
        } else {
          reconstruction = { recipe, begin, gazette, priorGazettes };
          sourceLaw = {
            ...law,
            body: applyReverseRecipe(law.body, recipe),
            sourceValidFrom: begin.date,
            sourceValidTo: previousDay(recipe.amendment.effectiveDate),
            sourceReferences: [
              ...law.sourceReferences,
              amendmentSourceReference(recipe, gazette.retrievedAt),
              ...(begin.sources ?? []).map((source, index) => beginSourceReference(source, priorGazettes[index]!.retrievedAt, begin.date)),
            ],
          };
        }
      }
    }
  }

  /* ------------------------------------------------------------------ Belege und Auswahl */
  const evidence = reconstruction
    ? reconstructionEvidenceFor({ candidate, recipe: reconstruction.recipe, begin: reconstruction.begin, retrievedAt: cached.retrievedAt, sha256: cached.sha256 })
    : validityEvidenceFor({ candidate, ...dates, retrievedAt: cached.retrievedAt, sha256: cached.sha256, citation: law.citation });
  if (gate.admit && blocking.length === 0) {
    const assessment = assessBaselineValidity({ baseline: options.baselineDate, evidence });
    if (assessment.status !== 'active-at-baseline') {
      block('baseline-evidence-insufficient', `Die Belegkette trägt die Stichtagsgeltung nicht (Regel ${assessment.rule})`, assessment.reasons);
    }
  }
  if (!gate.admit && gate.review) reviewItems.push(gate.review);

  /* ------------------------------------------------------------------ Überleitung und Prüfung */
  const reserver = createSlugReserver(options.registry, options.existingSlugs);
  let reservation: SlugReservation | undefined;
  let record: NormRecord | undefined;
  let transformation = { changes: 0, unresolved: 0, detections: 0, postTransformAudit: false };
  // Die Phase benennt, wo die Entscheidung fiel: Bei einem abgelehnten Kandidaten ist das die Auswahl,
  // bei einem zugelassenen frühestens der Parser.
  let phase: BulkPhase = gate.admit ? 'parse' : 'auswahl';
  let failure: { code: string; message: string } | undefined;

  const rollbackSlug = (): void => {
    if (!reservation?.newlyReserved) return;
    const index = options.registry.entries.findIndex((entry) => entry.sourceIdentity === candidate.documentId);
    if (index >= 0) options.registry.entries.splice(index, 1);
  };

  if (gate.admit && blocking.length === 0) {
    phase = 'ueberleitung';
    try {
      const recovery = recoveryMethodFor(candidate.baseline, reconstruction?.recipe);
      const result = transformToBayWue(
        sourceLaw,
        {
          targetJurisdiction: TARGET_JURISDICTION,
          baselineDate: options.baselineDate,
          reserveSlug: (slugCandidate: string): string => {
            reservation = reserver.reserve(candidate.documentId, slugCandidate);
            return reservation.slug;
          },
        },
        {
          sourceArea: candidate.sourceArea,
          institutions: options.institutions,
          sourceStatus: reconstruction
            ? { validity: 'reconstructed', text: 'reconstructed', note: `Stichtagsfassung aus dem heutigen Text durch Rücknahme von ${reconstruction.recipe.amendment.citation} (Wirkung ab ${reconstruction.recipe.amendment.effectiveDate}) zurückgerechnet; Rundlauf bestanden` }
            : { validity: 'exact', text: 'direct' },
          provenanceNote: recovery.note,
        },
      );
      record = result.record;
      findings.push(...result.findings);
      transformation = {
        changes: result.report.changes.length,
        unresolved: result.report.unresolved.length,
        detections: result.report.detections.length,
        postTransformAudit: result.report.postTransformAudit.ok,
      };
      phase = 'pruefung';
      const problems = errorFindings([...result.findings, ...auditRecord(record)]);
      for (const problem of problems) {
        blocking.push(problem.code);
        reviewItems.push({ category: reviewCategoryForCode(problem.code), key: problem.code, severity: 'blocking', summary: problem.message, details: ['Befund der Überleitung bzw. der Restpostenprüfung auf der fertigen Norm.'] });
      }
      // Kein Review-Fall wird aus einem nicht zuzuordnenden Erlassorgan: Das ist eine Entscheidung
      // über eine Institution, nicht über diese Norm, sie wiederholt sich über Hunderte Einträge und
      // wird zentral in data/imports/bayernrecht/institution-mapping.json getroffen. Der Befund bleibt
      // am Manifesteintrag und in der Warnungsbilanz des Laufs.
      if (reservation?.collision) {
        // Deterministisch aufgelöst (Kennungshash als Zusatz) und gemeldet – nicht stillschweigend.
        findings.push({ severity: 'warning', code: 'slug-collision', message: `Slug ${reservation.collision.candidate} ist durch ${reservation.collision.heldBy} belegt; vergeben wurde ${reservation.slug}` });
        reviewItems.push({ category: 'identity', key: 'slug-collision', severity: 'non-blocking', summary: `Slugkollision: ${reservation.collision.candidate} → ${reservation.slug}`, details: [`Belegt durch ${reservation.collision.heldBy}`, 'Die Auflösung ist deterministisch (Kennungshash) und bleibt über Läufe stabil.'] });
      }
    } catch (error) {
      rollbackSlug();
      failure = { code: 'transform-failed', message: (error as Error).message };
    }
  }

  /* ------------------------------------------------------------------ Manifesteintrag */
  if (!law.sourceValidFrom) {
    // Ohne reale Quellgeltung lässt sich kein prüfbarer Eintrag bilden; das Manifest verlangt sie.
    return { ...empty, result: 'failed', phase: 'parse', code: 'no-source-valid-from', message: `${candidate.documentId}: Die Quelle nennt keinen Geltungsbeginn des Textes; ohne ihn entsteht kein Manifesteintrag` };
  }

  const imported = Boolean(record) && blocking.length === 0 && !failure && gate.admit;
  const status: ImportStatus = failure
    ? 'failed'
    : imported
      ? findings.some((finding) => finding.severity === 'warning')
        ? 'imported-with-warnings'
        : 'imported'
      : gate.admit
        ? 'needs-review'
        : gate.importStatus ?? 'needs-review';

  // Eine Reservierung, die zu keiner Übernahme führt, wird zurückgegeben. Sonst hielte die Registry
  // einen Namen für eine Norm, die das Manifest gar nicht als übernommen führt – das Audit meldet
  // diese Asymmetrie zu Recht, und beim späteren Import (nach der Rekonstruktion) entstünde derselbe
  // Slug ohnehin wieder, weil er aus dem Titel abgeleitet wird.
  if (!imported) rollbackSlug();

  const trace = buildDecisionTrace({
    candidate,
    baselineDate: options.baselineDate,
    sha256: cached.sha256,
    retrievedAt: cached.retrievedAt,
    ...dates,
    parserVersion: PARSER_VERSION,
    transformerVersion: TRANSFORMER_VERSION,
    imported,
    ...(reconstruction ? { reconstruction: { recipe: reconstruction.recipe, baselineTextFrom: reconstruction.begin.date } } : {}),
  });

  const entry: BulkManifestEntry = {
    ...manifestEntryDefaults(),
    sourceArea: candidate.sourceArea,
    sourceIdentity: candidate.documentId,
    ...(candidate.bayRsNumber && isBayRsNumber(candidate.bayRsNumber) ? { bayRsNumber: candidate.bayRsNumber } : {}),
    sourceTitle: law.title,
    sourceType: document.documentType ?? law.type,
    sourceUrl: candidate.sourceUrl,
    sourceVersion: { url: candidate.zipUrl, validFrom: law.sourceValidFrom, validTo: law.sourceValidTo ?? null },
    selectedVersionUrl: candidate.zipUrl,
    // Quellgeltung des übernommenen Textes: bei einer Rückrechnung die der Stichtagsfassung, nicht die des Pakets.
    sourceValidFrom: sourceLaw.sourceValidFrom ?? law.sourceValidFrom,
    sourceValidTo: sourceLaw.sourceValidTo ?? null,
    baselineStatus: candidate.baseline?.status === 'not-at-baseline' ? 'not-active-at-baseline' : candidate.baseline?.status === 'active-at-baseline' ? 'active-at-baseline' : 'undetermined',
    baselineRecoveryMethod: trace.recovery.method,
    sourceProvenance: provenanceFor(candidate.sourceArea),
    validityEvidence: evidence,
    retrievedAt: cached.retrievedAt,
    sha256: cached.sha256,
    contentType: cached.contentType,
    parserVersion: PARSER_VERSION,
    transformerVersion: TRANSFORMER_VERSION,
    targetSlug: imported && record ? record.meta.slug : '',
    importStatus: status,
    rawDocuments: [
      {
        role: 'text-document',
        url: candidate.zipUrl,
        finalUrl: candidate.zipUrl,
        sha256: cached.sha256,
        contentType: cached.contentType,
        retrievedAt: cached.retrievedAt,
        byteLength: cached.byteLength,
      },
      // Der Beleg der zurückgenommenen Änderung wird mit archiviert: Ohne ihn wäre die Rückrechnung nicht prüfbar.
      ...(reconstruction
        ? [{
            role: 'gazette' as const,
            url: reconstruction.recipe.amendment.url,
            finalUrl: reconstruction.gazette.url,
            sha256: reconstruction.gazette.sha256,
            contentType: reconstruction.gazette.contentType,
            retrievedAt: reconstruction.gazette.retrievedAt,
            byteLength: reconstruction.gazette.byteLength,
          }, ...reconstruction.priorGazettes.map((prior) => ({
            role: 'gazette' as const,
            url: prior.url,
            finalUrl: prior.url,
            sha256: prior.sha256,
            contentType: prior.contentType,
            retrievedAt: prior.retrievedAt,
            byteLength: prior.byteLength,
          }))]
        : []),
    ],
    versionsConsidered: [{ validFrom: law.sourceValidFrom, validTo: law.sourceValidTo ?? null, url: candidate.zipUrl, selected: true }],
    findings,
    integrity: { fetchParse: cached.sha256 === cached.declaredSha256, sourceCanonical: document.documentId === candidate.documentId },
    transformation,
    decisionTrace: trace,
    ...(imported ? { importedAt: nowIso, runId: options.runId } : {}),
  };
  if (failure) {
    entry.findings = [...findings, { severity: 'error', code: failure.code, message: failure.message }];
    reviewItems.push({ category: 'unknown-structure', key: failure.code, severity: 'blocking', summary: failure.message, details: ['Die Überleitung oder die Schemaprüfung der Zielnorm ist gescheitert; es wurde nichts übernommen.'] });
  }

  // Der Eintrag wird **immer** geprüft, auch im Dry-run: Sonst behauptete der Dry-run eine Übernahme,
  // die der Schreiblauf an der Schemaprüfung ablehnte – und die Probe wäre wertlos.
  const manifestProblems = validateManifestEntry(entry, `Manifesteintrag ${candidate.documentId}`);
  if (manifestProblems.length > 0) {
    rollbackSlug();
    return { ...empty, result: 'failed', phase: 'pruefung', code: 'manifest-invalid', message: manifestProblems.join('; '), findings };
  }

  /* ------------------------------------------------------------------ Unveränderlichkeit */
  // Ein Reimport, der ein schlechteres Ergebnis liefert als der übernommene Stand, ersetzt nichts:
  // Manifest und Inhalt bleiben, wo sie sind, und der Fall wird gemeldet (Gedanke des West-Adapters).
  const previous = options.previous;
  const regression = previous !== undefined && isImportedStatus(previous.importStatus) && !isImportedStatus(status);
  if (regression && previous) {
    reviewItems.push({
      category: 'import-regression',
      key: 'import-regression',
      severity: 'blocking',
      summary: `Bereits übernommene Norm ${previous.targetSlug} ergibt jetzt ${status}`,
      details: [
        `Gespeichert: ${previous.importStatus} (${previous.parserVersion}, ${previous.transformerVersion})`,
        `Jetzt: ${status}${blocking.length > 0 ? ` (${[...new Set(blocking)].join(', ')})` : ''}${failure ? ` (${failure.code})` : ''}`,
        'Manifest und Inhalt bleiben beim zuletzt übernommenen Stand; die Entscheidung trifft ein Mensch.',
      ],
    });
  }

  /* ------------------------------------------------------------------ Review und Schreiben */
  const mergedQueue = mergeReviewItems(options.reviewQueue, { sourceArea: candidate.sourceArea, sourceIdentity: candidate.documentId, sourceUrl: candidate.sourceUrl, now: nowIso, ...(entry.targetSlug ? { targetSlug: entry.targetSlug } : {}) }, reviewItems);
  const effective: ManifestEntry = regression && previous ? { ...previous } : entry;
  effective.reviewStatus = reviewStatusFor(mergedQueue, candidate.documentId);

  const written: string[] = [];
  let changed = false;
  if (imported && record) {
    phase = 'schreiben';
    const normWrite = await writeNormRecord({ root, record, baselineDate: options.baselineDate, write: options.write });
    if (normWrite.finding) {
      // Fremde Fassungen: nichts angefasst. Der Eintrag bleibt beim Befund, die Norm wird nicht übernommen.
      rollbackSlug();
      findings.push(normWrite.finding);
      const blockedEntry: BulkManifestEntry = { ...entry, importStatus: 'needs-review', targetSlug: '', findings: [...findings] };
      delete blockedEntry.importedAt;
      delete blockedEntry.runId;
      const blockedItems: ReviewItemInput[] = [...reviewItems, { category: 'import-regression', key: 'existing-versions', severity: 'blocking', summary: normWrite.finding.message, details: ['Der Bulk überschreibt keine vorhandenen Fassungen.'] }];
      const blockedQueue = mergeReviewItems(options.reviewQueue, { sourceArea: candidate.sourceArea, sourceIdentity: candidate.documentId, sourceUrl: candidate.sourceUrl, now: nowIso }, blockedItems);
      blockedEntry.reviewStatus = reviewStatusFor(blockedQueue, candidate.documentId);
      if (options.write) {
        written.push((await writeManifestEntry(root, blockedEntry)).path);
        written.push((await writeReviewShard(root, blockedQueue, candidate.sourceArea, candidate.documentId)).path);
      }
      return { result: 'review', phase: 'schreiben', code: normWrite.finding.code, message: normWrite.finding.message, reviewCategories: [...new Set(blockedItems.map((item) => item.category))].sort(), findings, entry: blockedEntry, reviewQueue: blockedQueue, written, changed: false };
    }
    written.push(...normWrite.files);
    // `changed` beschreibt den Bestand, nicht die Absicht: Im Dry-run ändert sich nichts.
    changed = options.write && normWrite.changed;
    if (options.write && reserver.changed) await writeSlugRegistry(root, options.registry);
  }

  if (options.write) {
    const manifestWrite = await writeManifestEntry(root, effective);
    written.push(manifestWrite.path);
    changed = changed || manifestWrite.changed;
    const reviewWrite = await writeReviewShard(root, mergedQueue, candidate.sourceArea, candidate.documentId);
    written.push(reviewWrite.path);
    changed = changed || reviewWrite.changed;
  }

  const reviewCategories = [...new Set(reviewItems.map((item) => item.category))].sort();
  const result: BulkResult = regression
    ? 'kept-existing'
    : failure
      ? 'failed'
      : imported
        ? options.write
          ? changed
            ? status === 'imported-with-warnings'
              ? 'imported-with-warnings'
              : 'imported'
            : 'unchanged'
          : 'dry-run'
        : gate.admit || gate.result === 'review'
          ? 'review'
          : gate.result;

  return {
    result,
    phase: imported ? 'schreiben' : phase,
    ...(failure ? { code: failure.code, message: failure.message } : !gate.admit ? { code: gate.code, message: gate.message } : blocking.length > 0 ? { code: blocking[0]!, message: findings.find((finding) => finding.code === blocking[0])?.message ?? blocking[0]! } : {}),
    ...(effective.targetSlug ? { targetSlug: effective.targetSlug } : {}),
    reviewCategories,
    findings,
    entry: effective,
    reviewQueue: mergedQueue,
    written,
    changed,
  };
}
