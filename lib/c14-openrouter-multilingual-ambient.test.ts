import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AMBIENT_PRIMARY_STT,AMBIENT_FALLBACK_STT,ambientModelSelection,transcribeAmbientOpenRouter} from '../integrations/protocol/en/lib/concilium-openrouter-stt.ts';
import {ambientModelSelection as ruModels,transcribeAmbientOpenRouter as ruTranscribe} from '../integrations/protocol/ru/lib/concilium-openrouter-stt.ts';

const repo=(path:string)=>readFileSync(path,'utf8');
function withMock<T>(request:(url:string,init:RequestInit)=>Promise<Response>,action:()=>Promise<T>):Promise<T>{
 const original=globalThis.fetch,key=process.env.OPENROUTER_API_KEY,model=process.env.CONCILIUM_AMBIENT_STT_MODEL;
 process.env.OPENROUTER_API_KEY='SYNTHETIC_TEST_KEY_ONLY';
 delete process.env.CONCILIUM_AMBIENT_STT_MODEL;
 globalThis.fetch=((url:URL|string|Request,init?:RequestInit)=>request(String(url),init??{})) as typeof fetch;
 return action().finally(()=>{globalThis.fetch=original;if(key===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=key;if(model===undefined)delete process.env.CONCILIUM_AMBIENT_STT_MODEL;else process.env.CONCILIUM_AMBIENT_STT_MODEL=model;});
}

test('C14: only two approved STT models, same priority for RU and Global',()=>{
 assert.deepEqual(ambientModelSelection({} as NodeJS.ProcessEnv),[AMBIENT_PRIMARY_STT,AMBIENT_FALLBACK_STT]);
 assert.deepEqual(ruModels({} as NodeJS.ProcessEnv),[AMBIENT_PRIMARY_STT,AMBIENT_FALLBACK_STT]);
 assert.deepEqual(ambientModelSelection({...process.env,CONCILIUM_AMBIENT_STT_MODEL:AMBIENT_FALLBACK_STT}),[AMBIENT_FALLBACK_STT,AMBIENT_PRIMARY_STT]);
 assert.throws(()=>ambientModelSelection({...process.env,CONCILIUM_AMBIENT_STT_MODEL:'unapproved/custom'}),/Unsupported/);
});

test('C14: all 11 encounter languages use the existing OpenRouter key and dedicated STT API',async()=>{
 const languages=['ru','en','es','fr','ar','hi','pt','id','ms','tr','zh'];
 let calls=0;
 await withMock(async(url,init)=>{
  calls++;
  assert.equal(url,'https://openrouter.ai/api/v1/audio/transcriptions');
  assert.equal(new Headers(init.headers).get('authorization'),'Bearer SYNTHETIC_TEST_KEY_ONLY');
  const payload=JSON.parse(String(init.body));
  assert.ok(languages.includes(payload.language));
  assert.equal(payload.model,AMBIENT_PRIMARY_STT);
  assert.equal(payload.input_audio.format,'webm');
  assert.equal(payload.response_format,'verbose_json');
  assert.equal(payload.provider.options.azure.diarization.enabled,true);
  return Response.json({text:'Synthetic interview: no penicillin allergy. Warfarin 5 mg.',usage:{seconds:12,cost:0.0003}});
 },async()=>{
  for(const lang of languages){
   const result=await (lang==='ru'?ruTranscribe:transcribeAmbientOpenRouter)(new Uint8Array([1,2,3]).buffer,'audio/webm;codecs=opus',lang);
   assert.match(result.text,/no penicillin allergy/);
   assert.equal(result.costUsd,0.0003);
   assert.equal(result.duration,12);
  }
 });
 assert.equal(calls,languages.length);
});

test('C14: acoustic speaker IDs are preserved without asserting doctor/patient roles',async()=>{
 await withMock(async()=>Response.json({segments:[
  {speaker:0,text:'Не принимаю варфарин 5 мг.'},
  {speaker:1,text:'Аллергия на пенициллин?'}
 ],usage:{seconds:8,cost:0.00005}}),async()=>{
  const result=await ruTranscribe(new Uint8Array([3,4]).buffer,'audio/webm','ru');
  assert.equal(result.speakerLabels,true);
  assert.equal(result.text,'Speaker 0: Не принимаю варфарин 5 мг.\nSpeaker 1: Аллергия на пенициллин?');
  assert.doesNotMatch(result.text,/Врач:|Пациент:/);
 });
});

test('C14: predictable fallback on unsupported primary model, no silent retry after server failure',async()=>{
 const attempted:string[]=[];
 await withMock(async(_url,init)=>{
  const request=JSON.parse(String(init.body));attempted.push(request.model);
  return attempted.length===1?Response.json({error:'unsupported'},{status:400}):Response.json({text:'No dyspnea.',usage:{seconds:3,cost:0.00001}});
 },async()=>{
  const output=await transcribeAmbientOpenRouter(new Uint8Array([1]).buffer,'audio/ogg','en');
  assert.equal(output.model,AMBIENT_FALLBACK_STT);
  assert.equal(output.text,'No dyspnea.');
 });
 assert.deepEqual(attempted,[AMBIENT_PRIMARY_STT,AMBIENT_FALLBACK_STT]);
 let count=0;
 await withMock(async()=>{count++;return Response.json({error:'provider failure'},{status:502})},async()=>{
  await assert.rejects(()=>transcribeAmbientOpenRouter(new Uint8Array([1]).buffer,'audio/wav','en'),/HTTP 502/);
 });
 assert.equal(count,1);
});

test('C14: missing key and unsafe audio arguments fail before network calls',async()=>{
 const key=process.env.OPENROUTER_API_KEY;
 delete process.env.OPENROUTER_API_KEY;
 try{await assert.rejects(()=>transcribeAmbientOpenRouter(new Uint8Array([1]).buffer,'audio/wav','ru'),/OPENROUTER_API_KEY/)}
 finally{if(key!==undefined)process.env.OPENROUTER_API_KEY=key}
 await withMock(async()=>{throw Error('No network request expected')},async()=>{
  await assert.rejects(()=>transcribeAmbientOpenRouter(new Uint8Array([1]).buffer,'text/plain','ru'),/Unsupported audio/);
  await assert.rejects(()=>transcribeAmbientOpenRouter(new Uint8Array([1]).buffer,'audio/wav','invalid-locale'),/Invalid transcription language/);
  await assert.rejects(()=>transcribeAmbientOpenRouter(new ArrayBuffer(0),'audio/wav','en'),/Audio must/);
 });
});

test('C14: Global 10 locales, correct Preview origin and configured OpenRouter speech readiness',()=>{
 const langs=repo('integrations/protocol/en/lib/i18n/config.ts');
 for(const locale of ['en','es','fr','ar','hi','pt-BR','id','ms','tr','zh-CN'])
  assert.match(langs,new RegExp("'"+locale.replace('-','\\-')+"'"));
 const mapping=repo('integrations/protocol/en/lib/i18n/stt-language.ts');
 for(const code of ['en','es','fr','ar','hi','pt','id','ms','tr','zh'])
  assert.match(mapping,new RegExp("'"+code+"'"));
 const route=repo('integrations/protocol/en/app/api/transcribe/route.ts');
 const health=repo('integrations/protocol/en/app/api/concilium/health/route.ts');
 const page=repo('integrations/protocol/en/app/protocol/page.tsx');
 assert.match(route,/3212/);
 assert.match(route,/nativeAudioGuard\(request\)/);
 assert.match(route,/transcribeAmbientOpenRouter/);
 assert.match(health,/speechConfigured:configured/);
 assert.match(page,/setSpeechReady\(v.speechConfigured===true\)/);
 assert.match(page,/openrouterOnly=\{speechProvider==='openrouter'\}/);
});

test('C14: model draft never auto-inserts; transcript and document locale are reviewed before manual transfer',()=>{
 for(const edition of ['ru','en']){
  const page=repo('integrations/protocol/'+edition+'/app/protocol/page.tsx');
  assert.doesNotMatch(page,/autoInsertConversationToProtocol/);
  assert.match(page,/draftSourceTranscript!==conversationTranscriptText.trim\(\)/);
  assert.match(page,/setConversationTranscriptText\(previous=>/);
  assert.match(page,/onClick=\{\(\)=>void buildDraftFromConversation\(conversationTranscriptText\)\}/);
  assert.match(page,/recordedDraftText/);
  assert.doesNotMatch(page,/setRecordedDraftText\(safeTranscript\)/);
 }
 assert.match(repo('integrations/protocol/en/app/protocol/page.tsx'),/draftSourceLocale!==locale/);
});
