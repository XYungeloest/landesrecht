# Rückrechnung von Änderungen – BayWü (`reverse-amendment`, ein- und mehrstufig)

Stand 2026-09-19. Stichtag **2023-12-01**. Kennzahlen, Gruppen und alle offenen Fälle: `data/audits/bayernrecht/RECONSTRUCTION.md`
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
`gazette.ts`, `apply.ts`, `recipe.ts`, `title.ts` (Überschrift der Norm, Lauf 6), `groups.ts`, `undetermined.ts`, `register.ts`,
`audit.ts`, `report.ts`, `context.ts`, `run.ts`; seit Lauf 9 `forward.ts` (Stand am Stichtag vorwärts) und `pdfbase.ts`
(Befund zum PDF-Textlayer der Stammverkündung).
Tests: `tests/unit/bayernrecht-reconstruction.test.ts`, (Lauf 5, Gruppen 1–3) `tests/unit/bayernrecht-reconstruction-groups13.test.ts`
und (Lauf 6) `tests/unit/bayernrecht-reconstruction-run6.test.ts` mit echten, gekürzten Verkündungsausschnitten und echtem Portaltext
(`tests/fixtures/bayernrecht/verkuendung-*-excerpt.html`, `portal-*-excerpt.json` – seit Lauf 6 mit den Kopffeldern `law.title`/
`shortTitle`/`abbr` –, `gvbl-2006-09-textlayer-s189-190.json`, `gvbl-2017-11-textlayer-s283-301.json`, `gvbl-2007-20-textlayer-s640.json`).

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

| | vor Lauf 4 | nach Lauf 4 | nach Lauf 5 | nach Lauf 6 | nach Lauf 7 | nach Lauf 8 | nach Lauf 9 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| sicher zurückgerechnet | 13 (alle einstufig) | 33 (28 einstufig, 5 mehrstufig) | 44 (37 einstufig, 7 mehrstufig) | 48 (39 einstufig, 9 mehrstufig) | 61 (50 einstufig, 11 mehrstufig) | 63 (52 einstufig, 11 mehrstufig) | **66** |
| davon mit Stammverkündung (`restoration`) | – | – | – | – | 13 | 15 | **17** |
| davon Stand am Stichtag vorwärts (`restoration.derivation: "forward"`) | – | – | – | – | – | – | **5** |
| `reconstruction-required` | 506 | 486 | 475 | 464 | 451 | 449 | **446** |

Lauf 7 (Alttext aus der Stammverkündung, `forward-from-publication`): Abschnitt 19; Lauf 8 (Reichweite): Abschnitt 20; Lauf 9
(Stand am Stichtag vorwärts, PDF-Textlayer): Abschnitt 21.

Von 475 auf 464: 4 neue Rezepte, 7 Normen nicht mehr `changed-after-baseline` (die Stichtagsklassifikation stuft Normen mit eigener
Fundstelle nach dem Stichtag seit Lauf 6 als `not-at-baseline` ein; 519 → 512). Gruppenverteilung, Gründe und jede offene Norm:
`data/audits/bayernrecht/RECONSTRUCTION.md`. Lauf 5 (die 72 offenen Fälle der Gruppen 1–3): Abschnitt 17; Lauf 6 (die 36 danach
offenen): Abschnitt 18.

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

**Lauf 6: parallele Änderungen.** Zwei Verkündungen können dieselbe vorangehende Änderung als „zuletzt geändert durch“ nennen, weil
sie in derselben Zeit entstanden (GesV: GVBl. 2024 S. 155 und S. 98 nennen beide S. 34). Nur der jüngere Verweis führt in die Kette;
die andere bliebe ein unerklärtes Ereignis (`chain-ledger-unexplained`). Sie wird als Schritt aufgenommen, wenn **alles** zutrifft:
Registerereignis `amend` mit Ausfertigungsdatum, die Verkündung liegt vor, sie enthält genau einen stark zugeordneten Befehlsblock für
die Norm, jeder Verweis ihres Einleitungssatzes zeigt auf einen Schritt oder Beleg der Kette, und ihr Inkrafttreten liegt ganz zwischen
Stichtag und Auswertungsstichtag. Eingeordnet wird nach Inkrafttreten (jüngstes zuerst), bei Gleichstand nach Verkündung; ändert das
die Reihenfolge der Verweiskette selbst, bleibt die Norm offen (`chain-parallel-order`). Beleg im Rezept: „Parallele Änderung … setzt wie
… auf … auf“. Alle übrigen Gegenproben (Inkrafttreten gegen `inkraft`, Rundlauf) gelten unverändert – bei der GesV scheitert die Kette
danach am Paket (`portal-in-force-mismatch`).

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
Netzabrufe** (358 Seiten, Ausgabenverzeichnisse und PDF, 15 belegt nicht vorhanden); **Lauf 5: 28 weitere**; **Lauf 6: 2 weitere**
(BayMBl. 2019 Nr. 516, 2021 Nr. 90; Prüfpunkt insgesamt 403).

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

Seit Lauf 6 toleriert, jeweils als `defects` am Befehl und im Rezeptschritt als `sourceDefect` vermerkt (Abschnitt 18.3): ein
doppeltes öffnendes Anführungszeichen am Zitatbeginn („„2.2.243.2“ – „„Abgrenzung …“, BayMBl. 2026 Nr. 296); ein nicht geschlossenes
Zitat, wenn das nächste Glied **derselben** Befehlsebene folgt (gleiches Element, gleiche Klasse, fortlaufendes Gliederungszeichen, kein
Anführungszeichen – „49. … „15.6 … hingewiesen.“ – „50. Die bisherige Nr. 15.6 …“, BayMBl. 2026 Nr. 72); eine übersprungene
Dezimalebene, deren Zeichen mit dem des übergeordneten Befehls beginnt („1.20“ – „1.20.1.1“, BayMBl. 2026 Nr. 183). **Staatsverträge**
werden ohne Fundstelle zitiert, mit Datum oder Zeitraum der Unterzeichnung („Der Rundfunkfinanzierungsstaatsvertrag vom 26. August bis
11. September 1996, zuletzt geändert durch …, wird wie folgt geändert:“, „… (Jugendmedienschutz-Staatsvertrag – JMStV) vom 10. bis
27. September 2002, …“); gelesen wird das nur, wenn vor „vom“ ein Vertrag oder Abkommen genannt ist, und als Datum zählt der Beginn der
Unterzeichnung. Nennt die „zuletzt geändert durch“-Klausel ihrerseits einen Vertrag ohne Fundstelle, ist die vorangehende Verkündung
nicht bestimmbar (`missing-base`/`prior-treaty-without-reference`).

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
der Norm selbst ist seit Lauf 6 ein eigener Ort („Überschrift der Norm“, Abschnitt 18.1); ohne den Kopf der Norm (Titelzustand)
scheitert ein Befehl daran weiter (`location-unresolved`).

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
Verkündung in den Ländern“ bleibt unbestimmt.

**Lauf 6: relatives Inkrafttreten** („am Tag nach der Verkündung“, „am ersten Tag des auf die Verkündung folgenden Monats“) wird nur
mit dem **Verkündungsdatum aus der Verkündung selbst** berechnet (`datedCommencement`): GVBl. aus der Bezeichnung des amtlichen PDF
(„2024/11 vom 14.06.2024“), BayMBl. aus der Kopfzeile „Veröffentlichung BayMBl. 2025 Nr. 486 vom 26.11.2025“ (`parsePublicationDocument`
→ `publishedAt`). Ein Datum des Registers muss ihm gleichen, sonst ist das Inkrafttreten widersprüchlich; fehlt das Datum der Verkündung,
bleibt es unbestimmt. Das Verkündungsdatum wird nie selbst zum Inkrafttreten – es ist Ausgangspunkt der Frist, und der Beleg im Rezept
nennt es mit Adresse („Verkündungsdatum 2025-11-26 laut Verkündung selbst (…)“). Für Vorgänger in der Kette gilt dasselbe: ein
Inkrafttreten ohne Kalenderdatum zählt nur mit diesem Datum. Im PDF-Textlayer zusätzlich lesbar: „Dieses Statut tritt am … in Kraft.“
(GVBl. 2007 S. 640). Ein Glied der obersten Befehlsebene des BayMBl. („2. Diese Bekanntmachung tritt …“,
`MBL1Listenebene`) steht nie in einem Zitat – ein weiter oben nicht geschlossenes Zitat verdeckt es nicht (BayMBl. 2025 Nr. 233).

## 9 Beginn der Stichtagsfassung

Belegt nur durch ein **Kalenderdatum** aus einer Inkrafttretensvorschrift – „am Tag nach der Verkündung“ zählt nicht:

- **letzte Änderung vor dem Stichtag:** ihre eigene Verkündung (HTML oder PDF-Textlayer, Abschnitt 4), für ihren Abschnitt;
- **Stammfassung:** die Inkrafttretensvorschrift im **rückgerechneten** Text; ausgeschlossen bleiben Neubekanntmachungen und bereinigte
  Fassungen (die Vorschrift des Stammgesetzes belegt nicht den Beginn dieser Fassung) und Normen, die ihre eigene Geltung unbestimmt
  begrenzen; ein ausdrückliches Außerkrafttreten nach dem Stichtag ist unschädlich. Seit Lauf 6 gilt ein offensichtlicher Tippfehler
  mit nur einer Lesart als gelesen und steht als Beleg im Rezept: „mir Wirkung vom 1. August 2022“ → „mit Wirkung vom“
  (`repairCommencementSentence`, BayMBl. 2022 Nr. 485); der Beleg zitiert den Satz, wie er in der Quelle steht.

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

**Seit Lauf 6: Überschrift der Norm.** Ein Rezept kann auch die Überschrift zurückrechnen (Abschnitt 18.1). Dann tragen einzelne
Schritte `"target": "title"` und das Rezept (v1 und v2) den Kopf heute und am Stichtag:

```jsonc
"title": {
  "current":  { "title": "Verordnung über die Gliederung der Staatlichen Archive Bayerns", "abbr": "ArchivGlV", "headingLine": "(ArchivGlV)" },
  "baseline": { "title": "Verordnung über die Gliederung der Staatlichen Archive Bayerns" }
}
```

`title`/`shortTitle`/`abbr` sind die Felder des `SourceLaw`; `headingLine` ist die erste Zeile des Kopfblocks `body[0]`, wenn sie die
Abkürzungszeile ist. Fehlt ein Feld im Stand, gibt es das Feld dort nicht. `recipeProblems` verlangt: Titelschritt ⇔ `title` vorhanden.

```ts
applyReverseRecipeToLaw(law, recipe)  // → Kopie von law (SourceLaw o. Ä. mit title, shortTitle?, abbr?, body) mit Stichtagskörper und
                                      //   Stichtagsüberschrift; übrige Felder unverändert; shortTitle/abbr fehlen, wenn am Stichtag keine
verifyRoundTripLaw(law, recipe)       // → { ok, detail }: wie verifyRoundTrip, prüft zusätzlich die Überschrift heute (= title.current),
                                      //   rückwärts (= title.baseline) und nach dem Forward-Replay
```

Für Rezepte ohne Titelschritt liefern beide dasselbe wie `applyReverseRecipe`/`verifyRoundTrip` (Körper; Kopffelder unverändert).
Rezepte **mit** Titelschritt lehnen die reinen Körperfunktionen ab (`verifyRoundTrip` → `ok: false`, „… applyReverseRecipeToLaw/
verifyRoundTripLaw verwenden“; `applyReverseRecipe` wirft `title-recipe`) – ein Bulk, der noch die Körperfunktionen ruft, schickt sie
also sicher in Review (`reconstruction-roundtrip-failed`). Einbau im Bulk (`bulk/norm.ts`, Rückrechnungszweig): `verifyRoundTrip(law.body,
recipe)` → `verifyRoundTripLaw(law, recipe)` und `{ ...law, body: applyReverseRecipe(law.body, recipe), … }` →
`{ ...applyReverseRecipeToLaw(law, recipe), … }`, jeweils mit demselben `law` wie bisher (`document.law`, gegebenenfalls nach den
Quellkorrekturen), also vor jeder Überleitung der Kopffelder; die Überschrift heute muss `title.current` gleichen, sonst Ablehnung. Nicht zurückgerechnet werden abgeleitete Angaben (Vollzitat, Kurzzitat, Slug,
Suchschlüssel aus der Abkürzung) – die leitet der Bulk aus den zurückgerechneten Feldern ab oder lässt sie, wie er entscheidet.

Der Bulk braucht: jüngste und älteste zurückgenommene Änderung (`recipeAmendments(recipe)[0]` / `.at(-1)`: `effectiveDate`,
`citation`, `url`, `sha256`), `baselineTextInForce` (Datum, Belege, `sources`) und alle Verkündungen (`recipeSources`). Gearbeitet
wird auf dem **bayerischen Quelltext** (vor der Überleitung). Ändert sich der Parser, ändern sich die Fingerabdrücke; dann ist die
Rückrechnung neu zu erzeugen (`reconstruction-queue --write`, sonst lehnt der Bulk mit `current-mismatch` ab). Abbildungsblöcke
(`figure`) werden in Replay und Vergleich unverändert durchgereicht.

**Seit Lauf 7: Alttext aus der Stammverkündung (`restoration`).** Schritte, deren Alttext nicht im Befehl steht, sondern aus der
Stammverkündung stammt, tragen `"restoredFrom": "<Fundstelle>"` und eine der Operationen `replace-text` (ein Feld: `before` am
Stichtag, `after` nach dem Befehl) oder `replace-blocks` (Glieder `before` ab `index` unter `parent` werden `after`; leer bei
Aufhebung). Das Rezept (v1 und v2) trägt dann den Beleg:

```jsonc
"restoration": {
  "method": "forward-from-publication",
  "sources": [                                                     // SHA-256 je Quelle; der Bulk prüft sie gegen seinen Cache
    { "role": "base-publication", "citation": "GVBl. 2013 S. 468", "url", "sha256", "retrievedAt", "publishedAt",
      "authority": "printed-official" | "electronic-official", "representation" },
    { "role": "prior-amendment", "citation": "GVBl. 2015 S. 243 (§ 2)", "url", "sha256", "effectiveDate", "section", "introIndex", … }
  ],
  "converter": "…",                          // baseline-only/html.ts CONVERTER_VERSION
  "pageTextSha256": "…",                     // normalisierter Seitentext der Stammverkündung
  "publicationFingerprint": "…",             // Blockmodell der Stammverkündung
  "stammfassungFingerprint": "…",            // nur mit Änderungen vor dem Stichtag: Stichtagskörper zurück bis zur Stammfassung
  "priorSteps": 1,
  "agreement": { "normalization": "…", "characters": 5282, "detail": "Wortlaut gleich (…)" },
  "restoredSteps": 1
}
```

Die Anwendung ist dieselbe reine Rechnung (Forward-Replay exakt, Fingerabdrücke). Weil der Stichtagstext aber Wortlaut **aus einer
weiteren Quelle** enthält, lehnen alle vier Anwendungsfunktionen ein solches Rezept ab, solange der Bulk nicht zusichert, dass er die
Quellen geprüft hat:

```ts
verifyRoundTripLaw(law, recipe, { restorationChecked: true })       // ohne Option: { ok: false, detail: "… restorationChecked …" }
applyReverseRecipeToLaw(law, recipe, { restorationChecked: true })  // ohne Option: wirft
verifyRoundTrip(body, recipe, { restorationChecked: true }), applyReverseRecipe(body, recipe, { restorationChecked: true })
recipeRestores(recipe)                                              // → true, wenn restoration oder ein Schritt mit restoredFrom
```

`restorationChecked` heißt: Jede Quelle aus `restoration.sources` liegt im Cache mit genau dieser SHA-256 (und wird wie die übrigen
Verkündungen archiviert). Ein Bulk ohne diese Prüfung schickt die 13 Rezepte also sicher in Review (`reconstruction-roundtrip-failed`),
die übrigen 48 laufen unverändert. `recipeProblems` verlangt: Schritt mit `restoredFrom` ⇔ `restoration`, jede `restoredFrom` in den
Quellen, nur `replace-text`/`replace-blocks`, eine `base-publication`, SHA-256 je Quelle, Zahl der Schritte stimmt. Liegt der Beginn
der Stichtagsfassung an einer relativen Regel der Stammfassung („am Tag nach der Verkündung“), steht die Stammverkündung zusätzlich in
`baselineTextInForce.sources` (Verkündungsdatum, wie sie es selbst druckt).

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
(heute, Zwischenstände, Stichtag), Ergebnis des Forward-Checks (neu berechnet aus Cache und Rezept) und der Quellenprüfung. Seit
Lauf 7 je Rezept mit `restoration` zusätzlich `restorationCheck`: Stammverkündung neu aufgelöst und umgesetzt (Fingerabdruck wie im
Rezept), Stichtagskörper aus dem Rezept, Änderungen vor dem Stichtag aus dem Cache zurück bis zur Stammfassung, Wortlautprobe
(`totals.restored`, `totals.restorationCheckPassed`: 13/13). Keine Laufzeitstempel: Zwei Läufe über denselben Stand ergeben
byte-gleiche Dateien (`--write` meldet dann „Unverändert“).

## 15 Vorwärtsrekonstruktion – als Rückrechnung mit Alttext aus der Stammverkündung (seit Lauf 7)

Eine reine Vorwärtsrekonstruktion (Stammverkündung umsetzen, alle Änderungen vorwärts anwenden, Ergebnis = Portal) scheitert an der
Abbildung: Das Blockmodell, das `baseline-only/html.ts` aus der Verkündung baut, gleicht dem Portal nur in etwa jedem fünften Glied
byte-genau (Satznummern, Gliedarten, Listenebenen, Absätze). Seit Lauf 7 wird der Weg deshalb **von hinten** gegangen (Abschnitt 19):
Das Portal bleibt der Körper, die Rücknahme setzt nur dort Text der Stammverkündung ein, wo der Befehl keinen Alttext trägt, und
bewiesen wird zweifach – das Forward-Replay ergibt byte-gleich den heutigen Portalkörper, und der ganze Stichtagskörper stimmt im
Wortlaut mit der Stammverkündung überein (bei Änderungen vor dem Stichtag erst nach deren Rücknahme bis zur Stammfassung). Wo die
Stammverkündung nicht digital als HTML vorliegt (PDF-Ausgaben bis 2009, Papier, Neubekanntmachungen), bleibt es bei den Gruppen
`missing-predecessor-text`, `full-recast`, `annex-replacement`, `table-replacement`, `image-replacement`.

## 16 Grenzen

| Grenze | Folge |
| --- | --- |
| Neufassung, Aufhebung, Streichung ohne Anker tragen keinen Alttext | größte Gruppe (`missing-predecessor-text`); seit Lauf 7 lösbar, wenn die Stammverkündung als HTML vorliegt und die Kette bis zu ihr reicht (Abschnitt 19) |
| PDF nur mit eindeutigen Grenzen (Titelzusatz, Unterschrift, eine Regel) und ohne OCR-Layer | sonst Review |
| Vorgänger auf Nicht-Plattform-Blättern (AllMBl., KWMBl., JMBl., BGBl.) | `prior-source-not-on-platform` |
| Einfügen „vor“ einem Glied bei gleichzeitiger Umnummerierung, „Der Wortlaut wird Buchst. a“, Umbenennung von Gliederungsebenen | nicht angewandt |
| Kopfzeilen-, Spaltenorte ohne Zeilenschlüssel, Tabellenzeilen einfügen, mehrzellige Wortlaute | nicht auflösbar |
| Teils später in Kraft tretende Änderung (ein Teil erst nach dem Auswertungsstichtag) | `chain-partially-in-force`; bräuchte eine Teilrücknahme mit Nachweis, dass der spätere Teil im heutigen Text fehlt |
| Reihenfolge von Inkrafttreten gegen Verkündung (älter verkündet, später in Kraft) | `chain-commencement-order` |
| Titeländerung der Norm selbst | seit Lauf 6 rückrechenbar, wenn sich die geänderte Überschrift eindeutig auf Titelzeile und Abkürzungszeile verteilen lässt (Abschnitt 18.1); sonst `ambiguous-target` |

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
- **Titel der Norm** (Metadatum, nicht im Körper): `BayArchivGl`, `BayLFBPO` (Lauf 6: gelöst, Abschnitt 18.1).
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

## 18 Lauf 6: die 36 danach offenen Fälle der Gruppen 1–3

Ausgangspunkt (Stand nach Lauf 5): 44 Rezepte, 475 `reconstruction-required`; in den Gruppen 1–3 **36** offene Normen (80 Einträge
minus 44 Rezepte; 23 mit einer, 6 mit zwei, 7 mit drei und mehr Änderungen). Schwerpunkte des Auftrags: relatives Inkrafttreten,
Titeländerungen, nicht lesbare Befehlsblöcke und Satz-/Quellfehler, Staatsverträge. Während des Laufs hat die Stichtagsklassifikation
7 Normen auf `not-at-baseline` gesetzt (eigene Fundstelle nach dem Stichtag: `BayVV_787_L_14168`, `BayVV_7071_W_14190`,
`BayVV_7071_W_14191`, `BayVV_7523_W_14172`, `BayVV_97_B_14197`, `BayVV_2230_1_1_1_0_K_14216`, `BayVV_2330_B_14207`); sie stehen nicht
mehr in der Schlange. Das Ereignisregister wurde parallel neu gebaut (3 072 Ereignisse); 12 bestehende Rezepte tragen danach die neuen
`eventId`s, jede `eventId` aller 48 Rezepte steht im Register.

Ergebnis: **48 Rezepte** (39 einstufig, 9 mehrstufig), **464** `reconstruction-required`. Von den 36:

| | Normen |
| --- | ---: |
| **gelöst** (Rezept, Rundlauf exakt, Forward-Replay) | **4** (2 v1, 2 v2) |
| jetzt vollständig gelesen, dadurch in einer anderen Gruppe | 11 |
| bleiben in den Gruppen 1–3, mit benanntem Grund | 21 |

Netz: 2 Abrufe über `createBayernRechtFetcher` (BayMBl. 2019 Nr. 516, 2021 Nr. 90 – beide ergeben einen nicht umkehrbaren Befehl);
Prüfpunkt 403. Bulk-Probelauf (`bulk --only …` ohne `--write`): `BayUIG` und `BayVV_2235_1_1_5_K_13224` würden übernommen; `BayArchivGl`
und `BayLFBPO` gehen in Review (`reconstruction-roundtrip-failed`), solange der Bulk die reinen Körperfunktionen ruft – das ist die
vorgesehene sichere Ablehnung von Titelrezepten bis zum Einbau von `verifyRoundTripLaw`/`applyReverseRecipeToLaw` (Abschnitt 11).

### 18.1 Überschrift der Norm (`title.ts`, Operation `target: "title"`)

Die Verkündung meint mit „Überschrift“ die Titelzeile samt Abkürzungszeile („Verordnung über die Gliederung der Staatlichen Archive
Bayerns (ArchivGlV)“). Das Portal führt sie getrennt: `title` im Kopf, die Abkürzungszeile als erste Zeile des Kopfblocks `body[0]`,
`abbr`/`shortTitle` als Felder. Als Abkürzungszeile gilt die erste Kopfzeile nur, wenn sie ganz geklammert ist und Abkürzung oder
Kurzbezeichnung trägt (`titleState`). Ein Titelschritt wendet die bekannten Wortlautoperationen (anfügen, ersetzen, einfügen, streichen
mit Anker) auf die zusammengesetzte Überschrift an und verteilt das Ergebnis zurück (`projectTitle`) – **nur eindeutig**:

- Änderung nur in der Titelzeile (Abkürzungszeile unverändert am Ende) → `title`;
- Abkürzungszeile „(ABK)“ entfällt ganz, und sie ist genau die Abkürzung einer Norm ohne Kurzbezeichnung → `abbr` und Kopfzeile entfallen;
- angefügte „(ABK)“ an eine Norm ohne Abkürzung und Kurzbezeichnung, ohne Gedankenstrich darin → `abbr` und Kopfzeile neu;
- alles andere (Änderung innerhalb der Abkürzungszeile, Wegfall einer Zeile mit Kurzbezeichnung, Überschrift auf „)“ ohne klare
  Trennung) scheitert (`ambiguous-target`).

Rückwärts wird die Kopfzeile im Körper mitgeführt (`applyTitleToBody`); Fingerabdrücke und Rundlauf gelten wie bisher für den Körper,
dazu wird die Überschrift heute, am Stichtag und nach dem Forward-Replay verglichen. Gelöst: `BayArchivGl` (GVBl. 2026 S. 61: „Der
Überschrift wird die Angabe „(ArchivGlV)“ angefügt.“ – am Stichtag ohne Abkürzung und ohne Kopfzeile „(ArchivGlV)“), `BayLFBPO` (GVBl.
2024 S. 98: „In der Überschrift und in § 2 Abs. 5 werden die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“
ersetzt.“). Dafür neu gelesen: **aufgezählte Orte mit eigener Präposition** („In der Überschrift und in § 2 Abs. 5 …“, „… und im
…“, „… sowie in …“) sind je ein Ort ohne „jeweils“; ohne zweite Präposition („In der Überschrift und § 2 Abs. 5“) bleibt „jeweils“
verlangt.

### 18.2 Relatives Inkrafttreten

Umgesetzt wie in Abschnitt 8 beschrieben: nur mit dem Verkündungsdatum der Verkündung selbst, Register muss übereinstimmen. Keiner der
36 Fälle hing allein daran; der vorhandene Fall `BayVwV101445` (BayMBl. 2026 Nr. 167, „am Tag nach ihrer Bekanntmachung“) trägt jetzt
den Beleg „Verkündungsdatum 2026-04-29 laut Verkündung selbst“. `SiTechZStV` („am Tag nach der letzten Verkündung in den Ländern“)
bleibt unbestimmt – das Datum hängt an Verkündungen anderer Länder. Neu im PDF-Textlayer: „Dieses Statut tritt am … in Kraft.“ (GVBl.
2007 S. 640, ein Vorgänger in der Kette des Ordensstatuts `BayMaxOStat`; die Norm scheitert an einer Neufassung, GVBl. 2026 S. 538).

### 18.3 Satz- und Quellfehler

Toleriert nur, wo das Ergebnis eindeutig ist, und immer im Rezept vermerkt:

- **Portaltext ohne den Schlusspunkt eines angefügten Satzes** (`BayUIG` Art. 2 Abs. 1: GVBl. 2024 S. 605 fügt „²Der Oberste
  Rechnungshof ist … keine informationspflichtige Stelle.“ an, das Portal führt den Satz ohne Punkt). Die Rücknahme entfernt das
  Schlussglied, wenn sein Text dem angefügten Satz gleicht oder ihm ohne den Schlusspunkt gleicht; sonst nicht. Schritt mit
  `sourceDefect`: „Portaltext ohne den Schlusspunkt des angefügten Satzes (…); das Glied wird wörtlich wie im Portal behandelt“. Vorwärts
  entsteht genau der Portaltext.
- **Befehlsblöcke**: doppeltes öffnendes Anführungszeichen, nicht geschlossenes Zitat vor dem nächsten Befehl derselben Ebene,
  übersprungene Dezimalebene (Abschnitt 5). Damit sind BayMBl. 2026 Nr. 72, 183 und 296 lesbar; die Normen dahinter scheitern danach
  an nicht umkehrbaren Befehlen (`BayVV_7801_L_13600`: Neufassungen; `BayVV_61_02_03_01_F_13270`: Ort „Beispiel 1“; die
  Abmarkungsbekanntmachung `BayVwV151525`: Vorgänger im FMBl.).
- **„mir Wirkung vom“** in der Inkrafttretensregel der Stammfassung (`BayVV_2235_1_1_5_K_13224`, Abschnitt 9) – gelöst; der Beginn
  „für das neunjährige Gymnasium“ entspricht dem Geltungsbereich der Norm (Titel „… (neunjähriges Gymnasium)“), die Regel ist die einzige.

### 18.4 Staatsverträge

Die Einleitungssätze sind jetzt lesbar (Abschnitt 5) und den Verträgen eindeutig zugeordnet (Titel, Abkürzung, Datum der Unterzeichnung;
ZDF- und ARD-Staatsvertrag vom selben Tag werden über den Artikel des Verweises getrennt). Kein Vertrag wird dadurch rückrechenbar: Die
„zuletzt geändert durch“-Klausel nennt jeweils einen Änderungsstaatsvertrag **ohne Fundstelle** („den Vierten
Medienänderungsstaatsvertrag vom 9. bis 16. Mai 2023“; beim Rundfunkfinanzierungsstaatsvertrag steht dort wörtlich „…“), die
vorangehende Verkündung ist so nicht bestimmbar (`prior-treaty-without-reference`), und jeder Vertrag enthält zudem Neufassungen. Sie
stehen jetzt in `missing-predecessor-text` (`ARDStV` als Gesamtneufassung in `full-recast`).

### 18.5 Parallele Änderungen

Umgesetzt wie in Abschnitt 3 beschrieben. `BayGesV`: Die Kette ist mit GVBl. 2024 S. 98 vollständig (S. 301 ← S. 155 ‖ S. 98 ← S. 34,
Belege S. 154, S. 182, S. 224), scheitert aber am Paket – es nennt den 1. Januar 2026 als Beginn des heutigen Textes, die jüngste
Änderung GVBl. 2026 S. 301 tritt am 16. Juni 2026 in Kraft (`contradictory-evidence`). Ebenso jetzt dort: `BayUeDPO` (vorher
`missing-predecessor-text`).

### 18.6 Je Norm

Vorher = Stand nach Lauf 5; nachher = dieser Lauf. Gruppen: 1/2/3+ = eine/zwei/drei und mehr Änderungen, Alttext =
`missing-predecessor-text`.

| Norm | vorher | nachher | Befund |
| --- | --- | --- | --- |
| `BayArchivGl` | 1: `ambiguous-target/reverse-location-unresolved` | **Rezept v1** | 7 Schritt(e) aus GVBl. 2026 S. 61, in Kraft 2025-12-15; Rundlauf exakt |
| `BayVV_2235_1_1_5_K_13224` | 1: `partial-chain/baseline-text-in-force-unproven` | **Rezept v1** | 2 Schritt(e) aus BayMBl. 2024 Nr. 442, in Kraft 2024-08-01; Rundlauf exakt |
| `BayLFBPO` | 2: `unsupported-formula/replace-words` | **Rezept v2** | 9 Schritt(e) aus GVBl. 2026 S. 487 ← GVBl. 2024 S. 98, in Kraft 2026-09-01; Rundlauf exakt |
| `BayUIG` | 2: `round-trip-failed/reverse-target-not-found` | **Rezept v2** | 4 Schritt(e) aus GVBl. 2026 S. 113 ← GVBl. 2024 S. 605, in Kraft 2026-04-01; Rundlauf exakt |
| `ARDStV` | 1: `command-unreadable/chain-block-not-found` | Neufassung: `missing-base/prior-treaty-without-reference` | Die vorangehende Änderung „den Staatsvertrag zur Modernisierung der Medienordnung in Deutschland vom 14. bis 28. April 2020“ ist ohne Fundstelle zitiert (Staatsvertrag); ihre Verkündung ist so nicht bestimmt |
| `BayDLR_StV` | 1: `command-unreadable/chain-block-not-found` | Alttext: `missing-base/prior-treaty-without-reference` | Die vorangehende Änderung „den Vierten Medienänderungsstaatsvertrag vom 9. bis 16. Mai 2023“ ist ohne Fundstelle zitiert (Staatsvertrag); ihre Verkündung ist so nicht bestimmt |
| `BayVV_61_02_03_01_F_13270` | 1: `command-unreadable/chain-block-not-found` | Alttext: `command-unreadable/location-unreadable` | BayMBl. 2026 Nr. 296 (§ 1): Ortsangabe „Beispiel 1“ nicht lesbar (8. a)) |
| `BayVV_7801_L_13600` | 1: `command-unreadable/chain-block-not-found` | Alttext: `non-invertible-amendment/recast` | BayMBl. 2026 Nr. 183 (Nr. 1): 1.4 „Nr. 1.3.4 Satz 3 erhält folgende neue Fassung:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVwV151525` | 1: `command-unreadable/chain-block-not-found` | Tabelle: `missing-base/prior-source-not-on-platform` | Die genannte Änderung „vom 18. Oktober 2017 (FMBl. S. 516)“ ist nicht im GVBl. oder BayMBl. verkündet; ihre Verkündung ist auf der Verkündungsplattform nicht abrufbar |
| `JMStV` | 1: `command-unreadable/chain-block-not-found` | Alttext: `missing-base/prior-treaty-without-reference` | Die vorangehende Änderung „den Fünften Medienänderungsstaatsvertrag vom 27. Februar bis 7. März 2024“ ist ohne Fundstelle zitiert (Staatsvertrag); ihre Verkündung ist so nicht bestimmt |
| `RFinStV` | 1: `command-unreadable/chain-block-not-found` | Alttext: `missing-base/prior-treaty-without-reference` | Die vorangehende Änderung „…“ ist ohne Fundstelle zitiert (Staatsvertrag); ihre Verkündung ist so nicht bestimmt |
| `ZDF_StV` | 1: `command-unreadable/chain-block-not-found` | Alttext: `missing-base/prior-treaty-without-reference` | Die vorangehende Änderung „den Vierten Medienänderungsstaatsvertrag vom 9. bis 16. Mai 2023“ ist ohne Fundstelle zitiert (Staatsvertrag); ihre Verkündung ist so nicht bestimmt |
| `SiTechZStV` | 2: `effective-date-undetermined/commencement-unreadable` | Alttext: `effective-date-undetermined/commencement-unreadable` | GVBl. 2025 S. 705 (§ 1): Inkrafttretensvorschrift nicht lesbar: „Dieses Abkommen tritt am Tag nach der letzten Verkündung in den Ländern in Kraft.“ |
| `BayGesV` | 3+: `partial-chain/chain-ledger-unexplained` | Widerspruch: `contradictory/portal-in-force-mismatch` | Der heutige Text gilt laut Paket seit 2026-01-01, die jüngste Änderung GVBl. 2026 S. 301 tritt am 2026-06-16 in Kraft |
| `MStV` | 3+: `command-unreadable/chain-block-not-found` | Alttext: `missing-base/prior-treaty-without-reference` | Die vorangehende Änderung „den Fünften Medienänderungsstaatsvertrag vom 27. Februar bis 6. März 2024“ ist ohne Fundstelle zitiert (Staatsvertrag); ihre Verkündung ist so nicht bestimmt |
| `BayEBekMiZi` | 1: `unsupported-formula/insert-unit` | 1: `unsupported-formula/insert-unit` | BayMBl. 2024 Nr. 666 (Nr. 1): 1.2 1.2.1 „Dem Inhaltsverzeichnis zu Nr. XVII. wird folgende Angabe angefügt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Modell nicht angewa… |
| `BayHG2021` | 1: `partial-chain/baseline-text-in-force-unproven` | 1: `partial-chain/baseline-text-in-force-unproven` | Beginn der Stichtagsfassung (Stammfassung) nicht belegt: Die Norm begrenzt ihre eigene Geltung („gelten bis zum Tag der Bekanntmachung des Haushaltsgesetzes des folgenden Haushaltsjahres weiter“); ob sie am Stichtag galt, ist eine… |
| `BayNatWaldV` | 1: `ambiguous-target/reverse-target-ambiguous` | 1: `ambiguous-target/reverse-target-ambiguous` | GVBl. 2024 S. 98 (§ 1):  § 7 Abs. 1 Satz 2: neuer Wortlaut „, Forsten und Tourismus“ kommt im Bereich 2-mal vor (erwartet: genau einmal) |
| `BayVV_2025_I_11358` | 1: `unsupported-formula/unrecognized` | 1: `unsupported-formula/unrecognized` | BayMBl. 2025 Nr. 318 (Nr. 1): 1.3 1.3.2 „In Fußnote 4 zu § 9 wird das Wort „Zustellung“ durch das Wort „Bekanntgabe“ ersetzt.“: Ortsangabe nicht lesbar: „Fußnote 4 zu § 9“ |
| `BayVV_2154_I_2270` | 1: `partial-chain/chain-partially-in-force` | 1: `partial-chain/chain-partially-in-force` | BayMBl. 2026 Nr. 80 (Nr. 1) tritt teils bis, teils erst nach dem Auswertungsstichtag in Kraft (2026-02-28, 2027-01-01); der heutige Text enthält nur einen Teil der Änderung |
| `BayVV_2230_7_UK_459` | 1: `unsupported-formula/unrecognized` | 1: `unsupported-formula/unrecognized` | BayMBl. 2025 Nr. 145 (Nr. 1): 1.1 „In der Kopfzeile der Tabelle wird das Wort „Kommunaler“ gestrichen.“: Ortsangabe nicht lesbar: „der Kopfzeile der Tabelle“ |
| `BayVV_2232_2_K_11648` | 1: `unsupported-formula/unrecognized` | 1: `unsupported-formula/unrecognized` | BayMBl. 2026 Nr. 271 (Nr. 1): 1.1 „In Anlage 5 wird in der Kopfzeile die Angabe „Jahrgangsstufen 3 und 4“ durch die Angabe „Jahrgangsstufe 3“ ersetzt.“: Klausel nicht erkannt: „wird in der Kopfzeile die Angabe ⟦0⟧ durch die Angabe… |
| `BayVV_2235_1_1_1_UK_231` | 1: `round-trip-failed/reverse-target-not-found` | 1: `round-trip-failed/reverse-target-not-found` | BayMBl. 2024 Nr. 72 (Nr. 1):  Nr. 6: neuer Wortlaut „Oberbayern, Schwaben: StD Johann Forster, Max-Planck-Gymnasium München“ kommt im Bereich 0-mal vor (erwartet: genau einmal) |
| `BayVV_301_I_2284` | 1: `unsupported-formula/insert-unit` | 1: `unsupported-formula/insert-unit` | BayMBl. 2024 Nr. 484 (Nr. 1): 1.2 1.2.1 1.2.1.3 „Folgender Spiegelstrich 7 wird angefügt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Modell nicht angewandt |
| `BayVV_3122_2_7_J_063` | 1: `missing-base/no-post-baseline-event` | 1: `missing-base/no-post-baseline-event` | Weder ein Vollzitat mit letzter Änderung noch ein Ereignis nach dem Stichtag: die Kette ist unbekannt |
| `BayVV_7803_2_L_10836` | 1: `command-unreadable/location-unreadable` | 1: `command-unreadable/location-unreadable` | BayMBl. 2025 Nr. 37 (Nr. 1): Ortsangabe „Nr. 3.1 Tabellenspalte 2“ nicht lesbar (1.2) |
| `BayVV_913_B_11939` | 1: `effective-date-undetermined/commencement-unreadable` | 1: `effective-date-undetermined/commencement-unreadable` | BayMBl. 2026 Nr. 354: Keine Grundregel zum Inkrafttreten gefunden |
| `BayVwV270888` | 1: `missing-base/prior-source-not-on-platform` | 1: `missing-base/prior-source-not-on-platform` | Die genannte Änderung „vom 6. Juni 2018 (AllMBl. S. 419)“ ist nicht im GVBl. oder BayMBl. verkündet; ihre Verkündung ist auf der Verkündungsplattform nicht abrufbar |
| `BayHG2022` | 2: `partial-chain/chain-ledger-unexplained` | 2: `partial-chain/chain-ledger-unexplained` | Das Register führt GVBl. 2026 S. 567 (notice) für die Norm; die Kette der amtlichen Verweise enthält diese Veröffentlichung nicht |
| `BayVV_2210_4_WK_14107` | 2: `unsupported-formula/unrecognized` | 2: `unsupported-formula/unrecognized` | BayMBl. 2024 Nr. 438 (Nr. 1): 1.1 „In Nr. 1 wird nach Satz 5 die Nr. 1.1 eingefügt. Die bisherigen Sätze 6 und 7 der Nr. 1 werden die Sätze 1 und 2 der Nr. 1.1.“: Mehrere Sätze in einem Befehl; der Ortsbezug der Folgesätze ist nic… |
| `BayVwV246099` | 2: `command-unreadable/location-unreadable` | 2: `command-unreadable/location-unreadable` | BayMBl. 2025 Nr. 467 (Nr. 1): Ortsangabe „Anhang“ nicht lesbar (1.2) |
| `BayAAV` | 3+: `partial-chain/chain-ledger-unexplained` | 3+: `partial-chain/chain-ledger-unexplained` | Das Register führt GVBl. 2023 S. 659 (notice), GVBl. 2024 S. 163 (notice) für die Norm; die Kette der amtlichen Verweise enthält diese Veröffentlichungen nicht |
| `BayGDVG` | 3+: `unsupported-formula/unrecognized` | 3+: `unsupported-formula/unrecognized` | GVBl. 2024 S. 630 (§ 1): 1. „Der Erste Teil wird Teil 1.“: Befehlsrest ohne Schlussverb: „der Erste Teil wird Teil 1“ |
| `BayGGebO` | 3+: `unsupported-formula/renumber` | 3+: `unsupported-formula/renumber` | GVBl. 2026 S. 151 (§ 2): 1. a) „Der Wortlaut wird Buchst. a und die Angabe „ ; “ am Ende wird durch die Angabe „ , “ ersetzt.“: Umnummerierung: strukturelle Änderung, von diesem Modell nicht angewandt |
| `BayVV_2033_6_F_10463` | 3+: `unsupported-formula/insert-unit` | 3+: `unsupported-formula/insert-unit` | BayMBl. 2026 Nr. 58 (§ 1): 2. „In Buchst. a wird der Tabelle folgende Angabe angefügt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Modell nicht angewandt |
| `BayVwV154422` | 3+: `missing-base/prior-source-unavailable` | 3+: `missing-base/prior-source-unavailable` | Verkündung von „vom 19. März 2024 (BayMBl. Nr. 156)“ nicht verfügbar: keine Seite trägt das Ausfertigungsdatum 2024-03-19 (https://www.verkuendung-bayern.de/baymbl/2024-156/) |

## 19 Lauf 7: Alttext aus der Stammverkündung (`forward-from-publication`)

Ausgangspunkt (Stand nach Lauf 6): 48 Rezepte, 464 `reconstruction-required`, davon 21 offene Normen in den Gruppen 1–3 und 295 in
`missing-predecessor-text`. Auftrag: Normen, deren Rücknahme an Neufassung, Aufhebung oder Streichung ohne Anker scheitert, aus der
Stammverkündung ergänzen – mit derselben Sicherheit wie bisher (Quellen mit SHA-256, Fingerabdrücke, exakter Rundlauf).

Ergebnis: **61 Rezepte** (50 v1, 11 v2), **451** `reconstruction-required`.

| Rezepte nach Methode | vorher | nachher |
| --- | ---: | ---: |
| reine Rückrechnung (Alttext im Befehl) | 48 | 48 |
| Rückrechnung mit Alttext aus der Stammverkündung (`restoration`) | – | **13** (11 v1, 2 v2; 2 mit Änderungen vor dem Stichtag) |
| zusammen | 48 | **61** |

Die 13 kommen alle aus `missing-predecessor-text` (10 Neufassung, 2 Aufhebung, 1 Streichung ohne Anker als maßgeblicher Grund
vorher). Von den 21 offenen Normen der Gruppen 1–3 ist keine gelöst: Ihre Gründe liegen nicht am Alttext (Tabellenkopf, Fußnote,
Spaltenort, teils späteres Inkrafttreten, Registernotizen ohne Verweis, Vorgänger auf Nicht-Plattform-Blättern, mehrdeutige Stelle;
Abschnitt 18.6); drei sind einen Befehl weiter gelesen (`BayVV_301_I_2284`, `BayVV_2210_4_WK_14107`: jetzt Ort nicht gefunden;
`BayVV_2033_6_F_10463`: jetzt `missing-predecessor-text`, Portalgestalt einer Tabelle nicht belegt). Netz: 319 Abrufe über
`createBayernRechtFetcher` (Prüfpunkt 403 → 722), alle für Stammverkündungen und Änderungen vor dem Stichtag; `--fetch --offline` meldet
danach keine fehlende Quelle.

### 19.1 Verfahren

1. **Stammverkündung** (`publication.ts`, `loadPublicationBase`): aufgelöst über die Plattform von `baseline-only` (`resolveBase`,
   nur Cache), nur digital und amtlich als HTML (GVBl.-Detailseiten, BayMBl., Amtsblätter 2009–2018). Nicht bei Normen in der Fassung
   einer Neubekanntmachung (`versionDate` ≠ Ausfertigungsdatum), nicht bei PDF oder Papier. Umgesetzt mit `convertGazetteHtml`
   (`baseline-only/html.ts`, `CONVERTER_VERSION` im Rezept); GVBl.-Seiten werden gegliedert (`nestLaw`: Teil → `part`, Kapitel →
   `chapter`, Abschnitt → `section`; § und Art. mit Überschrift, auch in zwei Absätzen; Absätze „(n)“ als `subparagraph`; Aufzählungen
   mit `level`; die Inhaltsübersicht entfällt bis vor die Wiederholung ihres ersten Eintrags; Schluss an der Unterschrift). Das
   Verkündungsdatum gilt nur, wie die Seite es selbst druckt (`ownPublicationDate`, `baseline-only/relative.ts`).
2. **Kette bis zur Stammfassung** (`walk.ts`, `deep`): Liegt die Stammverkündung vor und ist die Stichtagsfassung nicht die
   Stammfassung, werden auch die Änderungen **vor** dem Stichtag gelesen (Vollzitat, je Glied der Kette ein Befehlsblock); ihre Liste muss
   mit Änderungsverlauf und Fortführungsnachweis übereinstimmen (`prior-list-mismatch`), jeder Befehlsblock lesbar sein
   (`prior-block-missing`), jede Verkündung auf der Plattform liegen (`prior-source-not-on-platform`).
3. **Rücknahme** wie bisher, jüngste Änderung zuerst; nur Befehle ohne Alttext holen ihn aus der Stammverkündung (`restore.ts`):
   | Befehl | Alttext | Operation |
   | --- | --- | --- |
   | Satz neu gefasst („Satz 3 wird wie folgt gefasst:“, auch „durch folgende Sätze … ersetzt“) | das Feld der Verkündung, aus dem durch Ersetzen genau dieser Sätze zeichengleich das heutige Feld wird | `replace-text` |
   | Satz aufgehoben / gestrichen | Feld mit genau diesen Sätzen; sonst über den Nachbarsatz | `replace-text` |
   | Wörter gestrichen ohne Anker | Feld, aus dem durch das Streichen das heutige wird; trägt das Feld weitere Änderungen derselben Verkündung, über den umgebenden Wortlaut (40 Zeichen je Seite, genau eine Fundstelle) | `replace-text` |
   | Glied neu gefasst / aufgehoben („Nr. 3.6 wird aufgehoben“, „Die Abs. 3 bis 5 …“) | die Glieder der Verkündung, aufeinanderfolgend unter einem Eltern-Glied; neu gefasst nur, wenn das heutige Glied wörtlich das Zitat ist; aufgehoben an der Stelle hinter dem Nachbarglied. Hat derselbe Befehlsblock umnummeriert („Die bisherige Nr. 3.7 wird Nr. 3.6“), führt der Kontext nicht mehr zum Eltern-Glied: dann über die Bezeichnungen der Vorfahren | `replace-blocks` |
   | Vorbemerkung / Präambel / Einleitungsformel neu gefasst | die unbezeichneten Textglieder am Anfang | `replace-blocks` |
   | **Rückfall** (nur Änderungen nach dem Stichtag): Befehl nicht lesbar oder nicht umkehrbar | das ganze Glied, das er ändert, aus der Stammverkündung; weitere Befehle an diesem Glied gehen darin auf; scheitert die Rücknahme erst bei der Ausführung, wird der Befehl in einem zweiten Versuch in den Rückfall genommen | `replace-blocks` („ganzes Glied aus der Stammverkündung“) |
4. **Portalgestalt** eines Glieds aus der Verkündung, in dieser Reihenfolge: (a) unverändert, wenn Geschwisterglieder in Verkündung und
   Portal dieselbe Darstellung tragen (kanonisches JSON gleich) und keine andere Knotenart vorkommt; (b) nach einem gleich gestalteten
   Geschwisterglied mit gleichem Wortlaut; (c) Zuordnung der Knotenarten aus den Geschwistern (`same`, Text als erstes Kind `child`,
   Text als Überschrift `title`); (d) dieselbe Zuordnung aus der **ganzen Norm** (Stammverkündung ↔ heutiger Portalkörper, Zuordnung über
   die Bezeichnungen; je Knotenart: Typ, belegte Felder, Attribute, Art der Bezeichnung, Typ des Eltern-Glieds; widersprüchlich belegte
   Arten gesperrt); (e) **Konvention des Amtsblatts** (`formConventions`, über alle Normen der Schlange mit Stammverkündung): eine
   Knotenart, die in mindestens 5 Normen genau eine Darstellung hat, in keiner eine andere und in höchstens jeder zehnten ein unerklärtes
   Paar. Wo (e) greift, sagt es der Ort des Schritts („Portalgestalt nach Konvention des Amtsblatts: subparagraph>item (44 Normen)“ –
   einmal, `BayTNAV`). Die Gestalt ist nicht Teil der Wortlautprobe; sie ist nach (a)–(e) belegt, nicht bewiesen.
5. **Beweis**, alles Pflicht: (i) Forward-Replay je Änderung und über das Rezept ergibt **byte-gleich** den heutigen Portalkörper;
   (ii) **Wortlautprobe**: Der ganze Stichtagskörper (ohne Kopf, Fundstellen und Schlussformel) gleicht im Wortlaut der Stammverkündung
   (ohne Unterschrift) – vereinheitlicht werden nur Anführungszeichen, Striche, Satznummern (das Portal setzt sie auch, wo die
   Verkündung keine druckt; Fußnotenzeichen „¹⁾“ bleiben), ein Trennstrich der Zeilentrennung vor Kleinbuchstaben („Lern- ergebnisse“;
   nicht vor und/oder/bzw./sowie/als/bis/wie) und Leerraum; steht die Unterschrift in der Verkündung als letzter Absatz, ist genau dieser
   Überhang kein Unterschied; (iii) mit Änderungen vor dem Stichtag gilt (ii) erst nach deren Rücknahme bis zur Stammfassung
   (`proveRestoration`, ohne Rückfall), Fingerabdruck der Stammfassung im Rezept; (iv) `verifyRoundTripLaw(law, recipe, {
   restorationChecked: true })`; (v) das Audit rechnet (ii)/(iii) aus dem Cache nach (13/13).

Die Wortlautprobe hat in diesem Lauf 10 Normen abgewiesen, jede an einer echten Abweichung: sechs Fehler oder redaktionelle Eingriffe
des Portals (`BayeAktVV` „durch des Gesetzes“ statt „durch Art. 3 des Gesetzes“, `BayVwV312206` „am näherliegenden“,
`BayVV_2173_A_11662` doppelte Zeile, `BayGrStG` Formel, `BayZAPOFI` „Anonymitätsprinzip“ statt „-prinzips“, `BayVV_2010_K_13179`
„https://“ vor der Adresse), zwei nicht erklärte Textänderungen vor dem Stichtag (`BayLaborV` „§ 4 Abs. 3“ statt „§ 3 Abs. 2 Nr. 1“,
`BayVV_2034_4_U_13020` Name einer Verordnung), `BayStudAkkV` („System-akkreditierung“ in der Verkündung) und `BayVV_787_L_13877` (die
Verkündung setzt einen Satz hinter die Aufzählung, den das Portal im Spiegelstrich führt – der Rückfall auf den Spiegelstrich deckt ihn
nicht).

### 19.2 Neu in `reconstruction/`

| Modul | Inhalt |
| --- | --- |
| `publication.ts` (neu) | `loadPublicationBase`, `publicationBaseFromHtml`, `nestLaw`, `cachePlatform`, `proveRestoration`, `PriorAmendment` |
| `restore.ts` (neu) | `restoreRequest`, `realizeRestore`, `restoreUnit`, `unitFor`, `commandUnitPath`, Portalgestalt (`portalForm`, `learnedForm`, `formConventions`, `learnedForms`), `wordingAgreement`, `TYPOGRAPHY_NORMALIZATION` |
| `structural.ts` | Operationen `replace-text`, `replace-blocks` (Alttext), `unnumber-sentences` („In Satz 1 wird die Satznummerierung „¹“ gestrichen.“, auch mit weiterem Befehl); Aufzählungsrahmen auch in BayMBl.-Gestalt (Text vor der Aufzählung als eigener Absatz, Aufzählung als Geschwister); Einfügen ohne Anker („Es wird folgende neue Nr. 3.6 eingefügt:“, „Es wird folgender neuer Satz 4 eingefügt:“ – die Nummer nennt die Stelle), „nach Satz 2 folgender Satz 3 angefügt“ |
| `formulas.ts`, `location.ts` | Befehlsformen: zweite Ortsangabe hinter dem Verb („In der Präambel wird in Satz 1 …“), „In der neuen Nr. 8 …“ / „Im neuen Satz 4 …“, „In Spiegelstrich 5 wird Satz 3 aufgehoben“, „gelöscht“ = „gestrichen“, „am Ende des Satzes“, Neufassungs-/Aufhebungsformen für den Alttext |
| `steps.ts` | Rücknahme mit `RestoreOptions { base, fallback, forced }`; Rückfall auf ganze Glieder |
| `walk.ts` | `deep`: Kette bis zur Stammfassung (`prior`, `priorFailure`) |
| `recipe.ts`, `apply.ts` | `restoration` (v1/v2), `restoredFrom` je Schritt, `recipeRestores`; Anwendung nur mit `{ restorationChecked: true }` (Abschnitt 11) |
| `run.ts`, `audit.ts`, `register.ts`, `report.ts` | Konventionen je Lauf (`portalConventions`, unabhängig von `--only`), Probe, Beleg, Nachrechnung im Audit, Quellen `restoration-base`/`restoration-prior` im Register; je offene Norm `restorationBase` in der Schlange und im Bericht |

Übernommen aus `baseline-only` (Agent B) in `parseCommand`/`parseLocation`, je mit echter Fixture und Test: mehrere Orte „Nr. 5.3 Satz 1
und Satz 2“, wiederholtes Glied „Nr. 7 Nr. 7“, dezimale Bereiche „Nrn. 1.17 bis 1.20“, „Dreifachbuchst.“, „wir angefügt“, „die Worte“
und „der Klammerzusatz“, „am Ende … angefügt“ und „Die Wörter „…“ werden angefügt“. Seine Abfangstellen in `baseline-only` bleiben
stehen (beide Wege liefern dasselbe; seine Tests sind grün). Genutzt aus `baseline-only`: `platform.ts`, `base.ts` (`resolveBase`),
`html.ts` (`convertGazetteHtml`), `relative.ts` (`ownPublicationDate`, `relativeRule`, `relativeDate`).

Tests: `tests/unit/bayernrecht-reconstruction-run7.test.ts` (30 Fälle an echten Seiten: `portal-*-full.json`, `verkuendung-*-stamm.html`,
Ausschnitte `…-excerpt.html` mit markierten Auslassungen).

### 19.3 Offene Normen und Stammverkündung

Der Bericht (`RECONSTRUCTION.md`, „Stammverkündung der offenen Normen“) zählt je offene Norm, ob die Stammverkündung vorliegt:
verfügbar 143 (die Norm scheitert an anderem), nur PDF-Ausgabe des GVBl. 103, nicht im Cache 90 (nur abgerufen, wenn die Kette steht –
bei diesen scheitert sie vorher), keine Stammverkündung 38 (meist Neubekanntmachung), Papier 34, Kette bis zur Stammfassung
unvollständig 23, HTML nicht sicher umsetzbar 15, fremde Seite 3. Die häufigsten Gründe mit verfügbarer Stammverkündung:
`restore-not-found` 21 (meist Anlagen, die die Verkündung als Anhang oder PDF führt), `restoration-prior-reverse` 13 (ein Befehl vor dem
Stichtag nicht umkehrbar: Absatzbezeichnung „(1)“ gestrichen, Überschrift eingefügt, Anlage aus dem Anhang), `restore-shape` 10,
`restoration-disagrees` 10 (Abschnitt 19.1).

**PDF-Ausgaben** (GVBl. bis 2009, 103 Normen) sind nicht umgesetzt: Nur 3 dieser Normen hätten die Stammfassung am Stichtag
(`BayBekV`, `BayFachVLw`, `BaySchallzVO`); alle übrigen bräuchten zusätzlich die lückenlose Rücknahme jahrzehntelanger Änderungen vor
dem Stichtag. Der Textlayer trägt zudem weder Gliederung noch sichere Wortgrenzen (Trennstriche, Spalten); die Wortlautprobe wäre
möglich, die Gestalt der eingesetzten Glieder und die Leerzeichen im eingesetzten Text wären es nicht.

### 19.4 Je Norm

| Norm | Rezept | Änderungen | Stammverkündung | Schritte (davon Alttext) | Wortlautprobe | Beginn |
| --- | --- | --- | --- | ---: | --- | --- |
| `BayKJG` | v1 | GVBl. 2026 S. 75 | GVBl. 2011 S. 304 | 4 (1: Art. 4 Nr. 1 aufgehoben) | 3 379 Zeichen gleich | 2011-08-01 |
| `BayTNAV` | v1 | GVBl. 2025 S. 545 | GVBl. 2020 S. 710 | 4 (2: § 4 Abs. 2 Satz 3; § 4 Abs. 1 ganz, Gestalt nach Konvention) | 11 009 | 2021-01-01 |
| `BayVV_1142_S_13045` | v1 | BayMBl. 2024 Nr. 139 | BayMBl. 2022 Nr. 325 | 3 (2: Nr. 3.5/3.6; Nr. 1.2 ganz) | 3 407, Unterschrift als Absatz | 2022-06-01 |
| `BayVV_2032_3_K_12914` | v1 | BayMBl. 2026 Nr. 129 | BayMBl. 2022 Nr. 216 | 8 (1: Nr. 5 Satz 3) | 2 236 | 2022-04-06 |
| `BayVV_2174_A_13397` | v1 | BayMBl. 2026 Nr. 268 | BayMBl. 2022 Nr. 652 | 13 (3: Nr. 8 aufgehoben bei Umnummerierung; Nr. 6.1, 6.2 ganz) | 15 201 | 2023-01-01 |
| `BayVV_2234_1_K_13989` | v1 | BayMBl. 2026 Nr. 286 | BayMBl. 2023 Nr. 429 | 1 (1) | 2 866 | 2023-09-01 |
| `BayVV_2236_9_1_K_11147` | v1 | BayMBl. 2025 Nr. 175 | BayMBl. 2020 Nr. 282 | 5 (4: zwei Streichungen; Nr. 1, Nr. 5.3.2 ganz) | 8 055 | 2020-01-01 |
| `BayVV_2244_F_13266` | v1 | BayMBl. 2025 Nr. 394 | BayMBl. 2022 Nr. 516 | 8 (4), davor BayMBl. 2023 Nr. 194 | 9 676 nach Rücknahme bis zur Stammfassung | 2023-05-01 |
| `BayVV_7801_L_10736` | v1 | BayMBl. 2025 Nr. 62 | BayMBl. 2019 Nr. 494 | 1 (1, ganz) | 18 161 | 2019-12-01 |
| `BayVV_8113_0_A_12472` | v1 | BayMBl. 2024 Nr. 579 | BayMBl. 2021 Nr. 738 | 8 (1) | 15 600 | 2021-10-21 |
| `BayVertrV` | v2 | GVBl. 2026 S. 146 ← GVBl. 2025 S. 570 | GVBl. 2021 S. 610 | 15 (3: Streichung über den umgebenden Wortlaut; 2 Glieder) | 21 408 | 2021-12-01 |
| `BayZEPRV` | v1 | GVBl. 2026 S. 75 | GVBl. 2013 S. 468 | 2 (1: § 4 Abs. 3 Satz 5), davor GVBl. 2015 S. 243 | 5 282 nach Rücknahme bis zur Stammfassung | 2015-08-01 |
| `BayeAktVArbSozG` | v2 | GVBl. 2026 S. 75 ← GVBl. 2025 S. 461 | GVBl. 2023 S. 190 | 3 (3: § 4 Abs. 2; § 2, § 6 ganz) | 3 353 | 2023-05-17 |

Bulk-Schnittstelle: Abschnitt 11 („Seit Lauf 7“). Schlange, Bericht und Audit: `reconstruction-queue --write` (offline), ein zweiter
Lauf meldet „Unverändert“.

## 20 Lauf 8: Reichweite der Stammverkündung

Ausgangspunkt (Stand nach Lauf 7): 61 Rezepte (13 mit `restoration`), 451 `reconstruction-required`. Auftrag: Stammverkündungen
auch dort holen, wo die Kette scheitert (90 Normen „nicht im Cache“), die Blocker der 143 Normen mit vorhandener Stammverkündung
angehen (`restore-not-found`, `restoration-prior-reverse`, `restore-shape`), Lücken der Kette bis zur Stammfassung schließen (23),
weitere Befehlsformen – mit denselben Beweisregeln.

Ergebnis: **63 Rezepte** (48 reine Rückrechnung, **15** mit `restoration`; 52 v1, 11 v2), **449** `reconstruction-required`. Neu:
`BayVV_7801_L_13600` (Rückfall mit Portalgestalt aus der ganzen Norm) und `BayZustVBM` (Registereintrag außerhalb der Kette, durch die
Wortlautprobe ausgeräumt, `chainChecks`). Die 61 Rezepte aus Lauf 7 sind im Stichtagskörper unverändert (Fingerabdrücke gleich);
`BayeAktVArbSozG` erreicht denselben Stichtagskörper jetzt mit genauen Schritten statt des Rückfalls auf § 6 (5 statt 3 Schritte),
drei ältere Rezepte tragen zusätzliche Belege (Vorgänger der Stichtagsfassung jetzt geprüft). Netz: 135 Abrufe über
`createBayernRechtFetcher` (Prüfpunkt 722 → 857); `--fetch --offline` meldet danach keine fehlende Quelle.

### 20.1 Was neu geht

| Hebel | Modul | Wirkung |
| --- | --- | --- |
| Stammverkündung auch bei scheiternder Kette abrufen | `acquire.ts` | 90 Normen: 48 Seiten geholt (für 39 Normen umsetzbar, 9 gehören nicht zur Norm, 1 nicht sicher umsetzbar), 41 belegt nur als PDF-Ausgabe (404 der Detailseite) – die Ketten dieser Normen scheitern aber vor der Wiederherstellung (Register, Inkrafttreten, Reihenfolge) |
| **Befunde der Kette nur mit Wortlautprobe** (`provisional`): Registerereignis, andere Verkündung mit Änderungsbefehl, Eintrag im Änderungsverlauf oder Fortführungsnachweis – je nur **nach** dem Stichtag – halten die Kette nicht an; das Rezept entsteht nur, wenn der Stichtagskörper (bei Änderungen vor dem Stichtag nach deren Rücknahme) im Wortlaut der Stammverkündung gleicht. Hätte eine solche Veröffentlichung den Text geändert, wiche er ab. | `walk.ts`, `run.ts`, `recipe.ts` (`restoration.chainChecks`, dann auch mit `restoredSteps: 0`) | `BayZustVBM`; 11 weitere Normen kommen weiter – bei `BayHG2022` widerlegt die Probe die Lesart, die übrigen scheitern an anderem |
| **Portal hinkt nach** (`portal-in-force-lag`): Das Paket gilt seit einem früheren Tag, als die jüngsten Änderungen in Kraft treten, und die nächstältere trat genau an diesem Tag in Kraft → die jüngeren gehören nicht zum heutigen Text – nur mit Wortlautprobe | `walk.ts` | 12 Normen so gelesen; bei `BayFachVJ` und `BayZustVAMUeB` widerlegt die Probe die Lesart (bleibt Befund), die übrigen scheitern an anderem |
| **Amtsblätter 2009–2018** (AllMBl., KWMBl., FMBl., JMBl.) als Glieder der Kette: Jahrgangsliste → Ausgabe → Dokument (Parser aus `baseline-only/platform.ts`), Identität über das Erlassdatum, Verkündungsdatum der Ausgabe | `pages.ts`, `chain.ts` | Lücken der Kette bis zur Stammfassung 23 → 15; Vorgänger der Stichtagsfassung jetzt geprüft; „(BayMBl. 728)“ ohne „Nr.“ |
| Inkrafttreten: Zitat über mehrere Absätze (jeder beginnt mit „„“, nur der letzte schließt), Paragraphenzeile „§ 2“ als Absatz, gerades Anführungszeichen am Zitatende | `commencement.ts` | Amtsblatt-Änderungen lesbar (AllMBl. 2018 S. 419, FMBl. 2018 S. 221) |
| Anlagen, die die Verkündung nur als PDF-Anhang führt, heißen jetzt so (`restore-annex-attachment` statt `restore-not-found`); sie bleiben offen – kein Text der Seite | `publication.ts` (`publicationAttachments`), `restore.ts` | 12 Normen |
| Portalgestalt: Art des Texts (überschriftartig/satzartig) als Merkmal der Knotenart; gröbere Stufen (ohne Art des Texts, ohne Art der Bezeichnung), nie über einen Widerspruch; Überschrift auch bei seither geändertem Wortlaut | `restore.ts` | `BayVV_7801_L_13600`; `restore-shape` 10 → 9 |
| Tabellen bleiben beim Gliedern der Stammverkündung ganz (vorher flachgelegt) | `publication.ts` (`nestLaw`) | Tabellengestalt bleibt trotzdem offen: Kopfzellen und `colspan` der Verkündung weichen vom Portal ab |
| Befehlsformen (je mit echter Fixture): „In Abs. 1 wird die Absatzbezeichnung/Angabe „(1)“ gestrichen.“ (neue Operation `unnumber-paragraph`) samt aufgehobener Absätze dahinter und „Abs. 1“ danach; „Der Wortlaut wird Satz 1 und …“; „Satz 3 wird Satz 2 und wie folgt geändert:“; Umnummerierung mit weiterem Befehl auch nach Komma und mit Streichung oder Aufhebung ohne Alttext; mehrere Glieder umnummeriert und neu gefasst; „Es wird folgende Überschrift eingefügt:“; Neufassung von „Der erste Satz“, „Der Satz“/„Der Spiegelstrich“ (Kontext), „Die Überschrift [in Nr. 4]“ (`recast-title`), „Der Wortlaut von Nr. 7.8“ (ohne Überschrift), „durch den folgenden Satz“, „Die Nrn. 6, 6.1 und 6.2“ (Unterglieder), „Die Teile 1 bis 4“; „Nr. 4.5 in der Überschrift“; „Spiegelsprich“; aufgehobener letzter Satz über die Ortsangabe | `structural.ts`, `formulas.ts`, `location.ts`, `restore.ts`, `steps.ts` | viele Normen einen Befehl weiter; die meisten scheitern dann am nächsten |

Tests: `tests/unit/bayernrecht-reconstruction-run8.test.ts` (18 Fälle; Fixtures `amtsblatt-allmbl-2018-*`,
`verkuendung-allmbl-2018-8-419.html`, `verkuendung-fmbl-2018-17-221.html`, `verkuendung-gvbl-2022-226-stamm.html`,
`verkuendung-gvbl-2024-458-excerpt.html`, `verkuendung-baymbl-2021-68-stamm-excerpt.html`, `portal-BayAbfZustV-excerpt.json`,
`portal-BayVV_2126_0_G_11762-excerpt.json`, `recipe-BayZustVBM.json`).

### 20.2 Offen, mit Grund

| Stammverkündung der offenen Normen | Lauf 7 | Lauf 8 |
| --- | ---: | ---: |
| verfügbar – die Norm scheitert an anderem | 143 | 188 |
| verfügbar, Kette bis zur Stammfassung lückenhaft | 23 | 15 |
| nur PDF-Ausgabe des GVBl. | 103 | 144 |
| nicht im Cache | 90 | 0 |
| keine (Neubekanntmachung, Fundstelle fehlt) | 38 | 38 |
| nur Papier | 34 | 34 |
| HTML nicht sicher umsetzbar | 15 | 16 |
| Seite gehört nicht zur Norm | 3 | 12 |

Die 188 mit Stammverkündung scheitern vor allem an: `restore-not-found` 20 (Glied steht in der Stammverkündung nicht so – meist erst
**vor** dem Stichtag eingefügt oder umgebaut, etwa `BayGSG` Art. 11, das 2010 noch nicht bestand), `annex-recast` 16 und
`restore-annex-attachment` 12 (Anlagen nur als PDF), `restoration-prior-reverse` 16 (ein Befehl **vor** dem Stichtag nicht umkehrbar –
oft, weil der Alttext eines Glieds aus der Stammverkündung stammt, das eine Änderung vor dem Stichtag schon umgebaut hatte),
`restoration-disagrees` 11 (echte Abweichungen: Portal- oder Satzfehler, Abschnitt 19.1), `reverse-location-unresolved` 10,
`recast` 10 (Neufassung ohne lesbares Zitat oder mit Anlage), `restore-shape` 9 (Tabellen, Aufzählungsgestalten ohne Beleg).

**Nächster Hebel** (nicht gebaut): die Änderungen **vor** dem Stichtag **vorwärts** auf die Stammverkündung anwenden und den so
gewonnenen Stand am Stichtag als Quelle des Alttexts nehmen (statt der Stammverkündung selbst). Das löste die Fälle, in denen ein vor
dem Stichtag eingefügtes oder geändertes Glied nach dem Stichtag neu gefasst oder aufgehoben wird (`restore-not-found`,
`restoration-prior-reverse`), braucht aber eine Vorwärtsauflösung der Befehle auf dem Blockmodell der Verkündung.

Bulk-Schnittstelle: unverändert (Abschnitt 11). Neu ist nur, dass ein Rezept mit `restoration` auch `restoredSteps: 0` tragen kann,
wenn `restoration.chainChecks` die ausgeräumten Befunde nennt (`BayZustVBM`); für den Bulk gilt dasselbe wie bisher – Quellen aus
`restoration.sources` mit SHA-256 prüfen, dann `restorationChecked: true`.

## 21 Lauf 9: Stand am Stichtag vorwärts aus Stammverkündung und Änderungen davor

Ausgangspunkt (Stand nach Lauf 8, Commit `b1e3b9c40`): 63 Rezepte (48 reine Rückrechnung, 15 mit `restoration`), 449
`reconstruction-required`. Auftrag: den in Abschnitt 20.2 benannten Hebel bauen – die Änderungen **vor** dem Stichtag vorwärts auf
die Stammverkündung anwenden und den so gewonnenen Stand als Quelle des Alttexts und Maßstab der Wortlautprobe nehmen; PDFs mit
Textlayer (nie OCR) prüfen. Beweisregeln unverändert.

Ergebnis: **66 Rezepte**, **446** `reconstruction-required`.

| Methode | nach Lauf 8 | nach Lauf 9 |
| --- | ---: | ---: |
| reine Rückrechnung (Befehle tragen den Alttext) | 48 | 49 |
| Alttext aus der Stammverkündung, Probe durch Rücknahme bis zur Stammfassung (Lauf 7) | 15 | 12 |
| Alttext aus dem **Vorwärtsstand** (Stammverkündung + Änderungen vor dem Stichtag), Probe gegen diesen Stand | – | 5 |
| aus einem PDF-Textlayer | 0 | 0 |

Neu: `BayAgrG` (vorwärts: GVBl. 2016 S. 347 ← 2022 S. 695), `BayZustWaffVIM` (vorwärts: GVBl. 2011 S. 74 ← 2014 S. 286 ← 2019
S. 98), `BayZALS` (mehrere Orte ohne „jeweils“). Auf den Vorwärtsstand umgestellt, Stichtagskörper unverändert:
`BayVV_2244_F_13266`, `BayZEPRV`, `BayZustVBM`. Kein Rezept aus Lauf 8 ging verloren; alle Stichtagsfingerabdrücke gleich.
Audit 66/66, Wiederherstellungen 17/17 nachgerechnet. Netz: 150 Abrufe über `acquireSources` (Prüfpunkt 857 → 998) und rund 250
gezielte Abrufe (Ketten bis zur Stammfassung, PDF-Ausgaben) über `createBayernRechtFetcher` (Cache/Resume, ~1 req/s).

### 21.1 Verfahren (`forward.ts`)

1. Die Kette reicht bis zur Stammfassung (`walk.ts`, `deep`), die Stammverkündung liegt digital als HTML vor (Abschnitt 19).
2. Jede Änderung vor dem Stichtag wird, älteste zuerst, **vorwärts** auf das Blockmodell der Verkündung angewandt: dieselben Befehlsparser
   wie rückwärts (`parseLeaf`, Vorlagen aus `structural.ts`, Wortlautoperationen, Neufassung/Aufhebung/Streichung als
   `RestoreRequest`), aber mit strenger Eindeutigkeit – jede Stelle genau einmal, kein Weiten, keine Portalgestalt. Umnummerierungen
   einer Ebene gelten gleichzeitig. Zitierte Glieder werden wie die Verkündung gegliedert (`quoteBlocks`, GVBl. über `nestLaw`).
   Befehle zur Inhaltsübersicht bleiben vorwärts ohne Wirkung (die Probe lässt die Inhaltsübersicht aus); rückwärts sind sie nur dann
   ohne Wirkung, wenn das Portal keine Inhaltsübersicht führt, sonst Befund `toc-command`.
3. Scheitert ein Befehl, gilt der Weg aus Lauf 7 (Stammverkündung als Quelle, Probe durch Rücknahme bis zur Stammfassung); der Grund
   steht in der Schlange (`restorationBase.detail`, „Vorwärts bis zum Stichtag: …“ – 69 offene Normen).
4. Beweis wie bisher, nur gegen den Vorwärtsstand: Forward-Replay vom Stichtagskörper über alle Änderungen nach dem Stichtag
   byteidentisch zum heutigen Portalkörper **und** Wortlaut des ganzen Stichtagskörpers gleich dem Vorwärtsstand (ohne
   Inhaltsübersicht und Platzhalter „(aufgehoben)“). Beispiel `BayZustWaffVIM`: Ohne die Änderungen von 2014 und 2019 weicht der
   Wortlaut ab Zeichen 521 ab („Staatsministerium des Innern, für Sport und Integration“ gibt es erst seit 2014).
5. Rezept: `restoration.derivation: "forward"`, `restoration.forwardFingerprint` (Fingerabdruck des Vorwärtsstands),
   `restoration.priorSteps` = die vorwärts angewandten Befehle; `publicationFingerprint` bleibt der der Stammverkündung. Das Audit
   (`audit.ts`) rechnet den Vorwärtsstand aus den Quellen nach und vergleicht beide Fingerabdrücke.

Weitere Befehlsformen (je mit Test): alte Nummerierung im übergeordneten Befehl („Der bisherige § 3 wird § 4 und wie folgt
geändert:“ – Alttext unter der alten Bezeichnung), Halbsätze (Teil eines Satzes zwischen Semikola; „Halbsätze 1 und 2“), „einleitender
Satzteil“, „Vorspann“, „der Betrag“, „die Jahreszahl“, „das Datum“, „die Wortfolge“, „der Schlusspunkt“, „wird gelöscht“, „Der
bisherige Wortlaut wird Satz 1“, „Die Satznummerierung in Satz 1 wird gestrichen“; mehrere Orte ohne „jeweils“ gelten je Ort (jeder
Ort eindeutig).

### 21.2 PDF-Textlayer (`pdf.ts`, `pdfbase.ts`)

Für jede offene Norm, deren Stammverkündung nur als PDF-Ausgabe des GVBl. vorliegt, prüft der Lauf den Textlayer der Ausgabe
(SHA-256 gegen die veröffentlichte Prüfsumme, Anfangsseite laut Fundstelle, Ausfertigungsdatum auf der Seite). Ein Textlayer aus
Texterkennung wird nicht gelesen: unsichtbarer Text über dem Seitenbild (`3 Tr`) oder ein OCR-Erzeuger (`Paper Capture`, ABBYY, …)
– belegt für GVBl. 1983 und 1998. Aus einem gesetzten Textlayer entsteht kein Wortlaut, wenn Wortgrenzen oder Satzgestalt nicht
eindeutig sind: Unterschneidung („T eil“, „V om“, „W issenschaft“), Trennstrich am Zeilenende vor Kleinbuchstaben
(„Finanzausgleichs- änderungsgesetz“ – Trennung oder Bindestrich?), Satznummern als gewöhnliche Ziffern.

| Textlayer der Stammverkündung (offene Normen, `restorationBase.pdfLayer`) | Normen |
| --- | ---: |
| aus Texterkennung oder Scan (`pdf-ocr`) | 73 |
| Schrift oder Inhaltsstrom nicht sicher dekodierbar (`pdf-undecodable`, u. a. GVBl. 2008) | 34 |
| mehrdeutig: Unterschneidung, Trennstrich am Zeilenende, Satznummern (`pdf-ambiguous`, GVBl. 2002–2008) | 30 |
| Ausgabe nicht abrufbar (Zeitüberschreitung, `pdf-not-cached`) | 3 |
| keine GVBl.-Seitenfundstelle (nicht geprüft) | 2 |
| Ausfertigungsdatum nicht auf der Anfangsseite (`pdf-not-located`) | 1 |

Kein Fall ohne erkennbare Mehrdeutigkeit (`pdf-unconverted` 0): **kein Rezept aus einem PDF-Textlayer**. Das Ausgabenverzeichnis
eines Jahrgangs ohne eigene Ausgaben (etwa 1908) zeigt andere Jahrgänge – solche Ausgaben zählen nicht mehr (`pages.ts`).

### 21.3 Offen, mit Grund

| Stammverkündung der offenen Normen | Lauf 8 | Lauf 9 |
| --- | ---: | ---: |
| verfügbar – die Norm scheitert an anderem | 188 | 186 |
| verfügbar, Kette bis zur Stammfassung lückenhaft | 15 | 15 |
| nur PDF-Ausgabe des GVBl. (Textlayer: Abschnitt 21.2) | 144 | 143 |
| keine (Neubekanntmachung, Fundstelle fehlt) | 38 | 38 |
| nur Papier | 34 | 34 |
| HTML nicht sicher umsetzbar | 16 | 16 |
| Seite gehört nicht zur Norm | 12 | 12 |

Die Vorwärtsauflösung scheitert bei 69 der 186 Normen mit Stammverkündung an einem Befehl vor dem Stichtag (Anlagen, die nur als
PDF-Anhang vorliegen, Stellen, die nur als Bereich auflösbar sind, Einfügen ganzer Glieder vor einer Umnummerierung, Neufassungen
ohne lesbaren Alttext der Vorfassung); bei den übrigen ist die Stammfassung die Fassung am Stichtag oder die Norm scheitert an
Befehlen nach dem Stichtag (Anlagen, Tabellen, Befunde der Kette).

Tests: `tests/unit/bayernrecht-reconstruction-run9.test.ts` (17 Fälle; Fixtures `portal-BayZustWaffVIM-full.json`,
`portal-BayAgrG-full.json`, `verkuendung-gvbl-2011-74-stamm.html`, `verkuendung-gvbl-2014-286-zustwaff-excerpt.html`,
`verkuendung-gvbl-2019-98-zustwaff-excerpt.html`, `verkuendung-baymbl-2024-508.html`, `verkuendung-gvbl-2016-347-stamm.html`,
`verkuendung-gvbl-2022-695-agrg-excerpt.html`; synthetische PDF für die OCR-Erkennung).

Bulk-Schnittstelle: unverändert (Abschnitt 11) – Quellen aus `restoration.sources` mit SHA-256 prüfen, dann `restorationChecked: true`.
Neu und optional: `restoration.derivation: "forward"` und `restoration.forwardFingerprint` (Beleg, kein Eingang für den Bulk; der
Stichtagskörper ergibt sich wie bisher aus dem Rezept). In der Schlange neu:
`restorationBase.pdfLayer` und `totals.byPdfLayer`.
