/**
 * C13: cost-neutral adaptive clinical perspectives for the EXISTING five-role
 * AI consilium. It never starts another model, reopens imaging, or diagnoses.
 * Module conclusions are provisional source material, not specialist votes.
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
 {id:'dermatology',name:'Dermatology'},
 {id:'histopathology',name:'Histopathology'},
 {id:'oncology',name:'Oncology'},
 {id:'pediatrics',name:'Pediatrics'},
 {id:'ophthalmology',name:'Ophthalmology'},
] as const;

export type CouncilSpecialty=typeof COUNCIL_SPECIALTIES[number]['id'];
type ClinicalSpecialty=Exclude<CouncilSpecialty,'auto'>;
const allowed=new Set<string>(COUNCIL_SPECIALTIES.map(item=>item.id));
const labels=Object.fromEntries(COUNCIL_SPECIALTIES.map(item=>[item.id,item.name])) as Record<CouncilSpecialty,string>;
const ruNames:Record<CouncilSpecialty,string>={
 'auto':'Автоматически','internal medicine':'Терапия / внутренняя медицина',
 'cardiology':'Кардиология','pulmonology':'Пульмонология',
 'nephrology':'Нефрология','neurology':'Неврология',
 'endocrinology':'Эндокринология','infectious diseases':'Инфекционные болезни',
 'hematology':'Гематология','gastroenterology and hepatology':'Гастроэнтерология / гепатология',
 'obstetrics and gynecology':'Акушерство / гинекология',
 'radiology and medical imaging':'Лучевая диагностика',
 'clinical genetics':'Медицинская генетика','clinical pharmacology':'Клиническая фармакология',
 'dermatology':'Дерматология','histopathology':'Гистопатология',
 'oncology':'Онкология','pediatrics':'Педиатрия','ophthalmology':'Офтальмология',
};
export function councilSpecialtyLabel(id:string,locale:string):string{
 if(!allowed.has(id))return locale==='ru'?'Неизвестный профиль':'Unknown specialty';
 return locale==='ru'?ruNames[id as CouncilSpecialty]:labels[id as CouncilSpecialty];
}
export function councilPerspectiveLabel(value:string,locale:string):string{
 if(allowed.has(value))return councilSpecialtyLabel(value,locale);
 const extra:Record<string,readonly [string,string]>={
  'multidisciplinary critic':['Междисциплинарный критик','Multidisciplinary critic'],
  'medication safety':['Безопасность лечения','Medication safety'],
  'clinical synthesis':['Итоговый синтез','Clinical synthesis'],
 };
 const item=extra[value];return item?(locale==='ru'?item[0]:item[1]):value;
}
export function validCouncilSpecialty(value:unknown):value is CouncilSpecialty{
 return typeof value==='string'&&allowed.has(value);
}

export interface CouncilLensPlan{
 lead:ClinicalSpecialty;
 /** Second role is still the existing test chooser, not an extra consultant. */
 secondary:ClinicalSpecialty;
 suggested:ClinicalSpecialty[];
 manual:boolean;
 description:string;
}
function distinct<T>(values:T[]):T[]{return [...new Set(values)];}
function isModality(modalities:readonly string[],id:string):boolean{
 return modalities.some(item=>item.toLowerCase()===id);
}
/** Deterministic planning, before spending anything; recommendations only. */
export function planAdaptiveCouncil(note:string,modalities:readonly string[],requested:CouncilSpecialty='auto'):CouncilLensPlan{
 const excerpt=note.slice(0,14000);
 const focus=chooseClinicalFocus(excerpt,modalities).filter(item=>
  allowed.has(item.domain)&&item.domain!=='auto'&&item.domain!=='internal medicine'&&item.domain!=='clinical pharmacology'
 );
 // Re-run the free focus matcher without modalities: when a disease is both
 // documented in text AND tagged by an ECG, textual evidence retains priority.
 const fromText=chooseClinicalFocus(excerpt,[]).filter(item=>allowed.has(item.domain)&&item.domain!=='auto'&&item.domain!=='internal medicine'&&item.domain!=='clinical pharmacology')
  .map(item=>item.domain as ClinicalSpecialty);
 // Explicit AF/ФП abbreviations should not be outranked by an incidental
 // image modality. They describe a clinical problem, not a classifier score.
 if(/(?:^|[\s,;()])(?:ФП|AFib|atrial fibrillation|фибрилляци[яюие])(?=$|[\s,;().])/iu.test(excerpt) && !fromText.includes('cardiology'))fromText.unshift('cardiology');
 const fromModality=focus.map(item=>item.domain as ClinicalSpecialty).filter(item=>!fromText.includes(item));
 // Reuse specialist image-read conclusions as EVIDENCE. The council does not
 // claim to have inspected histology pixels, dermatoscopy, retinal scans, etc.
 const imageContext:ClinicalSpecialty[]=[];
 if(isModality(modalities,'dermatology'))imageContext.push('dermatology');
 if(isModality(modalities,'histology'))imageContext.push('histopathology');
 if(isModality(modalities,'ultrasound')&&!focus.some(s=>s.domain==='radiology and medical imaging'))
  imageContext.push('radiology and medical imaging');
 if(/\b(?:pediatric|paediatric|infant|child)\b|реб[её]нок|детск|младен/i.test(excerpt))imageContext.push('pediatrics');
 if(/онколог|опухол|новообразован|метастаз|злокачеств|malignan|neoplas|metasta|oncolog|melanoma|меланом/iu.test(excerpt))imageContext.push('oncology');
 if(/кож[аныеи]|сыпь|дермат|skin lesion|skin rash|dermatolog/iu.test(excerpt))imageContext.push('dermatology');
 if(/биопс|гистолог|патоморфолог|histolog|patholog(?:y|ical)|biopsy/iu.test(excerpt))imageContext.push('histopathology');
 if(/сетчатк|глазн.*дн|retina|retinal|fundoscop/iu.test(excerpt))imageContext.push('ophthalmology');
 // Do not put imaging as the lead over an identifiable clinical problem.
 // Clinical text comes first; imaging modality alone should not overrule a
 // clear cardiopulmonary/neurologic complaint in a mixed clinical case.
 const preferred=distinct([...fromText,...imageContext.filter(s=>s!=='radiology and medical imaging'),
  ...fromModality,...imageContext]);
 const first=distinct([...preferred.filter(s=>s!=='radiology and medical imaging'),
  ...preferred.filter(s=>s==='radiology and medical imaging')]);
 const lead:ClinicalSpecialty=requested!=='auto'?requested:(first[0]??'internal medicine');
 // For a general, non-imaging case, use internal medicine in both distinct
 // functional roles. Never recruit an unrelated radiology perspective.
 const secondary=first.find(item=>item!==lead)??'internal medicine';
 return {
  lead,secondary,suggested:distinct([lead,...first]).slice(0,5),
  manual:requested!=='auto',
  description:'Fixed AI role count; clinical specialty perspectives use previously derived evidence, and do not constitute independent physician consultations.',
 };
}

const SPECIALTY_TASKS:Partial<Record<ClinicalSpecialty,string>>={
 'internal medicine':'Reconcile multimorbidity and competing syndromes; distinguish symptoms, observed signs and confirmed diagnoses.',
 cardiology:'Use available digital ECG measurements and cardiology interpretation as distinct evidence. Check rhythm, conduction, haemodynamics and clinical relevance; never infer missing leads or calibrated intervals from an image alone.',
 pulmonology:'Correlate respiratory history, oxygenation, imaging descriptions and clinical urgency. Do not convert a CT report into observed negative findings beyond its verified coverage.',
 nephrology:'Consider eGFR/creatinine trends and AKI/CKD uncertainty; identify which renal function data are needed before medication decisions.',
 dermatology:'Link the clinician description and any provisional dermoscopy reading with differential diagnoses. Do not claim direct visual access to pixels not supplied to this council.',
 histopathology:'Differentiate morphology described in a provisional image reading from a verified pathology diagnosis, sampling, stains and immunohistochemistry. Never invent biopsy grade or markers.',
 oncology:'Separate suspected malignancy, biopsy confirmation, stage, site-specific imaging and proposed staging tests.',
 pediatrics:'Apply age-dependent reasoning only when age is documented; do not invent pediatric vitals or dose.',
 ophthalmology:'Relate retinal/fundus imaging descriptions to symptoms, examination and urgent referral signs; no invented fundus findings.',
 neurology:'Correlate documented focal signs, chronology and neurological examination; distinguish ischemic vs hemorrhagic hypotheses when evidence warrants.',
 'clinical genetics':'Separate observed variant data and clinical diagnosis; preserve variant classification and missing segregation evidence.',
 'clinical pharmacology':'Evaluate interacting drugs, dose units, renal/hepatic adjustments and contraindication uncertainty.',
};
export type CouncilRoleId='hypothesis'|'testChooser'|'challenger'|'stewardship'|'checklist';
export function councilRolePerspective(role:CouncilRoleId,plan:CouncilLensPlan):string{
 return role==='hypothesis'?plan.lead:
  role==='testChooser'?plan.secondary:
  role==='challenger'?'multidisciplinary critic':
  role==='stewardship'?'medication safety':'clinical synthesis';
}
export function councilRoleDirective(role:CouncilRoleId,plan:CouncilLensPlan):string{
 if(role==='hypothesis')return [
  'Use a '+plan.lead+' clinical perspective to generate differential hypotheses; this is an AI role, NOT an independent human consultant.',
  SPECIALTY_TASKS[plan.lead]??'Reason from the available clinical syndrome; identify critical uncertainty.',
  'Use documented findings from ECGFounder, Gemini/Opus radiology and image-specific readers only as provisional, source-labelled evidence, not as independently verified opinions or your direct observations.',
  'Still address dangerous alternatives outside the specialty and preserve the fixed hypothesis task.',
 ].join(' ');
 if(role==='testChooser')return [
  'Use a '+plan.secondary+' clinical perspective for discriminating investigations and clinical reasoning; this is the existing AI investigation role, not an additional specialist call.',
  SPECIALTY_TASKS[plan.secondary]??'Focus on clinically decisive unanswered questions.',
  'Do not re-run imaging or ECG, infer new image findings, assume an absent examination was normal, or present model observations as signed radiology or pathology reports.',
 ].join(' ');
 if(role==='challenger')return [
  'You are the INDEPENDENT multidisciplinary clinical critic, not an organ-specific image reader.',
  'Examine contradictions between the '+plan.lead+' and '+plan.secondary+' perspectives, uncertain data, alternative diagnoses, missing emergencies, negative findings, and inappropriate management. Do not invent separate specialty votes.',
 ].join(' ');
 if(role==='stewardship')return [
  'You are the existing clinical pharmacology and treatment safety role, not a newly recruited consultant.',
  'Preserve drug names, dose and unit provenance, known interactions, allergies, organ function and their uncertainty. Distinguish previously taken drugs from a proposed prescription.',
 ].join(' ');
 return [
  'Synthesize the four existing AI roles without manufacturing agreement.',
  'Clearly distinguish model perspectives, provisional module reports, and physician-confirmed clinical findings. A specialty perspective is NOT a human expert consultation.',
  'Name unresolved questions, uncertainty, contradictions and reasons for urgent review.',
 ].join(' ');
}
