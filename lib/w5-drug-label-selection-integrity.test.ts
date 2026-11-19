import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_DRUG_LABELS,reviewDrugLabels,validDrugSelections} from './drug-labels.ts';
import {medicationReview} from './medication-review.ts';

const id=(n:number)=>String(n).padStart(8,'0')+'-0000-4000-8000-000000000000';
const selected=(n:number)=>Array.from({length:n},(_,index)=>({setId:id(index+1),title:'Synthetic label '+(index+1)}));

test('W5 selected-label safety: limit+1 must refuse partial source lookup without network traffic',async()=>{
 const entries=selected(MAX_DRUG_LABELS+1);
 let requests=0;
 const fetchMock:typeof fetch=async()=>{requests++;return Response.json({results:[]});};
 assert.equal(validDrugSelections(entries),false);
 const result=await reviewDrugLabels(entries,true,fetchMock);
 assert.equal(requests,0);
 assert.deepEqual(result.labels,[]);
 assert.deepEqual(result.unavailable,entries);
 assert.equal(result.externalDisabled,false);
});

test('W5 selected-label safety: no paid medication review for an incomplete selection',async()=>{
 const entries=selected(MAX_DRUG_LABELS+1);
 let requests=0;
 const fetchMock:typeof fetch=async()=>{requests++;return Response.json({results:[]});};
 await assert.rejects(()=>medicationReview({text:'Synthetic case; five source selections',drugLabels:entries},
  {OPENROUTER_API_KEY:'synthetic-not-a-key'},fetchMock),/verified_labels_unavailable/);
 assert.equal(requests,0,'Neither FDA nor model provider should be called');
});

test('W5 selected-label safety: malformed product metadata cannot launch any lookup',async()=>{
 const valid=selected(1)[0];
 const malformed=[
  [{...valid,setId:'not-a-uuid'}],
  [{...valid,title:''}],
  [{...valid,title:'injected\nnew-line'}],
 ];
 let requests=0;
 const fetchMock:typeof fetch=async()=>{requests++;return Response.json({results:[]});};
 for(const items of malformed){
  const result=await reviewDrugLabels(items,true,fetchMock);
  assert.deepEqual(result.labels,[]);
  assert.deepEqual(result.unavailable,items);
 }
 assert.equal(requests,0);
});

test('W5 selected-label safety: exact configured limit still calls retrieval without truncation',async()=>{
 const entries=selected(MAX_DRUG_LABELS);
 let requests=0;
 const fetchMock:typeof fetch=async()=>{requests++;return Response.json({results:[]});};
 const result=await reviewDrugLabels(entries,true,fetchMock);
 assert.equal(requests,MAX_DRUG_LABELS);
 assert.deepEqual(result.labels,[]);
 assert.deepEqual(result.unavailable,entries);
});

test('W5 selected-label safety: explicit offline mode remains zero-network',async()=>{
 const entries=selected(MAX_DRUG_LABELS+1);
 let requests=0;
 const result=await reviewDrugLabels(entries,false,async()=>{requests++;throw Error('unexpected network');});
 assert.equal(requests,0);
 assert.equal(result.externalDisabled,true);
 assert.deepEqual(result.unavailable,entries);
});
