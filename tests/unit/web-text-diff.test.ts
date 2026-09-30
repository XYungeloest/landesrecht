import { describe, expect, it } from 'vitest';
import { textDiff } from '../../apps/web/src/lib/text-diff.ts';

describe('Darstellungsdiff ohne Veränderung des Wortlauts', () => {
  it.each([
    ['', 'Neu'], ['Entfallen', ''], ['', ''], ['unverändert', 'unverändert'],
    ['(1) Fünf Mitglieder.\n(2) Zwei Stimmen.', '(1) Sieben Mitglieder.\n(2) Drei Stimmen.'],
    ['<script> & alte Fassung', '<script> & neue Fassung'],
    ['a b a b', 'b a b a'],
    ['Anfang ' + 'alt '.repeat(900) + ' Ende', 'Anfang ' + 'neu '.repeat(900) + ' Ende'],
  ])('erhält beide Originaltexte vollständig (%#)', (before, after) => {
    const diff = textDiff(before, after);
    expect(diff.before.map((part) => part.text).join('')).toBe(before);
    expect(diff.after.map((part) => part.text).join('')).toBe(after);
    expect(diff.before.filter((part) => !part.changed).map((part) => part.text).join('')).toBe(diff.after.filter((part) => !part.changed).map((part) => part.text).join(''));
  });

  it('markiert getrennte Änderungen, ohne identische Zwischenstücke zu streichen', () => {
    const diff = textDiff('Fünf Mitglieder und zwei Stimmen.', 'Sieben Mitglieder und drei Stimmen.');
    expect(diff.before.filter((part) => part.changed).map((part) => part.text)).toEqual(['Fünf', 'zwei']);
    expect(diff.after.filter((part) => part.changed).map((part) => part.text)).toEqual(['Sieben', 'drei']);
  });
});

// Static guard for the print-only requirements; interaction and layout are checked in the browser.
import { readFileSync } from 'node:fs';
it('behält im Druck den Dokumenttext und blendet Werkzeuge aus', () => {
  const css = readFileSync(new URL('../../apps/web/src/styles/base.css', import.meta.url), 'utf8');
  const printRules = [...css.matchAll(/@media print\s*\{([\s\S]*?)(?=\n\}\n)/gu)].map((match) => match[1]).join('\n');
  for (const selector of ['.site-header', '.norm-tabs', '.norm-outline', '.sim-banner__actions', '.copy-action']) {
    const rule = printRules.split('}').find((part) => part.includes(selector));
    expect(rule, selector).toMatch(/display:\s*none/u);
  }
  expect(printRules).toContain('break-after: avoid');
  expect(printRules).not.toMatch(/\.norm-document[^}]*display:\s*none/u);
  expect(printRules).not.toMatch(/\.sim-banner\s*\{[^}]*display:\s*none/u);
});
