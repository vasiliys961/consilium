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
const QUANTITY=/\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|mmol|ml|kg|мг|мкг|ммоль|мл|кг|%|years?|лет|мл\/мин|ml\/min)\b/giu;
function normalized(value:string){return value.toLocaleLowerCase().replace(/\s+/g,'').replace(/,/g,'.');}
const POPULATIONS=[
 {label:'беременность',pattern:/\b(?:pregnan\w*|gestation\w*|беремен\w*)\b/iu},
 {label:'детский возраст',pattern:/\b(?:pediatric\w*|paediatric\w*|children|child|adolescen\w*|дет\w*|подрост\w*)\b/iu},
 {label:'взрослые',pattern:/\b(?:adults?|взросл\w*)\b/iu},
 {label:'функция почек',pattern:/\b(?:renal|kidney|egfr|gfr|ckd|скф|почечн\w*)\b/iu},
 {label:'печёночная функция',pattern:/\b(?:hepatic|liver|цирроз\w*|печен\w*|печёночн\w*)\b/iu},
];
export function reviewClaimEvidence(claim:string,card:Citation):ClaimEvidenceReview {
 const content=card.excerpt?.trim()||card.abstract?.trim()||'';
 const level:ClaimEvidenceReview['level']=card.excerpt?.trim()
  ? card.paragraph?'paragraph':'excerpt'
  :card.abstract?.trim()?'abstract':'bibliography';
 if(!content)return {level,topicOverlap:false,missingQuantities:[],unlocatedPopulation:[]};
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
 return {level,topicOverlap,missingQuantities,unlocatedPopulation};
}
