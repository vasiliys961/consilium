/** Deterministic safeguards for model-written clinical text.
 * Conservative by design: unknown study results are not evidence against a diagnosis.
 * This is NOT an exhaustive factuality validator and does not replace physician review.
 */
const UNKNOWN_RU = /(?:\bне\s+(?:предоставлен[аоы]?|описан[аоы]?|указан[аоы]?|извест(?:ен|на|ны|но)|выполнен[аоы]?|измерен[аоы]?|получен[аоы]?|провед[её]н[аоы]?)\b|\bнет\s+(?:данных|сведений|информации|результатов)\b|\b(?:данн(?:ые|ых)|результат(?:ы|ов)|исследовани[ея]|визуализаци[яи])[^.!?;]{0,60}\bотсутству(?:ют|ет)\b)/iu;
const UNKNOWN_EN = /\b(?:not\s+(?:documented|recorded|provided|available|assessed|measured|performed|reported|known|obtained)|(?:no|without)\s+(?:data|history|documentation|results|information|imaging|ecg))\b/i;

/** Move unavailable/unmeasured findings out of the opposing-evidence column. */
export function separateMissingFromOpposing(opposing: string[], missing: string[]): {opposing:string[];missing:string[]} {
 const actual: string[] = [];
 const unknown = [...missing];
 for(const line of opposing) {
  if(UNKNOWN_RU.test(line) || UNKNOWN_EN.test(line)) {
   if(!unknown.includes(line))unknown.push(line);
  } else actual.push(line);
 }
 return {opposing:actual,missing:unknown};
}

const REST_RU = /одышк(?:а|и|у|ой)\s+в\s+покое/giu;
const REST_EN = /dyspn(?:ea|oea)\s+at\s+rest/gi;

/** Narrow, high-confidence guard for an invented symptom found in a regression case. */
export function guardUnsupportedRestDyspnea(text:string, observedRecord:string): {text:string;changed:boolean} {
 const positive = /одышк(?:а|и|у|ой)\s+в\s+покое|dyspn(?:ea|oea)\s+at\s+rest/iu;
 const denied = /(?:нет|без|отрицает|отсутствует)\s+одышк(?:и|а|у)?\s+в\s+покое|(?:no|denies|without)\s+dyspn(?:ea|oea)\s+at\s+rest/iu;
 if(positive.test(observedRecord) && !denied.test(observedRecord))return {text,changed:false};
 let changed=false;
 const ru=text.replace(REST_RU,()=>{changed=true;return 'одышка (наличие в покое не уточнено)';});
 const en=ru.replace(REST_EN,()=>{changed=true;return 'dyspnea (at rest not documented)';});
 return {text:en,changed};
}

/** Recursively examine only generated text, never original observations or source files. */
export function guardGeneratedClinicalText<T>(generated:T, observedRecord:string): {value:T;changed:boolean} {
 let changed=false;
 function visit(value:unknown):unknown {
  if(typeof value==='string'){
   const checked=guardUnsupportedRestDyspnea(value,observedRecord);
   changed ||= checked.changed;
   return checked.text;
  }
  if(Array.isArray(value))return value.map(visit);
  if(value && typeof value==='object')
   return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,visit(item)]));
  return value;
 }
 const value=visit(generated) as T;
 return {value,changed};
}
