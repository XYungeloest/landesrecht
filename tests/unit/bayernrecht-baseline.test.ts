/**
 * Stichtagsklassifikation für BayWü.
 *
 * Der Stichtag ist **2023-12-01**, und BAYERN.RECHT führt nur den heutigen Stand. Die Frage je Norm
 * lautet deshalb zweimal verschieden: Existierte sie am Stichtag? Und ist der gezeigte Text ihr
 * Stichtagstext? Aus einer frühen Ausfertigung folgt nichts über den Text, aus einer alten
 * Textgeltung nichts über die Existenz – die Tests halten genau diese Trennung fest.
 */
import { describe, expect, it } from 'vitest';

import { citationDates, parseGermanDate } from '@landesrecht/importer-bayernrecht/baseline/citation-dates.ts';
import { classifyBaseline, type BaselineDecision } from '@landesrecht/importer-bayernrecht/baseline/classify.ts';
import { directlyImportable, type BaselineFile } from '@landesrecht/importer-bayernrecht/baseline/run.ts';
import { classifyReconstruction, orderQueue } from '@landesrecht/importer-bayernrecht/baseline/reconstruction.ts';

const BASELINE = '2023-12-01';

describe('Stichtagsklassifikation', () => {
  it('führt eine seit vor dem Stichtag unveränderte Fassung als Stichtagstext', () => {
    const decision = classifyBaseline({ documentId: 'A', documentDate: '1992-10-29', inForceFrom: '1995-11-07' });
    expect(decision.class).toBe('unchanged-since-baseline');
    expect(decision.status).toBe('active-at-baseline');
    expect(decision.method).toBe('current-unchanged');
    expect(decision.blockers).toEqual([]);
  });

  it('nimmt den Stichtag selbst als Textgeltung noch an', () => {
    expect(classifyBaseline({ documentId: 'A', documentDate: '2000-01-01', inForceFrom: BASELINE }).class).toBe('unchanged-since-baseline');
  });

  it('verlangt für eine nach dem Stichtag geänderte Fassung die historische Fassung', () => {
    // Der gefährlichste Fehlschluss des Bestands: alte Ausfertigung, junger Text. Den heutigen Text
    // zu übernehmen hieße, eine Fassung zurückzudatieren.
    const decision = classifyBaseline({ documentId: 'ARDStV', documentDate: '1991-08-31', inForceFrom: '2025-12-01' });
    expect(decision.class).toBe('changed-after-baseline');
    expect(decision.status).toBe('active-at-baseline');
    expect(decision.method).toBe('undetermined');
    expect(decision.blockers[0]).toContain('2025-12-01');
  });

  it('schließt eine erst nach dem Stichtag erlassene Vorschrift aus', () => {
    const decision = classifyBaseline({ documentId: 'BayAPE', documentDate: '2025-08-07', inForceFrom: '2025-09-01' });
    expect(decision.class).toBe('enacted-after-baseline');
    expect(decision.status).toBe('not-at-baseline');
    expect(decision.blockers).toEqual([]);
  });

  it('führt eine vor dem Stichtag ausgefertigte, aber erst danach verkündete Norm nie als am Stichtag geltend', () => {
    // BayMBl. 2023 Nr. 633 und Nr. 629: ausgefertigt am 30.11./1.12.2023, veröffentlicht am 20.12.2023, Text ab 2024.
    for (const [documentId, documentDate, inForceFrom, citation] of [
      ['BayVV_2230_1_1_1_0_K_14216', '2023-11-30', '2024-01-01', 'BayMBl. 2023 Nr. 633'],
      ['BayVV_2330_B_14207', '2023-12-01', '2024-06-30', 'BayMBl. 2023 Nr. 629'],
    ] as const) {
      const decision = classifyBaseline({ documentId, documentDate, inForceFrom, administrative: true, publication: { date: '2023-12-20', citation } });
      expect(decision).toMatchObject({ class: 'enacted-after-baseline', status: 'not-at-baseline', reason: 'published-after-baseline' });
      expect(decision.evidence).toContainEqual(expect.objectContaining({ kind: 'publication-date', value: `2023-12-20 (${citation})` }));
    }
    // Rechtsnorm: Die Verkündung ist konstitutiv – auch bei Textgeltung „vor“ dem Stichtag.
    expect(classifyBaseline({ documentId: 'G', documentDate: '2023-11-20', inForceFrom: '2023-11-01', publication: { date: '2023-12-15', citation: 'GVBl. 2023 S. 700' } }).status).toBe('not-at-baseline');
    // Verwaltungsvorschrift mit Textgeltung vor dem Stichtag, aber erst danach veröffentlicht: nicht geraten, Review.
    const vwv = classifyBaseline({ documentId: 'V', documentDate: '2023-11-21', inForceFrom: '2023-11-08', administrative: true, publication: { date: '2023-12-06', citation: 'BayMBl. 2023 Nr. 585' } });
    expect(vwv).toMatchObject({ status: 'undetermined', reason: 'published-after-baseline-validity-open' });
    expect(vwv.status).not.toBe('active-at-baseline');
    // Ohne belegte Verkündung nach dem Stichtag bleibt es bei der bisherigen Einordnung.
    expect(classifyBaseline({ documentId: 'A', documentDate: '2023-11-21', inForceFrom: '2023-11-08', administrative: true }).status).toBe('active-at-baseline');
  });

  it('entscheidet nach dem Inkrafttreten der amtlichen Verkündung, nicht nach den Portalmetadaten – auch rückwirkend', () => {
    // BayMBl. 2023 Nr. 598 (MStrVerbR): Portal „inkraft 2023-11-15“, Verkündung „mit Wirkung vom 15. Dezember 2023“, hebt
    // nichts auf → keine Fassung am Stichtag.
    const mstr = classifyBaseline({ documentId: 'BayVV_7840_L_14146', documentDate: '2023-11-17', inForceFrom: '2023-11-15', administrative: true, publication: { date: '2023-12-06', citation: 'BayMBl. 2023 Nr. 598', officialEffectiveDate: '2023-12-15' } });
    expect(mstr).toMatchObject({ class: 'enacted-after-baseline', status: 'not-at-baseline', reason: 'official-commencement-after-baseline' });
    expect(mstr.evidence).toContainEqual(expect.objectContaining({ kind: 'official-commencement', value: '2023-12-15 (BayMBl. 2023 Nr. 598)' }));
    // Setzt die Verkündung eine andere Vorschrift außer Kraft, ist ein Vorgänger derselben Identität möglich: Review.
    const replacing = classifyBaseline({ documentId: 'X', documentDate: '2023-11-17', inForceFrom: '2023-11-15', administrative: true, publication: { date: '2023-12-06', citation: 'BayMBl. 2023 Nr. 9', officialEffectiveDate: '2023-12-15', repeals: ['Richtlinie vom 1. Januar 2020 (BayMBl. Nr. 1)'] } });
    expect(replacing).toMatchObject({ status: 'undetermined', reason: 'published-after-baseline-validity-open' });
    // BayMBl. 2023 Nr. 585 (StRVertrBek, Nutzerentscheidung 2026-09-19): „mit Wirkung vom 8. November 2023“ in Kraft,
    // Vorgänger von 2021 mit Ablauf des 7. November 2023 außer Kraft → am Stichtag gilt die neue Fassung, obwohl die
    // Bekanntmachung erst am 2023-12-06 erschien (ausdrücklich bestimmte rückwirkende Wirksamkeit).
    const stell = classifyBaseline({ documentId: 'BayVV_1102_S_14148', documentDate: '2023-11-21', inForceFrom: '2023-11-08', administrative: true, publication: { date: '2023-12-06', citation: 'BayMBl. 2023 Nr. 585', officialEffectiveDate: '2023-11-08', repeals: ['Stellvertretererlass (StRVertrBek) des Bayerischen Ministerpräsidenten vom 11. Februar 2021 (BayMBl. Nr. 164)'] } });
    expect(stell).toMatchObject({ status: 'active-at-baseline', blockers: [] });
    expect(stell.evidence).toContainEqual(expect.objectContaining({ kind: 'official-commencement', value: expect.stringContaining('2023-11-08 (BayMBl. 2023 Nr. 585; hebt auf: Stellvertretererlass (StRVertrBek)') }));
    // Ohne ausdrücklich bestimmte Wirksamkeit in der Verkündung bleibt es beim Review.
    expect(classifyBaseline({ documentId: 'V2', documentDate: '2023-11-21', inForceFrom: '2023-11-08', administrative: true, publication: { date: '2023-12-06', citation: 'BayMBl. 2023 Nr. 9' } }).reason).toBe('published-after-baseline-validity-open');
    // Eine Rechtsnorm bleibt bei der konstitutiven Verkündung: nach dem Stichtag verkündet → nicht am Stichtag.
    expect(classifyBaseline({ documentId: 'G', documentDate: '2023-11-20', inForceFrom: '2023-11-01', publication: { date: '2023-12-15', citation: 'GVBl. 2023 S. 700', officialEffectiveDate: '2023-11-01' } }).reason).toBe('published-after-baseline');
  });

  it('lässt den Jahrgang der Fundstelle entscheiden, wo er den Stichtag nicht umschließt', () => {
    // Die VwV-DTD führt kein Ausfertigungsdatum. Ein Jahrgang ist keines – aber eine Vorschrift im
    // AllMBl. 2000 ist zweifelsfrei vor dem 2023-12-01 erlassen.
    const alt = classifyBaseline({ documentId: 'A', issueYear: '2000', inForceFrom: '2005-01-01' });
    expect(alt.class).toBe('unchanged-since-baseline');
    expect(alt.evidence.some((entry) => entry.kind === 'issue-year')).toBe(true);

    const neu = classifyBaseline({ documentId: 'B', issueYear: '2025', inForceFrom: '2025-06-01' });
    expect(neu.class).toBe('enacted-after-baseline');
  });

  it('bleibt beim Jahrgang des Stichtagsjahres unentschieden', () => {
    // 2023 umschließt den Stichtag: Die Verkündung kann davor oder danach gelegen haben. Da wird
    // nicht geraten.
    const decision = classifyBaseline({ documentId: 'A', issueYear: '2023', inForceFrom: '2023-06-01' });
    expect(decision.status).toBe('undetermined');
    expect(decision.reason).toBe('issue-year-spans-baseline');
  });

  it('lässt das Tagesdatum dem Jahrgang vorgehen', () => {
    const decision = classifyBaseline({ documentId: 'A', documentDate: '2023-12-20', issueYear: '2000', inForceFrom: '2024-01-01' });
    expect(decision.class).toBe('enacted-after-baseline');
  });

  it('bleibt ohne Ausfertigungsdatum unentschieden', () => {
    const decision = classifyBaseline({ documentId: 'X', inForceFrom: '2019-04-01' });
    expect(decision.status).toBe('undetermined');
    expect(decision.reason).toBe('no-issue-date');
  });

  it('bleibt ohne Textgeltung unentschieden', () => {
    const decision = classifyBaseline({ documentId: 'X', documentDate: '1990-01-01' });
    expect(decision.status).toBe('undetermined');
    expect(decision.reason).toBe('no-text-validity-date');
  });

  it('hält eine fehlende Registereintragung für eine Geltungsfrage, nicht für einen Ausschluss', () => {
    // Der Fortführungsnachweis verzeichnet die geltenden Vorschriften. Fehlt eine dort, ist offen,
    // ob sie am Stichtag noch galt – das ist zu klären, nicht zu unterstellen.
    const decision = classifyBaseline({ documentId: 'X', documentDate: '2019-05-28', inForceFrom: '2019-01-01', registerAbsent: true });
    expect(decision.class).toBe('unchanged-since-baseline');
    expect(decision.status).toBe('undetermined');
    expect(decision.blockers[0]).toContain('Fortführungsnachweis');
  });

  it('nimmt jede Tatsache als Beleg auf', () => {
    const decision = classifyBaseline({
      documentId: 'X',
      documentDate: '1976-03-20',
      inForceFrom: '2022-04-01',
      versionDate: '1976-03-20',
      postBaselineEvents: [{ type: 'amend', date: '2024-05-01', citation: 'GVBl. S. 1' }],
    });
    expect(decision.evidence.map((entry) => entry.kind)).toEqual(['issue-date', 'text-in-force', 'version-date', 'post-baseline-event']);
  });
});

describe('Datumsangaben aus dem Zitiervorschlag', () => {
  it('liest die deutschen Schreibungen', () => {
    expect(parseGermanDate('16. Juni 2015')).toBe('2015-06-16');
    expect(parseGermanDate('1. Dezember 2023')).toBe('2023-12-01');
    expect(parseGermanDate('28.11.2019')).toBe('2019-11-28');
    expect(parseGermanDate('1.12.2023')).toBe('2023-12-01');
    expect(parseGermanDate('20. März 1976')).toBe('1976-03-20');
  });

  it('rät nicht, wo kein Datum steht', () => {
    expect(parseGermanDate('BayMBl. Nr. 525')).toBeUndefined();
    expect(parseGermanDate('')).toBeUndefined();
  });

  it('weist zurück, was es im Kalender nicht gibt', () => {
    // Ein falsches Ausfertigungsdatum ist schlimmer als gar keines: Es entscheidet still über die
    // Stichtagsklasse. „32. Mai“ sieht nach einem Datum aus und ist keines.
    expect(parseGermanDate('32. Mai 2020')).toBeUndefined();
    expect(parseGermanDate('31.04.2020')).toBeUndefined();
    expect(parseGermanDate('13.13.2020')).toBeUndefined();
    expect(parseGermanDate('29. Februar 2023')).toBeUndefined();
  });

  it('kennt den Schalttag', () => {
    expect(parseGermanDate('29. Februar 2024')).toBe('2024-02-29');
  });

  it('gewinnt Ausfertigung und letzte Änderung aus einem echten Zitiervorschlag', () => {
    const dates = citationDates('Zitiervorschlag: Redaktionsrichtlinien (RedR) vom 16. Juni 2015 (AllMBl. S. 319), die zuletzt durch Bekanntmachung vom 16. Dezember 2025 (BayMBl. Nr. 587) geändert worden sind');
    expect(dates).toEqual({ issueDate: '2015-06-16', lastAmendmentDate: '2025-12-16' });
  });

  it('hält das Änderungsdatum nicht für die Ausfertigung', () => {
    // Ohne das Abtrennen des Änderungsteils gewänne man bei jeder geänderten Vorschrift das
    // Änderungsdatum als Ausfertigung – und hielte eine alte Vorschrift für neu.
    const dates = citationDates('Bekanntmachung vom 28. Mai 2019 (BayMBl. Nr. 218), die durch Bekanntmachung vom 23. April 2025 geändert worden ist');
    expect(dates.issueDate).toBe('2019-05-28');
    expect(dates.lastAmendmentDate).toBe('2025-04-23');
  });

  it('lässt sich von einem Auslöserwort im Titel nicht täuschen', () => {
    // „… Anlagen für Notfälle/Gefahren **mit** Anschluss an die Polizei vom 23. Juli 2019 …“:
    // Ein früherer Versuch schnitt am Wort „mit“ und verlor damit die Ausfertigung.
    const dates = citationDates('Zitiervorschlag: Bekanntmachung des Bayerischen Staatsministeriums des Innern über die Richtlinie für Anlagen für Notfälle/Gefahren mit Anschluss an die Polizei vom 23. Juli 2019 (BayMBl. Nr. 302), die zuletzt durch Bekanntmachung vom 24. Juni 2025 (BayMBl. Nr. 300) geändert worden ist');
    expect(dates).toEqual({ issueDate: '2019-07-23', lastAmendmentDate: '2025-06-24' });
  });

  it('kommt ohne Änderungsteil aus', () => {
    expect(citationDates('Justizverwaltungsaktenordnung (AktO-JV) vom 20. November 2025 (BayMBl. Nr. 525)')).toEqual({ issueDate: '2025-11-20' });
  });

  it('gewinnt nichts, wo der Zitiervorschlag kein Datum nennt', () => {
    expect(citationDates('Stiftung "Bildungspakt Bayern" - Stiftungszweck und Förderverfahren (KWMBl. 2001 S. 224)')).toEqual({});
    expect(citationDates(undefined)).toEqual({});
  });
});

describe('Auswahl der direkt übernehmbaren Normen', () => {
  const decision = (overrides: Partial<BaselineDecision>): BaselineDecision => ({
    documentId: 'X',
    class: 'unchanged-since-baseline',
    status: 'active-at-baseline',
    method: 'current-unchanged',
    reason: 'text-unchanged-since-before-baseline',
    evidence: [],
    blockers: [],
    ...overrides,
  });
  const file = (decisions: BaselineDecision[]): BaselineFile =>
    ({ schemaVersion: 'bayernrecht-baseline/1', baselineDate: '2023-12-01', evaluationDate: '2026-09-18', totals: { candidates: decisions.length, examined: decisions.length, notCached: 0, unreadable: 0, byClass: {}, byStatus: {}, byMethod: {}, issueDateSource: {} }, decisions }) as BaselineFile;

  it('nimmt nur, wofür der heutige Text belegt der Stichtagstext ist', () => {
    const chosen = directlyImportable(file([
      decision({ documentId: 'gut' }),
      decision({ documentId: 'geaendert', class: 'changed-after-baseline', method: 'undetermined' }),
      decision({ documentId: 'zu-neu', class: 'enacted-after-baseline', status: 'not-at-baseline', method: 'undetermined' }),
      decision({ documentId: 'unklar', status: 'undetermined', method: 'undetermined' }),
    ]));
    expect(chosen).toEqual(['gut']);
  });

  it('nimmt nichts, was einen offenen Punkt trägt', () => {
    // Eine Norm, deren Daten sauber aussehen, deren Geltung aber offen ist, gehört nicht in den
    // Bestand – sonst entscheidet der Import, was die Prüfung offengelassen hat.
    const chosen = directlyImportable(file([
      decision({ documentId: 'mit-blocker', blockers: ['Der Fortführungsnachweis führt die Vorschrift nicht'] }),
    ]));
    expect(chosen).toEqual([]);
  });
});

describe('Rekonstruktionsschlange', () => {
  const amend = (date: string) => ({ eventType: 'amend', eventDate: date });

  it('führt eine Norm mit belegter Basisfassung und wenigen Schritten ganz vorn', () => {
    const entry = classifyReconstruction({ documentId: 'A', events: [amend('2024-03-01')], hasPreBaselineFullText: true });
    expect(entry.state).toBe('recipe-ready');
    expect(entry.steps).toBe(1);
  });

  it('hält eine Neufassung für nicht rückrechenbar, egal wie kurz die Kette ist', () => {
    // Eine Neufassung führt den Alttext nicht mit. Aus ihr folgt die Vorgängerfassung nicht – auch
    // dann nicht, wenn sie der einzige Schritt ist.
    const entry = classifyReconstruction({ documentId: 'A', events: [{ eventType: 'recast', eventDate: '2024-03-01' }], hasPreBaselineFullText: true });
    expect(entry.state).toBe('non-invertible-amendment');
    expect(entry.priority).toBeGreaterThan(classifyReconstruction({ documentId: 'B', events: [amend('2024-03-01'), amend('2025-01-01'), amend('2025-06-01')], hasPreBaselineFullText: true }).priority);
  });

  it('lässt einen Widerspruch alles andere schlagen', () => {
    const entry = classifyReconstruction({ documentId: 'A', events: [amend('2024-03-01')], hasPreBaselineFullText: true, contradictory: true, missingAssets: true });
    expect(entry.state).toBe('contradictory');
  });

  it('hält eine fehlende Anlage für schwerer als eine lange Kette', () => {
    const entry = classifyReconstruction({ documentId: 'A', events: [amend('2024-03-01')], missingAssets: true });
    expect(entry.state).toBe('asset-missing');
  });

  it('meldet eine unbelegte Änderung als Lücke des Registers, nicht der Norm', () => {
    const entry = classifyReconstruction({ documentId: 'A', events: [] });
    expect(entry.state).toBe('missing-base');
    expect(entry.reason).toContain('Kein Ereignis');
  });

  it('ordnet nach Ertrag je Aufwand', () => {
    // Wer die langen Ketten zuerst angeht, gewinnt am Ende weniger Bestand.
    const queue = orderQueue([
      classifyReconstruction({ documentId: 'lang', events: [amend('2024-01-01'), amend('2024-06-01'), amend('2025-01-01')], hasPreBaselineFullText: true }),
      classifyReconstruction({ documentId: 'neufassung', events: [{ eventType: 'recast', eventDate: '2024-01-01' }], hasPreBaselineFullText: true }),
      classifyReconstruction({ documentId: 'kurz', events: [amend('2024-01-01')], hasPreBaselineFullText: true }),
    ]);
    expect(queue.map((entry) => entry.documentId)).toEqual(['kurz', 'lang', 'neufassung']);
  });
});

describe('Eigene Fundstelle im Verkündungsverzeichnis', () => {
  const dates = new Map([
    ['baymbl|2023|629', { date: '2023-12-20', citation: 'BayMBl. 2023 Nr. 629' }],
    ['baymbl|2024|58', { date: '2024-01-31', citation: 'BayMBl. 2024 Nr. 58' }],
  ]);
  it('liest die eigene Fundstelle aus dem Zitiervorschlag einer Verwaltungsvorschrift', async () => {
    const { ownPublication } = await import('@landesrecht/importer-bayernrecht/baseline/run.ts');
    expect(ownPublication({}, '2023-12-01', dates, 'Zitiervorschlag: Bayerische Förderrichtlinie Holz (BayFHolz) vom 1. Dezember 2023 (BayMBl. Nr. 629), die durch Bekanntmachung vom 11. Juni 2024 (BayMBl. Nr. 289) geändert worden ist')).toEqual({ date: '2023-12-20', citation: 'BayMBl. 2023 Nr. 629' });
  });
  it('rät kein Folgejahr: „vom 20. Januar 2023 (BayMBl. Nr. 58)“ ist nicht BayMBl. 2024 Nr. 58', async () => {
    const { ownPublication } = await import('@landesrecht/importer-bayernrecht/baseline/run.ts');
    expect(ownPublication({}, '2023-01-20', dates, 'Bekanntmachung vom 20. Januar 2023 (BayMBl. Nr. 58)')).toBeUndefined();
  });
});
