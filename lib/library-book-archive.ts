import {hashBlobSha256,LIBRARY_SOURCE_LIMIT,checkBookOperation,type BlobHashOptions} from './blob-sha256.ts';
import {checkLibraryFolderSource,getAllDocuments,getDocumentChunkRecords,getDocumentSourceFile,saveDocument,type LibraryChunkInput,type LibraryDocument} from './library-db.ts';
import {EMBEDDING_DIM} from './embeddings.ts';

/** Portable *single-book* archive. Local only; the visual atlas can be regenerated. */
const MAGIC='DOPUS-LIBRARY-BOOK-V1\n';
const MAGIC_BYTES=new TextEncoder().encode(MAGIC);
const META_LIMIT=32*1024*1024;
const SOURCE_LIMIT=LIBRARY_SOURCE_LIMIT;
const MAX_CHUNKS=25000;
const HEADER_BYTES=MAGIC_BYTES.length+4+32;
const EMBEDDING_MODEL='Xenova/multilingual-e5-small';
export const BOOK_ARCHIVE_EXTENSION='.doctor-opus-book';
export const BOOK_ARCHIVE_SOURCE_LIMIT=SOURCE_LIMIT;
type PackedEmbedding={kind:'i8'|'f32';values:number[]};
type PackedChunk={content:string;pageId?:number;sourceType?:'text'|'caption';tags?:string[];ocrPage?:number;embedding?:PackedEmbedding};
type BookMeta={
 version:1;
 model:string;
 original:{name:string;mimeType:string;bytes:number;sha256:string};
 document:{pageCount?:number;textPages?:number;vectorized:boolean;ocrMissingPages?:number[]};
 chunks:PackedChunk[];
};
function isRecord(x:unknown):x is Record<string,unknown>{return x!==null&&typeof x==='object'&&!Array.isArray(x);}
function countPage(x:unknown):x is number{return typeof x==='number'&&Number.isSafeInteger(x)&&x>=1&&x<=1000000;}
function packEmbedding(vector:Int8Array|Float32Array|undefined):PackedEmbedding|undefined{
 if(!vector||vector.length!==EMBEDDING_DIM)return undefined;
 const values=Array.from(vector);
 if(values.some(value=>!Number.isFinite(value)))return undefined;
 return {kind:vector instanceof Int8Array?'i8':'f32',values};
}
function unpackEmbedding(raw:unknown):Int8Array|Float32Array|undefined{
 if(raw===undefined)return undefined;
 if(!isRecord(raw)||(raw.kind!=='i8'&&raw.kind!=='f32')||!Array.isArray(raw.values)||raw.values.length!==EMBEDDING_DIM)throw Error('В архиве некорректный индекс эмбеддингов.');
 const values=raw.values;
 if(values.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('В архиве есть некорректные значения индекса.');
 if(raw.kind==='i8'){
  if(values.some(v=>!Number.isInteger(v)||v<-128||v>127))throw Error('Повреждённый квантованный индекс.');
  return Int8Array.from(values);
 }
 if(values.some(v=>Math.abs(v)>2))throw Error('Повреждённый индекс.');
 return Float32Array.from(values);
}
function validPageList(raw:unknown):number[]|undefined{
 if(raw===undefined)return undefined;
 if(!Array.isArray(raw)||raw.length>100000||raw.some(item=>!countPage(item)))throw Error('Некорректная нумерация страниц в архиве.');
 return raw as number[];
}
function parseMeta(data:unknown):{meta:BookMeta;chunks:LibraryChunkInput[]}{
 if(!isRecord(data)||data.version!==1||data.model!==EMBEDDING_MODEL||!isRecord(data.original)||!isRecord(data.document)||!Array.isArray(data.chunks)||data.chunks.length>MAX_CHUNKS)throw Error('Неподдерживаемый или повреждённый архив книги.');
 const src=data.original,doc=data.document;
 if(typeof src.name!=='string'||!src.name.trim()||src.name.length>300||Array.from(src.name).some(char=>char==='/'||char==='\\'||char.charCodeAt(0)<32)
 ||typeof src.mimeType!=='string'||src.mimeType.length>120
 ||typeof src.bytes!=='number'||!Number.isSafeInteger(src.bytes)||src.bytes<0||src.bytes>SOURCE_LIMIT
 ||typeof src.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(src.sha256))throw Error('Некорректные данные исходной книги.');
 if(!/\.(pdf|txt|md)$/i.test(src.name))throw Error('Архив содержит неподдерживаемый формат исходного файла.');
 if(doc.vectorized!==true&&doc.vectorized!==false)throw Error('Некорректный статус текстового индекса.');
 if(doc.pageCount!==undefined&&!countPage(doc.pageCount)||doc.textPages!==undefined&&(!Number.isSafeInteger(doc.textPages)||Number(doc.textPages)<0||Number(doc.textPages)>Number(doc.pageCount??1000000)))throw Error('Некорректное число страниц.');
 const chunks:LibraryChunkInput[]=data.chunks.map((raw:unknown)=>{
  if(!isRecord(raw)||typeof raw.content!=='string'||raw.content.length>50000
   ||raw.pageId!==undefined&&!countPage(raw.pageId)
   ||raw.ocrPage!==undefined&&!countPage(raw.ocrPage)
   ||raw.ocrPage!==undefined&&raw.ocrPage!==raw.pageId
   ||raw.sourceType!==undefined&&raw.sourceType!=='text'&&raw.sourceType!=='caption'
   ||raw.tags!==undefined&&(!Array.isArray(raw.tags)||raw.tags.length>20||raw.tags.some(tag=>typeof tag!=='string'||tag.length>120)))
   throw Error('Некорректный фрагмент книги в архиве.');
  return {content:raw.content,pageId:raw.pageId as number|undefined,sourceType:raw.sourceType as 'text'|'caption'|undefined,
   tags:raw.tags as string[]|undefined,ocrPage:raw.ocrPage as number|undefined,embedding:unpackEmbedding(raw.embedding)};
 });
 const meta:BookMeta={version:1,model:EMBEDDING_MODEL,original:{name:src.name,mimeType:src.mimeType,bytes:src.bytes,sha256:src.sha256.toLowerCase()},
  document:{pageCount:doc.pageCount as number|undefined,textPages:doc.textPages as number|undefined,vectorized:doc.vectorized as boolean,ocrMissingPages:validPageList(doc.ocrMissingPages)},chunks:[]};
 return {meta,chunks};
}
export async function exportBookArchive(documentId:string,options:BlobHashOptions={}):Promise<Blob>{
 checkBookOperation(options.signal);
 const doc=(await getAllDocuments()).find(item=>item.id===documentId);
 if(!doc)throw Error('Книга не найдена в локальной библиотеке.');
 if(doc.storage==='folder'){
  const state=await checkLibraryFolderSource(doc);
  if(state==='modified'||state==='unavailable')throw Error('Исходный файл книги изменился или недоступен. Подключите актуальный оригинал.');
 }
 const original=await getDocumentSourceFile(documentId);
 if(!original)throw Error('Оригинал книги отсутствует: архив с неподтверждённым текстом создавать нельзя.');
 if(original.size>SOURCE_LIMIT)throw Error('Переносимый архив пока поддерживает книги до 250 МБ. Разделите более крупную книгу на тома.');
 const sha256=await hashBlobSha256(original,options);
 if(doc.fileSha256&&doc.fileSha256!==sha256)throw Error('Контрольная сумма оригинала отличается от импортированной версии.');
 const raw=await getDocumentChunkRecords(documentId);
 if(raw.length>MAX_CHUNKS)throw Error('Для этой книги слишком много фрагментов для одиночного архива.');
 const chunks:PackedChunk[]=raw.map(chunk=>{
  const prefix=`${documentId}_ocr_`;
  const page=chunk.id.startsWith(prefix)?Number(chunk.id.slice(prefix.length).split('_')[0]):undefined;
  return {content:chunk.content,pageId:chunk.pageId,sourceType:chunk.sourceType,tags:chunk.tags,
   ...(page&&Number.isSafeInteger(page)?{ocrPage:page}:{}),
   ...(packEmbedding(chunk.embedding)?{embedding:packEmbedding(chunk.embedding)}:{})};
 });
 const fullyVectorized=Boolean(doc.vectorized&&raw.length>0&&chunks.every(chunk=>chunk.embedding));
 const meta:BookMeta={version:1,model:EMBEDDING_MODEL,original:{name:doc.name,mimeType:original.type||'application/octet-stream',bytes:original.size,sha256},
  document:{pageCount:doc.pageCount,textPages:doc.textPages,vectorized:fullyVectorized,ocrMissingPages:doc.ocrMissingPages},chunks};
 const bytes=new TextEncoder().encode(JSON.stringify(meta));
 if(bytes.length>META_LIMIT)throw Error('Текстовый индекс книги слишком велик для одиночного архива.');
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
 const size=new Uint8Array(4);new DataView(size.buffer).setUint32(0,bytes.length,true);
 checkBookOperation(options.signal);
 return new Blob([MAGIC_BYTES,size,hash,bytes,original],{type:'application/octet-stream'});
}
export type BookRestoreResult={document:LibraryDocument;alreadyPresent:boolean;visualIndexRebuildRequired:true};
export async function restoreBookArchive(archive:Blob,options:BlobHashOptions={}):Promise<BookRestoreResult>{
 checkBookOperation(options.signal);
 if(archive.size<HEADER_BYTES||archive.size>HEADER_BYTES+META_LIMIT+SOURCE_LIMIT)throw Error('Размер архива книги недопустим.');
 const head=new Uint8Array(await archive.slice(0,HEADER_BYTES).arrayBuffer());
 if(!MAGIC_BYTES.every((byte,index)=>head[index]===byte))throw Error('Это не архив книги Doctor Opus.');
 const metaLength=new DataView(head.buffer,head.byteOffset+MAGIC_BYTES.length,4).getUint32(0,true);
 if(metaLength<20||metaLength>META_LIMIT||HEADER_BYTES+metaLength>archive.size)throw Error('Повреждена длина индекса книги.');
 const encoded=new Uint8Array(await archive.slice(HEADER_BYTES,HEADER_BYTES+metaLength).arrayBuffer());
 const checksum=new Uint8Array(await crypto.subtle.digest('SHA-256',encoded));
 if(!checksum.every((byte,index)=>byte===head[MAGIC_BYTES.length+4+index]))throw Error('Индекс архива повреждён: контрольная сумма не совпадает.');
 let data:unknown;
 try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(encoded));}catch{throw Error('Не удалось прочитать описание книги из архива.');}
 const {meta,chunks}=parseMeta(data);
 const original=archive.slice(HEADER_BYTES+metaLength);
 if(original.size!==meta.original.bytes)throw Error('Размер оригинала внутри архива не совпадает.');
 const actual=await hashBlobSha256(original,options);
 if(actual!==meta.original.sha256)throw Error('Контрольная сумма оригинала книги не совпадает.');
 const existing=(await getAllDocuments()).find(doc=>doc.fileSha256===actual);
 if(existing){
  const state=await checkLibraryFolderSource(existing);
  if(state==='current'||state==='unverified')return {document:existing,alreadyPresent:true,visualIndexRebuildRequired:true};
 }
 const id=crypto.randomUUID();
 const doc:LibraryDocument={id,name:meta.original.name,size:original.size,storage:'browser',uploaded_at:new Date().toISOString(),
  fileSha256:actual,chunksCount:chunks.length,pageCount:meta.document.pageCount,textPages:meta.document.textPages,
  vectorized:meta.document.vectorized&&chunks.length>0&&chunks.every(row=>Boolean(row.embedding)),
  imagesIndexed:false,imagesCount:0,visualPagesProcessed:0,ocrMissingPages:meta.document.ocrMissingPages};
 // The complete document, chunks (including OCR) and original Blob are committed in one IndexedDB transaction.
 // Never trust a MIME type supplied by an untrusted archive when later opening the original.
 const safeMime=/\.pdf$/i.test(meta.original.name)?'application/pdf':'text/plain';
 checkBookOperation(options.signal);
 await saveDocument(doc,chunks,original.slice(0,original.size,safeMime));
 return {document:doc,alreadyPresent:false,visualIndexRebuildRequired:true};
}
