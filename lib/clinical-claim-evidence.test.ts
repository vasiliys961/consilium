import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewClaimEvidence} from './clinical-claim-evidence.ts';
import type {Citation} from './literature.ts';
const citation=(extra:Partial<Citation>={}):Citation=>({
 shelf:'world',title:'Example clinical guideline',url:'https://example.org/guideline',
 retrieved:'2026-11-16',license:null,country:null,pmid:'101',
 journal:null,year:'2025',pdf:null,edition:null,chapter:null,page:null,...extra
});
test('bibliography is not read content and cannot be treated as supportive',()=>{
 const x=reviewClaimEvidence('Start treatment with 5 mg',citation());
 assert.deepEqual(x,{level:'bibliography',topicOverlap:false,missingQuantities:[],unlocatedPopulation:[]});
});
test('an abstract is never promoted to a full text paragraph',()=>{
 const x=reviewClaimEvidence('atrial fibrillation management',citation({
  abstract:'This is a review of atrial fibrillation management and outcomes.'}));
 assert.equal(x.level,'abstract');assert.equal(x.topicOverlap,true);
});
test('full text retains paragraph level but thematic match is not a clinical verification',()=>{
 const x=reviewClaimEvidence('Treatment of atrial fibrillation',citation({
  excerpt:'Treatment of atrial fibrillation must consider bleeding risk and renal function.',paragraph:42,chapter:'Recommendations'}));
 assert.equal(x.level,'paragraph');assert.equal(x.topicOverlap,true);
});
test('a claimed numerical regimen absent in the excerpt is flagged without inventing a contradiction',()=>{
 const x=reviewClaimEvidence('Use 20 mg and recheck after 2 weeks',citation({
  excerpt:'Use 5 mg in the selected adult population.',paragraph:1}));
 assert.deepEqual(x.missingQuantities,['20 mg']);
});
test('a matching dose is not reported missing, but scope is still inspected separately',()=>{
 const x=reviewClaimEvidence('Give 5 mg in pregnancy',citation({excerpt:'Consider 5 mg in adults.',paragraph:2}));
 assert.deepEqual(x.missingQuantities,[]);
 assert.deepEqual(x.unlocatedPopulation,['беременность']);
});
test('RU population and renal prerequisites absent from the passage stay unlocated',()=>{
 const x=reviewClaimEvidence('При беременности и снижении СКФ препарат назначить с осторожностью',citation({
  excerpt:'This drug reduces recurrence in selected adults.'}));
 assert.deepEqual(x.unlocatedPopulation,['беременность','функция почек']);
});
test('short claims and another language cannot be falsely marked as topical matches',()=>{
 const x=reviewClaimEvidence('диуретик',citation({abstract:'Loop diuretics have important monitoring requirements.'}));
 assert.equal(x.topicOverlap,false);
});
