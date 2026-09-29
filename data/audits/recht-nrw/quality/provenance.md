# Provenienz-Audit (SourceReferences) – West

Quelle: `content/norms/west/**` gegen `data/imports/recht-nrw/manifest/**`. Erzeugt mit `npm run audit:provenance`;
Prüflogik in `scripts/lib/provenance-audit.ts` (identisch mit `tests/unit/content-provenance.test.ts`).
Geprüft werden alle Normen (keine Stichprobe), jeweils die am Stichtag geltende Fassung.

## Ergebnis

| Kennzahl | Wert |
| --- | --- |
| Normen | 1482 |
| Normen mit Fehlern | 0 |
| Normen mit Warnungen | 11 |
| Fehler gesamt | 0 |
| Warnungen gesamt | 22 |
| Normen mit R2-Archivquellen | 1462 |
| Normen mit versionierten Quellen (Beispielkorpus) | 20 |
| Hashabgleiche bestanden (Manifest bzw. Datei) | 5552 |

## Quellenreferenzen nach Verfügbarkeit

| Wert | Anzahl |
| --- | --- |
| external | 1838 |
| r2-archived | 5470 |
| versioned | 82 |

## Quellenreferenzen nach Art

| Wert | Anzahl |
| --- | --- |
| amendment-source | 138 |
| official-portal-snapshot | 4994 |
| primary-pdf | 2258 |

## Archivstatus laut Manifest (je referenziertes Objekt)

| Wert | Anzahl |
| --- | --- |
| verified | 5470 |
| versioned | 82 |

## Quellenlage der Fassungen

Geltung: exact 1449, reconstructed 1, verified-active-at-baseline 32 · Text: direct 1481, reconstructed 1

## Importstatus laut Manifest

| Wert | Anzahl |
| --- | --- |
| imported | 83 |
| imported-with-warnings | 1399 |

## Befunde nach Code

| Wert | Anzahl |
| --- | --- |
| source-valid-from-missing-on-reference | 22 |

## Normen mit versionierten Quellen

- abgg-west
- allgemeine-verwaltungsvorschrift-zu-74-absatz-4-und-79-absatz-1-des-west
- baugb-ag-west
- dvo-kibiz-west
- genehmigung-von-dienstreisen-der-beschaeftigten-von-behoerden-und-west
- go-west
- kibiz-west
- lbtg-west
- loeg-west
- oepnvg-west
- rechtsbehelfsbelehrung-bei-bussgeldbescheiden-west
- runderlass-fuer-die-fassung-von-rechtsbehelfsbelehrungen-west
- runderlass-kostentragung-in-der-kampfmittelbeseitigung-west
- rwp-beratungserlass-west
- schulg-west
- verfassung-fuer-das-land-westdeutschland
- verordnung-ueber-umzugskostenentschaedigung-tagegelder-und-west
- vv-lhundg-west
- vvzlrkg-west
- vwvfg-west

## Befunde (22)

| Norm | Schwere | Code | Meldung |
| --- | --- | --- | --- |
| allgemeine-richtlinie-zur-foerderung-von-projekten-und-einrichtungen-auf-west | warning | source-valid-from-missing-on-reference | meta official-portal-snapshot „RECHT.NRW-Seite (Einstiegsfassung)“: sourceValidFrom fehlt an der Portalfassung |
| allgemeine-richtlinie-zur-foerderung-von-projekten-und-einrichtungen-auf-west | warning | source-valid-from-missing-on-reference | version:2023-12-01 official-portal-snapshot „RECHT.NRW-Seite (Einstiegsfassung)“: sourceValidFrom fehlt an der Portalfassung |
| berufskolleg-unterricht-in-justizvollzugsanstalten-gemeinsamer-west | warning | source-valid-from-missing-on-reference | meta official-portal-snapshot „RECHT.NRW-Seite (Einstiegsfassung)“: sourceValidFrom fehlt an der Portalfassung |
| berufskolleg-unterricht-in-justizvollzugsanstalten-gemeinsamer-west | warning | source-valid-from-missing-on-reference | version:2023-12-01 official-portal-snapshot „RECHT.NRW-Seite (Einstiegsfassung)“: sourceValidFrom fehlt an der Portalfassung |
| foerl-gur-west | warning | source-valid-from-missing-on-reference | meta official-portal-snapshot „RECHT.NRW-Seite (Einstiegsfassung)“: sourceValidFrom fehlt an der Portalfassung |
| foerl-gur-west | warning | source-valid-from-missing-on-reference | version:2023-12-01 official-portal-snapshot „RECHT.NRW-Seite (Einstiegsfassung)“: sourceValidFrom fehlt an der Portalfassung |
| kosten-des-brandschutzes-ersatz-von-aufwendungen-bei-teilnahme-von-west | warning | source-valid-from-missing-on-reference | meta official-portal-snapshot „RECHT.NRW-Seite (Einstiegsfassung)“: sourceValidFrom fehlt an der Portalfassung |
| kosten-des-brandschutzes-ersatz-von-aufwendungen-bei-teilnahme-von-west | warning | source-valid-from-missing-on-reference | version:2023-12-01 official-portal-snapshot „RECHT.NRW-Seite (Einstiegsfassung)“: sourceValidFrom fehlt an der Portalfassung |
| richtlinie-ueber-die-foerderphase-im-rahmen-der-ausbildung-fuer-den-west | warning | source-valid-from-missing-on-reference | meta official-portal-snapshot „RECHT.NRW-Seite (Einstiegsfassung)“: sourceValidFrom fehlt an der Portalfassung |
| richtlinie-ueber-die-foerderphase-im-rahmen-der-ausbildung-fuer-den-west | warning | source-valid-from-missing-on-reference | version:2023-12-01 official-portal-snapshot „RECHT.NRW-Seite (Einstiegsfassung)“: sourceValidFrom fehlt an der Portalfassung |
| richtlinie-ueber-die-gewaehrung-von-zuwendungen-zur-durchfuehrung-des-west | warning | source-valid-from-missing-on-reference | meta official-portal-snapshot „RECHT.NRW-Seite (Einstiegsfassung)“: sourceValidFrom fehlt an der Portalfassung |
| richtlinie-ueber-die-gewaehrung-von-zuwendungen-zur-durchfuehrung-des-west | warning | source-valid-from-missing-on-reference | version:2023-12-01 official-portal-snapshot „RECHT.NRW-Seite (Einstiegsfassung)“: sourceValidFrom fehlt an der Portalfassung |
| richtlinie-ueber-die-gewaehrung-von-zuwendungen-zur-foerderung-von-west | warning | source-valid-from-missing-on-reference | meta official-portal-snapshot „RECHT.NRW-Seite (Einstiegsfassung)“: sourceValidFrom fehlt an der Portalfassung |
| richtlinie-ueber-die-gewaehrung-von-zuwendungen-zur-foerderung-von-west | warning | source-valid-from-missing-on-reference | version:2023-12-01 official-portal-snapshot „RECHT.NRW-Seite (Einstiegsfassung)“: sourceValidFrom fehlt an der Portalfassung |
| richtlinie-zur-foerderung-der-meisterpraemie-in-westdeutschland | warning | source-valid-from-missing-on-reference | meta official-portal-snapshot „RECHT.NRW-Seite (Einstiegsfassung)“: sourceValidFrom fehlt an der Portalfassung |
| richtlinie-zur-foerderung-der-meisterpraemie-in-westdeutschland | warning | source-valid-from-missing-on-reference | version:2023-12-01 official-portal-snapshot „RECHT.NRW-Seite (Einstiegsfassung)“: sourceValidFrom fehlt an der Portalfassung |
| richtlinien-ueber-die-gewaehrung-von-zuwendung-zur-erhaltung-west | warning | source-valid-from-missing-on-reference | meta official-portal-snapshot „RECHT.NRW-Seite (Einstiegsfassung)“: sourceValidFrom fehlt an der Portalfassung |
| richtlinien-ueber-die-gewaehrung-von-zuwendung-zur-erhaltung-west | warning | source-valid-from-missing-on-reference | version:2023-12-01 official-portal-snapshot „RECHT.NRW-Seite (Einstiegsfassung)“: sourceValidFrom fehlt an der Portalfassung |
| verwaltungsvorschrift-ueber-die-wirtschaftsfuehrung-des-west | warning | source-valid-from-missing-on-reference | meta official-portal-snapshot „RECHT.NRW-Seite (Einstiegsfassung)“: sourceValidFrom fehlt an der Portalfassung |
| verwaltungsvorschrift-ueber-die-wirtschaftsfuehrung-des-west | warning | source-valid-from-missing-on-reference | version:2023-12-01 official-portal-snapshot „RECHT.NRW-Seite (Einstiegsfassung)“: sourceValidFrom fehlt an der Portalfassung |
| vvzlrkg-west | warning | source-valid-from-missing-on-reference | meta official-portal-snapshot „RECHT.NRW-Seite der jüngsten Fassung (ab 2026-10-01)“: sourceValidFrom fehlt an der Portalfassung |
| vvzlrkg-west | warning | source-valid-from-missing-on-reference | version:2023-12-01 official-portal-snapshot „RECHT.NRW-Seite der jüngsten Fassung (ab 2026-10-01)“: sourceValidFrom fehlt an der Portalfassung |
