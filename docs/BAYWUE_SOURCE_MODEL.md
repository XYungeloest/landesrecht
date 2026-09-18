# Quellenmodell Bayern-Württemberg

Welche Quelle was belegt, wie amtlich sie ist, und wo das im Datenmodell steht.

## Drei Quellen, drei Rangstufen

| Quelle | Was sie ist | Rang |
| --- | --- | --- |
| **BayMBl.** elektronisch (ab 2019) | die amtliche Verkündung selbst, als PDF/A auf der Verkündungsplattform | **amtlich** |
| **GVBl.** elektronisch | eine Kopie der Druckausgabe auf der Verkündungsplattform | **nachrichtlich** – amtlich ist allein die Druckausgabe |
| **BAYERN.RECHT** konsolidierter Text | ein vom Freistaat bereitgestellter Gebrauchstext | **nichtamtlich** |

Die dritte Zeile ist die, die man am leichtesten übersieht. BAYERN.RECHT ist strukturiert, staatlich
angeboten und liefert das XML, aus dem der ganze BayWü-Bestand gebaut ist. **Eine Verkündung ist es
trotzdem nicht.** Die normative Provenienz einer Vorschrift liegt bei ihrer Verkündung im GVBl. oder
BayMBl.; der konsolidierte Text ist die bequeme Zusammenfassung dieser Verkündungen, nicht ihr Ersatz.

## Wie das im Datenmodell steht

### Im Manifest, je Norm (`data/imports/bayernrecht/manifest/…`)

```json
"sourceProvenance": {
  "publicationAuthority": "printed-official",
  "digitalRepresentation": "born-digital",
  "note": "XML-Export der konsolidierten Fassung aus BAYERN.RECHT (Bayerische Rechtssammlung); amtlich verkündet ist die Druckausgabe des GVBl., die elektronische Darstellung ist nachrichtlich."
}
```

`publicationAuthority` benennt, wo die **amtliche** Fassung der Vorschrift liegt – bei Gesetzen und
Verordnungen die Druckausgabe des GVBl. (`printed-official`), bei Verwaltungsvorschriften ab 2019 das
elektronische BayMBl. (`electronic-official`). Zulässig sind nur `printed-official`,
`electronic-official` und `unknown`; die Schemaprüfung lehnt jeden anderen Wert ab.

### Im Ereignisregister, je Beleg (`data/imports/bayernrecht/events/ledger.json`)

| Organ | `publicationAuthority` | `digitalRepresentation` |
| --- | --- | --- |
| BayMBl. | `electronic-official` | `official-electronic-edition` |
| GVBl. | `printed-official` | `official-platform-informational-copy` |

Das Register **erzwingt** diese Zuordnung: Ein GVBl.-Ereignis mit `electronic-official` ist ein
Schemafehler. Die Zuordnung steht an genau einer Stelle (`ORGAN_PROVENANCE` in
`src/events/ledger.ts`).

### Die Prüfsummen

Die Verkündungsplattform veröffentlicht zu jeder GVBl.-Ausgabe selbst eine SHA-256-Prüfsumme. Sie
belegt, dass die elektronische Kopie unverändert ist – **nicht**, dass sie amtlich ist. Der
Dezember-Bericht (`data/audits/bayernrecht/POST_BASELINE_DECEMBER_2023.md`) sagt das ausdrücklich.

## Rohquellen und ihr Archiv

Jede übernommene Norm führt ihr Exportpaket als Rohquelle, archiviert in R2 unter
`baywue/bayernrecht/2023-12-01/<bereich>/<quellidentität>/<sha-präfix>-text-document.zip`, dazu ein
Umschlag mit Adresse, finaler Adresse, Abrufdatum, Media Type, Bytes, SHA-256 und Quellidentität.
Stand 2026-09-18: 1 582 Pakete und 24 Verkündungsbelege der Rückrechnung (Änderung und Beginn der Stichtagsfassung), alle `verified` (`data/audits/bayernrecht/R2_AUDIT.md`).

**Abrufdatum und Stichtag sind verschiedene Daten.** Das Abrufdatum sagt, wann das Paket geholt wurde
(2026-09-17); der Stichtag, zu welchem Tag der Text gilt (2023-12-01). Die Quellenreferenz führt das
Abrufdatum als Tagesdatum (`YYYY-MM-DD`), nie als Zeitstempel – ein Zeitstempel ließ früher jede Norm
an der Schemaprüfung scheitern.

## Quellrollen

Der Auftrag nennt acht Rollen. So bildet der heutige Stand sie ab:

| Rolle | heute | Ort |
| --- | --- | --- |
| `consolidated-current` | `role: text-document` + `sourceProvenance.note` | Manifest |
| `official-publication` | `publicationAuthority: printed-official` | Manifest, Register |
| `official-electronic-publication` | `publicationAuthority: electronic-official` | Manifest, Register |
| `informational-gazette-copy` | `digitalRepresentation: official-platform-informational-copy` | Register |
| `amendment-evidence` | Ereignistyp `amend` | Register |
| `repeal-evidence` | Ereignistypen `repeal`, `expire` | Register |
| `asset` | Beilagen (`primary-pdf`, Bildbeilagen) als Quellenreferenz | Norm-Metadaten |
| `metadata` | Enumeration, Fortführungsnachweis | `enumeration-*.json` |

**Offen:** Die Rolle ist heute über mehrere Felder verteilt statt in einem einzigen Rollenfeld
benannt. Die Information ist vollständig vorhanden und nirgends falsch; eine Vereinheitlichung auf
ein Feld `sourceRole` wäre eine Schemaänderung des Manifests über alle 2 343 Einträge und ist hier
bewusst nicht mitten im Lauf vorgenommen worden.
