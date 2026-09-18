/**
 * Die einzelnen Prüfungen der BayWü-Bereitschaftsprüfung – reine Funktionen über bereits gelesenen
 * Daten. `evaluate.ts` liest den Bestand und ruft sie auf; die Tests speisen sie einzeln.
 *
 * Was hier geprüft wird, steht als GO/No-Go-Liste in `docs/BAYERN_BULK_READINESS.md`. Dieses Modul
 * macht diese Liste maschinell nachprüfbar – es schreibt sie nicht um und entscheidet nichts: Wo die
 * Liste eine fachliche Entscheidung verlangt (Scope), prüft der Code nur, **ob** sie getroffen wurde.
 *
 * Drei Regeln, die den Unterschied zum bloßen Abhaken ausmachen:
 *
 *  1. **Jede Meldung steht für sich.** `detail` nennt Zahlen, Kennungen und den Befehl, der den
 *     Befund behebt – wer die Ausgabe liest, braucht das Dokument daneben nicht.
 *  2. **Blocker und Hinweis sind verschieden.** Ein Blocker (`fail`) sagt: So ist der Bulk nicht
 *     zulässig. Ein Hinweis (`notice`) sagt: Das fehlt in dieser Arbeitskopie, nicht im Bestand –
 *     etwa die Exportpakete, die nach `sources/README.md` bewusst nicht in Git liegen.
 *  3. **Eine Prüfung schlägt an oder sie fehlt.** Was sich hier nicht belastbar prüfen lässt, steht
 *     nicht als grüner Haken da (siehe Modulkopf von `evaluate.ts`).
 *
 * Die Prüfung `cloudflareConfigCheck` verlangt umgekehrt, dass das D1-Binding **da** ist: BayWü
 * bleibt in diesem Stand lokal; ein angelegtes Cloudflare-Gegenstück ist der Blocker, nicht sein
 * Fehlen. Sie arbeitet ausschließlich auf lokalen Dateien und ruft nie Cloudflare an.
 */
import { AUDIT_DIR, TARGET_JURISDICTION, type SourceArea } from '../common/constants.ts';
import type { ImportManifest } from '../common/manifest.ts';
import { enumerationPath } from '../common/paths.ts';
import { enumerationFingerprint, type EnumerationFile } from '../enumerate/enumeration.ts';
import { GAP_DATA_PATH, type GapReport } from '../enumerate/gap.ts';
import { CORPUS_PATH, type CorpusFile } from '../corpus/run.ts';

export interface ReadinessCheck {
  id: string;
  label: string;
  /** `pass` = ok · `notice` = Hinweis (kein Blocker) · `fail` = BLOCKER. */
  status: 'pass' | 'fail' | 'notice';
  detail: string;
}

export interface ReadinessResult {
  ready: boolean;
  checks: ReadinessCheck[];
  blockers: string[];
  notices: string[];
}

/* ------------------------------------------------------------------------------------------ */
/* Pfade und Erwartungen                                                                       */

export const READINESS_DOC = 'docs/BAYERN_BULK_READINESS.md';
export const SOURCE_DISCOVERY_DOC = 'docs/BAYERN_SOURCE_DISCOVERY.md';
export const LEGAL_SCOPE_DOC = 'docs/LEGAL_SCOPE.md';
export const ROBOTS_PATH = `${AUDIT_DIR}/discovery/robots.json`;
/** Pfade der geprüften Berichte – nicht neu gebildet, sondern aus den erzeugenden Modulen übernommen. */
export { GAP_DATA_PATH, CORPUS_PATH };
export const JUNIT_PATH = 'test-results/junit.xml';
export const WRANGLER_PATH = 'apps/web/wrangler.jsonc';
export const TRANSFORM_TEST_PATH = 'tests/unit/bayernrecht-transform.test.ts';

/** Host des Quellportals; seine robots.txt-Lage ist die Zugriffsgrundlage des ganzen Adapters. */
export const PORTAL_HOST = 'www.gesetze-bayern.de';

/** Bereiche mit Fortführungsnachweis und Portalfacette (der Bereich `events` wird nicht enumeriert). */
export const ENUMERABLE_AREAS: readonly SourceArea[] = ['landesrecht', 'vwv'];

/** Pflichtabschnitte des Bereitschaftsdokuments (Überschriften zweiter Ebene, Präfixvergleich). */
export const READINESS_DOC_SECTIONS = ['## 1 Was steht', '## 2 Was fehlt', '## 3 GO/No-Go', '## 4 Nächste Schritte'] as const;

/** Befehle, die für einen Bulk-Lauf registriert sein müssen (`package.json`, `scripts`). */
export const REQUIRED_SCRIPTS = [
  'import:bayernrecht:enumerate',
  'import:bayernrecht:sample',
  'import:bayernrecht:audit',
  'import:bayernrecht:coverage',
  'import:bayernrecht:readiness',
  'import:bayernrecht:review',
] as const;

/** Befehle, die die CLI als umgesetzt führen muss (`IMPLEMENTED_COMMANDS`). */
export const REQUIRED_IMPLEMENTED_COMMANDS = ['enumerate', 'sample', 'review', 'readiness', 'audit', 'coverage'] as const;

/**
 * Prüfungen (Vitest-Beschreibungen) aus den BayWü-Testdateien, die für ein GO vorhanden und grün sein
 * müssen. Gesucht wird nur in Testfällen der Dateien `tests/unit/bayernrecht-*.test.ts`; ein
 * gleichnamiger West- oder NSH-Test zählt nicht mit.
 */
export const REQUIRED_TEST_MARKERS = ['Fixpunkt', 'Abdeckungslücke', 'Paketleser', 'Idempotenz und Doppelungsfreiheit', 'Der ganze Weg', 'Readiness'] as const;

/** Testfall des statischen Secret-Scans (repoweit, `tests/unit/content-and-config.test.ts`). */
export const SECRET_SCAN_TEST_MARKER = 'Secret-Scan';

/**
 * Muster des statischen Secret-Scans – wortgleich zu `tests/unit/content-and-config.test.ts`, damit
 * beide dasselbe finden. Gemeldet werden nur Pfad und Art, nie der gefundene Wert.
 */
export const SECRET_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['API-/OAuth-Token-Zuweisung', /(?:^|[^A-Za-z0-9_])(?:api[_-]?token|oauth[_-]?token|refresh[_-]?token|secret[_-]?access[_-]?key|access[_-]?key[_-]?id)\s*[:=]\s*(?:["'][A-Za-z0-9_/+=.~-]{20,}["']|[A-Za-z0-9_/+=~-]{20,}(?![A-Za-z0-9_.]))/iu],
  ['Bearer-Token', /\bBearer\s+[A-Za-z0-9_.~+/=-]{24,}/u],
  ['AWS-Zugangsschlüssel', /\bAKIA[0-9A-Z]{16}\b/u],
  ['privater Schlüssel', /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/u],
  ['Wrangler-Anmeldedatei', /^expiration_time\s*=\s*"20\d\d-/u],
];

/** Öffentliche Beispielzugangsdaten der AWS-Dokumentation (SigV4-Testvektor), keine echten Schlüssel. */
export const SECRET_SCAN_ALLOWED = /AKIAIOSFODNN7EXAMPLE|EXAMPLEKEY/u;

const pass = (id: string, label: string, detail: string): ReadinessCheck => ({ id, label, status: 'pass', detail });
const fail = (id: string, label: string, detail: string): ReadinessCheck => ({ id, label, status: 'fail', detail });
const notice = (id: string, label: string, detail: string): ReadinessCheck => ({ id, label, status: 'notice', detail });

/** Kurze Aufzählung mit Obergrenze; die Zahl steht immer daneben, damit nichts weggerundet wirkt. */
export function listSome(values: readonly string[], limit = 12): string {
  return values.length <= limit ? values.join(', ') : `${values.slice(0, limit).join(', ')}, … (${values.length} insgesamt)`;
}

/* ------------------------------------------------------------------------------------------ */
/* 1. Zugriffslage                                                                             */

export interface RobotsHostRecord {
  host: string;
  role?: string;
  status?: string;
  verbatim?: string | null;
  effectiveRuleForOwnCrawler?: string | null;
  fetch?: { url?: string; httpStatus?: number; byteLength?: number; sha256?: string; retrievedAt?: string };
  note?: string;
}

export interface RobotsRecord {
  generatedAt?: string;
  hosts?: RobotsHostRecord[];
}

/**
 * Die robots.txt-Lage des Quellportals muss belegt sein – mit dem Wortlaut, dem HTTP-Status, dem
 * SHA-256 der empfangenen Bytes und dem Abrufzeitpunkt. Ein Verweis auf das Erkundungsdokument allein
 * genügt nicht: geprüft wird der Rohbefund, das Dokument muss daneben existieren.
 */
export function accessCheck(robots: RobotsRecord | undefined, discoveryDoc: string | undefined): ReadinessCheck {
  const id = 'zugriffslage';
  const label = 'Zugriffslage des Quellportals belegt';
  if (!robots) return fail(id, label, `${ROBOTS_PATH} fehlt – ohne Rohbefund der robots.txt ist die Zulässigkeit des Abrufs nicht belegt (npm run import:bayernrecht:enumerate)`);
  const host = robots.hosts?.find((entry) => entry.host === PORTAL_HOST);
  if (!host) return fail(id, label, `${ROBOTS_PATH} führt keinen Befund für ${PORTAL_HOST}`);
  const problems: string[] = [];
  if (host.status !== 'erlaubt') problems.push(`Status ${String(host.status)} statt „erlaubt“`);
  if (host.fetch?.httpStatus !== 200) problems.push(`robots.txt mit HTTP ${String(host.fetch?.httpStatus)} statt 200 abgerufen`);
  if (!/^[0-9a-f]{64}$/u.test(host.fetch?.sha256 ?? '')) problems.push('kein SHA-256 der empfangenen Bytes');
  if (!host.fetch?.retrievedAt) problems.push('kein Abrufzeitpunkt');
  if (!host.verbatim?.includes('Allow: /')) problems.push(`Wortlaut ohne „Allow: /“ (${JSON.stringify(host.verbatim ?? null)})`);
  if (discoveryDoc === undefined) problems.push(`${SOURCE_DISCOVERY_DOC} fehlt`);
  else if (!discoveryDoc.includes('robots.txt')) problems.push(`${SOURCE_DISCOVERY_DOC} erwähnt die robots.txt nicht`);
  if (problems.length > 0) return fail(id, label, `${PORTAL_HOST}: ${problems.join('; ')}`);
  const verbatim = (host.verbatim ?? '').split('\n').map((line) => line.trim()).filter(Boolean).join(' / ');
  return pass(id, label, `${PORTAL_HOST}: „${verbatim}“ (HTTP ${host.fetch?.httpStatus}, ${host.fetch?.byteLength} Bytes, SHA-256 ${(host.fetch?.sha256 ?? '').slice(0, 12)}…, abgerufen ${host.fetch?.retrievedAt}); Rohbefund ${ROBOTS_PATH}, Einordnung ${SOURCE_DISCOVERY_DOC}`);
}

/* ------------------------------------------------------------------------------------------ */
/* 2. Enumeration: vorhanden, abgeglichen, mit eigenem Fingerabdruck                           */

/**
 * Enumeration eines Bereichs: Sie muss vorhanden sein, Einträge führen, der Abgleich der beiden
 * unabhängigen Quellen (Fortführungsnachweis, Portalfacette) muss aufgehen, die Facettenaufnahme
 * vollständig sein – und der gespeicherte Fingerabdruck muss zum gespeicherten Inhalt passen. Der
 * letzte Punkt ist der Schutz gegen eine von Hand veränderte Zustandsdatei.
 */
export function enumerationCheck(area: SourceArea, file: EnumerationFile | undefined): ReadinessCheck {
  const id = `enumeration-${area}`;
  const label = `Enumeration ${area} vorhanden und abgeglichen`;
  const command = `npm run import:bayernrecht:enumerate -- --area ${area} --write`;
  if (!file) return fail(id, label, `${enumerationPath(area)} fehlt (${command})`);
  const problems: string[] = [];
  if (file.items.length === 0) problems.push('keine Einträge');
  if (!file.crosscheck.ok) problems.push(`Abgleich nicht in Ordnung: ${file.crosscheck.problems.join('; ') || 'ohne Begründung'}`);
  if (!file.sources.fortfuehrungsnachweis) problems.push('kein Fortführungsnachweis als Quelle vermerkt');
  if (!file.sources.facets) problems.push('keine Portalfacette als Quelle vermerkt');
  else if (!file.sources.facets.complete) problems.push('Facetten-Bestandsaufnahme unvollständig');
  if (!file.contentFingerprint) problems.push('kein Fingerabdruck');
  else {
    const recomputed = enumerationFingerprint(file);
    if (recomputed !== file.contentFingerprint) problems.push(`Fingerabdruck ${file.contentFingerprint.slice(0, 12)}… passt nicht zum Inhalt (${recomputed.slice(0, 12)}…) – die Datei wurde außerhalb des Importers verändert`);
  }
  const cross = file.crosscheck;
  const summary = `${file.items.length} Dokumente (Fortführungsnachweis ${cross.fortfuehrungsnachweisEntries}, Facette ${cross.facetDocuments}/${cross.facetTotal}, in beiden ${cross.inBoth}, nur Facette ${cross.onlyFacet}, nur Nachweis ${cross.onlyFortfuehrungsnachweis}); Normtyp belegt für ${cross.withNormType}`;
  if (problems.length > 0) return fail(id, label, `${summary}; ${problems.join('; ')} (${command})`);
  return pass(id, label, `${summary}; Fingerabdruck ${file.contentFingerprint.slice(0, 12)}…`);
}

/* ------------------------------------------------------------------------------------------ */
/* 2b. Enumerations-Fixpunkt (Rebuild aus denselben Eingaben)                                   */

export interface EnumerationFixpointCheckResult {
  area: SourceArea;
  /** `fixpoint`: Rebuild fachlich unverändert · `changed`: Abweichung · `unavailable`: Eingaben fehlen offline. */
  status: 'fixpoint' | 'changed' | 'unavailable';
  storedFingerprint?: string;
  rebuiltFingerprint?: string;
  differences: string[];
  detail: string;
}

/**
 * Ein Rebuild aus denselben Eingaben muss den Stand fachlich unverändert lassen. Fehlen die Eingaben
 * in dieser Arbeitskopie (leerer Abrufcache), ist das ein Hinweis – der Bestand ist deswegen nicht
 * schlechter, er ist hier nur nicht nachrechenbar.
 */
export function fixpointCheck(result: EnumerationFixpointCheckResult): ReadinessCheck {
  const id = `enumeration-fixpunkt-${result.area}`;
  const label = `Enumeration ${result.area} konvergiert (Fixpunkt)`;
  if (result.status === 'fixpoint') return pass(id, label, result.detail);
  if (result.status === 'unavailable') return notice(id, label, result.detail);
  return fail(id, label, result.detail);
}

/* ------------------------------------------------------------------------------------------ */
/* 3. Abdeckungslücke                                                                          */

/**
 * Die Differenz zwischen Portalfacette und Fortführungsnachweis muss aufgeklärt sein. Solange
 * Dokumente in der Gruppe `ungeklaert` stehen, ist ein vollständigkeitsgeprüfter Bulk nicht möglich:
 * Es ist dann unbekannt, ob sie in den Bestand gehören. Die Zahl **und** die Kennungen stehen in der
 * Meldung – sie sind die Arbeitsliste.
 */
export function enumerationGapCheck(gap: GapReport | undefined, examinedDocumentIds: readonly string[] = []): ReadinessCheck {
  const id = 'abdeckungsluecke';
  const label = 'Abdeckungslücke der Enumeration aufgeklärt';
  if (!gap) return fail(id, label, `${GAP_DATA_PATH} fehlt (npm run import:bayernrecht:enumerate -- --write)`);
  const unresolved = gap.groups.find((group) => group.group === 'ungeklaert');
  const explained = gap.groups.filter((group) => group.group !== 'ungeklaert');
  const breakdown = explained.map((group) => `${group.group} ${group.count}`).join(', ');
  const base = `${gap.totals.onlyFacet} Dokumente führt nur die Portalfacette, ${gap.groups.length} Gruppen (${breakdown}); Gegenrichtung ${gap.totals.onlyFortfuehrungsnachweis}`;
  if (!unresolved) return fail(id, label, `${base}; die Gruppe „ungeklaert“ fehlt im Bericht – der Rest ist damit nicht bilanziert`);

  // Ein Dokument der Gruppe `ungeklaert` gilt als aufgeklärt, sobald es einzeln geprüft ist: Der
  // Gruppenbericht leitet aus dem Fehlen im Register ab, ein Einzelbefund stellt am Dokument fest.
  // Die Gruppe selbst wird dabei **nicht** umgeschrieben – der Rohbefund bleibt, wie er war.
  const examined = new Set(examinedDocumentIds);
  const stillOpen = unresolved.documentIds.filter((documentId) => !examined.has(documentId));
  if (stillOpen.length > 0) {
    return fail(
      id,
      label,
      `${base}; ${stillOpen.length} von ${unresolved.count} Dokumenten der Gruppe „ungeklaert“ sind noch nicht einzeln geprüft: ${listSome(stillOpen, 20)} (${AUDIT_DIR}/ENUMERATION_GAP.md)`,
    );
  }
  const examinedNote = unresolved.count > 0 ? `; ${unresolved.count} zunächst ungeklärte Dokumente sind einzeln geprüft und eingeordnet` : '; keine ungeklärten Dokumente';
  return pass(id, label, `${base}${examinedNote}`);
}

/* ------------------------------------------------------------------------------------------ */
/* 4. Beispielkorpus                                                                           */

/**
 * Der Beispielkorpus muss jede Abdeckungsanforderung erfüllen, und jeder vorgesehene Strukturfall muss
 * im abgelegten Paket auch wirklich vorkommen (`missingExpected`). Ein vorgesehener, aber nicht
 * gefundener Fall ist ein Befund des Korpus – nicht eine Nebensache.
 */
export function corpusCheck(corpus: CorpusFile | undefined): ReadinessCheck {
  const id = 'beispielkorpus';
  const label = 'Beispielkorpus vollständig';
  const command = 'npm run import:bayernrecht:sample -- --write';
  if (!corpus) return fail(id, label, `${CORPUS_PATH} fehlt (${command})`);
  const failed = corpus.coverage.requirements.filter((requirement) => !requirement.ok);
  const missing = corpus.entries.filter((entry) => entry.missingExpected.length > 0);
  const cases = new Set(corpus.entries.flatMap((entry) => entry.cases));
  const summary = `${corpus.entries.length} Normen, ${corpus.coverage.requirements.length} Anforderungen, ${cases.size} Strukturfälle belegt`;
  const problems: string[] = [];
  if (failed.length > 0) problems.push(`nicht erfüllt: ${failed.map((requirement) => `${requirement.id} ${requirement.actual}/${requirement.minimum}`).join(', ')}`);
  if (!corpus.coverage.ok && failed.length === 0) problems.push('coverage.ok ist false, ohne dass eine Anforderung fehlschlägt');
  if (missing.length > 0) problems.push(`erwartete, aber am Paket nicht gefundene Strukturfälle: ${missing.map((entry) => `${entry.documentId} (${entry.missingExpected.join(', ')})`).join('; ')}`);
  if (problems.length > 0) return fail(id, label, `${summary}; ${problems.join('; ')} (${command})`);
  return pass(id, label, `${summary}; alle Anforderungen erfüllt, kein erwarteter Strukturfall fehlt`);
}

/* ------------------------------------------------------------------------------------------ */
/* 5. Ganzer Weg: Paket → Parser → Überleitung → geprüfte Zielnorm                              */

export interface FullPathReport {
  /** Normen des Korpus insgesamt. */
  total: number;
  /** Normen, deren Exportpaket in dieser Arbeitskopie liegt und die durchlaufen wurden. */
  checked: number;
  /** Kennungen ohne lokales Exportpaket (nach `sources/README.md` bewusst nicht in Git). */
  missing: string[];
  /** Fehler auf dem Weg – je Norm eine Zeile mit Kennung und Ursache. */
  problems: string[];
}

/**
 * Der ganze Weg über alle Bausteine. Fehlende Pakete sind ein Hinweis mit beiden Zahlen (geprüft und
 * fehlend) – sie liegen nach `sources/README.md` bewusst nicht in Git. Ein Fehler **auf** dem Weg ist
 * dagegen immer ein Blocker, auch wenn nur ein Teil des Korpus lokal vorliegt.
 */
export function fullPathCheck(report: FullPathReport): ReadinessCheck {
  const id = 'ganzer-weg';
  const label = 'Ganzer Weg geprüft (Rohpaket → Parser → Überleitung → validateNormRecord)';
  if (report.problems.length > 0) return fail(id, label, `${report.checked} von ${report.total} Normen geprüft, ${report.problems.length} mit Fehler: ${listSome(report.problems, 8)}`);
  if (report.total === 0) return fail(id, label, `kein Beispielkorpus vorhanden (${CORPUS_PATH}); ohne Korpus ist der Weg nicht geprüft`);
  if (report.missing.length > 0) {
    return notice(
      id,
      label,
      `${report.checked} von ${report.total} Normen geprüft, ${report.missing.length} Exportpakete fehlen in dieser Arbeitskopie (${listSome(report.missing, 8)}); sie liegen nach sources/README.md bewusst nicht in Git – npm run import:bayernrecht:sample -- --write holt sie aus dem Cache`,
    );
  }
  return pass(id, label, `${report.checked} von ${report.total} Normen vollständig durchlaufen, ohne Fehlerbefund`);
}

/* ------------------------------------------------------------------------------------------ */
/* 6. Scope-Entscheidung                                                                       */

/** Überschrift einer noch ausstehenden Entscheidung in `docs/LEGAL_SCOPE.md`. */
export const SCOPE_DECISION_HEADING = /^#{2,3}\s*Offene Entscheidung\b.*BAYERN\.RECHT/u;

/**
 * Die drei Scope-Fragen, die vor dem Bulk beantwortet sein müssen, und woran die Antwort im
 * Dokument erkennbar ist. Geprüft wird der **maschinenlesbare Grund**, nicht die Prosa: Ein Grund
 * erscheint später wörtlich im Manifest und in der Coverage, eine Formulierung im Fließtext nicht.
 */
export const REQUIRED_SCOPE_DECISIONS: ReadonlyArray<{ id: string; label: string; marker: RegExp }> = [
  { id: 'tarifvertrag', label: 'Tarifverträge', marker: /collective-agreement-out-of-landesrecht-scope/u },
  { id: 'bundeseinheitlich', label: 'bundeseinheitliche Anordnungen', marker: /federal-uniform-order-not-independent-state-law/u },
  { id: 'abbildungen', label: 'Abbildungen', marker: /^#{2,3}\s*Abbildungen\b.*\baufnehmen\b/mu },
];

/**
 * Scope: Vor dem Bulk muss feststehen, welche Dokumente in den Bestand gehören.
 *
 * Die Prüfung ist **positiv** angelegt und nicht als bloßes Fehlen eines Abschnitts: Sie verlangt für
 * jede der drei Fragen den Beleg, dass sie beantwortet ist. Eine Prüfung, die nur nach dem Wort
 * „offen“ sucht, bestünde auch dann, wenn jemand den ganzen Abschnitt löscht – und hätte genau dann
 * nichts mehr geprüft.
 *
 * Sie trifft **keine** Entscheidung. Sie stellt fest, ob eine getroffen wurde.
 */
export function scopeDecisionCheck(legalScope: string | undefined): ReadinessCheck {
  const id = 'scope';
  const label = 'Scope entschieden (Tarifverträge, bundeseinheitliche Anordnungen, Abbildungen)';
  if (legalScope === undefined) return fail(id, label, `${LEGAL_SCOPE_DOC} fehlt – ohne Scope-Dokument ist keine Entscheidung belegt`);

  const lines = legalScope.split('\n');
  const openIndex = lines.findIndex((line) => SCOPE_DECISION_HEADING.test(line.trim()));
  if (openIndex >= 0) {
    const heading = lines[openIndex]!.trim().replace(/^#+\s*/u, '');
    const end = lines.findIndex((line, position) => position > openIndex && /^##\s/u.test(line.trim()));
    const section = lines.slice(openIndex, end < 0 ? lines.length : end).join('\n');
    const openMarker = /steht aus|ist offen|noch nicht entschieden/iu.exec(section)?.[0];
    return fail(id, label, `${LEGAL_SCOPE_DOC} führt den Abschnitt „${heading}“ weiter als offen${openMarker ? ` („${openMarker}“)` : ''}: Solange nicht feststeht, welche Dokumentklassen in den Bestand gehören, steht der Umfang des Bulk-Laufs nicht fest.`);
  }

  const missing = REQUIRED_SCOPE_DECISIONS.filter((decision) => !decision.marker.test(legalScope));
  if (missing.length > 0) {
    return fail(
      id,
      label,
      `${LEGAL_SCOPE_DOC} belegt keine Entscheidung zu: ${missing.map((entry) => entry.label).join(', ')}. Erwartet wird der maschinenlesbare Grund je Klasse (${missing.map((entry) => entry.marker.source).join(' · ')}) – er erscheint später wörtlich im Manifest und in der Coverage.`,
    );
  }
  return pass(id, label, `${LEGAL_SCOPE_DOC} belegt alle drei Entscheidungen: ${REQUIRED_SCOPE_DECISIONS.map((entry) => entry.label).join(', ')}`);
}

/* ------------------------------------------------------------------------------------------ */
/* 7.–9. JUnit-gestützte Prüfungen: Überleitung, Tests, Secret-Scan                             */

export interface JUnitCase {
  classname: string;
  name: string;
  /** Inhalt des `<testcase>`-Elements (leer bei selbstschließendem Element). */
  body: string;
}

export interface JUnitReport {
  tests: number;
  failures: number;
  errors: number;
  skipped: number;
  cases: JUnitCase[];
}

const TESTCASE = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gu;

export function parseJUnit(xml: string): JUnitReport {
  const suite = /<testsuites\b[^>]*\btests="(\d+)"[^>]*\bfailures="(\d+)"[^>]*\berrors="(\d+)"/u.exec(xml);
  const cases: JUnitCase[] = [];
  for (const match of xml.matchAll(TESTCASE)) {
    const attributes = match[1] ?? '';
    cases.push({
      classname: /\bclassname="([^"]*)"/u.exec(attributes)?.[1] ?? '',
      name: /\bname="([^"]*)"/u.exec(attributes)?.[1] ?? '',
      body: match[2] ?? '',
    });
  }
  return {
    tests: Number(suite?.[1] ?? 0),
    failures: Number(suite?.[2] ?? 1),
    errors: Number(suite?.[3] ?? 1),
    skipped: (xml.match(/<skipped\b/gu) ?? []).length,
    cases,
  };
}

/** Ein Testfall gilt als nicht grün, wenn er einen Fehler trägt oder übersprungen wurde. */
const notGreen = (entry: JUnitCase): boolean => /<(?:failure|error|skipped)\b/u.test(entry.body);

/** Testfälle der BayWü-Testdateien; ein gleichnamiger West- oder NSH-Test zählt nicht mit. */
export const bayernTestCases = (report: JUnitReport): JUnitCase[] => report.cases.filter((entry) => /(?:^|\/)tests\/unit\/bayernrecht-[a-z-]+\.test\.ts$/u.test(entry.classname));

/**
 * Überleitung: Transformerversion vorhanden, und die Prüfungen, die Idempotenz und Doppelungsfreiheit
 * belegen, sind in der Testsuite vorhanden und grün. Der Nachweis liegt bewusst im Test und nicht in
 * einer erneuten Berechnung hier: Wer die Idempotenz in der Readiness noch einmal nachrechnet, prüft
 * seine eigene Kopie der Regel, nicht die des Transformers.
 */
export function transformerCheck(transformerVersion: string | undefined, junit: JUnitReport | undefined): ReadinessCheck {
  const id = 'ueberleitung';
  const label = 'Überleitung vorhanden und idempotent';
  if (!transformerVersion?.trim()) return fail(id, label, 'Der Transformer führt keine Version (TRANSFORMER_VERSION) – ohne Version ist kein Staleness-Vergleich möglich');
  if (!junit) return fail(id, label, `${transformerVersion}; ${JUNIT_PATH} fehlt – der Idempotenznachweis liegt im Test (npm run test)`);
  const marker = 'Idempotenz und Doppelungsfreiheit';
  const relevant = bayernTestCases(junit).filter((entry) => entry.name.includes(marker));
  if (relevant.length === 0) return fail(id, label, `${transformerVersion}; kein Testfall „${marker}“ in den BayWü-Testdateien (erwartet in ${TRANSFORM_TEST_PATH})`);
  const broken = relevant.filter(notGreen);
  if (broken.length > 0) return fail(id, label, `${transformerVersion}; ${broken.length} von ${relevant.length} Prüfungen „${marker}“ nicht grün: ${listSome(broken.map((entry) => entry.name))}`);
  return pass(id, label, `${transformerVersion}; ${relevant.length} Prüfungen „${marker}“ grün (${TRANSFORM_TEST_PATH})`);
}

export interface TestFreshness {
  /** Schreibzeitpunkt von `test-results/junit.xml` in Millisekunden. */
  junitMtimeMs: number;
  /** Jüngste Änderung an Quellcode oder Tests in Millisekunden. */
  newestSourceMtimeMs: number;
  /** Datei, die den jüngsten Stand trägt (für die Meldung). */
  newestSourcePath?: string;
}

/**
 * Tests grün, vollständig und aktuell. „Aktuell“ heißt deterministisch: Das Testergebnis darf nicht
 * älter sein als die jüngste Änderung an Quellcode oder Tests. Ein veraltetes Ergebnis ist ein
 * Blocker, kein Hinweis – es sagt über den heutigen Stand nichts aus.
 */
export function testsCheck(junit: JUnitReport | undefined, freshness: TestFreshness | undefined): ReadinessCheck {
  const id = 'tests';
  const label = 'Tests grün und aktuell';
  if (!junit || !freshness) return fail(id, label, `${JUNIT_PATH} fehlt (npm run test)`);
  const bayern = bayernTestCases(junit);
  const names = bayern.map((entry) => entry.name).join('\n');
  const missingMarkers = REQUIRED_TEST_MARKERS.filter((marker) => !names.includes(marker));
  const problems: string[] = [];
  if (junit.tests === 0) problems.push('keine Testfälle im Ergebnis');
  if (junit.failures > 0 || junit.errors > 0) problems.push(`${junit.failures} Fehlschläge, ${junit.errors} Fehler`);
  if (junit.skipped > 0) problems.push(`${junit.skipped} übersprungen`);
  if (missingMarkers.length > 0) problems.push(`fehlende BayWü-Prüfungen: ${missingMarkers.join(', ')}`);
  const stale = freshness.junitMtimeMs < freshness.newestSourceMtimeMs;
  if (stale) problems.push(`Testergebnis älter als der Quellcode${freshness.newestSourcePath ? ` (jüngste Änderung: ${freshness.newestSourcePath})` : ''}`);
  const summary = `${junit.tests} Tests (davon ${bayern.length} für BayWü), ${junit.failures} Fehlschläge, ${junit.errors} Fehler, ${junit.skipped} übersprungen`;
  if (problems.length > 0) return fail(id, label, `${summary}; ${problems.join('; ')} (npm run test)`);
  return pass(id, label, `${summary}; alle geforderten BayWü-Prüfungen vorhanden (${REQUIRED_TEST_MARKERS.join(', ')})`);
}

/**
 * Keine Zugangsdaten im Bestand. Zwei Belege, weil beide eine Lücke des anderen schließen: der
 * repoweite Secret-Scan aus der Testsuite (nur versionierte Dateien) und ein eigener Scan über die
 * Zustands- und Auditdateien dieses Adapters (auch die noch nicht versionierten).
 */
export function secretScanCheck(findings: readonly string[] | undefined, scannedFiles: number, junit: JUnitReport | undefined): ReadinessCheck {
  const id = 'zugangsdaten';
  const label = 'Keine Zugangsdaten im Bestand (statischer Secret-Scan)';
  if (findings === undefined) return fail(id, label, 'Der Scan über die Zustandsdateien des Adapters konnte nicht ausgeführt werden');
  if (findings.length > 0) return fail(id, label, `${findings.length} Fund(e) in den Zustandsdateien des Adapters: ${listSome([...findings])}`);
  const own = `${scannedFiles} Zustands- und Auditdateien des Adapters ohne Fund`;
  if (!junit) return notice(id, label, `${own}; der repoweite Secret-Scan ist nicht belegt (${JUNIT_PATH} fehlt, npm run test)`);
  const cases = junit.cases.filter((entry) => entry.name.includes(SECRET_SCAN_TEST_MARKER));
  if (cases.length === 0) return notice(id, label, `${own}; kein Testfall „${SECRET_SCAN_TEST_MARKER}“ im Testergebnis – der repoweite Scan ist nicht belegt`);
  const broken = cases.filter(notGreen);
  if (broken.length > 0) return fail(id, label, `${own}; der repoweite Secret-Scan ist nicht grün (${broken.length} von ${cases.length} Testfällen)`);
  return pass(id, label, `${own}; repoweiter Secret-Scan grün (${cases.length} Testfälle)`);
}

/* ------------------------------------------------------------------------------------------ */
/* 10. Cloudflare-Konfiguration für BayWü                                                      */

/** Platzhalter-IDs der Grundkonfiguration (`00000000-0000-4000-8000-…`) sind keine angelegte Ressource. */
export const PLACEHOLDER_DATABASE_ID = /^0{8}-0{4}-4000-8000-\d{12}$/u;

export interface CloudflareConfigInput {
  /** `database_id` des Bindings `landesrecht-baywue` aus `apps/web/wrangler.jsonc` (alle Environments). */
  databaseIds: Array<{ environment: string; databaseId: string }>;
  /** Rohquellen des Manifests mit R2-Objektschlüssel oder Bucket (Kennung → Beleg). */
  r2Objects: string[];
  /** Lokale Spuren eines Remote-Apply-Laufs (Projektionszustand, R2-Auditbericht, Staging). */
  remoteState: string[];
}

/**
 * Cloudflare-Konfiguration für BayWü.
 *
 * **Diese Prüfung war einmal umgekehrt** und schlug an, weil die D1 `landesrecht-baywue` existierte.
 * Sie hat damit das Richtige getan: Dokument und Konfiguration gingen auseinander. Aufgelöst ist das
 * inzwischen zugunsten der Konfiguration – die Datenbank wurde am 2026-09-16 zusammen mit West, NSH
 * und Ost angelegt und ist die vorgesehene Produktiv-D1 für BayWü. Sie bleibt bestehen und wird
 * weder gelöscht noch neu erstellt.
 *
 * Geprüft wird seitdem das Gegenteil: dass das Binding vorhanden ist und **keine Platzhalter-ID**
 * trägt. Ohne sie könnte der Bestand später nicht projiziert werden.
 *
 * Ausschließlich lokale Dateien. Ob die Datenbank bei Cloudflare tatsächlich leer ist, sagt diese
 * Prüfung nicht – das beantwortet `wrangler d1 info` vor dem Remote-Schritt, nicht die Readiness.
 *
 * R2-Objekte und Remote-Spuren sind **kein** Blocker mehr, sondern werden berichtet: Dieser Stand
 * sieht den Weg über R2 und Remote-D1 ausdrücklich vor, sobald die Gates davor grün sind.
 */
export function cloudflareConfigCheck(input: CloudflareConfigInput): ReadinessCheck {
  const id = 'baywue-cloudflare';
  const label = `Cloudflare-Konfiguration für ${TARGET_JURISDICTION} vorhanden`;
  if (input.databaseIds.length === 0) {
    return fail(id, label, `${WRANGLER_PATH}: kein D1-Binding landesrecht-baywue gefunden – ohne Binding lässt sich der Bestand später nicht projizieren`);
  }
  const placeholders = input.databaseIds.filter((entry) => PLACEHOLDER_DATABASE_ID.test(entry.databaseId));
  const real = input.databaseIds.filter((entry) => !PLACEHOLDER_DATABASE_ID.test(entry.databaseId));
  if (real.length === 0) {
    return fail(
      id,
      label,
      `${WRANGLER_PATH}: landesrecht-baywue trägt nur Platzhalter-ID(s) (${placeholders.map((entry) => entry.environment).join(', ')}) – die Produktiv-D1 ist nicht konfiguriert`,
    );
  }
  const state: string[] = [
    `${real.map((entry) => `${entry.environment}: ${entry.databaseId}`).join(', ')}`,
    ...(placeholders.length > 0 ? [`${placeholders.length} Platzhalter-Binding(s) für andere Environments`] : []),
    input.r2Objects.length > 0 ? `${input.r2Objects.length} Rohquelle(n) mit R2-Objektschlüssel im Manifest` : 'noch keine R2-Objekte im Manifest',
    input.remoteState.length > 0 ? `Spuren eines Remote-Laufs: ${listSome(input.remoteState)}` : 'kein Remote-Apply-Zustand',
  ];
  return pass(id, label, `${state.join(' · ')} – nur lokale Dateien geprüft, keine Cloudflare-Abfrage`);
}

/* ------------------------------------------------------------------------------------------ */
/* 11.–12. Dokument und Befehle                                                                */

export function readinessDocCheck(markdown: string | undefined): ReadinessCheck {
  const id = 'bereitschaftsdokument';
  const label = 'Bereitschaftsdokument vorhanden';
  if (markdown === undefined) return fail(id, label, `${READINESS_DOC} fehlt`);
  const lines = markdown.split('\n').map((line) => line.trim());
  const missing = READINESS_DOC_SECTIONS.filter((heading) => !lines.some((line) => line === heading || line.startsWith(`${heading} `)));
  if (missing.length > 0) return fail(id, label, `${READINESS_DOC}: fehlende Abschnitte ${missing.join(', ')}`);
  return pass(id, label, `${READINESS_DOC} mit den Abschnitten ${READINESS_DOC_SECTIONS.join(', ')}`);
}

/**
 * Befehle registriert: die `import:bayernrecht:*`-Skripte in `package.json` und – sofern die aufrufende
 * Stelle sie mitgibt – die Befehlsliste der CLI (`IMPLEMENTED_COMMANDS`). Ohne die Liste prüft die
 * Funktion nur die Skripte und sagt das auch; sie behauptet nicht, mehr geprüft zu haben.
 */
export function commandsCheck(scripts: Record<string, string> | undefined, implemented?: readonly string[]): ReadinessCheck {
  const id = 'befehle';
  const label = 'Befehle registriert';
  const missingScripts = REQUIRED_SCRIPTS.filter((script) => !scripts?.[script]);
  const missingCommands = implemented ? REQUIRED_IMPLEMENTED_COMMANDS.filter((command) => !implemented.includes(command)) : [];
  const problems: string[] = [];
  if (missingScripts.length > 0) problems.push(`fehlende Skripte in package.json: ${missingScripts.join(', ')}`);
  if (missingCommands.length > 0) problems.push(`von der CLI nicht als umgesetzt geführt: ${missingCommands.join(', ')}`);
  if (problems.length > 0) return fail(id, label, problems.join('; '));
  return pass(id, label, implemented ? `${REQUIRED_SCRIPTS.length} Skripte in package.json, ${REQUIRED_IMPLEMENTED_COMMANDS.length} Befehle in IMPLEMENTED_COMMANDS` : `${REQUIRED_SCRIPTS.length} Skripte in package.json (die Befehlsliste der CLI wurde nicht mitgegeben und ist deshalb nicht geprüft)`);
}

/* ------------------------------------------------------------------------------------------ */
/* Zusammenfassung                                                                             */

export function summarize(checks: readonly ReadinessCheck[]): ReadinessResult {
  const blockers = checks.filter((check) => check.status === 'fail').map((check) => `${check.label}: ${check.detail}`);
  const notices = checks.filter((check) => check.status === 'notice').map((check) => `${check.label}: ${check.detail}`);
  return { ready: blockers.length === 0, checks: [...checks], blockers, notices };
}

/** Manifesteinträge mit R2-Spur – Beleg für die umgekehrte Prüfung, ohne Cloudflare zu fragen. */
export function manifestR2Objects(manifest: Pick<ImportManifest, 'entries'> | undefined): string[] {
  const objects: string[] = [];
  for (const entry of manifest?.entries ?? []) {
    for (const raw of entry.rawDocuments) {
      if (raw.objectKey || raw.bucket || (raw.archiveStatus && raw.archiveStatus !== 'versioned')) {
        objects.push(`${entry.sourceIdentity} → ${raw.bucket ?? '?'}/${raw.objectKey ?? '?'} (${raw.archiveStatus ?? 'ohne Status'})`);
      }
    }
  }
  return objects.sort();
}
