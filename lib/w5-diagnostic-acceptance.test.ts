import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {newCase,caseContext,caseAnalysisInput} from './casebook.ts';
import {chooseClinicalFocus} from './clinical-focus.ts';
import {planAdaptiveCouncil} from './adaptive-council.ts';
import {reportedMedications} from './drug-interaction-rules.ts';
import {W5_DIAGNOSTIC_CASES,W5_DIAGNOSTIC_GUIDELINES,type W5DiagnosticCase} from './w5-diagnostic-cases.ts';
import {summarizeW5DiagnosticReviews} from './w5-diagnostic-review.ts';

/**
 * W5 offline tests are deliberately confined to:
 * 1) fixture completeness and clinical-workflow context preservation;
 * 2) deterministic specialist selection (not a diagnosis);
 * 3) accounting of independently ADJUDICATED human ratings.
 * No LLM is queried, and no clinical answer is automatically marked correct.
 */
function createSyntheticCase(item:W5DiagnosticCase){
 const value=newCase();
 value.title='Fictional W5 '+item.id;
 value.question=item.question;
 value.context=item.note;
 if(item.currentMedications)value.currentMedications=item.currentMedications;
 return value;
}

test('W5 diagnostic fixture governance: 25 unique, labeled synthetic cases across five areas',()=>{
 const ids=W5_DIAGNOSTIC_CASES.map(item=>item.id);
 assert.equal(ids.length,25);
 assert.equal(new Set(ids).size,25);
 assert.deepEqual(ids,[...Array(25)].map((_,index)=>'DX'+String(index+1).padStart(2,'0')));
 const counts=new Map<string,number>();
 for(const item of W5_DIAGNOSTIC_CASES){
  counts.set(item.area,(counts.get(item.area)??0)+1);
  assert.ok(item.note.length>=50,item.id+' incomplete fictional narrative');
  assert.ok(item.question.length>=20,item.id+' missing physician question');
  assert.ok(item.mustConsider.length>0,item.id+' no dangerous differential anchor');
  assert.ok(item.mustAddress.length>0,item.id+' no safety action anchor');
  assert.ok(item.mustNotAssert.length>0,item.id+' no unsupported-certainty guard');
  assert.ok(item.missingEvidence.length>0,item.id+' no evidence gaps');
  for(const key of item.guidelineKeys){
   const source=W5_DIAGNOSTIC_GUIDELINES[key];
   assert.ok(source?.title,item.id+' guideline key unavailable');
   assert.match(source.url,/^https:\/\//);
  }
 }
 assert.deepEqual([...counts.entries()],[['cardiology',5],['pulmonology',5],
  ['nephrology',5],['multimorbidity',5],['evidence-integrity',5]]);
 assert.ok(W5_DIAGNOSTIC_CASES.filter(item=>item.locale==='ru').length>=4);
 assert.ok(W5_DIAGNOSTIC_CASES.filter(item=>item.urgency==='emergency').length>=5);
});

for(const item of W5_DIAGNOSTIC_CASES){
 test('W5 diagnostic route '+item.id+': document context and expected clinical perspectives',()=>{
  const value=createSyntheticCase(item);
  const clinicalInput=caseAnalysisInput(value);
  // Preserve the full physician-authored text; especially numbers, uncertainty
  // and explicit negations. Do not replace this text with inferred values.
  assert.ok(clinicalInput.text.includes(item.note),item.id+': original facts lost');
  assert.ok(clinicalInput.text.includes(item.question),item.id+': question lost');
  assert.ok(clinicalInput.text.includes('Вопрос врача:'),item.id+': question provenance missing');
  const focus=chooseClinicalFocus(clinicalInput.text,item.modalities??[]);
  for(const domain of item.expectedDomains){
   assert.ok(focus.some(x=>x.domain===domain),
    item.id+': expected routing domain '+domain+' not present; got '+focus.map(x=>x.domain).join(','));
  }
  const council=planAdaptiveCouncil(clinicalInput.text,item.modalities??[],'auto');
  assert.ok(council.lead);
  assert.ok(council.secondary);
  assert.equal(council.manual,false);
  assert.ok(council.suggested.length<=5,'must not multiply paid AI roles');
  if(item.currentMedications)assert.equal(reportedMedications(caseContext(value)),item.currentMedications);
  else assert.equal(reportedMedications(caseContext(value)),'',
   item.id+': clinical history must never become a confirmed current medication list');
  assert.equal(value.analyses.length,0,'fixture must never silently run a diagnostic LLM');
  assert.equal(value.events.length,0,'fixture must not issue a physician decision');
 });
}

test('W5 diagnostic DX22: unread CTPA has explicit not-assessed state, never a fabricated image interpretation',()=>{
 const item=W5_DIAGNOSTIC_CASES.find(x=>x.id==='DX22')!;
 const value=createSyntheticCase(item);
 value.files=[{name:'fictional-ctpa.dcm',processingModule:'radiology',sha256:'a'.repeat(64)}];
 const input=caseAnalysisInput(value);
 assert.equal(input.pendingModules.length,1);
 assert.match(input.text,/IMAGING NOT ASSESSED BY RADIOLOGY/);
 assert.match(input.text,/do NOT infer image findings, normality, measurements/);
 assert.equal(input.reusedSources.length,0);
 assert.equal(value.analyses.length,0);
});

test('W5 diagnostic DX25: negated historical anticoagulant is not a current prescription',()=>{
 const item=W5_DIAGNOSTIC_CASES.find(x=>x.id==='DX25')!;
 const value=createSyntheticCase(item);
 const note=caseContext(value);
 assert.match(note,/НЕ принимает/);
 assert.match(note,/отменён/);
 assert.equal(reportedMedications(note),'');
});

test('W5 diagnosis review metrics: not-assessed is not silently scored as clinically safe',()=>{
 const r=summarizeW5DiagnosticReviews([]);
 assert.deepEqual({total:r.total,reviewed:r.reviewed,notAssessed:r.notAssessed,coverage:r.coverage,
   passRate:r.reviewedPassRate,validationStatus:r.validationStatus},
   {total:25,reviewed:0,notAssessed:25,coverage:0,passRate:null,validationStatus:'synthetic-review-only'});
});

test('W5 diagnosis review metrics: independent reviewer counts dangerous omissions and false positives',()=>{
 const summary=summarizeW5DiagnosticReviews([
  {caseId:'DX01',status:'reviewed',reviewer:'clinician-A',criticalMisses:1,noncriticalMisses:0,
   falsePositives:2,fabricatedFacts:1,unsupportedCertainty:1},
  {caseId:'DX02',status:'reviewed',reviewer:'clinician-B',criticalMisses:0,noncriticalMisses:0,
   falsePositives:0,fabricatedFacts:0,unsupportedCertainty:0},
  {caseId:'DX03',status:'not_assessed'},
 ]);
 assert.equal(summary.reviewed,2);
 assert.equal(summary.notAssessed,23);
 assert.equal(summary.reviewerPasses,1);
 assert.equal(summary.reviewedPassRate,0.5);
 assert.equal(summary.criticalMisses,1);
 assert.equal(summary.casesWithCriticalMisses,1);
 assert.equal(summary.falsePositives,2);
 assert.equal(summary.fabricatedFacts,1);
 assert.equal(summary.unsupportedCertainty,1);
});

test('W5 diagnosis review metrics: duplicates, invented zeroes and invalid values are refused',()=>{
 const empty={criticalMisses:0,noncriticalMisses:0,falsePositives:0,
   fabricatedFacts:0,unsupportedCertainty:0};
 assert.throws(()=>summarizeW5DiagnosticReviews([
  {caseId:'DX01',status:'not_assessed',criticalMisses:0}]),/Unassessed/);
 assert.throws(()=>summarizeW5DiagnosticReviews([
  {caseId:'FAKE',status:'not_assessed'}]),/Unknown/);
 assert.throws(()=>summarizeW5DiagnosticReviews([
  {caseId:'DX01',status:'not_assessed'},
  {caseId:'DX01',status:'not_assessed'}]),/Duplicate/);
 assert.throws(()=>summarizeW5DiagnosticReviews([
  {caseId:'DX01',status:'reviewed',reviewer:'clinician-A',...empty,criticalMisses:-1}]),/nonnegative integer/);
 assert.throws(()=>summarizeW5DiagnosticReviews([
  {caseId:'DX01',status:'reviewed',...empty}]),/requires an identified reviewer/);
});


test('W5 clinical routing regression: English cough and hemoptysis select pulmonary review',()=>{
 const cough=chooseClinicalFocus('Persistent cough with fever but no imaging',[]);
 const blood=chooseClinicalFocus('Unexplained hemoptysis; respiratory source uncertain',[]);
 assert.ok(cough.some(item=>item.domain==='pulmonology'),
  'English cough must route to pulmonology, as Russian кашель does');
 assert.ok(blood.some(item=>item.domain==='pulmonology'),
  'Hemoptysis must trigger a pulmonary clinical perspective');
 assert.ok(!chooseClinicalFocus('routine dental cleaning',[]).some(item=>item.domain==='pulmonology'),
  'No free-floating pulmonary role without the symptom');
});

test('W5 offline CLI emits an honest template with all 25 cases unassessed',()=>{
 const child=spawnSync(process.execPath,
  ['--experimental-strip-types','scripts/w5-diagnostic-report.mjs','--template'],
  {encoding:'utf8',timeout:10000});
 assert.equal(child.status,0,child.stderr);
 const template=JSON.parse(child.stdout) as {referenceApproved:boolean;reviews:Array<{caseId:string;status:string}>};
 assert.equal(template.referenceApproved,false);
 assert.equal(template.reviews.length,25);
 assert.equal(new Set(template.reviews.map(item=>item.caseId)).size,25);
 assert.ok(template.reviews.every(item=>item.status==='not_assessed'));
});

test('W5 free-model runner: default cannot send any paid or free network request',()=>{
 const p=spawnSync(process.execPath,
  ['--experimental-strip-types','scripts/w5-free-model-trial.mjs'],
  {encoding:'utf8',timeout:10000,env:{...process.env,OPENROUTER_API_KEY:''}});
 assert.equal(p.status,0,p.stderr);
 const header=JSON.parse(p.stdout) as {mode:string;modelCallsMade:number;costUsd:number};
 assert.equal(header.mode,'dry-run');
 assert.equal(header.modelCallsMade,0);
 assert.equal(header.costUsd,0);
});
test('W5 free-model runner: paid model ID rejected before any API request',()=>{
 const p=spawnSync(process.execPath,
  ['--experimental-strip-types','scripts/w5-free-model-trial.mjs',
   '--run','--model','anthropic/claude-opus-4','--max','1'],
  {encoding:'utf8',timeout:10000,env:{...process.env,OPENROUTER_API_KEY:''}});
 assert.equal(p.status,1);
 assert.match(p.stderr,/paid and auto-routing IDs are prohibited/);
 assert.doesNotMatch(p.stdout,/caseId/);
});


test('W5 free runner: beyond-DX25 range rejected before accessing API',()=>{
 const p=spawnSync(process.execPath,
  ['--experimental-strip-types','scripts/w5-free-model-trial.mjs','--run',
   '--model','nvidia/nemotron-3-ultra-550b-a55b:free','--start','7','--max','20'],
  {encoding:'utf8',timeout:10000,env:{...process.env,OPENROUTER_API_KEY:''}});
 assert.equal(p.status,1);
 assert.match(p.stderr,/contiguous range within the 25 synthetic cases/);
});
