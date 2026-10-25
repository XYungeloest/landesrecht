import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectSubjectAssignments, SUBJECT_RULES } from '@landesrecht/legal-core/config/subjects.ts';
import { parseNormMeta, type NormMeta } from '@landesrecht/legal-core/lib/schema.ts';
const metas: NormMeta[] = [];
for (const jurisdiction of ['west', 'nsh', 'baywue']) for (const entry of await readdir(join('content/norms', jurisdiction), { withFileTypes: true })) {
  if (entry.isDirectory()) metas.push(parseNormMeta(JSON.parse(await readFile(join('content/norms',jurisdiction,entry.name,'meta.json'),'utf8'))));
}
const plan = projectSubjectAssignments(metas);
console.log(`Sachgebiete: ${SUBJECT_RULES.filter((r) => r.status === 'accepted').length} akzeptierte Regeln; reproduzierbarer Leseplan, keine Datenbankänderung.`);
for (const jurisdiction of ['west', 'nsh', 'baywue']) {
 const own = plan.filter((p) => p.normId.startsWith(jurisdiction+':'));
 const assigned = own.filter((p) => p.subjectIds.length).length;
 console.log(`${jurisdiction}: ${own.length} Normen, ${assigned} zugeordnet, ${own.length-assigned} unassigned, 0 mehrdeutig, ${(100*assigned/own.length).toFixed(1)} %`);
}
