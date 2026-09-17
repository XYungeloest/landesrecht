# RECHT.NRW Bulkimport – Parser-Residuen (LRGV, Stichtag 2023-12-01)

Stand: 2026-09-16 · Parser vorher `recht-nrw-parser/1.1.0`, nachher `recht-nrw-parser/1.2.0` · maschinenlesbar: `parser-residuals.json`

22 Fälle mit `importStatus: failed` nach dem Bulk-Lauf. Ergebnis nach Parserüberarbeitung: **17 gelöst**, **5 Review** (Quelldefekt, fail-closed), 0 bleiben failed. Einschätzung: 12 Parser unvollständig, 8 Quelle defekt, 2 beides.

Vorher-Fehlercodes: `structure-unnumbered-section` 2, `integrity-parse-duplicateUnits` 1, `integrity-transform-duplicateUnits` 1, `content-pdf-only` 1.

## Übersicht

| Term | Titel | Fehlercode(s) vorher | Strukturmerkmal | Phase | Textverlust-Risiko | Einschätzung | Status nachher |
| --- | --- | --- | --- | --- | --- | --- | --- |
| term:26524 | Gesetz über das öffentliche Flaggen | integrity-parse-textLength | Native Fassungsseite mit 3 legaldoc-article-Sektionen ohne jedes Nummernfeld (§ 1/§ 2 fehlen im Portal); Fußno | parse-source-format → fetch-parse-Integrität | keiner | beides | review → `imported-with-warnings` (gesetz-ueber-das-oeffentliche-flaggen-west) |
| term:26552 | Gesetz über die Gliederung und die Bezirke der ordentlichen  | integrity-parse-textLength | Sektion des § 3 (Amtsgerichte) ohne Nummernfeld, 50 Fußnoten an dieser nummernlosen Sektion | parse-source-format → fetch-parse-Integrität | keiner | quelle-defekt | review → `needs-review` |
| term:26676 | Gesetz zur Anpassung landesrechtlicher Straf- und Bußgeldvor | unparsed-unit-heading ×10 | Nummernfelder mit Artikelspannen („Artikel I bis III“, „Art. VIII bis XI“, „Artikel XXVIII und XXIX“, „Artikel | parse-source-format (field--field_num) | keiner | parser-unvollstaendig | geloest → `imported` (anpassungsgesetz-anpg-nw-west) |
| term:26683 | Zweites Gesetz zur Anpassung landesrechtlicher Straf- und Bu | unparsed-unit-heading ×4 | Nummernfelder mit Artikelspannen („Art. VII bis XXV“ …) | parse-source-format (field--field_num) | keiner | parser-unvollstaendig | geloest → `imported-with-warnings` (zweites-gesetz-zur-anpassung-landesrechtlicher-straf-und-west) |
| term:26714 | Kommunalabgabengesetz für das Land Nordrhein-Westfalen (KAG) | unparsed-unit-heading (legacy) | lrdetail „15 bis 16 (Fn 12)“ ohne §§-Zeichen nach § 14 (aufgehobene §§) | parse-source-format (p.lrdetail) | keiner | quelle-defekt | geloest → `imported-with-warnings` (kag-west) |
| term:26909 | Gesetz über den Ruhrverband (Ruhrverbandsgesetz - RuhrVG -) | integrity-parse-duplicateUnits | Inhaltsübersicht wiederholt „Artikel 1“, „Artikel 2“, „Artikel 3“ als lrdetail vor dem Text | parse-source-format → fetch-parse-Integrität | keiner | parser-unvollstaendig | geloest → `imported-with-warnings` (gesetz-ueber-den-ruhrverband-ruhrverbandsgesetz-ruhrvg-west) |
| term:27179 | Gesetz über den Zusammenschluß der Gemeinden Velen-Dorf, Wal | integrity-parse-textLength (−52 %) | <ul> mit <p>-Kindern statt <li> (Maßgaben zum Gebietsänderungsvertrag) | parse-source-format (Listen) | hoch | parser-unvollstaendig | geloest → `imported` (gesetz-ueber-den-zusammenschluss-der-gemeinden-velen-dorf-waldvelen-und-west) |
| term:27219 | Gesetz zur Neugliederung der Gemeinden und Kreise des Neugli | integrity-parse-duplicateUnits | Portal führt den in § 45 (Maßgaben zu Gebietsänderungsverträgen) zitierten „§ 5“ als eigene Sektion zwischen § | parse-source-format → fetch-parse-Integrität | keiner | quelle-defekt | review → `needs-review` |
| term:27493 | Gesetz über die Verleihung der Rechte einer Körperschaft des | integrity-transform-textLength (−3 %) | Sehr kurze Norm (265 Zeichen); zwei Ersetzungen „Nordrhein-Westfalen“ → „Westdeutschland“ (−8 Zeichen) übersch | transform-into-simulation-jurisdiction → source-canonical-Integrität | keiner | parser-unvollstaendig | geloest → `imported-with-warnings` (gesetz-ueber-die-verleihung-der-rechte-einer-koerperschaft-des-west-27493) |
| term:27945 | Kreislaufwirtschaftsgesetz für das Land Nordrhein-Westfalen  | unparsed-unit-heading (legacy) | lrdetail „Teil 1 / Einleitende Bestimmungen (Fn 37)“ (Gliederung in lrdetail) | parse-source-format (p.lrdetail) | keiner | parser-unvollstaendig | geloest → `imported-with-warnings` (lkrwg-west) |
| term:28223 | Landesmediengesetz Nordrhein-Westfalen (LMG NRW) | unparsed-unit-heading (legacy) | lrdetail „33e (Fn 14) / Verpflichtungszusagen“ ohne §-Zeichen zwischen § 33d und § 34 | parse-source-format (p.lrdetail) | keiner | quelle-defekt | geloest → `imported-with-warnings` (lmg-west) |
| term:28965 | Erstes Gesetz zur Befristung des Landesrechts Nordrhein-West | missing-content + no-sections | Fassungsseite ohne iframe und ohne legaldoc-Inhalt; nur PDF-Download („Dokument herunterladen“), kein Redirect | parse-source-format (Fassungsseite) | hoch | quelle-defekt | review → `needs-review` |
| term:29177 | Verordnung über die Gewährung von Leistungsbezügen an Profes | unparsed-unit-heading ×3 | Nummernfelder „1. Abschnitt“, „2. Abschnitt“, „3. Abschnitt“ als eigene Sektionen ohne Überschrift/Text | parse-source-format (field--field_num) | keiner | parser-unvollstaendig | geloest → `imported-with-warnings` (fhrleistbvo-west) |
| term:29214 | Ausführungsgesetz zum Bürgerlichen Gesetzbuch | integrity-parse-duplicateUnits (§ 1–§ 11) | Artikel 1–33 nur als zentrierte fette Absätze im Text; §-Zählung beginnt je Artikel neu; Artikeltitel teils vo | parse-source-format → fetch-parse-Integrität | keiner | parser-unvollstaendig | geloest → `imported-with-warnings` (ausfuehrungsgesetz-zum-buergerlichen-gesetzbuch-west-29214) |
| term:29679 | Verordnung über Zahlungen in Zwangsversteigerungsverfahren ( | integrity-parse-textLength (+75 %) | Fußnoten in Sektionen ohne Nummernfeld (Vorspann, Fußnotensektion vor § 1) | parse-source-format → fetch-parse-Integrität | keiner | parser-unvollstaendig | geloest → `imported-with-warnings` (verordnung-ueber-zahlungen-in-zwangsversteigerungsverfahren-fn-2-west) |
| term:29852 | Verordnung über den Bildungsgang und die Abiturprüfung in de | unparsed-unit-heading (legacy) | lrdetail „Inkrafttreten, Übergangsbestimmungen / (Artikel 3 der Verordnung zur Neufassung …)“: Überschrift ohn | parse-source-format (p.lrdetail) | keiner | parser-unvollstaendig | geloest → `imported-with-warnings` (apo-gost-west) |
| term:30034 | Gesetz über die Justiz im Land Nordrhein-Westfalen (Justizge | unparsed-unit-heading (legacy) | lrdetail „84 (Fn 3) / (weggefallen)“ ohne §-Zeichen zwischen § 83 und § 85 | parse-source-format (p.lrdetail) | keiner | quelle-defekt | geloest → `imported-with-warnings` (justg-west) |
| term:30682 | Verordnung über die Ausbildung und die Abschlussprüfungen in | unparsed-unit-heading ×5 (legacy) | Absätze „(1) …“, „(2) …“ der §§ 44b/44c mit Klasse lrdetail (align=left, font-weight:normal) | parse-source-format (p.lrdetail) | keiner | quelle-defekt | geloest → `imported-with-warnings` (verordnung-ueber-die-ausbildung-und-die-abschlusspruefungen-in-der-west) |
| term:32258 | Gesetz zum Schutz personenbezogener Daten im Justizvollzug i | unparsed-unit-heading (legacy) | Einheitentitel des § 34 über zwei lrdetail-Absätze („… Technikgestaltung und “ / „datenschutzfreundliche Vorei | parse-source-format (p.lrdetail) | keiner | quelle-defekt | geloest → `imported-with-warnings` (jvollzdsg-west) |
| term:32405 | Zweite Verordnung über besoldungsrechtliche Übergangsregelun | unparsed-unit-heading ×2 → structure-unnumbered-section ×10 | Nummernfelder „§&nbsp;1“/„§&nbsp;13“ als doppelt kodierte Entity (Text „§&nbsp;1“); §§ 2–12 und Schlussvorschr | parse-source-format (field--field_num, Sektionen) | keiner | beides | review → `needs-review` |
| term:33113 | Verordnung über die Ausbildung und Prüfung für die Laufbahn  | unparsed-unit-heading ×4 (legacy) | lrdetail „Teil 1 / Einstellung“, „Teil 2 / Ausbildung“, „Teil 3 / Laufbahnprüfung“, „Teil 5 / Übergangs- und S | parse-source-format (p.lrdetail) | keiner | parser-unvollstaendig | geloest → `imported-with-warnings` (verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-laufbahn-des-west-33113) |
| term:33844 | Allgemeine Verwaltungsgebührenordnung für das Land Nordrhein | unknown-paragraph-class ×30 (Anlage) | Anlage „Tarifstellen 1 bis 14“ (HTM) und „Anhang 5“ mit Word-Klasse MsoPapDefault (Absatz-Standardeigenschafte | attachments (Anlage, p.msopapdefault) | keiner | parser-unvollstaendig | geloest → `imported-with-warnings` (avwgebo-west) |

## Fälle

### term:26524 – Gesetz über das öffentliche Flaggen

- Quelle: <https://recht.nrw.de/lrgv/gesetz/11102014-gesetz-ueber-das-oeffentliche-flaggen> (native, sha256 cb953915d94a1f35…)
- Fehler vorher: integrity-parse-textLength (0 Befund(e))
- Strukturmerkmal: Native Fassungsseite mit 3 legaldoc-article-Sektionen ohne jedes Nummernfeld (§ 1/§ 2 fehlen im Portal); Fußnoten hängen an nummernlosen Sektionen
- Parserphase: parse-source-format → fetch-parse-Integrität; betroffene Einheiten: Einziger Paragraph (§ 1) und § 2 (aufgehoben): keine Einheiten im Portal
- Textverlust-Risiko: keiner – Abweichung +87 %: Fußnotentexte wurden als Fließtext („Fn 1: …“) gezählt (Parser), Rohzählung ohne Fußnoten. Sichtbarer Text vollständig.
- Einschätzung: beides; Fix: native-parser: Zeilenart footnotes; kein Fließtext aus Fußnoten
- Lösungsstatus: **review** – Fußnoten ohne Einheit sind jetzt Fußnotenblöcke (Integrität ok). Bleibt ohne §-Einheiten: Dokumentidentität „no-legal-units“ → Review-Fall bei Übernahme (imported-with-warnings + Review-Item); §-Kennzeichen werden nicht erfunden.
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **imported-with-warnings** → `gesetz-ueber-das-oeffentliche-flaggen-west`; Fehler: –; Warnungen: document-identity-review; Integrität: fetch-parse ok, source-canonical ok

### term:26552 – Gesetz über die Gliederung und die Bezirke der ordentlichen Gerichte

- Quelle: <https://recht.nrw.de/lrgv/gesetz/01092005-gesetz-ueber-die-gliederung-und-die-bezirke-der-ordentlichen-gerichte> (native, sha256 8bffbed5b73ff652…)
- Fehler vorher: integrity-parse-textLength (1 Befund(e))
- Strukturmerkmal: Sektion des § 3 (Amtsgerichte) ohne Nummernfeld, 50 Fußnoten an dieser nummernlosen Sektion
- Parserphase: parse-source-format → fetch-parse-Integrität; betroffene Einheiten: § 3 (fehlt als Einheit; Text würde § 2 zugeschlagen)
- Textverlust-Risiko: keiner – Abweichung +105 %: 50 Fußnotentexte als Fließtext gezählt. Sichtbarer Text vollständig, aber falsch zugeordnet.
- Einschätzung: quelle-defekt; Fix: native-parser: structure-unnumbered-section (fail-closed), footnotes-Zeilen
- Lösungsstatus: **review** – Neuer Befund structure-unnumbered-section (Review-Klasse): nummernlose Sektion mit Normtext nach § 2. Portal ohne Kennzeichen „§ 3“; Herleitung wäre unbelegter Inhalt.
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **needs-review**; Fehler: structure-unnumbered-section; Warnungen: unresolved-source-references; Integrität: fetch-parse ok, source-canonical ok

### term:26676 – Gesetz zur Anpassung landesrechtlicher Straf- und Bußgeldvorschriften an das Bundesrecht (Anpassungsgesetz -AnpG. NW.)

- Quelle: <https://recht.nrw.de/lrgv/gesetz/27022014-gesetz-zur-anpassung-landesrechtlicher-straf-und-bussgeldvorschriften-das> (native, sha256 4dde3de4200c8328…)
- Fehler vorher: unparsed-unit-heading ×10 (0 Befund(e))
- Strukturmerkmal: Nummernfelder mit Artikelspannen („Artikel I bis III“, „Art. VIII bis XI“, „Artikel XXVIII und XXIX“, „Artikel XLVIII bis IL“) für eingearbeitete/aufgehobene Artikel
- Parserphase: parse-source-format (field--field_num); betroffene Einheiten: 10 Spannen; Einzelartikel VII, XII, XIX, XLIII, XLVII, L–LX bleiben Einheiten
- Textverlust-Risiko: keiner – Spannen tragen nur Fußnoten und die folgende Abschnittsüberschrift.
- Einschätzung: parser-unvollstaendig; Fix: body-common: parseUnitRangeHeading, Zeilenart unit-range
- Lösungsstatus: **geloest** – Spanne = Überschrift auf Einheitenebene (schließt vorigen Artikel, kein Container, keine künstlichen Artikel); Info-Befund unit-range-heading.
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **imported** → `anpassungsgesetz-anpg-nw-west`; Fehler: –; Warnungen: –; Integrität: fetch-parse ok, source-canonical ok

### term:26683 – Zweites Gesetz zur Anpassung landesrechtlicher Straf- und Bußgeldvorschriften an das Bundesrecht (Zweites Anpassungsgesetz - 2. AnpG. NW.)

- Quelle: <https://recht.nrw.de/lrgv/gesetz/27022014-zweites-gesetz-zur-anpassung-landesrechtlicher-straf-und-bussgeldvorschriften> (native, sha256 193e49f921fcdddc…)
- Fehler vorher: unparsed-unit-heading ×4 (0 Befund(e))
- Strukturmerkmal: Nummernfelder mit Artikelspannen („Art. VII bis XXV“ …)
- Parserphase: parse-source-format (field--field_num); betroffene Einheiten: 4 Spannen; Artikel I–VI, XXXII, XL–XLVIII bleiben Einheiten
- Textverlust-Risiko: keiner – wie term:26676
- Einschätzung: parser-unvollstaendig; Fix: body-common: parseUnitRangeHeading
- Lösungsstatus: **geloest** – wie term:26676
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **imported-with-warnings** → `zweites-gesetz-zur-anpassung-landesrechtlicher-straf-und-west`; Fehler: –; Warnungen: unresolved-source-references; Integrität: fetch-parse ok, source-canonical ok

### term:26714 – Kommunalabgabengesetz für das Land Nordrhein-Westfalen (KAG)

- Quelle: <https://recht.nrw.de/lrgv/gesetz/15122022-kommunalabgabengesetz-fuer-das-land-nordrhein-westfalen-kag> (legacy-file, sha256 a7d2263966b5b62a…)
- Fehler vorher: unparsed-unit-heading (legacy) (0 Befund(e))
- Strukturmerkmal: lrdetail „15 bis 16 (Fn 12)“ ohne §§-Zeichen nach § 14 (aufgehobene §§)
- Parserphase: parse-source-format (p.lrdetail); betroffene Einheiten: §§ 15 bis 16 (weggefallen)
- Textverlust-Risiko: keiner – Nur Fußnotenverweis.
- Einschätzung: quelle-defekt; Fix: body-common: inferUnitHeading (nur lückenlose Fortsetzung); legacy-parser: classifyDetailHeading
- Lösungsstatus: **geloest** – Zeichen aus der fortlaufenden Zählung hergeleitet (§ 14 → §§ 15 bis 16), als Überschrift ohne Einheiten; Warnung unit-marker-inferred.
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **imported-with-warnings** → `kag-west`; Fehler: –; Warnungen: unit-marker-inferred, unresolved-source-references; Integrität: fetch-parse ok, source-canonical ok

### term:26909 – Gesetz über den Ruhrverband (Ruhrverbandsgesetz - RuhrVG -)

- Quelle: <https://recht.nrw.de/lrgv/gesetz/19022022-gesetz-ueber-den-ruhrverband-ruhrverbandsgesetz-ruhrvg> (legacy-file, sha256 7f3cd0f31958dae6…)
- Fehler vorher: integrity-parse-duplicateUnits (0 Befund(e))
- Strukturmerkmal: Inhaltsübersicht wiederholt „Artikel 1“, „Artikel 2“, „Artikel 3“ als lrdetail vor dem Text
- Parserphase: parse-source-format → fetch-parse-Integrität; betroffene Einheiten: Artikel 1–3 (Übersicht) vs. Artikel 1–3 (Text)
- Textverlust-Risiko: keiner – Übersichtszeilen bleiben als Text erhalten.
- Einschätzung: parser-unvollstaendig; Fix: legacy-parser: detectLegacyToc, countLegacyUnitHeadings; integrity: rawMetrics
- Lösungsstatus: **geloest** – detectLegacyToc: Region zwischen „Inhaltsübersicht“ und Wiederbeginn wird als Text übernommen (wie native Inhaltsübersichten); Rohzählung nutzt dieselbe Regel. Verbleibende Warnung dangling-footnote (Fn 14 in der Quelle ohne Fußnotentext).
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **imported-with-warnings** → `gesetz-ueber-den-ruhrverband-ruhrverbandsgesetz-ruhrvg-west`; Fehler: –; Warnungen: dangling-footnote, unresolved-source-references; Integrität: fetch-parse ok, source-canonical ok

### term:27179 – Gesetz über den Zusammenschluß der Gemeinden Velen-Dorf, Waldvelen und Nordvelen, Landkreis Borken

- Quelle: <https://recht.nrw.de/lrgv/gesetz/01012000-gesetz-ueber-den-zusammenschluss-der-gemeinden-velen-dorf-waldvelen-und> (native, sha256 b8893a93bbdd9885…)
- Fehler vorher: integrity-parse-textLength (−52 %) (0 Befund(e))
- Strukturmerkmal: <ul> mit <p>-Kindern statt <li> (Maßgaben zum Gebietsänderungsvertrag)
- Parserphase: parse-source-format (Listen); betroffene Einheiten: § 2 Nummern 1–4
- Textverlust-Risiko: hoch – Echter Textverlust: die 4 Maßgaben wurden vom Parser verworfen (nur <li> gelesen). Integritätsprüfung hat den Verlust erkannt (fail-closed).
- Einschätzung: parser-unvollstaendig; Fix: native-parser: parseBlockNode für Listenkinder
- Lösungsstatus: **geloest** – Blockkinder von <ul>/<ol> werden wie Absätze gelesen (Info list-with-block-children); Text vollständig.
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **imported** → `gesetz-ueber-den-zusammenschluss-der-gemeinden-velen-dorf-waldvelen-und-west`; Fehler: –; Warnungen: –; Integrität: fetch-parse ok, source-canonical ok

### term:27219 – Gesetz zur Neugliederung der Gemeinden und Kreise des Neugliederungsraumes Sauerland/Paderborn (Sauerland/Paderborn-Gesetz)

- Quelle: <https://recht.nrw.de/lrgv/gesetz/01012000-gesetz-zur-neugliederung-der-gemeinden-und-kreise-des-neugliederungsraumes-6> (native, sha256 2247a11357f89d55…)
- Fehler vorher: integrity-parse-duplicateUnits (2 Befund(e))
- Strukturmerkmal: Portal führt den in § 45 (Maßgaben zu Gebietsänderungsverträgen) zitierten „§ 5“ als eigene Sektion zwischen § 45 und § 46
- Parserphase: parse-source-format → fetch-parse-Integrität; betroffene Einheiten: § 5 (zweimal); der zweite ist Zitat aus einer Anlage-Maßgabe
- Textverlust-Risiko: keiner – Text vollständig, Zuordnung im Portal falsch.
- Einschätzung: quelle-defekt; Fix: pipeline: REVIEW_CLASS_ERRORS um integrity-*-duplicateUnits erweitert
- Lösungsstatus: **review** – Portal-Segmentierungsfehler; Zählbereiche greifen nicht (kein Artikel/keine Anlage). Duplikate sind jetzt Review-Klasse (needs-review statt failed).
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **needs-review**; Fehler: integrity-parse-duplicateUnits, integrity-transform-duplicateUnits; Warnungen: unresolved-source-references; Integrität: fetch-parse FEHLER, source-canonical FEHLER

### term:27493 – Gesetz über die Verleihung der Rechte einer Körperschaft des öffentlichen Rechts an die Neuapostolische Kirche im Lande Nordrhein-Westfalen

- Quelle: <https://recht.nrw.de/lrgv/gesetz/01012000-gesetz-ueber-die-verleihung-der-rechte-einer-koerperschaft-des-oeffentlichen-0> (native, sha256 e3386d5ca7c698d3…)
- Fehler vorher: integrity-transform-textLength (−3 %) (0 Befund(e))
- Strukturmerkmal: Sehr kurze Norm (265 Zeichen); zwei Ersetzungen „Nordrhein-Westfalen“ → „Westdeutschland“ (−8 Zeichen) überschreiten die relative 3-%-Toleranz
- Parserphase: transform-into-simulation-jurisdiction → source-canonical-Integrität; betroffene Einheiten: § 1, § 2
- Textverlust-Risiko: keiner – Abweichung exakt durch protokollierte Ersetzungen erklärt.
- Einschätzung: parser-unvollstaendig; Fix: integrity: explainedBodyDelta; pipeline übergibt report.changes
- Lösungsstatus: **geloest** – checkTransformIntegrity akzeptiert eine Abweichung, die exakt der Summe der protokollierten body-Ersetzungen entspricht (kein größerer Schwellenwert).
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **imported-with-warnings** → `gesetz-ueber-die-verleihung-der-rechte-einer-koerperschaft-des-west-27493`; Fehler: –; Warnungen: slug-collision; Integrität: fetch-parse ok, source-canonical ok

### term:27945 – Kreislaufwirtschaftsgesetz für das Land Nordrhein-Westfalen (Landeskreislaufwirtschaftsgesetz – LKrWG)

- Quelle: <https://recht.nrw.de/lrgv/gesetz/13072023-kreislaufwirtschaftsgesetz-fuer-das-land-nordrhein-westfalen> (legacy-file, sha256 bda7803bad55fce6…)
- Fehler vorher: unparsed-unit-heading (legacy) (0 Befund(e))
- Strukturmerkmal: lrdetail „Teil 1 / Einleitende Bestimmungen (Fn 37)“ (Gliederung in lrdetail)
- Parserphase: parse-source-format (p.lrdetail); betroffene Einheiten: Teil 1
- Textverlust-Risiko: keiner
- Einschätzung: parser-unvollstaendig; Fix: legacy-parser: classifyDetailHeading
- Lösungsstatus: **geloest** – Gliederungskennzeichen in lrdetail → Gliederungsebene (Info division-in-detail-heading); Fußnote der Titelzeile bleibt erhalten.
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **imported-with-warnings** → `lkrwg-west`; Fehler: –; Warnungen: unresolved-source-references; Integrität: fetch-parse ok, source-canonical ok

### term:28223 – Landesmediengesetz Nordrhein-Westfalen (LMG NRW)

- Quelle: <https://recht.nrw.de/lrgv/gesetz/01062022-landesmediengesetz-nordrhein-westfalen-lmg-nrw> (legacy-file, sha256 40d53a0074b8547d…)
- Fehler vorher: unparsed-unit-heading (legacy) (0 Befund(e))
- Strukturmerkmal: lrdetail „33e (Fn 14) / Verpflichtungszusagen“ ohne §-Zeichen zwischen § 33d und § 34
- Parserphase: parse-source-format (p.lrdetail); betroffene Einheiten: § 33e
- Textverlust-Risiko: keiner – Text war als Überschrift erhalten, aber § 33e fehlte als Einheit.
- Einschätzung: quelle-defekt; Fix: body-common: inferUnitHeading
- Lösungsstatus: **geloest** – Zeichen hergeleitet (§ 33d → § 33e), Warnung unit-marker-inferred; Rohzählung nutzt dieselbe Kette.
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **imported-with-warnings** → `lmg-west`; Fehler: –; Warnungen: unit-marker-inferred, unresolved-source-references; Integrität: fetch-parse ok, source-canonical ok

### term:28965 – Erstes Gesetz zur Befristung des Landesrechts Nordrhein-Westfalen

- Quelle: <https://recht.nrw.de/lrgv/gesetz/04062004-erstes-gesetz-zur-befristung-des-landesrechts-nordrhein-westfalen> (native, sha256 996e26712faf6189…)
- Fehler vorher: missing-content + no-sections (1 Befund(e))
- Strukturmerkmal: Fassungsseite ohne iframe und ohne legaldoc-Inhalt; nur PDF-Download („Dokument herunterladen“), kein Redirect, kein JS-Rendering
- Parserphase: parse-source-format (Fassungsseite); betroffene Einheiten: gesamte Norm
- Textverlust-Risiko: hoch – Text liegt nur als PDF vor; kein HTML-Fallback vorhanden.
- Einschätzung: quelle-defekt; Fix: pipeline: content-pdf-only
- Lösungsstatus: **review** – Neuer Review-Befund content-pdf-only mit PDF-URL (Transkriptions-/Attachment-Pfad); needs-review statt failed.
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **needs-review**; Fehler: content-pdf-only; Warnungen: –; Integrität: fetch-parse FEHLER, source-canonical FEHLER

### term:29177 – Verordnung über die Gewährung von Leistungsbezügen an Professorinnen und Professoren der Fachhochschule für Rechtspflege Nordrhein-Westfalen (FHR-Leistungsbezügeverordnung – FHRLeistBVO)

- Quelle: <https://recht.nrw.de/lrgv/rechtsverordnung/19022022-verordnung-ueber-die-gewaehrung-von-leistungsbezuegen-0> (native, sha256 df9ec672a545bee5…)
- Fehler vorher: unparsed-unit-heading ×3 (0 Befund(e))
- Strukturmerkmal: Nummernfelder „1. Abschnitt“, „2. Abschnitt“, „3. Abschnitt“ als eigene Sektionen ohne Überschrift/Text
- Parserphase: parse-source-format (field--field_num); betroffene Einheiten: 3 Abschnitte; §§ 1–10 bleiben Einheiten
- Textverlust-Risiko: keiner
- Einschätzung: parser-unvollstaendig; Fix: native-parser: parseDivisionHeading auf Nummernfeld
- Lösungsstatus: **geloest** – Gliederungskennzeichen im Nummernfeld → Gliederungsebene (Info division-in-number-field).
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **imported-with-warnings** → `fhrleistbvo-west`; Fehler: –; Warnungen: unresolved-source-references; Integrität: fetch-parse ok, source-canonical ok

### term:29214 – Ausführungsgesetz zum Bürgerlichen Gesetzbuch

- Quelle: <https://recht.nrw.de/lrgv/gesetz/01012000-ausfuehrungsgesetz-zum-buergerlichen-gesetzbuch-0> (native, sha256 24b49cdd3f8bb067…)
- Fehler vorher: integrity-parse-duplicateUnits (§ 1–§ 11) (0 Befund(e))
- Strukturmerkmal: Artikel 1–33 nur als zentrierte fette Absätze im Text; §-Zählung beginnt je Artikel neu; Artikeltitel teils vor, teils nach der Nummer (mehrzeilige Absätze)
- Parserphase: parse-source-format → fetch-parse-Integrität; betroffene Einheiten: 78 §§ in 33 Artikeln
- Textverlust-Risiko: keiner
- Einschätzung: parser-unvollstaendig; Fix: native-parser: detectInlineArticleScopes, classifyInlineArticleLines; integrity: rawMetrics
- Lösungsstatus: **geloest** – Dokumentweite Regel (kein Artikel-Nummernfeld, wiederholte §-Nummern, zentrierte reine Artikelzeilen) eröffnet Artikel-Zählbereiche; 141 Einheiten, keine Duplikate; Rohzählung identisch. Titel vor der Nummer bleibt in Lesereihenfolge eine Überschrift.
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **imported-with-warnings** → `ausfuehrungsgesetz-zum-buergerlichen-gesetzbuch-west-29214`; Fehler: –; Warnungen: slug-collision, unresolved-source-references; Integrität: fetch-parse ok, source-canonical ok

### term:29679 – Verordnung über Zahlungen in Zwangsversteigerungsverfahren (Fn 2)

- Quelle: <https://recht.nrw.de/lrgv/rechtsverordnung/01082013-verordnung-ueber-zahlungen-zwangsversteigerungsverfahren-fn-2> (native, sha256 000e816ee01ce5f6…)
- Fehler vorher: integrity-parse-textLength (+75 %) (0 Befund(e))
- Strukturmerkmal: Fußnoten in Sektionen ohne Nummernfeld (Vorspann, Fußnotensektion vor § 1)
- Parserphase: parse-source-format → fetch-parse-Integrität; betroffene Einheiten: Vorspann; § 1, § 2 unverändert
- Textverlust-Risiko: keiner – Fußnoten als Fließtext gezählt.
- Einschätzung: parser-unvollstaendig; Fix: native-parser: footnotes-Zeilen
- Lösungsstatus: **geloest** – Fußnotenblöcke statt Fließtext; Integrität ok.
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **imported-with-warnings** → `verordnung-ueber-zahlungen-in-zwangsversteigerungsverfahren-fn-2-west`; Fehler: –; Warnungen: unresolved-source-references; Integrität: fetch-parse ok, source-canonical ok

### term:29852 – Verordnung über den Bildungsgang und die Abiturprüfung in der gymnasialen Oberstufe (APO-GOSt)

- Quelle: <https://recht.nrw.de/lrgv/rechtsverordnung/01082023-verordnung-ueber-den-bildungsgang-und-die-abiturpruefung-der> (legacy-file, sha256 3bbc5795cc5a76c9…)
- Fehler vorher: unparsed-unit-heading (legacy) (0 Befund(e))
- Strukturmerkmal: lrdetail „Inkrafttreten, Übergangsbestimmungen / (Artikel 3 der Verordnung zur Neufassung …)“: Überschrift ohne Einheitenkennzeichen für angehängte Übergangsvorschriften
- Parserphase: parse-source-format (p.lrdetail); betroffene Einheiten: Überschrift nach § 43 (Nummern 1–3 folgen)
- Textverlust-Risiko: keiner
- Einschätzung: parser-unvollstaendig; Fix: legacy-parser: classifyDetailHeading (heading), body-common: heading schließt Einheit
- Lösungsstatus: **geloest** – Reine Überschrift (kurz, kein Satzende, kein kennzeichenartiger Anfang) → heading mit Warnung detail-heading; schließt § 43.
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **imported-with-warnings** → `apo-gost-west`; Fehler: –; Warnungen: detail-heading, unresolved-source-references; Integrität: fetch-parse ok, source-canonical ok

### term:30034 – Gesetz über die Justiz im Land Nordrhein-Westfalen (Justizgesetz Nordrhein-Westfalen - JustG NRW)

- Quelle: <https://recht.nrw.de/lrgv/gesetz/01012023-gesetz-ueber-die-justiz-im-land-nordrhein-westfalen-justizgesetz-nordrhein> (legacy-file, sha256 292566a8569967b0…)
- Fehler vorher: unparsed-unit-heading (legacy) (0 Befund(e))
- Strukturmerkmal: lrdetail „84 (Fn 3) / (weggefallen)“ ohne §-Zeichen zwischen § 83 und § 85
- Parserphase: parse-source-format (p.lrdetail); betroffene Einheiten: § 84 (weggefallen)
- Textverlust-Risiko: keiner
- Einschätzung: quelle-defekt; Fix: body-common: inferUnitHeading
- Lösungsstatus: **geloest** – Zeichen hergeleitet (§ 83 → § 84), Warnung unit-marker-inferred. Anlagen zu §§ 21/124 bleiben PDF-only (bestehender Befund annex-pdf-only).
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **imported-with-warnings** → `justg-west`; Fehler: –; Warnungen: annex-pdf-only, unit-marker-inferred, unresolved-source-references; Integrität: fetch-parse ok, source-canonical ok

### term:30682 – Verordnung über die Ausbildung und die Abschlussprüfungen in der Sekundarstufe I (Ausbildungs- und Prüfungsordnung Sekundarstufe I – APO-S I)

- Quelle: <https://recht.nrw.de/lrgv/rechtsverordnung/07122022-verordnung-ueber-die-ausbildung-und-die-abschlusspruefungen-der> (legacy-file, sha256 a14a5606af3a4350…)
- Fehler vorher: unparsed-unit-heading ×5 (legacy) (0 Befund(e))
- Strukturmerkmal: Absätze „(1) …“, „(2) …“ der §§ 44b/44c mit Klasse lrdetail (align=left, font-weight:normal)
- Parserphase: parse-source-format (p.lrdetail); betroffene Einheiten: § 44b Abs. 1–2, § 44c Abs. 1–3
- Textverlust-Risiko: keiner – Text war als Überschrift erhalten, Absatzstruktur fehlte.
- Einschätzung: quelle-defekt; Fix: legacy-parser: classifyDetailHeading (subparagraph)
- Lösungsstatus: **geloest** – lrdetail mit Absatzkennzeichen → Absatz der aktuellen Einheit, Warnung detail-body-text. 18 Anlagen bleiben PDF-only (bestehender Befund).
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **imported-with-warnings** → `verordnung-ueber-die-ausbildung-und-die-abschlusspruefungen-in-der-west`; Fehler: –; Warnungen: annex-pdf-only, detail-body-text, unresolved-source-references; Integrität: fetch-parse ok, source-canonical ok

### term:32258 – Gesetz zum Schutz personenbezogener Daten im Justizvollzug in Nordrhein-Westfalen (Justizvollzugsdatenschutzgesetz Nordrhein-Westfalen – JVollzDSG NRW)

- Quelle: <https://recht.nrw.de/lrgv/gesetz/28042022-gesetz-zum-schutz-personenbezogener-daten-im-justizvollzug-nordrhein-westfalen> (legacy-file, sha256 4cc151e55dbbdf8a…)
- Fehler vorher: unparsed-unit-heading (legacy) (0 Befund(e))
- Strukturmerkmal: Einheitentitel des § 34 über zwei lrdetail-Absätze („… Technikgestaltung und “ / „datenschutzfreundliche Voreinstellungen“)
- Parserphase: parse-source-format (p.lrdetail); betroffene Einheiten: § 34
- Textverlust-Risiko: keiner
- Einschätzung: quelle-defekt; Fix: legacy-parser: classifyDetailHeading (title-continuation)
- Lösungsstatus: **geloest** – Titelfortsetzung (Kleinschreibung am Anfang bzw. Konjunktion am Ende des vorigen Titels) → Titel des § 34, Warnung unit-title-continued.
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **imported-with-warnings** → `jvollzdsg-west`; Fehler: –; Warnungen: unit-title-continued, unresolved-source-references; Integrität: fetch-parse ok, source-canonical ok

### term:32405 – Zweite Verordnung über besoldungsrechtliche Übergangsregelungen nach Herstellung der Einheit Deutschlands (Zweite Besoldungs-Übergangsverordnung)

- Quelle: <https://recht.nrw.de/lrgv/rechtsverordnung/01062013-zweite-verordnung-ueber-besoldungsrechtliche-uebergangsregelungen> (native, sha256 3b39c0d935ce34f0…)
- Fehler vorher: unparsed-unit-heading ×2 → structure-unnumbered-section ×10 (10 Befund(e))
- Strukturmerkmal: Nummernfelder „§&nbsp;1“/„§&nbsp;13“ als doppelt kodierte Entity (Text „§&nbsp;1“); §§ 2–12 und Schlussvorschrift im Portal ohne jedes Nummernfeld
- Parserphase: parse-source-format (field--field_num, Sektionen); betroffene Einheiten: § 1, § 13 erkannt; §§ 2–12 ohne Kennzeichen
- Textverlust-Risiko: keiner – Text vollständig, aber ohne Einheitenzuordnung.
- Einschätzung: beides; Fix: body-common: normalizeEntityArtifacts; native-parser: structure-unnumbered-section
- Lösungsstatus: **review** – Entity-Artefakt deterministisch repariert (Warnung entity-artifact-repaired); die 10 nummernlosen Sektionen mit Normtext sind ein Quelldefekt → structure-unnumbered-section (Review-Klasse).
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **needs-review**; Fehler: structure-unnumbered-section; Warnungen: entity-artifact-repaired, unresolved-source-references; Integrität: fetch-parse ok, source-canonical ok

### term:33113 – Verordnung über die Ausbildung und Prüfung für die Laufbahn des vermessungstechnischen Dienstes im Land Nordrhein-Westfalen, Ämtergruppe des ersten Einstiegsamtes der Laufbahngruppe 2 (Ausbildungs- und Prüfungsverordnung Vermessung LG 2.1 - VAPV 2.1)

- Quelle: <https://recht.nrw.de/lrgv/rechtsverordnung/25062022-verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-laufbahn-des> (legacy-file, sha256 7e105ab7a66f01e4…)
- Fehler vorher: unparsed-unit-heading ×4 (legacy) (0 Befund(e))
- Strukturmerkmal: lrdetail „Teil 1 / Einstellung“, „Teil 2 / Ausbildung“, „Teil 3 / Laufbahnprüfung“, „Teil 5 / Übergangs- und Schlussvorschriften (Fn 19)“
- Parserphase: parse-source-format (p.lrdetail); betroffene Einheiten: Teile 1, 2, 3, 5
- Textverlust-Risiko: keiner
- Einschätzung: parser-unvollstaendig; Fix: legacy-parser: classifyDetailHeading (division)
- Lösungsstatus: **geloest** – wie term:27945. 7 Anlagen bleiben PDF-only (bestehender Befund).
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **imported-with-warnings** → `verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-laufbahn-des-west-33113`; Fehler: –; Warnungen: annex-pdf-only, enacting-body-mapping-required, slug-collision, unresolved-source-references; Integrität: fetch-parse ok, source-canonical ok

### term:33844 – Allgemeine Verwaltungsgebührenordnung für das Land Nordrhein-Westfalen (Allgemeine Verwaltungsgebührenordnung NRW – AVwGebO NRW)

- Quelle: <https://recht.nrw.de/lrgv/rechtsverordnung/28092023-allgemeine-verwaltungsgebuehrenordnung-fuer-das-land-nordrhein> (legacy-file, sha256 15a5b212d59c8d84…)
- Fehler vorher: unknown-paragraph-class ×30 (Anlage) (0 Befund(e))
- Strukturmerkmal: Anlage „Tarifstellen 1 bis 14“ (HTM) und „Anhang 5“ mit Word-Klasse MsoPapDefault (Absatz-Standardeigenschaften, rein präsentational)
- Parserphase: attachments (Anlage, p.msopapdefault); betroffene Einheiten: Tarifstellen 2.2.3 ff.
- Textverlust-Risiko: keiner – Text wurde gelesen, Klasse nur gemeldet.
- Einschätzung: parser-unvollstaendig; Fix: legacy-parser: KNOWN_PARAGRAPH_CLASS_PATTERNS
- Lösungsstatus: **geloest** – MsoPapDefault und MsoNormalN als bekannte präsentationale Klassen; Regressionstest. 7 Anlagen bleiben PDF-only (bestehender Befund).
- Nachher (Schreiblauf offline, Lauf recht-nrw-2023-12-01-lrgv-20260916T220350Z): **imported-with-warnings** → `avwgebo-west`; Fehler: –; Warnungen: annex-pdf-only, unresolved-source-references; Integrität: fetch-parse ok, source-canonical ok

Hinweis term:26524: ohne §-Einheiten übernommen (Text vollständig, Portal ohne Kennzeichen); die Dokumentidentitätsprüfung (`no-legal-units`) erzeugt ein Review-Item – §-Kennzeichen werden nicht erfunden.

## Generalisierte Klassen (keine Sonderfälle)

- **Einheitenspannen** („Artikel I bis III“, „§§ 15 bis 16“): Überschrift auf Einheitenebene, keine künstlichen Einzelartikel (`parseUnitRangeHeading`, Zeilenart `unit-range`).
- **Gliederung im Nummernfeld/lrdetail** („1. Abschnitt“, „Teil 1“): Gliederungsebene über `parseDivisionHeading`.
- **Fehlendes §-Zeichen (Legacy)**: nur bei lückenloser Fortsetzung der vorigen Einheit (`inferUnitHeading`), immer mit Warnung; Lücken bleiben Fehler.
- **lrdetail-Klassifikationskette**: Einheit → Spanne → Gliederung → Anlage → hergeleitet → Absatztext → Titelfortsetzung → Überschrift; kennzeichenartige oder satzartige Reste bleiben fail-closed.
- **Legacy-Inhaltsübersicht mit lrdetail-Einträgen**: wie native Inhaltsübersichten als Text (Kennzeichen müssen wiederkehren, sonst Warnung und unverändert).
- **Fußnoten ohne Einheit**: Fußnotenblöcke statt Fließtext (Ursache der textLength-Abweichungen +75/+87/+105 %).
- **`<p>` in `<ul>`**: Blockkinder werden gelesen (Ursache des Textverlusts −52 %).
- **Nummernlose Sektion mit Normtext** nach einer Einheit (außer „geteilte Sektion“: Nummernfeld ohne Text + Folgesektion): Quelldefekt → `structure-unnumbered-section`, Review-Klasse. Bisher wurde solcher Text still der vorigen Einheit zugeschlagen (betrifft im Bestand auch term:26534, 27211, 27217, 27514, 28146, 29969 – bei Regeneration → needs-review).
- **Artikel als zentrierte Überschriften mit neu beginnender §-Zählung**: dokumentweite Entscheidung (`detectInlineArticleScopes`), Parser und Rohzählung identisch; ohne wiederholte §-Nummern unverändert (kein Regressionsrisiko für angehängte Übergangsartikel).
- **Entity-Artefakt `&nbsp;`** im Nummernfeld: deterministisch als Leerzeichen, Warnung.
- **Duplikate im selben Zählbereich** und **PDF-only-Fassungsseiten**: Review-Klasse statt failed.
- **Transformationsprüfung**: Abweichung exakt gleich der Summe der protokollierten Ersetzungen ist zulässig (kein größerer Schwellenwert).
- **Word-Klassen** `MsoPapDefault`, `MsoNormalN`: präsentational.
- **Zustimmungsformel**: Punkte in Datumsangaben/Abkürzungen brachen die Erkennung ab (Bug in `treaty.ts`); Regel (Titel + Formel) unverändert.

## Fehlermeldungen

Parserbefunde tragen im Manifest jetzt Term-ID, Adresse, Phase und Quellhash (`[term:… · URL · Phase parse-source-format · Quelle sha256 …]`); die Parsermeldungen selbst nennen Struktur (`field--field_num`, `p.lrdetail nach § 83`, `Sektion 4`) und einen Ausschnitt (≤ 80 Zeichen).

## Regressionslauf über den Bestand (alter vs. neuer Parser, 3146 Stichtagsfassungen aus dem Cache)

- 28 Fälle fail → ok (die 17 gelösten Fälle sowie elf `not-at-baseline`-Fassungen mit gleichen Ursachen), 26 Fälle ok → `structure-unnumbered-section` (davon 6 bislang übernommene Normen mit stillschweigend falsch zugeordnetem Text, 2 bereits Review, 18 nicht am Stichtag).
- 1254 native Fassungen ändern nur den gezählten Textumfang (Fußnoten des Vorspanns sind jetzt Fußnotenblöcke statt Fließtext); Einheiten/Labels ändern sich nur in den fünf beabsichtigten Fällen.
- PARSER_VERSION 1.1.0 → 1.2.0: Regeneration des Gesamtbestands durch den Koordinator (`--regenerate-stale`).

