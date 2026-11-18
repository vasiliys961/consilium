import test from 'node:test';
import assert from 'node:assert/strict';
import {singleFrameReport} from './single-frame-report.ts';
import type {LocalVolumeReceipt} from './full-volume-receipts.ts';

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

