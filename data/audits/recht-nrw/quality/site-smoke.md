# Website-Stichprobe (Smoke) – https://landesrecht.xyungeloestlp.workers.dev

Erzeugt mit `npm run audit:site` (0 Abrufe, 41 aus lokalem HTML-Cache). Seitenauswahl deterministisch aus dem Bestand:
ohne Abkürzung = erstes Gesetz ohne `abbr` (Slug-Reihenfolge), längste Norm = meiste Blöcke, VwV = umfangreichste Verwaltungsvorschrift,
Tabellen/Anlagen = Maximum je Kennzahl, Warnungen = meiste Importwarnungen im Manifest. Suchpagination aus der Gesamttrefferzahl der
Anfrage „gesetz“ (Seitengröße 20). Abrufzeiten sind Momentaufnahmen. Prüfstand ist der abgefragte Server: Änderungen an
`apps/web/src` wirken auf der deployten Site erst nach einem Redeploy; lokale Gegenprüfung mit `--base-url http://localhost:<port>`.

| Kennzahl | Wert |
| --- | --- |
| Seiten | 41 |
| Seiten mit Befunden | 6 |
| Abrufzeit Median / Maximum | 169 ms / 1032 ms |
| Auswahl | withoutAbbr: 3-rundfunkaenderungsgesetz-west; longest: sbauvo-west; administrative: zulassung-von-fachverfahren-zur-automatisierten-ausfuehrung-der-west; reconstructed: vv-lhundg-west; mostTables: lostv-west; mostAnnexes: vermgebo-west; mostWarnings: gesetz-ueber-die-fachhochschulen-fuer-den-oeffentlichen-dienst-im-lande-west; reference: lhundg-west |

## Seiten

| Seite | Pfad | HTTP (Soll) | ms | KB | Treffer | Befunde |
| --- | --- | --- | --- | --- | --- | --- |
| start | / | 200 (200) | 218 | 4 |  | ok |
| west | /west/ | 200 (200) | 1032 | 187 |  | ok |
| west-type-gesetz | /west/?type=gesetz | 200 (200) | 171 | 166 |  | ok |
| west-type-verordnung | /west/?type=verordnung | 200 (200) | 184 | 304 |  | ok |
| west-type-verwaltungsvorschrift | /west/?type=verwaltungsvorschrift | 200 (200) | 169 | 111 |  | ok |
| west-type-runderlass | /west/?type=runderlass | 200 (200) | 121 | 56 |  | ok |
| nsh | /nsh/ | 500 (200) | 318 | 0 |  | HTTP 500 statt 200; Serverfehler (leerer Antwortkörper) |
| ost | /ost/ | 500 (200) | 206 | 0 |  | HTTP 500 statt 200; Serverfehler (leerer Antwortkörper) |
| baywue | /bayern-wuerttemberg/ | 500 (200) | 183 | 0 |  | HTTP 500 statt 200; Serverfehler (leerer Antwortkörper) |
| search-empty | /suche/ | 200 (200) | 49 | 5 |  | ok |
| search-first | /suche/?q=gesetz&jurisdiction=west | 200 (200) | 650 | 20 | 20 von 1287 | ok |
| search-type | /suche/?q=gesetz&jurisdiction=west&type=verordnung | 200 (200) | 639 | 21 | 20 von 667 | ok |
| search-filter-only | /suche/?jurisdiction=west&type=verwaltungsvorschrift | 200 (200) | 141 | 25 | 20 von 198 | ok |
| search-structural | /suche/?q=%C2%A7+3+Absatz+2+LHundG&jurisdiction=west | 200 (200) | 275 | 7 | 2 von 2 | ok |
| search-nohit | /suche/?q=xyzzyqwertz&jurisdiction=west | 200 (200) | 117 | 5 | 0 von 0 | ok |
| norm-without-abbr | /west/norm/3-rundfunkaenderungsgesetz-west/ | 200 (200) | 165 | 27 |  | ok |
| norm-longest | /west/norm/sbauvo-west/ | 200 (200) | 315 | 539 |  | ok |
| norm-administrative | /west/norm/zulassung-von-fachverfahren-zur-automatisierten-ausfuehrung-der-west/ | 200 (200) | 290 | 223 |  | ok |
| norm-reconstructed | /west/norm/vv-lhundg-west/ | 200 (200) | 211 | 156 |  | ok |
| norm-most-tables | /west/norm/lostv-west/ | 200 (200) | 134 | 62 |  | 1 A11y-Fehler |
| norm-most-annexes | /west/norm/vermgebo-west/ | 200 (200) | 212 | 93 |  | ok |
| norm-most-warnings | /west/norm/gesetz-ueber-die-fachhochschulen-fuer-den-oeffentlichen-dienst-im-lande-west/ | 200 (200) | 266 | 465 |  | 1 A11y-Fehler |
| norm-reference | /west/norm/lhundg-west/ | 200 (200) | 162 | 60 |  | ok |
| sources-reconstructed | /west/norm/vv-lhundg-west/quellen/ | 200 (200) | 154 | 9 |  | ok |
| sources-reference | /west/norm/lhundg-west/quellen/ | 200 (200) | 118 | 6 |  | ok |
| facts-reference | /west/norm/lhundg-west/daten/ | 200 (200) | 205 | 5 |  | ok |
| history-reference | /west/norm/lhundg-west/historie/ | 200 (200) | 100 | 4 |  | ok |
| compare-reference | /west/norm/lhundg-west/vergleich/ | 200 (200) | 123 | 3 |  | ok |
| version-reference | /west/norm/lhundg-west/version/2023-12-01/ | 200 (200) | 154 | 60 |  | ok |
| help | /hilfe/ | 200 (200) | 52 | 3 |  | ok |
| imprint | /impressum/ | 200 (200) | 85 | 2 |  | ok |
| not-found-norm | /west/norm/diese-norm-gibt-es-nicht/ | 404 (404) | 83 | 2 |  | ok |
| not-found-jurisdiction | /nirgendwo/ | 404 (404) | 48 | 2 |  | ok |
| not-found-version | /west/norm/lhundg-west/version/1999-01-01/ | 404 (404) | 90 | 2 |  | ok |
| api-jurisdictions | /api/v1/jurisdictions | 404 (200) | 318 | 2 |  | HTTP 404 statt 200; keine gültige JSON-Antwort |
| api-norm | /api/v1/norms/west/lhundg-west | 200 (200) | 128 | 64 |  | ok |
| api-search | /api/v1/search?q=hund&jurisdiction=west | 200 (200) | 191 | 23 |  | ok |
| simrecht | /.well-known/simrecht.json | 200 (200) | 48 | 0 |  | ok |
| robots | /robots.txt | 200 (200) | 60 | 0 |  | ok |
| search-middle | /suche/?q=gesetz&jurisdiction=west&offset=640 | 200 (200) | 489 | 20 | 20 von 1287 | ok |
| search-last | /suche/?q=gesetz&jurisdiction=west&offset=1280 | 200 (200) | 497 | 12 | 7 von 1287 | ok |
