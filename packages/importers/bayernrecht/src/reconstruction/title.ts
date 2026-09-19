/**
 * Überschrift der Norm als Gegenstand eines Änderungsbefehls („Der Überschrift wird die Angabe „(ArchivGlV)“ angefügt.“,
 * „In der Überschrift werden die Wörter „und Forsten“ durch … ersetzt.“).
 *
 * Die Verkündung meint mit der Überschrift der Norm die Titelzeile samt Abkürzungszeile: „Verordnung über die Gliederung
 * der Staatlichen Archive Bayerns (ArchivGlV)“. Das Portal führt sie getrennt: die Titelzeile als `title` des Kopfes,
 * die Abkürzungszeile „(ArchivGlV)“ als erste Zeile des Kopfblocks im Körper, die Abkürzung und Kurzbezeichnung als
 * `abbr`/`shortTitle`. Ein Titelschritt arbeitet auf der zusammengesetzten Überschrift; danach wird sie wieder auf diese
 * Felder verteilt (`projectTitle`) – nur dort, wo die Verteilung eindeutig ist, sonst scheitert der Schritt.
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import type { FieldRef } from './location.ts';

/** Überschrift der Norm, auf die Felder des Portals verteilt. */
export interface RecipeTitle {
  title: string;
  shortTitle?: string;
  abbr?: string;
  /** Erste Zeile des Kopfblocks im Körper, wenn sie die Abkürzungszeile der Überschrift ist („(ArchivGlV)“). */
  headingLine?: string;
}

/** Die Norm, soweit ein Rezept sie berührt (Teil von `SourceLaw`). */
export interface LawTitleFields {
  title: string;
  shortTitle?: string;
  abbr?: string;
  body: NormBodyBlock[];
}

export class TitleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'TitleError';
  }
}

/** Feld der Überschrift im synthetischen Titelkörper (`titleBody`). */
export const TITLE_FIELD: FieldRef = { path: [0], key: 'text' };

/** Ist die erste Zeile des Kopfblocks die Abkürzungszeile dieser Norm? Nur mit Bezug auf Abkürzung oder Kurzbezeichnung. */
function abbreviationLine(body: readonly NormBodyBlock[], abbr: string | undefined, shortTitle: string | undefined): string | undefined {
  const head = body[0];
  if (!head || head.type !== 'heading' || typeof head.text !== 'string') return undefined;
  const line = head.text.split('\n')[0]!.trim();
  if (!/^\([^()\n]+\)$/u.test(line)) return undefined;
  const inner = line.slice(1, -1);
  if (abbr && (inner === abbr || inner.endsWith(` – ${abbr}`) || inner.endsWith(` - ${abbr}`))) return line;
  if (shortTitle && (inner === shortTitle || inner.startsWith(`${shortTitle} – `))) return line;
  return undefined;
}

/** Überschrift-Zustand einer Norm (heute: aus dem geparsten Paket). */
export function titleState(law: { title: string; shortTitle?: string; abbr?: string; body: readonly NormBodyBlock[] }): RecipeTitle {
  const headingLine = abbreviationLine(law.body, law.abbr, law.shortTitle);
  return {
    title: law.title,
    ...(law.shortTitle !== undefined ? { shortTitle: law.shortTitle } : {}),
    ...(law.abbr !== undefined ? { abbr: law.abbr } : {}),
    ...(headingLine !== undefined ? { headingLine } : {}),
  };
}

/** Die Überschrift, wie die Verkündung sie nennt. */
export const titleText = (state: RecipeTitle): string => (state.headingLine ? `${state.title} ${state.headingLine}` : state.title);

/** Synthetischer Körper mit der Überschrift als einzigem Textfeld – dort wirken die Wortlautoperationen eines Titelschritts. */
export const titleBody = (state: RecipeTitle): NormBodyBlock[] => [{ type: 'heading', text: titleText(state) }];

/**
 * Verteilt eine geänderte Überschrift wieder auf die Felder, ausgehend vom bisherigen Zustand. Eindeutig sind: eine
 * Änderung nur in der Titelzeile; das Anfügen oder Entfernen genau der Abkürzungszeile „(ABK)“ einer Norm ohne
 * Kurzbezeichnung. Alles andere scheitert.
 */
export function projectTitle(previous: RecipeTitle, heading: string): RecipeTitle {
  if (heading === titleText(previous)) return previous;
  if (previous.headingLine) {
    if (heading.endsWith(` ${previous.headingLine}`) && heading.length > previous.headingLine.length + 1) {
      return { ...previous, title: heading.slice(0, -(previous.headingLine.length + 1)) };
    }
    if (heading === previous.title) {
      if (previous.shortTitle === undefined && previous.abbr !== undefined && previous.headingLine === `(${previous.abbr})`) {
        return { title: previous.title };
      }
      throw new TitleError('title-projection', `Abkürzungszeile ${previous.headingLine} entfällt, ist aber Kurzbezeichnung und Abkürzung nicht eindeutig zuzuordnen`);
    }
    throw new TitleError('title-projection', `Geänderte Überschrift „${heading.slice(0, 120)}“ lässt sich nicht eindeutig auf Titel und Abkürzungszeile ${previous.headingLine} verteilen`);
  }
  const appended = /^(.+) \(([^()\n]+)\)$/u.exec(heading);
  if (appended && appended[1] === previous.title) {
    if (previous.abbr !== undefined || previous.shortTitle !== undefined || /\s–\s|\s-\s/u.test(appended[2]!)) throw new TitleError('title-projection', `Angefügte Abkürzungszeile (${appended[2]}) neben vorhandener Abkürzung oder Kurzbezeichnung`);
    return { title: previous.title, abbr: appended[2]!, headingLine: `(${appended[2]})` };
  }
  if (/\)$/u.test(heading)) throw new TitleError('title-projection', `Geänderte Überschrift „${heading.slice(0, 120)}“ endet auf eine Klammer: Titel und Abkürzungszeile nicht eindeutig getrennt`);
  return { ...previous, title: heading };
}

/** Überträgt eine geänderte Abkürzungszeile in den Kopfblock des Körpers (Kopie). */
export function applyTitleToBody(body: readonly NormBodyBlock[], previous: RecipeTitle, next: RecipeTitle): NormBodyBlock[] {
  if (previous.headingLine === next.headingLine) return body as NormBodyBlock[];
  const copy = structuredClone(body) as NormBodyBlock[];
  const head = copy[0];
  if (!head || head.type !== 'heading' || typeof head.text !== 'string') throw new TitleError('title-heading-missing', 'Kein Kopfblock für die Abkürzungszeile');
  const lines = head.text.split('\n');
  if (previous.headingLine !== undefined) {
    if (lines[0]!.trim() !== previous.headingLine) throw new TitleError('title-heading-mismatch', `Erste Zeile des Kopfblocks ist nicht ${previous.headingLine}`);
    if (next.headingLine === undefined) {
      if (lines.length < 2) throw new TitleError('title-heading-mismatch', 'Kopfblock bestünde nur aus der Abkürzungszeile');
      lines.shift();
    } else lines[0] = next.headingLine;
  } else if (next.headingLine !== undefined) lines.unshift(next.headingLine);
  head.text = lines.join('\n');
  return copy;
}

/** Gleichheit zweier Überschrift-Zustände (Feld für Feld). */
export const sameTitle = (left: RecipeTitle, right: RecipeTitle): boolean =>
  left.title === right.title && left.shortTitle === right.shortTitle && left.abbr === right.abbr && left.headingLine === right.headingLine;
