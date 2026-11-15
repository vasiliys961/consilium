import {openLibraryDB,type LibraryDocument} from './library-db.ts';
import {VISUAL_INDEX_VERSION} from './visual-embeddings.ts';
export interface VisualBookRegion {id:string;documentId:string;pageId:number;regionId:string;bounds:[number,number,number,number];embedding:Int8Array|Float32Array;caption:string;version:string;ocrMissing?:boolean;hasVisualContent?:boolean}
export async function getBookVisualRegions(documentId?:string):Promise<VisualBookRegion[]>{
 const db=await openLibraryDB();return new Promise((resolve,reject)=>{const tx=db.transaction('imageChunks','readonly'),store=tx.objectStore('imageChunks');const request=documentId?store.index('documentId').getAll(documentId):store.getAll();request.onsuccess=()=>resolve((request.result as VisualBookRegion[]).filter(row=>row.version===VISUAL_INDEX_VERSION));request.onerror=()=>reject(request.error);});
}
export async function saveBookVisualPage(documentId:string,regions:VisualBookRegion[],thumbnails:Map<string,string>,pageCount:number,complete=false){
 const db=await openLibraryDB();await new Promise<void>((resolve,reject)=>{
 const tx=db.transaction(['imageChunks','imageThumbs','documents'],'readwrite');
 for(const row of regions){tx.objectStore('imageChunks').put(row);tx.objectStore('imageThumbs').put({id:row.id,documentId,thumbnail:thumbnails.get(row.id)});}
 const coverage=tx.objectStore('imageChunks').index('documentId').getAll(documentId);
 coverage.onsuccess=()=>{const rows=(coverage.result as VisualBookRegion[]).filter(row=>row.version===VISUAL_INDEX_VERSION),pages=rows.filter(row=>row.regionId==='page');
 const store=tx.objectStore('documents'),request=store.get(documentId);request.onsuccess=()=>{const doc=request.result as LibraryDocument|undefined;if(doc)store.put({...doc,pageCount,visualIndexVersion:VISUAL_INDEX_VERSION,imagesIndexed:complete&&pages.length===pageCount,imagesCount:rows.length,visualPagesProcessed:pages.length,ocrMissingPages:pages.filter(row=>row.ocrMissing).map(row=>row.pageId)});};};
 tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
 });
}
export async function visualThumbnails(ids:string[]){
 const db=await openLibraryDB();return new Promise<Map<string,string>>((resolve,reject)=>{const out=new Map<string,string>(),tx=db.transaction('imageThumbs','readonly');for(const id of ids){const request=tx.objectStore('imageThumbs').get(id);request.onsuccess=()=>{if(request.result?.thumbnail)out.set(id,request.result.thumbnail);};}tx.oncomplete=()=>resolve(out);tx.onerror=()=>reject(tx.error);});
}
