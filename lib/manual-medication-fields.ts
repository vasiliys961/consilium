import type {MedicationContext} from './drug-interaction-rules.ts';

/**
 * Validate manual field entry before it is passed to deterministic medication
 * rules or a paid preliminary model. Numeric HTML min/max alone are not a
 * trustworthy input boundary: paste and intermediate edits can bypass them.
 *
 * Bounds below match the existing conservative context extractor. They are
 * engineering admissibility bounds, NOT diagnostic normal ranges, dose
 * recommendations or proof that a value belongs to the current patient.
 */
export type ManualMedicationField='egfr'|'potassium'|'ageYears'|'qtcMs';
export type ManualMedicationFieldInput=Record<ManualMedicationField,string>;
export type ManualMedicationFieldIssue={field:ManualMedicationField;raw:string};
export type ManualMedicationFieldResult={
 context:Pick<MedicationContext,ManualMedicationField>;
 issues:ManualMedicationFieldIssue[];
};
const bounds:Record<ManualMedicationField,{min:number;max:number;integer:boolean}>={
 egfr:{min:0,max:130,integer:false},
 potassium:{min:1.5,max:10,integer:false},
 ageYears:{min:0,max:120,integer:true},
 qtcMs:{min:250,max:800,integer:true},
};
const fields:readonly ManualMedicationField[]=['egfr','potassium','ageYears','qtcMs'];
const decimal=/^(?:0|[1-9]\d{0,2})(?:[.,]\d{1,2})?$/u;

/** Invalid input is unknown (null) and visible as an issue; never guessed. */
export function readManualMedicationFields(values:ManualMedicationFieldInput):ManualMedicationFieldResult{
 const context:ManualMedicationFieldResult['context']={
  egfr:null,potassium:null,ageYears:null,qtcMs:null,
 };
 const issues:ManualMedicationFieldIssue[]=[];
 for(const field of fields){
  const raw=values[field].trim(),constraint=bounds[field];
  if(raw==='')continue;
  const parsed=decimal.test(raw)?Number(raw.replace(',','.')):NaN;
  if(!Number.isFinite(parsed)||parsed<constraint.min||parsed>constraint.max||
   constraint.integer&&!Number.isInteger(parsed)){
   issues.push({field,raw:raw.slice(0,60)});
  }else context[field]=parsed;
 }
 return {context,issues};
}
