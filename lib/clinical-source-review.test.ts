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

test('same publication with multiple passage IDs occupies only one clinical source slot',()=>{
 const one=citation('Same clinical guideline','https://guidelines.example.org/v1','world');
 one.passageId='pmc:PMC123:1';
 const two={...one,passageId:'pmc:PMC123:2'};
 const list=clinicalSourcesForStage([stage('summary','summary',[]),stage('earlier','analysis',[one,two])],0);
 assert.equal(list.earlierCount,1);
 assert.equal(list.earlier.length,1);
});

test('C7: distinct paragraphs of the same publication preserve the claim-to-passage mapping',()=>{
 const first=citation('Shared guideline','https://pubmed.ncbi.nlm.nih.gov/500/','world');
 first.passageId='pmc:PMC500:4';first.excerpt='Study population A for treatment A.';first.paragraph=4;
 const second={...first,passageId:'pmc:PMC500:11',excerpt:'Study population B for treatment B.',paragraph:11};
 const a=stage('a','analysis',[first,second]);
 a.result.draft.statements=[
  {text:'Treatment A in population A',source:'pmc:PMC500:4',held:false},
  {text:'Treatment B in population B',source:'pmc:PMC500:11',held:false},
 ] as typeof a.result.draft.statements;
 const [entry]=clinicalSourcesForStage([a],0).current;
 assert.equal(entry.passages.length,2);
 assert.deepEqual(entry.passages.map(p=>p.matchedStatements),[
  ['Treatment A in population A'],['Treatment B in population B']]);
 assert.equal(entry.matchedStatements.length,2);
});
test('C7: citation with abstract only remains available but has no invented claim mapping',()=>{
 const one=citation('A review','https://pubmed.ncbi.nlm.nih.gov/505/');
 one.abstract='Abstract-only material about a disease.';
 const stageOne=stage('s','analysis',[one]);
 const [entry]=clinicalSourcesForStage([stageOne],0).current;
 assert.equal(entry.passages[0].matchedStatements.length,0);
 assert.equal(entry.passages[0].citation.excerpt,undefined);
});

test('C7: the second excerpt of one retrieved article links only to its own claim',()=>{
 const guide=citation('Atrial fibrillation guideline','https://pubmed.ncbi.nlm.nih.gov/901/');
 guide.pmid='901';guide.pmcid='PMC901';guide.passageId='pmc:PMC901:1';
 guide.excerpt='This guideline recommends assessments before choosing therapy.';
 guide.paragraph=1;guide.chapter='Recommendations';
 guide.relatedPassages=[
  {excerpt:'Renal impairment requires additional safety monitoring.',chapter:'Safety',paragraph:3}
 ];
 const a=stage('a','analysis',[guide]);
 a.result.draft.statements=[{text:'Renal safety check',source:'pmc:PMC901:3',held:false}] as typeof a.result.draft.statements;
 const [source]=clinicalSourcesForStage([a],0).current;
 assert.equal(source.passages.length,2);
 assert.deepEqual(source.passages.map(p=>p.matchedStatements),[[],['Renal safety check']]);
 assert.equal(source.passages[1].citation.chapter,'Safety');
 assert.equal(source.passages[1].citation.paragraph,3);
});


test('guideline search handoff binds the originating case, rejecting malformed cross-case identity',()=>{
 const item=stage('x','summary',[]);
 const value={id:'case-synthetic-a',question:'',analyses:[item]} as ClinicalCase;
 const handoff=makeGuidelineTopicHandoff(value,item,clinicalSourcesForStage(value.analyses,0));
 assert.equal(handoff.caseId,'case-synthetic-a');
 assert.equal(parseGuidelineTopicHandoff(JSON.stringify(handoff))?.caseId,'case-synthetic-a');
 assert.equal(parseGuidelineTopicHandoff(JSON.stringify({...handoff,caseId:42})),null);
 assert.equal(parseGuidelineTopicHandoff(JSON.stringify({...handoff,caseId:'a'.repeat(151)})),null);
});
