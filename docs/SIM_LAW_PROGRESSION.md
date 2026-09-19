# Simulationsrechtsfortschreibung (Architektur und Inventur)

Stand der Erhebung: 2026-09-19. Dieses Dokument beschreibt, wie West, NSH und BayWü vom realen
Ausgangsrechtsstand zum heutigen Simulationsrechtsstand fortgeschrieben werden können:

```text
reale Baseline (2023-12-01) → Sim-Rechtsakte → Fassungen → heutiger Sim-Rechtsstand
```

Es ist eine Architektur- und Bestandsaufnahme. Es ändert kein Schema, keinen Code und keinen Bestand,
es löst keinen Import aus und berührt kein Cloudflare. OstRecht (`../staatsregierung`) wurde nur gelesen.
Aussagen über OstRecht stützen sich auf die unten genannten Dateien; wo etwas dort fehlt oder unklar ist,
steht das ausdrücklich dabei.

Verwendete Kurzformen: **Baseline-Fassung** = `content/norms/<j>/<slug>/versions/2023-12-01.json`;
**Sim-Fassung** = jede Fassung, die durch einen Rechtsakt der Simulation entsteht; **Sim-Akt** = Gesetz,
Verordnung oder Verwaltungsvorschrift, die in einem Verkündungsblatt der Simulation erscheint.

---

## 1 Analyse des Ost-Modells

### 1.1 Bestand und Ablageorte

| Artefakt | Ort in `../staatsregierung` | Befund (gezählt am 2026-09-19) |
| --- | --- | --- |
| Normen | `content/normen/<slug>/{meta.json,history.json,versions/*.json}` | 5 212 Normordner, 5 310 Fassungsdateien; 5 010 mit REVOSax-Herkunft, 202 eigene ostdeutsche Normen (davon 64 `aenderungsvorschrift`, 45 `gesetz`, 40 `verwaltungsvorschrift`, 23 `verordnung`, …); 61 Normen mit mehr als einer Fassung (47 übernommene, 14 eigene) |
| Verkündungen | `content/verkuendungen/<slug>.json` | 149 Ausgaben (u. a. 79 × `ogvbl-2026-*`, 44 × `stanzo-2026-*`, 10 × `oabl-2025-*`, 5 × `overtrbl-2026-*`) |
| Primärquellen der Sim-Akte | `Gesetze/*.html` (strukturtragend), `Gesetze/*.pdf` (visuelle Kontrolle), vereinzelt `.md` | u. a. 211 Dateien „OGVBl. 2026 …“, 76 „StAnzO. 2026 …“ |
| Änderungsrezepte | `data/recht/amendments/<änderungsakt>/<zielnorm>.json` | 95 Rezeptdateien in 48 Aktverzeichnissen |
| Berichtigungsrezepte | `data/recht/corrections/<berichtigung>/*.json` | 1 Berichtigungsakt, 10 Rezepte |
| Konsolidierungsquellen | `data/recht/consolidation-sources.json` | `baselineSnapshotDate: 2023-11-01`, 69 `targets`, `blockedTargets` mit Sperrgrund |
| Konsolidierungsnachweis | `data/recht/consolidation-manifest.json`, `consolidation-report.md` | 70 erkannte Änderungsvorschriften, 95 Zielnormen, 93 vollständig, 2 gesperrt (`blocked-source-conflict`) |
| REVOSax-Ausgangsbelege | `data/recht/sources/revosax/<zielnorm>/<fassung>.html`, `data/recht/revosax-baseline-2023-11-01.json` | unveränderte Snapshots mit SHA-256 |
| Schema | `packages/shared/src/lib/norms/schema.ts` | `NormMeta`, `NormVersion`, `NormHistory`, `NormSourceReference` |
| Verkündungsmodell | `packages/shared/src/lib/norms/publications.ts` | `Verkuendung`, `VerkuendungEntry`, `PUBLICATION_ENTRY_TYPES` |
| D1 | `data/recht/d1/0001…0008_*.sql`, `scripts/sync-recht-d1.mjs` | u. a. `law_versions`, `law_publications`, `law_norm_derived`, `law_search_units` |

**Wichtig: OstRecht hat einen anderen Stichtag.** Ausgangsfassungen übernommener Normen tragen
`versionId`/`validFrom` `2023-11-01` (`data/recht/consolidation-sources.json` → `baselineSnapshotDate`,
`packages/shared/src/lib/norms/origin.ts` → `LEGAL_BASELINE_DATE = '2023-11-01'`, `docs/NORM_WORKFLOW.md`
Schritt 4). Landesrecht verlangt `SIMULATION_BASELINE_DATE = 2023-12-01`
(`packages/legal-core/src/config/jurisdictions.ts`). Siehe Risiko R1.

### 1.2 Neue Sim-Gesetze

Ein eigener Rechtsakt ist eine gewöhnliche Norm unter `content/normen/<slug>/`. Er entsteht über
`npm run norms:workflow -- --file "Gesetze/OGVBl. 2026 Nr. 60.html" --write` (`docs/NORM_WORKFLOW.md`) aus der
amtlichen HTML-Ausgabe (Parser `scripts/lib/norm-html-parser.mjs`, Vertrag `scripts/lib/norm-parser-contract.mjs`,
Importer `scripts/import-normen.mjs`). Kennzeichen (Beispiel
`content/normen/erstes-gesetz-zur-anderung-des-verwaltungskostengesetzes/`):

- `meta.initialCitation` nennt das eigene Blatt („Gesetz vom 27. Januar 2026 (OGVBl. 2026 Nr. 10)“);
- `meta.sourceReferences` = `structured-html-transcription` (`sourceRole: structure-bearing`, `localSource:
  Gesetze/OGVBl. 2026 Nr. 10.html`, `sha256`, `pageRange`, `verifiedAt`) plus `primary-pdf` (`visual-control`,
  `derivedSource` auf die HTML-Datei);
- genau eine Fassung, `versionId` = `validFrom` = Datum (hier `2026-01-27`), `validTo: null`, `isCurrent: true`;
- `history.json`: ein `initial`-Eintrag „Amtlich veröffentlicht.“.

Das Erlassorgan steht in `enactingBody`; `originEnactingBody` bleibt der Rechtsüberleitung übernommener Normen
vorbehalten (`schema.ts`, Kommentar an `originEnactingBody`).

### 1.3 Änderungsgesetze und Änderungsbefehle

Zwei Ebenen:

1. **Der Änderungsakt als Norm.** Typ `aenderungsvorschrift`, Status `one-time-act`, Beziehung
   `affectedNorms: [<zielnorm>]`; die Zielnorm erhält `affectedByNorms`. Die Konsolidierung setzt Typ und
   `affectedNorms` am Akt selbst (`scripts/consolidate-norms.mjs`, Block `affectedActs`).
2. **Das Rezept je Zielnorm** (`data/recht/amendments/<akt>/<zielnorm>.json`). Felder (Häufigkeit über alle
   95 Rezepte): `amendmentAct` (95), `effectiveDate` (95), `amendmentCitation` (95), `resultCitation` (95),
   `changeNote` (95), `sourceReferences` (95, `kind: amendment-source`, `localSource: Gesetze/…html`),
   `operations` (95), `versionId` (84; fehlt es, gilt `effectiveDate`), `commandCoverage` (73, wörtliche
   Abdeckung der Änderungsbefehle), `sameDayOrder` (11), `repealsLaw` (5).

Operationen (`scripts/lib/consolidation-engine.mjs`, `CONSOLIDATION_OPERATIONS`), beobachtete Häufigkeit:
`replaceProvision` 117, `replaceText` 90, `insertProvisionAfter` 73, `designationReplacement` 73,
`renameProvision` 32, `renameLaw` 23, `repealProvision` 12, `replaceHeading` 11, `insertParagraph` 10,
`deleteProvision` 9, `replaceSiblingRange` 9, `repealLaw` 5, `insertProvisionBefore` 5, `replaceBody` 4,
`designationReplacementBody` 1, `appendAnnex` 1 (`amendTable` definiert, nicht verwendet).

Jede Operation nennt Zielanker (`target: { type, label, title?, text?, parentType?, parentLabel? }`),
`expectedHash` bzw. `expectedOld`, `expectedMatches`, `source`, `sourceProvision` und `effectiveDate`.
Null oder mehrere Treffer oder ein abweichender Hash brechen ab (`locateExactlyOne`, `CONTENT.md` Abschnitt
„Konsolidierung übernommener Stammnormen“). Mehrere Rezepte am selben Tag brauchen eindeutige `sameDayOrder`
und ergeben **eine** gemeinsame Fassung mit getrennten Historieneinträgen.

Ablauf in `consolidate(slug)` (`scripts/consolidate-norms.mjs`): Ausgangstext aus dem REVOSax-Snapshot oder –
bei eigenen Normen – aus einer gespeicherten Fassung (`existingVersionSeed` in `consolidation-sources.json`,
gelesen über `versionRecordsThrough`), dann Rezepte nach `effectiveDate`/`sameDayOrder` anwenden, je
Datumsgruppe eine Volltextfassung erzeugen, Intervalle neu berechnen, `meta.json`, `history.json`, **alle**
Fassungsdateien und die Metadaten der Änderungsakte schreiben. Fachliche Sperren: `blockedTargets`
(Konsolidierung nur bis vor das Konfliktdatum).

### 1.4 Aufhebungen

- Vollaufhebung einer Norm: Rezept mit `repealsLaw: true` und Operation `repealLaw` (mit `expectedHash`). Es
  entsteht **keine** neue Fassung; die letzte Fassung endet am Vortag (`version.validTo =
  previousIsoDate(repealRecipe.effectiveDate)`), `meta.status` wird `repealed` (sofern das Datum nicht nach dem
  redaktionellen Stichtag liegt), `meta.expiryDate` gesetzt, Historieneintrag `type: repeal`,
  `affectingVersionId: null`. Nach einer Aufhebung ist keine weitere Änderung zulässig.
- Aufhebung einzelner Vorschriften: `repealProvision` bzw. `deleteProvision` innerhalb einer Änderung.
- Regel in `CONTENT.md` (Norm-Fassungen): Ist `meta.expiryDate` belegt, muss `validTo` der letzten Fassung
  diesem Datum entsprechen.

### 1.5 Neufassungen (Neubekanntmachungen)

Einen eigenen Operationstyp oder ein eigenes Datenfeld für eine Bekanntmachung der Neufassung **gibt es in
OstRecht nicht** (nicht gefunden in `consolidation-engine.mjs`, `CONTENT.md`, `docs/NORM_WORKFLOW.md`).
Vorhanden sind: `replaceBody` (4 Rezepte, vollständiger Textersatz), die Beziehungen
`predecessor`/`successor` bzw. `predecessorSlug`/`successorSlug` und `enactedNorm`/`enactingNorm`. Normen mit
„Neufassung“ im Namen (z. B. `g-zur-neufassung-des-ostfischg`) sind übernommene sächsische Altakte mit
Ausgangsfassung 2023-11-01, keine Sim-Neufassungen. Für die Simulation ist das Konzept offen (Entscheidung E6).

### 1.6 Inkrafttreten, auch gespalten

- Je Rezept genau ein `effectiveDate`; jede Operation muss dasselbe Datum tragen, sonst Abbruch
  („Wirksamkeitsdatum weicht vom Rezept ab“, `consolidation-engine.mjs`).
- **Gespaltenes Inkrafttreten über verschiedene Zielnormen** ist abgebildet: z. B. `kreis-und-bezirksneuordnungsgesetz`
  wirkt auf die meisten Ziele am 2026-07-21, auf `ostdeutsches-polizeivollzugsdienstgesetz`,
  `saechsische-gemeindeordnung` und `saechsische-landkreisordnung` am 2026-08-01.
- **Gespaltenes Inkrafttreten innerhalb derselben Zielnorm** (Teil A am Tag X, Teil B am Tag Y aus demselben
  Akt) ist nicht vorgesehen: der Dateiname `<zielnorm>.json` ist je Akt eindeutig, und eine Datei kennt nur ein
  Datum. Ein Beleg für einen solchen Fall im Bestand wurde nicht gefunden.
- Normstatus `future-effective` (Inkrafttreten nach Stichtag) und `pending-effective` („Inkrafttreten nicht
  belegt“) steuern die Einordnung (`CONTENT.md`, Norm-Fassungen). Ein ausstehendes Inkrafttreten auf
  Fassungsebene (Änderung verkündet, Tag offen) ist nicht modelliert.

### 1.7 Mehrere Fassungen, Historie, Navigation, geltende Fassung

- Fassung: `versionId`, `validFrom`, `validTo`, `isCurrent` (Pflicht, aber laut `CONTENT.md` nur
  „rückwärtskompatibles Bestandsfeld“), `title`/`shortTitle`/`abbr`/`summary` fassungsspezifisch,
  `citation`, `changeNote`, `sourceReferences`, `sourceNotes`, `body` (`schema.ts`, `NormVersion`).
- Die geltende Fassung ergibt sich aus Intervall und redaktionellem Stichtag
  (`packages/shared/src/config/editorial.json`, `referenceDate: 2026-09-12`;
  `packages/shared/src/lib/norms/versions.ts`). Der Stichtag wird nur vorwärts fortgeschrieben
  (`npm run norms:advance-reference-date`, `docs/NORM_WORKFLOW.md`).
- Oberfläche `apps/recht/src/pages/norm/[slug]/`: `index.astro` (dynamisch, geltende Fassung),
  `version/[versionId].astro` („unveränderlicher Fassungslink“, `CONTENT.md`), `history.astro`
  („Fassungen und Änderungen“), `vergleich.astro` und `vergleich/[fromVersionId]/[toVersionId].json.ts`,
  `betroffen.json.ts`; dazu `apps/recht/src/pages/aenderungsdienst/rss.xml.ts`, `rechtsentwicklung/`.
- Vergleich und Änderungsmarken: `packages/shared/src/lib/norms/diff.ts` (dokumentweiter Einheitenvergleich mit
  Wortdiff), `affected-units.ts` („Betroffen“), `change-marks.ts` (Marken am Ort der Änderung),
  `apps/recht/src/lib/unit-history.ts` (Änderungsvermerk je Einheit über alle Fassungen),
  `apps/recht/src/lib/change-service.ts` (Änderungsdienst: neu in Kraft / verkündet, noch nicht in Kraft /
  außer Kraft).

### 1.8 Sim-Verkündungsblatt

`content/verkuendungen/<slug>.json`, Typ `Verkuendung` (`publications.ts`): `slug`, `title`, `year`, `issue`,
`date`, `publication` (Blattkürzel, z. B. `OGVBl.`, `StAnzO.`, `OABl.`, `OVertrBl.`, `GMBl.`), `place`,
`publisher`, `pdf` (öffentlicher Pfad `/assets/recht/<slug>.pdf`), `sourceFiles`, `sourceReferences`,
`entries[]`. Ein `VerkuendungEntry` trägt `id`, `title`, `type` (`PUBLICATION_ENTRY_TYPES`, am Normtyp
ausgerichtet, `isCompatiblePublicationEntryType`), `citation`, `startPage`, `pages`, `documentDate`, `normSlug`,
`versionId`. PDFs werden über `npm run norms:publications:pdf-sync -- --write` zugeordnet. D1-Tabelle
`law_publications` (`data/recht/d1/0002_runtime_projection.sql`), Seiten `apps/recht/src/pages/verkuendungen/`
(`index.astro`, `[slug].astro`, `index.json.ts`).

### 1.9 Sim-Provenienz getrennt von realen Quellen

- Reale Herkunft: `NormSourceReference.kind: revosax-snapshot` mit `lawId`, `sourceValidFrom`/`sourceValidTo`,
  `sha256`, `localSource` oder `r2-archived`; `originEnactingBody`; die Ausgangsfassung selbst.
- Sim-Herkunft: `structured-html-transcription`/`primary-pdf` (eigene Ausgaben) und `amendment-source`
  (Rezepte); Fundstellen der eigenen Blätter in `citation`/`initialCitation`.
- Die Unterscheidung „eigene Norm / übernommen unverändert / übernommen geändert“ wird **abgeleitet, nicht
  gespeichert**: `packages/shared/src/lib/norms/origin.ts` (`NORM_ORIGIN_KINDS`, `getNormOriginInfo`,
  `getOwnNormChanges`) erkennt eigene Änderungen an einem Regex auf Blattkürzel in Fundstellen
  (`OWN_PUBLICATION_PATTERN`) und an sächsischen Mustern (`SAXON_SOURCE_PATTERN`). Projiziert in
  `law_norm_derived.origin_json` und `law_norms.origin_kind` (`0005_search_units.sql`).
- Übernahme einer späteren realen Zwischenfassung ist nur mit Adoptionsbeleg zulässig (`adoptedSources` mit
  `adoptionEvidence { amendmentAct, sourceProvision, text }`, geprüft in `parseAdoptedSource`; `CONTENT.md`).

### 1.10 Unveränderlichkeit in OstRecht

OstRecht formuliert „Vorhandene Fassungsdateien werden nicht nachträglich umgeschrieben“ (`docs/NORM_WORKFLOW.md`,
Abbruchbedingungen), setzt aber technisch anders um als landesrecht:

- `consolidate()` schreibt bei jedem Lauf **alle** Fassungsdateien der Zielnorm neu und setzt dabei `validTo` und
  `isCurrent` der Vorfassungen (Beispiel `content/normen/saechsisches-verwaltungskostengesetz/versions/2023-11-01.json`:
  `validTo: 2026-01-26`, `isCurrent: false`). Byte-Stabilität wird über Schlüsselreihenfolge und
  `existingVersionMetadata` gesichert, nicht über ein Schreibverbot.
- Berichtigungen (`data/recht/corrections/…`, `legalEffect: declaratory-correction`) „korrigieren die betroffene
  gespeicherte Fassung samt Provenienz“ (`docs/NORM_WORKFLOW.md`, Schritt 5).
- Eine git-basierte Prüfung „gespeicherte Fassung unverändert gegenüber Basis“ wie
  `scripts/check-version-immutability.ts` wurde in OstRecht nicht gefunden.

### 1.11 Schnittstelle OstRecht → landesrecht

Eine eigens für landesrecht gebaute Export- oder Sync-Schnittstelle **existiert in OstRecht nicht** (Suche nach
„landesrecht“, „simrecht“, „Schnittstelle“ in Code und Doku ohne einschlägigen Treffer). Öffentliche
maschinenlesbare Endpunkte sind `apps/recht/src/pages/api/suche.json.ts` und
`apps/recht/src/pages/verkuendungen/index.json.ts`.

Landesrecht liest OstRecht **dateibasiert**:

- `packages/legal-core/src/config/jurisdictions.ts`: `ost.externalSourceOfTruth = { system: 'ostrecht', label:
  'OstRecht', siteUrl: 'https://recht.freistaat-ostdeutschland.de' }`.
- `packages/providers/src/ostrecht.ts`: Adapter `adaptOstRechtRecord` (`validFrom/validTo` →
  `simulationValidFrom/To`, `revosax-snapshot` → `official-portal-snapshot` + `ExternalIdentifier`,
  `affectedNorms`/`affectedByNorms` → `relations` `amends`/`amended-by`, `isCurrent` entfällt).
- `packages/importers/ostrecht/src/index.ts`: `readOstRechtRecord`, `importOstRechtNorm`; ein schreibender
  Sync-Lauf ist „bewusst noch nicht vorgesehen“.
- `packages/providers/src/ostrecht-provider.ts`: ohne Datensätze nur Verweisauflösung auf das öffentliche
  OstRecht; `apps/web/src/lib/runtime/context.ts` bindet ihn für `ost` ein.
- `docs/OSTRECHT_COMPATIBILITY.md`, `tests/unit/ostrecht-compatibility.test.ts` (synthetische Norm mit Fassungen
  `2023-11-01` und `2026-07-21`).

Nicht übernommen werden bislang: Verkündungen (`content/verkuendungen`), Rezepte, Herkunftsableitung
(`origin.ts`), `editorialResolutions`, `agreementDetails`. Der Bestand `content/norms/ost/` ist leer.

---

## 2 Abgleich mit landesrecht

### 2.1 Ist-Stand des Bestands

| Land | Normen | Fassungen | Fassungen mit `simulationValidTo: null` | Historientypen | Verkündungen |
| --- | --- | --- | --- | --- | --- |
| West | 1 482 | 1 482 (alle `2023-12-01`) | 1 482 | nur `initial` | 0 |
| NSH | 2 383 | 2 383 (alle `2023-12-01`) | 2 383 | nur `initial` | 0 |
| BayWü | 1 696 | 1 696 (alle `2023-12-01`) | 1 696 | nur `initial` | 0 |
| Ost | 0 (extern, OstRecht) | – | – | – | – |

Alle Normen tragen `status: in-force`. `content/publications/` ist leer. Seit dem Freeze-Commit
`ff1b1f43e209390a0dd610e5a06b5c5e07efa27a` ist `content/norms/west/` unverändert (`git diff --stat` leer).

Die einzige Norm mit Folgefassung ist das Fixture `tests/fixtures/content/norms/west/testfixture-schulgesetz-west`
(`versions/2023-12-01.json` mit `simulationValidTo: 2026-04-30`, `versions/2026-05-01.json`, Historie
`initial`/`amendment`/`notice`, `relations: amended-by → schulrechtsaenderungsgesetz-west-2026` mit `date` und
`note: Artikel 1`) samt Verkündung `tests/fixtures/content/publications/west/gv-west-2026-12.json`.

### 2.2 Konzeptabgleich

| Konzept | OstRecht | landesrecht | Bewertung |
| --- | --- | --- | --- |
| Normidentität | `meta.id = slug` | `meta.id = <j>:<slug>`, `jurisdiction` (`schema.ts`, `NormMeta`) | vorhanden |
| Mehrere Fassungen je Norm | `versions/<id>.json` | identisch, `NormVersion` | vorhanden |
| Zwei Zeitachsen | nur `validFrom/To`; Quellintervall nur an der Quelle | `simulationValidFrom/To` **und** `sourceValidFrom/To` an Fassung und Quelle; `validFrom/To` verboten (`parseNormVersion`) | vorhanden, strenger als Ost |
| Quellenlage der Baseline | – | `sourceStatus { validity, text, note }` | vorhanden |
| Lückenlose Intervalle | Konsolidierung berechnet | `validateVersionIntervals` verlangt `simulationValidTo` = Vortag der Folgefassung | vorhanden, kollidiert mit Baseline-Unveränderlichkeit (Abschnitt 3.3) |
| Geltende Fassung | abgeleitet, `isCurrent` Altfeld | abgeleitet (`getApplicableVersion`, `classifyNormVersion`, `EDITORIAL_REFERENCE_DATE = 2026-09-01`) | vorhanden |
| Baseline-Regel | – | `assertBaselineConsistency` (erste Fassung nicht vor 2023-12-01), `getBaselineVersion` | vorhanden |
| Eigene Sim-Normen | Norm mit später beginnender Fassung | zulässig (Baseline-Regel erlaubt späteren Beginn) | vorhanden |
| Änderungsakt als Norm | `aenderungsvorschrift`, `one-time-act` | beide Werte in `NORM_TYPES`/`NORM_STATUSES` | vorhanden |
| Akt ↔ Zielnorm | `affectedNorms`/`affectedByNorms` | `relations[]` `amends`/`amended-by`, `repeals`/`repealed-by`, `replaces`/`replaced-by`, mit `date`/`note` | vorhanden, reicher als Ost |
| Historie | `initial, amendment, repeal, notice` | zusätzlich `correction`; `affectingVersionId`, `relatedNorm: { jurisdiction?, slug }` | vorhanden |
| Änderungsrezepte | `data/recht/amendments/…` | – | **fehlt** |
| Konsolidierungsengine | `scripts/lib/consolidation-engine.mjs` | – | **fehlt** |
| Konsolidierungsnachweis | `consolidation-manifest.json`, `--check` im `content:check` | – | **fehlt** |
| Berichtigungen | Rezepte, schreiben gespeicherte Fassung um | Historientyp `correction`; Fassungsänderung nur per `--allow`/Ausnahmedatei | teilweise, Regel offen (E5) |
| Verkündungsblatt | `Verkuendung` + D1 `law_publications` + Seiten | `Publication`/`PublicationEntry` (`schema.ts`), `loadJurisdictionPublications` (`loader.ts`), Validierung der Bezüge (`scripts/validate-content.ts`); **keine** D1-Tabelle, **keine** Webseite | teilweise |
| Gazette-Kürzel je Land | Blattkürzel in `publication` | `Jurisdiction.gazette` (`GV. West`, `GVOBl. NSH`, `GVBl. BayWü`) | vorhanden |
| Sim-Provenienz | abgeleitet per Regex (`origin.ts`) | nicht gespeichert, nicht abgeleitet; `amendment-source`/`amendment-evidence` bereits für **reale** Änderungsbelege belegt (West 69, BayWü 251 `official-gazette`/`amendment-evidence`) | **fehlt** |
| Unveränderlichkeit | Konvention, kein Gate | `scripts/check-version-immutability.ts` (byteidentisch gegen `--base`, Ausnahmen an Basis-Commit gebunden) | vorhanden, stärker als Ost |
| Importer-Schutz | – | Baseline-Writer brechen ab, wenn weitere Fassungen existieren (`existing-versions` in `recht-nrw/src/common/persist.ts` `writeInitialNorm`, `juris-sh/src/pipeline/persist.ts` und `bayernrecht/src/bulk/persist.ts` `writeNormRecord`) | vorhanden |
| Projektion mehrerer Fassungen | `law_versions`, `law_version_blocks` | `law_versions` (beide Achsen, `temporal_kind`), `law_version_blocks`, `law_source_objects` je Fassung (`projection.ts` `normQueries`) | vorhanden |
| Suche über Fassungen | `law_search_units` | Sucheinheiten aller Fassungen (`indexHistoricalVersions` Standard `true`), `versionScope` (`packages/search/src/query.ts`), Rang bevorzugt `current` (`packages/runtime/src/d1-store.ts`) | vorhanden |
| Fassungsnavigation | `version/[versionId]`, `history` | `apps/web/src/pages/[jurisdiction]/norm/[slug]/version/[versionId]/{index,daten,quellen}.astro`, `historie.astro`, `lib/norm-view.ts` (`versions`, `kindLabel`), API `api/v1/norms/[jurisdiction]/[slug]/versions.ts` | vorhanden |
| Fassungsvergleich | dokumentweit, Wortdiff, Marken, „Betroffen“ | `vergleich.astro`: Gegenüberstellung je Paragraph/Artikel/Anlage, ausdrücklich „noch ohne Wortdiff“ | teilweise |
| Änderungsdienst | `change-service.ts`, RSS | – | fehlt (optional) |
| Stichtagsfortschreibung | `norms:advance-reference-date` | `editorial.json`; Projektion erkennt geänderten Stichtag (`packages/runtime/src/incremental.ts`) | teilweise (kein Fortschreibungswerkzeug) |

### 2.3 Was fehlt, zusammengefasst

1. Ein Ablageort und ein Format für Sim-Änderungsereignisse (Rezepte) und für die Sim-Akte selbst.
2. Eine Konsolidierungsengine, die aus Baseline-Fassung + Rezepten neue Fassungsdateien schreibt, **ohne** die
   Baseline-Datei anzufassen.
3. Ein Fassungsende, das nicht in der Baseline-Datei gespeichert werden muss (Abschnitt 3.3).
4. Eine explizite, validierbare Trennung von Sim-Provenienz und realer Provenienz.
5. Projektion und Webseiten für Verkündungen; optional der Wortdiff- und Änderungsmarken-Teil von OstRecht.
6. Gates, die Baseline-Unveränderlichkeit gegen einen festen Referenz-Commit prüfen, nicht nur gegen HEAD.

---

## 3 Baseline-Unveränderlichkeit

### 3.1 Harte Anforderung

- Ein Sim-Änderungsakt überschreibt nie rückwirkend die Baseline-Datei. `versions/2023-12-01.json` bleibt
  byteidentisch, für West gegenüber dem Freeze-Commit `ff1b1f43e209390a0dd610e5a06b5c5e07efa27a`.
- Konzept:

```text
NormIdentity            content/norms/<j>/<slug>/meta.json            (id <j>:<slug>, Slug stabil)
 └─ Version 2023-12-01  versions/2023-12-01.json                      Importer-Eigentum, eingefroren
     └─ Sim-Änderungsereignisse
          Sim-Akt als Norm        content/norms/<j>/<akt-slug>/     (aenderungsvorschrift, one-time-act)
          Verkündung              content/publications/<j>/<slug>.json
          Rezept je Zielnorm      data/simulation/<j>/amendments/<akt-slug>/<ziel-slug>.json   (neu)
         └─ neue Fassungen        versions/<YYYY-MM-DD>.json         write-once, Sim-Eigentum
             └─ aktuelle Fassung  getApplicableVersion(record, EDITORIAL_REFERENCE_DATE)   abgeleitet, nie gespeichert
```

### 3.2 Zwei Achsen, zwei Provenienzen – streng getrennt

| | Reale Quelle (nur Baseline-Fassung) | Simulation (jede Fassung) |
| --- | --- | --- |
| Geltung | `sourceValidFrom`/`sourceValidTo` (Provenienz, nie geltungsrelevant) | `simulationValidFrom`/`simulationValidTo` (allein geltungsrelevant, `versions.ts`) |
| Fundstelle | `sourceCitation` (nie transformiert) | `citation` (Fundstelle im Sim-Blatt) |
| Quellenlage | `sourceStatus` (`exact`, `verified-active-at-baseline`, `reconstructed`) | – |
| Belege | `sourceReferences` mit `system` `recht-nrw`/`juris-sh`/`bayernrecht`/`verkuendungsportal-sh` | `sourceReferences` auf Sim-Verkündung und Sim-Primärquelle |
| Erlassorgan | `originEnactingBody` | `enactingBody` |

Regel für die Validierung (neu, Abschnitt 4 Nr. S3): Eine Fassung mit `simulationValidFrom >
SIMULATION_BASELINE_DATE` trägt weder `sourceValidFrom`/`sourceValidTo` noch `sourceStatus` noch
`sourceCitation`, und ihre `sourceReferences` sind ausschließlich Sim-Belege. Die reale Historie nach dem
Stichtag (Ereignisregister `data/imports/juris-sh/events/ledger.json`, `data/imports/bayernrecht/events/ledger.json`)
ist **keine** Quelle für Sim-Fassungen (`docs/LEGAL_SCOPE.md`: „Nach dem Stichtag gilt Simulationsrecht“).
Einzige denkbare Ausnahme ist die ausdrückliche Übernahme einer realen späteren Fassung durch einen Sim-Akt
nach OstRecht-Vorbild `adoptedSources` (Entscheidung E7).

### 3.3 Der Zielkonflikt im heutigen Modell

`validateVersionIntervals` (`schema.ts`) verlangt für jede Fassung außer der letzten ein gespeichertes
`simulationValidTo` = Vortag der Folgefassung. Alle 5 561 Baseline-Fassungen speichern `simulationValidTo: null`.
Die erste Sim-Fassung einer Norm erzwingt deshalb heute eine Änderung der Baseline-Datei – das Fixture tut genau
das (`2023-12-01.json` mit `simulationValidTo: 2026-04-30`), OstRecht ebenso (Abschnitt 1.10).
`check-version-immutability.ts` würde das zu Recht als Verstoß melden; die einzige Abhilfe wäre heute eine
Freigabe per `--allow` oder Ausnahmedatei.

Lösung (empfohlen, Schemaänderung S1): **abgeleitetes Fassungsende.** Das gespeicherte `simulationValidTo` einer
Fassung bleibt, wie beim Schreiben bekannt, `null`. Beim Laden (`validateNormRecord`) wird das wirksame Ende
abgeleitet: Vortag des Beginns der Folgefassung, bei der letzten Fassung Vortag einer Aufhebung
(`meta.expiryDate` bzw. `repeal`-Historieneintrag). Ein explizit gespeicherter Wert bleibt zulässig, muss aber mit
dem abgeleiteten übereinstimmen (das Fixture bleibt gültig). Projektion, `resolveVersionAt`,
`classifyNormVersion`, Webseiten und API arbeiten auf dem abgeleiteten Wert; D1 `law_versions.simulation_valid_to`
erhält den abgeleiteten Wert.

Verworfene Alternative: „kontrolliertes Schließen“ (Prüfung erlaubt genau den Übergang `null → Datum` in einer
sonst unveränderten Datei). Sie verletzt die Byteidentität der West-Baseline und wird deshalb nicht empfohlen.

### 3.4 Wie Unveränderlichkeit durchgesetzt wird bzw. werden soll

| Mechanismus | Heute | Soll |
| --- | --- | --- |
| `scripts/check-version-immutability.ts` | Jede Fassungsdatei aus `--base` (Standard HEAD) byteidentisch; Freigaben per `--allow` oder `data/content-immutability-exceptions.json` (an `baseCommit` gebunden, verfällt mit dem nächsten Commit) | unverändert für Sim-Fassungen (write-once). Zusätzlich Gate mit festem Referenz-Commit: `node scripts/check-version-immutability.ts --base ff1b1f43e209390a0dd610e5a06b5c5e07efa27a` für `west/*/2023-12-01` (heute schon aufrufbar; prüft allerdings alle Fassungen, nicht nur West). Für NSH/BayWü dasselbe, sobald deren Baseline eingefroren ist |
| Ausnahmedatei | erlaubt `regenerated`/`removed` für Baseline-Fassungen (derzeit BayWü/NSH, Basis `b1e3b9c40e91`) | Für eine Norm mit Sim-Fassungen darf keine Baseline-Freigabe mehr gelten (neues Gate G2) |
| Baseline-Writer der Importer | brechen bei fremden Fassungen ab (`existing-versions`) | beibehalten: Baseline-Import und Sim-Fortschreibung schließen sich je Norm aus |
| Manifest/Provenienz | West: jede Norm mit `recht-nrw`-Kennung braucht Manifesteintrag (`validate-content.ts`); Quellen mit `sha256`, R2-Objektschlüssel | Sim-Normen tragen keine reale Kennung und fallen nicht unter die Manifestprüfung. Neu: Konsolidierungsmanifest je Land (Nachweis, dass jede Sim-Fassung aus Baseline + Rezepten reproduzierbar ist) |
| `meta.json`/`history.json` | nicht von der Unveränderlichkeitsprüfung erfasst | Sim-Fortschreibung darf sie nur additiv ändern (Entscheidung E1); Gate G3 prüft das gegen den Referenz-Commit |

---

## 4 Nötige Schemaänderungen

Grundsatz: Ost-Konzepte übernehmen, wo sie passen; keine parallele Struktur neben `NormVersion`,
`NormHistory`, `NormRelation`, `Publication`, `SourceReference`.

| Nr. | Änderung | Ort | Status |
| --- | --- | --- | --- |
| S0 | Fassungen, zwei Zeitachsen, Historie, Beziehungen `amends`/`amended-by`/`repeals`/`repealed-by`/`replaces`/`replaced-by`, Normtyp `aenderungsvorschrift`, Status `one-time-act`/`future-effective`/`pending-effective`/`repealed`, Historientyp `correction`, `Publication` mit `entries[].normSlug`/`versionId`, `law_versions`, `law_version_blocks`, Sucheinheiten je Fassung | `schema.ts`, `versions.ts`, `data/d1/0001_landesrecht.sql` | **vorhanden** |
| S1 | Abgeleitetes Fassungsende: `validateNormRecord`/`validateVersionIntervals` akzeptieren gespeichertes `null` bei Nicht-letzter-Fassung und setzen das wirksame Ende; explizite Werte müssen übereinstimmen; letzte Fassung endet an `meta.expiryDate` | `packages/legal-core/src/lib/schema.ts`, Doku `DATA_MODEL.md` | **nötig** |
| S2 | Sim-Belegart: neuer `SOURCE_KINDS`-Wert `simulation-gazette` (Ausgabe eines Sim-Verkündungsblatts) und optional Feld `publicationSlug` an `SourceReference` (Verweis auf `content/publications/<j>/<slug>.json`). Der vorhandene Wert `amendment-source` bleibt realen Änderungsbelegen vorbehalten | `schema.ts` (`SOURCE_KINDS`, `SourceReference`, `parseSourceReference`) | **nötig** (Feld `publicationSlug` optional) |
| S3 | Validierungsregel Provenienztrennung (Abschnitt 3.2), plus: Sim-Fassung braucht mindestens einen `simulation-gazette`-Beleg; Baseline-Fassung trägt keinen | `validateNormRecord` bzw. `scripts/validate-content.ts` | **nötig** |
| S4 | Rezeptformat nach OstRecht: `data/simulation/<j>/amendments/<akt-slug>/<ziel-slug>.json` mit `amendmentAct`, `effectiveDate`, `versionId?`, `sameDayOrder?`, `repealsLaw?`, `amendmentCitation`, `resultCitation`, `changeNote`, `sourceReferences`, `commandCoverage?`, `operations[]` (Operationsvokabular von `CONSOLIDATION_OPERATIONS`). Abweichung von Ost: `amendmentAct` als `NormTarget` (`{ jurisdiction?, slug }`) | neuer Parser in `packages/legal-core` (Typ + fail-closed-Parser) | **nötig** |
| S5 | Gespaltenes Inkrafttreten innerhalb derselben Zielnorm: mehrere Rezeptdateien je Akt/Ziel (`<ziel-slug>.<effectiveDate>.json`) | wie S4 | **optional** – nur, wenn die Sim-Quellen den Fall enthalten (offen, Q4) |
| S6 | `Publication` an Ost angleichen: `entries[].id`, `entries[].type` (`PUBLICATION_ENTRY_TYPES`), `startPage`, `documentDate`; `place`, `publisher`, `pdf`/Asset-Verweis | `schema.ts` `Publication`, `PublicationEntry` | **optional** (heute reicht `normSlug`/`versionId`/`pages`) |
| S7 | D1-Tabelle `law_publications` (Spalten nach Ost: `slug`, `jurisdiction`, `publication_date`, `gazette`, `year`, `issue`, `publication_json`, `updated_at`) und Projektion daraus | neue Migration `data/d1/0002_*.sql`, `projection.ts`, `PROJECTION_SCHEMA_VERSION` | **nötig** für die Verkündungsseiten |
| S8 | Ableitung „Herkunft“ (Baseline unverändert / Baseline geändert / eigene Sim-Norm) nach `origin.ts`, aber aus S2/S3 statt Regex; Projektion optional als Spalte `law_norms.origin_kind` | `legal-core` (Funktion), optional D1-Spalte | **optional** |
| S9 | Konsolidierungsmanifest je Land (`data/simulation/<j>/consolidation-manifest.json`): Rezept → erzeugte Fassung (SHA-256), gesperrte Ziele mit Grund (`blockedTargets` nach Ost) | Daten + Prüfskript | **nötig** (Nachweis, kein Laufzeitschema) |
| S10 | Fassungsebene „Inkrafttreten nicht belegt“ | – | **nicht empfohlen** bis Bedarf belegt; Ost hat es nur auf Normebene (`pending-effective`) |

Nicht nötig: ein `isCurrent`-Feld, eine eigene Tabelle für Sim-Fassungen, ein eigenes Fassungsverzeichnis für die
Simulation, eine zweite Normidentität. Sim-Fassungen sind gewöhnliche `NormVersion`s.

---

## 5 Import- und Migrationspfad

### 5.1 Gemeinsamer Pfad (alle drei Länder)

Reihenfolge; jeder Schritt ist für sich prüfbar und ohne Folgeschritt harmlos.

1. **Schema S1–S4, S9** in `legal-core` umsetzen; Fixture `testfixture-schulgesetz-west` auf `simulation-gazette`
   umstellen und `simulationValidTo` der Baseline-Fixture auf `null` zurückführen (Nachweis für S1). Keine
   Produktionsdaten ändern sich; `npm run content:check` bleibt grün.
2. **Konsolidierungsengine** als TypeScript-Port von `scripts/lib/consolidation-engine.mjs` (Operationen,
   `locateExactlyOne`, Hash-Erwartungen, `sameDayOrder`, `repealLaw`) in ein eigenes Modul, z. B.
   `packages/importers/simulation/` (Muster der übrigen Importer, Dry-run Standard). Übernommen wird der
   `existingVersionSeed`-Pfad von OstRecht: Ausgangstext ist immer die gespeicherte Fassung vor dem Wirkdatum,
   nie ein Quellsnapshot. Unterschied zu Ost: geschrieben werden nur **neue** Fassungsdateien (Abbruch, wenn die
   Datei existiert und abweicht), plus additive Änderungen an `history.json`/`meta.json` (E1).
3. **Sim-Akt als Norm**: Parser für die Sim-Verkündung (Vorbild `scripts/lib/norm-html-parser.mjs` bzw. die
   vorhandenen Transformer), Ergebnis `content/norms/<j>/<akt-slug>/` mit `type: aenderungsvorschrift` oder dem
   eigenen Normtyp, `status: one-time-act` für reine Änderungsakte, `initialCitation`/`citation` mit
   `JURISDICTIONS[j].gazette.abbreviation`, `sourceReferences` `simulation-gazette`. Keine `externalIdentifiers`
   eines realen Portals.
4. **Verkündung** `content/publications/<j>/<slug>.json` mit `entries[]` auf Akt und erzeugte Fassungen;
   `validate-content.ts` prüft die Bezüge schon heute.
5. **Rezepte** je Zielnorm; Konsolidierung im Prüflauf, dann Schreiblauf. Zielanker und Hashes beziehen sich auf die
   gespeicherte Baseline-Fassung (nicht auf die reale Quelle).
6. **Projektion**: `scripts/project-d1.ts` bzw. inkrementell (`packages/runtime/src/incremental.ts`) – neue
   Fassung ⇒ Norm neu projiziert; `law_norms.current_version_id` folgt aus `getApplicableVersion`;
   `law_versions.temporal_kind` aus `EDITORIAL_REFERENCE_DATE`; `law_publications` nach S7. Cloudflare-Schritte
   (Remote-D1, R2) sind nicht Teil dieses Dokuments.
7. **Suche**: keine Änderung nötig – Sucheinheiten entstehen für alle Fassungen, `versionScope` filtert
   `current`/`historical`/`future`, die Rangfolge bevorzugt die geltende Fassung. Prüfen: Suchaudit je Land zeigt
   historische Treffer nicht vor geltenden.
8. **Web**: Fassungsnavigation, Historie, Fassungslinks und API existieren. Neu: `/[jurisdiction]/verkuendungen/`
   und `/[jurisdiction]/verkuendungen/[slug]` (nach `apps/recht/src/pages/verkuendungen/`); Historie verlinkt den
   Sim-Akt über `relatedNorm` (bereits umgesetzt in `historie.astro`). Optional: Wortdiff/„Betroffen“/Marken nach
   `diff.ts`, `affected-units.ts`, `change-marks.ts`; Änderungsdienst nach `change-service.ts`.
9. **Stichtag**: `packages/legal-core/src/config/editorial.json` (`referenceDate: 2026-09-01`) bestimmt, welche
   Sim-Fassung geltend ist; Fortschreibung nur vorwärts (AGENTS.md). Ein Werkzeug nach
   `norms:advance-reference-date` ist optional.

**Tests und Gates (neu bzw. erweitert):**

| Gate | Inhalt |
| --- | --- |
| G1 Unveränderlichkeit | `npm run content:immutability` wie heute (Sim-Fassungen write-once) |
| G2 Baseline-Lock | `check-version-immutability.ts --base <Referenz-Commit>` für die Baseline-Fassungen des Landes; keine Baseline-Freigabe in der Ausnahmedatei für Normen mit Sim-Fassungen |
| G3 Normidentität additiv | `meta.json`/`history.json` von Normen mit Sim-Fassungen: Baseline-Felder und Historieneinträge ≤ 2023-12-01 unverändert gegenüber Referenz-Commit |
| G4 Konsolidierung reproduzierbar | Neuaufbau aus Baseline + allen Rezepten ergibt alle gespeicherten Sim-Fassungen byteidentisch (Vorbild: `norms:consolidation:audit --check` in OstRecht) |
| G5 Provenienztrennung | Regel S3 in `content:validate` |
| G6 Verkündungsbezüge | jede Sim-Fassung in genau einer Verkündung, jeder Verkündungseintrag auf vorhandene Fassung (heute schon teilweise) |
| G7 Projektion | `tests/unit/d1-projection.test.ts` um Norm mit Baseline + Sim-Fassung + Aufhebung erweitern; `npm run d1:schema:check` nach S7 |
| G8 Engine | Unit-Tests je Operation mit Treffer 0/1/2 und Hashabweichung (Vorbild OstRecht `tests/`) |

### 5.2 West (NRW → Westdeutschland, FROZEN)

- **Baseline**: 1 482 Normen, eingefroren am 2026-09-17 (`docs/WEST_REFERENCE_BASELINE.md`, Freeze-Commit
  `ff1b1f43e209390a0dd610e5a06b5c5e07efa27a`). Sim-Fassungen kommen ausschließlich **hinzu**;
  `versions/2023-12-01.json` bleibt byteidentisch. Mit S1 ist dafür keine Freigabe nötig.
- **Freeze-Regel**: Das Freeze-Dokument erlaubt Änderungen nur als Bugfix, neue amtliche Evidenz,
  Reviewentscheidung oder Schema-Upgrade. Eine Sim-Fortschreibung ist keine dieser Kategorien; sie braucht eine
  ausdrückliche Ergänzung („5. additive Sim-Fortschreibung, Baseline unberührt“) durch den Nutzer (E2).
- **Importer**: `packages/importers/recht-nrw` bleibt unverändert; `writeInitialNorm` lehnt Normen mit Sim-Fassungen
  ab (gewollt). Die Manifestprüfung in `validate-content.ts` gilt nur für Normen mit `recht-nrw`-Kennung; neue Sim-Akte
  tragen keine und sind nicht betroffen.
- **Quelle der Sim-Gesetzgebung**: siehe Abschnitt 6 (lokal nur ein Heft `WestGVBl-I-2-2026.pdf` gefunden).
- **Reihenfolge**: Schritte 5.1/1–2 → Gate G2 mit Freeze-Commit aktiv → erste Verkündung als Pilot (eine Zielnorm) →
  Projektion lokal → Rest.

### 5.3 NSH (Schleswig-Holstein/juris → Niedersachsen-Holstein)

- **Baseline**: 2 383 Normen, alle `sourceStatus.validity: exact`; letzter Commit „NSH full import“. Die Baseline ist
  **nicht** eingefroren; die Ausnahmedatei gibt noch 1 814 neu erzeugte und 96 entfernte NSH-Fassungen gegenüber
  `b1e3b9c40e91` frei. Zur Quellenrechtslage: `docs/NSH_SOURCE_RIGHTS_AND_PROVENANCE.md` Abschnitt 7 (Arbeitsstand
  2026-09-19, zum Zeitpunkt der Erhebung nicht committet) hält eine vom Nutzer bestätigte Nutzungsfreigabe fest; die
  Remote-Freigabe folgt `docs/NSH_REMOTE_RELEASE_PLAN.md`.
- **Voraussetzung**: NSH-Baseline je Zielnorm einfrieren, bevor dort eine Sim-Fassung entsteht; danach verweigert
  `juris-sh/src/pipeline/persist.ts` (`existing-versions`) jede Neuerzeugung dieser Norm. Eine Korrektur der
  Baseline einer bereits fortgeschriebenen Norm wäre dann nur noch als dokumentierte Ausnahme möglich (R4).
- **Abgrenzung**: `docs/SCHLESWIG_HOLSTEIN_EVENT_LEDGER.md`/`data/imports/juris-sh/events/ledger.json` enthalten
  reale Ereignisse nach dem Stichtag. Sie dürfen nicht als Sim-Rechtsakte verwendet werden.
- **Besonderheit**: `verfassung-des-landes-niedersachsen-holstein-in-der-fassung-vom-2-nsh` liegt als Baseline-Norm
  vor; eine Sim-Verfassung (siehe Abschnitt 6) wäre entweder Neufassung derselben Norm oder neue Norm mit
  `replaces`/`replaced-by` (E6).
- **Reihenfolge**: Quellenrechtsentscheidung → Baseline-Freeze NSH (Referenz-Commit) → gemeinsamer Pfad.

### 5.4 BayWü (Bayern → Bayern-Württemberg)

- **Baseline**: 1 696 Normen (1 569 `exact`, 127 `reconstructed`); BAYERN.RECHT führt nur den heutigen Stand,
  daher Rückrechnung (`docs/BAYWUE_RECONSTRUCTION.md`, `docs/BAYWUE_BASELINE_STATUS.md`). Laut README warten 446
  geänderte und weitere heute fehlende Normen noch auf einen Beleg ihrer Stichtagsfassung; die Ausnahmedatei
  enthält BayWü-Freigaben gegenüber `b1e3b9c40e91`.
- **Folge**: Zielt ein Sim-Akt auf eine Norm, die (noch) nicht im Bestand ist, kann kein Rezept angewandt werden.
  Solche Ziele werden wie in OstRecht als `blockedTargets` mit Grund geführt, nicht mit dem heutigen bayerischen
  Text überbrückt (Baseline-Regel `docs/BAYWUE_BASELINE_STATUS.md`).
- **Abgrenzung**: `data/imports/bayernrecht/events/ledger.json` (reale Ereignisse 2023-12-02 bis 2026-09-18) ist
  keine Quelle für Sim-Fassungen.
- **Besonderheit**: `verfassung-des-freistaates-bayern-wuerttemberg` liegt als Baseline-Norm vor; lokal gibt es
  eine Sim-„Staatsverfassung Bayern-Württembergs“ (Abschnitt 6) – Verhältnis offen (E6).
- **Reihenfolge**: BayWü-Baseline für die Zielnormen des ersten Sim-Hefts einfrieren → gemeinsamer Pfad → übrige
  Ziele erst nach ihrem Baseline-Beleg.

### 5.5 Ost (nur zur Einordnung)

Ost bleibt extern (`externalSourceOfTruth`). Eine spätere Übernahme der OstRecht-Fassungen über
`packages/importers/ostrecht` bringt die Sim-Fassungen mit, scheitert aber heute an der Stichtagsdifferenz
(R1), sobald die Datensätze über `loadNorm`/`loader.ts` (mit `assertBaselineConsistency`) statt über den Adapter
geladen werden. Verkündungen und Rezepte von OstRecht werden nicht übernommen; landesrecht muss sie nicht
spiegeln, solange OstRecht Source of Truth bleibt.

---

## 6 Benötigte Quellen und Repositories

### 6.1 Was auf diesem Rechner gefunden wurde

| Ort | Inhalt | Eignung |
| --- | --- | --- |
| `/Users/petzke/staatsregierung` | Vollständiges Sim-Recht **nur für Ost** (Norm-, Verkündungs-, Rezeptbestand, Abschnitt 1) | Referenzmodell, keine Quelle für West/NSH/BayWü |
| `/Users/petzke/landesrecht/tests/fixtures/…` | synthetische West-Änderung (`gv-west-2026-12`) | nur Test |
| `~/Downloads/WestGVBl-I-2-2026.pdf` | „Gesetzes und Verordnungsblatt für das Land Westdeutschland 2026 Nr. 2“, Mainz, 17. Mai 2026, 65 S., erster Inhalt „Gesetz zur Einführung eines Landessolargesetzes“ | Kandidat West; Nr. 1 und spätere Hefte nicht gefunden |
| `~/Downloads/Geschäftsordnung_des_Westdeutschen_Landtags 2026.pdf` | Geschäftsordnung | kein Landesrecht im Sinne von `docs/LEGAL_SCOPE.md` (zu klären) |
| `~/Downloads/Landesverfassung_Westdeutschland.pdf` (3 gleich große Kopien) | Verfassungstext, erste Seite ohne Textebene | Kandidat West; Status (verkündet?) unklar |
| `~/Downloads/Landesverfassung_NSH.pdf` | „Entwurf einer Verfassung für das Land Niedersachsen-Holstein“, Drucksache 01/08, „Landtag Norddeutschland“, 29.01.2024, 34 S. | **Entwurf**, keine Verkündung – nicht verwendbar ohne Verkündungsbeleg |
| `~/Downloads/BayWü-GVBL 03-2025.pdf` | GVBl. des Freistaates Bayern-Württemberg Nr. 03/2025, München, 29. April 2025, 17 S. | Kandidat BayWü |
| `~/Downloads/GVBL_Lehrmann_Teil_Zwei_2025.pdf` | GVBl. Bayern-Württemberg 2025 Nr. 2, München, 12. März 2025 („Hygienebereitstellungsgesetz“), 15 S. | Kandidat BayWü |
| `~/Downloads/BayWü GVBl. 03_26 (1).pdf`, `~/Downloads/BayWü GVBl. 04_26.pdf` | GVBl. Bayern-Württemberg Nr. 3 (29. August 2026, Stuttgart, 7 S.) und Nr. 4 (30. August 2026, 23 S.) | Kandidaten BayWü |
| `~/Downloads/GVBL_SUED_MUR_01_24.pdf` | 16 S., **ohne Textebene** (Scan); Name deutet auf ein „Süd“-Blatt 2024 | unklar, OCR und Zuordnung nötig |
| `~/Downloads/Landesverfassung_Bayern-Württemberg.pdf` | „Staatsverfassung Bayern-Württembergs“, „Süddeutscher Landtag“, ausgefertigt 12.01.2025, 28 S. | Kandidat BayWü (Verfassungsneufassung?) |
| `~/Downloads/Gesetzentwurf_SÜD_02_18 (2).pdf` | Gesetzentwurf „Süddeutscher Landtag“, 18.07.2024 | Entwurf, keine Verkündung |

Die Dateien in `~/Downloads` wurden nur nach Titel und erster Seite eingeordnet, nicht inhaltlich geprüft. Für NSH
wurde **kein** Verkündungsblatt gefunden. Keine der Dateien liegt als strukturtragende HTML-Fassung vor, wie sie
OstRecht als regulären Eingang verlangt (`docs/NORM_WORKFLOW.md`). In `grenzwacht`, `wahlen-portal`, `wisa`,
`warpsy`, `ost-wahlomat`, `msenv`, `Documents`, `Desktop` fanden sich keine Treffer zu den Blattkürzeln oder
Ländernamen (Textsuche; PDFs ohne Textebene werden dabei nicht erfasst).

### 6.2 Was der Nutzer liefern bzw. entscheiden muss

- **Q1** Vollständige, lückenlose Liste der Sim-Verkündungsblätter je Land seit 2023-12-01 (Blatt, Jahrgang,
  Nummern), damit Vollständigkeit prüfbar ist – analog zur Ausgabenfolge von OstRecht.
- **Q2** Die Ausgaben selbst, bevorzugt als strukturtragende Transkription (HTML oder Markdown) plus PDF zur
  visuellen Kontrolle; für den Scan `GVBL_SUED_MUR_01_24.pdf` eine Transkription.
- **Q3** Bestätigung, welche der oben gefundenen Dateien amtliche Sim-Verkündungen sind und welche Entwürfe
  (NSH-Verfassung ist als Entwurf gekennzeichnet).
- **Q4** Enthalten die Hefte gespaltenes Inkrafttreten innerhalb derselben Zielnorm oder Inkrafttreten durch spätere
  Bekanntmachung? (entscheidet S5/S10)
- **Q5** Bedeutung der Bezeichnungen „Süddeutscher Landtag“, „Landtag Norddeutschland“, Ausgabeorte Mainz,
  Stuttgart und München sowie „Staatskabinett Lehrmann II“ im Verhältnis zu den Registerbezeichnungen
  (`JURISDICTIONS`): gleiches Land unter früherem Namen oder anderes Gebilde? Davon hängen Blattkürzel und Zitierweise
  ab (`GV. West`, `GVOBl. NSH`, `GVBl. BayWü`).
- **Q6** Für Sim-Akte, die auf Normen außerhalb des Baseline-Bestands zielen (v. a. BayWü): Vorgehen bestätigen
  (sperren bis Baseline-Beleg).
- **Q7** Ob es für West/NSH/BayWü ein eigenes Repository oder einen Wissenshub mit Sim-Gesetzgebung gibt (analog
  `staatsregierung/knowledge/`), der hier nicht gefunden wurde.

---

## 7 Risiken und offene Entscheidungen

### 7.1 Risiken

| Nr. | Risiko | Wirkung | Gegenmaßnahme |
| --- | --- | --- | --- |
| R1 | OstRecht-Stichtag 2023-11-01 ≠ landesrecht 2023-12-01 | Ost-Datensätze scheitern an `assertBaselineConsistency`, sobald sie über den Loader geladen werden; Test `ostrecht-compatibility.test.ts` erwartet `2023-11-01` | Entscheidung, ob `ost` einen eigenen Ausgangsstichtag im Register erhält oder der Adapter umrechnet (E4) |
| R2 | OstRecht schreibt Fassungsdateien neu (`validTo`, `isCurrent`, Berichtigungen) | Blindes Übernehmen der Ost-Konsolidierung verletzt die Baseline-Unveränderlichkeit | Port nur des Engine-Teils, Schreiben nur neuer Dateien, S1 |
| R3 | Sim- und reale Änderungsbelege sind heute nicht unterscheidbar (`amendment-source`/`amendment-evidence` schon real belegt) | Vermischung realer Historie nach dem Stichtag mit Sim-Recht | S2/S3, Gate G5 |
| R4 | NSH/BayWü-Baseline noch in Bewegung (Ausnahmedatei, offene Rekonstruktionen) | Sim-Fassung auf einer später korrigierten Baseline; Importer verweigert dann die Neuerzeugung | Baseline je Zielnorm einfrieren, bevor Sim-Fassungen entstehen; Korrektur danach nur als dokumentierte Ausnahme mit Neukonsolidierung (G4) |
| R5 | Rezeptanker auf transformiertem Baseline-Text | Sim-Änderungsbefehle zitieren möglicherweise Wortlaute, die in der Baseline anders stehen (Rechtsüberleitung, Rekonstruktion) | fail-closed wie Ost (`expectedMatches`, Hash); Konflikte als `blockedTargets` |
| R6 | `check-version-immutability.ts` prüft nur gegen einen Basis-Commit | Eine in einem Commit durchgerutschte Baseline-Änderung ist im nächsten Commit „Basis“ | G2 gegen festen Referenz-Commit |
| R7 | `meta.json`/`history.json` sind Importer-Eigentum und werden durch Sim-Fortschreibung geändert | Konflikt mit Baseline-Import und West-Freeze | E1, G3 |
| R8 | Stichtag und `temporal_kind` sind projiziert | Stichtagsfortschreibung erfordert Neuprojektion; `incremental.ts` erkennt das bereits als Grund | Reihenfolge: Stichtag, dann Projektion |
| R9 | Quellenlage dünn (ein West-Heft, kein NSH-Heft, BayWü-Hefte lückenhaft, ein Scan) | Unvollständiger Sim-Rechtsstand mit Anschein der Vollständigkeit | Q1; Oberfläche kennzeichnet den Teilbestand wie bei BayWü |
| R10 | Große D1-Zeilen durch mehr Fassungen | mehr `law_version_blocks`/Sucheinheiten je Norm | vorhandene Teilung (`splitBlockJson`, `splitOversizedInsert`); Skalierungstest `scripts/d1-scale-test.ts` |

### 7.2 Offene Entscheidungen

- **E1** Dürfen `meta.json` und `history.json` einer Baseline-Norm durch die Sim-Fortschreibung geändert werden?
  Empfehlung: ja, wie in OstRecht, aber nur additiv (Historieneinträge nach 2023-12-01 anfügen; `relations[]`
  ergänzen; `status`/`expiryDate` bei Aufhebung), geprüft durch G3. Alternative wäre eine getrennte Sim-Ebene je
  Norm – das wäre eine Parallelstruktur und wird nicht empfohlen.
- **E2** Ergänzung der West-Freeze-Regel um „additive Sim-Fortschreibung, Baseline unberührt“.
- **E3** Abgeleitetes Fassungsende (S1) statt Schreiben von `simulationValidTo` in ältere Fassungen – bestätigen.
- **E4** Umgang mit dem Ost-Stichtag 2023-11-01 (R1).
- **E5** Berichtigungen: OstRecht ändert die betroffene Fassung; landesrecht verbietet das ohne Freigabe. Varianten:
  (a) Berichtigung als eigene Fassung mit gleichem Wirkdatum ist nicht möglich (Intervalle); (b) dokumentierte
  Freigabe in der Ausnahmedatei für Sim-Fassungen, nie für Baseline-Fassungen; (c) Berichtigung nur als
  `correction`-Historieneintrag ohne Textänderung. Empfehlung (b).
- **E6** Neufassungen und Sim-Verfassungen: gleiche Norm mit neuer Fassung (`replaceBody`) oder neue Norm mit
  `replaces`/`replaced-by` und Aufhebung der alten. OstRecht liefert dafür kein Muster.
- **E7** Übernahme realer späterer Fassungen durch einen Sim-Akt (Ost `adoptedSources`) zulassen oder ausschließen.
- **E8** Ort der Rezepte (`data/simulation/<j>/…` vorgeschlagen) und Ort des Engine-Moduls
  (`packages/importers/simulation/` vorgeschlagen).
- **E9** Umfang der Web-Erweiterung: nur Verkündungsseiten (nötig) oder zusätzlich Wortdiff, „Betroffen“,
  Änderungsmarken und Änderungsdienst nach OstRecht (optional).
