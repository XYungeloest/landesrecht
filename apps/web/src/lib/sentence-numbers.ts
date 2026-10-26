import type { SentenceStart } from '@landesrecht/legal-core/lib/sentences.ts';
import { buildLegalTextIndex } from './legal-text-index.ts';
/** Fügt nur leere, nicht kopierbare Anzeigeelemente ein. Der Wortlaut bleibt Textknoteninhalt. */
export function initializeSentenceNumbers(document:HTMLElement,root:HTMLElement):void {
  const index=buildLegalTextIndex(document);let count=0;
  for(const region of index) {
    let starts:SentenceStart[];
    try {starts=JSON.parse(region.element.dataset.sentenceStarts??'[]') as SentenceStart[];}catch{continue;}
    if(!Array.isArray(starts)||region.element.querySelector('[data-sentence-marker]'))continue;
    const valid=starts.every(start=>Number.isSafeInteger(start.offset)&&start.offset>=0&&start.offset<region.text.length&&Number.isSafeInteger(start.number)&&start.number>0&&start.number<1000);
    if(!valid)continue;
    for(const start of [...starts].sort((a,b)=>b.offset-a.offset)) {
      const location=region.nodes.find(item=>start.offset>=item.start&&start.offset<item.end);if(!location)continue;
      const range=region.element.ownerDocument.createRange();range.setStart(location.node,start.offset-location.start);range.collapse(true);
      const marker=region.element.ownerDocument.createElement('span');marker.className='sentence-marker';marker.dataset.sentenceMarker='';marker.dataset.number=String(start.number);marker.dataset.offset=String(start.offset);marker.setAttribute('aria-hidden','true');
      range.insertNode(marker);count++;
    }
  }
  const control=root.querySelector<HTMLElement>('[data-sentence-control]');
  const toggle=root.querySelector<HTMLInputElement>('[data-sentence-toggle]');
  if(count&&control&&toggle) {
    control.hidden=false;root.dataset.sentences='on';
    toggle.addEventListener('change',()=>{root.dataset.sentences=toggle.checked?'on':'off';});
  }
}
