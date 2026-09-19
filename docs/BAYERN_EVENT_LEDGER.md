# Bayern: Post-Baseline-Ereignisregister

Stand 2026-09-18. Stichtag des Ausgangsrechtsstands: **2023-12-01**.
Erfasster Zeitraum: **2023-12-02 bis 2026-09-18**, lückenlos.

Dieses Dokument beschreibt Methode, Quellen, Provenienzrang und Grenzen des Ereignisregisters
`bayernrecht-event-ledger/1`. Erzeugt wird es von

```
npm run import:bayernrecht:events -- [--write] [--offline] [--json] [--limit n] [--max-requests n]
```

Ergebnisse:

| Datei | Inhalt |
| --- | --- |
| `data/imports/bayernrecht/events/ledger.json` | alle Ereignisse, deterministisch sortiert, mit Quelle, Prüfsumme und Zielauflösung |
| `data/audits/bayernrecht/EVENT_LEDGER.md` | Bericht mit Kennzahlen, Kandidatenlisten und Reviewfällen |
| `data/audits/bayernrecht/POST_BASELINE_DECEMBER_2023.md` | Sonderauswertung des Dezembers 2023 |

Code: `packages/importers/bayernrecht/src/events/` (`ledger.ts`, `listings.ts`, `documents.ts`,
`classify.ts`, `resolve.ts`, `harvest.ts`, `build.ts`). Tests: `tests/unit/bayernrecht-events.test.ts`
mit echten, gekürzten Quellenausschnitten unter `tests/fixtures/bayernrecht/verkuendung-*.html`.

---

## 1 Warum es dieses Register gibt

BAYERN.RECHT führt **ausschließlich den heutigen Stand**. Die Portalhilfe sagt es wörtlich: „Bereits
außer Kraft getretene bayerische Vorschriften werden nicht bereitgestellt.“ Der XML-Export trägt nur
eine Zeitschicht (`version="p"`), und ein Fassungsauswahl-Widget gibt es nicht
(`docs/BAYERN_SOURCE_DISCOVERY.md`, Abschnitt 6). Für den 2023-12-01 existiert aus dem Portal also
**keine Baseline**.

Die amtlichen Verkündungsorgane enthalten keine konsolidierten Fassungen, wohl aber die Belege, die
eine spätere Stichtagsprüfung als Erstes braucht:

1. **Welche Vorschrift galt am Stichtag, fehlt aber im heutigen Bestand?**
   Jede Aufhebung, Ersetzung oder abgelaufene Befristung mit Verkündung nach dem 2023-12-01 beweist,
   dass die betroffene Vorschrift am Stichtag noch galt. Steht ihr Vorgänger heute nicht mehr im
   Portal, ist sie ein **baseline-only-Kandidat**: Sie muss gesondert beschafft werden, und kein
   Portalabzug von heute enthält sie. Das ist der wichtigste Vollständigkeitsnachweis dieses Registers.
2. **Welche Vorschrift hat sich seit dem Stichtag überhaupt geändert?**
   Für den unveränderten Teilbestand ist der heutige Text zugleich der Stichtagstext. Das Register
   liefert die Ereignisseite dieser Prüfung; die andere Seite steht im Änderungsverlauf des XML.

Das Register **entscheidet nicht** über die Geltung einer Vorschrift und **erzeugt keinen Normtext**.
Es sammelt Belege in derselben Evidenzsprache, die der Adapter ohnehin benutzt
(`src/common/evidence.ts`).

---

## 2 Quellen und Provenienzrang

Alle Quellen liegen auf der Verkündungsplattform Bayern (`www.verkuendung-bayern.de`, Bayerische
Staatsregierung). Der Host hat keine `robots.txt` (HTTP 404), also auch keine Ausschlussregel; die
Nutzungsbedingungen enthalten keinen TDM-Vorbehalt und kein Verbot automatisierten Zugriffs.

### 2.1 Der Provenienzrang ist verbindlich und ungleich

| Organ | Amtlichkeit der elektronischen Ausgabe | `publicationAuthority` | `digitalRepresentation` |
| --- | --- | --- | --- |
| **BayMBl.** – Bayerisches Ministerialblatt | **amtlich**: „Sie werden auf der Verkündungsplattform elektronisch amtlich als PDF-Datei bekannt gemacht.“ | `electronic-official` | `official-electronic-edition` |
| **GVBl.** – Bayerisches Gesetz- und Verordnungsblatt | **nicht amtlich**: „Auf dieser Plattform wird auch nachrichtlich (d. h. nichtamtlich) eine elektronische Fassung des GVBl. angeboten.“ Amtlich ist die Papierausgabe. | `printed-official` | `official-platform-informational-copy` |

Der Rang steht an genau einer Stelle im Code (`ORGAN_PROVENANCE` in `ledger.ts`), wird an jedes
Ereignis geschrieben und von der Schemaprüfung erzwungen: Ein GVBl.-Ereignis mit
`publicationAuthority: 'electronic-official'` ist ein Schemafehler. **Nirgends wird behauptet, die
digitale GVBl.-Kopie sei die amtliche Fassung.**

`www.bayerische-staatszeitung.de`, der Verlag der GVBl.-Papierausgabe, wurde **nicht berührt**: Der
Host formuliert einen ausdrücklichen TDM-Vorbehalt nach § 44b UrhG.

### 2.2 Die vier benutzten Endpunkte

| Kennung | Adresse | Was sie liefert |
| --- | --- | --- |
| Ausgabenverzeichnis GVBl. | `/gesetz-und-verordnungsblatt/alle-ausgaben-des-gvbl-ab-1945/?volume=<jahr>` | je Ausgabe: Nummer, Verkündungsdatum, Seitenbereich, PDF-Adresse und die **von der Plattform veröffentlichte SHA-256** |
| Trefferliste GVBl. | `/gvbl/?volume=<jahr>&itemsPerPage=50&offset=<n>` | je Veröffentlichung: Fundstelle, Verkündung, Titel, Gl-Nr., Ausfertigung |
| Trefferliste BayMBl. | `/baymbl/?itemsPerPage=50&offset=<n>` | dasselbe plus Ressort; Datum der Spalte ist das **Erlassdatum** |
| Detailseite | `/gvbl/<jahr>-<seite>/`, `/baymbl/<jahr>-<nummer>/` | **Volltext der Verkündung in HTML**, Gliederungsnummern, PDF-Adresse und deren veröffentlichte SHA-256 |

Alle vier sind reine GET-Formulare ohne Sitzung und ohne Token.

**Die Detailseiten sind der eigentliche Gewinn.** Sie tragen den Änderungsbefehl im Wortlaut, die
Inkrafttretensvorschrift und – bei einer Ablösung – den ausdrücklichen Außerkrafttretensbefehl gegen
die Vorgängervorschrift. Kein PDF muss geladen werden, es fällt kein OCR an, und der wörtliche Auszug
im Register stammt aus der Verkündung selbst statt aus einer Trefferliste.

**Die veröffentlichte Prüfsumme** (`data-content` des Popover-Buttons, „Hash-Prüfsumme (sha256)“) ist
als `gazettePdfSha256Published` an jedem Ereignis und im Ausgabenverzeichnis des Registers mitgeführt.
Sie belegt die Unverändertheit der elektronischen Kopie – **nicht** deren Amtlichkeit.

### 2.3 Der CSV-Jahreslistenexport des BayMBl.

`/ministerialblatt/jahreslisten-exportieren/` bietet ein POST-Formular mit `ressort`, `volume`,
`export-as` und den Submit-Schaltern `pdf` und `csv`. Geprüft wurde, ob ein GET ihn auslöst:

```
GET /ministerialblatt/jahreslisten-exportieren/?ressort=0&volume=2024&export-as=&csv=Liste+als+CSV+exportieren
→ HTTP 200, text/html – die Formularseite, keine CSV.
```

Der Export hängt am POST und wurde **nicht erzwungen** (`EXPORT_PROBE` in `harvest.ts` hält den Befund
fest). Ausgewertet werden die Übersichtsseiten; sie führen denselben Inhalt strukturiert und sind mit
`itemsPerPage=50` in rund 50 Abrufen je Vollbestand durchblätterbar.

---

## 3 Methode

### 3.1 Abrufplan (`harvest.ts`)

Vier Ausgabenverzeichnisse (2023–2026), 13 GVBl.-Trefferlistenseiten, 48 BayMBl.-Trefferlistenseiten.
Danach steht fest, welche Einzelverkündungen es im Zeitraum gibt – 2 121 mit Verkündung zwischen
2023-12-02 und 2026-09-18.

Der Volltext wird **nur dort** geholt, wo er zur Stichtagsfrage beiträgt (`needsFullText`):

- jede GVBl.-Veröffentlichung – dort steht ausschließlich Rechtsetzung (396 Seiten);
- jede BayMBl.-Veröffentlichung, die die Plattform unter einer **Gliederungsnummer** führt, denn dann
  gehört sie zur Vorschriftensammlung;
- jede BayMBl.-Veröffentlichung, deren Titel ein Normereignis nennt (Aufhebung, außer Kraft,
  Neufassung, Berichtigung, Verlängerung der Geltungsdauer, Weitergeltung) – zusammen 847 Seiten.

Alles Übrige – Stellenausschreibungen, Exequaturs, Verleihungen, Prüfungstermine – wird aus den
Listenangaben als `notice` geführt. Es geht nicht verloren, es kostet nur keinen Abruf.

Netzdisziplin: streng sequenziell, Mindestabstand 1,4 s (der Auftrag verlangt 1,2 s; parallel lädt ein
zweiter Strang denselben Anbieter), identifizierender User-Agent mit Zweck und Kontaktweg, alles über
den Cache `.cache/bayernrecht/`. `Retry-After` und 429/403 behandelt der gemeinsame Fetcher; nach
mehreren Sperrantworten bricht er mit `blocked` ab. Ein Budget (`--max-requests`) führt zu einem
**sauberen Halt**: Der Lauf endet mit dem bis dahin Erreichten, meldet in `pending`, was offen blieb,
und schreibt im Dry-run nichts. Der Fortschritt steckt im Cache; ein erneuter Lauf holt genau die
fehlenden Adressen nach. Mit `--offline` läuft der ganze Aufbau netzfrei aus dem Cache.

### 3.2 Zwei Erkennungsebenen (`classify.ts`)

**Veröffentlichungsebene** – aus dem amtlichen Titel und der Gattungsangabe des Seitenkopfs. Die
Reihenfolge der Muster ist fachlich bindend:

| Reihenfolge | Muster | Ergebnis |
| --- | --- | --- |
| 1 | `Berichtigung der/des …`, `Druckfehlerberichtigung …` | `correction` – **vor** der Änderung, sonst wäre „Berichtigung des Gesetzes zur Änderung …“ eine Änderung |
| 2 | `Aufhebung …`, `… zur Aufhebung …` | `repeal` |
| 3 | `… Außerkrafttreten …` | `expire` |
| 4 | `Neufassung`, `Neubekanntmachung` | `recast` – **vor** der Änderung |
| 5 | `Verlängerung der Geltungsdauer`, `Weitergeltung`, `Fortgeltung` | `extend` |
| 6 | `über das Inkrafttreten …`, `des Inkrafttretens …` | `commencement` |
| 7 | `Staatsvertrag`, `Abkommen`, `Notenwechsel`, `Vertrag zwischen` | `treaty` |
| 8 | `zur Änderung …`, `Änderung der/des …`, `Änderungsgesetz` … | `amend` |
| 9 | `Hinweis`, `Mitteilung`, `Ausschreibung`, `Erteilung`, `Verleihung` … | `notice` |
| 10 | BayMBl. ohne Gliederungsnummer und ohne Muster | `notice` – Bekanntgabe außerhalb der Vorschriftensammlung |
| 11 | alles Übrige | `unknown` mit Rohtext |

**Befehlsebene** – aus dem Wortlaut unmittelbar hinter dem Zitat der betroffenen Vorschrift. Sie
schlägt die Veröffentlichungsebene, wo sie greift: Ein „Gesetz zur Änderung …“ kann in § 7 eine andere
Vorschrift *aufheben*, und genau dieses Ereignis ist für die Stichtagsrekonstruktion das wertvolle.

### 3.3 Fünf Regeln entscheiden über die Qualität

*Verkündungsdatum vor Ausfertigungsdatum.* `eventDate` ist immer das Datum der Verkündung, nie das der
Ausfertigung oder des Erlasses. Der Unterschied entscheidet über die Stichtagsgeltung: Im Dezember 2023
wurden **49 von 91** Veröffentlichungen vor dem Stichtag ausgefertigt, aber erst danach verkündet – sie
galten am 2023-12-01 noch nicht. Weitere **41** Ausfertigungen aus November/Dezember 2023 erschienen
erst 2024, zum Teil Monate später. Ein Import, der nach Ausfertigungsdatum filtert, nimmt sie
fälschlich in den Stichtagsbestand auf. Das Ausfertigungsdatum bleibt als `enactmentDate` erhalten.

*Die Änderungshistorie im Zitat ist kein Gegenstand.* Die deutsche Zitierweise schiebt zwischen Zitat
und Befehl eine Klausel ein, die selbst ein Zitat enthält:

```text
Die Zuständigkeitsverordnung (ZustV) vom 16. Juni 2015 (GVBl. S. 184, BayRS 2015-1-1-V),
die zuletzt durch Verordnung vom 3. September 2024 (GVBl. S. 418) geändert worden ist,
wird wie folgt geändert:
```

Ohne Behandlung entstünde hier ein zweites, falsches Änderungsereignis gegen das *ändernde* Gesetz.
`commandWindow` entfernt die Klausel, bevor es den Befehl sucht, und behandelt ein Zitat, auf das
unmittelbar „… worden ist“ folgt, nie als Gegenstand eines Befehls.

*Teilbereich ist kein Ende.* „§ 7 der Verordnung X wird aufgehoben“ beweist das Gegenteil eines Endes –
die Vorschrift bestand im Übrigen fort. Steht unmittelbar vor dem Titel ein Strukturverweis (`§`,
`Art.`, `Abs.`, `Nr.`, `Anlage`, `Teil`, `Abschnitt`, `Überschrift`), bekommt das Ereignis den Subtyp
`teilaufhebung` bzw. `teilausserkrafttreten` und zählt nie als Ende.

*Aufhebungslisten brauchen eine eigene Lesart.* Das BayMBl. hebt Verwaltungsvorschriften als
nummerierte Liste auf – der Befehl steht **vor** den Zielen, nicht dahinter:

```text
1.    Es werden folgende Verwaltungsvorschriften aufgehoben:
1.1   Bekanntmachung … über die Zusammenarbeit von Schule und Berufsberatung vom 10. Juli 2006 (AllMBl. S. 252),
1.2   Bekanntmachung … über die Gewährung einer Entschädigung … vom 14. März 1978 (AllMBl. S. 57),
1.3   Schreiben … über die Grundsätze für die Zulassung … vom 28. April 2005, Az. I 4/2921/4/05.
```

Die gewöhnliche Befehlserkennung fände hier nichts, und die Gliederungsnummern der Veröffentlichung
bezeichnen nur die Sachgebiete. `scanRepealList` liest die Listenglieder einzeln und nimmt je Glied das
**letzte** Ausfertigungsdatum – Glied 1.2 zitiert ein Bundesgesetz „vom 12. April 1976“ und ist selbst
vom 14. März 1978. Ohne diese Sonderbehandlung gingen genau die Belege verloren, die den
Stichtagsbestand offenlegen.

*Nichts wird verworfen, nichts ergänzt.* Eine Veröffentlichung ohne passendes Muster wird als `unknown`
mit Rohtext erfasst und im Bericht gezählt. Ein fehlendes Datum wird nie ergänzt. Eine Detailseite ohne
HTML-Textkörper geht als `no-text-layer` in den Review – **kein OCR**, keine Vermutung.

### 3.4 Zielauflösung (`resolve.ts`)

Abgleichbestand sind die beiden Enumerationsdateien `data/imports/bayernrecht/enumeration-landesrecht.json`
(935 Einträge, 872 mit BayRS-Nummer) und `…-vwv.json` (1 478 Einträge). Beide werden nur **gelesen**.

Fünf strukturierte Identitätsmerkmale sind zugelassen – und nur sie:

| Merkmal | Woher | Eindeutigkeit |
| --- | --- | --- |
| `bayrs` | Gliederungsnummer der Veröffentlichung (GVBl.) oder aus dem Verkündungstext | global eindeutig |
| `fundstelle` | die Fundstelle der Veröffentlichung steht im Änderungsverlauf der Norm | global eindeutig |
| `abbreviation` | amtliche Abkürzung aus dem Verkündungstext | im Bestand zu prüfen |
| `exact-title` | vollständiger Titel, Zeichen für Zeichen nach Normalisierung | im Bestand zu prüfen |
| `ausfertigungsdatum` | Ausfertigungsdatum der Zielnorm | nie allein |

**Ähnliche Titel sind kein Merkmal.** Es gibt hier absichtlich kein unscharfes Verfahren. Ein
Fuzzy-Treffer wäre in einem Register, aus dem später ein Rechtsbestand rekonstruiert wird, der
gefährlichste aller Fehler: Er sieht aus wie ein Ergebnis. Wer ein Ziel nur ungefähr wiedererkennt,
bekommt keine starke Auflösung, sondern einen Reviewfall.

Zwei Eigenheiten mussten eigens behandelt werden:

- **Der deutsche Genitiv macht die Titelgrenze im Fließtext mehrdeutig.** In „Verordnung zur
  Durchführung **des** Polizeiorganisationsgesetzes“ gehört das Genitivattribut zum Titel, in „Auf
  Grund des § 70 **der** Straßenverkehrs-Zulassungs-Ordnung“ nicht. Statt zu raten, führt der Scanner
  bis zu vier Lesarten; entschieden wird erst beim Abgleich, und nur durch vollständige
  Übereinstimmung.
- **Mantelakte stehen in mehreren Änderungsverläufen.** Die Fundstelle allein entscheidet dann nicht.
  Der Auflöser grenzt die Treffer mit Gliederungsnummer, Abkürzung oder vollständigem Titel ein und
  fällt, wenn auch das nichts hergibt, auf die übrigen Merkmale zurück, bevor er Mehrdeutigkeit meldet.

**Für Verwaltungsvorschriften ist die Lage schwächer als für Gesetze.** Der Fortführungsnachweis zum
BayMBl. führt Gliederungsnummern nur an den **Sachgebietsüberschriften**, nicht an der einzelnen
Vorschrift (belegt in `tests/fixtures/bayernrecht/ffn-mbl-excerpt.html`; 250 Sachgebietsnummern teilen
sich 1 282 Einträge). Die Gliederungsnummer einer BayMBl.-Veröffentlichung wie `2230.2-A` bezeichnet
deshalb ein Sachgebiet und ist **kein** Identitätsmerkmal; sie wird als Hinweis mitgeführt. Die
Identität trägt dort die Fundstelle im Änderungsverlauf oder der vollständige Titel – auch der aus dem
amtlichen Titel der Veröffentlichung abgeleitete („Änderung **der Richtlinie zur Förderung der
Inklusion in der Kindertagesbetreuung**“).

### 3.5 Vollständigkeit der Enden

Zu jedem `repeal`, `replace` und `expire` gehört entweder ein bestimmter Vorgänger oder ein
ausdrücklicher Reviewfall. Die Schemaprüfung erzwingt es:

- ein Ende mit `targetResolution.status: 'not-applicable'` ist ein Schemafehler;
- ein Ende mit `'missing-predecessor'` muss auch den `processingStatus: 'missing-predecessor'` tragen.

Damit kann kein Ende stillschweigend verschwinden.

### 3.6 Evidenz, Kennungen, Determinismus (`ledger.ts`)

| Klasse | Bedeutung |
| --- | --- |
| `strong` | Verkündungsdatum **und** Fundstelle **und** ein strukturell identifiziertes Ziel |
| `supporting` | amtlicher Beleg, dem eines dieser drei Merkmale fehlt |
| `insufficient` | bloßer Hinweis (unbestimmtes Ziel, kein Muster) |
| `contradictory` | der Beleg steht gegen einen anderen starken Beleg derselben Vorschrift |

Die Ereigniskennung ist stabil und stammt aus Quelle, Position, laufender Nummer und normalisiertem
Belegtext: `gvbl-2024-682-n00682-00-<10 Hex>`. Der Inhaltsanteil sorgt dafür, dass eine geänderte
Quelle neue Kennungen erzeugt, statt alte Belege stillschweigend umzudeuten.

**Der Auswertungsstichtag ist eine Konstante** (`EVALUATION_DATE`, derzeit `2026-09-18`), kein
Tagesdatum. Nur so erzeugt ein Wiederholungslauf byteidentische Dateien – geprüft: Ein zweiter Lauf
über denselben Cache schreibt keine Datei neu. Die Konstante begrenzt zugleich den erfassten Zeitraum
nach oben; wird sie erhöht, wandern abgelaufene Befristungen von „künftig“ zu „eingetreten“.

### 3.7 Korrektur „Registerfehler EuMedBek“ (Lauf 5, 2026-09-18)

Die Europamedaillen-Bekanntmachung (EuMedBek, AllMBl. 2018 S. 962) steht im Portal (`BayVV_1132_S_086`),
stand aber als heute fehlende Stichtagsnorm im Register – und wurde deshalb als baseline-only-Norm
wiederhergestellt, während das Portal sie weiter führt. Vier allgemeine Ursachen, alle behoben und mit
Regressionstests belegt (`tests/unit/bayernrecht-events.test.ts`, Abschnitt „Registerfehler EuMedBek“):

| Ursache | Beleg | Korrektur |
| --- | --- | --- |
| Abkürzung hinter Gedankenstrich nicht erkannt | BayMBl. 2026 Nr. 377: „Europamedaillen-Bekanntmachung – EuMedBek vom 12. Oktober 2018 (AllMBl. S. 962)“ | `classify.ts#titleAbbreviation`: Klammer **oder** Gedankenstrich + ein Wort mit ≥ 2 Großbuchstaben; der Titel bleibt wörtlich (Kennung), die Lesart ohne Abkürzung kommt hinzu |
| Wirksamwerden des Endes nicht berücksichtigt | Aufhebung verkündet am 16. September 2026, wirksam am 1. Oktober 2026 – am Auswertungsstichtag galt die EuMedBek noch | `ledger.ts#endEffectiveDay`: `terminationDate` + 1, sonst `effectiveDate`, sonst Verkündung; Kandidat nur bei Wirksamwerden bis zum Auswertungsstichtag, sonst künftiges Ende |
| Unterbefehl machte eine Änderung zur Aufhebung | BayMBl. 2024 Nr. 7: „Nr. 5 der EuMedBek … wird wie folgt geändert: … 1.2 Die Sätze 3 bis 5 werden aufgehoben.“ stand als Aufhebung der ganzen EuMedBek zum 1. Februar 2024 im Register | `classify.ts#classifyCommand`: Es entscheidet der **erste** Befehl im Fenster, nicht die Rangfolge der Regeln |
| Keine Konsistenz über Ereignisse hinweg | BayMBl. 2024 Nr. 7 löste die EuMedBek im Bestand auf, BayMBl. 2026 Nr. 377 dieselbe Vorschrift nicht | `build.ts#reconcileTargetIdentities`: gleiches Stammzitat (Ausfertigungsdatum + Blatt + Seite/Nummer) wie ein stark aufgelöstes Ereignis → dieselbe Bestandsnorm; verschiedene → `ambiguous` |

Zwei verwandte Lücken derselben Zielauflösung wurden mitbehoben:

- **Betreff statt Erlassstelle** (`resolve.ts#subjectReading`): Der Fortführungsnachweis führt „Bek StMAS:
  Vereinbarung über Richtlinien …“, der Verkündungstext zitiert „Bekanntmachung des Bayerischen
  Staatsministeriums für Arbeit … über die Vereinbarung über Richtlinien …“. Der Betreff hinter dem ersten
  „über“ ist eine weitere, vollständig zu vergleichende Lesart (BayMBl. 2026 Nr. 369 und Nr. 379: vier
  Ereignisse zu drei künftig aufgehobenen, heute im Portal geführten Vorschriften).
- **Außerkrafttreten je Zitat** (`build.ts#terminationFor`): Die erste „außer Kraft“-Angabe eines Textes ist
  oft die Befristung der *neuen* Vorschrift. Das Ende der abgelösten Vorschrift steht jetzt aus dem Befehl
  hinter ihrem Zitat (belegt: BayMBl. 2025 Nr. 17 – neue Feuerwehr-Zuwendungsrichtlinien bis 2027, die alten
  enden mit Ablauf des 31. Dezember 2024). „tritt am … außer Kraft“ wird als letzter Geltungstag (Vortag)
  geführt.
- **Fundstelle ohne Punkt** („(BayMBl Nr. 580)“, BayMBl. 2025 Nr. 113) wird als Zitat erkannt.

Auswirkung des Neuaufbaus (offline, derselbe Cache): 3 064 → 3 045 Ereignisse. 72 vermeintliche
Aufhebungen/Außerkrafttreten sind Änderungen – alle gegen heute im Portal geführte Normen (etwa BayKiBiG,
ZustV, BayHIG, VV-BayHO, Notarbekanntmachung); das Register hatte diese Normen als beendet ausgewiesen.
20 Ende-Ereignisse entfallen ganz (16 davon gegen Bestandsnormen), ein neues kommt hinzu.
baseline-only-Kandidaten 426 → 414:

| Änderung | Kandidaten |
| --- | ---: |
| Ende wirkt erst nach dem Auswertungsstichtag (BayMBl. 2026 Nr. 369, 377, 379) | −6 |
| im Bestand aufgelöst (EuMedBek, Sachverständigenwesen, Schule/Berufsberatung, Jugendarbeitsschutz – alle zugleich künftige Enden) | (in −6 enthalten) |
| über den Betreff mehrdeutig (BayMBl. 2024 Nr. 651: jährliche Bekanntmachungen mit gleichlautendem Titel) | −7 |
| keine Aufhebung, sondern Änderung (Landesamt für Schule, Bestattungsverordnung, Hilfsmittelbekanntmachung-Q2) | −3 |
| Ende jetzt aus dem Befehl hinter dem Zitat (Rechnungslegungsrichtlinie, Feuerwehr-Zuwendungsrichtlinien, Besoldungs-Änderungsgesetz) | +3 |
| Fundstelle ohne Punkt erkannt (Richtlinie Vorgründungs- und Nachfolgecoaching) | +1 |

Die Kennungen der 15 bereits übernommenen baseline-only-Ereignisse sind unverändert. Eine Kennung ändert sich,
wo sich der Ereignistyp ändert (er ist Teil des Inhaltsanteils) oder ein früheres Ereignis derselben
Veröffentlichung wegfällt (laufende Nummer) – betroffen ist unter den Kandidaten nur die Aufhebung der
Rückforderungsrichtlinie (`baymbl-2025-590-n00590-03-…` → `…-02-…`).

### 3.8 Korrektur „Befehlstypisierung“ (Lauf 6, 2026-09-18)

Die Rückrechnung (Agent R) fand Rezeptschritte an Ereignissen vom Typ `new`, obwohl die Verkündung die Norm nur
ändert (GVBl. 2024 S. 98 neunmal, S. 605, S. 619, S. 114). Ursache: Hinter dem Zitat wurde kein Befehl erkannt,
und das Ereignis fiel auf die Veröffentlichungsebene zurück – `new`, weil eine Mantelverordnung selbst eine
Verordnung ist. Allgemein behoben in `classify.ts`, Regressionstests in `tests/unit/bayernrecht-events.test.ts`
(Abschnitt „Befehlserkennung: Wortlautbefehle, Aufzählungen, Satzklammer, neuer Wortlaut“, wörtliche Ausschnitte):

| Lücke | Beleg | Korrektur |
| --- | --- | --- |
| Wortlautbefehle | „In Art. 98 Satz 1 des BayBesG (…) werden die Wörter „…“ durch die Wörter „…“ ersetzt“ | Regel: `wird/werden … ersetzt/gestrichen/eingefügt/angefügt/vorangestellt` → `amend` |
| Befehl länger als das Fenster | GVBl. 2024 S. 98 Abs. 57 (AELFV): das Schlussverb steht hinter 180 Zeichen | bis zum Beginn des nächsten Glieds lesen (höchstens 600 Zeichen) |
| „wird“ im neuen Wortlaut | GVBl. 2024 S. 570: „… die ehrenamtlich … durchgeführt wird“ eingefügt | zitierter Wortlaut („…“) ist nie Befehl (`maskQuoted`) |
| bereinigte Fassung | „… (BayRS 630-1-F) veröffentlichten bereinigten Fassung, die zuletzt …“ | Rest der Fassungsangabe gehört zum Zitat |
| Befehl vor einer Aufzählung | GVBl. 2025 S. 443: „Mit Ablauf des 31. August 2025 treten außer Kraft: 1. die ErgPOFHR …, sowie 2. die BegPO …“ | `listCommand`: Glied direkt hinter der Gliederungsziffer, kein neuer Absatz dazwischen, Frist aus dem Befehl |
| Satzklammer | GVBl. 2025 S. 246: „Mit Ablauf des 31. Juli 2025 tritt die Ladenschlussverordnung (…) … außer Kraft.“ | `bracketCommand`: Verb vor, „außer Kraft“ hinter dem Zitat |
| Zitat im neuen Wortlaut | BayMBl. 2026 Nr. 356: „Nr. 4 wird wie folgt gefasst: „… tritt die Bekanntmachung … vom 12. April 2018 (KWMBl. S. 167) außer Kraft.““ | `insideQuote`: nie Gegenstand eines Befehls |
| Berichtigung als Änderung | „wird wie folgt berichtigt: … ersetzt“ | Berichtigungsregel mit „wie folgt“; in einer Berichtigung sind Wortlautbefehle Berichtigungen |
| Aktenzeichen hinter dem Datum | BayMBl. 2025 Nr. 89: „… Forsten vom 31. Januar 2022, Az. Z5-7971.1-1/18 (BayMBl. Nr. 125), außer Kraft“ – Titel „Forsten vom 31. Januar 2022, Az. …“, kein Ausfertigungsdatum | Ausfertigungsteil samt Aktenzeichen; ein Einzelwort auf „-vereinbarung“ ist ein Titel („Dienstvereinbarung“, BayMBl. 2024 Nr. 196) |
| Zitat ohne BayRS-Nummer | GVBl. 2024 S. 114 Art. 13 Abs. 3: „In Art. 13 Abs. 3 des Haushaltsgesetzes 2022 (HG 2022) vom 22. April 2022 (GVBl. S. 102) wird die Angabe … ersetzt“ – die Veröffentlichung führt 630-2-24-F, das Zitat nennt keine BayRS-Nummer; das Ereignis fiel auf `new` zurück | Zitat gehört zur Gliederungsnummer, wenn der Bestand unter ihr genau eine Vorschrift führt, das Zitat deren Ausfertigungsdatum trägt, jedes Titelwort in ihrem Titel steht und alle passenden Zitate dieselbe Fundstelle nennen |
| `new` gegen eine zitierte Norm | BayMBl. 2025 Nr. 209: „Die nach der Realschulordnung (RSO) vom 18. Juli 2007 … zu erteilenden Zeugnisse …“ | ohne Befehl ist das Zitat Bezugnahme; das `new`-Ereignis gilt der Veröffentlichung selbst |

Auswirkung (offline, derselbe Cache): 3 045 → 3 072 Ereignisse. Kennungen ändern sich, weil Ereignistyp, Zieltitel und die
laufende Nummer Teil der Kennung sind – die Zuordnung alt → neu (gegen Commit 27b680a5f) steht in
`data/imports/bayernrecht/events/id-changes-run6.json`: 149 geänderte Kennungen (126 `new` → `amend`, davon 99 in
GVBl. 2024 S. 98 (88), S. 114 (4, darunter das HG 2022), S. 605 (3) und S. 619 (4); 7 `amend` → `expire`; 5 `new` →
`expire`; 11 mit berichtigtem Zieltitel bei gleichem Typ – 6 Berichtigungen, 3 Zitate mit Aktenzeichen, je 1 `new`
und `notice`), 5 entfallene Ereignisse (3 Aufhebungen und 2 Außerkrafttreten, die im neuen Wortlaut oder in
Unterbefehlen einer Änderung standen – Grund je Kennung in der Datei) und 32 neue Außerkrafttreten aus Satzklammern
und Aufzählungen. Die Kennungen der 25 bis Lauf 5 übernommenen
baseline-only-Normen sind unverändert. baseline-only-Kandidaten 414 → 438: 24 bisher übersehene Enden von
Vorgängervorschriften („Mit Ablauf des … tritt die Bekanntmachung … außer Kraft“).

---

## 4 Kennzahlen (Lauf 2026-09-18)

3 072 Ereignisse aus 2 121 Veröffentlichungen – GVBl. 905, BayMBl. 2 167 (nach den Korrekturen in 3.7 und 3.8).

| Ereignistyp | 2023 | 2024 | 2025 | 2026 | gesamt |
| --- | ---: | ---: | ---: | ---: | ---: |
| `new` | 22 | 129 | 122 | 80 | 353 |
| `amend` | 36 | 563 | 406 | 311 | 1 316 |
| `repeal` | 0 | 273 | 26 | 140 | 439 |
| `recast` | 0 | 1 | 1 | 0 | 2 |
| `expire` | 8 | 33 | 36 | 18 | 95 |
| `commencement` | 0 | 0 | 1 | 2 | 3 |
| `correction` | 2 | 8 | 14 | 6 | 30 |
| `treaty` | 0 | 7 | 8 | 2 | 17 |
| `notice` | 34 | 315 | 267 | 195 | 811 |
| `unknown` | 0 | 2 | 2 | 2 | 6 |

`replace` und `extend` traten nicht auf. Die bayerischen Quellen drücken die Ablösung einer Vorschrift
durch eine neue nicht als eigenen Typ aus, sondern als Aufhebung oder Außerkrafttreten durch den
Nachfolger – dafür steht der Subtyp `ausserkrafttreten-durch-nachfolger` mit 112 Ereignissen. Eine
Verlängerung der Geltungsdauer kam im Zeitraum nicht vor. Beide Typen bleiben im Schema, damit ein
späterer Lauf sie führen kann, ohne das Schema zu ändern.

Häufigste Subtypen: `aenderungsverordnung` 278, `mantelaenderung` 199,
`ausserkrafttreten-durch-nachfolger` 112, `aenderungsgesetz` 63, `berichtigung` 30, `staatsvertrag` 17,
`teilaufhebung` 6, `teilausserkrafttreten` 3, `neubekanntmachung` 3, `inkrafttretensbekanntmachung` 3.

Evidenz: `strong` 1 737, `supporting` 1 329, `insufficient` 6, `contradictory` 0.
Zielauflösung: `resolved` 1 315, `absent-from-portal` 555, `not-applicable` 1 109, `unidentified` 42,
`ambiguous` 40, `missing-predecessor` 11. Strukturell stark aufgelöst: **1 740**.

**Baseline-only-Kandidaten: 438** (Lauf 5: 414, davor 426). Davon 410 mit strukturell starker Zuordnung.
Künftige Enden: 9. Es sind ganz überwiegend Verwaltungsvorschriften aus den Aufhebungslisten und
Schlussvorschriften des BayMBl.; ihre Wiederherstellung aus den Verkündungen beschreibt `docs/BAYWUE_BASELINE_ONLY.md`.

Lesart der Kennzahlen:

- **„Nach dem Stichtag“** heißt: Das Ereignis trägt ein **Verkündungsdatum** ab 2023-12-02. Ereignisse
  ohne Datum zählen hier nicht mit – es wird nichts unterstellt.
- **baseline-only-Kandidat** ist ein Ereignis, das (a) das Ende der *ganzen* Vorschrift belegt, (b)
  regulär erfasst ist, (c) ein benanntes, im heutigen Bestand aber nicht mehr geführtes Ziel hat und
  (d) zwischen 2023-12-02 und dem Auswertungsstichtag **wirksam wird** (`endEffectiveDay`: letzter
  Geltungstag + 1, sonst Inkrafttreten des aufhebenden Akts, sonst Verkündung).
- **Künftige Befristung** ist dasselbe mit einem Enddatum *nach* dem Auswertungsstichtag. Auch sie
  beweist die Geltung am Stichtag, aber die Vorschrift gilt weiter – kein Kandidat.
- **`notice` ist mit 811 der zweithäufigste Typ.** Das ist kein Fehler: Das BayMBl. verkündet
  überwiegend Bekanntgaben, die keine Vorschriften sind. Sie stehen im Register, tragen aber kein Ziel
  und keine Stichtagsaussage.

---

## 5 Grenzen

| ID | Grenze | Folge |
| --- | --- | --- |
| G1 | **Die elektronische GVBl.-Ausgabe ist nicht amtlich.** Amtlich ist die Papierausgabe des Verlags Bayerische Staatszeitung, und dieser Host ist wegen seines TDM-Vorbehalts unerreichbar. | Jedes GVBl.-Ereignis führt `printed-official` und `official-platform-informational-copy` mit. Ein Import muss die Provenienz im Manifest als Informationskopie kennzeichnen. Die veröffentlichte Prüfsumme belegt die Unverändertheit der Kopie, nicht ihre Amtlichkeit. |
| G2 | **Gliederungsnummern des BayMBl. bezeichnen Sachgebiete, nicht Vorschriften.** Der Fortführungsnachweis führt Nummern nur an den Sachgebietsüberschriften. | Für Verwaltungsvorschriften trägt die Identität die Fundstelle im Änderungsverlauf oder der vollständige Titel. 42 Ereignisse bleiben `unidentified`, 33 `ambiguous`. |
| G3 | **Der Änderungsverlauf des Bestands ist unvollständig**: nur 530 der 1 478 Verwaltungsvorschriften und 699 der 935 Gesetze/Verordnungen führen überhaupt Änderungsnotizen. | Das Merkmal `fundstelle` greift nicht überall. Wo es fehlt, entscheidet der vollständige Titel – oder es bleibt beim Reviewfall. |
| G4 | **Der CSV-Jahreslistenexport des BayMBl. hängt an einem POST**; ein GET liefert nur die Formularseite (geprüft). | Nicht erzwungen. Die Trefferlisten decken denselben Inhalt strukturiert ab; der Aufwand ist rund 50 Abrufe je Vollbestand. |
| G5 | **Kein OCR.** Eine Detailseite ohne HTML-Textkörper wird als `no-text-layer` geführt. | Im Lauf 2026-09-18 trat der Fall nicht auf; die Regel steht trotzdem und ist fail-closed. |
| G6 | **BayMBl.-Veröffentlichungen ohne Gliederungsnummer und ohne Normereignis-Muster werden nur aus den Listenangaben erfasst** (kein Volltext). | Sie sind als `notice` mit Titel, Datum, Fundstelle und Ressort enthalten, aber ohne wörtlichen Auszug aus der Verkündung. Sollte sich darunter doch ein Normereignis verbergen, ist es im Register sichtbar, aber nicht ausgewertet. |
| G7 | **Der deutsche Genitiv begrenzt die Titelableitung.** „Änderung **des** 49. Jahreskrankenhausbauprogramms“ liefert die gebeugte Form, die im Bestand so nicht steht. | Solche Ziele bleiben unaufgelöst statt falsch aufgelöst. Das ist Absicht. |
| G8 | **Vorgängerblätter vor 2019** (AllMBl., JMBl., FMBl., KWMBl.) werden nicht abgerufen. | Für den Zeitraum ab 2023-12-02 ohne Belang; die Aufhebungslisten *zitieren* sie aber als Fundstelle der aufgehobenen Vorschrift, und diese Zitate sind erfasst. |
| G9 | **Das Register entscheidet nichts.** Es enthält keine konsolidierte Fassung und keine Rückrechnung. | Die Stichtagsprüfung und die Rekonstruktion sind eigene Schritte; dieses Register liefert ihnen die Belege. |

---

## 6 Was daraus für einen späteren Import folgt

1. **Der Stichtagsbestand ist nicht der heutige Bestand.** Die 438 baseline-only-Kandidaten fehlen in
   jedem Portalabzug von heute. Für jeden braucht ein Import eine eigene Beschaffung und einen
   dokumentierten `baselineRecoveryMethod`. Die Mehrzahl sind Verwaltungsvorschriften.
2. **Nach Verkündungsdatum filtern, nie nach Ausfertigungsdatum.** Die Dezember-Auswertung zeigt den
   Effekt in voller Schärfe: 49 von 91 Dezember-Verkündungen waren vor dem Stichtag ausgefertigt, und
   41 weitere Ausfertigungen aus November/Dezember 2023 erschienen erst 2024.
3. **Der Dezember 2023 ist der dichteste Beleghaufen, den es gibt.** 40 Verkündungen richten sich gegen
   eine vorbestehende Vorschrift und benennen sie mit Titel, Ausfertigungsdatum, Fundstelle und
   Gliederungsnummer. Für sie ist der Stichtagstext aus dem heutigen Text und dem Änderungsbefehl
   rückrechenbar.
4. **Die Reviewfälle sind klein und benannt**: 11 `missing-predecessor`, 33 `ambiguous`, 42
   `unidentified`, 6 `unknown`. Das ist die Arbeitsliste für eine spätere Verfeinerung – nicht mehr,
   aber auch nicht weniger.
5. **Offen geblieben**: die Vollständigkeit des BayMBl.-Auffangfalls (G6) durch eine Stichprobe prüfen;
   die `unidentified`-Fälle über eine Ressort- oder Sachgebietszuordnung weiter eingrenzen; die
   Abdeckung der Vorgängerblätter für Aufhebungen mit Fundstelle vor 2019 klären.
