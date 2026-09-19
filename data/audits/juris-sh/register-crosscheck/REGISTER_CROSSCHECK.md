# Registerabgleich juris SH – unabhängige Nachrechnung

Erzeugt von `node packages/importers/juris-sh/src/audit/register-crosscheck-run.ts --write` (netzfrei). Prüft die
Readiness-Kennzahl `zweite-quelle` der Inventur (`CORPUS_INVENTORY.md` §3). **Die Schwelle ist ein Prüfindikator,
kein Ziel**; hier wird nichts auf sie hin optimiert, und es werden keine neuen Ausschlüsse eingeführt.

Enumerierte juris-Dokumente: 5197, davon mit gelesenem PDF-Kopf 5195.

Stufen: `gl` Gliederungsnummer (VwV-Köpfe mit mehreren Nummern werden geteilt) · `gl-variant` Nummer bis auf
führende Nullen · `fundstelle` Blatt/Jahrgang/Seite **und** Ausfertigungsdatum gleich · `title-date` Titelanfang **und**
Datum gleich · `gl-amendment-only` Nummer nur an Änderungsakten (Stammfassung nicht belegt) · `title-only` nur Titelanfang (Altregel) · `none`. „Streng“ = gl + gl-variant + fundstelle + title-date.

## gvobl-systematische-uebersicht (landesrecht, Stand 2024-12-13)

| Kennzahl | Nenner der Inventur (nur Einträge mit Registerereignis) | voller Registerbestand |
| --- | --- | --- |
| Inventur gemeldet | 869/897 = 96.9 % | – |
| Einträge / ausgeschlossen | 938 / 41 | 1788 / 61 (davon ohne Ereignis 860) |
| Altregel nachgerechnet (Nummer ungeteilt oder Titelanfang) | 869/897 = 96.9 % | 1567/1727 = 90.7 % |
| davon allein über den Titelanfang | 22 | 46 |
| Nummer in irgendeinem juris-Dokument (gl + gl-amendment-only) | 847 = 94.4 % | 1521 = 88.1 % |
| **nur Gliederungsnummer (gl, ohne reine Änderungsakt-Treffer)** | **847/897 = 94.4 %** | **1521/1727 = 88.1 %** |
| stabile Kennung (gl + gl-variant + fundstelle) | 855 = 95.3 % | 1542 = 89.3 % |
| streng (stabile Kennung + title-date) | 858 = 95.7 % | 1546 = 89.5 % |
| Nenner-Titel aus Änderungsbefehl (fremder Titel) / davon ausgeschlossen / davon per Nummer in juris | 29 / 19 / 17 | – |
| Nenner-Nummern ohne eigenen Registerkopf | 10 (1131-1, 1131-2, 850-1, 200-0-203, 200-0-250, 200-0-386, 2130-14, 2130-0-25, 2013-2-47, 2186-20) | – |
| je Stufe | gl 847 · gl-variant 0 · fundstelle 8 · title-date 3 · gl-amendment-only 0 · title-only 12 · none 27 | gl 1521 · gl-variant 1 · fundstelle 20 · title-date 4 · gl-amendment-only 0 · title-only 24 · none 157 |
| nur Einträge ohne Registerereignis: gl / streng | – | 667/822 = 81.1 % / 82.8 % |

**Ausschlüsse je Kategorie (voller Registerbestand).** Gegenbeispiel = ausgeschlossen, obwohl juris ein Dokument mit derselben Nummer (oder Fundstelle + Datum) führt.

| Kategorie | Einträge | Gegenbeispiele | ohne jedes Merkmal |
| --- | --- | --- | --- |
| aenderung | 21 | 7 | 13 |
| aufhebung | 26 | 9 | 17 |
| bereinigung | 2 | 0 | 2 |
| neuregelung-neuordnung | 6 | 3 | 3 |
| anpassung | 4 | 3 | 1 |
| neufassung | 2 | 0 | 2 |

Gegenbeispiele: 114-5 (aenderung), 2120-5 (aenderung), 2251-28 (aenderung), 2251-29 (aenderung), 230-1-1 (aenderung), 7816-7 (aenderung), 7816-8 (aenderung), 1101-11 (aufhebung), 2033-3 (aufhebung), 2170-1-6 (aufhebung), 224-1-24 (aufhebung), 224-1-26 (aufhebung), 224-1-27 (aufhebung), 641-3 (aufhebung), 707-8 (aufhebung), 753-2-141 (aufhebung), 200-0-354 (neuregelung-neuordnung), 2020-13 (neuregelung-neuordnung), 2186-15 (neuregelung-neuordnung), 450-1 (anpassung), 450-2 (anpassung), 791-6-2 (anpassung).

**Handprüfung der Titel-Treffer:** 46/46 geprüft. Urteile im Inventur-Nenner: gleiche Norm 10 · wahrscheinlich gleiche Norm 2 · andere Norm 10; im vollen Bestand: gleiche Norm 27 · andere Norm 17 · wahrscheinlich gleiche Norm 2.

**Altregel nach Handprüfung** (Titel-Treffer „andere Norm“/„andere Fassung“ abgezogen): Inventur-Nenner 859/897 = 95.8 % · voller Bestand 1550/1727 = 89.8 %.

**Titel-Treffer der Altregel ohne Nummerntreffer: 46** (automatische Einordnung: corroborated 22 · contradicted-by-date 19 · uncorroborated 4 · ambiguous-several-candidates 1).

**Streng nicht gefunden: 181** (none 157, title-only 24, gl-amendment-only 0); Ausgänge der streng zugeordneten Dokumente: import-ready 991 · not-at-baseline 92 · reconstruction 41 · review 475.

## ab-erlassverzeichnis (vwv, Stand 2024-09-30)

| Kennzahl | Nenner der Inventur (nur Einträge mit Registerereignis) | voller Registerbestand |
| --- | --- | --- |
| Inventur gemeldet | 225/234 = 96.2 % | – |
| Einträge / ausgeschlossen | 246 / 12 | 846 / 29 (davon ohne Ereignis 600) |
| Altregel nachgerechnet (Nummer ungeteilt oder Titelanfang) | 225/234 = 96.2 % | 729/817 = 89.2 % |
| davon allein über den Titelanfang | 12 | 59 |
| Nummer in irgendeinem juris-Dokument (gl + gl-amendment-only) | 218 = 93.2 % | 684 = 83.7 % |
| **nur Gliederungsnummer (gl, ohne reine Änderungsakt-Treffer)** | **193/234 = 82.5 %** | **655/817 = 80.2 %** |
| stabile Kennung (gl + gl-variant + fundstelle) | 193 = 82.5 % | 655 = 80.2 % |
| streng (stabile Kennung + title-date) | 193 = 82.5 % | 655 = 80.2 % |
| Nenner-Titel aus Änderungsbefehl (fremder Titel) / davon ausgeschlossen / davon per Nummer in juris | 0 / 0 / 0 | – |
| Nenner-Nummern ohne eigenen Registerkopf | 0 | – |
| je Stufe | gl 193 · gl-variant 0 · fundstelle 0 · title-date 0 · gl-amendment-only 25 · title-only 8 · none 8 | gl 655 · gl-variant 0 · fundstelle 0 · title-date 0 · gl-amendment-only 29 · title-only 47 · none 86 |
| nur Einträge ohne Registerereignis: gl / streng | – | 462/583 = 79.3 % / 79.3 % |

**Ausschlüsse je Kategorie (voller Registerbestand).** Gegenbeispiel = ausgeschlossen, obwohl juris ein Dokument mit derselben Nummer (oder Fundstelle + Datum) führt.

| Kategorie | Einträge | Gegenbeispiele | ohne jedes Merkmal |
| --- | --- | --- | --- |
| tarifvertrag | 29 | 1 | 28 |

Gegenbeispiele: 2034.95 (tarifvertrag).

**Handprüfung der Titel-Treffer:** 59/59 geprüft. Urteile im Inventur-Nenner: andere Norm 9 · gleiche Norm 2 · gleiche Vorschrift, andere Fassung 1; im vollen Bestand: andere Norm 48 · gleiche Norm 9 · gleiche Vorschrift, andere Fassung 1 · unklar 1.

**Altregel nach Handprüfung** (Titel-Treffer „andere Norm“/„andere Fassung“ abgezogen): Inventur-Nenner 215/234 = 91.9 % · voller Bestand 680/817 = 83.2 %.

**Titel-Treffer der Altregel ohne Nummerntreffer: 59** (automatische Einordnung: contradicted-by-date 48 · corroborated-by-split-gl 11).

**Streng nicht gefunden: 162** (none 86, title-only 47, gl-amendment-only 29); Ausgänge der streng zugeordneten Dokumente: review 634 · import-ready 348 · not-at-baseline 181 · failed 1 · reconstruction 2.

## Handprüfung: Titel-only-Treffer (Falsch-positiv-Stichprobe) – 105 Fälle

Urteile: gleiche Norm 36 · andere Norm 65 · wahrscheinlich gleiche Norm 2 · gleiche Vorschrift, andere Fassung 1 · unklar 1

- gleiche Norm (36): GVOBl. 12-3-2, GVOBl. 20-13-4, GVOBl. 200-0-408, GVOBl. 215-5, GVOBl. 221-28-8, GVOBl. 221-34-1, GVOBl. 223-9-244, GVOBl. 224-5-3, GVOBl. 300-16-1, GVOBl. 300-19, GVOBl. 301-5-5, GVOBl. 792-1-25, GVOBl. 1101-14, GVOBl. 2013-2-70, GVOBl. 2020-3-38, GVOBl. 2032-20-11, GVOBl. 2033-4, GVOBl. 2035-3-9, GVOBl. 2122-10-2, GVOBl. 2251-45, GVOBl. 8221-1-3, GVOBl. 8221-1-6, GVOBl. B 200-0-41, GVOBl. B 224-2-2, GVOBl. B 315-20-11, GVOBl. B 402-25, GVOBl. B 610-3-1, Amtsbl. 300.4, Amtsbl. 341.2, Amtsbl. 405.5, Amtsbl. 450.2, Amtsbl. 2030.54, Amtsbl. 2250.4, Amtsbl. 3120.5, Amtsbl. 3121.9, Amtsbl. 4500.12
- andere Norm (65): GVOBl. 188-2-1, GVOBl. 312-6-1, GVOBl. 707-11, GVOBl. 762-7-1, GVOBl. 762-10, GVOBl. B 660-3-1, GVOBl. B 660-5-1, GVOBl. B 820-1-4, GVOBl. B 820-1-5, GVOBl. B 820-1-6, GVOBl. B 820-1-8, GVOBl. B 820-1-9, GVOBl. B 820-1-13, GVOBl. B 820-1-16, GVOBl. B 820-1-19, GVOBl. B 820-1-22, GVOBl. B 820-1-24, Amtsbl. 201.53, Amtsbl. 201.78, Amtsbl. 4500.15, Amtsbl. 2031.41, Amtsbl. 6600.33, Amtsbl. 613.1, Amtsbl. 613.2, Amtsbl. 613.3, Amtsbl. 751.3, Amtsbl. 793.27, Amtsbl. 1103.24, Amtsbl. 2030.57, Amtsbl. 2030.64, Amtsbl. 2031.82, Amtsbl. 2032.84, Amtsbl. 2121.40, Amtsbl. 2126.68, Amtsbl. 2126.71, Amtsbl. 2330.76, Amtsbl. 2330.90, Amtsbl. 4500.9, Amtsbl. 6600.40, Amtsbl. 6605.25, Amtsbl. 6606.40, Amtsbl. 6608.43, Amtsbl. 6608.44, Amtsbl. 6608.47, Amtsbl. 6609.7, Amtsbl. 6612.47, Amtsbl. 6612.49, Amtsbl. 6615.12, Amtsbl. 6620.57, Amtsbl. 6621.59, Amtsbl. 6623.62, Amtsbl. 6640.17, Amtsbl. 6641.24, Amtsbl. 6641.27, Amtsbl. 6642.49, Amtsbl. 6646.13, Amtsbl. 6646.14, Amtsbl. 6662.70, Amtsbl. 6662.73, Amtsbl. 6662.75, Amtsbl. 6663.4, Amtsbl. 6666.21, Amtsbl. 6670.20, Amtsbl. 7510.9, Amtsbl. 8530.8
- wahrscheinlich gleiche Norm: GVOBl. B 613-5-1-1 – juris „B 13-5-1-1“, GS. S. 173 gleich; juris-Kopfdatum 14.4.1926 ist das Datum des Reichsgesetzes im Titel, Register 24.8.1927
- wahrscheinlich gleiche Norm: GVOBl. B 791-8-8 – juris 791-8-7: GVOBl. 2019 S. 217 gleich, Datum 25.7.2019 statt 4.7.2019 (ein Datum ist fehlerhaft); weitere Kandidaten sind Kormoran-LVO anderer Jahre
- gleiche Vorschrift, andere Fassung: Amtsbl. 3100.1 – Gl.-Nr. im juris-Kopf (geteilt) gleich, aber Fassung 30.12.2024 (MiZi-Neufassung); Registerfassung 18.5.1998 nicht in juris
- unklar: Amtsbl. 3120.3 – Gl.-Nr. gleich, juris-Fassung 20.7.2017 (SchlHA), Register 26.9.2008 (Amtsbl.); ob Neufassung oder Neubekanntmachung, ist aus den Köpfen nicht entscheidbar

## Handprüfung: als fehlend gemeldete Einträge (Falsch-negativ-Stichprobe) – 39 Fälle

Urteile: fehlt in juris 32 · kein Dokument zu erwarten 2 · Abgleichfehler (Registerparser) 1 · unklar 1 · fehlt in juris (nur Änderungsakt) 3

- fehlt in juris (32): GVOBl. 20-17, GVOBl. 188-3, GVOBl. 200-13, GVOBl. 200-16-1, GVOBl. 206-5, GVOBl. 221-19, GVOBl. 791-0-2, GVOBl. 791-3-17, GVOBl. 791-4-233, GVOBl. 2020-32, GVOBl. 2032-23, GVOBl. 2183-1, GVOBl. 2186-21, GVOBl. 2251-36, GVOBl. 2254-10, GVOBl. 7814-2-1, GVOBl. 8053-9, GVOBl. 301-10-2, GVOBl. 2012-14, Amtsbl. 651.1, Amtsbl. 2129.18, Amtsbl. 7910.6, Amtsbl. 7914.3, Amtsbl. 2034.43, Amtsbl. 6620.55, Amtsbl. 2002.14, Amtsbl. 6611.35, Amtsbl. 2330.81, Amtsbl. 860.10, Amtsbl. 6600.31, Amtsbl. 140.39, Amtsbl. 6609.8
- kein Dokument zu erwarten: GVOBl. 26-1-1 – Register-Platzhalter „Vom _________“: Inkrafttretensbekanntmachung noch nicht ergangen
- kein Dokument zu erwarten: GVOBl. B 200-0-48 – Aufhebungsvorschrift („Aufhebung der Landesverordnung …“); Titel beginnt nicht mit „Landesverordnung zur“, daher von der Ausschlussregel nicht erfasst
- Abgleichfehler (Registerparser): GVOBl. 224-1-39 – juris 224-1-36 ist dieselbe LVO (23.11.2018, GVOBl. 2019 S. 4); der Parser zog die Ressortspalte „Denkmal-/pflege“ in den Titel und verlor das Datum – Titel- und Fundstellenstufe greifen deshalb nicht
- unklar: Amtsbl. 6641.26 – Register 15.11.2022, Amtsbl. 2023 S. 172; juris 6641.21 „Änderung der Richtlinie …“ gleichen Datums, aber Amtsbl. 2023 S. 11 – ob zwei Akte oder Doppelführung, ist ohne Amtsblatt 2023 S. 172 nicht entscheidbar
- fehlt in juris (nur Änderungsakt): Amtsbl. 201.72 – unter 201.72 führt juris nur die Änderung 2022; Stammerlass 5.12.2017 fehlt; Neufassung 2026 ohne Nummer
- fehlt in juris (nur Änderungsakt): Amtsbl. 2010.23 – Hausordnung des Landtages 2.5.2017; juris nur Änderung 16.2.2024
- fehlt in juris (nur Änderungsakt): Amtsbl. 231.7 – Städtebauförderungsrichtlinien 2014; juris nur Änderung 1.9.2023

Einzelfälle (alle Titel-Treffer, alle streng fehlenden Einträge mit nächstem juris-Titel): `register-crosscheck.json`.
Einordnung und Empfehlung zur Readiness: `docs/NSH_SOURCE_RIGHTS_AND_PROVENANCE.md`, Abschnitt „Registerabgleich“.
