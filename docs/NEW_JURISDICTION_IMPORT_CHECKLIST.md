# Checkliste: Import einer weiteren Jurisdiktion (NSH, BayWü)

Wiederverwendbare Arbeitsliste für den Ausgangsimport eines weiteren Landes nach dem Muster des
RECHT.NRW-Imports (West). Jeder Punkt nennt das Ergebnis, das vor dem nächsten Schritt vorliegen muss, und die
Komponente, die dafür bereits existiert (Übersicht in `ARCHITECTURE.md`, „Wiederverwendbare
Importkomponenten“). Verbindliche Regeln für alle Importer: `docs/IMPORT_ARCHITECTURE.md`; Umfang:
`docs/LEGAL_SCOPE.md`. Ost bleibt lesend (OstRecht ist externe Source of Truth).

Stand 2026-09-17: **West/NRW ist als Referenzbestand eingefroren** (`docs/WEST_REFERENCE_BASELINE.md`,
Human Approval abgeschlossen). Für **NSH** und **BayWü** ist Schritt 0 durchlaufen, mit
unterschiedlichem Ergebnis (siehe unten).

## Schritt 0: die vier Fragen vor der ersten Zeile Code

Die Erkundungen für Niedersachsen-Holstein und Bayern-Württemberg haben gezeigt, dass vier Fragen den
gesamten Adapter bestimmen. Sie stehen hier vorweg, weil eine falsche Antwort nicht teuer, sondern
tödlich ist: Für NSH war nach Frage 1 klar, dass kein Normbestand entstehen kann – nach dem Bau von
Zustandsschicht, Überleitung und Ereignisregister. In der umgekehrten Reihenfolge wäre das eine Stunde
Arbeit gewesen statt eines Tages.

| # | Frage | Wie zu beantworten | Wenn „nein" |
| --- | --- | --- | --- |
| 0.1 | **Ist automatisierter Zugriff auf das konsolidierte Portal erlaubt?** | `robots.txt` des Zielhosts **wörtlich** lesen und im Dossier zitieren. Nicht die Startseite, nicht eine Unterseite – der Host, der die Normtexte führt. | **Abbruch.** Kein Parser, kein Bulk. Die Sperre wird nicht umgangen (keine anderen User-Agents, keine Suchmaschinen-Caches, keine Browserautomation). Befund dokumentieren, alternative amtliche Quelle suchen, sonst Land zurückstellen. Muster: `docs/SCHLESWIG_HOLSTEIN_ACCESS_CONSTRAINT.md`. |
| 0.2 | **Führt das Portal historische Fassungen?** | Fassungsauswahl in der Oberfläche suchen, Portalhilfe zitieren, und – falls es einen Export gibt – prüfen, ob er mehr als eine Zeitschicht trägt. | Der Stichtag ist nur durch **Rückrechnung** erreichbar: heutiger Stand plus Änderungsverlauf, und nur für die tatsächlich geänderten Normen. Für den unveränderten Teil ist der heutige Text zugleich der Stichtagstext – das ist ein Beleg, keine Annahme. Muster: `docs/BAYERN_SOURCE_DISCOVERY.md`, Abschnitt 11.3. |
| 0.3 | **Gibt es einen maschinenlesbaren Export?** | Vor jedem HTML-Parser prüfen: XML, ZIP, JSON, CSV, offene Schnittstelle. | HTML-Parser bauen – aber erst, nachdem 0.3 wirklich verneint ist. Bayern bietet je Norm ein ZIP mit XML; wer das übersieht, baut einen Parser gegen Layout statt gegen Struktur. |
| 0.4 | **Ist die elektronische Fassung des Verkündungsblatts amtlich?** | Nutzungshinweise der Verkündungsplattform wörtlich zitieren. | Die elektronische Ausgabe ist Beleg, aber nicht die amtliche Fassung. Das gehört in die Evidenzklasse, nicht in eine Fußnote. In Bayern gilt das für das GVBl. (nichtamtlich elektronisch), **nicht** für das BayMBl. (amtlich elektronisch) – zwei Blätter desselben Landes, zwei Evidenzlagen. |

Ergebnis der beiden bisherigen Durchläufe:

| Land | 0.1 Zugriff | 0.2 Historie | 0.3 Export | 0.4 Amtlichkeit elektronisch |
| --- | --- | --- | --- | --- |
| NSH (juris SH) | **nein** – `Disallow: /` | nicht prüfbar | nicht prüfbar | GVOBl./Amtsbl. zugänglich, Verkündungstexte |
| BayWü (BAYERN.RECHT) | ja – `Allow: /` | **nein** – nur aktuelle Fassung | **ja** – ZIP/XML je Norm, zwei DTDs | GVBl. nichtamtlich, BayMBl. amtlich |

| # | Schritt | Ergebnis / Nachweis | Wiederverwendbar | Neu je Jurisdiktion |
| --- | --- | --- | --- | --- |
| 1 | **Quellportal** erkunden: Bereiche (Gesetze/Verordnungen, Verwaltungsvorschriften, Verkündungsblatt), Adressschema, Fassungslisten, Robots/Nutzungsbedingungen, Ratenverhalten | Kurzdossier in `docs/<PORTAL>_IMPORT.md`: Adressmuster, Fassungsmodell, Sperrverhalten; Beleg, dass kein Zugriffsschutz umgangen wird | Fetcher-Policy (`common/fetcher.ts`: Mindestabstand, Retry-After, Sperrabbruch, Budgets, Cache) | Adressparser (`source-identity.ts`-Pendant), Bereichsdefinition |
| 2 | **Scope** festlegen: welche Dokumenttypen werden Landesrecht der Simulation, welche nicht (Normativitätsfilter) | Abschnitt in `docs/LEGAL_SCOPE.md`; Klassifikationstabelle Portaltyp → Normtyp | Normtypen und Vokabular (`legal-core`), Normativitätsprüfung als Muster (`lrmb/classify.ts`) | Portaltyp-Zuordnung, Normativitätsregeln des Landes |
| 3 | **Stichtag**: `SIMULATION_BASELINE_DATE` gilt für alle Länder; Zeitmodell unverändert | `jurisdictions.ts` (Register: Quellportal, Verkündungsblatt); keine eigene Stichtagslogik | `SIMULATION_BASELINE_DATE`, Zeitmodell (`versions.ts`), `assertBaselineConsistency` | – |
| 4 | **Enumeration**: vollständige Liste der Stammnormen aus mindestens zwei unabhängigen Quellen (z. B. Sitemap + Suchindex) mit Abgleich | `data/imports/<system>/enumeration-<bereich>.json`, Abgleich `ok`, Invariantenprüfung grün | Enumerationsdatei, Statusmodell `pending → processing → done/review/failed/excluded`, Abgleich, Invarianten (`common/enumeration.ts`) | Quellenabruf je Portal (Sitemap-/Index-Parser), Vorklassifikation |
| 5 | **Versionierung / Stichtagsauswahl**: Fassungsliste je Stammnorm, Auswahl der am Stichtag geltenden Fassung, lokal fail-closed | Testfälle: eindeutig, Lücke, Überlappung, undatiert; Befund „unklar“ blockiert | `selectSourceVersionAtBaseline` (`common/version-selection.ts`), Geltungsstatus/Provenienz im Schema | Fassungslisten-Parser, portalspezifische Datumsformate |
| 6 | **Raw archive**: unveränderte Rohquellen mit SHA-256; Beispielkorpus versioniert (`sources/<system>/`), Bulk nur R2 mit Staging außerhalb von Git | Objektschlüssel `<jur>/<system>/<stichtag>/…`, Umschlag je Objekt, Rücklesung; Bulkmodus bricht bei Git-Pfaden ab | `common/archive.ts` (versioned-sample, r2, Staging, `uploadVerified`, Sync mit readback/etag), `common/r2-transport.ts` (wrangler Standard, s3, wrangler-api) | Präfix `<jur>/<system>` (bereits parametrisiert über `TARGET_JURISDICTION`/`SOURCE_SYSTEM` – je Importer als Konstante) |
| 7 | **Parser**: Quellformat → `SourceLaw` (Recht des Herkunftslandes, nichts transformiert), Dokumentidentität und Körperplausibilität | Beispielkorpus mit ≥ 10 Vorschriften, Integritätsprüfung fetch→parse, `document-sanity` `consistent` | Body-Blockmodell und Validierung (`legal-core/schema.ts`), Parserbausteine (`common/html.ts`, `body-common.ts`, `pdf.ts`, `document-sanity.ts`, `integrity.ts`) als Muster | HTML-/PDF-Parser des Portals, Fußnoten-, Tabellen-, Anlagenlogik |
| 8 | **Validity**: Geltung am Stichtag nur aus Belegen (Intervall `exact`, `verified-active-at-baseline`, `reconstructed`, sonst `undetermined` → Review) | Policy-Abschnitt (Muster: `docs/RECHT_NRW_BULK_READINESS.md`, „Undatierte Altdatensätze“), Tests | Provenienzfelder `sourceStatus`, Review-Kategorien, Rekonstruktion nur mit Rezept (`lrmb/reconstruction.ts` als Muster) | Belegquellen des Landes (Amtsblatt, Änderungsvermerke), Kontinuitätsregeln |
| 9 | **Transformation**: Erkennung landesbezogener Bezeichnungen → Entscheidung → Ersetzung → Prüfung nach Transformation (fail-closed); Erlassorgan nur aus ausdrücklicher Formel | Report je Norm mit Änderungen, Erkennungen, offenen Entscheidungen; keine Fundstellen/URLs/Hashes transformiert | Reportformat, Post-Transform-Audit, Institutionen-Zuordnung als Datei (`institution-mapping.json`), Overrides (`common/overrides.ts`) | Regelwerk des Landes (`transform/rules.ts`-Pendant), Institutionenregister, Abkürzungsregeln |
| 10 | **Sample corpus**: kuratierter Validierungskorpus mit Erwartungen (Status, Geltung, Textstand) | `sample --area … --offline` grün, Rohquellen unter `sources/<system>/` | Korpusdatei-Format und `sample`-Befehl | Auswahl der Fälle (Regelfall, PDF, undatiert, Staatsvertrag, Anlage fehlt, …) |
| 11 | **Coverage**: Manifest ↔ Inhalte ↔ Slug-Registry ↔ Enumeration konsistent; Review-Fälle messbar | `coverage --write`, `audit` ohne Abweichung | `common/coverage.ts`, `common/manifest.ts`, `common/slug-registry.ts`, `audit`-Befehl | Bereichsnamen, Kennzahlen je Portaltyp |
| 12 | **Review**: Review-Queue je Quelle mit Kategorien, Entscheidungen mit Begründung, Overrides mit Beleg | `review`-Befehl, Shards unter `data/imports/<system>/review/` | `common/review-queue.ts`, `review-*`-Werkzeuge, Entscheidungsformat | Kategorien, die nur dieses Portal braucht (sparsam) |
| 13 | **Bulk**: Dry-run → Stichprobe mit `--write --limit` → vollständig mit `--resume`; Budgets, Checkpoints, systemische Abbrüche | Laufzusammenfassungen unter `data/audits/<system>/runs/`, Logzeilen mit Lauf-ID/Bereich/Schlüssel/Phase/Ergebnis/Dauer | `common/bulk-runner.ts` (Auswahl, Checkpoints, Resume, Dublettenzusammenführung, systemische Limits), Stop-Controller, Readiness (`common/readiness.ts`) | `ItemProcessor` des Importers (Importpfad je Bereich) |
| 14 | **D1**: Projektion voll und inkrementell, Batches mit Basisprüfung, lokal geprüft vor Remote | `d1:plan`, `d1:apply:batches --local`, Skalierungsnachweis | `packages/runtime` (Projektion, `incremental.ts`, `sql-batches.ts`, Registry), eine Datenbank je Jurisdiktion (`bindings.ts`) | Datenbank `landesrecht-<jur>` anlegen, `database_id` in `wrangler.jsonc` |
| 15 | **R2**: Upload der gestagten Rohquellen mit Prüfung (`r2-sync`), Unveränderlichkeit | Manifeststatus `verified`, Sync-Protokoll | `r2-sync` (Transporte, readback/etag), gemeinsamer Bucket `landesrecht-quellen` | Nur das Präfix `<jur>/<system>/` |
| 16 | **Search**: Sucheinheiten aus dem Normkörper, Suchintegrität je Jurisdiktion | `search-audit --jurisdiction <jur>` grün, Golden-Set | `packages/search`, `common/search-audit.ts` | Golden-Anfragen des Landes |
| 17 | **Deployment**: Worker mit allen Bindings, Healthcheck `/health` 200, Konfigurationsfehler-Modus geprüft, Smoke gegen `/api/v1/jurisdictions` | `docs/DEPLOYMENT.md`, Redeploy nach Änderungen an `apps/web` | Worker, Middleware, Healthcheck, API | `SITE_URL`/Routes, Staging-Ressourcen mit Suffix |

## Reihenfolge und Freigaben

1. Schritte 1–3 sind Dokumentation und Entscheidung (keine Abrufe außer Stichproben).
2. Schritte 4–12 laufen lokal und offline-wiederholbar; jeder Schritt hat Tests und einen Beispielkorpus.
3. Schritt 13 erst nach `readiness` = READY und GO/No-Go-Checkliste (Muster `docs/RECHT_NRW_BULK_READINESS.md`).
4. Schritte 14–17 (Remote-D1, R2-Upload, Deployment) nur mit gesonderter Freigabe; nie aus einem Bulk-Lauf heraus.

## Erfahrungen aus dem West-Import (allgemeine Muster)

Muster, die sich im ersten Bulkimport bewährt haben. Sie sind jurisdiktionsneutral formuliert; die NRW-Belege
(`docs/RECHT_NRW_BULK_READINESS.md`, `data/audits/recht-nrw/`) dienen nur als Beispiel, nicht als Pflicht.

| Muster | Warum | Wie (Bezug zum Schritt) |
| --- | --- | --- |
| **Fixpoint-Enumeration** | Eine Enumeration ist erst belastbar, wenn ein erneuter Rebuild aus denselben Eingaben (gecachte Sitemap/Indexantworten, gespeicherte Enumeration als Vorgänger, Manifest) fachlich nichts ändert. Ändert er etwas, war der gespeicherte Stand nicht der Fixpoint der Eingaben. | Schritt 4: Enumeration offline aus dem Abrufcache neu bauen, Fingerabdruck ohne Laufmetadaten vergleichen (`readiness`: „Enumerations-Fixpoint“, Schnittstelle `checkEnumerationFixpoint(root, area)`); Eingaben-Fingerabdrücke in der Enumerationsdatei ablegen, damit „dieselben Eingaben“ prüfbar bleibt. |
| **Regeneration veralteter Bewertungen (stale)** | Jeder Manifesteintrag ist die Bewertung eines Parser-/Transformerstands – auch `excluded`, `needs-review`, `failed`, `not-at-baseline`. Steigt eine Version, sind sie neu zu bewerten, nicht nur die Importe. | Schritt 7/13: `--regenerate-stale` aus dem Cache, je Status zählen (Versionsreport); Altstände nur mit dokumentierter Legacy-Ausnahme (`legacy-exceptions.json`, Begründung, Freigabe, Textintegritätsnachweis). |
| **import-regression** | Ein Reimport mit neuerem Parser kann eine früher übernommene Norm verlieren. Das darf nie stillschweigend passieren. | Reimport ohne Import = eigener Befund (`import-regression`, blockierend); Entscheidung `deliver-legacy` (gespeicherte Fassung bleibt, Textintegrität belegt) oder `depublish` – beides dokumentiert. |
| **Parser-Residual-Report** | Nach der Transformation bleiben Reste der Quell-Landesbezeichnung (Fundstellen, amtliche Abkürzungen, Eigennamen) – teils gewollt, teils Regelwerkslücke. | Schritt 9: Reste nach Kontext klassifizieren (geschütztes Zitat, amtliche Abkürzung, Institution, Parserfehler, unklar); nur eindeutige Regeln ergänzen, nie pauschal ersetzen (Muster `scripts/audit-residuals.ts`). |
| **Evidenzstufen** | Geltung am Stichtag wird aus Belegen abgeleitet; nicht jeder Beleg trägt eine Entscheidung. | Schritt 8: Beweisklassen `strong` / `supporting` / `insufficient` / `contradictory`; nur starke Belege entscheiden allein, Widersprüche gehen in die Review. |
| **R2-Immutable-Archiv** | Rohquellen sind der Beweis; sie werden geschrieben, nie verändert. | Schritt 6/15: Objektschlüssel mit Hash, Umschlag je Objekt, `verified` erst nach Rücklesung; R2-Audit (Manifest ↔ Staging ↔ Listing, Byte-Stichprobe) als Readiness-Bedingung, „aktuell“ = nicht älter als das Manifest-Wasserzeichen. |
| **D1 Apply-State** | Große Projektionen laufen in Batches; ein Abbruch darf keinen halben Zustand hinterlassen. | Schritt 14: Batches mit Basisprüfung und persistentem Apply-State (fortsetzbar), lokal vor remote, Lokal↔Remote-Check mit Zählern und Stichproben-Fingerabdrücken. |
| **Search Golden Set** | Suchqualität ist nur mit festen Sollanfragen messbar. | Schritt 16: kuratierte Anfragen mit erwartetem Treffer (Recall@10, MRR, Top-1) je Match-Modus; Fehlschläge blockieren, ein älterer Stand ist ein Hinweis. |
| **Full-/Fast-Audit** | Ein vollständiges Suchaudit dauert Minuten; für Zwischenstände genügt eine deterministische Stichprobe. | `--mode fast` (Seed, Stichprobe) im Alltag, `--mode full --write` vor der Freigabe; Readiness akzeptiert nur den Full-Report mit `writtenAt` ≥ Manifest-Wasserzeichen. |
| **Review-Prioritäten und Arbeitslisten** | Tausende Befunde sind nicht Tausende Normen; gezählt und gruppiert wird, entschieden nie automatisch. | Schritt 12: Auswertung je Stammnorm (Blocker vs. nichtblockierend), Gruppierung nach Kategorie/Muster, priorisierte Arbeitslisten; Readiness prüft nur die Konsistenz Manifest ↔ Queue, nie den Bestand offener Fälle. |
| **Deterministische Aktualität** | „Aktuell“ darf nicht von der Uhrzeit des Aufrufs abhängen. | Alle Audit-Reports tragen Zeitstempel und Zählfingerabdrücke; Readiness vergleicht gegen das Manifest-Wasserzeichen (jüngster `importedAt`) und die Bestandszahlen. |
| **Referenzbaseline** | Vor der Freigabe wird ein Stand eingefroren und beschrieben (Versionen, Kennzahlen, Auditstatus, Einschränkungen). | Vorlage `docs/WEST_REFERENCE_BASELINE.md`; Readiness verlangt die Datei mit Kennzahlen-Abschnitt und meldet offene Platzhalter. |

## Was nicht vorschnell abstrahiert wird

Code wird erst dann in `packages/importers/common` gehoben, wenn (a) die Semantik identisch ist, (b) mindestens zwei
Importer sie brauchen und (c) die Abstraktion den Code vereinfacht. Bis dahin gilt: Muster kopieren, Portal-
spezifisches klar benennen (`docs/IMPORT_ARCHITECTURE.md`). Die Tabelle in `ARCHITECTURE.md` hält fest, was heute
bereits jurisdiktionsneutral ist und was NRW-spezifisch bleibt.
