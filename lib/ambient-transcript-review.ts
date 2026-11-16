/** Offline source review only. No STT, diarization, LLM inference or fabricated clinical facts. */
export interface AmbientSourceFragment{
 id:string;
 text:string;
 speaker:'unverified';
 reviewFlags:string[];
}
const CUES=[
 {label:'Лекарства и дозировки',pattern:/лекарств|препарат|таблет|инсулин|антикоагуля|варфарин|апиксабан|ривароксабан|mg|мг|мкг|мл|единиц|ед\\./i},
 {label:'Отрицание или неопределённость',pattern:/(?:^|[\s,.:;!?])(не|нет|отрица|возможно|сомнева|без|never|not|no)(?:\s|$)/i},
 {label:'Числа или показатели',pattern:/[0-9]/},
];
function splitSources(raw:string):string[]{
 return raw.replace(/\r\n?/g,'\n').split(/\n+/).map(line=>line.trim()).filter(Boolean);
}
export function ambientSourceFragments(raw:string):AmbientSourceFragment[]{
 return splitSources(raw).map((text,index)=>({
  id:`fragment-${index+1}`,
  text,
  speaker:'unverified' as const,
  reviewFlags:CUES.filter(cue=>cue.pattern.test(text)).map(cue=>cue.label),
 }));
}
function numbers(text:string):string[]{
 return [...new Set((text.match(/\d+(?:[.,]\d+)?/g)??[]).map(value=>value.replace(',','.')))];
}
/** Numbers not literally present in the transcript are REVIEW FLAGS, not proof of error:
 * they may come from clinician-verified prior case materials.
 */
export function ambientNumberReview(raw:string,draft:string):string[]{
 const sourced=new Set(numbers(raw));
 return numbers(draft).filter(token=>!sourced.has(token));
}
