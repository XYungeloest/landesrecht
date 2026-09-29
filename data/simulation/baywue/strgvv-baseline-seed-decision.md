# StRGVV (`strgvv-baywue`) – Seed-Konflikt mit der Rückwirkungsregel

Offene Evidenzentscheidung, der einzige technische Blocker der BayWü-Freeze-Readiness (Lauf 18,
`docs/BAYWUE_BASELINE_FREEZE_READINESS.md`). Solange sie aussteht, bleiben Seed und veröffentlichte Ausgangsfassung unverändert.

## Befund

| | |
| --- | --- |
| Norm | Verordnung über die Geschäftsverteilung der Bayerischen Staatsregierung (StRGVV), BayRS 1102-2-S, Quelle `BayStRGVV` |
| Akzeptierter Seed | `89184e10d163…0604` (Migration Lock-Schema 1 → 2, Quell-Commit 21bab36ec) |
| Veröffentlichte Ausgangsfassung | heutiger Text, Paketdatum 2023-11-08 |
| Letzte Änderung | Verordnung vom 14. Mai 2024 (GVBl. 2024 S. 86), verkündet 2024-05-31, **rückwirkend in Kraft ab 2023-11-08** (Geschäftsverteilung der am 08.11.2023 gebildeten Staatsregierung) |
| Stichtagsklassifikation (Lauf 18, Regel 3b) | `changed-after-baseline` / `amended-after-baseline-portal-date-stale`: nach dem Stichtag ausgefertigte Änderung im heutigen Text |
| Rekonstruktion | `contradictory` / `chain-no-post-baseline-amendment` – die Engine kehrt nur Änderungen um, die nach dem Stichtag in Kraft treten; eine rückwirkend vor dem Stichtag wirksame, aber danach ausgefertigte Änderung bildet sie nicht ab |
| Sim-Fortschreibung | ein Rezept (`data/simulation/baywue/amendments/strgvv-2025-baywue/strgvv-baywue.json`): **Aufhebung** zum 2025-04-13, keine Textänderung |

## Konflikt

Nach `docs/SIMULATION_IMPORT.md` 6.2 gehört eine nach dem 01.12.2023 ausgefertigte Vorschrift nicht allein deshalb zum
Ausgangsrechtsstand, weil sie rückwirkend gilt. Auf eine Änderung angewandt: Die Stichtagsfassung wäre die Fassung vor
GVBl. 2024 S. 86 (letzte Änderung vom 14. September 2020). Der akzeptierte Seed enthält dagegen die rückwirkende Änderung.

## Optionen (Entscheidung des Nutzers)

1. **Seed bleibt maßgeblich** (wie `lbo-nsh`, ReasonCode `baseline-seed-authoritative`): Die ex post konsolidierte
   Geschäftsverteilung vom 08.11.2023 gilt für die Simulation als Ausgangsfassung. Dokumentierte Ausnahme von 6.2 für
   genau diese Norm. Kein Einfluss auf Sim-Recht, weil das Rezept die Norm nur aufhebt.
2. **Regel 6.2 streng**: Die Stichtagsfassung ist die Fassung vor GVBl. 2024 S. 86. Sie ist aus den vorhandenen Quellen
   nicht sicher rückrechenbar (Alttext der Änderung nicht belegt) und bräuchte die Stammfassung oder eine amtliche
   Fassung 2020. Dann ist ein neuer Seed nötig, erst nach belegter Rekonstruktion, und die Sim-Aufhebung wird neu
   geprüft.

Ohne Entscheidung: kein Freeze. Die Freeze-Readiness bleibt `NOT READY` mit genau diesem einen Blocker.

## Entscheidung (Human Decision 2026-09-29, Lauf 19)

Regel 6.2 gilt strikt; eine Ausnahme wie `lbo-nsh` gibt es hier nicht. LBO betraf verschiedene Parserausgaben derselben
belegten Quelle. Die StRGVV enthielt dagegen materiellen Wortlaut eines erst nach dem Stichtag erlassenen Rechtsakts.

- **Suche nach belegter Fassung vor GVBl. 2024 S. 86 (Fall A):** ohne Ergebnis. BAYERN.RECHT führt keine historischen
  Fassungen (`data/audits/bayernrecht/discovery/historical-versions.json`). Die Änderungsverkündung nennt für 7 Befehle den
  alten Wortlaut nicht (§ 8 Satz 1 Nr. 4 Buchst. e, § 9 Nr. 1 Buchst. c Doppelbuchst. gg, § 10 Nr. 2 Buchst. d, § 14 Nr. 10 u. a.).
  Die Stammverkündung (GVBl. 2014 S. 31) und die Änderungskette bis GVBl. 2020 S. 566 liegen nicht vor. Eine Rückrechnung aus
  vermutetem Alttext oder nach Ressortnamen ist ausgeschlossen.
- **Ergebnis: Fall B.**
  - `strgvv-baywue` ist aus dem veröffentlichten Ausgangsrechtsstand zurückgenommen (`withdrawn-text-unproven`). Slug und
    Quellidentität bleiben reserviert, die R2-Rohquellen bleiben erhalten.
  - Review: `resolved-excluded` / `text-unproven-after-baseline`.
- **Seed:** `89184e10…0604` steht nicht mehr unter `seeds[]`, sondern unter `supersededSeeds[]` in
  `data/simulation/baseline-locks.json`, mit Datum, Grund und dieser Entscheidung. Es gibt keinen aktiven StRGVV-Seed.
- **Sim-Aufhebung:** `strgvv-2025-baywue` hebt die Norm zum 2025-04-13 auf. Das bildet jetzt eine reine Identitäts- und
  Statusoperation ab (Rezeptfeld `targetExcluded`):
  - Zielidentität BayStRGVV, BayRS 1102-2-S;
  - Beziehungen `replaces` und `repeals` am Akt, Wirkdatum, Fundstelle § 12, Entscheidung im Konsolidierungsmanifest;
  - kein Zieltext, kein Seed, keine leere Fassung.
