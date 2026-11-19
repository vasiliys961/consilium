import type {MedicationContext} from './drug-interaction-rules.ts';

/**
 * Conservative, local-only extraction of clinician-entered, explicit facts.
 * An invalid/ambiguous value must never silently turn into an apparently
 * verified number or negative finding for medication safety rules.
 */
type NumericKey='egfr'|'potassium'|'qtcMs'|'ageYears';
type BooleanKey='activeBleeding'|'decompensatedCirrhosis'|'severeHepaticImpairment';
export type MedicationContextHint={
 field:NumericKey|BooleanKey;
 kind:'units'|'conflict'|'implausible'|'inequality'|'historical'|'uncertain';
 observed:string;
 expectedFormat?:string;
 status:'requires_physician_confirmation';
};
export type MedicationContextExtraction={context:MedicationContext;issues:string[];hints:MedicationContextHint[]};
type NumericField={key:NumericKey;name:string;prefix:RegExp;pattern:RegExp;unit:RegExp;min:number;max:number};
const numericFields:ReadonlyArray<NumericField>=[
 {key:'egfr',name:'СКФ',prefix:/^(?:eGFR|СКФ)\s*[:=—–-]/iu,
  pattern:/^(?:eGFR|СКФ)\s*[:=—–-]\s*(\d{1,3}(?:[.,]\d{1,2})?)(?=\s|$)/iu,
  unit:/^(?:ml\s*\/\s*min|мл\s*\/\s*мин)(?:\s*\/\s*1[.,]73\s*(?:m2|m²|м2|м²))?/iu,min:0,max:130},
 {key:'potassium',name:'Калий',prefix:/^(?:Калий|Potassium|K\+)\s*[:=—–-]/iu,
  pattern:/^(?:Калий|Potassium|K\+)\s*[:=—–-]\s*(\d{1,2}(?:[.,]\d{1,2})?)(?=\s|$)/iu,
  unit:/^(?:mmol\s*\/\s*l|meq\s*\/\s*l|ммоль\s*\/\s*л|мэкв\s*\/\s*л)(?=\s|$|[.,;)])/iu,min:1.5,max:10},
 {key:'qtcMs',name:'QTc',prefix:/^QTc\s*[:=—–-]/iu,
  pattern:/^QTc\s*[:=—–-]\s*(\d{3})(?=\s|$)/iu,
  unit:/^(?:ms|msec|milliseconds?|мс)(?=\s|$|[.,;)])/iu,min:250,max:800},
 {key:'ageYears',name:'Возраст',prefix:/^(?:Возраст|Age)\s*[:=—–-]/iu,
  pattern:/^(?:Возраст|Age)\s*[:=—–-]\s*(\d{1,3})(?=\s|$)/iu,
  unit:/^(?:лет|года|год|years?|yrs?|y\/o)(?=\s|$|[.,;)])/iu,min:0,max:120},
];
type BooleanField={key:BooleanKey;name:string;prefix:RegExp;pattern:RegExp};
const booleanFields:ReadonlyArray<BooleanField>=[
 {key:'activeBleeding',name:'Активное патологическое кровотечение',
  prefix:/^(?:Активное\s+(?:патологическое\s+)?кровотечение|Active\s+(?:pathological\s+)?bleeding)\s*[:=—–-]/iu,
  pattern:/^(?:Активное\s+(?:патологическое\s+)?кровотечение|Active\s+(?:pathological\s+)?bleeding)\s*[:=—–-]\s*(.+)$/iu},
 {key:'decompensatedCirrhosis',name:'Декомпенсированный цирроз',
  prefix:/^(?:Декомпенсированный\s+цирроз|Decompensated\s+cirrhosis)\s*[:=—–-]/iu,
  pattern:/^(?:Декомпенсированный\s+цирроз|Decompensated\s+cirrhosis)\s*[:=—–-]\s*(.+)$/iu},
 {key:'severeHepaticImpairment',name:'Тяжёлая печёночная недостаточность',
  prefix:/^(?:Тяж[её]лая\s+печ[её]ночная\s+недостаточность|Severe\s+hepatic\s+impairment)\s*[:=—–-]/iu,
  pattern:/^(?:Тяж[её]лая\s+печ[её]ночная\s+недостаточность|Severe\s+hepatic\s+impairment)\s*[:=—–-]\s*(.+)$/iu},
];
// Explicitly historical/pending facts are not safe current treatment parameters.
const staleQualifier=/(?:вчера|ранее|прошл|предыдущ|старый|планир|ожидается|yesterday|previous|historical|old result|pending|planned)/iu;
function validNumericTail(field:NumericField,tail:string):boolean{
 const rest=tail.trim();
 if(staleQualifier.test(rest))return false;
 if(!rest||/^[.;,](?=\s|$)/u.test(rest))return true;
 // The explicit label may be followed by a validated unit and clinical annotation.
 // Unrecognized units (e.g. potassium mg/dL or QTc seconds) must never be
 // interpreted as if they were mmol/L or milliseconds.
 return field.unit.test(rest);
}
const expectedFormat:Record<NumericKey,string>={
 egfr:'eGFR: … mL/min/1.73 m²',potassium:'K+: … mmol/L',
 qtcMs:'QTc: … ms',ageYears:'Age: … years',
};
/** Advice is a question, not a corrected fact or an instruction to treat. */
export function medicationContextHintAdvice(hint:MedicationContextHint):string{
 if(hint.kind==='conflict'){
  if(hint.field==='activeBleeding')return 'Противоречивые сведения о кровотечении. Уточните актуальный статус и время осмотра; неизвестное не равно отсутствию.';
  if(hint.field==='decompensatedCirrhosis'||hint.field==='severeHepaticImpairment')return 'Противоречивые сведения о заболевании. Сверьте документы и подтвердите текущий клинический статус.';
  return 'Сверьте даты, методы измерения и исходные документы. Не выбирайте одно из значений автоматически.';
 }
 if(hint.kind==='historical')return 'Это может быть предыдущий результат. Уточните дату и получите актуальное значение для назначения.';
 if(hint.kind==='inequality')return 'Указан диапазон или неравенство, а не точное число. Уточните исходный результат и клиническое значение ограничения.';
 if(hint.kind==='implausible')return 'Проверьте возможную опечатку, десятичный разделитель и исходный документ. Не исправляйте число предположением.';
 if(hint.kind==='uncertain'){
  if(['egfr','potassium','qtcMs','ageYears'].includes(hint.field))return 'Числовой результат не удалось однозначно прочитать. Сверьте точное значение, единицы и дату с первичным документом.';
  return 'Уточните текущий клинический статус у врача. Не приравнивайте неизвестно к отрицанию.';
 }
 if(hint.field==='egfr')return 'Возможно перепутаны СКФ и концентрация креатинина либо единицы измерения. Сверьте название анализа и бланк.';
 if(hint.field==='qtcMs')return 'Проверьте, не перепутаны секунды и миллисекунды. Сверьте исходную ЭКГ, прежде чем менять запись.';
 if(hint.field==='potassium')return 'Возможно ошибочно указаны единицы калия. Сверьте лабораторный бланк, прежде чем интерпретировать число.';
 if(hint.field==='ageYears')return 'Уточните возраст по дате рождения и единицам (месяцы или годы). Не считайте число месяцев годами.';
 return 'Проверьте значение и единицы по исходному документу; автоматической замены нет.';
}
function contextualNumericHint(field:NumericField,line:string,found:RegExpMatchArray|null):MedicationContextHint{
 const tail=found?line.slice(found[0].length).trim():'';
 const rawNumber=found?Number(found[1].replace(',','.')):NaN;
 let kind:MedicationContextHint['kind']='units';
 if(found&&staleQualifier.test(tail))kind='historical';
 else if(!found&&/^[^:=—–-]*[:=—–-]\s*[<>≤≥]/u.test(line))kind='inequality';
 else if(found&&(!Number.isFinite(rawNumber)||rawNumber<field.min||rawNumber>field.max))kind='implausible';
 else if(!found)kind='uncertain';
 return {field:field.key,kind,observed:line.slice(0,160),
  ...(['units','implausible','inequality'].includes(kind)?{expectedFormat:expectedFormat[field.key]}:{}),
  status:'requires_physician_confirmation'};
}
function resolveBoolean(value:string):boolean|null{
 const clean=value.trim().toLowerCase().replace(/[.。]$/,'');
 if(/^(?:да|есть|подтвержден[ао]?|yes|true|present)$/.test(clean))return true;
 if(/^(?:нет|не\s+подтвержден[ао]?|отсутствует|no|false|absent)$/.test(clean))return false;
 return null;
}
export function extractMedicationSafetyContext(text:string):MedicationContextExtraction{
 const context:MedicationContext={},issues:string[]=[],hints:MedicationContextHint[]=[];
 const addHint=(hint:MedicationContextHint)=>{if(hints.length<12)hints.push(hint);};
 // The caller must supply only physician-entered case facts, not model
 // discussions, bibliography, old charts or external search snippets.
 const lines=text.slice(0,3500).split(/\r?\n/).map(v=>v.trim().replace(/^[-•*]\s*/,'')).filter(Boolean);
 for(const field of numericFields){
  const values:number[]=[];
  let invalid=false;
  for(const line of lines){
   if(!field.prefix.test(line))continue;
   const found=line.match(field.pattern);
   if(!found){invalid=true;addHint(contextualNumericHint(field,line,null));continue;}
   const number=Number(found[1].replace(',','.'));
   if(!Number.isFinite(number)||number<field.min||number>field.max||!validNumericTail(field,line.slice(found[0].length))){
    invalid=true;addHint(contextualNumericHint(field,line,found));continue;
   }
   values.push(number);
  }
  const unique=[...new Set(values)];
  if(unique.length>1){
   issues.push('Несогласованные значения: '+field.name+' — уточните актуальный результат.');
   addHint({field:field.key,kind:'conflict',observed:unique.join(' / ').slice(0,160),status:'requires_physician_confirmation'});
  }
  if(invalid)issues.push('Некорректное или неоднозначное значение/единицы: '+field.name+' — требуется подтверждение.');
  if(unique.length===1&&!invalid)context[field.key]=unique[0];
 }
 for(const field of booleanFields){
  const values:boolean[]=[];
  let invalid=false;
  for(const line of lines){
   if(!field.prefix.test(line))continue;
   const matched=line.match(field.pattern);
   const value=matched?resolveBoolean(matched[1]):null;
   if(value===null){
    invalid=true;
    addHint({field:field.key,kind:'uncertain',observed:line.slice(0,160),status:'requires_physician_confirmation'});
    continue;
   }
   values.push(value);
  }
  const unique=[...new Set(values)];
  if(unique.length>1){
   issues.push('Противоречивые сведения: '+field.name+'.');
   addHint({field:field.key,kind:'conflict',observed:field.name+': да / нет',status:'requires_physician_confirmation'});
  }
  if(invalid)issues.push('Неоднозначный статус: '+field.name+' — требуется подтверждение.');
  if(unique.length===1&&!invalid)context[field.key]=unique[0];
 }
 return {context,issues,hints};
}
