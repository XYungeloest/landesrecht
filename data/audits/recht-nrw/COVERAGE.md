# Coverage RECHT.NRW → Land Westdeutschland

Stichtag 2023-12-01. Erzeugt mit `npm run import:recht-nrw:coverage -- --write`. Anteile beziehen sich auf die Basis des Bereichs; offene und nicht verarbeitete Fälle sind ausgewiesen.

## LRGV (Gesetze, Rechtsverordnungen)

Umfang: Bulk (Enumeration) · Basis: enumerierte Stammnorm-Kandidaten (Enumeration; Dubletten werden im Bulk-Lauf zusammengeführt) = 3168

| Kennzahl | Anzahl | Anteil |
| --- | ---: | ---: |
| Enumerierte Stammnormen (Basis) | 3168 | 100,0 % |
| Verarbeitet (Manifesteintrag) | 3157 | 99,7 % |
| Noch nicht verarbeitet | 3 | 0,1 % |
| Am Stichtag geltend | 1357 | 42,8 % |
| Am Stichtag nicht geltend | 1792 | 56,6 % |
| Übernommen | 1225 | 38,7 % |
| davon mit Warnungen | 1147 | 36,2 % |
| Review | 118 | 3,7 % |
| Fehlgeschlagen | 22 | 0,7 % |
| Stichtagsfassung nicht darstellbar | 0 | 0,0 % |
| PDF-Anlagen (Review, nicht blockierend) | 221 | 7,0 % |
| Konflikt der Stichtagsauswahl | 117 | 3,7 % |
| Ausgeschlossen | 0 | 0,0 % |
| Zustimmungsgesetze | 0 | 0,0 % |
| Bekanntmachungen (Evidenzquellen, keine Normen) | 698 | 22,0 % |

**Abgleich Sitemap ↔ Suchindex ↔ Manifest**

| Kennzahl | Wert |
| --- | ---: |
| Sitemap-Adressen | 10518 |
| Sitemap-Slug-Stämme | 3338 |
| Suchindex-Treffer | 4074 |
| davon in der Sitemap | 3967 |
| nicht in der Sitemap | 0 |
| Vereinigung | 3338 |
| Schnittmenge | 3171 |
| nur Sitemap | 167 |
| nur Suchindex | 0 |
| Einträge | 3957 |
| aufgelöste Term-IDs | 3872 |
| Vorklassifikation Review | 72 |
| ohne Seitenabruf ausgeschlossen | 698 |
| Adressen ohne Eintrag | 0 |
| Adressen mehrfach zugeordnet | 0 |
| Term-Konflikte | 681 |
| Manifest ohne Enumeration | 0 |
| Verarbeitet ohne Manifest | 8 |

Abgleich: ok

Veraltete Importe (Parser/Transformer): 0

## LRMB (Verwaltungsvorschriften)

Umfang: Bulk (Enumeration) · Basis: enumerierte Stammnorm-Kandidaten (Enumeration; Dubletten werden im Bulk-Lauf zusammengeführt) = 6144

| Kennzahl | Anzahl | Anteil |
| --- | ---: | ---: |
| Enumerierte Stammnormen (Basis) | 6144 | 100,0 % |
| Verarbeitet (Manifesteintrag) | 5978 | 97,3 % |
| Noch nicht verarbeitet | 0 | 0,0 % |
| Voraussichtlich normativ | 3133 | 51,0 % |
| Ausgeschlossen | 643 | 10,5 % |
| Review Normativität | 2333 | 38,0 % |
| Am Stichtag geltend | 271 | 4,4 % |
| Am Stichtag nicht geltend | 454 | 7,4 % |
| Geltung unbestimmt | 4756 | 77,4 % |
| Direkt übernommen | 197 | 3,2 % |
| Rekonstruiert übernommen | 1 | 0,0 % |
| Rekonstruktion erforderlich | 51 | 0,8 % |
| Regelungsgehalt nur als PDF oder Anlage fehlt | 42 | 0,7 % |
| Übernommen mit PDF-Anlage ohne strukturierten Text | 75 | 1,2 % |
| Historische Lücke (undatiert, ohne Beleg) | 2396 | 39,0 % |
| Dokumentidentität prüfen | 455 | 7,4 % |
| Fehlgeschlagen | 20 | 0,3 % |

**Abgleich Sitemap ↔ Suchindex ↔ Manifest**

| Kennzahl | Wert |
| --- | ---: |
| Sitemap-Adressen | 6532 |
| Sitemap-Slug-Stämme | 5971 |
| Suchindex-Treffer | 6351 |
| davon in der Sitemap | 6351 |
| nicht in der Sitemap | 0 |
| Vereinigung | 5971 |
| Schnittmenge | 5953 |
| nur Sitemap | 18 |
| nur Suchindex | 0 |
| Einträge | 5974 |
| aufgelöste Term-IDs | 15 |
| Vorklassifikation Review | 1247 |
| ohne Seitenabruf ausgeschlossen | 147 |
| Adressen ohne Eintrag | 0 |
| Adressen mehrfach zugeordnet | 0 |
| Term-Konflikte | 0 |
| Manifest ohne Enumeration | 0 |
| Verarbeitet ohne Manifest | 0 |

Abgleich: ok

Veraltete Importe (Parser/Transformer): 0

## Konsistenz Manifest ↔ Inhalte ↔ Slug-Registry

- Übernommen ohne Inhalt: 0
- Inhalt ohne Manifesteintrag: 0
- Slug-Registry abweichend: 0

## Review-Queue

Offen: 11303 (blockierend 5946, 6736 Quellen)

| Kategorie | offen |
| --- | ---: |
| attachment | 954 |
| document-identity | 470 |
| historical-gap | 2397 |
| institution-mapping | 2953 |
| metadata-conflict | 436 |
| normativity | 2333 |
| other | 25 |
| reconstruction-required | 9 |
| reconstruction-uncertain | 42 |
| slug-collision | 113 |
| text-integrity | 39 |
| unknown-structure | 1522 |
| version-selection | 10 |

Status aller Fälle: open 11303, superseded 401

## Institutionen

Offene Bezeichnungen ohne Entsprechung: 15708 (authority 2110, enacting-body 374, geography 1704, institution 12, jurisdiction-name 217, ministry 4056, municipality 6364, public-body 49, regional-body 822); Erlassorgan ohne Simulationsorgan: 369; Zuordnungseinträge: safe-transform 3, review 16.

## Rohquellen, Rekonstruktion, Qualität

- Archivstatus der Rohquellen: verified 10870, versioned 81
- Rekonstruktion: erforderlich 51, rekonstruiert 1, Rezepte 1, unsicher 42
- Integritätsfehler 0, Prüfung nach Transformation fehlgeschlagen 0, manuelle Entscheidungen 15338, fehlgeschlagene Importe 22, Dokumentidentität Widerspruch 21 / Review 449

## Letzte Läufe

- recht-nrw-2023-12-01-lrgv-20260916T190442Z: completed, 3 verarbeitet (Ende 2026-09-16T19:04:43.583Z)
- recht-nrw-2023-12-01-lrgv-20260916T190413Z: completed, 19 verarbeitet (Ende 2026-09-16T19:04:21.036Z)
- recht-nrw-2023-12-01-lrgv-20260916T154410Z: completed, 1 verarbeitet (Ende 2026-09-16T15:44:11.353Z)
- recht-nrw-2023-12-01-lrgv-20260916T154401Z: completed, 1 verarbeitet (Ende 2026-09-16T15:44:01.630Z)
- recht-nrw-2023-12-01-lrgv-20260916T154132Z: completed, 5 verarbeitet (Ende 2026-09-16T15:41:33.646Z)
- recht-nrw-2023-12-01-lrmb-20260916T152650Z: completed, 20 verarbeitet (Ende 2026-09-16T15:26:56.552Z)
- recht-nrw-2023-12-01-lrmb-20260916T145757Z: completed, 5467 verarbeitet (Ende 2026-09-16T15:25:16.111Z)
- recht-nrw-2023-12-01-lrmb-20260916T093540Z: completed, 2 verarbeitet (Ende 2026-09-16T09:35:41.424Z)
- recht-nrw-2023-12-01-lrmb-20260916T093207Z: completed, 20 verarbeitet (Ende 2026-09-16T09:32:10.204Z)
- recht-nrw-2023-12-01-lrmb-20260916T093115Z: completed, 1 verarbeitet (Ende 2026-09-16T09:31:15.773Z)
