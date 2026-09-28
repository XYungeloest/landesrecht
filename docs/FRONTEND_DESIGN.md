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
