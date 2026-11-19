import assert from 'node:assert/strict';
import test from 'node:test';
import {newCase,caseContext,caseAnalysisInput,caseSignature,exportCase,protocolSource,
  reviseCaseEvent,finishClinicalCase,decisionDocument} from './casebook.ts';
import {conduct} from './conductor.ts';
import {CONSILIUM_ROLES,unavailableConsilium,runConsilium} from './consilium.ts';

/**
 * W5: offline regression tests for a fictional longitudinal clinical record.
 * The assertions concern only actual software behavior, preservation of
 * original statements, missing-role handling and provenance. They are NOT
 * clinical diagnostic accuracy tests or validation of LLM conclusions.
 */
function seededCase() {
  const value = newCase(905);
  value.title='Synthetic longitudinal case (not a patient)';
  value.question='Evaluate dyspnea without assuming a diagnosis';
  value.context='Возраст: 72\nЖалобы: одышка\nКалий: неизвестен\nСКФ: 38';
  value.currentMedications='апиксабан 5 мг\nметформин 500 мг';
  return value;
}
function withPriorAnalysis(summary:string) {
  const value=seededCase();
  const result=conduct({text:value.context,locale:'ru'});
  result.clinicalDraft='generated';
  result.draft.summary=summary;
  value.analyses=[{id:'synthetic-review-1',at:'2026-11-17T08:00:00Z',
    context:caseContext(value),inputSignature:caseSignature(value),result}];
  return value;
}

test('W5 case 01: preserve new symptoms, the initial question and an earlier unsigned synthesis',()=>{
  const value=withPriorAnalysis('Old unsigned hypothesis; not a confirmed diagnosis.');
  value.events.push({id:'f1',at:'2026-11-18T08:00:00Z',kind:'note',
    text:'New finding: dyspnea worse; oxygen saturation not measured'});
  value.events.push({id:'q2',at:'2026-11-18T08:10:00Z',kind:'question',
    text:'Does this change the differential?'});
  const next=caseAnalysisInput(value);
  for(const fact of ['New finding: dyspnea worse','Old unsigned hypothesis',
    'Does this change the differential?','Evaluate dyspnea without assuming a diagnosis',
    'Калий: неизвестен','СКФ: 38']){
    assert.ok(next.text.includes(fact),fact);
  }
  assert.doesNotMatch(next.text,/Калий: 4[.,]0/);
  assert.equal(value.analyses.length,1,'prior synthesis remains in history');
});

test('W5 case 02: an incomplete prior AI synthesis is not passed forward as a completed diagnosis',()=>{
  const value=withPriorAnalysis('Preliminary observations, no final answer.');
  value.analyses[0].result.clinicalDraft='unavailable';
  const next=caseAnalysisInput(value);
  assert.match(next.text,/Prior step INCOMPLETE/);
  assert.match(next.text,/no validated clinical synthesis/);
  assert.match(next.text,/Preliminary observations/);
  assert.match(protocolSource(value),/Клинический ответ не завершён/);
});

test('W5 case 03: missing consilium roles retain a non-vote and no invented response',()=>{
  const value=withPriorAnalysis('Unresolved clinical question.');
  const voices=unavailableConsilium('deadline');
  voices[0]={...voices[0],status:'done',model:'mock-hypothesis',text:'Hypothesis: uncertain etiology',failure:undefined};
  voices[1]={...voices[1],status:'done',model:'mock-test',text:'Suggested test: objective measurement',failure:undefined};
  voices[2]={...voices[2],text:'PHANTOM OPINION MUST NEVER APPEAR'};
  value.analyses[0].result.voices=voices;
  const followUp=caseAnalysisInput(value).text;
  assert.match(followUp,/Hypothesis: uncertain etiology/);
  assert.match(followUp,/Suggested test: objective measurement/);
  assert.match(followUp,/Earlier consilium INCOMPLETE/);
  assert.match(followUp,/challenger/);
  assert.doesNotMatch(followUp,/PHANTOM OPINION MUST NEVER APPEAR/);
});

test('W5 case 04: exporting a case preserves independent contradictory AI roles and missing voices',()=>{
  const value=withPriorAnalysis('Conclusions remain disputed; physician review needed.');
  const voices=unavailableConsilium('deadline');
  voices[0]={...voices[0],status:'done',model:'mock-hypothesis',
    text:'Hypothesis view: consider condition A.',failure:undefined};
  voices[1]={...voices[1],status:'done',model:'mock-test',
    text:'Testing view: confirm uncertainty with measurement.',failure:undefined};
  voices[2]={...voices[2],status:'done',model:'mock-critic',
    text:'Critic disagrees: condition A is poorly supported.',failure:undefined};
  voices[3]={...voices[3],text:'INVENTED SAFETY CLEARANCE'};
  value.analyses[0].result.voices=voices;
  const exported=exportCase(value);
  for(const fragment of ['AI-роли консилиума','Роль hypothesis','mock-hypothesis',
    'Hypothesis view','Роль challenger','Critic disagrees','Роль stewardship','НЕ ОЦЕНЕНО',
    'не решение врача']){
    assert.ok(exported.includes(fragment),fragment);
  }
  assert.doesNotMatch(exported,/INVENTED SAFETY CLEARANCE/);
  assert.ok(exported.indexOf('Hypothesis view')<exported.indexOf('Critic disagrees'));
});

test('W5 case 05: no votes yields no fabricated consensus in an exported case',()=>{
  const value=withPriorAnalysis('Analysis pending review.');
  value.analyses[0].result.voices=unavailableConsilium('deadline');
  const exported=exportCase(value);
  assert.match(exported,/Роль checklist[^\n]*НЕ ОЦЕНЕНО/);
  assert.doesNotMatch(exported,/единогласн|все согласны|unanimous/i);
});

test('W5 case 06: an amended physician decision remains in export audit trail',()=>{
  const value=seededCase();
  value.events=[{id:'decision-1',kind:'decision',at:'2026-11-17T10:00:00Z',
    text:'Initial physician decision: request confirmation'}];
  const changed=reviseCaseEvent(value,'decision-1',
    'Revised physician decision: reassess after test','2026-11-18T10:00:00Z');
  const exported=exportCase(changed);
  assert.match(exported,/Revised physician decision: reassess after test/);
  assert.match(exported,/Initial physician decision: request confirmation/);
  assert.match(exported,/Предыдущая редакция/);
  assert.equal(changed.events[0].revisions?.length,1);
  assert.equal(value.events[0].text,'Initial physician decision: request confirmation');
});

test('W5 case 07: generating a draft never authorizes automatic case closure',()=>{
  const value=withPriorAnalysis('AI proposal without physician signature');
  assert.throws(()=>finishClinicalCase(value,''),/Сначала запишите решение врача/);
  assert.equal(value.status,'active');
  const reviewed=finishClinicalCase(value,'Physician-approved decision',undefined,'2026-11-19T10:00:00Z');
  assert.match(decisionDocument(reviewed),/Physician-approved decision/);
  assert.equal(reviewed.status,'closed');
  assert.match(exportCase(reviewed),/AI proposal without physician signature/);
});

test('W5 case 08: changes in case facts mark prior protocol synthesis as stale',()=>{
  const value=withPriorAnalysis('Old summary using former laboratory values');
  assert.match(protocolSource(value),/Предварительный разбор, проверить врачу/);
  value.events.push({id:'new-lab',kind:'note',at:'2026-11-19T11:00:00Z',
    text:'Repeat eGFR: 24; confirm before use'});
  assert.match(protocolSource(value),/Предыдущий предварительный разбор/);
  assert.match(protocolSource(value),/Repeat eGFR: 24/);
  assert.match(protocolSource(value),/Old summary using former laboratory values/);
});

test('W5 case 09: DICOM waiting for postponed Radiology is unassessed, not falsely normal',()=>{
  const value=seededCase();
  value.files=[{name:'synthetic-series.dcm',processingModule:'radiology',sha256:'a'.repeat(64)}];
  const input=caseAnalysisInput(value);
  assert.equal(input.pendingModules.length,1);
  assert.match(input.text,/IMAGING NOT ASSESSED BY RADIOLOGY/);
  assert.match(input.text,/do NOT infer image findings, normality, measurements/);
  assert.equal(input.reusedSources.length,0);
});

test('W5 case 10: independent clinical cases do not exchange follow-ups or analyses',()=>{
  const first=withPriorAnalysis('First case preliminary hypothesis');
  first.events.push({id:'f1',kind:'note',at:'2026-11-19T07:00:00Z',text:'Patient-A-only fictional observation'});
  const second=seededCase();
  const secondText=caseAnalysisInput(second).text;
  assert.notEqual(first.id,second.id);
  assert.doesNotMatch(secondText,/Patient-A-only|First case preliminary hypothesis/);
  assert.equal(second.analyses.length,0);
  assert.equal(second.events.length,0);
});

test('W5 case 11: an offline mock consilium preserves dissent and an unavailable critic',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-19T12:00:00Z')});
  try{
    let synthPrompt='';
    const fetchMock:typeof fetch=async(_url,init)=>{
      const body=JSON.parse(String(init?.body)) as {messages:Array<{content:string}>};
      const roleTask=body.messages[0]?.content??'';
      if(roleTask.startsWith('You are the critic'))return new Response('unavailable',{status:503});
      if(roleTask.startsWith('Synthesize the four'))synthPrompt=body.messages[1]?.content??'';
      const opinion=roleTask.startsWith('You list differential')
        ?'Hypothesis: pneumonia possible, not proven.'
        :roleTask.startsWith('You suggest which test')
        ?'Testing: repeat oxygen saturation before conclusion.'
        :roleTask.startsWith('Review the proposed management')
        ?'Safety: anticoagulant use needs verification.'
        :'Synthesis: uncertainty remains; missing critic is not agreement.';
      return Response.json({choices:[{message:{content:JSON.stringify({text:opinion,source:null})}}],
        usage:{prompt_tokens:18,completion_tokens:20}});
    };
    const voices=await runConsilium({OPENROUTER_API_KEY:'synthetic-only'},
      {note:'Fictional dyspnea; pulse oximetry unknown',locale:'en',draft:'Uncertain',citations:[]},
      fetchMock);
    assert.equal(voices.length,CONSILIUM_ROLES.length);
    assert.equal(voices.find(v=>v.id==='challenger')?.status,'not_assessed');
    assert.equal(voices.find(v=>v.id==='hypothesis')?.status,'done');
    assert.equal(voices.find(v=>v.id==='checklist')?.status,'done');
    assert.match(synthPrompt,/challenger: NOT ASSESSED/);
    assert.match(synthPrompt,/Hypothesis: pneumonia possible/);
    assert.match(synthPrompt,/Testing: repeat oxygen saturation/);
    assert.match(synthPrompt,/Safety: anticoagulant use/);
    assert.ok(!JSON.stringify(voices).includes('synthetic-only'));
  }finally{t.mock.timers.reset();}
});
