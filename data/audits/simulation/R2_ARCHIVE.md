# R2-Archiv der Sim-Rechtsquellen

Erzeugt von `node scripts/import-simulation.ts r2-sync --write` am 2026-09-28. Bucket `landesrecht-quellen`, Schlüssel `<jurisdiction>/simulation/<sha256>.<ext>` (+ `.envelope.json`), Staging `.cache/simulation-r2-staging/` (nicht versioniert), Manifest `data/simulation/r2-archive.json`.

| Kennzahl | Wert |
| --- | --- |
| Quellen im Inventar | 123 (62 MB) |
| neu gestagt | 0 |
| bereits gestagt | 123 |
| bereits in R2 (verified) | 0 |
| ohne Cachekopie | 0 |
| Konflikte | 0 |
| hochgeladen | 123 |
| in R2 bereits vorhanden (gleicher Inhalt) | 0 |
| nachgeprüft (etag) | 123 |
| Staging fehlt | 0 |

| Jurisdiktion | gestagt | nachgeprüft |
| --- | ---: | ---: |
| baywue | 0 | 39 |
| nsh | 0 | 51 |
| west | 0 | 33 |

Upload (nur mit Wrangler-OAuth-Anmeldung, fortsetzbar): `npm run import:simulation:r2-sync -- --write [--r2-transport wrangler-api --concurrency 16 --verify etag]`.

