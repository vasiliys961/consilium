/**
 * C12: local, deterministic review aid for the C14 Ambient clinical draft.
 * No model, cloud call, mutation, or automatic correction. Warnings are NOT
 * validation of the clinical truth of the draft or diarization of speakers.
 */
export type AmbientDraftIssueCode =
  | 'missing_citations'
  | 'invalid_citation'
  | 'unsupported_dose'
  | 'wrong_dose_reference'
  | 'possible_negation_mismatch';

export interface AmbientDraftIssue {
  code: AmbientDraftIssueCode;
  /** Literal value or T-reference displayed to the physician. */
  detail: string;
}

const REF=/\[T(\d{1,5})\]/gi;
// Common written dose/volume units used in the supported encounter languages.
// Other word forms and languages still require direct physician comparison.
const DOSE=/(?<![\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Devanagari}\p{N}])([0-9٠-٩۰-۹]{1,5}(?:[.,٫][0-9٠-٩۰-۹]{1,3})?)\s*(мкг|мг|мл|г|mcg|µg|μg|mg|ml|iu|ед\.?|g|毫克|微克|毫升|ملغ|ملجم|मिलीग्राम)(?![\p{L}])/giu;

function canonUnit(value:string):string{
 const unit=value.toLowerCase().replace(/\.$/,'');
 if(['мг','mg','毫克','ملغ','ملجم','मिलीग्राम'].includes(unit))return 'mg';
 if(['мкг','mcg','µg','μg','微克'].includes(unit))return 'mcg';
 if(['мл','ml','毫升'].includes(unit))return 'ml';
 if(['г','g'].includes(unit))return 'g';
 if(['iu','ед'].includes(unit))return 'iu';
 return unit;
}
function doses(text:string):Map<string,string>{
 const result=new Map<string,string>();
 for(const match of text.matchAll(DOSE)){
  const normalizedDigits=match[1]
   .replace(/[٠-٩]/g,ch=>String(ch.charCodeAt(0)-0x0660))
   .replace(/[۰-۹]/g,ch=>String(ch.charCodeAt(0)-0x06f0))
   .replace(/[,.٫]/g,'.');
  const value=Number(normalizedDigits);
  if(!Number.isFinite(value))continue;
  const key=`${value}:${canonUnit(match[2])}`;
  result.set(key,match[0].trim());
 }
 return result;
}
type ExplicitPolarity='present'|'absent';
const REVIEWED_SYMPTOMS:ReadonlyArray<{label:string;term:RegExp}>=[
 {label:'одышка / dyspnea',term:/одышк[а-яё]*|dyspn[a-z]*|shortness\s+of\s+breath|breathless[a-z]*/i},
 {label:'кашель / cough',term:/кашел|кашель|кашл[а-яё]*|cough[a-z]*/i},
 {label:'боль в груди / chest pain',term:/бол(?:ь|и|ей)\s+в\s+груд[а-яё]*|chest\s+pain/i},
];
/** Recognize only explicit nearby denial/presence cues; do not infer clinical
 * polarity from unqualified prose, e.g. "dyspnea on exertion". */
function explicitSymptomPolarity(text:string,term:RegExp):ExplicitPolarity|null{
 const match=term.exec(text);
 if(!match)return null;
 const before=text.slice(Math.max(0,match.index-50),match.index);
 const after=text.slice(match.index+match[0].length,match.index+match[0].length+23);
 if(/не\s+отрица(?:ет|л|ла)\s*$/iu.test(before))return null;
 if(/(?:нет|без|отрицает|отрицал|отрицала|не\s+было|не\s+отмечает|\bno\b|\bdenies\b|\bwithout\b)\s*$/iu.test(before)
   ||/^\s*(?:нет|отрицает|отрицал|отрицала|отсутствует|не\s+было|\babsent\b|\bdenied\b)(?=[\s.,;:]|$)/iu.test(after))
  return 'absent';
 if(/(?:есть|имеется|жалуется\s+на|отмечает|\breports\b|\bhas\b)\s*$/iu.test(before)
   ||/^\s*(?:есть|имеется|присутствует|наблюдается|\bpresent\b)(?=[\s.,;:]|$)/iu.test(after))
  return 'present';
 return null;
}

function citedNumbers(text:string):number[]{
 return [...text.matchAll(REF)].map(m=>Number(m[1]));
}
export function auditAmbientDraft(transcript:string,draft:string):AmbientDraftIssue[]{
 const lines=transcript.replace(/\r\n?/g,'\n').split('\n').filter(Boolean);
 if(!lines.length||!draft.trim())return [];
 const issues:AmbientDraftIssue[]=[];
 const seen=new Set<string>();
 const emit=(code:AmbientDraftIssueCode,detail:string)=>{
  const key=code+':'+detail;
  if(!seen.has(key)){seen.add(key);issues.push({code,detail});}
 };
 const citations=citedNumbers(draft);
 if(!citations.length)emit('missing_citations','[Tn]');
 for(const number of citations){
  if(number<1||number>lines.length)emit('invalid_citation',`[T${number}]`);
 }
 const transcriptDoses=doses(lines.join('\n'));
 const draftDoses=doses(draft);
 for(const [key,literal] of draftDoses){
  if(!transcriptDoses.has(key))emit('unsupported_dose',literal);
 }
 // Only check dose evidence where the draft names one or more T-lines itself.
 // This avoids pretending that positional or semantic matching is certain.
 for(const line of draft.replace(/\r\n?/g,'\n').split('\n')){
  const refs=citedNumbers(line).filter(n=>n>0&&n<=lines.length);
  if(!refs.length)continue;
  // Warn only when the SAME cited line explicitly states the opposite
  // symptom polarity. This is a review aid, not general semantic negation.
  for(const symptom of REVIEWED_SYMPTOMS){
   const claim=explicitSymptomPolarity(line,symptom.term);
   if(!claim)continue;
   const found=new Set(refs.map(n=>explicitSymptomPolarity(lines[n-1],symptom.term)).filter(Boolean));
   if(found.size===1&&!found.has(claim))
    emit('possible_negation_mismatch',symptom.label+' · '+refs.map(n=>'[T'+n+']').join(', '));
  }
  const lineDoses=doses(line);
  if(!lineDoses.size)continue;
  const sourcedDoses=doses(refs.map(n=>lines[n-1]).join('\n'));
  for(const [key,literal] of lineDoses){
   if(transcriptDoses.has(key)&&!sourcedDoses.has(key)){
    emit('wrong_dose_reference',`${literal} · ${refs.map(n=>`[T${n}]`).join(', ')}`);
   }
  }
 }
 return issues.slice(0,20);
}
