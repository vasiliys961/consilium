import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCase } from './analyze-case.ts';
import { caseAnalysisInput, exportCase, newCase, protocolSource } from './casebook.ts';
import { conduct } from './conductor.ts';
import { networkObservation, type TracingAssessment } from '../packages/ecg/founder.ts';

const env = { OPENROUTER_API_KEY: 'synthetic-unused-key', POLZA_API_KEY: undefined };
const respond = (data: object) => Response.json({
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }],
  usage: { prompt_tokens: 24, completion_tokens: 36 },
});
const leads = ['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
const row = leads.map(()=>'0').join(',');
const ecgCsv = ['sampling_rate,500',leads.join(','),...Array.from({length:5000},()=>row)].join('\n');

test('C2: unexpected digital ECG module failure does not discard the clinical draft or invent normality',async()=>{
  const events:Array<Record<string,unknown>>=[];
  const seen:string[]=[];
  const result=await analyzeCase({
    task:'clinical',text:'Non-patient synthetic teaching question about the new ECG tracing.',
    files:[{name:'synthetic.csv',text:ecgCsv,sha256:'a'.repeat(64)}],
    locale:'en',externalSearch:false,
  },{
    env,reviewed:true,
    assessDigitalTracing: async()=>{throw new Error('PRIVATE_SHOULD_NOT_REACH_EVENTS');},
    onEvent:event=>events.push(event),
    fetch:async(_input,init)=>{
      const request=JSON.parse(String(init?.body));
      seen.push(String(request.messages?.[1]?.content??''));
      return respond({summary:'Clinical summary without ECGFounder classification',
        statements:[],report:{problem:'Synthetic ECG measurement unavailable'}});
    },
  });
  assert.equal(result.clinicalDraft,'generated');
  assert.equal(result.ecgEvidence?.status,'not_assessed');
  assert.deepEqual(result.ecgEvidence?.cleared,[]);
  assert.equal(result.ecgEvidence?.top,null);
  assert.match(result.ecgEvidence?.reason??'',/not assessed/);
  assert.match(result.draft.summary,/Clinical summary without ECGFounder/);
  assert.ok(seen.some(text=>/NOT ASSESSED/.test(text)));
  assert.ok(result.draft.statements.some(item=>/not assessed/.test(item.text)));
  assert.ok(events.some(event=>event.event==='module.failed' && event.module==='ECGFounder'));
  assert.ok(events.some(event=>event.event==='run.completed'));
  assert.doesNotMatch(JSON.stringify(events),/PRIVATE_SHOULD_NOT_REACH_EVENTS|synthetic teaching question/);
  assert.doesNotMatch(JSON.stringify(result.ecgEvidence),/PRIVATE_SHOULD_NOT_REACH_EVENTS/);
});

test('C2: unexpected consilium orchestration error preserves clinical draft and reports all missing votes',async()=>{
  const events:Array<Record<string,unknown>>=[];
  let modelCalls=0;
  const result=await analyzeCase({
    task:'management',text:'Synthetic follow-up: what changes the clinical plan?',
    locale:'en',externalSearch:false,consilium:true,
  },{
    env,reviewed:true,
    onEvent:event=>events.push(event),
    runCouncil:async()=>{throw new Error('PRIVATE_COORDINATOR_TRACE');},
    fetch:async()=>{
      modelCalls++;
      return respond({summary:'Preserved structured management answer',statements:[],
        report:{problem:'Non-patient teaching case',tactics:{nextStep:'Verify missing details'}}});
    },
  });
  assert.equal(result.clinicalDraft,'generated');
  assert.match(result.draft.summary,/Preserved structured management answer/);
  assert.equal(result.voices.length,5);
  assert.deepEqual(result.voices.map(v=>v.status),Array(5).fill('not_assessed'));
  assert.ok(result.voices.every(v=>v.text==='' && v.failure==='provider_error'));
  assert.ok(events.some(event=>event.event==='stage.failed'&&event.stage==='consilium'));
  assert.equal(modelCalls,1,'do not rerun paid synthesis to compensate for a council failure');
  const clinical=newCase();
  clinical.context='Synthetic context';
  clinical.analyses=[{id:'partial-council',at:'2026-11-15T09:00:00Z',context:clinical.context,result}];
  const followup=caseAnalysisInput(clinical).text;
  assert.match(followup,/Earlier consilium INCOMPLETE/);
  assert.match(followup,/challenger/);
  assert.match(followup,/Preserved structured management answer/);
  assert.doesNotMatch(JSON.stringify(events),/PRIVATE_COORDINATOR_TRACE/);
});

test('C2: uncompleted clinical synthesis keeps its finished technical evidence in next question with a warning',()=>{
  const clinical=newCase();
  clinical.context='Synthetic case and sources';
  const result=conduct({text:'Synthetic context'});
  result.clinicalDraft='unavailable';
  result.draft={status:'unsigned',summary:'Completed provisional image read: VISIBLE QA MARKER. Final synthesis unavailable.',statements:[]};
  clinical.analyses=[{id:'partial',at:'2026-11-15T10:00:00Z',context:'Synthetic case',result}];
  clinical.events.push({id:'followup',at:'2026-11-15T11:00:00Z',kind:'question',text:'What remains to be checked?'});
  const input=caseAnalysisInput(clinical).text;
  assert.match(input,/Prior step INCOMPLETE/);
  assert.match(input,/VISIBLE QA MARKER/);
  assert.match(input,/What remains to be checked/);
  assert.match(protocolSource(clinical),/Клинический ответ не завершён/);
  assert.match(exportCase(clinical),/VISIBLE QA MARKER/);
});

test('C2: ECG class below threshold and a model that never ran are not equivalent',()=>{
  const base:TracingAssessment={source:'trace.csv',status:'not_assessed',cleared:[],top:null,
    names:[],reason:'Technical failure'};
  assert.match(networkObservation(base),/NOT ASSESSED/);
  assert.match(networkObservation(base),/Technical failure/);
  assert.match(networkObservation(base),/does not imply a normal tracing/);
  const assessed:TracingAssessment={...base,status:'read',reason:null};
  assert.match(networkObservation(assessed),/no class cleared the threshold/);
  assert.doesNotMatch(networkObservation(assessed),/NOT ASSESSED/);
});
