import test from 'node:test';
import assert from 'node:assert/strict';
import {medicationNames,nameSuggestion,discoverMedicationLabels,medicationReview,readMedicationReport,MEDICATION_REVIEW_MODEL} from './medication-review.ts';
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

test('C3: three common drugs resolve in Russian/Ukrainian/English without a paid normalizer',()=>{
 assert.deepEqual(medicationNames('метформин клопидогрель бисопролол'),['метформин','клопидогрель','бисопролол']);
 assert.deepEqual(medicationNames('метформін клопідогрель бісопролол'),['метформін','клопідогрель','бісопролол']);
 for(const [source,expected] of [['метформин','metformin'],['метформін','metformin'],['сиофор','metformin'],['клопідогрель','clopidogrel'],['бисопролол','bisoprolol'],['бісопролол','bisoprolol'],['Конкор','bisoprolol']]){
  assert.equal(normalizeDrugQuery(source),expected,source);
 }
});
test('C3: label review uses a single economical model and only short label excerpts',async()=>{
 assert.match(MEDICATION_REVIEW_MODEL,/flash/i);
 let calls=0;
 const extendedLabel={...label(),drug_interactions:['Relevant warning. '+'A'.repeat(20000)],warnings_and_cautions:['Relevant warning. '+'B'.repeat(20000)]};
 const response={pair:{status:'unassessed',text:'No pair established.',sources:[]},risks:[],questions:[],limits:['Partial excerpts.']};
 await medicationReview({text:'Synthetic case',drugLabels:[{setId,title:'Synthetic'}]},{OPENROUTER_API_KEY:'test'},async(url,init)=>{
  if(String(url).includes('api.fda.gov'))return Response.json({results:[extendedLabel]});
  calls++;
  const sent=JSON.parse(String(init?.body));
  assert.equal(sent.model,MEDICATION_REVIEW_MODEL);
  assert.equal(sent.max_tokens,900);
  const material=JSON.parse(sent.messages[1].content);
  assert.ok(material.sources[0].text.length<=4500);
  return Response.json({choices:[{message:{content:JSON.stringify(response)}}]});
 });
 assert.equal(calls,1);
});
