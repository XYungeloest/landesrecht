/**
 * Staatsverträge und Zustimmungsgesetze (docs/LEGAL_SCOPE.md, Abschnitt Staatsverträge).
 *
 * Ein Zustimmungsgesetz wird nur bei zwei unabhängigen Belegen als `zustimmungsgesetz` geführt:
 *   1. Titel „Gesetz zu dem/zum …staatsvertrag/Abkommen/Vertrag …“ (bzw. „über die Zustimmung zu …“)
 *   2. Zustimmungsformel im Normtext („Dem … Staatsvertrag … wird zugestimmt“)
 * Nur ein Beleg → Typ bleibt `gesetz`, Hinweis im Report. Der Vertragstext gehört als Anlage zum Gesetz
 * (HTML → Anlage im Normkörper; PDF → Attachment-Workflow). Bekanntmachungen über das Inkrafttreten
 * (`lrgv/bekanntmachung`) sind Evidenzquellen, keine eigenen Normen.
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

export interface ConsentLawDetection {
  detected: boolean;
  /** Nur ein Beleg (Titel oder Formel). */
  partial: boolean;
  treatyTitle?: string;
  treatyTextLocation: 'html-annex' | 'pdf-attachment' | 'inline' | 'unknown';
  evidence: string[];
}

const TREATY_NOUN = '(?:Staatsvertrag(?:es|s)?|Staatsverträge[n]?|Abkommen[s]?|Vertrag(?:es|s)?|Verwaltungsabkommen[s]?|Übereinkommen[s]?|Vereinbarung)';
const TITLE = new RegExp(`^Gesetz\\s+(?:zu\\s+dem|zum|zur|über\\s+die\\s+Zustimmung\\s+(?:zu\\s+dem|zum|zur))\\s+((?:[^(]*?\\s)?${TREATY_NOUN}\\b.*?)(?:\\s*\\(|$)`, 'u');
const CONSENT = new RegExp(`\\b(?:Dem|Der|Den)\\s+(?:[^.]{0,400}?)${TREATY_NOUN}\\b[^.]{0,400}?\\bwird\\s+(?:hiermit\\s+)?zugestimmt\\b`, 'u');

function texts(blocks: readonly NormBodyBlock[], limit = 40): string[] {
  const output: string[] = [];
  const visit = (entries: readonly NormBodyBlock[]): void => {
    for (const block of entries) {
      if (output.length >= limit) return;
      if (block.text) output.push(block.text);
      if (block.children) visit(block.children);
    }
  };
  visit(blocks);
  return output;
}

export function detectConsentLaw(input: { title: string; blocks: readonly NormBodyBlock[]; attachments: ReadonlyArray<{ label: string; mediaType: string }> }): ConsentLawDetection {
  const evidence: string[] = [];
  const title = input.title.replace(/\s+/gu, ' ').trim();
  const titleMatch = TITLE.exec(title);
  if (titleMatch) evidence.push(`Titel: „${title}“`);
  const consent = texts(input.blocks).map((text) => text.replace(/\s+/gu, ' ')).find((text) => CONSENT.test(text));
  if (consent) evidence.push(`Zustimmungsformel: „${CONSENT.exec(consent)![0].slice(0, 240)}“`);
  const htmlAnnex = input.blocks.some((block) => block.type === 'annex' && new RegExp(TREATY_NOUN, 'u').test(`${block.label ?? ''} ${block.title ?? ''}`));
  const pdfAnnex = input.attachments.some((attachment) => /pdf/iu.test(attachment.mediaType) && (new RegExp(TREATY_NOUN, 'u').test(attachment.label) || /Anlage/u.test(attachment.label)));
  const inline = input.blocks.some((block) => (block.type === 'article' || block.type === 'paragraph') && /Präambel|Vertragsparteien|Die\s+Länder/u.test(texts([block], 5).join(' ')));
  const treatyTextLocation: ConsentLawDetection['treatyTextLocation'] = htmlAnnex ? 'html-annex' : pdfAnnex ? 'pdf-attachment' : inline ? 'inline' : 'unknown';
  const detection: ConsentLawDetection = { detected: Boolean(titleMatch && consent), partial: Boolean(titleMatch) !== Boolean(consent), treatyTextLocation, evidence };
  if (titleMatch) detection.treatyTitle = titleMatch[1]!.trim();
  return detection;
}

/** Titel einer Bekanntmachung über das Inkrafttreten eines Staatsvertrags (Evidenzquelle, keine Norm). */
export function parseTreatyInForceNotice(title: string): { treatyTitle: string } | undefined {
  const match = new RegExp(`^Bekanntmachung\\s+(?:über\\s+)?(?:des|das|die)\\s+Inkrafttreten[s]?\\s+(?:des|der|von)\\s+(.*${TREATY_NOUN}.*)$`, 'u').exec(title.replace(/\s+/gu, ' ').trim());
  return match ? { treatyTitle: match[1]!.trim() } : undefined;
}
