# NSH: Herkunft der Datenelemente und offene Rechtsfrage (juris Schleswig-Holstein)

Stand 2026-09-19. Unabhängige Prüfung für die Entscheidung über die Remote-Freigabe von NSH (Land
Niedersachsen-Holstein), die bis zu einer Rechts-/Datenbankentscheidung angehalten ist. Grundlage: Code in
`packages/importers/juris-sh`, `packages/legal-core`, `packages/search`, `apps/web`, der Bestand
`content/norms/nsh/` (1 910 Normen), Manifest und Audit-Dateien, der lokale Cache (`.cache/juris-sh`: 5 195
PDF-Gesamtausgaben; `.cache/schleswig-holstein`: amtliche Register, GVOBl. 2023/2024, Amtsblatt 2023). Kein
Netzabruf.

**Dieses Dokument trifft keine rechtliche Bewertung und erteilt keine Freigabe.** Es stellt Tatsachen fest, ordnet
jedes übernommene Datenelement einer Herkunftsklasse zu und nennt, wie offene Einordnungen entschieden werden
könnten. Die rechtliche Würdigung bleibt dem Menschen vorbehalten (Abschnitt 7).

Verwandte Dokumente: `docs/SCHLESWIG_HOLSTEIN_ACCESS_CONSTRAINT.md` (Zugang, robots.txt, TDM-Befund),
`docs/SCHLESWIG_HOLSTEIN_BULK_READINESS.md`, `data/audits/juris-sh/CORPUS_INVENTORY.md`,
`data/audits/juris-sh/register-crosscheck/REGISTER_CROSSCHECK.md` (Registerabgleich, Abschnitt 6).

## 1 Klassen

| Klasse | Bedeutung |
| --- | --- |
| **A** amtlicher Rechtsinhalt | Normtext, amtliche Überschriften, Datum der Ausfertigung, Inkrafttreten, Fundstelle im GVOBl./Amtsblatt, amtliche Anlagen – Inhalt, den der Normgeber verkündet hat, unabhängig davon, in welcher Form juris ihn ausliefert |
| **B** juris-redaktionell | Leistung oder Organisation des Portals: redaktionelle Vermerke, Portal-/Ausgabetexte, Navigation, Einzelfassungs-Segmentierung, interne Kennungen und technische Dokumentation |
| **C** unsicher/gemischt | Inhalt amtlich, Form oder Zuordnung von juris; oder Herkunft nicht ohne Abgleich mit dem Verkündungsblatt entscheidbar – mit Begründung und Entscheidungsweg |

Orte: **kanonisch** = `content/norms/nsh/*/meta.json|versions/*.json|history.json`; **Web** = öffentliche
Seiten in `apps/web` (Normtext, „Daten“, „Quellen“); **Suche** = Suchindex (`packages/search/src/units.ts`:
Normkörper einschließlich Fußnoten und Überschriften, Metadateneinheit aus Zitierung und Aliasen);
**intern** = Manifest, Review, Audit, R2-Staging, Rechenwege des Importers.

## 2 Wie die Pipeline juris-Daten übernimmt (Rückverfolgung im Code)

- **Parser** `parse/juris-pdf.ts`: Kopf „Schlüssel: Wert“ (20 bekannte Schlüssel, `HEADER_KEYS`), Titel (zentrierte
  Zeilen), Ausgabevermerk, Aufhebungsvermerk, „Stand:“, Titelfußnoten, „Nichtamtliches Inhaltsverzeichnis“,
  Normkörper, Anhänge „Weitere Fassungen dieser Norm“/„Redaktionelle Hinweise“ (Einzelfassungen).
- **Quellmodell** `parse/source-law.ts` (`toSourceLaw`): übernimmt nur Titel (+ Kurzbezeichnung aus der Klammer),
  „Amtliche Abkürzung“ (nicht die juris-Abkürzung), „Dokumenttyp“ (nur für die Normtyp-Zuordnung),
  Ausfertigungsdatum/Neugefasst/Erlassdatum, „Fundstelle“, „Gliederungs-Nr“, Gültigkeitsdaten, Normkörper,
  Quellhinweise („Ausgabe (juris)“, „Stand (juris)“, VwV: „Normgeber“, „Aktenzeichen“) und eine
  `SourceReference` je PDF. `subjects` und `keywords` werden **immer leer** gesetzt.
- **Einzelfassungen** `pipeline/historical.ts`: Auswahl der am Stichtag geltenden juris-Einzelfassungen nach deren
  „Gültig ab/bis“; die Anhänge „Weitere Fassungen …“/„Redaktionelle Hinweise“ werden benannt ausgeschlossen und
  **nicht** gespeichert.
- **Überleitung** `transform/transform.ts`, `organs.ts`: Simulationsfundstelle, Slug, Erlassorgan aus der
  Normtextformel (nicht aus juris-Metadaten), geschützte Provenienzfelder unverändert.
- **Web/Suche**: `apps/web` zeigt `sourceNotes` als „Quellhinweise“ unter dem Normtext
  (`components/NormTextPage.astro`), `sourceCitation`, Quellgeltung und Änderungshinweis auf „Daten“
  (`NormFactsPage.astro`), alle `sourceReferences` auf „Quellen“ (`NormSourcesPage.astro`, `NormAside.astro`),
  `externalIdentifiers` auf „Daten“. Der Suchindex nimmt den ganzen Normkörper auf; `externalIdentifiers` sind für
  juris-sh **nicht** suchbar (`SEARCHABLE_IDENTIFIER_SYSTEMS` nur `bayrs`).

## 3 Datenelemente: Klasse, Ort, Bedarf, Empfehlung

Mengen aus dem Bestand (1 910 Normen, je eine Fassung 2023-12-01; 1 985 Fußnotenblöcke in 809 Normen).

### 3.1 Klasse A – amtlicher Rechtsinhalt

| Nr. | Element (Feld) | Herkunft in juris | Menge | Ort | für das Portal nötig | Empfehlung |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Normtext (`body`: paragraph, subparagraph, item, article, section, part …) | PDF-Normkörper | 1 910 Normen, 14,2 Mio. Zeichen | kanonisch, Web, Suche | ja | behalten |
| A2 | Amtliche Überschriften, Bezeichnungen (§/Artikel/Abschnitt) | PDF-Normkörper | 1 910 | kanonisch, Web, Suche | ja | behalten |
| A3 | Amtliche Anlagen (`annex`) | PDF-Normkörper | 334 Blöcke | kanonisch, Web, Suche | ja | behalten |
| A4 | Titel (`meta.title`) | zentrierte Titelzeilen | 1 910 (Einschränkungen C7) | kanonisch, Web, Suche | ja | behalten |
| A5 | Kurzbezeichnung (`shortTitle`) | Klammer im Titel | 214, alle im Titel enthalten | kanonisch, Web, Suche | ja | behalten |
| A6 | Amtliche Abkürzung (`abbr`) | Kopffeld „Amtliche Abkürzung“ | 360; 355 stehen wörtlich im Titel, 5 nicht (u. a. `AG BtG`, `SGB IX-SchVO`) | kanonisch, Web, Suche, Slug | ja | behalten; die 5 gegen das Verkündungsblatt prüfen |
| A7 | Ausfertigungs-/Erlassdatum (`documentDate`) | Kopf „Ausfertigungsdatum“/„Neugefasst“/„Erlassdatum“ | 1 910 (75 davon C8) | kanonisch, Web | ja | behalten |
| A8 | Fundstelle (`meta.sourceCitation`, `version.sourceCitation`, `history.entries[0].note`) | Kopf „Fundstelle“ | 1 910 | kanonisch, Web | ja | behalten; Inhalt amtlich, Schreibweise ist die von juris („GVOBl. 2017, 558“, „Amtsbl SH 2023, 613“) – auf amtliche Zitierform umstellen wäre eigene Leistung |
| A9 | Inhaltsübersicht im Normtext | PDF-Normkörper | 83 Normen | kanonisch, Web, Suche | ja | behalten; Stichprobe StiftG (GVOBl. 2023 S. 279) im amtlichen Druck vorhanden |
| A10 | Amtliche Fußnoten: EU-Umsetzungshinweise, „Hinweis der Schriftleitung“ | Fußnoten | 165 Blöcke/57 Normen; 31/3 | kanonisch, Web, Suche | ja | behalten |
| A11 | Aktenzeichen (VwV, `sourceNotes` „Aktenzeichen (Quelle)“) | Kopffeld „Aktenzeichen“ | 752 | kanonisch, Web | nützlich | behalten; im Amtsblatt-Kopf gedruckt (Stichprobe Amtsbl. 2023 S. 613: „– III 2213 -“) |
| A12 | Erlassorgan der Quelle (`originEnactingBody`) | **eigene** Auswertung der Normtextformel | 1 043 | kanonisch, Web | ja | behalten (kein juris-Feld) |

### 3.2 Klasse B – juris-redaktionell

| Nr. | Element (Feld) | Menge | Ort | für das Portal nötig | Empfehlung |
| --- | --- | --- | --- | --- | --- |
| B1 | juris-Dokumentnummer (`externalIdentifiers[system=juris-sh]`, `sourceReferences[].externalId`) | 1 910 Normen; 5 853 Referenzen | kanonisch, Web („Daten“, „Quellen“) | nein (nur Provenienz) | nur als Provenienzkennung behalten |
| B2 | Technische Quelldokumentation (`sourceReferences`: Permalink/PDF-URL, SHA-256, Abrufdatum, Seitenzahl, Medientyp, `label`, `note`) | 5 853 in 1 910 Normen (meta und Fassung doppelt) | kanonisch, Web („Quellen“) | Provenienz ja, öffentlich nicht zwingend | nur als Provenienz behalten; öffentliche Anzeige auf eine Quelle je Norm reduzieren (siehe B9) |
| B3 | Quellhinweis „Ausgabe (juris)“ (juris-Ausgabevermerk „Gesamtausgabe in der Gültigkeit vom … bis …“, „Zum … aktuellste verfügbare Fassung der Gesamtausgabe“) | 844 Normen | kanonisch, **Web (Normtext-Seite, „Quellhinweise“)** | nein | aus öffentlichem Inhalt entfernen; intern (Manifest) behalten |
| B4 | Quellhinweis „Stand (juris)“ („letzte berücksichtigte Änderung: …“) | 617 Normen | kanonisch, **Web** | nein | aus öffentlichem Inhalt entfernen; als interner Stichtagsbeleg behalten |
| B5 | Fußnote „Verkündet als Artikel … des Gesetzes …“ | 504 Blöcke in 108 Normen (je Einzelnorm wiederholt, z. B. 9× in `ag-abwag-nsh`) | kanonisch, **Web, Suche** | nein | aus dem Normkörper entfernen; die Tatsache ist aus der Fundstelle eigen ableitbar. Stichprobe: im GVOBl.-Druck des StiftG (2023 S. 279) steht nur „Artikel 1“, kein solcher Vermerk; in GVOBl. 2023 kommt „Verkündet als“ nicht vor (71 von 691 Seiten unlesbar) |
| B6 | juris-Anmerkungen („Anm. juris: …“, „Redakt. Anm.: …“) und technische Vermerke („Die Anlagen sind aus technischen Gründen vorerst nicht gespeichert“, „Hier nicht abgespeichert“) | 31 Blöcke/26 Normen; 18/6 | kanonisch, **Web, Suche** | nein | entfernen; technische Vermerke zeigen zugleich unvollständigen Text an → Review |
| B7 | VwV-Zeile „Fundstelle: Amtsbl. Schl.-H. 2023 Nr. 9, S. 614“ im Normkörper | 714 Normen | kanonisch, **Web, Suche** | nein (Fundstelle steht schon in A8) | aus dem Normkörper entfernen. Stichprobe Amtsbl. 2023 S. 613/614: im amtlichen Text nicht vorhanden |
| B8 | „Nichtamtliches Inhaltsverzeichnis“ (`toc`, je Einheit Bezeichnung, Überschrift, „Gültig ab/bis“) | alle Gesamtausgaben | **nur intern** (Stichtag, Integritätsprüfung) – nicht gespeichert | nein | intern behalten; die Gliederungsansicht der Seite entsteht aus dem Normkörper (`legal-core`) |
| B9 | Einzelfassungs-Segmentierung (Einheits-IDs `…NN000000000nn`, „Weitere Fassungen dieser Norm“, „Redaktionelle Hinweise“) | 4 188 Einzelfassungs-Referenzen in 236 Normen (Label z. B. „Einzelfassung § 3 (jlr-…NN00000000006)“) | intern; **Einheits-IDs und -Labels öffentlich** auf „Quellen“ | nein | nur als Provenienz; öffentlich nicht je Einzelfassung auflisten. Die Anhänge werden nicht gespeichert |
| B10 | „Dokumenttyp“ (juris-Klassifikation) | 2 806 Köpfe | nur intern (Eingang der Normtyp-Zuordnung in `normType`) | nein | intern; öffentlich erscheint nur der eigene `legal-core`-Normtyp |
| B11 | juris-Abkürzung, „Normen“ (Normenkette), „Quelle“, „Kennung“ | 1 622 / 1 040 / 5 195 / 1 Köpfe | nicht übernommen | – | nichts zu tun |
| B12 | juris-Bereichsteilung Landesrecht/VVSH (ID-Familien `jlr-`/`VVSH-`) | 2 806 / 2 389 Dokumente | intern (Manifest-, Review-, R2-Pfade) | nein | intern belassen |
| B13 | Schlagwörter/Sachgebiete | juris-PDF führt keine | `keywords`/`subjects` in 1 910 Normen leer | – | nichts übernommen |
| B14 | Rohkopien der PDF-Ausgaben (tragen alle B-Elemente) | 6 098 PDF, 302 MB | intern, R2-Staging `nsh/juris-sh/2023-12-01/…`, **nicht hochgeladen** | nein | Teil der Rechtsfrage (Abschnitt 7) |

### 3.3 Klasse C – unsicher/gemischt

| Nr. | Element | Menge | Ort | Grund der Unsicherheit | Entscheidungsweg | Empfehlung bis zur Entscheidung |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | Quellgeltung (`version.sourceValidFrom/To`, `meta.dateNote`, `version.changeNote`, `sourceReferences[].sourceValidFrom/To`) | 1 909 / 281; 1 910; 5 852 | kanonisch; Web („Daten“: Quellfassung gültig ab/bis, Änderungshinweis) | Rechtstatsachen (Inkrafttreten), aber in der von juris dokumentierten Zuordnung zu Einheiten/Fassungen | gegen Inkrafttretensvorschriften im GVOBl. und das Ereignisregister (Register/Jahresinhaltsverzeichnisse) prüfen | als Provenienz behalten; öffentliche Anzeige „Quellfassung gültig ab/bis“ prüfen |
| C2 | Überschrift „Gl.Nr. …“ am Anfang des VwV-Normkörpers | 675 Normen | kanonisch, Web, Suche | Nummer amtlich (Amtsblatt führt sie im Inhaltsverzeichnis der Ausgabe), als Textzeile aber juris-Satz: Stichproben Amtsbl. 2023 S. 613/614 ohne diese Zeile | je Amtsblattseite abgleichen | aus dem Normkörper entfernen, Nummer nur als Kennung (C9) |
| C3 | Fußnoten „Ändert/Ersetzt/Berichtigt Bek. vom …, Gl.Nr. …“ | 411 Blöcke/329 Normen | kanonisch, Web, Suche | Das Amtsblatt druckt sie teils als Fußnote im Text (Amtsbl. 2023 S. 751: „*) Ändert Bek. Vom 01. März 2021, GI.Nr. 6662.57“), teils nur im Inhaltsverzeichnis der Ausgabe (S. 613/614) | je Norm gegen die Amtsblattseite prüfen | behalten, bis geprüft; alternativ als eigene Relation (`relations`) statt Fußnote |
| C4 | Fußnoten/Zeilen „GS Schl.-H. II, Gl.Nr. …“ bzw. „Gl.Nr. …“ | 151 Blöcke/136 Normen | kanonisch, Web, Suche | Für Artikel von Mantelgesetzen amtlich (GVOBl. 2023 S. 279 druckt „GS Schl.-H. II, Gl.Nr. 401-5“ unter „Artikel 1“); bei VwV unbelegt | Stichprobe je Blatt | behalten, VwV-Fälle prüfen |
| C5 | Bereinigungsvermerke („Gegenstandslos für Schleswig-Holstein“, „„x“ statt „y““) | 58 Blöcke/15 Normen | kanonisch, Web, Suche | vermutlich aus der amtlichen Sammlung GS Schl.-H. II (Gesetze vom 4.4.1961/5.4.1971), nicht im Cache prüfbar | Abgleich mit GS Schl.-H. II | behalten, markieren |
| C6 | Sonstige Fußnoten (Inkrafttretenshinweise 88/58, übrige 528 Blöcke/160 Normen, z. B. „Anlage zum Ges. v. 5.4.1971“, Ersatzverkündungshinweis) | 616 Blöcke | kanonisch, Web, Suche | gemischt | Stichprobe gegen das Verkündungsblatt (Einordnung hier per Textmuster, nicht je Fall geprüft) | behalten, Stichprobe |
| C7 | Titelform | 299 Titel mit „ - “ statt „ – “; 30 VwV-Titel mit juris-Zusätzen (Aktenzeichen, „AV d. …“, „(SchlHA S. …)“) | kanonisch, Web, Suche | amtlicher Titel in juris-Typografie bzw. mit juris-Zusätzen | Vergleich mit Kopfzeile der Verkündung | Titel behalten; Zusätze entfernen. Nebenbefund für die Pipeline: 32 Titel sind abgeschnitten oder tragen die Datumszeile („Landesverordnung über die Schiedsstelle nach“, „Landesbetreuungsgesetz Vom 17.12.1991“) |
| C8 | `documentDate` = 1971-12-31 | 75 Normen | kanonisch, Web („Ausfertigungs- oder Erlassdatum“) | juris setzt für Recht der bereinigten Sammlung GS Schl.-H. II den Sammlungsstichtag als „Ausfertigungsdatum“; die wirkliche Ausfertigung liegt früher (vgl. Registerabgleich: 141 Nummerntreffer mit abweichendem Datum, meist 1971-12-31) | gegen Register („Vom …“) | Feld behalten, Wert gegen das Register korrigieren oder als Sammlungsdatum kennzeichnen |
| C9 | Gliederungsnummer (`externalIdentifiers[system=gliederungsnummer-sh]`, `sourceReferences[].sourceNumber`) | 1 906; 1 661 | kanonisch, Web („Daten“) | amtliche Ordnungsnummer (GS Schl.-H. II, Erlassverzeichnis), aber aus dem juris-Kopf abgeschrieben: Tippfehler belegt (`225145` statt 2251-45, `B 244-2-2` statt B 224-2-2, `B 13-5-1-1` statt B 613-5-1-1, `2122-10-02`), bei VwV zusätzlich Aktenplannummern der Ressorts („5602-1, 341.2“) | gegen die amtlichen Register (Abschnitt 6) | als Kennung behalten; aus dem Register statt aus juris belegen |
| C10 | Normgeber der VwV (`sourceNotes` „Normgeber (Quelle)“) | 818 | kanonisch, Web („Quellhinweise“) | juris-Kopffeld „Normgeber“; die Behörde steht auch im amtlichen Kopf („Bekanntmachung des Ministeriums für …“), juris normalisiert die Bezeichnung | gegen den Kopf der Bekanntmachung | behalten, besser aus dem Normtext selbst ableiten (wie A12) |

Eigene, nicht aus juris stammende Felder (zur Abgrenzung): `id`, `slug`, `jurisdiction`, `type` (legal-core-Vokabular),
`status`, `initialCitation`/`citation` (Simulationsfundstelle), `enactingBody` (Institutionen-Zuordnung),
`effectiveDate` (= Stichtag), Quellhinweis „Stichtagsfassung“ (245), `history.json`-Texte außer der Fundstelle.

### 3.4 Zusammenfassung

| Klasse | Elemente | öffentlich sichtbar | davon Empfehlung „aus öffentlichem Inhalt entfernen“ |
| --- | --- | --- | --- |
| A | 12 | 12 | 0 |
| B | 14 | 7 (B1–B7, B9 teilweise) | 5 (B3, B4, B5, B6, B7) + Reduktion B2/B9 |
| C | 10 | 10 | 1 (C2), 1 teilweise (C7) |

**Wie viel B wir tatsächlich nutzen:** 1 757 der 1 910 Normen tragen mindestens ein B-Element im öffentlichen Inhalt
(Normkörper oder Quellhinweise). Im Normkörper sind es 844 Normen mit 157 099 Zeichen (1,1 % des Normtexts:
B5–B7); dazu 1 036 Normen mit juris-Quellhinweisen (B3/B4, 116 888 Zeichen). Alle 1 910 Normen tragen die
technische Provenienz B1/B2. Keine juris-Schlagwörter, -Sachgebiete, -Abkürzungen, -Normenketten, kein
„Nichtamtliches Inhaltsverzeichnis“ im Bestand.

**Vorrangig aus dem öffentlichen Inhalt zu entfernen** (Reihenfolge nach Menge und Eindeutigkeit):
1. B7 „Fundstelle: …“-Zeile im VwV-Normkörper (714 Normen) – Doppelung von A8 in juris-Form.
2. C2 „Gl.Nr. …“-Überschrift im VwV-Normkörper (675 Normen) – Nummer bleibt als Kennung.
3. B3/B4 Quellhinweise „Ausgabe (juris)“ (844) und „Stand (juris)“ (617) auf der Normtext-Seite.
4. B5 „Verkündet als …“-Fußnoten (504 Blöcke/108 Normen).
5. B6 juris-Anmerkungen und technische Vermerke (49 Blöcke/32 Normen).
6. B9/B2 öffentliche Auflistung der 4 188 Einzelfassungs-Referenzen (auf eine Quelle je Norm reduzieren).

Alle Änderungen gehören in Parser/Überleitung (NSH-main), nicht in dieses Audit.

## 4 Stichproben gegen amtliche Texte

| Prüfung | amtliche Quelle (Cache) | Befund |
| --- | --- | --- |
| Inhaltsübersicht StiftG | GVOBl. 2023 S. 279 (`.cache/schleswig-holstein/pagetext/GVOBl_2023.pages.txt`) | „Inhaltsübersicht:“ amtlich gedruckt → A9 |
| „GS Schl.-H. II, Gl.Nr. 401-5“ | GVOBl. 2023 S. 279 | unter „Artikel 1“ amtlich gedruckt → C4 (für GVOBl.) |
| „Verkündet als Artikel 1 …“ (StiftG) | GVOBl. 2023 S. 279; Volltext GVOBl. 2023 | kein solcher Vermerk; Ausdruck kommt im Jahrgang nicht vor → B5 |
| VwV-Kopf „Gl.Nr. 2134.12/2134.13“, „Fundstelle: …“ | Amtsbl. 2023 S. 613/614 | Bekanntmachungstext ohne beide Zeilen; Nummer nur im Inhaltsverzeichnis der Ausgabe → C2, B7 |
| „*) Ändert Bek. vom …, Gl.Nr. …“ | Amtsbl. 2023 S. 751 bzw. S. 613/614 | einmal als amtliche Fußnote gedruckt, einmal nur im Inhaltsverzeichnis → C3 |
| Aktenzeichen „III 2213“ | Amtsbl. 2023 S. 613 | im amtlichen Kopf gedruckt → A11 |

## 5 Spiegeln wir die juris-Datenbankstruktur?

Maßstab: Struktur, Ordnung und Bezeichnungen des öffentlichen Portals sollen aus `packages/legal-core` und dem
eigenen System stammen.

| Nr. | Prüfpunkt | Befund | Fundstelle |
| --- | --- | --- | --- |
| S1 | Ergebnisreihenfolge | **kein Spiegel.** Normliste alphabetisch nach Titel, Typfilter aus `NORM_TYPES` | `apps/web/src/pages/[jurisdiction]/index.astro:32`; Suche: eigenes Ranking `packages/search/src/ranking.ts` |
| S2 | Kategorien | **kein Spiegel öffentlich.** Normtyp aus `legal-core`; juris-„Dokumenttyp“ nur Eingang der Zuordnung; die juris-Teilung Landesrecht/VVSH lebt nur intern (Manifest 2 806 + 2 389 Dateien, Review-Shards, R2-Präfix `…/landesrecht/…`, `…/vwv/…`) | `parse/source-law.ts` `normType`; `data/imports/juris-sh/manifest/{landesrecht,vwv}` |
| S3 | Redaktionelle Inhaltsverzeichnisse | **kein Spiegel.** „Nichtamtliches Inhaltsverzeichnis“ wird nicht gespeichert; die Gliederung der Normseite entsteht aus dem Normkörper (`legal-core/lib/body.ts`) | 0 Felder im Bestand |
| S4 | UI-/Hilfetexte | Oberfläche und Hilfe ohne juris-Texte (`grep -w juris apps/web/src`: 0 Treffer). **Aber** juris-Ausgabetexte als Quellhinweise öffentlich: „Gesamtausgabe in der Gültigkeit vom …“ (844), „Stand: letzte berücksichtigte Änderung …“ (617) | `content/norms/nsh/*/versions/*.json` `sourceNotes`; `NormTextPage.astro:23` |
| S5 | Einheiten-Segmentierung der juris-Datenbank | **teilweise gespiegelt:** (a) 4 188 Einzelfassungs-Referenzen in 236 Normen nennen juris-Einheits-IDs und -Bezeichnungen öffentlich; (b) „Verkündet als …“ steht je juris-Einzelnorm im Normkörper (504 Blöcke in 108 Normen, bis 9× je Norm) – die Wiederholung bildet die juris-Segmentierung ab, nicht den amtlichen Druck | `sourceReferences[].label`; Fußnotenblöcke |
| S6 | Dokumentlayout der juris-Ausgabe | **teilweise gespiegelt:** VwV-Normkörper beginnt mit juris-Kopfzeilen „Gl.Nr. …“ (675) und „Fundstelle: …“ (714) | `versions/2023-12-01.json` `body[0..1]` |
| S7 | Interne Kennungen/Organisation | eigene Kennungen (`nsh:<slug>`, Slug aus Abkürzung/Kurztitel/Titel, `versionId` = Stichtag); juris-DOKNR nur in `externalIdentifiers`/`sourceReferences` | `transform/transform.ts` `deriveSlug` |
| S8 | Suchindex | eigenes Schema und Ranking; indiziert aber den Normkörper samt B5–B7/C2/C3 | `packages/search/src/units.ts` `collectBodyUnits` |
| S9 | Portalbezeichnung | Herkunftsnennung „Landesvorschriften und Landesrechtsprechung Schleswig-Holstein (juris)“ auf der Landesseite | `packages/legal-core/src/config/jurisdictions.ts:79`, `apps/web/src/pages/[jurisdiction]/index.astro:43` |

Ergebnis: Ordnung, Kategorien, Navigation, Inhaltsverzeichnisse und Oberfläche stammen aus dem eigenen System.
Gespiegelt werden juris-Ausgabetexte (S4), die Einzelfassungs-Segmentierung (S5) und das VwV-Dokumentlayout (S6)
– alle drei über Inhalt, nicht über Code, und alle durch die Empfehlungen in 3.4 behebbar.

## 6 Registerabgleich („zweite Quelle“): sind 96,9 % / 96,2 % fachlich plausibel?

Nachrechnung: `packages/importers/juris-sh/src/audit/register-crosscheck.ts` (Stufen),
`…/register-crosscheck-run.ts` (Lauf), Ergebnisse `data/audits/juris-sh/register-crosscheck/`
(`register-crosscheck.json`, `REGISTER_CROSSCHECK.md`, Handprüfung `manual-review.json`), Tests
`tests/unit/juris-sh-register-crosscheck.test.ts`. Die Schwelle (95 %) ist ein Prüfindikator; hier wurde weder
auf sie hin optimiert noch ein Ausschluss ergänzt.

### 6.1 Was die Zahl misst

- Sie misst, ob die amtlichen Register (Systematische Übersicht GVOBl., Stand 2024-12-13; Erlassverzeichnis Amtsbl.,
  Stand 2024-09-30) in **irgendeinem enumerierten juris-Dokument** (5 197) wiederkehren – nicht, ob die Norm im
  NSH-Bestand ist, und nicht auf den Stichtag 2023-12-01 bezogen. Von den streng gefundenen, bis zum Stichtag
  ausgefertigten Registereinträgen sind 849/1 332 (GVOBl.) und 318/581 (Amtsbl.) `import-ready`.
- **Nenner-Verzerrung:** Die Inventur nimmt nur Nummern, zu denen das Ereignisregister (`ledger.json`) eine Zeile
  führt (938 bzw. 246). Der Registerbestand hat 1 788 bzw. 846 Köpfe. Die 860 bzw. 600 Einträge **ohne**
  Änderungszeile fehlen im Nenner – und fehlen in juris deutlich häufiger (GVOBl.: nur 81,1 % per Nummer).
- **Nenner-Defekt:** Ein Änderungsbefehl („Art. 1 ändert Gl.Nr. 221-24“) ist im Ereignisregister ein Ereignis der
  Zielnummer mit Titel des *ändernden* Gesetzes; `buildInventoryReport` übernimmt den letzten Titel. 29 Nummern
  tragen so einen fremden Titel, 19 davon fallen unter die Ausschlussregel, 17 sind Stammgesetze mit eigenem
  juris-Dokument (u. a. Landeswahlgesetz 111-1, Hochschulgesetz 221-24, Besoldungsgesetz 2032-20). 10 Nummern des
  Nenners haben keinen eigenen Registerkopf.

### 6.2 Kennzahlen getrennt

| | GVOBl. Nenner der Inventur | GVOBl. voller Registerbestand | Amtsbl. Nenner der Inventur | Amtsbl. voller Registerbestand |
| --- | --- | --- | --- | --- |
| gemeldet (Altregel) | 869/897 = **96,9 %** | 1 567/1 727 = 90,7 % | 225/234 = **96,2 %** | 729/817 = 89,2 % |
| **nur Gliederungsnummer** (ehrliche Untergrenze) | 847 = **94,4 %** | 1 521 = **88,1 %** | 193 = **82,5 %** | 655 = **80,2 %** |
| stabile Kennung (+ Nullvariante, Fundstelle+Datum+Titelähnlichkeit) | 855 = 95,3 % | 1 542 = 89,3 % | 193 = 82,5 % | 655 = 80,2 % |
| streng (+ Titel mit gleichem Datum) | 858 = 95,7 % | 1 546 = 89,5 % | 193 = 82,5 % | 655 = 80,2 % |
| nur über Titelanfang gefunden (Altregel) | 22 | 46 | 12 | 59 |
| Nummer nur an Änderungsakten (VwV) | – | – | 25 | 29 |
| Altregel nach Handprüfung (Titel-FP abgezogen) | 859 = 95,8 % | 1 550 = 89,8 % | 215 = 91,9 % | 680 = 83,2 % |

Amtsbl.: Die Altregel vergleicht den ganzen juris-Kopf („5602-1, 341.2“) und verfehlt Mehrfachnummern (9 Fälle,
die sie über den Titel „rettet“); umgekehrt zählt sie Nummern, unter denen juris nur die **Änderungs**bekanntmachung
führt (25 im Nenner) – die Stamm-VwV fehlt dort.

### 6.3 Falsch-positive (Titel-only, Handprüfung aller 105 Fälle)

- **GVOBl.:** 46 Titel-Treffer: 27 gleiche Norm (meist Fundstelle und Datum gleich, juris führt Vorgänger-/Nachbarnummer
  oder Tippfehler), 2 wahrscheinlich gleich, **17 andere Norm** (37 %): 10 jährliche Sachbezugsverordnungen
  (B 820-1-*), gekürzte Registertitel („Bekanntmachung über das Inkrafttreten des Staatsvertrages“), andere
  Staatsverträge. Im Nenner der Inventur: 10 von 22 falsch.
- **Amtsbl.:** 59 Titel-Treffer: 9 gleiche Norm (alle über geteilte Mehrfachnummer), 1 andere Fassung, 1 unklar,
  **48 andere Norm** (81 %; ohne die 9 Mehrfachnummern 49/50): fast durchweg Nachfolge-Neuerlasse 2024–2026 gleichen
  Titels, während die registrierte Fassung in juris fehlt. Im Nenner: 10 von 12 falsch.
- Zusätzlich gefunden und korrigiert: Fundstelle + Datum allein ist nicht eindeutig (gleiche Seite, gleicher Tag,
  anderes Gesetz – Register 2020-33 ↔ juris 610-5; Artikel eines Mantelgesetzes). Die Fundstellenstufe verlangt
  deshalb Titelähnlichkeit ≥ 0,5 (Regressionstest).

### 6.4 Falsch-negative (39 geprüfte „fehlend“-Fälle)

35 fehlen wirklich in juris (davon 3, für die juris unter der Nummer nur einen Änderungsakt führt; vorkonstitutionelle NSG-Verordnungen aus dem Reg.Amtsbl., Inkrafttretensbekanntmachungen
zu Staatsverträgen, Zustimmungsgesetze zu Rundfunk-/Medienänderungsstaatsverträgen, VwV-Förderrichtlinien 2020–2024,
für die juris nur Nachfolger oder Änderungsakte führt); 2 sind kein Dokument zu erwarten (Register-Platzhalter
„Vom ____“; Aufhebungsvorschrift ohne „Landesverordnung zur“); 1 unklar (6641.26); **1 Abgleichfehler**: 224-1-39
ist in juris als 224-1-36 vorhanden – der Registerparser zieht die Ressortspalte in den Titel und verliert das
Datum. Weitere Parserlücke: Bei 182 GVOBl.-Köpfen fehlt das Ausfertigungsdatum, weil die Zeile „Art. 1 vom …“ /
„Art. 1 LVO vom …“ nicht als Ausfertigung gelesen wird (`events/registers.ts`, `SYS_ISSUE`).

### 6.5 Ausschlüsse

| Kategorie | voller Bestand | davon mit eigenem juris-Dokument (Gegenbeispiel) | Nenner der Inventur: Gegenbeispiele |
| --- | --- | --- | --- |
| Änderung | 21 | 7 | 12/23 |
| Aufhebung | 26 | 9 | 3/5 |
| Bereinigung | 2 | 0 | 3/4 |
| Neuregelung/Neuordnung | 6 | 3 | 5/8 |
| Anpassung | 4 | 3 | – |
| Neufassung | 2 | 0 | 0/1 |
| Tarifverträge (Amtsbl.) | 29 | 1 | 0/12 |

„Änderungsgesetze haben keine eigene konsolidierte Fassung“ trifft nicht durchgehend zu: Das Register ist ein
Register **geltender** Vorschriften und führt ein Änderungsgesetz nur, wenn davon etwas fortgilt; juris führt
22 der 61 ausgeschlossenen GVOBl.-Einträge als eigenes Dokument (u. a. Glücksspielgesetz 2186-15, Viertes
Gebietsneuordnungsgesetz 2020-13, Neuordnung der Straßenbauverwaltung 200-0-354, drei Aufhebungs-LVO zu
Grabungsschutzgebieten 224-1-24/-26/-27, zwei Strafrechts-Anpassungsgesetze 450-1/450-2). Im Nenner der Inventur sind 23 von 41 Ausschlüssen Gegenbeispiele, 19 davon wegen des
Titel-Defekts (6.1). Die Regel ist zugleich unvollständig (Zustimmungsgesetze zu Änderungsstaatsverträgen,
„Aufhebung der …“ ohne „Landesverordnung zur“, „… (Tarifverträge)“ am Titelende werden nicht erfasst). Der
Tarifvertrags-Ausschluss ist plausibel (1/29 in juris). Neue Ausschlüsse wurden **nicht** eingeführt.

### 6.6 Bewertung

- **GVOBl. 96,9 %:** auf dem gewählten Nenner fachlich nachvollziehbar, aber um rund 2,5 Punkte über der
  Nummern-Untergrenze (94,4 %), davon knapp die Hälfte Titel-Falschtreffer. Auf dem vollen Register liegt die
  Abdeckung bei 88–90 %. Die Zahl beschreibt einen günstig gewählten Ausschnitt.
- **Amtsbl. 96,2 %:** **nicht plausibel.** Nummern-Untergrenze 82,5 % (Nenner) bzw. 80,2 % (voll); die Differenz
  besteht aus Nachfolger-Titeltreffern und Änderungsakt-Nummern.
- Die nach dem ersten Messwert (92,8 %/86,6 %) ergänzten Mittel – Titelabgleich und Ausschlüsse – haben die Zahl
  überwiegend über Falschtreffer und einen zu engen Nenner gehoben, nicht über belegte Zuordnungen.

### 6.7 Empfehlung zur Readiness (Verdrahtung nicht geändert; `reports/status.ts` bleibt NSH-main)

1. Prüfung `zweite-quelle` nicht mehr auf die Altregel stützen. Maßgeblich: **stabile Kennung über den vollen
   Registerbestand** (Stufen `gl`, `gl-variant`, `fundstelle`) aus `register-crosscheck.json` bzw. aus
   `matchRegisterEntry` in `buildInventoryReport`; Titel-only zählt nie als gefunden, `gl-amendment-only` auch nicht.
2. Nenner aus den Registerköpfen (`parseSystematicOverview`/`parseErlassverzeichnis`), nicht aus den Ereignissen –
   behebt Nenner-Verzerrung und Titel-Defekt zugleich.
3. Schwelle als **Indikator** (nicht blockierend): Detailtext nennt alle Stufen getrennt; blockierend nur, wenn
   (a) ungeprüfte Titel-Treffer in die Zahl eingehen oder (b) streng fehlende Einträge ohne Einordnung bleiben
   (fehlt in juris / kein Dokument zu erwarten / Abgleichfehler → Rekonstruktionsqueue). Eine feste Prozentschwelle
   erst nach fachlicher Begründung festlegen, nicht nach Messung.
4. Ausschlüsse nur mit Einzelbeleg (Registerzeile zeigt, dass kein eigenständiger Text fortgilt), nicht per
   Titelmuster; bis dahin die Ausschlüsse ausweisen, nicht abziehen.
5. Registerparser (NSH-main): Artikelzeilen „Art. 1 vom …“ als Ausfertigung lesen (182 Köpfe), Ressortspalte nicht
   in den Titel ziehen (224-1-39).

## 7 Entscheidung (2026-09-19)

- **Nutzungsfreigabe:** Für die geplante Nutzung des Schleswig-Holstein/juris-Landesrechtsbestands liegt nach
  Bestätigung des Nutzers eine Nutzungsfreigabe von juris vor. Die Freigabe selbst liegt nicht im Repository; ihre
  Bedingungen sind hier nicht wiedergegeben und werden nicht angenommen.
- **Release:** vom Nutzer freigegeben. Vermerk `data/imports/juris-sh/source-rights-approval.json`; die Readiness
  meldet `REMOTE RELEASE APPROVED`. Der TDM-Vorbehalt (`tdm-reservation: 1`) ist für dieses Projekt und den
  freigegebenen Nutzungsumfang kein Release-Blocker mehr.
- **Unverändert:** Raw- und Provenienzregeln (Abschnitte 1–5): amtlicher Rechtsinhalt als kanonischer Inhalt,
  juris-redaktionelle Zusätze nicht öffentlich, juris-Abruf als Konsolidierungs-/Fassungsquelle dokumentiert.

Der folgende Abschnitt hält die Tatsachen fest, die vor der Entscheidung vorlagen.

## 7a Tatsachen vor der Entscheidung

Neutral zusammengestellt; keine Schlussfolgerung.

1. **TDM-Vorbehalt.** Jede Portalantwort trägt den HTTP-Kopf `tdm-reservation: 1` (154 von 154 protokollierten
   Antworten in `data/audits/juris-sh/discovery/public-exports.json`); die Oberfläche setzt zusätzlich
   `<meta name="tdm-reservation" content="1">` (`discovery/content-addressability.json`: `tdmReservation: true`).
   `/.well-known/tdmrep.json` antwortet mit HTTP 404, eine TDM-Policy-Datei ist also nicht veröffentlicht. Die
   Abrufmetadaten im Cache speichern den Kopf nicht (nur `date`); der Befund stammt aus den Discovery-Läufen.
2. **Anbieter.** Impressum: Diensteanbieter Land Schleswig-Holstein (Zentrales IT-Management), technische Umsetzung
   juris GmbH; keine Lizenz- oder Nutzungsbedingungen, keine Aussage zum automatisierten Abruf
   (`SCHLESWIG_HOLSTEIN_ACCESS_CONSTRAINT.md` §3). robots.txt schließt alle nicht genannten Bots aus; für diesen
   Adapter als Hinweis (`advisory`) behandelt (Nutzerentscheidung 2026-09-18).
3. **Zu entscheidende Frage – amtliche Werke.** Gesetze, Verordnungen, amtliche Erlasse und Bekanntmachungen können
   amtliche Werke im Sinne von § 5 UrhG sein. Zu entscheiden ist, welche der in Abschnitt 3 als A geführten
   Elemente darunter fallen und ob das auch für Verwaltungsvorschriften (821 Normen im Bestand) gilt.
4. **Zu entscheidende Frage – Datenbankherstellerrecht.** Ob dem Portalbetreiber an der Sammlung ein Recht nach
   §§ 87a ff. UrhG zusteht und ob die Übernahme von 1 910 Normen (aus 5 197 enumerierten Dokumenten, gelesen über
   5 195 Gesamtausgaben und 18 636 Einzelfassungen) eine Entnahme eines nach Art oder Umfang wesentlichen Teils
   oder eine wiederholte systematische Entnahme unwesentlicher Teile ist. Ob der TDM-Vorbehalt (§ 44b Abs. 3 UrhG)
   auf diese Übernahme anwendbar ist, gehört zur selben Frage.
5. **Umfang von B.** Siehe 3.4: 1 757 von 1 910 Normen tragen mindestens ein B-Element öffentlich; B im Normkörper
   1,1 % der Zeichen (844 Normen), juris-Quellhinweise in 1 036 Normen; technische Provenienz (juris-DOKNR, URLs,
   Hashwerte) in allen Normen; 4 188 öffentliche Einzelfassungs-Referenzen. Die Empfehlungen in 3.4 würden die
   öffentlich sichtbaren B-Elemente auf B1/B2 als Provenienznachweis reduzieren. Rohkopien der juris-PDF (6 098,
   302 MB) liegen im R2-Staging, hochgeladen ist nichts.
6. **Alternative Quellen.** Die amtlichen Verkündungsblätter (GVOBl. 2023/2024, Amtsblatt 2023) und Register liegen
   für das Ereignisregister bereits im Cache (Verkündungsportal des Landes); ein vollständiger Normtext-Bestand zum
   Stichtag lässt sich daraus nicht ohne Konsolidierung gewinnen. Ob die Verkündungsblätter selbst einem
   TDM-Vorbehalt unterliegen, ist hier nicht geprüft.
