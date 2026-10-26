/** Konservative automatische Lesehilfe, ausdrücklich keine zitierfähigen Satzadressen. */
import { getMarkingTargets } from './markings.ts';
import type { AnchorMap } from './body.ts';
import type { NormBodyBlock } from './schema.ts';
export interface SentenceStart { offset: number; number: number }
const ABBREVIATIONS = /\b(?:Abs|Nr|Art|S|Buchst|Bst|lit|vgl|bzw|usw|etc|ca|ggf|ggfs|evtl|insb|zzgl|bzgl|Ziff|Abb|Aufl|Jan|Feb|Apr|Aug|Sept|Okt|Nov|Dez|Dr|Prof|ff|f|gem|einschl|ausschl|zzt|GVBl|BGBl|GBl|SächsGVBl|Bek|VO)\./giu;
const MONTH = /^(?:(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b|(?:Jan|Feb|Apr|Jun|Jul|Aug|Sep|Sept|Okt|Nov|Dez)\.)/u;
/** Offsets beziehen sich auf unveränderte UTF-16-Textzeichen, niemals auf visuelle Zeilen. */
export function sentenceStarts(text: string): number[] | undefined {
  if (!text.trim() || /\.\.\.|…/u.test(text) || text.length > 50000 || /[„“»«"'‚‘’¹²³⁰⁴⁵⁶⁷⁸⁹]/u.test(text) || /^\s*\d+(?:\.\d+)*(?:[.)]|\s+\p{Lu}|\p{Lu})/mu.test(text)) return undefined;
  const protectedDots = new Set<number>();
  for(const match of text.matchAll(/\b\d{1,2}\.\s*\d{1,2}\.\s*\d{4}\b/gu))for(let i=0;i<match[0].length;i++)if(match[0][i]==='.')protectedDots.add(match.index+i);
  for (const match of text.matchAll(/\b(?:z\.\s*B\.|u\.\s*a\.|d\.\s*h\.|i\.\s*V\.\s*m\.|u\.\s*U\.)/giu)) {
    for (let i=0;i<match[0].length;i++) if(match[0][i]==='.') protectedDots.add(match.index+i);
  }
  for (const match of text.matchAll(/\b(?:e\.\s*V\.|e\.\s*G\.|a\.\s*F\.|n\.\s*F\.)/giu)) {
    if(/^\p{Lu}/u.test(text.slice(match.index+match[0].length).trimStart()))return undefined;
    for(let i=0;i<match[0].length;i++)if(match[0][i]==='.')protectedDots.add(match.index+i);
  }
  for (const match of text.matchAll(ABBREVIATIONS)) {
    const dot=match.index+match[0].length-1;
    const next=text.slice(dot+1).trimStart();
    // „usw. Danach …“ kann eine echte Satzgrenze sein. Keine geratene Fortzählung.
    if (next && /^\p{Lu}/u.test(next) && (!/^(?:Dr|Prof)\.$/iu.test(match[0])||/^(?:Die|Der|Das|Sie|Er|Es|Danach|Dann|Diese|Dies)\b/u.test(next)) && !/^(?:S\.|Nr\.|Abs\.|[IVX]+\b)/u.test(next)) return undefined;
    protectedDots.add(dot);
  }
  const starts=[text.search(/\S/u)];
  const brackets:string[]=[];
  for(let i=0;i<text.length;i++) {
    const char=text[i]!;
    if(char==='('||char==='['){brackets.push(char);continue;}
    if(char===')'||char===']'){if(brackets.pop()!==(char===')'?'(':'['))return undefined;continue;}
    if(!'.!?'.includes(char))continue;
    if(char==='.' && (protectedDots.has(i) || (/\d/u.test(text[i-1]??'') && (/\d/u.test(text[i+1]??'') || MONTH.test(text.slice(i+1).trimStart()) || /^(?:Abschnitt|Kapitel|Teil|Satz|Buch)\b/u.test(text.slice(i+1).trimStart())))))continue;
    if(char==='.' && /\d/u.test(text[i-1]??'') && text.slice(i+1).trim() && !/\d+[.,]\d+$/u.test(text.slice(0,i)))return undefined;
    if(char==='.' && text[i+1] && !/\s/u.test(text[i+1]!) && !') ]'.includes(text[i+1]!)) continue;
    if(brackets.length) return undefined;
    const token=text.slice(0,i).match(/[\p{L}]+$/u)?.[0]??'';
    if(char==='.' && (token.length===1 || /\p{Lu}.*\p{Lu}/u.test(token))) return undefined;
    let next=i+1;while(next<text.length&&/\s/u.test(text[next]!))next++;
    if(next===text.length)continue;
    if(!/^[\p{Lu}\d§]/u.test(text.slice(next)))return undefined;
    starts.push(next);
  }
  if(brackets.length || !/[.!?]\s*$/u.test(text))return undefined;
  return starts;
}
export function buildSentencePlan(body: readonly NormBodyBlock[], anchors: AnchorMap): Map<string,SentenceStart[]> {
  const result=new Map<string,SentenceStart[]>();
  for(const target of getMarkingTargets(body,anchors)) {
    let siblings=body,block:NormBodyBlock|undefined;
    for(const part of target.path.split('.').map(Number)){block=siblings[part];siblings=block?.children??[];}
    if(!block)continue;
    if(!target.subsection && (block.children??[]).some(child=>child.type==='subparagraph'||(child.type==='paragraphText'&&child.label)))continue;
    const leaves:Array<{path:string;text:string}>=[];
    function plain(entry:NormBodyBlock,path:string):boolean {
      if(entry.text)leaves.push({path,text:entry.text});
      return (entry.children??[]).every((child,index)=>child.type==='footnote'||(child.type==='paragraphText'&&!child.label&&plain(child,`${path}.${index}`)));
    }
    if(!plain(block,target.path)||!leaves.length)continue;
    const joined=leaves.map(leaf=>leaf.text).join('\n');
    const starts=sentenceStarts(joined);
    if(!starts||starts.length<2||starts.length>999)continue;
    let base=0;
    for(const leaf of leaves) {
      const own=starts.map((offset,index)=>({offset:offset-base,number:index+1})).filter(start=>start.offset>=0&&start.offset<leaf.text.length);
      if(own.length)result.set(leaf.path,own);
      base+=leaf.text.length+1;
    }
  }
  return result;
}
