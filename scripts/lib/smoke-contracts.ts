/** Semantic production checks: links and selected versions, independent of editorial button labels. */
import { WORKER_D1_BINDINGS } from '@landesrecht/runtime/bindings.ts';
import { byTag, hasClass, parseHtml, queryAll } from './html-audit.ts';

export function changedNormProblem(body: string, urls: { compare: string; baseline: string; history: string }): string | null {
  const document = parseHtml(body);
  const banner = queryAll(document, (element) => hasClass(element, 'sim-banner--changed'))[0];
  if (!banner) return 'Simulationshinweis fehlt';
  const links = byTag(banner, 'a').map((link) => link.attrs.href);
  return Object.values(urls).every((url) => links.includes(url)) ? null : 'Vergleich, Ausgangsfassung oder Historie im Hinweis fehlt';
}

export function comparisonProblem(body: string, from: string, to: string): string | null {
  const document = parseHtml(body);
  for (const [name, expected] of [['von', from], ['bis', to]]) {
    const select = byTag(document, 'select').find((element) => element.attrs.name === name);
    if (!select || !byTag(select, 'option').some((option) => option.attrs.value === expected && Object.hasOwn(option.attrs, 'selected'))) return `Vergleichsauswahl ${name} ist nicht ${expected}`;
  }
  if (!queryAll(document, (element) => hasClass(element, 'comparison-direction')).length) return 'Vergleichsrichtung fehlt';
  return byTag(document, 'del', 'ins').length ? null : 'Geänderte Wörter sind nicht ausgezeichnet';
}

export function productionHealthProblem(payload: { mode?: string; d1?: Record<string, string> }): string | null {
  if (payload.mode !== undefined) return `Entwicklungsmodus ${payload.mode}`;
  const missing = WORKER_D1_BINDINGS.filter(({ binding }) => payload.d1?.[binding] !== 'ok').map(({ binding }) => binding);
  return missing.length ? `Pflicht-Bindings nicht bereit: ${missing.join(', ')}` : null;
}
