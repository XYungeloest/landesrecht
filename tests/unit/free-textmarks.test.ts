import { JSDOM } from 'jsdom';
import { describe,it,expect } from 'vitest';
import { buildLegalTextIndex, selectionParts, bindParts, indexedRange, textOfParts, validateTextMarks } from '../../apps/web/src/lib/legal-text-index.ts';
import { initializeSentenceNumbers } from '../../apps/web/src/lib/sentence-numbers.ts';
import { supportsTextHighlights } from '../../apps/web/src/lib/text-marking.ts';
import { encodeTextMarks, decodeTextMarks, textDigest } from '@landesrecht/legal-core/lib/textmarks.ts';
import { getTextMarkedUrl } from '@landesrecht/legal-core/lib/routes.ts';
const binding={norm:'west:test',version:'2023-12-01'};
const html=`<main data-marking-document><label data-sentence-control hidden><input type="checkbox" data-sentence-toggle checked>Satznummern</label><article class="norm-document"><p data-legal-text="p-0-0-text" data-legal-ref="paragraph-8-abs-1">Die <strong>zuständige Behörde</strong> hat <a href="#x">gleichen Zugang</a>.<sup>5</sup> Die zuständige Behörde entscheidet.</p><div><a data-legal-text="p-0-1-label">(2)</a><button>✎</button><p data-legal-text="p-0-1-text" data-legal-ref="paragraph-8-abs-2">Sie prüft den Antrag. Danach entscheidet sie.</p></div></article><nav>Metadaten</nav></main>`;
const fixture=()=>{const dom=new JSDOM(html,{url:'https://example.test/west/norm/test/'});const root=dom.window.document.querySelector<HTMLElement>('main')!;return {dom,root,article:root.querySelector<HTMLElement>('article')!};};
describe('Freie Textkoordinaten über unveränderten DOM-Text',()=>{
  it('markiert Wörter und Halbsätze über Inline-Elemente, Links und Fußnotenverweise',async()=>{
    const {article}=fixture(),index=buildLegalTextIndex(article),region=index[0]!;
    const start=region.text.indexOf('zuständige'),end=region.text.indexOf(' Die zuständige');
    const range=indexedRange(region,start,end)!;
    expect(range.toString()).toBe('zuständige Behörde hat gleichen Zugang.5');
    const parts=selectionParts(range,article,index)!;
    expect(textOfParts(parts,index)).toBe(range.toString());
    const bound=await bindParts(parts,index);expect(await validateTextMarks([bound],index)).toEqual([bound]);
  });
  it('adressiert das zweite Vorkommen eindeutig, unabhängig von Zeilenumbrüchen',async()=>{
    const {article}=fixture(),index=buildLegalTextIndex(article),region=index[0]!;
    const start=region.text.lastIndexOf('zuständige Behörde');
    const range=indexedRange(region,start,start+'zuständige Behörde'.length)!;
    const mark=await bindParts(selectionParts(range,article,index)!,index);
    expect(mark[0]!.start).toBe(start);expect(start).toBeGreaterThan(region.text.indexOf('zuständige Behörde'));
    expect(indexedRange(region,mark[0]!.start,mark[0]!.end)!.toString()).toBe('zuständige Behörde');
    article.style.width='100px';expect(await validateTextMarks([mark],index)).toEqual([mark]);
  });
  it('bildet die ganze absatzübergreifende Auswahl als einen Vorgang ab und schließt UI-Zeichen aus',async()=>{
    const {article}=fixture(),index=buildLegalTextIndex(article),first=index[0]!,last=index.at(-1)!;
    const range=article.ownerDocument.createRange();range.setStart(first.nodes[0]!.node,4);range.setEnd(last.nodes.at(-1)!.node,20);
    const parts=selectionParts(range,article,index)!;
    expect(parts).toHaveLength(3);expect(textOfParts(parts,index)).toContain('\n(2)\n');expect(textOfParts(parts,index)).not.toContain('✎');
    expect(await validateTextMarks([await bindParts(parts,index)],index)).toHaveLength(1);
  });
  it('lehnt Cursor, Metadaten und nur teilweise abbildbare Auswahlen ab',()=>{
    const {dom,article}=fixture(),index=buildLegalTextIndex(article),range=dom.window.document.createRange();
    range.setStart(index[0]!.nodes[0]!.node,0);range.collapse(true);expect(selectionParts(range,article,index)).toBeUndefined();
    range.setEnd(dom.window.document.querySelector('nav')!.firstChild!,4);expect(selectionParts(range,article,index)).toBeUndefined();
    const unknown=dom.window.document.createElement('p');unknown.textContent='Nicht indizierter Bereich';article.append(unknown);range.setEnd(unknown.firstChild!,5);expect(selectionParts(range,article,index)).toBeUndefined();
  });
  it('teilt mehrere unabhängige Markierungen ohne Wortlaut und bindet sie an Norm/Fassung',async()=>{
    const {article}=fixture(),index=buildLegalTextIndex(article),a=await bindParts([{key:index[0]!.key,start:4,end:15}],index),b=await bindParts([{key:index[0]!.key,start:30,end:40}],index);
    const parameter=encodeTextMarks(binding,[a,b])!;expect(parameter).not.toContain('Behörde');
    expect(decodeTextMarks(parameter,binding)).toEqual([a,b]);
    expect(decodeTextMarks(parameter,{...binding,version:'2026-01-01'})).toBeUndefined();
    expect(decodeTextMarks(parameter,{...binding,norm:'ost:test'})).toBeUndefined();
    const url=new URL(getTextMarkedUrl('/west/norm/test/version/2023-12-01/paragraph-8/','https://example.test',['paragraph-8-abs-1'],parameter));
    expect(url.pathname).toContain('/version/2023-12-01/');expect(url.searchParams.get('mark')).toBe('paragraph-8-abs-1');
    expect(decodeTextMarks(url.searchParams.get('textmark'),binding)).toEqual([a,b]);
  });
  it('stellt nach Reload dieselben Ranges wieder her und verwirft geänderten Text oder unbekannte Koordinaten',async()=>{
    const f=fixture(),index=buildLegalTextIndex(f.article),mark=await bindParts([{key:index[0]!.key,start:4,end:15}],index);
    const reload=fixture(),again=buildLegalTextIndex(reload.article);
    expect(await validateTextMarks([mark],again)).toEqual([mark]);
    again[0]!.text='Veränderter Text';expect(await validateTextMarks([mark],again)).toEqual([]);
    expect(await validateTextMarks([[{...mark[0]!,key:'p-99-text'}]],index)).toEqual([]);
    expect(await validateTextMarks([[{...mark[0]!,end:99999}]],index)).toEqual([]);
    expect(decodeTextMarks('not-json',binding)).toBeUndefined();expect(decodeTextMarks('x'.repeat(12001),binding)).toBeUndefined();
    expect(decodeTextMarks('\uD800',binding)).toBeUndefined();
    expect(decodeTextMarks(JSON.stringify([1,binding.norm,binding.version,[[['p-0-0-text',-1,10,'0'.repeat(64)]]]]),binding)).toBeUndefined();
  });
  it('ändert weder Wortlaut noch Koordinaten durch leere Satznummernelemente oder Ein-/Ausblenden',async()=>{
    const {root,article}=fixture(),p=article.querySelector<HTMLElement>('[data-legal-text]')!;
    const before=p.textContent!;p.dataset.sentenceStarts=JSON.stringify([{offset:0,number:1},{offset:before.indexOf('Die zuständige'),number:2}]);
    const index=buildLegalTextIndex(article),mark=await bindParts([{key:index[0]!.key,start:4,end:before.length}],index);
    initializeSentenceNumbers(article,root);
    expect(p.textContent).toBe(before);expect(p.querySelectorAll('[data-sentence-marker]')).toHaveLength(2);
    expect([...p.querySelectorAll('[data-sentence-marker]')].every(el=>el.textContent==='')).toBe(true);
    const after=buildLegalTextIndex(article);expect(await validateTextMarks([mark],after)).toEqual([mark]);
    const range=indexedRange(after[0]!,4,before.length)!;expect(range.toString()).toBe(before.slice(4));
    root.dataset.sentences='off';expect(range.toString()).toBe(before.slice(4));
    initializeSentenceNumbers(article,root);expect(p.querySelectorAll('[data-sentence-marker]')).toHaveLength(2);
  });
  it('erkennt fehlende Highlight-Unterstützung, ohne DOM-Fallback vorzutäuschen',()=>{
    expect(supportsTextHighlights({})).toBe(false);
    expect(supportsTextHighlights({CSS:{highlights:new Map()}})).toBe(false);
    expect(supportsTextHighlights({Highlight:class{},CSS:{highlights:new Map()}})).toBe(true);
  });
  it('verwirft nachträglich veränderte DOM-Texte und Koordinaten innerhalb eines Unicode-Zeichens',async()=>{
    const {article}=fixture(),index=buildLegalTextIndex(article),mark=await bindParts([{key:index[0]!.key,start:4,end:11}],index);
    index[0]!.element.textContent='Geänderter sichtbarer Text';expect(await validateTextMarks([mark],index)).toEqual([]);
    const dom=new JSDOM('<article><p data-legal-text="p-0-text">a😀b</p></article>');
    const unicode=buildLegalTextIndex(dom.window.document.querySelector('article')!);
    const partial=await bindParts([{key:'p-0-text',start:1,end:2}],unicode);expect(await validateTextMarks([partial],unicode)).toEqual([]);dom.window.close();
  });
  it('prüft den gesamten Blocktext, nicht allein das ausgewählte Wort',async()=>{
    expect(await textDigest('a Wort b')).not.toBe(await textDigest('x Wort b'));
  });
});
