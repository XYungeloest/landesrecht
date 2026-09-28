/**
 * Inventarisierung des Sim-Quellarchivs: Jede echte Datei wird gehasht, unverändert in den Cache kopiert,
 * textextrahiert und vorsortiert. Dubletten gelten nur bei identischem SHA-256; ähnlich benannte Dateien
 * bleiben getrennte Quellen. Der Container `Archiv.zip` wird gegen den Ordnerinhalt abgeglichen.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative } from 'node:path';

import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';

import { ARCHIVE_CONTAINER, ARCHIVE_DIR, ARCHIVE_FOLDERS, CACHE_ARCHIVE_DIR, CACHE_TEXT_DIR, IGNORED_ARCHIVE_DIRECTORIES, IGNORED_ARCHIVE_ENTRIES } from '../common/paths.ts';
import { detectFacts, type DetectedFacts } from './detect.ts';
import { extractDocx, extractPdf, extractPlainText, mediaTypeFor, type ExtractedText, type TextLayerStatus } from './extract.ts';
import { listZipEntries } from './zip.ts';

export const INVENTORY_SCHEMA = 'landesrecht-simulation-source-inventory/1' as const;

export interface InventorySource {
  /** Stabile Kennung: SHA-256 der Datei. Dubletten teilen die Kennung und sind unter `paths` zusammengeführt. */
  sha256: string;
  /** Alle Archivpfade mit diesem Inhalt (relativ zu `imports/`). */
  paths: string[];
  fileName: string;
  jurisdictionCandidate: JurisdictionId;
  mediaType: string;
  byteLength: number;
  pageCount?: number;
  textLayer: TextLayerStatus;
  charactersPerPage?: number;
  extraction: { tool: string; textPath: string; layoutPath: string };
  pdfInfo?: { title?: string; producer?: string; creator?: string; creationDate?: string };
  detected: DetectedFacts;
}

export interface InventoryContainerCheck {
  file: string;
  present: boolean;
  entries?: number;
  /** Einträge des Zips, die im Ordner fehlen, und umgekehrt (nach Dateiname, nur Hinweis). */
  onlyInContainer?: string[];
  onlyInFolder?: string[];
}

export interface SourceInventory {
  schemaVersion: typeof INVENTORY_SCHEMA;
  archiveDir: string;
  scannedAt: string;
  tools: Record<string, string>;
  totals: { files: number; sources: number; duplicateFiles: number; byJurisdiction: Record<string, number>; byMediaType: Record<string, number>; byTextLayer: Record<string, number>; byDocumentType: Record<string, number> };
  container: InventoryContainerCheck;
  sources: InventorySource[];
}

interface ArchiveFile {
  absolute: string;
  relativePath: string;
  jurisdiction: JurisdictionId;
}

async function walkArchive(root: string): Promise<ArchiveFile[]> {
  const archiveRoot = join(root, ARCHIVE_DIR);
  const files: ArchiveFile[] = [];
  for (const folder of await readdir(archiveRoot, { withFileTypes: true })) {
    if (!folder.isDirectory() || IGNORED_ARCHIVE_DIRECTORIES.has(folder.name)) continue;
    const jurisdiction = ARCHIVE_FOLDERS[folder.name.normalize('NFC')] ?? ARCHIVE_FOLDERS[folder.name];
    if (!jurisdiction) throw new Error(`Archivordner ${folder.name} ist keiner Jurisdiktion zugeordnet (ARCHIVE_FOLDERS)`);
    const walk = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (IGNORED_ARCHIVE_ENTRIES.has(entry.name) || entry.name.startsWith('._')) continue;
        const absolute = join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!IGNORED_ARCHIVE_DIRECTORIES.has(entry.name)) await walk(absolute);
          continue;
        }
        if (!entry.isFile()) continue;
        files.push({ absolute, relativePath: relative(archiveRoot, absolute).normalize('NFC'), jurisdiction });
      }
    };
    await walk(join(archiveRoot, folder.name));
  }
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'de'));
}

async function checkContainer(root: string, folderFiles: readonly ArchiveFile[]): Promise<InventoryContainerCheck> {
  const file = join(root, ARCHIVE_DIR, ARCHIVE_CONTAINER);
  try {
    await stat(file);
  } catch {
    return { file: `${ARCHIVE_DIR}/${ARCHIVE_CONTAINER}`, present: false };
  }
  const names = (await listZipEntries(file))
    .filter((name) => !name.endsWith('/') && !name.includes('__MACOSX') && !name.endsWith('.DS_Store'))
    .map((name) => basename(name));
  const inContainer = new Set(names);
  const inFolder = new Set(folderFiles.map((entry) => basename(entry.relativePath)));
  return {
    file: `${ARCHIVE_DIR}/${ARCHIVE_CONTAINER}`,
    present: true,
    entries: names.length,
    onlyInContainer: [...inContainer].filter((name) => !inFolder.has(name)).sort(),
    onlyInFolder: [...inFolder].filter((name) => !inContainer.has(name)).sort(),
  };
}

async function extract(absolute: string, mediaType: string, bytes: Uint8Array): Promise<ExtractedText> {
  if (mediaType === 'application/pdf') return extractPdf(absolute);
  if (mediaType.endsWith('wordprocessingml.document')) return extractDocx(absolute);
  if (mediaType.startsWith('text/')) return extractPlainText(bytes);
  return { layout: '', raw: '', textLayer: 'none', tool: 'keine Extraktion', charactersPerPage: 0 };
}

function count<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) result[key(item)] = (result[key(item)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

export async function scanArchive(root: string, options: { log?: (line: string) => void } = {}): Promise<SourceInventory> {
  const files = await walkArchive(root);
  await mkdir(join(root, CACHE_ARCHIVE_DIR), { recursive: true });
  await mkdir(join(root, CACHE_TEXT_DIR), { recursive: true });
  const bySha = new Map<string, InventorySource>();
  const tools: Record<string, string> = {};
  let duplicateFiles = 0;
  for (const file of files) {
    const bytes = new Uint8Array(await readFile(file.absolute));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const existing = bySha.get(sha256);
    if (existing) {
      existing.paths.push(file.relativePath);
      duplicateFiles += 1;
      options.log?.(`Dublette (hashidentisch): ${file.relativePath} = ${existing.paths[0]}`);
      continue;
    }
    const mediaType = mediaTypeFor(file.relativePath, bytes);
    const extension = (extname(file.relativePath).slice(1) || 'bin').toLowerCase();
    const archived = join(root, CACHE_ARCHIVE_DIR, `${sha256}.${extension}`);
    try {
      await stat(archived);
    } catch {
      await writeFile(archived, bytes);
    }
    const extracted = await extract(file.absolute, mediaType, bytes);
    tools[extracted.tool] = extracted.tool;
    const textPath = `${CACHE_TEXT_DIR}/${sha256}.txt`;
    const layoutPath = `${CACHE_TEXT_DIR}/${sha256}.layout.txt`;
    await writeFile(join(root, textPath), extracted.raw, 'utf8');
    await writeFile(join(root, layoutPath), extracted.layout, 'utf8');
    const detected = detectFacts(extracted.layout, file.relativePath);
    const info = extracted.pdfInfo;
    bySha.set(sha256, {
      sha256,
      paths: [file.relativePath],
      fileName: basename(file.relativePath),
      jurisdictionCandidate: file.jurisdiction,
      mediaType,
      byteLength: bytes.byteLength,
      ...(extracted.pageCount !== undefined ? { pageCount: extracted.pageCount } : {}),
      textLayer: extracted.textLayer,
      ...(extracted.charactersPerPage !== undefined ? { charactersPerPage: extracted.charactersPerPage } : {}),
      extraction: { tool: extracted.tool, textPath, layoutPath },
      ...(info ? { pdfInfo: { ...(info.Title ? { title: info.Title } : {}), ...(info.Producer ? { producer: info.Producer } : {}), ...(info.Creator ? { creator: info.Creator } : {}), ...(info.CreationDate ? { creationDate: info.CreationDate } : {}) } } : {}),
      detected,
    });
    options.log?.(`${file.jurisdiction.padEnd(6)} ${sha256.slice(0, 12)} ${extracted.textLayer.padEnd(6)} ${String(extracted.pageCount ?? '-').padStart(3)} S. ${detected.documentType.padEnd(24)} ${file.relativePath}`);
  }
  const sources = [...bySha.values()].sort((left, right) => left.paths[0]!.localeCompare(right.paths[0]!, 'de'));
  return {
    schemaVersion: INVENTORY_SCHEMA,
    archiveDir: ARCHIVE_DIR,
    scannedAt: new Date().toISOString().slice(0, 10),
    tools,
    totals: {
      files: files.length,
      sources: sources.length,
      duplicateFiles,
      byJurisdiction: count(sources, (source) => source.jurisdictionCandidate),
      byMediaType: count(sources, (source) => source.mediaType),
      byTextLayer: count(sources, (source) => source.textLayer),
      byDocumentType: count(sources, (source) => source.detected.documentType),
    },
    container: await checkContainer(root, files),
    sources,
  };
}
