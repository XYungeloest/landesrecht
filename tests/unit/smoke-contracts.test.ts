import { describe, expect, it } from 'vitest';
import { WORKER_D1_BINDINGS } from '@landesrecht/runtime/bindings.ts';
import { changedNormProblem, comparisonProblem, productionHealthProblem } from '../../scripts/lib/smoke-contracts.ts';

describe('Produktions-Smoke-Verträge', () => {
  it('verlangt alle produktiven D1-Bindings, auch Ost', () => {
    const d1 = Object.fromEntries(WORKER_D1_BINDINGS.map(({ binding }) => [binding, 'ok']));
    expect(productionHealthProblem({ d1 })).toBeNull();
    expect(productionHealthProblem({})).not.toBeNull();
    delete d1.OSTRECHT_RECHT;
    expect(productionHealthProblem({ d1 })).toContain('OSTRECHT_RECHT');
    expect(productionHealthProblem({ mode: 'development', d1 })).not.toBeNull();
  });
  it('verlangt funktionsfähige Fassungsziele im Simulationshinweis unabhängig von Linktexten', () => {
    const urls = { compare: '/vergleich/?von=2023-12-01&bis=2026-05-18', baseline: '/version/2023-12-01/', history: '/historie/' };
    const body = `<div class="sim-banner--changed">${Object.values(urls).map((url) => `<a href="${url.replaceAll('&', '&amp;')}">Öffnen</a>`).join('')}</div>`;
    expect(changedNormProblem(body, urls)).toBeNull();
    expect(changedNormProblem(body.replace(urls.baseline, '/falsch/'), urls)).not.toBeNull();
    expect(changedNormProblem(body.replace('sim-banner--changed', 'normal'), urls)).not.toBeNull();
  });
  it('prüft tatsächlich ausgewählte Fassungen und sichtbaren Wortvergleich', () => {
    const body = '<select name="von"><option selected value="2023-12-01">Ausgangsstand</option></select><select name="bis"><option selected value="2026-05-18">Aktuell</option></select><p class="comparison-direction">→</p><del>alt</del><ins>neu</ins>';
    expect(comparisonProblem(body, '2023-12-01', '2026-05-18')).toBeNull();
    expect(comparisonProblem(body, '2023-12-01', '2025-01-01')).not.toBeNull();
    expect(comparisonProblem(body.replaceAll(' selected', ''), '2023-12-01', '2026-05-18')).not.toBeNull();
    expect(comparisonProblem(body.replace(/<(del|ins)>.*?<\/(del|ins)>/gu, ''), '2023-12-01', '2026-05-18')).not.toBeNull();
  });
});
