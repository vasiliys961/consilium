import test from 'node:test';import assert from 'node:assert/strict';import {protocolDocumentMessage,nativeProtocolText} from './protocol-bridge.ts';
const session='12345678-1234-1234-1234-123456789abc',id='87654321-1234-1234-1234-123456789abc';
test('a native protocol preserves its edited text and source snapshot with a stable id',()=>{const doc=protocolDocumentMessage({type:'concilium.protocol.document',session,id,text:'Жалобы: данные не переданы.\nОсмотр: нет данных.',source:'Synthetic case'},session,'ru');assert.equal(doc?.id,id);assert.equal(doc?.sections[0].id,'native');assert.equal(doc?.sourceSnapshot,'Synthetic case');assert.equal(doc?.locale,'ru');});
test('protocol bridge refuses another session, errors and oversized texts rather than saving partial documents',()=>{const value={type:'concilium.protocol.document',session,id,text:'Draft',source:'Synthetic'};assert.equal(protocolDocumentMessage(value,'87654321-1234-1234-1234-123456789abc','en'),null);assert.equal(protocolDocumentMessage({...value,text:'Ошибка: provider'},session,'ru'),null);assert.equal(protocolDocumentMessage({...value,text:'A'.repeat(100001)},session,'ru'),null);assert.equal(protocolDocumentMessage({...value,id:'not-an-id'},session,'ru'),null);assert.equal(protocolDocumentMessage(value,session,'en')?.locale,'en');});

test('reopening a whole native document never adds repeated wrapper headings',()=>{const original='Жалобы: нет данных.\nПлан: запросить сведения.';const doc=protocolDocumentMessage({type:'concilium.protocol.document',session,id,text:original,source:'Synthetic'},session,'ru')!;for(let i=0;i<3;i++){const text=nativeProtocolText(doc);assert.equal(text,original);doc.sections[0].text=text;}assert.equal(nativeProtocolText(undefined),'');});

test('Russian and Global notes have independent namespaces, formats and preserved working state',async()=>{
 const {protocolForEdition}=await import('./protocol-bridge.ts');
 const state={reasoningDraft:'Working draft',finalNote:'Subjective:\nSynthetic',physicianAdditions:'Physician additions',templateId:'clinical-general',specialistName:'Synthetic physician',customTemplate:'Global template',universalPrompt:''};
 const global=protocolDocumentMessage({type:'concilium.protocol.document',session,id,text:state.finalNote,source:'Synthetic case',locale:'fr',format:'soap',state},session,'en')!;
 const russian=protocolDocumentMessage({type:'concilium.protocol.document',session,id:'abcdef12-1234-1234-1234-123456789abc',text:'Русский протокол',source:'Synthetic'},session,'ru')!;
 assert.equal(global.edition,'global');assert.equal(global.format,'soap');assert.equal(global.locale,'fr');assert.deepEqual(global.nativeState,state);assert.equal(protocolForEdition([global,russian],'ru'),russian);assert.equal(protocolForEdition([russian,global],'en'),global);assert.equal(protocolForEdition([russian],'en'),undefined);
 assert.equal(protocolDocumentMessage({type:'concilium.protocol.document',session,id,text:'Draft',source:'Synthetic',locale:'ru'},session,'en'),null);
 assert.equal(protocolDocumentMessage({type:'concilium.protocol.document',session,id,text:'Draft',source:'Synthetic',locale:'invalid'},session,'en'),null);
});


test('separate English, French and Russian saved protocols reopen only in their own language',async()=>{
 const {protocolForEdition}=await import('./protocol-bridge.ts');
 const eng=protocolDocumentMessage({type:'concilium.protocol.document',session,id,text:'English note',source:'Synthetic case',locale:'en'},session,'en')!;
 const fra=protocolDocumentMessage({type:'concilium.protocol.document',session,id:'12345678-1234-1234-1234-123456789abc',text:'Note française',source:'Synthetic case',locale:'fr'},session,'en')!;
 const rus=protocolDocumentMessage({type:'concilium.protocol.document',session,id:'abcdef12-1234-1234-1234-123456789abc',text:'Русский протокол',source:'Synthetic case'},session,'ru')!;
 const docs=[fra,rus,eng];
 assert.equal(protocolForEdition(docs,'en','fr')?.sections[0].text,'Note française');
 assert.equal(protocolForEdition(docs,'en','en')?.sections[0].text,'English note');
 assert.equal(protocolForEdition(docs,'ru','ru')?.sections[0].text,'Русский протокол');
 assert.equal(protocolForEdition(docs,'en','es'),undefined);
 assert.equal(protocolForEdition(docs,'en')?.locale,'fr');
});


test('C14: raw transcript is separate from physician reviewed document and preserved only when supplied',()=>{
 const transcript='Врач: Принимаете 5 мг?\nПациент: Нет, не принимаю.';
 const doc=protocolDocumentMessage({type:'concilium.protocol.document',session,id,text:'Жалобы: не сообщено.\nОбъективно: нет данных.',source:'Synthetic source',ambientTranscript:transcript},session,'ru');
 assert.equal(doc?.ambientTranscript,transcript);
 assert.equal(doc?.sections[0].text,'Жалобы: не сообщено.\nОбъективно: нет данных.');
 assert.equal(protocolDocumentMessage({type:'concilium.protocol.document',session,id,text:'Draft',source:'Synthetic',ambientTranscript:42},session,'ru'),null);
 assert.equal(protocolDocumentMessage({type:'concilium.protocol.document',session,id,text:'Draft',source:'Synthetic',ambientTranscript:'x'.repeat(100001)},session,'ru'),null);
 const legacy=protocolDocumentMessage({type:'concilium.protocol.document',session,id,text:'Old note',source:'Synthetic'},session,'ru');
 assert.equal(legacy?.ambientTranscript,undefined);
});
