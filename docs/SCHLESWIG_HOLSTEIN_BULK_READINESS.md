# Bereitschaft des NSH-Ausgangsimports

**Stand 2026-09-17 · Ergebnis: NOT READY — nicht wegen fehlender Technik, sondern wegen fehlender Quelle.**

Dieses Dokument ist das Gegenstück zu `docs/RECHT_NRW_BULK_READINESS.md`. Dort steht eine
GO/No-Go-Liste, deren Punkte abgehakt werden können. Hier steht zuerst der eine Punkt, der
alle anderen sperrt, und danach ehrlich, was trotzdem fertig ist.

## 1 Der sperrende Punkt

Der Ausgangsbestand eines Landes besteht aus **konsolidierten Normtexten zum Stichtag**. Für
Schleswig-Holstein führt sie ausschließlich das juris-Landesrechtsportal
(`www.gesetze-rechtsprechung.sh.juris.de`). Dessen `robots.txt` lautet vollständig:

```text
User-agent: *
Disallow: /
```

Automatisierter Zugriff ist damit für jeden Client untersagt. Die Sperre wird **nicht umgangen** —
nicht über abweichende User-Agents, nicht über Suchmaschinen-Caches als Ersatzabruf, nicht über
Browserautomation, nicht über nichtöffentliche Schnittstellen. Begründung, geprüfte Alternativen und
die Bedingungen, unter denen sich das ändern würde, stehen in
`docs/SCHLESWIG_HOLSTEIN_ACCESS_CONSTRAINT.md`.

**Folge:** Es gibt keinen zulässigen Weg, konsolidierte SH-Normtexte maschinell zu beschaffen. Ein
Bulklauf hätte nichts zu importieren. Kein weiterer Prüfpunkt kann das aufwiegen, und keine Menge
Infrastruktur ersetzt eine Quelle.

Die Verkündungsblätter (GVOBl. Schl.-H., Amtsbl. Schl.-H.) sind zugänglich und werden genutzt — sie
enthalten aber **Verkündungstexte, keine konsolidierten Fassungen**. Aus ihnen ließe sich eine
Fassung zum Stichtag nur durch Nachvollzug sämtlicher Änderungsgesetze seit der Stammfassung
rekonstruieren, teils über Jahrzehnte. Das wäre kein Import, sondern eine Neuerstellung des
Rechtsbestands mit entsprechender Fehlerlast; es unterschreitet den Belegmaßstab, den West erfüllt,
und wird deshalb nicht getan.

## 2 Was fertig ist

Portalunabhängig gebaut, geprüft und lauffähig:

| Baustein | Stand | Ort |
| --- | --- | --- |
| Konstanten, Pfade, Umgebung | fertig | `packages/importers/juris-sh/src/common/` |
| Manifest (`juris-sh-import-manifest-entry/1`) | fertig | `common/manifest.ts` |
| Evidenzmodell und Entscheidungsregeln | fertig | `common/evidence.ts` |
| Reviewschlange, Overrides, Slug-Registry | fertig | `common/{review,overrides,slug-registry}.ts` |
| Rechtsüberleitung SH → NSH | fertig, getestet | `src/transform/` |
| Restpostenprüfung auf der fertigen Norm | fertig, getestet | `transform/audit-record.ts` |
| Post-Baseline-Ereignisregister | fertig, 5 857 Ereignisse, 54 baseline-only-Kandidaten | `src/events/`, `data/imports/juris-sh/events/` |
| VwV-Inventar | fertig, 846 Vorschriften | `data/imports/juris-sh/events/vwv-inventory.json` |
| CLI-Gerüst | 2 von 11 Befehlen umgesetzt (`review`, `events`) | `src/cli.ts` |

Die neun übrigen CLI-Befehle (`enumerate`, `sample`, `bulk`, `audit`, `coverage`, `readiness`,
`search-audit`, `reconstruction-queue`, `r2-sync`) melden ausdrücklich „noch nicht implementiert“ und
Exit-Code 2. Sie sind nicht implementiert, weil sie ohne Quelle nichts tun könnten — nicht, weil sie
vergessen wurden.

### Die Überleitung im Besonderen

Quell- und Zielname teilen den Bestandteil „Holstein“. Eine Regel, die Wortteile ersetzt, erzeugt
„Niedersachsen-Holstein-Holstein“. Deshalb greift **keine Regel auf Teilwörtern**: die Muster fordern
den vollen Landesnamen mit Wortgrenze. Die Doppelbildung ist dadurch strukturell ausgeschlossen, und
eine eigene Prüfung meldet sie zusätzlich als Fehler, falls eine künftige Regel das verletzt.

## 3 Was fehlt, sobald eine Quelle vorliegt

In dieser Reihenfolge:

1. **Parser** für das Quellformat. Nicht spekulativ vorzubauen: Welches Format kommt, hängt davon ab,
   auf welchem Weg der Zugang entsteht (Portalfreigabe, Datenlieferung, XML-Export). Ein Parser gegen
   ein vermutetes Format wäre wertloser Code mit falscher Sicherheit.
2. **Enumeration** mit Fixpunktprüfung (ein Rebuild muss konvergieren, der zweite byte-identisch sein).
   Der Mechanismus ist in `recht-nrw` erprobt und übertragbar.
3. **Stichtagsauswahl** je Norm mit den vier Wiederherstellungswegen, die das Manifestschema bereits
   kennt: `current-source`, `historical-juris-version`, `reverse-post-baseline-event`,
   `reconstructed-from-publications`.
4. **Bulklauf**, **Coverage**, **Audit**, **Suchprüfung** — analog West.

Der dritte Weg, `reverse-post-baseline-event`, ist der Grund, warum das Ereignisregister trotz
gesperrter Quelle gebaut wurde: Liegt später ein **heutiger** Bestand vor, lässt sich der Stichtag
durch Rückrechnung der 528 belegten Ereignisse ab 2023-12-02 erreichen, statt ihn zu raten. Und die
**54 baseline-only-Kandidaten** benennen vorab die Vorschriften, die am Stichtag galten und heute
fehlen — genau die Lücke, die ein reiner Abzug des heutigen Bestands hinterließe.

## 4 GO/No-Go

| # | Prüfpunkt | Stand |
| --- | --- | --- |
| 1 | Zulässiger Zugang zu konsolidierten Normtexten | **nein — sperrend** |
| 2 | Parser für das Quellformat | nein (folgt aus 1) |
| 3 | Enumeration konvergiert | nein (folgt aus 1) |
| 4 | Stichtagsstrategie je Norm belegt | vorbereitet, nicht anwendbar |
| 5 | Überleitung SH → NSH | **ja** |
| 6 | Zustandsschicht (Manifest, Review, Overrides, Slugs) | **ja** |
| 7 | Ereignisregister für die Zeit nach dem Stichtag | **ja** |
| 8 | Slug-Kollisionsfreiheit gegen den West-Bestand | **ja** (Suffix `-nsh`, `-sh` ist harter Fehler) |
| 9 | R2-Präfix kollisionsfrei | **ja** (`nsh/juris-sh/2023-12-01`) |
| 10 | Cloudflare-Ressourcen für NSH | nicht angelegt (kein Bedarf ohne Bestand) |

**Ergebnis: NOT READY.** Punkt 1 ist nicht durch Arbeit an diesem Repository lösbar.

## 5 Wie sich das auflösen ließe

Nur außerhalb des Codes, und nur durch den Nutzer:

- **Schriftliche Freigabe** des Zentralen IT-Managements Schleswig-Holstein oder der juris GmbH für
  automatisierten Zugriff auf das Landesrechtsportal, mit Angabe des zulässigen Umfangs. Läge sie
  vor, wäre sie hier zu hinterlegen und die Sperre insoweit gegenstandslos.
- **Datenlieferung** des konsolidierten Bestands in maschinenlesbarer Form.
- **Anderes Quellland** für `nsh`. Fachlich eine Entscheidung des Nutzers, keine technische: Die
  Zuordnung Schleswig-Holstein → Niedersachsen-Holstein steht im Jurisdiktionsregister und im README.

Bis dahin bleibt NSH ohne Normbestand. Das ist ein belegter Befund, kein offener Arbeitsrest.
