# R2-Staging juris Schleswig-Holstein

Erzeugt von `node scripts/import-juris-sh.ts r2-sync --write`. Bucket `landesrecht-quellen`, Präfix `nsh/juris-sh/2023-12-01/`, Staging `.cache/juris-sh-r2-staging/` (nicht versioniert).

| Kennzahl | Wert |
| --- | --- |
| übernommene Normen | 2450 |
| Rohquellen (PDF) | 8339 (751 MB) |
| neu gestagt | 0 |
| bereits gestagt | 785 |
| bereits in R2 (uploaded/verified) | 7554 |
| ohne Cache | 0 |
| Konflikte | 0 |
| hochgeladen und rückgelesen | 785 |
| in R2 bereits vorhanden (gleicher Inhalt) | 0 |
| Normen vollständig geprüft | 77 |

Upload (nur mit Wrangler-OAuth-Anmeldung, fortsetzbar): `npm run import:juris-sh:r2-sync -- --write` (optional `--r2-transport wrangler-api --concurrency 8`).

