import assert from 'node:assert/strict';
import test from 'node:test';
import { runConsilium, CONSILIUM_ROLES } from './consilium.ts';
import { caseAnalysisInput, exportCase, newCase } from './casebook.ts';
import { conduct } from './conductor.ts';

const env = { OPENROUTER_API_KEY: 'synthetic-no-network-key' };
const utterance = (text: string) => Response.json({
  choices: [{finish_reason:'stop',message:{content:JSON.stringify({text,source:null})}}],
  usage: {prompt_tokens:12,completion_tokens:10},
});

test('C2: one failed specialist remains unassessed, three opinions and synthesis survive',async()=>{
  const prompts:string[]=[];
  const result=await runConsilium(env,{
    locale:'en',note:'Non-patient teaching scenario: compare two synthetic hypotheses.',
    draft:'Unsigned initial explanation',citations:[]
  },async(_url,init)=>{
    const request=JSON.parse(String(init?.body)) as {messages:Array<{content:string}>};
    const system=request.messages[0]?.content??'';
    if(system.startsWith('You are the critic'))return new Response('unavailable',{status:503});
    if(system.startsWith('Synthesize the four independent opinions')){
      prompts.push(request.messages[1]?.content??'');
      return utterance('Only supplied completed opinions can be reconciled; critic not assessed.');
    }
    return utterance('Completed synthetic specialist opinion.');
  });
  assert.deepEqual(result.map(v=>v.id),CONSILIUM_ROLES.map(v=>v.id));
  assert.deepEqual(result.map(v=>v.status),['done','done','not_assessed','done','done']);
  assert.equal(result.find(v=>v.id==='challenger')?.text,'');
  assert.equal(prompts.length,1);
  assert.match(prompts[0],/challenger: NOT ASSESSED/);
  assert.match(prompts[0],/hypothesis: Completed synthetic specialist opinion/);
  assert.match(prompts[0],/Do not infer agreement/);
});

test('C2: if all four specialist opinions fail, do not pay for an empty synthesis',async()=>{
  let checklistCalls=0;
  const opinions=await runConsilium(env,{
    locale:'en',note:'Synthetic safety review with unavailable providers.',
    draft:'Unsigned response already available',citations:[]
  },async(_url,init)=>{
    const request=JSON.parse(String(init?.body)) as {messages:Array<{content:string}>};
    if(request.messages[0]?.content?.startsWith('Synthesize the four independent opinions'))checklistCalls++;
    return new Response('unavailable',{status:503});
  });
  assert.equal(checklistCalls,0);
  assert.deepEqual(opinions.map(v=>v.status),['not_assessed','not_assessed','not_assessed','not_assessed','not_assessed']);
  assert.equal(opinions.some(v=>v.text.length>0),false);
});

test('C2: two sequential case questions preserve completed opinions and explicitly carry failed-role status',async()=>{
  const clinical=newCase(102);
  clinical.context='Synthetic continuing case, no patient information.';
  clinical.question='Initial reasoning question for engineering QA';
  const initial=caseAnalysisInput(clinical);
  const first=await runConsilium(env,{
    locale:'en',note:initial.text,draft:'Unsigned draft one',citations:[]
  },async(_url,init)=>{
    const body=JSON.parse(String(init?.body)) as {messages:Array<{content:string}>};
    if(body.messages[0]?.content.startsWith('You are the critic'))return new Response('down',{status:503});
    return utterance('First synthetic completed opinion');
  });
  clinical.analyses.unshift({
    id:'analysis-1',at:'2026-11-15T10:00:00Z',question:clinical.question,
    context:initial.text,
    result:{...conduct({text:initial.text}),clinicalDraft:'generated',
      voices:first,draft:{status:'unsigned',summary:'First synthetic unsigned answer',statements:[]}}
  });
  clinical.events.push(
    {id:'added-facts',at:'2026-11-15T11:00:00Z',kind:'note',text:'New synthetic observation changes the question.'},
    {id:'question-2',at:'2026-11-15T11:01:00Z',kind:'question',text:'Which next action follows the new observation?'},
  );
  const followup=caseAnalysisInput(clinical);
  for(const phrase of ['New synthetic observation','Which next action','First synthetic unsigned answer',
    'First synthetic completed opinion','Earlier consilium INCOMPLETE','challenger']){
    assert.match(followup.text,new RegExp(phrase));
  }
  assert.doesNotMatch(followup.text,/challenger: First synthetic completed opinion/);
  const second=await runConsilium(env,{
    locale:'en',note:followup.text,draft:'Unsigned draft two',citations:[]
  },async(_url,init)=>{
    const body=JSON.parse(String(init?.body)) as {messages:Array<{content:string}>};
    const system=body.messages[0]?.content??'';
    if(system.startsWith('You suggest which test'))return new Response('down',{status:503});
    return utterance('Second synthetic completed opinion');
  });
  clinical.analyses.unshift({
    id:'analysis-2',at:'2026-11-15T11:03:00Z',question:'Which next action follows the new observation?',
    context:followup.text,
    result:{...conduct({text:followup.text}),clinicalDraft:'generated',
      voices:second,draft:{status:'unsigned',summary:'Second synthetic unsigned answer',statements:[]}}
  });
  const third=caseAnalysisInput(clinical).text;
  assert.match(third,/Earlier consilium INCOMPLETE: testChooser/);
  assert.match(third,/Earlier consilium INCOMPLETE: challenger/);
  assert.match(third,/Second synthetic completed opinion/);
  assert.match(third,/First synthetic completed opinion/);
  const saved=exportCase(clinical);
  assert.match(saved,/First synthetic unsigned answer/);
  assert.match(saved,/Second synthetic unsigned answer/);
  assert.match(saved,/New synthetic observation/);
});
