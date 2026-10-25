/** Gemeinsamer Clipboard-Pfad für vorhandene Kopieraktionen und Markierungsauswahl. */
export async function copyText(value: string, feedback: HTMLElement): Promise<void> {
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(value);
    feedback.textContent = 'Kopiert.';
  } catch {
    feedback.textContent = 'Kopieren nicht möglich. Der Text steht zum manuellen Kopieren bereit.';
    const input = document.createElement('textarea');
    input.className = 'copy-action__manual';
    input.readOnly = true;
    input.setAttribute('aria-label', 'Text zum Kopieren');
    input.value = value;
    feedback.append(input);
    input.focus();
    input.select();
  }
}
