/**
 * Rückrechnung von Änderungen nach dem Stichtag (BayWü, Methode `reverse-amendment`).
 *
 * Eine falsch rückgerechnete Änderung erzeugt einen historischen Normtext, der echt aussieht und es
 * nicht ist. Die Tests halten deshalb vor allem fest, was **nicht** zurückgerechnet wird: Neufassungen,
 * Aufhebungen, Streichungen ohne Anker, Mehrdeutigkeit, ein Inkrafttreten vor dem Stichtag, eine
 * vorangehende Änderung ohne belegtes Inkrafttreten. Und sie beweisen jede unterstützte Formel vorwärts,
 * rückwärts und im Rundlauf.
 *
 * Alle Befehle sind **echte, gekürzte Änderungsbefehle** der Verkündungsplattform Bayern; die Körper
 * bestehen aus echtem Portaltext (BAYERN.RECHT), auf die betroffenen Glieder gekürzt. Die zwei
 * Verkündungsausschnitte liegen unter `tests/fixtures/bayernrecht/verkuendung-*.html`.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { applyReverseRecipe, forwardSteps, ReconstructionError, reverseSteps, verifyRoundTrip } from '@landesrecht/importer-bayernrecht/reconstruction/apply.ts';
import { checkChain, registerNote, type ChainInput } from '@landesrecht/importer-bayernrecht/reconstruction/chain.ts';
import { commencementDate, commencementFor, effectiveDateVerdict, ownCommencement } from '@landesrecht/importer-bayernrecht/reconstruction/commencement.ts';
import { maskQuotes, parseCommand, type ParsedOperation } from '@landesrecht/importer-bayernrecht/reconstruction/formulas.ts';
import { gazetteUnits, type GazetteUnit } from '@landesrecht/importer-bayernrecht/reconstruction/gazette.ts';
import { formatPath, parseLocation, resolvePath, type LocationPath } from '@landesrecht/importer-bayernrecht/reconstruction/location.ts';
import { bodyFingerprint, RECIPE_SCHEMA, recipeProblems, WHITESPACE_NORMALIZATION, type ReconstructionRecipe, type RecipeStep } from '@landesrecht/importer-bayernrecht/reconstruction/recipe.ts';
import { commandBlock, isBlockFailure, type NormIdentity } from '@landesrecht/importer-bayernrecht/reconstruction/structure.ts';
import { priorAmendmentInForce, priorDetailUrl } from '@landesrecht/importer-bayernrecht/reconstruction/run.ts';
import { cacheKey } from '@landesrecht/importer-bayernrecht/reconstruction/source.ts';

const BASELINE = '2023-12-01';
const EVALUATION = '2026-09-18';
const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'bayernrecht');

/** Befehl → Rezeptschritte, wie `run.ts` sie bildet (Formel, Ort, aufgelöster Bereich). */
function stepsFor(body: readonly NormBodyBlock[], command: string, context: LocationPath[] = []): RecipeStep[] {
  const parsed = parseCommand(command, context);
  if (!parsed.operations) throw new Error(`nicht unterstützt: ${parsed.reason}`);
  const steps: RecipeStep[] = [];
  for (const operation of parsed.operations as ParsedOperation[]) {
    for (const path of operation.locations) {
      const resolved = resolvePath(body, path);
      if (!resolved.ok) throw new Error(resolved.reason);
      steps.push({ id: `s${steps.length + 1}`, command, commandPath: [], formula: operation.formula, location: formatPath(path), scope: resolved.scope, operation: operation.operation, evidence: { baseline: '', current: '' } });
    }
  }
  return steps;
}

/** Rückwärts, dann vorwärts: muss exakt den heutigen Körper ergeben. */
function roundTrip(current: NormBodyBlock[], command: string, context: LocationPath[] = []): NormBodyBlock[] {
  const steps = stepsFor(current, command, context);
  const baseline = reverseSteps(current, steps);
  expect(forwardSteps(baseline, steps)).toEqual(current);
  expect(bodyFingerprint(baseline)).not.toBe(bodyFingerprint(current));
  return baseline;
}

/* ------------------------------------------------------------------------ Echte Körper */

// UStützV (BayUStuetzV) nach der Verordnung vom 21. November 2025 (GVBl. S. 605), gekürzt.
const USTUETZV: NormBodyBlock[] = [
  {
    type: 'paragraph', label: '§ 1', title: 'Beitragshöhe', children: [
      { type: 'subparagraph', label: '(1)', text: 'Die Beiträge des Freistaates Bayern und der kreisangehörigen Gemeinden zum Unterstützungsfonds werden für die Jahre bis 2020 auf je fünf Millionen Euro pro Jahr, für die Jahre 2021 bis 2030 auf je eine Million Euro pro Jahr festgesetzt.' },
      {
        type: 'subparagraph',
        label: '(3)',
        text: '¹Der Beitrag einer kreisangehörigen Gemeinde kann im Einzelfall zur Vermeidung einer besonderen Härte reduziert werden. ²Über die Reduzierung entscheidet das Staatsministerium für Umwelt und Verbraucherschutz auf Antrag und teilt die Entscheidung bis zum 1. März des laufenden Beitragsjahres dem Landesamt für Statistik mit. ³Eine besondere Härte kommt insbesondere dann in Betracht, wenn eine Gemeinde ihre sämtlichen stillgelegten Hausmülldeponien vor dem 1. Mai 2006 nachweislich bereits vollständig saniert hat und eine Inanspruchnahme des Unterstützungsfonds aus diesem Grund ausgeschlossen ist. ⁴In dem in Satz 3 genannten Fall gilt die Entscheidung des Staatsministeriums für Umwelt und Verbraucherschutz für die gesamte Laufzeit des Unterstützungsfonds. ⁵Den durch die Reduzierung entstehenden Beitragsausfall tragen die übrigen Gemeinden nach dem Verhältnis ihrer für das laufende Beitragsjahr maßgebenden Umlagegrundlagen (Art. 18 Abs. 3 des Bayerischen Finanzausgleichsgesetzes). ⁶Sofern der Antrag nach Satz 1 unter Vorlage der erforderlichen Unterlagen bis zum 1. Januar eines Jahres gestellt wird, werden Änderungen der Beitragshöhe bei der Erstellung der Beitragsbescheide für das laufende Beitragsjahr berücksichtigt, ansonsten in dem auf die Antragstellung folgenden Jahr. ⁷Ein verbleibender Differenzbetrag auf Grund der nachträglichen Berichtigung der Beitragshöhe vorangegangener Jahre wird damit verrechnet. ⁸Der Antrag auf Beitragsreduzierung kann nur bis zum 1. Januar 2030 gestellt werden.',
      },
    ],
  },
  {
    type: 'paragraph', label: '§ 3', title: 'Beleihung, Zuschussverfahren', children: [
      { type: 'subparagraph', label: '(3)', text: '¹Die Beleihung endet mit der Abwicklung des letzten Zuschusses aus dem Unterstützungsfonds, frühestens am 31. Dezember 2030. ²Das Staatsministerium für Umwelt und Verbraucherschutz kann die Beleihung im Einvernehmen mit den Staatsministerien des Innern, für Sport und Integration und der Finanzen und für Heimat jederzeit aufheben.' },
    ],
  },
  { type: 'paragraph', label: '§ 5', title: 'In-Kraft-Treten, Außer-Kraft-Treten', children: [{ type: 'paragraphText', text: '¹Diese Verordnung tritt am 1. Juni 2006 in Kraft. ²Die §§ 1 und 2 treten mit Ablauf des 31. Dezember 2030 außer Kraft.' }] },
];

// VwRefATZV (BayAltersGewV) nach der Verordnung vom 4. Juni 2024 (GVBl. S. 98), gekürzt.
const VWREFATZV: NormBodyBlock[] = [
  {
    type: 'paragraph', label: '§ 1', title: 'Betroffene Verwaltungsbereiche', children: [
      { type: 'paragraphText', text: 'Als Bereiche, in denen wegen grundlegender Verwaltungsreformmaßnahmen in wesentlichem Umfang Stellen abgebaut werden, werden bestimmt:' },
      {
        type: 'item', level: 1, label: '4.', text: 'aus dem Bereich des Staatsministeriums für Ernährung, Landwirtschaft, Forsten und Tourismus', children: [
          { type: 'subitem', level: 2, label: '–', text: 'Ämter für Ländliche Entwicklung' },
          { type: 'subitem', level: 2, label: '–', text: 'Ämter für Ernährung, Landwirtschaft und Forsten und staatliche agrarwirtschaftliche Fachschulen' },
        ],
      },
    ],
  },
];

/* ------------------------------------------------------------------ Änderungsformeln */

describe('Änderungsformeln aus echten Befehlen', () => {
  it('erkennt die Ersetzung mit Ort und Wortlaut (GVBl. 2024 S. 605, APO)', () => {
    const parsed = parseCommand('In § 31 Abs. 6 Satz 2 wird die Angabe „Nr. 3“ durch die Angabe „Nr. 2“ ersetzt.', []);
    expect(parsed.formulas).toEqual(['replace-words']);
    expect(parsed.operations).toHaveLength(1);
    expect(parsed.operations![0]!.operation).toEqual({ kind: 'replace', from: 'Nr. 3', to: 'Nr. 2' });
    expect(parsed.operations![0]!.locations.map(formatPath)).toEqual(['§ 31 Abs. 6 Satz 2']);
  });

  it('verteilt „jeweils“ auf mehrere genannte Orte (GVBl. 2024 S. 98, FoRG)', () => {
    const parsed = parseCommand('In Art. 7 Abs. 3, Art. 29 Abs. 3 Satz 1 und Art. 51 werden jeweils die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.', []);
    expect(parsed.operations).toHaveLength(1);
    expect(parsed.operations![0]!.each).toBe(true);
    expect(parsed.operations![0]!.locations.map(formatPath)).toEqual(['Art. 7 Abs. 3', 'Art. 29 Abs. 3 Satz 1', 'Art. 51']);
  });

  it('schließt „jeweils“ an nur einem Ort aus: die Herkunft der Vorkommen ist nicht unterscheidbar', () => {
    const parsed = parseCommand('In Nr. 2 wird jeweils die Angabe „Art. 15“ durch die Angabe „Art. 12“ ersetzt.', []);
    expect(parsed.operations).toBeUndefined();
    expect(parsed.reason).toContain('jeweils');
  });

  it('erkennt Einfügung, verankerte Streichung, Anfügung und Schlusszeichen', () => {
    expect(parseCommand('In Art. 6 Abs. 6 Satz 1 Nr. 4 wird nach der Angabe „Fahrrads“ die Angabe „oder elektrisch betriebenen, zweirädrigen Fahrzeugs“ eingefügt.', []).operations![0]!.operation)
      .toEqual({ kind: 'insert', anchor: 'Fahrrads', side: 'after', text: 'oder elektrisch betriebenen, zweirädrigen Fahrzeugs' });
    expect(parseCommand('In Nr. 3.1.1 Satz 3 wird vor der Angabe „44“ die Angabe „Art.“ gestrichen.', []).operations![0]!.operation)
      .toEqual({ kind: 'delete-anchored', anchor: '44', side: 'before', text: 'Art.' });
    expect(parseCommand('Der Überschrift wird die Angabe „ , Verordnungsermächtigung“ angefügt.', [[{ kind: 'artikel', value: '26' }]]).operations![0]!.operation)
      .toEqual({ kind: 'append', text: ' , Verordnungsermächtigung' });
    expect(parseCommand('In Nr. 13 wird der Punkt am Ende durch ein Komma ersetzt.', []).operations![0]!.operation).toEqual({ kind: 'replace-final', from: '.', to: ',' });
  });

  it('führt mehrere Klauseln eines Befehls in ihrer Reihenfolge (BayMBl. 2024 Nr. 666)', () => {
    const parsed = parseCommand('In Teil I Abs. 1 wird die Angabe „29. April 1998 (BAnz. Nr. 138a)“ durch die Angabe „18. November 2024 (BAnz. AT 23.12.2024 B4)“ und die Angabe „Juni 1998“ durch die Angabe „Januar 2025“ ersetzt.', []);
    expect(parsed.operations!.map((operation) => operation.operation)).toEqual([
      { kind: 'replace', from: '29. April 1998 (BAnz. Nr. 138a)', to: '18. November 2024 (BAnz. AT 23.12.2024 B4)' },
      { kind: 'replace', from: 'Juni 1998', to: 'Januar 2025' },
    ]);
  });

  it('„erhält folgende Fassung“ und „wird wie folgt gefasst“ sind nicht rückrechenbar: der Alttext steht nicht im Befehl', () => {
    for (const command of ['Nr. 5 Satz 1 erhält folgende neue Fassung:', '§ 10 Abs. 1 wird wie folgt gefasst:', 'Art. 53 Abs. 2 wird wie folgt gefasst:']) {
      const parsed = parseCommand(command, []);
      expect(parsed.formulas).toEqual(['recast']);
      expect(parsed.operations).toBeUndefined();
    }
  });

  it('Aufhebung, Streichung ohne Anker und Anlagen aus dem Anhang sind nicht rückrechenbar', () => {
    expect(parseCommand('Art. 5 Abs. 1 Satz 3 wird aufgehoben.', []).formulas).toEqual(['repeal-unit']);
    // Der Wortlaut ist bekannt, die Stelle nicht – jede Einfügestelle bestünde den Rundlauf.
    const deletion = parseCommand('In Art. 3 Abs. 6 wird die Angabe „nach dem Stand der Technik“ gestrichen.', []);
    expect(deletion.formulas).toEqual(['delete-words']);
    expect(deletion.operations).toBeUndefined();
    expect(parseCommand('Die Anlage erhält die aus dem Anhang zu dieser Verordnung ersichtliche Fassung.', []).formulas).toEqual(['annex-recast']);
  });

  it('wendet strukturelle Änderungen nicht an (Einfügung ganzer Glieder, Umnummerierung, Satznummern)', () => {
    expect(parseCommand('Dem Art. 16 Abs. 1 wird folgender Satz 3 angefügt:', []).formulas).toEqual(['insert-unit']);
    expect(parseCommand('Der bisherige Abs. 3 wird Abs. 4.', []).formulas).toEqual(['renumber']);
    expect(parseCommand('§ 4 wird § 3 und wie folgt geändert:', []).formulas).toEqual(['renumber']);
    expect(parseCommand('In Satz 1 wird die Satznummerierung „¹“ gestrichen.', []).formulas).toEqual(['renumber']);
  });

  it('deutet ein halbes Zitat nie', () => {
    expect(maskQuotes('In Nr. 2.3.5 wird das Wort „Maßnahmen“ durch das Wort „Vorhaben“ ersetzt“.')).toBeDefined();
    expect(maskQuotes('wird die Angabe „Nr. 3 durch die Angabe')).toBeUndefined();
    expect(parseCommand('In Nr. 2.3.5 wird das Wort „Maßnahmen“ durch das Wort „Vorhaben“ ersetzt“.', []).operations).toBeUndefined();
  });

  it('zerlegt Ortsangaben mit Aufzählung nach Rang (GVBl. 2024 S. 98, BestG)', () => {
    const paths = parseLocation('In Art. 3a Abs. 4 Satz 1 Halbsatz 2, Art. 15 Abs. 1 und Art. 16 Satzteil vor Nr. 1 und Nr. 1 Satz 2 Satzteil vor Buchst. a');
    expect(paths!.map(formatPath)).toEqual(['Art. 3a Abs. 4 Satz 1 Halbsatz 2', 'Art. 15 Abs. 1', 'Art. 16 Satzteil vor Nr. 1', 'Art. 16 Nr. 1 Satz 2 Satzteil vor Buchst. a']);
    expect(parseLocation('In § 1 Abs. 1, 3 Satz 8, § 3 Abs. 3 Satz 1 und § 5 Satz 2')!.map(formatPath)).toEqual(['§ 1 Abs. 1', '§ 1 Abs. 3 Satz 8', '§ 3 Abs. 3 Satz 1', '§ 5 Satz 2']);
    expect(parseLocation('In Abs. 1 Satz 1 Nr. 1 und 2, Satz 2 Nr. 1 bis 3')).toBeUndefined();
  });
});

/* --------------------------------------------------------- Rückwärts, vorwärts, Rundlauf */

describe('Rückwärts, vorwärts, Rundlauf', () => {
  it('Ersetzung an vier Orten (GVBl. 2025 S. 605, UStützV): „2030“ → „2025“ und zurück', () => {
    const baseline = roundTrip(USTUETZV, 'In § 1 Abs. 1, 3 Satz 8, § 3 Abs. 3 Satz 1 und § 5 Satz 2 wird die Angabe „2025“ jeweils durch die Angabe „2030“ ersetzt.');
    const texts = JSON.stringify(baseline);
    expect(texts).toContain('2021 bis 2025 auf je eine Million');
    expect(texts).toContain('bis zum 1. Januar 2025 gestellt');
    expect(texts).toContain('frühestens am 31. Dezember 2025');
    expect(texts).toContain('mit Ablauf des 31. Dezember 2025 außer Kraft');
    expect(texts).not.toContain('2030');
  });

  it('Ersetzung mit anschließendem Zitat „ , Forsten und Tourismus“ (GVBl. 2024 S. 98, VwRefATZV)', () => {
    const baseline = roundTrip(VWREFATZV, 'In § 1 Nr. 4 Satzteil vor dem ersten Spiegelstrich werden die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.');
    expect(baseline[0]!.children![1]!.text).toBe('aus dem Bereich des Staatsministeriums für Ernährung, Landwirtschaft und Forsten');
    // Der Spiegelstrich darunter trägt „und Forsten“ ebenfalls – der Satzteil vor dem ersten Spiegelstrich grenzt ihn aus.
    expect(baseline[0]!.children![1]!.children![1]!.text).toBe('Ämter für Ernährung, Landwirtschaft und Forsten und staatliche agrarwirtschaftliche Fachschulen');
  });

  it('Einfügung nach einem Anker (GVBl. 2026 S. 425, UntVergV § 4 Abs. 2 Satz 1)', () => {
    const body: NormBodyBlock[] = [{ type: 'paragraph', label: '§ 4', title: 'Vergütungsfähige Unterrichtsstunden', children: [{ type: 'subparagraph', label: '(2)', text: '¹Führen Lehramtsanwärter während der Zeit, in der ihnen eigenverantwortlicher Unterricht übertragen ist, eine sonstige schulische Veranstaltung im Sinn des Art. 28 Satz 2 des Bayerischen Gesetzes über das Erziehungs- und Unterrichtswesen (BayEUG) selbstständig durch, sind die hierdurch ausfallenden Unterrichtsstunden bei der Berechnung der Unterrichtsvergütung in dem Umfang zu berücksichtigen, wie wenn sie tatsächlich abgeleistet worden wären. ²Als sonstige schulische Veranstaltungen in diesem Sinn gelten insbesondere' }] }];
    // Der Befehl steht unter „§ 4 Abs. 2 Satz 1 wird wie folgt geändert:“ – der Ort kommt aus dem übergeordneten Befehl.
    const baseline = roundTrip(body, 'Nach der Angabe „Unterrichtswesen“ wird die Angabe „(BayEUG)“ eingefügt.', [[{ kind: 'paragraph', value: '4' }, { kind: 'absatz', value: '2' }, { kind: 'satz', value: '1' }]]);
    expect(baseline[0]!.children![0]!.text).toContain('Erziehungs- und Unterrichtswesen selbstständig durch');
  });

  it('verankerte Streichung (BayMBl. 2026 Nr. 356): „Art. 23 und 44 BayHO“ → „Art. 23 und Art. 44 BayHO“', () => {
    const body: NormBodyBlock[] = [{ type: 'section', label: '3.', title: 'Offene Ganztagsangebote an kommunalen Schulen und Schulen in freier Trägerschaft', children: [{ type: 'subsection', label: '3.1', title: 'Zuwendungsvoraussetzungen', children: [{ type: 'subsection', label: '3.1.1', children: [{ type: 'paragraphText', text: '¹Offene Ganztagsangebote an kommunalen Schulen und staatlich genehmigten und staatlich anerkannten Schulen in freier Trägerschaft werden gemäß Nr. 3.8 auf Antrag des jeweiligen Schulträgers gefördert. ²Ein Rechtsanspruch besteht insoweit nicht. ³Die Zuwendungen werden nach Maßgabe dieser Bekanntmachung und der allgemeinen haushaltsrechtlichen Bestimmungen, insbesondere der Art. 23 und 44 BayHO und den dazu erlassenen Verwaltungsvorschriften, im Rahmen der verfügbaren Haushaltsmittel gewährt.' }] }] }] }];
    const baseline = roundTrip(body, 'In Nr. 3.1.1 Satz 3 wird vor der Angabe „44“ die Angabe „Art.“ gestrichen.');
    expect(JSON.stringify(baseline)).toContain('der Art. 23 und Art. 44 BayHO');
  });

  it('Anfügung an eine Überschrift (BayRKG Art. 26)', () => {
    const body: NormBodyBlock[] = [{ type: 'article', label: 'Art. 26', title: 'Zuständigkeit, Verordnungsermächtigung', children: [{ type: 'paragraphText', text: '¹Zuständig für die Festsetzung und Anordnung der Reisekostenvergütung ist die Beschäftigungsbehörde.' }] }];
    const baseline = roundTrip(body, 'Der Überschrift wird die Angabe „ , Verordnungsermächtigung“ angefügt.', [[{ kind: 'artikel', value: '26' }]]);
    expect(baseline[0]!.title).toBe('Zuständigkeit');
  });

  it('Schlusszeichen (DVVwZVG § 3 Nr. 13): Komma → Punkt', () => {
    const body: NormBodyBlock[] = [{ type: 'paragraph', label: '§ 3', children: [{ type: 'item', level: 1, label: '13.', text: 'dem Klinikum rechts der Isar der Technischen Universität München,' }, { type: 'item', level: 1, label: '14.', text: 'den Steuerberaterkammern München und Nürnberg.' }] }];
    const baseline = roundTrip(body, 'In Nr. 13 wird der Punkt am Ende durch ein Komma ersetzt.', [[{ kind: 'paragraph', value: '3' }]]);
    expect(baseline[0]!.children![0]!.text).toBe('dem Klinikum rechts der Isar der Technischen Universität München.');
  });

  it('Mehrdeutigkeit schließt aus (GVBl. 2026 S. 425, UntVergV): „Anwärter“ steht zweimal in § 1 Abs. 1', () => {
    const body: NormBodyBlock[] = [{ type: 'paragraph', label: '§ 1', title: 'Allgemeine Voraussetzungen', children: [{ type: 'subparagraph', label: '(1)', text: 'Lehramtsanwärtern wird nach Maßgabe der §§ 5 bis 7 mit den Bezügen für Anwärterinnen und Anwärter im Sinn des Art. 75 des Bayerischen Besoldungsgesetzes (BayBesG) eine Unterrichtsvergütung gewährt.' }] }];
    // Heute: „Lehramtsanwärter …“ – der neue Wortlaut kommt im Bereich zweimal vor.
    const current = structuredClone(body);
    current[0]!.children![0]!.text = current[0]!.children![0]!.text!.replace('Lehramtsanwärtern', 'Lehramtsanwärter');
    const steps = stepsFor(current, 'In § 1 Abs. 1 wird die Angabe „Anwärtern“ durch die Angabe „Anwärter“ ersetzt.');
    expect(() => reverseSteps(current, steps)).toThrowError(ReconstructionError);
    try {
      reverseSteps(current, steps);
    } catch (error) {
      expect((error as ReconstructionError).code).toBe('target-ambiguous');
    }
  });

  it('Wortteile sind kein Treffer: „10“ in „2010“', () => {
    const body: NormBodyBlock[] = [{ type: 'section', label: '1.', children: [{ type: 'paragraphText', text: 'Die Bekanntmachung vom 12. Mai 2010 gilt fort.' }] }];
    const steps = stepsFor(body, 'In Nr. 1 wird die Angabe „7“ durch die Angabe „10“ ersetzt.');
    expect(() => reverseSteps(body, steps)).toThrowError(/Teil eines längeren Wortes/u);
  });

  it('Satznummern sind keine Wortzeichen: das Wort direkt nach „²“ wird gefunden, „m³“ bleibt unberührt (AbmG Art. 3)', () => {
    const body: NormBodyBlock[] = [{ type: 'article', label: 'Art. 3', title: 'Zuständigkeit', children: [{ type: 'subparagraph', label: '(1)', text: '¹Die Abmarkung wird von den staatlichen Vermessungsbehörden vollzogen. ²Daneben sind die Behörden zuständig. ³Abgemarkt wird bis 400 m³ umbauten Raums.' }] }];
    const baseline = roundTrip(body, 'In Art. 3 Abs. 1 Satz 2 wird das Wort „Außerdem“ durch das Wort „Daneben“ ersetzt.');
    expect(baseline[0]!.children![0]!.text).toBe('¹Die Abmarkung wird von den staatlichen Vermessungsbehörden vollzogen. ²Außerdem sind die Behörden zuständig. ³Abgemarkt wird bis 400 m³ umbauten Raums.');
  });

  it('eine fehlende Stelle ist ein Fehler, kein stilles Weitermachen', () => {
    const steps = stepsFor(VWREFATZV, 'In § 1 Nr. 4 Satzteil vor dem ersten Spiegelstrich werden die Wörter „und Pflege“ durch die Wörter „ , Pflege und Prävention“ ersetzt.');
    expect(() => reverseSteps(VWREFATZV, steps)).toThrowError(/0-mal/u);
  });
});

/* ---------------------------------------------------------------------- Inkrafttreten */

const unitsOf = (texts: string[]): GazetteUnit[] => texts.map((text, index) => ({ index, tag: 'p', className: 'GTEinzugEZ', text, heading: false }));

describe('Inkrafttreten', () => {
  it('liest die Schlussvorschrift der Verkündung (GVBl. 2024 S. 98)', () => {
    const units = gazetteUnits(readFileSync(join(FIXTURES, 'verkuendung-gvbl-2024-98-excerpt.html'), 'utf8'));
    const result = commencementFor(units, '2024-06-14', '§ 1', true);
    expect(result.ok && result.dates).toEqual(['2024-07-01']);
  });

  it('eine Änderung, die vor oder am Stichtag in Kraft tritt, wird nicht zurückgerechnet', () => {
    // Rückwirkung: verkündet nach dem Stichtag, in Kraft davor – sie gehört zur Stichtagsfassung.
    expect(commencementDate('mit Wirkung vom 1. November 2023', '2024-02-01')).toBe('2023-11-01');
    const verdict = effectiveDateVerdict(['2023-11-01'], { baselineDate: BASELINE, evaluationDate: EVALUATION, inForceFrom: '2023-11-01' });
    expect(verdict.ok).toBe(false);
    expect(!verdict.ok && verdict.reason).toBe('effective-on-or-before-baseline');
    expect(effectiveDateVerdict([BASELINE], { baselineDate: BASELINE, evaluationDate: EVALUATION, inForceFrom: BASELINE }).ok).toBe(false);
  });

  it('verlangt, dass der heutige Text seit genau diesem Inkrafttreten gilt', () => {
    expect(effectiveDateVerdict(['2024-07-01'], { baselineDate: BASELINE, evaluationDate: EVALUATION, inForceFrom: '2024-07-01' })).toEqual({ ok: true, date: '2024-07-01' });
    const mismatch = effectiveDateVerdict(['2024-07-01'], { baselineDate: BASELINE, evaluationDate: EVALUATION, inForceFrom: '2025-01-01' });
    expect(!mismatch.ok && mismatch.reason).toBe('portal-in-force-mismatch');
    const future = effectiveDateVerdict(['2026-04-01', '2027-01-01'], { baselineDate: BASELINE, evaluationDate: EVALUATION, inForceFrom: '2027-01-01' });
    expect(!future.ok && future.reason).toBe('effective-after-evaluation');
  });

  it('ordnet abweichendes Inkrafttreten im Mantelgesetz nur dem genannten Abschnitt zu (GVBl. 2026 S. 75)', () => {
    const units = unitsOf(['¹Dieses Gesetz tritt am 1. April 2026 in Kraft. ²Abweichend von Satz 1 treten die §§ 61 bis 73 am 1. Januar 2027 in Kraft.']);
    const other = commencementFor(units, '2026-03-31', '§ 3', true);
    expect(other.ok && other.dates).toEqual(['2026-04-01']);
    const touched = commencementFor(units, '2026-03-31', '§ 62', true);
    expect(touched.ok && touched.dates).toEqual(['2026-04-01', '2027-01-01']);
  });

  it('eine nicht lesbare Abweichung macht das Inkrafttreten unbestimmt (GVBl. 2024 S. 281)', () => {
    const units = unitsOf(['¹Diese Verordnung tritt am 1. August 2024 in Kraft. ²Abweichend von Satz 1 tritt § 16 am 2. August 2024 und § 20 am 1. Januar 2025 in Kraft.']);
    expect(commencementFor(units, '2024-07-15', undefined, false).ok).toBe(false);
  });
});

/* ------------------------------------------------------ Beginn der Stichtagsfassung, Kette */

const chainInput = (overrides: Partial<ChainInput>): ChainInput => ({
  baselineDate: BASELINE,
  event: { organ: 'baymbl', volume: 2026, position: 225 },
  fullCitation: 'Bekanntmachung des Bayerischen Staatsministeriums für Familie, Arbeit und Soziales über die Festsetzung der Zahl der ehrenamtlichen Richter in der bayerischen Sozialgerichtsbarkeit vom 24. Oktober 2018 (AllMBl. S. 1112), die durch Bekanntmachung vom 22. Mai 2026 (BayMBl. Nr. 225) geändert worden ist',
  postBaselinePublications: new Set(['baymbl|2026|225']),
  otherAmendingPublications: [],
  registerNotes: ['Änderung vom 22.05.2026, BayMBl. 2026 Nr. 225'],
  ...overrides,
});

describe('Beginn der Stichtagsfassung und Einschrittigkeit', () => {
  it('belegt die Stammfassung über ihre eigene Inkrafttretensvorschrift (BayMBl. 330-A)', () => {
    const body: NormBodyBlock[] = [{ type: 'section', label: '2.', title: 'Inkrafttreten, Außerkrafttreten', children: [{ type: 'paragraphText', text: 'Diese Bekanntmachung tritt am 1. Dezember 2018 in Kraft.' }] }];
    const result = ownCommencement(body, BASELINE);
    expect(result.ok).toBe(true);
    expect(result.date).toBe('2018-12-01');
  });

  it('Ausfertigung ist nicht Textgeltung: ohne Kalenderdatum kein Beleg', () => {
    const body: NormBodyBlock[] = [{ type: 'paragraph', label: '§ 4', title: 'Inkrafttreten', children: [{ type: 'paragraphText', text: 'Diese Verordnung tritt am Tag nach ihrer Verkündung in Kraft.' }] }];
    expect(ownCommencement(body, BASELINE).ok).toBe(false);
  });

  it('eine Norm mit eigener Geltungsgrenze bleibt der Stichtagsklassifikation überlassen (HG 2021 Art. 14)', () => {
    const body: NormBodyBlock[] = [{ type: 'article', label: 'Art. 14', title: 'Inkrafttreten, Außerkrafttreten', children: [
      { type: 'subparagraph', label: '(1)', text: 'Dieses Gesetz tritt mit Wirkung vom 1. Januar 2021 in Kraft.' },
      { type: 'subparagraph', label: '(3)', text: 'Die Bestimmungen dieses Gesetzes gelten bis zum Tag der Bekanntmachung des Haushaltsgesetzes des folgenden Haushaltsjahres weiter.' },
    ] }];
    expect(ownCommencement(body, BASELINE).ok).toBe(false);
  });

  it('eine vorangehende Änderung ist verkündet, aber ihr Inkrafttreten ist offline nicht belegt', () => {
    const result = checkChain(chainInput({
      event: { organ: 'gvbl', volume: 2025, position: 605 },
      fullCitation: 'Unterstützungsfonds-Verordnung (UStützV) vom 5. Mai 2006 (GVBl. S. 227, BayRS 2129-4-3-U), die zuletzt durch Verordnung vom 21. November 2025 (GVBl. S. 605) geändert worden ist',
      priorClause: 'Verordnung vom 16. Dezember 2020 (GVBl. S. 709)',
      postBaselinePublications: new Set(['gvbl|2025|605']),
      registerNotes: ['6) mehrfach geänd. (V v. 16.12.2020, S. 709)', '7) §§ 1, 3, 5 geänd. (V v. 21.11.2025, S. 605)'],
    }));
    expect(result.stammfassung).toBe(false);
    expect(result.failures.map((failure) => failure.reason)).toEqual(['prior-amendment-in-force-unproven']);
  });

  it('eine Stammfassung besteht die Kette nur mit Vollzitat und Fortführungsnachweis ohne frühere Änderung', () => {
    expect(checkChain(chainInput({})).failures).toEqual([]);
    const earlier = checkChain(chainInput({ registerNotes: ['Änderung vom 10.02.2020, BayMBl. 2020 Nr. 90', 'Änderung vom 22.05.2026, BayMBl. 2026 Nr. 225'] }));
    expect(earlier.failures[0]!.reason).toBe('chain-stamm-register-mismatch');
    const other = checkChain(chainInput({ otherAmendingPublications: ['https://www.verkuendung-bayern.de/baymbl/2025-11/'] }));
    expect(other.failures[0]!.state).toBe('partial-chain');
  });

  it('liest Notizen beider Fortführungsnachweise', () => {
    expect(registerNote('7) §§ 1, 3, 5 geänd. (V v. 21.11.2025, S. 605)')).toEqual({ date: '2025-11-21', keys: [{ organ: 'gvbl', volume: 2025, position: 605 }] });
    expect(registerNote('3) mehrfach geänd. (§ 1 V v. 21.12.2010; 2011, S. 20)').keys).toEqual([{ organ: 'gvbl', volume: 2011, position: 20 }]);
    expect(registerNote('Änderung vom 22.05.2026, BayMBl. 2026 Nr. 225').keys).toEqual([{ organ: 'baymbl', volume: 2026, position: 225 }]);
  });
});

/* ------------------------------------------------------------ Echte Verkündungsseiten */

describe('Einleitungssatz und Befehlsblock aus echten Verkündungen', () => {
  const gvbl = gazetteUnits(readFileSync(join(FIXTURES, 'verkuendung-gvbl-2024-98-excerpt.html'), 'utf8'));
  const altersGewV: NormIdentity = { documentId: 'BayAltersGewV', title: 'Verordnung über die Gewährung von Altersteilzeit in Verwaltungsreformbereichen', abbreviations: ['VwRefATZV'], bayRsNumber: '2030-2-1-4-F', documentDate: '2005-01-10', references: ['GVBl. 2005 S. 2'] };

  it('findet den Ein-Satz-Befehl in der Anpassungsverordnung und normalisiert den Leerraum des Zitats', () => {
    const block = commandBlock(gvbl, altersGewV);
    expect(isBlockFailure(block)).toBe(false);
    if (isBlockFailure(block)) return;
    expect(block.priorAmendmentClause).toBe('§ 2 der Verordnung vom 1. Oktober 2019 (GVBl. S. 594)');
    expect(block.commands).toHaveLength(1);
    const parsed = parseCommand(block.commands[0]!.text, []);
    expect(parsed.operations![0]!.operation).toEqual({ kind: 'replace', from: 'und Forsten', to: ' , Forsten und Tourismus' });
    expect(formatPath(parsed.operations![0]!.locations[0]!)).toBe('§ 1 Nr. 4 Satzteil vor ersten Spiegelstrich');
  });

  it('liest einen Listenbefehl mit „jeweils“ über drei Orte und entfernt weiche Trennzeichen (DelV)', () => {
    const delv: NormIdentity = { documentId: 'BayDelV', title: 'Delegationsverordnung', abbreviations: ['DelV'], bayRsNumber: '103-2-V', documentDate: '2014-01-28', references: ['GVBl. 2014 S. 22'] };
    const block = commandBlock(gvbl, delv);
    if (isBlockFailure(block)) throw new Error(block.detail);
    expect(block.commands.map((command) => command.label)).toEqual(['1.', '2.']);
    expect(block.commands[0]!.text).toContain('„ , Forsten und Tourismus“');
    const parsed = parseCommand(block.commands[0]!.text, []);
    expect(parsed.operations![0]!.locations.map(formatPath)).toEqual(['§ 6 Überschrift', '§ 6 Nr. 19', '§ 6 Satzteil nach Nr. 20']);
  });

  it('meldet einen doppelt zitierten Änderungsabschnitt als mehrdeutig, statt einen zu wählen', () => {
    const intro = gvbl.find((unit) => unit.text.startsWith('(13)'))!;
    const doubled = [...gvbl, { ...intro, index: gvbl.length }];
    const block = commandBlock(doubled, altersGewV);
    expect(isBlockFailure(block) && block.code).toBe('intro-ambiguous');
  });

  it('liest die Bekanntmachung im BayMBl. mit Inkrafttreten (BayMBl. 2026 Nr. 225)', () => {
    const units = gazetteUnits(readFileSync(join(FIXTURES, 'verkuendung-baymbl-2026-225.html'), 'utf8'));
    const identity: NormIdentity = { documentId: 'BayVV_330_A_571', title: 'Festsetzung der Zahl der ehrenamtlichen Richter in der bayerischen Sozialgerichtsbarkeit', abbreviations: [], bayRsNumber: '330-A', documentDate: '2018-10-24', references: ['AllMBl. 2018 S. 1112'] };
    const block = commandBlock(units, identity);
    if (isBlockFailure(block)) throw new Error(block.detail);
    expect(block.priorAmendmentClause).toBeUndefined();
    expect(parseCommand(block.commands[0]!.text, []).operations![0]!.operation).toEqual({ kind: 'replace', from: '7', to: '10' });
    const commencement = commencementFor(units, '2026-06-03', 'Nr. 1', false);
    expect(commencement.ok && commencement.dates).toEqual(['2026-07-01']);
  });
});

/* ------------------------------------------------------------------------------ Rezept */

function recipeFor(current: NormBodyBlock[], command: string): ReconstructionRecipe {
  const steps = stepsFor(current, command);
  const baseline = reverseSteps(current, steps);
  return {
    schemaVersion: RECIPE_SCHEMA,
    documentId: 'BayVV_330_A_571',
    baselineDate: BASELINE,
    method: 'reverse-amendment',
    source: { url: 'https://www.gesetze-bayern.de/Content/Zip/BayVV_330_A_571', sha256: '0'.repeat(64), parserVersion: 'test', inForceFrom: '2026-07-01' },
    amendment: {
      eventId: 'baymbl-2026-225', citation: 'BayMBl. 2026 Nr. 225', organ: 'baymbl', publicationAuthority: 'electronic-official', digitalRepresentation: 'official-electronic-edition',
      url: 'https://www.verkuendung-bayern.de/baymbl/2026-225/', sha256: '1'.repeat(64), eventDate: '2026-06-03', effectiveDate: '2026-07-01', effectiveDateEvidence: ['Diese Bekanntmachung tritt am 1. Juli 2026 in Kraft.'], intro: command,
    },
    baselineTextInForce: { date: '2018-12-01', evidence: ['Diese Bekanntmachung tritt am 1. Dezember 2018 in Kraft.'] },
    chain: [],
    steps,
    whitespace: WHITESPACE_NORMALIZATION,
    expected: { currentFingerprint: bodyFingerprint(current), baselineFingerprint: bodyFingerprint(baseline) },
  };
}

describe('Rezept', () => {
  const current: NormBodyBlock[] = [{ type: 'section', label: '1.', children: [{ type: 'subsection', label: '1.1', title: 'Landessozialgericht', children: [{ type: 'table', children: [
    { type: 'tableRow', children: [{ type: 'tableCell', text: 'Sozialversicherung und Arbeitsförderung' }, { type: 'tableCell', text: 'Versicherte' }, { type: 'tableCell', text: '120' }] },
    { type: 'tableRow', children: [{ type: 'tableCell', text: 'Vertragsarztrecht' }, { type: 'tableCell', text: 'Vertreterinnen und Vertreter der Krankenkassen' }, { type: 'tableCell', text: '10' }] },
  ] }] }] }];
  const command = 'In Nr. 1.1 wird die Angabe „7“ durch die Angabe „10“ ersetzt.';

  it('rechnet zurück und besteht den Rundlauf – auch nach Serialisierung', () => {
    const recipe = recipeFor(current, command);
    expect(recipeProblems(recipe)).toEqual([]);
    const baseline = applyReverseRecipe(current, recipe);
    expect(JSON.stringify(baseline)).toContain('"text":"7"');
    expect(verifyRoundTrip(current, recipe).ok).toBe(true);
    expect(verifyRoundTrip(current, JSON.parse(JSON.stringify(recipe)) as ReconstructionRecipe).ok).toBe(true);
  });

  it('gilt nur für den geprüften heutigen Körper', () => {
    const recipe = recipeFor(current, command);
    const changed = structuredClone(current);
    changed[0]!.children![0]!.title = 'Landessozialgericht München';
    expect(() => applyReverseRecipe(changed, recipe)).toThrowError(/nicht der geprüfte/u);
    expect(verifyRoundTrip(changed, recipe).ok).toBe(false);
  });

  it('verlangt Inkrafttreten = inkraft des Pakets und einen belegten Beginn der Stichtagsfassung', () => {
    const recipe = recipeFor(current, command);
    expect(recipeProblems({ ...recipe, source: { ...recipe.source, inForceFrom: '2026-06-01' } })[0]).toContain('inkraft des heutigen Pakets');
    expect(recipeProblems({ ...recipe, baselineTextInForce: { date: '2024-01-01', evidence: ['x'] } })[0]).toContain('nach dem Stichtag');
    const { baselineTextInForce: _omitted, ...withoutStart } = recipe;
    expect(recipeProblems(withoutStart as ReconstructionRecipe)[0]).toContain('nicht belegt');
    expect(() => applyReverseRecipe(current, withoutStart as ReconstructionRecipe)).toThrowError(/Rezept ungültig/u);
  });

  it('jede geschriebene Rezeptdatei ist formal gültig', () => {
    const directory = join(import.meta.dirname, '..', '..', 'data', 'imports', 'bayernrecht', 'reconstruction');
    const files = existsSync(directory) ? readdirSync(directory).filter((name) => name.endsWith('.json')) : [];
    for (const name of files) {
      const recipe = JSON.parse(readFileSync(join(directory, name), 'utf8')) as ReconstructionRecipe;
      expect(`${name}: ${recipeProblems(recipe).join('; ')}`).toBe(`${name}: `);
      expect(recipe.documentId).toBe(name.replace(/\.json$/u, ''));
      expect(recipe.amendment.effectiveDate).toBe(recipe.source.inForceFrom);
      expect(recipe.baselineTextInForce.date <= recipe.baselineDate).toBe(true);
    }
  });
});

describe('Beginn der Stichtagsfassung: Inkrafttreten der vorangehenden Änderung aus ihrer eigenen Verkündung', () => {
  // Verkündet ist nicht in Kraft. Belegt ist der Beginn nur durch die Inkrafttretensvorschrift der vorangehenden
  // Verkündung – mit Kalenderdatum, für den ändernden Abschnitt, auf einer Seite mit dem richtigen Datum.
  const pages = { '2018-188': 'verkuendung-gvbl-2018-188.html', '2020-663': 'verkuendung-gvbl-2020-663.html' } as const;

  async function cacheRoot(overrides: Partial<Record<keyof typeof pages, string>> = {}): Promise<string> {
    const root = mkdtempSync(join(tmpdir(), 'landesrecht-prior-'));
    mkdirSync(join(root, '.cache', 'bayernrecht'), { recursive: true });
    for (const [page, name] of Object.entries(pages) as Array<[keyof typeof pages, string]>) {
      const url = `https://www.verkuendung-bayern.de/gvbl/${page}/`;
      const html = overrides[page] ?? readFileSync(join(FIXTURES, name), 'utf8');
      writeFileSync(join(root, '.cache', 'bayernrecht', `${cacheKey(url)}.bin`), html);
      writeFileSync(join(root, '.cache', 'bayernrecht', `${cacheKey(url)}.json`), JSON.stringify({ url, retrievedAt: '2026-09-18T08:30:00.000Z' }));
    }
    return root;
  }
  const prove = async (clause: string, root?: string) => priorAmendmentInForce({ root: root ?? (await cacheRoot()), units: new Map() }, clause, '2023-12-01');

  it('bildet die Detailseite aus Fundstelle und Jahrgang der Ausfertigung', () => {
    expect(priorDetailUrl('GVBl. S. 594', '2019-10-01')).toBe('https://www.verkuendung-bayern.de/gvbl/2019-594/');
    expect(priorDetailUrl('BayMBl. Nr. 472', '2023-09-22')).toBe('https://www.verkuendung-bayern.de/baymbl/2023-472/');
    expect(priorDetailUrl('AllMBl. S. 12', '2001-01-01')).toBeUndefined();
  });

  it('belegt „mit Wirkung vom 1. Januar 2018“ als Kalenderdatum', async () => {
    const proof = await prove('die zuletzt durch Verordnung vom 26. Februar 2018 (GVBl. S. 188) geändert worden ist');
    expect(proof).toMatchObject({ ok: true, date: '2018-01-01' });
    expect(proof.sources).toHaveLength(1);
  });

  it('nimmt in einer Mantelverkündung das Inkrafttreten des ändernden Abschnitts, nicht eine fremde Abweichung', async () => {
    // GVBl. 2020 S. 663: Grundregel 1. Februar 2021, Abweichung für § 1 Nr. 36 Buchst. e (15. Januar 2021).
    const proof = await prove('das zuletzt durch § 5 des Gesetzes vom 23. Dezember 2020 (GVBl. S. 663) geändert worden ist');
    expect(proof).toMatchObject({ ok: true, date: '2021-02-01' });
  });

  it('verlangt die Identität der Seite (Ausfertigungsdatum) und lehnt eine fehlende Seite ab', async () => {
    expect(await prove('das zuletzt durch § 5 des Gesetzes vom 24. Dezember 2020 (GVBl. S. 663) geändert worden ist')).toMatchObject({ ok: false });
    expect((await prove('das zuletzt durch Gesetz vom 9. Mai 2006 (GVBl. S. 190) geändert worden ist')).reason).toMatch(/nicht im Cache/u);
  });

  it('lässt „am Tag nach der Verkündung“ unbelegt', async () => {
    const relative = readFileSync(join(FIXTURES, pages['2018-188']), 'utf8').replace('tritt mit Wirkung vom 1.&#160;Januar 2018 in Kraft', 'tritt am Tag nach ihrer Verkündung in Kraft').replace('tritt mit Wirkung vom 1. Januar 2018 in Kraft', 'tritt am Tag nach ihrer Verkündung in Kraft');
    const proof = await prove('die zuletzt durch Verordnung vom 26. Februar 2018 (GVBl. S. 188) geändert worden ist', await cacheRoot({ '2018-188': relative }));
    expect(proof.ok).toBe(false);
  });
});
