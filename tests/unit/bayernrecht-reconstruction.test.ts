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
import { deflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { applyBackward, applyReverseRecipe, forwardSteps, ReconstructionError, reverseSteps, verifyRoundTrip } from '@landesrecht/importer-bayernrecht/reconstruction/apply.ts';
import { checkChain, registerNote, type ChainInput } from '@landesrecht/importer-bayernrecht/reconstruction/chain.ts';
import { commencementDate, commencementFor, effectiveDateVerdict, ownCommencement, subjectRefs } from '@landesrecht/importer-bayernrecht/reconstruction/commencement.ts';
import { maskQuotes, parseCommand, type ParsedOperation } from '@landesrecht/importer-bayernrecht/reconstruction/formulas.ts';
import { gazetteUnits, type GazetteUnit } from '@landesrecht/importer-bayernrecht/reconstruction/gazette.ts';
import { formatPath, parseLocation, resolvePath, type LocationPath } from '@landesrecht/importer-bayernrecht/reconstruction/location.ts';
import { bodyFingerprint, isRecipeV2, RECIPE_SCHEMA, RECIPE_SCHEMA_V2, recipeAmendments, recipeProblems, recipeSources, WHITESPACE_NORMALIZATION, type AnyReconstructionRecipe, type RecipeAmendmentV2, type ReconstructionRecipe, type ReconstructionRecipeV2, type RecipeStep } from '@landesrecht/importer-bayernrecht/reconstruction/recipe.ts';
import { commandBlock, isBlockFailure, type CommandBlock, type NormIdentity } from '@landesrecht/importer-bayernrecht/reconstruction/structure.ts';
import { priorAmendmentInForce, priorDetailUrl } from '@landesrecht/importer-bayernrecht/reconstruction/run.ts';
import { cacheKey } from '@landesrecht/importer-bayernrecht/reconstruction/source.ts';
import { assignGroup, emptySurvey, surveyCommand } from '@landesrecht/importer-bayernrecht/reconstruction/groups.ts';
import { candidateRefs } from '@landesrecht/importer-bayernrecht/reconstruction/pages.ts';
import { pdfPageCommencement, pdfText } from '@landesrecht/importer-bayernrecht/reconstruction/pdf.ts';
import { reverseAmendment } from '@landesrecht/importer-bayernrecht/reconstruction/steps.ts';
import { parseStructural, quoteGroups, realize } from '@landesrecht/importer-bayernrecht/reconstruction/structural.ts';
import { amendmentRefs, walkChain, type WalkInput, type WalkLedgerEvent } from '@landesrecht/importer-bayernrecht/reconstruction/walk.ts';

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
    // Lauf 7: Bereiche werden aufgezählt („Nr. 1 bis 3“ → Nr. 1, 2, 3).
    expect(parseLocation('In Abs. 1 Satz 1 Nr. 1 und 2, Satz 2 Nr. 1 bis 3')!.map(formatPath)).toEqual(['Abs. 1 Satz 1 Nr. 1', 'Abs. 1 Satz 1 Nr. 2', 'Abs. 1 Satz 2 Nr. 1', 'Abs. 1 Satz 2 Nr. 2', 'Abs. 1 Satz 2 Nr. 3']);
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

  it('Mehrdeutigkeit schließt aus (GVBl. 2026 S. 425, UntVergV): „Anwärter“ steht zweimal als ganzes Wort in § 1 Abs. 1', () => {
    const body: NormBodyBlock[] = [{ type: 'paragraph', label: '§ 1', title: 'Allgemeine Voraussetzungen', children: [{ type: 'subparagraph', label: '(1)', text: 'Lehramtsanwärtern wird nach Maßgabe der §§ 5 bis 7 mit den Bezügen für Anwärterinnen und Anwärter im Sinn des Art. 75 des Bayerischen Besoldungsgesetzes (BayBesG) eine Unterrichtsvergütung gewährt.' }] }];
    // Ein Treffer in „Anwärterinnen“ zählt seit Lauf 5 nicht mehr mit (Wortteil); zwei **ganze** Treffer bleiben mehrdeutig.
    const current = structuredClone(body);
    current[0]!.children![0]!.text = current[0]!.children![0]!.text!.replace('Lehramtsanwärtern wird', 'Anwärter wird');
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
    // Die Abweichung nennt den ganzen Abschnitt: Für ihn gilt die Grundregel nicht, nur der 1. Januar 2027.
    const touched = commencementFor(units, '2026-03-31', '§ 62', true);
    expect(touched.ok && touched.dates).toEqual(['2027-01-01']);
  });

  it('liest „§ 16 am … und § 20 am …“ als zwei Abweichungen (GVBl. 2024 S. 281)', () => {
    const units = unitsOf(['¹Diese Verordnung tritt am 1. August 2024 in Kraft. ²Abweichend von Satz 1 tritt § 16 am 2. August 2024 und § 20 am 1. Januar 2025 in Kraft.']);
    const result = commencementFor(units, '2024-07-15', undefined, false);
    expect(result.ok && result.dates).toEqual(['2024-08-01', '2024-08-02', '2025-01-01']);
    expect(result.ok && result.applicable.filter((statement) => statement.refs !== null).map((statement) => statement.refs)).toEqual([['§ 16'], ['§ 20']]);
  });

  it('eine nicht lesbare Abweichung macht das Inkrafttreten unbestimmt (BayMBl. 2021 Nr. 298)', () => {
    const units = unitsOf(['¹Diese Bekanntmachung tritt am 1. Juni 2021 in Kraft. ²Abweichend von Satz 1 tritt Nr. 9a mit Wirkung vom 1. Mai 2020 in Kraft und tritt mit Ablauf des 31. Juli 2021 außer Kraft.']);
    expect(commencementFor(units, '2021-05-20', undefined, false).ok).toBe(false);
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

  it('jede geschriebene Rezeptdatei (v1 oder v2) ist formal gültig', () => {
    const directory = join(import.meta.dirname, '..', '..', 'data', 'imports', 'bayernrecht', 'reconstruction');
    const files = existsSync(directory) ? readdirSync(directory).filter((name) => name.endsWith('.json')) : [];
    for (const name of files) {
      const recipe = JSON.parse(readFileSync(join(directory, name), 'utf8')) as AnyReconstructionRecipe;
      expect(`${name}: ${recipeProblems(recipe).join('; ')}`).toBe(`${name}: `);
      expect(recipe.documentId).toBe(name.replace(/\.json$/u, ''));
      const amendments = recipeAmendments(recipe);
      expect(amendments[0]!.effectiveDate).toBe(recipe.source.inForceFrom);
      expect(amendments.every((amendment) => amendment.effectiveDate > recipe.baselineDate)).toBe(true);
      expect(isRecipeV2(recipe) ? amendments.length > 1 : amendments.length === 1).toBe(true);
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

/* ==================================================================== Mehrstufige Rückrechnung */

/** Echte Verkündung (gekürzt) und echter Portalkörper (gekürzt) aus `tests/fixtures/bayernrecht/`. */
interface PortalFixture {
  documentId: string;
  identity: NormIdentity;
  inForceFrom: string;
  fullCitation?: string;
  changeHistory?: string;
  registerNotes: string[];
  body: NormBodyBlock[];
}
const portal = (documentId: string): PortalFixture => JSON.parse(readFileSync(join(FIXTURES, `portal-${documentId}-excerpt.json`), 'utf8')) as PortalFixture;
const gazette = (name: string): GazetteUnit[] => gazetteUnits(readFileSync(join(FIXTURES, `verkuendung-${name}-excerpt.html`), 'utf8'));
const blockOf = (name: string, identity: NormIdentity): CommandBlock => {
  const block = commandBlock(gazette(name), identity);
  if (isBlockFailure(block)) throw new Error(`${name}: ${block.detail}`);
  return block;
};
/** Rundlauf einer Änderung: rückwärts, dann vorwärts – exakt der heutige Körper. */
function reverseOnly(fixture: PortalFixture, name: string): { steps: RecipeStep[]; before: NormBodyBlock[] } {
  const reversal = reverseAmendment(fixture.body, blockOf(name, fixture.identity));
  expect(reversal.failures).toEqual([]);
  expect(forwardSteps(reversal.before!, reversal.steps)).toEqual(fixture.body);
  return { steps: reversal.steps, before: reversal.before! };
}

describe('Neue Formeln an echten Verkündungen', () => {
  it('Glied einfügen und anfügen, Schlusszeichen (GVBl. 2023 S. 638, DVVwZVG § 3)', () => {
    const fixture = portal('BayDVVwZVG');
    const { steps, before } = reverseOnly(fixture, 'gvbl-2023-638');
    expect(steps.map((step) => step.formula)).toEqual(['insert-block', 'replace-final-punctuation', 'insert-block']);
    const items = before[0]!.children!.filter((block) => block.type === 'item').map((block) => block.label);
    expect(items).not.toContain('6.');
    expect(items).not.toContain('14.');
    expect(JSON.stringify(before)).toContain('Technischen Universität München."');
    // Das entfernte Glied ist wörtlich das Zitat der Verkündung.
    const inserted = steps[0]!.operation as { kind: 'insert-block'; block: NormBodyBlock };
    expect(`${inserted.block.label} ${inserted.block.text}`).toBe('6. den Rechtsanwaltskammern München, Nürnberg und Bamberg, soweit diese nicht bereits nach Bundesrecht eine entsprechende Befugnis haben,');
  });

  it('Satz anfügen, „Der Wortlaut wird Satz 1“ (GVBl. 2024 S. 334, RMRatV)', () => {
    const fixture = portal('BayRMRatV');
    const { steps, before } = reverseOnly(fixture, 'gvbl-2024-334');
    expect(steps.map((step) => step.formula)).toEqual(['replace-words', 'insert-sentence', 'number-sentences', 'insert-sentence']);
    const paragraph6 = before.find((block) => block.label === '§ 6')!;
    const text = JSON.stringify(paragraph6);
    expect(text).not.toMatch(/[¹²]/u);
    expect(text).not.toContain('An die Stelle der Internetseite');
    expect(JSON.stringify(before)).toContain('wird öffentlich bekannt');
  });

  it('Überschrift einfügen (GVBl. 2025 S. 39, BodenschEntschV)', () => {
    const fixture = portal('BayBodenschEntschV');
    const { steps, before } = reverseOnly(fixture, 'gvbl-2025-39');
    expect(steps.filter((step) => step.formula === 'insert-title')).toHaveLength(3);
    expect(before.filter((block) => block.type === 'paragraph').every((block) => block.title === undefined)).toBe(true);
    expect(JSON.stringify(before)).toContain('12,25 €');
  });

  it('eingefügtes Glied vor der Umnummerierung der „bisherigen“ Glieder, nach Wortlaut unterschieden (GVBl. 2026 S. 190, LfAG; gekürzt auf § 8 Nr. 1)', () => {
    const fixture = portal('BayAufbauG');
    const { steps, before } = reverseOnly(fixture, 'gvbl-2026-190');
    expect(steps.map((step) => step.formula)).toEqual(['insert-block', 'relabel', 'relabel', 'relabel', 'relabel']);
    const items = JSON.stringify(before);
    expect(items).not.toContain('Verteidigung und Rüstung');
    const list = before[0]!.children!.find((article) => article.label === 'Art. 3')!.children![0]!.children!;
    expect(list.map((item) => `${item.label} ${item.text}`)).toEqual(['1. Mittelstand,', '2. Technologie und Innovation,', '3. Vorhaben mit besonderer regional-, struktur- oder arbeitsmarktpolitischer Bedeutung,', '4. Umweltschutz,', '5. Infrastruktur,', '6. Risikokapital.']);
  });

  it('Angabe am Ende ersetzen, Glied anfügen (GVBl. 2026 S. 487, AgrSchO; gekürzt auf § 64 Abs. 1 Satz 2)', () => {
    const fixture = portal('BayAgrSchO');
    const { steps, before } = reverseOnly(fixture, 'gvbl-2026-487');
    expect(steps.map((step) => step.formula)).toEqual(['replace-final-words', 'replace-final-words', 'insert-block']);
    const json = JSON.stringify(before);
    expect(json).toContain('mit je 20 Unterrichtswochen in Vollzeitform oder"');
    expect(json).toContain('einem fachpraktischen zweiten Semester."');
  });

  it('Angabe am Ende ersetzen und streichen, mit Leerzeichen genau wie im Portal (GVBl. 2025 S. 270, ZustVVerk; gekürzt auf § 1 Nr. 4 a und b)', () => {
    const fixture = portal('BayZustVVerk');
    const { steps, before } = reverseOnly(fixture, 'gvbl-2025-270');
    expect(steps.map((step) => step.formula)).toEqual(['replace-final-words', 'delete-final-words']);
    const json = JSON.stringify(before);
    expect(json).toContain('der EBO und der ESBO,"');
    expect(json).toContain('Eisenbahnaufsichtsbehörde nach Art. 9 BayESG und"');
  });

  it('Satz einfügen vor der Umnummerierung des „bisherigen“ Satzes (AGFlurbG, GVBl. 2026 S. 266 Nr. 4 b; Befehl cc gekürzt)', () => {
    const body: NormBodyBlock[] = [{ type: 'article', label: 'Art. 3', children: [{ type: 'subparagraph', label: '(1)', text: '¹Der Vorsitzende des Vorstands ist bis zur Beendigung des Verfahrens (§ 149 Abs. 3 FlurbG) ein technisch vorgebildeter Beamter der Fachlaufbahn Naturwissenschaft und Technik, fachlicher Schwerpunkt Ländliche Entwicklung, der mindestens ein Amt der Besoldungsgruppe A 10 innehat, oder ein Arbeitnehmer mit vergleichbarer Qualifikation. ²Er wird vom Amt für Ländliche Entwicklung bestimmt. ³Das Amt für Ländliche Entwicklung kann in den Vorstand weitere technisch vorgebildete Dienstkräfte abordnen; diese haben aber nur dann ein Stimmrecht, wenn sie den Vorsitzenden vertreten.' }] }];
    const context: LocationPath[] = [[{ kind: 'artikel', value: '3' }, { kind: 'absatz', value: '1' }]];
    const quote: GazetteUnit[] = [{ index: 0, tag: 'p', className: 'GTBlocksatzEinzugEZEbene3', text: '„²Er wird vom Amt für Ländliche Entwicklung bestimmt.“', heading: false }];
    const templates = [parseStructural('Nach Satz 1 wird folgender Satz 2 eingefügt:', context, quote)!, parseStructural('Der bisherige Satz 2 wird Satz 3.', context, [])!];
    expect(templates.map((parsed) => parsed.formula)).toEqual(['insert-sentence', 'renumber-sentence']);
    const working = structuredClone(body);
    const steps: RecipeStep[] = [];
    for (const parsed of [...templates].reverse()) {
      const realized = realize(working, parsed.templates![0]!, 'Nr. 4 b', false);
      const recipeSteps = realized.map((entry, index): RecipeStep => ({ id: `s${index}`, command: '', commandPath: [], formula: parsed.formula as RecipeStep['formula'], location: entry.location, scope: { fields: entry.field ? [entry.field] : [], resolved: [], widened: [] }, operation: entry.operation, evidence: { baseline: '', current: '' } }));
      for (const step of [...recipeSteps].reverse()) applyBackward(working, step.scope, step.operation, step.id);
      steps.unshift(...recipeSteps);
    }
    expect(working[0]!.children![0]!.text).toMatch(/Qualifikation\. ²Das Amt für Ländliche Entwicklung kann/u);
    expect(steps[1]!.operation).toMatchObject({ kind: 'renumber-sentence', from: 2, to: 3, occurrence: 1 });
    expect(forwardSteps(working, steps)).toEqual(body);
  });

  it('schließt aus, was nicht wörtlich eingefügt wurde, eine Abbildung trägt oder nicht am genannten Anker steht', () => {
    const fixture = portal('BayDVVwZVG');
    const block = blockOf('gvbl-2023-638', fixture.identity);
    const changed = structuredClone(fixture.body);
    changed[0]!.children![6]!.text = changed[0]!.children![6]!.text!.replace('Bamberg', 'Bamberg und Coburg');
    expect(reverseAmendment(changed, block).failures[0]).toMatchObject({ reason: 'reverse-inserted-text-mismatch' });
    const withFigure = structuredClone(fixture.body);
    withFigure[0]!.children![6]!.children = [{ type: 'figure' as NormBodyBlock['type'] }];
    expect(reverseAmendment(withFigure, block).failures[0]).toMatchObject({ state: 'asset-missing', reason: 'reverse-image-in-inserted-unit' });
    const moved = structuredClone(fixture.body);
    const [six] = moved[0]!.children!.splice(6, 1);
    moved[0]!.children!.splice(3, 0, six!);
    expect(reverseAmendment(moved, block).failures[0]!.state).toBe('ambiguous-target');
  });

  it('liest Zitate in „…“ und ‚…‘ und Befehle mit mehreren Gliedern (GVBl. 2026 S. 487, 2024 S. 205)', () => {
    expect(quoteGroups([{ index: 0, tag: 'p', className: '', text: '‚(4) ¹Studierende, die die Abschlussprüfung bestanden haben, besitzen die erforderlichen Kenntnisse.‘', heading: false }])).toEqual(['(4) ¹Studierende, die die Abschlussprüfung bestanden haben, besitzen die erforderlichen Kenntnisse.']);
    const two = parseStructural('Die folgenden Nrn. 24 und 25 werden angefügt:', [], [
      { index: 0, tag: 'p', className: '', label: '„24.', text: 'Kassenärztliche Vereinigung Bayerns,', heading: false },
      { index: 1, tag: 'p', className: '', label: '25.', text: 'Kassenzahnärztliche Vereinigung Bayerns.“', heading: false },
    ]);
    expect(two).toMatchObject({ formula: 'insert-block', templates: [{ kind: 'insert-blocks', targets: [{ kind: 'nummer', value: '24' }, { kind: 'nummer', value: '25' }], append: true }] });
    expect(parseStructural('Die bisherigen Nrn. 3 bis 6 werden die Nrn. 4 bis 7.', [], [])?.templates?.[0]).toMatchObject({ kind: 'relabel', pairs: [[{ value: '3' }, { value: '4' }], [{ value: '4' }, { value: '5' }], [{ value: '5' }, { value: '6' }], [{ value: '6' }, { value: '7' }]] });
    expect(parseStructural('Nach Satz 2 werden die folgenden Sätze 3 und 4 eingefügt:', [], [{ index: 0, tag: 'p', className: '', text: '„³Der Nachweis wird erbracht. ⁴Er gilt fort.“', heading: false }])).toMatchObject({ formula: 'insert-sentence', templates: [{ after: 2, first: 3 }] });
    // „Nach Satz 1 wird folgender Satz 3 eingefügt“ bestimmt die Stelle nicht.
    expect(parseStructural('Nach Satz 1 wird folgender Satz 3 eingefügt:', [], [{ index: 0, tag: 'p', className: '', text: '„³Neu.“', heading: false }])?.formula).toBe('insert-unit');
    expect(parseCommand('In Nr. 4 wird die Angabe „und“ am Ende gestrichen.', []).operations?.[0]?.operation).toEqual({ kind: 'delete-final', text: 'und' });
  });
});

describe('Kette: amtliche Verweise, Register, Verlauf', () => {
  it('liest Verweise mit Abschnitten, „dieses Gesetzes“ und mehreren Änderungen', () => {
    expect(amendmentRefs('die §§ 1 und 2 des Gesetzes vom 26. März 2026 (GVBl. S. 139)')).toEqual([{ text: 'die §§ 1 und 2 des Gesetzes vom 26. März 2026 (GVBl. S. 139)', enactmentDate: '2026-03-26', reference: 'GVBl. S. 139', sections: ['§ 1', '§ 2'], self: false }]);
    expect(amendmentRefs('§ 1 dieses Gesetzes')).toEqual([{ text: '§ 1 dieses Gesetzes', sections: ['§ 1'], self: true }]);
    const two = amendmentRefs('§ 4 des Gesetzes vom 21. November 2025 (GVBl. S. 573) und durch Gesetz vom 23. Dezember 2025 (GVBl. S. 697)');
    expect(two.map((ref) => [ref.sections, ref.enactmentDate])).toEqual([[['§ 4'], '2025-11-21'], [[], '2025-12-23']]);
    // Ausfertigung im Dezember: Verkündung kann im Folgejahrgang liegen.
    expect(candidateRefs('GVBl. S. 697', '2025-12-23')).toEqual([{ organ: 'gvbl', volume: 2025, position: 697 }, { organ: 'gvbl', volume: 2026, position: 697 }]);
    expect(registerNote('7) (§ 1 V v. 14.05.2021, BayMBl. Nr. 335)')).toEqual({ date: '2021-05-14', keys: [{ organ: 'baymbl', volume: 2021, position: 335 }] });
  });

  const DVWOR_PAGES: Record<string, string> = {
    'https://www.verkuendung-bayern.de/gvbl/2025-717/': 'gvbl-2025-717',
    'https://www.verkuendung-bayern.de/gvbl/2024-31/': 'gvbl-2024-31',
    'https://www.verkuendung-bayern.de/gvbl/2023-508/': 'gvbl-2023-508',
    'https://www.verkuendung-bayern.de/gvbl/2021-311/': 'gvbl-2021-311',
  };
  const DVWOR_EVENTS: WalkLedgerEvent[] = [
    { id: 'gvbl-2024-31', sourceUrl: 'https://www.verkuendung-bayern.de/gvbl/2024-31/', citation: 'GVBl. 2024 S. 31', eventDate: '2024-02-15', enactmentDate: '2024-01-23', eventType: 'amend', organ: 'gvbl', publicationAuthority: 'printed-official', digitalRepresentation: 'official-platform-informational-copy' },
    { id: 'gvbl-2025-717', sourceUrl: 'https://www.verkuendung-bayern.de/gvbl/2025-717/', citation: 'GVBl. 2025 S. 717', eventDate: '2025-12-30', enactmentDate: '2025-12-16', eventType: 'amend', organ: 'gvbl', publicationAuthority: 'printed-official', digitalRepresentation: 'official-platform-informational-copy' },
  ];

  function seedRoot(pages: Record<string, string>, skip: string[] = []): string {
    const root = mkdtempSync(join(tmpdir(), 'landesrecht-walk-'));
    mkdirSync(join(root, '.cache', 'bayernrecht'), { recursive: true });
    for (const [url, name] of Object.entries(pages)) {
      if (skip.includes(url)) continue;
      writeFileSync(join(root, '.cache', 'bayernrecht', `${cacheKey(url)}.bin`), readFileSync(join(FIXTURES, `verkuendung-${name}-excerpt.html`), 'utf8'));
      writeFileSync(join(root, '.cache', 'bayernrecht', `${cacheKey(url)}.json`), JSON.stringify({ url, retrievedAt: '2026-09-18T10:00:00.000Z' }));
    }
    return root;
  }

  const walkInput = (root: string, overrides: Partial<WalkInput> = {}): WalkInput => {
    const fixture = portal('BayDVWoR');
    return {
      root,
      baselineDate: BASELINE,
      evaluationDate: EVALUATION,
      identity: fixture.identity,
      inForceFrom: fixture.inForceFrom,
      ...(fixture.fullCitation ? { fullCitation: fixture.fullCitation } : {}),
      ...(fixture.changeHistory ? { changeHistory: fixture.changeHistory } : {}),
      registerNotes: fixture.registerNotes,
      ledgerEvents: DVWOR_EVENTS,
      ledgerByPublication: new Map(),
      postBaselinePublications: new Set(['gvbl|2024|31', 'gvbl|2025|717']),
      amendingByPage: new Map(),
      ...overrides,
    };
  };

  it('folgt vom Vollzitat den Verweisen bis zur letzten Änderung vor dem Stichtag (DVWoR: GVBl. 2025 S. 717 ← 2024 S. 31 ← 2023 S. 508)', async () => {
    const walk = await walkChain(walkInput(seedRoot(DVWOR_PAGES)));
    expect(walk.failures).toEqual([]);
    expect(walk.steps.map((step) => `${step.citation}${step.section ? ` ${step.section}` : ''} ${step.effectiveDates.join('/')}`)).toEqual(['GVBl. 2025 S. 717 § 2 2025-12-31', 'GVBl. 2024 S. 31 § 1 2024-02-28']);
    expect(walk.witnesses.map((witness) => `${witness.citation} ${witness.section} ${witness.effectiveDates.join('/')} ${witness.calendarDates}`)).toEqual(['GVBl. 2023 S. 508 § 2 2023-09-01 true']);
    expect(walk.stammfassung).toBe(false);
    // Ein Schritt weiter zurück: Der Vorgänger der Stichtagsfassung galt schon vor dem Stichtag.
    expect(walk.evidence.some((line) => line.includes('GVBl. 2021 S. 311 in Kraft 2021-08-01'))).toBe(true);
  });

  it('meldet eine fehlende Verkündung als Bedarf für den gezielten Abruf, nie als Vermutung', async () => {
    const walk = await walkChain(walkInput(seedRoot(DVWOR_PAGES, ['https://www.verkuendung-bayern.de/gvbl/2023-508/'])));
    expect(walk.failures[0]).toMatchObject({ state: 'missing-base', reason: 'prior-source-missing' });
    expect(walk.needs).toEqual(['https://www.verkuendung-bayern.de/gvbl/2023-508/']);
  });

  it('verlangt, dass jedes Ereignis des Registers ein Schritt der Kette ist', async () => {
    const extra: WalkLedgerEvent = { ...DVWOR_EVENTS[0]!, id: 'gvbl-2024-999', sourceUrl: 'https://www.verkuendung-bayern.de/gvbl/2024-999/', citation: 'GVBl. 2024 S. 999', eventType: 'notice' };
    const walk = await walkChain(walkInput(seedRoot(DVWOR_PAGES), { ledgerEvents: [...DVWOR_EVENTS, extra] }));
    expect(walk.failures[0]).toMatchObject({ state: 'partial-chain', reason: 'chain-ledger-unexplained' });
  });

  it('überspringt eine erst nach dem Auswertungsstichtag geltende Änderung – der heutige Text enthält sie nicht', async () => {
    const walk = await walkChain(walkInput(seedRoot(DVWOR_PAGES), { evaluationDate: '2025-06-30', inForceFrom: '2024-02-28' }));
    expect(walk.failures).toEqual([]);
    expect(walk.future.map((step) => step.citation)).toEqual(['GVBl. 2025 S. 717']);
    expect(walk.steps.map((step) => step.citation)).toEqual(['GVBl. 2024 S. 31']);
  });

  it('Rezept v2: zwei Änderungen, jüngste zuerst, Forward-Replay exakt, auch nach Serialisierung', async () => {
    const fixture = portal('BayDVWoR');
    const walk = await walkChain(walkInput(seedRoot(DVWOR_PAGES)));
    let body = fixture.body;
    const amendments: RecipeAmendmentV2[] = [];
    walk.steps.forEach((step, index) => {
      const reversal = reverseAmendment(body, step.block!, `a${index + 1}-`);
      expect(reversal.failures).toEqual([]);
      amendments.push({
        eventId: step.ledgerEvent!.id, citation: step.citation, organ: 'gvbl', publicationAuthority: 'printed-official', digitalRepresentation: 'official-platform-informational-copy',
        url: step.page.url, sha256: step.page.sha256, eventDate: step.eventDate!, effectiveDate: step.effectiveDates.at(-1)!, effectiveDates: step.effectiveDates, effectiveDateEvidence: step.effectiveDateEvidence,
        intro: step.block!.intro.text, steps: reversal.steps, expected: { beforeFingerprint: bodyFingerprint(reversal.before!), afterFingerprint: bodyFingerprint(body) },
      });
      body = reversal.before!;
    });
    const witness = walk.witnesses[0]!;
    const recipe: ReconstructionRecipeV2 = {
      schemaVersion: RECIPE_SCHEMA_V2, documentId: 'BayDVWoR', baselineDate: BASELINE, method: 'reverse-amendment',
      source: { url: 'https://www.gesetze-bayern.de/Content/Zip/BayDVWoR', sha256: '0'.repeat(64), parserVersion: 'test', inForceFrom: fixture.inForceFrom },
      amendments,
      baselineTextInForce: { date: witness.effectiveDates.at(-1)!, evidence: ['Stand nach der vorangehenden Änderung', ...witness.effectiveDateEvidence], sources: [{ url: witness.page.url, sha256: witness.page.sha256, citation: witness.namedAs }] },
      chain: walk.evidence,
      sources: [...amendments.map((amendment) => ({ role: 'reversed-amendment' as const, citation: amendment.citation, url: amendment.url, sha256: amendment.sha256 })), { role: 'baseline-start' as const, citation: witness.namedAs, url: witness.page.url, sha256: witness.page.sha256 }],
      whitespace: WHITESPACE_NORMALIZATION,
      expected: { currentFingerprint: bodyFingerprint(fixture.body), baselineFingerprint: bodyFingerprint(body) },
    };
    expect(recipeProblems(recipe)).toEqual([]);
    const baseline = applyReverseRecipe(fixture.body, recipe);
    expect(JSON.stringify(baseline)).toContain('mit Ablauf des 28. Februar 2024 außer Kraft');
    expect(verifyRoundTrip(fixture.body, recipe)).toMatchObject({ ok: true });
    expect(verifyRoundTrip(fixture.body, JSON.parse(JSON.stringify(recipe)) as ReconstructionRecipeV2).ok).toBe(true);
    // Schnittstelle für den Bulk: jüngste und älteste Änderung, alle Verkündungen.
    const list = recipeAmendments(recipe);
    expect([list[0]!.citation, list.at(-1)!.citation]).toEqual(['GVBl. 2025 S. 717', 'GVBl. 2024 S. 31']);
    expect(list.map((amendment) => amendment.steps.map((step) => step.id))).toEqual([['a1-s01'], ['a2-s01']]);
    expect(recipeSources(recipe).map((source) => source.role)).toEqual(['reversed-amendment', 'reversed-amendment', 'baseline-start']);
    // Wächter: Zwischenstand, Reihenfolge, Zahl der Änderungen, inkraft.
    const tampered = structuredClone(recipe);
    tampered.amendments[1]!.expected.afterFingerprint = '0'.repeat(64);
    expect(() => applyReverseRecipe(fixture.body, tampered)).toThrowError(/Stand nach GVBl\. 2024 S\. 31/u);
    const swapped = { ...recipe, amendments: [...recipe.amendments].reverse() };
    expect(recipeProblems(swapped).join(' ')).toMatch(/Kettenreihenfolge|inkraft/u);
    expect(recipeProblems({ ...recipe, amendments: recipe.amendments.slice(0, 1) }).join(' ')).toContain('weniger als zwei');
    expect(recipeProblems({ ...recipe, source: { ...recipe.source, inForceFrom: '2026-01-01' } })[0]).toContain('inkraft des heutigen Pakets');
  });

  it('recipeAmendments liefert auch für v1 genau eine Änderung mit ihren Schritten', () => {
    const current: NormBodyBlock[] = [{ type: 'section', label: '1.', children: [{ type: 'paragraphText', text: 'Die Zahl beträgt 10.' }] }];
    const recipe = recipeFor(current, 'In Nr. 1 wird die Angabe „7“ durch die Angabe „10“ ersetzt.');
    expect(recipeAmendments(recipe)).toHaveLength(1);
    expect(recipeAmendments(recipe)[0]!.steps).toBe(recipe.steps);
    expect(recipeSources(recipe)[0]).toMatchObject({ role: 'reversed-amendment', url: recipe.amendment.url });
    expect(isRecipeV2(recipe)).toBe(false);
  });
});

describe('Inkrafttreten: Aufzählungen und ganze Abschnitte', () => {
  it('liest die Aufzählung „Abweichend von Abs. 1 treten in Kraft: 1. … 2. …“ (GVBl. 2024 S. 605 § 19)', () => {
    const units = gazette('gvbl-2024-605');
    expect(commencementFor(units, '2024-12-30', '§ 9', true)).toMatchObject({ ok: true, dates: ['2024-01-01'] });
    expect(commencementFor(units, '2024-12-30', '§ 11', true)).toMatchObject({ ok: true, dates: ['2025-10-01'] });
    expect(commencementFor(units, '2024-12-30', '§ 5', true)).toMatchObject({ ok: true, dates: ['2025-01-01'] });
  });

  it('liest die über Einheiten verteilte Aufzählung „treten 1. … 2. … in Kraft.“ (GVBl. 2023 S. 161 § 16)', () => {
    const units = gazette('gvbl-2023-161');
    expect(commencementFor(units, '2023-04-20', '§ 8', true)).toMatchObject({ ok: true, dates: ['2022-08-01'] });
    expect(commencementFor(units, '2023-04-20', '§ 15', true)).toMatchObject({ ok: true, dates: ['2023-05-01'] });
    expect(commencementFor(units, '2023-04-20', '§ 3', true)).toMatchObject({ ok: true, dates: ['2023-08-01'] });
  });

  it('Gegenstände mit Untergliederung und Punktbereichen', () => {
    expect(subjectRefs('§ 1 Nr. 5 Buchst. b')).toEqual(['§ 1 Nr. 5 Buchst. b']);
    expect(subjectRefs('die Nrn. 1.1 bis 1.3, 1.20 und 1.21')).toEqual(['Nr. 1.1', 'Nr. 1.2', 'Nr. 1.3', 'Nr. 1.20', 'Nr. 1.21']);
    const statement = commencementFor(unitsOf(['Diese Änderung der Bekanntmachung tritt mit Wirkung vom 1. Januar 2025 in Kraft.']), '2025-01-20', 'Nr. 1', false);
    expect(statement).toMatchObject({ ok: true, dates: ['2025-01-01'] });
  });
});

describe('PDF-Textlayer als Beleg des Beginns (GVBl. 2006 S. 190, BayBedV)', () => {
  const layer = JSON.parse(readFileSync(join(FIXTURES, 'gvbl-2006-09-textlayer-s189-190.json'), 'utf8')) as { pages: string[]; sha256: string; publishedSha256: string };

  it('belegt „Dieses Gesetz tritt am 1. Juni 2006 in Kraft.“ auf der ersten Inhaltsseite der Ausgabe', () => {
    expect(layer.sha256).toBe(layer.publishedSha256);
    expect(pdfPageCommencement(layer.pages, { first: 189, position: 190, enactmentDate: '2006-05-09' })).toMatchObject({ ok: true, date: '2006-06-01' });
  });

  it('verlangt Identität, Grenzen der Verkündung und genau eine Inkrafttretensregel', () => {
    expect(pdfPageCommencement(layer.pages, { first: 189, position: 190, enactmentDate: '2006-05-10' }).ok).toBe(false);
    // Falscher Seitenbereich: Die Seite trägt nicht die erwartete Seitenzahl.
    expect(pdfPageCommencement(layer.pages, { first: 189, position: 189, enactmentDate: '2006-05-09' }).reason).toMatch(/Seitenzahl 189|Titelzusatz/u);
    expect(pdfPageCommencement(layer.pages, { first: 188, position: 190, enactmentDate: '2006-05-09' }).ok).toBe(false);
    const doubled = [layer.pages[0]!, `${layer.pages[1]!} Diese Verordnung tritt am 1. Juli 2006 in Kraft.`];
    expect(pdfPageCommencement(doubled, { first: 189, position: 190, enactmentDate: '2006-05-09' }).ok).toBe(false);
  });

  it('liest einen Textlayer mit MacRoman-Kodierung, verweigert Unbekanntes', () => {
    const build = (encoding: string, text: string): Uint8Array => {
      const content = deflateSync(Buffer.from(`BT /F1 12 Tf 72 700 Td (${text}) Tj ET`, 'latin1'));
      const parts = [
        '%PDF-1.3\n',
        '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
        '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
        '3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R /MediaBox [0 0 595 842] >> endobj\n',
        `4 0 obj << /Length ${content.length} /Filter /FlateDecode >>\nstream\n`,
      ];
      const tail = `\nendstream\nendobj\n5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /${encoding} >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`;
      return new Uint8Array(Buffer.concat([Buffer.from(parts.join(''), 'latin1'), content, Buffer.from(tail, 'latin1')]));
    };
    expect(pdfText(build('MacRomanEncoding', 'M\x9fnchen, den 9. Mai 2006'))).toMatchObject({ ok: true, pages: ['München, den 9. Mai 2006'] });
    expect(pdfText(build('SymbolEncoding', 'x')).ok).toBe(false);
  });
});

describe('Gruppen: genau eine je Norm', () => {
  const failure = (state: string, reason: string) => ({ state, reason, detail: reason });
  it('ordnet nach Vorrang: Widerspruch vor Vorgänger vor Neufassung vor Anlage vor Tabelle vor Bild vor Alttext vor Zahl der Änderungen', () => {
    const survey = emptySurvey();
    surveyCommand(survey, 'Anlage 2 erhält folgende Fassung:', ['recast'], false);
    surveyCommand(survey, 'Abs. 3 wird aufgehoben.', ['repeal-unit'], false);
    expect(assignGroup({ state: 'contradictory', reason: 'portal-in-force-mismatch', amendments: 1, survey, failures: [failure('contradictory', 'portal-in-force-mismatch')] }).group).toBe('contradictory-evidence');
    expect(assignGroup({ state: 'non-invertible-amendment', reason: 'recast', amendments: 1, survey, failures: [failure('non-invertible-amendment', 'recast')] }).group).toBe('annex-replacement');
    const plain = emptySurvey();
    surveyCommand(plain, 'Abs. 3 wird aufgehoben.', ['repeal-unit'], false);
    expect(assignGroup({ state: 'non-invertible-amendment', reason: 'repeal-unit', amendments: 2, survey: plain, failures: [] }).group).toBe('missing-predecessor-text');
    // In Anlage 2 wird ein Glied neu gefasst – das ist keine Anlagenersetzung.
    const inside = emptySurvey();
    surveyCommand(inside, 'In Anlage 2 wird Nr. 3 wie folgt gefasst:', ['recast'], false);
    expect(inside.annex).toEqual([]);
    expect(assignGroup({ state: 'missing-base', reason: 'prior-source-missing', amendments: 3, survey: emptySurvey(), failures: [failure('missing-base', 'prior-source-missing')] }).group).toBe('three-or-more-amendments');
    expect(assignGroup({ state: 'recipe-ready', reason: 'reverse-amendment-verified', amendments: 2, survey, failures: [] })).toEqual({ group: 'two-amendments', reasons: [] });
    expect(assignGroup({ state: 'partial-chain', reason: 'x', amendments: 1, survey: emptySurvey(), failures: [], stammfassungAfterBaseline: 'gilt erst seit 2024' }).group).toBe('baseline-only-predecessor');
  });
});
