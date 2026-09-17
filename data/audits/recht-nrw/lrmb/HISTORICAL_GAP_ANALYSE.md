# Historische LRMB-Lücken (`historical-gap`) – Analyse und Vorschläge

```text
Stand            16./17. September 2026, Stichtag 2023-12-01
Grundlage        Manifest (3 157 LRMB-Einträge), Audit-Reports, Review-Queue, Enumeration (Suchindex),
                 netzfreier Quellcache (5 961 LRMB-Seiten, 243 Ministerialblatt-Einträge) – kein Netzabruf
Werkzeug         npm run import:recht-nrw:review-report -- --write
                 → lrmb/historical-gap.json, lrmb/HISTORICAL_GAP_STATISTIK.md (Zahlen, Top-Listen)
                 Module: lrmb/historical-gap.ts, lrmb/repeal-patterns.ts, common/review-sources.ts
Fälle            2 396 Stammnormen mit Befund validity-undetermined (größte Review-Gruppe: 2 396 von 5 759
                 blockierenden LRMB-Befunden; bei 2 117 Stammnormen der einzige Blocker)
Grundsatz        Der Fünf-Bedingungen-Kontinuitätsnachweis (docs/RECHT_NRW_LRMB_IMPORT.md, Abschnitt 4) bleibt
                 unverändert. Nichts in diesem Bericht ändert eine Geltungsentscheidung; Belegklassen sind
                 Arbeitshilfen, Nachfolgebelege sind Prüfhinweise, keine Relationen.
```

> **Stand nach dem Evidence Pass (17. September 2026, LRMB-Parser 1.3.0):** Die Vorschläge P1, P2 und P4 sind in die
> Geltungsentscheidung übernommen (`lrmb/validity.ts`, Beweisklassen und Regeln in `docs/RECHT_NRW_BULK_READINESS.md`,
> Abschnitt „Evidence Pass“); P3 bleibt der Fünf-Bedingungen-Nachweis. Die Offline-Simulation über den ganzen Bestand
> (`EVIDENCE_PASS.md`/`.json`) weist die Wirkung je Regel und die Fälle ohne Beleg aus; verbindlich wird sie erst mit
> der Regeneration des Bestands. Die Zahlen unten beschreiben den Stand vor dem Evidence Pass.

## 1. Woran die Fälle scheitern

Alle 2 396 Fälle sind undatierte SMBl-Altdatensätze (keine Fassungsliste, kein „Gültig ab“, keine
Portalintervalle). Die Stichtagsprüfung (`lrmb/validity.ts`) verlangt für sie (a) einen belegten Beginn vor dem
Stichtag **und** (b) eine spätere Änderung nach dem Stichtag, deren Ministerialblatt-Eintrag alle fünf
Kontinuitätsbedingungen erfüllt.

| Grund (`reasonText`) | Fälle | Bedeutung |
| --- | --- | --- |
| kein belegter Beginn vor dem Stichtag | 2 150 | weder Inkrafttretensklausel mit Datum noch zugeordnete Änderung vor dem Stichtag |
| Beginn belegt, aber keine Änderung nach dem Stichtag | 237 | Vorschrift seit dem Stichtag nicht geändert – Bedingung (b) ist strukturell unerfüllbar |
| spätere Änderung ohne Kontinuitätsbeleg | 9 | Ministerialblatt-Eintrag vorhanden, aber eine der fünf Bedingungen scheitert |

Was der Bestand für diese Fälle bereits liefert (netzfrei):

| Merkmal | Fälle | Quelle |
| --- | --- | --- |
| Ausfertigungsdatum bekannt | 2 396 (Titel 1 415, Erlasskopf 686, nur Suchindex 292; 3 ohne) | `parseDecreeFromTitle`, Erlasskopf, `field_date_of_issue` |
| Stammfundstelle (MBl./SMBl.) bekannt | 1 251 | Fundstellenverlauf, Fußzeile der Seite |
| Fundstellenverlauf vorhanden | 1 284 | Textende der Seite |
| … davon mit zugeordnetem Ministerialblatt-Eintrag | 58 | `lrmb/gazette.ts` (Datum + Fundstelle) |
| SMBl-Gliederungsnummer maschinenlesbar | 27 | nur aus Dateinamen von Anlagen (`smbl_<nr>_…`) |
| Suchindex `field_historically = true` | 1 745 | Enumeration (unzureichender Beleg) |
| Suchindex `field_outforce_date` ≤ Stichtag | 169 | Enumeration (unzureichender Beleg); 99 davon mit weiterem Beleg |

Die SMBl-Gliederungsnummer – der Schlüssel der Sammlung – steht auf den Seiten nur als Texterkennungsrest
(Fußnote „¹) … SMBl. NRW. 20020“) und ist deshalb fast nie maschinenlesbar. Das begrenzt jede automatische
Zuordnung; sie muss auf Ausfertigungsdatum plus MBl-Fundstelle beruhen.

## 2. Belegklassen (Ergebnis der Stichprobenanalyse über alle 2 396 Fälle)

| Klasse | Fälle | Was vorliegt | Bewertung |
| --- | --- | --- | --- |
| `self-expiry-before-baseline` | 88 | Der eigene Text nennt ein Ende vor dem Stichtag: „gilt bis zum 31.12.2006“, „Sie treten mit Ablauf des Haushaltsjahres 2016 außer Kraft“, „tritt zum 31. Dezember 2013 außer Kraft“ (86 mit Tagesdatum, 2 mit Jahresende; 62 Richtlinien, 18 Runderlasse, 8 VwV; Enden 1990er 2, 2000er 44, 2010er 37, 2020er 5) | **starker amtlicher Beleg** – die Pipeline liest diese Formen nicht (`parseValidityClauses` kennt nur „am/mit Ablauf des <Datum> außer Kraft“) |
| `successor-strong` | 79 (85 Aussagen, 84 Fälle mit mindestens einer starken) | Eine andere Vorschrift des Bestands hebt die Vorschrift mit Ausfertigungsdatum **und** MBl-Fundstelle (78), Aktenzeichen (2) oder SMBl-Nummer (1) auf oder setzt sie außer Kraft: 45 „wird aufgehoben“, 33 „tritt außer Kraft“, 1 Ablösung, 1 Neufassung. Aufhebende Vorschrift in 75 Fällen vor dem Stichtag erlassen, in 10 danach | **starker Gegenbeleg der Fortgeltung** (Aufhebung ≤ Stichtag) bzw. **Beleg des Fortbestands bis zur Aufhebung** (Aufhebung > Stichtag) |
| `successor-weak` | 290 | Aufhebungs-/Außerkrafttretensaussage mit übereinstimmendem Datum, aber ohne Fundstelle/Nummer (55 mit Titelstichwort; 266 mit genau einem Kandidaten) | Prüfhinweis – Datumsgleichheit allein reicht nicht |
| `amendment-chain-identified` | 54 | Fundstellenverlauf mit zugeordneten Ministerialblatt-Änderungen (letzte Änderung 2017–2026), aber Inkrafttreten nicht belegbar, Kette unvollständig oder keine Änderung nach dem Stichtag (36 „keine spätere Änderung“, 11 „kein Beginn“, 7 Kontinuität gescheitert) | Einzelfallarbeit nahe am Ziel; oft fehlt nur das Inkrafttreten einer Änderung |
| `amendment-chain-unidentified` | 14 | Fundstellenverlauf, aber kein Eintrag zuordenbar (Seitenkollision, 404, Titel ohne Datum) | Einzelfall |
| `in-force-clause-only` | 204 | Inkrafttretensklausel (130 mit Datum → Beginn belegt, aber keine spätere Änderung; 74 „am Tag nach der Veröffentlichung“ ohne Datum → Beginn nicht belegt) | Bedingung (b) strukturell unerfüllbar bzw. Veröffentlichungsdatum fehlt |
| `index-outforce-only` | 70 | nur `field_outforce_date` ≤ Stichtag | unzureichend; nur Ordnungshinweis |
| `no-signal` | 1 597 | nichts außer Ausfertigungsdatum (und ggf. Stammfundstelle): 1 305 Runderlasse; Ausfertigung 1950er–2000er (1960er 206, 1970er 320, 1980er 272, 1990er 333, 2000er 266); Suchindex „historisch“ bei 1 157; 723 mit Fundstellenverlauf ohne Änderungen | Altbestand ohne jede Fortgeltungsspur im Portal |

Prioritätsbänder der 2 396 Fälle (`common/review-priority.ts`): A 29, B 988, C 1 370, D 9.

### Stichproben (Term-IDs aus `HISTORICAL_GAP_STATISTIK.md`)

- **Eigene Befristung:** term:31102 „VV zur Haushaltssystematik … 2014“ – „Sie treten mit Ablauf des
  Haushaltsjahres 2016 außer Kraft.“; term:29201 „Richtlinien … Technologie- und Innovationsprogramm“ – „gelten bis
  zum 30.09.2012“; term:24705 „VV BauO NRW 2000“ – „Diese Verwaltungsvorschrift gilt bis zum 31. Dezember 2005.“
  Für alle drei ist die Geltung am Stichtag durch den eigenen Text ausgeschlossen; die Pipeline meldet trotzdem
  `undetermined`.
- **Aufhebung vor dem Stichtag (stark):** term:23482 (RdErl. v. 12.11.1975, SMBl. 20322) wird durch term:28793
  (2004) aufgehoben: „Meine Runderlasse zu § 67 BBesG vom 12.11.1975 (SMBl. NRW. 20322) und zu § 68 a BBesG vom
  30.6.1978 (MBl. NRW. S. 1105/SMBl. NRW. 20320) werden aufgehoben.“; term:23498 (RdErl. v. 2.7.2002, MBl. S. 812)
  aufgehoben durch term:31044 (2014); term:23525 aufgehoben durch term:30774 (2013).
- **Aufhebung nach dem Stichtag (stark):** term:23500 „Richtlinien über die Vergütung von Prüfungstätigkeiten“
  (28.10.1969, Fundstellenverlauf bis 2023) tritt laut term:34223 (20.12.2024) außer Kraft; term:29313 laut
  term:34596 (2026); term:23434 „VV Ausbildung der Referendarinnen … vom 13. Juli 1994“ laut term:34465 (2025).
  Diese Vorschriften haben nachweislich bis nach dem Stichtag existiert – ein amtlicher Fortbestandsbeleg, den der
  Fünf-Bedingungen-Nachweis (nur Änderungen) heute nicht verwertet.
- **Nur Datum (schwach):** 290 Fälle, z. B. Aufhebungssätze ohne Fundstelle („Der Runderlass vom 15.3.1962 wird
  aufgehoben“). 266 haben genau einen Kandidaten; mit Titelstichwort 55.

## 3. Vorschläge (nur fachlich belastbare, amtliche Belege; kein Absenken der Belegpflicht)

| # | Vorschlag | Belegwert | Wirkung (geschätzt) | Eingriff |
| --- | --- | --- | --- | --- |
| P1 | `parseValidityClauses` erweitern: „gilt/gelten bis (zum) <Datum>“, „ist befristet bis <Datum>“, „tritt zum <Datum> außer Kraft“, „mit Ablauf des (Haushalts-)Jahres <JJJJ> außer Kraft“ (= 31.12.), „tritt … in Kraft und am <Datum> außer Kraft“ (letzte Datumsangabe vor „außer Kraft“). Muster und Regressionstests liegen in `lrmb/repeal-patterns.ts` (`effectiveIn`, Testdatei `tests/unit/recht-nrw-lrmb-repeal.test.ts`) | strong (Selbstaussage des amtlichen Textes) | 88 Fälle wechseln von `undetermined` zu `not-active-at-baseline` (Befund `validity-expired-before-baseline`, Review `metadata-conflict`, weil das Portal kein „Gültig bis“ zeigt – wie heute bei 285 datierten Fällen). Kein Import, nur präzisere Einordnung | fail-closed (nie Übernahme); Regression auf importierte Normen: Klausel nach dem Stichtag ändert Belege, aber keine Übernahme (ggf. `metadata-validity-conflict` bei Widerspruch zu „Gültig bis“); **LRMB_PARSER_VERSION erhöhen** |
| P2 | Neue Belegart `successor-repeal` (Manifest `validityEvidence.kind`) aus `matchRepealStatements`: nur `strong` (Datum + MBl-Fundstelle/SMBl-Nummer/Aktenzeichen), nur wenn die aufhebende Vorschrift archiviert ist (SHA-256) und ihr Inkrafttreten belegt ist. (a) Aufhebung ≤ Stichtag → `not-active-at-baseline`; (b) Aufhebung > Stichtag → Fortbestandsbeleg als Ersatz für Bedingung (b) des Kontinuitätsnachweises, wenn same-stem (Datum + Fundstelle), explicit-repeal, no-contrary-between (keine frühere Aufhebung/Neufassung) und Beginn vor dem Stichtag belegt sind | strong (amtlicher Text einer späteren Vorschrift) | (a) 75 Fälle zu „nicht geltend“; (b) höchstens 10, davon 3 mit belegtem Beginn – Kandidaten für die Übernahme | Policyänderung (docs/RECHT_NRW_LRMB_IMPORT.md Abschnitt 4), Manifestschema (neue Belegart), Parserversion; fachliche Freigabe je Fall bleibt (Override oder Prüfliste) |
| P3 | Veröffentlichungsdatum der Stammfundstelle nutzen: für 74 Fälle mit Klausel „am Tag nach der Veröffentlichung“ ohne Datum kann der Ministerialblatt-Eintrag der Stammfundstelle (`MBl. NRW. <Jahr> S. <Seite>` → `/mblnrw/<Jahr>-s<Seite>`) das Veröffentlichungsdatum liefern (`lrmb/gazette.ts`, `resolveInForceDate`) | strong (Ministerialblatt) | bis zu 74 Fälle erhalten einen belegten Beginn; ändert den Status nur zusammen mit (b) | ≈ 1 Netzabruf je Fall (nicht in diesem Lauf); Pipelineänderung klein |
| P4 | Fundstellenketten aus dem Ministerialblatt: den Nachfolgeindex (`buildSuccessorIndex`) auf alle Ministerialblatt-Einträge ausdehnen. Heute liegen nur 243 Einträge (die für Änderungen abgerufenen) im Cache; alle Einträge der Jahrgänge 2015–2026 würden Aufhebungen und Neufassungen älterer Vorschriften systematisch nachweisen | strong (bei Datum + Fundstelle) | unbekannt; Erwartung aus der Stichprobe: bei 5 961 Seiten fanden sich 657 Aussagen über andere Vorschriften, davon 85 stark zuordenbar | Netzabrufe: Ausgabenverzeichnisse (≈ 40 je Jahr) und Einträge (mehrere hundert je Jahr) – nur als eigener, budgetierter Bulk-Lauf; vorher Jahresregister-Struktur des Portals prüfen |
| P5 | SMBl-Nummer aus der Seitenfußnote lesen (Texterkennungsreste „¹) … SMBl. NRW. 20020“, `citationFooter` des Parsers) und in `matchRepealStatements` als Merkmal nutzen | supporting (stärkt die Zuordnung, ersetzt kein Datum) | schwache Nachfolgebelege (290) könnten teilweise zu starken werden | Parserergänzung ohne Statuswirkung |
| P6 | Priorisierung der manuellen Prüfung: zuerst `successor-strong` (79) und `self-expiry` (88) – hier steht die Entscheidung mit einem Satz aus dem Bestand fest; dann `amendment-chain-identified` (54) mit fehlendem Inkrafttreten; `successor-weak` mit Titelstichwort (55) | – | Arbeitsplanung; Reviewzahlen sinken nur durch Entscheidungen | Arbeitsliste `review/work-lists/historische-luecken.md` |

**Nicht vorgeschlagen:** Suchindex-Signale (`field_historically`, `field_outforce_date`) als Beleg zu werten
(bleiben `insufficient`), Datumsgleichheit ohne Fundstelle als Zuordnung, automatische Relationen zwischen
Vorschriften, Massenentscheidungen über Belegklassen.

## 4. Strukturelle Grenze und offene Policyfrage

237 Fälle (Grund „Beginn belegt, aber keine Änderung nach dem Stichtag“) und die 130 Fälle mit datierter
Inkrafttretensklausel ohne spätere Änderung betreffen Vorschriften, die seit dem Stichtag nicht geändert wurden.
Für sie kann Bedingung (b) nie erfüllt werden, obwohl gerade unveränderte, aktuell in der SMBl-Sammlung geführte
Vorschriften typische Kandidaten für geltendes Recht sind. Amtliche Belege, die hier helfen könnten, ohne den
Nachweisstandard zu senken:

1. eine spätere amtliche Aufhebung (P2 b) – belegt den Fortbestand bis zur Aufhebung;
2. ein datierter Bestandsnachweis der SMBl-Sammlung nach dem Stichtag (Aufnahme oder Fortführung in der
   Gliederungsübersicht des Portals mit Datum) – wäre als eigene Belegart mit Belegstärke `supporting` zu
   definieren und nur zusammen mit einem belegten Beginn zu verwenden; ob das Portal ein datiertes
   Gliederungsverzeichnis anbietet, ist noch zu prüfen (kein Abruf in diesem Lauf);
3. Bezugnahmen späterer amtlicher Texte („in der jeweils geltenden Fassung“, Verweise in Änderungen anderer
   Vorschriften) – als `supporting`, nie allein.

Ob diese Belegarten zugelassen werden, ist eine fachliche Entscheidung (docs/LEGAL_SCOPE.md); dieser Bericht
empfiehlt nur P1–P3 und P5 als belastbar und P4/P6 als vorbereitende Schritte.

## 5. Was bewusst nicht geändert wurde

- `lrmb/validity.ts`, `lrmb/text-metadata.ts` und `LRMB_PARSER_VERSION` sind unverändert: Die neue Erkennung
  (`lrmb/repeal-patterns.ts`) läuft nur im Review-Report. Eine Übernahme in die Pipeline (P1/P2) ändert die
  Ausgabe importierter Normen (Belege, ggf. Konfliktbefunde) und verlangt die Erhöhung der Parserversion sowie die
  Regeneration des LRMB-Bestands (3 157 Einträge, Readiness-Prüfung „keine veralteten Importe“).
- Die Review-Queue wurde nicht verändert; keine Entscheidung wurde vorweggenommen.
