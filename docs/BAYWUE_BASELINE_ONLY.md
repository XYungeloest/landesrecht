# Heute fehlende Stichtagsnormen (baseline-only) – BayWü

Stichtag **2023-12-01**. Kennzahlen und Review-Fälle des letzten Laufs: `data/audits/bayernrecht/BASELINE_ONLY.md`.

```
npm run import:bayernrecht:restore-baseline-only                       # Dry-run; holt fehlende Quellen im Budget in den Cache
npm run import:bayernrecht:restore-baseline-only -- --offline          # Dry-run, netzfrei aus dem Cache
npm run import:bayernrecht:restore-baseline-only -- --write --offline  # Rezepte, Normen, Manifest, Slug-Registry, Bericht
npm run import:bayernrecht:restore-baseline-only -- --only baymbl-2020-719 # Probelauf für eine Ausgangsverkündung
```

Code: `packages/importers/bayernrecht/src/baseline-only/` (`references.ts`, `identity.ts`, `platform.ts`, `base.ts`,
`html.ts`, `chain.ts`, `structured.ts`, `relative.ts`, `search.ts`, `positivliste.ts`, `analyze.ts`, `restore.ts`, `run.ts`,
`report.ts`, `recognize.ts`). Tests:
`tests/unit/bayernrecht-baseline-only.test.ts` mit echten, gekürzten Verkündungsseiten unter
`tests/fixtures/bayernrecht/verkuendung-*`.

## Stand Lauf 7 (2026-09-18)

438 Kandidaten; Ausgangsverkündung gefunden 141; **sicher wiederhergestellt 72 Kandidaten = 61 Normen** (Lauf 6: 51 = 44).
Neu: relatives Inkrafttreten (Abschnitt 5b), Umfangsentscheidungen nach `docs/LEGAL_SCOPE.md` (5c), Strukturbefehle vorwärts
(Abschnitt 5, `structured.ts`), Ausgangsverkündung ohne Fundstelle (Prüfung 4, `search.ts`), Formularanlagen, die der
Text selbst zu Mustern erklärt (Prüfung 7). Mit gefundener Ausgangsverkündung nicht wiederhergestellt: 69 Kandidaten,
davon 23 belegt entschieden (nicht aufzunehmen 21, Inkrafttreten nach dem Stichtag 2) und 46 offen – Anlagen mit
Regelungsgehalt 17, keine Inkrafttretensvorschrift 16 (dazu 1 mit zwei Regeln), Kette 6 (Berichtigungen 2, Änderung einer
PDF-Anlage, Zitierfehler im Änderungsbefehl, Befehlsblock ohne erkennbare Gliederung, Volltextsuche nicht belegbar),
Umfang 3 (Review), Tabellen 3.

## 1 Worum es geht

BAYERN.RECHT führt nur geltendes Recht. Eine Vorschrift, die am Stichtag galt und danach aufgehoben wurde, fehlt
im Portal – belegt ist sie nur durch den Aufhebungsbefehl im Ereignisregister (`events/ledger.ts`,
`isBaselineOnlyCandidate`). Diese Normen werden aus den amtlichen Verkündungen wiederhergestellt, **aber nur,
wenn jede Aussage amtlich belegt und offline wiederholbar ist**. Sonst bleibt der Fall Review mit dem genau
benannten fehlenden Glied (`candidates.json`, Feld `missing.code`). Kein erfundener Text, keine heuristische
Geltung. Ausfertigung ist nicht Textgeltung; verkündet ist nicht in Kraft.

## 2 Die Prüfungen

| # | Prüfung | Beleg | scheitert als |
| --- | --- | --- | --- |
| 1 | Identität | starke Registerzuordnung; das Zitat (Titel unmittelbar vor „vom <Ausfertigung>“) steht in der Aufhebungsverkündung, alle Fundorte mit derselben Fundstelle. Ein Register-Ereignis ohne Zitat (Ziel nur aus dem Titel der Veröffentlichung) übernimmt Ergebnis und Norm des Ereignisses derselben Veröffentlichung, dessen Zitat denselben Betreff trägt (`duplicateOf`) | `identity-not-strong`, `citation-not-located`, `citation-ambiguous` |
| 2 | Ende | Aufhebungs-/Außerkrafttretensbefehl hinter dem Zitat, im Einleitungssatz der Aufhebungsliste („Mit Ablauf des … treten außer Kraft: 1. …“) oder als Satzklammer („Mit Ablauf des 31. Juli 2025 tritt die … vom … (…) außer Kraft“, „Gleichzeitig tritt die … außer Kraft“); Wirksamwerden aus dem Datum des Befehls oder aus der Inkrafttretensvorschrift der aufhebenden Verkündung (`commencement.ts`) – relativ zur Veröffentlichung („am Tag nach ihrer Veröffentlichung“) nur, wenn der Seitenkopf der Verkündung dasselbe Veröffentlichungsdatum druckt wie das Ereignisregister (Abschnitt 5b) | `not-a-repeal` (die Verkündung ändert die Norm), `end-undetermined` |
| 3 | Stichtag | Ausfertigung ≤ Stichtag (schon vor Prüfung 2: eine danach ausgefertigte Norm galt am Stichtag nicht, wie immer sie endete), letzter Geltungstag ≥ Stichtag | `ended-before-baseline`, `enacted-after-baseline` |
| 4 | Fundstelle | Stammverkündung elektronisch amtlich (BayMBl. ab 2019; AllMBl., FMBl., JMBl., KWMBl. 2009–2018) oder GVBl.-Detailseite. Zitat ohne Fundstelle (Erlass 2009–2018): Suche in den Inhaltsübersichten der Amtsblätter ab dem Erlass bis Ende des Folgejahres (`search.ts`) – genau eine Zeile mit gleichem Erlassdatum und passendem Titel (Wortüberdeckung oder Abkürzung, nie nur die Erlassstelle); ein zitiertes Aktenzeichen muss auf der Seite stehen; der Weg steht im Rezept (`identity.foundBy`) | `base-unpublished` (nur Aktenzeichen, nie verkündet), `base-paper-only` (vor 2009, andere Blätter), `base-pdf-only` |
| 5 | Ausgangsseite | Seite unter der Fundstelle abgerufen; Ausfertigungsdatum im Kopf gleich; Titel passt (Wortüberdeckung ≥ 0,6 in einer Richtung, gleiche Abkürzung, Zitat nur mit Erlassstelle oder nur mit der Dokumentart – „tritt die Bekanntmachung vom 6. März 2013 (AllMBl. S. 181) außer Kraft“; eines der Zitate derselben Verkündung mit gleichem Datum und gleicher Fundstelle genügt) | `base-not-found`, `base-identity-mismatch` |
| 6 | Umfang | Erlassstelle Staatsregierung, Staatskanzlei, Staatsministerium; kein Prüffall nach `docs/LEGAL_SCOPE.md` (Muster, Vordrucke, Merkblätter, Dienstvereinbarungen …). Entschieden nur, wo `docs/LEGAL_SCOPE.md` eindeutig ist (Abschnitt 5c): Veröffentlichungshinweise zu Dokumenten der Rundfunkanstalten (Telemedienkonzepte, Hörfunkprogramme) sind nicht aufzunehmen; Zeugnismuster-Bekanntmachungen, die allen Schulen der Schulart die Muster vorschreiben, sind Vorschriften mit Musteranlagen | `scope-not-state-regulation`, `scope-publication-notice`, `scope-normativity-review` |
| 7 | Text | kein Bild; Umsetzung vollständig und in Reihenfolge (Abschnitt 4). Anlagen nur als Datei nur, wenn der HTML-Text die Vorschrift vollständig trägt: kein Kopf- oder Bekanntgabeerlass (Verweis auf den Regelungsgehalt in der Anlage, Körper unter 2 500 Zeichen) und jede Anlage nach ihrer Bezeichnung Vordruck, Muster, Antrag, Bescheinigung, Zeugnis, Verzeichnis, Stundentafel oder Übersicht (eine nur nummerierte Anlage – „Anlage 1“ – nach dem Anfang des Textlayers ihrer PDF, kein OCR). Erklärt der Text die Anlagen selbst zu Mustern („… sind nach den in der Anlage beigefügten Mustern … auszustellen“, „… werden die anliegenden Vordrucke … bekannt gemacht und verbindlich eingeführt“), sind alle Anlagen Formulare und die Längenschranke entfällt; ebenso, wenn jede Anlage ein Formular im engen Sinn ist (`docs/LEGAL_SCOPE.md` „Text nur als PDF“); die PDF wird mit SHA-256 archiviert und als Quelle genannt (Abschnitt 7) | `annex-pdf-only`, `text-image-in-body`, `text-structure-unsupported` |
| 8 | Beginn | eigene Inkrafttretensvorschrift mit **Kalenderdatum** (`commencementDate`), Gegenprobe mit `commencementStatements`; oder relativ zur Veröffentlichung („am Tag nach der Veröffentlichung“, „am ersten Tag des auf die Verkündung folgenden Monats“) mit dem Veröffentlichungsdatum, das die Verkündung selbst druckt und das Register bestätigt (Abschnitt 5b); nie Ausfertigung oder Verkündung selbst, nie „am Tag der Veröffentlichung“. Ein Quellfehler mit nur einer Lesart („tritt mit am 22. Juni 2023 in Kraft“) wird gelesen und belegt. Sätze werden je Block gebildet – eine Zwischenüberschrift ohne Punkt („Inkrafttreten, Außerkrafttreten“) verdeckt die Vorschrift nicht | `begin-no-commencement-clause`, `begin-not-calendar-date`, `begin-unreadable`, `begin-after-baseline` |
| 9 | Weitergeltung | bis 31.12.2015 erlassene veröffentlichte Verwaltungsvorschriften gelten nach Nr. 1 VwVWBek (AllMBl. 2016 S. 1555) nur mit Aufnahme in die Positivliste (Abschnitt 5a): Zeile mit gleichem Erlassdatum und gleicher Gliederungsnummer; ein Fassungsdatum nach dem Erlass belegt eine Änderung vor 2016 – die Gegenprobe (Prüfung 10) muss eine Änderung dieses Datums finden | `vwvwbek-not-listed` (galt am Stichtag nicht), `vwvwbek-amended-before-2016`, `vwvwbek-positivliste` (Liste nicht auswertbar oder mehrdeutig) |
| 10 | Kette | Gegenprobe im amtlichen Organ (Abschnitt 5), genannte Änderungen gefunden, Änderungen vor dem Stichtag angewandt, keine Berichtigung, kein früheres Ende | `chain-*`, `amendment-*` |
| 11 | Ende der Fassung | erste Änderung nach dem Stichtag begrenzt die Quellgeltung des Textes; Rückwirkung auf den Stichtag schließt aus | `amendment-retroactive` |
| 12 | Bestand | kein Eintrag des Bestands (außer `not-at-baseline`/`excluded`) mit derselben Verkündung oder demselben Titel – sonst widerspricht der Bestand dem „heute fehlt“ des Registers (belegt: EuMedBek, AllMBl. 2018 S. 962, als `BayVV_1132_S_086` im Bestand, Aufhebung erst zum 1. Oktober 2026) | `present-in-bestand` |

Die erste scheiternde Prüfung benennt das Glied. `pending` heißt nur: Die Quelle war in diesem Lauf nicht
erreichbar (offline oder Budget) – der nächste Lauf setzt fort.

## 3 Die Änderungsklausel ist kein Beleg „nie geändert“

Geprüft an den Redaktionsrichtlinien im Cache (`BayVwV312180`): Nr. 4.1 verlangt im Vollzitat „gegebenenfalls
die letzte Änderung oder die letzten maßgeblichen Änderungen“ – verbindlich aber nur für Gesetze, Verordnungen
und Satzungen (Nr. 1 Satz 1). Für veröffentlichte Verwaltungsvorschriften gilt Nr. 8: „empfohlen, sich … an den
Nrn. 2 bis 5 und 7 zu orientieren“. Ein Aufhebungsbefehl ohne Änderungszusatz ist deshalb nur ein Hinweis. Die
Kette wird unabhängig im amtlichen Organ gegengeprüft (Abschnitt 5); die Klausel muss zu ihr passen
(`chain-named-amendment-missing`).

Belegt ist außerdem ein Fehler des Registers, den die Identitätsprüfung auffängt: In Aufhebungslisten nimmt
`scanRepealList` das **letzte** Datum eines Glieds als Ausfertigung – bei „… vom 25. November 2004 (KWMBl. I S. 431),
die zuletzt durch Bekanntmachung vom 17. November 2020 (BayMBl. Nr. 698) geändert worden ist“ also das der
Änderung. `identity.ts#reanchor` erkennt die Änderungsklausel davor und setzt das Zitat auf die Norm zurück
(`registerDate` im Rezept hält die Abweichung fest).

## 4 Verkündungs-HTML → Blockmodell (`html.ts`)

- Quelle ist `article#documentbox` ohne den Anlagenblock (ältere Seiten schließen `div.text_html` vorzeitig).
- Segmente in Leserichtung: Absatz, Überschrift (`h3` mit `span.titlenr`/`span.titlecaption` → Gliederungszeichen und
  Überschrift), Listenglied (`dt`/`dd`, `span.nummerierung`, `span.olzhlr`), Tabelle, Unterschrift. Jeder Textknoten
  in genau einem Segment; ein unbekanntes Element oder ein Bild bricht ab.
- Kopf am Wortlaut erkannt (Gliederungsnummer, Titel, Erlassstelle, Datumszeile) – die Satzformen führen
  verschiedene Klassen, belegt ist sogar ein Titel mit der Klasse `Ausfertigungsdatum-Aktenzeichen`.
- Die dezimale Gliederung (`1.`, `1.1`, `1.1.1`) wird nur verschachtelt, wenn die Nummernfolge lückenlos aufgeht;
  sonst bleibt der Körper flach (gleicher Text). Nummerierte Überschriften werden `section`, nummerierte Absätze
  `item`. Aufzählungsstriche einer `ul` setzt die Seite per Stil (`–`, bei `…Punkt` `•`); sie sind Gliederungszeichen,
  kein Wortlaut.
- Tabellen nur mit schlüssigem Raster (`rowspan`/`colspan`), geprüft mit dem Schema von legal-core.
- **Textintegrität**: kanonischer Text (Kopf, Körper, Unterschrift) und Seitentext ohne Leerraum zeichengleich;
  ausgenommen nur die per Stil gesetzten Aufzählungszeichen. Normalisiert werden Entitäten, geschützte Leerzeichen,
  weiche Trennzeichen und `<sup>n</sup>` → `ⁿ` wie in `reconstruction/gazette.ts`.
- Kalibrierung: Umgesetzte Stammverkündungen unveränderter Verwaltungsvorschriften des Bestands stimmen mit dem
  Portaltext überein bis auf Portal-Zusätze (Label „Schlussformel“, Anlagenliste) und quellnahe Zeichen der
  Verkündung (`−` statt `–`, ausgeschriebene URL, Fußnotenzeichen an der Stelle der Verkündung).

## 5 Die Gegenprobe der Kette (`chain.ts`)

Die Gliederungsnummern einer Veröffentlichung genügen **nicht**: Sammeländerungen tragen oft nur die Nummer der
Hauptvorschrift. Belegt: BayMBl. 2022 Nr. 766 („Änderung haushaltsrechtlicher Verwaltungsvorschriften“) führt nur
`630-F`, ändert aber in einem eigenen Paragrafen auch die Rückforderungsrichtlinie (`6321-F`, BayMBl. 2021 Nr. 182).
Eine reine Gliederungssuche hätte die RZVR als unverändert wiederhergestellt. Deshalb drei Wege zwischen der
Verkündung der Norm und der Verkündung des Aufhebungsbefehls; jeder Treffer wird gelesen:

1. **BayMBl.-Volltextsuche** (ab 2019, `?query=`): Suchwörter sind Ausfertigungsdatum und Fundstelle
   (`25. Februar 2021 BayMBl. Nr. 182`, `12. Oktober 2018 AllMBl. S. 962`) – genau die Angaben, ohne die auch die
   Prüfung kein Zitat anerkennt. Die Suche verknüpft die Wörter mit UND (Phrasen in Anführungszeichen finden
   nichts). Das AllMBl. wird in Zitaten auch „AIIMBl.“ gesetzt (BayMBl. 2021 Nr. 19 und Nr. 649 zu AllMBl. 2017
   S. 332); für AllMBl.-Normen wird deshalb mit beiden Schreibweisen gesucht und die Treffer vereinigt. Findet die
   Suche eine zitierende Seite nicht, weil diese die Fundstelle ohne „S.“ setzt („(KWMBl. 129)“, BayMBl. 2023 Nr. 149),
   folgt eine zweite Suche in dieser Schreibweise; ihre neuen Treffer im Zeitraum werden gelesen (nur dann – belegte
   Suchen bleiben, wie sie sind). Die Zitaterkennung liest „(KWMBl. 129)“ als Fundstelle, wenn Blatt, Seite und
   Ausfertigungsdatum der Norm stimmen. Sie gilt nur als **belegt**, wenn sie jede bekannte zitierende BayMBl.-Seite findet (den
   Aufhebungsbefehl und jeden Treffer der Gliederungssuche); sonst `chain-fulltext-unverified`.
2. **BayMBl.-Gliederungssuche** (`?referencenumber=<nummer ohne Ressortzusatz>`) als Gegenkontrolle.
3. **Amtsblätter 2009–2018** (AllMBl., FMBl., JMBl., KWMBl.; ohne Volltextsuche): **jede** Veröffentlichung im
   Zeitraum aus den Inhaltsübersichten aller Ausgaben – höchstens 640 Ausgaben (`AMTSBLATT_ISSUE_CAP`, vorab aus
   den Jahrgangslisten gezählt) und 4 000 Veröffentlichungen (`AMTSBLATT_FULL_READ_CAP`) je Norm; die Seiten sind
   allen Normen gemeinsam. Ein Zeitraum ab Herbst 2015 hat 182 Ausgaben (1 285 Veröffentlichungen), ab 28. Dezember
   2010 466 Ausgaben (rund 3 100 Veröffentlichungen), ab 1. Juni 2010 500, ab 2009 mehr als 569 (Lauf 5: Grenze
   200/1 600; Lauf 6: angehoben, damit die Verwaltungsvorschriften seit 2009 prüfbar sind). Darüber bleibt die Kette `chain-amtsblatt-unsearchable` – die Gliederungsnummern allein schließen
   Sammeländerungen nicht aus.

Eine gelesene Seite ist Glied der Kette, wenn sie die Norm mit **Ausfertigungsdatum und Fundstelle** zitiert und ein
Befehl folgt (ändern, berichtigen, beenden). Jede Änderungsklausel („die zuletzt durch … geändert worden ist“) des
Aufhebungsbefehls **und jeder gefundenen Änderung** muss auf ein Glied der Kette zeigen
(`chain-named-amendment-missing`); „BayMBl. S. 285“ gilt dabei als Nummer 285 (das BayMBl. zählt seit 2019 nur
Nummern), wenn auch das Ausfertigungsdatum stimmt. Normen des GVBl. (Gesetze, Verordnungen) werden im GVBl. geändert; diese
Gegenprobe ist nicht umgesetzt (`chain-organ-unsearchable`).

Änderungen vor dem Stichtag werden vorwärts angewandt – nur mit Kalenderdatum des Inkrafttretens
(`commencementFor`), nur Wortlautformeln (`parseCommand`; ältere Befehle mit „die Worte“ werden wie „die Wörter“
gelesen, der zitierte Wortlaut bleibt unberührt), jeder Ort aufgelöst (`resolvePath`), jeder zu ändernde
Wortlaut genau einmal im Bereich (`applyForward`) und mit Rundlauf (rückwärts ergibt sich exakt der Körper davor).
Seit Lauf 7 zusätzlich (`structured.ts`, exportiert für Agent R; Operationen `replace-blocks`, `replace-text`, `relabel`,
`insert-sentence`, `number-sentences` aus `reconstruction/structural.ts`, jede im Körper **vor** dem Befehl aufgelöst):

- **Gegliederte Neufassung und Einfügung**: „Nr. 1 wird wie folgt gefasst“ (Glied mit Untergliederung), „Die Nrn. 1.1
  bis 1.3 werden wie folgt gefasst“, „Nach Nr. 3 wird folgende Nr. 4 eingefügt“, „Der Nr. 1.4 werden folgende Nrn.
  1.4.3 und 1.4.4 angefügt“ – die neuen Glieder in der Gestalt der ersetzten bzw. benachbarten (Abschnitt oder Glied,
  Überschrift oder Text; tiefere Ebenen nach dem ersten dezimalen Unterglied), Text normalisiert wie im Umsetzer;
  Nummern lückenlos, sonst Befund. Eine schon vergebene Nummer nur, wenn ein späterer Befehl derselben Änderung das
  bisherige Glied umnummeriert („Die bisherige Nr. 2 wird Nr. 3.“ – gemeint ist das nicht eingefügte).
- **Überschrift**: „Die Überschrift wird wie folgt gefasst“; die Zeile „6.4 Antragsfrist“ gilt als Überschrift, wenn
  das Glied keine eigene hat, Unterglieder trägt und die Zeile kurz und ohne Satzende ist. Die **Überschrift der Norm
  selbst** („In der Überschrift wird die Angabe „2020“ durch die Angabe „2021“ ersetzt“ ohne Glied) ist Metadatum: Sie
  wird mit denselben Regeln geändert, im Rezept als `titleChanges` geführt und beim Nachspielen geprüft.
- **Sätze**: „Der (bisherige) Wortlaut wird (zu) Satz 1“ (auch „… und ihm wird die Angabe „1“ vorangestellt“ und mit
  folgendem Befehl), „Folgender Satz 2 wird angefügt“, „Satz 1 wird aufgehoben“ (die übrigen behalten ihre Nummern).
  „Satz N“ in einem Glied mit mehreren Textfeldern meint das eine Feld mit der Satznummer N – verwendet nur, wenn der
  Befehl ohne diese Eingrenzung vorwärts scheitert oder rückwärts nicht eindeutig ist.
- **Streichung**: „In Nr. 4.3 wird die Angabe „ , ANBest-K“ gestrichen“ (vorwärts eindeutig, rückwärts nicht) und „Der
  Satz „…“ wird gestrichen“ – bei einem Zitierfehler von genau einem Zeichen (ab 40 Zeichen, genau ein Satz) wird der
  Satz der Stammfassung gestrichen und die Abweichung belegt.
- **Befehlswortlaut**: „der Klammerzusatz“ ist eine Angabe; „In der Präambel in Satz 3“ ist ein Ort; „In Nr. 5.3 Satz 1
  und Satz 2“ – der zweite Ort erbt das Glied; „In Nrn. 1.17 bis 1.20“ ist die Aufzählung „Nrn. 1.17, 1.18, 1.19 und
  1.20“ (gleiches Präfix, höchstens 30 Glieder).
- **„Der Wortlaut wird Nr. 1.9.1.“**: Das Glied besteht aus seiner Zeile und genau einem unbezeichneten Absatz; der
  Absatz wird das Glied 1.9.1 (auch mit folgendem Befehl an ihm: „… und das Wort „Zivilprozessordnung“ wird …“).
- Weiterer Befehl hinter einer Umnummerierung („Die bisherige Nr. 7 wird Nr. 9 und die Angabe „2024“ wird …“) am Glied
  unter der neuen Nummer.

Davor schon zwei Strukturbefehle (`forwardStructural`), beide mit dem Wortlaut aus der Verkündung und demselben Rundlauf:

- **Neufassung** eines Textglieds **ohne Untergliederung** („Nr. 4.4 wird wie folgt gefasst: „…““) oder eines
  bezeichneten Satzes („Nr. 2 Satz 3 wird wie folgt gefasst“) – ersetzt genau den Text des Glieds bzw. Satzes. Hat
  das Glied Unterglieder, ist ein Bereich angegeben („Nrn. 3 bis 5“) oder fehlt der zitierte Wortlaut, bleibt es
  `amendment-formula-unsupported`. Belegt: KWMBl. 2016 S. 183 mit der Änderung KWMBl. 2017 S. 20 (Nr. 4.4).
- **Einfügung** eines gleichartigen Glieds mit freier Bezeichnung („Nach Nr. 3.2 wird folgende Nr. 3.3 eingefügt“) –
  nur wenn die neue Bezeichnung noch nicht vergeben ist; eine Einfügung mit Umnummerierung der folgenden Glieder
  wird nicht geraten.

Aufhebungen einzelner Glieder, Tabellen, Berichtigungen, Satzbefehle über mehrere Felder mit Umnummerierung und
zusammengesetzte Befehle („In Satz 2 wird die Satznummerierung und … gestrichen und … eingefügt“) werden nicht angewandt.

## 5a Positivliste der VwVWBek (`positivliste.ts`)

Das „Verzeichnis der ab 1. Januar 2016 fortgeltenden veröffentlichten Verwaltungsvorschriften“ (Anlage 1 zur
VwVWBek) liegt nur als PDF auf der Verkündungsplattform (`/fileadmin/Anlage_1_Positivliste_…pdf`, SHA-256 im
Rezept). Sein Textlayer wird mit `reconstruction/pdf.ts#pdfText` gelesen – kein OCR. Die Liste führt je Vorschrift
Gliederungsnummer, Ressort, Langtitel, Erlassdatum, **Fassungsdatum**, Anwendungsbeginn und -ende.

- **Vollständig zerlegt oder gar nicht:** Jedes Datum des Textlayers muss genau einer erkannten Zeile angehören
  (1 576 Zeilen). Nur dann ist „steht nicht in der Liste“ eine Aussage; sonst bleibt `vwvwbek-positivliste`.
- **Zuordnung:** gleiches Erlassdatum und gleiche Gliederungsnummer (ohne Ressortzusatz); mehrere Zeilen desselben
  Tages (Ferienordnungen) nur über den vollständigen Listentitel.
- **Nicht gelistet** → nach Nr. 1 VwVWBek mit Ablauf des 31. Dezember 2015 außer Kraft; die Aufhebung nach dem
  Stichtag bereinigt nur (`vwvwbek-not-listed`, `not-at-baseline`).
- **Fassungsdatum ≠ Erlassdatum** → vor 2016 geändert. Die Gegenprobe liest die Amtsblätter ab der Verkündung
  vollständig (Abschnitt 5); sie muss eine vor 2016 verkündete Änderung mit diesem Datum finden, sonst
  `vwvwbek-amended-before-2016` (`incomplete-chain`). Lauf 5 brach hier noch ohne Gegenprobe ab.
- **Fassungsdatum = Erlassdatum belegt keine Unverändertheit.** Geprüft: BayMBl. 2026 Nr. 294 nennt eine Änderung
  der KWMBl.-Bekanntmachung vom 2. Januar 2013 vom 14. Juli 2015 (KWMBl. S. 121), KWMBl. 2018 S. 347 eine Änderung
  der Bekanntmachung vom 13. April 2012 vom 10. Februar 2015 – beide stehen mit Fassungsdatum = Erlassdatum in der
  Liste. Die Gegenprobe (Abschnitt 5) beginnt deshalb immer mit der Verkündung der Norm; die Liste belegt nur die
  Fortgeltung ab 1. Januar 2016.
- Der **Anwendungsbeginn** der Liste ersetzt keine Inkrafttretensvorschrift (Prüfung 8); er wird nicht benutzt.

## 5b Relatives Inkrafttreten (`relative.ts`, Lauf 7)

Entscheidung des Koordinators: zulässig, wenn das Datum aus dem **amtlich gedruckten Veröffentlichungsdatum der
Verkündung selbst** eindeutig folgt und mit dem **Register** übereinstimmt – dieselbe Regel wie
`reconstruction/commencement.ts#datedCommencement` (Agent R). Das Veröffentlichungsdatum selbst ist nie das
Inkrafttreten.

| Verkündung | Datum der Verkündung selbst | Register |
| --- | --- | --- |
| BayMBl. | Seitenkopf „Veröffentlichung BayMBl. 2023 Nr. 295 vom 14.06.2023“ | Ereignisregister (ab 2. Dezember 2023), sonst die Zeile der Verkündung in der Gliederungssuche der Plattform |
| AllMBl., FMBl., JMBl., KWMBl. | Ausgabevermerk des PDF-Verweises „KWMBl. 2016/10 vom 13.09.2016“ (der Seitenkopf nennt dort das Erlassdatum) | Inhaltsübersicht der Ausgabe |
| GVBl. | Ausgabe „… vom 14.06.2024“ | Ereignisregister |

Gelesen werden „am Tag nach der/ihrer Veröffentlichung/Verkündung/Bekanntmachung/Bekanntgabe“ und „am ersten Tag des
auf die … folgenden (Kalender-)Monats“; „Veröffentlichung“ wird für `commencement.ts` nur in solchen Sätzen zu
„Verkündung“ angeglichen. Für Stammfassung (Beginn), Änderungen (Wirksamwerden) und Aufhebung (Ende) gleich; die
Belegzeile („Veröffentlichungsdatum … laut Verkündung selbst und …“) steht im Rezept.

## 5c Umfang: eindeutige Fälle nach `docs/LEGAL_SCOPE.md` (Lauf 7)

- **Nicht aufzunehmen** (`scope-publication-notice`, `out-of-scope`): Bekanntmachungen, deren eigener Text nur mitteilt,
  dass ein Dokument einer Rundfunkanstalt veröffentlicht wird oder wurde – „weist darauf hin, dass … veröffentlicht
  worden sind“, „… ist … veröffentlicht worden und kann unter … abgerufen werden“, „In der Anlage veröffentlicht das
  Staatsministerium gemäß § 11f Abs. 7 RStV … das Telemedienkonzept“, „Die … Landesrundfunkanstalten und das
  Deutschlandradio veröffentlichen gemäß § 11c Abs. 4 RStV … eine Auflistung der … Hörfunkprogramme“. Nur mit Titel
  „Telemedienkonzept(e)“ oder „Hörfunkprogramme“ und nur, wenn der Text so beginnt (Informationsmitteilung,
  Tatsachenbekanntmachung; das Dokument ist eines der Anstalt).
- **Aufzunehmen**: „…; hier: Zeugnismuster“, wenn der Text allen Schulen der Schulart vorschreibt, die Zeugnisse nach den
  beigefügten Mustern auszustellen – abstrakt-generell, landesweit, verbindlich; die Muster sind PDF-Anlagen einer im
  HTML vollständigen Vorschrift.
- **Bleibt Review**: Musterverträge (Musterkonzessionsvertrag Strom), Dienstvereinbarungen (kollektivrechtlich wie
  Tarifverträge – nicht eindeutig), Satzungen von Stiftungen und alles ohne diese Merkmale.

## 6 Rezept (`data/imports/bayernrecht/baseline-only/<id>.json`)

Offline deterministisch: Quellen mit URL, Fundstelle, Verkündungsdatum, Amtlichkeit und SHA-256 (Stammverkündung,
Änderungen, Aufhebung, Übersichtsseiten der Gegenprobe), Ausgangstext-Fingerabdruck (SHA-256 des normalisierten
Seitentexts), Fingerabdruck des Quellkörpers vor und nach jeder Änderung und am Stichtag, jede Änderung mit Formel,
Ort, aufgelöstem Bereich und Operation, Beginn und Ende mit Wortlaut der Vorschriften, Belegkette. **Alle
Fingerabdrücke gelten dem Quelltext vor der Überleitung**; eine Änderung der Überleitung (Schutzmuster, Eigennamen,
Bildblöcke) macht kein Rezept ungültig. Eine neue Version des Umsetzers (`CONVERTER_VERSION`) verlangt eine neue
Analyse.

## 7 Weg in den Bestand

Rezept → Nachspielen aus dem Cache (alle Prüfsummen und Fingerabdrücke) → `SourceLaw` → `transformToBayWue` →
`auditRecord` → `validateNormRecord` → `content/norms/baywue/<slug>/` (`bulk/persist.ts`), Manifesteintrag im Bereich
`events` mit `sourceIdentity` = Kennung der Ausgangsverkündung, `baselineRecoveryMethod: reconstructed-from-publications`,
Rohquellen Rolle `gazette` (Stammverkündung, Änderungen, Aufhebung – `r2-sync` archiviert sie), Slug-Reservierung.

- `sourceStatus`: `validity: reconstructed`, `text: direct` (unveränderte Stammfassung) bzw. `reconstructed`.
- Rohquellen: Stammverkündung, Änderungen und Aufhebung (Rolle `gazette`), bei Verwaltungsvorschriften bis 2015 die
  Positivliste der VwVWBek (Rolle `pdf`), Anlagen nur als Datei (Rolle `annex`; Quellreferenz `primary-pdf`,
  `sourceRole: visual-control`, Befund `annex-pdf-only` als Hinweis am Eintrag – wie im Bulk-Bestand). Beim erneuten Schreiben bleibt der Archivstand (`bucket`, `objectKey`,
  `archiveStatus`) jeder unveränderten Rohquelle erhalten – `r2-sync` muss sie nicht neu bereitstellen.
- Doppelerfassungen im Register (dieselbe Aufhebung als titelbasiertes und als zitiertes Ereignis) stehen beide in
  `baselineOnly.eventIds`; die Bestandsübersicht zählt die Norm damit nicht mehr als offen.
- Zeitmodell: `simulationValidFrom` = Stichtag; Quellgeltung = belegter Beginn (Inkrafttreten der Stammfassung bzw.
  der letzten angewandten Änderung) bis zum letzten Geltungstag (Aufhebung, eigene Befristung oder Tag vor der
  ersten Änderung nach dem Stichtag).
- Quellreferenzen `official-gazette` mit SHA-256; die amtliche PDF-Ausgabe wird mit der von der Plattform
  veröffentlichten Prüfsumme genannt, nicht geladen.
- Audit (`audit/audit.ts`): Eintrag ↔ Rezept (Kennung, Adresse, SHA-256, Rohquelle), eigene Zeile „baseline-only
  wiederhergestellt“; Abdeckung (`audit/coverage.ts`): eigene Zeile, die Erklärung der enumerierten Dokumente bleibt
  unberührt.

## 8 Netzdisziplin

Nur `createBayernRechtFetcher` (sequenziell, Mindestabstand, identifizierender User-Agent, Cache
`.cache/bayernrecht/`, 404 negativ gecacht), Abrufbudget `--max-requests` (Standard 400), Prüfpunkt
`.cache/bayernrecht/baseline-only-run.json`. Ein Wiederholungslauf mit `--offline` ist netzfrei.

## 9 Grenzen

- Ausgangsfassungen vor 2009 gibt es nur gedruckt; nicht verkündete Schreiben haben keine amtliche Fassung – beides
  bleibt `missing-base`.
- Verwaltungsvorschriften bis 2015, die vor 2016 geändert wurden (Fassungsdatum der Positivliste ≠ Erlassdatum),
  bleiben `vwvwbek-amended-before-2016`, wenn die Gegenprobe keine Änderung dieses Datums findet.
- Anlagen, die die Verkündung nur als Datei verlinkt, werden nicht als Text übernommen. Vordrucke und Übersichten
  einer sonst vollständigen Vorschrift werden als PDF archiviert und referenziert; Kopferlasse und Anlagen mit
  möglichem Regelungsgehalt bleiben `annex-pdf-only`.
- Die Amtsblätter 2009–2018 haben keine Volltextsuche; jede Veröffentlichung des Zeitraums wird gelesen. Seit Lauf 6
  liegen alle Veröffentlichungen ab Juni 2010 im Cache (rund 3 200; Lauf 6 brauchte dafür und für alles Übrige
  2 462 Abrufe); kein Kandidat bleibt mehr
  `chain-amtsblatt-unsearchable`. Die Volltextsuche des BayMBl. ist ein Dienst der Plattform; ihr Beleg ist die
  Gegenprobe gegen bekannte Zitate, keine Zusicherung des Betreibers.
- Die Gegenprobe ist so gut wie die Zitierweise der Quellen: BayMBl. 2023 Nr. 149 zitiert die KWMBl.-Bekanntmachung
  vom 7. Juni 2011 als „(KWMBl. 129)“ ohne „S.“ – Volltextsuche und Zitaterkennung finden die Änderung nicht. Dass
  sie existiert, belegt nur die Änderungsklausel des Aufhebungsbefehls; die Prüfung der genannten Änderungen
  (`chain-named-amendment-missing`) hält die Norm deshalb zurück.
- Neufassungen untergliederter Glieder und von Bereichen, Einfügungen mit Umnummerierung sowie Änderungen flach
  gegliederter Texte werden vorwärts nicht angewandt (Rückforderungsrichtlinie, BayMBl. 2022 Nr. 766;
  BayMBl. 2020 Nr. 119; BayMBl. 2023 Nr. 266; AllMBl. 2017 S. 3) – `amendment-formula-unsupported`.
