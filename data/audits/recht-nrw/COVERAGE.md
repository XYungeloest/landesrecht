# Coverage RECHT.NRW → Land Westdeutschland

Stichtag 2023-12-01. Erzeugt mit `npm run import:recht-nrw:coverage -- --write`. Anteile beziehen sich auf die Basis des Bereichs; offene und nicht verarbeitete Fälle sind ausgewiesen.

## LRGV (Gesetze, Rechtsverordnungen)

Umfang: Bulk (Enumeration) · Basis: enumerierte Stammnorm-Kandidaten (Enumeration; Dubletten werden im Bulk-Lauf zusammengeführt) = 3164

| Kennzahl | Anzahl | Anteil |
| --- | ---: | ---: |
| Enumerierte Stammnormen (Basis) | 3164 | 100,0 % |
| Verarbeitet (Manifesteintrag) | 3125 | 98,8 % |
| Noch nicht verarbeitet | 0 | 0,0 % |
| Am Stichtag geltend | 1411 | 44,6 % |
| Am Stichtag nicht geltend | 1705 | 53,9 % |
| Übernommen | 1156 | 36,5 % |
| davon mit Warnungen | 1080 | 34,1 % |
| Review | 188 | 5,9 % |
| Fehlgeschlagen | 78 | 2,5 % |
| Stichtagsfassung nicht darstellbar | 0 | 0,0 % |
| PDF-Anlagen (Review, nicht blockierend) | 215 | 6,8 % |
| Konflikt der Stichtagsauswahl | 187 | 5,9 % |
| Ausgeschlossen | 0 | 0,0 % |
| Zustimmungsgesetze | 0 | 0,0 % |
| Bekanntmachungen (Evidenzquellen, keine Normen) | 698 | 22,1 % |

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
| Einträge | 3916 |
| aufgelöste Term-IDs | 3853 |
| Vorklassifikation Review | 194 |
| ohne Seitenabruf ausgeschlossen | 698 |
| Adressen ohne Eintrag | 0 |
| Adressen mehrfach zugeordnet | 0 |
| Term-Konflikte | 680 |
| Manifest ohne Enumeration | 0 |
| Verarbeitet ohne Manifest | 8 |

Abgleich: ok

Veraltete Importe (Parser/Transformer): 0

## LRMB (Verwaltungsvorschriften)

Umfang: Bulk (Enumeration) · Basis: enumerierte Stammnorm-Kandidaten (Enumeration; Dubletten werden im Bulk-Lauf zusammengeführt) = 6145

| Kennzahl | Anzahl | Anteil |
| --- | ---: | ---: |
| Enumerierte Stammnormen (Basis) | 6145 | 100,0 % |
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

Offen: 11621 (blockierend 6338, 6793 Quellen)

| Kategorie | offen |
| --- | ---: |
| attachment | 947 |
| document-identity | 473 |
| historical-gap | 2399 |
| institution-mapping | 2914 |
| metadata-conflict | 503 |
| normativity | 2333 |
| other | 23 |
| reconstruction-required | 9 |
| reconstruction-uncertain | 42 |
| slug-collision | 108 |
| text-integrity | 84 |
| unknown-structure | 1775 |
| version-selection | 11 |

Status aller Fälle: open 11621, superseded 14

## Institutionen

Offene Bezeichnungen ohne Entsprechung: 15458 (authority 2078, enacting-body 367, geography 1649, institution 12, jurisdiction-name 215, ministry 4002, municipality 6277, public-body 49, regional-body 809); Erlassorgan ohne Simulationsorgan: 362; Zuordnungseinträge: safe-transform 3, review 16.

## Rohquellen, Rekonstruktion, Qualität

- Archivstatus der Rohquellen: staged 10909, versioned 53
- Rekonstruktion: erforderlich 51, rekonstruiert 1, Rezepte 1, unsicher 42
- Integritätsfehler 0, Prüfung nach Transformation fehlgeschlagen 0, manuelle Entscheidungen 15091, fehlgeschlagene Importe 76, Dokumentidentität Widerspruch 21 / Review 452

## Letzte Läufe

- recht-nrw-2023-12-01-lrgv-20260916T093838Z: completed, 1 verarbeitet (Ende 2026-09-16T09:38:38.436Z)
- recht-nrw-2023-12-01-lrgv-20260916T093752Z: completed, 1 verarbeitet (Ende 2026-09-16T09:37:52.913Z)
- recht-nrw-2023-12-01-lrgv-20260916T093538Z: completed, 5 verarbeitet (Ende 2026-09-16T09:35:39.228Z)
- recht-nrw-2023-12-01-lrgv-20260916T062239Z: completed, 85 verarbeitet (Ende 2026-09-16T06:22:52.495Z)
- recht-nrw-2023-12-01-lrgv-20260916T061938Z: aborted-systemic, 20 verarbeitet (Ende 2026-09-16T06:19:41.475Z)
- recht-nrw-2023-12-01-lrmb-20260916T093540Z: completed, 2 verarbeitet (Ende 2026-09-16T09:35:41.424Z)
- recht-nrw-2023-12-01-lrmb-20260916T093207Z: completed, 20 verarbeitet (Ende 2026-09-16T09:32:10.204Z)
- recht-nrw-2023-12-01-lrmb-20260916T093115Z: completed, 1 verarbeitet (Ende 2026-09-16T09:31:15.773Z)
- recht-nrw-2023-12-01-lrmb-20260916T093111Z: completed, 2 verarbeitet (Ende 2026-09-16T09:31:13.128Z)
- recht-nrw-2023-12-01-lrmb-20260916T092936Z: completed, 34 verarbeitet (Ende 2026-09-16T09:31:07.288Z)
