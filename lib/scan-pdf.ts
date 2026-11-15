/** Minimal image-only PDF writer. Pages are JPEGs prepared locally by the scanner. */
export type ScanPage={jpeg:Uint8Array;width:number;height:number};
export function scanPdf(pages:ScanPage[]):Uint8Array{
 if(!pages.length||pages.length>10)throw Error('Добавьте от 1 до 10 страниц.');
 const encoder=new TextEncoder(),parts:Uint8Array[]=[],offsets:number[]=[0];let length=0;
 const add=(value:string|Uint8Array)=>{const bytes=typeof value==='string'?encoder.encode(value):value;parts.push(bytes);length+=bytes.length;};
 const object=(id:number,content:string|(()=>void))=>{offsets[id]=length;add(`${id} 0 obj\n`);if(typeof content==='string')add(content);else content();add('\nendobj\n');};
 add('%PDF-1.4\n% Concilium Scanner\n');
 object(1,'<< /Type /Catalog /Pages 2 0 R >>');
 object(2,`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`);
 pages.forEach((page,index)=>{
  if(!Number.isSafeInteger(page.width)||!Number.isSafeInteger(page.height)||page.width<1||page.height<1||page.width*page.height>16000000||page.jpeg[0]!==255||page.jpeg[1]!==216)throw Error('Неверная страница сканера.');
  const id=3+index*3,width=595,height=Math.round(width*page.height/page.width);
  object(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`);
  object(id+1,()=>{add(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`);add(page.jpeg);add('\nendstream');});
  const draw=`q ${width} 0 0 ${height} 0 0 cm /Im Do Q`;
  object(id+2,`<< /Length ${encoder.encode(draw).length} >>\nstream\n${draw}\nendstream`);
 });
 const xref=length,count=3+pages.length*3;add(`xref\n0 ${count}\n0000000000 65535 f \n`);
 for(let id=1;id<count;id++)add(`${String(offsets[id]).padStart(10,'0')} 00000 n \n`);
 add(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
 const result=new Uint8Array(length);let at=0;for(const part of parts){result.set(part,at);at+=part.length;}return result;
}
