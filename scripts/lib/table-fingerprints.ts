/**
 * Semantischer Fingerabdruck der Tabellen einer Fassung (Run 16): Spaltenzahl, Zeilen, Zellenart, Spann und Text
 * (Leerraum normalisiert). Zwei Fassungen mit denselben Fingerabdrücken haben inhaltlich dieselben Tabellen – unabhängig
 * von JSON-Formatierung und von Änderungen außerhalb der Tabellen.
 */
import { createHash } from 'node:crypto';

interface Block {
  type?: string;
  text?: string;
  columns?: number;
  colspan?: number;
  rowspan?: number;
  children?: Block[];
}

const normalize = (text: string | undefined): string => (text ?? '').replace(/\s+/gu, ' ').trim();

/** Kanonische Form einer Tabelle: Zeilen aus Zellen `[art, colspan, rowspan, text, verschachtelte Blöcke]`. */
export function canonicalTable(table: Block): unknown {
  const cell = (block: Block): unknown[] => [block.type === 'tableHeaderCell' ? 'h' : 'd', block.colspan ?? 1, block.rowspan ?? 1, normalize(block.text), (block.children ?? []).map(canonicalBlock)];
  return { columns: table.columns ?? null, rows: (table.children ?? []).map((row) => (row.children ?? []).map(cell)) };
}

function canonicalBlock(block: Block): unknown {
  return block.type === 'table' ? canonicalTable(block) : [block.type ?? '', normalize(block.text), (block.children ?? []).map(canonicalBlock)];
}

function collectTables(blocks: readonly Block[] | undefined, into: Block[]): Block[] {
  for (const block of blocks ?? []) {
    if (block.type === 'table') into.push(block);
    else collectTables(block.children, into);
  }
  return into;
}

export function tableFingerprint(table: Block): string {
  return createHash('sha256').update(JSON.stringify(canonicalTable(table))).digest('hex').slice(0, 16);
}

/** Fingerabdrücke aller Tabellen einer Fassung in Dokumentreihenfolge. */
export function versionTableFingerprints(version: { body?: readonly Block[] }): string[] {
  return collectTables(version.body, []).map(tableFingerprint);
}

/** Kurzbeschreibung einer Tabelle für Berichte („3 Spalten × 92 Zeilen: Tarifstelle | Gegenstand | Euro“). */
export function describeTable(table: Block): string {
  const rows = table.children ?? [];
  const first = (rows[0]?.children ?? []).map((cell) => normalize(cell.text).slice(0, 30)).join(' | ');
  return `${table.columns ?? '?'} Spalten × ${rows.length} Zeilen: ${first}`;
}

export function versionTables(version: { body?: readonly Block[] }): Block[] {
  return collectTables(version.body, []);
}
