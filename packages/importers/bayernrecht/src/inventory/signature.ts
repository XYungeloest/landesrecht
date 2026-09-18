/**
 * Strukturelle Signaturen und Klassenbildung.
 *
 * Die Inventur listet nicht auf, sie fasst zusammen. Dafür braucht jeder Befund einen Schlüssel, der
 * das **Muster** benennt und nicht das Vorkommen: DTD-Element und Elternpfad, Attributkombination,
 * Überschriften-, Tabellen-, Fußnoten-, Bild- und Anlagenmuster. Zwei Dokumente mit demselben
 * unbekannten Element in derselben Position tragen dieselbe Signatur und landen in derselben Klasse.
 *
 * Alles Veränderliche fällt dabei heraus: Zeilennummern (sie stehen als eigenes Feld am Beispiel,
 * nicht im Schlüssel), Zählungen, Dokument-IDs und Zitatinhalte. Was bleibt, ist die Struktur.
 *
 * Die Befunde der Sammelmeldungen `unknown-structure` und `unknown-attributes` werden übersprungen:
 * Sie wiederholen nur, was die Einzelbefunde `unknown-element` und `unknown-attribute` bereits
 * namentlich und mit Position melden – als Signatur wären sie eine Kombination je Dokument und
 * damit keine Klasse.
 */
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';

import type { InventoryEntry, InventoryFinding, InventoryPhase, StructureClass } from './model.ts';

/** Sammelmeldungen; ihre Einzelbefunde tragen dieselbe Information mit Position. */
const AGGREGATE_CODES: readonly string[] = ['unknown-structure', 'unknown-attributes'];

const UNKNOWN_ELEMENT = /^Unbekanntes Element <([^>]+)> in (.+?) \(Zeile (\d+)\)$/u;
const UNKNOWN_ATTRIBUTE = /^Unbekanntes Attribut ([^\s]+)@([^\s]+) in (.+?) \(Zeile (\d+)\)$/u;
const LINE_HINT = /\(Zeile (\d+)\)/u;

/** `@builddate` ist tagesaktuell; in einem Ausschnitt würde es den Bericht täglich ändern. */
export function maskVolatile(text: string): string {
  return text.replace(/builddate="[^"]*"/gu, 'builddate="…"');
}

/** Ein Ausschnitt: eine Zeile, geglättet, maskiert und auf Lesbarkeit gekürzt. */
export function excerptOf(text: string, limit = 180): string {
  const collapsed = maskVolatile(text).replace(/\s+/gu, ' ').trim();
  return collapsed.length > limit ? `${collapsed.slice(0, limit)}…` : collapsed;
}

/**
 * Meldung ohne alles Veränderliche: Dokument-ID, Zeilennummern, Zahlen und Zitatinhalte fallen
 * heraus. Übrig bleibt der Satzbau des Befundes – und der ist das Muster.
 */
export function normalizeMessage(message: string, documentId: string): string {
  let text = message;
  if (documentId && text.startsWith(`${documentId}: `)) text = text.slice(documentId.length + 2);
  if (documentId) text = text.split(documentId).join('<dok>');
  return text
    .replace(/\(Zeile \d+\)/gu, '')
    .replace(/„[^“]*“/gu, '„…“')
    .replace(/"[^"]*"/gu, '"…"')
    // Zahlen ohne Wortgrenze: Auch Instanzkennungen wie `ANL_14`, `G_1` oder `Art. 12a` sind
    // Vorkommen, keine Struktur – sonst hätte jede Anlage ihre eigene Klasse.
    .replace(/\d+(?:[.,]\d+)*/gu, '#')
    // Eine Aufzählung in Klammern nennt die Fundstücke eines Dokuments, nicht das Muster.
    .replace(/\([^)]*,[^)]*\)/gu, '(…)')
    .replace(/\s+/gu, ' ')
    .trim();
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

/**
 * Elternpfad ohne Instanzkennung: `<annex ANL_14>` und `<annex ANL_2>` sind dieselbe Stelle im
 * Modell, nur an zwei Anlagen. Ohne diesen Schritt hätte jede Anlage ihre eigene Klasse – und die
 * Klassenbildung wäre wieder eine Liste.
 */
function normalizePath(where: string): string {
  return where.replace(/\d+(?:[.,]\d+)*/gu, '#');
}

/**
 * Signatur, Element und Elternpfad eines Befundes. Für die Codes, deren Muster in einem Attribut
 * oder einer Dateiendung steckt, wird genau das ausgelesen – sonst bliebe die Klasse unscharf.
 */
function classify(finding: ImportFinding, documentId: string): { signature: string; element?: string; parentPath?: string } {
  const { code, message } = finding;

  const element = UNKNOWN_ELEMENT.exec(message);
  if (element) {
    const path = normalizePath(element[2]!);
    return { signature: `unknown-element:<${element[1]}> in ${path}`, element: element[1], parentPath: path };
  }

  const attribute = UNKNOWN_ATTRIBUTE.exec(message);
  if (attribute) return { signature: `unknown-attribute:${attribute[1]}@${attribute[2]}`, element: attribute[1], parentPath: normalizePath(attribute[3]!) };

  if (code === 'norm-type-out-of-model' || code === 'norm-type-refined' || code === 'norm-type-assumed') {
    const doktyp = /@doktyp="([^"]*)"/u.exec(message)?.[1];
    return { signature: doktyp ? `${code}:@doktyp="${doktyp}"` : code };
  }
  if (code === 'vv-paragraph-type-unknown') {
    const type = /typ="([^"]*)"/u.exec(message)?.[1];
    return { signature: type ? `${code}:<p typ="${type}">` : code, element: 'p' };
  }
  if (code === 'residual-source-state-reference' || code === 'doubled-target-name') {
    // Das Muster ist der stehengebliebene Ausdruck, nicht der Feldpfad, an dem er auffiel.
    const term = /„([^“]*)“/u.exec(message)?.[1];
    return { signature: term ? `${code}:„${term}“` : code };
  }
  if (code === 'referenced-file-missing') {
    const extensions = [...new Set([...message.matchAll(/\.(jpe?g|gif|png|pdf)\b/giu)].map((match) => `.${match[1]!.toLowerCase()}`))].sort();
    return { signature: `${code}:${extensions.join(',') || '(ohne Endung)'}` };
  }
  if (code === 'package-media-type-mismatch') {
    const pairs = [...new Set([...message.matchAll(/deklariert ([^,]+), die Dateiendung ist ([^\s;]+)/gu)].map((match) => `${match[1]}→${match[2]}`))].sort();
    return { signature: `${code}:${pairs.join(',') || 'unbenannt'}` };
  }
  // Zählbefunde (Fußnoten, Tabellen, Satznummern, Abbildungen, Anlagen …): Das Muster ist der Code
  // selbst; die Zahl gehört ins Beispiel, nicht in den Schlüssel.
  if (['footnotes', 'tables', 'sentence-numbers', 'quoted-provisions', 'graphic-not-transferred', 'vv-depth-beyond-model', 'vv-section-address-unresolved', 'vv-section-effective-dates', 'division-number-before-title', 'division-without-heading', 'title-possibly-truncated', 'referenced-file-case-mismatch', 'vv-bayrs-number-absent', 'vv-builddate-present'].includes(code)) {
    return { signature: code };
  }
  return { signature: `${code}:${truncate(normalizeMessage(message, documentId), 120)}` };
}

export interface FindingContext {
  documentId: string;
  phase: InventoryPhase;
  /** Zeile des Exportdokuments (1-basiert) für den Ausschnitt; ohne XML-Text nicht verfügbar. */
  lineAt?: (line: number) => string | undefined;
}

/** Ein Parserbefund wird zum Inventurbefund: Signatur, Position, Ausschnitt. */
export function toInventoryFinding(finding: ImportFinding, context: FindingContext): InventoryFinding {
  const { signature, element, parentPath } = classify(finding, context.documentId);
  const line = Number.parseInt(LINE_HINT.exec(finding.message)?.[1] ?? '', 10);
  const hasLine = Number.isFinite(line);
  const sourceLine = hasLine ? context.lineAt?.(line) : undefined;
  const entry: InventoryFinding = {
    code: finding.code,
    severity: finding.severity,
    phase: context.phase,
    signature,
    excerpt: excerptOf(sourceLine ?? finding.message),
  };
  if (element) entry.element = element;
  if (parentPath) entry.parentPath = parentPath;
  if (hasLine) entry.line = line;
  return entry;
}

/**
 * Ein Sammelbefund, der mehrere Fundstücke eines Dokuments in **einer** Meldung führt, wird in seine
 * Fundstücke zerlegt: Die Klasse ist die einzelne Abkürzung, nicht die Liste, in der sie zufällig
 * mit anderen steht. Ohne diesen Schritt trüge jedes Dokument seine eigene Klasse.
 */
function expandCollective(finding: ImportFinding): string[] {
  if (finding.code !== 'undecidable-source-state-abbreviation') return [];
  const list = /außerhalb eines Schutzmusters \(([^)]*)\)/u.exec(finding.message)?.[1] ?? '';
  return list.split(',').map((entry) => entry.trim()).filter((entry) => entry !== '' && !entry.startsWith('…'));
}

/** Befunde eines Dokuments: Sammelmeldungen weg, nach Signatur entdoppelt, deterministisch sortiert. */
export function collectFindings(findings: readonly ImportFinding[], context: FindingContext): InventoryFinding[] {
  const bySignature = new Map<string, InventoryFinding>();
  const add = (entry: InventoryFinding): void => {
    if (!bySignature.has(entry.signature)) bySignature.set(entry.signature, entry);
  };
  for (const finding of findings) {
    if (AGGREGATE_CODES.includes(finding.code)) continue;
    const parts = expandCollective(finding);
    if (parts.length > 0) {
      const entry = toInventoryFinding(finding, context);
      for (const part of parts) add({ ...entry, signature: `${finding.code}:${part}` });
      continue;
    }
    add(toInventoryFinding(finding, context));
  }
  return [...bySignature.values()].sort((left, right) => (left.signature < right.signature ? -1 : left.signature > right.signature ? 1 : 0));
}

/**
 * Ein Abbruch als Befund. Die Meldung trägt die Ursache; die Signatur ist ihr Muster ohne
 * Dokument-ID, Zeilennummern und Zahlen – zwei Dokumente, die an derselben Stelle scheitern, bilden
 * eine Klasse.
 */
export function abortFinding(error: unknown, code: string, context: FindingContext): InventoryFinding {
  const message = error instanceof Error ? error.message : String(error);
  const line = Number.parseInt(LINE_HINT.exec(message)?.[1] ?? '', 10);
  // Die Schemameldung beginnt mit dem Pfad der beanstandeten Datei; der ist je Norm verschieden und
  // gehört nicht in die Klasse. Der Grund steht dahinter – und der ist das Muster.
  const reason = code === 'schema-invalid' && message.includes(': ') ? message.slice(message.indexOf(': ') + 2) : message;
  // Ein unbekannter `@doktyp` **ist** die Klasse; die allgemeine Glättung würde seinen Wert tilgen.
  const documentType = /@doktyp="([^"]*)"/u.exec(message)?.[1];
  const normalized = truncate(normalizeMessage(reason, context.documentId), 140);
  const entry: InventoryFinding = {
    code,
    severity: 'error',
    phase: context.phase,
    signature: `${code}:${documentType ? normalized.replace('@doktyp="…"', `@doktyp="${documentType}"`) : normalized}`,
    excerpt: excerptOf(message, 240),
  };
  if (Number.isFinite(line)) {
    entry.line = line;
    const sourceLine = context.lineAt?.(line);
    if (sourceLine) entry.excerpt = excerptOf(`${message} · Quelle: ${sourceLine}`, 240);
  }
  return entry;
}

/** Bis zu fünf Beispiele je Klasse – echte Dokumente, kein erfundener Ausschnitt. */
export const EXAMPLES_PER_CLASS = 5;

/**
 * Klassen über den ganzen Bestand: je Signatur die Zahl der betroffenen Dokumente und bis zu fünf
 * Beispiele. Sortiert nach Zahl der Dokumente absteigend, bei Gleichstand nach Signatur – damit ein
 * zweiter Lauf dieselbe Reihenfolge schreibt.
 */
export function clusterFindings(entries: readonly InventoryEntry[]): StructureClass[] {
  const classes = new Map<string, StructureClass>();
  for (const entry of [...entries].sort((left, right) => (left.documentId < right.documentId ? -1 : 1))) {
    for (const finding of entry.findings) {
      let cluster = classes.get(finding.signature);
      if (!cluster) {
        cluster = {
          signature: finding.signature,
          code: finding.code,
          phase: finding.phase,
          severity: finding.severity,
          documents: 0,
          examples: [],
        };
        if (finding.element) cluster.element = finding.element;
        if (finding.parentPath) cluster.parentPath = finding.parentPath;
        classes.set(finding.signature, cluster);
      }
      cluster.documents += 1;
      if (cluster.examples.length < EXAMPLES_PER_CLASS) {
        const example: StructureClass['examples'][number] = { documentId: entry.documentId, excerpt: finding.excerpt };
        if (finding.line !== undefined) example.line = finding.line;
        cluster.examples.push(example);
      }
    }
  }
  return [...classes.values()].sort((left, right) => right.documents - left.documents || (left.signature < right.signature ? -1 : left.signature > right.signature ? 1 : 0));
}
