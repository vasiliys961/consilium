import test from 'node:test';
import assert from 'node:assert/strict';
import {newCase} from './casebook.ts';
import {radiologySourceStatus,protocolEditorHref,earlierProtocolVersions} from './c11-module-overview.ts';
import type {ProtocolDocument} from '../packages/protocol/document.ts';
const key='a'.repeat(64);
const mkDoc=(locale:'ru'|'en',edition:'ru'|'global'):ProtocolDocument=>({
 id:'doc-1',created:'2026-11-16T12:00:00Z',locale,edition,kind:'encounter',
 sections:[{id:'s1',title:'Жалобы',text:'Синтетический пример'}]
});
test('C11: radiology provenance is verified by exact hashes, not file names',()=>{
 const value=newCase();value.files=[{name:'ct.dcm',sha256:key,bytes:123}];
 const report={id:'r1',module:'radiology' as const,fileKeys:[key.toUpperCase()],sources:['ct.dcm'],text:'Синтетический черновик',at:'2026-11-16T12:00:00Z',status:'reported' as const,coverage:'not_verified' as const};
 assert.equal(radiologySourceStatus(value,report),'linked');
 assert.equal(radiologySourceStatus(value,{...report,fileKeys:['b'.repeat(64)]}),'stale');
 assert.equal(radiologySourceStatus(value,{...report,fileKeys:[]}),'unverified');
 assert.equal(radiologySourceStatus(value,{...report,fileKeys:[key,'b'.repeat(64)]}),'stale');
});
test('C11: protocol reopening preserves edition and case identity',()=>{
 const id='11111111-2222-3333-4444-555555555555';
 assert.equal(protocolEditorHref(id,mkDoc('ru','ru')),'/protocol/case?case='+id+'&locale=ru');
 assert.equal(protocolEditorHref(id,mkDoc('en','global')),'/protocol/case?case='+id+'&locale=en');
});
test('C11: earlier document versions remain visible only for matching edition and language',()=>{
 const value=newCase(),ru=mkDoc('ru','ru'),en=mkDoc('en','global');
 value.protocolRevisions=[{savedAt:'2026-11-16T12:00:00Z',document:ru},{savedAt:'2026-11-16T12:01:00Z',document:en}];
 assert.deepEqual(earlierProtocolVersions(value,ru).map(x=>x.document.locale),['ru']);
 assert.deepEqual(earlierProtocolVersions(value,en).map(x=>x.document.locale),['en']);
});
