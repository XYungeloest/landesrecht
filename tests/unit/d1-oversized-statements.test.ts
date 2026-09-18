/**
 * Aufteilung übergroßer D1-Anweisungen.
 *
 * Anlass: Eine bayerische Verwaltungsvorschrift trägt 758 PDF-Beilagen, eine Karte je
 * Natura-2000-Gebiet. `meta_json` wird dadurch 431 KB groß; die D1-Grenze für eine Anweisung liegt
 * bei 100 KB. Die Norm auszuschließen hieße, eine gültige Vorschrift wegen der Länge ihrer
 * Beilagenliste zu verlieren.
 *
 * Die beiden Zusagen, die hier geprüft werden, sind die, auf die es ankommt: Was passt, bleibt
 * Byte für Byte unverändert – und was aufgeteilt wird, setzt sich exakt wieder zusammen.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { renderStatement, type PlanQuery } from '@landesrecht/runtime/projection.ts';
import { D1_MAX_STATEMENT_BYTES, splitOversizedInsert } from '@landesrecht/runtime/sql-batches.ts';

const insertNorm = (metaJson: string): PlanQuery => ({
  sql: 'INSERT INTO law_norms (id, jurisdiction, slug, meta_json) VALUES (?, ?, ?, ?)',
  params: ['baywue:gross', 'baywue', 'gross', metaJson],
});

describe('Aufteilung übergroßer Anweisungen', () => {
  it('lässt eine Anweisung, die passt, Byte für Byte unverändert', () => {
    // Darauf beruht, dass der West-Bestand – in dem keine Anweisung die Grenze erreicht – nach der
    // Einführung exakt dieselben Dateien erzeugt wie zuvor.
    const query = insertNorm(JSON.stringify({ title: 'klein' }));
    const result = splitOversizedInsert(query);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(query);
  });

  it('teilt eine übergroße Anweisung so, dass jeder Teil unter der Grenze bleibt', () => {
    const big = JSON.stringify({ sourceReferences: Array.from({ length: 800 }, (_, index) => ({ url: `https://example.org/${index}`, note: 'Unverortete PDF-Beilage aus dem Exportpaket; eine Zuordnung zur Textstelle ist nicht herstellbar.' })) });
    const result = splitOversizedInsert(insertNorm(big));
    expect(result.length).toBeGreaterThan(1);
    const encoder = new TextEncoder();
    for (const part of result) expect(encoder.encode(renderStatement(part)).byteLength).toBeLessThan(D1_MAX_STATEMENT_BYTES);
    expect(result[0]!.sql).toMatch(/^INSERT INTO law_norms/u);
    for (const part of result.slice(1)) expect(part.sql).toBe('UPDATE law_norms SET meta_json = meta_json || ? WHERE id = ?');
  });

  it('setzt den aufgeteilten Wert in einer echten Datenbank exakt wieder zusammen', () => {
    // Auch mit Umlauten, Apostrophen und mehrbytigen Zeichen: Das Aufteilen darf kein Zeichen
    // zerschneiden und keine Maskierung verlieren.
    const big = JSON.stringify({ text: "Der Bayern-Württembergische Staatsvertrag über die 'Sicherheit' — Gebiet № ".repeat(4_000) });
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE law_norms (id TEXT PRIMARY KEY, jurisdiction TEXT, slug TEXT, meta_json TEXT)');
    for (const part of splitOversizedInsert(insertNorm(big))) db.exec(renderStatement(part));
    const row = db.prepare('SELECT meta_json FROM law_norms WHERE id = ?').get('baywue:gross') as { meta_json: string };
    expect(row.meta_json).toBe(big);
    expect(() => JSON.parse(row.meta_json)).not.toThrow();
  });

  it('teilt nur Tabellen mit bekanntem Schlüssel', () => {
    // Ohne Schlüssel ließe sich die Zeile für die Anhänge nicht wiederfinden. Dann bleibt es beim
    // gemeldeten Fehler – lieber gemeldet als halb geschrieben.
    const query: PlanQuery = { sql: 'INSERT INTO unbekannte_tabelle (a, b) VALUES (?, ?)', params: ['x', 'y'.repeat(200_000)] };
    expect(splitOversizedInsert(query)).toEqual([query]);
  });

  it('teilt auch Fassungen mit zusammengesetztem Schlüssel', () => {
    const query: PlanQuery = {
      sql: 'INSERT INTO law_versions (norm_id, version_id, body_json) VALUES (?, ?, ?)',
      params: ['baywue:gross', '2023-12-01', 'z'.repeat(300_000)],
    };
    const result = splitOversizedInsert(query);
    expect(result.length).toBeGreaterThan(1);
    expect(result[1]!.sql).toBe('UPDATE law_versions SET body_json = body_json || ? WHERE norm_id = ? AND version_id = ?');
    expect(result[1]!.params.slice(1)).toEqual(['baywue:gross', '2023-12-01']);
  });

  it('greift auch beim lokalen Seed, nicht nur in den Remote-Batches', () => {
    // Beide Ausgabewege müssen aufteilen. Stand die Aufteilung nur im Batch-Splitter, nahm die
    // Remote-D1 die Norm an, die lokale Miniflare-D1 lehnte sie mit SQLITE_TOOBIG ab – und der
    // Abgleich lokal ↔ remote war unmöglich.
    const source = readFileSync('packages/runtime/src/projection.ts', 'utf8');
    expect(source).toMatch(/export function renderPlanSql[\s\S]*splitOversizedInsert/u);
  });

  it('beschreibt die D1-Grenze an der Stelle, an der sie gilt', () => {
    expect(D1_MAX_STATEMENT_BYTES).toBe(100_000);
    expect(readFileSync('packages/runtime/src/projection.ts', 'utf8')).toContain('Greift nur oberhalb der Grenze');
  });
});
