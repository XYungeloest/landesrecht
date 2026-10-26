import { TEXTMARK_LIMITS, textDigest, type TextMark } from '@landesrecht/legal-core/lib/textmarks.ts';
export interface LegalRegion { key:string; element:HTMLElement; reference?:string; text:string; nodes:Array<{node:Text;start:number;end:number}> }
const IGNORE='button,input,select,textarea,[data-sentence-marker],.norm-unit__link,.norm-unit__head > .action-link';
export function buildLegalTextIndex(document:HTMLElement):LegalRegion[] {
  const elements=[...document.querySelectorAll<HTMLElement>('[data-legal-text]')];
  const counts=new Map<string,number>();for(const el of elements)counts.set(el.dataset.legalText!,(counts.get(el.dataset.legalText!)??0)+1);
  return elements.flatMap(element=>{
    const key=element.dataset.legalText!;if(counts.get(key)!==1||element.querySelector('[data-legal-text]'))return [];
    const nodes:LegalRegion['nodes']=[];let text='';
    const walker=element.ownerDocument.createTreeWalker(element,4);
    while(walker.nextNode()) {
      const node=walker.currentNode as Text;
      if(node.parentElement?.closest(IGNORE)||node.parentElement?.closest('[data-legal-text]')!==element)continue;
      nodes.push({node,start:text.length,end:text.length+node.length});text+=node.data;
    }
    return text.trim()?[{key,element,reference:element.dataset.legalRef,text,nodes}]:[];
  });
}
export function indexedRange(region:LegalRegion,start:number,end:number):Range|undefined {
  if(start<0||end<=start||end>region.text.length)return undefined;
  const first=region.nodes.find(item=>start>=item.start&&start<item.end);
  const last=region.nodes.find(item=>end>item.start&&end<=item.end);
  if(!first||!last)return undefined;
  const range=region.element.ownerDocument.createRange();range.setStart(first.node,start-first.start);range.setEnd(last.node,end-last.start);return range;
}
export interface DraftPart {key:string;start:number;end:number}
export function selectionParts(range:Range,document:HTMLElement,index:readonly LegalRegion[]):DraftPart[]|undefined {
  if(range.collapsed||!document.contains(range.startContainer)||!document.contains(range.endContainer))return undefined;
  const parent=(node:Node)=>node.nodeType===1?node as Element:node.parentElement;
  if(parent(range.startContainer)?.closest(IGNORE)||parent(range.endContainer)?.closest(IGNORE))return undefined;
  const startElement=parent(range.startContainer)?.closest('[data-legal-text]'),endElement=parent(range.endContainer)?.closest('[data-legal-text]');
  const first=index.findIndex(region=>region.element===startElement),last=index.findIndex(region=>region.element===endElement);
  const candidates=first>=0&&last>=first?index.slice(first,last+1):index;
  if(first>=0&&last>=first&&candidates.length>TEXTMARK_LIMITS.segments)return undefined;
  if(candidates.some(region=>!document.contains(region.element)||region.element.textContent!==region.text||region.nodes.some(item=>!region.element.contains(item.node))))return undefined;
  const walker=document.ownerDocument.createTreeWalker(range.commonAncestorContainer,4);
  const eligible=new Set(candidates.flatMap(region=>region.nodes.map(item=>item.node)));
  while(walker.nextNode()) {
    const node=walker.currentNode as Text;
    if(node.data.trim()&&!node.parentElement?.closest(IGNORE)&&range.intersectsNode(node)&&range.comparePoint(node,node.length)>=0&&range.comparePoint(node,0)<=0&&!eligible.has(node))return undefined;
  }
  const parts:DraftPart[]=[];
  for(const region of candidates) {
    let start=Infinity,end=-1;
    for(const item of region.nodes) {
      if(range.comparePoint(item.node,item.node.length)<0||range.comparePoint(item.node,0)>0)continue;
      const from=range.startContainer===item.node?range.startOffset:0;
      const to=range.endContainer===item.node?range.endOffset:item.node.length;
      if(to>from){start=Math.min(start,item.start+from);end=Math.max(end,item.start+to);}
    }
    if(end>start)parts.push({key:region.key,start,end});
  }
  if(!parts.length||parts.length>TEXTMARK_LIMITS.segments||parts.reduce((sum,part)=>sum+part.end-part.start,0)>TEXTMARK_LIMITS.characters)return undefined;
  return parts;
}
export async function bindParts(parts:readonly DraftPart[],index:readonly LegalRegion[]):Promise<TextMark> {
  return Promise.all(parts.map(async part=>({...part,hash:await textDigest(index.find(region=>region.key===part.key)!.text)})));
}
const characterBoundary=(text:string,offset:number)=>!(/[\uD800-\uDBFF]/u.test(text[offset-1]??'')&&/[\uDC00-\uDFFF]/u.test(text[offset]??''));
export async function validateTextMarks(marks:readonly TextMark[],index:readonly LegalRegion[]):Promise<TextMark[]> {
  const digests=new Map<string,Promise<string>>();
  for(const mark of marks)for(const part of mark){const region=index.find(r=>r.key===part.key);if(region&&!digests.has(part.key))digests.set(part.key,textDigest(region.text));}
  const valid:TextMark[]=[];
  for(const mark of marks) {
    let previous=-1,ok=true;
    for(const part of mark) {
      const position=index.findIndex(region=>region.key===part.key),region=index[position];
      if(!region||region.element.textContent!==region.text||!Number.isSafeInteger(part.start)||!Number.isSafeInteger(part.end)||position<=previous||!characterBoundary(region.text,part.start)||!characterBoundary(region.text,part.end)||part.start<0||part.end>region.text.length||part.end<=part.start||await digests.get(part.key)!==part.hash){ok=false;break;}
      previous=position;
    }
    if(ok)valid.push(mark);
  }
  return valid;
}
export function textOfParts(parts:readonly DraftPart[],index:readonly LegalRegion[]):string {
  return parts.map(part=>index.find(region=>region.key===part.key)!.text.slice(part.start,part.end)).join('\n');
}
