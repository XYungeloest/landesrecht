# Zugriffslage: konsolidiertes Landesrecht Schleswig-Holstein (juris)

**Status: robots.txt `advisory` (Nutzerentscheidung 2026-09-18) · Normtext über dokumentierte Adressformen
NICHT abrufbar · NSH-Bulk blockiert. Stand 2026-09-18.**

Maschinenlesbare Belege: `data/audits/juris-sh/discovery/robots.json`,
`data/audits/juris-sh/discovery/content-addressability.json`, Berichte `data/audits/juris-sh/SOURCE_INVENTORY.md`,
`STRUCTURE_REPORT.md`, `READINESS.md`. Die Politik selbst steht im Code: `packages/importers/juris-sh/src/access/policy.ts`.

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

**Keine.** Alle Abrufe (robots.txt, Sitemaps, Permalinks, Dokumentadressen, Impressum, Skriptbündel) wurden mit
HTTP 200 bzw. 404 beantwortet; kein 403, kein 429, keine Challenge-Seite, keine Wiederholung nötig.

## 5 Neuer Blocker: Normtext ist über die dokumentierten Adressformen nicht abrufbar

Alle dokumentierten öffentlichen Adressformen (`/bssh/document/<ID>`, `…/part/X`, `…/format/xsl`,
`…/format/xsl/part/X`; ebenso `/perma?d=`, `/perma?a=`, jlink und die Legacy-Adressen, die serverseitig auf
`/bssh/` umleiten) liefern für jedes Dokument **dieselbe** 5 353 Bytes große Startseite der Portaloberfläche
(SHA-256 `ad4afe0ffcb2…`, 20 von 20 Proben über fünf Dokumentfamilien): ein leerer Anwendungscontainer, der Inhalt
wird erst per JavaScript geladen.

Woher (belegt am ausgelieferten Skriptbündel, nicht benutzt): Die Oberfläche lädt Dokumente per **POST an
`/jportal/wsrest/recherche3/`** mit den Kopfzeilen `JURIS-PORTALID: bssh` und `X-CSRF-TOKEN` sowie Sitzungscookie
(`credentials: include`). Diese Schnittstelle ist in keiner Hilfeseite dokumentiert und sitzungsgebunden. Nach der
Auftragsvorgabe („liefert nur ein undokumentierter interner JSON-/REST-Endpunkt die Inhalte, diesen nicht benutzen,
sondern mit Beleg berichten“) wird sie **nicht** benutzt; der Fetcher verweigert sie technisch.

Folgen:

- Enumeration ist möglich (Sitemap: 2 808 Rahmendokumente Landesrecht, 2 389 Verwaltungsvorschriften; Quellidentität
  juris-DOKNR), aber **kein Normtext, keine Metadaten** (Titel, Typ, Fassung, Geltung).
- Keine Rohquellen, kein Parser, keine Strukturinventur, keine Stichtagsklassifikation, kein Bulk.
- Die Sitemap ist kein Stichtagsbestand: Beim Landesrecht stehen auch außer Kraft getretene Normen darin, bei den
  Verwaltungsvorschriften fehlen am Stichtag geltende, inzwischen abgelaufene VwV.

## 6 Was nötig wäre (Entscheidung beim Menschen)

1. **Freigabe der internen Schnittstelle** `/jportal/wsrest/recherche3/` durch den Nutzer – mit der Folge, dass der
   Adapter eine Sitzung aufbaut und das CSRF-Token der Sitzung verwendet (Sitzungssteuerung wie im Browser, keine
   Anmeldung); oder
2. **Datenlieferung/Freigabe** durch das Zentrale IT-Management SH bzw. die juris GmbH (Export des konsolidierten
   Landesrechts einschließlich historischer Fassungen und VwV); oder
3. **amtliche Verkündungsfassungen** (GVOBl./Amtsbl., Verkündungsportal SH – dort gilt robots.txt verbindlich mit
   `Crawl-delay: 180`) mit vollständigen Rekonstruktionsketten je Norm – für einen Landesbestand nicht in
   vertretbarer Zeit leistbar.

Bis dahin: NSH bleibt „Enumeration, Zugriffspolitik und Belege bereit, Normtext nicht abrufbar“.

## 7 Hinweis zu anderen Ländern

`https://www.gesetze-bayern.de/robots.txt` erlaubt ausdrücklich `User-agent: * / Allow: /`; der BayWü-Adapter ist
von dieser Politik nicht berührt.
