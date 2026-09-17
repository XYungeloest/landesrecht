# Zugriffsbeschränkung: konsolidiertes Landesrecht Schleswig-Holstein (juris)

**Status: BLOCKIERT für automatisierten Abruf. Stand 2026-09-17.**

## Befund

`https://www.gesetze-rechtsprechung.sh.juris.de/robots.txt` (am 2026-09-17 selbst abgerufen) listet eine
Reihe namentlich genannter Suchmaschinen-Bots mit `Allow: /` und schließt danach alle übrigen aus:

```text
User-agent: *
Disallow: /
```

Ein Importer dieses Projekts gehört nicht zu den freigegebenen Bots. Damit ist der automatisierte Abruf des
konsolidierten Landesrechts (Bürgerservice/juris Schleswig-Holstein) **untersagt**. Dieselbe Politik gilt nach
Beobachtung für weitere juris-Landesportale (u. a. BW, RLP, HH, MV); sie ist Plattformpolitik, nicht
SH-spezifisch.

## Entscheidung

Kein Abruf dieses Hosts – weder über den Importer noch manuell in großem Umfang. Die Regel wird nicht
umgangen (keine abweichenden User-Agents, keine Suchmaschinen-Caches als Ersatzabruf, keine Browserautomation).
Das entspricht der Projektregel „Keine Umgehung von Rate Limits, Sperren, CAPTCHAs oder Bot-Schutz" und der
ausdrücklichen Auftragsvorgabe, bei untersagten Pfaden auf alternative amtliche Quellen auszuweichen.

## Folgen für den NSH-Ausgangsbestand

Der Stichtagsbestand zum 2023-12-01 sollte aus konsolidierten Fassungen gewonnen werden. Diese Quelle entfällt.
Erlaubt und amtlich sind weiterhin:

| Quelle | Host | Zugriff |
| --- | --- | --- |
| Gesetz- und Verordnungsblatt (GVOBl. Schl.-H.) | `www.schleswig-holstein.de` | erlaubt (robots.txt sperrt nur einzelne, andere Pfade) |
| Amtsblatt Schl.-H. | `www.schleswig-holstein.de` | erlaubt |
| Erlassverzeichnis (Verwaltungsvorschriften) | `www.schleswig-holstein.de` | erlaubt |
| Offene Daten des Landes | `opendata.schleswig-holstein.de` | erlaubt außer `/api/`; kein Landesrechtsdatensatz gefunden |

Diese Quellen liefern **Verkündungsfassungen und Änderungsbefehle**, nicht den konsolidierten Textstand.
Ein konsolidierter Bestand ließe sich daraus nur durch vollständige Rekonstruktionsketten je Norm gewinnen
(Stammfassung + alle Änderungen bis zum Stichtag). Nach den Projektregeln ist erzeugter Normtext ohne
vollständige, belegte Rezeptkette unzulässig; für einen ganzen Landesbestand ist das in vertretbarer Zeit und
Qualität nicht leistbar. Ergebnis: **kein NSH-Vollbulk aus diesen Quellen.**

## Was stattdessen möglich ist (und in diesem Lauf verfolgt wird)

1. **Ereignisregister** aus GVOBl. und Amtsblatt ab 2023-12-02 (Aufhebungen, Änderungen, Neufassungen,
   Befristungen) – erlaubt, amtlich, und unabhängig von der Textquelle dauerhaft nützlich.
2. **Erlassverzeichnis** als Discovery-Quelle für Verwaltungsvorschriften (Gliederungsnummer, Titel,
   Fundstelle, Geltungsstatus).
3. **Portalunabhängige Adapterinfrastruktur** für `nsh` (Zustandsschicht, Evidenzmodell, Transformation
   SH → NSH, CLI) – vollständig ohne Netzzugriff baubar und sofort nutzbar, sobald eine zulässige Textquelle
   vorliegt.

## Was nötig wäre, um NSH tatsächlich zu importieren

Eine der folgenden Freigaben – vom Menschen einzuholen, nicht automatisierbar:

1. Schriftliche Zustimmung des Zentralen IT-Managements Schleswig-Holstein bzw. der juris GmbH zum
   automatisierten Abruf (idealerweise mit benanntem User-Agent und Ratenvorgabe), oder
2. eine Datenlieferung/ein Exportformat des konsolidierten Landesrechts (analog zu den XML-Exporten anderer
   Länder), oder
3. eine andere amtliche Quelle mit konsolidierten Fassungen, die automatisierten Abruf erlaubt.

Bis dahin bleibt NSH auf dem Stand „Infrastruktur bereit, Quelle gesperrt".

## Hinweis zu anderen Ländern

`https://www.gesetze-bayern.de/robots.txt` erlaubt dagegen ausdrücklich `User-agent: * / Allow: /`.
Der Bayern-Adapter (Simulationsland `baywue`) ist deshalb ohne diese Beschränkung vorbereitbar.
