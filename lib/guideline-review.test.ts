import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGuidelinePlan,guidelinePrompt} from './guideline-review.ts';

test('guideline clinical AI proposes investigations and treatment for physician to edit, not automatically prescribe',()=>{
 const prompt=guidelinePrompt('ru',2);
 assert.match(prompt,/independently reason/);
 assert.match(prompt,/recommend appropriate investigations/);
 assert.match(prompt,/drug and non-drug treatment/);
 assert.match(prompt,/FOR A PHYSICIAN TO EDIT/);
 assert.match(prompt,/may use medical knowledge/);
 assert.match(prompt,/EMPTY sources array/);
 assert.match(prompt,/Do not claim that any drug is prescribed/);
 assert.match(prompt,/full guidelines/);
});
test('recommendations reject invented evidence references but may retain uncited model proposals',()=>{
 const base={summary:'Possible decompensated heart failure; needs evaluation.',differential:[],investigations:[],treatment:[{text:'Consider decongestion if congestion is confirmed',sources:[]}],monitoring:[],safety:[],uncertainties:['Current medication list unknown']};
 const keys=new Set(['E1']);
 assert.deepEqual(parseGuidelinePlan(JSON.stringify(base),keys)?.treatment,base.treatment);
 assert.equal(parseGuidelinePlan(JSON.stringify({...base,treatment:[{text:'Give medication',sources:['E999']}]}),keys),null);
 assert.equal(parseGuidelinePlan(JSON.stringify({...base,summary:'',treatment:[]}),keys),null);
 assert.equal(parseGuidelinePlan(JSON.stringify({...base,investigations:Array.from({length:11},()=>({text:'x',sources:[]}))}),keys),null);
});
test('only retrieval keys, not arbitrary source URLs, may be cited in model items',()=>{
 const result=parseGuidelinePlan(JSON.stringify({summary:'Working diagnosis',differential:[],investigations:[{text:'ECG',sources:['E1']}],treatment:[],monitoring:[],safety:[],uncertainties:[]}),new Set(['E1']));
 assert.equal(result?.investigations[0].sources[0],'E1');
 const falseSource=parseGuidelinePlan(JSON.stringify({summary:'Working diagnosis',differential:[],investigations:[{text:'ECG',sources:['https://invented.test/guideline']}],treatment:[],monitoring:[],safety:[],uncertainties:[]}),new Set(['E1']));
 assert.equal(falseSource,null);
});
