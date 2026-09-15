# Lokale Laufzeitprojektionen

`npm run d1:seed:local` erzeugt hier je Jurisdiktion eine SQLite-Datei
(`landesrecht-<jurisdiction>.sqlite`) mit dem Schema aus `data/d1/` und der Projektion aus
`content/`. `npm run d1:apply:remote` schreibt stattdessen SQL-Dateien (`landesrecht-<jurisdiction>.sql`),
die manuell mit `wrangler d1 execute` eingespielt werden können. Beides ist deterministisch aus
Git erzeugbar und wird nicht eingecheckt.
