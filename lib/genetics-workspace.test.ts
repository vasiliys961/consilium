import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {newCase,persistCase,persistGeneticsDraft,persistGeneticsResult,persistCaseDraft,persistCaseAutosave,readCases,caseSignature,type ClinicalCase} from './casebook.ts';
import {geneticsWorkspaceForCase,geneticsInputSignature,geneticFilesKey,type GeneticsWorkspaceDraft,type GeneticsDiscussionTurn} from './genetics-case-handoff.ts';
import {conduct,type CaseFile} from './conductor.ts';
const vcf:CaseFile={name:'synthetic.vcf',sha256:'a'.repeat(64),text:'##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT'};
function draft(value:ClinicalCase):GeneticsWorkspaceDraft{return {files:[vcf],context:'Synthetic family history '+value.id,question:'Unsent genetics question '+value.id,focus:'synthetic-variant',discussion:[]};}
async function reopened(id:string){return (await readCases()).find(value=>value.id===id)!;}
function turn(value:ClinicalCase):GeneticsDiscussionTurn{
 const result=conduct({text:'Synthetic review only'});result.clinicalDraft='generated';result.draft.summary='Synthetic unverified genetics interpretation';
 return {id:'synthetic-turn',at:new Date().toISOString(),caseId:value.id,inputSignature:geneticsInputSignature(value,[vcf]),question:'Synthetic question',clinicalContext:value.context,filesKey:geneticFilesKey([vcf]),result};
}

test('genetics drafts restore only their own case files and editable questions after reopening',async()=>{
 const a=newCase(),b=newCase();await persistCase(a);await persistCase(b);
 await persistGeneticsDraft(a.id,draft(a));
 const savedA=await reopened(a.id);
 assert.equal(await persistCaseAutosave({...a,updated:savedA.updated}),false,'Even same-millisecond autosave cannot erase genetics drafts');
 assert.deepEqual(geneticsWorkspaceForCase(await reopened(b.id)),{files:[],context:'',question:'',focus:'',discussion:[]});
 await persistGeneticsDraft(b.id,{...draft(b),files:[{...vcf,sha256:'b'.repeat(64)}]});
 const restoredA=geneticsWorkspaceForCase(await reopened(a.id)),restoredB=geneticsWorkspaceForCase(await reopened(b.id));
 assert.equal(restoredA.files[0].sha256,'a'.repeat(64));assert.equal(restoredB.files[0].sha256,'b'.repeat(64));
 assert.notEqual(restoredA.question,restoredB.question);
 restoredA.files[0].name='changed locally';
 assert.equal(geneticsWorkspaceForCase(await reopened(a.id)).files[0].name,'synthetic.vcf');
});

test('foreign-case discussions cannot be inserted into another case draft',async()=>{
 const a=newCase(),b=newCase();await persistCase(a);await persistCase(b);
 const wrong={...draft(a),discussion:[turn(a)]};
 await assert.rejects(persistGeneticsDraft(b.id,wrong),/mismatch/);
 assert.throws(()=>geneticsWorkspaceForCase({...b,geneticsDraft:wrong}),/mismatch/);
 assert.equal((await reopened(b.id)).geneticsDraft,undefined);
});

test('genetics result and simultaneous physician draft are serialized without replacing either',async()=>{
 const value=newCase();value.context='Synthetic initial context';await persistCase(value);
 const editor={question:'New unsent physician question',note:'New observation',decision:'Pending physician decision',tab:'decision'};
 await Promise.all([persistGeneticsResult(value.id,[vcf],turn(value)),persistCaseDraft(value.id,editor)]);
 const saved=await reopened(value.id);assert.equal(saved.analyses.length,1);assert.equal(saved.files[0].sha256,vcf.sha256);assert.deepEqual(saved.workspaceDraft,editor);
 await persistGeneticsResult(value.id,[vcf],turn(value));assert.equal((await reopened(value.id)).analyses.length,1);
});

test('a later clinical context is retained and cannot be relabeled as the input to an older genetic result',async()=>{
 const before=newCase();before.context='Synthetic source context';await persistCase(before);
 const response=turn(before);
 const later={...before,context:'New symptoms after the genetics request',events:[{id:'new-decision',at:new Date().toISOString(),kind:'decision' as const,text:'New physician plan'}]};await persistCase(later);
 const saved=await persistGeneticsResult(before.id,[vcf],response);
 assert.equal(saved.context,later.context);assert.deepEqual(saved.events,later.events);
 assert.equal(saved.analyses[0].inputSignature,response.inputSignature);assert.notEqual(saved.analyses[0].inputSignature,caseSignature(saved));
});

test('changed VCF, closed case and missing case reject result saving while previous records remain',async()=>{
 const value=newCase();await persistCase(value);
 await assert.rejects(persistGeneticsResult(value.id,[{...vcf,sha256:'c'.repeat(64)}],turn(value)),/исходные файлы изменились/);
 await persistCase({...value,status:'closed'});
 await assert.rejects(persistGeneticsResult(value.id,[vcf],turn(value)),/закрыт/);
 await assert.rejects(persistGeneticsDraft(value.id,draft(value)),/not_active/);
 await assert.rejects(persistGeneticsResult(crypto.randomUUID(),[vcf]),/не найден/);
 assert.equal((await reopened(value.id)).analyses.length,0);
});
