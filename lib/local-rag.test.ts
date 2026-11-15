import test from 'node:test';import assert from 'node:assert/strict';
import { retrievePassages, passageCitations } from './local-rag.ts';
import { sourceKeys } from './draft.ts';
test('physician library retrieves relevant text with a stable locator and an allowed source key',()=>{
 const passages=retrievePassages('atrial fibrillation anticoagulation',[{name:'guide.txt',text:'Renal function monitoring.\fAtrial fibrillation anticoagulation requires assessment of individual risks.',sha256:'a'.repeat(64)},{name:'unrelated.txt',text:'Plant pathology and crop protection.'}]);
 assert.equal(passages.length,1);assert.match(passages[0].locator,/страница 2/);assert.match(passages[0].text,/individual risks/);
 const citations=passageCitations(passages,'2026-11-07');assert.ok(sourceKeys(citations).has(passages[0].id));
});
test('empty or irrelevant reference material never becomes fabricated evidence',()=>{
 assert.deepEqual(retrievePassages('atrial fibrillation',[{name:'blank.pdf'}]),[]);
 assert.deepEqual(retrievePassages('atrial fibrillation',[{name:'plants.txt',text:'Plant pathology research.'}]),[]);
});
