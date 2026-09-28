# BayWü: Verfassungsidentität – Decision Report (Stand 2026-09-28)

Frage: Sind die „Verfassung des Freistaates Bayern-Württemberg vom 12. Januar 2025“ (Sim) und die Baseline-Verfassung
dieselbe Norm (`same norm`, Änderungen konsolidierbar) oder ersetzt die Sim-Verfassung die Baseline (`replaces`)?
Dieser Bericht sammelt nur Belege; er trifft keine Entscheidung. Bis zur Entscheidung bleiben die fünf Änderungsakte
`blocked` (`reasonCode: missing-source`), ohne erfundene Überleitung.

## 1 Baseline-Verfassung (im Bestand)

- Slug `verfassung-des-freistaates-bayern-wuerttemberg`, Titel „Verfassung des Freistaates Bayern-Württemberg in der
  Fassung der Bekanntmachung vom 15. Dezember 1998“ – die reale Bayerische Verfassung (BV) zum 2023-12-01 mit
  Namensübertragung; Status `in-force`, keine Sim-Fassung.
- Artikelfolge der BV: Art. 24 Zitierrecht, Art. 26 Ausschüsse, Art. 28 Immunität, Art. 38 (aufgehoben, Senat),
  Art. 44 Wahl des Ministerpräsidenten, Art. 45 Berufung der Staatsminister, Art. 46 Stellvertreter, Art. 47 Vorsitz,
  Art. 49 Geschäftsbereiche, Art. 54 Beschlüsse der Staatsregierung, Art. 55 Geschäftsführung, Art. 59 Ministeranklage,
  Art. 60 Verfassungsgerichtshof, Art. 64 Verfassungsstreitigkeiten.

## 2 Süddeutschland-Verfassung

- Keine Quelle im Archiv nennt eine eigene Verfassung des Freistaates Süddeutschland. Die Süd-Akte 2024 (GVBl. Süd 2024
  Nr. 1, Mitteilungen, Einzelverordnungen) zitieren nur Fachgesetze; die Kontinuität Süd → BayWü ist inhaltlich belegt
  (`continuity.md`), ein Verfassungsakt fehlt.

## 3 Bayern-Württemberg-Verfassung vom 12. Januar 2025 (nicht im Archiv)

Zitiert als: „Verfassung des Freistaates Bayern-Württemberg in der Fassung der Bekanntmachung vom 12. Januar 2025“
(StRGVV 2025, `808c468edf51`/`255405100a67`), „Staatsverfassung für Bayern-Württemberg in der Fassung vom 12. Januar
2025“ (StRGO/EGVBWStReg 2026, `b5b3f67be559`/`a1487f499833`), „Artikel 49 Absatz 1 der Staatsverfassung“ (Mitteilung
13. April 2025, `a6b93967804d`), „Die Verfassung des Freistaats Bayern-Württemberg vom 12. Januar 2025“ (alle fünf
Änderungsgesetze). Die Formel „in der Fassung der Bekanntmachung vom …“ spricht für eine Neubekanntmachung, „vom 12.
Januar 2025“ für ein neues Gesetz; beides ohne Text.

## 4 Änderungsakte (alle verkündet, materialisiert als `one-time-act`, Wirkung blockiert)

| Akt | Verkündung | Änderungsbefehle | Verhältnis zur Baseline-Artikelfolge |
| --- | --- | --- | --- |
| Erstes Gesetz zur Änderung der Staatsverfassung | GVBl. BayWü 2026 Nr. 1 S. 9 (29.05.2026) | Art. 46, 47 neu gefasst: Wahl des Ministerpräsidenten durch den Landtag, Wahlgänge, Auflösung; Art. 54, 54a, 55 | BV: Wahl des MP = Art. 44; Art. 46/47 = Stellvertreter/Vorsitz → **Nummerierung weicht ab** |
| Zweites Gesetz zur Änderung der Staatsverfassung | GVBl. BayWü 2026 Nr. 1 S. 11 (29.05.2026) | Art. 26 aufgehoben; Art. 28 neu: Wahl der Abgeordneten (Wahlalter 16); Art. 38 Abs. 1 neu: Immunität; Art. 59, 60, 64 | BV: Immunität = Art. 28, Wahl der Abgeordneten = Art. 14, Art. 38 ist aufgehoben → **weicht ab** |
| Gesetz zur Änderung der Staatsverfassung (Art. 24) | GVBl. BayWü 2026 Nr. 2 S. 9 (26.06.2026) | Art. 24 Abs. 3: Hauptstadt München, zeitweise andere Stadt | BV Art. 24 = Zitierrecht ohne Abs. 3 → **weicht ab**; Eingangsformel nennt „zuletzt geändert am 07. Mai 2026“ (fehlende Verfassungsänderung) |
| Gesetz zur Änderung der Staatsverfassung (Art. 45) | GVBl. BayWü 2026 Nr. 2 S. 6 (26.06.2026) | Art. 45 Abs. 2 Satz 3 gestrichen, Abs. 3 neu: Geschäftsbereiche durch Erlass | BV: Geschäftsbereiche = Art. 49; BV Art. 45 hat keinen Abs. 2 Satz 3 → **weicht ab** |
| Fünftes Gesetz zur Änderung der Staatsverfassung | GVBl. BayWü 2026 Nr. 3 S. 4 (12.07.2026) | Art. 46 um Absatz ergänzt: MP ernennt und entlässt Staatsminister | BV: Berufung der Staatsminister = Art. 45 → **weicht ab**; Zählung „Fünftes“ setzt ein drittes/viertes Änderungsgesetz voraus (drittes/viertes = Art. 24/Art. 45 vom 26.06.2026 oder das Gesetz vom 07.05.2026) |

## 5 Befund

- Alle fünf Akte adressieren eine Artikelfolge, die systematisch **nicht** der Baseline-BV entspricht (Wahl des MP in
  Art. 46 statt 44, Immunität in Art. 38 statt 28, Hauptstadt in Art. 24 Abs. 3, Geschäftsbereiche in Art. 45 statt 49).
  Eine Konsolidierung in die Baseline-Verfassung wäre daher auch mit vorhandenem Text falsch: Die Zielnorm ist die
  Verfassung vom 12. Januar 2025, deren Wortlaut fehlt.
- Belege für `same norm` (Neubekanntmachung der BV mit neuer Zählung): Formel „in der Fassung der Bekanntmachung vom 12.
  Januar 2025“ (StRGVV, StRGO); Belege für `replaces` (neue Verfassung): „vom 12. Januar 2025“ in allen Änderungsgesetzen,
  abweichende Artikelfolge, neuer Staatsname. Keiner der Belege ist ohne den Verfassungstext entscheidend.
- Ausfertigungs-/Verkündungsbeleg der Verfassung vom 12. Januar 2025: keiner; Verfassungsänderung vom 07. Mai 2026:
  keine Quelle; Blattlücke 30.04.2025–28.05.2026 (`completeness.json`).

## 6 Entscheidungsbedarf (offen, menschlich)

1. Beschaffung der Verfassung vom 12. Januar 2025 (Bekanntmachung/Verkündungsblatt) und der Änderung vom 07. Mai 2026.
2. Danach Entscheidung `same norm` (neue Fassung `versions/2025-01-12.json` der Baseline-Norm, Baseline-Datei bleibt) oder
   `replaces` (neue Sim-Norm `staatsverfassung-2025-baywue`, Baseline-Verfassung `replaced-by`, Geltungsende abgeleitet).
3. Erst dann Rezepte für die fünf Änderungsakte (Reihenfolge nach Wirkdatum: 29.05., 29.05., 26.06., 26.06., 12.07.2026,
   vorher 07.05.2026).
