import test from 'node:test';import assert from 'node:assert/strict';import 'fake-indexeddb/auto';
import {receiveInboxFile,readInboxFiles,trashInboxFile} from './file-inbox.ts';
test('standalone inbox retains original bytes, avoids duplicate transfers, and restores trashed files',async()=>{
 const input=new File(['synthetic original PDF bytes'],'synthetic.pdf',{type:'application/pdf'});const item=await receiveInboxFile(input);assert.equal(await item.blob.text(),await input.text());
 await receiveInboxFile(input);assert.equal((await readInboxFiles()).length,1);
 await trashInboxFile(item.id);assert.ok((await readInboxFiles())[0].deletedAt);
 await trashInboxFile(item.id,true);assert.equal((await readInboxFiles())[0].deletedAt,undefined);
 await assert.rejects(()=>receiveInboxFile(new File([new Uint8Array(8_000_001)],'large.bin')));
});
