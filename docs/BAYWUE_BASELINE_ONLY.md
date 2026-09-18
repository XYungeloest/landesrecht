# Heute fehlende Stichtagsnormen (baseline-only) – BayWü

Stichtag **2023-12-01**. Kennzahlen und Review-Fälle des letzten Laufs: `data/audits/bayernrecht/BASELINE_ONLY.md`.

```
npm run import:bayernrecht:restore-baseline-only                       # Dry-run; holt fehlende Quellen im Budget in den Cache
npm run import:bayernrecht:restore-baseline-only -- --offline          # Dry-run, netzfrei aus dem Cache
npm run import:bayernrecht:restore-baseline-only -- --write --offline  # Rezepte, Normen, Manifest, Slug-Registry, Bericht
npm run import:bayernrecht:restore-baseline-only -- --only baymbl-2020-719 # Probelauf für eine Ausgangsverkündung
```

Code: `packages/importers/bayernrecht/src/baseline-only/` (`references.ts`, `identity.ts`, `platform.ts`, `base.ts`,
`html.ts`, `chain.ts`, `analyze.ts`, `restore.ts`, `run.ts`, `report.ts`, `recognize.ts`). Tests:
`tests/unit/bayernrecht-baseline-only.test.ts` mit echten, gekürzten Verkündungsseiten unter
`tests/fixtures/bayernrecht/verkuendung-*`.

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
| 1 | Identität | starke Registerzuordnung; das Zitat (Titel unmittelbar vor „vom <Ausfertigung>“) steht in der Aufhebungsverkündung, alle Fundorte mit derselben Fundstelle | `identity-not-strong`, `citation-not-located`, `citation-ambiguous` |
| 2 | Ende | Aufhebungs-/Außerkrafttretensbefehl hinter dem Zitat oder im Einleitungssatz der Aufhebungsliste; Wirksamwerden aus der Inkrafttretensvorschrift der aufhebenden Verkündung (`commencement.ts`) | `not-a-repeal` (die Verkündung ändert die Norm), `end-undetermined` |
| 3 | Stichtag | letzter Geltungstag ≥ Stichtag, Ausfertigung ≤ Stichtag | `ended-before-baseline`, `enacted-after-baseline` |
| 4 | Fundstelle | Stammverkündung elektronisch amtlich (BayMBl. ab 2019; AllMBl., FMBl., JMBl., KWMBl. 2009–2018) oder GVBl.-Detailseite | `base-unpublished` (nur Aktenzeichen, nie verkündet), `base-paper-only` (vor 2009, andere Blätter), `base-pdf-only` |
| 5 | Ausgangsseite | Seite unter der Fundstelle abgerufen; Ausfertigungsdatum im Kopf gleich; Titel passt (Wortüberdeckung ≥ 0,6 in einer Richtung, gleiche Abkürzung oder Zitat nur mit Erlassstelle) | `base-not-found`, `base-identity-mismatch` |
| 6 | Umfang | Erlassstelle Staatsregierung, Staatskanzlei, Staatsministerium; kein Prüffall nach `docs/LEGAL_SCOPE.md` (Muster, Vordrucke, Merkblätter …) | `scope-not-state-regulation`, `scope-normativity-review` |
| 7 | Text | keine Anlage nur als Datei, kein Bild; Umsetzung vollständig und in Reihenfolge (Abschnitt 4) | `annex-pdf-only`, `text-image-in-body`, `text-structure-unsupported` |
| 8 | Beginn | eigene Inkrafttretensvorschrift mit **Kalenderdatum** (`commencementDate`), Gegenprobe mit `commencementStatements`; nie Ausfertigung oder Verkündung | `begin-no-commencement-clause`, `begin-not-calendar-date`, `begin-unreadable`, `begin-after-baseline` |
| 9 | Weitergeltung | bis 31.12.2015 erlassene veröffentlichte Verwaltungsvorschriften gelten nach Nr. 1 VwVWBek (AllMBl. 2016 S. 1555) nur mit Aufnahme in die Positivliste | `vwvwbek-positivliste` |
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
   nichts). Sie gilt nur als **belegt**, wenn sie jede bekannte zitierende BayMBl.-Seite findet (den
   Aufhebungsbefehl und jeden Treffer der Gliederungssuche); sonst `chain-fulltext-unverified`.
2. **BayMBl.-Gliederungssuche** (`?referencenumber=<nummer ohne Ressortzusatz>`) als Gegenkontrolle.
3. **Amtsblätter 2009–2018** (AllMBl., FMBl., JMBl., KWMBl.; ohne Volltextsuche): **jede** Veröffentlichung im
   Zeitraum aus den Inhaltsübersichten aller Ausgaben, höchstens 120 je Norm (`AMTSBLATT_FULL_READ_CAP`). Sind es
   mehr, bleibt die Kette `chain-amtsblatt-unsearchable` – die Gliederungsnummern allein schließen Sammeländerungen
   nicht aus.

Eine gelesene Seite ist Glied der Kette, wenn sie die Norm mit **Ausfertigungsdatum und Fundstelle** zitiert und ein
Befehl folgt (ändern, berichtigen, beenden). Jede Änderungsklausel („die zuletzt durch … geändert worden ist“) des
Aufhebungsbefehls **und jeder gefundenen Änderung** muss auf ein Glied der Kette zeigen
(`chain-named-amendment-missing`). Normen des GVBl. (Gesetze, Verordnungen) werden im GVBl. geändert; diese
Gegenprobe ist nicht umgesetzt (`chain-organ-unsearchable`).

Änderungen vor dem Stichtag werden vorwärts angewandt – nur mit Kalenderdatum des Inkrafttretens
(`commencementFor`), nur Wortlautformeln (`parseCommand`), jeder Ort aufgelöst (`resolvePath`), jeder zu ändernde
Wortlaut genau einmal im Bereich (`applyForward`) und mit Rundlauf (rückwärts ergibt sich exakt der Körper davor).
Neufassungen, Aufhebungen einzelner Glieder, Einfügungen ganzer Glieder und Berichtigungen werden nicht angewandt.

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
- Die Positivliste der VwVWBek liegt nur als PDF vor; eine Schrift (Type0, Identity-H) dekodiert der vorhandene
  Textlayer-Leser nicht sicher – Verwaltungsvorschriften bis 2015 bleiben `vwvwbek-positivliste`.
- Anlagen, die die Verkündung nur als Datei verlinkt, werden nicht als Text übernommen (`annex-pdf-only`).
- Die Amtsblätter 2009–2018 haben keine Volltextsuche; lange Zeiträume dort (mehr als 120 Veröffentlichungen)
  bleiben `chain-amtsblatt-unsearchable`. Die Volltextsuche des BayMBl. ist ein Dienst der Plattform; ihr Beleg ist
  die Gegenprobe gegen bekannte Zitate, keine Zusicherung des Betreibers.
