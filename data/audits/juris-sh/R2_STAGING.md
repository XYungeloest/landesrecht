# R2-Staging juris Schleswig-Holstein

Erzeugt von `node scripts/import-juris-sh.ts r2-sync --write`. Bucket `landesrecht-quellen`, Präfix `nsh/juris-sh/2023-12-01/`, Staging `.cache/juris-sh-r2-staging/` (nicht versioniert).

| Kennzahl | Wert |
| --- | --- |
| übernommene Normen | 2592 |
| Rohquellen (PDF) | 9844 (852 MB) |
| neu gestagt | 0 |
| bereits gestagt | 1258 |
| bereits in R2 (uploaded/verified) | 8586 |
| ohne Cache | 0 |
| Konflikte | 0 |
| hochgeladen und rückgelesen | 0 |
| in R2 bereits vorhanden (gleicher Inhalt) | 1258 |
| Normen vollständig geprüft | 86 |

Upload (nur mit Wrangler-OAuth-Anmeldung, fortsetzbar): `npm run import:juris-sh:r2-sync -- --write` (optional `--r2-transport wrangler-api --concurrency 8`).

