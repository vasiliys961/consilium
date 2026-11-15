import {recognizeWords} from '../intake/ocr.ts';
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

/** OCR for scanner-produced documents; raw page pixels remain local. */
export async function ocrScannedPdf(bytes:Uint8Array):Promise<string|null>{
 const pages=await renderPdfPages(bytes,10);if(!pages.length)return null;const text:string[]=[];
 for(const page of pages){const words=await recognizeWords(Buffer.from(page.image.split(',')[1],'base64'),'jpg');if(words===null)return null;
  const lines:Array<{y:number;h:number;words:typeof words}>=[];
  for(const word of words.slice().sort((a,b)=>a.y-b.y||a.x-b.x)){const line=lines.find(line=>Math.abs(line.y-word.y)<Math.max(line.h,word.height)*.65);if(line)line.words.push(word);else lines.push({y:word.y,h:word.height,words:[word]});}
  text.push(`Страница ${page.page} · OCR, сверить с оригиналом\n`+lines.map(line=>line.words.sort((a,b)=>a.x-b.x).map(word=>word.text).join(' ')).join('\n'));
 }
 return text.some(part=>part.split('\n').slice(1).join('').trim())?text.join('\n\n'):null;
}
