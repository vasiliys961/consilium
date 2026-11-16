import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {newCase,readCases,persistCase,persistCaseDraft,persistNativeProtocol,protocolSource,exportCase} from './casebook.ts';
import {readVaultCaseById} from './local-vault.ts';
import {conduct} from './conductor.ts';
import {protocolDocumentMessage,protocolForEdition} from './protocol-bridge.ts';

const session='12345678-1234-1234-1234-123456789abc';
const ruId='87654321-1234-1234-1234-123456789abc';
const globalId='abcdef12-1234-1234-1234-123456789abc';
function protocol(id:string,text:string,edition:'ru'|'en',locale:string){
 return protocolDocumentMessage({
  type:'concilium.protocol.document',id,session,text,source:'Synthetic case source',
  ...(edition==='en'?{locale,format:'soap',state:{reasoningDraft:'Synthetic prior reasoning',finalNote:text,physicianAdditions:'Synthetic physician edits',templateId:'clinical-general',specialistName:'Synthetic physician',customTemplate:'',universalPrompt:''}}:{})
 },session,edition)!;
}
function fixture(){
 const value=newCase();
 value.title='Synthetic clinical follow-up';
 value.context='Dyspnea, no real patient identifiers';
 value.question='Assess follow-up risks';
 value.files=[{name:'synthetic-note.txt',sha256:'a'.repeat(64),text:'Synthetic note'}];
 value.events=[{id:'synthetic-decision',at:value.created,kind:'decision',text:'Original physician decision',
  revisions:[{at:value.created,text:'Earlier synthetic decision'}]}];
 const result=conduct({text:'Synthetic clinical question'});
 result.draft.summary='Provisional clinical evaluation, not physician-verified.';
 value.analyses=[{id:'clinical-analysis',at:value.created,context:value.context,result}];
 return value;
}
async function cleanup(id:string){try{await persistCase({...fixture(),id},true);}catch{}}

test('C11 native RU protocol returns to the exact persisted case without touching files, decisions, analyses or source',async()=>{
 const value=fixture();await persistCase(value);
 try{
  const doc=protocol(ruId,'Synthetic RU protocol V1','ru','ru');
  const saved=await persistNativeProtocol(value.id,doc,'ru','ru','2026-11-16T20:00:00Z');
  assert.equal(saved.protocols?.[0].id,ruId);
  assert.equal(saved.protocols?.[0].sourceSnapshot,'Synthetic case source');
  assert.equal(saved.protocols?.[0].locale,'ru');
  assert.deepEqual(saved.events,value.events);
  assert.deepEqual(saved.files,value.files);
  assert.deepEqual(saved.analyses,value.analyses);
  assert.match(protocolSource(saved),/Assess follow-up risks/);
  const reopened=(await readCases()).find(row=>row.id===value.id)!;
  assert.equal(reopened.protocols?.[0].sections[0].text,'Synthetic RU protocol V1');
  assert.equal(reopened.analyses[0].id,'clinical-analysis');
 }finally{await cleanup(value.id);}
});

test('C11 repeated native save is idempotent, changed same-ID protocol retains original as a historical revision',async()=>{
 const value=fixture();await persistCase(value);
 try{
  const v1=protocol(ruId,'History v1','ru','ru');
  await persistNativeProtocol(value.id,v1,'ru','ru','2026-11-16T20:00:00Z');
  const identical=protocol(ruId,'History v1','ru','ru');
  const noop=await persistNativeProtocol(value.id,identical,'ru','ru','2026-11-16T20:01:00Z');
  assert.equal(noop.protocolRevisions?.length??0,0);
  const v2=protocol(ruId,'History v2 with revised physician observation','ru','ru');
  const after=await persistNativeProtocol(value.id,v2,'ru','ru','2026-11-16T20:02:00Z');
  assert.equal(after.protocols?.[0].sections[0].text,'History v2 with revised physician observation');
  assert.equal(after.protocolRevisions?.length,1);
  assert.equal(after.protocolRevisions?.[0].document.sections[0].text,'History v1');
  const exported=exportCase(after);
  assert.match(exported,/History v2/);
  assert.match(exported,/Предыдущая редакция протокола/);
  assert.match(exported,/History v1/);
  const reloaded=await readVaultCaseById(value.id);
  assert.equal(reloaded?.protocolRevisions?.[0].document.id,ruId);
 }finally{await cleanup(value.id);}
});

test('C11 Global French stays in its own locale and never overwrites RU or English',async()=>{
 const value=fixture();await persistCase(value);
 try{
  const russian=protocol(ruId,'Русский независимый документ','ru','ru');
  const global=protocol(globalId,'SOAP note in French','en','fr');
  await persistNativeProtocol(value.id,russian,'ru','ru');
  const updated=await persistNativeProtocol(value.id,global,'en','fr');
  assert.equal(updated.protocols?.length,2);
  assert.equal(protocolForEdition(updated.protocols,'ru')?.id,ruId);
  assert.equal(protocolForEdition(updated.protocols,'en','fr')?.id,globalId);
  assert.equal(protocolForEdition(updated.protocols,'en','en'),undefined);
  assert.equal(updated.events[0].text,'Original physician decision');
  assert.equal(updated.protocols?.[0].nativeState?.physicianAdditions,'Synthetic physician edits');
 }finally{await cleanup(value.id);}
});

test('C11 refuses mismatched Global language, closed case and missing case without writing',async()=>{
 const value=fixture();await persistCase(value);
 try{
  const french=protocol(globalId,'Synthétique SOAP','en','fr');
  await assert.rejects(()=>persistNativeProtocol(value.id,french,'en','en'),/Язык или версия/);
  await assert.rejects(()=>persistNativeProtocol(value.id,french,'ru','ru'),/Язык или версия/);
  assert.equal((await readVaultCaseById(value.id))?.protocols?.length??0,0);
  await persistCase({...value,status:'closed'});
  await assert.rejects(()=>persistNativeProtocol(value.id,french,'en','fr'),/завершён/);
  assert.equal((await readVaultCaseById(value.id))?.protocols?.length??0,0);
  await assert.rejects(()=>persistNativeProtocol(crypto.randomUUID(),french,'en','fr'),/не найден/);
 }finally{await cleanup(value.id);}
});

test('C11 protocol return serializes with pending case draft writes instead of losing the later draft',async()=>{
 const value=fixture();await persistCase(value);
 try{
  const pending={question:'Unsent follow-up question',note:'New synthetic physician observation',decision:'Unapproved change',tab:'context'};
  const note=protocol(ruId,'Protocol from the same saved case','ru','ru');
  const [stored,patched]=await Promise.all([
   persistNativeProtocol(value.id,note,'ru','ru'),
   persistCaseDraft(value.id,pending)
  ]);
  assert.equal(patched,true);
  const reloaded=await readVaultCaseById(value.id);
  assert.deepEqual(reloaded?.workspaceDraft,pending);
  assert.equal(reloaded?.protocols?.[0].id,note.id);
  assert.equal(reloaded?.events[0].text,'Original physician decision');
  assert.equal(stored.analyses.length,1);
 }finally{await cleanup(value.id);}
});
