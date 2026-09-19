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
 * `sourceNotes`, Fußnotenblöcke sowie der Änderungshinweis `changeNote`. Sie tragen die reale
 * Herkunft und müssen sie tragen – der Änderungshinweis nennt das Quellland ausdrücklich
 * („übernommener Rechtsstand des Landes …“), eine Prüfung dort meldete jede korrekte Fassung.
 */
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';
import type { NormBodyBlock, NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import { DOUBLED_TARGET_NAME, SOURCE_STATE_REFERENCE } from './detection.ts';
import { findProtectedSpans } from './rules.ts';

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

/**
 * Übergeleitete historische Bezeichnung: Die preußische „Provinz Schleswig-Holstein“ ist ein Schutzmuster und darf
 * nie als „Provinz Niedersachsen-Holstein“ erscheinen (Regel wie BayWü).
 */
export const HISTORICAL_NAME_TRANSFORMED = /\b(?:Provinz(?:en)?|Provinzial(?:verband|landtag|verwaltung)\p{L}*|Herzogt(?:um|ums|ümer))\s+(?:der\s+|des\s+)?Niedersachsen-Holstein/gu;

/** Bloßes Landeskürzel ohne umgebende Bezeichnung (z. B. das „SH“ in „LVwG SH“). */
const BARE_ABBREVIATION = /^SH$/u;

/**
 * Meldet verbliebene Quellbezeichnungen und Doppelbildungen.
 *
 * Drei Klassen, nach dem, was an der fertigen Norm allein entscheidbar ist:
 *
 * - Eine Fundstelle innerhalb eines Schutzmusters (Quellzitat, fremder Eigenname) ist erklärt und
 *   wird als `info` gezählt, damit sie im Bericht sichtbar bleibt, ohne einen Fehler auszulösen.
 * - Eine **ausgeschriebene** Landesbezeichnung außerhalb eines Schutzmusters ist ein Fehler. Die
 *   Regeln ersetzen sie ausnahmslos; bleibt sie stehen, ist die Überleitung defekt.
 * - Ein **bloßes Kürzel** „SH“ ist hier nicht entscheidbar. Es kann zu einer amtlichen Abkürzung
 *   gehören („LVwG SH“), die bewusst unverändert bleibt und in der Transformation als
 *   `manual-review` erfasst ist – oder ein echter Rest sein. Welches von beidem, steht im
 *   Transformationsbericht (`report.unresolved`), nicht in der Norm. Deshalb `warning` mit
 *   ausdrücklichem Verweis darauf, nicht `error` und nicht stillschweigendes Übergehen.
 *
 * Jede Doppelbildung ist ein Fehler; sie kann nur aus einer fehlerhaften Regel stammen.
 */
export function auditRecord(record: NormRecord): ImportFinding[] {
  const findings: ImportFinding[] = [];
  let protectedResiduals = 0;
  for (const field of auditableFields(record)) {
    const { spans } = findProtectedSpans(field.text);
    for (const match of field.text.matchAll(new RegExp(SOURCE_STATE_REFERENCE.source, SOURCE_STATE_REFERENCE.flags))) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (spans.some((span) => span.start <= start && span.end >= end)) {
        protectedResiduals += 1;
        continue;
      }
      if (BARE_ABBREVIATION.test(match[0])) {
        findings.push({
          severity: 'warning',
          code: 'undecidable-source-state-abbreviation',
          message: `${field.path}: Kürzel „${match[0]}“ steht außerhalb eines Schutzmusters; ob es zu einer amtlichen Abkürzung gehört, entscheidet der Transformationsbericht (unresolved), nicht die fertige Norm (Kontext: „${contextOf(field.text, start, end)}“)`,
        });
        continue;
      }
      findings.push({
        severity: 'error',
        code: 'residual-source-state-reference',
        message: `${field.path}: „${match[0]}“ blieb unverändert stehen (Kontext: „${contextOf(field.text, start, end)}“)`,
      });
    }
    for (const match of field.text.matchAll(new RegExp(HISTORICAL_NAME_TRANSFORMED.source, HISTORICAL_NAME_TRANSFORMED.flags))) {
      const start = match.index ?? 0;
      findings.push({ severity: 'error', code: 'historical-name-transformed', message: `${field.path}: historische Bezeichnung übergeleitet „${match[0]}“ (Kontext: „${contextOf(field.text, start, start + match[0].length)}“)` });
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
  if (protectedResiduals > 0) {
    findings.push({
      severity: 'info',
      code: 'protected-source-state-reference',
      message: `${protectedResiduals} Nennung(en) des Quelllandes stehen in geschützten Bereichen (Quellzitat oder fremder Eigenname) und bleiben bewusst erhalten`,
    });
  }
  return findings;
}
