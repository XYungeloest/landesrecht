# Plan: vollständiger Ausgangsimport RECHT.NRW → Land Westdeutschland (LRGV und LRMB)

Status: Plan, nicht ausgeführt. Voraussetzungen erfüllt: gehärteter LRGV-Importpfad mit validiertem
Korpus (`docs/RECHT_NRW_IMPORT.md`), LRMB-Importpfad mit validiertem Korpus
(`docs/RECHT_NRW_LRMB_IMPORT.md`), gemeinsames Manifest, Review-Queue und Coverage-Report. Umfang nach
`docs/LEGAL_SCOPE.md`: alle am 2023-12-01 geltenden Gesetze, Rechtsverordnungen und landesweiten
Verwaltungsvorschriften des Landes Nordrhein-Westfalen, je Stammnorm genau eine Simulationsfassung
`2023-12-01`.

```text
Phase A  LRGV  (Gesetze, Rechtsverordnungen)          → Audit A
Phase B  LRMB  (Verwaltungsvorschriften)              → Audit B
Gemeinsames Audit (Slugs, Verweise, Coverage, Suche)  → Freigabe des West-Bestands
```

## Gemeinsame Grundlagen

| Thema | Regel |
| --- | --- |
| Identität | `term:<id>` (Taxonomie-Term) für beide Bereiche; Manifest-Schlüssel; Dubletten über Term, nicht über URL oder Titel. |
| Enumeration | Getrennt je Bereich in `data/imports/recht-nrw/enumeration-<area>.json` (Term, Einstiegs-URL, Portaltyp, Status `pending\|done\|failed\|review\|excluded`). Fortsetzungspunkt für `--resume`. |
| Deduplizierung | Mehrere Adressen je Term werden zusammengeführt (Sitemap-Gruppe über Slug-Stamm, bestätigt durch den Term der ersten abgerufenen Seite). Ein Term, der in beiden Bereichen auftaucht, ist ein Review-Fall (`metadata-conflict`). |
| Rate Limiting | Ein sequenzieller Fetcher für beide Phasen, Mindestabstand 1–2 s, Timeout 20 s, Backoff bei 5xx/429, Abbruch nach n aufeinanderfolgenden `rate-limited`/`forbidden`, Tagesbudget (z. B. 3 000 Abrufe). Keine Umgehung von Zugriffsbeschränkungen. |
| Checkpoints | Manifest und Review-Queue nach jeder Stammnorm atomar fortschreiben (Temp-Datei + Umbenennen); Content erst nach bestandener Validierung – es gibt keine halben Normen. `--limit n`, `--only <term>`, `--resume`, `--refresh`. |
| Cache | `.cache/recht-nrw/` (SHA-256-geprüft) macht Wiederholungsläufe netzfrei; Regeneration nach Parser- oder Transformerwechsel ohne Netz. |
| Review-Queue | Eine Queue für beide Bereiche, Kategorien nach `common/review-queue.ts`; Fälle verschwinden nie; Entscheidungen bleiben beim Reimport erhalten. |
| R2 | Rohquellen nach `landesrecht-quellen` unter `west/recht-nrw/2023-12-01/term-<id>/<sha256[0..16]>-<rolle>.<ext>`, Quellenreferenz `availability: r2-archived` mit `objectKey`, `sha256`, `url`, `retrievedAt`. Rückleseprüfung; Objekte mit abweichendem Hash werden nie überschrieben. Im Repository bleiben nur Manifest, Queue, Reports und Rezepte; die Beispielkorpora unter `sources/recht-nrw/` sind die einzige Ausnahme. |
| Manifest | Ein Manifest (Schema 2) für beide Bereiche; bei mehreren Tausend Einträgen Aufteilung in `manifest-lrgv.json`/`manifest-lrmb.json` mit gleichem Schema erwägen. |
| D1 | Vollprojektion `npm run d1:seed:local`, `npm run d1:schema:check`; Remote-Pläne `npm run d1:apply:remote` (manuell nach Prüfung). Ab einigen Tausend Normen inkrementelle Projektion aus `git diff` (OstRecht-Muster). |
| Suche | Nach jeder Phase: FTS5-Integrität, Stichproben für Titel, Abkürzung, Strukturadresse (§, Artikel), Nummernanker (LRMB) und Typfilter („Verwaltungsvorschrift“ umfasst alle Arten). |
| Qualitätsmetriken | Je Lauf: Integritätsfehler, Prüfung nach Transformation fehlgeschlagen, manuelle Entscheidungen je Kategorie, Anteil `imported-with-warnings`, Review-Fälle je Kategorie, Rekonstruktionen, Laufzeit, Netzabrufe. |
| Coverage | `npm run import:recht-nrw:coverage -- --write` mit Enumerationszahlen (`scope: bulk`): LRGV enumeriert / am Stichtag / importiert / Review / nicht verfügbar / ausgeschlossen; LRMB enumeriert / normativ / am Stichtag / direkt / rekonstruiert / Review / ausgeschlossen. |

## Phase A – LRGV

1. **Enumeration:** Sitemaps (`/sitemap.xml`, 36 Teilsitemaps; 3 205 `lrgv/gesetz`- und 5 844
   `lrgv/rechtsverordnung`-Fassungsseiten) plus Suchindex (`state_law_and_regulations`: 1 009 Gesetze,
   2 234 Rechtsverordnungen als Stammnormen mit aktuellster Fassung). Abgleich über den Term.
2. **Filter:** nur `gesetz` und `rechtsverordnung`; `lrgv/bekanntmachung` bleibt außen vor (Belege für
   Inkrafttreten von Staatsverträgen, `docs/LEGAL_SCOPE.md`).
3. **Stichtagsfassung:** lokale Stichtagsauswahl je Stammnorm; historische Befunde sind Warnungen.
   Erwartet: 2 Seiten + Textdatei (Legacy) + Anlagen je Stammnorm, ≈ 7 000 Abrufe.
4. **Review-Schwerpunkte:** `version-selection` (lokale Lücken/Überlappungen, nicht darstellbare
   Stichtagsfassung), `text-integrity`, `unknown-structure`, `attachment` (PDF), `institution-mapping`
   (nicht blockierend).
5. **Audit A:** `import:recht-nrw:audit`, `content:check`, `d1:schema:check`, `test`, Stichproben je
   Sachgebiet, Determinismus-Lauf aus dem Cache (byteidentisch bis auf Zeitstempel).

## Phase B – LRMB

1. **Enumeration:** Sitemaps (4 747 `lrmb/verwaltungsvorschrift`: 785 datiert, 3 962 undatiert;
   1 563 `lrmb/bekanntmachung`) plus Suchindex (`state_law_ministerial_gazette`: 4 770 VwV).
   `field_effective_from`, `field_outforce_date` und `field_historically` dienen nur der Priorisierung
   und Querprüfung, nie als alleiniger Beleg.
2. **Vorfilter ohne Abruf:** Titelregeln der Normativität (Ausschlussgründe) auf die Enumeration
   anwenden; ausgeschlossene Titel werden mit Grund im Manifest geführt, ohne Seitenabruf nur, wenn der
   Titel eindeutig ist – sonst Abruf und Entscheidung auf der Seite.
3. **Je Dokument:** Einstiegsseite, jüngste Fassung, gewählte Fassung, Ministerialblatt-Einträge der
   eingearbeiteten Änderungen (mit Kandidaten `-0/-1`), Anlagen der übernommenen Dokumente.
   Größenordnung ≈ 3–6 Abrufe je datierter VwV.
4. **Ministerialblatt-Index:** Ausgabenseiten `/mblnrw/<Jahr>-<Nr>` (≈ 50 je Jahr) einmalig je Jahr
   laden und als Index versionieren (Titel, Seite, Adresse, Veröffentlichungsdatum). Nutzen: Auflösung von
   Seitenkollisionen ohne Probierabrufe und Querprüfung, dass keine Änderung außerhalb des
   Fundstellenverlaufs übersehen wurde (Befund, nie alleiniger Beleg).
5. **Undatierte Altdatensätze:** Ohne Änderung nach dem Stichtag ist die Geltung nicht belegbar.
   Vorgehen: erst die Teilmenge mit Fundstellenverlauf und Änderungen nach 2023 importieren, die übrigen
   als `historical-gap` sammeln; eine redaktionelle Entscheidung zur Nutzung von `field_historically`
   (nach Stichprobenprüfung) steht aus.
6. **Rekonstruktionen:** `reconstruction-required` sammelt die Queue; Rezepte entstehen nur einzeln mit
   Prüfung (Priorität nach Bedeutung der Vorschrift). Kein automatischer Rezeptgenerator ohne Prüfschritt.
7. **Review-Schwerpunkte:** `normativity`, `historical-gap`, `reconstruction-required`,
   `reconstruction-uncertain`, `attachment` (PDF-only-Vorschriften wie VV zur LHO), `metadata-conflict`.
8. **Audit B:** wie Audit A, zusätzlich Rekonstruktionsprüfung (Fingerabdrücke, Quellen-Hashes) und
   Stichproben der Stichtagsbelege.

Erwartung aus dem Beispielkorpus (15 Dokumente): 8 übernommen (davon 1 rekonstruiert), 2 nicht am
Stichtag, 4 Review, 1 ausgeschlossen. Im Bulk ist der Review-Anteil wegen der undatierten Altdatensätze
deutlich höher.

## Gemeinsames Audit

- Slug-Kollisionen über beide Bereiche (gleicher Slug, andere Term-ID) und gleiche Kurzbezeichnungen.
- Coverage-Report mit Enumerationszahlen; Abgleich Manifest ↔ Enumeration ↔ `content/norms/west/`.
- Suche: Typfilter, Nummernanker, Strukturadressen; Stichproben „Gesetz + zugehörige VwV“ (z. B.
  Landesreisekostengesetz und VVzLRKG).
- Review-Queue: keine offenen blockierenden Fälle bei übernommenen Normen; offene Fälle dokumentiert.
- Wiederholungslauf aus dem Cache ohne inhaltliche Abweichung.

## Blocker vor dem vollständigen West-Import

1. **Bulk-Werkzeuge fehlen:** Enumeration je Bereich, `--resume/--limit/--only`, atomare Checkpoints,
   Tagesbudget, R2-Archivierung (bisher nur versionierte Beispielquellen).
2. **Institutionen:** 178 manuelle Entscheidungen allein im Beispielbestand (Ministerien, Behörden,
   Kommunen, Regionen). Nicht blockierend für den Text, aber eine redaktionelle Zuordnungstabelle
   (West-Ressortzuschnitt) ist nötig, bevor Organe übergeleitet werden.
3. **Restformen der Landesbezeichnung:** z. B. „VwVfG. NRW.“ oder „…gesetz NRW.“ am Satzende bleiben
   unverändert (dokumentiert); eine sichere Regel braucht eine Entscheidung.
4. **LRMB-Altbestand:** Entscheidung zu undatierten SMBl-Datensätzen und zu `field_historically`.
5. **PDF-only-Vorschriften und PDF-Anlagen:** Entscheidung, ob PDF-Texte transkribiert werden.
6. **Rekonstruktionsaufwand:** Rezepte sind Einzelarbeit; Priorisierung und Kapazität festlegen.
7. **D1-Größe:** inkrementelle Projektion vor dem Remote-Einspielen mehrerer Tausend Normen.
8. **Bundesrechtsverweise:** noch nicht verlinkt (`docs/RECHT_NRW_IMPORT.md`, Abschnitt 9).
