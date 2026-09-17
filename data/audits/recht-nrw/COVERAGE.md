# Coverage RECHT.NRW → Land Westdeutschland

Stichtag 2023-12-01. Erzeugt mit `npm run import:recht-nrw:coverage -- --write`. Anteile beziehen sich auf die Basis des Bereichs; offene und nicht verarbeitete Fälle sind ausgewiesen.

## LRGV (Gesetze, Rechtsverordnungen)

Umfang: Bulk (Enumeration) · Basis: enumerierte Stammnorm-Kandidaten (Enumeration; Dubletten werden im Bulk-Lauf zusammengeführt) = 3190

| Kennzahl | Anzahl | Anteil |
| --- | ---: | ---: |
| Enumerierte Stammnormen (Basis) | 3190 | 100,0 % |
| Verarbeitet (Manifesteintrag) | 3182 | 99,7 % |
| Noch nicht verarbeitet | 0 | 0,0 % |
| Am Stichtag geltend | 1363 | 42,7 % |
| Am Stichtag nicht geltend | 1810 | 56,7 % |
| Übernommen | 1245 | 39,0 % |
| davon mit Warnungen | 1165 | 36,5 % |
| Review | 127 | 4,0 % |
| Fehlgeschlagen | 0 | 0,0 % |
| Stichtagsfassung nicht darstellbar | 0 | 0,0 % |
| PDF-Anlagen (Review, nicht blockierend) | 221 | 6,9 % |
| Konflikt der Stichtagsauswahl | 122 | 3,8 % |
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
| Einträge | 3888 |
| aufgelöste Term-IDs | 3880 |
| Vorklassifikation Review | 139 |
| ohne Seitenabruf ausgeschlossen | 698 |
| Adressen ohne Eintrag | 0 |
| Adressen mehrfach zugeordnet | 0 |
| Term-Konflikte | 0 |
| Manifest ohne Enumeration | 0 |
| Verarbeitet ohne Manifest | 8 |

Abgleich: ok

Veraltete Importe (Parser/Transformer): 5 – Regeneration: `npm run import:recht-nrw:bulk -- --area lrgv --regenerate-stale --offline --write --resume`

## LRMB (Verwaltungsvorschriften)

Umfang: Bulk (Enumeration) · Basis: enumerierte Stammnorm-Kandidaten (Enumeration; Dubletten werden im Bulk-Lauf zusammengeführt) = 6345

| Kennzahl | Anzahl | Anteil |
| --- | ---: | ---: |
| Enumerierte Stammnormen (Basis) | 6345 | 100,0 % |
| Verarbeitet (Manifesteintrag) | 6179 | 97,4 % |
| Noch nicht verarbeitet | 0 | 0,0 % |
| Voraussichtlich normativ | 3302 | 52,0 % |
| Ausgeschlossen | 643 | 10,1 % |
| Review Normativität | 2365 | 37,3 % |
| Am Stichtag geltend | 328 | 5,2 % |
| Am Stichtag nicht geltend | 693 | 10,9 % |
| Geltung unbestimmt | 4661 | 73,5 % |
| Direkt übernommen | 236 | 3,7 % |
| Rekonstruiert übernommen | 1 | 0,0 % |
| Rekonstruktion erforderlich | 64 | 1,0 % |
| Regelungsgehalt nur als PDF oder Anlage fehlt | 60 | 0,9 % |
| Übernommen mit PDF-Anlage ohne strukturierten Text | 88 | 1,4 % |
| Historische Lücke (undatiert, ohne Beleg) | 2259 | 35,6 % |
| Dokumentidentität prüfen | 458 | 7,2 % |
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
| Einträge | 6345 |
| aufgelöste Term-IDs | 6179 |
| Vorklassifikation Review | 4908 |
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

Offen: 11649 (blockierend 6076, 6913 Quellen)

| Kategorie | offen |
| --- | ---: |
| attachment | 998 |
| document-identity | 471 |
| historical-gap | 2261 |
| institution-mapping | 3065 |
| metadata-conflict | 667 |
| normativity | 2365 |
| other | 26 |
| reconstruction-required | 13 |
| reconstruction-uncertain | 51 |
| slug-collision | 137 |
| text-integrity | 34 |
| unknown-structure | 1550 |
| version-selection | 11 |

Status aller Fälle: open 11649, superseded 726

## Institutionen

Offene Bezeichnungen ohne Entsprechung: 15926 (authority 2151, enacting-body 413, geography 1728, institution 12, jurisdiction-name 241, ministry 4090, municipality 6412, public-body 49, regional-body 830); Erlassorgan ohne Simulationsorgan: 409; Zuordnungseinträge: safe-transform 3, review 16.

## Rohquellen, Rekonstruktion, Qualität

- Archivstatus der Rohquellen: verified 11281, versioned 81
- Rekonstruktion: erforderlich 64, rekonstruiert 1, Rezepte 1, unsicher 51
- Integritätsfehler 0, Prüfung nach Transformation fehlgeschlagen 0, manuelle Entscheidungen 15517, fehlgeschlagene Importe 0, Dokumentidentität Widerspruch 21 / Review 450

## Letzte Läufe

- recht-nrw-2023-12-01-lrgv-20260917T060050Z: completed, 3 verarbeitet (Ende 2026-09-17T06:00:51.597Z)
- recht-nrw-2023-12-01-lrgv-20260917T051247Z: completed, 1 verarbeitet (Ende 2026-09-17T05:12:49.215Z)
- recht-nrw-2023-12-01-lrgv-20260917T051234Z: completed, 9 verarbeitet (Ende 2026-09-17T05:12:36.881Z)
- recht-nrw-2023-12-01-lrgv-20260917T050258Z: completed, 5 verarbeitet (Ende 2026-09-17T05:02:59.871Z)
- recht-nrw-2023-12-01-lrgv-20260917T050254Z: completed, 1 verarbeitet (Ende 2026-09-17T05:02:55.277Z)
- recht-nrw-2023-12-01-lrmb-20260917T055943Z: completed, 16 verarbeitet (Ende 2026-09-17T05:59:49.134Z)
- recht-nrw-2023-12-01-lrmb-20260917T055129Z: completed, 20 verarbeitet (Ende 2026-09-17T05:51:35.345Z)
- recht-nrw-2023-12-01-lrmb-20260917T055121Z: completed, 16 verarbeitet (Ende 2026-09-17T05:51:26.274Z)
- recht-nrw-2023-12-01-lrmb-20260917T055032Z: completed, 1 verarbeitet (Ende 2026-09-17T05:50:33.544Z)
- recht-nrw-2023-12-01-lrmb-20260917T054812Z: completed, 55 verarbeitet (Ende 2026-09-17T05:50:23.450Z)
