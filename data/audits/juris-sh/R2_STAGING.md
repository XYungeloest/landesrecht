# R2-Staging juris Schleswig-Holstein

Erzeugt von `node scripts/import-juris-sh.ts r2-sync --stage-only`. Bucket `landesrecht-quellen`, Präfix `nsh/juris-sh/2023-12-01/`, Staging `.cache/juris-sh-r2-staging/` (nicht versioniert).

| Kennzahl | Wert |
| --- | --- |
| übernommene Normen | 1910 |
| Rohquellen (PDF) | 6098 (302 MB) |
| neu gestagt | 0 |
| bereits gestagt | 6098 |
| bereits in R2 (uploaded/verified) | 0 |
| ohne Cache | 0 |
| Konflikte | 0 |
| Upload | nicht ausgeführt (kein Netz) |

Upload (nur mit Wrangler-OAuth-Anmeldung, fortsetzbar): `npm run import:juris-sh:r2-sync -- --write` (optional `--r2-transport wrangler-api --concurrency 8`).

