import {openLibraryDB,type LibraryChunk,type LibraryDocument} from './library-db.ts';
import type {extractBookLayout} from './library-layout.ts';
export async function saveBookLayout(documentId:string,page:number,layout:ReturnType<typeof extractBookLayout>){
 const db=await openLibraryDB();
 await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(['chunks','documents'],'readwrite'),chunks=tx.objectStore('chunks'),docs=tx.objectStore('documents');
  const request=chunks.index('documentId').getAll(documentId);request.onsuccess=()=>{
   const records=request.result as LibraryChunk[];const prefix=`${documentId}_layout_${page}_`;
   const rows=layout.objects.map((obj,index)=>({id:prefix+index,documentId,pageId:page,sourceType:'caption',tags:[obj.kind,obj.label,layout.heading].filter(Boolean),content:[layout.heading,obj.label,obj.text].filter(Boolean).join('\n')}));
   let changed=false;
   for(const row of rows){const old=records.find(record=>record.id===row.id);if(old?.content!==row.content){chunks.put(row);changed=true;}}
   records.filter(row=>row.id.startsWith(prefix)&&!rows.some(next=>next.id===row.id)).forEach(row=>{chunks.delete(row.id);changed=true;});
   const docRequest=docs.get(documentId);docRequest.onsuccess=()=>{const doc=docRequest.result as LibraryDocument|undefined;if(doc)docs.put({...doc,chunksCount:records.filter(row=>!row.id.startsWith(prefix)).length+rows.length,...(changed?{vectorized:false}:{})});};
  };tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
 });
}
