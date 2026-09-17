# Quellen-Discovery: Konsolidiertes Landesrecht Bayern (BAYERN.RECHT)

Stand: 2026-09-17 · Auftrag: Vorbereitung eines Importers (kein Importer-Code in diesem Dokument)
· Projektstichtag der Simulation: 2023-12-01

Maschinenlesbare Rohbefunde: `data/audits/bayernrecht/discovery/*.json`
(`index.json` enthält die Abrufbilanz und eine Kurzfassung der Bewertung).

## Kurzfassung

Bayern ist der bislang **günstigste** der untersuchten Landesrechtsbestände.

Die `robots.txt` des Zielportals erlaubt automatisierten Zugriff pauschal, die Nutzungshinweise
räumen an den Vorschriftentexten ein örtlich, zeitlich und inhaltlich unbeschränktes Nutzungsrecht
ein – und es existiert ein **strukturierter XML-Export je Norm**, der über die Portaloberfläche
offiziell dokumentiert ist. Zwei vollständige, unpaginierte Fundstellennachweise liefern 2.311
Dokument-IDs in einem einzigen Abruf. Ein HTML-Scraper ist für Bayern nicht nötig.

Drei Befunde sind für den Importerbau unangenehm und müssen früh eingeplant werden:

1. Der Export verwendet **zwei verschiedene, nicht ineinander überführbare DTDs** – eine für
   Gesetze/Verordnungen (`byrecht-norm`), eine für Verwaltungsvorschriften (`byrecht-vv`). Der
   Parser braucht zwei Frontends.
2. Die **Portal-Dokument-IDs sind nicht die XML-IDs**. Wer die URL-Adressierung aus den XML-Attributen
   ableitet, erzeugt falsche Permalinks.
3. **Historische Fassungen gibt es nicht.** Das Portal führt ausschließlich den aktuellen Stand und
   sagt das ausdrücklich. Für den Stichtag 2023-12-01 gibt es aus diesem Portal keine Baseline.

---

## 1. Portal, Betreiber, Zugänglichkeit

| Feld | Wert |
| --- | --- |
| Bezeichnung | Bürgerservice BAYERN.RECHT |
| Host | `www.gesetze-bayern.de` |
| Herausgeber | Bayerische Staatskanzlei |
| Technische Umsetzung / Konsolidierung | Verlag C.H.Beck GmbH & Co. KG im Auftrag des Freistaats Bayern |
| Plattform | ASP.NET Core (Sitzungscookie `bayern-sessionid`, Antiforgery-Token), Matomo-Tracking |
| Amtliche Verkündung | `www.verkuendung-bayern.de` (Verkündungsplattform Bayern) |

### 1.1 robots.txt – wörtlich

`https://www.gesetze-bayern.de/robots.txt` (HTTP 200, `text/plain`, 22 Bytes,
SHA-256 `44f3f8ea…8789f4`, abgerufen 2026-09-17T07:47:21Z):

```
User-agent: *
Allow: /
```

Das ist der vollständige Dateiinhalt. Keine `Disallow`-Regel, kein `Crawl-delay`, keine
Sitemap-Deklaration. **Automatisierter Zugriff auf den gesamten Host ist ausdrücklich gestattet.**

`www.verkuendung-bayern.de` liefert auf `/robots.txt` HTTP 404 mit einer HTML-Fehlerseite
(„Seite nicht gefunden – Verkündungsplattform Bayern“). Es existiert dort **keine** robots.txt,
also auch keine Ausschlussregel.

`www.bayerische-staatszeitung.de` (Verlag der GVBl.-Papierausgabe) sperrt `GPTBot` vollständig und
formuliert im Kommentarblock einen ausdrücklichen TDM-Vorbehalt nach § 44b UrhG sowie ein Verbot
automatisierten Zugriffs ohne Erlaubnis. **Von diesem Host wurde außer der robots.txt nichts
abgerufen, und es ist auch nichts abzurufen** – er betreibt reinen Papiervertrieb und ist für den
Importpfad irrelevant.

### 1.2 Abrufdisziplin dieser Erkundung

Alle Abrufe liefen sequenziell mit mindestens 1,7 Sekunden Pause, unter einem identifizierenden
User-Agent (`landesrecht-discovery/0.1 (Forschungsprojekt Simulationsrecht; …)`), gegen eine harte
Obergrenze von 150 Abrufen, mit vollständiger Ablage in `.cache/bayernrecht/` (gitignored). Der
Cache enthält insgesamt **26 Abrufe**: 15 des Vorgänger-Agenten, 11 dieses Laufs. Es wurde kein
Massenabruf durchgeführt – keine Trefferlistenpaginierung durchlaufen, kein CSV-Export ausgelöst,
keine einzelne PDF-Beilage geladen.

---

## 2. Der XML-Export (Kernbefund)

### 2.1 Endpunkt und offizielle Dokumentation

```
https://www.gesetze-bayern.de/Content/Zip/<Kurzbezeichnung>
```

Der Export ist kein zufällig gefundener Nebeneingang, sondern in der Portalhilfe dokumentiert
(`/Content/Document/Hilfe`, Abschnitt „3. Exportieren“):

> „Zuletzt besteht die Möglichkeit, das Dokument als XML-Datei herunterzuladen. Diese ZIP-Datei
> enthält neben der XML-Datei auch die notwendigen Zusatzinformationen und Bilddateien.“

Auf jeder Dokumentseite steht der Link im Download-Popover neben PDF (`/Content/Pdf/<id>?all=False`)
und RTF (`/Content/Rtf/<id>?all=False`).

### 2.2 Containerformat

Das ZIP folgt der OpenDocument-Packaging-Konvention: erste Eintragsdatei `mimetype` im Klartext,
dann `META-INF/manifest.xml`, dann die Nutzdaten.

`META-INF/manifest.xml` von `BayAbmG` – vollständig:

```xml
<?xml version="1.0" encoding="iso-8859-1"?>
<manifest xmlns="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
	<file-entry media-type="application/beck.bayportalnorm.text" full-path="/bayportalnorm/BayAbmG.xml" />
</manifest>
```

Die Kennung in `mimetype` variiert mit dem Paketinhalt – **belegt** an vier Instanzen:

| Norm | `mimetype` | Paketeinträge |
| --- | --- | --- |
| `BayAbmG` (Gesetz) | `bayportalnorm+zip` | 3 |
| `BayVerf` (Verfassung) | `bayportalnorm+zip` | 3 |
| `BayVwV312180` (Verwaltungsvorschrift) | `bayportalvv+zip` | 5 (XML + 2 PDF) |
| `BayKVzKG` (Verordnung mit Anlage) | `pdf+zip` | 24 (XML + 21 PDF) |

Media-Types im Manifest: `application/beck.bayportalnorm.text`,
`application/beck.bayportalvv.text`, `application/pdf`.

### 2.3 Zwei DTDs, keine Namensräume

Das ist der wichtigste Strukturbefund. **Keiner der vier untersuchten Exporte verwendet
XML-Namensräume** (`xmlns`-Deklarationen: keine). Stattdessen eine DTD-Referenz – und zwar je nach
Normtyp eine **andere**:

Gesetze, Verordnungen, Verfassung:

```xml
<!DOCTYPE byrecht-norm PUBLIC "-//Verlag C.H.Beck/DTD Vorschriften//DE"
  "http://gesetze-bayern.de/schema/byrecht.normen.dtd">
<byrecht-norm builddate="17.09.2026_02:00">
```

Verwaltungsvorschriften:

```xml
<!DOCTYPE byrecht-vv PUBLIC "-//Verlag C.H.Beck/DTD Verwaltungsvorschriften//DE"
  "http://gesetze-bayern.de/schema/byrecht.vv.dtd">
<byrecht-vv>
```

Die beiden Modelle teilen fast nichts außer dem Tabellenvokabular und `verweis.norm`. Die
DTD-Dateien selbst wurden **nicht** abgerufen; alle folgenden Aussagen sind aus den vier realen
Exportinstanzen abgeleitet. Sie sind damit belegt, aber nicht notwendig vollständig.

### 2.4 Das Norm-Modell (`byrecht-norm`)

#### Kopf: wo die Metadaten stehen

Vollständiger `<kopf>` von `BayAbmG`:

```xml
<byrecht-norm builddate="17.09.2026_02:00">
  <kopf>
    <angaben.versunabh>
      <dokumentation doktyp="gesetz" dokid="BayAbmG" ersatz="BayAbmG" />
      <ausfertigung>
        <ausfertigungsdatum>1981-08-06</ausfertigungsdatum>
        <fundstelle.GVBl>
          <jahr>1981</jahr>
          <seite>S=318</seite>
        </fundstelle.GVBl>
      </ausfertigung>
    </angaben.versunabh>
    <angaben.versabh version.id="p">
      <inkraft>2015-08-01</inkraft>
      <fassung>
        <fassungsdatum>1981-08-06</fassungsdatum>
        <fundstelle.GVBl>
          <jahr />
          <seite />
        </fundstelle.GVBl>
      </fassung>
      <gliederungsNr.BayRS>BayRS 219-2-F
</gliederungsNr.BayRS>
      <kurzbezeichnung>Abmarkungsgesetz</kurzbezeichnung>
      <titelangaben>Gesetz über die Abmarkung der Grundstücke<br /> (<kurzbezeichnung>Abmarkungsgesetz</kurzbezeichnung> – <amtlicheAbk>AbmG</amtlicheAbk>)<br />Vom 6. August 1981<br />(BayRS III S. 690)<br />BayRS 219-2-F
</titelangaben>
      <amtlicheAbk>AbmG</amtlicheAbk>
    </angaben.versabh>
  </kopf>
```

Daraus die Feldzuordnung:

| Gesuchtes Feld | Fundort |
| --- | --- |
| Langtitel | `angaben.versabh/titelangaben` (Fließtext mit `<br/>`, enthält Kurzbezeichnung und Abkürzung als Kindelemente) |
| Kurzbezeichnung | `angaben.versabh/kurzbezeichnung` |
| Amtliche Abkürzung | `angaben.versabh/amtlicheAbk` |
| BayRS-Nummer | `angaben.versabh/gliederungsNr.BayRS` |
| Ausfertigungsdatum | `angaben.versunabh/ausfertigung/ausfertigungsdatum` (ISO 8601) |
| Fundstelle Ausfertigung | `angaben.versunabh/ausfertigung/fundstelle.GVBl/{jahr,seite}` |
| Fassungsdatum | `angaben.versabh/fassung/fassungsdatum` |
| Inkrafttreten | `angaben.versabh/inkraft` |
| Dokument-ID | `dokumentation/@dokid` |
| Normtyp | `dokumentation/@doktyp` (beobachtet: `gesetz`, `verordnung`) |
| Konsolidierungsstand | `/byrecht-norm/@builddate`, Format `TT.MM.JJJJ_HH:MM` |
| Änderungsstand | `rumpf/aenderungsverlauf` (alle Änderungen) und `rumpf/normzitat` (amtliches Vollzitat) |

Drei Fallen, alle belegt:

- **Seitenangaben sind präfigiert**: `<seite>S=318</seite>`, nicht `318`.
- **`gliederungsNr.BayRS` trägt einen abschließenden Zeilenumbruch** im Elementinhalt.
- **Felder können leer sein.** Die Verfassung hat `<kurzbezeichnung></kurzbezeichnung>` und
  `<amtlicheAbk />`. Und `<fassung><fundstelle.GVBl><jahr /><seite /></fundstelle.GVBl>` von
  `BayAbmG` zeigt: auch die Fundstellenelemente kommen leer vor.

Die Portalanzeige korrespondiert direkt mit diesen Feldern – und zwar so genau, dass sie sich als
Gegenprobe beim Parsen eignet:

| Dokument | Kopfleiste im Portal | XML |
| --- | --- | --- |
| `BayAbmG` | „AbmG“ · „Text gilt ab: 01.08.2015“ · „Fassung: 06.08.1981“ | `amtlicheAbk` · `inkraft` · `fassungsdatum` |
| `BayVerf` | *(leer)* · „Text gilt ab: 01.01.2020“ · „Fassung: 15.12.1998“ | leeres `<amtlicheAbk />` · `inkraft` · `fassungsdatum` |
| `BayVwV312180` | „RedR“ · „Text gilt ab: 01.01.2026“ · *(keine Fassungszeile)* | `bayernrecht_abkuerzung` · `bayernrecht_inkraft` · kein Fassungsdatum in der VV-DTD |

Die leere Abkürzungszelle der Verfassung und die fehlende Fassungszeile der Verwaltungsvorschrift
sind also keine Darstellungsfehler, sondern spiegeln das jeweilige Datenmodell.

Bei der Verfassung fallen Ausfertigung und Fassung auseinander – `<ausfertigungsdatum>1998-12-15`
mit `<fundstelle.GVBl><jahr>1946</jahr><seite>S=333</seite>` gegenüber `<fassung>` mit
`<jahr>1998</jahr><seite>S=991</seite>`. Wer die Fundstelle aus dem falschen Block liest, datiert
die Bayerische Verfassung auf 1946 statt auf die Neubekanntmachung 1998.

#### Änderungsverlauf und Vollzitat

```xml
<rumpf>
  <aenderungsverlauf>
    <p>Änderungen</p>
    <ul>
      <li>
        <symbol id="x">1.</symbol>
        <p>
        <verweis.norm>
          <v.abk ersatz="Bay_110_1989_0089">§ 7 ÄndG</v.abk>
        </verweis.norm>
       vom 23.3.1989<br />(GVBl. S. 89)</p>
      </li>
      …
    </ul>
  </aenderungsverlauf>
  <normzitat>Abmarkungsgesetz (AbmG) in der in der Bayerischen Rechtssammlung (BayRS 219-2-F) veröffentlichten bereinigten Fassung, das zuletzt durch § 1 Abs. 182 der Verordnung vom 26. März 2019 (GVBl. S. 98) geändert worden ist</normzitat>
```

`BayAbmG` führt acht Änderungseinträge von 1989 bis 2019. Dieser Block ist der einzige Ort, an dem
das XML etwas über die Zeitachse sagt.

#### Gliederung, Vorschrift, Absatz, Satz

```xml
<gliederung gliederungsid="G_2" version="p">
  <gliederung.titel><p>
    1. Teil
    Allgemeine Vorschriften
  </p></gliederung.titel>
  <einzelnorm version="p" einzelnormid="P_1"><para.nr>Art. 1</para.nr><para.titel>
      Zweck und Wirkung der Abmarkung
    </para.titel><jurAbsatz><absatz.nr>(1)</absatz.nr><absatz.text>
        <p>Zweck der Abmarkung ist, die Grenzen der Grundstücke durch Marken (Grenzzeichen) örtlich erkennbar zu bezeichnen.</p>
      </absatz.text></jurAbsatz>
```

Satznummern sind **Inline-Marker vor dem Satztext**, keine Container:

```xml
<p>
  <satz.nr id="xx">1</satz.nr>Die Abmarkung wird von den staatlichen Vermessungsbehörden vollzogen. <satz.nr id="xx">2</satz.nr>Daneben sind die Behörden, …
```

Die `id`-Werte sind Platzhalter ohne Informationsgehalt: `satz.nr id="xx"`, `symbol id="x"`,
`jurAbsatz id="xxx"`. Nicht als Anker verwenden.

**Gliederungen können schachteln.** `BayAbmG` ist flach (`G_1` = Inhaltsübersicht, `G_2`…`G_8` = sieben
Teile), die Verfassung nicht:

```xml
<gliederung gliederungsid="G_1" version="p">
  <gliederung.titel><p>
    Erster Hauptteil
    Aufbau und Aufgaben des Staates
  </p></gliederung.titel>
  <gliederung gliederungsid="G_2" version="p">
    <gliederung.titel><p>
      1. Abschnitt
      Die Grundlagen des Bayerischen Staates
    </p></gliederung.titel>
    <einzelnorm version="p" einzelnormid="P_2"><para.nr>Art. 1</para.nr>…
```

Ein `einzelnorm` kann auch **außerhalb** jeder Gliederung stehen. In der Verfassung ist `P_1` die
Präambel, direkt unter `<rumpf>`, mit leerem `<para.nr />`:

```xml
<einzelnorm version="p" einzelnormid="P_1">
  <para.nr />
  <para.titel>
    [Präambel]
  </para.titel>
  <jurAbsatz>
    <absatz.text>
      <p>Angesichts des Trümmerfeldes, zu dem eine Staats- und Gesellschaftsordnung ohne Gott, …</p>
```

#### Aufgehobene Vorschriften bleiben als Platzhalter stehen

```xml
<einzelnorm version="p" einzelnormid="P_40"><para.nr>Art. 35</para.nr><para.titel>
    <span class="i"> (aufgehoben)</span>
  </para.titel><jurAbsatz id="xxx"><absatz.text /></jurAbsatz></einzelnorm>
```

Der Parser muss `<absatz.text />` als leer erkennen und darf die Vorschrift nicht als fehlend
behandeln. In der Verfassung betrifft das genau neun Artikel – Art. 34 bis Art. 42, die Vorschriften
über den 1998 abgeschafften Senat.

#### Fußnoten stehen inline an der Aufrufstelle

```xml
… nach Art. <verweis.norm><v.norm ersatz="BayVermKatG">12</v.norm> Abs. 5 bis 7 des <v.abk ersatz="BayVermKatG">Vermessungs- und Katastergesetzes</v.abk></verweis.norm><fn.call><fn.text>1)</fn.text><fn.def><p>BayRS 219-1-F</p></fn.def></fn.call> Katastervermessungen ausführen, …
```

`fn.call` enthält **beides**: die Aufrufmarke (`fn.text`) und den Fußnotentext (`fn.def`). Es gibt
keinen separaten Fußnotenapparat am Dokumentende. `fn.text` kann leer sein (`<fn.text />` in der
Verfassung, Art. 13).

#### Verweise

```xml
<verweis.norm><v.norm ersatz="BayAbmG">7</v.norm> Abs. 2</verweis.norm>
```

`v.norm` trägt die Paragraphen-/Artikelzahl, `v.abk` die Normabkürzung; `@ersatz` ist jeweils die
**Ziel-Dokument-ID**. Das ergibt einen Zitiergraphen – allerdings einen nur teilweise auflösbaren.
Geprüft gegen die 2.311 IDs der Fundstellennachweise:

| Dokument | Verschiedene `@ersatz`-Ziele | Im Fundstellennachweis auflösbar | Nicht auflösbar |
| --- | --- | --- | --- |
| `BayAbmG` | 22 | 9 | 13 |
| `BayVerf` | 12 | 2 | 10 |
| `BayKVzKG` | 379 | 59 | 320 |
| `BayVwV312180` | 3 | 2 | 1 |

Die nicht auflösbaren Ziele sind erklärbar und im Kern harmlos:

- **Bundes- und EU-Recht**: `BGB`, `BauGB`, `GG`, `AO`, `AMG`, `AEG`, `ARegV` …
- **Änderungsgesetze mit synthetischen IDs**: `Bay_110_1989_0089`, `Bay_110_2003_0816` …
- **benannte Änderungsgesetze**: `BayAbmGAendG`, `BaySenAbschG`, `BayVerfRefG1998` …
- der Platzhalterwert `***`

Alle vier Gruppen sind im konsolidierten Bestand definitionsgemäß nicht enthalten.

#### Tabellen

HTML-nahes Modell, identisch in beiden DTDs:

```xml
<table rules="none" frame="above"><colgroup><col /><col /></colgroup>
  <thead>
    <tr>
      <th colspan="1" rowspan="1" style="text-align:left; vertical-align:top" valign="top" class="rb">
        <p><span class="b">Gegenstand</span></p>
      </th>
      …
  <tbody>
    <tr>
      <td colspan="1" rowspan="1" style="text-align:left; vertical-align:top" valign="top" class="r">
        <p>Allgemeine Amtshandlungen</p>
      </td>
```

Größenordnung: `BayKVzKG` enthält 39 Tabellen mit 4.172 Zeilen und 15.623 Zellen – das XML ist
3,2 MB groß. Der `class`-Wortschatz auf Zellen ist klein und rein typografisch (`r`, `b`, `rb`),
auf `span` ebenso (`b` fett, `i` kursiv, `text-center`).

#### Anlagen

```xml
<annex version="p" annexid="ANL_1">
  <annex.koerper version="p"><annex.nummer>Anlage</annex.nummer><annex.nummer int="1">Anlage</annex.nummer><annex.titel /><einzelnorm version="p" einzelnormid="P_4"><para.nr /><para.titel>
        Sachverzeichnis:
      </para.titel>…
```

Zwei Eigenheiten: `<annex.nummer>` erscheint **doppelt** – einmal ohne, einmal mit Attribut `int` –,
und `<annex.titel />` kann leer sein. Innerhalb der Anlage wird der normale `einzelnorm`-Baum
weiterverwendet, mit durchlaufender `einzelnormid` (`P_4` folgt auf `P_3` im Hauptteil).

### 2.5 Das Verwaltungsvorschriften-Modell (`byrecht-vv`)

Ein eigenes Modell mit eigener Metadatenwelt:

```xml
<byrecht-vv>
  <verwaltungsdaten doknr="BayVwV312180" worddokid="BayVwV312180" />
  <metadaten>
    <bayernrecht>
      <bayernrecht_langtitel>Richtlinien für die Redaktion von Rechtsvorschriften</bayernrecht_langtitel>
      <bayernrecht_kurztitel>Redaktionsrichtlinien</bayernrecht_kurztitel>
      <bayernrecht_abkuerzung>RedR</bayernrecht_abkuerzung>
      <bayernrecht_dokumentklasse wert="100" />
      <bayernrecht_fundstellen>
        <bayernrecht_fundstellen_organ wert="AllMBl." />
        <bayernrecht_fundstellen_jahrgang>2015</bayernrecht_fundstellen_jahrgang>
        <bayernrecht_fundstellen_seite>S=319</bayernrecht_fundstellen_seite>
      </bayernrecht_fundstellen>
      <bayernrecht_inkraft>2026-01-01</bayernrecht_inkraft>
    </bayernrecht>
  </metadaten>
  <textdaten>
    <vv1.0>
      <kopf>
        <titel>Richtlinien für die Redaktion von Rechtsvorschriften</titel>
      </kopf>
      <rumpf>
        <p typ="titel">103-S<br /><br />Richtlinien für die Redaktion von Rechtsvorschriften<br /> (Redaktionsrichtlinien – RedR)</p>
        <p typ="subtitel">Bekanntmachung der Bayerischen Staatsregierung<br />vom 16. Juni 2015, Az. B II 2 - G 49/13 - 5</p>
        <p typ="subtitel">(AllMBl. S. 319)</p>
        <p typ="vollzitat">Zitiervorschlag: Redaktionsrichtlinien (RedR) vom 16. Juni 2015 (AllMBl. S. 319), die zuletzt durch Bekanntmachung vom 16. Dezember 2025 (BayMBl. Nr. 587) geändert worden sind</p>
```

Unterschiede, die der Parser kennen muss:

| Aspekt | `byrecht-norm` | `byrecht-vv` |
| --- | --- | --- |
| Metadaten | `kopf/angaben.versunabh` + `angaben.versabh` | `metadaten/bayernrecht/*` |
| Dokument-ID | `dokumentation/@dokid` | `verwaltungsdaten/@doknr` |
| Konsolidierungsstand | `@builddate` am Wurzelelement | **fehlt vollständig** |
| BayRS-Nummer | `gliederungsNr.BayRS` | **kein Element**, nur Fließtext in `<p typ="titel">` |
| Ausfertigungsdatum | eigenes Element | **kein Element**, nur Fließtext in Subtitel/Vollzitat |
| Vorschriftencontainer | `einzelnorm` mit `para.nr` | `gliederung ebene="N"` mit `gliederung.nr` |
| Absatz | `jurAbsatz/absatz.nr/absatz.text` | schlicht `<p>` |
| Satzzählung | `<satz.nr id="xx">1</satz.nr>` | `<sup>1</sup>` |
| Anlagen | `<annex>` strukturiert | **nur PDF im ZIP-Paket** |

Die Satzzählung als `<sup>` ist besonders tückisch, weil `<sup>` auch echte Hochstellungen tragen
kann – die Unterscheidung ist kontextabhängig und im Modell nicht markiert.

Ein Detail, das das Norm-Modell nicht kennt: **`gliederung` trägt in der VV-DTD ein optionales
Attribut `inkraft`**.

```xml
<gliederung ebene="1" inkraft="2018-03-22">
  <gliederung.nr><p>9.</p></gliederung.nr>
  <gliederung.titel><p>Inkrafttreten</p></gliederung.titel>
  <p>Diese Bekanntmachung tritt am 1. August 2015 in Kraft.</p>
</gliederung>
```

In `BayVwV312180` kommen vier Werte vor (`2018-03-22`, `2022-01-01`, `2023-11-08`, `2026-01-01`).
Das ist abschnittsweise Zeitinformation – aber nur für Verwaltungsvorschriften, und nur zum
Inkrafttreten, nicht zu früheren Textständen.

### 2.6 PDF-Beilagen sind aus dem XML nicht referenziert

`BayVwV312180` bringt zwei Anhänge als PDF mit
(`pdf/BayVwV312180_BayVwV312180-A1-N1.pdf`, `pdf/BayVwV312180_BayVV103-S-064-KF-005-Anhang-001.pdf`).
Eine Suche nach diesen Dateinamen oder ihren Bestandteilen im XML liefert **keinen Treffer**.
Dasselbe gilt für die 21 PDFs in `BayKVzKG`. Die Zuordnung Beilage → Fundstelle im Text ist aus dem
Export allein **nicht** herstellbar; sie steht nur im Manifest, und dort ohne Kontext.

Das ist eine harte Einschränkung: für Verwaltungsvorschriften mit Anhängen liefert der XML-Export
den Anhangsinhalt nicht strukturiert und sagt auch nicht, wo er hingehört.

---

## 3. Abdeckung des Exports über die Normtypen

**Belegt: der ZIP-Export existiert für alle geprüften Normtypen.** Alle drei Abrufe lieferten
HTTP 200 mit `Content-Type: application/zip`:

| Norm | Normtyp | URL | Größe |
| --- | --- | --- | --- |
| `BayAbmG` | Gesetz | `/Content/Zip/BayAbmG` | 12.053 B |
| `BayVerf` | Verfassung | `/Content/Zip/BayVerf` | 30.062 B |
| `BayKVzKG` | Rechtsverordnung | `/Content/Zip/BayKVzKG` | 12.787.372 B |
| `BayVwV312180` | Verwaltungsvorschrift | `/Content/Zip/BayVwV312180` | 158.413 B |

Zusätzlich ist der ZIP-Link auf allen vier Dokumentseiten im HTML vorhanden – er wird also nicht
nur toleriert, sondern angeboten.

**Nicht geprüft** wurde der Normtyp `vertr` („Verträge, sonstige Rechtsquellen“, 208 Dokumente).
Dass der Export auch dort greift, ist plausibel, aber unbelegt.

---

## 4. Enumeration: wie man an alle Normen kommt

### 4.1 Was das Portal selbst zählt

Der Facettenbaum der Trefferliste (`/Search/Filter/NORMTYP/ges`, leitet auf `/Search/Hitlist` um)
nennt die Bestandszahlen in `data-count`-Attributen:

| Facette | Filterwert | Anzahl |
| --- | --- | --- |
| Vorschriften | `DOKTYP=norm` | **2.413** |
| … Gesetze | `NORMTYP=ges` | 241 |
| … Rechtsverordnungen | `NORMTYP=rv` | 486 |
| … Verwaltungsvorschriften | `NORMTYP=vv` | 1.478 |
| … Verträge, sonstige Rechtsquellen | `NORMTYP=vertr` | 208 |
| Gerichtsentscheidungen | `DOKTYP=rspr` | 26.316 |

Die Teilzahlen addieren sich exakt: 241 + 486 + 1.478 + 208 = 2.413.

Wichtig: Der Filteraufruf **ohne vorherige Suche liefert keine Trefferliste**, sondern die Meldung
„Bitte führen Sie eine Suche aus.“ Der Facettenbaum kommt trotzdem vollständig mit. Die Suche selbst
ist ein `POST /Search` mit dem Feld `SearchFields.Content`, einem `__RequestVerificationToken` und
Sitzungscookie – zustandsbehaftet und für eine Vollenumeration unhandlich.

### 4.2 Der gute Weg: die Fundstellennachweise

Zwei statische, **unpaginierte** HTML-Seiten enthalten den gesamten Bestand mit Dokument-IDs:

| Seite | Inhalt | Größe | Einträge |
| --- | --- | --- | --- |
| `/Content/Document/ffn` | Fundstellennachweis Rechtsvorschriften (BayRS/GVBl.) | 1.090.163 B | **872** |
| `/Content/Document/ffn-mbl` | Fundstellennachweis Verwaltungsvorschriften (BayMBl.) | 686.534 B | **1.439** |

Beide Seiten enden regulär mit `</html>`; es gibt keine Paginierungssteuerung. Struktur ist eine
Tabelle mit Kopfzeile „Gliederungsnummer | Titel“; Sachgebietszeilen tragen keinen Link, Datenzeilen
einen relativen Anker, der gegen `/Content/Document/` aufzulösen ist:

```html
<tr>
  <td>01-1-1-U</td>
  <td>
    <a href="StVIllerWasKNutzStVBayWuertt">*Staatsvertrag zwischen den Königreichen Bayern und Württemberg über die Ausnützung der Wasserkräfte der Iller vom 4. Juni 1917 i.d.berein.BayBS-F. (BayBS II S. 566)</a>
  </td>
</tr>
```

Zusätzliche Zeilen mit `style="font-size: smaller"` tragen Änderungsnotizen:

```html
<tr style="font-size: smaller">
  <td />
  <td>1) mehrfach geänd. (Abk. v. 22.01.1992, 314)</td>
</tr>
```

Im `ffn-mbl` sind das vollständige Änderungshistorien, z. B. für `BayVwV312180` sieben Einträge von
„Änderung vom 17.04.2018, AllMBl. 2018 S. 341“ bis „Änderung vom 16.12.2025, BayMBl. 2025 Nr. 587“.
Damit lässt sich **ohne jeden weiteren Abruf** feststellen, welche Verwaltungsvorschriften sich seit
einem Stichtag geändert haben.

Alle IDs sind eindeutig (872 bzw. 1.439 verschieden). **Zwei Abrufe genügen für das
Vollständigkeitsverzeichnis.**

### 4.3 Die Abdeckungslücke – offen

| | Fundstellennachweis | Facette | Differenz |
| --- | --- | --- | --- |
| BayRS (ges + rv + vertr) | 872 | 935 | **63** |
| BayMBl. (vv) | 1.439 | 1.478 | **39** |
| gesamt | **2.311** | **2.413** | **102** |

Das ist ein echter, ungeklärter Befund. Zwei Hypothesen, beide **unbelegt**:

1. Der Fundstellennachweis listet nur die in die Bayerische Rechtssammlung aufgenommenen
   Stammvorschriften, während die Facette zusätzliche Dokumente mitzählt.
2. Facettenzahlen und Fundstellennachweise haben unterschiedliche Redaktionsstände.

Entscheidbar wäre das durch einen Mengenabgleich zwischen den `ffn`-IDs und einer vollständigen
Facetten-Trefferliste – das wäre ein Massenabruf und war im Erkundungsauftrag nicht zulässig.
**Vor dem Bulk-Lauf muss diese Lücke geschlossen werden**, sonst fehlen bis zu 102 Normen.

### 4.4 Ein dritter Weg, nur aus der Hilfe bekannt

> „Über die A-Z-Leiste erhalten Sie einen alphabetischen Zugang zu den Vorschriften, der nach dem
> Kurztitel sortiert ist.“

Der Bereich „Vorschriften finden“ mit A-Z-Leiste, Abkürzungs- und Gliederungsnummernsuche ist in der
ausgelieferten HTML der Startseite nicht verlinkt, vermutlich JavaScript-gesteuert. **URL unbekannt,
nicht geprüft.**

---

## 5. Adressierung: Portal-IDs sind nicht XML-IDs

Dieser Punkt kostet sonst später einen Rebuild. Die URL-Suffixe auf `/Content/Document/<Kurz>-…`
sehen aus wie die XML-Attribute, sind es aber nicht.

**Gliederungsknoten** werden über einen **hierarchischen Positionspfad** adressiert. Die Verfassung
hat fünf Hauptteile; im XML tragen sie die `gliederungsid` `G_1`, `G_12`, `G_13`, `G_17`, `G_22`, im
Portal heißen sie `BayVerf-G1` … `BayVerf-G5`. Deren Kinder heißen dann `BayVerf-G1_1` …
`BayVerf-G1_9`:

```
level=2 docid=BayVerf-G1     parent=BayVerf
level=3 docid=BayVerf-G1_1   parent=BayVerf-G1
level=3 docid=BayVerf-G1_2   parent=BayVerf-G1
…
level=2 docid=BayVerf-G2     parent=BayVerf
```

Bei `BayAbmG` fallen beide Nummerierungen zufällig zusammen (acht Gliederungen, alle auf oberster
Ebene, `G_1`…`G_8`). Wer nur diese eine Norm prüft, hält die falsche Regel für bestätigt.

**Einzelvorschriften** werden über die **Artikel-/Paragraphenbezeichnung** adressiert, nicht über die
`einzelnormid`. `/Content/Document/BayVerf-1` liefert Art. 1 (XML: `einzelnormid="P_2"`), nicht die
Präambel (`P_1`). Die Geschwisterknoten belegen auch die Behandlung von Buchstabenzusätzen:

```
level=4 docid=BayVerf-1    parent=BayVerf-G1_1
level=4 docid=BayVerf-2    parent=BayVerf-G1_1
level=4 docid=BayVerf-3    parent=BayVerf-G1_1
level=4 docid=BayVerf-3a   parent=BayVerf-G1_1
level=4 docid=BayVerf-4    parent=BayVerf-G1_1
```

Das vollständige Musterwerk:

| Zweck | Muster | Beleg |
| --- | --- | --- |
| Norm | `/Content/Document/<Kurz>` | `BayAbmG` |
| Gesamtansicht | `/Content/Document/<Kurz>/true` | `BayAbmG/true` (76.555 B statt 18.065 B) |
| Druckansicht | `/Content/Document/<Kurz>?view=Print` | im HTML aller Dokumentseiten |
| Gliederung | `/Content/Document/<Kurz>-G<i>[_<j>…]` | `BayVerf-G1_1` |
| Vorschrift | `/Content/Document/<Kurz>-<paranr>` | `BayVerf-3a`, `BayAbmG-3` |
| Unnummerierte Vorschrift | `/Content/Document/<Kurz>-NN<i>` | `BayVerf-NN1` (Präambel), `BayKVzKG-NN1` ([Schlussformel]) |
| Anlage | `/Content/Document/<Kurz>-ANL_<i>` | `BayKVzKG-ANL_1` – hier **stimmt** die ID mit `annexid` überein |
| PDF | `/Content/Pdf/<DokId>?all=False` | `BayAbmG-3` funktioniert auch artikelweise |
| RTF | `/Content/Rtf/<DokId>?all=False` | |
| XML/ZIP | `/Content/Zip/<Kurz>` | immer normweit, nie artikelweise |

Bei Verwaltungsvorschriften sind die Gliederungssuffixe rein numerisch
(`BayVwV312180-0`, `-1`, `-13`, `-19`, `-24`, `-25`, `-29`, `-34`, `-39`, `-40`) – **ein drittes
Schema**, dessen Bildungsregel nicht geklärt ist. Die Sprünge legen nahe, dass hier ein fortlaufender
Absatzzähler adressiert wird, nicht ein Gliederungsordinal. **Offen.**

---

## 6. Historische Fassungen: es gibt keine

**Belegt, negativ.** Die Portalhilfe sagt es direkt (`/Content/Document/Hilfe`, Abschnitt 5):

> „Bitte beachten Sie, dass über die Datenbank BAYERN.RECHT die bayerischen Gesetze, Verordnungen und
> veröffentlichten Verwaltungsvorschriften in **aktueller Fassung** recherchieren lassen. **Bereits
> außer Kraft getretene bayerische Vorschriften werden nicht bereitgestellt.**“

(Der Satzbau ist im Original so; Hervorhebungen im Original als eigene Auszeichnung.)

Die Nutzungshinweise bestätigen:

> „Über den Bürgerservice BAYERN.RECHT steht das konsolidierte bayerische Landesrecht – in der
> aktuell geltenden Fassung – der Allgemeinheit zur kostenlosen Nutzung zur Verfügung.“

Zwei technische Bestätigungen:

- Die Dokumentkopfleiste enthält **kein Fassungsauswahl-Widget**. Sie zeigt nur statische Werte
  („Text gilt ab“, „Fassung“) in `<div>`-Zellen ohne Steuerelement – geprüft an `BayAbmG`, `BayVerf`,
  `BayVwV312180` und `BayKVzKG`.
- Der XML-Export trägt **nur eine Zeitschicht**: `version="p"` bzw. `version.id="p"` durchgängig auf
  allen `einzelnorm`-, `gliederung`- und `annex`-Elementen aller vier untersuchten Exporte. Ein
  zweiter Versionsschlüssel kam nicht vor.

### 6.1 Eine Teilausnahme – und warum sie nicht trägt

Das ZIP von `BayKVzKG` enthält 21 Anlagen-PDFs mit **datierten Versionskennungen**:

```
pdf/BayKVzKG_BayKVzKG-ANL-20020101-p.pdf     (geltende Fassung, Suffix "-p" wie version="p")
pdf/BayKVzKG_BayKVzKG-ANL-20021101-v1.pdf
pdf/BayKVzKG_BayKVzKG-ANL-20030215-v2.pdf
…
pdf/BayKVzKG_BayKVzKG-ANL-20150717-v20.pdf
```

Das ist echte Versionsgeschichte – aber unbrauchbar für den Stichtag: die Reihe endet 2015, die
Dateien sind PDF statt XML, sie sind aus dem XML nicht referenziert, und ob das Muster über
`BayKVzKG` hinaus vorkommt, wurde **nicht** geprüft.

### 6.2 Amtliche Alternativen für den Stichtag 2023-12-01

Die einzige belastbare Quelle sind die Verkündungsblätter (siehe Abschnitt 7). Sie enthalten
**Änderungsbefehle, keine konsolidierten Fassungen**. Eine Baseline auf 2023-12-01 ist daraus nur
durch Rückwärtsanwendung der seither erfolgten Änderungen zu gewinnen.

Der pragmatische Hebel liegt woanders: `rumpf/aenderungsverlauf` im XML und die Änderungsnotizen im
`ffn-mbl` erlauben, **je Norm zu entscheiden, ob sie sich seit 2023-12-01 überhaupt geändert hat**.
Für den unveränderten Teilbestand ist der heutige Text zugleich der Stichtagstext – und der dürfte
den überwiegenden Teil ausmachen. Dieses Verfahren ist **plausibel, aber nicht erprobt**.

---

## 7. Verkündungsorgane auf verkuendung-bayern.de

Keine robots.txt (HTTP 404), also keine Ausschlussregel. Sechs Abrufe in dieser Erkundung.

### 7.1 GVBl. – Gesetz- und Verordnungsblatt

**Amtlichkeit.** Die elektronische Ausgabe ist **nicht** amtlich. Die Nutzungshinweise von
BAYERN.RECHT sagen:

> „Die amtliche Fassung eines Gesetzes oder einer Rechtsverordnung enthält nur die Papierausgabe des
> GVBl., das von der Staatskanzlei herausgegeben wird und über den Verlag Bayerische Staatszeitung
> GmbH bezogen werden kann“

und weiter:

> „Auf dieser Plattform wird auch nachrichtlich (d. h. nichtamtlich) eine elektronische Fassung des
> GVBl. angeboten.“

**Jahrgangsabdeckung: 1945 bis 2026, lückenlos** (82 Optionen in der Jahrgangsauswahl von
`/gesetz-und-verordnungsblatt/alle-ausgaben-des-gvbl-ab-1945/`).

**Zugriff ist trivial** – ein reines GET-Formular, keine Sitzung, kein Token:

```html
<form id="search" method="GET">
  <input type="number" name="volume" value="2026" …>
  <input type="number" name="page" value="" …>
```

also `…/alle-ausgaben-des-gvbl-ab-1945/?volume=2023`. Verifiziert: der Aufruf liefert den
vollständigen Jahrgang 2023 mit den Ausgaben 1–24 plus Jahresinhaltsverzeichnis.

**Dateimuster:** `/files/gvbl/<jahrgang>/<ausgabe zweistellig>/gvbl-<jahrgang>-<ausgabe>.pdf`,
Jahresinhaltsverzeichnis unter `…/00/gvbl-<jahrgang>-jahresinhaltsverzeichnis.pdf`.

**Integrität: die Plattform veröffentlicht zu jeder Ausgabe eine SHA-256-Prüfsumme** im
Popover-Attribut `data-content` („Hash-Prüfsumme (sha256)“). Das ist für ein Auditartefakt
ungewöhnlich komfortabel – der gesamte PDF-Bestand ist prüfbar referenzierbar, ohne ihn zu laden.

Für den Stichtag relevant (aus `verkuendungsorgane.json`, Jahrgang 2023 vollständig erfasst):

| Ausgabe | Verkündet | Seiten | SHA-256 (von der Plattform veröffentlicht) |
| --- | --- | --- | --- |
| 22/2023 | 30.11.2023 | 613–624 | `9a9267261224b038dea9de703d6dabbd3e772460fe78d1ef510819aa646ee102` |
| 23/2023 | 14.12.2023 | 625–636 | `26cee8370978a135591f7549da17c469e2ddf3c430978c0e13bf648bfd804d11` |

Ausgabe 22 ist die letzte vor dem Stichtag 2023-12-01, Ausgabe 23 die erste danach.

### 7.2 BayMBl. – Bayerisches Ministerialblatt

Hier ist die elektronische Form **amtlich**:

> „Das Amtsblatt der Bayerischen Staatsregierung ist seit 1. Januar 2019 das Bayerische
> Ministerialblatt (BayMBl.). Es ersetzt die bisherigen vier Amts- und Ministerialblätter (AllMBl.,
> JMBl., FMBl. und KWMBl.).“

> „Die Bekanntmachungen im BayMBl. erscheinen einzeln, in der Regel mittwochs. Sie werden auf der
> Verkündungsplattform elektronisch amtlich als PDF-Datei bekannt gemacht.“

Abdeckung: BayMBl. ab 2019; die Vorgängerblätter sind zurück bis 2009 verfügbar. Der Stichtag
2023-12-01 ist vollständig abgedeckt.

**Es gibt einen maschinenlesbaren Export.** `/ministerialblatt/jahreslisten-exportieren/` bietet ein
`POST`-Formular mit `ressort` (22 Optionen, `0` = Alle Ressorts), `volume` (Jahrgang) und zwei
Submit-Schaltern `pdf` und `csv` („Liste als CSV exportieren“). Das ist die maschinenlesbarste
bekannte Quelle für BayMBl.-Bekanntmachungen. **Der Export wurde nicht ausgelöst** – ein POST ist
ein erzeugender Aufruf und lag außerhalb des Erkundungsauftrags. Das Antwortformat ist damit
**offen**.

### 7.3 Nutzungsbedingungen der Plattform

`/service/nutzungsbedingungen/`, wörtlich:

> „Texte, Bilder, Grafiken sowie die Gestaltung dieser Formularseite können dem Urheberrecht
> unterliegen. Nicht urheberrechtlich geschützt sind nach § 5 Urheberrechtsgesetz (UrhG) Gesetze,
> Verordnungen, amtliche Erlasse und Bekanntmachungen sowie Entscheidungen und amtlich verfasste
> Leitsätze zu Entscheidungen und andere amtliche Werke, die im amtlichen Interesse zur allgemeinen
> Kenntnisnahme veröffentlicht worden sind, mit der Einschränkung, dass die Bestimmungen über
> Änderungsverbot und Quellenangabe in § 62 Abs. 1 bis 3 und § 63 Abs. 1 und 2 UrhG entsprechend
> anzuwenden sind.“

Kein ausdrückliches Verbot automatisierten Zugriffs, kein TDM-Vorbehalt auf dieser Seite.

---

## 8. Lizenz- und Nutzungslage (BAYERN.RECHT)

Alle Zitate wörtlich aus `/Content/Document/Nutzungshinweise`, Abschnitt „Rechtliche Hinweise und
Nutzungsbedingungen“. **Keine Auslegung über den Wortlaut hinaus.**

Die Rechteeinräumung:

> „Im Bürgerservice BAYERN.RECHT eingestellte Vorschriften und Entscheidungen können örtlich,
> zeitlich und inhaltlich uneingeschränkt genutzt und weiterverwendet werden. Insbesondere ist es
> ausdrücklich gestattet, diese Inhalte unter Einhaltung der allgemeingültigen rechtlichen
> Bestimmungen gewerblich und nicht gewerblich zu vervielfältigen, zu verbreiten, öffentlich
> wiederzugeben und weiterzuverarbeiten sowie auf diese zu verlinken (sog. „Deep Links“).“

Der sachliche Umfang:

> „Dieses einfache Nutzungsrecht umfasst die Texte der Vorschriften und Entscheidungen sowie die
> darin enthaltenen Anlagen, Bilder oder Graphiken, soweit keine Rechte Dritter entgegenstehen.“

Die Grenzen:

> „Es wird darauf hingewiesen, dass die redaktionell aufbereiten Entscheidungen nicht vollständig
> urheberrechtsfrei gemäß § 5 Urheberrechtsgesetz (UrhG) sind. So unterliegen insbesondere die
> redaktionellen Leitsätze dem Urheberpersönlichkeitsrecht.“

> „Alle weiteren Texte, Bilder, Grafiken sowie die Gestaltung dieser Internetseiten unterliegen dem
> Urheberrecht und dürfen nur zum privaten und sonstigen eigenen Gebrauch im Rahmen des § 53 UrhG
> verwendet werden. Wir weisen darauf hin, dass Texte, Bilder, Grafiken und sonstige Dateien ganz
> oder teilweise dem Urheberrecht Dritter unterliegen können.“

> „Der Datenbankschutz nach §§ 87a ff. UrhG für den Bürgerservice BAYERN.RECHT bleibt von den hier
> eingeräumten Nutzungsrechten unberührt.“

Zur Verbindlichkeit der Texte:

> „Bei den aufrufbaren Texten handelt es sich um nichtamtliche Fassungen der Vorschriften. Auch wenn
> die Konsolidierung mit großer Sorgfalt vorgenommen wird, kann die Staatskanzlei keine Gewähr für
> die Richtigkeit der Texte übernehmen. Rechtlich maßgeblich sind ausschließlich die amtlichen Texte
> der Verkündungsblätter.“

> „Die Konsolidierung der Vorschriften erfolgt grundsätzlich innerhalb weniger Arbeitstage nach der
> amtlichen Verkündung durch den Verlag C.H.Beck GmbH & Co. KG im Auftrag des Freistaats Bayern.“

**Was im Wortlaut steht:** Die Erlaubnis erfasst genau den Importgegenstand – Vorschriftentexte samt
Anlagen, Bildern und Graphiken –, ist örtlich, zeitlich und inhaltlich unbeschränkt und schließt
gewerbliche Weiterverarbeitung ein. Sie gilt nicht für die übrigen Seiteninhalte und die Gestaltung
des Portals. Der Datenbankschutz nach §§ 87a ff. UrhG bleibt ausdrücklich unberührt.

**Was im Wortlaut nicht steht:** keine benannte Lizenz (kein CC-BY, keine Datenlizenz Deutschland),
keine formulierte Pflicht zur Quellenangabe, keine Aussage zu zulässiger Abrufrate oder
Abrufvolumen. Welche Folgen der unberührte Datenbankschutz für einen Vollabzug hat, sagt der Text
nicht – das ist eine Rechtsfrage, keine Erkundungsfrage.

---

## 9. Bestandsübersicht und Plausibilisierung

Die Nutzungshinweise enthalten eine Zeitreihe der **Stammvorschriften** je Stichtag 31.12.:

| | 2002 | 2005 | 2008 | 2011 | 2013 | 2015 | 2017 | 2019 | 2021 | **2023** | 2025 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Gesetze | 321 | 286 | 265 | 259 | 246 | 240 | 239 | 237 | 241 | **240** | 241 |
| Verordnungen | 1209 | 838 | 736 | 657 | 633 | 582 | 556 | 525 | 525 | **511** | 491 |

Die Spalte 2023 ist der nächstgelegene amtliche Anker zum Projektstichtag 2023-12-01: **240 Gesetze,
511 Verordnungen**.

Vorsicht: Diese Reihe ist **nicht** deckungsgleich mit den Facettenzahlen (2025: 491 Verordnungen
laut Zeitreihe gegenüber 486 laut Facette am 17.09.2026), weil sie Stammvorschriften ohne
Änderungsvorschriften zählt. Sie taugt zur Größenordnungs-Plausibilisierung, **nicht als Sollmenge**.

---

## 10. Befundbilanz

### Belegt

1. `robots.txt` von `gesetze-bayern.de` erlaubt automatisierten Zugriff pauschal (`Allow: /`).
2. Ein strukturierter XML-Export existiert je Norm unter `/Content/Zip/<Kurzbezeichnung>` und ist in
   der Portalhilfe offiziell dokumentiert.
3. Der Export greift für Gesetze, Verordnungen, die Verfassung **und** Verwaltungsvorschriften
   (jeweils HTTP 200, `application/zip`).
4. Der Export verwendet **zwei** DTDs ohne XML-Namensräume: `byrecht-norm` und `byrecht-vv`.
5. Tabellen (HTML-nahes Modell), Anlagen (`<annex>`), Fußnoten (`fn.call` inline) und Verweise
   (`@ersatz`) sind im Norm-Modell strukturiert abgebildet.
6. Anhänge von Verwaltungsvorschriften liegen **nur als PDF** im Paket und sind aus dem XML nicht
   referenziert; dasselbe gilt für die PDF-Beilagen von `BayKVzKG`.
7. Die Portal-Dokument-IDs sind positionelle Pfade (`-G1_1`) bzw. Artikelbezeichnungen (`-3a`) und
   **nicht** die XML-Attribute `gliederungsid`/`einzelnormid`.
8. Zwei vollständige, unpaginierte Fundstellennachweise liefern 872 + 1.439 = 2.311 Dokument-IDs in
   zwei Abrufen; das `ffn-mbl` enthält zusätzlich vollständige Änderungshistorien.
9. Das Portal führt nur die aktuelle Fassung; außer Kraft getretene Vorschriften werden nicht
   bereitgestellt (ausdrücklich in der Portalhilfe).
10. Die Nutzungsrechte an den Vorschriftentexten samt Anlagen sind örtlich, zeitlich und inhaltlich
    unbeschränkt eingeräumt; der Datenbankschutz bleibt unberührt.
11. GVBl. 1945–2026 und BayMBl. ab 2019 liegen als PDF vor, jede GVBl.-Ausgabe mit veröffentlichter
    SHA-256-Prüfsumme; der GVBl.-Jahrgangszugriff ist ein simpler GET-Parameter `?volume=`.

### Plausibel, aber unbelegt

1. Der ZIP-Export greift auch für den Normtyp `vertr` (208 Dokumente) – nicht geprüft.
2. `/Content/Pdf/<id>?all=True` liefert das Gesamtdokument – der Parameter ist im HTML sichtbar,
   `all=True` wurde nicht aufgerufen.
3. Die 102 fehlenden Dokumente der Facettenzahl sind Vorschriften, die (noch) nicht in den
   Fundstellennachweis aufgenommen sind.
4. Der Änderungsverlauf im XML plus die `ffn-mbl`-Notizen genügen, um den zum Stichtag 2023-12-01
   unveränderten Teilbestand zu identifizieren. Verfahren nicht erprobt.
5. Das numerische Gliederungssuffix bei Verwaltungsvorschriften (`-0`, `-13`, `-19`, …) adressiert
   einen fortlaufenden Absatzzähler. Aus den Sprüngen erschlossen, nicht verifiziert.

### Offen

1. **Die Abdeckungslücke von 102 Dokumenten** zwischen Facettenzahl (2.413) und Fundstellennachweisen
   (2.311). Blockierend für einen vollständigkeitsgeprüften Bulk-Lauf.
2. Paginierung, Trefferobergrenze und Sortierung von `/Search` – nicht untersucht, weil Massenabruf.
3. Die URL der A-Z-Leiste im Bereich „Vorschriften finden“.
4. Das Antwortformat des BayMBl.-CSV-Jahreslistenexports (POST nicht ausgelöst).
5. Ob datierte Anlagen-PDFs über `BayKVzKG` hinaus vorkommen und nach welcher Regel sie benannt sind.
6. Die Vollständigkeit beider DTD-Vokabulare. Die DTD-Dateien wurden nicht abgerufen; die hier
   dokumentierte Struktur stammt aus vier Instanzen. Insbesondere fehlen vermutlich Elemente für
   Bilder/Grafiken – die Portalhilfe erwähnt „Bilddateien“ im ZIP, in keinem der vier Exporte kam
   eine Bilddatei vor.
7. Ob `<sup>` in Verwaltungsvorschriften ausschließlich Satznummern trägt oder auch echte
   Hochstellungen.
8. Die Bildungsregel der synthetischen Änderungsgesetz-IDs (`Bay_110_2003_0816`) – erkennbar
   `Bay_<klasse>_<jahr>_<seite>`, aber nicht verifiziert.

---

## 11. Folgerungen für den Importpfad

### 11.1 Enumeration

Der Einstieg ist billig und robust: **zwei Abrufe** (`/Content/Document/ffn`,
`/Content/Document/ffn-mbl`) liefern 2.311 Dokument-IDs, BayRS-Gliederungsnummern, Titel und – für
Verwaltungsvorschriften – die vollständige Änderungshistorie. Beide Seiten sind statisch,
unpaginiert und sitzungsfrei. Das ist der Enumerationsanker.

Danach ein Abruf `/Content/Zip/<id>` je Norm, also rund 2.311 Abrufe für den Vollbestand. Bei 1,7 s
Pause sind das gut 65 Minuten – unproblematisch, aber wegen `BayKVzKG` (12,8 MB) mit
Größenbudgetierung zu planen.

**Vor dem Bulk-Lauf ist die 102er-Lücke zu schließen.** Empfohlenes Vorgehen: eine einzelne
Facetten-Trefferliste je `NORMTYP` durchpaginieren, die IDs gegen `ffn`/`ffn-mbl` differenzmengen und
nur die Differenz gesondert behandeln. Das ist ein begrenzter, kein Massenabruf – aber es ist ein
Schritt des Importers, nicht der Erkundung.

Ein Änderungsdetektor ist ebenfalls billig: `@builddate` im Norm-XML und die Notizzeilen im
`ffn-mbl` erlauben Inkrementalläufe ohne Volldownload.

### 11.2 Parser

Der Parser braucht **zwei Frontends** mit einem gemeinsamen Zielmodell:

- **`byrecht-norm`** → `gliederung` (schachtelbar) / `einzelnorm` / `jurAbsatz` / `satz.nr` /
  `annex`. Metadaten aus `kopf/angaben.versunabh` und `kopf/angaben.versabh`.
- **`byrecht-vv`** → `gliederung[@ebene]` rekursiv, Absätze als `<p>`, Satznummern als `<sup>`.
  Metadaten aus `metadaten/bayernrecht/*`. Kein `builddate`, keine BayRS-Nummer, kein
  Ausfertigungsdatum als Feld.

Konkrete Vorkehrungen, alle aus belegten Befunden:

1. **Kein Namensraum-Handling** nötig, aber ein DTD-toleranter Parser: das `<!DOCTYPE>` verweist auf
   eine externe DTD, die nicht aufgelöst werden darf (sonst Netzzugriff beim Parsen). Externe
   Entities abschalten.
2. **BOM**: alle XML-Dateien beginnen mit `﻿`.
3. **Leere Pflichtfelder** tolerieren: `kurzbezeichnung`, `amtlicheAbk`, `annex.titel`, `para.nr`,
   `fn.text`, `jahr`/`seite` kommen leer vor.
4. **Seitenangaben normalisieren**: `S=318` → `318`.
5. **`gliederungsNr.BayRS` trimmen** (abschließender Zeilenumbruch).
6. **Satznummern als Inline-Marker** behandeln, nicht als Container; die `id`-Werte (`xx`, `xxx`,
   `x`) verwerfen.
7. **Aufgehobene Vorschriften** an `<span class="i"> (aufgehoben)</span>` bei leerem `absatz.text`
   erkennen und als Platzhalter erhalten, nicht überspringen.
8. **Fußnoten** aus `fn.call` an der Aufrufstelle extrahieren; kein separater Apparat.
9. **`annex.nummer` erscheint doppelt** – die Variante mit `@int` ist die maschinell brauchbare.
10. **Tabellen** lassen sich fast 1:1 nach HTML übernehmen; der `class`-Wortschatz ist rein
    typografisch (`r`, `b`, `rb`, `i`, `text-center`).
11. **Permalinks nicht aus XML-IDs bilden.** Die Portal-URL einer Vorschrift ist
    `<Kurz>-<para.nr ohne "Art. "/"§ ">`, die einer Gliederung ein Positionspfad, der beim Parsen
    selbst mitgezählt werden muss.
12. **PDF-Beilagen** aus dem Manifest übernehmen und als unverortete Anhänge führen – eine
    Zuordnung zur Textstelle ist aus dem Export nicht herstellbar.

### 11.3 Historische Baseline-Recovery für 2023-12-01

Aus BAYERN.RECHT direkt: **nicht möglich**. Das ist belegt und kein Werkzeugproblem.

Realistischer Pfad, in dieser Reihenfolge:

1. **Vollabzug des heutigen Standes** über den XML-Export. Das ist ohnehin der erste Schritt und
   liefert mit `rumpf/aenderungsverlauf` und `rumpf/normzitat` die Zeitinformation gleich mit.
2. **Partitionieren**: je Norm prüfen, ob der Änderungsverlauf einen Eintrag nach 2023-12-01
   enthält. Für den unveränderten Teil ist der heutige Text zugleich der Stichtagstext – dieser Teil
   dürfte deutlich überwiegen und ist ohne weitere Quelle korrekt.
3. **Nur für den geänderten Rest** auf die Verkündungsblätter zurückgreifen: GVBl. über
   `?volume=<jahr>` und die publizierten SHA-256, BayMBl. über den CSV-Jahreslistenexport. Das
   bedeutet, Änderungsbefehle rückwärts anzuwenden – aufwendig, aber auf eine kleine Menge begrenzt.
4. **Auditierbarkeit** ist hier besser als in jedem bisher untersuchten Land: die
   Verkündungsplattform veröffentlicht die SHA-256 jeder GVBl.-Ausgabe selbst. Ein Evidence Pass kann
   sich darauf stützen, statt eigene Hashes gegen nichts zu prüfen.

Was **nicht** funktioniert und gar nicht erst versucht werden sollte: Suchmaschinen-Caches, andere
User-Agents oder das Erraten von Versions-URLs. Das Portal führt schlicht keine Zeitschichten.

### 11.4 Reihenfolge der nächsten Schritte

1. 102er-Abdeckungslücke klären (begrenzter Facettenabruf).
2. Zwei-Frontend-Parser gegen die vier hier abgelegten Exportinstanzen als Fixtures entwickeln.
3. Vollabzug, Partitionierung nach Änderungsstand relativ zu 2023-12-01.
4. Erst danach entscheiden, ob die Rückwärtsrekonstruktion des geänderten Rests den Aufwand wert ist
   oder ob die Simulation mit einem dokumentierten Stichtagsversatz arbeitet.
