# Rückrechnung von Änderungen – BayWü (`reverse-amendment`, ein- und mehrstufig)

Stand 2026-09-18. Stichtag **2023-12-01**. Kennzahlen, Gruppen und alle offenen Fälle: `data/audits/bayernrecht/RECONSTRUCTION.md`
(vom Lauf erzeugt). Maschinenlesbar: Schlange `data/imports/bayernrecht/reconstruction-queue.json`, Rezepte
`data/imports/bayernrecht/reconstruction/<documentId>.json`, Quellenregister `data/imports/bayernrecht/reconstruction-sources.json`,
Audit `data/audits/bayernrecht/reconstruction-audit.json`, Abrufprüfpunkt `data/imports/bayernrecht/reconstruction-fetch.json`.

```
npm run import:bayernrecht:reconstruction-queue                          # Dry-run, nur Cache, schreibt nichts
npm run import:bayernrecht:reconstruction-queue -- --write               # Rezepte, Schlange, Register, Audit, baseline.json, Bericht
npm run import:bayernrecht:reconstruction-queue -- --only BayDVWoR       # Probelauf, schreibt nie
npm run import:bayernrecht:reconstruction-queue -- --fetch --max-requests 1500   # fehlende Verkündungen gezielt abrufen
npm run import:bayernrecht:reconstruction-queue -- --fetch --offline     # netzfrei: meldet nur, was fehlt
```

Code: `packages/importers/bayernrecht/src/reconstruction/` – `walk.ts` (Kette), `pages.ts` (Verkündungen aus dem Cache),
`pdf.ts` (Textlayer älterer Ausgaben), `acquire.ts` (gezielter Abruf), `steps.ts` (Rücknahme einer Änderung),
`structural.ts` (Satz-, Glied- und Nummernbefehle), `formulas.ts`, `location.ts`, `commencement.ts`, `chain.ts`, `structure.ts`,
`gazette.ts`, `apply.ts`, `recipe.ts`, `groups.ts`, `undetermined.ts`, `register.ts`, `audit.ts`, `report.ts`, `context.ts`, `run.ts`.
Tests: `tests/unit/bayernrecht-reconstruction.test.ts` und (Lauf 5, Gruppen 1–3) `tests/unit/bayernrecht-reconstruction-groups13.test.ts`
mit echten, gekürzten Verkündungsausschnitten und echtem Portaltext (`tests/fixtures/bayernrecht/verkuendung-*-excerpt.html`,
`portal-*-excerpt.json`, `gvbl-2006-09-textlayer-s189-190.json`, `gvbl-2017-11-textlayer-s283-301.json`).

---

## 1 Grundsatz

BAYERN.RECHT führt nur den heutigen Stand. Für 519 Normen gilt der heute gezeigte Text erst seit einem Tag nach dem Stichtag
(`changed-after-baseline`). Ihr Stichtagstext lässt sich manchmal aus dem heutigen Text und den amtlichen Änderungsbefehlen
**zurückrechnen**. Eine falsch zurückgerechnete Änderung erzeugt einen historischen Normtext, der echt aussieht und es nicht ist –
schlimmer als jede fehlende Norm. Deshalb:

> **Nur eine mit amtlichen Quellen vollständig nachvollziehbare, reproduzierbare Fassung zählt. Im Zweifel `reconstruction-required`
> mit benanntem Grund. Kein erfundener Text, kein Stichtagsversatz, keine heuristische Annahme historischer Geltung.**

Die Rückrechnung schreibt keine Normen nach `content/`; sie liefert Rezepte und Entscheidungen. Der Bulk wendet ein Rezept selbst
an (Abschnitt 11).

## 2 Ergebnis (Stand dieses Laufs)

| | vor Lauf 4 | nach Lauf 4 | nach Lauf 5 |
| --- | ---: | ---: | ---: |
| sicher zurückgerechnet | 13 (alle einstufig) | 33 (28 einstufig, 5 mehrstufig) | **44** (37 einstufig, 7 mehrstufig) |
| `reconstruction-required` | 506 | 486 | **475** |

Gruppenverteilung, Gründe und jede offene Norm: `data/audits/bayernrecht/RECONSTRUCTION.md`. Lauf 5 (die 72 offenen Fälle der
Gruppen 1–3, je Norm vorher/nachher): Abschnitt 17.

## 3 Die Kette – über amtliche Verweise (`walk.ts`)

Jede Änderung nennt in ihrem Einleitungssatz die vorangehende („…, die zuletzt durch § 2 des Gesetzes vom 9. Mai 2006 (GVBl. S. 190)
geändert worden ist, …“); das Vollzitat des Portals nennt die letzte. Der Gang beginnt beim Vollzitat (ohne Vollzitat beim
jüngsten Ereignis des Registers) und folgt diesen Verweisen rückwärts:

- Tritt die genannte Änderung – für den Abschnitt, der die Norm ändert – **nach dem Stichtag** in Kraft, wird sie zurückgenommen, und
  der Gang folgt ihrem eigenen Verweis. Das erfasst auch Änderungen, die **vor** dem Stichtag verkündet wurden und erst danach in
  Kraft traten; das Ereignisregister (nach Verkündung geordnet) kennt sie nicht.
- Tritt sie erst **nach dem Auswertungsstichtag** in Kraft, ist sie nicht Teil des heutigen Textes: übersprungen (`future`), der Gang
  folgt ihrem Verweis. Tritt sie teils davor, teils danach in Kraft → `chain-partially-in-force`.
- Tritt sie **am oder vor dem Stichtag** in Kraft, ist sie die letzte Änderung der Stichtagsfassung – ihr Inkrafttreten belegt den
  Beginn (Abschnitt 9). Teils vor, teils nach dem Stichtag → `chain-split-commencement`.
- Nennt die älteste zurückgenommene Änderung keine vorangehende, ist die Stichtagsfassung die **Stammfassung**.

Verweise werden genau gelesen: Abschnitte („§ 2 des Gesetzes“, „die §§ 1 und 2 der Verordnung“), „§ 1 dieses Gesetzes“ (zweiter
Abschnitt derselben Verkündung, „Weitere Änderung …“), mehrere Änderungen in einem Verweis („zuletzt durch A und durch B“ – alle werden
weitergeführt, die jüngste zuerst). Ein Abschnitt ohne lesbaren Befehlsblock kann nur noch Beleg des Beginns sein, nie zurückgenommen
werden (`chain-block-not-found`).

**Gegenproben**, jede notwendig:

1. Jedes stark zugeordnete Ereignis des Registers nach dem Stichtag ist ein Schritt der Kette (sonst `chain-ledger-unexplained` – etwa
   eine Normenkontrollentscheidung, eine Druckfehlerberichtigung).
2. Keine andere Verkündung nach dem Stichtag zitiert die Norm mit einem Änderungsbefehl (`chain-other-publication`).
3. Änderungsverlauf (Norm-DTD) und Fortführungsnachweis: Was nicht zurückgenommen wird, liegt vor dem Stichtag; die jüngste davon ist
   die, deren Inkrafttreten den Beginn belegt; bei der Stammfassung gibt es keine. Mindestens eine dieser drei Quellen (Vollzitat,
   Verlauf, Fortführungsnachweis) muss vorliegen (`chain-unverifiable`).
4. Die Inkrafttreten der zurückgenommenen Änderungen folgen der Reihenfolge der Kette (`chain-commencement-order`), liegen alle nach
   dem Stichtag, und das jüngste ist das `inkraft` des heutigen Pakets (`portal-in-force-mismatch`).
5. **Ein Schritt weiter zurück:** Die Vorgänger der letzten Änderung vor dem Stichtag dürfen nicht erst nach dem Stichtag in Kraft
   treten (`chain-delayed-predecessor`) – sonst enthielte die „Stichtagsfassung“ eine Änderung, die am Stichtag noch nicht galt. Ist
   der Vorgänger nicht auf der Plattform, steht das als Hinweis im Rezept.
6. **Lauf 5:** Ist die eigene Fundstelle der Norm (Metadaten oder Vollzitat mit ihrem Ausfertigungsdatum) ein Ereignis nach dem
   Stichtag, gab es die Norm am Stichtag nicht – `contradictory`/`norm-published-after-baseline` statt einer Kette (BayMBl. 2023
   Nr. 629 und 633).

Führt das Register für eine Verkündung mehrere Ereignisse derselben Norm (GVBl. 2024 S. 229: § 1 ändert die FGV, § 2 hebt eine in
sie übernommene Verordnung auf – beide der FGV zugeordnet), trägt der Änderungsschritt im Rezept das Änderungsereignis (`amend` vor
`correction`, `recast`, `new`, `commencement`, `notice`, `treaty`, `unknown`, `expire`, `repeal`), nicht das Aufhebungsereignis.

## 4 Quellen: gezielt, resumierbar, nur amtlich (`acquire.ts`, `pages.ts`, `pdf.ts`)

Der Bedarf entsteht nur aus dem Gang: Nennt ein Verweis eine Verkündung, deren Detailseite (`/gvbl/<Jahr>-<Seite>/`,
`/baymbl/<Jahr>-<Nr>/`) nicht im Cache liegt, ist das ein Bedarf. Der Jahrgang ist der des Ausfertigungsdatums; bei Ausfertigung im
Dezember kommt der Folgejahrgang in Betracht – geprüft wird **der Reihe nach**, erst wenn die erste Seite belegt nicht passt, wird die
nächste abgerufen. Welche Seite es ist, entscheidet allein die Identität: Die Seite trägt das Ausfertigungsdatum.

`reconstruction-queue --fetch` ruft in Runden ab (Gang berechnen → fehlende Seiten nacheinander abrufen → neu berechnen), über
`createBayernRechtFetcher` (sequenziell, Mindestabstand, identifizierender User-Agent, Cache mit Prüfsumme, Negativ-Cache für 404),
mit Abrufbudget (Standard 1 500). Der Prüfpunkt `reconstruction-fetch.json` hält jeden Versuch fest (Adresse, Status, SHA-256,
Normen, Runde); nichts wird doppelt abgerufen, ein Wiederholungslauf mit `--offline` braucht kein Netz. **Lauf 4: 373
Netzabrufe** (358 Seiten, Ausgabenverzeichnisse und PDF, 15 belegt nicht vorhanden); **Lauf 5: 28 weitere** (Prüfpunkt insgesamt
401).

**Ältere GVBl.-Jahrgänge** (vor 2016) führt die Plattform nicht als HTML (404). Dann: Ausgabenverzeichnis des Jahrgangs →
Ausgabe mit dem Seitenbereich → amtliches PDF; seine SHA-256 muss der von der Plattform veröffentlichten Prüfsumme entsprechen. Aus
dem **Textlayer** (kein OCR; `inspectPdf` des West-Adapters schließt Scans aus; Schriften nur mit bekannter Kodierung – MacRoman,
WinAnsi, Differences mit bekannten Glyphen; seit Lauf 5 auch ToUnicode-CMaps, zusammengesetzte Schriften `Type0`/`Identity-H` – jeder
Code muss abgebildet sein – und Objektströme) wird **nur** die Inkrafttretensvorschrift gelesen, nie ein Änderungsbefehl, und nur
unter strengen Grenzen ohne Layoutdeutung: Die Verkündung beginnt auf der genannten Seite und endet auf der ersten Seite mit einer
Unterschrift (höchstens 30 Seiten); jede Seite trägt ihre Seitenzahl und die Kopfzeile des GVBl.; auf diesen Seiten stehen genau ein
Titelzusatz („Vom 9. Mai 2006“ oder, in neueren Ausgaben, „300-12-6-J Verordnung zur Änderung … vom 30. Mai 2017“ mit Gliederungsnummer
davor) mit dem Ausfertigungsdatum auf der ersten Seite, genau eine Unterschrift „München, den …“ mit dem Ausfertigungsdatum und **genau
eine** Inkrafttretensregel mit Kalenderdatum. Dann enthalten die Seiten nichts von einer anderen Verkündung. Alles andere bleibt Review.
Ein Textlayer, der selbst aus einer Texterkennung stammt (GVBl. 1988: „BayerisclleS … Verordnul1gsblatt“), besteht die Kopfzeilenprüfung
nicht – OCR ist keine Rechtsquelle.

**BayBedV** (Bedürfnisgewerbeverordnung) ist so belegt: Vorangehende Änderung „§ 2 des Gesetzes vom 9. Mai 2006 (GVBl. S. 190)“ →
GVBl. 2006 Nr. 9 (S. 189–228), PDF `files/gvbl/2006/09/gvbl-2006-09.pdf`, SHA-256 `6570e49e…` = veröffentlichte Prüfsumme; S. 190 ist
die erste Inhaltsseite, Titelzusatz „Vom 9. Mai 2006“, Unterschrift „München, den 9. Mai 2006“, einzige Regel „Dieses Gesetz tritt
am 1. Juni 2006 in Kraft.“ → Beginn der Stichtagsfassung 2006-06-01. Der Vorgänger dieser Änderung (Verordnung vom 22. Juni 2004) ist
aus dem Textlayer nicht als Befehlsblock lesbar; das Rezept vermerkt das als Hinweis.

Jede statusentscheidende Quelle steht im **Quellenregister** (`reconstruction-sources.json`): Adresse, Fundstelle, Verkündungs- und
Ausfertigungsdatum, Amtlichkeit (GVBl. `printed-official`, BayMBl. `electronic-official`), SHA-256 (bei PDF auch veröffentlichte
Prüfsumme, Ausgabe, Seitenbereich, Verzeichnis), je Fall Rolle (`reversed-amendment`, `future-amendment`, `baseline-start`),
Abschnitt, Wortlaut der Inkrafttretensvorschrift und ob sie für ein Rezept entscheidend ist.

## 5 Die Verkündung lesen (`gazette.ts`, `structure.ts`)

Die Detailseite wird in Einheiten zerlegt (Absatz, Überschrift, Listen-, Tabellenglied mit Gliederungszeichen und Elementklasse).
Normalisiert werden genau: HTML-Entitäten, geschützte und schmale Leerzeichen, Leerraumfolgen, weiche Trennzeichen, `<sup>n</sup>` →
Unicode-Hochstellung, Fußnotenzeichen der Verkündung. Der Rundlauf selbst vergleicht ohne jede Normalisierung.

Der **Einleitungssatz** wird über das Zitat der Norm gefunden – zwei unabhängige Merkmale, eines davon Ausfertigungsdatum oder
BayRS-Nummer. Die Ortsangabe vor dem Normtitel wird immer mitgenommen, auch im Dativ und mit Artikel („Dem Art. 5 des …“, „Die
Anlage 1 der …“) – sonst würden die Befehle in der ganzen Norm statt im genannten Glied gesucht; nicht lesbar → `location-unreadable`.
Eine Verkündung darf dieselbe Norm in mehreren Abschnitten ändern („§ 1 Änderung …“, „§ 2 Weitere Änderung …“); welcher Block
gemeint ist, entscheidet der Abschnitt im Verweis. Ein Tabellenkopf vor einer zitierten Tabellenzeile gehört zum Zitat.

Seit Lauf 5 zusätzlich gelesen (je an einer echten Verkündung getestet): Teilangaben der Blätter („KWMBl. I S. 235“), Aktenzeichen
zwischen Datum und Fundstelle, die Kurzformen „…, zuletzt geändert durch … (…)“ und „…, die zuletzt durch … (…), wird …“ (ohne
„geändert worden ist“), das getrennte Verb „ge- ändert“; flache BayMBl.-Listen („1. Die Bekanntmachung … wird wie folgt geändert:“ –
„2. …“ auf derselben Ebene, BayMBl. 2024 Nr. 370); dezimal gegliederte Befehle unter „§ 1“ („2.“ – „2.1“, BayMBl. 2023 Nr. 647, das
Präfix wird geprüft); über mehrere Einheiten gesetzte Befehle („In Nr. 6 werden die Wörter“ – Zitat – „durch die Wörter“ – Zitat –
„ersetzt.“, BayMBl. 2024 Nr. 72); Tabellenzellen hinter „… folgende Zeilen eingefügt:“ (GVBl. 2025 S. 21); „… folgende Nr. 1.3
angefügt.“ mit Punkt (BayMBl. 2025 Nr. 398); „… wird wie folgt geändert.“ mit Punkt, wenn gegliederte Befehle folgen (GVBl. 2025
S. 298); zitierte Überschriften, die als Überschriftelement gesetzt sind (BayMBl. 2025 Nr. 391); ein Zitat, das mit geradem
Anführungszeichen schließt („… eingefordert."“, BayMBl. 2024 Nr. 474 – nur am Einheitenende und nur als einziges gerades Zeichen);
das Verb vor dem Zitat („In Teil 1 … der Anlage **wird** in der Zeile der Kennziffer 821 Spalte 6 der AufbewV …, die Angabe „X“ durch
… ersetzt.“, GVBl. 2025 S. 178). **Schwache Identifikation:** Trägt kein Einleitungssatz zwei Merkmale, zählt genau ein Kandidat mit
Ausfertigungsdatum oder BayRS-Nummer ohne widersprechendes Merkmal – nur wenn der Verweis der Kette die Seite schon als Änderung
dieser Norm bestimmt (GVBl. 2018 S. 188, HeimKoZuV). Ein überzähliges schließendes Anführungszeichen hinter dem Verb („… ersetzt“.“)
wird weiterhin **nicht** gedeutet (es kann das Ende eines Zitats sein, in dem der Befehl nur zitiert wird).

## 6 Formeln – erhoben, an echten Befehlen belegt

### 6.1 Wortlaut (bisher)

| Formel | Beispiel | rückwärts |
| --- | --- | --- |
| `replace-words` | „In § 31 Abs. 6 Satz 2 wird die Angabe „Nr. 3“ durch die Angabe „Nr. 2“ ersetzt.“ | Y (genau einmal im Bereich) → X |
| `insert-words` | „Nach der Angabe „Unterrichtswesen“ wird die Angabe „(BayEUG)“ eingefügt.“ | Anker + Einfügung → Anker |
| `delete-words-anchored` | „In Nr. 3.1.1 Satz 3 wird vor der Angabe „44“ die Angabe „Art.“ gestrichen.“ | am Anker wieder einsetzen |
| `append-words` | „Der Überschrift wird die Angabe „ , Verordnungsermächtigung“ angefügt.“ | Ende abschneiden |
| `replace-final-punctuation` | „In Nr. 13 wird der Punkt am Ende durch ein Komma ersetzt.“ | Schlusszeichen zurücksetzen |

### 6.2 Neu: Sätze, Glieder, Nummern, Schluss eines Feldes (`structural.ts`)

Je an einem echten Verkündungsausschnitt mit echtem Portaltext getestet:

| Formel | echtes Beispiel (Test) | rückwärts – und was „eindeutig“ heißt |
| --- | --- | --- |
| `insert-sentence` | „Folgender Satz 6 wird angefügt: „⁶Die zugelassenen Organisationen …““ (GVBl. 2024 S. 334); „Nach Satz 1 wird folgender Satz 2 eingefügt“ | der zitierte Satz steht **wörtlich** mit seiner Satznummer genau einmal an der Stelle (nach Satz n bzw. am Ende) → entfernen |
| `number-sentences` | „Der Wortlaut wird Satz 1.“ (GVBl. 2024 S. 334) | Satznummer ¹ entfernen, wenn sie die einzige ist |
| `renumber-sentence` | „Der bisherige Satz 2 wird Satz 3.“ | Nummer zurücksetzen; steht die alte Nummer danach doppelt (ein vorher eingefügter Satz trägt sie), hält `occurrence` fest, welche gemeint ist |
| `insert-block` | „Nach Nr. 5 wird folgende Nr. 6 eingefügt: „6. den Rechtsanwaltskammern …““ (GVBl. 2023 S. 638); „Folgende Nr. 14 wird angefügt“; „Die folgenden Nrn. 24 und 25 werden angefügt“ | das Glied trägt die genannte Bezeichnung, sein Wortlaut (Bezeichnung, Überschrift, Text, Unterglieder) ist Zeichen für Zeichen das Zitat (nur Leerraum ausgenommen), der Anker ist das unmittelbar vorangehende Glied, ein angefügtes Glied ist das letzte seiner Art, **keine Abbildung** darin → entfernen; das Glied steht im Rezept |
| `relabel` | „Die bisherigen Nrn. 3 bis 6 werden die Nrn. 4 bis 7.“ (GVBl. 2026 S. 190) | Bezeichnung zurücksetzen, Ziel eindeutig; vorwärts über den Indexpfad |
| `insert-title` | „In § 1 wird folgende Überschrift eingefügt: „Entschädigung, Reisekosten““ (GVBl. 2025 S. 39) | Überschrift entfernen, wenn sie wörtlich die eingefügte ist |
| `replace-final-words` | „In Nr. 2 wird die Angabe „ .“ am Ende durch die Angabe „oder“ ersetzt.“ (GVBl. 2026 S. 487) | Ende des einzigen Feldes zurücksetzen; ein Wort steht nach einem Leerzeichen, ein Satzzeichen schließt an |
| `delete-final-words` | „In Nr. 4 wird die Angabe „und“ am Ende gestrichen.“ (GVBl. 2025 S. 270) | am Ende wieder anfügen – die Stelle ist das Ende, also eindeutig |
| `number-paragraph` (Lauf 5) | „Der Wortlaut wird Abs. 1.“ (GVBl. 2024 S. 562, AVWaffBeschR § 4) | der Absatz (1) ist nach Rücknahme der späteren Befehle das einzige Glied der Vorschrift und trägt keinen Fußnotenvermerk → zurück in die Gestalt, die der Parser einem Absatz ohne Kennzeichen gibt (erster Fließtext als `paragraphText`, übrige Kinder daneben); vorwärts genau umgekehrt |
| `replace-by-punctuation` (Lauf 5) | „In Spiegelstrich 5 wird das Wort „und“ durch ein Komma ersetzt.“ (BayMBl. 2024 Nr. 484) | das Satzzeichen steht im Bereich genau einmal → Wort zurück |

Weitere Lauf-5-Formen bestehender Formeln (je echter Ausschnitt, Parser-, Rück- und Vorwärtstest in
`bayernrecht-reconstruction-groups13.test.ts`):

- **Mehrere Einfügungen mit eigenem Anker in einem Satz**: „nach der Angabe „§ 62 Abs. 3“ wird die Angabe „ , § 76 Abs. 1“ und nach der
  Angabe „§ 34 Abs. 9“ wird die Angabe „ , § 41a Abs. 1“ eingefügt“ (GVBl. 2025 S. 695) → zwei `insert-words`.
- **Ersetzung mit untergliederten Paaren**: „In Satz 1 werden ersetzt:“ – „das Wort „A“ durch das Wort „B“ und“ – „das Wort „C“ durch das
  Wort „D“.“ (BayMBl. 2023 Nr. 632, 647) → ein Befehlssatz mit zwei Paaren.
- **Gleichzeitige Umnummerierung der „bisherigen“ Glieder**: Aufeinanderfolgende Umnummerierungen am selben Ort („b wird c …“ – „c wird
  d“ – „d und e werden e und f“ – „f wird g …“) nennen alle Glieder nach der bisherigen Zählung; rückwärts werden erst die übrigen
  Befehle dieser Sätze (am Glied unter neuer Bezeichnung) zurückgenommen, dann alle Umnummerierungen als eine (GVBl. 2025 S. 695).
  Nacheinander gelesen stünde zwischendurch ein Buchstabe doppelt.
- **„ , “ allein** als neuer Wortlaut („die Angabe „und“ durch die Angabe „ , ““): Das Komma schließt an, das Leerzeichen dahinter steht
  schon im Text.
- **„der Punkt am Ende“ eines Satzes, der nicht der letzte ist** („In Satz 4 wird der Punkt am Ende durch die Wörter „…“ ersetzt“,
  GVBl. 2024 S. 573): Ende ist das Satzende vor der nächsten Satznummer.
- **Satz hinter einer Aufzählung**: „Der Wortlaut wird Satz 1“ und „Folgender Satz 2 wird angefügt“ an einem Absatz „¹Soweit ein Antrag“
  – „1. …“ … „5. …“ – „ist er abzulehnen, …“ (GVBl. 2026 S. 113): ¹ am Text vor der Aufzählung, der neue Satz am Schlusstext; ohne
  ausdrückliche Satznummerierung nur, wenn der Absatz schon vorher Sätze zählte.
- **Spiegelstriche ohne Zeichen im Zitat** (`li` im BayMBl. und GVBl.): Für den Vergleich eines eingefügten Glieds wird „–“ ergänzt;
  stimmt es nicht, scheitert der wörtliche Vergleich (BayMBl. 2024 Nr. 442, GVBl. 2025 S. 272).
- **Anker als letztes Glied eines vorangehenden Teils**: „Nach § 14 wird folgender Teil 4 eingefügt“, wenn § 14 der letzte Paragraph von
  Teil 3 ist (GVBl. 2024 S. 278, 2025 S. 127).
- **„Der Nr. 1 wird folgende Überschrift vorangestellt:“** wird als Überschrifteinfügung gelesen; „Die bisherige Anlage wird durch die
  folgende Anlage ersetzt.“ als Anlagenersetzung (`annex-recast`, nicht umkehrbar).

**Reihenfolge der Befehle.** Die Befehle einer Änderung werden in ihrer Reihenfolge ausgeführt; eine Ortsangabe bezieht sich auf
die Zählung, die zu diesem Zeitpunkt gilt. Rückwärts wird deshalb der letzte Befehl zuerst aufgelöst – im heutigen Körper –, dann der
vorletzte im Körper ohne den letzten usw. (`steps.ts`). Ein Befehl „Der bisherige § 5 wird § 6 und wie folgt geändert:“ ist erst
Umnummerierung, seine Unterbefehle gelten für § 6. Steht die Einfügung vor der Umnummerierung der „bisherigen“ Glieder (GVBl. 2026 S.
190: „a) Nach Nr. 2 wird folgende Nr. 3 eingefügt … b) Die bisherigen Nrn. 3 bis 6 werden die Nrn. 4 bis 7.“), gibt es zwischendurch
zwei Glieder „3.“; das eingefügte ist genau das, dessen Wortlaut das Zitat ist – sonst Abbruch.

**Nie automatisch** (bleibt `reconstruction-required`): Neufassung ohne Alttext (`recast`), Aufhebung (`repeal-unit`), Streichung ohne
Anker (`delete-words` – die Stelle wäre beliebig, der Rundlauf bewiese nichts), Anlagen aus dem Anhang (`annex-recast`), Tabellen- und
Bildersetzung, eingefügte Glieder mit Abbildung oder abweichendem Wortlaut, mehrdeutige Mehrfachtreffer, „jeweils“ an nur einem Ort,
„Vor Abs. 1 wird folgender Abs. 1 eingefügt“ bei gleichzeitiger Umnummerierung (Anker nicht belegt), „Der Wortlaut wird Buchst. a“
und „Der Erste Teil wird Teil 1“ / „Die Abschnitte I. und II. werden die Kapitel 1 und 2“ (Wechsel von Blockart oder
Bezeichnungsform, alte Gestalt nicht eindeutig), Umgliederungen („In Nr. 1 wird nach Satz 5 die Nr. 1.1 eingefügt. Die bisherigen
Sätze 6 und 7 … werden die Sätze 1 und 2 der Nr. 1.1.“), Orte in Kopfzeilen und Tabellenspalten ohne Zeilenschlüssel, in Fußnoten und
in einem Inhaltsverzeichnis in Tabellenform.

## 7 Orte und Eindeutigkeit (`location.ts`, `apply.ts`)

Wie bisher: Stufen, die der Körper auszeichnet, müssen genau einmal gefunden werden; Stufen, die er nicht auszeichnet (Halbsatz,
Satzteil nach …, Sätze ohne Satznummern), lassen den Bereich als Obermenge – der Wortlaut muss darin genau einmal stehen. Für Glieder
(Einfügen, Umnummerieren) gilt eine Satzangabe im Ort („In Art. 3 Abs. 1 Satz 2 … Nr. 3“) als Obermenge des Absatzes. Die Überschrift
der Norm selbst ist Metadatum – ein Befehl daran scheitert (`location-unresolved`), denn der Titel der Stichtagsfassung wäre ein anderer.

Seit Lauf 5 aufgelöst (je mit echtem Portaltext getestet):

- **Nummer oder Buchstabe als Tabellenzeile**: Die Aufzählung ist als Tabelle gesetzt, die erste Zelle trägt „4.“ bzw. „k)“ (BayRKG Art. 6
  Abs. 6, GVBl. 2025 S. 643; Zahl der Kammern, BayMBl. 2025 Nr. 286) – genau eine solche Zeile im Bereich.
- **„Zeile der Kennziffer 821 Spalte 6“**: Zeile über den Schlüssel in ihrer ersten Zelle, Spalte als Zelle der Zeile (AufbewV, GVBl.
  2025 S. 178). **„… der Anlage“ im Genitiv** ist das äußerste Glied; **„Anlage“ ohne Nummer** trifft die einzige unnummerierte Anlage.
- **Vorbemerkung/Einleitung/Präambel** (auch „Satz 2 der Vorbemerkung“): der unbezeichnete Text vor dem ersten bezeichneten Glied;
  **„Wortlaut vor Buchst. a“** = Satzteil vor Buchst. a.
- **Satz in einem Glied ohne eigenen Text**, dessen Wortlaut als einziges Textglied darunter steht (BayMBl.: „4.2.2 Überschrift“ –
  „¹… ²… ³…“): der Satz in diesem Textglied; „jeweils“ über verschiedene Sätze desselben Feldes ist dann keine Überschneidung. Nach
  einer Aufzählung trägt genau ein unbezeichnetes Textglied die Satznummer („⁴…“ hinter Nr. 1 bis 3).
- **Treffer mitten in einem längeren Wort zählen nicht mit**: „Anwärter“ neben „Anwärterinnen“ ist eindeutig (UntVergV § 1 Abs. 1,
  GVBl. 2026 S. 425); zwei ganze Treffer bleiben mehrdeutig.

## 8 Inkrafttreten (`commencement.ts`)

Grundregel und Abweichungen der Schlussvorschrift, für den Abschnitt der Norm; Abweichungen für fremde Abschnitte eines
Mantelgesetzes gelten nicht. Neu lesbar: Aufzählungen („Abweichend von Abs. 1 treten in Kraft: 1. § 9 mit Wirkung vom …, 2. die §§ 11
und 13 am …“, auch über Einheiten verteilt bis „in Kraft.“), Paare („tritt § 16 am … und § 20 am … in Kraft“), Punktbereiche („die Nrn.
1.1 bis 1.18“), Untergliederung („§ 1 Nr. 5“ betrifft nur einen Teil), „Diese Änderung der Bekanntmachung tritt … in Kraft“. **Nennt eine
Abweichung den ganzen Abschnitt** („treten die §§ 61 bis 73 am 1. Januar 2027 in Kraft“), gilt für ihn die Grundregel nicht. Eine
nicht lesbare Abweichung macht das Inkrafttreten unbestimmt. Seit Lauf 5: Staatsverträge und Abkommen mit Kalenderdatum („Dieser
Staatsvertrag tritt am 1. Dezember 2025 in Kraft. Sind bis zum … nicht alle Ratifikationsurkunden hinterlegt, wird der Staatsvertrag
gegenstandslos.“ – die Ratifikationsklausel kann das Inkrafttreten nur verhindern, nicht verschieben); „am Tag nach der letzten
Verkündung in den Ländern“ bleibt unbestimmt. Ein Glied der obersten Befehlsebene des BayMBl. („2. Diese Bekanntmachung tritt …“,
`MBL1Listenebene`) steht nie in einem Zitat – ein weiter oben nicht geschlossenes Zitat verdeckt es nicht (BayMBl. 2025 Nr. 233).

## 9 Beginn der Stichtagsfassung

Belegt nur durch ein **Kalenderdatum** aus einer Inkrafttretensvorschrift – „am Tag nach der Verkündung“ zählt nicht:

- **letzte Änderung vor dem Stichtag:** ihre eigene Verkündung (HTML oder PDF-Textlayer, Abschnitt 4), für ihren Abschnitt;
- **Stammfassung:** die Inkrafttretensvorschrift im **rückgerechneten** Text; ausgeschlossen bleiben Neubekanntmachungen und bereinigte
  Fassungen (die Vorschrift des Stammgesetzes belegt nicht den Beginn dieser Fassung) und Normen, die ihre eigene Geltung unbestimmt
  begrenzen; ein ausdrückliches Außerkrafttreten nach dem Stichtag ist unschädlich.

Ergebnis: `baselineTextInForce { date, evidence, sources }`.

## 10 Rundlauf und Forward-Replay

Je Änderung: rückwärts, dann vorwärts – exakt der Körper nach der Änderung. Für das Rezept: **Stichtagskörper plus alle Änderungen,
älteste zuerst**, ergibt exakt den heutigen Körper (kanonisches JSON, ohne Normalisierung), auch nach Serialisierung des Rezepts. Eine
Rückrechnung, die nichts ändert, ist kein Nachweis. Der Rundlauf ist notwendig, aber allein nicht hinreichend – die Eindeutigkeit
sichern Formelauswahl, Wortlautvergleich und Kette.

## 11 Rezept v1/v2 und Schnittstelle für den Bulk

- **v1** (`bayernrecht-reverse-amendment/1`, eine Änderung): unverändert – `amendment`, `steps`, `baselineTextInForce`, `chain`,
  `expected`.
- **v2** (`bayernrecht-reverse-amendment/2`, mehrere Änderungen):

```jsonc
{
  "schemaVersion": "bayernrecht-reverse-amendment/2",
  "documentId": "BayDVWoR", "baselineDate": "2023-12-01", "method": "reverse-amendment",
  "source": { "url", "sha256", "parserVersion", "inForceFrom", "fullCitation" },       // heutiges Paket
  "amendments": [                                                                        // jüngste zuerst
    { /* alle Felder des v1-`amendment`: eventId, citation, organ, publicationAuthority, digitalRepresentation,
         url, sha256, retrievedAt, gazettePdfUrl, gazettePdfSha256Published, eventDate, enactmentDate,
         effectiveDate, effectiveDateEvidence, section, intro, priorAmendment */
      "effectiveDates": ["…"],                                                           // alle Daten für diese Norm
      "steps": [ /* wie v1, Kennungen a1-s01 … */ ],
      "expected": { "beforeFingerprint": "…", "afterFingerprint": "…" } }               // Zwischenstände
  ],
  "baselineTextInForce": { "date", "evidence", "sources" },
  "chain": ["…"],
  "sources": [ { "role": "reversed-amendment" | "baseline-start", "citation", "url", "sha256", "retrievedAt" } ],
  "whitespace": "…",
  "expected": { "currentFingerprint", "baselineFingerprint" }
}
```

Eine Änderung, die vor dem Stichtag verkündet und danach in Kraft trat, hat kein Registerereignis; `eventId` ist dann
`publication:<organ>-<jahr>-<stelle>`.

Reine Funktionen (`apply.ts`, `recipe.ts`), beide Schemata:

```ts
applyReverseRecipe(currentBody, recipe)  // → Stichtagskörper; prüft Rezept, heutigen Körper, je v2-Änderung Zwischenstand vorher/nachher
verifyRoundTrip(currentBody, recipe)     // → { ok, detail }: rückwärts, Forward-Replay (älteste zuerst), exakt gleich
recipeProblems(recipe)                   // → Verstöße: Schema, je Änderung Inkrafttreten > Stichtag, Wortlaut, Adresse+SHA-256, Schritte;
                                         //   jüngstes Inkrafttreten = inkraft; Kettenreihenfolge; v2 ≥ 2 Änderungen; Beginn ≤ Stichtag
recipeAmendments(recipe)                 // → zurückgenommene Änderungen mit ihren Schritten, jüngste zuerst ([0] jüngste, .at(-1) älteste)
recipeSources(recipe)                    // → alle Verkündungen (Rolle, Fundstelle, URL, SHA-256)
forwardOrder(recipe), isRecipeV2(recipe)
```

Der Bulk braucht: jüngste und älteste zurückgenommene Änderung (`recipeAmendments(recipe)[0]` / `.at(-1)`: `effectiveDate`,
`citation`, `url`, `sha256`), `baselineTextInForce` (Datum, Belege, `sources`) und alle Verkündungen (`recipeSources`). Gearbeitet
wird auf dem **bayerischen Quelltext** (vor der Überleitung). Ändert sich der Parser, ändern sich die Fingerabdrücke; dann ist die
Rückrechnung neu zu erzeugen (`reconstruction-queue --write`, sonst lehnt der Bulk mit `current-mismatch` ab). Abbildungsblöcke
(`figure`) werden in Replay und Vergleich unverändert durchgereicht.

## 12 Gruppen (`groups.ts`)

Jede Norm hat **genau eine** Gruppe, dazu beliebig viele Gründe (`reasons`). Vergeben nach Vorrang – die schwerste zutreffende Lage:

| Vorrang | Gruppe | trifft zu, wenn |
| ---: | --- | --- |
| 1 | `contradictory-evidence` | Belege widersprechen einander (Inkrafttreten ≠ `inkraft`, Verlauf ≠ Kette …) |
| 2 | `baseline-only-predecessor` | der heutige Text ist eine Stammfassung, die erst nach dem Stichtag in Kraft trat |
| 3 | `full-recast` | eine Änderung fasst die ganze Norm neu (auch Ereignistyp `recast`) |
| 4 | `annex-replacement` | eine Anlage selbst wird ersetzt oder neu gefasst (nicht: ein Glied in ihr) |
| 5 | `table-replacement` | eine Tabelle wird ersetzt oder neu gefasst |
| 6 | `image-replacement` | eine Abbildung wird ersetzt oder eingefügt |
| 7 | `missing-predecessor-text` | ein Befehl trägt den Alttext nicht (Neufassung eines Glieds, Aufhebung, Streichung ohne Anker) |
| 8 | `single-amendment` / `two-amendments` / `three-or-more-amendments` | sonst: nach der Zahl der Änderungen |

Die Gruppen 1–3 des Auftrags (eine, zwei, drei oder mehr Änderungen) sind die grundsätzlich exakt umkehrbaren Fälle; was sie noch
aufhält, steht in den Gründen.

## 13 Stichtagsstatus und unbestimmte Geltungsfälle

`--write` liest `baseline.json` **frisch** und übernimmt nur eigene Entscheidungen: für jede zurückgerechnete Norm Methode
`reverse-amendment`, Status `active-at-baseline`, keine Blocker, Beleg mit Rezeptpfad; alle übrigen `changed-after-baseline` behalten
ihren Blocker plus `Rekonstruktion: <Zustand> (<Grund>) – <Befund>`. Idempotent.

Die unbestimmten Geltungsfälle (`status: undetermined`) werden mit Register und allen Detailseiten nach dem Stichtag neu geprüft
(`undetermined.ts`): Gesucht ist eine Verkündung, die die Norm **stark** zitiert und einen Änderungs- oder Aufhebungsbefehl an sie
richtet, ohne eine Änderung dazwischen zu nennen – sie setzt die Geltung an ihrem Tag voraus; gilt der heutige Text laut Paket seit
einem Tag vor dem Stichtag, galt die Norm am Stichtag. Entschieden wird nur die **Geltung**; hat die Verkündung den Text geändert,
bleibt die Methode `undetermined` mit Blocker. Ergebnis: 14 geprüft, **1 neu entschieden** (`BayVV_2230_7_1_K_10450`: BayMBl. 2025
Nr. 194 ändert die Bekanntmachung vom 28. Mai 2019 mit Wirkung vom 1. Januar 2025 → Status `active-at-baseline`, Methode bleibt
`undetermined`, weil der Text nach dem Stichtag geändert wurde, das Paket aber `inkraft` 2019-01-01 nennt), 13 bleiben unbestimmt
(keine Verkündung nach dem Stichtag zitiert sie stark). Die vorige Entscheidung steht als Beleg in der Entscheidung und wird bei
jedem Lauf wiederhergestellt, bevor neu geprüft wird.

## 14 Audit und Determinismus (`audit.ts`)

`data/audits/bayernrecht/reconstruction-audit.json`, je Rezept: Methode, Basisquelle (Paket, SHA-256 laut Rezept und Cache),
Änderungen mit Verkündung, SHA-256, Inkrafttreten und Operationen (Kennung, Formel, Art, Ort), Beginn mit Quellen, Fingerabdrücke
(heute, Zwischenstände, Stichtag), Ergebnis des Forward-Checks (neu berechnet aus Cache und Rezept) und der Quellenprüfung. Keine
Laufzeitstempel: Zwei Läufe über denselben Stand ergeben byte-gleiche Dateien (`--write` meldet dann „Unverändert“).

## 15 Vorwärtsrekonstruktion – nicht ausgeführt, mit Grund

Eine Vorwärtsrekonstruktion bräuchte eine **amtliche Ausgangsfassung als strukturierten Text**. BAYERN.RECHT führt keine
Fassungshistorie; Neubekanntmachungen vor dem Stichtag liegen als Verkündung vor, aber ihre Abbildung auf das Blockmodell des Portals
(Satznummern, Glieder, Tabellen, Fußnoten) ließe sich ohne Referenz nicht beweisen – ein Rundlauf gegen eine unabhängige Fassung
fehlt. Ohne diesen Beweis wäre jede so gewonnene Fassung eine Vermutung. Die Fälle, in denen nur dieser Weg bliebe, stehen in den
Gruppen `missing-predecessor-text`, `full-recast`, `annex-replacement`, `table-replacement`, `image-replacement`.

## 16 Grenzen

| Grenze | Folge |
| --- | --- |
| Neufassung, Aufhebung, Streichung ohne Anker tragen keinen Alttext | größte Gruppe (`missing-predecessor-text`) |
| PDF nur mit eindeutigen Grenzen (Titelzusatz, Unterschrift, eine Regel) und ohne OCR-Layer | sonst Review |
| Vorgänger auf Nicht-Plattform-Blättern (AllMBl., KWMBl., JMBl., BGBl.) | `prior-source-not-on-platform` |
| Einfügen „vor“ einem Glied bei gleichzeitiger Umnummerierung, „Der Wortlaut wird Buchst. a“, Umbenennung von Gliederungsebenen | nicht angewandt |
| Kopfzeilen-, Spaltenorte ohne Zeilenschlüssel, Tabellenzeilen einfügen, mehrzellige Wortlaute | nicht auflösbar |
| Teils später in Kraft tretende Änderung (ein Teil erst nach dem Auswertungsstichtag) | `chain-partially-in-force`; bräuchte eine Teilrücknahme mit Nachweis, dass der spätere Teil im heutigen Text fehlt |
| Reihenfolge von Inkrafttreten gegen Verkündung (älter verkündet, später in Kraft) | `chain-commencement-order` |
| Titeländerung der Norm selbst | Titel ist Metadatum, Stichtagstitel wäre ein anderer |

## 17 Lauf 5: die 72 offenen Fälle der Gruppen 1–3

Ausgangspunkt (nach Lauf 4): 33 Rezepte, 486 `reconstruction-required`; in den Gruppen 1–3 **72** offene Normen (47 mit einer, 17 mit
zwei, 8 mit drei und mehr Änderungen). Vorgehen in der Reihenfolge des Auftrags: nicht lesbare Befehlsblöcke, nicht lesbares
Inkrafttreten, Einfügen/Umnummerieren/Gliederung, mehrstufige Ketten; nach jeder Änderung `reconstruction-queue --write` mit den
Zahlen (37 → 40 → 43 → 43 → 43 → 44 Rezepte).

Ergebnis: **44 Rezepte** (37 einstufig, 7 mehrstufig), **475** `reconstruction-required`. Von den 72:

| | Normen |
| --- | ---: |
| **gelöst** (Rezept, Rundlauf exakt, Forward-Replay) | **11** (9 einstufig, 2 mehrstufig) |
| jetzt vollständig gelesen, dadurch in einer anderen Gruppe: `missing-predecessor-text` (10 mit nicht umkehrbarem Befehl – Neufassung, Aufhebung, Streichung ohne Anker –, 3 mit Vorgänger außerhalb der Plattform, 2 weitere) | 15 |
| – `annex-replacement` / `table-replacement` (Anlage oder Tabelle aus beigefügter Datei bzw. neu gefasst) | 6 / 2 |
| – `contradictory-evidence` (Widerspruch zur Stichtagsklassifikation) | 3 |
| bleiben in den Gruppen 1–3, mit benanntem Grund | 35 |

Gelöst: `BayAufbewV` (Verb vor dem Zitat, Tabellenzeile/Spalte, PDF 2017 als Beleg des Beginns), `BayAVWaffBeschR` („Der Wortlaut wird
Abs. 1“), `BayEStBAPO` und `BayFachVUVAD` (Anker als letztes Glied des vorangehenden Teils), `BayRKG` und `BayVV_320_A_570` (Nummer bzw.
Buchstabe als Tabellenzeile), `BaySpielbG` (Punkt am Ende eines inneren Satzes), `BayUntVergV` (Wortteile zählen nicht), `BayWoBindG`
(Satz hinter einer Aufzählung), `BayAGBBiG` (mehrere Anker, gleichzeitige Umnummerierung, „ , “), `BayZLV` (unnummerierte Anlage,
Spiegelstriche ohne Zeichen). Der Bulk übernähme alle elf (`bulk --only …` ohne `--write`: 11 von 11 übernahmefähig).

Was offen bleibt, und warum (Befund je Norm in der Tabelle):

- **Staatsverträge** (`ARDStV`, `BayDLR_StV`, `JMStV`, `MStV`, `RFinStV`, `ZDF_StV`): Der Einleitungssatz nennt den Vertrag ohne Fundstelle
  („Der ZDF-Staatsvertrag vom 31. August 1991, zuletzt geändert durch … vom 9. bis 16. Mai 2023, wird wie folgt geändert:“); jeder
  betroffene Artikel enthält zudem Neufassungen (§ 27 ZDF-StV und DLR-StV, § 12 RFinStV, JMStV/MStV mehrfach, ARD-StV insgesamt) –
  auch gelesen nicht umkehrbar.
- **Satzfehler der Verkündung oder des Portals**: ein nicht geschlossenes Zitat („„2.2.243.2“, BayMBl. 2026 Nr. 296), ein
  Gliederungssprung 1.20 → 1.20.1.1 (BayMBl. 2026 Nr. 183, dort zudem Neufassungen), der Portaltext ohne den Schlusspunkt des 2024
  angefügten Satzes (`BayUIG` Art. 2 Abs. 1), eine Seite mit „vom 19. März 2023“ unter BayMBl. 2024 Nr. 156 (`BayVwV154422`), ein
  Inkrafttreten „mir Wirkung vom 1. August 2022 … für das neunjährige Gymnasium“ (`BayVV_2235_1_1_5_K_13224` – der Rundlauf gelingt, der
  Beginn der Stichtagsfassung ist nicht belegt).
- **Tabellen, Kopfzeilen, Fußnoten, Anlagen als Datei**: Zeilen einfügen (`BayDVLArztG`, `BayVV_2033_6_F_10463`, `BayGGebO`), Kopfzeilen
  (`BayVV_2230_7_UK_459`, `BayVV_2232_2_K_11648`), Spalten je Staat (`BayVwV246099`), „Tabellenspalte 2“, Fußnote und „Punkt
  Geltungsdauer“ (`BayVV_7803_2_L_10836`), ein Inhaltsverzeichnis in Tabellenform und „Nr. XVII.“ nur im Titel (`BayEBekMiZi`), eine
  Anlage, die das Portal als unbezeichneten Block führt, und „Fußnote 4 zu § 9“ (`BayVV_2025_I_11358`), eine Anlage mit eigener
  Untergliederung (`BayVwV251225`), „Anlage 3“ im Portal nur als Verweis (`BayVV_301_I_2284`).
- **Umbau der Gliederung**: „Der Erste Teil wird Teil 1“ und „Die Abschnitte I. und II. werden die Kapitel 1 und 2“ (`BayGDVG`),
  Umgliederung von Sätzen in eine neue Nr. 1.1 (`BayVV_2210_4_WK_14107`), „Der Wortlaut wird Buchst. a“ (`BayGGebO`).
- **Mehrdeutig**: der neue Wortlaut steht zweimal im Satz (`BayNatWaldV`); ein Wortlaut über drei Blöcke verteilt
  (`BayVV_2235_1_1_1_UK_231`).
- **Titel der Norm** (Metadatum, nicht im Körper): `BayArchivGl`, `BayLFBPO`.
- **Inkrafttreten**: „am Tag nach der letzten Verkündung in den Ländern“ (`SiTechZStV`); keine Grundregel, das Datum steht nur im
  angefügten Satz, Nr. 4 zudem neu gefasst (`BayVV_913_B_11939`); der Textlayer der Ausgabe 1988 stammt aus einer Texterkennung
  (`BayAbhGertArbV`).
- **Kette**: eine Änderung tritt teils erst nach dem Auswertungsstichtag in Kraft (`BayVV_2154_I_2270`); eigene Geltungsgrenze
  (`BayHG2021`); Normenkontroll- bzw. Verfassungsgerichtsentscheidungen im Register (`BayAAV`: VGH zu einer Änderungsverordnung,
  `BayHG2022`: VerfGH 2026 zu Art. 2a) – ihre Wirkung auf den Stichtagstext ist eine Rechtsfrage; keine Kette (`BayVV_3122_2_7_J_063`);
  Vorgänger auf AllMBl./KWMBl./JMBl. (`BayVwV270888` u. a.).

Zwei Normen der 72 sind selbst erst **nach dem Stichtag verkündet** (`BayVV_2230_1_1_1_0_K_14216`: BayMBl. 2023 Nr. 633 vom
2023-12-20, „mit Wirkung vom 1. Januar 2024 … in Kraft gesetzt“; `BayVV_2330_B_14207`: BayMBl. 2023 Nr. 629 vom 2023-12-20, in Kraft
2024-01-01) – die Stichtagsnorm ist jeweils ihr Vorgänger. Die Schlange meldet sie als Widerspruch
(`norm-published-after-baseline`); die Einstufung `active-at-baseline` in `baseline.json` ist zu prüfen.

| Norm | vorher (Gruppe: Zustand/Grund) | nachher | Befund |
| --- | --- | --- | --- |
| `BayAufbewV` | 1: `effective-date-undetermined/commencement-unreadable` | **gelöst** (v1) | 1 Schritt(e) aus GVBl. 2025 S. 178, in Kraft 2025-07-01; Rundlauf exakt |
| `BayAVWaffBeschR` | 1: `unsupported-formula/renumber` | **gelöst** (v1) | 2 Schritt(e) aus GVBl. 2024 S. 562, in Kraft 2024-11-30; Rundlauf exakt |
| `BayEStBAPO` | 1: `ambiguous-target/reverse-anchor-mismatch` | **gelöst** (v1) | 4 Schritt(e) aus GVBl. 2024 S. 278, in Kraft 2024-08-01; Rundlauf exakt |
| `BayFachVUVAD` | 1: `ambiguous-target/reverse-anchor-mismatch` | **gelöst** (v1) | 4 Schritt(e) aus GVBl. 2025 S. 127, in Kraft 2025-06-01; Rundlauf exakt |
| `BayRKG` | 1: `ambiguous-target/reverse-location-unresolved` | **gelöst** (v1) | 3 Schritt(e) aus GVBl. 2025 S. 643, in Kraft 2026-01-01; Rundlauf exakt |
| `BaySpielbG` | 1: `round-trip-failed/reverse-target-not-found` | **gelöst** (v1) | 9 Schritt(e) aus GVBl. 2024 S. 573, in Kraft 2025-01-01; Rundlauf exakt |
| `BayUntVergV` | 1: `ambiguous-target/reverse-target-ambiguous` | **gelöst** (v1) | 3 Schritt(e) aus GVBl. 2026 S. 425, in Kraft 2026-08-01; Rundlauf exakt |
| `BayVV_320_A_570` | 1: `ambiguous-target/reverse-location-unresolved` | **gelöst** (v1) | 15 Schritt(e) aus BayMBl. 2025 Nr. 286, in Kraft 2025-08-01; Rundlauf exakt |
| `BayWoBindG` | 1: `ambiguous-target/reverse-location-unresolved` | **gelöst** (v1) | 9 Schritt(e) aus GVBl. 2024 S. 265, in Kraft 2024-08-01; Rundlauf exakt |
| `BayAGBBiG` | 2: `unsupported-formula/renumber` | **gelöst** (v2) | 25 Schritt(e) aus GVBl. 2025 S. 695 ← GVBl. 2024 S. 98, in Kraft 2026-01-01; Rundlauf exakt |
| `BayZLV` | 2: `unsupported-formula/insert-unit` | **gelöst** (v2) | 5 Schritt(e) aus GVBl. 2025 S. 272 ← GVBl. 2024 S. 281, in Kraft 2025-08-01; Rundlauf exakt |
| `ARDStV` | 1: `effective-date-undetermined/commencement-unreadable` | 1: `command-unreadable/chain-block-not-found` | GVBl. 2025 S. 350 (Art. 2): kein eindeutig lesbarer Änderungsbefehl für die Norm (intro-not-found: Kein Einleitungssatz zitiert die Norm mit einem Änderungsbefehl); die Änderung tritt nach dem Stichtag in Kraft und müsste zurückge… |
| `BayAbhGertArbV` | 1: `command-unreadable/chain-block-not-found` | Alttext: `effective-date-undetermined/commencement-unreadable` | GVBl. 1988 S. 329: PDF-Seite 1 trägt nicht Seitenzahl 329 mit Kopfzeile des GVBl. |
| `BayArchivGl` | 1: `ambiguous-target/reverse-location-unresolved` | 1: `ambiguous-target/reverse-location-unresolved` | GVBl. 2026 S. 61 (§ 1): 1. Überschrift: Überschrift der Norm selbst: gehört zu den Metadaten, nicht zum Körper |
| `BayBFSOMusik` | 1: `unsupported-formula/unrecognized` | Alttext: `non-invertible-amendment/repeal-unit` | GVBl. 2025 S. 298 (§ 7): 2. „§ 10 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayDLR_StV` | 1: `effective-date-undetermined/commencement-unreadable` | 1: `command-unreadable/chain-block-not-found` | GVBl. 2025 S. 350 (Art. 4): kein eindeutig lesbarer Änderungsbefehl für die Norm (intro-not-found: Kein Einleitungssatz zitiert die Norm mit einem Änderungsbefehl); die Änderung tritt nach dem Stichtag in Kraft und müsste zurückge… |
| `BayDVLArztG` | 1: `command-unreadable/chain-block-not-found` | Alttext: `command-unreadable/location-unreadable` | GVBl. 2025 S. 21 (§ 1): Ortsangabe „Tabelle in Anlage 1“ nicht lesbar (3.) |
| `BayEBekMiZi` | 1: `unsupported-formula/insert-unit` | 1: `unsupported-formula/insert-unit` | BayMBl. 2024 Nr. 666 (Nr. 1): 1.2 1.2.1 „Dem Inhaltsverzeichnis zu Nr. XVII. wird folgende Angabe angefügt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Modell nicht angewa… |
| `BayHG2021` | 1: `partial-chain/baseline-text-in-force-unproven` | 1: `partial-chain/baseline-text-in-force-unproven` | Beginn der Stichtagsfassung (Stammfassung) nicht belegt: Die Norm begrenzt ihre eigene Geltung („gelten bis zum Tag der Bekanntmachung des Haushaltsgesetzes des folgenden Haushaltsjahres weiter“); ob sie am Stichtag galt, ist eine… |
| `BayNatWaldV` | 1: `ambiguous-target/reverse-target-ambiguous` | 1: `ambiguous-target/reverse-target-ambiguous` | GVBl. 2024 S. 98 (§ 1): § 7 Abs. 1 Satz 2: neuer Wortlaut „, Forsten und Tourismus“ kommt im Bereich 2-mal vor (erwartet: genau einmal) |
| `BayVV_2025_I_11358` | 1: `command-unreadable/location-unreadable` | 1: `unsupported-formula/unrecognized` | BayMBl. 2025 Nr. 318 (Nr. 1): 1.3 1.3.2 „In Fußnote 4 zu § 9 wird das Wort „Zustellung“ durch das Wort „Bekanntgabe“ ersetzt.“: Ortsangabe nicht lesbar: „Fußnote 4 zu § 9“ |
| `BayVV_2038_3_11_G_13478` | 1: `command-unreadable/location-unreadable` | Alttext: `non-invertible-amendment/recast` | BayMBl. 2025 Nr. 391 (Nr. 1): 1.6 „Nr. 3 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_2154_I_2270` | 1: `partial-chain/chain-partially-in-force` | 1: `partial-chain/chain-partially-in-force` | BayMBl. 2026 Nr. 80 (Nr. 1) tritt teils bis, teils erst nach dem Auswertungsstichtag in Kraft (2026-02-28, 2027-01-01); der heutige Text enthält nur einen Teil der Änderung |
| `BayVV_2230_1_1_1_0_K_14216` | 1: `effective-date-undetermined/commencement-unreadable` | Widerspruch: `contradictory/norm-published-after-baseline` | Die Norm selbst ist erst nach dem Stichtag verkündet: BayMBl. 2023 Nr. 633 (eigene Fundstelle, Register: expire am 2023-12-20); am Stichtag gab es diese Fassung nicht – die Einstufung „am Stichtag in Kraft“ ist zu prüfen (die Stic… |
| `BayVV_2230_7_UK_459` | 1: `unsupported-formula/unrecognized` | 1: `unsupported-formula/unrecognized` | BayMBl. 2025 Nr. 145 (Nr. 1): 1.1 „In der Kopfzeile der Tabelle wird das Wort „Kommunaler“ gestrichen.“: Ortsangabe nicht lesbar: „der Kopfzeile der Tabelle“ |
| `BayVV_2232_2_K_11648` | 1: `unsupported-formula/unrecognized` | 1: `unsupported-formula/unrecognized` | BayMBl. 2026 Nr. 271 (Nr. 1): 1.1 „In Anlage 5 wird in der Kopfzeile die Angabe „Jahrgangsstufen 3 und 4“ durch die Angabe „Jahrgangsstufe 3“ ersetzt.“: Klausel nicht erkannt: „wird in der Kopfzeile die Angabe ⟦0⟧ durch die Angabe… |
| `BayVV_2235_1_1_1_UK_231` | 1: `command-unreadable/chain-block-not-found` | 1: `round-trip-failed/reverse-target-not-found` | BayMBl. 2024 Nr. 72 (Nr. 1): Nr. 6: neuer Wortlaut „Oberbayern, Schwaben: StD Johann Forster, Max-Planck-Gymnasium München“ kommt im Bereich 0-mal vor (erwartet: genau einmal) |
| `BayVV_2235_1_1_5_K_13224` | 1: `ambiguous-target/reverse-location-unresolved` | 1: `partial-chain/baseline-text-in-force-unproven` | Beginn der Stichtagsfassung (Stammfassung) nicht belegt: Inkrafttreten der Stammfassung ohne Kalenderdatum: „Diese Bekanntmachung tritt für das neunjährige Gymnasium mir Wirkung vom 1. August 2022 in Kraft.“ |
| `BayVV_2244_F_12366` | 1: `unsupported-formula/unrecognized` | Anlage: `asset-missing/annex-recast` | BayMBl. 2023 Nr. 632 (§ 1): 15. „Die Muster 1 und 2 zur Richtlinie für die Förderung von Verbänden der Heimat- und Brauchpflege erhalten die aus dem Anhang zu dieser Bekannt“: Anlage oder Anhang in neuer Fassung aus einer beigefüg… |
| `BayVV_2244_F_13364` | 1: `unsupported-formula/container` | Anlage: `asset-missing/annex-recast` | BayMBl. 2023 Nr. 647 (§ 1): 18. „Das Muster zur Richtlinie für die Förderung von Aktivitäten im Bayerischen Trachtenverband e. V. erhält die aus dem Anhang zu dieser Bekannt“: Anlage oder Anhang in neuer Fassung aus einer beigefüg… |
| `BayVV_2272_UK_209` | 1: `command-unreadable/chain-block-not-found` | Alttext: `non-invertible-amendment/recast` | BayMBl. 2025 Nr. 125 (Nr. 1): 1.1 „Die Überschrift wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_301_I_2284` | 1: `unsupported-formula/unrecognized` | 1: `unsupported-formula/insert-unit` | BayMBl. 2024 Nr. 484 (Nr. 1): 1.2 1.2.1 1.2.1.3 „Folgender Spiegelstrich 7 wird angefügt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Modell nicht angewandt |
| `BayVV_3122_2_7_J_063` | 1: `missing-base/no-post-baseline-event` | 1: `missing-base/no-post-baseline-event` | Weder ein Vollzitat mit letzter Änderung noch ein Ereignis nach dem Stichtag: die Kette ist unbekannt |
| `BayVV_61_02_03_01_F_13270` | 1: `command-unreadable/chain-block-not-found` | 1: `command-unreadable/chain-block-not-found` | BayMBl. 2026 Nr. 296: kein eindeutig lesbarer Änderungsbefehl für die Norm (structure-unreadable: Ein Zitat wird bis zum Ende der Seite nicht geschlossen); die Änderung tritt nach dem Stichtag in Kraft und müsste zurückgenommen we… |
| `BayVV_66_F_11402` | 1: `command-unreadable/chain-block-not-found` | Alttext: `non-invertible-amendment/recast` | BayMBl. 2024 Nr. 456 (§ 1): 4. a) „Satz 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_7801_L_13600` | 1: `command-unreadable/chain-block-not-found` | 1: `command-unreadable/chain-block-not-found` | BayMBl. 2026 Nr. 183: kein eindeutig lesbarer Änderungsbefehl für die Norm (structure-unreadable: Einheit 84: Gliederungssprung von Ebene 1 auf 3); die Änderung tritt nach dem Stichtag in Kraft und müsste zurückgenommen werden |
| `BayVV_7803_1_L_10832` | 1: `command-unreadable/chain-block-not-found` | Alttext: `non-invertible-amendment/recast` | BayMBl. 2025 Nr. 75 (Nr. 1): 1.9 „Der Spiegelstrich erhält folgende neue Fassung:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_7803_2_L_10836` | 1: `command-unreadable/chain-block-not-found` | 1: `command-unreadable/location-unreadable` | BayMBl. 2025 Nr. 37 (Nr. 1): Ortsangabe „Nr. 3.1 Tabellenspalte 2“ nicht lesbar (1.2) |
| `BayVV_787_L_13875` | 1: `command-unreadable/chain-block-not-found` | Anlage: `asset-missing/annex-recast` | BayMBl. 2024 Nr. 420 (Nr. 1): „Anlage 1 „Bauliche Anforderungen an eine besonders tiergerechte Haltung (btH)-Premiumförderung“ wird durch die dieser Richtlinie beigefügten“: Anlage oder Anhang in neuer Fassung aus einer beigefügte… |
| `BayVV_913_B_11939` | 1: `effective-date-undetermined/commencement-unreadable` | 1: `effective-date-undetermined/commencement-unreadable` | BayMBl. 2026 Nr. 354: Keine Grundregel zum Inkrafttreten gefunden |
| `BayVV2248K746` | 1: `command-unreadable/chain-block-not-found` | Alttext: `non-invertible-amendment/repeal-unit` | BayMBl. 2026 Nr. 259 (Nr. 1): 1.1 „Die Fußnote 2 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayVwV151525` | 1: `command-unreadable/chain-block-not-found` | 1: `command-unreadable/chain-block-not-found` | BayMBl. 2026 Nr. 72: kein eindeutig lesbarer Änderungsbefehl für die Norm (structure-unreadable: Ein Zitat wird bis zum Ende der Seite nicht geschlossen); die Änderung tritt nach dem Stichtag in Kraft und müsste zurückgenommen wer… |
| `BayVwV154721` | 1: `command-unreadable/chain-block-not-found` | Alttext: `missing-base/prior-source-not-on-platform` | Die genannte Änderung „vom 13. Oktober 2017 (KWMBl. S. 439)“ ist nicht im GVBl. oder BayMBl. verkündet; ihre Verkündung ist auf der Verkündungsplattform nicht abrufbar |
| `BayVwV252304` | 1: `effective-date-undetermined/commencement-unreadable` | Alttext: `missing-base/prior-source-not-on-platform` | Die genannte Änderung „vom 28. August 2017 (JMBl. S. 197)“ ist nicht im GVBl. oder BayMBl. verkündet; ihre Verkündung ist auf der Verkündungsplattform nicht abrufbar |
| `BayVwV270888` | 1: `missing-base/prior-source-not-on-platform` | 1: `missing-base/prior-source-not-on-platform` | Die genannte Änderung „vom 6. Juni 2018 (AllMBl. S. 419)“ ist nicht im GVBl. oder BayMBl. verkündet; ihre Verkündung ist auf der Verkündungsplattform nicht abrufbar |
| `BayVwV274719` | 1: `unsupported-formula/unrecognized` | Anlage: `asset-missing/annex-recast` | BayMBl. 2024 Nr. 655 (Nr. 1): 1.5 „Die bisherige Anlage wird durch die folgende Anlage ersetzt.“: Anlage durch eine folgende Anlage ersetzt; der Alttext steht nicht im Befehl |
| `JMStV` | 1: `effective-date-undetermined/commencement-unreadable` | 1: `command-unreadable/chain-block-not-found` | GVBl. 2025 S. 396 (Art. 1): kein eindeutig lesbarer Änderungsbefehl für die Norm (intro-not-found: Kein Einleitungssatz zitiert die Norm mit einem Änderungsbefehl); die Änderung tritt nach dem Stichtag in Kraft und müsste zurückge… |
| `RFinStV` | 1: `effective-date-undetermined/commencement-unreadable` | 1: `command-unreadable/chain-block-not-found` | GVBl. 2025 S. 350 (Art. 5): kein eindeutig lesbarer Änderungsbefehl für die Norm (intro-not-found: Kein Einleitungssatz zitiert die Norm mit einem Änderungsbefehl); die Änderung tritt nach dem Stichtag in Kraft und müsste zurückge… |
| `ZDF_StV` | 1: `effective-date-undetermined/commencement-unreadable` | 1: `command-unreadable/chain-block-not-found` | GVBl. 2025 S. 350 (Art. 3): kein eindeutig lesbarer Änderungsbefehl für die Norm (intro-not-found: Kein Einleitungssatz zitiert die Norm mit einem Änderungsbefehl); die Änderung tritt nach dem Stichtag in Kraft und müsste zurückge… |
| `BayGGebO` | 2: `command-unreadable/chain-block-not-found` | 3+: `unsupported-formula/renumber` | GVBl. 2026 S. 151 (§ 2): 1. a) „Der Wortlaut wird Buchst. a und die Angabe „ ; “ am Ende wird durch die Angabe „ , “ ersetzt.“: Umnummerierung: strukturelle Änderung, von diesem Modell nicht angewandt |
| `BayHG2022` | 2: `partial-chain/chain-ledger-unexplained` | 2: `partial-chain/chain-ledger-unexplained` | Das Register führt GVBl. 2026 S. 567 (notice) für die Norm; die Kette der amtlichen Verweise enthält diese Veröffentlichung nicht |
| `BayLFBPO` | 2: `ambiguous-target/reverse-location-unresolved` | 2: `unsupported-formula/replace-words` | GVBl. 2024 S. 98 (§ 1): „In der Überschrift und in § 2 Abs. 5 werden die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.“: Mehrere Orte (Überschrift; § 2 Abs. 5) ohne „jeweils“ |
| `BayUIG` | 2: `ambiguous-target/reverse-end-not-determined` | 2: `round-trip-failed/reverse-target-not-found` | GVBl. 2024 S. 605 (§ 10): 2. Art. 2 Abs. 1 (Schlusstext hinter der Aufzählung): eingefügter Satz „²Der Oberste Rechnungshof ist außer in Bezug auf seine eigene Verwaltungsführung“ steht 0-mal an der genannten Stelle (erwartet: gen… |
| `BayVV_2126_0_G_11745` | 2: `unsupported-formula/unrecognized` | Alttext: `non-invertible-amendment/repeal-unit` | BayMBl. 2025 Nr. 206 (Nr. 1): 1.6 1.6.1 1.6.1.2 „Die Sätze 2 und 3 werden aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayVV_2154_I_13077` | 2: `command-unreadable/chain-block-not-found` | Anlage: `asset-missing/annex-recast` | BayMBl. 2026 Nr. 255 (Nr. 1): 1.22 „Anlage 1 wird durch die aus dem Anhang zu dieser Bekanntmachung ersichtliche Anlage ersetzt.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht nicht im Befehl |
| `BayVV_2210_4_WK_14107` | 2: `command-unreadable/chain-block-not-found` | 2: `unsupported-formula/unrecognized` | BayMBl. 2024 Nr. 438 (Nr. 1): 1.1 „In Nr. 1 wird nach Satz 5 die Nr. 1.1 eingefügt. Die bisherigen Sätze 6 und 7 der Nr. 1 werden die Sätze 1 und 2 der Nr. 1.1.“: Mehrere Sätze in einem Befehl; der Ortsbezug der Folgesätze ist nic… |
| `BayVV_2273_I_13469` | 2: `command-unreadable/chain-block-not-found` | Tabelle: `non-invertible-amendment/recast` | BayMBl. 2025 Nr. 565 (Nr. 1): 1.1 „Nr. 4.1.1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_2330_B_14207` | 2: `partial-chain/chain-ledger-unexplained` | Widerspruch: `contradictory/norm-published-after-baseline` | Die Norm selbst ist erst nach dem Stichtag verkündet: BayMBl. 2023 Nr. 629 (eigene Fundstelle, Register: expire am 2023-12-20); am Stichtag gab es diese Fassung nicht – die Einstufung „am Stichtag in Kraft“ ist zu prüfen (die Stic… |
| `BayVV_7070_W_11463` | 2: `command-unreadable/chain-block-not-found` | Alttext: `non-invertible-amendment/recast` | BayMBl. 2025 Nr. 542 (Nr. 1): 1.1 „Nr. 8 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVwV151756` | 2: `command-unreadable/chain-block-not-found` | Alttext: `missing-base/prior-source-not-on-platform` | Die genannte Änderung „vom 17. Juni 2003 (KWMBl. I S. 260)“ ist nicht im GVBl. oder BayMBl. verkündet; ihre Verkündung ist auf der Verkündungsplattform nicht abrufbar |
| `BayVwV246099` | 2: `command-unreadable/location-unreadable` | 2: `command-unreadable/location-unreadable` | BayMBl. 2025 Nr. 467 (Nr. 1): Ortsangabe „Anhang“ nicht lesbar (1.2) |
| `BayVwV251225` | 2: `command-unreadable/chain-block-not-found` | Tabelle: `unsupported-formula/unrecognized` | BayMBl. 2025 Nr. 60 (Nr. 1): 2. „Die Anlage „Zuordnung von im Geschäftsbereich des Bayerischen Staatsministeriums für Unterricht und Kultus ausgeübten Funktionen zu Ämtern d“: Befehl mit eigener Änderung und Untergliederung |
| `BayVwV96746` | 2: `command-unreadable/chain-block-not-found` | Alttext: `non-invertible-amendment/recast` | BayMBl. 2025 Nr. 524 (Nr. 1): „Nr. 5 erhält folgenden Wortlaut:“: Neufassung; der Alttext steht nicht im Befehl |
| `SiTechZStV` | 2: `effective-date-undetermined/commencement-unreadable` | 2: `effective-date-undetermined/commencement-unreadable` | GVBl. 2025 S. 705: Inkrafttretensvorschrift nicht lesbar: „Dieses Abkommen tritt am Tag nach der letzten Verkündung in den Ländern in Kraft.“ |
| `BayAAV` | 3+: `partial-chain/chain-ledger-unexplained` | 3+: `partial-chain/chain-ledger-unexplained` | Das Register führt GVBl. 2023 S. 659 (notice), GVBl. 2024 S. 163 (notice) für die Norm; die Kette der amtlichen Verweise enthält diese Veröffentlichungen nicht |
| `BayGDVG` | 3+: `unsupported-formula/unrecognized` | 3+: `unsupported-formula/unrecognized` | GVBl. 2024 S. 630 (§ 1): 1. „Der Erste Teil wird Teil 1.“: Befehlsrest ohne Schlussverb: „der Erste Teil wird Teil 1“ |
| `BayVV_2033_6_F_10463` | 3+: `command-unreadable/chain-block-not-found` | 3+: `unsupported-formula/insert-unit` | BayMBl. 2026 Nr. 58 (§ 1): 2. „In Buchst. a wird der Tabelle folgende Angabe angefügt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Modell nicht angewandt |
| `BayVV_7904_L_11560` | 3+: `unsupported-formula/renumber` | Anlage: `asset-missing/annex-recast` | BayMBl. 2025 Nr. 497 (Nr. 1): 1.1 „Die bisherige Anlage 1 wird durch die Anlage 1 dieser Bekanntmachung ersetzt.“: Anlage durch eine beigefügte Anlage ersetzt; der Alttext steht nicht im Befehl |
| `BayVwV154422` | 3+: `missing-base/prior-source-unavailable` | 3+: `missing-base/prior-source-unavailable` | Verkündung von „vom 19. März 2024 (BayMBl. Nr. 156)“ nicht verfügbar: keine Seite trägt das Ausfertigungsdatum 2024-03-19 (https://www.verkuendung-bayern.de/baymbl/2024-156/) |
| `BayVwV97112` | 3+: `command-unreadable/chain-block-not-found` | Alttext: `non-invertible-amendment/delete-words` | BayMBl. 2026 Nr. 161 (Nr. 1): „In Satz 1 der Einleitung wird die Angabe „durch zinsverbilligte Darlehen“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayZAPOgtF_hF` | 3+: `command-unreadable/chain-block-not-found` | Widerspruch: `contradictory/portal-in-force-mismatch` | Der heutige Text gilt laut Paket seit 2024-07-01, die jüngste Änderung GVBl. 2024 S. 590 tritt am 2025-01-01 in Kraft |
| `MStV` | 3+: `effective-date-undetermined/commencement-unreadable` | 3+: `command-unreadable/chain-block-not-found` | GVBl. 2025 S. 396 (Art. 2): kein eindeutig lesbarer Änderungsbefehl für die Norm (intro-not-found: Kein Einleitungssatz zitiert die Norm mit einem Änderungsbefehl); die Änderung tritt nach dem Stichtag in Kraft und müsste zurückge… |
