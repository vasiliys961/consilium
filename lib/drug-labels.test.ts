import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeCase } from './analyze-case.ts';
import { drugLabelCitations, reviewDrugLabels, searchDrugLabels } from './drug-labels.ts';
import { readDraft, sourceKeys } from './draft.ts';
import { preparePrivacy } from './privacy-prepare.ts';

const ID = '2f47aa0e-0235-4220-85dd-dfcb8ad0d009';
const OTHER = '1523ab32-2c2c-6501-e063-6394a90aa0b3';
const SOURCE = {
  set_id: ID, version: '3', effective_time: '20230509',
  openfda: { brand_name: ['ELIQUIS'], generic_name: ['APIXABAN'], route: ['ORAL'], product_ndc: ['0003-0893'], product_type: ['HUMAN PRESCRIPTION DRUG'] },
  contraindications: ['Synthetic label fixture: active pathological bleeding.'],
  dosage_and_administration: ['Synthetic dosage field used only to test the data path.'],
};

test('public lookup matches exact medicine and NDC, rejects unrelated products and unsafe query text', async () => {
  const urls:URL[]=[];
  const fetchImpl:typeof fetch=async input=>{
    urls.push(new URL(String(input)));
    return Response.json({results:[SOURCE,{...SOURCE,set_id:OTHER,openfda:{...SOURCE.openfda,brand_name:['OTHER'],generic_name:['OTHER'],product_ndc:['12345-123']}}]});
  };
  const labels=await searchDrugLabels('апиксабан',fetchImpl);
  assert.deepEqual(labels.map(item=>item.setId),[ID]);
  assert.equal(labels[0].date,'2023-05-09');
  assert.deepEqual(labels[0].route,['ORAL']);
  assert.match(urls[0].searchParams.get('search') ?? '', /generic_name\.exact:"APIXABAN"/);
  assert.deepEqual((await searchDrugLabels('0003-0893',fetchImpl)).map(item=>item.setId),[ID]);
  await assert.rejects(searchDrugLabels('apixaban" OR *:*',fetchImpl));
  assert.equal(urls.length,2);
});

test('a selected label never substitutes another product and external opt-out prevents FDA calls', async () => {
  let calls=0;
  const fetchImpl:typeof fetch=async()=>{calls++;return Response.json({results:[{...SOURCE,set_id:OTHER}]});};
  const selected=[{setId:ID,title:'ELIQUIS (APIXABAN)'}];
  const disabled=await reviewDrugLabels(selected,false,fetchImpl);
  assert.equal(calls,0);
  assert.equal(disabled.externalDisabled,true);
  const mismatch=await reviewDrugLabels(selected,true,fetchImpl);
  assert.equal(calls,1);
  assert.deepEqual(mismatch.labels,[]);
  assert.deepEqual(mismatch.unavailable,selected);
});

test('product instructions support a traceable option but cannot authorize an immediate order',async()=>{
  const review=await reviewDrugLabels([{setId:ID,title:'Eliquis'}],true,async()=>Response.json({results:[SOURCE]}));
  const [citation]=drugLabelCitations(review.labels,'2026-11-09');
  const keys=sourceKeys([citation]);
  const draft=readDraft(JSON.stringify({
    summary:'Synthetic case',
    statements:[{text:'Start the medication.',source:`spl:${ID}`}],
    report:{problem:'Synthetic problem',tactics:{nextStep:'Clarify bleeding history',escalate:'Active bleeding'},management:[
      {option:'Option for physician review',sources:[`spl:${ID}`,'spl:forged'],medications:['Apixaban',' apixaban ','apixaban 5 mg']},
      {option:'Separate alternative',medications:['warfarin']},
    ]},
  }),keys);
  assert.equal(keys.has(citation.url!),false);
  assert.equal(draft?.statements[0].held,true);
  assert.deepEqual(draft?.report?.management[0].sources,[`spl:${ID}`]);
  assert.deepEqual(draft?.report?.management.map(option=>option.medications),[['apixaban'],['warfarin']]);
  assert.equal(draft?.report?.tactics?.nextStep,'Clarify bleeding history');
});

test('selected label survives review and reaches the treatment draft with its real source key',async()=>{
  const privateToken='SYNTHETIC_CASE_CONTEXT_SENTINEL';
  const reviewed=await preparePrivacy({text:`${privateToken}. What is the treatment strategy?`,locale:'en',task:'management',externalSearch:true,drugLabels:[{setId:ID,title:'Eliquis'}]},{finalize:true});
  const fdaRequests:string[]=[];
  const modelRequests:string[]=[];
  const result=await analyzeCase(reviewed.body,{reviewed:true,env:{OPENROUTER_API_KEY:'synthetic-test-key',POLZA_API_KEY:undefined},fetch:async(input,init)=>{
    const url=String(input);
    if(url.startsWith('https://api.fda.gov/')){fdaRequests.push(url);return Response.json({results:[SOURCE]});}
    if(url.includes('/chat/completions')){
      modelRequests.push(String(init?.body));
      return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary:'Synthetic fixture only',statements:[],report:{problem:'Synthetic problem',management:[{option:'Discuss contraindications',sources:[`spl:${ID}`]}]}})}}]});
    }
    return Response.json({resultList:{result:[]}});
  }});
  assert.equal(fdaRequests.length,1);
  assert.ok(fdaRequests[0].includes(ID));
  assert.ok(!fdaRequests[0].includes(privateToken));
  assert.ok(modelRequests.some(body=>body.includes('active pathological bleeding')&&body.includes(`spl:${ID}`)));
  assert.equal(result.medicationReview?.labels[0].setId,ID);
  assert.deepEqual(result.draft.report?.management[0].sources,[`spl:${ID}`]);
});
