import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {saveDocument,getAllDocuments,getDocumentChunkRecords,getDocumentSourceFile,saveChunkEmbeddings,searchLibraryLocalWithMeta,deleteDocument} from './library-db.ts';
import {chunkLibraryPages} from './library-import.ts';
import {libraryHitFile} from './library-selection.ts';
import {retrievePassages,passageCitations} from './local-rag.ts';
import {preparePrivacy} from './privacy-prepare.ts';
import {transferFile} from './privacy-types.ts';
import {validCaseInput} from './input-validation.ts';

test('library import, index continuation, search, selected page, privacy and citation retain provenance',async()=>{
 const id=crypto.randomUUID();const name='Synthetic respiratory handbook.pdf';const chunks=chunkLibraryPages(['Pleural effusion evaluation and thoracentesis.','Unrelated diabetes chapter.']);
 await saveDocument({id,name,size:10,uploaded_at:'2026-11-12',chunksCount:chunks.length},chunks,new Blob(['original'],{type:'application/pdf'}));
 assert.equal((await getDocumentSourceFile(id))?.size,8);
 const records=await getDocumentChunkRecords(id);assert.equal(records[0].pageId,1);
 await saveChunkEmbeddings(id,new Map([[records[0].id,new Int8Array([127,0])]]),false);
 assert.equal((await getAllDocuments()).find(doc=>doc.id===id)?.vectorized,false);
 await saveChunkEmbeddings(id,new Map(),true);assert.equal((await getAllDocuments()).find(doc=>doc.id===id)?.vectorized,true);
 const hits=await searchLibraryLocalWithMeta('pleural effusion',5);assert.equal(hits[0].documentName,name);assert.equal(hits[0].pageId,1);assert.equal(hits[0].mode,'keyword');
 const file=libraryHitFile(hits[0]);assert.equal(validCaseInput({referenceFiles:[file]}),true);
 const prepared=await preparePrivacy({referenceFiles:[file],text:'Question'});const transferred=transferFile(prepared.body.referenceFiles![0]);assert.equal(transferred.librarySource?.title,name);
 const finalized=await preparePrivacy({...prepared.body,referenceFiles:[transferred]},{finalize:true});
 // Explicit physician selection survives even if the question contains no matching terms.
 const passages=retrievePassages('zzznomatchingterm',finalized.body.referenceFiles!);assert.equal(passages.length,1);assert.equal(passages[0].locator,'страница PDF 1');assert.equal(passages[0].text,file.text);
 const citations=passageCitations(passages,'2026-11-12');assert.equal(citations[0].title,name);assert.match(citations[0].passageId!,new RegExp(id));assert.equal(citations[0].excerpt,file.text);
 assert.deepEqual(await searchLibraryLocalWithMeta('zzznomatchingterm'),[]);
 assert.equal((await searchLibraryLocalWithMeta('Жидкость вокруг лёгкого — какие обследования?'))[0].pageId,1);
 await deleteDocument(id);assert.equal(await getDocumentSourceFile(id),null);assert.equal((await getDocumentChunkRecords(id)).length,0);
});
test('library page boundaries and overlaps stay explicit; invalid page metadata is rejected',()=>{
 const chunks=chunkLibraryPages(['a'.repeat(1600),'second page']);assert.equal(chunks[0].pageId,1);assert.equal(chunks[1].pageId,1);assert.equal(chunks[2].pageId,2);assert.equal(chunks[0].content.length,1300);
 assert.equal(validCaseInput({referenceFiles:[{name:'book.txt',librarySource:{title:'Book',documentId:'x',chunkId:'y',page:-1}}]}),false);
 assert.equal(validCaseInput({referenceFiles:[{name:'book.txt',librarySource:{title:8,page:1}}]}),false);
 assert.throws(()=>libraryHitFile({content:'no anchor'}));
});

test('Russian inflections find English pneumonia passages and selected book scope is respected',async()=>{
 const id=crypto.randomUUID(),other=crypto.randomUUID();
 for(const [key,text] of [[id,'Community acquired pneumonia. Antimicrobial treatment recommendations.'],[other,'Pneumonia differential diagnosis.']])await saveDocument({id:key,name:key+'.pdf',size:10,uploaded_at:'2026',chunksCount:1},chunkLibraryPages([text]));
 const hits=await searchLibraryLocalWithMeta('Какая тактика при пневмонии и выбор антибиотиков?',6,id);
 assert.ok(hits.length);assert.equal(hits[0].documentId,id);assert.equal(hits[0].pageId,1);
 assert.deepEqual(await searchLibraryLocalWithMeta(id+'.pdf',6,id),[],'a book title must not masquerade as a relevant passage');
 await deleteDocument(id);await deleteDocument(other);
});

test('resumable page OCR replaces only that page OCR and invalidates stale semantic completion',async()=>{
 const {saveLibraryPageOcr}=await import('./library-db.ts');
 const id=crypto.randomUUID();await saveDocument({id,name:'Synthetic scanned book.pdf',size:10,uploaded_at:'2026',chunksCount:1,vectorized:true},chunkLibraryPages(['Existing original text.']));
 await saveLibraryPageOcr(id,8,'Pneumonia antimicrobial guidance.');
 await saveLibraryPageOcr(id,8,'Pneumonia updated OCR, verify against original.');
 const rows=await getDocumentChunkRecords(id);assert.equal(rows.length,2);assert.equal(rows.filter(row=>row.pageId===8).length,1);
 assert.equal((await getAllDocuments()).find(doc=>doc.id===id)?.vectorized,false);
 const hits=await searchLibraryLocalWithMeta('пневмонии',6,id);assert.equal(hits[0].pageId,8);
 const visual=libraryHitFile({...hits[0],image:'data:image/jpeg;base64,TEST'});assert.equal(visual.image,'data:image/jpeg;base64,TEST');assert.equal(visual.librarySource?.page,8);
 await deleteDocument(id);
});
