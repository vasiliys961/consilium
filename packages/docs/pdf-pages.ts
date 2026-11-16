import {recognizeWords} from '../intake/ocr.ts';
import type {WordBox} from '../intake/burned.ts';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
function run(bin:string,args:string[]):Promise<boolean> {
 return new Promise(resolve=>{const child=spawn(bin,args,{stdio:'ignore'});const timer=setTimeout(()=>{child.kill();resolve(false);},15000);child.on('error',()=>{clearTimeout(timer);resolve(false);});child.on('close',code=>{clearTimeout(timer);resolve(code===0);});});
}
/** Local rendering only. No patient data leaves this machine at this stage. */
export async function renderPdfPages(bytes:Uint8Array, limit=3):Promise<Array<{page:number;image:string}>> {
 const dir=await mkdtemp(join(tmpdir(),'concilium-pdf-'));
 try {
  const input=join(dir,'input.pdf');await writeFile(input,bytes);
  for(const bin of ['pdftoppm','/opt/homebrew/bin/pdftoppm','/usr/local/bin/pdftoppm']) {
   const ok=await run(bin,['-f','1','-l',String(Math.min(10,limit)),'-scale-to','1600','-jpeg','-jpegopt','quality=85',input,join(dir,'page')]);
   if(!ok)continue;
   const names=(await readdir(dir)).filter(name=>/^page-\d+\.jpg$/.test(name)).sort((a,b)=>Number(a.match(/\d+/)?.[0])-Number(b.match(/\d+/)?.[0]));
   const pages=[];
   for(const name of names){const data=await readFile(join(dir,name));if(data.length>1_400_000)continue;pages.push({page:Number(name.match(/\d+/)?.[0]),image:`data:image/jpeg;base64,${data.toString('base64')}`});}
   return pages;
  }
  return [];
 } finally {await rm(dir,{recursive:true,force:true});}
}

export async function extractPdfText(bytes:Uint8Array):Promise<string|null>{
 const dir=await mkdtemp(join(tmpdir(),'concilium-pdf-text-'));
 try{const input=join(dir,'input.pdf');const output=join(dir,'text.txt');await writeFile(input,bytes);for(const bin of ['pdftotext','/opt/homebrew/bin/pdftotext','/usr/local/bin/pdftotext']){if(await run(bin,['-layout',input,output])){const text=await readFile(output,'utf8');return text.trim()?text.slice(0,500000):null;}}return null;}finally{await rm(dir,{recursive:true,force:true});}
}

/**
 * Generated Concilium scanner PDFs have an exact page count in the page tree.
 * A lost, oversized or undecodable page must NEVER be mistaken for a complete
 * clinical document just because OCR succeeded on its other pages.
 */
export function scannerPdfPageCoverage(bytes:Uint8Array,rendered:ReadonlyArray<{page:number}>){
 const head=new TextDecoder('latin1').decode(bytes.slice(0,8192));
 const validScanner=head.startsWith('%PDF-')&&head.includes('% Concilium Scanner');
 const count=validScanner?Number(/\/Type\s*\/Pages\s*\/Count\s+(\d+)\b/.exec(head)?.[1]):NaN;
 if(!Number.isSafeInteger(count)||count<1||count>10)
  return {expected:null as number|null,received:rendered.map(p=>p.page),missing:[] as number[],complete:false};
 const ids=rendered.map(page=>page.page);
 const seen=new Set(ids);
 const missing=Array.from({length:count},(_,i)=>i+1).filter(id=>!seen.has(id));
 return {expected:count,received:ids,missing,complete:ids.length===count&&ids.every((id,i)=>id===i+1)};
}

/** Layout-informed OCR: retain column separation without guessing missing characters. */
export function scannerOcrWordLines(words:readonly WordBox[]):string[]{
 const lines:Array<{y:number;h:number;words:WordBox[]}>= [];
 for(const word of [...words].sort((a,b)=>a.y-b.y||a.x-b.x)){
  const line=lines.find(l=>Math.abs(l.y-word.y)<Math.max(l.h,word.height)*.65);
  if(line)line.words.push(word);
  else lines.push({y:word.y,h:word.height,words:[word]});
 }
 return lines.map(line=>{
  const sorted=line.words.sort((a,b)=>a.x-b.x);
  return sorted.map((word,index)=>{
   if(index===0)return word.text;
   const prev=sorted[index-1];
   const gap=word.x-(prev.x+prev.width);
   const charWidth=prev.width/Math.max(1,prev.text.length);
   // A large visual gap is evidence of separate columns, not a missing digit.
   return (gap>Math.max(28,charWidth*3)?'\t':' ')+word.text;
  }).join('');
 });
}

/** OCR for scanner-produced documents; raw page pixels remain local. */
export async function ocrScannedPdf(bytes:Uint8Array):Promise<string|null>{
 const pages=await renderPdfPages(bytes,10);
 const coverage=scannerPdfPageCoverage(bytes,pages);
 if(!coverage.complete)return null; // fail closed: no partial clinical evidence
 const text:string[]=[];
 for(const page of pages){
  const words=await recognizeWords(Buffer.from(page.image.split(',')[1],'base64'),'jpg');
  if(words===null)return null;
  const lines=scannerOcrWordLines(words);
  // A blank OCR result on even one page cannot be promoted to a complete scan.
  if(!lines.some(line=>line.trim()))return null;
  text.push(`Страница ${page.page} · OCR, сверить с оригиналом\n`+lines.join('\n'));
 }
 return text.some(part=>part.split('\n').slice(1).join('').trim())?text.join('\n\n'):null;
}
