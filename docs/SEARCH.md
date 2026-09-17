# Suche: Plan, Match-Modi, Audit und Golden Query Set

Die Suche arbeitet auf dem FTS5-Index `law_search` (externer Inhalt `law_search_units`, eine Zeile je Sucheinheit;
Titel, Kurztitel und Abkürzung stehen an **jeder** Einheit der Norm, Spaltenvertrag in
`packages/search/src/schema.ts`). Der Abfrageplan (`packages/search/src/query.ts`) ist reine Daten; der D1-Store
(`packages/runtime/src/d1-store.ts`) übersetzt ihn in SQL, der Dateistore bewertet im Speicher
(`packages/search/src/ranking.ts`). Beide liefern dieselben Treffer und Trefferarten (Tests
`tests/unit/search-match-mode.test.ts`, `search-ranking.test.ts`).

## Match-Modi

| Modus | MATCH-Ausdruck | AND auf Normebene | Präfixe |
|---|---|---|---|
| `or-prefix` | `("log"* OR "loeg"*) OR ("west"*)` – großzügiges OR für Kandidaten und bm25-Rang | je Wort eine Unterabfrage (`IN (SELECT … MATCH 'wort*')`) | jedes Wort |
| `and-first` | `("log" OR "loeg") AND ("west")` – alle Wörter in derselben Einheit | entfällt (der Ausdruck erzwingt alle Wörter) | nur implizit am letzten Wort (Tippvervollständigung) und wo `*` steht |

Standard: `DEFAULT_SEARCH_MATCH_MODE` in `query.ts`; pro Anfrage über `SearchState.matchMode` bzw. den
URL-Parameter `match=or-prefix|and-first` von `/api/v1/search` und `/suche` wählbar (fail-safe: unbekannte Werte
nutzen den Standard).

Präfixpolitik von `and-first` (`applyPrefixPolicy`, `qualifiesForImplicitPrefix`): das letzte Wort wird zum
Präfix, wenn es normalisiert mindestens vier Zeichen lang ist, keine Zahl ist und nicht in
`NO_IMPLICIT_PREFIX_TOKENS` steht (Funktionswörter wie „über“, „des“, „oder“ und der Landeszusatz „West“, der in
über 23 000 Einheiten vorkommt). Frühere Wörter bleiben exakt. Ein vom Nutzer gesetztes `*` gilt immer.

Rückfall: Liefert der strenge Ausdruck keine Kandidaten (Wörter aus verschiedenen Einheiten wie „Schulpflicht
Gymnasium“, Präfixe auf früheren Wörtern wie „Schulg Westdeutschland“), führt der Store den `or-prefix`-Plan aus.
Bei Titeln mit Strukturangaben („… zu § 74 Absatz 4 …“) wird zuvor die entspannte Titelsuche ohne Adressfilter
versucht (`titleCarriesReferences`). Nulltreffer bleiben leer.

Schreibvarianten (`buildSearchVariants`): normalisiert (ß→ss, Diakritika entfernt), mit erhaltenem ß, mit
ae/oe/ue-Transliteration sowie – bei Eingaben mit ae/oe/ue oder ss – die Rückübersetzung („Buergerentscheid“ →
„burgerentscheid“, „Bussgeld“ → „bußgeld“, weil der FTS5-Tokenizer `unicode61 remove_diacritics 2` ß nicht faltet).

## Kandidaten, Rang und Seite (D1-Store)

1. Kandidatenabfrage: `law_search MATCH ? AND rank MATCH bm25(…)` mit Join über `rowid` auf `law_search_units`
   (FTS5 mit externem Inhalt lädt für UNINDEXED-Spalten sonst jede Trefferzeile samt `body`; der Umweg über den
   Schlüssel ist 2–3× schneller), Gruppierung je Fassung, Sortierung `identity_hit DESC, current DESC, best`.
2. Gesamtzahl: im Plan `and-first` über den MATCH-Ausdruck (nur wenn Kandidaten vorliegen); im Plan `or-prefix`
   ohne treibenden MATCH allein über die AND-Unterabfragen je Wort (die Menge ist dadurch vollständig bestimmt;
   ergibt sie 0, entfällt die Kandidatenabfrage – Nulltreffer kosten wenige Millisekunden).
3. Titelkandidaten: ein titelbeschränkter AND-Ausdruck (`buildFtsTitleMatch`) ergänzt Fassungen, deren
   Bezeichnung alle Wörter trägt; bm25 über Einheiten würde sonst Normen mit vielen Nennungen im Text vorziehen.
4. Bewertung im Speicher (`evaluateDocument`) und Sortierung der Seite nach Trefferart
   (`sortPageByMatchKind`): Bezeichnung (exakte Schreibung vor normalisierter, Abkürzung vor Titel) → Adresse mit
   Titel (Bezeichnung der Anfrage ohne Adresse exakt → normalisiert → Titel) → Titel → Adresse ohne Titel;
   Treffer im Text behalten die bm25-Reihenfolge. Gilt nur für `sort=relevance`.
5. Identitäts-Nachsuche (exakter Titel/Kurztitel/Abkürzung jenseits der Kandidatenseite) nur, wenn die
   SQL-Seite voll war; sonst liegt jede passende Fassung bereits darauf.
6. Einheiten je Treffer in einer Sammelabfrage (`row_number() OVER (PARTITION BY norm, version ORDER BY rank)`),
   ebenfalls über `rowid` gejoint.

Messung (lokale SQLite-Projektion des West-Bestands, 1 423 Normen, 26 415 Einheiten; Datei `data/audits/recht-nrw/search/golden-results.md`):

| Anfrage | vorher (or-prefix, alte SQL) | or-prefix (neue SQL) | and-first |
|---|---|---|---|
| „Verfassung für das Land Westdeutschland“ (Kandidaten + Zählung) | 139 + 148 ms | 73 + 44 ms | 1,9 + 0,8 ms |
| „LÖG West“ | 61 + 58 ms | 22 + 7 ms | 2,7 + 1,3 ms |
| 20-Wort-Titel mit „§ 5 Absatz 3“ | 401 + 357 ms | 169 + 131 ms | 1,3 + 0,2 ms |
| Golden Set p50 / p95 / max (94 Anfragen) | – | 105 / 419 / 972 ms | 7 / 46 / 85 ms |

Remote (D1) skaliert mit den gelesenen Zeilen; die Zahlen dort sind nach dem Worker-Redeploy zu messen
(`search-audit --remote-sample <url>`).

## Such-Audit (`npm run import:recht-nrw:search-audit -- …`)

Projiziert den Bestand wie in Produktion (je Jurisdiktion eine In-Memory-SQLite), prüft je Norm Titel,
Abkürzung, länderübergreifende Suche, Typfilter (eigener Typ findet, fremde Familie nicht), Jurisdiktionsgrenze,
§-/Artikel- und Nummernadresse; global Fixtures, Dubletten, FTS5-Integrität. Das Profil zählt Suchen und
SQL-Abfragen je Prüfung, Zeit je Norm, die langsamsten Normen und Top-1-Quoten (exakter Titel / eindeutige
Abkürzung als erster Treffer).

| Option | Bedeutung |
|---|---|
| `--mode fast` | deterministische, geschichtete Stichprobe (Standard 150 Normen): je Normtyp, Abkürzung, Sonderzeichen/Umlaute, §-, Artikel-, Nummernadresse, sehr große und sehr kleine Normen, lange Titel |
| `--mode full` | alle Normen (Standard) |
| `--sample n` | Stichprobengröße (überschreibt den Modus-Standard) |
| `--seed s` | Seed der Stichprobe (Standard `landesrecht`); gleicher Seed + gleicher Bestand = gleiche Auswahl (FNV-1a über Seed und Slug) |
| `--limit n`, `--only a,b`, `--category <normtyp>` | Begrenzung nach Auswahl; `verwaltungsvorschrift` umfasst die ganze Familie |
| `--workers n` | parallele Worker (worker_threads, je eigene Projektion). Gemessen: **nicht lohnend** – node:sqlite serialisiert, 4 Worker waren bei 400 Normen langsamer (56 s statt 38 s, hohe Systemzeit). Standard 1 |
| `--match or-prefix\|and-first` | Match-Modus der Prüfungen (Standard: Produktionsstandard) |
| `--json`, `--write` | JSON-Ausgabe; `--write` schreibt `data/audits/recht-nrw/search/search-audit-<mode>.json` |

Laufzeiten (lokal, 1 Worker, vollständige Projektion je Lauf ≈ 3 s):

| Lauf | vorher | or-prefix (neue SQL) | and-first |
|---|---|---|---|
| 100 Normen (`--limit 100`) | 360 s (≈ 32 Abfragen, 3,6 s je Norm) | 51 s (473 ms je Norm) | 11 s (76 ms je Norm) |
| Fast Audit (150 Normen) | – | 100 s | 17 s; mit Titelkandidaten und Seitensortierung 26 s (146 ms, 37 Abfragen je Norm) |
| 400 Normen (`--sample 400`) | – | ≈ 190 s | 38 s |
| Full Audit (1 423 Normen), hochgerechnet | > 1 h (abgebrochen) | ≈ 12–15 min | ≈ 3,5–4 min |

Ergebnis des letzten Fast Audits: `data/audits/recht-nrw/search/search-audit-fast.json` (alle Prüfungen bestanden,
Top-1 exakter Titel 127/127, Abkürzung 53/53).

Full Audit: `npm run import:recht-nrw:search-audit -- --mode full --write` (Match-Modus explizit: `--match and-first`).

## Golden Query Set

`data/audits/recht-nrw/search/golden-queries.json` (94 Anfragen, erzeugt mit `generateGoldenQueries` aus dem
Bestand, danach von Hand pflegbar): exakte Titel (Gesetze, Verordnungen, Verwaltungsvorschriften, lange Titel),
Teiltitel, Abkürzungen (auch klein geschrieben, „LÖG West“, „DVO KiBiz“), §-/Artikel-/Nummernadressen mit
erwartetem Sprungziel, häufige Wörter („West“, „Gesetz“), Umlautvarianten (ae/oe/ue und a/o/u), Tippfehler
(Wunsch, keine Fuzzy-Suche), ähnliche Titel, Bundesrechtsreferenzen (Ausführungsgesetze), Nulltreffer.
Felder: `query`, `expectedTop` (erster Treffer), `acceptable` (unter den ersten 10), `expectedAnchor`,
`expectTotal`, `expectHits`, `niceToHave`.

`search-audit --golden [--match …] [--write]` wertet beide Modi lokal aus (Recall@10, MRR, Top-1, Sprungziel,
Nulltreffer, Latenz p50/p95/max) und schreibt `golden-results.json` und `golden-results.md`. Fehlt die Datei, wird
sie aus dem Bestand erzeugt (`--write` schreibt sie).

`search-audit --remote-sample <url> [--write]` prüft mindestens 50 deterministische Fälle des Golden Sets
(gleichmäßig über die Kategorien) gegen `<url>/api/v1/search?q=…&jurisdiction=west` und schreibt
`remote-sample-results.json`. Läuft nur auf ausdrücklichen Wunsch, nie automatisch.

## Entscheidung zum Standardmodus

Siehe `golden-results.md`: beide Modi liefern auf dem Golden Set dieselbe Qualität (Recall@10 94,1 % – die
fehlenden 5,9 % sind die fünf Tippfehler-Fälle ohne Fuzzy-Suche –, MRR 0,933, Top-1 100 %, Sprungziele 100 %,
keine verletzte Erwartung), `and-first` ist um den Faktor 10–15 schneller (p50 7 ms statt 105 ms) und liefert
kleinere, präzisere Trefferlisten (z. B. „LÖG West“ 19 statt 67 Treffer). Der Such-Audit findet in beiden Modi
alle Normen (Fast Audit und 400er-Stichprobe ohne Fehler). Deshalb ist `and-first` Standard; `or-prefix` bleibt
als Rückfall im Store und über `match=or-prefix` wählbar.

Bekannte Divergenz im Plan `or-prefix`: SQL setzt Präfixe auf alle Wörter, die Bewertung im Speicher verlangt
ganze Wörter – angefangene Wörter („Schulg Westd“) erscheinen dort als Volltexttreffer, im Dateistore nicht.
`and-first` ist in dieser Hinsicht konsistent (Präfix nur am letzten Wort, in SQL und Bewertung).

## Wartung

- Änderungen an `d1-store.ts` oder `query.ts`/`ranking.ts` verändern die Suchsemantik des Workers: nach
  Änderungen **Worker neu deployen** (die D1-Daten bleiben unverändert; kein Schema- oder Projektionslauf nötig).
- Tests: `npm run test:search` (search-*.test.ts), `tests/unit/recht-nrw-search-audit.test.ts`,
  `tests/unit/d1-scale.test.ts` (2 000 synthetische Normen, beide Modi).
