/**
 * Regressionsschutz beider Importpfade (LRGV, LRMB): Ergibt der Reimport einer bereits übernommenen Norm keinen
 * Import mehr, bleiben Manifest und Inhalt beim zuletzt übernommenen Stand (`import-regression`, Fehler). Nur
 * eine dokumentierte Legacy-Ausnahme (`legacy-exceptions.ts`) ändert das – und nur, wenn Quelle, gespeicherter
 * Stand, aktueller Parser und Fehlercodes genau der Freigabe entsprechen (fail-closed):
 *   deliver-legacy  gespeicherte Fassung bleibt, Befund als Warnung (begründeter Altstand im Versionsreport)
 *   depublish       Inhalt und Audit-Report werden kontrolliert entfernt, der Manifesteintrag trägt den aktuellen
 *                   Befund (Status, Parserversion); der Slug bleibt reserviert. Dry-run entfernt nichts.
 */
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';

import { legacyExceptionFor, matchLegacyException, readLegacyExceptions } from './legacy-exceptions.ts';
import { AUDIT_DIR, type ImportStatus, type ManifestEntry } from './manifest.ts';
import { depublishInitialNorm, FileWriter } from './persist.ts';

export interface RegressionResult {
  status: ImportStatus;
  findings: ImportFinding[];
  manifestEntry?: ManifestEntry;
  writtenFiles: string[];
}

/** Liefert, ob der gespeicherte Manifesteintrag erhalten bleibt (true) oder der neue Befund persistiert wird (false). */
export async function resolveImportRegression(input: { root: string; write: boolean; previous: ManifestEntry; result: RegressionResult; baseline: string; label?: string }): Promise<boolean> {
  const { previous, result } = input;
  const summary = `Bereits übernommene ${input.label ?? 'Norm'} ${previous.targetSlug} ergibt jetzt ${result.status}`;
  const keep = (detail: string): true => {
    result.findings.push({ severity: 'error', code: 'import-regression', message: `${summary}; Manifest und Inhalt bleiben beim zuletzt übernommenen Stand (manuelle Prüfung)${detail}` });
    return true;
  };
  const exception = legacyExceptionFor(await readLegacyExceptions(input.root), previous.sourceIdentity);
  if (!exception) return keep('');
  const match = matchLegacyException(exception, { sourceSha256: result.manifestEntry!.sha256, previous, currentErrorCodes: result.findings.filter((finding) => finding.severity === 'error').map((finding) => finding.code) });
  if (!match.applies) return keep(`; Legacy-Ausnahme ${exception.id} greift nicht: ${match.mismatches.join('; ')}`);
  const approval = `Legacy-Ausnahme ${exception.id} (freigegeben ${exception.approvedAt}, ${exception.approvedBy})`;
  if (exception.disposition === 'deliver-legacy') {
    result.findings.push({ severity: 'warning', code: 'import-regression-legacy', message: `${summary}; die gespeicherte Fassung (${previous.parserVersion}) wird laut ${approval} weiter ausgeliefert: ${exception.reason}` });
    return true;
  }
  if (input.write) {
    const writer = new FileWriter(input.root);
    const blocked = await depublishInitialNorm(writer, previous.targetSlug, input.baseline);
    if (blocked) {
      result.findings.push(blocked);
      return keep(`; Depublikation laut ${approval} nicht möglich`);
    }
    await rm(join(input.root, AUDIT_DIR, `${previous.targetSlug}.json`), { force: true });
    result.writtenFiles.push(...writer.written);
  }
  result.findings.push({ severity: 'warning', code: 'import-regression-depublished', message: `${summary}; laut ${approval} depubliziert: Inhalt ${previous.targetSlug} entfernt, Manifest trägt den aktuellen Befund (${exception.reason})` });
  return false;
}
