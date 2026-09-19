/**
 * Transformation juris Schleswig-Holstein → Land Niedersachsen-Holstein (`nsh`).
 *
 * Geprüft werden die fachlichen Zusagen der Überleitung: alle Flexions- und Schreibvarianten der
 * Landesbezeichnung, Idempotenz und Doppelungsfreiheit (Quell- und Zielname teilen den Bestandteil
 * „Holstein“), die Unverletzlichkeit von Fundstellen, Quellenreferenzen und amtlichen
 * Kurzbezeichnungen, die Institutionenpolitik (kein Mapping → Review, Text unverändert), die
 * Gewinnung des Erlassorgans ausschließlich aus ausdrücklichen Formeln und die fail-closed-Prüfung
 * nach der Transformation.
 */
import { describe, expect, it } from 'vitest';

import { getJurisdiction, SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { SourceLaw, TransformContext } from '@landesrecht/importer-common/pipeline.ts';
import { auditTransformation, detectReferences } from '@landesrecht/importer-juris-sh/transform/detection.ts';
import { readInstitutionRegistry } from '@landesrecht/importer-juris-sh/transform/institution-registry.ts';
import { extractSourceOrgans, mapEnactingBody, nominativeOrganName } from '@landesrecht/importer-juris-sh/transform/organs.ts';
import { targetAdjective, targetGazette, targetProperName, targetShortName, TRANSFORMER_VERSION } from '@landesrecht/importer-juris-sh/transform/rules.ts';
import { auditRecord, auditableFields } from '@landesrecht/importer-juris-sh/transform/audit-record.ts';
import { transformText, transformToNsh, type TransformationChange } from '@landesrecht/importer-juris-sh/transform/transform.ts';

const TARGET = getJurisdiction('nsh');
const registry = await readInstitutionRegistry(process.cwd());

const apply = (value: string): string => transformText(value, 'p', []);
const rulesOf = (value: string): string[] => {
  const changes: TransformationChange[] = [];
  transformText(value, 'p', changes);
  return changes.map((change) => change.rule);
};

function sourceLaw(overrides: Partial<SourceLaw> = {}): SourceLaw {
  return {
    portal: 'juris-sh',
    externalIdentifiers: [{ system: 'juris-sh', value: 'jlr-TestGSHrahmen', url: 'https://www.gesetze-rechtsprechung.sh.juris.de/perma?j=TestG_SH' }],
    title: 'Testgesetz für das Land Schleswig-Holstein',
    shortTitle: 'Testgesetz Schleswig-Holstein',
    abbr: 'TestG',
    type: 'gesetz',
    sourceValidFrom: '2020-01-01',
    sourceValidTo: '2023-12-15',
    documentDate: '2019-12-10',
    citation: 'Testgesetz vom 10. Dezember 2019 (GVOBl. Schl.-H. S. 512)',
    fullCitation: 'Testgesetz vom 10. Dezember 2019 (GVOBl. Schl.-H. S. 512), zuletzt geändert am 1. März 2022 (GVOBl. Schl.-H. S. 44)',
    subjects: ['Allgemeine Verwaltung'],
    keywords: ['Test'],
    body: [
      { type: 'preamble', title: 'Eingangsformel', children: [{ type: 'paragraphText', text: 'Der Schleswig-Holsteinische Landtag hat das folgende Gesetz beschlossen:' }] },
      { type: 'paragraph', label: '§ 1', title: 'Geltungsbereich', children: [{ type: 'paragraphText', text: 'Dieses Gesetz gilt für alle Behörden des Landes Schleswig-Holstein und für die schleswig-holsteinischen Gemeinden.' }] },
      { type: 'paragraph', label: '§ 2', title: 'Zuständigkeit', children: [{ type: 'paragraphText', text: 'Zuständig ist das Ministerium für Inneres, Kommunales, Wohnen und Sport; § 3 des Landesverwaltungsgesetzes (LVwG SH) bleibt unberührt.' }] },
      { type: 'footnote', label: 'Fn 1', text: 'Verkündet als Artikel 1 des Gesetzes vom 10. Dezember 2019 (GVOBl. Schl.-H. S. 512).' },
    ],
    sourceNotes: [{ label: 'Fundstelle', text: 'GVOBl. Schl.-H. 2019 S. 512' }],
    sourceReferences: [
      { kind: 'official-portal-snapshot', system: 'juris-sh', label: 'Fassungsseite juris Schleswig-Holstein', availability: 'versioned', localSource: 'sources/juris-sh/testg/aaaa-version-page.html', url: 'https://www.gesetze-rechtsprechung.sh.juris.de/perma?j=TestG_SH' },
    ],
    findings: [],
    sourceIdentity: 'jlr-TestGSHrahmen',
    ...overrides,
  };
}

const context = (): TransformContext => ({ targetJurisdiction: 'nsh', baselineDate: SIMULATION_BASELINE_DATE, reserveSlug: (candidate: string) => candidate });

describe('Zielbezeichnungen stammen aus dem Jurisdiktionsregister', () => {
  it('leitet Eigenname, Kurzform und Adjektiv aus dem Register ab', () => {
    expect(targetProperName()).toBe(TARGET.name.replace(`${TARGET.stateForm} `, ''));
    expect(targetShortName()).toBe(TARGET.shortName);
    expect(targetAdjective(true, true)).toBe(`${targetProperName()}isch`);
    expect(targetAdjective(false, false)).toBe(`${targetProperName().toLowerCase()}isch`);
    expect(targetGazette()).toEqual(TARGET.gazette);
  });

  it('nennt eine eigene Transformerversion für die Staleness-Erkennung', () => {
    expect(TRANSFORMER_VERSION).toBe('juris-sh-transformer/1.1.0');
  });
});

describe('Landesbezeichnung in allen Formen', () => {
  it('leitet Nominativ, Genitiv, Dativ und Kompositum über', () => {
    expect(apply('Das Land Schleswig-Holstein regelt dies.')).toBe(`Das ${TARGET.name} regelt dies.`);
    expect(apply('Behörden des Landes Schleswig-Holstein')).toBe(`Behörden des Landes ${targetProperName()}`);
    expect(apply('im Land Schleswig-Holstein')).toBe(`im Land ${targetProperName()}`);
    expect(apply('Die Bürgerinnen und Bürger Schleswig-Holsteins')).toBe(`Die Bürgerinnen und Bürger ${targetProperName()}s`);
    expect(apply('Schleswig-Holstein-Tarif')).toBe(`${targetProperName()}-Tarif`);
    expect(rulesOf('Das Land Schleswig-Holstein, die Behörden des Landes Schleswig-Holstein und die Geltung im Land Schleswig-Holstein')).toEqual([
      'jurisdiction-name-full',
      'jurisdiction-name-genitive',
      'jurisdiction-name-dative',
    ]);
    expect(rulesOf('Die Bürger Schleswig-Holsteins und schleswig-holsteinische Behörden')).toEqual([
      'jurisdiction-name-bare',
      'jurisdiction-name-adjective',
    ]);
  });

  it('leitet das Adjektiv in allen Flexionen und Schreibungen über', () => {
    const lower = targetAdjective(false, false);
    const upper = targetAdjective(true, true);
    expect(apply('schleswig-holsteinisch')).toBe(lower);
    expect(apply('schleswig-holsteinische Gemeinden')).toBe(`${lower}e Gemeinden`);
    expect(apply('der schleswig-holsteinischen Verwaltung')).toBe(`der ${lower}en Verwaltung`);
    expect(apply('ein schleswig-holsteinisches Gesetz')).toBe(`ein ${lower}es Gesetz`);
    expect(apply('eines schleswig-holsteinischer Trägers')).toBe(`eines ${lower}er Trägers`);
    expect(apply('mit schleswig-holsteinischem Recht')).toBe(`mit ${lower}em Recht`);
    expect(apply('Schleswig-Holsteinischer Landtag')).toBe(`${upper}er Landtag`);
    expect(apply('Schleswig-Holsteinisches Oberverwaltungsgericht')).toBe(`${upper}es Oberverwaltungsgericht`);
  });

  it('erkennt Bindestrich, Gedankenstrich, Leerzeichen und Zeilenumbruch als Trennung', () => {
    const expected = `Das Land ${targetProperName()} handelt.`;
    expect(apply('Das Land Schleswig-Holstein handelt.')).toBe(expected);
    expect(apply('Das Land Schleswig–Holstein handelt.')).toBe(expected);
    expect(apply('Das Land Schleswig‑Holstein handelt.')).toBe(expected);
    expect(apply('Das Land Schleswig Holstein handelt.')).toBe(expected);
    expect(apply('Das Land Schleswig-\nHolstein handelt.')).toBe(expected);
    expect(apply('Das Land Schleswig-\n   Holstein handelt.')).toBe(expected);
    expect(apply('die schleswig-\nholsteinischen Gemeinden')).toBe(`die ${targetAdjective(false, false)}en Gemeinden`);
  });

  it('lässt Namensteile allein unberührt (Stadt Schleswig, Kreis Schleswig-Flensburg, Landschaft Holstein)', () => {
    const text = 'Die Stadt Schleswig, der Kreis Schleswig-Flensburg und die Landschaft Holstein bleiben.';
    expect(apply(text)).toBe(text);
  });
});

describe('Doppelungsfreiheit und Idempotenz', () => {
  const samples = [
    'Das Land Schleswig-Holstein und die Behörden des Landes Schleswig-Holstein.',
    'Die schleswig-holsteinischen Gemeinden und der Schleswig-Holsteinische Landtag.',
    'Schleswig–Holstein, Schleswig Holstein, Schleswig-\nHolstein, Schleswig-Holsteins.',
    'Schleswig-Holstein-Fonds des Landes Schleswig-Holstein.',
    'Die Behörden des Landes Schl.-H. und im Land SH.',
  ];

  it('erzeugt nie eine Doppelung des Namensbestandteils „Holstein“', () => {
    const tail = targetProperName().split('-').at(-1)!;
    for (const sample of samples) {
      const output = apply(sample);
      expect(output).not.toMatch(new RegExp(`${tail}(?:isch\\p{L}*)?-${tail}`, 'u'));
      expect(output).not.toContain(`${targetProperName()}-${tail}`);
    }
  });

  it('ist bei mehrfacher Anwendung stabil', () => {
    for (const sample of samples) {
      const once = apply(sample);
      expect(apply(once)).toBe(once);
      expect(apply(apply(once))).toBe(once);
    }
  });
});

describe('Kürzel „Schl.-H.“ und „SH“', () => {
  it('lässt Fundstellen und Verkündungsblattnamen byteidentisch', () => {
    const changes: TransformationChange[] = [];
    const text = 'Zuletzt geändert durch Gesetz vom 2. Juli 1996 (GVOBl. Schl.-H. S. 234); vgl. Amtsbl. Schl.-H. 2010 S. 12 und NBl. MBWK Schl.-H. S. 4; Gesetz- und Verordnungsblatt für Schleswig-Holstein; https://www.gesetze-rechtsprechung.sh.juris.de/x bleibt.';
    expect(transformText(text, 'p', changes)).toBe(text);
    expect(changes).toEqual([]);
    for (const protectedText of [
      'Amtsblatt für Schleswig-Holstein 2019 S. 7',
      'SchlHA Schl.-H. S. 3',
      'ABl. SH 2020 S. 9',
      'Grundschulen vom 10. Mai 2017 (NBl. MSB. Schl.-H. S. 152), zuletzt geändert',
      'Archiv landesverordnung-schleswig-holstein.pdf',
      'Prüfsumme ' + 'a'.repeat(64),
    ]) expect(apply(protectedText)).toBe(protectedText);
  });

  it('leitet das Kürzel nur mit vorangestellter Staatsform über', () => {
    expect(apply('Die Behörden des Landes Schl.-H. arbeiten zusammen.')).toBe(`Die Behörden des Landes ${targetShortName()} arbeiten zusammen.`);
    expect(apply('Geltung im Land Schl.-H.')).toBe(`Geltung im Land ${targetShortName()}.`);
    expect(apply('Im Land SH gilt dies.')).toBe(`Im Land ${targetShortName()} gilt dies.`);
    const ambiguous = 'Die Verwaltungsvorschrift Schl.-H. wird aufgehoben.';
    expect(apply(ambiguous)).toBe(ambiguous);
  });

  it('lässt amtliche Kurzbezeichnungen mit „SH“ unverändert und meldet sie zur Prüfung', () => {
    const text = 'Nach § 3 des Landesverwaltungsgesetzes (LVwG SH) und nach § 8 LBO SH gilt Folgendes.';
    expect(apply(text)).toBe(text);
    const detections = detectReferences([{ path: 'body[0].text', text }]);
    const abbreviations = detections.filter((entry) => entry.category === 'official-abbreviation');
    expect(abbreviations).toHaveLength(2);
    expect(abbreviations.every((entry) => entry.decision === 'manual-review' && entry.term === 'SH')).toBe(true);
    expect(abbreviations[0]!.reason).toContain('amtlichen Kurzbezeichnung');
  });
});

describe('Abkürzungen mit Landeskürzel (Version 1.1.0) und historische Namen', () => {
  const known = new Set(['MBG Schl.-H.', 'LStVollzG SH', 'GVFG-SH', 'SH AbgG', 'GlüStV 2021 AG SH']);
  const convert = (value: string, extra: readonly string[] = []): string => transformText(value, 'p', [], { knownStateLawAbbreviations: new Set([...known, ...extra]) });

  it('leitet das abgesetzte Landeskürzel bekannter amtlicher Abkürzungen auf „NSH“ über', () => {
    expect(targetShortName()).toBe('NSH');
    expect(convert('nach § 80 MBG Schl.- H., erhöht')).toBe('nach § 80 MBG NSH, erhöht');
    expect(convert('gemäß MBG Schl.-H. Die Frist')).toBe('gemäß MBG NSH. Die Frist');
    expect(convert('LStVollzG SH und GVFG-SH, SH AbgG sowie GlüStV 2021 AG SH)')).toBe('LStVollzG NSH und GVFG-NSH, NSH AbgG sowie GlüStV 2021 AG NSH)');
  });

  it('lässt Fundstellen, Aktenzeichen, verschmolzene und unbekannte Abkürzungen unverändert', () => {
    for (const text of ['GVOBl. Schl.-H. S. 3, GVOBl.-Schl.-H. S. 79, GS Schl.-H. II, Gl.Nr. 2186-13', 'Amtsblatt Schl.-H. S. 674, NBl. HS MBWK Schl.-H. S. 56', 'JM v. 2. 3. 1993 – V 340 a/5607 – 19 SH –', 'FINISHG und SHBesG', 'nach LBO SH']) {
      expect(convert(text)).toBe(text);
    }
  });

  it('übernimmt im Text eingeführte Abkürzungen einer Bezeichnung mit dem Landesnamen', async () => {
    const { definedStateAbbreviations } = await import('@landesrecht/importer-juris-sh/transform/rules.ts');
    const defined = definedStateAbbreviations(['Landesamt für Vermessung und Geoinformation Schleswig-Holstein (LVermGeo SH) ist zuständig', '(Mitbestimmungsgesetz Schleswig-Holstein - MBG Schl.-H.)', 'Gesetz (GVOBl. Schl.-H. S. 3)']);
    expect([...defined].sort()).toEqual(['LVermGeo SH', 'MBG Schl.-H.']);
    expect(convert('das LVermGeo SH prüft', [...defined])).toBe('das LVermGeo NSH prüft');
  });

  it('leitet die preußische Provinz nicht über und meldet eine übergeleitete historische Bezeichnung', () => {
    expect(apply('Reallasten in der Provinz Schleswig-Holstein; Land Schleswig-Holstein')).toBe('Reallasten in der Provinz Schleswig-Holstein; Land Niedersachsen-Holstein');
    const record = { meta: { title: 'Gesetz über die Ablösung der Reallasten in der Provinz Niedersachsen-Holstein', subjects: [], keywords: [], initialCitation: 'x' }, versions: [{ citation: 'x', body: [] }] } as never;
    expect(auditRecord(record).map((finding) => finding.code)).toContain('historical-name-transformed');
  });
});

describe('Erkennung und Institutionenpolitik', () => {
  it('entscheidet je Kategorie und lässt Institutionen im Text unverändert', () => {
    const text = 'Das Ministerium für Bildung und Wissenschaft, der Schleswig-Holsteinische Gemeindetag und die Ärztekammer Schleswig-Holstein wirken mit; die Stadt Kiel wird gehört.';
    const detections = detectReferences([{ path: 'body[1].text', text }], { institutions: registry });
    const byCategory = detections.map((entry) => [entry.term, entry.category, entry.decision]);
    expect(byCategory).toEqual(expect.arrayContaining([
      ['Ministerium für Bildung und Wissenschaft', 'ministry', 'manual-review'],
      ['Schleswig-Holsteinische Gemeindetag', 'regional-body', 'manual-review'],
      ['Ärztekammer Schleswig-Holstein', 'public-body', 'manual-review'],
      ['Kiel', 'municipality', 'manual-review'],
    ]));
    const ministry = detections.find((entry) => entry.category === 'ministry')!;
    expect(ministry.mapping).toEqual({ status: 'review' });
    expect(ministry.context).toContain(ministry.term);
    // Nur die Landesbezeichnung wird übergeleitet; die Institutionsbezeichnungen selbst bleiben.
    const transformed = apply(text);
    expect(transformed).toContain('Ministerium für Bildung und Wissenschaft');
    expect(transformed).toContain('Ärztekammer ' + targetProperName());
    expect(transformed).toContain('Stadt Kiel');
  });

  it('führt nur unstrittige Verfassungsorgane in der Zuordnung', () => {
    expect(registry.registry.entries.map((entry) => entry.id)).toEqual(['landtag', 'landesregierung', 'ministerpraesident']);
    expect(registry.resolve('Ministerium für Inneres', 'ministry')).toEqual({ status: 'review', source: 'default' });
    expect(registry.resolve('Landesamt für Umweltschutz', 'authority')).toEqual({ status: 'review', source: 'default' });
    expect(registry.resolve('Schleswig-Holsteinischer Landtag', 'legislature').status).toBe('safe-transform');
    for (const entry of registry.registry.entries) expect(entry.target).not.toMatch(/Schleswig|Schl\.-H\./u);
  });
});

describe('Erlassorgan nur aus ausdrücklicher Formel', () => {
  it('übernimmt das Verfassungsorgan aus der Beschlussformel und leitet nur den Landesnamen über', () => {
    const organs = extractSourceOrgans({ blocks: [{ type: 'preamble', children: [{ type: 'paragraphText', text: 'Der Schleswig-Holsteinische Landtag hat das folgende Gesetz beschlossen:' }] }] });
    expect(organs.enactingBody?.name).toBe('Schleswig-Holsteinischer Landtag');
    expect(organs.enactingBody?.formula).toBe('legislative-resolution');
    expect(mapEnactingBody(organs.enactingBody?.name).enactingBody).toBe(`${targetAdjective(true, true)}er Landtag`);
  });

  it('übernimmt kein Organ aus einer unpersönlichen Formel', () => {
    const organs = extractSourceOrgans({ blocks: [{ type: 'preamble', children: [{ type: 'paragraphText', text: 'Aufgrund des § 5 Absatz 2 des Landesverwaltungsgesetzes wird verordnet:' }] }] });
    expect(organs.candidates).toEqual([]);
    expect(organs.enactingBody).toBeUndefined();
    expect(mapEnactingBody(undefined).decision).toBe('not-available');
  });

  it('meldet Ressorts ohne gesicherte Entsprechung zur Prüfung und behält das Quellorgan', () => {
    const organs = extractSourceOrgans({ blocks: [{ type: 'preamble', children: [{ type: 'paragraphText', text: 'Aufgrund des § 5 verordnet das Ministerium für Inneres, Kommunales, Wohnen und Sport:' }] }] });
    expect(organs.enactingBody?.name).toBe('Ministerium für Inneres, Kommunales, Wohnen und Sport');
    const mapping = mapEnactingBody(organs.enactingBody?.name, { institutions: registry });
    expect(mapping.decision).toBe('manual-review');
    expect(mapping.enactingBody).toBeUndefined();
  });

  it('normalisiert nur das Kopfwort der Formel', () => {
    expect(nominativeOrganName('Innenministeriums')).toBe('Innenministerium');
    expect(nominativeOrganName('Ministerpräsidenten')).toBe('Ministerpräsident');
    expect(nominativeOrganName('Landtages')).toBe('Landtag');
    expect(nominativeOrganName('Schleswig-Holsteinische Landtag')).toBe('Schleswig-Holsteinischer Landtag');
  });

  it('erkennt vorangestellte Verordnungsformeln und Erlasskopfe', () => {
    const head = (text: string) => extractSourceOrgans({ blocks: [], headLines: [{ path: 'head', text }] });
    expect(head('Die Landesregierung verordnet:').enactingBody).toMatchObject({ name: 'Landesregierung', formula: 'ordinance-formula' });
    expect(head('Runderlass des Innenministeriums vom 3. Mai 2019').enactingBody).toMatchObject({ name: 'Innenministerium', formula: 'decree-head' });
    expect(head('Landesverordnung des Ministeriums für Bildung und Wissenschaft über die Zulassung').enactingBody?.name).toBe('Ministerium für Bildung und Wissenschaft');
    const ministerin = head('Aufgrund des § 5 verordnet die Ministerpräsidentin des Landes Schleswig-Holstein:');
    expect(ministerin.enactingBody?.name).toBe('Ministerpräsidentin des Landes Schleswig-Holstein');
    expect(mapEnactingBody(ministerin.enactingBody?.name).enactingBody).toBe(`Ministerpräsidentin des Landes ${targetProperName()}`);
  });

  it('nutzt keine Unterschrift als Erlassformel', () => {
    const organs = extractSourceOrgans({ blocks: [{ type: 'signature', text: 'Die Ministerpräsidentin', title: 'Ministerpräsidentin' }] });
    expect(organs.enactingBody).toBeUndefined();
  });
});

describe('Prüfung nach der Transformation (fail-closed)', () => {
  it('schlägt bei unerklärtem Restvorkommen des Quelllandes an', () => {
    const audit = auditTransformation(
      [{ path: 'body[0].text', source: 'Das Land Schleswig-Holstein.', transformed: 'Das Land Schleswig-Holstein.' }],
      [],
      [],
    );
    expect(audit.ok).toBe(false);
    expect(audit.residuals).toHaveLength(1);
    expect(audit.residuals[0]).toMatchObject({ term: 'Schleswig-Holstein', status: 'unexplained' });
  });

  it('akzeptiert geschützte und dokumentierte Restvorkommen', () => {
    const field = { path: 'body[0].text', source: 'Fundstelle GVOBl. Schl.-H. S. 5 und § 3 LVwG SH.', transformed: 'Fundstelle GVOBl. Schl.-H. S. 5 und § 3 LVwG SH.' };
    const detections = detectReferences([{ path: field.path, text: field.source }]);
    const audit = auditTransformation([field], detections, []);
    expect(audit.residuals.map((entry) => entry.status).sort()).toEqual(['documented', 'protected']);
    expect(audit.ok).toBe(true);
  });

  it('schlägt bei einer Doppelbildung des Namensbestandteils an', () => {
    const tail = targetProperName().split('-').at(-1)!;
    const audit = auditTransformation(
      [{ path: 'body[0].text', source: 'Das Land Schleswig-Holstein.', transformed: `Das Land ${targetProperName()}-${tail}.` }],
      [],
      [{ path: 'body[0].text', rule: 'jurisdiction-name-full' }],
    );
    expect(audit.doubledNames).toHaveLength(1);
    expect(audit.doubledNames[0]!.term).toBe(`${tail}-${tail}`);
    expect(audit.ok).toBe(false);
  });

  it('schlägt bei stiller Änderung ohne Protokolleintrag an', () => {
    const audit = auditTransformation([{ path: 'body[0].text', source: 'A', transformed: 'B' }], [], []);
    expect(audit.unrecordedChanges).toEqual(['body[0].text']);
    expect(audit.ok).toBe(false);
  });
});

describe('Transformation einer Norm', () => {
  const { record, report, findings } = transformToNsh(sourceLaw(), context());

  it('leitet eine eigene Abkürzung mit „Schl.-H.“ ohne Satzpunkt über und hält die Quellabkürzung fest', () => {
    const converted = transformToNsh(sourceLaw({ abbr: 'AGBGB Schl.-H.' }), context()).record;
    expect(converted.meta.abbr).toBe('AGBGB NSH');
    expect(converted.meta.externalIdentifiers).toContainEqual({ system: 'amtliche-abkuerzung-sh', value: 'AGBGB Schl.-H.' });
  });

  it('erzeugt eine kanonische Ausgangsfassung der Zieljurisdiktion', () => {
    expect(record.meta.jurisdiction).toBe('nsh');
    expect(record.meta.slug).toBe('testg-nsh');
    expect(record.meta.title).toBe(`Testgesetz für das ${TARGET.name}`);
    expect(record.meta.shortTitle).toBe(`Testgesetz ${targetProperName()}`);
    expect(record.meta.enactingBody).toBe(`${targetAdjective(true, true)}er Landtag`);
    expect(record.meta.originEnactingBody).toBe('Schleswig-Holsteinischer Landtag');
    const version = record.versions[0]!;
    expect(version.versionId).toBe(SIMULATION_BASELINE_DATE);
    expect(version.sourceValidFrom).toBe('2020-01-01');
    expect(version.citation).not.toMatch(/Schleswig|Schl\.-H\./u);
  });

  it('lässt Quellmetadaten, Fundstellen und Fußnoten unverändert', () => {
    const law = sourceLaw();
    expect(record.meta.sourceCitation).toBe(law.citation);
    expect(record.meta.sourceCitation).toContain('GVOBl. Schl.-H.');
    expect(record.meta.sourceReferences).toEqual(law.sourceReferences);
    expect(record.meta.externalIdentifiers).toEqual(law.externalIdentifiers);
    expect(record.versions[0]!.sourceCitation).toBe(law.fullCitation);
    expect(record.versions[0]!.sourceNotes).toEqual(law.sourceNotes);
    expect(record.versions[0]!.sourceNotes![0]!.text).toContain('GVOBl. Schl.-H.');
    const body = JSON.stringify(record.versions[0]!.body);
    expect(body).not.toContain('Land Schleswig-Holstein');
    expect(body).toContain('GVOBl. Schl.-H. S. 512');
    expect(body).toContain('LVwG SH');
    expect(body).toContain(`Behörden des Landes ${targetProperName()}`);
    expect(body).toContain(`${targetAdjective(false, false)}en Gemeinden`);
  });

  it('liefert einen maschinenlesbaren Report mit bestandener Nachprüfung', () => {
    expect(report).toMatchObject({
      schemaVersion: 'juris-sh-transformation-report/1',
      source: 'Schleswig-Holstein',
      target: 'nsh',
      sourceArea: 'landesrecht',
      sourceIdentity: 'jlr-TestGSHrahmen',
      slug: 'testg-nsh',
      transformerVersion: TRANSFORMER_VERSION,
    });
    expect(report.changes.length).toBeGreaterThanOrEqual(4);
    expect(report.changes.every((change) => change.path && change.rule && change.from !== change.to)).toBe(true);
    expect(report.detections.every((entry) => entry.context.includes(entry.term) && entry.reason.length > 0)).toBe(true);
    expect(report.unresolved.map((entry) => entry.term)).toEqual(expect.arrayContaining(['SH', 'Ministerium für Inneres, Kommunales, Wohnen und Sport']));
    expect(report.unresolved.every((entry) => entry.manualDecisionRequired)).toBe(true);
    expect(report.postTransformAudit.ok).toBe(true);
    expect(report.postTransformAudit.doubledNames).toEqual([]);
    expect(report.protectedFields).toEqual(expect.arrayContaining(['meta.sourceReferences', 'meta.sourceCitation', 'meta.originEnactingBody', 'version.sourceCitation']));
    expect(report.detections.filter((entry) => entry.decision === 'safe-auto-transform' && entry.category === 'jurisdiction-name')).toHaveLength(report.changes.length);
    expect(findings.filter((finding) => finding.severity === 'error')).toEqual([]);
  });

  it('weist eine fremde Zieljurisdiktion zurück', () => {
    expect(() => transformToNsh(sourceLaw(), { ...context(), targetJurisdiction: 'west' })).toThrow(/nur nsh/u);
  });
});

describe('Schreibvarianten, die leicht durchrutschen', () => {
  it('überführt die Versalschreibung aus Überschriften', () => {
    // Ohne eigene Regel bliebe sie stehen: die übrigen Muster tragen die Groß-/Kleinschreibung
    // und sind deshalb bewusst schreibungsabhängig.
    expect(apply('SCHLESWIG-HOLSTEIN')).toBe(targetProperName().toLocaleUpperCase('de-DE'));
    expect(apply('LAND SCHLESWIG-HOLSTEIN')).toBe(`LAND ${targetProperName().toLocaleUpperCase('de-DE')}`);
    expect(rulesOf('SCHLESWIG-HOLSTEIN')).toEqual(['jurisdiction-name-upper']);
  });

  it('lässt Namen unberührt, die nur einen Bestandteil teilen', () => {
    // Die gefährlichsten Fehlgriffe: Kreise und Orte, die „Schleswig“ oder „Holstein“ enthalten,
    // ohne das Land zu bezeichnen. Eine Regel auf Wortteilen würde sie alle zerstören.
    for (const name of ['Holstein', 'Ostholstein', 'Kreis Ostholstein', 'Holsteinische Schweiz', 'Schleswig', 'Stadt Schleswig', 'Schleswig-Flensburg', 'Kreis Schleswig-Flensburg']) {
      expect(apply(name)).toBe(name);
    }
  });

  it('erfasst die Trennzeichenvarianten der Quelle', () => {
    for (const separator of ['-', '\u2010', '\u2011', '\u2013', '\u2014', '\u2212']) {
      expect(apply(`Schleswig${separator}Holstein`)).toBe(targetProperName());
    }
  });

  it('ist idempotent: zweimal angewandt ändert sich nichts mehr', () => {
    for (const input of ['Land Schleswig-Holstein', 'schleswig-holsteinische Gemeinden', 'SCHLESWIG-HOLSTEIN', 'Schleswig-Holsteins']) {
      const once = apply(input);
      expect(apply(once)).toBe(once);
    }
  });

  it('meldet eine Doppelbildung auch in Versalschreibung', () => {
    const tail = targetProperName().split('-').at(-1)!.toLocaleUpperCase('de-DE');
    const audit = auditTransformation([{ path: 'p', source: 'x', transformed: `${targetProperName().toLocaleUpperCase('de-DE')}-${tail}` }], [], [{ path: 'p', rule: 'jurisdiction-name-upper' }]);
    expect(audit.doubledNames).toHaveLength(1);
    expect(audit.ok).toBe(false);
  });
});

describe('Restpostenprüfung auf der fertigen Norm', () => {
  const { record } = transformToNsh(sourceLaw(), context());

  it('meldet für eine sauber übergeleitete Norm keinen Fehler', () => {
    const findings = auditRecord(record);
    expect(findings.filter((finding) => finding.severity === 'error')).toEqual([]);
  });

  it('weist eine Fundstelle im Normtext als bewusst erhalten aus', () => {
    // Vorschriften zitieren amtliche Fundstellen mitten im Normtext. Dort greift kein
    // Provenienzfeld, sondern das Schutzmuster – die Nennung bleibt und ist kein Fehler.
    const cited = structuredClone(record);
    const paragraph = cited.versions[0]!.body.find((block) => block.type === 'paragraph')!;
    paragraph.children![0]!.text = 'Unberührt bleibt das Gesetz vom 10. Dezember 2019 (GVOBl. Schl.-H. S. 512).';
    const findings = auditRecord(cited);
    expect(findings.some((finding) => finding.severity === 'error')).toBe(false);
    const info = findings.find((finding) => finding.code === 'protected-source-state-reference');
    expect(info?.severity).toBe('info');
    expect(info?.message).toMatch(/geschützten Bereichen/u);
  });

  it('meldet für die unveränderte Norm keine geschützte Restnennung, weil Provenienz gar nicht geprüft wird', () => {
    // Fundstelle, Quellzitat und Fußnote liegen außerhalb der geprüften Felder – die einzige
    // verbliebene Nennung ist das unentscheidbare Kürzel.
    const codes = auditRecord(record).map((finding) => finding.code);
    expect(codes).toEqual(['undecidable-source-state-abbreviation']);
  });

  it('stuft ein bloßes Kürzel als unentscheidbar ein, nicht als Fehler', () => {
    // „LVwG SH“ ist die amtliche Abkürzung eines fremden Gesetzes; sie bleibt bewusst stehen und ist
    // in der Transformation als manual-review erfasst. An der fertigen Norm allein ist das nicht
    // vom echten Rest zu unterscheiden – also warning mit Verweis auf den Bericht, nicht error.
    const findings = auditRecord(record);
    const undecidable = findings.filter((finding) => finding.code === 'undecidable-source-state-abbreviation');
    expect(undecidable).toHaveLength(1);
    expect(undecidable[0]!.severity).toBe('warning');
    expect(undecidable[0]!.message).toContain('LVwG SH');
    expect(undecidable[0]!.message).toMatch(/unresolved/u);
    expect(findings.some((finding) => finding.severity === 'error')).toBe(false);
  });

  it('erfasst genau die Felder, die die Transformation verändert – Provenienzfelder nicht', () => {
    const paths = auditableFields(record).map((field) => field.path);
    expect(paths).toContain('meta.title');
    expect(paths).toContain('versions[0].citation');
    expect(paths.some((path) => path.startsWith('versions[0].body['))).toBe(true);
    // Provenienz bleibt außen vor, sonst meldete jede korrekte Fundstelle einen Fehler.
    expect(paths).not.toContain('meta.sourceCitation');
    expect(paths).not.toContain('meta.originEnactingBody');
    expect(paths).not.toContain('versions[0].sourceCitation');
    // Der Änderungshinweis nennt das Quellland ausdrücklich und ist damit ebenfalls Provenienz.
    expect(record.versions[0]!.changeNote).toContain('Schleswig-Holstein');
    expect(paths).not.toContain('versions[0].changeNote');
    const footnote = record.versions[0]!.body.findIndex((block) => block.type === 'footnote');
    expect(footnote).toBeGreaterThanOrEqual(0);
    expect(paths.some((path) => path.startsWith(`versions[0].body[${footnote}]`))).toBe(false);
  });

  it('schlägt an, wenn eine Quellbezeichnung ungeschützt stehen bleibt', () => {
    const broken = structuredClone(record);
    broken.meta.title = 'Testgesetz für das Land Schleswig-Holstein';
    const findings = auditRecord(broken);
    const residual = findings.filter((finding) => finding.code === 'residual-source-state-reference');
    expect(residual).toHaveLength(1);
    expect(residual[0]!.severity).toBe('error');
    expect(residual[0]!.message).toMatch(/^meta\.title: /u);
    expect(residual[0]!.message).toContain('Schleswig-Holstein');
  });

  it('schlägt an, wenn im Normkörper eine Quellbezeichnung stehen bleibt', () => {
    const broken = structuredClone(record);
    const paragraph = broken.versions[0]!.body.find((block) => block.type === 'paragraph')!;
    paragraph.children![0]!.text = 'Zuständig ist das Land Schleswig-Holstein.';
    const findings = auditRecord(broken);
    expect(findings.some((finding) => finding.code === 'residual-source-state-reference' && finding.message.includes('.children[0].text'))).toBe(true);
  });

  it('meldet jede Doppelbildung aus Quell- und Zielname als Fehler', () => {
    const tail = targetProperName().split('-').at(-1)!;
    const broken = structuredClone(record);
    broken.meta.title = `Gesetz des Landes ${targetProperName()}-${tail}`;
    const findings = auditRecord(broken);
    const doubled = findings.filter((finding) => finding.code === 'doubled-target-name');
    expect(doubled).toHaveLength(1);
    expect(doubled[0]!.severity).toBe('error');
    expect(doubled[0]!.message).toContain(`${tail}-${tail}`);
  });

  it('prüft auch Sachgebiete und Schlagwörter', () => {
    const broken = structuredClone(record);
    broken.meta.keywords = ['Schleswig-Holstein'];
    expect(auditRecord(broken).some((finding) => finding.code === 'residual-source-state-reference' && finding.message.startsWith('meta.keywords'))).toBe(true);
  });
});
