# R2-Rohquellenarchiv BayWü

Bucket `landesrecht-quellen` (privat), Präfix `baywue/bayernrecht/2023-12-01/`. Lauf 2026-09-19T14:00:32.705Z – 2026-09-19T14:03:36.150Z (183 s), Transport `wrangler-api`.

Status: **verified**

## Manifest und Staging

| Kennzahl | Wert |
| --- | --- |
| Manifesteinträge | 2.404 |
| übernommene Normen (imported, imported-with-warnings) | 1.700 |
| Rohquellen der übernommenen Normen | 2.351 (459.3 MiB, 481.602.138 Bytes) |
| Archivstatus im Manifest | verified 2.351 |
| Staging `.cache/bayernrecht-r2-staging` | 2.351 Rohobjekte + 2.351 Umschläge |
| fehlende erwartete Objekte im Staging | 0 |
| Größe / SHA-256 abweichend (nachgerechnet) | 0 / 0 |
| Umschläge abweichend | 0 |
| Manifestbefunde (Bucket, Schlüssel, Status) | 0 |
| Schlüssel außerhalb des Präfixes | 0 |
| nur im Staging (kein Upload-Soll) | 2 |
| Staging-Audit | bestanden |

## Sync

| Kennzahl | Wert |
| --- | --- |
| Prüfregime | etag (Listing: Existenz, Größe, Etag = MD5; deterministische Byte-Stichprobe je Charge) |
| Parallelität | 32 |
| offen vor dem Lauf (staged/uploaded) | 2.057 |
| hochgeladen: Rohobjekte / Umschläge | 0 / 0 (0.0 MiB) |
| bereits vorhanden (gleicher Inhalt): Rohobjekte / Umschläge | 2.057 / 2.057 |
| davon Umschläge mit archiviertem Stand beibehalten (Kernfelder gleich, beschreibende Felder abweichend) | 0 |
| per Listing nachgeprüft (Größe + MD5) | 4.114 |
| Byte-Rücklesungen im Sync (SHA-256) | 34 |
| Listings | 10 |
| auf verified gesetzt | 2.057 |
| Dauer Sync | 75 s |

## Nachprüfung (nur lesend)

| Kennzahl | Wert |
| --- | --- |
| Objekte unter `baywue/bayernrecht/2023-12-01/` | 4.704 (461.3 MiB, 483.700.314 Bytes) |
| davon Rohobjekte / Umschläge | 2.351 (459.3 MiB) / 2.351 |
| erwartet (Rohobjekte + Umschläge) | 4.702 |
| fehlend / noch offen | 0 / 0 |
| Größe abweichend / Etag (MD5) abweichend | 0 / 0 |
| unerwartet unter dem Präfix | 0 |
| archiviert, Norm aus dem Stichtagsbestand zurückgenommen (bleibt, kein Widerspruch) | 2 |
| Manifest nicht verified | 0 |
| deterministische Byte-Stichprobe (Saat `2023-12-01`, SHA-256 nach Download) | 150 von 150 geprüft, 0 Fehler, 25.5 MiB |
| Umschlag-Stichprobe (Kernfelder; bytegleich außer archiviertem Stand mit abweichendem Titel) | 25 geprüft, 0 Fehler, 1 mit archiviertem Titel |
| Ergebnis | **0 Abweichungen** |

## Bucket vorher/nachher (Listing, nur lesend)

| Kennzahl | vorher | nachher |
| --- | --- | --- |
| Zeitpunkt | 2026-09-19T14:01:26.912Z | 2026-09-19T14:03:36.143Z |
| Objekte gesamt | 42.870 (2011.8 MiB) | 42.870 (2011.8 MiB) |
| unter `baywue/` | 4.704 (461.3 MiB) | 4.704 (461.3 MiB) |
| außerhalb `baywue/` | 38.166 | 38.166 |
| `baywue/` | 4.704 (461.3 MiB) | 4.704 (461.3 MiB) |
| `nsh/` | 15.454 (714.6 MiB) | 15.454 (714.6 MiB) |
| `west/` | 22.712 (835.9 MiB) | 22.712 (835.9 MiB) |
| Fingerabdruck außerhalb `baywue/` (Schlüssel, Größe, Etag) | `c5ee1078b02d5d29…` | `c5ee1078b02d5d29…` |

Außerhalb von `baywue/` ist der Bucket unverändert (gleicher Fingerabdruck über Schlüssel, Größe und Etag).

## Läufe dieses Archivs

17 Läufe, 2026-09-18T06:44:37.545Z – 2026-09-19T14:03:36.150Z (112739 s Wanduhr, 2535 s Laufzeit). Vor dem ersten Lauf: 22.712 Objekte im Bucket, 0 unter `baywue/`; nach dem letzten Lauf: 42.870 Objekte, 4.704 unter `baywue/`. Fingerabdruck außerhalb `baywue/` über alle Messungen: **verändert**.

| Beginn | Ende | Status | hochgeladen Roh / Umschlag | bereits vorhanden | Bucket vorher (gesamt / baywue) | Bucket nachher (gesamt / baywue) | Befund |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-18T06:44:37.545Z | 2026-09-18T06:47:04.469Z | failed | – / – | – | 22.712 / 0 | – | R2 baywue/bayernrecht/2023-12-01/vwv/bayvv-1140-s-070-0a773084bf28/bfc357c1750d818b-text-document.zip.envelope.json: PUT HTTP 403 (10042: Please enable R2 throu |
| 2026-09-18T06:47:34.131Z | 2026-09-18T06:54:23.183Z | verified | 760 / 761 | 400 | 24.311 / 1.599 | 25.832 / 3.120 | – |
| 2026-09-18T06:57:35.017Z | 2026-09-18T06:58:35.592Z | verified | 0 / 0 | 0 | 25.832 / 3.120 | 25.832 / 3.120 | – |
| 2026-09-18T08:27:36.131Z | 2026-09-18T08:30:00.000Z | verified | 46 / 46 | 1.560 | 25.832 / 3.120 | 25.924 / 3.212 | – |
| 2026-09-18T09:01:21.446Z | 2026-09-18T09:02:08.862Z | failed | 0 / 0 | 121 | 25.924 / 3.212 | – | R2-Objekt baywue/bayernrecht/2023-12-01/landesrecht/baybierstbek-f1bac32fde3f/91853a9b6e17e652-text-document.zip.envelope.json existiert mit anderem Inhalt (Grö |
| 2026-09-18T09:05:23.582Z | 2026-09-18T09:07:23.998Z | failed | 0 / 0 | 1.606 | 25.924 / 3.212 | 25.924 / 3.212 | – |
| 2026-09-18T09:08:15.782Z | 2026-09-18T09:09:17.004Z | verified | 0 / 0 | 0 | 25.924 / 3.212 | 25.924 / 3.212 | – |
| 2026-09-18T11:34:42.175Z | 2026-09-18T11:39:35.222Z | verified | 358 / 358 | 1.606 | 25.924 / 3.212 | 26.640 / 3.928 | – |
| 2026-09-18T13:48:14.436Z | 2026-09-18T13:50:56.983Z | verified | 54 / 54 | 1.934 | 26.640 / 3.928 | 26.748 / 4.036 | – |
| 2026-09-18T15:44:11.688Z | 2026-09-18T15:46:40.150Z | verified | 65 / 65 | 1.964 | 26.748 / 4.036 | 26.878 / 4.166 | – |
| 2026-09-18T16:03:48.193Z | 2026-09-18T16:04:54.049Z | verified | 0 / 0 | 0 | 26.878 / 4.166 | 26.878 / 4.166 | – |
| 2026-09-18T22:17:36.699Z | 2026-09-18T22:20:29.310Z | verified | 233 / 233 | 1.977 | 26.878 / 4.166 | 27.344 / 4.632 | – |
| 2026-09-18T23:22:45.482Z | 2026-09-18T23:24:54.357Z | verified | 7 / 7 | 2.020 | 27.344 / 4.632 | 27.358 / 4.646 | – |
| 2026-09-19T06:32:13.346Z | 2026-09-19T06:34:44.966Z | failed | 13 / 13 | 2.027 | 27.358 / 4.646 | 27.384 / 4.672 | – |
| 2026-09-19T06:36:23.386Z | 2026-09-19T06:37:25.224Z | verified | 0 / 0 | 0 | 27.384 / 4.672 | 27.384 / 4.672 | – |
| 2026-09-19T13:55:29.311Z | 2026-09-19T13:58:26.065Z | failed | 16 / 16 | 2.041 | 42.838 / 4.672 | 42.870 / 4.704 | – |
| 2026-09-19T14:00:32.705Z | 2026-09-19T14:03:36.150Z | verified | 0 / 0 | 2.057 | 42.870 / 4.704 | 42.870 / 4.704 | – |

## Regeln dieses Laufs

- Anmeldung ausschließlich über die bestehende Wrangler-OAuth-Anmeldung; kein API-Token, keine S3-Schlüssel.
- Geschrieben wird nur unter `baywue/bayernrecht/2023-12-01/`; jeder andere Schlüssel ist ein harter Fehler (Präfixschutz). Nichts wird gelöscht oder überschrieben.
- Der Bucket bleibt privat; keine öffentliche URL, kein r2.dev, keine Custom Domain.
- Die Normdateien unter `content/norms/baywue/` bleiben unberührt; die Archivierung steht im Manifest (`bucket`, `objectKey`, `archiveStatus`).

Befehl: `npm run import:bayernrecht:r2-sync -- --write --r2-transport wrangler-api --concurrency 32 --verify etag`
