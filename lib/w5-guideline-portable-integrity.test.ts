import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {newCase,persistCase,persistGuidelineReview,caseSignature,caseContext,exportCase,type GuidelineReview} from './casebook.ts';
import {createPortableCaseFile,restorePortableCaseFile,PortableCaseCollisionError} from './portable-case-file.ts';
import {readVaultCaseById,writeVaultCase} from './local-vault.ts';

const password='synthetic portable review password';
function sampleReview():GuidelineReview{
 return {
  id:crypto.randomUUID(),at:new Date().toISOString(),
  topic:'Synthetic guideline review for adult AKI',
  text:'SYNTHETIC UNVERIFIED SEARCH OUTPUT: verify source, year and population before any action.',
  model:'synthetic/mock',mode:'standard',language:'en',estimatedUsd:0,
  sourceCaseUpdatedAt:new Date().toISOString(),physicianEdited:false,status:'requires-review',
 };
}

test('W5 portable case: independent guideline output remains encrypted, unverified and separate from medical facts',async()=>{
 const value=newCase();
 value.context='SYNTHETIC AKI CASE SOURCE FACTS';
 value.workspaceDraft={question:'Is renal dose review needed?',note:'Physician draft only',decision:'Unsigned draft',tab:'context'};
 await persistCase(value);
 let importedId:string|undefined;
 try{
  const review=sampleReview();
  await persistGuidelineReview(value.id,caseSignature(value),review);
  const saved=await readVaultCaseById(value.id);assert.ok(saved);
  assert.equal(saved.guidelineReviews?.length,1);
  assert.equal(caseContext(saved).includes(review.text),false);
  assert.match(exportCase(saved),/НЕ ПРОВЕРЕН/);
  const archive=await createPortableCaseFile(value.id,password);
  assert.equal(archive.includes(review.text),false,'Case plaintext must be absent from encrypted file');
  assert.equal(archive.includes('SYNTHETIC AKI CASE SOURCE FACTS'),false);
  const copied=await restorePortableCaseFile(archive,password,'copy');
  importedId=copied.id;
  const imported=await readVaultCaseById(copied.id);assert.ok(imported);
  assert.deepEqual(imported.guidelineReviews,saved.guidelineReviews);
  assert.deepEqual(imported.workspaceDraft,saved.workspaceDraft);
  assert.equal(imported.guidelineReviews?.[0].status,'requires-review');
  assert.equal(caseContext(imported).includes(review.text),false);
  assert.equal(caseSignature(imported),caseSignature(saved));
  assert.match(exportCase(imported),/НЕ ПРОВЕРЕН/);
  assert.equal((await readVaultCaseById(value.id))?.guidelineReviews?.length,1,'Copy must not overwrite source');
 }finally{
  if(importedId)await writeVaultCase({...value,id:importedId},true);
  await writeVaultCase(value,true);
 }
});

test('W5 portable case: reimport with colliding case ID refuses to overwrite reviewed provenance',async()=>{
 const value=newCase();await persistCase(value);
 try{
  const review=sampleReview();
  await persistGuidelineReview(value.id,caseSignature(value),review);
  const archive=await createPortableCaseFile(value.id,password);
  await assert.rejects(()=>restorePortableCaseFile(archive,password),PortableCaseCollisionError);
  assert.equal((await readVaultCaseById(value.id))?.guidelineReviews?.[0].id,review.id);
 }finally{await writeVaultCase(value,true);}
});

test('W5 portable case: corrupted unverified-review status is rejected before encrypted export',async()=>{
 const value=newCase();
 value.guidelineReviews=[{...sampleReview(),status:'approved' as GuidelineReview['status']}];
 await writeVaultCase(value);
 try{
  await assert.rejects(()=>createPortableCaseFile(value.id,password),/несовместимый формат/);
 }finally{await writeVaultCase(value,true);}
});

test('W5 portable case: malformed unverified-review arrays and cost cannot cross archive boundary',async()=>{
 const value=newCase();
 const review=sampleReview();
 const invalid=[
  {guidelineReviews:'not-an-array'},
  {guidelineReviews:[{...review,estimatedUsd:-1}]},
  {guidelineReviews:[{...review,physicianEdited:'approved'}]},
  {guidelineReviews:[{...review,mode:'unexpected'}]},
 ];
 for(const patch of invalid){
  await writeVaultCase({...value,...patch} as unknown as typeof value);
  await assert.rejects(()=>createPortableCaseFile(value.id,password),/несовместимый формат/);
 }
 await writeVaultCase(value,true);
});
