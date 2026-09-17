# Review-Zusammenfassung RECHT.NRW

Stand: 2026-09-16T23:20:16.381Z · Stichtag 2023-12-01 · Erzeugt mit `npm run import:recht-nrw:review-report -- --write`.

Grundsatz: keine Massenentscheidung, keine Absenkung von Belegstandards. Reviewzahlen sinken nur durch behobene Parserfehler, bessere amtliche Evidenz oder echte Deduplizierung. Der Score ist eine Arbeitspriorität, kein Rechtsstatus.

## Kennzahlen

- Review-Fälle gesamt: 12131 (offen 11670, blockierend 6034, nicht blockierend 5636, abgelöst 461, entschieden 0)
- Betroffene Stammnormen mit offenen Befunden: 6879 – davon mit Blocker (nicht übernommen) 5425, nur nichtblockierend (übernommen, Entscheidung offen) 1454, ohne Manifesteintrag 20
- LRGV: 3457 offene Befunde (164 blockierend) bei 1292 Stammnormen (136 mit Blocker)
- LRMB: 8213 offene Befunde (5870 blockierend) bei 5587 Stammnormen (5289 mit Blocker)
- Befunde je Stammnorm: 1: 4328, 2: 1542, 3: 553, 4: 218, 5: 95, 6: 65, …

## Kategorien

| Bereich | Kategorie | offen | blockierend | Stammnormen | alleiniger Blocker bei | häufigster Schlüssel |
| --- | --- | --- | --- | --- | --- | --- |
| lrgv | institution-mapping | 2452 | 0 | 1148 | 0 | detections:ministry (1032) |
| lrmb | historical-gap | 2396 | 2396 | 2396 | 2117 | validity-undetermined (2396) |
| lrmb | normativity | 2364 | 2364 | 2364 | 2196 | normativity-review (2364) |
| lrmb | unknown-structure | 1519 | 610 | 1146 | 69 | unknown-inline-element:Unbekanntes Inline-Element <p> im LRMB-Text (287) |
| lrgv | attachment | 725 | 0 | 221 | 0 | annex-pdf-only:Anlage „…“ liegt nur als PDF vor (Textlayer vorhanden, strukturierte Extrak (683) |
| lrmb | institution-mapping | 646 | 0 | 243 | 0 | enacting-body (222) |
| lrmb | document-identity | 459 | 20 | 459 | 16 | document-identity-review (439) |
| lrmb | metadata-conflict | 363 | 308 | 363 | 278 | validity-expired-before-baseline (307) |
| lrmb | attachment | 310 | 58 | 155 | 31 | annex-pdf-only:Anlage „…“ liegt nur als PDF vor (Textlayer vorhanden, strukturierte Extrak (250) |
| lrgv | metadata-conflict | 116 | 116 | 116 | 114 | selection-not-confirmed (110) |
| lrgv | slug-collision | 102 | 0 | 102 | 0 | slug-collision (102) |
| lrmb | reconstruction-uncertain | 48 | 48 | 48 | 43 | reconstruction-uncertain-in-force (25) |
| lrmb | slug-collision | 37 | 0 | 37 | 0 | slug-collision (37) |
| lrmb | text-integrity | 33 | 28 | 29 | 1 | integrity-parse-textLength (8) |
| lrgv | unknown-structure | 27 | 27 | 8 | 2 | structure-unnumbered-section:Sektion # ohne Nummernfeld enthält Normtext (Quelle ohne §-/A (11) |
| lrmb | other | 23 | 23 | 23 | 20 | missing-stem-id (20) |
| lrgv | document-identity | 13 | 1 | 13 | 1 | document-identity-review (12) |
| lrmb | reconstruction-required | 13 | 13 | 13 | 13 | reconstruction-required (13) |
| lrgv | other | 9 | 9 | 9 | 1 | import-regression (8) |
| lrgv | version-selection | 9 | 9 | 9 | 9 | selection-inconsistent-interval (7) |
| lrgv | historical-gap | 2 | 0 | 2 | 0 | version-history-gap:Lücke zwischen Fassung bis <datum> und Fassung ab <datum> (2) |
| lrgv | text-integrity | 2 | 2 | 1 | 1 | integrity-parse-duplicateUnits (1) |
| lrmb | version-selection | 2 | 2 | 2 | 0 | selection-inconsistent-interval (2) |

## Wichtigste Gruppen

### Kategorie-Kombinationen je Stammnorm

| Kombination | Stammnormen | davon mit Blocker | Beispiele |
| --- | --- | --- | --- |
| normativity | 1788 | 1788 | term:23267, term:23268, term:23269 |
| historical-gap | 1705 | 1705 | term:23282, term:23283, term:23286 |
| institution-mapping | 947 | 0 | term:24446, term:26468, term:26470 |
| historical-gap + unknown-structure | 594 | 594 | term:23284, term:23292, term:23294 |
| metadata-conflict | 323 | 312 | term:23465, term:23629, term:23977 |
| document-identity + normativity | 317 | 317 | term:23299, term:23311, term:23314 |
| attachment + institution-mapping | 263 | 0 | term:24224, term:24452, term:26519 |
| normativity + unknown-structure | 232 | 232 | term:23277, term:23278, term:23279 |
| metadata-conflict + unknown-structure | 99 | 96 | term:23555, term:23639, term:23768 |
| institution-mapping + slug-collision | 91 | 0 | term:26537, term:26564, term:26575 |
| unknown-structure | 85 | 64 | term:23317, term:23406, term:23412 |
| document-identity + historical-gap | 45 | 45 | term:23285, term:23427, term:23438 |

### Institutionen-Bezeichnungen (gruppiert, Darstellung)

| Bezeichnung | Kategorie | Stammnormen | Vorkommen | Beispiele |
| --- | --- | --- | --- | --- |
| Bezirksregierung | authority | 308 | 1118 | term:26480, term:26521, term:26581 |
| Düsseldorf | municipality | 251 | 759 | term:24446, term:24452, term:26486 |
| Innenminister | ministry | 238 | 258 | term:23528, term:26485, term:26486 |
| Finanzminister | ministry | 203 | 231 | term:26486, term:26512, term:26561 |
| Köln | municipality | 197 | 768 | term:23528, term:26552, term:26560 |
| Bezirksregierungen | authority | 197 | 425 | term:23528, term:26519, term:26520 |
| Justizminister | ministry | 175 | 211 | term:26468, term:26472, term:26483 |
| Minister für Arbeit, Gesundheit und Soziales | ministry | 150 | 151 | term:26532, term:26569, term:26570 |
| Münster | municipality | 149 | 488 | term:24446, term:26514, term:26552 |
| Finanzministerium | ministry | 134 | 306 | term:26512, term:26712, term:26833 |
| Arnsberg | municipality | 130 | 329 | term:23528, term:24446, term:26480 |
| Lippe | geography | 103 | 392 | term:26486, term:26487, term:26533 |

### Parserbefunde (Muster)

| Muster | offen | blockierend | Stammnormen | Beispiele |
| --- | --- | --- | --- | --- |
| lrmb unknown-inline-element:Unbekanntes Inline-Element <p> im LRMB-Text | 287 | 287 | 287 | term:23386, term:23397, term:23470 |
| lrmb structure-numbering:Auffälligkeiten der Nummernfolge: Nummernfolge (Beginn) → # | 185 | 0 | 185 | term:23284, term:23315, term:23368 |
| lrmb structure-numbering:Auffälligkeiten der Nummernfolge: Nummernfolge # → # | 120 | 0 | 120 | term:23406, term:23428, term:23439 |
| lrmb structure-duplicate-number:Doppelte Nummern im selben Gliederungsraum: # | 67 | 67 | 67 | term:23300, term:23404, term:23428 |
| lrmb structure-numbering:Auffälligkeiten der Nummernfolge: Nummernfolge # → #; Nummernfolge # → #; Nummernfolge # → #; N | 41 | 0 | 41 | term:23300, term:23360, term:23560 |
| lrmb structure-numbering:Auffälligkeiten der Nummernfolge: Nummernfolge # → #; Nummernfolge # → # | 37 | 0 | 37 | term:23525, term:23628, term:23639 |
| lrmb structure-duplicate-number:Doppelte Nummern im selben Gliederungsraum: #, # | 34 | 34 | 34 | term:23491, term:23508, term:23829 |
| lrmb structure-duplicate-number:Doppelte Nummern im selben Gliederungsraum: #, #, # | 29 | 29 | 29 | term:23405, term:23406, term:23515 |
| lrmb structure-numbering:Auffälligkeiten der Nummernfolge: Nummer # ohne übergeordnete Nummer #; Nummernfolge (Beginn) → | 29 | 0 | 29 | term:23454, term:24001, term:24010 |
| lrmb missing-content:Kein Textfeld (tex2jax_process/field--field_text) im LRMB-Dokument | 24 | 24 | 24 | term:31100, term:31154, term:31304 |
| lrmb structure-lrmb-legacy-format:LRMB-Fassung im Legacy-Dateiformat; der LRMB-Parser übernimmt nur das native Format (R | 24 | 24 | 24 | term:31100, term:31154, term:31304 |
| lrmb structure-duplicate-number:Doppelte Nummern im selben Gliederungsraum: #, #, #, # | 23 | 23 | 23 | term:23525, term:24666, term:24681 |

## Prioritätsmodell (`common/review-priority.ts`)

- Quelltyp: Gesetz +30, Rechtsverordnung +25, Allgemeine VwV +25, VwV +22, Durchführungserlass +18, Runderlass +15, Richtlinie +15, sonstige +8; Portaltyp Bekanntmachung −10
- Stichtagsrelevanz: am Stichtag geltend +25, unbestimmt +10, nicht geltend −40, ausgeschlossen −40
- Gesetzesbezug +10; Verwaltungsrelevanz (breiter Anwenderkreis laut Titel) +5; Referenzhäufigkeit +3 je Titelnennung (max. +15)
- Blocker: mindestens ein blockierender Befund +15 (Norm fehlt im Bestand)
- Beleglage: starke Belege +8, nur unterstützende +3, keine Belege bei unbestimmter Geltung −5
- PDF-only −10 und −1 je 20 Seiten (max. −15); wesentliche Anlage nicht verlinkt −15
- Rekonstruktion: −1 je 5 Befehle (max. −20), Änderungsquellen unvollständig −5, Rekonstruktion unsicher −5
- Parserbefund blockierend +5 (systematisch behebbar); −1 je weiterem offenen Befund (max. −10)
- Altdatensatz vor 1990 −5; Suchindex-Außerkrafttreten vor dem Stichtag −15 (Hinweis, kein Beleg)

Bänder (Stammnormen mit offenen Befunden): A 947, B 2154, C 2783, D 995.

## Top-Prioritäten (alle Kategorien)

| Rang | Term | Bereich | Titel | Score | Blocker | Faktoren |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | term:27469 | lrgv | Zweites Gesetz zur Ausführung des Gesetzes zur Neuordnung des Kinder- und Jugend | 99 (A) | metadata-conflict | Quelltyp gesetz (+30); am Stichtag geltend (+25); Vorschrift zu einem Gesetz oder einer Verordnung (+10); breiter Anwenderkreis laut Titel (+5); Referenzhäufigkeit 2 Titelnennung(en) (+6); 1 blockiere |
| 2 | term:28664 | lrgv | Verordnung über die zentrale Vergabe von Studienplätzen in Nordrhein-Westfalen ( | 98 (A) | metadata-conflict | Quelltyp gesetz (+30); am Stichtag geltend (+25); breiter Anwenderkreis laut Titel (+5); Referenzhäufigkeit 5 Titelnennung(en) (+15); 1 blockierende(r) Befund(e), Norm fehlt im Bestand (+15); starke B |
| 3 | term:29585 | lrgv | Verordnung über die Vergabe von Studienplätzen in Nordrhein-Westfalen (Vergabeve | 93 (A) | metadata-conflict | Quelltyp rechtsverordnung (+25); am Stichtag geltend (+25); breiter Anwenderkreis laut Titel (+5); Referenzhäufigkeit 5 Titelnennung(en) (+15); 1 blockierende(r) Befund(e), Norm fehlt im Bestand (+15) |
| 4 | term:31591 | lrgv | Verordnung über die Laufbahnen der Beamtinnen und Beamten im Land Nordrhein-West | 93 (A) | metadata-conflict | Quelltyp rechtsverordnung (+25); am Stichtag geltend (+25); breiter Anwenderkreis laut Titel (+5); Referenzhäufigkeit 6 Titelnennung(en) (+15); 1 blockierende(r) Befund(e), Norm fehlt im Bestand (+15) |
| 5 | term:27608 | lrgv | Schulverwaltungsgesetz (SchVG), Bekanntmachung der Neufassung | 92 (A) | metadata-conflict | Quelltyp gesetz (+30); am Stichtag geltend (+25); breiter Anwenderkreis laut Titel (+5); Referenzhäufigkeit 3 Titelnennung(en) (+9); 1 blockierende(r) Befund(e), Norm fehlt im Bestand (+15); starke Be |
| 6 | term:28699 | lrgv | Verordnung über die maschinelle Führung des Handels- und des Genossenschaftsregi | 90 (A) | metadata-conflict | Quelltyp gesetz (+30); am Stichtag geltend (+25); Referenzhäufigkeit 4 Titelnennung(en) (+12); 1 blockierende(r) Befund(e), Norm fehlt im Bestand (+15); starke Belege vorhanden (+8) |
| 7 | term:28563 | lrgv | Polizeigesetz des Landes Nordrhein-Westfalen (PolG NRW); Bekanntmachung der Neuf | 89 (A) | metadata-conflict | Quelltyp gesetz (+30); am Stichtag geltend (+25); breiter Anwenderkreis laut Titel (+5); Referenzhäufigkeit 2 Titelnennung(en) (+6); 1 blockierende(r) Befund(e), Norm fehlt im Bestand (+15); starke Be |
| 8 | term:26966 | lrgv | Bekanntmachung der Neufassung des Ausführungsgesetzes zum Tierseuchengesetz (AGT | 88 (A) | metadata-conflict | Quelltyp gesetz (+30); am Stichtag geltend (+25); Vorschrift zu einem Gesetz oder einer Verordnung (+10); 1 blockierende(r) Befund(e), Norm fehlt im Bestand (+15); starke Belege vorhanden (+8) |
| 9 | term:29018 | lrgv | Verordnung zur Übertragung von Befugnissen nach den §§ 57 bis 59 der Landeshaush | 88 (A) | metadata-conflict | Quelltyp rechtsverordnung (+25); am Stichtag geltend (+25); Vorschrift zu einem Gesetz oder einer Verordnung (+10); breiter Anwenderkreis laut Titel (+5); 1 blockierende(r) Befund(e), Norm fehlt im Be |
| 10 | term:32622 | lrgv | Verordnung zum Schutz vor Neuinfizierungen mit dem Coronavirus SARS-CoV-2 (Coron | 88 (A) | metadata-conflict | Quelltyp rechtsverordnung (+25); am Stichtag geltend (+25); Referenzhäufigkeit 30 Titelnennung(en) (+15); 1 blockierende(r) Befund(e), Norm fehlt im Bestand (+15); starke Belege vorhanden (+8) |
| 11 | term:32647 | lrgv | Verordnung zum Schutz vor Neuinfizierungen mit dem Coronavirus SARS-CoV-2 im Ber | 88 (A) | metadata-conflict | Quelltyp rechtsverordnung (+25); am Stichtag geltend (+25); Referenzhäufigkeit 5 Titelnennung(en) (+15); 1 blockierende(r) Befund(e), Norm fehlt im Bestand (+15); starke Belege vorhanden (+8) |
| 12 | term:32708 | lrgv | Verordnung zum Schutz vor Neuinfizierungen mit dem Coronavirus SARS-CoV-2 (Coron | 88 (A) | metadata-conflict | Quelltyp rechtsverordnung (+25); am Stichtag geltend (+25); Referenzhäufigkeit 30 Titelnennung(en) (+15); 1 blockierende(r) Befund(e), Norm fehlt im Bestand (+15); starke Belege vorhanden (+8) |
| 13 | term:32869 | lrgv | Verordnung zum Schutz vor Neuinfizierungen mit dem Coronavirus SARS-CoV-2 (Coron | 88 (A) | metadata-conflict | Quelltyp rechtsverordnung (+25); am Stichtag geltend (+25); Referenzhäufigkeit 30 Titelnennung(en) (+15); 1 blockierende(r) Befund(e), Norm fehlt im Bestand (+15); starke Belege vorhanden (+8) |
| 14 | term:32906 | lrgv | Verordnung zum Schutz vor Neuinfizierungen mit dem Coronavirus SARS-CoV-2 in Bez | 88 (A) | metadata-conflict | Quelltyp rechtsverordnung (+25); am Stichtag geltend (+25); Referenzhäufigkeit 5 Titelnennung(en) (+15); 1 blockierende(r) Befund(e), Norm fehlt im Bestand (+15); starke Belege vorhanden (+8) |
| 15 | term:33114 | lrgv | Verordnung zum Schutz vor Neuinfizierungen mit dem Coronavirus SARS-CoV-2 im Ber | 88 (A) | metadata-conflict | Quelltyp rechtsverordnung (+25); am Stichtag geltend (+25); Referenzhäufigkeit 5 Titelnennung(en) (+15); 1 blockierende(r) Befund(e), Norm fehlt im Bestand (+15); starke Belege vorhanden (+8) |
| 16 | term:33463 | lrgv | Verordnung zum Schutz vor Neuinfizierungen mit dem Coronavirus SARS-CoV-2 (Coron | 88 (A) | metadata-conflict | Quelltyp rechtsverordnung (+25); am Stichtag geltend (+25); Referenzhäufigkeit 30 Titelnennung(en) (+15); 1 blockierende(r) Befund(e), Norm fehlt im Bestand (+15); starke Belege vorhanden (+8) |
| 17 | term:33601 | lrgv | Verordnung zum Schutz vor Neuinfizierungen mit dem Coronavirus SARS-CoV-2 (Coron | 88 (A) | metadata-conflict | Quelltyp rechtsverordnung (+25); am Stichtag geltend (+25); Referenzhäufigkeit 30 Titelnennung(en) (+15); 1 blockierende(r) Befund(e), Norm fehlt im Bestand (+15); starke Belege vorhanden (+8) |
| 18 | term:32321 | lrmb | Dynamisierung der Einkommensgrenzen gemäß § 13 Absatz 4 des Gesetzes zur Förderu | 87 (A) | text-integrity, unknown-structure | Quelltyp runderlass (+15); am Stichtag geltend (+25); breiter Anwenderkreis laut Titel (+5); Referenzhäufigkeit 8 Titelnennung(en) (+15); 2 blockierende(r) Befund(e), Norm fehlt im Bestand (+15); star |
| 19 | term:33031 | lrmb | Wohnraumförderungsbestimmungen (WFB) Runderlass des Ministeriums für Heimat, Kom | 87 (A) | unknown-structure | Quelltyp richtlinie (+15); am Stichtag geltend (+25); breiter Anwenderkreis laut Titel (+5); Referenzhäufigkeit 8 Titelnennung(en) (+15); 1 blockierende(r) Befund(e), Norm fehlt im Bestand (+15); star |
| 20 | term:28397 | lrgv | Wohnungsbauförderungsgesetz (WBFG) in der Fassung der Bekanntmachung vom 27. Nov | 86 (A) | metadata-conflict | Quelltyp gesetz (+30); am Stichtag geltend (+25); breiter Anwenderkreis laut Titel (+5); Referenzhäufigkeit 1 Titelnennung(en) (+3); 1 blockierende(r) Befund(e), Norm fehlt im Bestand (+15); starke Be |

## Arbeitslisten

- `data/audits/recht-nrw/review/work-lists/historische-luecken.md` – Top historische Lücken (LRMB, historical-gap): 2398 Stammnormen, Top 100 (z. B. term:28132, term:28207, term:29914)
- `data/audits/recht-nrw/review/work-lists/pdf-only.md` – Top PDF-only-Fälle (Transkriptionspriorität): 55 Stammnormen, Top 55 (z. B. term:32563, term:33148, term:32560)
- `data/audits/recht-nrw/review/work-lists/rekonstruktionen.md` – Top Rekonstruktionen (reconstruction-required / -uncertain): 61 Stammnormen, Top 61 (z. B. term:32369, term:32598, term:31072)
- `data/audits/recht-nrw/review/work-lists/normativitaet.md` – Top Normativitätsfälle (normativity): 2364 Stammnormen, Top 100 (z. B. term:24178, term:29390, term:29269)
- `data/audits/recht-nrw/review/work-lists/institutionen-normen.md` – Top Normen mit Institutionen-Mapping (institution-mapping): 1391 Stammnormen, Top 100 (z. B. term:27211, term:27217, term:27219)
- `data/audits/recht-nrw/review/work-lists/parser-normen.md` – Top Parserfälle (unknown-structure / text-integrity): 1163 Stammnormen, Top 100 (z. B. term:32321, term:33031, term:27211)
- `data/audits/recht-nrw/review/work-lists/institutionen-bezeichnungen.md` – Top Institutionen-Mappings (Bezeichnungen über alle Normen): 646 Gruppen
- `data/audits/recht-nrw/review/work-lists/parser-muster.md` – Top Parserfälle (Befundmuster): 312 Gruppen
- `data/audits/recht-nrw/review/work-lists/anlagen-muster.md` – Anlagenbefunde (Muster): 9 Gruppen

## LRMB

- Historische Lücken (Statistik `lrmb/HISTORICAL_GAP_STATISTIK.md`, Analyse und Vorschläge `lrmb/HISTORICAL_GAP_ANALYSE.md`): 2396 Fälle – Gründe no-start-evidence 2150, no-continuity-amendment 237, continuity-failed 9; Belegklassen no-signal 1917, in-force-clause-only 284, index-outforce-only 119, amendment-chain-identified 58, amendment-chain-unidentified 18
- PDF-Fälle (`lrmb/PDF_FAELLE.md`): 375 Stammnormen, 1222 PDF-Dateien, 6126 bekannte Seiten (Textlayer 1177, Scan 24); Regelungsgehalt essential-missing 22, html 320, html-with-essential-pdf 33
- Rekonstruktionsqueue: 62 (offen 13, Rezeptentwurf 0, unsicher 48, übernommen 1); Richtung reverse 19, forward 0, mixed 0, unknown 43; Änderungen 0: 43, 1: 17, 2: 2, 3-5: 0, 6+: 0; Quellen complete 19, partial 0, unknown 43

## Nächste fachliche Schritte

- Parser: Muster „lrmb unknown-inline-element:Unbekanntes Inline-Element <p> im LRMB-Text“ betrifft 287 Stammnormen – ein Parserfix löst die Gruppe (Regressionstest mit Beispiel term:23386).
- Institutionen: Bezeichnung „Bezirksregierung“ (authority) in 308 Normen – eine dokumentierte Zuordnung in institution-mapping.json schließt alle Vorkommen.
- PDF: höchste Transkriptionspriorität term:32563 (Richtlinie über die Gewährung von Zuwendungen zur Förderung , 6 Seiten, Textlayer 2/2); VV zur LHO nach docs/VV_LHO_TRANSKRIPTIONSPLAN.md.
- Normativität: 2364 Dokumente warten auf eine Einzelentscheidung; Liste `normativitaet.md` beginnt mit den Vorschriften mit Gesetzesbezug und Erlasskopf.
- Rekonstruktion: 13 Fälle mit vollständigen Quellen warten auf ein geprüftes Rezept (`rekonstruktionen.md`).
