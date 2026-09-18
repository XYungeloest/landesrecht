# Bereitschaft und Stand des BayWü-Ausgangsimports

**Stand 2026-09-18 · Readiness: READY · Bulk ausgeführt · 1 582 Normen deployed (13 davon rückgerechnet)**

Gegenstück zu `docs/RECHT_NRW_BULK_READINESS.md` (West) und
`docs/SCHLESWIG_HOLSTEIN_BULK_READINESS.md` (NSH, gesperrt).

Der Stichtagsbestand ist **nicht vollständig**, und das ist kein Mangel, sondern der ehrliche Stand:
Übernommen ist genau das, wofür der heutige Text belegt der Stichtagstext ist (1 569), und die 13 Normen,
deren Stichtagsfassung durch Rücknahme der einzigen späteren Änderung bewiesen zurückgerechnet ist. 506
Normen galten am Stichtag mit einem anderen Wortlaut; ihre Stichtagsfassung ist nicht sicher belegt
(`data/audits/bayernrecht/RECONSTRUCTION.md`), und sie wird **nicht** durch den heutigen Text ersetzt.

## 1 Was steht

### Die drei früheren Blocker – entschieden

| Blocker | Entscheidung | Beleg |
| --- | --- | --- |
| 11 ungeklärte Dokumente der Abdeckungslücke | einzeln geprüft: 10 aufgenommen, 1 Prüffall | `data/audits/bayernrecht/SCOPE_RESOLUTION.md` |
| Scope: Tarifverträge, bundeseinheitliche Anordnungen, Abbildungen | Nutzerentscheidung 2026-09-18 | `docs/LEGAL_SCOPE.md` |
| Bestehende D1 `landesrecht-baywue` | behalten, als Produktiv-D1 genutzt | `apps/web/wrangler.jsonc` |

Eine frühere Fassung dieses Dokuments behauptete, für BayWü sei keine Cloudflare-Ressource angelegt.
Das war falsch: Die D1 besteht seit 2026-09-16. Vor dem ersten Schreibzugriff stand sie leer
(`num_tables: 0`), ihre Kennung stimmte mit `wrangler.jsonc` überein.

### Jedes enumerierte Dokument hat einen Endstatus

Von 2 413 enumerierten Dokumenten ist **keines** ohne erklärten Endstatus:

| Endstatus | Zahl |
| --- | ---: |
| `imported` – heutiger Text ist der Stichtagstext | 1 569 |
| `imported` – Stichtagsfassung rückgerechnet (`reverse-amendment`) | 13 |
| `reconstruction-required` | 506 |
| `not-at-baseline` (erst nach dem Stichtag erlassen) | 239 |
| `excluded` – Tarifvertrag | 56 |
| `excluded` – bundeseinheitliche Anordnung | 14 |
| `review` – Geltung unbestimmt | 14 |
| `review` – Quelltippfehler („Bayerischne“, BayVwV96990) | 1 |
| `review` – Anhang einer anderen Norm (Bodensee-SchO) | 1 |
| **gesamt** | **2 413** |

### Befunde, die der Bulk sonst verfehlt hätte

Jeder davon überlebte die Tests seines eigenen Bausteins und zeigte sich erst im ganzen Weg:

1. **Zusammengesetzte Eigennamen als Defekt gemeldet.** `BayernLabo`, `BayernPortal`, `Bayernhymne`
   fasst die Überleitung richtig nicht an – die Nachprüfung meldete sie trotzdem. 58 Normen.
2. **Fußnoten des Titelblocks verworfen.** Bei Staatsverträgen die Ratifikationsliste aller Länder.
   179 Normen mit Textverlust.
3. **Kurze Tabellenzeilen nicht aufgefüllt.** Die ganze Norm fiel aus dem Bestand, wegen einer leeren
   Zelle, die die Quelle selbst leer darstellt. 12 Normen.
4. **Eine Norm mit 758 Beilagen sprengte die D1-Grenze** (431 KB gegen 100 KB je Anweisung). Jetzt als
   `INSERT` plus anhängende `UPDATE`s geschrieben – für Remote-Batches und lokalen Seed; greift nur
   oberhalb der Grenze, West bleibt unberührt. Remote nachgeprüft: 431 608 Zeichen, exakt.
5. **Der Bulk prüfte die Textintegrität nicht.** Nur die Inventur tat es; 15 dort als `mismatch` gemeldete
   Normen waren übernommen. Jetzt rufen beide `assessTextIntegrity`; `mismatch` sperrt. Die Ursachen –
   verklebte Wörter an leeren Hochstellungen, Fußnotenaufrufen ohne Zeichen und `<br/>` in Überschriften,
   verlorene Fußnoten an Absatz- und Gliederungsnummern (darunter ein Nichtigkeitsvermerk des BayVerfGH),
   ein ganzer Anlagenkörper als Label – sind im Parser behoben: `mismatch` 28 → 0, `review` 182 → 4.
6. **Die inkrementelle D1-Projektion übersah codebedingte Suchänderungen** (unverändert hieß: gleicher
   Datensatz). Die BayRS-Nummer als suchbares Metadatum wäre remote nie angekommen. Jetzt zählen Datensatz
   **und** Sucheinheiten; West bleibt noop.
7. **Eine Heuristik über historische Geltung in der Rückrechnung** (vorangehende Änderung „lange genug“ vor
   dem Stichtag) – ersetzt durch den belegten Beginn der Stichtagsfassung aus der Verkündung der
   vorangehenden Änderung (Kalenderdatum, Identitätsprüfung, archiviert in R2).

8. **Mehrzeilige Titel abgeschnitten.** Aus `<titelangaben>` wurde nur die erste Zeile Titel („Verordnung,“,
   „Staatsvertrag“), Fußnotenzeichen blieben am Titel („Biersteuer1)“). Jetzt werden Zeilen angefügt, wo der Satz
   erkennbar weiterläuft; Abkürzungs- und Datumszeilen nie. 20 Titel korrigiert, Warnungen 53 → 7 (VwV-Untertitel).
9. **R2-Umschläge hingen am Parser-Titel.** Nach der Titelkorrektur wichen 31 archivierte Umschläge ab. Umschläge sind
   jetzt über ihre Kernfelder unveränderlich; der archivierte Stand bleibt.
10. **Herrschernamen** („Königs Ludwig von Bayern“) wurden übergeleitet – nach Nutzerentscheidung jetzt geschützt.

Vollständige Liste mit Belegen: Abschlussbericht des Laufs, Abschnitt D.

## 2 Was fehlt

- **506 `reconstruction-required`** – die eigentliche historische Arbeit. Von 239 Normen mit genau einem
  stark belegten Änderungsschritt sind 13 bewiesen zurückgerechnet; die übrigen scheitern an
  nicht rückrechenbaren Formeln (Neufassungen, Aufhebungen, strukturelle Befehle), unlesbaren Befehlen oder
  einer nicht belegbaren Kette. 280 Normen haben mehrere Änderungsschritte. Stand und Gründe je Norm:
  `data/audits/bayernrecht/RECONSTRUCTION.md`, Schlange `data/imports/bayernrecht/reconstruction-queue.json`.
- **Heute fehlende Stichtagsnormen**: 436 Aufhebungen/Außerkrafttreten nach dem Stichtag belegt das
  Ereignisregister (407 stark zugeordnet); ihre Vorgänger stehen nicht mehr im Portal und sind nicht
  wiederhergestellt.
- **14 Normen mit unbestimmter Stichtagsgeltung** (8 ohne Ausfertigungsdatum, 6 ohne Registereintrag).
- **2 Prüffälle**: Bodensee-SchO (eigene Norm oder Anhang), BayVwV96990 (Quell-Tippfehler „Bayerischne“
  im Kurztitel – eine stille Korrektur wäre erfundener Text).
- **Kennzeichnung „Teilbestand“ in der Oberfläche** – Darstellungsentscheidung, offen.

## 3 GO/No-Go

| Gate | Stand |
| --- | --- |
| Enumeration | Fixpunkt: Rebuild beider Bereiche unverändert, zweiter Rebuild ebenso |
| Vollkorpus-Struktur | 2 342 Kandidaten geprüft, 2 341 ohne Importhindernis (1 Überleitungsfall); ≈ 26 Dokumente/s, 751 MB Spitze (`data/audits/bayernrecht/PERFORMANCE.md`) |
| Textintegrität | `mismatch` 198 → 28 → **0**; `review` 4 (je ein unerklärtes Zahlwort, sichtbar) |
| Überleitung | Idempotenz konstruiert; Provenienzschutz aller Blattnamen; Baden-Württemberg-Kollisionen regressionsgeschützt |
| Rückrechnung | 13 Rezepte, Rundlauf exakt, Beginn der Stichtagsfassung belegt; Bulk prüft Rezept, Paket, Belege und Rundlauf erneut |
| Bulk | 1 582 übernommen, Audit ohne Abweichung, Slug-Registry = Manifest |
| Lokale D1 | 1 582 Normen, 30 821 Sucheinheiten, FTS5-Integrität |
| R2 | 3 212 Objekte unter `baywue/` (1 582 Pakete + 24 Verkündungsbelege, je mit Umschlag), 0 Abweichungen; West-Objekte unverändert |
| Remote-D1 | inkrementell eingespielt; lokal ↔ remote identisch in 11 Prüfungen, Blocksumme byte-genau |
| Suche | Vollprüfung grün: 1 582 Titel, 570 Abkürzungen, 598 Strukturadressen, 707 Nummernadressen, 0 Fehler; Golden Set 117 Anfragen (6 rückgerechnete Normen), 0 verletzt; West + BayWü 10/10; Remote-Stichprobe 60 Fälle, 0 verletzt, 0 fremde Treffer |
| Worker | `cf8c773d`; West 1 482 und BayWü 1 582 Normen ausgeliefert |
| West | Fingerabdruck identisch, 1 482 Normen, Readiness READY mit Human Approval, Remote-D1 identisch |

## 4 Nächste Schritte

Inkrementelle Runde (nach Parser-, Rezept- oder Scope-Änderungen):

```text
npm run import:bayernrecht:baseline -- --write            # nur nach Änderungen an Paketen/Register
npm run import:bayernrecht:reconstruction-queue -- --write # immer nach baseline --write
npm run import:bayernrecht:bulk -- --write                # ohne --resume, wenn sich der Parser geändert hat
npm run import:bayernrecht:enumerate -- --area landesrecht --offline --write
npm run import:bayernrecht:enumerate -- --area vwv --offline --write
npm run import:bayernrecht:inventory -- --write
npm run import:bayernrecht:coverage -- --write
npm run test && npm run import:bayernrecht:readiness
npm run import:bayernrecht:r2-sync -- --write --r2-transport wrangler-api --concurrency 32 --verify etag
npm run d1:plan -- --jurisdiction baywue --incremental
node scripts/d1-apply-batches.ts --database landesrecht-baywue --execute --confirm-remote landesrecht-baywue
npm run d1:seed:dev -- --jurisdiction baywue
node scripts/d1-remote-check.ts --database landesrecht-baywue --sample 30 --write
npm run build && npm run deploy
npm run import:bayernrecht:search-audit -- --sample 0 --write
npm run import:bayernrecht:search-audit -- --remote-sample https://landesrecht.xyungeloestlp.workers.dev --write
```

Ein erneuter Bulk-Lauf mit `--write` leert die R2-Archivfelder im Manifest; der anschließende
`r2-sync` stellt sie wieder her, ohne etwas neu hochzuladen. `baseline --write` überschreibt die
Rückrechnungsentscheidungen in `baseline.json` – deshalb danach immer `reconstruction-queue --write`.

Fachlich nächster Schritt: weitere Belege für die 506 – zuerst die Mehrschrittketten, deren Einzelschritte
alle rückrechenbare Formeln tragen, und die Wiederherstellung der heute fehlenden Stichtagsnormen aus ihren
Stammfassungen.
