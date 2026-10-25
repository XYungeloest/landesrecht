import { describe, expect, it } from 'vitest';
import { buildAnchorMap, getProvisionEntries } from '@landesrecht/legal-core/lib/body.ts';
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { buildProvisionNavigation, resolveProvisionSelection } from '../../apps/web/src/lib/provision-navigation.ts';
const para=(label:string,title?:string):NormBodyBlock=>({type:'paragraph',label,title,text:'Unveränderter Wortlaut'});
const body:NormBodyBlock[]=[
  {type:'part',label:'Teil 1',title:'Allgemeines',children:[para('§ 1'),para('§ 8'),para('§ 8a'),para('§ 8b'),para('§ 42','(weggefallen)')]},
  {type:'article',label:'Art. IV',children:[para('§ 8')]},
  {type:'annex',label:'Anlage 1',children:[para('§ 8')]},
  {type:'quotedProvision',children:[para('§ 9')]},
];
const anchors=buildAnchorMap(body);
const build=(anchor:string,version?:string)=>buildProvisionNavigation(body,anchors,'ost','osthsg',anchor,version);
describe('Kompakte Einzelvorschriftennavigation',()=>{
  it('benutzt tatsächliche Nachbarn einschließlich Buchstaben, Lücken und weggefallener Einheiten',()=>{
    const nav=build('paragraph-8');
    expect(nav.previous?.label).toBe('§ 1');expect(nav.next?.label).toBe('§ 8a');
    expect(build('paragraph-8a').next?.label).toBe('§ 8b');
    expect(build('paragraph-8b').next?.label).toBe('§ 42');
    expect(nav.groups.flatMap((g)=>g.items).some((item)=>item.label==='§ 9')).toBe(false);
    expect(build('paragraph-1').previous).toBeUndefined();
    expect(build('anlage-1-paragraph-8').next).toBeUndefined();
  });
  it('erhält historische URLs für beide Nachbarn und jedes Auswahlziel',()=>{
    const nav=build('paragraph-8','2025-01-01');
    for(const item of [nav.previous!,nav.next!,...nav.groups.flatMap((g)=>g.items)]) {
      expect(item.url).toContain('/version/2025-01-01/');
      expect(item.url).not.toMatch(/mark=|vorschrift=/u);
    }
    expect(nav.next!.url).toBe('/ost/norm/osthsg/version/2025-01-01/paragraph-8a/');
  });
  it('unterscheidet römische Artikel, Anlagenzählung und umgebende Gliederungen',()=>{
    expect(build('artikel-iv').next?.anchor).toBe('artikel-iv-paragraph-8');
    const nav=build('paragraph-8');
    expect(nav.groups.map((group)=>group.label)).toEqual(['Teil 1 Allgemeines','','Art. IV','Anlage 1']);
    expect(nav.groups.flatMap((group)=>group.items).filter((item)=>item.label==='§ 8').map((item)=>item.url)).toEqual(['/ost/norm/osthsg/paragraph-8/','/ost/norm/osthsg/artikel-iv-paragraph-8/','/ost/norm/osthsg/anlage-1-paragraph-8/']);
  });
  it('löst die native GET-Auswahl nur gegen vorhandene Einheiten der Fassung auf',()=>{
    const entries=getProvisionEntries(body,anchors);
    expect(resolveProvisionSelection(new URLSearchParams('vorschrift=paragraph-42&mark=paragraph-8'),entries)?.anchor).toBe('paragraph-42');
    for(const value of ['paragraph-9','https://example.org/','zitat-paragraph-9','x'.repeat(513),'']) expect(resolveProvisionSelection(new URLSearchParams({vorschrift:value}),entries)).toBeUndefined();
    expect(resolveProvisionSelection(new URLSearchParams('vorschrift=paragraph-1&vorschrift=paragraph-8'),entries)).toBeUndefined();
    expect(()=>build('paragraph-404')).toThrow();
  });
  it('bildet große Gesetze mit genau einer Auswahloption je vorhandener Einheit ab',()=>{
    const blocks=Array.from({length:1500},(_,i)=>para(`§ ${i+1}`));
    const nav=buildProvisionNavigation(blocks,buildAnchorMap(blocks),'west','lang','paragraph-1000','2023-12-01');
    expect(nav.groups.flatMap((group)=>group.items)).toHaveLength(1500);
    expect(nav.previous?.label).toBe('§ 999');expect(nav.next?.label).toBe('§ 1001');
  });
});
