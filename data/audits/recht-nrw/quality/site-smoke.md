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
| Abrufzeit Median / Maximum | 197 ms / 3428 ms |
| Auswahl | withoutAbbr: 3-rundfunkaenderungsgesetz-west; longest: avwgebo-west; administrative: zulassung-von-fachverfahren-zur-automatisierten-ausfuehrung-der-west; reconstructed: vv-lhundg-west; mostTables: lostv-west; mostAnnexes: vermgebo-west; mostWarnings: gesetz-ueber-die-fachhochschulen-fuer-den-oeffentlichen-dienst-im-lande-west; reference: lhundg-west |

## Seiten

| Seite | Pfad | HTTP (Soll) | ms | KB | Treffer | Befunde |
| --- | --- | --- | --- | --- | --- | --- |
| start | / | 200 (200) | 560 | 12 |  | ok |
| west | /west/ | 200 (200) | 228 | 25 |  | ok |
| west-changed | /west/?stand=changed | 200 (200) | 204 | 11 |  | ok |
| west-new | /west/?stand=new | 200 (200) | 203 | 25 |  | ok |
| west-type-gesetz | /west/?type=gesetz | 200 (200) | 214 | 23 |  | ok |
| west-type-verordnung | /west/?type=verordnung | 200 (200) | 197 | 25 |  | ok |
| west-type-verwaltungsvorschrift | /west/?type=verwaltungsvorschrift | 200 (200) | 299 | 29 |  | ok |
| west-type-runderlass | /west/?type=runderlass | 200 (200) | 265 | 29 |  | ok |
| nsh | /nsh/ | 200 (200) | 166 | 29 |  | ok |
| ost | /ost/ | 200 (200) | 429 | 29 |  | ok |
| baywue | /bayern-wuerttemberg/ | 200 (200) | 281 | 28 |  | ok |
| search-empty | /suche/ | 200 (200) | 529 | 10 |  | ok |
| search-first | /suche/?q=gesetz&jurisdiction=west | 200 (200) | 714 | 24 | 20 von 1186 | ok |
| search-type | /suche/?q=gesetz&jurisdiction=west&type=verordnung | 200 (200) | 512 | 28 | 20 von 676 | ok |
| search-filter-only | /suche/?jurisdiction=west&type=verwaltungsvorschrift | 200 (200) | 148 | 29 | 20 von 238 | ok |
| search-structural | /suche/?q=%C2%A7+3+Absatz+2+LHundG&jurisdiction=west | 200 (200) | 410 | 11 | 2 von 2 | ok |
| search-nohit | /suche/?q=xyzzyqwertz&jurisdiction=west | 200 (200) | 122 | 10 | 0 von 0 | ok |
| norm-without-abbr | /west/norm/3-rundfunkaenderungsgesetz-west/ | 200 (200) | 152 | 103 |  | ok |
| norm-longest | /west/norm/avwgebo-west/ | 200 (200) | 388 | 1182 |  | ok |
| norm-administrative | /west/norm/zulassung-von-fachverfahren-zur-automatisierten-ausfuehrung-der-west/ | 200 (200) | 175 | 262 |  | ok |
| norm-reconstructed | /west/norm/vv-lhundg-west/ | 200 (200) | 176 | 176 |  | ok |
| norm-most-tables | /west/norm/lostv-west/ | 200 (200) | 158 | 86 |  | ok |
| norm-most-annexes | /west/norm/vermgebo-west/ | 200 (200) | 225 | 132 |  | ok |
| norm-most-warnings | /west/norm/gesetz-ueber-die-fachhochschulen-fuer-den-oeffentlichen-dienst-im-lande-west/ | 200 (200) | 205 | 656 |  | ok |
| norm-reference | /west/norm/lhundg-west/ | 200 (200) | 247 | 120 |  | ok |
| sources-reconstructed | /west/norm/vv-lhundg-west/quellen/ | 200 (200) | 114 | 9 |  | ok |
| sources-reference | /west/norm/lhundg-west/quellen/ | 200 (200) | 100 | 7 |  | ok |
| facts-reference | /west/norm/lhundg-west/daten/ | 200 (200) | 104 | 7 |  | ok |
| history-reference | /west/norm/lhundg-west/historie/ | 200 (200) | 83 | 7 |  | ok |
| compare-reference | /west/norm/lhundg-west/vergleich/ | 200 (200) | 108 | 6 |  | ok |
| version-reference | /west/norm/lhundg-west/version/2023-12-01/ | 200 (200) | 604 | 121 |  | ok |
| help | /hilfe/ | 200 (200) | 42 | 5 |  | ok |
| imprint | /impressum/ | 200 (200) | 36 | 4 |  | ok |
| not-found-norm | /west/norm/diese-norm-gibt-es-nicht/ | 404 (404) | 50 | 4 |  | ok |
| not-found-jurisdiction | /nirgendwo/ | 404 (404) | 38 | 4 |  | ok |
| not-found-version | /west/norm/lhundg-west/version/1999-01-01/ | 404 (404) | 88 | 4 |  | ok |
| api-jurisdictions | /api/v1/jurisdictions | 200 (200) | 174 | 5 |  | ok |
| api-norm | /api/v1/norms/west/lhundg-west | 200 (200) | 105 | 64 |  | ok |
| api-search | /api/v1/search?q=hund&jurisdiction=west | 200 (200) | 209 | 32 |  | ok |
| simrecht | /.well-known/simrecht.json | 200 (200) | 28 | 0 |  | ok |
| robots | /robots.txt | 200 (200) | 30 | 3 |  | ok |
| search-middle | /suche/?q=gesetz&jurisdiction=west&offset=580 | 200 (200) | 3034 | 28 | 20 von 1186 | ok |
| search-last | /suche/?q=gesetz&jurisdiction=west&offset=1180 | 200 (200) | 3428 | 16 | 6 von 1186 | ok |
