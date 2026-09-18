/**
 * CLI des BAYERN.RECHT-Adapters (Aufruf über scripts/import-bayernrecht.ts).
 *
 * Dry-run ist überall Standard: Ohne `--write` schreibt kein Befehl. Befehle, deren Fachlogik noch nicht
 * existiert (Enumeration, Parser, Transformation entstehen nach der Quellen-Discovery), melden das
 * ausdrücklich und enden mit Exit 2 – nie mit stillem Erfolg.
 *
 * Exit-Codes: 0 ok · 1 Fehler oder Abweichung · 2 noch nicht implementiert bzw. systemischer Abbruch.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';

import { CACHE_DIR, EVALUATION_DATE, SOURCE_AREAS, SOURCE_STATE, TARGET_JURISDICTION, type SourceArea } from './common/constants.ts';
import { assertSourceArea } from './common/paths.ts';
import { enumerateSummary, runEnumerate } from './enumerate/run.ts';
import { corpusSummary, runSample } from './corpus/run.ts';
import { decideReviewItem, openReviewItems, readReviewQueue, REVIEW_CATEGORIES, REVIEW_ITEM_STATUSES, writeReviewShard, type ReviewDecision, type ReviewItemStatus } from './common/review.ts';
import { evaluateReadiness, renderReadiness } from './readiness/evaluate.ts';
import { auditSummary, runAudit } from './audit/audit.ts';
import { buildEventLedger, eventsSummary, writeEventLedger, DECEMBER_REPORT_PATH, LEDGER_PATH, REPORT_PATH } from './events/build.ts';
import { collectCoverage, coverageSummary, writeCoverage, COVERAGE_MARKDOWN_PATH, COVERAGE_PATH } from './audit/coverage.ts';
import { collectInventoryStatus, INVENTORY_STATUS_PATH, writeInventoryStatus } from './audit/inventory-status.ts';
import { INSTITUTIONS_REPORT_PATH, writeInstitutionsReport } from './audit/institutions.ts';
import { readManifest } from './common/manifest.ts';
import { fetchCorpusSummary, runFetchCorpus, FETCH_MIN_DELAY_MS } from './fetch/run.ts';
import { writeFetchReport, FETCH_REPORT_PATH } from './fetch/report.ts';
import { FETCH_STATE_PATH } from './fetch/state.ts';
import { SCOPE_REASON_LABELS } from './scope/decisions.ts';
import { buildScope, includedDocumentIds, scopeProblems, writeScope, SCOPE_PATH } from './scope/run.ts';
import { runInventory, writeInventory } from './inventory/run.ts';
import { writeInventoryReports } from './inventory/report.ts';
import { INVENTORY_PATH, STRUCTURE_REPORT_PATH, TEXT_INTEGRITY_REPORT_PATH, BLOCKING_OUTCOMES, INVENTORY_OUTCOMES, TEXT_INTEGRITY_CLASSES } from './inventory/model.ts';
import { buildBaseline, directlyImportable, writeBaseline, BASELINE_PATH } from './baseline/run.ts';
import { bulkExitCode, bulkSummary, runBulk, BULK_STATE_PATH } from './bulk/run.ts';
import { DEFAULT_SAMPLE_SIZE, R2_TRANSPORTS, runR2Sync, type R2TransportName } from './r2/command.ts';
import { KEY_PREFIX } from './r2/archive.ts';
import { R2_AUDIT_JSON_PATH, R2_AUDIT_MARKDOWN_PATH } from './r2/report.ts';
import { DEFAULT_STAGING_DIR, R2_SOURCES_BUCKET } from './common/environment.ts';
import { BAYWUE_REMOTE_SAMPLE_PATH, runBaywueRemoteSample, CROSS_JURISDICTION_PATH, BAYWUE_GOLDEN_MIN_QUERIES, BAYWUE_GOLDEN_QUERIES_PATH, BAYWUE_GOLDEN_RESULTS_JSON_PATH, BAYWUE_GOLDEN_RESULTS_MD_PATH, BAYWUE_SEARCH_DIR, runBaywueGolden } from './search/golden.ts';
import { runSearchAudit } from '@landesrecht/importer-recht-nrw/common/search-audit.ts';
import { acquireSources, FETCH_CHECKPOINT_PATH } from './reconstruction/acquire.ts';
import { reconstructionSummary, runReconstruction, writeReconstruction } from './reconstruction/run.ts';
import { baselineOnlySummary, DEFAULT_MAX_REQUESTS as BASELINE_ONLY_MAX_REQUESTS, runBaselineOnly } from './baseline-only/run.ts';

/** Befehle in der Reihenfolge, in der sie in der Übersicht erscheinen. */
export const COMMANDS = ['enumerate', 'scope', 'sample', 'baseline', 'fetch-corpus', 'inventory', 'bulk', 'audit', 'coverage', 'review', 'readiness', 'search-audit', 'reconstruction-queue', 'r2-sync', 'events', 'restore-baseline-only'] as const;
export type Command = (typeof COMMANDS)[number];

/**
 * Befehle, die bereits arbeiten. Alles andere endet mit „noch nicht implementiert“ (Exit 2); die
 * Liste wächst mit den Strängen Enumeration, Parser und Transformation.
 */
export const IMPLEMENTED_COMMANDS: readonly Command[] = ['enumerate', 'scope', 'sample', 'baseline', 'fetch-corpus', 'inventory', 'bulk', 'review', 'readiness', 'audit', 'coverage', 'events', 'r2-sync', 'search-audit', 'reconstruction-queue', 'restore-baseline-only'];

export interface CliOptions {
  command: string;
  /** `--help`/`-h` hinter einem Befehl: Hilfe ausgeben, nichts ausführen. */
  help: boolean;
  write: boolean;
  offline: boolean;
  /** Cache nicht lesen, sondern kontrolliert neu abrufen (Ergebnis ersetzt den Cacheeintrag). */
  refresh: boolean;
  json: boolean;
  resume: boolean;
  area?: SourceArea;
  limit?: number;
  /** Laufzeitbudget in Sekunden (fetch-corpus); sein Ende ist ein sauberer Halt, kein Fehler. */
  maxRuntimeSeconds?: number;
  /** search-audit: Basis-URL einer laufenden Instanz für die Remote-Stichprobe (nur lesend). */
  remoteSample?: string;
  only: string[];
  cacheDir?: string;
  baseline: string;
  /** Obergrenze der Netzabrufe eines Laufs; danach hält der Lauf sauber an (events). */
  maxRequests?: number;
  /** review --decide <id> --status <s> --reason <text> [--by <name>] [--override <id>] */
  decide?: string;
  status?: string;
  reason?: string;
  by?: string;
  override?: string;
  /** r2-sync: Einträge gleichzeitig (höchstens 8 bei wrangler, 32 bei wrangler-api). */
  concurrency?: number;
  /** r2-sync: Transport über die Wrangler-OAuth-Anmeldung. */
  r2Transport?: R2TransportName;
  /** r2-sync: Prüfregime (etag braucht ein Listing). */
  verify?: 'etag' | 'readback';
  /** r2-sync: Umfang der deterministischen Byte-Stichprobe der Nachprüfung. */
  sample?: number;
  /** r2-sync: Saat der deterministischen Stichprobe. */
  seed?: string;
  /** r2-sync: nur stagen und prüfen, kein Netz. */
  stageOnly?: boolean;
  /** r2-sync: Staging-Verzeichnis (Standard .cache/bayernrecht-r2-staging). */
  stagingDir?: string;
  /** reconstruction-queue: fehlende Verkündungen der Ketten gezielt abrufen (mit --max-requests, --offline). */
  fetch?: boolean;
}

function positiveInteger(value: string, option: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || String(parsed) !== value.trim()) throw new Error(`${option} erwartet eine ganze Zahl ≥ 0`);
  return parsed;
}

export function parseCliArguments(argv: readonly string[]): CliOptions {
  const [command = 'help', ...rest] = argv;
  const options: CliOptions = { command, help: false, write: false, offline: false, refresh: false, json: false, resume: false, only: [], baseline: SIMULATION_BASELINE_DATE };
  const value = (index: number, name: string): string => {
    const next = rest[index];
    if (next === undefined || next.startsWith('--')) throw new Error(`${name} erwartet einen Wert`);
    return next;
  };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]!;
    const [flag, inline] = argument.includes('=') && argument.startsWith('--') ? [argument.slice(0, argument.indexOf('=')), argument.slice(argument.indexOf('=') + 1)] : [argument, undefined];
    const take = (): string => inline ?? value(++index, flag);
    switch (flag) {
      case '--help': case '-h': options.help = true; break;
      case '--write': options.write = true; break;
      case '--dry-run': options.write = false; break;
      case '--offline': options.offline = true; break;
      case '--refresh': options.refresh = true; break;
      case '--json': options.json = true; break;
      case '--resume': options.resume = true; break;
      case '--limit': options.limit = positiveInteger(take(), '--limit'); break;
      case '--max-requests': options.maxRequests = positiveInteger(take(), '--max-requests'); break;
      case '--max-runtime': options.maxRuntimeSeconds = positiveInteger(take(), '--max-runtime'); break;
      case '--only': options.only.push(...take().split(',').map((entry) => entry.trim()).filter(Boolean)); break;
      case '--cache-dir': options.cacheDir = take(); break;
      case '--baseline': options.baseline = take(); break;
      case '--decide': options.decide = take(); break;
      case '--status': options.status = take(); break;
      case '--reason': options.reason = take(); break;
      case '--by': options.by = take(); break;
      case '--override': options.override = take(); break;
      case '--concurrency': options.concurrency = positiveInteger(take(), '--concurrency'); break;
      case '--sample': options.sample = positiveInteger(take(), '--sample'); break;
      case '--seed': options.seed = take(); break;
      case '--stage-only': options.stageOnly = true; break;
      case '--fetch': options.fetch = true; break;
      case '--staging-dir': options.stagingDir = take(); break;
      case '--remote-sample': options.remoteSample = take(); break;
      case '--r2-transport': {
        const transport = take();
        if (!(R2_TRANSPORTS as readonly string[]).includes(transport)) throw new Error(`--r2-transport erwartet ${R2_TRANSPORTS.join('|')} (ausschließlich Wrangler-OAuth)`);
        options.r2Transport = transport as R2TransportName;
        break;
      }
      case '--verify': {
        const verify = take();
        if (verify !== 'etag' && verify !== 'readback') throw new Error('--verify erwartet etag|readback');
        options.verify = verify;
        break;
      }
      case '--area': {
        const area = take();
        if (!(SOURCE_AREAS as readonly string[]).includes(area)) throw new Error(`--area erwartet ${SOURCE_AREAS.join('|')}`);
        options.area = area as SourceArea;
        break;
      }
      default:
        throw new Error(`Unbekannte Option: ${argument}`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(options.baseline)) throw new Error('--baseline erwartet ein ISO-Datum');
  return options;
}

export type Io = { print: (line: string) => void; error: (line: string) => void };

const COMMON_OPTIONS = `Gemeinsame Optionen:
  --write              schreiben; ohne --write ist jeder Befehl ein Dry-run
  --offline            nur den lokalen Cache (${CACHE_DIR}/) lesen; jeder Netzabruf ist ein Fehler
  --refresh            Cache übergehen und kontrolliert neu abrufen
  --limit <n>          höchstens n Einträge in diesem Lauf
  --max-requests <n>   höchstens n Netzabrufe; danach sauberer Halt (wiederaufnehmbar)
  --max-runtime <s>    Laufzeitbudget in Sekunden (fetch-corpus); Budgetende ist ein sauberer Halt
  --only <a,b,…>       nur diese Einträge (Quellidentität, BayRS-Nummer oder Adresse); mehrfach erlaubt
  --area <bereich>     Quellbereich ${SOURCE_AREAS.join(' | ')}
  --json               maschinenlesbare Ausgabe, wo vorhanden
  --resume             vorhandenen Fortschritt fortsetzen
  --cache-dir <pfad>   Cacheverzeichnis (Standard ${CACHE_DIR})
  --baseline <datum>   Stichtag der Quellfassung (Standard ${SIMULATION_BASELINE_DATE})
  --help, -h           diese Hilfe`;

/** Hilfetexte je Befehl. Noch nicht implementierte Befehle sagen, was sie tun werden und woran es hängt. */
export const COMMAND_HELP: Readonly<Record<Command, string>> = {
  enumerate: `enumerate --area landesrecht|vwv [--write] [--offline] [--refresh] [--json]
  Vollständige Enumeration eines Quellbereichs aus zwei unabhängigen Quellen: dem Fortführungsnachweis
  (/Content/Document/ffn bzw. /ffn-mbl – ein Abruf, liefert BayRS-Gliederungsnummer, Sachgebiet, Titel
  und Änderungshistorie) und der Portalfacette NORMTYP (liefert den Normtyp und den vollständigen
  Portalbestand). Der Rebuild läuft bis zum Fixpunkt; ein zweiter Lauf ist byteidentisch.
  Ziel:  data/imports/bayernrecht/enumeration-<bereich>.json
  Ferner: data/audits/bayernrecht/facet-inventory.json (einmalige Bestandsaufnahme der Facetten,
          rund 243 Trefferlistenseiten; danach netzfrei aus dem Cache)
          data/audits/bayernrecht/ENUMERATION_GAP.md + enumeration-gap.json (Abdeckungslücke)
  Der Bereich events hat keinen Fortführungsnachweis und wird nicht enumeriert.`,
  sample: `sample [--area landesrecht|vwv] [--write] [--offline] [--limit n] [--only a,b] [--json]
  Lädt den Beispielkorpus (XML-Exportpakete ausgewählter Normen), legt jedes Paket unverändert unter
  sources/bayernrecht/<id>/ ab – mit Begleitdatei (Adresse, SHA-256, Content-Type, Bytes, Abrufzeit) –
  und prüft an jedem Paket nach, welche Strukturfälle es tatsächlich abdeckt.
  Ziel: data/imports/bayernrecht/corpus.json
  Setzt die Enumeration voraus (enumerate --write).`,
  'fetch-corpus': `fetch-corpus [--write] [--area landesrecht|vwv] [--limit n] [--max-runtime <sekunden>] [--only a,b] [--refresh] [--json]
  Holt für jedes enumerierte Dokument das XML-Exportpaket (zipUrl) in den lokalen Cache (${CACHE_DIR}/)
  und schreibt den Fortschritt nach ${FETCH_STATE_PATH}; Kurzbericht: ${FETCH_REPORT_PATH}.
  Beschaffung, kein Import: keine Norm, kein Content, kein Manifest. Geprüft wird nur, dass die Antwort
  ein ZIP ist (Content-Type und Signatur „PK“); entpackt und geparst wird nichts.
  Wiederanlauf ist der Normalfall: Was im Cache liegt, wird nicht erneut geholt; Checkpoint nach jedem
  Dokument. Schonend: nacheinander, mindestens ${FETCH_MIN_DELAY_MS} ms Abstand, Retry-After und Backoff.
  --limit und --max-runtime sind Budgets – ihr Ende ist ein sauberer, fortsetzbarer Halt, kein Fehler.
  Fällt der freie Plattenplatz unter 5 GB, hält der Lauf an und sagt es.
  --refresh prüft vorhandene Einträge gegen die Quelle, **ersetzt sie aber nie**: Andere Bytes sind ein
  Befund source-changed mit beiden Hashes.
  Ohne --write wird nichts abgerufen und nichts geschrieben; der Lauf sagt nur, was zu holen wäre.`,
  bulk: `bulk [--area landesrecht|vwv] [--write] [--resume] [--limit n] [--max-runtime <s>] [--only a,b] [--json]
  Bulk-Lauf über die Kandidaten des Scope: Er übernimmt den Ausgangsrechtsstand nach
  content/norms/${TARGET_JURISDICTION}/ – je Norm meta.json,
  history.json und versions/${SIMULATION_BASELINE_DATE}.json, dazu Manifesteintrag, Review-Fälle und
  Slug-Reservierung. Übernommen wird nur, was alle drei Bedingungen erfüllt:
    1. Scope-Entscheidung include (${SCOPE_PATH}),
    2. Stichtagsstatus active-at-baseline ohne Blocker und auf dem Weg current-unchanged
       (${BASELINE_PATH}) – dort **ist** der heutige Text der Stichtagstext,
    3. Text vollständig: Parser ohne error-Befund, Überleitung ohne error, validateNormRecord bestanden.
  Alles andere wird nicht übernommen, sondern als Review-Fall geführt (Rekonstruktionsbedarf,
  unbestimmte Geltung, Normativitätsreview, unvollständige Beilagen, Parserabweichung,
  widersprüchliche Evidenz). Jede übernommene Norm trägt im Manifest den decisionTrace: Klasse,
  Status, Methode, Begründung und Belegkette – die Antwort auf die Frage, warum sie am
  ${SIMULATION_BASELINE_DATE} galt.
  Zeitmodell: simulationValidFrom ist für jede Norm der Stichtag; die reale Quellgeltung
  (sourceValidFrom/sourceValidTo) bleibt davon getrennt. Reale Änderungen nach dem Stichtag sind
  Belege, keine Simulationsfassungen.
  Betrieb: kein Netzzugriff (fehlt ein Paket, ist das skipped-not-cached); Checkpoint nach jedem
  Kandidaten in ${BULK_STATE_PATH}; --resume setzt deterministisch fort; --limit und --max-runtime
  sind Budgets, ihr Ende ist ein sauberer Halt. Normlokale Fehler werden festgehalten, der Lauf geht
  weiter; systemische Fehler (Cache unlesbar, Zustandsdatei beschädigt, Slug-Registry inkonsistent,
  reihenweise derselbe Parserfehler) halten ihn an (Exit 2).
  Ein zweiter Lauf über denselben Stand ändert nichts: Gleicher Inhalt wird nicht neu geschrieben,
  und ein Reimport mit schlechterem Ergebnis lässt Manifest und Inhalt stehen (kept-existing).
  Laufbericht: data/audits/bayernrecht/runs/<lauf-id>.json (nur mit --write).`,
  audit: `audit [--json]
  Konsistenzprüfung des Bestands – liest nur, schreibt nie (auch nicht mit --write). Gegengeprüft
  werden Enumeration ↔ Manifest ↔ Slug-Registry ↔ Beispielkorpus, die Rohquellen unter
  sources/bayernrecht/ (Begleitdatei vorhanden, SHA-256 nachgerechnet), die Review-Fälle gegen das
  Manifest und die Overrides gegen die Einträge, in die sie eingreifen.
  Jede Abweichung wird mit ihrer Kennung benannt; Exit 1, sobald eine bleibt. Was in dieser
  Arbeitskopie nur fehlt (Exportpakete, siehe sources/README.md), ist ein Hinweis, keine Abweichung.`,
  scope: `scope [--write] [--json]
  Wendet die Scope-Entscheidungen aus docs/LEGAL_SCOPE.md auf den enumerierten Bestand an: je
  Dokument genau eine Entscheidung (include | exclude | review) mit maschinenlesbarem Grund und Beleg.
  Ziel: ${SCOPE_PATH}
  Der Befehl entscheidet nichts – er vollzieht die redaktionelle Entscheidung und weist nach, dass
  kein enumeriertes Dokument ohne Einordnung bleibt.`,
  baseline: `baseline [--write] [--json] [--limit n]
  Stichtagsklassifikation über die aufzunehmenden Normen: Galt die Vorschrift am Stichtag, und ist
  der heutige Text zugleich ihr Stichtagstext? Je Norm eine Entscheidung mit Belegkette.
  Quelle: der Paketcache; ohne Netzzugriff. Ziel: ${BASELINE_PATH}`,
  inventory: `inventory [--write] [--resume] [--limit n] [--only a,b] [--area landesrecht|vwv] [--json]
  Strukturinventur über den Scope-Bestand: Jeder include-Kandidat mit vorhandenem Exportpaket läuft
  einmal den ganzen Weg – ZIP → XML → Parser → Überleitung → NormRecord → validateNormRecord –, und
  zwar **meldend**: Der Parser läuft mit unknown='report', ein Fehler an einem Dokument beendet den
  Lauf nicht. Je Dokument genau ein Ausgang:
    parsed · parsed-with-warnings · unknown-structure · integrity-mismatch
    schema-failed · transform-failed · missing-assets · source-corrupt
  Fehlt das Paket im Cache, ist das skipped-not-cached – kein Fehler, nur nicht geprüft.
  Befunde werden nicht aufgelistet, sondern nach struktureller Signatur (Element, Elternpfad,
  Attributkombination, Überschriften-, Tabellen-, Fußnoten-, Bild- und Anlagenmuster) zu Klassen
  zusammengefasst; je Klasse Zahl der betroffenen Dokumente und bis zu fünf echte Beispiele.
  Zusätzlich für jedes geparste Dokument die Textintegrität (sichtbarer Quelltext gegen kanonischen
  Text): ${TEXT_INTEGRITY_CLASSES.join(' · ')}. Ein mismatch ist ein Importhindernis.
  Ziele: ${INVENTORY_PATH}
         ${STRUCTURE_REPORT_PATH}
         ${TEXT_INTEGRITY_REPORT_PATH}
  Kein Netzabruf: Gelesen wird ausschließlich der Cache (${CACHE_DIR}/). Es entsteht keine Norm,
  kein Content, kein Manifest – die Inventur zählt, sie importiert nicht.
  Deterministisch und wiederholbar: kein Tagesdatum, keine Laufzeit im Ergebnis, @builddate des XML
  in keinem Vergleich. --resume übernimmt Einträge eines früheren Laufs, solange der SHA-256 des
  Cacheeintrags gleich bleibt; --limit begrenzt die neu geprüften Dokumente.`,
  coverage: `coverage [--write] [--json]
  Kennzahlen des Bestands: enumerierte Dokumente je Bereich und Normtyp, Manifeststatus,
  Korpusabdeckung je Strukturfall, Anteil der Normen mit Änderung nach dem Stichtag.
  Ziel: data/audits/bayernrecht/coverage.json und data/audits/bayernrecht/COVERAGE.md
  Deterministisch: Die Zahlen hängen nur vom Bestand ab; ein zweiter Lauf schreibt nichts.`,
  review: `review [--area ${SOURCE_AREAS.join('|')}] [--json] [--limit n]
review --decide <id> --status <s> --reason <text> [--by <name>] [--override <id>] [--write]
  Ohne --decide: offene Review-Fälle des BayWü-Bestands (optional je Bereich). Mit --decide: Entscheidung
  zu einem Fall (Status ${REVIEW_ITEM_STATUSES.filter((status) => status !== 'open').join('|')});
  --reason ist Pflicht, --override verweist auf data/imports/bayernrecht/overrides.json.
  Gespeichert nur mit --write. Kategorien: ${REVIEW_CATEGORIES.join(', ')}`,
  readiness: `readiness [--json]
  Maschinelle Bereitschaftsprüfung gegen docs/BAYERN_BULK_READINESS.md: erste Zeile READY oder
  NOT READY (Exit 0/1), danach jede Prüfung mit ok, Hinweis oder BLOCKER und einer Begründung, die
  ohne das Dokument verständlich ist.
  Geprüft werden Zugriffslage, Enumeration und Fixpunkt, Abdeckungslücke, Beispielkorpus, der ganze
  Weg (Rohpaket → Parser → Überleitung → validateNormRecord), die Scope-Entscheidung, Überleitung,
  Testsuite, Zugangsdaten, Bereitschaftsdokument und die registrierten Befehle.
  Umgekehrte Prüfung: BayWü bleibt lokal – eine angelegte Cloudflare-Ressource ist ein Blocker.
  Kein Netzabruf, kein Cloudflare-Aufruf; es werden nur lokale Dateien gelesen.`,
  'search-audit': `search-audit [--sample n] [--seed s] [--remote-sample url] [--json] [--write]
  Suchintegrität der lokal projizierten BayWü-Normen: geschichtete Stichprobe (Titel, Abkürzung,
  Strukturadressen, Nummern, Typ- und Länderfilter, FTS-Integrität; --sample 0 = ganzer Bestand)
  und das Golden Set (${BAYWUE_GOLDEN_QUERIES_PATH}, mindestens ${BAYWUE_GOLDEN_MIN_QUERIES} Anfragen,
  beide Match-Modi). Fehlt das Golden Set, wird es aus dem Bestand erzeugt; mit --write wird es
  geschrieben und danach von Hand gepflegt. Ergebnisse: ${BAYWUE_SEARCH_DIR}/.
  --remote-sample url: nur die Remote-Stichprobe (≥ 50 Fälle des Golden Sets, nur lesende GET-Anfragen
  gegen url/api/v1/search?jurisdiction=baywue); prüft zusätzlich, dass kein Treffer aus einem anderen Land kommt.`,
  'reconstruction-queue': `reconstruction-queue [--write] [--json] [--only id,id]
  reconstruction-queue --fetch [--max-requests n] [--offline] [--only id,id]
  Rückrechnung der Normen, deren Text nach dem Stichtag geändert wurde (changed-after-baseline), aus
  dem Cache – kein Netz. Ein- und mehrstufig: Die Kette folgt vom Vollzitat den amtlichen Verweisen
  („zuletzt geändert durch …“) bis zur Fassung am Stichtag; ein Rezept entsteht nur, wenn jede Änderung
  mit belegtem Inkrafttreten nach dem Stichtag eindeutig umkehrbar ist, der Beginn der Stichtagsfassung
  mit Kalenderdatum belegt ist und das Forward-Replay exakt den heutigen Text ergibt (Rezept v1 für
  eine, v2 für mehrere Änderungen). Alle übrigen erhalten Zustand, genau eine Gruppe und Gründe.
  Ziele (nur mit --write): data/imports/bayernrecht/reconstruction/<documentId>.json (Rezepte),
  data/imports/bayernrecht/reconstruction-queue.json, reconstruction-sources.json (Quellenregister),
  data/audits/bayernrecht/reconstruction-audit.json, RECONSTRUCTION.md und die Entscheidungen in
  baseline.json (reverse-amendment; neu geprüfte unbestimmte Geltungsfälle). baseline.json wird beim
  Schreiben frisch gelesen. Nach „baseline --write“ erneut ausführen. --only = Probelauf, schreibt nie.
  --fetch: fehlende Verkündungen der Ketten gezielt abrufen (sequenziell, Adapter-Fetcher, Cache,
  Prüfpunkt data/imports/bayernrecht/reconstruction-fetch.json, Standardbudget 1500 Abrufe); mit
  --offline netzfrei (meldet nur, was fehlt). Methode: docs/BAYWUE_RECONSTRUCTION.md.`,
  'r2-sync': `r2-sync [--write] [--stage-only] [--r2-transport wrangler|wrangler-api] [--concurrency n] [--verify etag|readback] [--limit n] [--sample n] [--seed s] [--staging-dir pfad] [--json]
  Rohquellenarchiv: legt das Exportpaket jeder übernommenen Norm (Manifest imported oder
  imported-with-warnings) unverändert nach ${DEFAULT_STAGING_DIR}/ (nicht in Git), mit Objektschlüssel
  unter ${KEY_PREFIX} und Umschlag (URL, finale URL, Abrufzeit, Media Type, Bytes, SHA-256,
  Quellidentität), prüft Manifest ↔ Staging (0 fehlende Objekte, SHA-256 nachgerechnet) und überträgt
  erst dann nach R2 (Bucket ${R2_SOURCES_BUCKET}, privat). Schlägt das Staging-Audit fehl, gibt es keinen Sync.
  Archivstatus je Rohquelle im Manifest: staged → uploaded → verified; die Normdateien bleiben unberührt.
  Wiederaufnehmbar; gleicher Inhalt zählt als vorhanden, anderer Inhalt ist ein harter Fehler; nichts
  wird überschrieben oder gelöscht; jeder Schlüssel außerhalb von ${KEY_PREFIX} ist ein Fehler.
  Nachprüfung: Listing (Objektzahl, Größe, Etag = MD5), deterministische Byte-Stichprobe (Standard
  ${DEFAULT_SAMPLE_SIZE}, SHA-256 nach Download), Bucketzählung vorher/nachher global und unter baywue/.
  Bericht: ${R2_AUDIT_JSON_PATH}, ${R2_AUDIT_MARKDOWN_PATH}.
  Anmeldung ausschließlich über die Wrangler-OAuth-Anmeldung (npx wrangler login):
    --r2-transport wrangler      Standard: wrangler r2 object put/get --remote (langsam, ohne Listing → readback)
    --r2-transport wrangler-api  R2-Objekt-API mit dem OAuth-Token aus Wranglers Anmeldedatei; lokal deutlich
                                 schneller (--concurrency 32 --verify etag). CLOUDFLARE_API_TOKEN wird abgelehnt.
  Läuft die Anmeldung ab und lässt sich nicht erneuern, hält die Remotephase an (Exit 2) und nennt den
  Wiederaufnahmebefehl. Ohne --write: Dry-run ohne Netz.`,
  events: `events [--write] [--json] [--limit n] [--offline] [--refresh] [--max-requests n]
  Post-Baseline-Ereignisregister aus den amtlichen Verkündungsorganen des Freistaats Bayern: GVBl.
  (elektronisch nachrichtlich, amtlich ist die Druckausgabe) und BayMBl. (elektronisch amtlich).
  Erfasst wird der volle Zeitraum vom Tag nach dem Stichtag bis zum Auswertungsstichtag; maßgeblich ist
  das Verkündungsdatum, nie das Ausfertigungsdatum. Erzeugt keine Normen und keinen Normtext.
  Ziele: data/imports/bayernrecht/events/ledger.json
         data/audits/bayernrecht/EVENT_LEDGER.md
         data/audits/bayernrecht/POST_BASELINE_DECEMBER_2023.md
  Jedes amend/repeal/replace wird über Gliederungsnummer, Fundstelle im Änderungsverlauf, Abkürzung,
  vollständigen Titel und Ausfertigungsdatum auf die Zielnorm aufgelöst; ein bloß ähnlicher Titel trägt
  nie eine starke Zuordnung. Ein Ende ohne bestimmbaren Vorgänger wird als missing-predecessor geführt.
  Netzdisziplin: sequenziell, mindestens 1,4 s Abstand, identifizierender User-Agent, alles über den
  Cache ${CACHE_DIR}/; mit --offline läuft der Aufbau vollständig netzfrei aus dem Cache.
  Setzt die Enumeration voraus (enumerate --write) – sie ist der Abgleichbestand.`,
  'restore-baseline-only': `restore-baseline-only [--write] [--only id,id] [--offline] [--max-requests n] [--json]
  Heute fehlende Stichtagsnormen (Kandidaten des Ereignisregisters, isBaselineOnlyCandidate) aus den amtlichen
  Verkündungen wiederherstellen: Identität und Ende im Aufhebungsbefehl, Stammverkündung (BayMBl. ab 2019,
  Amtsblätter 2009–2018, GVBl.), Beginn nur mit Kalenderdatum aus der Inkrafttretensvorschrift, Gegenprobe der
  Änderungsfolge über die Gliederungsnummern im amtlichen Organ, Änderungen nur mit Rundlauf. Unsichere Fälle
  bleiben Review mit genau benanntem fehlendem Glied (candidates.json). Methode: docs/BAYWUE_BASELINE_ONLY.md.
  Quellen über den Adapter-Fetcher und den Cache ${CACHE_DIR}/ (sequenziell, Abrufbudget --max-requests, Standard
  ${BASELINE_ONLY_MAX_REQUESTS}; Prüfpunkt ${CACHE_DIR}/baseline-only-run.json); mit --offline netzfrei.
  Ziele (nur mit --write): data/imports/bayernrecht/baseline-only/<id>.json (Rezepte), candidates.json,
  data/audits/bayernrecht/BASELINE_ONLY.md, je sicherer Norm content/norms/${TARGET_JURISDICTION}/<slug>/, Manifesteintrag
  im Bereich events (Rohquellen Rolle gazette) und Slug-Reservierung. --only schreibt keine Kandidatenliste.`,
};

export function renderHelp(command?: string): string {
  if (command && (COMMAND_HELP as Record<string, string>)[command]) return `${(COMMAND_HELP as Record<string, string>)[command]}\n\n${COMMON_OPTIONS}`;
  const descriptions: Record<Command, string> = {
    enumerate: 'Enumeration eines Quellbereichs',
    sample: 'Validierungskorpus je Bereich',
    'fetch-corpus': 'Exportpakete des ganzen Bestands in den Cache holen',
    bulk: 'Bulk-Lauf über die Enumeration (Resume, Budgets, Checkpoints)',
    audit: 'Konsistenzprüfung des Bestands',
    scope: 'Scope-Entscheidung je enumeriertem Dokument',
    baseline: 'Stichtagsklassifikation der Normkandidaten',
    inventory: 'Strukturinventur des vollständigen Korpus',
    coverage: 'Kennzahlen des Bestands',
    review: 'Review-Fälle anzeigen und entscheiden',
    readiness: 'READY / NOT READY',
    'search-audit': 'Suchintegrität',
    'reconstruction-queue': 'Rekonstruktionsqueue',
    'r2-sync': 'gestagte Rohquellen nach R2',
    events: 'Verkündungsereignisse als Belege',
    'restore-baseline-only': 'heute fehlende Stichtagsnormen aus Verkündungen',
  };
  const overview = [
    `BAYERN.RECHT-Importer (${SOURCE_STATE} → Simulationsland ${TARGET_JURISDICTION.toUpperCase()}). Dry-run ist überall Standard.`,
    'Aufruf: node scripts/import-bayernrecht.ts <befehl> [optionen]   (npm run import:bayernrecht:<befehl> -- [optionen])',
    '',
    'Befehle:',
    ...COMMANDS.map((command) => `  ${command.padEnd(22)} ${descriptions[command]}${IMPLEMENTED_COMMANDS.includes(command) ? '' : ' (noch nicht implementiert)'}`),
    '',
    'Hilfe je Befehl: help <befehl> oder <befehl> --help',
    ...(command ? ['', `Unbekannter Befehl: ${command}`] : []),
  ];
  return `${overview.join('\n')}\n\n${COMMON_OPTIONS}`;
}

/** Einheitliche Meldung für alles, was noch nicht gebaut ist – nie stiller Erfolg. */
function notImplemented(command: Command, io: Io): number {
  io.error(`Befehl „${command}“ ist noch nicht implementiert (BAYERN.RECHT-Adapter, Ausbaustufe Zustand & Gerüst).`);
  io.error(`Was fehlt: siehe „${command} --help“. Der Zustand (Manifest, Review, Evidenz, Pfade) steht bereits; Enumeration, Beispielkorpus, Parser, Überleitung, Bulk, Readiness, Audit, Coverage und R2-Sync sind umgesetzt; Suchaudit und Rekonstruktionsschlange folgen.`);
  return 2;
}

/** review: offene Fälle anzeigen oder genau einen Fall entscheiden. Liest den Bestand, schreibt nur mit --write. */
async function runReviewCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const queue = await readReviewQueue(root);
  if (options.decide) {
    const status = options.status ?? '';
    if (!(REVIEW_ITEM_STATUSES as readonly string[]).includes(status) || status === 'open') {
      io.error(`--status erwartet ${REVIEW_ITEM_STATUSES.filter((candidate) => candidate !== 'open').join('|')}`);
      return 1;
    }
    if (!options.reason?.trim()) {
      io.error('--reason ist Pflicht: Eine Entscheidung ohne Begründung wird nicht gespeichert.');
      return 1;
    }
    const item = queue.items.find((candidate) => candidate.id === options.decide);
    if (!item) {
      io.error(`Review-Fall ${options.decide} existiert nicht.`);
      return 1;
    }
    const decision: ReviewDecision = {
      decision: status as Exclude<ReviewItemStatus, 'open'>,
      reason: options.reason,
      decidedAt: new Date().toISOString().slice(0, 10),
      ...(options.by ? { decidedBy: options.by } : {}),
      ...(options.override ? { override: options.override } : {}),
    };
    const updated = decideReviewItem(queue, item.id, decision);
    if (!options.write) {
      io.print(`Dry-run: ${item.id} → ${decision.decision} (${decision.reason}). Mit --write speichern.`);
      return 0;
    }
    const written = await writeReviewShard(root, updated, item.sourceArea, item.sourceIdentity);
    io.print(`${item.id} → ${decision.decision}; geschrieben: ${written.path}`);
    return 0;
  }
  const open = openReviewItems(queue).filter((item) => !options.area || item.sourceArea === options.area);
  const shown = options.limit === undefined ? open : open.slice(0, options.limit);
  if (options.json) {
    io.print(JSON.stringify({ jurisdiction: TARGET_JURISDICTION, total: queue.items.length, open: open.length, items: shown }, null, 2));
    return 0;
  }
  io.print(`Review-Queue ${TARGET_JURISDICTION.toUpperCase()}: ${queue.items.length} Fälle, offen ${open.length}${options.area ? ` (Bereich ${options.area})` : ''}`);
  for (const item of shown) io.print(`  ${item.id} · ${item.category}${item.severity === 'blocking' ? '!' : ''} · ${item.sourceIdentity} · ${item.summary}`);
  if (shown.length < open.length) io.print(`  … ${open.length - shown.length} weitere (mit --limit begrenzt)`);
  return 0;
}

/** Bereiche, die einen Fortführungsnachweis und eine Portalfacette haben. */
const ENUMERABLE_AREAS: readonly SourceArea[] = ['landesrecht', 'vwv'];

/** enumerate: Quellen abrufen, Enumeration bis zum Fixpunkt bauen, Abdeckungslücke bilanzieren. */
async function runEnumerateCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const areas = options.area ? [assertSourceArea(options.area)] : ENUMERABLE_AREAS;
  const unsupported = areas.filter((area) => !ENUMERABLE_AREAS.includes(area));
  if (unsupported.length > 0) {
    io.error(`Der Bereich ${unsupported.join(', ')} hat keinen Fortführungsnachweis und keine Portalfacette – er wird nicht enumeriert.`);
    return 1;
  }
  let exitCode = 0;
  const reports = [];
  for (const area of areas) {
    const result = await runEnumerate({ root, area, write: options.write, offline: options.offline, refresh: options.refresh, baselineDate: options.baseline, ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}), log: options.json ? (): void => undefined : (line) => io.print(line) });
    if (!result.file.crosscheck.ok || result.invariantProblems.length > 0) exitCode = 1;
    if (options.json) reports.push({ area, path: result.path, written: result.written, crosscheck: result.file.crosscheck, gap: { total: result.gap.totals.onlyFacet, groups: result.gap.groups.map((group) => ({ group: group.group, count: group.count })) }, networkRequests: result.networkRequests });
    else {
      for (const line of enumerateSummary(result)) io.print(line);
      io.print(options.write ? `  ${result.path}: ${result.written ? 'geschrieben' : 'unverändert'}` : `  Dry-run: nichts geschrieben (${result.path}). Mit --write speichern.`);
    }
  }
  if (options.json) io.print(JSON.stringify({ jurisdiction: TARGET_JURISDICTION, areas: reports }, null, 2));
  return exitCode;
}

/** sample: Beispielkorpus laden, Pakete ablegen, Strukturfälle am Paket nachprüfen. */
async function runSampleCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const result = await runSample({
    root,
    write: options.write,
    offline: options.offline,
    refresh: options.refresh,
    ...(options.area ? { area: assertSourceArea(options.area) } : {}),
    ...(options.limit === undefined ? {} : { limit: options.limit }),
    ...(options.only.length > 0 ? { only: options.only } : {}),
    ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}),
    log: options.json ? (): void => undefined : (line) => io.print(line),
  });
  if (options.json) io.print(JSON.stringify({ jurisdiction: TARGET_JURISDICTION, corpus: result.corpus, problems: result.problems }, null, 2));
  else {
    for (const line of corpusSummary(result)) io.print(line);
    io.print(options.write ? `  ${result.path}: ${result.written ? 'geschrieben' : 'unverändert'}` : `  Dry-run: nichts geschrieben (${result.path}). Mit --write speichern.`);
  }
  return result.problems.length === 0 ? 0 : 1;
}

/**
 * fetch-corpus: Exportpakete des enumerierten Bestands in den Cache holen. Beschaffung, kein Import –
 * es entsteht keine Norm und kein Manifesteintrag, nur Cache, Fortschrittszustand und Kurzbericht.
 * Exit 1 nur bei gescheiterten Dokumenten oder Befunden; ein Budgethalt ist kein Fehler (Exit 0).
 */
async function runFetchCorpusCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const result = await runFetchCorpus({
    root,
    write: options.write,
    offline: options.offline,
    refresh: options.refresh,
    ...(options.area ? { area: assertSourceArea(options.area) } : {}),
    ...(options.limit === undefined ? {} : { limit: options.limit }),
    ...(options.maxRuntimeSeconds === undefined ? {} : { maxRuntimeMs: options.maxRuntimeSeconds * 1_000 }),
    ...(options.only.length > 0 ? { only: options.only } : {}),
    ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}),
    log: options.json ? (): void => undefined : (line) => io.print(line),
  });
  const reportWritten = options.write ? await writeFetchReport(root, result, new Date().toISOString()) : false;
  if (options.json) {
    io.print(JSON.stringify({ jurisdiction: TARGET_JURISDICTION, state: { path: result.path, written: result.written, totals: result.state.totals }, run: { fetched: result.fetched, fromCache: result.fromCache, failed: result.failed, skipped: result.skipped, wouldFetch: result.wouldFetch, networkRequests: result.networkRequests, bytesDownloaded: result.bytesDownloaded, durationMs: result.durationMs, stopReason: result.stopReason ?? null, stopDetail: result.stopDetail ?? null }, findings: result.findings }, null, 2));
  } else {
    for (const line of fetchCorpusSummary(result)) io.print(line);
    io.print(options.write ? `  ${result.path}: ${result.written ? 'geschrieben' : 'unverändert'} · ${FETCH_REPORT_PATH}: ${reportWritten ? 'geschrieben' : 'unverändert'}` : `  Dry-run: nichts abgerufen, nichts geschrieben (${result.path}). Mit --write holen.`);
  }
  return result.state.totals.failed === 0 && result.findings.length === 0 ? 0 : 1;
}

/**
 * readiness: Bereitschaftsprüfung gegen `docs/BAYERN_BULK_READINESS.md`. Exit 0 bei READY, sonst 1.
 * Liest nur; `--write` hat hier keine Bedeutung, weil nichts entsteht.
 */
async function runReadinessCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const result = await evaluateReadiness(root, { implementedCommands: IMPLEMENTED_COMMANDS });
  if (options.json) io.print(JSON.stringify({ jurisdiction: TARGET_JURISDICTION, status: result.ready ? 'READY' : 'NOT READY', ...result }, null, 2));
  else for (const line of renderReadiness(result)) io.print(line);
  return result.ready ? 0 : 1;
}

/** audit: Konsistenzprüfung; Exit 1, sobald eine Abweichung bleibt. Schreibt nie. */
async function runAuditCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const report = await runAudit(root);
  if (options.json) io.print(JSON.stringify(report, null, 2));
  else {
    for (const line of auditSummary(report)) io.print(line);
    if (options.write) io.print('  (audit schreibt nichts – ein Audit, das den geprüften Zustand verändert, prüft anschließend sich selbst.)');
  }
  return report.ok ? 0 : 1;
}

/** scope: Entscheidung je enumeriertem Dokument; schreibt nur mit `--write`. */
async function runScopeCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  // Konstantes Datum statt Tagesdatum: Ein Wiederholungslauf muss byteidentisch sein.
  const file = await buildScope(root, { generatedAt: EVALUATION_DATE });
  if (options.json) io.print(JSON.stringify(file, null, 2));
  else {
    io.print(`Scope BAYWUE (bayernrecht), Stichtag ${file.baselineDate}: ${file.totals.documents} enumerierte Dokumente`);
    io.print(`  aufzunehmen ${file.totals.byDecision.include} · auszuschließen ${file.totals.byDecision.exclude} · zu prüfen ${file.totals.byDecision.review}`);
    for (const [reason, count] of Object.entries(file.totals.byReason).sort((left, right) => right[1] - left[1])) {
      io.print(`  ${String(count).padStart(5)}  ${reason} – ${SCOPE_REASON_LABELS[reason as keyof typeof SCOPE_REASON_LABELS] ?? ''}`);
    }
    for (const [area, counts] of Object.entries(file.totals.byArea)) {
      io.print(`  ${area}: ${counts.documents} Dokumente (include ${counts.include}, exclude ${counts.exclude}, review ${counts.review})`);
    }
  }
  const enumeratedIds = file.entries.map((entry) => entry.documentId);
  const problems = scopeProblems(file, enumeratedIds);
  if (problems.length > 0) {
    for (const problem of problems) io.error(`  Abweichung: ${problem}`);
    return 1;
  }
  io.print(`  Jedes enumerierte Dokument ist eingeordnet; ${includedDocumentIds(file).length} Dokumente stehen für den Bulk bereit.`);
  if (!options.write) {
    io.print(`Dry-run: nichts geschrieben (${SCOPE_PATH}). Mit --write speichern.`);
    return 0;
  }
  const written = await writeScope(root, file);
  io.print(written ? `Geschrieben: ${SCOPE_PATH}` : `Unverändert: keine Datei neu geschrieben (${SCOPE_PATH}).`);
  return 0;
}

/** baseline: Stichtagsklassifikation; schreibt nur mit `--write`. */
async function runBaselineCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const file = await buildBaseline(root, { evaluationDate: EVALUATION_DATE, ...(options.limit ? { limit: options.limit } : {}) });
  if (options.json) io.print(JSON.stringify(file, null, 2));
  else {
    const t = file.totals;
    io.print(`Stichtag ${file.baselineDate}: ${t.candidates} Kandidaten, ${t.examined} geprüft (${t.notCached} nicht im Cache, ${t.unreadable} nicht lesbar)`);
    for (const [key, count] of Object.entries(t.byClass).sort((left, right) => right[1] - left[1])) io.print(`  ${String(count).padStart(5)}  ${key}`);
    io.print(`  Stichtagsstatus: ${Object.entries(t.byStatus).map(([key, count]) => `${key} ${count}`).join(' · ')}`);
    io.print(`  Ausfertigungsdatum aus: ${Object.entries(t.issueDateSource).map(([key, count]) => `${key} ${count}`).join(' · ')}`);
    io.print(`  Heutiger Text ist zugleich Stichtagstext: ${directlyImportable(file).length}`);
  }
  if (!options.write) {
    io.print(`Dry-run: nichts geschrieben (${BASELINE_PATH}). Mit --write speichern.`);
    return 0;
  }
  const written = await writeBaseline(root, file);
  io.print(written ? `Geschrieben: ${BASELINE_PATH}` : `Unverändert: keine Datei neu geschrieben (${BASELINE_PATH}).`);
  return 0;
}

/**
 * inventory: Strukturinventur über den Scope-Bestand. Liest nur den Cache, ruft nie ab und schreibt
 * nur mit `--write`. Exit 1 allein bei systemischem Abbruch (kein Scope, kein Cache) – ein
 * Importhindernis an einem Dokument ist das Ergebnis der Inventur, nicht ihr Scheitern.
 */
async function runInventoryCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const result = await runInventory({
    root,
    ...(options.area ? { area: assertSourceArea(options.area) } : {}),
    ...(options.limit === undefined ? {} : { limit: options.limit }),
    ...(options.only.length > 0 ? { only: options.only } : {}),
    ...(options.resume ? { resume: true } : {}),
    ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}),
    log: options.json ? (): void => undefined : (line) => io.print(line),
  });
  const { totals, classes } = result.file;
  if (options.json) {
    io.print(JSON.stringify({ jurisdiction: TARGET_JURISDICTION, totals, classes, run: { processed: result.processed, reused: result.reused, stoppedAtLimit: result.stoppedAtLimit } }, null, 2));
  } else {
    io.print(`Strukturinventur BAYWUE (bayernrecht), Stichtag ${result.file.baselineDate}: ${totals.candidates} Kandidaten laut Scope`);
    io.print(`  geprüft ${totals.checked} · Paket nicht im Cache ${totals.notCached}${totals.pending > 0 ? ` · in diesem Lauf nicht erreicht ${totals.pending}` : ''} (neu geprüft ${result.processed}, übernommen ${result.reused})`);
    for (const outcome of INVENTORY_OUTCOMES) {
      if (totals.byOutcome[outcome] > 0) io.print(`  ${String(totals.byOutcome[outcome]).padStart(5)}  ${outcome}${BLOCKING_OUTCOMES.includes(outcome) ? ' ← Importhindernis' : ''}`);
    }
    for (const value of TEXT_INTEGRITY_CLASSES) {
      if (totals.byTextIntegrity[value] > 0) io.print(`  ${String(totals.byTextIntegrity[value]).padStart(5)}  Textintegrität ${value}`);
    }
    io.print(`  Strukturklassen: ${classes.length}${classes.length > 0 ? ` · größte: ${classes.slice(0, 3).map((entry) => `${entry.signature} (${entry.documents})`).join(' · ')}` : ''}`);
    if (result.stoppedAtLimit) io.print(`  Budget --limit erreicht; mit --resume fortsetzen.`);
  }
  if (!options.write) {
    io.print(`Dry-run: nichts geschrieben (${INVENTORY_PATH}, ${STRUCTURE_REPORT_PATH}, ${TEXT_INTEGRITY_REPORT_PATH}). Mit --write speichern.`);
    return 0;
  }
  const written = await writeInventory(root, result.file);
  const reports = await writeInventoryReports(root, result.file);
  io.print(`${written ? 'Geschrieben' : 'Unverändert'}: ${INVENTORY_PATH}${reports.written.length > 0 ? ` · geschrieben: ${reports.written.join(', ')}` : ''}${reports.unchanged.length > 0 ? ` · unverändert: ${reports.unchanged.join(', ')}` : ''}`);
  return 0;
}

/**
 * bulk: Übernahme des Ausgangsrechtsstands. Dry-run ist die Voreinstellung – ohne `--write` entsteht
 * keine Norm, kein Manifesteintrag, kein Laufbericht; gerechnet und entschieden wird trotzdem
 * vollständig. Exit 2 bei systemischem Abbruch, 1 bei normlokalen Fehlern oder gehaltenem Bestand,
 * sonst 0 (ein Budgethalt ist kein Fehler).
 */
async function runBulkCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  if (options.area === 'events') {
    io.error('Der Bereich events trägt Verkündungsereignisse, keine Normen – er wird nie importiert.');
    return 1;
  }
  const result = await runBulk({
    root,
    write: options.write,
    resume: options.resume,
    ...(options.area ? { area: assertSourceArea(options.area) } : {}),
    ...(options.limit === undefined ? {} : { limit: options.limit }),
    ...(options.maxRuntimeSeconds === undefined ? {} : { maxRuntimeMs: options.maxRuntimeSeconds * 1_000 }),
    ...(options.only.length > 0 ? { only: options.only } : {}),
    ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}),
    log: options.json ? (): void => undefined : (line) => io.print(line),
  });
  if (options.json) io.print(JSON.stringify({ report: { path: result.reportPath, written: result.reportWritten }, ...result.summary }, null, 2));
  else for (const line of bulkSummary(result)) io.print(line);
  return bulkExitCode(result);
}

/**
 * r2-sync: Staging → Staging-Audit → Sync → Nachprüfung → Bericht (Umsetzung in `r2/command.ts`). Exit 0 bei
 * verified/partial, 1 bei Befund oder gesperrtem Sync, 2, wenn die Remotephase auf eine interaktive Anmeldung wartet.
 */
async function runR2SyncCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  return runR2Sync(
    {
      write: options.write,
      json: options.json,
      ...(options.stageOnly ? { stageOnly: true } : {}),
      ...(options.limit === undefined ? {} : { limit: options.limit }),
      ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
      ...(options.r2Transport ? { transport: options.r2Transport } : {}),
      ...(options.verify ? { verify: options.verify } : {}),
      ...(options.sample === undefined ? {} : { sample: options.sample }),
      ...(options.seed ? { seed: options.seed } : {}),
      ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}),
      ...(options.stagingDir ? { stagingDir: options.stagingDir } : {}),
    },
    root,
    io,
  );
}

/** coverage: Kennzahlen als Markdown und JSON; schreibt nur mit `--write`, ein zweiter Lauf nichts. */
async function runCoverageCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const report = await collectCoverage(root);
  if (options.json) io.print(JSON.stringify(report, null, 2));
  else for (const line of coverageSummary(report)) io.print(line);
  if (!options.write) {
    io.print(`Dry-run: nichts geschrieben (${COVERAGE_PATH}, ${COVERAGE_MARKDOWN_PATH}). Mit --write speichern.`);
    return 0;
  }
  const { written, unchanged } = await writeCoverage(root, report);
  // Bestandsstand für den Hinweis „Teilbestand“ im Portal – aus denselben Belegen wie die Kennzahlen.
  const status = await collectInventoryStatus(root);
  (await writeInventoryStatus(root, status)) ? written.push(INVENTORY_STATUS_PATH) : unchanged.push(INVENTORY_STATUS_PATH);
  (await writeInstitutionsReport(root, await readManifest(root))) ? written.push(INSTITUTIONS_REPORT_PATH) : unchanged.push(INSTITUTIONS_REPORT_PATH);
  io.print(`Bestandsstand: ${status.published} veröffentlicht · offen ${status.pending.atBaseline} am Stichtag belegt geltend, ${status.pending.baselineOnly} heute fehlend, ${status.pending.undetermined} unentschieden · ${status.complete ? 'vollständig' : 'Teilbestand'}`);
  io.print(written.length === 0 ? `Unverändert: keine Datei neu geschrieben (${unchanged.join(', ')}).` : `Geschrieben: ${written.join(', ')}${unchanged.length > 0 ? ` · unverändert: ${unchanged.join(', ')}` : ''}`);
  return 0;
}

/**
 * events: Ereignisregister aus den Verkündungsorganen aufbauen. Schreibt nur mit `--write`; ein zweiter
 * Lauf über dieselben Quellen erzeugt byteidentische Dateien, weil der Auswertungsstichtag eine
 * Konstante ist. Exit 1, solange Reviewfälle ohne bestimmbaren Vorgänger offen sind oder der Lauf
 * wegen eines Budgets angehalten hat.
 */
async function runEventsCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const result = await buildEventLedger({
    root,
    offline: options.offline,
    refresh: options.refresh,
    ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}),
    ...(options.limit === undefined ? {} : { limit: options.limit }),
    ...(options.maxRequests === undefined ? {} : { maxNetworkRequests: options.maxRequests }),
    log: options.json ? (): void => undefined : (line) => io.print(line),
  });
  if (options.json) {
    io.print(JSON.stringify({ jurisdiction: TARGET_JURISDICTION, ...result.statistics }, null, 2));
  } else {
    for (const line of eventsSummary(result)) io.print(line);
  }
  if (!options.write) {
    if (!options.json) io.print(`Dry-run: nichts geschrieben (${LEDGER_PATH}, ${REPORT_PATH}, ${DECEMBER_REPORT_PATH}). Mit --write speichern.`);
    return result.statistics.pending.length === 0 ? 0 : 1;
  }
  const written = await writeEventLedger(root, result);
  io.print(written.length === 0 ? 'Unverändert: keine Datei neu geschrieben.' : `Geschrieben: ${written.join(', ')}`);
  return result.statistics.pending.length === 0 ? 0 : 1;
}

async function runSearchAuditCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  if (options.remoteSample) {
    const remote = await runBaywueRemoteSample(root, options.remoteSample, { write: options.write });
    const m = remote.evaluation.overall;
    io.print(`Remote-Stichprobe BayWü: ${remote.sample} Fälle gegen ${options.remoteSample} – Recall@10 ${m.recallAt10}, MRR ${m.mrr}, Top-1 ${m.top1}, Sprungziel ${m.anchorOk}, Nulltreffer ${m.nullOk}, verletzt ${m.failed}, fremde Treffer ${remote.foreignHits.length}, p50 ${m.latencyMs.p50} ms / p95 ${m.latencyMs.p95} ms`);
    for (const outcome of remote.evaluation.outcomes.filter((entry) => entry.failed)) io.print(`  ! ${outcome.id} „${outcome.query}“: Rang ${outcome.rank ?? '–'}, ${outcome.total} Treffer`);
    for (const hit of remote.foreignHits.slice(0, 10)) io.print(`  ! fremder Treffer ${hit}`);
    if (options.write) io.print(`Geschrieben: ${BAYWUE_REMOTE_SAMPLE_PATH}`);
    return m.failed === 0 && remote.foreignHits.length === 0 ? 0 : 1;
  }
  const full = options.sample === 0;
  const audit = await runSearchAudit(root, {
    jurisdictions: [TARGET_JURISDICTION],
    mode: full ? 'full' : 'fast',
    workers: full ? 4 : 1,
    ...(options.sample ? { sample: options.sample } : {}),
    ...(options.seed ? { seed: options.seed } : {}),
  });
  const golden = await runBaywueGolden(root, { write: options.write });
  const goldenFailed = golden.evaluations.reduce((sum, evaluation) => sum + evaluation.overall.failed, 0);
  const crossFailed = golden.cross.filter((entry) => !entry.ok).length;
  if (options.json) {
    io.print(JSON.stringify({ jurisdiction: TARGET_JURISDICTION, audit: { ok: audit.ok, norms: audit.norms, checks: audit.checks, failures: audit.failures }, golden: { queries: golden.set.queries.length, evaluations: golden.evaluations.map(({ outcomes: _outcomes, ...rest }) => rest) }, crossJurisdiction: golden.cross }, null, 2));
  } else {
    io.print(`Suchprüfung BayWü (${audit.profile.mode}): ${audit.ok ? 'GRÜN' : 'ROT'} · ${audit.norms} Normen · ${audit.searchUnits} Sucheinheiten`);
    for (const [check, counts] of Object.entries(audit.checks)) if (counts.passed || counts.failed) io.print(`  ${check.padEnd(20)} bestanden ${String(counts.passed).padStart(6)} · gescheitert ${String(counts.failed).padStart(4)}${counts.skipped ? ` · übersprungen ${counts.skipped}` : ''}`);
    for (const failure of audit.failures.slice(0, 10)) io.print(`  ✗ ${failure.check} ${failure.slug}: ${failure.detail.slice(0, 120)}`);
    io.print(`Golden Set: ${golden.set.queries.length} Anfragen${golden.generated ? ' (aus dem Bestand erzeugt)' : ''}`);
    for (const evaluation of golden.evaluations) {
      const m = evaluation.overall;
      io.print(`  ${evaluation.matchMode}: Recall@10 ${m.recallAt10}, MRR ${m.mrr}, Top-1 ${m.top1}, Sprungziel ${m.anchorOk}, Nulltreffer ${m.nullOk}, verletzt ${m.failed}, p95 ${m.latencyMs.p95} ms`);
      for (const outcome of evaluation.outcomes.filter((entry) => entry.failed)) io.print(`    ! ${outcome.id} „${outcome.query}“: Rang ${outcome.rank ?? '–'}, ${outcome.total} Treffer, erste: ${outcome.hits.slice(0, 3).join(', ') || '–'}`);
    }
    io.print(`West + BayWü: ${golden.cross.length - crossFailed}/${golden.cross.length} gemeinsame Titelbruchstücke richtig gefiltert`);
    for (const entry of golden.cross.filter((candidate) => !candidate.ok)) io.print(`    ! „${entry.fragment}“: beide ${entry.bothJurisdictions}, nur BayWü ${entry.baywueOnly}, nur West ${entry.westOnly}, Typ ${entry.typeFilter.type} ${entry.typeFilter.ok}`);
  }
  if (options.write) {
    await mkdir(join(root, BAYWUE_SEARCH_DIR), { recursive: true });
    const path = `${BAYWUE_SEARCH_DIR}/search-audit-${audit.profile.mode}.json`;
    await writeFile(join(root, path), `${JSON.stringify({ writtenAt: new Date().toISOString(), ...audit }, null, 2)}\n`, 'utf8');
    if (!options.json) io.print(`Geschrieben: ${path}, ${golden.generated ? `${BAYWUE_GOLDEN_QUERIES_PATH}, ` : ''}${BAYWUE_GOLDEN_RESULTS_JSON_PATH}, ${BAYWUE_GOLDEN_RESULTS_MD_PATH}, ${CROSS_JURISDICTION_PATH}`);
  } else if (!options.json) io.print('Dry-run: nichts geschrieben. Mit --write speichern.');
  if (golden.set.queries.length < BAYWUE_GOLDEN_MIN_QUERIES) {
    io.error(`Golden Set zu klein: ${golden.set.queries.length} < ${BAYWUE_GOLDEN_MIN_QUERIES}`);
    return 1;
  }
  return audit.ok && goldenFailed === 0 && crossFailed === 0 ? 0 : 1;
}

export async function runCli(argv: readonly string[], io: Io = { print: console.log, error: console.error }): Promise<number> {
  const [first, second] = argv;
  if (first === undefined || first === 'help' || first === '--help' || first === '-h') {
    io.print(renderHelp(second));
    return second === undefined || (COMMAND_HELP as Record<string, string>)[second] ? 0 : 1;
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    // Hilfe vor jeder Ausführung und vor der Prüfung weiterer Optionen.
    io.print(renderHelp(first));
    return (COMMAND_HELP as Record<string, string>)[first] ? 0 : 1;
  }
  if (!(COMMANDS as readonly string[]).includes(first)) {
    io.error(renderHelp(first));
    return 1;
  }
  const options = parseCliArguments(argv);
  const command = options.command as Command;
  const root = resolveRepositoryRoot();
  if (command === 'review') return runReviewCommand(options, root, io);
  if (command === 'enumerate') return runEnumerateCommand(options, root, io);
  if (command === 'sample') return runSampleCommand(options, root, io);
  if (command === 'fetch-corpus') return runFetchCorpusCommand(options, root, io);
  if (command === 'readiness') return runReadinessCommand(options, root, io);
  if (command === 'audit') return runAuditCommand(options, root, io);
  if (command === 'scope') return runScopeCommand(options, root, io);
  if (command === 'baseline') return runBaselineCommand(options, root, io);
  if (command === 'inventory') return runInventoryCommand(options, root, io);
  if (command === 'coverage') return runCoverageCommand(options, root, io);
  if (command === 'events') return runEventsCommand(options, root, io);
  if (command === 'bulk') return runBulkCommand(options, root, io);
  if (command === 'r2-sync') return runR2SyncCommand(options, root, io);
  if (command === 'search-audit') return runSearchAuditCommand(options, root, io);
  if (command === 'reconstruction-queue') return runReconstructionCommand(options, root, io);
  if (command === 'restore-baseline-only') return runRestoreBaselineOnlyCommand(options, root, io);
  return notImplemented(command, io);
}

/** reconstruction-queue: Rückrechnung aus dem Cache; schreibt nur mit `--write` und nie im Probelauf (`--only`). */
async function runReconstructionCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  if (options.fetch) {
    const result = await acquireSources(root, {
      maxRequests: options.maxRequests ?? 1500,
      offline: options.offline,
      ...(options.only.length > 0 ? { only: options.only } : {}),
      log: options.json ? (): void => undefined : (line) => io.print(line),
    });
    if (options.json) io.print(JSON.stringify({ ...result, checkpoint: undefined }, null, 2));
    else io.print(`Abruf: ${result.rounds} Runde(n), ${result.networkRequests} Netzabruf(e) in diesem Lauf, ${result.fetched} abgerufen, ${result.notFound} belegt nicht vorhanden, ${result.errors} Fehler; noch fehlend: ${result.stillMissing.length}${result.stoppedBy ? ` – Halt: ${result.stoppedBy}` : ''}. Prüfpunkt: ${FETCH_CHECKPOINT_PATH} (insgesamt ${result.checkpoint.networkRequests} Netzabrufe).`);
    return result.stoppedBy ? 2 : 0;
  }
  const run = await runReconstruction(root, { baselineDate: options.baseline, evaluationDate: EVALUATION_DATE, ...(options.only.length > 0 ? { only: options.only } : {}) });
  if (options.json) io.print(JSON.stringify(run.queue, null, 2));
  else for (const line of reconstructionSummary(run)) io.print(line);
  if (!options.write) {
    io.print('Dry-run: nichts geschrieben. Mit --write speichern.');
    return 0;
  }
  if (options.only.length > 0) {
    io.error('--only ist ein Probelauf und schreibt nie: die Schlange und baseline.json brauchen den ganzen Bestand.');
    return 1;
  }
  const written = await writeReconstruction(root, run);
  io.print(written.length === 0 ? 'Unverändert: keine Datei neu geschrieben.' : `Geschrieben: ${written.length} Datei(en)\n  ${written.join('\n  ')}`);
  return 0;
}

/**
 * restore-baseline-only: heute fehlende Stichtagsnormen wiederherstellen. Ohne `--write` Dry-run (Quellen werden im
 * Budget in den Cache geholt, außer mit `--offline`). Exit 1, wenn eine Wiederherstellung an der Überleitung oder am
 * Schema scheitert, sonst 0 – Review-Fälle sind ein Ergebnis, kein Fehler.
 */
async function runRestoreBaselineOnlyCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const run = await runBaselineOnly({
    root,
    write: options.write,
    offline: options.offline,
    baselineDate: options.baseline,
    ...(options.only.length > 0 ? { only: options.only } : {}),
    ...(options.maxRequests === undefined ? {} : { maxRequests: options.maxRequests }),
    log: options.json ? (): void => undefined : (line) => io.print(line),
  });
  if (options.json) io.print(JSON.stringify({ jurisdiction: TARGET_JURISDICTION, metrics: run.metrics, network: { ...run.network, pending: [...new Set(run.network.pending)].length }, restored: run.restored, restoreFailures: run.restoreFailures, written: run.written }, null, 2));
  else for (const line of baselineOnlySummary(run, { write: options.write })) io.print(line);
  return run.restoreFailures.length === 0 ? 0 : 1;
}
