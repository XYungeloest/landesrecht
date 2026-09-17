#!/usr/bin/env node
/**
 * R2-Konsistenzaudit ohne Neuübertragung: Manifest ↔ Staging ↔ R2-Listing (Existenz, Größe, Etag/MD5) plus
 * deterministische Byte-Stichprobe (SHA-256 nach Download). Nur Lesezugriffe; verwaisten Objekten wird nur ein
 * Status zugewiesen (referenced | unreferenced-historical | unexpected), nichts wird gelöscht.
 *
 *   node scripts/r2-audit.ts [--sample 150] [--seed 2023-12-01] [--transport wrangler-api] [--write]
 *
 * `--write` schreibt data/audits/recht-nrw/r2/R2_AUDIT.json und R2_AUDIT.md. Ergebnis-Exit-Code 1 bei
 * relevanten Abweichungen (fehlende/abweichende Objekte, fehlgeschlagene Stichproben).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { DEFAULT_R2_STAGING_DIR, envelopeKey, R2_SOURCES_BUCKET } from '@landesrecht/importer-recht-nrw/common/archive.ts';
import { readManifest } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { createWranglerApiR2Transport, type R2ListedObject, type R2Transport } from '@landesrecht/importer-recht-nrw/common/r2-transport.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';

function readOption(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
}

const root = resolveRepositoryRoot();
const sampleSize = Number.parseInt(readOption('sample', '150'), 10);
const seed = readOption('seed', '2023-12-01');
const transportName = readOption('transport', 'wrangler-api');
const write = process.argv.includes('--write');
const prefix = 'west/recht-nrw/2023-12-01/';
const stagingDir = join(root, DEFAULT_R2_STAGING_DIR);

const md5 = (bytes: Uint8Array): string => createHash('md5').update(bytes).digest('hex');
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

interface Expected { key: string; sha256: string; size: number; sourceIdentity: string; role: string; archiveStatus: string; envelope: boolean }

function walk(directory: string, out: string[] = []): string[] {
  if (!existsSync(directory)) return out;
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

async function main(): Promise<number> {
  const startedAt = new Date().toISOString();
  const manifest = await readManifest(root);
  const expected = new Map<string, Expected>();
  const termIds = new Set<string>();
  const enumerationUrls = new Set<string>();
  // Auch Enumerationsterme ohne Manifesteintrag (ausgeschlossen, zusammengeführt, Belege) sind bekannte Herkunft:
  // ihre Staging-Dateien sind historisch, nicht unerwartet.
  for (const area of ['lrgv', 'lrmb']) {
    const path = join(root, 'data', 'imports', 'recht-nrw', `enumeration-${area}.json`);
    if (!existsSync(path)) continue;
    const file = JSON.parse(readFileSync(path, 'utf8')) as { items: Array<{ key: string; sourceIdentity?: string; mergedInto?: string; urls?: string[]; entryUrl?: string }> };
    for (const item of file.items) {
      for (const identity of [item.key, item.sourceIdentity, item.mergedInto]) if (identity?.startsWith('term:')) termIds.add(identity.slice(5));
      for (const url of [...(item.urls ?? []), item.entryUrl]) if (url) enumerationUrls.add(url);
    }
  }
  for (const entry of manifest.entries) {
    termIds.add(entry.sourceIdentity.replace(/^term:/u, ''));
    for (const raw of entry.rawDocuments) {
      if (!raw.objectKey) continue;
      expected.set(raw.objectKey, { key: raw.objectKey, sha256: raw.sha256, size: raw.byteLength, sourceIdentity: entry.sourceIdentity, role: raw.role, archiveStatus: raw.archiveStatus ?? '(ohne)', envelope: false });
      expected.set(envelopeKey(raw.objectKey), { key: envelopeKey(raw.objectKey), sha256: '', size: -1, sourceIdentity: entry.sourceIdentity, role: 'envelope', archiveStatus: raw.archiveStatus ?? '(ohne)', envelope: true });
    }
  }

  // Staging: Datei je Schlüssel, MD5/Größe lokal (keine Netzkosten).
  const stagingFiles = new Map<string, { size: number; md5: string; sha256: string }>();
  for (const path of walk(join(stagingDir, prefix))) {
    const key = relative(stagingDir, path).split('\\').join('/');
    const bytes = readFileSync(path);
    stagingFiles.set(key, { size: bytes.byteLength, md5: md5(bytes), sha256: sha256(bytes) });
  }

  const transport: R2Transport = transportName === 'wrangler-api'
    ? createWranglerApiR2Transport({ bucket: process.env.R2_BUCKET ?? R2_SOURCES_BUCKET, cwd: join(root, 'apps', 'web') })
    : (() => { throw new Error(`--transport ${transportName} bietet kein Listing; wrangler-api verwenden`); })();
  const listed = new Map<string, R2ListedObject>((await transport.list!(prefix)).map((object) => [object.key, object]));

  const manifestOnly: string[] = [];
  const stagingOnly: string[] = [];
  const stagingOnlyUnexpected: string[] = [];
  const envelopeDiffers: string[] = [];
  const sizeMismatch: Array<{ key: string; manifest: number; r2: number }> = [];
  const hashMismatch: Array<{ key: string; stagingMd5: string; r2Md5: string }> = [];
  const statusMismatch: Array<{ key: string; archiveStatus: string }> = [];
  for (const item of expected.values()) {
    const object = listed.get(item.key);
    if (!object) {
      manifestOnly.push(item.key);
      continue;
    }
    if (item.archiveStatus !== 'verified' && item.archiveStatus !== 'versioned') statusMismatch.push({ key: item.key, archiveStatus: item.archiveStatus });
    if (!item.envelope && object.size !== item.size) sizeMismatch.push({ key: item.key, manifest: item.size, r2: object.size });
    const staged = stagingFiles.get(item.key);
    // Umschläge: der R2-Umschlag wird beim Sync aus dem Manifest erzeugt (ohne die HTTP-Header des Staging-
    // Umschlags) – Vergleich daher über die Kernfelder, nicht bytegenau.
    if (staged && object.md5 && staged.md5 !== object.md5) {
      if (!item.envelope) hashMismatch.push({ key: item.key, stagingMd5: staged.md5, r2Md5: object.md5 });
      else envelopeDiffers.push(item.key);
    }
  }
  for (const key of stagingFiles.keys()) {
    if (expected.has(key)) continue;
    const term = /^west\/recht-nrw\/2023-12-01\/term-(\d+)\//u.exec(key)?.[1];
    stagingOnly.push(key);
    if (term && termIds.has(term)) continue;
    // Belegseiten (Bekanntmachungen) werden unter der Term-ID der Seite gestagt, die Enumeration ordnet sie
    // einem Nachbarterm zu: bekannt, wenn die Umschlag-URL in der Enumeration vorkommt.
    const envelopePath = join(stagingDir, key.endsWith('.envelope.json') ? key : envelopeKey(key));
    let url: string | undefined;
    try { url = (JSON.parse(readFileSync(envelopePath, 'utf8')) as { url?: string }).url; } catch { url = undefined; }
    if (!(url && enumerationUrls.has(url))) stagingOnlyUnexpected.push(key);
  }
  // Umschläge stichprobenartig inhaltlich prüfen (Kernfelder gegen Manifest), Reihenfolge deterministisch.
  const envelopeSample = [...expected.values()].filter((item) => item.envelope && listed.has(item.key)).map((item) => ({ item, order: createHash('sha256').update(`${seed}:env:${item.key}`).digest('hex') })).sort((left, right) => (left.order < right.order ? -1 : 1)).slice(0, Math.min(25, sampleSize));
  const r2Only: Array<{ key: string; classification: 'unreferenced-historical' | 'unexpected' }> = [];
  for (const key of listed.keys()) {
    if (expected.has(key)) continue;
    const term = /^west\/recht-nrw\/2023-12-01\/term-(\d+)\//u.exec(key)?.[1];
    r2Only.push({ key, classification: term && termIds.has(term) ? 'unreferenced-historical' : 'unexpected' });
  }

  // Deterministische Byte-Stichprobe: Rohobjekte nach sha256(seed + key) sortiert, die ersten N.
  const candidates = [...expected.values()].filter((item) => !item.envelope && listed.has(item.key));
  const ordered = candidates.map((item) => ({ item, order: createHash('sha256').update(`${seed}:${item.key}`).digest('hex') })).sort((left, right) => (left.order < right.order ? -1 : 1)).slice(0, sampleSize);
  const sampleFailures: Array<{ key: string; reason: string }> = [];
  let sampledBytes = 0;
  let checked = 0;
  const queue = [...ordered];
  const workers = Array.from({ length: 8 }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const bytes = await transport.get(next.item.key);
      checked += 1;
      if (!bytes) { sampleFailures.push({ key: next.item.key, reason: 'nicht lesbar' }); continue; }
      sampledBytes += bytes.byteLength;
      if (bytes.byteLength !== next.item.size || sha256(bytes) !== next.item.sha256) sampleFailures.push({ key: next.item.key, reason: `Größe ${bytes.byteLength}/${next.item.size} oder SHA-256 abweichend` });
    }
  });
  await Promise.all(workers);
  const envelopeFailures: Array<{ key: string; reason: string }> = [];
  const rawByKey = new Map<string, Expected>([...expected.values()].filter((item) => !item.envelope).map((item) => [envelopeKey(item.key), item]));
  for (const { item } of envelopeSample) {
    const bytes = await transport.get(item.key);
    if (!bytes) { envelopeFailures.push({ key: item.key, reason: 'nicht lesbar' }); continue; }
    try {
      const envelope = JSON.parse(new TextDecoder().decode(bytes)) as { objectKey?: string; sha256?: string; byteLength?: number; url?: string };
      const raw = rawByKey.get(item.key);
      if (!raw || envelope.objectKey !== raw.key || envelope.sha256 !== raw.sha256 || envelope.byteLength !== raw.size) envelopeFailures.push({ key: item.key, reason: 'Kernfelder weichen vom Manifest ab' });
    } catch {
      envelopeFailures.push({ key: item.key, reason: 'kein gültiges JSON' });
    }
  }

  const report = {
    schemaVersion: 'landesrecht-r2-audit/1',
    startedAt,
    endedAt: new Date().toISOString(),
    bucket: transport.bucket,
    prefix,
    counts: {
      manifestEntries: manifest.entries.length,
      manifestRawObjects: [...expected.values()].filter((item) => !item.envelope).length,
      manifestExpectedObjects: expected.size,
      stagingFiles: stagingFiles.size,
      r2Objects: listed.size,
      r2Bytes: [...listed.values()].reduce((sum, object) => sum + object.size, 0),
    },
    differences: {
      manifestOnly: manifestOnly.length,
      stagingOnly: stagingOnly.length,
      r2Only: r2Only.length,
      r2OnlyUnexpected: r2Only.filter((item) => item.classification === 'unexpected').length,
      stagingOnlyUnexpected: stagingOnlyUnexpected.length,
      sizeMismatch: sizeMismatch.length,
      hashMismatch: hashMismatch.length,
      envelopeBytesDiffer: envelopeDiffers.length,
      archiveStatusNotVerified: statusMismatch.length,
    },
    sample: { seed, requested: sampleSize, checked, bytes: sampledBytes, failures: sampleFailures.length, envelopesChecked: envelopeSample.length, envelopeFailures: envelopeFailures.length },
    details: { manifestOnly: manifestOnly.slice(0, 50), stagingOnly: stagingOnly.slice(0, 50), stagingOnlyUnexpected: stagingOnlyUnexpected.slice(0, 50), r2Only: r2Only.slice(0, 100), sizeMismatch: sizeMismatch.slice(0, 50), hashMismatch: hashMismatch.slice(0, 50), statusMismatch: statusMismatch.slice(0, 50), sampleFailures, envelopeFailures },
  };
  const relevant = manifestOnly.length + sizeMismatch.length + hashMismatch.length + sampleFailures.length + envelopeFailures.length + report.differences.r2OnlyUnexpected + stagingOnlyUnexpected.length + statusMismatch.length;
  const lines = [
    '# R2-Konsistenzaudit',
    '',
    `Bucket \`${report.bucket}\`, Präfix \`${prefix}\`, ${startedAt} – ${report.endedAt}. Nur Lesezugriffe (Listing + ${checked} Byte-Stichproben, Seed \`${seed}\`).`,
    '',
    '| Kennzahl | Wert |',
    '| --- | --- |',
    `| Manifesteinträge | ${report.counts.manifestEntries} |`,
    `| Rohobjekte laut Manifest | ${report.counts.manifestRawObjects} |`,
    `| Erwartete Objekte (Rohobjekte + Umschläge) | ${report.counts.manifestExpectedObjects} |`,
    `| Staging-Dateien | ${report.counts.stagingFiles} |`,
    `| R2-Objekte | ${report.counts.r2Objects} (${(report.counts.r2Bytes / 1024 / 1024).toFixed(1)} MiB) |`,
    `| nur Manifest (fehlt in R2) | ${manifestOnly.length} |`,
    `| nur Staging (ohne Manifest; nie Teil des R2-Solls) | ${stagingOnly.length} (historisch, bekannte Terme ${stagingOnly.length - stagingOnlyUnexpected.length}; unexpected ${stagingOnlyUnexpected.length}) |`,
    `| nur R2 | ${r2Only.length} (davon unexpected ${report.differences.r2OnlyUnexpected}, unreferenced-historical ${r2Only.length - report.differences.r2OnlyUnexpected}) |`,
    `| Größenabweichung Manifest ↔ R2 (Rohobjekte) | ${sizeMismatch.length} |`,
    `| MD5-Abweichung Staging ↔ R2 (Rohobjekte) | ${hashMismatch.length} |`,
    `| Umschläge bytegenau abweichend (R2-Umschlag aus Manifest, ohne HTTP-Header) | ${envelopeDiffers.length} |`,
    `| Archivstatus nicht verified | ${statusMismatch.length} |`,
    `| Byte-Stichprobe Rohobjekte (SHA-256) | ${checked} geprüft, ${sampleFailures.length} Fehler, ${(sampledBytes / 1024 / 1024).toFixed(1)} MiB |`,
    `| Umschlag-Stichprobe (Kernfelder) | ${envelopeSample.length} geprüft, ${envelopeFailures.length} Fehler |`,
    '',
    relevant === 0 ? 'Ergebnis: **0 relevante Abweichungen**.' : `Ergebnis: **${relevant} relevante Abweichungen** (Details in R2_AUDIT.json).`,
    '',
  ];
  console.log(lines.join('\n'));
  if (write) {
    const directory = join(root, 'data', 'audits', 'recht-nrw', 'r2');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'R2_AUDIT.json'), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(directory, 'R2_AUDIT.md'), lines.join('\n'));
    console.log(`Geschrieben: data/audits/recht-nrw/r2/R2_AUDIT.json, R2_AUDIT.md`);
  }
  return relevant === 0 ? 0 : 1;
}

process.exitCode = await main();
