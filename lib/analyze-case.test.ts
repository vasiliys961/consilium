import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { analyzeCase } from './analyze-case.ts';
import { caseContext, newCase } from './casebook.ts';
import { writeLightDraft } from './draft.ts';
import { setTimeout as sleep } from 'node:timers/promises';
const { PNG } = createRequire(import.meta.url)('pngjs');
const png = new PNG({width:4,height:4}); png.data.fill(255);
const image = `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
const visual = {kind:'tracing',status:'read',seen:['Regular QRS complexes with preceding P waves'],reading:'Provisional visual ECG interpretation. Rate not measured.',limitations:['No calibrated rate measurement'],technical:['25 mm/s','10 mm/mV']};
const env = {OPENROUTER_API_KEY:'test-only',POLZA_API_KEY:undefined};
function response(content:unknown, finish_reason='stop') {return Response.json({choices:[{finish_reason,message:{content:JSON.stringify(content)}}],usage:{prompt_tokens:80,completion_tokens:120}});}
test('an ECG is read by Argon and its clinical synthesis does not automatically call Opus', async()=>{
 const calls:Record<string,unknown>[]=[];
 const fetch:typeof globalThis.fetch=async(input,init)=>{
  assert.match(String(input),/chat\/completions/);
  const body=JSON.parse(String(init?.body));calls.push(body);
  if(calls.length===1){
   assert.match(body.model,/gemini-4-argon/);
   assert.ok(body.messages[1].content.some((part: {type:string})=>part.type==='image_url'));
   assert.match(body.messages[0].content,/ECG image/);
   return response(visual);
  }
  assert.match(body.model,/gemini-4-argon/);
  assert.match(body.messages[1].content,/Regular QRS complexes/);
  return response({summary:'Provisional visual ECG interpretation.',statements:[]});
 };
 const result=await analyzeCase({text:'что здесь',files:[{name:'ecg2.png',image}],locale:'ru'}, {env,fetch,readWords:async()=>[]});
 assert.equal(calls.length,2);assert.equal(result.task,'interpret');assert.equal(result.ledger[0].modality,'ecg');assert.equal(result.ledger[0].status,'read');
 assert.deepEqual(result.unassessed,[]);assert.equal(result.citations.length,0);assert.match(result.draft.summary,/Provisional visual ECG/);
 assert.ok(!result.draft.statements.some(s=>/25|10/.test(s.text)));assert.equal(result.clinicalDraft,'generated');
});
test('truncated perception is retried and never sent to a summarizer as an observation',async()=>{
 let calls=0;
 const result=await analyzeCase({text:'что здесь',files:[{name:'ecg2.png',image}],locale:'ru'}, {env,readWords:async()=>[],fetch:async()=>{calls++;return response({reading:'cut off'},'length');}});
 assert.equal(calls,2);assert.equal(result.clinicalDraft,'unavailable');assert.deepEqual(result.unassessed,['ecg2.png']);assert.equal(result.draft.statements.length,0);assert.match(result.draft.summary,/обрезанный/);assert.equal(result.citations.length,0);
});
test('privacy failure withholds image and avoids fictional clinical output or paid draft',async()=>{
 let calls=0;
 const result=await analyzeCase({text:'что здесь',files:[{name:'chest.png',image}],locale:'ru'}, {env,readWords:async()=>null,fetch:async()=>{calls++;throw Error('must not call');}});
 assert.equal(calls,0);assert.equal(result.clinicalDraft,'unavailable');assert.match(result.draft.summary,/персональных данных/);assert.deepEqual(result.unassessed,['chest.png']);
});
test('generic photograph is identified by pixels and successful interpretation updates its status',async()=>{
 const result=await analyzeCase({text:'что на снимке',files:[{name:'image001.png',image}],locale:'ru'}, {env,readWords:async()=>[],fetch:async()=>response({...visual,kind:'radiograph',reading:'Visual chest findings'})});
 assert.equal(result.ledger[0].status,'read');assert.deepEqual(result.unassessed,[]);assert.match(result.draft.summary,/Visual chest/);
});
test('document content reaches the answer model and a reading question does not trigger literature',async()=>{
 const result=await analyzeCase({text:'Объясни выписку',files:[{name:'note.txt',text:'Clinical record: patient reports fatigue for three weeks. No other data supplied.'}],locale:'ru'}, {env,fetch:async(input,init)=>{
  assert.match(String(input),/chat\/completions/);const body=JSON.parse(String(init?.body));assert.match(body.messages[1].content,/fatigue/);
  return response({summary:'Document summary',statements:[]});
 }});
 assert.equal(result.task,'interpret');assert.equal(result.clinicalDraft,'generated');assert.equal(result.citations.length,0);assert.match(result.draft.summary,/Document summary/);
});
test('clinical task uses actual visual findings in structured reasoning rather than losing them',async()=>{
 let calls=0;
 const result=await analyzeCase({text:'Диагностический разбор: объясни данные',task:'clinical',files:[{name:'ecg2.png',image}],locale:'ru'}, {env,readWords:async()=>[],fetch:async(input,init)=>{
  calls++;const body=JSON.parse(String(init?.body));
  if(calls===1) return response(visual);
  assert.match(body.messages[1].content,/Regular QRS/);
  return response({summary:'Case interpretation',statements:[],report:{problem:'A provisional ECG reading',facts:['Visual findings, not detector output'],differential:[],management:[],investigations:[],questions:['Clinical context?'],limitations:['No waveform samples'],followUp:[]}});
 }});
 assert.equal(calls,2);assert.equal(result.task,'clinical');assert.equal(result.draft.report?.problem,'A provisional ECG reading');assert.deepEqual(result.unassessed,[]);
});
test('an unreadable image gives its precise limitation, not treatment boilerplate',async()=>{
 const result=await analyzeCase({text:'что здесь',files:[{name:'ecg2.png',image}],locale:'ru'}, {env,readWords:async()=>[],fetch:async()=>response({...visual,status:'unreadable',seen:[],reading:'Trace is blurred',limitations:['Only cropped corner visible']})});
 assert.equal(result.clinicalDraft,'unavailable');assert.match(result.draft.summary,/cropped corner/);assert.deepEqual(result.unassessed,['ecg2.png']);
});
test('mixed image plus document is synthesized with both evidence streams',async()=>{
 let calls=0;
 const result=await analyzeCase({text:'Что здесь?',files:[{name:'ecg2.png',image},{name:'visit.txt',text:'Clinical note: ongoing fatigue for three weeks, medicines not specified.'}],locale:'ru'}, {env,readWords:async()=>[],fetch:async(input,init)=>{
  calls++;const body=JSON.parse(String(init?.body));if(calls===1)return response(visual);
  assert.match(body.messages[1].content,/Regular QRS/);assert.match(body.messages[1].content,/fatigue/);
  return response({summary:'Combined interpretation of note and ECG',statements:[]});
 }});
 assert.equal(calls,2);assert.match(result.draft.summary,/Combined interpretation/);assert.deepEqual(result.unassessed,[]);
});
test('a failed final synthesis preserves the completed visual interpretation and says which stage failed',async()=>{
 let calls=0;
 const result=await analyzeCase({task:'clinical',text:'Diagnostic reasoning',files:[{name:'ecg2.png',image}],locale:'ru'}, {env,readWords:async()=>[],fetch:async()=>{
  calls++;return calls===1?response(visual):response({incomplete:'wrong schema'});
 }});
 assert.equal(result.clinicalDraft,'unavailable');assert.match(result.draft.summary,/Provisional visual ECG/);assert.match(result.draft.summary,/Итоговый ответ не получен/);assert.equal(result.visualReadings?.length,1);
});
test('a truncated clinical draft goes straight to Sonnet even when a second provider is configured', async () => {
 const models: string[] = [];
 const result = await analyzeCase({ task: 'management', text: 'Synthetic case question', locale: 'en', externalSearch: false }, {
  env: { ...env, OPENROUTER_API_KEY: 'test-only' },
  fetch: async (_input, init) => {
   const body = JSON.parse(String(init?.body));
   models.push(body.model);
   if (models.length === 1) return response({ summary: 'Incomplete primary answer.' }, 'length');
   assert.match(body.messages[0].content, /compact complete draft/);
   assert.match(body.messages[1].content, /Synthetic case question/);
   return response({ summary: 'Complete alternate answer.', statements: [], report: { problem: 'Test case' } });
  },
 });
 assert.deepEqual(models, ['anthropic/claude-opus-5.5', 'anthropic/claude-sonnet-5.5']);
 assert.equal(result.clinicalDraft, 'generated');
 assert.equal(result.draft.summary, 'Complete alternate answer.');
 assert.equal(result.cost.calls?.[0]?.status, 'truncated');
});

test('both synthesis models use a JSON schema and rejected completed replies are diagnosed without logging content', async () => {
 const events: Array<{ event: string; [key: string]: unknown }> = [];
 const result = await analyzeCase({ task: 'management', text: 'Synthetic case question', locale: 'en', externalSearch: false }, {
  env, onEvent: event => events.push(event), fetch: async (_input, init) => {
   const body = JSON.parse(String(init?.body));
   assert.equal(body.response_format.type, 'json_schema');
   assert.equal(body.response_format.json_schema.strict, true);
   assert.deepEqual(body.response_format.json_schema.schema.required, ['studyReports', 'summary', 'statements', 'report']);
   assert.ok(body.response_format.json_schema.schema.properties.report.required.includes('medicationSafety'));
   if (body.model.includes('opus')) {
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'Private text outside the schema.' } }] });
   }
   assert.equal(body.reasoning.effort, 'low');
   return response({ summary: 'Accepted alternate draft.', statements: [], report: { problem: 'Synthetic case' } });
  },
 });
 assert.equal(result.clinicalDraft, 'generated');
 assert.equal(result.draft.summary, 'Accepted alternate draft.');
 assert.ok(events.some(event => event.event === 'model.rejected' && event.reason === 'invalid_response'));
 assert.ok(!JSON.stringify(events).includes('Private text outside the schema.'));
});

test('the synthesis deadline reserves time for Sonnet when Opus stalls', async () => {
 const models: string[] = [];
 const result = await writeLightDraft(env, { locale: 'en', note: 'Synthetic case question', citations: [], budgetMs: 800 }, async (_input, init) => {
  const { model } = JSON.parse(String(init?.body));
  models.push(model);
  if (models.length === 1) await sleep(2000, undefined, { signal: init?.signal ?? undefined });
  return response({ summary: 'Complete alternate answer.' });
 });
 assert.deepEqual(models, ['anthropic/claude-opus-5.5', 'anthropic/claude-sonnet-5.5']);
 assert.equal(result?.summary, 'Complete alternate answer.');
});
test('duplicate upload names receive distinct evidence identities and both are processed',async()=>{
 const result=await analyzeCase({text:'Что на изображениях?',files:[{name:'image.png',image},{name:'image.png',image}],locale:'ru'},{env,readWords:async()=>[],fetch:async()=>response({...visual,kind:'radiograph'})});
 assert.equal(new Set(result.ledger.map(l=>l.source)).size,2);assert.equal(result.visualReadings?.length,2);
});
test('local physician references enter reasoning as retrieved passages, never as patient findings',async()=>{
 const result=await analyzeCase({task:'clinical',text:'atrial fibrillation',referenceFiles:[{name:'guide.txt',text:'Atrial fibrillation requires verification of rhythm and relevant clinical context.'}],locale:'en',externalSearch:false},{env,fetch:async(input,init)=>{
  assert.match(String(input),/chat\/completions/);const body=JSON.parse(String(init?.body));assert.match(body.messages[1].content,/rag:/);assert.match(body.messages[1].content,/verification of rhythm/);return response({summary:'Grounded answer',statements:[]});
 }});
 assert.equal(result.ledger.length,0);assert.equal(result.retrieval?.passages,1);assert.equal(result.retrieval?.externalSearch,false);assert.equal(result.citations[0].shelf,'local');
});
test('repeat management passes the new findings and each option’s medication checks to all consilium roles', async () => {
 const clinicalCase = newCase();
 clinicalCase.currentMedications = 'Лозартан\n\nМетформин';
 clinicalCase.events = [{ id: 'followup', at: '2026-11-10', kind: 'note', text: 'Follow-up QA marker' }];
 clinicalCase.question = 'Compare the options after the follow-up.';
 const packets: string[] = [];
 const result = await analyzeCase({
  task: 'management', text: caseContext(clinicalCase), locale: 'en', consilium: true, externalSearch: false,
  files: [{ name: 'laboratory.txt', text: 'Synthetic laboratory record LABQA: potassium value present.' }],
 }, { env, reviewed: true, fetch: async (_url, init) => {
  const { messages } = JSON.parse(String(init?.body));
  if (messages[0].content.includes('unsigned clinical reasoning draft')) return response({
   summary: 'Short summary without treatment options.', statements: [],
   report: { problem: 'QA case', management: [
    { option: 'QA alternative one', medications: ['spironolactone'], localInteractions: [{ risk: 'Untrusted model field' }] },
    { option: 'QA alternative two', medications: ['amlodipine'] },
   ], medicationSafety: { alerts: [{ combination: 'QA combination', risk: 'Follow-up risk for review' }] } },
  });
  packets.push(messages[1].content);
  return response({ text: 'QA opinion.', source: null });
 } });
 const options = result.draft.report?.management ?? [];
 assert.equal(options[0]?.localInteractions?.length, 1);
 assert.equal(options[0]?.localInteractions?.[0]?.second, 'Лозартан');
 assert.equal(options[1]?.localInteractions, undefined);
 assert.equal(packets.length, 5);
 for (const packet of packets) {
  assert.match(packet, /Follow-up QA marker/);
  assert.match(packet, /LABQA/);
  assert.match(packet, /Option 1: QA alternative one[\s\S]*Local interaction match: spironolactone \+ Лозартан[\s\S]*Option 2: QA alternative two/);
  assert.match(packet, /Follow-up risk for review/);
  assert.doesNotMatch(packet, /Untrusted model field/);
 }
 assert.match(packets[4], /Earlier voices:/);
});
test('terminal telemetry distinguishes completed clinical output and never includes request text or key',async()=>{
 const events:unknown[]=[];await analyzeCase({text:'PRIVATE_CLINICAL_TEXT',locale:'en'}, {env,fetch:async()=>response({summary:'Technical test answer',statements:[]}),onEvent:event=>events.push(event)});
 const log=JSON.stringify(events);assert.match(log,/model.started/);assert.match(log,/model.responded/);assert.match(log,/estimatedUsd/);assert.match(log,/run.completed/);assert.equal(log.includes('PRIVATE_CLINICAL_TEXT'),false);assert.equal(log.includes('test-only'),false);
});
test('live model SSE reaches the validated ECG result, keeps real usage and emits preview without logging clinical text',async()=>{
 const events:unknown[]=[];const previews:string[]=[];
 const result=await analyzeCase({text:'что здесь',files:[{name:'ecg2.png',image}],locale:'ru'},{env,streaming:true,onEvent:e=>events.push(e),onPreview:t=>previews.push(t),readWords:async()=>[],fetch:async(_input,init)=>{
  const body=JSON.parse(String(init?.body));assert.equal(body.stream,true);
  const raw=JSON.stringify(visual);const data=[raw.slice(0,150),raw.slice(150)].map(content=>'data: '+JSON.stringify({choices:[{delta:{content}}]})+'\n\n').join('')+'data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}],usage:{prompt_tokens:80,completion_tokens:120}})+'\n\ndata: [DONE]\n\n';
  return new Response(data,{headers:{'content-type':'text/event-stream'}});
 }});
 assert.equal(result.ledger[0].status,'read');assert.match(result.draft.summary,/Provisional visual ECG/);assert.equal(result.cost.calls?.[0].outputTokens,120);assert.equal(result.cost.usageComplete,true);assert.ok(previews.some(Boolean));assert.ok(!JSON.stringify(events).includes('Regular QRS'));assert.ok(!JSON.stringify(events).includes('Provisional visual ECG'));
});

test('management survives payment and streamed schema errors and accounts for failed calls',async()=>{
 const events:any[]=[];let calls=0;
 const result=await analyzeCase({task:'management',text:'Synthetic engineering question',locale:'en',externalSearch:false},{
  env:{POLZA_API_KEY:'test',OPENROUTER_API_KEY:'test'},streaming:true,onEvent:event=>events.push(event),
  fetch:async(input,init)=>{
   calls++;const body=JSON.parse(String(init?.body));
   
   assert.match(String(input),/openrouter/);
   const value=calls===1?{error:{metadata:{raw:'The compiled grammar is too large'}},choices:[{finish_reason:'error'}]}:{choices:[{delta:{content:JSON.stringify({summary:'Completed synthetic answer',statements:[],report:{problem:'Synthetic case'}})},finish_reason:'stop'}],usage:{prompt_tokens:30,completion_tokens:40}};
   assert.equal(body.response_format.type,calls===1?'json_schema':'json_object');
   return new Response('data: '+JSON.stringify(value)+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
  },
 });
 assert.equal(calls,2);assert.equal(result.draft.summary,'Completed synthetic answer');assert.equal(result.draft.report?.problem,'Synthetic case');
 assert.deepEqual(result.cost.calls?.map(call=>call.status),['failed','received']);
 assert.deepEqual(events.filter(event=>event.event==='model.rejected').map(event=>event.reason),['schema_rejected']);
 assert.ok(events.some(event=>event.event==='stage.completed'&&event.stage==='synthesis'));
});
