import type {MedicationContext} from './drug-interaction-rules.ts';

/** Conservative, local-only extraction from clinician-entered case facts.
 * Only explicit key/value statements are accepted; prose, hypotheses, tests
 * requested for the future, old records and inferred values are not trusted.
 */
export type MedicationContextExtraction={context:MedicationContext;issues:string[]};
type NumericKey='egfr'|'potassium'|'qtcMs'|'ageYears';
type BooleanKey='activeBleeding'|'decompensatedCirrhosis'|'severeHepaticImpairment';
const numericFields:ReadonlyArray<{key:NumericKey;name:string;label:RegExp;value:RegExp;min:number;max:number}>= [
 {key:'egfr',name:'СКФ',label:/^(?:eGFR|СКФ)\s*[:=—–-]\s*(.*)$/iu,value:/^(\d{1,3}(?:[.,]\d{1,2})?)(?:\s*(?:ml|мл)\s*\/\s*(?:min|мин)\s*\/\s*1[.,]73\s*(?:m|м)[²2])?$/iu,min:0,max:130},
 {key:'potassium',name:'Калий',label:/^(?:Калий|Potassium|K\+)\s*[:=—–-]\s*(.*)$/iu,value:/^(\d{1,2}(?:[.,]\d{1,2})?)(?:\s*(?:mmol|ммоль|mEq|мЭкв)\s*\/\s*(?:l|л))?$/iu,min:1.5,max:10},
 {key:'qtcMs',name:'QTc',label:/^QTc\s*[:=—–-]\s*(.*)$/iu,value:/^(\d{3})(?:\s*(?:ms|мс))?$/iu,min:250,max:800},
 {key:'ageYears',name:'Возраст',label:/^(?:Возраст|Age)\s*[:=—–-]\s*(.*)$/iu,value:/^(\d{1,3})(?:\s*(?:years?|лет|год|года))?$/iu,min:0,max:120},
];
const booleanFields:ReadonlyArray<{key:BooleanKey;name:string;pattern:RegExp}>= [
 {key:'activeBleeding',name:'Активное патологическое кровотечение',pattern:/^(?:Активное\s+(?:патологическое\s+)?кровотечение|Active\s+(?:pathological\s+)?bleeding)\s*[:=—–-]\s*(.+)$/iu},
 {key:'decompensatedCirrhosis',name:'Декомпенсированный цирроз',pattern:/^(?:Декомпенсированный\s+цирроз|Decompensated\s+cirrhosis)\s*[:=—–-]\s*(.+)$/iu},
 {key:'severeHepaticImpairment',name:'Тяжёлая печёночная недостаточность',pattern:/^(?:Тяж[её]лая\s+печ[её]ночная\s+недостаточность|Severe\s+hepatic\s+impairment)\s*[:=—–-]\s*(.+)$/iu},
];
function resolveBoolean(value:string):boolean|null{
 const clean=value.trim().toLowerCase().replace(/[.。]$/,'');
 if(/^(?:да|есть|подтвержден[ао]?|yes|true|present)$/.test(clean))return true;
 if(/^(?:нет|не\s+подтвержден[ао]?|отсутствует|no|false|absent)$/.test(clean))return false;
 return null;
}
export function extractMedicationSafetyContext(text:string):MedicationContextExtraction{
 const context:MedicationContext={},issues:string[]=[];
 // Never examine external search snippets, referenced literature or appended model discussions.
 // The caller supplies only the physician's immediate case narrative.
 // Inspect the entire supplied narrative: a late conflicting value must not
 // leave an earlier apparently normal value trusted. No units are converted.
 // A bare number retains the field's existing canonical-unit convention.
 const lines=text.split(/\r?\n/).map(v=>v.trim().replace(/^[-•*]\s*/,'' )).filter(Boolean);
 for(const field of numericFields){
  let unresolved=false;
  const values=lines.flatMap(line=>{
   const labelled=line.match(field.label);if(!labelled)return [];
   const found=labelled[1].trim().match(field.value);
   if(!found){unresolved=true;return [];}
   const number=Number(found[1].replace(',','.'));
   if(!Number.isFinite(number)||number<field.min||number>field.max){unresolved=true;return [];}
   return [number];
  });
  const unique=[...new Set(values)];
  if(unique.length>1)issues.push('Несогласованные значения: '+field.name+' — уточните актуальный результат.');
  else if(unresolved)issues.push('Не удалось однозначно прочитать '+field.name+' — уточните актуальное значение и единицы.');
  else if(unique.length===1)context[field.key]=unique[0];
 }
 for(const field of booleanFields){
  const values=lines.flatMap(line=>{
   const matched=line.match(field.pattern);
   const value=matched?resolveBoolean(matched[1]):null;
   return value===null?[]:[value];
  });
  const unique=[...new Set(values)];
  if(unique.length>1)issues.push('Противоречивые сведения: '+field.name+'.');
  else if(unique.length===1)context[field.key]=unique[0];
 }
 return {context,issues};
}
