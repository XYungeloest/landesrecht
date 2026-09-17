# Abdeckung des BayWü-Bestands (bayernrecht → baywue)

Stichtag 2023-12-01. Erzeugt von `npm run import:bayernrecht:coverage -- --write`; die Zahlen
hängen allein vom Bestand ab (Enumeration, Manifest, Beispielkorpus), nicht vom Zeitpunkt des Laufs.

## Enumeration je Bereich

| Bereich | Dokumente | Fortführungsnachweis | Portalfacette | nur Facette |
| --- | ---: | ---: | ---: | ---: |
| landesrecht | 935 | 872 | 935 | 63 |
| vwv | 1478 | 1439 | 1478 | 39 |
| **gesamt** | **2413** | | | |

## Enumeration je Normtyp

| Bereich | Normtyp | Bezeichnung | Dokumente |
| --- | --- | --- | ---: |
| landesrecht | ges | Gesetz | 241 |
| landesrecht | rv | Rechtsverordnung | 486 |
| landesrecht | vertr | Vertrag, sonstige Rechtsquelle | 208 |
| vwv | vv | Verwaltungsvorschrift | 1478 |

## Manifeststatus

Der Bestand entsteht erst mit dem Bulk-Lauf; solange keiner gelaufen ist, stehen hier Nullen – ausgewiesen,
nicht weggelassen.

| Bereich | Einträge | imported | imported-with-warnings | dry-run | failed | needs-review | excluded | not-at-baseline |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| landesrecht | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| vwv | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Änderungslage relativ zum Stichtag

Für Normen ohne Änderung nach dem Stichtag ist der heutige Text zugleich der Stichtagstext – belegt aus dem
Fortführungsnachweis. Ohne datierte Notiz bleibt der Fall unbekannt und wird keinem Lager zugeschlagen.

| Bereich | geändert nach Stichtag | unverändert | unbekannt |
| --- | ---: | ---: | ---: |
| landesrecht | 372 | 327 | 236 |
| vwv | 290 | 240 | 948 |
| **gesamt** | **662** | **567** | **1184** |

Anteil der datiert beantworteten Fälle mit Änderung nach dem Stichtag: **53.9 %**.

## Beispielkorpus je Strukturfall

28 Normen, 16 von 16 Abdeckungsanforderungen erfüllt.
Gezählt wird, was am abgelegten Paket nachgewiesen ist – nicht, was vorgesehen war.

| Strukturfall | Normen |
| --- | ---: |
| dtd-byrecht-norm | 23 |
| dtd-byrecht-vv | 5 |
| gliederung-verschachtelt | 23 |
| vorschrift-ohne-gliederung | 3 |
| vorschrift-ohne-nummer | 16 |
| aufgehobene-vorschriften | 9 |
| tabellen | 13 |
| anlagen-strukturiert | 10 |
| anlagen-pdf | 8 |
| bildbeilagen | 7 |
| fussnoten | 19 |
| verweise | 28 |
| aenderungsverlauf | 20 |
| satznummern | 22 |
| satznummern-hochgestellt | 5 |
| leere-metadaten | 19 |
| kein-builddate | 5 |

Fingerabdruck des Inhalts: `85d38f52a676532f8c591df3da00df928a0ca68f67e292c06c58fa7cc3c0e130`.
