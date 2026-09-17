/**
 * CLI des BAYERN.RECHT-Adapters (Aufruf über scripts/import-bayernrecht.ts).
 *
 * Dry-run ist überall Standard: Ohne `--write` schreibt kein Befehl. Befehle, deren Fachlogik noch nicht
 * existiert (Enumeration, Parser, Transformation entstehen nach der Quellen-Discovery), melden das
 * ausdrücklich und enden mit Exit 2 – nie mit stillem Erfolg.
 *
 * Exit-Codes: 0 ok · 1 Fehler oder Abweichung · 2 noch nicht implementiert bzw. systemischer Abbruch.
 */
import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';

import { CACHE_DIR, SOURCE_AREAS, SOURCE_STATE, TARGET_JURISDICTION, type SourceArea } from './common/constants.ts';
import { assertSourceArea } from './common/paths.ts';
import { enumerateSummary, runEnumerate } from './enumerate/run.ts';
import { corpusSummary, runSample } from './corpus/run.ts';
import { decideReviewItem, openReviewItems, readReviewQueue, REVIEW_CATEGORIES, REVIEW_ITEM_STATUSES, writeReviewShard, type ReviewDecision, type ReviewItemStatus } from './common/review.ts';
import { evaluateReadiness, renderReadiness } from './readiness/evaluate.ts';
import { auditSummary, runAudit } from './audit/audit.ts';
import { collectCoverage, coverageSummary, writeCoverage, COVERAGE_MARKDOWN_PATH, COVERAGE_PATH } from './audit/coverage.ts';

/** Befehle in der Reihenfolge, in der sie in der Übersicht erscheinen. */
export const COMMANDS = ['enumerate', 'sample', 'bulk', 'audit', 'coverage', 'review', 'readiness', 'search-audit', 'reconstruction-queue', 'r2-sync', 'events'] as const;
export type Command = (typeof COMMANDS)[number];

/**
 * Befehle, die bereits arbeiten. Alles andere endet mit „noch nicht implementiert“ (Exit 2); die
 * Liste wächst mit den Strängen Enumeration, Parser und Transformation.
 */
export const IMPLEMENTED_COMMANDS: readonly Command[] = ['enumerate', 'sample', 'review', 'readiness', 'audit', 'coverage'];

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
  --refresh            Cache übergehen und kontrolliert neu abrufen
  --limit <n>          höchstens n Einträge in diesem Lauf
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
  bulk: `bulk --area ${SOURCE_AREAS.join('|')} [--write] [--resume] [--limit n] [--only a,b]
  Bulk-Lauf über die Enumeration: je Stammnorm Auflösung, Import, atomarer Checkpoint; Normfehler →
  Review/failed und weiter, systemische Fehler → kontrollierter Abbruch. Laufbericht:
  data/audits/bayernrecht/runs/<runId>.json
  Noch nicht implementiert: braucht Enumeration, Parser und Transformation.`,
  audit: `audit [--json]
  Konsistenzprüfung des Bestands – liest nur, schreibt nie (auch nicht mit --write). Gegengeprüft
  werden Enumeration ↔ Manifest ↔ Slug-Registry ↔ Beispielkorpus, die Rohquellen unter
  sources/bayernrecht/ (Begleitdatei vorhanden, SHA-256 nachgerechnet), die Review-Fälle gegen das
  Manifest und die Overrides gegen die Einträge, in die sie eingreifen.
  Jede Abweichung wird mit ihrer Kennung benannt; Exit 1, sobald eine bleibt. Was in dieser
  Arbeitskopie nur fehlt (Exportpakete, siehe sources/README.md), ist ein Hinweis, keine Abweichung.`,
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
  'search-audit': `search-audit [--limit n] [--only a,b] [--json] [--write]
  Suchintegrität der projizierten BayWü-Normen (Sucheinheiten, Strukturadressen, Treffer je Norm).
  Noch nicht implementiert: setzt einen projizierten Bestand voraus.`,
  'reconstruction-queue': `reconstruction-queue [--write] [--json]
  Arbeitsliste der Fälle, deren Stichtagsstand rekonstruiert werden muss (baselineRecoveryMethod
  reverse-post-baseline-event oder reconstructed-from-publications), mit Priorisierungshilfe.
  Ziel: data/imports/bayernrecht/reconstruction-queue.json
  Noch nicht implementiert.`,
  'r2-sync': `r2-sync [--write] [--limit n]
  Überträgt gestagte Rohquellen (Manifeststatus staged) nach R2 und markiert sie als verified;
  wiederaufnehmbar, gleicher Inhalt zählt als vorhanden, anderer Inhalt ist ein harter Fehler.
  Noch nicht implementiert: erst sinnvoll, wenn der Bulk-Lauf Rohquellen staged.`,
  events: `events [--write] [--json] [--limit n]
  Verkündungsereignisse des Bereichs „events“ (Ausfertigung, Verkündung, Inkrafttreten, Aufhebung) als
  Belege für die Stichtagsprüfung; erzeugt keine Normen.
  Noch nicht implementiert: braucht die Quellen-Discovery der amtlichen Verkündungsblätter.`,
};

export function renderHelp(command?: string): string {
  if (command && (COMMAND_HELP as Record<string, string>)[command]) return `${(COMMAND_HELP as Record<string, string>)[command]}\n\n${COMMON_OPTIONS}`;
  const descriptions: Record<Command, string> = {
    enumerate: 'Enumeration eines Quellbereichs',
    sample: 'Validierungskorpus je Bereich',
    bulk: 'Bulk-Lauf über die Enumeration (Resume, Budgets, Checkpoints)',
    audit: 'Konsistenzprüfung des Bestands',
    coverage: 'Kennzahlen des Bestands',
    review: 'Review-Fälle anzeigen und entscheiden',
    readiness: 'READY / NOT READY',
    'search-audit': 'Suchintegrität',
    'reconstruction-queue': 'Rekonstruktionsqueue',
    'r2-sync': 'gestagte Rohquellen nach R2',
    events: 'Verkündungsereignisse als Belege',
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
  io.error(`Was fehlt: siehe „${command} --help“. Der Zustand (Manifest, Review, Evidenz, Pfade) steht bereits; Enumeration, Beispielkorpus, Parser, Überleitung, Readiness, Audit und Coverage sind umgesetzt; Bulk, Suchaudit, Rekonstruktionsschlange und R2-Sync folgen.`);
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
  io.print(written.length === 0 ? `Unverändert: keine Datei neu geschrieben (${unchanged.join(', ')}).` : `Geschrieben: ${written.join(', ')}${unchanged.length > 0 ? ` · unverändert: ${unchanged.join(', ')}` : ''}`);
  return 0;
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
  if (command === 'readiness') return runReadinessCommand(options, root, io);
  if (command === 'audit') return runAuditCommand(options, root, io);
  if (command === 'coverage') return runCoverageCommand(options, root, io);
  return notImplemented(command, io);
}
