import type {MedicationContext} from './drug-interaction-rules.ts';

/**
 * Conservative, local-only extraction of clinician-entered, explicit facts.
 * An invalid/ambiguous value must never silently turn into an apparently
 * verified number or negative finding for medication safety rules.
 */
export type MedicationContextExtraction={context:MedicationContext;issues:string[]};
type NumericKey='egfr'|'potassium'|'qtcMs'|'ageYears';
type BooleanKey='activeBleeding'|'decompensatedCirrhosis'|'severeHepaticImpairment';
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
function resolveBoolean(value:string):boolean|null{
 const clean=value.trim().toLowerCase().replace(/[.。]$/,'');
 if(/^(?:да|есть|подтвержден[ао]?|yes|true|present)$/.test(clean))return true;
 if(/^(?:нет|не\s+подтвержден[ао]?|отсутствует|no|false|absent)$/.test(clean))return false;
 return null;
}
export function extractMedicationSafetyContext(text:string):MedicationContextExtraction{
 const context:MedicationContext={},issues:string[]=[];
 // The caller must supply only physician-entered case facts, not model
 // discussions, bibliography, old charts or external search snippets.
 const lines=text.slice(0,3500).split(/\r?\n/).map(v=>v.trim().replace(/^[-•*]\s*/,'')).filter(Boolean);
 for(const field of numericFields){
  const values:number[]=[];
  let invalid=false;
  for(const line of lines){
   if(!field.prefix.test(line))continue;
   const found=line.match(field.pattern);
   if(!found){invalid=true;continue;}
   const number=Number(found[1].replace(',','.'));
   if(!Number.isFinite(number)||number<field.min||number>field.max||!validNumericTail(field,line.slice(found[0].length))){invalid=true;continue;}
   values.push(number);
  }
  const unique=[...new Set(values)];
  if(unique.length>1)issues.push('Несогласованные значения: '+field.name+' — уточните актуальный результат.');
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
   if(value===null){invalid=true;continue;}
   values.push(value);
  }
  const unique=[...new Set(values)];
  if(unique.length>1)issues.push('Противоречивые сведения: '+field.name+'.');
  if(invalid)issues.push('Неоднозначный статус: '+field.name+' — требуется подтверждение.');
  if(unique.length===1&&!invalid)context[field.key]=unique[0];
 }
 return {context,issues};
}
