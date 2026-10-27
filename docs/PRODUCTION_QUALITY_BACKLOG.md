# Fachlicher Arbeitsvorrat zur Betriebsfreigabe

Bewertung vom 27.10.2026 auf `1df581af95e6fc523f6b1aaf962583cf51535eab` mit den Änderungen aus Lauf 1.
Ausgangsrechtsstand 01.12.2023, redaktioneller Stichtag 28.09.2026 unverändert.
Dies ist eine priorisierte Auswahl aus bestehenden Prüfungen, keine zweite Review-Queue. Entscheidungen werden
weiterhin in den ursprünglichen Review-, Rezept- und Quellenakten erfasst. „Nicht konsolidiert“ bedeutet nicht
„unwirksam“. Ein bloßer Verzeichniseintrag belegt weder Wortlaut noch Verkündung.

## Entscheidung West-Verfassungen (P0)

| Merkmal | Übernommene Verfassung | Sim-Verfassung |
| --- | --- | --- |
| Identität | `west:verfassung-fuer-das-land-westdeutschland` | `west:verfassung-fuer-das-land-westdeutschland-2024-west` |
| Metadaten | Titel „Verfassung für das Land Westdeutschland“, Typ `gesetz`, Status `in-force` | identischer Titel, Typ `verfassung`, Status `in-force` |
| Quelle | NRW-Verfassung vom 28.06.1950, RECHT.NRW `term:26486`, gespeicherte Fassungsseite | GV. West 2024 Nr. 1 **vom 01.10.2024**, S. 6–41, SHA-256 `c92907298bab62de7e1821b7d4cba7929e840ad9979f1ee81424dca91520bc35` |
| Quellintervall | 14.07.2020–15.01.2026; reine Provenienz | Sim-Verkündung, kein reales Quellintervall |
| Portalintervalle | ab 01.12.2023, kein Ende | 02.10.2024–18.12.2025; 19.12.2025–17.05.2026; ab 18.05.2026 ohne Ende |
| Sim-Ereignisse | keine materialisierte Aufhebung | Erstfassung; Änderungen 18.12.2025 / wirksam 19.12.; 17.05.2026 / wirksam 18.05. |

Belege: `content/norms/west/<slug>/{meta,history}.json`, zugehörige `versions/`,
`data/simulation/west/acts/verfassung-fuer-das-land-westdeutschland-2024-west.json`,
`data/simulation/west/ledger.json` und `completeness.json`. Die reale Geltung bis 2026 darf die
Simulationsgeltung der Ausgangsfassung nicht beenden.

Davon getrennt: GV. West 2024 Nr. 1 **vom 23.02.2024**, S. 2 (SHA-256
`02136c0428cb021fbb97c72e80430922da66b352df6d5ea08c4588d1f534078f`), enthält eine „Verfassung für
Westdeutschland“. Ereignis `west-2024-02-23-enact-verfw-2024`: `review`, `promulgation-unclear`, kein
Wirkdatum. Ausfertigungsformel/Unterschrift und Ergebnis der als Inkrafttretensbedingung genannten
Volksabstimmung fehlen. Nicht mit der Oktoberausgabe desselben Jahrgangs und derselben Nummer verwechseln.

Die Oktoberfassung verlangt in Artikel 119 die Zustimmung von zwei Dritteln der Landtagsmitglieder,
Ausfertigung durch den Landtagspräsidenten und Verkündung durch den Ministerpräsidenten; Absatz 3 bestimmt
den Folgetag. Die überlieferte Schlussformel datiert 01.10.2024 und nennt Regierungsunterschriften;
das Metadatum `documentDate` lautet 30.09.2024. Beschlussprotokoll und Ausfertigungszuständigkeit sind zu
prüfen. Eine Volksabstimmungsbedingung der Februarvorlage darf nicht auf die Oktoberfassung übertragen werden.
Artikel 116 lässt kompatibles Landesrecht fortgelten; Artikel 118 behandelt die Übernahme beziehungsweise
Aufhebung von Gesetzblättern. Beide liefern keinen ausdrücklichen Aufhebungsbefehl für die Ausgangsverfassung.

**Vorschlag zur menschlichen Entscheidung:** Redaktion und Sim-Verfassungszuständige sollen entscheiden,
ob die Oktoberverfassung die Ausgangsverfassung ab 02.10.2024 vollständig ersetzt. Das ist nach Identität,
Regelungsumfang und späteren Verfassungsänderungen die sachlich naheliegende Arbeitshypothese, aber keine
bereits belegte Rechtsfolge. Vor Freigabe sind Beschluss, Ausfertigung und Ablösungswirkung zu bestätigen.
Bis dahin keine automatische Aufhebung, Depublikation, Zusammenlegung oder Wortlautkorrektur; der
unaufgelöste Identitäts- und Geltungskonflikt verhindert eine vorbehaltlose fachliche Betriebsfreigabe.

| Entscheidung | Folgen und Umsetzung nach ausdrücklicher Freigabe |
| --- | --- |
| Vollständige Ablösung zum 02.10.2024 bestätigen (empfohlen zur Entscheidung) | Alte Identität und Ausgangsdatei erhalten; Ereignis und Sim-Rezept dokumentieren; Ende der bisherigen Geltung zum 01.10.2024 ableiten, nicht in alte Fassungen schreiben; additive Beziehungen/Historie; historische Links bleiben; Projektion, Suche und Verfassungsnavigation neu prüfen. Kein neuer Baseline-Seed. |
| Nur teilweise Verdrängung bestätigen | Betroffene Vorschriften einzeln mit Beleg bestimmen; pauschale Kennzeichnung beider Texte als vollständig geltend reicht nicht. Konsolidierung erst mit eindeutigen Befehlen/Rezepten; erheblicher redaktioneller Aufwand und zusätzliche Teilgeltungsdarstellung. |
| Oktoberinkrafttreten verneinen oder offenlassen | Folgen für die als wirksam konsolidierten Verfassungsänderungen 2025/2026 prüfen. Keine automatische Rücknahme. Berichtigungs-/Statusverfahren und fachliche Freigabe erforderlich; beide Ausgangsdokumente archiviert erhalten. |
| Februarverfassung als zwischenzeitlich wirksam bestätigen | Abstimmungsergebnis, Bekanntmachung und Wirkdatum beschaffen; zusätzlich Ablösung durch Oktoberfassung klären. Eigene Identität/Intervalle und abhängige Akte prüfen; keine Datierung aus Dateinamen. |

Die falsche Typgleichsetzung (Ausgangsverfassung als `gesetz`) erklärt, weshalb der Homepage-Schnellzugriff
nur die Sim-Verfassung zeigt, während die Suche zwei gleiche Titel liefert. Eine Typ-/Beziehungsberichtigung
ist ebenfalls eine ausdrücklich zu prüfende redaktionelle Änderung, keine Lösung des Geltungskonflikts.

## 28 priorisierte Fälle

Belegkürzel: **W** `data/simulation/west/ledger.json`; **N** `data/simulation/nsh/ledger.json`;
**B** `data/simulation/baywue/ledger.json`; **Q** `data/simulation/source-acquisition-queue.json`;
**NR** `data/audits/juris-sh/RECONSTRUCTION_QUEUE.md`; **BR** `data/audits/bayernrecht/RECONSTRUCTION.md`;
**WV** `data/audits/recht-nrw/quality/consent-laws.md` und `treaty-evidence.md`.
Die IDs/Normkennungen in der Tabelle ermöglichen den Rückweg in die vorhandenen Akten.
Priorität hier nach fachlichem Risiko; frühere Akquiseprioritäten werden dadurch nicht automatisch geändert.

| Nr./Priorität | Land / Norm oder Quelle | Problem und Beleglage | Mögliche Rechtswirkung | Nächste Handlung | Menschliche Entscheidung | Technische Umsetzung |
| --- | --- | --- | --- | --- | --- | --- |
| 01 P0 | West: beide Verfassungsidentitäten | Gleichnamig gleichzeitig geltend; oben vollständig belegt | Verwechslung der Verfassungsgrundlage | Oktoberbeschluss/Ablösung klären | Ablösung, Teilgeltung oder ungeklärtes Inkrafttreten | Nur freigegebenes Ereignis/Rezept; keine Bestandsänderung in diesem Lauf |
| 02 P1 | West: Februarverfassung 23.02.2024 | W `west-2024-02-23-enact-verfw-2024`, Q `west-verfassung-2024`: Abstimmung/Ausfertigung fehlen | Mögliche Zwischenverfassung und abhängige Akte | Amtliche Ausfertigung und Abstimmungsergebnis anfordern | Ob und wann wirksam; nicht Oktober gleichsetzen | Quellen-Inbox, Ledgerentscheidung, ggf. eigener Sim-Akt |
| 03 P1 | West: Haushaltsgesetz 2025 und Änderung 18.12.2025 | W `west-2025-03-11-enact-hg-2025`, `west-2025-12-19-amend-gesetz-zur-aenderung-des-haushaltsgesetzes-2025-west`: „Entwurf“ vs. spätere Behandlung als Gesetz | Haushaltsgrundlage und Änderungsziel ungesichert | Ausfertigung/Verkündung und Anlagen gemeinsam prüfen | Geltendes Gesetz oder Entwurf | Erst danach Ziel materialisieren und Änderung konsolidieren |
| 04 P1 | West: Haushaltsgesetz 2026 / Gesamtplan | W `west-2026-05-18-enact-hg-2026`: Entwurfsüberschrift, leere Anlage 1, spätere Zitierung | Unvollständige Haushaltsgrundlage | Verkündete vollständige Fassung/Plan beschaffen | Status und Vollständigkeit | Kein leerer Plan als Normtext; Inventar/Review ergänzen |
| 05 P1 | West: Landesbaurechtsnovelle 17.05.2026 | W `west-2026-05-17-replace-novellierung-landesbaurecht-2026`: widersprüchliche Überschrift; §§ 1–98 | Möglicherweise neue Bauordnung und Verdrängung der alten | Primärblatt und ggf. Berichtigung prüfen | Normidentität, Verkündung, Ablösungsumfang | Eigener Akt und explizite Zielentscheidungen; keine pauschale Aufhebung |
| 06 P1 | West: Pflege- und Familienzeit 2026 | W `west-2026-07-31-amend-pflege-familienzeit-2026`: Umnummerierung kollidiert mit §§ 15a/19a | Rechte im Landesdienst nicht sicher konsolidierbar | Befehl am Ausgangstext manuell durchspielen | Behandlung eingeschobener Paragraphen | Eindeutiges geprüftes Sim-Rezept; Altdateien erhalten |
| 07 P1 | West: Opferschutzstiftung | W `west-2026-05-18-amend-aendg-opferschutzstiftung-2026`: Alttext „NRW“ fehlt im transformierten Bestand | Verkündete Änderung blockiert | Wortlaut und Transformationsbezug prüfen | Gleichwertigkeit des Zieltexts bestätigen oder ablehnen | Dokumentierter Zielanker im Rezept, kein globaler Textersatz |
| 08 P1 | West: MBl. WD 2026 Nr. 2 / Kühlräume | Q `west-mbl-2026-2`, Nummernlücke und Einzelrunderlass | Aktuelle Verwaltungsvorschrift, Verkündungsbeleg fehlt | Vollständige Ausgabe anfordern | Normativität, Verkündung, Wirkdatum | Intake, Abgleich Inventar, ggf. Ledger/Rezept |
| 09 P1 | West: Staatsverträge Ratifizierung „Vergabe von …“ und fünfter Rundfunkänderungsstaatsvertrag | WV: Vertragstext `unknown`, keine Anlage im HTML; genaue Slugs im Bericht | Normativer Vertragsinhalt möglicherweise öffentlich unzugänglich | Quellverweise und Archiv zuerst kontrollieren; vollständige Anlage suchen | Ob ein gravierender Bestandteil tatsächlich fehlt (dann P0) | Anlagenbeleg und Anzeige prüfen; Baselineänderung nur mit Ausnahme |
| 10 P2 | West: Haushaltsplan Q1/2024 und Grenzkontrollen | W `west-2024-04-22-enact-hg-2024-q1`; Q `west-haushalt-2024-anlage`, `west-grenzkontrollen-2024` | Historische Intervalle/Anlagen ungeklärt | Fehlenden Plan und Einzelverkündungsdaten beschaffen | Tageswirkung und widersprüchliche Aufhebungsdaten | Historische Sim-Rezepte erst nach Entscheidung |
| 11 P1 | NSH: Landesverfassung 2024 | N `nsh-2024-02-10-review-landesverfassung-fuer-das-land-niedersachsen-holstein-landesverfassung`, Q `nsh-landesverfassung-2024`: Art. 76 ohne Tageszahl, falsche Überschrift/Datierung | Zentrale Verfassungsgrundlage unklar | Amtliche Berichtigung und Ausfertigung anfordern | Wirkdatum; keine Ergänzung der fehlenden Zahl | Review erhalten; keine erratene Fassung |
| 12 P1 | NSH: MAL-I Teil 1/2024, nur im Inhaltsverzeichnis genannte Gesetze | Q `nsh-mal-i-2024-sieben-gesetze`; N `nsh-2024-02-12-unknown-mal1-inhaltsverzeichnis` | Verfassungsschutz, Schulrecht, Verfassungsänderungen ohne Wortlaut | Vollständige amtliche Ausgabe beschaffen | Identität/Verkündung jedes einzelnen Akts | Einzeln inventarisieren, keine Erzeugung aus Titeln |
| 13 P1 | NSH: NDR/OFF-Staatsvertrag | N `nsh-2025-12-09-review-gesetz-zu-dem-staatsvertrag-zur-aenderung-des`, Q `nsh-staatsvertrag-2025-12-09` | Vertragsgesetz ohne Vertrag; Datum 2025/2026 widersprüchlich | Anlage und Ausfertigungsnachweis beschaffen | Vertragsidentität und zeitliche Wirkung | Vertragsanlage, Ledgerentscheidung; erst dann Materialisierung |
| 14 P1 | NSH: Schülerticketgesetz, Artikel 1 und 3 | N `nsh-2026-08-01-amend-schuelerticketg-nsh-nschg` / `…-nnvg`: fehlende Baselineziele; Art. 2 separat übernommen | Teil des verkündeten Regelungsprogramms nicht konsolidiert | Zielidentitäten und vorhandene historische Quellen prüfen | Freigabe ggf. neuer Baseline-Seeds/Freeze-Ausnahme | Keine Erweiterung der bereits geltenden Einzelregel per Heuristik |
| 15 P1 | NSH: Besoldungsgesetz, § 45a | NR `jlr-NNLSH00002A85`: Fassung vom 19.07.2024 rückwirkend ab 01.01.2023 | Zentrale historisch fehlende Besoldungsnorm | Tatsächlich vor 01.12.2023 ausgefertigten Text aus Historie prüfen | Zulässige Ausgangsfassung und Freeze-Ausnahme | Keine spätere rückwirkende Norm in Baseline; geprüftes Rezept |
| 16 P1 | NSH: Landesplanungsgesetz § 5a | NR `jlr-NNLSH00002B50`: Fassung vom 24.05.2024 rückwirkend ab 04.09.2020 | Zentrale Planungsgrundlage fehlt historisch | Vorstichtagsfassung und Verkündung bestimmen | Historische Abgrenzung/Freeze-Ausnahme | Bestehende Einzelfassungsprüfung verwenden |
| 17 P2 | NSH: Schulgesetz 2026 / sieben Folgedokumente | Q `nsh-schulgesetz-2026`; N Schulverordnungen: keine Verkündung, Ermächtigung nur Entwurf | Keine sichere Grundlage für Schulverordnungen | Primärverkündungen zuerst suchen/anfordern | Wirksamkeit jedes Akts, Ermächtigung und Fortgeltung | Keine automatische Aufnahme von DOCX/Entwürfen |
| 18 P2 | NSH: Erste Heilpraktiker-DVO § 10 / kommunale Kassenführung | NR `jlr-NNLSH00002CBA` doppelte Fassungen; historische Gl.Nr. `2020-3-37` ohne juris-Ziel | Historische Lücken, Identität/Intervall offen | Fassungen bzw. amtliche Ausgangsverkündung prüfen | Auswahl und Normativität/Freeze-Ausnahme | Review nicht löschen; geprüfte Einzelübernahme erst nach Freigabe |
| 19 P1 | BayWü: Erdbebenhilfegesetz 14.05.2026 | B `baywue-2026-05-14-repeal-erdbebenhilfeg-aufhebungsg-baywue`; Q `baywue-erdbebenhilfeg-2026`: nur Entwurf, Aufhebung belegt | Entstehung und Ende eines aktuellen Hilfsgesetzes fehlen | Verkündeten Ausgangsakt beschaffen | Identität und Wirkung der Aufhebung | Ziel nicht aus Entwurf erzeugen; dann Sim-Akt/Rezept |
| 20 P1 | BayWü: Stiftung politische Bildung, Artikel 10 | B `baywue-2025-03-13-enact-szfdpbbjg-baywue`, Q `baywue-gvbl-2025-2-seite-11`: Seite 11 durch Seite 10 ersetzt | Vollständigkeit des verkündeten Akts unprüfbar; bislang nicht materialisiert | Korrekte vollständige Ausgabe anfordern | Entwurfsüberschrift und Artikelvollständigkeit | Neue Quelle archivieren; keine Rekonstruktion aus Duplikat |
| 21 P0 | BayWü: Haushaltsplan 2026 | Q `baywue-haushalt-2026-anlage`; gespeicherte Fassung/Metadaten bestätigen fehlenden Haushaltsplan und Finanzierungsübersicht | Art. 1 stellt den fehlenden Plan fest; Art. 4 und 5 knüpfen Rechtsfolgen daran. Gravierender normativer Bestandteil der als geltend veröffentlichten Norm fehlt | Vollständige verkündete Anlage beschaffen; bis dahin fachliche Vollständigkeit nicht freigeben | Herkunft/Authentizität und vollständigen Regelungsumfang bestätigen; keine bloße P3-Provenienzlücke | Gesonderte Anlagenintegration mit Quellenprüfung; keine Zahlen erfinden |
| 22 P1 | BayWü: BaySchFG und BayEUG / Trinkwasserspender | BR `BaySchFG` (GVBl. 2023 S. 495 § 5 unlesbar), `BayEUG` (Wirkreihenfolge); B `baywue-2026-08-31-amend-trinkwasserspender-schulen-g-baywue` und `…-2` | Verkündete Schulfinanzierungsänderungen blockiert | Historische Zieltexte und verfügbare Änderungsbelege prüfen | Historische Seed-/Freeze-Ausnahme, keine Freigabe in Lauf 1 | Bestehende Rezepte/Kettenprüfung erweitern, getrennt von Sim-Akten |
| 23 P1 | BayWü: Grundschulordnung / Grundschülerentlastung | B `baywue-2026-08-01-amend-grundschuelerentlastungsv-baywue`, fehlendes Baselineziel | Verkündete schulische Leistungsregeln nicht konsolidiert | Historische GrSO und komplette Änderungskette beschaffen/prüfen | Baselinefreigabe und Zielidentität | Danach Konsolidierung aus bestehendem Sim-Akt |
| 24 P1 | BayWü: FachV-Pol/VS 2026 | B `baywue-2026-09-01-amend-fachv-pol-vs-aenderungsv-2026-baywue`: §§ 23/44 ohne erwartete Absätze | Beamtenrechtliche Befehle passen offenbar auf spätere reale Fassung | Alle vier Befehle gegen Baseline abgleichen | Teilanwendung oder unteilbarer fehlerhafter Akt | Keine spätere reale Fassung als Ersatz; explizites Rezept/Review |
| 25 P2 | BayWü: AGO, Änderung/Abschaffung 2026 | BR `BayAGO`, B `baywue-2026-06-27-amend-ago-aenderungsv-2026-baywue`, `baywue-2026-06-03-repeal-ago-aenderungsv-abschaffungsv-baywue`; Q Bekanntmachung 31.05. | Ziel ausgeschlossen; Aufhebung des Änderungsakts revidiert Stammtext nicht automatisch | Bekanntmachung und historische AGO prüfen | Normativität, Wirkfolge, Freeze-Ausnahme | Getrennte Ereignisse; keine automatische Rückabwicklung |
| 26 P2 | BayWü: Meisterpflicht/Familiengesundheit und SchuSprG | Q `baywue-wirkdaten` / `baywue-druckmaengel`; B jeweilige Akte: Datum fehlt, Druckgliederung defekt | Wortlaut/Wirkdatum nicht sicher konsolidierbar | Beschlussprotokoll bzw. amtliche Berichtigung anfordern; vorhandenes PDF sichten | Auslegung von Wirkung/Gliederung; keine stillen Korrekturen | G11 und Textcheck beibehalten, kein ungeprüftes OCR |
| 27 P1 | Ost: drei geltende Fassungen ohne Sucheinheiten | Produktions-Health 27.10.2026: `partial`, `staleNormCount: 3`; konkrete Normen im aktuellen Drift-Audit | Volltextsuche übersieht geltendes Recht | OstRecht-Verantwortlichen Befund zur Bearbeitung vorlegen | Upstream-Sync/Indexierung; bis dahin Teilabdeckung ausdrücklich akzeptieren oder Freigabe zurückstellen | Ausschließlich OstRecht bearbeitet Daten; Landesrecht danach Drift/Freshness neu lesen |
| 28 P2 | Ost: historische Suche und Sachgebietsabdeckung aller Länder | Ost `current-version-only`; bestehende Sachgebiets-Crosswalks und Ausschlussberichte | Historische Volltextabdeckung fehlt; Sachgebiete sind Orientierung | Suchhinweis erhalten, Crosswalk-Lücken gezielt sichten | Umfang möglicher Upstream-Erweiterung/Redaktionszuordnung | Keine Ost-Kopie; nur geprüfte Crosswalks, keine Behauptung vollständiger Suche |

## Was ohne neue Quellen möglich ist

Fälle 01, 06, 07, 14–16, 22, 24–25 lassen sich anhand vorhandener Texte/Rezepte weiter analysieren;
die notwendige fachliche oder Freeze-Freigabe wird dadurch nicht ersetzt. Fall 09 zuerst anhand des Archivs
abgleichen. Bei Fall 26 ist eine Sichtprüfung vorhandener PDFs möglich, eine fehlende Inkrafttretensregel oder
amtliche Berichtigung entsteht dadurch nicht. Technisch ohne neue Rechtsquellen möglich: Formularbau,
Header-/Fehlerabsicherung, Monitoring-Anbindung, lokale Restoreproben und reproduzierbare CI-Erprobung.

Menschen müssen insbesondere vollständige/berichtigte Gesetzblätter, normative Anlagen,
Volksabstimmungsergebnis, Landtagsbeschlüsse und Ausfertigungsnachweise beschaffen (Fälle 02–05, 08,
10–13, 17–21, 23, 26). Historische reale Quellen für 15/16/22/23/25 nur ergänzen, soweit die vorhandenen
Caches nicht genügen. Neue Sim-Quellen ausschließlich `imports/` → `sources:intake`, nicht direkt `content/`.

## Einordnung der großen Restlisten

West: Anlagenmusterbericht nennt 37 ausgeschlossene Fälle mit wesentlichem PDF-Regelungsgehalt und 23 mit
fehlenden wesentlichen Anlagen. Das belegt zunächst korrekt gesperrte Importe, nicht 60 fehlerhaft
veröffentlichte Normen. Archivierte, auf Quellenseiten verlinkte PDF-Anlagen sind von wirklich fehlenden
Anlagen zu unterscheiden. 390 Tabellen ohne sichere Kopfzeile / 150 Normen mit eingebetteten Fußnoten
sind strukturelle Risiken; konkrete Wortlautverluste haben Vorrang vor kosmetischer Tabellenpflege.

NSH: Rekonstruktionsqueue enthält 373 Fälle, davon viele nur im Register; ein Registertreffer allein
rechtfertigt keine Aufnahme. Später ausgefertigte rückwirkende reale Normen bleiben ausgeschlossen.
BayWü: Bericht vom 18.09.2026 nennt 526 offene Rückrechnungen, darunter 81 Anlagen- und 14 Tabellenersetzungen.
Die Größen dieser Gruppen bestimmen nicht die Priorität. Der Textintegritätsbericht (2.342 geprüfte
Dokumente, keine `review`/`mismatch`, 796 erklärte Unterschiede) ist eine damalige Importprüfung, kein
aktueller Vollständigkeitsbeweis aller heutigen Normen. Freeze-Ausnahmen, Tabellenfreigaben und geprüfte
Rezepte bleiben für jede tatsächlich notwendige Änderung verbindlich.
