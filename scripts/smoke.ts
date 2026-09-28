#!/usr/bin/env node
/**
 * Smoke-Test des ausgelieferten Portals über alle vier Länder (nur GET, keine Schreibzugriffe).
 *
 *   npm run smoke [-- --base https://landesrecht-online.de]
 *
 * Jede Prüfung nennt Pfad, erwarteten Status und – wo sinnvoll – einen Inhalt, der den tatsächlichen API-Vertrag
 * prüft (Fassungsdaten im `/versions`-Endpunkt, nicht im Norm-Endpunkt). `/health` wird beim Kaltstart bis zu dreimal
 * mit längerer Frist abgefragt: ein 503 gilt erst als Fehler, wenn es nach den Wiederholungen bleibt – ein echter
 * Ausfall wird also nie verschluckt, nur der erste Kaltstart der D1-Verbindungen abgewartet.
 */
const baseIndex = process.argv.indexOf('--base');
const base = (baseIndex >= 0 ? process.argv[baseIndex + 1] : undefined) ?? 'https://landesrecht-online.de';

type Expect = string | RegExp | ((body: string) => string | null) | null;
interface Check { path: string; status: number; expect: Expect; timeoutMs?: number }

const json = (check: (payload: any) => string | null) => (body: string): string | null => {
  try {
    return check(JSON.parse(body));
  } catch (error) {
    return `kein JSON: ${(error as Error).message}`;
  }
};
const version = (versionId: string, expected: { from?: string; kind?: string }) => json((payload) => {
  const entry = (payload.versions ?? []).find((candidate: any) => candidate.versionId === versionId);
  if (!entry) return `Fassung ${versionId} fehlt`;
  if (expected.from && entry.simulationValidFrom !== expected.from) return `Fassung ${versionId}: simulationValidFrom ${entry.simulationValidFrom} ≠ ${expected.from}`;
  if (expected.kind && entry.temporalKind !== expected.kind) return `Fassung ${versionId}: temporalKind ${entry.temporalKind} ≠ ${expected.kind}`;
  return null;
});

const checks: Check[] = [
  { path: '/', status: 200, expect: 'Simulation' },
  // West
  { path: '/west/verkuendungen/', status: 200, expect: 'GV. West', timeoutMs: 60_000 },
  { path: '/west/verkuendungen/gv-west-2024-1-20240223/', status: 200, expect: '2024' },
  { path: '/west/norm/lnatschg-west/', status: 200, expect: 'Landesnaturschutzgesetz' },
  { path: '/west/norm/lnatschg-west/historie/', status: 200, expect: '2026-05-18' },
  { path: '/west/norm/lnatschg-west/version/2023-12-01/', status: 200, expect: 'Fassung' },
  { path: '/west/norm/mietschvo-west/', status: 200, expect: 'außer Kraft' },
  { path: '/api/v1/publications/west', status: 200, expect: '"gv-west-2024-1-20240223"' },
  { path: '/api/v1/norms/west/lnatschg-west/versions', status: 200, expect: version('2023-12-01', { from: '2023-12-01', kind: 'historical' }) },
  { path: '/api/v1/norms/west/kjrg-west', status: 200, expect: json((payload) => (payload.meta?.status === 'in-force' ? null : `status ${payload.meta?.status}`)) },
  // NSH
  { path: '/nsh/verkuendungen/', status: 200, expect: 'GVBl' },
  { path: '/nsh/verkuendungen/gvobl-nsh-lah1-2025-1-20250804/', status: 200, expect: 'Gesetz zur Neuordnung der Notfallversorgung' },
  { path: '/nsh/norm/lbo-nsh/', status: 200, expect: 'Landesbauordnung' },
  { path: '/nsh/norm/lbo-nsh/version/2023-12-01/', status: 200, expect: 'Fassung' },
  { path: '/nsh/norm/pog-nsh/', status: 200, expect: 'außer Kraft' },
  { path: '/nsh/norm/gzalkhg-nsh/', status: 200, expect: 'Notfallversorgung' },
  { path: '/nsh/norm/lfswg-nsh/', status: 200, expect: 'sozialen Wohnungsbau' },
  { path: '/api/v1/norms/nsh/lfdgg-nsh/versions', status: 200, expect: version('2024-07-09', { from: '2024-07-09', kind: 'current' }) },
  { path: '/api/v1/norms/nsh/lbo-nsh/versions', status: 200, expect: version('2026-09-03', { kind: 'current' }) },
  { path: '/api/v1/norms/nsh/inklusions-und-teilhabegesetz-kita-nsh', status: 200, expect: json((payload) => (payload.meta?.status === 'future-effective' ? null : `status ${payload.meta?.status}`)) },
  // BayWü
  { path: '/bayern-wuerttemberg/verkuendungen/', status: 200, expect: 'GVBl' },
  { path: '/bayern-wuerttemberg/norm/ftg-baywue/', status: 200, expect: 'Feiertag' },
  { path: '/bayern-wuerttemberg/norm/ftg-baywue/version/2023-12-01/', status: 200, expect: 'Fassung' },
  { path: '/bayern-wuerttemberg/norm/strgvv-baywue/', status: 200, expect: 'außer Kraft' },
  { path: '/bayern-wuerttemberg/norm/staatsverfassung-2025-baywue/', status: 200, expect: 'Staatsverfassung' },
  { path: '/bayern-wuerttemberg/norm/staatsverfassung-2025-baywue/version/2025-01-12/', status: 200, expect: 'Hauptstadt ist München' },
  { path: '/bayern-wuerttemberg/norm/staatsverfassung-2025-baywue/historie/', status: 200, expect: '2026-08-29' },
  { path: '/bayern-wuerttemberg/norm/verfassung-des-freistaates-bayern-wuerttemberg/', status: 200, expect: 'außer Kraft' },
  { path: '/bayern-wuerttemberg/norm/baywuewolfv-baywue/', status: 200, expect: 'Wolfsverordnung' },
  { path: '/api/v1/norms/baywue/staatsverfassung-2025-baywue/versions', status: 200, expect: json((payload) => {
    const ids = (payload.versions ?? []).map((entry: any) => entry.versionId).join(',');
    if (ids !== '2025-01-12,2026-05-29,2026-06-26,2026-06-27,2026-08-29') return `Fassungen ${ids}`;
    return payload.currentVersionId === '2026-08-29' ? null : `currentVersionId ${payload.currentVersionId}`;
  }) },
  { path: '/api/v1/norms/baywue/verfassung-des-freistaates-bayern-wuerttemberg', status: 200, expect: json((payload) => (payload.meta?.status === 'repealed' && payload.meta?.expiryDate === '2025-01-11' ? null : `status ${payload.meta?.status}, expiryDate ${payload.meta?.expiryDate}`)) },
  // Stichtag 2026-09-28: Akte mit Wirkung 01.10.2026 bleiben künftig
  { path: '/api/v1/norms/baywue/wirtschaftsgruendungsg-baywue', status: 200, expect: json((payload) => (payload.meta?.status === 'future-effective' ? null : `status ${payload.meta?.status}`)) },
  { path: '/api/v1/norms/baywue/wirtschaftsgruendungsg-baywue/versions', status: 200, expect: version('2026-10-01', { kind: 'future' }) },
  // Ost (OstRecht-D1, nur lesend)
  { path: '/ost/', status: 200, expect: 'Freistaat Ostdeutschland' },
  { path: '/ost/?type=verordnung', status: 200, expect: 'Verordnung' },
  { path: '/ost/norm/saechsische-gemeindeordnung/', status: 200, expect: 'Gemeindeordnung' },
  { path: '/ost/norm/saechsische-gemeindeordnung/historie/', status: 200, expect: '2026-03-25' },
  { path: '/ost/norm/saechsische-gemeindeordnung/version/2023-11-01/', status: 200, expect: 'Fassung' },
  { path: '/ost/norm/saechsische-gemeindeordnung/version/2026-10-01/', status: 200, expect: 'Fassung' },
  { path: '/ost/norm/dienstanordnung-momentane-terrorgefahr-2024/', status: 200, expect: 'außer Kraft' },
  { path: '/ost/norm/oberstufenund-abiturprufungsverordnung/', status: 404, expect: null },
  { path: '/ost/verkuendungen/', status: 200, expect: 'OGVBl.' },
  { path: '/ost/verkuendungen/ogvbl-2026-79/', status: 200, expect: '2026' },
  { path: '/api/v1/norms/ost/saechsische-gemeindeordnung/versions', status: 200, expect: version('2023-11-01', { from: '2023-12-01', kind: 'historical' }) },
  { path: '/api/v1/norms/ost/ndr-staatsvertrag/versions', status: 200, expect: version('2021-09-01', { from: '2023-12-01', kind: 'historical' }) },
  { path: '/api/v1/norms/ost/gesetz-zur-einfuehrung-von-hinweisgebermeldestellen/versions', status: 200, expect: version('2026-10-01', { kind: 'future' }) },
  { path: '/api/v1/publications/ost', status: 200, expect: '"ogvbl-2026-79"' },
  { path: '/api/v1/jurisdictions', status: 200, expect: json((payload) => {
    const ost = (payload.jurisdictions ?? []).find((entry: any) => entry.id === 'ost');
    if (!ost) return 'Ost fehlt';
    if (ost.runtimeSource !== 'ostrecht-d1') return `runtimeSource ${ost.runtimeSource}`;
    if (ost.runtime?.syncState !== 'complete') return `syncState ${ost.runtime?.syncState}`;
    if (ost.search?.fullText !== 'current-version-only') return `Ost fullText ${ost.search?.fullText}`;
    const west = payload.jurisdictions.find((entry: any) => entry.id === 'west');
    return west?.search?.fullText === 'all-versions' ? null : `West fullText ${west?.search?.fullText}`;
  }) },
  // Suche, auch über Länder hinweg
  { path: '/api/v1/search?q=Landesnaturschutzgesetz&jurisdiction=west', status: 200, expect: 'lnatschg-west' },
  { path: '/api/v1/search?q=Landesbauordnung&jurisdiction=nsh', status: 200, expect: 'lbo-nsh' },
  { path: '/api/v1/search?q=Staatsverfassung&jurisdiction=baywue', status: 200, expect: 'staatsverfassung-2025-baywue' },
  { path: '/api/v1/search?q=OstGemO&jurisdiction=ost', status: 200, expect: json((payload) => (payload.hits?.[0]?.slug === 'saechsische-gemeindeordnung' ? null : `erster Treffer ${payload.hits?.[0]?.slug}`)) },
  { path: '/api/v1/search?q=%C2%A7%2090%20OstGemO&jurisdiction=ost', status: 200, expect: 'paragraph-90' },
  { path: '/api/v1/search?q=Feiertag', status: 200, expect: json((payload) => {
    const slugs = new Set((payload.hits ?? []).map((hit: any) => hit.jurisdiction));
    const coverage = (payload.coverage ?? []).find((entry: any) => entry.jurisdiction === 'ost');
    if (!coverage) return 'coverage für Ost fehlt';
    return payload.total > 0 && slugs.size >= 2 ? null : `Treffer aus ${[...slugs].join(',') || 'keinem Land'}`;
  }) },
  { path: '/suche?q=Gemeindeordnung&jurisdiction=ost&versionScope=all', status: 200, expect: 'nur für die geltende Fassung durchsuchbar' },
  { path: '/suche?q=Gemeindeordnung', status: 200, expect: 'Gemeindeordnung' },
];

async function get(path: string, timeoutMs: number): Promise<{ status: number; body: string; ms: number }> {
  const started = Date.now();
  const response = await fetch(base + path, { headers: { accept: 'text/html,application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  return { status: response.status, body: await response.text(), ms: Date.now() - started };
}

let failed = 0;
const report = (ok: boolean, line: string): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`);
};

// Health: Kaltstart abwarten (bis zu drei Versuche, längere Frist), echte Ausfälle bleiben Fehler.
{
  const attempts: string[] = [];
  let healthy = false;
  let detail = '';
  for (let attempt = 1; attempt <= 3 && !healthy; attempt += 1) {
    try {
      const result = await get('/health', 20_000);
      const payload = JSON.parse(result.body) as { status?: string; d1?: Record<string, string>; search?: Record<string, { readiness?: string }> };
      attempts.push(`${result.status}/${payload.status} ${result.ms}ms`);
      healthy = result.status === 200 && (payload.status === 'ok' || payload.status === 'degraded');
      detail = `d1 ${JSON.stringify(payload.d1)}${payload.search ? `, Suche ${JSON.stringify(Object.fromEntries(Object.entries(payload.search).map(([key, value]) => [key, value.readiness])))}` : ''}`;
      if (healthy && payload.status === 'degraded') detail += ' (degraded: Such-Readiness nicht vollständig)';
    } catch (error) {
      attempts.push(`Fehler ${(error as Error).message}`);
    }
    if (!healthy && attempt < 3) await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  report(healthy, `/health [${attempts.join(' → ')}] ${detail}`);
}

for (const check of checks) {
  try {
    const result = await get(check.path, check.timeoutMs ?? 20_000);
    let problem: string | null = result.status === check.status ? null : `Status ${result.status} statt ${check.status}`;
    if (!problem && check.expect !== null) {
      if (typeof check.expect === 'string') problem = result.body.includes(check.expect) ? null : `fehlt: ${check.expect}`;
      else if (check.expect instanceof RegExp) problem = check.expect.test(result.body) ? null : `fehlt: ${check.expect}`;
      else problem = check.expect(result.body);
    }
    report(problem === null, `${result.status} ${result.ms}ms ${check.path}${problem ? `  (${problem})` : ''}`);
  } catch (error) {
    report(false, `ERR ${check.path} ${(error as Error).message}`);
  }
}
const total = checks.length + 1;
console.log(failed > 0 ? `${failed} von ${total} Prüfung(en) fehlgeschlagen` : `Alle ${total} Prüfungen bestanden`);
process.exit(failed > 0 ? 1 : 0);
