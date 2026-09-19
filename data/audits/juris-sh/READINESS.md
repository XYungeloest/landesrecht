# Readiness juris Schleswig-Holstein

Erzeugt von `node scripts/import-juris-sh.ts readiness --write`. Stichtag **2023-12-01**. Quelle: Bürgerservice Schleswig-Holstein (juris), Simulationsland Niedersachsen-Holstein (`nsh`).

**TECHNICALLY READY**

**REMOTE RELEASE PENDING SOURCE-RIGHTS DECISION** – TDM-Vorbehalt (tdm-reservation: 1) und Weiterveröffentlichung der juris-Ausgaben sind menschlich zu entscheiden; bis dahin kein R2-Upload, kein Remote-D1-Apply, kein Deploy für NSH. (Entscheidungsgrundlage: `docs/NSH_SOURCE_RIGHTS_AND_PROVENANCE.md`). Das ist kein Parser- oder Coveragefehler: Der Import ist technisch vollständig; nur die Remote-Veröffentlichung (R2, D1, Deploy) wartet auf die Entscheidung.

| Prüfung | Status | Detail |
| --- | --- | --- |
| Zugriffspolitik belegt (robots.txt advisory, Nutzerentscheidung) (`zugriffspolitik`) | pass | robots.txt 420 Bytes, SHA-256 e13af9e19d86…, abgerufen 2026-09-18T12:35:48.600Z; 5/5 Pfade „disallowed“ – Befund, keine Sperre (Entscheidung 2026-09-18) |
| Keine technische Zugriffssperre (403/429/Challenge) (`keine-technische-sperre`) | pass | 20 Adressproben, 143 Ausgabeproben, 5197 Vollkorpus-Dokumente ohne Sperrsignal |
| Enumeration Landesrecht und VwV vorhanden und konsistent (`enumeration`) | pass | landesrecht 2808 · vwv 2389 |
| Enumeration im Fixpunkt (zweiter, unabhängiger Abruf unverändert) (`enumeration-fixpunkt`) | pass | landesrecht: 1 Bestätigung(en), Fingerabdruck 7a0460777bbb… · vwv: 1 Bestätigung(en), Fingerabdruck 8ab1f8eef243… |
| Normtext über einen öffentlichen Ausgabeweg abrufbar (ohne interne Schnittstelle) (`oeffentlicher-ausgabeweg`) | pass | PDF-Ausgabe (GET /jportal/recherche3doc/…pdf) mit der anonymen Sitzung eines öffentlichen Permalink-Aufrufs; kein Login, kein CSRF, /jportal/wsrest/ nicht aufgerufen. 1 Probe(n) liefern Inhalt (pdf-export-with-session) über eine öffentliche GET-Adresse |
| Stichprobe Vollweg (Parser, Stichtag, Überleitung, Validierung) mit Textintegrität (`stichprobe-vollweg`) | pass | 38 Normen: import-ready 19 · reconstruction 3 · review 8 · not-at-baseline 8; Integrität exact 31 · explained-difference 7 |
| Vollkorpus über die öffentliche PDF-Ausgabe im Cache (`vollkorpus-abruf`) | pass | 5195/5197 PDF-Gesamtausgaben geholt; 2 ohne PDF (Portalfehler je Dokument, bleiben draußen): jlr-NNLSH00003058 [server-error] jlr-NNLSH00003058: HTTP 500 – Kennung für die; jlr-NNLSH000030FC [server-error] jlr-NNLSH000030FC: HTTP 500 – Kennung für die |
| Vollkorpus-Inventur (Strukturinventur mit Textintegrität je Dokument) (`vollkorpus-inventur`) | pass | 5197/5197 Dokumente: not-at-baseline 1643 · import-ready 2383 · reconstruction 56 · review 586 · not-cached 2 · part-of-main 523 · failed 4; Integrität exact 3118 · explained-difference 2075 · review 1 · mismatch 1 |
| Stichtagsklassifikation aller Normen (Ausgabe, Einzelfassungen, Register nach A/B/C) (`stichtagsklassifikation`) | pass | landesrecht: unchanged-since-baseline 1283, changed-after-baseline 250, repealed-after-baseline 88, enacted-after-baseline 153, repealed-before-baseline 962, undetermined 72 · vwv: unchanged-since-baseline 1766, changed-after-baseline 12, repealed-after-baseline 0, enacted-after-baseline 608, repealed-before-baseline 0, undetermined 3; undetermined → Review (sonstige 72 · nicht im Cache 2 · Ausgabe ohne Normtext 1); Regeln C-undetermined 796 · B-strong-begin-and-continuity 3433 · A-strong-end-before-baseline 962 |
| Abgleich mit den amtlichen Registern (Registerköpfe, stabile Kennungen; Quote nur Indikator) (`zweite-quelle`) | pass | gvobl-systematische-uebersicht (Stand 2024-12-13): 1727 Köpfe, nur Gliederungsnummer 88.1 %, streng 89.5 %, nicht gefunden 181 · ab-erlassverzeichnis (Stand 2024-09-30): 817 Köpfe, nur Gliederungsnummer 80.2 %, streng 80.2 %, nicht gefunden 162; jeder nicht gefundene Kopf eingeordnet (CORPUS_INVENTORY.md, Rekonstruktionsqueue) |
| Scope je Dokument (Normtyp aus der Ausgabe; Ortsrecht, Rechtsprechung, Verkündungsblätter ausgeschlossen) (`scope-dokumentebene`) | pass | Normtyp je Dokument: verordnung 2025 · gesetz 728 · zustimmungsgesetz 51 · verfassung 2 · verwaltungsvorschrift 2389 |
| baseline-only-Kandidaten mit dem Bestand abgeglichen (`baseline-only`) | pass | 54 Kandidaten: 49 einem juris-Dokument zugeordnet (import-ready 33 · review 8 · not-matched 5 · reconstruction 6 · not-at-baseline 2), übernahmefähig 33; nicht zugeordnete in der Rekonstruktionsqueue |
| Bestand content/norms/nsh deckt sich mit den übernommenen Manifesteinträgen (`bestand-konsistent`) | pass | 2383 Normen, 5195 Manifesteinträge, 2475 Review-Fälle |

