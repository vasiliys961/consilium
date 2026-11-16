import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';
import {extractPdfText,renderPdfPages,scannerPdfPageCoverage} from './pdf-pages.ts';
import {scanPdf} from '../../lib/scan-pdf.ts';
import {createRequire} from 'node:module';
function pdf():Uint8Array {
 const stream='BT /F1 14 Tf 30 100 Td (SYNTHETIC WORKFLOW) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 let text='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(text.length);text+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=text.length;text+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return new TextEncoder().encode(text);
}
const available=['/opt/homebrew/bin/pdftoppm','/usr/bin/pdftoppm','/usr/local/bin/pdftoppm'].some(existsSync);
test('local PDF tools extract text and render actual page pixels without a model or external API',{skip:!available},async()=>{
 const bytes=pdf();assert.match(await extractPdfText(bytes)??'',/SYNTHETIC WORKFLOW/);const pages=await renderPdfPages(bytes);assert.equal(pages.length,1);assert.equal(pages[0].page,1);assert.match(pages[0].image,/^data:image\/jpeg;base64,/);
});

test('C5 scanned PDF: missing, duplicated, reordered or oversized-skipped pages are incomplete',()=>{
 const jpeg=createRequire(import.meta.url)('jpeg-js');
 const pixels=Buffer.alloc(32*32*4,255);
 const image=jpeg.encode({width:32,height:32,data:pixels},80).data;
 const make=()=>({jpeg:new Uint8Array(image),width:32,height:32});
 const pdf=scanPdf([make(),make(),make()]);
 assert.deepEqual(scannerPdfPageCoverage(pdf,[{page:1},{page:2},{page:3}]),{
  expected:3,received:[1,2,3],missing:[],complete:true});
 const missing=scannerPdfPageCoverage(pdf,[{page:1},{page:3}]);
 assert.equal(missing.complete,false);
 assert.deepEqual(missing.missing,[2]);
 assert.equal(scannerPdfPageCoverage(pdf,[{page:1},{page:1},{page:3}]).complete,false);
 assert.equal(scannerPdfPageCoverage(pdf,[{page:2},{page:1},{page:3}]).complete,false);
 assert.equal(scannerPdfPageCoverage(pdf,[{page:1},{page:2}]).complete,false,'A large page silently skipped by JPEG size guard must fail completeness');
 assert.equal(scannerPdfPageCoverage(pdf,[{page:1},{page:2},{page:3},{page:4}]).complete,false);
 assert.equal(scannerPdfPageCoverage(new Uint8Array([1,2,3]),[{page:1}]).complete,false);
});
test('C5 scanner PDF page numbering preserves a complete ten-page synthetic document',()=>{
 const jpeg=createRequire(import.meta.url)('jpeg-js');
 const img=jpeg.encode({width:12,height:12,data:Buffer.alloc(12*12*4,255)},80).data;
 const page={jpeg:new Uint8Array(img),width:12,height:12};
 const pdf=scanPdf(Array.from({length:10},()=>page));
 assert.equal(scannerPdfPageCoverage(pdf,Array.from({length:10},(_,i)=>({page:i+1}))).complete,true);
 assert.deepEqual(scannerPdfPageCoverage(pdf,Array.from({length:9},(_,i)=>({page:i+1}))).missing,[10]);
});
