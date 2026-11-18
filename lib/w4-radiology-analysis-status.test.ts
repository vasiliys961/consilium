import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRadiologyAnalysisStatus,radiologyAnalysisStatus,radiologyAnalysisNotice} from './radiology-analysis-status.ts';
import {workspaceText,WORKSPACE_LANGUAGES} from './workspace-i18n.ts';
const base={schema:'opus-deidentified-openrouter-pilot-readiness/v1',provider:'openrouter',enabled:true,workstationConnected:true,configurationStatus:'ready'};

test('Running viewer is not proof of analysis readiness; response must match the reviewed OpenRouter contract',()=>{
 assert.equal(parseRadiologyAnalysisStatus(base),'ready');
 for(const raw of [null,[],{},'ready',{...base,enabled:'true'},{...base,enabled:false},{...base,workstationConnected:false},{...base,provider:'polza'},{...base,schema:'other-module'}])assert.notEqual(parseRadiologyAnalysisStatus(raw),'ready');
 assert.equal(parseRadiologyAnalysisStatus({...base,configurationStatus:'not-approved',enabled:false,workstationConnected:false}),'not-approved');
});

test('Read-only readiness check uses only local GET, exports a bounded status and never forwards keys or tokens',async()=>{
 let calls=0;
 const status=await radiologyAnalysisStatus(async(url,init)=>{
  calls++;assert.match(String(url),/^http:\/\/127\.0\.0\.1:(3110|3210)\/api\/ai\/deidentified-openrouter-review$/);
  assert.equal(init?.method,undefined);assert.equal(init?.body,undefined);assert.equal(init?.redirect,'error');
  return Response.json({...base,OPENROUTER_API_KEY:'SECRET',token:'PRIVATE_TOKEN',models:['private']});
 });
 assert.equal(calls,1);assert.equal(status,'ready');
 assert.equal(await radiologyAnalysisStatus(async()=>{throw Error('PRIVATE_CONNECTION_DETAILS');}),'unavailable');
 assert.equal(await radiologyAnalysisStatus(async()=>new Response('',{status:503})),'unavailable');
});

test('Physician notices explain unavailable analysis and keep commands, ports, models and provider credentials under the hood',()=>{
 for(const status of ['not-approved','missing-provider','operator-required','not-development','unavailable'] as const){
  const notice=radiologyAnalysisNotice(status);assert.match(notice,/Просмотр снимков доступен/);
  assert.doesNotMatch(notice,/npm|3210|Gemini|токен|(?:^|\s)ключ|\.env/);
  for(const {code}of WORKSPACE_LANGUAGES)if(code!=='ru')assert.doesNotMatch(workspaceText(code,notice),/[а-яё]/i);
 }
});
