# R2-Archiv der Sim-Rechtsquellen

Erzeugt von `node scripts/import-simulation.ts r2-sync --write` am 2026-09-28. Bucket `landesrecht-quellen`, Schlüssel `<jurisdiction>/simulation/<sha256>.<ext>` (+ `.envelope.json`), Staging `.cache/simulation-r2-staging/` (nicht versioniert), Manifest `data/simulation/r2-archive.json`.

| Kennzahl | Wert |
| --- | --- |
| Quellen im Inventar | 131 (64 MB) |
| neu gestagt | 8 |
| bereits gestagt | 0 |
| bereits in R2 (verified) | 123 |
| ohne Cachekopie | 0 |
| Konflikte | 0 |
| hochgeladen | 8 |
| in R2 bereits vorhanden (gleicher Inhalt) | 0 |
| nachgeprüft (readback) | 8 |
| Staging fehlt | 0 |

| Jurisdiktion | gestagt | nachgeprüft |
| --- | ---: | ---: |
| baywue | 0 | 41 |
| nsh | 0 | 56 |
| west | 0 | 34 |

Upload (nur mit Wrangler-OAuth-Anmeldung, fortsetzbar): `npm run import:simulation:r2-sync -- --write [--r2-transport wrangler-api --concurrency 16 --verify etag]`.

