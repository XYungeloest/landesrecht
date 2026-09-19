# Readiness juris Schleswig-Holstein

Erzeugt von `node scripts/import-juris-sh.ts readiness --write`. Stichtag **2023-12-01**. Quelle: Bürgerservice Schleswig-Holstein (juris), Simulationsland Niedersachsen-Holstein (`nsh`).

**READY**

| Prüfung | Status | Detail |
| --- | --- | --- |
| Zugriffspolitik belegt (robots.txt advisory, Nutzerentscheidung) (`zugriffspolitik`) | pass | robots.txt 420 Bytes, SHA-256 e13af9e19d86…, abgerufen 2026-09-18T12:35:48.600Z; 5/5 Pfade „disallowed“ – Befund, keine Sperre (Entscheidung 2026-09-18) |
| Keine technische Zugriffssperre (403/429/Challenge) (`keine-technische-sperre`) | pass | 20 Adressproben, 143 Ausgabeproben, 5197 Vollkorpus-Dokumente ohne Sperrsignal |
| Enumeration Landesrecht und VwV vorhanden und konsistent (`enumeration`) | pass | landesrecht 2808 · vwv 2389 |
| Enumeration im Fixpunkt (zweiter, unabhängiger Abruf unverändert) (`enumeration-fixpunkt`) | pass | landesrecht: 1 Bestätigung(en), Fingerabdruck 7a0460777bbb… · vwv: 1 Bestätigung(en), Fingerabdruck 8ab1f8eef243… |
| Normtext über einen öffentlichen Ausgabeweg abrufbar (ohne interne Schnittstelle) (`oeffentlicher-ausgabeweg`) | pass | PDF-Ausgabe (GET /jportal/recherche3doc/…pdf) mit der anonymen Sitzung eines öffentlichen Permalink-Aufrufs; kein Login, kein CSRF, /jportal/wsrest/ nicht aufgerufen. 1 Probe(n) liefern Inhalt (pdf-export-with-session) über eine öffentliche GET-Adresse |
| Stichprobe Vollweg (Parser, Stichtag, Überleitung, Validierung) mit Textintegrität (`stichprobe-vollweg`) | pass | 38 Normen: import-ready 13 · reconstruction 3 · review 14 · not-at-baseline 8; Integrität exact 38 |
| Vollkorpus über die öffentliche PDF-Ausgabe im Cache (`vollkorpus-abruf`) | pass | 5195/5197 PDF-Gesamtausgaben geholt; 2 ohne PDF (Portalfehler je Dokument, bleiben draußen): jlr-NNLSH00003058 [server-error] jlr-NNLSH00003058: HTTP 500 – Kennung für die; jlr-NNLSH000030FC [server-error] jlr-NNLSH000030FC: HTTP 500 – Kennung für die |
| Vollkorpus-Inventur (Strukturinventur mit Textintegrität je Dokument) (`vollkorpus-inventur`) | pass | 5197/5197 Dokumente: not-at-baseline 1720 · import-ready 1910 · reconstruction 56 · review 1505 · not-cached 2 · failed 4; Integrität exact 5193 · review 1 · mismatch 1 |
| Stichtagsklassifikation aller Normen (Ausgabe, Einzelfassungen, Register nach A/B/C) (`stichtagsklassifikation`) | pass | landesrecht: unchanged-since-baseline 1273, changed-after-baseline 247, repealed-after-baseline 88, enacted-after-baseline 153, repealed-before-baseline 962, undetermined 85 · vwv: unchanged-since-baseline 1767, changed-after-baseline 12, repealed-after-baseline 0, enacted-after-baseline 608, repealed-before-baseline 0, undetermined 2; undetermined → Review (sonstige 85 · nicht im Cache 2); Regeln C-undetermined 795 · B-strong-begin-and-continuity 3434 · A-strong-end-before-baseline 962 |
| Abgleich mit amtlichen Registern (Gliederungsnummern, Abdeckung ≥ 95 %) (`zweite-quelle`) | pass | gvobl-systematische-uebersicht (Stand 2024-12-13): 869/897 = 96.9 % · ab-erlassverzeichnis (Stand 2024-09-30): 225/234 = 96.2 %; fehlende Nummern in CORPUS_INVENTORY.md |
| Scope je Dokument (Normtyp aus der Ausgabe; Ortsrecht, Rechtsprechung, Verkündungsblätter ausgeschlossen) (`scope-dokumentebene`) | pass | Normtyp je Dokument: verordnung 2025 · gesetz 728 · zustimmungsgesetz 51 · verfassung 2 · verwaltungsvorschrift 2389 |
| baseline-only-Kandidaten mit dem Bestand abgeglichen (`baseline-only`) | pass | 54 Kandidaten: 49 einem juris-Dokument zugeordnet (import-ready 28 · review 13 · not-matched 5 · reconstruction 6 · not-at-baseline 2), übernahmefähig 28; nicht zugeordnete in der Rekonstruktionsqueue |
| Bestand content/norms/nsh deckt sich mit den übernommenen Manifesteinträgen (`bestand-konsistent`) | pass | 1910 Normen, 5195 Manifesteinträge, 2200 Review-Fälle |

