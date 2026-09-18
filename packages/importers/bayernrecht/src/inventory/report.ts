/**
 * Die beiden Berichte der Strukturinventur.
 *
 * `FULL_CORPUS_STRUCTURE_REPORT.md` beantwortet die Frage, die vor einem Bulk-Lauf steht: Welche
 * Strukturen enthält die Quelle wirklich, und wie viele Dokumente hängen an jeder? Deshalb steht
 * dort keine Fehlerliste, sondern eine nach Zahl der betroffenen Dokumente absteigend sortierte
 * Klassenübersicht – jede mit bis zu fünf echten Beispielen und dem Ausschnitt, an dem es hängt.
 *
 * `TEXT_INTEGRITY.md` beantwortet die zweite: Geht auf dem Weg Text verloren? Eine Abweichung der
 * Klasse `mismatch` ist ein Importhindernis und steht deshalb zuoberst, mit Beleg.
 *
 * Beide Berichte sind reine Ableitungen aus `inventory.json`: kein Tagesdatum, keine Laufzeit, keine
 * Zahl, die nicht im Bestand steht.
 */
import { join } from 'node:path';

import { writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { REVIEW_TOKEN_LIMIT } from './text.ts';
import {
  BLOCKING_OUTCOMES,
  INVENTORY_OUTCOMES,
  INVENTORY_PATH,
  STRUCTURE_REPORT_PATH,
  TEXT_INTEGRITY_CLASSES,
  TEXT_INTEGRITY_REPORT_PATH,
  type InventoryEntry,
  type InventoryFile,
  type TextIntegrityClass,
} from './model.ts';

const OUTCOME_LABELS: Readonly<Record<string, string>> = {
  parsed: 'ohne Befund durch den ganzen Weg',
  'parsed-with-warnings': 'durchgelaufen, mit Hinweisen',
  'unknown-structure': 'unbekannte Struktur im Export',
  'integrity-mismatch': 'Textverlust oder Verdopplung',
  'schema-failed': 'Schemaprüfung der Zielnorm gescheitert',
  'transform-failed': 'Überleitung gescheitert',
  'missing-assets': 'im XML referenzierte Datei fehlt im Paket',
  'source-corrupt': 'Exportpaket nicht lesbar',
  'skipped-not-cached': 'Paket (noch) nicht im Cache – nicht geprüft',
};

const INTEGRITY_LABELS: Readonly<Record<TextIntegrityClass, string>> = {
  exact: 'dieselbe Wortfolge; es musste nichts normalisiert werden',
  'normalized-equivalent': 'dieselben Wörter nach typografischer Normalisierung (auch neu zusammengesetzt, ohne Verlust)',
  'explained-difference': 'Unterschied vollständig durch einen benannten Befund erklärt',
  review: `bis zu ${REVIEW_TOKEN_LIMIT} unerklärte Wörter – Einzelfall, von Hand zu entscheiden`,
  mismatch: 'Textverlust oder Verdopplung – Importhindernis',
};

/** Klassen ohne Importhindernis mit eigenem Abschnitt; darüber hinaus bleibt die Tabelle. */
const DETAIL_LIMIT = 40;

function table(header: readonly string[], rows: ReadonlyArray<readonly string[]>): string[] {
  return [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)];
}

function share(count: number, total: number): string {
  return total === 0 ? '–' : `${((count / total) * 100).toFixed(1).replace('.', ',')} %`;
}

/** Markdown darf die Tabellenzelle nicht sprengen: Pipe und Umbruch werden entschärft. */
function cell(value: string): string {
  return value.replace(/\|/gu, '\\|').replace(/\n/gu, ' ');
}

export function renderStructureReport(file: InventoryFile): string {
  const { totals, classes, entries } = file;
  const checked = totals.checked;
  const blocking = entries.filter((entry) => BLOCKING_OUTCOMES.includes(entry.outcome));
  const lines: string[] = [];

  lines.push('# Strukturinventur des BayWü-Korpus');
  lines.push('');
  lines.push(`**Stand ${file.generatedAt}, Ausgangsrechtsstand ${file.baselineDate}.** Jeder Scope-Kandidat mit vorhandenem Exportpaket ist`);
  lines.push('einmal den ganzen Weg gelaufen: ZIP → XML → Parser → Überleitung → `NormRecord` → `validateNormRecord`.');
  lines.push('Der Parser lief dabei meldend (`unknown: \'report\'`): Eine unbekannte Struktur bricht nicht ab, sie wird benannt.');
  lines.push('');
  lines.push(`Kandidaten laut Scope: **${totals.candidates}** · geprüft: **${checked}** · Paket noch nicht im Cache: **${totals.notCached}**${totals.pending > 0 ? ` · in diesem Lauf nicht erreicht: **${totals.pending}**` : ''}.`);
  lines.push('');
  lines.push(`Dokumente, die einem Bulk-Lauf im Weg stehen: **${blocking.length}** von ${checked}.`);
  lines.push('');
  lines.push(`Datengrundlage: \`${INVENTORY_PATH}\` (ein Eintrag je Dokument).`);
  lines.push('');

  lines.push('## Ausgänge');
  lines.push('');
  lines.push(...table(['Ausgang', 'Dokumente', 'Anteil', 'Bedeutung'], INVENTORY_OUTCOMES
    .filter((outcome) => totals.byOutcome[outcome] > 0)
    .sort((left, right) => totals.byOutcome[right] - totals.byOutcome[left] || (left < right ? -1 : 1))
    .map((outcome) => [`\`${outcome}\``, String(totals.byOutcome[outcome]), share(totals.byOutcome[outcome], checked + totals.notCached), OUTCOME_LABELS[outcome] ?? ''])));
  lines.push('');

  lines.push('## Erfolg je DTD');
  lines.push('');
  lines.push('Die beiden Dokumentmodelle teilen den Fließtextvorrat, sonst wenig – sie verhalten sich nicht gleich.');
  lines.push('');
  lines.push(...distributionTable(file, totals.byDialect, 'DTD'));
  lines.push('');

  lines.push('## Erfolg je Normtyp');
  lines.push('');
  lines.push(...distributionTable(file, totals.byNormType, 'Normtyp'));
  lines.push('');

  lines.push('## Einzelne Kennzahlen');
  lines.push('');
  lines.push(`- **Gliederungsnummer vor dem Titel** (\`division-number-before-title\`): ${totals.signals.divisionNumberBeforeTitle} Dokumente. Die Quelle stellt Verwaltungsvorschriften ihre Gliederungsnummer voran; sie wird als Gliederungsnummer geführt, nicht als Titelbestandteil.`);
  const outOfModel = Object.entries(totals.signals.normTypeOutOfModel);
  lines.push(`- **Normtyp außerhalb des Zielmodells** (\`norm-type-out-of-model\`): ${outOfModel.reduce((sum, [, count]) => sum + count, 0)} Dokumente${outOfModel.length > 0 ? ` – ${outOfModel.map(([doktyp, count]) => `\`@doktyp="${doktyp}"\` ${count}×`).join(', ')}` : ''}.`);
  const images = totals.signals.imageAttachments;
  lines.push(`- **Bildbeilagen**: ${images.documents} Dokumente; davon ${images.withGraphicFinding} mit Befund \`graphic-not-transferred\` (im XML über \`<graphic>\` referenziert, im Normkörper nicht enthalten) und ${images.withoutGraphicFinding} ohne – dort liegt die Bilddatei im Paket, ohne dass das XML sie über \`<graphic>\` aufruft.`);
  lines.push(`- **Slugkollisionen**: ${totals.signals.slugCollisions} Slugs würden mehrfach vergeben; der Bulk-Lauf muss sie auflösen.`);
  lines.push('');

  lines.push('## Strukturklassen');
  lines.push('');
  lines.push('Nach Zahl der betroffenen Dokumente absteigend. Die Signatur ist der Schlüssel: Zwei Dokumente mit');
  lines.push('demselben Element an derselben Stelle stehen in derselben Zeile.');
  lines.push('');
  if (classes.length === 0) lines.push('Keine Befunde – kein geprüftes Dokument trägt eine benennbare Abweichung.');
  else {
    lines.push(...table(['Dokumente', 'Signatur', 'Stufe', 'Gewicht'], classes.map((entry) => [
      String(entry.documents),
      `\`${cell(entry.signature)}\``,
      entry.phase,
      entry.severity,
    ])));
    lines.push('');
    lines.push('### Die Klassen im Einzelnen');
    lines.push('');
    // Zuerst jede Klasse, die einem Bulk-Lauf im Weg steht – vollständig, unabhängig von ihrer Größe:
    // Sie ist die Arbeitsliste. Danach die größten der übrigen. Der Rest bleibt in der Tabelle oben
    // und vollständig in inventory.json; ein Bericht, den niemand mehr liest, hilft nicht weiter.
    const blockingClasses = classes.filter((entry) => entry.severity === 'error');
    const remaining = classes.filter((entry) => entry.severity !== 'error' && entry.documents > 1).slice(0, DETAIL_LIMIT);
    const detailed = [...blockingClasses, ...remaining];
    lines.push(`Zuerst alle ${blockingClasses.length} Klassen mit Gewicht \`error\` (sie halten den Bulk-Lauf auf), danach die ${remaining.length} größten der übrigen. Alle ${classes.length} Klassen stehen in der Tabelle oben und vollständig in \`${INVENTORY_PATH}\`.`);
    lines.push('');
    for (const entry of detailed) {
      lines.push(`#### \`${entry.signature}\` · ${entry.documents} Dokument${entry.documents === 1 ? '' : 'e'}`);
      lines.push('');
      lines.push(`Stufe ${entry.phase} · Gewicht ${entry.severity}${entry.element ? ` · Element \`<${entry.element}>\`` : ''}${entry.parentPath ? ` · Elternpfad \`${entry.parentPath}\`` : ''}`);
      lines.push('');
      for (const example of entry.examples) {
        lines.push(`- \`${example.documentId}\`${example.line === undefined ? '' : ` (Zeile ${example.line})`}: ${cell(example.excerpt)}`);
      }
      if (entry.documents > entry.examples.length) lines.push(`- … und ${entry.documents - entry.examples.length} weitere Dokumente mit derselben Signatur`);
      lines.push('');
    }
  }
  return `${lines.join('\n')}\n`;
}

function distributionTable(file: InventoryFile, distribution: Record<string, Record<string, number>>, label: string): string[] {
  const keys = Object.keys(distribution);
  if (keys.length === 0) return ['(kein geprüftes Dokument)'];
  const outcomes = INVENTORY_OUTCOMES.filter((outcome) => keys.some((key) => (distribution[key]?.[outcome] ?? 0) > 0));
  return table([label, 'geprüft', ...outcomes.map((outcome) => `\`${outcome}\``)], keys.map((key) => {
    const counts = distribution[key]!;
    const checked = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return [`\`${key}\``, String(checked), ...outcomes.map((outcome) => String(counts[outcome] ?? 0))];
  }));
}

export function renderTextIntegrityReport(file: InventoryFile): string {
  const entries = file.entries.filter((entry) => entry.textIntegrity);
  const lines: string[] = [];

  lines.push('# Textintegrität des BayWü-Korpus');
  lines.push('');
  lines.push(`**Stand ${file.generatedAt}.** Für jedes erfolgreich geparste Dokument wird der sichtbare Quelltext gegen den`);
  lines.push('kanonischen Text gehalten. Verglichen wird die Wortmenge, nicht die Zeichenfolge: Erlaubt sind Leerraum,');
  lines.push('Entitäten, typografische Normalisierung und strukturelle Neuzusammensetzung **ohne Textverlust**. Nicht');
  lines.push('erlaubt sind verlorene Sätze, Tabellen, Fußnoten und Anlageninhalte – und keine Verdopplung.');
  lines.push('');
  lines.push(`Geprüft: **${entries.length}** Dokumente.`);
  lines.push('');
  lines.push(...table(['Klasse', 'Dokumente', 'Anteil', 'Bedeutung'], TEXT_INTEGRITY_CLASSES.map((value) => [
    `\`${value}\``,
    String(file.totals.byTextIntegrity[value]),
    share(file.totals.byTextIntegrity[value], entries.length),
    INTEGRITY_LABELS[value],
  ])));
  lines.push('');
  lines.push('`@builddate` des Exports geht in keinen Vergleich ein: Das Portal baut den Export täglich neu.');
  lines.push('');

  // Abweichungen sind keine Einzelfälle, solange sie an derselben Stelle des Modells entstehen.
  const patterns = file.classes.filter((entry) => entry.code.startsWith('text-integrity-'));
  if (patterns.length > 0) {
    lines.push('## Wo der Text verloren geht');
    lines.push('');
    lines.push('Die Abweichungen nach der Stelle im Quellmodell, an der sie entstehen – das ist die Arbeitsliste.');
    lines.push('');
    lines.push(...table(['Dokumente', 'Stelle im Export', 'Klasse'], patterns.map((entry) => {
      const [, kind = '', position = ''] = /^text-integrity:([^:]+):(.*)$/u.exec(entry.signature) ?? [];
      return [String(entry.documents), `\`${cell(position)}\``, `\`${kind}\``];
    })));
    lines.push('');
  }

  // Importhindernisse zuerst, danach die erklärten Klassen.
  for (const value of ['mismatch', 'review', 'explained-difference', 'normalized-equivalent', 'exact'] as const) {
    const documents = entries.filter((entry) => entry.textIntegrity?.class === value);
    lines.push(`## \`${value}\` · ${documents.length} Dokument${documents.length === 1 ? '' : 'e'}`);
    lines.push('');
    lines.push(`${INTEGRITY_LABELS[value]}.`);
    lines.push('');
    if (documents.length === 0) {
      lines.push('Kein Dokument in dieser Klasse.');
      lines.push('');
      continue;
    }
    if (value === 'mismatch') lines.push('**Jede Zeile hier ist ein Importhindernis.**');
    for (const entry of examplesOf(documents, value)) {
      const integrity = entry.textIntegrity!;
      const detail = [
        `${integrity.sourceTokens} Wörter in der Quelle`,
        `${integrity.canonicalTokens} kanonisch`,
        integrity.missing > 0 ? `${integrity.missing} fehlen` : undefined,
        integrity.extra > 0 ? `${integrity.extra} zusätzlich` : undefined,
        integrity.explanations.length > 0 ? `erklärt durch ${integrity.explanations.join(', ')}` : undefined,
      ].filter(Boolean).join(' · ');
      lines.push(`- \`${entry.documentId}\` (${entry.dialect ?? 'ohne DTD'}): ${detail}`);
      if (integrity.lostExcerpt) lines.push(`  - fehlender Quellabschnitt: ${cell(integrity.lostExcerpt)}`);
      if (integrity.duplicatedExcerpt) lines.push(`  - Verdopplungsverdacht: ${cell(integrity.duplicatedExcerpt)}`);
    }
    if (documents.length > examplesOf(documents, value).length) lines.push(`- … und ${documents.length - examplesOf(documents, value).length} weitere Dokumente dieser Klasse`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

/** Beispiele je Klasse: bei Hindernissen großzügig, bei den unauffälligen Klassen wenige. */
function examplesOf(documents: readonly InventoryEntry[], value: TextIntegrityClass): InventoryEntry[] {
  const limit = value === 'mismatch' || value === 'review' ? 20 : 5;
  return documents.slice(0, limit);
}

export async function writeInventoryReports(root: string, file: InventoryFile): Promise<{ written: string[]; unchanged: string[] }> {
  const written: string[] = [];
  const unchanged: string[] = [];
  (await writeFileAtomic(join(root, STRUCTURE_REPORT_PATH), renderStructureReport(file))) ? written.push(STRUCTURE_REPORT_PATH) : unchanged.push(STRUCTURE_REPORT_PATH);
  (await writeFileAtomic(join(root, TEXT_INTEGRITY_REPORT_PATH), renderTextIntegrityReport(file))) ? written.push(TEXT_INTEGRITY_REPORT_PATH) : unchanged.push(TEXT_INTEGRITY_REPORT_PATH);
  return { written, unchanged };
}
