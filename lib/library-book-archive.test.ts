import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {saveDocument,getAllDocuments,getDocumentChunkRecords,getDocumentSourceFile,saveChunkEmbeddings,saveLibraryPageOcr,searchLibraryLocalWithMeta,deleteDocument} from './library-db.ts';
import {exportBookArchive,restoreBookArchive,BOOK_ARCHIVE_EXTENSION} from './library-book-archive.ts';
import {importLibraryFile} from './library-import.ts';
import {createHash} from 'node:crypto';

test('large book archive crosses the old 64 MiB limit, restores source and searchable page, and deduplicates reimport',async()=>{
 const id=crypto.randomUUID(),part=new Uint8Array(1024*1024);part.fill(32);
 const source=new Blob([...Array.from({length:65},()=>part),'Synthetic large-book end.'],{type:'application/pdf'});
 const expected=createHash('sha256');for(let i=0;i<65;i++)expected.update(part);expected.update('Synthetic large-book end.');
 let restoredId='';
 try{
  await saveDocument({id,name:'SYNTHETIC large handbook.pdf',size:source.size,uploaded_at:'2026',chunksCount:1,pageCount:810,textPages:1},[{content:'Synthetic rareword nephrology dose verification',pageId:809}],source);
  const archive=await exportBookArchive(id);await deleteDocument(id);
  const restored=await restoreBookArchive(archive);restoredId=restored.document.id;
  assert.equal(restored.document.size,source.size);assert.equal(restored.document.fileSha256,expected.digest('hex'));
  assert.equal((await getDocumentSourceFile(restoredId))?.size,source.size);
  const hits=await searchLibraryLocalWithMeta('rareword nephrology',5,restoredId);assert.equal(hits[0].pageId,809);
  const duplicate=await importLibraryFile(new File([source],'Renamed same handbook.pdf'),()=>{});
  assert.equal(duplicate.alreadyPresent,true);assert.equal(duplicate.document.id,restoredId);
  // A tail change beyond the old cutoff must be detected before any database write.
  await deleteDocument(restoredId);restoredId='';
  const before=(await getAllDocuments()).length;
  await assert.rejects(()=>restoreBookArchive(new Blob([archive.slice(0,-1),'!'])),/Контрольная сумма/);
  assert.equal((await getAllDocuments()).length,before);
 }finally{await deleteDocument(id);if(restoredId)await deleteDocument(restoredId);}
});

test('cancelling archive restore never writes a partial book; cancelling export does not change the original',async()=>{
 const id=crypto.randomUUID(),source=new Blob([new Uint8Array(3*1024*1024)],{type:'text/plain'});
 try{
  await saveDocument({id,name:'SYNTHETIC cancellation.txt',size:source.size,uploaded_at:'2026',chunksCount:1},[{content:'Original search text',pageId:1}],source);
  const exporting=new AbortController();
  await assert.rejects(()=>exportBookArchive(id,{signal:exporting.signal,onProgress:()=>exporting.abort()}),{name:'AbortError'});
  assert.equal((await getDocumentChunkRecords(id))[0].content,'Original search text');
  const archive=await exportBookArchive(id);await deleteDocument(id);
  const before=(await getAllDocuments()).length,restoring=new AbortController();
  await assert.rejects(()=>restoreBookArchive(archive,{signal:restoring.signal,onProgress:()=>restoring.abort()}),{name:'AbortError'});
  assert.equal((await getAllDocuments()).length,before);
 }finally{await deleteDocument(id);}
});

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
 async function reject(bytes:Uint8Array){const copy=new ArrayBuffer(bytes.byteLength);new Uint8Array(copy).set(bytes);await assert.rejects(()=>restoreBookArchive(new Blob([copy])));}
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

test('C8 archives do not turn an arbitrary HTML original into a trusted browser document',async()=>{
 const id=crypto.randomUUID(),file=new Blob(['<script>unsafe()</script>'],{type:'text/html'});
 await saveDocument({id,name:'untrusted.html',size:file.size,uploaded_at:'2026',chunksCount:1},[{content:'Untrusted HTML',pageId:1}],file);
 const archive=await exportBookArchive(id);
 await deleteDocument(id);
 const count=(await getAllDocuments()).length;
 await assert.rejects(()=>restoreBookArchive(archive),/неподдерживаемый формат/);
 assert.equal((await getAllDocuments()).length,count);
});

test('C8 physician question retrieves the right restored page, with no extra document or duplicated OCR',async()=>{
 const id=crypto.randomUUID();
 const raw=new Blob(['Pleural effusion drainage overview\fWarfarin anticoagulation bleeding interaction recommendations'],{type:'text/plain'});
 await saveDocument({id,name:'Synthetic respiratory handbook.txt',size:raw.size,uploaded_at:'2026',chunksCount:2,pageCount:2,textPages:2},[
   {content:'Pleural effusion drainage overview',pageId:1},
   {content:'Warfarin anticoagulation bleeding interaction recommendations',pageId:2}
 ],raw);
 await saveLibraryPageOcr(id,2,'Warfarin anticoagulation bleeding risks — original page verification required.');
 const archive=await exportBookArchive(id);
 await deleteDocument(id);
 let restoredId='';
 try{
  const first=await restoreBookArchive(archive);restoredId=first.document.id;
  const hits=await searchLibraryLocalWithMeta('warfarin anticoagulation bleeding',5,restoredId);
  assert.ok(hits.length);
  assert.equal(hits[0].documentId,restoredId);
  assert.equal(hits[0].pageId,2,'retrieval must preserve actual source page');
  assert.equal(hits.filter(hit=>hit.pageId===1).length,0,'unrelated page must not be cited');
  assert.equal((await getDocumentChunkRecords(restoredId)).filter(chunk=>chunk.pageId===2).length,2);
  const again=await restoreBookArchive(archive);
  assert.equal(again.alreadyPresent,true);
  assert.equal(again.document.id,restoredId,'reimport must not create a duplicate');
 }finally{if(restoredId)await deleteDocument(restoredId);await deleteDocument(id);}
});
