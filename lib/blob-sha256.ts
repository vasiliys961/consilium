import {sha256} from '@noble/hashes/sha2.js';

export const LIBRARY_SOURCE_LIMIT=250*1024*1024;
export const HASH_CHUNK_BYTES=1024*1024;
export type BlobHashOptions={signal?:AbortSignal;onProgress?:(completed:number,total:number)=>void};
export function checkBookOperation(signal?:AbortSignal):void{signal?.throwIfAborted();}

/** True SHA-256, compatible with existing fingerprints. At most 1 MiB is read at a time.
 * Blob slices also yield to the browser between chunks, so cancellation remains usable. */
export async function hashBlobSha256(blob:Blob,options:BlobHashOptions={}):Promise<string>{
 const hash=sha256.create();
 try{
  checkBookOperation(options.signal);
  for(let offset=0;offset<blob.size;offset+=HASH_CHUNK_BYTES){
   checkBookOperation(options.signal);
   const bytes=await blob.slice(offset,Math.min(offset+HASH_CHUNK_BYTES,blob.size)).arrayBuffer();
   checkBookOperation(options.signal);
   hash.update(new Uint8Array(bytes));
   options.onProgress?.(Math.min(offset+HASH_CHUNK_BYTES,blob.size),blob.size);
   // Do not rely on Blob.arrayBuffer resolving in a different browser task.
   await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
  checkBookOperation(options.signal);
  return Array.from(hash.digest(),byte=>byte.toString(16).padStart(2,'0')).join('');
 }finally{hash.destroy();}
}
