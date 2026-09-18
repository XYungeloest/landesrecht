# Beschaffung BAYERN.RECHT – Exportpakete im lokalen Cache

Quelle Bayern (gesetze-bayern.de) → Simulationsland BAYWUE. Stand 2026-09-18T01:16:19.018Z.

Dieser Lauf beschafft nur: Er lädt je enumeriertem Dokument das XML-Exportpaket unverändert in den
lokalen Cache und prüft an der Antwort ausschließlich, dass sie ein ZIP ist. Es entsteht keine Norm,
kein Content und kein Manifesteintrag; der vollständige Zustand steht in `data/imports/bayernrecht/fetch-state.json`.

## Bilanz

| Kennzahl | Wert |
| --- | --- |
| enumerierte Dokumente | 2413 |
| davon im Cache | 2413 |
| in diesem Lauf geholt | 0 |
| in diesem Lauf aus dem Cache | 2413 |
| gescheitert | 0 |
| offen | 0 |
| Gesamtgröße im Cache | 713,4 MB |
| in diesem Lauf übertragen | 0 B |
| Netzabrufe | 0 |
| Dauer | 0 s |

Die Zeilen „davon im Cache“, „gescheitert“, „offen“ und „Gesamtgröße“ beschreiben den **Bestand**,
die Zeilen „in diesem Lauf“ den Lauf, der diese Datei geschrieben hat. Ein Wiederanlauf auf
vollständigem Bestand ist netzfrei und meldet deshalb 0 geholte Dokumente bei vollem Cache.

### Je Quellbereich

| Bereich | enumeriert | im Cache | gescheitert | offen |
| --- | --- | --- | --- | --- |
| landesrecht | 935 | 935 | 0 | 0 |
| vwv | 1478 | 1478 | 0 | 0 |

## Abbruchgrund

Kein Abbruch: Der Lauf ist bis zum Ende der Liste gekommen.

## Fehler

Keine.

## Befunde

Keine. Kein vorhandener Cacheeintrag wurde ersetzt.
