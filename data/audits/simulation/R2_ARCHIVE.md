# R2-Archiv der Sim-Rechtsquellen

Erzeugt von `node scripts/import-simulation.ts r2-sync --write` am 2026-09-28. Bucket `landesrecht-quellen`, Schlüssel `<jurisdiction>/simulation/<sha256>.<ext>` (+ `.envelope.json`), Staging `.cache/simulation-r2-staging/` (nicht versioniert), Manifest `data/simulation/r2-archive.json`.

| Kennzahl | Wert |
| --- | --- |
| Quellen im Inventar | 132 (64 MB) |
| neu gestagt | 1 |
| bereits gestagt | 0 |
| bereits in R2 (verified) | 131 |
| ohne Cachekopie | 0 |
| Konflikte | 0 |
| hochgeladen | 1 |
| in R2 bereits vorhanden (gleicher Inhalt) | 0 |
| nachgeprüft (readback) | 1 |
| Staging fehlt | 0 |

| Jurisdiktion | gestagt | nachgeprüft |
| --- | ---: | ---: |
| baywue | 0 | 42 |
| nsh | 0 | 56 |
| west | 0 | 34 |

Upload (nur mit Wrangler-OAuth-Anmeldung, fortsetzbar): `npm run import:simulation:r2-sync -- --write [--r2-transport wrangler-api --concurrency 16 --verify etag]`.

