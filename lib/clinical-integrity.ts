/** Deterministic safeguards for model-written clinical text.
 * Conservative by design: unknown study results are not evidence against a diagnosis.
 * This is NOT an exhaustive factuality validator and does not replace physician review.
 */
const UNKNOWN_RU = /(?:(?<![\p{L}])не\s+(?:предоставлен[аоы]?|описан[аоы]?|указан[аоы]?|извест(?:ен|на|ны|но)|выполнен[аоы]?|измерен[аоы]?|получен[аоы]?|провед[её]н[аоы]?)(?![\p{L}])|(?<![\p{L}])нет\s+(?:данных|сведений|информации|результатов)(?![\p{L}])|(?<![\p{L}])(?:данн(?:ые|ых)|результат(?:ы|ов)|исследовани[ея]|визуализаци[яи])[^.!?;]{0,60}отсутству(?:ют|ет)(?![\p{L}]))/iu;
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
 // A prospective danger sign or a question is not an assertion about this patient.
 const prospective = /(?:при\s+(?:появлени[ии]|возникновени[ии]|развити[ии]|ухудшени[ии])|если|в\s+случае|следить\s+за|уточнить|есть\s+ли|исключить|оценить\s+наличие|if|when|whether|rule\s+out|watch\s+for|monitor\s+for|risk\s+of)(?![\p{L}])/iu;
 const shouldKeep=(offset:number,source:string)=>{
  const clause=source.slice(Math.max(0,offset-100),offset).split(/[.!?;:\n]/).pop()??'';
  return prospective.test(clause);
 };
 const ru=text.replace(REST_RU,(match,offset:number,source:string)=>{
  if(shouldKeep(offset,source))return match;
  changed=true;return 'одышка (наличие в покое не уточнено)';
 });
 const en=ru.replace(REST_EN,(match,offset:number,source:string)=>{
  if(shouldKeep(offset,source))return match;
  changed=true;return 'dyspnea (at rest not documented)';
 });
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


/** A narrow provenance check at the actual Doctor Opus synthesis boundary.
 * Only warns; it never rewrites a clinical finding into a verified diagnosis
 * or claims a medical conclusion. A warning is not a diagnosis or a "failed"
 * clinical benchmark score. All text is synthetic in regression tests.
 */
export type UnverifiedClinicalClaimCode=
 'ecg_not_verified'|'imaging_not_verified'|
 'discontinued_drug_as_current'|'unsupported_stability';
export type UnverifiedClinicalClaim={
 code:UnverifiedClinicalClaimCode;
 warning:string;
};
const deniedClaim=/(?:\b(?:not|never|cannot|can't|should not|must not|do not|no evidence that|avoid assuming)\b|(?:не|нельзя|невозможно|не\s+следует|нет\s+оснований)\s+(?:утверждать|считать|говорить|указывать|делать\s+вывод))/iu;
function isAsserted(source:string,expression:RegExp):boolean{
 const found=expression.exec(source);
 if(!found)return false;
 const clause=source.slice(Math.max(0,found.index-120),found.index).split(/[.!?;\n]/).pop()??'';
 return !deniedClaim.test(clause);
}
const ecgMissing=/(?:\b(?:no\s+(?:original\s+)?(?:ECG|EKG)(?:\s+(?:file|tracing|provided|available))?|(?:ECG|EKG)\s+(?:is\s+)?(?:not\s+(?:available|supplied|provided|attached|performed|recorded)|unavailable|missing|not yet supplied))\b|ЭКГ\s+(?:не\s+(?:приложена|предоставлена|проведена|выполнена)|отсутствует|неизвестна))/iu;
const ecgNormal=/\b(?:ECG|EKG)\s+(?:is|was|appears|shows|showed|has been)\s+(?:normal|unremarkable|negative|without abnormalities)\b|ЭКГ\s+(?:нормальна|нормальная|без\s+(?:патологии|отклонений)|в\s+норме)/iu;
const unreadImaging=/(?:\b(?:CTPA|head CT|brain CT|chest CT|chest X-ray|chest imaging|DICOM)\b.{0,65}\b(?:not\s+(?:reviewed|analy[sz]ed|performed|available)|unread|unverified|missing|not yet assessed)\b|\bno\s+(?:head|chest)?\s*(?:CTPA|CT|imaging)\s+(?:available|performed|provided)\b|КТ[ -]?(?:ангиография|головы)?\s+(?:не\s+(?:выполнена|прочитана|предоставлена)|отсутствует))/iu;
const imagingNegative=/(?:\b(?:CTPA|head CT|brain CT|chest CT|chest X-ray|chest imaging)\s+(?:is|was|appears|showed|shows)\s+(?:normal|negative|unremarkable|clear|no\s+(?:bleeding|embolism|abnormalities))\b|КТ[ -]?(?:ангиография|головы)?\s+(?:без\s+(?:патологии|кровоизлияния|эмболии)|нормальна))/iu;
const warfarinStopped=/(?:варфарин.{0,75}(?:НЕ\s+принимает|не\s+принимает|отмен[её]н)|(?:not\s+taking|stopped|discontinued|ceased)\s+warfarin|warfarin\s+(?:stopped|discontinued|ceased))/iu;
const warfarinCurrent=/\b(?:patient\s+(?:is\s+)?(?:currently\s+)?(?:taking|takes|on)\s+warfarin|warfarin\s+(?:is\s+)?(?:currently\s+)?(?:taken|continued))\b|пациент\s+(?:сейчас\s+)?(?:принимает|получает)\s+варфарин/iu;
const explicitHypotension=/(?:\b(?:BP|blood pressure)\s*[:=]?\s*(?:7\d|8\d)\s*\/\s*\d{2,3}\b|АД\s*[:=]?\s*(?:7\d|8\d)\s*\/\s*\d{2,3}\b)/iu;
const claimedStable=/\bhemodynamically\s+stable\b|гемодинамически\s+стабилен/iu;
const warn:Record<UnverifiedClinicalClaimCode,string>={
 ecg_not_verified:'В клиническом черновике ЭКГ представлена как нормальная, но исходная ЭКГ отсутствует или не верифицирована. Проверьте документ, не считайте вывод подтверждённым.',
 imaging_not_verified:'В клиническом черновике КТ/изображение названо отрицательным или нормальным без выполненного анализа. Сверьте первичный источник.',
 discontinued_drug_as_current:'В клиническом черновике отменённый варфарин упомянут как текущий препарат. Сверьте актуальный лекарственный анамнез.',
 unsupported_stability:'В клиническом черновике заявлена стабильная гемодинамика при документированной выраженной гипотензии. Требуется врачебная перепроверка.',
};
/**
 * Only supplied source text and generated statements; no model calls,
 * external medical content, browser globals or patient data persistence.
 * The processing ledger is authoritative: an assessed result can suppress
 * an unavailable-test warning only when actual supporting evidence exists.
 */
export function auditGeneratedClinicalClaims(
 sourceRecord:string,
 generated:unknown,
 evidence?:{ecgRead?:boolean;imagingRead?:boolean},
):UnverifiedClinicalClaim[]{
 if(!generated||typeof generated!=='object')return [];
 const value=generated as Record<string,unknown>;
 const strings:string[]=[];
 if(typeof value.summary==='string')strings.push(value.summary);
 const report=value.report&&typeof value.report==='object'?value.report as Record<string,unknown>:null;
 if(report){
  if(typeof report.problem==='string')strings.push(report.problem);
  for(const field of ['facts','limitations','questions']){
   const arr=report[field];if(Array.isArray(arr))strings.push(...arr.filter((x):x is string=>typeof x==='string'));
  }
  for(const field of ['tactics']){
   const section=report[field];
   if(section&&typeof section==='object')strings.push(...Object.values(section).filter((x):x is string=>typeof x==='string'));
  }
  const management=report.management;
  if(Array.isArray(management))for(const row of management){
   if(row&&typeof row==='object'){
    const x=row as Record<string,unknown>;
    if(typeof x.option==='string')strings.push(x.option);
   }
  }
 }
 if(Array.isArray(value.statements))for(const row of value.statements){
  if(row&&typeof row==='object'&&typeof (row as {text?:unknown}).text==='string')strings.push((row as {text:string}).text);
 }
 const combined=strings.join('\n').slice(0,50000);
 const found:UnverifiedClinicalClaim[]=[];
 function check(code:UnverifiedClinicalClaimCode,condition:boolean){
  if(condition)found.push({code,warning:warn[code]});
 }
 check('ecg_not_verified',!evidence?.ecgRead&&ecgMissing.test(sourceRecord)&&isAsserted(combined,ecgNormal));
 check('imaging_not_verified',!evidence?.imagingRead&&unreadImaging.test(sourceRecord)&&isAsserted(combined,imagingNegative));
 check('discontinued_drug_as_current',warfarinStopped.test(sourceRecord)&&isAsserted(combined,warfarinCurrent));
 check('unsupported_stability',explicitHypotension.test(sourceRecord)&&isAsserted(combined,claimedStable));
 return found;
}
