# OstRecht-Kompatibilität

OstRecht (`../staatsregierung`, `apps/recht`, `content/normen/`) bleibt fachliche Source of Truth
für den Freistaat Ostdeutschland. Dieses Repository pflegt ostdeutsche Normen nicht selbst und
kopiert den OstRecht-Bestand nicht; es definiert eine Übernahme-/Synchronisationsschnittstelle.

## Bausteine

- `packages/providers/src/ostrecht.ts` – Adapter: OstRecht-Rohdatensatz (`meta.json`,
  `history.json`, `versions/*.json`) → kanonischer `NormRecord`.
- `packages/providers/src/ostrecht-provider.ts` – `LegalProvider` für `ost`: mit adaptierten
  Datensätzen vollwertig, sonst reine Verweisauflösung auf das öffentliche OstRecht
  (`https://recht.freistaat-ostdeutschland.de/norm/<slug>/[version/<id>/]#<anker>`).
- `packages/importers/ostrecht` – liest OstRecht-Normordner (`readOstRechtRecord`,
  `importOstRechtNorm`); ein schreibender Sync-Lauf ist bewusst noch nicht vorgesehen.
- Resolver-Priorität (`apps/web/src/lib/runtime/context.ts`): `ost` → OstRechtProvider. Sobald
  ostdeutsche Normen intern vorliegen, wird der ContentProvider davor gestellt.

## Abbildung

| OstRecht | Landesrecht |
| --- | --- |
| `meta.id`/`slug` | `id = ost:<slug>`, `slug`, `jurisdiction = ost`, `externalIdentifiers += { system: ostrecht, value: <slug> }` |
| `sourceReferences[].kind = revosax-snapshot`, `lawId`, `fsnNumber` | `kind = official-portal-snapshot`, `system = revosax`, `externalId`, `sourceNumber`; zusätzlich `externalIdentifiers += { system: revosax, value: <lawId>, url }` |
| `structured-html-transcription`, `legacy-/supplementary-markdown-transcription`, `structured-docx-source` | `structured-transcription` (`system = ostrecht`) |
| `amendment-source`, `primary-pdf` | gleichnamig |
| `availability = versioned` + `localSource` (Datei im OstRecht-Repo) | `availability = external` mit `note: OstRecht-Repository: <pfad>` (die Datei liegt nicht hier) |
| `availability = r2-archived` | unverändert (`objectKey`, `sha256`, `url`, `retrievedAt`) |
| `validFrom`/`validTo` | `simulationValidFrom`/`simulationValidTo` |
| `sourceValidFrom/To` der REVOSax-Quelle | `sourceValidFrom/To` der Fassung |
| `isCurrent` | entfällt (abgeleitet) |
| `ministry`/`responsibleMinistry` | `responsibleBody` |
| `originEnactingBody`, `enactingBody` | gleichnamig |
| `predecessorSlug`/`successorSlug` | `predecessorTarget`/`successorTarget` |
| `enactingNorm`, `enactedNorm(s)`, `containedIn`, `affectedNorms`, `affectedByNorms`, `relatedNorms` | `relations[]` (`part-of`, `contains`, `amends`, `amended-by`, `related`) |
| `history.entries[].relatedNorm` (Slug) | `relatedNorm: { slug }` |
| Body-Blöcke (17 Typen) | unverändert; das Schema ist eine Obermenge |
| Status-Aliasse (`published`, `aufgehoben`, `draft`) | normalisiert |

## Prüfung

`tests/unit/ostrecht-compatibility.test.ts` übernimmt eine kleine synthetische Norm im
OstRecht-Format (Struktur wie das Ostdeutsche Schulgesetz: Abschnitt, Paragraphen, Absätze,
Nummerierungen, Anlage mit Tabelle, REVOSax-Quelle mit Quellintervall, zwei Fassungen) verlustfrei,
projiziert sie und löst Verweise auf OstRecht auf. Liegt `../staatsregierung` vor, wird
zusätzlich das reale Ostdeutsche Schulgesetz nur lesend adaptiert und projiziert.

## Bewusst nicht übernommen

REVOSax-Spalten und -Felder im Kern, `origin_kind`/Inventarregeln, sächsische
Sachgebietssystematik, Gazette-Muster der Suche, Konsolidierungs- und Rechtsüberleitungsskripte
(sie bleiben OstRecht-Werkzeuge; eine Entsprechung für West/NSH/BayWü entsteht mit den Importern).
