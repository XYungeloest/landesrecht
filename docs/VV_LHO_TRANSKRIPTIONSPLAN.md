# Verwaltungsvorschriften zur Landeshaushaltsordnung (VV zur LHO) – Transkriptionsplan

```text
Stammnorm      term:33532 (RECHT.NRW, LRMB)
Quelle         https://recht.nrw.de/lrmb/verwaltungsvorschrift/08062022-verwaltungsvorschriften-zur-landeshaushaltsordnung-vv-zur-lho
Fassung        gültig 2022-06-08 bis 2026-04-21 (deckt den Stichtag 2023-12-01); Folgefassung ab 2026-04-22
Status         needs-review · textCompleteness pdf-only-essential-attachments · 27 wesentliche PDF-Anlagen
Normativität   review („Erlasskopf vorhanden, abstrakt-genereller Regelungsgehalt nicht erkennbar“ – der HTML-Text
               ist ein Kopferlass; der Regelungsgehalt steht ausschließlich in den Anlagen)
Rohquellen     versioniert unter sources/recht-nrw/term-33532/ (Beispielkorpus), SHA-256 im Manifest
Stand          16. September 2026, Strukturanalyse mit pdfinfo/pdftotext (poppler) und lrmb/pdf-cases.ts
```

Grundsatz (docs/RECHT_NRW_BULK_READINESS.md, PDF-Policy): Die VV zur LHO werden erst übernommen, wenn für
jede wesentliche Anlage eine geprüfte strukturierte Transkription (`common/transcription.ts`, Prüferstatus
`verified`, Integrität `checked`, SHA-256 des Originals) vorliegt oder eine Anlage mit dokumentiertem Override
(`attachmentHandling: not-normative`) als nicht normativ eingestuft ist. Keine Massentranskription, keine
ungeprüfte Textextraktion als Normtext.

## 1. Strukturbefund der 27 Anlagen

Alle 27 Dateien sind PDF mit Textlayer (kein Scan, unverschlüsselt); pdftotext liefert lesbaren Text.
Gesamt: 671 Seiten, 1 263 795 Zeichen (pdftotext, Layoutmodus), rund 127 000 Wörter. Die Strukturprüfung
ohne Texterkennung (`lrmb/pdf-cases.ts`, Textoperatoren) schätzt den Anhang auf 394 839 Zeichen – die
Abweichung zu pdftotext (396 158) liegt unter 1 %.

| Anlage (Label im Portal) | Seiten | Zeichen | Tabellenanteil¹ | nummerierte Zeilen | „Zu §“-Köpfe | Formular | SHA-256 (Anfang) | Regelungsklasse |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Anhang VV zur LHO | 169 | 396 158 | 1 % | 1 423 | 258 | nein | b94b7b61dbd58f72 | A Regeltext |
| Anlage zu Nr. 1.2.4 zu § 23 | 1 | 2 410 | 3 % | 15 | – | nein | 27d592454b34c76b | A Regeltext |
| Anlage 1 zu Nr. 2.1 zu § 79 | 3 | 6 486 | 0 % | 20 | – | ja² | 9dbd7922afb2f5d6 | A Regeltext (Bestimmungen Bargeld, Schecks) |
| Anlage 2 zu Nr. 5.1.2 zu § 79 | 9 | 22 609 | 1 % | 97 | – | ja² | 3d2db6716438c503 | A Regeltext (ZBest) |
| Anlage 3 zu Nr. 5.2 zu § 79 | 12 | 26 185 | 1 % | 106 | – | ja² | 74ee87cd5eaaca3d | A Regeltext (Gerichte, Staatsanwaltschaften) |
| Anlage 4 zu Nr. 9.2 zu § 79 (manuelles Verfahren) | 4 | 9 163 | 0 % | 68 | – | ja² | 9a2333226dd25867 | A Regeltext |
| EPOS Bilanzierungs- und Bewertungsgrundsätze | 26 | 55 567 | 5 % | 83 | – | nein | 4ab8970acfe3a4bd | D EPOS-Leitfaden |
| EPOS Bilanzierungs- und Bewertungsleitfaden | 65 | 120 914 | 1 % | 206 | – | nein | e31d16fd96acebad | D EPOS-Leitfaden |
| EPOS Kontierungsleitfaden | 234 | 365 186 | 4 % | 2 486 | – | nein | 18b52740508b7dd4 | D EPOS-Leitfaden (Kontenplan) |
| EPOS Geschäftsvorfallleitfaden | 34 | 55 396 | 15 % | 209 | – | nein | 525cfcff5a8fdbb2 | D EPOS-Leitfaden (Buchungstabellen) |
| EPOS Grundsätze zur Kosten- und Leistungsrechnung | 25 | 50 595 | 4 % | 59 | – | nein | f85e7d764b7803a3 | D EPOS-Leitfaden |
| EPOS Leitfaden KLR | 20 | 34 977 | 2 % | 88 | – | nein | fb0a874dd275fc69 | D EPOS-Leitfaden |
| Muster zu Nr. 1.4 zu § 37 | 1 | 2 097 | 9 % | 0 | – | ja | 43b58cd26fdd5b8a | C Formularmuster |
| Muster zu Nr. 2.3 zu § 38 | 2 | 3 421 | 5 % | 1 | – | ja | 03127c28691e5849 | C Formularmuster |
| Anlage zu Nr. 2.6 zu § 59 | 2 | 3 668 | 0 % | 14 | – | nein | 3126c78caa9f4365 | A Regeltext (Kleinbeträge) |
| Anlage zu Nr. 2 zu § 68 | 7 | 19 834 | 1 % | 3 | – | nein | 825335599869acaf | A Regeltext (Prüfung nach § 53 HGrG) |
| Muster 1 zu Nr. 3.1 NBest-Bau | 3 | 3 012 | 10 % | 0 | – | ja | 3d94e74d34fbe035 | C Formularmuster |
| Muster 2 zu Nr. 3.1 NBest-Bau | 3 | 2 606 | 13 % | 0 | – | ja | 658c2e6ad407c264 | C Formularmuster |
| Grundmuster 1 (Antrag) Anlage 2 zu Nr. 3.1 VVG | 9 | 8 955 | 4 % | 17 | – | ja | d721b7913bc853ee | C Formularmuster |
| Grundmuster 2 (Zuwendungsbescheid) Anlage 3 zu Nr. 4.1 VVG | 4 | 4 365 | 1 % | 0 | – | ja | be2131336c2ea03f | C Formularmuster |
| Grundmuster 3 (Verwendungsnachweis) Anlage 4 zu Nr. 10 VVG | 5 | 5 567 | 6 % | 1 | – | ja | 23c242c05967b735 | C Formularmuster |
| Anlage 5 zu Nr. 10.2 VV zu § 44 (Belegliste) | 1 | 626 | 38 % | 0 | – | ja | 8b85752d7612c6ea | E Tabelle |
| Anlage 4 zu Nr. 13.2, 15.2, 16.1 VV / 13.2, 15.1 VVG zu § 44 | 4 | 6 738 | 0 % | 9 | – | nein | be32fac9a717ed37 | A Regeltext (Grundsätze für Förderrichtlinien) |
| Anlage 2 zu Nr. 5.1 zu § 44 (ANBest-P) | 10 | 21 117 | 2 % | 4 | – | nein | fd6671094521582c | B Nebenbestimmungen |
| Anlage 3 zu Nr. 5.1 zu § 44 (NBest-Bau) | 2 | 3 335 | 0 % | 0 | – | nein | 9e6cc8f41810c87d | B Nebenbestimmungen |
| Anlage 1 zu Nr. 5.1 VVG (ANBest-G) | 7 | 13 707 | 1 % | 3 | – | nein | 524d026ce582fa29 | B Nebenbestimmungen |
| Anlage 1 zu Nr. 5.1 zu § 44 (ANBest-I) | 9 | 19 101 | 2 % | 3 | – | nein | 400fb19298e4a97b | B Nebenbestimmungen |

¹ Anteil der Layoutzeilen mit mindestens zwei Spaltenlücken (Näherung für Tabellen und Formularraster).
² Die Kennzeichnung „Formular“ beruht auf Schlüsselwörtern im Kopf (Anlage/Muster/Vordruck); die Anlagen
zu § 79 sind inhaltlich Regeltexte mit Inhaltsverzeichnis.

Regelungsklassen:

- **A Regeltext** (Anhang + 8 Anlagen, ≈ 220 Seiten, ≈ 495 000 Zeichen): die eigentlichen Verwaltungsvorschriften
  zu §§ 7–87 LHO mit Dezimalgliederung; Kern der Norm.
- **B Nebenbestimmungen** (ANBest-P, ANBest-I, ANBest-G, NBest-Bau; 28 Seiten, ≈ 57 000 Zeichen): abstrakt-generelle
  Nebenbestimmungen, die Bestandteil jedes Zuwendungsbescheids werden; Dezimalgliederung, Inhaltsübersicht.
- **C Formularmuster** (8 Muster/Grundmuster; 28 Seiten, ≈ 32 000 Zeichen): Antrags-, Bescheid- und Nachweisvordrucke
  mit Punktlinien, Ankreuzfeldern und Fußnoten; kein Fließtext-Regelungsgehalt, aber verbindliche Verwendung.
- **D EPOS-Leitfäden** (6 Dokumente; 404 Seiten, ≈ 683 000 Zeichen): laut Abschnitt III des Kopferlasses „zu
  deren verbindlicher Anwendung angefügt“; Handbuchcharakter (Kontenplan, Buchungslogik, Bewertungsregeln), sehr
  tabellenreich (Geschäftsvorfallleitfaden 15 %, Kontierungsleitfaden im Kern eine 234-seitige Kontentabelle).
- **E Tabelle** (Belegliste, 1 Seite): reines Spaltenraster.

## 2. Erwartete Zielstruktur im Blockmodell

Das Blockmodell wird nicht erweitert (docs/RECHT_NRW_LRMB_IMPORT.md, Abschnitt 6). Zuordnung:

| PDF-Struktur | Block | Beispiel aus dem Anhang |
| --- | --- | --- |
| „Teil I Allgemeine Vorschriften …“, „Teil III Ausführung des Haushaltsplans“ (Zwischenüberschriften der LHO-Teile) | `heading` | „Teil III Ausführung des Haushaltsplans“ |
| „Zu § 34 - Erhebung der Einnahmen, Bewirtschaftung der Ausgaben“ (Nummerierung beginnt je Paragraf neu) | `part` mit `label: "Zu § 34"`, `title` | 258 Köpfe im Anhang |
| Nummer 1, 2, 3 (fett, mit Überschrift) | `section` | „1 Verteilung der Haushaltsmittel, Bewirtschaftungsbefugnis“ |
| Nummer 1.1, 1.2.1, 1.2.2 (bis vier Stufen) | `subsection` (Tiefe aus der Nummer) | „1.2.1 den für sie maßgebenden Teil des Einzelplans oder“ |
| Fließtext ohne Nummer | `paragraphText` | Vorbemerkungen zu den VV zu §§ 70–80 |
| Spiegelstrich-/Buchstabenlisten | `item` / `subitem` | „a) …“, „– …“ |
| Tabellen (Belegliste, Buchungstabellen, Kontenplan) | `table` | Anlage 5 zu Nr. 10.2 |
| Fußnoten („1)“ im Text, Definition am Seitenende) | `footnote` am verweisenden Block | Muster zu Nr. 1.4 zu § 37 |
| Inhaltsübersicht mit Punktlinien | wird nicht übernommen (wie `tocBlocks` des Parsers) | Seiten 1–3 des Anhangs |
| Kopf-/Fußzeilen („631“, Seitenzahlen, Datei-Name) | werden entfernt | jede Seite |

Jede Anlage wird eine eigene Transkription `data/imports/recht-nrw/transcriptions/term-33532/<anlage>.json`
(`target.type = attachment`, `target.label` = Label im Portal) mit Seitenbereich, SHA-256 der archivierten
Datei, Zeichenzahl und Blockbaum-Hash. Der Importpfad hängt sie als `annex`-Block an den Kopferlass
(`lrmb/pipeline.ts`, `attachmentBlocks`).

## 3. Automatische Extraktionsqualität (Befund)

Werkzeug: `pdftotext -layout` (poppler 24.x) als Rohstufe, anschließend ein Zwischenformat, das nur mit
Prüfung in den Blockbaum überführt wird. Befunde je Klasse:

- **A/B Regeltexte:** Die Nummernspalte bleibt erhalten („1.2.1      den für …“), Absätze sind durch Leerzeilen
  getrennt, Überschriften stehen allein. Störungen: Seitenkopf „631“ und Seitenzahl je Seite; Trennungen ohne
  Bindestrich beim Zeilenumbruch („Einnahmeund Ausgabeübersichten“, „Kassenund Rechnungswesen“); gelegentlich
  einzelne Wörter je Zeile bei Blocksatz („durch / Verwaltungsvorschriften / des / Bundes“); Inhaltsübersichten
  mit Punktlinien; Sonderzeichen („€“, „§“) korrekt. Erwartete Nachbearbeitung: ≈ 5 % der Zeilen.
- **C Formularmuster:** Layout aus Punktlinien, Beträgen in Spalten und Fußnotenziffern; Fließtext gering.
  Automatische Extraktion liefert keine tragfähige Struktur; Transkription nur als Feldliste/Tabelle sinnvoll.
- **D EPOS-Leitfäden:** Regeltexte gut extrahierbar, Tabellen (Kontenplan, Buchungssätze) verlieren Spaltenzuordnung
  teilweise; Kontierungsleitfaden enthält 2 486 nummerierte Zeilen (Kontonummern) – strukturell eine Datenbank,
  kein Normtext.
- **E Tabelle:** Spaltenköpfe über mehrere Zeilen; nur manuell als `table` abbildbar.

## 4. Phasenplan (keine Massentranskription; jede Phase endet mit Prüfung)

| Phase | Umfang | Seiten / Zeichen | Vorgehen | Abnahme |
| --- | --- | --- | --- | --- |
| 0 Vorbereitung | Zielschema, Prüfregeln, Werkzeugkette | – | Konverter `pdftotext -layout` → Zwischenformat (Nummer, Titel, Text, Tiefe) → Blockbaum; Regeln für Kopfzeilen, Silbentrennung, Inhaltsübersicht; Probestück „Zu § 34“ (Anhang S. 50–56) | Blockbaum validiert (`validateTranscription`), Zeichenzahl ±3 % gegenüber pdftotext ohne Kopf-/Fußzeilen, Zweitprüfung des Probestücks |
| 1 Anhang VV zur LHO | 1 Datei, 258 „Zu §“-Teile | 169 S. / 396 000 Z. | in Tranchen je LHO-Teil (Teil I §§ 7–27, Teil II §§ 34–40, Teil III §§ 43–56, Teil IV §§ 57–69, Teil V §§ 70–87); je Tranche eigene Zeichenzahl und Blockbaum-Hash, zusammengeführt in eine Transkription mit Seitenbereich | vollständige Gegenlesung aller Nummern und Beträge; Stichprobe 10 % der Absätze wortgenau |
| 2 Regeltext-Anlagen und Nebenbestimmungen | 8 Anlagen A + 4 Anlagen B | 60 S. / 152 000 Z. | wie Phase 1; Inhaltsübersichten weglassen; Fußnoten an den verweisenden Block | wie Phase 1 |
| 3 Formularmuster und Belegliste | 8 Muster + Belegliste | 29 S. / 33 000 Z. | Entscheidung je Muster: (a) Transkription als `table`/Feldliste mit Beschriftungen und Fußnoten oder (b) dokumentierter Override `attachmentHandling: not-normative` mit Begründung (Vordruck; Verwendungspflicht steht in der Regel-Nummer; Original bleibt archiviert und als Quelle referenziert). Empfehlung: (b) für Muster/Grundmuster, (a) für die Belegliste nur, wenn sie Regelungsgehalt trägt | Override im Manifest mit Nachweis; sonst Prüfung der Feldliste gegen das PDF |
| 4 EPOS-Leitfäden | 6 Dokumente | 404 S. / 683 000 Z. | zurückgestellt: als archivierte Quellen (`archived-source-only`) referenziert, solange keine fachliche Entscheidung zur Normqualität vorliegt; falls normativ: zuerst Bilanzierungs- und Bewertungsgrundsätze (26 S.), dann KLR-Grundsätze (25 S.); Kontierungs- und Geschäftsvorfallleitfaden nur als Tabellen-Transkription | fachliche Entscheidung dokumentiert (Override `not-normative` oder Transkription) |

Reihenfolge nach Regelungsgehalt und Prüfbarkeit: Phase 1 vor Phase 2, weil der Anhang den Kern trägt und die
Nebenbestimmungen ohne ihn nicht anwendbar sind. Die Transkriptionspriorität aus `lrmb/PDF_FAELLE.md` stuft
die VV zur LHO wegen des Umfangs (671 Seiten, Faktor Aufwand −25) hinter kleinere Kopferlasse (z. B. VV TB NRW,
25 Seiten); fachlich ist sie dennoch die wichtigste Verwaltungsvorschrift des Haushaltsrechts
(Referenzhäufigkeit: „LHO“ in Titeln des Bestands, VV zu § 44 als Bezugspunkt zahlreicher Förderrichtlinien).

## 5. Prüf- und Integritätsregeln

1. Quelle: nur die archivierten Dateien unter `sources/recht-nrw/term-33532/` (SHA-256 im Manifest); jede
   Transkription nennt `source.sha256`, `source.pageRange`, `source.pageCount`.
2. Struktur: `validateTranscription` (Schema, Blockbaum, Zeichenzahl, Blockbaum-Hash); keine leeren Blöcke;
   Nummern eindeutig je Gliederungsraum (Teil „Zu § n“).
3. Wortlaut: keine Normalisierung von Schreibweisen (Beträge, „Abs.“, „Nr.“, alte Rechtschreibung bleiben);
   Silbentrennungen des Layouts werden zusammengeführt, dokumentiert in `integrity.method`.
4. Zahlen und Beträge: 100 % Gegenlesung; Fließtext: Stichprobe 10 % je Tranche, bei Abweichung Tranche
   vollständig.
5. Vier-Augen-Prinzip: `transcribedBy` ≠ `review.reviewedBy`; erst `review.status = verified` und
   `integrity.status = checked` machen die Transkription nutzbar (`usableTranscription`).
6. Reproduzierbarkeit: der Konverter ist deterministisch; Zwischenformat und Blockbaum werden versioniert, damit
   Änderungen der Werkzeugkette erkennbar sind.

## 6. Abhängigkeiten und offene Entscheidungen

- **Normativität:** Nach der Transkription bleibt die automatische Bewertung des Kopferlasses `review`. Die
  Übernahme braucht einen dokumentierten Override `normativity: include` (data/imports/recht-nrw/overrides.json)
  mit Begründung: Erlasskopf des Ministeriums der Finanzen, Ermächtigung § 5 Abs. 2, § 17b Abs. 3, § 79 Abs. 1
  LHO, abstrakt-genereller Regelungsgehalt in den Anlagen.
- **Geltung am Stichtag:** Die Portalfassung 2022-06-08 bis 2026-04-21 deckt den Stichtag; Änderungen
  zwischen 2022 und 2023 sind im Fundstellenverlauf zu prüfen (Ministerialblatt-Einträge, `lrmb/gazette.ts`),
  bevor die Transkription als Stichtagstext gilt.
- **Muster und EPOS-Leitfäden:** fachliche Entscheidung (Override oder Transkription) vor Phase 3/4; ohne
  Entscheidung bleibt die Norm `pdf-only-essential-attachments` und wird nicht übernommen.
- **Aufwand:** Klassen A+B ≈ 550 000 Zeichen strukturierter Regeltext; das entspricht rund dem Zehnfachen der
  bislang größten LRMB-Norm (Wohnraumförderungsbestimmungen, 235 Nummern). Eine Tranche „Zu § 44“ (S. 48–91,
  ≈ 44 Seiten) ist als erster Meilenstein sinnvoll, weil sie die Zuwendungsvorschriften trägt, auf die die meisten
  Förderrichtlinien des Bestands verweisen.
