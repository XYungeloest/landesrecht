/**
 * Härtung des RECHT.NRW-Imports (ohne Netz): Erlassorgane nur aus ausdrücklichen Formeln,
 * Erkennung vor der Transformation, Prüfung nach der Transformation, getrennte Fundstellen.
 */
import { describe, expect, it } from 'vitest';

import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { SourceLaw } from '@landesrecht/importer-common/pipeline.ts';
import { auditTransformation, detectReferences } from '@landesrecht/importer-recht-nrw/transform/detection.ts';
import { extractSourceOrgans, mapEnactingBody, nominativeOrganName } from '@landesrecht/importer-recht-nrw/transform/organs.ts';
import { planTransformation } from '@landesrecht/importer-recht-nrw/transform/rules.ts';
import { transformText, transformToWest, type TransformationChange } from '@landesrecht/importer-recht-nrw/transform/transform.ts';

const context = { targetJurisdiction: 'west' as const, baselineDate: SIMULATION_BASELINE_DATE, reserveSlug: (slug: string): string => slug };

function sourceLaw(overrides: Partial<SourceLaw> = {}): SourceLaw {
  return {
    portal: 'recht-nrw',
    externalIdentifiers: [{ system: 'recht-nrw', value: 'term:1' }],
    title: 'Testverordnung Nordrhein-Westfalen',
    abbr: 'TestVO NRW',
    type: 'verordnung',
    citation: 'Testverordnung Nordrhein-Westfalen vom 1. Januar 2020 (GV. NRW. S. 1)',
    fullCitation: 'Testverordnung Nordrhein-Westfalen vom 1. Januar 2020 (GV. NRW. S. 1), zuletzt geändert durch Verordnung vom 2. Mai 2022 (GV. NRW. S. 99)',
    subjects: [],
    keywords: [],
    body: [
      { type: 'paragraphText', text: 'Auf Grund des § 5 des Testgesetzes vom 3. März 2019 (GV. NRW. S. 50) verordnet das Ministerium für Kinder, Familie, Flüchtlinge und Integration mit Zustimmung des Ministeriums der Finanzen:' },
      { type: 'paragraph', label: '§ 1', title: 'Zweck', children: [{ type: 'paragraphText', text: 'Das Land Nordrhein-Westfalen fördert Einrichtungen beim Landschaftsverband Rheinland; das Oberverwaltungsgericht für das Land Nordrhein-Westfalen bleibt zuständig. Es gilt das Nichtraucherschutzgesetz NRW.' }] },
    ],
    sourceReferences: [],
    findings: [],
    sourceIdentity: 'term:1',
    sourceValidFrom: '2022-05-03',
    ...overrides,
  };
}

describe('Erlassorgan: nie aus dem Normtyp erfunden', () => {
  it('ohne ausdrückliche Formel bleibt das Organ leer – auch bei einem Gesetz', () => {
    const law = sourceLaw({ type: 'gesetz', body: [{ type: 'paragraph', label: '§ 1', children: [{ type: 'paragraphText', text: 'Dieses Gesetz regelt etwas.' }] }] });
    const { record, report } = transformToWest(law, context);
    expect(record.meta.enactingBody).toBeUndefined();
    expect(record.meta.originEnactingBody).toBeUndefined();
    expect(report.organs.decision).toBe('not-available');
  });

  it('echtes Organ aus der Verordnungsformel bleibt als Quellorgan erhalten, ohne Simulationsorgan', () => {
    const { record, report, findings } = transformToWest(sourceLaw(), context);
    expect(record.meta.originEnactingBody).toBe('Ministerium für Kinder, Familie, Flüchtlinge und Integration');
    expect(record.meta.enactingBody).toBeUndefined();
    expect(report.organs.decision).toBe('manual-review');
    expect(report.organs.source?.formula).toBe('ordinance-formula');
    expect(findings.map((finding) => finding.code)).toContain('enacting-body-mapping-required');
  });

  it('sicheres Verfassungsorgan wird übergeleitet, das Quellorgan bleibt unverändert', () => {
    const law = sourceLaw({ type: 'gesetz', body: [{ type: 'paragraphText', text: 'Der Landtag Nordrhein-Westfalen hat am 6. Juni 1950 folgendes Gesetz beschlossen:' }, { type: 'paragraph', label: '§ 1', children: [{ type: 'paragraphText', text: 'Text.' }] }] });
    const { record, report } = transformToWest(law, context);
    expect(record.meta.originEnactingBody).toBe('Landtag Nordrhein-Westfalen');
    expect(record.meta.enactingBody).toBe('Landtag Westdeutschland');
    expect(report.changes).toContainEqual({ path: 'meta.enactingBody', rule: 'jurisdiction-name-bare', from: 'Nordrhein-Westfalen', to: 'Westdeutschland' });
    expect(report.postTransformAudit.ok).toBe(true);
  });

  it('erkennt Erlassköpfe von Verwaltungsvorschriften und normalisiert nur das Kopfwort', () => {
    expect(extractSourceOrgans({ blocks: [], headLines: [{ path: 'head[1]', text: 'Runderlass des Ministeriums des Innern - 14 - 36.03 -' }] }).enactingBody?.name).toBe('Ministerium des Innern');
    expect(extractSourceOrgans({ blocks: [], headLines: [{ path: 'head[1]', text: 'RdErl. d. Finanzministers v. 21 7 1972 -IDS-Tgb.Nr 3061/72' }] }).enactingBody?.name).toBe('Finanzminister');
    expect(nominativeOrganName('Ministeriums für Heimat, Kommunales, Bau und Gleichstellung')).toBe('Ministerium für Heimat, Kommunales, Bau und Gleichstellung');
    expect(mapEnactingBody('Ministerium des Innern').decision).toBe('manual-review');
    expect(mapEnactingBody('Landesregierung').enactingBody).toBe('Landesregierung');
  });

  it('widersprüchliche Formeln führen zu keinem Organ', () => {
    const extraction = extractSourceOrgans({ blocks: [{ type: 'paragraphText', text: 'Es verordnet die Landesregierung:' }], headLines: [{ path: 'head', text: 'Runderlass des Ministeriums der Finanzen' }] });
    expect(extraction.conflict).toBe(true);
    expect(extraction.enactingBody).toBeUndefined();
  });
});

describe('Erkennung vor der Transformation', () => {
  it('erkennt komplexe Institutionen auf dem Quelltext, bevor Landesnamen ersetzt werden', () => {
    const detections = detectReferences([{ path: 'body[1].children[0].text', text: 'Das Oberverwaltungsgericht für das Land Nordrhein-Westfalen und der Landtag Nordrhein-Westfalen sowie die Unfallkasse Nordrhein-Westfalen.' }]);
    const summary = detections.map((entry) => [entry.term, entry.category, entry.decision]);
    expect(summary).toContainEqual(['Oberverwaltungsgericht für das Land Nordrhein-Westfalen', 'institution', 'manual-review']);
    expect(summary).toContainEqual(['Landtag Nordrhein-Westfalen', 'legislature', 'safe-auto-transform']);
    expect(summary).toContainEqual(['Unfallkasse Nordrhein-Westfalen', 'public-body', 'manual-review']);
    expect(summary).toContainEqual(['Land Nordrhein-Westfalen', 'jurisdiction-name', 'safe-auto-transform']);
  });

  it('schützt Fundstellen der Quelle (GV. NRW., SMBl. NRW., MBl. NRW., MB.NRW) und externe Namen', () => {
    const text = 'vom 2. Mai 2003 (MBl. NRW. S. 580), SMBl. NRW. 2030, GV. NRW. 2016 S. 790, MB.NRW 2026 Nr. 94, NRW.BANK und IT.NRW';
    const detections = detectReferences([{ path: 'p', text }]);
    expect(detections.every((entry) => entry.decision === 'protected')).toBe(true);
    expect(detections.map((entry) => entry.category)).toEqual(['source-citation', 'source-citation', 'source-citation', 'source-citation', 'external-name', 'external-name']);
    const changes: TransformationChange[] = [];
    expect(transformText(text, 'p', changes)).toBe(text);
    expect(changes).toEqual([]);
  });

  it('meldet Restformen ohne sichere Regel als manuelle Entscheidung, statt sie zu ersetzen', () => {
    const detections = detectReferences([{ path: 'p', text: 'nach dem Nichtraucherschutzgesetz NRW. Die Landesfarben Nordrhein-Westfalens.' }]);
    expect(detections.map((entry) => [entry.term, entry.decision])).toEqual([['NRW', 'manual-review'], ['Nordrhein-Westfalens', 'manual-review']]);
    expect(planTransformation('Nichtraucherschutzgesetz NRW.').segments).toEqual([]);
  });

  it('ist deterministisch', () => {
    const fields = [{ path: 'a', text: sourceLaw().body[1]!.children![0]!.text! }];
    expect(detectReferences(fields)).toEqual(detectReferences(fields));
  });
});

describe('Prüfung nach der Transformation', () => {
  it('akzeptiert geschützte und dokumentierte Reste und findet unerklärte Reste', () => {
    const source = 'Nichtraucherschutzgesetz NRW. (GV. NRW. S. 1) im Land Nordrhein-Westfalen';
    const detections = detectReferences([{ path: 'p', text: source }]);
    const changes: TransformationChange[] = [];
    const transformed = transformText(source, 'p', changes);
    const audit = auditTransformation([{ path: 'p', source, transformed }], detections, changes);
    expect(audit.ok).toBe(true);
    expect(audit.residuals.map((entry) => entry.status)).toEqual(['documented', 'protected']);

    const silent = auditTransformation([{ path: 'q', source: 'Land Westdeutschland', transformed: 'Land Nordrhein-Westfalen' }], [], []);
    expect(silent.ok).toBe(false);
    expect(silent.residuals[0]?.status).toBe('unexplained');
    expect(silent.unrecordedChanges).toEqual(['q']);

    const unapplied = auditTransformation([{ path: 'p', source, transformed: source }], detections, []);
    expect(unapplied.ok).toBe(false);
    expect(unapplied.unappliedTransforms).toEqual([{ path: 'p', rule: 'jurisdiction-name-dative', expected: 1, applied: 0 }]);
  });

  it('der Transformer übernimmt jede Erkennung in den Report und prüft nach der Transformation', () => {
    const { report } = transformToWest(sourceLaw(), context);
    expect(report.schemaVersion).toBe('recht-nrw-transformation-report/2');
    expect(report.postTransformAudit.ok).toBe(true);
    expect(report.decisions['regional-body']).toEqual({ 'manual-review': 1 });
    expect(report.decisions.institution).toEqual({ 'manual-review': 1 });
    expect(report.unresolved.map((entry) => entry.term)).toEqual(expect.arrayContaining(['Landschaftsverband', 'Rheinland', 'NRW', 'Ministerium für Kinder, Familie, Flüchtlinge und Integration']));
  });
});

describe('Getrennte Fundstellen: Quelle und Simulation', () => {
  it('trennt reale Fundstelle (geschützt) und Simulationsfundstelle', () => {
    const law = sourceLaw();
    const { record, report } = transformToWest(law, context);
    const version = record.versions[0]!;
    expect(record.meta.sourceCitation).toBe(law.citation);
    expect(version.sourceCitation).toBe(law.fullCitation);
    expect(version.citation).toBe('Testverordnung Westdeutschland in der am 1. Dezember 2023 übernommenen Fassung (Ausgangsrechtsstand West)');
    expect(record.meta.initialCitation).toBe(version.citation);
    expect(version.citation).not.toContain('GV. NRW.');
    expect(record.history.entries[0]!.citation).toBe(version.citation);
    expect(record.history.entries[0]!.note).toContain('GV. NRW. S. 1');
    expect(report.citations).toEqual({ source: law.citation, sourceVersion: law.fullCitation, simulation: version.citation });
  });
});
