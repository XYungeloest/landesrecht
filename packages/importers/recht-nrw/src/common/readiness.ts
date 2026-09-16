/**
 * Bulk-Readiness-Prüfung (`npm run import:recht-nrw:readiness`): maschinenlesbares READY / NOT READY mit
 * konkreten Blockern. Geprüft werden ausschließlich systemische Voraussetzungen (docs/RECHT_NRW_BULK_READINESS.md);
 * offene Review-Fälle einzelner Normen sind nie ein Blocker.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { loadAllNorms } from '@landesrecht/legal-core/lib/loader.ts';

import { parseLrmbDocument } from '../lrmb/parser.ts';
import { parseDecreeFromTitle } from '../lrmb/text-metadata.ts';
import { readJsonFile } from './atomic.ts';
import { collectCoverageInput, computeCoverage, coverageComparable, COVERAGE_PATH, type CoverageReport } from './coverage.ts';
import { checkDocumentIdentityAndBody } from './document-sanity.ts';
import { readEnumeration } from './enumeration.ts';
import { isImportedStatus, readManifest, SOURCE_AREAS } from './manifest.ts';
import { missingR2Environment } from './r2-transport.ts';
import { readReviewQueue } from './review-queue.ts';
import { isSyntheticFixture } from './search-audit.ts';
import { parseVersionPage } from './version-page.ts';

export interface ReadinessCheck {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'notice';
  detail: string;
}

export interface ReadinessResult {
  ready: boolean;
  checks: ReadinessCheck[];
  blockers: string[];
  notices: string[];
}

export const D1_SCALE_REPORT_PATH = join('data', 'audits', 'recht-nrw', 'd1-scale.json');
export const JUNIT_PATH = join('test-results', 'junit.xml');
export const READINESS_DOC = join('docs', 'RECHT_NRW_BULK_READINESS.md');

/** Testnamen (Vitest-Beschreibungen), die für ein GO vorhanden und grün sein müssen. */
export const REQUIRED_TEST_MARKERS = ['Enumeration', 'Resume', 'Budget', 'SIGINT', 'Cache', 'R2', 'Dokumentidentität', 'Landeshundegesetz', 'Undatierte', 'PDF', 'Coverage', 'Skalierung', 'Suchintegrität'] as const;

export const REQUIRED_COMPONENTS = [
  'packages/importers/recht-nrw/src/common/enumeration.ts',
  'packages/importers/recht-nrw/src/common/bulk-runner.ts',
  'packages/importers/recht-nrw/src/common/archive.ts',
  'packages/importers/recht-nrw/src/common/r2-transport.ts',
  'packages/importers/recht-nrw/src/common/document-sanity.ts',
  'packages/importers/recht-nrw/src/common/pdf.ts',
  'packages/importers/recht-nrw/src/common/transcription.ts',
  'packages/importers/recht-nrw/src/common/coverage.ts',
  'packages/importers/recht-nrw/src/common/search-audit.ts',
  'packages/importers/recht-nrw/src/lrmb/reconstruction-queue.ts',
  'packages/runtime/src/incremental.ts',
  'packages/runtime/src/sql-batches.ts',
  'scripts/d1-apply-batches.ts',
] as const;

export const REQUIRED_SCRIPTS = ['import:recht-nrw:enumerate', 'import:recht-nrw:bulk', 'import:recht-nrw:coverage', 'import:recht-nrw:readiness', 'import:recht-nrw:r2-sync', 'import:recht-nrw:audit', 'import:recht-nrw:search-audit', 'd1:plan', 'd1:scale-test'] as const;

async function newestMtime(directory: string, ignore: RegExp): Promise<number> {
  let newest = 0;
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return newest;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (ignore.test(path)) continue;
    if (entry.isDirectory()) newest = Math.max(newest, await newestMtime(path, ignore));
    else if (entry.isFile() && /\.(?:ts|mjs|json|astro)$/u.test(entry.name)) newest = Math.max(newest, (await stat(path)).mtimeMs);
  }
  return newest;
}

export async function evaluateReadiness(root: string, options: { env?: Record<string, string | undefined> } = {}): Promise<ReadinessResult> {
  const env = options.env ?? process.env;
  const checks: ReadinessCheck[] = [];
  const add = (id: string, label: string, ok: boolean, detail: string, notice = false): void => {
    checks.push({ id, label, status: ok ? 'pass' : notice ? 'notice' : 'fail', detail });
  };

  // 1–2. Enumeration und Abgleich je Bereich.
  for (const area of SOURCE_AREAS) {
    try {
      const file = await readEnumeration(root, area);
      if (!file) add(`enumeration-${area}`, `Enumeration ${area.toUpperCase()}`, false, `data/imports/recht-nrw/enumeration-${area}.json fehlt (npm run import:recht-nrw:enumerate -- --area ${area} --write)`);
      else {
        const cross = file.crosscheck;
        add(`enumeration-${area}`, `Enumeration ${area.toUpperCase()} mit Abgleich`, cross.ok && cross.sitemapUrls > 0 && cross.searchHits > 0 && file.items.length > 0, `${file.items.length} Einträge; Sitemap ${cross.sitemapUrls} Adressen / ${cross.sitemapStems} Stämme; Suchindex ${cross.searchHits}; Schnittmenge ${cross.intersection}, nur Sitemap ${cross.onlySitemap}, nur Suchindex ${cross.onlySearch}${cross.ok ? '' : `; Abweichungen: ${cross.problems.join('; ')}`}`);
      }
    } catch (error) {
      add(`enumeration-${area}`, `Enumeration ${area.toUpperCase()}`, false, (error as Error).message);
    }
  }

  // 3. Komponenten und Befehle.
  const missingComponents: string[] = [];
  for (const component of REQUIRED_COMPONENTS) {
    try {
      await stat(join(root, component));
    } catch {
      missingComponents.push(component);
    }
  }
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
  const missingScripts = REQUIRED_SCRIPTS.filter((script) => !packageJson.scripts?.[script]);
  add('components', 'Bulk-Komponenten und Befehle vorhanden (keine offenen Architekturblocker)', missingComponents.length === 0 && missingScripts.length === 0, missingComponents.length || missingScripts.length ? `fehlend: ${[...missingComponents, ...missingScripts].join(', ')}` : `${REQUIRED_COMPONENTS.length} Module, ${REQUIRED_SCRIPTS.length} Befehle`);

  // 4. Tests grün, aktuell und mit den geforderten Prüfungen.
  try {
    const junitFile = join(root, JUNIT_PATH);
    const junit = await readFile(junitFile, 'utf8');
    const suite = /<testsuites\b[^>]*\btests="(\d+)"[^>]*\bfailures="(\d+)"[^>]*\berrors="(\d+)"/u.exec(junit);
    const tests = Number(suite?.[1] ?? 0);
    const failures = Number(suite?.[2] ?? 1);
    const errors = Number(suite?.[3] ?? 1);
    const skipped = (junit.match(/<skipped\b/gu) ?? []).length;
    const names = [...junit.matchAll(/<testcase\b[^>]*\bname="([^"]*)"/gu)].map((match) => match[1]!).join('\n');
    const missingMarkers = REQUIRED_TEST_MARKERS.filter((marker) => !names.includes(marker));
    const junitTime = (await stat(junitFile)).mtimeMs;
    const newestSource = Math.max(await newestMtime(join(root, 'packages'), /node_modules|\.astro|dist/u), await newestMtime(join(root, 'tests'), /node_modules/u), await newestMtime(join(root, 'scripts'), /node_modules/u));
    const fresh = junitTime >= newestSource;
    add('tests', 'Alle Tests grün und aktuell', tests > 0 && failures === 0 && errors === 0 && skipped === 0 && missingMarkers.length === 0 && fresh, `${tests} Tests, ${failures} Fehlschläge, ${errors} Fehler, ${skipped} übersprungen${missingMarkers.length ? `; fehlende Prüfungen: ${missingMarkers.join(', ')}` : ''}${fresh ? '' : '; Testergebnisse älter als der Quellcode (npm run test)'}`);
  } catch {
    add('tests', 'Alle Tests grün und aktuell', false, `${JUNIT_PATH} fehlt (npm run test)`);
  }

  // 5. R2 vorbereitet (Bindings, Umgebungsvariablen dokumentiert); Zugangsdaten nur Hinweis.
  try {
    const wrangler = await readFile(join(root, 'apps', 'web', 'wrangler.jsonc'), 'utf8');
    const example = await readFile(join(root, '.env.example'), 'utf8');
    const ok = /"bucket_name":\s*"landesrecht-quellen"/u.test(wrangler) && /"bucket_name":\s*"landesrecht-quellen-staging"/u.test(wrangler) && ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].every((name) => example.includes(name));
    add('r2-config', 'R2-Konfiguration vorbereitet (Bucket-Bindings, Variablen dokumentiert, Staging außerhalb von Git)', ok, ok ? 'landesrecht-quellen (+ staging); Variablen in .env.example' : 'Bucket-Binding oder dokumentierte Variablen fehlen');
    const missing = missingR2Environment(env);
    add('r2-credentials', 'R2-Zugangsdaten in dieser Umgebung', missing.length === 0, missing.length === 0 ? 'vorhanden (sofortiger Upload möglich)' : `nicht gesetzt (${missing.join(', ')}); Bulk stagt nach .cache/recht-nrw-r2-staging, Upload später mit import:recht-nrw:r2-sync`, true);
  } catch (error) {
    add('r2-config', 'R2-Konfiguration vorbereitet', false, (error as Error).message);
  }

  // 6. Review-Queue persistent und lesbar.
  try {
    const queue = await readReviewQueue(root);
    let legacy = false;
    try {
      await stat(join(root, 'data', 'imports', 'recht-nrw', 'review-queue.json'));
      legacy = true;
    } catch {
      legacy = false;
    }
    add('review-queue', 'Review-Queue persistent (Schema 2, je Quelle)', !legacy, `${queue.items.length} Fälle${legacy ? '; frühere Einzeldatei review-queue.json noch nicht migriert' : ''}`);
  } catch (error) {
    add('review-queue', 'Review-Queue persistent', false, (error as Error).message);
  }

  // 7. Coverage berechenbar und gespeicherter Report aktuell.
  try {
    const input = await collectCoverageInput(root, new Date().toISOString());
    const computed = computeCoverage(input);
    const stored = await readJsonFile<CoverageReport>(join(root, COVERAGE_PATH));
    const current = stored?.schemaVersion === computed.schemaVersion && coverageComparable(stored) === coverageComparable(computed);
    add('coverage', 'Coverage-Report aktuell', current, current ? `LRGV-Basis ${computed.lrgv.base.count}, LRMB-Basis ${computed.lrmb.base.count}` : 'coverage.json fehlt oder ist veraltet (npm run import:recht-nrw:coverage -- --write)');
    const ohneManifest = (computed.lrgv.crosscheck?.enumerationWithoutManifest ?? 0) + (computed.lrmb.crosscheck?.enumerationWithoutManifest ?? 0);
    const verarbeitetOhneManifest = ohneManifest > 0 ? `; ${ohneManifest} verarbeitete Einträge ohne Manifest (Abbruch vor der Stammnorm-Kennung, normlokal)` : '';
    add('consistency', 'Manifest ↔ Inhalte ↔ Slug-Registry konsistent', computed.consistency.ok, computed.consistency.ok ? `keine Abweichung${verarbeitetOhneManifest}` : `ohne Inhalt ${computed.consistency.importedWithoutContent.length}, ohne Manifest ${computed.consistency.contentWithoutManifest.join(', ') || 0}, Slug-Abweichungen ${computed.consistency.slugRegistryMismatches.length}${verarbeitetOhneManifest}`);
    const stale = computed.lrgv.stale.count + computed.lrmb.stale.count;
    add('stale', 'Keine veralteten Importe', stale === 0, stale === 0 ? 'alle Einträge mit aktuellem Parser/Transformer' : `${stale} Einträge mit älterem Parser/Transformer (Regeneration im Bulk-Lauf: --regenerate-stale)`, true);
  } catch (error) {
    add('coverage', 'Coverage-Report aktuell', false, (error as Error).message);
  }

  // 8. D1-Skalierungstest.
  const scale = await readJsonFile<{ ok?: boolean; norms?: number; full?: { durationMs?: number }; incremental?: { equivalent?: boolean } }>(join(root, D1_SCALE_REPORT_PATH)).catch(() => undefined);
  add('d1-scale', 'D1-Skalierungstest grün', Boolean(scale?.ok && (scale.norms ?? 0) >= 2_000 && scale.incremental?.equivalent), scale ? `${scale.norms} synthetische Normen, Vollprojektion ${Math.round((scale.full?.durationMs ?? 0) / 1000)} s, inkrementell äquivalent ${scale.incremental?.equivalent}` : `${D1_SCALE_REPORT_PATH} fehlt (npm run d1:scale-test -- --write)`);

  // 9–10. Dokumentidentität und VV-LHundG-Regression auf der archivierten Originalquelle.
  try {
    const manifest = await readManifest(root);
    const lhundg = manifest.entries.find((entry) => entry.sourceIdentity === 'term:23528');
    const page = lhundg?.rawDocuments.find((raw) => raw.role === 'version-page' && raw.localSource);
    if (!lhundg || !page?.localSource) throw new Error('VV LHundG (term:23528) nicht im Manifest oder ohne versionierte Quelle');
    const parsedPage = parseVersionPage(await readFile(join(root, page.localSource), 'utf8'), lhundg.selectedVersionUrl);
    const parsed = parseLrmbDocument(parsedPage.content.format === 'native' ? parsedPage.content.bodyHtml : '');
    const titleDecree = parseDecreeFromTitle(parsedPage.title);
    const sanity = checkDocumentIdentityAndBody({ sourceArea: 'lrmb', portalType: 'verwaltungsvorschrift', portalTitle: titleDecree?.title ?? parsedPage.title, documentTitleLines: parsed.head.titleLines, head: parsed.head, ...(titleDecree?.issuedOn ? { titleDecree: { issuedOn: titleDecree.issuedOn } } : {}), baseCitation: 'MBl. NRW. 2003 S. 580', blocks: parsed.blocks, attachments: parsedPage.attachments });
    const materials = checkDocumentIdentityAndBody({ sourceArea: 'lrgv', portalType: 'gesetz', portalTitle: 'Gesetz über die Prüfung', blocks: [{ type: 'heading', text: 'Gesetzentwurf der Landesregierung' }, { type: 'heading', text: 'A. Problem' }, { type: 'paragraphText', text: 'Die Prüfung ist nicht geregelt.' }, { type: 'heading', text: 'B. Lösung' }, { type: 'paragraphText', text: 'Das Gesetz regelt die Prüfung.' }, { type: 'heading', text: 'Begründung' }, { type: 'heading', text: 'Zu § 1' }, { type: 'paragraphText', text: 'Die Vorschrift bestimmt den Zweck.' }] });
    add('document-sanity', 'Document Body Sanity Check grün', materials.status === 'mismatch', `Materialiendokument → ${materials.status}`);
    add('vv-lhundg', 'VV-LHundG-Regression grün', sanity.status === 'consistent' && isImportedStatus(lhundg.importStatus) && lhundg.reconstructionStatus === 'reconstructed', `Dokumentidentität ${sanity.status}; Import ${lhundg.importStatus}, ${lhundg.reconstructionStatus}`);
  } catch (error) {
    add('vv-lhundg', 'VV-LHundG-Regression grün', false, (error as Error).message);
  }

  // 11. Policies dokumentiert.
  try {
    const doc = await readFile(join(root, READINESS_DOC), 'utf8');
    const headings = ['## Undatierte LRMB-Altdatensätze', '## PDF-only-Policy', '## GO/No-Go-Checkliste', '## Befehle für den Bulk-Lauf'];
    const missing = headings.filter((heading) => !doc.includes(heading));
    add('policies', 'Undatierte-LRMB- und PDF-only-Policy dokumentiert', missing.length === 0, missing.length ? `fehlende Abschnitte: ${missing.join(', ')}` : READINESS_DOC);
  } catch {
    add('policies', 'Policies dokumentiert', false, `${READINESS_DOC} fehlt`);
  }

  // 12. Keine synthetischen Fixtures im Produktionsbestand.
  try {
    const fixtures = (await loadAllNorms(root)).filter((norm) => isSyntheticFixture(norm)).map((norm) => `${norm.meta.jurisdiction}:${norm.meta.slug}`);
    add('fixtures', 'Keine synthetischen Fixtures im Produktionsbestand', fixtures.length === 0, fixtures.length ? fixtures.join(', ') : 'content/ enthält nur übernommene Normen');
  } catch (error) {
    add('fixtures', 'Keine synthetischen Fixtures im Produktionsbestand', false, (error as Error).message);
  }

  const blockers = checks.filter((check) => check.status === 'fail').map((check) => `${check.label}: ${check.detail}`);
  const notices = checks.filter((check) => check.status === 'notice').map((check) => `${check.label}: ${check.detail}`);
  return { ready: blockers.length === 0, checks, blockers, notices };
}
