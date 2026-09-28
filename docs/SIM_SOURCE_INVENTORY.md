# Inventar der Sim-Rechtsquellensammlung

Erzeugt von `npm run import:simulation:inventory -- --write` am 2026-09-28 aus `imports/` (Originalarchiv unverändert; Kopien und Textauszüge unter `.cache/simulation/`, maschinenlesbar `data/simulation/source-inventory.json`).

Die Tabellen zeigen die **Vorsortierung** aus Textauszug und Dokumentkopf. Sie ist keine Rechtsentscheidung: Welche Datei ein verkündeter Rechtsakt ist, entscheidet die Evidenzprüfung je Land (`data/simulation/<land>/sources.json`). Kein Befund stammt allein aus dem Dateinamen. Dubletten sind nur hashidentische Dateien; ähnlich benannte Dateien bleiben getrennt.

## Kennzahlen

- Dateien im Archiv: **123**, davon hashidentische Dubletten 0 → **123 Quellen**
- Je Land: BayWü 39 · NSH 51 · West 33
- Medienart: application/pdf 112 · application/vnd.openxmlformats-officedocument.wordprocessingml.document 1 · text/plain 10
- Textebene: not-applicable 11 · text 112 (`none`/`sparse` = Scan oder Deckblatt, keine OCR)
- Vorsortierte Dokumentart: gazette 32 · informational 4 · legislative-document 21 · ministerial-gazette 5 · press-release 1 · promulgation-notice 2 · standalone-official-act 54 · unknown 4
- Werkzeuge: pdftotext version 26.07.0; utf-8; unzip word/document.xml

## Container-Abgleich

`imports/Archiv.zip`: 123 Einträge (ohne `__MACOSX`/`.DS_Store`). Nur im Zip: keine. Nur im Ordner: keine. Der Zip-Inhalt wird nicht gesondert inventarisiert.

## Land Westdeutschland (33 Quellen)

| Datei | SHA-256 | Typ | S. | Textebene | Titel (erkannt) | Dokumentdatum | Ausgabedatum | Organ | Blatt/Serie | Nummer | Dokumentart (vorsortiert) |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| west/24-MP-02-V-01.pdf | `b7c1a1350d83` | pdf | 2 | text | Verordnung | 2024-08-16 | – | Ministerpräsident | – | – | standalone-official-act |
| west/24-MP-02-V-02.pdf | `bc467b283bc7` | pdf | 2 | text | Verordnung | 2024-08-16 | – | Ministerpräsident | – | – | standalone-official-act |
| west/Erlass_Ausnahme_Niedrigwasser_LMFWV.pdf | `6469fa5b89c5` | pdf | 2 | text | Landesministerium der Finanzen, Wirtschaft und Verkehr | 2026-08-12 | – | – | – | – | unknown |
| west/Erlass-Der-Landesregierung_2.pdf | `d3fe7fc4d810` | pdf | 3 | text | Landtag Westdeutschland Drucksache 01/__ | 2024-02-26 | – | Ministerpräsident des Landes | Landtag Westdeutschland Drucksache 01/__ | – | legislative-document |
| west/Erlass-Landesregierung.pdf | `961816130bc7` | pdf | 1 | text | 26. März 2024 | 2024-03-26 | – | Ministerpräsident | – | – | standalone-official-act |
| west/Erlass-Sreg-Umzug.pdf | `9e744271cf75` | pdf | 2 | text | Die Landesregierung | 2026-07-31 | – | Landesregierung | – | – | standalone-official-act |
| west/Gesetz-und-Verordnungsblatt-fur-Westdeutschland-22-April-2024-Nr-3.pdf | `99b86ee678e1` | pdf | 88 | text | Gesetz- und Verordnungsblatt | 2024-04-22 | – | Ministerpräsident | Gesetz- und Verordnungsblatt | – | gazette |
| west/Gesetz-und-Verordnungsblatt-fur-Westdeutschland-NR2.pdf | `733754ca940e` | pdf | 4 | text | Gesetz- und Verordnungsblatt | 2024-04-02 | – | Ministerpräsident | Gesetz- und Verordnungsblatt | – | gazette |
| west/Gesetz-und-Verordnungsblatt-fur-Westdeutschland.pdf | `02136c0428cb` | pdf | 19 | text | Gesetz- und Verordnungsblatt | 2024-02-23 | – | Staatskanzlei des Landes | Gesetz- und Verordnungsblatt | – | gazette |
| west/Landesregierung-Verordnung-LMKG-001.pdf | `b0a0a32e714c` | pdf | 1 | text | 03. März 2024 | 2024-03-03 | – | Ministerpräsident | – | – | standalone-official-act |
| west/MBl. WD 2025 Nr. 2.pdf | `cf579176ca03` | pdf | 13 | text | Ministerialblatt | 2025-11-10 | 2025-11-10 | Landesregierung | Ministerialblatt | Nr. 2 | ministerial-gazette |
| west/MBl. WD 2025 Nr. 3.pdf | `8fb3fd044f5d` | pdf | 8 | text | Ministerialblatt | 2025-12-19 | 2025-12-19 | Landesregierung | Ministerialblatt | Nr. 3 | ministerial-gazette |
| west/MBl. WD. 2025 Nr. 1.pdf | `fa2e4ee78315` | pdf | 7 | text | Ministerialblatt | 2025-10-20 | 2025-10-20 | Landtag | Ministerialblatt | Nr. 1 | ministerial-gazette |
| west/MPOrgE 2025.pdf | `1d87e20969eb` | pdf | 3 | text | Organisationserlass der Ministerpräsidentin | 2025-09-01 | – | Ministerpräsidentin | – | – | unknown |
| west/Runderlass_Hafenbetrieb_Niedrigwasser_LMFWV.pdf | `7b46aa0dd5ca` | pdf | 2 | text | Gemeinsamer Runderlass | 1994-06-06 | – | – | – | – | standalone-official-act |
| west/Verordnung Kühlräume.pdf | `0844c6d6bda7` | pdf | 3 | text | Die Landesregierung | 2026-06-28 | – | Ministerium für Inneres | – | – | informational |
| west/Waldbrandpraventionsverordnung.pdf | `36155c506156` | pdf | 4 | text | 1. Mai 2024 | 2024-05-01 | – | Ministerpräsident | – | – | standalone-official-act |
| west/WEST-MB-3.pdf | `28f5ba7cc10f` | pdf | 5 | text | Gesetzes und Verordnungsblattes eine hoheitliche Tätigkeit ist. | – | – | Staatskanzlei des Landes Westdeutschland | Gesetzes und Verordnungsblattes eine hoheitliche T | Nr. 3 | gazette |
| west/WEST-MB-4.pdf | `fcbd0b697f17` | pdf | 5 | text | Gesetzes und Verordnungsblattes eine hoheitliche Tätigkeit ist. | 2026-09-15 | 2026-09-15 | Ministerpräsident | Gesetzes und Verordnungsblattes eine hoheitliche T | Nr. 4 | gazette |
| west/WestGBI_04-August.pdf | `ff0f085b7147` | pdf | 4 | text | Gesetzes- und Verordnungsblatt | 2024-08-16 | – | Ministerpräsident | Gesetzes- und Verordnungsblatt | Nr. 04/2024 | gazette |
| west/WestGBl_01-2025.pdf | `6593ee42acba` | pdf | 10 | text | Gesetzes- und Verordnungsblatt | 2024-12-12 | – | Landtag hat folgendes Gesetz beschlos- | Gesetzes- und Verordnungsblatt | Nr. 01/2025 | gazette |
| west/WestGBl_02-2025.pdf | `76aa0155c3c6` | pdf | 23 | text | Gesetzes- und Verordnungsblatt | 2025-03-10 | – | Landtag hat folgendes Gesetz beschlos- | Gesetzes- und Verordnungsblatt | Nr. 02/2025 | gazette |
| west/WestGBl_04-2025.pdf | `b1129180223b` | pdf | 9 | text | Gesetzes- und Verordnungsblatt | 1989-04-23 | – | Ministerium für Zielerreichung gemäß § 3. | Gesetzes- und Verordnungsblatt | Nr. 04/2025 | gazette |
| west/WestGBl_I.1.pdf | `c92907298bab` | pdf | 121 | text | Gesetzes- und Verordnungsblatt | 2024-09-30 | – | Staatskanzlei Nr. 1/2024 Düsseldorf | Gesetzes- und Verordnungsblatt | Nr. 1/2024 | gazette |
| west/WestGBl_I.2.pdf | `858b380f37cb` | pdf | 11 | text | Gesetzes- und Verordnungsblatt | 2024-11-10 | – | Ministerpräsident | Gesetzes- und Verordnungsblatt | Nr. 2/2024 | gazette |
| west/WestGVBl_03-2025-1.pdf | `dbf1d7b11533` | pdf | 3 | text | Gesetzes- und Verordnungsblatt | 2025-05-26 | – | Ministerpräsident | Gesetzes- und Verordnungsblatt | Nr. 03/2025 | gazette |
| west/WestGVBl_05-2025.pdf | `47ee5fdaa340` | pdf | 30 | text | Gesetzes und Verordnungsblatt | 2025-12-18 | – | Staatskanzlei des Landes Westdeutschland | Gesetzes und Verordnungsblatt | Nr. 05/2025 | gazette |
| west/WestGVBl-I-1-2026.pdf | `a63f8edb4c3d` | pdf | 23 | text | Gesetzes und Verordnungsblatt | 2026-05-17 | 2026-05-17 | Staatskanzlei des Landes Westdeutschland | Gesetzes und Verordnungsblatt | Nr. 1 | gazette |
| west/WestGVBl-I-2-2026 (1).pdf | `624efa2a9c5c` | pdf | 65 | text | Gesetzes und Verordnungsblatt | 2026-05-17 | 2026-05-17 | Staatskanzlei des Landes Westdeutschland | Gesetzes und Verordnungsblatt | Nr. 2 | gazette |
| west/WestGVBl-I-2026.pdf | `c7f7176c2096` | pdf | 15 | text | Gesetzes- und Verordnungsblatt | 2026-09-18 | 2026-09-18 | Staatskanzlei des Landes Westdeutschland | Gesetzes- und Verordnungsblatt | Nr. 3 | gazette |
| west/WestGVBl-I-3-2026  (1).pdf | `0f187bdf50c4` | pdf | 5 | text | Gesetzes- und Verordnungsblatt | 2026-08-26 | – | Landesregierung | Gesetzes- und Verordnungsblatt | Nr. 3 | gazette |
| west/WestGVBl-I-3-2026.pdf | `320380ce5e59` | pdf | 4 | text | Gesetzes- und Verordnungsblatt | 2026-06-29 | – | Staatskanzlei des Landes Westdeutschland | Gesetzes- und Verordnungsblatt | Nr. 3 | gazette |
| west/WestMB-I-2-2026 (1) (3) (2).pdf | `f9a4aa548e35` | pdf | 5 | text | Gesetzes und Verordnungsblattes eine hoheitliche Tätigkeit ist. | 2026-07-13 | 2026-07-13 | Landesregierung | Gesetzes und Verordnungsblattes eine hoheitliche T | Nr. 1 | gazette |

## Land Niedersachsen-Holstein (51 Quellen)

| Datei | SHA-256 | Typ | S. | Textebene | Titel (erkannt) | Dokumentdatum | Ausgabedatum | Organ | Blatt/Serie | Nummer | Dokumentart (vorsortiert) |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| nsh/1. EAV-GzLKHG.PDF | `083955cf9f56` | pdf | 5 | text | NORDDEUTSCHES LANDESMINISTERIUM FÜR | 2024-06-17 | – | gez. eigte Schema aufzuweisen. | – | – | standalone-official-act |
| nsh/2. EAV-GzLKHG.PDF | `fb462eed2ef7` | pdf | 4 | text | NORDDEUTSCHES LANDESMINISTERIUM FÜR | 2024-07-09 | – | – | – | – | standalone-official-act |
| nsh/Abiturprüfungsordnung.pdf | `6bef7331287d` | pdf | 22 | text | Die Landesregierung | 2026-08-01 | – | Landesregierung | – | Nr. 4 | standalone-official-act |
| nsh/Änderung_der_LBO_DRS-07-12.pdf | `84c0e86a6fd5` | pdf | 4 | text | Landtag Niedersachsen-Holstein Drucksache 07/12 | 2026-07-04 | – | Landesregierung | Drucksache 07/12 | Drs. 07/12 | legislative-document |
| nsh/BerGymV_NSH.pdf | `c11502f9899d` | pdf | 13 | text | Die Landesregierung | 2026-08-23 | – | Landesregierung | – | – | standalone-official-act |
| nsh/Drs 02_20 Gesetz zur Förderung von Unternehmen.pdf | `1ed90249572a` | pdf | 5 | text | Landtag Niedersachsen-Holstein Drucksache 02/20 | 2024-08-06 | – | Landesregierung von Niedersachsen-Holstein | Drucksache 02/20 | Drs. 02/20 | legislative-document |
| nsh/Drs 04_12.PDF | `de3bb96f33c3` | pdf | 4 | text | Landtag Niedersachsen-Holstein Drucksache 04/12 | – | – | Ministerpräsident des Landes Niedersachsen-Holstei | Drucksache 04/12 | Drs. 04/12 | legislative-document |
| nsh/Drs 04_13.PDF | `2378d76573cd` | pdf | 4 | text | Landtag Niedersachsen-Holstein Drucksache 04/13 | – | – | Ministerpräsident des Landes Niedersachsen-Holstei | Drucksache 04/13 | Drs. 04/13 | legislative-document |
| nsh/Drs 04_14.PDF | `65847f488344` | pdf | 15 | text | Landtag Niedersachsen-Holstein Drucksache 04/14 | – | – | Ministerpräsident des Landes Niedersachsen-Holstei | Drucksache 04/14 | Drs. 04/14 | legislative-document |
| nsh/Drs 04_15.PDF | `f1f71a165417` | pdf | 6 | text | Landtag Niedersachsen-Holstein Drucksache 04/15 | – | – | Ministerpräsident des Landes Niedersachsen-Holstei | Drucksache 04/15 | Drs. 04/15 | legislative-document |
| nsh/DRS-05-06.pdf | `c34ab2850d22` | pdf | 5 | text | Landtag Niedersachsen-Holstein Drucksache 05/06 | 2025-08-01 | – | Landesregierung | Drucksache 05/06 | Drs. 05/06 | legislative-document |
| nsh/DRS-05-08.pdf | `e09439e64223` | pdf | 9 | text | Landtag Niedersachsen-Holstein Drucksache 05/08 | 2025-08-24 | – | Landesregierung | Drucksache 05/08 | Drs. 05/08 | legislative-document |
| nsh/DRS-05-09.pdf | `7d0efaec6142` | pdf | 7 | text | Landtag Niedersachsen-Holstein Drucksache 05/09 | 2025-08-24 | – | Landesregierung | Drucksache 05/09 | Drs. 05/09 | legislative-document |
| nsh/DRS-05-10.pdf | `e1b6597d4e81` | pdf | 5 | text | Landtag Niedersachsen-Holstein Drucksache 05/10 | 2025-08-24 | – | Landesregierung | Drucksache 05/10 | Drs. 05/10 | legislative-document |
| nsh/Drs. 04_07_GesetzaenderungFeiertage.pdf | `12927dae2e30` | pdf | 4 | text | Landtag Niedersachsen-Holstein Drucksache 04/07 | 2025-03-11 | – | Landtag Niedersachsen-Holstein Drucksache 04/07 | Landtag Niedersachsen-Holstein Drucksache 04/07 | Drs. 04/07 | legislative-document |
| nsh/Drs.03_13-Gesetz zur Reaktivierung der Bahnstrecke Bassum-Bünde.pdf | `ada9b21c8a44` | pdf | 5 | text | Landtag Niedersachsen-Holstein Drucksache 03/13 | 2024-11-05 | – | Ministerpräsident des Landes Niedersachsen-Holstei | Landtag Niedersachsen-Holstein Drucksache 03/13 | Drs. 03/13 | legislative-document |
| nsh/Drucksache 03_12-Entwurf Änderung LaplaG.pdf | `e01458e8e818` | pdf | 5 | text | Landtag Niedersachsen-Holstein Drucksache 03/12 | 2024-11-05 | – | Ministerpräsident des Landes Niedersachsen-Holstei | Landtag Niedersachsen-Holstein Drucksache 03/12 | Drs. 03/12 | legislative-document |
| nsh/Drucksache 03_16.PDF | `e468f35c4162` | pdf | 5 | text | Landtag Niedersachsen-Holstein Drucksache 03/16 | 2024-11-07 | – | Landtag Niedersachsen-Holstein Drucksache 03/16 | Landtag Niedersachsen-Holstein Drucksache 03/16 | Drs. 03/16 | legislative-document |
| nsh/Drucksache 2_19 Landesprogramm _Feuerwehrgerätehäuser 2024_ 11072024 (2).pdf | `13e7fdb7f4f8` | pdf | 5 | text | Landtag Niedersachsen-Holstein Drucksache 02/19 | 2024-07-08 | – | Ministerpräsident des Landes Niedersachsen-Holstei | Drucksache 02/19 | Drs. 02/19 | legislative-document |
| nsh/Einheitstarif-Verordnung_amtliches_Layout.pdf | `2db4528345ef` | pdf | 2 | text | Verordnung zur Festlegung eines Einheitstarifs für den | 2025-11-17 | – | – | – | – | standalone-official-act |
| nsh/Entwurf Gesetz zur kostenfreien Bereitstellung von Menstruationsprodukten an öffentlichen Orten_ Drs. 04_08.pdf | `8e74401f9bfb` | pdf | 5 | text | Landtag Niedersachsen-Holstein Drucksache 04/08 | 2025-03-14 | – | Landtag Niedersachsen-Holstein Drucksache 04/08 | Landtag Niedersachsen-Holstein Drucksache 04/08 | Drs. 04/08 | legislative-document |
| nsh/Erlass_uber_die_Auszeichnungen_des_Landes_Niedersachsen-Holstein.pdf | `7efbb382e3b3` | pdf | 14 | text | Die Landesregierung Der Ministerpräsident | 2024-03-16 | – | Ministerpräsident | – | – | standalone-official-act |
| nsh/Ferienordnung.docx-1.pdf | `48b802d36d51` | pdf | 1 | text | Amtsblatt festgelegt und veröffentlicht. | 2026-06-29 | – | Ministerium für Bildung gesondert im Amtsblatt fes | Amtsblatt festgelegt und veröffentlicht. | – | ministerial-gazette |
| nsh/FSchulV_NSH (1).pdf | `9553323ea307` | pdf | 12 | text | Die Landesregierung | 2026-08-21 | – | Landesregierung | – | – | standalone-official-act |
| nsh/Gesetz zur Förderung von Bürgerbus-Vereinen auf Drs. 03_22.pdf | `958598df0b69` | pdf | 6 | text | Landtag Niedersachsen-Holstein Drucksache 03/22 | 2024-12-02 | – | Ministerpräsident des Landes Niedersachsen-Holstei | Landtag Niedersachsen-Holstein Drucksache 03/22 | Drs. 03/22 | legislative-document |
| nsh/GrVO.pdf | `7c661723e654` | pdf | 5 | text | Die Landesregierung | 2026-08-23 | – | Landesregierung | – | – | standalone-official-act |
| nsh/GVBL_NSH_-_MAL1_-_Teil_1_2024.pdf | `f992d72c1d37` | pdf | 26 | text | Gesetz- und Verordnungsblatt | 2024-02-12 | – | Landtag Niedersachsen-Holstein hat (3) Die Landesf | Gesetz- und Verordnungsblatt | – | gazette |
| nsh/GVBL_NSH_-_MAL1_-_Teil_2_2024.pdf | `45f0de196b7b` | pdf | 11 | text | Gesetz- und Verordnungsblatt | 2024-03-04 | – | Landtag hat das folgende Gesetz | Gesetz- und Verordnungsblatt | – | gazette |
| nsh/GVBL-NSH-LAH2-Teil-1-2026.pdf | `2d824d039343` | pdf | 10 | text | Gesetz- und Verordnungsblatt | 2026-09-02 | – | Landtag hat das folgende Gesetz | Gesetz- und Verordnungsblatt | – | gazette |
| nsh/GVBL-NSH-LAH2-Teil-2-2026.pdf | `f3a2b2e8af0f` | pdf | 12 | text | Gesetz- und Verordnungsblatt | 2026-09-02 | – | Landesregierung | Gesetz- und Verordnungsblatt | – | gazette |
| nsh/Gymnasiale Oberstufe (1).pdf | `06f9f024d108` | pdf | 13 | text | Die Landesregierung | 2026-08-16 | – | Landesregierung | – | – | standalone-official-act |
| nsh/Haushaltsplan2.1 2025.pdf | `309e9e8ef5f0` | pdf | 8 | text | Landtag Niedersachsen-Holstein Drucksache 05/07 | 2025-08-01 | – | Ministerpräsident | Landtag Niedersachsen-Holstein Drucksache 05/07 | Drs. 05/07 | legislative-document |
| nsh/mitteilung300324.txt | `d7177ba1feea` | text/plain | – | not-applicable | 30. März 2024: | 2024-03-30 | – | Ministerpräsident | – | – | informational |
| nsh/Niedersächsisch-Holsteinische Verordnung zur Durchführung der Förderung von Pflegeeinrichtungen (NSHPflegeEFördVO).pdf | `8bd7b1490a0b` | pdf | 10 | text | Die Landesregierung | 2025-03-06 | – | Landesregierung | – | Nr. 1 | standalone-official-act |
| nsh/NSH_-_GVBl_LAH_1_-_2025.pdf | `0eeaf9244dd0` | pdf | 59 | text | Gesetz- und Verordnungsblatt | 2025-08-04 | – | gez. ahlt ist. | Gesetz- und Verordnungsblatt | – | gazette |
| nsh/NSH_Gymnasiale_Oberstufe_Anlage1_Faecherkombinationen.docx | `58eb9e90404e` | docx | – | not-applicable | Die Landesregierung | – | – | Landesregierung | – | – | unknown |
| nsh/Organisationserlass.pdf | `81d98bcb74be` | pdf | 2 | text | Die Landesregierung Der Ministerpräsident | 2024-03-14 | – | Ministerpräsident | – | – | standalone-official-act |
| nsh/Schulordnung (1).pdf | `6743bf09daeb` | pdf | 42 | text | Die Landesregierung | 2026-07-09 | – | Landesregierung | – | – | standalone-official-act |
| nsh/SchulReNeuOG.pdf | `38aa2436de15` | pdf | 66 | text | Landtag Niedersachsen-Holstein Drucksache 07/14 | 2026-07-14 | – | Landesregierung | Drucksache 07/14 | Drs. 07/14 | legislative-document |
| nsh/TeilhG-NH-3.pdf | `a9b81dff93cc` | pdf | 5 | text | Landtag Niedersachsen-Holstein Drucksache 04/11 | 2025-04-30 | – | Landesregierung | Drucksache 04/11 | Drs. 04/11 | legislative-document |
| nsh/Verfugung_uber_das_Verbot_des_Aryan_Circle_Germany.pdf | `c990ff8c75c4` | pdf | 2 | text | Die Landesregierung Der Innenminister | 2022-03-14 | – | Ministerium für Inneres | – | – | standalone-official-act |
| nsh/verkündungen.txt | `b95cec376f08` | text/plain | – | not-applicable | Einige Gesetze wurden als Drucksachen verkündet, zu folgenden Daten: | 2024-06-16 | – | Ministerpräsident | – | – | promulgation-notice |
| nsh/Verordnung zur Videoüberwachung und Sicherheit im öffentlichen Raum.pdf | `97fd1b9cb1cf` | pdf | 2 | text | Die Landesregierung | 2025-03-06 | – | Landesregierung | – | – | standalone-official-act |
| nsh/Verordnung_-_NSH_-_Islamisches_Zentrum_HH.pdf | `f3495459321c` | pdf | 1 | text | Die Landesregierung Der INNENMINISTER | 2024-05-20 | – | Landesregierung | – | – | standalone-official-act |
| nsh/Verordnung_Erste-Hilfe.pdf | `3438d8550bcf` | pdf | 3 | text | LANDESMINISTERIUM FÜR | 2024-07-20 | – | gez. Michael Verstappen | – | – | standalone-official-act |
| nsh/Verordnung_LMIBE_Schutzbarriere für Bürger_-1.pdf | `1a7dcd5342da` | pdf | 5 | text | NORDDEUTSCHES LANDESMINISTERIUM FÜR | 2024-08-08 | – | – | – | – | standalone-official-act |
| nsh/Verordnung_Schwimmunterricht_NSH.pdf | `cf22629ffca3` | pdf | 3 | text | LANDESMINISTERIUM FÜR | 2024-08-01 | – | gez. Michael Verstappen | – | – | standalone-official-act |
| nsh/Verordnung_über_die_berufsbildenden_Schulen.pdf | `4b71caedc7d9` | pdf | 20 | text | Die Landesregierung | 2026-08-23 | – | Ministerium für Berufliche Bildung | – | – | standalone-official-act |
| nsh/Verordnung_zur_Behebung_der_Not_von_Volk_und_Land.pdf | `f923687ab1cb` | pdf | 2 | text | NIEDERSÄCHSISCHES-HOLSTEINISCHE STAATSKANZLEI | 2024-03-29 | – | Ministerpräsident | – | – | standalone-official-act |
| nsh/Verordnung_zur_einheitlichen_Regelung_des_Verfassungsschutzwesens_im_Lande.pdf | `fd20ed2b847a` | pdf | 24 | text | NIEDERSÄCHSISCH-HOLSTEINISCHE STAATSKANZLEI | 2024-02-26 | – | Ministerpräsident | – | – | standalone-official-act |
| nsh/WGFV.docx.pdf | `c5a69b933353` | pdf | 3 | text | Die Landesregierung | 2026-02-08 | – | Landesregierung | – | – | standalone-official-act |

## Freistaat Bayern-Württemberg (39 Quellen)

| Datei | SHA-256 | Typ | S. | Textebene | Titel (erkannt) | Dokumentdatum | Ausgabedatum | Organ | Blatt/Serie | Nummer | Dokumentart (vorsortiert) |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| baywü/24-StMISIKA-02-V-02 (1).pdf | `259b9949f41e` | pdf | 2 | text | Süddeutsche Grenzkontrollverordnung (SüdGrenzVer) | 2024-08-16 | – | Staatsregierung | – | – | standalone-official-act |
| baywü/25-MP-04-V-01.pdf | `3e7165f11948` | pdf | 2 | text | Ministerpräsident Geschäftszahl: 25-MP-04-V-01 | – | – | Ministerpräsident | – | – | standalone-official-act |
| baywü/25-StMIFIKJ-04-E-02.docx.pdf | `ee6581180626` | pdf | 2 | text | Die Innenministerin | 2025-03-11 | – | – | – | – | standalone-official-act |
| baywü/26-StBFJF-07-V-02 (1) (2).pdf | `a5bdad00e3a1` | pdf | 3 | text | Staatsministerium Geschäftszahl: 26-StBFJF-07-V-02 | 2026-07-28 | – | Staatsministerium für Bildung | – | – | standalone-official-act |
| baywü/26-StIH-07-V-01.pdf | `7e6c9d0b7268` | pdf | 2 | text | Staatsministerium Geschäftszahl | 2026-05-04 | – | Ministerpräsident | – | – | standalone-official-act |
| baywü/26-StIH-07-V-02.pdf | `03837954db29` | pdf | 2 | text | Staatsministerium Geschäftszahl | 2026-05-29 | – | Staatsministerium für Inneres und Heimatschutz im  | – | – | standalone-official-act |
| baywü/26-StIH-07-V-03.pdf | `5e0995179fae` | pdf | 2 | text | Staatsministerium Geschäftszahl | 2026-05-29 | – | Ministerpräsident | – | – | standalone-official-act |
| baywü/26-StMVID-07-PM-01.pdf | `1c3d7aa77cd1` | pdf | 2 | text | Staatsministerium Geschäftszah | 2026-08-18 | – | Staatsministerium für Verkehr | – | – | press-release |
| baywü/26-StMWF-07-GE-02 (1).pdf | `a4663eda9215` | pdf | 4 | text | Staatsministerium Geschäftszahl: 26-StMWF-07-GE-02 | 2026-05-13 | – | Ministerpräsident | – | – | standalone-official-act |
| baywü/Bayerisch-Württembergische Wolfsverordnung - BayWueWolfV.pdf | `a6aee1af2cee` | pdf | 3 | text | Bayerisch-Württembergischer | 2009-07-29 | – | Ministerpräsident | – | Nr. 225 | unknown |
| baywü/BayWü GVBl. 01_26.pdf | `f24b1dab46f2` | pdf | 41 | text | Gesetz- und Verordnungsblatt | 2026-05-29 | 2026-05-29 | Staatsregierung | Gesetz- und Verordnungsblatt | Nr. 1 | gazette |
| baywü/BayWü GVBl. 02_26.pdf | `2bd855c18d72` | pdf | 16 | text | Gesetz- und Verordnungsblatt | 2026-06-26 | 2026-06-26 | – | Gesetz- und Verordnungsblatt | Nr. 2 | gazette |
| baywü/BayWü GVBl. 03_26 (1) (1).pdf | `8805a09ed574` | pdf | 7 | text | Gesetz- und Verordnungsblatt | 2026-08-29 | 2026-08-29 | Ministerpräsident | Gesetz- und Verordnungsblatt | Nr. 3 | gazette |
| baywü/BayWü GVBl. 04_26 (1).pdf | `1afba1806d0b` | pdf | 23 | text | Gesetz- und Verordnungsblatt | 2026-08-30 | 2026-08-30 | – | Gesetz- und Verordnungsblatt | Nr. 4 | gazette |
| baywü/BayWü-GVBL 03-2025 (1).pdf | `255405100a67` | pdf | 17 | text | Gesetzes- und Verordnungsblatt | 2025-04-29 | – | Landtag hat das folgende Ge- Der Freistaat Bayern- | Gesetzes- und Verordnungsblatt | Nr. 03/2025 | gazette |
| baywü/ERLASS ZUR WAHRUNG DER BAYERN-WÜRTTEMBERGISCHEN INTEGRITÄT.docx.pdf | `36e12b008ae2` | pdf | 3 | text | Süddeutscher Landtag | 1976-08-10 | – | Landtag 4. Wahlperiode | – | – | standalone-official-act |
| baywü/erlass290624.txt | `f0f06946c7e2` | text/plain | – | not-applicable | 29. Juni 2024: | 2024-06-29 | – | Senat | – | – | standalone-official-act |
| baywü/Geschäftsordnung StReg (2).pdf | `b5b3f67be559` | pdf | 10 | text | Der Ministerpräsident Geschäftszahl: 26-MP-07-V-01 | 2025-01-12 | – | Ministerpräsident | – | – | standalone-official-act |
| baywü/GVBL_Lehrmann_Teil_Eins_2025.pdf | `fcdbe54e7a38` | pdf | 5 | text | Gesetzes- und Verordnungsblatt | 2025-01-30 | – | Staatsministerium der Justiz und für Verbrauchersc | Gesetzes- und Verordnungsblatt | Nr. 1 | gazette |
| baywü/GVBL_Lehrmann_Teil_Zwei_2025 (1).pdf | `706185d0d69e` | pdf | 15 | text | Gesetzes- und Verordnungsblatt | 2025-03-12 | – | Staatsministerium des Innern | Gesetzes- und Verordnungsblatt | Nr. 2 | gazette |
| baywü/GVBL_SUED_MUR_01_24 (1).pdf | `f77e2cb76c37` | pdf | 16 | text | Gesetzes- und Verordnungsblatt | 2024-09-16 | – | Staatsministerium der Justiz und für Verbrauchersc | Gesetzes- und Verordnungsblatt | Nr. 1 | gazette |
| baywü/mitteilung041024.txt | `97a82a9fdb01` | text/plain | – | not-applicable | 4. Oktober 2024: | 1980-07-18 | – | – | – | Nr. 29 | informational |
| baywü/mitteilung070524.txt | `7a20ec7b6142` | text/plain | – | not-applicable | 7. Mai 2024: | 1980-07-18 | – | Ministerpräsident | – | Nr. 29 | informational |
| baywü/mitteilung130425.txt | `a6b93967804d` | text/plain | – | not-applicable | 13. April 2025: | 2025-04-13 | – | Ministerpräsidentin | – | – | standalone-official-act |
| baywü/mitteilung220824.txt | `f6c26c824903` | text/plain | – | not-applicable | 22. August 2024: | 2024-08-22 | – | Ministerpräsidentin | – | – | promulgation-notice |
| baywü/Organisationserlass_01.pdf | `ac829b7a637d` | pdf | 1 | text | Die Staatsregierung Geschäftszahl: 25-MP-04-OE-01 | 2025-02-14 | – | Ministerpräsident | – | – | standalone-official-act |
| baywü/Organisationserlass_02.pdf | `f20493427726` | pdf | 1 | text | Die Staatsregierung Geschäftszahl: 25-MP-04-OE-02 | 2025-03-16 | – | Ministerpräsident | – | – | standalone-official-act |
| baywü/OrganisationserlassStReg.pdf | `a1487f499833` | pdf | 12 | text | Der Ministerpräsident Geschäftszahl: 26-MP-07-V-02 | 2026-04-05 | – | Ministerpräsident | – | Nr. 6 | standalone-official-act |
| baywü/Stiftung des Rainer-Winkler Ordens.pdf | `18fcd6211fae` | pdf | 4 | text | Amtsblatt bekannt gemacht.‬ | 2026-06-05 | – | Ministerpräsident | Amtsblatt bekannt gemacht.‬ | Nr. 1 | ministerial-gazette |
| baywü/Verordnung Geschäftsverteilung BayWü StReg.pdf | `808c468edf51` | pdf | 13 | text | Die Ministerpräsidentin Geschäftszahl: 25-MP-04-Ri-01 | 2025-01-12 | – | Ministerpräsidentin | – | Nr. 6 | standalone-official-act |
| baywü/Verordnung Pflichtfächer PuG, Wirtschaft.pdf | `cc0a376d5d46` | pdf | 6 | text | Staatsministerium Geschäftszahl: 26-StBFJF-07-V-01 | 2025-01-12 | – | Staatsministerium für Bildung | – | – | standalone-official-act |
| baywü/Verordnung zu Regelung des Unterrichtbeginns.pdf | `25e6c4a2cc63` | pdf | 2 | text | Die Staatsregierung | 2025-01-23 | – | Staatsministerium für Unterricht und Kultus | – | – | standalone-official-act |
| baywü/Verordnung zur Ausweitung der KZ Besuchspflicht auf Mittelschulen (1).pdf | `2492c29798b2` | pdf | 2 | text | Die Staatsregierung | 2025-01-26 | – | Staatsministerium für Unterricht und Kultus | – | – | standalone-official-act |
| baywü/Verordnung zur inhaltlichen Ausgestaltung der Sexualkunde in der Sekundarstufe I im Fach Biologie.pdf | `23e49be2d40c` | pdf | 2 | text | Die Staatsregierung | 2025-01-22 | – | Ministerpräsident | – | – | standalone-official-act |
| baywü/Verordnung zur Regelung von Hausaufgaben in der Primarstufe.pdf | `e2afaea2bb83` | pdf | 2 | text | Die Staatsregierung | 2025-01-25 | – | Staatsministerium für Unterricht und Kultus | – | – | standalone-official-act |
| baywü/Verordnung zur Verstärkung der Grenzüberwachung durch die Bayerisch.pdf | `2bf2a0ac6ce8` | pdf | 2 | text | Bayerisch-Württembergischer | – | – | Ministerpräsident | – | – | standalone-official-act |
| baywü/verordnung030626.txt | `07a5bd86d600` | text/plain | – | not-applicable | 3. Juni 2026: | 2026-06-03 | – | Ministerpräsident | – | – | standalone-official-act |
| baywü/verordnung050626.txt | `0e9becd8a09e` | text/plain | – | not-applicable | 5. Juni 2026: | 2026-06-05 | – | Ministerpräsident | – | – | standalone-official-act |
| baywü/verordnung150824.txt | `b3c40f6f71ce` | text/plain | – | not-applicable | 15. August 2024: | 2024-08-16 | – | Staatsministerium des Innern | – | – | standalone-official-act |

