/**
 * Markdown-Berichte des juris-SH-Adapters unter `data/audits/juris-sh/`. Reine Funktionen: gleiche Eingabe,
 * gleicher Text (keine Tageszeit; Zeitangaben stammen aus den Abrufbelegen).
 */
import { JURIS_SH_ACCESS_POLICY } from '../access/policy.ts';
import { BASELINE_DATE } from '../common/constants.ts';
import type { SourceInventory } from '../enumerate/run.ts';
import type { AddressabilityReport } from '../probe/addressability.ts';
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
      ['Rohquellen archiviert', coverage.rawArchived],
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
  const lines = [
    ...HEADER('Historische Baseline juris Schleswig-Holstein', 'node scripts/import-juris-sh.ts reconstruction-queue --write'),
    '## 1 Stichtagsklassifikation',
    '',
    ...table(['Bereich', 'unchanged-since-baseline', 'changed-after-baseline', 'enacted-after-baseline', 'undetermined'], Object.entries(classification.byArea).map(([area, counts]) => [area, counts['unchanged-since-baseline'], counts['changed-after-baseline'], counts['enacted-after-baseline'], counts.undetermined])),
    '',
    `Grund für \`undetermined\`: ${classification.undeterminedReason}`,
    '',
    `Historische Fassungen gewonnen: **${classification.historicalVersions.recovered}**. ${classification.historicalVersions.note}`,
    '',
    'Rangfolge für jede Stichtagsfassung (unverändert): 1. öffentlich erreichbare historische juris-Fassung · 2. amtliche vollständige Veröffentlichung · 3. sichere Rekonstruktion · 4. Review. Der heutige Text ersetzt nie die Stichtagsfassung.',
    '',
    '## 2 Ereignisregister (Belege, keine Zuordnung)',
    '',
    `Ereignisse gesamt ${ledger.events}, davon nach dem Stichtag ${ledger.postBaseline}. Die Zuordnung Ereignis → DOKNR braucht Titel/Gliederungsnummer aus dem Dokument und ist deshalb offen.`,
    '',
    '## 3 baseline-only-Kandidaten',
    '',
    `Register (Systematische Übersicht) Stand ${baselineOnly.registerAsOf ?? 'unbekannt'}. Kandidaten **${baselineOnly.candidates}**: Dubletten ${baselineOnly.duplicates} · Ende vor dem Registerstand (durch das Register belegt) ${baselineOnly.confirmedByRegister} · Ende nach dem Registerstand (nur angekündigt, Entfristung nicht ausschließbar) ${baselineOnly.announcedOnly} · mit dem heutigen Bestand abgeglichen ${baselineOnly.matchedAgainstInventory} · wiederhergestellt ${baselineOnly.restored}.`,
    '',
    'Für echte Kandidaten braucht die Wiederherstellung die vollständige Belegkette (Stammfassung und alle Änderungen bis zum Stichtag aus GVOBl.) oder die historische juris-Fassung; beides liegt nicht vor.',
    '',
    ...table(['Ende', 'Typ', 'Gl.Nr.', 'Titel', 'Fundstelle', 'Einordnung'], baselineOnly.entries.map((entry) => [entry.eventDate, entry.eventType, entry.gliederungsnummer ?? '', entry.title.slice(0, 100), entry.citation, entry.classification])),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

export function renderReconstructionQueue(queue: ReconstructionQueue): string {
  const lines = [
    ...HEADER('Rekonstruktionsqueue juris Schleswig-Holstein', 'node scripts/import-juris-sh.ts reconstruction-queue --write'),
    `**Blocker:** ${queue.blocker}`,
    '',
    `Vorgemerkte Vorschriften: **${queue.totals.items}** (${Object.entries(queue.totals.byOrgan).map(([organ, count]) => `${organ} ${count}`).join(', ')}) mit ${queue.totals.events} Änderungs-, Neufassungs- oder Berichtigungsereignissen nach dem Stichtag (amtliche Register, Beweisklasse strong/supporting). Jede ist ein \`changed-after-baseline\`-Kandidat; ihre DOKNR ist offen (\`sourceIdentity: null\`). Einträge aus dem Amtsblatt umfassen neben Verwaltungsvorschriften auch Bekanntmachungen und Einzelakte; der Scope ist je Dokument offen und wird hier nicht geraten.`,
    '',
    ...table(['Blatt', 'Gl.Nr.', 'Titel', 'Ereignisse', 'erstes', 'letztes'], queue.items.map((item) => [item.organ, item.gliederungsnummer ?? '', item.title.slice(0, 100), item.events.length, item.events[0]?.eventDate ?? '', item.events.at(-1)?.eventDate ?? ''])),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

export function renderReviewSummary(audit: AuditResult): string {
  const lines = [
    ...HEADER('Review-Übersicht juris Schleswig-Holstein', 'node scripts/import-juris-sh.ts audit --write'),
    `Review-Fälle: **${audit.review.total}** (offen ${audit.review.open}). Manifesteinträge: ${audit.manifestEntries}. Kein Fall wurde automatisch entschieden; ein Human Approval oder Freeze findet nicht statt.`,
    '',
    ...(audit.review.byCategory.length > 0 ? table(['Kategorie', 'Fälle'], audit.review.byCategory) : ['Keine Review-Fälle: Ohne abrufbaren Normtext wurde keine Norm verarbeitet.']),
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
    `**${result.ready ? 'READY' : 'NOT READY'}**`,
    '',
    ...(result.blockers.length > 0 ? ['Systemische Blocker:', '', ...result.blockers.map((blocker) => `- ${blocker}`), ''] : []),
    ...table(['Prüfung', 'Status', 'Detail'], result.checks.map((check) => [`${check.label} (\`${check.id}\`)`, check.status === 'pass' ? 'pass' : check.blocker ? '**FAIL (Blocker)**' : 'fail', check.detail])),
    '',
  ];
  return `${lines.join('\n')}\n`;
}
