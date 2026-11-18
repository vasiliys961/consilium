import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WORKSPACE_LANGUAGES} from './workspace-i18n.ts';
import {copilotModuleReadiness,type CopilotIntegrationSnapshot} from './copilot-module-readiness.ts';

const snapshot:CopilotIntegrationSnapshot={
 radiology:{installed:true,running:false},
 protocol:{ru:{installed:true,running:true},en:{installed:false,running:false}},
 ecg:{available:false},
};

test('C13-B: English and Russian tools share a read-only status source but choose their own protocol',()=>{
 const ru=copilotModuleReadiness('protocol','ru',snapshot);
 assert.equal(ru.state,'available');
 assert.equal(ru.allowed,true);
 assert.match(ru.text,/Модуль запущен/);
 const en=copilotModuleReadiness('protocol','en',snapshot);
 assert.equal(en.state,'not-installed');
 assert.equal(en.allowed,false);
 assert.match(en.text,/not installed/);
 const es=copilotModuleReadiness('ambient','es',snapshot);
 assert.equal(es.state,'not-installed'); // Global, not RU
 assert.equal(es.allowed,false);
 assert.match(es.text,/no está instalado/);
});

test('C13-B: no optimistic readiness from stale, failed or missing health checks',()=>{
 assert.equal(copilotModuleReadiness('radiology','en',null).state,'unknown');
 assert.equal(copilotModuleReadiness('radiology','en',snapshot,true).state,'unknown');
 assert.equal(copilotModuleReadiness('radiology','en',snapshot).state,'opens-on-request');
 assert.equal(copilotModuleReadiness('ecg','en',snapshot).state,'limited');
 assert.equal(copilotModuleReadiness('ecg','en',snapshot).allowed,true); // viewer still opens
 assert.equal(copilotModuleReadiness('specialist','en',snapshot).state,'unknown');
 assert.equal(copilotModuleReadiness('specialist','en',snapshot).visible,false);
 assert.equal(copilotModuleReadiness('guidelines','en',snapshot).visible,false);
 assert.equal(copilotModuleReadiness('radiology','en',{radiology:{installed:false,running:false}}).allowed,false);
 assert.equal(copilotModuleReadiness('radiology','en',{radiology:{installed:true,running:true}}).state,'available');
 assert.equal(copilotModuleReadiness('ecg','en',{ecg:{available:true}}).state,'unknown');
});

test('C13-B: clear localized readiness copy is present in every supported workspace language',()=>{
 for(const {code} of WORKSPACE_LANGUAGES){
  for(const tool of ['radiology','protocol','ambient','ecg'] as const){
   const checked=copilotModuleReadiness(tool,code,snapshot);
   assert.ok(checked.visible);
   assert.ok(checked.text.trim());
  }
  const missing=copilotModuleReadiness('radiology',code,{radiology:{installed:false,running:false}});
  assert.equal(missing.allowed,false);
  assert.ok(missing.text.trim());
 }
});

test('C13-B: unavailable destinations are visibly disabled rather than hidden in tooltip only',()=>{
 const ui=readFileSync('app/components/physician-task-assistant.tsx','utf8');
 assert.match(ui,/copilotModuleReadiness\(tool,language,integration,healthError\)/);
 assert.match(ui,/disabled=\{!allowed\|\|executionBusy\}/);
 assert.match(ui,/\{visible&&<small/);
 assert.match(ui,/setIntegration\(null\);setHealthError\(true\)/);
 assert.match(ui,/title=\{hint\}/);
 assert.match(ui,/fetch\('\/api\/integrations'/);
 assert.doesNotMatch(ui,/startRadiology\(|startRecording\(|runConsilium\(/);
 const api=readFileSync('app/api/integrations/route.ts','utf8');
 assert.match(api,/integrationStatus\(\)/);
 assert.doesNotMatch(api,/startRadiology|complete\(|transcribe|stream/);
});
