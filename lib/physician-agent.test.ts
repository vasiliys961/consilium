import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AGENT_MODEL,parsePhysicianAgentRequest,parsePhysicianAgentJson,converseWithPhysician} from './physician-agent.ts';
import {signPrivacy} from './privacy-ticket.ts';
import {CHAT_TEXT_PURPOSE} from './privacy-chat.ts';
import {MODELS} from './cost.ts';

const approved=(text:string)=>{
 const body={text,locale:'ru',externalSearch:false,retain:false};
 return {reviewed:{...body,privacy:{consent:true,token:signPrivacy(body)}}};
};
test('C13: assistant rejects unapproved text or forged/mismatched approval',()=>{
 assert.deepEqual(parsePhysicianAgentRequest({text:'Нужна ЭКГ'}),{error:'privacy_review_required',status:428});
 const valid=approved('[PHYSICIAN]\nНужна ЭКГ');
 assert.deepEqual(parsePhysicianAgentRequest(valid),{text:'[PHYSICIAN]\nНужна ЭКГ',locale:'ru'});
 const changed=JSON.parse(JSON.stringify(valid));changed.reviewed.text='Нужна КТ';
 assert.deepEqual(parsePhysicianAgentRequest(changed),{error:'privacy_review_required',status:428});
 const withFile=approved('Нужна КТ') as {reviewed:Record<string,unknown>};withFile.reviewed.files=[{name:'patient.pdf'}];
 assert.deepEqual(parsePhysicianAgentRequest(withFile),{error:'privacy_review_required',status:428});
 const malformed={text:'Нужна КТ',locale:'ru',externalSearch:true,retain:false};
 assert.deepEqual(parsePhysicianAgentRequest({reviewed:{...malformed,privacy:{consent:true,token:signPrivacy(malformed)}}}),{error:'invalid_question',status:400});
 const oldSchool={text:'Нужен протокол',locale:'ru',externalSearch:false,retain:false};
 assert.deepEqual(parsePhysicianAgentRequest({reviewed:{...oldSchool,privacy:{consent:true,token:signPrivacy({purpose:CHAT_TEXT_PURPOSE,body:oldSchool})}}}),{text:'Нужен протокол',locale:'ru'});
});
test('C13: only whitelisted tools survive LLM output, no model-controlled urls or automatic actions',()=>{
 const parsed=parsePhysicianAgentJson(JSON.stringify({reply:'Сначала ЭКГ и КТ.',question:'Есть ли исследование?',tools:['ecg','radiology','delete-case','ecg','protocol','ambient','genetics']}));
 assert.deepEqual(parsed?.tools,['ecg','radiology','protocol','ambient']);
 assert.equal(parsed?.question,'Есть ли исследование?');
 assert.equal(parsePhysicianAgentJson('not json'),null);
 assert.equal(parsePhysicianAgentJson(JSON.stringify({reply:'ok',question:null,tools:{name:'radiology'}})),null);
});
test('C13: cheap explicit OpenRouter LLM turn yields a navigation plan and no extra clinical call',async()=>{
 let calls=0;
 const fakeFetch:typeof fetch=async(_url,init)=>{
  calls++;
  const payload=JSON.parse(String(init?.body));
  assert.equal(payload.model,AGENT_MODEL);
  assert.equal(payload.stream,undefined);
  assert.match(payload.messages[0].content,/not a clinical expert or diagnostician/);
  assert.match(payload.messages[0].content,/Never claim to have run a module/);
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'Open ECG analysis and then Clinical Review.',translatedReply:'Откройте анализ ЭКГ и затем клинический разбор.',question:'Is the ECG available?',translatedQuestion:'Есть ли запись ЭКГ?',tools:['ecg','clinical']})}}],usage:{prompt_tokens:180,completion_tokens:115}});
 };
 const result=await converseWithPhysician({text:'[PHYSICIAN]\nЕсть жалобы и ЭКГ, что делать?',locale:'ru'},{...process.env,OPENROUTER_API_KEY:'synthetic-test'},fakeFetch);
 assert.equal(calls,1);
 assert.equal(AGENT_MODEL,'anthropic/claude-haiku-5.5');
 assert.equal(result.usedModel,true);
 assert.equal(result.model,AGENT_MODEL);
 assert.deepEqual(result.plan.steps.map(s=>s.tool),['ecg','clinical']);
 assert.ok(result.estimatedUsd!==null&&result.estimatedUsd>0);
 assert.equal(result.question,'Is the ECG available?\nЕсть ли запись ЭКГ?');
 assert.match(result.message,/^Open ECG analysis and then Clinical Review\.\nОткройте/);
});
test('C13: provider or invalid output has local fallback, no silent retry or invented success',async()=>{
 let calls=0;
 const failFetch:typeof fetch=async()=>{calls++;return Response.json({error:{message:'model unavailable'}},{status:503});};
 const first=await converseWithPhysician({text:'[PHYSICIAN]\nНужен ЭКГ разбор',locale:'ru'},{...process.env,OPENROUTER_API_KEY:'synthetic'},failFetch);
 assert.equal(calls,1);
 assert.equal(first.usedModel,false);
 assert.equal(first.model,null);
 assert.equal(first.warning,'provider_error');
 assert.deepEqual(first.plan.steps.map(s=>s.tool),['ecg','clinical']); // Existing free planner follows ECG interpretation with a clinical review.
 const noKey=await converseWithPhysician({text:'[PHYSICIAN]\nНужно записать приём',locale:'ru'},{} as NodeJS.ProcessEnv,async()=>{throw Error('Never call without key')});
 assert.deepEqual(noKey.plan.steps.map(s=>s.tool),['ambient']);
 assert.equal(noKey.usedModel,false);
});
test('C13: UI never sends case files, retains conversation only in component state, preserves free planner',()=>{
 const component=readFileSync('app/components/physician-task-assistant.tsx','utf8');
 const route=readFileSync('app/api/physician-agent/route.ts','utf8');
 assert.match(component,/copilotNeedsPrivacyReview/);
 assert.match(component,/reviewBeforeSending\(outgoing\)/);
 assert.match(component,/prepareChatSend\(outgoing,controller.signal\)/);
 assert.match(component,/\/api\/physician-agent/);
 assert.match(component,/disabled=\{agentBusy\|\|executionBusy\|\|!text.trim\(\)\}/);
 assert.match(component,/Найти инструмент/);
 assert.match(component,/Спросить Copilot/);
 assert.match(component,/Включить помощника/);
 assert.match(component,/Opus Copilot — помощник врача/);
 assert.doesNotMatch(component,/Обсудить с ИИ · OpenRouter/);
 assert.match(component,/requestController\.current\?\.abort\(\)/);
 assert.doesNotMatch(component,/localStorage\.setItem\([^\n]*dialogue/);
 assert.match(route,/parsePhysicianAgentRequest\(parsed\)/);
 assert.match(route,/active>=1\|\|recent.length>=12/);
 assert.match(route,/local_only/);
 assert.doesNotMatch(route,/runConsilium|readCases|startRecording|provider\.transcribe/);
});
