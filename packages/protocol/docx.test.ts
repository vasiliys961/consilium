import test from 'node:test';import assert from 'node:assert/strict';import {createProtocolDocx} from './docx.ts';import {catalogZip} from '../intake/zip.ts';
test('DOCX is a real OOXML ZIP with escaped clinical text and a styles relationship',async()=>{
 const bytes=createProtocolDocx({title:'Протокол осмотра',text:'Черновик <не подписан> & проверить\n# Решение врача\nБез назначения',locale:'ru'});
 assert.equal(bytes.subarray(0,2).toString(),'PK');const entries=catalogZip(bytes,'full');for(const name of ['[Content_Types].xml','word/document.xml','word/styles.xml','word/_rels/document.xml.rels'])assert.ok(entries.some(entry=>entry.name===name));
 const document=new TextDecoder().decode((await entries.find(entry=>entry.name==='word/document.xml')!.open())!);assert.match(document,/&lt;не подписан&gt; &amp; проверить/);assert.match(document,/Протокол осмотра/);assert.ok(!document.includes('<html'));
});
