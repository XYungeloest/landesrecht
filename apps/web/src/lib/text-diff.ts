/** Display-only word diff. Every character survives; large units use a bounded prefix/suffix fallback. */
export interface DiffPart { text: string; changed: boolean }
export function textDiff(before: string, after: string): { before: DiffPart[]; after: DiffPart[] } {
  const a = before.match(/\s+|[^\s]+/gu) ?? [];
  const b = after.match(/\s+|[^\s]+/gu) ?? [];
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const left = a.slice(start, a.length - end);
  const right = b.slice(start, b.length - end);
  const result: { before: DiffPart[]; after: DiffPart[] } = { before: [], after: [] };
  const add = (parts: DiffPart[], text: string, changed: boolean) => {
    if (!text) return;
    if (parts.at(-1)?.changed === changed) parts.at(-1)!.text += text;
    else parts.push({ text, changed });
  };
  for (const parts of [result.before, result.after]) add(parts, a.slice(0, start).join(''), false);
  if (left.length * right.length > 250_000) {
    add(result.before, left.join(''), true);
    add(result.after, right.join(''), true);
  } else {
    const width = right.length + 1;
    const lengths = new Uint32Array((left.length + 1) * width);
    for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) {
      lengths[i * width + j] = left[i] === right[j] ? 1 + lengths[(i + 1) * width + j + 1]! : Math.max(lengths[(i + 1) * width + j]!, lengths[i * width + j + 1]!);
    }
    let i = 0;
    let j = 0;
    while (i < left.length || j < right.length) {
      if (i < left.length && j < right.length && left[i] === right[j]) {
        add(result.before, left[i]!, false); add(result.after, right[j]!, false); i++; j++;
      } else if (i < left.length && (j === right.length || lengths[(i + 1) * width + j]! >= lengths[i * width + j + 1]!)) {
        add(result.before, left[i++]!, true);
      } else add(result.after, right[j++]!, true);
    }
  }
  for (const parts of [result.before, result.after]) add(parts, end ? a.slice(a.length - end).join('') : '', false);
  return result;
}
