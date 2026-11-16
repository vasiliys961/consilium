import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {conduct} from './conductor.ts';
import {newCase,type ClinicalCase} from './casebook.ts';
import {createPortableCaseFile,restorePortableCaseFile,PortableCaseCollisionError} from './portable-case-file.ts';
import {writeVaultCase,readVaultCaseById,createLocalVault,lockVault,openLocalVault,insertVaultCaseIfAbsent,vaultDatabase} from './local-vault.ts';
import {passageCitations} from './local-rag.ts';

function normalized(value:unknown){return JSON.parse(JSON.stringify(value));}
function syntheticCase():ClinicalCase{
 const value=newCase();
 value.title='Synthetic cardiopulmonary follow-up';
 value.context='Synthetic non-patient symptoms';
 value.privatePatient={name:'SYNTHETIC-PERSON-ONLY',birthDate:'1980-01-01',identifiers:'FAKE-RECORD-001',dates:'2026-11-12'};
 value.files=[{name:'synthetic-ecg.txt',sha256:'a'.repeat(64),text:'synthetic RR 810 ms',bytes:19},
   {name:'synthetic-note.png',image:'data:image/png;base64,AAAA',sha256:'b'.repeat(64),bytes:3}];
 value.events=[{id:'decision-1',kind:'decision',at:value.created,text:'Original synthetic clinical decision',
  editedAt:value.updated,revisions:[{at:value.created,text:'Earlier tentative plan'}]}];
 const result=conduct({text:'Synthetic ECG and medication plan'});
 result.citations=passageCitations([{id:'library:synth:chunk2',title:'Synthetic handbook',locator:'страница PDF 2',text:'Check anticoagulant bleeding risk',score:1}], '2026-11-16');
 result.draft.summary='Provisional interpretation with unchanged source claims';
 value.analyses=[{id:'analysis-1',at:value.created,context:'Synthetic analysis',question:'Clinical next steps?',result}];
 value.currentMedications='Synthetic warfarin — prescription pending review';
 value.workspaceDraft={question:'Follow-up?',note:'Synthetic note',decision:'Unapproved amendment',tab:'analysis'};
 value.moduleReports=[{id:'module-1',module:'radiology',fileKeys:['b'.repeat(64)],sources:['synthetic-note.png'],at:value.created,text:'Historical image finding only'}];
 return value;
}

test('C9 sealed one-case roundtrip retains private details, provenance, sources, drafts, revisions and attached material',async()=>{
 const value=syntheticCase();
 await writeVaultCase(value);
 let copiedId:string|undefined;
 try{
  const archive=await createPortableCaseFile(value.id,'correct horse battery staple');
  assert.ok(archive.includes('"schema":"doctor-opus-single-case/v1"'));
  for(const secret of ['SYNTHETIC-PERSON-ONLY','FAKE-RECORD-001','Original synthetic clinical decision','synthetic-ecg.txt'])
   assert.equal(archive.includes(secret),false,'the archive must not leak case contents outside authenticated ciphertext');
  await writeVaultCase(value,true);
  const restored=await restorePortableCaseFile(archive,'correct horse battery staple');
  copiedId=restored.id;
  assert.equal(restored.copied,false);
  assert.equal(restored.files,2);assert.equal(restored.analyses,1);assert.equal(restored.events,1);
  assert.deepEqual(normalized(await readVaultCaseById(value.id)),normalized(value),'clinical history, source hashes and patient identity must survive unchanged');
 }finally{if(copiedId)await writeVaultCase({...value,id:copiedId},true);await writeVaultCase(value,true);}
});

test('C9 collision rejects overwrite and permits explicit separate copy with a different ID',async()=>{
 const value=syntheticCase();
 await writeVaultCase(value);
 let copiedId='';
 try{
  const archive=await createPortableCaseFile(value.id,'correct horse battery staple');
  const original=await readVaultCaseById(value.id);
  await assert.rejects(()=>restorePortableCaseFile(archive,'correct horse battery staple'),PortableCaseCollisionError);
  assert.deepEqual(await readVaultCaseById(value.id),original);
  await assert.rejects(()=>insertVaultCaseIfAbsent({...value,title:'overwrite attempt'}));
  assert.deepEqual(await readVaultCaseById(value.id),original);
  const copy=await restorePortableCaseFile(archive,'correct horse battery staple','copy');
  copiedId=copy.id;
  assert.notEqual(copy.id,value.id);assert.equal(copy.originalId,value.id);assert.equal(copy.copied,true);
  assert.equal((await readVaultCaseById(copy.id))?.events[0].revisions?.[0].text,'Earlier tentative plan');
  assert.equal((await readVaultCaseById(copy.id))?.number,undefined);
  assert.deepEqual(await readVaultCaseById(value.id),original);
 }finally{await writeVaultCase(value,true);if(copiedId)await writeVaultCase({...value,id:copiedId},true);}
});

test('C9 wrong password, truncated file, changed authenticated ciphertext and invalid structure cannot add a case',async()=>{
 const value=syntheticCase();
 await writeVaultCase(value);
 const archive=await createPortableCaseFile(value.id,'correct horse battery staple');
 await writeVaultCase(value,true);
 const base=JSON.parse(archive);
 await assert.rejects(()=>restorePortableCaseFile(archive,'incorrect-passphrase'),/Неверный пароль/);
 const tampered={...base,sealed:{...base.sealed,data:base.sealed.data.slice(0,-4)+'AAAA'}};
 await assert.rejects(()=>restorePortableCaseFile(JSON.stringify(tampered),'correct horse battery staple'),/Неверный пароль/);
 await assert.rejects(()=>restorePortableCaseFile(archive.slice(0,-9),'correct horse battery staple'));
 await assert.rejects(()=>restorePortableCaseFile(JSON.stringify({schema:'other',salt:base.salt,sealed:base.sealed}),'correct horse battery staple'));
 assert.equal(await readVaultCaseById(value.id),undefined,'failed imports must leave local cases unchanged');
});

test('C9 separate case file works with locked AES-GCM local vault and stores sealed records only',async()=>{
 await createLocalVault('local vault passphrase >= 12');
 const value=syntheticCase();
 await writeVaultCase(value);
 let importedId:string|undefined;
 try{
  const archive=await createPortableCaseFile(value.id,'archive passphrase >= 12');
  await writeVaultCase(value,true);
  lockVault();
  await assert.rejects(()=>restorePortableCaseFile(archive,'archive passphrase >= 12'),/Хранилище заблокировано/);
  await openLocalVault('local vault passphrase >= 12');
  const restored=await restorePortableCaseFile(archive,'archive passphrase >= 12');
  importedId=restored.id;
  const db=await vaultDatabase();
  try{
   const row=await new Promise<unknown>((resolve,reject)=>{const req=db.transaction('cases','readonly').objectStore('cases').get(value.id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
   assert.equal('sealed' in (row as Record<string,unknown>),true);
   assert.equal(JSON.stringify(row).includes('SYNTHETIC-PERSON-ONLY'),false);
  }finally{db.close();}
  assert.deepEqual(normalized(await readVaultCaseById(value.id)),normalized(value));
 }finally{await openLocalVault('local vault passphrase >= 12');if(importedId)await writeVaultCase(value,true);lockVault();}
});
