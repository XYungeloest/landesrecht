# Human Approval – West Reference Baseline

West Reference Baseline · Stichtag 2023-12-01 · 21 Ausnahmen · 5 Deliver-Legacy · 16 Depublikation/Regression

Stand: 2026-09-17T06:50:04.519Z · Quelle: `data/imports/recht-nrw/legacy-exceptions.json` (vorbereitet durch `automated-review`) · maschinenlesbar: `data/audits/recht-nrw/human-approval-west.json` · Erzeugung: `npm run import:recht-nrw:approval-report -- --write`

Freigabestatus: 21 ausstehend · 0 freigegeben · 0 nicht freigegeben. Risiko: 13 low · 4 medium · 4 high. Empfehlungen: 5 × DELIVER-LEGACY BEIBEHALTEN · 12 × DEPUBLIKATION BEIBEHALTEN · 4 × MENSCHLICHE ENTSCHEIDUNG ERFORDERLICH.

Dieser Report bereitet die redaktionelle Entscheidung vor; er ersetzt sie nicht. Jede Empfehlung folgt den dokumentierten Regeln in `packages/importers/recht-nrw/src/common/human-approval.ts` und ist aus Ausnahmefeldern, Manifest-Evidenz, Evidence-Pass-Fällen und Review-Shards abgeleitet. Beweisklassen: **strong/contradictory** tragen die Entscheidung, **supporting** ergänzt, **insufficient** trägt nie allein. Risikoklassen: **low** = eindeutiger amtlicher Beleg bzw. reine Strukturabweichung ohne Textverlust; **medium** = mehrere Belege oder Legacy mit struktureller Einschränkung; **high** = widersprüchliche/unvollständige Evidenz. Die 16 Depublikationen sind ausgeführt (Versionsreport: gegenstandslos) und bleiben hier als Depublikations-Entscheidung zur Bestätigung; sie werden nicht als `superseded` geführt.

Entscheidung eintragen: `npm run import:recht-nrw:approval -- --term term:<id> --decision approve|reject --reason "…" [--approved-by "…"] --write` · Status: `npm run import:recht-nrw:approval-status`.

## Übersicht

| Nr. | Term-ID | Titel | Typ | Entscheidung (Vorschlag) | Grund | Amtlicher Beleg | Textintegrität | Aktueller Status | Risiko | Nutzerentscheidung |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | term:30782 | Richtlinien über die Gewährung von Zuwendungen zur Förderung der Ausb… | depublish | DEPUBLIKATION BEIBEHALTEN | validity-expired-before-baseline | Eigene Außerkrafttretensformel 2013-12-31 [strong] | identisch (Fassungsseite) | depubliziert | low | AUSSTEHEND |
| 2 | term:30825 | Richtlinie zur Berücksichtigung von bürgerschaftlichem Engagement bei… | depublish | DEPUBLIKATION BEIBEHALTEN | validity-expired-before-baseline | Eigene Außerkrafttretensformel 2017-12-31 [strong] | identisch (Fassungsseite) | depubliziert | low | AUSSTEHEND |
| 3 | term:30978 | Richtlinie über die Gewährung von Zuwendungen für die Umrüstung von n… | depublish | DEPUBLIKATION BEIBEHALTEN | validity-expired-before-baseline | Eigene Außerkrafttretensformel 2014-12-31 [strong] | identisch (Fassungsseite) | depubliziert | low | AUSSTEHEND |
| 4 | term:31221 | Richtlinien über die Gewährung von Zuwendungen an freie Träger für Pr… | depublish | DEPUBLIKATION BEIBEHALTEN | validity-expired-before-baseline | Eigene Außerkrafttretensformel 2018-12-31 [strong] | identisch (Fassungsseite) | depubliziert | low | AUSSTEHEND |
| 5 | term:31313 | Richtlinie über die Gewährung von Zuwendungen aus dem „Programm für r… | depublish | DEPUBLIKATION BEIBEHALTEN | validity-expired-before-baseline | Eigene Außerkrafttretensformel 2020-12-31 [strong] | identisch (Fassungsseite) | depubliziert | low | AUSSTEHEND |
| 6 | term:31771 | Verwaltungsvorschrift über die Legitimations- und Kennzeichnungspflic… | depublish | DEPUBLIKATION BEIBEHALTEN | validity-expired-before-baseline | Eigene Außerkrafttretensformel 2022-12-31 [strong] | identisch (Fassungsseite) | depubliziert | low | AUSSTEHEND |
| 7 | term:31908 | Verwaltungsvorschrift Technische Baubestimmungen (VV TB) Runderlass d… | depublish | DEPUBLIKATION BEIBEHALTEN | validity-expired-before-baseline | Eigene Außerkrafttretensformel 2022-06-27 [strong] | identisch (Fassungsseite) | depubliziert | low | AUSSTEHEND |
| 8 | term:31967 | Richtlinie über die Gewährung von Zuwendungen an Betreiber von Fähren… | depublish | DEPUBLIKATION BEIBEHALTEN | validity-expired-before-baseline | Eigene Außerkrafttretensformel 2019-12-31 [strong] | identisch (Fassungsseite) | depubliziert | low | AUSSTEHEND |
| 9 | term:32104 | Richtlinie über die Gewährung von Soforthilfen bei durch Naturkatastr… | depublish | DEPUBLIKATION BEIBEHALTEN | validity-expired-before-baseline | Eigene Außerkrafttretensformel 2022-12-31 [strong] | identisch (Fassungsseite) | depubliziert | low | AUSSTEHEND |
| 10 | term:31080 | Richtlinien für die dienstliche Beurteilung der Beschäftigten (Beamti… | depublish | DEPUBLIKATION BEIBEHALTEN | validity-successor-contradicted | Aufhebung durch Richtlinien für die dienstliche Beurteilung der Beamtinnen und Beamten im Geschäftsbereich des Ministeriums f… (term:31887) 2017-06-01 [contradictory] | identisch (Fassungsseite) | depubliziert | medium | AUSSTEHEND |
| 11 | term:32424 | Richtlinie über bauaufsichtliche Anforderungen an Schulen (Schulbauri… | depublish | DEPUBLIKATION BEIBEHALTEN | validity-successor-contradicted | Aufhebung durch Richtlinie über bauaufsichtliche Anforderungen an Schulen (Schulbaurichtlinie – SchulBauR) Runderlass des Min… (term:32897) 2020-12-11 [contradictory] | identisch (Fassungsseite) | depubliziert | medium | AUSSTEHEND |
| 12 | term:33495 | Richtlinie zur Förderung der Modernisierung von Wohnraum in Nordrhein… | depublish | DEPUBLIKATION BEIBEHALTEN | validity-successor-contradicted | Aufhebung durch Richtlinie zur Förderung der Modernisierung von Wohnraum im Land Nordrhein-Westfalen (Modernisierungsförderun… (term:33747) 2023-02-15 [contradictory] | identisch (Fassungsseite) | depubliziert | medium | AUSSTEHEND |
| 13 | term:27211 | Gesetz zur Neugliederung der Gemeinden und Kreise des Neugliederungsr… | deliver-legacy | DELIVER-LEGACY BEIBEHALTEN | structure-unnumbered-section | Textidentität SHA-256 4c610d8f7bd547ee… (Portalintervall strong) | identisch (Normtext) | veröffentlicht (Legacy-Parser) | low | AUSSTEHEND |
| 14 | term:27217 | Gesetz zur Neugliederung der Gemeinden und Kreise des Neugliederungsr… | deliver-legacy | DELIVER-LEGACY BEIBEHALTEN | structure-unnumbered-section | Textidentität SHA-256 577bedb9b6f96298… (Portalintervall strong) | identisch (Normtext) | veröffentlicht (Legacy-Parser) | low | AUSSTEHEND |
| 15 | term:27514 | Gesetz zu dem Vertrag zwischen dem Land Nordrhein-Westfalen und dem H… | deliver-legacy | DELIVER-LEGACY BEIBEHALTEN | structure-unnumbered-section | Textidentität SHA-256 a413267dc15b4651… (Portalintervall strong) | identisch (Normtext) | veröffentlicht (Legacy-Parser) | medium | AUSSTEHEND |
| 16 | term:28146 | Verordnung über das Wahlverfahren zur Benennung der Beschäftigten des… | deliver-legacy | DELIVER-LEGACY BEIBEHALTEN | structure-unnumbered-section | Textidentität SHA-256 2a256234d807169f… (Portalintervall strong) | identisch (Normtext) | veröffentlicht (Legacy-Parser) | low | AUSSTEHEND |
| 17 | term:29969 | Verordnung zur Umsetzung des Maßregelvollzugsgesetzes (VO MRVG) | deliver-legacy | DELIVER-LEGACY BEIBEHALTEN | structure-unnumbered-section | Textidentität SHA-256 9d33f834267bfeb4… (Portalintervall strong) | identisch (Normtext) | veröffentlicht (Legacy-Parser) | low | AUSSTEHEND |
| 18 | term:31390 | Richtlinie über die Gewährung von Zuwendungen zu Fortbildungsmaßnahme… | depublish | MENSCHLICHE ENTSCHEIDUNG ERFORDERLICH | validity-expiry-contradicted | Eigene Außerkrafttretensformel 2019-12-31 [contradictory] | identisch (Fassungsseite) | depubliziert | high | AUSSTEHEND |
| 19 | term:31791 | Richtlinien über die Gewährung von Zuwendungen zur Schaffung, Erhaltu… | depublish | MENSCHLICHE ENTSCHEIDUNG ERFORDERLICH | validity-successor-contradicted | Aufhebung durch Richtlinien über die Gewährung von Zuwendung zur Schaffung, Erhaltung, Wiederherstellung und Verbesserung von… (term:33827) 2023-07-28 [contradictory] | identisch (Fassungsseite) | depubliziert | high | AUSSTEHEND |
| 20 | term:32422 | Richtlinien zur Förderung der vernetzten Mobilität und des Mobilitäts… | depublish | MENSCHLICHE ENTSCHEIDUNG ERFORDERLICH | validity-successor-contradicted | Aufhebung durch Richtlinien zur Förderung der Vernetzten Mobilität und des Mobilitätsmanagements (Förderrichtlinie Mobilitäts… (term:33558) 2022-07-01 [contradictory] | identisch (Fassungsseite) | depubliziert | high | AUSSTEHEND |
| 21 | term:33461 | Richtlinie über die Gewährung von Zuwendungen für Maßnahmen gemäß § 9… | depublish | MENSCHLICHE ENTSCHEIDUNG ERFORDERLICH | validity-expiry-ambiguous | Eigene Außerkrafttretensformel 2027-03-31 [contradictory] | identisch (Fassungsseite) | depubliziert | high | AUSSTEHEND |

## Depublikationen mit starkem Außerkrafttretensbeleg (eigene Formel vor dem Stichtag)

### 1. term:30782 – Richtlinien über die Gewährung von Zuwendungen zur Förderung der Ausbildung für die Alten- und Familienpflege sowie der Altenpflegehilfe Rd…

- Typ: `depublish` (Ausnahme `legacy-30782`) · Quellbereich: LRMB · Ziel-Slug: `richtlinien-ueber-die-gewaehrung-von-zuwendungen-zur-foerderung-der-west`
- Aktueller öffentlicher Status: depubliziert: Manifest not-at-baseline (recht-nrw-lrmb-parser/1.3.0), Lauf recht-nrw-2023-12-01-lrmb-20260917T055943Z; kein Ziel-Slug
- Vorgeschlagene Ausnahme: kontrollierte Depublikation (depublish); Risiko **low**
- Parser alt/aktuell: `recht-nrw-lrmb-parser/1.2.0` → `recht-nrw-lrmb-parser/1.3.0` · Transformer: `recht-nrw-transformer/2.1.0`
- Quell-URL: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012013-richtlinien-ueber-die-gewaehrung-von-zuwendungen-zur-0> · Fundstelle: Fassungsseite RECHT.NRW
- Source-SHA-256: `35aa274d207939d66fe8eceaafbf591c1094783c011294477e7046835fe67ae5`
- Normtext-SHA-256 (Fassungsseite, Bytes): Legacy `35aa274d207939d66fe8eceaafbf591c1094783c011294477e7046835fe67ae5` · aktuell `35aa274d207939d66fe8eceaafbf591c1094783c011294477e7046835fe67ae5`
- Vorbereitet: 2026-09-17 durch `automated-review` · Evidenzreferenzen: evidence-pass `data/audits/recht-nrw/lrmb/EVIDENCE_PASS.json`, run-report `data/audits/recht-nrw/runs/recht-nrw-2023-12-01-lrmb-20260917T055943Z.json`, manifest `data/imports/recht-nrw/manifest/lrmb/term-30782.json`, review-item `term:30782:metadata-conflict:094741249e`

**Ausgangslage.** Mit `recht-nrw-lrmb-parser/1.2.0` als `imported-with-warnings` übernommen; der Reimport mit `recht-nrw-lrmb-parser/1.3.0` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: not-active-at-baseline.

**Neuer Befund.** `validity-expired-before-baseline` – validity-expired-before-baseline: Der Text tritt am 2013-12-31 außer Kraft („zum 31. Dezember 2013“) – vor dem Stichtag 2023-12-01; das Portal weist kein Ende aus (Widerspruch zur Fassungsseite). Keine strukturelle Abweichung. Der Bewerter 1.3.0 ergibt not-at-baseline (validity-expired-before-baseline): Der Text tritt am 2013-12-31 außer Kraft („zum 31. Dezember 2013“) – vor dem Stichtag 2023-12-01; das Portal weist kein Ende aus (Widerspruch zur Fassungsseite).

**Amtliche Evidenz.**

| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Suchindex-Signal | insufficient | trägt nicht allein | – | – | Suchindex des Portals (nur Hinweis) | Suchindex (nur Hinweis): historisch true, Gültig ab 2013-01-01, Außerkrafttreten 2013-12-31 | – (–) |
| Eigene Außerkrafttretensformel | strong | trägt die Entscheidung | 2013-12-31 | – | eigener Text der Fassungsseite (richtlinie) | Diese Richtlinien treten zum 1.Januar 2013 in Kraft und mit Wirkung zum 31. Dezember 2013 außer Kraft. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012013-richtlinien-ueber-die-gewaehrung-von-zuwendungen-zur-0> (35aa274d207939d6…) |
| Quellhash der Fassungsseite (Manifest-Rohdokument) | n/a | ergänzend (Quelle unverändert) | 2026-09-17 | – | Prüfung des Importers | Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence… | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012013-richtlinien-ueber-die-gewaehrung-von-zuwendungen-zur-0> (35aa274d207939d6…) |

**Textintegrität.** identisch: 43476 ↔ 43476 Zeichen; Verfahren: Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence Pass Parser 1.3.0), nicht wegen einer Textabweichung. Werte sind Bytes der Fassungsseite, kein Normtextvergleich

**Depublikations-Fragen.**

- Welcher neue Beleg? Eigene Außerkrafttretensformel: Diese Richtlinien treten zum 1.Januar 2013 in Kraft und mit Wirkung zum 31. Dezember 2013 außer Kraft.
- Klasse: strong · amtliche Quelle: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012013-richtlinien-ueber-die-gewaehrung-von-zuwendungen-zur-0>
- Stammnorm eindeutig? ja · relevantes Datum: 2013-12-31 · vor Stichtag 2023-12-01? ja
- Zwingend? ja · Unsicherheit: keine; Portal weist lediglich kein Ende aus

**Kurzprüfung.** Eigene Außerkrafttretensformel der amtlichen Fassungsseite nennt 2013-12-31 (vor Stichtag 2023-12-01); Quellhash unverändert, Depublikation ausgeführt (recht-nrw-2023-12-01-lrmb-20260917T055943Z).

**Begründung der Ausnahme.** Im Zweifel Review statt unbelegter Übernahme: Außerkrafttreten vor dem Stichtag laut eigenem Text – die mit Parser 1.2.0 übernommene Fassung wird nicht weiter ausgeliefert, sondern kontrolliert depubliziert; Manifest trägt den aktuellen Befund (not-at-baseline). Folgeschritt: Geltungsbeleg redaktionell prüfen (Review-Fall metadata-conflict/historical-gap); bei Bestätigung der Stichtagsgeltung Override und Reimport mit --only term:30782 --offline --write.

**Vorgeschlagene Entscheidung.** `DEPUBLIKATION BEIBEHALTEN`

**Freigabe.**

- Status: AUSSTEHEND
- Entscheidung Nutzer: –
- Begründung Nutzer: –
- Datum: –

### 2. term:30825 – Richtlinie zur Berücksichtigung von bürgerschaftlichem Engagement bei der Gewährung von Zuwendungen im Zuständigkeitsbereich des Ministeriu…

- Typ: `depublish` (Ausnahme `legacy-30825`) · Quellbereich: LRMB · Ziel-Slug: `richtlinie-zur-beruecksichtigung-von-buergerschaftlichem-engagement-bei-west`
- Aktueller öffentlicher Status: depubliziert: Manifest not-at-baseline (recht-nrw-lrmb-parser/1.3.0), Lauf recht-nrw-2023-12-01-lrmb-20260917T055943Z; kein Ziel-Slug
- Vorgeschlagene Ausnahme: kontrollierte Depublikation (depublish); Risiko **low**
- Parser alt/aktuell: `recht-nrw-lrmb-parser/1.2.0` → `recht-nrw-lrmb-parser/1.3.0` · Transformer: `recht-nrw-transformer/2.1.0`
- Quell-URL: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01042013-richtlinie-zur-beruecksichtigung-von-buergerschaftlichem> · Fundstelle: Fassungsseite RECHT.NRW
- Source-SHA-256: `74058a0ff1e5d0f8890f260ce7ae4a1e40eec98b24d52b2eb4f831f5a477b5d0`
- Normtext-SHA-256 (Fassungsseite, Bytes): Legacy `74058a0ff1e5d0f8890f260ce7ae4a1e40eec98b24d52b2eb4f831f5a477b5d0` · aktuell `74058a0ff1e5d0f8890f260ce7ae4a1e40eec98b24d52b2eb4f831f5a477b5d0`
- Vorbereitet: 2026-09-17 durch `automated-review` · Evidenzreferenzen: evidence-pass `data/audits/recht-nrw/lrmb/EVIDENCE_PASS.json`, run-report `data/audits/recht-nrw/runs/recht-nrw-2023-12-01-lrmb-20260917T055943Z.json`, manifest `data/imports/recht-nrw/manifest/lrmb/term-30825.json`, review-item `term:30825:metadata-conflict:e96b6c77ba`

**Ausgangslage.** Mit `recht-nrw-lrmb-parser/1.2.0` als `imported-with-warnings` übernommen; der Reimport mit `recht-nrw-lrmb-parser/1.3.0` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: not-active-at-baseline.

**Neuer Befund.** `validity-expired-before-baseline` – validity-expired-before-baseline: Der Text tritt am 2017-12-31 außer Kraft („bis zum 31. Dezember 2017“) – vor dem Stichtag 2023-12-01; das Portal weist kein Ende aus (Widerspruch zur Fassungsseite). Keine strukturelle Abweichung. Der Bewerter 1.3.0 ergibt not-at-baseline (validity-expired-before-baseline): Der Text tritt am 2017-12-31 außer Kraft („bis zum 31. Dezember 2017“) – vor dem Stichtag 2023-12-01; das Portal weist kein Ende aus (Widerspruch zur Fassungsseite).

**Amtliche Evidenz.**

| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Suchindex-Signal | insufficient | trägt nicht allein | – | – | Suchindex des Portals (nur Hinweis) | Suchindex (nur Hinweis): historisch true, Gültig ab 2013-04-01, Außerkrafttreten 2017-12-31 | – (–) |
| Eigene Inkrafttretensformel | strong | trägt die Entscheidung | 2013-04-01 | – | eigener Text der Fassungsseite (richtlinie) | Diese Richtlinie tritt mit Wirkung vom 1. April 2013 in Kraft und gilt bis zum 31. Dezember 2017. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01042013-richtlinie-zur-beruecksichtigung-von-buergerschaftlichem> (74058a0ff1e5d0f8…) |
| Eigene Außerkrafttretensformel | strong | trägt die Entscheidung | 2017-12-31 | – | eigener Text der Fassungsseite (richtlinie) | Diese Richtlinie tritt mit Wirkung vom 1. April 2013 in Kraft und gilt bis zum 31. Dezember 2017. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01042013-richtlinie-zur-beruecksichtigung-von-buergerschaftlichem> (74058a0ff1e5d0f8…) |
| Quellhash der Fassungsseite (Manifest-Rohdokument) | n/a | ergänzend (Quelle unverändert) | 2026-09-17 | – | Prüfung des Importers | Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence… | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01042013-richtlinie-zur-beruecksichtigung-von-buergerschaftlichem> (74058a0ff1e5d0f8…) |

**Textintegrität.** identisch: 26479 ↔ 26479 Zeichen; Verfahren: Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence Pass Parser 1.3.0), nicht wegen einer Textabweichung. Werte sind Bytes der Fassungsseite, kein Normtextvergleich

**Depublikations-Fragen.**

- Welcher neue Beleg? Eigene Außerkrafttretensformel: Diese Richtlinie tritt mit Wirkung vom 1. April 2013 in Kraft und gilt bis zum 31. Dezember 2017.
- Klasse: strong · amtliche Quelle: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01042013-richtlinie-zur-beruecksichtigung-von-buergerschaftlichem>
- Stammnorm eindeutig? ja · relevantes Datum: 2017-12-31 · vor Stichtag 2023-12-01? ja
- Zwingend? ja · Unsicherheit: keine; Portal weist lediglich kein Ende aus

**Kurzprüfung.** Eigene Außerkrafttretensformel der amtlichen Fassungsseite nennt 2017-12-31 (vor Stichtag 2023-12-01); Quellhash unverändert, Depublikation ausgeführt (recht-nrw-2023-12-01-lrmb-20260917T055943Z).

**Begründung der Ausnahme.** Im Zweifel Review statt unbelegter Übernahme: Außerkrafttreten vor dem Stichtag laut eigenem Text – die mit Parser 1.2.0 übernommene Fassung wird nicht weiter ausgeliefert, sondern kontrolliert depubliziert; Manifest trägt den aktuellen Befund (not-at-baseline). Folgeschritt: Geltungsbeleg redaktionell prüfen (Review-Fall metadata-conflict/historical-gap); bei Bestätigung der Stichtagsgeltung Override und Reimport mit --only term:30825 --offline --write.

**Vorgeschlagene Entscheidung.** `DEPUBLIKATION BEIBEHALTEN`

**Freigabe.**

- Status: AUSSTEHEND
- Entscheidung Nutzer: –
- Begründung Nutzer: –
- Datum: –

### 3. term:30978 – Richtlinie über die Gewährung von Zuwendungen für die Umrüstung von nordrhein-westfälischen Filmtheatern auf digitale Projektionstechnik (F…

- Typ: `depublish` (Ausnahme `legacy-30978`) · Quellbereich: LRMB · Ziel-Slug: `richtlinie-ueber-die-gewaehrung-von-zuwendungen-fuer-die-umruestung-von-west`
- Aktueller öffentlicher Status: depubliziert: Manifest not-at-baseline (recht-nrw-lrmb-parser/1.3.0), Lauf recht-nrw-2023-12-01-lrmb-20260917T055943Z; kein Ziel-Slug
- Vorgeschlagene Ausnahme: kontrollierte Depublikation (depublish); Risiko **low**
- Parser alt/aktuell: `recht-nrw-lrmb-parser/1.2.0` → `recht-nrw-lrmb-parser/1.3.0` · Transformer: `recht-nrw-transformer/2.1.0`
- Quell-URL: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012014-richtlinie-ueber-die-gewaehrung-von-zuwendungen-fuer-die> · Fundstelle: Fassungsseite RECHT.NRW
- Source-SHA-256: `5a2d5feb4e6c973fcc2368752fafd726b9619d39dd82baa0c132f227b9b1010a`
- Normtext-SHA-256 (Fassungsseite, Bytes): Legacy `5a2d5feb4e6c973fcc2368752fafd726b9619d39dd82baa0c132f227b9b1010a` · aktuell `5a2d5feb4e6c973fcc2368752fafd726b9619d39dd82baa0c132f227b9b1010a`
- Vorbereitet: 2026-09-17 durch `automated-review` · Evidenzreferenzen: evidence-pass `data/audits/recht-nrw/lrmb/EVIDENCE_PASS.json`, run-report `data/audits/recht-nrw/runs/recht-nrw-2023-12-01-lrmb-20260917T055943Z.json`, manifest `data/imports/recht-nrw/manifest/lrmb/term-30978.json`, review-item `term:30978:metadata-conflict:2c0a786d9d`

**Ausgangslage.** Mit `recht-nrw-lrmb-parser/1.2.0` als `imported-with-warnings` übernommen; der Reimport mit `recht-nrw-lrmb-parser/1.3.0` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: not-active-at-baseline.

**Neuer Befund.** `validity-expired-before-baseline` – validity-expired-before-baseline: Der Text tritt am 2014-12-31 außer Kraft („bis zum 31.12.2014“) – vor dem Stichtag 2023-12-01; das Portal weist kein Ende aus (Widerspruch zur Fassungsseite). Keine strukturelle Abweichung. Der Bewerter 1.3.0 ergibt not-at-baseline (validity-expired-before-baseline): Der Text tritt am 2014-12-31 außer Kraft („bis zum 31.12.2014“) – vor dem Stichtag 2023-12-01; das Portal weist kein Ende aus (Widerspruch zur Fassungsseite).

**Amtliche Evidenz.**

| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Suchindex-Signal | insufficient | trägt nicht allein | – | – | Suchindex des Portals (nur Hinweis) | Suchindex (nur Hinweis): historisch true, Gültig ab 2014-01-01, Außerkrafttreten 2014-12-31 | – (–) |
| Eigene Inkrafttretensformel | strong | trägt die Entscheidung | 2014-01-01 | – | eigener Text der Fassungsseite (richtlinie) | Die Richtlinie tritt mit Wirkung vom 1.1.2014 in Kraft und gilt bis zum 31.12.2014. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012014-richtlinie-ueber-die-gewaehrung-von-zuwendungen-fuer-die> (5a2d5feb4e6c973f…) |
| Eigene Außerkrafttretensformel | strong | trägt die Entscheidung | 2014-12-31 | – | eigener Text der Fassungsseite (richtlinie) | Die Richtlinie tritt mit Wirkung vom 1.1.2014 in Kraft und gilt bis zum 31.12.2014. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012014-richtlinie-ueber-die-gewaehrung-von-zuwendungen-fuer-die> (5a2d5feb4e6c973f…) |
| Quellhash der Fassungsseite (Manifest-Rohdokument) | n/a | ergänzend (Quelle unverändert) | 2026-09-17 | – | Prüfung des Importers | Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence… | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012014-richtlinie-ueber-die-gewaehrung-von-zuwendungen-fuer-die> (5a2d5feb4e6c973f…) |

**Textintegrität.** identisch: 36392 ↔ 36392 Zeichen; Verfahren: Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence Pass Parser 1.3.0), nicht wegen einer Textabweichung. Werte sind Bytes der Fassungsseite, kein Normtextvergleich

**Depublikations-Fragen.**

- Welcher neue Beleg? Eigene Außerkrafttretensformel: Die Richtlinie tritt mit Wirkung vom 1.1.2014 in Kraft und gilt bis zum 31.12.2014.
- Klasse: strong · amtliche Quelle: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012014-richtlinie-ueber-die-gewaehrung-von-zuwendungen-fuer-die>
- Stammnorm eindeutig? ja · relevantes Datum: 2014-12-31 · vor Stichtag 2023-12-01? ja
- Zwingend? ja · Unsicherheit: keine; Portal weist lediglich kein Ende aus

**Kurzprüfung.** Eigene Außerkrafttretensformel der amtlichen Fassungsseite nennt 2014-12-31 (vor Stichtag 2023-12-01); Quellhash unverändert, Depublikation ausgeführt (recht-nrw-2023-12-01-lrmb-20260917T055943Z).

**Begründung der Ausnahme.** Im Zweifel Review statt unbelegter Übernahme: Außerkrafttreten vor dem Stichtag laut eigenem Text – die mit Parser 1.2.0 übernommene Fassung wird nicht weiter ausgeliefert, sondern kontrolliert depubliziert; Manifest trägt den aktuellen Befund (not-at-baseline). Folgeschritt: Geltungsbeleg redaktionell prüfen (Review-Fall metadata-conflict/historical-gap); bei Bestätigung der Stichtagsgeltung Override und Reimport mit --only term:30978 --offline --write.

**Vorgeschlagene Entscheidung.** `DEPUBLIKATION BEIBEHALTEN`

**Freigabe.**

- Status: AUSSTEHEND
- Entscheidung Nutzer: –
- Begründung Nutzer: –
- Datum: –

### 4. term:31221 – Richtlinien über die Gewährung von Zuwendungen an freie Träger für Projekte zum Täter-Opfer-Ausgleich bei Inhaftierten bei den Justizvollzu…

- Typ: `depublish` (Ausnahme `legacy-31221`) · Quellbereich: LRMB · Ziel-Slug: `richtlinien-ueber-die-gewaehrung-von-zuwendungen-an-freie-traeger-fuer-west`
- Aktueller öffentlicher Status: depubliziert: Manifest not-at-baseline (recht-nrw-lrmb-parser/1.3.0), Lauf recht-nrw-2023-12-01-lrmb-20260917T055943Z; kein Ziel-Slug
- Vorgeschlagene Ausnahme: kontrollierte Depublikation (depublish); Risiko **low**
- Parser alt/aktuell: `recht-nrw-lrmb-parser/1.2.0` → `recht-nrw-lrmb-parser/1.3.0` · Transformer: `recht-nrw-transformer/2.1.0`
- Quell-URL: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/09012015-richtlinien-ueber-die-gewaehrung-von-zuwendungen-freie-traeger> · Fundstelle: Fassungsseite RECHT.NRW
- Source-SHA-256: `3fb6181bce3d9f7731e2d028f4d44d5e56b13cda105787b917509ad1176a61b5`
- Normtext-SHA-256 (Fassungsseite, Bytes): Legacy `3fb6181bce3d9f7731e2d028f4d44d5e56b13cda105787b917509ad1176a61b5` · aktuell `3fb6181bce3d9f7731e2d028f4d44d5e56b13cda105787b917509ad1176a61b5`
- Vorbereitet: 2026-09-17 durch `automated-review` · Evidenzreferenzen: evidence-pass `data/audits/recht-nrw/lrmb/EVIDENCE_PASS.json`, run-report `data/audits/recht-nrw/runs/recht-nrw-2023-12-01-lrmb-20260917T055943Z.json`, manifest `data/imports/recht-nrw/manifest/lrmb/term-31221.json`, review-item `term:31221:metadata-conflict:a973ed0402`

**Ausgangslage.** Mit `recht-nrw-lrmb-parser/1.2.0` als `imported-with-warnings` übernommen; der Reimport mit `recht-nrw-lrmb-parser/1.3.0` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: not-active-at-baseline.

**Neuer Befund.** `validity-expired-before-baseline` – validity-expired-before-baseline: Der Text tritt am 2018-12-31 außer Kraft („bis zum 31. Dezember 2018“) – vor dem Stichtag 2023-12-01; das Portal weist kein Ende aus (Widerspruch zur Fassungsseite). Keine strukturelle Abweichung. Der Bewerter 1.3.0 ergibt not-at-baseline (validity-expired-before-baseline): Der Text tritt am 2018-12-31 außer Kraft („bis zum 31. Dezember 2018“) – vor dem Stichtag 2023-12-01; das Portal weist kein Ende aus (Widerspruch zur Fassungsseite).

**Amtliche Evidenz.**

| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Suchindex-Signal | insufficient | trägt nicht allein | – | – | Suchindex des Portals (nur Hinweis) | Suchindex (nur Hinweis): historisch true, Gültig ab 2015-01-09, Außerkrafttreten 2018-12-31 | – (–) |
| Eigene Außerkrafttretensformel | strong | trägt die Entscheidung | 2018-12-31 | – | eigener Text der Fassungsseite (richtlinie) | Diese Richtlinien treten mit sofortiger Wirkung in Kraft und gelten bis zum 31. Dezember 2018. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/09012015-richtlinien-ueber-die-gewaehrung-von-zuwendungen-freie-traeger> (3fb6181bce3d9f77…) |
| Quellhash der Fassungsseite (Manifest-Rohdokument) | n/a | ergänzend (Quelle unverändert) | 2026-09-17 | – | Prüfung des Importers | Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence… | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/09012015-richtlinien-ueber-die-gewaehrung-von-zuwendungen-freie-traeger> (3fb6181bce3d9f77…) |

**Textintegrität.** identisch: 41643 ↔ 41643 Zeichen; Verfahren: Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence Pass Parser 1.3.0), nicht wegen einer Textabweichung. Werte sind Bytes der Fassungsseite, kein Normtextvergleich

**Depublikations-Fragen.**

- Welcher neue Beleg? Eigene Außerkrafttretensformel: Diese Richtlinien treten mit sofortiger Wirkung in Kraft und gelten bis zum 31. Dezember 2018.
- Klasse: strong · amtliche Quelle: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/09012015-richtlinien-ueber-die-gewaehrung-von-zuwendungen-freie-traeger>
- Stammnorm eindeutig? ja · relevantes Datum: 2018-12-31 · vor Stichtag 2023-12-01? ja
- Zwingend? ja · Unsicherheit: keine; Portal weist lediglich kein Ende aus

**Kurzprüfung.** Eigene Außerkrafttretensformel der amtlichen Fassungsseite nennt 2018-12-31 (vor Stichtag 2023-12-01); Quellhash unverändert, Depublikation ausgeführt (recht-nrw-2023-12-01-lrmb-20260917T055943Z).

**Begründung der Ausnahme.** Im Zweifel Review statt unbelegter Übernahme: Außerkrafttreten vor dem Stichtag laut eigenem Text – die mit Parser 1.2.0 übernommene Fassung wird nicht weiter ausgeliefert, sondern kontrolliert depubliziert; Manifest trägt den aktuellen Befund (not-at-baseline). Folgeschritt: Geltungsbeleg redaktionell prüfen (Review-Fall metadata-conflict/historical-gap); bei Bestätigung der Stichtagsgeltung Override und Reimport mit --only term:31221 --offline --write.

**Vorgeschlagene Entscheidung.** `DEPUBLIKATION BEIBEHALTEN`

**Freigabe.**

- Status: AUSSTEHEND
- Entscheidung Nutzer: –
- Begründung Nutzer: –
- Datum: –

### 5. term:31313 – Richtlinie über die Gewährung von Zuwendungen aus dem „Programm für rationelle Energieverwendung, regenerative Energien und Energiesparen -…

- Typ: `depublish` (Ausnahme `legacy-31313`) · Quellbereich: LRMB · Ziel-Slug: `richtlinie-ueber-die-gewaehrung-von-zuwendungen-aus-dem-programm-fuer-west-31313`
- Aktueller öffentlicher Status: depubliziert: Manifest not-at-baseline (recht-nrw-lrmb-parser/1.3.0), Lauf recht-nrw-2023-12-01-lrmb-20260917T055943Z; kein Ziel-Slug
- Vorgeschlagene Ausnahme: kontrollierte Depublikation (depublish); Risiko **low**
- Parser alt/aktuell: `recht-nrw-lrmb-parser/1.2.0` → `recht-nrw-lrmb-parser/1.3.0` · Transformer: `recht-nrw-transformer/2.1.0`
- Quell-URL: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/28052015-richtlinie-ueber-die-gewaehrung-von-zuwendungen-aus-dem> · Fundstelle: Fassungsseite RECHT.NRW
- Source-SHA-256: `07940976e9aaa6d63d36b93be9ae42e6e07ca38fcf356d985d522d5b27d69be5`
- Normtext-SHA-256 (Fassungsseite, Bytes): Legacy `07940976e9aaa6d63d36b93be9ae42e6e07ca38fcf356d985d522d5b27d69be5` · aktuell `07940976e9aaa6d63d36b93be9ae42e6e07ca38fcf356d985d522d5b27d69be5`
- Vorbereitet: 2026-09-17 durch `automated-review` · Evidenzreferenzen: evidence-pass `data/audits/recht-nrw/lrmb/EVIDENCE_PASS.json`, run-report `data/audits/recht-nrw/runs/recht-nrw-2023-12-01-lrmb-20260917T055943Z.json`, manifest `data/imports/recht-nrw/manifest/lrmb/term-31313.json`, review-item `term:31313:metadata-conflict:2a89682522`

**Ausgangslage.** Mit `recht-nrw-lrmb-parser/1.2.0` als `imported-with-warnings` übernommen; der Reimport mit `recht-nrw-lrmb-parser/1.3.0` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: not-active-at-baseline.

**Neuer Befund.** `validity-expired-before-baseline` – validity-expired-before-baseline: Der Text tritt am 2020-12-31 außer Kraft („mit Ablauf des 31. Dezember 2020“) – vor dem Stichtag 2023-12-01; das Portal weist kein Ende aus (Widerspruch zur Fassungsseite). Keine strukturelle Abweichung. Der Bewerter 1.3.0 ergibt not-at-baseline (validity-expired-before-baseline): Der Text tritt am 2020-12-31 außer Kraft („mit Ablauf des 31. Dezember 2020“) – vor dem Stichtag 2023-12-01; das Portal weist kein Ende aus (Widerspruch zur Fassungsseite).

**Amtliche Evidenz.**

| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Suchindex-Signal | insufficient | trägt nicht allein | – | – | Suchindex des Portals (nur Hinweis) | Suchindex (nur Hinweis): historisch true, Gültig ab 2017-06-21, Außerkrafttreten 2020-12-31 | – (–) |
| Eigene Außerkrafttretensformel | strong | trägt die Entscheidung | 2020-12-31 | – | eigener Text der Fassungsseite (richtlinie) | Die Förderrichtlinie tritt am Tag nach der Veröffentlichung in Kraft und mit Ablauf des 31. Dezember 2020 außer Kraft. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/21062017-richtlinie-ueber-die-gewaehrung-von-zuwendungen-aus-dem> (07940976e9aaa6d6…) |
| Quellhash der Fassungsseite (Manifest-Rohdokument) | n/a | ergänzend (Quelle unverändert) | 2026-09-17 | – | Prüfung des Importers | Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence… | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/28052015-richtlinie-ueber-die-gewaehrung-von-zuwendungen-aus-dem> (07940976e9aaa6d6…) |

**Textintegrität.** identisch: 55514 ↔ 55514 Zeichen; Verfahren: Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence Pass Parser 1.3.0), nicht wegen einer Textabweichung. Werte sind Bytes der Fassungsseite, kein Normtextvergleich

**Depublikations-Fragen.**

- Welcher neue Beleg? Eigene Außerkrafttretensformel: Die Förderrichtlinie tritt am Tag nach der Veröffentlichung in Kraft und mit Ablauf des 31. Dezember 2020 außer Kraft.
- Klasse: strong · amtliche Quelle: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/21062017-richtlinie-ueber-die-gewaehrung-von-zuwendungen-aus-dem>
- Stammnorm eindeutig? ja · relevantes Datum: 2020-12-31 · vor Stichtag 2023-12-01? ja
- Zwingend? ja · Unsicherheit: keine; Portal weist lediglich kein Ende aus

**Kurzprüfung.** Eigene Außerkrafttretensformel der amtlichen Fassungsseite nennt 2020-12-31 (vor Stichtag 2023-12-01); Quellhash unverändert, Depublikation ausgeführt (recht-nrw-2023-12-01-lrmb-20260917T055943Z).

**Begründung der Ausnahme.** Im Zweifel Review statt unbelegter Übernahme: Außerkrafttreten vor dem Stichtag laut eigenem Text – die mit Parser 1.2.0 übernommene Fassung wird nicht weiter ausgeliefert, sondern kontrolliert depubliziert; Manifest trägt den aktuellen Befund (not-at-baseline). Folgeschritt: Geltungsbeleg redaktionell prüfen (Review-Fall metadata-conflict/historical-gap); bei Bestätigung der Stichtagsgeltung Override und Reimport mit --only term:31313 --offline --write.

**Vorgeschlagene Entscheidung.** `DEPUBLIKATION BEIBEHALTEN`

**Freigabe.**

- Status: AUSSTEHEND
- Entscheidung Nutzer: –
- Begründung Nutzer: –
- Datum: –

### 6. term:31771 – Verwaltungsvorschrift über die Legitimations- und Kennzeichnungspflicht von Polizeivollzugsbeamtinnen und -beamten (VVKennzeichnung Pol) Ru…

- Typ: `depublish` (Ausnahme `legacy-31771`) · Quellbereich: LRMB · Ziel-Slug: `verwaltungsvorschrift-ueber-die-legitimations-und-kennzeichnungspflicht-west`
- Aktueller öffentlicher Status: depubliziert: Manifest not-at-baseline (recht-nrw-lrmb-parser/1.3.0), Lauf recht-nrw-2023-12-01-lrmb-20260917T055943Z; kein Ziel-Slug
- Vorgeschlagene Ausnahme: kontrollierte Depublikation (depublish); Risiko **low**
- Parser alt/aktuell: `recht-nrw-lrmb-parser/1.2.0` → `recht-nrw-lrmb-parser/1.3.0` · Transformer: `recht-nrw-transformer/2.1.0`
- Quell-URL: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01032017-verwaltungsvorschrift-ueber-die-legitimations-und> · Fundstelle: Fassungsseite RECHT.NRW
- Source-SHA-256: `9bcba54b466dddf97078dbbe15e9ba6e39ef05b6666fcb6498db4b3b09a5337e`
- Normtext-SHA-256 (Fassungsseite, Bytes): Legacy `9bcba54b466dddf97078dbbe15e9ba6e39ef05b6666fcb6498db4b3b09a5337e` · aktuell `9bcba54b466dddf97078dbbe15e9ba6e39ef05b6666fcb6498db4b3b09a5337e`
- Vorbereitet: 2026-09-17 durch `automated-review` · Evidenzreferenzen: evidence-pass `data/audits/recht-nrw/lrmb/EVIDENCE_PASS.json`, run-report `data/audits/recht-nrw/runs/recht-nrw-2023-12-01-lrmb-20260917T055943Z.json`, manifest `data/imports/recht-nrw/manifest/lrmb/term-31771.json`, review-item `term:31771:metadata-conflict:1eed4d5272`

**Ausgangslage.** Mit `recht-nrw-lrmb-parser/1.2.0` als `imported-with-warnings` übernommen; der Reimport mit `recht-nrw-lrmb-parser/1.3.0` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: not-active-at-baseline.

**Neuer Befund.** `validity-expired-before-baseline` – validity-expired-before-baseline: Der Text tritt am 2022-12-31 außer Kraft („am 31. Dezember 2022“) – vor dem Stichtag 2023-12-01; das Portal weist kein Ende aus (Widerspruch zur Fassungsseite). Keine strukturelle Abweichung. Der Bewerter 1.3.0 ergibt not-at-baseline (validity-expired-before-baseline): Der Text tritt am 2022-12-31 außer Kraft („am 31. Dezember 2022“) – vor dem Stichtag 2023-12-01; das Portal weist kein Ende aus (Widerspruch zur Fassungsseite).

**Amtliche Evidenz.**

| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Suchindex-Signal | insufficient | trägt nicht allein | – | – | Suchindex des Portals (nur Hinweis) | Suchindex (nur Hinweis): historisch true, Gültig ab 2017-03-01, Außerkrafttreten 2022-12-31 | – (–) |
| Eigene Außerkrafttretensformel | strong | trägt die Entscheidung | 2022-12-31 | – | eigener Text der Fassungsseite (verwaltungsvorschrift) | Diese Verwaltungsvorschrift tritt am Tag nach der Verkündung in Kraft und am 31. Dezember 2022 außer Kraft. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01032017-verwaltungsvorschrift-ueber-die-legitimations-und> (9bcba54b466dddf9…) |
| Quellhash der Fassungsseite (Manifest-Rohdokument) | n/a | ergänzend (Quelle unverändert) | 2026-09-17 | – | Prüfung des Importers | Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence… | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01032017-verwaltungsvorschrift-ueber-die-legitimations-und> (9bcba54b466dddf9…) |

**Textintegrität.** identisch: 31800 ↔ 31800 Zeichen; Verfahren: Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence Pass Parser 1.3.0), nicht wegen einer Textabweichung. Werte sind Bytes der Fassungsseite, kein Normtextvergleich

**Depublikations-Fragen.**

- Welcher neue Beleg? Eigene Außerkrafttretensformel: Diese Verwaltungsvorschrift tritt am Tag nach der Verkündung in Kraft und am 31. Dezember 2022 außer Kraft.
- Klasse: strong · amtliche Quelle: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01032017-verwaltungsvorschrift-ueber-die-legitimations-und>
- Stammnorm eindeutig? ja · relevantes Datum: 2022-12-31 · vor Stichtag 2023-12-01? ja
- Zwingend? ja · Unsicherheit: keine; Portal weist lediglich kein Ende aus

**Kurzprüfung.** Eigene Außerkrafttretensformel der amtlichen Fassungsseite nennt 2022-12-31 (vor Stichtag 2023-12-01); Quellhash unverändert, Depublikation ausgeführt (recht-nrw-2023-12-01-lrmb-20260917T055943Z).

**Begründung der Ausnahme.** Im Zweifel Review statt unbelegter Übernahme: Außerkrafttreten vor dem Stichtag laut eigenem Text – die mit Parser 1.2.0 übernommene Fassung wird nicht weiter ausgeliefert, sondern kontrolliert depubliziert; Manifest trägt den aktuellen Befund (not-at-baseline). Folgeschritt: Geltungsbeleg redaktionell prüfen (Review-Fall metadata-conflict/historical-gap); bei Bestätigung der Stichtagsgeltung Override und Reimport mit --only term:31771 --offline --write.

**Vorgeschlagene Entscheidung.** `DEPUBLIKATION BEIBEHALTEN`

**Freigabe.**

- Status: AUSSTEHEND
- Entscheidung Nutzer: –
- Begründung Nutzer: –
- Datum: –

### 7. term:31908 – Verwaltungsvorschrift Technische Baubestimmungen (VV TB) Runderlass des Ministeriums für Bauen, Wohnen, Stadtentwicklung und Verkehr - VI A…

- Typ: `depublish` (Ausnahme `legacy-31908`) · Quellbereich: LRMB · Ziel-Slug: `vv-tb-west`
- Aktueller öffentlicher Status: depubliziert: Manifest not-at-baseline (recht-nrw-lrmb-parser/1.3.0), Lauf recht-nrw-2023-12-01-lrmb-20260917T055943Z; kein Ziel-Slug
- Vorgeschlagene Ausnahme: kontrollierte Depublikation (depublish); Risiko **low**
- Parser alt/aktuell: `recht-nrw-lrmb-parser/1.2.0` → `recht-nrw-lrmb-parser/1.3.0` · Transformer: `recht-nrw-transformer/2.1.0`
- Quell-URL: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/28062017-verwaltungsvorschrift-technische-baubestimmungen-vv-tb> · Fundstelle: Fassungsseite RECHT.NRW
- Source-SHA-256: `38c6b67414ee65640c9bbfcd878048d136d7a4961d9c670ac71253e34eae1a33`
- Normtext-SHA-256 (Fassungsseite, Bytes): Legacy `38c6b67414ee65640c9bbfcd878048d136d7a4961d9c670ac71253e34eae1a33` · aktuell `38c6b67414ee65640c9bbfcd878048d136d7a4961d9c670ac71253e34eae1a33`
- Vorbereitet: 2026-09-17 durch `automated-review` · Evidenzreferenzen: evidence-pass `data/audits/recht-nrw/lrmb/EVIDENCE_PASS.json`, run-report `data/audits/recht-nrw/runs/recht-nrw-2023-12-01-lrmb-20260917T055943Z.json`, manifest `data/imports/recht-nrw/manifest/lrmb/term-31908.json`, review-item `term:31908:metadata-conflict:cc52ff102d`

**Ausgangslage.** Mit `recht-nrw-lrmb-parser/1.2.0` als `imported-with-warnings` übernommen; der Reimport mit `recht-nrw-lrmb-parser/1.3.0` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: not-active-at-baseline.

**Neuer Befund.** `validity-expired-before-baseline` – validity-expired-before-baseline: Der Text tritt am 2022-06-27 außer Kraft („am 27. Juni 2022“) – vor dem Stichtag 2023-12-01; das Portal weist kein Ende aus (Widerspruch zur Fassungsseite). Keine strukturelle Abweichung. Der Bewerter 1.3.0 ergibt not-at-baseline (validity-expired-before-baseline): Der Text tritt am 2022-06-27 außer Kraft („am 27. Juni 2022“) – vor dem Stichtag 2023-12-01; das Portal weist kein Ende aus (Widerspruch zur Fassungsseite).

**Amtliche Evidenz.**

| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Suchindex-Signal | insufficient | trägt nicht allein | – | – | Suchindex des Portals (nur Hinweis) | Suchindex (nur Hinweis): historisch true, Gültig ab 2017-06-28, Außerkrafttreten 2022-06-27 | – (–) |
| Eigene Außerkrafttretensformel | strong | trägt die Entscheidung | 2022-06-27 | – | eigener Text der Fassungsseite (verwaltungsvorschrift) | Diese Verwaltungsvorschrift tritt am 28. Juni 2017 in Kraft und am 27. Juni 2022 außer Kraft. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/28062017-verwaltungsvorschrift-technische-baubestimmungen-vv-tb> (38c6b67414ee6564…) |
| Quellhash der Fassungsseite (Manifest-Rohdokument) | n/a | ergänzend (Quelle unverändert) | 2026-09-17 | – | Prüfung des Importers | Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence… | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/28062017-verwaltungsvorschrift-technische-baubestimmungen-vv-tb> (38c6b67414ee6564…) |

**Textintegrität.** identisch: 27595 ↔ 27595 Zeichen; Verfahren: Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence Pass Parser 1.3.0), nicht wegen einer Textabweichung. Werte sind Bytes der Fassungsseite, kein Normtextvergleich

**Depublikations-Fragen.**

- Welcher neue Beleg? Eigene Außerkrafttretensformel: Diese Verwaltungsvorschrift tritt am 28. Juni 2017 in Kraft und am 27. Juni 2022 außer Kraft.
- Klasse: strong · amtliche Quelle: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/28062017-verwaltungsvorschrift-technische-baubestimmungen-vv-tb>
- Stammnorm eindeutig? ja · relevantes Datum: 2022-06-27 · vor Stichtag 2023-12-01? ja
- Zwingend? ja · Unsicherheit: keine; Portal weist lediglich kein Ende aus

**Kurzprüfung.** Eigene Außerkrafttretensformel der amtlichen Fassungsseite nennt 2022-06-27 (vor Stichtag 2023-12-01); Quellhash unverändert, Depublikation ausgeführt (recht-nrw-2023-12-01-lrmb-20260917T055943Z).

**Begründung der Ausnahme.** Im Zweifel Review statt unbelegter Übernahme: Außerkrafttreten vor dem Stichtag laut eigenem Text – die mit Parser 1.2.0 übernommene Fassung wird nicht weiter ausgeliefert, sondern kontrolliert depubliziert; Manifest trägt den aktuellen Befund (not-at-baseline). Folgeschritt: Geltungsbeleg redaktionell prüfen (Review-Fall metadata-conflict/historical-gap); bei Bestätigung der Stichtagsgeltung Override und Reimport mit --only term:31908 --offline --write.

**Vorgeschlagene Entscheidung.** `DEPUBLIKATION BEIBEHALTEN`

**Freigabe.**

- Status: AUSSTEHEND
- Entscheidung Nutzer: –
- Begründung Nutzer: –
- Datum: –

### 8. term:31967 – Richtlinie über die Gewährung von Zuwendungen an Betreiber von Fähren im Ausbildungsverkehr in Nordrhein-Westfalen (Richtlinie Fähren)

- Typ: `depublish` (Ausnahme `legacy-31967`) · Quellbereich: LRMB · Ziel-Slug: `richtlinie-ueber-die-gewaehrung-von-zuwendungen-an-betreiber-von-faehren-west`
- Aktueller öffentlicher Status: depubliziert: Manifest not-at-baseline (recht-nrw-lrmb-parser/1.3.0), Lauf recht-nrw-2023-12-01-lrmb-20260917T055943Z; kein Ziel-Slug
- Vorgeschlagene Ausnahme: kontrollierte Depublikation (depublish); Risiko **low**
- Parser alt/aktuell: `recht-nrw-lrmb-parser/1.2.0` → `recht-nrw-lrmb-parser/1.3.0` · Transformer: `recht-nrw-transformer/2.1.0`
- Quell-URL: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012017-richtlinie-ueber-die-gewaehrung-von-zuwendungen-betreiber-von> · Fundstelle: Fassungsseite RECHT.NRW
- Source-SHA-256: `654683f106a9eedf007acc09822699ead803b4199cf23d59b4f31f7e53b01047`
- Normtext-SHA-256 (Fassungsseite, Bytes): Legacy `654683f106a9eedf007acc09822699ead803b4199cf23d59b4f31f7e53b01047` · aktuell `654683f106a9eedf007acc09822699ead803b4199cf23d59b4f31f7e53b01047`
- Vorbereitet: 2026-09-17 durch `automated-review` · Evidenzreferenzen: evidence-pass `data/audits/recht-nrw/lrmb/EVIDENCE_PASS.json`, run-report `data/audits/recht-nrw/runs/recht-nrw-2023-12-01-lrmb-20260917T055943Z.json`, manifest `data/imports/recht-nrw/manifest/lrmb/term-31967.json`, review-item `term:31967:metadata-conflict:0fcddaf57b`

**Ausgangslage.** Mit `recht-nrw-lrmb-parser/1.2.0` als `imported-with-warnings` übernommen; der Reimport mit `recht-nrw-lrmb-parser/1.3.0` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: not-active-at-baseline.

**Neuer Befund.** `validity-expired-before-baseline` – validity-expired-before-baseline: Der Text tritt am 2019-12-31 außer Kraft („zum 31.12.2019“) – vor dem Stichtag 2023-12-01; das Portal weist kein Ende aus (Widerspruch zur Fassungsseite). Keine strukturelle Abweichung. Der Bewerter 1.3.0 ergibt not-at-baseline (validity-expired-before-baseline): Der Text tritt am 2019-12-31 außer Kraft („zum 31.12.2019“) – vor dem Stichtag 2023-12-01; das Portal weist kein Ende aus (Widerspruch zur Fassungsseite).

**Amtliche Evidenz.**

| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Suchindex-Signal | insufficient | trägt nicht allein | – | – | Suchindex des Portals (nur Hinweis) | Suchindex (nur Hinweis): historisch true, Gültig ab 2017-01-01, Außerkrafttreten 2019-12-31 | – (–) |
| Eigene Inkrafttretensformel | strong | trägt die Entscheidung | 2017-01-01 | – | eigener Text der Fassungsseite (richtlinie) | Dieser Runderlass tritt mit Wirkung vom 1.1.2017 in Kraft und zum 31.12.2019 außer Kraft. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012017-richtlinie-ueber-die-gewaehrung-von-zuwendungen-betreiber-von> (654683f106a9eedf…) |
| Eigene Außerkrafttretensformel | strong | trägt die Entscheidung | 2019-12-31 | – | eigener Text der Fassungsseite (richtlinie) | Dieser Runderlass tritt mit Wirkung vom 1.1.2017 in Kraft und zum 31.12.2019 außer Kraft. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012017-richtlinie-ueber-die-gewaehrung-von-zuwendungen-betreiber-von> (654683f106a9eedf…) |
| Quellhash der Fassungsseite (Manifest-Rohdokument) | n/a | ergänzend (Quelle unverändert) | 2026-09-17 | – | Prüfung des Importers | Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence… | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012017-richtlinie-ueber-die-gewaehrung-von-zuwendungen-betreiber-von> (654683f106a9eedf…) |

**Textintegrität.** identisch: 33570 ↔ 33570 Zeichen; Verfahren: Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence Pass Parser 1.3.0), nicht wegen einer Textabweichung. Werte sind Bytes der Fassungsseite, kein Normtextvergleich

**Depublikations-Fragen.**

- Welcher neue Beleg? Eigene Außerkrafttretensformel: Dieser Runderlass tritt mit Wirkung vom 1.1.2017 in Kraft und zum 31.12.2019 außer Kraft.
- Klasse: strong · amtliche Quelle: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012017-richtlinie-ueber-die-gewaehrung-von-zuwendungen-betreiber-von>
- Stammnorm eindeutig? ja · relevantes Datum: 2019-12-31 · vor Stichtag 2023-12-01? ja
- Zwingend? ja · Unsicherheit: keine; Portal weist lediglich kein Ende aus

**Kurzprüfung.** Eigene Außerkrafttretensformel der amtlichen Fassungsseite nennt 2019-12-31 (vor Stichtag 2023-12-01); Quellhash unverändert, Depublikation ausgeführt (recht-nrw-2023-12-01-lrmb-20260917T055943Z).

**Begründung der Ausnahme.** Im Zweifel Review statt unbelegter Übernahme: Außerkrafttreten vor dem Stichtag laut eigenem Text – die mit Parser 1.2.0 übernommene Fassung wird nicht weiter ausgeliefert, sondern kontrolliert depubliziert; Manifest trägt den aktuellen Befund (not-at-baseline). Folgeschritt: Geltungsbeleg redaktionell prüfen (Review-Fall metadata-conflict/historical-gap); bei Bestätigung der Stichtagsgeltung Override und Reimport mit --only term:31967 --offline --write.

**Vorgeschlagene Entscheidung.** `DEPUBLIKATION BEIBEHALTEN`

**Freigabe.**

- Status: AUSSTEHEND
- Entscheidung Nutzer: –
- Begründung Nutzer: –
- Datum: –

### 9. term:32104 – Richtlinie über die Gewährung von Soforthilfen bei durch Naturkatastrophen hervorgerufenen Notständen (Soforthilferichtlinie – SHR) Runderl…

- Typ: `depublish` (Ausnahme `legacy-32104`) · Quellbereich: LRMB · Ziel-Slug: `shr-west`
- Aktueller öffentlicher Status: depubliziert: Manifest not-at-baseline (recht-nrw-lrmb-parser/1.3.0), Lauf recht-nrw-2023-12-01-lrmb-20260917T055943Z; kein Ziel-Slug
- Vorgeschlagene Ausnahme: kontrollierte Depublikation (depublish); Risiko **low**
- Parser alt/aktuell: `recht-nrw-lrmb-parser/1.2.0` → `recht-nrw-lrmb-parser/1.3.0` · Transformer: `recht-nrw-transformer/2.1.0`
- Quell-URL: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012018-richtlinie-ueber-die-gewaehrung-von-soforthilfen-bei-durch> · Fundstelle: Fassungsseite RECHT.NRW
- Source-SHA-256: `31f310b9bced2ef388e596d3d547fea4141b9f774dc42baed15af80bd5d6938a`
- Normtext-SHA-256 (Fassungsseite, Bytes): Legacy `31f310b9bced2ef388e596d3d547fea4141b9f774dc42baed15af80bd5d6938a` · aktuell `31f310b9bced2ef388e596d3d547fea4141b9f774dc42baed15af80bd5d6938a`
- Vorbereitet: 2026-09-17 durch `automated-review` · Evidenzreferenzen: evidence-pass `data/audits/recht-nrw/lrmb/EVIDENCE_PASS.json`, run-report `data/audits/recht-nrw/runs/recht-nrw-2023-12-01-lrmb-20260917T055943Z.json`, manifest `data/imports/recht-nrw/manifest/lrmb/term-32104.json`, review-item `term:32104:metadata-conflict:26ce0fecb5`

**Ausgangslage.** Mit `recht-nrw-lrmb-parser/1.2.0` als `imported-with-warnings` übernommen; der Reimport mit `recht-nrw-lrmb-parser/1.3.0` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: not-active-at-baseline.

**Neuer Befund.** `validity-expired-before-baseline` – validity-expired-before-baseline: Der Text tritt am 2022-12-31 außer Kraft („am 31. Dezember 2022“) – vor dem Stichtag 2023-12-01; das Portal weist kein Ende aus (Widerspruch zur Fassungsseite). Keine strukturelle Abweichung. Der Bewerter 1.3.0 ergibt not-at-baseline (validity-expired-before-baseline): Der Text tritt am 2022-12-31 außer Kraft („am 31. Dezember 2022“) – vor dem Stichtag 2023-12-01; das Portal weist kein Ende aus (Widerspruch zur Fassungsseite).

**Amtliche Evidenz.**

| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Suchindex-Signal | insufficient | trägt nicht allein | – | – | Suchindex des Portals (nur Hinweis) | Suchindex (nur Hinweis): historisch true, Gültig ab 2018-01-01, Außerkrafttreten 2022-12-31 | – (–) |
| Eigene Inkrafttretensformel | strong | trägt die Entscheidung | 2018-01-01 | – | eigener Text der Fassungsseite (richtlinie) | Diese Richtlinien treten mit Wirkung vom 1. Januar 2018 in Kraft. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012018-richtlinie-ueber-die-gewaehrung-von-soforthilfen-bei-durch> (31f310b9bced2ef3…) |
| Eigene Außerkrafttretensformel | strong | trägt die Entscheidung | 2022-12-31 | – | eigener Text der Fassungsseite (richtlinie) | Sie gelten für ab diesem Zeitpunkt eingeleitete Soforthilfen und treten am 31. Dezember 2022 außer Kraft. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012018-richtlinie-ueber-die-gewaehrung-von-soforthilfen-bei-durch> (31f310b9bced2ef3…) |
| Quellhash der Fassungsseite (Manifest-Rohdokument) | n/a | ergänzend (Quelle unverändert) | 2026-09-17 | – | Prüfung des Importers | Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence… | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012018-richtlinie-ueber-die-gewaehrung-von-soforthilfen-bei-durch> (31f310b9bced2ef3…) |

**Textintegrität.** identisch: 70542 ↔ 70542 Zeichen; Verfahren: Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence Pass Parser 1.3.0), nicht wegen einer Textabweichung. Werte sind Bytes der Fassungsseite, kein Normtextvergleich

**Depublikations-Fragen.**

- Welcher neue Beleg? Eigene Außerkrafttretensformel: Sie gelten für ab diesem Zeitpunkt eingeleitete Soforthilfen und treten am 31. Dezember 2022 außer Kraft.
- Klasse: strong · amtliche Quelle: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012018-richtlinie-ueber-die-gewaehrung-von-soforthilfen-bei-durch>
- Stammnorm eindeutig? ja · relevantes Datum: 2022-12-31 · vor Stichtag 2023-12-01? ja
- Zwingend? ja · Unsicherheit: keine; Portal weist lediglich kein Ende aus

**Kurzprüfung.** Eigene Außerkrafttretensformel der amtlichen Fassungsseite nennt 2022-12-31 (vor Stichtag 2023-12-01); Quellhash unverändert, Depublikation ausgeführt (recht-nrw-2023-12-01-lrmb-20260917T055943Z).

**Begründung der Ausnahme.** Im Zweifel Review statt unbelegter Übernahme: Außerkrafttreten vor dem Stichtag laut eigenem Text – die mit Parser 1.2.0 übernommene Fassung wird nicht weiter ausgeliefert, sondern kontrolliert depubliziert; Manifest trägt den aktuellen Befund (not-at-baseline). Folgeschritt: Geltungsbeleg redaktionell prüfen (Review-Fall metadata-conflict/historical-gap); bei Bestätigung der Stichtagsgeltung Override und Reimport mit --only term:32104 --offline --write.

**Vorgeschlagene Entscheidung.** `DEPUBLIKATION BEIBEHALTEN`

**Freigabe.**

- Status: AUSSTEHEND
- Entscheidung Nutzer: –
- Begründung Nutzer: –
- Datum: –

## Depublikationen mit contradictory-Evidenz (amtlicher Nachfolgebeleg, offenes Portalintervall)

### 10. term:31080 – Richtlinien für die dienstliche Beurteilung der Beschäftigten (Beamtinnen und Beamten) im Geschäftsbereich des Ministeriums für Wirtschaft,…

- Typ: `depublish` (Ausnahme `legacy-31080`) · Quellbereich: LRMB · Ziel-Slug: `richtlinien-fuer-die-dienstliche-beurteilung-der-beschaeftigten-west`
- Aktueller öffentlicher Status: depubliziert: Manifest needs-review (recht-nrw-lrmb-parser/1.3.0), Lauf recht-nrw-2023-12-01-lrmb-20260917T055943Z; kein Ziel-Slug
- Vorgeschlagene Ausnahme: kontrollierte Depublikation (depublish); Risiko **medium**
- Parser alt/aktuell: `recht-nrw-lrmb-parser/1.2.0` → `recht-nrw-lrmb-parser/1.3.0` · Transformer: `recht-nrw-transformer/2.1.0`
- Quell-URL: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/13062014-richtlinien-fuer-die-dienstliche-beurteilung-der-beschaeftigten> · Fundstelle: MBl. NRW. S. 356
- Source-SHA-256: `c3be80ea1a6fff1ad63e6937dde9efd2eb2bce144e95dd9d2f193b27d222917c`
- Normtext-SHA-256 (Fassungsseite, Bytes): Legacy `c3be80ea1a6fff1ad63e6937dde9efd2eb2bce144e95dd9d2f193b27d222917c` · aktuell `c3be80ea1a6fff1ad63e6937dde9efd2eb2bce144e95dd9d2f193b27d222917c`
- Vorbereitet: 2026-09-17 durch `automated-review` · Evidenzreferenzen: evidence-pass `data/audits/recht-nrw/lrmb/EVIDENCE_PASS.json`, run-report `data/audits/recht-nrw/runs/recht-nrw-2023-12-01-lrmb-20260917T055943Z.json`, manifest `data/imports/recht-nrw/manifest/lrmb/term-31080.json`, review-item `term:31080:metadata-conflict:8b86bd847c`

**Ausgangslage.** Mit `recht-nrw-lrmb-parser/1.2.0` als `imported-with-warnings` übernommen; der Reimport mit `recht-nrw-lrmb-parser/1.3.0` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: undetermined.

**Neuer Befund.** `validity-successor-contradicted` – validity-successor-contradicted: Aufhebung/Ablösung durch Richtlinien für die dienstliche Beurteilung der Beamtinnen und Beamten im Geschäftsbereich des Minis (wirksam 2017-06-01) widerspricht anderen Belegen: Portalintervall der ge…. Keine strukturelle Abweichung. Der Bewerter 1.3.0 ergibt needs-review (validity-successor-contradicted): Aufhebung/Ablösung durch Richtlinien für die dienstliche Beurteilung der Beamtinnen und Beamten im Geschäftsbereich des Minis (wirksam 2017-06-01) widerspricht anderen Belegen: Portalintervall der gew.

**Amtliche Evidenz.**

| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Suchindex-Signal | insufficient | trägt nicht allein | – | – | Suchindex des Portals (nur Hinweis) | Suchindex (nur Hinweis): historisch true, Gültig ab 2014-06-13, Außerkrafttreten – | – (–) |
| Aufhebung durch Richtlinien für die dienstliche Beurteilung der Beamtinnen und Beamten im Geschäftsbereich des Ministeriums f… (term:31887) | contradictory | trägt die Entscheidung (Widerspruch) | 2017-06-01 | MBl. NRW. S. 356 | Nachfolgevorschrift (amtliche LRMB-Fassungsseite) | Der Runderlass des Ministeriums für Wirtschaft, Energie, Industrie, Mittelstand und Handwerk „Richtlinie für die dienstliche Beurteilung de… | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01062017-richtlinien-fuer-die-dienstliche-beurteilung-der-beamtinnen-und> (66bd629528694c42…) |
| Quellhash der Fassungsseite (Manifest-Rohdokument) | n/a | ergänzend (Quelle unverändert) | 2026-09-17 | – | Prüfung des Importers | Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence… | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/13062014-richtlinien-fuer-die-dienstliche-beurteilung-der-beschaeftigten> (c3be80ea1a6fff1a…) |

**Textintegrität.** identisch: 69873 ↔ 69873 Zeichen; Verfahren: Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence Pass Parser 1.3.0), nicht wegen einer Textabweichung. Werte sind Bytes der Fassungsseite, kein Normtextvergleich

**Depublikations-Fragen.**

- Welcher neue Beleg? Aufhebung durch Richtlinien für die dienstliche Beurteilung der Beamtinnen und Beamten im Geschäftsbereich des Ministeriums f… (term:31887): Der Runderlass des Ministeriums für Wirtschaft, Energie, Industrie, Mittelstand und Handwerk „Richtlinie für die dienst…
- Klasse: contradictory · amtliche Quelle: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01062017-richtlinien-fuer-die-dienstliche-beurteilung-der-beamtinnen-und>
- Stammnorm eindeutig? ja · relevantes Datum: 2017-06-01 · vor Stichtag 2023-12-01? ja
- Zwingend? ja · Unsicherheit: nur das offene Portalintervall widerspricht (Portal weist kein Ende aus)

**Kurzprüfung.** Nachfolgevorschrift term:31887 (MBl. NRW. S. 356) hebt die Vorschrift zum 2017-06-01 auf; nur das offene Portalintervall widerspricht.

**Begründung der Ausnahme.** Im Zweifel Review statt unbelegter Übernahme: widersprüchliche Geltungsevidenz – die mit Parser 1.2.0 übernommene Fassung wird nicht weiter ausgeliefert, sondern kontrolliert depubliziert; Manifest trägt den aktuellen Befund (needs-review). Folgeschritt: Geltungsbeleg redaktionell prüfen (Review-Fall metadata-conflict/historical-gap); bei Bestätigung der Stichtagsgeltung Override und Reimport mit --only term:31080 --offline --write.

**Vorgeschlagene Entscheidung.** `DEPUBLIKATION BEIBEHALTEN`

**Freigabe.**

- Status: AUSSTEHEND
- Entscheidung Nutzer: –
- Begründung Nutzer: –
- Datum: –

### 11. term:32424 – Richtlinie über bauaufsichtliche Anforderungen an Schulen (Schulbaurichtlinie – SchulBauR) * Runderlass des Ministeriums für Heimat, Kommun…

- Typ: `depublish` (Ausnahme `legacy-32424`) · Quellbereich: LRMB · Ziel-Slug: `schulbaur-west-32424`
- Aktueller öffentlicher Status: depubliziert: Manifest needs-review (recht-nrw-lrmb-parser/1.3.0), Lauf recht-nrw-2023-12-01-lrmb-20260917T055943Z; kein Ziel-Slug
- Vorgeschlagene Ausnahme: kontrollierte Depublikation (depublish); Risiko **medium**
- Parser alt/aktuell: `recht-nrw-lrmb-parser/1.2.0` → `recht-nrw-lrmb-parser/1.3.0` · Transformer: `recht-nrw-transformer/2.1.0`
- Quell-URL: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/08062019-richtlinie-ueber-bauaufsichtliche-anforderungen-schulen> · Fundstelle: MBl. NRW. S. 218
- Source-SHA-256: `02214f846309b5f82027cb4c5b8dae54bb648816fde720a02aef15d49d4846ca`
- Normtext-SHA-256 (Fassungsseite, Bytes): Legacy `02214f846309b5f82027cb4c5b8dae54bb648816fde720a02aef15d49d4846ca` · aktuell `02214f846309b5f82027cb4c5b8dae54bb648816fde720a02aef15d49d4846ca`
- Vorbereitet: 2026-09-17 durch `automated-review` · Evidenzreferenzen: evidence-pass `data/audits/recht-nrw/lrmb/EVIDENCE_PASS.json`, run-report `data/audits/recht-nrw/runs/recht-nrw-2023-12-01-lrmb-20260917T055943Z.json`, manifest `data/imports/recht-nrw/manifest/lrmb/term-32424.json`, review-item `term:32424:metadata-conflict:37c9c5815e`

**Ausgangslage.** Mit `recht-nrw-lrmb-parser/1.2.0` als `imported-with-warnings` übernommen; der Reimport mit `recht-nrw-lrmb-parser/1.3.0` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: undetermined.

**Neuer Befund.** `validity-successor-contradicted` – validity-successor-contradicted: Aufhebung/Ablösung durch Richtlinie über bauaufsichtliche Anforderungen an Schulen (Schulbaurichtlinie – SchulBauR) Runderlas (wirksam 2020-12-11) widerspricht anderen Belegen: Portalintervall der ge…. Keine strukturelle Abweichung. Der Bewerter 1.3.0 ergibt needs-review (validity-successor-contradicted): Aufhebung/Ablösung durch Richtlinie über bauaufsichtliche Anforderungen an Schulen (Schulbaurichtlinie – SchulBauR) Runderlas (wirksam 2020-12-11) widerspricht anderen Belegen: Portalintervall der gew.

**Amtliche Evidenz.**

| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Suchindex-Signal | insufficient | trägt nicht allein | – | – | Suchindex des Portals (nur Hinweis) | Suchindex (nur Hinweis): historisch true, Gültig ab 2019-06-08, Außerkrafttreten – | – (–) |
| Aufhebung durch Richtlinie über bauaufsichtliche Anforderungen an Schulen (Schulbaurichtlinie – SchulBauR) Runderlass des Min… (term:32897) | contradictory | trägt die Entscheidung (Widerspruch) | 2020-12-11 | MBl. NRW. S. 218 | Nachfolgevorschrift (amtliche LRMB-Fassungsseite) | Gleichzeitig tritt der Runderlass des Ministeriums für Heimat, Kommunales, Bau und Gleichstellung „Schulbaurichtlinie“ vom 16. Mai 2019 (MB… | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/11122020-richtlinie-ueber-bauaufsichtliche-anforderungen-schulen> (3bbcb936575503b4…) |
| Quellhash der Fassungsseite (Manifest-Rohdokument) | n/a | ergänzend (Quelle unverändert) | 2026-09-17 | – | Prüfung des Importers | Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence… | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/08062019-richtlinie-ueber-bauaufsichtliche-anforderungen-schulen> (02214f846309b5f8…) |

**Textintegrität.** identisch: 35296 ↔ 35296 Zeichen; Verfahren: Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence Pass Parser 1.3.0), nicht wegen einer Textabweichung. Werte sind Bytes der Fassungsseite, kein Normtextvergleich

**Depublikations-Fragen.**

- Welcher neue Beleg? Aufhebung durch Richtlinie über bauaufsichtliche Anforderungen an Schulen (Schulbaurichtlinie – SchulBauR) Runderlass des Min… (term:32897): Gleichzeitig tritt der Runderlass des Ministeriums für Heimat, Kommunales, Bau und Gleichstellung „Schulbaurichtlinie“ …
- Klasse: contradictory · amtliche Quelle: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/11122020-richtlinie-ueber-bauaufsichtliche-anforderungen-schulen>
- Stammnorm eindeutig? ja · relevantes Datum: 2020-12-11 · vor Stichtag 2023-12-01? ja
- Zwingend? ja · Unsicherheit: nur das offene Portalintervall widerspricht (Portal weist kein Ende aus)

**Kurzprüfung.** Nachfolgevorschrift term:32897 (MBl. NRW. S. 218) hebt die Vorschrift zum 2020-12-11 auf; nur das offene Portalintervall widerspricht.

**Begründung der Ausnahme.** Im Zweifel Review statt unbelegter Übernahme: widersprüchliche Geltungsevidenz – die mit Parser 1.2.0 übernommene Fassung wird nicht weiter ausgeliefert, sondern kontrolliert depubliziert; Manifest trägt den aktuellen Befund (needs-review). Folgeschritt: Geltungsbeleg redaktionell prüfen (Review-Fall metadata-conflict/historical-gap); bei Bestätigung der Stichtagsgeltung Override und Reimport mit --only term:32424 --offline --write.

**Vorgeschlagene Entscheidung.** `DEPUBLIKATION BEIBEHALTEN`

**Freigabe.**

- Status: AUSSTEHEND
- Entscheidung Nutzer: –
- Begründung Nutzer: –
- Datum: –

### 12. term:33495 – Richtlinie zur Förderung der Modernisierung von Wohnraum in Nordrhein-Westfalen (Modernisierungsförderung – RL Mod 2022)

- Typ: `depublish` (Ausnahme `legacy-33495`) · Quellbereich: LRMB · Ziel-Slug: `richtlinie-zur-foerderung-der-modernisierung-von-wohnraum-in-west`
- Aktueller öffentlicher Status: depubliziert: Manifest needs-review (recht-nrw-lrmb-parser/1.3.0), Lauf recht-nrw-2023-12-01-lrmb-20260917T055943Z; kein Ziel-Slug
- Vorgeschlagene Ausnahme: kontrollierte Depublikation (depublish); Risiko **medium**
- Parser alt/aktuell: `recht-nrw-lrmb-parser/1.2.0` → `recht-nrw-lrmb-parser/1.3.0` · Transformer: `recht-nrw-transformer/2.1.0`
- Quell-URL: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/14022022-richtlinie-zur-foerderung-der-modernisierung-von-wohnraum> · Fundstelle: MBl. NRW. S. 272
- Source-SHA-256: `8b81b0e6ec4bedf81b021dc182d597feb785022af6a3fc817960fe388d14146e`
- Normtext-SHA-256 (Fassungsseite, Bytes): Legacy `8b81b0e6ec4bedf81b021dc182d597feb785022af6a3fc817960fe388d14146e` · aktuell `8b81b0e6ec4bedf81b021dc182d597feb785022af6a3fc817960fe388d14146e`
- Vorbereitet: 2026-09-17 durch `automated-review` · Evidenzreferenzen: evidence-pass `data/audits/recht-nrw/lrmb/EVIDENCE_PASS.json`, run-report `data/audits/recht-nrw/runs/recht-nrw-2023-12-01-lrmb-20260917T055943Z.json`, manifest `data/imports/recht-nrw/manifest/lrmb/term-33495.json`, review-item `term:33495:metadata-conflict:6462b8124d`

**Ausgangslage.** Mit `recht-nrw-lrmb-parser/1.2.0` als `imported-with-warnings` übernommen; der Reimport mit `recht-nrw-lrmb-parser/1.3.0` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: undetermined.

**Neuer Befund.** `validity-successor-contradicted` – validity-successor-contradicted: Aufhebung/Ablösung durch Richtlinie zur Förderung der Modernisierung von Wohnraum im Land Nordrhein-Westfalen (Modernisierung (wirksam 2023-02-15) widerspricht anderen Belegen: Portalintervall der ge…. Keine strukturelle Abweichung. Der Bewerter 1.3.0 ergibt needs-review (validity-successor-contradicted): Aufhebung/Ablösung durch Richtlinie zur Förderung der Modernisierung von Wohnraum im Land Nordrhein-Westfalen (Modernisierung (wirksam 2023-02-15) widerspricht anderen Belegen: Portalintervall der gew.

**Amtliche Evidenz.**

| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Suchindex-Signal | insufficient | trägt nicht allein | – | – | Suchindex des Portals (nur Hinweis) | Suchindex (nur Hinweis): historisch true, Gültig ab 2022-02-14, Außerkrafttreten – | – (–) |
| Eigene Inkrafttretensformel | strong | trägt die Entscheidung | 2022-02-14 | – | eigener Text der Fassungsseite (richtlinie) | Dieser Runderlass tritt am 14. Februar 2022 in Kraft. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/14022022-richtlinie-zur-foerderung-der-modernisierung-von-wohnraum> (8b81b0e6ec4bedf8…) |
| Aufhebung durch Richtlinie zur Förderung der Modernisierung von Wohnraum im Land Nordrhein-Westfalen (Modernisierungsförderun… (term:33747) | contradictory | trägt die Entscheidung (Widerspruch) | 2023-02-15 | MBl. NRW. S. 272 | Nachfolgevorschrift (amtliche LRMB-Fassungsseite) | Gleichzeitig tritt der Runderlass „Modernisierungsförderung“ vom 25. März 2022 (MBl. NRW. S. 272) außer Kraft. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/15022023-richtlinie-zur-foerderung-der-modernisierung-von-wohnraum-im> (afab1b55a05e06a3…) |
| Quellhash der Fassungsseite (Manifest-Rohdokument) | n/a | ergänzend (Quelle unverändert) | 2026-09-17 | – | Prüfung des Importers | Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence… | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/14022022-richtlinie-zur-foerderung-der-modernisierung-von-wohnraum> (8b81b0e6ec4bedf8…) |

**Textintegrität.** identisch: 98877 ↔ 98877 Zeichen; Verfahren: Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence Pass Parser 1.3.0), nicht wegen einer Textabweichung. Werte sind Bytes der Fassungsseite, kein Normtextvergleich

**Depublikations-Fragen.**

- Welcher neue Beleg? Aufhebung durch Richtlinie zur Förderung der Modernisierung von Wohnraum im Land Nordrhein-Westfalen (Modernisierungsförderun… (term:33747): Gleichzeitig tritt der Runderlass „Modernisierungsförderung“ vom 25. März 2022 (MBl. NRW. S. 272) außer Kraft.
- Klasse: strong, contradictory · amtliche Quelle: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/15022023-richtlinie-zur-foerderung-der-modernisierung-von-wohnraum-im>
- Stammnorm eindeutig? ja · relevantes Datum: 2023-02-15 · vor Stichtag 2023-12-01? ja
- Zwingend? ja · Unsicherheit: nur das offene Portalintervall widerspricht (Portal weist kein Ende aus)

**Kurzprüfung.** Nachfolgevorschrift term:33747 (MBl. NRW. S. 272) hebt die Vorschrift zum 2023-02-15 auf; nur das offene Portalintervall widerspricht.

**Begründung der Ausnahme.** Im Zweifel Review statt unbelegter Übernahme: widersprüchliche Geltungsevidenz – die mit Parser 1.2.0 übernommene Fassung wird nicht weiter ausgeliefert, sondern kontrolliert depubliziert; Manifest trägt den aktuellen Befund (needs-review). Folgeschritt: Geltungsbeleg redaktionell prüfen (Review-Fall metadata-conflict/historical-gap); bei Bestätigung der Stichtagsgeltung Override und Reimport mit --only term:33495 --offline --write.

**Vorgeschlagene Entscheidung.** `DEPUBLIKATION BEIBEHALTEN`

**Freigabe.**

- Status: AUSSTEHEND
- Entscheidung Nutzer: –
- Begründung Nutzer: –
- Datum: –

## Deliver-Legacy (Text identisch, nur Struktur)

### 13. term:27211 – Gesetz zur Neugliederung der Gemeinden und Kreise des Neugliederungsraumes Aachen (Aachen-Gesetz)

- Typ: `deliver-legacy` (Ausnahme `legacy-27211`) · Quellbereich: LRGV · Ziel-Slug: `aachen-gesetz-west`
- Aktueller öffentlicher Status: veröffentlicht: content/norms/west/aachen-gesetz-west (recht-nrw-parser/1.1.0, imported-with-warnings)
- Vorgeschlagene Ausnahme: gespeicherte Fassung weiter ausliefern (deliver-legacy); Risiko **low**
- Parser alt/aktuell: `recht-nrw-parser/1.1.0` → `recht-nrw-parser/1.2.0` · Transformer: `recht-nrw-transformer/2.1.0`
- Quell-URL: <https://recht.nrw.de/lrgv/gesetz/01012000-gesetz-zur-neugliederung-der-gemeinden-und-kreise-des-neugliederungsraumes> · Fundstelle: Fassungsseite RECHT.NRW
- Source-SHA-256: `2fe36069b4fe2bb88d1583de379a150cb75008d1b0ec44c8b0d6dcdc61d8e185`
- Normtext-SHA-256 (sichtbarer Text): Legacy `4c610d8f7bd547eed8d3bbae45029faf54c29d2b87296769e1b1566c40257656` · aktuell `4c610d8f7bd547eed8d3bbae45029faf54c29d2b87296769e1b1566c40257656`
- Vorbereitet: 2026-09-17 durch `automated-review` · Evidenzreferenzen: analysis `data/audits/recht-nrw/lrgv/IMPORT_REGRESSION_FAELLE.json`, manifest `data/imports/recht-nrw/manifest/lrgv/term-27211.json`, review-item `term:27211:unknown-structure:c8825da8c5`

**Ausgangslage.** Mit `recht-nrw-parser/1.1.0` als `imported-with-warnings` übernommen; der Reimport mit `recht-nrw-parser/1.2.0` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: active-at-baseline.

**Neuer Befund.** `structure-unnumbered-section`. Sektion 34 des Portals hat kein Nummernfeld; sie ist nach Zählung (§ 32 → § 34) und Querverweisen (§ 32: „in den §§ 31 und 33 genannten Flurstücke“; § 34: „in § 33 genannten Flurstücke“) der § 33 (Eingliederungen in die Gemeinde Wegberg). Die gespeicherte Fassung führt seine Absätze (1) und (2) als weitere Absätze (1)/(2) am Ende von § 32; Einheit § 33 fehlt (48 statt 49 Einheiten). Kein Textverlust, keine Textänderung.

**Amtliche Evidenz.**

| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fassungsliste des Portals | strong | trägt die Entscheidung | – | – | Portal-Metadaten der Fassungsseite | Fassungsliste mit 1 Fassung(en); lokale Stichtagsauswahl selected | <https://recht.nrw.de/lrgv/gesetz/01012000-gesetz-zur-neugliederung-der-gemeinden-und-kreise-des-neugliederungsraumes> (–) |
| Portalintervall der gewählten Fassung | strong | trägt die Entscheidung | – | – | Portal-Metadaten der Fassungsseite | Infobox der gewählten Fassung: Gültig ab 2000-01-01 bis offen | <https://recht.nrw.de/lrgv/gesetz/01012000-gesetz-zur-neugliederung-der-gemeinden-und-kreise-des-neugliederungsraumes> (2fe36069b4fe2bb8…) |
| Textintegrität gespeicherte Fassung ↔ Parser aktuell | n/a | trägt die Entscheidung (Textidentität) | 2026-09-17 | – | Prüfung des Importers | sichtbarer Text der kanonischen Fassung vs. transformierter Dry-run-Output Parser 1.2.0, zeilenweise (Kennzeichen, Titel, Text; ohne Fußnot… | <https://recht.nrw.de/lrgv/gesetz/01012000-gesetz-zur-neugliederung-der-gemeinden-und-kreise-des-neugliederungsraumes> (4c610d8f7bd547ee…) |

**Textintegrität.** identisch: 56457 ↔ 56457 Zeichen; Verfahren: sichtbarer Text der kanonischen Fassung vs. transformierter Dry-run-Output Parser 1.2.0, zeilenweise (Kennzeichen, Titel, Text; ohne Fußnotenblöcke), SHA-256.

**Legacy-Fragen.**

- Text vollständig? ja · hash-/semantisch identisch? ja
- Was kann Parser 1.2.0 nicht einordnen? Sektion(en) 34 ohne Nummernfeld – nach Zählung/Querverweis: § 33
- Nur Struktur oder möglicherweise Rechtsinhalt? nur Struktur (kein Textverlust, keine Textänderung)
- Amtlicher Source-Hash? `2fe36069b4fe2bb88d1583de379a150cb75008d1b0ec44c8b0d6dcdc61d8e185` · Reviewfall? term:27211:unknown-structure:c8825da8c5
- Weiter auslieferbar? ja

**Kurzprüfung.** Text vollständig und SHA-256-identisch (56457 Zeichen); Sektion(en) 34 ohne Nummernfeld (§ 33), Zuordnung nur strukturell. Override des Kennzeichens vorgeschlagen.

**Begründung der Ausnahme.** Legacy-safe: Text vollständig und mit dem aktuellen Parseroutput identisch (SHA-256), alle 48 vorhandenen Einheiten korrekt; nur zwei Absätze stehen unter § 32 statt unter einem fehlenden § 33. Ein Kennzeichen wird nicht erfunden (fail-closed, Parser 1.2.0); Depublikation würde ein vollständiges Gebietsänderungsgesetz wegen einer Portallücke entziehen. Der Review-Fall unknown-structure bleibt offen. Folgeschritt: Dokumentiertes Override des fehlenden Kennzeichens (Vorschlag: Feld unitLabel { section: 34, label: "§ 33" } mit Beleg Zählungslücke/Querverweise) und Reimport mit --only term:27211 --offline --write; danach Ausnahme entfernen.

**Vorgeschlagene Entscheidung.** `DELIVER-LEGACY BEIBEHALTEN`

**Freigabe.**

- Status: AUSSTEHEND
- Entscheidung Nutzer: –
- Begründung Nutzer: –
- Datum: –

### 14. term:27217 – Gesetz zur Neugliederung der Gemeinden und Kreise des Neugliederungsraumes Mönchengladbach/Düsseldorf/Wuppertal (Düsseldorf-Gesetz)

- Typ: `deliver-legacy` (Ausnahme `legacy-27217`) · Quellbereich: LRGV · Ziel-Slug: `duesseldorf-gesetz-west`
- Aktueller öffentlicher Status: veröffentlicht: content/norms/west/duesseldorf-gesetz-west (recht-nrw-parser/1.1.0, imported-with-warnings)
- Vorgeschlagene Ausnahme: gespeicherte Fassung weiter ausliefern (deliver-legacy); Risiko **low**
- Parser alt/aktuell: `recht-nrw-parser/1.1.0` → `recht-nrw-parser/1.2.0` · Transformer: `recht-nrw-transformer/2.1.0`
- Quell-URL: <https://recht.nrw.de/lrgv/gesetz/01012000-gesetz-zur-neugliederung-der-gemeinden-und-kreise-des-neugliederungsraumes-4> · Fundstelle: Fassungsseite RECHT.NRW
- Source-SHA-256: `1e2fb5d237a83cb68b25c8db9bd58315571bf916803ef760d27fe32257e6ae22`
- Normtext-SHA-256 (sichtbarer Text): Legacy `577bedb9b6f96298b44d16c5fc7e376daf067356d79605a957bf1daba4f19f2f` · aktuell `577bedb9b6f96298b44d16c5fc7e376daf067356d79605a957bf1daba4f19f2f`
- Vorbereitet: 2026-09-17 durch `automated-review` · Evidenzreferenzen: analysis `data/audits/recht-nrw/lrgv/IMPORT_REGRESSION_FAELLE.json`, manifest `data/imports/recht-nrw/manifest/lrgv/term-27217.json`, review-item `term:27217:unknown-structure:e348855231`

**Ausgangslage.** Mit `recht-nrw-parser/1.1.0` als `imported-with-warnings` übernommen; der Reimport mit `recht-nrw-parser/1.2.0` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: active-at-baseline.

**Neuer Befund.** `structure-unnumbered-section`. Sektion 24 des Portals hat kein Nummernfeld; nach Zählung (§ 22 → § 24) ist sie der § 23 (Eingliederung der Stadt Neuss in den Kreis Grevenbroich, Umbenennung in Kreis Neuss). Die gespeicherte Fassung führt seine Absätze (1)–(3) als weitere Absätze am Ende von § 22; Einheit § 23 fehlt (30 statt 31 Einheiten). Kein Textverlust, keine Textänderung.

**Amtliche Evidenz.**

| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fassungsliste des Portals | strong | trägt die Entscheidung | – | – | Portal-Metadaten der Fassungsseite | Fassungsliste mit 1 Fassung(en); lokale Stichtagsauswahl selected | <https://recht.nrw.de/lrgv/gesetz/01012000-gesetz-zur-neugliederung-der-gemeinden-und-kreise-des-neugliederungsraumes-4> (–) |
| Portalintervall der gewählten Fassung | strong | trägt die Entscheidung | – | – | Portal-Metadaten der Fassungsseite | Infobox der gewählten Fassung: Gültig ab 2000-01-01 bis offen | <https://recht.nrw.de/lrgv/gesetz/01012000-gesetz-zur-neugliederung-der-gemeinden-und-kreise-des-neugliederungsraumes-4> (1e2fb5d237a83cb6…) |
| Textintegrität gespeicherte Fassung ↔ Parser aktuell | n/a | trägt die Entscheidung (Textidentität) | 2026-09-17 | – | Prüfung des Importers | sichtbarer Text der kanonischen Fassung vs. transformierter Dry-run-Output Parser 1.2.0, zeilenweise (Kennzeichen, Titel, Text; ohne Fußnot… | <https://recht.nrw.de/lrgv/gesetz/01012000-gesetz-zur-neugliederung-der-gemeinden-und-kreise-des-neugliederungsraumes-4> (577bedb9b6f96298…) |

**Textintegrität.** identisch: 42108 ↔ 42108 Zeichen; Verfahren: sichtbarer Text der kanonischen Fassung vs. transformierter Dry-run-Output Parser 1.2.0, zeilenweise (Kennzeichen, Titel, Text; ohne Fußnotenblöcke), SHA-256. Die gespeicherte Fassung enthält zusätzlich eine Fußnote des Vorspanns als Fließtextzeile „Fn 1: …“ (Parser 1.1.0, 114 Zeichen); Parser 1.2.0 führt sie als Fußnotenblock. Diese Zeile ist im Vergleich ausgenommen; sie ist zusätzlicher, kein fehlender Text.

**Legacy-Fragen.**

- Text vollständig? ja · hash-/semantisch identisch? ja
- Was kann Parser 1.2.0 nicht einordnen? Sektion(en) 24 ohne Nummernfeld – nach Zählung/Querverweis: § 23
- Nur Struktur oder möglicherweise Rechtsinhalt? nur Struktur (kein Textverlust, keine Textänderung)
- Amtlicher Source-Hash? `1e2fb5d237a83cb68b25c8db9bd58315571bf916803ef760d27fe32257e6ae22` · Reviewfall? term:27217:unknown-structure:e348855231
- Weiter auslieferbar? ja

**Kurzprüfung.** Text vollständig und SHA-256-identisch (42108 Zeichen); Sektion(en) 24 ohne Nummernfeld (§ 23), Zuordnung nur strukturell. Override des Kennzeichens vorgeschlagen.

**Begründung der Ausnahme.** Legacy-safe: Text vollständig und mit dem aktuellen Parseroutput identisch (SHA-256, ohne die alte Fußnoten-Fließtextzeile), 30 Einheiten korrekt; drei Absätze stehen unter § 22 statt unter einem fehlenden § 23. Kein Kennzeichen wird erfunden; Depublikation eines vollständigen Gebietsänderungsgesetzes wäre unverhältnismäßig. Review-Fall unknown-structure bleibt offen. Folgeschritt: Dokumentiertes Override des fehlenden Kennzeichens (Vorschlag: unitLabel { section: 24, label: "§ 23" }, Beleg Zählungslücke) und Reimport mit --only term:27217 --offline --write; danach Ausnahme entfernen.

**Vorgeschlagene Entscheidung.** `DELIVER-LEGACY BEIBEHALTEN`

**Freigabe.**

- Status: AUSSTEHEND
- Entscheidung Nutzer: –
- Begründung Nutzer: –
- Datum: –

### 15. term:27514 – Gesetz zu dem Vertrag zwischen dem Land Nordrhein-Westfalen und dem Heiligen Stuhl

- Typ: `deliver-legacy` (Ausnahme `legacy-27514`) · Quellbereich: LRGV · Ziel-Slug: `gesetz-zu-dem-vertrag-zwischen-dem-land-westdeutschland-und-dem-heiligen-west`
- Aktueller öffentlicher Status: veröffentlicht: content/norms/west/gesetz-zu-dem-vertrag-zwischen-dem-land-westdeutschland-und-dem-heiligen-west (recht-nrw-parser/1.1.0, imported-with-warnings)
- Vorgeschlagene Ausnahme: gespeicherte Fassung weiter ausliefern (deliver-legacy); Risiko **medium**
- Parser alt/aktuell: `recht-nrw-parser/1.1.0` → `recht-nrw-parser/1.2.0` · Transformer: `recht-nrw-transformer/2.1.0`
- Quell-URL: <https://recht.nrw.de/lrgv/gesetz/01012000-gesetz-zu-dem-vertrag-zwischen-dem-land-nordrhein-westfalen-und-dem-heiligen> · Fundstelle: Fassungsseite RECHT.NRW
- Source-SHA-256: `286ecafc1125c54a8e9c946c01d6c68c07e567ac8444501e22c4e8f7250d56bf`
- Normtext-SHA-256 (sichtbarer Text): Legacy `a413267dc15b4651ccf1630920ede5d6c56d1d6103c3812a1b3e14a0071e5352` · aktuell `a413267dc15b4651ccf1630920ede5d6c56d1d6103c3812a1b3e14a0071e5352`
- Vorbereitet: 2026-09-17 durch `automated-review` · Evidenzreferenzen: analysis `data/audits/recht-nrw/lrgv/IMPORT_REGRESSION_FAELLE.json`, manifest `data/imports/recht-nrw/manifest/lrgv/term-27514.json`, review-item `term:27514:unknown-structure:05ff1b3a8d`, review-item `term:27514:unknown-structure:0da499b566`, review-item `term:27514:unknown-structure:162f30a07f`, review-item `term:27514:unknown-structure:8108c6d937`, review-item `term:27514:unknown-structure:8a83212aab`, review-item `term:27514:unknown-structure:a5b160c20b`, review-item `term:27514:unknown-structure:a798136bbd`, review-item `term:27514:unknown-structure:b45d9133ab`, review-item `term:27514:unknown-structure:b4afdea7ec`, review-item `term:27514:unknown-structure:b9778f7778`, review-item `term:27514:unknown-structure:cd41acab1e`

**Ausgangslage.** Mit `recht-nrw-parser/1.1.0` als `imported-with-warnings` übernommen; der Reimport mit `recht-nrw-parser/1.2.0` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: active-at-baseline.

**Neuer Befund.** `structure-unnumbered-section`. Sektionen 15–25 des Portals (11 Sektionen ohne Nummernfeld) sind der italienische Vertragstext (Articolo I–XI samt Protocollo finale), der dem deutschen Text (Artikel I–XI mit Schlussprotokoll, alle mit Nummernfeld) folgt. Die gespeicherte Fassung hängt den gesamten italienischen Text als Absätze an Artikel XI an; die deutschen Einheiten Artikel 1–2 und I–XI sind vollständig und korrekt. Kein Textverlust, keine Textänderung.

**Amtliche Evidenz.**

| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fassungsliste des Portals | strong | trägt die Entscheidung | – | – | Portal-Metadaten der Fassungsseite | Fassungsliste mit 1 Fassung(en); lokale Stichtagsauswahl selected | <https://recht.nrw.de/lrgv/gesetz/01012000-gesetz-zu-dem-vertrag-zwischen-dem-land-nordrhein-westfalen-und-dem-heiligen> (–) |
| Portalintervall der gewählten Fassung | strong | trägt die Entscheidung | – | – | Portal-Metadaten der Fassungsseite | Infobox der gewählten Fassung: Gültig ab 2000-01-01 bis offen | <https://recht.nrw.de/lrgv/gesetz/01012000-gesetz-zu-dem-vertrag-zwischen-dem-land-nordrhein-westfalen-und-dem-heiligen> (286ecafc1125c54a…) |
| Textintegrität gespeicherte Fassung ↔ Parser aktuell | n/a | trägt die Entscheidung (Textidentität) | 2026-09-17 | – | Prüfung des Importers | sichtbarer Text der kanonischen Fassung vs. transformierter Dry-run-Output Parser 1.2.0, zeilenweise (Kennzeichen, Titel, Text; ohne Fußnot… | <https://recht.nrw.de/lrgv/gesetz/01012000-gesetz-zu-dem-vertrag-zwischen-dem-land-nordrhein-westfalen-und-dem-heiligen> (a413267dc15b4651…) |

**Textintegrität.** identisch: 22142 ↔ 22142 Zeichen; Verfahren: sichtbarer Text der kanonischen Fassung vs. transformierter Dry-run-Output Parser 1.2.0, zeilenweise (Kennzeichen, Titel, Text; ohne Fußnotenblöcke), SHA-256.

**Legacy-Fragen.**

- Text vollständig? ja · hash-/semantisch identisch? ja
- Was kann Parser 1.2.0 nicht einordnen? Sektion(en) 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25 ohne Nummernfeld – nach Zählung/Querverweis: Articolo I, Articolo II, Articolo III, Articolo IV, Articolo V, Articolo VI, Articolo VII, Articolo VIII, Articolo IX, Articolo X, Articolo XI, Protocollo finale
- Nur Struktur oder möglicherweise Rechtsinhalt? nur Struktur (kein Textverlust, keine Textänderung)
- Amtlicher Source-Hash? `286ecafc1125c54a8e9c946c01d6c68c07e567ac8444501e22c4e8f7250d56bf` · Reviewfall? term:27514:unknown-structure:05ff1b3a8d, term:27514:unknown-structure:0da499b566, term:27514:unknown-structure:162f30a07f, term:27514:unknown-structure:8108c6d937, term:27514:unknown-structure:8a83212aab, term:27514:unknown-structure:a5b160c20b, term:27514:unknown-structure:a798136bbd, term:27514:unknown-structure:b45d9133ab, term:27514:unknown-structure:b4afdea7ec, term:27514:unknown-structure:b9778f7778, term:27514:unknown-structure:cd41acab1e
- Weiter auslieferbar? ja

**Kurzprüfung.** Text vollständig und SHA-256-identisch (22142 Zeichen); Sektion(en) 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25 ohne Nummernfeld (Articolo I, Articolo II, Articolo III, Articolo IV, Articolo V, Articolo VI, Articolo VII, Articolo VIII, Articolo IX, Articolo X, Articolo XI, Protocollo finale), Zuordnung nur strukturell. Endgültige Auflösung braucht eine redaktionelle Entscheidung.

**Begründung der Ausnahme.** Legacy-safe: Text vollständig und mit dem aktuellen Parseroutput identisch (SHA-256); die normative deutsche Fassung ist korrekt strukturiert, nur der gleichrangige italienische Paralleltext steht ohne eigene Artikelkennzeichen am Ende von Artikel XI. Kennzeichen „Articolo I–XI“ werden nicht erfunden. Review-Fall unknown-structure bleibt offen. Folgeschritt: Redaktionelle Entscheidung, ob der italienische Paralleltext als eigener Anlage-Container (z. B. Override unitLabel je Sektion 15–25 oder Container-Override „Testo italiano“) geführt wird; bis dahin Ausnahme. Reimport mit --only term:27514 --offline --write.

**Vorgeschlagene Entscheidung.** `DELIVER-LEGACY BEIBEHALTEN`

**Freigabe.**

- Status: AUSSTEHEND
- Entscheidung Nutzer: –
- Begründung Nutzer: –
- Datum: –

### 16. term:28146 – Verordnung über das Wahlverfahren zur Benennung der Beschäftigten des Eigenbetriebs für die Wahl in den Betriebsausschuss (Wahlordnung für …

- Typ: `deliver-legacy` (Ausnahme `legacy-28146`) · Quellbereich: LRGV · Ziel-Slug: `eig-wo-west`
- Aktueller öffentlicher Status: veröffentlicht: content/norms/west/eig-wo-west (recht-nrw-parser/1.1.0, imported-with-warnings)
- Vorgeschlagene Ausnahme: gespeicherte Fassung weiter ausliefern (deliver-legacy); Risiko **low**
- Parser alt/aktuell: `recht-nrw-parser/1.1.0` → `recht-nrw-parser/1.2.0` · Transformer: `recht-nrw-transformer/2.1.0`
- Quell-URL: <https://recht.nrw.de/lrgv/rechtsverordnung/30082012-verordnung-ueber-das-wahlverfahren-zur-benennung-der-beschaeftigten> · Fundstelle: Fassungsseite RECHT.NRW
- Source-SHA-256: `9aaa1928cf517053b8a8229d3220d80cec37e794247d7d069992a6ccad0025ac`
- Normtext-SHA-256 (sichtbarer Text): Legacy `2a256234d807169f2d09b9f1ea19e2612b79f813a7cff27a74e989811cffc910` · aktuell `2a256234d807169f2d09b9f1ea19e2612b79f813a7cff27a74e989811cffc910`
- Vorbereitet: 2026-09-17 durch `automated-review` · Evidenzreferenzen: analysis `data/audits/recht-nrw/lrgv/IMPORT_REGRESSION_FAELLE.json`, manifest `data/imports/recht-nrw/manifest/lrgv/term-28146.json`, review-item `term:28146:unknown-structure:13ad733553`

**Ausgangslage.** Mit `recht-nrw-parser/1.1.0` als `imported-with-warnings` übernommen; der Reimport mit `recht-nrw-parser/1.2.0` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: active-at-baseline.

**Neuer Befund.** `structure-unnumbered-section`. Sektion 14 des Portals hat kein Nummernfeld; ihre eigene Fußnote lautet „§ 12 a eingefügt durch Artikel 3 der VO vom 13. August 2012“ – die Sektion ist der § 12a (Fristenberechnung, §§ 186–193 BGB). Die gespeicherte Fassung führt den Satz als weiteren Absatz am Ende von § 12 (Anfechtung der Wahl); Einheit § 12a fehlt (13 statt 14 Einheiten). Kein Textverlust, keine Textänderung.

**Amtliche Evidenz.**

| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fassungsliste des Portals | strong | trägt die Entscheidung | – | – | Portal-Metadaten der Fassungsseite | Fassungsliste mit 5 Fassung(en); lokale Stichtagsauswahl selected | <https://recht.nrw.de/lrgv/rechtsverordnung/30082012-verordnung-ueber-das-wahlverfahren-zur-benennung-der-beschaeftigten> (–) |
| Portalintervall der gewählten Fassung | strong | trägt die Entscheidung | – | – | Portal-Metadaten der Fassungsseite | Infobox der gewählten Fassung: Gültig ab 2012-08-30 bis offen | <https://recht.nrw.de/lrgv/rechtsverordnung/30082012-verordnung-ueber-das-wahlverfahren-zur-benennung-der-beschaeftigten> (9aaa1928cf517053…) |
| Textintegrität gespeicherte Fassung ↔ Parser aktuell | n/a | trägt die Entscheidung (Textidentität) | 2026-09-17 | – | Prüfung des Importers | sichtbarer Text der kanonischen Fassung vs. transformierter Dry-run-Output Parser 1.2.0, zeilenweise (Kennzeichen, Titel, Text; ohne Fußnot… | <https://recht.nrw.de/lrgv/rechtsverordnung/30082012-verordnung-ueber-das-wahlverfahren-zur-benennung-der-beschaeftigten> (2a256234d807169f…) |

**Textintegrität.** identisch: 12533 ↔ 12533 Zeichen; Verfahren: sichtbarer Text der kanonischen Fassung vs. transformierter Dry-run-Output Parser 1.2.0, zeilenweise (Kennzeichen, Titel, Text; ohne Fußnotenblöcke), SHA-256. Die gespeicherte Fassung enthält zusätzlich drei Fußnoten des Vorspanns als Fließtextzeilen „Fn 1–3: …“ (Parser 1.1.0, 314 Zeichen); Parser 1.2.0 führt sie als Fußnotenblöcke. Diese Zeilen sind im Vergleich ausgenommen; sie sind zusätzlicher, kein fehlender Text.

**Legacy-Fragen.**

- Text vollständig? ja · hash-/semantisch identisch? ja
- Was kann Parser 1.2.0 nicht einordnen? Sektion(en) 14 ohne Nummernfeld – nach Zählung/Querverweis: § 12a
- Nur Struktur oder möglicherweise Rechtsinhalt? nur Struktur (kein Textverlust, keine Textänderung)
- Amtlicher Source-Hash? `9aaa1928cf517053b8a8229d3220d80cec37e794247d7d069992a6ccad0025ac` · Reviewfall? term:28146:unknown-structure:13ad733553
- Weiter auslieferbar? ja

**Kurzprüfung.** Text vollständig und SHA-256-identisch (12533 Zeichen); Sektion(en) 14 ohne Nummernfeld (§ 12a), Zuordnung nur strukturell. Override des Kennzeichens vorgeschlagen.

**Begründung der Ausnahme.** Legacy-safe: Text vollständig und mit dem aktuellen Parseroutput identisch (SHA-256, ohne die alten Fußnoten-Fließtextzeilen), 13 Einheiten korrekt; ein Satz steht unter § 12 statt unter einem fehlenden § 12a. Kennzeichen wird nicht aus der Fußnote erfunden (fail-closed). Review-Fall unknown-structure bleibt offen. Folgeschritt: Dokumentiertes Override des fehlenden Kennzeichens (Vorschlag: unitLabel { section: 14, label: "§ 12a" }, Beleg: Fußnote der Sektion „§ 12 a eingefügt …“) und Reimport mit --only term:28146 --offline --write; danach Ausnahme entfernen.

**Vorgeschlagene Entscheidung.** `DELIVER-LEGACY BEIBEHALTEN`

**Freigabe.**

- Status: AUSSTEHEND
- Entscheidung Nutzer: –
- Begründung Nutzer: –
- Datum: –

### 17. term:29969 – Verordnung zur Umsetzung des Maßregelvollzugsgesetzes (VO MRVG)

- Typ: `deliver-legacy` (Ausnahme `legacy-29969`) · Quellbereich: LRGV · Ziel-Slug: `vo-mrvg-west`
- Aktueller öffentlicher Status: veröffentlicht: content/norms/west/vo-mrvg-west (recht-nrw-parser/1.1.0, imported-with-warnings)
- Vorgeschlagene Ausnahme: gespeicherte Fassung weiter ausliefern (deliver-legacy); Risiko **low**
- Parser alt/aktuell: `recht-nrw-parser/1.1.0` → `recht-nrw-parser/1.2.0` · Transformer: `recht-nrw-transformer/2.1.0`
- Quell-URL: <https://recht.nrw.de/lrgv/rechtsverordnung/01012021-verordnung-zur-umsetzung-des-massregelvollzugsgesetzes-vo-mrvg> · Fundstelle: Fassungsseite RECHT.NRW
- Source-SHA-256: `32e8c1ac987d5482a5453f7045b0251d106362059e8a70b51bfab27ea5ba967a`
- Normtext-SHA-256 (sichtbarer Text): Legacy `9d33f834267bfeb4bad3074763f98e8f0dee59026419662c349b389e50e7f4c7` · aktuell `9d33f834267bfeb4bad3074763f98e8f0dee59026419662c349b389e50e7f4c7`
- Vorbereitet: 2026-09-17 durch `automated-review` · Evidenzreferenzen: analysis `data/audits/recht-nrw/lrgv/IMPORT_REGRESSION_FAELLE.json`, manifest `data/imports/recht-nrw/manifest/lrgv/term-29969.json`, review-item `term:29969:unknown-structure:635b5b73de`

**Ausgangslage.** Mit `recht-nrw-parser/1.1.0` als `imported-with-warnings` übernommen; der Reimport mit `recht-nrw-parser/1.2.0` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: active-at-baseline.

**Neuer Befund.** `structure-unnumbered-section`. Sektion 2 des Portals hat kein Nummernfeld; sie folgt dem Vorspann (Ausfertigung, Ermächtigung, Gliederung „Teil 1 Regelung von Zuständigkeiten“) und geht dem § 2 (Aufsicht) voraus – nach Zählung der § 1 (Zuständigkeit des Gesundheitsministeriums für Auswahl Dritter, Standards, Standortentscheidungen). Die gespeicherte Fassung führt den Satz als Absatz unter der Gliederung Teil 1 vor § 2; Einheit § 1 fehlt (16 statt 17 Einheiten). Kein Textverlust, keine Textänderung.

**Amtliche Evidenz.**

| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fassungsliste des Portals | strong | trägt die Entscheidung | – | – | Portal-Metadaten der Fassungsseite | Fassungsliste mit 2 Fassung(en); lokale Stichtagsauswahl selected | <https://recht.nrw.de/lrgv/rechtsverordnung/01012021-verordnung-zur-umsetzung-des-massregelvollzugsgesetzes-vo-mrvg> (–) |
| Portalintervall der gewählten Fassung | strong | trägt die Entscheidung | – | – | Portal-Metadaten der Fassungsseite | Infobox der gewählten Fassung: Gültig ab 2021-01-01 bis offen | <https://recht.nrw.de/lrgv/rechtsverordnung/01012021-verordnung-zur-umsetzung-des-massregelvollzugsgesetzes-vo-mrvg> (32e8c1ac987d5482…) |
| Textintegrität gespeicherte Fassung ↔ Parser aktuell | n/a | trägt die Entscheidung (Textidentität) | 2026-09-17 | – | Prüfung des Importers | sichtbarer Text der kanonischen Fassung vs. transformierter Dry-run-Output Parser 1.2.0, zeilenweise (Kennzeichen, Titel, Text; ohne Fußnot… | <https://recht.nrw.de/lrgv/rechtsverordnung/01012021-verordnung-zur-umsetzung-des-massregelvollzugsgesetzes-vo-mrvg> (9d33f834267bfeb4…) |

**Textintegrität.** identisch: 13305 ↔ 13305 Zeichen; Verfahren: sichtbarer Text der kanonischen Fassung vs. transformierter Dry-run-Output Parser 1.2.0, zeilenweise (Kennzeichen, Titel, Text; ohne Fußnotenblöcke), SHA-256.

**Legacy-Fragen.**

- Text vollständig? ja · hash-/semantisch identisch? ja
- Was kann Parser 1.2.0 nicht einordnen? Sektion(en) 2 ohne Nummernfeld – nach Zählung/Querverweis: § 1
- Nur Struktur oder möglicherweise Rechtsinhalt? nur Struktur (kein Textverlust, keine Textänderung)
- Amtlicher Source-Hash? `32e8c1ac987d5482a5453f7045b0251d106362059e8a70b51bfab27ea5ba967a` · Reviewfall? term:29969:unknown-structure:635b5b73de
- Weiter auslieferbar? ja

**Kurzprüfung.** Text vollständig und SHA-256-identisch (13305 Zeichen); Sektion(en) 2 ohne Nummernfeld (§ 1), Zuordnung nur strukturell. Override des Kennzeichens vorgeschlagen.

**Begründung der Ausnahme.** Legacy-safe: Text vollständig und mit dem aktuellen Parseroutput identisch (SHA-256), 16 Einheiten korrekt; ein Satz steht als Absatz unter Teil 1 statt unter einem fehlenden § 1 – keiner anderen Einheit zugeschlagen. Kennzeichen wird nicht erfunden. Review-Fall unknown-structure bleibt offen. Folgeschritt: Dokumentiertes Override des fehlenden Kennzeichens (Vorschlag: unitLabel { section: 2, label: "§ 1" }, Beleg Zählungsbeginn bei § 2) und Reimport mit --only term:29969 --offline --write; danach Ausnahme entfernen.

**Vorgeschlagene Entscheidung.** `DELIVER-LEGACY BEIBEHALTEN`

**Freigabe.**

- Status: AUSSTEHEND
- Entscheidung Nutzer: –
- Begründung Nutzer: –
- Datum: –

## Menschliche Entscheidung erforderlich (widersprüchliche oder unvollständige Evidenz)

### 18. term:31390 – Richtlinie über die Gewährung von Zuwendungen zu Fortbildungsmaßnahmen für pädagogische Kräfte des Elementarbereiches des Landes Nordrhein-…

- Typ: `depublish` (Ausnahme `legacy-31390`) · Quellbereich: LRMB · Ziel-Slug: `richtlinie-ueber-die-gewaehrung-von-zuwendungen-zu-west`
- Aktueller öffentlicher Status: depubliziert: Manifest needs-review (recht-nrw-lrmb-parser/1.3.0), Lauf recht-nrw-2023-12-01-lrmb-20260917T055943Z; kein Ziel-Slug
- Vorgeschlagene Ausnahme: kontrollierte Depublikation (depublish); Risiko **high**
- Parser alt/aktuell: `recht-nrw-lrmb-parser/1.2.0` → `recht-nrw-lrmb-parser/1.3.0` · Transformer: `recht-nrw-transformer/2.1.0`
- Quell-URL: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/21072015-richtlinie-ueber-die-gewaehrung-von-zuwendungen-zu> · Fundstelle: Fassungsseite RECHT.NRW
- Source-SHA-256: `00c429ae83286643cd0b9f37820e1299ce61c668be8a31a36cd759ff67cd2788`
- Normtext-SHA-256 (Fassungsseite, Bytes): Legacy `00c429ae83286643cd0b9f37820e1299ce61c668be8a31a36cd759ff67cd2788` · aktuell `00c429ae83286643cd0b9f37820e1299ce61c668be8a31a36cd759ff67cd2788`
- Vorbereitet: 2026-09-17 durch `automated-review` · Evidenzreferenzen: evidence-pass `data/audits/recht-nrw/lrmb/EVIDENCE_PASS.json`, run-report `data/audits/recht-nrw/runs/recht-nrw-2023-12-01-lrmb-20260917T055943Z.json`, manifest `data/imports/recht-nrw/manifest/lrmb/term-31390.json`, review-item `term:31390:metadata-conflict:ad5f87fec0`

**Ausgangslage.** Mit `recht-nrw-lrmb-parser/1.2.0` als `imported-with-warnings` übernommen; der Reimport mit `recht-nrw-lrmb-parser/1.3.0` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: undetermined.

**Neuer Befund.** `validity-expiry-contradicted` – validity-expiry-contradicted: Außerkrafttreten laut Text (2019-12-31, „am 31. Dezember 2019“) widerspricht anderen Belegen: Fundstellenverlauf nennt eine Änderung vom 2021-12-13 nach dem Ende. Keine strukturelle Abweichung. Der Bewerter 1.3.0 ergibt needs-review (validity-expiry-contradicted): widersprüchliche Geltungsevidenz.

**Amtliche Evidenz.**

| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Suchindex-Signal | insufficient | trägt nicht allein | – | – | Suchindex des Portals (nur Hinweis) | Suchindex (nur Hinweis): historisch true, Gültig ab 2015-07-21, Außerkrafttreten 2019-12-31 | – (–) |
| Eigene Außerkrafttretensformel | contradictory | trägt die Entscheidung (Widerspruch) | 2019-12-31 | – | eigener Text der Fassungsseite (richtlinie) | Diese Förderrichtlinie tritt am Tag nach der Veröffentlichung in Kraft und am 31. Dezember 2019 außer Kraft. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/21072015-richtlinie-ueber-die-gewaehrung-von-zuwendungen-zu> (00c429ae83286643…) |
| Quellhash der Fassungsseite (Manifest-Rohdokument) | n/a | ergänzend (Quelle unverändert) | 2026-09-17 | – | Prüfung des Importers | Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence… | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/21072015-richtlinie-ueber-die-gewaehrung-von-zuwendungen-zu> (00c429ae83286643…) |

**Textintegrität.** identisch: 44665 ↔ 44665 Zeichen; Verfahren: Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence Pass Parser 1.3.0), nicht wegen einer Textabweichung. Werte sind Bytes der Fassungsseite, kein Normtextvergleich

**Depublikations-Fragen.**

- Welcher neue Beleg? Eigene Außerkrafttretensformel: Diese Förderrichtlinie tritt am Tag nach der Veröffentlichung in Kraft und am 31. Dezember 2019 außer Kraft.
- Klasse: contradictory · amtliche Quelle: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/21072015-richtlinie-ueber-die-gewaehrung-von-zuwendungen-zu>
- Stammnorm eindeutig? ja · relevantes Datum: 2019-12-31 · vor Stichtag 2023-12-01? ja
- Zwingend? nein · Unsicherheit: Außerkrafttreten laut Text (2019-12-31, „am 31. Dezember 2019“) widerspricht anderen Belegen: Fundstellenverlauf nennt eine Änderung vom 2021-12-13 nach dem Ende

**Kurzprüfung.** Widersprüchliche Geltungsevidenz: Außerkrafttreten laut Text (2019-12-31, „am 31. Dezember 2019“) widerspricht anderen Belegen: Fundstellenverlauf nennt eine Änderung vom 2021-12-13 nach dem Ende. Kein Beleg trägt allein – Entscheidung des Nutzers nötig.

**Begründung der Ausnahme.** Im Zweifel Review statt unbelegter Übernahme: widersprüchliche Geltungsevidenz – die mit Parser 1.2.0 übernommene Fassung wird nicht weiter ausgeliefert, sondern kontrolliert depubliziert; Manifest trägt den aktuellen Befund (needs-review). Folgeschritt: Geltungsbeleg redaktionell prüfen (Review-Fall metadata-conflict/historical-gap); bei Bestätigung der Stichtagsgeltung Override und Reimport mit --only term:31390 --offline --write.

**Vorgeschlagene Entscheidung.** `MENSCHLICHE ENTSCHEIDUNG ERFORDERLICH`

**Freigabe.**

- Status: AUSSTEHEND
- Entscheidung Nutzer: –
- Begründung Nutzer: –
- Datum: –

### 19. term:31791 – Richtlinien über die Gewährung von Zuwendungen zur Schaffung, Erhaltung, Wiederherstellung und Verbesserung von Grüner Infrastruktur einsch…

- Typ: `depublish` (Ausnahme `legacy-31791`) · Quellbereich: LRMB · Ziel-Slug: `richtlinien-ueber-die-gewaehrung-von-zuwendungen-zur-schaffung-erhaltung-west`
- Aktueller öffentlicher Status: depubliziert: Manifest needs-review (recht-nrw-lrmb-parser/1.3.0), Lauf recht-nrw-2023-12-01-lrmb-20260917T055943Z; kein Ziel-Slug
- Vorgeschlagene Ausnahme: kontrollierte Depublikation (depublish); Risiko **high**
- Parser alt/aktuell: `recht-nrw-lrmb-parser/1.2.0` → `recht-nrw-lrmb-parser/1.3.0` · Transformer: `recht-nrw-transformer/2.1.0`
- Quell-URL: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/14032017-richtlinien-ueber-die-gewaehrung-von-zuwendungen-zur-schaffung> · Fundstelle: MBl. NRW. S. 115
- Source-SHA-256: `5bd1aa39da324732b20b65a5698680deca4bd8406bd9bd2f3659fa8001175021`
- Normtext-SHA-256 (Fassungsseite, Bytes): Legacy `5bd1aa39da324732b20b65a5698680deca4bd8406bd9bd2f3659fa8001175021` · aktuell `5bd1aa39da324732b20b65a5698680deca4bd8406bd9bd2f3659fa8001175021`
- Vorbereitet: 2026-09-17 durch `automated-review` · Evidenzreferenzen: evidence-pass `data/audits/recht-nrw/lrmb/EVIDENCE_PASS.json`, run-report `data/audits/recht-nrw/runs/recht-nrw-2023-12-01-lrmb-20260917T055943Z.json`, manifest `data/imports/recht-nrw/manifest/lrmb/term-31791.json`, review-item `term:31791:metadata-conflict:425ee55f25`

**Ausgangslage.** Mit `recht-nrw-lrmb-parser/1.2.0` als `imported-with-warnings` übernommen; der Reimport mit `recht-nrw-lrmb-parser/1.3.0` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: undetermined.

**Neuer Befund.** `validity-successor-contradicted` – validity-successor-contradicted: Aufhebung/Ablösung durch Richtlinien über die Gewährung von Zuwendung zur Schaffung, Erhaltung, Wiederherstellung und Verbess (wirksam 2023-07-28) widerspricht anderen Belegen: Portalintervall der ge…. Keine strukturelle Abweichung. Der Bewerter 1.3.0 ergibt needs-review (validity-successor-contradicted): Aufhebung/Ablösung durch Richtlinien über die Gewährung von Zuwendung zur Schaffung, Erhaltung, Wiederherstellung und Verbess (wirksam 2023-07-28) widerspricht anderen Belegen: Portalintervall der gew.

**Amtliche Evidenz.**

| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Suchindex-Signal | insufficient | trägt nicht allein | – | – | Suchindex des Portals (nur Hinweis) | Suchindex (nur Hinweis): historisch true, Gültig ab 2017-03-14, Außerkrafttreten 2023-12-31 | – (–) |
| Eigene Inkrafttretensformel | supporting | ergänzend | – | – | eigener Text der Fassungsseite (richtlinie) | Dieser Runderlass tritt am Tag nach der Veröffentlichung in Kraft. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/14032017-richtlinien-ueber-die-gewaehrung-von-zuwendungen-zur-schaffung> (5bd1aa39da324732…) |
| Eigene Außerkrafttretensformel | strong | trägt die Entscheidung | 2023-12-31 | – | eigener Text der Fassungsseite (richtlinie) | Er tritt mit Ablauf des 31. Dezember 2023 außer Kraft. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/14032017-richtlinien-ueber-die-gewaehrung-von-zuwendungen-zur-schaffung> (5bd1aa39da324732…) |
| Aufhebung durch Richtlinien über die Gewährung von Zuwendung zur Schaffung, Erhaltung, Wiederherstellung und Verbesserung von… (term:33827) | contradictory | trägt die Entscheidung (Widerspruch) | 2023-07-28 | MBl. NRW. S. 115 | Nachfolgevorschrift (amtliche LRMB-Fassungsseite) | Gleichzeitig treten die Richtlinien Grüne Infrastruktur vom 13. Februar 2017 (MBl. NRW. S. 115) außer Kraft. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/28072023-richtlinien-ueber-die-gewaehrung-von-zuwendung-zur-schaffung> (912bb257e46ec579…) |
| Quellhash der Fassungsseite (Manifest-Rohdokument) | n/a | ergänzend (Quelle unverändert) | 2026-09-17 | – | Prüfung des Importers | Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence… | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/14032017-richtlinien-ueber-die-gewaehrung-von-zuwendungen-zur-schaffung> (5bd1aa39da324732…) |

**Textintegrität.** identisch: 44603 ↔ 44603 Zeichen; Verfahren: Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence Pass Parser 1.3.0), nicht wegen einer Textabweichung. Werte sind Bytes der Fassungsseite, kein Normtextvergleich

**Depublikations-Fragen.**

- Welcher neue Beleg? Aufhebung durch Richtlinien über die Gewährung von Zuwendung zur Schaffung, Erhaltung, Wiederherstellung und Verbesserung von… (term:33827): Gleichzeitig treten die Richtlinien Grüne Infrastruktur vom 13. Februar 2017 (MBl. NRW. S. 115) außer Kraft.
- Klasse: strong, contradictory · amtliche Quelle: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/28072023-richtlinien-ueber-die-gewaehrung-von-zuwendung-zur-schaffung>
- Stammnorm eindeutig? ja · relevantes Datum: 2023-07-28 · vor Stichtag 2023-12-01? ja
- Zwingend? nein · Unsicherheit: Aufhebung/Ablösung durch Richtlinien über die Gewährung von Zuwendung zur Schaffung, Erhaltung, Wiederherstellung und Verbess (wirksam 2023-07-28) widerspricht anderen Belegen: Portalintervall der ge…

**Kurzprüfung.** Widersprüchliche Geltungsevidenz: Aufhebung/Ablösung durch Richtlinien über die Gewährung von Zuwendung zur Schaffung, Erhaltung, Wiederherstellung und Verbess (wirksam 2023-07-28) widerspricht anderen Belegen: Po… Kein Beleg trägt allein – Entscheidung des Nutzers nötig.

**Begründung der Ausnahme.** Im Zweifel Review statt unbelegter Übernahme: widersprüchliche Geltungsevidenz – die mit Parser 1.2.0 übernommene Fassung wird nicht weiter ausgeliefert, sondern kontrolliert depubliziert; Manifest trägt den aktuellen Befund (needs-review). Folgeschritt: Geltungsbeleg redaktionell prüfen (Review-Fall metadata-conflict/historical-gap); bei Bestätigung der Stichtagsgeltung Override und Reimport mit --only term:31791 --offline --write.

**Vorgeschlagene Entscheidung.** `MENSCHLICHE ENTSCHEIDUNG ERFORDERLICH`

**Freigabe.**

- Status: AUSSTEHEND
- Entscheidung Nutzer: –
- Begründung Nutzer: –
- Datum: –

### 20. term:32422 – Richtlinien zur Förderung der vernetzten Mobilität und des Mobilitätsmanagements (FöRi-MM) Runderlass des Ministeriums für Verkehr – IV B 3

- Typ: `depublish` (Ausnahme `legacy-32422`) · Quellbereich: LRMB · Ziel-Slug: `foeri-mm-west-32422`
- Aktueller öffentlicher Status: depubliziert: Manifest needs-review (recht-nrw-lrmb-parser/1.3.0), Lauf recht-nrw-2023-12-01-lrmb-20260917T055943Z; kein Ziel-Slug
- Vorgeschlagene Ausnahme: kontrollierte Depublikation (depublish); Risiko **high**
- Parser alt/aktuell: `recht-nrw-lrmb-parser/1.2.0` → `recht-nrw-lrmb-parser/1.3.0` · Transformer: `recht-nrw-transformer/2.1.0`
- Quell-URL: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01062019-richtlinien-zur-foerderung-der-vernetzten-mobilitaet-und-des> · Fundstelle: MBl. NRW. S. 198
- Source-SHA-256: `e6ebfbed70a09e261893f14ac845338635968121f68c358c8975f0fda89a98bd`
- Normtext-SHA-256 (Fassungsseite, Bytes): Legacy `e6ebfbed70a09e261893f14ac845338635968121f68c358c8975f0fda89a98bd` · aktuell `e6ebfbed70a09e261893f14ac845338635968121f68c358c8975f0fda89a98bd`
- Vorbereitet: 2026-09-17 durch `automated-review` · Evidenzreferenzen: evidence-pass `data/audits/recht-nrw/lrmb/EVIDENCE_PASS.json`, run-report `data/audits/recht-nrw/runs/recht-nrw-2023-12-01-lrmb-20260917T055943Z.json`, manifest `data/imports/recht-nrw/manifest/lrmb/term-32422.json`, review-item `term:32422:metadata-conflict:00026c76f7`

**Ausgangslage.** Mit `recht-nrw-lrmb-parser/1.2.0` als `imported-with-warnings` übernommen; der Reimport mit `recht-nrw-lrmb-parser/1.3.0` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: undetermined.

**Neuer Befund.** `validity-successor-contradicted` – validity-successor-contradicted: Aufhebung/Ablösung durch Richtlinien zur Förderung der Vernetzten Mobilität und des Mobilitätsmanagements (Förderrichtlinie M (wirksam 2022-07-01) widerspricht anderen Belegen: Portalintervall der ge…. Keine strukturelle Abweichung. Der Bewerter 1.3.0 ergibt needs-review (validity-successor-contradicted): Aufhebung/Ablösung durch Richtlinien zur Förderung der Vernetzten Mobilität und des Mobilitätsmanagements (Förderrichtlinie M (wirksam 2022-07-01) widerspricht anderen Belegen: Portalintervall der gew.

**Amtliche Evidenz.**

| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Suchindex-Signal | insufficient | trägt nicht allein | – | – | Suchindex des Portals (nur Hinweis) | Suchindex (nur Hinweis): historisch true, Gültig ab 2019-06-01, Außerkrafttreten 2023-12-31 | – (–) |
| Eigene Inkrafttretensformel | strong | trägt die Entscheidung | 2019-06-01 | – | eigener Text der Fassungsseite (richtlinie) | Dieser Runderlass tritt am 1. Juni 2019 in Kraft und am 31. Dezember 2023 außer Kraft. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01062019-richtlinien-zur-foerderung-der-vernetzten-mobilitaet-und-des> (e6ebfbed70a09e26…) |
| Eigene Außerkrafttretensformel | strong | trägt die Entscheidung | 2023-12-31 | – | eigener Text der Fassungsseite (richtlinie) | Dieser Runderlass tritt am 1. Juni 2019 in Kraft und am 31. Dezember 2023 außer Kraft. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01062019-richtlinien-zur-foerderung-der-vernetzten-mobilitaet-und-des> (e6ebfbed70a09e26…) |
| Aufhebung durch Richtlinien zur Förderung der Vernetzten Mobilität und des Mobilitätsmanagements (Förderrichtlinie Mobilitäts… (term:33558) | contradictory | trägt die Entscheidung (Widerspruch) | 2022-07-01 | MBl. NRW. S. 198 | Nachfolgevorschrift (amtliche LRMB-Fassungsseite) | Gleichzeitig mit Inkrafttreten dieses Runderlasses treten die Richtlinien zur Förderung der Vernetzten Mobilität und des Mobilitätsmanageme… | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01072022-richtlinien-zur-foerderung-der-vernetzten-mobilitaet-und-des> (d6ab6f72a60395e8…) |
| Quellhash der Fassungsseite (Manifest-Rohdokument) | n/a | ergänzend (Quelle unverändert) | 2026-09-17 | – | Prüfung des Importers | Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence… | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01062019-richtlinien-zur-foerderung-der-vernetzten-mobilitaet-und-des> (e6ebfbed70a09e26…) |

**Textintegrität.** identisch: 69515 ↔ 69515 Zeichen; Verfahren: Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence Pass Parser 1.3.0), nicht wegen einer Textabweichung. Werte sind Bytes der Fassungsseite, kein Normtextvergleich

**Depublikations-Fragen.**

- Welcher neue Beleg? Aufhebung durch Richtlinien zur Förderung der Vernetzten Mobilität und des Mobilitätsmanagements (Förderrichtlinie Mobilitäts… (term:33558): Gleichzeitig mit Inkrafttreten dieses Runderlasses treten die Richtlinien zur Förderung der Vernetzten Mobilität und de…
- Klasse: strong, contradictory · amtliche Quelle: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01072022-richtlinien-zur-foerderung-der-vernetzten-mobilitaet-und-des>
- Stammnorm eindeutig? ja · relevantes Datum: 2022-07-01 · vor Stichtag 2023-12-01? ja
- Zwingend? nein · Unsicherheit: Aufhebung/Ablösung durch Richtlinien zur Förderung der Vernetzten Mobilität und des Mobilitätsmanagements (Förderrichtlinie M (wirksam 2022-07-01) widerspricht anderen Belegen: Portalintervall der ge…

**Kurzprüfung.** Widersprüchliche Geltungsevidenz: Aufhebung/Ablösung durch Richtlinien zur Förderung der Vernetzten Mobilität und des Mobilitätsmanagements (Förderrichtlinie M (wirksam 2022-07-01) widerspricht anderen Belegen: Po… Kein Beleg trägt allein – Entscheidung des Nutzers nötig.

**Begründung der Ausnahme.** Im Zweifel Review statt unbelegter Übernahme: widersprüchliche Geltungsevidenz – die mit Parser 1.2.0 übernommene Fassung wird nicht weiter ausgeliefert, sondern kontrolliert depubliziert; Manifest trägt den aktuellen Befund (needs-review). Folgeschritt: Geltungsbeleg redaktionell prüfen (Review-Fall metadata-conflict/historical-gap); bei Bestätigung der Stichtagsgeltung Override und Reimport mit --only term:32422 --offline --write.

**Vorgeschlagene Entscheidung.** `MENSCHLICHE ENTSCHEIDUNG ERFORDERLICH`

**Freigabe.**

- Status: AUSSTEHEND
- Entscheidung Nutzer: –
- Begründung Nutzer: –
- Datum: –

### 21. term:33461 – Richtlinie über die Gewährung von Zuwendungen für Maßnahmen gemäß § 96 des Bundesvertriebenengesetzes durch das Land Nordrhein-Westfalen

- Typ: `depublish` (Ausnahme `legacy-33461`) · Quellbereich: LRMB · Ziel-Slug: `richtlinie-ueber-die-gewaehrung-von-zuwendungen-fuer-massnahmen-gemaess-west`
- Aktueller öffentlicher Status: depubliziert: Manifest needs-review (recht-nrw-lrmb-parser/1.3.0), Lauf recht-nrw-2023-12-01-lrmb-20260917T055943Z; kein Ziel-Slug
- Vorgeschlagene Ausnahme: kontrollierte Depublikation (depublish); Risiko **high**
- Parser alt/aktuell: `recht-nrw-lrmb-parser/1.2.0` → `recht-nrw-lrmb-parser/1.3.0` · Transformer: `recht-nrw-transformer/2.1.0`
- Quell-URL: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01042022-richtlinie-ueber-die-gewaehrung-von-zuwendungen-fuer-massnahmen> · Fundstelle: Fassungsseite RECHT.NRW
- Source-SHA-256: `e25bc3facb61d8ceca7bb1d31e290f3fc0dd8bcde0f264e5420191608fffc021`
- Normtext-SHA-256 (Fassungsseite, Bytes): Legacy `e25bc3facb61d8ceca7bb1d31e290f3fc0dd8bcde0f264e5420191608fffc021` · aktuell `e25bc3facb61d8ceca7bb1d31e290f3fc0dd8bcde0f264e5420191608fffc021`
- Vorbereitet: 2026-09-17 durch `automated-review` · Evidenzreferenzen: evidence-pass `data/audits/recht-nrw/lrmb/EVIDENCE_PASS.json`, run-report `data/audits/recht-nrw/runs/recht-nrw-2023-12-01-lrmb-20260917T055943Z.json`, manifest `data/imports/recht-nrw/manifest/lrmb/term-33461.json`, review-item `term:33461:metadata-conflict:55ae22abf4`

**Ausgangslage.** Mit `recht-nrw-lrmb-parser/1.2.0` als `imported-with-warnings` übernommen; der Reimport mit `recht-nrw-lrmb-parser/1.3.0` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: undetermined.

**Neuer Befund.** `validity-expiry-ambiguous` – validity-expiry-ambiguous: Mehrere eigene Außerkrafttretensformeln mit verschiedenen Daten (2027-03-31, 2022-03-31) – kein Ende bestimmbar. Keine strukturelle Abweichung. Der Bewerter 1.3.0 ergibt needs-review (validity-expiry-ambiguous): widersprüchliche Geltungsevidenz.

**Amtliche Evidenz.**

| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Suchindex-Signal | insufficient | trägt nicht allein | – | – | Suchindex des Portals (nur Hinweis) | Suchindex (nur Hinweis): historisch –, Gültig ab 2022-04-01, Außerkrafttreten 2027-03-31 | – (–) |
| Eigene Außerkrafttretensformel | contradictory | trägt die Entscheidung (Widerspruch) | 2027-03-31 | – | eigener Text der Fassungsseite (richtlinie) | Dieser Runderlass tritt am 1. April 2022 in Kraft und am 31. März 2027 außer Kraft. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01042022-richtlinie-ueber-die-gewaehrung-von-zuwendungen-fuer-massnahmen> (e25bc3facb61d8ce…) |
| Eigene Außerkrafttretensformel | contradictory | trägt die Entscheidung (Widerspruch) | 2022-03-31 | – | eigener Text der Fassungsseite (richtlinie) | 8.1. Diese Richtlinie tritt mit Wirkung vom 1. April 2017 in Kraft und am 31. März 2022 außer Kraft. | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01042022-richtlinie-ueber-die-gewaehrung-von-zuwendungen-fuer-massnahmen> (e25bc3facb61d8ce…) |
| Quellhash der Fassungsseite (Manifest-Rohdokument) | n/a | ergänzend (Quelle unverändert) | 2026-09-17 | – | Prüfung des Importers | Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence… | <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01042022-richtlinie-ueber-die-gewaehrung-von-zuwendungen-fuer-massnahmen> (e25bc3facb61d8ce…) |

**Textintegrität.** identisch: 43304 ↔ 43304 Zeichen; Verfahren: Kein Textvergleich: Quellhash der Fassungsseite (Manifest-Rohdokument) unverändert; die Depublikation erfolgt aus Geltungsgründen (Evidence Pass Parser 1.3.0), nicht wegen einer Textabweichung. Werte sind Bytes der Fassungsseite, kein Normtextvergleich

**Depublikations-Fragen.**

- Welcher neue Beleg? Eigene Außerkrafttretensformel: Dieser Runderlass tritt am 1. April 2022 in Kraft und am 31. März 2027 außer Kraft.
- Klasse: contradictory · amtliche Quelle: <https://recht.nrw.de/lrmb/verwaltungsvorschrift/01042022-richtlinie-ueber-die-gewaehrung-von-zuwendungen-fuer-massnahmen>
- Stammnorm eindeutig? ja · relevantes Datum: 2027-03-31 · vor Stichtag 2023-12-01? nein
- Zwingend? nein · Unsicherheit: Mehrere eigene Außerkrafttretensformeln mit verschiedenen Daten (2027-03-31, 2022-03-31) – kein Ende bestimmbar

**Kurzprüfung.** Widersprüchliche Geltungsevidenz: Mehrere eigene Außerkrafttretensformeln mit verschiedenen Daten (2027-03-31, 2022-03-31) – kein Ende bestimmbar. Kein Beleg trägt allein – Entscheidung des Nutzers nötig.

**Begründung der Ausnahme.** Im Zweifel Review statt unbelegter Übernahme: widersprüchliche Geltungsevidenz – die mit Parser 1.2.0 übernommene Fassung wird nicht weiter ausgeliefert, sondern kontrolliert depubliziert; Manifest trägt den aktuellen Befund (needs-review). Folgeschritt: Geltungsbeleg redaktionell prüfen (Review-Fall metadata-conflict/historical-gap); bei Bestätigung der Stichtagsgeltung Override und Reimport mit --only term:33461 --offline --write.

**Vorgeschlagene Entscheidung.** `MENSCHLICHE ENTSCHEIDUNG ERFORDERLICH`

**Freigabe.**

- Status: AUSSTEHEND
- Entscheidung Nutzer: –
- Begründung Nutzer: –
- Datum: –

