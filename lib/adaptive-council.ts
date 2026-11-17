/**
 * Cost-neutral selection of clinical lenses for the five existing council roles.
 * One hypothesis role + one investigation role, never additional LLM calls.
 * Image readers and clinical AI lenses are distinct; never invent specialist votes.
 */
import {chooseClinicalFocus} from './clinical-focus.ts';

export const COUNCIL_SPECIALTIES=[
 {id:'auto',name:'Automatic'},
 {id:'internal medicine',name:'Internal medicine'},
 {id:'cardiology',name:'Cardiology'},
 {id:'pulmonology',name:'Pulmonology'},
 {id:'nephrology',name:'Nephrology'},
 {id:'neurology',name:'Neurology'},
 {id:'endocrinology',name:'Endocrinology'},
 {id:'infectious diseases',name:'Infectious diseases'},
 {id:'hematology',name:'Hematology'},
 {id:'gastroenterology and hepatology',name:'Gastroenterology / hepatology'},
 {id:'obstetrics and gynecology',name:'Obstetrics / gynecology'},
 {id:'radiology and medical imaging',name:'Medical imaging'},
 {id:'clinical genetics',name:'Clinical genetics'},
 {id:'clinical pharmacology',name:'Clinical pharmacology'},
] as const;
export type CouncilSpecialty=typeof COUNCIL_SPECIALTIES[number]['id'];
const candidate=new Set<string>(COUNCIL_SPECIALTIES.map(entry=>entry.id));
export function validCouncilSpecialty(value:unknown):value is CouncilSpecialty{
 return typeof value==='string'&&candidate.has(value);
}

export interface CouncilLensPlan{
 lead:string;
 secondary:string;
 suggested:string[];
 manual:boolean;
 description:string;
}
/** Only evidence domains; no diagnosis and no payment. */
export function planAdaptiveCouncil(note:string,modalities:readonly string[],requested:CouncilSpecialty='auto'):CouncilLensPlan{
 const detected=chooseClinicalFocus(note,modalities).map(item=>item.domain)
  .filter(domain=>domain!=='internal medicine'&&domain!=='clinical pharmacology');
 // A performed ECG or radiology interpretation is *evidence*, not an
 // independent specialist vote. Select the clinical context to reason about it.
 const preferred=detected.filter(x=>x!=='radiology and medical imaging');
 const automatic=[...preferred,...detected.filter(x=>!preferred.includes(x))];
 const lead=requested!=='auto'?requested:(automatic[0]??'internal medicine');
 const secondary=automatic.find(x=>x!==lead)??(lead==='internal medicine'?'diagnostic medicine':'internal medicine');
 return {
  lead,secondary,
  suggested:[...new Set([lead,...automatic])].slice(0,4),
  manual:requested!=='auto',
  description:'The existing AI opinion roles use clinical specialty perspectives. Imaging, ECG and detector outputs remain evidence, not separate votes.',
 };
}
export function councilRoleDirective(role:'hypothesis'|'testChooser'|'challenger'|'stewardship'|'checklist',plan:CouncilLensPlan):string{
 if(role==='hypothesis')return [
  'You are taking the '+plan.lead+' clinical perspective for differential hypotheses.',
  'Reason from documented findings and the physician question, including important problems outside your field. An ECGFounder score, radiology module output, and image reader opinion are unverified evidence, never your own direct observation or a separate physician vote.',
  'Preserve the role task: list hypotheses, including a dangerous alternative; no new treatment orders.',
 ].join(' ');
 if(role==='testChooser')return [
  'You are taking the '+plan.secondary+' clinical perspective when deciding which investigations discriminate hypotheses.',
  'Do not recast a model-generated image description or ECG score as a verified consultant opinion. Ask for unavailable primary measurements rather than inventing them. No additional images are analyzed here.',
 ].join(' ');
 if(role==='challenger')return 'You are an independent multidisciplinary clinical critic, NOT another organ-specific image reader. Seek contradictions between '+plan.lead+' and '+plan.secondary+' assumptions, treatment risks, missing critical findings and alternatives; do not invent votes.';
 if(role==='stewardship')return 'You are the clinical pharmacology / medication safety reviewer for all relevant organ functions. Preserve contraindications, interactions, dosing prerequisites and uncertainty. No new diagnosis.';
 return 'Synthesize the existing hypothesis, investigation, critic and safety-role opinions; distinguish actual model roles from prior module reports and missing expert consultations. Do not claim independent specialty votes not performed.';
}
