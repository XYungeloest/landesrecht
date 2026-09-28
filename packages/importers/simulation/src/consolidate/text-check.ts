/**
 * Wortlautprobe eines Sim-Akts: der Text jedes Blocks der transkribierten Fassung muss im Textauszug der
 * Quelle (`.cache/simulation/text/<sha256>.txt` bzw. `.layout.txt`) vorkommen. Das ist die Sicherung gegen
 * falsche oder erfundene Transkription; sie ersetzt keine Sichtprüfung.
 *
 * Normalisierung (beide Seiten): U+200B entfernt, Trennstrich + Zeilenumbruch verbunden, Leerraum gebündelt.
 * Scheitert das, gilt ein Block noch als „lose“ gefunden, wenn er ohne jeden Leerraum und ohne Binde-/
 * Gedankenstriche im Quelltext vorkommt (Silbentrennung an echten Bindestrichen, Zeilenumbrüche in Tabellen).
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

export interface BlockText {
  path: string;
  text: string;
}

export interface TextCheckResult {
  /** Anzahl geprüfter Textstellen (Blockfelder `text` und `title`). */
  blocks: number;
  found: number;
  /** Nur über die lose Skelettprobe gefunden (Leerraum und Striche ignoriert). */
  foundLoosely: number;
  missing: BlockText[];
}

const ZERO_WIDTH = /[​­]/gu;

/** Normalisierung nach Vorgabe: U+200B weg, Trennstrich + Zeilenumbruch verbunden, Leerraum gebündelt. */
export function normalizeWording(text: string): string {
  return text
    .normalize('NFC')
    .replace(ZERO_WIDTH, '')
    .replace(/-\r?\n[ \t]*/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Lose Skelettform: ohne Leerraum, ohne Binde-, Trenn- und Gedankenstriche. */
export function skeletonWording(text: string): string {
  return text.normalize('NFC').replace(ZERO_WIDTH, '').replace(/[\s\-‐‑‒–—]/gu, '');
}

/** Alle Textstellen eines Körpers (Felder `text` und `title`), mit Pfad für Meldungen. */
export function collectBlockTexts(blocks: readonly NormBodyBlock[], path = 'body'): BlockText[] {
  const texts: BlockText[] = [];
  blocks.forEach((block, index) => {
    const here = `${path}[${index}]`;
    if (block.title) texts.push({ path: `${here}.title`, text: block.title });
    if (block.text) texts.push({ path: `${here}.text`, text: block.text });
    if (block.children) texts.push(...collectBlockTexts(block.children, `${here}.children`));
  });
  return texts;
}

export function checkWording(blocks: readonly NormBodyBlock[], sources: readonly string[]): TextCheckResult {
  const normalized = sources.map(normalizeWording);
  const skeletons = sources.map(skeletonWording);
  const result: TextCheckResult = { blocks: 0, found: 0, foundLoosely: 0, missing: [] };
  for (const entry of collectBlockTexts(blocks)) {
    result.blocks += 1;
    const needle = normalizeWording(entry.text);
    if (!needle) continue;
    if (normalized.some((source) => source.includes(needle))) {
      result.found += 1;
      continue;
    }
    const skeleton = skeletonWording(entry.text);
    if (skeleton && skeletons.some((source) => source.includes(skeleton))) {
      result.found += 1;
      result.foundLoosely += 1;
      continue;
    }
    result.missing.push({ path: entry.path, text: entry.text.length > 120 ? `${entry.text.slice(0, 117)}…` : entry.text });
  }
  return result;
}
