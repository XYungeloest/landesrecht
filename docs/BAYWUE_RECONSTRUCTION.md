# Rückrechnung von Änderungen – BayWü (`reverse-amendment`)

Stand 2026-09-18. Stichtag **2023-12-01**. Kennzahlen des Laufs: `data/audits/bayernrecht/RECONSTRUCTION.md`.

```
npm run import:bayernrecht:reconstruction-queue                # Dry-run, nur Cache, schreibt nichts
npm run import:bayernrecht:reconstruction-queue -- --write     # Rezepte, Schlange, baseline.json, Bericht
npm run import:bayernrecht:reconstruction-queue -- --only BayVV_330_A_571   # Probelauf, schreibt nie
```

Code: `packages/importers/bayernrecht/src/reconstruction/` (`gazette.ts`, `structure.ts`, `formulas.ts`,
`location.ts`, `commencement.ts`, `chain.ts`, `apply.ts`, `recipe.ts`, `source.ts`, `run.ts`); Zustände der
Schlange in `src/baseline/reconstruction.ts`. Tests: `tests/unit/bayernrecht-reconstruction.test.ts` mit echten,
gekürzten Befehlen und zwei Verkündungsausschnitten (`tests/fixtures/bayernrecht/verkuendung-gvbl-2024-98-excerpt.html`,
`…-baymbl-2026-225.html`).

---

## 1 Worum es geht – und warum hier jeder Zweifel ausschließt

BAYERN.RECHT führt nur den heutigen Stand. Für 519 Normen gilt der heute gezeigte Text erst seit einem Tag
nach dem Stichtag (`changed-after-baseline`, siehe `docs/BAYWUE_HISTORICAL_BASELINE.md`). Ihr Stichtagstext
lässt sich manchmal aus dem heutigen Text und dem Änderungsbefehl **zurückrechnen**.

Eine falsch zurückgerechnete Änderung erzeugt einen historischen Normtext, der echt aussieht und es nicht
ist: sprachlich einwandfrei, an der richtigen Stelle, mit Belegkette. Das ist schlimmer als jede fehlende
Norm. Deshalb gilt ohne Ausnahme:

> **Im Zweifel `reconstruction-required`. Kein erfundener historischer Normtext.**

Eine Norm, die nicht sicher zurückgerechnet werden kann, bleibt draußen. Die Rückrechnung schreibt **keine
Normen nach `content/`**; sie liefert Rezepte und Entscheidungen. Der Bulk wendet ein Rezept selbst an
(Abschnitt 11) und übernimmt bis dahin nur `current-unchanged`.

## 2 Welche Normen angegangen werden

Nur Normen mit **genau einem stark belegten Änderungsschritt** nach dem Stichtag: genau ein Ereignis des
Registers (`events/ledger.json`), dessen Ziel stark aufgelöst ist (`targetResolution.status = resolved`,
`matchStrength = strong`) und dessen Verkündung nach dem Stichtag liegt – dieselbe Regel wie die
Stichtagsklassifikation (`baseline/run.ts#readPostBaselineEvents`). Das sind **239** der 519. (Der Auftrag
nannte 258; mit dieser Regel lässt sich die Zahl nicht nachvollziehen. Auch Varianten – verschiedene
Veröffentlichungen, verschiedene Daten, nur `amend` – ergeben 239 bis 263, nie 258.)

Nicht angefasst werden, jeweils mit Zustand in der Schlange:

| Lage | Zustand | Grund |
| --- | --- | --- |
| kein belegtes Ereignis | `missing-base` | `no-post-baseline-event` – die Kette ist unbekannt |
| ein Ereignis ist eine Neufassung (`recast`) | `non-invertible-amendment` | `recast-event` |
| zwei oder mehr Ereignisse | `partial-chain` | `multi-step` – nur einschrittige Ketten werden zurückgerechnet |

## 3 Ablauf je Norm – acht Prüfungen, alle notwendig

| # | Prüfung | Modul | scheitert als |
| --- | --- | --- | --- |
| 1 | Detailseite der Verkündung und heutiges Exportpaket liegen im Cache | `source.ts` | `missing-base` |
| 2 | der Einleitungssatz für die Norm steht **genau einmal** in der Verkündung; Befehlsblock und Orte sind lesbar | `gazette.ts`, `structure.ts` | `command-unreadable`, bei zwei Abschnitten `partial-chain` |
| 3 | **jede** Klausel des Blocks hat eine unterstützte, rückrechenbare Formel | `formulas.ts` | `non-invertible-amendment`, `asset-missing`, `unsupported-formula` |
| 4 | Inkrafttreten bestimmt, **nach** dem Stichtag, nicht nach dem Auswertungsstichtag, = `inkraft` des heutigen Pakets | `commencement.ts` | `effective-date-undetermined`, `contradictory` |
| 5 | die Kette ist einschrittig (vier Gegenproben) | `chain.ts` | `partial-chain`, `contradictory` |
| 6 | jeder Ort ist auflösbar, jeder Wortlaut im Bereich **genau einmal** vorhanden | `location.ts`, `apply.ts` | `ambiguous-target` |
| 7 | **Rundlauf**: rückwärts und wieder vorwärts ergibt exakt den heutigen Körper | `apply.ts` | `round-trip-failed` |
| 8 | der **Beginn der Stichtagsfassung** (≤ Stichtag) ist belegt | `chain.ts`, `commencement.ts` | `partial-chain` |

Scheitern mehrere Prüfungen, zählt der schwerste Grund (Beleg fehlt → Befehl unlesbar → Anlage → nicht
umkehrbar → Kette → Widerspruch → Inkrafttreten → Formel → Mehrdeutigkeit → Rundlauf); die übrigen stehen
in der Schlange unter `alsoFailed`. Fehlt nur der Beleg aus Prüfung 8, laufen 6 und 7 trotzdem – die Schlange
zeigt dann `roundTripVerified: true`.

## 4 Die Verkündung lesen

**Einheiten** (`gazette.ts`). Die Detailseite (`/gvbl/<jahr>-<seite>/`, `/baymbl/<jahr>-<nummer>/`) wird in
Absätze, Überschriften, Listen- und Tabellenglieder zerlegt, jeweils mit Gliederungszeichen (`1.`, `a)`,
`aa)`, `1.2.1`) und Elementklasse (`EBENE2NummerierteListeABC`, `MBL1Listenebene`).

**Leerraum.** Normalisiert werden genau vier Dinge – und im Rezept steht der Wortlaut der Normalisierung
(`whitespace`):

1. HTML-Entitäten werden aufgelöst.
2. Geschützte und schmale Leerzeichen werden Leerzeichen, Leerraumfolgen ein Leerzeichen (wie im Portaltext).
3. Weiche Trennzeichen (`&#173;`) entfallen.
4. `<sup>n</sup>` wird Unicode-Hochstellung (`³`), wie die Satznummern des Portals; Fußnotenzeichen der
   Verkündung (`<sup>1)</sup>`) entfallen.

**Einleitungssatz** (`structure.ts`). Gesucht wird ein Normzitat – Ausfertigungsteil und Fundstellenklammer,
auch mit Aktenzeichen dazwischen („vom 7. Oktober 2019, Az. … (BayMBl. Nr. 424)“) oder als bereinigte
Fassung der BayRS –, dem nach der Klausel „…, die zuletzt durch … geändert worden ist,“ ein **ändernder
Befehl** folgt. Das Zitat muss die Zielnorm mit **zwei unabhängigen Merkmalen** bezeichnen, eines davon
Ausfertigungsdatum oder BayRS-Nummer (dazu Abkürzung, Fundstelle oder vollständiger Titel). Ein Titel oder
eine Abkürzung allein genügt nie. Zitate innerhalb eines Zitats zählen nicht.

- Kein Einleitungssatz → `command-unreadable/intro-not-found`.
- Zwei Einleitungssätze für dieselbe Norm (etwa „§ 2 Weitere Änderung des …“ mit eigenem Inkrafttreten)
  → `partial-chain/multiple-sections`. Es wird **nicht** der wahrscheinlichste genommen.

**Befehlsblock.** Nach „… wird wie folgt geändert:“ folgen die Befehle, gegliedert über die Elementklasse
(GVBl.) oder die Punktgliederung (BayMBl.). Zitierter Wortlaut hinter „…:“ gehört zum Befehl davor und wird
über die Anführungszeichen verfolgt. Der Block endet an der nächsten Überschrift, am nächsten
Einleitungssatz oder am nächsten Glied auf der Ebene des Einleitungssatzes („2. Diese Bekanntmachung tritt …
in Kraft.“). Gliederungssprünge und unaufgelöste Zitate → `command-unreadable/structure-unreadable`.

## 5 Die Formeln – erhoben, nicht geraten

Die Formeln wurden aus den tatsächlichen Befehlsblöcken der Einschrittkandidaten geclustert. Häufigkeiten:
Tabelle „Änderungsformeln“ in `data/audits/bayernrecht/RECONSTRUCTION.md`.

### 5.1 Unterstützt – weil der Befehl die vorherige Fassung vollständig bestimmt

| Formel | echtes Beispiel | vorwärts | rückwärts |
| --- | --- | --- | --- |
| `replace-words` | „In § 31 Abs. 6 Satz 2 wird die Angabe „Nr. 3“ durch die Angabe „Nr. 2“ ersetzt.“ | X → Y | Y (genau einmal im Bereich) → X |
| `insert-words` | „Nach der Angabe „Unterrichtswesen“ wird die Angabe „(BayEUG)“ eingefügt.“ | hinter dem Anker einfügen | „Anker + Einfügung“ (genau einmal) → Anker |
| `delete-words-anchored` | „In Nr. 3.1.1 Satz 3 wird vor der Angabe „44“ die Angabe „Art.“ gestrichen.“ | am Anker streichen | am Anker (genau einmal) wieder einsetzen |
| `append-words` | „Der Überschrift wird die Angabe „ , Verordnungsermächtigung“ angefügt.“ | am Ende anfügen | Ende muss genau darauf enden → abschneiden |
| `replace-final-punctuation` | „In Nr. 13 wird der Punkt am Ende durch ein Komma ersetzt.“ | Schlusszeichen ersetzen | neues Schlusszeichen/-wort → altes |

Mehrere Klauseln eines Befehls („… die Angabe „A“ durch „B“ und die Angabe „C“ durch „D“ ersetzt“) werden in
Befehlsreihenfolge vorwärts und in umgekehrter Reihenfolge rückwärts angewandt.

**Leerraum an der Stelle.** Ein Zitat, das mit Leerzeichen und Satzzeichen beginnt („ , Forsten und
Tourismus“), schließt in der Bayerischen Verkündung ohne Leerzeichen an das vorangehende Wort an. Vorwärts
entfällt dann das Leerzeichen davor, rückwärts wird es wieder eingesetzt; ein nicht passender Anschluss ist
ein Fehler. Eingefügte Wörter erhalten ein Leerzeichen davor, eingefügte Satzzeichen nicht.

**„jeweils“** ist nur über **mehrere genannte Orte** unterstützt, und an jedem Ort muss der neue Wortlaut
genau einmal stehen; die Orte dürfen sich nicht überschneiden. „jeweils“ an nur einem Ort behauptet mehrere
Vorkommen, deren Herkunft im heutigen Text nicht zu unterscheiden ist – ausgeschlossen.

### 5.2 Nicht rückrechenbar – der Alttext steht nicht im Befehl

| Formel | echtes Beispiel | Grund |
| --- | --- | --- |
| `recast` | „§ 10 Abs. 1 wird wie folgt gefasst:“, „Nr. 5 Satz 1 erhält folgende neue Fassung:“ | Neufassung ohne Alttext |
| `repeal-unit` | „Art. 5 Abs. 1 Satz 3 wird aufgehoben.“, „Der Spiegelstrich 8 wird gestrichen.“ | Aufhebung ohne Alttext |
| `annex-recast` | „Die Anlage erhält die aus dem Anhang zu dieser Verordnung ersichtliche Fassung.“ | Anlage aus beigefügter Datei (`asset-missing`) |
| `delete-words` | „In Art. 3 Abs. 6 wird die Angabe „nach dem Stand der Technik“ gestrichen.“ | Wortlaut bekannt, **Stelle nicht** |

Die Streichung ohne Anker verdient einen Satz: Jede denkbare Einfügestelle ergäbe im Rundlauf wieder den
heutigen Text. Der Rundlauf beweist hier also nichts – und genau deshalb ist sie ausgeschlossen. Nur die
verankerte Streichung („nach/vor der Angabe „A“ …“) bestimmt die Stelle.

### 5.3 Nicht angewandt – grundsätzlich bestimmt, aber nicht maschinell sicher

| Formel | echtes Beispiel | Grund |
| --- | --- | --- |
| `insert-unit` | „Dem Art. 16 Abs. 1 wird folgender Satz 3 angefügt: …“, „Nach Nr. 4 wird folgende Nr. 5 eingefügt: …“ | neue Blöcke, Zuordnung von Zitat zu Portalblock, Satznummern |
| `renumber` | „Der bisherige Abs. 3 wird Abs. 4.“, „§ 4 wird § 3 und wie folgt geändert:“, „Die Satznummerierung „¹“ wird gestrichen.“ | Umnummerierung; die Orte späterer Befehle beziehen sich auf die neue Zählung |
| `replace-by-punctuation` | „… das Wort „oder“ durch ein Komma ersetzt …“ | ein Komma ist im heutigen Text nicht eindeutig wiederzufinden |
| `unrecognized` | Ortsangaben wie „In der Einleitung“, „In der Kopfzeile der Tabelle“, Befehle über mehrere Sätze, Aufzählungen mit „bis“ | nicht erkannt – im Zweifel ausgeschlossen |

Diese Normen stehen als `unsupported-formula` in der Schlange – näher an einem Rezept als eine Neufassung,
aber heute nicht sicher.

## 6 Orte: eine Obermenge, nie eine Vermutung

`location.ts` zerlegt Ortsangaben („In Art. 3a Abs. 4 Satz 1 Halbsatz 2, Art. 15 Abs. 1 und Art. 16 Satzteil
vor Nr. 1 …“) in Pfade und löst sie im geparsten Körper auf. Übergeordnete Befehle („Art. 53 wird wie folgt
geändert:“ → „a) Abs. 2 …“ → „aa) In Satz 3 …“) und die Ortsangabe des Einleitungssatzes („§ 3 der …“)
liefern den Kontext.

- Stufen, die der Körper auszeichnet (§, Art., Abs., Nr., Buchst., Spiegelstrich, Teil, Abschnitt), müssen
  **genau einmal** gefunden werden – auf der flachsten Ebene, auf der die Bezeichnung vorkommt. Fehlt eine
  oder gibt es zwei, scheitert die Auflösung (`ambiguous-target/location-unresolved`).
- Stufen, die der Körper nicht auszeichnet (Halbsatz, „Satzteil nach …“, Sätze ohne Satznummern,
  unbezeichnete Absätze in Verwaltungsvorschriften, ein bezeichnetes, aber leeres Glied), lassen den Bereich
  so groß, wie er ist – der Bereich **enthält** den zitierten Ort. Weil der Wortlaut im Bereich genau einmal
  vorkommen muss, macht ein größerer Bereich die Rückrechnung nur strenger.
- „Satz n“ grenzt über die Satznummern (¹ … ¹⁰) ein, wenn der Text sie lückenlos führt; „Satzteil vor Nr. 1“
  auf den eigenen Text vor der ersten Aufzählung; „Überschrift“ auf die Überschrift des Glieds. Die
  Überschrift der **Norm selbst** gehört zu den Metadaten, nicht zum Körper – ausgeschlossen.

## 7 Eindeutigkeit, in beide Richtungen

Rückwärts muss der **neue** Wortlaut im Bereich genau einmal stehen (überlappende Vorkommen mitgezählt),
vorwärts im rückgerechneten Text der **alte**. Ein Treffer als Teil eines längeren Wortes zählt nicht („10“ in
„2010“); Satznummern (¹²³) sind dabei keine Wortzeichen, Dezimalziffern schon. Kommt der zu ersetzende Text
mehrfach vor und bestimmt der Befehl nicht, welches Vorkommen – `ambiguous-target`. Belegt etwa an der
UntVergV: „Anwärtern“ → „Anwärter“ in einem Absatz, der „Anwärterinnen und Anwärter“ schon enthielt.

## 8 Inkrafttreten

`commencement.ts` liest die Schlussvorschrift der Verkündung (unter „§ n Inkrafttreten“ oder, im BayMBl.,
außerhalb jedes Zitats): eine **Grundregel** („Diese Verordnung tritt am 1. Juli 2024 in Kraft.“, „mit
Wirkung vom …“, „am Tag nach der Verkündung“) und **Abweichungen** („Abweichend von Satz 1 treten die §§ 61
bis 73 am 1. Januar 2027 in Kraft.“). Für die Zielnorm gelten die Grundregel und jede Abweichung, die ihren
Änderungsabschnitt oder einen Teil davon nennt; Abweichungen für fremde Abschnitte eines Mantelgesetzes
nicht. Eine nicht lesbare Abweichung macht das Inkrafttreten unbestimmt
(`effective-date-undetermined`).

- Tritt die Änderung (auch nur teilweise) **vor oder am Stichtag** in Kraft – etwa rückwirkend –, gehört sie
  zur Stichtagsfassung und wird **nicht** zurückgerechnet (`contradictory/effective-on-or-before-baseline`).
- Tritt sie (teilweise) erst nach dem Auswertungsstichtag in Kraft, kann der heutige Text sie nicht enthalten
  (`contradictory/effective-after-evaluation`).
- Das späteste Inkrafttreten muss dem `inkraft` des heutigen Pakets entsprechen
  (`contradictory/portal-in-force-mismatch`); sonst trägt eine andere Änderung den heutigen Text.
- Verschiedene Daten für verschiedene Teile des Abschnitts sind zulässig, wenn **alle** nach dem Stichtag und
  bis zum Auswertungsstichtag liegen: Dann galt am Stichtag keiner der Teile, und der ganze Abschnitt wird
  zurückgerechnet.

## 9 Die Kette und der Beginn der Stichtagsfassung

Das Register kennt genau ein Ereignis – das allein beweist wenig. `chain.ts` prüft unabhängig:

1. **Vollzitat des Portals** („…, das zuletzt durch § 2 des Gesetzes vom 21. November 2025 (GVBl. S. 573)
   geändert worden ist“) nennt genau diese Verkündung als letzte Änderung.
2. **Änderungsverlauf des Portals** (Norm-DTD) führt nach dem Stichtag genau diesen Eintrag.
3. **Fortführungsnachweis** (`enumeration-*.json`, `changeNotes`) führt nach dem Stichtag genau diese
   Änderung – für Verwaltungsvorschriften oft die einzige Änderungsliste.
4. **Keine andere Verkündung** nach dem Stichtag zitiert die Norm mit einem Änderungsbefehl (alle
   Detailseiten im Cache).
5. **Vorangehende Änderung laut Befehl** („die zuletzt durch Verordnung vom … geändert worden ist“): vor dem
   Stichtag verkündet und der letzte Eintrag vor dem Stichtag im Änderungsverlauf.

**Verkündet ist nicht in Kraft.** Dass die vorangehende Fassung am Stichtag galt, muss ihr Inkrafttreten
belegen – durch die **Verkündung der vorangehenden Änderung selbst** (`priorAmendmentInForce` in `run.ts`):

* Ihre Detailseite (`/gvbl/<Jahr>-<Seite>/`, `/baymbl/<Jahr>-<Nr>/`, Jahr aus dem Ausfertigungsdatum) liegt im
  Cache und trägt das Ausfertigungsdatum der vorangehenden Änderung (Identität).
* Ihre Inkrafttretensvorschrift wird wie in Abschnitt 8 gelesen: Grundregel plus Abweichungen, in einer
  Mantelverkündung nur die, die den ändernden Abschnitt betreffen („§ 5 des Gesetzes vom …“).
* Belegt ist nur ein **ausdrückliches Kalenderdatum** am oder vor dem Stichtag („tritt am 1. November 2019 in
  Kraft“, „mit Wirkung vom 1. Januar 2018“). Bezieht sich die Vorschrift auf die Verkündung („am Tag nach der
  Verkündung“), bleibt der Beginn unbelegt.

Das Datum wird `baselineTextInForce.date`, die Seite steht mit URL und SHA-256 in
`baselineTextInForce.sources` und wird mit dem Paket nach R2 archiviert. Fehlt die Seite (GVBl. 2006 S. 190 ist
auf der Verkündungsplattform nicht elektronisch geführt), bleibt die Norm
`partial-chain/prior-amendment-in-force-unproven`. Eine Heuristik („lange genug vor dem Stichtag ausgefertigt“)
wäre eine Annahme über historische Geltung und ist ausdrücklich ausgeschlossen.

Abgerufen wurden dafür genau die 11 Detailseiten der vorangehenden Änderungen der Kandidaten, die alle übrigen
Prüfungen bestanden hatten (sequenziell, über den Adapter-Fetcher und den Cache; die Plattform führt keine
robots.txt-Sperre); 10 lagen vor, alle mit Kalenderdatum vor dem Stichtag.

Belegbar ist nur die **Stammfassung** (der Befehl nennt keine vorangehende Änderung, Änderungsverlauf und
Fortführungsnachweis führen vor dem Stichtag keine): über die Inkrafttretensvorschrift der Norm selbst,
gelesen im **rückgerechneten** Stichtagstext. Belegt ist nur ein ausdrückliches Kalenderdatum ≤ Stichtag
(„tritt am 1. Dezember 2018 in Kraft“); „am Tag nach der Verkündung“ ist kein Beleg. Ausfertigung ist nicht
Textgeltung. Ausgeschlossen bleiben Neubekanntmachungen und bereinigte Fassungen (die Inkrafttretensvorschrift
des Stammgesetzes belegt nicht den Beginn dieser Fassung) und Normen, die ihre eigene Geltung unbestimmt
begrenzen („gelten bis zum Tag der Bekanntmachung des Haushaltsgesetzes des folgenden Haushaltsjahres“); ein
ausdrückliches Außerkrafttreten **nach** dem Stichtag ist unschädlich. Das Ergebnis steht im Rezept als
`baselineTextInForce: { date, evidence }`.

## 10 Rundlauf

Die Rückrechnung wird **vorwärts bewiesen**: Die Operationen werden auf den rückgerechneten Körper in
Befehlsreihenfolge angewandt, jede mit derselben Eindeutigkeitsprüfung, und das Ergebnis muss **exakt** der
heutige Körper sein – verglichen als kanonisches JSON, Byte für Byte, ohne jede Normalisierung. Das Rezept
wird zusätzlich nach Serialisierung erneut geprüft. Eine Rückrechnung, die nichts ändert, ist kein Nachweis.

Der Rundlauf ist notwendig, aber allein nicht hinreichend: Er beweist, dass Rückwärts und Vorwärts
zueinander passen und dass der Befehl den Stichtagstext in den heutigen überführt. Dass die Rückwärtsrichtung
**eindeutig** ist, sichern erst die Formelauswahl (5), die Eindeutigkeit (7) und die Kette (9).

## 11 Rezept und Anwendung im Bulk

Rezept: `data/imports/bayernrecht/reconstruction/<documentId>.json`, Schema `bayernrecht-reverse-amendment/1`
(`recipe.ts`). Es enthält: Quelle (Adresse, SHA-256 und `inkraft` des heutigen Pakets, Parserversion),
Änderung (Fundstelle, Detailseite mit SHA-256, veröffentlichte PDF-Prüfsumme, Verkündung, Inkrafttreten mit
Wortlaut der Schlussvorschrift, Einleitungssatz, vorangehende Änderung), `baselineTextInForce`, Kettenbelege,
je Schritt Befehl (wörtlich), Formel, Ort, aufgelösten Bereich (Indexpfade), Operation, Vorher-/Nachher-Beleg,
die Leerraumnormalisierung und die Fingerabdrücke des heutigen und des Stichtagskörpers.

Reine Funktionen für den Bulk (`apply.ts`), ohne Netz und ohne Dateizugriff:

```ts
applyReverseRecipe(currentBody, recipe)  // → Stichtagskörper; wirft bei ungültigem Rezept, fremdem Körper,
                                         //   nicht eindeutigem Ziel oder abweichendem Ergebnis
verifyRoundTrip(currentBody, recipe)     // → { ok, detail }: rückwärts, vorwärts, exakt gleich
recipeProblems(recipe)                   // → formale Verstöße (u. a. Inkrafttreten ≠ inkraft, Beginn nicht belegt)
```

Gearbeitet wird auf dem **bayerischen Quelltext** (`parseBayernRechtPackage(...).law.body`), vor der
Überleitung nach BayWü: Die Befehle zitieren den bayerischen Wortlaut. Reihenfolge im Bulk: parsen → Rezept
rückwärts → Rundlauf → überleiten → prüfen → schreiben. Ändert sich der Parser, ändern sich die
Fingerabdrücke; dann ist die Rückrechnung neu zu erzeugen (der Bulk lehnt sonst mit `current-mismatch` ab).

## 12 Stichtagsstatus

`--write` setzt in `data/imports/bayernrecht/baseline.json` für jede zurückgerechnete Norm Methode
`reverse-amendment`, Status `active-at-baseline`, keine Blocker, Grund `reverse-amendment-verified` und einen
Beleg mit Rezeptpfad. Alle übrigen Normen der Klasse `changed-after-baseline` behalten ihren Blocker und
erhalten einen zweiten: `Rekonstruktion: <Zustand> (<Grund>) – <Befund>`. Der Lauf ist idempotent und stellt
eine früher zurückgerechnete Norm, deren Rezept nicht mehr besteht, auf die Klassifikation zurück. Nach
`baseline --write` ist er erneut auszuführen. Die Schlange mit allen 519 Normen steht in
`data/imports/bayernrecht/reconstruction-queue.json`.

## 13 Grenzen und was die Ausbeute erhöhen würde

| Grenze | Folge | Weg |
| --- | --- | --- |
| Inkrafttreten vorangehender Änderungen nur mit ihrer Verkündung belegbar | 11 von 13 Kandidaten mit bestandenem Rundlauf so belegt; BayBedV fehlt (GVBl. 2006 nicht elektronisch), BayHG2021 begrenzt die eigene Geltung | für weitere Kandidaten dieselbe Seite abrufen; ältere Jahrgänge nur als PDF |
| strukturelle Befehle (`insert-unit`, `renumber`) werden nicht angewandt | rund die Hälfte der Blöcke fällt schon an einer Klausel | Zuordnung Zitat → Portalblock mit eigenem Rundlauf; Satznummern mitführen |
| Mehrschrittketten nicht angegangen | 252 Normen | erst sinnvoll, wenn jeder Einzelschritt sicher ist |
| Tabellenorte („in der Zeile … Spalte …“), Einleitung, Präambel | nicht auflösbar | eigene Ortsarten mit Eindeutigkeitsprüfung |
| Geltung der Norm am Stichtag (Befristungen, „gelten bis …“) | wird nicht entschieden | Sache der Stichtagsklassifikation |
