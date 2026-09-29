/** Semantischer Tabellen-Fingerabdruck (Run 16, `content:tables`). */
import { describe, expect, it } from 'vitest';

import { tableFingerprint, versionTableFingerprints } from '../../scripts/lib/table-fingerprints.ts';

const table = (rows: string[][], over: Record<string, unknown> = {}) => ({ type: 'table', columns: rows[0]!.length, children: rows.map((row) => ({ type: 'tableRow', children: row.map((text) => ({ type: 'tableCell', text })) })), ...over });

describe('Tabellen-Fingerabdruck', () => {
  it('ist unabhängig von Leerraum und Formatierung', () => {
    expect(tableFingerprint(table([['Tarifstelle', 'Euro'], ['1.1', ' 30-50 ']]))).toBe(tableFingerprint(table([['Tarifstelle', 'Euro'], ['1.1', '30-50']])));
  });

  it('unterscheidet Zellentext, Zeilenzahl, Spann und Kopfzelle', () => {
    const base = tableFingerprint(table([['A', 'B'], ['1', '2']]));
    expect(tableFingerprint(table([['A', 'B'], ['1', '3']]))).not.toBe(base);
    expect(tableFingerprint(table([['A', 'B'], ['1', '2'], ['3', '4']]))).not.toBe(base);
    const spanned = table([['A', 'B'], ['1', '2']]);
    (spanned.children[0]!.children[0] as Record<string, unknown>).colspan = 2;
    expect(tableFingerprint(spanned)).not.toBe(base);
    const header = table([['A', 'B'], ['1', '2']]);
    (header.children[0]!.children[0] as Record<string, unknown>).type = 'tableHeaderCell';
    expect(tableFingerprint(header)).not.toBe(base);
  });

  it('findet Tabellen in verschachtelten Blöcken in Dokumentreihenfolge', () => {
    const first = table([['A', 'B'], ['1', '2']]);
    const second = table([['X', 'Y'], ['9', '8']]);
    const version = { body: [{ type: 'paragraph', children: [{ type: 'subparagraph', text: 'x' }, first] }, { type: 'annex', children: [second] }] };
    expect(versionTableFingerprints(version as never)).toEqual([tableFingerprint(first), tableFingerprint(second)]);
  });
});
