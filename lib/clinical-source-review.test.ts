import assert from 'node:assert/strict';
import test from 'node:test';
import {clinicalSourcesForStage,makeGuidelineTopicHandoff,parseGuidelineTopicHandoff,GUIDELINE_HANDOFF_KEY} from './clinical-source-review.ts';
import type {Analysis,ClinicalCase} from './casebook.ts';
import type {Citation} from './literature.ts';
const citation=(title:string,url:string|null,shelf:Citation['shelf']='europepmc'):Citation=>({
 shelf,title,url,retrieved:'2026-11-16',license:null,country:null,pmid:null,journal:'Synthetic',year:'2026',pdf:null,edition:null,chapter:null,page:null
});
const stage=(id:string,kind:Analysis['kind'],citations:Citation[]):Analysis=>({
 id,kind,at:'2026-11-16T00:00:00Z',context:'',question:'Clinical topic',
 result:{citations,draft:{statements:[],report:{problem:'Heart failure guidance'}}}
} as unknown as Analysis);
test('summary retains previous real references, deduplicates and caps the total at six',()=>{
 const old=Array.from({length:9},(_,i)=>citation('Previous source '+i,'https://pubmed.ncbi.nlm.nih.gov/'+(111+i)+'/'));
 const summary=stage('summary','summary',[citation('New guideline','https://example.org/new','world')]);
 const list=clinicalSourcesForStage([summary,stage('old','analysis',old)],0);
 assert.equal(list.current.length,1);assert.equal(list.earlier.length,5);
 assert.equal(list.earlierCount,9);assert.equal(list.currentCount,1);
 assert.equal(clinicalSourcesForStage([stage('old','analysis',old)],0).earlier.length,0);
 const same=clinicalSourcesForStage([summary,stage('old','question',[summary.result.citations[0],...old])],0);
 assert.equal(same.earlierCount,9);
});
test('explicit claim cross-reference remains an unverified link, not invented evidence',()=>{
 const cited=citation('Source A','https://pubmed.ncbi.nlm.nih.gov/123/');
 cited.pmid='123';
 const s=stage('s','summary',[cited]);
 s.result.draft.statements=[{text:'Synthetic conclusion',source:'pmid:123',held:false}] as typeof s.result.draft.statements;
 assert.deepEqual(clinicalSourcesForStage([s],0).current[0].matchedStatements,['Synthetic conclusion']);
});
test('guideline handoff is browser-only, bounded, rejects unsafe links and does not change URL',()=>{
 const a=stage('s','summary',[citation('Guideline A','https://pubmed.ncbi.nlm.nih.gov/456/')]);
 const c={question:'',analyses:[a]} as ClinicalCase;
 const payload=makeGuidelineTopicHandoff(c,a,clinicalSourcesForStage(c.analyses,0));
 assert.equal(payload.topic,'Heart failure guidance');assert.equal(payload.sources.length,1);
 assert.equal(parseGuidelineTopicHandoff(JSON.stringify(payload))?.sources[0].title,'Guideline A');
 assert.equal(parseGuidelineTopicHandoff(JSON.stringify({...payload,sources:[{title:'Unsafe',url:'javascript:alert(1)'}]})),null);
 assert.ok(GUIDELINE_HANDOFF_KEY);assert.equal(JSON.stringify(payload).includes('patientId='),false);
});
