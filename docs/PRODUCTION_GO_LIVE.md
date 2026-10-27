# Betriebsfreigabe Landesrecht

Prüftag der Betriebsprüfung (Lauf 1): **27.10.2026**. Ausgangspunkt: sauberer Commit
`1df581af95e6fc523f6b1aaf962583cf51535eab`; Lauf 1 ergänzt ausschließlich uncommittete Änderungen.
Kein Commit, Push, Deployment, Remote-Schreibzugriff oder neues Cloudflare-Betriebsmittel in diesem Lauf.
Stichtage bleiben 01.12.2023 / 28.09.2026. Technische Prüfergebnisse: [RELEASE_READINESS.md](RELEASE_READINESS.md).
Fachentscheidungen und 28 konkrete Fälle: [PRODUCTION_QUALITY_BACKLOG.md](PRODUCTION_QUALITY_BACKLOG.md).

Feedback-Ergänzung Lauf 2 auf `1a33ad44106972a42782fbd6e436af0439a84af7`: siehe Abschnitt
Fehlermeldesystem. Die Produktions-/Remotebefunde aus Lauf 1 wurden dabei nicht erneut erhoben.
Keine produktive Aktivierung und keine Cloudflare-Schreibzugriffe in Lauf 2.

## Urteil und Freigabestufen

**NO-GO für eine dauerhafte öffentliche Betriebsfreigabe.** Ein bestandener Offline-Releasecheck bedeutet
nur technische Prüfbarkeit. Die September-Aussage „Keine Releaseblocker“ war keine ausreichende
Betriebsfreigabe und ist überholt.

| Stufe | Kriterien | Stand Lauf 1 |
| --- | --- | --- |
| 1 Betriebsbereit | rechtliche Betreiberangaben vollständig; erreichbarer Kontakt; getestete Absicherung; Restore-/Rollbackzuständigkeit; Alarmierung; keine ungeklärten P0-Fälle | nicht erreicht |
| 2 Betriebsbereit mit bekannten Rechtsbestandslücken | Stufe 1 erfüllt; verbleibende Lücken einzeln risikobewertet und durch benannte Redaktion akzeptiert; Hinweise öffentlich zutreffend | erst nach Freigabe der untenstehenden Punkte erreichbar |
| 3 Fachlich weiter zu vervollständigen | dokumentierte, gesperrte oder ausgeschlossene Fälle verbleiben; keine Vollständigkeitsbehauptung | trifft auf den heutigen Bestand zu; ersetzt Stufe 1/2 nicht |

**Echte Freigabeblocker:** fehlender realer Betreiber und Kontakt, nicht freigegebene Datenschutzerklärung,
unentschiedener P0-Identitäts-/Geltungskonflikt der West-Verfassungen, fehlende benannte Betriebs- und
Alarmverantwortung samt geprüftem Meldeweg. Ein weiterer P0 ist die fehlende normative Anlage des als geltend veröffentlichten BayWü-Haushaltsgesetzes
2026 (Arbeitsvorrat 21): Artikel 1, 4 und 5 beziehen Haushaltsplan/Finanzierungsübersicht ausdrücklich ein;
die gespeicherte Fassung bestätigt, dass sie in Blatt und Archiv fehlen. Die bisherige Akquisepriorität P3
bildet dieses fachliche Risiko nicht ab. West-Vertragsanlagen zusätzlich vor Freigabe auf tatsächlich
fehlende normative Bestandteile prüfen (Fall 09); ein vorhandenes verlinktes PDF ist anders zu bewerten.
Der neue Header-/Fehlerstand ist nur lokal vorbereitet und noch nicht auf Produktion.

**Offene externe Abhängigkeiten:** OstRecht-Suche teilweise nicht auf Portalstichtag indexiert; reale
Cloudflare-Verträge/Protokolleinstellungen unbekannt; Staging nicht nachgewiesen betriebsfähig; keine
unabhängige, getestete R2-Sicherung nachgewiesen. Hier braucht es eine bewusste Freigabeentscheidung mit
Verantwortung und Ersatzmaßnahmen, keine stillschweigende Akzeptanz.

## Nachgewiesener Produktionsstand

Lesend am Prüftag: `wrangler deployments list --json` und `wrangler versions view … --json` aus `apps/web`.
Aktives jüngstes Deployment `ec53147c-2a28-498b-b666-698c362bd312`, angelegt **26.10.2026 06:58:01 UTC**
(07:58:01 MEZ), 100 % Version **`104eeec2-562a-4351-9a92-31009f18e336`**, Versionsnummer 48.
Script-Etag `cd4bb27cfe0c9fac8f3656daacf4eadb1a2c45549ac905ab1b69e588e2e849fd`.
**Keine Git-Revision in den verfügbaren Versions-/Deployment-Annotationen.** Der Produktionscommit ist
somit nicht bewiesen; gleicher Tag und erfolgreiches Smoke reichen nicht für die Behauptung „HEAD deployt“.
Die Änderungen dieses Laufs sind sicher ausschließlich lokal. Bei der nächsten freigegebenen Auslieferung
Commit, Arbeitskopiestatus, Buildartefakt und Worker-Version gemeinsam im Freigabenachweis festhalten.

| Projektion | Remote-Zähler Normen / Fassungen / Sucheinheiten / Verkündungen | Abgleich |
| --- | --- | --- |
| West | 1.528 / 1.539 / 30.151 / 22 | 12/12 bestehende Vergleichsprüfungen identisch, einschließlich Laufzeitmetadaten und 30 Normstichproben |
| NSH | 2.705 / 2.710 / 23.456 / 5 | ebenso 12/12 |
| BayWü | 1.664 / 1.670 / 31.447 / 8 | ebenso 12/12 |
| Ost | 5.226 Normen; vorgelagerte D1 | Contract erfüllt; Sync complete vom 25.10.2026 19:33:11 UTC; keine eigene Projektion |

Die drei eigenen Vergleiche belegen den Vergleich mit den vorhandenen lokalen D1-Projektionen; der
Offline-Schema-/Projektionscheck baut zusätzlich aus dem aktuellen Git-Bestand. Kein byteweiser Beweis
aller Remote-Inhalte. Zusätzliche direkte Remote-SELECTs auf `law_runtime_meta` bestätigen für alle drei Datenbanken:
`projection_state: complete`, Schema 2, Ausgangsdatum 01.12.2023, Referenzdatum 28.09.2026.
Fingerabdrücke: `bda07b20` (West; Projektion 30.09.2026 05:37:58 UTC), `dcc2903a` (NSH;
05:38:04 UTC), `47ee514c` (BayWü; 05:38:09 UTC). Die gespeicherten Remote-Projektionsdateien
stimmen damit überein. Die Abfragen meldeten jeweils `changed_db: false` und `changes: 0`. Ost meldet Corpus-Hash
`0f7174b185a8b065c8bcfe4bc723f14d7a1ec795b9f37bc7115af4f7ab38e88e` und Fingerabdruck
`142df98cc3da215081fbded9beaa8efaf1e3426b2c491a20afc20b5e6e28d884`.

Produktions-Smoke: **98/98 bestanden**; aktuelle Website-/Barrierefreiheitsstichprobe **43 Seiten, 0 mit Befunden**. Health: alle vier Bindings `ok`, Gesamtzustand **`degraded`**,
HTTP 200, Ost `readiness: partial`, `fullText: current-version-only`, **3** geltende Fassungen ohne
passende Sucheinheiten. Das aktuelle Drift-Audit ist deshalb **fehlgeschlagen (1 Befund)**:

- `ostdeutsche-bezirksordnung`: Portal 01.08.2026, Index 01.10.2026.
- `saechsische-gemeindeordnung`: Portal 12.09.2026, Index 01.10.2026.
- `saechsische-landkreisordnung`: Portal 01.08.2026, Index 01.10.2026.

Kein Stichtagsvorziehen als Abhilfe. Upstream muss passende Fassungen indexieren oder die begrenzte Suche
muss ausdrücklich fachlich akzeptiert werden. Historische Fassungen sind navigierbar, nicht vollständig
volltextsuchbar. Die bereits vorhandenen Suchhinweise bleiben bestehen. Normative Zuständigkeit bei OstRecht. Kein Upstream wurde in diesem Lauf geändert oder angeschrieben.

## Rechtsstandsprüfung

Über den gesamten eigenen Bestand (5.897 Normen) am unveränderten Stichtag: West 1.526 geltende / 2 historische,
NSH 2.703 geltende / 1 historische / 1 künftige, BayWü 1.661 geltende / 1 historische / 2 künftige Normansichten.
Künftig sind `inklusions-und-teilhabegesetz-kita-nsh` ab 01.01.2027 sowie
`zukunftssicherheitsforschungsg-baywue` und `wirtschaftsgruendungsg-baywue` ab 01.10.2026.
Das reale Tagesdatum 27.10.2026 macht sie im Portal nicht geltend.

Lauf 1 trennt auf der Homepage wirksam gewordene Änderungen und künftige Termine. Zeitliche Auswahl erfolgt
vor Pagination; bei einer Norm mit vergangener und künftiger Änderung bleibt die vergangene Änderung in der
Rückschau. Die Änderungsübersicht benennt ihren gemischten Umfang; Normlisten verwenden bereits den gemeinsamen
stichtagsabhängigen Datumstext. Suchtreffer kennzeichnen ihre konkrete Fassungsart und Intervalle. Normköpfe
und Datenseiten verwenden bei zukünftigen neuen Normen „ab“ statt „seit“; fehlt eine geltende Fassung,
verspricht der Rücklink keine. Das Geltungsband folgt weiterhin der Simulationsachse.

Nicht konsolidierte Akte bleiben in den vorhandenen Ledgern/Quellen- und Bestandshinweisen erfasst und
werden nicht als bereits konsolidierte Norm ausgegeben. „Erfasst“, „verkündet“, „wirksam“ und
„konsolidiert“ sind unterschiedliche Aussagen. Ausgangsdateien und Freeze-Gates wurden nicht geändert.
Der West-Verfassungskonflikt ist ausführlich im fachlichen Arbeitsvorrat zur Entscheidung vorbereitet.

## Rechtliche und organisatorische Freigabe

Vor Veröffentlichung durch den **noch zu benennenden tatsächlichen Betreiber** auszufüllen und zu bestätigen:

1. Vollständiger Name/Organisation, ladungsfähige Anschrift, bei Organisation Vertretungsberechtigung,
   erreichbare E-Mail-Adresse und gegebenenfalls weitere gesetzlich erforderliche Kontakt-/Registerangaben.
   Reale Verantwortlichkeit für redaktionelle Inhalte und gegebenenfalls zusätzliche Anbieterpflichten prüfen.
2. Verantwortlicher und erreichbarer Datenschutzkontakt; Notwendigkeit eines Datenschutzbeauftragten;
   zuständige Aufsichtsbehörde. Keine Sim-Amtspersonen als Ersatz für reale Betreiberangaben.
3. Zwecke und tatsächliche Rechtsgrundlagen getrennt für Hosting/Sicherheit, Kontakt, künftiges Feedback;
   Verträge/Auftragsverarbeitung, Cloudflare-Vertragspartner, Unterauftragnehmer und weitere Empfänger;
   Datenorte und gegebenenfalls Drittlandgarantien.
4. Tatsächlich aktivierte Zugriffs-, Worker-, Sicherheits- und Diagnoseprotokolle, enthaltene Daten,
   Zugriffsberechtigungen, konkrete Speicher-/Löschfristen und Auskunftsprozess. Keine erfundenen „7/30 Tage“.
5. Entscheidung über vorhandenes Cloudflare Network Error Logging: Produktion liefert `NEL` und `Report-To`
   an `a.nel.cloudflare.com`. `max_age: 604800` ist Headergültigkeit, keine belegte Datenaufbewahrung.
6. Kontaktkanal testen, Bearbeitungsvertretung benennen, Rechteausübung ermöglichen. Entwurfskennzeichnungen
   erst nach Vervollständigung und rechtlicher Freigabe entfernen.

Architekturprüfung: keine Anwendungscookies, keine Anmeldung, Session-Treiber `null`, keine Local-/Session-
Storage-Nutzung und keine Analyse-/Werbeeinbindung im Quellcode. Suche läuft als GET; Begriffe können in
URL, Browserverlauf, Caches und Infrastrukturprotokollen stehen. Markierungen werden im Browserarbeitsspeicher
und in teilbaren Adressen verarbeitet; freie Markierungen beziehen sich auf Fassungsadressen und lösen ggf.
Leseabrufe aus. URLs können sensible Interessen erkennen lassen. Neue Referrer-Policy `no-referrer` reduziert
Weitergabe an verlinkte Dritte; sie ändert keine Hostingprotokolle.

Die eigenständige Datenschutzseite ist ein **nicht freigegebener Entwurf**, kein abgeschlossener Rechtstext.
Ein bloßer Link auf Cloudflares Datenschutzseite ersetzt die Betreiberinformation nicht. Grundlagen für die
noch notwendige rechtliche Prüfung: [BfDI zu konkreten Rechtsgrundlagen und Speicherfristen](https://www.bfdi.bund.de/SharedDocs/Downloads/DE/DokumenteBfDI/Kontrollberichte/Allgemeine-Verwaltung/Kontrolle-BAG-Webseite-2024.pdf?__blob=publicationFile&v=1),
[Cloudflare Privacy Policy](https://www.cloudflare.com/privacypolicy/),
[Cloudflare NEL](https://developers.cloudflare.com/network-error-logging/).

## Betriebssicherheit

Vorhanden: drei eigene D1-Bindings, Ost nur lesend mit fail-closed Contract/Drift-Prüfung; privates Quellen-R2;
begrenzte parametrisierte Suchabfragen (200 Zeichen, 100 Ergebnisse, Offset höchstens 5.000),
strukturierte Rechtsverweise und Escaping der Astro-Ausgabe; vorhandene Text-/XSS-Regressionstests.
Kein Formular und kein neuer öffentlicher POST-Endpunkt. Normative Abbildungen werden inhaltsadressiert
über den bestehenden Assetpfad ausgeliefert. Öffentliche 404-/Fassungsansichten werden im UI-Smoke geprüft.

Lauf 1 ergänzt CSP (Skripte eigene Origin, keine Objekte/Frames, Formulare eigene Origin), `nosniff`,
`no-referrer`, Frame- und Berechtigungsbeschränkungen für Worker und statische Assets. Inline-Styles bleiben
für die vorhandene Darstellung erlaubt. Konfigurationsantworten zeigen keine Binding-/Schemadetails mehr;
Diagnose bleibt serverseitig. 5xx-Antworten erhalten `no-store`. Bestehende Cachefristen für Seiten/Suche
bleiben; Health ist `no-store`, gebündelte Assets unveränderlich cachebar. Nach späterem Deploy tatsächliche
Header auf HTML, API, statischen Dateien, 404 und Fehlerantworten sowie interaktive Funktionen im Browser prüfen.
CSP im Entwicklungsbetrieb ist wegen Vite ausgenommen. Gebauter lokaler Worker: Header auf statischem
Impressum, dynamischer Normseite, Such-API und 404 nachgeprüft; keine ausführbaren Inline-Skripte in diesen
HTML-Antworten. Nach Neustart des lokalen Workers wurden CSS, Kopierwerkzeuge und Satznummernschalter
auch im Browser geladen; keine Browserwarnungen/-fehler beobachtet. Eine lokal nicht verfügbare Ost-D1 liefert im Produktionsmodus 500, `no-store`, Sicherheitsheader
und eine neutrale Antwort ohne Binding-/Schemadetails. Es wurde kein Produktionsfehler ausgelöst.

Grenzen: Suchlimits ersetzen keinen volumetrischen Missbrauchsschutz. Cloudflare-Rate-Regeln/Budgets,
Warnschwellen und konkrete WAF-Einstellungen sind nicht nachgewiesen; tiefe Mehrländersuche braucht laut
bestehendem Bericht 8–20 s. Vor Freigabe Rate-Limits für Suche und Last-/Kostenwarnung festlegen und
prüfen; keine automatisierte Lastprüfung gegen Produktion in Lauf 1. Worker-Vorschaulinks/workers.dev sind
aktiv, kein Ersatz für isoliertes Staging. Dessen drei eigenen D1-IDs und SITE_URL sind noch Platzhalter.
Keine Staging-Schreibprobe ohne konfigurierte, ausdrücklich freigegebene isolierte Ressourcen.

## Sicherung, Wiederherstellung und Rollback

Git bleibt Source of Truth; R2 ist das Originalquellenarchiv. Reprojektion ersetzt keine Sicherung der
nur lokal oder im Archiv liegenden Primärquellen.

| Bereich | Ausführbarer Weg / Nachweis Lauf 1 | Vor Freigabe verbleibender Test |
| --- | --- | --- |
| West/NSH/BayWü-D1 | `node scripts/restore-local.ts`: Migrationen und bestehender Projektionsplan → neue lokale SQLite → `VACUUM INTO`-Sicherung → neue wiederhergestellte Datei; alle drei erfolgreich, vollständiger Nutzdatenvergleich, `integrity_check`, FTS5-Integrität | Cloudflare-Wiederaufbau in isoliertes Staging und dort alle Seitentypen/Suche prüfen; Export-/Time-Travel-Weg einschließlich FTS belegen |
| Cloudflare D1 | Bestehende `d1:plan`-/Apply-Werkzeuge, Migrationen, Remote-Vergleich; Plattform unterstützt Time Travel | Vertrag/Tarif und Wiederherstellungsfenster prüfen; Bookmark vor Eingriff sichern; Wiederherstellung nur isoliert erproben, danach Rückweg bestätigen |
| R2 | Bestehendes lesendes Audit für West-Präfix: 11.281 Rohobjekte, 150 SHA-Stichproben und 25 Umschlagprüfungen, 0 relevante Abweichungen | Unabhängige Kopie aller Länder/Sim-Quellen/Assets mit Inventar, Hashes und Metadaten; Restore in isoliertes Ziel samt öffentlichem Assetabruf. Kein getesteter vollständiger R2-Restore nachgewiesen |
| Redaktion | Git-Dateien für Normen, Ledger, Rezepte, Review und Inventare; lokale Quellen/Caches/Inbox teilweise außerhalb Git | Git-Bundle und getrennte verschlüsselte Quellsicherung extern ablegen; frischer Checkout plus wiederhergestellte Quellen → Gates und Reprojektion testen; Zuständigkeit/Aufbewahrung festlegen |
| Worker | Vorige Worker-Version über Cloudflare-Rollback auswählbar; aktuelle Version oben belegt | Rollback in Staging mit kompatiblem Schema/Projektionsstand und Assets testen; kein ausgeführter Produktionsrollback |
| Ost | Eigenes vorgelagertes System; lesender Contract und Freshness-Audit | OstRecht-Verantwortliche sichern/restaurieren; Landesrecht führt dort keine Migration, Sicherungsprojektion oder Schreibprobe aus |

Lokale Restoreartefakte liegen unter `.cache/restore-drill/`; sie sind reproduzierbar, aber keine dauerhaft
extern gelagerte Sicherung. Speicherbedarf rund 1,2 GB je vollständigem Drill; nach Beweissicherung aufräumen.
Bei Cloudflare-D1 mit virtuellen FTS-Tabellen darf ein ungeprüfter SQL-Dump nicht als wiederherstellbar gelten;
der dokumentierte Exportweg hat Einschränkungen. Bevorzugter sicherer Wiederaufbau der Projektion:
freigegebener Git-Stand + Migrationen + bestehender Projektionsplan, danach FTS-/Remotevergleich.
Plattformbelege: [D1 Import/Export](https://developers.cloudflare.com/d1/best-practices/import-export-data/),
[Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

**Rollback-Reihenfolge:** Auslieferung stoppen, aktuelle und vorige Worker-Version/Projektionsfingerabdrücke
sichern; bei reinem Oberflächenfehler auf die bestätigte vorige Worker-Version zurück. Bei Daten-/Schemafehler
zuerst kompatible Projektion in Staging aus freigegebenem Git reproduzieren und prüfen. Remote-Restore und
Workerwechsel erst ausdrücklich freigeben. Ost nicht zurücksetzen. Danach Health (einschließlich Suche),
Smoke, historische/Einzelansichten und Stichprobenvergleich; Incident und Ergebnis im bestehenden Betriebsprozess
erfassen. R2-Originale niemals für Rollback überschreiben.

## Einfaches Monitoring (noch zu aktivieren)

Bestehende Werkzeuge wiederverwenden, keine neue Auditplattform:

- Alle 5 Minuten `/health` mit Zeitlimit 10 s: HTTP-Status **und JSON** auswerten. `error`/Timeout nach zwei
  aufeinanderfolgenden Fehlern alarmieren; `degraded`/Ost `partial` oder `unknown` fachlich alarmieren.
  Die bekannte Drei-Normen-Lücke nur ausdrücklich quittieren; Änderung der betroffenen Menge erneut melden.
- Stündlich vorhandenen `npm run smoke -- --base <origin>` mit Prozesszeitlimit ausführen. Er prüft vier
  Länder, Suche, Norm-/Fassungs- und Verkündungsrouten. Zusätzlich täglich `npm run smoke:ui -- --base <origin>`
  für historische Fassungen, Einzelvorschriften, Navigation und Sachgebiete. Nie Staging als Produktion ausgeben.
- Täglich und vor jeder Stichtagsfortschreibung `npm run audit:ost-drift -- --as-of <Portalstichtag>`;
  Exit ungleich null weitergeben. Der heutige Befund ist kein bestandener Freshness-Check.
- Cloudflare-5xx-Metriken und Latenzen überwachen: vorgeschlagen >1 % 5xx bei mindestens 20 Anfragen/5 min
  oder drei fehlgeschlagene synthetische Aufrufe; p95 >3 s bei Standardabfragen über 15 min als Warnung,
  >10 s als Incident. Schwellen nach beobachteter Basislinie abstimmen; tiefe Suche gesondert messen.
- Empfänger **Betriebsverantwortlicher plus Vertretung (noch zu benennen)**; fachliche Treffer an Redaktion,
  Ost an Upstream-Verantwortliche. Alarmweg mit absichtlich lokal/staging erzeugtem Fehler testen.
  Wiederholung stillhalten, bei Zustandswechsel, Verschlechterung und Erholung benachrichtigen.

Keine laufende Überwachung oder Benachrichtigung ist durch diesen Bericht aktiviert. Logzugang, Aufbewahrung
und Empfänger müssen zur Datenschutzerklärung passen; URL-Parameter/markierte Textstellen nicht in Alarmtexte
übernehmen. [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
beschreibt Plattformmöglichkeiten, beweist aber keine Aktivierung im Konto.

## Fehlermeldesystem (Lauf 2)

Implementiert auf Git-Ausgangspunkt `1a33ad44106972a42782fbd6e436af0439a84af7`, ohne Commit, Push,
Deployment oder produktive Cloudflare-Schreibzugriffe. **Übermittlung bleibt deaktiviert.** Die rechtlichen
und fachlichen NO-GO-Punkte dieses Dokuments werden durch die Formularimplementierung nicht aufgehoben.

### Formular und Kontext

`/fehler-melden/` ist jetzt eine dynamische Astro-GET-/POST-Seite. Pflicht sind Kategorie und Beschreibung
(10–5.000 Zeichen); E-Mail optional (höchstens 254 Zeichen). Sieben Kategorien: Wortlaut, Fassung,
fehlende Vorschrift, Anlage/Fundstelle, Suche/Verlinkung, Darstellung/Bedienung, Sonstiges. Kein Name,
keine Datei, keine Registrierung. Pflicht-/Fehlerhinweise sind beschriftet und programmatisch zugeordnet.
Sicherheitsprüfung erfordert JavaScript; die übrige Übermittlung und Fehlerrückgabe funktioniert als
gewöhnliches HTML-Formular. Bei fehlendem Turnstile bleibt Absenden erfolglos und wird nicht als Erfolg gezeigt.

Normköpfe, Einzelvorschriften und deren Footer verwenden die tatsächlich angezeigte **Fassungsadresse**.
Land, Norm, konkrete Fassung und Paragraph/Artikel werden erneut serverseitig gegen die vorhandene Registry
geprüft. Auch bei historischen Fassungen bleibt genau diese Fassung erhalten. Akzeptiert werden bekannte
interne Norm-, Unterseiten-, Einzelvorschriften-, Verkündungs-, Länder- und ausgewählte Portaladressen.
Suchseiten liefern nur `/suche/`; Query, Fragment, `mark`, `textmark` und Suchbegriffe werden nie automatisch
übernommen. Keine Übernahme der ausgewählten Textpassage. Eine fehlende Vorschrift kann ohne Seitenbezug
mit Land und Bezeichnung in der Beschreibung gemeldet werden. Fremde, unbekannte oder manipulierte Pfade
werden abgelehnt. Eingaben sind Hinweise, keine Rechtsbelege.

Erfolg gibt nur eine zufällige UUID-Vorgangsnummer und eine neutrale Bestätigung zurück. Kein öffentlicher
Statusabruf, keine Meldungslisten und keine Rückgabe fremder Meldungsdaten. Fehler erhalten einen tatsächlichen
4xx-/503-Status und ausdrücklich keine Erfolgsbestätigung. Eingaben bleiben bei korrigierbaren Fehlern erhalten;
Ausgabe durch Astro escaped, nicht als HTML. Ein Reload einer erfolgreichen POST-Antwort ist idempotent.

### Datenmodell und Grenzen

Eigene Migration: `data/feedback/0001_feedback.sql`. Datenbanknamen und Bindings stehen zentral in
`packages/runtime/src/bindings.ts`. Der Marker `feedback_meta.application = landesrecht-feedback/1` und das
Fehlen von Normtabellen werden geprüft; versehentlich an eine Rechtsdatenbank gebundene Speicher werden
nicht beschrieben. Es wird keine Feedback-Tabelle in West/NSH/BayWü/Ost angelegt.

| Daten | Speicherung |
| --- | --- |
| Vorgang | zufällige `id`, Erstellungs- und Bearbeitungszeit als UTC-ISO-Datum |
| Meldung | Kategorie, Beschreibung, freiwillige Kontakt-E-Mail |
| Bezug | bereinigter Pfad, Land, Normslug, Fassungskennung, ggf. Vorschriftenanker; sonst NULL |
| Redaktion | Status, Priorität P0–P3 (anfangs P2), interne Notiz, Revisionsnummer für konkurrierende Bearbeitung |
| Wiederholschutz | zufällige `submission_id` aus signiertem Ticket, HMAC des normalisierten Inhalts; UNIQUE verhindert doppelte Speicherung |

Keine IP-Adresse, User-Agent, Textmarker, Turnstile-Token oder CSRF-Sitzungskennung im Meldungsdatensatz.
Beschreibung und interne Notiz sind Klartext im geschützten Speicher; freiwillig darin eingetragene
personenbezogene Daten sind möglich. Der interne Vermerk liegt in einer eigenen Spalte derselben ausschließlich
intern lesbaren Tabelle; es existiert keine öffentliche Datenleseroute. Alle variablen SQL-Werte sind gebunden.
Migration und Schema-/FTS-Gates der Rechtsdatenbanken bleiben getrennt.

### Schutz und vollständige Konfiguration

Ohne **jede** der folgenden Voraussetzungen bleibt die öffentliche Übermittlung fail-closed:

- `FEEDBACK_ENABLED="true"` und `FEEDBACK_PRIVACY_APPROVED="true"` erst nach dokumentierter Betreiberfreigabe.
  Beide stehen in Produktion und Staging zunächst auf `"false"`; ein Boolean oder fehlender Wert aktiviert nichts.
- `FEEDBACK_ORIGIN` als exakte HTTPS-Origin ohne abschließenden Slash, passend zur tatsächlich freigegebenen
  Adresse. Alternative workers.dev-/Vorschaudomains dürfen nicht unbemerkt über diese Freigabe senden.
- Getrenntes D1-Binding `LANDESRECHT_FEEDBACK`, korrekt migriert, keine Rechtsdatenbank.
- `TURNSTILE_SITE_KEY` (öffentlich), gültiger Server-Secret `TURNSTILE_SECRET_KEY`; Widget auf exakte erlaubte
  Hostnames beschränken, Action `feedback`, **Pre-clearance deaktivieren**. Öffentliche Testschlüssel werden
  außerhalb `APP_ENV=development` abgelehnt.
- Zwei unabhängig erzeugte zufällige Secrets mit mindestens 32 Zeichen: `FEEDBACK_CSRF_SECRET` und
  `FEEDBACK_RATE_SECRET`. Keine Werte im Repository oder in dokumentierten Befehlen. Worker-Secrets über
  den freigegebenen Secret-Verwaltungsprozess setzen; Produktion und Staging getrennt.
- Cloudflare-Rate-Limit-Binding `FEEDBACK_RATE_LIMITER` mit eigener, im Konto abgestimmter `namespace_id`.
  Kein In-Memory-Ersatz und keine bloße Variable „Schutz aktiviert“.

Vorlage **für eine spätere ausdrücklich freigegebene Konfiguration**, nicht in Lauf 2 ausgeführt:

```jsonc
// Je Environment separat ergänzen, Rechtsbindungen unverändert lassen:
// d1_databases zusätzlich:
{ "binding": "LANDESRECHT_FEEDBACK", "database_name": "landesrecht-feedback",
  "database_id": "<eigene-feedback-d1-id>", "migrations_dir": "../../data/feedback" }
// ratelimits zusätzlich:
{ "name": "FEEDBACK_RATE_LIMITER", "namespace_id": "<abgestimmte-eigene-nummer>",
  "simple": { "limit": 20, "period": 60 } }
```

20 Versuche je Minute sind ein abzustimmender Startvorschlag, keine gemessene Freigabegrenze. Die Plattform-
Drossel ist annähernd und je Cloudflare-Standort wirksam, **kein weltweites hartes Limit**. Ein täglich
wechselnder HMAC der von Cloudflare gelieferten Verbindungsadresse bildet den Schlüssel; keine Klar-IP in
Feedback oder Logs. Geteilte Anschlüsse können gemeinsam betroffen sein. Zusätzlich WAF-Regel für GET/POST
auf dieser Route, globale Last-/Kostenwarnung und 429/503-Monitoring abstimmen. Datenfristen und Rolle des
Drosseldienstes müssen datenschutzrechtlich freigegeben sein; keine bestimmte Plattform-Aufbewahrung behauptet.

Vor jedem POST: exakte Origin und Anfrage-Origin, gegebenenfalls `Sec-Fetch-Site: same-origin`, ausschließlich
`application/x-www-form-urlencoded`, maximal 65.536 tatsächlich gelesene Bytes, feste Feldnamen ohne Duplikate,
begrenzte Lesezeit, Feldschema, Honeypot, signiertes CSRF-Ticket. Die Herkunftsprüfung allein ersetzt das Ticket
nicht. Ein notwendiger `__Host-landesrecht-feedback`-Cookie (Secure, HttpOnly, SameSite=Strict, Path=/,
30 Minuten) bindet das Ticket an die Sitzung; Ticket ebenfalls höchstens 30 Minuten gültig. Token und
Sitzungskennung werden nicht protokolliert. Formulare anderer Sitzungen, abgelaufene oder manipulierte Tickets
werden zurückgewiesen.

Vor dem Speichern muss Turnstile **serverseitig** über Siteverify erfolgreich sein, einschließlich Hostname
und Action. Kein optionales Überspringen, keine nachgestellte Erfolgsmeldung bei Ausfall. Acht Sekunden
Zeitlimit; keine IP-Weitergabe im Siteverify-Aufruf. Die Plattformdrossel hat drei Sekunden Zeitlimit.
Sämtliche Antworten sind `Cache-Control: no-store`; 429 enthält `Retry-After: 60`. Keine Infrastrukturdiagnose
oder eingegebenen Inhalte im Fehlerlog. Der generische Plattformzugriffslog bleibt ein eigener Freigabepunkt.

Die CSP erhält ausschließlich auf dem aktiven Formular `https://challenges.cloudflare.com` in `script-src`
und `frame-src`. Kein `unsafe-inline` für Skripte, keine Wildcards und keine Lockerung anderer Seiten.
Das Widget verwendet die kompakte Breite (150 Pixel); die flexible Variante hätte mindestens 300 Pixel
und würde auf schmalen Formularen überlaufen. [Widget-Größen](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/).
Deaktiviert werden weder Widget noch externes Skript noch Schutz-Cookie geladen/gesetzt.
Belege zur Konfiguration: [Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/),
[Turnstile-CSP](https://developers.cloudflare.com/turnstile/reference/content-security-policy/),
[Cloudflare Rate Limiting und Standortgrenzen](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

### Redaktion ohne öffentlichen Adminbereich

`scripts/feedback.ts` beziehungsweise `npm run feedback -- …` unterstützt eine separate lokale `.sqlite` und
fest gebundene, autorisierte D1-Ziele `--target staging|production`. Ohne Ziel ist nur lokal mit `--db`
zulässig. Remoteziele kommen ausschließlich aus der jeweiligen Wrangler-Konfiguration; Binding und Name
müssen den zentralen Feedback-Namen entsprechen, echte eigene ID haben und von allen Rechtsdatenbanken
sowie dem anderen Environment getrennt sein. Keine freie Datenbankwahl und keine Annahme eigener SQL-Befehle.
Schema-Marker und Ausschluss von Normtabellen werden vor jeder Befehlsausführung geprüft. Remoteinitialisierung
oder Migration über die Redaktions-CLI ist verboten.

Remote verwendet die bestehende autorisierte Wrangler-Anmeldung des ausführenden Redakteurs. `list`, `show`
und `export` sind schreibgeschützt. Remote-`update`/`delete` verlangen zusätzlich zu `--write` den exakten
Namen über `--confirm-database landesrecht-feedback` beziehungsweise `landesrecht-feedback-staging`.
Erlaubt sind nur feste Feedback-SELECTs und die zwei revisionsgebundenen Update-/Delete-Anweisungen.
Parameter werden über den vorhandenen SQL-Renderer sicher serialisiert. Der echte Wrangler-Query-Pfad
verwendet `--command`, **nicht `--file`**: Letzteres wäre bei der installierten CLI eine Datenbankimportoperation
und gäbe keine einzelnen Ergebniszeilen zurück. Ein kleiner Node-Preloader liest SQL aus einer temporären
0600-Datei erst im Wrangler-CLI-Prozess ein; die OS-Prozessargumente enthalten nur einen Platzhalter.
Wrangler-Diagnoselogs werden ebenfalls in das geschützte temporäre Verzeichnis umgeleitet und danach gelöscht.
Diese Integration ist anhand der installierten Wrangler-Implementierung und eines lokalen CLI-Stubs geprüft;
nach Wrangler-Upgrades vor Remoteeinsatz erneut prüfen. Kein freies SQL, keine Batches,
keine INSERTs, keine DDL. Transportfehler liefern keine Rohdiagnose mit Kontaktdaten zurück.

Nur benannte, am Betriebssystem beziehungsweise im Cloudflare-Konto berechtigte Redakteure erhalten
Zugriff. Kontorechte auf die eigene Feedback-D1 begrenzen und getrennte Stagingrechte verwenden.
Lokale Initialisierung verweigert eine bereits gefüllte Datenbank. Lokale Kopien synchronisieren
**keine** Entscheidung automatisch nach D1; im laufenden Betrieb gezielt die freigegebene Remote-CLI nutzen.

```sh
# Nur lokal; Verzeichnis und Datei vor fremdem Zugriff schützen:
mkdir -m 700 .cache/feedback
npm run feedback -- init --db .cache/feedback/redaktion.sqlite --write
npm run feedback -- list --db .cache/feedback/redaktion.sqlite --status new
npm run feedback -- show --db .cache/feedback/redaktion.sqlite --id <uuid>
npm run feedback -- update --db .cache/feedback/redaktion.sqlite --id <uuid> --revision 0 --status triaged --priority P1 --note-file <notiz.txt> --write
npm run feedback -- export --db .cache/feedback/redaktion.sqlite
npm run feedback -- delete --db .cache/feedback/redaktion.sqlite --id <uuid> --revision 1 --write
# Später nur nach Freigabe und mit autorisiertem Konto, in Lauf 2 nicht remote ausgeführt:
npm run feedback -- list --target staging --status new
npm run feedback -- update --target staging --confirm-database landesrecht-feedback-staging --id <uuid> --revision 0 --status triaged --write
# Produktionsziel verlangt entsprechend --target production und --confirm-database landesrecht-feedback.
```

Die CLI gibt JSON/JSONL aus, keine HTML-/CSV-/Terminalauswertung von Meldungstext. Export und Ansicht lassen
E-Mail und interne Notiz standardmäßig weg; `--include-contact` / `--include-notes` nur bei berechtigtem Bedarf.
Exporte nicht in Git, Chat, öffentliches Issue oder ungeschützte Tabellen kopieren. Vor Export in Dateien
restriktive Rechte/`umask 077` wählen. Die Datenbank wird bei lokaler Initialisierung mit Dateimodus 0600 angelegt.

Ablauf: Neu → In Prüfung → In Bearbeitung → Erledigt/Zurückgewiesen. Offensichtlicher Spam kann direkt
zurückgewiesen werden; erledigte/zurückgewiesene Vorgänge können gezielt wieder in Prüfung genommen werden.
Änderungen benötigen die zuletzt gelesene `revision`, um paralleles Überschreiben zu verhindern. Priorität P0
für konkrete Geltungs-/Identitäts-/wesentliche Wortlautprobleme, sonst fachlich abstufen. Grund/Beleg und
Verweis auf den ursprünglichen redaktionellen Fall in der Notiz festhalten. Meldungen ändern niemals Normtexte,
Geltung, Ledger oder Freeze-Freigaben. Die bestehenden Fach-/Quellen-/Freeze-Verfahren bleiben Pflicht.

**Vor produktiver Aktivierung ist der durchgängige Bearbeitungsweg mit realen Berechtigungen noch in Staging
zu testen und freizugeben.** Die CLI einschließlich sicherer Remote-SQL-Serialisierung, Zielabgrenzung,
Revisionskontrolle und Fehlerbehandlung ist lokal gegen einen SQLite-Testtransport getestet.
Es gab keinen Cloudflare-Schreibtest und keine produktive Rückpflege. Ohne bestandenen autorisierten
Stagingdurchlauf bleibt das Formular NO-GO.

### Datenschutz, Löschung und Aktivierungsverfahren

Die Datenschutzseite beschreibt jetzt die implementierten Datenfelder, Sitzungsbindung, Drosselung,
Turnstile und interne Bearbeitung. Verantwortlicher, Rechtsgrundlagen, Empfänger/Verträge,
Drittlandgarantien, erreichbarer Kontakt, berechtigte Redaktion und konkrete Löschfristen bleiben offen.
Es wird keine Rechtsgrundlage und keine Aufbewahrungsfrist erfunden. `FEEDBACK_PRIVACY_APPROVED` darf erst
nach Vervollständigung dieser Angaben und dokumentierter Freigabe gesetzt werden.

Die CLI kann einen bestimmten Vorgang einschließlich Kontakt, interner Notiz und Wiederholschutzdaten
anhand von UUID und Revision löschen. Keine ungenehmigte automatische Frist oder Massenlöschung. Vor
Aktivierung Löschfristen für Spam, abgeschlossene Fälle, Kontakt, Exporte und Backups festlegen und
Löschung im freigegebenen Produktionsbearbeitungsweg testen. Meldungsdaten und Exporte gehören weder ins
unveränderliche Quellen-R2 noch ins Git-Archiv. Wiederherstellung aus Backups darf erledigte Löschungen
nicht dauerhaft rückgängig machen. Zuständigkeit und regelmäßige Prüfung real benennen.

Aktivierung erst nach gesonderter Freigabe in dieser Reihenfolge:

1. Reale Betreiber-/Datenschutz-/Kontaktangaben und redaktionelle Zuständigkeit abschließen, Fristen und
   Bearbeitungsweg entscheiden; bestehende NO-GO-Fälle des Portals beachten.
2. Isoliertes Staging mit eigener Feedback-D1 anlegen lassen, ausschließlich `data/feedback/` migrieren,
   Datenbank-ID gegen alle Rechtsdatenbanken prüfen; getrennte Secrets/Turnstile-Hostname/Drossel einrichten.
   Kein produktives Binding testweise auf West/NSH/BayWü oder OstRecht richten.
3. Dort Formulardurchlauf mit echten Turnstile-Testmitteln, CSRF/Cookie, CSP, 429/503, Datenbankausfall,
   Wiederholung und Mobilgeräten prüfen. Server-Hostname/Action und Sekretrotation kontrollieren. Testschlüssel
   nur für Entwicklung/Staging-Testbetrieb, nie mit Produktionsfreigabe einsetzen.
4. Gesicherte interne Sichtung und Statusrückpflege/Löschung bis zur tatsächlichen D1 erproben; Monitoring
   auf 429/503 und neue Meldungen an benannte Empfänger freigeben. In Lauf 2 wurde kein Benachrichtigungsdienst aktiviert.
5. Erst danach reale Produktionskonfiguration/Secrets und Migration ausdrücklich freigeben, beide Feature-
   Freigaben zuletzt setzen und separat freigegeben ausliefern. Ein getesteter Staging-Stand ersetzt kein
   Deploymentmandat. Danach kontrollierten End-to-End-Test und Sichtung bestätigen.
6. Rücknahme: `FEEDBACK_ENABLED=false` mit freigegebenem Konfigurationsrelease; damit keine neuen Tickets,
   externen Widgets oder Übermittlungen. Vorhandene Daten bleiben nur intern bis zur geregelten Löschung.

Ohne aktiviertes Feedback bleibt die vollständige Formularansicht sichtbar, Eingaben/Absenden sind gesperrt,
POST liefert 503 mit verständlichem Hinweis, ohne Erfolgsbestätigung. Die übrigen Portalfunktionen hängen
nicht von Feedback-Bindings oder Secrets ab.

### Prüfung Lauf 2

Gezielte lokale Tests verwenden ausschließlich separate In-Memory-/temporäre SQLite und gemocktes Siteverify/
Rate-Limit-Binding. Sie prüfen normbezogene und historische Meldungen, fehlende Vorschrift, fremde/ungültige
URLs, entfernte Textmarker/Suchbegriffe, Grenzen, XSS-/SQL-Eingaben, CSRF/Sitzung/Ablauf, Turnstile-
Hostname/Action/Ausfall, Rate-Limits, DB-Ausfall, Parallel-/Doppelübermittlung und sichere Redaktion mit
Revisionskontrolle, Export und Löschung; der Remote-Admintransport wird mit lokalen SQL-Dateien und SQLite geprüft, ohne Cloudflare-Aufruf. UI-Smoke prüft Beschriftung, Pflichtfelder, historischen Kontext,
fehlende Anhänge und deaktivierten POST; echte Browserprüfung bei 320 und 390 CSS-Pixeln ohne horizontalen
Überlauf. Kein Live-Turnstile-/Cloudflare-Ratenlimit-Nachweis: dieser bleibt der freigegebenen Staging-Prüfung
vor Aktivierung vorbehalten. Abschlussprüfung Lauf 2: `npm run check` mit 0 Fehlern/0 Warnungen (3 vorhandene Hinweise),
`npm run test` mit **143 Dateien / 2.185 bestandenen Tests**, davon **58 gezielte Feedbackprüfungen**,
`content:check` einschließlich Tabellen/Sim-Gates, `d1:schema:check` einschließlich separatem Feedbackschema,
`build`, erweiterter `smoke:ui` und `release:check -- --offline` bestanden. Nach Prüfung des installierten
Wrangler-Query-/Importverhaltens wurde zusätzlich der Preloader lokal getestet und die vollständige
Testsuite erneut erfolgreich ausgeführt. Technischer Offline-Status: `READY WITH KNOWN LIMITATIONS`;
keine neue Betriebsfreigabe. Alle drei Freeze-Gates **0 Abweichungen**: West 1.482, NSH 2.672,
BayWü 1.618 Ausgangsfassungen unverändert; keine neue Baseline und keine Freeze-Ausnahme.
Normbestand, Stichtage, Ledger und Quelleninventare blieben unverändert.

## Prüfnachweis Lauf 1

Alle verlangten lokalen Befehle ausgeführt: `npm run check` (0 Fehler, 0 Warnungen, 3 Hinweise),
`npm run test` (140 Dateien, 2.127 Tests bestanden), `npm run content:check` einschließlich Tabellen und
Simulationsgates, `npm run d1:schema:check`, `npm run build`, `npm run smoke:ui` und
`npm run release:check -- --offline --write` bestanden. Der vollständige technische Offline-Status ist
`READY WITH KNOWN LIMITATIONS`; er erteilt wegen der obenstehenden fachlichen und rechtlichen Punkte kein GO.
Zusätzlich West-Importaudit, Coverage und nach Berichtigung der D1-Gesamtzählung Readiness (`READY`) ausgeführt.
Keine Import- oder Inhaltsdatei geändert.

West-G2: 1.482 Ausgangsfassungen gegen `ff1b1f43e209`; NSH 2.672 gegen `eeeca2cdc559`;
BayWü 1.618 gegen `018752abcd5c`, jeweils unverändert, keine neue Baseline-Norm und keine Ausnahme.
NSH-/BayWü-Fingerabdrücke ebenfalls unverändert. Build enthält Hinweise auf bereits vorhandene dynamische
Modul-/Node-Fallbackpfade; der gebaute lokale Worker wurde ausgeführt. Detaillierte Einzelprüfungen stehen
im aktualisierten technischen Releasebericht; aktuelle Remoteergebnisse im Abschnitt Produktionsstand.
R2-Prüfung bezieht sich auf das West-Präfix, nicht auf einen vollständigen Restore aller Quellen.

## CI und Releaseablauf

Die seit 19.09.2026 entfernte GitLab-CI wird nicht blind zurückgebracht: sie war dauerhaft rot und
verbrauchte Minuten. Machbar ist ein einziger manuell startbarer GitLab-Job als Pilot, ohne Deploy,
Cloudflare-Anmeldung oder Secrets, mit passendem Node (mindestens 22.12), `npm ci` und
`npm run release:check -- --offline`. Dieser orchestriert bereits TypeScript/Astro, Tests, Content-/Freeze-
Gates, Projektion, Build und Suchprüfungen. Voraussetzung: vollständige Git-Historie/Freeze-Commits, alle
benötigten getrackten Quellen, genügend RAM/Laufzeit; npm-Cache nur für Pakete. Erst in einem frischen,
geheimnisfreien Checkout erfolgreich erproben und reale Minuten messen, dann gezielt auf Merge Requests
beschränken und alte Läufe abbrechen. Keine funktionslose Pipeline oder Tokens in PR-Prüfungen in Lauf 1.
Offline bedeutet ohne Produktionszugriffe, nicht ohne erstmaligen Paketdownload. Gehosteter Runner-Test
steht aus; lokale Caches beweisen dessen Machbarkeit nicht vollständig.

Spätere Auslieferung nur nach Freigabe:

1. Betreiber/Datenschutz/Kontakt, fachliche P0-Entscheidung und akzeptierte P1-Lücken, Betrieb/Vertretung
   schriftlich bestätigen; vollständige rechtliche Seiten und Kontakt testen.
2. Eigenes Staging konfigurieren; Sicherungen, Restore und Rollback dort erproben. Rate-/Kostenwarnungen
   und externe Alarmierung prüfen. Produktionsversion und Projektionen vor Eingriff festhalten.
3. Saubere freigegebene Revision, alle bestehenden Gates und Offline-Release; dann lesende Remoteprüfungen
   einschließlich Ost-Freshness. Alle drei Freeze-Commits unverändert lassen.
4. Neue Sim-Quellen nur Inbox → `sources:intake` Dry-run → eindeutige Zuordnung → freigegebenes `--write`;
   Lücke erst bei geschlossener Evidenz als `resolved`. Mögliche Baselinebelege nur als
   `freeze-review-candidate`, neue Seeds nur ausdrücklich freigeben. Bestehender Ablauf: [MAINTENANCE.md](MAINTENANCE.md).
5. Falls Bestandsänderungen nötig: R2-Originale unveränderlich archivieren, additive Migrationen und
   geprüfte eigene D1-Projektionen einzeln über Staging ausliefern, nie Ost schreiben. Bei diesem Lauf
   sind keine Normbestandsänderungen vorbereitet; die Oberflächenkorrekturen benötigen keine Neuprojektion.
6. Worker bauen und freigegeben ausliefern; Versionsannotation/Buildnachweis an Git-Revision binden;
   danach Header-, Health-, Smoke-, UI- und Suchprüfung. Bei Fehler Rollback wie oben.
7. Mindestens die erste Betriebsstunde eng überwachen, anschließend Routinechecks. Freigabeentscheidung
   enthält reale Verantwortliche, akzeptierte Lücken, Datum, Revision, Worker-Version und Rückfallversion.

Keine dieser späteren Schreib-/Deploymenthandlungen ist mit Lauf 1 freigegeben oder ausgeführt.
