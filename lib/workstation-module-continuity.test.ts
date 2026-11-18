import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {newCase,persistCase,readCases,caseSignature,persistCopilotAnalysis,persistCompletedClinicalAnalysis,persistGeneticsResult,persistGeneticsDraft,persistStructuredProtocol,persistStructuredProtocolDraft,type Analysis} from './casebook.ts';
import {conduct} from './conductor.ts';
import {geneticFilesKey,geneticsInputSignature} from './genetics-case-handoff.ts';
import type {ProtocolDocument} from '../packages/protocol/document.ts';

test('Copilot, late clinical response, protocol and genetics returns share the latest case without erasing physician drafts',async()=>{
 const value=newCase();value.context='Synthetic clinical facts';
 value.workspaceDraft={question:'Unsent follow-up',note:'Unsent observation',decision:'Physician draft',tab:'decision'};
 await persistCase(value);
 const file={name:'SYNTHETIC.vcf',text:'##fileformat=VCFv4.2',sha256:'d'.repeat(64)};
 await persistGeneticsDraft(value.id,{files:[file],context:'Family history draft',question:'Unsent genetics question',focus:'',discussion:[]});
 await persistStructuredProtocolDraft(value.id,'other-language',{source:'Unfinished protocol source',document:null,at:value.created});
 const result=conduct({text:'Synthetic local fixture; no inference'});result.clinicalDraft='generated';
 const entry=(id:string):Analysis=>({id,at:new Date().toISOString(),context:value.context,inputSignature:caseSignature(value),result});
 const document:ProtocolDocument={id:'synthetic-combined-protocol',locale:'en',kind:'encounter',created:value.created,sections:[{id:'history',title:'History',text:'No new observations were inferred.'}]};
 await Promise.all([
  persistCopilotAnalysis(value.id,caseSignature(value),entry('copilot-return')),
  persistCompletedClinicalAnalysis(value,entry('late-clinical-return'),{question:'',note:'',decision:'',tab:'analysis'}),
  persistStructuredProtocol(value.id,document),
  persistGeneticsResult(value.id,[file],{id:'genetics-return',at:value.created,caseId:value.id,filesKey:geneticFilesKey([file]),inputSignature:geneticsInputSignature(value,[file]),question:'Earlier genetic question',clinicalContext:value.context,result}),
 ]);
 const saved=(await readCases()).find(item=>item.id===value.id)!;
 assert.deepEqual(new Set(saved.analyses.map(item=>item.id)),new Set(['copilot-return','late-clinical-return','genetics-return']));
 assert.equal(saved.files[0].sha256,file.sha256);assert.deepEqual(saved.protocols,[document]);
 assert.equal(saved.workspaceDraft?.note,'Unsent observation');assert.equal(saved.workspaceDraft?.decision,'Physician draft');
 assert.equal(saved.geneticsDraft?.question,'Unsent genetics question');assert.equal(saved.structuredProtocolDrafts?.['other-language'].source,'Unfinished protocol source');
 assert.equal(saved.context,value.context);
 await assert.rejects(()=>persistCopilotAnalysis(value.id,caseSignature(value),entry('stale-copilot-return')),/Данные случая изменились/);
 assert.equal((await readCases()).find(item=>item.id===value.id)?.analyses.length,3);
});
