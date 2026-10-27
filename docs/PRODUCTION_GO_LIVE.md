# Betriebsfreigabe Landesrecht

Prüftag: **27.10.2026**. Ausgangspunkt: sauberer Commit
`1df581af95e6fc523f6b1aaf962583cf51535eab`; Lauf 1 ergänzt ausschließlich uncommittete Änderungen.
Kein Commit, Push, Deployment, Remote-Schreibzugriff oder neues Cloudflare-Betriebsmittel in diesem Lauf.
Stichtage bleiben 01.12.2023 / 28.09.2026. Technische Prüfergebnisse: [RELEASE_READINESS.md](RELEASE_READINESS.md).
Fachentscheidungen und 28 konkrete Fälle: [PRODUCTION_QUALITY_BACKLOG.md](PRODUCTION_QUALITY_BACKLOG.md).

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

## Fehlermeldesystem Lauf 2

Footer verlinkt jetzt Fehler melden, Kontakt, Datenschutz und Impressum; Normköpfe enthalten den Meldezugang.
Die Vorbereitungsseite sagt ausdrücklich, dass noch keine Übermittlung möglich ist.

Vorgeschlagene Umsetzung ohne neue Frameworks:

1. Astro-GET-Seite mit verständlichem Formular, ohne Anmeldung. Norm-/Fassungs-/Einzelvorschrift-URL beim
   Klick über zentralen Routenhelfer als `seite` übernehmen; nur eigene Origin und bekannte Normpfade,
   Query/Fragment standardmäßig entfernen (keine Suche, Textmarker oder fremden URLs sammeln).
2. Pflicht: Kategorie und Beschreibung. Kategorien: Wortlaut/Anlage, Geltung/Fassung, Quelle/Verkündung,
   Suche/Verweis, Darstellung/Bedienung, technischer Fehler, Sonstiges. Rückkontakt-E-Mail freiwillig,
   keine Namenspflicht, keine Anhänge, klare Zeichenlimits, barrierefreie Beschriftung/Fehlermeldung und
   Bestätigungsansicht mit zufälliger Vorgangsnummer.
3. Separate Feedback-D1 oder gleichwertiger isolierter Speicher, **keine neue Ressource in Lauf 1**.
   Tabelle mit zufälliger ID, Erstellzeit, bereinigtem Normpfad, Kategorie, Beschreibung, optional E-Mail,
   Status `new|triaged|in-progress|resolved|rejected`, Bearbeitungszeit; interne Notizen getrennt.
   Keine Voll-IP/User-Agent-Speicherung in Feedbackdatensätzen, keine öffentlichen Meldungslisten.
4. POST erst nach vollständiger Absicherung: Content-Type-/Origin-Prüfung, kleine Body-/Feldlimits,
   serverseitige Validierung und parametrisierte SQL-Anweisungen, globale und zeitlich begrenzte
   Missbrauchslimits, Honeypot/Mindestbearbeitungszeit und bei Bedarf Turnstile nach Datenschutzprüfung.
   Ein IP-basierter Drosselschlüssel wäre kurzlebig mit rotierendem Geheimnis zu bilden; Frist/Grundlage
   vorher festlegen. Fehler dürfen keine Datenbankdetails verraten; Duplikate/Idempotenz behandeln.
5. Interne Sichtung hinter bestehender geeigneter Zugangskontrolle (z. B. Cloudflare Access), mit benannten
   Redakteuren und Vertretung; Zugriff und Statuswechsel nachvollziehbar. Keine öffentliche Adminroute.
   P0 sofort fachlich prüfen, übrige Fälle regelmäßig sichten; Code-/Bestandskorrekturen folgen weiter den
   existierenden Review-/Freeze-/Sim-Rezeptregeln, nie automatischem Übernehmen einer Meldung.
6. Vor Freigabe Löschfristen für Spam, Kontakt, abgeschlossene Fälle und Protokolle, Rechteausübung,
   Empfänger und Datenschutztext festlegen. Tests für Validierung, Größenlimits, Drosselung,
   Rechtekontrolle und XSS; vollständiger Test gegen isolierten Speicher, danach explizite Aktivierung.

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
