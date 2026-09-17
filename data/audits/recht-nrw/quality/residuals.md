# Quellreste (Abkürzungen, Text) und Slug-Qualität – Audit

Erzeugt mit `npm run audit:residuals` (offline, alle 1493 West-Normen). Nur Befund und Klassifikation; es wird nichts
geändert. Grundsatz aus `docs/RECHT_NRW_BULK_READINESS.md`: keine pauschale Ersetzung „NRW → West“, korrekter Text vor
kosmetischer Umbenennung. Slugs sind dauerhafte Adressen (keine Migration).

## Abkürzungen mit Landesbezeichnung (8)

| Kategorie | Anzahl |
| --- | --- |
| amtliche-abkuerzung-mit-landeszusatz | 6 |
| externe-institution-oder-programm | 2 |

Transformer deckt die Kurzform „NW“ nach Gesetzesabkürzungen ab: nein (nur „NRW“; siehe Regelvorschlag).

| Norm | Abkürzung | Quelle | Typ | Kategorie | Begründung | Empfehlung |
| --- | --- | --- | --- | --- | --- | --- |
| bvsg-nw-west | BVSG NW | official | gesetz | amtliche-abkuerzung-mit-landeszusatz | amtliche Abkürzung „BVSG“ mit Landeszusatz in der Kurzform „NW“; Transformregeln decken nur „NRW“ ab (jurisdiction-abbreviation-known-law-*), die Kurzform bleibt daher als Quellrest stehen | Regelvorschlag (nicht angewendet, erfordert Transformer-Versionssprung + Regenerationslauf): Kurzform „NW“ nach bekannter Gesetzesabkürzung → „BVSG West“; nur mit known-law-Menge, keine pauschale NW-Ersetzung |
| gdsg-nw-west | GDSG NW | official | gesetz | amtliche-abkuerzung-mit-landeszusatz | amtliche Abkürzung „GDSG“ mit Landeszusatz in der Kurzform „NW“; Transformregeln decken nur „NRW“ ab (jurisdiction-abbreviation-known-law-*), die Kurzform bleibt daher als Quellrest stehen | Regelvorschlag (nicht angewendet, erfordert Transformer-Versionssprung + Regenerationslauf): Kurzform „NW“ nach bekannter Gesetzesabkürzung → „GDSG West“; nur mit known-law-Menge, keine pauschale NW-Ersetzung |
| gno-nw-west | GnO NW | official | verordnung | amtliche-abkuerzung-mit-landeszusatz | amtliche Abkürzung „GnO“ mit Landeszusatz in der Kurzform „NW“; Transformregeln decken nur „NRW“ ab (jurisdiction-abbreviation-known-law-*), die Kurzform bleibt daher als Quellrest stehen | Regelvorschlag (nicht angewendet, erfordert Transformer-Versionssprung + Regenerationslauf): Kurzform „NW“ nach bekannter Gesetzesabkürzung → „GnO West“; nur mit known-law-Menge, keine pauschale NW-Ersetzung |
| it-nrw-west | IT.NRW | official | verordnung | externe-institution-oder-programm | Eigenname einer Einrichtung oder eines Programms | Institutionen-Zuordnung (institution-mapping.json), keine Textersetzung |
| notvg-nw-west | NotVG NW | official | gesetz | amtliche-abkuerzung-mit-landeszusatz | amtliche Abkürzung „NotVG“ mit Landeszusatz in der Kurzform „NW“; Transformregeln decken nur „NRW“ ab (jurisdiction-abbreviation-known-law-*), die Kurzform bleibt daher als Quellrest stehen | Regelvorschlag (nicht angewendet, erfordert Transformer-Versionssprung + Regenerationslauf): Kurzform „NW“ nach bekannter Gesetzesabkürzung → „NotVG West“; nur mit known-law-Menge, keine pauschale NW-Ersetzung |
| ravg-nw-west | RAVG NW | official | gesetz | amtliche-abkuerzung-mit-landeszusatz | amtliche Abkürzung „RAVG“ mit Landeszusatz in der Kurzform „NW“; Transformregeln decken nur „NRW“ ab (jurisdiction-abbreviation-known-law-*), die Kurzform bleibt daher als Quellrest stehen | Regelvorschlag (nicht angewendet, erfordert Transformer-Versionssprung + Regenerationslauf): Kurzform „NW“ nach bekannter Gesetzesabkürzung → „RAVG West“; nur mit known-law-Menge, keine pauschale NW-Ersetzung |
| stbvg-nw-west | StBVG NW | official | gesetz | amtliche-abkuerzung-mit-landeszusatz | amtliche Abkürzung „StBVG“ mit Landeszusatz in der Kurzform „NW“; Transformregeln decken nur „NRW“ ab (jurisdiction-abbreviation-known-law-*), die Kurzform bleibt daher als Quellrest stehen | Regelvorschlag (nicht angewendet, erfordert Transformer-Versionssprung + Regenerationslauf): Kurzform „NW“ nach bekannter Gesetzesabkürzung → „StBVG West“; nur mit known-law-Menge, keine pauschale NW-Ersetzung |
| vital-nrw-richtlinie-west | VITAL.NRW-Richtlinie | official | foerderrichtlinie | externe-institution-oder-programm | Eigenname einer Einrichtung oder eines Programms | Institutionen-Zuordnung (institution-mapping.json), keine Textersetzung |

## Textstellen mit „NW“ / „NRW“ nach Kontext

Fundstellen (`GV. NW.`, `MBl. NW.`) und Eigennamen sind geschützt (Regel `gazette-nw` bzw. Institutionenregister) und
bleiben bewusst stehen. Zeilen ohne Schutz sind Kandidaten für die Transformlücke „NW“ oder Review.

| Kontext | geschützt | Vorkommen | Normen | Beispiele |
| --- | --- | --- | --- | --- |
| Fundstelle GV./SGV. NW. | ja | 1587 | 346 | 3-rundfunkaenderungsgesetz-west: …. 1 des 5. RundfunkÄndG v. 22. 9. 1992 (GV. NW. S. 346), § 1 d. VO v. 22. 6. 1993 (GV. NW.… ‖ 3-rundfunkaenderungsgesetz-west: …ch § 4 d. 4. FrequenzVO v. 19. 3. 1994 (GV. NW. S. 132).… |
| Fundstelle MBl./SMBl. NW. | ja | 1 | 1 | allgemeines-berggesetz-west: …ndert auf Grund der Bek. v. 1. 5. 1961 (MBl. NW. S. 1072).… |
| Abkürzung + NW (z. B. „GnO NW“) | nein | 141 | 71 | 3-rundfunkaenderungsgesetz-west: …Entsprechend § 3 Abs. 1-6 LRG NW in der Fassung dieses Gesetzes, jedoch abwe… ‖ 3-rundfunkaenderungsgesetz-west: …len Hörfunk durch Veranstalter nach dem LRG NW der LfR zugeordnet:… |
| NW sonstig (Wortgrenze) | nein | 190 | 80 | abubesvg-west: …Veröffentlicht durch Art. 1 des RBG 87 NW. v. 6. 10. 1987; GV. NW. ausgegeben am 12. Okto… ‖ allgemeines-berggesetz-west: … (PrGS. S. 119) und v. 25. 5. 1954 (GS. NW. S. 694) erfolgten Fassung.… |
| NRW (Wortgrenze, nach Transformation verbleibend) | nein | 18546 | 1283 | 5-rundfunkaenderungsgesetz-west: …kel 6 des Gesetzes vom 8. Mai 2018 (GV. NRW. S. 214), in Kraft getreten am 25. Mai 2018.… ‖ 5-rundfunkaenderungsgesetz-west: …taatsvertrages vom 31. August 1991 (GV. NRW. S. 408), der zuletzt durch Artikel 1 des Neun… |
| Eigenname mit .NRW / NRW.BANK | ja | 169 | 59 | apo-os-west: …Artikel der Verordnung vom 1. Mai 2020 (GV.NRW. S. 312b), in Kraft getreten am 2. Mai 2020… ‖ arzneimittelbevorratungsverordnung-west: …gesetzes für das Land Westdeutschland - VwVfG.NRW - in der Fassung der Bekanntmachung vom … |

## Slug-Qualität

| Code | Schwere | Anzahl | Bewertung |
| --- | --- | --- | --- |
| slug-collision-suffix | info | 138 | technisch korrekt und stabil; redaktionell unschön, wenn zwei Stammnormen denselben Titel tragen (Neufassung als eigener Datensatz). Keine Migration. |
| slug-double-jurisdiction-suffix | warning | 0 | wäre ein Ableitungsfehler. |
| slug-jurisdiction-in-title-no-suffix | info | 24 | gewollt: der transformierte Titel endet auf „Westdeutschland“, ein zusätzliches „-west“ würde doppeln; eindeutig und lesbar. |
| slug-residual-source-state | warning | 11 | aus amtlichen Abkürzungen („GnO NW“) oder Eigennamen (IT.NRW, NRW.BANK, VITAL.NRW, Servicekonto.NRW) abgeleitet; Adressen bleiben, Bewertung in der Abkürzungstabelle. |
| slug-generic-only | warning | 0 | nicht unterscheidbar; müsste aus Abkürzung oder Titelteil ergänzt werden. |
| slug-very-short-ambiguous | info | 65 | aus amtlichen Abkürzungen (GO, LBG, HG …) – amtlich und gebräuchlich, im Land eindeutig. |
| slug-truncated-title | info | 384 | Längenkürzung vor dem Landeszusatz; unverständliches Ende, aber eindeutig. Vorschlag nur für künftige Ableitungen: auf Wortgrenze kürzen und Funktionswörter am Ende entfernen (siehe naming.md). |
| slug-long | info | 41 | innerhalb der Längengrenze, keine Änderung. |
| slug-digit-leading | info | 2 | aus dem Titel („3. Rundfunkänderungsgesetz“), gültig. |

Kollisionsgruppen (gleicher Stamm, Term-ID als Suffix): 59, davon mit identischem Titel 6.
Detailtabellen mit Vorschlägen: `naming.md` (Codes `slug-truncated-title`, Kollisionssuffixe).

### Rest der Quell-Landesbezeichnung (nrw/nw) (11)

- `anpassungsgesetz-anpg-nw-west` – Gesetz zur Anpassung landesrechtlicher Straf- und Bußgeldvorschriften an das Bundesrecht
- `bvsg-nw-west` – Gesetz über einen Bergmannsversorgungsschein im Land Westdeutschland
- `gdsg-nw-west` – Gesetz zum Schutz personenbezogener Daten im Gesundheitswesen
- `gesetz-ueber-die-nrw-bank-nrw-bank-g-west` – Gesetz über die NRW.BANK (NRW.BANK G)
- `gno-nw-west` – Das Verfahren in Gnadensachen - Gnadenordnung für das Land Westdeutschland
- `it-nrw-west` – Verordnung zur Regelung der Abnahme von Leistungen des Landesbetriebes Information und Technik Westdeutschland durch Dienststellen der Landesverwaltung (LeistungsabnahmeVO IT.NRW) (Fn 4)
- `notvg-nw-west` – Gesetz über das Notarversorgungswerk Köln
- `ravg-nw-west` – Gesetz über die Rechtsanwaltsversorgung
- `servicekonto-nrw-verordnung-west` – Verordnung zur Regelung der behördenübergreifenden Bereitstellung und zum Betrieb von IT-Infrastrukturkomponenten und Anwendungen zum elektronischen Nachweis der Identität nach § 3 Absatz 3 bis 5 des E-Government-Gesetzes Westdeutschland
- `stbvg-nw-west` – Gesetz über die Versorgung der Steuerberaterinnen und Steuerberater
- `vital-nrw-richtlinie-west` – Richtlinie über die Gewährung von Zuwendungen zur Förderung von Verantwortung, Innovation und Tatkraft im Rahmen der Entwicklung attraktiver ländlicher Räume Runderlass des Ministeriums für Klimaschutz, Umwelt, Landwirtschaft, Natur- und Verbraucherschutz - IIB2. 2090.05.02 vom 7. Februar 2017

### Kollisionsgruppen (59)

| Stamm | Slugs | gleicher Titel |
| --- | --- | --- |
| ausfuehrungsgesetz-zum-buergerlichen-gesetzbuch | ausfuehrungsgesetz-zum-buergerlichen-gesetzbuch-west, ausfuehrungsgesetz-zum-buergerlichen-gesetzbuch-west-29214 | ja |
| bbig | bbig-west, bbig-west-29206 | nein |
| beschaffung-von-leistungen-zum-zweck-der-unterbringung-sicherheit | beschaffung-von-leistungen-zum-zweck-der-unterbringung-sicherheit-west, beschaffung-von-leistungen-zum-zweck-der-unterbringung-sicherheit-west-31360 | nein |
| blb | blb-west, blb-west-31302 | nein |
| efre | efre-west, efre-west-31343 | nein |
| eu | eu-west, eu-west-28724, eu-west-31328 | nein |
| foeri-mm | foeri-mm-west, foeri-mm-west-32422 | nein |
| gesetz-ueber-die-errichtung-und-den-betrieb-einer-rohrleitungsanlage | gesetz-ueber-die-errichtung-und-den-betrieb-einer-rohrleitungsanlage-west, gesetz-ueber-die-errichtung-und-den-betrieb-einer-rohrleitungsanlage-west-29131 | nein |
| gesetz-ueber-die-verleihung-der-rechte-einer-koerperschaft-des | gesetz-ueber-die-verleihung-der-rechte-einer-koerperschaft-des-west, gesetz-ueber-die-verleihung-der-rechte-einer-koerperschaft-des-west-27493, gesetz-ueber-die-verleihung-der-rechte-einer-koerperschaft-des-west-27495, gesetz-ueber-die-verleihung-der-rechte-einer-koerperschaft-des-west-27496, gesetz-ueber-die-verleihung-der-rechte-einer-koerperschaft-des-west-27498, gesetz-ueber-die-verleihung-der-rechte-einer-koerperschaft-des-west-27503, gesetz-ueber-die-verleihung-der-rechte-einer-koerperschaft-des-west-27505, gesetz-ueber-die-verleihung-der-rechte-einer-koerperschaft-des-west-27507, gesetz-ueber-die-verleihung-der-rechte-einer-koerperschaft-des-west-27508, gesetz-ueber-die-verleihung-der-rechte-einer-koerperschaft-des-west-27509, gesetz-ueber-die-verleihung-der-rechte-einer-koerperschaft-des-west-27510, gesetz-ueber-die-verleihung-der-rechte-einer-koerperschaft-des-west-27511, gesetz-ueber-die-verleihung-der-rechte-einer-koerperschaft-des-west-27517, gesetz-ueber-die-verleihung-der-rechte-einer-koerperschaft-des-west-27521, gesetz-ueber-die-verleihung-der-rechte-einer-koerperschaft-des-west-28806, gesetz-ueber-die-verleihung-der-rechte-einer-koerperschaft-des-west-28807 | nein |
| gesetz-ueber-die-verleihung-der-rechtsstellung-einer-anstalt-des | gesetz-ueber-die-verleihung-der-rechtsstellung-einer-anstalt-des-west, gesetz-ueber-die-verleihung-der-rechtsstellung-einer-anstalt-des-west-27519 | nein |
| gesetz-zur-eingliederung-der-versorgungsaemter-in-die-allgemeine | gesetz-zur-eingliederung-der-versorgungsaemter-in-die-allgemeine-west, gesetz-zur-eingliederung-der-versorgungsaemter-in-die-allgemeine-west-29476 | ja |
| hg | hg-west, hg-west-31126 | ja |
| hzg | hzg-west, hzg-west-32524 | nein |
| kistg | kistg-west, kistg-west-29325 | nein |
| ldg | ldg-west, ldg-west-29215 | nein |
| ljg | ljg-west, ljg-west-32728 | nein |
| ordnungsbehoerdliche-verordnung-ueber-die-selbstueberwachung-von | ordnungsbehoerdliche-verordnung-ueber-die-selbstueberwachung-von-west, ordnungsbehoerdliche-verordnung-ueber-die-selbstueberwachung-von-west-27890 | ja |
| richtlinie-des-landes-zur-kofinanzierung-des-bundesprogramms-foerderung | richtlinie-des-landes-zur-kofinanzierung-des-bundesprogramms-foerderung-west, richtlinie-des-landes-zur-kofinanzierung-des-bundesprogramms-foerderung-west-33925 | nein |
| richtlinie-fuer-die-gewaehrung-von-finanzierungshilfen-zur-foerderung | richtlinie-fuer-die-gewaehrung-von-finanzierungshilfen-zur-foerderung-west, richtlinie-fuer-die-gewaehrung-von-finanzierungshilfen-zur-foerderung-west-33791 | nein |
| richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-des-landes | richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-des-landes-west, richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-des-landes-west-33531, richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-des-landes-west-33758, richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-des-landes-west-33876 | nein |
| richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-fuer-die | richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-fuer-die-west, richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-fuer-die-west-33228 | nein |
| richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-fuer | richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-fuer-west, richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-fuer-west-33783, richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-fuer-west-33803, richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-fuer-west-33823, richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-fuer-west-33849 | nein |
| richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-zur | richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-zur-west, richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-zur-west-33836 | nein |
| richtlinie-ueber-die-gewaehrung-von-zuwendungen-aus-dem-programm-fuer | richtlinie-ueber-die-gewaehrung-von-zuwendungen-aus-dem-programm-fuer-west, richtlinie-ueber-die-gewaehrung-von-zuwendungen-aus-dem-programm-fuer-west-31313, richtlinie-ueber-die-gewaehrung-von-zuwendungen-aus-dem-programm-fuer-west-33462, richtlinie-ueber-die-gewaehrung-von-zuwendungen-aus-dem-programm-fuer-west-33617, richtlinie-ueber-die-gewaehrung-von-zuwendungen-aus-dem-programm-fuer-west-33748, richtlinie-ueber-die-gewaehrung-von-zuwendungen-aus-dem-programm-fuer-west-33922 | nein |
| richtlinie-ueber-die-gewaehrung-von-zuwendungen-fuer-massnahmen-zur | richtlinie-ueber-die-gewaehrung-von-zuwendungen-fuer-massnahmen-zur-west, richtlinie-ueber-die-gewaehrung-von-zuwendungen-fuer-massnahmen-zur-west-32426 | nein |
| richtlinie-ueber-die-gewaehrung-von-zuwendungen-zur-foerderung-der | richtlinie-ueber-die-gewaehrung-von-zuwendungen-zur-foerderung-der-west, richtlinie-ueber-die-gewaehrung-von-zuwendungen-zur-foerderung-der-west-31575, richtlinie-ueber-die-gewaehrung-von-zuwendungen-zur-foerderung-der-west-32354, richtlinie-ueber-die-gewaehrung-von-zuwendungen-zur-foerderung-der-west-32502, richtlinie-ueber-die-gewaehrung-von-zuwendungen-zur-foerderung-der-west-33137, richtlinie-ueber-die-gewaehrung-von-zuwendungen-zur-foerderung-der-west-33741 | nein |
| richtlinie-ueber-die-gewaehrung-von-zuwendungen-zur-foerderung-von | richtlinie-ueber-die-gewaehrung-von-zuwendungen-zur-foerderung-von-west, richtlinie-ueber-die-gewaehrung-von-zuwendungen-zur-foerderung-von-west-32480, richtlinie-ueber-die-gewaehrung-von-zuwendungen-zur-foerderung-von-west-33903 | nein |
| richtlinie-ueber-die-gewaehrung-von-zuwendungen-zur-foerderung | richtlinie-ueber-die-gewaehrung-von-zuwendungen-zur-foerderung-west, richtlinie-ueber-die-gewaehrung-von-zuwendungen-zur-foerderung-west-33230, richtlinie-ueber-die-gewaehrung-von-zuwendungen-zur-foerderung-west-33864 | nein |
| richtlinien-fuer-das-beschaffungswesen-im-geschaeftsbereich-des | richtlinien-fuer-das-beschaffungswesen-im-geschaeftsbereich-des-west, richtlinien-fuer-das-beschaffungswesen-im-geschaeftsbereich-des-west-32390 | ja |
| richtlinien-fuer-die-dienstliche-beurteilung-der-beamtinnen-und-beamten | richtlinien-fuer-die-dienstliche-beurteilung-der-beamtinnen-und-beamten-west, richtlinien-fuer-die-dienstliche-beurteilung-der-beamtinnen-und-beamten-west-31545 | nein |
| schulbaur | schulbaur-west, schulbaur-west-32424 | nein |
| unterweisungszeit-beim-laufbahnwechsel-von-polizeidienstunfaehigen | unterweisungszeit-beim-laufbahnwechsel-von-polizeidienstunfaehigen-west, unterweisungszeit-beim-laufbahnwechsel-von-polizeidienstunfaehigen-west-32251 | nein |
| verordnung-ueber-beamtenrechtliche-und-disziplinarrechtliche | verordnung-ueber-beamtenrechtliche-und-disziplinarrechtliche-west, verordnung-ueber-beamtenrechtliche-und-disziplinarrechtliche-west-32245 | nein |
| verordnung-ueber-die-anwendung-landesgesetzlicher-vorschriften-ueber | verordnung-ueber-die-anwendung-landesgesetzlicher-vorschriften-ueber-west, verordnung-ueber-die-anwendung-landesgesetzlicher-vorschriften-ueber-west-27070 | ja |
| verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-des | verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-des-west, verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-des-west-29682, verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-des-west-30018, verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-des-west-30286, verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-des-west-32344, verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-des-west-32379, verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-des-west-32796, verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-des-west-33321, verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-des-west-33702, verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-des-west-33818 | nein |
| verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-laufbahn-der | verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-laufbahn-der-west, verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-laufbahn-der-west-27264, verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-laufbahn-der-west-31122 | nein |
| verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-laufbahn-des | verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-laufbahn-des-west, verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-laufbahn-des-west-33113 | nein |
| verordnung-ueber-die-berufliche-entwicklung-durch-qualifizierung | verordnung-ueber-die-berufliche-entwicklung-durch-qualifizierung-west, verordnung-ueber-die-berufliche-entwicklung-durch-qualifizierung-west-31164, verordnung-ueber-die-berufliche-entwicklung-durch-qualifizierung-west-31273 | nein |
| verordnung-ueber-die-berufung-der-ehrenamtlichen-richterinnen-und | verordnung-ueber-die-berufung-der-ehrenamtlichen-richterinnen-und-west, verordnung-ueber-die-berufung-der-ehrenamtlichen-richterinnen-und-west-28327 | nein |
| verordnung-ueber-die-durchfuehrung-von-ausgleichsmassnahmen-nach-dem | verordnung-ueber-die-durchfuehrung-von-ausgleichsmassnahmen-nach-dem-west, verordnung-ueber-die-durchfuehrung-von-ausgleichsmassnahmen-nach-dem-west-31456, verordnung-ueber-die-durchfuehrung-von-ausgleichsmassnahmen-nach-dem-west-32219 | nein |
| verordnung-ueber-die-ermaechtigung-des-justizministeriums-zum-erlass-von | verordnung-ueber-die-ermaechtigung-des-justizministeriums-zum-erlass-von-west, verordnung-ueber-die-ermaechtigung-des-justizministeriums-zum-erlass-von-west-26575, verordnung-ueber-die-ermaechtigung-des-justizministeriums-zum-erlass-von-west-26576, verordnung-ueber-die-ermaechtigung-des-justizministeriums-zum-erlass-von-west-26579, verordnung-ueber-die-ermaechtigung-des-justizministeriums-zum-erlass-von-west-26582, verordnung-ueber-die-ermaechtigung-des-justizministeriums-zum-erlass-von-west-28123, verordnung-ueber-die-ermaechtigung-des-justizministeriums-zum-erlass-von-west-28174, verordnung-ueber-die-ermaechtigung-des-justizministeriums-zum-erlass-von-west-28186, verordnung-ueber-die-ermaechtigung-des-justizministeriums-zum-erlass-von-west-28249, verordnung-ueber-die-ermaechtigung-des-justizministeriums-zum-erlass-von-west-28266, verordnung-ueber-die-ermaechtigung-des-justizministeriums-zum-erlass-von-west-28401, verordnung-ueber-die-ermaechtigung-des-justizministeriums-zum-erlass-von-west-28402, verordnung-ueber-die-ermaechtigung-des-justizministeriums-zum-erlass-von-west-28723, verordnung-ueber-die-ermaechtigung-des-justizministeriums-zum-erlass-von-west-28902, verordnung-ueber-die-ermaechtigung-des-justizministeriums-zum-erlass-von-west-29041, verordnung-ueber-die-ermaechtigung-des-justizministeriums-zum-erlass-von-west-29151 | nein |
| verordnung-ueber-die-ermaechtigung-des-justizministers-zum-erlass-von | verordnung-ueber-die-ermaechtigung-des-justizministers-zum-erlass-von-west, verordnung-ueber-die-ermaechtigung-des-justizministers-zum-erlass-von-west-26564, verordnung-ueber-die-ermaechtigung-des-justizministers-zum-erlass-von-west-26608, verordnung-ueber-die-ermaechtigung-des-justizministers-zum-erlass-von-west-26629, verordnung-ueber-die-ermaechtigung-des-justizministers-zum-erlass-von-west-26645 | nein |
| verordnung-ueber-die-festsetzung-von-zulassungszahlen-und-die-vergabe | verordnung-ueber-die-festsetzung-von-zulassungszahlen-und-die-vergabe-west, verordnung-ueber-die-festsetzung-von-zulassungszahlen-und-die-vergabe-west-32954, verordnung-ueber-die-festsetzung-von-zulassungszahlen-und-die-vergabe-west-33873 | nein |
| verordnung-ueber-die-gerichtliche-zustaendigkeit-zur-entscheidung-in | verordnung-ueber-die-gerichtliche-zustaendigkeit-zur-entscheidung-in-west, verordnung-ueber-die-gerichtliche-zustaendigkeit-zur-entscheidung-in-west-30183, verordnung-ueber-die-gerichtliche-zustaendigkeit-zur-entscheidung-in-west-33262 | nein |
| verordnung-ueber-die-technischen-und-organisatorischen-rahmenbedingungen | verordnung-ueber-die-technischen-und-organisatorischen-rahmenbedingungen-west, verordnung-ueber-die-technischen-und-organisatorischen-rahmenbedingungen-west-32772 | nein |
| verordnung-ueber-die-zustaendigkeit-fuer-die-verfolgung-und-ahndung-von | verordnung-ueber-die-zustaendigkeit-fuer-die-verfolgung-und-ahndung-von-west, verordnung-ueber-die-zustaendigkeit-fuer-die-verfolgung-und-ahndung-von-west-29630 | nein |
| verordnung-zur-anpassung-der-grenzen-der-amtsgerichtsbezirke | verordnung-zur-anpassung-der-grenzen-der-amtsgerichtsbezirke-west, verordnung-zur-anpassung-der-grenzen-der-amtsgerichtsbezirke-west-26581, verordnung-zur-anpassung-der-grenzen-der-amtsgerichtsbezirke-west-28238 | nein |
| verordnung-zur-bestimmung-der-fuer-die-verfolgung-und-ahndung-von | verordnung-zur-bestimmung-der-fuer-die-verfolgung-und-ahndung-von-west, verordnung-zur-bestimmung-der-fuer-die-verfolgung-und-ahndung-von-west-26684, verordnung-zur-bestimmung-der-fuer-die-verfolgung-und-ahndung-von-west-26689, verordnung-zur-bestimmung-der-fuer-die-verfolgung-und-ahndung-von-west-26695, verordnung-zur-bestimmung-der-fuer-die-verfolgung-und-ahndung-von-west-31024 | nein |
| verordnung-zur-bestimmung-der-lebens-oder-verteidigungswichtigen | verordnung-zur-bestimmung-der-lebens-oder-verteidigungswichtigen-west, verordnung-zur-bestimmung-der-lebens-oder-verteidigungswichtigen-west-26537, verordnung-zur-bestimmung-der-lebens-oder-verteidigungswichtigen-west-31810 | nein |
| verordnung-zur-elektronischen-aktenfuehrung-bei-den-gerichten-der | verordnung-zur-elektronischen-aktenfuehrung-bei-den-gerichten-der-west, verordnung-zur-elektronischen-aktenfuehrung-bei-den-gerichten-der-west-31795, verordnung-zur-elektronischen-aktenfuehrung-bei-den-gerichten-der-west-32259, verordnung-zur-elektronischen-aktenfuehrung-bei-den-gerichten-der-west-33053 | nein |
| verordnung-zur-neuordnung-der-sparkasse-krefeld-und-der-stadtsparkasse | verordnung-zur-neuordnung-der-sparkasse-krefeld-und-der-stadtsparkasse-west, verordnung-zur-neuordnung-der-sparkasse-krefeld-und-der-stadtsparkasse-west-26852 | nein |
| verordnung-zur-regelung-von-zustaendigkeiten-auf-dem-gebiet-des | verordnung-zur-regelung-von-zustaendigkeiten-auf-dem-gebiet-des-west, verordnung-zur-regelung-von-zustaendigkeiten-auf-dem-gebiet-des-west-26827, verordnung-zur-regelung-von-zustaendigkeiten-auf-dem-gebiet-des-west-31025 | nein |
| verordnung-zur-regelung-von-zustaendigkeiten-nach-dem | verordnung-zur-regelung-von-zustaendigkeiten-nach-dem-west, verordnung-zur-regelung-von-zustaendigkeiten-nach-dem-west-31634 | nein |
| verordnung-zur-uebertragung-von-befugnissen-nach-den-57-bis-59-der | verordnung-zur-uebertragung-von-befugnissen-nach-den-57-bis-59-der-west, verordnung-zur-uebertragung-von-befugnissen-nach-den-57-bis-59-der-west-30931, verordnung-zur-uebertragung-von-befugnissen-nach-den-57-bis-59-der-west-32096, verordnung-zur-uebertragung-von-befugnissen-nach-den-57-bis-59-der-west-33874 | nein |
| verordnung-zur-uebertragung-von-ermaechtigungen-zum-erlass-von | verordnung-zur-uebertragung-von-ermaechtigungen-zum-erlass-von-west, verordnung-zur-uebertragung-von-ermaechtigungen-zum-erlass-von-west-28354 | nein |
| verordnung-zur-verleihung-der-rechte-einer-koerperschaft-des | verordnung-zur-verleihung-der-rechte-einer-koerperschaft-des-west, verordnung-zur-verleihung-der-rechte-einer-koerperschaft-des-west-31266, verordnung-zur-verleihung-der-rechte-einer-koerperschaft-des-west-31412, verordnung-zur-verleihung-der-rechte-einer-koerperschaft-des-west-31441, verordnung-zur-verleihung-der-rechte-einer-koerperschaft-des-west-31743, verordnung-zur-verleihung-der-rechte-einer-koerperschaft-des-west-31776, verordnung-zur-verleihung-der-rechte-einer-koerperschaft-des-west-32111, verordnung-zur-verleihung-der-rechte-einer-koerperschaft-des-west-32112, verordnung-zur-verleihung-der-rechte-einer-koerperschaft-des-west-32512, verordnung-zur-verleihung-der-rechte-einer-koerperschaft-des-west-32901 | nein |
| vivbveg | vivbveg-west, vivbveg-west-28188, vivbveg-west-28431 | nein |
| wbg | wbg-west, wbg-west-28587 | nein |
| wfng | wfng-west, wfng-west-33320 | nein |
