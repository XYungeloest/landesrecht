# Bereitschaft des BayWü-Ausgangsimports

**Stand 2026-09-17 · Ergebnis: NOT READY — aber lösbar, und die Punkte sind benannt.**

Gegenstück zu `docs/RECHT_NRW_BULK_READINESS.md` (West, READY) und
`docs/SCHLESWIG_HOLSTEIN_BULK_READINESS.md` (NSH, gesperrt). BayWü liegt dazwischen: Die Quelle ist
zugänglich, der Weg ist klar, drei Punkte sind offen.

**BayWü bleibt in diesem Stand lokal.** Kein R2-Objekt, kein Remote-Apply, kein Worker-Deploy. Das
ist keine technische Grenze, sondern die Vorgabe des Laufs.

**Eine Berichtigung dazu.** Eine frühere Fassung dieses Dokuments behauptete, für BayWü sei keine
Cloudflare-Ressource angelegt. Das ist falsch, und der Readiness-Check hat es gefunden:
`apps/web/wrangler.jsonc` trägt für `landesrecht-baywue` die Datenbankkennung
`091224a9-da55-4262-b682-2b6bde0bd302`. Sie ist keine Platzhalter-ID und stammt aus Commit
`f7bf69b7` („RECHT.NRW Bulkimport deploy"), wo sie zusammen mit West, NSH und Ost gesetzt wurde – aus
einem früheren Auftrag, nicht aus diesem Lauf.

Was daraus folgt und was nicht, nach den lokal prüfbaren Spuren:

* Die D1 **besteht**. Dieser Lauf hat sie weder angelegt noch verändert; `apps/web/wrangler.jsonc` ist
  unverändert.
* Es wurde **nie etwas hineingeschrieben**: Ein Apply-Zustand existiert ausschließlich für
  `landesrecht-west` (`data/runtime/d1-batches/landesrecht-west/`), `content/norms/` führt allein
  `west`, und kein Manifest nennt ein R2-Objekt unter dem Präfix `baywue/`. Es gibt schlicht keinen
  BayWü-Bestand, den man hätte projizieren können.
* Eine unprojizierte D1 ist für die Laufzeit kein Fehler, sondern ein leerer Zustand
  (`packages/runtime/src/d1-store.ts`, `tests/unit/runtime-unprojected-d1.test.ts`). Die BayWü-Seiten
  antworten leer, nicht mit HTTP 500.
* Ob die Datenbank bei Cloudflare tatsächlich leer ist, lässt sich **von hier aus nicht belegen** –
  das erforderte einen Remote-Aufruf, und der unterbleibt. Die Aussage oben stützt sich allein auf
  lokale Spuren.

`readiness` führt das als Blocker, und das bleibt es auch: Solange Dokument und Konfiguration
auseinandergehen, ist die Lage nicht entschieden. Auflösen lässt sich das auf zwei Wegen – die
Ressource bewusst behalten und hier so festhalten (dann ist der Blocker eine Bestätigung, die der
Nutzer setzt), oder sie entfernen. Beides ist eine Entscheidung des Projekts.

## 1 Was steht

| Baustein | Stand | Nachweis |
| --- | --- | --- |
| Quellenerkundung | abgeschlossen | `docs/BAYERN_SOURCE_DISCOVERY.md`, 981 Zeilen, Rohbefunde unter `data/audits/bayernrecht/discovery/` |
| Zugriffslage | geklärt | `robots.txt`: `User-agent: *` / `Allow: /` |
| Zustandsschicht | fertig | `src/common/` (Manifest, Evidenz, Review, Overrides, Slug-Registry) |
| Enumeration | fertig, Fixpunkt | 2 413 Dokumente, zweiter Lauf byte-identisch, `--offline` mit 0 Netzabrufen |
| Abdeckungslücke | aufgeklärt bis auf 11 | `data/audits/bayernrecht/ENUMERATION_GAP.md` |
| Beispielkorpus | fertig | 28 Normen, 17 Strukturfälle, `data/imports/bayernrecht/corpus.json` |
| Parser | fertig für den Korpus | beide DTDs, 28/28 im Melde- **und** im strengen Modus |
| Überleitung Bayern → BayWü | fertig | `src/transform/`, Idempotenz konstruiert, 52 Prüfungen |
| Weg über alle Bausteine | geprüft | 28/28 Rohpaket → Parser → Überleitung → `validateNormRecord`, als Test in der Suite |
| Tests | 181 für BayWü | `bayernrecht-{state,enumerate,corpus,parse,transform}.test.ts` (24/25/12/68/52) |

### Enumeration

Zwei unabhängige Quellen, wie die Checkliste es verlangt:

| Bereich | Fortführungsnachweis | Portalfacette | Enumeration |
| --- | ---: | ---: | ---: |
| `landesrecht` (241 ges · 486 rv · 208 vertr) | 872 | 935 | **935** |
| `vwv` | 1 439 | 1 478 | **1 478** |
| gesamt | 2 311 | 2 413 | **2 413** |

Der Normtyp kommt **ausschließlich** aus der Facette. Die Endbuchstaben der BayRS-Nummer bezeichnen
das Ressort, nicht die Rechtsform – wer daraus den Typ ableitet, liegt systematisch falsch.

### Parser

Zwei Frontends, ein Zielmodell: `byrecht-norm` (Gesetze, Verordnungen, Verfassung, und – entgegen der
naheliegenden Regel – auch manche Verwaltungsvorschrift) und `byrecht-vv`. Fail-closed: ein
unbekanntes Element bricht ab oder erzeugt einen Befund, nie ein stilles Weglassen.

Der Sprung von 4 auf 28 Pakete brachte **elf** neue Strukturen zutage, die die vier Ausgangsinstanzen
nicht zeigten. Das ist die wichtigste Zahl dieses Abschnitts, denn sie sagt etwas über den nächsten
Sprung: 28 von 2 311 Dokumenten sind 1,2 %. Der Meldemodus (`unknown: 'report'`) existiert genau
dafür – der erste Vollabzug wird weitere Strukturen zeigen, und er soll sie melden, nicht abbrechen.

Zwei Entscheidungen im Parser tragen mehr als ihr Umfang vermuten lässt:

- **`Aenderungsinhalt` ist ein Zitat, kein eigener Normtext.** Ein Änderungsbefehl führt den neuen
  Wortlaut der geänderten Vorschrift mit. Als `quotedProvision` geführt und ohne Portaladresse: Der
  zitierte `Art. 1 BayHO` in der VV-BayHO hätte sonst den Permalink `VVBayHO-1` bekommen und damit
  fremdes Recht als eigenes ausgewiesen. Nachgeprüft: 117 zitierte Vorschriften in der VV-BayHO,
  74 im TV-L, keine davon mit Adresse.
- **`@builddate` bleibt aus jedem Fingerabdruck heraus.** Das Portal baut den Export täglich neu;
  ginge der Zeitstempel ein, gälte am nächsten Tag jede Norm als geändert. Ebenso der SHA-256 des
  Pakets, denn das Paket enthält den Zeitstempel.

## 2 Was fehlt

### 2.1 Die elf ungeklärten Dokumente (sperrend für einen vollständigkeitsgeprüften Bulk)

Von 102 Dokumenten, die nur die Facette kennt, sind 91 erklärt: 56 Tarifverträge (keine
Rechtsvorschriften des Freistaats), 14 bundeseinheitliche Anordnungen (im Bundesanzeiger bekannt
gemacht), 19 mit anderweitig belegter Gliederungsstelle, 2 Haushaltsrundschreiben alten Schemas.

Für **elf** trägt keine dieser Erklärungen. Die naheliegende Vermutung „nicht im Amtsblatt verkündet“
ist widerlegt: Zwei davon nennen ausdrücklich eine BayMBl.-Fundstelle und fehlen im
Fortführungsnachweis trotzdem. Der Nachweis nennt kein Aufnahmekriterium. Sie sind einzeln
aufgelistet und vor einem Bulk einzeln zu prüfen.

Die Lücke ist **einseitig**: Jede ID des Fortführungsnachweises steht auch in der Facette
(Gegenrichtung 0). Es fehlt also nichts aus der Enumeration – die Frage ist nur, ob die 102 hinein
gehören.

### 2.2 Die historische Baseline (der eigentliche Aufwand)

BAYERN.RECHT führt **keine historischen Fassungen**. Belegt durch den Wortlaut der Portalhilfe, das
fehlende Auswahlelement in der Dokumentkopfleiste und durchgängiges `version="p"` im XML. Der Stichtag
2023-12-01 ist aus dem Portal direkt nicht erreichbar.

Der Weg dorthin, in dieser Reihenfolge:

1. **Vollabzug des heutigen Standes.** Rund 2 311 ZIP-Abrufe, bei 1,5 s Abstand etwa eine Stunde.
   Liefert mit `rumpf/aenderungsverlauf` die Zeitinformation gleich mit.
2. **Partitionieren.** Je Norm prüfen, ob der Änderungsverlauf einen Eintrag nach 2023-12-01 trägt.
   Für den unveränderten Teil ist der heutige Text zugleich der Stichtagstext – das ist ein Beleg aus
   dem Änderungsverlauf, keine Annahme. Im Beispielkorpus liegt das Verhältnis bei 12 zu 9; über den
   Gesamtbestand ist es unbekannt und wird erst der Vollabzug zeigen.
3. **Nur für den geänderten Rest** zurückrechnen: GVBl. über `?volume=<jahr>`, BayMBl. über den
   CSV-Jahreslistenexport. Änderungsbefehle rückwärts anwenden.
4. **Erst danach entscheiden**, ob die Rückrechnung den Aufwand wert ist oder ob die Simulation mit
   einem dokumentierten Stichtagsversatz arbeitet. Diese Entscheidung ist fachlich, nicht technisch.

**Ein Vorteil gegenüber beiden anderen Ländern:** Die Verkündungsplattform veröffentlicht zu jeder
GVBl.-Ausgabe selbst eine SHA-256-Prüfsumme. Ein Evidence Pass kann sich darauf stützen, statt eigene
Hashes gegen nichts zu prüfen. Für den Stichtag sind Ausgabe 22/2023 (30.11.2023) die letzte davor und
23/2023 (14.12.2023) die erste danach.

**Und ein Fallstrick:** Die elektronische Fassung des GVBl. ist **nicht amtlich** – amtlich ist allein
die Papierausgabe. Für das BayMBl. gilt das Gegenteil: dort ist die elektronische Form seit 2019
amtlich. Zwei Blätter desselben Landes, zwei Evidenzlagen. Das gehört in die Beweisklasse, nicht in
eine Fußnote.

### 2.3 Scope-Entscheidungen, die vor dem Bulk fallen müssen

Keine davon ist technisch; alle brauchen eine Festlegung in `docs/LEGAL_SCOPE.md`:

- Gehören **Tarifverträge** (56) in den Landesrechtsbestand? Der Parser liest sie und meldet jedes
  Mal `norm-type-out-of-model`; die Auswahl trifft das Review.
- Gehören **bundeseinheitliche Anordnungen** (14, MiStra, RiStBV, ZRHO …) dazu?
- Was geschieht mit **Abbildungen**? Das Blockmodell in `legal-core` kennt keinen Bildblock. Der
  Parser überträgt sie deshalb nicht in den Normtext, legt die Datei mit SHA-256 als Beilage ab und
  meldet `graphic-not-transferred`. Ein Bildblock wäre eine Schemaänderung und berührt den
  eingefrorenen West-Bestand – also ein eigener Schritt, keine Parserfrage.

## 3 GO/No-Go

| # | Prüfpunkt | Stand |
| --- | --- | --- |
| 1 | Zulässiger Zugang zu konsolidierten Normtexten | **ja** (`Allow: /`) |
| 2 | Maschinenlesbares Quellformat | **ja** (ZIP/XML je Norm, zwei DTDs) |
| 3 | Enumeration konvergiert (Fixpunkt) | **ja** (ein Rebuild, zweiter byte-identisch) |
| 4 | Enumeration vollständig belegt | **nein** – 11 Dokumente ungeklärt |
| 5 | Parser deckt den Beispielkorpus ab | **ja** (28/28, streng und meldend) |
| 5a | Ganzer Weg bis zur geprüften Zielnorm | **ja** (28/28, `validateNormRecord` eingeschlossen) |
| 6 | Parser deckt den Gesamtbestand ab | unbekannt – 28 von 2 311 geprüft |
| 7 | Stichtagsstrategie belegt | **Weg belegt**, Aufwand erst nach dem Vollabzug bezifferbar |
| 8 | Scope festgelegt (Tarifverträge, Bundesanordnungen, Abbildungen) | **nein** – fachliche Entscheidung offen |
| 9 | Überleitung Bayern → BayWü | **ja** – Idempotenz konstruiert und geprüft (`docs/BAYERN_TRANSFORMATION.md`) |
| 10 | Slug-Kollisionsfreiheit | **ja** (Suffix `-baywue`; `-bay`, `-by`, `-bayern` sind harte Fehler) |
| 11 | R2-Präfix kollisionsfrei | **ja** (`baywue/bayernrecht/2023-12-01`), nicht belegt |
| 12 | BayWü ohne Cloudflare-Schreibzugriff | **ja** – aber die D1 besteht bereits (siehe unten) |

**Ergebnis: NOT READY.** Sperrend sind Punkt 4 (elf Dokumente) und Punkt 8 (Scope).

## 4 Nächste Schritte in der Reihenfolge ihres Werts

1. **Die elf ungeklärten Dokumente** einzeln prüfen.
2. **Scope entscheiden** (`docs/LEGAL_SCOPE.md`): Tarifverträge, bundeseinheitliche Anordnungen,
   Abbildungen.
3. **Vollabzug im Meldemodus**, dann die neuen Strukturen aus den Befunden nachziehen – nicht vorher
   raten. Der Sprung von 4 auf 28 Pakete brachte elf neue Strukturen; der auf 2 311 wird weitere
   bringen.
4. **Partitionieren** nach Änderungsstand relativ zum Stichtag; erst dann über die Rückrechnung des
   geänderten Rests entscheiden.
