# Coverage RECHT.NRW → Land Westdeutschland

Stichtag 2023-12-01. Erzeugt mit `npm run import:recht-nrw:coverage -- --write`. Anteile beziehen sich auf die Basis des Bereichs; offene und nicht verarbeitete Fälle sind ausgewiesen.

## LRGV (Gesetze, Rechtsverordnungen)

Umfang: Bulk (Enumeration) · Basis: enumerierte Stammnorm-Kandidaten (Enumeration; Dubletten werden im Bulk-Lauf zusammengeführt) = 3189

| Kennzahl | Anzahl | Anteil |
| --- | ---: | ---: |
| Enumerierte Stammnormen (Basis) | 3189 | 100,0 % |
| Verarbeitet (Manifesteintrag) | 3181 | 99,7 % |
| Noch nicht verarbeitet | 0 | 0,0 % |
| Am Stichtag geltend | 1364 | 42,8 % |
| Am Stichtag nicht geltend | 1808 | 56,7 % |
| Übernommen | 1245 | 39,0 % |
| davon mit Warnungen | 1165 | 36,5 % |
| Review | 128 | 4,0 % |
| Fehlgeschlagen | 0 | 0,0 % |
| Stichtagsfassung nicht darstellbar | 0 | 0,0 % |
| PDF-Anlagen (Review, nicht blockierend) | 221 | 6,9 % |
| Konflikt der Stichtagsauswahl | 123 | 3,9 % |
| Ausgeschlossen | 0 | 0,0 % |
| Zustimmungsgesetze | 15 | 0,5 % |
| Bekanntmachungen (Evidenzquellen, keine Normen) | 698 | 21,9 % |

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
| Einträge | 3970 |
| aufgelöste Term-IDs | 3908 |
| Vorklassifikation Review | 139 |
| ohne Seitenabruf ausgeschlossen | 698 |
| Adressen ohne Eintrag | 0 |
| Adressen mehrfach zugeordnet | 0 |
| Term-Konflikte | 676 |
| Manifest ohne Enumeration | 0 |
| Verarbeitet ohne Manifest | 8 |

Abgleich: ok

Veraltete Importe (Parser/Transformer): 6 – Regeneration: `npm run import:recht-nrw:bulk -- --area lrgv --regenerate-stale --offline --write --resume`

## LRMB (Verwaltungsvorschriften)

Umfang: Bulk (Enumeration) · Basis: enumerierte Stammnorm-Kandidaten (Enumeration; Dubletten werden im Bulk-Lauf zusammengeführt) = 6311

| Kennzahl | Anzahl | Anteil |
| --- | ---: | ---: |
| Enumerierte Stammnormen (Basis) | 6311 | 100,0 % |
| Verarbeitet (Manifesteintrag) | 6145 | 97,4 % |
| Noch nicht verarbeitet | 0 | 0,0 % |
| Voraussichtlich normativ | 3269 | 51,8 % |
| Ausgeschlossen | 643 | 10,2 % |
| Review Normativität | 2364 | 37,5 % |
| Am Stichtag geltend | 337 | 5,3 % |
| Am Stichtag nicht geltend | 524 | 8,3 % |
| Geltung unbestimmt | 4787 | 75,9 % |
| Direkt übernommen | 247 | 3,9 % |
| Rekonstruiert übernommen | 1 | 0,0 % |
| Rekonstruktion erforderlich | 61 | 1,0 % |
| Regelungsgehalt nur als PDF oder Anlage fehlt | 55 | 0,9 % |
| Übernommen mit PDF-Anlage ohne strukturierten Text | 99 | 1,6 % |
| Historische Lücke (undatiert, ohne Beleg) | 2396 | 38,0 % |
| Dokumentidentität prüfen | 459 | 7,3 % |
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
| Einträge | 6311 |
| aufgelöste Term-IDs | 6145 |
| Vorklassifikation Review | 5032 |
| ohne Seitenabruf ausgeschlossen | 643 |
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

Offen: 11670 (blockierend 6034, 6879 Quellen)

| Kategorie | offen |
| --- | ---: |
| attachment | 1035 |
| document-identity | 472 |
| historical-gap | 2398 |
| institution-mapping | 3098 |
| metadata-conflict | 479 |
| normativity | 2364 |
| other | 32 |
| reconstruction-required | 13 |
| reconstruction-uncertain | 48 |
| slug-collision | 139 |
| text-integrity | 35 |
| unknown-structure | 1546 |
| version-selection | 11 |

Status aller Fälle: open 11670, superseded 461

## Institutionen

Offene Bezeichnungen ohne Entsprechung: 16001 (authority 2191, enacting-body 422, geography 1725, institution 12, jurisdiction-name 246, ministry 4084, municipality 6437, public-body 49, regional-body 835); Erlassorgan ohne Simulationsorgan: 417; Zuordnungseinträge: safe-transform 3, review 16.

## Rohquellen, Rekonstruktion, Qualität

- Archivstatus der Rohquellen: verified 11260, versioned 81
- Rekonstruktion: erforderlich 61, rekonstruiert 1, Rezepte 1, unsicher 48
- Integritätsfehler 0, Prüfung nach Transformation fehlgeschlagen 0, manuelle Entscheidungen 15583, fehlgeschlagene Importe 0, Dokumentidentität Widerspruch 21 / Review 451

## Letzte Läufe

- recht-nrw-2023-12-01-lrgv-20260916T230155Z: completed, 1 verarbeitet (Ende 2026-09-16T23:01:55.854Z)
- recht-nrw-2023-12-01-lrgv-20260916T230147Z: completed, 1 verarbeitet (Ende 2026-09-16T23:01:48.208Z)
- recht-nrw-2023-12-01-lrgv-20260916T230116Z: completed, 1 verarbeitet (Ende 2026-09-16T23:01:16.890Z)
- recht-nrw-2023-12-01-lrgv-20260916T230058Z: completed, 1 verarbeitet (Ende 2026-09-16T23:00:58.628Z)
- recht-nrw-2023-12-01-lrgv-20260916T225948Z: completed, 2 verarbeitet (Ende 2026-09-16T22:59:50.843Z)
- recht-nrw-2023-12-01-lrmb-20260916T230702Z: completed, 1 verarbeitet (Ende 2026-09-16T23:07:03.500Z)
- recht-nrw-2023-12-01-lrmb-20260916T230700Z: completed, 1 verarbeitet (Ende 2026-09-16T23:07:00.884Z)
- recht-nrw-2023-12-01-lrmb-20260916T230652Z: completed, 1 verarbeitet (Ende 2026-09-16T23:06:55.594Z)
- recht-nrw-2023-12-01-lrmb-20260916T230649Z: completed, 1 verarbeitet (Ende 2026-09-16T23:06:50.129Z)
- recht-nrw-2023-12-01-lrmb-20260916T230646Z: completed, 1 verarbeitet (Ende 2026-09-16T23:06:47.516Z)
