/**
 * CLI des juris-SH-Adapters (Aufruf über scripts/import-juris-sh.ts).
 *
 * Dry-run ist überall Standard: Ohne `--write` schreibt kein Befehl. Befehle, deren Fachlogik nicht
 * ausführbar ist (Bulk, Suchaudit, R2-Sync setzen abrufbaren Normtext voraus), melden das ausdrücklich
 * und enden mit Exit 2 – nie mit stillem Erfolg.
 *
 * Exit-Codes: 0 ok · 1 Fehler oder Abweichung · 2 noch nicht implementiert bzw. systemischer Abbruch.
 */
import { join } from 'node:path';

import { writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';

import { AUDIT_DIR, CACHE_DIR, SOURCE_AREAS, SOURCE_STATE, TARGET_JURISDICTION, type SourceArea } from './common/constants.ts';
import { decideReviewItem, openReviewItems, readReviewQueue, REVIEW_CATEGORIES, REVIEW_ITEM_STATUSES, writeReviewShard, type ReviewDecision, type ReviewItemStatus } from './common/review.ts';
import { buildEventLedger, writeEventLedger, LEDGER_PATH, REPORT_PATH, VWV_INVENTORY_PATH } from './events/build.ts';
import { COVERAGE_PATH, RECONSTRUCTION_QUEUE_PATH } from './common/paths.ts';
import { ENUMERABLE_AREAS } from './enumerate/enumeration.ts';
import { runEnumerate } from './enumerate/run.ts';
import { isPostBaseline } from './events/ledger.ts';
import { ADDRESSABILITY_PATH, runAddressabilityProbe, STRUCTURE_REPORT_PATH } from './probe/addressability.ts';
import { runAudit } from './reports/audit.ts';
import { renderCoverage, renderHistoricalBaseline, renderReadiness, renderReconstructionQueue, renderReviewSummary } from './reports/render.ts';
import { analyzeBaselineOnly, buildCoverage, buildReconstructionQueue, classifyBaseline, evaluateReadiness, readSnapshot } from './reports/status.ts';

/** Befehle in der Reihenfolge, in der sie in der Übersicht erscheinen. */
export const COMMANDS = ['enumerate', 'sample', 'bulk', 'audit', 'coverage', 'review', 'readiness', 'search-audit', 'reconstruction-queue', 'r2-sync', 'events'] as const;
export type Command = (typeof COMMANDS)[number];

/**
 * Befehle, die arbeiten. Alles andere endet mit „noch nicht implementiert“ (Exit 2): `bulk`, `search-audit`
 * und `r2-sync` setzen abrufbaren Normtext voraus, den die dokumentierten Adressformen des Portals nicht
 * liefern (data/audits/juris-sh/STRUCTURE_REPORT.md).
 */
export const IMPLEMENTED_COMMANDS: readonly Command[] = ['enumerate', 'sample', 'audit', 'coverage', 'review', 'readiness', 'reconstruction-queue', 'events'];

/** Berichte unter data/audits/juris-sh/ (Pfade an einer Stelle). */
export const REPORT_PATHS = {
  coverageMarkdown: `${AUDIT_DIR}/COVERAGE.md`,
  historicalBaseline: `${AUDIT_DIR}/HISTORICAL_BASELINE.md`,
  reconstructionQueue: `${AUDIT_DIR}/RECONSTRUCTION_QUEUE.md`,
  reviewSummary: `${AUDIT_DIR}/REVIEW_SUMMARY.md`,
  audit: `${AUDIT_DIR}/audit.json`,
  readinessMarkdown: `${AUDIT_DIR}/READINESS.md`,
  readinessJson: `${AUDIT_DIR}/readiness.json`,
} as const;

export interface CliOptions {
  command: string;
  /** `--help`/`-h` hinter einem Befehl: Hilfe ausgeben, nichts ausführen. */
  help: boolean;
  write: boolean;
  offline: boolean;
  /** Quellen neu abrufen statt aus dem Cache (enumerate: robots.txt und Sitemaps – zweiter, unabhängiger Lauf). */
  refresh: boolean;
  json: boolean;
  resume: boolean;
  area?: SourceArea;
  limit?: number;
  only: string[];
  cacheDir?: string;
  baseline: string;
  /** review --decide <id> --status <s> --reason <text> [--by <name>] [--override <id>] */
  decide?: string;
  status?: string;
  reason?: string;
  by?: string;
  override?: string;
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
      case '--only': options.only.push(...take().split(',').map((entry) => entry.trim()).filter(Boolean)); break;
      case '--cache-dir': options.cacheDir = take(); break;
      case '--baseline': options.baseline = take(); break;
      case '--decide': options.decide = take(); break;
      case '--status': options.status = take(); break;
      case '--reason': options.reason = take(); break;
      case '--by': options.by = take(); break;
      case '--override': options.override = take(); break;
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
  --refresh            Quellen neu abrufen statt aus dem Cache (enumerate: zweiter, unabhängiger Lauf)
  --limit <n>          höchstens n Einträge in diesem Lauf
  --only <a,b,…>       nur diese Einträge (Quellidentität oder Adresse); mehrfach erlaubt
  --area <bereich>     Quellbereich ${SOURCE_AREAS.join(' | ')}
  --json               maschinenlesbare Ausgabe, wo vorhanden
  --resume             vorhandenen Fortschritt fortsetzen
  --cache-dir <pfad>   Cacheverzeichnis (Standard ${CACHE_DIR})
  --baseline <datum>   Stichtag der Quellfassung (Standard ${SIMULATION_BASELINE_DATE})
  --help, -h           diese Hilfe`;

/** Hilfetexte je Befehl. Noch nicht implementierte Befehle sagen, was sie tun werden und woran es hängt. */
export const COMMAND_HELP: Readonly<Record<Command, string>> = {
  enumerate: `enumerate [--write] [--refresh] [--offline]
  Enumeration Landesrecht (Rahmendokumente jlr-NNLSH…) und Verwaltungsvorschriften (VVSH-VVSH…) aus der
  Sitemap des Portals; Quellidentität ist die juris-DOKNR. Belegt zugleich robots.txt (Politik advisory),
  Impressum/Datenschutz und gleicht eine Stichprobe (Discovery-Suchindex, per /perma aufgelöst) ab.
  Fixpunkt: ein zweiter Lauf mit --refresh ruft robots.txt und Sitemaps neu ab und muss fachlich gleich sein.
  Ziele: data/imports/juris-sh/enumeration-{landesrecht,vwv}.json, data/audits/juris-sh/discovery/robots.json,
         data/audits/juris-sh/source-inventory.json, data/audits/juris-sh/SOURCE_INVENTORY.md`,
  sample: `sample [--write] [--offline]
  Probe der dokumentierten Adressformen (/bssh/document/<ID>, …/part/X, …/format/xsl, …/format/xsl/part/X)
  an Probedokumenten je Kennungsfamilie: liefern sie Normtext? Belegt zugleich, woher die Oberfläche den
  Inhalt lädt (ohne diese interne Schnittstelle je aufzurufen). Sperrsignale (403/429/Challenge) halten an.
  Ziele: data/audits/juris-sh/discovery/content-addressability.json, data/audits/juris-sh/STRUCTURE_REPORT.md`,
  bulk: `bulk --area ${SOURCE_AREAS.join('|')} [--write] [--resume] [--limit n] [--only a,b]
  Bulk-Lauf über die Enumeration: je Stammnorm Auflösung, Import, atomarer Checkpoint; Normfehler →
  Review/failed und weiter, systemische Fehler → kontrollierter Abbruch. Laufbericht:
  data/audits/juris-sh/runs/<runId>.json
  Noch nicht implementiert: Die dokumentierten Adressformen liefern keinen Normtext (readiness: inhalt-adressierbar).`,
  audit: `audit [--write] [--json]
  Konsistenzprüfung des Zustands: Enumeration (Invarianten, Fingerabdruck), Quelleninventar, Sitemap- und
  Probebelege gegen den Cache (SHA-256 nachgerechnet), Manifest, Review-Queue, Bestand unter content/norms/nsh.
  Ziele mit --write: data/audits/juris-sh/audit.json, data/audits/juris-sh/REVIEW_SUMMARY.md`,
  coverage: `coverage [--write] [--json]
  Coverage-Report: enumeriert, ausgeschlossen (Familien), archiviert, geparst, Textintegrität, transformiert,
  übernommen, Review, nicht am Stichtag.
  Ziele: data/audits/juris-sh/coverage.json, data/audits/juris-sh/COVERAGE.md`,
  review: `review [--area ${SOURCE_AREAS.join('|')}] [--json] [--limit n]
review --decide <id> --status <s> --reason <text> [--by <name>] [--override <id>] [--write]
  Ohne --decide: offene Review-Fälle des NSH-Bestands (optional je Bereich). Mit --decide: Entscheidung
  zu einem Fall (Status ${REVIEW_ITEM_STATUSES.filter((status) => status !== 'open').join('|')});
  --reason ist Pflicht, --override verweist auf data/imports/juris-sh/overrides.json.
  Gespeichert nur mit --write. Kategorien: ${REVIEW_CATEGORIES.join(', ')}`,
  readiness: `readiness [--write] [--json]
  Maschinelle Bereitschaftsprüfung: erste Zeile READY oder NOT READY (Exit 0/1), danach Prüfungen und
  systemische Blocker. Ziele mit --write: data/audits/juris-sh/readiness.json, data/audits/juris-sh/READINESS.md`,
  'search-audit': `search-audit [--limit n] [--only a,b] [--json] [--write]
  Suchintegrität der projizierten NSH-Normen (Sucheinheiten, Strukturadressen, Treffer je Norm).
  Noch nicht implementiert: setzt einen projizierten Bestand voraus.`,
  'reconstruction-queue': `reconstruction-queue [--write] [--json]
  Stichtagsklassifikation (unchanged/changed-after/enacted-after/undetermined), Analyse der baseline-only-
  Kandidaten des Ereignisregisters und Arbeitsliste der Normen mit Änderungen nach dem Stichtag.
  Ziele: data/imports/juris-sh/reconstruction-queue.json, data/audits/juris-sh/HISTORICAL_BASELINE.md,
         data/audits/juris-sh/RECONSTRUCTION_QUEUE.md`,
  'r2-sync': `r2-sync [--write] [--limit n]
  Überträgt gestagte Rohquellen (Manifeststatus staged) nach R2 (Präfix nsh/juris-sh/2023-12-01/) und markiert
  sie als verified; wiederaufnehmbar, gleicher Inhalt zählt als vorhanden, anderer Inhalt ist ein harter Fehler.
  Noch nicht implementiert: Es gibt keinen Normrohbestand, der gestagt werden könnte.`,
  events: `events [--write] [--offline] [--json] [--limit n]
  Baut das Post-Baseline-Ereignisregister aus den amtlichen Registern und Inhaltsverzeichnissen der
  Verkündungsblätter Schleswig-Holsteins (Aufhebung, Ersetzung, Ablauf, Neufassung, Änderung, Verkündung)
  als Belege für die Stichtagsprüfung; erzeugt keine Normen.
  Quellen: Discovery-Cache .cache/schleswig-holstein/raw (kein Netzabruf; SHA-256 wird geprüft).
  Ziele:  data/imports/juris-sh/events/ledger.json
          data/imports/juris-sh/events/vwv-inventory.json
          data/audits/juris-sh/EVENT_LEDGER.md
  --limit begrenzt die Ereignisse je Quelle (Probelauf), --json gibt die Kennzahlen maschinenlesbar aus.`,
};

export function renderHelp(command?: string): string {
  if (command && (COMMAND_HELP as Record<string, string>)[command]) return `${(COMMAND_HELP as Record<string, string>)[command]}\n\n${COMMON_OPTIONS}`;
  const descriptions: Record<Command, string> = {
    enumerate: 'Enumeration (Sitemap, Fixpunkt, Stichprobenabgleich, Zugriffslage)',
    sample: 'Probe der dokumentierten Adressformen (Inhaltsadressierbarkeit)',
    bulk: 'Bulk-Lauf über die Enumeration (Resume, Budgets, Checkpoints)',
    audit: 'Konsistenzprüfung des Bestands',
    coverage: 'Coverage-Report',
    review: 'Review-Fälle anzeigen und entscheiden',
    readiness: 'READY / NOT READY',
    'search-audit': 'Suchintegrität',
    'reconstruction-queue': 'Stichtagsklassifikation, baseline-only, Rekonstruktionsqueue',
    'r2-sync': 'gestagte Rohquellen nach R2',
    events: 'Verkündungsereignisse als Belege',
  };
  const overview = [
    `juris-SH-Importer (${SOURCE_STATE} → Simulationsland ${TARGET_JURISDICTION.toUpperCase()}). Dry-run ist überall Standard.`,
    'Aufruf: node scripts/import-juris-sh.ts <befehl> [optionen]   (npm run import:juris-sh:<befehl> -- [optionen])',
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
  io.error(`Befehl „${command}“ ist noch nicht implementiert (juris-SH-Adapter).`);
  io.error(`Was fehlt: siehe „${command} --help“. Enumeration, Probe und Berichte arbeiten; Normtext liefern die dokumentierten Adressformen des Portals nicht (npm run import:juris-sh:readiness).`);
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

/**
 * events: Ereignisregister aus dem Discovery-Cache bauen. Liest nur lokal, schreibt nur mit --write.
 * Ein Fehler in einer Quelle (fehlende Datei, abweichender SHA-256) ist systemisch und bricht ab –
 * ein unvollständiges Register wäre schlimmer als keines.
 */
async function runEventsCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const result = await buildEventLedger({
    root,
    ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}),
    ...(options.offline ? { offline: true } : {}),
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
  });
  const statistics = result.statistics;
  if (options.json) {
    io.print(JSON.stringify({
      jurisdiction: TARGET_JURISDICTION,
      baselineDate: result.ledger.baselineDate,
      evaluationDate: result.ledger.evaluationDate,
      eventsTotal: statistics.eventsTotal,
      eventsByType: statistics.eventsByType,
      postBaselineByType: statistics.postBaselineByType,
      evidence: statistics.evidence,
      processing: statistics.processing,
      unresolvedLines: statistics.unresolvedLines,
      readability: statistics.readability,
      baselineOnly: statistics.baselineOnly.length,
      futureTermination: statistics.futureTermination.length,
      defused: statistics.defused.length,
      vwvEntries: statistics.vwvEntries,
      december: { issues: statistics.december.issues.length, publications: statistics.december.publications.length, crossYear: statistics.december.crossYear.length, collectiveContinuation: statistics.december.collectiveContinuation },
    }, null, 2));
  } else {
    const postBaseline = Object.values(statistics.postBaselineByType).reduce((sum, value) => sum + value, 0);
    io.print(`Ereignisregister ${TARGET_JURISDICTION.toUpperCase()} (Stichtag ${result.ledger.baselineDate}, Auswertung ${result.ledger.evaluationDate})`);
    io.print(`  Quellen: ${result.ledger.sources.length} · Ereignisse: ${statistics.eventsTotal} · davon ab ${result.ledger.baselineDate} + 1 Tag: ${postBaseline}`);
    io.print(`  Typen: ${Object.entries(statistics.eventsByType).filter(([, value]) => value > 0).map(([key, value]) => `${key} ${value}`).join(' · ')}`);
    io.print(`  Evidenz: ${Object.entries(statistics.evidence).map(([key, value]) => `${key} ${value}`).join(' · ')}`);
    io.print(`  baseline-only-Kandidaten: ${statistics.baselineOnly.length} · künftige Befristungen: ${statistics.futureTermination.length} · entschärfte Außerkrafttreten: ${statistics.defused.length}`);
    io.print(`  nicht zuordenbare Zeilen: ${statistics.unresolvedLines} · Verwaltungsvorschriften mit Gl.Nr.: ${statistics.vwvEntries}`);
    io.print(`  Dezember 2023: ${statistics.december.issues.length} Ausgaben · ${statistics.december.publications.length} Verkündungen · ${statistics.december.crossYear.length} über den Jahrgangswechsel · ${statistics.december.collectiveContinuation.reduce((sum, entry) => sum + entry.affectedVwv, 0)} VwV-Vermerke kollektiver Weitergeltung`);
    const unreadable = statistics.readability.reduce((sum, entry) => sum + entry.unreadable, 0);
    const pages = statistics.readability.reduce((sum, entry) => sum + entry.pages, 0);
    io.print(`  Lesbarkeit: ${pages} Seiten · unlesbar ${unreadable} · versatzkorrigiert ${statistics.readability.reduce((sum, entry) => sum + entry.shiftCorrected, 0)}`);
  }
  if (!options.write) {
    io.print(`Dry-run: nichts geschrieben. Mit --write nach ${LEDGER_PATH}, ${VWV_INVENTORY_PATH} und ${REPORT_PATH}.`);
    return 0;
  }
  const written = await writeEventLedger(root, result);
  io.print(written.length === 0 ? 'Unverändert: keine Datei neu geschrieben.' : `Geschrieben: ${written.join(', ')}`);
  return 0;
}

function networkLine(network: { requests: number; cacheHits: number; bytes: number; retries?: number; blocked?: number }): string {
  return `Netzabrufe ${network.requests} (${network.bytes} Bytes), Cache-Treffer ${network.cacheHits}${network.retries !== undefined ? `, Wiederholungen ${network.retries}` : ''}${network.blocked !== undefined ? `, Sperrantworten ${network.blocked}` : ''}`;
}

async function runEnumerateCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const result = await runEnumerate({ root, write: options.write, offline: options.offline, refresh: options.refresh, ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}), log: options.json ? undefined : io.print });
  if (options.json) io.print(JSON.stringify({ areas: result.inventory.areas, byFamily: result.inventory.sitemap.byFamily, crosscheck: { samples: result.inventory.crosscheck.samples, inSitemap: result.inventory.crosscheck.inSitemap, notInSitemap: result.inventory.crosscheck.notInSitemap, unresolved: result.inventory.crosscheck.unresolved }, network: result.network, invariantProblems: result.invariantProblems }, null, 2));
  else io.print(networkLine(result.network));
  if (result.invariantProblems.length > 0) {
    io.error(`Invarianten verletzt – nichts geschrieben: ${result.invariantProblems.slice(0, 10).join('; ')}`);
    return 1;
  }
  if (!options.write) io.print('Dry-run: nichts geschrieben. Mit --write speichern.');
  else io.print(result.written.length === 0 ? 'Unverändert: keine Datei neu geschrieben.' : `Geschrieben: ${result.written.join(', ')}`);
  return 0;
}

async function runSampleCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const result = await runAddressabilityProbe({ root, write: options.write, offline: options.offline, ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}), log: options.json ? undefined : io.print });
  if (options.json) io.print(JSON.stringify({ conclusion: result.report.conclusion, summary: result.report.summary, evidence: result.report.spa.evidence, tdmReservation: result.report.tdmReservation, network: result.network }, null, 2));
  else {
    io.print(`Ergebnis: ${result.report.conclusion}`);
    for (const reason of result.report.reasoning) io.print(`  ${reason}`);
    io.print(networkLine(result.network));
  }
  if (!options.write) io.print(`Dry-run: nichts geschrieben. Mit --write nach ${ADDRESSABILITY_PATH} und ${STRUCTURE_REPORT_PATH}.`);
  else io.print(result.written.length === 0 ? 'Unverändert: keine Datei neu geschrieben.' : `Geschrieben: ${result.written.join(', ')}`);
  return result.report.conclusion === 'blocked' ? 2 : 0;
}

async function writeOutputs(root: string, outputs: ReadonlyArray<readonly [string, string]>, io: Io): Promise<void> {
  const written: string[] = [];
  for (const [path, text] of outputs) if (await writeFileAtomic(join(root, path), text)) written.push(path);
  io.print(written.length === 0 ? 'Unverändert: keine Datei neu geschrieben.' : `Geschrieben: ${written.join(', ')}`);
}

async function runCoverageCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const coverage = buildCoverage(await readSnapshot(root));
  if (options.json) io.print(JSON.stringify(coverage, null, 2));
  else {
    io.print(`Coverage ${TARGET_JURISDICTION.toUpperCase()}: enumeriert Landesrecht ${coverage.enumerated.landesrecht} (Einheiten ${coverage.enumerated.units}) · VwV ${coverage.enumerated.vwv}`);
    io.print(`  archiviert ${coverage.rawArchived} · geparst ${coverage.parsed} · transformiert ${coverage.transformed} · übernommen ${coverage.imported} · Review ${coverage.review} · nicht am Stichtag ${coverage.notAtBaseline}`);
    if (coverage.blocker) io.print(`  Blocker: ${coverage.blocker}`);
  }
  if (!options.write) return 0;
  await writeOutputs(root, [[COVERAGE_PATH, `${JSON.stringify(coverage, null, 2)}\n`], [REPORT_PATHS.coverageMarkdown, renderCoverage(coverage)]], io);
  return 0;
}

async function runReconstructionQueueCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const snapshot = await readSnapshot(root);
  const classification = classifyBaseline(snapshot);
  const baselineOnly = analyzeBaselineOnly(snapshot);
  const queue = buildReconstructionQueue(snapshot, options.baseline);
  const ledger = { events: snapshot.ledger?.events.length ?? 0, postBaseline: (snapshot.ledger?.events ?? []).filter((event) => isPostBaseline(event)).length };
  if (options.json) io.print(JSON.stringify({ classification: classification.byArea, baselineOnly: { ...baselineOnly, entries: undefined }, queue: queue.totals }, null, 2));
  else {
    for (const area of ENUMERABLE_AREAS) io.print(`Stichtag ${area}: ${Object.entries(classification.byArea[area]).map(([key, value]) => `${key} ${value}`).join(' · ')}`);
    io.print(`baseline-only: ${baselineOnly.candidates} Kandidaten · Dubletten ${baselineOnly.duplicates} · durch Register bestätigt ${baselineOnly.confirmedByRegister} · nur angekündigt ${baselineOnly.announcedOnly} · abgeglichen ${baselineOnly.matchedAgainstInventory} · wiederhergestellt ${baselineOnly.restored}`);
    io.print(`Rekonstruktionsqueue: ${queue.totals.items} Vorschriften (${Object.entries(queue.totals.byOrgan).map(([organ, count]) => `${organ} ${count}`).join(', ')}) mit ${queue.totals.events} Ereignissen nach dem Stichtag (DOKNR offen)`);
  }
  if (!options.write) return 0;
  await writeOutputs(root, [
    [RECONSTRUCTION_QUEUE_PATH, `${JSON.stringify(queue, null, 2)}\n`],
    [REPORT_PATHS.historicalBaseline, renderHistoricalBaseline(classification, baselineOnly, ledger)],
    [REPORT_PATHS.reconstructionQueue, renderReconstructionQueue(queue)],
  ], io);
  return 0;
}

async function runAuditCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const snapshot = await readSnapshot(root);
  const audit = await runAudit(root, snapshot, options.cacheDir);
  if (options.json) io.print(JSON.stringify(audit, null, 2));
  else {
    io.print(`Audit ${TARGET_JURISDICTION.toUpperCase()}: ${audit.ok ? 'konsistent' : 'ABWEICHUNGEN'}`);
    for (const check of audit.checks) io.print(`  ${check.ok ? 'ok ' : 'ABW'} ${check.id}: ${check.detail}`);
    io.print(`  Review-Fälle ${audit.review.total} (offen ${audit.review.open}) · Manifesteinträge ${audit.manifestEntries}`);
  }
  if (options.write) await writeOutputs(root, [[REPORT_PATHS.audit, `${JSON.stringify(audit, null, 2)}\n`], [REPORT_PATHS.reviewSummary, renderReviewSummary(audit)]], io);
  return audit.ok ? 0 : 1;
}

async function runReadinessCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const result = evaluateReadiness(await readSnapshot(root));
  if (options.json) io.print(JSON.stringify(result, null, 2));
  else {
    io.print(result.ready ? 'READY' : 'NOT READY');
    for (const check of result.checks) io.print(`  ${check.status === 'pass' ? 'pass' : check.blocker ? 'FAIL!' : 'fail'} ${check.id}: ${check.detail}`);
    if (result.blockers.length > 0) io.print(`Systemische Blocker: ${result.blockers.length}`);
  }
  if (options.write) await writeOutputs(root, [[REPORT_PATHS.readinessJson, `${JSON.stringify(result, null, 2)}\n`], [REPORT_PATHS.readinessMarkdown, renderReadiness(result)]], io);
  return result.ready ? 0 : 1;
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
  if (command === 'events') return runEventsCommand(options, root, io);
  if (command === 'enumerate') return runEnumerateCommand(options, root, io);
  if (command === 'sample') return runSampleCommand(options, root, io);
  if (command === 'coverage') return runCoverageCommand(options, root, io);
  if (command === 'reconstruction-queue') return runReconstructionQueueCommand(options, root, io);
  if (command === 'audit') return runAuditCommand(options, root, io);
  if (command === 'readiness') return runReadinessCommand(options, root, io);
  return notImplemented(command, io);
}
