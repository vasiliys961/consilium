import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';
import {extractPdfText,renderPdfPages} from './pdf-pages.ts';
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
