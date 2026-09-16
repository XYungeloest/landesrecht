# Coverage RECHT.NRW → Land Westdeutschland

Stichtag 2023-12-01. Erzeugt mit `npm run import:recht-nrw:coverage -- --write`. Anteile beziehen sich auf die Basis des Bereichs; offene und nicht verarbeitete Fälle sind ausgewiesen.

## LRGV (Gesetze, Rechtsverordnungen)

Umfang: Bulk (Enumeration) · Basis: enumerierte Stammnorm-Kandidaten (Enumeration; Dubletten werden im Bulk-Lauf zusammengeführt) = 2771

| Kennzahl | Anzahl | Anteil |
| --- | ---: | ---: |
| Enumerierte Stammnormen (Basis) | 2771 | 100,0 % |
| Verarbeitet (Manifesteintrag) | 12 | 0,4 % |
| Noch nicht verarbeitet | 2771 | 100,0 % |
| Am Stichtag geltend | 12 | 0,4 % |
| Am Stichtag nicht geltend | 0 | 0,0 % |
| Übernommen | 12 | 0,4 % |
| davon mit Warnungen | 12 | 0,4 % |
| Review | 0 | 0,0 % |
| Fehlgeschlagen | 0 | 0,0 % |
| Stichtagsfassung nicht darstellbar | 0 | 0,0 % |
| PDF-Anlagen (Review, nicht blockierend) | 0 | 0,0 % |
| Konflikt der Stichtagsauswahl | 0 | 0,0 % |
| Ausgeschlossen | 0 | 0,0 % |
| Zustimmungsgesetze | 0 | 0,0 % |
| Bekanntmachungen (Evidenzquellen, keine Normen) | 571 | 20,6 % |

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
| Einträge | 3342 |
| aufgelöste Term-IDs | 12 |
| Vorklassifikation Review | 5 |
| ohne Seitenabruf ausgeschlossen | 0 |
| Adressen ohne Eintrag | 0 |
| Adressen mehrfach zugeordnet | 0 |
| Term-Konflikte | 0 |
| Manifest ohne Enumeration | 0 |
| Verarbeitet ohne Manifest | 0 |

Abgleich: ok

Veraltete Importe (Parser/Transformer): 0

## LRMB (Verwaltungsvorschriften)

Umfang: Bulk (Enumeration) · Basis: enumerierte Stammnorm-Kandidaten (Enumeration; Dubletten werden im Bulk-Lauf zusammengeführt) = 5974

| Kennzahl | Anzahl | Anteil |
| --- | ---: | ---: |
| Enumerierte Stammnormen (Basis) | 5974 | 100,0 % |
| Verarbeitet (Manifesteintrag) | 15 | 0,3 % |
| Noch nicht verarbeitet | 5827 | 97,5 % |
| Voraussichtlich normativ | 3580 | 59,9 % |
| Ausgeschlossen | 147 | 2,5 % |
| Review Normativität | 1 | 0,0 % |
| Am Stichtag geltend | 9 | 0,2 % |
| Am Stichtag nicht geltend | 2 | 0,0 % |
| Geltung unbestimmt | 3 | 0,1 % |
| Direkt übernommen | 7 | 0,1 % |
| Rekonstruiert übernommen | 1 | 0,0 % |
| Rekonstruktion erforderlich | 1 | 0,0 % |
| Regelungsgehalt nur als PDF oder Anlage fehlt | 2 | 0,0 % |
| Übernommen mit PDF-Anlage ohne strukturierten Text | 2 | 0,0 % |
| Historische Lücke (undatiert, ohne Beleg) | 1 | 0,0 % |
| Dokumentidentität prüfen | 0 | 0,0 % |
| Fehlgeschlagen | 0 | 0,0 % |

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

Offen: 89 (blockierend 34, 26 Quellen)

| Kategorie | offen |
| --- | ---: |
| attachment | 34 |
| historical-gap | 1 |
| institution-mapping | 47 |
| metadata-conflict | 2 |
| normativity | 1 |
| reconstruction-uncertain | 1 |
| unknown-structure | 3 |

Status aller Fälle: open 89, superseded 10

## Institutionen

Offene Bezeichnungen ohne Entsprechung: 178 (authority 31, enacting-body 9, geography 15, institution 4, jurisdiction-name 5, ministry 55, municipality 46, public-body 1, regional-body 12); Erlassorgan ohne Simulationsorgan: 9; Zuordnungseinträge: safe-transform 3, review 16.

## Rohquellen, Rekonstruktion, Qualität

- Archivstatus der Rohquellen: versioned 53
- Rekonstruktion: erforderlich 1, rekonstruiert 1, Rezepte 1, unsicher 1
- Integritätsfehler 0, Prüfung nach Transformation fehlgeschlagen 0, manuelle Entscheidungen 169, fehlgeschlagene Importe 0, Dokumentidentität Widerspruch 0 / Review 0

## Letzte Läufe

- keine
