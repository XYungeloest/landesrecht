# Audits

Ablage für Prüfberichte der Importpipeline (Phase „Audit“): je Importlauf ein JSON mit
Jurisdiktion, Quelle, externen Kennungen, Ergebnis und Befunden (`ImportAuditEntry` in
`packages/importers/common/src/pipeline.ts`). Aktuell leer; Berichte entstehen erst mit dem
ersten Importer (voraussichtlich RECHT.NRW → Land Westdeutschland).
