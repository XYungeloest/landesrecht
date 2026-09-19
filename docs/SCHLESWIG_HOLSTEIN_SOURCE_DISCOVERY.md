# Quellen-Discovery: Konsolidiertes Landesrecht Schleswig-Holstein

Stand: 2026-09-17 · Auftrag: Vorbereitung eines Importers (kein Importer-Code in diesem Dokument)
· Projektstichtag: 2023-12-01

## Kurzfassung

> **Am Portal verifiziert (2026-09-18, nach der Nutzerentscheidung „robots.txt advisory“ für diesen Adapter;
> Belege unter `data/audits/juris-sh/`):**
>
> - **Dokumentadressen liefern keinen Inhalt.** `/bssh/document/<ID>`, `…/part/X`, `…/format/xsl`,
>   `…/format/xsl/part/X`, `/perma?…`, jlink und die Legacy-Adressen liefern für jedes Dokument dieselbe
>   5 353-Byte-Startseite der Skriptoberfläche (Abschnitte 5, 6 und 9.3 damit beantwortet). Den Inhalt lädt die
>   Oberfläche per POST über `/jportal/wsrest/recherche3/` mit `JURIS-PORTALID` und `X-CSRF-TOKEN` – intern,
>   sitzungsgebunden, nicht benutzt (`STRUCTURE_REPORT.md`).
> - **Sitemap** (Abschnitt 7.4): 89 092 Dokumentadressen, darunter 2 808 Rahmendokumente Landesrecht
>   (`jlr-NNLSH<8 Hex>`) mit 59 003 Einheiten, 2 389 VwV (`VVSH-VVSH<9 Ziffern>`), 6 FFN-Register,
>   13 590 Verkündungsblatt-Dokumente, 1 582 Ortsrecht, 9 714 Rechtsprechung (`SOURCE_INVENTORY.md`).
> - **Identität:** Sprechende Kennungen sind Aliase; `/perma?d=<Alias>` leitet serverseitig auf die DOKNR um
>   (`jlr-VerfSH2014rahmen` → `jlr-NNLSH00002D11`). Die Fassungssegmente `p`/`V<n>` (Abschnitt 2.3) sind
>   Einheiten **desselben** Rahmendokuments (`…pArt14` → `…D11NN00000000016`, `…V5Art46` → `…D11NN00000000054`).
> - **Historie:** Außer Kraft getretene Normen stehen mit DOKNR in der Sitemap; am Stichtag geltende, inzwischen
>   abgelaufene VwV (`VVSH-2032.29-0001`) fehlen dort.
> - **Nutzungsbedingungen:** Impressum und Datenschutzhinweis ohne Aussage zum automatisierten Abruf; jede
>   Oberflächenseite trägt `<meta name='tdm-reservation' content='1'>`.
>
> **Run 6 (2026-09-18): öffentlicher Ausgabeweg gefunden** (`PUBLIC_EXPORT_DISCOVERY.md`, `SAMPLE_REPORT.md`,
> `docs/SCHLESWIG_HOLSTEIN_ACCESS_CONSTRAINT.md` Abschnitte 6–7):
>
> - **PDF-Ausgabe** (Menüpunkt „PDF speichern“): `GET /jportal/recherche3doc/<Name>.pdf?json={format: pdf,
>   docPart: X, docId, portalId: bssh}` liefert die aktuelle Gesamtausgabe, ohne `docPart` genau die angefragte
>   Einzelfassung („Fassung vom“, „Gültig ab/bis“). Voraussetzung ist nur eine **anonyme Sitzung**, die der
>   öffentliche Permalink-Aufruf `/perma?d=…` selbst setzt – kein Login, kein CSRF, keine interne Schnittstelle.
> - **Identität:** `/perma?d=<DOKNR>` = genau dieses Dokument (fassungsfest), `/perma?a=<juris-Abk.>` = gültige
>   Fassung/Gesamtausgabe (gleitend). Aliase mit Fassungssegment (`…V57P108`) lösen auf Einheiten-DOKNR auf.
> - **Stichprobe** 38 Normen (Verfassung, Gesetze, Verordnungen, VwV, Zustimmungsgesetz zu einem Länderabkommen,
>   größtes Rahmendokument, Normen mit Tabellen/Karten, historisch geänderte und aufgehobene): Textintegrität
>   exact 38/38; Stichtagsfassung geänderter Normen aus den Einzelfassungen der juris-Historie.
> - **TDM-Vorbehalt** (gesondert von robots.txt, Erreichbarkeit und Sitzung): HTTP-Kopf `tdm-reservation: 1` auf
>   jeder Antwort, Meta-Tag in der Oberfläche, kein `/.well-known/tdmrep.json`. Dokumentiert, nicht bewertet – die
>   rechtliche Einordnung (auch der Frage der Weiterveröffentlichung, Abschnitt 9.4) bleibt beim Menschen.
>
> Die folgenden Abschnitte geben den Stand vom 2026-09-17 (ohne Portalabruf) wieder.

Das konsolidierte Landesrecht Schleswig-Holsteins liegt im **Bürgerservice Schleswig-Holstein**
(`www.gesetze-rechtsprechung.sh.juris.de`), betrieben vom Land Schleswig-Holstein und technisch
umgesetzt von der juris GmbH.

**Der zentrale Befund ist negativ und blockierend:** Die `robots.txt` dieses Hosts untersagt jedem
nicht namentlich freigegebenen Crawler den Zugriff auf den **gesamten** Host. Es wurde daher – der
Auftragsvorgabe entsprechend – **keine einzige Portalseite abgerufen**. Alle Aussagen dieses Dossiers
über Dokumentaufbau, Identität und Adressierung stammen aus zwei robots-konformen Ersatzquellen:

1. der offiziellen **Portal-Hilfe des Bürgerservice Schleswig-Holstein**, die unter identischen
   Inhalts-URIs auch auf dem nicht gesperrten Host `www.juris.de` ausgeliefert wird, und
2. **öffentlich zugänglichen Suchmaschinen-Indexdaten** (Seitentitel und URLs), die entstehen, weil
   die `robots.txt` Googlebot, Bingbot und 13 weitere Crawler ausdrücklich zulässt.

Damit ließ sich das Dokumentmodell belastbar rekonstruieren. **Nicht** ermittelbar war die konkrete
HTML-Struktur (Container, Klassennamen) – dafür wäre ein Abruf nötig gewesen. Dieser Punkt bleibt
offen und muss vor dem Importerbau geklärt werden.

**Empfehlung:** Vor jeder weiteren technischen Arbeit eine schriftliche Freigabe beim Zentralen
IT-Management SH bzw. bei juris einholen – alternativ eine Datenlieferung erbitten. Ohne Freigabe ist
ein robots-konformer Bulk-Import aus diesem Portal nicht möglich.

---

## 1. Portale und Zugänglichkeit

### 1.1 Das maßgebliche Portal

| Feld | Wert |
| --- | --- |
| Bezeichnung | Bürgerservice Schleswig-Holstein – Landesvorschriften und Landesrechtsprechung |
| Host | `www.gesetze-rechtsprechung.sh.juris.de` (CNAME auf `portal.juris.de` → `portal.edge.juris.de`) |
| Moderne Oberfläche | `https://www.gesetze-rechtsprechung.sh.juris.de/bssh/` |
| Legacy-Oberfläche | `…/jportal/…` mit Portalkennung `bsshoprod.psml` |
| Diensteanbieter (§ 1 Abs. 4 Nr. 5 DDG) | Land Schleswig-Holstein, Zentrales IT-Management SH, Düsternbrooker Weg 104, 24105 Kiel |
| Technische Umsetzung | juris GmbH, Am Römerkastell 11, 66121 Saarbrücken |

Die offizielle Verlinkung des Landes (`schleswig-holstein.de/DE/landesportal/service/Landesrecht/landesrecht_online`)
verweist auf genau diesen Host sowie auf `…/bssh/search`. Es gibt keine zweite offizielle
Landesrechts-Adresse: `www.landesrecht.schleswig-holstein.de` löst zwar auf `141.91.161.230` auf,
antwortet aber weder über IPv4 noch über IPv6 auf Port 80/443 (dreimal Timeout);
`recht.schleswig-holstein.de` liefert `403 Forbidden`.

### 1.2 robots.txt des Zielportals – wörtlich

`https://www.gesetze-rechtsprechung.sh.juris.de/robots.txt` (HTTP 200, 206 Bytes,
Cache `94814a632ed1bcb7d8caf0f3d7bcb0ab2368a026`):

```
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

**Auswertung.** Die Datei bildet zwei Gruppen. Die erste listet 15 benannte Suchmaschinen- und
SEO-Crawler und erlaubt ihnen den gesamten Host. Die zweite Gruppe gilt für alle übrigen Clients
(`User-agent: *`) und sperrt den gesamten Host (`Disallow: /`). Ein eigener Importer-Bot fällt
zwangsläufig in die zweite Gruppe. **Jeder Abruf einer Inhaltsseite dieses Hosts wäre robots-widrig.**

Die deklarierte Sitemap `sitemapindex.xml` liegt selbst im gesperrten Pfadraum und wurde deshalb
ebenfalls nicht abgerufen.

### 1.3 Die Sperre ist juris-weite Policy, keine SH-Besonderheit

Zur Einordnung wurden die Schwesterportale geprüft. Alle liefern **byte-nahe identische** Policies:

| Host | `User-agent: *` | Sitemap deklariert |
| --- | --- | --- |
| `www.gesetze-rechtsprechung.sh.juris.de` (SH) | `Disallow: /` | ja |
| `www.landesrecht-bw.de` | `Disallow: /` | ja |
| `www.landesrecht.rlp.de` | `Disallow: /` | ja |
| `www.landesrecht-hamburg.de` | `Disallow: /` | ja |
| `www.landesrecht-mv.de` | `Disallow: /` | ja |

Das ist für die Projektplanung wichtig: **Nicht nur Schleswig-Holstein, sondern die gesamte
juris-Bürgerservice-Plattform ist für eigene Crawler gesperrt.** Künftige Länderimporte aus dieser
Familie (BW, RLP, HH, MV, TH, HE …) stoßen auf dieselbe Hürde. Der Freigabeweg sollte daher nicht
SH-spezifisch, sondern grundsätzlich mit juris geklärt werden.

Bemerkenswert: Der technisch identische Host `portal.juris.de` (auf den der SH-Name zeigt) liefert
unter `/jportal/cms/technik/media/static/robots.txt` eine **andere**, deutlich freizügigere Datei mit
nur punktuellen `Disallow`-Regeln. Maßgeblich ist jedoch die `robots.txt` des tatsächlich
angesprochenen Origins – und die ist für den SH-Namen die Vollsperre. Ein Ausweichen auf
`portal.juris.de`, um dieselben Inhalte zu holen, wäre eine Umgehung und wurde nicht vorgenommen.

### 1.4 Robots-konforme Ersatzquelle: die Portal-Hilfe auf `www.juris.de`

`www.juris.de` sperrt `/jportal/portal/page/fshelp.psml` **nicht**. Unter dieser Adresse liefert juris
die Hilfeseiten aller Bürgerservice-Portale aus, adressiert über den Parameter `cmsuri`. Die
SH-spezifische Hilfe (`/hilfe/de/bs_sh_r3/…`) ist damit legitim lesbar. Genutzte Seiten:

| cmsuri | Inhalt | Cache |
| --- | --- | --- |
| `/hilfe/de/bs_sh_r3/willkommen.jsp` | Einstieg | `b0d5c8cb3ae5…` |
| `/hilfe/de/bs_sh_r3/bs_sh_r3_kategorien/kategorien.jsp` | Kategoriebaum, Enumeration | `96fc38537289…` |
| `/hilfe/de/bs_sh_r3/bs_sh_r3_trefferliste/trefferliste.jsp` | Paging, Sortierung | `a5e1ab1c48db…` |
| `/hilfe/de/bs_sh_r3/bs_sh_r3_dokumentausgabe/dokumentausgabe.jsp` | Dokumentmodell, Metadaten, Permalinks | `6b31d9064baf…` |
| `/hilfe/de/bs_sh_r3/bs_sh_r3_suche/suche.jsp` | Suchsyntax | `c47a279b29b9…` |
| `/hilfe/de/bs_sh_r3/bs_sh_r3_erweiterte_suche/erweiterte_suche.jsp` | Suchfelder | `50ef7b38deda…` |
| `/technik/de/impressum/bsshimpressum.jsp` | Impressum, Verantwortliche | `d255ecb0bdd2…` |

Diese Hilfeseiten sind die **amtliche Beschreibung** des Portals durch den Betreiber und damit die
belastbarste verfügbare Evidenz.

### 1.5 Weitere geprüfte Hosts

| Host | robots-Status | Eignung |
| --- | --- | --- |
| `verkuendungsportal.schleswig-holstein.de` | erlaubt, **Crawl-delay: 180** | Amtliche Verkündung (GVOBl.) als PDF; keine konsolidierten Fassungen |
| `gvobl.schleswig-holstein.de` | leitet auf Verkündungsportal weiter | – |
| `www.schleswig-holstein.de` | erlaubt, **Crawl-delay: 180** | nur Einstiegs-/Infoseite |
| `opendata.schleswig-holstein.de` | erlaubt, `/api/` gesperrt, Crawl-delay 10 | nicht abschließend auf Landesrechtsdatensätze geprüft |
| `www.gdi-sh.de` | `*/DE/` gesperrt, Crawl-delay 180 | Spiegel der Landesportalseite, kein Mehrwert |
| `sh.juris.de` | kein DNS-Eintrag (alte, in Suchtreffern noch verlinkte Adresse) | – |

Die Crawl-delay-Werte von **180 Sekunden** auf den Landesportalen sind bemerkenswert: Sie erlauben
rund 20 Abrufe pro Stunde. Ein Bulk-Import über diese Hosts wäre selbst dort, wo er robots-konform
wäre, zeitlich unrealistisch.

---

## 2. Dokumentmodell und Identität

### 2.1 Kategorien des Portals

Laut Hilfe (`kategorien.jsp`) führt der Bürgerservice fünf Kategorien:

1. **Gesetze/Verordnungen** – „entspricht dem Fundstellennachweis Schleswig-Holstein"
2. **Verwaltungsvorschriften** – „alle Verwaltungsverschriften, die aktuell gültig sind" (Tippfehler im Original)
3. **Rechtsprechung** – nach Rechts- und Sachgebieten (für diesen Import nicht relevant)
4. **Ortsrecht** – „Kommunales Recht Schleswig-Holstein" (KSH-Recht), Ergänzung des Zuständigkeitsfinders ZuFiSH
5. **Verkündungsblätter** – GVOBl. Schl.-H. ab 2010, Amtsbl. Schl.-H. ab 2012, SchlHA ab September 2017; Anzeige als PDF

Für einen Landesrechts-Importer sind Kategorien 1 und 2 maßgeblich. Kategorie 4 (Ortsrecht) ist
kommunales Satzungsrecht und sollte bewusst abgegrenzt werden.

### 2.2 Rahmendokument vs. Einzelnorm

Die Hilfe unterscheidet ausdrücklich drei Dokumentebenen je Stammnorm:

- **Titeldokument / Rahmendokument** – „Im Titeldokument eines Gesetzes finden Sie darüber hinaus die
  Änderungshistorie eines Gesetzes mit der Auflistung der entsprechenden Verkündungsblätter."
- **Gesamtausgabe** – „Durch Anklicken von *Aktuelle Gesamtausgabe* erhalten Sie das gesamte Gesetz in
  seiner aktuellen Fassung. Der Gesamtausgabe ist ein nichtamtliches Inhaltsverzeichnis vorangestellt,
  das gleichzeitig der Navigation zum Text der Einzelvorschrift dient."
- **Einzelnorm** – ein Paragraf, Artikel oder eine Anlage, „mit allen dokumentarischen Hinweisen und
  Sprungverweisen".

**Jede dieser Ebenen trägt eine eigene Dokument-ID.** Das ist für die Datenmodellierung zentral.

### 2.3 Identifikatorschema

Beobachtete ID-Familien (alle aus Suchindex-URLs, nicht abgerufen):

| Familie | Muster | Beispiele |
| --- | --- | --- |
| Rahmendokument | `jlr-<Abk>[<Jahr>]rahmen` | `jlr-VerfSH2014rahmen`, `jlr-SchulGSH2007rahmen`, `jlr-VerfSchGSHrahmen`, `jlr-BildG2LbVSH2019rahmen` |
| Einzelnorm | `jlr-<Abk>[<Jahr>]<Fassung><Element>` | `jlr-VerfSH2014pArt14`, `jlr-VwGSHV57P108`, `jlr-BhVSHpAnlage1` |
| Inhaltsverzeichnis | `…IVZ` | `jlr-VwGSHV69IVZ` |
| Norm ohne Abkürzung | `jlr-NNLSH<Ziffern>` | `jlr-NNLSH00002B00NN00000000008` |
| Verwaltungsvorschrift | `VVSH-VVSH<9 Ziffern>` | `VVSH-VVSH000004586`, `VVSH-VVSH000007304` |
| VwV nach Gliederungsnr. | `VVSH-<Gliederungsnr>[-<Ressort>-<YYYYMMDD>]-<Suffix>` | `VVSH-2032.29-0001`, `VVSH-2130.117-IM-20200904-SF` |
| Ortsrecht | `KRSH<Buchst><Ziffern>` | `KRSHAEL000004` |
| Rechtsprechung | `NJRE<Ziffern>` | `NJRE001501899` |

**Fassungssegment.** Zwischen Abkürzung und Element steht entweder ein kleines `p` oder `V<n>`:

- `jlr-VerfSH2014pArt14` – Artikel 14 der Verfassung, Segment `p`
- `jlr-VerfSH2014V5Art46` – Artikel 46 derselben Verfassung, Segment `V5`
- `jlr-VwGSHV57P108` (§ 108 LVwG, gültig ab 2024-01-01) gegenüber `jlr-VwGSHV69IVZ` (IVZ desselben
  Gesetzes, gültig ab 2025-04-15)

Die naheliegende Deutung – `p` = ursprüngliche/unveränderte Fassung, `V<n>` = n-te konsolidierte
Fassung – ist **eine Hypothese aus Beobachtung, keine dokumentierte Zusage.** Sie erklärt die Daten
gut, muss aber am Dokument verifiziert werden.

**Elementsegmente:** `P<n>` (Paragraf), `Art<n>` (Artikel), `Anlage[<n>]` (Anlage, auch ohne Nummer:
`jlr-KampfmVSH2012V3Anlage`), `IVZ` (Inhaltsverzeichnis), `rahmen` (Titeldokument).

**Zwei Fallstricke für den Importer:**

- IDs können **Umlaute** enthalten: `jlr-BauAufsÜVSH2022pP1` erscheint in der URL als
  `jlr-BauAufs%C3%9CVSH2022pP1`. IDs sind UTF-8 zu prozentkodieren, nicht als ASCII zu behandeln.
- IDs sind **nicht zuverlässig parsebar**: `jlr-NNLSH00002B00NN00000000008` ist „4 EntschVO",
  `jlr-NNLSH00002B00NN00000000026` ist „§ 13 EntschVO". Weder Norm noch Paragraf lassen sich aus der
  Kennung ableiten. Metadaten müssen aus dem Dokument gelesen werden, nie aus der ID rekonstruiert.

### 2.4 Adressformen (Permalinks)

```
Moderne UI
  /bssh/document/<ID>                      Einzeldokument
  /bssh/document/<ID>/part/X               Gesamtausgabe
  /bssh/document/<ID>/format/xsl           XSL-Rendering
  /bssh/document/<ID>/format/xsl/part/X    XSL-Rendering der Gesamtausgabe
  /bssh/?docId=<ID>&query=JURISLINK:"<Abk>"
  /bssh/search                             Sucheinstieg
  /perma?a=<Abkuerzung_mit_Unterstrich>    gleitend, z. B. /perma?a=WaldG_SH
  /perma?d=<ID>                            dokumentbezogen

Legacy (jportal)
  /jportal/portal/page/bsshoprod.psml?aiz=1&docId=<ID>&query=JURISLINK:"<Abk>"
  /jportal/portal/page/bsshoprod?feed=<bssho-lr|bssho-vv>&showdoccase=1&paramfromHL=true&doc.id=<ID>
  /jportal/?quelle=jlink&query=<Abk>+SH[+§+<n>|+Artikel+<n>]&psml=bsshoprod.psml&max=true[&aiz=true]
```

`aiz=true` bzw. `aiz=1` und `/part/X` schalten beide auf die Gesamtausgabe. `feed=bssho-lr` adressiert
Landesrecht, `feed=bssho-vv` Verwaltungsvorschriften. An `/format/xsl` treten teils Parameter `oi=…`
und `sourceP={"source":"…"}` auf; sie wirken wie Herkunftstracking und sind vermutlich entbehrlich.

Die Hilfe (`dokumentausgabe.jsp`) beschreibt Permalinks als „dauerhaft gültige Adresse (URL) zu einem
Dokument" und listet sie **nach Kategorie gestaffelt** – siehe Abschnitt 4.

---

## 3. Metadatenfelder je Dokument

Die Hilfe listet die Felder ausdrücklich auf.

**Einzelnorm (Gesetz/Verordnung):**

- Paragraphen- oder Artikel-Ziffer der Norm
- amtliche oder juris Abkürzung des Gesetzes
- Fassungsdatum der angezeigten Norm
- Geltungsdatum oder -zeitraum der angezeigten Norm
- Fundstelle des Ur-Gesetzes im Verkündungsblatt
- Gliederungsnummer
- vollständiger Text der Vorschrift

**Titeldokument:** zusätzlich die **Änderungshistorie** mit Auflistung der Verkündungsblätter – dort
liegt die Angabe „zuletzt geändert durch …".

**Verwaltungsvorschrift:**

- Normgeber
- Erlass- und Fassungsdatum der angezeigten Vorschrift
- Geltungsdatum oder -zeitraum
- Gliederungsnummer
- Fundstelle des Ur-Gesetzes im Verkündungsblatt
- vollständiger Text

**Nicht als eigenes Feld ausgewiesen**, aber in den Titeln durchgängig vorhanden:

- *Ausfertigungsdatum* steckt im Titel: „Waldgesetz für das Land Schleswig-Holstein (Landeswaldgesetz
  – LWaldG) **vom 5. Dezember 2004**"
- *Außerkrafttreten* erscheint als „gültig bis" innerhalb des Geltungszeitraums

**Amtliche vs. juris-Abkürzung weichen ab.** Der Identifikator `jlr-VwGSHV57P108` nutzt `VwGSH`, die
amtliche Abkürzung ist `LVwG`; die jlink-Query lautet `query=WaldG+SH`, amtlich ist `LWaldG`; für das
Landesbeamtengesetz `LBG` lautet die Query `BG+SH`. Ein Importer braucht daher eine **Mapping-Tabelle
juris-Abkürzung ↔ amtliche Abkürzung**; er darf sie nicht gleichsetzen.

**Fundstellen** erscheinen in zwei Blättern: `GVOBl. Schl.-H.` (Gesetze, Verordnungen) und
`Amtsbl. Schl.-H.` (Verwaltungsvorschriften, z. B. „Amtsbl. Schl.-H. 2018 Nr. 15, S. 284").

**Titelmuster** (aus den indexierten `<title>`-Tags, brauchbar als Parser-Fallback):

```
Landesrecht:
  Schleswig-Holstein - <§/Art> <Abk> | Landesnorm Schleswig-Holstein | <Überschrift>
    | <Langtitel> | gültig ab: <TT.MM.JJJJ> [| gültig bis: <TT.MM.JJJJ>]

Verwaltungsvorschrift:
  <Normgeber> | Verwaltungsvorschrift (Schleswig-Holstein) | <Titel>
    | i. d. F. v. <TT.MM.JJJJ> | gültig ab <TT.MM.JJJJ> [| gültig bis <TT.MM.JJJJ>]

Gesamtausgabe:
  … | Landesnorm Schleswig-Holstein | Gesamtausgabe | <Langtitel> | gültig von: … gültig bis: …
```

---

## 4. Fassungen und Historie

**Befund: Historische Fassungen sind vorhanden und öffentlich adressierbar.** Das ist für den Stichtag
2023-12-01 die entscheidende Frage, und sie ist positiv zu beantworten – mit Einschränkungen.

### 4.1 Belege

**Amtliche Permalink-Typologie** (Hilfe, `dokumentausgabe.jsp`), wörtlich:

> Folgende Permalinks stehen je nach Kategorie zur Verfügung:
> Rechtsprechung: auf genau dieses Dokument
> Landesrecht Rahmendokument: auf genau dieses Dokument / auf die gültige Fassung / auf die Gesamtausgabe
> Landesrecht Einzel-/Gliederungsnorm: auf genau dieses Dokument / auf die gültige Fassung
> Verwaltungsvorschriften: auf die gültige Fassung
> Ortsrecht: auf genau dieses Dokument
> Verkündungsblätter: auf genau dieses Dokument

Die Unterscheidung „auf genau dieses Dokument" (fassungsfest) gegenüber „auf die gültige Fassung"
(gleitend) belegt, dass eine **einzelne Fassung** dauerhaft adressierbar ist.

**Zeitliche Tiefe** (juris-Produktseite `landesrecht-schleswig-holstein.jsp`), wörtlich:

> Der Aufbau des historischen Datenbestandes beginnt zum Stichtag 1. Januar 2003.
> Vorschriften, die nach diesem Zeitpunkt außer Kraft gesetzt wurden, stehen weiterhin zur Recherche bereit.

Der Projektstichtag 2023-12-01 liegt weit innerhalb dieses Zeitraums.

**Konkrete Stichtagsfälle** aus dem Index – Fassungen mit abgeschlossenem Geltungszeitraum, die am
2023-12-01 in Kraft waren und weiterhin unter eigener ID erreichbar sind:

| ID | Norm | Geltungszeitraum |
| --- | --- | --- |
| `jlr-EltBeirWOSH2022pP13` | § 13 EB-WahlVO | 2022-07-31 – 2024-08-30 |
| `jlr-ZeugnVSH2018V7P5` | § 5 ZVO | 2023-07-30 – 2024-12-17 |
| `VVSH-2032.29-0001` | VwV Vermögenswirksame Leistungen | 1999-01-01 – 2023-12-31 |

Vollständig aufgehobene Normen bleiben ebenfalls erreichbar, etwa
`jlr-CoronaVQuarVSH2pP3` (§ 3 CoronaVQuarV SH 2, gültig 2020-05-17 – 2020-06-14).

**Zukunftsfassungen existieren ebenfalls:** `jlr-PersRWahlVSH2018V2P1` ist „gültig ab: 01.01.2026".
Ein Importer darf deshalb **nicht** annehmen, die höchste Fassungsnummer sei das geltende Recht – er
muss den Geltungszeitraum gegen den Stichtag prüfen.

### 4.2 Einschränkungen und Risiken

**Keine Stichtagssuche.** Die „Erweiterte Suche" bietet die Felder *Text, Fundstelle, Datum, Titel,
Autor/Gericht, Norm, AZ/ECLI*. Zum Datumsfeld sagt die Hilfe: „Es handelt sich regelmäßig um das
Veröffentlichungsdatum oder Erlassdatum." **Ein Feld „Geltungsdatum"/„Stand" gibt es nicht.** Eine
Abfrage der Art „alle Normen in der am 2023-12-01 geltenden Fassung" ist über die dokumentierte
Suchoberfläche nicht möglich. Die Fassungsauswahl muss über die Dokumentnavigation oder über
Fassungs-IDs erfolgen.

**Verwaltungsvorschriften ohne Fassungsanker.** Für VwV nennt die Hilfe **nur** den Permalink „auf die
gültige Fassung" – keinen fassungsfesten. Zusätzlich führt die Kategorie „Verwaltungsvorschriften"
laut Hilfe nur „alle Verwaltungsverschriften, die aktuell gültig sind". Für den Stichtag 2023-12-01
ist die VwV-Historie damit **deutlich schlechter erschlossen** als das Gesetzes- und Verordnungsrecht.
Das ist das größte inhaltliche Risiko des Vorhabens.

**Rückwirkung kommt vor.** `VVSH-6642.40-MBWK-20200122-SF` hat Fassungsdatum 2020-01-22, aber
Geltungsbeginn 2020-01-01. Eine Invariante „Fassungsdatum ≤ Geltungsbeginn" wäre falsch.

**Produkt ≠ Bürgerservice.** Die Angabe zur historischen Tiefe ab 2003 stammt von der Produktseite des
**kostenpflichtigen** juris-Angebots. Ob der kostenfreie Bürgerservice denselben historischen Umfang
zeigt, ist nicht belegt. Die oben genannten Stichtagsfälle sind indexiert und sprechen dafür, beweisen
es aber nicht flächendeckend.

---

## 5. Darstellungsformen

| Form | Adressierung | Eignung als Parserinput |
| --- | --- | --- |
| Einzelnorm (HTML) | `/bssh/document/<ID>` | gut – kleinste sinnvolle Einheit, vollständige Metadaten |
| Gesamtausgabe (HTML) | `/bssh/document/<ID>/part/X` bzw. `…&aiz=1` | **beste Wahl** – ganze Norm in einem Abruf, mit vorangestelltem Inhaltsverzeichnis |
| XSL-Rendering | `/bssh/document/<ID>/format/xsl[/part/X]` | unklar – Name deutet auf serverseitige XSL-Transformation; ob hier XML oder HTML ausgeliefert wird, ist **nicht verifiziert** |
| Titeldokument | `/bssh/document/<ID>rahmen` | nötig für Änderungshistorie und Fundstellen |
| PDF (Normen) | – | **kein nativer Endpunkt.** Die Hilfe beschreibt PDF-Erzeugung nur über den Browser: „Nach dem Öffnen eines Dokumentes klicken Sie auf Screen und speichern es danach über Ihren Browser ab." |
| PDF (Verkündungsblätter) | Kategorie Verkündungsblätter | nativ: „In der Dokumentansicht bekommen Sie die Verkündung in PDF-Format." |

**Empfehlung für den Parserinput:** die **Gesamtausgabe** (`/part/X` bzw. `aiz=1`) je Stammnorm,
ergänzt um das **Rahmendokument** für Änderungshistorie und Fundstellen. Das minimiert die Zahl der
Abrufe erheblich – statt eines Abrufs je Paragraf genügt einer je Norm – und liefert zugleich die
Gliederungsstruktur, weil der Gesamtausgabe ein Inhaltsverzeichnis vorangestellt ist.

Ob `/format/xsl` eine maschinenfreundlichere Repräsentation liefert, sollte **als erstes** geprüft
werden, sobald eine Freigabe vorliegt. Eine XML-Ausgabe würde den Parseraufwand drastisch senken.

**Eine JSON- oder XML-API ist nicht dokumentiert.** In der gesamten Portal-Hilfe findet sich kein
Hinweis auf eine Programmierschnittstelle, keinen Bulk-Download und kein Datenexportformat.

---

## 6. HTML-Struktur

**Dieser Abschnitt konnte nicht belegt werden.** Er hätte konkrete Container- und Klassennamen
erfordert, und die sind nur durch einen Abruf einer Portalseite zu ermitteln – der nach Abschnitt 1.2
untersagt ist. Es werden hier bewusst **keine** vermuteten Klassennamen angegeben, da sie sich nicht
von Tatsachen unterscheiden ließen.

Was sich aus der Hilfe über den **Aufbau** (nicht das Markup) sagen lässt:

- Die Dokumentansicht gliedert sich in zwei Kernbereiche: links das Inhaltsverzeichnis des Gesetzes
  („mit dem sich bequem im gesamten Normkomplex navigieren lässt"), in der Mitte der Dokumentinhalt.
- Über die Überschrift im linken Bereich gelangt man ins Titeldokument.
- Der Gesamtausgabe ist ein nichtamtliches Inhaltsverzeichnis vorangestellt, das zugleich
  Navigationsanker zu den Einzelvorschriften trägt – es dürfte also Sprungziele je Paragraf enthalten.
- Einzelnormdokumente enthalten „alle dokumentarischen Hinweise und Sprungverweise".
- Anlagen sind **eigenständige Dokumente** mit eigener ID (`…Anlage1`), keine Abschnitte innerhalb des
  Paragrafentexts. Tabellen in Anlagen (etwa Gebührenverzeichnisse wie `jlr-BauGebVSH2022pAnlage1`)
  sind daher separat zu holen und zu parsen.

**Offen bleiben:** Klassennamen und Container für Teil/Abschnitt/Kapitel/§/Artikel/Absatz/Nummer,
Tabellenmarkup, Fußnotenmarkup und Anlagenauszeichnung; außerdem die Frage der
JavaScript-Abhängigkeit (siehe Abschnitt 9).

---

## 7. Enumerationspfade

Maschinenlesbar in `data/audits/schleswig-holstein/discovery/enumeration-paths.json`.

### 7.1 Primärweg: Kategoriebaum „Gesetze/Verordnungen"

Die Hilfe beschreibt ihn wörtlich:

> Die Kategorie **Gesetze/Verordnungen** entspricht dem Fundstellennachweis Schleswig-Holstein. Die
> einzelnen (Unter-)Kategorien können Sie über die Pfeile so weit aufklappen, bis die zu einem
> Endgliederungspunkt zugehörigen Gesetze und Verordnungen angezeigt werden.

Zwei Eigenschaften machen ihn zum deterministischen Enumerationsweg:

> Die Anzahl der in einer Kategorie verfügbaren Dokumente wird jeweils in Klammern angezeigt.

> Wenn Sie eine Kategorie/Unterkategorie auswählen, **bevor** Sie eine Suche durchgeführt haben,
> erhalten Sie eine Ansicht **aller** in der jeweiligen Kategorie/Unterkategorie enthaltenen Dokumente.

Damit ist sowohl vollständige Auflistung ohne Suchbegriff möglich als auch ein **Soll-Ist-Abgleich**
gegen die angezeigten Zähler – dasselbe Fixpoint-Muster, das im West-Import (RECHT.NRW) bereits
verwendet wurde.

**Paging:** 25 Dokumente je Seite, Standardsortierung Datum absteigend, umstellbar auf Relevanz.
Für einen Importer ist die Datumssortierung vorzuziehen, weil sie stabil ist; Relevanzsortierung ist
von Suchbegriffen abhängig und damit nicht reproduzierbar.

### 7.2 Sekundärweg: Registerdokumente

`jlr-FFNInhaltSH` (FFN-Inhaltsübersicht) und `jlr-FFNSystemSH` (Systematische Übersicht) sind
**reguläre Dokumente mit eigener jlr-ID** und damit wie jede Norm adressierbar – vermutlich jeweils
ein einziges HTML-Dokument mit der vollständigen Liste. Das wäre der eleganteste Einstieg, weil es
ohne Paging auskommt. Inhalt und Linkformat sind nicht verifiziert.

### 7.3 Verwaltungsvorschriften

Der Kategoriebaum führt nur aktuell gültige VwV. Für den Stichtag sind zusätzlich die
Gliederungsnummern-Adressen nötig
(`query=VVSH-<Gliederungsnr>-<Ressort>-<YYYYMMDD>-SF` bzw. `query=VVSH-<Gliederungsnr>-0001`).
Die Gliederungsnummern sind sachgebietsstrukturiert (beobachtet: 2032.29, 2036.38, 2130.117, 2135.27,
6642.40). Ein Durchzählen des opaken Nummernraums (beobachtet `VVSH000004586` bis `VVSH000007304`)
wäre Brute Force – robots-widrig und **nicht empfohlen**.

### 7.4 Sitemap

`https://www.gesetze-rechtsprechung.sh.juris.de/sitemapindex.xml` ist in der `robots.txt` deklariert,
liegt aber im gesperrten Pfadraum und wurde nicht abgerufen. Nach einer Freigabe wäre sie der
belastbarste Vollständigkeitsanker, weil vom Betreiber selbst gepflegt und maschinenlesbar.

---

## 8. Umfangsschätzung

| Bestand | Größenordnung | Quelle / Verlässlichkeit |
| --- | --- | --- |
| Gesetze und Verordnungen | **über 1.400** | juris-Produktseite, wörtlich: „Das Landesrecht Schleswig-Holstein enthält vollständig das geltende Landesrecht mit derzeit über 1.400 Gesetzen und Verordnungen." Bezieht sich auf das kostenpflichtige Produkt; Bürgerservice-Umfang kann abweichen. |
| Verwaltungsvorschriften | einige Tausend (grob) | Nur aus beobachteten Kennungen `VVSH000004586`–`VVSH000007304` abgeleitet; der Nummernraum enthält auch außer Kraft getretene Vorschriften. **Geringe Konfidenz.** |
| Historische Tiefe | ab 2003-01-01 | juris-Produktseite |
| Verkündungsblätter | GVOBl. ab 2010, Amtsbl. ab 2012, SchlHA ab 09/2017 | Portal-Hilfe |

Zum Vergleich: Der eingefrorene West-Referenzbestand (NRW) umfasst 1.482 Normen. Schleswig-Holstein
liegt mit „über 1.400" Gesetzen und Verordnungen in derselben Größenordnung – der Importaufwand ist
strukturell vergleichbar, sofern der Zugang geklärt wird.

---

## 9. Rate-Limits, Nutzungsregeln, technische Zwänge

### 9.1 Beobachtetes Verhalten

In dieser Discovery wurden **27 HTTP-Anfragen** gestellt, stets mit mindestens 2 Sekunden Pause:
21× HTTP 200, 1× HTTP 403 (`recht.schleswig-holstein.de`), 3× Verbindungstimeout
(`www.landesrecht.schleswig-holstein.de`, drei Versuche) und 2× DNS-Fehler (`sh.juris.de`,
`www.landesrecht-bremen.de` – beide existieren nicht mehr). **Keine 429-Antwort, kein Backoff nötig, keine Sperrsignale.** Alle
abgerufenen Hosts antworteten normal. Das sagt jedoch wenig aus, da der eigentliche Zielhost
überhaupt nicht abgerufen wurde.

### 9.2 Deklarierte Grenzen

- `www.gesetze-rechtsprechung.sh.juris.de`: **`Disallow: /`** für alle nicht benannten Crawler – die
  härteste denkbare Grenze.
- `verkuendungsportal.schleswig-holstein.de`, `www.schleswig-holstein.de`, `www.gdi-sh.de`:
  **`Crawl-delay: 180`** – rund 20 Abrufe pro Stunde.
- `opendata.schleswig-holstein.de`: `Crawl-delay: 10`, `/api/` gesperrt.

### 9.3 Cookies, Session, JavaScript

**Nicht ermittelt**, da kein Portalabruf erfolgte. Zwei Indizien sprechen jedoch für JS-Abhängigkeit
der Oberfläche:

- Die Hilfe beschreibt die Bedienung durchgehend interaktiv – aufklappbare Kategoriebäume über
  „Pfeile", ein stufenlos per Maus ziehbarer Trennbalken, eine Vorschlagsliste mit Trefferzahlen.
- „Die gewählten Einstellungen werden nur sitzungsbezogen gespeichert" deutet auf Session-State.

Andererseits belegen die Suchmaschinentreffer, dass **Dokumentseiten serverseitig gerenderten Inhalt
liefern** – Titel, Überschriften und Geltungsdaten stehen im `<title>` und sind indexiert. Für die
reine Dokumentabholung dürfte kein Browser nötig sein; für die **Navigation** (Kategoriebaum) ist das
offen. Das muss vor dem Importerbau geprüft werden.

### 9.4 Rechtliche Nutzungsregeln

Das Impressum weist das Land Schleswig-Holstein als Diensteanbieter und juris als technischen
Umsetzer aus. Es enthält einen Haftungsausschluss, aber **keine Lizenzaussage** zur Weiterverwendung.

Öffentlich zugängliche Nutzungshinweise der juris-Bürgerservice-Portale unterscheiden zwischen
Recherche (kostenfrei) und **Weiterveröffentlichung im Volltext bzw. Weiterverkauf** (grundsätzlich
kostenpflichtig, unabhängig von kommerzieller Absicht); redaktionelle Bestandteile stehen unter
Urheberrechtsschutz. Diese Aussagen wurden im Rahmen dieser Discovery **nicht am Originaldokument
verifiziert** und beziehen sich in den eingesehenen Formulierungen teils ausdrücklich auf
Rechtsprechung.

**Das ist für dieses Projekt direkt relevant:** Ein Portal, das die Normtexte republiziert, fällt genau
in den Bereich „Weiterveröffentlichung im Volltext". Gesetzestexte selbst sind nach § 5 UrhG
gemeinfrei; die **konsolidierte Fassung** als redaktionelle Leistung von juris ist es möglicherweise
nicht. Diese Frage ist vor einem Import juristisch zu klären und nicht technisch zu umgehen.

---

## 10. Offene Fragen und Risiken

### Blockierend

1. **robots-Vollsperre.** Ohne Freigabe ist kein konformer Abruf möglich. → Schriftliche Anfrage an
   das Zentrale IT-Management SH (`poststelle@stk.landsh.de`) und/oder juris (`service@juris.de`);
   idealerweise Datenlieferung statt Crawl.
2. **Urheber- und nutzungsrechtliche Zulässigkeit der Republikation** der konsolidierten Fassungen.
   Vor jeder Implementierung zu klären.

### Inhaltlich

3. **HTML-Struktur unbekannt.** Der gesamte Abschnitt 6 ist eine Lücke. Aufwandsschätzung für den
   Parser ist derzeit nicht seriös möglich.
4. **VwV-Historie schwach.** Kein fassungsfester Permalink, Kategoriebaum nur mit gültigen
   Vorschriften. Fraglich, ob der Stand 2023-12-01 für Verwaltungsvorschriften überhaupt vollständig
   rekonstruierbar ist. Ggf. Scope-Entscheidung: VwV zunächst ausklammern.
5. **Fassungssegment-Hypothese** (`p` / `V<n>`) unbestätigt. Falls falsch, bricht die Stichtagslogik.
6. **Keine Stichtagssuche.** Der Weg zur Fassung vom 2023-12-01 je Norm ist nicht geklärt – nur, dass
   solche Fassungen existieren und adressierbar sind.
7. **`/format/xsl` ungeklärt.** Könnte XML liefern und den Parseraufwand halbieren – oder nur eine
   HTML-Variante sein.
8. **juris- vs. amtliche Abkürzung** weichen systematisch ab; Mapping-Tabelle nötig.
9. **Abgrenzung Ortsrecht.** KSH-Recht liegt im selben Portal, ist aber kommunales Satzungsrecht.
   Scope-Entscheidung nötig.

### Technisch

10. **JavaScript-Abhängigkeit der Navigation** nicht geprüft.
11. **Rate-Limit-Verhalten des Zielhosts** unbekannt (nie abgerufen). Die Crawl-delay-Werte der
    Landesportale (180 s) mahnen zu Vorsicht.
12. **Umlaute in IDs** erfordern korrekte Prozentkodierung.
13. **Zukunftsfassungen** im Bestand – Geltungszeitraum muss stets gegen den Stichtag geprüft werden.

### Alternativen, falls keine Freigabe erfolgt

- **Verkündungsportal SH** (`verkuendungsportal.schleswig-holstein.de`): robots-konform, liefert aber
  nur Verkündungsfassungen als PDF. Eigenkonsolidierung auf 2023-12-01 wäre ein eigenes Großprojekt;
  Crawl-delay 180 s macht den Bulk-Lauf zusätzlich unrealistisch.
- **opendata.schleswig-holstein.de**: nicht abschließend auf Landesrechtsdatensätze geprüft –
  empfohlener nächster Rechercheschritt, da `/api/` gesperrt ist, Datensatzseiten aber nicht.

---

## Anhang: Erzeugte Artefakte

| Pfad | Inhalt |
| --- | --- |
| `docs/SCHLESWIG_HOLSTEIN_SOURCE_DISCOVERY.md` | dieses Dossier |
| `data/audits/schleswig-holstein/discovery/juris-samples.json` | 29 Beispieldokumente mit ID, Typ, Metadaten, Evidenzstufe |
| `data/audits/schleswig-holstein/discovery/enumeration-paths.json` | Enumerationspfade, Alternativquellen, Umfangsschätzung |
| `.cache/schleswig-holstein/*.bin` / `*.json` | 22 Rohabrufe mit Metadaten (git-ignoriert über `.gitignore:24`) |

Jeder Eintrag in den JSON-Dateien trägt ein Feld `evidence` (`fetched` / `help-page` / `search-index`)
und `verifiedByFetch`. **Kein Beispieldokument des Zielportals wurde abgerufen**; alle sind mit
`verifiedByFetch: false` markiert und vor dem Importerbau zu verifizieren.
