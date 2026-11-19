import {drugEntries} from './drug-interaction-rules.ts';

/**
 * W5 local documentation completeness only. No medicine-specific
 * therapeutic dose, route appropriateness or actual administration is
 * validated here. This is not a dose calculator or prescribing approval.
 */
export type DoseGap='amount_or_unit'|'concentration_only'|'route'|'frequency'|'patient_weight'|'invalid_units';
export type DoseDocumentationEntry={
 order:string;
 scope:'proposed'|'alternative';
 alternative?:string;
 gaps:DoseGap[];
};
export type DoseDocumentationReview={entries:DoseDocumentationEntry[];unexaminedAlternatives:number};

// Remove concentration expressions before searching for administered amounts.
// A bottle labelled 250 mg/5 mL is not itself a 250 mg patient dose.
const concentration=/(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|мг|мкг|г|g)\s*\/\s*(?:\d+(?:[.,]\d+)?\s*)?(?:ml|мл)\b/giu;
const amount=/(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?\s*(?:mcg|mg|µg|мкг|мг|g|г|ml|мл|mEq|ммоль|mmol|iu|units?|ед)(?![\p{L}\p{N}])/iu;
const invalidUnit=/(?:\bmg|\bmcg|мг|мкг)\s*\/\s*(?:dl|дл|l|л)(?!\p{L})/iu;
const perWeight=/(?:mg|mcg|µg|мг|мкг|g|г)\s*\/\s*(?:kg|кг)(?!\p{L})/iu;
const route=/(?:\b(?:oral|po|iv|im|sc|subcutaneous|intravenous|intramuscular|inhaled|topical|ophthalmic|rectal)\b|внутрь|перорально|в\/в|в\/м|п\/к|подкожно|ингаляц|наружно|ректально|офтальм)/iu;
const frequency=/(?:\b(?:once daily|twice daily|three times daily|daily|bid|tid|qid|q\d{1,2}h|every\s+\d+\s+(?:hours?|days?)|weekly)\b|ежедневно|(?:[1-9]\s*раз(?:а)?\s*в\s*(?:сутки|день))|каждые?\s*\d+\s*час)/iu;
function audit(order:string,scope:DoseDocumentationEntry['scope'],alternative?:string):DoseDocumentationEntry{
 const gaps:DoseGap[]=[];
 const withoutConcentration=order.replace(concentration,' ');
 const hasConcentration=concentration.test(order);
 concentration.lastIndex=0;
 const hasAmount=amount.test(withoutConcentration);
 if(invalidUnit.test(order))gaps.push('invalid_units');
 if(!hasAmount)gaps.push(hasConcentration?'concentration_only':'amount_or_unit');
 if(perWeight.test(order))gaps.push('patient_weight');
 if(!route.test(order))gaps.push('route');
 if(!frequency.test(order))gaps.push('frequency');
 return {order,scope,...(alternative?{alternative}:{}),gaps};
}
export function reviewOrderDocumentation(proposed:string,alternatives:string):DoseDocumentationReview{
 const proposedOrders=drugEntries(proposed);
 const optionNames=alternatives.split(/[\n;|]/).map(x=>x.trim()).filter(Boolean);
 const entries=[
  ...proposedOrders.map(order=>audit(order,'proposed')),
  ...optionNames.slice(0,12).flatMap(name=>drugEntries(name).map(order=>audit(order,'alternative',name))),
 ];
 return {entries,unexaminedAlternatives:Math.max(0,optionNames.length-12)};
}
