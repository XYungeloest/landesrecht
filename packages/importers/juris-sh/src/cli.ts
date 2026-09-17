/**
 * CLI des juris-SH-Adapters (Aufruf über scripts/import-juris-sh.ts).
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
import { decideReviewItem, openReviewItems, readReviewQueue, REVIEW_CATEGORIES, REVIEW_ITEM_STATUSES, writeReviewShard, type ReviewDecision, type ReviewItemStatus } from './common/review.ts';
import { buildEventLedger, writeEventLedger, LEDGER_PATH, REPORT_PATH, VWV_INVENTORY_PATH } from './events/build.ts';

/** Befehle in der Reihenfolge, in der sie in der Übersicht erscheinen. */
export const COMMANDS = ['enumerate', 'sample', 'bulk', 'audit', 'coverage', 'review', 'readiness', 'search-audit', 'reconstruction-queue', 'r2-sync', 'events'] as const;
export type Command = (typeof COMMANDS)[number];

/**
 * Befehle, die bereits arbeiten. Alles andere endet mit „noch nicht implementiert“ (Exit 2); die
 * Liste wächst mit den Strängen Enumeration, Parser und Transformation.
 */
export const IMPLEMENTED_COMMANDS: readonly Command[] = ['review', 'events'];

export interface CliOptions {
  command: string;
  /** `--help`/`-h` hinter einem Befehl: Hilfe ausgeben, nichts ausführen. */
  help: boolean;
  write: boolean;
  offline: boolean;
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
  const options: CliOptions = { command, help: false, write: false, offline: false, json: false, resume: false, only: [], baseline: SIMULATION_BASELINE_DATE };
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
  enumerate: `enumerate --area ${SOURCE_AREAS.join('|')} [--write]
  Vollständige Enumeration eines Quellbereichs mit Abgleich zweier unabhängiger Quellen; Fortschritt
  vorhandener Einträge bleibt erhalten. Ziel: data/imports/juris-sh/enumeration-<bereich>.json
  Noch nicht implementiert: Die Enumerationsquellen stehen erst nach der Quellen-Discovery fest.`,
  sample: `sample [--area ${SOURCE_AREAS.join('|')}] [--write]
  Verarbeitet den Validierungskorpus eines Bereichs und vergleicht mit den hinterlegten Erwartungen.
  Noch nicht implementiert: Parser und Transformation entstehen nach der Quellen-Discovery.`,
  bulk: `bulk --area ${SOURCE_AREAS.join('|')} [--write] [--resume] [--limit n] [--only a,b]
  Bulk-Lauf über die Enumeration: je Stammnorm Auflösung, Import, atomarer Checkpoint; Normfehler →
  Review/failed und weiter, systemische Fehler → kontrollierter Abbruch. Laufbericht:
  data/audits/juris-sh/runs/<runId>.json
  Noch nicht implementiert: braucht Enumeration, Parser und Transformation.`,
  audit: `audit [--json]
  Konsistenzprüfung des Bestands: Manifest, Rohquellen-Hashes, kanonische Dateien, Review-Status,
  Slug-Registry, Enumeration und Coverage.
  Noch nicht implementiert: prüft erst, wenn ein Bestand entsteht.`,
  coverage: `coverage [--write] [--json]
  Coverage-Report aus Manifest, Review-Queue, Enumeration, Slug-Registry und Inhalten.
  Ziel: data/audits/juris-sh/coverage.json
  Noch nicht implementiert.`,
  review: `review [--area ${SOURCE_AREAS.join('|')}] [--json] [--limit n]
review --decide <id> --status <s> --reason <text> [--by <name>] [--override <id>] [--write]
  Ohne --decide: offene Review-Fälle des NSH-Bestands (optional je Bereich). Mit --decide: Entscheidung
  zu einem Fall (Status ${REVIEW_ITEM_STATUSES.filter((status) => status !== 'open').join('|')});
  --reason ist Pflicht, --override verweist auf data/imports/juris-sh/overrides.json.
  Gespeichert nur mit --write. Kategorien: ${REVIEW_CATEGORIES.join(', ')}`,
  readiness: `readiness [--json]
  Maschinelle Bereitschaftsprüfung: erste Zeile READY oder NOT READY (Exit 0/1), danach Prüfungen und
  Blocker.
  Noch nicht implementiert: setzt Enumeration, Bestand und Audits voraus.`,
  'search-audit': `search-audit [--limit n] [--only a,b] [--json] [--write]
  Suchintegrität der projizierten NSH-Normen (Sucheinheiten, Strukturadressen, Treffer je Norm).
  Noch nicht implementiert: setzt einen projizierten Bestand voraus.`,
  'reconstruction-queue': `reconstruction-queue [--write] [--json]
  Arbeitsliste der Fälle, deren Stichtagsstand rekonstruiert werden muss (baselineRecoveryMethod
  reverse-post-baseline-event oder reconstructed-from-publications), mit Priorisierungshilfe.
  Ziel: data/imports/juris-sh/reconstruction-queue.json
  Noch nicht implementiert.`,
  'r2-sync': `r2-sync [--write] [--limit n]
  Überträgt gestagte Rohquellen (Manifeststatus staged) nach R2 und markiert sie als verified;
  wiederaufnehmbar, gleicher Inhalt zählt als vorhanden, anderer Inhalt ist ein harter Fehler.
  Noch nicht implementiert: erst sinnvoll, wenn der Bulk-Lauf Rohquellen staged.`,
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
    enumerate: 'Enumeration eines Quellbereichs',
    sample: 'Validierungskorpus je Bereich',
    bulk: 'Bulk-Lauf über die Enumeration (Resume, Budgets, Checkpoints)',
    audit: 'Konsistenzprüfung des Bestands',
    coverage: 'Coverage-Report',
    review: 'Review-Fälle anzeigen und entscheiden',
    readiness: 'READY / NOT READY',
    'search-audit': 'Suchintegrität',
    'reconstruction-queue': 'Rekonstruktionsqueue',
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
  io.error(`Befehl „${command}“ ist noch nicht implementiert (juris-SH-Adapter, Ausbaustufe Zustand & Gerüst).`);
  io.error(`Was fehlt: siehe „${command} --help“. Der Zustand (Manifest, Review, Evidenz, Pfade) steht bereits; Enumeration, Parser und Transformation folgen nach der Quellen-Discovery.`);
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
  return notImplemented(command, io);
}
