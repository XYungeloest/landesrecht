# Simulationsrechtsfortschreibung: Ablauf und Formate

Umsetzung der Architektur aus `docs/SIM_LAW_PROGRESSION.md`. Kette je Land:

```text
Baseline 2023-12-01 → Sim-Verkündungsquelle → Sim-Rechtsakt → Änderungs-/Aufhebungsereignis → neue Fassung → aktueller Sim-Rechtsstand
```

Grundsätze (verbindlich, geprüft durch die Gates in Abschnitt 6):

- **Baseline-Datei unveränderlich.** `versions/2023-12-01.json` bleibt byteidentisch; ein Fassungsende wird beim Laden
  aus dem Beginn der Folgefassung bzw. einer Aufhebung **abgeleitet** (Schema S1), nie in die Baseline geschrieben.
- **`meta.json`/`history.json` nur additiv** (spätere `relations`, spätere Historieneinträge, `status`/`expiryDate`
  bei Aufhebung, `successor`); Baseline-Angaben bleiben unverändert.
- **Sim-Provenienz getrennt.** Sim-Fassungen tragen ausschließlich Sim-Belege (`simulation-gazette`,
  `simulation-standalone-act`, `simulation-promulgation-evidence`, `simulation-amendment-source`), nie
  `sourceValidFrom`/`sourceValidTo`, `sourceStatus` oder reale Portalkennungen. Reale Ereignisregister nach dem
  Stichtag sind keine Sim-Quelle.
- **Fail closed.** Zielanker 0× oder >1× gefunden, abweichender Hash, unklare Rechtswirkung → Fehler bzw. Review,
  nie Raten. Kein OCR: Scans werden archiviert und klassifiziert, aber nie automatisch zur kanonischen Fassung.
- **Nichts allein aus dem Dateinamen.** Dokumentart und Verkündungsstatus folgen aus dem Inhalt und aus anderen
  Quellen (Verkündungsmitteilung, spätere Sammelausgabe).

## 1 Inventar (Schritt 1)

`npm run import:simulation:inventory -- --write` liest `imports/<land>/**` (Originalarchiv, gitignoriert, nie
verändert), kopiert jede Datei nach `.cache/simulation/archive/<sha256>.<ext>`, extrahiert Text nach
`.cache/simulation/text/<sha256>.txt` (Lesefolge) und `.layout.txt` (Layouterhalt) und schreibt
`data/simulation/source-inventory.json` sowie `docs/SIM_SOURCE_INVENTORY.md`. Dubletten nur bei identischem SHA-256.
Erkennung (Titel, Daten, Serie, Nummer, Organ, Dokumentart) ist Vorsortierung, keine Entscheidung.

## 2 Evidenz je Quelle: `data/simulation/<land>/sources.json`

Eine Datei je Land, ein Eintrag je Quelle (SHA-256 aus dem Inventar). Sie ist die fachliche Entscheidung über jede
Datei und **benennt ihre Belege**.

```json
{
  "schemaVersion": "landesrecht-simulation-sources/1",
  "jurisdiction": "west",
  "decidedAt": "2026-09-28",
  "sources": [
    {
      "sha256": "…",
      "path": "west/WestGVBl-I-2-2026 (1).pdf",
      "documentType": "gazette",
      "promulgationStatus": "promulgated",
      "title": "Gesetzes und Verordnungsblatt für das Land Westdeutschland 2026 Nr. 2",
      "documentDate": "2026-05-17",
      "issueDate": "2026-05-17",
      "authority": "Landesregierung Westdeutschland",
      "publication": {
        "slug": "gv-west-2026-2-20260517",
        "seriesTitle": "Gesetzes und Verordnungsblatt für das Land Westdeutschland",
        "seriesCode": "GV. West",
        "regime": null,
        "place": "Mainz",
        "date": "2026-05-17",
        "number": "2",
        "year": 2026
      },
      "acts": [
        {
          "actSlug": "landessolargesetz-west",
          "title": "Gesetz zur Einführung eines Landessolargesetzes",
          "kind": "gesetz",
          "documentDate": "2026-05-12",
          "commencement": "am Tag nach der Verkündung",
          "effectiveDate": "2026-05-18",
          "pages": "3–9",
          "targets": [{ "slug": "…", "title": "…" }],
          "status": "promulgated",
          "note": "…"
        }
      ],
      "relations": [
        { "kind": "promulgates", "sha256": "…", "note": "Drucksache 02/19 laut Verkündungsmitteilung vom 17.09.2024" }
      ],
      "decision": {
        "reason": "Amtliche Ausgabe mit Ausgabevermerk, Inhaltsverzeichnis und Ausfertigungen.",
        "evidence": ["…sha256 der Belege…"],
        "confidence": "high",
        "openQuestions": []
      }
    }
  ]
}
```

- `documentType`: `gazette` · `ministerial-gazette` · `promulgation-notice` · `repeal-notice` ·
  `standalone-official-act` · `legislative-document` · `draft` · `annex` · `press-release` · `informational` · `unknown`.
- `promulgationStatus`: `promulgated` · `promulgation-evidence-only` · `not-promulgated` · `superseded` · `repealed` ·
  `uncertain`. Eine Drucksache ist `promulgated`, wenn eine andere Quelle ihre Verkündung ausdrücklich belegt (Relation
  `promulgated-by` auf die Mitteilung); ohne Beleg `not-promulgated`. Eine Mitteilung, die nur die Wirkung eines anderen
  Akts belegt, ist `promulgation-evidence-only` und nie selbst Stammnorm.
- `relations[].kind`: `promulgated-by` · `promulgates` · `republished-in` · `republishes` · `annex-of` · `has-annex` ·
  `amends` · `amended-by` · `repeals` · `repealed-by` · `supersedes` · `superseded-by` · `same-act-as` · `evidence-for` ·
  `press-about`.
- `acts[].kind`: Normtyp nach `NORM_TYPES` (`gesetz`, `verordnung`, `verwaltungsvorschrift`, `runderlass`,
  `aenderungsvorschrift`, `bekanntmachung`, …). `acts[].status` wie `promulgationStatus`.
- `publication.slug` ist die Identität der Ausgabe (Abschnitt 4).

### 2.1 Evidenzhierarchie

Jede Quelle hat eine Evidenzebene (`sources[].evidenceLevel`; ohne Angabe aus `documentType`):

| Ebene | Quelle | `documentType` (Standard) |
| ---: | --- | --- |
| 1 | Original-Verkündungsblatt, amtliche Primärveröffentlichung | `gazette`, `ministerial-gazette` |
| 2 | amtlicher Einzelakt, amtliche Verkündungsmitteilung, verkündete Drucksache | `standalone-official-act`, `promulgation-notice`, `repeal-notice`, `legislative-document`, `annex` |
| 3 | spätere amtliche Wiederveröffentlichung oder amtliche Rückreferenz (Zitat in einem verkündeten Akt) | als `evidenceLevel: 3` gesetzt |
| 4 | technische oder verzeichnisartige Sekundärquelle (z. B. `gvbl.wiki`-Blattverzeichnis) | `informational`, `unknown`, `draft` |
| 5 | Presse und sonstige Information | `press-release` |

- **Ebene 4/5 darf:** bekannte Ausgabenfolge, Nummern, Daten und die Existenz einer Veröffentlichung belegen, Lücken
  erkennen und eine anderweitig (Ebene 1–3) belegte Verkündung plausibilisieren (Relation `evidence-for`).
- **Ebene 4/5 darf nicht:** Normwortlaut liefern (`provenance.transcribedFrom`, `sourceRole: structure-bearing`),
  Inkrafttreten bestimmen, eine sonst unbelegte Norm als `promulgated` qualifizieren (`promulgated-by`,
  `simulation-promulgation-evidence`) oder alleinige Grundlage einer Rechtswirkung sein (angewandtes Ledger-Ereignis
  nur mit Ebene-4/5-Belegen). Hängt die Rechtswirkung eines vorhandenen Originals an einer solchen Behauptung, bleibt
  der Akt `review` (`promulgation-unclear`). Gate G11 prüft das.
- Datum oder Inhalt wird nie aus einem Dateinamen abgeleitet (auch nicht bei Ebene-2-Mitteilungen ohne Datum im Text).

## 3 Ereignisstrom: `data/simulation/<land>/ledger.json`

Chronologisch nach Rechtswirkung (`effectiveDate`, dann `eventDate`), nie nach Dateiname.

```json
{
  "schemaVersion": "landesrecht-simulation-ledger/1",
  "jurisdiction": "west",
  "events": [
    {
      "id": "west-2026-05-18-amend-schulg-west",
      "type": "amend",
      "eventDate": "2026-05-17",
      "effectiveDate": "2026-05-18",
      "publication": { "slug": "gv-west-2026-2-20260517", "citation": "GV. West 2026 Nr. 2 S. 10", "sha256": "…" },
      "evidence": ["…sha256…"],
      "act": { "slug": "gesetz-zur-aenderung-des-schulgesetzes-2026-west", "title": "…" },
      "targets": [{ "slug": "schulg-west", "kind": "baseline-norm", "title": "Schulgesetz für das Land Westdeutschland" }],
      "confidence": "high",
      "status": "applied",
      "recipe": "data/simulation/west/amendments/gesetz-zur-aenderung-des-schulgesetzes-2026-west/schulg-west.json",
      "note": "…"
    }
  ]
}
```

- `type`: `enact` · `amend` · `repeal` · `replace` · `recast` · `promulgate` · `correction` · `organization` ·
  `temporary-rule` · `expire` · `unknown`.
- `targets[].kind`: `baseline-norm` (im Bestand), `sim-norm` (durch die Simulation geschaffen), `unknown` (nicht im
  Bestand, z. B. offene BayWü-/NSH-Baseline → `blockedTarget`).
- `status`: `applied` (konsolidiert), `pending` (noch nicht angewandt), `review`, `blocked` (Ziel nicht sicher im
  Bestand), `not-promulgated`. `review`, `blocked` und `not-promulgated` sind fachliche Entscheidungen der
  Evidenzprüfung; `pending` → `applied` leitet `npm run import:simulation:ledger-sync -- --jurisdiction <land>
  --write` aus dem Konsolidierungsmanifest ab (Akt materialisiert; bei `amend`/`repeal`/`replace`/`recast`/
  `correction` zusätzlich ein angewandtes Rezept auf eine Zielnorm, dessen Pfad als `recipe` eingetragen wird; bei
  `expire` das `expiryDate` der Norm selbst). Ein `applied`-Ereignis ohne materialisierten Akt oder Rezept ist ein
  Widerspruch (Exit 1, nichts geschrieben). Nach jedem `consolidate --write` ausführen.
- `confidence`: `high` · `medium` · `low`.
- `reasonCode` (Pflicht bei `review` und `blocked`, von `ledger-sync` geprüft – keine Sammelkategorie ohne Grund):
  `missing-source` (Quelle fehlt im Archiv, z. B. Drucksache, Zielgesetz, Blattseite) · `missing-baseline-target`
  (Zielnorm nicht im Baseline-Bestand) · `target-under-review` (Ziel ist ein noch nicht materialisierter Sim-Akt) ·
  `old-text-conflict` (zitierter Alttext ≠ Bestand) · `promulgation-unclear` (Verkündung/Ausfertigung nicht belegt oder
  widersprüchlich) · `effective-date-undetermined` (verkündet, Wirkdatum nicht bestimmbar) · `draft-only` (als Entwurf
  betitelt/Platzhalter) · `organizational-act` · `operation-unsupported` (Befehl mehrdeutig, Druckbild nicht
  transkribierbar) · `substantive-doubt` (echte fachliche Unklarheit) · `out-of-scope` (keine Norm im Sinne von
  `docs/LEGAL_SCOPE.md`).

## 4 Verkündungen: `content/publications/<land>/<slug>.json`

Projektion und Anzeige (S7, Schritt 6–8 in `docs/SIM_LAW_PROGRESSION.md`): `scripts/project-d1.ts` liest die Ausgaben
über `loadJurisdictionPublications` und schreibt sie – vollständig wie inkrementell – in die D1-Tabelle `law_publications`
(`data/d1/0002_publications.sql`, Einspielen: `docs/DEPLOYMENT.md`). Der Store bietet `listPublications`/`getPublication`;
die Seiten `/<land>/verkuendungen/` (jüngste Ausgabe zuerst, Blattname wie gedruckt, Einträge mit Link auf Norm bzw.
entstandene Fassung) und `/<land>/verkuendungen/<slug>/` (Einträge, Seiten, Quellenbelege mit SHA-256, keine Bilddaten)
sowie `/api/v1/publications/<land>[/<slug>]` lesen nur diese Tabelle. Die Historie einer Norm verlinkt die Verkündung
einer Fassung über `sourceReferences[].publicationSlug`. Kollidierende Nummern sind verschiedene Slugs und Adressen.

Identität einer Ausgabe = Land + Blatt-/Serientitel wie gedruckt + Regime + Datum + Nummer + Quellhash. Slug:
`<blattkürzel>-<jahr>-<nummer>-<yyyymmdd>` (Kleinbuchstaben, z. B. `gv-west-2026-2-20260517`,
`mbl-west-2025-1-20251020`, `gvbl-sued-2024-1-20240916`, `gvobl-nsh-mal1-2024-1-20240212`); bei gleichem Datum und
gleicher Nummer zusätzlich `-<sha256[0..8]>`. Doppelte Nummern bleiben getrennte Ausgaben; keine Ausgabe wird
überschrieben. Felder über das bestehende `Publication`-Schema hinaus (S6, optional): `seriesTitle` (historischer
Blattname wie gedruckt), `regime`, `place`, `entries[].type`, `entries[].startPage`, `entries[].documentDate`.

```json
{
  "slug": "gvbl-sued-2024-1-20240916",
  "jurisdiction": "baywue",
  "title": "Gesetzes- und Verordnungsblatt des Freistaates Süddeutschland 2024 Nr. 1",
  "gazette": "GVBl. Süd",
  "seriesTitle": "Gesetzes- und Verordnungsblatt des Freistaates Süddeutschland",
  "regime": "Freistaat Süddeutschland (Vorgängerbezeichnung, Kontinuität siehe data/simulation/baywue/continuity.md)",
  "place": "München",
  "year": 2024,
  "issue": "1",
  "date": "2024-09-16",
  "sourceReferences": [
    {
      "kind": "simulation-gazette",
      "system": "simulation",
      "label": "GVBl. Süd 2024 Nr. 1 (Originaldatei baywü/GVBL_SUED_MUR_01_24 (1).pdf)",
      "availability": "r2-archived",
      "bucket": "landesrecht-quellen",
      "objectKey": "baywue/simulation/<sha256>.pdf",
      "sha256": "<sha256>",
      "mediaType": "application/pdf",
      "pageCount": 16,
      "sourceRole": "structure-bearing"
    }
  ],
  "entries": [
    { "title": "…", "type": "gesetz", "citation": "Gesetz vom 12. September 2024 (GVBl. Süd 2024 Nr. 1 S. 3)", "normSlug": "…", "versionId": "2024-09-17", "pages": "3–9", "startPage": 3, "documentDate": "2024-09-12" }
  ]
}
```

`gazette` ist das Blattkürzel **wie gedruckt bzw. historisch** (`GV. West`, `MBl. WD`, `GVOBl. NSH`, `GVBl. Süd`,
`GVBl. BayWü`); die heutige Jurisdiktion steht in `jurisdiction`. Historische Bezeichnungen werden nicht umbenannt.

## 5 Sim-Rechtsakte und Rezepte

### 5.1 Sim-Akt als Norm: `data/simulation/<land>/acts/<akt-slug>.json`

Eingabe für die Materialisierung (`import-simulation consolidate`), nie handgeschriebener Inhalt unter
`content/norms/`. Neue Sim-Normen erhalten genau eine erste Fassung mit `simulationValidFrom` = tatsächliches
Inkrafttreten (keine künstliche Baseline-Fassung).

```json
{
  "schemaVersion": "landesrecht-simulation-act/1",
  "slug": "landessolargesetz-west",
  "jurisdiction": "west",
  "meta": {
    "title": "Landessolargesetz",
    "shortTitle": "Landessolargesetz",
    "abbr": "LSolG West",
    "type": "gesetz",
    "status": "in-force",
    "enactingBody": "Landtag Westdeutschland",
    "subjects": ["Energie"],
    "keywords": [],
    "initialCitation": "Gesetz vom 12. Mai 2026 (GV. West 2026 Nr. 2 S. 3)",
    "summary": "…",
    "documentDate": "2026-05-12",
    "publicationDate": "2026-05-17",
    "effectiveDate": "2026-05-18",
    "relations": [{ "type": "amends", "target": { "slug": "schulg-west" }, "note": "Artikel 2", "date": "2026-05-18" }]
  },
  "version": {
    "versionId": "2026-05-18",
    "simulationValidFrom": "2026-05-18",
    "citation": "Gesetz vom 12. Mai 2026 (GV. West 2026 Nr. 2 S. 3)",
    "changeNote": "Amtlich veröffentlicht.",
    "body": [ { "type": "paragraph", "label": "§ 1", "title": "Zweck", "children": [ { "type": "subparagraph", "label": "(1)", "text": "…", "children": [] } ] } ],
    "sourceReferences": [
      { "kind": "simulation-gazette", "system": "simulation", "label": "GV. West 2026 Nr. 2 S. 3–9", "availability": "r2-archived", "bucket": "landesrecht-quellen", "objectKey": "west/simulation/<sha256>.pdf", "sha256": "<sha256>", "mediaType": "application/pdf", "pageRange": "3–9", "sourceRole": "structure-bearing", "publicationSlug": "gv-west-2026-2-20260517" }
    ]
  },
  "publication": { "slug": "gv-west-2026-2-20260517", "pages": "3–9" },
  "provenance": { "transcribedFrom": "<sha256>", "method": "text-layer|txt|docx", "checked": "Wortlaut gegen Layouttext geprüft; Gliederung nach Vorlage" }
}
```

Reine Änderungsakte (Mantelgesetze) sind Normen mit `type: aenderungsvorschrift`, `status: one-time-act`,
`relations[]` `amends`/`repeals` je Ziel. Ein `standalone-official-act` (Einzelverordnung, Erlass) ohne
Blattausgabe trägt statt `simulation-gazette` den Beleg `simulation-standalone-act` (plus
`simulation-promulgation-evidence` auf eine Verkündungsmitteilung, wenn vorhanden). Drucksachen, die per
Verkündungsmitteilung verkündet wurden, tragen **beide** Belege: Drucksache (`sourceRole: structure-bearing`,
Wortlaut) und Mitteilung (`sourceRole: amendment-evidence` – Rechtswirkung). Erscheint der Akt später wortgleich in
einer Sammelausgabe, ist die Ausgabe primäre Verkündungsquelle und die Drucksache ergänzende Quelle
(`supplementary-transcription`); Wortlaut wird verglichen, nicht angenommen.

Der Körper folgt dem Blockmodell von `packages/legal-core/src/lib/schema.ts` (`STRUCTURE_TYPES`): `paragraph`/
`article` mit `label` und `title`, darin `subparagraph` (`(1)`) mit `text`, `item`/`subitem` (`1.`, `a)`),
`paragraphText` für Fließtext ohne Absatznummer, `annex`, `table`/`tableRow`/`tableCell`, `signature`, `preamble`.
Muster: jede Baseline-Norm unter `content/norms/<land>/*/versions/2023-12-01.json`.

Regeln des Parsers (`packages/importers/simulation/src/recipes/schema.ts`, fail closed; unbekannte Felder sind Fehler):

- `meta` kennt die Felder des Beispiels sowie `shortTitleSource`, `responsibleBody`, `primarySubject`, `summarySource`,
  `expiryDate`, `dateNote`, `predecessor`/`predecessorTarget`, `successor`/`successorTarget` und optional
  `sourceReferences` (Sim-Belege der Norm; fehlen sie, gelten die Belege der Fassung). Unzulässig sind `id`, `slug`,
  `jurisdiction`, `externalIdentifiers` (immer `[]`), `sourceCitation`, `originEnactingBody`.
  `type: aenderungsvorschrift` verlangt `status: one-time-act`; `meta.effectiveDate` (wenn gesetzt) muss dem
  Inkrafttreten der Fassung entsprechen.
- `version.versionId` = `version.simulationValidFrom`; `simulationValidTo` wird nie gespeichert (abgeleitet);
  `sourceReferences` mindestens ein Sim-Beleg, ein `publicationSlug` darin muss `publication.slug` entsprechen;
  `sourceValidFrom`/`sourceValidTo`/`sourceStatus`/`sourceCitation` sind unzulässig.
- `provenance.method`: `text-layer` · `txt` · `docx` · `html`; `provenance.textCheckOverride: { reason }` lässt den
  Akt trotz gescheiterter (oder ohne Textauszug nicht möglicher) Wortlautprobe zu und wird im Manifest ausgewiesen.

Materialisiert werden `meta.json` (kanonische Schlüsselreihenfolge der Importer, `externalIdentifiers: []`),
`history.json` (ein `initial`-Eintrag „Amtlich veröffentlicht (Simulation).“ mit `note: Verkündung: <slug>, S. <pages>`,
`affectingVersionId` = Fassung) und `versions/<versionId>.json` – nur, wenn das Normverzeichnis fehlt oder alle drei
Dateien byteidentisch wären (Beziehungen des Akts werden additiv ergänzt); ein abweichender Bestand ist ein Fehler,
ebenso ein Slug, der bereits eine Baseline-Norm bezeichnet.

### 5.2 Rezept je Zielnorm: `data/simulation/<land>/amendments/<akt-slug>/<ziel-slug>.json`

Format nach OstRecht (`data/recht/amendments/`), Operationen aus `CONSOLIDATION_OPERATIONS`; Abweichung: `amendmentAct`
ist ein Slug derselben Jurisdiktion. Zielanker und Hashes beziehen sich auf die **gespeicherte Fassung vor dem
Wirkdatum** (Baseline-Datei oder vorige Sim-Fassung), nie auf die reale Quelle. `expectedHash` = `sha256(canonicalJson(block))`
(`packages/importers/simulation/src/engine/hash.ts`), `repealLaw` und `replaceBody` hashen `{ title, body }` bzw. `body`.

```json
{
  "schemaVersion": "landesrecht-simulation-recipe/1",
  "amendmentAct": "gesetz-zur-aenderung-des-schulgesetzes-2026-west",
  "effectiveDate": "2026-05-18",
  "versionId": "2026-05-18",
  "sameDayOrder": 1,
  "amendmentCitation": "Gesetz vom 12. Mai 2026 (GV. West 2026 Nr. 2 S. 10)",
  "resultCitation": "Schulgesetz für das Land Westdeutschland, geändert durch Gesetz vom 12. Mai 2026 (GV. West 2026 Nr. 2 S. 10)",
  "changeNote": "…",
  "commandCoverage": ["Artikel 1 Nummern 1 bis 3"],
  "sourceReferences": [{ "kind": "simulation-amendment-source", "system": "simulation", "label": "GV. West 2026 Nr. 2 S. 10", "availability": "r2-archived", "bucket": "landesrecht-quellen", "objectKey": "west/simulation/<sha256>.pdf", "sha256": "<sha256>", "mediaType": "application/pdf", "pageRange": "10–12", "publicationSlug": "gv-west-2026-2-20260517" }],
  "operations": [
    { "op": "replaceText", "target": { "type": "subparagraph", "label": "(1)", "parentType": "paragraph", "parentLabel": "§ 1" }, "field": "text", "expectedOld": "…bisheriger Wortlaut…", "value": "…neuer Wortlaut…", "expectedMatches": 1, "source": "west/simulation/<sha256>.pdf", "sourceProvision": "Artikel 1 Nummer 1", "effectiveDate": "2026-05-18" }
  ]
}
```

`repealsLaw: true` + Operation `repealLaw` hebt die Norm auf: keine neue Fassung; das Geltungsende wird abgeleitet,
`meta.status` → `repealed`, `meta.expiryDate`, Historieneintrag `repeal`, Beziehung `repealed-by`. Neufassung
derselben Norm → `replaceBody`; aufgehobene alte Norm plus neue Norm → Akt der neuen Norm mit `replaces`, alte Norm
`replaced-by` und Aufhebungsrezept.

**Redaktionelle Auflösungen** (`meta.editorialResolutions[]`, je Eintrag `id`): additive, datierte Entscheidungen über
nichtnormative Metadaten eines Akts – nie Normtext, nie Umschreiben gespeicherter Einträge. Ein bereits materialisierter
Akt nimmt neue ids additiv auf; eine gespeicherte id ist unveränderlich. Ausgewertet werden
`kind: superseded-technical-note` (frühere technische Notiz an einer Beziehung ist überholt: `relation { type, target }`,
`supersededNote` = exakter bisheriger Wortlaut, `statement` = aktuelle Aussage; die Oberfläche zeigt `statement` und die
alte Notiz nur als überholt) und `kind: source-status` (Quellenlage, z. B. „Verkündung mittelbar amtlich belegt,
Original-Verkündungsblatt fehlt“). Helfer: `packages/legal-core/src/lib/editorial-resolutions.ts`.

Regeln des Parsers und der Konsolidierung:

- `schemaVersion` ist Pflicht; `versionId` fehlt → `effectiveDate`; `sourceReferences` mindestens ein Sim-Beleg
  (`simulation-amendment-source`, …); `repealsLaw: true` verlangt genau eine `repealLaw`-Operation (und umgekehrt);
  jede Operation trägt das Wirkdatum des Rezepts; unbekannte Felder sind Fehler. Dateiname `<ziel-slug>.json`, bei
  gespaltenem Inkrafttreten desselben Akts `<ziel-slug>.<YYYY-MM-DD>.json` (Datum = `effectiveDate`).
- Zielanker und Hashes beziehen sich auf das **rohe JSON** der gespeicherten Fassungsdatei (`canonicalJson` sortiert
  Schlüssel, Feldpräsenz zählt); `repealLaw` hasht `{ title, body }` mit `title` = `title` der Seed-Fassung, sonst
  `meta.title`. Mehrere Rezepte am selben Tag brauchen eindeutige `sameDayOrder` und dieselbe `versionId`; eine
  Aufhebung steht allein. Rezepte werden nur an das Ende der Fassungsfolge angefügt; nach einer Aufhebung ist keine
  weitere Änderung zulässig (dieselben Rezepte erneut anzuwenden ist idempotent).
- Ergebnis je Datumsgruppe: `versions/<versionId>.json` mit `simulationValidFrom` = Wirkdatum, `simulationValidTo:
  null`, `title` nur nach `renameLaw` (sonst gilt `meta.title`), `shortTitle`/`abbr`/`summary` der Seed-Fassung,
  `citation` = `resultCitation` des letzten Rezepts des Tages, `changeNote` = alle `changeNote`s des Tages,
  `sourceReferences` = Sim-Belege der Rezepte (dedupliziert), `body`. Je Rezept ein Historieneintrag `amendment`
  (`title` = `changeNote`, `citation` = `amendmentCitation`, `affectingVersionId`, `relatedNorm: { slug: <akt> }`),
  Beziehung `amended-by` (`note` = `commandCoverage`, `date` = Wirkdatum) und am Akt `amends`.
- Geltungsstatus eines Akts: `status: in-force` im Akt wird relativ zum Stichtag materialisiert – liegt
  `simulationValidFrom` nach `EDITORIAL_REFERENCE_DATE`, steht in `meta.json` `future-effective`; wird der Stichtag
  später fortgeschrieben, setzt `consolidate --write` den Status additiv auf `in-force` (Ergebnis `updated`, nur
  `meta.json` und Manifest ändern sich). `one-time-act` und andere Status bleiben, wie der Akt sie trägt.
- Aufhebung: `meta.expiryDate` = Vortag des Wirkdatums; `meta.status: repealed` nur, wenn dieser Vortag ≤
  `EDITORIAL_REFERENCE_DATE` (sonst bleibt der Status, bis der Stichtag fortgeschrieben und `consolidate --write`
  wiederholt ist – `--check` meldet das); Historieneintrag `repeal` (`affectingVersionId: null`), Beziehung
  `repealed-by`, am Akt `repeals`; trägt der Akt `replaces` auf die Zielnorm, zusätzlich `replaced-by` sowie
  `successor`/`successorTarget` (nur, wenn noch leer).

### 5.3 Konsolidierung

```text
npm run import:simulation:consolidate -- --jurisdiction <land> [--write] [--check] [--only <slug,…>] [--json] [--quiet]
```

Ablauf je Land (`packages/importers/simulation/src/consolidate/run.ts`; Ausgabe eine Zeile je Akt und Rezept):

1. **Sim-Akte materialisieren** (`acts/*.json`): Wortlautprobe, Schemaprüfung (`validateNormRecord`, Baseline-Regel,
   Provenienztrennung), Abgleich mit einem vorhandenen Normverzeichnis (byteidentisch oder Fehler).
2. **Rezepte anwenden** (`amendments/<akt>/<ziel>.json`) je Zielnorm nach `effectiveDate`/`sameDayOrder`; Seed ist
   immer die gespeicherte Fassung vor dem Wirkdatum (Baseline-Datei oder vorige Sim-Fassung, roh gelesen), nie ein
   Quellsnapshot; Änderungsakt muss als Norm vorliegen (materialisierter Akt oder Bestand).
3. **Nur neue Dateien**: `versions/<versionId>.json` wird nie überschrieben (byteidentisch → unverändert, abweichend →
   Fehler); `meta.json`/`history.json` werden roh eingelesen und nur um Felder/Einträge ergänzt (Schlüsselreihenfolge
   stabil, keine Byte-Diffs an unveränderten Feldern).
4. **Gesperrte Ziele** (`blockedTargets`, mit `code` und `reason`): `target-missing` (Slug nicht im Bestand),
   `seed-missing` (keine Fassung vor dem Wirkdatum), `hash-mismatch` (Hash/Alttext/Titel weicht von der gespeicherten
   Fassung ab), `anchor-mismatch` (Anker 0- oder mehrdeutig), `recipe-failed`, `blocked-by-earlier-recipe`. Frühere
   Datumsgruppen derselben Norm werden geschrieben, spätere nicht; niemals wird der heutige Realtext eingesetzt.
5. **Manifest** `data/simulation/<land>/consolidation-manifest.json`
   (`landesrecht-simulation-consolidation-manifest/1`): je Akt Fassung, SHA-256 von `meta.json`/`history.json`/
   Fassungsdatei, Quelle (`transcribedFrom`), Wortlautprobe (`blocks`, `found`, `foundLoosely`, `missing`,
   `skipped`) und `textCheckOverride`; je Rezept Zielnorm, Wirkdatum, `seedVersionId`, `seedHash`
   (`sha256({ title, body })` des Seeds), erzeugte Fassung mit SHA-256 der Datei (`null` bei Aufhebung);
   `blockedTargets`; `counts`. `generatedAt` ändert sich nur, wenn sich der fachliche Kern ändert.

**Wortlautprobe** (Sicherung gegen falsche Transkription): der Text jedes Blocks (`text`, `title`) des Akts muss im
Textauszug der in `provenance.transcribedFrom` genannten Quelle (`.cache/simulation/text/<sha256>.txt` oder
`.layout.txt`) vorkommen – Leerraum gebündelt, Trennstrich + Zeilenumbruch verbunden, unsichtbare Zeichen (U+200B,
U+00AD, Richtungssteuerzeichen U+202A–U+202E) entfernt; ersatzweise
gilt ein Block als „lose“ gefunden, wenn er ohne jeden Leerraum und ohne Striche im Quelltext steht. Jeder nicht
gefundene Block wird gemeldet, der Akt nicht geschrieben – außer mit `provenance.textCheckOverride`. Fehlt der
Textauszug (Cache), scheitert der Schreiblauf (Inventar ausführen); `--check` überspringt die Probe dann.

**Modi und Exit-Codes.** Ohne Option Dry-run (nichts wird geschrieben); `--write` schreibt nur bei null Fehlern (neue
Fassungen, additive `meta`/`history`, Manifest); `--only <slug,…>` beschränkt auf Akt- bzw. Zielnorm-Slugs (Manifest
wird zusammengeführt); `--check` (Gate G4) baut alles aus Baseline + Akten + Rezepten neu, vergleicht byteidentisch,
prüft rückwärts, dass jede Sim-Fassung und jede Norm ohne Baseline-Fassung aus Rezept bzw. Akt stammt, und vergleicht
das Manifest – Exit 1 bei jeder Abweichung; sonst Exit 0. Eingabefehler, Konflikte und gescheiterte Wortlautproben
sind Fehler (Exit 1); gesperrte Ziele sind dokumentierter Zustand (Exit 0).

## 6 Gates

| Gate | Prüfung | Befehl |
| --- | --- | --- |
| G1 | Fassungen write-once gegen HEAD | `npm run content:immutability` |
| G2 | Baseline-Lock (Lock-Datei Schema 2, s. u.): jede fortgeschriebene Norm (Sim-Fassung neben der Baseline oder Rezept auf die Baseline) hat einen akzeptierten Seed, dessen SHA-256 der gespeicherten Datei `versions/2023-12-01.json` entspricht (und dem `sourceCommit`; im Freeze-Land zusätzlich dem Freeze-Commit); die Konsolidierung sperrt Rezepte auf eine Baseline ohne passenden Seed (`seed-unaccepted`). Für Normen ohne Seed gilt weiter der Referenz-Commit: `versions/2023-12-01.json` jeder Norm byteidentisch gegen den Referenz-Commit des Landes aus `data/simulation/baseline-locks.json` (`{ "west": "ff1b1f43…", "nsh": "eeeca2cd…", "baywue": "63527012…" }`; West und NSH = Freeze-Commit, BayWü = letzter Commit, dessen Baseline-Fassungen unverändert gelten (seit Lauf 19 nach der StRGVV-Entscheidung) – wird nur in einem Land ohne Freeze nach einem Baseline-Schreiblauf mit dokumentierten Freigaben auf den Commit gesetzt, gegen den `content:immutability` prüft, sofern beide Bestände byteidentisch sind; ein Freeze-Commit wird nie automatisch verschoben). Normen, die im Referenz-Commit fehlen, sind ausgenommen – im Freeze-Land ist eine neue Baseline-Norm dagegen ein Verstoß, außer mit Freigabe `kind: "added"` zum Freeze-Commit. Für Normen mit Sim-Fassungen gilt keine Freigabe aus `data/content-immutability-exceptions.json` (auch nicht dokumentiert), für Normen ohne Sim-Fassungen nur mit `baseCommit` = Referenz-Commit; nur Blöcke zum Referenz-Commit geben etwas frei | `npm run content:simulation-gates` |
| G3 | `meta.json`/`history.json` von Normen mit Sim-Fassungen nur additiv gegenüber dem Referenz-Commit: alle alten Historieneinträge (in alter Reihenfolge), Beziehungen und Schlagworte unverändert enthalten, `initialVersionId` gleich, alle übrigen Meta-Felder gleich außer `status`, `expiryDate`, `successor`, `successorTarget`, `relations`, `keywords` | `npm run content:simulation-gates` |
| G4 | Konsolidierung reproduzierbar (`consolidate --check` je Land, s. o.) | `npm run content:simulation-gates` |
| G5 | Provenienztrennung (Sim-Fassung nur Sim-Belege, keine reale Quellprovenienz; Baseline nie Sim-Belege; eigene Sim-Norm ohne reale Kennung) – im Loader (`assertSimulationProvenance`) | `npm run content:validate` |
| G6 | Verkündungsbezüge: jede Sim-Fassung aus einer Blattausgabe (Beleg `simulation-gazette` oder `publicationSlug`) in genau einer Verkündung, ein eigenständig verkündeter Akt (`simulation-standalone-act`) in höchstens einer – kein Sim-Akt muss in einem Blatt stehen; jeder Eintrag auf vorhandene Norm/Fassung, jeder `publicationSlug` auf eine vorhandene Verkündung, kein Verkündungs-Slug doppelt (auch über Länder) | `npm run content:validate` |
| G7 | Projektion: `law_publications`, `current_version_id` folgt `getApplicableVersion`, historische Fassung bleibt abrufbar, `law_versions.simulation_valid_to` abgeleitet | `npm run test` (`d1-projection`), `npm run d1:schema:check` |
| G8 | Engine: je Operation Treffer 0/1/2, Hash-/Alttext-/Wirkdatumsabweichung | `npm run test` (`simulation-engine`, `simulation-recipes`, `simulation-consolidate`, `simulation-gates`) |
| G11 | Evidenzhierarchie (2.1): keine Wortlautquelle, kein Blatt-, Einzelakt-, Verkündungs- oder Änderungsbeleg und keine strukturtragende Rolle aus Ebene 4/5; jeder Akt hat einen Beleg der Ebene 1–3; kein angewandtes Ereignis nur mit Ebene-4/5-Belegen | `npm run content:simulation-gates` |
| G9 | Inventar reproduzierbar: `inventory` erneut gerechnet entspricht `data/simulation/source-inventory.json` ohne `scannedAt` (nur mit vorhandenem `imports/`; `--skip-inventory` überspringt) | `npm run content:simulation-gates` |
| G10 | R2/D1 konsistent, West-Fingerabdruck unverändert | `npm run audit:r2`, `npm run audit:d1-remote` |

`npm run content:check` führt `content:validate`, `content:immutability`, `content:tables` (Tabellen-Regressionsgate, semantischer Fingerabdruck je Tabelle gegen HEAD, Freigaben in `data/content-table-changes.json`) und `content:simulation-gates` aus.

**Lock-Datei `data/simulation/baseline-locks.json` (Schema `landesrecht-simulation-baseline-locks/2`,
`packages/importers/simulation/src/common/baseline-locks.ts`):**

```json
{
  "schemaVersion": "landesrecht-simulation-baseline-locks/2",
  "jurisdictions": { "west": { "commit": "ff1b1f43…", "freeze": true }, "nsh": { "commit": "eeeca2cd…", "freeze": true }, "baywue": { "commit": "21bab36e…", "freeze": false } },
  "seeds": [
    { "jurisdiction": "nsh", "slug": "lkhg-nsh", "baselineVersionId": "2023-12-01", "sha256": "<SHA-256 der Datei>",
      "acceptedAt": "2026-09-29", "decision": "<Freigabe/Entscheidungsreferenz>", "sourceCommit": "<Commit mit diesem Inhalt>" }
  ]
}
```

Eine Sim-Konsolidierung ist an den fachlich akzeptierten Inhalt ihrer konkreten Ausgangsfassung gebunden, nicht an einen
globalen Commit des Landes: Nach einem freigegebenen Baseline-Hardening einzelner Normen wird nur für die betroffene
Norm ein neuer Seed registriert (ausdrückliche Entscheidung, `decision`); der Referenz-Commit des Landes und alle übrigen
Normen bleiben unberührt. G3 prüft die Normidentität (`meta.json`/`history.json`) gegen `sourceCommit` des Seeds, im
Freeze-Land (West, NSH) gegen den Freeze-Commit. Die frühere flache Form `{ "<land>": "<commit>" }` wird gelesen, kennt aber
keine Seeds. Weitere Freigaben in `data/content-immutability-exceptions.json` stehen als eigene Blöcke in `releases[]`
(je `baseCommit`, dieselbe Regel wie der Hauptblock).

**Abgelöste Seeds** (`supersededSeeds[]`, Lauf 19): Ein Seed, der sich als sachlich falsch erweist, wird nicht gelöscht.
Er wandert mit `supersededAt`, `reason` und `supersededBy` (Entscheidung) aus `seeds[]` nach `supersededSeeds[]`. Ein
abgelöster Seed ist nicht aktiv: Er bindet keine Konsolidierung und berechtigt keine Sim-Sperre. Beispiel: `strgvv-baywue`,
dessen Seed eine erst 2024 ausgefertigte, rückwirkende Änderung enthielt (6.2; `data/simulation/baywue/strgvv-baseline-seed-decision.md`).

**Aufhebung einer ausgeschlossenen Zielfassung** (Rezeptfeld `targetExcluded`, nur mit `repealsLaw`): Eine sicher
identifizierte Norm, deren Ausgangswortlaut bewusst nicht veröffentlicht ist (`resolved-excluded`), kann trotzdem durch einen
Sim-Akt aufgehoben oder ersetzt werden. Die Aufhebung ist dann eine reine Identitäts- und Statusoperation:
- `targetExcluded` nennt Quellidentität, externe Kennungen (Quellidentität, Gliederungsnummer), ReasonCode, Entscheidung
  und Datum;
- `repealLaw` trägt keinen `expectedHash`;
- die Konsolidierung schreibt keinen Zieltext und verlangt keinen Seed. Sie setzt `repeals` am Akt und führt das Rezept im
  Manifest mit `seedVersionId: null` und der Zielidentität;
- ist die Zielnorm doch veröffentlicht, scheitert sie (fail-closed).

Eine leere oder erfundene Fassung entsteht nie.

### 6.1 Baseline-Freeze: Semantik

Ein Baseline-Freeze (`jurisdictions.<land>.freeze: true` in `data/simulation/baseline-locks.json`: West seit 2026-09-17,
NSH seit 2026-09-29 – `docs/WEST_REFERENCE_BASELINE.md`, `docs/NSH_BASELINE_FREEZE.md`)
fixiert **ausschließlich den realen Ausgangsrechtsstand zum 01.12.2023** einschließlich seiner realen Provenienz
(reale Quellfassung, `sourceValidFrom/To`, `sourceCitation`, reale Belege, Manifesteintrag). Er verhindert:

- jede unbegründete Änderung einer eingefrorenen Ausgangsfassung (`versions/2023-12-01.json`) – eine Änderung braucht
  eine dokumentierte Entscheidung (Bugfix, neue Evidenz, Review-Entscheidung, Schema-Upgrade) samt Freigabe;
- ein stilles Neuimportieren, Zurücknehmen oder Erweitern des Ausgangsbestands (Importer schreiben eingefrorene Baselines
  nie neu; der NSH- und der BayWü-Bulk enden bei jeder nicht freigegebenen Abweichung mit Exit 1 und erfassen sie als
  Review-Fall `baseline-frozen` – gemeinsame Entscheidung `freezeDecision` in `packages/importers/common/src/baseline-lock.ts`);
- jede Veränderung der realen Baseline-Provenienz.

Er verhindert **nicht** die Simulationsrechtsfortschreibung: neue Sim-Normen, neue Sim-Fassungen, Sim-Aufhebungen,
Sim-Verkündungen, additive Beziehungen und additive Historieneinträge entstehen weiter über
`import:simulation:consolidate` (G3 prüft die Additivität). Maßgeblich für jede fortgeschriebene Norm bleibt ihr
per-Norm-Seed: Eine Konsolidierung ist an den akzeptierten Inhalt ihrer Ausgangsfassung gebunden, nicht an den Freeze.
Ein Freeze wird nur auf ausdrückliche Entscheidung gesetzt. Ob ein Land dafür bereit ist, berechnet für NSH
`node scripts/nsh-freeze-readiness.ts --write` (`docs/NSH_BASELINE_FREEZE_READINESS.md`: `NOT READY`, `READY WITH HUMAN
REVIEW`, `BASELINE READY`); Sim-Quellenlücken (`SIM SOURCES PARTIAL`) sind davon getrennt und nie Blocker des
Ausgangsrechtsstands. Oberfläche und Dokumentation unterscheiden entsprechend **Baseline-Status** (Teilbestand,
eingefroren, Freeze-Readiness) und **Sim-Quellenstatus** (Vollständigkeit der Sim-Verkündungsblätter).

### 6.2 Rückwirkende Normen und der Ausgangsrechtsstand

Für den Ausgangsrechtsstand zum 01.12.2023 gilt, was an diesem Tag **verkündet** war. Eine erst nach dem Stichtag
ausgefertigte bzw. erlassene Norm gehört nicht zum Ausgangsrechtsbestand, auch wenn sie ihre Rechtswirkung rückwirkend
auf einen Zeitpunkt vor dem Stichtag anordnet (Ausfertigungs- bzw. Erlassdatum nach dem Stichtag ⇒ `enacted-after-baseline`,
`packages/importers/juris-sh/src/parse/source-law.ts`). Ebenso trägt eine erst nach dem Stichtag verkündete, rückwirkend
geltende Einzelfassung keine Stichtagsfassung, solange am Stichtag eine andere Fassung verkündet war
(`pipeline/historical.ts`). Nach dem Stichtag gilt allein Simulationsrecht; reale spätere Rechtsakte werden nicht
übernommen – auch nicht mittelbar über ihre Rückwirkung. Auf dieser Regel beruhen die zurückgenommenen NSH-Normen
Spielbankabgabenverordnung 2025 und EFGSH 2024 sowie die zwölf aus der Rekonstruktionsqueue genommenen, 2024 erlassenen
Verwaltungsvorschriften; sie bleiben mit dieser Begründung reproduzierbar ausgeschlossen. Ob eine juris-Einzelfassung
mit „Fassung vom“ nach dem Stichtag echte Rückwirkung oder nur eine Neubekanntmachung ist, entscheidet nicht juris
allein: ohne amtliche Veröffentlichung bleibt der Fall `baseline-validity-unresolved` (nicht importiert).

## 7 Vollständigkeit

Je Land wird in `data/simulation/<land>/completeness.json` getrennt bewertet: bekannte Ausgaben (aus Nummernfolgen,
Querverweisen, Verkündungsmitteilungen), vorhandene Ausgaben, Einzelverkündungen, fehlende oder verdächtige Nummern,
ungeklärte Zeiträume, sichere Rechtsakte, Review, Entwürfe ohne Verkündung. Status: `SIM SOURCES PARTIAL` ·
`SIM SOURCES COMPLETE FOR KNOWN INVENTORY` · `SIM LEGAL STATE COMPLETE` (nur, wenn belegbar). Der Teilbestandshinweis
der Oberfläche liest ihn aus `packages/legal-core/src/config/inventory-status.json` (`simulation`).

Format (`packages/importers/simulation/src/completeness/schema.ts`, fail-closed):

```json
{
  "schemaVersion": "landesrecht-simulation-completeness/1",
  "jurisdiction": "west",
  "assessedAt": "2026-09-28",
  "status": "SIM SOURCES PARTIAL",
  "series": [
    {
      "gazette": "GV. West",
      "seriesTitle": "Gesetz- und Verordnungsblatt für das Land Westdeutschland",
      "knownIssues": ["2024 Nr. 1", "2024 Nr. 2", "2024 Nr. 3", "2026 Nr. 2"],
      "presentIssues": ["2024 Nr. 2", "2024 Nr. 3", "2026 Nr. 2"],
      "missingIssues": ["2024 Nr. 1"],
      "suspiciousIssues": ["2026 Nr. 2"],
      "evidence": ["<sha256 der Belege für die Nummernfolge>"]
    }
  ],
  "standaloneActs": { "present": 12, "evidenceOnly": 2 },
  "unclearPeriods": [{ "from": "2024-06-01", "to": "2025-10-19", "note": "keine Ausgabe bekannt; Nummernfolge springt" }],
  "acts": { "secure": 31, "review": 4, "blocked": 1, "draftsWithoutPromulgation": 3 },
  "notes": ["Nr. 1/2024 laut Inhaltsverzeichnis von Nr. 2 vorhanden, Datei fehlt."]
}
```

- `series[]`: je Blatt (Kürzel wie gedruckt) die Ausgabenbezeichnungen; `presentIssues` ⊆ `knownIssues`,
  `missingIssues` = `knownIssues` ohne `presentIssues` (wird nachgerechnet, Abweichung = Fehler); `suspiciousIssues`
  und `evidence` (SHA-256) sind Hinweise. `standaloneActs` zählt Einzelverkündungen ohne Blattausgabe (vorhanden /
  nur durch Mitteilung belegt). `acts`: sicher belegte und übernommene Akte, in Prüfung, gesperrt (Ziel nicht sicher
  im Bestand), Entwürfe ohne Verkündungsbeleg.
- Der Status muss belegbar sein: `SIM SOURCES COMPLETE FOR KNOWN INVENTORY` und `SIM LEGAL STATE COMPLETE` vertragen
  weder `missingIssues` noch `unclearPeriods`; `SIM LEGAL STATE COMPLETE` verträgt keine Akte in `review` oder `blocked`.
- `npm run import:simulation:completeness -- --write [--jurisdiction <land>]` zählt aus `content/norms/<land>/` die
  Baseline-Normen (Fassung am Ausgangsrechtsstand) und die eigenen Sim-Normen (erste Fassung danach) und schreibt je Land
  den Block `simulation` (`status`, `knownIssues`, `presentIssues`, `secureActs`, `review` = `acts.review + acts.blocked`,
  `draftsWithoutPromulgation`, `simulationNorms`, `updatedAt` = `assessedAt`) in `inventory-status.json`. Der
  Stichtagsteil (`complete`, `published`, `pending`) bleibt Sache der Importer; ein Land ohne Eintrag (West) erhält ihn
  mit `complete: true` und der gezählten Baseline-Normzahl. Die Oberfläche (`InventoryNotice.astro`) weist
  Baseline-Normzahl (`published`) und Sim-Normzahl (`simulationNorms`) getrennt aus („Sicher belegter Rechtsstand zum
  1. Dezember 2023 …; Simulationsrecht: n Rechtsakte aus m Ausgaben übernommen, k in Prüfung; Quellensammlung
  unvollständig …“) und entfällt automatisch, sobald `complete: true` und `SIM LEGAL STATE COMPLETE` gelten.

## 8 Sim-Quellenarchiv in R2

Die Originaldateien des Inventars liegen unverändert im Bucket `landesrecht-quellen` unter
`<jurisdiction>/simulation/<sha256>.<ext>` (Endung der Originaldatei wie die Cachekopie `.cache/simulation/archive/`),
daneben `<schlüssel>.envelope.json` (Originaldateiname(n), Archivpfade, SHA-256, Größe, Medienart,
`jurisdictionCandidate`, Inventar-Zeitpunkt). Muster und Bausteine: `packages/importers/juris-sh/src/r2/` und die
Transporte aus `@landesrecht/importer-recht-nrw/common/r2-transport.ts`; `guardTransport` lässt nur Schlüssel unter
`<jurisdiction>/simulation/` zu, einen Löschweg gibt es nicht.

```sh
npm run import:simulation:r2-sync                              # Dry-run: nichts geschrieben, kein Netz
npm run import:simulation:r2-sync -- --stage-only               # Staging .cache/simulation-r2-staging/, Manifest, Bericht (kein Netz)
npm run import:simulation:r2-sync -- --write [--r2-transport wrangler|wrangler-api] [--concurrency n] [--verify readback|etag] [--limit n]
```

- Auswahl: alle Quellen aus `data/simulation/source-inventory.json`; Staging nachgerechnet (SHA-256, Größe) aus der
  Cachekopie, eine Staging-Datei mit anderem Inhalt oder ein Umschlag mit abweichenden Kernfeldern ist ein Konflikt (kein
  Upload). Manifest `data/simulation/r2-archive.json` (Schlüssel, Größe, Medienart, Dateinamen, Status `staged` →
  `verified`, nie zurückgestuft), Bericht `data/audits/simulation/R2_ARCHIVE.{json,md}`.
- Upload nur über die Wrangler-OAuth-Anmeldung (`wrangler` Standard, `wrangler-api` optional; `CLOUDFLARE_API_TOKEN`
  wird abgelehnt). `readback` liest jedes Objekt zurück (SHA-256); `etag` prüft über das Listing je Jurisdiktionspräfix
  (Größe + MD5-Etag) nach. Vorhandene Objekte mit gleichem Inhalt zählen als vorhanden, anderer Inhalt ist ein harter
  Fehler; Umschläge sind unveränderlich. Abbrüche sind über das Manifest fortsetzbar.
- Sim-Belege in Normen und Verkündungen nennen diese Schlüssel (`objectKey`, `sha256`); der Bucket bleibt privat.
