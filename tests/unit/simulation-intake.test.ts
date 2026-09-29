/**
 * Source-Intake (`sources:intake`, packages/importers/simulation/src/intake/): Inbox `imports/` inventarisieren, gegen die
 * Akquisitionsliste abgleichen, nur sichere Schritte ausführen, Freeze-Evidenz nie importieren, idempotent.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { ACQUISITION_QUEUE_PATH, renderNeededLines, type AcquisitionQueueEntry } from '@landesrecht/importer-simulation/completeness/acquisition.ts';
import { COMPLETENESS_SCHEMA, parseCompletenessFile } from '@landesrecht/importer-simulation/completeness/schema.ts';
import { INTAKE_REPORT_PATH, runIntake, type IntakeReport } from '@landesrecht/importer-simulation/intake/command.ts';
import { runNeeded } from '@landesrecht/importer-simulation/intake/needed.ts';

import { cleanupTempRoots, tempRoot } from '../helpers/bayernrecht-state.ts';

afterAll(cleanupTempRoots);

const FREEZE_WEST = 'a'.repeat(40);
const FREEZE_BAYWUE = 'b'.repeat(40);
const TODAY = '2026-09-30';

const KNOWN = 'Gesetz- und Verordnungsblatt für das Land Westdeutschland\n2026 Nr. 1\nAusgegeben zu Düsseldorf am 10. Januar 2026\n';
const MBL = 'Ministerialblatt für das Land Westdeutschland\n\n2026 Nr. 2\n\nAusgegeben zu Düsseldorf am 15. Juli 2026\n\nRunderlass über die Bereitstellung von Kühlräumen\nvom 28. Juni 2026\n';
const ERDBEBEN = 'Gesetz zur Bereitstellung finanzieller Hilfen für Erdbebenschäden in Bayern-Württemberg\nvom 14. Mai 2026\n\n§ 1\nText\nStuttgart, den 14. Mai 2026\n';
const WEAK = 'Bekanntmachung über die Geschäftsordnung der Behörden\nvom 3. März 2026\n';
const UNKNOWN = 'Verordnung über die Förderung von Streuobstwiesen\nvom 2. Februar 2026\n\n§ 1\nText\n';
const BAYEUG = 'Bayerisches Gesetz über das Erziehungs- und Unterrichtswesen\nvom 31. Mai 2000\n\nArt. 1\nText\n';

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

async function put(root: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

function completeness(jurisdiction: 'west' | 'baywue'): Record<string, unknown> {
  const base = { schemaVersion: COMPLETENESS_SCHEMA, jurisdiction, assessedAt: '2026-09-29', status: 'SIM SOURCES PARTIAL', standaloneActs: { present: 0, evidenceOnly: 0 }, unclearPeriods: [], acts: { secure: 1, review: 1, blocked: 0, draftsWithoutPromulgation: 0 }, notes: [] };
  if (jurisdiction === 'west') {
    return {
      ...base,
      series: [
        { gazette: 'GV. West', knownIssues: ['2026 Nr. 1'], presentIssues: ['2026 Nr. 1'], missingIssues: [] },
        { gazette: 'MBl. WD', knownIssues: ['2026 Nr. 1', '2026 Nr. 2'], presentIssues: ['2026 Nr. 1'], missingIssues: ['2026 Nr. 2'] },
      ],
      sourceGaps: [{ id: 'west-mbl-2026-2', class: 'gazette-issue-missing', title: 'Ministerialblatt für das Land Westdeutschland (MBl. WD) 2026 Nr. 2', existenceEvidence: 'Nummernfolge', expectedDate: '2026-07', expectedPublication: 'MBl. WD 2026 Nr. 2', series: 'MBl. WD', issue: '2026 Nr. 2', blocks: { events: ['w-kuehl'], norms: [] }, acquisition: { priority: 'P2', confidence: 'high', status: 'open' } }],
    };
  }
  return {
    ...base,
    series: [{ gazette: 'GVBl. BayWü', knownIssues: ['2026 Nr. 1'], presentIssues: ['2026 Nr. 1'], missingIssues: [] }],
    sourceGaps: [
      { id: 'baywue-erdbebenhilfeg-2026', class: 'standalone-act-missing', title: 'Gesetz zur Bereitstellung finanzieller Hilfen für Erdbebenschäden in Bayern-Württemberg vom 14.05.2026', existenceEvidence: 'Aufhebungsgesetz', expectedDate: '2026-05-14', blocks: { events: ['b-erdbeben'], norms: ['erdbebenhilfeg-2026-baywue'] }, acquisition: { priority: 'P1', confidence: 'high', status: 'open' } },
      { id: 'baywue-ago-bekanntmachung', class: 'standalone-act-missing', title: 'Bekanntmachung vom 31.05.2026 der AGO-Änderungsverordnung', existenceEvidence: 'Abschaffungsverordnung', expectedDate: '2026-05-31', blocks: { events: [], norms: [] }, acquisition: { priority: 'P2', confidence: 'high', status: 'open' } },
    ],
  };
}

const LEDGERS = {
  west: [
    { id: 'w-gv', type: 'enact', status: 'applied', eventDate: '2026-01-10', publication: { slug: 'gv-west-2026-1', citation: 'GV. West 2026 Nr. 1', sha256: sha(KNOWN) }, evidence: [sha(KNOWN)] },
    { id: 'w-kuehl', type: 'enact', status: 'review', eventDate: '2026-06-28', reasonCode: 'missing-source', publication: null, evidence: [] },
  ],
  baywue: [
    { id: 'b-erdbeben', type: 'repeal', status: 'blocked', eventDate: '2026-06-01', reasonCode: 'missing-source', publication: null, evidence: [], targets: [{ slug: 'erdbebenhilfeg-2026-baywue', title: 'Erdbebenhilfegesetz' }] },
    { id: 'b-eug', type: 'amend', status: 'blocked', eventDate: '2026-08-01', reasonCode: 'missing-baseline-target', publication: null, evidence: [], targets: [{ slug: 'bayeug-baywue', title: 'Bayerisch-Württembergisches Gesetz über das Erziehungs- und Unterrichtswesen' }] },
  ],
};

async function repository(files: Record<string, string>): Promise<string> {
  const root = await tempRoot('landesrecht-intake-');
  await put(root, 'data/simulation/baseline-locks.json', JSON.stringify({ schemaVersion: 'landesrecht-simulation-baseline-locks/2', jurisdictions: { west: { commit: FREEZE_WEST, freeze: true }, baywue: { commit: FREEZE_BAYWUE, freeze: true } }, seeds: [] }));
  for (const jurisdiction of ['west', 'baywue'] as const) {
    await put(root, `data/simulation/${jurisdiction}/completeness.json`, `${JSON.stringify(completeness(jurisdiction), null, 2)}\n`);
    await put(root, `data/simulation/${jurisdiction}/ledger.json`, JSON.stringify({ schemaVersion: 'landesrecht-simulation-ledger/1', jurisdiction, events: LEDGERS[jurisdiction] }));
  }
  await put(root, 'data/simulation/source-inventory.json', JSON.stringify({
    schemaVersion: 'landesrecht-simulation-source-inventory/1', archiveDir: 'imports', scannedAt: '2026-09-29', tools: {}, totals: {}, container: { file: 'imports/Archiv.zip', present: false },
    sources: [{ sha256: sha(KNOWN), paths: ['west/gv-2026-1.txt'], fileName: 'gv-2026-1.txt', jurisdictionCandidate: 'west', mediaType: 'text/plain', byteLength: KNOWN.length, textLayer: 'not-applicable', extraction: { tool: 'utf-8', textPath: 'x', layoutPath: 'x' }, detected: { documentType: 'gazette', dates: [], signals: [], references: [], repealMentions: [] } }],
  }));
  await put(root, 'imports/west/gv-2026-1.txt', KNOWN);
  for (const [path, content] of Object.entries(files)) await put(root, `imports/${path}`, content);
  return root;
}

async function intake(root: string, write: boolean): Promise<{ report: IntakeReport; lines: string[] }> {
  const lines: string[] = [];
  const code = await runIntake({ write, today: TODAY }, root, { print: (line) => lines.push(line), error: (line) => lines.push(`! ${line}`) });
  expect(code).toBe(0);
  return { report: JSON.parse(await readFile(join(root, INTAKE_REPORT_PATH), 'utf8')) as IntakeReport, lines };
}

async function snapshot(root: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else result.set(path, await readFile(join(root, path), 'utf8'));
    }
  };
  for (const directory of ['data', 'docs', 'packages']) {
    try {
      await walk(directory);
    } catch {
      // Verzeichnis fehlt in der Testwurzel.
    }
  }
  return result;
}

const fileResult = (report: IntakeReport, path: string) => report.files.find((file) => file.path === path)!;

describe('sources:intake – Klassifikation', () => {
  it('1. leere Inbox (nur Bekanntes) → No-op; Dry-run und --write ändern keine Daten', async () => {
    const root = await repository({});
    const before = await snapshot(root);
    const { report } = await intake(root, false);
    expect(report.totals).toMatchObject({ 'already-known': 1, matched: 0, 'new-untracked-source': 0 });
    expect(report.pendingActions).toEqual([]);
    await intake(root, true);
    const after = await snapshot(root);
    after.delete(INTAKE_REPORT_PATH);
    expect(after).toEqual(before);
    // Ganz ohne Inbox ebenfalls kein Fehler.
    const empty = await tempRoot('landesrecht-intake-leer-');
    const lines: string[] = [];
    expect(await runIntake({ write: false, today: TODAY }, empty, { print: (line) => lines.push(line), error: (line) => lines.push(line) })).toBe(0);
    expect(lines[0]).toMatch(/0 Datei/u);
  });

  it('2.–7. bekannt, eindeutig, schwach, unbekannt, Bundesportal, Baseline-Evidenz', async () => {
    const root = await repository({
      'west/neu-ministerialblatt.txt': MBL,
      'baywü/weak.txt': WEAK,
      'baywü/streuobst.txt': UNKNOWN,
      'baywü/eug-2000.txt': BAYEUG,
      'bund/schema.sql': 'CREATE TABLE x (id INTEGER);',
      'west/kopie-gv.txt': KNOWN,
    });
    const before = await snapshot(root);
    const { report } = await intake(root, false);
    // 2. bekannte Datei (auch unter neuem Pfad)
    expect(fileResult(report, 'west/gv-2026-1.txt')).toMatchObject({ result: 'already-known', confidence: 'exact', documentType: 'gazette' });
    expect(fileResult(report, 'west/kopie-gv.txt')).toMatchObject({ result: 'already-known', note: 'Inhalt bekannt unter west/gv-2026-1.txt' });
    // 3. eindeutiger Queue-Match: Publikationsidentität + Titel + Monat
    expect(fileResult(report, 'west/neu-ministerialblatt.txt')).toMatchObject({ result: 'matched', confidence: 'high', queueMatch: { gapId: 'west-mbl-2026-2', level: 'strong' }, events: ['w-kuehl'], freezeAffected: false });
    expect(fileResult(report, 'west/neu-ministerialblatt.txt').queueMatch!.signals).toEqual(expect.arrayContaining(['publication', 'title-strong', 'date-month']));
    // 4. schwacher Match: nur möglich, nie automatisch
    expect(fileResult(report, 'baywü/weak.txt')).toMatchObject({ result: 'possible-match', queueMatch: { gapId: 'baywue-ago-bekanntmachung', level: 'weak' } });
    // 5. unbekannte Quelle
    expect(fileResult(report, 'baywü/streuobst.txt')).toMatchObject({ result: 'new-untracked-source', freezeAffected: false });
    expect(fileResult(report, 'baywü/streuobst.txt').queueMatch).toBeUndefined();
    // 6. Bundesportal-Datei ist keine Sim-Quelle
    expect(fileResult(report, 'bund/schema.sql')).toMatchObject({ result: 'irrelevant/non-simulation', jurisdiction: null });
    // 7. Baseline-Evidenz → freeze-review-candidate, kein Import
    const eug = fileResult(report, 'baywü/eug-2000.txt');
    expect(eug).toMatchObject({ result: 'needs-human-review', freezeAffected: true, events: ['b-eug'], norms: ['bayeug-baywue'] });
    expect(report.freezeReviewCandidates).toEqual([expect.objectContaining({ jurisdiction: 'baywue', freezeCommit: FREEZE_BAYWUE, events: ['b-eug'], norms: ['bayeug-baywue'], source: expect.objectContaining({ path: 'baywü/eug-2000.txt', date: '2000-05-31' }) })]);
    expect(eug.freezeReviewCandidate?.currentExclusion).toMatch(/missing-baseline-target/u);
    // Nur der eindeutige Match wird Kandidat; Inventar nicht automatisch, weil andere neue Dateien Review brauchen.
    expect(report.pendingActions.map((action) => action.kind)).toEqual(['candidate-found']);

    await intake(root, true);
    const after = await snapshot(root);
    const west = parseCompletenessFile(JSON.parse(after.get('data/simulation/west/completeness.json')!));
    expect(west.sourceGaps[0]!.acquisition).toMatchObject({ status: 'candidate-found', candidate: { sha256: sha(MBL), path: 'west/neu-ministerialblatt.txt', foundAt: TODAY } });
    const baywue = parseCompletenessFile(JSON.parse(after.get('data/simulation/baywue/completeness.json')!));
    expect(baywue.sourceGaps.map((gap) => gap.acquisition?.status)).toEqual(['open', 'open']);
    // Kein Baseline-Import, kein Inventar, keine Normen.
    expect(after.get('data/simulation/source-inventory.json')).toBe(before.get('data/simulation/source-inventory.json'));
    expect([...after.keys()].some((path) => path.startsWith('content/'))).toBe(false);
  });
});

describe('sources:intake – Lebenszyklus und Idempotenz', () => {
  it('3./8. eindeutiger Match → candidate-found, Inventar; zweiter Lauf byteidentisch; resolved erst nach geschlossener Lücke', async () => {
    const root = await repository({ 'west/mbl-2026-2.txt': MBL, 'bund/style.css': 'body{}' });
    const dry = await intake(root, false);
    expect(dry.report.pendingActions.map((action) => action.kind)).toEqual(['inventory', 'candidate-found']);
    const dryAgain = await intake(root, false);
    expect(dryAgain.report).toEqual(dry.report);

    const first = await intake(root, true);
    expect(first.lines.some((line) => line.includes('open → candidate-found'))).toBe(true);
    const afterFirst = await snapshot(root);
    const inventory = JSON.parse(afterFirst.get('data/simulation/source-inventory.json')!) as { sources: Array<{ sha256: string }> };
    expect(inventory.sources.map((source) => source.sha256)).toContain(sha(MBL));
    expect(fileResult(first.report, 'west/mbl-2026-2.txt')).toMatchObject({ result: 'already-known', queueMatch: { gapId: 'west-mbl-2026-2', status: 'candidate-found', level: 'exact' } });
    expect(first.report.pendingActions).toEqual([]);
    const queue = JSON.parse(afterFirst.get(ACQUISITION_QUEUE_PATH)!) as { totals: Record<string, number>; byStatus: Record<string, number> };
    expect(queue.totals).toMatchObject({ all: 3, P1: 1, P2: 2 });
    expect(queue.byStatus).toEqual({ 'candidate-found': 1, open: 2 });

    // 8. zweiter identischer Lauf: keine Datenänderung, Bericht byteidentisch.
    const second = await intake(root, true);
    expect(await snapshot(root)).toEqual(afterFirst);
    expect(second.report).toEqual(first.report);

    // Nur gefunden ist nicht aufgelöst: erst Verarbeitung (Verkündung, Ledger, Ausgabe vorhanden) schließt die Lücke.
    const completenessPath = join(root, 'data/simulation/west/completeness.json');
    const west = JSON.parse(await readFile(completenessPath, 'utf8'));
    west.series[1] = { ...west.series[1], presentIssues: ['2026 Nr. 1', '2026 Nr. 2'], missingIssues: [] };
    // Die fachliche Verarbeitung schreibt auch den Status fort (keine weitere Lücke offen).
    west.status = 'SIM SOURCES COMPLETE FOR KNOWN INVENTORY';
    await writeFile(completenessPath, `${JSON.stringify(west, null, 2)}\n`);
    await put(root, 'content/publications/west/mbl-wd-2026-2.json', JSON.stringify({ slug: 'mbl-wd-2026-2', sourceReferences: [{ sha256: sha(MBL) }] }));
    const ledger = { schemaVersion: 'landesrecht-simulation-ledger/1', jurisdiction: 'west', events: [LEDGERS.west[0], { ...LEDGERS.west[1], status: 'applied', reasonCode: undefined, publication: { slug: 'mbl-wd-2026-2', citation: 'MBl. WD 2026 Nr. 2', sha256: sha(MBL) }, evidence: [sha(MBL)] }] };
    await put(root, 'data/simulation/west/ledger.json', JSON.stringify(ledger));
    const resolving = await intake(root, false);
    expect(resolving.report.pendingActions).toEqual([expect.objectContaining({ kind: 'resolve', gapId: 'west-mbl-2026-2' })]);
    await intake(root, true);
    const resolved = parseCompletenessFile(JSON.parse(await readFile(completenessPath, 'utf8')));
    expect(resolved.sourceGaps[0]!.acquisition).toMatchObject({ status: 'resolved', resolution: { resolvedBySha256: sha(MBL), resolvedAt: TODAY, sourceInventoryId: sha(MBL), publications: ['mbl-wd-2026-2'], events: ['w-kuehl'] } });
    const settled = await snapshot(root);
    await intake(root, true);
    expect(await snapshot(root)).toEqual(settled);
  });

  it('ohne verarbeitete Quelle bleibt ein Kandidat candidate-found (kein Auto-Resolve)', async () => {
    const root = await repository({ 'baywü/erdbeben.txt': ERDBEBEN });
    const { report } = await intake(root, true);
    expect(fileResult(report, 'baywü/erdbeben.txt')).toMatchObject({ result: 'already-known', queueMatch: { gapId: 'baywue-erdbebenhilfeg-2026', status: 'candidate-found' } });
    const baywue = parseCompletenessFile(JSON.parse(await readFile(join(root, 'data/simulation/baywue/completeness.json'), 'utf8')));
    expect(baywue.sourceGaps[0]!.acquisition?.status).toBe('candidate-found');
    expect(report.pendingActions).toEqual([]);
  });
});

describe('sources:needed', () => {
  it('listet offene und gefundene Einträge je Priorität, filterbar nach Land und Priorität', async () => {
    const entry = (overrides: Partial<AcquisitionQueueEntry>): AcquisitionQueueEntry => ({ id: 'x', jurisdiction: 'west', sourceType: 'gazette-issue-missing', expectedTitle: 'MBl. WD 2026 Nr. 2', expectedDate: null, expectedPublication: null, existenceEvidence: 'Nummernfolge', missing: [], blocks: { events: ['e'], norms: [] }, priority: 'P2', confidence: 'high', status: 'open', ...overrides });
    const entries = [entry({}), entry({ id: 'y', jurisdiction: 'baywue', priority: 'P1', expectedTitle: 'Erdbebenhilfegesetz', sourceType: 'standalone-act-missing' }), entry({ id: 'z', status: 'resolved', expectedTitle: 'Erledigt' })];
    const all = renderNeededLines(entries);
    expect(all[0]).toBe('P1 (1)');
    expect(all.join('\n')).toContain('Erdbebenhilfegesetz');
    expect(all.join('\n')).not.toContain('Erledigt');
    expect(renderNeededLines(entries, { jurisdiction: 'west' }).join('\n')).not.toContain('Erdbebenhilfegesetz');
    expect(renderNeededLines(entries, { priority: 'P3' })).toEqual(['Keine offenen Quellen für diesen Filter.']);
    const root = await tempRoot('landesrecht-needed-');
    await put(root, ACQUISITION_QUEUE_PATH, JSON.stringify({ entries }));
    const lines: string[] = [];
    expect(await runNeeded({ priority: 'P1' }, root, { print: (line) => lines.push(line), error: (line) => lines.push(line) })).toBe(0);
    expect(lines[0]).toBe('P1 (1)');
  });
});
