import test from 'node:test';
import assert from 'node:assert/strict';
import {protocolLanguageHref,protocolLanguagePlan,protocolLanguages} from './protocol-language-flow.ts';
import {WORKSPACE_LANGUAGES} from './workspace-i18n.ts';

const CASE='12345678-1234-4234-9234-123456789abc';

test('post-analysis handoff opens the EXISTING protocol module with the saved case, not a clinical rerun',()=>{
 const href=protocolLanguageHref(CASE,['ru']);
 const url=new URL(href,'http://127.0.0.1:3207');
 assert.equal(url.pathname,'/protocol/case');
 assert.equal(url.searchParams.get('case'),CASE);
 assert.equal(url.searchParams.get('locale'),'ru');
 assert.deepEqual(protocolLanguagePlan(url.searchParams),['ru']);
 assert.equal(url.searchParams.has('task'),false);
});
test('multilingual plan preserves selected order and all ten UI locales, dedupes and rejects unknown values',()=>{
 const codes=WORKSPACE_LANGUAGES.map(x=>x.code);
 const href=protocolLanguageHref(CASE,[...codes,'ru','unexpected']);
 const params=new URL(href,'http://127.0.0.1:3207').searchParams;
 assert.deepEqual(protocolLanguagePlan(params),codes);
 assert.deepEqual(protocolLanguages(['ru','ru','es','fake','en']),['ru','es','en']);
 assert.equal(params.get('locale'),'ru');
 assert.equal(params.get('locales'),codes.join(','));
});
test('standalone single-language and malformed plan cannot redirect to an unknown locale',()=>{
 assert.equal(new URL(protocolLanguageHref(CASE,['en']),'http://127.0.0.1').searchParams.get('locales'),null);
 assert.deepEqual(protocolLanguagePlan(new URLSearchParams('locale=hack&locales=fake%2Ces')),['es']);
 assert.deepEqual(protocolLanguagePlan(new URLSearchParams('locale=unknown')),['ru']);
 assert.throws(()=>protocolLanguageHref('not-a-case',['ru']),/invalid_case_id/);
 assert.throws(()=>protocolLanguageHref(CASE,['unknown']),/select_protocol_language/);
});
