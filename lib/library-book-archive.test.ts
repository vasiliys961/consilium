import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {saveDocument,getAllDocuments,getDocumentChunkRecords,getDocumentSourceFile,saveChunkEmbeddings,saveLibraryPageOcr,deleteDocument} from './library-db.ts';
import {exportBookArchive,restoreBookArchive,BOOK_ARCHIVE_EXTENSION} from './library-book-archive.ts';

test('C8 portable book restores original, per-page OCR and local 384-dim vectors atomically',async()=>{
 const id=crypto.randomUUID(),name='Synthetic respiratory book.txt';
 const source=new Blob(['Pneumonia therapy page one\fPneumonia monitoring page two'],{type:'text/plain'});
 const initial={id,name,size:source.size,uploaded_at:'2026',storage:'browser' as const,chunksCount:2,pageCount:2,textPages:2,
  vectorized:false,imagesIndexed:true,imagesCount:2,visualPagesProcessed:2};
 await saveDocument(initial,[{content:'Pneumonia therapy',pageId:1},{content:'Pneumonia monitoring',pageId:2}],source);
 await saveLibraryPageOcr(id,2,'Page two OCR: oxygen titration and monitoring.');
 const originalChunks=await getDocumentChunkRecords(id);
 const values=new Int8Array(384);values[0]=100;values[1]=-80;
 await saveChunkEmbeddings(id,new Map(originalChunks.map(row=>[row.id,values])),true);
 const archive=await exportBookArchive(id);
 assert.ok(archive.size>source.size);assert.match(BOOK_ARCHIVE_EXTENSION,/doctor-opus-book/);
 await deleteDocument(id);
 let restoredId:string|undefined;
 try{
  const restored=await restoreBookArchive(archive);
  restoredId=restored.document.id;
  assert.equal(restored.alreadyPresent,false);
  assert.equal(restored.document.storage,'browser');
  assert.equal(restored.document.imagesIndexed,false,'visual index cannot silently claim to be transferred');
  assert.equal(restored.document.vectorized,true);
  assert.equal(restored.document.pageCount,2);
  assert.equal((await getDocumentSourceFile(restoredId))?.size,source.size);
  const chunks=await getDocumentChunkRecords(restoredId);
  assert.equal(chunks.length,3);
  assert.equal(chunks.filter(row=>row.pageId===2).length,2);
  assert.ok(chunks.every(row=>row.embedding instanceof Int8Array&&row.embedding.length===384));
  assert.equal(chunks[0].embedding?.[0],100);
  await saveLibraryPageOcr(restoredId,2,'Updated OCR: treatment changed.');
  const after=await getDocumentChunkRecords(restoredId);
  assert.equal(after.length,3,'OCR replacement must not accumulate old OCR chunks');
  assert.equal(after.filter(row=>row.content.includes('Page two OCR')).length,0);
  assert.equal(after.filter(row=>row.content.includes('Updated OCR')).length,1);
  assert.equal((await getAllDocuments()).find(doc=>doc.id===restoredId)?.vectorized,false);
  const again=await restoreBookArchive(archive);
  assert.equal(again.alreadyPresent,true);
  assert.equal(again.document.id,restoredId);
 }finally{if(restoredId)await deleteDocument(restoredId);await deleteDocument(id);}
});

test('C8 portable archive rejects altered source, altered index, truncated files and unknown format without writes',async()=>{
 const id=crypto.randomUUID(),source=new Blob(['Synthetic atrial fibrillation source.'],{type:'text/plain'});
 await saveDocument({id,name:'Synthetic AF.txt',size:source.size,uploaded_at:'2026',chunksCount:1},[{content:'Atrial fibrillation',pageId:1}],source);
 const archive=await exportBookArchive(id);await deleteDocument(id);
 const orig=new Uint8Array(await archive.arrayBuffer());
 const before=(await getAllDocuments()).length;
 async function reject(bytes:Uint8Array){await assert.rejects(()=>restoreBookArchive(new Blob([bytes])));}
 const header=orig.slice();header[0]^=1;await reject(header);
 const changedIndex=orig.slice();changedIndex[65]^=1;await reject(changedIndex);
 const changedFile=orig.slice();changedFile[changedFile.length-1]^=1;await reject(changedFile);
 await reject(orig.slice(0,-1));
 assert.equal((await getAllDocuments()).length,before,'failed imports must not persist partial records');
});

test('C8 portable archive cannot invent a source when original file is missing',async()=>{
 const id=crypto.randomUUID();
 try{
  await saveDocument({id,name:'Missing source.txt',size:10,uploaded_at:'2026',chunksCount:1},[{content:'Only cached index',pageId:1}]);
  await assert.rejects(()=>exportBookArchive(id),/Оригинал книги отсутствует/);
 }finally{await deleteDocument(id);}
});
