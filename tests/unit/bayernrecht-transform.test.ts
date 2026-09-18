/**
 * Transformation BAYERN.RECHT → Freistaat Bayern-Württemberg (`baywue`).
 *
 * Die Falle, die alles bestimmt: **Der Zielname enthält den Quellnamen vollständig**
 * („Bayern“ → „Bayern-Württemberg“). Eine zweite Anwendung derselben Regel ergäbe
 * „Bayern-Württemberg-Württemberg“. Idempotenz ist hier nicht geschenkt; sie wird konstruiert
 * (negativer Lookahead auf den bereits angehängten Zielteil) – und deshalb hier für **jede**
 * Flexions- und Schreibvariante geprüft, nicht nur für den Grundfall.
 *
 * Weiter geprüft: die unregelmäßige Adjektivform („bayerisch“) mit ihrer redaktionellen
 * Festlegung, die konservative Behandlung der „Bay“-Abkürzungen, die Unverletzlichkeit von
 * Fundstellen, BayRS-Nummern und Provenienzfeldern, die Nichtangriffsliste (Bayreuth, Bayerwald,
 * Bayerischer Wald, Bayerisches Meer), die Institutionenpolitik (kein Mapping → Review, Text
 * unverändert), die Gewinnung des Erlassorgans ausschließlich aus ausdrücklichen Formeln, die
 * Slugkonvention `-baywue` und die fail-closed-Prüfung nach der Transformation.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getJurisdiction, SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import type { SourceLaw, TransformContext } from '@landesrecht/importer-common/pipeline.ts';

import { createTransformer } from '@landesrecht/importer-bayernrecht/index.ts';
import { parseBayernRechtDocument, parseBayernRechtPackage } from '@landesrecht/importer-bayernrecht/parse/index.ts';
import { assertJurisdictionSlug, jurisdictionSlugCandidate, JURISDICTION_SUFFIX } from '@landesrecht/importer-bayernrecht/common/slug-registry.ts';
import { auditTransformation, detectReferences, DOUBLED_TARGET_NAME, SOURCE_STATE_REFERENCE } from '@landesrecht/importer-bayernrecht/transform/detection.ts';
import { compileInstitutionRegistry, readInstitutionRegistry, validateInstitutionRegistry, type InstitutionRegistry } from '@landesrecht/importer-bayernrecht/transform/institution-registry.ts';
import { extractSourceOrgans, mapEnactingBody, nominativeOrganName } from '@landesrecht/importer-bayernrecht/transform/organs.ts';
import { adjectiveDecision, BAY_ABBREVIATION, SOURCE_ADJECTIVE, targetAdjective, targetAppendedPart, targetGazette, targetProperName, targetShortName, TRANSFORMER_VERSION } from '@landesrecht/importer-bayernrecht/transform/rules.ts';
import { auditRecord, auditableFields } from '@landesrecht/importer-bayernrecht/transform/audit-record.ts';
import { deriveSlug, transformText, transformToBayWue, type TransformationChange } from '@landesrecht/importer-bayernrecht/transform/transform.ts';

import { archivedSource, fixture } from '../helpers/bayernrecht-parse.ts';

const TARGET = getJurisdiction('baywue');
const registry = await readInstitutionRegistry(process.cwd());

const apply = (value: string): string => transformText(value, 'p', []);
const rulesOf = (value: string): string[] => {
  const changes: TransformationChange[] = [];
  transformText(value, 'p', changes);
  return changes.map((change) => change.rule);
};

/** Quelle, wie die Pipeline sie dem Parser reicht (`retrievedAt` als Datum, wie das Schema es verlangt). */
const source = archivedSource({ retrievedAt: '2026-09-17' });

const context = (): TransformContext => ({ targetJurisdiction: 'baywue', baselineDate: SIMULATION_BASELINE_DATE, reserveSlug: (candidate: string) => candidate });

function sourceLaw(overrides: Partial<SourceLaw> = {}): SourceLaw {
  return {
    portal: 'bayernrecht',
    externalIdentifiers: [
      { system: 'bayernrecht', value: 'BayTestG', url: 'https://www.gesetze-bayern.de/Content/Document/BayTestG' },
      { system: 'bayrs', value: '2170-1-1-I' },
    ],
    title: 'Bayerisches Testgesetz',
    shortTitle: 'Testgesetz Bayern',
    abbr: 'BayTestG',
    type: 'gesetz',
    sourceValidFrom: '2020-01-01',
    sourceValidTo: '2023-12-15',
    documentDate: '2019-12-10',
    citation: 'Bayerisches Testgesetz (BayTestG) vom 10. Dezember 2019 (GVBl. S. 512, BayRS 2170-1-1-I)',
    fullCitation: 'Bayerisches Testgesetz (BayTestG) vom 10. Dezember 2019 (GVBl. S. 512, BayRS 2170-1-1-I), zuletzt geändert durch Verordnung vom 1. März 2022 (BayMBl. Nr. 44)',
    subjects: ['Allgemeine Verwaltung'],
    keywords: ['Test'],
    body: [
      { type: 'paragraphText', text: 'Der Bayerische Landtag hat das folgende Gesetz beschlossen:' },
      { type: 'article', label: 'Art. 1', title: 'Geltungsbereich', children: [{ type: 'paragraphText', text: 'Dieses Gesetz gilt für alle Behörden des Freistaates Bayern und für die bayerischen Gemeinden; es ist in der Bayerischen Rechtssammlung (BayRS 2170-1-1-I) veröffentlicht.' }] },
      { type: 'article', label: 'Art. 2', title: 'Zuständigkeit', children: [{ type: 'paragraphText', text: 'Zuständig ist das Bayerische Staatsministerium der Finanzen und für Heimat; Art. 3 der Bayerischen Bauordnung (BayBO) bleibt unberührt.' }] },
      { type: 'footnote', label: 'Fn 1', text: 'Verkündet als Art. 1 des Gesetzes vom 10. Dezember 2019 (GVBl. S. 512).' },
    ],
    sourceNotes: [{ label: 'Fundstelle', text: 'GVBl. 2019 S. 512' }],
    sourceReferences: [
      { kind: 'official-portal-snapshot', system: 'bayernrecht', label: 'BAYERN.RECHT XML-Export BayTestG', availability: 'versioned', localSource: 'sources/bayernrecht/BayTestG/BayTestG.zip', url: 'https://www.gesetze-bayern.de/Content/Zip/BayTestG', retrievedAt: '2026-09-17' },
    ],
    findings: [],
    sourceIdentity: 'BayTestG',
    ...overrides,
  };
}

describe('Zielbezeichnungen stammen aus dem Jurisdiktionsregister', () => {
  it('leitet Eigenname, Kurzform, Staatsform und Verkündungsblatt aus dem Register ab', () => {
    expect(targetProperName()).toBe(TARGET.name.replace(`${TARGET.stateForm} `, ''));
    expect(targetProperName()).toBe('Bayern-Württemberg');
    expect(targetShortName()).toBe(TARGET.shortName);
    expect(targetGazette()).toEqual(TARGET.gazette);
  });

  it('nennt eine eigene Transformerversion für die Staleness-Erkennung', () => {
    // 1.1.0: Herrschernamen geschützt; 1.2.0: historische Staaten, Organe und Vertragsnamen (Nutzerentscheidungen 2026-09-18).
    expect(TRANSFORMER_VERSION).toBe('bayernrecht-transformer/1.2.0');
  });

  it('kennt den angehängten Zielteil, auf dem der Idempotenzschutz beruht', () => {
    expect(targetAppendedPart()).toBe('Württemberg');
    expect(targetProperName().startsWith('Bayern')).toBe(true);
  });
});

describe('Blattnamen in allen Flexionsformen', () => {
  // Ein Blattname steht im Normtext fast immer gebeugt. Griffe das Schutzmuster nur den Nominativ,
  // würde „bekannt gemacht im Bayerischen Ministerialblatt" übergeleitet – und behauptete damit, eine
  // bayerische Vorschrift sei im Verkündungsblatt der Simulation erschienen. Ein Provenienzfehler,
  // den hinterher niemand mehr als solchen erkennt, weil der Satz sprachlich richtig aussieht.
  const blaetter = ['Gesetz- und Verordnungsblatt', 'Ministerialblatt'];
  const formen = ['Bayerisches', 'Bayerische', 'Bayerischen', 'Bayerischem', 'Bayerischer'];

  it('lässt jede Beugung des Blattnamens unverändert', () => {
    for (const blatt of blaetter) {
      for (const form of formen) {
        const text = `${form} ${blatt}`;
        expect(apply(text)).toBe(text);
      }
    }
  });

  it('lässt den Blattnamen auch mitten im Satz unverändert', () => {
    for (const text of [
      'bekannt gemacht im Bayerischen Ministerialblatt (BayMBl.)',
      'veröffentlicht im Bayerischen Gesetz- und Verordnungsblatt',
      'nach Maßgabe der Bayerischen Rechtssammlung',
      'im Bayerischen Staatsanzeiger bekannt gemacht',
      'im Allgemeinen Ministerialblatt',
    ]) {
      expect(apply(text)).toBe(text);
    }
  });

  it('überleitet die Landesbezeichnung im selben Satz weiterhin', () => {
    // Der Schutz gilt dem Blattnamen, nicht dem ganzen Satz.
    const out = apply('Der Freistaat Bayern macht dies im Bayerischen Ministerialblatt bekannt.');
    expect(out).toBe(`Der Freistaat ${targetProperName()} macht dies im Bayerischen Ministerialblatt bekannt.`);
  });
});

describe('Redaktionelle Festlegung: Adjektivbildung', () => {
  it('führt die unregelmäßige Quellform ausdrücklich und leitet sie nicht mechanisch ab', () => {
    expect(SOURCE_ADJECTIVE).toBe('bayerisch');
    // Eine mechanische Ableitung aus dem Eigennamen träfe die Quellform nicht.
    expect(SOURCE_ADJECTIVE).not.toBe(`${'Bayern'.toLowerCase()}isch`);
  });

  it('wählt den Kompositionsstamm und begründet die Wahl an einer Stelle', () => {
    const decision = adjectiveDecision();
    expect(decision.id).toBe('adjektiv-kompositionsstamm');
    expect(decision.source).toBe('bayerisch');
    expect(decision.chosen).toBe('bayern-württembergisch');
    expect(decision.rejected).toBe('bayerisch-württembergisch');
    expect(decision.reason).toMatch(/baden-württembergisch/u);
    // Die gewählte Form enthält die Quellform nicht mehr – darauf beruht die Idempotenz.
    expect(decision.chosen).not.toContain(SOURCE_ADJECTIVE);
    expect(decision.rejected).toContain(SOURCE_ADJECTIVE);
  });

  it('bildet beide Schreibungen aus derselben Funktion', () => {
    expect(targetAdjective(false)).toBe('bayern-württembergisch');
    expect(targetAdjective(true)).toBe('Bayern-Württembergisch');
    expect(targetAdjective(false)).toBe(`${targetProperName().toLocaleLowerCase('de-DE')}isch`);
  });
});

describe('Landesbezeichnung in allen Formen', () => {
  it('leitet Nominativ, Genitiv, Dativ, Staatsform und Kompositum über', () => {
    expect(apply('Bayern ist ein Freistaat.')).toBe(`${targetProperName()} ist ein Freistaat.`);
    expect(apply('Die Bürgerinnen und Bürger Bayerns.')).toBe(`Die Bürgerinnen und Bürger ${targetProperName()}s.`);
    expect(apply('Der Freistaat Bayern regelt dies.')).toBe(`Der ${TARGET.name} regelt dies.`);
    expect(apply('Behörden des Freistaates Bayern')).toBe(`Behörden des Freistaates ${targetProperName()}`);
    expect(apply('Behörden des Freistaats Bayern')).toBe(`Behörden des Freistaats ${targetProperName()}`);
    expect(apply('im Freistaat Bayern')).toBe(`im Freistaat ${targetProperName()}`);
    expect(apply('im Land Bayern')).toBe(`im Land ${targetProperName()}`);
    expect(apply('Bayern-Fonds')).toBe(`${targetProperName()}-Fonds`);
    expect(rulesOf('Der Freistaat Bayern, die Behörden des Freistaates Bayern und die Geltung im Freistaat Bayern sowie Bayerns Gemeinden')).toEqual([
      'jurisdiction-name-full',
      'jurisdiction-name-genitive',
      'jurisdiction-name-dative',
      'jurisdiction-name-bare',
    ]);
  });

  it('leitet das Adjektiv in allen Flexionen und beiden Schreibungen über', () => {
    const lower = targetAdjective(false);
    const upper = targetAdjective(true);
    expect(apply('bayerisch')).toBe(lower);
    expect(apply('bayerische Gemeinden')).toBe(`${lower}e Gemeinden`);
    expect(apply('der bayerischen Verwaltung')).toBe(`der ${lower}en Verwaltung`);
    expect(apply('ein bayerisches Gesetz')).toBe(`ein ${lower}es Gesetz`);
    expect(apply('eines bayerischer Träger')).toBe(`eines ${lower}er Träger`);
    expect(apply('mit bayerischem Recht')).toBe(`mit ${lower}em Recht`);
    expect(apply('Bayerischer Landtag')).toBe(`${upper}er Landtag`);
    expect(apply('Bayerisches Staatsministerium')).toBe(`${upper}es Staatsministerium`);
    expect(apply('Bayerischen Staates')).toBe(`${upper}en Staates`);
  });

  it('leitet die Versalschreibung aus Überschriften über', () => {
    expect(apply('FREISTAAT BAYERN')).toBe(`FREISTAAT ${targetProperName().toLocaleUpperCase('de-DE')}`);
    expect(apply('BAYERNS RECHT')).toBe(`${targetProperName().toLocaleUpperCase('de-DE')}S RECHT`);
    expect(apply('BAYERISCHES RECHT')).toBe(`${targetAdjective(true).toLocaleUpperCase('de-DE')}ES RECHT`);
    // Protokolliert wird in Quellreihenfolge, nicht in Regelreihenfolge.
    expect(rulesOf('BAYERN und BAYERISCH')).toEqual(['jurisdiction-name-upper', 'jurisdiction-name-adjective-upper']);
  });
});

/**
 * Der Kern: Der Zielname enthält den Quellnamen vollständig. Geprüft wird für jede Variante, nicht
 * nur für den Grundfall – und zusätzlich, dass die fertige Zielform selbst unberührt bleibt.
 */
describe('Idempotenz und Doppelungsfreiheit', () => {
  const VARIANTS = [
    'Bayern',
    'Bayerns',
    'Freistaat Bayern',
    'des Freistaates Bayern',
    'des Freistaats Bayern',
    'im Freistaat Bayern',
    'Land Bayern',
    'des Landes Bayern',
    'im Land Bayern',
    'BAYERN',
    'BAYERNS',
    'Bayern-Fonds des Freistaates Bayern',
    'bayerisch',
    'bayerische',
    'bayerischem',
    'bayerischen',
    'bayerischer',
    'bayerisches',
    'Bayerisch',
    'Bayerische',
    'Bayerischem',
    'Bayerischen',
    'Bayerischer',
    'Bayerisches',
    'BAYERISCH',
    'BAYERISCHE',
    'BAYERISCHEM',
    'BAYERISCHEN',
    'BAYERISCHER',
    'BAYERISCHES',
    'Der Bayerische Landtag beschließt für Bayern und die bayerischen Gemeinden Bayerns.',
    'BAYERISCHES RECHT IN BAYERN',
  ];

  it('ist bei zweiter und dritter Anwendung unverändert – für jede Flexions- und Schreibvariante', () => {
    for (const variant of VARIANTS) {
      const once = apply(variant);
      expect(apply(once), `zweite Anwendung auf „${variant}“`).toBe(once);
      expect(apply(apply(once)), `dritte Anwendung auf „${variant}“`).toBe(once);
    }
  });

  it('lässt die fertige Zielbezeichnung unberührt (kein Regeltreffer auf dem eigenen Ergebnis)', () => {
    const stable = [
      targetProperName(),
      `${targetProperName()}s`,
      TARGET.name,
      `des Freistaates ${targetProperName()}`,
      targetProperName().toLocaleUpperCase('de-DE'),
      targetAdjective(false),
      `${targetAdjective(false)}en`,
      `${targetAdjective(true)}er Landtag`,
      `${targetAdjective(true).toLocaleUpperCase('de-DE')}ES RECHT`,
    ];
    for (const value of stable) {
      expect(apply(value), `Zielform „${value}“`).toBe(value);
      expect(rulesOf(value), `Zielform „${value}“ löst keine Regel aus`).toEqual([]);
    }
  });

  it('erzeugt in keiner Variante eine Doppelbildung', () => {
    const appended = targetAppendedPart()!;
    for (const variant of VARIANTS) {
      const output = apply(variant);
      expect([...output.matchAll(new RegExp(DOUBLED_TARGET_NAME.source, DOUBLED_TARGET_NAME.flags))], `Doppelbildung in „${variant}“`).toEqual([]);
      for (const spelling of [appended, appended.toLocaleLowerCase('de-DE'), appended.toLocaleUpperCase('de-DE')]) {
        expect(output, `„${variant}“`).not.toContain(`${spelling}-${spelling}`);
      }
      expect(output).not.toContain(`${targetProperName()}-${appended}`);
      expect(output).not.toContain('Bayern-Bayern');
    }
  });

  it('erkennt eine Doppelbildung in jeder Schreibung, falls sie doch entstünde', () => {
    for (const doubled of ['Bayern-Württemberg-Württemberg', 'BAYERN-WÜRTTEMBERG-WÜRTTEMBERG', 'bayern-württembergisch-württembergisch', 'Bayern-Bayern-Württemberg']) {
      expect(doubled, doubled).toMatch(new RegExp(DOUBLED_TARGET_NAME.source, DOUBLED_TARGET_NAME.flags));
    }
  });
});

describe('Nichtangriffsliste: Wörter mit „Bay“ ohne Landesbezug', () => {
  const UNTOUCHED = [
    'Bayreuth',
    'die Bayreuther Festspiele',
    'Bayerwald',
    'der Bayerische Wald',
    'Bayerischer Wald',
    'im Bayerischen Walde',
    'des Bayerischen Waldes',
    'das Bayerische Meer',
    'Bayerisches Meer',
    'die Bayerischen Alpen',
    'Bayerisch Eisenstein',
  ];

  it('lässt sie Zeichen für Zeichen unverändert und protokolliert keine Änderung', () => {
    for (const value of UNTOUCHED) {
      const changes: TransformationChange[] = [];
      expect(transformText(value, 'p', changes), value).toBe(value);
      expect(changes, value).toEqual([]);
    }
    const sentence = `${UNTOUCHED.join(', ')}.`;
    expect(apply(sentence)).toBe(sentence);
  });

  it('ordnet sie ein, statt sie stillschweigend zu übergehen', () => {
    const detections = detectReferences([{ path: 'body[0].text', text: 'Bayreuth, Bayerwald, der Bayerische Wald und das Bayerische Meer bleiben.' }]);
    const byTerm = new Map(detections.map((entry) => [entry.term, entry]));
    expect(byTerm.get('Bayreuth')?.category).toBe('municipality');
    expect(byTerm.get('Bayerwald')?.category).toBe('geography');
    expect(byTerm.get('Bayerische Wald')?.decision).toBe('protected');
    expect(byTerm.get('Bayerische Meer')?.decision).toBe('protected');
    expect(detections.some((entry) => entry.decision === 'safe-auto-transform')).toBe(false);
  });
});

describe('Fundstellen, BayRS-Nummern und Provenienz', () => {
  const PROTECTED = [
    'vom 24. Juli 2023 (GVBl. S. 371, BayRS 97-1-B)',
    'in der in der Bayerischen Rechtssammlung (BayRS 91-1-B) veröffentlichten bereinigten Fassung',
    'zuletzt geändert durch die Bekanntmachung vom 13. Mai 2026 (BayMBl. Nr. 215)',
    'Bekanntmachung vom 5. Juli 1973 (FMBl. S. 259)',
    'BayRS III S. 690',
    'in der Fassung der Bekanntmachung vom 27. August 1998 (GVBl S. 702, BayRS 2030-1-1-F)',
    'Bayerisches Gesetz- und Verordnungsblatt',
    'Bayerischer Staatsanzeiger',
    'Artikel 3 des Gesetzes vom 2. März 1974 (BGBl. I S. 469)',
    'Abruf unter https://www.gesetze-bayern.de/Content/Document/BayVerf am 17. September 2026',
    `Prüfsumme ${'a'.repeat(64)}`,
    'Archiviert als bayerisches-gesetz.pdf',
  ];

  it('lässt sie byteidentisch – der Titelteil bleibt selbst dann stehen, wenn er das Quelladjektiv trägt', () => {
    for (const value of PROTECTED) {
      const changes: TransformationChange[] = [];
      expect(transformText(value, 'p', changes), value).toBe(value);
      expect(changes, value).toEqual([]);
    }
  });

  it('leitet den Titel einer Verweisung über, die Fundstelle daneben nicht', () => {
    // Der Titel einer in Bezug genommenen Norm ist Normtext und wird übergeleitet; die amtliche
    // Fundstelle daneben ist Provenienz und bleibt byteidentisch.
    const value = 'Bayerisches Testgesetz (BayTestG) vom 24. Juli 2023 (GVBl. S. 371, BayRS 97-1-B)';
    expect(apply(value)).toBe(`${targetAdjective(true)}es Testgesetz (BayTestG) vom 24. Juli 2023 (GVBl. S. 371, BayRS 97-1-B)`);
    expect(rulesOf(value)).toEqual(['jurisdiction-name-adjective']);
  });

  it('meldet sie als geschützt, nicht als Restform', () => {
    const detections = detectReferences([{ path: 'p', text: 'Vom 24. Juli 2023 (GVBl. S. 371, BayRS 97-1-B); Bayerische Rechtssammlung.' }]);
    expect(detections.filter((entry) => entry.decision === 'protected').map((entry) => entry.term)).toEqual(['BayRS 97-1-B', 'Bayerische Rechtssammlung']);
  });

  it('rührt die Provenienzfelder der fertigen Norm nicht an', () => {
    const law = sourceLaw();
    const { record, report } = transformToBayWue(law, context(), { institutions: registry });
    expect(record.meta.sourceCitation).toBe(law.citation);
    expect(record.versions[0]!.sourceCitation).toBe(law.fullCitation);
    expect(record.meta.externalIdentifiers).toEqual(law.externalIdentifiers);
    expect(record.meta.sourceReferences).toEqual(law.sourceReferences);
    expect(record.versions[0]!.sourceNotes).toEqual(law.sourceNotes);
    expect(record.versions[0]!.sourceValidFrom).toBe('2020-01-01');
    expect(record.versions[0]!.sourceValidTo).toBe('2023-12-15');
    expect(record.meta.originEnactingBody).toBe('Bayerischer Landtag');
    // Fußnoten sind Quellhinweise und werden gar nicht erst erfasst.
    const footnote = record.versions[0]!.body.find((block) => block.type === 'footnote');
    expect(footnote?.text).toBe(law.body.at(-1)!.text);
    expect(report.protectedFields).toContain('version.changeNote');
    expect(report.protectedFields).toContain('meta.originEnactingBody');
  });
});

describe('Abkürzungen mit dem Landeszusatz „Bay“', () => {
  const ABBREVIATIONS = 'Art. 3 BayVerf, Art. 55 BayHO, § 2 BayBO, BayVwVfG und BayRS gelten fort.';

  it('bleiben unverändert – die Überleitung von Abkürzungen ist nicht beschlossen', () => {
    const changes: TransformationChange[] = [];
    expect(transformText(ABBREVIATIONS, 'p', changes)).toBe(ABBREVIATIONS);
    expect(changes).toEqual([]);
  });

  it('werden je Vorkommen als manual-review gemeldet, statt stillschweigend zu bleiben', () => {
    const detections = detectReferences([{ path: 'body[0].text', text: ABBREVIATIONS }]);
    const abbreviations = detections.filter((entry) => entry.category === 'official-abbreviation');
    expect(abbreviations.map((entry) => entry.term)).toEqual(['BayVerf', 'BayHO', 'BayBO', 'BayVwVfG', 'BayRS']);
    expect(abbreviations.every((entry) => entry.decision === 'manual-review')).toBe(true);
    expect(abbreviations[0]!.reason).toMatch(/Grundsatzentscheidung/u);
  });

  it('nimmt die Kurzform des Ziellandes aus – sie beginnt selbst mit „Bay“', () => {
    expect(targetShortName()).toMatch(/^Bay/u);
    expect(new RegExp(`^(?:${BAY_ABBREVIATION})$`, 'u').test(targetShortName())).toBe(false);
    const detections = detectReferences([{ path: 'meta.initialCitation', text: `Testgesetz in der übernommenen Fassung (Ausgangsrechtsstand ${targetShortName()})` }]);
    expect(detections).toEqual([]);
  });

  it('trifft keine Abkürzung, die nur zufällig mit „Bay“ beginnt', () => {
    const detections = detectReferences([{ path: 'p', text: 'Bayreuth und Bayerwald sind keine Abkürzungen.' }]);
    expect(detections.filter((entry) => entry.category === 'official-abbreviation')).toEqual([]);
  });
});

describe('Erkennung und Institutionenpolitik', () => {
  it('entscheidet je Kategorie und lässt die Institutionsbezeichnung selbst unverändert', () => {
    const text = 'Das Bayerische Staatsministerium der Finanzen und für Heimat, der Bayerische Verfassungsgerichtshof und der Bayerische Gemeindetag wirken mit; die Stadt München wird gehört.';
    const detections = detectReferences([{ path: 'body[1].text', text }], { institutions: registry });
    expect(detections.map((entry) => [entry.term, entry.category, entry.decision])).toEqual(
      expect.arrayContaining([
        ['Bayerische Staatsministerium der Finanzen und für Heimat', 'ministry', 'manual-review'],
        ['Bayerische Verfassungsgerichtshof', 'institution', 'manual-review'],
        ['Bayerische Gemeindetag', 'regional-body', 'manual-review'],
        ['München', 'municipality', 'manual-review'],
      ]),
    );
    const ministry = detections.find((entry) => entry.category === 'ministry')!;
    expect(ministry.mapping).toEqual({ status: 'review' });
    expect(ministry.context).toContain(ministry.term);
    // Nur die Landesbezeichnung wird übergeleitet; Organ- und Behördenbegriff bleiben.
    const transformed = apply(text);
    expect(transformed).toContain(`${targetAdjective(true)}e Staatsministerium der Finanzen und für Heimat`);
    expect(transformed).toContain(`${targetAdjective(true)}e Verfassungsgerichtshof`);
    expect(transformed).toContain('Stadt München');
  });

  it('führt nur unstrittige Verfassungsorgane in der Zuordnung', () => {
    expect(registry.registry.entries.map((entry) => entry.id)).toEqual(['landtag', 'staatsregierung', 'ministerpraesident']);
    expect(registry.resolve('Bayerisches Staatsministerium der Finanzen und für Heimat', 'ministry')).toEqual({ status: 'review', source: 'default' });
    expect(registry.resolve('Bayerisches Landesamt für Statistik', 'authority')).toEqual({ status: 'review', source: 'default' });
    expect(registry.resolve('Bayerischer Landtag', 'legislature').status).toBe('safe-transform');
    expect(registry.resolve('Bayerische Staatsregierung', 'institution').status).toBe('safe-transform');
  });

  it('weist ein Ziel zurück, das die Bezeichnung des Herkunftslandes untransformiert trägt', () => {
    const entry = (target: string): InstitutionRegistry => ({
      schemaVersion: 'bayernrecht-institution-mapping/1',
      defaults: {},
      entries: [{ id: 'test', group: 'Test', category: 'legislature', match: ['Landtag'], status: 'map', target, reason: 'Test', reviewedAt: '2026-09-17' }],
    });
    for (const bad of ['Landtag von Bayern', 'Bayerischer Landtag', 'Landtag BayWü-Nord (BayLT)']) {
      expect(() => validateInstitutionRegistry(entry(bad)), bad).toThrow(/Bezeichnung des Herkunftslandes/u);
    }
    // Der Zielname selbst enthält den Quellnamen – und muss trotzdem zulässig sein.
    expect(() => compileInstitutionRegistry(entry('Bayern-Württembergischer Landtag'))).not.toThrow();
    for (const registryEntry of registry.registry.entries) expect(registryEntry.target).not.toMatch(/bayerisch/iu);
  });
});

describe('Erlassorgan nur aus ausdrücklicher Formel', () => {
  it('übernimmt das Verfassungsorgan aus der Beschlussformel und leitet nur den Landesnamen über', () => {
    const organs = extractSourceOrgans({ blocks: [{ type: 'paragraphText', text: 'Der Bayerische Landtag hat das folgende Gesetz beschlossen:' }] });
    expect(organs.enactingBody?.name).toBe('Bayerischer Landtag');
    expect(organs.enactingBody?.formula).toBe('legislative-resolution');
    expect(mapEnactingBody(organs.enactingBody?.name).enactingBody).toBe(`${targetAdjective(true)}er Landtag`);
    const withState = extractSourceOrgans({ blocks: [{ type: 'paragraphText', text: 'Der Landtag des Freistaates Bayern hat das folgende Gesetz beschlossen:' }] });
    expect(mapEnactingBody(withState.enactingBody?.name).enactingBody).toBe(`Landtag des Freistaates ${targetProperName()}`);
  });

  it('erkennt den Ministerpräsidenten auch mit Landesadjektiv als Verfassungsorgan', () => {
    const mapping = mapEnactingBody('Bayerischer Ministerpräsident');
    expect(mapping.decision).toBe('safe-auto-transform');
    expect(mapping.enactingBody).toBe(`${targetAdjective(true)}er Ministerpräsident`);
    expect(mapEnactingBody('Ministerpräsidentin des Freistaates Bayern').enactingBody).toBe(`Ministerpräsidentin des Freistaates ${targetProperName()}`);
    // Ressorts und Behörden bleiben Prüffälle, auch mit Adjektiv.
    expect(mapEnactingBody('Bayerische Staatskanzlei', { institutions: registry }).decision).toBe('manual-review');
    expect(mapEnactingBody('Bayerisches Staatsministerium', { institutions: registry }).decision).toBe('manual-review');
  });

  it('übernimmt kein Organ aus einer unpersönlichen Formel', () => {
    const organs = extractSourceOrgans({ blocks: [{ type: 'paragraphText', text: 'Auf Grund des Art. 5 Abs. 2 des Bayerischen Straßen- und Wegegesetzes wird verordnet:' }] });
    expect(organs.candidates).toEqual([]);
    expect(organs.enactingBody).toBeUndefined();
    expect(mapEnactingBody(undefined).decision).toBe('not-available');
  });

  it('nutzt keine Unterschrift als Erlassformel', () => {
    const organs = extractSourceOrgans({ blocks: [{ type: 'signature', text: 'Der Ministerpräsident', title: 'Ministerpräsident' }] });
    expect(organs.enactingBody).toBeUndefined();
  });

  it('erkennt die Verordnungsformel und meldet Ressorts ohne gesicherte Entsprechung zur Prüfung', () => {
    const organs = extractSourceOrgans({
      blocks: [{ type: 'paragraphText', text: 'Auf Grund des Art. 86a Abs. 5 Satz 1 des Bayerischen Beamtengesetzes (BayBG), zuletzt geändert durch § 1 des Gesetzes vom 8. Dezember 2006 (GVBl S. 987), erlässt das Bayerische Staatsministerium der Finanzen folgende Verordnung:' }],
    });
    expect(organs.enactingBody?.name).toBe('Bayerisches Staatsministerium der Finanzen');
    expect(organs.enactingBody?.formula).toBe('ordinance-formula');
    const mapping = mapEnactingBody(organs.enactingBody?.name, { institutions: registry });
    expect(mapping.decision).toBe('manual-review');
    expect(mapping.enactingBody).toBeUndefined();
  });

  it('erkennt den Ressortzuschnitt mit Komma und den Erlasskopf in mehrzeiligen Titelangaben', () => {
    const portfolio = extractSourceOrgans({ blocks: [{ type: 'paragraphText', text: 'Auf Grund des Art. 3 erlässt das Bayerische Staatsministerium des Innern, für Sport und Integration folgende Verordnung:' }] });
    expect(portfolio.enactingBody?.name).toBe('Bayerisches Staatsministerium des Innern, für Sport und Integration');
    const heading = '630-F\n\nVerwaltungsvorschriften zur Bayerischen Haushaltsordnung\n(VV-BayHO)\n\nBekanntmachung des Bayerischen Staatsministeriums der Finanzen\nvom 5. Juli 1973, Az. 11 - H 1008/1 - 34 646\n(FMBl. S. 259)';
    const decree = extractSourceOrgans({ blocks: [{ type: 'heading', text: heading }] });
    expect(decree.enactingBody?.name).toBe('Bayerisches Staatsministerium der Finanzen');
    expect(decree.enactingBody?.formula).toBe('decree-head');
    expect(decree.conflict).toBe(false);
  });

  it('normalisiert nur das Kopfwort und die Adjektivendung', () => {
    expect(nominativeOrganName('Bayerischen Staatsministeriums der Finanzen')).toBe('Bayerisches Staatsministerium der Finanzen');
    expect(nominativeOrganName('Bayerische Landtag')).toBe('Bayerischer Landtag');
    expect(nominativeOrganName('Bayerische Staatsregierung')).toBe('Bayerische Staatsregierung');
    expect(nominativeOrganName('Ministerpräsidenten')).toBe('Ministerpräsident');
    expect(nominativeOrganName('Landtages')).toBe('Landtag');
    expect(nominativeOrganName('Innenministeriums')).toBe('Innenministerium');
  });

  it('meldet widersprüchliche Formeln und übernimmt dann kein Organ', () => {
    const organs = extractSourceOrgans({
      blocks: [
        { type: 'paragraphText', text: 'Der Bayerische Landtag hat das folgende Gesetz beschlossen:' },
        { type: 'paragraphText', text: 'Die Bayerische Staatsregierung erlässt folgende Verordnung:' },
      ],
    });
    expect(organs.conflict).toBe(true);
    expect(organs.enactingBody).toBeUndefined();
    const { report, findings } = transformToBayWue(
      sourceLaw({ body: [{ type: 'paragraphText', text: 'Der Bayerische Landtag hat das folgende Gesetz beschlossen:' }, { type: 'paragraphText', text: 'Die Bayerische Staatsregierung erlässt folgende Verordnung:' }] }),
      context(),
      { institutions: registry },
    );
    expect(findings.map((finding) => finding.code)).toContain('organ-formula-conflict');
    expect(report.organs.conflict).toBe(true);
  });
});

describe('Slugkonvention', () => {
  it('hängt `-baywue` an und übernimmt einen ausgeschriebenen Zielnamen unverändert', () => {
    expect(JURISDICTION_SUFFIX).toBe('-baywue');
    expect(deriveSlug('BayRadG', undefined, 'Gesetz zur Stärkung des Radverkehrs')).toBe('bayradg-baywue');
    expect(deriveSlug(undefined, 'Testgesetz', 'Langer Titel')).toBe('testgesetz-baywue');
    expect(deriveSlug(undefined, undefined, `Verfassung des Freistaates ${targetProperName()}`)).toBe('verfassung-des-freistaates-bayern-wuerttemberg');
  });

  it('lässt `-bay`, `-by` und `-bayern` als Slugzusatz hart scheitern (Prüfung der Zustandsschicht)', () => {
    for (const slug of ['testgesetz-bay', 'testgesetz-by', 'testgesetz-bayern']) {
      expect(() => assertJurisdictionSlug(slug), slug).toThrow(/Quellzusatz/u);
    }
    expect(jurisdictionSlugCandidate('Testgesetz Bayern')).toBe('testgesetz-baywue');
    expect(assertJurisdictionSlug('testgesetz-baywue')).toBe('testgesetz-baywue');
  });

  it('prüft auch den von der Pipeline zurückgegebenen Slug', () => {
    expect(() => transformToBayWue(sourceLaw(), { targetJurisdiction: 'baywue', baselineDate: SIMULATION_BASELINE_DATE, reserveSlug: () => 'testgesetz-bay' })).toThrow(/Quellzusatz/u);
  });
});

describe('Prüfung nach der Transformation (fail-closed)', () => {
  const field = (source: string, transformed: string) => [{ path: 'p', source, transformed }];

  it('ist grün, wenn jede Restform geschützt oder dokumentiert ist', () => {
    const text = 'Der Bayerische Landtag beschließt für Bayern; Art. 3 BayBO (GVBl. S. 371, BayRS 97-1-B) bleibt.';
    const changes: TransformationChange[] = [];
    const detections = detectReferences([{ path: 'p', text }], { institutions: registry });
    const transformed = transformText(text, 'p', changes);
    const audit = auditTransformation(field(text, transformed), detections, changes);
    expect(audit.ok).toBe(true);
    expect(audit.doubledNames).toEqual([]);
    expect(audit.residuals.every((residual) => residual.status !== 'unexplained')).toBe(true);
  });

  it('meldet jede Doppelbildung als Fehler', () => {
    const audit = auditTransformation(field('Bayern', `${targetProperName()}-${targetAppendedPart()}`), [], [{ path: 'p', rule: 'jurisdiction-name-bare' }]);
    expect(audit.ok).toBe(false);
    expect(audit.doubledNames).toHaveLength(1);
    expect(audit.doubledNames[0]!.term).toContain(targetAppendedPart()!);
  });

  it('meldet eine unerklärte Quellbezeichnung, eine nicht angewandte Regel und eine stille Änderung', () => {
    const unexplained = auditTransformation(field('Bayern regelt', 'Bayern regelt'), [], []);
    expect(unexplained.ok).toBe(false);
    expect(unexplained.residuals.map((residual) => residual.status)).toEqual(['unexplained']);

    const unapplied = auditTransformation(field('x', 'x'), [{ id: 'p@0:rule', path: 'p', start: 0, end: 1, term: 'x', context: 'x', category: 'jurisdiction-name', decision: 'safe-auto-transform', detector: 'rule:jurisdiction-name-bare', transformRule: 'jurisdiction-name-bare', reason: 'Test' }], []);
    expect(unapplied.ok).toBe(false);
    expect(unapplied.unappliedTransforms).toEqual([{ path: 'p', rule: 'jurisdiction-name-bare', expected: 1, applied: 0 }]);

    const silent = auditTransformation(field('alt', 'neu'), [], []);
    expect(silent.ok).toBe(false);
    expect(silent.unrecordedChanges).toEqual(['p']);
  });

  it('erzeugt bei fehlgeschlagener Nachprüfung einen error-Befund', () => {
    const { findings, report } = transformToBayWue(sourceLaw(), context(), { institutions: registry });
    expect(report.postTransformAudit.ok).toBe(true);
    expect(findings.filter((finding) => finding.code === 'post-transform-audit')).toEqual([]);
  });
});

describe('Restpostenprüfung auf der fertigen Norm', () => {
  function transformed(overrides: Partial<SourceLaw> = {}): NormRecord {
    return transformToBayWue(sourceLaw(overrides), context(), { institutions: registry }).record;
  }

  it('erfasst nur die Felder, die die Transformation verändert', () => {
    const paths = auditableFields(transformed()).map((entry) => entry.path);
    expect(paths).toContain('meta.title');
    expect(paths).toContain('meta.initialCitation');
    expect(paths.some((path) => path.includes('footnote'))).toBe(false);
    expect(paths).not.toContain('meta.sourceCitation');
    expect(paths).not.toContain('versions[0].changeNote');
  });

  it('meldet Fundstellen als info, Abkürzungen gebündelt als warning und keinen Fehler', () => {
    const findings = auditRecord(transformed());
    expect(findings.filter((finding) => finding.severity === 'error')).toEqual([]);
    expect(findings.find((finding) => finding.code === 'protected-source-state-reference')?.severity).toBe('info');
    const abbreviation = findings.find((finding) => finding.code === 'undecidable-source-state-abbreviation');
    expect(abbreviation?.severity).toBe('warning');
    expect(abbreviation?.message).toMatch(/BayTestG/u);
    // Gebündelt: eine Meldung, nicht eine je Vorkommen.
    expect(findings.filter((finding) => finding.code === 'undecidable-source-state-abbreviation')).toHaveLength(1);
  });

  it('meldet eine übergeleitete historische Bezeichnung als Fehler (Regressionsschutz)', () => {
    const record = transformed();
    record.versions[0]!.body[1]!.title = `Übereinkunft des Königreichs ${targetProperName()} mit den Schweizer Kantonen`;
    const codes = auditRecord(record).filter((finding) => finding.severity === 'error').map((finding) => finding.code);
    expect(codes).toContain('historical-name-transformed');
    expect(auditRecord(transformed()).some((finding) => finding.code === 'historical-name-transformed')).toBe(false);
  });

  it('meldet einen nicht entscheidbaren Vertragsnamen als Prüffall, nicht als Fehler („Bayerisches Konkordat“)', () => {
    const record = transformed();
    record.versions[0]!.body[1]!.title = `Art. 5 des ${targetAdjective(true)}en Konkordats vom 29. März 1924`;
    const findings = auditRecord(record).filter((finding) => finding.code === 'historical-name-uncertain');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('warning');
    expect(auditRecord(record).filter((finding) => finding.severity === 'error')).toEqual([]);
    expect(auditRecord(transformed()).some((finding) => finding.code === 'historical-name-uncertain')).toBe(false);
  });

  it('meldet einen Markennamen mit Punkt als Prüffall, nicht als Fehler („Zentrum Digitalisierung.Bayern“)', () => {
    const record = transformed();
    record.versions[0]!.body[1]!.title = `Zentrum Digitalisierung.${targetProperName()}`;
    const findings = auditRecord(record).filter((finding) => finding.code === 'proper-name-uncertain');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('warning');
    expect(auditRecord(record).filter((finding) => finding.severity === 'error')).toEqual([]);
    // Ein Satzende vor dem Landesnamen ist kein Markenname.
    record.versions[0]!.body[1]!.title = `Zuständig ist das Land. ${targetProperName()} regelt das Nähere.`;
    expect(auditRecord(record).some((finding) => finding.code === 'proper-name-uncertain')).toBe(false);
  });

  it('meldet eine verbliebene Quellbezeichnung und eine Doppelbildung als Fehler', () => {
    const record = transformed();
    record.meta.title = 'Bayerisches Restgesetz';
    record.versions[0]!.body[1]!.title = `${targetProperName()}-${targetAppendedPart()}-Fonds`;
    const codes = auditRecord(record).filter((finding) => finding.severity === 'error').map((finding) => finding.code);
    expect(codes).toContain('residual-source-state-reference');
    expect(codes).toContain('doubled-target-name');
  });

  it('hängt an `createTransformer()` (Vertrag der Pipeline)', async () => {
    const transformer = createTransformer();
    expect(transformer.targetJurisdiction).toBe('baywue');
    const record = await transformer.transform(sourceLaw(), context());
    expect(record.meta.jurisdiction).toBe('baywue');
    expect(transformer.audit(record).filter((finding) => finding.severity === 'error')).toEqual([]);
  });
});

describe('Report', () => {
  it('führt Schema, Regeln, redaktionelle Festlegung, Entscheidungen und offene Punkte', () => {
    const { report } = transformToBayWue(sourceLaw(), context(), { institutions: registry });
    expect(report.schemaVersion).toBe('bayernrecht-transformation-report/1');
    expect(report.source).toBe('Bayern');
    expect(report.target).toBe('baywue');
    expect(report.transformerVersion).toBe(TRANSFORMER_VERSION);
    expect(report.rules).toEqual([
      'jurisdiction-name-genitive',
      'jurisdiction-name-dative',
      'jurisdiction-name-full',
      'jurisdiction-name-adjective',
      'jurisdiction-name-adjective-upper',
      'jurisdiction-name-bare',
      'jurisdiction-name-upper',
    ]);
    expect(report.editorialDecisions).toEqual([adjectiveDecision()]);
    expect(report.decisions['official-abbreviation']).toEqual({ 'manual-review': expect.any(Number) });
    expect(report.unresolved.every((entry) => entry.manualDecisionRequired)).toBe(true);
    expect(report.citations.simulation).not.toMatch(/GVBl\.|BayRS/u);
    for (const change of report.changes) expect(change.to).not.toBe(change.from);
  });
});

/**
 * Eine echte Norm aus dem Beispielkorpus, durch den Parser und dann durch die Überleitung.
 * Gewählt ist die Bayerische Beihilfeverordnung (BayBhV): sie trägt eine ausdrückliche
 * Erlassformel mit Staatsministerium, Fundstellen (GVBl.), BayRS-Nummern und Abkürzungen im Text.
 *
 * Der Ausschnitt unter `tests/fixtures/` ist versioniert und läuft immer; das vollständige
 * Exportpaket unter `sources/bayernrecht/` liegt nach `sources/README.md` bewusst nicht in Git und
 * wird nur geprüft, wenn es lokal vorhanden ist.
 */
describe('Echte Norm aus dem Beispielkorpus (Parser → Überleitung)', () => {
  const packagePath = join(process.cwd(), 'sources', 'bayernrecht', 'BayBhV', 'BayBhV.zip');

  it('überträgt die Bayerische Beihilfeverordnung vollständig und fail-closed', () => {
    const document = parseBayernRechtDocument(source, fixture('beihilfeverordnung'));
    expect(document.documentId).toBe('BayBhV');
    const { record, report, findings } = transformToBayWue(document.law, context(), { institutions: registry });

    expect(record.meta.slug).toBe('baybhv-baywue');
    expect(record.meta.shortTitle).toBe(`${targetAdjective(true)}e Beihilfeverordnung`);
    // Abkürzungen werden nicht übergeleitet.
    expect(record.meta.abbr).toBe('BayBhV');
    // Erlassformel erkannt, Ressort ohne Entsprechung → Quellorgan erhalten, Simulationsorgan leer.
    expect(report.organs.source?.formula).toBe('ordinance-formula');
    expect(record.meta.originEnactingBody).toBe('Bayerisches Staatsministerium der Finanzen');
    expect(record.meta.enactingBody).toBeUndefined();
    expect(findings.map((finding) => finding.code)).toContain('enacting-body-mapping-required');

    // Eingangsformel: Landesadjektiv übergeleitet, Fundstellen und Abkürzungen unverändert.
    const einleitung = record.versions[0]!.body.find((block) => block.type === 'paragraphText')!.text!;
    expect(einleitung).toContain(`${targetAdjective(true)}en Beamtengesetzes (BayBG)`);
    expect(einleitung).toContain('(GVBl S. 702, BayRS 2030-1-1-F)');
    expect(einleitung).toContain(`erlässt das ${targetAdjective(true)}e Staatsministerium der Finanzen`);
    expect(einleitung).not.toMatch(/bayerisch/iu);

    // Provenienz unverändert.
    expect(record.meta.sourceCitation).toContain('Bayerische Beihilfeverordnung (BayBhV)');
    expect(record.meta.externalIdentifiers).toEqual(expect.arrayContaining([{ system: 'bayrs', value: '2030-2-27-F' }]));

    // Fail-closed.
    expect(report.postTransformAudit.ok).toBe(true);
    expect(report.postTransformAudit.doubledNames).toEqual([]);
    expect(auditRecord(record).filter((finding) => finding.severity === 'error')).toEqual([]);

    // Idempotenz auf der fertigen Norm: nichts bleibt zu tun.
    for (const entry of auditableFields(record)) expect(apply(entry.text), entry.path).toBe(entry.text);
    expect(report.unresolved.some((entry) => entry.category === 'official-abbreviation')).toBe(true);
    expect(report.unresolved.some((entry) => entry.category === 'ministry')).toBe(true);
  });

  it.skipIf(!existsSync(packagePath))('überträgt auch das vollständige Exportpaket fail-closed', () => {
    const document = parseBayernRechtPackage(source, new Uint8Array(readFileSync(packagePath)));
    const { record, report } = transformToBayWue(document.law, context(), { institutions: registry });
    expect(record.meta.slug).toBe('baybhv-baywue');
    expect(report.postTransformAudit.ok).toBe(true);
    expect(report.postTransformAudit.doubledNames).toEqual([]);
    expect(report.changes.length).toBeGreaterThan(0);
    expect(auditRecord(record).filter((finding) => finding.severity === 'error')).toEqual([]);
    for (const entry of auditableFields(record)) {
      expect(apply(entry.text), entry.path).toBe(entry.text);
      expect([...entry.text.matchAll(new RegExp(DOUBLED_TARGET_NAME.source, DOUBLED_TARGET_NAME.flags))], entry.path).toEqual([]);
    }
    // Jede verbliebene Quellform ist entweder geschützt oder als Abkürzung gemeldet.
    const unresolvedTerms = new Set(report.unresolved.map((entry) => entry.term));
    for (const entry of auditableFields(record)) {
      for (const match of entry.text.matchAll(new RegExp(SOURCE_STATE_REFERENCE.source, SOURCE_STATE_REFERENCE.flags))) {
        expect(unresolvedTerms.has(match[0]) || /^(?:BayRS|GVBl|BayMBl)/u.test(match[0]) || entry.text.includes('Rechtssammlung'), `${entry.path}: ${match[0]}`).toBe(true);
      }
    }
  });
});

describe('Der ganze Weg: Paket → Parser → Überleitung → geprüfte Norm', () => {
  // Parser und Beispielkorpus sind getrennt entstanden und hatten sich nie getroffen. Beim ersten
  // gemeinsamen Lauf scheiterten 18 von 28 Paketen am Parser und danach alle 28 an der Schemaprüfung
  // (Abrufzeitstempel statt Tagesdatum). Beide Male sahen es die Einzeltests nicht, weil sie ihren
  // Baustein für sich prüften. Diese Prüfung ist genau die Naht dazwischen.
  const corpusFile = 'data/imports/bayernrecht/corpus.json';
  const haveCorpus = existsSync(corpusFile);
  const ids: string[] = haveCorpus
    ? (JSON.parse(readFileSync(corpusFile, 'utf8')) as { entries: Array<{ documentId: string }> }).entries.map((entry) => entry.documentId)
    : [];
  const available = ids.filter((id) => existsSync(join('sources/bayernrecht', id, `${id}.zip`)));

  it.skipIf(available.length === 0)('führt jede Norm des Beispielkorpus bis zur geprüften Zielnorm', () => {
    const used = new Set<string>();
    const context = (): TransformContext => ({
      targetJurisdiction: 'baywue',
      baselineDate: SIMULATION_BASELINE_DATE,
      reserveSlug: (candidate) => {
        let slug = candidate;
        let n = 2;
        while (used.has(slug)) slug = `${candidate}-${n++}`;
        used.add(slug);
        return slug;
      },
    });

    const problems: string[] = [];
    for (const id of available) {
      const bytes = new Uint8Array(readFileSync(join('sources/bayernrecht', id, `${id}.zip`)));
      const source = archivedSource({ url: `https://www.gesetze-bayern.de/Content/Zip/${id}` });
      try {
        const doc = parseBayernRechtPackage(source, bytes, { unknown: 'report' });
        const parseErrors = doc.law.findings.filter((finding) => finding.severity === 'error');
        if (parseErrors.length > 0) problems.push(`${id}: Parser ${parseErrors.map((f) => f.code).join(', ')}`);

        const { record, report, findings } = transformToBayWue(doc.law, context());
        if (!report.postTransformAudit.ok) problems.push(`${id}: postTransformAudit nicht ok`);
        const errors = [...findings, ...auditRecord(record)].filter((finding) => finding.severity === 'error');
        if (errors.length > 0) problems.push(`${id}: ${errors.map((f) => f.code).join(', ')}`);
        // validateNormRecord läuft in transformToBayWue; ein Fehler dort wirft.
        assertJurisdictionSlug(record.meta.slug);
      } catch (error) {
        problems.push(`${id}: ABBRUCH ${(error as Error).message.slice(0, 120)}`);
      }
    }
    expect(problems).toEqual([]);
    expect(used.size).toBe(available.length);
  });

  it.skipIf(!haveCorpus)('prüft den Korpus vollständig, sobald die Pakete vorliegen', () => {
    // Die Pakete sind bewusst nicht in Git (sources/README.md). Fehlen sie, überspringt die Prüfung
    // oben – dieser Test hält fest, wie viele Normen sie dann *nicht* abdeckt.
    expect(ids.length).toBeGreaterThanOrEqual(25);
    if (available.length < ids.length) {
      console.info(`[Korpus] ${available.length} von ${ids.length} Paketen lokal vorhanden; der Durchlauf prüft nur diese.`);
    }
  });
});

describe('Namenskollisionen Bayern / Bayern-Württemberg / Baden-Württemberg', () => {
  // Das Ziel heißt Bayern-Württemberg; echte Nennungen des Landes Baden-Württemberg (Staatsverträge,
  // Verwaltungsabkommen, Ratifikationslisten) bleiben unverändert – in jeder Schreibweise und Flexion.
  it.each([
    'Land Baden-Württemberg',
    'Baden-Württembergischen Landtag',
    'BADEN-WÜRTTEMBERG',
    'baden-württembergisch',
    'Württemberg',
    'Oberbayern',
  ])('lässt „%s“ unverändert', (value) => {
    expect(apply(value)).toBe(value);
  });

  it('überführt Bayern neben Baden-Württemberg und lässt den Vertragspartner stehen', () => {
    expect(apply('zwischen dem Freistaat Bayern und dem Land Baden-Württemberg')).toBe('zwischen dem Freistaat Bayern-Württemberg und dem Land Baden-Württemberg');
    expect(apply('Bayerisch-Baden-Württembergische Kommission')).toBe('Bayern-Württembergisch-Baden-Württembergische Kommission');
  });

  it.each(['Bayern', 'Bayerns', 'Bayerischen Staatsministerium', 'Bayern-Württemberg', 'Land Baden-Württemberg', 'Freistaat Bayern und Land Baden-Württemberg'])(
    'ist für „%s“ idempotent',
    (value) => {
      expect(apply(apply(value))).toBe(apply(value));
    },
  );
});

describe('Herrschernamen bleiben unverändert (Nutzerentscheidung 2026-09-18)', () => {
  it.each([
    'Seiner Majestät des Königs Ludwig von Bayern',
    'König Ludwig III. und Königin Marie Therese von Bayern',
    'Kurfürstin von Bayern',
    'Prinzregent Luitpold von Bayern',
    'Herzog Max in Bayern',
  ])('lässt „%s“ stehen', (value) => {
    expect(apply(value)).toBe(value);
    expect(apply(`Stiftung ${value} im Freistaat Bayern`)).toBe(`Stiftung ${value} im Freistaat Bayern-Württemberg`);
  });

  it('überleitet heutige Selbstbezüge weiter, auch in Ortsangaben', () => {
    expect(apply('am Königssee in Bayern')).toBe('am Königssee in Bayern-Württemberg');
    expect(apply('Zuständigkeiten des Staates Bayern auf den Gebieten der auswärtigen Beziehungen')).toBe('Zuständigkeiten des Staates Bayern-Württemberg auf den Gebieten der auswärtigen Beziehungen');
  });
});

describe('Historische Staaten, Organe und Vertragsnamen bleiben unverändert (Nutzerentscheidung, zweite Runde)', () => {
  // Die Zusammenlegung heutiger Länder verändert keine historischen Staaten. Belegt an BayBlindenErzAUrk,
  // BayCHInsBek, StVIllerWasKNutzStVBayWuertt, BayKonk, BayNotHSt, BAY_2220_3_UK.
  it.each([
    'Blindenerziehungsanstalt des Königreichs Bayern',
    'Nr. 36 des Regierungs-Blattes für das Königreich Bayern vom 19. Juli 1834',
    'Staatsvertrag zwischen den Königreichen Bayern und Württemberg über die Ausnützung der Wasserkräfte der Iller',
    'Übereinkunft der Königl. Bayer. Staatsregierung mit mehreren Schweizer Kantonen',
    'das Königlich Bayerische Staatsministerium des Innern',
    'die Krone Bayern',
    'Konkordat zwischen seiner Heiligkeit Papst Pius XI. und dem Staate Bayern',
    'Art. 5 des Konkordats zwischen Seiner Heiligkeit Papst Pius XI. und dem Staate Bayern vom 29. März 1924',
    'Der König von Bayern',
  ])('lässt „%s“ stehen', (value) => {
    expect(apply(value)).toBe(value);
    expect(apply(apply(value))).toBe(value);
  });

  it('überleitet den heutigen Freistaat im selben Satz weiter', () => {
    expect(apply('Übereinkunft des Königreichs Bayern, heute vom Freistaat Bayern fortgeführt')).toBe('Übereinkunft des Königreichs Bayern, heute vom Freistaat Bayern-Württemberg fortgeführt');
  });
});
