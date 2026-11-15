import {prepareImage,prepareAudio,prepareVideo} from "./media-intake";
import type { CaseFile } from './conductor';
import { textFromPdf } from '../packages/docs/pdf';
import { textFromDocx } from '../packages/docs/docx';
import { labTextFromXlsx } from '../packages/labs/xlsx';
import { textFromVcfGzip } from '../packages/genomics/vcf';
export async function prepareFile(file: File): Promise<CaseFile> {
  if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name}: предел 8 МБ. Большие исследования откройте в расширенной станции.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2,'0')).join('');
  let text: string | null | undefined;
  let image: string | undefined;
  let binary: string | undefined;
  let audio:string|undefined;
  let frames:Array<{time:number;image:string}>|undefined;
  const base64 = () => { let raw="";for(let i=0;i<bytes.length;i+=0x8000)raw+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(raw); };
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) { text = await textFromPdf(bytes); binary=base64(); }
  else if (name.endsWith('.docx')) text = await textFromDocx(bytes);
  else if (name.endsWith('.xlsx')) text = await labTextFromXlsx(bytes);
  else if (name.endsWith('.vcf.gz')) text = await textFromVcfGzip(bytes);
  else if (/\.(txt|md|csv|json|xml|vcf)$/.test(name)) text = new TextDecoder().decode(bytes);
  else if (/\.(dcm|dicom|zip|edf|mat|scp|tif|tiff)$/.test(name)) binary=base64();
  else if ((/\.(wav|mp3|m4a|ogg|aac|flac)$/.test(name)||(name.endsWith('.webm')&&file.type.startsWith('audio/')))) audio=await prepareAudio(file);
  else if (/\.(mp4|mov|webm)$/.test(name)) frames=await prepareVideo(file);
  else if (/\.(png|jpe?g|webp|heic|heif)$/.test(name)) {
    image=await prepareImage(file);
  } else throw new Error(`${file.name}: этот формат поддерживается в расширенной станции.`);
  if (!image && !binary && !audio && !frames?.length && !text?.trim()) throw new Error(`${file.name}: текст не извлечён. Для скана используйте расширенную станцию или добавьте расшифровку.`);
  return { name: file.name, bytes: file.size, sha256, ...(text ? { text } : {}), ...(image ? { image } : {}), ...(binary ? {binary} : {}), ...(audio ? {audio} : {}), ...(frames ? {frames} : {}) };
}
