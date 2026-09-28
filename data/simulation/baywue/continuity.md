# Kontinuität Freistaat Süddeutschland → Freistaat Bayern-Württemberg

Ergebnis der Quellenprüfung vom 2026-09-28 (`data/simulation/baywue/sources.json`). Frage: Sind das
„Gesetzes- und Verordnungsblatt des Freistaates Süddeutschland“ (2024) und die späteren Ausgaben des
Freistaates Bayern-Württemberg Verkündungsblätter desselben Sim-Landes (heutige Jurisdiktion `baywue`)?

**Befund: Die rechtliche Kontinuität ist belegt.** Dasselbe Gemeinwesen mit denselben Organen tritt ab
Januar 2025 unter dem Namen Bayern-Württemberg auf; seine Rechtsakte bauen ausdrücklich auf dem
übergeleiteten bayerischen Baseline-Recht und auf dem Süd-Recht auf; Süd-Bezeichnungen laufen 2025 und
2026 als Synonyme weiter. **Nicht belegt** ist der formale Umbenennungsakt: Er liegt aller Wahrscheinlichkeit
nach in der „Verfassung des Freistaates Bayern-Württemberg in der Fassung der Bekanntmachung vom
12. Januar 2025“, die im Archiv fehlt. Folgen für den Bestand: heutige Jurisdiktion `baywue`; historische
Blattbezeichnung und Regime bleiben in der Provenienz (`gazette: "GVBl. Süd"`, `seriesTitle`, `regime`);
Normtexte werden nicht rückwirkend umbenannt; spätere Rechtsakte dürfen auf Süd-Normen aufbauen.

## Chronologie (Hashes = SHA-256-Präfix im Inventar)

| Datum | Quelle | Bezeichnung des Landes / Organe | Beleg |
| --- | --- | --- | --- |
| 2024-05-07 | `7a20ec7b6142` Mitteilung des Ministerpräsidenten Liam von Starnberg | „Süddeutscher Freistaat“; Hymnentext „Württemberg, Bayern, Hand in Hand … Unser Süddeutschland“ | Das Sim-Land versteht sich schon 2024 als Vereinigung von Bayern und Württemberg; die Mitteilung ändert die **bayerische** Bekanntmachung vom 18. Juli 1980 (Az. BI 1-14700-30, StAnz. Nr. 29 = `bayernhymne-baywue`) – das Süd-Recht setzt auf dem übergeleiteten Baseline-Recht auf. |
| 2024-06-29 | `f0f06946c7e2` Trauerbeflaggungsverordnung | „Freistaat Süddeutschland“, Ausfertigung in München | Ausfertigungsort München wie die späteren BayWü-Akte. |
| 2024-08-16 | `259b9949f41e` SüdGrenzVer (Geschäftszahl 24-StMISIKA-02-V-02) | „Die Süddeutsche Staatsregierung“, Staatsminister des Innern, für Sport, Integration und für kommunale Angelegenheiten | Rechtsgrundlagen „§ 11 Abs. 2 PolG SÜD“ usw. werden ausdrücklich den bayerischen Vorschriften (PAG, BayVSG) gleichgesetzt. Geschäftszahlensystem `JJ-Ressort-Nr-Typ-Nr` wird 2025/2026 unverändert fortgeführt (25-MP-04-V-01, 26-StIH-07-V-01). |
| 2024-08-22 | `f6c26c824903` Mitteilung der Ministerpräsidentin Jerina Viktoria Murzako | Ministerpräsidentin des Freistaates Süddeutschland | Regierungschefin des „Staatskabinetts Murzako“ (Kopfvermerk des Süd-Blattes). |
| 2024-09-16 | `f77e2cb76c37` **GVBl. Süd 2024 Nr. 1** | „Gesetzes- und Verordnungsblatt Des Freistaates Süddeutschland – Staatskabinett Murzako“, ausgegeben zu München; Herausgeber Staatsministerium der Justiz und für Verbraucherschutz, Prielmayerstraße 7, 80335 München | Gesetze für das „Land Süddeutschland“; „Gesetz zur Änderung des Süddeutschen Abgeordnetengesetzes“ ändert Artikel 6 und 7 eines Abgeordnetengesetzes mit bayerischer Artikelstruktur (BayAbgG). |
| 2024-10-04 | `97a82a9fdb01` Mitteilung Murzako | „Süddeutscher Freistaat“ | letzte Süd-Quelle. |
| 2025-01-12 | – (nicht im Archiv) | „Verfassung des Freistaates Bayern-Württemberg in der Fassung der Bekanntmachung vom 12. Januar 2025“ | Zitiert in `808c468edf51`/`255405100a67` (StRGVV, Eingangsformel), `b5b3f67be559`/`f24b1dab46f2` (StRGO), `cc0a376d5d46` (PflFächPuGWV), in fünf Verfassungsänderungen 2026 und in der Mitteilung vom 13. April 2025 („Artikel 49 Absatz 1 der Staatsverfassung“). `docs/SIM_LAW_PROGRESSION.md` 6.1 nennt eine Datei „Staatsverfassung Bayern-Württembergs, Süddeutscher Landtag, ausgefertigt 12.01.2025“ außerhalb des Archivs – der Süddeutsche Landtag hat die BayWü-Verfassung erlassen. **Lücke Q2.** |
| 2025-01-22…26 | `23e49be2d40c`, `25e6c4a2cc63`, `e2afaea2bb83`, `2492c29798b2` Schulverordnungen | „Bayern-Württemberg“, „Freistaat Bayern-Württemberg“, Staatsminister für Unterricht und Kultus | Erste archivierte Akte unter dem neuen Namen; Rechtsgrundlage weiterhin „BayEUG Artikel 89“. |
| 2025-01-25 | `a6aee1af2cee` Wolfsverordnung | „Bayerisch-Württembergische Staatsregierung“, Ministerpräsident Christian Lehrmann | |
| 2025-01-30 | `fcdbe54e7a38` **GVBl. BayWü 2025 Nr. 1** | „Gesetzes- und Verordnungsblatt des Freistaates Bayern-Württemberg – Staatskabinett Lehrmann“; **derselbe Herausgeber, dieselbe Anschrift, dasselbe Layout** (Bundesanzeiger-Fußzeile) wie GVBl. Süd 2024 Nr. 1 | Der Normtext (SchuSprG) verpflichtet „die Schulen im Freistaat Süddeutschland“. |
| 2025-02-13 | `36e12b008ae2` Erlass zur Wahrung der Bayern-Württembergischen Integrität | Kopf „Süddeutscher Landtag – 4. Wahlperiode“; Inhalt „Landespolizei Bayern-Württemberg“, „Polizei Bayern-Württemberg“; Grundlage POG vom 10. August 1976 | Landtag und Wahlperiode laufen unter dem alten Namen weiter. |
| 2025-02-14 | `3e7165f11948` SchUnVer 25-MP-04-V-01 | „Ministerpräsident Des Freistaats Bayern-Württemberg“; Text: „An Süddeutschen Gymnasien“, „Süddeutsches Gesetz über das Unterrichts- und Erziehungswesen“ | ändert die bayerische GSO (BayRS 2235-1-1-1-K). |
| 2025-03-11 | `ee6581180626` Grenzschutz-Erlass | „Die Innenministerin – 4. Wahlperiode 04/05“, Landespolizei, POG | |
| 2025-03-12 | `706185d0d69e` **GVBl. BayWü 2025 Nr. 2** | „Staatskabinett Lehrmann II“, Herausgeber nun Innenministerium (gleiche Anschrift) | BayWueLEXG ändert das „Gesetz über die Organisation der Bayerischen Polizei … vom 10. August 1976 (BayRS 2012-2-1-I)“; HBG nennt „Süddeutschland“ und „Bayerisch-Württembergischen Freistaat“ nebeneinander; SzFdPBbJG: Sitz Stuttgart, Ausstellung „innerhalb Süddeutschlands“, Zuwendungen der „Großbezirke Baden-Württemberg und Bayern“. |
| 2025-04-13 | `a6b93967804d` Mitteilung der Ministerpräsidentin Manuela Dreyer | „Artikel 49 Absatz 1 der Staatsverfassung“ | Regierungswechsel Lehrmann → Dreyer. |
| 2025-04-13/29 | `808c468edf51`, `255405100a67` **StRGVV / GVBl. BayWü Nr. 03/2025** | „Bayern-Württembergische Staatsregierung“; Eingangsformel der Gesetze: „**Der Süddeutsche Landtag** hat das folgende Gesetz beschlossen“; SDG Art. 4 Abs. 3: „Der Süddeutsche Freistaat“; Dezentralisierungsgesetz: „innerhalb der Gebiete des süddeutschen Freistaats“ | **Kernbeleg der Kontinuität:** StRGVV § 12 „setzt damit die Verordnung über die Geschäftsverteilung der Bayern-Württembergischen Staatsregierung vom 28. Januar 2014 (GVBl.S.31 BayWü) außer Kraft“ – das ist die übergeleitete bayerische StRGVV (`strgvv-baywue`, GVBl. 2014 S. 31). Das Sim-Land behandelt das Baseline-Recht als eigenes früheres Recht und den Süddeutschen Landtag als sein Gesetzgebungsorgan. |
| 2026-04-05 | `b5b3f67be559`, `a1487f499833` StRGO / EGVBWStReg (Marcus För) | „Staatsverfassung für Bayern-Württemberg in der Fassung vom 12. Januar 2025“ | |
| 2026-05-29 | `f24b1dab46f2` **GVBl. BayWü 2026 Nr. 1** | „Gesetz- und Verordnungsblatt für den Freistaat Bayern-Württemberg“, **ausgegeben zu Stuttgart** | Verfassungsänderungen zur „Verfassung des Freistaats Bayern-Württemberg vom 12. Januar 2025“; Änderungsgesetze zitieren bayerische Baseline-Normen mit BayRS-Nummern (BayEUG 2230-1-1-K, BayGVFG, BayFAG vom 16. April 2013). |
| 2026-06-05 | `18fcd6211fae` Ordensbekanntmachung | „Rainer-Winkler-Orden des Freistaates **Süddeutschland**“, „Süddeutsches Amtsblatt“, „Rautenmuster des Freistaates Süddeutschland“, ausgegeben zu Stuttgart | Süd-Bezeichnung noch 2026 als Synonym in Gebrauch. |
| 2026-06-26 | `2bd855c18d72` **GVBl. BayWü 2026 Nr. 2** | Gesetz zur Sicherstellung der Handlungsfähigkeit: Sitz von Landtag und Staatsregierung „bis zur Wiederherstellung … der Münchner Parlaments-, Regierungs- und Verwaltungsgebäude nach Stuttgart verlegt“; Verfassungsänderung Art. 24 Abs. 3: „Die Hauptstadt ist München“ | Erklärt den Wechsel des Ausgabeorts (Erdbeben vom 13. Mai 2026, `a4663eda9215`). |
| 2026-08-29/30 | `8805a09ed574`, `1afba1806d0b` GVBl. BayWü 2026 Nr. 3 und 4 | wie Nr. 1/2 | |

## Organe und Regierungen

| Zeitraum (belegt) | Regierungschef | Bezeichnung | Quellen |
| --- | --- | --- | --- |
| bis 2024-05-07 | Liam von Starnberg, „Der Ministerpräsident“ | Süddeutscher Freistaat | `7a20ec7b6142` |
| 2024-08-22 … 2024-10-04 | Jerina Viktoria Murzako, „Die Ministerpräsidentin“ (Staatskabinett Murzako) | Freistaat Süddeutschland | `f6c26c824903`, `f77e2cb76c37`, `97a82a9fdb01` |
| 2025-01-25 … 2025-03-16 | Christian Lehrmann, Ministerpräsident (Staatskabinett Lehrmann, Lehrmann II) | Freistaat Bayern-Württemberg | `a6aee1af2cee`, `fcdbe54e7a38`, `3e7165f11948`, `ac829b7a637d`, `706185d0d69e`, `f20493427726` |
| 2025-04-13 … 2025-04-29 | Manuela Dreyer, Die Ministerpräsidentin | Freistaat Bayern-Württemberg | `a6b93967804d`, `808c468edf51`, `255405100a67` |
| 2026-04-05 … 2026-08-30 | Marcus För, Der Ministerpräsident (zugleich Staatsminister für Bildung, Forschung, Jugend und Familie; zeitweise Inneres und Heimatschutz) | Freistaat Bayern-Württemberg | `b5b3f67be559` … `1afba1806d0b` |

Der Landtag heißt in den Quellen durchgehend „Süddeutscher Landtag“ (Kopf der Erlasse 2025, Eingangsformel
GVBl. Nr. 03/2025); ab 2026 fehlen Eingangsformeln, nur der Entwurf `a4663eda9215` spricht vom
„Bayern-Württembergischen Landtag“. Ministerien wechseln Namen und Zuschnitt mit jeder Regierung
(Organisationserlasse `ac829b7a637d`, `f20493427726`; StRGVV 2025 mit acht, EGVBWStReg 2026 mit sieben
Staatsministerien).

## Serien und Zählung

| Serie (wie gedruckt) | Kürzel | Ausgaben | Ort | Zählung |
| --- | --- | --- | --- | --- |
| Gesetzes- und Verordnungsblatt Des Freistaates Süddeutschland | GVBl. Süd | 2024 Nr. 1 (16.09.2024) | München | eigener Jahrgang 2024; keine weitere Ausgabe bekannt |
| Gesetzes- und Verordnungsblatt des Freistaates Bayern-Württemberg | GVBl. BayWü | 2025 Nr. 1 (30.01.), Nr. 2 (12.03.), Nr. 03/2025 (29.04.) | München | fortlaufend 1–3; Nr. 03/2025 im neuen Layout („Bayern-Württembergisches Gesetzes- und Verordnungsblatt“) |
| Gesetz- und Verordnungsblatt für den Freistaat Bayern-Württemberg | GVBl. BayWü | 2026 Nr. 1 (29.05.), Nr. 2 (26.06.), Nr. 3 (29.08./12.07.), Nr. 4 (30.08.) | Stuttgart | Kopfzeile „GVBl. 0n/26“ |

Keine Nummernkollision; die Slugs tragen Datum (`gvbl-sued-2024-1-20240916`, `gvbl-baywue-2025-3-20250429`
für „Nr. 03/2025“). Zwischen dem 29. April 2025 und dem 29. Mai 2026 ist keine Ausgabe archiviert, obwohl
Akte aus diesem Zeitraum zitiert werden (`data/simulation/baywue/completeness.json`).

## Was daraus folgt

- Süd-Akte aus GVBl. Süd 2024 Nr. 1 werden als Normen der Jurisdiktion `baywue` mit Verkündung
  `gvbl-sued-2024-1-20240916` erfasst (`gazette: "GVBl. Süd"`, `regime` mit Vorgängerbezeichnung); ihr Wortlaut
  („Land Süddeutschland“, „süddeutsche Bevölkerung“) bleibt unverändert.
- Süd-Änderungsakte zielen auf das übergeleitete Baseline-Recht (Abgeordnetengesetz, Bayernhymne); sie sind
  Ereignisse derselben Rechtsordnung, blockiert bzw. im Review nur aus Bestands- oder Formgründen.
- Die Sim-Verfassung vom 12. Januar 2025 ist die zentrale fehlende Quelle: Sie trägt vermutlich die Umbenennung
  und ist Zielnorm von fünf verkündeten Änderungsgesetzen (alle `blocked`). Ihr Verhältnis zur übernommenen
  Verfassung (`verfassung-des-freistaates-bayern-wuerttemberg`) ist offen (E6); die AGO-Verordnungen 2026
  zitieren als Grundlage weiterhin die Verfassung „in der Fassung der Bekanntmachung vom 15. Dezember 1998“.
