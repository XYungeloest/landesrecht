import { JSDOM } from 'jsdom';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { initMarkingTools } from '../../apps/web/src/lib/marking-tools.ts';
import { decodeTextMarks } from '@landesrecht/legal-core/lib/textmarks.ts';
const html=`<main data-marking-document><label hidden data-sentence-control><input data-sentence-toggle type="checkbox" checked>Satznummern</label><p data-textmark-notice hidden></p><article class="norm-document"><section id="paragraph-8"><button hidden data-mark-toggle data-mark-id="paragraph-8" data-mark-provision="paragraph-8" data-mark-label="§ 8">Markieren</button><div id="paragraph-8-abs-1"><button hidden data-mark-toggle data-mark-id="paragraph-8-abs-1" data-mark-provision="paragraph-8" data-mark-label="§ 8" data-mark-subsection="1">Markieren</button><p data-legal-text="p-0-0-text" data-legal-ref="paragraph-8-abs-1" data-sentence-starts='[{"offset":0,"number":1},{"offset":27,"number":2}]'>Die Behörde prüft den Fall. Danach entscheidet sie.</p></div></section></article><div hidden data-marking-tools data-norm-id="west:test" data-version-id="2023-12-01" data-version-path="/west/norm/test/version/2023-12-01/paragraph-8/" data-norm-name="TestG"><p data-marking-count></p><button data-marking-copy="citation">Zitat kopieren</button><button data-marking-copy="link">Link kopieren</button><button data-marking-clear>Aufheben</button><details hidden data-text-mark-details><summary>Verwalten</summary><div data-text-mark-list></div></details><span data-marking-feedback></span></div><div hidden data-text-selection><button data-text-marker>Textmarker</button><button data-selection-copy>Text kopieren</button><p hidden data-highlight-fallback>Keine API</p><span data-selection-feedback></span></div></main>`;
const windows:JSDOM[]=[];
afterEach(()=>{for(const dom of windows.splice(0))dom.window.close();vi.unstubAllGlobals();});
function fixture(supported=true,url='https://example.test/west/norm/test/paragraph-8/',reference='paragraph-8-abs-1') {
  const dom=new JSDOM(html.replace('data-legal-ref="paragraph-8-abs-1"',`data-legal-ref="${reference}"`),{url,pretendToBeVisual:true});windows.push(dom);const w=dom.window,doc=w.document;
  const registry=new Map<string,Set<Range>>();
  if(supported){Object.defineProperty(w,'CSS',{value:{highlights:registry},configurable:true});Object.defineProperty(w,'Highlight',{value:class extends Set<Range>{constructor(...ranges:Range[]){super(ranges);}},configurable:true});}
  Object.defineProperty(w.Range.prototype,'getClientRects',{value:()=>[{left:100,top:100,bottom:120,right:200,width:100,height:20}],configurable:true});
  Object.defineProperty(w.HTMLElement.prototype,'scrollIntoView',{value:vi.fn(),configurable:true});
  const writeText=vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('window',w);vi.stubGlobal('document',doc);vi.stubGlobal('navigator',{clipboard:{writeText}});
  initMarkingTools(doc.querySelector('[data-marking-tools]') as unknown as HTMLElement);
  async function select(start:number,end:number) {
    const p=doc.querySelector('[data-legal-text]')!,walker=doc.createTreeWalker(p,4),nodes:Text[]=[];while(walker.nextNode())nodes.push(walker.currentNode as unknown as Text);
    let cursor=0,from:{node:Text;offset:number}|undefined,to:typeof from;
    for(const node of nodes){if(start>=cursor&&start<cursor+node.length)from={node,offset:start-cursor};if(end>cursor&&end<=cursor+node.length)to={node,offset:end-cursor};cursor+=node.length;}
    const range=doc.createRange();range.setStart(from!.node as unknown as Node,from!.offset);range.setEnd(to!.node as unknown as Node,to!.offset);
    const selection=w.getSelection()!;selection.removeAllRanges();selection.addRange(range);doc.dispatchEvent(new w.Event('selectionchange'));
    await vi.waitFor(()=>expect((doc.querySelector('[data-text-selection]') as HTMLElement).hidden).toBe(false));
  }
  const click=(selector:string)=>(doc.querySelector(selector) as HTMLElement).click();
  return {dom,w,doc,registry,writeText,select,click};
}
describe('Gemeinsames Markierungswerkzeug mit echten DOM-Ranges',()=>{
  it('fällt bei nicht belegbarer Einzeladresse auf die Normbezeichnung mit historischem Fassungsstand zurück',async()=>{
    const f=fixture(true,undefined,'unknown');
    (f.doc.querySelector('[data-marking-tools]') as HTMLElement).dataset.versionNote='Portal-Fassung: gültig bis 2025';
    await f.select(4,11);f.click('[data-text-marker]');await vi.waitFor(()=>expect(f.registry.size).toBe(1));
    f.click('.textmark-entry button:nth-of-type(2)');
    await vi.waitFor(()=>expect(f.writeText).toHaveBeenCalledWith('„Behörde“ – TestG (Portal-Fassung: gültig bis 2025)'));
  });
  it('behält mehrere unabhängige Passagen, kopiert mit Nachweis und entfernt einzeln sowie insgesamt',async()=>{
    const f=fixture();await f.select(4,11);f.click('[data-text-marker]');
    await vi.waitFor(()=>expect(f.doc.querySelectorAll('.textmark-entry')).toHaveLength(1));
    await f.select(27,33);f.click('[data-text-marker]');
    await vi.waitFor(()=>expect(f.doc.querySelectorAll('.textmark-entry')).toHaveLength(2));
    expect([...f.registry.values()][0]!.size).toBe(2);
    f.click('.textmark-entry button:nth-of-type(2)');
    await vi.waitFor(()=>expect(f.writeText).toHaveBeenCalledWith('„Behörde“ – § 8 Abs. 1 TestG'));
    f.click('.textmark-entry button:nth-of-type(3)');expect(f.doc.querySelectorAll('.textmark-entry')).toHaveLength(1);
    f.click('[data-marking-clear]');expect(f.doc.querySelectorAll('.textmark-entry')).toHaveLength(0);expect(f.registry.size).toBe(0);
  });
  it('teilt mit einer unveränderlichen Fassungs-URL und stellt nach Reload exakt die Passagen wieder her',async()=>{
    const f=fixture();await f.select(4,11);f.click('[data-text-marker]');await vi.waitFor(()=>expect(f.registry.size).toBe(1));
    f.click('[data-marking-copy="link"]');await vi.waitFor(()=>expect(f.writeText).toHaveBeenCalled());
    const link=f.writeText.mock.calls[0]![0] as string,url=new URL(link);
    expect(url.pathname).toBe('/west/norm/test/version/2023-12-01/paragraph-8/');expect(url.search).not.toContain('Behörde');
    expect(decodeTextMarks(url.searchParams.get('textmark'),{norm:'west:test',version:'2023-12-01'})).toHaveLength(1);
    const reload=fixture(true,link);await vi.waitFor(()=>expect(reload.registry.size).toBe(1));
    expect([...reload.registry.values()][0]!.values().next().value!.toString()).toBe('Behörde');
    const invalid=fixture(true,link.replace('%222023-12-01%22','%222026-01-01%22'));
    await vi.waitFor(()=>expect((invalid.doc.querySelector('[data-textmark-notice]') as HTMLElement).hidden).toBe(false));expect(invalid.registry.size).toBe(0);
  });
  it('verbindet Struktur- und Textmarkierungen in einer Leiste, ohne Zitate zu vermischen',async()=>{
    const f=fixture();f.click('[data-mark-id="paragraph-8-abs-1"]');await f.select(4,11);f.click('[data-text-marker]');
    await vi.waitFor(()=>expect(f.doc.querySelector('[data-marking-count]')!.textContent).toContain('2 Markierungen'));
    f.click('[data-marking-copy="citation"]');await vi.waitFor(()=>expect(f.writeText).toHaveBeenCalledWith('§ 8 Abs. 1 TestG'));
    expect(f.doc.querySelector('#paragraph-8-abs-1')!.classList.contains('is-marked')).toBe(true);
  });
  it('bewahrt bei fehlender Highlight-API Auswahl, Kopieren und bestehende Absatzmarkierungen',async()=>{
    const f=fixture(false,'https://example.test/west/norm/test/paragraph-8/?mark=paragraph-8-abs-1&textmark=unknown');
    await vi.waitFor(()=>expect((f.doc.querySelector('[data-textmark-notice]') as HTMLElement).hidden).toBe(false));
    await f.select(4,11);expect((f.doc.querySelector('[data-text-marker]') as HTMLButtonElement).disabled).toBe(true);
    f.click('[data-selection-copy]');await vi.waitFor(()=>expect(f.writeText).toHaveBeenCalledWith('Behörde'));
    expect(f.doc.querySelector('#paragraph-8-abs-1')!.classList.contains('is-marked')).toBe(true);expect(f.registry.size).toBe(0);
  });
  it('markiert auch per Alt+M bei macOS-Zeichenbelegung und ignoriert Navigation oder Eingabefelder',async()=>{
    const f=fixture();await f.select(4,11);f.doc.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'µ',code:'KeyM',altKey:true,bubbles:true}));
    await vi.waitFor(()=>expect(f.registry.size).toBe(1));
    const input=f.doc.createElement('input');f.doc.body.append(input);input.focus();f.doc.dispatchEvent(new f.w.Event('selectionchange'));
    await vi.waitFor(()=>expect((f.doc.querySelector('[data-text-selection]') as HTMLElement).hidden).toBe(true));
  });
});
