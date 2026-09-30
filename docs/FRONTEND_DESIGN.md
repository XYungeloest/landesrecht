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
