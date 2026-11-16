import test from 'node:test';
import assert from 'node:assert/strict';
import {completedProtocolSourceId,savedStructuredProtocol} from './protocol-two-mode.ts';
import type {Analysis} from './casebook.ts';
import type {ProtocolDocument} from '../packages/protocol/document.ts';

const completed={id:'analysis-1',result:{clinicalDraft:'generated'}} as Analysis;
const failed={id:'analysis-2',result:{clinicalDraft:'unavailable'}} as Analysis;
test('format only the latest completed clinical analysis, never a failed or superseded one',()=>{
 assert.equal(completedProtocolSourceId([completed]),'analysis-1');
 assert.equal(completedProtocolSourceId([failed,completed]),undefined);
 assert.equal(completedProtocolSourceId([]),undefined);
});
test('keep separate Russian English and French protocols and separate clinical modes',()=>{
 const make=(id:string,locale:'ru'|'en'|'fr',generationMode:'from-analysis'|'standalone',analysisId?:string):ProtocolDocument=>({
  id,created:'2026-11-15',locale,kind:'encounter',generationMode,sourceAnalysisId:analysisId,sections:[{id:'Diagnosis',title:'Diagnosis',text:id}]
 });
 const docs=[
  make('French-format','fr','from-analysis','analysis-1'),
  make('English-format','en','from-analysis','analysis-1'),
  make('Russian-format','ru','from-analysis','analysis-1'),
  make('English-other-analysis','en','from-analysis','analysis-0'),
  make('English-independent','en','standalone')
 ];
 assert.equal(savedStructuredProtocol(docs,'encounter','en','from-analysis','analysis-1')?.id,'English-format');
 assert.equal(savedStructuredProtocol(docs,'encounter','fr','from-analysis','analysis-1')?.id,'French-format');
 assert.equal(savedStructuredProtocol(docs,'encounter','ru','from-analysis','analysis-1')?.id,'Russian-format');
 assert.equal(savedStructuredProtocol(docs,'encounter','en','from-analysis','analysis-2'),undefined);
 assert.equal(savedStructuredProtocol(docs,'encounter','en','standalone')?.id,'English-independent');
});
