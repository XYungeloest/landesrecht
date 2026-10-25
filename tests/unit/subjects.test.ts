import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { deriveSubjectIds, matchesSubjectRule, projectSubjectAssignments, SUBJECT_GROUPS, SUBJECT_RULES, validateSubjectData, type SubjectAssignment, type SubjectRule } from '@landesrecht/legal-core/config/subjects.ts';
import { createD1NormStore } from '@landesrecht/runtime/d1-store.ts';
import { createFileNormStore } from '@landesrecht/runtime/file-store.ts';
import { buildProjectionPlan } from '@landesrecht/runtime/projection.ts';
import { executePlan, openSqliteD1, type SqliteD1Database } from '@landesrecht/runtime/sqlite-d1.ts';
import { parsePublicSearchState } from '@landesrecht/search/query.ts';
import { getSearchUrl } from '@landesrecht/legal-core/lib/routes.ts';
import { norm, paragraph } from '../helpers/fixture-corpus.ts';
import { openOstRechtFixture } from '../helpers/ostrecht-fixture.ts';
import { createStoreRegistry } from '@landesrecht/runtime/registry.ts';
import { subjectListing, subjectCoverage } from '../../apps/web/src/lib/subjects.ts';
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';

const databases: SqliteD1Database[] = [];
afterAll(() => databases.forEach((db) => db.close()));
const sample = (jurisdiction: JurisdictionId, slug: string, system: string, value: string, type='gesetz', versions?: Parameters<typeof norm>[0]['versions']) => norm({ jurisdiction, slug, meta:{type, subjects:[], externalIdentifiers:[{system,value}]}, versions: versions ?? [{versionId:'2023-12-01',simulationValidFrom:'2023-12-01',body:[paragraph('§ 1','Zweck','Suchwort')] }] });

describe('Sachgebietstaxonomie und freigegebene Regeln', () => {
  it('übernimmt alle acht Gruppen und 56 Untergruppen exakt aus der belegten Ost-Konfiguration', () => {
    const ost = JSON.parse(readFileSync(new URL('../../data/editorial/subjects/taxonomy.json', import.meta.url),'utf8'));
    expect(SUBJECT_GROUPS).toHaveLength(8);
    expect(SUBJECT_GROUPS.flatMap((g)=>g.subgroups)).toHaveLength(56);
    expect(ost.groups.map((g:{title:string})=>g.title)).toEqual(SUBJECT_GROUPS.map((g)=>g.title));
    for (const group of SUBJECT_GROUPS) for (const subgroup of group.subgroups) {
      const rule = SUBJECT_RULES.find((r) => r.id === subgroup.id)!;
      expect(rule.match.exact).toBe(subgroup.title);
      expect(rule.subjectIds).toEqual([group.id]);
    }
    for(const rule of SUBJECT_RULES.filter((r)=>r.jurisdiction==='ost')) {
      const meta=sample('ost','example','unused','x').meta;
      expect(deriveSubjectIds({...meta,subjects:[rule.match.exact!]})).toEqual(rule.subjectIds);
    }
    expect(deriveSubjectIds({...sample('ost','unknown','x','x').meta,subjects:['Unbekanntes Sachgebiet']})).toEqual([]);
  });
  it('prüft Positiv- und Grenzfälle für jede verwendete Regel', () => {
    for(const rule of SUBJECT_RULES.filter((r)=>r.status==='accepted')) {
      const value=rule.match.exact ?? `${rule.match.prefix}0-1`;
      expect(matchesSubjectRule(rule,value),rule.id).toBe(true);
      expect(matchesSubjectRule(rule,`X${value}`),rule.id).toBe(false);
      if(rule.match.prefix) {
        expect(matchesSubjectRule(rule,rule.match.prefix+'abc'),rule.id).toBe(false);
        expect(matchesSubjectRule(rule,rule.match.prefix+'.'),rule.id).toBe(false);
      }
    }
  });
  it('trennt gemischte Untergruppen, Ministerialblatt-Systematiken und Ressortbuchstaben', () => {
    expect(deriveSubjectIds(sample('nsh','a','gliederungsnummer-sh','223-1').meta)).toEqual(['bildung-kultur']);
    expect(deriveSubjectIds(sample('nsh','b','gliederungsnummer-sh','2134.12','verwaltungsvorschrift').meta)).toEqual(['planung-verkehr']);
    for(const code of ['21-1','2242-1','66.1','B 223-1','22abc']) expect(deriveSubjectIds(sample('nsh','c','gliederungsnummer-sh',code).meta)).toEqual([]);
    expect(deriveSubjectIds(sample('baywue','b','bayrs','2210-1-1-K').meta)).toEqual(['bildung-kultur']);
    expect(deriveSubjectIds(sample('baywue','b','bayrs','2210-1-1-F').meta)).toEqual(['bildung-kultur']);
    for(const [value,type] of [['2210-K','verwaltungsvorschrift'],['2242-1-WK','gesetz'],['2129-1-U','gesetz'],['520-X','gesetz']]) expect(deriveSubjectIds(sample('baywue','c','bayrs',value!,type).meta)).toEqual([]);
    expect(deriveSubjectIds(sample('west','c','recht-nrw','223-1').meta)).toEqual([]);
  });
  it('projiziert idempotent, unterstützt belegte Mehrfachzuordnung und weist Konflikte/unbekannte IDs zurück', () => {
    const meta=sample('nsh','multi','gliederungsnummer-sh','223-1').meta;
    const rule=SUBJECT_RULES.find((r)=>r.id==='sh-gvobl-223')!;
    const multi:SubjectRule={...rule,subjectIds:['bildung-kultur','planung-verkehr']};
    const plan=projectSubjectAssignments([meta],[multi],[]);
    expect(plan[0]!.subjectIds).toEqual(['bildung-kultur','planung-verkehr']);
    expect(projectSubjectAssignments([meta],[multi],[])).toEqual(plan);
    expect(()=>validateSubjectData([rule,{...rule,id:'conflict',subjectIds:['verwaltung']}],[])).toThrow(/konflikt/u);
    const explicit:SubjectAssignment={normId:'nsh:missing',jurisdiction:'nsh',subjectIds:['bildung-kultur'],status:'accepted',ruleId:'manual',evidence:rule.evidence,decision:'Testbeleg'};
    expect(()=>projectSubjectAssignments([meta],[],[explicit])).toThrow(/unbekannte Norm-ID/u);
    expect(()=>validateSubjectData([],[{...explicit,jurisdiction:'ost',normId:'ost:copy'}])).toThrow(/Keine dauerhaften Ost/u);
  });
});

describe('Sachgebietsfilter über beide Stores und Länder', () => {
  it('liefert identische Zuordnung, Facetten, Geltungstag, Umfang und Pagination ohne Neuprojektion', async () => {
    const records = [
      sample('nsh','bildung','gliederungsnummer-sh','223-1','gesetz',[
        {versionId:'2023-12-01',simulationValidFrom:'2023-12-01',simulationValidTo:'2026-02-28',body:[paragraph('§ 1','Alt','Altertext')]},
        {versionId:'2026-03-01',simulationValidFrom:'2026-03-01',body:[paragraph('§ 1','Neu','Neuertext')]},
      ]),
      sample('nsh','bildung-vv','gliederungsnummer-sh','2230.1','verwaltungsvorschrift'),
      sample('nsh','unassigned','gliederungsnummer-sh','B 223-1'),
      sample('baywue','bildung','bayrs','2210-1-K'),
      sample('west','unassigned','recht-nrw','223-1'),
    ];
    const stores = {} as Record<JurisdictionId,ReturnType<typeof createD1NormStore>>;
    for(const jurisdiction of ['west','nsh','baywue'] as const) {
      const own=records.filter((r)=>r.meta.jurisdiction===jurisdiction);
      const db=await openSqliteD1(':memory:',{migrationsDir:join(process.cwd(),'data/d1')});databases.push(db);
      executePlan(db,buildProjectionPlan(own,{jurisdiction,full:true,now:'2026-09-28T00:00:00.000Z'}));
      const d1=createD1NormStore(db,jurisdiction);stores[jurisdiction]=d1;
      const files=createFileNormStore(jurisdiction,own);
      expect(await d1.countSubjectGroups!()).toEqual(await files.countSubjectGroups!());
      expect(await d1.countNormFacets({subject:'bildung-kultur'})).toEqual(await files.countNormFacets({subject:'bildung-kultur'}));
      expect((await d1.listNormSummaries({subject:'bildung-kultur'})).map((r)=>r.slug)).toEqual((await files.listNormSummaries({subject:'bildung-kultur'})).map((r)=>r.slug));
      for(const params of ['subject=bildung-kultur','subject=bildung-kultur&bereich=alle','subject=bildung-kultur&stand=changed','subject=bildung-kultur&stand=new','subject=bildung-kultur&versionScope=all','subject=bildung-kultur&validOn=2025-01-01','subject=bildung-kultur&q=Altertext&validOn=2025-01-01']) {
        const state=parsePublicSearchState(new URLSearchParams(params));
        expect((await d1.search(state)).hits.map((h)=>[h.slug,h.versionId]),params).toEqual((await files.search(state)).hits.map((h)=>[h.slug,h.versionId]));
      }
    }
    expect((await stores.nsh.search(parsePublicSearchState(new URLSearchParams('subject=bildung-kultur')))).total).toBe(1);
    expect((await stores.nsh.search(parsePublicSearchState(new URLSearchParams('subject=bildung-kultur&bereich=alle')))).total).toBe(2);
    const registry=createStoreRegistry(stores);
    expect((await subjectCoverage(registry,['nsh'])).map((entry)=>entry.jurisdiction)).toEqual(['nsh']);
    const listing=await subjectListing(registry,'bildung-kultur',{page:1});
    expect(listing.facets.total).toBe(3);
    expect(listing.facets.byLetter.reduce((n,r)=>n+r.count,0)).toBe(3);
    expect((await subjectListing(registry,'bildung-kultur',{page:99},'nsh')).state.page).toBe(1);
    expect((await subjectListing(registry,'bildung-kultur',{page:1,changeKind:'baseline-changed'},'nsh')).norms.map((n)=>n.slug)).toEqual(['bildung']);
  });

  it('zählt Ost dynamisch aus der lokalen Read-only-Fixture, einschließlich Mehrfachzuordnungen', async () => {
    const fixture=await openOstRechtFixture();databases.push(fixture.native);
    const before=await fixture.store.countSubjectGroups!();
    const rule=SUBJECT_RULES.find((r)=>r.id==='ost-71')!;
    const meta=fixture.native.native.prepare('SELECT id,subjects_json FROM law_norms LIMIT 1').get() as {id:string;subjects_json:string};
    fixture.native.native.prepare('UPDATE law_norms SET subjects_json=? WHERE id=?').run(JSON.stringify([rule.match.exact,'Verfassungsrecht','Unbekannt']),meta.id);
    const after=await fixture.store.countSubjectGroups!();
    expect(after.total).toBe(before.total);
    expect(after.groups.find((g)=>g.id==='bildung-kultur')!.count).toBeGreaterThanOrEqual(1);
    expect(after.groups.find((g)=>g.id==='staat-verfassung')!.count).toBeGreaterThanOrEqual(1);
    expect(after.assigned+after.unassigned).toBe(after.total);
    expect((await fixture.store.listNormSummaries({subject:'bildung-kultur'})).some((n)=>n.slug===meta.id)).toBe(true);
    expect((await fixture.store.countNormFacets({subject:'bildung-kultur'})).total).toBe(after.groups.find((g)=>g.id==='bildung-kultur')!.count);
  });
});

it('paginiert echte Sachgebietslisten und erhält Land, Buchstaben und Facetten', async () => {
  const records=Array.from({length:62},(_,i)=>{
    const record=sample('nsh',`bildung-${String(i).padStart(3,'0')}`,'gliederungsnummer-sh','223-1');
    return {...record,meta:{...record.meta,title:`Bildungsregel ${String(i).padStart(3,'0')}`,shortTitle:`Bildungsregel ${String(i).padStart(3,'0')}`}};
  });
  const db=await openSqliteD1(':memory:',{migrationsDir:join(process.cwd(),'data/d1')});databases.push(db);
  executePlan(db,buildProjectionPlan(records,{jurisdiction:'nsh',full:true,now:'2026-09-28T00:00:00.000Z'}));
  for(const store of [createD1NormStore(db,'nsh'),createFileNormStore('nsh',records)]) {
    const registry=createStoreRegistry({nsh:store});
    const first=await subjectListing(registry,'bildung-kultur',{page:1,letter:'B'},'nsh');
    const second=await subjectListing(registry,'bildung-kultur',{page:2,letter:'B'},'nsh');
    expect(first.facets.total).toBe(62);
    expect(first.norms).toHaveLength(50);expect(second.norms).toHaveLength(12);
    expect(second.norms[0]!.slug).toBe('bildung-050');
    expect(second.facets.byLetter).toEqual([{letter:'B',count:62}]);
    expect(new Set([...first.norms,...second.norms].map((r)=>r.slug)).size).toBe(62);
  }
});

it('erhält ältere Sachgebietstitel mit Kommas und mehrfach gewählte Filter verlustfrei', () => {
  const title='Forstwirtschaft, Jagd, Fischerei, Naturschutz';
  const path=getSearchUrl({subject:[title,'bildung-kultur']});
  expect(parsePublicSearchState(new URL(path,'http://localhost').searchParams).subjects).toEqual([title,'bildung-kultur']);
  expect(parsePublicSearchState(new URLSearchParams('subject=bildung-kultur,soziales')).subjects).toEqual(['bildung-kultur','soziales']);
});
