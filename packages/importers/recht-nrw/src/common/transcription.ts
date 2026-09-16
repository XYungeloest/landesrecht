/**
 * Strukturierte manuelle Transkriptionen für unvermeidliche PDF- und Scan-Fälle
 * (`data/imports/recht-nrw/transcriptions/term-<id>/<ziel>.json`).
 *
 * Eine Transkription ist nur mit amtlicher Primärquelle zulässig: Quell-URL, SHA-256 des Originals (muss
 * mit dem archivierten Objekt übereinstimmen), Seitenbereich, Transkriptionsdatum, Prüferstatus und
 * Integritätsangaben (Zeichenzahl, SHA-256 des Blockbaums). Verwendet wird sie nur mit Prüferstatus
 * `verified`; sie ist als `structured-transcription` gekennzeichnet und ersetzt nie still einen Text.
 */
import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { parseNormVersion, type NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import { readJsonFile } from './atomic.ts';
import { IMPORT_DATA_DIR, identityFileName } from './manifest.ts';
import { stableStringify } from './stable-json.ts';

export const TRANSCRIPTION_SCHEMA = 'recht-nrw-transcription/1' as const;
export const TRANSCRIPTIONS_DIR = join(IMPORT_DATA_DIR, 'transcriptions');

export interface StructuredTranscription {
  schemaVersion: typeof TRANSCRIPTION_SCHEMA;
  kind: 'structured-transcription';
  sourceIdentity: string;
  target: { type: 'attachment' | 'main-text'; label?: string };
  source: { url: string; sha256: string; mediaType: 'application/pdf'; pageRange: string; pageCount?: number; objectKey?: string; localSource?: string };
  transcribedAt: string;
  transcribedBy?: string;
  review: { status: 'pending' | 'verified' | 'rejected'; reviewedAt?: string; reviewedBy?: string; note?: string };
  integrity: { status: 'unchecked' | 'checked'; checkedAt?: string; characterCount: number; bodySha256: string; method: string };
  body: NormBodyBlock[];
}

function characterCount(blocks: readonly NormBodyBlock[]): number {
  let count = 0;
  const visit = (entries: readonly NormBodyBlock[]): void => {
    for (const block of entries) {
      for (const value of [block.label, block.title, block.text]) if (value) count += value.replace(/\s+/gu, '').length;
      if (block.children) visit(block.children);
    }
  };
  visit(blocks);
  return count;
}

export function transcriptionBodySha256(blocks: readonly NormBodyBlock[]): string {
  return createHash('sha256').update(stableStringify(blocks)).digest('hex');
}

export function transcriptionIntegrity(blocks: readonly NormBodyBlock[]): { characterCount: number; bodySha256: string } {
  return { characterCount: characterCount(blocks), bodySha256: transcriptionBodySha256(blocks) };
}

/** Prüft eine Transkription fail-closed; liefert die Probleme (leer = gültig). */
export function validateTranscription(transcription: StructuredTranscription): string[] {
  const problems: string[] = [];
  if (transcription.schemaVersion !== TRANSCRIPTION_SCHEMA) problems.push(`unbekannte Schemaversion ${transcription.schemaVersion}`);
  if (transcription.kind !== 'structured-transcription') problems.push('kind muss structured-transcription sein');
  if (!/^term:\d+$/u.test(transcription.sourceIdentity ?? '')) problems.push('sourceIdentity muss term:<id> sein');
  if (!transcription.source?.url?.startsWith('https://recht.nrw.de/')) problems.push('Transkription ohne amtliche Primärquelle (source.url auf recht.nrw.de)');
  if (!/^[a-f0-9]{64}$/u.test(transcription.source?.sha256 ?? '')) problems.push('SHA-256 des Originals fehlt');
  const pageRange = transcription.source?.pageRange ?? '';
  if (!/^\d+(?:-\d+)?(?:,\s*\d+(?:-\d+)?)*$/u.test(pageRange)) problems.push('Seitenbereich fehlt oder ist ungültig (z. B. „1-12“)');
  else {
    const pageCount = transcription.source?.pageCount;
    for (const part of pageRange.split(',').map((entry) => entry.trim())) {
      const [start = 0, end = start] = part.split('-').map(Number);
      if (start < 1 || end < start || (pageCount !== undefined && end > pageCount)) problems.push(`Seitenbereich „${part}“ ist nicht plausibel (Beginn ab 1, Ende nicht vor dem Beginn${pageCount !== undefined ? `, höchstens Seite ${pageCount}` : ''})`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}/u.test(transcription.transcribedAt ?? '')) problems.push('Transkriptionsdatum fehlt');
  if (!['pending', 'verified', 'rejected'].includes(transcription.review?.status)) problems.push('Prüferstatus fehlt');
  if (transcription.review?.status === 'verified' && !/^\d{4}-\d{2}-\d{2}/u.test(transcription.review.reviewedAt ?? '')) problems.push('Geprüfte Transkription ohne Prüfdatum');
  if (transcription.target?.type === 'attachment' && !transcription.target.label) problems.push('Anlagen-Transkription ohne Anlagenbezeichnung');
  if (!Array.isArray(transcription.body) || transcription.body.length === 0) problems.push('leerer Normkörper');
  else {
    try {
      parseNormVersion({ versionId: '2023-12-01', simulationValidFrom: '2023-12-01', simulationValidTo: null, citation: 'Transkription', changeNote: 'Transkription', body: transcription.body }, 'transcription');
    } catch (error) {
      problems.push(`Blockstruktur ungültig: ${(error as Error).message}`);
    }
    const integrity = transcriptionIntegrity(transcription.body);
    if (transcription.integrity?.characterCount !== integrity.characterCount) problems.push(`Integrität: Zeichenzahl ${transcription.integrity?.characterCount} ≠ ${integrity.characterCount}`);
    if (transcription.integrity?.bodySha256 !== integrity.bodySha256) problems.push('Integrität: SHA-256 des Blockbaums weicht ab');
  }
  return problems;
}

/** Ob eine Transkription für das abgerufene Original verwendet werden darf. */
export function usableTranscription(transcription: StructuredTranscription, original: { sha256: string }): { ok: boolean; reason: string } {
  const problems = validateTranscription(transcription);
  if (problems.length > 0) return { ok: false, reason: problems.join('; ') };
  if (transcription.review.status !== 'verified') return { ok: false, reason: `Prüferstatus ${transcription.review.status}` };
  if (transcription.integrity.status !== 'checked') return { ok: false, reason: 'Integrität nicht geprüft' };
  if (transcription.source.sha256 !== original.sha256) return { ok: false, reason: 'Original weicht vom transkribierten Dokument ab (SHA-256)' };
  return { ok: true, reason: `geprüfte Transkription (Seiten ${transcription.source.pageRange}, ${transcription.integrity.characterCount} Zeichen)` };
}

export async function readTranscriptions(root: string, sourceIdentity: string): Promise<StructuredTranscription[]> {
  const directory = join(root, TRANSCRIPTIONS_DIR, identityFileName(sourceIdentity));
  let files: string[];
  try {
    files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
  } catch {
    return [];
  }
  const result: StructuredTranscription[] = [];
  for (const file of files) {
    const transcription = await readJsonFile<StructuredTranscription>(join(directory, file));
    if (transcription) result.push(transcription);
  }
  return result;
}
