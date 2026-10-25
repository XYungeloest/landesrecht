/** Progressive Sprungauswahl: ausschließlich beim Rendern freigegebene Optionsziele. */
export function approvedProvisionTargets(options: readonly { anchor: string; url?: string }[], origin: string): Map<string,string> {
  const targets = new Map<string,string>();
  for (const option of options) {
    if (!option.anchor || targets.has(option.anchor) || !option.url?.startsWith('/') || option.url.startsWith('//')) return new Map();
    try {
      const url = new URL(option.url,origin);
      if (url.origin !== origin || url.search || url.hash) return new Map();
      targets.set(option.anchor,url.pathname);
    } catch { return new Map(); }
  }
  return targets;
}
export function initProvisionJump(form: HTMLFormElement, navigate: (url:string)=>void = (url)=>window.location.assign(url)): void {
  if (form.dataset.jumpReady) return;
  const select = form.querySelector<HTMLSelectElement>('select[name="vorschrift"]');
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const hint = form.querySelector<HTMLElement>('[data-provision-jump-hint]');
  if (!select || !button || !hint) return;
  const targets = approvedProvisionTargets([...select.options].map((option)=>({anchor:option.value,url:option.dataset.provisionUrl})),window.location.origin);
  if (!targets.size || targets.size !== select.options.length) return;
  select.addEventListener('change',()=>{
    const target = targets.get(select.value);
    if (target) navigate(target);
    else {
      button.hidden = false;
      hint.textContent = 'Bitte die Vorschrift auswählen und mit Öffnen bestätigen.';
    }
  });
  hint.textContent = 'Die Auswahl öffnet die Vorschrift sofort.';
  form.dataset.jumpReady = 'true';
  button.hidden = true;
}
