# Website-Stichprobe (Smoke) – https://landesrecht-online.de

Erzeugt mit `npm run audit:site` (43 Abrufe). Seitenauswahl deterministisch aus dem Bestand:
ohne Abkürzung = erstes Gesetz ohne `abbr` (Slug-Reihenfolge), längste Norm = meiste Blöcke, VwV = umfangreichste Verwaltungsvorschrift,
Tabellen/Anlagen = Maximum je Kennzahl, Warnungen = meiste Importwarnungen im Manifest. Suchpagination aus der Gesamttrefferzahl der
Anfrage „gesetz“ (Seitengröße 20). Abrufzeiten sind Momentaufnahmen. Prüfstand ist der abgefragte Server: Änderungen an
`apps/web/src` wirken auf der deployten Site erst nach einem Redeploy; lokale Gegenprüfung mit `--base-url http://localhost:<port>`.

| Kennzahl | Wert |
| --- | --- |
| Seiten | 43 |
| Seiten mit Befunden | 0 |
| Abrufzeit Median / Maximum | 149 ms / 3152 ms |
| Auswahl | withoutAbbr: 3-rundfunkaenderungsgesetz-west; longest: avwgebo-west; administrative: zulassung-von-fachverfahren-zur-automatisierten-ausfuehrung-der-west; reconstructed: vv-lhundg-west; mostTables: lostv-west; mostAnnexes: vermgebo-west; mostWarnings: gesetz-ueber-die-fachhochschulen-fuer-den-oeffentlichen-dienst-im-lande-west; reference: lhundg-west |

## Seiten

| Seite | Pfad | HTTP (Soll) | ms | KB | Treffer | Befunde |
| --- | --- | --- | --- | --- | --- | --- |
| start | / | 200 (200) | 643 | 11 |  | ok |
| west | /west/ | 200 (200) | 149 | 22 |  | ok |
| west-changed | /west/?stand=changed | 200 (200) | 160 | 9 |  | ok |
| west-new | /west/?stand=new | 200 (200) | 163 | 21 |  | ok |
| west-type-gesetz | /west/?type=gesetz | 200 (200) | 150 | 20 |  | ok |
| west-type-verordnung | /west/?type=verordnung | 200 (200) | 158 | 22 |  | ok |
| west-type-verwaltungsvorschrift | /west/?type=verwaltungsvorschrift | 200 (200) | 157 | 26 |  | ok |
| west-type-runderlass | /west/?type=runderlass | 200 (200) | 157 | 26 |  | ok |
| nsh | /nsh/ | 200 (200) | 174 | 26 |  | ok |
| ost | /ost/ | 200 (200) | 327 | 25 |  | ok |
| baywue | /bayern-wuerttemberg/ | 200 (200) | 161 | 25 |  | ok |
| search-empty | /suche/ | 200 (200) | 29 | 7 |  | ok |
| search-first | /suche/?q=gesetz&jurisdiction=west | 200 (200) | 497 | 24 | 20 von 1370 | ok |
| search-type | /suche/?q=gesetz&jurisdiction=west&type=verordnung | 200 (200) | 475 | 28 | 20 von 676 | ok |
| search-filter-only | /suche/?jurisdiction=west&type=verwaltungsvorschrift | 200 (200) | 122 | 29 | 20 von 238 | ok |
| search-structural | /suche/?q=%C2%A7+3+Absatz+2+LHundG&jurisdiction=west | 200 (200) | 491 | 10 | 2 von 2 | ok |
| search-nohit | /suche/?q=xyzzyqwertz&jurisdiction=west | 200 (200) | 71 | 8 | 0 von 0 | ok |
| norm-without-abbr | /west/norm/3-rundfunkaenderungsgesetz-west/ | 200 (200) | 132 | 30 |  | ok |
| norm-longest | /west/norm/avwgebo-west/ | 200 (200) | 295 | 986 |  | ok |
| norm-administrative | /west/norm/zulassung-von-fachverfahren-zur-automatisierten-ausfuehrung-der-west/ | 200 (200) | 153 | 228 |  | ok |
| norm-reconstructed | /west/norm/vv-lhundg-west/ | 200 (200) | 122 | 159 |  | ok |
| norm-most-tables | /west/norm/lostv-west/ | 200 (200) | 439 | 66 |  | ok |
| norm-most-annexes | /west/norm/vermgebo-west/ | 200 (200) | 123 | 97 |  | ok |
| norm-most-warnings | /west/norm/gesetz-ueber-die-fachhochschulen-fuer-den-oeffentlichen-dienst-im-lande-west/ | 200 (200) | 208 | 476 |  | ok |
| norm-reference | /west/norm/lhundg-west/ | 200 (200) | 106 | 65 |  | ok |
| sources-reconstructed | /west/norm/vv-lhundg-west/quellen/ | 200 (200) | 110 | 8 |  | ok |
| sources-reference | /west/norm/lhundg-west/quellen/ | 200 (200) | 124 | 7 |  | ok |
| facts-reference | /west/norm/lhundg-west/daten/ | 200 (200) | 87 | 7 |  | ok |
| history-reference | /west/norm/lhundg-west/historie/ | 200 (200) | 79 | 6 |  | ok |
| compare-reference | /west/norm/lhundg-west/vergleich/ | 200 (200) | 95 | 5 |  | ok |
| version-reference | /west/norm/lhundg-west/version/2023-12-01/ | 200 (200) | 111 | 65 |  | ok |
| help | /hilfe/ | 200 (200) | 57 | 5 |  | ok |
| imprint | /impressum/ | 200 (200) | 54 | 3 |  | ok |
| not-found-norm | /west/norm/diese-norm-gibt-es-nicht/ | 404 (404) | 60 | 3 |  | ok |
| not-found-jurisdiction | /nirgendwo/ | 404 (404) | 39 | 3 |  | ok |
| not-found-version | /west/norm/lhundg-west/version/1999-01-01/ | 404 (404) | 74 | 3 |  | ok |
| api-jurisdictions | /api/v1/jurisdictions | 200 (200) | 168 | 5 |  | ok |
| api-norm | /api/v1/norms/west/lhundg-west | 200 (200) | 100 | 64 |  | ok |
| api-search | /api/v1/search?q=hund&jurisdiction=west | 200 (200) | 192 | 32 |  | ok |
| simrecht | /.well-known/simrecht.json | 200 (200) | 29 | 0 |  | ok |
| robots | /robots.txt | 200 (200) | 53 | 3 |  | ok |
| search-middle | /suche/?q=gesetz&jurisdiction=west&offset=680 | 200 (200) | 2272 | 28 | 20 von 1370 | ok |
| search-last | /suche/?q=gesetz&jurisdiction=west&offset=1360 | 200 (200) | 3152 | 18 | 10 von 1370 | ok |
