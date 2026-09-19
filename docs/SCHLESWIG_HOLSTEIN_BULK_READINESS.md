# Bereitschaft und Stand des NSH-Ausgangsimports

**Stand 2026-09-19 (Release) · Readiness: TECHNICALLY READY · Remote: REMOTE RELEASE APPROVED (Nutzungsfreigabe von
juris laut Nutzer; Release vom Nutzer freigegeben; Raw-/Provenienzregeln unverändert) · Bestand: 2 450 Normen live
(Worker `3d606854`, Run 8) · R2: `nsh/` 17 024 Objekte, über das Listing verifiziert · D1 `landesrecht-nsh`:
eingespielt, Fingerabdruck `6cf5aa27`, lokal ↔ remote identisch · Smoke 25/25.**

Maschinelle Prüfung: `npm run import:juris-sh:readiness` (`data/audits/juris-sh/READINESS.md`). Die Readiness trennt
zwei Aussagen: `TECHNICALLY READY` (Zugriffsweg, Vollkorpus, Stichtag, Integrität, Bestand) und die Remote-Freigabe
`REMOTE RELEASE PENDING SOURCE-RIGHTS DECISION`. Der Rechtsvorbehalt ist **kein** Parser-, Coverage- oder
Integritätsfehler, sondern eine offene menschliche Entscheidung (`docs/NSH_SOURCE_RIGHTS_AND_PROVENANCE.md`). Bis dahin
verweigert `r2-sync --write` den Upload; vorbereitete Remote-Schritte: `docs/NSH_REMOTE_RELEASE_PLAN.md`.

## 1 Quelle und Zugriffsweg

Unverändert gegenüber Run 6: öffentliche PDF-Ausgabe des Bürgerservice Schleswig-Holstein (juris) mit der anonymen
Sitzung des öffentlichen Permalinks; kein Login, kein CSRF-Token, `/jportal/wsrest/` in keinem Lauf aufgerufen. Run 7
war vollständig netzfrei (Cache). Stichtagsfassungen geänderter Normen aus den am Stichtag geltenden Einzelfassungen
(„genau dieses Dokument“), nie aus dem heutigen Text.

## 2 Ergebnis (`bulk --write`, Run 7)

| Ausgang | Run 6 | Run 7 |
| --- | --- | --- |
| übernommen (`imported` / `imported-with-warnings`) | 1 910 | **2 383** (516 / 1 867): 1 340 Landesrecht (852 Verordnungen, 445 Gesetze, 42 Zustimmungsgesetze, Verfassung), 1 043 Verwaltungsvorschriften |
| davon Stichtagsfassung aus Einzelfassungen | 245 | 275 |
| Review (`needs-review`) | 1 561 | 642 (darunter 56 Rekonstruktion offen) |
| Anlage einer VwV, der Stammnorm angehängt (`excluded`, keine eigene Norm) | – | 523 |
| nicht am Stichtag | 1 720 | 1 643 |
| fehlgeschlagen / ohne PDF | 4 / 2 | 4 / 2 |

Neu übernommen: 569 Normen; zurückgenommen: 96 (88 in den Review, jeweils mit konkretem Sperrgrund – vor allem
„Es ist Text als PDF-Datei vorhanden“, d. h. Inhalt fehlt in der Ausgabe –, 8 als Anlage ihrer Stammnorm).
`1 910 − 96 + 569 = 2 383`.

## 3 Was Run 7 geändert hat

| Punkt | Umsetzung | Wirkung |
| --- | --- | --- |
| Landeskürzel in amtlichen Abkürzungen (Transformer 1.1.0) | belegte Normabkürzungen „… SH“/„… Schl.-H.“ → „… NSH“; Verkündungsblätter, Aktenzeichen, Fundstellen, historische Titel geschützt; Quellabkürzung als `amtliche-abkuerzung-sh` | 300 Normen frei, deren Review (auch) daran hing, 257 davon ausschließlich; Rest (76 + 27 Fälle) ohne Beleg im Bestand (Einrichtungs-, Programm-, Regionskürzel) bleibt Review |
| Historische Eigennamen | Schutzmuster `historical-state`, Fehler `historical-name-transformed` | keine rückwirkende Überleitung („Provinz Schleswig-Holstein“ bleibt) |
| VwV-Metadaten im Normkörper | wiederholter Titel, „Gl.Nr.“ (auch mehrere, „Gl.Nrn.“), „Fundstelle:“ samt Änderungsvermerk → Metadaten; angehängte Bekanntmachungszeile bleibt Normtext; Rohquelle unverändert; Integrität `explained-difference` | 989 übernommene VwV bereinigt: Fundstelle 887, Gliederungsnummer 897, wiederholter Titel 226, Änderungsvermerk 38 |
| juris-redaktionelle Zusätze (Audit B) | „Verkündet als …“ (134 Normen), juris-Anmerkungen (12), nichtamtliches Anlagenverzeichnis (97 Normen), „Ausgabe/Stand (juris)“ aus den Quellhinweisen | aus dem kanonischen Inhalt genommen, als erklärte Zeilen festgehalten |
| Technische Vermerke | „Es ist Text als PDF-Datei vorhanden“, „[hier nicht gespeichert]“, „(Gleichung nicht gespeichert)“ → Befund `incomplete-source-text` | 94 Review-Fälle; zuvor stillschweigend übernommen (u. a. 60 Normen mit leerer Anlage) |
| Abbildungen | `figure`-Blöcke mit inhaltsadressiertem Asset (SHA-256, Pixelmaße, Lage „seite-n/bild-k“ in der PDF-Ausgabe), nie Base64; verzerrt gesetzte oder Text überdeckende Bilder bleiben Review; auch in Einzelfassungen geprüft | 406 Abbildungen in 215 Normen, 405 Assets (222 MB); 114 davon ganzseitige Bildseiten (Formulare, Karten – als Bild übernommen, ihr Inhalt ist nicht durchsuchbar); 202 der neu übernommenen Normen hatten zuvor den Befund Abbildung |
| Tabellen | strukturierte Tabelle nur für das sichere Spaltenraster (gleiche Spaltenzahl, durchgehender Zwischenraum, keine Worttrennung, keine Hochzeichen) | 276 Tabellen in 132 Normen; 124 der neu übernommenen Normen hatten zuvor Tabellenbefunde; 245 + 63 Tabellenfälle bleiben Review |
| VwV-Anlagen als eigene juris-Dokumente | eindeutige Zuordnung zur Stammnorm (Titel, Gliederungsnummer), als `annex` angehängt, Sperrgründe der Anlage werden Sperrgründe der Stammnorm | 523 Anlagendokumente zugeordnet; 295 davon in 19 übernommenen Stammnormen (übrige Stammnormen im Review, meist wegen Tabellen der Anlage); 38 Anlagen ohne eindeutige Stammnorm und 46 mehrdeutige Stammnormen bleiben Review |
| Amtliche Fundstelle | „GVOBl. 1999, 26“ → „GVOBl. Schl.-H. 1999 S. 26“ als `amtliche-fundstelle-sh`; VwV aus der Fundstellenzeile; Verkündungsblatt-Quellreferenz, wo das Blatt im Ledger liegt | 2 374 von 2 383 Normen |
| Titel und Datum | Fortsetzungszeilen („… nach“), Datumszeile, Bekanntmachungszusatz („AV d. …“) abgetrennt; `documentDate` aus der Titeldatumszeile statt Sammlungsdatum 1971-12-31 | 1971-12-31 nur noch 1 Norm (vorher 75) |
| Parser | VwV-Verzeichnis mit mittiger erster Zeile; „Zum Hauptdokument“ nach dem Verzeichnis; Fußnote verschluckt keine Einheitenüberschrift der Folgeseite | Verzeichnisreste im Normkörper beseitigt |

## 4 Review vorher/nachher (offene Fälle je Kategorie)

| Kategorie | Run 6 | Run 7 |
| --- | ---: | ---: |
| unknown-structure (Tabellen, Verzeichnis/Normkörper) | 561 | 351 |
| institution-mapping (Kürzel, Erlassformeln) | 547 | 133 |
| incomplete-annex (Anlagen als eigene Dokumente, fehlende PDF-Anlagen) | 478 | 162 |
| pdf-only (Abbildungen, technische Vermerke) | 271 | 30 |
| historical-gap | 44 | 44 |
| import-regression | 38 | 0 |
| validity | 13 | 17 |
| reconstruction-required | 12 | 12 |
| contradictory-evidence | 7 | 3 |
| **offen gesamt** | **1 971** (1 565 Dokumente) | **752** (653 Dokumente) |

Verschwunden sind nur Fälle, deren Ursache behoben ist (Regel, Parser, Zuordnung). Neu sind nur belegte Lücken
(`incomplete-source-text` 94). Kein Fall automatisch entschieden, kein Human Approval.

## 5 Zweite Quelle (amtliche Register)

Abgleich über `packages/importers/juris-sh/src/audit/register-crosscheck.ts` (stabile Kennungen über das ganze Register,
Zählbasis Registerköpfe, nicht Ereignisse). **Titelähnlichkeit zählt nie als gefunden** (Falsch-positiv-Raten 37 % und
81 %). Die Prozentzahl ist Indikator, kein Gate; die feste 95-%-Schwelle ist entfallen. Sperrend wäre nur, wenn
Titeltreffer ungeprüft zählten oder fehlende Einträge unklassifiziert blieben.

| Register | nur Gliederungsnummer, Teilmenge | nur Gliederungsnummer, vollständig | streng | nicht gefunden (klassifiziert) |
| --- | --- | --- | --- | --- |
| GVOBl. Systematische Übersicht (Stand 2024-12-13) | 94,4 % (847/897) | **88,1 %** (1 521/1 727) | 89,5 % | 181 |
| Amtsblatt Erlassverzeichnis (Stand 2024-09-30) | 82,5 % (193/234) | **80,2 %** (655/817) | 80,2 % | 162 |

Die früheren Kopfzahlen 96,9 % / 96,2 % zählten Titelähnlichkeit und Ereignisse mit und sind ersetzt. Zusätzlich: 25 VwV,
deren Nummer juris nur am Änderungsvermerk führt; 182 Registereinträge ohne erkanntes Datum. Ein Fehler des früheren
Abgleichs (Titel eines Änderungsgesetzes auf das geänderte Gesetz übertragen, 19 Stammgesetze fälschlich als
„Änderungsgesetz“ ausgeschlossen) betraf nur den Indikator; keine Norm fiel dadurch aus Scope oder Stichtagsbestand.

## 6 Kanonischer Inhalt: Entscheidungen zu den C-Fällen des Audits

| Fall | Entscheidung Run 7 |
| --- | --- |
| C1 Quellgeltung | als Provenienz behalten |
| C2 „Gl.Nr.“ im VwV-Normkörper | entfernt, Nummer als Kennung (`gliederungsnummer-sh`), als „Gl.Nr. …“ suchbar |
| C3 „Ändert … Gl.Nr. …“-Fußnoten | behalten (teils amtlich gedruckt), bis je Norm geprüft |
| C4 „GS Schl.-H. II, Gl.Nr. …“ | behalten (für Mantelgesetzartikel amtlich belegt) |
| C5 Bereinigungsvermerke GS Schl.-H. II | behalten |
| C6 sonstige Fußnoten | behalten |
| C7 Titeltypografie | juris-Typografie („ - “) behalten; juris-Zusätze („AV d. …“) abgetrennt (Quellhinweis „Bekanntmachung (Quelle)“) |
| C8 `documentDate` 1971-12-31 | aus der Titeldatumszeile belegt; 1 Norm ohne Datumszeile behält das Sammlungsdatum |
| C9 Gliederungsnummer | als Kennung behalten |
| C10 Normgeber der VwV | als Quellhinweis behalten |

Amtliche Inhaltsübersichten (Audit A) bleiben Normtext; nichtamtliche juris-Verzeichnisse sind entfernt.

## 7 Gates (Stand dieses Laufs)

| Gate | Ergebnis |
| --- | --- |
| `readiness` | TECHNICALLY READY (13/13); REMOTE RELEASE PENDING SOURCE-RIGHTS DECISION |
| `audit` | konsistent; Bestand = Manifest (2 383 / 7 149 Dateien); 7 322 Rohquellen im Cache nachgerechnet, 405 Abbildungen aus ihrer PDF-Ausgabe reproduziert |
| Textintegrität Vollkorpus | exact 3 118, explained-difference 2 075, review 1, mismatch 1 (beide Review); alle übernommenen exact oder erklärt |
| `search-audit --full` | GRÜN (2 383 Normen); Golden Set 125 Anfragen, beide Suchmodi 0 verletzt, Top-1 1,0, Recall@10 0,957; West + BayWü + NSH 12/12 |
| West/BayWü | inkrementeller Plan gegen den Remote-Zustand: `noop`, unverändert 1 482 bzw. 1 696 |
| Lokale D1 | 2 383 Normen, 18 441 Sucheinheiten, 70 083 Anweisungen |
| D1-Batches | 63 Dateien, 91 530 Anweisungen, Zielfingerabdruck `2566c89c` |
| R2-Staging | 7 727 Objekte (705 MB) mit Umschlägen, darunter 405 Abbildungs-Assets unter `assets/`; 0 Konflikte, 0 ohne Cache (`data/audits/juris-sh/R2_STAGING.md`) |

## 8 Befehle

```bash
npm run import:juris-sh:inventory -- --write
npm run import:juris-sh:readiness -- --write
npm run import:juris-sh:bulk -- --write            # idempotent
npm run import:juris-sh:audit -- --write
npm run import:juris-sh:search-audit -- --full --write
npm run import:juris-sh:r2-sync -- --stage-only    # kein Netz
node scripts/project-d1.ts --target local --reset --jurisdiction nsh
npm run d1:seed:dev -- --jurisdiction nsh
node scripts/project-d1.ts --target remote-batches --jurisdiction nsh
```

Remote-Schritte (Schema zuerst, dann Batches, R2, Deploy) und Smoke-Plan: `docs/NSH_REMOTE_RELEASE_PLAN.md`.

## 8a Run 8 (2026-09-19, nach dem Remote-Release)

| Status (Vollkorpus 5 197) | Run 7 (c15135929) | Run 8 |
| --- | ---: | ---: |
| übernommen | 2 383 | **2 450** |
| nicht am Stichtag | 1 643 | 1 720 (davon 77 Anlagendokumente, deren eigene Fassung am Stichtag nicht galt) |
| Review | 586 | 499 |
| Rekonstruktion offen | 56 | 46 |
| Anlage einer Stammnorm | 523 | 476 |
| fehlgeschlagen / ohne PDF | 4 / 2 | 4 / 2 |
| baseline-only ohne juris-Dokument | 5 | 5 |

Offene Review-Fälle 752 → 613 (Dokumente 653 → 551). Neu übernommen 77, zurückgenommen 10 (veröffentlichte Fassungen
mit nicht belegter Tabellenstruktur, Befund `withdrawn-after-import`, Freigaben in
`data/content-immutability-exceptions.json`, Basis `c15135929`).

- **Tabellen:** Längstes sicheres Raster statt ganzer Block; mehrzeilige Zellen nur bei abgesetzten, gleichmäßigen
  Tabellenzeilen und zeichengleicher Prüfung (Integrität: `explained-difference` mit Umordnung); Kopfzeile über einer
  leeren Zelle; Tabellenzeile statt zufällig mittiger Überschrift; Zeile vor der Tabelle ohne Spaltenzuordnung →
  Befund `row-before-table`.
- **Anlagen:** Stammnorm gleichnamiger Änderungsbekanntmachungen über das gemeinsame Erlassdatum. Die 94 juris-PDF-
  Anlagen bleiben Review (Links tot, `SCHLESWIG_HOLSTEIN_ACCESS_CONSTRAINT.md` Abschnitt 8a).
- **Abkürzungen:** Transformer 1.2.0 (`SCHLESWIG_HOLSTEIN_TRANSFORMATION.md`).
- **Einzelfassungen:** Paragraphenfolge nach Nummer (nur reine Paragraphenfolgen), wortgleiche Doppelfassungen,
  undatierte Fassungen nach dem Stichtag, Parserfehler nur gewählter Einheiten.
- Such-Audit `--full` GRÜN (2 450), Golden 124 Anfragen (1 stillgelegt: Norm zurückgenommen), beide Modi 0 verletzt;
  West + BayWü + NSH 12/12. D1-Batches inkrementell (neu 77, entfernt 10, geändert 97; 6 Dateien, Fingerabdruck
  `6cf5aa27`). R2-Staging 8 339 Objekte, davon 774 neu.

## 9 Offen

1. **Quellenrechte** (TDM-Vorbehalt, Weiterveröffentlichung der juris-Konsolidierung): menschliche Entscheidung;
   einzige Voraussetzung der Remote-Freigabe.
2. **Fachliche Review-Fälle** (752 offen): Tabellen ohne sicheres Raster (308), Anlagen nur als gesonderte PDF-Datei
   in juris (94), Anlagendokumente ohne eindeutige Stammnorm (84), Kürzel ohne Beleg (103), widersprüchliche
   Erlassformeln (30), Einzelfassungen nicht eindeutig (44), Rekonstruktion (56).
