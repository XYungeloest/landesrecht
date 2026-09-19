/**
 * Markdown-Berichte des juris-SH-Adapters unter `data/audits/juris-sh/`. Reine Funktionen: gleiche Eingabe,
 * gleicher Text (keine Tageszeit; Zeitangaben stammen aus den Abrufbelegen).
 */
import { JURIS_SH_ACCESS_POLICY } from '../access/policy.ts';
import { BASELINE_DATE } from '../common/constants.ts';
import type { SourceInventory } from '../enumerate/run.ts';
import type { AddressabilityReport } from '../probe/addressability.ts';
import type { ExportDiscoveryReport } from '../probe/exports.ts';
import type { InventoryReport } from '../pipeline/bulk.ts';
import type { SampleReport } from '../pipeline/sample.ts';
import type { AuditResult } from './audit.ts';
import type { BaselineClassification, BaselineOnlyAnalysis, CoverageReport, ReadinessResult, ReconstructionQueue } from './status.ts';

const cell = (value: unknown): string => String(value ?? '').replace(/\|/gu, '\\|').replace(/\n/gu, ' ');

export function table(header: readonly string[], rows: ReadonlyArray<readonly unknown[]>): string[] {
  return [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`)];
}

const HEADER = (title: string, command: string): string[] => [`# ${title}`, '', `Erzeugt von \`${command}\`. Stichtag **${BASELINE_DATE}**. Quelle: Bürgerservice Schleswig-Holstein (juris), Simulationsland Niedersachsen-Holstein (\`nsh\`).`, ''];

export function renderSourceInventory(inventory: SourceInventory, robotsVerbatim: string): string {
  const robots = inventory.access.robots;
  const lines = [
    ...HEADER('Quelleninventar juris Schleswig-Holstein', 'node scripts/import-juris-sh.ts enumerate --write'),
    '## 1 Zugriffslage',
    '',
    `Politik: **robots.txt ${robots.policy}** – ${robots.decision.basis} vom ${robots.decision.date} (${robots.decision.document}). ${robots.decision.statement}`,
    '',
    `robots.txt: HTTP ${robots.fetch.httpStatus}, ${robots.fetch.byteLength} Bytes, SHA-256 \`${robots.fetch.sha256}\`, abgerufen ${robots.fetch.retrievedAt}. Wortlaut:`,
    '',
    '```text',
    robotsVerbatim.trimEnd(),
    '```',
    '',
    `Bewertung für den eigenen User-Agent \`${robots.userAgent}\` (Befund, keine Sperre):`,
    '',
    ...table(['Pfad', 'Ergebnis', 'Gruppe', 'Regel'], robots.verdicts.map((verdict) => [`\`${verdict.path}\``, verdict.verdict, verdict.group.join(', '), verdict.rule ?? '–'])),
    '',
    `Technisch nie abgerufen (Zugriffspolitik, Abschnitt \`forbiddenPaths\`); Mindestabstand ${inventory.access.minDelayMs} ms, keine Parallelität:`,
    '',
    ...table(['Pfad', 'Grund'], inventory.access.forbiddenPaths.map((entry) => [`\`${entry.prefix}\``, entry.reason])),
    '',
    '### Nutzungsbedingungen',
    '',
    'Die Oberfläche verlinkt Hilfe, Impressum, Datenschutzhinweis und Barrierefreiheitserklärung; eine eigene Seite „Nutzungsbedingungen“ gibt es nicht. Durchsucht wurde der sichtbare Text nach Aussagen zu automatisiertem Abruf, Text- und Data-Mining, Weiterverwendung, Urheber- und Lizenzrecht:',
    '',
    ...table(['Seite', 'HTTP', 'SHA-256', 'Treffer'], inventory.access.terms.pages.map((page) => [`[${page.label}](${page.url})`, page.httpStatus, `\`${page.sha256.slice(0, 16)}…\``, page.matches.length === 0 ? 'keine' : page.matches.map((match) => `${match.keyword}: „…${match.context}…“`).join(' · ')])),
    '',
    `Befund: Die Treffer oben sind der vollständige einschlägige Wortlaut; eine Aussage zum automatisierten Abruf, zu Text- und Data-Mining oder eine Lizenz enthalten sie ${inventory.access.terms.pages.some((page) => page.matches.some((match) => /automatisiert|Crawler|Robot|Data|Lizenz|Nutzungsbedingung/iu.test(match.keyword))) ? '**möglicherweise** (Treffer prüfen)' : '**nicht**'}. \`${inventory.access.terms.tdmrep.url}\`: HTTP ${inventory.access.terms.tdmrep.httpStatus}. Den maschinenlesbaren TDM-Vorbehalt der Oberflächenseiten (\`<meta name="tdm-reservation">\`) belegt STRUCTURE_REPORT.md. Normtexte sind amtliche Werke (§ 5 UrhG); ein Vorbehalt kann die redaktionelle Aufbereitung und die Datenbank betreffen – Befund für die rechtliche Bewertung, kein technischer Blocker.`,
    '',
    '## 2 Sitemap',
    '',
    ...table(['Quelle', 'HTTP', 'Bytes', 'SHA-256', 'Abruf'], [inventory.sitemap.index, ...inventory.sitemap.sitemaps].map((source) => [source.url, source.httpStatus, source.byteLength, `\`${source.sha256.slice(0, 16)}…\``, source.retrievedAt])),
    '',
    `Doppelte Kennungen: ${inventory.sitemap.duplicates} · Adressen ohne Dokument: ${inventory.sitemap.otherUrls.length} (${inventory.sitemap.otherUrls.join(', ')}) · Einheiten ohne Rahmendokument: ${inventory.sitemap.orphanUnits.length} · unbekannte Familien: ${inventory.sitemap.unknown.length}`,
    '',
    '## 3 Kennungsfamilien und Scope',
    '',
    'Quellidentität ist die juris-Dokumentnummer (DOKNR). Scope nach `docs/LEGAL_SCOPE.md` auf Familienebene; je Dokument (Normtyp, normativ oder informativ, landesweit) ist er ohne Dokumentinhalt nicht entscheidbar.',
    '',
    ...table(['Familie', 'Anzahl', 'Einordnung', 'Grund'], inventory.scope.map((entry) => [entry.family, entry.count, entry.scope, entry.reason])),
    '',
    `Register des Fundstellennachweises in der Sitemap: ${inventory.sitemap.registers.map((id) => `\`${id}\``).join(', ')}.`,
    '',
    '## 4 Enumeration und Fixpunkt',
    '',
    ...table(['Bereich', 'Einträge', 'Einheiten', 'Fingerabdruck', 'stabil', 'Bestätigungen', 'Abruf', 'Vorgängerabruf'], Object.entries(inventory.areas).map(([area, summary]) => [area, summary.items, summary.units ?? '–', `\`${summary.fingerprint.slice(0, 16)}…\``, summary.fixpoint.stable ? 'ja' : 'nein', summary.fixpoint.confirmations, summary.fixpoint.retrievedAt, summary.fixpoint.previousRetrievedAt ?? '–'])),
    '',
    'Fixpunktregel: gleicher fachlicher Fingerabdruck über einen **unabhängigen zweiten Abruf** der Sitemap (`enumerate --refresh --write`). Ein Wiederholungslauf aus dem Cache zählt nicht als Bestätigung und ändert die Dateien nicht.',
    '',
    '## 5 Abgleich mit einer zweiten Quelle (Stichprobe)',
    '',
    `Quelle: \`${inventory.crosscheck.source}\` (Suchmaschinen-Indexdaten der Discovery, unabhängig von der Sitemap). Sprechende Kennungen über den dokumentierten Permalink aufgelöst. ${inventory.crosscheck.samples} Kennungen: aufgelöst ${inventory.crosscheck.resolved}, in der Sitemap ${inventory.crosscheck.inSitemap}, nicht in der Sitemap ${inventory.crosscheck.notInSitemap}, unaufgelöst ${inventory.crosscheck.unresolved}, davon außerhalb des Bestands (Ortsrecht/Rechtsprechung) ${inventory.crosscheck.outOfScope}.`,
    '',
    ...table(['Stichprobe', 'Titel (Suchindex)', 'Weg', 'DOKNR', 'Familie', 'in Sitemap'], inventory.crosscheck.entries.map((entry) => [`\`${entry.sampleId}\``, (entry.title ?? '').slice(0, 70), entry.method, entry.resolvedId ? `\`${entry.resolvedId}\`` : `– ${entry.problem ?? ''}`, entry.family ?? '–', entry.inSitemap === undefined ? '–' : entry.inSitemap ? 'ja' : '**nein**'])),
    '',
    'Eine **vollständige** zweite Quelle gibt es öffentlich nicht: Die Register des Fundstellennachweises stehen zwar als Dokumente in der Sitemap, ihr Inhalt ist aber wie jeder Dokumentinhalt nur über die interne Schnittstelle abrufbar (siehe `STRUCTURE_REPORT.md`).',
    '',
    '## 6 Plausibilität gegen amtliche Register',
    '',
    ...table(['Register', 'Stand', 'Umfang', 'Sitemap'], [
      ['Systematische Übersicht GVOBl. (geltende Gesetze und Verordnungen)', inventory.registers.gvoblSystematicOverview?.asOf ?? '–', `${inventory.registers.gvoblSystematicOverview?.normsWithRegisterEvents ?? '–'} Normen mit Registerereignis`, `${inventory.areas.landesrecht.items} Rahmendokumente`],
      ['Erlassverzeichnis Amtsbl. (geltende Verwaltungsvorschriften)', inventory.registers.erlassverzeichnis?.asOf ?? '–', `${inventory.registers.erlassverzeichnis?.entries ?? '–'} Einträge mit Gl.Nr.`, `${inventory.areas.vwv.items} VwV-Dokumente`],
    ]),
    '',
    `Stichproben mit abgelaufener Geltung laut Suchindex: Landesrecht ${inventory.crosscheck.expired.landesrecht.inSitemap} von ${inventory.crosscheck.expired.landesrecht.samples} in der Sitemap, Verwaltungsvorschriften ${inventory.crosscheck.expired.vwv.inSitemap} von ${inventory.crosscheck.expired.vwv.samples}.`,
    '',
    ...sitemapScopeFindings(inventory),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

/** Einordnung der Sitemap als Stichtagsquelle – nur aus Zahlen des Inventars abgeleitet. */
function sitemapScopeFindings(inventory: SourceInventory): string[] {
  const findings: string[] = [];
  const expired = inventory.crosscheck.expired;
  if (expired.landesrecht.samples > 0 && expired.landesrecht.inSitemap === expired.landesrecht.samples) {
    findings.push('- **Landesrecht:** Auch außer Kraft getretene Normen und abgelöste Fassungen tragen eigene DOKNR (Einheiten je Fassung unter demselben Rahmendokument) und stehen in der Sitemap. Die Sitemap ist deshalb **kein Stichtagsbestand**: Welche Rahmendokumente am 2023-12-01 galten, steht nur im Dokument (Geltungszeitraum).');
  }
  if (expired.vwv.samples > 0 && expired.vwv.inSitemap < expired.vwv.samples) {
    findings.push(`- **Verwaltungsvorschriften:** ${expired.vwv.samples - expired.vwv.inSitemap} von ${expired.vwv.samples} abgelaufenen VwV der Stichprobe fehlen in der Sitemap – darunter solche, die am Stichtag noch galten. Die VwV-Liste der Sitemap bildet den heutigen Bestand ab, **nicht den Bestand von 2023**; am Stichtag geltende, inzwischen abgelaufene VwV sind aus ihr nicht enumerierbar.`);
  }
  const landesrechtRatio = inventory.registers.gvoblSystematicOverview ? inventory.areas.landesrecht.items / Math.max(1, inventory.registers.gvoblSystematicOverview.normsWithRegisterEvents) : undefined;
  if (landesrechtRatio !== undefined) findings.push(`- Größenordnung: ${inventory.areas.landesrecht.items} Rahmendokumente gegenüber ${inventory.registers.gvoblSystematicOverview!.normsWithRegisterEvents} Normen mit Registerereignis in der Systematischen Übersicht (Faktor ${landesrechtRatio.toFixed(1)}).`);
  return findings.length > 0 ? [...findings, ''] : [];
}

export function renderStructureReport(report: AddressabilityReport): string {
  const evidence = report.spa.evidence;
  const lines = [
    ...HEADER('Strukturbericht juris Schleswig-Holstein', 'node scripts/import-juris-sh.ts sample --write'),
    `Ergebnis: **${report.conclusion}**.`,
    '',
    ...report.reasoning.map((reason) => `- ${reason}`),
    '',
    '## 1 Probe der dokumentierten Adressformen',
    '',
    ...table(['Dokument', 'Form', 'HTTP', 'Bytes', 'SHA-256', 'Ergebnis', 'sichtbarer Text'], report.probes.map((probe) => [`\`${probe.documentId}\``, probe.form, probe.httpStatus ?? '–', probe.byteLength ?? '–', probe.sha256 ? `\`${probe.sha256.slice(0, 16)}…\`` : '–', probe.outcome, probe.visibleTextLength ?? '–'])),
    '',
    `Zusammenfassung: ${report.summary.total} Proben · spa-shell ${report.summary['spa-shell']} · content ${report.summary.content} · gesperrt ${report.summary.blocked} · Challenge ${report.summary.challenge} · 404 ${report.summary['not-found']} · Fehler ${report.summary.error} · unterschiedliche Antwortkörper ${report.summary.distinctBodies}.`,
    '',
    `Merkmale der Antwort: ${[...new Set(report.probes.flatMap((probe) => probe.markers ?? []))].join('; ') || '–'}. Portalversion ${report.jurisVersion ?? 'unbekannt'}; TDM-Vorbehalt ${report.tdmReservation ? 'gesetzt' : 'nicht gesetzt'}.`,
    '',
    '## 2 Woher die Oberfläche den Inhalt lädt (Beleg, nicht benutzt)',
    '',
    ...table(['Skript', 'Bytes', 'SHA-256'], [...report.spa.entryScripts, ...report.spa.bundles].map((script) => [script.url, script.byteLength, `\`${script.sha256.slice(0, 16)}…\``])),
    '',
    `- Build-Konfiguration: \`\` ${evidence.excerpt ?? '–'} \`\` → Schnittstelle \`${evidence.apiPath ?? 'unbekannt'}\`, Portalkennung \`${evidence.portalId ?? '–'}\``,
    `- Anfrageform: POST mit JSON-Körper; Kopfzeile \`JURIS-PORTALID\` ${evidence.portalIdHeader ? 'ja' : 'nein'}, \`X-CSRF-TOKEN\` ${evidence.csrfHeader ? 'ja' : 'nein'}, Sitzungscookie (\`credentials: include\`) ${evidence.credentialsInclude ? 'ja' : 'nein'}; Dokumentinhalt als \`format: xsl\` über diese Schnittstelle ${evidence.documentViaApi ? 'ja' : 'nein'}`,
    '',
    `Diese Schnittstelle ist nicht dokumentiert (in keiner Hilfeseite, keiner Adressform des Dossiers) und sitzungsgebunden. Nach der Zugriffspolitik (${JURIS_SH_ACCESS_POLICY.decision.document}) wird sie **nicht** benutzt; der Fetcher des Adapters verweigert \`/jportal/wsrest/…\` und \`/api/…\` technisch.`,
    '',
    '## 3 Vollkorpus-Strukturinventur',
    '',
    report.conclusion === 'content-addressable'
      ? 'Inhalt ist adressierbar – die Strukturinventur des Vollkorpus steht als nächster Schritt an.'
      : '**Nicht durchführbar.** Ohne abrufbaren Normtext gibt es keine Rohquelle, keinen Parserlauf, keine Strukturcluster und keine Textintegritätsprüfung (exact/normalisiert/erklärt/review/mismatch: jeweils 0 von 0). Parser-ready: **nein**. Es werden keine Fixtures aus Ersatzquellen gebaut.',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

export function renderCoverage(coverage: CoverageReport): string {
  const lines = [
    ...HEADER('Coverage juris Schleswig-Holstein', 'node scripts/import-juris-sh.ts coverage --write'),
    ...(coverage.blocker ? [`**Blocker:** ${coverage.blocker}.`, ''] : []),
    ...table(['Stufe', 'Anzahl'], [
      ['enumeriert Landesrecht (Rahmendokumente)', coverage.enumerated.landesrecht],
      ['davon Einheiten laut Sitemap', coverage.enumerated.units],
      ['enumeriert Verwaltungsvorschriften', coverage.enumerated.vwv],
      ...Object.entries(coverage.excludedByFamily).map(([family, count]) => [`ausgeschlossen: ${family}`, count]),
      ['Rohquellen im Cache (PDF-Gesamtausgaben; R2 nicht in diesem Lauf)', coverage.rawArchived],
      ['geparst', coverage.parsed],
      ['Textintegrität exact / normalisiert / erklärt / review / mismatch', `${coverage.integrity.exact} / ${coverage.integrity.normalized} / ${coverage.integrity.explained} / ${coverage.integrity.review} / ${coverage.integrity.mismatch}`],
      ['transformiert (SH → NSH)', coverage.transformed],
      ['übernommen', coverage.imported],
      ['Review', coverage.review],
      ['nicht am Stichtag', coverage.notAtBaseline],
      ['Manifesteinträge', coverage.manifestEntries],
      ['Dateien unter content/norms/nsh', coverage.contentFiles],
    ]),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

export function renderHistoricalBaseline(classification: BaselineClassification, baselineOnly: BaselineOnlyAnalysis, ledger: { events: number; postBaseline: number }): string {
  const classes = Object.keys(Object.values(classification.byArea)[0] ?? {});
  const lines = [
    ...HEADER('Historische Baseline juris Schleswig-Holstein', 'node scripts/import-juris-sh.ts reconstruction-queue --write'),
    '## 1 Stichtagsklassifikation',
    '',
    'Je Dokument aus der öffentlichen PDF-Ausgabe (Kopf „Gültig ab/bis“, Ausgabevermerk, „Stand: letzte berücksichtigte Änderung“, Gültigkeit jeder Einheit im Verzeichnis); Quelle `data/audits/juris-sh/corpus-inventory.json`.',
    '',
    ...table(['Bereich', ...classes], Object.entries(classification.byArea).map(([area, counts]) => [area, ...classes.map((key) => (counts as Record<string, number>)[key] ?? 0)])),
    '',
    `\`undetermined\` (→ Review): ${classification.undeterminedReason}`,
    '',
    `Historische Fassungen: ${classification.historicalVersions.note}`,
    '',
    'Rangfolge für jede Stichtagsfassung (unverändert): 1. öffentlich erreichbare historische juris-Fassung (Einzelfassungen „genau dieses Dokument“ mit Gültigkeitszeitraum) · 2. amtliche vollständige Veröffentlichung · 3. sichere Rekonstruktion · 4. Review. Der heutige Text ersetzt nie die Stichtagsfassung.',
    '',
    '## 2 Ereignisregister (bestehend, weiterverwendet)',
    '',
    `Ereignisse gesamt ${ledger.events}, davon nach dem Stichtag ${ledger.postBaseline}. Zuordnung Ereignis → DOKNR über Verkündungsblatt + Gliederungsnummer + Ausfertigungsdatum der Zielnorm (bzw. eindeutige Gliederungsnummer); zugeordnete Ereignisse gehen als Belege in die Stichtagsprüfung (Regeln A/B/C), ein Widerspruch zur Ausgabe führt in den Review.`,
    '',
    '## 3 baseline-only-Kandidaten',
    '',
    `Register (Systematische Übersicht) Stand ${baselineOnly.registerAsOf ?? 'unbekannt'}. Kandidaten **${baselineOnly.candidates}**: Dubletten ${baselineOnly.duplicates} · Ende vor dem Registerstand (durch das Register belegt) ${baselineOnly.confirmedByRegister} · Ende nach dem Registerstand (nur angekündigt, Entfristung nicht ausschließbar) ${baselineOnly.announcedOnly} · einem juris-Dokument zugeordnet ${baselineOnly.matchedAgainstInventory} · Stichtagsfassung übernahmefähig ${baselineOnly.restored}.`,
    '',
    'Zugeordnete Kandidaten sind in juris als nach dem Stichtag aufgehobene Normen geführt; ihre Stichtagsfassung entsteht aus den Einzelfassungen (sonst Review). Nicht zugeordnete stehen in der Rekonstruktionsqueue.',
    '',
    ...table(['Ende', 'Typ', 'Gl.Nr.', 'Titel', 'Fundstelle', 'Einordnung', 'juris', 'Ausgang'], baselineOnly.entries.map((entry) => [entry.eventDate, entry.eventType, entry.gliederungsnummer ?? '', entry.title.slice(0, 100), entry.citation, entry.classification, entry.documentIds?.join(', ') || '–', entry.outcomes?.join(', ') || '–'])),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

export function renderReconstructionQueue(queue: ReconstructionQueue): string {
  const lines = [
    ...HEADER('Rekonstruktionsqueue juris Schleswig-Holstein', 'node scripts/import-juris-sh.ts reconstruction-queue --write'),
    `**Lage:** ${queue.blocker}`,
    '',
    `Vorgemerkt: **${queue.totals.items}** (${Object.entries(queue.totals.byOrgan).map(([organ, count]) => `${organ} ${count}`).join(', ')}${queue.totals.byReason ? `; ${Object.entries(queue.totals.byReason).map(([reason, count]) => `${reason} ${count}`).join(', ')}` : ''}), Registerereignisse nach dem Stichtag ${queue.totals.events}. \`units-missing\`: Einzelfassungen noch nicht (vollständig) geladen; \`unit-selection\`: am Stichtag nicht eindeutig; \`post-baseline-change-unmatched\`: Änderung nach dem Stichtag an einem Registerziel ohne juris-Dokument (DOKNR offen, \`sourceIdentity: null\`); \`register-only-not-in-juris\`: Norm laut amtlichem Register geltend, in juris nicht geführt. Einträge aus dem Amtsblatt umfassen neben Verwaltungsvorschriften auch Bekanntmachungen und Einzelakte; der Scope wird hier nicht geraten.`,
    '',
    ...table(['Blatt', 'Grund', 'DOKNR', 'Gl.Nr.', 'Titel', 'Ereignisse', 'Detail'], queue.items.map((item) => [item.organ, item.reason, item.sourceIdentity ?? '–', item.gliederungsnummer ?? '', item.title.slice(0, 90), item.events.length, (item.detail ?? '').slice(0, 140)])),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

export function renderReviewSummary(audit: AuditResult): string {
  const lines = [
    ...HEADER('Review-Übersicht juris Schleswig-Holstein', 'node scripts/import-juris-sh.ts audit --write'),
    `Review-Fälle: **${audit.review.total}** (offen ${audit.review.open}). Manifesteinträge: ${audit.manifestEntries}. Kein Fall wurde automatisch entschieden; ein Human Approval oder Freeze findet nicht statt.`,
    '',
    ...(audit.review.byCategory.length > 0 ? table(['Kategorie', 'Fälle'], audit.review.byCategory) : ['Keine Review-Fälle: Es wurde noch kein Bulk-Lauf mit --write ausgeführt.']),
    '',
    '## Konsistenzprüfung',
    '',
    ...table(['Prüfung', 'Ergebnis', 'Detail'], audit.checks.map((check) => [check.id, check.ok ? 'ok' : '**Abweichung**', check.detail])),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

export function renderReadiness(result: ReadinessResult): string {
  const lines = [
    ...HEADER('Readiness juris Schleswig-Holstein', 'node scripts/import-juris-sh.ts readiness --write'),
    `**${result.status}**`,
    '',
    `**${result.remoteRelease.status}** – ${result.remoteRelease.reason} (Entscheidungsgrundlage: \`${result.remoteRelease.decisionDocument}\`). Das ist kein Parser- oder Coveragefehler: Der Import ist technisch vollständig; nur die Remote-Veröffentlichung (R2, D1, Deploy) wartet auf die Entscheidung.`,
    '',
    ...(result.blockers.length > 0 ? ['Systemische Blocker:', '', ...result.blockers.map((blocker) => `- ${blocker}`), ''] : []),
    ...table(['Prüfung', 'Status', 'Detail'], result.checks.map((check) => [`${check.label} (\`${check.id}\`)`, check.status === 'pass' ? 'pass' : check.blocker ? '**FAIL (Blocker)**' : 'fail', check.detail])),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

/** Einordnung der Sitzungsbelege – nur aus den protokollierten Antworten abgeleitet. */
function sessionFindings(report: ExportDiscoveryReport): string[] {
  const documentPages = report.probes.filter((probe) => probe.form === 'document' && probe.hops);
  const documentCookies = documentPages.filter((probe) => probe.hops!.some((hop) => hop.setCookie?.length)).length;
  const permaHops = report.probes.filter((probe) => probe.form === 'perma-d' && probe.hops?.some((hop) => hop.setCookie?.length));
  const cookieNames = [...new Set(permaHops.flatMap((probe) => probe.hops!.flatMap((hop) => (hop.setCookie ?? []).map((cookie) => cookie.split(';')[0]!))))].sort();
  const replay = report.probes.find((probe) => probe.form === 'pdf-export-with-session');
  return [
    `- Dokumentseiten \`/bssh/document/…\`: ${documentPages.length} mit Netzabruf, davon mit \`Set-Cookie\` ${documentCookies} (statische Oberflächenseite).`,
    `- Permalink-Dienst \`/jportal/perma\`: ${permaHops.length} Aufrufe setzen eine anonyme Sitzung (${cookieNames.map((name) => `\`${name}\``).join(', ')}) – ohne Anmeldung.`,
    `- Sitzungsprobe: Exportadresse mit allen Cookies des vorherigen Permalink-Aufrufs (${(replay?.sessionCookies ?? []).join(', ') || '–'}): **${replay?.outcome ?? 'nicht durchgeführt'}**${replay?.message ? ` („${replay.message}“)` : ''}.`,
    '- Das CSRF-Token liefert ausschließlich die POST-Initialisierung der internen Schnittstelle (`init` → `csrfToken`); kein öffentlicher Seitenaufruf gibt es aus.',
    '',
    replay?.outcome === 'pdf'
      ? 'Einordnung: **normale anonyme Browsersitzung, keine Zugangskontrolle.** Die PDF-Ausgabe verlangt nur irgendeine Sitzung; die Sitzungscookies setzt der öffentliche Permalink-Aufruf von selbst (wie beim ersten Besuch im Browser). Kein Login, keine Zugangsdaten, kein CSRF-Token, kein Aufruf von `/jportal/wsrest/`. Ohne Sitzung antwortet die Ausgabe mit dem Hinweis „letzte Sitzung bereits beendet“ statt mit einer Sperre (HTTP 200, text/plain) – das ist Sitzungsverwaltung, keine Zugriffssperre. Eine Sitzung genügt für beliebig viele Dokumente.'
      : 'Einordnung: Für Dokumentinhalt und Ausgabe ist keine Anmeldung nötig – aber Sitzungszustand, den nur die interne Schnittstelle erzeugt: Die Ausgabeadresse bedient erst eine Sitzung, in der das Dokument zuvor über `/jportal/wsrest/recherche3/document` (POST, CSRF-Token aus `init`) geladen wurde. Eine anonyme Sitzung aus einem öffentlichen Seitenaufruf allein genügt nicht.',
  ];
}

export function renderExportDiscovery(report: ExportDiscoveryReport): string {
  const flow = report.flow;
  const exportProbes = report.probes.filter((probe) => probe.form === 'pdf-export' || probe.form === 'rtf-export' || probe.form === 'html-export' || probe.form === 'pdf-export-with-session');
  const cookieHops = report.probes.flatMap((probe) => (probe.hops ?? []).filter((hop) => hop.setCookie?.length).map((hop) => [probe.form, hop.url.replace(/^https:\/\/[^/]+/u, ''), hop.status, hop.setCookie!.join(' · ')] as const));
  const bySample = report.samples.map((sample) => {
    const forms = report.probes.filter((probe) => probe.documentId === sample.id);
    const outcome = (form: string): string => forms.find((probe) => probe.form === form)?.outcome ?? '–';
    return [`\`${sample.id}\``, sample.label, sample.kinds.join(', '), outcome('document'), outcome('document-part'), outcome('xsl'), outcome('xsl-part'), outcome('perma-d'), outcome('pdf-export')];
  });
  const lines = [
    ...HEADER('Public Export Discovery juris Schleswig-Holstein', 'node scripts/import-juris-sh.ts sample --write'),
    `Ergebnis: **${report.conclusion}**. ${report.summary.samples} Normen, ${report.summary.probes} Proben (${Object.entries(report.summary.byOutcome).map(([outcome, count]) => `${outcome} ${count}`).join(', ')}). Die interne Schnittstelle \`/jportal/wsrest/…\` wurde nicht aufgerufen.`,
    '',
    ...report.reasoning.map((reason) => `- ${reason}`),
    '',
    '## 1 Wie die Oberfläche Ausgaben anfordert (statische Analyse der Skriptbündel)',
    '',
    ...table(['Funktion', 'Anfrage laut Bündel', 'Sitzung/CSRF'], [
      ['Dokument laden (Text, Metadaten)', 'POST `/jportal/wsrest/recherche3/document` mit JSON `{docId, format: "xsl", keyword, sourceParams}`', `Sitzungscookie (\`credentials: include\`), Kopf \`JURIS-PORTALID\`, \`X-CSRF-TOKEN\`${flow.remoteOperationsPost ? ' – belegt' : ''}`],
      ['Initialisierung', 'POST `/jportal/wsrest/recherche3/init`', `liefert das CSRF-Token (\`csrfToken\`)${flow.csrfFromInit ? ' – belegt' : ''}`],
      ['PDF speichern', `GET-Link \`/jportal/<pdfUrl>\` in neuem Fenster${flow.pdfLinkIsPlainGet ? ' – belegt' : ''}; \`pdfUrl\` stammt aus der Dokumentantwort`, 'kein CSRF-Kopf (Navigation), Browser sendet Sitzungscookie'],
      ['Word/RTF, Originaldokument, HTML-Ansicht, Gesamtausgabe-ZIP', `GET-Links auf \`/jportal/<…Url>\`; Felder ${flow.representationFields.map((field) => `\`${field}\``).join(', ')} aus der Dokumentantwort`, 'wie PDF'],
      ['Drucken', `Route der Oberfläche \`/bssh/${flow.printRoute ?? 'print/document'}\`, gerendert aus dem geladenen Dokumentzustand`, 'keine eigene Serveranfrage'],
      ['Permalink', `Text aus der Dokumentantwort (\`content.permalink\`)${flow.permalinkFromDocument ? ' – belegt' : ''}; \`/perma?d=\`, \`/perma?a=\` leiten serverseitig auf \`/bssh/?…\` um`, 'keine'],
    ]),
    '',
    'Die Oberfläche bildet keine Ausgabeadresse selbst: Alle Adressen kommen aus der Antwort der internen Dokumentschnittstelle. Geprüft wurde deshalb die Ausgabeadresse der juris-Plattform `GET /jportal/recherche3doc/<Name>.<pdf|rtf|html>?json={format, docPart: "X", docId, portalId: "bssh"}` – ohne Cookie, ohne CSRF.',
    '',
    '## 2 Proben je Norm',
    '',
    ...table(['DOKNR', 'Norm (Einordnung laut Suchindex)', 'Merkmale', 'document', 'part/X', 'xsl', 'xsl/part/X', 'perma?d', 'PDF-Export'], bySample),
    '',
    '### Ausgabeadressen',
    '',
    ...table(['Form', 'Dokument', 'HTTP', 'Typ', 'Ergebnis', 'Antworttext'], exportProbes.slice(0, 40).map((probe) => [probe.form, `\`${probe.documentId}\``, probe.httpStatus ?? '–', probe.contentType ?? '–', probe.outcome, probe.message ?? ''])),
    '',
    '## 3 Sitzung und Cookies',
    '',
    `Öffentliche Seitenaufrufe (Dokumentseiten, Permalinks) in diesem Lauf mit Netzabruf: ${report.summary.publicPagesProbedFresh}, davon mit \`Set-Cookie\`: ${report.summary.publicPagesSettingCookies}. Die Ausgabeadresse setzt eine neue Sitzung (\`JSESSIONID\`): ${report.summary.exportEndpointSetsSession ? 'ja' : 'nein'}. Cookie-Werte werden nicht gespeichert.`,
    '',
    ...(cookieHops.length > 0 ? table(['Form', 'Pfad', 'HTTP', 'Set-Cookie (ohne Wert)'], cookieHops.slice(0, 30)) : ['Keine `Set-Cookie`-Antworten protokolliert.']),
    '',
    ...sessionFindings(report),
    '',
    '## 4 Permalink-Identität und historische Fassungen',
    '',
    '- **genau dieses Dokument:** `/perma?d=<Kennung>` → `/bssh/?query=DOKNR:<DOKNR>` (Alias oder DOKNR; fassungsfest).',
    '- **gültige Fassung / Gesamtausgabe:** `/perma?a=<juris-Abkürzung>` → `/jportal/perma?portal=bssh&a=…` → `/bssh/?aiz=1&docId=<Rahmendokument>` (gleitend, Gesamtausgabe). Ohne auflösbare Abkürzung fehlt `docId`.',
    `- **Staatsvertrag:** ${report.staatsvertragAttempts.map((attempt) => `\`${attempt.abbreviation}\` → ${attempt.resolvedId ? `\`${attempt.resolvedId}\`` : 'keine DOKNR'}`).join(', ')}; ohne Titel-Metadaten nicht identifizierbar.`,
    '',
    ...table(['Alias mit Fassungssegment', 'Hinweis (Suchindex)', 'DOKNR der Einheit', 'Rahmendokument', 'Dokumentseite'], report.versions.map((version) => [`\`${version.alias}\``, version.note, version.resolvedId ? `\`${version.resolvedId}\`` : '–', version.frameId ? `\`${version.frameId}\`` : '–', version.documentOutcome ?? '–'])),
    '',
    report.conclusion === 'public-export-available'
      ? 'Historische Fassungen sind damit **adressierbar** (eigene DOKNR je Einheit und Fassung unter demselben Rahmendokument) und über denselben öffentlichen Ausgabeweg **abrufbar**: Die PDF-Ausgabe ohne `docPart` liefert genau diese Einzelfassung mit „Fassung vom“, „Gültig ab“ und „Gültig bis“ (Stichprobe: `SAMPLE_REPORT.md`). Mit `docPart: "X"` liefert dieselbe Adresse die aktuelle Gesamtausgabe des Rahmendokuments.'
      : 'Historische Fassungen sind damit **adressierbar** (eigene DOKNR je Einheit und Fassung unter demselben Rahmendokument), ihr Inhalt ist es über öffentliche Wege nicht.',
    '',
    '## 5 TDM-Vorbehalt (getrennt von robots.txt, Erreichbarkeit und Sitzung)',
    '',
    `Jede Antwort des Portals trägt den Kopf \`tdm-reservation: 1\`${report.summary.tdmReservationHeader ? ' (in diesem Lauf protokolliert)' : ''}, die Oberflächenseite zusätzlich \`<meta name="tdm-reservation" content="1">\`; \`/.well-known/tdmrep.json\` fehlt (HTTP 404). Das ist ein maschinenlesbarer Nutzungsvorbehalt für Text- und Data-Mining (TDM Reservation Protocol). Er ist unabhängig davon, dass robots.txt für diesen Adapter advisory ist, dass keine technische Sperre besteht und dass die Ausgabe Sitzungszustand verlangt. Eine rechtliche Schlussfolgerung zieht der Adapter nicht; sie bleibt dem Menschen vorbehalten.`,
    '',
  ];
  return `${lines.join('\n')}\n`;
}

export function renderSampleReport(report: SampleReport): string {
  const lines = [
    ...HEADER('Stichprobe Vollweg juris Schleswig-Holstein', 'node scripts/import-juris-sh.ts sample --write'),
    'Vollweg je Norm: öffentliche PDF-Ausgabe (Permalink-Sitzung, GET, kein CSRF) → Layout (`pdftotext -bbox-layout`) → Parser → SH-Modell → Stichtagseinordnung → Überleitung SH → NSH → `validateNormRecord` → Restpostenprüfung, mit Textintegritätsprüfung. Es werden keine Normen geschrieben.',
    '',
    `Ausgänge: ${Object.entries(report.totals).map(([outcome, count]) => `${outcome} ${count}`).join(' · ')}. Textintegrität: ${Object.entries(report.integrity).map(([integrity, count]) => `${integrity} ${count}`).join(' · ')}. Netzabrufe ${report.network.requests}, Cache-Treffer ${report.network.cacheHits}, Sitzungen ${report.network.sessionsOpened}.`,
    '',
    ...table(['DOKNR', 'Zweck', 'Titel', 'Typ', 'Ausgang', 'Stichtag', 'Integrität', 'Blöcke/Einheiten/Verz.', 'Gründe'], report.norms.map((norm) => [
      `\`${norm.documentId}\``,
      norm.purpose,
      (norm.title ?? '').slice(0, 70),
      norm.type ?? '–',
      norm.outcome,
      norm.baseline ? `${norm.baseline.class}: ${norm.baseline.basis}`.slice(0, 90) : '–',
      norm.integrity ? `${norm.integrity.class}${norm.integrity.missing || norm.integrity.extra ? ` (−${norm.integrity.missing}/+${norm.integrity.extra})` : ''}` : '–',
      norm.counts ? `${norm.counts.blocks}/${norm.counts.units}/${norm.counts.tocEntries}` : '–',
      norm.reasons.join('; ').slice(0, 200),
    ])),
    '',
    '**Regeln.** `import-ready` nur, wenn die aktuelle Ausgabe nachweislich am Stichtag galt (Kopf, Ausgabevermerk und Gültigkeit jeder Einheit im Verzeichnis), die Textintegrität vollständig ist und weder Parser noch Überleitung eine Warnung melden. Tabellenlayout und Abbildungen führen in den Review: Der Textlayer trägt die Tabellenstruktur nicht sicher, Abbildungen gar nicht. Geänderte oder nach dem Stichtag aufgehobene Normen werden aus den am Stichtag geltenden Einzelfassungen der juris-Historie zusammengesetzt (PDF-Ausgabe „genau dieses Dokument“, Gültigkeitszeitraum je Einheit, aufsteigende Reihenfolge, Integritätsprüfung gegen genau diese Zeilen); sind sie nicht (vollständig) geladen oder nicht eindeutig, bleibt die Norm in der Rekonstruktion. Ihr heutiger Text ersetzt nie die Stichtagsfassung.',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

const counts = (record: Record<string, number>): string => Object.entries(record).sort(([, left], [, right]) => right - left).map(([key, value]) => `${key} ${value}`).join(' · ') || '–';

export function renderCorpusInventory(report: InventoryReport): string {
  const t = report.totals;
  const lines = [
    ...HEADER('Vollkorpus-Inventur juris Schleswig-Holstein', 'node scripts/import-juris-sh.ts inventory --write'),
    `Netzfrei aus dem Cache von \`fetch-corpus\` (öffentliche PDF-Ausgabe). Je Dokument der Vollweg der Stichprobe: Parser → SH-Modell → Stichtag (bei späteren Änderungen die am Stichtag geltenden Einzelfassungen) → Überleitung SH → NSH → \`validateNormRecord\` → Textintegrität, dazu Stichtagsbelege mit dem bestehenden Ereignisregister (Regeln A/B/C). Parser \`${report.parserVersion}\`, Überleitung \`${report.transformerVersion}\`.`,
    '',
    '## 1 Ausgänge',
    '',
    ...table(['Kennzahl', 'Wert'], [
      ['Enumeriert', t.enumerated],
      ['Verarbeitet', t.processed],
      ['Ausgänge', counts(t.byOutcome)],
      ['Landesrecht', counts(t.byArea.landesrecht ?? {})],
      ['Verwaltungsvorschriften', counts(t.byArea.vwv ?? {})],
      ['Manifeststatus', counts(t.byManifestStatus)],
      ['Stichtagseinordnung der Ausgabe', counts(t.byBaselineClass)],
      ['Stichtagsregel (A/B/C)', counts(t.evidenceRules)],
      ['Textintegrität', counts(t.byIntegrity)],
      ['Normtyp', counts(t.byType)],
    ]),
    '',
    '## 2 Sperrgründe (Dokumente je Grund)',
    '',
    ...table(['Grund', 'Dokumente'], Object.entries(t.blockers).sort(([, left], [, right]) => right - left).map(([key, value]) => [`\`${key}\``, value])),
    '',
    '`parse:table-layout` und `pdf-only`-Abbildungen gehen in den Review, weil der Textlayer Tabellen- und Bildinhalte nicht sicher trägt; `units-missing` heißt: Am Stichtag galt eine andere Fassung, die Einzelfassungen sind noch nicht (vollständig) im Cache (`npm run import:juris-sh:fetch-corpus -- --phase units`); `baseline:ledger-contradiction`: Das Ereignisregister belegt eine Änderung nach dem Stichtag, die Ausgabe nicht.',
    '',
    '## 3 Zweite Quelle: amtliche Register',
    '',
    ...table(['Register', 'Bereich', 'Stand', 'Registerköpfe (nach Ausschluss)', 'ausgenommen', 'nur Gliederungsnummer', 'streng (Kennung oder Titel mit Datum)', 'je Stufe'], report.registerCrosscheck.map((check) => [check.source, check.area, check.asOf ?? '–', check.registerNumbers, check.excludedAmendingOrAgreement, `${check.idOnly.found} = ${(check.idOnly.rate * 100).toFixed(1)} %`, `${check.found} = ${(check.coverage * 100).toFixed(1)} %`, Object.entries(check.byTier).filter(([, count]) => count > 0).map(([tier, count]) => `${tier} ${count}`).join(' · ')])),
    '',
    'Zählbasis sind die Köpfe des vollen amtlichen Registers (Audit „NSH-Audit“, `audit/register-crosscheck.ts`), nicht Änderungsereignisse. Ein bloßer Titeltreffer zählt nie als gefunden (Handprüfung: 37 % bzw. 81 % Falschtreffer). Die Quote ist ein Indikator, kein Gate; jeder nicht gefundene Kopf ist klassifiziert und steht in der Rekonstruktionsqueue.',
    '',
    ...report.registerCrosscheck.flatMap((check) => check.missing.length === 0 ? [] : [`**${check.source}: nicht streng gefunden (${check.missing.length})**`, '', ...table(['Gl.Nr.', 'Titel laut Register', 'Stufe', 'Einordnung'], check.missing.map((entry) => [entry.gliederungsnummer, entry.title, entry.tier, entry.classification])), '']),
    '',

    '## 4 baseline-only-Kandidaten des Ereignisregisters',
    '',
    `${report.baselineOnly.candidates} Kandidaten (Vorschrift endete nach dem Stichtag), ${report.baselineOnly.matched} einem juris-Dokument zugeordnet (Gliederungsnummer + Ausfertigungsdatum bzw. eindeutige Gliederungsnummer). Ausgänge: ${counts(report.baselineOnly.byOutcome)}.`,
    '',
    ...table(['Ereignis', 'Datum', 'Gl.Nr.', 'Titel', 'juris', 'Ausgang'], report.baselineOnly.entries.map((entry) => [entry.eventId.slice(0, 40), entry.eventDate, entry.gliederungsnummer ?? '–', entry.title.slice(0, 70), entry.documentIds.join(', ') || '–', entry.outcomes.join(', ') || 'nicht zugeordnet'])),
    '',
    '## 5 Regeln',
    '',
    'Übernommen wird nur `import-ready` mit Regel B (starker Beginn bis zum Stichtag und starker Fortbestand) ohne widersprechendes Registerereignis. Alles andere bleibt draußen: Review-Fälle unter `data/imports/juris-sh/review/`, keine automatische Freigabe, kein Freeze. Die Einzeldaten je Dokument stehen in `corpus-inventory.json`.',
    '',
  ];
  return `${lines.join('\n')}\n`;
}
