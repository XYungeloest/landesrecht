/**
 * Auswahl des Beispielkorpus: 28 bewusst ausgesuchte Normen, nicht die ersten 28 der Enumeration.
 *
 * Jede Norm steht für einen Fall, den der Parser beherrschen muss – zwei DTDs, Tabellen, Anlagen,
 * Fußnoten, aufgehobene Vorschriften, verschachtelte Gliederungen, leere Pflichtfelder –, für einen
 * Zuschnitt des Bestands (Verfassung, Gesetz, Rechtsverordnung, Staatsvertrag, Verwaltungsvorschrift)
 * oder für einen Stichtagsfall (mit und ohne Änderung nach dem 1. Dezember 2023). Die Spannweite ist
 * absichtlich groß: von der Naturschutzgebietsverordnung mit wenigen Kilobyte bis zum Kostenverzeichnis
 * mit 3,2 MB und 39 Tabellen.
 *
 * `expectedCases` ist eine **Erwartung**, kein Befund. Was eine Norm wirklich enthält, stellt
 * `inspect.ts` am abgelegten Paket fest; weicht der Befund von der Erwartung ab, meldet der Lauf das
 * (`missingExpected`) und rundet es nicht weg. Die vier Normen, die schon die Quellen-Discovery
 * untersucht hat (`BayAbmG`, `BayVerf`, `BayKVzKG`, `BayVwV312180`), sind bewusst dabei: An ihnen sind
 * die dokumentierten Strukturbefunde nachprüfbar.
 */
import type { SourceArea } from '../common/constants.ts';
import type { NormType } from '../enumerate/portal.ts';
import type { StructureCase } from './inspect.ts';

export interface CorpusCandidate {
  documentId: string;
  sourceArea: SourceArea;
  /** Warum diese Norm im Korpus ist – der fachliche Grund, nicht die Beschreibung der Norm. */
  reason: string;
  /** Strukturfälle, die hier erwartet werden; am Paket nachgeprüft. */
  expectedCases: StructureCase[];
}

/**
 * Der Korpus. Reihenfolge: Verfassung, Gesetze, Verträge, Rechtsverordnungen, Verwaltungsvorschriften,
 * Vertreter der Abdeckungslücke.
 */
export const CORPUS: readonly CorpusCandidate[] = [
  {
    documentId: 'BayVerf',
    sourceArea: 'landesrecht',
    reason: 'Die Bayerische Verfassung – Pflichtstück des Korpus. Sie ist zugleich der schwierigste Strukturfall des Norm-Modells: mehrstufig verschachtelte Gliederung, eine Präambel außerhalb jeder Gliederung mit leerem <para.nr/>, neun aufgehobene Artikel (Art. 34 bis 42, Senat) als Platzhalter, eine Fußnote mit leerem <fn.text/> und ein leeres <amtlicheAbk/>.',
    expectedCases: ['dtd-byrecht-norm', 'gliederung-verschachtelt', 'vorschrift-ohne-gliederung', 'vorschrift-ohne-nummer', 'aufgehobene-vorschriften', 'fussnoten', 'leere-metadaten'],
  },
  {
    documentId: 'BayBO',
    sourceArea: 'landesrecht',
    reason: 'Sehr langes Gesetz mit tiefer Gliederung und dichtem Verweisnetz (Bauordnungsrecht); Änderung nach dem Stichtag.',
    expectedCases: ['dtd-byrecht-norm', 'gliederung-verschachtelt', 'verweise', 'aenderungsverlauf'],
  },
  {
    documentId: 'BayHO',
    sourceArea: 'landesrecht',
    reason: 'Langes Gesetz des Haushaltsrechts; zusammen mit VVBayHO das Paar aus Gesetz und zugehöriger Verwaltungsvorschrift – dieselbe Sache in beiden DTDs.',
    expectedCases: ['dtd-byrecht-norm', 'gliederung-verschachtelt', 'aenderungsverlauf'],
  },
  {
    documentId: 'BayGO',
    sourceArea: 'landesrecht',
    reason: 'Kommunalrecht, dichter Änderungsverlauf, jüngste Änderung deutlich nach dem Stichtag – der Fall, in dem der heutige Text gerade nicht der Stichtagstext ist.',
    expectedCases: ['dtd-byrecht-norm', 'aenderungsverlauf', 'verweise'],
  },
  {
    documentId: 'BayImSchG',
    sourceArea: 'landesrecht',
    reason: 'Mittelgroßes Fachgesetz jüngeren Datums (2019) mit Änderung nach dem Stichtag; Umweltrecht als weiteres Sachgebiet.',
    expectedCases: ['dtd-byrecht-norm', 'aenderungsverlauf'],
  },
  {
    documentId: 'BayDSG',
    sourceArea: 'landesrecht',
    reason: 'Kurzes Gesetz mit starkem Bezug auf EU-Recht: Verweisziele, die im konsolidierten Landesbestand nicht auflösbar sind (Zitiergraph mit offenen Enden).',
    expectedCases: ['dtd-byrecht-norm', 'verweise'],
  },
  {
    documentId: 'BayFTG',
    sourceArea: 'landesrecht',
    reason: 'Kurzes Gesetz, dessen letzte Änderung vor dem Stichtag liegt: Der heutige Text ist zugleich der Stichtagstext.',
    expectedCases: ['dtd-byrecht-norm', 'aenderungsverlauf'],
  },
  {
    documentId: 'BayRadG',
    sourceArea: 'landesrecht',
    reason: 'Sehr kurzes, junges Gesetz (2023) ohne jede Änderungsnotiz im Fortführungsnachweis – der einfachste denkbare Stichtagsfall und zugleich der Test, ob ein Gesetz ohne Änderungsverlauf sauber verarbeitet wird.',
    expectedCases: ['dtd-byrecht-norm'],
  },
  {
    documentId: 'BayAbmG',
    sourceArea: 'landesrecht',
    reason: 'Kurzes Gesetz mit Fußnoten unmittelbar an der Aufrufstelle (<fn.call> mit <fn.text> und <fn.def>) und präfigierter Fundstellenangabe („S=318“). Referenzinstanz der Quellen-Discovery.',
    expectedCases: ['dtd-byrecht-norm', 'fussnoten', 'verweise', 'aenderungsverlauf', 'satznummern'],
  },
  {
    documentId: 'BayAGGlueStV',
    sourceArea: 'landesrecht',
    reason: 'Ausführungsgesetz zu einem Staatsvertrag: das bayerische Gesetz, das einen Staatsvertrag in Landesrecht überführt – der Gegenpart zum Vertragstext selbst.',
    expectedCases: ['dtd-byrecht-norm', 'verweise'],
  },
  {
    documentId: 'MStV',
    sourceArea: 'landesrecht',
    reason: 'Umfangreicher Staatsvertrag aller Länder (Medienstaatsvertrag), Normtyp „Verträge, sonstige Rechtsquellen“; Änderung nach dem Stichtag.',
    expectedCases: ['dtd-byrecht-norm', 'gliederung-verschachtelt', 'aenderungsverlauf'],
  },
  {
    documentId: 'BayBwEgauquVertr',
    sourceArea: 'landesrecht',
    reason: 'Kleiner zweiseitiger Staatsvertrag von 1954, seither unverändert: die andere Seite der Vertragsskala und ein Text, dessen Stichtagsfassung die heutige ist.',
    expectedCases: ['dtd-byrecht-norm'],
  },
  {
    documentId: 'HZulStV',
    sourceArea: 'landesrecht',
    reason: 'Staatsvertrag mit förmlichen Anlagen (Hochschulzulassung) – prüft, ob Anlagen auch außerhalb von Rechtsverordnungen vorkommen.',
    expectedCases: ['dtd-byrecht-norm'],
  },
  {
    documentId: 'BayKVzKG',
    sourceArea: 'landesrecht',
    reason: 'Der Extremfall des Bestands: 3,2 MB XML, 39 Tabellen mit über 4.000 Zeilen, strukturierte Anlagen (<annex>), aufgehobene Tarifstellen und 21 PDF-Beilagen, die aus dem XML nicht referenziert sind. Referenzinstanz der Quellen-Discovery.',
    expectedCases: ['dtd-byrecht-norm', 'tabellen', 'anlagen-strukturiert', 'anlagen-pdf', 'aufgehobene-vorschriften'],
  },
  {
    documentId: 'BayBhV',
    sourceArea: 'landesrecht',
    reason: 'Umfangreiche Rechtsverordnung mit Anlagen und Tabellen (Beihilferecht); Änderung nach dem Stichtag.',
    expectedCases: ['dtd-byrecht-norm', 'anlagen-strukturiert', 'aenderungsverlauf'],
  },
  {
    documentId: 'BayVSO',
    sourceArea: 'landesrecht',
    reason: 'Schulordnung: lange Rechtsverordnung mit Anlagen (Zeugnismuster, Stundentafeln) und Änderung nach dem Stichtag.',
    expectedCases: ['dtd-byrecht-norm', 'aenderungsverlauf'],
  },
  {
    documentId: 'BayGUW_GebO',
    sourceArea: 'landesrecht',
    reason: 'Gebührenverordnung: Tabellenwerk in kleinerem Maßstab als BayKVzKG – prüft die Tabellenerkennung außerhalb des Extremfalls.',
    expectedCases: ['dtd-byrecht-norm', 'tabellen'],
  },
  {
    documentId: 'BayBoFiV',
    sourceArea: 'landesrecht',
    reason: 'Rechtsverordnung mit grenzüberschreitendem Bezug (Bodenseefischerei) und Anlagen; Änderung nach dem Stichtag.',
    expectedCases: ['dtd-byrecht-norm', 'aenderungsverlauf'],
  },
  {
    documentId: 'BayNatSchWachtV',
    sourceArea: 'landesrecht',
    reason: 'Kurze Rechtsverordnung von 1975, mehrfach geändert, zuletzt vor dem Stichtag – ein Stichtagsfall mit Änderungsverlauf, aber ohne Änderung nach dem Stichtag.',
    expectedCases: ['dtd-byrecht-norm', 'aenderungsverlauf'],
  },
  {
    documentId: 'BAY_791_3_150_U',
    sourceArea: 'landesrecht',
    reason: 'Naturschutzgebietsverordnung „Ammergebirge“: kurzer Normtext mit synthetischer Kennung (BAY_<gliederung>) statt sprechender Kurzbezeichnung – und der einzige Beleg des Korpus für eine **Bildbeilage**: Das Paket enthält die Gebietskarte als 19-MB-JPEG unter img/. Die Quellen-Discovery hatte Bilddateien nur aus der Portalhilfe gekannt und in keinem Export gefunden.',
    expectedCases: ['dtd-byrecht-norm', 'bildbeilagen'],
  },
  {
    documentId: 'BayBauPAV',
    sourceArea: 'landesrecht',
    reason: 'Technische Rechtsverordnung mit Verweisen auf Bundes- und EU-Recht sowie auf technische Regelwerke.',
    expectedCases: ['dtd-byrecht-norm', 'verweise'],
  },
  {
    documentId: 'BayVwV312180',
    sourceArea: 'vwv',
    reason: 'Verwaltungsvorschrift in der zweiten DTD (byrecht-vv): eigene Metadatenwelt, Gliederung mit Attribut inkraft, Satzzählung als <sup>, zwei PDF-Anhänge ohne Bezug im XML, kein builddate. Referenzinstanz der Quellen-Discovery.',
    expectedCases: ['dtd-byrecht-vv', 'anlagen-pdf', 'tabellen', 'satznummern-hochgestellt', 'kein-builddate'],
  },
  {
    documentId: 'VVBayHO',
    sourceArea: 'vwv',
    reason: 'Sehr umfangreiche Verwaltungsvorschrift (Verwaltungsvorschriften zur Bayerischen Haushaltsordnung, 2 MB XML und 78 PDF-Beilagen) mit Änderung nach dem Stichtag – die lange Seite der VV-Skala und der Partner zu BayHO. Zugleich ein Gegenbeispiel zur Annahme „Normtyp vv ⇒ DTD byrecht-vv“: Das Portal führt die Vorschrift als Verwaltungsvorschrift, liefert sie aber im Norm-Modell aus.',
    expectedCases: ['dtd-byrecht-norm', 'tabellen', 'anlagen-pdf', 'aenderungsverlauf'],
  },
  {
    documentId: 'BayVV_631_J_10511',
    sourceArea: 'vwv',
    reason: 'Verwaltungsvorschrift mit Kennung des neuen Schemas (BayVV_<gliederung>_<ressort>_<nr>), zuletzt vor dem Stichtag geändert.',
    expectedCases: ['dtd-byrecht-vv', 'kein-builddate'],
  },
  {
    documentId: 'BayVwV267724',
    sourceArea: 'vwv',
    reason: 'Verwaltungsvorschrift mit Kennung des alten Schemas (BayVwV<nr>) und ohne Änderungsnotiz im Fortführungsnachweis – beide Kennungsschemata müssen gleichermaßen verarbeitet werden.',
    expectedCases: ['dtd-byrecht-vv', 'kein-builddate'],
  },
  {
    documentId: 'BayVV_2132_3_B_15282',
    sourceArea: 'vwv',
    reason: 'Technische Baubestimmungen als Verwaltungsvorschrift: umfangreiches Anhangswerk, das im Paket nur als PDF liegt – der Fall, in dem der XML-Export den Inhalt gerade nicht strukturiert liefert.',
    expectedCases: ['dtd-byrecht-vv', 'kein-builddate'],
  },
  {
    documentId: 'TV_L',
    sourceArea: 'landesrecht',
    reason: 'Vertreter der Abdeckungslücke: Das Portal führt den Tarifvertrag für den öffentlichen Dienst der Länder als Vorschrift, der Fortführungsnachweis kennt ihn nicht. Zeigt, wie ein Dokument ohne BayRS-Gliederungsnummer im Export aussieht.',
    expectedCases: ['dtd-byrecht-norm'],
  },
  {
    documentId: 'BayVV_631_B_15643',
    sourceArea: 'vwv',
    reason: 'Vertreter der ungeklärten Abdeckungslücke: Richtlinien für die Durchführung von Hochbauaufgaben (RLBau). Die Dokumentseite nennt eine BayMBl.-Fundstelle, der Fortführungsnachweis führt die Vorschrift dennoch nicht.',
    expectedCases: ['dtd-byrecht-vv', 'kein-builddate'],
  },
];

/** Anforderung an den Korpus als Ganzes; jede ist nach dem Abruf am Befund messbar. */
export interface CoverageRequirement {
  id: string;
  description: string;
  minimum: number;
}

export const COVERAGE_REQUIREMENTS: readonly CoverageRequirement[] = [
  { id: 'umfang', description: 'Normen im Korpus (Auftrag: 25 bis 30)', minimum: 25 },
  { id: 'verfassung', description: 'Bayerische Verfassung', minimum: 1 },
  { id: 'normtyp-ges', description: 'Gesetze', minimum: 4 },
  { id: 'normtyp-rv', description: 'Rechtsverordnungen', minimum: 3 },
  { id: 'normtyp-vv', description: 'Verwaltungsvorschriften (zweite DTD byrecht-vv)', minimum: 3 },
  { id: 'normtyp-vertr', description: 'Staatsvertrag oder Zustimmungs-/Ausführungsgesetz zu einem Staatsvertrag', minimum: 1 },
  { id: 'fall-tabellen', description: 'Normen mit Tabellen', minimum: 1 },
  { id: 'fall-anlagen', description: 'Normen mit strukturierten Anlagen (<annex>)', minimum: 1 },
  { id: 'fall-fussnoten', description: 'Normen mit Fußnoten', minimum: 1 },
  { id: 'fall-aufgehoben', description: 'Normen mit aufgehobenen Vorschriften als Platzhalter', minimum: 1 },
  { id: 'fall-anlagen-pdf', description: 'Pakete mit PDF-Beilagen (aus dem XML nicht referenziert)', minimum: 1 },
  { id: 'fall-bildbeilagen', description: 'Pakete mit Bildbeilagen', minimum: 1 },
  { id: 'fall-dtd-norm', description: 'Pakete der DTD byrecht-norm', minimum: 1 },
  { id: 'fall-dtd-vv', description: 'Pakete der DTD byrecht-vv', minimum: 3 },
  { id: 'stichtag-geaendert', description: 'Normen mit Änderungseintrag nach dem Stichtag', minimum: 2 },
  { id: 'stichtag-unveraendert', description: 'Normen ohne Änderung seit dem Stichtag (heutiger Text = Stichtagstext)', minimum: 2 },
];

/** Obergrenze des Auftrags; mehr Normen wären kein Beispielkorpus mehr. */
export const CORPUS_MAXIMUM = 30;

export function corpusDocumentIds(): string[] {
  return CORPUS.map((candidate) => candidate.documentId);
}

/** Doppelte Kennungen im Korpus wären ein Fehler der Auswahl, kein Quellbefund. */
export function duplicateCorpusIds(): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const candidate of CORPUS) {
    if (seen.has(candidate.documentId)) duplicates.add(candidate.documentId);
    seen.add(candidate.documentId);
  }
  return [...duplicates].sort();
}

/** Messgrößen eines fertigen Korpuseintrags, soweit die Abdeckungsprüfung sie braucht. */
export interface CoverageInput {
  documentId: string;
  normType: NormType | 'unbekannt';
  cases: readonly StructureCase[];
  changedAfterBaseline?: boolean;
}

export function checkCoverage(entries: readonly CoverageInput[]): Array<CoverageRequirement & { actual: number; ok: boolean }> {
  const withCase = (value: StructureCase): number => entries.filter((entry) => entry.cases.includes(value)).length;
  const actuals: Record<string, number> = {
    umfang: entries.length,
    verfassung: entries.filter((entry) => entry.documentId === 'BayVerf').length,
    'normtyp-ges': entries.filter((entry) => entry.normType === 'ges').length,
    'normtyp-rv': entries.filter((entry) => entry.normType === 'rv').length,
    'normtyp-vv': entries.filter((entry) => entry.normType === 'vv').length,
    'normtyp-vertr': entries.filter((entry) => entry.normType === 'vertr').length,
    'fall-tabellen': withCase('tabellen'),
    'fall-anlagen': withCase('anlagen-strukturiert'),
    'fall-fussnoten': withCase('fussnoten'),
    'fall-aufgehoben': withCase('aufgehobene-vorschriften'),
    'fall-anlagen-pdf': withCase('anlagen-pdf'),
    'fall-bildbeilagen': withCase('bildbeilagen'),
    'fall-dtd-norm': withCase('dtd-byrecht-norm'),
    'fall-dtd-vv': withCase('dtd-byrecht-vv'),
    'stichtag-geaendert': entries.filter((entry) => entry.changedAfterBaseline === true).length,
    'stichtag-unveraendert': entries.filter((entry) => entry.changedAfterBaseline === false).length,
  };
  return COVERAGE_REQUIREMENTS.map((requirement) => {
    const actual = actuals[requirement.id] ?? 0;
    return { ...requirement, actual, ok: actual >= requirement.minimum };
  });
}
