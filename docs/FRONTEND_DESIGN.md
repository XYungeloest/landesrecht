# Frontend-Design

Verbindliche visuelle Vorgabe ist `design.md`. Die Umsetzung liegt zentral in
`apps/web/src/styles/base.css`: Farb- und Statustokens, 4-px-Abstandsskala,
Typografie, Radien, Fokuszustände sowie Inhalts- und Lesebreiten. Länder teilen
sich dieselben Komponenten und Interaktionsfarben.

- Inhaltsbreite: höchstens 1280 px; Normtext: höchstens 820 px, 17 px / 1,72.
- Schriftstapel: Inter, Source Sans 3, Systemschrift; keine externen Schriftabrufe.
- Breakpoints: 640, 768, 1024 und 1280 px. Die Media Queries verwenden Literale,
  da CSS-Variablen in Media-Query-Bedingungen nicht unterstützt werden.
- `ResponsiveDisclosure.astro` steuert Menü und Inhaltsübersicht mit nativen
  `details`-Elementen. Ohne JavaScript sind die Inhalte zunächst aufgeklappt.
- `SearchFilters.astro` verschiebt dasselbe Filterformular auf kleinen Displays
  in einen nativen modalen Dialog (Fokusbegrenzung, Escape, Fokusrückgabe).
  Ohne JavaScript bleibt das Formular im normalen Seitenfluss bedienbar.
- `SearchSnippet.astro` hebt Suchwörter ausschließlich in der Darstellung hervor;
  Suchabfrage und Rangfolge werden dadurch nicht verändert.
- Originale Markenbilder liegen unverändert unter `apps/web/public/`.
  Der Header rahmt die mitgelieferte PNG-Wortmarke wegen ihrer transparenten
  Außenränder per CSS ein. Die Quelldateien im Repository bleiben erhalten.

Neue Oberflächen verwenden diese Tokens und vorhandene Komponenten. Rechtstexte,
Trefferlisten und Verkündungen werden mit Weißraum und Trennlinien gegliedert;
Karten bleiben Übersichten und kompakten Metadaten vorbehalten.

## Öffentliche Sprache und Rechtsstand

- Öffentliche Seiten zeigen keine Arbeitsbegriffe (Freeze, Baseline, Review, Ledger, Seed, SHA-256, R2/D1,
  Archivobjekte, Systemkennungen, Fassungs-IDs). Redaktionelle Arbeitsnotizen aus gespeicherten Fassungen filtert
  `publicNote()` (`packages/legal-core/src/lib/display.ts`) bei der Anzeige; Speichertechnik bleibt in der API.
  `scripts/smoke.ts` prüft 15 öffentliche Seiten gegen eine Begriffsliste.
- Rechtsstand je Vorschrift aus `classifySimulationChange`: Kennzeichen (`SimulationBadge.astro`) nur für
  „In der Simulation geändert“ und „Neu in der Simulation“; Unverändertes bleibt unmarkiert. Geänderte Normen tragen
  im Kopf einen Hinweis mit „Änderungen ansehen“ (Vergleich Ausgangsfassung ↔ geltende Fassung).
- Normlisten (`NormListing.astro`, Logik in `lib/norm-listing.ts`): Reiter `?stand=changed|new`, Typfilter,
  A–Z (`?buchstabe=`), 50 je Seite (`?seite=`); Zählwerte kommen aus `countNormFacets`, nie aus der geladenen Seite.
- Länderübergreifende Änderungen: `/aenderungen/`; Erläuterungen ohne Technik: `/ueber-den-rechtsbestand/`.
- „Nach Sachgebiet“ entfällt, solange `subjects` im Bestand leer ist (Stand: 0 von 5 897 Normen).

## Hierarchie und Darstellungsprüfung

- Rechtsstand-Reiter stehen über den rechteckigen Vorschriftenart-Filtern; A–Z bleibt eine eigene,
  horizontal scrollbar bedienbare Zeile. Reiter und Aktionen bieten mindestens 44 px hohe Ziele.
- Vorschriftentitel und Kurzbezeichnung stehen vor Status und Metadaten. Simulationsstatus erhält die
  stärkste Kennzeichnung; Land und Vorschriftenart bleiben neutral. Der Normkopf bietet einen primären
  Vergleichslink, sekundäre Fassungslinks und dezente Kopieraktionen.
- Der Fassungsvergleich markiert Wortänderungen mit `del`/`ins` und erhält jeden Buchstaben beider Texte.
  Bei sehr großen Einheiten wird der geänderte Mittelteil zusammenhängend markiert (begrenzter Aufwand).
  Unter 768 px stehen Fassungen untereinander. Unveränderte Einheiten werden weiterhin ausgelassen.
- Verkündungen werden nach Jahrgang gegliedert; mobile Ausgabeeinträge tragen sichtbare Spaltenbezeichnungen.
  Normtext bleibt dokumentartig, die Inhaltsübersicht auf Desktop sticky und mobil einklappbar.
- Druck blendet Werkzeuge aus, erhält Titel, Geltung, Fundstelle und den kurzen Simulationshinweis.

`npm run smoke:ui -- --base http://localhost:4321` prüft die gerenderten Seitentypen, Filter ohne Suchbegriff,
A–Z, Pagination und Anker. Ergänzend im Browser bei 1440, 1024, 768 und 390 px prüfen: Homepage, Land,
Änderungen, Suche, unveränderte/geänderte/neue und lange Vorschrift, historische Fassung, Historie,
Vergleich, Quellen, Verkündungsarchiv/-detail und Bestandsinformation. Reiter, A–Z, Pagination,
Filterdialog (Escape/Fokusrückgabe), Absatzlink und Kopierrückmeldung bedienen; Normtext-Druck prüfen.
Screenshots bleiben außerhalb des versionierten Bestands.

## Markieren und Zitieren

Normtext- und Einzelvorschriftenseiten verwenden dieselben strukturgebundenen Anzeigeziele
(`legal-core/lib/markings.ts`) und den gemeinsamen Clipboard-Pfad. Markierbar sind eindeutig
bezeichnete Paragraphen/Artikel und ihre direkten, einmalig nummerierten Absätze. Zitierte,
unstrukturierte, verschachtelte oder mehrdeutig bezeichnete Absätze erhalten keine vermutete
Zitieradresse. Anlagen-/Artikelkontexte werden im Zitat mitgeführt. Eine ganze Vorschrift im
Zitat umfasst gleichzeitig ausgewählte Absätze derselben Einheit.

`mark` enthält ausschließlich auf der dargestellten Seite vorhandene Kennungen: höchstens 50,
maximal 8.192 Zeichen Eingabe und 160 Zeichen je Kennung. Unbekannte Ziele werden ignoriert.
Es gibt keine Speicherung, Cookies oder Textdaten im Parameter. Kanonische URLs und gewöhnliche
Absatzlinks bleiben unverändert. Historische Zitate ergänzen den ausdrücklich als Portal-Fassung
bezeichneten Geltungszeitraum. Die Auswahlleiste erscheint erst bei Auswahl; Schaltflächen haben
44-Pixel-Touchflächen, Tastaturfokus, gedrückten Zustand und Statusmeldungen. Ohne JavaScript
bleiben Text, Anker und Navigation vollständig verfügbar.

## Kompakte Einzelvorschriften

`ProvisionPage` zeigt eine verlinkte Gesetzesbezeichnung, eine einzige Hauptüberschrift,
knappen Fassungsstatus und drei primäre Aktionen. Fundstelle, Geltungsdetails, Quellen und
zusätzliche Aktionen liegen unter „Weitere Angaben“. Die Änderungsangabe benennt stets das
gesamte Gesetz/Regelwerk; ohne Einzelvergleich gibt es keine paragraphengenaue Änderungsbehauptung.
`NormBody.rootHeadingId` unterdrückt ausschließlich die bereits außerhalb gerenderte
Wurzelüberschrift, behält deren bisherigen Anker und ARIA-Bezug sowie die nachfolgenden Ebenen.
Gesamtgesetzseiten bleiben unverändert.

`ProvisionNavigation` verwendet oben und unten dasselbe Modell aus `getProvisionEntries`.
Die obere Leiste bleibt 58 Pixel hoch unter dem Portalheader; dessen Höhe wird bei Bedarf
per ResizeObserver nachgeführt (CSS-Fallback ohne JavaScript). Die native Auswahl ist nach
vorhandenen Gliederungskontexten gruppiert. Mit JavaScript öffnet `change` sofort das zugehörige,
serverseitig freigegebene Optionsziel; ein zugänglicher Hinweis kündigt den Wechsel an. Erst nach
Bereitschaft der automatischen Navigation wird „Öffnen“ ausgeblendet. Ohne JavaScript bleibt
die Bestätigung mit „Öffnen“ erhalten.
Ein validierter GET-Parameter `vorschrift` führt per 303 auf die bestehende Einzelvorschriften-URL;
auch ohne JavaScript bleibt die Navigation vollständig nutzbar. Historische Pfade erhalten ihre
Fassungs-ID; unbekannte Auswahlziele liefern 404. Markierungsparameter werden beim Wechsel
nicht übernommen. Nur die obere Leiste enthält die Auswahloptionen, um große Gesetze nicht
doppelt in den DOM aufzunehmen. In der Druckansicht entfallen Navigation und Aktionsleisten.

## Freier Textmarker und automatische Satz-Lesehilfe

`NormBody` kennzeichnet seine unveränderten Textfelder mit stabilen Blockpfaden und vorhandenen
Strukturbezügen. Der Client indiziert deren echte Textknoten, einschließlich Inline-Elementen,
Links und Quell-Fußnotenverweisen. Native Selection/Range-Auswahlen werden ohne HTML-Ersetzung
als zusammengehörige Bereiche desselben Vorgangs gespeichert. Visuelle Zeilen sind keine Adressen.
Hervorhebung: [CSS Custom Highlight API](https://www.w3.org/TR/css-highlight-api-1/),
kein `surroundContents`, keine Ersatz-HTML-Engine. Ohne diese API bleibt Textauswahl/Kopieren
nutzbar; die fehlende Hervorhebung wird erklärt. Es gibt keine automatische Speicherung oder
Übertragung. Eine Weitergabe erfolgt ausschließlich über den ausdrücklich kopierten Link;
nach einem Reload werden nur im Link enthaltene Markierungen wiederhergestellt.

`textmark` ist von strukturellen `mark`-Kennungen getrennt: Schema, Norm-ID, konkrete Fassungs-ID
und je Teilbereich Blockpfad, UTF-16-Anfang/Ende sowie SHA-256 des gesamten sichtbaren Textfelds.
Es erfolgt keine Suche nach dem ersten gleichen Wort. Teilbare Links führen immer auf die
unveränderliche Fassungsroute. Fremde Fassungen, unbekannte Bereiche und abweichender Text
werden verworfen. Ein beschädigter Teilbereich verwirft seinen gesamten Markierungsvorgang.
Grenzen: 20 unabhängige Textmarkierungen, 64 Teilbereiche je Auswahl, insgesamt 120 Teilbereiche,
20.000 ausgewählte UTF-16-Zeichen und höchstens 12.000 URL-kodierte Zeichen für `textmark`.
URLs enthalten keine ausgewählten Wortlaute. Die Verwaltung erlaubt einzelnes Entfernen,
reinen Wortlaut und Wortlaut mit Vorschriftennachweis. Zitiernachweise verwenden ausschließlich
vorhandene Paragraphen-/Artikel-/Absatzadressen, nie automatisch erzeugte Satznummern.
Bei fehlender eindeutiger Struktur wird nur die Normbezeichnung verwendet.

`sentences.ts` erzeugt eine konservative Anzeigeprojektion auf denselben Normblöcken. Direkte,
eindeutige Absätze zählen getrennt; mehrere `paragraphText`-Blöcke derselben Einheit gemeinsam.
Geprüft werden Abkürzungen, Rechtsverweise, Datums-/Dezimalangaben und ausgeglichene Klammern.
Semikola trennen nicht. Listen, Tabellen, Abbildungen, Zitate, unklare Nummerierungen, mögliche
Quell-Satznummern, Auslassungspunkte und zweifelhafte Satz-/Abkürzungsenden werden ausgelassen.
Fußnoten zählen nicht als Normsätze. Ein-Satz-Einheiten erhalten keine Zahl; Einheiten über
50.000 Zeichen oder 999 Sätze ebenfalls nicht. Dies ist keine vollständige juristische
Satzinterpretation, sondern eine abschaltbare Lesehilfe mit bewusst begrenzter Abdeckung.

Der Client fügt ausschließlich leere, `aria-hidden`-Anzeigeelemente ein. Die Ziffern kommen aus
CSS-Pseudoinhalt mit `user-select: none`; Textknoteninhalt und Absatzanker bleiben erhalten.
Erst danach wird der Textindex aufgebaut. Ein-/Ausblenden ändert nur CSS, nicht Koordinaten.
Ausgewählte Bereiche über eingefügte Nummern werden durchgehend dargestellt. Der Kontext bietet
„Textmarker“/„Text kopieren“; Alt+M markiert eine bestehende Auswahl auch per Tastatur.
Das gemeinsame Auswahlpanel bleibt bis zur ersten Markierung verborgen. Es gibt keine Cookies,
Analytics oder serverseitige Daten. DOM-/Range-Regressionsfälle laufen mit jsdom ausschließlich
als Entwicklungsabhängigkeit.

Aktive Markierungen erscheinen zunächst nur in einer schmalen unteren Leiste mit Anzahl,
Linkkopie, „Verwalten“ und Aufheben. Die Verwaltung öffnet ausdrücklich, scrollt unabhängig
vom Normtext und schließt auch mit Escape; der Fokus kehrt zum Verwaltungsbutton zurück.
Angeschnittene Wortanfänge erhalten ausschließlich in der Vorschau ein vorangestelltes „…“.
Absatz-Markierungsbuttons sitzen seitlich außerhalb des Textflusses und vergrößern die Absatzhöhe nicht.
