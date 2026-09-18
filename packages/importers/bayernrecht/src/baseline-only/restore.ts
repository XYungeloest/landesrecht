/**
 * Rezept → Stichtagsfassung → Bestand. Derselbe Weg wie jede andere Norm des BayWü-Bestands:
 *
 *   Rezept ──(Cache, offline)──▶ Quellkörper ──▶ `SourceLaw` ──▶ `transformToBayWue` ──▶ `auditRecord`
 *     ──▶ `validateNormRecord` ──▶ content/norms/baywue/<slug>/ + Manifesteintrag (Bereich `events`) + Slug-Registry
 *
 * **Offline deterministisch.** Jede Quelle wird aus dem Cache gelesen und an ihrer SHA-256 gemessen; der
 * Umsetzer rechnet den Körper neu und muss den Ausgangstext-Fingerabdruck (normalisierter Seitentext) und den
 * Fingerabdruck des Quellkörpers treffen; jede Änderung wird aus ihren Schritten vorwärts nachgespielt und an ihrem
 * Fingerabdruck gemessen. Alle Fingerabdrücke gelten dem **Quelltext** – nie dem übergeleiteten Text, damit eine
 * spätere Änderung der Überleitung (Schutzmuster, Eigennamen, Bildblöcke) kein Rezept ungültig macht.
 */
import { retrievalDate, type ImportFinding, type SourceLaw } from '@landesrecht/importer-common/pipeline.ts';
import { validateNormRecord, type NormRecord, type SourceReference } from '@landesrecht/legal-core/lib/schema.ts';

import { TARGET_JURISDICTION } from '../common/constants.ts';
import { assessBaselineValidity } from '../common/evidence.ts';
import { manifestEntryDefaults, validateManifestEntry, type ManifestEntry, type ManifestRawDocument } from '../common/manifest.ts';
import { isBayRsNumber } from '../common/paths.ts';
import { createSlugReserver, type SlugRegistry, type SlugReservation } from '../common/slug-registry.ts';
import { readCached } from '../reconstruction/source.ts';
import { auditRecord } from '../transform/audit-record.ts';
import type { ReviewItemInput } from '../common/review.ts';
import type { CompiledInstitutionRegistry } from '../transform/institution-registry.ts';
import { TRANSFORMER_VERSION } from '../transform/rules.ts';
import { transformToBayWue } from '../transform/transform.ts';
import { bodyFingerprint, formatLongDate, sourceBody } from './analyze.ts';
import { replaySteps } from './chain.ts';
import { convertGazetteHtml, CONVERTER_VERSION } from './html.ts';
import { recipePath, RECIPE_SCHEMA, type BaselineOnlyRecipe, type RecipeSource } from './model.ts';

export class RecipeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'RecipeError';
  }
}

/** Formale Prüfung vor jeder Anwendung (leer = gültig). */
export function recipeProblems(recipe: BaselineOnlyRecipe, baselineDate: string): string[] {
  const problems: string[] = [];
  const iso = /^\d{4}-\d{2}-\d{2}$/u;
  const sha = /^[0-9a-f]{64}$/u;
  if (recipe.schemaVersion !== RECIPE_SCHEMA) problems.push(`unbekannte Schemaversion ${String(recipe.schemaVersion)}`);
  if (recipe.method !== 'reconstructed-from-publications') problems.push(`Methode ${String(recipe.method)}`);
  if (recipe.baselineDate !== baselineDate) problems.push(`Stichtag ${recipe.baselineDate} ≠ ${baselineDate}`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(recipe.id)) problems.push(`Kennung ${recipe.id} ist nicht kanonisch`);
  if (!iso.test(recipe.begin?.date ?? '') || recipe.begin.date > baselineDate) problems.push(`Beginn ${recipe.begin?.date ?? '–'} fehlt oder liegt nach dem Stichtag`);
  if (!iso.test(recipe.end?.lastDay ?? '') || recipe.end.lastDay < baselineDate) problems.push(`Ende ${recipe.end?.lastDay ?? '–'} fehlt oder liegt vor dem Stichtag`);
  if (recipe.textValidTo && (!iso.test(recipe.textValidTo.date) || recipe.textValidTo.date < baselineDate)) problems.push(`Ende der Textfassung ${recipe.textValidTo.date} vor dem Stichtag`);
  if (!Array.isArray(recipe.begin?.evidence) || recipe.begin.evidence.length === 0) problems.push('Beginn ohne Beleg');
  if (!Array.isArray(recipe.end?.evidence) || recipe.end.evidence.length === 0) problems.push('Ende ohne Beleg');
  if (!sha.test(recipe.base?.sha256 ?? '') || !sha.test(recipe.base?.pageTextSha256 ?? '') || !sha.test(recipe.base?.bodyFingerprint ?? '')) problems.push('Prüfsummen der Stammverkündung fehlen');
  if (!sha.test(recipe.expected?.baselineFingerprint ?? '')) problems.push('Fingerabdruck der Stichtagsfassung fehlt');
  if (!recipe.chain?.complete) problems.push('Gegenprobe der Kette nicht vollständig');
  for (const source of recipe.sources ?? []) if (!sha.test(source.sha256) || !source.url.startsWith('https://')) problems.push(`Quelle ${source.url} ohne SHA-256 oder nicht https`);
  if (!(recipe.sources ?? []).some((source) => source.role === 'base' && source.url === recipe.base.url)) problems.push('Stammverkündung fehlt unter den Quellen');
  for (const amendment of recipe.amendments ?? []) {
    if (!iso.test(amendment.effectiveDate) || amendment.effectiveDate > baselineDate) problems.push(`Änderung ${amendment.citation}: Wirkung ${amendment.effectiveDate} nicht bis zum Stichtag`);
    if (amendment.steps.length === 0) problems.push(`Änderung ${amendment.citation} ohne Schritte`);
  }
  return problems;
}

async function cachedHtml(root: string, url: string, sha256: string, what: string): Promise<string> {
  const cached = await readCached(root, url);
  if (!cached) throw new RecipeError('source-not-cached', `${what} ${url} liegt nicht im Cache (.cache/bayernrecht/); mit restore-baseline-only ohne --offline holen`);
  if (cached.sha256 !== sha256) throw new RecipeError('source-changed', `${what} ${url}: SHA-256 im Cache ${cached.sha256.slice(0, 16)}…, im Rezept ${sha256.slice(0, 16)}…`);
  return new TextDecoder().decode(cached.bytes);
}

/** Quellkörper am Stichtag aus dem Rezept, offline, mit allen Fingerabdrücken geprüft. */
export async function replayRecipe(root: string, recipe: BaselineOnlyRecipe): Promise<{ body: SourceLaw['body'] }> {
  const problems = recipeProblems(recipe, recipe.baselineDate);
  if (problems.length > 0) throw new RecipeError('recipe-invalid', `${recipe.id}: ${problems.join('; ')}`);
  if (recipe.converterVersion !== CONVERTER_VERSION) throw new RecipeError('converter-version', `${recipe.id}: Rezept mit ${recipe.converterVersion}, Umsetzer ist ${CONVERTER_VERSION} – neu analysieren`);
  const html = await cachedHtml(root, recipe.base.url, recipe.base.sha256, 'Stammverkündung');
  const converted = convertGazetteHtml(html);
  if (converted.pageTextSha256 !== recipe.base.pageTextSha256) throw new RecipeError('base-text-changed', `${recipe.id}: Ausgangstext-Fingerabdruck ${converted.pageTextSha256.slice(0, 16)}… ≠ Rezept ${recipe.base.pageTextSha256.slice(0, 16)}…`);
  let body = sourceBody(converted);
  if (bodyFingerprint(body) !== recipe.base.bodyFingerprint) throw new RecipeError('base-body-changed', `${recipe.id}: Quellkörper weicht vom geprüften ab`);
  for (const amendment of recipe.amendments) {
    await cachedHtml(root, amendment.url, amendment.sha256, `Änderung ${amendment.citation}`);
    body = replaySteps(body, amendment.steps);
    if (bodyFingerprint(body) !== amendment.afterFingerprint) throw new RecipeError('amendment-replay', `${recipe.id}: Nach ${amendment.citation} weicht der Körper vom geprüften ab`);
  }
  if (bodyFingerprint(body) !== recipe.expected.baselineFingerprint) throw new RecipeError('baseline-fingerprint', `${recipe.id}: Stichtagskörper weicht vom geprüften ab`);
  return { body };
}

const HTML = 'text/html' as const;

function reference(source: RecipeSource, label: string, role: SourceReference['sourceRole'], note?: string, sourceNumber?: string): SourceReference {
  return {
    kind: 'official-gazette',
    system: 'bayernrecht',
    label,
    availability: 'external',
    url: source.url,
    retrievedAt: retrievalDate(source.retrievedAt),
    sha256: source.sha256,
    mediaType: HTML,
    ...(role ? { sourceRole: role } : {}),
    ...(sourceNumber ? { sourceNumber } : {}),
    ...(note ? { note } : {}),
  };
}

/** `SourceLaw` der Stichtagsfassung (bayerischer Quelltext, noch nicht übergeleitet). */
export function sourceLawFromRecipe(recipe: BaselineOnlyRecipe, body: SourceLaw['body']): SourceLaw {
  const base = recipe.sources.find((source) => source.role === 'base')!;
  const repeal = recipe.sources.find((source) => source.role === 'repeal');
  const amendments = recipe.sources.filter((source) => source.role === 'amendment');
  const authorityNote = base.authority === 'electronic-official'
    ? `Amtliche elektronische Veröffentlichung (${base.citation}); der Text folgt ihrer HTML-Darstellung auf der Verkündungsplattform${base.pdf?.sha256Published ? `, amtliche PDF-Ausgabe ${base.pdf.url} (SHA-256 laut Plattform ${base.pdf.sha256Published})` : ''}`
    : `Nachrichtliche elektronische Fassung (${base.citation}); amtlich ist die Druckausgabe`;
  const references: SourceReference[] = [
    reference(base, `Verkündung der Stammfassung: ${base.citation}`, 'structure-bearing', `${authorityNote}. Rezept ${recipePath(recipe.id)}.`, recipe.norm.gliederungsnummern.join(', ') || undefined),
    ...amendments.map((source) => reference(source, `Änderung vor dem Stichtag: ${source.citation}`, 'amendment-evidence', 'Vorwärts angewandt; Rundlauf bestanden')),
    ...(repeal ? [reference(repeal, `Ende der Norm: ${repeal.citation}`, 'amendment-evidence', `Letzter Geltungstag ${recipe.end.lastDay}; Beleg, dass die Vorschrift am Stichtag galt und heute nicht mehr geführt wird`)] : []),
  ];
  const sourceValidTo = recipe.textValidTo && recipe.textValidTo.date < recipe.end.lastDay ? recipe.textValidTo.date : recipe.end.lastDay;
  const identifier = { system: 'verkuendung-bayern', value: recipe.id, url: recipe.base.url };
  return {
    portal: 'bayernrecht',
    externalIdentifiers: [identifier, ...(recipe.norm.bayRsNumber ? [{ system: 'bayrs', value: recipe.norm.bayRsNumber }] : [])],
    title: recipe.norm.title,
    ...(recipe.norm.shortTitle ? { shortTitle: recipe.norm.shortTitle } : {}),
    ...(recipe.norm.abbr ? { abbr: recipe.norm.abbr } : {}),
    type: recipe.norm.type,
    sourceValidFrom: recipe.begin.date,
    sourceValidTo,
    documentDate: recipe.norm.documentDate,
    citation: `${recipe.norm.title}${recipe.norm.abbr ? ` (${recipe.norm.shortTitle ? `${recipe.norm.shortTitle} – ` : ''}${recipe.norm.abbr})` : ''} vom ${formatLongDate(recipe.norm.documentDate)} (${recipe.norm.fundstelle})`,
    subjects: [],
    keywords: [],
    body,
    sourceNotes: [
      {
        label: 'Wiederherstellung',
        text: `Heute nicht mehr geführte Vorschrift, am ${formatLongDate(recipe.baselineDate)} geltend. Text aus der amtlichen Verkündung ${recipe.norm.fundstelle}${recipe.amendments.length > 0 ? ` mit den Änderungen ${recipe.amendments.map((amendment) => amendment.citation).join(', ')}` : ''}; ${recipe.end.kind === 'expiry' ? 'außer Kraft' : 'aufgehoben'} durch ${recipe.end.repeal.citation}, letzter Geltungstag ${recipe.end.lastDay}.`,
      },
    ],
    sourceReferences: references,
    findings: [],
    sourceIdentity: recipe.id,
    sourceUrl: recipe.base.url,
    ...(base.pdf ? { pdfUrl: base.pdf.url } : {}),
    fullCitation: recipe.norm.citation,
  };
}

export interface BaselineOnlyManifestEntry extends ManifestEntry {
  /** Nachweis am Eintrag: Rezept, Ereignisse, Satz. */
  baselineOnly: { recipe: string; eventIds: string[]; statement: string; outcome: 'safe' };
}

export interface RestoredNorm {
  record: NormRecord;
  entry: BaselineOnlyManifestEntry;
  findings: ImportFinding[];
  reservation?: SlugReservation;
  /** Nicht entscheidbare Eigennamen (wie im Bulk): nicht blockierende Prüffälle der Institutionenzuordnung. */
  reviewItems: ReviewItemInput[];
}

export interface RestoreInput {
  root: string;
  recipe: BaselineOnlyRecipe;
  registry: SlugRegistry;
  existingSlugs: ReadonlySet<string>;
  institutions: CompiledInstitutionRegistry;
  runId: string;
  now: string;
}

/**
 * Stellt eine Norm aus ihrem Rezept wieder her (ohne zu schreiben): Nachspielen, `SourceLaw`, Überleitung,
 * Restpostenprüfung, Schemaprüfung, Manifesteintrag. Wirft bei jedem Fehler – ein Teilergebnis gibt es nicht.
 */
export async function restoreNorm(input: RestoreInput): Promise<RestoredNorm> {
  const { recipe } = input;
  const { body } = await replayRecipe(input.root, recipe);
  const law = sourceLawFromRecipe(recipe, body);
  const reserver = createSlugReserver(input.registry, input.existingSlugs);
  let reservation: SlugReservation | undefined;
  const transformed = transformToBayWue(
    law,
    {
      targetJurisdiction: TARGET_JURISDICTION,
      baselineDate: recipe.baselineDate,
      reserveSlug: (candidate: string): string => {
        reservation = reserver.reserve(recipe.id, candidate);
        return reservation.slug;
      },
    },
    {
      sourceArea: 'events',
      institutions: input.institutions,
      sourceStatus: {
        validity: 'reconstructed',
        text: recipe.amendments.length > 0 ? 'reconstructed' : 'direct',
        note: recipe.amendments.length > 0
          ? `Stichtagsfassung aus der amtlichen Verkündung ${recipe.norm.fundstelle} und ${recipe.amendments.length} Änderung(en) vorwärts aufgebaut; Geltung ${recipe.begin.date} bis ${law.sourceValidTo} aus Inkrafttretens- und Aufhebungsvorschriften belegt`
          : `Unveränderte Stammfassung aus der amtlichen Verkündung ${recipe.norm.fundstelle}; Geltung ${recipe.begin.date} bis ${law.sourceValidTo} aus Inkrafttretens- und Aufhebungsvorschriften belegt`,
      },
      provenanceNote: `Heute nicht mehr geführte Vorschrift, wiederhergestellt aus amtlichen Verkündungen (Rezept ${recipePath(recipe.id)}).`,
    },
  );
  const audit = auditRecord(transformed.record);
  // Nicht entscheidbare Eigennamen bleiben stehen, wie die Regel sie bildet, und werden Prüffall – wie im Bulk.
  const uncertain = audit.filter((finding) => finding.code === 'historical-name-uncertain' || finding.code === 'proper-name-uncertain');
  const findings: ImportFinding[] = [...transformed.findings, ...uncertain];
  const reviewItems: ReviewItemInput[] = [...new Set(uncertain.map((finding) => finding.code))].map((code) => ({
    category: 'institution-mapping',
    key: code,
    severity: 'non-blocking',
    summary: `${uncertain.filter((finding) => finding.code === code).length}× ${code === 'proper-name-uncertain' ? 'Markenname mit Landesbezeichnung' : 'historischer Vertragsname oder heutiger Selbstbezug'}`,
    details: [...uncertain.filter((finding) => finding.code === code).slice(0, 10).map((finding) => finding.message), 'Redaktionelle Entscheidung: Schutzmuster (unverändert) oder Überleitung.'],
  }));
  const problems = [...transformed.findings, ...audit].filter((finding) => finding.severity === 'error');
  if (problems.length > 0) {
    throw new RecipeError('transform', `${recipe.id}: Überleitung/Restpostenprüfung: ${problems.map((problem) => `${problem.code}: ${problem.message}`).join('; ')}`);
  }
  const record = validateNormRecord(transformed.record, `${TARGET_JURISDICTION}/${transformed.record.meta.slug}`);
  const assessment = assessBaselineValidity({ baseline: recipe.baselineDate, evidence: recipe.evidence });
  if (assessment.status !== 'active-at-baseline') throw new RecipeError('evidence', `${recipe.id}: Belegkette trägt die Stichtagsgeltung nicht (${assessment.reasons.join('; ')})`);

  const raw = (source: RecipeSource): ManifestRawDocument => ({ role: 'gazette', url: source.url, finalUrl: source.url, sha256: source.sha256, contentType: source.contentType, retrievedAt: source.retrievedAt, byteLength: source.byteLength });
  const base = recipe.sources.find((source) => source.role === 'base')!;
  const archived = recipe.sources.filter((source) => source.role === 'base' || source.role === 'amendment' || source.role === 'repeal');
  const statement = `Die Vorschrift ${recipe.norm.fundstelle} galt seit ${recipe.begin.date}${recipe.amendments.length > 0 ? ` in der Fassung der Änderung ${recipe.amendments.at(-1)!.citation}` : ' unverändert'} und wurde durch ${recipe.end.repeal.citation} mit letztem Geltungstag ${recipe.end.lastDay} beendet; damit galt dieser Text am ${recipe.baselineDate}. Sie fehlt im heutigen Portalbestand und ist aus den amtlichen Verkündungen wiederhergestellt.`;
  const entry: BaselineOnlyManifestEntry = {
    ...manifestEntryDefaults(),
    sourceArea: 'events',
    sourceIdentity: recipe.id,
    ...(recipe.norm.bayRsNumber && isBayRsNumber(recipe.norm.bayRsNumber) ? { bayRsNumber: recipe.norm.bayRsNumber } : {}),
    sourceTitle: recipe.norm.title,
    sourceType: recipe.norm.publicationType ?? (recipe.norm.type === 'verwaltungsvorschrift' ? 'Verwaltungsvorschrift' : recipe.norm.type === 'verordnung' ? 'Verordnung' : 'Gesetz'),
    sourceUrl: recipe.base.url,
    sourceVersion: { url: recipe.base.url, validFrom: law.sourceValidFrom!, validTo: law.sourceValidTo ?? null },
    selectedVersionUrl: recipe.base.url,
    sourceValidFrom: law.sourceValidFrom!,
    sourceValidTo: law.sourceValidTo ?? null,
    baselineStatus: 'active-at-baseline',
    baselineRecoveryMethod: 'reconstructed-from-publications',
    sourceProvenance: {
      publicationAuthority: base.authority ?? 'unknown',
      digitalRepresentation: 'born-digital',
      note: base.authority === 'electronic-official'
        ? `Amtliche elektronische Veröffentlichung ${base.citation} auf der Verkündungsplattform Bayern; Text aus ihrer HTML-Darstellung${base.pdf?.sha256Published ? `, amtliche PDF-Ausgabe mit SHA-256 ${base.pdf.sha256Published} laut Plattform` : ''}.`
        : `GVBl. ${base.citation}: amtlich ist die Druckausgabe; Text aus der nachrichtlichen elektronischen Fassung.`,
    },
    validityEvidence: recipe.evidence,
    retrievedAt: base.retrievedAt,
    sha256: base.sha256,
    contentType: base.contentType,
    parserVersion: CONVERTER_VERSION,
    transformerVersion: TRANSFORMER_VERSION,
    targetSlug: record.meta.slug,
    importStatus: findings.some((finding) => finding.severity === 'warning') ? 'imported-with-warnings' : 'imported',
    reviewStatus: 'none',
    rawDocuments: archived.map(raw),
    versionsConsidered: [{ validFrom: law.sourceValidFrom!, validTo: law.sourceValidTo ?? null, url: recipe.base.url, selected: true }],
    findings,
    integrity: { fetchParse: true, sourceCanonical: true },
    transformation: { changes: transformed.report.changes.length, unresolved: transformed.report.unresolved.length, detections: transformed.report.detections.length, postTransformAudit: transformed.report.postTransformAudit.ok },
    importedAt: input.now,
    runId: input.runId,
    baselineOnly: { recipe: recipePath(recipe.id), eventIds: recipe.end.eventIds, statement, outcome: 'safe' },
  };
  const manifestProblems = validateManifestEntry(entry, `Manifesteintrag ${recipe.id}`);
  if (manifestProblems.length > 0) throw new RecipeError('manifest', manifestProblems.join('; '));
  return { record, entry, findings, reviewItems, ...(reservation ? { reservation } : {}) };
}
