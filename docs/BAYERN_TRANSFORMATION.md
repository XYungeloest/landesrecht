# Rechtsüberleitung Bayern → Freistaat Bayern-Württemberg

Regelwerk der Transformationsschicht des Importers `bayernrecht`
(`packages/importers/bayernrecht/src/transform/`). Sie überführt reales Recht des Freistaates Bayern
in Recht der Simulationsjurisdiktion `baywue` („Freistaat Bayern-Württemberg“). Aufbau,
Reportformat, Institutionenpolitik und die Fail-closed-Regeln folgen den erprobten Transformern
Nordrhein-Westfalen → Land Westdeutschland (`docs/RECHT_NRW_IMPORT.md`,
`docs/WEST_REFERENCE_BASELINE.md`) und Schleswig-Holstein → Land Niedersachsen-Holstein
(`docs/SCHLESWIG_HOLSTEIN_TRANSFORMATION.md`); die sprachlichen Regeln sind eigenständig und in
einem Punkt grundsätzlich anders gebaut (siehe „Idempotenz“).

| Komponente | Wert |
| --- | --- |
| Quellland (Provenienz, nie transformiert) | Bayern (`SOURCE_STATE`) |
| Zieljurisdiktion | `baywue` – „Freistaat Bayern-Württemberg“, Kurzform „BayWü“, Verkündungsblatt „GVBl. BayWü“ |
| Transformerversion | `bayernrecht-transformer/1.0.0` (`TRANSFORMER_VERSION` in `transform/rules.ts`) |
| Reportschema | `bayernrecht-transformation-report/1` |
| Institutionen-Zuordnung | `data/imports/bayernrecht/institution-mapping.json` (`bayernrecht-institution-mapping/1`) |
| Slugzusatz | `-baywue` (`JURISDICTION_SUFFIX`, Prüfung in `common/slug-registry.ts`) |
| Tests | `tests/unit/bayernrecht-transform.test.ts` |

Alle Zielbezeichnungen stammen ausschließlich aus dem Jurisdiktionsregister
(`packages/legal-core/src/config/jurisdictions.ts`); im Code steht kein Zielname als Literal.
`targetProperName()`, `targetShortName()`, `targetStateName()`, `targetStateForm()`,
`targetGazette()`, `targetNameParts()`, `targetAppendedPart()` und `targetAdjective()` leiten
Eigenname, Kurzform, Vollbezeichnung, Staatsform, Verkündungsblatt, Namensteile, angehängten Teil
und Adjektiv aus dem Register ab.

## Ablauf

```
Erkennung (unveränderter Quelltext) → Entscheidung je Fund → Ersetzung nach benannter Regel
  → Prüfung nach der Transformation (fail-closed) → Restpostenprüfung auf der fertigen Norm
```

1. **Erlassorgan** nur aus ausdrücklicher Formel (`transform/organs.ts`).
2. **Erkennung** aller landesbezogenen Bezeichnungen auf dem *unveränderten* Quelltext
   (`transform/detection.ts`), Einordnung über die zentrale Institutionen-Zuordnung.
3. **Ersetzung** ausschließlich der Landesbezeichnung nach benannten Regeln (`transform/rules.ts`);
   Schutzmuster werden vorher längengleich maskiert und bleiben byteidentisch.
4. **Nachprüfung** (`auditTransformation`): Restvorkommen, Doppelbildungen, nicht angewandte Regeln,
   stille Änderungen.
5. **Restpostenprüfung** auf der fertigen Norm (`transform/audit-record.ts`), angeschlossen an
   `createTransformer().audit()` in `src/index.ts`.

## Idempotenz: konstruiert, nicht nachträglich geprüft

Die zentrale Besonderheit gegenüber allen bisherigen Ländern: **Der Zielname enthält den Quellnamen
vollständig.**

```
Bayern  →  Bayern-Württemberg
```

Bei Schleswig-Holstein → Niedersachsen-Holstein teilten Quelle und Ziel nur den *End*teil
„Holstein“; dort genügte die Regel „ersetze nie ein Teilwort“, und die Idempotenz fiel als
Nebenwirkung ab, weil die Zielbezeichnung den Quellnamen nicht mehr enthielt. Hier ist es umgekehrt:
Eine zweite Anwendung derselben Regel ergäbe „Bayern-Württemberg-Württemberg“. Idempotenz ist hier
**nicht geschenkt** – sie wird konstruiert:

* Jede Regel, die den Zielnamen erzeugen kann, trägt unmittelbar hinter dem Quellnamen einen
  **negativen Lookahead auf den bereits angehängten Zielteil** (`APPENDED_GUARD`,
  `APPENDED_GUARD_UPPER` in `rules.ts`). Ein „Bayern“, dem schon „-Württemberg“ folgt, ist damit für
  jede Regel unerreichbar – unabhängig davon, welche Regel den Namen erzeugt hat, in der ersten wie
  in jeder weiteren Anwendung.
* Der angehängte Teil wird aus dem Register abgeleitet (`targetAppendedPart()`), nicht literal
  gesetzt. Enthielte der Zielname den Quellnamen einmal nicht mehr, wäre der Schutz eine leere
  Zusicherung – nicht ein falscher.
* Derselbe Lookahead steht in der **Restpostensuche** (`SOURCE_STATE_REFERENCE`) und in der
  **Zielprüfung der Institutionen-Zuordnung** (`SOURCE_STATE_IN_TARGET`). Ohne ihn meldete die
  Nachprüfung jede korrekt übergeleitete Norm als defekt, und die Zuordnung wiese jedes richtige
  Ziel zurück.
* Das **Adjektiv** braucht keinen eigenen Lookahead, weil die redaktionell gewählte Zielform die
  Quellform nicht mehr enthält (siehe nächster Abschnitt). Das ist kein Zufall, sondern einer der
  beiden Gründe für die Wahl.
* Das Trennzeichen im Lookahead (`NAME_SEPARATOR`) erfasst Bindestrich, geschützten Bindestrich,
  Gedankenstriche (U+2010–U+2015), Minuszeichen, Leerzeichen und Zeilenumbruch, auch mit Leerraum
  vor dem Strich. Die Toleranz ist keine Bequemlichkeit: Dasselbe Trennzeichen steht im
  Idempotenzschutz **und** in der Doppelbildungsprüfung; jede Schreibweise, die es nicht erfasst,
  wäre eine Lücke in beiden. Umgekehrt gilt: Steht der angehängte Zielteil in irgendeiner dieser
  Schreibungen schon da, greift keine Regel mehr – im Zweifel wird nicht ersetzt.

Geprüft wird das nicht am Grundfall, sondern an **jeder** Flexions- und Schreibvariante: zweite und
dritte Anwendung müssen unverändert bleiben, die fertige Zielform darf keine Regel mehr auslösen,
und in keiner Variante darf eine Doppelbildung entstehen
(`tests/unit/bayernrecht-transform.test.ts`, „Idempotenz und Doppelungsfreiheit“).

## Regelwerk

| Regel | Trifft | Ergebnis |
| --- | --- | --- |
| `jurisdiction-name-genitive` | „des Freistaates/Freistaats/Landes Bayern“ | „des Freistaates … Bayern-Württemberg“ |
| `jurisdiction-name-dative` | „im/dem/vom/beim/zum/am Freistaat \| Land Bayern“ | „… Freistaat Bayern-Württemberg“ |
| `jurisdiction-name-full` | „Freistaat Bayern“, „Land Bayern“ | „Freistaat Bayern-Württemberg“ |
| `jurisdiction-name-adjective` | „bayerisch“/„Bayerisch“ in allen Flexionen (`-e`, `-em`, `-en`, `-er`, `-es`) | „bayern-württembergisch…“ / „Bayern-Württembergisch…“ |
| `jurisdiction-name-adjective-upper` | Versalschreibung „BAYERISCH…“ | „BAYERN-WÜRTTEMBERGISCH…“ |
| `jurisdiction-name-bare` | „Bayern“, Genitiv „Bayerns“, Kompositum („Bayern-Fonds“) | „Bayern-Württemberg“, „Bayern-Württembergs“, „Bayern-Württemberg-Fonds“ |
| `jurisdiction-name-upper` | Versalschreibung „BAYERN“, „BAYERNS“ | „BAYERN-WÜRTTEMBERG“, „BAYERN-WÜRTTEMBERGS“ |

Die Reihenfolge ist Priorität; protokolliert wird in Quellreihenfolge. Es gibt **keine**
Abkürzungsregel (siehe „Abkürzungen mit Bay“).

**Wortgrenzen.** Die Namensregel verlangt „Bayern“ mit anschließender Nicht-Buchstaben-Grenze, die
Adjektivregel „bayerisch“ mit derselben Grenze. Wörter, die nur zufällig mit „Bay“ beginnen oder
„Bayer“ enthalten, sind damit für keine Regel erreichbar.

**Staatsform.** Bayern führt sich als Freistaat; „Land Bayern“ kommt in Verweisen auf Bundesrecht
vor. Beide Formen stehen quellseitig als Literal im Regelwerk, die Zielform kommt aus dem Register.

**Versalschreibung.** Die übrigen Regeln sind bewusst schreibungsabhängig, weil sie die
Groß-/Kleinschreibung der Quelle tragen. Eine durchgängig in Versalien gesetzte Überschrift träfe
deshalb keine von ihnen; `jurisdiction-name-upper` und `jurisdiction-name-adjective-upper` schließen
die Lücke. Die Doppelbildungsprüfung arbeitet schreibungsunabhängig – eine Doppelbildung ist in jeder
Schreibung falsch.

## Redaktionelle Festlegung: das Adjektiv

**Die Quelle sagt „bayerisch“, nicht „bayernisch“.** Eine mechanische Ableitung aus dem Eigennamen
(Namensteile plus „-isch“, wie beim NSH-Adapter) träfe die Quellform gar nicht. Es gibt deshalb eine
**ausdrückliche Zuordnung** `bayerisch…` → Zielform, in allen Flexionen und beiden Schreibungen
(`SOURCE_ADJECTIVE` und `SOURCE_ADJECTIVE_PATTERN` in `rules.ts`).

Welche Zielform gilt, ist eine redaktionelle Entscheidung. **Festgelegt ist:**

| | |
| --- | --- |
| Quellform | `bayerisch` |
| **Gewählt** | **`bayern-württembergisch`** (großgeschrieben `Bayern-Württembergisch`) |
| Verworfen | `bayerisch-württembergisch` |
| Ort der Festlegung | `targetAdjective()` in `transform/rules.ts`, maschinenlesbar über `adjectiveDecision()` |

Begründung – ein sprachlicher und ein struktureller Grund:

1. **Sprachlich** ist das die durchgehende Bildung zusammengesetzter Ländernamen im Deutschen:
   „baden-württembergisch“, „nordrhein-westfälisch“, „sachsen-anhaltisch“,
   „schleswig-holsteinisch“. Der vordere Bestandteil erscheint als Toponym-Stamm, nicht in seiner
   eigenen Adjektivform. „Baden-Württemberg“ ist der nächstliegende Fall überhaupt und entscheidet
   ihn: Baden heißt für sich „badisch“, das zusammengesetzte Adjektiv lautet trotzdem
   „baden-württembergisch“, nicht „badisch-württembergisch“.
2. **Strukturell** enthält die gewählte Form die Quellform „bayerisch“ nicht mehr. Die Adjektivregel
   ist damit aus demselben Grund idempotent wie die Namensregel – und ohne eigenen Lookahead. Die
   verworfene Alternative trüge die Quellform in sich, verlangte einen zweiten Schutz und wäre
   zudem nach der Nachprüfung eine dauerhaft verbleibende Quellbezeichnung.

Die Groß-/Kleinschreibung wird aus der einen Schreibungsangabe der Quellform übernommen und auf
beide Namensteile angewandt: „Bayerischer Landtag“ → „Bayern-Württembergischer Landtag“, „bayerische
Gemeinden“ → „bayern-württembergische Gemeinden“. Eine Änderung der Festlegung beträfe jede
Fundstelle des Adjektivs, erforderte eine neue Transformerversion und muss die Idempotenz für die
neue Form eigens sicherstellen.

## Grundsatzentscheidung: Abkürzungen mit „Bay“

Praktisch jede bayerische Abkürzung beginnt mit dem Landeszusatz „Bay“: BayVerf, BayBO, BayHO,
BayRS, BayVwVfG, BayEUG, BayBG, BayMBl. Ob dieser Zusatz übergeleitet wird, ist keine sprachliche,
sondern eine **Grundsatzentscheidung mit Folgen für den gesamten Bestand und für jede Verweisung**:
Sie beträfe amtliche Kurzbezeichnungen, die in Zitaten, Verweisen, Registern, Slugs und in jeder
anderen Norm wieder auftauchen, und sie ließe sich nicht normweise treffen.

**Entschieden ist konservativ: Version 1.0.0 ersetzt keine Abkürzung.** Es gibt keine
Abkürzungsregel im Regelwerk. Jede erkannte Abkürzung mit „Bay“ bleibt byteidentisch und erscheint
als Erkennung der Kategorie `official-abbreviation` mit Entscheidung `manual-review` im Report
(`report.unresolved`). Begründung:

* Eine Abkürzung ist ein amtlicher Name, kein beschreibender Landesbezug. „BayBO“ ohne beschlossene
  Nachfolgeabkürzung zu ersetzen hieße, eine Abkürzung zu erfinden.
* Eine mechanische Ersetzung „Bay“ → „BayWü“ verwandelte auch Verweise in andere Rechtsbestände und
  Fundstellenkürzel (BayRS, BayMBl.) – letztere sind Provenienz und dürfen nie verändert werden.
* Im Zweifel wird nicht ersetzt, sondern gemeldet. Das ist nicht blockierend, bleibt messbar und
  kann nachträglich in einer neuen Transformerversion beschlossen werden; die Option ist in
  `TransformationOptions.knownStateLawAbbreviations` vorgesehen und in 1.0.0 wirkungslos.

Ein Sonderfall ist die Kurzform des **Ziellandes**: „BayWü“ beginnt selbst mit „Bay“ und ist im
Erkennungsmuster ausdrücklich ausgenommen – sonst meldete jede Simulationsfundstelle sich selbst als
Quellabkürzung.

Folge für den Slug: Der Präfix bayerischer Abkürzungen bleibt stehen (`BayBO` → `baybo-baywue`). Die
Jurisdiktionskonvention verbietet den realen Landes**zusatz am Ende** (`-bay`, `-by`, `-bayern`),
nicht den Abkürzungspräfix; die Prüfung dafür steht in der Zustandsschicht
(`common/slug-registry.ts`, `jurisdictionSlugCandidate`, `assertJurisdictionSlug`) und wird von der
Transformation benutzt, nicht nachgebaut.

## Was nie transformiert wird

Diese Regel ist hart und wird getestet.

* **Quellenreferenzen und Quellmetadaten**: `meta.sourceReferences`, `meta.sourceCitation`,
  `meta.originEnactingBody`, `meta.externalIdentifiers` (mit der BayRS-Nummer),
  `version.sourceReferences`, `version.sourceNotes`, `version.sourceValidFrom`/`sourceValidTo`,
  `version.sourceCitation`, `version.changeNote`, `history.entries[0].note`. Sie stehen im Report
  unter `protectedFields`.
* **Fundstellen und Verkündungsblattnamen**, auch im Normtext: „GVBl. S. 371“, „GVBl S. 702“
  (auch ohne Punkt), „GVBl. 2007 S. 15“, „BayMBl. Nr. 215“, „AllMBl.“, „FMBl. S. 259“, „StAnz.“,
  „Bayerisches Gesetz- und Verordnungsblatt“, „Bayerischer Staatsanzeiger“, Bundesfundstellen
  („BGBl. I S. …“).

  **In allen Flexionsformen**, nicht nur im Nominativ. Im Normtext steht ein Blattname fast immer
  gebeugt – „bekannt gemacht im Bayerisch**en** Ministerialblatt“, „veröffentlicht im Bayerisch**en**
  Gesetz- und Verordnungsblatt“. Ein Schutzmuster, das nur „Bayerisches Ministerialblatt“ trifft,
  lässt genau die Form durch, die tatsächlich vorkommt. Das Ergebnis wäre „im Bayern-Württembergischen
  Ministerialblatt“: sprachlich einwandfrei, sachlich die Behauptung, eine bayerische Vorschrift sei
  im Verkündungsblatt der Simulation erschienen. Ein Provenienzfehler, den hinterher niemand mehr als
  solchen erkennt – die Nachprüfung findet ihn nicht, weil die Quellbezeichnung ja verschwunden ist.
  Im 28-Normen-Korpus tritt der Fall zweimal auf; das Korpus ist 1,2 % des Bestands.
* **BayRS-Nummern und -Bände**: „BayRS 2170-1-1-I“, „BayRS 97-1-B“, „BayRS III S. 690“ sowie der
  Name der Sammlung selbst („Bayerische Rechtssammlung“) – auch dann, wenn er das Quelladjektiv
  trägt.
* **Fußnoten** (`type: footnote`) als Quellhinweise – sie werden gar nicht erst als Textfeld erfasst.
* **Adressen, Prüfsummen, Dateinamen** der archivierten Rohquellen.
* **Amtliche Abkürzungen mit „Bay“** (siehe oben).
* **Landschafts- und Ortsnamen mit dem Quelladjektiv**: „Bayerischer Wald“ (die Landschaft, nicht das
  Land), „Bayerisches Meer“ (Chiemsee), „Bayerische Alpen“, „Bayerisch Eisenstein“. Sie stehen als
  Schutzmuster `landscape-proper-name` und bleiben byteidentisch.
* **Herrschernamen** (Nutzerentscheidung 2026-09-18, Transformer 1.1.0): „Seiner Majestät des Königs Ludwig
  von Bayern“, „König Ludwig III. und Königin Marie Therese von Bayern“, „Kurfürstin von Bayern“, „Herzog Max
  in Bayern“, „König von Bayern“ – Titel, Vorname(n), Ordnungszahl und „von/in Bayern“ sind ein Personenname.
  Schutzmuster `ruler-name`.
* **Historische Staaten, Organe und Vertragsnamen** (Nutzerentscheidung 2026-09-18, Transformer 1.2.0): Die
  Zusammenlegung heutiger Länder verändert keine historischen Staaten. „Königreich Bayern“ in allen Formen (auch
  „den Königreichen Bayern und Württemberg“, „Regierungs-Blatt für das Königreich Bayern“), „Krone Bayern“,
  „Kurfürstentum“ und „Herzogtum Bayern“ (`historical-state`), Organe des Königreichs („Königl. Bayer.
  Staatsregierung“, „Königlich Bayerisches Staatsministerium“; `historical-organ`) und Namen historischer Verträge
  mit der Vertragspartei in ihrer damaligen Bezeichnung („Konkordat zwischen Seiner Heiligkeit Papst Pius XI. und
  dem Staate Bayern“; `historical-treaty-name`) bleiben unverändert. Fortgeltende heutige Selbstbezüge werden
  weiter übergeleitet („Zuständigkeiten des Staates Bayern“ in der geltenden Verfassung, „Freistaat Bayern“ als
  heutige Vertragspartei). Die frühere Überleitung „Königreich Bayern → Königreich Bayern-Württemberg“ war falsch
  und ist im Bestand bereinigt; der Prüfschritt `historical-name-transformed` (Fehler) verhindert ihre Rückkehr.
  **„Bayerisches Konkordat“** ist der Eigenname des Vertrags von 1924 und bleibt in allen Kasus unverändert
  (Nutzerentscheidung Run 5, Transformer 1.3.0, `historical-treaty-short-name`); die heutige Vertragspartei
  („Freistaat Bayern“ im Notenwechsel) wird weiter übergeleitet.
* **„Zentrum Digitalisierung.Bayern“** ist ein Eigenname und bleibt erhalten (`institution-proper-name`). Für diese
  Institution ist kein Simulations-Mapping definiert; ein Name wie „Zentrum Digitalisierung.Bayern-Württemberg“
  wird nicht gebildet. Beide Überleitungen sind als Fehler gesperrt (`historical-name-transformed`). Andere
  Markennamen mit Punkt und Landesbezeichnung bleiben nicht blockierende Prüffälle (`proper-name-uncertain`).
* **Wörter, die nur mit „Bay“ beginnen**: „Bayreuth“, „Bayreuther“, „Bayerwald“. Sie sind für keine
  Regel erreichbar und werden zusätzlich als `municipality` bzw. `geography` eingeordnet, damit sie
  nicht als unklare Restform erscheinen.
* **Normgeber-, Ministeriums- und Behördennamen der Quelle** als Bezeichnung. Innerhalb eines
  Institutionsnamens wird nur die Landesbezeichnung übergeleitet („Bayerisches Staatsministerium der
  Finanzen und für Heimat“ → „Bayern-Württembergisches Staatsministerium der Finanzen und für
  Heimat“); der Organ- oder Behördenbegriff selbst bleibt unangetastet und wird zur Prüfung
  gemeldet. Das historische Erlassorgan bleibt als `originEnactingBody` vollständig erhalten.
  **Erlassorgane (Run 5):** Für Bayern-Württemberg ist kein Simulationsressort definiert; eine Zuordnung auf ein
  Simulationsorgan gibt es deshalb nur für die drei Verfassungsorgane. Staatsministerien, die am Stichtag unter
  ihrem Namen nicht mehr bestanden, sind belegt historisch: Die Geschäftsverteilungsverordnung (StRGVV § 2,
  Fassung seit 2023-11-08) nennt abschließend die Staatskanzlei und zwölf Staatsministerien. 27 solche
  Bezeichnungen sind in `institution-mapping.json` `historical-source-only` (Befund `enacting-body-historical`,
  Information); die am Stichtag bestehenden Ressorts und Mehrfachformeln bleiben Prüffall
  (`enacting-body-mapping-required`, `data/audits/bayernrecht/INSTITUTIONS.md`).

**Titel einer in Bezug genommenen Norm** sind dagegen Normtext und werden übergeleitet, die
Fundstelle daneben nicht: „des Bayerischen Beamtengesetzes (BayBG) … (GVBl S. 702, BayRS
2030-1-1-F)“ → „des Bayern-Württembergischen Beamtengesetzes (BayBG) … (GVBl S. 702, BayRS
2030-1-1-F)“.

## Institutionen

`data/imports/bayernrecht/institution-mapping.json` folgt dem Schema der NRW- und der NSH-Datei
(Status `preserve`, `safe-transform`, `map`, `review`, `historical-source-only`; `defaults` je
Erkennungskategorie). Die Statusliste steht **nicht** in der Zuordnung, sondern in der
Zustandsschicht (`common/overrides.ts`, `INSTITUTION_STATUSES`): Die Overrides prüfen redaktionelle
Einzelentscheidungen (`institutionMapping`) gegen dieselbe Liste; zwei getrennte Listen könnten
auseinanderlaufen.

Eingetragen sind **ausschließlich Verfassungsorgane**, deren Entsprechung unstrittig ist:

| Eintrag | Kategorie | Status | Ziel |
| --- | --- | --- | --- |
| `landtag` | `legislature` | `safe-transform` | „Bayern-Württembergischer Landtag“ |
| `staatsregierung` | `institution` | `safe-transform` | „Bayern-Württembergische Staatsregierung“ |
| `ministerpraesident` | `institution` | `safe-transform` | „Ministerpräsident des Freistaates Bayern-Württemberg“ |

Die **Staatsministerien**, der **Bayerische Verfassungsgerichtshof**, der **Bayerische Oberste
Rechnungshof**, die Staatskanzlei, Behörden, Körperschaften (Bayerischer Rundfunk, Bayerische
Landesbank, Kammern), kommunale Landesverbände (Gemeindetag, Städtetag, Landkreistag, Bezirketag),
Kommunen und geographische Bezeichnungen haben **keinen** Eintrag: ihr Zuschnitt im Freistaat
Bayern-Württemberg ist nicht festgelegt. Sie laufen über die `defaults` der Kategorie in den Status
`review`. Das ist nicht blockierend (`imported-with-warnings`), bleibt über `report.unresolved`
messbar – und über die Review-Queue des Adapters, sobald der Bulk-Lauf sie speist (vorgesehene
Kategorie `institution-mapping`, `common/review.ts`) –, lässt den Normtext bis auf die
Landesbezeichnung unverändert und erhält das Quellorgan. **Es werden keine Behörden erfunden.**

Die Registerprüfung weist ein `target` zurück, das die Bezeichnung des Herkunftslandes
untransformiert enthält – mit demselben Lookahead wie die Regeln, damit der Zielname selbst
(„Bayern-Württembergischer Landtag“) zulässig bleibt, „Landtag von Bayern“ und „Bayerischer Landtag“
dagegen nicht.

## Erlassorgan

Die Quelle führt kein maschinenlesbares Feld für das erlassende Organ. Ein Organ wird deshalb nur
aus einer ausdrücklichen Formel im Vorspann oder Erlasskopf übernommen, nie aus dem Normtyp
abgeleitet:

| Formel | Muster (Belege aus dem Beispielkorpus) |
| --- | --- |
| `legislative-resolution` | „Der Bayerische Landtag hat das folgende Gesetz beschlossen“, „Der Landtag des Freistaates Bayern hat …“ (BayRadG) |
| `ordinance-formula` | „… erlässt das Bayerische Staatsministerium der Finanzen folgende Verordnung:“ (BayBhV), „… das als Anlage beigefügte Kostenverzeichnis“ (BayKVzKG), „Die Bayerische Staatsregierung erlässt …“ |
| `decree-head` | „Bekanntmachung des Bayerischen Staatsministeriums der Finanzen“ (VV-BayHO) |

Gesucht wird im Vorspann des Normkörpers (alles vor der ersten Gliederungseinheit) und in
mitgegebenen Kopfzeilen. **Bayerische Titelangaben stehen mehrzeilig in einem Block** (`<br/>`-getrennt:
Gliederungsnummer, Titel, Kurzbezeichnung, Erlasskopf, Datum, Fundstelle). Die Formeln werden deshalb
zusätzlich Zeile für Zeile geprüft – ein am Zeilenanfang verankerter Erlasskopf träfe sonst nie, weil
vor ihm noch die Gliederungsnummer stünde.

Der **Ressortzuschnitt** darf ein Komma enthalten, wenn die Aufzählung fortgesetzt wird
(„Staatsministerium des Innern, für Sport und Integration“); ein Komma, das einen neuen Satzteil
beginnt („…, im Einvernehmen mit …“), beendet das Organ.

Unpersönliche Formeln („Auf Grund des Art. 5 wird verordnet:“) benennen kein Organ; Unterschriften
belegen die Ausfertigung, nicht den Erlass. Fehlt die Formel oder widersprechen sich Formeln, bleibt
das Organ leer (`not-available` bzw. Befund `organ-formula-conflict`). Übergeleitet wird ein Organ
nur bei einem Verfassungsorgan (dann nur die Landesbezeichnung) oder bei einem `map`-Eintrag der
Zuordnung; sonst bleibt `enactingBody` leer, `originEnactingBody` erhalten, und es entsteht der nicht
blockierende Befund `enacting-body-mapping-required`.

## Reportformat

Ein Report je Norm (`TransformationReport`, Schema `bayernrecht-transformation-report/1`):

* `detections`: **jede** Erkennung mit `id`, `path`, `start`/`end` (Position im Quelltext), `term`,
  `context` (±60 Zeichen), `category`, `decision`, `detector`, `reason`, bei sicherer Ersetzung
  zusätzlich `transformRule` und `replacement`, bei Institutionen `mapping`.
* `decisions`: Kategorie → Entscheidung → Anzahl.
* `changes`: jede angewandte Ersetzung mit `path`, `rule`, `from`, `to`.
* `unresolved`: Kurzliste aller Erkennungen mit `manual-review` (`manualDecisionRequired: true`).
* `editorialDecisions`: die redaktionellen Festlegungen maschinenlesbar – derzeit die
  Adjektivbildung mit gewählter Form, verworfener Alternative und Begründung.
* `organs`: Quellformel, Kandidaten, Konflikt, Simulationsorgan, Entscheidung, Begründung.
* `citations`: reale Fundstelle, reales Vollzitat, Simulationsfundstelle.
* `protectedFields`: Felder, die bewusst unverändert blieben.
* `rules`, `transformerVersion`, `sourceArea`, `sourceIdentity`, `slug`, `baselineDate`.
* `postTransformAudit`: siehe unten.

Entscheidungen: `protected` (byteidentisch), `safe-auto-transform` (benannte Regel),
`manual-review` (Text unverändert, Entscheidung offen), `informational` (Hinweis ohne
Handlungsbedarf). Kategorien: `jurisdiction-name`, `official-abbreviation`, `legislature`,
`ministry`, `authority`, `public-body`, `regional-body`, `municipality`, `geography`, `institution`,
`source-citation`, `external-name`, `other`.

## Prüfung nach der Transformation (fail-closed)

`auditTransformation` prüft den **transformierten** Text erneut und ist nur dann `ok`, wenn alle vier
Prüfungen leer ausgehen:

| Prüfung | Bedeutung |
| --- | --- |
| `residuals` | Jedes verbliebene Vorkommen des Quelllandes muss `protected` (Schutzmuster) oder `documented` (belegt durch eine Erkennung mit dokumentierter Entscheidung) sein. Ein `unexplained`-Fund ist ein Fehler. |
| `doubledNames` | Doppelbildung aus Quell- und Zielnamen („Bayern-Württemberg-Württemberg“, „bayern-württembergisch-württembergisch“, „Bayern-Bayern“). **Jeder Fund ist ein Fehler** – die Bayern-spezifische Zusatzsicherung, schreibungsunabhängig geprüft. |
| `unappliedTransforms` | Je Pfad und Regel müssen erwartete und angewandte Ersetzungen übereinstimmen. |
| `unrecordedChanges` | Kein Feld darf sich ohne Protokolleintrag verändert haben. |

Die Restpostensuche (`SOURCE_STATE_REFERENCE`) erkennt „Bayern…“ (mit dem Idempotenz-Lookahead),
„BAYERN…“, „bayerisch…“/„Bayerisch…“, „BAYERISCH…“ und Abkürzungen mit „Bay“ (ohne die Zielkurzform
„BayWü“). Scheitert die Nachprüfung, entsteht der Befund `post-transform-audit` mit
`severity: error`.

## Restpostenprüfung auf der fertigen Norm

`auditRecord` (angeschlossen an `createTransformer().audit()`) sieht nur das Ergebnis und
unterscheidet deshalb drei Klassen:

| Fund | Schwere | Code |
| --- | --- | --- |
| Quellnennung innerhalb eines Schutzmusters (Fundstelle, BayRS, Landschaftsname) | `info`, gebündelt mit Anzahl | `protected-source-state-reference` |
| Ausgeschriebene Landesbezeichnung außerhalb eines Schutzmusters | `error`, je Vorkommen | `residual-source-state-reference` |
| Abkürzung mit „Bay“ außerhalb eines Schutzmusters | `warning`, **gebündelt** mit Anzahl und Beispielen | `undecidable-source-state-abbreviation` |
| Doppelbildung aus Quell- und Zielnamen | `error`, je Vorkommen | `doubled-target-name` |

Die Bündelung der Abkürzungswarnung ist bewusst: Praktisch jede bayerische Abkürzung beginnt mit
„Bay“, eine Meldung je Vorkommen machte den Bericht unlesbar (die Bayerische Beihilfeverordnung
allein trägt 49). Welche Abkürzung wozu gehört, steht im Transformationsbericht
(`report.unresolved`), nicht in der fertigen Norm.

## Offene Fragen

1. **Abkürzungen.** Die Grundsatzentscheidung ist konservativ getroffen (nicht ersetzen, melden).
   Ob der Landeszusatz „Bay“ in amtlichen Kurzbezeichnungen jemals übergeleitet wird, und wenn ja
   nach welchem Muster („BayWü…“, Wegfall, Neuvergabe), ist offen. Eine Änderung beträfe jede
   Verweisung im gesamten Bestand und erforderte eine neue Transformerversion.
2. **Adjektivform.** Festgelegt ist „bayern-württembergisch“. Redaktionell denkbar wäre
   „bayerisch-württembergisch“; das verlangte einen eigenen Idempotenzschutz und wäre nach der
   Nachprüfung eine verbleibende Quellbezeichnung.
3. **Ressortzuschnitt.** Ohne festgelegte Staatsministerien im Freistaat Bayern-Württemberg bleibt
   jedes Ressort im Review; Normen mit Ressort-Erlassformel erhalten kein Simulationsorgan.
4. **Verfassungsgerichtshof und Oberster Rechnungshof.** Beide erhalten durch die Adjektivregel die
   übergeleitete Landesbezeichnung; ob die Gerichts- und Rechnungsprüfungsorganisation so übernommen
   wird, ist eine offene redaktionelle Entscheidung (`court-state`, `authority-named`,
   `manual-review`).
5. **Kommunen und Geographie.** Ortsnamen, Regierungsbezirke, Gewässer und Landschaften bleiben
   unverändert und erzeugen Review-Einträge. Ob die Simulation eigene Ortsnamen führt, ist nicht
   entschieden. Mehrdeutige Flussnamen („Main“, „Inn“, „Regen“, „Naab“) sind bewusst **nicht** in der
   Erkennung: Ein Falschbefund in der Review-Queue ist teurer als ein fehlender Hinweis auf einen
   Fluss, der ohnehin nie transformiert wird.
6. **Simulationsfundstelle.** Das Verkündungsblatt „GVBl. BayWü“ steht im Register bereit; die
   Vergabe von Ausgaben und Seitenzahlen für den Ausgangsbestand ist nicht Gegenstand dieser Schicht.
   Die Kurzform „BayWü“ ist im Abkürzungsmuster ausgenommen, damit sie sich nicht selbst meldet.
7. **Zusammengesetzte Ressortnamen.** Der Detektor bricht am ersten kleingeschriebenen Wort ab. Ein
   Ressortname, der ein kleingeschriebenes Wort enthält („… für die ländlichen Räume“), würde
   verkürzt gemeldet – der Normtext bliebe davon unberührt, nur der Review-Eintrag wäre kürzer.
8. **BayWü bleibt lokal.** Kein R2-Präfix, kein Remote-D1, kein Deploy; der Ausgangsbestand ist noch
   nicht übernommen (`docs/BAYERN_BULK_READINESS.md`).
