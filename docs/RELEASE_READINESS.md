# Release-Bereitschaft

Erzeugt von `npm run release:check -- --write --full` am 2026-09-29 auf `53f000df983c` gegen `https://landesrecht-online.de`;
maschinenlesbar `data/audits/release-readiness.json`. Der Befehl orchestriert nur bestehende Prüfungen (Protokolle unter `.cache/release-check/`).
Bewusst fehlende Sim-Quellen sind bekannte Einschränkungen, nie Releaseblocker.

## Release-Status: **READY WITH KNOWN LIMITATIONS**

Keine Releaseblocker.

## Bestand je Land

| Land | Ausgangsrechtsstand | Freeze-Commit | Baseline-Normen | Sim-Quellen | Gesetzblätter | fehlende Quellen | Evidenz unvollständig | gesperrt / in Prüfung | letzte Quelle |
| --- | --- | --- | ---: | --- | --- | ---: | ---: | --- | --- |
| West | FROZEN | `ff1b1f43e209` | 1482 | PARTIAL | PARTIAL 22/23 | 1 | 7 | 17 / 38 | 2026-09-18 |
| NSH | FROZEN | `eeeca2cdc559` | 2672 | PARTIAL | PARTIAL 5/6 | 1 | 7 | 4 / 28 | 2026-09-02 |
| Ost | READ-ONLY UPSTREAM (OstRecht) | – | – | upstream | – | – | – | – | – |
| BayWü | FROZEN | `018752abcd5c` | 1618 | PARTIAL | COMPLETE 8/8 | 5 | 6 | 18 / 28 | 2026-08-30 |

Ausgangsrechtsstand aller Länder: 2023-12-01; redaktioneller Stichtag 2026-09-28.

## Prüfungen

| Bereich | Prüfung | Art | Ergebnis | Dauer | Zusammenfassung |
| --- | --- | --- | --- | ---: | --- |
| Build | Typprüfung (tsc + astro check) | blockierend | bestanden | 8 s | - 0 errors · - 0 warnings |
| Tests | Vitest (alle Tests) | blockierend | bestanden | 36 s | Test Files  124 passed (124) · Tests  2009 passed (2009) |
| Inhalt | content:check (Validierung, Unveränderlichkeit, Tabellen, Sim-Gates inkl. Freeze-Gate G2) | blockierend | bestanden | 54 s | Unveränderlichkeit geprüft: 5919 gespeicherte Fassung(en) gegen HEAD: 5919 unverändert, 0 dokumentiert freigegeben, 0 als Testfixture verschoben. · Tabellen-Regressionsgate: 0 geänderte Fassung(en) gegen 53f000df983c verglichen (Tabellen 0 → 0), 0 Tabellenänderung(en) begründet freigegeben, keine unbegründete. · G2: west: 1482 Baseline-Fassungen gegen ff1b1f43e209 geprüft, 0 dokumentiert freigegeb |
| Freeze | NSH-Freeze (Commit, Fingerabdruck) | blockierend | bestanden | 2 s | NSH-Baseline-Status: FROZEN (Freeze-Commit eeeca2cdc559; Bewertung READY WITH HUMAN REVIEW) · Baseline-Fingerabdruck 1b92d06468585d5d… · Gate freeze-fingerprint: ok – Freeze-Commit eeeca2cdc559: 2.672 Normen, 1b92d06468585d5d… · Arbeitskopie 2.672 Normen, 1b92d06468585d5d… · dokumentiert 1b92d06468585d5d… |
| Freeze | BayWü-Freeze (Commit, Fingerabdruck) | blockierend | bestanden | 1 s | BayWü-Baseline-Status: FROZEN (Freeze-Commit 018752abcd5c; Bewertung BASELINE READY) · Baseline 1.618 Normen · Fingerabdruck 07c7fec745054453… · Gate freeze-fingerprint: ok – Freeze-Commit 018752abcd5c: 1.618 Normen, 07c7fec745054453… · Arbeitskopie 1.618 Normen, 07c7fec745054453… · dokumentiert 07c7fec745054453… |
| D1 | D1-Schema, Projektion, FTS5-Integrität | blockierend | bestanden | 11 s | D1-Schema gültig: 12 Tabellen, 276522 Anweisungen, 5897 Normen, 5919 Fassungen, 85054 Sucheinheiten, 35 Verkündungen, FTS5-Integrität geprüft. |
| Sim-Quellen | Sim-Vollständigkeit (Status fail-closed berechnet) | blockierend | bestanden | 1 s | west: Sim-Quellen PARTIAL (SIM SOURCES PARTIAL) · Blätter PARTIAL 22/23 · Einzelakte COMPLETE (fehlend 0) · fehlende Quellen 1, Evidenz unvollständig 7, mögliche Lücken 1 + 4 Zeiträume · Ereignisse applied 41, review 38, blocked 17, not-promulgated 7 · letzte Quelle 2026-09-18 · nsh: Sim-Quellen PARTIAL (SIM SOURCES PARTIAL) · Blätter PARTIAL 5/6 · Einzelakte COMPLETE (fehlend 0) · fehlende Quelle |
| Sim-Quellen | Source-Inbox (Dry-run) | beratend | bestanden | 0 s | Queue: all 19 · open 19 |
| Build | Astro-Build (Worker) | blockierend | bestanden | 2 s | 19:39:05 [build] Complete! |
| Suche | West: Golden Set (Recall, Top-1, Verletzungen) | blockierend | bestanden | 24 s | Golden Set or-prefix: Recall@10 94.1 %, MRR 0.933, Top-1 100.0 %, Sprungziel 100.0 %, Nulltreffer 100.0 %, verletzt 0, Latenz p50 92.9 ms / p95 344.4 ms / max 849.7 ms (Standard: and-first) · Golden Set and-first: Recall@10 94.1 %, MRR 0.933, Top-1 100.0 %, Sprungziel 100.0 %, Nulltreffer 100.0 %, verletzt 0, Latenz p50 6.8 ms / p95 35.6 ms / max 114.5 ms (Standard: and-first) |
| Suche | NSH: Suchintegrität (Stichprobe) und Golden Set | blockierend | bestanden | 55 s | or-prefix: Recall@10 0.957, MRR 0.942, Top-1 1, Sprungziel 1, Nulltreffer 1, verletzt 0, p95 221.8 ms · and-first: Recall@10 0.957, MRR 0.942, Top-1 1, Sprungziel 1, Nulltreffer 1, verletzt 0, p95 24.8 ms · West + BayWü + NSH: 12/12 gemeinsame Titelbruchstücke richtig gefiltert |
| Suche | BayWü: Suchintegrität (Stichprobe) und Golden Set | blockierend | bestanden | 55 s | or-prefix: Recall@10 0.935, MRR 0.904, Top-1 1, Sprungziel 1, Nulltreffer 1, verletzt 0, p95 256.7 ms · and-first: Recall@10 0.944, MRR 0.926, Top-1 1, Sprungziel 1, Nulltreffer 1, verletzt 0, p95 34.1 ms · West + BayWü: 10/10 gemeinsame Titelbruchstücke richtig gefiltert |
| Qualität | Provenienz West (--strict) | blockierend | bestanden | 1 s | Provenienz-Audit: 1482 Normen, 0 Fehler, 22 Warnungen → /Users/petzke/landesrecht/data/audits/recht-nrw/quality/provenance.md |
| Qualität | Rekonstruktion VV LHundG (Determinismus) | blockierend | bestanden | 1 s | Rekonstruktions-Audit: 13/13 Prüfungen bestanden → /Users/petzke/landesrecht/data/audits/recht-nrw/quality/reconstruction-vv-lhundg.md |
| Ost | Ost: Contract, Drift, Freshness (Stichtag 2026-09-28) | blockierend | bestanden | 157 s | Contract: ok · Freshness: Landesrecht-Stichtag 2026-09-28; OstRecht-Sync 2026-09-13T12:13:44.344Z (complete), indexierter Stichtag zwischen 2026-09-12 und vor 2026-10-01; Such-Readiness ready, Volltext current-version-only · Ergebnis: keine Drift |
| API/Routen | Produktions-Smoke (https://landesrecht-online.de) | blockierend | bestanden | 17 s | Alle 67 Prüfungen bestanden |
| API/Routen | Website-Stichprobe und Barrierefreiheit (Produktion) | blockierend | bestanden | 17 s | Website-Stichprobe: 41 Seiten, 0 mit Befunden, 41 Abrufe → /Users/petzke/landesrecht/data/audits/recht-nrw/quality/site-smoke.md |
| D1 | D1 lokal ↔ remote (landesrecht-west) | beratend | bestanden | 22 s | Lokal ↔ Remote (landesrecht-west): identisch in 12 Prüfungen. |
| D1 | D1 lokal ↔ remote (landesrecht-nsh) | beratend | bestanden | 22 s | Lokal ↔ Remote (landesrecht-nsh): identisch in 12 Prüfungen. |
| D1 | D1 lokal ↔ remote (landesrecht-baywue) | beratend | bestanden | 24 s | Lokal ↔ Remote (landesrecht-baywue): identisch in 12 Prüfungen. |
| R2 | R2-Archiv (Manifest ↔ Listing, Byte-Stichprobe) | beratend | bestanden | 50 s | Ergebnis: **0 relevante Abweichungen**. |
| Performance | Performance-Baseline (lokal + Produktion) | beratend | bestanden | 7 s | D1 Normliste (500)                           median      3 ms  p95      6 ms  (5 Läufe) · Suche exakter Titel (Ladenöffnungszeiten)    median      4 ms  p95      8 ms  (5 Läufe) · Suche Abkürzung „LÖG West“                   median      3 ms  p95      4 ms  (5 Läufe) · Suche Abkürzung „DVO KiBiz“                  median      1 ms  p95      1 ms  (5 Läufe) · Suche Volltext „Erlaubnis“               |

## Bekannte, nicht blockierende Einschränkungen

- West: Sim-Quellen PARTIAL (Gesetzblätter PARTIAL 22/23, 1 fehlende Quelle(n), 7 mit unvollständiger Evidenz, 17 gesperrt / 38 in Prüfung) – bewusst, kein Releaseblocker
- NSH: Sim-Quellen PARTIAL (Gesetzblätter PARTIAL 5/6, 1 fehlende Quelle(n), 7 mit unvollständiger Evidenz, 4 gesperrt / 28 in Prüfung) – bewusst, kein Releaseblocker
- BayWü: Sim-Quellen PARTIAL (Gesetzblätter COMPLETE 8/8, 5 fehlende Quelle(n), 6 mit unvollständiger Evidenz, 18 gesperrt / 28 in Prüfung) – bewusst, kein Releaseblocker
- Acquisition Queue: 19 offene Quelle(n) (P1 2, P2 7, P3 10) – `npm run sources:needed`
- Ost: Volltextindex von OstRecht nur für die geltende Fassung (frühere Fassungen über die Fassungsnavigation erreichbar)
- Suche: Tiefe Seiten der länderübergreifenden Suche (Offset 1 000–5 000) brauchen 8–20 s, weil jeder Store bis offset + limit Treffer liefert (mergeSearchPages); Offset ist auf 5 000 begrenzt, Antwort stabil 200 (maintenance)
- Qualität: Benennungs-Audit West: 12 Abkürzungen mit Quell-Landesbezeichnung (z. B. „BVSG NW“) oder generischem Kürzel („EU“, „EG“) (expected/legal-data limitation)
- Qualität: Legacy-Struktur West: 390 Tabellen ohne sichere Kopfzeile, 150 Normen mit mehrfach eingebetteten Fußnoten; Anker-Audit offline 245 Normen mit Strukturhinweisen (online 0/60 Seiten mit Befunden) (expected/legal-data limitation)
- Suche: Zwei geltende West-Normen tragen den Titel „Verfassung für das Land Westdeutschland“ (Stichtagsverfassung und Sim-Verfassung 2024) (expected/legal-data limitation)
- R2: R2-Audit: Umschläge (Metadaten-JSON) weichen bytegenau vom neu erzeugten Umschlag ab; Rohobjekte, Größen, MD5 und Byte-Stichprobe ohne Abweichung (expected/legal-data limitation)
- API/Routen: Keine eigene Sitemap; robots.txt erlaubt alles, Canonicals zeigen auf https://landesrecht-online.de, Fassungs- und Suchseiten tragen noindex (maintenance)

Akzeptierte Befunde pflegt `data/audits/release-accepted-findings.json` (Klassifikation: bug, maintenance, expected/legal-data limitation, obsolete finding).

## Verbleibende Acquisition Queue

19 Einträge (P1 2, P2 7, P3 10), noch zu beschaffen 19. Kurzliste: `npm run sources:needed`; Details `docs/SIM_SOURCE_ACQUISITION.md`.

- P1 BayWü: Gesetz zur Bereitstellung finanzieller Hilfen für Erdbebenschäden in Bayern-Württemberg vom 14.05.2026
- P1 NSH: Sieben im Inhaltsverzeichnis von NH GVBl. MAL-I Teil 1/2024 genannte Gesetze (u. a. Landesverfassungsschutzgesetz, Änderung der Landesverfassung)
- P2 BayWü: Bekanntmachung vom 31.05.2026 der AGO-Änderungsverordnung 26-StIH-07-V-03
- P2 BayWü: Amtliche Verkündungsbelege der Einzelverordnungen Januar 2025 (Sexualkunde, Unterrichtsbeginn, Hausaufgaben, KZ-Besuchspflicht, Wolfsverordnung, Grenzüberwachung)
- P2 BayWü: Weitere „Verordnungen betreffend des Grenzschutzes“ 2024 (u. a. Verordnung zur Verstärkung der Polizeipräsenz an den Süddeutschen Auslandsgrenzen vom 16.08.2024)
- P2 BayWü: GVBl. BayWü 2025 Nr. 2 – vollständiges PDF (Seite 11 fehlt, Duplikat von Seite 10)
- P2 NSH: Gesetzblatt zur Verkündung vom 08.07.2024
- P2 NSH: Staatsvertrag zum Gesetz vom 09.12.2025 (NSH GVBl. LAH-II Teil 2/2026 S. 8–9)
- P2 West: Ministerialblatt für das Land Westdeutschland (MBl. WD) 2026 Nr. 2

