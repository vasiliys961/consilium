import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {newCase,caseAnalysisInput,type ClinicalCase} from './casebook.ts';
import {conduct} from './conductor.ts';
import type {CaseResult,CaseFile} from './conductor.ts';
import {geneticFilesInCase,geneticFilesKey,mergeGeneticsIntoCase,type GeneticsDiscussionTurn} from './genetics-case-handoff.ts';
import {writeVaultCase,readVaultCaseById} from './local-vault.ts';

const oldHash='a'.repeat(64),newHash='b'.repeat(64);
const vcf:CaseFile={name:'synthetic-variants.vcf',sha256:oldHash,text:'##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT',bytes:38};
const replacement:CaseFile={...vcf,sha256:newHash,text:'##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\n1\t123\trs1\tA\tG'};

function caseWithHistory():ClinicalCase{
 const value=newCase();
 value.title='Synthetic inherited-condition discussion';
 value.context='Clinical family history without real personal details';
 value.events=[{id:'physician-decision',at:value.created,kind:'decision',text:'Keep original physician plan'}];
 value.files=[vcf];
 return value;
}
function syntheticTurn(value:ClinicalCase,files:CaseFile[]=[],id='genetic-turn-1'):GeneticsDiscussionTurn{
 const result:CaseResult={...conduct({text:'Synthetic genomic review'}),clinicalDraft:'generated'};
 result.draft.summary='Synthetic genetic consultation: pathogenicity NOT established';
 result.citations=[{shelf:'genetics',title:'Synthetic public evidence',url:'https://example.org/synthetic',retrieved:'2026-11-16',license:null,country:null,pmid:null,journal:null,year:null,pdf:null,edition:null,chapter:'Synthetic methods',page:'2',passageId:'synthetic:2'}];
 return {id,at:'2026-11-16T12:00:00Z',caseId:value.id,question:'Clinical impact of the synthetic genetic observation?',clinicalContext:'Family history from the actual case, current medications and explicit evidence limitations',filesKey:geneticFilesKey(files),result};
}

test('C11 genetics can save a case-linked question-only discussion without re-uploading an attachment',async()=>{
 const existing=caseWithHistory();
 const turn=syntheticTurn(existing,[]);
 const next=mergeGeneticsIntoCase(existing,[],turn,'2026-11-16T12:01:00Z');
 assert.equal(next.files.length,1,'previous patient materials remain available');
 assert.equal(next.analyses.length,1);
 assert.equal(next.analyses[0].id,turn.id);
 assert.equal(next.analyses[0].result.citations[0].passageId,'synthetic:2');
 assert.equal(next.events[0].text,'Keep original physician plan');
 assert.equal(existing.analyses.length,0,'input case is not mutated');
 assert.equal(mergeGeneticsIntoCase(next,[],turn),next,'second save of the same turn is idempotent');
 await writeVaultCase(next);
 try{
  const actual=await readVaultCaseById(next.id);
  assert.equal(actual?.analyses[0].id,turn.id);
  assert.match(caseAnalysisInput(actual!).text,/Synthetic genetic consultation: pathogenicity NOT established/);
  assert.equal(actual?.events[0].text,'Keep original physician plan');
 }finally{await writeVaultCase(next,true);}
});

test('C11 genetic results are not silently attributed to a replaced VCF under the same filename',()=>{
 const value=caseWithHistory(),turn=syntheticTurn(value,[vcf]);
 assert.throws(()=>mergeGeneticsIntoCase(value,[replacement],turn),/исходные файлы изменились/);
 assert.equal(value.analyses.length,0);
 assert.equal(value.files[0].sha256,oldHash);
});

test('C11 genetic module keeps existing analyses, decisions and attachments, and avoids duplicates on retry',()=>{
 const value=caseWithHistory();
 const prior=syntheticTurn(value,[], 'old-turn');
 value.analyses=[{id:'old-turn',at:prior.at,question:'Earlier review',context:'Historical context',result:prior.result}];
 const turn=syntheticTurn(value,[vcf], 'new-turn');
 const result=mergeGeneticsIntoCase(value,[vcf],turn,'2026-11-16T13:00:00Z');
 assert.deepEqual(result.analyses.map(a=>a.id),['new-turn','old-turn']);
 assert.equal(result.files.length,1,'same SHA-256 cannot duplicate the VCF');
 assert.equal(result.events[0].id,'physician-decision');
 assert.equal(mergeGeneticsIntoCase(result,[vcf],turn),result);
});

test('C11 only validated hash-bound VCF text is reused from the linked clinical case',()=>{
 const value=caseWithHistory();
 value.files.push({name:'patient-note.txt',text:'Not a genotype'},{name:'unverified.vcf',text:'##VCF no hash'},{name:'ecg.csv',sha256:newHash,text:'ECG numerical signals'});
 assert.deepEqual(geneticFilesInCase(value).map(f=>f.name),['synthetic-variants.vcf']);
 assert.deepEqual(geneticFilesKey([vcf,replacement]),geneticFilesKey([replacement,vcf]));
 assert.throws(()=>geneticFilesKey([{name:'unknown.vcf',text:'no hash'}]),/нужен SHA-256/);
});

test('C11 results cannot be reassigned to another or closed clinical case',()=>{
 const value=caseWithHistory(),other=caseWithHistory(),turn=syntheticTurn(value);
 assert.throws(()=>mergeGeneticsIntoCase(other,[],turn),/другого клинического случая/);
 assert.throws(()=>mergeGeneticsIntoCase({...value,status:'closed'},[],turn),/закрыт/);
 const failed=syntheticTurn(value);failed.result.clinicalDraft='unavailable';
 assert.throws(()=>mergeGeneticsIntoCase(value,[],failed),/Незавершённый разбор/);
});
