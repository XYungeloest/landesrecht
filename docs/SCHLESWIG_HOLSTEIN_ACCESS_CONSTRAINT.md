# Zugriffslage: konsolidiertes Landesrecht Schleswig-Holstein (juris)

**Status: robots.txt `advisory` (Nutzerentscheidung 2026-09-18) · Normtext über die öffentliche PDF-Ausgabe
abrufbar (anonyme Sitzung eines öffentlichen Permalink-Aufrufs, GET, kein CSRF, kein Login) · interne
Schnittstelle `/jportal/wsrest/` nicht benutzt · TDM-Vorbehalt dokumentiert. Stand 2026-09-18 (Run 6).**

Maschinenlesbare Belege: `data/audits/juris-sh/discovery/robots.json`,
`data/audits/juris-sh/discovery/content-addressability.json`, `data/audits/juris-sh/discovery/public-exports.json`,
Berichte `data/audits/juris-sh/SOURCE_INVENTORY.md`, `STRUCTURE_REPORT.md`, `PUBLIC_EXPORT_DISCOVERY.md`,
`SAMPLE_REPORT.md`, `READINESS.md`. Die Politik selbst steht im Code: `packages/importers/juris-sh/src/access/policy.ts`.

## 1 Befund robots.txt (bleibt dokumentiert)

`https://www.gesetze-rechtsprechung.sh.juris.de/robots.txt` (zuletzt abgerufen 2026-09-18, HTTP 200, SHA-256 in
`robots.json`) erlaubt 15 namentlich genannten Suchmaschinen-Bots den ganzen Host und schließt alle übrigen aus:

```text
User-agent: *
Disallow: /

Sitemap: https://www.gesetze-rechtsprechung.sh.juris.de/sitemapindex.xml
```

Der Importer dieses Projekts (`landesrecht-portal-importer/0.1 …`) fällt in die Gruppe `*`; jeder Pfad ist für ihn
„disallowed“. Dieselbe Politik gilt für die übrigen juris-Landesportale (BW, RLP, HH, MV).

## 2 Politik ab 2026-09-18: robots.txt ist für den juris-SH-Adapter ein Hinweis, kein Blocker

**Entscheidung:** Nutzerentscheidung vom 2026-09-18. **Geltungsbereich:** ausschließlich der juris-SH-Adapter
(`packages/importers/juris-sh`), Host `www.gesetze-rechtsprechung.sh.juris.de`. West (RECHT.NRW) und BayWü
(BAYERN.RECHT) behalten ihre Politik; der gemeinsame West-Fetcher ist unverändert.

Umsetzung (`robotsPolicy: 'advisory'` in `access/policy.ts`, geprüft vom Fetcher-Wrapper `common/fetcher.ts`):

- robots.txt wird bei jeder Enumeration abgerufen, ausgewertet und mit SHA-256 belegt; der Befund steht im
  Quelleninventar und in der Readiness – er sperrt keinen Abruf.
- Öffentlich ohne Authentifizierung erreichbare Seiten dürfen automatisiert abgerufen werden, schonend: ehrlicher
  User-Agent, Mindestabstand 1 s, keine Parallelität, Cache `.cache/juris-sh`, Timeout, `Retry-After`, Backoff bei
  429/5xx, Abbruch nach aufeinanderfolgenden Sperrantworten, Abrufbudget je Lauf.
- Technisch verweigert (bevor ein Netzabruf entsteht): jeder andere Host, jede andere Methode als GET, jeder
  Anfragekörper, die internen Schnittstellen `/jportal/wsrest/…` und `/api/…` sowie die Anmeldestrecke `/r3`.
  Erlaubt sind die öffentlichen Seiten, Permalinks und die dokumentierte Ausgabeadresse `/jportal/recherche3doc/…`.
- Nicht umgangen werden Login, Authentifizierung, CAPTCHA, IP-Sperren, Sitzungs-/Zugriffskontrolle, Paywalls,
  JavaScript-Bot-Challenges und nicht öffentliche Schnittstellen. Keine Tarnung, keine Suchmaschinen-Caches.
- Eine Politik `binding` bleibt im Wrapper möglich (dann prüft er jede Anfrage gegen die robots.txt); sie ist
  die Voreinstellung jeder anderen Nutzung.

## 3 Nutzungsbedingungen

Die Oberfläche verlinkt Hilfe, Impressum, Datenschutzhinweis und Barrierefreiheitserklärung – keine eigene Seite
„Nutzungsbedingungen“. Befund (Wortlaut und SHA-256 in `SOURCE_INVENTORY.md`):

- **Impressum:** Diensteanbieter Land Schleswig-Holstein (Zentrales IT-Management SH), technische Umsetzung juris GmbH;
  Hinweis „keine Rechtsberatung“ und Haftungsausschluss. **Keine Aussage zum automatisierten Abruf, keine
  Lizenzaussage.**
- **Datenschutzhinweis:** Server-Protokolle (u. a. IP-Adresse, Browsertyp), Anonymisierung nach 30 Tagen,
  essentielle Sitzungscookies. **Keine Aussage zum automatisierten Abruf.**
- **TDM-Vorbehalt:** Jede Oberflächenseite trägt `<meta name='tdm-reservation' content='1'>` (TDM Reservation
  Protocol) – ein maschinenlesbarer Nutzungsvorbehalt für Text- und Data-Mining im Sinne von § 44b Abs. 3 UrhG.
  `/.well-known/tdmrep.json` gibt es nicht (HTTP 404). Normtexte selbst sind amtliche Werke (§ 5 UrhG); der
  Vorbehalt kann die redaktionelle Aufbereitung und die Datenbank (§§ 87a ff. UrhG) betreffen. Das ist ein Befund
  für die rechtliche Bewertung durch den Menschen, kein technischer Blocker.

## 4 Technische Zugriffssperre

**Keine.** Alle Abrufe (robots.txt, Sitemaps, Permalinks, Dokumentadressen, Impressum, Skriptbündel, PDF-Ausgaben
des Vollkorpus) wurden mit HTTP 200, 302 bzw. 404 beantwortet; kein 403, kein 429, keine Challenge-Seite.

## 5 Befund Run 5 (gilt weiter): Die Dokumentseiten sind eine Skriptoberfläche

Alle dokumentierten Dokumentadressen (`/bssh/document/<ID>`, `…/part/X`, `…/format/xsl`, `…/format/xsl/part/X`;
ebenso `/perma?d=`, `/perma?a=`, jlink und die Legacy-Adressen, die serverseitig auf `/bssh/` umleiten) liefern für
jedes Dokument **dieselbe** 5 353 Bytes große Startseite der Portaloberfläche (SHA-256 `ad4afe0ffcb2…`): ein leerer
Anwendungscontainer. Die Oberfläche lädt Text und Metadaten per **POST an `/jportal/wsrest/recherche3/`** mit
`JURIS-PORTALID: bssh`, `X-CSRF-TOKEN` (aus der POST-Initialisierung `init`) und Sitzungscookie. Diese Schnittstelle
ist nicht dokumentiert; sie wird **nicht** benutzt und vom Fetcher technisch verweigert (auch in Run 6 kein Aufruf).

## 6 Run 6: öffentlicher Ausgabeweg PDF – was er ist und was er nicht ist

Befund der Public Export Discovery (23 Normen, statische Analyse der Skriptbündel, `PUBLIC_EXPORT_DISCOVERY.md`):

| Zugriffsart | Adresse | Ergebnis |
| --- | --- | --- |
| Dokumentseite, Teil, XSL-Ansicht | `GET /bssh/document/<ID>[…]` | Skriptoberfläche ohne Inhalt, setzt keine Cookies |
| Permalink „genau dieses Dokument“ | `GET /perma?d=<DOKNR oder Alias>` → `/jportal/perma?portal=bssh&d=…` (302) → `/bssh/?query=DOKNR:…` | fassungsfeste Kennung; der Zwischenschritt setzt eine **anonyme Sitzung** (`JSESSIONID`, `LASTACCESS`, `OAuth_Token_Request_State`, `jwtCookie`) – ohne Anmeldung |
| Permalink „gültige Fassung / Gesamtausgabe“ | `GET /perma?a=<juris-Abkürzung>` → `/bssh/?aiz=1&docId=<Rahmendokument>` | gleitende Kennung, nur bei auflösbarer Abkürzung |
| **PDF-Ausgabe (Menüpunkt „PDF speichern“)** | `GET /jportal/recherche3doc/<Name>.pdf?json={"format":"pdf","docPart":"X","docId":"<DOKNR>","portalId":"bssh"}` | ohne Sitzung: HTTP 200 text/plain „…letzte Sitzung bereits beendet…“; **mit der Sitzung des Permalink-Aufrufs: das PDF** (Textlayer, kein OCR) |
| PDF einer Einzelfassung | dieselbe Adresse ohne `docPart` | genau diese historische Fassung mit „Fassung vom“, „Gültig ab/bis“ |
| RTF-/HTML-Ausgabe | `…/<Name>.rtf` bzw. `format: html` | RTF ohne Sitzung wie PDF; HTML-Ausgabe HTTP 500 – nicht benutzt |
| Drucken | Route `/bssh/print/document` der Oberfläche | rendert den über die interne Schnittstelle geladenen Zustand – keine eigene Serverausgabe |
| Gesamtausgabe-ZIP (`aizZipUrl`) | nur aus der internen Dokumentantwort bekannt | nicht benutzt |

Einordnung (aus Code und `Set-Cookie`-Belegen, nicht durch Aufruf der internen Schnittstelle): Die PDF-Ausgabe
verlangt **nur eine normale anonyme Browsersitzung**, wie sie jeder Besucher beim ersten öffentlichen Seitenaufruf
automatisch erhält; es gibt keine Zugangsdaten, keine Anmeldung, kein CSRF-Token und keine Challenge. Das
Sitzungscookie wird ausschließlich für die offizielle Ausgabefunktion verwendet (eine Sitzung je Lauf, neu eröffnet
nur, wenn die Ausgabe sie für beendet erklärt). Cookie-Werte werden nicht gespeichert.

Abrufregeln wie bisher: ehrlicher User-Agent, 1 Anfrage/s für jede Station (auch Weiterleitungen), keine
Parallelität, Cache `.cache/juris-sh`, Timeout, `Retry-After`, Backoff, Abbruch bei 403/429/Challenge; resumierbar
(`npm run import:juris-sh:fetch-corpus -- --phase gesamtausgaben|units`).

## 7 TDM-Vorbehalt (eigener Befund, getrennt von robots.txt, Erreichbarkeit und Sitzung)

Jede Antwort trägt den HTTP-Kopf `tdm-reservation: 1`, die Oberfläche zusätzlich
`<meta name="tdm-reservation" content="1">`; `/.well-known/tdmrep.json` fehlt (HTTP 404). Das ist ein
maschinenlesbarer Nutzungsvorbehalt für Text- und Data-Mining (TDM Reservation Protocol). Er ist unabhängig davon,
dass robots.txt für diesen Adapter `advisory` ist, dass keine technische Sperre besteht und dass keine Anmeldung nötig
ist. Der Adapter zieht daraus **keine** rechtliche Schlussfolgerung; die Bewertung (Normtexte als amtliche Werke,
redaktionelle Aufbereitung, Datenbankschutz) bleibt dem Menschen vorbehalten.

## 8 Folgen

- Enumeration (Sitemap: 2 808 Rahmendokumente Landesrecht, 2 389 Verwaltungsvorschriften) und Normtext über die
  PDF-Ausgabe: Gesamtausgabe je Rahmendokument/VwV, Einzelfassungen für den Stichtag.
- Stichprobe (38 Normen, `SAMPLE_REPORT.md`): Textintegrität exact 38/38.
- Vollkorpus: 5 195 Gesamtausgaben und 18 636 Einzelfassungen über diesen Weg (23 437 Netzabrufe, 0 Sperrantworten);
  Inventur und Bulk: `docs/SCHLESWIG_HOLSTEIN_BULK_READINESS.md`, `data/audits/juris-sh/CORPUS_INVENTORY.md`.

## 9 Hinweis zu anderen Ländern

`https://www.gesetze-bayern.de/robots.txt` erlaubt ausdrücklich `User-agent: * / Allow: /`; der BayWü-Adapter ist
von dieser Politik nicht berührt.
