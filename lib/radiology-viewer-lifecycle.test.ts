import test from 'node:test';
import assert from 'node:assert/strict';
import {retainRadiologyViewer} from './radiology-viewer-lifecycle.ts';
import {radiologyTelemetry} from './radiology-telemetry.ts';

test('Slow health checks never evict an already opened DICOM viewer or its in-flight study',()=>{
 let opened=false,mounts=0;
 for(const running of [false,null,undefined,'true',true,false,false,null,true]){
  const next=retainRadiologyViewer(opened,running);
  if(next&&!opened)mounts++;
  if(opened)assert.equal(next,true,'a failed health probe must not destroy patient-side files and preparation');
  opened=next;
 }
 assert.equal(mounts,1);assert.equal(opened,true);
});
test('Only an actual numeric provider charge crosses the Radiology log boundary; patient text never does',()=>{
 const event={event:'model.responded',runId:'11111111-1111-4111-8111-111111111111',model:'google/gemini-3.8-flash',provider:'openrouter',billedUsd:.012345,usageAvailable:true,inputTokens:100,outputTokens:70,text:'PRIVATE_CLINICAL_TEXT'};
 const captured=radiologyTelemetry('CONCILIUM_MODEL '+JSON.stringify(event));
 assert.equal(captured?.billedUsd,.012345);assert.doesNotMatch(JSON.stringify(captured),/PRIVATE_CLINICAL_TEXT/);
 assert.equal(radiologyTelemetry('CONCILIUM_MODEL '+JSON.stringify({...event,billedUsd:'0.012345'}))?.billedUsd,undefined);
});
