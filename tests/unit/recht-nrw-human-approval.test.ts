/**
 * Human Approval der Legacy-Ausnahmen (`common/human-approval.ts`, Schema in `common/legacy-exceptions.ts`):
 * Freigabestatus (pending/approved/rejected/superseded, unbekannt = Fehler), deterministischer Freigabereport
 * (alle Ausnahmen, keine Dublette, Gruppen, Empfehlungsregeln), Approval-CLI (genau ein Fall, Begründung Pflicht,
 * kein automatischer Nutzername, Verlauf, keine Contentänderung), Statusbefehl (Exit 0/2/1) und Readiness-Semantik
 * „READY WITH PENDING HUMAN APPROVAL“ bzw. Freeze-Regel `--require-approval`.
 */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { parseCliArguments } from '@landesrecht/importer-recht-nrw/cli.ts';
import {
  applyApprovalDecision,
  assessException,
  buildHumanApprovalReport,
  collectApprovalCases,
  HUMAN_APPROVAL_JSON_PATH,
  HUMAN_APPROVAL_MARKDOWN_PATH,
  renderHumanApprovalMarkdown,
  runApprovalCommand,
  runApprovalReportCommand,
  runApprovalStatusCommand,
  summarizeApprovalStatus,
  type ApprovalCaseInput,
} from '@landesrecht/importer-recht-nrw/common/human-approval.ts';
import { LEGACY_EXCEPTIONS_PATH, LEGACY_EXCEPTIONS_SCHEMA, matchLegacyException, readLegacyExceptions, validateLegacyException, validateLegacyExceptionRegistry, type LegacyException, type LegacyExceptionRegistry } from '@landesrecht/importer-recht-nrw/common/legacy-exceptions.ts';
import type { ManifestEntry, ValidityEvidence } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { legacyApprovalCheck } from '@landesrecht/importer-recht-nrw/common/readiness.ts';
import { currentParserVersion, currentTransformerVersion } from '@landesrecht/importer-recht-nrw/common/staleness.ts';

const NOW = '2026-09-17T12:00:00.000Z';
const BASELINE = '2023-12-01';
const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

function legacyException(overrides: Partial<LegacyException> = {}): LegacyException {
  const text = sha('text');
  const base: LegacyException = {
    id: 'legacy-100',
    sourceIdentity: 'term:100',
    sourceArea: 'lrgv',
    targetSlug: 'vorschrift-100-west',
    disposition: 'deliver-legacy',
    source: { url: 'https://recht.nrw.de/lrgv/gesetz/01012020-vorschrift-100', sha256: 'a'.repeat(64) },
    legacy: { parserVersion: 'recht-nrw-parser/1.1.0', transformerVersion: currentTransformerVersion(), importStatus: 'imported-with-warnings' },
    current: { parserVersion: currentParserVersion('lrgv'), findings: ['structure-unnumbered-section'] },
    textIntegrity: { method: 'sichtbarer Text', legacySha256: text, currentSha256: text, legacyChars: 100, currentChars: 100, identical: true },
    structuralDefect: 'Sektion 3 ohne Nummernfeld',
    reason: 'Text identisch',
    preparedAt: '2026-09-17',
    preparedBy: 'automated-review',
    approvalStatus: 'pending-human-review',
    legacyAssessment: { unclassifiedSections: [3], expectedLabels: ['§ 3'], impact: 'structure-only', resolution: 'override-proposed' },
  };
  return { ...base, ...overrides };
}

function depublishException(overrides: Partial<LegacyException> = {}): LegacyException {
  const { legacyAssessment, ...base } = legacyException({ id: 'legacy-200', sourceIdentity: 'term:200', sourceArea: 'lrmb', targetSlug: 'vorschrift-200-west', disposition: 'depublish', legacy: { parserVersion: 'recht-nrw-lrmb-parser/1.2.0', transformerVersion: currentTransformerVersion(), importStatus: 'imported-with-warnings' }, current: { parserVersion: currentParserVersion('lrmb'), findings: ['validity-expired-before-baseline'] }, structuralDefect: 'Keine strukturelle Abweichung', ...overrides });
  void legacyAssessment;
  return base;
}

function manifestFor(exception: LegacyException, overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  const url = exception.source.url;
  return {
    sourceSystem: 'recht-nrw', sourceArea: exception.sourceArea, sourceDocumentType: 'gesetz', sourceIdentity: exception.sourceIdentity, sourceTitle: `Vorschrift ${exception.sourceIdentity}`, sourceType: 'gesetz', sourceUrl: url, stemUrl: `https://recht.nrw.de/taxonomy/term/${exception.sourceIdentity.slice(5)}`,
    sourceVersion: { url, validFrom: '2020-01-01', validTo: null }, selectedVersionUrl: url, sourceValidFrom: '2020-01-01', sourceValidTo: null, baselineStatus: 'active-at-baseline', validityEvidence: [], retrievedAt: NOW,
    sha256: exception.source.sha256, contentType: 'text/html', contentFormat: 'native', parserVersion: exception.legacy.parserVersion, transformerVersion: exception.legacy.transformerVersion, targetJurisdiction: 'west', targetSlug: exception.targetSlug, baselineDate: BASELINE,
    importStatus: exception.legacy.importStatus, reviewStatus: 'open', reconstructionStatus: 'direct', reconstructionSources: [], reconstructionSteps: [], importedAt: NOW,
    rawDocuments: [], versionsConsidered: [], overrides: [], findings: [], integrity: { fetchParse: true, sourceCanonical: true }, transformation: { changes: 0, unresolved: 0 },
    ...overrides,
  };
}

const expiry = (date: string, strength: ValidityEvidence['strength'] = 'strong'): ValidityEvidence => ({ kind: 'text-expiry-clause', supports: 'contradiction', strength, statement: `tritt am ${date} außer Kraft`, date, excerpt: `tritt am ${date} außer Kraft`, sourceUrl: 'https://recht.nrw.de/lrmb/x', sha256: 'a'.repeat(64) });
const validTo = (date: string): ValidityEvidence => ({ kind: 'text-expiry-clause', supports: 'valid-to', strength: 'strong', statement: `gilt bis ${date}`, date });
const successor = (date: string): ValidityEvidence => ({ kind: 'successor-repeal', supports: 'contradiction', strength: 'contradictory', statement: 'aufgehoben', date, citation: 'MBl. NRW. S. 1', sourceUrl: 'https://recht.nrw.de/lrmb/nachfolger', sha256: 'b'.repeat(64), successor: { predecessorIdentity: 'x', successorTitle: 'Nachfolger', successorIdentity: 'term:900', statementKind: 'expired', effectiveDate: date, effectiveDerivation: 'Formel', citation: 'MBl. NRW. S. 1', matched: ['date', 'gazette-page'], sourceUrl: 'https://recht.nrw.de/lrmb/nachfolger', sha256: 'b'.repeat(64), evidenceStrength: 'strong' } });
const signal: ValidityEvidence = { kind: 'search-index-signal', supports: 'active-at-baseline', strength: 'insufficient', statement: 'Suchindex' };

function caseOf(exception: LegacyException, evidence: ValidityEvidence[] = [], extra: Partial<ApprovalCaseInput> = {}): ApprovalCaseInput {
  return { exception, manifest: manifestFor(exception, { validityEvidence: evidence }), evidencePass: undefined, reviewItems: [], contentPresent: exception.disposition === 'deliver-legacy', ...extra };
}

async function writeRoot(entries: LegacyException[], options: { content?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'human-approval-'));
  const registry: LegacyExceptionRegistry = { schemaVersion: LEGACY_EXCEPTIONS_SCHEMA, entries };
  await mkdir(join(root, 'data', 'imports', 'recht-nrw'), { recursive: true });
  await writeFile(join(root, LEGACY_EXCEPTIONS_PATH), `${JSON.stringify(registry, null, 2)}\n`);
  if (options.content) {
    for (const entry of entries) {
      await mkdir(join(root, 'content', 'norms', 'west', entry.targetSlug), { recursive: true });
      await writeFile(join(root, 'content', 'norms', 'west', entry.targetSlug, 'meta.json'), JSON.stringify({ slug: entry.targetSlug }));
    }
  }
  return root;
}

const io = () => {
  const lines: string[] = [];
  const errors: string[] = [];
  return { lines, errors, io: { print: (line: string) => lines.push(line), error: (line: string) => errors.push(line) } };
};

describe('Human Approval: Freigabestatus im Schema der Legacy-Ausnahmen', () => {
  it('akzeptiert pending, approved (mit decision) und rejected; superseded ohne decision', () => {
    expect(() => validateLegacyException(legacyException())).not.toThrow();
    expect(() => validateLegacyException(legacyException({ approvalStatus: 'approved', decision: { status: 'approved', decidedAt: NOW, reason: 'geprüft' } }))).not.toThrow();
    expect(() => validateLegacyException(legacyException({ approvalStatus: 'rejected', decision: { status: 'rejected', decidedAt: NOW, reason: 'nicht tragbar', approvedBy: 'Redaktion' } }))).not.toThrow();
    expect(() => validateLegacyException(legacyException({ approvalStatus: 'superseded' }))).not.toThrow();
  });

  it('lehnt unbekannte Status, fehlende oder widersprüchliche Entscheidungen und Personennamen als preparedBy ab', () => {
    expect(() => validateLegacyException(legacyException({ approvalStatus: 'freigegeben' as LegacyException['approvalStatus'] }))).toThrow(/approvalStatus erwartet pending-human-review\|approved\|rejected\|superseded/u);
    expect(() => validateLegacyException(legacyException({ approvalStatus: 'approved' }))).toThrow(/verlangt decision/u);
    expect(() => validateLegacyException(legacyException({ approvalStatus: 'approved', decision: { status: 'rejected', decidedAt: NOW, reason: 'x' } }))).toThrow(/widerspricht approvalStatus/u);
    expect(() => validateLegacyException(legacyException({ decision: { status: 'approved', decidedAt: NOW, reason: 'x' } }))).toThrow(/decision nur bei approved\/rejected/u);
    expect(() => validateLegacyException(legacyException({ preparedBy: 'Max Mustermann' as 'automated-review' }))).toThrow(/preparedBy muss "automated-review" sein/u);
    expect(() => validateLegacyException(legacyException({ approvalHistory: [{ from: 'pending-human-review', to: 'approved', at: NOW, reason: 'x' }] }))).toThrow(/letzter approvalHistory-Schritt/u);
    expect(() => validateLegacyException({ ...depublishException(), legacyAssessment: { unclassifiedSections: [1], expectedLabels: [], impact: 'structure-only', resolution: 'override-proposed' } })).toThrow(/legacyAssessment nur bei deliver-legacy/u);
    expect(() => validateLegacyException({ ...legacyException(), legacyAssessment: undefined } as LegacyException)).toThrow(/deliver-legacy verlangt legacyAssessment/u);
  });

  it('rejected/superseded: Ausnahme greift im Regressionsschutz nicht mehr (fail-closed)', () => {
    const previous = { parserVersion: 'recht-nrw-parser/1.1.0', transformerVersion: currentTransformerVersion(), importStatus: 'imported-with-warnings' as const, targetSlug: 'vorschrift-100-west' };
    expect(matchLegacyException(legacyException(), { sourceSha256: 'a'.repeat(64), previous, currentErrorCodes: ['structure-unnumbered-section'] }).applies).toBe(true);
    const rejected = legacyException({ approvalStatus: 'rejected', decision: { status: 'rejected', decidedAt: NOW, reason: 'nein' } });
    expect(matchLegacyException(rejected, { sourceSha256: 'a'.repeat(64), previous, currentErrorCodes: ['structure-unnumbered-section'] })).toEqual({ applies: false, mismatches: ['Freigabestatus rejected – Ausnahme greift nicht'] });
  });
});

describe('Human Approval: Empfehlungsregeln und Risikoklassen', () => {
  it('Depublikation: eigene Außerkrafttretensformel vor dem Stichtag → DEPUBLIKATION BEIBEHALTEN (low)', () => {
    expect(assessException(depublishException(), [signal, expiry('2019-12-31')], BASELINE)).toEqual({ group: 'depublish-strong', recommendation: 'DEPUBLIKATION BEIBEHALTEN', riskClass: 'low' });
  });

  it('Depublikation: starker Nachfolgebeleg, nur Portalintervall widerspricht → DEPUBLIKATION BEIBEHALTEN (medium)', () => {
    expect(assessException(depublishException(), [signal, successor('2020-12-11')], BASELINE)).toEqual({ group: 'depublish-contradictory', recommendation: 'DEPUBLIKATION BEIBEHALTEN', riskClass: 'medium' });
  });

  it('Depublikation: Geltung laut eigenem Text über den Stichtag, widersprochene oder mehrdeutige Formel → menschliche Entscheidung (high)', () => {
    const human = { group: 'human-decision', recommendation: 'MENSCHLICHE ENTSCHEIDUNG ERFORDERLICH', riskClass: 'high' };
    expect(assessException(depublishException(), [validTo('2023-12-31'), successor('2023-07-28')], BASELINE)).toEqual(human);
    expect(assessException(depublishException(), [expiry('2019-12-31', 'contradictory')], BASELINE)).toEqual(human);
    expect(assessException(depublishException(), [signal], BASELINE)).toEqual(human);
    expect(assessException(depublishException(), [expiry('2024-06-30')], BASELINE)).toEqual(human);
  });

  it('Deliver-Legacy: Text identisch und nur Struktur → BEIBEHALTEN (low bei einer Sektion mit Override, sonst medium); Rechtsinhalt möglich → high', () => {
    expect(assessException(legacyException(), [], BASELINE)).toEqual({ group: 'deliver-legacy', recommendation: 'DELIVER-LEGACY BEIBEHALTEN', riskClass: 'low' });
    expect(assessException(legacyException({ legacyAssessment: { unclassifiedSections: [15, 16], expectedLabels: ['Articolo I', 'Articolo II'], impact: 'structure-only', resolution: 'editorial-decision' } }), [], BASELINE).riskClass).toBe('medium');
    expect(assessException(legacyException({ legacyAssessment: { unclassifiedSections: [3], expectedLabels: ['§ 3'], impact: 'possible-legal-content', resolution: 'editorial-decision' } }), [], BASELINE)).toEqual({ group: 'human-decision', recommendation: 'MENSCHLICHE ENTSCHEIDUNG ERFORDERLICH', riskClass: 'high' });
    expect(assessException(legacyException({ current: { parserVersion: currentParserVersion('lrgv'), findings: ['structure-unnumbered-section', 'integrity-parse-textLength'] } }), [], BASELINE).riskClass).toBe('high');
  });
});

describe('Human Approval: Freigabereport', () => {
  it('ordnet Gruppen (strong → contradictory → Legacy → menschlich), zählt Typen und Status und lehnt Dubletten ab', () => {
    const cases = [
      caseOf(legacyException(), []),
      caseOf(depublishException({ id: 'legacy-201', sourceIdentity: 'term:201' }), [validTo('2023-12-31'), successor('2023-07-28')]),
      caseOf(depublishException({ id: 'legacy-202', sourceIdentity: 'term:202' }), [successor('2020-12-11')]),
      caseOf(depublishException({ id: 'legacy-203', sourceIdentity: 'term:203', approvalStatus: 'approved', decision: { status: 'approved', decidedAt: NOW, reason: 'bestätigt' } }), [expiry('2019-12-31')]),
    ];
    const report = buildHumanApprovalReport(cases, { now: NOW, baselineDate: BASELINE });
    expect(report.items.map((item) => [item.order, item.sourceIdentity, item.group])).toEqual([[1, 'term:203', 'depublish-strong'], [2, 'term:202', 'depublish-contradictory'], [3, 'term:100', 'deliver-legacy'], [4, 'term:201', 'human-decision']]);
    expect(report.summary).toMatchObject({ total: 4, deliverLegacy: 1, depublish: 3, pending: 3, approved: 1, rejected: 0, byRisk: { low: 2, medium: 1, high: 1 } });
    expect(report.items[2]!.legacyQuestions).toMatchObject({ textComplete: true, hashIdentical: true, impact: 'structure-only', deliverable: true });
    expect(report.items[0]!.depublishQuestions).toMatchObject({ beforeBaseline: true, compelling: true, relevantDate: '2019-12-31' });
    expect(report.items[3]!.depublishQuestions?.compelling).toBe(false);
    expect(report.items[0]!.publicStatus.state).toBe('depublished');
    expect(report.items[2]!.publicStatus.state).toBe('published');
    expect(() => buildHumanApprovalReport([caseOf(legacyException()), caseOf(legacyException({ id: 'legacy-anders' }))], { now: NOW })).toThrow(/doppelte Ausnahme/u);
    const markdown = renderHumanApprovalMarkdown(report);
    expect(markdown).toContain('West Reference Baseline · Stichtag 2023-12-01 · 4 Ausnahmen · 1 Deliver-Legacy · 3 Depublikation/Regression');
    expect(markdown).toContain('| Nutzerentscheidung |');
    expect(markdown).toContain('`MENSCHLICHE ENTSCHEIDUNG ERFORDERLICH`');
    expect(markdown).toContain('- Status: FREIGEGEBEN');
    expect(markdown).toContain('- Begründung Nutzer: bestätigt');
  });

  it('Repository: alle 21 Ausnahmen ohne Dublette, 5 deliver-legacy / 16 depublish, deterministisch bei festem Zeitpunkt', async () => {
    const root = resolveRepositoryRoot();
    const registry = await readLegacyExceptions(root);
    const cases = await collectApprovalCases(root, registry);
    const first = buildHumanApprovalReport(cases, { now: NOW });
    const second = buildHumanApprovalReport(await collectApprovalCases(root, registry), { now: NOW });
    expect(first.summary.total).toBe(21);
    expect(first.summary.deliverLegacy).toBe(5);
    expect(first.summary.depublish).toBe(16);
    expect(new Set(first.items.map((item) => item.sourceIdentity)).size).toBe(21);
    expect(first.items.map((item) => item.order)).toEqual(Array.from({ length: 21 }, (_, index) => index + 1));
    expect(first.items.every((item) => item.title && item.evidence.length > 0 && item.parserVersionPrevious !== item.parserVersionCurrent)).toBe(true);
    const groups = first.items.map((item) => item.group);
    expect([...groups].sort((left, right) => groups.indexOf(left) - groups.indexOf(right))).toEqual(groups);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(renderHumanApprovalMarkdown(first)).toBe(renderHumanApprovalMarkdown(second));
    const later = buildHumanApprovalReport(cases, { now: '2026-09-18T00:00:00.000Z' });
    expect(JSON.stringify({ ...later, generatedAt: NOW })).toBe(JSON.stringify(first));
  });
});

describe('Human Approval: Approval-CLI und Statusbefehl', () => {
  let root: string;
  const entries = [legacyException(), depublishException()];

  beforeAll(async () => {
    root = await writeRoot(entries, { content: true });
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('applyApprovalDecision ändert genau einen Fall, verlangt Begründung, setzt keinen automatischen Namen und schreibt den Verlauf', () => {
    const registry: LegacyExceptionRegistry = { schemaVersion: LEGACY_EXCEPTIONS_SCHEMA, entries };
    const result = applyApprovalDecision(registry, { sourceIdentity: 'term:100', decision: 'approve', reason: 'Struktur geprüft', now: NOW });
    expect(result.before).toBe('pending-human-review');
    expect(result.after).toBe('approved');
    expect(result.exception.decision).toEqual({ status: 'approved', decidedAt: NOW, reason: 'Struktur geprüft' });
    expect(result.exception.decision?.approvedBy).toBeUndefined();
    expect(result.exception.approvalHistory).toEqual([{ from: 'pending-human-review', to: 'approved', at: NOW, reason: 'Struktur geprüft' }]);
    expect(result.registry.entries[1]).toEqual(entries[1]);
    expect(registry.entries[0]!.approvalStatus).toBe('pending-human-review');
    const named = applyApprovalDecision(result.registry, { sourceIdentity: 'term:100', decision: 'reject', reason: 'doch nicht', approvedBy: 'Redaktion West', now: '2026-09-18T00:00:00.000Z' });
    expect(named.exception.decision).toEqual({ status: 'rejected', decidedAt: '2026-09-18T00:00:00.000Z', reason: 'doch nicht', approvedBy: 'Redaktion West' });
    expect(named.exception.approvalHistory).toHaveLength(2);
    expect(named.exception.approvalHistory?.[1]).toMatchObject({ from: 'approved', to: 'rejected', by: 'Redaktion West' });
    expect(() => applyApprovalDecision(registry, { sourceIdentity: 'term:100', decision: 'approve', reason: '  ', now: NOW })).toThrow(/Begründung/u);
    expect(() => applyApprovalDecision(registry, { sourceIdentity: 'term:999', decision: 'approve', reason: 'x', now: NOW })).toThrow(/keine Legacy-Ausnahme/u);
    expect(() => applyApprovalDecision(registry, { sourceIdentity: 'term:100', decision: 'approve', reason: 'x', approvedBy: ' ', now: NOW })).toThrow(/--approved-by/u);
    expect(() => validateLegacyExceptionRegistry(named.registry)).not.toThrow();
  });

  it('CLI: Dry-run ändert nichts, --write speichert genau einen Fall, Content bleibt byteidentisch; Status meldet Exit 2 → 0', async () => {
    const contentFile = join(root, 'content', 'norms', 'west', 'vorschrift-100-west', 'meta.json');
    const contentBefore = await readFile(contentFile);
    const before = await readFile(join(root, LEGACY_EXCEPTIONS_PATH), 'utf8');
    const status = io();
    expect(await runApprovalStatusCommand(parseCliArguments(['approval-status']), root, status.io)).toBe(2);
    expect(status.lines).toEqual(['West Human Approval · 2 exceptions · 0 approved · 2 pending · 0 rejected']);

    const dry = io();
    expect(await runApprovalCommand(parseCliArguments(['approval', '--term', 'term:100', '--decision', 'approve', '--reason', 'geprüft']), root, dry.io, NOW)).toBe(0);
    expect(dry.lines.join('\n')).toContain('pending-human-review → approved (ohne Namensangabe)');
    expect(await readFile(join(root, LEGACY_EXCEPTIONS_PATH), 'utf8')).toBe(before);

    await expect(runApprovalCommand(parseCliArguments(['approval', '--term', 'term:100', '--decision', 'approve', '--write']), root, io().io, NOW)).rejects.toThrow(/--reason/u);
    await expect(runApprovalCommand(parseCliArguments(['approval', '--term', 'term:100', '--decision', 'maybe', '--reason', 'x']), root, io().io, NOW)).rejects.toThrow(/approve\|reject/u);

    const write = io();
    expect(await runApprovalCommand(parseCliArguments(['approval', '--term', 'term:100', '--decision', 'approve', '--reason', 'geprüft', '--write']), root, write.io, NOW)).toBe(0);
    const stored = await readLegacyExceptions(root);
    expect(stored.entries.map((entry) => entry.approvalStatus)).toEqual(['approved', 'pending-human-review']);
    expect(stored.entries[0]!.decision?.approvedBy).toBeUndefined();
    expect(stored.entries[0]!.approvalHistory).toEqual([{ from: 'pending-human-review', to: 'approved', at: NOW, reason: 'geprüft' }]);
    expect(stored.entries[1]!.approvalHistory).toBeUndefined();
    expect(Buffer.compare(await readFile(contentFile), contentBefore)).toBe(0);

    const reject = io();
    expect(await runApprovalCommand(parseCliArguments(['approval', '--term', 'term:200', '--decision', 'reject', '--reason', 'Beleg unklar', '--approved-by', 'Redaktion', '--write']), root, reject.io, NOW)).toBe(0);
    expect(reject.lines.join('\n')).toContain('keine automatische Folgeaktion');
    const afterReject = await runApprovalStatusCommand(parseCliArguments(['approval-status']), root, (status.lines.length = 0, status.io));
    expect(afterReject).toBe(2);
    expect(status.lines).toEqual(['West Human Approval · 2 exceptions · 1 approved · 0 pending · 1 rejected']);
    expect((await readLegacyExceptions(root)).entries[1]!.decision).toEqual({ status: 'rejected', decidedAt: NOW, reason: 'Beleg unklar', approvedBy: 'Redaktion' });
    expect(Buffer.compare(await readFile(contentFile), contentBefore)).toBe(0);

    expect(await runApprovalCommand(parseCliArguments(['approval', '--term', 'term:200', '--decision', 'approve', '--reason', 'nun belegt', '--write']), root, io().io, NOW)).toBe(0);
    status.lines.length = 0;
    expect(await runApprovalStatusCommand(parseCliArguments(['approval-status']), root, status.io)).toBe(0);
    expect(status.lines).toEqual(['West Human Approval · 2 exceptions · 2 approved · 0 pending · 0 rejected']);
    expect(summarizeApprovalStatus(await readLegacyExceptions(root)).exitCode).toBe(0);
  });

  it('Statusbefehl: ungültige oder unbekannte Status → Exit 1', async () => {
    const broken = await writeRoot([legacyException({ approvalStatus: 'freigegeben' as LegacyException['approvalStatus'] })]);
    try {
      const result = io();
      expect(await runApprovalStatusCommand(parseCliArguments(['approval-status']), broken, result.io)).toBe(1);
      expect(result.errors[0]).toMatch(/inkonsistent/u);
    } finally {
      await rm(broken, { recursive: true, force: true });
    }
  });

  it('Report-Befehl: Dry-run schreibt nichts, --write erzeugt Markdown und JSON', async () => {
    const reportRoot = await writeRoot([legacyException(), depublishException()], { content: true });
    try {
      const dry = io();
      expect(await runApprovalReportCommand(parseCliArguments(['approval-report']), reportRoot, dry.io, NOW)).toBe(0);
      expect(dry.lines.at(-1)).toMatch(/^Dry-run/u);
      await expect(readFile(join(reportRoot, HUMAN_APPROVAL_JSON_PATH))).rejects.toThrow();
      expect(await runApprovalReportCommand(parseCliArguments(['approval-report', '--write']), reportRoot, io().io, NOW)).toBe(0);
      const json = JSON.parse(await readFile(join(reportRoot, HUMAN_APPROVAL_JSON_PATH), 'utf8')) as { summary: { total: number }; generatedAt: string };
      expect(json.summary.total).toBe(2);
      expect(json.generatedAt).toBe(NOW);
      expect(await readFile(join(reportRoot, HUMAN_APPROVAL_MARKDOWN_PATH), 'utf8')).toContain('# Human Approval – West Reference Baseline');
    } finally {
      await rm(reportRoot, { recursive: true, force: true });
    }
  });
});

describe('Readiness: Human Approval der Legacy-Ausnahmen', () => {
  it('pending → READY mit Hinweis „READY WITH PENDING HUMAN APPROVAL“; --require-approval → Blocker; rejected → Blocker; approved → ok', () => {
    const pending = { entries: [legacyException(), depublishException()] };
    const notice = legacyApprovalCheck(pending);
    expect(notice.status).toBe('notice');
    expect(notice.pending).toBe(2);
    expect(notice.detail).toMatch(/^READY WITH PENDING HUMAN APPROVAL: 2 Ausnahmen: 0 approved, 2 pending, 0 rejected/u);
    const freeze = legacyApprovalCheck(pending, { requireApproval: true });
    expect(freeze.status).toBe('fail');
    expect(freeze.detail).toMatch(/^Freeze-Regel \(--require-approval\)/u);
    const rejected = legacyApprovalCheck({ entries: [legacyException({ approvalStatus: 'rejected', decision: { status: 'rejected', decidedAt: NOW, reason: 'nein' } })] });
    expect(rejected.status).toBe('fail');
    expect(rejected.detail).toContain('nicht freigegeben (rejected): term:100');
    const approved = legacyApprovalCheck({ entries: [legacyException({ approvalStatus: 'approved', decision: { status: 'approved', decidedAt: NOW, reason: 'ja' } }), depublishException({ approvalStatus: 'superseded' })] });
    expect(approved).toMatchObject({ status: 'pass', pending: 0 });
    expect(legacyApprovalCheck({ entries: [legacyException({ approvalStatus: 'x' as LegacyException['approvalStatus'] })] }).status).toBe('fail');
    expect(legacyApprovalCheck(undefined).status).toBe('pass');
  });
});
