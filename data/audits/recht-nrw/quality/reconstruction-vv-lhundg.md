# Rekonstruktions-Audit VV LHundG (vv-lhundg-west, term:23528)

Erzeugt mit `npm run audit:reconstruction`: die Stichtagsfassung wird zweimal offline (nur `.cache/recht-nrw`,
Offline-Fetcher) in je ein temporäres Ausgaberoot erzeugt (`importRechtNrwLrmbDocument`, Schreiblauf außerhalb des
Repositories) und mit Rezept `data/imports/recht-nrw/reconstructions/term-23528.json`, Manifest und Bestand verglichen.

## Prüfungen

| Prüfung | Ergebnis | Detail |
| --- | --- | --- |
| Lauf 1 erfolgreich (Status imported*) | bestanden | imported-with-warnings (write-canonical-json) |
| Keine Netzabrufe (nur Cache) | bestanden | Netz 0/0, Cache 6/6 |
| Basis-Fingerabdruck = Rezept | bestanden | de8736c4149aeac86ba3fa183e9c6719d34f597795b3780a88b1dfdd2161fac8 vs. de8736c4149aeac86ba3fa183e9c6719d34f597795b3780a88b1dfdd2161fac8 |
| Ergebnis-Fingerabdruck = Rezept | bestanden | 0267991fc0f2e39594e74f9e1b3d9821a3c30e01742306899295d4404221a80b vs. 0267991fc0f2e39594e74f9e1b3d9821a3c30e01742306899295d4404221a80b |
| Basis-Fingerabdruck = Manifest (erster Schritt vorher) | bestanden | de8736c4149aeac86ba3fa183e9c6719d34f597795b3780a88b1dfdd2161fac8 |
| Ergebnis-Fingerabdruck = Manifest (letzter Schritt nachher) | bestanden | 0267991fc0f2e39594e74f9e1b3d9821a3c30e01742306899295d4404221a80b |
| Schrittkette (Id, vorher, nachher) = Manifest | bestanden | 6 Schritte im Lauf, 6 im Manifest |
| Anzahl Änderungsbefehle = Rezept | bestanden | 6 |
| Endgültiger Normkörper (nach Transformation) = Bestand | bestanden | 590f761fc4f66c9c27baff7b8d4f0667b3df44ab7d7d9b9142da2f5e0700cc87 vs. 590f761fc4f66c9c27baff7b8d4f0667b3df44ab7d7d9b9142da2f5e0700cc87 |
| Rohquellen-Hashes = Manifest des Bestands | bestanden | gazette-amendment:2eb849e23affc1f0246589c683083d633bc8ad6581d0efcd84ee23be96b2f838, gazette-amendment:8b2cfa8c4f681218626c59302ce5b870b85d296c5e066bf86fd9316d603f49cb, gazette-amendment:978325d257c5fbc45abb8b5d9cfb0d96dadef5b16eb049ba1931937a2cba045c, version-page:1febb67789d814c35b49076a862216e854fb2e66e27a7ea175d799d51574ef35 |
| Determinismus: Lauf 2 identisch (Basis, Schritte, Ergebnis, Normkörper) | bestanden | imported-with-warnings |
| Bestand nicht berührt (Ausgaberoot ≠ Repository) | bestanden | /var/folders/lz/48dsvnvs7b78prwlj_xbbzmr0000gn/T/landesrecht-reconstruction-lauf-1-tuCcHs |
| Quellenlage der Fassung im Bestand: reconstructed/reconstructed | bestanden | {"validity":"reconstructed","text":"reconstructed","note":"Stichtagsfassung rekonstruiert: konsolidierter Portaltext abzüglich der nach dem Stichtag in Kraft getretenen Änderung(en) (Runderlass vom 16. Juli 2024, MBl. NRW. 2024 S. 805); jeder Schritt ist im Quellenbereich belegt."} |

**Gesamt: alle Prüfungen bestanden.**

## Fingerabdrücke

| Größe | Rezept | Manifest (Bestand) | Lauf 1 | Lauf 2 |
| --- | --- | --- | --- | --- |
| Basis | de8736c4149aeac86ba3fa183e9c6719d34f597795b3780a88b1dfdd2161fac8 | de8736c4149aeac86ba3fa183e9c6719d34f597795b3780a88b1dfdd2161fac8 | de8736c4149aeac86ba3fa183e9c6719d34f597795b3780a88b1dfdd2161fac8 | de8736c4149aeac86ba3fa183e9c6719d34f597795b3780a88b1dfdd2161fac8 |
| Ergebnis (vor Transformation) | 0267991fc0f2e39594e74f9e1b3d9821a3c30e01742306899295d4404221a80b | 0267991fc0f2e39594e74f9e1b3d9821a3c30e01742306899295d4404221a80b | 0267991fc0f2e39594e74f9e1b3d9821a3c30e01742306899295d4404221a80b | 0267991fc0f2e39594e74f9e1b3d9821a3c30e01742306899295d4404221a80b |
| Normkörper (nach Transformation) | – | 590f761fc4f66c9c27baff7b8d4f0667b3df44ab7d7d9b9142da2f5e0700cc87 | 590f761fc4f66c9c27baff7b8d4f0667b3df44ab7d7d9b9142da2f5e0700cc87 | 590f761fc4f66c9c27baff7b8d4f0667b3df44ab7d7d9b9142da2f5e0700cc87 |

## Schritte (Lauf 1)

| Schritt | vorher | nachher | wie Manifest |
| --- | --- | --- | --- |
| mbl-2024-805-6 | de8736c4149aeac86ba3fa183e9c6719d34f597795b3780a88b1dfdd2161fac8 | d3e3b7ff58073ac4457e628fe48aa4f87a860795cab69eb6bedb328c73f075ed | ja |
| mbl-2024-805-5 | d3e3b7ff58073ac4457e628fe48aa4f87a860795cab69eb6bedb328c73f075ed | cd2b0b1646b6d8613363c2965f36fa84a524ca784ccf92101bec40db4394645f | ja |
| mbl-2024-805-4 | cd2b0b1646b6d8613363c2965f36fa84a524ca784ccf92101bec40db4394645f | c29d5af623a7d14e45e54482dd2e5d410ad199f75fcb9d66ebad58f0c636d501 | ja |
| mbl-2024-805-3 | c29d5af623a7d14e45e54482dd2e5d410ad199f75fcb9d66ebad58f0c636d501 | 897da1b3be28fde7fb82cb4f2872f912e1c8d6631ae92ac6b6c61259a6e1c912 | ja |
| mbl-2024-805-2 | 897da1b3be28fde7fb82cb4f2872f912e1c8d6631ae92ac6b6c61259a6e1c912 | 189210b015fe1ba7d294381d2b5e4617840ff8f3df81af493b7d26d5ee0d8658 | ja |
| mbl-2024-805-1 | 189210b015fe1ba7d294381d2b5e4617840ff8f3df81af493b7d26d5ee0d8658 | 0267991fc0f2e39594e74f9e1b3d9821a3c30e01742306899295d4404221a80b | ja |

## Lauf 1

Status imported-with-warnings (write-canonical-json); Abrufe: 0 Netz, 6 Cache; geschriebene Dateien (relativ zum Ausgaberoot): 10.

- [warning] undated-record-without-validity: Undatierter LRMB-Datensatz ohne „Gültig ab“ (Geltung nur über Belege bestimmbar)
- [warning] undated-record-without-version-list: Undatierter LRMB-Datensatz ohne Fassungsliste
- [warning] structure-numbering: Auffälligkeiten der Nummernfolge: Nummer 2.3.1 ohne übergeordnete Nummer 2.3; Nummer 2.3.2 ohne übergeordnete Nummer 2.3; Nummer 3.2.1 ohne übergeordnete Nummer 3.2; Nummer 3.2.2 ohne übergeordnete Nummer 3.2; Nummer 3.2.3 ohne übergeordnete Nummer 3.2; Nummer 3.2.4 ohne übergeordnete Nummer 3.2; Nummer 3.3.1 ohne übergeordnete Nummer 3.3; Nummernfolge 3.2.4 → 3.3.1 …
- [info] reconstruction-applied: Stichtagsfassung mit geprüftem Rezept rekonstruiert (6 Schritte; Basis de8736c4149a → Ergebnis 0267991fc0f2)
- [warning] enacting-body-mapping-required: Erlassorgan der Quelle „Ministerium für Umwelt und Naturschutz, Landwirtschaft und Verbraucherschutz“ ohne sichere Entsprechung; Simulationsorgan bleibt leer (manuelle Entscheidung)
- [warning] unresolved-source-references: 16 NRW-spezifische Bezeichnung(en) ohne automatische Entsprechung (siehe Transformationsreport)
