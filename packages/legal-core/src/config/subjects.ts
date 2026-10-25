/** Redaktionelle Sachgebietsprojektion; unveränderliche Rechtsinhalte werden nur gelesen. */
import taxonomy from '../../../../data/editorial/subjects/taxonomy.json' with { type: 'json' };
import ost from '../../../../data/editorial/subjects/crosswalks/ost.json' with { type: 'json' };
import sh from '../../../../data/editorial/subjects/crosswalks/sh.json' with { type: 'json' };
import bayrs from '../../../../data/editorial/subjects/crosswalks/bayrs.json' with { type: 'json' };
import nrw from '../../../../data/editorial/subjects/crosswalks/nrw.json' with { type: 'json' };
import assignments from '../../../../data/editorial/subjects/assignments/index.json' with { type: 'json' };
import { isJurisdictionId, type JurisdictionId } from './jurisdictions.ts';
import { isNormType, type NormMeta, type NormType } from '../lib/schema.ts';

export interface SubjectRule {
  id: string;
  jurisdiction: JurisdictionId;
  system: string;
  types?: NormType[];
  match: { exact?: string; prefix?: string };
  subjectIds: string[];
  status: 'accepted' | 'pending' | 'rejected';
  evidence: { source: string; locator: string; label: string };
  decision: string;
}
export interface SubjectAssignment {
  normId: string;
  jurisdiction: JurisdictionId;
  subjectIds: string[];
  status: 'accepted' | 'pending' | 'rejected';
  ruleId: string;
  evidence: { source: string; locator: string; label: string };
  decision: string;
}
export const SUBJECT_GROUPS = taxonomy.groups;
export const SUBJECT_RULES = [...ost.rules, ...sh.rules, ...bayrs.rules, ...nrw.rules] as SubjectRule[];
export const SUBJECT_ASSIGNMENTS = assignments.assignments as SubjectAssignment[];
export const SUBJECT_COVERAGE_NOTICE = 'Die Sachgebietseinteilung wird schrittweise ergänzt. Nicht zugeordnete Vorschriften bleiben über die Suche und die Länderübersichten erreichbar.';
export const getSubjectGroup = (id: string) => SUBJECT_GROUPS.find((group) => group.id === id);

/** Nur der numerische Klassifikationskopf; Ressortbuchstaben und Titel sind keine Eingabe. */
export function classificationNumber(value: string): string | undefined {
  const head = value.split('-')[0] ?? '';
  return /^\d+(?:\.\d+)*$/u.test(head) ? head : undefined;
}
export function matchesSubjectRule(rule: SubjectRule, value: string): boolean {
  if (rule.match.exact !== undefined) return value === rule.match.exact;
  const number = classificationNumber(value);
  return number !== undefined && rule.match.prefix !== undefined && number.startsWith(rule.match.prefix);
}
export function validateSubjectData(rules = SUBJECT_RULES, explicit = SUBJECT_ASSIGNMENTS): void {
  const ids = new Set<string>();
  if (SUBJECT_GROUPS.length !== 8 || new Set(SUBJECT_GROUPS.map((g) => g.id)).size !== 8) throw new Error('Sachgebiete: ungültige Hauptgruppen');
  const evidence = (item: SubjectRule | SubjectAssignment) => {
    if (!item.evidence?.source || !item.evidence.locator || !item.evidence.label || !item.decision) throw new Error('Sachgebiete: Quellenbeleg/Entscheidung fehlt');
    if (!['accepted', 'pending', 'rejected'].includes(item.status)) throw new Error('Sachgebiete: unbekannter Entscheidungsstatus');
    if (!isJurisdictionId(item.jurisdiction)) throw new Error('Sachgebiete: unbekanntes Land');
    if (item.subjectIds.some((id) => !getSubjectGroup(id)) || (item.status === 'accepted' && !item.subjectIds.length)) throw new Error('Sachgebiete: unbekannte oder leere Zuordnung');
  };
  for (const rule of rules) {
    evidence(rule);
    if (!rule.id || ids.has(rule.id)) throw new Error('Sachgebiete: doppelte Regel-ID');
    ids.add(rule.id);
    if (!rule.system || (rule.types && (!rule.types.length || rule.types.some((t) => !isNormType(t))))) throw new Error('Sachgebiete: ungültiges Quellsystem/Normtyp');
    if ((rule.match.exact === undefined) === (rule.match.prefix === undefined)) throw new Error('Sachgebiete: genau eine Match-Art erforderlich');
    if (rule.status === 'accepted' && rule.match.prefix !== undefined && !/^\d+$/u.test(rule.match.prefix)) throw new Error('Sachgebiete: leerer/ungültiger Nummernbereich');
    if (rule.jurisdiction === 'ost' && (rule.system !== 'ostrecht-subject' || rule.match.exact === undefined)) throw new Error('Ost-Sachgebiete nur aus bekannten Quelltiteln');
  }
  const accepted = rules.filter((r) => r.status === 'accepted');
  for (const [index, a] of accepted.entries()) for (const b of accepted.slice(index + 1)) {
    if (a.jurisdiction !== b.jurisdiction || a.system !== b.system || (a.types && b.types && !a.types.some((t) => b.types!.includes(t)))) continue;
    const overlap = a.match.exact !== undefined && b.match.exact !== undefined ? a.match.exact === b.match.exact
      : a.match.prefix !== undefined && b.match.prefix !== undefined ? a.match.prefix.startsWith(b.match.prefix) || b.match.prefix.startsWith(a.match.prefix)
      : matchesSubjectRule(a.match.exact !== undefined ? b : a, (a.match.exact ?? b.match.exact)!);
    if (overlap) throw new Error(`Sachgebietskonflikt: ${a.id} / ${b.id}`);
  }
  const norms = new Set<string>();
  for (const item of explicit) {
    evidence(item);
    if (item.jurisdiction === 'ost') throw new Error('Keine dauerhaften Ost-Zuordnungen');
    if (!item.normId.startsWith(`${item.jurisdiction}:`) || !item.ruleId || norms.has(item.normId)) throw new Error('Sachgebiete: widersprüchliche/ungültige Normzuordnung');
    norms.add(item.normId);
  }
}
validateSubjectData();

export function deriveSubjectIds(meta: Pick<NormMeta, 'id' | 'jurisdiction' | 'type' | 'subjects' | 'externalIdentifiers'>, rules = SUBJECT_RULES, explicit = SUBJECT_ASSIGNMENTS): string[] {
  const assignment = explicit.find((a) => a.normId === meta.id && a.status === 'accepted');
  if (assignment) return [...new Set(assignment.subjectIds)].sort();
  const result = new Set<string>();
  for (const rule of rules) {
    if (rule.status !== 'accepted' || rule.jurisdiction !== meta.jurisdiction || (rule.types && !rule.types.includes(meta.type))) continue;
    const values = rule.system === 'ostrecht-subject' ? meta.subjects : meta.externalIdentifiers.filter((i) => i.system === rule.system).map((i) => i.value);
    if (values.some((value) => matchesSubjectRule(rule, value))) for (const id of rule.subjectIds) result.add(id);
  }
  return [...result].sort();
}
/** Reproduzierbarer Plan ohne Schreibzugriff; unbekannte Norm-IDs und Regelkonflikte sind Fehler. */
export function projectSubjectAssignments(metas: readonly NormMeta[], rules = SUBJECT_RULES, explicit = SUBJECT_ASSIGNMENTS) {
  validateSubjectData(rules, explicit);
  const ids = new Set(metas.map((meta) => meta.id));
  for (const item of explicit) if (!ids.has(item.normId)) throw new Error(`Sachgebiete: unbekannte Norm-ID ${item.normId}`);
  return metas.map((meta) => ({ normId: meta.id, subjectIds: deriveSubjectIds(meta, rules, explicit) })).sort((a, b) => a.normId.localeCompare(b.normId));
}
