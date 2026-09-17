#!/usr/bin/env node
/**
 * Audit 8: Evidenzquellen zu Staatsverträgen (`data/imports/recht-nrw/evidence/lrgv/`, offline).
 *
 *   node scripts/audit-treaty-evidence.ts
 *
 * Prüft alle registrierten Belege (Schema, Archiv in R2, Hash/Schlüssel, Datum) und ordnet
 * Inkrafttretensbekanntmachungen zu Staatsverträgen den Gesetzen des Bestands zu (Titelähnlichkeit).
 * Stichprobe für die Detailtabelle: jede k-te Bekanntmachung (gleichmäßig, deterministisch).
 * Schreibt data/audits/recht-nrw/quality/treaty-evidence.{json,md}.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadWestCorpus, mdTable, repositoryRoot, stridedSample, writeAuditReport } from './lib/audit-common.ts';

interface EvidenceFile {
  schemaVersion: string;
  sourceIdentity: string;
  sourceArea: string;
  portalType: string;
  kind: string;
  url: string;
  title: string;
  sha256: string;
  retrievedAt: string;
  archive?: { availability?: string; bucket?: string; objectKey?: string };
  treatyTitle?: string;
  validFrom?: string;
}

interface EnumerationFile { items?: Array<{ role?: string; sourceIdentity?: string; evidence?: { kind: string; treatyTitle?: string } }> }

const root = repositoryRoot();
const directory = join(root, 'data', 'imports', 'recht-nrw', 'evidence', 'lrgv');
const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
const evidence = await Promise.all(files.map(async (file) => ({ file, data: JSON.parse(await readFile(join(directory, file), 'utf8')) as EvidenceFile })));
const enumeration = JSON.parse(await readFile(join(root, 'data', 'imports', 'recht-nrw', 'enumeration-lrgv.json'), 'utf8')) as EnumerationFile;
const enumerationEvidence = (enumeration.items ?? []).filter((item) => item.role === 'evidence');
const enumerationIdentities = new Set(enumerationEvidence.map((item) => item.sourceIdentity).filter(Boolean));

const norms = await loadWestCorpus(root);
const STOP = new Set(['des', 'der', 'die', 'das', 'und', 'dem', 'den', 'zum', 'zur', 'vom', 'von', 'über', 'ueber', 'für', 'fuer', 'mit', 'im', 'in', 'am', 'an', 'zwischen', 'dem', 'lande', 'land', 'landes', 'nordrhein', 'westfalen', 'nordrhein-westfalen', 'westdeutschland', 'staatsvertrag', 'staatsvertrages', 'staatsvertrags', 'vertrag', 'vertrages', 'vertrags', 'abkommen', 'abkommens', 'gesetz', 'gesetzes', 'bekanntmachung', 'inkrafttretens', 'inkrafttreten', 'ersten', 'zweiten', 'dritten', 'vierten', 'fünften', 'sechsten', 'siebten', 'achten', 'neunten', 'zehnten', 'ländern', 'laendern', 'einer', 'eines', 'eine', 'ein', 'aenderung', 'änderung', 'zu', 'dm', 'ratifizierung', 'zustimmung']);
const tokens = (value: string): Set<string> => new Set(value.toLowerCase().replace(/[()„“"',.;:/–-]/gu, ' ').split(/\s+/u).filter((token) => token.length > 2 && !STOP.has(token)));
const overlap = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.min(left.size, right.size);
};
const treatyLaws = norms.filter((record) => record.meta.type === 'zustimmungsgesetz' || record.meta.type === 'staatsvertrag' || /staatsvertrag|abkommen|\bvertrag/iu.test(record.meta.title)).map((record) => ({ slug: record.meta.slug, title: record.meta.title, type: record.meta.type, tokens: tokens(record.meta.title) }));

const KEY_PATTERN = /^west\/recht-nrw\/2023-12-01\/term-(\d+)\/([a-f0-9]{16})-version-page\.html$/u;
const TREATY_TITLE = /(?:Staatsvertrag|Abkommen|Vertrag|Vereinbarung)/u;
const IN_FORCE_TITLE = /Inkrafttreten|In-Kraft-Treten|in Kraft/u;

interface Finding { file: string; sourceIdentity: string; severity: 'error' | 'warning' | 'info'; code: string; message: string }
const findings: Finding[] = [];
const kinds: Record<string, number> = {};
const assignments: Array<{ sourceIdentity: string; kind: string; title: string; validFrom?: string; treatyTitle?: string; match?: { slug: string; title: string; score: number } }> = [];
let inManifestAsNorm = 0;
const normIdentities = new Set(norms.flatMap((record) => record.meta.externalIdentifiers.filter((entry) => entry.system === 'recht-nrw').map((entry) => entry.value)));

for (const { file, data } of evidence) {
  const push = (severity: Finding['severity'], code: string, message: string): void => { findings.push({ file, sourceIdentity: data.sourceIdentity, severity, code, message }); };
  kinds[data.kind] = (kinds[data.kind] ?? 0) + 1;
  if (data.schemaVersion !== 'recht-nrw-evidence/1') push('error', 'schema', `Schema ${data.schemaVersion}`);
  const termId = data.sourceIdentity.match(/^term:(\d+)$/u)?.[1];
  if (!termId) push('error', 'identity', `sourceIdentity ${data.sourceIdentity}`);
  if (file !== `term-${termId}.json`) push('error', 'file-name', `Dateiname passt nicht zu ${data.sourceIdentity}`);
  if (data.portalType !== 'bekanntmachung') push('warning', 'portal-type', `Portaltyp ${data.portalType}`);
  if (!/^[a-f0-9]{64}$/u.test(data.sha256)) push('error', 'sha256', 'kein SHA-256');
  if (data.archive?.availability !== 'r2-archived') push('error', 'archive-availability', `availability ${data.archive?.availability ?? '–'}`);
  if (data.archive?.bucket !== 'landesrecht-quellen') push('error', 'archive-bucket', `bucket ${data.archive?.bucket ?? '–'}`);
  const key = data.archive?.objectKey?.match(KEY_PATTERN);
  if (!key) push('error', 'object-key', `objectKey ${data.archive?.objectKey ?? '–'}`);
  else {
    if (key[1] !== termId) push('error', 'object-key-term', `objectKey term-${key[1]} ≠ ${data.sourceIdentity}`);
    if (!data.sha256.startsWith(key[2]!)) push('error', 'object-key-hash', 'objectKey-Präfix ≠ sha256');
  }
  if (!data.url.startsWith('https://recht.nrw.de/lrgv/bekanntmachung/')) push('warning', 'url', `URL ${data.url}`);
  if (!data.title?.trim()) push('error', 'title', 'Titel fehlt');
  if (!data.validFrom) push('warning', 'valid-from-missing', 'kein validFrom');
  else if (!/^\d{4}-\d{2}-\d{2}$/u.test(data.validFrom)) push('error', 'valid-from-format', `validFrom ${data.validFrom}`);
  const pathDate = data.url.match(/\/(\d{2})(\d{2})(\d{4})-/u);
  if (pathDate && data.validFrom && `${pathDate[3]}-${pathDate[2]}-${pathDate[1]}` !== data.validFrom) push('warning', 'valid-from-url-mismatch', `validFrom ${data.validFrom}, URL-Datum ${pathDate[3]}-${pathDate[2]}-${pathDate[1]}`);
  if (!enumerationIdentities.has(data.sourceIdentity)) push('info', 'not-in-enumeration', 'Beleg ohne Enumerationseintrag mit Rolle evidence');
  if (normIdentities.has(data.sourceIdentity)) { inManifestAsNorm += 1; push('error', 'evidence-imported-as-norm', 'Beleg ist zugleich als Norm im Bestand'); }

  const looksLikeTreatyInForce = TREATY_TITLE.test(data.title) && IN_FORCE_TITLE.test(data.title);
  if (data.kind === 'treaty-in-force-notice') {
    if (!data.treatyTitle?.trim()) push('error', 'treaty-title-missing', 'treatyTitle fehlt');
    if (!looksLikeTreatyInForce) push('warning', 'treaty-kind-doubtful', `Titel nennt kein Inkrafttreten eines Vertrags: „${data.title}“`);
  } else if (looksLikeTreatyInForce) {
    push('warning', 'treaty-not-recognized', `Titel wirkt wie Inkrafttretensbekanntmachung eines Vertrags, kind ${data.kind}`);
  }

  if (data.kind === 'treaty-in-force-notice' || TREATY_TITLE.test(data.title)) {
    const needle = tokens(data.treatyTitle ?? data.title);
    let best: { slug: string; title: string; score: number } | undefined;
    for (const law of treatyLaws) {
      const score = overlap(needle, law.tokens);
      if (score > (best?.score ?? 0)) best = { slug: law.slug, title: law.title, score: Math.round(score * 100) / 100 };
    }
    const assignment: (typeof assignments)[number] = { sourceIdentity: data.sourceIdentity, kind: data.kind, title: data.title };
    if (data.validFrom) assignment.validFrom = data.validFrom;
    if (data.treatyTitle) assignment.treatyTitle = data.treatyTitle;
    if (best && best.score >= 0.5) assignment.match = best;
    assignments.push(assignment);
  }
}

findings.sort((left, right) => left.sourceIdentity.localeCompare(right.sourceIdentity, undefined, { numeric: true }) || left.code.localeCompare(right.code));
const treatyAssignments = assignments.filter((entry) => entry.kind === 'treaty-in-force-notice');
const matched = treatyAssignments.filter((entry) => entry.match);
const codes = findings.reduce<Record<string, number>>((acc, finding) => { acc[`${finding.severity}:${finding.code}`] = (acc[`${finding.severity}:${finding.code}`] ?? 0) + 1; return acc; }, {});
const sample = stridedSample(evidence.map(({ data }) => data), 40);

const result = {
  summary: {
    evidenceFiles: evidence.length,
    enumerationEvidenceItems: enumerationEvidence.length,
    enumerationByKind: enumerationEvidence.reduce<Record<string, number>>((acc, item) => { const kind = item.evidence?.kind ?? '–'; acc[kind] = (acc[kind] ?? 0) + 1; return acc; }, {}),
    filesNotInEnumeration: evidence.filter(({ data }) => !enumerationIdentities.has(data.sourceIdentity)).length,
    kinds,
    withValidFrom: evidence.filter(({ data }) => data.validFrom).length,
    r2Archived: evidence.filter(({ data }) => data.archive?.availability === 'r2-archived').length,
    treatyNotices: treatyAssignments.length,
    treatyNoticesAssigned: matched.length,
    treatyNoticesUnassigned: treatyAssignments.length - matched.length,
    treatyLawsInCorpus: treatyLaws.length,
    importedAsNorm: inManifestAsNorm,
    errors: findings.filter((finding) => finding.severity === 'error').length,
    warnings: findings.filter((finding) => finding.severity === 'warning').length,
    infos: findings.filter((finding) => finding.severity === 'info').length,
    codes,
  },
  findings,
  treatyAssignments,
  sample: sample.map((data) => ({ sourceIdentity: data.sourceIdentity, kind: data.kind, title: data.title, validFrom: data.validFrom ?? null, objectKey: data.archive?.objectKey ?? null })),
};

const markdown = `# Staatsvertrags-Evidenz – Audit

Quelle: \`data/imports/recht-nrw/evidence/lrgv/*.json\` (${evidence.length} Belege) und \`enumeration-lrgv.json\` (${enumerationEvidence.length} Einträge
mit Rolle \`evidence\`). Erzeugt mit \`npm run audit:treaty-evidence\`. Alle Belege werden geprüft; die Detailtabelle zeigt eine
gleichmäßige Stichprobe (jeder ${Math.round(evidence.length / 40)}. Beleg in Dateireihenfolge). Zuordnung zum Gesetz: Token-Überlappung des
Vertragstitels mit den Titeln der Zustimmungsgesetze/Staatsverträge des Bestands (≥ 0,5 = zugeordnet; nur Hinweis, keine Änderung).

## Ergebnis

| Kennzahl | Wert |
| --- | --- |
| Belegdateien | ${evidence.length} |
| Enumeration: Rolle evidence | ${enumerationEvidence.length} (${Object.entries(result.summary.enumerationByKind).sort().map(([kind, count]) => `${kind} ${count}`).join(', ')}) |
| Belege ohne Enumerationseintrag | ${result.summary.filesNotInEnumeration} |
| Arten | ${Object.entries(kinds).sort().map(([kind, count]) => `${kind} ${count}`).join(', ')} |
| in R2 archiviert | ${result.summary.r2Archived} |
| mit validFrom | ${result.summary.withValidFrom} |
| Inkrafttretensbekanntmachungen zu Staatsverträgen | ${treatyAssignments.length} |
| davon einem Gesetz des Bestands zugeordnet | ${matched.length} |
| Zustimmungsgesetze/Verträge im Bestand (Kandidaten) | ${treatyLaws.length} |
| Belege, die zugleich als Norm importiert wurden | ${inManifestAsNorm} |
| Fehler / Warnungen / Hinweise | ${result.summary.errors} / ${result.summary.warnings} / ${result.summary.infos} |

## Befunde nach Code

${mdTable(['Code', 'Anzahl'], Object.entries(codes).sort(([left], [right]) => left.localeCompare(right)).map(([code, count]) => [code, count]))}

## Inkrafttretensbekanntmachungen zu Staatsverträgen (${treatyAssignments.length})

${mdTable(['Beleg', 'gültig ab', 'Vertragstitel', 'zugeordnetes Gesetz', 'Score'], treatyAssignments.map((entry) => [entry.sourceIdentity, entry.validFrom, entry.treatyTitle ?? entry.title, entry.match ? `${entry.match.slug} – ${entry.match.title}` : '–', entry.match?.score]))}

## Stichprobe (${sample.length})

${mdTable(['Beleg', 'Art', 'Titel', 'gültig ab', 'Archivobjekt'], result.sample.map((entry) => [entry.sourceIdentity, entry.kind, entry.title, entry.validFrom, entry.objectKey]))}

## Befunde (${findings.length})

${findings.length === 0 ? 'Keine.' : mdTable(['Beleg', 'Schwere', 'Code', 'Meldung'], findings.map((finding) => [finding.sourceIdentity, finding.severity, finding.code, finding.message]))}
`;

const paths = await writeAuditReport({ name: 'treaty-evidence', json: result, markdown }, root);
console.log(`Evidenz-Audit: ${evidence.length} Belege, ${treatyAssignments.length} Vertragsbekanntmachungen (${matched.length} zugeordnet), ${result.summary.errors} Fehler, ${result.summary.warnings} Warnungen → ${paths.markdown}`);
