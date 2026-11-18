import {extractMedicationSafetyContext} from './medication-context.ts';
import type {MedicationContext} from './drug-interaction-rules.ts';
export const MEDICATION_NUMERIC_FIELDS=['egfr','potassium','ageYears','qtcMs'] as const;
const bounds={egfr:[0,200],potassium:[0,15],ageYears:[0,120],qtcMs:[200,900]} as const;
export type MedicationNumericField=typeof MEDICATION_NUMERIC_FIELDS[number];
type Flag='decompensatedCirrhosis'|'severeHepaticImpairment';
export type MedicationField=MedicationNumericField|Flag;
export type MedicationEdits={source:string;values:Partial<Record<MedicationNumericField,string>&Record<Flag,boolean>>};
/** An edit belongs to the exact physician narrative. It cannot override newer facts. */
export function editMedicationField(source:string,previous:MedicationEdits,key:MedicationField,value:string|boolean):MedicationEdits{
 return {source,values:{...(previous.source===source?previous.values:{}),[key]:value}};
}
export function medicationEditorContext(source:string,state:MedicationEdits){
 const extracted=extractMedicationSafetyContext(source),edits=state.source===source?state.values:{};
 const fields={} as Record<MedicationNumericField,string>,context:MedicationContext={};
 for(const key of MEDICATION_NUMERIC_FIELDS){
  const value=edits[key]??(extracted.context[key]==null?'':String(extracted.context[key]));
  fields[key]=value;
  const number=Number(value.replace(',','.'));
  const [min,max]=bounds[key];
  context[key]=value.trim()&&Number.isFinite(number)&&number>=min&&number<=max?number:null;
 }
 context.decompensatedCirrhosis=edits.decompensatedCirrhosis===true;
 context.severeHepaticImpairment=edits.severeHepaticImpairment===true;
 return {context,fields,issues:extracted.issues,hasValues:MEDICATION_NUMERIC_FIELDS.some(key=>context[key]!=null)};
}
