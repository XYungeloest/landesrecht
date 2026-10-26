import { readFileSync } from 'node:fs';
import { describe,it,expect } from 'vitest';
import { buildAnchorMap, getProvisionEntries } from '@landesrecht/legal-core/lib/body.ts';
import { sentenceStarts, buildSentencePlan } from '@landesrecht/legal-core/lib/sentences.ts';
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
const paragraph=(children:NormBodyBlock[]):NormBodyBlock=>({type:'paragraph',label:'§ 8',children});
const abs=(text:string,children:NormBodyBlock[]=[]):NormBodyBlock=>({type:'subparagraph',label:'(1)',text,children});
describe('Konservative deutsche Satz-Lesehilfe',()=>{
  it('erkennt einen und drei Sätze, aber keine Semikolon-Grenze',()=>{
    expect(sentenceStarts('Die Behörde entscheidet.')).toEqual([0]);
    const text='Die Behörde entscheidet. Sie prüft; danach handelt sie. Das Verfahren endet.';
    expect(sentenceStarts(text)).toEqual([0,text.indexOf('Sie'),text.indexOf('Das')]);
  });
  it('beachtet Rechtsverweise, Abkürzungen, Datumsangaben, Dezimalwerte und Klammern',()=>{
    const examples=[
      'Nach Art. 5 Abs. 2 Nr. 1 S. 3 GG gilt dies. Die Behörde prüft.',
      'Dies gilt z. B. für Wasser und u. a. für Luft. Danach wird geprüft.',
      'Am 1. Januar 2023 gilt ein Wert von 2.5. Die Behörde prüft.',
      'Die Behörde (Art. 5 Abs. 2 GG) entscheidet. Sie handelt ggf. unverzüglich.',
      'Dr. Müller handelt bzw. entscheidet. Die Behörde prüft.',
      'Am 1. Jan. 2023 handelt sie. Danach wird geprüft.',
      'Am 1. 1. 2023 handelt sie. Danach wird geprüft.',
    ];
    for(const text of examples)expect(sentenceStarts(text),text).toHaveLength(2);
  });
  it('lässt unsichere Zitate, Quell-Satznummern, Listen und uneindeutige Abkürzungsenden aus',()=>{
    for(const text of ['¹Die Behörde entscheidet. ²Sie prüft.','1 Die Behörde entscheidet. 2 Sie prüft.','Die Behörde sagt „Ja.“ Sie handelt.','Die Behörde sagt ‚Ja.‘ Sie prüft. Sie handelt.','1. Der Antrag\n2. Die Entscheidung','Es gilt usw. Danach prüft sie.','Das Verfahren (es endet. Es beginnt) läuft. Die Behörde prüft.','Der Antrag ist gestellt','Der 1. Vorsitzende entscheidet. Sie prüft.','Der e. V. Danach wird geprüft.','A. Müller entscheidet. Es gilt.','Die Regelung gilt für jede Art. Danach wird geprüft.'])expect(sentenceStarts(text),text).toBeUndefined();
  });
  it('zählt über mehrere paragraphText-Blöcke fort und beginnt pro Absatz neu',()=>{
    const body=[paragraph([abs('Erster Satz.',[{type:'paragraphText',text:'Zweiter Satz. Dritter Satz.'}]),{type:'subparagraph',label:'(2)',text:'Neuer erster Satz. Neuer zweiter Satz.'}])];
    const plan=buildSentencePlan(body,buildAnchorMap(body));
    expect(plan.get('0.0')).toEqual([{offset:0,number:1}]);
    expect(plan.get('0.0.0')?.map(start=>start.number)).toEqual([2,3]);
    expect(plan.get('0.1')?.map(start=>start.number)).toEqual([1,2]);
  });
  it('nummeriert ungeteilte Artikel und ignoriert Fußnoten als Normsätze; Listen/Tabellen/Zitate bleiben ohne Nummern',()=>{
    const body:NormBodyBlock[]=[{type:'article',label:'Art. IV',children:[{type:'paragraphText',text:'Die Behörde entscheidet. Danach prüft sie.'},{type:'footnote',label:'1',text:'Fußnote. Weiterer Hinweis.'}]}];
    expect([...buildSentencePlan(body,buildAnchorMap(body)).values()].flat().map(start=>start.number)).toEqual([1,2]);
    for(const type of ['item','table','quotedProvision'] as const){const unsafe=[paragraph([abs('Die Behörde entscheidet. Danach prüft sie.',[{type,text:'Inhalt'}])])];expect(buildSentencePlan(unsafe,buildAnchorMap(unsafe)).size).toBe(0);}
  });
  it('belässt vorhandene Satznummern der echten bayerischen Verfassungsstruktur unverändert',()=>{
    const version=JSON.parse(readFileSync('content/norms/baywue/verfassung-des-freistaates-bayern-wuerttemberg/versions/2023-12-01.json','utf8')) as {body:NormBodyBlock[]};
    const anchors=buildAnchorMap(version.body),entry=getProvisionEntries(version.body,anchors).find(e=>e.anchor==='artikel-14')!;
    expect(entry.block.children![0]!.text).toMatch(/^¹Die/u);
    expect(buildSentencePlan(version.body,anchors).has([...entry.path,0].join('.'))).toBe(false);
    expect(entry.block.children![0]!.text).toMatch(/^¹Die/u);
  });
  it('prüft die echte LNatSchG-Struktur: Aufzählung ausgelassen, normaler Absatz mit fortlaufenden Sätzen',()=>{
    const version=JSON.parse(readFileSync('content/norms/west/lnatschg-west/versions/2023-12-01.json','utf8')) as {body:NormBodyBlock[]};
    const anchors=buildAnchorMap(version.body),entry=getProvisionEntries(version.body,anchors).find(e=>e.anchor==='paragraph-42')!;
    const plan=buildSentencePlan(version.body,anchors);
    expect(plan.has([...entry.path,0].join('.'))).toBe(false);
    const starts=plan.get([...entry.path,1].join('.'))!;
    expect(starts.length).toBeGreaterThan(2);expect(starts.map(start=>start.number)).toEqual(starts.map((_,i)=>i+1));
  });
});
