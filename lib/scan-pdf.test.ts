import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {scanPdf} from './scan-pdf.ts';
import {maskBrush,maskRectangle} from './privacy-mask.ts';
const jpeg=createRequire(import.meta.url)('jpeg-js');
test('scanner produces a binary PDF with independently addressable pages and correct xref offsets',()=>{
 const image=jpeg.encode({width:16,height:24,data:Buffer.alloc(16*24*4,255)},80).data;
 const bytes=scanPdf([{width:16,height:24,jpeg:image},{width:16,height:24,jpeg:image}]);
 const raw=Buffer.from(bytes).toString('latin1');assert.match(raw,/\/Count 2/);assert.equal((raw.match(/\/Type \/Page\b/g)??[]).length,2);
 const xref=Number(raw.match(/startxref\n(\d+)/)?.[1]);assert.equal(raw.slice(xref,xref+4),'xref');
 for(const match of raw.matchAll(/(\d{10}) 00000 n /g)){const offset=Number(match[1]);assert.match(raw.slice(offset,offset+14),/^\d+ 0 obj/);}
 assert.throws(()=>scanPdf([]));assert.throws(()=>scanPdf([{width:0,height:1,jpeg:image}]));
});
test('masking normalizes reverse drags and fills fast brush strokes without leaving gaps',()=>{
 assert.deepEqual(maskRectangle({x:.8,y:.6},{x:.2,y:.1},1000,500),{x:200,y:50,width:600.0000000000001,height:250});
 const boxes=maskBrush({x:0,y:.5},{x:1,y:.5},1000,500,5);assert.ok(boxes.length>20);assert.equal(boxes[0].x,0);
 for(let i=1;i<boxes.length;i++)assert.ok(boxes[i].x<=boxes[i-1].x+boxes[i-1].width);
 assert.equal(boxes.at(-1)!.x+boxes.at(-1)!.width,1000);
});
