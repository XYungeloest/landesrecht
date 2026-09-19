/**
 * Amtliche Abkürzungen des Bestands (Kopf „Amtliche Abkürzung“ der ersten Seite jeder PDF-Gesamtausgabe) und im
 * Bestand eingeführte Abkürzungen einer Bezeichnung mit dem Landesnamen („… Schleswig-Holstein (ZIT SH)“) – Grundlage
 * der Abkürzungsregel der Überleitung (Version 1.1.0): Eine Abkürzung mit abgesetztem Landeskürzel („MBG Schl.-H.“,
 * „LStVollzG SH“) bezeichnet eindeutig eine Norm des Landes und wird überall im Bestand auf „NSH“ übergeleitet.
 *
 * Netzfrei aus dem Cache; das Ergebnis liegt versioniert unter `data/imports/juris-sh/official-abbreviations.json`
 * (je Dokument SHA-256 der Ausgabe und Abkürzung), damit Stichprobe, Inventur und Bulk dieselbe Menge benutzen und ein
 * Wiederholungslauf nur geänderte Ausgaben neu liest.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readJsonFile, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { cacheKey } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';

import { CACHE_DIR, IMPORT_DATA_DIR } from '../common/constants.ts';
import { ENUMERABLE_AREAS, readEnumeration } from '../enumerate/enumeration.ts';
import { pdfExportUrl } from '../export/client.ts';
import { sha256Hex } from '../r2/archive.ts';
import { definedStateAbbreviations, isStateAbbreviation } from '../transform/rules.ts';

export const OFFICIAL_ABBREVIATIONS_PATH = `${IMPORT_DATA_DIR}/official-abbreviations.json`;
export const OFFICIAL_ABBREVIATIONS_SCHEMA = 'juris-sh-official-abbreviations/2' as const;

export interface OfficialAbbreviationEntry {
  documentId: string;
  sha256: string;
  abbreviation?: string;
  /** Im Text eingeführte Abkürzungen mit Landeskürzel („… Schleswig-Holstein (LVermGeo SH)“). */
  definitions?: string[];
}

export interface OfficialAbbreviationsFile {
  schemaVersion: typeof OFFICIAL_ABBREVIATIONS_SCHEMA;
  entries: OfficialAbbreviationEntry[];
}

/** „Amtliche Abkürzung: …“ der ersten Seite; „-“ und leere Werte zählen nicht. */
export function officialAbbreviationFromText(text: string): string | undefined {
  const value = /Amtliche Abkürzung:\s*(.+)/u.exec(text)?.[1]?.replace(/\s{2,}.*$/u, '').trim();
  return value && value !== '-' ? value : undefined;
}

export async function collectOfficialAbbreviations(root: string, options: { write?: boolean } = {}): Promise<{ file: OfficialAbbreviationsFile; known: Set<string>; written: boolean }> {
  const previous = await readJsonFile<OfficialAbbreviationsFile>(join(root, OFFICIAL_ABBREVIATIONS_PATH));
  const bySha = new Map((previous?.entries ?? []).map((entry) => [`${entry.documentId}:${entry.sha256}`, entry]));
  const entries: OfficialAbbreviationEntry[] = [];
  for (const area of ENUMERABLE_AREAS) {
    const enumeration = await readEnumeration(root, area);
    for (const item of enumeration?.items ?? []) {
      const path = join(root, CACHE_DIR, `${cacheKey(pdfExportUrl(item.key, 'gesamtausgabe'))}.bin`);
      if (!existsSync(path)) continue;
      const sha256 = sha256Hex(new Uint8Array(readFileSync(path)));
      const cached = bySha.get(`${item.key}:${sha256}`);
      if (cached) {
        entries.push(cached);
        continue;
      }
      const first = spawnSync('pdftotext', ['-f', '1', '-l', '1', '-layout', '-enc', 'UTF-8', path, '-'], { encoding: 'utf8', timeout: 60_000, killSignal: 'SIGKILL' });
      const abbreviation = area === 'landesrecht' && first.status === 0 ? officialAbbreviationFromText(first.stdout) : undefined;
      // Volltext (Lesereihenfolge, Silbentrennung zusammengeführt) für eingeführte Abkürzungen.
      const full = spawnSync('pdftotext', ['-enc', 'UTF-8', path, '-'], { encoding: 'utf8', timeout: 120_000, killSignal: 'SIGKILL', maxBuffer: 256 * 1024 * 1024 });
      const text = full.status === 0 ? full.stdout.replace(/(\p{Ll})-\n(\p{Ll})/gu, '$1$2') : '';
      const definitions = [...definedStateAbbreviations(text.split(/\n{2,}/u))].sort();
      entries.push({ documentId: item.key, sha256, ...(abbreviation ? { abbreviation } : {}), ...(definitions.length ? { definitions } : {}) });
    }
  }
  entries.sort((left, right) => (left.documentId < right.documentId ? -1 : 1));
  const file: OfficialAbbreviationsFile = { schemaVersion: OFFICIAL_ABBREVIATIONS_SCHEMA, entries };
  const known = knownFrom(entries);
  const written = options.write ? await writeJsonAtomic(join(root, OFFICIAL_ABBREVIATIONS_PATH), file) : false;
  return { file, known, written };
}

/** Bekannte Abkürzungen: amtliche Abkürzungen und im Bestand eingeführte Abkürzungen mit abgesetztem Landeskürzel. */
export function knownFrom(entries: readonly OfficialAbbreviationEntry[]): Set<string> {
  const values = entries.flatMap((entry) => [...(entry.abbreviation ? [entry.abbreviation] : []), ...(entry.definitions ?? [])]);
  const known = new Set(values.filter((value) => isStateAbbreviation(value)));
  // Amtliche Abkürzung ohne Landeskürzel mit angehängtem Kürzel im Text („LBG SH“, „LDSG-SH“): Der Stamm ist die
  // amtliche Abkürzung einer Norm des Bestands – wie West („VwVfG NRW“ → „VwVfG West“). Nur Stämme, die als
  // Abkürzung erkennbar sind (mindestens drei Zeichen, zwei Großbuchstaben).
  for (const entry of entries) {
    const stem = entry.abbreviation?.trim();
    if (!stem || isStateAbbreviation(stem) || stem.length < 3 || [...stem].filter((character) => /[A-ZÄÖÜ]/u.test(character)).length < 2) continue;
    if (isStateAbbreviation(`${stem} SH`)) known.add(`${stem} SH`);
  }
  return known;
}

/** Liest die versionierte Menge (Stichprobe); fehlt sie, wird sie aus dem Cache berechnet, nicht geraten. */
export async function readKnownStateAbbreviations(root: string): Promise<Set<string>> {
  const stored = await readJsonFile<OfficialAbbreviationsFile>(join(root, OFFICIAL_ABBREVIATIONS_PATH));
  if (stored?.schemaVersion === OFFICIAL_ABBREVIATIONS_SCHEMA) return knownFrom(stored.entries);
  return (await collectOfficialAbbreviations(root)).known;
}
