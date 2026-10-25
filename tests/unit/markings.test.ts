import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildAnchorMap, collectBlockText } from '@landesrecht/legal-core/lib/body.ts';
import { getMarkedUrl } from '@landesrecht/legal-core/lib/routes.ts';
import { getMarkingTargets, parseMarkings, formatMarkedCitation, MAX_MARKINGS } from '@landesrecht/legal-core/lib/markings.ts';
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { openOstRechtFixture } from '../helpers/ostrecht-fixture.ts';
import { copyText } from '../../apps/web/src/lib/copy.ts';

const abs = (label:string,text='Wortlaut'):NormBodyBlock=>({type:'subparagraph',label,text});
const paragraph = (label:string):NormBodyBlock=>({type:'paragraph',label,children:[abs('(1)'),abs('(2)'),abs('(3)')]});
const body:NormBodyBlock[]=[paragraph('§ 8'),paragraph('§ 8a'),{type:'article',label:'Artikel IV',children:[abs('(2)')]}, {type:'quotedProvision',children:[paragraph('§ 8')]}, {type:'annex',label:'Anlage 1',children:[paragraph('§ 8')]}];
const targets=getMarkingTargets(body,buildAnchorMap(body));
afterEach(()=>vi.unstubAllGlobals());
describe('Strukturgebundene Markierungen',()=>{
  it('zitiert einen Absatz, mehrere Absätze und verschiedene Paragraphen mit wiederholten Absatznummern',()=>{
    expect(formatMarkedCitation(targets,['paragraph-8-abs-2'],'OstHSG')).toBe('§ 8 Abs. 2 OstHSG');
    expect(formatMarkedCitation(targets,['paragraph-8-abs-3','paragraph-8-abs-1'],'OstHSG')).toBe('§ 8 Abs. 1 und 3 OstHSG');
    expect(formatMarkedCitation(targets,['paragraph-8a-abs-1','paragraph-8-abs-1'],'OstHSG')).toBe('§ 8 Abs. 1 OstHSG; § 8a Abs. 1 OstHSG');
    expect(formatMarkedCitation(targets,['paragraph-8-abs-1','paragraph-8-abs-2','paragraph-8-abs-3'],'OstHSG')).toBe('§ 8 Abs. 1, 2 und 3 OstHSG');
  });
  it('unterscheidet Artikel, Anlagen und ganze Vorschriften; Gesamtmarkierung umfasst ihre Absätze',()=>{
    expect(formatMarkedCitation(targets,['artikel-iv-abs-2'],'Amtlicher Kurztitel')).toBe('Art. IV Abs. 2 Amtlicher Kurztitel');
    expect(formatMarkedCitation(targets,['anlage-1-paragraph-8-abs-1'],'Titel')).toBe('Anlage 1, § 8 Abs. 1 Titel');
    expect(formatMarkedCitation(targets,['paragraph-8','paragraph-8-abs-1'],'Titel')).toBe('§ 8 Titel');
    expect(targets.some((target)=>target.id.startsWith('zitat'))).toBe(false);
    expect(new Set(targets.map((target)=>target.id)).size).toBe(targets.length);
  });
  it('kennzeichnet historische Portal-Fassungen ausdrücklich',()=>{
    expect(formatMarkedCitation(targets,['paragraph-8-abs-2'],'OstHSG','Portal-Fassung: Gültig vom 01.12.2023 bis 01.03.2025')).toBe('§ 8 Abs. 2 OstHSG (Portal-Fassung: Gültig vom 01.12.2023 bis 01.03.2025)');
  });
  it('ignoriert unbekannte, fehlende und manipulierte Ziele; begrenzt Eingabe und Zahl',()=>{
    expect(parseMarkings(new URLSearchParams('mark=paragraph-8-abs-2,unknown&mark=%3Cscript%3E&mark=paragraph-8-abs-2'),targets)).toEqual(['paragraph-8-abs-2']);
    expect(parseMarkings(new URLSearchParams({mark:'x'.repeat(8193)}),targets)).toEqual([]);
    expect(parseMarkings(new URLSearchParams({mark:'paragraph-8-abs-2'}),targets.filter((target)=>!target.subsection))).toEqual([]);
    const many=Array.from({length:80},(_,i)=>({...targets[0]!,id:`paragraph-${i}`}));
    expect(parseMarkings(new URLSearchParams({mark:many.map((target)=>target.id).join(',')}),many)).toHaveLength(MAX_MARKINGS);
    const url=new URL(getMarkedUrl('https://example.test/ost/norm/hsg/version/2023-12-01/paragraph-8/?mark=unknown',['paragraph-8-abs-2']));
    expect(url.pathname).toBe('/ost/norm/hsg/version/2023-12-01/paragraph-8/');
    expect(parseMarkings(url.searchParams,targets)).toEqual(['paragraph-8-abs-2']);
    expect(url.hash).toBe('#paragraph-8-abs-2');
    expect(new URL(getMarkedUrl(url.href,[])).searchParams.has('mark')).toBe(false);
  });
  it('erfindet keine Absätze bei fehlender Struktur, mehrfachen oder verschachtelten Nummern',()=>{
    const blocks:NormBodyBlock[]=[{type:'paragraph',label:'§ 1',children:[abs('(1)'),abs('(1)'),{type:'paragraphText',text:'(2) unstrukturierter Text'},{type:'item',label:'1.',children:[abs('(3)')]}]}, {type:'paragraph',label:'§§ 2 bis 5',text:'Text'}];
    const before=JSON.stringify(blocks),text=blocks.flatMap((block)=>collectBlockText(block,true));
    expect(getMarkingTargets(blocks,buildAnchorMap(blocks)).map((target)=>target.id)).toEqual(['paragraph-1']);
    expect(getMarkingTargets([paragraph('§ 1'),paragraph('§ 1')],buildAnchorMap([paragraph('§ 1'),paragraph('§ 1')]))).toEqual([]);
    expect(JSON.stringify(blocks)).toBe(before);
    expect(blocks.flatMap((block)=>collectBlockText(block,true))).toEqual(text);
  });
  it('funktioniert unabhängig vom Land mit bestehenden Paragraphen- und Artikelankern',()=>{
    for(const land of ['west','nsh','baywue','ost']) {
      const ids=parseMarkings(new URLSearchParams('mark=paragraph-8-abs-2'),targets);
      const url=getMarkedUrl(`https://example.test/${land}/norm/beispiel/`,ids);
      expect(new URL(url).searchParams.get('mark')).toBe('paragraph-8-abs-2');
    }
  });
  it('adressiert auch die vorhandene Ost-Fixture hinter dem Read-only-Vertrag',async()=>{
    const fixture=await openOstRechtFixture();
    try {
      const record=await fixture.store.getNorm('aend-ostgemo-4399','all');
      const version=record!.versions[0]!;
      const entries=getMarkingTargets(version.body,buildAnchorMap(version.body));
      expect(entries.length).toBeGreaterThan(0);
      expect(formatMarkedCitation(entries,[entries[0]!.id],record!.meta.abbr || record!.meta.title)).not.toBe('');
    } finally {fixture.native.close();}
  });
  it('verwendet den gemeinsamen Clipboard-Pfad und meldet Erfolg',async()=>{
    const writeText=vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator',{clipboard:{writeText}});
    const feedback={textContent:''} as HTMLElement;
    await copyText('§ 8 Abs. 2 OstHSG',feedback);
    expect(writeText).toHaveBeenCalledWith('§ 8 Abs. 2 OstHSG');
    expect(feedback.textContent).toBe('Kopiert.');
  });
});

it('stellt bei verweigerter Zwischenablage manuelles Kopieren bereit',async()=>{
  const field={className:'',readOnly:false,value:'',setAttribute:vi.fn(),focus:vi.fn(),select:vi.fn()};
  vi.stubGlobal('navigator',{clipboard:{writeText:vi.fn().mockRejectedValue(new Error('denied'))}});
  vi.stubGlobal('document',{createElement:vi.fn().mockReturnValue(field)});
  const feedback={textContent:'',append:vi.fn()} as unknown as HTMLElement;
  await copyText('Art. 5 Abs. 1 Vollständiger Titel',feedback);
  expect(field.value).toBe('Art. 5 Abs. 1 Vollständiger Titel');
  expect(field.readOnly).toBe(true);expect(field.focus).toHaveBeenCalled();expect(field.select).toHaveBeenCalled();
  expect(feedback.textContent).toContain('manuellen Kopieren');
});
