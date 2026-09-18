/**
 * Kurzbericht der Beschaffung: `data/audits/bayernrecht/FETCH_CORPUS.md`.
 *
 * Der Bericht beantwortet genau die Fragen, die nach einem stundenlangen Lauf offen sind: Wie viele
 * Dokumente liegen im Cache, wie viele kamen in diesem Lauf dazu, was ist gescheitert und warum, wie
 * groß ist der Bestand, wie lange hat es gedauert, und falls der Lauf angehalten hat: weshalb.
 *
 * Fehler werden nach Ursache gebündelt und mit Beispielen belegt – eine Liste mit hunderten Zeilen
 * liest niemand, „23 × HTTP 500“ mit drei Dokument-IDs dagegen schon. Die vollständige Liste steht
 * ohnehin im Zustand (`data/imports/bayernrecht/fetch-state.json`), der Bericht ersetzt ihn nicht.
 */
import { join } from 'node:path';

import { writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { AUDIT_DIR, SOURCE_STATE, TARGET_JURISDICTION } from '../common/constants.ts';
import { compareSourceIdentity } from '../common/paths.ts';
import { formatBytes, formatDuration, FETCHABLE_AREAS, type FetchCorpusResult } from './run.ts';
import { FETCH_STATE_PATH, type FetchStateEntry } from './state.ts';

export const FETCH_REPORT_PATH = `${AUDIT_DIR}/FETCH_CORPUS.md`;

/** Ursachengruppe eines Fehlers: der Text ohne Adresse und ohne Einzelheiten der Antwort. */
export function failureReason(entry: FetchStateEntry): string {
  const message = entry.error ?? 'ohne Angabe';
  if (entry.httpStatus !== undefined && entry.httpStatus >= 400) return `HTTP ${entry.httpStatus}`;
  const kind = /^\[([a-z-]+)\]/u.exec(message)?.[1];
  if (kind) return kind;
  if (/kein ZIP-Paket/u.test(message)) return 'kein ZIP-Paket';
  return message.slice(0, 60);
}

export function renderFetchReport(result: FetchCorpusResult, generatedAt: string): string {
  const { totals } = result.state;
  const failures = result.state.entries.filter((entry) => entry.status === 'failed');
  const groups = new Map<string, FetchStateEntry[]>();
  for (const entry of failures) {
    const reason = failureReason(entry);
    groups.set(reason, [...(groups.get(reason) ?? []), entry]);
  }
  const byArea = (area: string): FetchStateEntry[] => result.state.entries.filter((entry) => entry.sourceArea === area);
  const lines = [
    '# Beschaffung BAYERN.RECHT – Exportpakete im lokalen Cache',
    '',
    `Quelle ${SOURCE_STATE} (gesetze-bayern.de) → Simulationsland ${TARGET_JURISDICTION.toUpperCase()}. Stand ${generatedAt}.`,
    '',
    'Dieser Lauf beschafft nur: Er lädt je enumeriertem Dokument das XML-Exportpaket unverändert in den',
    'lokalen Cache und prüft an der Antwort ausschließlich, dass sie ein ZIP ist. Es entsteht keine Norm,',
    `kein Content und kein Manifesteintrag; der vollständige Zustand steht in \`${FETCH_STATE_PATH}\`.`,
    '',
    '## Bilanz',
    '',
    '| Kennzahl | Wert |',
    '| --- | --- |',
    `| enumerierte Dokumente | ${totals.enumerated} |`,
    `| davon im Cache | ${totals.cached} |`,
    `| in diesem Lauf geholt | ${result.fetched} |`,
    `| in diesem Lauf aus dem Cache | ${result.fromCache} |`,
    `| gescheitert | ${totals.failed} |`,
    `| offen | ${totals.skipped} |`,
    `| Gesamtgröße im Cache | ${formatBytes(result.totalBytes)} |`,
    `| in diesem Lauf übertragen | ${formatBytes(result.bytesDownloaded)} |`,
    `| Netzabrufe | ${result.networkRequests} |`,
    `| Dauer | ${formatDuration(result.durationMs)} |`,
    '',
    'Die Zeilen „davon im Cache“, „gescheitert“, „offen“ und „Gesamtgröße“ beschreiben den **Bestand**,',
    'die Zeilen „in diesem Lauf“ den Lauf, der diese Datei geschrieben hat. Ein Wiederanlauf auf',
    'vollständigem Bestand ist netzfrei und meldet deshalb 0 geholte Dokumente bei vollem Cache.',
    '',
    '### Je Quellbereich',
    '',
    '| Bereich | enumeriert | im Cache | gescheitert | offen |',
    '| --- | --- | --- | --- | --- |',
    ...FETCHABLE_AREAS.map((area) => {
      const entries = byArea(area);
      const cached = entries.filter((entry) => entry.status === 'cached').length;
      const failed = entries.filter((entry) => entry.status === 'failed').length;
      return `| ${area} | ${entries.length} | ${cached} | ${failed} | ${entries.length - cached - failed} |`;
    }),
    '',
    '## Abbruchgrund',
    '',
    result.stopReason ? `Der Lauf hat angehalten: **${result.stopReason}** – ${result.stopDetail ?? 'ohne Angabe'}. Der Halt ist sauber: Alles Offene steht als \`skipped\` im Zustand, ein Wiederanlauf setzt dort fort.` : 'Kein Abbruch: Der Lauf ist bis zum Ende der Liste gekommen.',
    '',
    '## Fehler',
    '',
  ];
  if (failures.length === 0) lines.push('Keine.');
  else {
    lines.push('| Ursache | Dokumente | Beispiele |', '| --- | --- | --- |');
    for (const [reason, entries] of [...groups.entries()].sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))) {
      const examples = [...entries].sort((left, right) => compareSourceIdentity(left.documentId, right.documentId)).slice(0, 5).map((entry) => entry.documentId);
      lines.push(`| ${reason} | ${entries.length} | ${examples.join(', ')}${entries.length > examples.length ? ', …' : ''} |`);
    }
  }
  lines.push('', '## Befunde', '');
  if (result.findings.length === 0) lines.push('Keine. Kein vorhandener Cacheeintrag wurde ersetzt.');
  else {
    lines.push('| Art | Dokument | Cache | Quelle | Befund |', '| --- | --- | --- | --- | --- |');
    for (const finding of result.findings) {
      lines.push(`| ${finding.kind} | ${finding.documentId} | ${finding.cachedSha256 ?? '–'} | ${finding.fetchedSha256 ?? '–'} | ${finding.detail} |`);
    }
    lines.push('', 'Ein Befund `source-changed` ist keine Fehlfunktion: Die Quelle hat sich seit dem Abruf geändert.', 'Die alten Bytes bleiben unverändert im Cache; welche Fassung gilt, entscheidet ein Mensch.');
  }
  lines.push('');
  return lines.join('\n');
}

export async function writeFetchReport(root: string, result: FetchCorpusResult, generatedAt: string): Promise<boolean> {
  return writeFileAtomic(join(root, FETCH_REPORT_PATH), renderFetchReport(result, generatedAt));
}
