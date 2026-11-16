import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {protocolDocumentMessage} from './protocol-bridge.ts';

const session='12345678-1234-1234-1234-123456789abc';
const id='87654321-1234-1234-1234-123456789abc';
const envelope={type:'concilium.protocol.document',session,id,text:'Synthetic draft for physician review',source:'Synthetic history'};

test('C14: Russian transcript preserves exact medicines, negations, doses and unknown speaker assignment',()=>{
 const transcript='Пациент: аллергии на пенициллин нет.\nВрач: Вы принимаете варфарин 5 мг?\n5 мг ежедневно, но вчера не принимал.';
 const saved=protocolDocumentMessage({...envelope,transcript},session,'ru');
 assert.ok(saved?.ambientSource);
 assert.equal(saved.ambientSource.speakerAssignment,'unverified');
 assert.deepEqual(saved.ambientSource.segments,[
  {id:'T1',text:'Пациент: аллергии на пенициллин нет.'},
  {id:'T2',text:'Врач: Вы принимаете варфарин 5 мг?'},
  {id:'T3',text:'5 мг ежедневно, но вчера не принимал.'}
 ]);
 assert.equal(saved.sourceSnapshot,'Synthetic history'); // original case facts stay separate
 assert.equal(saved.sections[0].text,'Synthetic draft for physician review');
});
test('C14: Global transcript is bound to its language and uses the same unverified source contract',()=>{
 const saved=protocolDocumentMessage({...envelope,locale:'fr',format:'soap',transcript:'Médecin: Prenez-vous 10 mg?\nPatient: Non.'},session,'en');
 assert.equal(saved?.locale,'fr');
 assert.deepEqual(saved?.ambientSource?.segments.map(x=>x.id),['T1','T2']);
 assert.equal(saved?.ambientSource?.segments[1].text,'Patient: Non.');
});
test('C14: malformed and oversized transcript payloads are rejected without partial data',()=>{
 assert.equal(protocolDocumentMessage({...envelope,transcript:{}},session,'ru'),null);
 assert.equal(protocolDocumentMessage({...envelope,transcript:'a'.repeat(100001)},session,'ru'),null);
 assert.equal(protocolDocumentMessage({...envelope,transcript:Array(5001).fill('word').join('\n')},session,'ru'),null);
 assert.equal(protocolDocumentMessage({...envelope,transcript:''},session,'ru')?.ambientSource,undefined);
});
test('C14: native protocols may not auto-start microphone or paid dialogue draft on transcription',()=>{
 const ruAudio=readFileSync('integrations/protocol/ru/components/AudioUpload.tsx','utf8');
 const ru=readFileSync('integrations/protocol/ru/app/protocol/page.tsx','utf8');
 const global=readFileSync('integrations/protocol/en/app/protocol/page.tsx','utf8');
 assert.doesNotMatch(ruAudio,/autoStartOnMount|setTimeout\(\(\)\s*=>\s*\{\s*void startRecording/);
 assert.doesNotMatch(ru,/autoStartOnMount|void buildDraftFromConversation\(nextTranscript\)/);
 assert.doesNotMatch(global,/void buildDraftFromConversation\(nextTranscript\)/);
 assert.match(ru,/ambientAudioConsent \? <AudioUpload/);
 assert.match(global,/ambientAudioConsent\?<AudioUpload/);
 assert.match(ru,/onClick=\{\(\)=>void buildDraftFromConversation\(conversationTranscriptText\)\}/);
 assert.match(global,/onClick=\{\(\)=>void buildDraftFromConversation\(conversationTranscriptText\)\}/);
 assert.match(ru,/transcript=\{conversationTranscriptText\}/);
 assert.match(global,/transcript=\{conversationTranscriptText\}/);
});
