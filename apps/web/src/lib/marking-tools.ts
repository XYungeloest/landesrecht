import { formatMarkedCitation, MAX_MARKINGS, parseMarkings, type MarkingTarget } from '@landesrecht/legal-core/lib/markings.ts';
import { initTextMarking, type TextMarkController } from './text-marking.ts';
import { getMarkedUrl, getTextMarkedUrl } from '@landesrecht/legal-core/lib/routes.ts';
import { copyText } from './copy.ts';

export function initMarkingTools(toolbar: HTMLElement): void {
  const root = toolbar.closest<HTMLElement>('[data-marking-document]');
  if (!root || toolbar.dataset.initialized) return;
  toolbar.dataset.initialized = 'true';
  const idCounts = new Map<string, number>();
  for (const element of root.querySelectorAll<HTMLElement>('[id]')) idCounts.set(element.id,(idCounts.get(element.id) ?? 0)+1);
  // Bei unerwarteten Altstruktur-Kollisionen keine mehrdeutige DOM-Stelle markieren.
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-mark-toggle]')].filter((button)=>idCounts.get(button.dataset.markId!) === 1);
  const targets: MarkingTarget[] = buttons.map((button)=>({id:button.dataset.markId!,path:'',provisionId:button.dataset.markProvision!,provisionLabel:button.dataset.markLabel!,subsection:button.dataset.markSubsection}));
  const selected = new Set<string>();
  const feedback = toolbar.querySelector<HTMLElement>('[data-marking-feedback]')!;
  const count = toolbar.querySelector<HTMLElement>('[data-marking-count]')!;
  // Ein eigener Status außerhalb der zunächst versteckten Auswahlleiste kündigt die erste Auswahl an.
  const live = document.createElement('span');
  live.className = 'visually-hidden';
  live.setAttribute('role','status');
  live.setAttribute('aria-live','polite');
  root.append(live);
  const orderedIds = () => targets.filter((target)=>selected.has(target.id)).map((target)=>target.id);
  let textMarks:TextMarkController|undefined;
  function render(announce = true) {
    const total=selected.size+(textMarks?.count()??0);
    toolbar.hidden = total === 0;
    root!.classList.toggle('has-markings',total > 0);
    const message = `${total} ${total === 1 ? 'Markierung ausgewählt' : 'Markierungen ausgewählt'}.`;
    count.textContent = message;
    if (announce) live.textContent = message;
    for (const button of buttons) {
      const active = selected.has(button.dataset.markId!);
      const target = document.getElementById(button.dataset.markId!);
      target?.classList.toggle('is-marked',active);
      button.setAttribute('aria-pressed',String(active));
      const address = `${button.dataset.markLabel}${button.dataset.markSubsection ? ` Absatz ${button.dataset.markSubsection}` : ''}`;
      button.setAttribute('aria-label',`${address} ${active ? 'Markierung aufheben' : 'markieren'}`);
      button.title = button.getAttribute('aria-label')!;
    }
    const citationButton=toolbar.querySelector<HTMLButtonElement>('[data-marking-copy="citation"]');
    if(citationButton)citationButton.hidden=selected.size===0;
    feedback.replaceChildren();
  }
  for (const button of buttons) {
    button.hidden = false;
    button.addEventListener('click',()=>{
      const id = button.dataset.markId!;
      if (selected.has(id)) selected.delete(id);
      else if (selected.size < MAX_MARKINGS) selected.add(id);
      else { live.textContent = `Höchstens ${MAX_MARKINGS} Markierungen gleichzeitig möglich.`; return; }
      render();
    });
  }
  toolbar.querySelector('[data-marking-clear]')?.addEventListener('click',()=>{
    const first = buttons.find((button)=>selected.has(button.dataset.markId!));
    selected.clear();
    textMarks?.clear();
    render();
    first?.focus();
  });
  toolbar.querySelectorAll<HTMLButtonElement>('[data-marking-copy]').forEach((button)=>button.addEventListener('click',async()=>{
    const ids = orderedIds();
    const current=new URL(window.location.href);current.searchParams.delete('textmark');
    const text = button.dataset.markingCopy === 'link' ? (textMarks?.count() ? getTextMarkedUrl(toolbar.dataset.versionPath!,window.location.origin,ids,textMarks.parameter()) : getMarkedUrl(current.href,ids)) : formatMarkedCitation(targets,ids,toolbar.dataset.normName!,toolbar.dataset.versionNote);
    if(!text){feedback.textContent='Für Textpassagen bitte unter Textmarkierungen verwalten den Wortlaut mit Nachweis kopieren.';return;}
    await copyText(text,feedback);
  }));
  function restore(scroll: boolean) {
    selected.clear();
    for (const id of parseMarkings(new URLSearchParams(window.location.search),targets)) selected.add(id);
    render(selected.size > 0);
    // Ein ausdrücklich gewähltes Fragment hat Vorrang vor der ersten Hervorhebung.
    if (scroll && selected.size && !window.location.hash) document.getElementById(orderedIds()[0]!)?.scrollIntoView({block:'center'});
  }
  textMarks=initTextMarking(root,toolbar,targets,()=>render(),message=>{live.textContent=message;});
  restore(true);
  void textMarks.restore();
  window.addEventListener('popstate',()=>{restore(true);void textMarks?.restore();});
}
