# Abdeckungslücke der Enumeration: Fortführungsnachweis gegen Portalfacette (BAYERN.RECHT)

Stand: 2026-09-17 · erzeugt von `node scripts/import-bayernrecht.ts enumerate --write`
· maschinenlesbar: `data/audits/bayernrecht/enumeration-gap.json` · Rohbestand: `data/audits/bayernrecht/facet-inventory.json`

## Der Befund in einem Satz

Die Lücke ist **einseitig**: Alle 2311 Dokumente der beiden Fortführungsnachweise stehen auch in der Portalfacette (nur im Nachweis: 0). Umgekehrt führt das Portal 102 Dokumente, die kein Fortführungsnachweis nennt.

## Bilanz

| Normtyp | Facette | im Fortführungsnachweis | nur Facette |
| --- | ---: | ---: | ---: |
| Gesetz (`ges`) | 241 | 241 | 0 |
| Rechtsverordnung (`rv`) | 486 | 486 | 0 |
| Verwaltungsvorschrift (`vv`) | 1478 | 1439 | 39 |
| Vertrag, sonstige Rechtsquelle (`vertr`) | 208 | 145 | 63 |
| **gesamt** | **2413** | **2311** | **102** |

Die Facettenzahlen sind nicht abgeschrieben, sondern durchgeblättert: 243 Trefferlistenseiten, je Seite zehn Treffer, jede Seite mit Adresse, SHA-256 und Abrufzeit in `facet-inventory.json`. Der Trefferzähler jeder Facette stimmt mit der Zahl der gesammelten Dokumente überein (vollständig).

## Woraus die Differenz besteht

### Tarifverträge des öffentlichen Dienstes — 56

Tarifverträge sind keine Rechtsvorschriften des Freistaats, sondern Vereinbarungen der Tarifvertragsparteien. Die Bayerische Rechtssammlung führt Gesetze, Rechtsverordnungen und Staatsverträge; ein Tarifvertrag hat dort keine Gliederungsnummer. Das Portal zeigt sie gleichwohl unter „Verträge, sonstige Rechtsquellen“.

| Dokument-ID | Normtyp | Rechtsstand | Titel |
| --- | --- | --- | --- |
| [`ATV`](https://www.gesetze-bayern.de/Content/Document/ATV) | `vertr` | 2022-01-01 | Tarifvertrag Altersversorgung – Tarifvertrag über die betriebliche Altersversorgung der Beschäftigten des öffentlichen Dienstes (ATV) |
| [`ATVTVEntgUA`](https://www.gesetze-bayern.de/Content/Document/ATVTVEntgUA) | `vertr` | 2009-05-01 | TV-Entgeltumwandlung-Ärzte – Tarifvertrag zur Entgeltumwandlung für Ärztinnen und Ärzte im Geltungsbereich des TV-Ärzte |
| [`ATVVwV153334`](https://www.gesetze-bayern.de/Content/Document/ATVVwV153334) | `vertr` | 2007-01-01 | Tarifvertrag über eine Jahressonderzahlung für Arbeitnehmerinnen und Arbeitnehmer sowie Auszubildende und Praktikanten in landwirtschaftlichen Betrieben des Freistaates Bayern Vom 15. Dezember 2006 |
| [`ArztEinmalzahlung2011TV`](https://www.gesetze-bayern.de/Content/Document/ArztEinmalzahlung2011TV) | `vertr` | 2011-11-01 | Tarifvertrag über eine Einmalzahlung im Jahr 2011 für Ärztinnen und Ärzte an Universitätskliniken Vom 5. November 2011 |
| [`BayTVCoronaSZAerzte`](https://www.gesetze-bayern.de/Content/Document/BayTVCoronaSZAerzte) | `vertr` | 2022-08-25 | TV Corona-Sonderzahlung Ärzte – Tarifvertrag über eine einmalige Corona-Sonderzahlung Ärzte |
| [`BayTVFahrradleasing`](https://www.gesetze-bayern.de/Content/Document/BayTVFahrradleasing) | `vertr` | 2024-09-01 | TV-Fahrradleasing Ärzte Bayern – Tarifvertrag zur Entgeltumwandlung zum Zwecke des Leasings von Fahrrädern für Ärztinnen und Ärzte des Freistaates Bayern |
| [`BayTV_AEDHM`](https://www.gesetze-bayern.de/Content/Document/BayTV_AEDHM) | `vertr` | 2020-10-01 | Tarifvertrag über die Einbeziehung der Ärztinnen und Ärzte am Deutschen Herzzentrum München in den Geltungsbereich des Tarifvertrages für Ärztinnen und Ärzte an Universitätskliniken vom 30. Oktober 2006 (TV-Ärzte) und über die Ausdehnung der wöchentlichen Höchstarbeitszeit bei Bereitschaftsdienst (TV-Ärzte – Bereitschaftsdienst Bayern) Vom 13. April 2007 |
| [`BayTV_AUeG`](https://www.gesetze-bayern.de/Content/Document/BayTV_AUeG) | `vertr` | 2021-05-01 | Tarifvertrag über die Festlegung einer von § 1 Abs. 1b Satz 1 Arbeitnehmerüberlassungsgesetz (AÜG) abweichenden Höchstüberlassungsdauer vom 19. März 2021 |
| [`BayTV_CoSZForst`](https://www.gesetze-bayern.de/Content/Document/BayTV_CoSZForst) | `vertr` | 2021-11-29 | Tarifvertrag über eine einmalige Corona-Sonderzahlung in forstwirtschaftlichen Verwaltungen, Einrichtungen und Betrieben der Länder Bekanntmachung des Bayerischen Staatsministeriums der Finanzen und für Heimat vom 13. Dezember 2021, Az. 25-P 2627-3/53 |
| [`BayTV_CoSoZ`](https://www.gesetze-bayern.de/Content/Document/BayTV_CoSoZ) | `vertr` | 2021-11-29 | Tarifvertrag über eine einmalige Corona-Sonderzahlung für Arbeitnehmerinnen und Arbeitnehmer, Auszubildende, Praktikantinnen und Praktikanten sowie dual Studierende in ausbildungsintegrierten dualen Studiengängen im öffentlichen Dienst der Länder Bekanntmachung des Bayerischen Staatsministeriums der Finanzen und für Heimat vom 2. Dezember 2021, Az. 25-P 2603-1/58 |
| [`BayTV_EL`](https://www.gesetze-bayern.de/Content/Document/BayTV_EL) | `vertr` | 2026-04-01 | Tarifvertrag über eine ergänzende Leistung an Arbeitnehmerinnen, Arbeitnehmer, Auszubildende und dual Studierende des Freistaates Bayern (TV-EL) |
| [`BayTV_EL_AE`](https://www.gesetze-bayern.de/Content/Document/BayTV_EL_AE) | `vertr` | 2026-04-01 | Tarifvertrag vom 13. April 2007 über eine ergänzende Leistung an Ärztinnen und Ärzte an Universitätskliniken (TV-EL-Ä) |
| [`BayTV_EL_F`](https://www.gesetze-bayern.de/Content/Document/BayTV_EL_F) | `vertr` | 2026-04-01 | Tarifvertrag vom 15. Juli 2008 über eine ergänzende Leistung an Beschäftigte in forstwirtschaftlichen Verwaltungen, Einrichtungen und Betrieben und zur/zum Forstwirtin/Forstwirt Auszubildende des Freistaates Bayern (TV-EL-F) |
| [`BayTV_EL_GOED`](https://www.gesetze-bayern.de/Content/Document/BayTV_EL_GOED) | `vertr` | 2008-01-01 | Anschlusstarifvertrag über eine ergänzende Leistung an Arbeitnehmerinnen, Arbeitnehmer und Auszubildende des Freistaates Bayern (TV-EL) Vom 16. November 2009 |
| [`BayTV_EL_GOED_AE2`](https://www.gesetze-bayern.de/Content/Document/BayTV_EL_GOED_AE2) | `vertr` | 2011-01-01 | Anschlusstarifvertrag über eine ergänzende Leistung an Arbeitnehmerinnen, Arbeitnehmer und Auszubildende des Freistaates Bayern (TV-EL) Vom 20. Januar 2011 |
| [`BayTV_EL_GOED_AE3`](https://www.gesetze-bayern.de/Content/Document/BayTV_EL_GOED_AE3) | `vertr` | 2013-09-01 | Anschlusstarifvertrag über eine ergänzende Leistung an Arbeitnehmerinnen, Arbeitnehmer und Auszubildende des Freistaates Bayern (TV-EL) Vom 12. November 2014 |
| [`BayTV_EL_GOED_AE4`](https://www.gesetze-bayern.de/Content/Document/BayTV_EL_GOED_AE4) | `vertr` | 2015-03-01 | Anschlusstarifvertrag über eine ergänzende Leistung an Arbeitnehmerinnen, Arbeitnehmer und Auszubildende des Freistaates Bayern (TV-EL) Vom 24. November 2015 |
| [`BayTV_EL_GOED_AE5`](https://www.gesetze-bayern.de/Content/Document/BayTV_EL_GOED_AE5) | `vertr` | 2018-01-01 | Anschlusstarifvertrag über eine ergänzende Leistung an Arbeitnehmerinnen, Arbeitnehmer und Auszubildende des Freistaats Bayern (TV-EL) Vom 18. April 2018 |
| [`BayTV_EL_GOED_AE6`](https://www.gesetze-bayern.de/Content/Document/BayTV_EL_GOED_AE6) | `vertr` | 2019-01-01 | Anschlusstarifvertrag über eine ergänzende Leistung an Arbeitnehmerinnen, Arbeitnehmer und Auszubildende des Freistaats Bayern (TV-EL) Vom 12. August 2019 |
| [`BayTV_EL_GOED_AE7`](https://www.gesetze-bayern.de/Content/Document/BayTV_EL_GOED_AE7) | `vertr` | 2020-08-01 | Anschlusstarifvertrag über eine ergänzende Leistung an Arbeitnehmerinnen, Arbeitnehmer und Auszubildende des Freistaats Bayern (TV-EL) Vom 18. Juli 2022 |
| [`BayTV_EL_GOED_AE8`](https://www.gesetze-bayern.de/Content/Document/BayTV_EL_GOED_AE8) | `vertr` | 2022-12-01 | Anschlusstarifvertrag über eine ergänzende Leistung an Arbeitnehmerinnen, Arbeitnehmer und Auszubildende des Freistaats Bayern (TV-EL) Vom 18. Juli 2022 |
| [`BayTV_EL_GOED_AE9`](https://www.gesetze-bayern.de/Content/Document/BayTV_EL_GOED_AE9) | `vertr` | 2024-11-01 | Anschlusstarifvertrag über eine ergänzende Leistung an Arbeitnehmerinnen, Arbeitnehmer, Auszubildende und dual Studierende des Freistaates Bayern (TV-EL) Vom 22. Mai 2024 |
| [`BayTV_HafenZulagen`](https://www.gesetze-bayern.de/Content/Document/BayTV_HafenZulagen) | `vertr` | 2007-08-01 | Tarifvertrag über Zulagen für die Arbeitnehmerinnen und Arbeitnehmer des Freistaats Bayern in den Bayerischen Hafenbetrieben Vom 23. Juli 2007 |
| [`BayTV_Inflationsausgleich_Forst`](https://www.gesetze-bayern.de/Content/Document/BayTV_Inflationsausgleich_Forst) | `vertr` | 2024-02-20 | TV Inflationsausgleich Forst – Tarifvertrag über Sonderzahlungen zur Abmilderung der gestiegenen Verbraucherpreise in forstwirtschaftlichen Verwaltungen, Einrichtungen und Betrieben der Länder |
| [`BayVwV153752`](https://www.gesetze-bayern.de/Content/Document/BayVwV153752) | `vertr` | 2006-11-01 | Tarifvertrag über die Arbeitsbedingungen der Beschäftigten der Bayerischen Verwaltung der staatlichen Schlösser, Gärten und Seen in den Betriebsteilen Ammersee und Starnberger See der Bayerischen Seenschifffahrt GmbH Vom 23. Juli 2007 |
| [`EZahlTV2009`](https://www.gesetze-bayern.de/Content/Document/EZahlTV2009) | `vertr` | 2009-01-01 | Tarifvertrag über eine Einmalzahlung im Jahr 2009 Vom 1. März 2009 |
| [`EZahlTV2011`](https://www.gesetze-bayern.de/Content/Document/EZahlTV2011) | `vertr` | 2011-04-01 | Tarifvertrag über eine Einmalzahlung im Jahr 2011 Vom 10. März 2011 |
| [`Pkw_Fahrer_TV_L`](https://www.gesetze-bayern.de/Content/Document/Pkw_Fahrer_TV_L) | `vertr` | 2025-11-01 | Tarifvertrag über die Arbeitsbedingungen der Personenkraftwagenfahrer der Länder (Pkw-Fahrer-TV-L) Vom 12. Oktober 2006 |
| [`TV233209`](https://www.gesetze-bayern.de/Content/Document/TV233209) | `vertr` | 2006-11-01 | Anschlusstarifvertrag Vom 26. Februar 2007 |
| [`TVAForst`](https://www.gesetze-bayern.de/Content/Document/TVAForst) | `vertr` | 2023-10-01 | Tarifvertrag für Auszubildende zum Forstwirt in forstwirtschaftlichen Verwaltungen, Einrichtungen und Betrieben der Länder (TVA-L-Forst) Vom 17. Dezember 2008 |
| [`TVA_EinmalzForst2008`](https://www.gesetze-bayern.de/Content/Document/TVA_EinmalzForst2008) | `vertr` | 2009-01-01 | Tarifvertrag über die Gewährung einer Einmalzahlung an Auszubildende zum Forstwirt in forstwirtschaftlichen Verwaltungen, Einrichtungen und Betrieben der Länder (TVA-Einmalzahlung Forst) Vom 17. Dezember 2008 |
| [`TVA_L_BBiG`](https://www.gesetze-bayern.de/Content/Document/TVA_L_BBiG) | `vertr` | 2025-11-01 | Tarifvertrag für Auszubildende der Länder in Ausbildungsberufen nach dem Berufsbildungsgesetz (TVA-L BBiG) Vom 12. Oktober 2006 |
| [`TVA_L_Pflege`](https://www.gesetze-bayern.de/Content/Document/TVA_L_Pflege) | `vertr` | 2023-10-01 | Tarifvertrag für Auszubildende der Länder in Pflegeberufen (TVA-L Pflege) Vom 12. Oktober 2006 |
| [`TVEntgUWFoBL`](https://www.gesetze-bayern.de/Content/Document/TVEntgUWFoBL) | `vertr` | 2011-10-01 | Tarifvertrag zur Entgeltumwandlung für die Beschäftigten des Bundes und der Länder, die Tätigkeiten in der Waldarbeit ausüben (TV-EntgeltU-Wald/Forst B/L) Vom 28. September 2011 |
| [`TVEntgeltUB_L`](https://www.gesetze-bayern.de/Content/Document/TVEntgeltUB_L) | `vertr` | 2011-08-01 | Tarifvertrag zur Entgeltumwandlung für die Beschäftigten des Bundes und der Länder (TV-EntgeltU-B/L) Vom 25. Mai 2011 |
| [`TVLEntgeltO`](https://www.gesetze-bayern.de/Content/Document/TVLEntgeltO) | `vertr` | 2025-01-01 | Entgeltordnung zum Tarifvertrag für den öffentlichen Dienst der Länder (TV-L) Vom 2. Januar 2012 |
| [`TVUeForst`](https://www.gesetze-bayern.de/Content/Document/TVUeForst) | `vertr` | 2023-10-01 | Tarifvertrag zur Überleitung der Beschäftigten der Länder aus dem Geltungsbereich des MTW/MTW-O in den TV-Forst und zur Regelung des Übergangsrechts (TVÜ-Forst) Vom 18. Dezember 2007 |
| [`TVUeLaender`](https://www.gesetze-bayern.de/Content/Document/TVUeLaender) | `vertr` | 2025-01-01 | Tarifvertrag zur Überleitung der Beschäftigten der Länder in den TV-L und zur Regelung des Übergangsrechts (TVÜ-Länder) Vom 12. Oktober 2006 |
| [`TV_Aerzte`](https://www.gesetze-bayern.de/Content/Document/TV_Aerzte) | `vertr` | 2026-01-01 | Tarifvertrag für Ärztinnen und Ärzte an Universitätskliniken (TV-Ärzte) Vom 30. Oktober 2006 |
| [`TV_EinmalzForst_2007`](https://www.gesetze-bayern.de/Content/Document/TV_EinmalzForst_2007) | `vertr` | 2008-01-01 | Tarifvertrag über Einmalzahlungen – Forst Vom 18. Dezember 2007 |
| [`TV_EinmalzForst_2009`](https://www.gesetze-bayern.de/Content/Document/TV_EinmalzForst_2009) | `vertr` | 2009-03-01 | Tarifvertrag über Einmalzahlungen-Forst Vom 18. Juni 2009 |
| [`TV_EinmalzForst_2011`](https://www.gesetze-bayern.de/Content/Document/TV_EinmalzForst_2011) | `vertr` | 2011-04-01 | Tarifvertrag über Einmalzahlungen – Forst 2011 Vom 26. Mai 2011 |
| [`TV_Forst`](https://www.gesetze-bayern.de/Content/Document/TV_Forst) | `vertr` | 2024-01-01 | Tarifvertrag zur Regelung der Arbeitsbedingungen von Beschäftigten in forstwirtschaftlichen Verwaltungen, Einrichtungen und Betrieben der Länder (TV-L-Forst) Vom 18. Dezember 2007 |
| [`TV_ForstAendTV_1_DBB`](https://www.gesetze-bayern.de/Content/Document/TV_ForstAendTV_1_DBB) | `vertr` | 2010-07-16 | Anschlusstarifvertrag für Beschäftigte in forstwirtschaftlichen Verwaltungen, Einrichtungen und Betrieben der Länder Vom 4. März 2010 |
| [`TV_ForstAendTV_2_DBB`](https://www.gesetze-bayern.de/Content/Document/TV_ForstAendTV_2_DBB) | `vertr` | 2011-10-31 | Anschlusstarifvertrag für Beschäftigte in forstwirtschaftlichen Verwaltungen, Einrichtungen und Betrieben der Länder Vom 31. Oktober 2011 |
| [`TV_ForstAendTV_3_5_DBB`](https://www.gesetze-bayern.de/Content/Document/TV_ForstAendTV_3_5_DBB) | `vertr` | 2013-07-11 | Anschlusstarifvertrag für Beschäftigte in forstwirtschaftlichen Verwaltungen, Einrichtungen und Betrieben der Länder Vom 11. Juli 2013 |
| [`TV_ForstAendTV_6_DBB`](https://www.gesetze-bayern.de/Content/Document/TV_ForstAendTV_6_DBB) | `vertr` | 2015-03-01 | Anschlusstarifvertrag für Beschäftigte in forstwirtschaftlichen Verwaltungen, Einrichtungen und Betrieben der Länder Vom 1. September 2015 |
| [`TV_ForstAendTV_8_DBB`](https://www.gesetze-bayern.de/Content/Document/TV_ForstAendTV_8_DBB) | `vertr` | 2019-01-01 | Anschlusstarifvertrag für Beschäftigte in forstwirtschaftlichen Verwaltungen, Einrichtungen und Betrieben der Länder Vom 19. Dezember 2019 |
| [`TV_ForstWBerlin`](https://www.gesetze-bayern.de/Content/Document/TV_ForstWBerlin) | `vertr` | 2013-01-01 | TV Wiederaufnahme Berlin – Forst – Tarifvertrag zur Überleitung der Beschäftigten und der zum Forstwirt Auszubildenden in forstwirtschaftlichen Verwaltungen, Einrichtungen und Betrieben des Landes Berlin in das Tarifrecht der TdL |
| [`TV_Forst_AnschlTV`](https://www.gesetze-bayern.de/Content/Document/TV_Forst_AnschlTV) | `vertr` | 2008-01-01 | Anschlusstarifvertrag für Beschäftigte in forstwirtschaftlichen Verwaltungen, Einrichtungen und Betrieben der Länder Vom 17. Dezember 2008 |
| [`TV_L`](https://www.gesetze-bayern.de/Content/Document/TV_L) | `vertr` | 2026-07-01 | Tarifvertrag für den öffentlichen Dienst der Länder (TV-L) Vom 12. Oktober 2006 |
| [`TV_Prakt_L`](https://www.gesetze-bayern.de/Content/Document/TV_Prakt_L) | `vertr` | 2023-10-01 | Tarifvertrag über die Regelung der Arbeitsbedingungen der Praktikantinnen/Praktikanten der Länder (TV Prakt-L) Vom 9. Dezember 2011 |
| [`TV_UeAerzte`](https://www.gesetze-bayern.de/Content/Document/TV_UeAerzte) | `vertr` | 2013-01-01 | Tarifvertrag zur Überleitung der Ärztinnen und Ärzte an Universitätskliniken (TVÜ-Ärzte) Vom 30. Oktober 2006 |
| [`TVdSL`](https://www.gesetze-bayern.de/Content/Document/TVdSL) | `vertr` | 2023-10-01 | Tarifvertrag für dual Studierende der Länder in ausbildungsintegrierten dualen Studiengängen (TVdS-L) Vom 29. Januar 2020 |
| [`TVoeD_EntgOL`](https://www.gesetze-bayern.de/Content/Document/TVoeD_EntgOL) | `vertr` | 2019-01-01 | Tarifvertrag über die Eingruppierung und die Entgeltordnung für die Lehrkräfte der Länder (TV EntgO-L) Vom 28. März 2015 |
| [`TVoeD_EntgOL_1`](https://www.gesetze-bayern.de/Content/Document/TVoeD_EntgOL_1) | `vertr` | 2019-08-01 | Entgeltordnung für die Lehrkräfte der Länder Vom 28. März 2015 |

### Bundeseinheitliche Anordnungen und Vereinbarungen (Bundesanzeiger) — 14

Bundeseinheitlich vereinbarte Anordnungen und Richtlinien (Mitteilungen in Straf- und Zivilsachen, Strafvollstreckungs- und Rechtshilfeordnung, Gerichtsvollzieherrecht u. a.). Sie werden im Bundesanzeiger bekannt gemacht, nicht im GVBl. oder BayMBl. – deshalb führt sie kein bayerischer Fortführungsnachweis.

| Dokument-ID | Normtyp | Rechtsstand | Titel |
| --- | --- | --- | --- |
| [`BRD_005_1993_06658`](https://www.gesetze-bayern.de/Content/Document/BRD_005_1993_06658) | `vertr` | 1993-08-01 | Vereinbarung des Bundes und der Länder über die Kosten in Einlieferungssachen Vom 22. Juni 1993 (BAnz. S. 6658) |
| [`BRD_005_2005_11361_1`](https://www.gesetze-bayern.de/Content/Document/BRD_005_2005_11361_1) | `vertr` | 2005-07-11 | Bekanntmachung der im internationalen Rechtshilfeverkehr in strafrechtlichen Angelegenheiten bei der Hereinschaffung und der Herausgabe von Gegenständen zu beachtenden zoll- und außenwirtschaftsrechtlichen Bestimmungen Vom 11. Juli 2005 (BAnz. S. 11361) |
| [`DSVollz`](https://www.gesetze-bayern.de/Content/Document/DSVollz) | `vertr` | 1977-01-01 | Dienst- und Sicherheitsvorschriften für den Strafvollzug (DSVollz) Vom 1. Juli 1976 |
| [`EBAO`](https://www.gesetze-bayern.de/Content/Document/EBAO) | `vv` | 2024-08-15 | Einforderungs- und Beitreibungsanordnung Vom 1. August 2011 (BAnz. Nr. 112a S. 1, 22) |
| [`GVGA`](https://www.gesetze-bayern.de/Content/Document/GVGA) | `vertr` | 2026-06-01 | Geschäftsanweisung für Gerichtsvollzieher (GVGA) |
| [`GerVO`](https://www.gesetze-bayern.de/Content/Document/GerVO) | `vertr` | 2025-05-01 | Gerichtsvollzieherordnung (GVO) |
| [`KostVfG`](https://www.gesetze-bayern.de/Content/Document/KostVfG) | `vertr` | 2025-11-01 | Kostenverfügung (KostVfg) Neufassung vom 5. September 2023 (BAnz AT 29.09.2023 B2) |
| [`MiStra2022`](https://www.gesetze-bayern.de/Content/Document/MiStra2022) | `vv` | 2022-08-01 | Anordnung über Mitteilungen in Strafsachen (MiStra) in der ab dem 1. August 2022 geltenden Fassung vom 10. Mai 2022 (BAnz AT 20.7.2022 B1 ) |
| [`MiZi2024`](https://www.gesetze-bayern.de/Content/Document/MiZi2024) | `vv` | 2025-01-01 | Anordnung über Mitteilungen in Zivilsachen (MiZi) Vom 18. November 2024 (BAnz AT 23.12.2024 B4 , S. 2) |
| [`RiStBV`](https://www.gesetze-bayern.de/Content/Document/RiStBV) | `vv` | 2023-03-30 | Richtlinien für das Strafverfahren und das Bußgeldverfahren (RiStBV) Neufassung vom 28. März 2023 (BAnz AT 19.06.2023 B1 ) |
| [`RiVASt`](https://www.gesetze-bayern.de/Content/Document/RiVASt) | `vv` | 2017-01-01 | Richtlinien für den Verkehr mit dem Ausland in strafrechtlichen Angelegenheiten (RiVASt) (BAnz. S. 10550) |
| [`StVollstrO`](https://www.gesetze-bayern.de/Content/Document/StVollstrO) | `vv` | 2024-08-15 | Strafvollstreckungsordnung (StVollstrO) Vom 1. August 2011 (BAnz. Nr. 112a S. 1) |
| [`VerschLAVerf`](https://www.gesetze-bayern.de/Content/Document/VerschLAVerf) | `vv` | 2002-06-06 | Allg. Verfügung Verschollenheitsliste – Allgemeine Verfügung über die Verschollenheitsliste |
| [`ZRHO`](https://www.gesetze-bayern.de/Content/Document/ZRHO) | `vv` | 2026-07-07 | Rechtshilfeordnung für Zivilsachen (ZRHO) Vom 19. Oktober 1956 (vgl. Bek. des BMJ v. 16.3.1957, BAnz. Nr. 63 S. 1) |

### Gliederungsstelle im Fortführungsnachweis anderweitig belegt — 19

Die Dokument-ID trägt eine BayVV-Gliederungsnummer, und zu genau dieser Gliederungsstelle führt der Fortführungsnachweis ein anderes Dokument (Geschwister-IDs sind im Datensatz genannt). Das Portal hält daneben ältere oder parallele Bekanntmachungen derselben Stelle vor; der Nachweis führt je Gliederungsstelle nur eine.

| Dokument-ID | Rechtsstand | im Nachweis an derselben Stelle | Titel |
| --- | --- | --- | --- |
| [`BayVV_206_D_14026`](https://www.gesetze-bayern.de/Content/Document/BayVV_206_D_14026) | 2023-10-01 | `BayVV_206_D_12940` | Festlegung der Zuständigkeitsbereiche und Verfahren nach der IT-Sicherheitsverordnung Portalverbund – Festlegung der Zuständigkeitsbereiche und Verfahren nach der IT-Sicherheitsverordnung Portalverbund (BekBayITSiV-PV) |
| [`BayVV_1102_F_875`](https://www.gesetze-bayern.de/Content/Document/BayVV_1102_F_875) | 2000-03-01 | `BayVV_1102_F_10160` | Bürgerengagement – Bürger-Engagement für Moderne Verwaltung |
| [`BayVV_2023_I_2045`](https://www.gesetze-bayern.de/Content/Document/BayVV_2023_I_2045) | 2010-03-10 | `BayVV_2023_I_2215`, `BayVV_2023_I_2216`, `BayVV_2023_I_2281` | Aufstellung und Vollzug der Haushaltspläne der Kommunen – Aufstellung und Vollzug der Haushaltspläne der Kommunen |
| [`BayVV_2023_I_2155`](https://www.gesetze-bayern.de/Content/Document/BayVV_2023_I_2155) | 2012-02-28 | `BayVV_2023_I_2215`, `BayVV_2023_I_2216`, `BayVV_2023_I_2281` | Aufstellung und Vollzug der Haushaltspläne der Kommunen – Aufstellung und Vollzug der Haushaltspläne der Kommunen |
| [`BayVV_2023_I_2179`](https://www.gesetze-bayern.de/Content/Document/BayVV_2023_I_2179) | 2013-03-28 | `BayVV_2023_I_2215`, `BayVV_2023_I_2216`, `BayVV_2023_I_2281` | Aufstellung und Vollzug der Haushaltspläne der Kommunen – Aufstellung und Vollzug der Haushaltspläne der Kommunen |
| [`BayVV_2023_I_2214`](https://www.gesetze-bayern.de/Content/Document/BayVV_2023_I_2214) | 2014-03-28 | `BayVV_2023_I_2215`, `BayVV_2023_I_2216`, `BayVV_2023_I_2281` | Aufstellung und Vollzug der Haushaltspläne der Kommunen – Aufstellung und Vollzug der Haushaltspläne der Kommunen |
| [`BayVV_2023_I_2230`](https://www.gesetze-bayern.de/Content/Document/BayVV_2023_I_2230) | 2015-04-30 | `BayVV_2023_I_2215`, `BayVV_2023_I_2216`, `BayVV_2023_I_2281` | Aufstellung und Vollzug der Haushaltspläne der Kommunen – Aufstellung und Vollzug der Haushaltspläne der Kommunen |
| [`BayVV_2023_I_2273`](https://www.gesetze-bayern.de/Content/Document/BayVV_2023_I_2273) | 2016-03-31 | `BayVV_2023_I_2215`, `BayVV_2023_I_2216`, `BayVV_2023_I_2281` | Aufstellung und Vollzug der Haushaltspläne der Kommunen – Aufstellung und Vollzug der Haushaltspläne der Kommunen |
| [`BayVV_2023_I_2290`](https://www.gesetze-bayern.de/Content/Document/BayVV_2023_I_2290) | 2017-03-31 | `BayVV_2023_I_2215`, `BayVV_2023_I_2216`, `BayVV_2023_I_2281` | Aufstellung und Vollzug der Haushaltspläne der Kommunen – Aufstellung und Vollzug der Haushaltspläne der Kommunen |
| [`BayVV_2030_8_3_F_1011`](https://www.gesetze-bayern.de/Content/Document/BayVV_2030_8_3_F_1011) | 2017-01-01 | `BayVV_2030_8_3_F_977`, `BayVV_2030_8_3_F_1043`, `BayVV_2030_8_3_F_10126`, `BayVV_2030_8_3_F_10864`, `BayVV_2030_8_3_F_11726`, `BayVV_2030_8_3_F_12672`, `BayVV_2030_8_3_F_13046`, `BayVV_2030_8_3_F_13527`, `BayVV_2030_8_3_F_13655`, `BayVV_2030_8_3_F_14899`, `BayVV_2030_8_3_F_15428` | Vollzug der Bayerischen Beihilfeverordnung, Abführung von Renten- und Arbeitslosenversicherungsbeiträgen für Pflegepersonen – Vollzug der Bayerischen Beihilfeverordnung Abführung von Renten- und Arbeitslosenversicherungsbeiträgen für Pflegepersonen |
| [`BayVV_2032_6_F_1010`](https://www.gesetze-bayern.de/Content/Document/BayVV_2032_6_F_1010) | 2015-07-01 | `BayVV_2032_6_F_1042`, `BayVV_2032_6_F_10109`, `BayVV_2032_6_F_10865`, `BayVV_2032_6_F_11716`, `BayVV_2032_6_F_12698`, `BayVV_2032_6_F_13297`, `BayVV_2032_6_F_13522`, `BayVV_2032_6_F_14986`, `BayVV_2032_6_F_15374` | Sammelheizung aus dienstlichen Versorgungsleitungen – Sammelheizung aus dienstlichen Versorgungsleitungen |
| [`BayVV_2174_A_13383`](https://www.gesetze-bayern.de/Content/Document/BayVV_2174_A_13383) | 2023-01-01 | `BayVV_2174_A_10570`, `BayVV_2174_A_12788`, `BayVV_2174_A_13397` | Staatl. Förd. von Ausgaben für Second-Stage-Projekte – Staatliche Förderung von Ausgaben für Second-Stage-Projekte |
| [`BayVV_2176_I_15729`](https://www.gesetze-bayern.de/Content/Document/BayVV_2176_I_15729) | 2027-01-01 | `BayVV_2176_I_13878`, `BayVV_2176_I_14046`, `BayVV_2176_I_15397` | RL für die Förd. von Arbeitsintegrationsbegleiterinnen und -begleitern – Richtlinie für die Förderung von Arbeitsintegrationsbegleiterinnen und -begleitern |
| [`BayVV_2220_4_K_944`](https://www.gesetze-bayern.de/Content/Document/BayVV_2220_4_K_944) | 2016-05-31 | `BayVV_2220_4_K_969`, `BayVV_2220_4_K_972`, `BayVV_2220_4_K_996`, `BayVV_2220_4_K_1014`, `BayVV_2220_4_K_12782`, `BayVV_2220_4_K_13299`, `BayVV_2220_4_K_13411` | Orden und kirchliche Vereinigungen mit der Eigenschaft einer Körperschaft des öffentlichen Rechts – Orden und kirchliche Vereinigungen mit der Eigenschaft einer Körperschaft des öffentlichen Rechts |
| [`BayVV_2220_4_K_966`](https://www.gesetze-bayern.de/Content/Document/BayVV_2220_4_K_966) | 2017-02-02 | `BayVV_2220_4_K_969`, `BayVV_2220_4_K_972`, `BayVV_2220_4_K_996`, `BayVV_2220_4_K_1014`, `BayVV_2220_4_K_12782`, `BayVV_2220_4_K_13299`, `BayVV_2220_4_K_13411` | Orden und kirchliche Vereinigungen mit der Eigenschaft einer Körperschaft des öffentlichen Rechts – Orden und kirchliche Vereinigungen mit der Eigenschaft einer Körperschaft des öffentlichen Rechts |
| [`BayVV_2230_1_1_1_1_3_K_964`](https://www.gesetze-bayern.de/Content/Document/BayVV_2230_1_1_1_1_3_K_964) | 2016-12-15 | `BayVV_2230_1_1_1_1_3_K_873`, `BayVV_2230_1_1_1_1_3_K_962`, `BayVV_2230_1_1_1_1_3_K_984`, `BayVV_2230_1_1_1_1_3_K_13642` | RL für die Familien- und Sexualerziehung in den bayerischen Schulen – Richtlinien für die Familien- und Sexualerziehung in den bayerischen Schulen |
| [`BayVV_2231_A_13445`](https://www.gesetze-bayern.de/Content/Document/BayVV_2231_A_13445) | 2023-01-01 | `BayVV_2231_A_10881`, `BayVV_2231_A_11722`, `BayVV_2231_A_13823`, `BayVV_2231_A_13834`, `BayVV_2231_A_13999`, `BayVV_2231_A_15400`, `BayVV_2231_A_15436`, `BayVV_2231_A_15817` | RL zur Förd. des Einsatzes von Pädagogischen Qualitätsbegleiterinnen und Qualitätsbegleitern in Kindertageseinrichtungen und (Groß-)Tagespflegestellen – Richtlinie zur Förderung des Einsatzes von Pädagogischen Qualitätsbegleiterinnen und Qualitätsbegleitern (PQB) in Kindertageseinrichtungen und (Groß-)Tagespflegestellen |
| [`BayVV_2232_1_K_15674`](https://www.gesetze-bayern.de/Content/Document/BayVV_2232_1_K_15674) | 2026-10-01 | `BayVV_2232_1_K_15472`, `BayVV_2232_1_K_15726`, `BayVV_2232_1_K_15752` | Ferienangebote unter Schulaufsicht für Schülerinnen und Schüler im Grundschulalter – Ferienangebote unter Schulaufsicht für Schülerinnen und Schüler im Grundschulalter |
| [`BayVV_6322_F_998`](https://www.gesetze-bayern.de/Content/Document/BayVV_6322_F_998) | 2026-06-01 | `BayVV_6322_F_112` | EDV-Bestimmungen-Kasse – 6322-FBestimmungen für die Erteilung von Kassenanordnungen im automatisierten Buchführungsverfahren der Staatskassen (EDVBK) |

### Ältere Jahresfassungen kommunaler Haushaltsrundschreiben — 2

Jährlich wiederkehrende Bekanntmachungen zu Aufstellung und Vollzug der kommunalen Haushaltspläne, deren Kennung noch dem alten Schema folgt und deshalb keine Gliederungsnummer trägt. Das Portal hält ältere Jahrgänge weiter vor; der Fortführungsnachweis führt nur die jeweils geltende Fassung.

| Dokument-ID | Normtyp | Rechtsstand | Titel |
| --- | --- | --- | --- |
| [`BayStMIv06022008`](https://www.gesetze-bayern.de/Content/Document/BayStMIv06022008) | `vv` | 2008-02-28 | Finanzplanung 2007 bis 2011 der kommunalen Körperschaften und Hinweise zu verschiedenen Fragen des Haushaltsvollzugs – Finanzplanung 2007 bis 2011 der kommunalen Körperschaften und Hinweise zu verschiedenen Fragen des Haushaltsvollzugs |
| [`BayVwV236769`](https://www.gesetze-bayern.de/Content/Document/BayVwV236769) | `vv` | 2011-03-16 | Aufstellung und Vollzug der Haushaltspläne der Kommunen – Aufstellung und Vollzug der Haushaltspläne der Kommunen |

### Ungeklärt — 11

Aus Titel, Fundstelle und Normtyp allein nicht erklärbar. Diese Dokumente sind vor einem vollständigkeitsgeprüften Bulk-Lauf einzeln zu prüfen.

| Dokument-ID | Normtyp | Rechtsstand | Titel |
| --- | --- | --- | --- |
| [`BayBodSchO`](https://www.gesetze-bayern.de/Content/Document/BayBodSchO) | `vertr` | 2022-04-01 | Bodensee-Schifffahrts-Ordnung – Verordnung über die Schifffahrt auf dem Bodensee (BSO) |
| [`BayVV_237_B_10540`](https://www.gesetze-bayern.de/Content/Document/BayVV_237_B_10540) | `vv` | 2024-12-31 | Sonderprogramm Schwimmbadförderung – Richtlinien für das Sonderförderprogramm zur Sanierung kommunaler Schwimmbäder in Bayern (SPSF) |
| [`BayVV_282_1_1_1_2_UK_031`](https://www.gesetze-bayern.de/Content/Document/BayVV_282_1_1_1_2_UK_031) | `vv` | 2001-06-01 | Bildungspakt Bayern – Stiftung Bildungspakt Bayern - Stiftungszweck und Förderverfahren |
| [`BayVV_631_B_15643`](https://www.gesetze-bayern.de/Content/Document/BayVV_631_B_15643) | `vv` | 2026-06-01 | RL für die Durchführung von Hochbauaufgaben des Freistaates Bayern – Richtlinien für die Durchführung von Hochbauaufgaben des Freistaates Bayern (RLBau) |
| [`BayVV_2038_3_13_B_10514`](https://www.gesetze-bayern.de/Content/Document/BayVV_2038_3_13_B_10514) | `vv` | 2019-04-01 | Konzept zur modularen Qualifizierung in der Fachlaufbahn Naturwissenschaft und Technik, fachlicher Schwerpunkt bautechnischer und umweltfachlicher Verwaltungsdienst – Konzept zur modularen Qualifizierung in der Fachlaufbahn Naturwissenschaft und Technik, fachlicher Schwerpunkt bautechnischer und umweltfachlicher Verwaltungsdienst (VV-FachV-btuD) |
| [`BayVV_2210_2_1_6_5_1_K_721`](https://www.gesetze-bayern.de/Content/Document/BayVV_2210_2_1_6_5_1_K_721) | `vv` | 1962-08-30 | Unfallversicherung August-Lenz-Stiftung/Herzogliches Georgianum – Gesetzliche Unfallversicherung der Arbeitnehmer der August-Lenz-Stiftung und der Stiftung Herzogliches Georgianum |
| [`BayVV_2230_1_1_1_K_941`](https://www.gesetze-bayern.de/Content/Document/BayVV_2230_1_1_1_K_941) | `vv` | 2017-08-02 | Archivierungsvereinbarung zwischen dem Bayerischen Staatsministerium für Bildung und Kultus, Wissenschaft und Kunst und der Generaldirektion der Staatlichen Archive Bayerns – Archivierungsvereinbarung zwischen dem Bayerischen Staatsministerium für Bildung und Kultus, Wissenschaft und Kunst und der Generaldirektion der Staatlichen Archive Bayerns |
| [`BayVV_2230_7_1_K_10450`](https://www.gesetze-bayern.de/Content/Document/BayVV_2230_7_1_K_10450) | `vv` | 2019-01-01 | Durchführung der Härteregelung nach Art. 34a Abs. 2 BaySchFG – Durchführung der Härteregelung nach Art. 34a Abs. 2 BaySchFG |
| [`BayVV_2230_7_1_K_10559`](https://www.gesetze-bayern.de/Content/Document/BayVV_2230_7_1_K_10559) | `vv` | 2019-08-01 | Budgetierung der Leistungen für den notwendigen Schulaufwand an privaten Förderschulen und an privaten Schulen für Kranke – Budgetierung der Leistungen für den notwendigen Schulaufwand an privaten Förderschulen und an privaten Schulen für Kranke |
| [`BayVV_2242_1_2_WK_14938`](https://www.gesetze-bayern.de/Content/Document/BayVV_2242_1_2_WK_14938) | `vv` | 2025-01-01 | Verwaltungsverfahren bei der Inanspruchnahme des Entschädigungsfonds nach dem Denkmalschutzgesetz – Verwaltungsverfahren bei der Inanspruchnahme des Entschädigungsfonds nach dem Gesetz zum Schutz und zur Pflege der Denkmäler (Denkmalschutzgesetz – BayDSchG) |
| [`BayVV_3033_3_J_15366`](https://www.gesetze-bayern.de/Content/Document/BayVV_3033_3_J_15366) | `vv` | 2026-01-01 | Justizverwaltungsaktenordnung – 3033.3-JAktenordnung für Justizverwaltungsangelegenheiten in Bayern (AktO-JV) |

## Was das für den Bulk-Lauf bedeutet

1. **Der Fortführungsnachweis allein genügt nicht.** Er ist vollständig in dem, was er führt, aber er führt nicht alles, was das Portal als Vorschrift ausweist. Die Enumeration stützt sich deshalb auf beide Quellen und nimmt alle Dokumente der Facette auf.
2. **Kein Dokument geht verloren.** Die Gegenrichtung ist belegt leer: Es gibt keine ID, die nur der Nachweis kennt.
3. **Der Normtyp kommt ausschließlich aus der Facette.** Der Fortführungsnachweis nennt ihn nicht; die Endbuchstaben der BayRS-Nummer bezeichnen das Ressort, nicht die Rechtsform.

## Was offen bleibt

- 11 Dokumente lassen sich aus Titel, Fundstelle, Kennung und Normtyp nicht einordnen (oben einzeln aufgeführt); vor einem vollständigkeitsgeprüften Bulk-Lauf sind sie einzeln zu prüfen.
- Die naheliegende Erklärung „nicht im Amtsblatt bekannt gemacht“ trägt für diese Reste **nicht**: Die Dokumentseiten von `BayVV_2230_7_1_K_10450` („BayMBl. Nr. 218“, Bekanntmachung vom 28. Mai 2019) und `BayVV_631_B_15643` („BayMBl. Nr. 206“, Bekanntmachung vom 8. Mai 2026) nennen ausdrücklich eine BayMBl.-Fundstelle und fehlen im Fortführungsnachweis gleichwohl. Beide Seiten wurden dafür einzeln abgerufen.
- Warum der Fortführungsnachweis diese Vorschriften nicht führt, sagt die Quelle nirgends: Der Nachweis enthält weder Legende noch Aufnahmekriterium. Belegbar ist nur, dass er sie nicht führt.
- Ob die hier gefundenen Dokumente in den Bestand gehören, ist eine fachliche Entscheidung (Rechtsbegriff der Vorschrift, `docs/LEGAL_SCOPE.md`) und keine Frage der Enumeration. Die Enumeration führt sie und überlässt die Auswahl dem Review.
- Warum einzelne Titel im Fortführungsnachweis mit „*“ beginnen, sagt die Quelle ebenfalls nicht; eine Legende gibt es dort nicht.
