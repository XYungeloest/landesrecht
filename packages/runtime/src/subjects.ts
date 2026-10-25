/** Dieselbe redaktionelle Zuordnung in SQL (Alias n); keine D1-Migration oder Ost-Schreibzugriffe. */
import { getSubjectGroup, SUBJECT_RULES, SUBJECT_ASSIGNMENTS, SUBJECT_GROUPS } from '@landesrecht/legal-core/config/subjects.ts';
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
export const sqlLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;
export function subjectPredicate(id: string, jurisdiction: JurisdictionId): string {
  if (!getSubjectGroup(id)) return `EXISTS (SELECT 1 FROM json_each(n.subjects_json) s WHERE s.value = ${sqlLiteral(id)})`;
  const explicit = SUBJECT_ASSIGNMENTS.filter((a) => a.jurisdiction === jurisdiction && a.status === 'accepted');
  const parts: string[] = [];
  const grouped = new Map<string, typeof SUBJECT_RULES>();
  for (const rule of SUBJECT_RULES) {
    if (rule.status !== 'accepted' || rule.jurisdiction !== jurisdiction || !rule.subjectIds.includes(id)) continue;
    const key = JSON.stringify([rule.system, rule.types]);
    grouped.set(key,[...(grouped.get(key) ?? []),rule]);
  }
  for (const rules of grouped.values()) {
    const rule = rules[0]!;
    const type = rule.types ? `n.type IN (${rule.types.map(sqlLiteral).join(',')}) AND ` : '';
    if (rule.system === 'ostrecht-subject') {
      parts.push(`(${type}EXISTS (SELECT 1 FROM json_each(n.subjects_json) s WHERE s.value IN (${rules.map((r) => sqlLiteral(r.match.exact!)).join(',')})))`);
    } else {
      const value = "json_extract(e.value, '$.value')";
      const head = `(CASE WHEN instr(${value}, '-') > 0 THEN substr(${value},1,instr(${value},'-')-1) ELSE ${value} END)`;
      const exact = rules.filter((r) => r.match.exact !== undefined);
      const lengths = [...new Set(rules.filter((r) => r.match.prefix !== undefined).map((r) => r.match.prefix!.length))];
      const matches = lengths.map((length) => `substr(${head},1,${length}) IN (${rules.filter((r) => r.match.prefix?.length === length).map((r) => sqlLiteral(r.match.prefix!)).join(',')})`);
      if (exact.length) matches.push(`${value} IN (${exact.map((r) => sqlLiteral(r.match.exact!)).join(',')})`);
      const match = `${head} GLOB '[0-9]*' AND ${head} NOT GLOB '*[^0-9.]*' AND ${head} NOT LIKE '%..%' AND ${head} NOT LIKE '%.' AND (${matches.join(' OR ')})`;
      parts.push(`(${type}EXISTS (SELECT 1 FROM json_each(n.meta_json, '$.externalIdentifiers') e WHERE json_extract(e.value,'$.system') = ${sqlLiteral(rule.system)} AND (${match})))`);
    }
  }
  let automatic = parts.length ? `(${parts.join(' OR ')})` : '0';
  if (explicit.length) automatic = `(${automatic} AND n.id NOT IN (${explicit.map((a) => sqlLiteral(a.normId)).join(',')}))`;
  const assigned = explicit.filter((a) => a.subjectIds.includes(id));
  return assigned.length ? `(${automatic} OR n.id IN (${assigned.map((a) => sqlLiteral(a.normId)).join(',')}))` : automatic;
}
export interface SubjectCounts { id: string; count: number }
export interface SubjectCoverage { total: number; assigned: number; unassigned: number; ambiguous: number; groups: SubjectCounts[] }
export { SUBJECT_GROUPS };
