# Strukturinventur des BayWü-Korpus

**Stand 2026-09-18, Ausgangsrechtsstand 2023-12-01.** Jeder Scope-Kandidat mit vorhandenem Exportpaket ist
einmal den ganzen Weg gelaufen: ZIP → XML → Parser → Überleitung → `NormRecord` → `validateNormRecord`.
Der Parser lief dabei meldend (`unknown: 'report'`): Eine unbekannte Struktur bricht nicht ab, sie wird benannt.

Kandidaten laut Scope: **2342** · geprüft: **2342** · Paket noch nicht im Cache: **0**.

Dokumente, die einem Bulk-Lauf im Weg stehen: **0** von 2342.

Datengrundlage: `data/imports/bayernrecht/inventory.json` (ein Eintrag je Dokument).

## Ausgänge

| Ausgang | Dokumente | Anteil | Bedeutung |
| --- | --- | --- | --- |
| `parsed-with-warnings` | 2153 | 91,9 % | durchgelaufen, mit Hinweisen |
| `parsed` | 189 | 8,1 % | ohne Befund durch den ganzen Weg |

## Erfolg je DTD

Die beiden Dokumentmodelle teilen den Fließtextvorrat, sonst wenig – sie verhalten sich nicht gleich.

| DTD | geprüft | `parsed` | `parsed-with-warnings` |
| --- | --- | --- | --- |
| `byrecht-norm` | 1001 | 115 | 886 |
| `byrecht-vv` | 1341 | 74 | 1267 |

## Erfolg je Normtyp

| Normtyp | geprüft | `parsed` | `parsed-with-warnings` |
| --- | --- | --- | --- |
| `bekanntmachung` | 8 | 0 | 8 |
| `gesetz` | 240 | 61 | 179 |
| `satzung` | 5 | 1 | 4 |
| `staatsvertrag` | 95 | 4 | 91 |
| `verfassung` | 1 | 0 | 1 |
| `verordnung` | 502 | 45 | 457 |
| `verwaltungsabkommen` | 21 | 1 | 20 |
| `verwaltungsvorschrift` | 1470 | 77 | 1393 |

## Einzelne Kennzahlen

- **Gliederungsnummer vor dem Titel** (`division-number-before-title`): 125 Dokumente. Die Quelle stellt Verwaltungsvorschriften ihre Gliederungsnummer voran; sie wird als Gliederungsnummer geführt, nicht als Titelbestandteil.
- **Normtyp außerhalb des Zielmodells** (`norm-type-out-of-model`): 26 Dokumente – `@doktyp="bekanntmachung"` 10×, `@doktyp="normsonst"` 16×.
- **Bildbeilagen**: 59 Dokumente; 49 davon mit Abbildungen im Normkörper (`figures-transferred`: `figure`-Block mit Asset-Referenz an der Stelle des `<graphic>`-Aufrufs). 0 mit Befund `graphic-not-transferred` (im XML über `<graphic>` referenziert, Bilddatei im Paket nicht lesbar) und 59 ohne diesen Befund.
- **Slugkollisionen**: 29 Slugs würden mehrfach vergeben; der Bulk-Lauf muss sie auflösen.

## Strukturklassen

Nach Zahl der betroffenen Dokumente absteigend. Die Signatur ist der Schlüssel: Zwei Dokumente mit
demselben Element an derselben Stelle stehen in derselben Zeile.

| Dokumente | Signatur | Stufe | Gewicht |
| --- | --- | --- | --- |
| 1553 | `protected-source-state-reference:# Nennung(en) des Quelllandes stehen in geschützten Bereichen (…) und bleiben bewusst erhalten` | transform | info |
| 1485 | `sentence-numbers` | parse | info |
| 1459 | `enacting-body-mapping-required:Erlassorgan der Quelle „…“ ohne sichere Entsprechung; Simulationsorgan bleibt leer (manuelle Entscheidung)` | transform | warning |
| 1143 | `vv-section-address-unresolved` | parse | info |
| 811 | `tables` | parse | info |
| 739 | `footnotes` | parse | info |
| 482 | `vv-depth-beyond-model` | parse | info |
| 324 | `undecidable-source-state-abbreviation:BayHO` | transform | warning |
| 317 | `referenced-file-case-mismatch` | parse | info |
| 284 | `vv-bayrs-number-absent` | parse | info |
| 170 | `vv-section-effective-dates` | parse | info |
| 165 | `undecidable-source-state-abbreviation:BayVwVfG` | transform | warning |
| 157 | `undecidable-source-state-abbreviation:BayEUG` | transform | warning |
| 155 | `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <titelangaben> ; ersatzweise als „…“ geführt` | parse | warning |
| 151 | `undecidable-source-state-abbreviation:BayBG` | transform | warning |
| 134 | `division-word-unmapped:Gliederungsüberschrift "…" in <gliederung G_#> nennt kein bekanntes Gliederungswort; Ebene # wird als „…“ geführt` | parse | info |
| 125 | `division-number-before-title` | parse | info |
| 115 | `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <aenderungsverlauf> → Listenpunkt ; ersatzweise als „…“ geführt` | parse | warning |
| 109 | `slug-collision` | transform | warning |
| 77 | `undecidable-source-state-abbreviation:BayBesG` | transform | warning |
| 75 | `undecidable-source-state-abbreviation:BayRKG` | transform | warning |
| 71 | `undecidable-source-state-abbreviation:BayBO` | transform | warning |
| 69 | `repealed-provision:Art. # ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten` | parse | info |
| 68 | `undecidable-source-state-abbreviation:BayNatSchG` | transform | warning |
| 63 | `organ-formula-conflict:Widersprüchliche Erlassformeln (…); kein Erlassorgan übernommen` | transform | warning |
| 61 | `annex-number-flag-missing:<annex ANL_#>: keine <annex.nummer> mit @int; ersatzweise gilt die erste Schreibweise „…“` | parse | warning |
| 60 | `repealed-provision:§ # ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten` | parse | info |
| 54 | `package-media-type-mismatch:image/jpg→.gif` | parse | warning |
| 54 | `undecidable-source-state-abbreviation:BayPVG` | transform | warning |
| 54 | `undecidable-source-state-abbreviation:BaySchO` | transform | warning |
| 52 | `undecidable-source-state-abbreviation:BaySchFG` | transform | warning |
| 49 | `figures-transferred` | parse | info |
| 49 | `organ-formula-conflict:Widersprüchliche Erlassformeln (Bayerisches Staatsministerium für Unterricht und Kultus / Bayerisches Staatsministerium)…` | transform | warning |
| 38 | `norm-type-assumed:@doktyp="vertrag"` | parse | info |
| 37 | `undecidable-source-state-abbreviation:BayWG` | transform | warning |
| 35 | `undecidable-source-state-abbreviation:BayDSG` | transform | warning |
| 34 | `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <einzelnorm P_#> → <absatz.text> ; ersatzweise als „…“ geführt` | parse | warning |
| 34 | `undecidable-source-state-abbreviation:BayWaldG` | transform | warning |
| 33 | `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <p typ=-> ; ersatzweise als „…“ geführt` | parse | warning |
| 33 | `undecidable-source-state-abbreviation:BayStrWG` | transform | warning |
| 33 | `vv-superscript-ambiguous:<sup>#</sup> in <gliederung ebene=# Position #> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznu…` | parse | warning |
| 32 | `undecidable-source-state-abbreviation:BayGlG` | transform | warning |
| 31 | `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <gliederung ebene=# Position #> ; ersatzweise als „…“ geführt` | parse | warning |
| 26 | `undecidable-source-state-abbreviation:BayBS` | transform | warning |
| 26 | `undecidable-source-state-abbreviation:BayHIG` | transform | warning |
| 25 | `repealed-provision:Art. #a ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten` | parse | info |
| 23 | `title-continued:Der Titel läuft über # Zeilen von <titelangaben> und wird zusammengesetzt: „…“` | parse | info |
| 21 | `undecidable-source-state-abbreviation:BayHSchG` | transform | warning |
| 21 | `undecidable-source-state-abbreviation:BayKiBiG` | transform | warning |
| 20 | `organ-formula-conflict:Widersprüchliche Erlassformeln (Bayerisches Staatsministerium des Innern / Bayerisches Staatsministerium); kein Erlassor…` | transform | warning |
| 20 | `undecidable-source-state-abbreviation:BayLBG` | transform | warning |
| 20 | `undecidable-source-state-abbreviation:BayStVollzG` | transform | warning |
| 19 | `norm-type-refined:@doktyp="vertrag"` | parse | info |
| 19 | `undecidable-source-state-abbreviation:BayUKG` | transform | warning |
| 18 | `undecidable-source-state-abbreviation:BayRiStAG` | transform | warning |
| 17 | `quoted-provisions` | parse | info |
| 17 | `undecidable-source-state-abbreviation:BayAgrarWiG` | transform | warning |
| 17 | `undecidable-source-state-abbreviation:BayBeamtVG` | transform | warning |
| 16 | `norm-type-out-of-model:@doktyp="normsonst"` | parse | warning |
| 16 | `undecidable-source-state-abbreviation:BayKSG` | transform | warning |
| 16 | `undecidable-source-state-abbreviation:BayStrAG` | transform | warning |
| 15 | `compound-proper-name:# zusammengesetzte(r) Eigenname(n) mit dem Landesnamen bleiben unverändert (…); eine Überleitung wäre eine Entscheidung …` | transform | info |
| 15 | `undecidable-source-state-abbreviation:BayDiG` | transform | warning |
| 15 | `undecidable-source-state-abbreviation:BayFAG` | transform | warning |
| 15 | `undecidable-source-state-abbreviation:BayKrG` | transform | warning |
| 15 | `undecidable-source-state-abbreviation:BayVV` | transform | warning |
| 14 | `superscript-unmapped:Hochstellung "…" in <p typ=-> hat keine Unicode-Entsprechung und bleibt unverändert` | parse | info |
| 14 | `undecidable-source-state-abbreviation:BayJG` | transform | warning |
| 14 | `undecidable-source-state-abbreviation:BayWoFG` | transform | warning |
| 13 | `empty-provision:Art. # hat keinen Textinhalt` | parse | warning |
| 13 | `title-possibly-truncated` | parse | warning |
| 13 | `undecidable-source-state-abbreviation:BayBSVI` | transform | warning |
| 13 | `undecidable-source-state-abbreviation:BayVGH` | transform | warning |
| 12 | `undecidable-source-state-abbreviation:BayBSVJu` | transform | warning |
| 12 | `undecidable-source-state-abbreviation:BayDG` | transform | warning |
| 12 | `undecidable-source-state-abbreviation:BayRiG` | transform | warning |
| 12 | `vv-paragraph-type-unknown:<p typ="leerzeile">` | parse | warning |
| 11 | `repealed-provision:§ #a ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten` | parse | info |
| 11 | `superscript-unmapped:Hochstellung "…" in <gliederung ebene=# Position #> hat keine Unicode-Entsprechung und bleibt unverändert` | parse | info |
| 11 | `undecidable-source-state-abbreviation:BayBQFG` | transform | warning |
| 11 | `undecidable-source-state-abbreviation:BayBSVK` | transform | warning |
| 11 | `undecidable-source-state-abbreviation:BayEG` | transform | warning |
| 11 | `undecidable-source-state-abbreviation:BayFwG` | transform | warning |
| 11 | `undecidable-source-state-abbreviation:BayInklR` | transform | warning |
| 11 | `undecidable-source-state-abbreviation:BayNV` | transform | warning |
| 11 | `undecidable-source-state-abbreviation:BayRDG` | transform | warning |
| 11 | `undecidable-source-state-abbreviation:BayTGV` | transform | warning |
| 10 | `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <annex ANL_#> → <annex.text> ; ersatzweise als „…“ geführt` | parse | warning |
| 10 | `norm-type-out-of-model:@doktyp="bekanntmachung"` | parse | warning |
| 10 | `organ-formula-conflict:Widersprüchliche Erlassformeln (Bayerisches Staatsministerium der Justiz / Bayerisches Staatsministerium); kein Erlassor…` | transform | warning |
| 10 | `organ-formula-conflict:Widersprüchliche Erlassformeln (Bayerisches Staatsministerium der Justiz und für Verbraucherschutz / Bayerisches Staatsm…` | transform | warning |
| 10 | `undecidable-source-state-abbreviation:BayAbfG` | transform | warning |
| 10 | `undecidable-source-state-abbreviation:BayGVFG` | transform | warning |
| 10 | `vv-superscript-ambiguous:<sup>#</sup> in <rumpf> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznummer gezählt` | parse | warning |
| 9 | `empty-provision:Art. #a hat keinen Textinhalt` | parse | warning |
| 9 | `empty-provision:§ # hat keinen Textinhalt` | parse | warning |
| 9 | `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <einzelnorm P_#> → <absatz.text> → Listenpunkt ; ersatzweise als „…“ geführt` | parse | warning |
| 9 | `undecidable-source-state-abbreviation:BayARV` | transform | warning |
| 9 | `undecidable-source-state-abbreviation:BayArchivG` | transform | warning |
| 9 | `undecidable-source-state-abbreviation:BayAzV` | transform | warning |
| 9 | `undecidable-source-state-abbreviation:BayLplG` | transform | warning |
| 8 | `organ-formula-conflict:Widersprüchliche Erlassformeln (Bayerisches Staatsministerium der Finanzen / Bayerisches Staatsministerium); kein Erlass…` | transform | warning |
| 8 | `repealed-provision:Art. #b ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten` | parse | info |
| 8 | `repealed-provision:Artikel # ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten` | parse | info |
| 8 | `undecidable-source-state-abbreviation:BayFiG` | transform | warning |
| 8 | `undecidable-source-state-abbreviation:BayVBl` | transform | warning |
| 8 | `undecidable-source-state-abbreviation:BayVSG` | transform | warning |
| 8 | `vv-superscript-ambiguous:<sup>#)</sup> in <p typ=-> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznummer gezählt` | parse | warning |
| 8 | `vv-superscript-ambiguous:<sup>#</sup> in <gliederung ebene=# Position #> → Listenpunkt steht nicht am Satzanfang; als Hochstellung übernommen, ni…` | parse | warning |
| 7 | `compound-proper-name:# zusammengesetzte(r) Eigenname(n) mit dem Landesnamen bleiben unverändert (BayernPortal); eine Überleitung wäre eine En…` | transform | info |
| 7 | `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <gliederung ebene=# Position #> → Listenpunkt ; ersatzweise als „…“ geführt` | parse | warning |
| 7 | `undecidable-source-state-abbreviation:BayAbgrG` | transform | warning |
| 7 | `undecidable-source-state-abbreviation:BayBGG` | transform | warning |
| 7 | `undecidable-source-state-abbreviation:BayFHVRG` | transform | warning |
| 7 | `undecidable-source-state-abbreviation:BayHintG` | transform | warning |
| 7 | `undecidable-source-state-abbreviation:BayUPZV` | transform | warning |
| 7 | `undecidable-source-state-abbreviation:BayVwVBes` | transform | warning |
| 7 | `vv-superscript-ambiguous:<sup>*)</sup> in <p typ=-> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznummer gezählt` | parse | warning |
| 6 | `compound-proper-name:# zusammengesetzte(r) Eigenname(n) mit dem Landesnamen bleiben unverändert (BayernCloud); eine Überleitung wäre eine Ent…` | transform | info |
| 6 | `compound-proper-name:# zusammengesetzte(r) Eigenname(n) mit dem Landesnamen bleiben unverändert (BayernLabo); eine Überleitung wäre eine Ents…` | transform | info |
| 6 | `division-without-heading` | parse | warning |
| 6 | `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <einzelnorm P_#> → <para.nr> ; ersatzweise als „…“ geführt` | parse | warning |
| 6 | `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <p typ=subtitel> ; ersatzweise als „…“ geführt` | parse | warning |
| 6 | `undecidable-source-state-abbreviation:BayBhV` | transform | warning |
| 6 | `undecidable-source-state-abbreviation:BayDSchG` | transform | warning |
| 6 | `undecidable-source-state-abbreviation:BayESG` | transform | warning |
| 6 | `undecidable-source-state-abbreviation:BaySvVollzG` | transform | warning |
| 6 | `undecidable-source-state-abbreviation:BayUVollzG` | transform | warning |
| 6 | `undecidable-source-state-abbreviation:BayWoBindG` | transform | warning |
| 6 | `undecidable-source-state-abbreviation:BayÖPNVG` | transform | warning |
| 6 | `vv-superscript-ambiguous:<sup>#)</sup> in <gliederung ebene=# Position #> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satzn…` | parse | warning |
| 5 | `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <einleitungssatz.text> ; ersatzweise als „…“ geführt` | parse | warning |
| 5 | `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <rumpf> → Listenpunkt ; ersatzweise als „…“ geführt` | parse | warning |
| 5 | `table-ragged:Tabelle in <einzelnorm P_#> → <absatz.text> : # Zeile(n) belegen weniger als # Spalten (…); die fehlenden Zellen werden …` | parse | warning |
| 5 | `table-ragged:Tabelle in <gliederung ebene=# Position #> : # Zeile(n) belegen weniger als # Spalten (…); die fehlenden Zellen werden a…` | parse | warning |
| 5 | `undecidable-source-state-abbreviation:BayAbgG` | transform | warning |
| 5 | `undecidable-source-state-abbreviation:BayBodSchG` | transform | warning |
| 5 | `undecidable-source-state-abbreviation:BayHSchPG` | transform | warning |
| 5 | `undecidable-source-state-abbreviation:BayImSchG` | transform | warning |
| 5 | `undecidable-source-state-abbreviation:BayNat` | transform | warning |
| 5 | `undecidable-source-state-abbreviation:BaySF` | transform | warning |
| 5 | `undecidable-source-state-abbreviation:BayStG` | transform | warning |
| 5 | `undecidable-source-state-abbreviation:BayTierZG` | transform | warning |
| 5 | `undecidable-source-state-abbreviation:BayZeit` | transform | warning |
| 4 | `empty-provision:Art. #b hat keinen Textinhalt` | parse | warning |
| 4 | `organ-formula-conflict:Widersprüchliche Erlassformeln (Bayerisches Staatsministerium für Landwirtschaft und Forsten / Bayerisches Staatsministe…` | transform | warning |
| 4 | `repealed-provision:Art. #c ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten` | parse | info |
| 4 | `superscript-unmapped:Hochstellung "…" in <annex ANL_#> → <annex.text> hat keine Unicode-Entsprechung und bleibt unverändert` | parse | info |
| 4 | `superscript-unmapped:Hochstellung "…" in <einzelnorm P_#> → <absatz.text> hat keine Unicode-Entsprechung und bleibt unverändert` | parse | info |
| 4 | `superscript-unmapped:Hochstellung "…" in <gliederung ebene=# Position #> → Listenpunkt hat keine Unicode-Entsprechung und bleibt unverändert` | parse | info |
| 4 | `undecidable-source-state-abbreviation:BayAbwAG` | transform | warning |
| 4 | `undecidable-source-state-abbreviation:BayBSVELF` | transform | warning |
| 4 | `undecidable-source-state-abbreviation:BayBSVFin` | transform | warning |
| 4 | `undecidable-source-state-abbreviation:BayEFG` | transform | warning |
| 4 | `undecidable-source-state-abbreviation:BayEbFöG` | transform | warning |
| 4 | `undecidable-source-state-abbreviation:BayFoG` | transform | warning |
| 4 | `undecidable-source-state-abbreviation:BayGAPV` | transform | warning |
| 4 | `undecidable-source-state-abbreviation:BayGnO` | transform | warning |
| 4 | `undecidable-source-state-abbreviation:BayGrStG` | transform | warning |
| 4 | `undecidable-source-state-abbreviation:BayHZG` | transform | warning |
| 4 | `undecidable-source-state-abbreviation:BayIntG` | transform | warning |
| 4 | `undecidable-source-state-abbreviation:BayPrG` | transform | warning |
| 4 | `undecidable-source-state-abbreviation:BayPsychKHG` | transform | warning |
| 4 | `undecidable-source-state-abbreviation:BayRS` | transform | warning |
| 4 | `undecidable-source-state-abbreviation:BayRettSanV` | transform | warning |
| 4 | `undecidable-source-state-abbreviation:BaySG` | transform | warning |
| 4 | `undecidable-source-state-abbreviation:BaySÜG` | transform | warning |
| 4 | `undecidable-source-state-abbreviation:BayVerfGH` | transform | warning |
| 4 | `vv-superscript-ambiguous:<sup>)</sup> in <gliederung ebene=# Position #> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznu…` | parse | warning |
| 4 | `vv-superscript-ambiguous:<sup>*</sup> in <p typ=-> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznummer gezählt` | parse | warning |
| 3 | `compound-proper-name:# zusammengesetzte(r) Eigenname(n) mit dem Landesnamen bleiben unverändert (BayernFonds); eine Überleitung wäre eine Ent…` | transform | info |
| 3 | `empty-provision:#. hat keinen Textinhalt` | parse | warning |
| 3 | `empty-provision:Art. #e hat keinen Textinhalt` | parse | warning |
| 3 | `empty-provision:§ #a hat keinen Textinhalt` | parse | warning |
| 3 | `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <p typ=titel> ; ersatzweise als „…“ geführt` | parse | warning |
| 3 | `historical-name-uncertain:versions[#].body[#].children[#].text: „…“ – historischer Vertragsname oder heutiger Selbstbezug? (Kontext: „…“)` | transform | warning |
| 3 | `organ-formula-conflict:Widersprüchliche Erlassformeln (Bayerisches Staatsministerium für Unterricht und Kultus / Bayerisches Staatsministerium …` | transform | warning |
| 3 | `repealed-provision:Art. #d ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten` | parse | info |
| 3 | `repealed-provision:Art. #e ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten` | parse | info |
| 3 | `undecidable-source-state-abbreviation:BayAnerkV` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BayArbZustG` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BayBFHG` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BayBSVA` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BayBergV` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BayEAG` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BayFamGG` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BayHS` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BayHSchLNV` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BayHiVV` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BayITR` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BayIngG` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BayKommV` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BayKompV` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BayMinG` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BayObLG` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BaySchwBerG` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BayUIG` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BayVGO` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BayVR` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BayVVStVollzG` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BayVersG` | transform | warning |
| 3 | `undecidable-source-state-abbreviation:BayVersRücklG` | transform | warning |
| 2 | `compound-proper-name:# zusammengesetzte(r) Eigenname(n) mit dem Landesnamen bleiben unverändert (BayernAtlas); eine Überleitung wäre eine Ent…` | transform | info |
| 2 | `compound-proper-name:# zusammengesetzte(r) Eigenname(n) mit dem Landesnamen bleiben unverändert (Bayerneffekt); eine Überleitung wäre eine En…` | transform | info |
| 2 | `compound-proper-name:# zusammengesetzte(r) Eigenname(n) mit dem Landesnamen bleiben unverändert (Bayernkolleg); eine Überleitung wäre eine En…` | transform | info |
| 2 | `compound-proper-name:# zusammengesetzte(r) Eigenname(n) mit dem Landesnamen bleiben unverändert (Bayernkollegs); eine Überleitung wäre eine E…` | transform | info |
| 2 | `compound-proper-name:# zusammengesetzte(r) Eigenname(n) mit dem Landesnamen bleiben unverändert (Bayernportal); eine Überleitung wäre eine En…` | transform | info |
| 2 | `compound-proper-name:# zusammengesetzte(r) Eigenname(n) mit dem Landesnamen bleiben unverändert (Bayernrecht); eine Überleitung wäre eine Ent…` | transform | info |
| 2 | `empty-provision:Art. #h hat keinen Textinhalt` | parse | warning |
| 2 | `empty-provision:Art. #k hat keinen Textinhalt` | parse | warning |
| 2 | `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <einzelnorm P_#> → <para.titel> ; ersatzweise als „…“ geführt` | parse | warning |
| 2 | `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <rumpf> ; ersatzweise als „…“ geführt` | parse | warning |
| 2 | `historical-name-uncertain:versions[#].body[#].children[#].children[#].children[#].text: „…“ – historischer Vertragsname oder heutiger Selbstbezug?…` | transform | warning |
| 2 | `historical-name-uncertain:versions[#].body[#].children[#].children[#].text: „…“ – historischer Vertragsname oder heutiger Selbstbezug? (Kontext: „…` | transform | warning |
| 2 | `norm-type-refined:@doktyp="bekanntmachung"` | parse | info |
| 2 | `organ-formula-conflict:Widersprüchliche Erlassformeln (Bayerisches Staatsministerium für Umwelt und Gesundheit / Bayerisches Staatsministerium)…` | transform | warning |
| 2 | `organ-formula-conflict:Widersprüchliche Erlassformeln (Bayerisches Staatsministerium für Umwelt und Verbraucherschutz / Bayerisches Staatsminis…` | transform | warning |
| 2 | `organ-formula-conflict:Widersprüchliche Erlassformeln (Bayerisches Staatsministerium für Wirtschaft und Verkehr / Bayerisches Staatsministerium…` | transform | warning |
| 2 | `repealed-provision:Art. #f ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten` | parse | info |
| 2 | `repealed-provision:Art. #h ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten` | parse | info |
| 2 | `superscript-unmapped:Hochstellung "…" in <einzelnorm P_#> → <absatz.text> → Listenpunkt hat keine Unicode-Entsprechung und bleibt unverändert` | parse | info |
| 2 | `superscript-unmapped:Hochstellung "…" in <rumpf> hat keine Unicode-Entsprechung und bleibt unverändert` | parse | info |
| 2 | `superscript-unmapped:Hochstellung "…" in <rumpf> → Listenpunkt hat keine Unicode-Entsprechung und bleibt unverändert` | parse | info |
| 2 | `table-colgroup-mismatch:Tabelle in <einzelnorm P_#> → <absatz.text> deklariert # Spalten, das Zellenraster ergibt #` | parse | warning |
| 2 | `table-flattened-in-text:Tabelle in <einzelnorm P_#> → <absatz.text> → Fußnotentext als # Textzeilen übernommen; die Spaltenform geht verloren` | parse | warning |
| 2 | `table-ragged:Tabelle in <rumpf> : # Zeile(n) belegen weniger als # Spalten ; die fehlenden Zellen werden am Zeilenende leer ergänzt, …` | parse | warning |
| 2 | `undecidable-source-state-abbreviation:BayAGBtG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayAGTierGesG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayAGWVG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayAVGFRG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayAföG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayAgrG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayBITV` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayBeauftrG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayEBG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayEGovG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayEzG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayGMPP` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayGastV` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayHSchLG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayHeilvfV` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayITSiR` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayIfSMV` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayJAVollzG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayKJHG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayKRegG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayKlimaG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayLArztG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayLErzGG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayLStG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayLTGeschO` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayLadSchlG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayLobbyRG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayMG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayMuttSchV` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayNpV` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayPetG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayRG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BaySachbezV` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BaySchiffV` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayStMJ` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayTierZV` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayUmlR` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayUniKlinG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayVVJug` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayVeBe` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayVerfOG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayWeinAFöG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayWeinRAV` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayWiVG` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayWolfV` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayXRFöR` | transform | warning |
| 2 | `undecidable-source-state-abbreviation:BayZBau` | transform | warning |
| 2 | `unknown-attribute:gliederung@ausserkraft` | parse | warning |
| 2 | `vv-superscript-ambiguous:<sup>#)</sup> in <gliederung ebene=# Position #> → Listenpunkt steht nicht am Satzanfang; als Hochstellung übernommen, n…` | parse | warning |
| 2 | `vv-superscript-ambiguous:<sup>#)</sup> in <rumpf> → Listenpunkt steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznummer gezä…` | parse | warning |
| 2 | `vv-superscript-ambiguous:<sup>)</sup> in <p typ=-> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznummer gezählt` | parse | warning |
| 2 | `vv-superscript-ambiguous:<sup>*)</sup> in <gliederung ebene=# Position #> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satzn…` | parse | warning |
| 2 | `vv-superscript-ambiguous:<sup>**)</sup> in <p typ=-> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznummer gezählt` | parse | warning |
| 2 | `vv-superscript-ambiguous:<sup>***)</sup> in <p typ=-> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznummer gezählt` | parse | warning |
| 2 | `vv-superscript-ambiguous:<sup>-#</sup> in <gliederung ebene=# Position #> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satzn…` | parse | warning |
| 1 | `compound-proper-name:# zusammengesetzte(r) Eigenname(n) mit dem Landesnamen bleiben unverändert (BayernNetz); eine Überleitung wäre eine Ents…` | transform | info |
| 1 | `compound-proper-name:# zusammengesetzte(r) Eigenname(n) mit dem Landesnamen bleiben unverändert (BayernNetzNatur); eine Überleitung wäre eine…` | transform | info |
| 1 | `compound-proper-name:# zusammengesetzte(r) Eigenname(n) mit dem Landesnamen bleiben unverändert (BayernPortals); eine Überleitung wäre eine E…` | transform | info |
| 1 | `compound-proper-name:# zusammengesetzte(r) Eigenname(n) mit dem Landesnamen bleiben unverändert (Bayernbefliegung); eine Überleitung wäre ein…` | transform | info |
| 1 | `compound-proper-name:# zusammengesetzte(r) Eigenname(n) mit dem Landesnamen bleiben unverändert (Bayernhymne); eine Überleitung wäre eine Ent…` | transform | info |
| 1 | `compound-proper-name:# zusammengesetzte(r) Eigenname(n) mit dem Landesnamen bleiben unverändert (Bayernnetz); eine Überleitung wäre eine Ents…` | transform | info |
| 1 | `compound-proper-name:# zusammengesetzte(r) Eigenname(n) mit dem Landesnamen bleiben unverändert (Bayernweit); eine Überleitung wäre eine Ents…` | transform | info |
| 1 | `compound-proper-name:# zusammengesetzte(r) Eigenname(n) mit dem Landesnamen bleiben unverändert (Bayernwerk); eine Überleitung wäre eine Ents…` | transform | info |
| 1 | `empty-provision:# hat keinen Textinhalt` | parse | warning |
| 1 | `empty-provision:(Satzung hier nicht wiedergegeben) hat keinen Textinhalt` | parse | warning |
| 1 | `empty-provision:Art. #c hat keinen Textinhalt` | parse | warning |
| 1 | `empty-provision:Art. #i hat keinen Textinhalt` | parse | warning |
| 1 | `empty-provision:§ #g hat keinen Textinhalt` | parse | warning |
| 1 | `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <einleitungssatz.text> → Listenpunkt ; ersatzweise als „…“ geführt` | parse | warning |
| 1 | `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <einzelnorm P_#> → <absatz.nr> ; ersatzweise als „…“ geführt` | parse | warning |
| 1 | `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <einzelnorm P_#> → <absatz.text> → Listenpunkt → Listenpunkt ; ersatzweise al…` | parse | warning |
| 1 | `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <gliederung G_#> → <gliederung.nr> ; ersatzweise als „…“ geführt` | parse | warning |
| 1 | `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <gliederung ebene=# Position #> → <gliederung.titel> ; ersatzweise als „…“ ge…` | parse | warning |
| 1 | `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <rumpf> → Listenpunkt → Listenpunkt ; ersatzweise als „…“ geführt` | parse | warning |
| 1 | `graphic-not-transferred` | parse | warning |
| 1 | `historical-name-uncertain:meta.initialCitation: „…“ – historischer Vertragsname oder heutiger Selbstbezug? (Kontext: „…“)` | transform | warning |
| 1 | `historical-name-uncertain:meta.title: „…“ – historischer Vertragsname oder heutiger Selbstbezug? (Kontext: „…“)` | transform | warning |
| 1 | `historical-name-uncertain:versions[#].body[#].title: „…“ – historischer Vertragsname oder heutiger Selbstbezug? (Kontext: „…“)` | transform | warning |
| 1 | `historical-name-uncertain:versions[#].citation: „…“ – historischer Vertragsname oder heutiger Selbstbezug? (Kontext: „…“)` | transform | warning |
| 1 | `norm-type-refined:@doktyp="gesetz"` | parse | info |
| 1 | `organ-formula-conflict:Widersprüchliche Erlassformeln (Bayerisches Staatsministerium der Finanzen / Staatsministerium der Finanzen); kein Erlas…` | transform | warning |
| 1 | `organ-formula-conflict:Widersprüchliche Erlassformeln (Bayerisches Staatsministerium der Finanzen vom / Bayerisches Staatsministerium der Finan…` | transform | warning |
| 1 | `organ-formula-conflict:Widersprüchliche Erlassformeln (Bayerisches Staatsministerium der Justiz / Bayerisches Staatsministerium / Staatsministe…` | transform | warning |
| 1 | `organ-formula-conflict:Widersprüchliche Erlassformeln (Bayerisches Staatsministerium des Innern / Bayerisches Staatsministerium / Staatsministe…` | transform | warning |
| 1 | `organ-formula-conflict:Widersprüchliche Erlassformeln (Bayerisches Staatsministerium des Innern / Bayerisches Staatsministerium des Innern mit …` | transform | warning |
| 1 | `organ-formula-conflict:Widersprüchliche Erlassformeln (Bayerisches Staatsministerium des Innern / Staatsministerium des Innern gemäß § #a Abs. …` | transform | warning |
| 1 | `organ-formula-conflict:Widersprüchliche Erlassformeln (Bayerisches Staatsministerium für Digitales und des Bayerischen Staatsministeriums der F…` | transform | warning |
| 1 | `organ-formula-conflict:Widersprüchliche Erlassformeln (Bayerisches Staatsministerium für Landesentwicklung und Umweltfragen / Bayerisches Staat…` | transform | warning |
| 1 | `organ-formula-conflict:Widersprüchliche Erlassformeln (Bayerisches Staatsministerium für Wissenschaft und Kunst / Bayerisches Staatsministerium…` | transform | warning |
| 1 | `proper-name-uncertain:versions[#].body[#].children[#].children[#].text: „…“ in der vor dem #. Juli # geltenden“ – Markenname mit Landesbezeich…` | transform | warning |
| 1 | `proper-name-uncertain:versions[#].body[#].children[#].text: „…“ – Markenname mit Landesbezeichnung: Namensbestandteil oder Landesbezug?` | transform | warning |
| 1 | `repealed-provision:#. ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten` | parse | info |
| 1 | `repealed-provision:Art. #g ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten` | parse | info |
| 1 | `repealed-provision:Art. #i ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten` | parse | info |
| 1 | `repealed-provision:Art. #j ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten` | parse | info |
| 1 | `repealed-provision:Art. #k ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten` | parse | info |
| 1 | `repealed-provision:Art. #l ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten` | parse | info |
| 1 | `table-colgroup-mismatch:Tabelle in <rumpf> deklariert # Spalten, das Zellenraster ergibt #` | parse | warning |
| 1 | `table-flattened-in-text:Tabelle in <rumpf> als # Textzeilen übernommen; die Spaltenform geht verloren` | parse | warning |
| 1 | `table-ragged:Tabelle in <einzelnorm P_#> → <absatz.text> : # Zeile(n) belegen weniger als # Spalten ; die fehlenden Zellen werden am …` | parse | warning |
| 1 | `table-ragged:Tabelle in <gliederung ebene=# Position #> : # Zeile(n) belegen weniger als # Spalten ; die fehlenden Zellen werden am Z…` | parse | warning |
| 1 | `undecidable-source-state-abbreviation:BayABfG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayAFWoG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayAGBAföG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayAGBMG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayAGPIDV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayAGTierNebG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayALKISV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayAPOFspl` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayAgrSchO` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayArbGGTV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayAusglZV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayBBiGHwoV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayBEP` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayBFG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayBL` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayBSVII` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayBSVJuIV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayBSVWV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayBSVl` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayBTBek` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayBVAnpG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayBadeGewV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayBek` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayBergSkiV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayBerufV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayBhVBek` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayBio` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayBioökonomie` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayBlindG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayBsVFin` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayBörsV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayDAV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayDiGuP` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayDiV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayDokZugV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayEGovV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayEbFög` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayEuG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayFEV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayFGV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayFHVR` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayFHolz` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayFIA` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayFOR` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayFiBek` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayFraktG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayGDIG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayGFR` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayGaV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayGrSt` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayHLeistBV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayHSchWO` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayHebBO` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayHoPr` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayHopfDV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayHopfPerV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayHygV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayHärteV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayIKa` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayITS` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayITSiLL` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayIngAMV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayInklRL` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayIntVerstV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayJBBek` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayJobBikeBekanntmachung` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayKHV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayKRG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayKRegV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayKatFortGebG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayKiG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayKom` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayKommun` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayLE` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayLFA` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayLHafSchUO` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayLPZV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayLPflGG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayLSG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayLStS` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayLaBG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayLandHafenVerw` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayLfU` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayLuftZustV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayMBS` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayMRVG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayMeldeDÜV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayMilchUmlV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayMoG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayModR` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayMuSchV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayNVAnpBek` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayNatSchFS` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayNatschG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayPE` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayPfleG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayRMS` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayRSG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayRadG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayRohrlEnteigG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BaySGGO` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BaySL` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BaySTW` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BaySchlG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayScho` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BaySchwBerV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BaySchwHEG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BaySenG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BaySozBAG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BaySozKiPädG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BaySportG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayStMGP` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayStartUP` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayStatG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayStudAkkV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BaySubvG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BaySÜBV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayTB` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayTKA` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayTP` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayUCtiz` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayVFP` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayVSA` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayVVS` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayVVUVollzO` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayVerfGHE` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayVkV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayVollstrPl` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayVollstrVV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayVwSG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayVwVStrRehaG` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayWEE` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayWHopfV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayWOP` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayWaffV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayWaldNatPV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayWoVR` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayZfR` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayZulV` | transform | warning |
| 1 | `undecidable-source-state-abbreviation:BayZustPl` | transform | warning |
| 1 | `vv-superscript-ambiguous:<sup>#)</sup> in <rumpf> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznummer gezählt` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>#</sup> in <p typ=-> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznummer gezählt` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>(#), (#) oder (#)</sup> in <gliederung ebene=# Position #> → Listenpunkt steht nicht am Satzanfang; als Hochstellun…` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>(#), (#)</sup> in <gliederung ebene=# Position #> → Listenpunkt steht nicht am Satzanfang; als Hochstellung übernom…` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>(#)</sup> in <gliederung ebene=# Position #> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satz…` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>(#)</sup> in <gliederung ebene=# Position #> → Listenpunkt steht nicht am Satzanfang; als Hochstellung übernommen, …` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>*)</sup> in <gliederung ebene=# Position #> → Listenpunkt steht nicht am Satzanfang; als Hochstellung übernommen, n…` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>*)</sup> in <rumpf> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznummer gezählt` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>*)</sup> in <rumpf> → Listenpunkt steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznummer gezä…` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>**)</sup> in <gliederung ebene=# Position #> → Listenpunkt steht nicht am Satzanfang; als Hochstellung übernommen, …` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>**)</sup> in <rumpf> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznummer gezählt` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>**)</sup> in <rumpf> → Listenpunkt steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznummer gez…` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>****)</sup> in <gliederung ebene=# Position #> → Listenpunkt steht nicht am Satzanfang; als Hochstellung übernommen…` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>**</sup> in <gliederung ebene=# Position #> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satzn…` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>*</sup> in <gliederung ebene=# Position #> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznu…` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>*</sup> in <rumpf> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznummer gezählt` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>*</sup> in <rumpf> → Listenpunkt steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznummer gezäh…` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>. #</sup> in <gliederung ebene=# Position #> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satz…` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>.</sup> in <p typ=-> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznummer gezählt` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>I</sup> in <gliederung ebene=# Position #> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznu…` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>II</sup> in <gliederung ebene=# Position #> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satzn…` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>_________________________________</sup> in <p typ=-> steht nicht am Satzanfang; als Hochstellung übernommen, nicht …` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>a)</sup> in <gliederung ebene=# Position #> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satzn…` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>b)</sup> in <gliederung ebene=# Position #> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satzn…` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>c)</sup> in <gliederung ebene=# Position #> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satzn…` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>e)</sup> in <gliederung ebene=# Position #> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satzn…` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>p</sup> in <gliederung ebene=# Position #> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Satznu…` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>plus</sup> in <gliederung ebene=# Position #> steht nicht am Satzanfang; als Hochstellung übernommen, nicht als Sat…` | parse | warning |
| 1 | `vv-superscript-ambiguous:<sup>plus</sup> in <gliederung ebene=# Position #> → Listenpunkt steht nicht am Satzanfang; als Hochstellung übernommen,…` | parse | warning |

### Die Klassen im Einzelnen

Zuerst alle 0 Klassen mit Gewicht `error` (sie halten den Bulk-Lauf auf), danach die 40 größten der übrigen. Alle 496 Klassen stehen in der Tabelle oben und vollständig in `data/imports/bayernrecht/inventory.json`.

#### `protected-source-state-reference:# Nennung(en) des Quelllandes stehen in geschützten Bereichen (…) und bleiben bewusst erhalten` · 1553 Dokumente

Stufe transform · Gewicht info

- `ApothStV`: 2 Nennung(en) des Quelllandes stehen in geschützten Bereichen (Quellzitat, Fundstelle oder fremder Eigenname) und bleiben bewusst erhalten
- `BAY_2131_3_7_I`: 1 Nennung(en) des Quelllandes stehen in geschützten Bereichen (Quellzitat, Fundstelle oder fremder Eigenname) und bleiben bewusst erhalten
- `BAY_2131_3_8_I`: 1 Nennung(en) des Quelllandes stehen in geschützten Bereichen (Quellzitat, Fundstelle oder fremder Eigenname) und bleiben bewusst erhalten
- `BAY_2210_2_5_4_WFK`: 1 Nennung(en) des Quelllandes stehen in geschützten Bereichen (Quellzitat, Fundstelle oder fremder Eigenname) und bleiben bewusst erhalten
- `BAY_2220_3_UK`: 4 Nennung(en) des Quelllandes stehen in geschützten Bereichen (Quellzitat, Fundstelle oder fremder Eigenname) und bleiben bewusst erhalten
- … und 1548 weitere Dokumente mit derselben Signatur

#### `sentence-numbers` · 1485 Dokumente

Stufe parse · Gewicht info

- `ARDStV`: 60 Satznummern als Inline-Marker übernommen (Unicode-Hochzahl vor dem Satz)
- `AkadGrAuslHsStV`: 6 Satznummern als Inline-Marker übernommen (Unicode-Hochzahl vor dem Satz)
- `ApothStV`: 22 Satznummern als Inline-Marker übernommen (Unicode-Hochzahl vor dem Satz)
- `BAY_110_1984_201`: 4 Satznummern als Inline-Marker übernommen (Unicode-Hochzahl vor dem Satz)
- `BAY_2131_3_7_I`: 12 Satznummern als Inline-Marker übernommen (Unicode-Hochzahl vor dem Satz)
- … und 1480 weitere Dokumente mit derselben Signatur

#### `enacting-body-mapping-required:Erlassorgan der Quelle „…“ ohne sichere Entsprechung; Simulationsorgan bleibt leer (manuelle Entscheidung)` · 1459 Dokumente

Stufe transform · Gewicht warning

- `BAY_2210_2_5_4_WFK`: Erlassorgan der Quelle „Bayerisches Staatsministerium für Wissenschaft und Kunst“ ohne sichere Entsprechung; Simulationsorgan bleibt leer (manuelle Entscheidung)
- `BAY_2230_1_1_2_UK`: Erlassorgan der Quelle „Bayerisches Staatsministerium für Unterricht und Kultus“ ohne sichere Entsprechung; Simulationsorgan bleibt leer (manuelle Entscheidung)
- `BAY_2237_4_UK`: Erlassorgan der Quelle „Bayerisches Staatsministerium für Unterricht und Kultus“ ohne sichere Entsprechung; Simulationsorgan bleibt leer (manuelle Entscheidung)
- `BAY_791_3_148_U`: Erlassorgan der Quelle „Bayerisches Staatsministerium für Landesentwicklung und Umweltfragen“ ohne sichere Entsprechung; Simulationsorgan bleibt leer (manuelle Entscheidung)
- `BAY_791_3_150_U`: Erlassorgan der Quelle „Bayerisches Staatsministerium für Landesentwicklung und Umweltfragen“ ohne sichere Entsprechung; Simulationsorgan bleibt leer (manuelle Entscheidung)
- … und 1454 weitere Dokumente mit derselben Signatur

#### `vv-section-address-unresolved` · 1143 Dokumente

Stufe parse · Gewicht info

- `BayAVVForst`: 22 Gliederungen ohne Permalink: das numerische Gliederungssuffix der Verwaltungsvorschriften (BayVwV…-0, -13, -19, …) ist ungeklärt; der Positionspfad ist mitgezählt, eine Portal-I…
- `BayBeurtRELF`: 41 Gliederungen ohne Permalink: das numerische Gliederungssuffix der Verwaltungsvorschriften (BayVwV…-0, -13, -19, …) ist ungeklärt; der Positionspfad ist mitgezählt, eine Portal-I…
- `BayDONot`: 233 Gliederungen ohne Permalink: das numerische Gliederungssuffix der Verwaltungsvorschriften (BayVwV…-0, -13, -19, …) ist ungeklärt; der Positionspfad ist mitgezählt, eine Portal-…
- `BayFkzBek`: 35 Gliederungen ohne Permalink: das numerische Gliederungssuffix der Verwaltungsvorschriften (BayVwV…-0, -13, -19, …) ist ungeklärt; der Positionspfad ist mitgezählt, eine Portal-I…
- `BayGVGABek`: 2 Gliederungen ohne Permalink: das numerische Gliederungssuffix der Verwaltungsvorschriften (BayVwV…-0, -13, -19, …) ist ungeklärt; der Positionspfad ist mitgezählt, eine Portal-ID…
- … und 1138 weitere Dokumente mit derselben Signatur

#### `tables` · 811 Dokumente

Stufe parse · Gewicht info

- `BAY_2131_3_7_I`: 2 Tabellen nach dem Blockmodell übernommen
- `BayA6_VerkVwAbk`: 1 Tabellen nach dem Blockmodell übernommen
- `BayAASGebO`: 4 Tabellen nach dem Blockmodell übernommen
- `BayAGO`: 1 Tabellen nach dem Blockmodell übernommen
- `BayAGSG`: 1 Tabellen nach dem Blockmodell übernommen
- … und 806 weitere Dokumente mit derselben Signatur

#### `footnotes` · 739 Dokumente

Stufe parse · Gewicht info

- `ARDStV`: 1 Fußnoten aus <fn.call> an der Aufrufstelle übernommen (1 ohne eigenes Aufrufzeichen)
- `AkadGrAuslHsStV`: 2 Fußnoten aus <fn.call> an der Aufrufstelle übernommen (1 ohne eigenes Aufrufzeichen)
- `ApothStV`: 1 Fußnoten aus <fn.call> an der Aufrufstelle übernommen (1 ohne eigenes Aufrufzeichen)
- `BAY_110_1984_201`: 1 Fußnoten aus <fn.call> an der Aufrufstelle übernommen (1 ohne eigenes Aufrufzeichen)
- `BAY_2220_3_UK`: 1 Fußnoten aus <fn.call> an der Aufrufstelle übernommen (0 ohne eigenes Aufrufzeichen)
- … und 734 weitere Dokumente mit derselben Signatur

#### `vv-depth-beyond-model` · 482 Dokumente

Stufe parse · Gewicht info

- `BayBeurtRELF`: 18 Gliederungen liegen unterhalb der zweiten Ebene (größte Tiefe 3); sie werden als „subsection“ geführt, weil das Zielmodell darunter keine eigene Ebene kennt
- `BayDONot`: 145 Gliederungen liegen unterhalb der zweiten Ebene (größte Tiefe 5); sie werden als „subsection“ geführt, weil das Zielmodell darunter keine eigene Ebene kennt
- `BayKPArbG`: 58 Gliederungen liegen unterhalb der zweiten Ebene (größte Tiefe 4); sie werden als „subsection“ geführt, weil das Zielmodell darunter keine eigene Ebene kennt
- `BayTKBek`: 10 Gliederungen liegen unterhalb der zweiten Ebene (größte Tiefe 3); sie werden als „subsection“ geführt, weil das Zielmodell darunter keine eigene Ebene kennt
- `BayUKGVollzH`: 10 Gliederungen liegen unterhalb der zweiten Ebene (größte Tiefe 4); sie werden als „subsection“ geführt, weil das Zielmodell darunter keine eigene Ebene kennt
- … und 477 weitere Dokumente mit derselben Signatur

#### `undecidable-source-state-abbreviation:BayHO` · 324 Dokumente

Stufe transform · Gewicht warning

- `BayFAGDV02`: 57 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayFAG, BayAVGFRG, BayStrWG, BayHO); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheide…
- `BayFoG`: 4 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayFoG, BayHO); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsb…
- `BayFoStS`: 1 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayHO); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsbericht (…
- `BayGUW_GebO`: 1 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayHO); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsbericht (…
- `BayGedStG`: 1 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayHO); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsbericht (…
- … und 319 weitere Dokumente mit derselben Signatur

#### `referenced-file-case-mismatch` · 317 Dokumente

Stufe parse · Gewicht info

- `BAY_2131_3_7_I`: BAY_2131_3_7_I: 1 Dateiverweise weichen in der Groß-/Kleinschreibung vom Paketmanifest ab (Bay_2131_3_7_I_BayStBauEntwBVRegensbg-ANL-1-N1.pdf → BAY_2131_3_7_I_BayStBauEntwBVRegensb…
- `BAY_2131_3_8_I`: BAY_2131_3_8_I: 1 Dateiverweise weichen in der Groß-/Kleinschreibung vom Paketmanifest ab (Bay_2131_3_8_I_BayStBauEntwBVStraubing-ANL-1-N1.pdf → BAY_2131_3_8_I_BayStBauEntwBVStraub…
- `BAY_791_3_150_U`: BAY_791_3_150_U: 1 Dateiverweise weichen in der Groß-/Kleinschreibung vom Paketmanifest ab (Bay_791_3_150_U_BayNatSchGebV1986-163-ANL-N1.jpg → BAY_791_3_150_U_BayNatSchGebV1986-163…
- `BAY_791_3_151_U`: BAY_791_3_151_U: 2 Dateiverweise weichen in der Groß-/Kleinschreibung vom Paketmanifest ab (Bay_791_3_151_U_Bay-791-3-151-U-ANL-N1.pdf → BAY_791_3_151_U_BAY-791-3-151-U-ANL-N1.pdf,…
- `BAY_791_3_153_U`: BAY_791_3_153_U: 3 Dateiverweise weichen in der Groß-/Kleinschreibung vom Paketmanifest ab (Bay_791_3_153_U_Bay-791-3-153-U-ANL-N1.jpg → BAY_791_3_153_U_Bay-791-3-153-U-ANL-N1.jpg,…
- … und 312 weitere Dokumente mit derselben Signatur

#### `vv-bayrs-number-absent` · 284 Dokumente

Stufe parse · Gewicht info

- `BayRegisSTARDV`: Die erste Zeile des Titelabsatzes ("Dienstvereinbarung über die Einführung und Anwendung des Statistikmoduls im Fachverfahren RegisSTAR bei den Registergerichten im Geschäftsbereic…
- `BayVVStVollzG`: Die erste Zeile des Titelabsatzes ("Verwaltungsvorschriften zum Strafvollzugsgesetz (VVStVollzG)") ist keine Gliederungsnummer; es wird keine erfunden
- `BayVV_1102_F_875`: Die erste Zeile des Titelabsatzes ("Bürger-Engagement für Moderne Verwaltung") ist keine Gliederungsnummer; es wird keine erfunden
- `BayVV_1132_F_035`: Die erste Zeile des Titelabsatzes ("Verleihung einer Medaille für besondere Verdienste um die bayerischen Schlösser, Gärten und Seen sowie Heimat und Brauchtum") ist keine Gliederu…
- `BayVV_1132_F_054`: Die erste Zeile des Titelabsatzes ("Verleihung einer Medaille für besondere Verdienste um die Bayerische Vermessungsverwaltung") ist keine Gliederungsnummer; es wird keine erfunden
- … und 279 weitere Dokumente mit derselben Signatur

#### `vv-section-effective-dates` · 170 Dokumente

Stufe parse · Gewicht info

- `BayDONot`: 17 Gliederungen tragen @inkraft (2022-01-01, 2022-07-01, 2023-06-01, 2024-11-01, 2025-05-01); abschnittsweise Zeitinformation, die das Normmodell nicht kennt
- `BayFkzBek`: 1 Gliederungen tragen @inkraft (2023-05-01); abschnittsweise Zeitinformation, die das Normmodell nicht kennt
- `BayHiMiBekmJD`: 1 Gliederungen tragen @inkraft (2024-08-01); abschnittsweise Zeitinformation, die das Normmodell nicht kennt
- `BayKPArbG`: 3 Gliederungen tragen @inkraft (2018-03-31); abschnittsweise Zeitinformation, die das Normmodell nicht kennt
- `BayVVWoBindR`: 8 Gliederungen tragen @inkraft (2017-08-01); abschnittsweise Zeitinformation, die das Normmodell nicht kennt
- … und 165 weitere Dokumente mit derselben Signatur

#### `undecidable-source-state-abbreviation:BayVwVfG` · 165 Dokumente

Stufe transform · Gewicht warning

- `BayAGFlurbG`: 3 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayNatSchG, BayVwVfG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transform…
- `BayAGO`: 2 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayVwVfG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsberich…
- `BayAVEAG`: 6 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayEAG, BayVwVfG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformatio…
- `BayAbmG`: 1 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayVwVfG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsberich…
- `BayBFSO2023`: 26 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayEUG, BaySchO, BayVwVfG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Tra…
- … und 160 weitere Dokumente mit derselben Signatur

#### `undecidable-source-state-abbreviation:BayEUG` · 157 Dokumente

Stufe transform · Gewicht warning

- `BAY_2230_1_1_2_UK`: 4 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayEUG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsbericht …
- `BayAGSG`: 5 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayKiBiG, BayEUG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformatio…
- `BayAPE`: 7 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayEUG, BayEbFöG, BaySchO); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Tran…
- `BayAPOFspl`: 4 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayAPOFspl, BayEUG, BayHSchG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der T…
- `BayAVKiBiG`: 46 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayKiBiG, BayEUG, BayRKG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Tran…
- … und 152 weitere Dokumente mit derselben Signatur

#### `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <titelangaben> ; ersatzweise als „…“ geführt` · 155 Dokumente

Stufe parse · Gewicht warning

- `ARDStV` (Zeile 27): <titelangaben>ARD-Staatsvertrag<br /> (<amtlicheAbk>ARD-StV</amtlicheAbk>)<br />vom 31. August 1991<fn.call role="nichtamtlich"><fn.text /><fn.def><p>Der Staatsvertrag wurde ratifi…
- `AkadGrAuslHsStV` (Zeile 27): <titelangaben>Abkommen zwischen den Ländern in der Bundesrepublik Deutschland über die Genehmigung zur Führung akademischer Grade ausländischer Hochschulen und entsprechender auslä…
- `ApothStV` (Zeile 27): <titelangaben>Staatsvertrag zwischen dem Freistaat Bayern und dem Saarland über die Zugehörigkeit der Apotheker und Pharmaziepraktikanten des Saarlandes zur Bayerischen Apothekerve…
- `BAY_110_1984_201` (Zeile 27): <titelangaben>Staatsvertrag zwischen dem Freistaat Bayern und dem Land Baden-Württemberg über die Festlegung der Landesgrenze im Main<br />Vom 20. Oktober 1983<fn.call role="nichta…
- `BAY_753_1_9_58` (Zeile 27): <titelangaben>Verwaltungsabkommen über die Bestimmung der zuständigen Behörde für die Festsetzung eines Wasserschutzgebietes zum Schutz der Trinkwassergewinnungsanlage „Mischbornqu…
- … und 150 weitere Dokumente mit derselben Signatur

#### `undecidable-source-state-abbreviation:BayBG` · 151 Dokumente

Stufe transform · Gewicht warning

- `BayAPO`: 4 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayBG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsbericht (…
- `BayAltersGewV`: 2 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayBG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsbericht (…
- `BayArbSchV`: 3 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayBG, BayArbZustG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformat…
- `BayAzV`: 11 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayAzV, BayBG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformations…
- `BayBG`: 34 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayBG, BayVwVfG, BayBesG, BayBeamtVG, BayDG, …3 weitere); ob sie zu einer amtlichen Kurzbezeichnun…
- … und 146 weitere Dokumente mit derselben Signatur

#### `division-word-unmapped:Gliederungsüberschrift "…" in <gliederung G_#> nennt kein bekanntes Gliederungswort; Ebene # wird als „…“ geführt` · 134 Dokumente

Stufe parse · Gewicht info

- `ARDStV`: Gliederungsüberschrift "Inhaltsübersicht" in <gliederung G_1> nennt kein bekanntes Gliederungswort; Ebene 1 wird als „part“ geführt
- `BayABOB`: Gliederungsüberschrift "Inhaltsübersicht" in <gliederung G_1> nennt kein bekanntes Gliederungswort; Ebene 1 wird als „part“ geführt
- `BayAGO`: Gliederungsüberschrift "Allgemeines" in <gliederung G_10> nennt kein bekanntes Gliederungswort; Ebene 1 wird als „part“ geführt
- `BayAVJG`: Gliederungsüberschrift "Zu Art. 6 Abs. 3 BayJG:" in <gliederung G_1> nennt kein bekanntes Gliederungswort; Ebene 1 wird als „part“ geführt
- `BayAbfAlG`: Gliederungsüberschrift "Art. 16–17 (aufgehoben)" in <gliederung G_6> nennt kein bekanntes Gliederungswort; Ebene 3 wird als „subsection“ geführt
- … und 129 weitere Dokumente mit derselben Signatur

#### `division-number-before-title` · 125 Dokumente

Stufe parse · Gewicht info

- `BayEBekMiZi`: BayEBekMiZi: <titelangaben> stellt die Gliederungsnummer „3004.0-J“ vor den Titel; sie wird als Gliederungsnummer geführt, nicht als Titelbestandteil
- `BayGBGA`: BayGBGA: <titelangaben> stellt die Gliederungsnummer „3151-J“ vor den Titel; sie wird als Gliederungsnummer geführt, nicht als Titelbestandteil
- `BayPKHGDB`: BayPKHGDB: <titelangaben> stellt die Gliederungsnummer „3102-J“ vor den Titel; sie wird als Gliederungsnummer geführt, nicht als Titelbestandteil
- `BayVV_108268`: BayVV_108268: <titelangaben> stellt die Gliederungsnummer „2030.3-I“ vor den Titel; sie wird als Gliederungsnummer geführt, nicht als Titelbestandteil
- `BayVV_1301_I_15405`: BayVV_1301_I_15405: <titelangaben> stellt die Gliederungsnummer „1301-I“ vor den Titel; sie wird als Gliederungsnummer geführt, nicht als Titelbestandteil
- … und 120 weitere Dokumente mit derselben Signatur

#### `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <aenderungsverlauf> → Listenpunkt ; ersatzweise als „…“ geführt` · 115 Dokumente

Stufe parse · Gewicht warning

- `BayAGGVG` (Zeile 163): vom 22.12.2009<fn.call><fn.text /><fn.def><p>§ 1 dieses Gesetzes dient der Umsetzung der <verweis.norm><v.abk ersatz="EWG_RL_2006_123">Richtlinie 2006/123/EG</v.abk></verweis.norm>…
- `BayAGSG` (Zeile 83): vom 22.12.2009<fn.call><fn.text /><fn.def><p>§ 1 Nr. 7 dieses Gesetzes dient der Umsetzung der <verweis.norm><v.abk ersatz="EWG_RL_2006_123">Richtlinie 2006/123/EG</v.abk></verweis…
- `BayAGTTG` (Zeile 87): § <v.norm ersatz="Bay_110_2026_75">2</v.norm> <v.abk ersatz="Bay_110_2026_75">Viertes Modernisierungsgesetz Bayern</v.abk><fn.call><fn.text /><fn.def><p>Notifiziert gemäß der <verw…
- `BayAVFiG` (Zeile 148): § <v.norm ersatz="Bay_110_2024_0619">12</v.norm> <v.abk ersatz="Bay_110_2024_0619">Zweites ModernisierungsG Bayern</v.abk><fn.call><fn.text /><fn.def><p>Dieses Gesetz dient der Ums…
- `BayAVFwG` (Zeile 146): <fn.call><fn.text /><fn.def><p>Diese Verordnung dient der Umsetzung der <verweis.norm><v.abk ersatz="EWG_RL_2005_36">Richtlinie 2005/36/EG</v.abk></verweis.norm> des Europäischen P…
- … und 110 weitere Dokumente mit derselben Signatur

#### `slug-collision` · 109 Dokumente

Stufe transform · Gewicht warning

- `StVAbkGleichHochBil`: abkommen-zwischen-den-laendern-der-bundesrepublik-deutschland-zur-baywue: StVAbkGleichHochBil, StVDDRFachschGlAO
- `BayVV_2023_I_2045`: aufstellung-und-vollzug-der-haushaltsplaene-der-kommunen-baywue: BayVV_2023_I_2045, BayVV_2023_I_2155, BayVV_2023_I_2179, BayVV_2023_I_2214, BayVV_2023_I_2230, BayVV_2023_I_2273, B…
- `BayVV_2126_1_UK_128`: bayvv-jugendzahnpflege-baywue: BayVV_2126_1_UK_128, BayVV_2126_1_UK_129
- `BayBegnadBek`: bekanntmachung-des-bayern-wuerttembergischen-ministerpraesidenten-ueber-baywue: BayBegnadBek, BayGnadVerfDatBek
- `BayVV_3122_2_7_J_430`: gtv-baywue: BayVV_3122_2_7_J_430, BayVwV153959
- … und 104 weitere Dokumente mit derselben Signatur

#### `undecidable-source-state-abbreviation:BayBesG` · 77 Dokumente

Stufe transform · Gewicht warning

- `BAY_2220_3_UK`: 21 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayBesG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsberich…
- `BayAVSchFG`: 98 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BaySchFG, BayEUG, BayBesG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Tra…
- `BayAusglZV`: 4 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayAusglZV, BayBesG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transforma…
- `BayBG`: 34 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayBG, BayVwVfG, BayBesG, BayBeamtVG, BayDG, …3 weitere); ob sie zu einer amtlichen Kurzbezeichnun…
- `BayBeamtVG`: 89 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayBeamtVG, BayBesG, BayBG, BayHIG, BayBVAnpG, …3 weitere); ob sie zu einer amtlichen Kurzbezeichn…
- … und 72 weitere Dokumente mit derselben Signatur

#### `undecidable-source-state-abbreviation:BayRKG` · 75 Dokumente

Stufe transform · Gewicht warning

- `BayARV`: 6 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayARV, BayRKG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformations…
- `BayAVFwG`: 20 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayFwG, BayRKG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformation…
- `BayAVKiBiG`: 46 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayKiBiG, BayEUG, BayRKG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Tran…
- `BayAnerkV`: 4 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayAnerkV, BayRKG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformati…
- `BayBhV`: 49 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayBhV, BayBG, BayBeamtVG, BayBesG, BayRKG); ob sie zu einer amtlichen Kurzbezeichnung gehören, en…
- … und 70 weitere Dokumente mit derselben Signatur

#### `undecidable-source-state-abbreviation:BayBO` · 71 Dokumente

Stufe transform · Gewicht warning

- `BAY_791_5_12_U`: 11 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayNatSchG, BayBO); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformat…
- `BAY_791_5_5_U`: 12 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayNatSchG, BayBO); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformat…
- `BayAbgrG`: 12 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayAbgrG, BayBO, BayNatSchG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der T…
- `BayBO`: 25 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayBO, BayVwVfG, BayESG, BayWG, BayBQFG, …1 weitere); ob sie zu einer amtlichen Kurzbezeichnung ge…
- `BayBStaettV`: 2 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayBO); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsbericht (…
- … und 66 weitere Dokumente mit derselben Signatur

#### `repealed-provision:Art. # ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten` · 69 Dokumente

Stufe parse · Gewicht info

- `ApothStV`: Art. 4 ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten
- `BayAGBGB`: Art. 1 ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten
- `BayAGGVG`: Art. 8 ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten
- `BayAGG_10`: Art. 4 ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten
- `BayAGIHKG`: Art. 2 ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten
- … und 64 weitere Dokumente mit derselben Signatur

#### `undecidable-source-state-abbreviation:BayNatSchG` · 68 Dokumente

Stufe transform · Gewicht warning

- `BAY_791_3_148_U`: 7 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayNatSchG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsberi…
- `BAY_791_3_150_U`: 6 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayNatSchG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsberi…
- `BAY_791_3_151_U`: 6 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayNatSchG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsberi…
- `BAY_791_3_153_U`: 6 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayNatSchG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsberi…
- `BAY_791_5_12_U`: 11 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayNatSchG, BayBO); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformat…
- … und 63 weitere Dokumente mit derselben Signatur

#### `organ-formula-conflict:Widersprüchliche Erlassformeln (…); kein Erlassorgan übernommen` · 63 Dokumente

Stufe transform · Gewicht warning

- `BayAVSG`: Widersprüchliche Erlassformeln (Bayerische Staatsregierung / Bayerisches Staatsministerium für Umwelt und Gesundheit und das Bayerische Staatsministerium für Arbeit und Sozialordnu…
- `BayBeurtRELF`: Widersprüchliche Erlassformeln (Bayerisches Staatsministerium für Ernährung, Landwirtschaft und Forsten / Bayerisches Staatsministerium für Ernährung, Landwirtschaft und Forsten fü…
- `BayVV_2004_F_988`: Widersprüchliche Erlassformeln (Bayerisches Staatsministerium der Finanzen, für Landesentwicklung und Heimat / Bayerisches Staatsministerium der Finanzen, für Landesentwicklung und…
- `BayVV_2013_3_A_036`: Widersprüchliche Erlassformeln (Bayerisches Staatsministerium für Arbeit und Sozialordnung, Familie und Frauen / Bayerisches Staatsministerium); kein Erlassorgan übernommen
- `BayVV_2032_3_K_772`: Widersprüchliche Erlassformeln (Bayerisches Staatsministerium für Wissenschaft, Forschung und Kunst / Bayerisches Staatsministerium); kein Erlassorgan übernommen
- … und 58 weitere Dokumente mit derselben Signatur

#### `annex-number-flag-missing:<annex ANL_#>: keine <annex.nummer> mit @int; ersatzweise gilt die erste Schreibweise „…“` · 61 Dokumente

Stufe parse · Gewicht warning

- `BayAGO`: <annex ANL_1>: keine <annex.nummer> mit @int; ersatzweise gilt die erste Schreibweise „Anlage 1“
- `BayAPOFspl`: <annex ANL_2>: keine <annex.nummer> mit @int; ersatzweise gilt die erste Schreibweise „Anlage 1a“
- `BayAVJG`: <annex ANL_1>: keine <annex.nummer> mit @int; ersatzweise gilt die erste Schreibweise „Anlage 1 (zu § 5 Abs. 1)“
- `BayAVOGFRG`: <annex ANL_3>: keine <annex.nummer> mit @int; ersatzweise gilt die erste Schreibweise „Anlage 3“
- `BayAVWolfV2024`: <annex ANL_1>: keine <annex.nummer> mit @int; ersatzweise gilt die erste Schreibweise „Anlage 1“
- … und 56 weitere Dokumente mit derselben Signatur

#### `repealed-provision:§ # ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten` · 60 Dokumente

Stufe parse · Gewicht info

- `BayAVFiG`: § 7 ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten
- `BayAVFwG`: § 8 ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten
- `BayAVOGFRG`: § 13 ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten
- `BayAVSG`: § 61 ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten
- `BayAVUeG`: § 2 ist als aufgehobene Vorschrift ein Platzhalter mit leerem Text und bleibt als Block erhalten
- … und 55 weitere Dokumente mit derselben Signatur

#### `package-media-type-mismatch:image/jpg→.gif` · 54 Dokumente

Stufe parse · Gewicht warning

- `BayAGO`: BayAGO: 1 Beilagen, deren deklarierte Medienart nicht zur Dateiendung passt – /img/BayAGO_BayAGO-A0001-N001.gif: Das Manifest deklariert image/jpg, die Dateiendung ist .gif; die de…
- `BayAPOLmCh`: BayAPOLmCh: 6 Beilagen, deren deklarierte Medienart nicht zur Dateiendung passt – /img/BayAPOLmCh_BayAPOLmCh-A5-N1.gif: Das Manifest deklariert image/jpg, die Dateiendung ist .gif;…
- `BayAVFwG`: BayAVFwG: 42 Beilagen, deren deklarierte Medienart nicht zur Dateiendung passt – /img/BayAVFwG_BayAVFwG-A2-N1-1985.gif: Das Manifest deklariert image/jpg, die Dateiendung ist .gif;…
- `BayAVJG`: BayAVJG: 11 Beilagen, deren deklarierte Medienart nicht zur Dateiendung passt – /img/BayAVJG_BayAVJG-A0002-N001.gif: Das Manifest deklariert image/jpg, die Dateiendung ist .gif; di…
- `BayAbfPV`: BayAbfPV: 3 Beilagen, deren deklarierte Medienart nicht zur Dateiendung passt – /img/BayAbfPV_BayAbfPV-Anh1-N1.gif: Das Manifest deklariert image/jpg, die Dateiendung ist .gif; die…
- … und 49 weitere Dokumente mit derselben Signatur

#### `undecidable-source-state-abbreviation:BayPVG` · 54 Dokumente

Stufe transform · Gewicht warning

- `BayGlG`: 5 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayGlG, BayPVG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformations…
- `BayPVG`: 10 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayPVG, BayBG, BayHIG, BayRiStAG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet …
- `BayRegisSTARDV`: 5 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayPVG, BayRiG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformations…
- `BayRiStAG`: 48 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayRiStAG, BayAbgG, BayBG, BayPVG, BayDG, …2 weitere); ob sie zu einer amtlichen Kurzbezeichnung g…
- `BayTKBek`: 6 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayDSG, BayPVG, BayKom, BayTKA, BayHO); ob sie zu einer amtlichen Kurzbezeichnung gehören, entschei…
- … und 49 weitere Dokumente mit derselben Signatur

#### `undecidable-source-state-abbreviation:BaySchO` · 54 Dokumente

Stufe transform · Gewicht warning

- `BayAPE`: 7 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayEUG, BayEbFöG, BaySchO); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Tran…
- `BayAgrSchO`: 30 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayAgrSchO, BayEUG, BaySchO, BayEuG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheid…
- `BayBFSO2023`: 26 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayEUG, BaySchO, BayVwVfG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Tra…
- `BayBFSOGesundheit`: 23 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayEUG, BaySchO, BayVwVfG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Tra…
- `BayBSO`: 13 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayEUG, BaySchO); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformatio…
- … und 49 weitere Dokumente mit derselben Signatur

#### `undecidable-source-state-abbreviation:BaySchFG` · 52 Dokumente

Stufe transform · Gewicht warning

- `BayAVSchFG`: 98 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BaySchFG, BayEUG, BayBesG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Tra…
- `BayDVFAG_SchKFrG`: 1 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BaySchFG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsberich…
- `BayDVSoSchG_2`: 7 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BaySchFG, BayEUG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformatio…
- `BayEUG`: 11 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayEUG, BaySchFG, BayPrG, BayBG, BayDSG, …1 weitere); ob sie zu einer amtlichen Kurzbezeichnung ge…
- `BayFAG`: 7 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayFAG, BaySchFG, BayVwVfG, BayStrWG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheid…
- … und 47 weitere Dokumente mit derselben Signatur

#### `figures-transferred` · 49 Dokumente

Stufe parse · Gewicht info

- `BayAGO`: 1 Abbildungen aus <graphic> als Bildblock mit Asset-Referenz übernommen (Bilddatei als eigenes, inhaltsadressiertes Asset, nicht im Norm-JSON)
- `BayAPOLmCh`: 5 Abbildungen aus <graphic> als Bildblock mit Asset-Referenz übernommen (Bilddatei als eigenes, inhaltsadressiertes Asset, nicht im Norm-JSON)
- `BayAVJG`: 1 Abbildungen aus <graphic> als Bildblock mit Asset-Referenz übernommen (Bilddatei als eigenes, inhaltsadressiertes Asset, nicht im Norm-JSON)
- `BayAbfPV`: 3 Abbildungen aus <graphic> als Bildblock mit Asset-Referenz übernommen (Bilddatei als eigenes, inhaltsadressiertes Asset, nicht im Norm-JSON)
- `BayBauPAV`: 1 Abbildungen aus <graphic> als Bildblock mit Asset-Referenz übernommen (Bilddatei als eigenes, inhaltsadressiertes Asset, nicht im Norm-JSON)
- … und 44 weitere Dokumente mit derselben Signatur

#### `organ-formula-conflict:Widersprüchliche Erlassformeln (Bayerisches Staatsministerium für Unterricht und Kultus / Bayerisches Staatsministerium)…` · 49 Dokumente

Stufe transform · Gewicht warning

- `BayVV_2030_7_2_UK_091`: Widersprüchliche Erlassformeln (Bayerisches Staatsministerium für Unterricht und Kultus / Bayerisches Staatsministerium); kein Erlassorgan übernommen
- `BayVV_2032_4_UK_217`: Widersprüchliche Erlassformeln (Bayerisches Staatsministerium für Unterricht und Kultus / Bayerisches Staatsministerium); kein Erlassorgan übernommen
- `BayVV_2032_4_UK_220`: Widersprüchliche Erlassformeln (Bayerisches Staatsministerium für Unterricht und Kultus / Bayerisches Staatsministerium); kein Erlassorgan übernommen
- `BayVV_2032_5_UK_085`: Widersprüchliche Erlassformeln (Bayerisches Staatsministerium für Unterricht und Kultus / Bayerisches Staatsministerium); kein Erlassorgan übernommen
- `BayVV_2033_UK_114`: Widersprüchliche Erlassformeln (Bayerisches Staatsministerium für Unterricht und Kultus / Bayerisches Staatsministerium); kein Erlassorgan übernommen
- … und 44 weitere Dokumente mit derselben Signatur

#### `norm-type-assumed:@doktyp="vertrag"` · 38 Dokumente

Stufe parse · Gewicht info

- `ARDStV`: ARDStV: @doktyp="vertrag" umfasst Verträge und sonstige Rechtsquellen; der Titel „ARD-Staatsvertrag“ nennt keine Vertragsart – geführt als „staatsvertrag“
- `AkadGrAuslHsStV`: AkadGrAuslHsStV: @doktyp="vertrag" umfasst Verträge und sonstige Rechtsquellen; der Titel „Abkommen zwischen den Ländern in der Bundesrepublik Deutschland über die Genehmigung zur …
- `BAY_110_1990_478`: BAY_110_1990_478: @doktyp="vertrag" umfasst Verträge und sonstige Rechtsquellen; der Titel „Vertrag zwischen der Bundesrepublik Deutschland und der Europäischen Wirtschaftsgemeinsc…
- `BayELKV`: BayELKV: @doktyp="vertrag" umfasst Verträge und sonstige Rechtsquellen; der Titel „Vertrag zwischen dem Bayerischen Staate und der Evangelisch-Lutherischen Kirche in Bayern rechts …
- `BayIsraelKultVertrag`: BayIsraelKultVertrag: @doktyp="vertrag" umfasst Verträge und sonstige Rechtsquellen; der Titel „Vertrag zwischen dem Freistaat Bayern und dem Landesverband der Israelitischen Kultu…
- … und 33 weitere Dokumente mit derselben Signatur

#### `undecidable-source-state-abbreviation:BayWG` · 37 Dokumente

Stufe transform · Gewicht warning

- `BayBO`: 25 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayBO, BayVwVfG, BayESG, BayWG, BayBQFG, …1 weitere); ob sie zu einer amtlichen Kurzbezeichnung ge…
- `BayBadeGewV`: 4 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayBadeGewV, BayWG, BayUIG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Tra…
- `BayEUeV`: 7 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayWG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsbericht (…
- `BayFischG`: 6 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayFiG, BayWG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsb…
- `BayGrKrV`: 3 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayWG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsbericht (…
- … und 32 weitere Dokumente mit derselben Signatur

#### `undecidable-source-state-abbreviation:BayDSG` · 35 Dokumente

Stufe transform · Gewicht warning

- `BayDSG`: 2 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayDSG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsbericht …
- `BayEUG`: 11 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayEUG, BaySchFG, BayPrG, BayBG, BayDSG, …1 weitere); ob sie zu einer amtlichen Kurzbezeichnung ge…
- `BayILSG`: 5 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayRDG, BayDSG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformations…
- `BayLTGO`: 23 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayLTGeschO, BayAbgG, BayDSG, BayHO, BayPetG); ob sie zu einer amtlichen Kurzbezeichnung gehören, …
- `BayMRVG`: 21 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayMRVG, BayStVollzG, BaySvVollzG, BayDSG); ob sie zu einer amtlichen Kurzbezeichnung gehören, ent…
- … und 30 weitere Dokumente mit derselben Signatur

#### `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <einzelnorm P_#> → <absatz.text> ; ersatzweise als „…“ geführt` · 34 Dokumente

Stufe parse · Gewicht warning

- `BayAGFlurbG` (Zeile 182): <satz.nr id="xx">1</satz.nr>Das Amt für Ländliche Entwicklung bestimmt die Zahl der von der Teilnehmerversammlung zu wählenden Vorstandsmitglieder; es kann auch Bestimmungen über e…
- `BayAGGlueStV` (Zeile 124): <satz.nr id="xx">1</satz.nr>Der Freistaat Bayern veranstaltet durch die Staatliche Lotterie- und Spielbankverwaltung (<verweis.norm>Art. <v.norm ersatz="BayAGGlueStV">5</v.norm></v…
- `BayAbgG` (Zeile 1874): <p>Dieses Gesetz tritt mit Ausnahme der <verweis.norm>Art. <v.norm ersatz="BayAbgG">2</v.norm>, <v.norm ersatz="BayAbgG">3</v.norm>, <v.norm ersatz="BayAbgG">28</v.norm> und <v.nor…
- `BayAbmG` (Zeile 615): <satz.nr id="xx">1</satz.nr>Über den Entschädigungsanspruch nach Art. <verweis.norm><v.norm ersatz="BayAbmG">10</v.norm> Abs. 4 Satz 1</verweis.norm> sowie über den Erstattungsansp…
- `BayAufbauG` (Zeile 398): <satz.nr id="xx">1</satz.nr>Das Gesetz ist dringlich. <satz.nr id="xx">2</satz.nr>Es tritt am 20. November 1950 in Kraft<fn.call><fn.text /><fn.def><p>Diese Vorschrift betrifft das…
- … und 29 weitere Dokumente mit derselben Signatur

#### `undecidable-source-state-abbreviation:BayWaldG` · 34 Dokumente

Stufe transform · Gewicht warning

- `BayKWaldV`: 8 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayWaldG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsberich…
- `BayLplG`: 5 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayLplG, BayVwVfG, BayWaldG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Tr…
- `BayNatWaldV`: 11 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayWaldNatPV, BayNatSchG, BayWaldG, BayJG); ob sie zu einer amtlichen Kurzbezeichnung gehören, ent…
- `BayPuKWFV`: 2 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayAgrarWiG, BayWaldG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transfor…
- `BayStFoG`: 7 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayWaldG, BayBS, BayJG, BayBG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der …
- … und 29 weitere Dokumente mit derselben Signatur

#### `footnote-marker-missing:Fußnote ohne Aufrufzeichen (<fn.text/>) in <p typ=-> ; ersatzweise als „…“ geführt` · 33 Dokumente

Stufe parse · Gewicht warning

- `BayVV_2012_4_5_I_081` (Zeile 172): <p>Der Teil E ergänzt die gültige Technische Richtlinie Relaisfunkstellengeräte – Stand: März 1992.<fn.call><fn.text /><fn.def><p>Eingeführt mit Bekanntmachung des Bayerischen Staa…
- `BayVV_2032_3_K_772` (Zeile 47): <fn.call>
- `BayVV_2032_4_A_135` (Zeile 40): <fn.call>
- `BayVV_2033_1_K_749` (Zeile 38): <fn.call>
- `BayVV_2033_6_F_138` (Zeile 44): <fn.call>
- … und 28 weitere Dokumente mit derselben Signatur

#### `undecidable-source-state-abbreviation:BayStrWG` · 33 Dokumente

Stufe transform · Gewicht warning

- `BayBGG`: 3 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayBGG, BayStrWG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformatio…
- `BayFAG`: 7 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayFAG, BaySchFG, BayVwVfG, BayStrWG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheid…
- `BayFAGDV02`: 57 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayFAG, BayAVGFRG, BayStrWG, BayHO); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheide…
- `BayGBGA`: 1 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayStrWG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsberich…
- `BayGebOVerm`: 3 Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters (BayFiG, BayStrWG); ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformatio…
- … und 28 weitere Dokumente mit derselben Signatur

