/**
 * Scope-Entscheidungen für BAYERN.RECHT.
 *
 * Grundlage ist `docs/LEGAL_SCOPE.md`, Abschnitt „Entschiedene Scope-Fragen für BAYERN.RECHT“. Die
 * Entscheidungen sind redaktionell getroffen worden; dieses Modul vollzieht sie, es trifft keine.
 *
 * Warum eine **eigene** Datei und kein Feld in der Enumeration: Die Enumeration trägt einen
 * Fixpunkt-Fingerabdruck über ihren fachlichen Inhalt. Eine Scope-Entscheidung ist keine Eigenschaft
 * der Quelle, sondern eine des Projekts – sie kann sich ändern, ohne dass die Quelle sich ändert.
 * Beides in einer Datei zu führen hieße, den Fingerabdruck der Quelle bei jeder redaktionellen
 * Entscheidung zu brechen.
 */
import type { EnumerationItem } from '../enumerate/enumeration.ts';

export const SCOPE_SCHEMA = 'bayernrecht-scope/1' as const;

export const SCOPE_DECISIONS = ['include', 'exclude', 'review'] as const;
export type ScopeDecision = (typeof SCOPE_DECISIONS)[number];

/**
 * Maschinenlesbare Gründe. Sie erscheinen wörtlich im Manifest, in der Coverage und im
 * Abschlussbericht – deshalb sind es feste Kennungen und keine Sätze.
 */
export const SCOPE_REASONS = [
  'collective-agreement-out-of-landesrecht-scope',
  'federal-uniform-order-not-independent-state-law',
  'state-law-in-scope',
  'normativity-review-required',
  'document-class-unexplained',
  'published-without-register-entry',
  'annex-to-another-norm',
] as const;
export type ScopeReason = (typeof SCOPE_REASONS)[number];

/** Klartext je Grund – für Berichte, nicht für Entscheidungen. */
export const SCOPE_REASON_LABELS: Readonly<Record<ScopeReason, string>> = {
  'collective-agreement-out-of-landesrecht-scope':
    'Tarifvertrag: kollektivrechtliche Vereinbarung der Tarifvertragsparteien, keine Rechtsvorschrift des Freistaats',
  'federal-uniform-order-not-independent-state-law':
    'Bundeseinheitlich vereinbarte Anordnung: im Bundesanzeiger bekannt gemacht, kein eigenständiges Landesrecht',
  'state-law-in-scope': 'Landesrecht des Freistaats im Sinne von docs/LEGAL_SCOPE.md',
  'normativity-review-required': 'Vorschriftencharakter nicht eindeutig; Einzelentscheidung erforderlich',
  'document-class-unexplained': 'Dokumentklasse noch nicht eingeordnet',
  'published-without-register-entry':
    'Amtlich verkündete Vorschrift des Freistaats, die der Fortführungsnachweis nicht führt; die Registerlücke ist eine Geltungs-, keine Umfangsfrage',
  'annex-to-another-norm': 'Anhang einer anderen bayerischen Vorschrift, im Portal als eigenes Dokument geführt',
};

export interface ScopeEntry {
  documentId: string;
  sourceArea: string;
  normType: string;
  title: string;
  decision: ScopeDecision;
  reason: ScopeReason;
  /** Woran die Entscheidung hängt – Gruppenkennung der Abdeckungslücke, XML-Merkmal, Einzelbeleg. */
  evidence: string[];
  /**
   * Nur bei `federal-uniform-order-not-independent-state-law`: Die Ausnahme nach
   * `docs/LEGAL_SCOPE.md` verlangt den Beleg eines bayerischen Rechtsakts. Fehlt er, bleibt es beim
   * Ausschluss; liegt er vor, ist die Entscheidung eine Einzelprüfung.
   */
  exceptionEvidence?: string[];
  /** Siehe `ScopeOverride.registerAbsent`. */
  registerAbsent?: boolean;
  /** Siehe `ScopeOverride.relatedDocumentId`. */
  relatedDocumentId?: string;
}

/** Gruppenkennungen der Abdeckungslücke, die unmittelbar zu einer Entscheidung führen. */
export const GAP_GROUP_REASONS: Readonly<Record<string, ScopeReason>> = {
  tarifvertrag: 'collective-agreement-out-of-landesrecht-scope',
  'bundeseinheitliche-anordnung': 'federal-uniform-order-not-independent-state-law',
};

/** `@doktyp`-Werte, die das Dokument selbst als außerhalb des Bestands ausweisen. */
export const OUT_OF_SCOPE_DOCUMENT_TYPES: Readonly<Record<string, ScopeReason>> = {
  tarifvertrag: 'collective-agreement-out-of-landesrecht-scope',
};

/**
 * Einzeln geprüfte Dokumente.
 *
 * Diese Einträge entstehen **nicht** aus einer Regel, sondern aus der Ansicht des jeweiligen
 * Dokuments: Paket geladen, XML gelesen, Verkündungsorgan und Erlassbehörde festgestellt. Sie gehen
 * jeder Gruppenzuordnung vor, weil eine Gruppenzuordnung eine Herleitung ist und ein Einzelbefund
 * eine Feststellung.
 */
export interface ScopeOverride {
  documentId: string;
  decision: ScopeDecision;
  reason: ScopeReason;
  evidence: string[];
  /**
   * Der Fortführungsnachweis führt das Dokument nicht. Das ist ein Hinweis auf die **Geltung**, nicht
   * auf den Umfang: Das Register verzeichnet die geltenden Vorschriften. Die Stichtagsprüfung muss
   * das auflösen; der Scope tut es nicht.
   */
  registerAbsent?: boolean;
  /** Andere Vorschrift, auf die sich der Befund bezieht (Stammnorm eines Anhangs). */
  relatedDocumentId?: string;
}

export interface ClassifyInput {
  item: EnumerationItem;
  sourceArea: string;
  /** Einzelbefund aus der Handprüfung; geht jeder Gruppenzuordnung vor. */
  override?: ScopeOverride;
  /** Gruppenkennung aus `enumeration-gap.json`, falls der Eintrag dort geführt wird. */
  gapGroup?: string;
  /** `@doktyp` aus dem XML-Export, sobald das Paket vorliegt. */
  documentType?: string;
  /** Beleg eines bayerischen Rechtsakts für die Ausnahme nach docs/LEGAL_SCOPE.md. */
  exceptionEvidence?: string[];
}

/**
 * Entscheidet für einen enumerierten Eintrag.
 *
 * Reihenfolge ist bindend: Das **Dokument selbst** schlägt die Gruppenzuordnung der
 * Abdeckungslücke, weil `@doktyp` eine Eigenschaft der Quelle ist und die Gruppenzuordnung eine
 * Herleitung aus dem Fehlen im Fortführungsnachweis. Erst danach greifen die Gruppen.
 */
export function classifyScope(input: ClassifyInput): ScopeEntry {
  const { item, sourceArea } = input;
  const base = { documentId: item.documentId, sourceArea, normType: item.normType, title: item.title };

  if (input.override) {
    const { decision, reason, evidence, registerAbsent, relatedDocumentId } = input.override;
    return {
      ...base,
      decision,
      reason,
      evidence,
      ...(registerAbsent ? { registerAbsent: true } : {}),
      ...(relatedDocumentId ? { relatedDocumentId } : {}),
    };
  }

  const byDocumentType = input.documentType ? OUT_OF_SCOPE_DOCUMENT_TYPES[input.documentType] : undefined;
  if (byDocumentType) {
    return { ...base, decision: 'exclude', reason: byDocumentType, evidence: [`xml:@doktyp=${input.documentType}`] };
  }

  const byGap = input.gapGroup ? GAP_GROUP_REASONS[input.gapGroup] : undefined;
  if (byGap === 'federal-uniform-order-not-independent-state-law') {
    const exception = input.exceptionEvidence ?? [];
    if (exception.length > 0) {
      // Die Ausnahme ist kein Automatismus: Sie behauptet eine landesrechtliche Identität und
      // gehört deshalb vor die redaktionelle Entscheidung, nicht in den Bestand.
      return { ...base, decision: 'review', reason: 'normativity-review-required', evidence: [`gap-group:${input.gapGroup}`], exceptionEvidence: exception };
    }
    return { ...base, decision: 'exclude', reason: byGap, evidence: [`gap-group:${input.gapGroup}`] };
  }
  if (byGap) {
    return { ...base, decision: 'exclude', reason: byGap, evidence: [`gap-group:${input.gapGroup}`] };
  }

  if (input.gapGroup === 'ungeklaert') {
    return { ...base, decision: 'review', reason: 'document-class-unexplained', evidence: [`gap-group:${input.gapGroup}`] };
  }

  return { ...base, decision: 'include', reason: 'state-law-in-scope', evidence: [`enumeration:${item.normTypeSource}`] };
}
