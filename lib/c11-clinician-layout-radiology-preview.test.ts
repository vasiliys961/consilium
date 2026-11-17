import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {radiologyStandaloneUrl,radiologyReadiness} from './local-integrations.ts';

const file=(p:string)=>readFileSync(p,'utf8');

test('C11 clinician layout: one case work surface, no permanent storage or instructions sidebar',()=>{
 const ui=file('app/components/clinical-workspace.tsx');
 const css=file('app/workspace.module.css');
 assert.doesNotMatch(ui,/<aside className=\{styles\.rightPanel\}>/);
 assert.doesNotMatch(ui,/<h3>\{t\("Хранение случая"\)\}<\/h3>/);
 assert.match(ui,/<div className=\{styles\.caseGrid\}>/);
 assert.match(css,/\.caseGrid\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/\.content\{max-width:1760px/);
 assert.match(css,/\.shell\{font-size:18px/);
 assert.match(ui,/PhysicianTaskAssistant/);
 assert.match(ui,/PhysicianHelp/);
});

test('C11 clinician layout: specialist and library are wide and readable on desktop, scale on mobile',()=>{
 const specialist=file('app/consult/consult.module.css');
 const library=file('app/library/library.module.css');
 assert.match(specialist,/max-width:1560px/);
 assert.match(specialist,/font-size:18px/);
 assert.match(specialist,/@media\(max-width:700px\)/);
 assert.match(library,/max-width:1600px/);
 assert.match(library,/font-size:18px/);
 assert.match(library,/@media\(max-width:700px\)/);
});

test('C11 clinician layout: clinical answer remains primary; model roster and roles are opt-in details',()=>{
 const ui=file('app/components/clinical-workspace.tsx');
 const feed=file('app/components/case-feed.tsx');
 assert.match(ui,/<details[^>]*data-testid="council-model-technical"/);
 assert.match(feed,/<details data-testid="council-clinical-opinions">/);
 assert.match(feed,/<details data-testid="council-technical-models">/);
 assert.match(feed,/data-testid="council-actual-models"/);
 assert.match(feed,/final\?\.status==='done'/);
 assert.match(feed,/Повторить весь консилиум \(платно\)/);
});

test('C11 Radiology: isolated Preview readiness is distinct from working standalone Mac installation',()=>{
 const source=file('lib/local-integrations.ts');
 const script=file('scripts/setup-radiology-preview.mjs');
 const api=file('app/api/integrations/radiology/route.ts');
 const viewer=file('app/components/radiology-module.tsx');
 assert.match(source,/bridge_dependencies_missing/);
 assert.match(source,/bridge_source_missing/);
 assert.match(source,/radiologyStandaloneUrl/);
 assert.match(script,/assertPreviewReady\(root,'update'\)/);
 assert.match(script,/integrations\/radiology\/web/);
 assert.match(script,/npm',\['ci','--ignore-scripts'/);
 assert.match(script,/3210/);
 assert.doesNotMatch(script,/Desktop\/opus-radiology-ai-github|RADIOLOGY_SOURCE_HOME|reset --hard/);
 assert.match(api,/radiologyReadiness/);
 assert.match(viewer,/npm run setup:radiology:preview/);
 assert.match(viewer,/noopener noreferrer/);
 assert.ok(['ready','bridge_source_missing','bridge_dependencies_missing'].includes(radiologyReadiness()));
});

test('C11 Radiology: standalone link accepts configured loopback URL only and never sends patient data',()=>{
 const original=process.env.RADIOLOGY_STANDALONE_URL;
 try{
  for(const bad of [
   'https://example.com:3000/','http://192.168.1.10:3000/',
   'http://127.0.0.1:3107/','http://127.0.0.1:3207/',
   'http://127.0.0.1:3210/','http://localhost:3000/patient',
   'http://user:pass@127.0.0.1:3000/','http://127.0.0.1:3000/?patient=123',
  ]){
   process.env.RADIOLOGY_STANDALONE_URL=bad;
   assert.equal(radiologyStandaloneUrl(),null,bad);
  }
  process.env.RADIOLOGY_STANDALONE_URL='http://127.0.0.1:3000/';
  assert.equal(radiologyStandaloneUrl(),'http://127.0.0.1:3000');
 }finally{
  if(original===undefined)delete process.env.RADIOLOGY_STANDALONE_URL;
  else process.env.RADIOLOGY_STANDALONE_URL=original;
 }
});
