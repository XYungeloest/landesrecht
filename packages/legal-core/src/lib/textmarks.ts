/** Versionsgebundene Anzeige-Koordinaten. Keine Wortlaute in URLs, keine unscharfe Textsuche. */
export const TEXTMARK_LIMITS={marks:20,segments:64,totalSegments:120,characters:20000,url:12000} as const;
export interface TextSegment { key:string; start:number; end:number; hash:string }
export type TextMark=TextSegment[];
export interface TextMarkBinding { norm:string; version:string }
export function encodeTextMarks(binding:TextMarkBinding, marks:readonly TextMark[]):string|undefined {
  if(!marks.length)return undefined;
  const value=JSON.stringify([1,binding.norm,binding.version,marks.map(mark=>mark.map(s=>[s.key,s.start,s.end,s.hash]))]);
  return encodeURIComponent(value).length<=TEXTMARK_LIMITS.url?value:undefined;
}
export function decodeTextMarks(value:string|null,binding:TextMarkBinding):TextMark[]|undefined {
  try {
    if(!value || encodeURIComponent(value).length>TEXTMARK_LIMITS.url)return undefined;
    const payload:unknown=JSON.parse(value);
    if(!Array.isArray(payload)||payload.length!==4||payload[0]!==1||payload[1]!==binding.norm||payload[2]!==binding.version||!Array.isArray(payload[3])||payload[3].length>TEXTMARK_LIMITS.marks)return undefined;
    let total=0,characters=0;
    const marks:TextMark[]=[];
    for(const mark of payload[3]) {
      if(!Array.isArray(mark)||!mark.length||mark.length>TEXTMARK_LIMITS.segments)return undefined;
      const segments:TextSegment[]=[];
      for(const part of mark) {
        if(!Array.isArray(part)||part.length!==4)return undefined;
        const [key,start,end,hash]=part;
        if(typeof key!=='string'||!/^p-(?:\d+-)*(?:\d+)-(?:text|label|title)$/u.test(key)||key.length>180||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||typeof hash!=='string'||!/^[a-f0-9]{64}$/u.test(hash))return undefined;
        total++;characters+=end-start;segments.push({key,start,end,hash});
      }
      marks.push(segments);
    }
    return total<=TEXTMARK_LIMITS.totalSegments&&characters<=TEXTMARK_LIMITS.characters?marks:undefined;
  }catch{return undefined;}
}
export async function textDigest(text:string):Promise<string> {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
