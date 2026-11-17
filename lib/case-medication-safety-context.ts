import {extractMedicationSafetyContext} from './medication-context.ts';
import type {MedicationContext} from './drug-interaction-rules.ts';

export interface ManualMedicationFacts {
 egfrText:string;
 potassiumText:string;
 ageText:string;
 qtcText:string;
 decompensatedCirrhosis:boolean|null;
 severeHepaticImpairment:boolean|null;
}

/** Only the clinician-entered CURRENT case narrative is parsed. Never read
 * historic council opinions, library text, reports or model suggestions as
 * confirmed lab values. A deliberate field edit wins over case text.
 */
export function caseMedicationSafetyContext(
 caseFacts:string,
 manual:ManualMedicationFacts,
):{context:MedicationContext;issues:string[];fromCase:string[]}{
 const extracted=extractMedicationSafetyContext(caseFacts);
 const numberOrRecorded=(entered:string,key:'egfr'|'potassium'|'ageYears'|'qtcMs')=>{
  if(entered.trim()!==''){
   const number=Number(entered);
   return Number.isFinite(number)?number:null;
  }
  return extracted.context[key]??null;
 };
 const context:MedicationContext={
  egfr:numberOrRecorded(manual.egfrText,'egfr'),
  potassium:numberOrRecorded(manual.potassiumText,'potassium'),
  ageYears:numberOrRecorded(manual.ageText,'ageYears'),
  qtcMs:numberOrRecorded(manual.qtcText,'qtcMs'),
  activeBleeding:extracted.context.activeBleeding,
  decompensatedCirrhosis:manual.decompensatedCirrhosis??extracted.context.decompensatedCirrhosis,
  severeHepaticImpairment:manual.severeHepaticImpairment??extracted.context.severeHepaticImpairment,
 };
 const labels=[
  ['egfr','СКФ'],['potassium','K+'],['ageYears','возраст'],['qtcMs','QTc'],
  ['activeBleeding','кровотечение'],['decompensatedCirrhosis','цирроз'],
  ['severeHepaticImpairment','печёночная недостаточность']
 ] as const;
 const fromCase=labels.flatMap(([key,label])=>{
  const value=extracted.context[key];
  return value===undefined?[]:[label+': '+(typeof value==='boolean'?(value?'да':'нет'):String(value))];
 });
 return {context,issues:extracted.issues,fromCase};
}
