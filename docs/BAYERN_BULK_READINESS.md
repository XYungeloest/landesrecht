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
| `imported` – heutiger Text ist der Stichtagstext (einschl. BayVwV96990 mit Quellkorrektur) | 1 570 |
| `imported` – Stichtagsfassung rückgerechnet (`reverse-amendment`, 28 einstufig, 5 mehrstufig) | 33 |
| `reconstruction-required` | 486 |
| `review` – Geltung belegt, Textbeginn nicht (BayVV_2230_7_1_K_10450) | 1 |
| `not-at-baseline` (erst nach dem Stichtag erlassen) | 239 |
| `excluded` – Tarifvertrag | 56 |
| `excluded` – bundeseinheitliche Anordnung | 14 |
| `excluded` – als Anhang der Stammnorm übernommen (BayBodSchO → EV-BodenseeSchO) | 1 |
| `review` – Geltung unbestimmt | 13 |
| **gesamt** | **2 413** |

Dazu 15 heute nicht mehr geführte Stichtagsnormen (Bereich `events`), aus amtlichen Verkündungen
wiederhergestellt (`docs/BAYWUE_BASELINE_ONLY.md`); übernommen insgesamt **1 618**.

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

- **486 `reconstruction-required`** in zehn Gruppen (`data/imports/bayernrecht/reconstruction-queue.json`):
  - Die Gruppen 1–3 (eine, zwei, drei oder mehr Änderungen) sind grundsätzlich umkehrbar. Offen bleiben dort
    72 Normen, vor allem wegen nicht lesbarer Befehlsblöcke, nicht lesbaren Inkrafttretens und nicht unterstützter
    Formeln.
  - Die Gruppen 4–10 sind nicht umkehrbar oder nicht belegt: Neufassung, Anlagen-, Tabellen- oder
    Bildersetzung, fehlender Vorgängertext (283), heute fehlender Vorgänger und widersprüchliche Belege (35).
  - Gründe je Norm: `data/audits/bayernrecht/RECONSTRUCTION.md`, maschinenlesbar
    `data/audits/bayernrecht/reconstruction-audit.json`.
- **Heute fehlende Stichtagsnormen:** 401 offen von 426 Kandidaten (15 wiederhergestellt, 5 nicht am Stichtag,
  5 nicht Landesrecht). Die meisten haben keine elektronische Ausgangsverkündung (287). Stand je Kandidat:
  `data/audits/bayernrecht/BASELINE_ONLY.md`.
- **13 Normen mit unbestimmter Stichtagsgeltung** und 1 Norm mit belegter Geltung, aber unbelegtem Textbeginn.
- **Prüffälle ohne Blockade:**
  - 5 nicht entscheidbare Eigennamen: 4× „Bayerisches Konkordat“, 1× „Zentrum Digitalisierung.Bayern“;
  - 74 Slugkollisionen, deterministisch aufgelöst;
  - offene Organzuordnungen: `data/audits/bayernrecht/INSTITUTIONS.md`.

## 3 GO/No-Go

| Gate | Stand |
| --- | --- |
| Enumeration | Fixpunkt: Rebuild beider Bereiche unverändert, zweiter Rebuild ebenso |
| Vollkorpus-Struktur | 2 342 Kandidaten geprüft, **2 342 ohne Importhindernis** (Quellkorrektur BayVwV96990 auch in der Inventur) |
| Textintegrität | `mismatch` 198 → 28 → **0**; `review` 4 → **0** (verschmolzene Fußnotenzeichen, Parser 0.2.0) |
| Überleitung | Idempotenz konstruiert; Provenienzschutz aller Blattnamen; Baden-Württemberg-Kollisionen regressionsgeschützt |
| Rückrechnung | 33 Rezepte (28 v1, 5 v2 mit Forward-Replay), Rundlauf exakt, Beginn der Stichtagsfassung belegt; Bulk prüft Rezept, Paket, jeden Beleg und Rundlauf erneut |
| Bulk | 1 603 übernommen + 15 baseline-only = 1 618; Audit ohne Abweichung, Slug-Registry = Manifest |
| Lokale D1 | 1 618 Normen, 31 691 Sucheinheiten, FTS5-Integrität |
| R2 | 3 928 Objekte unter `baywue/`: 1 603 Pakete, 1 Anhangpaket, 97 Verkündungsbelege und 263 Abbildungs-Assets, je mit Umschlag; 0 Abweichungen; West-Objekte unverändert |
| Remote-D1 | inkrementell eingespielt (94 Normen); lokal ↔ remote identisch in 11 Prüfungen, Blocksumme byte-genau |
| Suche | Vollprüfung grün: 1 618 Titel, 596 Abkürzungen, 616 Strukturadressen, 722 Nummernadressen, 0 Fehler; Golden Set 128 Anfragen (11 kuratiert: Anhang, Quellkorrektur, historische Namen, rückgerechnet, baseline-only), 0 verletzt; West + BayWü 10/10; Remote-Stichprobe 60 Fälle, 0 verletzt, 0 fremde Treffer |
| Worker | `43d211e3`; West 1 482 und BayWü 1 618 Normen ausgeliefert; Asset-Route und Teilbestand-Hinweis im Smoke-Test |
| West | Fingerabdruck identisch, 1 482 Normen, Readiness READY mit Human Approval, Remote-D1 identisch |

## 4 Nächste Schritte

Inkrementelle Runde (nach Parser-, Rezept- oder Scope-Änderungen):

```text
npm run import:bayernrecht:baseline -- --write            # nur nach Änderungen an Paketen/Register
npm run import:bayernrecht:reconstruction-queue -- --write # immer nach baseline --write
npm run import:bayernrecht:bulk -- --write                # ohne --resume, wenn sich der Parser geändert hat
npm run import:bayernrecht:restore-baseline-only -- --write --offline
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

Fachlich nächster Schritt: die 72 offenen Fälle der Gruppen 1–3 (Befehlsblöcke und Inkrafttreten lesbar
machen, Formeln `insert-unit`/`renumber` rückrechenbar), dann Neufassungen mit belegtem Alttext aus der
Vorfassung (Gruppe 8) und heute fehlende Normen mit PDF-Ausgangsverkündung mit Textlayer.
