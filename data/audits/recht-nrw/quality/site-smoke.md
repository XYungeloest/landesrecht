# Website-Stichprobe (Smoke) – https://landesrecht-online.de

Erzeugt mit `npm run audit:site` (41 Abrufe). Seitenauswahl deterministisch aus dem Bestand:
ohne Abkürzung = erstes Gesetz ohne `abbr` (Slug-Reihenfolge), längste Norm = meiste Blöcke, VwV = umfangreichste Verwaltungsvorschrift,
Tabellen/Anlagen = Maximum je Kennzahl, Warnungen = meiste Importwarnungen im Manifest. Suchpagination aus der Gesamttrefferzahl der
Anfrage „gesetz“ (Seitengröße 20). Abrufzeiten sind Momentaufnahmen. Prüfstand ist der abgefragte Server: Änderungen an
`apps/web/src` wirken auf der deployten Site erst nach einem Redeploy; lokale Gegenprüfung mit `--base-url http://localhost:<port>`.

| Kennzahl | Wert |
| --- | --- |
| Seiten | 41 |
| Seiten mit Befunden | 0 |
| Abrufzeit Median / Maximum | 177 ms / 3521 ms |
| Auswahl | withoutAbbr: 3-rundfunkaenderungsgesetz-west; longest: avwgebo-west; administrative: zulassung-von-fachverfahren-zur-automatisierten-ausfuehrung-der-west; reconstructed: vv-lhundg-west; mostTables: lostv-west; mostAnnexes: vermgebo-west; mostWarnings: gesetz-ueber-die-fachhochschulen-fuer-den-oeffentlichen-dienst-im-lande-west; reference: lhundg-west |

## Seiten

| Seite | Pfad | HTTP (Soll) | ms | KB | Treffer | Befunde |
| --- | --- | --- | --- | --- | --- | --- |
| start | / | 200 (200) | 238 | 5 |  | ok |
| west | /west/ | 200 (200) | 412 | 187 |  | ok |
| west-type-gesetz | /west/?type=gesetz | 200 (200) | 206 | 179 |  | ok |
| west-type-verordnung | /west/?type=verordnung | 200 (200) | 241 | 311 |  | ok |
| west-type-verwaltungsvorschrift | /west/?type=verwaltungsvorschrift | 200 (200) | 358 | 140 |  | ok |
| west-type-runderlass | /west/?type=runderlass | 200 (200) | 150 | 59 |  | ok |
| nsh | /nsh/ | 200 (200) | 303 | 243 |  | ok |
| ost | /ost/ | 200 (200) | 913 | 243 |  | ok |
| baywue | /bayern-wuerttemberg/ | 200 (200) | 287 | 194 |  | ok |
| search-empty | /suche/ | 200 (200) | 62 | 7 |  | ok |
| search-first | /suche/?q=gesetz&jurisdiction=west | 200 (200) | 1047 | 25 | 20 von 1370 | ok |
| search-type | /suche/?q=gesetz&jurisdiction=west&type=verordnung | 200 (200) | 659 | 29 | 20 von 676 | ok |
| search-filter-only | /suche/?jurisdiction=west&type=verwaltungsvorschrift | 200 (200) | 177 | 30 | 20 von 238 | ok |
| search-structural | /suche/?q=%C2%A7+3+Absatz+2+LHundG&jurisdiction=west | 200 (200) | 689 | 11 | 2 von 2 | ok |
| search-nohit | /suche/?q=xyzzyqwertz&jurisdiction=west | 200 (200) | 140 | 9 | 0 von 0 | ok |
| norm-without-abbr | /west/norm/3-rundfunkaenderungsgesetz-west/ | 200 (200) | 183 | 28 |  | ok |
| norm-longest | /west/norm/avwgebo-west/ | 200 (200) | 352 | 983 |  | ok |
| norm-administrative | /west/norm/zulassung-von-fachverfahren-zur-automatisierten-ausfuehrung-der-west/ | 200 (200) | 210 | 224 |  | ok |
| norm-reconstructed | /west/norm/vv-lhundg-west/ | 200 (200) | 196 | 157 |  | ok |
| norm-most-tables | /west/norm/lostv-west/ | 200 (200) | 129 | 64 |  | ok |
| norm-most-annexes | /west/norm/vermgebo-west/ | 200 (200) | 145 | 95 |  | ok |
| norm-most-warnings | /west/norm/gesetz-ueber-die-fachhochschulen-fuer-den-oeffentlichen-dienst-im-lande-west/ | 200 (200) | 254 | 471 |  | ok |
| norm-reference | /west/norm/lhundg-west/ | 200 (200) | 144 | 62 |  | ok |
| sources-reconstructed | /west/norm/vv-lhundg-west/quellen/ | 200 (200) | 119 | 9 |  | ok |
| sources-reference | /west/norm/lhundg-west/quellen/ | 200 (200) | 116 | 6 |  | ok |
| facts-reference | /west/norm/lhundg-west/daten/ | 200 (200) | 154 | 6 |  | ok |
| history-reference | /west/norm/lhundg-west/historie/ | 200 (200) | 96 | 5 |  | ok |
| compare-reference | /west/norm/lhundg-west/vergleich/ | 200 (200) | 123 | 4 |  | ok |
| version-reference | /west/norm/lhundg-west/version/2023-12-01/ | 200 (200) | 137 | 62 |  | ok |
| help | /hilfe/ | 200 (200) | 64 | 4 |  | ok |
| imprint | /impressum/ | 200 (200) | 63 | 3 |  | ok |
| not-found-norm | /west/norm/diese-norm-gibt-es-nicht/ | 404 (404) | 75 | 3 |  | ok |
| not-found-jurisdiction | /nirgendwo/ | 404 (404) | 53 | 3 |  | ok |
| not-found-version | /west/norm/lhundg-west/version/1999-01-01/ | 404 (404) | 109 | 3 |  | ok |
| api-jurisdictions | /api/v1/jurisdictions | 200 (200) | 356 | 5 |  | ok |
| api-norm | /api/v1/norms/west/lhundg-west | 200 (200) | 123 | 64 |  | ok |
| api-search | /api/v1/search?q=hund&jurisdiction=west | 200 (200) | 239 | 30 |  | ok |
| simrecht | /.well-known/simrecht.json | 200 (200) | 65 | 0 |  | ok |
| robots | /robots.txt | 200 (200) | 61 | 3 |  | ok |
| search-middle | /suche/?q=gesetz&jurisdiction=west&offset=680 | 200 (200) | 2376 | 29 | 20 von 1370 | ok |
| search-last | /suche/?q=gesetz&jurisdiction=west&offset=1360 | 200 (200) | 3521 | 19 | 10 von 1370 | ok |
