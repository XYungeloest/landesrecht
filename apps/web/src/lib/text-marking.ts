import { decodeTextMarks, encodeTextMarks, TEXTMARK_LIMITS, type TextMark, type TextMarkBinding } from '@landesrecht/legal-core/lib/textmarks.ts';
import { formatMarkedCitation, type MarkingTarget } from '@landesrecht/legal-core/lib/markings.ts';
import { buildLegalTextIndex, selectionParts, bindParts, indexedRange, textOfParts, validateTextMarks, type DraftPart } from './legal-text-index.ts';
import { initializeSentenceNumbers } from './sentence-numbers.ts';
import { copyText } from './copy.ts';
interface HighlightAPI { set(name:string,value:unknown):void; delete(name:string):boolean }
interface HighlightWindow { Highlight?:new(...ranges:Range[])=>unknown; CSS?:{highlights?:HighlightAPI} }
export function supportsTextHighlights(view:unknown):boolean {const api=view as HighlightWindow;return typeof api.Highlight==='function'&&typeof api.CSS?.highlights?.set==='function';}
export interface TextMarkController { count:()=>number; parameter:()=>string|undefined; clear:()=>void; restore:()=>Promise<void> }
export function initTextMarking(root:HTMLElement,toolbar:HTMLElement,targets:readonly MarkingTarget[],changed:()=>void,notify:(message:string)=>void):TextMarkController {
  const document=root.querySelector<HTMLElement>('.norm-document')!;
  initializeSentenceNumbers(document,root);
  const index=buildLegalTextIndex(document);
  const binding:TextMarkBinding={norm:toolbar.dataset.normId!,version:toolbar.dataset.versionId!};
  const view=document.ownerDocument.defaultView!;
  const supported=supportsTextHighlights(view);
  const api=view as unknown as HighlightWindow;
  const highlights=api.CSS?.highlights;
  const menu=root.querySelector<HTMLElement>('[data-text-selection]')!;
  const markButton=menu.querySelector<HTMLButtonElement>('[data-text-marker]')!;
  const copyButton=menu.querySelector<HTMLButtonElement>('[data-selection-copy]')!;
  const menuFeedback=menu.querySelector<HTMLElement>('[data-selection-feedback]')!;
  const list=toolbar.querySelector<HTMLElement>('[data-text-mark-list]')!;
  const notice=root.querySelector<HTMLElement>('[data-textmark-notice]')!;
  let marks:TextMark[]=[],pending:DraftPart[]|undefined,pendingRange:Range|undefined,generation=0,restoring=false,menuPointer=false;
  const highlightName='landesrecht-textmark';
  markButton.disabled=!supported;
  if(!supported)menu.querySelector<HTMLElement>('[data-highlight-fallback]')!.hidden=false;
  function citation(parts:readonly DraftPart[]):string {
    const refs=parts.map(part=>index.find(region=>region.key===part.key)?.reference);
    const note=toolbar.dataset.versionNote;
    const reliable=refs.every(ref=>ref&&targets.some(target=>target.id===ref));
    const precise=reliable?formatMarkedCitation(targets,[...new Set(refs as string[])],toolbar.dataset.normName!,note):'';
    return precise||`${toolbar.dataset.normName}${note?` (${note})`:''}`;
  }
  function paint() {
    if(!supported)return;
    const ranges=marks.flatMap(mark=>mark.map(part=>indexedRange(index.find(region=>region.key===part.key)!,part.start,part.end)!));
    if(ranges.length)highlights!.set(highlightName,new api.Highlight!(...ranges));else highlights!.delete(highlightName);
    for(const region of index)for(const marker of region.element.querySelectorAll<HTMLElement>('[data-sentence-marker]')) {
      const offset=Number(marker.dataset.offset);
      marker.classList.toggle('within-textmark',marks.some(mark=>mark.some(part=>part.key===region.key&&part.start<=offset&&part.end>offset)));
    }
  }
  function focusPassage(part:DraftPart|undefined) {const element=index.find(region=>region.key===part?.key)?.element;if(!element)return;if(!element.matches('a[href],button,input,select,textarea,[tabindex]'))element.setAttribute('tabindex','-1');element.focus({preventScroll:true});}
  function render() {
    list.replaceChildren();
    marks.forEach((mark,position)=>{
      const row=document.ownerDocument.createElement('div');row.className='textmark-entry';
      const title=document.ownerDocument.createElement('span');title.textContent=`Textmarkierung ${position+1}: ${textOfParts(mark,index).slice(0,90)}${textOfParts(mark,index).length>90?'…':''}`;row.append(title);
      for(const [label,action] of [
        ['Text kopieren',()=>copyText(textOfParts(mark,index),toolbar.querySelector<HTMLElement>('[data-marking-feedback]')!)],
        ['Text mit Nachweis kopieren',()=>copyText(`„${textOfParts(mark,index)}“ – ${citation(mark)}`,toolbar.querySelector<HTMLElement>('[data-marking-feedback]')!)],
        ['Entfernen',()=>{marks.splice(position,1);paint();render();changed();notify('Textmarkierung entfernt.');if(!toolbar.hidden){const details=toolbar.querySelector<HTMLDetailsElement>('[data-text-mark-details]')!;if(!details.hidden)details.querySelector('summary')?.focus();else toolbar.querySelector<HTMLButtonElement>('[data-marking-copy="link"]')?.focus();}else focusPassage(mark[0]);}],
      ] as const) {const button=document.ownerDocument.createElement('button');button.type='button';button.className='button-secondary';button.textContent=label;button.setAttribute('aria-label',`${label} – Textmarkierung ${position+1}`);button.addEventListener('click',action);row.append(button);}
      list.append(row);
    });
    toolbar.querySelector<HTMLElement>('[data-text-mark-details]')!.hidden=marks.length===0;
  }
  function hide(){menu.hidden=true;pending=undefined;pendingRange=undefined;}
  function place() {
    if(!pendingRange)return;
    const rects=[...pendingRange.getClientRects()].filter(rect=>rect.bottom>0&&rect.top<view.innerHeight);
    const rect=rects.at(-1);if(!rect){menu.hidden=true;return;}
    menu.hidden=false;
    const width=menu.getBoundingClientRect().width;
    const height=menu.getBoundingClientRect().height;
    const headerBottom=root.querySelector('.provision-navigation--top')?.getBoundingClientRect().bottom??document.ownerDocument.querySelector('.site-header')?.getBoundingClientRect().bottom??0;
    const x=Math.min(Math.max(8,rect.left),Math.max(8,view.innerWidth-width-8));
    const gap=view.matchMedia?.('(pointer: coarse)').matches?32:8;
    const below=rect.bottom+gap;
    const y=below+height<view.innerHeight-8?below:Math.max(headerBottom+8,rect.top-height-gap);
    menu.style.left=`${x}px`;menu.style.top=`${Math.max(8,y)}px`;
  }
  function selectionChanged() {
    const selection=view.getSelection();
    const active=document.ownerDocument.activeElement;
    if(active?.matches('input,textarea,select,[contenteditable="true"]')){if(!menu.contains(active))hide();return;}
    if(!selection||selection.rangeCount!==1||selection.isCollapsed) {
      if(!menuPointer&&!menu.contains(active))hide();return;
    }
    const range=selection.getRangeAt(0);
    const parts=selectionParts(range,document,index);
    if(!parts||!textOfParts(parts,index).trim()){hide();return;}
    const first=menu.hidden;pending=parts;pendingRange=range.cloneRange();menuFeedback.replaceChildren();place();
    if(first)notify('Textauswahl verfügbar. Mit Alt+M markieren oder den ausgewählten Text kopieren.');
  }
  let queued=false;
  document.ownerDocument.addEventListener('selectionchange',()=>{if(queued)return;queued=true;view.requestAnimationFrame(()=>{queued=false;selectionChanged();});});
  view.addEventListener('scroll',()=>{if(!menu.hidden)place();},{passive:true});
  view.addEventListener('resize',()=>{if(!menu.hidden)place();});
  menu.addEventListener('pointerdown',event=>{menuPointer=true;if(event.pointerType!=='touch'&&(event.target as Element).closest('button'))event.preventDefault();});
  view.addEventListener('pointerup',()=>{view.setTimeout(()=>{menuPointer=false;},0);});
  document.ownerDocument.addEventListener('keydown',event=>{
    if(document.ownerDocument.activeElement?.matches('input,textarea,select,[contenteditable="true"]'))return;
    if(event.key==='Escape'){hide();return;}
    if(event.altKey&&!event.ctrlKey&&!event.metaKey&&(event.code==='KeyM'||event.key.toLowerCase()==='m')&&pending&&supported){event.preventDefault();void add();}
  });
  async function add() {
    if(!pending||!supported)return;
    if(restoring){notify('Textmarkierungen werden vorbereitet. Bitte erneut markieren.');return;}
    const parts=pending.map(part=>({...part}));const currentGeneration=generation;
    if(marks.length>=TEXTMARK_LIMITS.marks){notify('Höchstens 20 Textmarkierungen gleichzeitig möglich.');return;}
    try {
      const bound=await bindParts(parts,index);
      if(currentGeneration!==generation)return;
      const next=[...marks,bound];const encoded=encodeTextMarks(binding,next);
      if(!encoded||!decodeTextMarks(encoded,binding)){notify('Diese Auswahl ist zu umfangreich. Bitte eine kürzere Passage markieren.');return;}
      if(marks.some(mark=>JSON.stringify(mark)===JSON.stringify(bound))){notify('Diese Passage ist bereits markiert.');return;}
      marks=next;paint();render();changed();if(JSON.stringify(pending)===JSON.stringify(parts)){hide();view.getSelection()?.removeAllRanges();}notify('Textmarkierung hinzugefügt.');
    }catch{notify('Textmarkierungen können in diesem Browser nicht sicher gespeichert werden. Text kopieren bleibt möglich.');}
  }
  markButton.addEventListener('click',()=>void add());
  copyButton.addEventListener('click',()=>{if(pending)void copyText(textOfParts(pending,index),menuFeedback).then(place);});
  const controller:TextMarkController={
    count:()=>marks.length,
    parameter:()=>encodeTextMarks(binding,marks),
    clear:()=>{const part=marks[0]?.[0];const hadFocus=toolbar.contains(document.ownerDocument.activeElement);generation++;restoring=false;markButton.disabled=!supported;marks=[];paint();render();hide();if(hadFocus)focusPassage(part);},
    async restore(){
      const ownGeneration=++generation;const params=new URLSearchParams(view.location.search);const raw=params.get('textmark');
      marks=[];paint();render();notice.hidden=true;
      if(!raw)return;
      if(!supported){notice.textContent='Dieser Browser unterstützt freie Texthervorhebungen nicht. Textauswahl, Kopieren und Absatzmarkierungen bleiben möglich.';notice.hidden=false;return;}
      restoring=true;markButton.disabled=true;
      try {
        const decoded=params.getAll('textmark').length===1?decodeTextMarks(raw,binding):undefined;
        const valid=decoded?await validateTextMarks(decoded,index):[];
        if(ownGeneration!==generation)return;
        if(!decoded){notice.textContent='Die Textmarkierungen passen nicht zu dieser Fassung oder zur dargestellten Textstelle.';notice.hidden=false;return;}
        if(valid.length!==decoded.length){notice.textContent='Einige Textmarkierungen passen nicht zur dargestellten Textstelle und wurden ausgelassen.';notice.hidden=false;}
        marks=valid;paint();render();changed();
        if(marks.length&&!view.location.hash)index.find(region=>region.key===marks[0]![0]!.key)?.element.scrollIntoView({block:'center'});
      }catch{notice.textContent='Die Textmarkierungen konnten nicht sicher wiederhergestellt werden.';notice.hidden=false;}finally{if(ownGeneration===generation){restoring=false;markButton.disabled=!supported;}}
    },
  };
  return controller;
}
