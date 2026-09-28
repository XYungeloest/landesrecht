# Designsystem für landesrecht-online.de

> Ziel: ein modernes, vertrauenswürdiges und sachliches Rechtsportal mit klarer Informationshierarchie. Das Erscheinungsbild soll amtlich wirken, ohne wie ein Behördenportal aus den 2000ern auszusehen. Der Schwerpunkt liegt auf Lesbarkeit, Suche, Orientierung und langen Rechtstexten.

---

## 1. Markenidee

**Landesrecht Online** steht für:

- verlässliche Rechtsinformation
- schnellen digitalen Zugriff
- klare Struktur statt visueller Überladung
- bundeslandübergreifende Einheitlichkeit
- seriöse, moderne Verwaltungsgestaltung

Die visuelle Sprache orientiert sich an der Wort-Bildmarke:

- dunkles Navy als ruhige, institutionelle Grundfarbe
- kräftiges Blau als digitales Akzent- und Interaktionselement
- viel Weißraum
- klare Sans-Serif-Typografie
- einfache geometrische Formen
- keine dekorativen Effekte ohne funktionalen Zweck

Das Portal soll eher wie ein hochwertiges **Rechtsinformationssystem** als wie eine klassische Behördenwebsite wirken.

---

## 2. Farben

### 2.1 Primärfarben

| Token | Farbe | Verwendung |
|---|---|---|
| `--color-navy-900` | `#0B2545` | Logo, Überschriften, Hauptnavigation, starke Kontraste |
| `--color-navy-800` | `#12345B` | Hoverflächen, sekundäre Navigation |
| `--color-blue-600` | `#1E63FF` | Links, Buttons, aktive Elemente, Fokus, Akzente |
| `--color-blue-700` | `#1554DE` | Hover für primäre Aktionen |
| `--color-blue-100` | `#EAF1FF` | aktive Navigation, Hinweise, ausgewählte Filter |
| `--color-blue-50` | `#F5F8FF` | sehr leichte Akzentfläche |

### 2.2 Neutrale Farben

| Token | Farbe | Verwendung |
|---|---|---|
| `--color-text` | `#172033` | Fließtext |
| `--color-text-muted` | `#5D687A` | Metadaten, Nebeninformationen |
| `--color-border` | `#DCE2EA` | Rahmen, Divider, Tabellenlinien |
| `--color-surface-subtle` | `#F6F8FB` | Seitenleisten, Sekundärflächen |
| `--color-surface` | `#FFFFFF` | Karten und Inhaltsflächen |
| `--color-page` | `#F8FAFC` | Seitenhintergrund |

### 2.3 Statusfarben

Statusfarben nur für echte semantische Zustände verwenden.

| Token | Farbe | Verwendung |
|---|---|---|
| `--color-success` | `#177245` | gültig, aktiv, erfolgreich |
| `--color-success-bg` | `#EAF7F0` | Erfolgsfläche |
| `--color-warning` | `#9A6700` | Hinweis, auslaufend, unvollständig |
| `--color-warning-bg` | `#FFF5D6` | Warnfläche |
| `--color-danger` | `#B42318` | außer Kraft, Fehler, kritisch |
| `--color-danger-bg` | `#FDEDEC` | Fehlerfläche |
| `--color-info` | `#1E63FF` | neutrale Information |
| `--color-info-bg` | `#EAF1FF` | Informationsfläche |

### 2.4 Länderfarben

Länderfarben dürfen verwendet werden, aber **niemals als tragendes Grunddesign**.

Sie eignen sich für:

- kleine Kennzeichnungen
- Länderchips
- Landeswappenbereiche
- schmale Akzentlinien
- ausgewählte Zustände in Länderübersichten

Die Hauptnavigation, Suche, Buttons und Typografie bleiben immer im gemeinsamen Landesrecht-Design.

So bleibt das Portal als einheitliches Produkt erkennbar.

---

## 3. CSS Design Tokens

```css
:root {
  --color-navy-900: #0b2545;
  --color-navy-800: #12345b;

  --color-blue-700: #1554de;
  --color-blue-600: #1e63ff;
  --color-blue-100: #eaf1ff;
  --color-blue-50: #f5f8ff;

  --color-text: #172033;
  --color-text-muted: #5d687a;
  --color-border: #dce2ea;
  --color-surface: #ffffff;
  --color-surface-subtle: #f6f8fb;
  --color-page: #f8fafc;

  --color-success: #177245;
  --color-success-bg: #eaf7f0;
  --color-warning: #9a6700;
  --color-warning-bg: #fff5d6;
  --color-danger: #b42318;
  --color-danger-bg: #fdedec;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;

  --shadow-sm: 0 1px 2px rgba(11, 37, 69, 0.06);
  --shadow-md: 0 8px 24px rgba(11, 37, 69, 0.08);

  --content-width: 1280px;
  --reading-width: 820px;
}
```

---

## 4. Typografie

### 4.1 Schriftfamilie

Empfohlen:

```css
font-family: Inter, "Source Sans 3", system-ui, -apple-system,
  BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Bevorzugt wird **Inter**.

Vorteile:

- sehr gute Bildschirmlesbarkeit
- neutrale, moderne Wirkung
- gute Darstellung von Tabellen und Metadaten
- umfangreiche Zeichensätze
- passt visuell zur Wort-Bildmarke

### 4.2 Typografische Hierarchie

```text
H1      40 px / 48 px   700
H2      30 px / 38 px   700
H3      24 px / 32 px   650
H4      20 px / 28 px   650
Body    16 px / 26 px   400
Small   14 px / 22 px   400
Meta    13 px / 20 px   500
```

Auf Mobilgeräten:

```text
H1      32 px / 40 px
H2      26 px / 34 px
H3      22 px / 30 px
```

### 4.3 Rechtstexte

Rechtstexte brauchen eine etwas ruhigere Darstellung als normale UI-Texte.

Empfehlung:

```css
.law-text {
  max-width: 820px;
  font-size: 17px;
  line-height: 1.72;
  color: #172033;
}
```

Absätze dürfen nicht zu breit werden. Lange Normtexte auf 1200 px Breite sind schwer lesbar.

---

## 5. Grundlayout

### 5.1 Seitenbreite

```css
.page-container {
  width: min(100% - 32px, 1280px);
  margin-inline: auto;
}
```

Desktop:

- maximal 1280 px Inhaltsbreite
- mindestens 24 bis 32 px Außenabstand

Mobile:

- 16 px Außenabstand

### 5.2 Raster

Das Portal verwendet vorzugsweise ein **12-Spalten-Raster**.

Typische Aufteilungen:

```text
Startseite:       12
Suchseite:        3 Filter / 9 Ergebnisse
Normdetail:       3 Navigation / 9 Inhalt
Publikation:      4 Metadaten / 8 Inhalt
```

Auf kleinen Displays werden alle Bereiche einspaltig.

---

## 6. Kopfbereich

Der Header soll kompakt bleiben.

Empfohlener Aufbau:

```text
┌──────────────────────────────────────────────────────────────┐
│ Logo                    Rechtsgebiete  Länder  Hilfe   Suche │
└──────────────────────────────────────────────────────────────┘
```

### Gestaltung

- Höhe Desktop: ca. 72 px
- weißer Hintergrund
- untere Border `#DCE2EA`
- Logo links
- keine riesige Headerfläche
- Navigation in `#172033`
- aktiver Punkt mit blauem Unterstrich oder blauer Textfarbe

Sticky Header ist sinnvoll, besonders auf langen Normseiten.

---

## 7. Startseite

Die Startseite soll nicht wie ein Nachrichtenportal aufgebaut sein. Die **Suche ist die Hauptfunktion**.

Empfohlener Aufbau:

```text
[ Header ]

Landesrecht durchsuchen
Gesetze, Verordnungen und Verwaltungsvorschriften der Länder.

[ Suchbegriff, Fundstelle oder Aktenzeichen                 ] [ Suchen ]

[ Alle Länder ] [ Gesetze ] [ Verordnungen ] [ Verwaltungsvorschriften ]

──────────────────────────────────────────────────────────────

Länder
[ Land A ] [ Land B ] [ Land C ] [ Land D ]

──────────────────────────────────────────────────────────────

Häufig genutzt
[ Verfassungen ] [ Kommunalrecht ] [ Schulrecht ] [ Baurecht ]
```

Die Suche soll optisch der stärkste Bereich der Startseite sein.

---

## 8. Suche

### 8.1 Suchfeld

Desktop:

- Höhe 52 bis 56 px
- Radius 10 px
- Border 1 px `#C9D2DF`
- klare Suchschaltfläche rechts

```css
.search-input:focus {
  border-color: #1e63ff;
  box-shadow: 0 0 0 3px rgba(30, 99, 255, 0.16);
}
```

Placeholder-Beispiel:

```text
Gesetz, Paragraph, Fundstelle oder Suchbegriff
```

### 8.2 Ergebnisliste

Ein Treffer besteht aus:

```text
[Gesetz]  [Land]

Kommunalverfassungsgesetz
§ 42 Aufgaben des Gemeinderats

... hervorgehobener Textausschnitt mit Suchbegriff ...

GVBl. 2023 S. 123 · Fassung vom 01.12.2023
```

Wichtig:

- Titel niemals blau überladen
- Treffer-Typ als kleiner Badge
- Suchbegriff im Ausschnitt dezent hervorheben
- Metadaten klar vom Inhalt trennen
- zwischen Ergebnissen 20 bis 24 px Abstand

---

## 9. Filter

Filter sitzen auf Desktop links in einer Seitenleiste.

Beispiele:

- Land
- Normtyp
- Rechtsgebiet
- Gültigkeitsstatus
- Zeitraum
- Verkündungsorgan

Aktive Filter erscheinen zusätzlich oberhalb der Treffer als Chips.

```text
[ Ost × ] [ Gesetz × ] [ Schulrecht × ]     Alle zurücksetzen
```

### Filterchip

```css
.filter-chip {
  background: #eaf1ff;
  color: #0b2545;
  border-radius: 999px;
}
```

---

## 10. Normdetailseite

Die Detailseite ist der wichtigste Bereich des Portals.

Empfohlene Struktur:

```text
Breadcrumb

[Gesetz] [in Kraft]

Kommunalverfassungsgesetz
Kurzbezeichnung: KVG

Fundstelle: ...
Fassung vom: ...
Gültig ab: ...

────────────────────────────────────

Inhaltsverzeichnis      § 1 ...
§ 1 Allgemeines         § 2 ...
§ 2 Aufgaben            § 3 ...
§ 3 ...

                         eigentlicher Normtext
```

### 10.1 Dokumentkopf

Der Kopf einer Norm bekommt viel Weißraum und klare Metadaten.

Keine große farbige Hero-Fläche.

Stattdessen:

- Breadcrumb
- Normtyp-Chip
- Status
- Titel
- Kurzbezeichnung
- Fundstelle und Gültigkeit

### 10.2 Inhaltsverzeichnis

Desktop:

- links sticky
- 260 bis 300 px breit
- aktive Norm blau markieren

Mobile:

- einklappbares Inhaltsverzeichnis

### 10.3 Paragraphen

```text
§ 12
Überschrift des Paragraphen

(1) Lorem ipsum ...

(2) Lorem ipsum ...
```

Empfehlung:

```css
.law-section {
  scroll-margin-top: 100px;
  margin-block: 44px;
}

.law-section-number {
  color: #1e63ff;
  font-weight: 700;
}
```

Paragraphen dürfen per URL-Anchor direkt verlinkbar sein.

Beim Hover auf `§ 12` kann ein kleines Link-Symbol erscheinen.

---

## 11. Fassungen und Historie

Fassungen sollen visuell klar voneinander unterscheidbar sein.

Beispiel:

```text
Aktuelle Fassung
01.12.2023 – heute

Frühere Fassungen
01.01.2022 – 30.11.2023
01.07.2020 – 31.12.2021
```

Aktuelle Fassung:

- blauer Rand oder blauer Punkt
- nicht komplett blau hinterlegen

Außer Kraft:

- roter Statuschip
- Text bleibt normal schwarz

---

## 12. Buttons

### Primär

```css
.button-primary {
  background: #1e63ff;
  color: white;
  border-radius: 8px;
}

.button-primary:hover {
  background: #1554de;
}
```

### Sekundär

```css
.button-secondary {
  background: white;
  color: #0b2545;
  border: 1px solid #cbd5e1;
}
```

### Tertiär

Textbutton ohne Rahmen, nur für weniger wichtige Aktionen.

Keine Pill-Buttons für normale Aktionen. Pill-Formen bleiben Chips, Tags und Filtern vorbehalten.

---

## 13. Karten

Karten sparsam einsetzen.

Geeignet für:

- Länderübersicht
- Rechtsgebiete
- Statistiken
- Startseite

Nicht geeignet für:

- jeden einzelnen Suchtreffer
- jeden Paragraphen
- lange Normtexte

Standardkarte:

```css
.card {
  background: #fff;
  border: 1px solid #dce2ea;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(11, 37, 69, 0.04);
}

.card:hover {
  border-color: #b8c6da;
  box-shadow: 0 8px 24px rgba(11, 37, 69, 0.08);
}
```

---

## 14. Tabellen

Rechtsportale brauchen viele Tabellen. Deshalb möglichst funktional gestalten.

- Kopfzeile `#F6F8FB`
- keine Zebra-Streifen standardmäßig
- horizontale Divider
- Werte linksbündig, Zahlen ggf. rechtsbündig
- Tabellen auf Mobilgeräten scrollbar

```css
th {
  color: #0b2545;
  font-weight: 650;
  background: #f6f8fb;
}
```

---

## 15. Links

Standardlink:

```css
a {
  color: #1554de;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}
```

Navigation und Kartenlinks dürfen ohne permanente Unterstreichung dargestellt werden.

Fließtextlinks sollten unterstrichen sein, damit sie nicht nur durch Farbe erkennbar sind.

---

## 16. Icons

Empfohlene Icon-Sets:

- Lucide
- Heroicons
- Tabler Icons

Nicht mehrere Sets mischen.

Icons überwiegend:

- 16 px für Metadaten
- 20 px für Buttons
- 24 px für Navigation

Strichstärke möglichst konsistent.

Keine Emojis als UI-Symbole.

---

## 17. Radius und Formen

Das Design verwendet leichte Rundungen, aber keine extreme App-Optik.

```text
kleine Controls:  6 px
Inputs / Buttons: 8–10 px
Karten:           12 px
große Flächen:    14 px
Chips:            999 px
```

---

## 18. Schatten

Schatten sind zurückhaltend einzusetzen.

Erlaubt:

- Dropdowns
- Popover
- schwebende Karten
- Hoverzustände

Nicht nötig:

- normale Inhaltscontainer
- Normtexte
- Navigation

Primär über Border und Weißraum strukturieren.

---

## 19. Abstände

Basisraster: **4 px**.

Empfohlene Skala:

```text
4 px
8 px
12 px
16 px
20 px
24 px
32 px
40 px
48 px
64 px
80 px
```

Häufige Kombinationen:

```text
Label → Input            8 px
Überschrift → Text      12 px
Absatz → Absatz         16 px
Card Innenabstand       24 px
Sektion → Sektion       48–64 px
```

---

## 20. Responsive Verhalten

Breakpoints:

```css
--bp-sm: 640px;
--bp-md: 768px;
--bp-lg: 1024px;
--bp-xl: 1280px;
```

### Mobile

- Navigation als Menü
- Filter als Drawer
- Inhaltsverzeichnis einklappbar
- Karten einspaltig
- Tabellen horizontal scrollbar
- Buttons mindestens 44 px hoch

### Desktop

- sticky Filter
- sticky Inhaltsverzeichnis
- breite Suchleiste
- 2- bis 4-spaltige Übersichten

---

## 21. Barrierefreiheit

Ziel mindestens **WCAG 2.2 AA**.

Pflicht:

- sichtbare Fokuszustände
- keine Information ausschließlich über Farbe
- ausreichende Kontraste
- `aria-current` in Navigationen
- semantische Überschriftenstruktur
- Skip-Link zum Hauptinhalt
- Tastaturbedienbarkeit
- ausreichend große Klickflächen

Fokusstil:

```css
:focus-visible {
  outline: 3px solid rgba(30, 99, 255, 0.35);
  outline-offset: 2px;
}
```

---

## 22. Animationen

Animationen nur funktional.

Empfohlen:

```css
transition: 120ms ease;
```

Maximal etwa 150 bis 200 ms für normale UI-Zustände.

Keine großen Seitenanimationen, Parallax-Effekte oder animierten Hintergründe.

Bei `prefers-reduced-motion` Übergänge stark reduzieren.

---

## 23. Dark Mode

Dark Mode ist möglich, aber für die erste Version nicht notwendig.

Das Portal sollte zunächst einen sehr guten hellen Modus besitzen. Rechtstexte und lange Lesestrecken profitieren stark von konsistenten hellen Flächen.

Wenn später ein Dark Mode hinzukommt, sollte er über dieselben semantischen Tokens realisiert werden und nicht durch separate Komponentenlogik.

---

## 24. Bildmarke und Favicon

Die Bildmarke verwendet:

- Dokumentform
- Paragraphenzeichen `§`
- Navy als Grundfarbe
- kräftiges Blau als Akzent

Das Favicon verwendet ausschließlich die Bildmarke ohne Wortmarke.

Empfohlene Dateien:

```text
/public/favicon.svg
/public/favicon-32x32.png
/public/apple-touch-icon.png
/public/logo.svg
/public/logo-dark.svg          optional
```

Die Wortmarke sollte im Header nie extrem groß erscheinen. Zielhöhe Desktop etwa 36 bis 42 px.

---

## 25. Tonalität der Oberfläche

UI-Texte sollen knapp und sachlich sein.

Gut:

```text
Norm durchsuchen
Fassung auswählen
Alle Filter zurücksetzen
Zur aktuellen Fassung
Fundstelle anzeigen
```

Weniger gut:

```text
Jetzt loslegen
Entdecke unsere Rechtswelt
Mehr erfahren
Hier klicken
```

Das Portal ist ein Arbeitswerkzeug und kein Marketingprodukt.

---

## 26. Beispiel für die visuelle Hierarchie

```text
Landesrecht online
─────────────────────────────────────────────────────────────

Start  >  Ost  >  Landesrecht  >  Schulgesetz

GESETZ        IN KRAFT

Schulgesetz
SchulG

Fassung vom 1. Dezember 2023
GVBl. S. 123

[ Gesamtausgabe ] [ Frühere Fassungen ] [ Fundstelle ]

─────────────────────────────────────────────────────────────

Inhalt                        § 1 Geltungsbereich
§ 1 Geltungsbereich           (1) Dieses Gesetz gilt ...
§ 2 Bildungsauftrag
§ 3 Schularten                (2) ...
...
```

Hierarchie:

1. Normtitel
2. Paragraphen und Überschriften
3. eigentlicher Normtext
4. Metadaten
5. technische Zusatzinformationen

---

## 27. Was vermieden werden soll

Nicht verwenden:

- übermäßige Verläufe
- Glassmorphism
- starke Schatten
- Neonfarben
- große Hero-Illustrationen
- Hintergrundmuster hinter Rechtstexten
- unnötige Animationen
- mehrere Akzentfarben gleichzeitig
- extrem abgerundete Karten
- jeder Inhalt als eigene Card
- Serifenschrift für die komplette Oberfläche
- klassische Justizklischees wie Waage, Hammer oder Säulen als dominante Gestaltung

Das Paragraphensymbol reicht als rechtliche Bildsprache völlig aus.

---

## 28. Kurzfassung für die Implementierung

Wenn eine neue Komponente gebaut wird, gilt grundsätzlich:

1. Hintergrund überwiegend weiß oder `#F8FAFC`.
2. Überschriften in `#0B2545`.
3. Haupttext in `#172033`.
4. Interaktionen in `#1E63FF`.
5. Border in `#DCE2EA`.
6. Radius meist 8 bis 12 px.
7. Schatten nur bei echter Tiefenwirkung.
8. Rechtstexte maximal etwa 820 px breit.
9. Suche und Lesbarkeit stehen vor dekorativer Gestaltung.
10. Alle Länder teilen sich dasselbe Grunddesign.

---

## 29. Referenzkomponente

```css
.lro-panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 24px;
}

.lro-heading {
  color: var(--color-navy-900);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.lro-link {
  color: var(--color-blue-700);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.lro-primary-button {
  min-height: 44px;
  padding: 0 18px;
  border: 0;
  border-radius: 8px;
  background: var(--color-blue-600);
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background 120ms ease;
}

.lro-primary-button:hover {
  background: var(--color-blue-700);
}

.lro-primary-button:focus-visible {
  outline: 3px solid rgba(30, 99, 255, 0.28);
  outline-offset: 2px;
}
```

---

## 30. Leitprinzip

**Das Design soll dem Recht dienen, nicht mit ihm konkurrieren.**

Die Oberfläche ist dann gelungen, wenn Nutzer schnell erkennen:

- Wo bin ich?
- Welche Norm sehe ich?
- Für welches Land gilt sie?
- Welche Fassung ist ausgewählt?
- Ist sie aktuell gültig?
- Wie finde ich einen bestimmten Paragraphen?
- Wie komme ich zu verwandten Normen oder früheren Fassungen?

Alles andere ist nachgeordnet.
