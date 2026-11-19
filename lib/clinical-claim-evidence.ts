import type { Citation } from './literature.ts';

/** Conservative evidence inspection. Lexical overlap NEVER means that an
 * intervention, dose or population is clinically supported by a publication.
 * No model calls, network access or patient data leave the browser here.
 */
export type ClaimEvidenceReview = {
  level: 'paragraph' | 'excerpt' | 'abstract' | 'bibliography';
  topicOverlap: boolean;
  missingQuantities: string[];
  unlocatedPopulation: string[];
  /** Warning only: restrictive language exists in the accessible passage. */
  restrictionLanguagePresent: boolean;
};
const STOP = new Set([
 'this','that','with','from','when','into','were','have','should','could','would','these','their',
 'patients','patient','treatment','recommendation','recommended','clinical','guideline','based',
 'evidence','therapy','consider','using','because','after','before','without','where','which',
 'при','или','для','что','это','если','после','перед','нужно','следует','можно','только',
 'лечение','пациентов','пациента','рекомендации','клинические','клинический','терапия'
]);
function tokens(text:string):Set<string>{
 return new Set((text.toLocaleLowerCase().match(/[\p{L}][\p{L}\p{N}-]{3,}/gu)??[])
  .filter(term=>!STOP.has(term)));
}
// A *whole* administered dose/biomarker quantity is one lexical value:
// 5 mg, 5 mg/kg, 5 mg/kg/day and 5 mg/5 mL are NOT equivalent.
// Detecting equal strings never proves correct indication or prescribing.
const QUANTITY=/(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?\s*(?:mEq|ммоль|mmol|ng|нг|µg|mcg|мкг|mg|мг|ml|мл|kg|кг|%|years?|лет)(?:\s*\/\s*(?:\d+(?:[.,]\d+)?\s*)?(?:kg|кг|days?|day|сутки|сут|d|hours?|hour|час|h|ml|мл|l|л|dl|дл|min|мин|m2|m²|м2|м²))?(?:\s*\/\s*(?:\d+(?:[.,]\d+)?\s*)?(?:kg|кг|days?|day|сутки|сут|d|hours?|hour|час|h|ml|мл|l|л|dl|дл|min|мин|m2|m²|м2|м²))?(?![\p{L}\p{N}\/])/giu;
function normalized(value:string){
 return value.toLocaleLowerCase().replace(/\s+/g,'').replace(/,/g,'.')
  .replace(/ммоль/g,'mmol').replace(/мкг|µg/g,'mcg')
  .replace(/мг/g,'mg').replace(/нг/g,'ng')
  .replace(/мл/g,'ml').replace(/кг/g,'kg').replace(/мин/g,'min')
  .replace(/м²|м2/g,'m2').replace(/сутки|сут/g,'day')
  .replace(/\/л(?=$|\/)/g,'/l');
}
// This warning is deliberately NOT a contradiction adjudicator. A long
// guideline excerpt can mention contraindications for an unrelated group.
const positiveTreatment=/(?:^|[.!?;]\s*|\b(?:we|clinician)\s+)(?:start|give|administer|prescribe|recommend|use)\b|(?:^|[.!?;]\s*)(?:назначить|начать|рекомендовать|применять)\b/iu;
const restrictiveText=/\b(?:contraindicat(?:ed|ion)|not recommended|do not use|must not use|avoid(?:ed)? in|should not be administered)\b|(?:противопоказан|не рекомендуется|избегать применения)/iu;
const POPULATIONS=[
 {label:'беременность',pattern:/(?:pregnan[\p{L}]*|gestation[\p{L}]*|беремен[\p{L}]*)/iu},
 {label:'детский возраст',pattern:/(?:pediatric[\p{L}]*|paediatric[\p{L}]*|children|child|adolescen[\p{L}]*|дет[\p{L}]*|подрост[\p{L}]*|педиатр[\p{L}]*)/iu},
 {label:'взрослые',pattern:/(?:adults?|взросл[\p{L}]*)/iu},
 {label:'функция почек',pattern:/(?:renal|kidney|egfr|gfr|ckd|скф|почечн[\p{L}]*)/iu},
 {label:'печёночная функция',pattern:/(?:hepatic|liver|цирроз[\p{L}]*|печен[\p{L}]*|печёночн[\p{L}]*)/iu},
];
export function reviewClaimEvidence(claim:string,card:Citation):ClaimEvidenceReview {
 const content=card.excerpt?.trim()||card.abstract?.trim()||'';
 const level:ClaimEvidenceReview['level']=card.excerpt?.trim()
  ? card.paragraph?'paragraph':'excerpt'
  :card.abstract?.trim()?'abstract':'bibliography';
 if(!content){
  // A bibliographic record has NO accessible evidence text: missing amounts
  // and patient-population scopes must stay unverified, not silently empty.
  return {level,topicOverlap:false,
   missingQuantities:[...new Set([...claim.matchAll(QUANTITY)].map(m=>m[0]))].slice(0,4),
   unlocatedPopulation:POPULATIONS.filter(item=>item.pattern.test(claim)).map(item=>item.label),
   restrictionLanguagePresent:false};
 }
 const claimTerms=tokens(claim);
 const evidenceTerms=tokens(content);
 const overlap=[...claimTerms].filter(term=>evidenceTerms.has(term)).length;
 const topicOverlap=overlap>=Math.min(2,claimTerms.size)&&claimTerms.size>0;
 // Every quantified treatment claim must be checked against the actual
 // available excerpt; a match still does NOT establish clinical correctness.
 const provided=new Set([...content.matchAll(QUANTITY)].map(match=>normalized(match[0])));
 const missingQuantities=[...new Set([...claim.matchAll(QUANTITY)]
  .map(match=>match[0]).filter(value=>!provided.has(normalized(value))))].slice(0,4);
 const sourceScope=content+' '+card.title;
 const unlocatedPopulation=POPULATIONS.filter(item=>
  item.pattern.test(claim)&&!item.pattern.test(sourceScope)).map(item=>item.label);
 return {level,topicOverlap,missingQuantities,unlocatedPopulation,
  restrictionLanguagePresent:positiveTreatment.test(claim)&&restrictiveText.test(content)};
}
