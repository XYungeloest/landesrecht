/**
 * Beispielkorpus des BAYERN.RECHT-Adapters: Auswahl, Paketprüfung und Abdeckung.
 *
 * Die Pakete unter `tests/fixtures/bayernrecht/paket-*.zip` sind **echte, unveränderte Exporte** des
 * Portals – je eines der beiden DTDs, bewusst die kleinsten des Korpus. Was der Paketleser hier
 * falsch macht, macht er auch an den 3,2 MB des Kostenverzeichnisses falsch.
 *
 * Kein Test geht ins Netz.
 */
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { findNormXmlEntry, inspectPackage, maxNestingDepth, STRUCTURE_CASES, type StructureCase } from '@landesrecht/importer-bayernrecht/corpus/inspect.ts';
import { corpusPackagePath, corpusSidecarPath, CORPUS_EXTREMES, CORPUS_PATH, CORPUS_SOURCE_DIR } from '@landesrecht/importer-bayernrecht/corpus/run.ts';
import { checkCoverage, CORPUS, CORPUS_MAXIMUM, corpusDocumentIds, COVERAGE_REQUIREMENTS, duplicateCorpusIds, type CoverageInput } from '@landesrecht/importer-bayernrecht/corpus/selection.ts';
import { readZipDirectory, readZipEntry, readZipEntryText } from '@landesrecht/importer-bayernrecht/corpus/zip.ts';
import { SOURCE_AREAS } from '@landesrecht/importer-bayernrecht/common/constants.ts';

const FIXTURES = new URL('../fixtures/bayernrecht/', import.meta.url);
const packageBytes = async (name: string): Promise<Uint8Array> => new Uint8Array(await readFile(new URL(name, FIXTURES)));

const NORM_PACKAGE = 'paket-byrecht-norm-BayBwEgauquVertr.zip';
const VV_PACKAGE = 'paket-byrecht-vv-BayVV_631_J_10511.zip';

describe('Paketleser (ZIP)', () => {
  it('liest das zentrale Verzeichnis eines echten Exportpakets', async () => {
    const directory = readZipDirectory(await packageBytes(NORM_PACKAGE));
    expect(directory.map((entry) => entry.name)).toEqual(['bayportalnorm/BayBwEgauquVertr.xml', 'META-INF/manifest.xml', 'mimetype']);
    expect(directory.every((entry) => entry.uncompressedSize > 0)).toBe(true);
  });

  it('packt Einträge aus und schneidet die BOM des XML ab', async () => {
    const bytes = await packageBytes(NORM_PACKAGE);
    const directory = readZipDirectory(bytes);
    const mimetype = directory.find((entry) => entry.name === 'mimetype')!;
    expect(readZipEntryText(bytes, mimetype).trim()).toBe('bayportalnorm+zip');
    const xml = readZipEntryText(bytes, findNormXmlEntry(directory));
    expect(xml.startsWith('﻿')).toBe(false);
    expect(xml).toContain('<!DOCTYPE byrecht-norm');
    // Die Rohbytes tragen die BOM – abgeschnitten wird nur im Text, nicht in der Quelle.
    expect(readZipEntry(bytes, findNormXmlEntry(directory)).slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]));
  });

  it('weist kaputte Pakete zurück, statt sie halb zu lesen', async () => {
    expect(() => readZipDirectory(new Uint8Array(64))).toThrow(/Kein ZIP-Paket/u);
    const bytes = await packageBytes(NORM_PACKAGE);
    const truncated = bytes.slice(0, bytes.byteLength - 1);
    expect(() => readZipDirectory(truncated)).toThrow();
  });

  it('erwartet genau ein Normdokument je Paket', () => {
    expect(() => findNormXmlEntry([{ name: 'META-INF/manifest.xml', compressedSize: 1, uncompressedSize: 1, method: 0, offset: 0 }])).toThrow(/ohne Normdokument/u);
    const two = [
      { name: 'a/x.xml', compressedSize: 1, uncompressedSize: 1, method: 0, offset: 0 },
      { name: 'b/y.xml', compressedSize: 1, uncompressedSize: 1, method: 0, offset: 0 },
    ];
    expect(() => findNormXmlEntry(two)).toThrow(/2 Normdokumenten/u);
  });
});

describe('Strukturprüfung eines Pakets', () => {
  it('erkennt am echten Norm-Paket DTD, Verweise, Fußnoten und leere Pflichtfelder', async () => {
    const inspection = inspectPackage(await packageBytes(NORM_PACKAGE));
    expect(inspection.mimetype).toBe('bayportalnorm+zip');
    expect(inspection.doctype).toBe('byrecht-norm');
    expect(inspection.buildDate).toMatch(/^\d{2}\.\d{2}\.\d{4}_\d{2}:\d{2}$/u);
    expect(inspection.xmlPath).toBe('bayportalnorm/BayBwEgauquVertr.xml');
    expect(inspection.pdfAttachments).toBe(0);
    expect(inspection.imageAttachments).toBe(0);
    expect(inspection.cases).toContain('dtd-byrecht-norm');
    expect(inspection.cases).toContain('fussnoten');
    expect(inspection.cases).toContain('verweise');
    expect(inspection.cases).toContain('leere-metadaten');
    expect(inspection.cases).not.toContain('dtd-byrecht-vv');
    expect(inspection.cases).not.toContain('tabellen');
    expect(inspection.counts.footnotes).toBeGreaterThan(0);
    expect(inspection.counts.table).toBe(0);
  });

  it('erkennt am echten VV-Paket die zweite DTD, hochgestellte Satznummern und das fehlende builddate', async () => {
    const inspection = inspectPackage(await packageBytes(VV_PACKAGE));
    expect(inspection.mimetype).toBe('bayportalvv+zip');
    expect(inspection.doctype).toBe('byrecht-vv');
    expect(inspection.buildDate).toBeUndefined();
    expect(inspection.cases).toContain('dtd-byrecht-vv');
    expect(inspection.cases).toContain('satznummern-hochgestellt');
    expect(inspection.cases).toContain('kein-builddate');
    // Das Norm-Modell kennt <satz.nr>; die VV-DTD nicht – der Fall darf nicht doppelt gemeldet werden.
    expect(inspection.cases).not.toContain('satznummern');
    expect(inspection.counts.superscripts).toBeGreaterThan(0);
    expect(inspection.counts.sentenceNumbers).toBe(0);
  });

  it('meldet jeden Fall nur aus dem Vokabular der Strukturfälle', async () => {
    for (const name of [NORM_PACKAGE, VV_PACKAGE]) {
      const inspection = inspectPackage(await packageBytes(name));
      expect(inspection.cases.every((value) => (STRUCTURE_CASES as readonly string[]).includes(value))).toBe(true);
      expect(new Set(inspection.cases).size).toBe(inspection.cases.length);
    }
  });

  it('zählt die Schachtelungstiefe und übersieht selbstschließende Marken nicht', () => {
    expect(maxNestingDepth('<gliederung><gliederung></gliederung></gliederung>', 'gliederung')).toBe(2);
    expect(maxNestingDepth('<gliederung></gliederung><gliederung></gliederung>', 'gliederung')).toBe(1);
    expect(maxNestingDepth('<gliederung />', 'gliederung')).toBe(0);
    expect(maxNestingDepth('<p>ohne</p>', 'gliederung')).toBe(0);
  });
});

describe('Auswahl des Beispielkorpus', () => {
  it('bleibt im Auftragsrahmen und ist in sich schlüssig', () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(25);
    expect(CORPUS.length).toBeLessThanOrEqual(CORPUS_MAXIMUM);
    expect(duplicateCorpusIds()).toEqual([]);
    expect(corpusDocumentIds()).toHaveLength(CORPUS.length);
    for (const candidate of CORPUS) {
      expect(SOURCE_AREAS).toContain(candidate.sourceArea);
      expect(candidate.sourceArea).not.toBe('events');
      // Jede Norm nennt ihren Grund, und zwar in Sätzen, nicht in Stichworten.
      expect(candidate.reason.length).toBeGreaterThan(40);
      expect(candidate.expectedCases.length).toBeGreaterThan(0);
      expect(candidate.expectedCases.every((value) => (STRUCTURE_CASES as readonly string[]).includes(value))).toBe(true);
    }
  });

  it('enthält die Pflichtstücke des Auftrags', () => {
    const ids = corpusDocumentIds();
    expect(ids).toContain('BayVerf');
    // Die vier Referenzinstanzen der Quellen-Discovery bleiben nachprüfbar.
    for (const id of ['BayAbmG', 'BayVerf', 'BayKVzKG', 'BayVwV312180']) expect(ids).toContain(id);
    expect(CORPUS.filter((candidate) => candidate.sourceArea === 'vwv').length).toBeGreaterThanOrEqual(3);
    expect(CORPUS.filter((candidate) => candidate.expectedCases.includes('dtd-byrecht-vv')).length).toBeGreaterThanOrEqual(3);
    expect(CORPUS.some((candidate) => candidate.expectedCases.includes('tabellen'))).toBe(true);
    expect(CORPUS.some((candidate) => candidate.expectedCases.includes('anlagen-strukturiert'))).toBe(true);
    expect(CORPUS.some((candidate) => candidate.expectedCases.includes('fussnoten'))).toBe(true);
    expect(CORPUS.some((candidate) => candidate.expectedCases.includes('aufgehobene-vorschriften'))).toBe(true);
  });

  it('misst die Abdeckung an den geprüften Befunden, nicht an der Erwartung', () => {
    const entry = (documentId: string, normType: CoverageInput['normType'], cases: StructureCase[], changedAfterBaseline?: boolean): CoverageInput => ({ documentId, normType, cases, ...(changedAfterBaseline === undefined ? {} : { changedAfterBaseline }) });
    const complete: CoverageInput[] = [
      entry('BayVerf', 'ges', ['dtd-byrecht-norm', 'aufgehobene-vorschriften', 'fussnoten'], false),
      entry('G2', 'ges', ['dtd-byrecht-norm', 'tabellen'], true),
      entry('G3', 'ges', ['dtd-byrecht-norm'], true),
      entry('G4', 'ges', ['dtd-byrecht-norm'], false),
      entry('R1', 'rv', ['dtd-byrecht-norm', 'anlagen-strukturiert', 'anlagen-pdf']),
      entry('R2', 'rv', ['dtd-byrecht-norm', 'bildbeilagen']),
      entry('R3', 'rv', ['dtd-byrecht-norm']),
      entry('V1', 'vertr', ['dtd-byrecht-norm']),
      ...Array.from({ length: 17 }, (_unused, index) => entry(`W${index}`, 'vv', ['dtd-byrecht-vv'])),
    ];
    const ok = checkCoverage(complete);
    expect(ok.every((requirement) => requirement.ok)).toBe(true);
    expect(ok.map((requirement) => requirement.id)).toEqual(COVERAGE_REQUIREMENTS.map((requirement) => requirement.id));

    // Fehlt ein Fall, sagt die Prüfung genau, welcher – und rundet nicht auf.
    const withoutTables = checkCoverage(complete.map((candidate) => ({ ...candidate, cases: candidate.cases.filter((value) => value !== 'tabellen') })));
    const tables = withoutTables.find((requirement) => requirement.id === 'fall-tabellen')!;
    expect(tables.ok).toBe(false);
    expect(tables.actual).toBe(0);
    expect(withoutTables.filter((requirement) => !requirement.ok)).toHaveLength(1);
  });

  it('legt jede Rohquelle unter sources/bayernrecht/<id>/ mit Begleitdatei ab', () => {
    expect(corpusPackagePath('BayVerf')).toBe('sources/bayernrecht/BayVerf/BayVerf.zip');
    expect(corpusSidecarPath('BayVerf')).toBe('sources/bayernrecht/BayVerf/BayVerf.source.json');
    expect(CORPUS_SOURCE_DIR).toBe('sources/bayernrecht');
    expect(CORPUS_PATH).toBe('data/imports/bayernrecht/corpus.json');
    expect(CORPUS_EXTREMES).toContain('kuerzestes-gesetz');
    expect(CORPUS_EXTREMES).toContain('laengstes-gesetz');
  });
});
