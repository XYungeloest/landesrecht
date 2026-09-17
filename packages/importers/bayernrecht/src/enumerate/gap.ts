/**
 * Die Abdeckungslücke zwischen Fortführungsnachweis und Portalfacette – Befund und Bericht.
 *
 * Die Quellen-Discovery ließ offen, warum der Facettenbaum 2.413 Vorschriften zählt, die beiden
 * Fortführungsnachweise aber nur 2.311 Dokumente führen. Der Mengenabgleich (`inventory.ts`,
 * `enumeration.ts`) beantwortet die Frage in eine Richtung eindeutig: **Jede ID des
 * Fortführungsnachweises kommt auch in der Facette vor.** Die Differenz besteht ausschließlich aus
 * Dokumenten, die das Portal führt und der Nachweis nicht.
 *
 * Dieses Modul ordnet diese Dokumente nach nachprüfbaren Merkmalen (Titel, Fundstelle, Normtyp) in
 * Gruppen ein und schreibt den Befund nach `data/audits/bayernrecht/ENUMERATION_GAP.md` (Lesefassung)
 * und `data/audits/bayernrecht/enumeration-gap.json` (maschinenlesbar, mit jeder einzelnen ID).
 *
 * Grundregel: Es wird nur eingeordnet, was die Quelle selbst hergibt. Was sich daraus nicht erklärt,
 * bleibt in der Gruppe `ungeklaert` stehen – vollständig aufgeführt, nicht weggerundet.
 */
import { join } from 'node:path';

import { readJsonFile, writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { stableStringify } from '@landesrecht/importer-recht-nrw/common/stable-json.ts';

import { AUDIT_DIR } from '../common/constants.ts';
import { compareSourceIdentity } from '../common/paths.ts';
import type { FacetDocument, FacetInventory } from './inventory.ts';
import { NORM_TYPE_LABELS, type NormType } from './portal.ts';

export const GAP_REPORT_PATH = `${AUDIT_DIR}/ENUMERATION_GAP.md`;
export const GAP_DATA_PATH = `${AUDIT_DIR}/enumeration-gap.json`;
export const GAP_SCHEMA = 'bayernrecht-enumeration-gap/1' as const;

export const GAP_GROUPS = ['tarifvertrag', 'bundeseinheitliche-anordnung', 'gliederungsstelle-anderweitig-belegt', 'haushaltsrundschreiben-jahresfassung', 'ungeklaert'] as const;
export type GapGroup = (typeof GAP_GROUPS)[number];

export const GAP_GROUP_TITLES: Readonly<Record<GapGroup, string>> = {
  tarifvertrag: 'Tarifverträge des öffentlichen Dienstes',
  'bundeseinheitliche-anordnung': 'Bundeseinheitliche Anordnungen und Vereinbarungen (Bundesanzeiger)',
  'gliederungsstelle-anderweitig-belegt': 'Gliederungsstelle im Fortführungsnachweis anderweitig belegt',
  'haushaltsrundschreiben-jahresfassung': 'Ältere Jahresfassungen kommunaler Haushaltsrundschreiben',
  ungeklaert: 'Ungeklärt',
};

export const GAP_GROUP_REASONS: Readonly<Record<GapGroup, string>> = {
  tarifvertrag:
    'Tarifverträge sind keine Rechtsvorschriften des Freistaats, sondern Vereinbarungen der Tarifvertragsparteien. Die Bayerische Rechtssammlung führt Gesetze, Rechtsverordnungen und Staatsverträge; ein Tarifvertrag hat dort keine Gliederungsnummer. Das Portal zeigt sie gleichwohl unter „Verträge, sonstige Rechtsquellen“.',
  'bundeseinheitliche-anordnung':
    'Bundeseinheitlich vereinbarte Anordnungen und Richtlinien (Mitteilungen in Straf- und Zivilsachen, Strafvollstreckungs- und Rechtshilfeordnung, Gerichtsvollzieherrecht u. a.). Sie werden im Bundesanzeiger bekannt gemacht, nicht im GVBl. oder BayMBl. – deshalb führt sie kein bayerischer Fortführungsnachweis.',
  'gliederungsstelle-anderweitig-belegt':
    'Die Dokument-ID trägt eine BayVV-Gliederungsnummer, und zu genau dieser Gliederungsstelle führt der Fortführungsnachweis ein anderes Dokument (Geschwister-IDs sind im Datensatz genannt). Das Portal hält daneben ältere oder parallele Bekanntmachungen derselben Stelle vor; der Nachweis führt je Gliederungsstelle nur eine.',
  'haushaltsrundschreiben-jahresfassung':
    'Jährlich wiederkehrende Bekanntmachungen zu Aufstellung und Vollzug der kommunalen Haushaltspläne, deren Kennung noch dem alten Schema folgt und deshalb keine Gliederungsnummer trägt. Das Portal hält ältere Jahrgänge weiter vor; der Fortführungsnachweis führt nur die jeweils geltende Fassung.',
  ungeklaert: 'Aus Titel, Fundstelle und Normtyp allein nicht erklärbar. Diese Dokumente sind vor einem vollständigkeitsgeprüften Bulk-Lauf einzeln zu prüfen.',
};

/** Titelmerkmale der Tarifverträge; sie stehen alle im Titel des Portaldokuments. */
const TARIFVERTRAG = /\bTarifvertrag\b|\bAnschlusstarifvertrag\b|\bTarifverträge\b|^TV[- ]|\bTV-[A-Za-zÄÖÜ]|\bEntgeltordnung\b|\bEntgeltumwandlung\b|\bEinmalzahlung(?:en)?\b|\bSonderzahlung(?:en)?\b/u;
/** Bekanntmachung im Bundesanzeiger – im Titel als Fundstelle genannt. */
const BUNDESANZEIGER = /\bBAnz\b|\bBundesanzeiger\b/u;
/** Bundeseinheitliche Justizanordnungen ohne Fundstellenangabe im Titel; Kennungen aus der Trefferliste. */
const BUNDESEINHEITLICHE_JUSTIZ_IDS = new Set(['DSVollz', 'GVGA', 'GerVO', 'MiStra2022', 'MiZi2024', 'RiVASt', 'VerschLAVerf', 'ZRHO']);
/** Vereinbarungen des Bundes und der Länder (Titel nennt beides ausdrücklich). */
const BUND_LAENDER = /Vereinbarung des Bundes und der Länder|des Bundes und der Länder\b|im internationalen Rechtshilfeverkehr/u;
/** Kommunale Haushaltsrundschreiben; der Titel ist über die Jahrgänge wortgleich. */
const HAUSHALTSRUNDSCHREIBEN = /Aufstellung und Vollzug der Haushaltspläne der Kommunen|Finanzplanung \d{4} bis \d{4} der kommunalen Körperschaften/u;

/**
 * Gliederungsstelle einer Verwaltungsvorschrift aus ihrer Kennung: `BayVV_2230_7_1_K_10450` gehört zur
 * Stelle `BayVV_2230_7_1_K_` (Gliederungsnummer 2230.7.1 im Ressort K), die laufende Nummer am Ende
 * unterscheidet die einzelne Bekanntmachung. Kennungen des älteren Schemas (`BayVwV312180`) tragen
 * keine Gliederungsnummer und liefern deshalb keine Stelle.
 */
export function gliederungsstelleOf(documentId: string): string | undefined {
  return /^(BayVV_.+_)\d+$/u.exec(documentId)?.[1];
}

/** Zuordnung je Dokument der Differenzmenge; `siblings` sind die Belege der Gliederungsstelle. */
export function classifyGapDocument(document: Pick<FacetDocument, 'documentId' | 'title'>, gliederungsstellenImNachweis: ReadonlyMap<string, readonly string[]> = new Map()): { group: GapGroup; siblings?: string[] } {
  if (TARIFVERTRAG.test(document.title)) return { group: 'tarifvertrag' };
  if (BUNDESANZEIGER.test(document.title) || BUND_LAENDER.test(document.title) || BUNDESEINHEITLICHE_JUSTIZ_IDS.has(document.documentId)) return { group: 'bundeseinheitliche-anordnung' };
  const stelle = gliederungsstelleOf(document.documentId);
  const siblings = stelle ? gliederungsstellenImNachweis.get(stelle) : undefined;
  if (siblings && siblings.length > 0) return { group: 'gliederungsstelle-anderweitig-belegt', siblings: [...siblings] };
  if (HAUSHALTSRUNDSCHREIBEN.test(document.title)) return { group: 'haushaltsrundschreiben-jahresfassung' };
  return { group: 'ungeklaert' };
}

/** Gliederungsstellen, die der Fortführungsnachweis belegt, mit den belegenden Kennungen. */
export function gliederungsstellenOf(documentIds: Iterable<string>): Map<string, string[]> {
  const stellen = new Map<string, string[]>();
  for (const documentId of documentIds) {
    const stelle = gliederungsstelleOf(documentId);
    if (!stelle) continue;
    stellen.set(stelle, [...(stellen.get(stelle) ?? []), documentId].sort(compareSourceIdentity));
  }
  return stellen;
}

export interface GapDocument {
  documentId: string;
  normType: NormType;
  title: string;
  legalStatusDate?: string;
  group: GapGroup;
  /** Kennungen, die dieselbe BayVV-Gliederungsstelle im Fortführungsnachweis belegen. */
  seriesSiblings?: string[];
  sourceUrl: string;
  /** Trefferlistenseite, auf der das Dokument steht, mit ihrem SHA-256 und ihrer Abrufzeit. */
  listingUrl: string;
  listingSha256: string;
  retrievedAt: string;
}

export interface GapReport {
  schemaVersion: typeof GAP_SCHEMA;
  generatedAt: string;
  /** Sollzahlen beider Seiten. */
  totals: {
    facetDocuments: number;
    fortfuehrungsnachweisEntries: number;
    onlyFacet: number;
    onlyFortfuehrungsnachweis: number;
    byNormType: Array<{ normType: NormType; facet: number; fortfuehrungsnachweis: number; onlyFacet: number }>;
  };
  groups: Array<{ group: GapGroup; title: string; reason: string; count: number; documentIds: string[] }>;
  documents: GapDocument[];
  /** IDs, die nur der Fortführungsnachweis kennt – belegt leer, aber ausdrücklich ausgewiesen. */
  onlyFortfuehrungsnachweisIds: string[];
  /** Was auch nach diesem Abgleich offen bleibt. */
  open: string[];
}

export interface BuildGapReportInput {
  inventory: FacetInventory;
  /** Alle Dokument-IDs beider Fortführungsnachweise. */
  fortfuehrungsnachweisIds: ReadonlySet<string>;
  /** Einträge je Nachweis (nur für die Bilanz). */
  fortfuehrungsnachweisEntries: number;
  now: string;
}

export function buildGapReport(input: BuildGapReportInput): GapReport {
  const facetIds = new Set(input.inventory.documents.map((document) => document.documentId));
  const onlyFacet = input.inventory.documents.filter((document) => !input.fortfuehrungsnachweisIds.has(document.documentId));
  const onlyFfn = [...input.fortfuehrungsnachweisIds].filter((id) => !facetIds.has(id)).sort(compareSourceIdentity);
  const stellen = gliederungsstellenOf(input.fortfuehrungsnachweisIds);
  const documents: GapDocument[] = onlyFacet
    .map((document) => {
      const classification = classifyGapDocument(document, stellen);
      const record: GapDocument = {
        documentId: document.documentId,
        normType: document.normType,
        title: document.title,
        group: classification.group,
        ...(classification.siblings ? { seriesSiblings: classification.siblings } : {}),
        sourceUrl: `https://www.gesetze-bayern.de/Content/Document/${document.documentId}`,
        listingUrl: document.sourceUrl,
        listingSha256: document.sourceSha256,
        retrievedAt: document.retrievedAt,
      };
      if (document.legalStatusDate) record.legalStatusDate = document.legalStatusDate;
      return record;
    })
    .sort((left, right) => compareSourceIdentity(left.documentId, right.documentId));
  const groups = GAP_GROUPS.map((group) => {
    const members = documents.filter((document) => document.group === group);
    return { group, title: GAP_GROUP_TITLES[group], reason: GAP_GROUP_REASONS[group], count: members.length, documentIds: members.map((member) => member.documentId) };
  });
  const byNormType = input.inventory.types.map((type) => ({
    normType: type.normType,
    facet: type.total,
    fortfuehrungsnachweis: input.inventory.documents.filter((document) => document.normType === type.normType && input.fortfuehrungsnachweisIds.has(document.documentId)).length,
    onlyFacet: documents.filter((document) => document.normType === type.normType).length,
  }));
  const open: string[] = [];
  const unresolved = groups.find((group) => group.group === 'ungeklaert')!;
  if (unresolved.count > 0) open.push(`${unresolved.count} Dokumente lassen sich aus Titel, Fundstelle, Kennung und Normtyp nicht einordnen (oben einzeln aufgeführt); vor einem vollständigkeitsgeprüften Bulk-Lauf sind sie einzeln zu prüfen.`);
  open.push(
    'Die naheliegende Erklärung „nicht im Amtsblatt bekannt gemacht“ trägt für diese Reste **nicht**: Die Dokumentseiten von `BayVV_2230_7_1_K_10450` („BayMBl. Nr. 218“, Bekanntmachung vom 28. Mai 2019) und `BayVV_631_B_15643` („BayMBl. Nr. 206“, Bekanntmachung vom 8. Mai 2026) nennen ausdrücklich eine BayMBl.-Fundstelle und fehlen im Fortführungsnachweis gleichwohl. Beide Seiten wurden dafür einzeln abgerufen.',
  );
  open.push('Warum der Fortführungsnachweis diese Vorschriften nicht führt, sagt die Quelle nirgends: Der Nachweis enthält weder Legende noch Aufnahmekriterium. Belegbar ist nur, dass er sie nicht führt.');
  open.push('Ob die hier gefundenen Dokumente in den Bestand gehören, ist eine fachliche Entscheidung (Rechtsbegriff der Vorschrift, `docs/LEGAL_SCOPE.md`) und keine Frage der Enumeration. Die Enumeration führt sie und überlässt die Auswahl dem Review.');
  open.push('Warum einzelne Titel im Fortführungsnachweis mit „*“ beginnen, sagt die Quelle ebenfalls nicht; eine Legende gibt es dort nicht.');
  return {
    schemaVersion: GAP_SCHEMA,
    generatedAt: input.now,
    totals: {
      facetDocuments: input.inventory.documents.length,
      fortfuehrungsnachweisEntries: input.fortfuehrungsnachweisEntries,
      onlyFacet: documents.length,
      onlyFortfuehrungsnachweis: onlyFfn.length,
      byNormType,
    },
    groups,
    documents,
    onlyFortfuehrungsnachweisIds: onlyFfn,
    open,
  };
}

const escape = (value: string): string => value.replace(/\|/gu, '\\|');

export function renderGapReport(report: GapReport, inventory: FacetInventory): string {
  const lines: string[] = [];
  lines.push('# Abdeckungslücke der Enumeration: Fortführungsnachweis gegen Portalfacette (BAYERN.RECHT)');
  lines.push('');
  lines.push(`Stand: ${report.generatedAt.slice(0, 10)} · erzeugt von \`node scripts/import-bayernrecht.ts enumerate --write\``);
  lines.push(`· maschinenlesbar: \`${GAP_DATA_PATH}\` · Rohbestand: \`data/audits/bayernrecht/facet-inventory.json\``);
  lines.push('');
  lines.push('## Der Befund in einem Satz');
  lines.push('');
  lines.push(
    `Die Lücke ist **einseitig**: Alle ${report.totals.fortfuehrungsnachweisEntries} Dokumente der beiden Fortführungsnachweise stehen auch in der Portalfacette (` +
      `nur im Nachweis: ${report.totals.onlyFortfuehrungsnachweis}). Umgekehrt führt das Portal ${report.totals.onlyFacet} Dokumente, die kein Fortführungsnachweis nennt.`,
  );
  lines.push('');
  lines.push('## Bilanz');
  lines.push('');
  lines.push('| Normtyp | Facette | im Fortführungsnachweis | nur Facette |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const row of report.totals.byNormType) lines.push(`| ${NORM_TYPE_LABELS[row.normType]} (\`${row.normType}\`) | ${row.facet} | ${row.fortfuehrungsnachweis} | ${row.onlyFacet} |`);
  lines.push(`| **gesamt** | **${report.totals.facetDocuments}** | **${report.totals.fortfuehrungsnachweisEntries}** | **${report.totals.onlyFacet}** |`);
  lines.push('');
  lines.push(
    `Die Facettenzahlen sind nicht abgeschrieben, sondern durchgeblättert: ${inventory.pages.length} Trefferlistenseiten, ` +
      `je Seite zehn Treffer, jede Seite mit Adresse, SHA-256 und Abrufzeit in \`facet-inventory.json\`. ` +
      `Der Trefferzähler jeder Facette stimmt mit der Zahl der gesammelten Dokumente überein (${inventory.complete ? 'vollständig' : 'NICHT vollständig'}).`,
  );
  lines.push('');
  lines.push('## Woraus die Differenz besteht');
  lines.push('');
  for (const group of report.groups) {
    lines.push(`### ${group.title} — ${group.count}`);
    lines.push('');
    lines.push(group.reason);
    lines.push('');
    if (group.count === 0) {
      lines.push('_Keine Dokumente in dieser Gruppe._');
      lines.push('');
      continue;
    }
    const withSiblings = group.group === 'gliederungsstelle-anderweitig-belegt';
    lines.push(withSiblings ? '| Dokument-ID | Rechtsstand | im Nachweis an derselben Stelle | Titel |' : '| Dokument-ID | Normtyp | Rechtsstand | Titel |');
    lines.push('| --- | --- | --- | --- |');
    for (const documentId of group.documentIds) {
      const document = report.documents.find((candidate) => candidate.documentId === documentId)!;
      const second = withSiblings ? (document.seriesSiblings ?? []).map((sibling) => `\`${sibling}\``).join(', ') : `\`${document.normType}\``;
      lines.push(withSiblings
        ? `| [\`${document.documentId}\`](${document.sourceUrl}) | ${document.legalStatusDate ?? '–'} | ${second} | ${escape(document.title)} |`
        : `| [\`${document.documentId}\`](${document.sourceUrl}) | ${second} | ${document.legalStatusDate ?? '–'} | ${escape(document.title)} |`);
    }
    lines.push('');
  }
  lines.push('## Was das für den Bulk-Lauf bedeutet');
  lines.push('');
  lines.push('1. **Der Fortführungsnachweis allein genügt nicht.** Er ist vollständig in dem, was er führt, aber er führt nicht alles, was das Portal als Vorschrift ausweist. Die Enumeration stützt sich deshalb auf beide Quellen und nimmt alle Dokumente der Facette auf.');
  lines.push('2. **Kein Dokument geht verloren.** Die Gegenrichtung ist belegt leer: Es gibt keine ID, die nur der Nachweis kennt.');
  lines.push('3. **Der Normtyp kommt ausschließlich aus der Facette.** Der Fortführungsnachweis nennt ihn nicht; die Endbuchstaben der BayRS-Nummer bezeichnen das Ressort, nicht die Rechtsform.');
  lines.push('');
  lines.push('## Was offen bleibt');
  lines.push('');
  for (const entry of report.open) lines.push(`- ${entry}`);
  lines.push('');
  return `${lines.join('\n')}`;
}

export function gapReportJsonText(report: GapReport): string {
  const { documents, ...header } = report;
  return `${JSON.stringify(header, null, 2).replace(/\n\}$/u, '')},\n  "documents": [\n${documents.map((document) => `    ${JSON.stringify(document)}`).join(',\n')}\n  ]\n}\n`;
}

/**
 * Schreibt beide Fassungen des Berichts. Ändert sich fachlich nichts, behält der Bericht sein altes
 * Erstellungsdatum – ein Wiederholungslauf erzeugt sonst allein wegen der Uhrzeit einen Diff.
 */
export async function writeGapReport(root: string, report: GapReport, inventory: FacetInventory): Promise<{ markdown: boolean; json: boolean }> {
  const previous = await readJsonFile<GapReport>(join(root, GAP_DATA_PATH));
  const unchanged = previous !== undefined && stableStringify({ ...report, generatedAt: previous.generatedAt }) === stableStringify(previous);
  const next: GapReport = unchanged ? { ...report, generatedAt: previous.generatedAt } : report;
  const markdown = await writeFileAtomic(join(root, GAP_REPORT_PATH), renderGapReport(next, inventory));
  const json = await writeFileAtomic(join(root, GAP_DATA_PATH), gapReportJsonText(next));
  return { markdown, json };
}
