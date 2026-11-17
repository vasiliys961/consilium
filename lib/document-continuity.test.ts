import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {newCase,persistCase,persistCaseAutosave,persistStructuredProtocol,persistStructuredProtocolDraft,readCases,type ClinicalCase} from './casebook.ts';
import {conduct} from './conductor.ts';
import {originalClinicalDocument,completedClinicalEvidence} from './protocol-print.ts';
import {protocolText,type ProtocolDocument} from '../packages/protocol/document.ts';
import {createProtocolDocx} from '../packages/protocol/docx.ts';
import {catalogZip} from '../packages/intake/zip.ts';
import {structuredProtocolDraftKey} from './protocol-two-mode.ts';
import {protocolEditorHref,requestedProtocol} from './c11-module-overview.ts';

function document(id='synthetic-protocol',text='Original physician-reviewed text'):ProtocolDocument{
 return {id,created:'2026-11-17T10:00:00.000Z',locale:'ru',kind:'encounter',generationMode:'standalone',presentation:'formal',sections:[{id:'assessment',title:'Assessment',text}]};
}
async function reopened(id:string){return (await readCases()).find(value=>value.id===id)!;}

test('structured save preserves all case fields, is idempotent, and retains prior physician edits as revisions',async()=>{
 const value=newCase();value.context='Synthetic physician facts';value.workspaceDraft={question:'Unsent clinical question',note:'Unsent note',decision:'Unapproved decision',tab:'decision'};
 value.files=[{name:'synthetic.txt',text:'Synthetic original',sha256:'a'.repeat(64)}];
 await persistCase(value);
 const first=document();await persistStructuredProtocol(value.id,first);
 await persistStructuredProtocol(value.id,first);
 assert.equal((await reopened(value.id)).protocolRevisions?.length??0,0);
 const second={...first,edited:true,sections:[{id:'assessment',title:'Assessment',text:'Revised observation with preserved negation: no active bleeding'}]};
 await persistStructuredProtocol(value.id,second);
 const saved=await reopened(value.id);
 assert.equal(saved.protocols?.length,1);assert.deepEqual(saved.protocols?.[0],second);
 assert.deepEqual(saved.protocolRevisions?.[0].document,first);
 assert.deepEqual(saved.workspaceDraft,value.workspaceDraft);assert.deepEqual(saved.files,value.files);assert.equal(saved.context,value.context);
});

test('structured protocol return and concurrent editor write preserve both results',async()=>{
 const value=newCase();await persistCase(value);
 const key=structuredProtocolDraftKey('encounter','fr','standalone','formal');
 const scratch={source:'Synthetic source with dose 0,125 mg',document:document('fr-draft'),at:new Date().toISOString()};
 await Promise.all([persistStructuredProtocol(value.id,document()),persistStructuredProtocolDraft(value.id,key,scratch)]);
 const saved=await reopened(value.id);assert.equal(saved.protocols?.length,1);assert.deepEqual(saved.structuredProtocolDrafts?.[key],scratch);
 const latest=await reopened(value.id);
 const stale=await persistCaseAutosave({...value,updated:latest.updated});assert.equal(stale,false,'A stale workspace cannot erase a newly stored protocol draft');
});

test('separate language/layout drafts survive reopening and saving clears only the current draft',async()=>{
 const value=newCase();await persistCase(value);
 const ru=structuredProtocolDraftKey('encounter','ru','standalone','formal');
 const en=structuredProtocolDraftKey('encounter','en','standalone','soap');
 const at=new Date().toISOString();
 await persistStructuredProtocolDraft(value.id,ru,{source:'RU source',document:document(),at});
 await persistStructuredProtocolDraft(value.id,en,{source:'EN source',document:null,at});
 let saved=await reopened(value.id);assert.equal(saved.structuredProtocolDrafts?.[ru].source,'RU source');assert.equal(saved.structuredProtocolDrafts?.[en].source,'EN source');
 await persistStructuredProtocol(value.id,document(),ru);saved=await reopened(value.id);
 assert.equal(saved.structuredProtocolDrafts?.[ru],undefined);assert.equal(saved.structuredProtocolDrafts?.[en].source,'EN source');
});

test('wrong language, native identity, closed/deleted/missing case cannot be overwritten by structured save',async()=>{
 const value=newCase();await persistCase(value);await persistStructuredProtocol(value.id,document());
 await assert.rejects(persistStructuredProtocol(value.id,{...document(),locale:'en'}),/identity/);
 const native={...document('native'),edition:'ru' as const};await persistCase({...await reopened(value.id),protocols:[native]});
 await assert.rejects(persistStructuredProtocol(value.id,document('native')),/identity/);
 await assert.rejects(persistStructuredProtocol(value.id,native),/invalid/);
 await persistCase({...await reopened(value.id),status:'closed'});
 await assert.rejects(persistStructuredProtocol(value.id,document()),/not_active/);
 await assert.rejects(persistStructuredProtocolDraft(value.id,'draft',{source:'unsaved',document:null,at:new Date().toISOString()}),/not_active/);
 await assert.rejects(persistStructuredProtocol(crypto.randomUUID(),document()),/not_active/);
});

test('saved-document links select the exact editor, document and language rather than another same-language note',()=>{
 const first=document('first'),second=document('second');
 assert.equal(new URL(protocolEditorHref('case',first),'http://localhost').pathname,'/protocol/structured');
 assert.equal(new URL(protocolEditorHref('case',first),'http://localhost').searchParams.get('document'),'first');
 assert.equal(requestedProtocol([second,first],'first','ru')?.id,'first');
 assert.equal(requestedProtocol([second,first],'first','en'),undefined);
 assert.equal(requestedProtocol([second],'first','ru'),undefined);
 const native={...first,edition:'ru' as const};
 assert.equal(new URL(protocolEditorHref('case',native),'http://localhost').pathname,'/protocol/case');
 assert.equal(requestedProtocol([native],'first','ru','ru')?.id,'first');
 assert.equal(requestedProtocol([native],'first','ru'),undefined);
});

test('clinical note to DOCX preserves ECG, council dissent, missing opinions, all physician decisions and sources',async()=>{
 const value=newCase();value.question='Synthetic question';
 const result=conduct({text:'Synthetic context'});result.clinicalDraft='generated';result.draft.summary='Synthetic summary';
 result.ecgEvidence={module:'ecgfounder',method:'digital-ecg-waveform',source:'synthetic.csv',sha256:'b'.repeat(64),status:'read',threshold:0.5,cleared:[],top:null,reason:null};
 result.voices=[{id:'challenger',status:'done',text:'Synthetic dissent: the proposed cause is not established',model:'mock'}, {id:'checklist',status:'not_assessed',text:'DO NOT PRINT AS A COMPLETED OPINION',failure:'deadline'}] as typeof result.voices;
 result.citations=[{title:'Synthetic source title',url:'https://example.org/synthetic-source'}] as typeof result.citations;
 value.events=Array.from({length:3},(_,i)=>({id:'decision-'+i,at:new Date().toISOString(),kind:'decision',text:'Synthetic physician decision '+i}));
 value.analyses=[{id:'analysis',at:new Date().toISOString(),context:'Synthetic input',result}];
 const source=completedClinicalEvidence(value)!;assert.match(source,/Synthetic dissent/);assert.match(source,/Synthetic source title/);
 const note=originalClinicalDocument(value)!;const text=protocolText(note);
 for(const phrase of ['ECGFounder','НЕ означает нормальную ЭКГ','Synthetic dissent','Отсутствие ответа не означает согласия','Synthetic physician decision 0','Synthetic physician decision 2','https://example.org/synthetic-source'])assert.ok(text.includes(phrase),phrase);
 assert.doesNotMatch(text,/DO NOT PRINT AS A COMPLETED OPINION/);
 const entries=catalogZip(createProtocolDocx({title:'Synthetic clinical note',text,locale:'ru'}),'full');
 const xml=new TextDecoder().decode((await entries.find(entry=>entry.name==='word/document.xml')!.open())!);
 assert.match(xml,/Synthetic physician decision 0/);assert.match(xml,/Synthetic dissent/);assert.match(xml,/ECGFounder/);
});

test('a long clinical source is preserved through its end rather than silently truncated',()=>{
 const value=newCase(),result=conduct({text:'Synthetic'});result.clinicalDraft='generated';result.draft.summary='S'.repeat(100050)+' IMPORTANT SYNTHETIC END';
 value.analyses=[{id:'long',at:new Date().toISOString(),context:'Synthetic',result}];
 assert.ok(completedClinicalEvidence(value)!.includes('IMPORTANT SYNTHETIC END'));
 assert.ok(protocolText(originalClinicalDocument(value)!).includes('IMPORTANT SYNTHETIC END'));
});

test('protocol draft keys cannot leak another language, layout or selected document',()=>{
 const key=(locale:'ru'|'en',presentation:'formal'|'soap',id:string)=>structuredProtocolDraftKey('encounter',locale,'standalone',presentation,undefined,id);
 assert.equal(new Set([key('ru','formal','first'),key('en','formal','first'),key('ru','soap','first'),key('ru','formal','second')]).size,4);
});
