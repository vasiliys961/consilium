import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {newCase,persistCase,persistCaseAutosave,persistGuidelineReview,readCases,caseSignature,caseContext,exportCase,type GuidelineReview} from './casebook.ts';

function sample():GuidelineReview{return {
 id:crypto.randomUUID(),at:new Date().toISOString(),topic:'Synthetic heart failure guidance',
 text:'Synthetic model-generated advice; verify original guideline and applicability.',
 model:'synthetic/mock',mode:'standard',language:'en',estimatedUsd:0,
 sourceCaseUpdatedAt:new Date().toISOString(),physicianEdited:false,status:'requires-review',
};}
test('independent guideline output returns only to its original case and never becomes physician facts',async()=>{
 const a=newCase();a.context='Synthetic case A';const b=newCase();b.context='Synthetic case B';
 await persistCase(a);await persistCase(b);
 const signature=caseSignature(a),review=sample();
 await persistGuidelineReview(a.id,signature,review);
 const cases=await readCases();const saved=cases.find(v=>v.id===a.id)!;
 assert.equal(saved.guidelineReviews?.[0].id,review.id);
 assert.equal(cases.find(v=>v.id===b.id)?.guidelineReviews?.length??0,0);
 assert.equal(saved.events.length,0);assert.equal(saved.analyses.length,0);
 assert.equal(caseContext(saved).includes(review.text),false);
 assert.equal(caseSignature(saved),signature);
 assert.match(exportCase(saved),/НЕ ПРОВЕРЕН/);
 assert.match(exportCase(saved),/Synthetic model-generated advice/);
 await persistGuidelineReview(a.id,signature,review);
 assert.equal((await readCases()).find(v=>v.id===a.id)?.guidelineReviews?.length,1);
});
test('changed case, closed case and missing case reject guideline return',async()=>{
 const value=newCase();value.context='Initial';await persistCase(value);
 const oldSignature=caseSignature(value);
 await persistCase({...value,context:'Updated clinical fact',updated:new Date(Date.now()+1000).toISOString()});
 await assert.rejects(()=>persistGuidelineReview(value.id,oldSignature,sample()),/case_sources_changed/);
 const fresh=(await readCases()).find(v=>v.id===value.id)!;
 await persistCase({...fresh,status:'closed',updated:new Date(Date.now()+2000).toISOString()});
 await assert.rejects(()=>persistGuidelineReview(value.id,caseSignature(fresh),sample()),/case_not_active/);
 await assert.rejects(()=>persistGuidelineReview('nonexistent',oldSignature,sample()),/case_not_active/);
});
test('late stale autosave cannot erase saved guideline search or physician draft',async()=>{
 const value=newCase();value.workspaceDraft={question:'Pending',note:'Physician note',decision:'Draft',tab:'context'};
 await persistCase(value);const stale={...value};
 await persistGuidelineReview(value.id,caseSignature(value),sample());
 assert.equal(await persistCaseAutosave(stale),false);
 const saved=(await readCases()).find(v=>v.id===value.id)!;
 assert.equal(saved.guidelineReviews?.length,1);
 assert.equal(saved.workspaceDraft?.note,'Physician note');
});
