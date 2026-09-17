# Schleswig-Holstein: Discovery der amtlichen Verkündungs- und Veröffentlichungsorgane

Erhebungsdatum: 2026-09-17. Zweck: Aufbau eines Rechtsbestands zum Stichtag **2023-12-01** und
eines Ereignisregisters für die Zeit danach. Das konsolidierte juris-Landesrechtsportal zeigt
im Wesentlichen nur geltendes Recht; die Verkündungsblätter liefern (a) die am Stichtag geltenden,
inzwischen aufgehobenen Normen und (b) Geltungs- und Änderungsbelege.

Rohantworten und Metadaten: `.cache/schleswig-holstein/{raw,meta,text}`.
Maschinenlesbarer Befund: `data/audits/schleswig-holstein/discovery/publications.json`.

Dieses Dokument behandelt **nur** die Verkündungsorgane. Das juris-Landesrechtsportal
(`gesetze-rechtsprechung.sh.juris.de`) wird parallel in
`docs/SCHLESWIG_HOLSTEIN_SOURCE_DISCOVERY.md` untersucht.

---

## 1. Portale und Zugänglichkeit

### 1.1 Hosts

| Host | Rolle |
| --- | --- |
| `verkuendungsportal.schleswig-holstein.de` | Verkündungsportal: GVOBl. Schl.-H. und Amtsbl. Schl.-H., Archiv, Erlassverzeichnis, Systematische Übersicht |
| `gvobl.schleswig-holstein.de`, `gesetz-und-verordnungsblatt.schleswig-holstein.de`, `amtsblatt.schleswig-holstein.de` | Aliasnamen desselben Portals (in den Verkündungsgrundsätzen als amtliche Ausgabeadressen benannt) |
| `www.schleswig-holstein.de` | Landesportal; hier u. a. **Nachrichtenblatt Schule**, Justizministerialblatt |
| `transparenz.schleswig-holstein.de` | Transparenzportal (CKAN); ältere Nachrichtenblätter, Teilmenge der Verwaltungsvorschriften |

Herausgeber beider Verkündungsblätter ist das Ministerium für Inneres, Kommunales, Wohnen und Sport
(Schriftleitungen GVOBl. `IV 338` und Amtsblatt).

### 1.2 robots.txt-Auswertung

**`verkuendungsportal.schleswig-holstein.de/robots.txt`** (sha256 `669c966b…`, abgerufen 2026-09-17):

```
User-agent: *
Disallow: */SiteGlobals/
Disallow: */EN/servicemeta
Disallow: */SiteGlobals/Forms/Suche
Allow: /SiteGlobals/Modules/
Allow: /SiteGlobals/Frontend/
Crawl-delay: 180
Sitemap: https://verkuendungsportal.schleswig-holstein.de/Sitemap_Index.xml
```

Folgen – **beide zentralen Indexwege sind gesperrt**:

1. Die **Portalsuche** („Alle Veröffentlichungen“, „Alle Bekanntmachungen“) liegt unter
   `/SiteGlobals/Forms/Suche/GVOBl_Formular` bzw. `…/Amtsblattsuche_Formular` und ist damit
   für `User-agent: *` untersagt. Sie wurde **nicht** abgerufen.
2. Der `Sitemap:`-Eintrag verweist auf
   `/SiteGlobals/Functions/Sitemap/Sitemap_Basepage.xml`, `…/Sitemap_News.xml`,
   `…/Sitemap_Images.xml` (Sitemap-Index abgerufen, 677 Bytes, `lastmod` 2024-08-28).
   Diese Teildateien liegen unter dem gesperrten Präfix `*/SiteGlobals/` – anders als beim
   Landesportal fehlt hier ein `Allow: /SiteGlobals/Functions/Sitemap/`. Sie wurden **nicht**
   abgerufen. Das ist eine Selbstwidersprüchlichkeit der Seite (Sitemap wird angekündigt,
   aber der Pfad gesperrt) und sollte vor einem Bulk-Lauf mit der Verkündungsstelle geklärt werden.

Erlaubt und genutzt: alle Inhaltspfade `/home/**` und alle Archivdateien `/mm/**`.

**`www.schleswig-holstein.de/robots.txt`** (sha256 in `meta/robots-sh-de.txt.json`): `Crawl-delay: 180`;
relevante Sperren: `/SiteGlobals/`, `/_doc/`, `/SiteGlobals/Forms/Suche/` und ausdrücklich
`/DE/justiz/themen/service/justizministerialblatt/Teil_B/_documents/` (→ Justizministerialblatt
Teil B ist für automatisierte Abrufe **gesperrt**). Ausdrücklich erlaubt ist hier
`/SiteGlobals/Functions/Sitemap/`.

**`transparenz.schleswig-holstein.de/robots.txt`**: `Crawl-Delay: 10`, `Disallow: /api/`
→ die CKAN-API darf **nicht** genutzt werden; nur die HTML-Datensatzseiten unter `/dataset/…`.

### 1.3 Höflichkeitsregime

`Crawl-delay: 180` auf beiden Landes-Hosts ist für einen Bulk-Lauf faktisch prohibitiv
(1 000 Abrufe ≈ 50 h). Diese Discovery hat mit 8–45 s Pause gearbeitet (47 Anfragen gesamt) und
das dokumentiert. **Vor einem produktiven Bulk-Lauf ist entweder die 180-s-Regel einzuhalten
oder eine Absprache mit der Verkündungsstelle (`gvobl@im.landsh.de`, `amtsblatt@im.landsh.de`)
erforderlich.** Für unseren Anwendungsfall ist das beherrschbar, weil die Jahrgangs-PDFs den
Zeitraum bis 2024 mit ≈ 6 Abrufen abdecken (siehe § 7).

---

## 2. Rechtsrahmen und Provenienz-Modell

- **Verkündungs- und Bekanntmachungsgesetz Schleswig-Holstein vom 26. November 2024**
  (GVOBl. Schl.-H. S. 811) – §§ 1, 2, 4, 5: elektronische Führung beider Blätter, vollständige
  und dauerhafte freie Zugänglichkeit.
- **Veröffentlichungs- und Verkündungsgrundsätze** vom 21.10.2025, Amtsbl. Schl.-H. 2025/384,
  Gl.Nr. 1141.7 (`.cache/…/raw/ab_2025-384_verkuendungsgrundsaetze.pdf`, 11 S., sauberer Textlayer).
  Vorgänger: Erlass vom 17.12.2021 (Amtsbl. Schl.-H. 2022 S. 40) i. d. F. vom 17.12.2024
  (Amtsbl. Schl.-H. 2024/128).

Daraus ergeben sich **drei Provenienzklassen**, die im Datenmodell unterschieden werden müssen:

| Klasse | Zeitraum | Amtlichkeit | Technik |
| --- | --- | --- | --- |
| **A – gedruckte amtliche Ausgabe, digitale Informationskopie** | GVOBl. 1947–2024, Amtsbl. 1946–30.09.2024 | „Maßgeblich … sind die gedruckten Ausgaben“; Archiv-PDFs sind ausdrücklich **nicht zertifiziert**, „für Vollständigkeit und Durchsuchbarkeit gibt es keine Gewähr“ | Jahrgangs-PDF |
| **A1 – Faksimile-Scan** | GVOBl. ≤ 2016, Amtsbl. ≤ 2016 | wie A | Scans, 200–890 MiB/Jahrgang |
| **A2 – digital erzeugtes Jahrgangs-PDF** | GVOBl. 2017–2024, Amtsbl. 2017–2024 | wie A | 10–110 MiB/Jahrgang, Textlayer vorhanden (mit Mängeln, § 5) |
| **B – elektronische amtliche Ausgabe** | Amtsbl. ab 01.10.2024, GVOBl. ab 01.01.2025 | amtliche Fassung; PDF mit **elektronischem Siegel** („Schleswig-Holstein · Verkündungs- und Bekanntmachungsstelle am TT.MM.JJJJ“) | Einzel-PDF je Veröffentlichung, sauberer Textlayer |

Belegte Größengrenze (HEAD-Abrufe, 2026-09-17):
GVOBl 2016 = 889 371 860 B (848 MiB, Scan) ↔ GVOBl 2017 = 10 865 437 B (10,4 MiB, digital);
Amtsbl. 2016 Teil 1 = 530 863 789 B (Scan) ↔ Amtsbl. 2017 = 24 266 513 B (23 MiB, digital).

> **Achtung:** Die Größenangaben auf den Archivseiten sind teils veraltet. Die Seite nennt
> „Amtsblatt 2017 (509MB)“ und „Jahresinhaltsverzeichnis 2017 (23MB)“; tatsächlich liefert der
> Server 23,1 MiB bzw. 510 KiB (Last-Modified 2025-04-23). Die Dateien wurden nach dem
> Seitenstand (01.10.2024) ersetzt. **Immer HEAD statt Seitenbeschriftung auswerten.**

---

## 3. GVOBl. Schl.-H. – Modell und Adressschema

### 3.1 Bis 31.12.2024: Ausgaben, gedruckt

- Erscheinen: unregelmäßig, 2023 = **17 Ausgaben**, Jahrgang S. 1–648.
- Fundstellenformat: `GVOBl. Schl.-H. S. <Seite>` bzw. `GVOBl. Schl.-H. <Jahr> S. <Seite>`;
  zusätzlich **Gliederungsnummer** (`GS Schl.-H. II, Gl.Nr. 2013-2-58`).
- Adressierung: **nur jahrgangsweise**, keine Einzel-URL je Ausgabe oder Bekanntmachung.

```
https://verkuendungsportal.schleswig-holstein.de/mm/gvobl_jahrgang_<JJJJ>/GVOBl_<JJJJ>.pdf
```

Abweichungen: 1996 `GVOBL_1996.pdf` (Großschreibung); 2024
`…/gvobl_jahrgang_2024/II_GVOBl_Jahrgang_2024` (**ohne Dateiendung**, 113 756 792 B,
Last-Modified 2026-01-19) und `…/I_Jahresinhaltsverzeichnis_2024.pdf`.

Verfügbare Jahrgänge: **1947–2024**; **1972 fehlt** („in Arbeit“). Archivseite:
`/home/gvobl/gvobl-archiv/archiv-gvobl_node`, Stand 20.12.2024.

### 3.2 Ab 01.01.2025: Einzelverkündungen, elektronisch

- Erscheinen werktags nach Bedarf; jede Verkündung ist eine eigene „Ausgabe“.
- Fundstelle = **`Jahrgang/laufende Nummer`**, z. B. `GVOBl. Schl.-H. 2026/66`.
  Gliederungsnummern werden seit 2025 **nicht mehr vergeben**.
- Volumen: 2025 mindestens bis `2025-184` (23.12.2025), 2026 bis `2026-81` (Ende August 2026).

HTML-Seite je Verkündung mit strukturiertem Metadatenblock:

```
Thema · Fundstelle (z. B. 2026/66) · Typ (Gesetz | Verordnung | Bekanntmachung)
Ausfertigungsdatum · Veröffentlichungsdatum · Sachgebiet
```

PDF = Seiten-URL + `.pdf?__blob=publicationFile&v=<n>`:

```
https://verkuendungsportal.schleswig-holstein.de/home/gvobl/veroeffentlichungen/2026/2026_08/2026-66_august31
https://verkuendungsportal.schleswig-holstein.de/home/gvobl/veroeffentlichungen/2026/2026_08/2026-66_august31.pdf?__blob=publicationFile&v=1
```

> **Das GVOBl-URL-Schema ist nicht aus der Fundstelle ableitbar.** Belegte Varianten:
> - Januar 2025 ohne Monatsordner: `/2025/2025-2_Januar02`, `/2025/2025-12_Januar24`
> - ab Februar 2025 Monatsordner mit **Monatsnamen**: `/2025/2025_februar/2025-32_Februar28`,
>   `/2025/2025_maerz/2025-26_maerz28`, `/2025/2025_dezember/2025-184_dezember23`
> - 2026 Monatsordner **numerisch**: `/2026/2026_08/2026-66_august31`
> - Groß-/Kleinschreibung des Slug-Monats wechselt (`Februar28` vs. `maerz28`).
>
> Probe bestätigt: `/2025/2025_04/2025-51` und `/2025/2025_04/2025-51_april14` → **HTTP 404**.
> Ordnerpfade wie `/home/gvobl/veroeffentlichungen` oder `/…/2026/2026_08` sind keine Seiten
> (302 → `/home`), es gibt also **keinen durchblätterbaren Index**.

### 3.3 Jahresinhaltsverzeichnisse (GVOBl)

`…/mm/gvobl_jahrgang_2023/GVOBl_Jahresinhaltsverzeichnis_2023.pdf` (23 S., 494 KiB) und
`…/mm/gvobl_jahrgang_2024/I_Jahresinhaltsverzeichnis_2024.pdf` (23 S., 334 KiB).
Aufbau: „Zeitliche Übersicht“ (Ausfertigungsdatum · Inhalt · Nummer des GVOBl. · Seite,
darunter `GS Schl.-H. II, Gl.Nr. …` oder `Ändert LVO vom …, Gl.Nr. …`) plus Sachverzeichnis.
Sauberer Textlayer. **Für 2025/2026 existiert kein Jahresinhaltsverzeichnis**; die Archivseite
deckt ausdrücklich nur die Zeit bis 31.12.2024 ab.

### 3.4 Systematische Übersicht (Register der geltenden Gesetze/Verordnungen)

```
https://verkuendungsportal.schleswig-holstein.de/home/gvobl/gvobl-service/_documents/gvobl_service_systematische_uebersicht.pdf?__blob=publicationFile&v=2
```

283 Seiten, 3,0 MiB, Word-erzeugt (CreationDate 2024-12-13), sauberer Textlayer,
Stand Jahresende 2024. Je Norm: Zuständigkeit (Ressort-Kürzel), Gl.Nr., Titel, Ausfertigung mit
Fundstelle und **vollständige Änderungshistorie mit Fundstellen**. Enthält
158 `außer Kraft <Datum>`-, 12 `aufgehoben <Datum>`-, 29 `Bek. d.g.F.`- (Neufassungen),
2 895 `geänd.`- und 762 `ber.`-Einträge; **98 Außerkraft-/Aufhebungsereignisse mit Datum ≥ 2023-12-02**
(2023: 14, 2024: 48, 2025: 27, 2026: 9) – letztere sind zum Erhebungszeitpunkt teilweise
*künftige* Befristungen.

### 3.5 Fundstellennachweis (ab 2025)

`/home/gvobl/gvobl-fundstellennnachweis/fundstellennnachweis-gvobl` (Pfad enthält den Tippfehler
„nnn“). Stand 16.12.2024 und am 2026-09-17 unverändert:
**„Der Fundstellennachweis des Gesetz- und Verordnungsblattes für Schleswig-Holstein ist noch
nicht verfügbar.“** → Für den elektronischen Zeitraum ab 2025 existiert derzeit **kein amtliches
Register**. Das ist die größte Lücke dieser Quelle.

---

## 4. Amtsbl. Schl.-H. – Modell und Adressschema

### 4.1 Bis 30.09.2024: wöchentliche Ausgaben, gedruckt

- Erscheinen: **wöchentlich montags**. 2023 = Nummern 1–52 in **50 Ausgaben**
  (Doppelnummern 3/4 und 49/50), Jahrgang S. 1–3112.
- Fundstellenformat: `Amtsbl. Schl.-H. <Jahr> S. <Seite>`, dazu **Gliederungsnummer**
  im Format `Gl.Nr. 6601.60` (Punkt statt Bindestrich, anders als beim GVOBl.).
- Inhalt: Satzungen (§ 65 LVwG), Bewilligungsrichtlinien, **Verwaltungsvorschriften**,
  öffentliche und örtliche Bekanntmachungen.

```
https://verkuendungsportal.schleswig-holstein.de/mm/ab_jahrgang_<JJJJ>/I_Jahresinhaltsverzeichnis_<JJJJ>.pdf
https://verkuendungsportal.schleswig-holstein.de/mm/ab_jahrgang_<JJJJ>/II_Amtsblatt_<JJJJ>.pdf
```

Große Jahrgänge sind gestückelt, z. B.
`ab_jahrgang_2016/II_Amtsblatt_2016_Seiten_1-634.pdf` … `_Seiten_1695_1862.pdf`
(Benennung inkonsistent: teils `1033-1694`, teils `1695_1862`).
Jahrgänge **1946–2024**; für 2024 **kein** Jahresinhaltsverzeichnis.
Zusätzliche historische Reihen (1946–ca. 1960): **„Amtlicher Anzeiger“**, **„Statistische Beilage“**,
**„Beilage“** (z. B. 2010, 2012) – eigene PDFs je Jahrgang.
Archivseite `/home/amtsblatt/ab_archiv`, Stand 01.10.2024.

### 4.2 Ab 01.10.2024: Einzelveröffentlichungen, elektronisch

- Erscheinen werktags Mo–Fr nach Bedarf; jede Veröffentlichung eigene Ausgabe.
- Fundstelle = `Jahrgang/laufende Nummer`; **die Zählung startete am 01.10.2024 neu bei 1**
  (Okt 2024 `2024-31`, Dez 2024 `2024-102`/`2024-128`).
- Volumen: 2025 mindestens bis `2025-384` (Oktober), 2026 bis `2026-314` (16.09.2026)
  → **ca. 400–450 Veröffentlichungen pro Jahr**.

**Das Amtsblatt-URL-Schema ist – anders als beim GVOBl. – deterministisch:**

```
https://verkuendungsportal.schleswig-holstein.de/home/amtsblatt/ab_veroeffentlichungen/{JJJJ}/{MM}_{JJJJ}/{JJJJ}-{NNN}
…/{JJJJ}-{NNN}.pdf?__blob=publicationFile&v=<n>
```

Belegt für 10_2024, 11_2024, 12_2024, 10_2025, 09_2026. Der Monatsordner ist der
**Veröffentlichungsmonat**; die Nummer allein genügt nicht, wohl aber
(Jahr, Monat, Nummer) – d. h. eine Enumeration über 12 Monatsordner je Jahr ist möglich.

Metadatenblock je Seite:
`Thema · Fundstelle · Typ (Verwaltungsvorschrift | Bekanntmachung | Satzung | …) ·
Entscheidungsdatum · Veröffentlichungsdatum · Sachgebiet`, dazu Verweise auf
„Erlassverzeichnis“ und „Bei juris recherchieren“.

### 4.3 Erlassverzeichnis (Register der geltenden Verwaltungsvorschriften)

```
https://verkuendungsportal.schleswig-holstein.de/home/amtsblatt/ab_service/ab_service_dokumente/ab_service_erlassverzeichnis.pdf?__blob=publicationFile&v=6
https://verkuendungsportal.schleswig-holstein.de/home/amtsblatt/ab_service/ab_service_dokumente/ab_systematische_%C3%BCbersicht.pdf?__blob=publicationFile&v=1
```

- 109 Seiten, 1,33 MiB, Acrobat PDFMaker aus Word, **Stand 30. September 2024**
  (Seite „Letzte Aktualisierung 18.10.2024“, PDF erzeugt 19.11.2024). Sauberer Textlayer.
- **845 Verwaltungsvorschriften** mit eindeutiger Gliederungsnummer. Je Eintrag:
  zuständiges Ressort · Gl.Nr. · Titel · `Bek./Erl./Rd.Erl. vom <Datum>` · Fundstelle
  (`Seite` bzw. `Jahr/Seite`, z. B. `2024/13`), darunter eingerückt die Ereigniszeilen.
- 186 `geänd. Bek. v. …`-Zeilen, 7 `aufgeh.`-Zeilen, Einträge
  `Verlängerung der Geltungsdauer bis zum …`, `weiter befristet`, `Befristung aufgeh.`.
- Im Jahr neu erlassene oder geänderte VV sind **fett** gedruckt (im Textlayer nicht sichtbar –
  Auswertung über Schriftschnitt oder über die Jahresinhaltsverzeichnisse nötig).
- Die „Systematische Übersicht“ (9 S., 430 KiB) ist nur der **Gliederungsbaum** ohne Einzelnormen.

**Eignung als Discovery-Quelle für Verwaltungsvorschriften: gut, aber mit drei Grenzen.**
(1) Es ist ein Register der **gültigen** VV – aufgehobene VV verschwinden daraus; Aufhebungen sind
nur so lange sichtbar, wie der Eintrag noch mitgeführt wird. (2) Stand 30.09.2024, also
**10 Monate nach unserem Stichtag** – VV, die zwischen 2023-12-01 und 2024-09-30 aufgehoben wurden,
fehlen. (3) Kein eigenes Statusfeld; Geltungsstatus ist nur aus den Ereigniszeilen erschließbar.
Keine ältere Fassung (Stand 2023) auf dem Portal gefunden.

---

## 5. PDF- und Textlayer-Befunde

Gemessen mit `pdftotext` (poppler) über die vollständigen Jahrgänge, Seitenklassifikation über
einen Plausibilitätstest auf deutschen Wortbestandteilen:

| Datei | Seiten | direkt lesbar | nur nach Zeichenversatz **+29** | unbrauchbar |
| --- | ---: | ---: | ---: | ---: |
| `GVOBl_2023.pdf` (41,1 MB, 691 S.) | 482 Inhaltsseiten | 360 (75 %) | 102 (21 %) | 20 (4 %) |
| `II_Amtsblatt_2023.pdf` (115,7 MB, 3 204 S.) | 2 775 Inhaltsseiten | 1 088 (39 %) | 1 645 (59 %) | 42 (2 %) |

**Schadensbild:** Teile des Satzes verwenden subsettete Schriften mit fehlerhafter
`ToUnicode`-Zuordnung. `pdftotext` liefert dort einen konstant um **+29 Zeichencodes**
verschobenen Text, z. B. roh `%LWWHZHQGHQ6LHVLFKIU…` → `BittewendenSiesichfür…`.
Nach dem Rückversatz fehlen jedoch **die Wortzwischenräume**, und Umlaute landen auf
Sonderzeichen (`ö` → `|`). Eine saubere Rekonstruktion erfordert entweder eine Auswertung der
eingebetteten Glyphennamen/Widths oder OCR.

**Entscheidender Befund für die Strategie:** Die **Ausgaben-Deckblätter mit dem
Inhaltsverzeichnis sind zu 100 % sauber lesbar** – geprüft für alle 17 GVOBl-Deckblätter und
alle 50 Amtsblatt-Deckblätter des Jahrgangs 2023. Sie tragen genau die Daten, die ein
Ereignisregister braucht:

```
Ausgabe Nr. 16 / Kiel, 7. Dezember 2023
 8.11.2023  Gesetz zur Änderung des Landesdisziplinargesetzes ..... 541
            Ändert Ges. vom 18. März 2003, GS Schl.-H. II, Gl.Nr. 2031-3
27.11.2023  Gesetz zur Aufhebung des Gesetzes zur Durchführung der Kriegsopferfürsorge ..... 542
            GS Schl.-H. II, Gl.Nr. 830-3
```

Beim Amtsblatt sind die Deckblatt-Inhalte zusätzlich nach Dokumenttyp gruppiert
(`Satzungen`, `Verwaltungsvorschriften`, …).

Weitere PDF-Eigenschaften:
- Laufende Kopfzeile auf jeder Seite: `Nr. <N>  Gesetz- und Verordnungsblatt für Schleswig-Holstein <JJJJ>; Ausgabe <Datum>  <gedruckte Seite>` (gerade/ungerade gespiegelt) → **Seitenzahl und Ausgabe sind je Seite maschinell zuordenbar**, auch auf verstümmelten Seiten.
- Jede Verkündung trägt eine interne **Verkündungsnummer** `<lfd>/<Jahr>` (z. B. `1983/2023`, `1985/2023`, `1988/2023`, `2090/2026`) – jahresübergreifend fortlaufend, auch im elektronischen Zeitalter, und damit ein brauchbarer stabiler Identifikator.
- Archiv-PDFs: `Tagged: no`, nicht barrierefrei, **nicht zertifiziert**.
- Einzel-PDFs ab 2025 (`gvobl_2026-66.pdf`, `ab_2026-310.pdf`, `ab_2025-384…pdf`): LibreOffice-erzeugt, sauberer Textlayer, elektronisches Siegel (Stempelzeile „Schleswig-Holstein · Verkündungs- und Bekanntmachungsstelle am TT.MM.JJJJ“).

---

## 6. Fundstellenformate (Erkennungsmuster)

| Organ | Zeitraum | Muster | Beispiel |
| --- | --- | --- | --- |
| GVOBl. | bis 2024 | `GVOBl. Schl.-H. [<Jahr>] S. <Seite>[, <Seite>]` | `GVOBl. Schl.-H. S. 1282`; `GVOBl. Schl.-H. 2018 S. 11` |
| GVOBl. | ab 2025 | `GVOBl. Schl.-H. <Jahr>/<Nr>` | `GVOBl. Schl.-H. 2025/92` |
| GVOBl. | gemischt (im Amtsblatt) | `GVOBl. <Jahr> Nr. <Nr> vom TT.MM.JJJJ` | `GVOBl. 2025 Nr. 51 vom 14.04.2025` |
| Amtsbl. | bis 30.09.2024 | `Amtsbl. Schl.-H. <Jahr> S. <Seite>` | `Amtsbl. Schl.-H. 2022 S. 40` |
| Amtsbl. | ab 01.10.2024 | `Amtsbl. Schl.-H. <Jahr>/<Nr>` | `Amtsbl. Schl.-H. 2024/128` |
| Gliederung Gesetze/VO | bis 2024 | `GS Schl.-H. II, Gl.Nr. <n>-<n>-<n>` (teils mit `B ` davor) | `GS Schl.-H. II, Gl.Nr. B 2126-13-105` |
| Gliederung VV | fortlaufend | `Gl.Nr. <n>.<n>` | `Gl.Nr. 1141.7`, `Gl.Nr. 6601.60` |
| Register-Fundstelle VV | Erlassverzeichnis | `<Seite>` oder `<Jahr>/<Seite>` | `2488`, `2024/13` |

Die **Umstellung des Zitierstils Ende 2024** ist ein eigenes Risiko: derselbe Normtext kann je
nach Zitierjahr `S. 1282` oder `2025/92` tragen. Der Fundstellen-Parser muss beide Formen
(und die Mischform aus dem Amtsblatt) beherrschen.

---

## 7. Dezember 2023 – die kritische Zone um den Stichtag

Ermittelt aus den Kopfzeilen und Deckblättern der Jahrgangs-PDFs (belastbar, sauberer Textlayer).

**GVOBl. Schl.-H. 2023 – 17 Ausgaben; nach dem 2023-12-01 erschienen genau zwei:**

| Nr. | Ausgegeben | Gedruckte Seiten |
| --- | --- | --- |
| 15 | 16.11.2023 | 496–538 (**vor** dem Stichtag) |
| **16** | **07.12.2023** | 539–632 |
| **17** | **28.12.2023** | 633–648 |

Ausgabe 16 enthält u. a. Ausfertigungen vom 08.11. bis 27.11.2023, Ausgabe 17 solche vom
13.12. bis 18.12.2023. **Kritisch:** In Ausgabe 16 stehen Normen mit Ausfertigungsdatum *vor*
dem Stichtag, die aber erst *danach* verkündet wurden und damit am 2023-12-01 noch nicht galten.
Ausfertigungsdatum und Verkündungsdatum müssen getrennt geführt werden.

Ebenfalls kritisch: Das **Jahresinhaltsverzeichnis 2024** führt Ausfertigungen vom
20.11.2023, 05.12.2023 und 13.12.2023 auf, die erst in **GVOBl. 2024 Nr. 1** (S. 4, 14, 26, 29)
verkündet wurden – der Jahrgangswechsel verschiebt Normen über die Stichtagsgrenze hinweg.

**Amtsbl. Schl.-H. 2023 – 50 Ausgaben; nach dem 2023-12-01 erschienen genau drei:**

| Nr. | Ausgegeben | Gedruckte Seiten |
| --- | --- | --- |
| 48 | 27.11.2023 | 2616–2690 (**vor** dem Stichtag) |
| **49/50** | **11.12.2023** | 2692–2936 |
| **51** | **18.12.2023** | 2938–2978 |
| **52** | **27.12.2023** | 2980–3111 |

In Nr. 52 (S. 3105) steht die für den Stichtag besonders relevante Sammelbekanntmachung
**„Weitergeltung von Verwaltungsvorschriften über den 31. Dezember 2023 hinaus bis zum
31. Dezember 2028“** – eine kollektive Befristungsverlängerung, die zahlreiche am Stichtag
geltende VV betrifft.

---

## 8. Ereignis-Erkennung: Formulierungen mit Belegstelle

### 8.1 Im Verkündungstext (GVOBl.)

| Ereignis | Beleg (Kurzzitat) | Fundstelle |
| --- | --- | --- |
| Aufhebung einer Norm | „… wird aufgehoben.“ (Gesetz zur Aufhebung des Gesetzes zur Durchführung der Kriegsopferfürsorge) | GVOBl. Schl.-H. 2023 S. 542 (Nr. 16 vom 07.12.2023) |
| Befristung / Außerkrafttreten mit Ablaufdatum | „… tritt mit Ablauf des 31. Dezember 2023 außer Kraft.“ | GVOBl. Schl.-H. 2023 S. 5 (Nr. 1 vom 19.01.2023) |
| Ersetzung mit gleichzeitigem Außerkrafttreten | „Diese Verordnung tritt am 27. Februar 2024 in Kraft. Gleichzeitig tritt die Juristenausbildungsverordnung vom 15. Februar 2014 (GVOBl. Schl.-H. S. 35) … außer Kraft.“ | GVOBl. Schl.-H. 2023 S. 435 (Nr. 11 vom 17.08.2023) |
| Änderung | „Das Landesaufnahmegesetz vom 4. November 2021 (GVOBl. Schl.-H. S. 1282), zuletzt geändert durch Gesetz vom 3. Juni 2025 (GVOBl. Schl.-H. 2025/92), wird wie folgt geändert:“ | GVOBl. Schl.-H. 2026/66 |
| Paragrafenspezifisches Außerkrafttreten | Abschnittsüberschrift „Inkrafttreten, Außerkrafttreten“ mit absatzweiser Differenzierung | GVOBl. Schl.-H. 2023, mehrfach (18 Fundstellen im Jahrgang) |

Im Jahrgang 2023 des GVOBl.: 21 Fundstellen „außer Kraft“, 18 Überschriften „Außerkrafttreten“,
266 Vorkommen „wird wie folgt geändert“.

### 8.2 Im Register (Systematische Übersicht GVOBl., Stand Ende 2024)

| Ereignis | Beleg |
| --- | --- |
| Aufhebung | `1101-13 Gesetz zur Einrichtung einer Clearingstelle Windenergie … aufgehoben 8.3.2024 (Art. 1 Ges. v. 21.2.2024, GVOBl. S. 87)` |
| Befristung (künftig) | `außer Kraft 19.2.2026 (§ 3 LVO v. 25.2.2021, GVOBl. S. 263)` |
| Befristung + **Entfristung** | `außer Kraft 30.12.2023 (§ 3 LVO v. 2.11.2018, GVOBl. S. 701)` / `§§ 1, 2 und 3 geänd./entfristet (LVO v. 11.10.2023, GVOBl. S. 477)` |
| Teilaußerkrafttreten | `§ 59 Abs. 2a außer Kraft 31.10.2020 (25.9.2020 GVOBl. S. 713)` |
| Neufassung | `Bek. d.g.F. vom 2.12.2014, GVOBl. S. 344, ber. GVOBl. 2015 S. 41` |
| Ressortumbenennung | `Zuständigkeiten und Ressortbezeichnungen ersetzt durch Art. 64 LVO v. …` |

Die Kombination `außer Kraft <Datum>` **und** späteres `geänd./entfristet` in derselben
Normhistorie ist der Normalfall bei befristeten Landesverordnungen – ein reiner
„außer Kraft“-Parser würde solche Normen fälschlich als erloschen führen.

### 8.3 Im Amtsblatt / Erlassverzeichnis (Verwaltungsvorschriften)

| Ereignis | Beleg (Kurzzitat) | Fundstelle |
| --- | --- | --- |
| Befristungsverlängerung (Einzelfall) | `• Verlängerung der Geltungsdauer bis zum 31.12.2025 / Bek. v. 11.5.2022  752` | Erlassverzeichnis, Gl.Nr. 6660.19 |
| Befristungsverlängerung (kollektiv) | „Weitergeltung von Verwaltungsvorschriften über den 31. Dezember 2023 hinaus bis zum 31. Dezember 2028“ | Amtsbl. Schl.-H. 2023 S. 3105 (Nr. 52 vom 27.12.2023) |
| Teilaufhebung | `• Teile 2, 4, 20, 25, 29 und 37 aufgeh. Bek. v. 11.7.2016  1033` | Erlassverzeichnis |
| Entfristung | `• Befristung aufgeh. (Bundesrecht) Bek. v. 24.11.2016` | Erlassverzeichnis |
| Neufassung | `Neufassung der Richtlinie …` als eigener Verzeichniseintrag | Erlassverzeichnis (u. a. Gl.Nr. 6605.26, 6640.18) |
| Ersetzung eines Erlasses | „Dieser Erlass tritt am 1. Januar 2026 in Kraft. Gleichzeitig treten die Grundsätze … vom 17. Dezember 2021 (Amtsbl. Schl.-H. 2022 S. 40) … außer Kraft.“ | Amtsbl. Schl.-H. 2025/384 |
| Änderungsverweis auf dem Deckblatt | `Ändert Erl. vom 20. Juni 2022, Gl.Nr. 2330.88` | Amtsbl. Schl.-H. 2023, Nr. 48 vom 27.11.2023 |

---

## 9. Weitere Verkündungsorgane (unvollständig abgedeckt)

- **Nachrichtenblatt Schule** (`C 5088 A`) des Bildungsministeriums: Hier werden
  **Landesverordnungen der Schulverwaltung verkündet**; im GVOBl. erscheint nur eine
  Sammelbekanntmachung „Verkündungen im Nachrichtenblatt Schule …“ (z. B. GVOBl. 2026/77,
  2026/75, 2026/13, 2025/6). **Für einen vollständigen Rechtsbestand unverzichtbar.**
  `https://www.schleswig-holstein.de/DE/fachinhalte/S/schulverwaltung/nachrichtenblatt` listet
  nur **7 Ausgaben (2025–2026)**; ältere Jahrgänge liegen im Transparenzportal
  (`https://transparenz.schleswig-holstein.de/dataset/nachrichtenblatt-schule`, dort u. a.
  2023 und 2024, PDF-Downloads unter `/dataset/<uuid>/resource/<uuid>/download/…pdf`).
  Dateiablage Landesportal uneinheitlich:
  `…/Downloads/Nachrichtenblatt/01_2026.pdf` (2026) vs.
  `…/Downloads/Nachrichtenblatt/nachrichtenblatt/04_2025.pdf` (2025).
- **Hochschul-Nachrichtenblatt** desselben Ministeriums, analog (GVOBl. 2025/5).
- **Justizministerialblatt Schleswig-Holstein**: Teil B ist auf dem Landesportal per robots.txt
  ausdrücklich für Crawler gesperrt – nicht erhoben.
- **Transparenzportal**, Facette „Informationsgegenstand: Verwaltungsvorschrift“: **136 Datensätze**
  gegenüber 845 Einträgen im Erlassverzeichnis → nur eine Teilmenge, kein Ersatz.
  Die CKAN-API ist per robots.txt gesperrt.

---

## 10. Discovery-Strategie 2023-12-02 bis heute

| Zeitraum | Quelle | Adressierung | Abrufe | Aufwand |
| --- | --- | --- | --- | --- |
| 02.12.–31.12.2023 | `GVOBl_2023.pdf`, `II_Amtsblatt_2023.pdf` + beide JIV | 4 Dateien | **4** | 157 MB, einmalig; Ausgaben 16/17 bzw. 49/50, 51, 52 |
| 01.01.–31.12.2024 | `II_GVOBl_Jahrgang_2024` (114 MB) + `I_Jahresinhaltsverzeichnis_2024.pdf`; `II_Amtsblatt_2024.pdf` (21 MB, nur bis 30.09.) | 3 Dateien | **3** | 135 MB |
| 01.10.–31.12.2024 (Amtsblatt, elektronisch) | Einzelseiten `…/2024/{10,11,12}_2024/2024-{1..~130}` | deterministisch | ~130 HTML + ~130 PDF | mittel |
| 2025–heute (Amtsblatt) | `…/{JJJJ}/{MM}_{JJJJ}/{JJJJ}-{NNN}` | deterministisch, 12 Monatsordner/Jahr | ≈ 450/Jahr × 2 (HTML+PDF) | ~1 800 Abrufe für 2025+2026 |
| 2025–heute (GVOBl.) | **kein ableitbares Schema, kein Index** | – | – | **offen, siehe Risiko R1** |
| Register/Stützdaten | Systematische Übersicht GVOBl. (Stand 2024), Erlassverzeichnis (Stand 30.09.2024) | 2 Dateien | **2** | klein, hoher Ertrag |

**Empfohlenes Vorgehen**

1. **Stufe 1 (billig, hoher Ertrag, ~9 Abrufe):** Jahrgangs-PDFs 2023/2024 beider Blätter,
   beide Jahresinhaltsverzeichnisse, Systematische Übersicht, Erlassverzeichnis.
   Daraus lassen sich bereits gewinnen: alle Ausgaben mit Ausgabedatum und Seitenbereich,
   alle Einzelbekanntmachungen 2023/2024 mit Datum, Titel, Seite, Gl.Nr. und Änderungsverweis –
   **allein aus den sauber lesbaren Deckblättern**, ohne den defekten Fließtext.
2. **Stufe 2:** Amtsblatt 2024-10 bis heute über das deterministische URL-Schema enumerieren
   (Monatsordner durchlaufen, Nummern bis zum ersten dauerhaften 404 hochzählen).
3. **Stufe 3 (GVOBl. ab 2025):** kein robots-konformer Index. Optionen:
   (a) Fundstellen aus den konsolidierten juris-Normen rückwärts auflösen (Parallel-Discovery);
   (b) die 10 neuesten Verkündungen der GVOBl-Startseite regelmäßig abgreifen und so
   fortlaufend aufbauen (nur zukunftsgerichtet);
   (c) Abstimmung mit der Verkündungsstelle über einen Index oder die Freigabe der Suche.
   Volumen zum Aufholen: ≈ 184 (2025) + ≈ 90 (2026) ≈ 275 Verkündungen.
4. **Volltext:** Für 2023/2024 den Fließtext **nicht** aus den Jahrgangs-PDFs beziehen
   (59 % bzw. 21 % defekt), sondern die konsolidierten juris-Fassungen als Textquelle und
   das Verkündungsblatt als Fundstellen-/Ereignisbeleg nutzen. Ab 2025 sind die Einzel-PDFs
   sauber und können direkt als Textquelle dienen.

---

## 11. Risiken und Grenzen

| ID | Risiko | Bewertung |
| --- | --- | --- |
| R1 | **Kein Index für GVOBl. ab 2025**: Fundstellennachweis „noch nicht verfügbar“, Portalsuche und Sitemap-Teildateien per robots.txt gesperrt, URL-Schema nicht ableitbar (404-Proben belegt) | **hoch** – blockiert eine lückenlose Erfassung der Verkündungen seit 01.01.2025 |
| R2 | **`Crawl-delay: 180`** auf beiden Landes-Hosts | hoch für Bulk; beherrschbar, weil 2023/2024 über wenige Jahrgangs-PDFs abgedeckt sind |
| R3 | **Defekter Textlayer** der Jahrgangs-PDFs (Amtsblatt 2023: 59 % nur über Zeichenversatz, 2 % unbrauchbar) | hoch für Volltext, **niedrig für Ereignisregister** (Deckblätter zu 100 % sauber) |
| R4 | **Registerstände liegen nach dem Stichtag** (Systematische Übersicht Ende 2024, Erlassverzeichnis 30.09.2024); keine Fassung mit Stand 2023 auffindbar | mittel – zwischen 2023-12-01 und dem Registerstand aufgehobene Normen fehlen und müssen aus den Ausgaben 2023/2024 rekonstruiert werden |
| R5 | **Register führen nur geltende Normen**; nur 12 bzw. 7 noch mitgeführte Aufhebungseinträge | mittel – Aufhebungen sind primär aus den Verkündungstexten zu gewinnen |
| R6 | **Wechsel des Fundstellenformats** Ende 2024 (`S. 1282` → `2025/92`), zusätzlich Mischform `GVOBl. 2025 Nr. 51 vom 14.04.2025` | mittel – Parser muss alle drei Formen können |
| R7 | **Wegfall der Gliederungsnummern** ab 2025 (GVOBl.) | mittel – Gl.Nr. ist bis 2024 der beste Normidentifikator, danach entfällt er; Verkündungsnummer `<lfd>/<Jahr>` als Ersatz prüfen |
| R8 | **Nachrichtenblatt Schule / Hochschul-Nachrichtenblatt** als eigenständige Verkündungsorgane; online nur 2025/2026, ältere Jahrgänge nur im Transparenzportal | **hoch für Vollständigkeit** des Schul- und Hochschulrechts |
| R9 | **Justizministerialblatt Teil B** per robots.txt gesperrt | mittel – Lücke bewusst dokumentieren |
| R10 | **Archivseiten-Metadaten veraltet** (Größen, „1972 in Arbeit“, Stand 20.12.2024 / 01.10.2024); Dateien werden nachträglich ausgetauscht (Last-Modified 2025/2026) | mittel – Größen und Hashes stets per HEAD/GET prüfen, Etag/Last-Modified mitführen |
| R11 | **Archiv-PDFs sind nicht amtlich** („maßgeblich sind die gedruckten Ausgaben“, keine Zertifizierung, keine Gewähr für Vollständigkeit) | mittel – Provenienz muss im Datenmodell als Informationskopie gekennzeichnet werden |
| R12 | **GVOBl. 1972 fehlt vollständig**; große Scan-Jahrgänge (bis 889 MiB) sind praktisch nicht verarbeitbar | niedrig für unseren Zeitraum, relevant für historische Belege |
| R13 | **Jahrgangsübergreifende Verkündung**: Ausfertigungen aus Nov/Dez 2023 erscheinen erst im GVOBl.-Jahrgang 2024 | hoch für Stichtagsgenauigkeit – Verkündungsdatum ist maßgeblich, nicht das Ausfertigungsdatum |

---

## 12. Abrufbilanz

47 Anfragen (36 GET, 11 HEAD) gegen drei Hosts, keine 429/403/5xx, keine gesperrten Pfade
abgerufen. Pausen: ≥ 8 s allgemein, 20–25 s vor PDF-Abrufen, 45 s auf `www.schleswig-holstein.de`.
Große PDFs (> 20 MB): 2 heruntergeladen (`GVOBl_2023.pdf` 41,1 MB, `II_Amtsblatt_2023.pdf` 115,7 MB),
3 weitere nur per HEAD geprüft. Alle Rohantworten liegen unter `.cache/schleswig-holstein/raw/`
mit Metadaten (`url`, `finalUrl`, `status`, `contentType`, `retrievedAt`, `byteLength`, `sha256`)
unter `.cache/schleswig-holstein/meta/`.
