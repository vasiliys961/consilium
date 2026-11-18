import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {hashBlobSha256,HASH_CHUNK_BYTES} from './blob-sha256.ts';

test('book fingerprints match standard SHA-256 across padding and chunk boundaries',async()=>{
 for(const size of [0,55,56,64,HASH_CHUNK_BYTES-1,HASH_CHUNK_BYTES,HASH_CHUNK_BYTES+71]){
  const data=new Uint8Array(size);for(let i=0;i<size;i++)data[i]=(i*17+89)%256;
  assert.equal(await hashBlobSha256(new Blob([data])),createHash('sha256').update(data).digest('hex'));
 }
});

test('250 MiB originals are checked with bounded reads, progress and no whole-file arrayBuffer',async()=>{
 const total=250*1024*1024,part=new Uint8Array(HASH_CHUNK_BYTES);part.fill(19);
 const expected=createHash('sha256');for(let i=0;i<250;i++)expected.update(part);
 let maximumRead=0,reads=0,lastProgress=0;
 // Virtual original: this test must not itself allocate another 250 MiB file.
 const file={size:total,arrayBuffer:()=>{throw Error('Whole file must not be read');},slice:(start:number,end:number)=>{
  maximumRead=Math.max(maximumRead,end-start);reads++;return new Blob([part.subarray(0,end-start)]);
 }} as Blob;
 const actual=await hashBlobSha256(file,{onProgress:(done,size)=>{assert.equal(size,total);assert.ok(done>lastProgress);lastProgress=done;}});
 assert.equal(actual,expected.digest('hex'));assert.equal(lastProgress,total);assert.equal(reads,250);assert.equal(maximumRead,HASH_CHUNK_BYTES);
});

test('cancelled hash stops before reading or producing a fingerprint',async()=>{
 const controller=new AbortController();let reads=0;
 const file={size:4*HASH_CHUNK_BYTES,slice:()=>{reads++;return new Blob([new Uint8Array(HASH_CHUNK_BYTES)]);}} as Blob;
 await assert.rejects(()=>hashBlobSha256(file,{signal:controller.signal,onProgress:()=>controller.abort()}),{name:'AbortError'});
 assert.equal(reads,1,'cancellation must stop before the next chunk read');
 reads=0;
 await assert.rejects(()=>hashBlobSha256(file,{signal:controller.signal}),{name:'AbortError'});assert.equal(reads,0);
});
