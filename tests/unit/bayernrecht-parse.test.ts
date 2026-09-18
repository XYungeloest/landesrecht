/**
 * Quellparser BAYERN.RECHT: XML-Leser, Exportpaket, beide DTD-Frontends und das gemeinsame Zielmodell.
 *
 * Alle Fixtures sind echte, gekürzte Ausschnitte der vier abgerufenen Exporte (`BayAbmG`, `BayVerf`,
 * `BayKVzKG`, `BayVwV312180`) – mit BOM, DOCTYPE auf eine Netz-URL, Originalleerraum und den
 * Eigenheiten, um die es geht. Kein Netzzugriff: Der Leser löst die DTD grundsätzlich nicht auf.
 */
import { describe, expect, it } from 'vitest';

import { parseSourceReference } from '@landesrecht/legal-core/lib/schema.ts';
import { continuedTitle, splitDivisionNumber, stripTrailingMarkers } from '@landesrecht/importer-bayernrecht/parse/norm.ts';

import { ImportPipelineError } from '@landesrecht/importer-common/pipeline.ts';
import { parseBodyBlocks, type NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import type { NormHead } from '@landesrecht/importer-bayernrecht/parse/norm.ts';
import {
  createBayernRechtParser,
  detectBayernRechtDialect,
  parseBayernRechtDocument,
  parseBayernRechtPackage,
  provisionSuffix,
  readBayernRechtPackage,
  readPackageManifest,
  readXmlDocument,
  toSuperscript,
} from '@landesrecht/importer-bayernrecht/parse/index.ts';

import { archivedSource, buildZipArchive, fixture, fixtureBytes, flatten, imagePackage, normPackage, vvPackage } from '../helpers/bayernrecht-parse.ts';

const source = archivedSource();

function parse(name: Parameters<typeof fixture>[0], options?: Parameters<typeof parseBayernRechtDocument>[2]) {
  return parseBayernRechtDocument(source, fixture(name), options);
}

function blocks(body: readonly NormBodyBlock[]): NormBodyBlock[] {
  return flatten(body as NormBodyBlock[]);
}

/** Kopfangaben des Normmodells; die beiden Frontends liefern verschiedene Kopftypen. */
function normHead(document: ReturnType<typeof parse>): NormHead {
  if (document.dialect !== 'byrecht-norm') throw new Error(`${document.documentId} ist kein byrecht-norm-Dokument`);
  return document.head as NormHead;
}

function find(body: readonly NormBodyBlock[], predicate: (block: NormBodyBlock) => boolean): NormBodyBlock {
  const block = blocks(body).find(predicate);
  if (!block) throw new Error('Block nicht gefunden');
  return block;
}

describe('XML-Leser (fail-closed, ohne DTD-Auflösung)', () => {
  it('entfernt die BOM und liest die DOCTYPE-Angabe, ohne sie aufzulösen', () => {
    const content = fixture('abmarkungsgesetz');
    expect(content.charCodeAt(0)).toBe(0xfeff);
    const document = readXmlDocument(content);
    expect(document.root.name).toBe('byrecht-norm');
    expect(document.doctype).toEqual({
      name: 'byrecht-norm',
      publicId: '-//Verlag C.H.Beck/DTD Vorschriften//DE',
      // Die System-ID ist eine Netz-URL. Sie wird festgehalten und nie abgerufen.
      systemId: 'http://gesetze-bayern.de/schema/byrecht.normen.dtd',
    });
  });

  it('bricht bei einer Entität ab, die nur die externe DTD definieren könnte', () => {
    const content = fixture('abmarkungsgesetz').replace('<normzitat>', '<normzitat>&Auszug;');
    expect(() => readXmlDocument(content)).toThrow(/Unbekannte Entität &Auszug;/u);
    expect(() => readXmlDocument(content)).toThrow(/externe Entitäten und DTD-Auflösung sind abgeschaltet/u);
  });

  it('kennt die fünf vordefinierten Entitäten und numerische Zeichenreferenzen', () => {
    const document = readXmlDocument('<a>1 &lt; 2 &amp; 3 &#65;&#x42;</a>');
    expect(document.root.children[0]).toEqual({ kind: 'text', value: '1 < 2 & 3 AB' });
  });

  it('lehnt eine interne DTD-Teilmenge ab, statt Entitätsdeklarationen zu deuten', () => {
    expect(() => readXmlDocument('<!DOCTYPE a [<!ENTITY x "y">]><a/>')).toThrow(/Interne DTD-Teilmenge/u);
  });

  it('bricht bei falscher Schachtelung, offenem Element und Inhalt nach dem Wurzelelement ab', () => {
    expect(() => readXmlDocument('<a><b></a></b>')).toThrow(/<\/a> schließt <b> nicht/u);
    expect(() => readXmlDocument('<a><b></b>')).toThrow(/<a> wird nicht geschlossen/u);
    expect(() => readXmlDocument('<a/>Rest')).toThrow(/Inhalt nach dem Wurzelelement/u);
    expect(() => readXmlDocument('<a x="1" x="2"/>')).toThrow(/Attribut x kommt an <a> doppelt vor/u);
  });
});

describe('Dokumentmodell erkennen', () => {
  it('unterscheidet die beiden DTDs und erkennt Fremdes nicht', () => {
    expect(detectBayernRechtDialect(fixture('abmarkungsgesetz'))).toBe('byrecht-norm');
    expect(detectBayernRechtDialect(fixture('verfassung'))).toBe('byrecht-norm');
    expect(detectBayernRechtDialect(fixture('kostenverzeichnis'))).toBe('byrecht-norm');
    expect(detectBayernRechtDialect(fixture('redaktionsrichtlinien'))).toBe('byrecht-vv');
    expect(detectBayernRechtDialect('<html><body>Trefferliste</body></html>')).toBeUndefined();
  });

  it('erfüllt den SourceParser-Vertrag und weist Unerkanntes zurück', async () => {
    const parser = createBayernRechtParser();
    expect(parser.portal).toBe('bayernrecht');
    expect(parser.detect(source, fixture('abmarkungsgesetz'))).toBe(true);
    expect(parser.detect(source, '<html/>')).toBe(false);
    const law = await parser.parse(source, fixture('abmarkungsgesetz'));
    expect(law.portal).toBe('bayernrecht');
    expect(law.title).toBe('Gesetz über die Abmarkung der Grundstücke');
    await expect(parser.parse(source, '<html/>')).rejects.toThrow(ImportPipelineError);
  });
});

describe('byrecht-norm: Kopfangaben', () => {
  it('liest Titel, Kurzbezeichnung, Abkürzung, BayRS-Nummer und Daten (BayAbmG)', () => {
    const document = parse('abmarkungsgesetz');
    expect(document.dialect).toBe('byrecht-norm');
    expect(document.documentId).toBe('BayAbmG');
    expect(document.law.title).toBe('Gesetz über die Abmarkung der Grundstücke');
    expect(document.law.shortTitle).toBe('Abmarkungsgesetz');
    expect(document.law.abbr).toBe('AbmG');
    expect(document.law.type).toBe('gesetz');
    expect(document.law.documentDate).toBe('1981-08-06');
    expect(document.law.sourceValidFrom).toBe('2015-08-01');
    // `gliederungsNr.BayRS` trägt einen abschließenden Zeilenumbruch und das Präfix „BayRS“.
    expect(document.bayRsNumber).toBe('219-2-F');
    expect(document.law.externalIdentifiers).toEqual([
      { system: 'bayernrecht', value: 'BayAbmG', url: 'https://www.gesetze-bayern.de/Content/Document/BayAbmG' },
      { system: 'bayrs', value: '219-2-F' },
    ]);
    // Das amtliche Vollzitat ist die Fundstelle, nicht eine selbst gebaute Zeichenkette.
    expect(document.law.citation).toBe(document.law.fullCitation);
    expect(document.law.citation).toMatch(/^Abmarkungsgesetz \(AbmG\) in der/u);
    expect(document.law.changeHistory).toMatch(/^Änderungen\n1\. § 7 ÄndG vom 23\.3\.1989/u);
  });

  it('normalisiert die Seitenangabe `S=318` zu `318`', () => {
    expect(normHead(parse('abmarkungsgesetz')).issueReference).toEqual({ year: '1981', page: '318', pageKind: 'seite' });
  });

  it('hält Ausfertigungs- und Fassungsfundstelle auseinander (BayVerf: 1946 gegenüber 1998)', () => {
    const head = normHead(parse('verfassung'));
    expect(head.issueReference).toEqual({ year: '1946', page: '333', pageKind: 'seite' });
    expect(head.versionReference).toEqual({ year: '1998', page: '991', pageKind: 'seite' });
  });

  it('toleriert leere Pflichtfelder: <kurzbezeichnung></kurzbezeichnung>, <amtlicheAbk /> und leere Fundstellen', () => {
    const verfassung = parse('verfassung');
    expect(verfassung.law.shortTitle).toBeUndefined();
    expect(verfassung.law.abbr).toBeUndefined();
    // Die Verfassung wird im Portal als doktyp="gesetz" geführt; das Zielmodell kennt „verfassung“.
    expect(verfassung.law.type).toBe('verfassung');
    expect(verfassung.law.findings.map((entry) => entry.code)).toContain('norm-type-refined');

    const kvz = normHead(parse('kostenverzeichnis'));
    // <fundstelle.GVBl><jahr /><seite /></fundstelle.GVBl> der Ausfertigung ist leer.
    expect(kvz.issueReference).toEqual({ year: undefined, page: undefined, pageKind: undefined });
    expect(kvz.versionReference).toEqual({ year: '2001', page: '766', pageKind: 'seite' });
  });
});

describe('byrecht-norm: Gliederung, Vorschrift, Absatz', () => {
  it('schachtelt Gliederungen und trennt Gliederungszeichen von der Überschrift', () => {
    const body = parse('verfassung').law.body;
    const hauptteil = find(body, (block) => block.label === 'Erster Hauptteil');
    expect(hauptteil.type).toBe('part');
    expect(hauptteil.title).toBe('Aufbau und Aufgaben des Staates');
    const abschnitt = (hauptteil.children ?? [])[0]!;
    expect(abschnitt).toMatchObject({ type: 'section', label: '1. Abschnitt', title: 'Die Grundlagen des Bayerischen Staates' });
    expect((abschnitt.children ?? [])[0]).toMatchObject({ type: 'article', label: 'Art. 1' });
  });

  it('führt eine Gliederung ohne Gliederungswort als Überschrift, ohne zu raten', () => {
    const document = parse('abmarkungsgesetz');
    const toc = find(document.law.body, (block) => block.title === 'Inhaltsübersicht');
    expect(toc.label).toBeUndefined();
    expect(document.law.findings).toContainEqual(expect.objectContaining({ severity: 'info', code: 'division-word-unmapped' }));
  });

  it('führt eine Vorschrift ohne Nummer als nummernlose Vorschrift (Präambel, Schlussformel)', () => {
    const praeambel = find(parse('verfassung').law.body, (block) => block.title === '[Präambel]');
    expect(praeambel.type).toBe('preamble');
    expect(praeambel.label).toBeUndefined();
    const schlussformel = find(parse('kostenverzeichnis').law.body, (block) => block.title === 'Schlussformel');
    expect(schlussformel.type).toBe('preamble');
  });

  it('macht aus jurAbsatz mit absatz.nr einen Absatz und aus einem ohne Nummer unmittelbaren Text', () => {
    const artikel1 = find(parse('verfassung').law.body, (block) => block.label === 'Art. 1');
    expect((artikel1.children ?? []).map((block) => [block.type, block.label])).toEqual([
      ['subparagraph', '(1)'], ['subparagraph', '(2)'], ['subparagraph', '(3)'],
    ]);
    const paragraph1 = find(parse('kostenverzeichnis').law.body, (block) => block.label === '§ 1');
    expect((paragraph1.children ?? [])[0]!.type).toBe('paragraphText');
  });

  it('übernimmt Listen mit dem Gliederungszeichen aus <symbol> und schachtelt sie', () => {
    const artikel2 = find(parse('abmarkungsgesetz').law.body, (block) => block.label === 'Art. 2');
    const absatz = (artikel2.children ?? [])[0]!;
    expect(absatz.label).toBe('(1)');
    expect((absatz.children ?? []).map((block) => [block.type, block.label, block.level])).toEqual([
      ['item', '1.', 1], ['item', '2.', 1],
    ]);
    const toc = find(parse('abmarkungsgesetz').law.body, (block) => block.title === 'Inhaltsübersicht');
    const first = (toc.children ?? [])[0]!;
    expect(first.type).toBe('item');
    expect((first.children ?? [])[0]).toMatchObject({ type: 'subitem', level: 2, text: 'Art. 1 Zweck und Wirkung der Abmarkung' });
  });
});

describe('byrecht-norm: Satznummern und Fußnoten', () => {
  it('schreibt Satznummern als Inline-Marker vor den Satz und verwirft die Platzhalter-ids', () => {
    const document = parse('abmarkungsgesetz');
    const artikel2 = find(document.law.body, (block) => block.label === 'Art. 2');
    const absatz = (artikel2.children ?? [])[0]!;
    expect(absatz.text).toMatch(/^¹Der Abmarkung hat die Feststellung/u);
    expect(absatz.text).toContain('²Maßgebend hierfür ist');
    expect(JSON.stringify(document.law.body)).not.toContain('"xx"');
    expect(document.law.findings).toContainEqual(expect.objectContaining({ code: 'sentence-numbers' }));
  });

  it('hängt Fußnoten aus fn.call an der Aufrufstelle an und lässt die Marke im Text stehen', () => {
    const artikel3 = find(parse('abmarkungsgesetz').law.body, (block) => block.label === 'Art. 3');
    const text = find([artikel3], (block) => block.type === 'paragraphText');
    expect(text.text).toContain('des Vermessungs- und Katastergesetzes1)');
    expect((text.children ?? [])[0]).toEqual({ type: 'footnote', label: '1)', text: 'BayRS 219-1-F' });
  });

  it('meldet eine Fußnote ohne Aufrufzeichen (<fn.text />) und erfindet kein Zeichen stillschweigend', () => {
    const document = parse('verfassung');
    const artikel13 = find(document.law.body, (block) => block.label === 'Art. 13');
    const footnote = find([artikel13], (block) => block.type === 'footnote');
    expect(footnote.label).toBe('Fn 1');
    expect(footnote.text).toMatch(/^Für den 14\. Landtag/u);
    expect(document.law.findings).toContainEqual(expect.objectContaining({ severity: 'warning', code: 'footnote-marker-missing' }));
  });

  it('hängt eine Fußnote aus der Gliederungsüberschrift an die Gliederung', () => {
    const abschnitt = find(parse('verfassung').law.body, (block) => block.label === '3. Abschnitt');
    expect(abschnitt.title).toBe('Der Senat1)');
    expect((abschnitt.children ?? [])[0]).toMatchObject({ type: 'footnote', label: '1)' });
  });
});

describe('byrecht-norm: aufgehobene Vorschriften', () => {
  it('erhält den Platzhalter „(aufgehoben)“ bei leerem absatz.text als Block und meldet ihn', () => {
    const document = parse('verfassung');
    const artikel35 = find(document.law.body, (block) => block.label === 'Art. 35');
    expect(artikel35).toEqual({ type: 'article', label: 'Art. 35', title: '(aufgehoben)', children: [] });
    expect(document.law.findings).toContainEqual(expect.objectContaining({ severity: 'info', code: 'repealed-provision' }));
  });
});

describe('byrecht-norm: Tabellen und Anlagen', () => {
  it('bildet Tabellen nach dem Blockmodell ab, mit Spaltenzahl, colspan, rowspan und Kopfzellen', () => {
    const document = parse('kostenverzeichnis');
    const tables = blocks(document.law.body).filter((block) => block.type === 'table');
    expect(tables).toHaveLength(2);
    expect(tables[0]).toMatchObject({ columns: 2 });
    const grid = tables[1]!;
    expect(grid.columns).toBe(6);
    const headerCells = (grid.children ?? [])[0]!.children ?? [];
    expect(headerCells.map((cell) => [cell.type, cell.text, cell.colspan, cell.rowspan, cell.scope])).toEqual([
      ['tableHeaderCell', 'Tarif-Nr.', 2, undefined, 'col'],
      ['tableHeaderCell', 'Gegenstand', 3, 2, 'col'],
      ['tableHeaderCell', 'Gebühr\n\nEuro', undefined, 2, 'col'],
    ]);
    expect(document.law.findings).toContainEqual(expect.objectContaining({ code: 'tables' }));
  });

  it('behandelt <sup> im Normmodell als echte Hochstellung („m³“), nicht als Satznummer', () => {
    const document = parse('kostenverzeichnis');
    expect(JSON.stringify(document.law.body)).toContain('bis zu 50.000 m³');
    expect(document.law.findings.map((entry) => entry.code)).not.toContain('sentence-numbers');
  });

  it('nimmt bei doppeltem annex.nummer die Variante mit @int und adressiert die Anlage positionell', () => {
    const document = parse('kostenverzeichnis');
    const annex = find(document.law.body, (block) => block.type === 'annex');
    expect(annex.label).toBe('Anlage');
    expect(annex.title).toBeUndefined(); // <annex.titel /> ist leer
    expect(document.addresses.find((entry) => entry.kind === 'annex')).toMatchObject({
      documentId: 'BayKVzKG-ANL_1',
      url: 'https://www.gesetze-bayern.de/Content/Document/BayKVzKG-ANL_1',
      xmlId: 'ANL_1',
    });
  });
});

describe('Permalinks werden gezählt, nicht aus XML-IDs abgeleitet', () => {
  it('adressiert Gliederungen über den Positionspfad, nicht über gliederungsid', () => {
    const document = parse('verfassung');
    const divisions = document.addresses.filter((entry) => entry.kind === 'division');
    // Im XML heißen die beiden Abschnitte G_2 und G_4, im Portal BayVerf-G1_1 und BayVerf-G1_2.
    expect(divisions.map((entry) => [entry.documentId, entry.xmlId])).toEqual([
      ['BayVerf-G1_1', 'G_2'],
      ['BayVerf-G1_2', 'G_4'],
      ['BayVerf-G1', 'G_1'],
    ]);
    expect(divisions[0]!.position).toEqual([1, 1]);
  });

  it('adressiert Vorschriften über die Artikelbezeichnung und nummernlose über NN<i>', () => {
    const document = parse('verfassung');
    const provisions = document.addresses.filter((entry) => entry.kind === 'provision');
    expect(provisions.map((entry) => [entry.documentId, entry.xmlId])).toEqual([
      ['BayVerf-NN1', 'P_1'],
      ['BayVerf-1', 'P_2'],
      ['BayVerf-13', 'P_15'],
      ['BayVerf-35', 'P_40'],
    ]);
    expect(provisionSuffix('Art. 3a')).toBe('3a');
    expect(provisionSuffix('§ 12')).toBe('12');
    expect(provisionSuffix('[Präambel]')).toBeUndefined();
  });

  it('zählt nummernlose Vorschriften fort und rät für den Inhalt einer Anlage keinen Permalink', () => {
    const document = parse('kostenverzeichnis');
    // Im Rumpf: § 1 und die Schlussformel. Belegt ist für Anlagen nur `-ANL_<i>`; wie das Portal
    // Vorschriften **innerhalb** einer Anlage adressiert, ist unbekannt – dort wird nichts erfunden.
    expect(document.addresses.filter((entry) => entry.kind === 'provision').map((entry) => entry.documentId))
      .toEqual(['BayKVzKG-1', 'BayKVzKG-NN1']);
    expect(document.unresolvedAddresses.map((entry) => entry.kind)).toEqual(['provision', 'provision']);
    expect(document.unresolvedAddresses[0]!.reason).toMatch(/innerhalb einer Anlage/u);
  });
});

describe('Weitere Strukturen des Beispielkorpus (28 Pakete)', () => {
  it('liest die Eingangsformel aus <einleitungssatz> als Normtext (BayBhV)', () => {
    const document = parse('beihilfeverordnung');
    expect(document.law.body[1]).toMatchObject({ type: 'paragraphText' });
    expect(document.law.body[1]!.text).toMatch(/^Auf Grund des Art\. 86a Abs\. 5 Satz 1/u);
    expect(document.law.findings.map((entry) => entry.code)).not.toContain('unknown-element');
  });

  it('nimmt <annex.text> und den vollen Gliederungsbaum in der Anlage auf (BayBhV)', () => {
    const document = parse('beihilfeverordnung');
    const annexes = document.law.body.filter((block) => block.type === 'annex');
    expect(annexes).toHaveLength(2);
    // annex.text: Tabelle unmittelbar in der Anlage.
    expect(blocks([annexes[0]!]).some((block) => block.type === 'table')).toBe(true);
    // <gliederung> in der Anlage, Gliederungszeichen aus <gliederung.nr>.
    const division = find([annexes[1]!], (block) => block.label === 'I.');
    expect(division).toMatchObject({ type: 'part', title: 'Beamtinnen und Beamte' });
    expect((division.children ?? [])[0]).toMatchObject({ type: 'paragraph', label: '1.' });
  });

  it('erhält die Langform der Anlagenbezeichnung als eigene Überschriftszeile (BayBhV)', () => {
    const annex = find(parse('beihilfeverordnung').law.body, (block) => block.type === 'annex');
    // Kurzform aus der Variante mit @int …
    expect(annex.label).toBe('Anlage 1');
    // … und die gedruckte Langform mit dem Bezug in die Norm geht nicht verloren.
    expect((annex.children ?? [])[0]).toEqual({ type: 'heading', text: 'Anlage 1 (zu § 7 Abs. 1)' });
  });

  it('führt <Aenderungsinhalt> als Zitat, nicht als eigenen Normtext (VVBayHO)', () => {
    const document = parse('haushaltsvorschriften');
    const quoted = find(document.law.body, (block) => block.type === 'quotedProvision');
    const inner = (quoted.children ?? [])[0]!;
    expect(inner).toMatchObject({ type: 'article', label: 'Art. 1', title: 'Feststellung des Haushaltsplans' });
    // Der zitierte Art. 1 gehört einer anderen Norm: keine Adresse, keine NN-Nummer.
    expect(document.addresses.map((entry) => entry.documentId)).not.toContain('VVBayHO-1');
    expect(document.addresses.filter((entry) => entry.kind === 'provision').map((entry) => entry.documentId)).toEqual(['VVBayHO-NN1']);
    expect(document.law.findings).toContainEqual(expect.objectContaining({ code: 'quoted-provisions' }));
  });

  it('erkennt <Aenderungsinhalt> auch in einem Listenpunkt (BayRadG)', () => {
    const document = parse('radverkehrsgesetz');
    const quoted = find(document.law.body, (block) => block.type === 'quotedProvision');
    expect(find([quoted], (block) => block.type === 'paragraphText').text).toMatch(/^²Die besondere Gefährdung/u);
    expect(document.law.findings.map((entry) => entry.code)).not.toContain('unknown-element');
    // Nur die zitierende Vorschrift selbst hat eine Adresse.
    expect(document.addresses.filter((entry) => entry.kind === 'provision').map((entry) => entry.label)).toEqual(['Art. 13a']);
  });

  it('kennt @doktyp="vwv" und die Fundstelle in einem anderen Blatt (VVBayHO)', () => {
    const document = parse('haushaltsvorschriften');
    expect(document.documentType).toBe('vwv');
    expect(document.law.type).toBe('verwaltungsvorschrift');
    // <sonstigeFundstelle> mit eigenem Verkündungsorgan statt einer leeren GVBl.-Fundstelle.
    expect(normHead(document).versionReference).toEqual({ year: '1973', page: '259', pageKind: 'seite', publication: 'FMBl.' });
  });

  it('führt einen Tarifvertrag lesbar, überlässt die Aufnahme aber dem Review', () => {
    // Werte aus TV_L: @doktyp="tarifvertrag" – das Zielmodell kennt keinen eigenen Typ dafür.
    const document = parseBayernRechtDocument(source, fixture('abmarkungsgesetz').replace('doktyp="gesetz"', 'doktyp="tarifvertrag"'));
    expect(document.law.type).toBe('verwaltungsabkommen');
    const finding = document.law.findings.find((entry) => entry.code === 'norm-type-out-of-model');
    expect(finding).toMatchObject({ severity: 'warning' });
    expect(finding!.message).toContain('docs/LEGAL_SCOPE.md');
  });

  it('erkennt „(nicht mehr belegt)“ als Platzhalter einer aufgehobenen Vorschrift (BayVSO)', () => {
    const document = parse('schulordnung');
    const provision = find(document.law.body, (block) => block.label === '§ 17');
    expect(provision).toMatchObject({ type: 'paragraph', title: '(nicht mehr belegt)', children: [] });
    expect(document.law.findings).toContainEqual(expect.objectContaining({ severity: 'info', code: 'repealed-provision' }));
    expect(document.law.findings.map((entry) => entry.code)).not.toContain('empty-provision');
  });

  it('führt Abbildungen als Beilage, ohne eine Bildbeschreibung als Normtext auszugeben (BayBoFiV)', () => {
    const document = parse('bodenfischerei');
    expect(document.graphics.map((entry) => [entry.fileName, entry.description])).toEqual([
      ['BayBoFiV_BayBoFiV-A2-N1.gif', 'Schematische Darstellung'],
      ['BayBoFiV_BayBoFiV-A2-N2.gif', 'Benennung'],
    ]);
    // Die Überschrift der Vorschrift ist echter Normtext und bleibt stehen …
    expect(find(document.law.body, (block) => block.label === 'Nummer 1').title).toBe('Schematische Darstellung des Seebodens bei mittlerem Wasserstand');
    // … die Bildbeschreibung aus @Desc dagegen erscheint nirgends als Text.
    expect(blocks(document.law.body).some((block) => block.text === 'Schematische Darstellung')).toBe(false);
    expect(JSON.stringify(document.law.body)).not.toContain('graphic');
    expect(document.law.findings).toContainEqual(expect.objectContaining({ severity: 'warning', code: 'graphic-not-transferred' }));
    // Eine Vorschrift, die nur eine Abbildung trägt, ist nicht „leer“.
    expect(document.law.findings).toContainEqual(expect.objectContaining({ severity: 'info', code: 'provision-graphic-only' }));
    expect(document.law.findings.map((entry) => entry.code)).not.toContain('empty-provision');
  });

  it('nimmt das Attribut verweis.norm@anfrage hin, ohne es zu deuten (BayBhV, TV_L)', () => {
    const document = parse('beihilfeverordnung');
    expect(document.law.findings.map((entry) => entry.code)).not.toContain('unknown-attribute');
    expect(document.law.findings.map((entry) => entry.code)).not.toContain('unknown-attributes');
  });

  it('meldet ein unbekanntes Attribut als Warnung, nie als Fehler', () => {
    const document = parseBayernRechtDocument(source, fixture('abmarkungsgesetz').replace('<rumpf>', '<rumpf sortierung="alt">'), { unknown: 'report' });
    expect(document.law.findings.filter((entry) => entry.severity === 'error')).toEqual([]);
    expect(document.law.findings).toContainEqual(expect.objectContaining({ severity: 'warning', code: 'unknown-attributes' }));
  });
});

describe('byrecht-vv: eigenes Modell', () => {
  it('liest die Metadaten aus metadaten/bayernrecht und normalisiert die Seitenangabe', () => {
    const document = parse('redaktionsrichtlinien');
    expect(document.dialect).toBe('byrecht-vv');
    expect(document.documentId).toBe('BayVwV312180');
    expect(document.law.type).toBe('verwaltungsvorschrift');
    expect(document.law.title).toBe('Richtlinien für die Redaktion von Rechtsvorschriften');
    expect(document.law.shortTitle).toBe('Redaktionsrichtlinien');
    expect(document.law.abbr).toBe('RedR');
    expect(document.law.sourceValidFrom).toBe('2026-01-01');
    expect(document.head).toMatchObject({ documentClass: '100', gazette: { organ: 'AllMBl.', year: '2015', page: '319' } });
    // Die VV-DTD kennt kein Ausfertigungsdatum als Feld; es wird keines aus dem Fließtext erfunden.
    expect(document.law.documentDate).toBeUndefined();
    // Auch kein builddate – das gibt es nur im Normmodell.
    expect(document.buildDate).toBeUndefined();
  });

  it('übernimmt die BayRS-Nummer nur, wenn die erste Titelzeile eine Gliederungsnummer ist', () => {
    const document = parse('redaktionsrichtlinien');
    expect(document.bayRsNumber).toBe('103-S');
    expect(document.law.externalIdentifiers).toContainEqual({ system: 'bayrs', value: '103-S' });
    const without = parseBayernRechtDocument(source, fixture('redaktionsrichtlinien').replace('<p typ="titel">103-S<br />', '<p typ="titel">Ohne Nummer<br />'));
    expect(without.bayRsNumber).toBeUndefined();
    expect(without.law.findings).toContainEqual(expect.objectContaining({ code: 'vv-bayrs-number-absent' }));
  });

  it('nimmt das Vollzitat als Fundstelle und lässt den Subtitel im Körper stehen', () => {
    const document = parse('redaktionsrichtlinien');
    expect(document.law.fullCitation).toMatch(/^Zitiervorschlag: Redaktionsrichtlinien \(RedR\)/u);
    expect(document.law.citation).toBe(document.law.fullCitation);
    expect(document.law.body[0]).toMatchObject({ type: 'heading' });
    expect(document.law.body[1]!.text).toContain('Bekanntmachung der Bayerischen Staatsregierung');
  });

  it('schachtelt gliederung[@ebene] rekursiv und nimmt gliederung.nr als Gliederungszeichen', () => {
    const document = parse('redaktionsrichtlinien');
    const zwei = find(document.law.body, (block) => block.label === '2.');
    expect(zwei).toMatchObject({ type: 'section', title: 'Aufbau und Bestandteile von Rechtsvorschriften' });
    expect((zwei.children ?? []).map((block) => [block.type, block.label])).toEqual([
      ['subsection', '2.1'], ['subsection', '2.2'],
    ]);
    // Die Schlussformel trägt keine Gliederungsnummer – es wird keine erfunden.
    const schlussformel = find(document.law.body, (block) => block.title === 'Schlussformel');
    expect(schlussformel.label).toBeUndefined();
  });

  it('liest Satznummern aus <sup> und meldet eine echte Hochstellung als Zweifelsfall', () => {
    const document = parse('redaktionsrichtlinien');
    const zweiZwei = find(document.law.body, (block) => block.label === '2.2');
    const text = (zweiZwei.children ?? [])[0]!.text ?? '';
    expect(text).toMatch(/^¹Für Stammnormen/u);
    // Die Quelle schreibt die fünfte Satznummer unmittelbar hinter den Punkt.
    expect(text).toContain('nicht verwendet werden.⁵Änderungsvorschriften');
    // „m²“ ist eine echte Hochstellung: übernommen, aber nicht als Satznummer gezählt.
    const dreiDrei = find(document.law.body, (block) => block.label === '3.3');
    expect((dreiDrei.children ?? [])[0]!.text).toContain('„m²“');
    expect(document.law.findings).toContainEqual(expect.objectContaining({ severity: 'warning', code: 'vv-superscript-ambiguous' }));
  });

  it('trennt die Zählart der Fundstelle: BayMBl. zählt Nummern, die Vorgängerblätter Seiten', () => {
    const seite = parse('redaktionsrichtlinien');
    expect(seite.head).toMatchObject({ gazette: { organ: 'AllMBl.', page: '319', pageKind: 'seite' } });
    // `Nr=277` ist an BayVV_631_J_10511 belegt: das BayMBl. macht Bekanntmachungen einzeln bekannt.
    const nummer = parseBayernRechtDocument(source, fixture('redaktionsrichtlinien')
      .replace('<bayernrecht_fundstellen_organ wert="AllMBl." />', '<bayernrecht_fundstellen_organ wert="BayMBl." />')
      .replace('<bayernrecht_fundstellen_seite>S=319</bayernrecht_fundstellen_seite>', '<bayernrecht_fundstellen_seite>Nr=277</bayernrecht_fundstellen_seite>'));
    expect(nummer.head).toMatchObject({ gazette: { organ: 'BayMBl.', page: '277', pageKind: 'nummer' } });
    expect(nummer.law.findings.map((entry) => entry.code)).not.toContain('gazette-page-format');
  });

  it('nimmt <hr/> als typografische Trennlinie hin, ohne Text zu verlieren', () => {
    // `<p><hr /></p>` kommt in Verwaltungsvorschriften vor (belegt an BayVV_631_J_10511).
    const document = parseBayernRechtDocument(source, fixture('redaktionsrichtlinien')
      .replace('<p typ="vollzitat">', '<p><hr /></p><p typ="vollzitat">'));
    expect(document.law.findings.map((entry) => entry.code)).not.toContain('unknown-element');
    expect(document.law.body).toEqual(parse('redaktionsrichtlinien').law.body);
  });

  it('führt gliederung[@inkraft] als abschnittsweise Zeitinformation und rät keinen Permalink', () => {
    const document = parse('redaktionsrichtlinien');
    expect(document.sectionEffectiveDates).toContainEqual({ label: '9.', title: 'Inkrafttreten', date: '2018-03-22' });
    expect(document.law.sourceNotes).toContainEqual(expect.objectContaining({ label: 'Abschnittsweises Inkrafttreten' }));
    // Nur die Dokumentadresse ist belegt; für die Gliederungen wird der Pfad gezählt, aber nichts geraten.
    expect(document.addresses.map((entry) => entry.documentId)).toEqual(['BayVwV312180']);
    expect(document.unresolvedAddresses.length).toBeGreaterThan(5);
    expect(document.unresolvedAddresses[0]!.position).toEqual([1]);
    expect(document.law.findings).toContainEqual(expect.objectContaining({ code: 'vv-section-address-unresolved' }));
  });
});

describe('@builddate bleibt aus jedem Gleichheitsvergleich heraus', () => {
  it('liefert bei geändertem builddate denselben Körper und denselben Fingerabdruck', () => {
    const original = fixture('abmarkungsgesetz');
    const altered = original.replace('builddate="17.09.2026_02:00"', 'builddate="18.09.2026_02:00"');
    expect(altered).not.toBe(original);

    const first = parseBayernRechtDocument(source, original);
    const second = parseBayernRechtDocument(
      // Auch Abrufzeit und Paket-Hash ändern sich täglich mit – beide bleiben ebenfalls draußen.
      archivedSource({ retrievedAt: '2026-09-18T02:30:00.000Z', sha256: 'b'.repeat(64) }),
      altered,
    );

    expect(first.buildDate).toBe('17.09.2026_02:00');
    expect(second.buildDate).toBe('18.09.2026_02:00');
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.law.body).toEqual(first.law.body);
    expect(JSON.stringify(first.law)).not.toContain('17.09.2026');
    expect(JSON.stringify(second.law)).not.toContain('18.09.2026');
  });

  it('ändert den Fingerabdruck, sobald sich der Text ändert', () => {
    const original = fixture('abmarkungsgesetz');
    const changed = original.replace('Bayern ist', 'Bayern war');
    const altered = original.replace('Zuständigkeit', 'Zuständigkeiten');
    expect(parseBayernRechtDocument(source, altered).fingerprint).not.toBe(parseBayernRechtDocument(source, original).fingerprint);
    expect(parseBayernRechtDocument(source, changed).fingerprint).toBe(parseBayernRechtDocument(source, original).fingerprint);
  });
});

describe('Fail-closed: unbekannte Strukturen', () => {
  const withUnknown = (): string =>
    fixture('abmarkungsgesetz').replace('<para.titel>', '<verlagsnotiz>redaktioneller Hinweis</verlagsnotiz><para.titel>');

  it('bricht in der Vorgabe mit ImportPipelineError ab und nennt das Element beim Namen', () => {
    expect(() => parseBayernRechtDocument(source, withUnknown())).toThrow(ImportPipelineError);
    expect(() => parseBayernRechtDocument(source, withUnknown())).toThrow(/Unbekanntes Element <verlagsnotiz>/u);
  });

  it('erzeugt im Meldemodus einen benannten Befund und verliert den Text nicht', () => {
    const document = parseBayernRechtDocument(source, withUnknown(), { unknown: 'report' });
    const codes = document.law.findings.filter((entry) => entry.severity === 'error').map((entry) => entry.code);
    expect(codes).toContain('unknown-element');
    expect(codes).toContain('unknown-structure');
    expect(document.law.findings.find((entry) => entry.code === 'unknown-structure')!.message).toContain('verlagsnotiz');
    expect(JSON.stringify(document.law.body)).toContain('redaktioneller Hinweis');
  });

  it('meldet ein unbekanntes Attribut, ohne den Inhalt zu verwerfen', () => {
    const document = parseBayernRechtDocument(source, fixture('abmarkungsgesetz').replace('<rumpf>', '<rumpf sortierung="alt">'));
    expect(document.law.findings).toContainEqual(expect.objectContaining({ severity: 'warning', code: 'unknown-attribute' }));
    expect(document.law.body.length).toBeGreaterThan(1);
  });

  it('kennt den belegten Normtyp „vertrag“ und setzt einen mehrzeilig gesetzten Titel zusammen', () => {
    // Werte aus dem Exportpaket BayBwEgauquVertr: @doktyp="vertrag", Titel über zwei Zeilen. Früher blieb der
    // Titel „Staatsvertrag“ stehen (Befund title-possibly-truncated); die Folgezeile beginnt klein und gehört dazu.
    const content = fixture('abmarkungsgesetz')
      .replace('doktyp="gesetz"', 'doktyp="vertrag"')
      .replace('<titelangaben>Gesetz über die Abmarkung der Grundstücke<br />', '<titelangaben>Staatsvertrag<br />zwischen dem Freistaat Bayern und dem Land Baden-Württemberg<br />');
    const document = parseBayernRechtDocument(source, content);
    expect(document.law.type).toBe('staatsvertrag');
    expect(document.law.title).toBe('Staatsvertrag zwischen dem Freistaat Bayern und dem Land Baden-Württemberg');
    expect(document.law.findings).toContainEqual(expect.objectContaining({ severity: 'info', code: 'title-continued' }));
    expect(document.law.findings.some((finding) => finding.code === 'title-possibly-truncated')).toBe(false);
    // Die Zeile steht genau einmal im Ergebnis: im Titel, nicht noch einmal als Überschrift im Körper.
    expect(JSON.stringify(document.law.body)).not.toContain('zwischen dem Freistaat Bayern und dem Land Baden-Württemberg');
  });

  it('bricht bei unbekanntem Normtyp ab, statt einen zu raten', () => {
    expect(() => parseBayernRechtDocument(source, fixture('abmarkungsgesetz').replace('doktyp="gesetz"', 'doktyp="hausmitteilung"')))
      .toThrow(/unbekannter Normtyp @doktyp="hausmitteilung"/u);
  });
});

describe('Exportpaket (ZIP, Manifest, Beilagen)', () => {
  it('liest die echten Manifeste beider Paketarten', () => {
    expect(readPackageManifest(fixture('manifestAbmarkungsgesetz'))).toEqual([
      { fullPath: '/bayportalnorm/BayAbmG.xml', mediaType: 'application/beck.bayportalnorm.text' },
    ]);
    const vv = readPackageManifest(fixture('manifestVv'));
    expect(vv).toHaveLength(3);
    expect(vv.filter((entry) => entry.mediaType === 'application/pdf')).toHaveLength(2);
    expect(readPackageManifest(fixture('manifestKostenverzeichnis'))).toHaveLength(22);
  });

  it('öffnet ein Paket und findet mimetype, Normdokument und Beilagen', () => {
    const archive = readBayernRechtPackage(vvPackage());
    expect(archive.mimetype).toBe('bayportalvv+zip');
    expect(archive.documentPath).toBe('bayportalvv/BayVwV312180.xml');
    expect(archive.documentMediaType).toBe('application/beck.bayportalvv.text');
    expect(archive.xml.charCodeAt(0)).toBe(0xfeff);
    expect(archive.attachments.map((entry) => entry.path)).toEqual([
      'pdf/BayVwV312180_BayVV103-S-064-KF-005-Anhang-001.pdf',
      'pdf/BayVwV312180_BayVwV312180-A1-N1.pdf',
    ]);
    expect(archive.attachments[0]!.sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('führt die PDF-Beilagen als unverortete Anhänge und sagt das ausdrücklich', () => {
    const document = parseBayernRechtPackage(archivedSource({ url: 'https://www.gesetze-bayern.de/Content/Zip/BayVwV312180' }), vvPackage());
    expect(document.attachments).toHaveLength(2);
    const pdfs = document.law.sourceReferences.filter((entry) => entry.kind === 'primary-pdf');
    expect(pdfs).toHaveLength(2);
    expect(pdfs[0]).toMatchObject({ availability: 'external', mediaType: 'application/pdf', url: 'https://www.gesetze-bayern.de/Content/Zip/BayVwV312180' });
    expect(pdfs[0]!.note).toMatch(/Zuordnung zur Textstelle ist aus dem Export nicht herstellbar/u);
    expect(document.law.sourceNotes).toContainEqual(expect.objectContaining({ label: 'Unverortete Beilagen' }));
    // Die Beilagen gehen mit ihrem eigenen, stabilen Hash in den Fingerabdruck ein.
    expect(document.fingerprint).not.toBe(parse('redaktionsrichtlinien').fingerprint);
  });

  it('lässt Bildbeilagen zu und meldet die Abweichung zwischen Medienart und Dateiendung', () => {
    const archive = readBayernRechtPackage(imagePackage());
    expect(archive.attachments.every((entry) => entry.kind === 'image')).toBe(true);
    // Das Manifest deklariert image/jpg für Dateien mit Endung .gif – unverändert übernommen …
    expect(archive.attachments[0]!.mediaType).toBe('image/jpg');
    expect(archive.attachments[0]!.path).toMatch(/^img\/.*\.gif$/u);
    // … und gemeldet, nicht glattgezogen.
    expect(archive.warnings.length).toBe(archive.attachments.length);
    expect(archive.warnings[0]).toMatch(/deklariert image\/jpg, die Dateiendung ist \.gif/u);

    const document = parseBayernRechtPackage(source, imagePackage());
    expect(document.law.findings).toContainEqual(expect.objectContaining({ severity: 'warning', code: 'package-media-type-mismatch' }));
    expect(document.law.sourceNotes).toContainEqual(expect.objectContaining({ label: 'Abbildungen' }));
    // Bildbeilagen tragen keine mediaType-Angabe: der Vorrat von legal-core kennt keine Bildmedienart.
    const images = document.law.sourceReferences.filter((entry) => entry.derivedSource?.startsWith('img/'));
    expect(images.length).toBeGreaterThan(0);
    expect(images.every((entry) => entry.mediaType === undefined)).toBe(true);
    expect(images[0]!.note).toContain('image/jpg');
  });

  it('meldet nichts, wenn Medienart und Dateiendung zusammenpassen (BAY_791_3_150_U)', () => {
    const manifest = fixture('manifestNaturschutzgebiet');
    const images = [...manifest.matchAll(/full-path="\/(img\/[^"]+)"/gu)].map((match) => match[1]!);
    expect(images.every((path) => path.endsWith('.jpg'))).toBe(true);
    const archive = readBayernRechtPackage(buildZipArchive([
      { path: 'mimetype', content: 'bayportalnorm+zip' },
      { path: 'META-INF/manifest.xml', content: manifest },
      { path: 'bayportalnorm/BAY_791_3_150_U.xml', content: fixtureBytes('abmarkungsgesetz') },
      ...images.map((path) => ({ path, content: 'JFIF' })),
    ]));
    expect(archive.attachments.map((entry) => entry.kind)).toEqual(images.map(() => 'image'));
    expect(archive.warnings).toEqual([]);
  });

  it('bricht bei einer unbekannten Medienart weiterhin ab', () => {
    const manifest = fixture('manifestAbmarkungsgesetz').replace('application/beck.bayportalnorm.text" full-path="/bayportalnorm/BayAbmG.xml',
      'application/beck.bayportalnorm.text" full-path="/bayportalnorm/BayAbmG.xml" /><file-entry media-type="audio/ogg" full-path="/snd/ton.ogg');
    const archive = buildZipArchive([
      { path: 'mimetype', content: 'bayportalnorm+zip' },
      { path: 'META-INF/manifest.xml', content: manifest },
      { path: 'bayportalnorm/BayAbmG.xml', content: fixtureBytes('abmarkungsgesetz') },
      { path: 'snd/ton.ogg', content: 'OggS' },
    ]);
    expect(() => readBayernRechtPackage(archive)).toThrow(/Unbekannte Medienart audio\/ogg/u);
  });

  it('parst ein Paket ohne Beilagen unverändert zum reinen XML-Lauf', () => {
    const document = parseBayernRechtPackage(source, normPackage());
    expect(document.documentId).toBe('BayAbmG');
    expect(document.attachments).toEqual([]);
    expect(document.fingerprint).toBe(parse('abmarkungsgesetz').fingerprint);
  });

  it('bricht ab, wenn Paketinhalt und Manifest auseinanderfallen', () => {
    const orphan = buildZipArchive([
      { path: 'mimetype', content: 'bayportalnorm+zip' },
      { path: 'META-INF/manifest.xml', content: fixture('manifestAbmarkungsgesetz') },
      { path: 'bayportalnorm/BayAbmG.xml', content: fixtureBytes('abmarkungsgesetz') },
      { path: 'bayportalnorm/Zusatz.xml', content: '<a/>' },
    ]);
    expect(() => readBayernRechtPackage(orphan)).toThrow(/Paketeinträge ohne Manifesteintrag: bayportalnorm\/Zusatz\.xml/u);

    const missing = buildZipArchive([
      { path: 'mimetype', content: 'bayportalvv+zip' },
      { path: 'META-INF/manifest.xml', content: fixture('manifestVv') },
      { path: 'bayportalvv/BayVwV312180.xml', content: fixtureBytes('redaktionsrichtlinien') },
    ]);
    expect(() => readBayernRechtPackage(missing)).toThrow(/die Datei fehlt im Paket/u);

    const withoutMimetype = buildZipArchive([
      { path: 'META-INF/manifest.xml', content: fixture('manifestAbmarkungsgesetz') },
      { path: 'bayportalnorm/BayAbmG.xml', content: fixtureBytes('abmarkungsgesetz') },
    ]);
    expect(() => readBayernRechtPackage(withoutMimetype)).toThrow(/keinen Eintrag mimetype/u);
  });
});

describe('Ergebnis passt in das kanonische Blockmodell', () => {
  it('besteht die Blockprüfung aus legal-core für alle Fixtures', () => {
    const names = [
      'abmarkungsgesetz', 'verfassung', 'kostenverzeichnis', 'redaktionsrichtlinien',
      'beihilfeverordnung', 'haushaltsvorschriften', 'bodenfischerei', 'radverkehrsgesetz', 'schulordnung',
    ] as const;
    for (const name of names) {
      const document = parse(name);
      expect(() => parseBodyBlocks(document.law.body, `${name}.body`)).not.toThrow();
      expect(document.law.body.length).toBeGreaterThan(0);
      expect(document.law.citation).not.toBe('');
      expect(document.law.sourceUrl).toBe(`https://www.gesetze-bayern.de/Content/Document/${document.documentId}`);
      expect(document.law.pdfUrl).toBe(`https://www.gesetze-bayern.de/Content/Pdf/${document.documentId}?all=False`);
      expect(document.law.sourceIdentity).toBe(document.documentId);
    }
  });

  it('sammelt die Zitierziele aus @ersatz, ohne sie aufzulösen', () => {
    const document = parse('abmarkungsgesetz');
    expect(document.citations.map((entry) => entry.target)).toContain('BayVermKatG');
    expect(document.citations.every((entry) => entry.target !== '')).toBe(true);
  });

  it('stellt Hochstellungen zeichenweise um und meldet, was keine hat', () => {
    expect(toSuperscript('12')).toEqual({ text: '¹²', mapped: true });
    expect(toSuperscript('§')).toEqual({ text: '§', mapped: false });
  });
});

describe('Quellenreferenz besteht die Schemaprüfung von legal-core', () => {
  // Der Abruf liefert einen vollen Zeitstempel („2026-09-17T08:50:40.682Z"), die Quellenreferenz
  // verlangt ein Tagesdatum. Wurde er durchgereicht, scheiterte **jede** Norm – aber erst beim
  // Schreiben, lange nach dem Parsen, und keiner der Parsertests sah es: Sie prüften die Gestalt der
  // Referenz, nie ihre Gültigkeit nach dem Schema. Deshalb prüft dieser Test gegen legal-core selbst.
  const parsed = () => parseBayernRechtDocument(archivedSource(), fixture('abmarkungsgesetz'));

  it('wandelt den Abrufzeitstempel in ein Tagesdatum', () => {
    const reference = parsed().law.sourceReferences![0]!;
    expect(archivedSource().retrievedAt).toMatch(/T/u);
    expect(reference.retrievedAt).toBe('2026-09-17');
  });

  it('jede erzeugte Quellenreferenz ist nach legal-core gültig', () => {
    const references = parsed().law.sourceReferences ?? [];
    expect(references.length).toBeGreaterThan(0);
    for (const [index, reference] of references.entries()) {
      expect(() => parseSourceReference(reference, `sourceReferences[${index}]`)).not.toThrow();
    }
  });

  it('nimmt ein Tagesdatum unverändert an', () => {
    const doc = parseBayernRechtDocument(archivedSource({ retrievedAt: '2026-09-17' }), fixture('abmarkungsgesetz'));
    expect(doc.law.sourceReferences![0]!.retrievedAt).toBe('2026-09-17');
  });

  it('bricht bei einem Abrufzeitpunkt ab, der weder Zeitstempel noch Tagesdatum ist', () => {
    // Blindes Abschneiden auf zehn Zeichen machte daraus ein stilles Falschdatum.
    for (const bad of ['17.09.2026', '2026-09', 'gestern', '']) {
      expect(() => parseBayernRechtDocument(archivedSource({ retrievedAt: bad }), fixture('abmarkungsgesetz'))).toThrow(/Abrufzeitpunkt/u);
    }
  });
});

describe('Gliederungsnummer vor dem Titel', () => {
  // Die Quelle stellt Verwaltungsvorschriften ihre Gliederungsnummer voran – mal auf eigener Zeile
  // („3033.3-J“ vor „Aktenordnung für Justizverwaltungsangelegenheiten“), mal als Präfix derselben
  // Zeile („237-B Richtlinien für das Sonderförderprogramm …“). Bliebe sie stehen, hieße eine
  // Aktenordnung „3033.3-J“.
  it('entfernt eine Nummer, die allein auf der ersten Zeile steht', () => {
    const result = splitDivisionNumber(['3033.3-J', 'Aktenordnung für Justizverwaltungsangelegenheiten in Bayern']);
    expect(result.divisionNumber).toBe('3033.3-J');
    expect(result.lines[0]).toBe('Aktenordnung für Justizverwaltungsangelegenheiten in Bayern');
  });

  it('entfernt eine Nummer, die dem Titel vorangestellt ist', () => {
    const result = splitDivisionNumber(['237-B Richtlinien für das Sonderförderprogramm zur Sanierung kommunaler Schwimmbäder']);
    expect(result.divisionNumber).toBe('237-B');
    expect(result.lines[0]).toBe('Richtlinien für das Sonderförderprogramm zur Sanierung kommunaler Schwimmbäder');
  });

  it('kennt die belegten Schreibungen der Ressortkürzel', () => {
    for (const [number, rest] of [['2038.3.13-B', 'Konzept zur modularen Qualifizierung'], ['2230.1.1.1-WK', 'Archivierungsvereinbarung'], ['103-S', 'Redaktionsrichtlinien'], ['2230.7.1-K', 'Durchführung der Härteregelung']] as const) {
      expect(splitDivisionNumber([`${number} ${rest}`])).toEqual({ lines: [rest], divisionNumber: number });
    }
  });

  it('lässt einen Titel unangetastet, der keine Nummer trägt', () => {
    const lines = ['Verordnung über die Schifffahrt auf dem Bodensee', '(Bodensee-Schifffahrts-Ordnung – BSO)'];
    expect(splitDivisionNumber(lines)).toEqual({ lines });
  });

  it('verschluckt nicht die einzige Zeile', () => {
    // Ohne diese Grenze bliebe eine Norm, deren titelangaben nur die Nummer trägt, ohne Titel –
    // und der Parser bräche mit „nennt keinen Titel“ ab, statt die Nummer zu melden.
    expect(splitDivisionNumber(['3033.3-J'])).toEqual({ lines: ['3033.3-J'] });
  });

  it('hält eine Zahl ohne Ressortkürzel nicht für eine Gliederungsnummer', () => {
    expect(splitDivisionNumber(['2023 war ein besonderes Jahr'])).toEqual({ lines: ['2023 war ein besonderes Jahr'] });
    expect(splitDivisionNumber(['§ 3 Abs. 2 bleibt unberührt'])).toEqual({ lines: ['§ 3 Abs. 2 bleibt unberührt'] });
  });
});

describe('Weitere Dokumentklassen des Bestands', () => {
  // Zehn Dokumente brachen mit „unbekannter Normtyp @doktyp=bekanntmachung“ ab – von der Wappen- und
  // Flaggen-Bekanntmachung über das Begnadigungsrecht bis zur Biersteuer-Bekanntmachung von 1924.
  // Sie zu lesen heißt nicht, sie aufzunehmen: docs/LEGAL_SCOPE.md nimmt eine Bekanntmachung nur
  // auf, wenn sie Regelungsgehalt trägt.
  const withDocType = (type: string, title: string) =>
    fixture('abmarkungsgesetz')
      .replace('doktyp="gesetz"', `doktyp="${type}"`)
      .replace(/<titelangaben>[\s\S]*?<\/titelangaben>/u, `<titelangaben>${title}</titelangaben>`);

  it('liest eine Bekanntmachung und meldet sie zur Normativitätsprüfung', () => {
    const doc = parseBayernRechtDocument(archivedSource(), withDocType('bekanntmachung', 'Bekanntmachung über die Führung des Wappens des Freistaates Bayern'));
    expect(doc.law.type).toBe('bekanntmachung');
    const finding = doc.law.findings.find((entry) => entry.code === 'norm-type-out-of-model');
    expect(finding?.severity).toBe('warning');
    expect(finding?.message).toContain('LEGAL_SCOPE');
  });

  it('erkennt ein Verwaltungsabkommen am Titel, auch wenn der Normtyp „bekanntmachung“ lautet', () => {
    // Zwei Abkommen mit Baden-Württemberg führt das Portal als Bekanntmachung; der Titel sagt, was
    // sie sind.
    const doc = parseBayernRechtDocument(archivedSource(), withDocType('bekanntmachung', 'Verwaltungsabkommen zwischen dem Freistaat Bayern und dem Land Baden-Württemberg über die Verkehrsverwaltung'));
    expect(doc.law.type).toBe('verwaltungsabkommen');
    expect(doc.law.findings.some((entry) => entry.code === 'norm-type-refined')).toBe(true);
  });

  it('liest eine sonstige Norm ohne eigene Gliederungsstelle', () => {
    const doc = parseBayernRechtDocument(archivedSource(), withDocType('normsonst', 'Verordnung über die Schifffahrt auf dem Bodensee'));
    expect(doc.law.type).toBe('verordnung');
    expect(doc.law.findings.some((entry) => entry.code === 'norm-type-out-of-model')).toBe(true);
  });

  it('bricht bei einem wirklich unbekannten Normtyp weiterhin ab', () => {
    // Das Fail-closed bleibt: Eine Klasse, die niemand geprüft hat, wird nicht stillschweigend
    // eingeordnet.
    expect(() => parseBayernRechtDocument(archivedSource(), withDocType('phantasietyp', 'Irgendetwas'))).toThrow(/unbekannter Normtyp/u);
  });
});

describe('Fußnoten des Titelblocks', () => {
  // `<titelangaben>` trägt bei Staatsverträgen eine Fußnote mit der Ratifikationsliste aller Länder.
  // Sie ging verloren, weil nur die Zeilen des Blocks weitergereicht wurden – die
  // Textintegritätsprüfung meldete daraufhin bei 179 Dokumenten Textverlust.
  const withTitleFootnote = () =>
    fixture('abmarkungsgesetz').replace(
      /<titelangaben>[\s\S]*?<\/titelangaben>/u,
      '<titelangaben>ARD-Staatsvertrag<br /> (<amtlicheAbk>ARD-StV</amtlicheAbk>)<br />vom 31. August 1991<fn.call role="nichtamtlich"><fn.text /><fn.def><p>Der Staatsvertrag wurde ratifiziert in:</p><p>Baden-Württemberg: G v. 19.11.1991 (GBl. S. 745)</p></fn.def></fn.call></titelangaben>',
    );

  it('behält den Fußnotentext im Normkörper', () => {
    const doc = parseBayernRechtDocument(archivedSource(), withTitleFootnote());
    const body = JSON.stringify(doc.law.body);
    expect(body).toContain('Der Staatsvertrag wurde ratifiziert in');
    expect(body).toContain('Baden-Württemberg: G v. 19.11.1991 (GBl. S. 745)');
  });

  it('nimmt den Fußnoteninhalt nicht in den Titel', () => {
    const doc = parseBayernRechtDocument(archivedSource(), withTitleFootnote());
    expect(doc.law.title).toBe('ARD-Staatsvertrag');
    expect(doc.law.title).not.toContain('ratifiziert');
  });

  it('kommt ohne Fußnote im Titelblock aus', () => {
    const doc = parseBayernRechtDocument(archivedSource(), fixture('abmarkungsgesetz'));
    expect('titleFootnotes' in doc.head && doc.head.titleFootnotes).toEqual([]);
  });
});

describe('Tabelle im Fußnotentext', () => {
  // BayBSOF: Eine Fußnote in einer Tabellenzelle trägt selbst eine Tabelle. Das Zielmodell kennt im
  // Fußnotentext nur Text – vorher brach der Parser mit „Unbekanntes Element <table>“ ab.
  const withFootnoteTable = () =>
    fixture('abmarkungsgesetz').replace(
      '<fn.def><p>BayRS 219-1-F</p></fn.def>',
      '<fn.def><p>Bei Blinden tritt an die Stelle von Fachzeichnen:</p><table rules="none"><colgroup><col /><col /></colgroup><tbody><tr><td><p>Maschinenschreiben</p></td><td><p>1</p></td></tr><tr><td><p>Blindenpunktschrift</p></td><td><p>2</p></td></tr></tbody></table><p>Schluss</p></fn.def>',
    );

  it('übernimmt die Tabelle zeilenweise als Text, ohne Wortlaut zu verlieren oder Zeichen einzufügen', () => {
    const doc = parseBayernRechtDocument(archivedSource(), withFootnoteTable());
    const artikel3 = find(doc.law.body, (block) => block.label === 'Art. 3');
    const footnote = find([artikel3], (block) => block.type === 'footnote');
    expect(footnote.text).toMatch(/Fachzeichnen:\s*\n\s*Maschinenschreiben 1\s*\n\s*Blindenpunktschrift 2\s*\n\s*Schluss/u);
  });

  it('meldet die verlorene Spaltenform als Warnung, nicht als Fehler', () => {
    const doc = parseBayernRechtDocument(archivedSource(), withFootnoteTable());
    expect(doc.law.findings).toContainEqual(expect.objectContaining({ severity: 'warning', code: 'table-flattened-in-text' }));
    expect(doc.law.findings.filter((entry) => entry.severity === 'error')).toEqual([]);
  });
});

describe('Wortgrenzen und Vermerke: Befunde der Textintegrität im Vollkorpus', () => {
  // Jeder Fall stammt aus einem Dokument, das die Textintegritätsprüfung als `mismatch` meldete –
  // verklebte Wörter oder verlorene Vermerke, die kein Strukturtest gesehen hätte.
  const bodyText = (document: ReturnType<typeof parseBayernRechtDocument>): string => JSON.stringify(document.law.body);

  it('führt eine Hochstellung aus reinem Leerraum als Wortgrenze (BayVV_2030_2_3_G_15657: „In<sup> </sup>allen“)', () => {
    const document = parseBayernRechtDocument(source, fixture('redaktionsrichtlinien').replace('Diese Richtlinien sind', 'Diese Richtlinien<sup> </sup>sind'));
    expect(bodyText(document)).toContain('Diese Richtlinien sind');
    expect(bodyText(document)).not.toContain('Richtliniensind');
  });

  it('trennt Wörter an einem Fußnotenaufruf ohne Zeichen, ohne vor Satzzeichen Leerraum zu erfinden (BayVV_2246_K_737: „DM<fn.call>…</fn.call>nicht“)', () => {
    const xml = fixture('abmarkungsgesetz')
      .replace('Die Abmarkung wird von', 'Die Abmarkung<fn.call><fn.text /><fn.def><p>Hinweis A</p></fn.def></fn.call>wird von')
      .replace('Vermessungsbehörden vollzogen.', 'Vermessungsbehörden vollzogen<fn.call><fn.text /><fn.def><p>Hinweis B</p></fn.def></fn.call>.');
    const text = bodyText(parseBayernRechtDocument(source, xml));
    expect(text).toContain('Die Abmarkung wird von');
    expect(text).not.toContain('Abmarkungwird');
    expect(text).toContain('vollzogen.');
    expect(text).not.toContain('vollzogen .');
    expect(text).toContain('Hinweis A');
    expect(text).not.toContain('\\u0002');
  });

  it('liest <br/> im Anlagentitel als Wortgrenze (BayLAusstSiftE: „Stiftungsurkunde<br/>für …“)', () => {
    const xml = fixture('beihilfeverordnung').replace('<annex.titel>Sonderregelungen für Bedienstete mit dienstlichem Wohnsitz im Ausland</annex.titel>', '<annex.titel>Sonderregelungen<br /><span style="font-weight: normal">für Bedienstete mit dienstlichem Wohnsitz im Ausland</span></annex.titel>');
    const annex = find(parseBayernRechtDocument(source, xml).law.body, (block) => block.type === 'annex' && block.label === 'Anlage 6');
    expect(annex.title).toBe('Sonderregelungen für Bedienstete mit dienstlichem Wohnsitz im Ausland');
  });

  it('behält eine Fußnote an der Absatznummer (BayIntG Art. 12 Abs. 3: Nichtigkeitsvermerk)', () => {
    const xml = fixture('abmarkungsgesetz').replace('<absatz.nr>(1)</absatz.nr>', '<absatz.nr>(1)<fn.call role="nichtamtlich"><fn.text /><fn.def><p>Abs. 1 ist gemäß Entscheidung des Verfassungsgerichtshofs nichtig.</p></fn.def></fn.call></absatz.nr>');
    const document = parseBayernRechtDocument(source, xml);
    const subparagraph = find(document.law.body, (block) => block.type === 'subparagraph' && (block.children ?? []).some((child) => child.type === 'footnote' && (child.text ?? '').includes('nichtig')));
    expect(subparagraph.label).toBe('(1)');
  });

  it('behält eine Fußnote am Gliederungszeichen – in der Norm- und in der VV-DTD (BayKonk „Artikel 3“)', () => {
    const norm = fixture('beihilfeverordnung').replace('<gliederung.nr><p>I.</p></gliederung.nr>', '<gliederung.nr><p>I.<fn.call role="nichtamtlich"><fn.text /><fn.def><p>Vgl. den Notenwechsel vom 15. Dezember 2020.</p></fn.def></fn.call></p></gliederung.nr>');
    expect(bodyText(parseBayernRechtDocument(source, norm))).toContain('Vgl. den Notenwechsel vom 15. Dezember 2020.');
    const vv = fixture('redaktionsrichtlinien').replace('<p>1.</p>', '<p>1.<fn.call><fn.text /><fn.def><p>Vermerk zur Nummer 1</p></fn.def></fn.call></p>');
    expect(bodyText(parseBayernRechtDocument(source, vv))).toContain('Vermerk zur Nummer 1');
  });

  it('macht ohne <annex.nummer> nicht den ganzen Anlagenkörper zum Label (BayGLKrWO: Anlagenverzeichnis)', () => {
    const xml = fixture('beihilfeverordnung').replace('<annex.nummer>Anlage 6 Zu § 45 Abs. 4</annex.nummer><annex.nummer int="1">Anlage 6</annex.nummer>', '');
    const annex = find(parseBayernRechtDocument(source, xml).law.body, (block) => block.type === 'annex' && block.title === 'Sonderregelungen für Bedienstete mit dienstlichem Wohnsitz im Ausland');
    expect(annex.label ?? '').not.toContain('Sonderregelungen');
  });
});

describe('Titel über mehrere Zeilen von <titelangaben>', () => {
  // Belegt an 53 übernommenen Normen mit Befund `title-possibly-truncated`: echte Verkürzungen („Verordnung,“,
  // „Staatsvertrag“) neben harmlosen Folgezeilen (Abkürzung, Datum), die nie zum Titel gehören.
  it.each([
    [['Verordnung,', 'Ausführungsvorschriften zu dem Gesetz über die Aufhebung der Fideikommisse betreffend'], 'Verordnung, Ausführungsvorschriften zu dem Gesetz über die Aufhebung der Fideikommisse betreffend'],
    [['Staatsvertrag', 'zwischen', 'dem Freistaat Bayern und dem Land Rheinland-Pfalz', 'Vom 12. Mai 1970'], 'Staatsvertrag zwischen dem Freistaat Bayern und dem Land Rheinland-Pfalz'],
    [['Verordnung über den', 'Bau und Betrieb von Verkaufsstätten', '(Verkaufsstättenverordnung – VkV)'], 'Verordnung über den Bau und Betrieb von Verkaufsstätten'],
    [['Stiftungsurkunde', 'Seiner Majestät des Königs Ludwig von Bayern für Freiplätze'], 'Stiftungsurkunde Seiner Majestät des Königs Ludwig von Bayern für Freiplätze'],
    [['Bestattungsgesetz', '(BestG)'], 'Bestattungsgesetz'],
    [['Bayerische Biergartenverordnung', 'Vom 20. April 1999'], 'Bayerische Biergartenverordnung'],
    [['Schulberatung in Bayern', 'Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus'], 'Schulberatung in Bayern'],
  ])('%j → %s', (lines, expected) => {
    expect(continuedTitle(lines).title).toBe(expected);
  });

  it('entfernt Fußnotenzeichen am Titelende, nicht aber Ersatzmarken oder Text', () => {
    const footnotes = [{ type: 'footnote', label: '1)', text: 'a' }, { type: 'footnote', label: '2)', text: 'b' }, { type: 'footnote', label: 'Fn 3', text: 'c' }] as NormBodyBlock[];
    expect(stripTrailingMarkers('Reichsversicherungsordnung1)2)', footnotes)).toBe('Reichsversicherungsordnung');
    expect(stripTrailingMarkers('Bekanntmachung über Biersteuer1)', footnotes)).toBe('Bekanntmachung über Biersteuer');
    expect(stripTrailingMarkers('Gesetz über Nr. 1)', [])).toBe('Gesetz über Nr. 1)');
  });

  it('führt angefügte Titelzeilen nicht noch einmal als Überschrift im Körper', () => {
    const xml = fixture('abmarkungsgesetz').replace(/<titelangaben>[\s\S]*?<\/titelangaben>/u, '<titelangaben>Verordnung,<br />Ausführungsvorschriften zu dem Abmarkungsgesetz betreffend<br />Vom 6. August 1981</titelangaben>');
    const document = parseBayernRechtDocument(source, xml);
    expect(document.law.title).toBe('Verordnung, Ausführungsvorschriften zu dem Abmarkungsgesetz betreffend');
    const body = JSON.stringify(document.law.body);
    expect(body).not.toContain('Ausführungsvorschriften zu dem Abmarkungsgesetz betreffend');
    expect(body).toContain('Vom 6. August 1981');
  });
});
