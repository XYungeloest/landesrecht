# Quelleninventar juris Schleswig-Holstein

Erzeugt von `node scripts/import-juris-sh.ts enumerate --write`. Stichtag **2023-12-01**. Quelle: Bürgerservice Schleswig-Holstein (juris), Simulationsland Niedersachsen-Holstein (`nsh`).

## 1 Zugriffslage

Politik: **robots.txt advisory** – Nutzerentscheidung vom 2026-09-18 (docs/SCHLESWIG_HOLSTEIN_ACCESS_CONSTRAINT.md). robots.txt ist für den juris-SH-Adapter ein dokumentierter Hinweis, kein Readiness-Blocker. Öffentlich ohne Authentifizierung erreichbare Seiten des Portals dürfen schonend automatisiert abgerufen werden (ehrlicher User-Agent, etwa 1 Anfrage/s, keine Parallelität, Cache, Backoff). Login, Sitzungs-/Zugriffskontrolle, CAPTCHA, interne Schnittstellen und Sperren werden nicht umgangen.

robots.txt: HTTP 200, 420 Bytes, SHA-256 `e13af9e19d8641f51d9ec931f2eb9dffe9239527d65a521f1f101ba06975ef69`, abgerufen 2026-09-18T12:35:48.600Z. Wortlaut:

```text
User-agent: Googlebot
User-agent: Bingbot
User-agent: Applebot
User-agent: DuckDuckBot
User-agent: facebot
User-agent: Slurp
User-agent: Exabot
User-agent: Swiftbot
User-agent: CCBot
User-agent: AhrefsBot
User-agent: SemrushBot
User-agent: Rogerbot 
User-agent: MJ12Bot
User-agent: JamesBOT
User-agent: OnCrawl
Allow: /

User-agent: *
Disallow: /

Sitemap: https://www.gesetze-rechtsprechung.sh.juris.de/sitemapindex.xml
```

Bewertung für den eigenen User-Agent `landesrecht-portal-importer/0.1 (+https://gitlab.com/politiksim/landesrecht; Politiksimulation, Quellland Schleswig-Holstein, schonender Einzelabruf)` (Befund, keine Sperre):

| Pfad | Ergebnis | Gruppe | Regel |
| --- | --- | --- | --- |
| `/robots.txt` | disallowed | * | Disallow: / |
| `/sitemapindex.xml` | disallowed | * | Disallow: / |
| `/bssh/document/jlr-NNLSH00002D11` | disallowed | * | Disallow: / |
| `/bssh/document/jlr-NNLSH00002D11/format/xsl` | disallowed | * | Disallow: / |
| `/perma?d=jlr-VerfSH2014rahmen` | disallowed | * | Disallow: / |

Technisch nie abgerufen (Zugriffspolitik, Abschnitt `forbiddenPaths`); Mindestabstand 1000 ms, keine Parallelität:

| Pfad | Grund |
| --- | --- |
| `/jportal/wsrest/` | interne REST-Schnittstelle der Portaloberfläche (POST mit Sitzungscookie, X-CSRF-TOKEN und JURIS-PORTALID; nicht dokumentiert) |
| `/api/` | interne Schnittstelle der Portaloberfläche (Vorschläge, Ansichten) |
| `/r3` | Anmelde- und Authentifizierungsstrecke |

### Nutzungsbedingungen

Die Oberfläche verlinkt Hilfe, Impressum, Datenschutzhinweis und Barrierefreiheitserklärung; eine eigene Seite „Nutzungsbedingungen“ gibt es nicht. Durchsucht wurde der sichtbare Text nach Aussagen zu automatisiertem Abruf, Text- und Data-Mining, Weiterverwendung, Urheber- und Lizenzrecht:

| Seite | HTTP | SHA-256 | Treffer |
| --- | --- | --- | --- |
| [Impressum](https://www.gesetze-rechtsprechung.sh.juris.de/jportal/portal/page/fshelp.psml?cmsuri=/technik/de/impressum/bsshimpressum.jsp) | 200 | `090b6051b9d59d04…` | Haftung: „…r Rechtsauskünfte sind den Angehörigen der rechtsberatenden Berufe vorbehalten. Haftungsausschluss: Alle Angaben und Inhalte dieses Angebotes wurden sorgfältig erstell…“ · Haftung: „…eser Website geschehen auf eigene Gefahr des Nutzers. juris übernimmt keinerlei Haftung für Schäden, die angeblich durch den oder in Verbindung mit dem Zugang und/oder…“ |
| [Datenschutzhinweis](https://www.gesetze-rechtsprechung.sh.juris.de/jportal/portal/page/fshelp.psml?cmsuri=/technik/de/datenschutz/bsshdatenschutz.jsp) | 200 | `7224bf4e436a9d3e…` | Cookie: „…n zu können. Wir setzen bei Nutzung des Bürgerservices essentielle sog. Session-Cookies ein, die für die Zeit der laufenden Sitzung in Ihrem Browser gespeichert werde…“ · Cookie: „…gespeichert werden. Für nicht registrierte Nutzer werden die durch die Session-Cookies erhobenen Nutzerdaten nicht zur Erstellung von Nutzerprofilen verwendet. Die S…“ · Cookie: „…enen Nutzerdaten nicht zur Erstellung von Nutzerprofilen verwendet. Die Session-Cookies werden beim Schließen Ihres Browsers gelöscht. Rechtsgrundlage für diese Verar…“ |

Befund: Die Treffer oben sind der vollständige einschlägige Wortlaut; eine Aussage zum automatisierten Abruf, zu Text- und Data-Mining oder eine Lizenz enthalten sie **nicht**. `https://www.gesetze-rechtsprechung.sh.juris.de/.well-known/tdmrep.json`: HTTP 404. Den maschinenlesbaren TDM-Vorbehalt der Oberflächenseiten (`<meta name="tdm-reservation">`) belegt STRUCTURE_REPORT.md. Normtexte sind amtliche Werke (§ 5 UrhG); ein Vorbehalt kann die redaktionelle Aufbereitung und die Datenbank betreffen – Befund für die rechtliche Bewertung, kein technischer Blocker.

## 2 Sitemap

| Quelle | HTTP | Bytes | SHA-256 | Abruf |
| --- | --- | --- | --- | --- |
| https://www.gesetze-rechtsprechung.sh.juris.de/sitemapindex.xml | 200 | 301 | `d5c34f13d198033d…` | 2026-09-18T12:35:49.392Z |
| https://www.gesetze-rechtsprechung.sh.juris.de/sitemap1.xml | 200 | 5424340 | `c6c9c68fcc0027b7…` | 2026-09-18T12:35:52.451Z |
| https://www.gesetze-rechtsprechung.sh.juris.de/sitemap2.xml | 200 | 4429840 | `73b3de0682024606…` | 2026-09-18T12:35:53.560Z |

Doppelte Kennungen: 0 · Adressen ohne Dokument: 1 (https://www.gesetze-rechtsprechung.sh.juris.de/bssh/) · Einheiten ohne Rahmendokument: 0 · unbekannte Familien: 0

## 3 Kennungsfamilien und Scope

Quellidentität ist die juris-Dokumentnummer (DOKNR). Scope nach `docs/LEGAL_SCOPE.md` auf Familienebene; je Dokument (Normtyp, normativ oder informativ, landesweit) ist er ohne Dokumentinhalt nicht entscheidbar.

| Familie | Anzahl | Einordnung | Grund |
| --- | --- | --- | --- |
| landesrecht-frame | 2808 | candidate | Rahmendokument einer Norm des Landesrechts (Gesetz/Verordnung); Normtyp und Geltung erst aus dem Dokument bestimmbar |
| landesrecht-unit | 59003 | candidate | Einheit eines Rahmendokuments; zählt zur Norm, nicht als eigene Norm |
| ffn-register | 6 | register | Register des Fundstellennachweises – Enumerationsquelle, keine Norm |
| vwv | 2389 | candidate | Verwaltungsvorschrift; normativ/landesweit oder rein informativ erst aus dem Dokument bestimmbar |
| vwv-legacy | 0 | review | Verwaltungsvorschrift in Gliederungsnummer-Kennung; die Sitemap führt sie nicht (Stichprobe: auch am Stichtag geltende VwV fehlen) |
| gazette | 13590 | excluded | Verkündungsblatt (Veröffentlichung, keine konsolidierte Norm) – allenfalls Beleg für Rekonstruktionen |
| ortsrecht | 1582 | excluded | Ortsrecht/kommunales Satzungsrecht (LEGAL_SCOPE: raus) |
| rechtsprechung | 9714 | excluded | Rechtsprechung (LEGAL_SCOPE: raus) |
| portal-page | 1 | excluded | Portalseite ohne Dokument |
| unknown | 0 | review | unbekannte Kennungsfamilie |

Register des Fundstellennachweises in der Sitemap: `jlr-FFNAbkuerzungSH`, `jlr-FFNInhaltSH`, `jlr-FFNStichwortSH`, `jlr-FFNSystemSH`, `jlr-FFNZeitl1SH`, `jlr-FFNZeitl2SH`.

## 4 Enumeration und Fixpunkt

| Bereich | Einträge | Einheiten | Fingerabdruck | stabil | Bestätigungen | Abruf | Vorgängerabruf |
| --- | --- | --- | --- | --- | --- | --- | --- |
| landesrecht | 2808 | 59003 | `7a0460777bbb612e…` | ja | 1 | 2026-09-18T12:35:53.560Z | 2026-09-18T12:09:34.272Z |
| vwv | 2389 | – | `8ab1f8eef2433b20…` | ja | 1 | 2026-09-18T12:35:53.560Z | 2026-09-18T12:09:34.272Z |

Fixpunktregel: gleicher fachlicher Fingerabdruck über einen **unabhängigen zweiten Abruf** der Sitemap (`enumerate --refresh --write`). Ein Wiederholungslauf aus dem Cache zählt nicht als Bestätigung und ändert die Dateien nicht.

## 5 Abgleich mit einer zweiten Quelle (Stichprobe)

Quelle: `data/audits/schleswig-holstein/discovery/juris-samples.json` (Suchmaschinen-Indexdaten der Discovery, unabhängig von der Sitemap). Sprechende Kennungen über den dokumentierten Permalink aufgelöst. 29 Kennungen: aufgelöst 29, in der Sitemap 25, nicht in der Sitemap 4, unaufgelöst 0, davon außerhalb des Bestands (Ortsrecht/Rechtsprechung) 1.

| Stichprobe | Titel (Suchindex) | Weg | DOKNR | Familie | in Sitemap |
| --- | --- | --- | --- | --- | --- |
| `jlr-VerfSH2014rahmen` | Verfassung des Landes Schleswig-Holstein in der Fassung vom 2. Dezembe | perma-d | `jlr-NNLSH00002D11` | landesrecht-frame | ja |
| `jlr-VerfSH2014pArt14` | Artikel 14 Verf SH 2014 | perma-d | `jlr-NNLSH00002D11NN00000000016` | landesrecht-unit | ja |
| `jlr-VerfSH2014V5Art46` | Artikel 46 Verf SH 2014 | perma-d | `jlr-NNLSH00002D11NN00000000054` | landesrecht-unit | ja |
| `jlr-VerfSH2014pArt12` | Artikel 12 Verf SH 2014 | perma-d | `jlr-NNLSH00002D11NN00000000014` | landesrecht-unit | ja |
| `jlr-VwGSHV57P108` | § 108 LVwG – Bestimmtheit und Form des Verwaltungsaktes | perma-d | `jlr-NNLSH00002B40NN00000000268` | landesrecht-unit | ja |
| `jlr-VwGSHV69IVZ` | Inhaltsverzeichnis LVwG | perma-d | `jlr-NNLSH00002B40NN00000000018` | landesrecht-unit | ja |
| `jlr-SchulGSH2007rahmen` | Schleswig-Holsteinisches Schulgesetz | perma-d | `jlr-NNLSH00002AAF` | landesrecht-frame | ja |
| `jlr-GemSchulVSH2024pP2` | § 2 – Übergang in die Gemeinschaftsschule | perma-d | `jlr-NNLSH00002D22NN00000000005` | landesrecht-unit | ja |
| `jlr-BauGebVSH2022pAnlage1` | Anlage 1 BauGebVO | perma-d | `jlr-NNLSH00002B25NN00000000009` | landesrecht-unit | ja |
| `jlr-BhVSHpAnlage1` | Anlage 1 BhVO | perma-d | `jlr-NNLSH00002F02NN00000000032` | landesrecht-unit | ja |
| `jlr-KampfmVSH2012V3Anlage` | Anlage KampfmV SH 2012 | perma-d | `jlr-NNLSH00002B66NN00000000019` | landesrecht-unit | ja |
| `jlr-KrummNatSchVSH2013V2Anlage` | KrummNatSchV SH 2013 – Gesamtausgabe | perma-d | `jlr-NNLSH00003051NN00000000015` | landesrecht-unit | ja |
| `jlr-EltBeirWOSH2022pP13` | § 13 EB-WahlVO – Wahlen im Schulelternbeirat | perma-d | `jlr-NNLSH00002D40NN00000000018` | landesrecht-unit | ja |
| `jlr-ZeugnVSH2018V7P5` | § 5 ZVO – Zeugnisse für Schülerinnen und Schüler mit sonderpädagogisch | perma-d | `jlr-NNLSH00002BC4NN00000000009` | landesrecht-unit | ja |
| `jlr-PersRWahlVSH2018V2P1` | § 1 PersRWahlV SH 2018 – Bestellung des Wahlvorstandes | perma-d | `jlr-NNLSH00002AA1NN00000000007` | landesrecht-unit | ja |
| `jlr-CoronaVQuarVSH2pP3` | § 3 CoronaVQuarV SH 2 – Ausnahmen von der häuslichen Quarantäne | perma-d | `jlr-NNLSH000033AFNN00000000003` | landesrecht-unit | ja |
| `jlr-BauAufsÜVSH2022pP1` | § 1 BauAufsÜV SH 2022 | perma-d | `jlr-NNLSH00003321NN00000000002` | landesrecht-unit | ja |
| `jlr-NNLSH00002B00NN00000000008` | 4 EntschVO | direct | `jlr-NNLSH00002B00NN00000000008` | landesrecht-unit | ja |
| `jlr-BildG2LbVSH2019rahmen` | LVO-Bildung | perma-d | `jlr-NNLSH00002D66` | landesrecht-frame | ja |
| `jlr-VerfSchGSHrahmen` | Verfassungsschutzgesetz Schleswig-Holstein | perma-d | `jlr-NNLSH00002DF2` | landesrecht-frame | ja |
| `WaldG_SH` | Waldgesetz für das Land Schleswig-Holstein (Landeswaldgesetz - LWaldG) | perma-a | `jlr-NNLSH00002E60` | landesrecht-frame | ja |
| `VVSH-VVSH000004586` | Durchführung der gemeindlichen Selbstverwaltungsaufgaben durch das Amt | direct | `VVSH-VVSH000004586` | vwv | ja |
| `VVSH-VVSH000006199` | Verhalten bei und Abwicklung von Unfällen mit Dienst-Kfz | direct | `VVSH-VVSH000006199` | vwv | **nein** |
| `VVSH-2130.117-IM-20200904-SF` | Organisatorische Maßnahmen zur Vereinfachung und Beschleunigung der ba | perma-d | `VVSH-2130.117-IM-20200904-SF` | vwv-legacy | **nein** |
| `VVSH-2032.29-0001` | Vermögenswirksame Leistungen für Beamtinnen und Beamte, Richterinnen u | perma-d | `VVSH-2032.29-0001` | vwv-legacy | **nein** |
| `VVSH-6642.40-MBWK-20200122-SF` | Richtlinie zur Genehmigung und Förderung von Offenen Ganztagsschulen s | perma-d | `VVSH-6642.40-MBWK-20200122-SF` | vwv-legacy | **nein** |
| `KRSHAEL000004` | Hauptsatzung der Gemeinde Ockholm, Kreis Nordfriesland | direct | `KRSHAEL000004` | ortsrecht | ja |
| `jlr-FFNInhaltSH` | FFN-Inhaltsübersicht Schleswig-Holstein | direct | `jlr-FFNInhaltSH` | ffn-register | ja |
| `jlr-FFNSystemSH` | Systematische Übersicht Schleswig-Holstein | direct | `jlr-FFNSystemSH` | ffn-register | ja |

Eine **vollständige** zweite Quelle gibt es öffentlich nicht: Die Register des Fundstellennachweises stehen zwar als Dokumente in der Sitemap, ihr Inhalt ist aber wie jeder Dokumentinhalt nur über die interne Schnittstelle abrufbar (siehe `STRUCTURE_REPORT.md`).

## 6 Plausibilität gegen amtliche Register

| Register | Stand | Umfang | Sitemap |
| --- | --- | --- | --- |
| Systematische Übersicht GVOBl. (geltende Gesetze und Verordnungen) | 2024-12-13 | 962 Normen mit Registerereignis | 2808 Rahmendokumente |
| Erlassverzeichnis Amtsbl. (geltende Verwaltungsvorschriften) | 2024-09-30 | 846 Einträge mit Gl.Nr. | 2389 VwV-Dokumente |

Stichproben mit abgelaufener Geltung laut Suchindex: Landesrecht 3 von 3 in der Sitemap, Verwaltungsvorschriften 0 von 4.

- **Landesrecht:** Auch außer Kraft getretene Normen und abgelöste Fassungen tragen eigene DOKNR (Einheiten je Fassung unter demselben Rahmendokument) und stehen in der Sitemap. Die Sitemap ist deshalb **kein Stichtagsbestand**: Welche Rahmendokumente am 2023-12-01 galten, steht nur im Dokument (Geltungszeitraum).
- **Verwaltungsvorschriften:** 4 von 4 abgelaufenen VwV der Stichprobe fehlen in der Sitemap – darunter solche, die am Stichtag noch galten. Die VwV-Liste der Sitemap bildet den heutigen Bestand ab, **nicht den Bestand von 2023**; am Stichtag geltende, inzwischen abgelaufene VwV sind aus ihr nicht enumerierbar.
- Größenordnung: 2808 Rahmendokumente gegenüber 962 Normen mit Registerereignis in der Systematischen Übersicht (Faktor 2.9).


