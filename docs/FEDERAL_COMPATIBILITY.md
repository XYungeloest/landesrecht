# Bundesrecht und Rechtsverweise

Bundesrecht wird extern unter `https://gesetze-sim-internet.de` geführt. Dieses Repository trifft
keine Annahmen über dessen Tech-Stack oder Datenbank und baut den PHP-Stack nicht nach.

## FederalProvider (`packages/providers/src/federal.ts`)

Einzige Stelle, die Bundesrechts-URLs bildet:

```text
BGB          → https://gesetze-sim-internet.de/gesetz.php?g=bgb
GG           → https://gesetze-sim-internet.de/gesetz.php?g=gg
BGB § 823    → https://gesetze-sim-internet.de/gesetz.php?g=bgb&p=823
GG Art. 5 I  → https://gesetze-sim-internet.de/gesetz.php?g=gg&art=5&abs=1
```

`federalNormKey` normalisiert die Abkürzung (Kleinschreibung, ohne Diakritika/Sonderzeichen).
Die Parameter `p`, `art`, `abs` sind eine Annahme für die spätere Feinadressierung; der
Grundlink `gesetz.php?g=<abk>` ist die verbindliche Schnittstelle. Der Provider liefert keine
Normdaten (`providesNorms = false`), nur Verweisauflösung.

## Rechtsverweise (`packages/legal-core/src/lib/references.ts`)

```json
{ "type": "legalReference", "jurisdiction": "bund", "norm": "BGB", "provision": "§ 823" }
```

Ein Verweis enthält nie eine URL. `parseProvision` zerlegt `§ 3 Abs. 2` / `Art. 5 Abs. 1` in
`{ kind, number, subsection }`; `provisionAnchor` liefert das Sprungziel (`paragraph-3`,
`artikel-5`) für interne Ziele.

## Resolver (`packages/providers/src/resolver.ts`)

```text
bund   → FederalProvider (extern)
ost    → OstRechtProvider (extern, später ContentProvider)
west   → ContentProvider (/west/norm/<slug>/#paragraph-…)
nsh    → ContentProvider
baywue → ContentProvider (/bayern-wuerttemberg/norm/<slug>/…)
```

Komponenten rufen ausschließlich `resolveLegalReference` über `getReferenceResolver()`
(`apps/web/src/lib/runtime/context.ts`); keine Komponente bildet selbst eine URL. Das Ergebnis
(`ResolvedReference`) nennt Ziel-URL, `external`, Bezeichnung und Zielsystem.

## Offen

- Verlinkung von Verweisen im gerenderten Normtext (Text-Link-Referenzen wie in OstRecht) – der
  Resolver ist vorbereitet, die Textannotation folgt mit den Importern.
- Ein späterer Bundesrechts-Provider mit Normdaten kann die Schnittstelle `LegalProvider`
  vollständig implementieren, sobald das Bundesrechts-Repository vorliegt.
