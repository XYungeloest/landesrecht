# Der Stichtagsbestand Bayern-Württemberg zum 2023-12-01

**Warum dieses Dokument nötig ist:** Für West/NRW lieferte die Quelle Fassungslisten, aus denen sich
die am Stichtag geltende Fassung auswählen ließ. Für Bayern gibt es das nicht. BAYERN.RECHT führt den
**heutigen** Stand und keine außer Kraft getretenen Vorschriften. Der Stichtagsbestand ist deshalb
weder der heutige Bestand noch aus ihm allein herleitbar – er muss erarbeitet werden.

Der Stichtag bleibt **2023-12-01**. Kein Versatz, kein „ungefährer 2023er-Stand“, keine
Rückdatierung heutiger Fassungen.

## 1 Was die Quelle je Norm hergibt

Drei Daten, und ihr Verhältnis trägt die ganze Entscheidung:

```text
ausfertigungsdatum   wann die Vorschrift erlassen wurde      → Existenz
fassungsdatum        Datum der geführten Fassung
inkraft              ab wann der gezeigte Text gilt          → Textgeltung
```

**Ausfertigung ist nicht Textgeltung.** Der ARD-Staatsvertrag ist vom 31.8.1991, sein im Portal
gezeigter Text gilt seit dem 1.12.2025. Die Vorschrift existierte am Stichtag – mit einem anderen
Wortlaut. Wer den heutigen Text übernimmt, datiert eine Fassung zurück.

Das ist der häufigste und gefährlichste Fehlschluss in diesem Bestand, und er sieht harmlos aus: Die
Norm ist alt, das Portal zeigt sie, also nimmt man sie. Die Klassen unten trennen genau daran.

### Ein Sonderfall, der 63 % des Bestands betrifft

Die beiden DTDs verhalten sich unterschiedlich: `byrecht-norm` führt `ausfertigungsdatum` als Feld,
**`byrecht-vv` führt es nicht**. Gemessen an den geprüften Paketen: 647 von 647 gegenüber 0 von 13.
Bei 1 478 Verwaltungsvorschriften hieße das, fast zwei Drittel des Bestands ohne Existenzbeleg zu
führen – fälschlich, denn das Datum steht in der Quelle, nur im Fließtext des Zitiervorschlags:

```text
Zitiervorschlag: Redaktionsrichtlinien (RedR) vom 16. Juni 2015 (AllMBl. S. 319),
die zuletzt durch Bekanntmachung vom 16. Dezember 2025 (BayMBl. Nr. 587) geändert worden sind
```

Daraus werden **zwei** Daten gewonnen: das erste „vom“ ist die Ausfertigung der Stammfassung, ein
Datum nach „zuletzt durch … geändert“ die letzte Änderung. Die Reihenfolge ist wesentlich – ohne das
Abtrennen des Änderungsteils gewänne man bei jeder geänderten Vorschrift das Änderungsdatum als
Ausfertigung und hielte eine alte Vorschrift für neu.

Das steht in `src/baseline/citation-dates.ts` und **nicht** im Parser: Aus Prosa ein Datum zu
gewinnen ist eine Schlussfolgerung, keine Strukturinformation. Sie gehört dorthin, wo sie als solche
kenntlich bleibt. Jede so gewonnene Angabe trägt in der Belegkette `source: citation:Zitiervorschlag`
statt `xml:ausfertigungsdatum`.

Die Ableitung ist eng gefasst und rät nicht: Wo der Zitiervorschlag kein Datum nennt – etwa bei alten
KWMBl.-Bekanntmachungen, die nur ein Jahr führen –, bleibt die Norm unentschieden. Und sie prüft den
Kalender: `32. Mai 2020`, `31.04.2020` und der 29. Februar eines Nicht-Schaltjahres werden abgelehnt.
Ein falsches Ausfertigungsdatum wäre schlimmer als gar keines, weil es still über die Klasse
entscheidet.

## 2 Die vier Klassen

| Klasse | Bedingung | Stichtagsstatus | Was zu tun ist |
| --- | --- | --- | --- |
| `unchanged-since-baseline` | Ausfertigung ≤ Stichtag **und** Textgeltung ≤ Stichtag | `active-at-baseline` | nichts – der heutige Text **ist** der Stichtagstext |
| `changed-after-baseline` | Ausfertigung ≤ Stichtag, Textgeltung > Stichtag | `active-at-baseline` | Stichtagsfassung beschaffen |
| `enacted-after-baseline` | Ausfertigung > Stichtag | `not-at-baseline` | nicht aufnehmen |
| `enacted-after-baseline` (`published-after-baseline`) | Ausfertigung ≤ Stichtag, aber eigene Fundstelle erst nach dem Stichtag verkündet; Rechtsnorm oder Textgeltung > Stichtag | `not-at-baseline` | nicht aufnehmen |
| `identity-or-validity-uncertain` (`published-after-baseline-validity-open`) | Verwaltungsvorschrift erst nach dem Stichtag veröffentlicht, Textgeltung laut Quelle aber davor (rückwirkend oder ab Erlass) | `undetermined` | Review |
| `identity-or-validity-uncertain` | Datum fehlt oder widersprüchlich | `undetermined` | Review |

**Verkündung nach dem Stichtag (Run 6).** Das Verkündungsdatum der eigenen Fundstelle – aus dem Kopf oder, bei
Verwaltungsvorschriften, aus der ersten Klammer hinter dem Ausfertigungsdatum im Zitiervorschlag – wird gegen die
datierten Verkündungen des Ereignisregisters geprüft (ohne Jahrgang nur das Ausfertigungsjahr, bei Ausfertigung im
Dezember auch das Folgejahr). Eine Rechtsnorm gilt nicht vor ihrer Verkündung; eine Vorschrift, deren Text erst nach
dem Stichtag in Kraft tritt, galt am Stichtag ohnehin nicht. Anlass: BayMBl. 2023 Nr. 629 und 633, ausgefertigt am
30.11./1.12.2023, veröffentlicht am 20.12.2023. Bei einer Verwaltungsvorschrift mit Textgeltung vor dem Stichtag
entscheidet ihre Bekanntgabe an die Behörden, die die Quelle nicht belegt – dort wird nicht geraten (Review).

Die erste Klasse ist der eigentliche Gewinn: Gilt der gezeigte Text seit vor dem Stichtag und ist er
bis heute der geführte, dann galt er auch am Stichtag. Das ist ein Beleg aus der Quelle, keine
Annahme – und er erspart die Rekonstruktion.

**Ein Vorbehalt bleibt.** Der Fortführungsnachweis verzeichnet die *geltenden* Vorschriften. Fehlt
eine dort (`registerAbsent`), ist offen, ob sie am Stichtag noch galt – auch wenn ihre Daten sauber
aussehen. Solche Fälle bleiben `undetermined`, bis das Ereignisregister sie auflöst. Das betrifft die
zehn einzeln geprüften Verwaltungsvorschriften aus `data/audits/bayernrecht/SCOPE_RESOLUTION.md`.

## 3 Stand der Klassifikation

Gemessen an 877 von 2 342 Kandidaten (der Rest lädt noch):

| Klasse | Zahl | Anteil |
| --- | ---: | ---: |
| `unchanged-since-baseline` | 540 | 61,6 % |
| `changed-after-baseline` | 318 | 36,3 % |
| `enacted-after-baseline` | 17 | 1,9 % |
| `identity-or-validity-uncertain` | 2 | 0,2 % |

Ausfertigungsdatum aus dem XML: 864 · aus dem Zitiervorschlag: 11 · nirgends: 2.

Der Anteil ist über wachsende Stichproben stabil geblieben (59,1 % bei 638 geprüften, 61,6 % bei
877). Belastbar wird er erst über den vollständigen Bestand, und er wird sich verschieben, sobald die
Verwaltungsvorschriften überwiegen.

## 4 Wege zur Stichtagsfassung

Für die Klasse `changed-after-baseline` – nach absteigender Beweiskraft:

| Methode | Wann sie greift |
| --- | --- |
| `current-unchanged` | entfällt hier (das ist Klasse 1) |
| `official-historical-fulltext` | Eine amtliche Veröffentlichung liefert den Volltext nahe am Stichtag – einer Neufassung ist immer der Vorzug vor einer Rückrechnung zu geben |
| `reverse-amendment` | Eine Änderung nach dem Stichtag lässt sich **sicher** rückwärts anwenden |
| `forward-reconstruction` | Amtliche Fassung vor dem Stichtag plus **alle** Änderungen bis zum Stichtag |
| `baseline-only-recovered` | Heute nicht mehr geführt, über ein Post-Baseline-Ereignis wiedergefunden |
| `undetermined` | kein sicherer Weg – Review, keine Übernahme |

### Was sich nicht rückwärts anwenden lässt

Eine Änderung ist nur dann invertierbar, wenn der Änderungsbefehl die vorherige Information
**vollständig bestimmt**. Ersetzungen mit genanntem Alt- und Neutext sind es. Nicht invertierbar sind:

* `§ 5 erhält folgende Fassung: …` ohne amtlich vorliegenden Alttext,
* vollständige Neufassungen,
* Aufhebungen eines Absatzes ohne den alten Wortlaut,
* ersetzte Anlagen, Tabellen, Karten oder Abbildungen ohne die alte Datei,
* mehrdeutige Fundstellen, wenn der zu ersetzende Wortlaut mehrfach vorkommt.

In diesen Fällen: `reconstruction-required`. **Kein Raten, keine Näherung, kein erfundener
historischer Normtext.**

### Wie eine Rückrechnung in den Bestand kommt

Die Rückrechnung selbst (`src/reconstruction/`, Rezepte unter `data/imports/bayernrecht/reconstruction/`)
schreibt keine Norm. Der Bulk-Lauf übernimmt eine rückgerechnete Fassung nur, wenn **alle** folgenden
Bedingungen am Paket selbst erfüllt sind (`src/bulk/select.ts`, `src/bulk/norm.ts`):

| Prüfung | Sonst |
| --- | --- |
| Stichtagsentscheidung `reverse-amendment`, Klasse `changed-after-baseline`, Status `active-at-baseline`, keine Blocker | Review (`reconstruction-recipe-unusable`) |
| Rezept vorhanden, gleiche Dokumentkennung, Stichtag 2023-12-01 | Review (`reconstruction-recipe-unusable`) |
| Die zurückgenommene Änderung trat **nach** dem Stichtag in Kraft | Review – sie gehört zur Stichtagsfassung |
| Rezept und Cachepaket haben dieselbe SHA-256 | Review (`reconstruction-recipe-mismatch`) |
| Inkrafttreten der Änderung = Geltungsbeginn des heutigen Textes laut Paket (`inkraft`) | Review (`reconstruction-recipe-mismatch`) |
| Beginn der Stichtagsfassung **belegt** (`baselineTextInForce`, am oder vor dem Stichtag) | Review (`reconstruction-recipe-mismatch`) |
| Verkündung der Änderung unverändert im Cache (SHA-256 wie im Rezept) | Review (`reconstruction-evidence-missing`) |
| Rundlauf: rückwärts, dann vorwärts ergibt byteidentisch den heutigen Körper; der Stichtagskörper hat den geprüften Fingerabdruck | Review (`reconstruction-roundtrip-failed`) |

Eine so übernommene Fassung trägt:
* `sourceStatus` `reconstructed/reconstructed` mit Begründung,
* als Quellgeltung den belegten Beginn und den Tag vor dem Inkrafttreten der Änderung,
* die Änderungsverkündung als Quellreferenz (`official-gazette`, Rolle `amendment-evidence`),
* im Manifest `baselineRecoveryMethod` `reverse-post-baseline-event`, Belege nach Regel B (starker
  Beginn am oder vor dem Stichtag, starker Fortbestand durch die Änderung) und die Verkündungsseite als
  zweites Rohdokument. Sie wird mit dem Paket nach R2 archiviert.

Die Provenienzfelder des Pakets (Zitiervorschlag, Änderungshistorie) bleiben unverändert: Sie
beschreiben die benutzte Quelle, nicht die Stichtagsfassung.

## 5 Was der Stichtagsbestand noch braucht

1. **Ereignisregister** aus GVBl. und BayMBl. für 2023-12-02 bis heute. Es liefert die Änderungen,
   die rückgerechnet werden müssen – und über Aufhebungen und Ersetzungen die Normen, die am Stichtag
   galten und heute fehlen (`baseline-only`). Ohne dieses Register ist der Bestand unvollständig, und
   zwar unbemerkt.
2. **Zielauflösung** jedes Ereignisses auf die Norm, die es betrifft. Ähnliche Titel allein sind nie
   ein starker Beleg.
3. **Vollständigkeitsprüfung**: Zu jeder Aufhebung nach dem Stichtag gehört ein aufgelöster Vorgänger
   oder ein ausdrücklicher `missing-predecessor`-Reviewfall.
4. **Rekonstruktionsschlange** mit den Fällen nach 4, priorisiert nach Zahl der Änderungsschritte –
   Normen mit einer einzigen Änderung nach dem Stichtag zuerst, nicht invertierbare Neufassungen
   zuletzt. Das maximiert den sicher gewonnenen Bestand je Aufwand.

## 6 Die Provenienz der Belege

Die drei Quellen sind **nicht** gleichwertig, und das Datenmodell hält das fest:

| Quelle | Rang |
| --- | --- |
| BayMBl. elektronisch | **amtlich** (`publicationAuthority: electronic-official`) |
| GVBl. elektronisch | **nachrichtlich**; amtlich ist die Druckausgabe (`printed-official`, `digitalRepresentation: official-platform-informational-copy`) |
| BAYERN.RECHT konsolidierter Text | nichtamtlicher Gebrauchstext |

Der konsolidierte Text des Portals ist strukturiert und staatlich angeboten – aber er ist keine
Verkündung. Die normative Provenienz liegt bei den Verkündungsorganen. Ein Evidence Pass, der sich
auf den Portaltext stützt, stützt sich auf eine Bequemlichkeitsfassung.

**Ein Vorteil gegenüber beiden anderen Ländern:** Die Verkündungsplattform veröffentlicht zu jeder
GVBl.-Ausgabe selbst eine SHA-256-Prüfsumme. Die Integrität der Belege lässt sich damit gegen die
Quelle prüfen, statt gegen nichts.
