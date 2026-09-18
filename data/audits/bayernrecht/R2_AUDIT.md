# R2-Rohquellenarchiv BayWü

Bucket `landesrecht-quellen` (privat), Präfix `baywue/bayernrecht/2023-12-01/`. Lauf 2026-09-18T09:08:15.782Z – 2026-09-18T09:09:17.004Z (61 s), Transport `wrangler-api`.

Status: **verified**

## Manifest und Staging

| Kennzahl | Wert |
| --- | --- |
| Manifesteinträge | 2.343 |
| übernommene Normen (imported, imported-with-warnings) | 1.582 |
| Rohquellen der übernommenen Normen | 1.606 (378.7 MiB, 397.102.621 Bytes) |
| Archivstatus im Manifest | verified 1.606 |
| Staging `.cache/bayernrecht-r2-staging` | 1.606 Rohobjekte + 1.606 Umschläge |
| fehlende erwartete Objekte im Staging | 0 |
| Größe / SHA-256 abweichend (nachgerechnet) | 0 / 0 |
| Umschläge abweichend | 0 |
| Manifestbefunde (Bucket, Schlüssel, Status) | 0 |
| Schlüssel außerhalb des Präfixes | 0 |
| nur im Staging (kein Upload-Soll) | 0 |
| Staging-Audit | bestanden |

## Sync

| Kennzahl | Wert |
| --- | --- |
| Prüfregime | etag (Listing: Existenz, Größe, Etag = MD5; deterministische Byte-Stichprobe je Charge) |
| Parallelität | 32 |
| offen vor dem Lauf (staged/uploaded) | 0 |
| hochgeladen: Rohobjekte / Umschläge | 0 / 0 (0.0 MiB) |
| bereits vorhanden (gleicher Inhalt): Rohobjekte / Umschläge | 0 / 0 |
| davon Umschläge mit archiviertem Stand beibehalten (Kernfelder gleich, beschreibende Felder abweichend) | 0 |
| per Listing nachgeprüft (Größe + MD5) | 0 |
| Byte-Rücklesungen im Sync (SHA-256) | 0 |
| Listings | 0 |
| auf verified gesetzt | 0 |
| Dauer Sync | 0 s |

## Nachprüfung (nur lesend)

| Kennzahl | Wert |
| --- | --- |
| Objekte unter `baywue/bayernrecht/2023-12-01/` | 3.212 (380.0 MiB, 398.507.834 Bytes) |
| davon Rohobjekte / Umschläge | 1.606 (378.7 MiB) / 1.606 |
| erwartet (Rohobjekte + Umschläge) | 3.212 |
| fehlend / noch offen | 0 / 0 |
| Größe abweichend / Etag (MD5) abweichend | 0 / 0 |
| unerwartet unter dem Präfix | 0 |
| Manifest nicht verified | 0 |
| deterministische Byte-Stichprobe (Saat `2023-12-01`, SHA-256 nach Download) | 150 von 150 geprüft, 0 Fehler, 51.7 MiB |
| Umschlag-Stichprobe (Kernfelder; bytegleich außer archiviertem Stand mit abweichendem Titel) | 25 geprüft, 0 Fehler, 1 mit archiviertem Titel |
| Ergebnis | **0 Abweichungen** |

## Bucket vorher/nachher (Listing, nur lesend)

| Kennzahl | vorher | nachher |
| --- | --- | --- |
| Zeitpunkt | 2026-09-18T09:08:41.692Z | 2026-09-18T09:09:16.998Z |
| Objekte gesamt | 25.924 (1216.0 MiB) | 25.924 (1216.0 MiB) |
| unter `baywue/` | 3.212 (380.0 MiB) | 3.212 (380.0 MiB) |
| außerhalb `baywue/` | 22.712 | 22.712 |
| `baywue/` | 3.212 (380.0 MiB) | 3.212 (380.0 MiB) |
| `west/` | 22.712 (835.9 MiB) | 22.712 (835.9 MiB) |
| Fingerabdruck außerhalb `baywue/` (Schlüssel, Größe, Etag) | `37d6a6d9f304fb79…` | `37d6a6d9f304fb79…` |

Außerhalb von `baywue/` ist der Bucket unverändert (gleicher Fingerabdruck über Schlüssel, Größe und Etag).

## Läufe dieses Archivs

7 Läufe, 2026-09-18T06:44:37.545Z – 2026-09-18T09:09:17.004Z (8679 s Wanduhr, 989 s Laufzeit). Vor dem ersten Lauf: 22.712 Objekte im Bucket, 0 unter `baywue/`; nach dem letzten Lauf: 25.924 Objekte, 3.212 unter `baywue/`. Fingerabdruck außerhalb `baywue/` über alle Messungen: unverändert.

| Beginn | Ende | Status | hochgeladen Roh / Umschlag | bereits vorhanden | Bucket vorher (gesamt / baywue) | Bucket nachher (gesamt / baywue) | Befund |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-18T06:44:37.545Z | 2026-09-18T06:47:04.469Z | failed | – / – | – | 22.712 / 0 | – | R2 baywue/bayernrecht/2023-12-01/vwv/bayvv-1140-s-070-0a773084bf28/bfc357c1750d818b-text-document.zip.envelope.json: PUT HTTP 403 (10042: Please enable R2 throu |
| 2026-09-18T06:47:34.131Z | 2026-09-18T06:54:23.183Z | verified | 760 / 761 | 400 | 24.311 / 1.599 | 25.832 / 3.120 | – |
| 2026-09-18T06:57:35.017Z | 2026-09-18T06:58:35.592Z | verified | 0 / 0 | 0 | 25.832 / 3.120 | 25.832 / 3.120 | – |
| 2026-09-18T08:27:36.131Z | 2026-09-18T08:30:00.000Z | verified | 46 / 46 | 1.560 | 25.832 / 3.120 | 25.924 / 3.212 | – |
| 2026-09-18T09:01:21.446Z | 2026-09-18T09:02:08.862Z | failed | 0 / 0 | 121 | 25.924 / 3.212 | – | R2-Objekt baywue/bayernrecht/2023-12-01/landesrecht/baybierstbek-f1bac32fde3f/91853a9b6e17e652-text-document.zip.envelope.json existiert mit anderem Inhalt (Grö |
| 2026-09-18T09:05:23.582Z | 2026-09-18T09:07:23.998Z | failed | 0 / 0 | 1.606 | 25.924 / 3.212 | 25.924 / 3.212 | – |
| 2026-09-18T09:08:15.782Z | 2026-09-18T09:09:17.004Z | verified | 0 / 0 | 0 | 25.924 / 3.212 | 25.924 / 3.212 | – |

## Regeln dieses Laufs

- Anmeldung ausschließlich über die bestehende Wrangler-OAuth-Anmeldung; kein API-Token, keine S3-Schlüssel.
- Geschrieben wird nur unter `baywue/bayernrecht/2023-12-01/`; jeder andere Schlüssel ist ein harter Fehler (Präfixschutz). Nichts wird gelöscht oder überschrieben.
- Der Bucket bleibt privat; keine öffentliche URL, kein r2.dev, keine Custom Domain.
- Die Normdateien unter `content/norms/baywue/` bleiben unberührt; die Archivierung steht im Manifest (`bucket`, `objectKey`, `archiveStatus`).

Befehl: `npm run import:bayernrecht:r2-sync -- --write --r2-transport wrangler-api --concurrency 32 --verify etag`
