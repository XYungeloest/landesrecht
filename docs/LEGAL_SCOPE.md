# Rechtsbestand des Portals (Legal Scope)

Verbindliche Regel für alle vier Länder (West, NSH, Ost, BayWü) und alle Importer. Der Importer setzt
sie technisch um (Normativitätsfilter, Review-Queue); im Zweifel gilt dieses Dokument.

## Grundsatz

Das Portal enthält den **möglichst vollständigen landesweiten Rechtsbestand** jedes Landes zum
Ausgangsrechtsstand (`SIMULATION_BASELINE_DATE`, 1. Dezember 2023) – nicht nur Gesetze und
Rechtsverordnungen, sondern auch die landesweit geltenden Verwaltungsvorschriften. Vorbild ist
OstRecht (`../staatsregierung`), das Verwaltungsvorschriften bereits als Teil des Landesrechts führt.

## Aufzunehmen

| Art | Kanonischer Typ (`NORM_TYPES`) |
| --- | --- |
| Landesverfassung | `verfassung` |
| Gesetze | `gesetz` |
| Rechtsverordnungen | `verordnung` |
| Staatsverträge und Zustimmungsgesetze (siehe unten) | `zustimmungsgesetz`, `staatsvertrag` |
| Landesweit geltende Verwaltungsvorschriften | `verwaltungsvorschrift` |
| Allgemeine Verwaltungsvorschriften (zu einem Gesetz) | `allgemeine-verwaltungsvorschrift` |
| Runderlasse mit allgemeiner Wirkung | `runderlass` |
| Normative Richtlinien, Förderrichtlinien, Vergabe- und Beurteilungsrichtlinien | `richtlinie`, `foerderrichtlinie` |
| Durchführungserlasse | `durchfuehrungserlass` |
| Anlagen und Tabellen einer aufgenommenen Vorschrift | Bestandteil der Vorschrift (`annex`, `table`) |
| Sonstige abstrakt-generelle, landesweit geltende Regelungen | passender Typ, sonst `verwaltungsvorschrift` |

Kriterien für die Aufnahme: abstrakt-generell (unbestimmter Adressatenkreis oder alle Behörden eines
Bereichs), landesweit, verbindlich (Außenwirkung oder Bindung der Verwaltung), amtlich veröffentlicht.

## Nicht aufzunehmen

- Einzelfallentscheidungen: Genehmigungen, Plangenehmigungen, Planfeststellungen, Verleihungen,
  Anerkennungen (z. B. als Erholungsort), Zulassungen einzelner Stellen.
- Personalnachrichten, Ernennungen, Stellenanzeigen, Ausschreibungen.
- Reine Tatsachenbekanntmachungen: Sitzungen, Tagesordnungen, Wahlergebnisse, Termine.
- Presse- und Informationsmitteilungen.
- Kommunales Ortsrecht und autonome Satzungen von Körperschaften (Kammern, Landschaftsverbände,
  Versorgungswerke, Hochschulen).
- Interne Einzelweisungen ohne allgemeine Wirkung.
- Gerichtsentscheidungen.
- Verkündungs- und Ministerialblätter als bloße Sammlung; Berichtigungen als eigenes Dokument (sie
  werden an der berichtigten Vorschrift berücksichtigt).

## Grenzfälle

Die Entscheidung lautet `include`, `exclude` oder `review`. Ausschlussgründe gehen vor, danach
Prüffälle; aufgenommen wird nur bei eindeutigem Vorschriftencharakter. **Zweifelhafte Dokumente werden
nie automatisch zu Landesrecht erklärt** – sie landen in der Review-Queue (`normativity`).

Prüffälle sind insbesondere: Hinweise, Empfehlungen, Merkblätter, Leitfäden, Muster und Vordrucke,
Kopferlasse (Regelungsgehalt im bekanntgemachten Dokument), Preis- und Ehrungsregelungen,
Bekanntmachungen ohne erkennbaren Regelungsgehalt, Vorschriften, deren Text nur als PDF-Anlage vorliegt.

Ein Ausschluss allein nach dem Titel (ohne Seitenabruf) ist nur bei eindeutigem Grund zulässig
(z. B. „Stellenausschreibung“, „Feststellung eines Nachfolgers“); jeder andere Titel wird abgerufen und
auf der Seite entschieden.

## Dokumentidentität

Gesetzgebungsmaterialien (Gesetzentwürfe, Begründungen, Beschlussempfehlungen, Ausschussberichte,
Drucksachen) sind nie Landesrecht. Liefert eine Portalseite statt der Vorschrift ein solches Dokument
oder ein ganz anderes Dokument, ist das ein Review-Fall `document-identity` (Status `mismatch`, nie
übernommen). Ein bloßer Verweis auf eine Drucksache oder das Wort „Begründung“ als Rechtsbegriff reicht
dafür nicht; entscheidend sind Materialienstruktur ohne Erlass- oder Eingangsformel und
Titelwiderspruch (`common/document-sanity.ts`).

## Text nur als PDF

- Liegt der Regelungsgehalt ausschließlich in PDF-Anlagen (Kopf- oder Bekanntgabeerlass mit
  „als Anlage beigefügt/bekannt gegeben“, „wird nicht abgedruckt“), wird die Vorschrift nicht als
  vollständige Norm übernommen: Review `attachment` (`attachment-pdf-only-essential`), die PDFs werden
  archiviert. Beispiel: VV zur LHO.
- Übernommen wird eine solche Vorschrift erst mit einer geprüften strukturierten Transkription
  (`data/imports/recht-nrw/transcriptions/`, Quellreferenz `structured-transcription` mit SHA-256 der PDF).
  Ungeprüfte Texterkennung (OCR) ist nie Grundlage einer Fassung.
- PDF-Anlagen einer im HTML vollständigen Vorschrift (Muster, Vordrucke, Übersichten) werden archiviert
  und als Quelle registriert; die Norm wird mit Hinweis übernommen (`annex-pdf-only`).
- Einzelheiten: `docs/RECHT_NRW_BULK_READINESS.md`, Abschnitt „PDF-only-Policy“.

## Zeitlicher Umfang

- Aufgenommen wird nur, was **am Stichtag nachweislich galt** (Belegpflicht, siehe
  `docs/RECHT_NRW_LRMB_IMPORT.md` für Verwaltungsvorschriften). Fehlende Belege führen zu Review, nicht
  zu einer Annahme.
- Übernommen wird genau die Stichtagsfassung als `versions/2023-12-01.json`. Die reale Historie
  (Fassungen, Änderungen, Fundstellen) steht in Manifest, Quellenreferenzen, Rekonstruktionsdaten und
  Audit – nie als Simulationsfassung.
- **Nach dem Stichtag gilt Simulationsrecht:** Spätere reale Änderungen des Herkunftslandes werden nicht
  übernommen. Neue Fassungen entstehen ausschließlich durch die Simulation. Das gilt für alle vier Länder.

## Staatsverträge

Befund RECHT.NRW (Stand der Recherche, September 2026):

- Staatsverträge erscheinen im Bereich LRGV als Zustimmungsgesetz („Gesetz zum Staatsvertrag …“,
  Dokumentart `gesetz`, § 1 „Dem … Staatsvertrag wird zugestimmt“). Der Vertragstext ist häufig nur als
  PDF-Anlage beigefügt („Anlage 1a zum Staatsvertrag“).
- Bekanntmachungen über das Inkrafttreten stehen unter `lrgv/bekanntmachung`. Sie sind keine eigene
  Vorschrift, aber Beleg für das Inkrafttreten des Vertrags. Der Bulkimport registriert sie als Beleg
  (`data/imports/recht-nrw/evidence/lrgv/`, Rolle `evidence` in der Enumeration), nie als Norm.

Regel:

1. Das Zustimmungsgesetz wird als Gesetz übernommen. Den Typ `zustimmungsgesetz` erhält es nur bei zwei
   Belegen – Titel („Gesetz zu dem Staatsvertrag/Abkommen …“) **und** Zustimmungsformel („wird zugestimmt“)
   (`lrgv/treaty.ts`); mit nur einem Beleg bleibt es `gesetz` (Befund `consent-law-partial`). Der
   Typfilter „Gesetz“ schließt Zustimmungsgesetze ein.
2. Der Vertragstext gehört als Anlage zum Zustimmungsgesetz. Liegt er als HTML vor, wird er als Anlage
   übernommen; liegt er nur als PDF vor, wird er als Quelle registriert und als Review-Fall
   `attachment` geführt.
3. Ein eigener Normtyp `staatsvertrag` wird nur für Vertragstexte verwendet, die das Portal als
   eigenständiges Dokument veröffentlicht. Ein neuer Dokumenttyp ist dafür nicht nötig.
4. Die Transformation behandelt die Vertragsparteien als externe Bezeichnungen: andere Länder und der
   Bund werden nicht übergeleitet; nur die Bezeichnung des Herkunftslandes folgt den
   Überleitungsregeln (Review `institution-mapping`, wo das nicht eindeutig ist).

## Quellen je Land

| Land | Quelle | Bereiche |
| --- | --- | --- |
| West | RECHT.NRW | LRGV (Gesetze, Rechtsverordnungen) und LRMB (Verwaltungsvorschriften aus dem Ministerialblatt), gemeinsames Manifest |
| NSH | juris Schleswig-Holstein | Gesetze, Verordnungen und Verwaltungsvorschriften – **kein Bestand**, das konsolidierte Portal untersagt automatisierten Zugriff (`docs/SCHLESWIG_HOLSTEIN_ACCESS_CONSTRAINT.md`) |
| Ost | OstRecht | übernimmt den OstRecht-Bestand einschließlich Verwaltungsvorschriften |
| BayWü | BAYERN.RECHT | Gesetze, Verordnungen, Verträge und Verwaltungsvorschriften (Importer vorbereitet, 2 413 Dokumente enumeriert) |

## Offene Entscheidung: zwei Dokumentklassen in BAYERN.RECHT

Die BayWü-Enumeration führt 2 413 Dokumente. 70 davon gehören zwei Klassen an, für die die Regeln
oben keine eindeutige Antwort geben. **Diese Entscheidung ist redaktionell und steht aus** – die
Enumeration führt beide Klassen, der Parser liest sie, die Auswahl trifft das Review.

Die beiden Klassen sind unterschiedlich gut erkennbar, und das gehört zur Entscheidung dazu:

* **Tarifverträge** trägt das XML selbst als `@doktyp="tarifvertrag"`. Der Parser meldet jeden
  einzelnen mit `norm-type-out-of-model` (Warnung); keiner kann unbemerkt in den Bestand laufen.
* **Bundeseinheitliche Anordnungen** sind am Dokument **nicht** erkennbar – sie tragen denselben
  `@doktyp` wie jede andere Verwaltungsvorschrift. Erkannt werden sie allein bei der Enumeration, am
  Fehlen im Fortführungsnachweis und an der Bundesanzeiger-Fundstelle
  (`data/audits/bayernrecht/ENUMERATION_GAP.md`, Gruppe `bundeseinheitliche-anordnung`). Wer sie
  ausschließen will, muss das dort tun; ein Filter im Parser wäre wirkungslos.

### Tarifverträge (56 Dokumente)

Beispiele: „Tarifvertrag über die betriebliche Altersversorgung der Beschäftigten“, „TV-Fahrradleasing
Ärzte Bayern“, „Tarifvertrag über eine einmalige Corona-Sonderzahlung Ärzte“.

**Dafür:** Das Portal führt sie im Normtypfilter mit; sie binden den Freistaat als Arbeitgeber und
wirken auf eine große Zahl von Beschäftigten.

**Dagegen:** Es sind Vereinbarungen der Tarifvertragsparteien, keine Rechtsvorschriften des
Freistaats. Der Fortführungsnachweis – das amtliche Verzeichnis der Bayerischen Rechtssammlung –
führt sie **nicht**, und sie tragen deshalb keine BayRS-Gliederungsnummer. Genau darin besteht die
Abdeckungslücke von 56 Dokumenten.

**Empfehlung:** nicht aufnehmen. Die Quelle selbst zieht die Grenze, und sie deckt sich mit dem
Grundsatz oben, der autonome Satzungen und Vereinbarungen nicht führt.

### Bundeseinheitlich vereinbarte Anordnungen (14 Dokumente)

Beispiele: Geschäftsanweisung für Gerichtsvollzieher (GVGA), Gerichtsvollzieherordnung (GVO),
Einforderungs- und Beitreibungsanordnung, Dienst- und Sicherheitsvorschriften für den Strafvollzug
(DSVollz), Mitteilungen in Straf- und Zivilsachen (MiStra, MiZi), Rechtshilfeordnung (ZRHO).

**Dafür:** Sie gelten in Bayern und binden bayerische Behörden; inhaltlich sind es
Verwaltungsvorschriften.

**Dagegen:** Sie sind zwischen Bund und Ländern vereinbart und werden im **Bundesanzeiger** bekannt
gemacht, nicht im GVBl. oder BayMBl. Als Recht *eines* Simulationslandes geführt, entstünde der
Eindruck, Bayern-Württemberg habe sie allein gesetzt – und die drei übrigen Länder hätten sie nicht.
Im Zweifel wären sie in allen vier Ländern zu führen oder in keinem.

**Empfehlung:** nicht aufnehmen, aber als bewusste Auslassung dokumentieren statt stillschweigend
wegzulassen. Wenn die Simulation eine bundesweite Ebene abbildet, gehören sie dorthin
(`docs/FEDERAL_COMPATIBILITY.md`), nicht in den Landesbestand.

### Abbildungen in Normtexten

Kein Scope- sondern ein Modellproblem: Das Blockmodell in `legal-core` kennt keinen Bildblock. Der
BayWü-Parser überträgt Abbildungen deshalb nicht in den Normtext, legt die Datei mit SHA-256 als
Beilage ab und meldet `graphic-not-transferred`; eine Vorschrift, die nur eine Abbildung trägt, meldet
`provision-graphic-only` statt „leer“. Im 28-Normen-Korpus sind sieben Normen betroffen, darunter eine
Gebietskarte von 19 MB. Ein Bildblock wäre eine Schemaänderung und berührt den eingefrorenen
West-Bestand – also ein eigener, bewusster Schritt.

## Umsetzung

- Normativitätsfilter: `packages/importers/recht-nrw/src/lrmb/classify.ts` (Tests:
  `tests/unit/recht-nrw-lrmb.test.ts`).
- Review-Queue mit Kategorie `normativity`: `data/imports/recht-nrw/review/<bereich>/term-<id>.json`.
- Dokumentidentität: `packages/importers/recht-nrw/src/common/document-sanity.ts`; Textvollständigkeit und
  PDF: `common/pdf.ts`, `common/transcription.ts`; Zustimmungsgesetze: `lrgv/treaty.ts`.
- Such- und Seitenfilter: „Verwaltungsvorschrift“ umfasst alle Arten
  (`ADMINISTRATIVE_REGULATION_TYPES`, `expandNormTypeFilter`).
