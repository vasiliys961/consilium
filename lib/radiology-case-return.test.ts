import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import 'fake-indexeddb/auto';
import {conciliumParentOrigin} from '../integrations/radiology/web/lib/concilium-parent-origin.ts';
import {localOrigin,isPreviewInstance} from './local-ports.ts';
import {caseContext,newCase,persistCase,persistCaseDraft,persistRadiologyMaterials,persistRadiologyReport} from './casebook.ts';
import {readVaultCaseById} from './local-vault.ts';

const hashA='a'.repeat(64),hashB='b'.repeat(64),hashC='c'.repeat(64);
const photoA={name:'synthetic-scan.dcm',sha256:hashA,binary:'AAAA',processingModule:'radiology' as const,bytes:3};
const photoB={name:'synthetic-scan.dcm',sha256:hashB,binary:'BBBB',processingModule:'radiology' as const,bytes:3};
const sampleText='Synthetic unverified findings, no real patient data.';
const meta={text:sampleText,fileKeys:[hashA],sources:[photoA.name]};

function fixture(){
 const value=newCase();value.title='Synthetic radiology case';value.context='Synthetically created context only';
 value.events=[{id:'decision-1',at:value.created,kind:'decision' as const,text:'Physician decision preserved'}];
 value.analyses=[];return value;
}
async function cleanup(id:string){const value=await readVaultCaseById(id);if(value)await persistCase(value,true);}

test('C11 Radiology iframe uses exact independent parent origin: 3207 in Preview and 3107 in main',()=>{
 assert.equal(conciliumParentOrigin('1'),'http://127.0.0.1:3207');
 assert.equal(conciliumParentOrigin('0'),'http://127.0.0.1:3107');
 assert.equal(conciliumParentOrigin(undefined),'http://127.0.0.1:3107');
 const root=resolve(process.cwd());
 const viewer=readFileSync(resolve(root,'integrations/radiology/web/app/viewer/page.tsx'),'utf8');
 const bridge=readFileSync(resolve(root,'integrations/radiology/web/components/ConciliumBridge.tsx'),'utf8');
 const service=readFileSync(resolve(root,'lib/local-integrations.ts'),'utf8');
 const config=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
 assert.doesNotMatch(viewer,/['"]http:\/\/127\.0\.0\.1:3107['"]/);
 assert.equal(viewer.split('conciliumParentOrigin()').length-1,4,'all four viewer material messages must target the actual instance');
 assert.match(bridge,/const origin=conciliumParentOrigin\(\)/);
 assert.match(service,/localPorts\(\)\.radiology/);
 assert.match(service,/\.\.\.process\.env/,'Preview flag must reach the isolated child process');
 assert.match(config.scripts['dev:preview'],/NEXT_PUBLIC_CONCILIUM_PREVIEW=1/);
 assert.match(config.scripts['dev:preview'],/--port 3207/);
 assert.equal(isPreviewInstance(),false);
 assert.equal(localOrigin('radiology'),'http://127.0.0.1:3110');
});

test('C11 report returns to exactly its selected case, preserves source SHA and physician decision',async()=>{
 const value=fixture(),other=fixture();await persistCase(value);await persistCase(other);
 try{
  await persistRadiologyMaterials(value.id,[photoA],'2026-11-16T20:00:00Z');
  const saved=await persistRadiologyReport(value.id,meta,'2026-11-16T20:01:00Z');
  assert.deepEqual(saved.moduleReports?.[0].fileKeys,[hashA]);
  assert.equal(saved.moduleReports?.[0].status,'reported');
  assert.equal(saved.moduleReports?.[0].coverage,'not_verified');
  assert.equal(saved.events[0].text,'Physician decision preserved');
  assert.equal(saved.files[0].sha256,hashA);
  assert.match(caseContext(saved),/Synthetic unverified findings/);
  assert.equal((await readVaultCaseById(other.id))?.moduleReports?.length??0,0);
  const reopened=await readVaultCaseById(value.id);
  assert.deepEqual(reopened?.moduleReports?.[0].fileKeys,[hashA]);
 }finally{await cleanup(value.id);await cleanup(other.id);}
});

test('C11 identical repeated report and original are idempotent; a revised report preserves the prior version',async()=>{
 const value=fixture();await persistCase(value);
 try{
  await persistRadiologyMaterials(value.id,[photoA]);
  const first=await persistRadiologyReport(value.id,meta,'2026-11-16T20:00:00Z');
  const duplicate=await persistRadiologyReport(value.id,meta,'2026-11-16T20:05:00Z');
  assert.equal(duplicate.moduleReports?.length,1);
  assert.equal(duplicate.moduleReports?.[0].id,first.moduleReports?.[0].id);
  const another=await persistRadiologyReport(value.id,{...meta,text:sampleText+' Modified by physician.'});
  assert.equal(another.moduleReports?.length,2);
  assert.equal(another.moduleReports?.[1].text,sampleText);
  const sameFile=await persistRadiologyMaterials(value.id,[photoA]);
  assert.equal(sameFile.files.length,1);
  assert.equal(sameFile.events[0].text,'Physician decision preserved');
 }finally{await cleanup(value.id);}
});

test('C11 missing, altered and partly missing sources are never linked to unrelated existing exams',async()=>{
 const value=fixture();value.files=[photoB];await persistCase(value);
 try{
  const unbound=await persistRadiologyReport(value.id,meta);
  assert.deepEqual(unbound.moduleReports?.[0].fileKeys,[]);
  assert.match(caseContext(unbound),/Подтверждённой привязки к исходному файлу нет/);
  const partial=await persistRadiologyReport(value.id,{text:'Multiple input slices, incomplete transfer',fileKeys:[hashB,hashC],sources:['slice-1.dcm','slice-2.dcm']});
  assert.deepEqual(partial.moduleReports?.[0].fileKeys,[],'partial DICOM series must not claim full source verification');
  assert.deepEqual(partial.files.map(file=>file.sha256),[hashB]);
  await assert.rejects(()=>persistRadiologyReport(value.id,{...meta,fileKeys:['not-a-sha256']}),/Некорректная привязка/);
 }finally{await cleanup(value.id);}
});

test('C11 replacing a source keeps the historical Radiology report but marks it stale in current clinical context',async()=>{
 const value=fixture();await persistCase(value);
 try{
  await persistRadiologyMaterials(value.id,[photoA]);
  const valid=await persistRadiologyReport(value.id,meta);
  await persistCase({...valid,files:[photoB],updated:'2026-11-16T20:05:00Z'});
  const current=(await readVaultCaseById(value.id))!;
  assert.equal(current.moduleReports?.[0].fileKeys[0],hashA);
  assert.match(caseContext(current),/Исторический отчёт/);
  assert.doesNotMatch(caseContext(current),/Начало описания:\nSynthetic unverified findings/);
 }finally{await cleanup(value.id);}
});

test('C11 closed case refuses returning new Radiology report or originals',async()=>{
 const value=fixture();value.status='closed';await persistCase(value);
 try{
  await assert.rejects(()=>persistRadiologyMaterials(value.id,[photoA]),/Верните случай в работу/);
  await assert.rejects(()=>persistRadiologyReport(value.id,meta),/Случай завершён/);
  assert.equal((await readVaultCaseById(value.id))?.moduleReports,undefined);
 }finally{await cleanup(value.id);}
});

test('C11 simultaneous physician note autosave and Radiology return both persist without loss',async()=>{
 const value=fixture();await persistCase(value);
 try{
  const draft={question:'Synthetic new follow-up',note:'New physician observation',decision:'Not yet signed',tab:'context'};
  const [saved,patched]=await Promise.all([persistRadiologyReport(value.id,{text:'Synthetic standalone report',fileKeys:[],sources:[]}),persistCaseDraft(value.id,draft)]);
  assert.equal(patched,true);
  const reloaded=(await readVaultCaseById(value.id))!;
  assert.equal(saved.moduleReports?.length,1);
  assert.equal(reloaded.moduleReports?.length,1);
  assert.deepEqual(reloaded.workspaceDraft,draft);
  assert.equal(reloaded.events[0].text,'Physician decision preserved');
 }finally{await cleanup(value.id);}
});
