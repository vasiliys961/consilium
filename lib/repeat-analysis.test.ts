import assert from 'node:assert/strict';
import test from 'node:test';
import { newCase, caseSignature, type Analysis } from './casebook.ts';
import { conduct } from './conductor.ts';
import { runOptionsKey, duplicateCompletedRun, repeatedRunWarning, type RunOptions } from './repeat-analysis.ts';

const settings: RunOptions = {
  task:'clinical',kind:'council',consilium:true,secondOpinion:false,rereadImages:false,
  externalSearch:true,answerLocale:'ru',sourceLocale:'ru',
  retrievedSources:[{name:'guide.pdf',sha256:'c'.repeat(64)}],
};

function previousRun() {
  const clinical=newCase();clinical.context='Synthetic orthopnea and creatinine 156';
  const key=runOptionsKey(settings);
  const analysis:Analysis={
    id:'a',at:'2026-11-15T10:00:00Z',
    inputSignature:caseSignature(clinical),requestOptionsKey:key,
    context:clinical.context,
    result:{...conduct({text:clinical.context}),clinicalDraft:'generated',cost:{
      totalUsd:0.214,credits:0,steps:[],calls:[],billingComplete:true,usageComplete:true
    }},
  };
  clinical.analyses=[analysis];
  return {clinical,analysis,key};
}

test('only identical completed clinical runs trigger a paid-repeat warning',()=>{
 const {clinical,analysis,key}=previousRun();
 assert.equal(duplicateCompletedRun(analysis,caseSignature(clinical),key),true);
 assert.equal(duplicateCompletedRun(analysis,caseSignature({...clinical,context:'New clinical symptom'}),key),false);
 assert.equal(duplicateCompletedRun(analysis,caseSignature(clinical),runOptionsKey({...settings,consilium:false})),false);
 assert.equal(duplicateCompletedRun(analysis,caseSignature(clinical),runOptionsKey({...settings,secondOpinion:true})),false);
 assert.equal(duplicateCompletedRun(analysis,caseSignature(clinical),runOptionsKey({...settings,externalSearch:false})),false);
 assert.equal(duplicateCompletedRun(analysis,caseSignature(clinical),runOptionsKey({...settings,task:'management'})),false);
 assert.equal(duplicateCompletedRun(analysis,caseSignature(clinical),runOptionsKey({...settings,answerLocale:'en'})),false);
 assert.equal(duplicateCompletedRun(analysis,caseSignature(clinical),runOptionsKey({...settings,retrievedSources:[{name:'other-guide.pdf'}]})),false);
 assert.equal(duplicateCompletedRun({...analysis,requestOptionsKey:undefined},caseSignature(clinical),key),false);
 assert.equal(duplicateCompletedRun({...analysis,result:{...analysis.result,clinicalDraft:'unavailable'}},caseSignature(clinical),key),false);
});

test('a repeat warning distinguishes provider billing from estimated costs and never exposes notes',()=>{
 const {analysis}=previousRun();
 const ru=repeatedRunWarning(analysis,'ru');
 assert.match(ru,/\$0\.2140/);
 assert.match(ru,/Фактическое начисление/);
 assert.match(ru,/Запустить повторный анализ/);
 assert.doesNotMatch(ru,/orthopnea/);
 const estimate=repeatedRunWarning({...analysis,result:{...analysis.result,cost:{...analysis.result.cost,billingComplete:false}}},'en');
 assert.match(estimate,/estimated cost/);
 assert.doesNotMatch(estimate,/billed amount/);
});

test('fingerprints store option metadata, not clinical text or source contents',()=>{
 const key=runOptionsKey(settings);
 assert.match(key,/guide.pdf/);
 assert.match(key,/'c'/.repeat(64).slice(0,4)); // stable source hash marker
 assert.doesNotMatch(key,/patient|orthopnea|Clinical patient secret/i);
});
