import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {saveDocument,deleteDocument,getAllDocuments,getDocumentChunkRecords} from './library-db.ts';
import {getBookVisualRegions,saveBookVisualPage,visualThumbnails} from './library-visual-db.ts';
import {VISUAL_INDEX_VERSION} from './visual-embeddings.ts';
import {extractBookLayout,embeddedImageRegions,pageVisualRegions} from './library-layout.ts';
import {saveBookLayout} from './library-structure.ts';
import {retrieveLibraryEvidence,mergeBookPageText} from './library-retrieval.ts';
import {readLibraryAnswer} from './library-answer.ts';

test('automatic retrieval selects clinical page without manual page knowledge and keeps its table footnote',async()=>{
 const id=crypto.randomUUID();await saveDocument({id,name:'Synthetic infectious handbook.pdf',size:10,uploaded_at:'2026',chunksCount:2},[{content:'Pneumonia antimicrobial treatment. See Table 4.',pageId:17},{content:'Diabetes and insulin unrelated chapter.',pageId:20}]);
 const layout=extractBookLayout([{str:'Table 4. Pneumonia',transform:[12,0,0,12,30,700],height:14},{str:'Treatment option A',transform:[12,0,0,12,30,650],height:12},{str:'* Adjust for renal impairment.',transform:[8,0,0,8,30,50],height:8}],600,800);
 await saveBookLayout(id,17,layout);
 const result=await retrieveLibraryEvidence('Лечение пневмонии при нарушении функции почек',{documentId:id,images:false});
 assert.equal(result.files[0].librarySource?.page,17);assert.equal(result.files[0].librarySource?.title,'Synthetic infectious handbook.pdf');assert.match(result.files[0].text!,/renal impairment/);
 assert.ok(result.files.every(file=>file.librarySource?.page!==20));
 assert.equal((await getDocumentChunkRecords(id)).filter(row=>row.sourceType==='caption').length,2);
 await deleteDocument(id);
});
test('visual index resumes by page, never marks partial coverage complete, and can retrieve an uncaptioned image',async()=>{
 const id=crypto.randomUUID();await saveDocument({id,name:'Synthetic atlas.pdf',size:10,uploaded_at:'2026',chunksCount:0},[]);
 const region={id:id+'_visual_1_page',documentId:id,pageId:1,regionId:'page',bounds:[0,0,1,1] as [number,number,number,number],embedding:new Int8Array([127,0]),caption:'',version:VISUAL_INDEX_VERSION};
 await saveBookVisualPage(id,[region],new Map([[region.id,'data:image/jpeg;base64,thumb']]),2,true);
 assert.equal((await getAllDocuments()).find(doc=>doc.id===id)?.imagesIndexed,false);
 await saveBookVisualPage(id,[{...region,id:id+'_visual_2_page',pageId:2,embedding:new Int8Array([0,127])}],new Map(),2,true);
 assert.equal((await getAllDocuments()).find(doc=>doc.id===id)?.imagesIndexed,true);
 assert.equal((await getBookVisualRegions(id)).length,2);
 const result=await retrieveLibraryEvidence('a diagram without a caption',{documentId:id,images:false,visualQuery:async()=>new Float32Array([1,0])});
 assert.equal(result.files[0].librarySource?.page,1);assert.equal(result.visualCandidates,1);
 assert.equal((await visualThumbnails([region.id])).get(region.id),'data:image/jpeg;base64,thumb');
 await deleteDocument(id);assert.equal((await getBookVisualRegions(id)).length,0);
});
test('PDF raster placement and overlapping regions cover full page and figure boundaries',()=>{
 const ops={save:1,restore:2,transform:3,paintImageXObject:4,paintInlineImageXObject:5,paintFormXObjectBegin:6,paintFormXObjectEnd:7};
 const regions=embeddedImageRegions({fnArray:[1,3,4,2],argsArray:[[],[200,0,0,100,50,600],['image'],[]]},ops,{width:600,height:800,transform:[1,0,0,-1,0,800]});
 [50/600,100/800,200/600,100/800].forEach((value,index)=>assert.ok(Math.abs(regions[0].bounds[index]-value)<1e-12));
 assert.equal(pageVisualRegions()[0].id,'page');assert.equal(pageVisualRegions().length,5);
});
test('book answers reject invented citations and answered text without evidence',()=>{
 assert.equal(readLibraryAnswer(JSON.stringify({answer:'Recommendation [99]',usedSources:[99],status:'answered'}),2),null);
 assert.equal(readLibraryAnswer(JSON.stringify({answer:'Unsupported recommendation',usedSources:[],status:'answered'}),2),null);
 assert.equal(readLibraryAnswer(JSON.stringify({answer:'Not present in the supplied pages.',usedSources:[],status:'insufficient'}),2)?.status,'insufficient');
 assert.equal(readLibraryAnswer(JSON.stringify({answer:'Source says this [2].',usedSources:[2],status:'answered'}),2)?.used[0],2);
 const page=mergeBookPageText([{id:'1',content:'Long prose '.repeat(900)},{id:'2',sourceType:'caption',content:'Table footnote: exception for renal failure.'}]);assert.match(page,/renal failure/);
});
