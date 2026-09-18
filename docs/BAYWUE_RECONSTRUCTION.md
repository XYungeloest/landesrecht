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
Tests: `tests/unit/bayernrecht-reconstruction.test.ts` mit echten, gekürzten Verkündungsausschnitten und echtem Portaltext
(`tests/fixtures/bayernrecht/verkuendung-*-excerpt.html`, `portal-*-excerpt.json`, `gvbl-2006-09-textlayer-s189-190.json`).

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

| | vorher | nachher |
| --- | ---: | ---: |
| sicher zurückgerechnet | 13 (alle einstufig) | **33** (28 einstufig, 5 mehrstufig) |
| `reconstruction-required` | 506 | 486 |

Gruppenverteilung, Gründe und jede offene Norm: `data/audits/bayernrecht/RECONSTRUCTION.md`.

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

## 4 Quellen: gezielt, resumierbar, nur amtlich (`acquire.ts`, `pages.ts`, `pdf.ts`)

Der Bedarf entsteht nur aus dem Gang: Nennt ein Verweis eine Verkündung, deren Detailseite (`/gvbl/<Jahr>-<Seite>/`,
`/baymbl/<Jahr>-<Nr>/`) nicht im Cache liegt, ist das ein Bedarf. Der Jahrgang ist der des Ausfertigungsdatums; bei Ausfertigung im
Dezember kommt der Folgejahrgang in Betracht – geprüft wird **der Reihe nach**, erst wenn die erste Seite belegt nicht passt, wird die
nächste abgerufen. Welche Seite es ist, entscheidet allein die Identität: Die Seite trägt das Ausfertigungsdatum.

`reconstruction-queue --fetch` ruft in Runden ab (Gang berechnen → fehlende Seiten nacheinander abrufen → neu berechnen), über
`createBayernRechtFetcher` (sequenziell, Mindestabstand, identifizierender User-Agent, Cache mit Prüfsumme, Negativ-Cache für 404),
mit Abrufbudget (Standard 1 500). Der Prüfpunkt `reconstruction-fetch.json` hält jeden Versuch fest (Adresse, Status, SHA-256,
Normen, Runde); nichts wird doppelt abgerufen, ein Wiederholungslauf mit `--offline` braucht kein Netz. **Dieser Lauf: 373
Netzabrufe** (358 Seiten, Ausgabenverzeichnisse und PDF, 15 belegt nicht vorhanden).

**Ältere GVBl.-Jahrgänge** (vor 2016) führt die Plattform nicht als HTML (404). Dann: Ausgabenverzeichnis des Jahrgangs →
Ausgabe mit dem Seitenbereich → amtliches PDF; seine SHA-256 muss der von der Plattform veröffentlichten Prüfsumme entsprechen. Aus
dem **Textlayer** (kein OCR; `inspectPdf` des West-Adapters schließt Scans aus; Schriften nur mit bekannter Kodierung – MacRoman,
WinAnsi, Differences mit bekannten Glyphen) wird **nur** die Inkrafttretensvorschrift gelesen, nie ein Änderungsbefehl, und nur
unter strengen Grenzen ohne Layoutdeutung: Die Verkündung beginnt auf der ersten Inhaltsseite der Ausgabe (davor steht allein das
Inhaltsverzeichnis), ihre Seite trägt Seitenzahl, Kopfzeile, genau einen Titelzusatz und genau eine Unterschrift mit dem
Ausfertigungsdatum und **genau eine** Inkrafttretensregel mit Kalenderdatum. Alles andere bleibt Review
(`Die Verkündung beginnt auf S. …, nicht auf der ersten Inhaltsseite`).

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

**Reihenfolge der Befehle.** Die Befehle einer Änderung werden in ihrer Reihenfolge ausgeführt; eine Ortsangabe bezieht sich auf
die Zählung, die zu diesem Zeitpunkt gilt. Rückwärts wird deshalb der letzte Befehl zuerst aufgelöst – im heutigen Körper –, dann der
vorletzte im Körper ohne den letzten usw. (`steps.ts`). Ein Befehl „Der bisherige § 5 wird § 6 und wie folgt geändert:“ ist erst
Umnummerierung, seine Unterbefehle gelten für § 6. Steht die Einfügung vor der Umnummerierung der „bisherigen“ Glieder (GVBl. 2026 S.
190: „a) Nach Nr. 2 wird folgende Nr. 3 eingefügt … b) Die bisherigen Nrn. 3 bis 6 werden die Nrn. 4 bis 7.“), gibt es zwischendurch
zwei Glieder „3.“; das eingefügte ist genau das, dessen Wortlaut das Zitat ist – sonst Abbruch.

**Nie automatisch** (bleibt `reconstruction-required`): Neufassung ohne Alttext (`recast`), Aufhebung (`repeal-unit`), Streichung ohne
Anker (`delete-words` – die Stelle wäre beliebig, der Rundlauf bewiese nichts), Anlagen aus dem Anhang (`annex-recast`), Tabellen- und
Bildersetzung, eingefügte Glieder mit Abbildung oder abweichendem Wortlaut, mehrdeutige Mehrfachtreffer, „jeweils“ an nur einem Ort,
„Vor Abs. 1 wird folgender Abs. 1 eingefügt“ bei gleichzeitiger Umnummerierung (Anker nicht belegt), „Der Wortlaut wird Abs. 1“
(Wechsel der Blockart), Orte in Kopfzeilen, Einleitungen, Vorbemerkungen und Spalten.

## 7 Orte und Eindeutigkeit (`location.ts`, `apply.ts`)

Wie bisher: Stufen, die der Körper auszeichnet, müssen genau einmal gefunden werden; Stufen, die er nicht auszeichnet (Halbsatz,
Satzteil nach …, Sätze ohne Satznummern), lassen den Bereich als Obermenge – der Wortlaut muss darin genau einmal stehen. Für Glieder
(Einfügen, Umnummerieren) gilt eine Satzangabe im Ort („In Art. 3 Abs. 1 Satz 2 … Nr. 3“) als Obermenge des Absatzes. Die Überschrift
der Norm selbst ist Metadatum – ein Befehl daran scheitert (`location-unresolved`), denn der Titel der Stichtagsfassung wäre ein anderer.

## 8 Inkrafttreten (`commencement.ts`)

Grundregel und Abweichungen der Schlussvorschrift, für den Abschnitt der Norm; Abweichungen für fremde Abschnitte eines
Mantelgesetzes gelten nicht. Neu lesbar: Aufzählungen („Abweichend von Abs. 1 treten in Kraft: 1. § 9 mit Wirkung vom …, 2. die §§ 11
und 13 am …“, auch über Einheiten verteilt bis „in Kraft.“), Paare („tritt § 16 am … und § 20 am … in Kraft“), Punktbereiche („die Nrn.
1.1 bis 1.18“), Untergliederung („§ 1 Nr. 5“ betrifft nur einen Teil), „Diese Änderung der Bekanntmachung tritt … in Kraft“. **Nennt eine
Abweichung den ganzen Abschnitt** („treten die §§ 61 bis 73 am 1. Januar 2027 in Kraft“), gilt für ihn die Grundregel nicht. Eine
nicht lesbare Abweichung macht das Inkrafttreten unbestimmt. Staatsverträge („Dieser Staatsvertrag tritt am … in Kraft“ unter dem
Vorbehalt der Ratifikation) werden nicht gelesen.

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
| PDF nur, wenn die Verkündung auf der ersten Inhaltsseite der Ausgabe steht | ältere Vorgänger mitten in einer Ausgabe bleiben unbelegt |
| Vorgänger auf Nicht-Plattform-Blättern (AllMBl., KWMBl., JMBl., BGBl.) | `prior-source-not-on-platform` |
| Einfügen „vor“ einem Glied bei gleichzeitiger Umnummerierung, „Der Wortlaut wird Abs. 1“ | nicht angewandt |
| Tabellen-, Kopfzeilen-, Spaltenorte | nicht auflösbar |
| Reihenfolge von Inkrafttreten gegen Verkündung (älter verkündet, später in Kraft) | `chain-commencement-order` |
| Titeländerung der Norm selbst | Titel ist Metadatum, Stichtagstitel wäre ein anderer |
