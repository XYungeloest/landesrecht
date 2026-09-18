# Quellparser BAYERN.RECHT

Stand: 2026-09-18 (Parser `bayernrecht-parser/0.2.0`) · Code: `packages/importers/bayernrecht/src/parse/` · Tests:
`tests/unit/bayernrecht-parse.test.ts` · Fixtures: `tests/fixtures/bayernrecht/`

Spezifikation ist `docs/BAYERN_SOURCE_DISCOVERY.md`, insbesondere Abschnitt 2 (XML-Export),
Abschnitt 5 (Portal-IDs sind nicht XML-IDs) und Abschnitt 11.2 (zwölf Vorkehrungen für den Parser).
Dieses Dokument beschreibt, was der Parser daraus umsetzt, welche Annahmen er trifft, wo er
abbricht und was ungeklärt bleibt.

**Parserversion.** Jede Änderung, die die Ausgabe für übernommene Normen verändern kann, erhöht
`PARSER_VERSION` (`common/constants.ts`). 0.2.0: `figure`-Blöcke, Bildart in der Quellenreferenz,
Trennung eines Fußnotenzeichens von unmittelbar folgenden Ziffern. `bulk --resume` nimmt Einträge einer
älteren Parser- oder Transformerversion wieder auf; neu geschrieben wird der Inhalt aber nur, wenn sich der
Datensatz tatsächlich ändert – die Versionsnummer allein ändert nur die Provenienz im Manifest
(Regressionstest in `tests/unit/bayernrecht-bulk.test.ts`).

**Der Parser liefert echtes bayerisches Recht** (`SourceLaw` nach
`packages/importers/common/src/pipeline.ts`). Die Überleitung nach Bayern-Württemberg ist eine
eigene Stufe und nicht Gegenstand dieses Strangs.

---

## 1. Aufbau

| Datei | Aufgabe |
| --- | --- |
| `parse/xml.ts` | Fail-closed-XML-Leser ohne DTD-Auflösung und ohne externe Entitäten |
| `parse/package.ts` | Exportpaket (`/Content/Zip/<Kurz>`): ZIP, `mimetype`, `META-INF/manifest.xml`, Beilagen |
| `parse/flow.ts` | Gemeinsames Fließtext- und Tabellenmodell beider DTDs |
| `parse/norm.ts` | Frontend `byrecht-norm` (Gesetze, Rechtsverordnungen, Verfassung) |
| `parse/vv.ts` | Frontend `byrecht-vv` (Verwaltungsvorschriften) |
| `parse/addresses.ts` | Portal-Permalinks aus dem beim Parsen gezählten Positionspfad |
| `parse/index.ts` | Erkennung, Verteilung auf die Frontends, `SourceLaw`, Fingerabdruck |

Einstiegspunkte:

```ts
parseBayernRechtDocument(source, xmlText, options?)   // ein Exportdokument
parseBayernRechtPackage(source, zipBytes, options?)   // vollständiges Paket samt Beilagen
createBayernRechtParser(options?)                     // SourceParser nach dem Pipelinevertrag
```

`options.unknown` ist `'throw'` (Vorgabe, fail-closed) oder `'report'` (Review-Fall statt Abbruch).

Das Ergebnis (`BayernRechtDocument`) trägt neben dem `SourceLaw` die Angaben, die im `SourceLaw`
nichts zu suchen haben: `buildDate`, `addresses`, `unresolvedAddresses`, `attachments`, `citations`,
`sectionEffectiveDates` und den `fingerprint`.

---

## 2. Was belegt abgedeckt ist

Grundlage ist das **Beispielkorpus des Enumerationsstrangs: 28 Exportpakete**
(`sources/bayernrecht/`, Übersicht in `data/imports/bayernrecht/corpus.json`), dazu die vier zuerst
untersuchten Exporte. Alle 28 Pakete werden im Vorgabemodus (`unknown: 'throw'`) ohne Abbruch
geparst, keines erzeugt einen Befund der Stufe `error`, und jeder Normkörper besteht die
Blockprüfung `parseBodyBlocks` aus `legal-core` einschließlich der Tabellenrasterprüfung.

Verteilung im Korpus: 23 Pakete der DTD `byrecht-norm`, 5 der DTD `byrecht-vv`; Normtypen
`gesetz` (10), `verordnung` (8), `vertrag` (3), `vwv` (1), `tarifvertrag` (1) sowie die Verfassung;
13 Pakete mit Tabellen, 10 mit strukturierten Anlagen, 19 mit Fußnoten, 9 mit aufgehobenen
Vorschriften, 8 mit PDF-Beilagen, 7 mit Bildbeilagen.

Die vier Ausgangsinstanzen und die Fälle, für die sie stehen:

| Export | Typ | Größe XML | Besonderheiten |
| --- | --- | --- | --- |
| `BayAbmG` | Gesetz | 57 KB | Inhaltsübersicht, 8 Gliederungen, Satznummern, Listen, Fußnoten |
| `BayVerf` | Verfassung | 157 KB | geschachtelte Gliederung, Präambel ohne `para.nr`, 9 aufgehobene Artikel, leere Pflichtfelder |
| `BayKVzKG` | Rechtsverordnung | 3,2 MB | 39 Tabellen (4 172 Zeilen, 15 623 Zellen), Anlage, 21 PDF-Beilagen |
| `BayVwV312180` | Verwaltungsvorschrift | 44 KB | zweite DTD, `gliederung[@ebene]`, `<sup>`-Satzzählung, `@inkraft`, 2 PDF-Beilagen |

Der Durchlauf des vollständigen Korpus hat elf weitere Strukturen sichtbar gemacht, die in diesen
vier nicht vorkommen. Genau dafür ist das Fail-closed da – nichts davon ist still falsch geworden:

| Struktur | Belegt an | Behandlung |
| --- | --- | --- |
| `einleitungssatz` / `einleitungssatz.text` | BayAGGlueStV, BayBhV, BayBauPAV, VVBayHO u. a. | Eingangsformel; Fließtext an ihrer Stelle im Rumpf |
| `annex.text` | BayBhV, BayGUW_GebO, BAY_791_3_150_U, MStV, BayVSO | Fließtext, Tabellen und Listen unmittelbar in der Anlage |
| `annex.koerper > gliederung` | BayBhV, TV_L | voller Gliederungsbaum in der Anlage |
| `gliederung.nr` (Norm-DTD) | BayBhV | ausdrückliches Gliederungszeichen („I.“) |
| `Aenderungsinhalt` | BayRadG, TV_L, VVBayHO | zitierter Normtext → `quotedProvision`, siehe Abschnitt 4.1 |
| `graphic` | BayBauPAV, BayBoFiV, BayVwV267724, VVBayHO | Abbildung; Datei als Beilage, kein Block, Befund |
| `a[@href]` | BAY_791_3_150_U, BayVV_2132_3_B_15282, VVBayHO u. a. | Verweis auf eine Paketdatei; Text bleibt, Ziel wird festgehalten |
| `sonstigeFundstelle` | VVBayHO | Fundstelle in einem anderen Blatt (`FMBl. 1973 S. 259`) |
| `hr` | BayVV_2132_3_B_15282, BayVV_631_B_15643, BayVV_631_J_10511 | typografische Trennlinie ohne Text |
| `verweis.norm@anfrage` | TV_L (`baybs`), BayBhV (leer) | zugelassen, nicht gedeutet |
| `image/jpg` im Manifest | 7 Pakete | Bildbeilage; Abweichung zur Dateiendung wird gemeldet |

### 2.1 Elementvorrat

Der Parser kennt genau den Vorrat, der im Korpus vorkommt, plus die trivial dazugehörigen
Paarelemente (`tfoot`, `sub`). Alles andere ist „unbekannt“ im Sinn von Abschnitt 6.

`byrecht-norm`: `byrecht-norm` · `kopf` · `angaben.versunabh` · `angaben.versabh` · `dokumentation` ·
`ausfertigung` · `ausfertigungsdatum` · `fundstelle.GVBl` · `sonstigeFundstelle` · `publikation` ·
`jahr` · `seite` · `inkraft` · `fassung` · `fassungsdatum` · `gliederungsNr.BayRS` ·
`kurzbezeichnung` · `titelangaben` · `amtlicheAbk` · `rumpf` · `aenderungsverlauf` · `normzitat` ·
`einleitungssatz` · `einleitungssatz.text` · `gliederung` · `gliederung.nr` · `gliederung.titel` ·
`gliederung.text` · `einzelnorm` · `para.nr` · `para.titel` · `jurAbsatz` · `absatz.nr` ·
`absatz.text` · `Aenderungsinhalt` · `annex` · `annex.koerper` · `annex.nummer` · `annex.titel` ·
`annex.text` · `satz.nr`

`byrecht-vv`: `byrecht-vv` · `verwaltungsdaten` · `metadaten` · `bayernrecht` ·
`bayernrecht_langtitel` · `_kurztitel` · `_abkuerzung` · `_dokumentklasse` · `_fundstellen` ·
`_fundstellen_organ` · `_fundstellen_jahrgang` · `_fundstellen_seite` · `_inkraft` · `textdaten` ·
`vv1.0` · `kopf` · `titel` · `rumpf` · `gliederung` · `gliederung.nr` · `gliederung.titel`

Gemeinsam (in beiden Frontends gleich behandelt): `p` · `br` · `hr` · `a` · `graphic` · `span` ·
`sup` · `sub` · `ul` · `li` · `symbol` · `table` · `colgroup` · `col` · `thead` · `tbody` · `tfoot` ·
`tr` · `td` · `th` · `verweis.norm` · `v.norm` · `v.abk` · `fn.call` · `fn.text` · `fn.def`

Normtypen (`dokumentation/@doktyp`), alle im Korpus belegt: `gesetz` · `verordnung` · `vertrag` ·
`vwv` · `tarifvertrag`, dazu `vv`, `satzung` und `vertr` (Facettenfilterwert des Portals). Alles
andere bricht ab.

Medienarten im Paketmanifest: `application/beck.bayportalnorm.text` ·
`application/beck.bayportalvv.text` · `application/pdf` · `image/jpg`. Alles andere bricht ab.

### 2.2 Abbildung auf das Blockmodell

| Quelle | Zielblock |
| --- | --- |
| `gliederung` (norm) | `book`/`part`/`chapter`/`section`/`subsection` nach dem Gliederungswort, sonst nach Schachtelungstiefe |
| `gliederung[@ebene]` (vv) | Tiefe 1 → `section`, Tiefe ≥ 2 → `subsection` |
| `einzelnorm` mit `Art. …` | `article` |
| `einzelnorm` mit `§ …` | `paragraph` |
| `einzelnorm` ohne `para.nr` | `preamble` (Präambel, Schlussformel, unnummerierte Anlagenteile) |
| `jurAbsatz` mit `absatz.nr` | `subparagraph` (erster Absatz als `text`, Rest als `children`) |
| `jurAbsatz` ohne `absatz.nr` | Inhalt unmittelbar an der Vorschrift (kein leeres Gliederungszeichen) |
| `p` | `paragraphText` |
| `ul`/`li`/`symbol` | `item` (Ebene 1) bzw. `subitem` (tiefer), `label` aus `symbol` |
| `table` | `table`/`tableRow`/`tableHeaderCell`/`tableCell` mit `columns`, `colspan`, `rowspan`, `scope` |
| `annex` | `annex`; `annex.text` als Fließtext darin |
| `Aenderungsinhalt` | `quotedProvision` (zitierter Normtext, siehe 4.1) |
| `einleitungssatz` | Fließtext an seiner Stelle im Rumpf |
| `graphic` | `figure` mit Asset-Referenz (SHA-256, Medienart, Maße, Pfad im Paket, `@Desc` als Alternativtext); ohne lesbare Bilddatei kein Block und Befund `graphic-not-transferred`, Logo/Zierbild laut `@Desc` Befund `graphic-decorative` |
| `a` | Text bleibt im Fließtext; das Ziel steht in `resourceLinks` |
| `hr` | Absatzumbruch, kein Block |
| `fn.call` | `footnote` als Kind des aufrufenden Blocks, Marke bleibt im Text; folgt unmittelbar eine Ziffer (zweiter Aufruf, `<sup>`), steht ein Leerzeichen dazwischen |
| `titelangaben` ab Zeile 2 | `heading` (Zeile 1 ist der Titel) |
| `aenderungsverlauf` | `SourceLaw.changeHistory` (Text, kein Normkörper) |
| `normzitat` / `<p typ="vollzitat">` | `SourceLaw.fullCitation` und `citation` |

---

## 3. Die zwölf Vorkehrungen aus Abschnitt 11.2

| # | Vorkehrung | Umsetzung |
| --- | --- | --- |
| 1 | Externe Entitäten und DTD-Auflösung abschalten | Eigener Leser (`xml.ts`). Das `<!DOCTYPE>` wird als Angabe gelesen (Name, Public-ID, System-ID) und **nie** abgerufen. Eine interne DTD-Teilmenge wird abgelehnt. Bekannt sind nur `&amp; &lt; &gt; &quot; &apos;` und numerische Zeichenreferenzen; jede andere Entität bricht mit Namensnennung ab. |
| 2 | BOM | `stripByteOrderMark` am Anfang jedes Leselaufs; der Paketleser lässt die BOM stehen, statt sie stillschweigend zu entfernen. |
| 3 | Leere Pflichtfelder tolerieren | `kurzbezeichnung`, `amtlicheAbk`, `annex.titel`, `para.nr`, `fn.text`, `jahr`, `seite` werden zu `undefined`, nie zu Leerstrings. Belegt an `BayVerf` und `BayKVzKG`. |
| 4 | `S=318` → `318` | `normalizeGazetteNumber` in beiden Frontends, zusätzlich `Nr=277` → `277` (das BayMBl. zählt Bekanntmachungen statt Seiten). Die Zählart steht als `pageKind` (`seite`/`nummer`) daneben, damit die Fundstelle richtig gesetzt wird. Ein Wert ohne bekanntes Präfix bleibt unverändert und wird gemeldet (`gazette-page-format`). |
| 5 | `gliederungsNr.BayRS` trimmen | Leerraum und abschließender Umbruch entfallen, das Präfix `BayRS ` wird abgetrennt: `BayRS 219-2-F\n` → `219-2-F`. |
| 6 | Satznummern sind Inline-Marker | `satz.nr` wird als Unicode-Hochzahl vor den Satz geschrieben (`¹Die Abmarkung …`), die Platzhalter-`id` (`xx`, `xxx`, `x`) werden verworfen. Kein Container, keine eigene Blockebene. |
| 7 | `(aufgehoben)` erhalten | Eine Vorschrift mit leerem `absatz.text` bleibt als Block mit Gliederungszeichen und Titel stehen (`children: []`) und wird als `repealed-provision` gemeldet. Belegt an Art. 34–42 BayVerf. |
| 8 | Fußnoten an der Aufrufstelle | `fn.call` liefert Marke (`fn.text`) in den Text und einen `footnote`-Block als Kind des aufrufenden Blocks. Kein Apparat am Dokumentende. |
| 9 | Doppeltes `annex.nummer` | Das Gliederungszeichen kommt aus der Variante mit `@int`. **`@int` ist keine Ordnungszahl**: über das ganze Korpus trägt es immer den Wert `1` – es kennzeichnet die maschinell brauchbare Kurzform („Anlage 1“) gegenüber der gedruckten Langform („Anlage 1 (zu § 7 Abs. 1)“). Die Langform steht als erste Überschriftszeile in der Anlage, damit der Bezug in die Norm nicht verloren geht. Fehlt die `@int`-Variante (TV_L), gilt die erste Schreibweise und es gibt `annex-number-flag-missing`; ein anderer Wert als `1` gibt `annex-number-flag-unknown`. |
| 10 | Tabellen nach dem Blockmodell | `class`-Werte (`r`, `b`, `rb`, `i`, `text-center`) sind rein typografisch und gehen nicht in die Struktur ein. Das Raster wird mit derselben Belegungsrechnung geprüft, die `legal-core` später anwendet (colspan **und** rowspan); `columns` ist die gerechnete Breite. |
| 11 | Permalinks nicht aus XML-IDs | Siehe Abschnitt 4. |
| 12 | PDF-Beilagen unverortet führen | Jede Beilage wird eine `SourceReference` mit `kind: 'primary-pdf'`, eigenem SHA-256, `derivedSource` = Paketpfad und dem ausdrücklichen Hinweis, dass eine Zuordnung zur Textstelle aus dem Export nicht herstellbar ist. Zusätzlich eine `sourceNote` „Unverortete Beilagen“. |

---

## 4. Permalinks: gezählt, nicht abgeleitet

Die Portal-IDs entstehen **beim Durchlaufen**, nicht aus `gliederungsid`/`einzelnormid`:

| Zweck | Muster | Beispiel |
| --- | --- | --- |
| Dokument | `<Kurz>` | `BayVerf` |
| Gliederung | `<Kurz>-G<i>[_<j>…]` | `BayVerf-G1_1` (XML: `G_2`) |
| Vorschrift | `<Kurz>-<para.nr ohne „Art. “/„§ “>` | `BayVerf-3a` |
| Nummernlose Vorschrift | `<Kurz>-NN<i>` | `BayVerf-NN1` (Präambel), `BayKVzKG-NN1` (Schlussformel) |
| Anlage | `<Kurz>-ANL_<i>` | `BayKVzKG-ANL_1` |

Jede Adresse trägt den `position`-Pfad, den `blockPath` in `SourceLaw.body` und – zur Gegenprobe –
die XML-ID, die eben nicht die Portal-ID ist. Der Test belegt das an `BayVerf`, wo die beiden
Abschnitte im XML `G_2` und `G_4` heißen und im Portal `BayVerf-G1_1` und `BayVerf-G1_2`.

**Für den Inhalt einer Anlage wird keine Adresse gebildet.** Belegt ist nur `-ANL_<i>` für die
Anlage als Ganzes. Wie das Portal Vorschriften und Gliederungen **innerhalb** einer Anlage
adressiert, sagt die Discovery nicht – und Anlagen können den vollen Gliederungsbaum
wiederverwenden (BayBhV, TV_L). Eine erfundene `-G<i>`-Adresse würde dort sogar mit der Zählung der
Gliederungen im Rumpf kollidieren. Diese Knoten stehen deshalb mit ihrem Positionspfad in
`unresolvedAddresses`.

### 4.1 Zitierter Normtext (`Aenderungsinhalt`)

`<Aenderungsinhalt>` trägt den **neuen Wortlaut, den ein Änderungsbefehl anordnet** – also den Text
einer *anderen* Vorschrift, zitiert innerhalb der zitierenden. Belegt an BayRadG (in einem
Listenpunkt: „Nach Satz 1 wird folgender Satz 2 eingefügt:“), an TV_L (74 Fundstellen) und an
VVBayHO. Das Attribut `@hochkomma` nennt das verwendete Anführungszeichen und ist reine Typografie.

Der eingebettete Baum ist ein vollständiger Vorschriftenbaum (`einzelnorm`, `para.nr`, `jurAbsatz`,
`absatz.text`). Würde er wie gewöhnlicher Normkörper gelesen, erschiene fremder Text als eigener:
Der zitierte `Art. 1 BayHO` würde in VVBayHO zu einem Artikel *dieser* Vorschrift – samt Permalink
`VVBayHO-1`, der auf etwas ganz anderes zeigt. Deshalb:

- eigener Blocktyp `quotedProvision` (den das Zielmodell für genau diesen Zweck kennt),
- **keine** Portaladresse und **keine** NN-Zählung für alles darin,
- ein Befund `quoted-provisions` mit der Anzahl.

Damit bleibt der zitierte Wortlaut vollständig erhalten und ist zugleich dauerhaft als Zitat
erkennbar.

**Für Verwaltungsvorschriften wird keine Gliederungsadresse gebildet.** Das Portal benutzt dort ein
rein numerisches Suffix (`BayVwV312180-0`, `-13`, `-19`, …), dessen Bildungsregel ungeklärt ist
(offener Punkt 5 der Discovery). Der Positionspfad wird trotzdem mitgezählt und in
`unresolvedAddresses` mit Begründung geführt; ein Permalink wird nicht geraten.

---

## 5. `@builddate` und alles andere Tagesaktuelle

`byrecht-norm/@builddate` ist der Konsolidierungszeitpunkt und ändert sich jede Nacht
(`17.09.2026_02:00`). Er wird als `BayernRechtDocument.buildDate` festgehalten und

- geht **nicht** in den `SourceLaw` ein (weder Feld, noch `sourceNote`, noch Fundstelle),
- geht **nicht** in den Fingerabdruck ein.

Aus demselben Grund bleiben zwei weitere Angaben aus dem Fingerabdruck heraus: die Abrufzeit
(`retrievedAt`) und der SHA-256 des Exportpakets – das Paket enthält das `builddate` und ändert
seinen Hash täglich mit. Der Fingerabdruck über `sourceLawFingerprint` bildet deshalb den
`SourceLaw` **ohne** `findings` und **ohne** `sourceReferences` ab, ergänzt um Pfad, Größe und
eigenen Hash der Beilagen; die sind stabil.

Der Test `@builddate bleibt aus jedem Gleichheitsvergleich heraus` parst denselben Export zweimal
mit unterschiedlichem `builddate`, unterschiedlicher Abrufzeit und unterschiedlichem Paket-Hash und
verlangt identischen Körper und identischen Fingerabdruck – und umgekehrt einen anderen
Fingerabdruck, sobald sich ein Zeichen des Normtexts ändert.

Die VV-DTD kennt `@builddate` nicht. Taucht er dort doch auf, gibt es den Befund
`vv-builddate-present`; ausgewertet wird er auch dann nicht.

---

## 6. Fail-closed: wo der Parser abbricht

### 6.1 Abbruch mit `ImportPipelineError` (`stage: parse-source-format`)

**XML-Ebene** – nicht wohlgeformt oder nicht ohne DTD lesbar:
kein Wurzelelement · falsch geschachtelte oder nicht geschlossene Elemente · Inhalt nach dem
Wurzelelement · doppeltes Attribut · unvollständige Entitätsreferenz · **Entität, die nur die externe
DTD definieren könnte** · interne DTD-Teilmenge · nicht beendeter Kommentar/CDATA/PI ·
Deklaration im Inhalt.

**Dokumentebene**: weder `<byrecht-norm>` noch `<byrecht-vv>` erkannt · `<!DOCTYPE>`-Name passt nicht
zum Wurzelelement · fehlender `kopf`/`rumpf`/`textdaten`/`vv1.0` · `<dokumentation>` ohne `@dokid`
oder ohne `@doktyp` · `<verwaltungsdaten>` ohne `@doknr` · kein Titel in `titelangaben`,
`kurzbezeichnung` bzw. `bayernrecht_langtitel`/`kopf/titel` · **unbekannter `@doktyp`** ·
`<annex>` ohne `<annex.koerper>`.

**Paketebene**: kein ZIP · Zip64 · beschädigtes Verzeichnis · unbekanntes Kompressionsverfahren ·
Größenabweichung · doppelter Paketeintrag · fehlendes `mimetype` oder `META-INF/manifest.xml` ·
Manifest mit unbekanntem Wurzelelement oder unbekanntem Kindelement · Manifesteintrag ohne
`full-path`/`media-type` · nicht genau ein Normdokument · **unbekannte Medienart** (zugelassen sind
nur die vier belegten Werte) · **Manifesteintrag ohne Datei im Paket** ·
**Paketeintrag ohne Manifesteintrag** · Normdokument nicht UTF-8.

**Unbekannte Struktur** (Vorgabe `unknown: 'throw'`): Jedes Element, das der Parser nicht kennt,
bricht den Lauf ab. Die Meldung nennt Elementnamen, Fundstelle im Dokument und Zeile.

### 6.2 Review statt Abbruch (`unknown: 'report'`)

Im Meldemodus bleibt der Textinhalt des unbekannten Elements als gewöhnlicher Fließtext erhalten
(`recoverUnknown`), und es entstehen zwei `error`-Befunde: `unknown-element` je Fundstelle und ein
zusammenfassender `unknown-structure`, der **alle** unbekannten Element- und Attributnamen
alphabetisch aufzählt. Daraus bildet der Bulk-Lauf einen Review-Fall der Kategorie
`unknown-structure`. Es gibt in keinem der beiden Modi ein stilles Weglassen.

### 6.3 Befundcodes

`error` (nur diese beiden; sie entstehen ausschließlich im Meldemodus):
`unknown-element` · `unknown-structure`

`warning`: `annex-label-missing` · `annex-number-flag-missing` · `annex-number-flag-unknown` ·
`date-format` · `division-without-heading` · `empty-provision` · `footnote-marker-missing` ·
`footnote-without-text` · `graphic-not-transferred` · `loose-list-text` ·
`norm-type-out-of-model` · `package-media-type-mismatch` · `quoted-provision-empty` ·
`referenced-file-missing` · `sentence-number-not-numeric` · `table-cell-overlap` ·
`table-colgroup-mismatch` · `table-ragged` · `table-span-invalid` · `title-possibly-truncated` ·
`unknown-attribute` · `unknown-attributes` · `vv-level-mismatch` · `vv-paragraph-type-unknown` ·
`vv-superscript-ambiguous`

`info`: `division-word-unmapped` · `figures-transferred` · `footnotes` · `gazette-page-format` · `graphic-decorative` ·
`gazette-reference-ambiguous` · `norm-type-assumed` · `norm-type-refined` ·
`provision-graphic-only` · `quoted-provisions` · `referenced-file-case-mismatch` ·
`repealed-provision` · `sentence-numbers` · `superscript-unmapped` · `tables` ·
`vv-bayrs-number-absent` · `vv-builddate-present` · `vv-depth-beyond-model` ·
`vv-section-address-unresolved` · `vv-section-effective-dates`

**Unbekannte Attribute sind nie ein Fehler.** Der Attributvorrat beider DTDs ist typografisch
(`class`, `style`, `valign`, `align`, `ausrichtung`, …); ein unbekanntes Attribut erscheint als
Warnung `unknown-attribute` je Fundstelle und als Sammelwarnung `unknown-attributes`, nie als
`unknown-structure`. Unbekannte **Elemente** dagegen brechen ab bzw. werden zum Fehlerbefund.

Wiederholte Beobachtungen werden zusammengefasst, damit ein Befund lesbar bleibt: Abbildungen,
Medienartabweichungen und tiefe VV-Gliederungen erscheinen einmal je Dokument mit Anzahl und
Beispielen (BayVwV267724 hätte sonst 146 gleichlautende Zeilen).

## 7. Annahmen

Alle Annahmen sind aus den 28 Instanzen des Beispielkorpus abgeleitet und nicht durch eine DTD
gedeckt – die DTD-Dateien wurden nicht abgerufen.

1. **Satznummern und Hochstellungen werden zu Unicode-Hochzahlen.** `¹²³…` im Text statt einer
   Inline-Auszeichnung, die das Blockmodell nicht kennt. Verlustfrei lesbar, aber eine Entscheidung:
   Wer die Satznummern maschinell wieder abtrennen will, muss sie am Zeichenvorrat erkennen.
2. **`<sup>` in Verwaltungsvorschriften** ist eine Satznummer, wenn der Inhalt eine reine Zahl ist
   **und** unmittelbar davor Textanfang, Leerraum oder ein satzschließendes Zeichen
   (`. ! ? ; : “ ” " )`) steht. Sonst gilt es als echte Hochstellung und wird als
   `vv-superscript-ambiguous` gemeldet. Beide Fälle sind in `BayVwV312180` belegt:
   `… nicht verwendet werden.⁵Änderungsvorschriften …` (Satznummer, ohne Leerzeichen hinter dem
   Punkt) gegenüber `„kg“, „m²“, „€“` (Hochstellung). Die Regel löst den offenen Punkt 7 der
   Discovery strukturell; sie ist nicht amtlich gedeckt.
3. **Gliederungsüberschriften werden an der Quellzeile getrennt.** `1. Teil ⏎ Allgemeine
   Vorschriften` wird zu `label` + `title`, aber nur, wenn die erste Zeile ein bekanntes
   Gliederungswort nennt (`Buch`, `Hauptteil`, `Teil`, `Kapitel`, `Abteilung`, `Abschnitt`,
   `Unterabschnitt`, `Untertitel`, `Titel`). Sonst bleibt der ganze Text Überschrift, damit eine
   über mehrere Quellzeilen umbrochene Überschrift nicht zerrissen wird; das wird als
   `division-word-unmapped` gemeldet.
4. **Blocktyp der Gliederung** folgt dem Gliederungswort, hilfsweise der Schachtelungstiefe
   (1 → `part`, 2 → `section`, ab 3 → `subsection`). Bei Verwaltungsvorschriften zählt die
   tatsächliche Schachtelung, nicht `@ebene`; weichen sie ab, gibt es `vv-level-mismatch`.
5. **Vorschriften ohne `para.nr` werden `preamble`.** Das Zielmodell hat keinen eigenen Blocktyp für
   „unnummerierte Vorschrift“, und `preamble` ist der einzige Container, der ohne Überschrift
   auskommt und zugleich eine Trefferadresse bildet. Betroffen sind die Präambel der Verfassung, die
   Schlussformel und die 39 überschriftenlosen Tabellenträger der Anlage zu `BayKVzKG`.
6. **`doktyp="gesetz"` mit einem Titel, der mit „Verfassung“ beginnt, wird `verfassung`.** Das
   Portal führt die Bayerische Verfassung als Gesetz; das Zielmodell kennt den eigenen Typ. Gemeldet
   als `norm-type-refined`.
7. **Eine Fußnote ohne Aufrufzeichen** (`<fn.text />`, belegt in BayVerf Art. 13) bekommt die
   mechanische Ersatzmarke `Fn <laufende Nummer>` – das Zielmodell verlangt ein Fußnotenzeichen. Die
   Marke erscheint **nicht** im Text, und der Fall wird als `footnote-marker-missing` gemeldet.
8. **Die Quellidentität ist die Portal-Dokument-ID** (`dokid`/`doknr`), nicht die BayRS-Nummer. Die
   BayRS-Nummer steht als zweiter `ExternalIdentifier` (`system: 'bayrs'`) und als
   `BayernRechtDocument.bayRsNumber` bereit; welche von beiden der Bestand als Identität führt,
   entscheidet der Enumerations- und Bulkstrang.
9. **`citation` ist das amtliche Vollzitat** (`normzitat` bzw. `<p typ="vollzitat">`). Fehlt es, wird
   ersatzweise aus Titel, Ausfertigungsdatum, Fundstelle und BayRS-Nummer eine Fundstelle gebildet –
   erkennbar als Konstruktion, weil `fullCitation` dann leer bleibt.
10. **`mediaType` der Hauptquelle ist `application/xml`.** Archiviert wird das ZIP, aber
    `application/zip` gehört nicht zum Vorrat von `legal-core`; die Referenz beschreibt das geparste
    Dokument.
11. **Unbekannte Attribute brechen nicht ab und sind nie ein Fehler.** Der
    `class`/`style`/`valign`/`ausrichtung`-Vorrat beider DTDs ist rein typografisch; ein unbekanntes
    Attribut wird als Warnung `unknown-attribute` je Fundstelle und als Sammelwarnung
    `unknown-attributes` gemeldet, nie als `unknown-structure`. Unbekannte Elemente dagegen brechen ab.
12. **Leere `<p/>` erzeugen keinen Block.** Sie kommen in Tabellenzellen und in
    `gliederung.titel` vor; die Zelle selbst bleibt mit leerem Text erhalten, damit das Raster stimmt.
13. **`<hr/>` ist eine typografische Trennlinie** ohne Textinhalt (belegt an `BayVV_631_J_10511`,
    als `<p><hr /></p>`). Sie wird zum Absatzumbruch und erzeugt keinen Block; es geht kein Text
    verloren.
14. **`doktyp="vertrag"` wird `staatsvertrag`**, außer der Titel beginnt mit „Verwaltungsabkommen“
    (dann `verwaltungsabkommen`). Nennt der Titel gar keine Vertragsart, bleibt es bei
    `staatsvertrag` und der Fall wird als `norm-type-assumed` gemeldet – die Facette „Verträge,
    sonstige Rechtsquellen“ umfasst mehr als Staatsverträge.
15. **Der Titel ist Zeile 1 der `titelangaben`.** Bei mehrzeilig gesetzten Titeln (Staatsverträge:
    „Staatsvertrag ⏎ zwischen dem Land Baden-Württemberg und dem Freistaat Bayern über …“) trägt
    Zeile 1 nur den Anfang. Die Folgezeilen sind nicht sicher von Fassungs-, Datums- und
    Fundstellenzeilen zu unterscheiden (`BayVerf`: „in der Fassung der Bekanntmachung vom …“ gehört
    **nicht** zum Titel), deshalb wird nichts zusammengefügt. Ist Zeile 1 höchstens drei Wörter lang
    und folgen weitere Zeilen, gibt es `title-possibly-truncated`; der vollständige Quelltext bleibt
    als `heading` im Körper.
16. **`<Aenderungsinhalt>` ist ein Zitat, kein eigener Normtext** – siehe Abschnitt 4.1. Das ist die
    folgenreichste Annahme dieses Parsers: Sie entscheidet, ob fremder Wortlaut im Bestand als
    eigener erscheint.
17. **Abbildungen stehen als `figure`-Block an ihrer Stelle im Normkörper (Parser 0.2.0).**
    `<graphic FileRef="…" Desc="…"/>` wird ein Block `{ type: 'figure', asset }`: `asset` nennt SHA-256,
    tatsächliche Medienart (aus den ersten Bytes: GIF, PNG, JPEG), Größe, Maße und den Pfad im Paket – nie
    die Bytes selbst (kein Base64 im Norm-JSON). Die Bilddatei wird eigenes, inhaltsadressiertes Asset
    (`r2/archive.ts`, Schlüssel `assets/<sha256>.<ext>`), das der Worker unter
    `/assets/<land>/<sha256>.<ext>` ausliefert. Die Bildbeschreibung (`@Desc`, z. B. „Übersichtskarte
    Lärmschutzbereich“) ist Alternativtext am Asset, **kein Normtext**: Der Block trägt keinen `text`
    (das Schema lehnt ihn ab), die Beschreibung zählt weder in der Textintegrität noch in der Suche und wird
    nicht übergeleitet – sie beschreibt die Quellabbildung. Ein Logo oder Zierbild (laut `@Desc`) wird
    nicht übernommen (`graphic-decorative`); eine Abbildung ohne lesbare Datei im Paket bleibt beim Befund
    `graphic-not-transferred`. Eine Vorschrift, die nur eine Abbildung trägt, meldet weiterhin
    `provision-graphic-only`.
18. **Bildbeilagen behalten die deklarierte Medienart.** Das Manifest schreibt `image/jpg` – nicht
    `image/jpeg` – und zwar auch für `.gif`-Dateien. Beides bleibt unverändert; die Abweichung
    zwischen Deklaration und Endung wird als `package-media-type-mismatch` gemeldet. Die
    Quellenreferenz einer Bildbeilage trägt als `mediaType` die aus den Bytes erkannte Bildart; die
    Deklaration des Portals steht unverändert in ihrer Notiz.
19. **Dateiverweise werden ohne Rücksicht auf Groß-/Kleinschreibung abgeglichen.** Das XML schreibt
    `Bay_791_3_150_U_…jpg` und `…-A001.PDF`, das Manifest `BAY_791_3_150_U_…jpg` und `…-a001.pdf`.
    Der Abgleich ignoriert die Schreibweise und meldet die Abweichung eigens
    (`referenced-file-case-mismatch`); eine wirklich fehlende Datei bleibt
    `referenced-file-missing`.
20. **`@doktyp="tarifvertrag"` wird `verwaltungsabkommen`** und immer als
    `norm-type-out-of-model` gemeldet. Tarifverträge sind keine Rechtsnormen des Landes und das
    Zielmodell kennt keinen eigenen Typ; der Parser liest sie, **die Aufnahme in den Bestand ist
    eine Entscheidung nach `docs/LEGAL_SCOPE.md`**, die das Review trifft.
21. **`@doktyp="vwv"` wird `verwaltungsvorschrift`**, auch wenn das Dokument die Norm-DTD verwendet
    (belegt an VVBayHO). Die DTD sagt nichts über den Normtyp.
22. **`<sonstigeFundstelle>` gilt, wenn die GVBl.-Fundstelle leer ist.** Sind beide gefüllt, hat die
    GVBl.-Fundstelle Vorrang und der Fall wird als `gazette-reference-ambiguous` gemeldet.
23. **Der Inhalt einer Anlage bekommt keinen Permalink** (Abschnitt 4), und **zitierter Normtext
    ebenfalls nicht** (Abschnitt 4.1).
24. **Repeal-Platzhalter werden an fünf Formulierungen erkannt**: `(aufgehoben)`, `(weggefallen)`,
    `(nicht mehr belegt)` (belegt an BayVSO), `(entfällt)`, `(gestrichen)`. Eine unbekannte
    Formulierung bleibt `empty-provision` (Warnung) – erfunden wird nichts.

---

## 8. Was offen bleibt

1. **Der Elementvorrat ist nicht vollständig belegt.** Die DTD-Dateien wurden nicht abgerufen (kein
   Netzzugriff). Der Parser kennt, was in 28 von 2 311 Dokumenten vorkommt – und schon der Sprung von
   4 auf 28 hat elf neue Strukturen gebracht. Deshalb ist der Meldemodus (`unknown: 'report'`) für
   den Bulk-Lauf gedacht: Er sammelt die tatsächlich vorkommenden unbekannten Elemente, statt den
   Lauf an der ersten Abweichung zu beenden. Nach dem ersten Vollabzug sollte der Vorrat aus den
   Befunden ergänzt und der Lauf wieder auf `throw` gestellt werden.
2. **Abbildungen (entschieden, Parser 0.2.0).** `legal-core` kennt den Block `figure` mit Asset-Referenz;
   der West-Bestand enthält keinen und bleibt unverändert (Regressionstest über den D1-Fingerabdruck).
   Im Korpus stehen von 361 Abbildungen in 51 Dokumenten (einschließlich des BodSchO-Anhangs) 360 als Block im
   Normkörper; eine hat keine lesbare Datei im Paket. Keine ist Logo oder Zierbild. Übernommen und in R2
   archiviert sind 263 Bilddateien aus 35 Normen; die übrigen Bildnormen warten auf ihre Stichtagsfassung.
3. **Das numerische Gliederungssuffix der Verwaltungsvorschriften** (`-0`, `-13`, `-19`, …) und die
   Adressierung **innerhalb** von Anlagen. Solange die Regeln nicht belegt sind, gibt es dort keinen
   Permalink, sondern nur den gezählten Positionspfad in `unresolvedAddresses`.
11. **`verweis.norm@anfrage`** (Werte `baybs` und leer) ist zugelassen, aber ungedeutet; wofür das
   Attribut steht, sagt keine der Quellen.
4. **Die Aufteilung innerhalb von `doktyp="vertrag"`.** Die Facette „Verträge, sonstige
   Rechtsquellen“ zählt 208 Dokumente; belegt sind drei Instanzen. Ob und wie Verwaltungsabkommen,
   Kirchenverträge und sonstige Rechtsquellen im Titel erkennbar sind, ist offen –
   `norm-type-assumed` markiert jeden Fall, der sich nicht selbst benennt.
5. **Ob Tarifverträge in den Landesrechtsbestand gehören.** Der Parser liest sie; die Auswahl trifft
   das Review nach `docs/LEGAL_SCOPE.md`. `norm-type-out-of-model` markiert jeden Fall.
6. **Andere `@doktyp`-Werte** als die sieben genannten brechen ab. Welche Werte im Vollbestand
   vorkommen, zeigt erst die Enumeration.
7. **`@version`/`version.id`** ist im ganzen Korpus durchgängig `p`. Ein zweiter
   Versionsschlüssel würde heute widerspruchslos übernommen; eine Auswertung gibt es nicht, weil es
   keine zweite Zeitschicht gibt (Abschnitt 6 der Discovery).
8. **Die Zuordnung der PDF-Beilagen zur Textstelle** ist aus dem Export nicht herstellbar. Der Parser
   führt sie unverortet; eine Verortung müsste aus dem Portal-HTML oder aus dem PDF selbst kommen.
9. **Der Zitiergraph** (`@ersatz`) wird gesammelt (`BayernRechtDocument.citations`), aber nicht
   aufgelöst. Ein guter Teil der Ziele – Bundesrecht, Änderungsgesetze mit synthetischen IDs, der
   Platzhalter `***` – ist im konsolidierten Bestand definitionsgemäß nicht auflösbar.
10. **Ragged tables.** Im ganzen Korpus ist das Raster jeder Tabelle konsistent, sobald `rowspan`
   mitgerechnet wird. Für den Fall, dass es einmal nicht stimmt, meldet der Parser `table-ragged` und
   ergänzt **keine** Zellen – die spätere Blockprüfung von `legal-core` würde ein solches Dokument
   zurückweisen. Das ist gewollt: Ein erfundenes Raster wäre schlimmer als ein Review-Fall.

---

## 9. Tests

`tests/unit/bayernrecht-parse.test.ts` – 64 Prüfungen in vierzehn Gruppen:

| Gruppe | Prüft |
| --- | --- |
| XML-Leser | BOM, DOCTYPE ohne Auflösung, unbekannte Entität, interne Teilmenge, Schachtelung, doppeltes Attribut |
| Dokumentmodell erkennen | beide DTDs, Fremdformat, `SourceParser`-Vertrag |
| Kopfangaben | Titel/Kurztitel/Abkürzung/BayRS/Daten, `S=318` → `318`, Ausfertigung gegen Fassung, leere Pflichtfelder |
| Gliederung, Vorschrift, Absatz | Schachtelung, Gliederungszeichen gegen Überschrift, nummernlose Vorschrift, Absätze, Listen |
| Satznummern und Fußnoten | Hochzahl vor dem Satz, verworfene `id`, Fußnote an der Aufrufstelle, fehlendes Aufrufzeichen, Fußnote in der Gliederungsüberschrift |
| Aufgehobene Vorschriften | Platzhalter bleibt Block, Befund |
| Tabellen und Anlagen | Raster, `columns`, `colspan`/`rowspan`/`scope`, `m³` als Hochstellung, doppeltes `annex.nummer` |
| Permalinks | Positionspfad gegen XML-ID, Artikelbezeichnung, `NN<i>`, `ANL_<i>`, kein geratener Permalink im Anlageninhalt |
| Weitere Strukturen des Korpus | `einleitungssatz`, `annex.text`, Gliederung in der Anlage, Langform der Anlagenbezeichnung, `Aenderungsinhalt` in Absatz und Listenpunkt, `@doktyp="vwv"`/`"tarifvertrag"`, `sonstigeFundstelle`, „(nicht mehr belegt)“, Abbildungen, `verweis.norm@anfrage`, unbekanntes Attribut ist nie Fehler |
| byrecht-vv | Metadaten, BayRS nur bei passendem Muster, Vollzitat, Schachtelung, `<sup>`-Satzzählung samt Zweifelsfall, `S=`/`Nr=`, `<hr/>`, `@inkraft`, kein geratener Permalink |
| `@builddate` | gleicher Körper und gleicher Fingerabdruck trotz anderem `builddate`, anderer Abrufzeit und anderem Paket-Hash; anderer Fingerabdruck bei geändertem Text |
| Fail-closed | Abbruch mit Elementnamen, Meldemodus mit erhaltenem Text, unbekanntes Attribut, `@doktyp="vertrag"` samt mehrzeiligem Titel, unbekannter Normtyp |
| Exportpaket | echte Manifeste, ZIP, Beilagen als unverortete Anhänge, Bildbeilagen samt Medienartabweichung, unbekannte Medienart bricht ab, Manifest gegen Paketinhalt |
| Blockmodell | `parseBodyBlocks` aus `legal-core` für alle neun Norm-Fixtures |

Die Fixtures unter `tests/fixtures/bayernrecht/` sind echte, gekürzte Ausschnitte aus neun Exporten
des Korpus (`BayAbmG`, `BayVerf`, `BayKVzKG`, `BayVwV312180`, `BayBhV`, `VVBayHO`, `BayBoFiV`,
`BayRadG`, `BayVSO`) und die echten Manifeste von fünf Paketen –
mit BOM, DOCTYPE, Originalleerraum und den Eigenheiten, um die es geht. Gekürzt wurde ausschließlich
durch Weglassen ganzer Zweige und durch Verkürzen langer Tabellenkörper auf wenige Zeilen; es ist
kein erfundenes XML darunter. Der ZIP-Leser läuft im Test gegen ein aus denselben Fixtures und den
echten Manifesten gebautes Paket.

Gegenprobe außerhalb der Testsuite: **alle 28 Pakete des Beispielkorpus** aus `.cache/bayernrecht/`
werden im Vorgabemodus (`throw`) ohne Abbruch und ohne Befund der Stufe `error` geparst, und jeder
Normkörper besteht `parseBodyBlocks`. Der Cache ist nicht versioniert, deshalb ist das kein
Testfall; die Fälle, die das Korpus beigetragen hat, sind als eigene Prüfungen gegen die hiesigen
Fixtures abgebildet, damit die Tests weder vom Cache noch von fremden Fixtures abhängen.
