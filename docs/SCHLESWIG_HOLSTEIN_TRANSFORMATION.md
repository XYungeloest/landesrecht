# Rechtsüberleitung Schleswig-Holstein → Land Niedersachsen-Holstein

Regelwerk der Transformationsschicht des Importers `juris-sh`
(`packages/importers/juris-sh/src/transform/`). Sie überführt reales Recht des Landes
Schleswig-Holstein in Recht der Simulationsjurisdiktion `nsh` („Land Niedersachsen-Holstein“). Aufbau,
Reportformat, Institutionenpolitik und die Fail-closed-Regeln folgen dem erprobten Transformer
Nordrhein-Westfalen → Land Westdeutschland (`docs/RECHT_NRW_IMPORT.md`,
`docs/WEST_REFERENCE_BASELINE.md`); die sprachlichen Regeln sind eigenständig.

| Komponente | Wert |
| --- | --- |
| Quellland (Provenienz, nie transformiert) | Schleswig-Holstein (`SOURCE_STATE`) |
| Zieljurisdiktion | `nsh` – „Land Niedersachsen-Holstein“, Kurzform „NSH“, Verkündungsblatt „GVOBl. NSH“ |
| Transformerversion | `juris-sh-transformer/1.0.0` (`TRANSFORMER_VERSION` in `transform/rules.ts`) |
| Reportschema | `juris-sh-transformation-report/1` |
| Institutionen-Zuordnung | `data/imports/juris-sh/institution-mapping.json` (`juris-sh-institution-mapping/1`) |
| Tests | `tests/unit/juris-sh-transform.test.ts` |

Alle Zielbezeichnungen stammen ausschließlich aus dem Jurisdiktionsregister
(`packages/legal-core/src/config/jurisdictions.ts`); im Code steht kein Zielname als Literal.
`targetProperName()`, `targetShortName()`, `targetStateName()`, `targetGazette()` und
`targetAdjective()` leiten Eigenname, Kurzform, Vollbezeichnung, Verkündungsblatt und Adjektiv aus
dem Register ab.

## Ablauf

```
Erkennung (unveränderter Quelltext) → Entscheidung je Fund → Ersetzung nach benannter Regel
  → Prüfung nach der Transformation (fail-closed)
```

1. **Erlassorgan** nur aus ausdrücklicher Formel (`transform/organs.ts`).
2. **Erkennung** aller landesbezogenen Bezeichnungen auf dem *unveränderten* Quelltext
   (`transform/detection.ts`), Einordnung über die zentrale Institutionen-Zuordnung.
3. **Ersetzung** ausschließlich der Landesbezeichnung nach benannten Regeln (`transform/rules.ts`);
   Schutzmuster werden vorher längengleich maskiert und bleiben byteidentisch.
4. **Nachprüfung** (`auditTransformation`): Restvorkommen, Doppelbildungen, nicht angewandte Regeln,
   stille Änderungen.

## Regelwerk

Die zentrale Besonderheit gegenüber Nordrhein-Westfalen: **Quell- und Zielname teilen den
Bestandteil „Holstein“.** Deshalb ersetzt keine Regel ein Teilwort. Jede Regel trifft genau die
vollständige Landesbezeichnung und setzt an ihre Stelle die Zielbezeichnung aus dem Register.
„Schleswig“ allein (Stadt Schleswig, Kreis Schleswig-Flensburg) und „Holstein“ allein (Landschaft)
sind nie Gegenstand einer Regel. Daraus folgt beides zugleich:

* es kann keine Doppelung („…-Holstein-Holstein“, „…-Holsteinisch-Holstein“) entstehen, und
* die Anwendung ist idempotent, weil die Zielbezeichnung den Quellnamen nicht mehr enthält.

| Regel | Trifft | Ergebnis |
| --- | --- | --- |
| `jurisdiction-name-genitive` | „des Landes Schleswig-Holstein“ | „des Landes Niedersachsen-Holstein“ |
| `jurisdiction-name-dative` | „im/dem/vom/beim/zum/am Land Schleswig-Holstein“ | „… Land Niedersachsen-Holstein“ |
| `jurisdiction-name-full` | „Land Schleswig-Holstein“ | „Land Niedersachsen-Holstein“ |
| `jurisdiction-name-adjective` | „schleswig-holsteinisch“ in allen Flexionen (`-e`, `-em`, `-en`, `-er`, `-es`) und Schreibungen | „niedersachsen-holsteinisch…“ mit übernommener Groß-/Kleinschreibung je Namensteil |
| `jurisdiction-name-bare` | „Schleswig-Holstein“, Genitiv „Schleswig-Holsteins“, Komposita („Schleswig-Holstein-Tarif“) | „Niedersachsen-Holstein“, „Niedersachsen-Holsteins“, „Niedersachsen-Holstein-Tarif“ |
| `jurisdiction-name-upper` | Versalschreibung „SCHLESWIG-HOLSTEIN“ aus Überschriften und Titelblättern | „NIEDERSACHSEN-HOLSTEIN“ |
| `jurisdiction-abbreviation-dotted` | „Schl.-H.“ **nur** nach „Land“, „Landes“, „Lande“ | „NSH“ (Satzpunkt bleibt erhalten) |
| `jurisdiction-abbreviation` | „SH“ **nur** nach „Land“, „Landes“, „Lande“ | „NSH“ |

**Schreibvarianten.** Zwischen den Namensteilen werden Bindestrich, geschützter Bindestrich,
Gedankenstriche (U+2010–U+2015), Minuszeichen, Leerzeichen und Zeilenumbruch erkannt
(`NAME_SEPARATOR`). Die Ersetzung vereinheitlicht auf die kanonische Bindestrichform des
Ziellandes; eine Trennung über den Zeilenumbruch („Schleswig-\nHolstein“) wird dabei aufgelöst.
Jede solche Vereinheitlichung steht als Änderung mit `from`/`to` im Report.

**Versalschreibung.** Die übrigen Regeln sind bewusst schreibungsabhängig, weil sie die
Groß-/Kleinschreibung der Quelle tragen. Eine durchgängig in Versalien gesetzte Überschrift träfe
deshalb keine von ihnen. Das ist nicht gefährlich – die Nachprüfung meldet die verbliebene
Bezeichnung als Fehler, die Norm bliebe also stehen statt falsch zu werden –, aber es wäre ein
unnötiger Halt. `jurisdiction-name-upper` schließt die Lücke; die Doppelbildungsprüfung arbeitet
seitdem schreibungsunabhängig, denn „…-HOLSTEIN-HOLSTEIN“ ist in jeder Schreibung falsch.

**Adjektivbildung.** Das Zieladjektiv wird mechanisch aus dem Eigennamen gebildet – Namensteile plus
„isch“, wie „Sachsen-Anhalt“ → „sachsen-anhaltisch“. Aus „Niedersachsen-Holstein“ entsteht
„niedersachsen-holsteinisch“. Die Groß-/Kleinschreibung wird je Namensteil aus der Quellform
übernommen, sodass „Schleswig-Holsteinischer Landtag“ zu „Niedersachsen-Holsteinischer Landtag“
wird. Es wird kein umgelauteter Stamm erfunden („niedersächsisch-holsteinisch“ wäre eine
redaktionelle Entscheidung, keine mechanische Ableitung – siehe offene Fragen).

**Kürzel.** „Schl.-H.“ und „SH“ werden nur übergeleitet, wenn ihnen unmittelbar eine Staatsform
vorausgeht; dann bezeichnen sie eindeutig das Land. Alle übrigen Vorkommen bleiben unverändert und
werden gemeldet (`manual-review`). Im Zweifel wird nicht ersetzt.

## Was nie transformiert wird

Diese Regel ist hart und wird getestet.

* **Quellenreferenzen und Quellmetadaten**: `meta.sourceReferences`, `meta.sourceCitation`,
  `meta.originEnactingBody`, `meta.externalIdentifiers`, `version.sourceReferences`,
  `version.sourceNotes`, `version.sourceValidFrom`/`sourceValidTo`, `version.sourceCitation`,
  `history.entries[0].note`. Sie stehen im Report unter `protectedFields`.
* **Fundstellen und Verkündungsblattnamen** des Herkunftslandes, auch im Normtext:
  „GVOBl. Schl.-H. S. 123“, „Amtsbl. Schl.-H.“, „NBl. MBWK Schl.-H.“, „SchlHA“,
  „Gesetz- und Verordnungsblatt für Schleswig-Holstein“, „Amtsblatt für Schleswig-Holstein“,
  Bundesfundstellen („BGBl. I S. …“).
* **Fußnoten** (`type: footnote`) als Quellhinweise – sie werden gar nicht erst als Textfeld erfasst.
* **Adressen, Prüfsummen, Dateinamen** der archivierten Rohquellen.
* **Amtliche Kurzbezeichnungen mit Landeszusatz** („LVwG SH“, „LBO SH“). Sie bleiben byteidentisch
  und erscheinen als Erkennung der Kategorie `official-abbreviation` mit Entscheidung
  `manual-review`. Version 1.0.0 leitet Normabkürzungen grundsätzlich nicht über.
* **Normgeber-, Ministeriums- und Behördennamen der Quelle** als Bezeichnung. Innerhalb eines
  Institutionsnamens wird nur die Landesbezeichnung übergeleitet („Ärztekammer Schleswig-Holstein“ →
  „Ärztekammer Niedersachsen-Holstein“); der Organ- oder Behördenbegriff selbst bleibt unangetastet
  und wird zur Prüfung gemeldet. Das historische Erlassorgan bleibt als `originEnactingBody`
  vollständig erhalten.
* **Namensteile allein**: „Schleswig“ (Stadt, Kreis Schleswig-Flensburg) und „Holstein“
  (Landschaft) werden nie ersetzt; sie erscheinen als Erkennung (`municipality`, `geography`).

## Institutionen

`data/imports/juris-sh/institution-mapping.json` folgt dem Schema der NRW-Datei (Status `preserve`,
`safe-transform`, `map`, `review`, `historical-source-only`; `defaults` je Erkennungskategorie).

Eingetragen sind **ausschließlich Verfassungsorgane**, deren Entsprechung unstrittig ist:

| Eintrag | Kategorie | Status | Ziel |
| --- | --- | --- | --- |
| `landtag` | `legislature` | `safe-transform` | „Niedersachsen-Holsteinischer Landtag“ |
| `landesregierung` | `institution` | `safe-transform` | „Landesregierung des Landes Niedersachsen-Holstein“ |
| `ministerpraesident` | `institution` | `safe-transform` | „Ministerpräsident des Landes Niedersachsen-Holstein“ |

Konkrete Ministerien, Behörden, Körperschaften, kommunale Landesverbände, Kommunen und
geographische Bezeichnungen haben **keinen** Eintrag: ihr Zuschnitt im Land Niedersachsen-Holstein
ist nicht festgelegt. Sie laufen über die `defaults` der Kategorie in den Status `review`. Das ist
nicht blockierend (`imported-with-warnings`), bleibt über Report und Review-Queue messbar, lässt den
Normtext unverändert und erhält das Quellorgan. **Es werden keine Behörden erfunden.** Die
Registerprüfung weist ein `target` zurück, das die Bezeichnung des Herkunftslandes enthält.

## Erlassorgan

Die Quelle führt kein maschinenlesbares Feld für das erlassende Organ. Ein Organ wird deshalb nur
aus einer ausdrücklichen Formel im Vorspann oder Erlasskopf übernommen, nie aus dem Normtyp
abgeleitet:

| Formel | Muster |
| --- | --- |
| `legislative-resolution` | „Der Schleswig-Holsteinische Landtag hat das folgende Gesetz beschlossen“ |
| `ordinance-formula` | „… verordnet das Ministerium für …“, „Die Landesregierung verordnet:“ |
| `decree-head` | „Runderlass des Innenministeriums“, „Landesverordnung des Ministeriums für … über …“ |

Unpersönliche Formeln („Aufgrund des § 5 wird verordnet:“) benennen kein Organ; Unterschriften
belegen die Ausfertigung, nicht den Erlass. Fehlt die Formel oder widersprechen sich Formeln, bleibt
das Organ leer (`not-available` bzw. Befund `organ-formula-conflict`). Übergeleitet wird ein Organ
nur bei einem Verfassungsorgan (dann nur die Landesbezeichnung) oder bei einem `map`-Eintrag der
Zuordnung; sonst bleibt `enactingBody` leer, `originEnactingBody` erhalten und es entsteht der
nicht blockierende Befund `enacting-body-mapping-required`.

## Reportformat

Ein Report je Norm (`TransformationReport`, Schema `juris-sh-transformation-report/1`):

* `detections`: **jede** Erkennung mit `id`, `path`, `start`/`end` (Position im Quelltext), `term`,
  `context` (±60 Zeichen), `category`, `decision`, `detector`, `reason`, bei sicherer Ersetzung
  zusätzlich `transformRule` und `replacement`, bei Institutionen `mapping`.
* `decisions`: Kategorie → Entscheidung → Anzahl.
* `changes`: jede angewandte Ersetzung mit `path`, `rule`, `from`, `to`.
* `unresolved`: Kurzliste aller Erkennungen mit `manual-review` (`manualDecisionRequired: true`).
* `organs`: Quellformel, Kandidaten, Konflikt, Simulationsorgan, Entscheidung, Begründung.
* `citations`: reale Fundstelle, reales Vollzitat, Simulationsfundstelle.
* `protectedFields`: Felder, die bewusst unverändert blieben.
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
| `doubledNames` | Doppelbildung aus Quell- und Zielnamen („…-Holstein-Holstein“, „…-Holsteinisch-Holstein“). Jeder Fund ist ein Fehler – die SH-spezifische Zusatzsicherung. |
| `unappliedTransforms` | Je Pfad und Regel müssen erwartete und angewandte Ersetzungen übereinstimmen. |
| `unrecordedChanges` | Kein Feld darf sich ohne Protokolleintrag verändert haben. |

Die Restpostensuche erkennt „Schleswig…Holstein…“, „schleswig-holsteinisch…“, „Schl.-H.“ und
freistehendes „SH“. Bewusst **nicht** erkannt werden „Schleswig“ und „Holstein“ als Einzelnamen:
„Holstein“ ist Bestandteil der Zielbezeichnung, ein Einzeltreffer wäre nach jeder Überleitung ein
Falschbefund. Scheitert die Nachprüfung, entsteht der Befund `post-transform-audit` mit
`severity: error`.

## Offene Fragen

1. **Adjektivform.** Mechanisch gebildet wird „niedersachsen-holsteinisch“. Redaktionell denkbar
   wäre „niedersächsisch-holsteinisch“. Eine Änderung beträfe jede Fundstelle des Adjektivs und
   erforderte eine neue Transformerversion.
2. **Amtliche Kurzbezeichnungen.** „LVwG SH“ bleibt unverändert und geht in den Review. Ob der
   Landeszusatz in Normabkürzungen übergeleitet werden soll (NRW-Muster: nur für Abkürzungen aus der
   Enumeration, `knownStateLawAbbreviations`), ist offen. Die Option ist in
   `TransformationOptions` vorgesehen, aber in 1.0.0 wirkungslos.
3. **Kommunen und Geographie.** Ortsnamen, Kreise, Inseln und Gewässer bleiben unverändert und
   erzeugen Review-Einträge. Ob die Simulation eigene Ortsnamen führt, ist nicht entschieden.
4. **Ressortzuschnitt.** Ohne festgelegte Ministerien im Land Niedersachsen-Holstein bleibt jedes
   Ressort im Review; Normen mit Ressort-Erlassformel erhalten kein Simulationsorgan.
5. **Gerichtsorganisation.** „Schleswig-Holsteinisches Oberverwaltungsgericht“ erhält durch die
   Adjektivregel die übergeleitete Landesbezeichnung; ob die Gerichtsorganisation so übernommen
   wird, ist eine offene redaktionelle Entscheidung (`court-state`, `manual-review`).
6. **Simulationsfundstelle.** Das Verkündungsblatt „GVOBl. NSH“ steht im Register bereit; die
   Vergabe von Ausgaben und Seitenzahlen für den Ausgangsbestand ist nicht Gegenstand dieser
   Schicht.
7. **Zeilenumbruch in der Landesbezeichnung.** Eine über den Zeilenumbruch getrennte Bezeichnung
   wird zur kanonischen Bindestrichform vereinheitlicht; der Umbruch entfällt. Bei Quelltexten mit
   bedeutungstragendem Zeilenumbruch (Tabellen) wäre das zu überprüfen.
