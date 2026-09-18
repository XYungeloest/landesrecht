/**
 * Restpostenprüfung auf der fertigen Norm (`JurisdictionTransformer.audit`).
 *
 * Abgrenzung zu `auditTransformation` (detection.ts): Dort liegen Quell- und Zieltext paarweise vor,
 * dort lässt sich zusätzlich prüfen, ob jede Änderung protokolliert und jede Regel angewandt wurde.
 * Hier steht nur das Ergebnis zur Verfügung. Geprüft wird deshalb genau das, was am Ergebnis allein
 * prüfbar ist und was der Vertrag verlangt: Im übergeleiteten Recht darf keine unerklärte Bezeichnung
 * des realen Landes verbleiben, und es darf keine Doppelbildung aus Quell- und Zielnamen entstehen.
 *
 * Bewusst unberührt bleiben Felder, die Provenienz sind und nie transformiert werden:
 * `sourceCitation` auf Norm- und Fassungsebene, `originEnactingBody`, `sourceReferences`,
 * `sourceNotes`, `externalIdentifiers` (mit der BayRS-Nummer), Fußnotenblöcke sowie der
 * Änderungshinweis `changeNote`. Sie tragen die reale Herkunft und müssen sie tragen – der
 * Änderungshinweis nennt das Quellland ausdrücklich („übernommener Rechtsstand des Freistaates
 * Bayern“), eine Prüfung dort meldete jede korrekte Fassung.
 */
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';
import type { NormBodyBlock, NormRecord } from '@landesrecht/legal-core/lib/schema.ts';

import {
  isCompoundProperName, DOUBLED_TARGET_NAME, SOURCE_STATE_REFERENCE } from './detection.ts';
import { BAY_ABBREVIATION, findProtectedSpans } from './rules.ts';

export interface RecordAuditField {
  path: string;
  text: string;
}

/** Sammelt die Textfelder, die die Transformation verändert – und nur diese. */
export function auditableFields(record: NormRecord): RecordAuditField[] {
  const fields: RecordAuditField[] = [];
  const push = (path: string, value: string | undefined): void => {
    if (typeof value === 'string' && value.length > 0) fields.push({ path, text: value });
  };
  push('meta.title', record.meta.title);
  push('meta.shortTitle', record.meta.shortTitle);
  push('meta.abbr', record.meta.abbr);
  push('meta.enactingBody', record.meta.enactingBody);
  push('meta.responsibleBody', record.meta.responsibleBody);
  push('meta.summary', record.meta.summary);
  push('meta.initialCitation', record.meta.initialCitation);
  for (const subject of record.meta.subjects) push('meta.subjects', subject);
  for (const keyword of record.meta.keywords) push('meta.keywords', keyword);
  record.versions.forEach((version, index) => {
    const base = `versions[${index}]`;
    push(`${base}.title`, version.title);
    push(`${base}.shortTitle`, version.shortTitle);
    push(`${base}.abbr`, version.abbr);
    push(`${base}.summary`, version.summary);
    push(`${base}.citation`, version.citation);
    collectBody(version.body, `${base}.body`, fields);
  });
  return fields;
}

function collectBody(blocks: NormBodyBlock[], path: string, fields: RecordAuditField[]): void {
  blocks.forEach((block, index) => {
    const blockPath = `${path}[${index}]`;
    // Fußnoten sind Quellhinweise und bleiben unverändert (gleiche Regel wie in der Transformation).
    if (block.type === 'footnote') return;
    for (const key of ['label', 'title', 'text'] as const) {
      const value = block[key];
      if (typeof value === 'string' && value.length > 0) fields.push({ path: `${blockPath}.${key}`, text: value });
    }
    if (block.children) collectBody(block.children, `${blockPath}.children`, fields);
  });
}

function contextOf(value: string, start: number, end: number): string {
  return value.slice(Math.max(0, start - 40), Math.min(value.length, end + 40)).replace(/\s+/gu, ' ').trim();
}

/** Amtliche Abkürzung mit dem Landeszusatz „Bay“ – hier nicht entscheidbar (siehe unten). */
const BAY_ABBREVIATION_EXACT = new RegExp(String.raw`^(?:${BAY_ABBREVIATION})$`, 'u');

/**
 * Meldet verbliebene Quellbezeichnungen und Doppelbildungen.
 *
 * Drei Klassen, nach dem, was an der fertigen Norm allein entscheidbar ist:
 *
 * - Eine Fundstelle innerhalb eines Schutzmusters (GVBl., BayRS-Nummer, Bayerische Rechtssammlung,
 *   Landschaftsname) ist erklärt und wird als `info` gezählt, damit sie im Bericht sichtbar bleibt,
 *   ohne einen Fehler auszulösen.
 * - Eine **ausgeschriebene** Landesbezeichnung („Bayern“, „bayerisch…“) außerhalb eines
 *   Schutzmusters ist ein Fehler. Die Regeln ersetzen sie ausnahmslos; bleibt sie stehen, ist die
 *   Überleitung defekt.
 * - Eine **Abkürzung mit „Bay“** ist hier nicht entscheidbar. Sie kann zu einer amtlichen
 *   Kurzbezeichnung gehören („BayBO“, „BayHO“), die nach der Grundsatzentscheidung bewusst
 *   unverändert bleibt und in der Transformation als `manual-review` erfasst ist – oder ein echter
 *   Rest sein. Welches von beidem, steht im Transformationsbericht (`report.unresolved`), nicht in
 *   der Norm. Deshalb `warning` mit ausdrücklichem Verweis darauf, nicht `error` und nicht
 *   stillschweigendes Übergehen. Gezählt wird gebündelt: Praktisch jede bayerische Abkürzung beginnt
 *   mit „Bay“, eine Meldung je Vorkommen machte den Bericht unlesbar.
 *
 * Jede Doppelbildung ist ein Fehler; sie kann nur aus einer fehlerhaften Regel stammen.
 */
export function auditRecord(record: NormRecord): ImportFinding[] {
  const findings: ImportFinding[] = [];
  let protectedResiduals = 0;
  const abbreviations: Array<{ path: string; term: string; context: string }> = [];
  const properNames: Array<{ path: string; term: string; context: string }> = [];
  for (const field of auditableFields(record)) {
    const { spans } = findProtectedSpans(field.text);
    for (const match of field.text.matchAll(new RegExp(SOURCE_STATE_REFERENCE.source, SOURCE_STATE_REFERENCE.flags))) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (spans.some((span) => span.start <= start && span.end >= end)) {
        protectedResiduals += 1;
        continue;
      }
      if (BAY_ABBREVIATION_EXACT.test(match[0])) {
        abbreviations.push({ path: field.path, term: match[0], context: contextOf(field.text, start, end) });
        continue;
      }
      if (isCompoundProperName(match[0])) {
        // „BayernLabo“, „BayernPortal“, „Bayernhymne“: Marken, Einrichtungen und Werke, keine
        // Bezeichnung des Landes. Die Überleitungsregel verlangt hinter dem Landesnamen eine
        // Wortgrenze und fasst sie deshalb nicht an – sie hier als Defekt zu melden hieße, genau
        // das zum Fehler zu erklären, was die Regel richtig verschont.
        properNames.push({ path: field.path, term: match[0], context: contextOf(field.text, start, end) });
        continue;
      }
      findings.push({
        severity: 'error',
        code: 'residual-source-state-reference',
        message: `${field.path}: „${match[0]}“ blieb unverändert stehen (Kontext: „${contextOf(field.text, start, end)}“)`,
      });
    }
    for (const match of field.text.matchAll(new RegExp(DOUBLED_TARGET_NAME.source, DOUBLED_TARGET_NAME.flags))) {
      const start = match.index ?? 0;
      findings.push({
        severity: 'error',
        code: 'doubled-target-name',
        message: `${field.path}: Doppelbildung „${match[0]}“ (Kontext: „${contextOf(field.text, start, start + match[0].length)}“)`,
      });
    }
  }
  if (properNames.length > 0) {
    const distinct = [...new Set(properNames.map((entry) => entry.term))];
    findings.push({
      severity: 'info',
      code: 'compound-proper-name',
      message: `${properNames.length} zusammengesetzte(r) Eigenname(n) mit dem Landesnamen bleiben unverändert (${distinct.slice(0, 8).join(', ')}${distinct.length > 8 ? ', …' : ''}); eine Überleitung wäre eine Entscheidung der Institutionen-Zuordnung`,
    });
  }

  if (abbreviations.length > 0) {
    const distinct = [...new Set(abbreviations.map((entry) => entry.term))];
    findings.push({
      severity: 'warning',
      code: 'undecidable-source-state-abbreviation',
      message:
        `${abbreviations.length} Abkürzung(en) mit dem Landeszusatz „Bay“ stehen außerhalb eines Schutzmusters ` +
        `(${distinct.slice(0, 5).join(', ')}${distinct.length > 5 ? `, …${distinct.length - 5} weitere` : ''}); ` +
        `ob sie zu einer amtlichen Kurzbezeichnung gehören, entscheidet der Transformationsbericht (unresolved), nicht die fertige Norm ` +
        `(erstes Vorkommen ${abbreviations[0]!.path}: „${abbreviations[0]!.context}“)`,
    });
  }
  if (protectedResiduals > 0) {
    findings.push({
      severity: 'info',
      code: 'protected-source-state-reference',
      message: `${protectedResiduals} Nennung(en) des Quelllandes stehen in geschützten Bereichen (Quellzitat, Fundstelle oder fremder Eigenname) und bleiben bewusst erhalten`,
    });
  }
  return findings;
}
