# Strukturbericht juris Schleswig-Holstein

Erzeugt von `node scripts/import-juris-sh.ts sample --write`. Stichtag **2023-12-01**. Quelle: Bürgerservice Schleswig-Holstein (juris), Simulationsland Niedersachsen-Holstein (`nsh`).

Ergebnis: **content-not-publicly-addressable**.

- 20/20 Proben liefern die leere Startseite der Portaloberfläche (kein sichtbarer Text; Inhalt wird erst per Skript geladen)
- 1 unterschiedliche Antwortkörper über alle Dokumente und Formen – die Antwort hängt nicht vom Dokument ab
- Die Oberfläche lädt Dokumente über /jportal/wsrest/recherche3/ (Build-Konfiguration VITE_apiPath) mit X-CSRF-TOKEN und JURIS-PORTALID, Sitzungscookie (credentials: include) – interne, nicht dokumentierte Schnittstelle; nach der Zugriffspolitik nicht benutzt

## 1 Probe der dokumentierten Adressformen

| Dokument | Form | HTTP | Bytes | SHA-256 | Ergebnis | sichtbarer Text |
| --- | --- | --- | --- | --- | --- | --- |
| `jlr-NNLSH00002D11` | document | 200 | 5353 | `ad4afe0ffcb2f294…` | spa-shell | 0 |
| `jlr-NNLSH00002D11` | document-part | 200 | 5353 | `ad4afe0ffcb2f294…` | spa-shell | 0 |
| `jlr-NNLSH00002D11` | xsl | 200 | 5353 | `ad4afe0ffcb2f294…` | spa-shell | 0 |
| `jlr-NNLSH00002D11` | xsl-part | 200 | 5353 | `ad4afe0ffcb2f294…` | spa-shell | 0 |
| `jlr-NNLSH00002E60` | document | 200 | 5353 | `ad4afe0ffcb2f294…` | spa-shell | 0 |
| `jlr-NNLSH00002E60` | document-part | 200 | 5353 | `ad4afe0ffcb2f294…` | spa-shell | 0 |
| `jlr-NNLSH00002E60` | xsl | 200 | 5353 | `ad4afe0ffcb2f294…` | spa-shell | 0 |
| `jlr-NNLSH00002E60` | xsl-part | 200 | 5353 | `ad4afe0ffcb2f294…` | spa-shell | 0 |
| `jlr-NNLSH00002A6ENN00000000001` | document | 200 | 5353 | `ad4afe0ffcb2f294…` | spa-shell | 0 |
| `jlr-NNLSH00002A6ENN00000000001` | document-part | 200 | 5353 | `ad4afe0ffcb2f294…` | spa-shell | 0 |
| `jlr-NNLSH00002A6ENN00000000001` | xsl | 200 | 5353 | `ad4afe0ffcb2f294…` | spa-shell | 0 |
| `jlr-NNLSH00002A6ENN00000000001` | xsl-part | 200 | 5353 | `ad4afe0ffcb2f294…` | spa-shell | 0 |
| `VVSH-VVSH000000003` | document | 200 | 5353 | `ad4afe0ffcb2f294…` | spa-shell | 0 |
| `VVSH-VVSH000000003` | document-part | 200 | 5353 | `ad4afe0ffcb2f294…` | spa-shell | 0 |
| `VVSH-VVSH000000003` | xsl | 200 | 5353 | `ad4afe0ffcb2f294…` | spa-shell | 0 |
| `VVSH-VVSH000000003` | xsl-part | 200 | 5353 | `ad4afe0ffcb2f294…` | spa-shell | 0 |
| `jlr-FFNInhaltSH` | document | 200 | 5353 | `ad4afe0ffcb2f294…` | spa-shell | 0 |
| `jlr-FFNInhaltSH` | document-part | 200 | 5353 | `ad4afe0ffcb2f294…` | spa-shell | 0 |
| `jlr-FFNInhaltSH` | xsl | 200 | 5353 | `ad4afe0ffcb2f294…` | spa-shell | 0 |
| `jlr-FFNInhaltSH` | xsl-part | 200 | 5353 | `ad4afe0ffcb2f294…` | spa-shell | 0 |

Zusammenfassung: 20 Proben · spa-shell 20 · content 0 · gesperrt 0 · Challenge 0 · 404 0 · Fehler 0 · unterschiedliche Antwortkörper 1.

Merkmale der Antwort: leerer Anwendungscontainer #main (aria-busy); Ladehinweis „Der Bürgerservice wird gestartet“ (per Skript geschrieben); noscript-Hinweis: JavaScript erforderlich; 1 Modulskript(e) der Oberfläche. Portalversion bssh - V08_35_00; TDM-Vorbehalt gesetzt.

## 2 Woher die Oberfläche den Inhalt lädt (Beleg, nicht benutzt)

| Skript | Bytes | SHA-256 |
| --- | --- | --- |
| https://www.gesetze-rechtsprechung.sh.juris.de/bssh/assets/index-DOz5oJJV.js | 459873 | `4f0b8c57f85a3cbc…` |
| https://www.gesetze-rechtsprechung.sh.juris.de/bssh/assets/src-CLre2rpU.js | 4464335 | `73b10a6cd931a18a…` |

- Build-Konfiguration: `` VITE_apiPath:`/jportal/wsrest/recherche3/` `` → Schnittstelle `/jportal/wsrest/recherche3/`, Portalkennung `bssh`
- Anfrageform: POST mit JSON-Körper; Kopfzeile `JURIS-PORTALID` ja, `X-CSRF-TOKEN` ja, Sitzungscookie (`credentials: include`) ja; Dokumentinhalt als `format: xsl` über diese Schnittstelle ja

Diese Schnittstelle ist nicht dokumentiert (in keiner Hilfeseite, keiner Adressform des Dossiers) und sitzungsgebunden. Nach der Zugriffspolitik (docs/SCHLESWIG_HOLSTEIN_ACCESS_CONSTRAINT.md) wird sie **nicht** benutzt; der Fetcher des Adapters verweigert `/jportal/wsrest/…` und `/api/…` technisch.

## 3 Vollkorpus-Strukturinventur

**Nicht durchführbar.** Ohne abrufbaren Normtext gibt es keine Rohquelle, keinen Parserlauf, keine Strukturcluster und keine Textintegritätsprüfung (exact/normalisiert/erklärt/review/mismatch: jeweils 0 von 0). Parser-ready: **nein**. Es werden keine Fixtures aus Ersatzquellen gebaut.

