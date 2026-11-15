import test from 'node:test';
import assert from 'node:assert/strict';
import {medicationNames,nameSuggestion,discoverMedicationLabels,medicationReview,readMedicationReport} from './medication-review.ts';
import {normalizeDrugQuery} from './drug-labels.ts';
const setId='11111111-1111-4111-8111-111111111111';
function label(name='CLOPIDOGREL'){return {set_id:setId,openfda:{product_type:['HUMAN PRESCRIPTION DRUG'],generic_name:[name],route:['ORAL']},drug_interactions:['Source interaction section.'],pregnancy:['Pregnancy source information available.']};}
test('exact pasted row separates names and requires confirmation of incomplete moxifloxacin',async()=>{
 assert.deepEqual(medicationNames('клопидогрель моксифлоксаци'),['клопидогрель','моксифлоксаци']);
 assert.equal(normalizeDrugQuery('клопидогрель'),'clopidogrel');assert.equal(nameSuggestion('моксифлоксаци'),'моксифлоксацин');
 const result=await discoverMedicationLabels('клопидогрель моксифлоксаци',async()=>Response.json({results:[label()]}));
 assert.equal(result.issues[0].name,'моксифлоксаци');assert.equal(result.issues[0].suggestion,'моксифлоксацин');
});
test('no retrieved label means no paid model call and no generic safety answer',async()=>{
 let paid=0;
 await assert.rejects(()=>medicationReview({text:'synthetic',drugLabels:[{setId,title:'Synthetic'}]},{OPENROUTER_API_KEY:'test'},async url=>{
 if(String(url).includes('openrouter'))paid++;return Response.json({results:[]});
 }),/verified_labels_unavailable/);assert.equal(paid,0);
});
test('verified label excerpts produce a compact source-linked review without the clinical report template',async()=>{
 let paid=0;
 const output={pair:{status:'unassessed',text:'Only one product supplied.',sources:[]},risks:[{text:'Synthetic source-based finding.',source:'spl:'+setId,quote:'Pregnancy source information available.'}],questions:['Which formulation?'],limits:['Product labels only.']};
 const result=await medicationReview({text:'Synthetic physician context',drugLabels:[{setId,title:'Synthetic'}]},{OPENROUTER_API_KEY:'test'},async(url,init)=>{
 if(String(url).includes('api.fda.gov'))return Response.json({results:[label()]});
 paid++;assert.match(JSON.parse(String(init?.body)).messages[0].content,/Do not invent pregnancy/);
 return Response.json({choices:[{message:{content:JSON.stringify(output)}}]});
 });assert.equal(paid,1);assert.equal(result.report.questions.length,1);assert.equal(result.citations[0].url?.includes(setId),true);
 const sources=new Map([['spl:'+setId,'Pregnancy source information available.']]);
 assert.equal(readMedicationReport(JSON.stringify({...output,risks:[{...output.risks[0],quote:'Made-up quotation from nowhere.'}]}),sources),null);
});
