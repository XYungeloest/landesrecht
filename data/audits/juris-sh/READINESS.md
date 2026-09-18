# Readiness juris Schleswig-Holstein

Erzeugt von `node scripts/import-juris-sh.ts readiness --write`. Stichtag **2023-12-01**. Quelle: Bürgerservice Schleswig-Holstein (juris), Simulationsland Niedersachsen-Holstein (`nsh`).

**NOT READY**

Systemische Blocker:

- inhalt-adressierbar: 20/20 Proben liefern die leere Startseite der Portaloberfläche (kein sichtbarer Text; Inhalt wird erst per Skript geladen); 1 unterschiedliche Antwortkörper über alle Dokumente und Formen – die Antwort hängt nicht vom Dokument ab; Die Oberfläche lädt Dokumente über /jportal/wsrest/recherche3/ (Build-Konfiguration VITE_apiPath) mit X-CSRF-TOKEN und JURIS-PORTALID, Sitzungscookie (credentials: include) – interne, nicht dokumentierte Schnittstelle; nach der Zugriffspolitik nicht benutzt

| Prüfung | Status | Detail |
| --- | --- | --- |
| Zugriffspolitik belegt (robots.txt advisory, Nutzerentscheidung) (`zugriffspolitik`) | pass | robots.txt 420 Bytes, SHA-256 e13af9e19d86…, abgerufen 2026-09-18T12:35:48.600Z; 5/5 Pfade „disallowed“ – Befund, keine Sperre (Entscheidung 2026-09-18) |
| Keine technische Zugriffssperre (403/429/Challenge) (`keine-technische-sperre`) | pass | 20 Proben ohne Sperrsignal |
| Enumeration Landesrecht und VwV vorhanden und konsistent (`enumeration`) | pass | landesrecht 2808 · vwv 2389 |
| Enumeration im Fixpunkt (zweiter, unabhängiger Abruf unverändert) (`enumeration-fixpunkt`) | pass | landesrecht: 1 Bestätigung(en), Fingerabdruck 7a0460777bbb… · vwv: 1 Bestätigung(en), Fingerabdruck 8ab1f8eef243… |
| Abgleich mit einer zweiten, vollständigen Quelle (`zweite-quelle`) | fail | nur Stichprobe: 25/29 Kennungen der Discovery-Stichprobe in der Sitemap (4 nicht, 0 unaufgelöst); die vollständigen Register (FFN-Übersichten) sind wie jeder Dokumentinhalt nicht öffentlich adressierbar |
| Normtext über dokumentierte öffentliche Adressformen abrufbar (`inhalt-adressierbar`) | **FAIL (Blocker)** | 20/20 Proben liefern die leere Startseite der Portaloberfläche (kein sichtbarer Text; Inhalt wird erst per Skript geladen); 1 unterschiedliche Antwortkörper über alle Dokumente und Formen – die Antwort hängt nicht vom Dokument ab; Die Oberfläche lädt Dokumente über /jportal/wsrest/recherche3/ (Build-Konfiguration VITE_apiPath) mit X-CSRF-TOKEN und JURIS-PORTALID, Sitzungscookie (credentials: include) – interne, nicht dokumentierte Schnittstelle; nach der Zugriffspolitik nicht benutzt |
| Strukturinventur des Vollkorpus mit Textintegrität (`vollkorpus-strukturinventur`) | fail | nicht durchführbar: 0 Dokumente mit abrufbarem Normtext |
| Stichtagsklassifikation aller Normen (`stichtagsklassifikation`) | fail | 5197 undetermined: Ohne Dokumentinhalt fehlen Titel, Abkürzung, Gliederungsnummer, Fassungs- und Geltungsdaten. Weder die Zuordnung zum Ereignisregister noch der Vergleich mit dem Stichtag ist möglich; die DOKNR allein trägt keine dieser Angaben. |
| Scope je Dokument (Normtyp, normativ/informativ, landesweit) (`scope-dokumentebene`) | fail | nur auf Kennungsfamilien-Ebene entschieden (Ortsrecht, Rechtsprechung, Verkündungsblätter ausgeschlossen); je Dokument ohne Inhalt nicht entscheidbar |
| baseline-only-Kandidaten mit dem Bestand abgeglichen (`baseline-only`) | fail | 54 Kandidaten (Dubletten 0, durch Register bestätigt 21, nur angekündigt 33); Abgleich mit dem heutigen Bestand nicht möglich |
| Kein Bestand ohne grüne Gates geschrieben (`kein-ungeprueft-bestand`) | pass | content/norms/nsh leer, Manifest 0 Einträge, Review 0 Fälle |

