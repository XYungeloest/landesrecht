# Schleswig-Holstein: Post-Baseline-Ereignisregister

Stand 2026-09-17. Stichtag des Ausgangsrechtsstands: **2023-12-01**.

Dieses Dokument beschreibt Methode, Quellen und Grenzen des Ereignisregisters
`juris-sh-event-ledger/1`. Erzeugt wird es von

```
node scripts/import-juris-sh.ts events [--write] [--offline] [--json] [--limit n]
```

Ergebnisse:

| Datei | Inhalt |
| --- | --- |
| `data/imports/juris-sh/events/ledger.json` | alle Ereignisse, deterministisch sortiert |
| `data/imports/juris-sh/events/vwv-inventory.json` | Inventar der Verwaltungsvorschriften mit Gliederungsnummer |
| `data/audits/juris-sh/EVENT_LEDGER.md` | Bericht mit Kennzahlen, Kandidatenlisten und Dezember-Sonderauswertung |

Code: `packages/importers/juris-sh/src/events/` (`ledger.ts`, `registers.ts`, `contents.ts`,
`pdf-text.ts`, `build.ts`). Tests: `tests/unit/juris-sh-events.test.ts` mit echten Quellenausschnitten
unter `tests/fixtures/juris-sh/`.

---

## 1 Warum es dieses Register gibt

Das konsolidierte Landesrechtsportal (juris Schleswig-Holstein) ist für automatisierte Abrufe durch
`robots.txt` gesperrt; es wird dort nichts abgerufen (`docs/SCHLESWIG_HOLSTEIN_ACCESS_CONSTRAINT.md`).
Damit fehlt die Textquelle für einen Stichtagsbestand. Erlaubt und amtlich sind die Verkündungsblätter
(`docs/SCHLESWIG_HOLSTEIN_PUBLICATION_DISCOVERY.md`). Sie liefern keinen konsolidierten Normtext, wohl
aber **Belege**, und zwar genau die, die ein späterer Import als Erstes braucht:

1. **Welche Vorschriften galten am Stichtag, fehlen aber im heutigen Bestand?**
   Jede Aufhebung, Ersetzung oder abgelaufene Befristung nach dem 2023-12-01 beweist, dass die
   betroffene Vorschrift am Stichtag noch galt. Genau diese Vorschriften sind die
   „baseline-only-Kandidaten“: Sie stehen in keinem aktuellen Portalabzug und müssen gesondert
   beschafft werden.
2. **Welche Verwaltungsvorschriften mit Gliederungsnummer waren im Bestand?**
   Das Erlassverzeichnis ist das einzige vollständige Register der Verwaltungsvorschriften; ein
   Portalabzug gibt es nicht.

Das Register **entscheidet nicht** über die Geltung einer Vorschrift und **erzeugt keinen Normtext**.
Es sammelt Belege in derselben Evidenzsprache, die der Adapter ohnehin benutzt
(`src/common/evidence.ts`), damit die spätere Stichtagsprüfung darauf aufsetzen kann.

---

## 2 Quellen

Alle Quellen liegen im Discovery-Cache `.cache/schleswig-holstein/raw/` mit Metadaten unter
`.cache/schleswig-holstein/meta/`. Der Lauf ruft **nichts** ab und prüft jede Datei gegen den in
`EVENT_SOURCES` festgeschriebenen SHA-256; eine Abweichung bricht ihn ab.

| Kennung | Quelle | Stand | Seiten | SHA-256 |
| --- | --- | --- | ---: | --- |
| `gvobl-systematische-uebersicht` | Systematische Übersicht GVOBl. (Register der geltenden Gesetze und Verordnungen) | 2024-12-13 | 283 | `2e75c53a82c2b98752fabc2d4491ea1cc44c891a678d84f7b720987881dc406e` |
| `ab-erlassverzeichnis` | Erlassverzeichnis Amtsbl. (Register der geltenden Verwaltungsvorschriften) | 2024-09-30 | 109 | `4915b4712db5d3b317d092ef56e0d286beb4c55d2cf91662e6cb73288938e510` |
| `gvobl-jiv-2023` | Jahresinhaltsverzeichnis GVOBl. 2023 | 2023-12-31 | 23 | `90aed1dfe6593dfc8be3781e7a6e4b99c5a5cba4a90fbb9ebf267f44aff5e64f` |
| `gvobl-jiv-2024` | Jahresinhaltsverzeichnis GVOBl. 2024 | 2024-12-31 | 23 | `889946ce5469141ad8b01f52d0015a1a59181a01cae9691a5c6bf5b3812e3411` |
| `ab-jiv-2023` | Jahresinhaltsverzeichnis Amtsbl. 2023 | 2023-12-31 | 36 | `c7894bb2b65468f0970233f5d467fb1854e22a44c1cd2b9fc94a11185c0664e7` |
| `gvobl-2023` | GVOBl. Schl.-H., Jahrgang 2023 | 2023-12-31 | 691 | `8a971d7662c94980ba51637fc3785c363d623bd2cb8580f6d76300adb44cc2f0` |
| `gvobl-2024` | GVOBl. Schl.-H., Jahrgang 2024 | 2024-12-31 | 975 | `98dec69331e1b773acf3beadb2225efc33597462f6ca547bb9427a12221fd967` |
| `ab-2023` | Amtsbl. Schl.-H., Jahrgang 2023 | 2023-12-31 | 3 204 | `756f2747e27c10c181f7e9b1d8b4282cab28b329cd0ba1650ca85f3f5068496d` |

Die Jahrgangs-PDFs dienen **nicht** als Textquelle, sondern ausschließlich dem Ausgabenplan: Aus den
laufenden Kopfzeilen (`Nr. 16 Gesetz- und Verordnungsblatt … 2023; Ausgabe 7. Dezember 2023 541`)
entsteht die Zuordnung Ausgabennummer → Ausgabedatum → Seitenbereich.

Provenienz: Die Archiv-PDFs sind amtliche **Informationskopien**; maßgeblich ist nach den
Verkündungsgrundsätzen bis einschließlich 2024 die gedruckte Ausgabe. Das Register führt deshalb zu
jedem Ereignis Adresse und Hash der benutzten Datei mit.

---

## 3 Methode

### 3.1 Seitenweise Textgewinnung mit Lesbarkeitsprüfung (`pdf-text.ts`)

Ein Teil der Jahrgangs-PDFs hat defekte `ToUnicode`-Zuordnungen; der Textlayer liefert dort einen
konstant um **29 Zeichencodes** nach unten verschobenen Text (roh `'LHPLW/DQGHVZDSSHQ` statt
`DiemitLandeswappen`). Die Reparatur ist zweistufig und fail-closed:

1. **Zeilenweise beurteilen, nicht seitenweise.** Beschädigte Seiten tragen eine *saubere* Kopfzeile
   über beschädigtem Satz; eine seitenweite Korrektur würde die Kopfzeile zerstören.
2. **Versatz auf Seitenebene nachweisen.** Erst wenn mindestens zwei Zeilen derselben Seite nach dem
   Rückversatz eindeutig deutschen Fachwortschatz ergeben (≥ 2 Treffer und ≥ 55 % Kleinbuchstaben),
   gilt der Schaden als belegt. Erst dann werden die beschädigten Zeilen dieser Seite verschoben – und
   auch nur die, deren Ergebnis tatsächlich lesbar ist.
3. **Alles Übrige wird verworfen, nicht geraten.** Eine nicht rekonstruierbare Zeile erscheint leer;
   eine Seite mit mehr als 20 % solcher Zeilen liefert gar keinen Text (`status: 'unreadable'`).
4. **Kein OCR**, keine weitere Heuristik.

Grenze des Rückversatzes: Wortzwischenräume innerhalb eines beschädigten Satzlaufs fehlen in der
Quelle, und Umlaute fallen aus (`Schriftstcke`). Korrigierter Text taugt für Erkennung und Statistik,
**nicht** als Normtext. Für das Ereignisregister spielt das keine Rolle: Alle Registerquellen und alle
Inhaltsverzeichnisse sind zu 100 % sauber lesbar (siehe Kennzahlen im Bericht).

Die Textgewinnung selbst übernimmt `pdftotext -layout` (poppler); das Ergebnis wird unter
`.cache/schleswig-holstein/pagetext/` abgelegt, damit ein Lauf ohne poppler reproduzierbar bleibt.
`@landesrecht/importer-recht-nrw/common/pdf.ts` prüft nur die PDF-Struktur und extrahiert bewusst
keinen Text; es ist deshalb hier nicht verwendbar.

### 3.2 Registerzeilen (`registers.ts`)

Beide Register führen je Vorschrift einen Kopf (Ressort · Gliederungsnummer · Titel · Ausfertigung mit
Fundstelle) und darunter eingerückte Ereigniszeilen. Der Parser bildet Blöcke, fügt umbrochene Zeilen
zusammen und ordnet jede Ereigniszeile einem Typ zu. Die Reihenfolge der Prüfungen ist fachlich
bindend:

| Reihenfolge | Muster | Ergebnis |
| --- | --- | --- |
| 1 | `gilt unbefristet (§ 62 Abs. 2 Nr. 2 LVwG)` | `amend` / `unbefristet` – **hebt eine Befristung auf** |
| 1a | `geänd./entfristet`, `Befristung aufgeh.`, `Keine Befristung!` | `amend` / `entfristung` – **hebt eine Befristung auf** |
| 2 | `Verlängerung der Geltungsdauer bis zum <Datum>`, `weiter befristet`, `Weitergeltung der Befristung` | `amend` / `befristungsverlaengerung` bzw. `kollektive-weitergeltung` |
| 3 | `Bek. d.g.F. vom <Datum>`, `NF Erl. v. <Datum>`, `NF Anl. 1 und 2 Erl. v. <Datum>` | `recast` / `neufassung` |
| 4 | `aufgehoben <Datum> (…)`, `aufgeh. Bek. v. <Datum>` | `repeal` |
| 5 | `außer Kraft <Datum> (…)` | `expire` |
| 6 | `Ablauf der Wahlperiode`, `Zeitablauf <Jahr>` | `expire` ohne Datum |
| 7 | `Zuständigkeiten und Ressortbezeichnungen ersetzt …` (auch ohne Leerzeichen der Quelle) | `amend` / `ressortbezeichnung` |
| 7a | `Zuständigkeiten übertragen. (…)` | `amend` / `zustaendigkeitsuebertragung` |
| 8 | `ber. GVOBl. …` | `correction` |
| 9 | `Art. N ändert Gl.Nr. X`, `Art. N Aufhebung Gl.Nr. X` | `amend` / `repeal` auf die benannte Gliederungsnummer |
| 10 | `Inkrafttreten`, `Übergangsvorschriften`, `Hinweis: …` | `commencement` / `publication-only` |
| 11 | `geänd.`, `eingef.`, `erg.`, `ersetzt`, `gestrichen`, `neu gefasst` … | `amend` |
| 12 | alles Übrige | `unknown` mit vollständigem Rohtext |

**Warum die Zuordnung mehr entscheidet als die Statistik.** Eine Zeile, die als `unknown` anfällt und
**vor** der ersten erkannten Ereigniszeile eines Eintrags steht, wird dem Kopf des Eintrags
zugeschlagen und wird gar kein Ereignis. Sie fehlt dann nicht nur in der Klassifikation, sondern im
Register überhaupt. Das betraf 26 Zeilen `gilt unbefristet (§ 62 Abs. 2 Nr. 2 LVwG)` – ausgerechnet
Belege für den **Fortbestand** einer Vorschrift, und damit genau das, was eine Stichtagsprüfung
braucht. Sie sind jetzt erfasst. Eine Erweiterung der Muster erhöht deshalb nicht nur die Trefferquote,
sie kann Belege sichtbar machen, die vorher unsichtbar waren.

**Vier Regeln entscheiden über die Qualität des Registers:**

*Entfristung schlägt Befristung.* Die Kombination `außer Kraft <Datum>` und später
`geänd./entfristet` in derselben Normhistorie ist bei Landesverordnungen der Normalfall. Ein reiner
„außer Kraft“-Parser würde hunderte weiterhin geltender Verordnungen als erloschen führen. Solche
Einträge bekommen `processingStatus: 'defused-by-entfristung'` und die Beweisklasse `contradictory`;
sie zählen nicht als Ende.

*Ein späteres Fristende ersetzt ein früheres.* Die Entfristung ist nicht der einzige Weg, eine
Befristung loszuwerden: Ändert ein Änderungsakt die Befristungsvorschrift, nennt das Register beides
mit derselben Fundstelle –

```text
• außer Kraft 30.12.2023 (§ 50 LVO v. 4.12.2018, GVOBl. S. 817)
• § 50 geänd. (Art. 2 LVO v. 14.11.2023, GVOBl. S. 545)
• außer Kraft 30.12.2028 (Art. 2 LVO v. 14.11.2023, GVOBl. S. 545)
```

Das Wort „entfristet“ fällt nie; trotzdem ist das Datum von 2023 ersetzt. Solche Einträge bekommen
`processingStatus: 'superseded-by-later-expiry'`, ebenfalls `contradictory`, und zählen nicht als
Ende. Die Regel greift nur, wenn beide Zeilen die *ganze* Vorschrift betreffen (kein Teilbereich) und
beide ein Datum tragen. Sie wurde nachträglich ergänzt, nachdem eine Stichprobe die Wahlordnung zum
Mitbestimmungsgesetz (Gl.Nr. 2035-3-11) fälschlich als 2023 erloschen geführt hatte; betroffen waren
drei Einträge.

*Teilbereich ist kein Ende.* `§ 59 Abs. 2a außer Kraft 31.10.2020` beweist das Gegenteil eines Endes –
die Vorschrift bestand im Übrigen fort. Solche Zeilen werden als `teilausserkrafttreten` bzw.
`teilaufhebung` geführt und nie als baseline-only-Kandidat gezählt. Als Teilbereich gilt nur ein
struktureller Verweis (`§`, `Art.`, `Anl.`, `Teile`, `Nr.`, `Überschrift`, `teilw.`) **ohne** eigene
Fundstelle. Steht vor dem Schlüsselwort ein eigenständiges Ereignis mit Klammerzitat – wie in
`geänd. (LVO v. 27.11.2023, GVOBl. S. 631), aufgehoben (Art. 2 LVO v. 19.12.2023, GVOBl. 2024 S. 75)` –,
dann betrifft die Aufhebung die ganze Vorschrift.

*Nichts wird verworfen.* Eine Zeile ohne passendes Muster wird als `unknown` mit `rawText` erfasst und
im Bericht gezählt, statt still zu verschwinden. Ebenso wird ein fehlendes Datum nie ergänzt: Solche
Ereignisse sind nie `strong` und tragen keine Stichtagsentscheidung.

### 3.3 Verkündungen (`contents.ts`)

Aus den Jahresinhaltsverzeichnissen entstehen Verkündungsereignisse (`new`, `amend`,
`publication-only`) mit Titel, Ausgabe, gedruckter Seite und den Beziehungszeilen
(`GS Schl.-H. II, Gl.Nr. …` = neue Vorschrift, `Ändert …, Gl.Nr. …` = Änderung einer benannten
Vorschrift).

**Maßgeblich ist das Ausgabedatum des Blattes, nicht das Ausfertigungsdatum.** Das Datum in der linken
Spalte der Übersicht ist die Ausfertigung (GVOBl.) bzw. die Entscheidung (Amtsbl. – die Spalte ist dort
mit „Datum der Veröffentlichung“ überschrieben, führt aber das Datum der Bek./des Erl.). Das
Verkündungsdatum kommt deshalb aus dem Ausgabenplan der Jahrgangs-PDFs. Lässt sich die Ausgabe nicht
datieren, bleibt das Ereignis **ohne** `eventDate` und geht mit `needs-review` ins Register. Das
Ausfertigungsdatum bleibt als `ausfertigung:<ISO>` in `targetIdentityHints` erhalten.

### 3.4 Evidenz und Kennungen (`ledger.ts`)

Beweisklassen wie im Adapter:

| Klasse | Bedeutung |
| --- | --- |
| `strong` | eindeutiges Datum **und** Fundstelle **und** eindeutig benanntes Ziel |
| `supporting` | amtlicher Beleg, dem eines dieser drei Merkmale fehlt |
| `insufficient` | bloßer Hinweis (Rohzeile, unklares Ziel, weder Datum noch Fundstelle) |
| `contradictory` | der Beleg steht gegen einen anderen starken Beleg derselben Vorschrift |

`confidence` (0…1) leitet sich aus denselben Merkmalen ab, nur feiner aufgelöst.

Die Ereigniskennung ist stabil und stammt aus Quelle, Seite, Zeile und dem normalisierten
Zeileninhalt: `gvobl-systematische-uebersicht-p0052-l005-<10 Hex>`. Der Inhaltsanteil sorgt dafür, dass
eine geänderte Quelle neue Kennungen erzeugt, statt alte Belege stillschweigend umzudeuten. Die
Ereignisliste ist deterministisch nach Datum, Quelle, Seite, Zeile und Kennung sortiert; zwei Läufe
über dieselben Quellen erzeugen byteweise dieselben Dateien.

---

## 4 Lesart der Kennzahlen

- **„Ereignisse ab 2023-12-02“** heißt: Das Ereignis trägt ein Datum nach dem Stichtag. Ereignisse
  ohne Datum zählen hier **nicht** mit – es wird nichts unterstellt.
- **baseline-only-Kandidat** ist ein Ereignis, das
  (a) das Ende der *ganzen* Vorschrift belegt (`repeal`, `replace`, `expire`, kein Teilbereich),
  (b) `strong` ist,
  (c) weder durch eine spätere Entfristung entschärft noch durch ein späteres Fristende ersetzt wurde und
  (d) zwischen 2023-12-02 und dem Auswertungsstichtag liegt.
  Die Vorschrift galt dann am Stichtag und fehlt heute.
- **Künftige Befristung** ist dasselbe mit einem Enddatum *nach* dem Auswertungsstichtag. Auch sie
  beweist die Geltung am Stichtag, aber die Vorschrift gilt weiter – kein Kandidat.
- **Auswertungsstichtag** ist eine Konstante (`EVALUATION_DATE`, derzeit 2026-09-17), kein Tagesdatum.
  Nur so erzeugt ein Wiederholungslauf denselben Bericht. Wird die Konstante erhöht, wandern
  abgelaufene Befristungen von „künftig“ zu „eingetreten“.
- **`ressortbezeichnung`** ist mit Abstand der häufigste Subtyp (rund 1 280 Zeilen). Das ist kein
  Fehler: Die Systematische Übersicht vermerkt die Ressortanpassung bei fast jeder älteren Vorschrift.
  Fachlich ist das ein Fortbestandsbeleg, keine inhaltliche Änderung.
- **Unbestimmte Zeilen** (`unknown`, rund 210) verteilen sich etwa hälftig auf beide Register. Es sind
  überwiegend Gerichtsentscheidungen (`teilw. verfassungswidrig – Urteil LVerfG v. …`), bloße
  Verweiszeilen (`LVO v. 16.4.2002, GVOBl. S. 70`) und Tippfehler der Quelle
  (`§ 1 neu gefefasst`). Sie bleiben mit Rohtext im Register und sind die Arbeitsliste für eine
  spätere Verfeinerung.
- **Abgleich mit der Discovery.** Die Discovery hatte durch Textsuche 158 `außer Kraft`- und
  12 `aufgehoben`-Einträge sowie 98 Ende-Ereignisse mit Datum ≥ 2023-12-02 (2023–2026) gezählt. Der
  Parser findet 184 `expire`- und 38 `repeal`-Ereignisse sowie 110 Ende-Ereignisse ab 2023-12-02, davon
  96 in den Jahren 2023–2026. Die Differenz erklärt sich vollständig: Der Parser fasst umbrochene
  Zeilen zusammen, erfasst zusätzlich die Kurzform `aufgeh.` des Erlassverzeichnisses und zählt auch
  Befristungen nach 2026. Die Zahlen für 2023 (15 gegenüber 14) und 2026 (9 gegenüber 9) decken sich.

---

## 5 Grenzen

| ID | Grenze | Folge |
| --- | --- | --- |
| G1 | **Registerstände liegen nach dem Stichtag**: Systematische Übersicht Ende 2024, Erlassverzeichnis 30.09.2024 – also 10 bis 13 Monate danach. | Beide Register führen nur den *geltenden* Bestand. Vorschriften, die zwischen 2023-12-01 und dem Registerstand aufgehoben wurden, sind dort verschwunden und im Register nur enthalten, soweit der Eintrag noch mitgeführt wird. Diese Lücke lässt sich nur aus den Verkündungsblättern 2023/2024 schließen. |
| G2 | **GVOBl. ab 2025 ist nicht robots-konform enumerierbar**: Der Fundstellennachweis ist „noch nicht verfügbar“, Portalsuche und Sitemap-Teildateien liegen unter gesperrten Pfaden, das URL-Schema der Einzelverkündungen ist nicht ableitbar. | Ereignisse ab 2025 stehen hier nur, soweit die Register sie führen. Eine lückenlose Fortschreibung setzt eine Absprache mit der Verkündungsstelle voraus. |
| G3 | **Nachrichtenblatt Schule und Hochschul-Nachrichtenblatt** sind eigenständige Verkündungsorgane; dort werden Landesverordnungen der Schul- und Hochschulverwaltung verkündet, im GVOBl. erscheint nur eine Sammelbekanntmachung. | Schul- und Hochschulrecht ist in diesem Register **nicht** abgedeckt. Ältere Jahrgänge liegen nur im Transparenzportal. |
| G4 | **Justizministerialblatt Teil B** ist per `robots.txt` für automatisierte Abrufe gesperrt. | Bewusste, dokumentierte Lücke; kein Ersatzabruf. |
| G5 | **Crawl-delay 180 s** auf beiden Landes-Hosts. | Ein Bulk-Lauf über Einzelverkündungen ist ohne Absprache praktisch ausgeschlossen. Das Register kommt deshalb mit acht Dateien aus. |
| G6 | **Archiv-PDFs sind nicht die maßgebliche Ausgabe** („maßgeblich sind die gedruckten Ausgaben“, keine Zertifizierung, keine Gewähr für Vollständigkeit). | Die Provenienz ist je Ereignis mitgeführt; ein Import muss sie im Manifest als Informationskopie kennzeichnen. |
| G7 | **Defekter Textlayer** der Jahrgangs-PDFs. | Für das Ereignisregister unkritisch (alle Register und Inhaltsverzeichnisse sind sauber), aber die Jahrgangs-PDFs taugen nicht als Textquelle. |
| G8 | **Fundstellenformat wechselt Ende 2024** (`S. 1282` → `2025/92`), Gliederungsnummern entfallen im GVOBl. ab 2025. | Der Parser beherrscht beide Formen; für Verkündungen ab 2025 fehlt aber der beste Normidentifikator. |
| G9 | Das Erlassverzeichnis **nennt selbst 845** Verwaltungsvorschriften; der Parser findet **846** Einträge mit eindeutiger, gepunkteter Gliederungsnummer (ohne Dublette). | Die Abweichung um eins stammt aus dem Register selbst und ist nicht aufgelöst. Eine unabhängige Zählung der Spaltenpositionen bestätigt 846. |

---

## 6 Was daraus für einen späteren Import folgt

1. **Der Stichtagsbestand ist nicht der heutige Bestand.** Die baseline-only-Kandidaten sind die
   Vorschriften, die ein Portalabzug von heute nicht mehr enthält. Für jede von ihnen braucht ein
   Import eine eigene Beschaffung (historische Fassung, Rekonstruktion aus Verkündungen oder eine
   Datenlieferung) und einen dokumentierten `baselineRecoveryMethod`.
2. **Verkündungsdatum vor Ausfertigungsdatum.** Die Dezember-Auswertung zeigt den Effekt in voller
   Schärfe: In den fünf Ausgaben zwischen 2023-12-02 und 2023-12-31 stehen ganz überwiegend
   Vorschriften, die *vor* dem Stichtag ausgefertigt, aber erst *danach* verkündet wurden; sie galten
   am Stichtag noch nicht. Vier weitere Ausfertigungen aus November/Dezember 2023 erschienen sogar
   erst am 2024-01-25 im GVOBl. 2024 Nr. 1. Ein Import, der nach Ausfertigungsdatum filtert, nimmt
   diese Vorschriften fälschlich in den Stichtagsbestand auf.
3. **Befristungen sind der Regelfall, nicht die Ausnahme.** Ohne die Entfristungsregel führt jede
   Auswertung dieses Landesrechts systematisch falsche Ergebnisse. Die entschärften Einträge sind
   deshalb als `contradictory` im Register sichtbar und nicht gelöscht.
4. **Das VwV-Inventar ist die Enumerationsgrundlage für Verwaltungsvorschriften.** 846 Einträge mit
   Gliederungsnummer, Titel, Ausfertigung und Amtsblatt-Fundstelle – mehr als sechsmal so viele wie
   die 136 Datensätze des Transparenzportals. Es ersetzt eine Portalenumeration, die es für
   Verwaltungsvorschriften nicht gibt.
5. **Die kollektiven Weitergeltungsbekanntmachungen** (u. a. Amtsbl. Schl.-H. 2023 S. 3105,
   Bek. v. 4.12.2023) sind Geltungsbelege über den Stichtag hinaus und gehören als
   `portal-completeness-notice`-artige Belege in die Evidenzakte der betroffenen
   Verwaltungsvorschriften.
6. **Offene Punkte**: die rund 210 nicht zugeordneten Registerzeilen verfeinern; die Lücke G1 aus den
   Verkündungsblättern 2023/2024 schließen; für G2 und G3 eine Absprache mit der Verkündungsstelle
   bzw. dem Bildungsministerium herbeiführen.
