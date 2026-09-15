# Rechtsbestand des Portals (Legal Scope)

Verbindliche Regel für alle vier Länder (West, NSH, Ost, BayWü) und alle Importer. Der Importer setzt
sie technisch um (Normativitätsfilter, Review-Queue); im Zweifel gilt dieses Dokument.

## Grundsatz

Das Portal enthält den **möglichst vollständigen landesweiten Rechtsbestand** jedes Landes zum
Ausgangsrechtsstand (`SIMULATION_BASELINE_DATE`, 1. Dezember 2023) – nicht nur Gesetze und
Rechtsverordnungen, sondern auch die landesweit geltenden Verwaltungsvorschriften. Vorbild ist
OstRecht (`../staatsregierung`), das Verwaltungsvorschriften bereits als Teil des Landesrechts führt.

## Aufzunehmen

| Art | Kanonischer Typ (`NORM_TYPES`) |
| --- | --- |
| Landesverfassung | `verfassung` |
| Gesetze | `gesetz` |
| Rechtsverordnungen | `verordnung` |
| Staatsverträge und Zustimmungsgesetze (siehe unten) | `zustimmungsgesetz`, `staatsvertrag` |
| Landesweit geltende Verwaltungsvorschriften | `verwaltungsvorschrift` |
| Allgemeine Verwaltungsvorschriften (zu einem Gesetz) | `allgemeine-verwaltungsvorschrift` |
| Runderlasse mit allgemeiner Wirkung | `runderlass` |
| Normative Richtlinien, Förderrichtlinien, Vergabe- und Beurteilungsrichtlinien | `richtlinie`, `foerderrichtlinie` |
| Durchführungserlasse | `durchfuehrungserlass` |
| Anlagen und Tabellen einer aufgenommenen Vorschrift | Bestandteil der Vorschrift (`annex`, `table`) |
| Sonstige abstrakt-generelle, landesweit geltende Regelungen | passender Typ, sonst `verwaltungsvorschrift` |

Kriterien für die Aufnahme: abstrakt-generell (unbestimmter Adressatenkreis oder alle Behörden eines
Bereichs), landesweit, verbindlich (Außenwirkung oder Bindung der Verwaltung), amtlich veröffentlicht.

## Nicht aufzunehmen

- Einzelfallentscheidungen: Genehmigungen, Plangenehmigungen, Planfeststellungen, Verleihungen,
  Anerkennungen (z. B. als Erholungsort), Zulassungen einzelner Stellen.
- Personalnachrichten, Ernennungen, Stellenanzeigen, Ausschreibungen.
- Reine Tatsachenbekanntmachungen: Sitzungen, Tagesordnungen, Wahlergebnisse, Termine.
- Presse- und Informationsmitteilungen.
- Kommunales Ortsrecht und autonome Satzungen von Körperschaften (Kammern, Landschaftsverbände,
  Versorgungswerke, Hochschulen).
- Interne Einzelweisungen ohne allgemeine Wirkung.
- Gerichtsentscheidungen.
- Verkündungs- und Ministerialblätter als bloße Sammlung; Berichtigungen als eigenes Dokument (sie
  werden an der berichtigten Vorschrift berücksichtigt).

## Grenzfälle

Die Entscheidung lautet `include`, `exclude` oder `review`. Ausschlussgründe gehen vor, danach
Prüffälle; aufgenommen wird nur bei eindeutigem Vorschriftencharakter. **Zweifelhafte Dokumente werden
nie automatisch zu Landesrecht erklärt** – sie landen in der Review-Queue (`normativity`).

Prüffälle sind insbesondere: Hinweise, Empfehlungen, Merkblätter, Leitfäden, Muster und Vordrucke,
Kopferlasse (Regelungsgehalt im bekanntgemachten Dokument), Preis- und Ehrungsregelungen,
Bekanntmachungen ohne erkennbaren Regelungsgehalt, Vorschriften, deren Text nur als PDF-Anlage vorliegt.

## Zeitlicher Umfang

- Aufgenommen wird nur, was **am Stichtag nachweislich galt** (Belegpflicht, siehe
  `docs/RECHT_NRW_LRMB_IMPORT.md` für Verwaltungsvorschriften). Fehlende Belege führen zu Review, nicht
  zu einer Annahme.
- Übernommen wird genau die Stichtagsfassung als `versions/2023-12-01.json`. Die reale Historie
  (Fassungen, Änderungen, Fundstellen) steht in Manifest, Quellenreferenzen, Rekonstruktionsdaten und
  Audit – nie als Simulationsfassung.
- **Nach dem Stichtag gilt Simulationsrecht:** Spätere reale Änderungen des Herkunftslandes werden nicht
  übernommen. Neue Fassungen entstehen ausschließlich durch die Simulation. Das gilt für alle vier Länder.

## Staatsverträge

Befund RECHT.NRW (Stand der Recherche, September 2026):

- Staatsverträge erscheinen im Bereich LRGV als Zustimmungsgesetz („Gesetz zum Staatsvertrag …“,
  Dokumentart `gesetz`, § 1 „Dem … Staatsvertrag wird zugestimmt“). Der Vertragstext ist häufig nur als
  PDF-Anlage beigefügt („Anlage 1a zum Staatsvertrag“).
- Bekanntmachungen über das Inkrafttreten stehen unter `lrgv/bekanntmachung`. Sie sind keine eigene
  Vorschrift, aber Beleg für das Inkrafttreten des Vertrags.

Regel:

1. Das Zustimmungsgesetz wird als Gesetz übernommen (kanonischer Typ `gesetz`; `zustimmungsgesetz`, sobald
   der Importer Zustimmungsgesetze sicher erkennt).
2. Der Vertragstext gehört als Anlage zum Zustimmungsgesetz. Liegt er als HTML vor, wird er als Anlage
   übernommen; liegt er nur als PDF vor, wird er als Quelle registriert und als Review-Fall
   `attachment` geführt.
3. Ein eigener Normtyp `staatsvertrag` wird nur für Vertragstexte verwendet, die das Portal als
   eigenständiges Dokument veröffentlicht. Ein neuer Dokumenttyp ist dafür nicht nötig.
4. Die Transformation behandelt die Vertragsparteien als externe Bezeichnungen: andere Länder und der
   Bund werden nicht übergeleitet; nur die Bezeichnung des Herkunftslandes folgt den
   Überleitungsregeln (Review `institution-mapping`, wo das nicht eindeutig ist).

## Quellen je Land

| Land | Quelle | Bereiche |
| --- | --- | --- |
| West | RECHT.NRW | LRGV (Gesetze, Rechtsverordnungen) und LRMB (Verwaltungsvorschriften aus dem Ministerialblatt), gemeinsames Manifest |
| NSH | juris Schleswig-Holstein | Gesetze, Verordnungen und Verwaltungsvorschriften (Importer vorbereitet) |
| Ost | OstRecht | übernimmt den OstRecht-Bestand einschließlich Verwaltungsvorschriften |
| BayWü | BAYERN.RECHT | Gesetze, Verordnungen und Verwaltungsvorschriften (Importer vorbereitet) |

## Umsetzung

- Normativitätsfilter: `packages/importers/recht-nrw/src/lrmb/classify.ts` (Tests:
  `tests/unit/recht-nrw-lrmb.test.ts`).
- Review-Queue mit Kategorie `normativity`: `data/imports/recht-nrw/review-queue.json`.
- Such- und Seitenfilter: „Verwaltungsvorschrift“ umfasst alle Arten
  (`ADMINISTRATIVE_REGULATION_TYPES`, `expandNormTypeFilter`).
