import test from 'node:test';
import assert from 'node:assert/strict';
import {retainRadiologyViewer} from './radiology-viewer-lifecycle.ts';
import {singleFrameReport} from '../integrations/radiology/web/lib/single-frame-report.ts';
import type {LocalVolumeReceipt} from '../integrations/radiology/web/lib/full-volume-receipts.ts';
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
const receipt:LocalVolumeReceipt={batchIndex:0,usage:{inputTokens:100,outputTokens:70},findings:[{
 sourceIndex:0,pass:'overview',anatomy:'Синтетическая структура',sign:'Учебный признак 4 мм',uncertainty:'Не подтверждён на соседних срезах',localization:'Справа',morphology:'Учебная неровность',
}],limitations:['Один срез'],structuredReview:{structures:[{
 sliceNumbers:[1],anatomy:'Учебная область',visibility:'partial',description:'Синтетический пример, не пациент',importantNegatives:['На видимой части признак не обнаружен'],limitations:'Остальные отделы не представлены',
}],imageQuality:[{sliceNumber:1,quality:'limited',limitations:'Учебная копия'}]}};

test('A single paid slice produces the visible description with all morphology, negatives and uncertainty, without another model',()=>{
 const report=singleFrameReport([receipt],'CT',0,20);
 for(const text of ['ОПИСАНИЕ','Срез','Учебная область','Синтетический пример, не пациент','4 мм','Справа','Учебная неровность','Не подтверждён на соседних срезах','На видимой части признак не обнаружен','Остальные отделы не представлены','Учебная копия'])assert.ok(report.toLowerCase().includes(text.toLowerCase()),text);
 assert.match(report,/Оценён срез 1 из 20/);assert.match(report,/Полное исследование не оценивалось/);assert.match(report,/требует проверки врачом/);
});

test('No completed or foreign slice can become a description of this DICOM',()=>{
 assert.throws(()=>singleFrameReport([],'CT',0,1));
 assert.throws(()=>singleFrameReport([receipt,receipt],'CT',0,2));
 assert.throws(()=>singleFrameReport([receipt],'CT',1,2));
 assert.throws(()=>singleFrameReport([{...receipt,structuredReview:undefined}],'CT',0,1));
 assert.throws(()=>singleFrameReport([{...receipt,findings:[{...receipt.findings[0],sourceIndex:2}]}],'CT',0,3));
});

test('Only an actual numeric provider charge crosses the Radiology log boundary; patient text never does',()=>{
 const event={event:'model.responded',runId:'11111111-1111-4111-8111-111111111111',model:'google/gemini-3.8-flash',provider:'openrouter',billedUsd:.012345,usageAvailable:true,inputTokens:100,outputTokens:70,text:'PRIVATE_CLINICAL_TEXT'};
 const captured=radiologyTelemetry('CONCILIUM_MODEL '+JSON.stringify(event));
 assert.equal(captured?.billedUsd,.012345);assert.doesNotMatch(JSON.stringify(captured),/PRIVATE_CLINICAL_TEXT/);
 assert.equal(radiologyTelemetry('CONCILIUM_MODEL '+JSON.stringify({...event,billedUsd:'0.012345'}))?.billedUsd,undefined);
});
