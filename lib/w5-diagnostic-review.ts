import {W5_DIAGNOSTIC_CASES} from './w5-diagnostic-cases.ts';

/** The reviewer, not a keyword matcher or the model itself, decides errors. */
export type W5ReviewStatus='reviewed'|'not_assessed';
export type W5DiagnosticReview={
 caseId:string;
 status:W5ReviewStatus;
 /** Reference criteria must be adjudicated before viewing the model answer. */
 reviewer?:string;
 criticalMisses?:number;
 noncriticalMisses?:number;
 falsePositives?:number;
 fabricatedFacts?:number;
 unsupportedCertainty?:number;
 note?:string;
};
export type W5ReviewSummary={
 total:number;
 reviewed:number;
 notAssessed:number;
 reviewerPasses:number;
 casesWithCriticalMisses:number;
 criticalMisses:number;
 noncriticalMisses:number;
 falsePositives:number;
 fabricatedFacts:number;
 unsupportedCertainty:number;
 /** Denominator is reviewed cases; null when no cases are reviewed. */
 reviewedPassRate:number|null;
 coverage:number;
 /** Never infer clinical validation from model mocks or incomplete benchmark work. */
 validationStatus:'synthetic-review-only';
};

function validCount(n:unknown):n is number{
 return typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
}
/**
 * Aggregates independent human-reviewed synthetic cases. No automated
 * medical adjudication and no silent substitution of unassessed -> passed.
 */
export function summarizeW5DiagnosticReviews(reviews:readonly W5DiagnosticReview[]):W5ReviewSummary{
 const ids=new Set(W5_DIAGNOSTIC_CASES.map(item=>item.id));
 const seen=new Set<string>();
 const summary:W5ReviewSummary={
  total:ids.size,reviewed:0,notAssessed:ids.size,reviewerPasses:0,
  casesWithCriticalMisses:0,criticalMisses:0,noncriticalMisses:0,
  falsePositives:0,fabricatedFacts:0,unsupportedCertainty:0,
  reviewedPassRate:null,coverage:0,validationStatus:'synthetic-review-only',
 };
 const metrics=['criticalMisses','noncriticalMisses','falsePositives','fabricatedFacts','unsupportedCertainty'] as const;
 for(const row of reviews){
  if(!ids.has(row.caseId))throw Error('Unknown W5 diagnostic case: '+row.caseId);
  if(seen.has(row.caseId))throw Error('Duplicate review for '+row.caseId);
  seen.add(row.caseId);
  if(row.status==='not_assessed'){
   if(row.reviewer||metrics.some(key=>row[key]!==undefined))
    throw Error('Unassessed case must not carry reviewer scores: '+row.caseId);
   continue;
  }
  if(row.status!=='reviewed')throw Error('Invalid review status for '+row.caseId);
  if(!row.reviewer?.trim())throw Error('Reviewed case requires an identified reviewer role: '+row.caseId);
  for(const key of metrics)if(!validCount(row[key]))
   throw Error('Reviewed case needs a nonnegative integer '+key+': '+row.caseId);
  summary.reviewed++;
  summary.criticalMisses+=row.criticalMisses!;
  summary.noncriticalMisses+=row.noncriticalMisses!;
  summary.falsePositives+=row.falsePositives!;
  summary.fabricatedFacts+=row.fabricatedFacts!;
  summary.unsupportedCertainty+=row.unsupportedCertainty!;
  if(row.criticalMisses!>0)summary.casesWithCriticalMisses++;
  if(metrics.every(key=>row[key]===0))summary.reviewerPasses++;
 }
 summary.notAssessed=summary.total-summary.reviewed;
 summary.coverage=summary.reviewed/summary.total;
 summary.reviewedPassRate=summary.reviewed?summary.reviewerPasses/summary.reviewed:null;
 return summary;
}
