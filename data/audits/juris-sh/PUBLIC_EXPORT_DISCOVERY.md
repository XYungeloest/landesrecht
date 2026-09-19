# Public Export Discovery juris Schleswig-Holstein

Erzeugt von `node scripts/import-juris-sh.ts sample --write`. Stichtag **2023-12-01**. Quelle: Bürgerservice Schleswig-Holstein (juris), Simulationsland Niedersachsen-Holstein (`nsh`).

Ergebnis: **public-export-available**. 23 Normen, 143 Proben (spa-shell 117, session-required 25, pdf 1). Die interne Schnittstelle `/jportal/wsrest/…` wurde nicht aufgerufen.

- 1 Probe(n) liefern Inhalt (pdf-export-with-session) über eine öffentliche GET-Adresse

## 1 Wie die Oberfläche Ausgaben anfordert (statische Analyse der Skriptbündel)

| Funktion | Anfrage laut Bündel | Sitzung/CSRF |
| --- | --- | --- |
| Dokument laden (Text, Metadaten) | POST `/jportal/wsrest/recherche3/document` mit JSON `{docId, format: "xsl", keyword, sourceParams}` | Sitzungscookie (`credentials: include`), Kopf `JURIS-PORTALID`, `X-CSRF-TOKEN` – belegt |
| Initialisierung | POST `/jportal/wsrest/recherche3/init` | liefert das CSRF-Token (`csrfToken`) – belegt |
| PDF speichern | GET-Link `/jportal/<pdfUrl>` in neuem Fenster – belegt; `pdfUrl` stammt aus der Dokumentantwort | kein CSRF-Kopf (Navigation), Browser sendet Sitzungscookie |
| Word/RTF, Originaldokument, HTML-Ansicht, Gesamtausgabe-ZIP | GET-Links auf `/jportal/<…Url>`; Felder `aizZipUrl`, `htmlUrl`, `pdfUrl`, `rtfUrl`, `sourceUrl` aus der Dokumentantwort | wie PDF |
| Drucken | Route der Oberfläche `/bssh/print/document`, gerendert aus dem geladenen Dokumentzustand | keine eigene Serveranfrage |
| Permalink | Text aus der Dokumentantwort (`content.permalink`) – belegt; `/perma?d=`, `/perma?a=` leiten serverseitig auf `/bssh/?…` um | keine |

Die Oberfläche bildet keine Ausgabeadresse selbst: Alle Adressen kommen aus der Antwort der internen Dokumentschnittstelle. Geprüft wurde deshalb die Ausgabeadresse der juris-Plattform `GET /jportal/recherche3doc/<Name>.<pdf|rtf|html>?json={format, docPart: "X", docId, portalId: "bssh"}` – ohne Cookie, ohne CSRF.

## 2 Proben je Norm

| DOKNR | Norm (Einordnung laut Suchindex) | Merkmale | document | part/X | xsl | xsl/part/X | perma?d | PDF-Export |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `jlr-NNLSH00002D11` | Verf SH 2014 – Landesverfassung (Suchindex) | verfassung, aenderungshistorie | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `jlr-NNLSH00002B40` | LVwG – Landesgesetz, groß (Suchindex) | gesetz, grosse-norm, aenderungshistorie | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `jlr-NNLSH00002AAF` | SchulG – Landesgesetz, groß (Suchindex) | gesetz, grosse-norm | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `jlr-NNLSH00002E60` | LWaldG – Landesgesetz (Suchindex) | gesetz | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `jlr-NNLSH00002DF2` | VerfSchG SH – Landesgesetz (Suchindex) | gesetz | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `jlr-NNLSH00002A85` | größtes Rahmendokument der Sitemap (Titel ohne Inhalt unbekannt) | grosse-norm | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `jlr-NNLSH00002D66` | LVO-Bildung – Landesverordnung (Suchindex) | verordnung | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `jlr-NNLSH00002B25` | BauGebVO – Landesverordnung mit Anlage/Tabelle (Suchindex) | verordnung, anlage-tabelle | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `jlr-NNLSH00002F02` | BhVO – Landesverordnung mit Anlage/Tabelle (Suchindex) | verordnung, anlage-tabelle | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `jlr-NNLSH00002B66` | KampfmV SH 2012 – Landesverordnung mit Anlage (Suchindex) | verordnung, anlage-tabelle, aenderungshistorie | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `jlr-NNLSH00003051` | KrummNatSchV SH 2013 – Naturschutz-Landesverordnung (Suchindex) | verordnung, anlage-tabelle | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `jlr-NNLSH00002D40` | EB-WahlVO – Landesverordnung (Suchindex) | verordnung | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `jlr-NNLSH00002BC4` | ZVO – Landesverordnung (Suchindex) | verordnung, aenderungshistorie | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `jlr-NNLSH00002AA1` | PersRWahlV SH 2018 – Landesverordnung (Suchindex) | verordnung, aenderungshistorie | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `jlr-NNLSH000033AF` | CoronaVQuarV SH 2 – außer Kraft getretene Landesverordnung (Suchindex) | verordnung, aufgehoben | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `jlr-NNLSH00003321` | BauAufsÜV SH 2022 – Landesverordnung (Suchindex) | verordnung | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `jlr-NNLSH00002B00` | EntschVO – Landesverordnung (Suchindex) | verordnung | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `jlr-NNLSH00002D22` | GemSchulV SH 2024 – Landesverordnung, klein (Suchindex) | verordnung | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `VVSH-VVSH000004586` | VwV „Durchführung der gemeindlichen Selbstverwaltungsaufgaben durch das Amt“ (Suchindex) | vwv | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `VVSH-VVSH000000003` | VwV (erste der Sitemap) | vwv | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `VVSH-VVSH000001829` | VwV (Sitemap, Position 501) | vwv | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `VVSH-VVSH000007253` | VwV (Sitemap, Position 1201) | vwv | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |
| `VVSH-VVSH000010460` | VwV (letzte der Sitemap) | vwv | spa-shell | spa-shell | spa-shell | spa-shell | spa-shell | session-required |

### Ausgabeadressen

| Form | Dokument | HTTP | Typ | Ergebnis | Antworttext |
| --- | --- | --- | --- | --- | --- |
| pdf-export | `jlr-NNLSH00002D11` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `jlr-NNLSH00002B40` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `jlr-NNLSH00002AAF` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `jlr-NNLSH00002E60` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `jlr-NNLSH00002DF2` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `jlr-NNLSH00002A85` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `jlr-NNLSH00002D66` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `jlr-NNLSH00002B25` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `jlr-NNLSH00002F02` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `jlr-NNLSH00002B66` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `jlr-NNLSH00003051` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `jlr-NNLSH00002D40` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `jlr-NNLSH00002BC4` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `jlr-NNLSH00002AA1` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `jlr-NNLSH000033AF` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `jlr-NNLSH00003321` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `jlr-NNLSH00002B00` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `jlr-NNLSH00002D22` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `VVSH-VVSH000004586` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `VVSH-VVSH000000003` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `VVSH-VVSH000001829` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `VVSH-VVSH000007253` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export | `VVSH-VVSH000010460` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| rtf-export | `jlr-NNLSH00002D11` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| html-export | `jlr-NNLSH00002D11` | 200 | text/plain;charset=ISO-8859-1 | session-required | Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde. Zur Ausgabe des gewünschten Dokumentes muss die Recherche erneut durchgeführt werden. |
| pdf-export-with-session | `jlr-NNLSH00002D11` | 200 | application/pdf | pdf |  |

## 3 Sitzung und Cookies

Öffentliche Seitenaufrufe (Dokumentseiten, Permalinks) in diesem Lauf mit Netzabruf: 62, davon mit `Set-Cookie`: 23. Die Ausgabeadresse setzt eine neue Sitzung (`JSESSIONID`): ja. Cookie-Werte werden nicht gespeichert.

| Form | Pfad | HTTP | Set-Cookie (ohne Wert) |
| --- | --- | --- | --- |
| perma-d | /jportal/perma?portal=bssh&d=jlr-NNLSH00002D11 | 302 | OAuth_Token_Request_State; Path=/; HttpOnly · JSESSIONID; Path=/; Secure · LASTACCESS; Version=1; Path=/jportal/ · jwtCookie; Expires=Fri, 18 Sep 2026 16:01:46 GMT; Path=/ |
| pdf-export | /jportal/recherche3doc/jlr_NNLSH00002D11.pdf?json=%7B%22format%22%3A%22pdf%22%2C%22docPart%22%3A%22X%22%2C%22docId%22%3A%22jlr-NNLSH00002D11%22%2C%22portalId%22%3A%22bssh%22%7D&_=%2Fjlr_NNLSH00002D11.pdf | 200 | JSESSIONID; Path=/; Secure |
| perma-d | /jportal/perma?portal=bssh&d=jlr-NNLSH00002B40 | 302 | OAuth_Token_Request_State; Path=/; HttpOnly · JSESSIONID; Path=/; Secure · LASTACCESS; Version=1; Path=/jportal/ · jwtCookie; Expires=Fri, 18 Sep 2026 16:01:50 GMT; Path=/ |
| pdf-export | /jportal/recherche3doc/jlr_NNLSH00002B40.pdf?json=%7B%22format%22%3A%22pdf%22%2C%22docPart%22%3A%22X%22%2C%22docId%22%3A%22jlr-NNLSH00002B40%22%2C%22portalId%22%3A%22bssh%22%7D&_=%2Fjlr_NNLSH00002B40.pdf | 200 | JSESSIONID; Path=/; Secure |
| perma-d | /jportal/perma?portal=bssh&d=jlr-NNLSH00002AAF | 302 | OAuth_Token_Request_State; Path=/; HttpOnly · JSESSIONID; Path=/; Secure · LASTACCESS; Version=1; Path=/jportal/ · jwtCookie; Expires=Fri, 18 Sep 2026 16:01:56 GMT; Path=/ |
| pdf-export | /jportal/recherche3doc/jlr_NNLSH00002AAF.pdf?json=%7B%22format%22%3A%22pdf%22%2C%22docPart%22%3A%22X%22%2C%22docId%22%3A%22jlr-NNLSH00002AAF%22%2C%22portalId%22%3A%22bssh%22%7D&_=%2Fjlr_NNLSH00002AAF.pdf | 200 | JSESSIONID; Path=/; Secure |
| perma-d | /jportal/perma?portal=bssh&d=jlr-NNLSH00002E60 | 302 | OAuth_Token_Request_State; Path=/; HttpOnly · JSESSIONID; Path=/; Secure · LASTACCESS; Version=1; Path=/jportal/ · jwtCookie; Expires=Fri, 18 Sep 2026 16:01:58 GMT; Path=/ |
| pdf-export | /jportal/recherche3doc/jlr_NNLSH00002E60.pdf?json=%7B%22format%22%3A%22pdf%22%2C%22docPart%22%3A%22X%22%2C%22docId%22%3A%22jlr-NNLSH00002E60%22%2C%22portalId%22%3A%22bssh%22%7D&_=%2Fjlr_NNLSH00002E60.pdf | 200 | JSESSIONID; Path=/; Secure |
| perma-d | /jportal/perma?portal=bssh&d=jlr-NNLSH00002DF2 | 302 | OAuth_Token_Request_State; Path=/; HttpOnly · JSESSIONID; Path=/; Secure · LASTACCESS; Version=1; Path=/jportal/ · jwtCookie; Expires=Fri, 18 Sep 2026 16:02:04 GMT; Path=/ |
| pdf-export | /jportal/recherche3doc/jlr_NNLSH00002DF2.pdf?json=%7B%22format%22%3A%22pdf%22%2C%22docPart%22%3A%22X%22%2C%22docId%22%3A%22jlr-NNLSH00002DF2%22%2C%22portalId%22%3A%22bssh%22%7D&_=%2Fjlr_NNLSH00002DF2.pdf | 200 | JSESSIONID; Path=/; Secure |
| perma-d | /jportal/perma?portal=bssh&d=jlr-NNLSH00002A85 | 302 | OAuth_Token_Request_State; Path=/; HttpOnly · JSESSIONID; Path=/; Secure · LASTACCESS; Version=1; Path=/jportal/ · jwtCookie; Expires=Fri, 18 Sep 2026 16:02:10 GMT; Path=/ |
| pdf-export | /jportal/recherche3doc/jlr_NNLSH00002A85.pdf?json=%7B%22format%22%3A%22pdf%22%2C%22docPart%22%3A%22X%22%2C%22docId%22%3A%22jlr-NNLSH00002A85%22%2C%22portalId%22%3A%22bssh%22%7D&_=%2Fjlr_NNLSH00002A85.pdf | 200 | JSESSIONID; Path=/; Secure |
| perma-d | /jportal/perma?portal=bssh&d=jlr-NNLSH00002D66 | 302 | OAuth_Token_Request_State; Path=/; HttpOnly · JSESSIONID; Path=/; Secure · LASTACCESS; Version=1; Path=/jportal/ · jwtCookie; Expires=Fri, 18 Sep 2026 16:02:16 GMT; Path=/ |
| pdf-export | /jportal/recherche3doc/jlr_NNLSH00002D66.pdf?json=%7B%22format%22%3A%22pdf%22%2C%22docPart%22%3A%22X%22%2C%22docId%22%3A%22jlr-NNLSH00002D66%22%2C%22portalId%22%3A%22bssh%22%7D&_=%2Fjlr_NNLSH00002D66.pdf | 200 | JSESSIONID; Path=/; Secure |
| perma-d | /jportal/perma?portal=bssh&d=jlr-NNLSH00002B25 | 302 | OAuth_Token_Request_State; Path=/; HttpOnly · JSESSIONID; Path=/; Secure · LASTACCESS; Version=1; Path=/jportal/ · jwtCookie; Expires=Fri, 18 Sep 2026 16:02:23 GMT; Path=/ |
| pdf-export | /jportal/recherche3doc/jlr_NNLSH00002B25.pdf?json=%7B%22format%22%3A%22pdf%22%2C%22docPart%22%3A%22X%22%2C%22docId%22%3A%22jlr-NNLSH00002B25%22%2C%22portalId%22%3A%22bssh%22%7D&_=%2Fjlr_NNLSH00002B25.pdf | 200 | JSESSIONID; Path=/; Secure |
| perma-d | /jportal/perma?portal=bssh&d=jlr-NNLSH00002F02 | 302 | OAuth_Token_Request_State; Path=/; HttpOnly · JSESSIONID; Path=/; Secure · LASTACCESS; Version=1; Path=/jportal/ · jwtCookie; Expires=Fri, 18 Sep 2026 16:02:28 GMT; Path=/ |
| pdf-export | /jportal/recherche3doc/jlr_NNLSH00002F02.pdf?json=%7B%22format%22%3A%22pdf%22%2C%22docPart%22%3A%22X%22%2C%22docId%22%3A%22jlr-NNLSH00002F02%22%2C%22portalId%22%3A%22bssh%22%7D&_=%2Fjlr_NNLSH00002F02.pdf | 200 | JSESSIONID; Path=/; Secure |
| perma-d | /jportal/perma?portal=bssh&d=jlr-NNLSH00002B66 | 302 | OAuth_Token_Request_State; Path=/; HttpOnly · JSESSIONID; Path=/; Secure · LASTACCESS; Version=1; Path=/jportal/ · jwtCookie; Expires=Fri, 18 Sep 2026 16:02:35 GMT; Path=/ |
| pdf-export | /jportal/recherche3doc/jlr_NNLSH00002B66.pdf?json=%7B%22format%22%3A%22pdf%22%2C%22docPart%22%3A%22X%22%2C%22docId%22%3A%22jlr-NNLSH00002B66%22%2C%22portalId%22%3A%22bssh%22%7D&_=%2Fjlr_NNLSH00002B66.pdf | 200 | JSESSIONID; Path=/; Secure |
| perma-d | /jportal/perma?portal=bssh&d=jlr-NNLSH00003051 | 302 | OAuth_Token_Request_State; Path=/; HttpOnly · JSESSIONID; Path=/; Secure · LASTACCESS; Version=1; Path=/jportal/ · jwtCookie; Expires=Fri, 18 Sep 2026 16:02:40 GMT; Path=/ |
| pdf-export | /jportal/recherche3doc/jlr_NNLSH00003051.pdf?json=%7B%22format%22%3A%22pdf%22%2C%22docPart%22%3A%22X%22%2C%22docId%22%3A%22jlr-NNLSH00003051%22%2C%22portalId%22%3A%22bssh%22%7D&_=%2Fjlr_NNLSH00003051.pdf | 200 | JSESSIONID; Path=/; Secure |
| perma-d | /jportal/perma?portal=bssh&d=jlr-NNLSH00002D40 | 302 | OAuth_Token_Request_State; Path=/; HttpOnly · JSESSIONID; Path=/; Secure · LASTACCESS; Version=1; Path=/jportal/ · jwtCookie; Expires=Fri, 18 Sep 2026 16:02:46 GMT; Path=/ |
| pdf-export | /jportal/recherche3doc/jlr_NNLSH00002D40.pdf?json=%7B%22format%22%3A%22pdf%22%2C%22docPart%22%3A%22X%22%2C%22docId%22%3A%22jlr-NNLSH00002D40%22%2C%22portalId%22%3A%22bssh%22%7D&_=%2Fjlr_NNLSH00002D40.pdf | 200 | JSESSIONID; Path=/; Secure |
| perma-d | /jportal/perma?portal=bssh&d=jlr-NNLSH00002BC4 | 302 | OAuth_Token_Request_State; Path=/; HttpOnly · JSESSIONID; Path=/; Secure · LASTACCESS; Version=1; Path=/jportal/ · jwtCookie; Expires=Fri, 18 Sep 2026 16:02:53 GMT; Path=/ |
| pdf-export | /jportal/recherche3doc/jlr_NNLSH00002BC4.pdf?json=%7B%22format%22%3A%22pdf%22%2C%22docPart%22%3A%22X%22%2C%22docId%22%3A%22jlr-NNLSH00002BC4%22%2C%22portalId%22%3A%22bssh%22%7D&_=%2Fjlr_NNLSH00002BC4.pdf | 200 | JSESSIONID; Path=/; Secure |
| perma-d | /jportal/perma?portal=bssh&d=jlr-NNLSH00002AA1 | 302 | OAuth_Token_Request_State; Path=/; HttpOnly · JSESSIONID; Path=/; Secure · LASTACCESS; Version=1; Path=/jportal/ · jwtCookie; Expires=Fri, 18 Sep 2026 16:02:59 GMT; Path=/ |
| pdf-export | /jportal/recherche3doc/jlr_NNLSH00002AA1.pdf?json=%7B%22format%22%3A%22pdf%22%2C%22docPart%22%3A%22X%22%2C%22docId%22%3A%22jlr-NNLSH00002AA1%22%2C%22portalId%22%3A%22bssh%22%7D&_=%2Fjlr_NNLSH00002AA1.pdf | 200 | JSESSIONID; Path=/; Secure |
| perma-d | /jportal/perma?portal=bssh&d=jlr-NNLSH000033AF | 302 | OAuth_Token_Request_State; Path=/; HttpOnly · JSESSIONID; Path=/; Secure · LASTACCESS; Version=1; Path=/jportal/ · jwtCookie; Expires=Fri, 18 Sep 2026 16:03:04 GMT; Path=/ |
| pdf-export | /jportal/recherche3doc/jlr_NNLSH000033AF.pdf?json=%7B%22format%22%3A%22pdf%22%2C%22docPart%22%3A%22X%22%2C%22docId%22%3A%22jlr-NNLSH000033AF%22%2C%22portalId%22%3A%22bssh%22%7D&_=%2Fjlr_NNLSH000033AF.pdf | 200 | JSESSIONID; Path=/; Secure |

- Dokumentseiten `/bssh/document/…`: 19 mit Netzabruf, davon mit `Set-Cookie` 0 (statische Oberflächenseite).
- Permalink-Dienst `/jportal/perma`: 23 Aufrufe setzen eine anonyme Sitzung (`JSESSIONID`, `LASTACCESS`, `OAuth_Token_Request_State`, `jwtCookie`) – ohne Anmeldung.
- Sitzungsprobe: Exportadresse mit allen Cookies des vorherigen Permalink-Aufrufs (JSESSIONID, LASTACCESS, OAuth_Token_Request_State, jwtCookie): **pdf**.
- Das CSRF-Token liefert ausschließlich die POST-Initialisierung der internen Schnittstelle (`init` → `csrfToken`); kein öffentlicher Seitenaufruf gibt es aus.

Einordnung: **normale anonyme Browsersitzung, keine Zugangskontrolle.** Die PDF-Ausgabe verlangt nur irgendeine Sitzung; die Sitzungscookies setzt der öffentliche Permalink-Aufruf von selbst (wie beim ersten Besuch im Browser). Kein Login, keine Zugangsdaten, kein CSRF-Token, kein Aufruf von `/jportal/wsrest/`. Ohne Sitzung antwortet die Ausgabe mit dem Hinweis „letzte Sitzung bereits beendet“ statt mit einer Sperre (HTTP 200, text/plain) – das ist Sitzungsverwaltung, keine Zugriffssperre. Eine Sitzung genügt für beliebig viele Dokumente.

## 4 Permalink-Identität und historische Fassungen

- **genau dieses Dokument:** `/perma?d=<Kennung>` → `/bssh/?query=DOKNR:<DOKNR>` (Alias oder DOKNR; fassungsfest).
- **gültige Fassung / Gesamtausgabe:** `/perma?a=<juris-Abkürzung>` → `/jportal/perma?portal=bssh&a=…` → `/bssh/?aiz=1&docId=<Rahmendokument>` (gleitend, Gesamtausgabe). Ohne auflösbare Abkürzung fehlt `docId`.
- **Staatsvertrag:** `MStV_HSH` → keine DOKNR, `MedienStVtr_HA_SH` → keine DOKNR; ohne Titel-Metadaten nicht identifizierbar.

| Alias mit Fassungssegment | Hinweis (Suchindex) | DOKNR der Einheit | Rahmendokument | Dokumentseite |
| --- | --- | --- | --- | --- |
| `jlr-VwGSHV57P108` | § 108 LVwG, Fassung V57 (gültig ab 2024-01-01 laut Suchindex) | `jlr-NNLSH00002B40NN00000000268` | `jlr-NNLSH00002B40` | spa-shell |
| `jlr-VwGSHV69IVZ` | Inhaltsverzeichnis LVwG, Fassung V69 (gültig ab 2025-04-15 laut Suchindex) | `jlr-NNLSH00002B40NN00000000018` | `jlr-NNLSH00002B40` | spa-shell |
| `jlr-VerfSH2014pArt14` | Art. 14 Verfassung, Segment p | `jlr-NNLSH00002D11NN00000000016` | `jlr-NNLSH00002D11` | spa-shell |
| `jlr-VerfSH2014V5Art46` | Art. 46 Verfassung, Segment V5 | `jlr-NNLSH00002D11NN00000000054` | `jlr-NNLSH00002D11` | spa-shell |
| `jlr-ZeugnVSH2018V7P5` | § 5 ZVO, Fassung V7 (2023-07-30 bis 2024-12-17 laut Suchindex – galt am Stichtag) | `jlr-NNLSH00002BC4NN00000000009` | `jlr-NNLSH00002BC4` | spa-shell |
| `jlr-EltBeirWOSH2022pP13` | § 13 EB-WahlVO (2022-07-31 bis 2024-08-30 laut Suchindex – galt am Stichtag) | `jlr-NNLSH00002D40NN00000000018` | `jlr-NNLSH00002D40` | spa-shell |

Historische Fassungen sind damit **adressierbar** (eigene DOKNR je Einheit und Fassung unter demselben Rahmendokument) und über denselben öffentlichen Ausgabeweg **abrufbar**: Die PDF-Ausgabe ohne `docPart` liefert genau diese Einzelfassung mit „Fassung vom“, „Gültig ab“ und „Gültig bis“ (Stichprobe: `SAMPLE_REPORT.md`). Mit `docPart: "X"` liefert dieselbe Adresse die aktuelle Gesamtausgabe des Rahmendokuments.

## 5 TDM-Vorbehalt (getrennt von robots.txt, Erreichbarkeit und Sitzung)

Jede Antwort des Portals trägt den Kopf `tdm-reservation: 1` (in diesem Lauf protokolliert), die Oberflächenseite zusätzlich `<meta name="tdm-reservation" content="1">`; `/.well-known/tdmrep.json` fehlt (HTTP 404). Das ist ein maschinenlesbarer Nutzungsvorbehalt für Text- und Data-Mining (TDM Reservation Protocol). Er ist unabhängig davon, dass robots.txt für diesen Adapter advisory ist, dass keine technische Sperre besteht und dass die Ausgabe Sitzungszustand verlangt. Eine rechtliche Schlussfolgerung zieht der Adapter nicht; sie bleibt dem Menschen vorbehalten.

