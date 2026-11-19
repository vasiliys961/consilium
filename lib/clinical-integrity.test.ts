import assert from 'node:assert/strict';
import test from 'node:test';
import { guardGeneratedClinicalText, guardUnsupportedRestDyspnea, separateMissingFromOpposing } from './clinical-integrity.ts';
import { readClinicalReport } from './clinical-report.ts';

test('an unavailable examination is missing evidence, not evidence against',()=>{
 const result=separateMissingFromOpposing([
  'Фракция выброса и данные визуализации отсутствуют',
  'Болевой синдром не описан',
  'Ритм и признаки тромбоза вен не описаны',
  'ЭКГ не предоставлена',
  'Тропонин не измерен',
  'ECG not available',
  'No imaging results',
  'Документированная отрицательная проба с нагрузкой',
  'Нет крепитации при документированной аускультации',
 ],['Неизвестна исходная СКФ']);
 assert.deepEqual(result.opposing,[
  'Документированная отрицательная проба с нагрузкой',
  'Нет крепитации при документированной аускультации',
 ]);
 assert.equal(result.missing.length,8);
 assert.ok(result.missing.includes('Болевой синдром не описан'));
});

test('the parsed physician report moves unknown results to missing but preserves real negatives',()=>{
 const result=readClinicalReport({problem:'Dyspnea',differential:[{hypothesis:'Heart failure',supporting:['orthopnea'],opposing:['Данные визуализации отсутствуют','ЭхоКГ без снижения ФВ'],missing:[],dangerous:true}]});
 assert.deepEqual(result?.differential[0].opposing,['ЭхоКГ без снижения ФВ']);
 assert.deepEqual(result?.differential[0].missing,['Данные визуализации отсутствуют']);
});

test('unsupported dyspnea at rest is conservatively relabelled and surfaced',()=>{
 const generated={summary:'Нарастает одышка в покое',report:{facts:['одышка в покое'],tactics:{timing:'Немедленно: одышка в покое'}}};
 const result=guardGeneratedClinicalText(generated,'Прогрессирующая одышка, ортопноэ и отеки');
 assert.equal(result.changed,true);
 assert.match(result.value.summary,/в покое не уточнено/);
 assert.doesNotMatch(result.value.report.tactics.timing,/одышка в покое/);
 const documented=guardGeneratedClinicalText(generated,'Пациент описывает одышку в покое и при нагрузке');
 assert.equal(documented.changed,false);
 assert.equal(documented.value.summary,generated.summary);
 const denied=guardUnsupportedRestDyspnea('одышка в покое','Пациент отрицает одышку в покое');
 assert.equal(denied.changed,true);
});

test('unknowns are not mistaken for genuine negative examinations in English',()=>{
 const item=separateMissingFromOpposing(['Not documented','Troponin not measured','Normal troponin after serial testing'],[]);
 assert.deepEqual(item.opposing,['Normal troponin after serial testing']);
 assert.equal(item.missing.length,2);
});

test('prospective warning signs and missing-information questions are not rewritten as invented findings',()=>{
 const observed='Ортопноэ, одышка при нагрузке';
 const warning=guardUnsupportedRestDyspnea('Если появится одышка в покое — экстренная оценка.',observed);
 assert.equal(warning.changed,false);
 assert.equal(warning.text,'Если появится одышка в покое — экстренная оценка.');
 const question=guardUnsupportedRestDyspnea('Уточнить: есть ли одышка в покое?',observed);
 assert.equal(question.changed,false);
 assert.equal(question.text,'Уточнить: есть ли одышка в покое?');
});

import {auditGeneratedClinicalClaims} from './clinical-integrity.ts';
import {analyzeCase} from './analyze-case.ts';
import {W5_DIAGNOSTIC_CASES} from './w5-diagnostic-cases.ts';

test('W5 Doctor Opus: unprovided ECG described as normal raises visible source warning',()=>{
 const note='Chest pain. ECG not yet supplied; troponin pending.';
 const result=auditGeneratedClinicalClaims(note,{summary:'The ECG is normal, so no risk.'});
 assert.deepEqual(result.map(x=>x.code),['ecg_not_verified']);
 assert.equal(auditGeneratedClinicalClaims(note,{summary:'The ECG should be obtained urgently.'}).length,0);
});
test('W5 Doctor Opus: actual independently read ECG avoids a contradictory missing-ECG warning',()=>{
 const note='ECG not yet supplied by the physician at intake.';
 const result=auditGeneratedClinicalClaims(note,{summary:'The ECG is normal.'},{ecgRead:true});
 assert.deepEqual(result,[]);
});
test('W5 Doctor Opus: unavailable CTPA cannot be represented as verified negative',()=>{
 const note='DICOM CTPA series attached but not analyzed; possible PE.';
 const result=auditGeneratedClinicalClaims(note,{summary:'The CTPA is negative.'},{imagingRead:false});
 assert.deepEqual(result.map(x=>x.code),['imaging_not_verified']);
});
test('W5 Doctor Opus: stopped anticoagulant cannot silently become an active medicine',()=>{
 const note='Варфарин НЕ принимает: отменён в прошлом месяце.';
 const result=auditGeneratedClinicalClaims(note,{summary:'Пациент сейчас принимает варфарин.'});
 assert.deepEqual(result.map(x=>x.code),['discontinued_drug_as_current']);
});
test('W5 Doctor Opus: marked hypotension conflicts with unsupported stable declaration',()=>{
 const note='ФП, ЧСС 156, АД 78/50 мм рт ст.';
 const result=auditGeneratedClinicalClaims(note,{summary:'Пациент гемодинамически стабилен.'});
 assert.deepEqual(result.map(x=>x.code),['unsupported_stability']);
});
test('W5 Doctor Opus: questions and cautionary discussion are not asserted findings',()=>{
 const note='ECG not supplied; DICOM CTPA was not analyzed.';
 const result=auditGeneratedClinicalClaims(note,{summary:'Do not claim the ECG is normal. Cannot state the CTPA is negative.'});
 assert.deepEqual(result,[]);
});
test('W5 Doctor Opus: 25 existing case inputs preserve an unsigned source-audit context',()=>{
 assert.equal(W5_DIAGNOSTIC_CASES.length,25);
 for(const item of W5_DIAGNOSTIC_CASES){
  const safe=auditGeneratedClinicalClaims(item.note,{
   summary:'Review symptoms, vital signs and missing investigations before concluding.',
   report:{facts:[],limitations:['Unverified test results remain unknown']},
  });
  assert.deepEqual(safe,[],item.id);
 }
});
test('W5 Doctor Opus actual analyzeCase synthesis: mocked model hallucination surfaces warning without API billing',async()=>{
 const caseItem=W5_DIAGNOSTIC_CASES.find(x=>x.id==='DX01')!;
 let modelCalls=0;let sawNote=false;
 const output={
  summary:'The ECG is normal. ACS excluded.',statements:[],
  report:{problem:'Synthetic chest pain',facts:['The ECG is normal.'],differential:[],
   investigations:[],management:[],questions:['When was troponin sampled?'],
   limitations:['Original ECG was not provided.'],tactics:{timing:'Urgent clinical review required.'}},
 };
 const result=await analyzeCase({text:caseItem.note+'\n'+caseItem.question,task:'clinical',locale:'en',
   externalSearch:false,consilium:false,retain:false},
   {reviewed:true,env:{OPENROUTER_API_KEY:'synthetic-test-only'},fetch:async(url,init)=>{
    const endpoint=String(url);
    if(!endpoint.includes('/chat/completions'))throw Error('Unexpected external request '+endpoint);
    modelCalls++;sawNote ||= String(init?.body).includes('Serial troponin not measured');
    return Response.json({model:'mocked-doctor-opus',choices:[{finish_reason:'stop',
     message:{content:JSON.stringify(output)}}],usage:{prompt_tokens:100,completion_tokens:100}});
   }});
 assert.equal(modelCalls,1);
 assert.equal(sawNote,true);
 assert.equal(result.clinicalDraft,'generated');
 assert.equal(result.draft.summary,output.summary);
 assert.ok(result.validationWarnings?.some(x=>x.includes('ЭКГ')),JSON.stringify(result.validationWarnings));
 assert.equal(result.draft.status,'unsigned');
 assert.equal(result.gateway.called,true);
});
test('W5 Doctor Opus actual analyzeCase synthesis: no source warning for cautious mock answer',async()=>{
 const caseItem=W5_DIAGNOSTIC_CASES.find(x=>x.id==='DX01')!;
 const output={
  summary:'Possible ACS. Obtain ECG and serial troponin urgently; no ECG supplied.',statements:[],
  report:{problem:'Synthetic chest pain',facts:['ECG not provided.'],differential:[],
   investigations:[{test:'ECG',rationale:'Assess ischemia',priority:'urgent'}],
   management:[],questions:[],limitations:['No ECG or troponin.'],tactics:{timing:'Urgent evaluation.'}},
 };
 const result=await analyzeCase({text:caseItem.note+'\n'+caseItem.question,task:'clinical',locale:'en',
   externalSearch:false,consilium:false,retain:false},
   {reviewed:true,env:{OPENROUTER_API_KEY:'synthetic-test-only'},fetch:async(url)=>{
    if(!String(url).includes('/chat/completions'))throw Error('Unexpected external request');
    return Response.json({model:'mocked-doctor-opus',choices:[{finish_reason:'stop',
      message:{content:JSON.stringify(output)}}],usage:{prompt_tokens:100,completion_tokens:100}});
   }});
 assert.equal(result.clinicalDraft,'generated');
 assert.equal(result.validationWarnings?.some(x=>x.includes('ЭКГ')),false);
});
