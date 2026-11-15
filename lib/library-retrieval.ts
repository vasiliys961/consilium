import {dequantizedDot} from './embeddings.ts';
import {getAllDocuments,getDocumentChunkRecords,getDocumentSourceFile,searchLibraryLocalWithMeta,type LibrarySearchHit} from './library-db.ts';
import {getBookVisualRegions,visualThumbnails,type VisualBookRegion} from './library-visual-db.ts';
import {embedBookVisualQuery} from './visual-embeddings.ts';
import {renderLibraryPdfPage} from './library-import.ts';
import {libraryHitFile} from './library-selection.ts';
import type {CaseFile} from './conductor.ts';
export interface LibraryEvidence {hits:LibrarySearchHit[];files:CaseFile[];warnings:string[];visualCandidates:number}
export function rankVisualRegions(regions:VisualBookRegion[],query:Float32Array,limit=8){
 return regions.filter(region=>region.hasVisualContent!==false).map(region=>({region,score:dequantizedDot(query,region.embedding)})).filter(hit=>Number.isFinite(hit.score)&&hit.score>=.22).sort((a,b)=>b.score-a.score).slice(0,limit);
}
export function mergeBookPageText(chunks:{content:string;id:string;sourceType?:string}[],max=6500){
 const main=chunks.filter(row=>row.sourceType!=='caption').sort((a,b)=>Number(a.id.match(/_(\d+)$/)?.[1]??0)-Number(b.id.match(/_(\d+)$/)?.[1]??0));
 let text='';for(const row of main){let overlap=0;for(let n=Math.min(500,text.length,row.content.length);n>=30;n--){if(text.endsWith(row.content.slice(0,n))){overlap=n;break;}}text+=(text?'\n':'')+row.content.slice(overlap);}
 const structure=chunks.filter(row=>row.sourceType==='caption').map(row=>row.content).join('\n\n');
 // Reserve room for captions and footnotes instead of truncating them behind prose.
 return [text.slice(0,Math.max(0,max-Math.min(structure.length,2500))),structure.slice(0,2500)].filter(Boolean).join('\n\n');
}
export async function retrieveLibraryEvidence(query:string,options:{context?:string;documentId?:string;limit?:number;signal?:AbortSignal;images?:boolean;visualQuery?:(query:string)=>Promise<Float32Array|null>}={}):Promise<LibraryEvidence>{
 const signal=options.signal,limit=Math.min(6,Math.max(1,options.limit??5));signal?.throwIfAborted();
 const search=[query,options.context].filter(Boolean).join('\n').slice(0,5000);
 const [textHits,regions,docs]=await Promise.all([searchLibraryLocalWithMeta(search,18,options.documentId),getBookVisualRegions(options.documentId),getAllDocuments()]);
 signal?.throwIfAborted();const warnings:string[]=[];
 let visual:ReturnType<typeof rankVisualRegions>=[];
 if(regions.length){try{const vector=await (options.visualQuery??embedBookVisualQuery)([query,...textHits.slice(0,2).map(hit=>hit.content.slice(0,450))].join('\n'));if(vector)visual=rankVisualRegions(regions,vector,12);}catch{warnings.push('Визуальный поиск недоступен; использован текстовый индекс.');}}
 const documents=new Map(docs.map(doc=>[doc.id,doc]));
 const candidates=new Map<string,{hit:LibrarySearchHit;rank:number;visual:boolean}>();
 textHits.forEach((hit,index)=>{const key=`${hit.documentId}:${hit.pageId}`;if(!candidates.has(key))candidates.set(key,{hit,rank:1/(index+1),visual:false});});
 for(const [index,item] of visual.entries()){
  const row=item.region,key=`${row.documentId}:${row.pageId}`,previous=candidates.get(key),doc=documents.get(row.documentId);
  if(!doc)continue;
  if(previous){previous.rank+=.35/(index+1);previous.visual=true;}
  else candidates.set(key,{hit:{documentId:row.documentId,documentName:doc.name,pageId:row.pageId,chunkId:row.id,content:row.caption||'Visual reference page; inspect the original before using it.',mode:'hybrid',score:item.score},rank:.35/(index+1),visual:true});
 }
 const ranked=[...candidates.values()].sort((a,b)=>b.rank-a.rank).slice(0,limit);
 const byBook=new Map<string,Awaited<ReturnType<typeof getDocumentChunkRecords>>>();
 const hits:LibrarySearchHit[]=[],files:CaseFile[]=[];
 const thumbnails=await visualThumbnails(ranked.flatMap(item=>visual.filter(v=>v.region.documentId===item.hit.documentId&&v.region.pageId===item.hit.pageId).slice(0,1).map(v=>v.region.id)));
 for(const candidate of ranked){
  signal?.throwIfAborted();const {hit}=candidate;if(!hit.documentId||!hit.pageId)continue;
  let records=byBook.get(hit.documentId);if(!records){records=await getDocumentChunkRecords(hit.documentId);byBook.set(hit.documentId,records);}
  const pageRecords=records.filter(row=>row.pageId===hit.pageId);
  const text=mergeBookPageText(pageRecords)||hit.content;
  const visualRegion=visual.find(v=>v.region.documentId===hit.documentId&&v.region.pageId===hit.pageId)?.region;
  const result:LibrarySearchHit={...hit,content:text,chunkId:`${hit.documentId}_evidence_page_${hit.pageId}`,thumbnail:visualRegion?thumbnails.get(visualRegion.id):undefined};
  // Retrieve figures, table headers and footnotes together as an original page.
  if(options.images!==false&&(candidate.visual||pageRecords.some(row=>row.sourceType==='caption'))&&/\.pdf$/i.test(hit.documentName??'')){
   try{const original=await getDocumentSourceFile(hit.documentId);if(original)result.image=(await renderLibraryPdfPage(original,hit.pageId)).image;else warnings.push(`Оригинал книги недоступен: ${hit.documentName}`);}catch{warnings.push(`Не удалось открыть страницу ${hit.pageId}: ${hit.documentName}`);}
  }
  hits.push(result);files.push(libraryHitFile(result));
 }
 if(docs.some(doc=>(!options.documentId||doc.id===options.documentId)&&doc.ocrMissingPages?.length))warnings.push('Некоторые страницы не распознаны OCR: доступны изображения, текстовый поиск по ним неполон.');
 if(docs.some(doc=>(!options.documentId||doc.id===options.documentId)&&/\.pdf$/i.test(doc.name)&&!doc.imagesIndexed))warnings.push('Индекс изображений некоторых книг не завершён. Доступен поиск по уже обработанным материалам.');
 return {hits,files,warnings:[...new Set(warnings)],visualCandidates:visual.length};
}
