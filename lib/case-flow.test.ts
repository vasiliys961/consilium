import test from'node:test';import assert from'node:assert/strict';
import{createRequire}from'node:module';
import{newCase,openNewCase,readCases,persistCase,caseAnalysisInput,caseContext}from'./casebook.ts';
import{materialRoute,materialKey,moduleHref,storeOriginal,restoreMaterial}from'./material-routing.ts';
const require=createRequire(import.meta.url);
test('a new case exists in storage before its first analysis, with stable ID and saved drafts',async()=>{
 const {indexedDB}=require('fake-indexeddb');Object.defineProperty(globalThis,'indexedDB',{value:indexedDB,configurable:true});
 Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>null,setItem:()=>{}},configurable:true});
 const created=await openNewCase([]);assert.ok((await readCases()).some(c=>c.id===created.id));assert.equal(created.analyses.length,0);
 const next={...created,context:'Synthetic history',workspaceDraft:{question:'Synthetic question',note:'',decision:'',tab:'analysis'}};
 await Promise.all([persistCase({...created,context:'older write'}),persistCase(next)]);
 const restored=(await readCases()).find(c=>c.id===created.id)!;assert.equal(restored.context,'Synthetic history');assert.equal(restored.workspaceDraft?.question,'Synthetic question');assert.ok(moduleHref('workbench',restored.id).includes(created.id));
});
test('pending DICOM routes to the real module; its raw binary is never substituted with a single-frame LLM reading',()=>{
 const c=newCase();c.files=[{name:'synthetic.dcm',sha256:'a'.repeat(64),binary:'U1lOVEhFVElD'},{name:'labs.csv',text:'Hb,100,g/L'}];
 const before=caseAnalysisInput(c);assert.equal(before.pendingModules.length,1);assert.deepEqual(before.files.map(f=>f.name),['labs.csv']);
 c.moduleReports=[{id:'report',module:'radiology',fileKeys:[materialKey(c.files[0])],sources:['synthetic.dcm'],text:'Synthetic actual module output',at:c.created}];
 const after=caseAnalysisInput(c);assert.equal(after.pendingModules.length,0);assert.match(after.text,/Synthetic actual module output/);assert.equal(after.files.some(f=>f.binary),false);
});
test('routing distinguishes signal ECG, laboratory CSV and explicitly profiled radiology images',()=>{
 assert.equal(materialRoute({name:'signal.csv',text:'sampling_rate,500\nI,II,III,aVR,aVL,aVF,V1,V2,V3,V4,V5,V6'}),'ecg');
 assert.equal(materialRoute({name:'lab.csv',text:'Hb,100,g/L'}),'laboratory');assert.equal(materialRoute({name:'ecg.edf'}),'ecg');
 assert.equal(materialRoute({name:'film.jpg',image:'synthetic',imageProfile:'xray'}),'radiology');assert.equal(materialRoute({name:'ecg.jpg',image:'synthetic',imageProfile:'ecg'}),'ecg');
});
test('local original transfer restores exact bytes and content hash, including a DICOM source',async()=>{
 const original=new File([new Uint8Array([0,1,2,3,254,255])],'synthetic.dcm',{type:'application/dicom'});const stored=await storeOriginal(original),restored=await restoreMaterial(stored);
 assert.ok(stored.sha256);assert.ok(restored);assert.deepEqual(new Uint8Array(await restored.arrayBuffer()),new Uint8Array(await original.arrayBuffer()));assert.equal(restored.name,original.name);
});
