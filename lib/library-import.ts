import {extractBookLayout,pageVisualRegions,embeddedImageRegions,type PdfTextItem} from './library-layout.ts';
import {saveDocument,getAllDocuments,getDocumentChunkRecords,saveChunkEmbeddings,type LibraryChunkInput,type LibraryDocument,type LibraryFileHandle} from './library-db.ts';
import {embedTexts,quantizeInt8} from './embeddings.ts';

export function chunkLibraryPages(pages:readonly string[]):LibraryChunkInput[]{
 return pages.flatMap((page,index)=>{const chunks:LibraryChunkInput[]=[];const content=page.replace(/[ \t]+/g,' ').trim();for(let offset=0;offset<content.length;offset+=1000){const fragment=content.slice(offset,offset+1300).trim();if(fragment)chunks.push({content:fragment,pageId:index+1,sourceType:'text'});}return chunks;});
}
interface PdfPage {getOperatorList?:()=>Promise<{fnArray:number[];argsArray:unknown[][]}>;getTextContent:()=>Promise<{items:PdfTextItem[]}>;getViewport:(options:{scale:number})=>{width:number;height:number;transform?:number[]};render:(options:{canvasContext:CanvasRenderingContext2D;viewport:{width:number;height:number}})=>{promise:Promise<void>}}
interface PdfDocument {numPages:number;getPage:(page:number)=>Promise<PdfPage>;destroy:()=>Promise<void>}
interface PdfJs {OPS:Record<string,number>;GlobalWorkerOptions:{workerSrc:string};getDocument:(options:{data:Uint8Array;isEvalSupported:boolean})=>{promise:Promise<PdfDocument>}}
let pdfPromise:Promise<PdfJs>|undefined;
function pdfJs():Promise<PdfJs>{
 if(!pdfPromise)pdfPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/pdfjs/pdf.min.js';script.onload=()=>{const pdf=(window as Window&{pdfjsLib?:PdfJs}).pdfjsLib;if(!pdf){reject(Error('Не удалось открыть PDF.'));return;}pdf.GlobalWorkerOptions.workerSrc='/pdfjs/pdf.worker.min.js';resolve(pdf);};script.onerror=()=>reject(Error('Не удалось загрузить просмотрщик PDF.'));document.head.append(script);}).catch(error=>{pdfPromise=undefined;throw error;}) as Promise<PdfJs>;
 return pdfPromise;
}
/** Deduplicate only when the full original bytes match. Avoid hashing giant files in a low-RAM browser. */
export const LIBRARY_HASH_LIMIT=64*1024*1024;
export type LibraryImportResult={document:LibraryDocument;alreadyPresent:boolean;fingerprintChecked:boolean};
export async function importLibraryFile(file:File,onProgress:(message:string)=>void,handle?:LibraryFileHandle):Promise<LibraryImportResult>{
 if(file.size>250*1024*1024)throw Error('До 250 МБ на книгу. Разделите более крупный файл на тома.');
 // The PDF bytes are reused for parsing; this does not add an extra full-sized download.
 const bytes=file.size<=LIBRARY_HASH_LIMIT?await file.arrayBuffer():undefined;
 const fingerprint=bytes&&crypto.subtle?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(byte=>byte.toString(16).padStart(2,'0')).join(''):undefined;
 if(fingerprint){
  const previous=(await getAllDocuments()).find(doc=>doc.fileSha256===fingerprint);
  if(previous)return {document:previous,alreadyPresent:true,fingerprintChecked:true};
 }
 let pages:string[];
 if(/\\.pdf$/i.test(file.name)){
  const pdf=await (await pdfJs()).getDocument({data:new Uint8Array(bytes??await file.arrayBuffer()),isEvalSupported:false}).promise;
  try{pages=[];for(let page=1;page<=pdf.numPages;page++){onProgress(`${file.name}: страница ${page} из ${pdf.numPages}`);const source=await pdf.getPage(page),text=await source.getTextContent(),viewport=source.getViewport({scale:1});pages.push(extractBookLayout(text.items,viewport.width,viewport.height).text);if(page%10===0)await new Promise(resolve=>setTimeout(resolve,0));}}finally{await pdf.destroy();}
 }else if(/\\.(txt|md)$/i.test(file.name)){pages=(bytes?new TextDecoder().decode(bytes):await file.text()).split('\\f');}
 else throw Error('Для библиотеки выберите PDF с текстовым слоем, TXT или Markdown.');
 const chunks=chunkLibraryPages(pages);
 if(!pages.length)throw Error('В книге нет страниц.');
 const doc:LibraryDocument={id:crypto.randomUUID(),name:file.name,size:file.size,uploaded_at:new Date().toISOString(),chunksCount:chunks.length,pageCount:pages.length,textPages:pages.filter(page=>page.replace(/\\s/g,'').length>=80).length,vectorized:false,storage:handle?'folder':'browser',...(fingerprint?{fileSha256:fingerprint}:{}),...(handle?{sourceModifiedAt:file.lastModified}:{})};
 await saveDocument(doc,chunks,handle?undefined:file,handle);
 return {document:doc,alreadyPresent:false,fingerprintChecked:Boolean(fingerprint)};
}

export async function vectorizeLibraryDocument(id:string,onProgress:(message:string)=>void,signal:AbortSignal):Promise<void>{
 const chunks=await getDocumentChunkRecords(id);if(!chunks.length)throw Error('Текстовый индекс пуст: откройте страницы и выполните OCR.');const pending=chunks.filter(chunk=>!chunk.embedding?.length);
 for(let i=0;i<pending.length;i+=8){if(signal.aborted)throw Error('Индексация приостановлена. Её можно продолжить.');onProgress(`Смысловой индекс: ${Math.min(i+8,pending.length)} из ${pending.length}`);const batch=pending.slice(i,i+8);const vectors=await embedTexts(batch.map(chunk=>chunk.content));await saveChunkEmbeddings(id,new Map(batch.map((chunk,index)=>[chunk.id,quantizeInt8(vectors[index])])),false);await new Promise(resolve=>setTimeout(resolve,0));}
 await saveChunkEmbeddings(id,new Map(),true);
}

/** Render one original page, including figures and table layout, locally. */
export async function renderLibraryPdfPage(file:Blob,page:number):Promise<{image:string;pageCount:number}>{
 const pdf=await (await pdfJs()).getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
 try{
  if(!Number.isInteger(page)||page<1||page>pdf.numPages)throw Error(`В книге ${pdf.numPages} страниц PDF.`);
  const source=await pdf.getPage(page);const base=source.getViewport({scale:1});
  const viewport=source.getViewport({scale:Math.min(2,2000/Math.max(base.width,base.height))});
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  const context=canvas.getContext('2d');if(!context)throw Error('Не удалось показать страницу.');
  await source.render({canvasContext:context,viewport}).promise;
  return {image:canvas.toDataURL('image/jpeg',.9),pageCount:pdf.numPages};
 }finally{await pdf.destroy();}
}

/** Resumable, local OCR of pages without a usable text layer. No LLM calls. */
export async function ocrLibraryDocument(id:string,onProgress:(message:string)=>void,signal:AbortSignal){
 const {getDocumentSourceFile,saveLibraryPageOcr}=await import('./library-db.ts');
 const file=await getDocumentSourceFile(id);if(!file)throw Error('Оригинал книги недоступен.');
 const records=await getDocumentChunkRecords(id);
 const completed=new Set(records.filter(row=>row.id.startsWith(`${id}_ocr_`)).map(row=>row.pageId));
 const pdf=await (await pdfJs()).getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
 try{
  for(let number=1;number<=pdf.numPages;number++){
   if(signal.aborted)throw Error('OCR приостановлен. Уже распознанные страницы сохранены.');
   if(completed.has(number))continue;
   const page=await pdf.getPage(number);
   const text=await page.getTextContent();
   if(text.items.map(item=>item.str??'').join('').replace(/\s/g,'').length>=80)continue;
   onProgress(`Локальный OCR: страница ${number} из ${pdf.numPages}`);
   const base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(2,2000/Math.max(base.width,base.height))});
   const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   const context=canvas.getContext('2d');if(!context)throw Error('Не удалось показать страницу.');
   await page.render({canvasContext:context,viewport}).promise;
   const response=await fetch('/api/library/ocr',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({image:canvas.toDataURL('image/jpeg',.9)}),signal});
   if(!response.ok)throw Error('Локальный OCR недоступен. Страницы доступны для просмотра и отправки как изображения.');
   const result=await response.json();
   if(result.text?.trim())await saveLibraryPageOcr(id,number,result.text);
   canvas.width=0;canvas.height=0;
   await new Promise(resolve=>setTimeout(resolve,0));
  }
 }finally{await pdf.destroy();}
}

/** Full-page visual index: resumable, bounded memory, no paid model calls. */
export async function indexLibraryVisuals(id:string,onProgress:(message:string)=>void,signal:AbortSignal){
 const {getDocumentSourceFile,saveLibraryPageOcr}=await import('./library-db.ts');
 const {embedBookImage,VISUAL_INDEX_VERSION}=await import('./visual-embeddings.ts');
 const {getBookVisualRegions,saveBookVisualPage}=await import('./library-visual-db.ts');
 const {saveBookLayout}=await import('./library-structure.ts');
 const file=await getDocumentSourceFile(id);if(!file)throw Error('Оригинал книги недоступен.');
 const completed=new Set((await getBookVisualRegions(id)).filter(row=>row.regionId==='page').map(row=>row.pageId));
 const pdf=await (await pdfJs()).getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
 try{
  for(let number=1;number<=pdf.numPages;number++){
   signal.throwIfAborted();if(completed.has(number))continue;
   onProgress(`Индекс текста и изображений: ${number} / ${pdf.numPages}`);
   const page=await pdf.getPage(number),base=page.getViewport({scale:1});
   const layout=extractBookLayout((await page.getTextContent()).items,base.width,base.height);
   const viewport=page.getViewport({scale:Math.min(2,1800/Math.max(base.width,base.height))});
   const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   const context=canvas.getContext('2d');if(!context)throw Error('Canvas unavailable');
   await page.render({canvasContext:context,viewport}).promise;
   let ocrMissing=false;
   if(layout.text.replace(/\s/g,'').length<80){
    const response=await fetch('/api/library/ocr',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({image:canvas.toDataURL('image/jpeg',.9)}),signal});
    if(response.ok){const result=await response.json();if(result.text?.trim()){layout.text=result.text;await saveLibraryPageOcr(id,number,result.text);}}else ocrMissing=true;
   }
   await saveBookLayout(id,number,layout);
   const regions=[],thumbs=new Map<string,string>();
   const operators=page.getOperatorList?await page.getOperatorList():null,ops=(await pdfJs()).OPS;
   const extra=operators&&base.transform?embeddedImageRegions(operators,ops,{...base,transform:base.transform}):[];
   const drawingOps=['stroke','fill','eoFill','fillStroke','eoFillStroke','shadingFill'].map(name=>ops[name]);
   const hasVisualContent=extra.length>0||layout.objects.some(obj=>obj.kind==='figure'||obj.kind==='table')||Boolean(operators?.fnArray.some(fn=>drawingOps.includes(fn)));
   for(const region of [...pageVisualRegions(),...extra]){
    signal.throwIfAborted();
    const crop=document.createElement('canvas');const [x,y,w,h]=region.bounds;
    crop.width=Math.ceil(canvas.width*w);crop.height=Math.ceil(canvas.height*h);
    crop.getContext('2d')!.drawImage(canvas,canvas.width*x,canvas.height*y,canvas.width*w,canvas.height*h,0,0,crop.width,crop.height);
    const image=crop.toDataURL('image/jpeg',.82),embedding=quantizeInt8(await embedBookImage(image));
    const key=`${id}_visual_${number}_${region.id}`;
    regions.push({id:key,documentId:id,pageId:number,regionId:region.id,bounds:region.bounds,embedding,version:VISUAL_INDEX_VERSION,ocrMissing,hasVisualContent,caption:[layout.heading,...layout.objects.filter(obj=>obj.kind!=='footnote').map(obj=>obj.label)].filter(Boolean).join(' | ').slice(0,2000)});
    const thumb=document.createElement('canvas');thumb.width=320;thumb.height=Math.round(320*crop.height/crop.width);thumb.getContext('2d')!.drawImage(crop,0,0,thumb.width,thumb.height);thumbs.set(key,thumb.toDataURL('image/jpeg',.7));
    crop.width=0;crop.height=0;
   }
   await saveBookVisualPage(id,regions,thumbs,pdf.numPages);canvas.width=0;canvas.height=0;
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  await saveBookVisualPage(id,[],new Map(),pdf.numPages,true);
 }finally{await pdf.destroy();}
}
