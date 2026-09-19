# Bereitschaft und Stand des NSH-Ausgangsimports

**Stand 2026-09-19 (Run 6) · Readiness: READY · Bestand: 1 910 Normen unter `content/norms/nsh` (lokal, nicht
committet, nicht deployt) · R2: gestagt, nicht hochgeladen.**

Maschinelle Prüfung: `npm run import:juris-sh:readiness` (`data/audits/juris-sh/READINESS.md`). Kennzahlen je
Dokument: `data/audits/juris-sh/CORPUS_INVENTORY.md`, `corpus-inventory.json`. Zugriffslage und TDM-Vorbehalt:
`docs/SCHLESWIG_HOLSTEIN_ACCESS_CONSTRAINT.md`.

## 1 Quelle und Zugriffsweg

- **Normtext:** öffentliche PDF-Ausgabe des Bürgerservice Schleswig-Holstein (juris), `GET
  /jportal/recherche3doc/<Name>.pdf?json={format: pdf, docPart: X, docId, portalId: bssh}`, mit der anonymen
  Sitzung, die der öffentliche Permalink-Aufruf `/perma?d=…` selbst setzt. Kein Login, kein CSRF-Token; die interne
  Schnittstelle `/jportal/wsrest/` wurde in keinem Lauf aufgerufen.
- **Stichtagsfassung geänderter, nach dem Stichtag aufgehobener und unbestimmter Normen:** dieselbe Ausgabe ohne
  `docPart` liefert jede Einzelfassung („genau dieses Dokument“) mit „Fassung vom“, „Gültig ab“, „Gültig bis“. Je
  Einheit gilt die Fassung mit Gültig ab ≤ 2023-12-01 ≤ Gültig bis; führt juris eine abgelöste Fassung ohne Ende
  weiter, trägt die später erlassene. Übernommen wird nur, wenn jede Einheit eindeutig ist, die Reihenfolge der
  Paragraphen aufsteigt, Titel (jüngste gewählte Fassung) und Gliederungsnummer dem Rahmendokument entsprechen, keine
  gewählte Fassung rückwirkend nach dem Stichtag erlassen wurde und die Textintegrität gegen genau diese Zeilen
  stimmt. Sonst Review mit Grund. Der heutige Text ersetzt nie die Stichtagsfassung.
- **Belege:** Ausgabe (Kopf, Ausgabevermerk, „Stand: letzte berücksichtigte Änderung“, Gültigkeit je Einheit) und das
  bestehende Ereignisregister (5 857 Ereignisse, weiterverwendet, nicht neu gebaut) nach den Regeln A/B/C
  (`common/evidence.ts`). Registeränderung nach dem Stichtag, die die Ausgabe nicht zeigt → Widerspruch → Review.

## 2 Vollkorpus

| Schritt | Ergebnis |
| --- | --- |
| Enumeration (Sitemap, Fixpunkt) | 2 808 Rahmendokumente Landesrecht, 2 389 Verwaltungsvorschriften |
| PDF-Gesamtausgaben | 5 195 / 5 197 (2 × HTTP 500 des Portals, wiederholt, bleiben draußen) |
| Einzelfassungen | 18 636 für 417 Rahmendokumente (nach dem Stichtag geändert oder aufgehoben, dazu unbestimmte, die die Einzelfassungen entscheiden können); vollständig, 0 Fehler |
| Netzabrufe Vollkorpus | 5 169 (Gesamtausgaben) + 15 782 + 2 486 (Einzelfassungen) = 23 437; 0 Sperrantworten, 14 Wiederholungen, 6 anonyme Sitzungen; Cache 1,4 GB |
| Textintegrität | exact 5 193, review 1, mismatch 1 (beide im Review); alle 1 910 übernommenen Normen exact |
| Zweite Quelle (amtliche Register) | Systematische Übersicht GVOBl. 96,9 %, Erlassverzeichnis Amtsbl. 96,2 % (Gliederungsnummer oder Titel; Änderungs-/Mantelgesetze und Tarifverträge ausgenommen); Rest in der Rekonstruktionsqueue (`register-only-not-in-juris`) |

## 3 Ergebnis (`bulk --write`)

| Ausgang | Anzahl |
| --- | --- |
| übernommen (`imported` / `imported-with-warnings`) | **1 910** (436 / 1 474): 1 089 Landesrecht (655 Verordnungen, 395 Gesetze, 38 Zustimmungsgesetze, Verfassung), 821 Verwaltungsvorschriften |
| davon Stichtagsfassung aus Einzelfassungen | 245 (148 nach dem Stichtag geändert, 44 nach dem Stichtag aufgehoben, 53 zuvor unbestimmt) |
| Review (`needs-review`) | 1 561 (darunter 56 Rekonstruktion offen) |
| nicht am Stichtag | 1 720 |
| fehlgeschlagen (Titel nicht erkennbar: zwei Erlassregister, zwei VwV) | 4 |
| ohne PDF (Portalfehler) | 2 |

`imported-with-warnings`: Übernahme mit offener, nicht sperrender Entscheidung (Erlassorgan ohne gesicherte
NSH-Entsprechung, Institutionsbezeichnungen mit Kategoriestandard review). Slugkollisionen sind akzeptierte technische
Kollisionen (eindeutiger Slug mit Kennungssuffix, Registry stabil) – Befund `info` im Manifest, kein Review-Fall.
Die Oberfläche weist NSH als **Teilbestand** aus (`packages/legal-core/src/config/inventory-status.json`, Eintrag `nsh`:
veröffentlicht 1 910, offen am Stichtag 1 547, baseline-only 5, unentschieden 20).

**baseline-only (54 Kandidaten des Registers):** 49 einem juris-Dokument zugeordnet – 28 übernommen (Stichtagsfassung
aus den Einzelfassungen), 13 Review, 6 Rekonstruktion offen, 2 widerlegt (Norm erst nach dem Stichtag in Kraft);
5 ohne juris-Dokument (Rekonstruktionsqueue).

**Unbestimmt (85):** 53 über die Einzelfassungen entschieden und übernommen, 13 Einzelfassungen nicht eindeutig,
19 Review (u. a. Befristungsfußnote „Fristablauf 31.12.2004“ ohne Ende im Kopf, VwV ohne „Fassung vom“).

## 4 Sperrgründe (Review, keine Übernahme)

| Grund | Normen |
| --- | --- |
| Anlage einer VwV als eigenes Dokument (437) bzw. VwV, deren Anlage als eigenes Dokument geführt wird (38) | 475 |
| Tabellenlayout (Textlayer trägt die Tabellenstruktur nicht sicher) | 422 (+95 in Einzelfassungen) |
| Kürzel „SH“ in amtlichen Abkürzungen (z. B. „LVwG SH“) – Überleitungsregel offen | 350 |
| Abbildungen (Karten, Pläne) – keine Asset-Pipeline für NSH in diesem Lauf | 271 |
| Restvorkommen „Schl.-H.“ in Normabkürzungen („MBG Schl.-H.“) – Überleitungsregel offen | 167 |
| Einzelfassungen am Stichtag nicht eindeutig (Überlappung mit eigenem Ende, Reihenfolge, Titel, Rückwirkung) | 44 |
| widersprüchliche Erlassformeln | 30 |
| Verzeichnis und Normkörper stimmen nicht überein | 35 |
| geänderte VwV ohne Einzelfassungen in juris | 12 |
| Register belegt Änderung nach dem Stichtag, Ausgabe nicht | 7 |

Review-Fälle: 2 200 (offen 1 971) unter `data/imports/juris-sh/review/`; kein Fall automatisch entschieden, kein Human
Approval, kein Freeze.

## 5 Gates (Stand dieses Laufs)

| Gate | Ergebnis |
| --- | --- |
| `readiness` | READY (13/13) |
| `audit` | konsistent; Bestand = Manifest (1 910 / 5 730 Dateien), 6 098 Rohquellen im Cache nachgerechnet |
| `inventory` / Textintegrität | alle übernommenen exact |
| `search-audit --full` | GRÜN (1 910 Normen, alle Prüfungen bestanden) |
| `npm run content:check` | gültig (NSH 1 910 Normen), Unveränderlichkeit ok |
| `npm run d1:schema:check` | gültig |
| D1-Plan (`project-d1.ts --target plan --jurisdiction nsh`) | 1 910 Normen, 14 274 Sucheinheiten, 59 105 Anweisungen |
| R2-Staging (`r2-sync --stage-only`) | 6 098 Objekte (302 MB) + Umschläge unter `.cache/juris-sh-r2-staging/`, Manifest `staged`; 0 Konflikte |

## 6 Befehle

```bash
# Beschaffung (resumierbar, 1 Anfrage/s, Cache)
npm run import:juris-sh:fetch-corpus -- --phase gesamtausgaben
npm run import:juris-sh:fetch-corpus -- --phase units
# Verarbeitung (netzfrei)
npm run import:juris-sh:inventory -- --write
npm run import:juris-sh:readiness -- --write
npm run import:juris-sh:bulk -- --write            # nur bei READY; idempotent
npm run import:juris-sh:audit -- --write
npm run import:juris-sh:search-audit -- --full --write
npm run import:juris-sh:r2-sync -- --stage-only    # kein Netz
```

Cloudflare (nicht in diesem Lauf; nach Freigabe):

```bash
npm run import:juris-sh:r2-sync -- --write                     # Upload nach landesrecht-quellen/nsh/juris-sh/2023-12-01/ (Wrangler-OAuth), fortsetzbar
npm run d1:plan -- --jurisdiction nsh                          # data/runtime/d1-batches/landesrecht-nsh/
npm run d1:apply:batches -- --database landesrecht-nsh         # Dry-run
npm run d1:apply:batches -- --database landesrecht-nsh --local --execute
npm run d1:apply:batches -- --database landesrecht-nsh --execute --confirm-remote landesrecht-nsh --resume
npm run build && npm run deploy
```

Falls die Remote-Datenbank `landesrecht-nsh` noch kein Schema hat, zuerst (aus `apps/web`):
`npx wrangler d1 execute landesrecht-nsh --remote --config wrangler.jsonc --file ../../data/d1/0001_landesrecht.sql --yes`
(Reihenfolge wie `docs/DEPLOYMENT.md`).

## 7 Offen (Entscheidung beim Menschen)

1. **TDM-Vorbehalt** (`tdm-reservation: 1`) und Weiterveröffentlichung der konsolidierten juris-Fassungen:
   dokumentiert, nicht bewertet. Vor Commit, R2-Upload oder Deploy zu entscheiden.
2. **Überleitung amtlicher Abkürzungen mit Landeskürzel** („LVwG SH“, „MBG Schl.-H.“): Regel beschließen – dann
   werden rund 500 Normen übernahmefähig.
3. **Tabellen, Abbildungen, VwV-Anlagen als eigene Dokumente:** Tabellenrekonstruktion, Asset-Pipeline wie BayWü,
   Zusammenführung von Anlage und Hauptdokument.
