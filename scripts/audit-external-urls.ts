#!/usr/bin/env node
/**
 * Audit 5: Erreichbarkeit externer RECHT.NRW-Adressen – kleine Stichprobe (höchstens 30 Abrufe, nur
 * HEAD/GET-Status ohne Auswertung des Inhalts, 1,5 s Mindestabstand).
 *
 *   node scripts/audit-external-urls.ts [--limit 30] [--delay-ms 1500]
 *
 * Stichprobe: alle Quellen-URLs des Bestands werden dedupliziert und sortiert; aus Portalseiten und PDFs wird
 * je eine gleichmäßige Stichprobe gezogen (jede k-te Adresse). Das R2-Archiv ist das kanonische
 * Evidenzarchiv – ein heutiger 404 macht die Norm nicht ungültig (docs/RECHT_NRW_BULK_IMPORT.md, Quellen).
 * Report: data/audits/recht-nrw/quality/external-urls.{json,md}.
 */
import { fetchPage, loadWestCorpus, mdTable, parseCliArgs, repositoryRoot, sleep, stridedSample, writeAuditReport } from './lib/audit-common.ts';

const { values } = parseCliArgs(process.argv.slice(2));
const limit = Math.min(30, Number.parseInt(values.get('limit') ?? '30', 10) || 30);
const delayMs = Math.max(1_500, Number.parseInt(values.get('delay-ms') ?? '1500', 10) || 1_500);
const root = repositoryRoot();
const norms = await loadWestCorpus(root);

interface Candidate { url: string; kind: 'portal-page' | 'pdf' | 'gazette' | 'other'; slugs: string[] }
const candidates = new Map<string, Candidate>();
for (const record of norms) {
  const references = [...record.meta.sourceReferences, ...record.versions.flatMap((version) => version.sourceReferences ?? [])];
  for (const reference of references) {
    if (!reference.url) continue;
    const kind: Candidate['kind'] = reference.mediaType === 'application/pdf' ? 'pdf' : reference.kind === 'amendment-source' ? 'gazette' : reference.kind === 'official-portal-snapshot' ? 'portal-page' : 'other';
    const existing = candidates.get(reference.url) ?? { url: reference.url, kind, slugs: [] };
    if (!existing.slugs.includes(record.meta.slug)) existing.slugs.push(record.meta.slug);
    candidates.set(reference.url, existing);
  }
}
const all = [...candidates.values()].sort((left, right) => left.url.localeCompare(right.url));
const portal = all.filter((entry) => entry.kind === 'portal-page');
const pdfs = all.filter((entry) => entry.kind === 'pdf');
const gazettes = all.filter((entry) => entry.kind === 'gazette');
const portalShare = Math.max(1, Math.round(limit * 0.6));
const pdfShare = Math.max(1, Math.round(limit * 0.3));
const gazetteShare = Math.max(0, limit - portalShare - pdfShare);
const sample = [...stridedSample(portal, portalShare), ...stridedSample(pdfs, pdfShare), ...stridedSample(gazettes, gazetteShare)].slice(0, limit);

interface Probe { url: string; kind: string; method: 'HEAD' | 'GET'; status: number; durationMs: number; slugs: string[]; error?: string }
const probes: Probe[] = [];
for (const [index, entry] of sample.entries()) {
  if (index > 0) await sleep(delayMs);
  let page = await fetchPage(entry.url, { method: 'HEAD', timeoutMs: 20_000 });
  let method: Probe['method'] = 'HEAD';
  if (page.status === 405 || page.status === 501) {
    await sleep(delayMs);
    page = await fetchPage(entry.url, { method: 'GET', timeoutMs: 20_000 });
    method = 'GET';
  }
  const probe: Probe = { url: entry.url, kind: entry.kind, method, status: page.status, durationMs: page.durationMs, slugs: entry.slugs };
  if (page.error) probe.error = page.error;
  probes.push(probe);
  console.log(`${String(page.status).padStart(3)} ${page.durationMs}ms ${entry.kind} ${entry.url}`);
}

const statusCounts = probes.reduce<Record<string, number>>((acc, probe) => { acc[String(probe.status)] = (acc[String(probe.status)] ?? 0) + 1; return acc; }, {});
const result = {
  method: 'HEAD (Rückfall GET bei 405/501), Mindestabstand ms',
  delayMs,
  candidates: { total: all.length, portalPages: portal.length, pdfs: pdfs.length, gazettes: gazettes.length, other: all.length - portal.length - pdfs.length - gazettes.length },
  sample: { size: probes.length, portalPages: portalShare, pdfs: pdfShare, gazettes: gazetteShare },
  statusCounts,
  probes,
  note: 'Das R2-Archiv (bucket landesrecht-quellen, objectKey/sha256 je Quellenreferenz) ist das kanonische Evidenzarchiv. Ein heutiger 404/3xx der Portaladresse macht die übernommene Norm nicht ungültig; die Portaladresse dokumentiert nur die Herkunft zum Abrufzeitpunkt.',
};

const markdown = `# Externe RECHT.NRW-Adressen – Stichprobe

Erzeugt mit \`npm run audit:external-urls\` (höchstens 30 Abrufe, ${delayMs} ms Mindestabstand, nur Statuscode). Grundgesamtheit:
${all.length} eindeutige Quellen-URLs des West-Bestands (${portal.length} Portalseiten, ${pdfs.length} PDFs, ${gazettes.length} Ministerialblatt-Einträge).
Stichprobe: gleichmäßig jede k-te Adresse der sortierten Listen (${portalShare} Portalseiten, ${pdfShare} PDFs, ${gazetteShare} Ministerialblatt).

**Einordnung:** ${result.note}

## Statusverteilung

${mdTable(['Status', 'Anzahl'], Object.entries(statusCounts).sort().map(([status, count]) => [status, count]))}

Statuscodes: 200 erreichbar; 301/302/307/308 Weiterleitung (nicht gefolgt); 404 nicht (mehr) unter dieser Adresse; 0 Netzfehler/Timeout.

## Abrufe (${probes.length})

${mdTable(['Status', 'Methode', 'ms', 'Art', 'URL', 'Normen'], probes.map((probe) => [probe.status, probe.method, probe.durationMs, probe.kind, probe.url, probe.slugs.slice(0, 3).join(', ') + (probe.slugs.length > 3 ? ` (+${probe.slugs.length - 3})` : '')]))}
`;

const paths = await writeAuditReport({ name: 'external-urls', json: result, markdown }, root);
console.log(`Externe URLs: ${probes.length} Abrufe, Status ${Object.entries(statusCounts).map(([status, count]) => `${status}×${count}`).join(' ')} → ${paths.markdown}`);
