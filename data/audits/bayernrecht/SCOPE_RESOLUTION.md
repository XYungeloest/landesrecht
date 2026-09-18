# Auflösung der elf ungeklärten Dokumente

**Stand 2026-09-18.** Die Abdeckungslücke der Enumeration umfasst 102 Dokumente, die nur die
Portalfacette führt und nicht der Fortführungsnachweis. 91 davon waren gruppenweise erklärt, elf
blieben offen. Sie sind jetzt **einzeln geprüft**: Paket geladen, XML gelesen, Verkündungsorgan,
Erlassbehörde und Regelungsinhalt festgestellt.

Die Befunde stehen maschinenlesbar in `data/imports/bayernrecht/scope-overrides.json` und gehen dort
jeder Gruppenzuordnung vor – eine Gruppenzuordnung leitet aus dem Fehlen im Register ab, ein
Einzelbefund stellt am Dokument fest.

## Ein verworfener Erklärungsversuch

Die naheliegende Vermutung war, die elf ließen sich daran erkennen, dass ihre BayRS-Gliederungsnummer
im Fortführungsnachweis fehlt. **Die Vermutung ist falsch, und der Test dazu war wertlos.** Eine
Kontrolle an Dokumenten, die der Fortführungsnachweis nachweislich führt, fand deren
Gliederungsnummern dort ebenso wenig: 0 von 4. Der Nachweis stellt die Nummer offenbar anders dar,
als eine Textsuche sie findet.

Das ist hier festgehalten, weil die Zwischenergebnisse dieses Tests plausibel aussahen – „BayRS im
ffn: nein“ für alle elf – und eine Einordnung getragen hätten, die auf nichts beruht.

Die Einordnung unten stützt sich deshalb **nicht** auf die Registerlücke, sondern auf das Dokument:
Verkündungsorgan, Erlassbehörde, Rechtsform, Regelungsgehalt.

## Die elf Fälle

| Dokument | Was es ist | Verkündet | Entscheidung | Grund |
| --- | --- | --- | --- | --- |
| `BayBodSchO` | Bodensee-Schifffahrts-Ordnung (BSO) | GVBl. 1976 S. 55 | **exclude** (als Anhang übernommen) | `annex-merged-into-related-norm` → `BayEVBodenseeSchO` |
| `BayVV_237_B_10540` | Richtlinien Sonderförderprogramm Schwimmbadsanierung | BayMBl. 2019 | include | `published-without-register-entry` |
| `BayVV_282_1_1_1_2_UK_031` | Stiftung „Bildungspakt Bayern“ – Zweck und Förderverfahren | KWMBl. 2001 S. 224 | include | `published-without-register-entry` |
| `BayVV_631_B_15643` | Richtlinien für die Durchführung von Hochbauaufgaben (RLBau) | BayMBl. 2026 | include | `published-without-register-entry` |
| `BayVV_2038_3_13_B_10514` | Konzept modulare Qualifizierung, Fachlaufbahn Naturwissenschaft und Technik | BayMBl. 2019 | include | `published-without-register-entry` |
| `BayVV_2210_2_1_6_5_1_K_721` | Unfallversicherung August-Lenz-Stiftung / Herzogliches Georgianum | KWMBl. 1962 | include | `published-without-register-entry` |
| `BayVV_2230_1_1_1_K_941` | Archivierungsvereinbarung mit der Generaldirektion der Staatlichen Archive | KWMBl. 2016 | include | `published-without-register-entry` |
| `BayVV_2230_7_1_K_10450` | Durchführung der Härteregelung nach Art. 34a Abs. 2 BaySchFG | BayMBl. 2019 | include | `published-without-register-entry` |
| `BayVV_2230_7_1_K_10559` | Budgetierung des Schulaufwands an privaten Förderschulen | BayMBl. 2019 | include | `published-without-register-entry` |
| `BayVV_2242_1_2_WK_14938` | Entschädigungsfonds nach dem Denkmalschutzgesetz | BayMBl. 2024 | include | `published-without-register-entry` |
| `BayVV_3033_3_J_15366` | Justizverwaltungsaktenordnung (AktO-JV) | BayMBl. 2025 Nr. 525 | include | `published-without-register-entry` |

## Die zehn Verwaltungsvorschriften

Alle zehn sind amtlich verkündete Vorschriften des Freistaats: Bekanntmachungen und Gemeinsame
Bekanntmachungen bayerischer Staatsministerien im BayMBl. oder – vor dessen Einführung 2019 – im
KWMBl. Damit sind sie Landesrecht im Sinne von `docs/LEGAL_SCOPE.md`; die Registerlücke ändert daran
nichts.

**Sie tragen jedoch alle das Merkmal `registerAbsent`, und das ist kein Formalismus.** Der
Fortführungsnachweis verzeichnet die *geltenden* Verwaltungsvorschriften. Fehlt eine dort, ist das
ein Hinweis darauf, dass sie nicht mehr gilt – ein Hinweis auf die **Geltung**, nicht auf den Umfang.
Die Stichtagsprüfung muss das je Vorschrift auflösen; der Scope tut es nicht und darf es nicht tun.

Ein Fall ist schon jetzt entschieden: `BayVV_3033_3_J_15366` wurde am **20.11.2025 ausgefertigt** und
gilt ab 2026-01-01 – beides nach dem Stichtag. Sie wird als `not-at-baseline` geführt.

## Der eine Prüffall – entschieden (2026-09-18)

`BayBodSchO` erklärt sich in einer eigenen Fußnote:

> „… von den zuständigen Verordnungsgebern einheitlich erlassen, in Bayern als Anhang zur
> EV-BodenseeSchO.“

Die Bodensee-Schifffahrts-Ordnung wird auf Grundlage des Übereinkommens zwischen Deutschland,
Österreich und der Schweiz vom 1.6.1973 (BGBl. 1975 II S. 1405) dreistaatlich einheitlich erlassen.
In Bayern tritt sie **als Anhang einer eigenen Einführungsverordnung** in Kraft. Ihr XML führt
`@doktyp="normsonst"` und ein leeres `gliederungsNr.BayRS` – sie hat keine eigene Gliederungsstelle,
weil sie keine eigene bayerische Vorschrift ist.

Das Gegenstück `BayEVBodenseeSchO` ist als Rechtsverordnung enumeriert.

**Warum zunächst Review:** `docs/LEGAL_SCOPE.md` hält Anlagen bei der Stammnorm. Die Quelle führt aber
zwei Dokumente. Ein Zusammenführen ohne Entscheidung wäre eine Erfindung, ein stilles Aufnehmen als eigene
Norm eine Doppelung des Regelungsgehalts.

**Entscheidung (redaktionell, 2026-09-18):** Die BayBodSchO ist **normativer Anhang der
EV-BodenseeSchO, keine eigene Stammnorm**. Umgesetzt als Scope-Override
(`data/imports/bayernrecht/scope-overrides.json`): `exclude` mit Grund `annex-merged-into-related-norm` und
`relatedDocumentId: BayEVBodenseeSchO`. Der Bulk hängt den vollständigen Inhalt als Block `annex`
(„Anhang“, Titel der BSO) an die EV-BodenseeSchO – mit allen Abbildungen (38, als `figure`-Blöcke),
navigierbar, durchsuchbar und zitierbar über die Anker der Stammnorm. Es entsteht **keine** zweite Norm.
Der Anhang trägt nur, wenn er selbst die Prüfungen besteht: eigene Stichtagsentscheidung
(`unchanged-since-baseline`), Paket im Cache, Identität, Parser ohne Fehler, Textintegrität ohne `mismatch`;
sonst wird die Stammnorm nicht übernommen (`merged-annex-*`, Kategorie `incomplete-annex`). Das Paket der BSO
ist als Rohquelle (Rolle `annex`) im Manifest der EV-BodenseeSchO gebunden und archiviert.

## Zwei Parserbefunde, die dabei auffielen

1. **`@doktyp="normsonst"` war unbekannt** und brach den Parser ab. Jetzt als Verordnung geführt –
   immer mit Befund `norm-type-out-of-model`, weil die Rechtsform der Inkraftsetzung nicht dasselbe
   ist wie die Frage, ob ein Anhang eine eigene Norm ist. Nach der Ergänzung liest `BayBodSchO` mit
   8 Blöcken, 73 Beilagen und 38 Grafiken.

2. **Die Gliederungsnummer stand im Titel.** Die Quelle setzt Verwaltungsvorschriften ihre Nummer
   voran – mal auf eigener Zeile, mal als Präfix. Die Justizverwaltungsaktenordnung hieß dadurch
   „3033.3-J“. Beide Schreibungen werden jetzt abgetrennt und als Gliederungsnummer geführt, mit
   Befund `division-number-before-title`. Betroffen war ein erkennbarer Teil der 1 478
   Verwaltungsvorschriften; die genaue Zahl zeigt der Vollkorpuslauf.
