import type{CaseFile}from'./conductor';
import{dicomLabel}from'../packages/radiology/dicom.ts';
import{catalogZip}from'../packages/intake/zip.ts';
export function materialRoute(file:CaseFile):'radiology'|'ecg'|'laboratory'|'general'{
 if(file.processingModule==='radiology'||file.image&&['xray','ct','mri'].includes(file.imageProfile??''))return 'radiology';
 if(/\.(dcm|dicom)$/i.test(file.name)){
  try{const bytes=Uint8Array.from(atob(file.binary??''),c=>c.charCodeAt(0));const modality=dicomLabel(bytes)?.modality;if(modality==='ECG')return 'ecg';if(modality==='US')return 'general';}catch{}
  return 'radiology';
 }
 if(/\.zip$/i.test(file.name)&&file.binary){try{const entries=catalogZip(Uint8Array.from(atob(file.binary),c=>c.charCodeAt(0)));if(entries.length&&entries.every(e=>/\.(dcm|dicom)$/i.test(e.name)))return 'radiology';}catch{}}
 if(/\.(edf|mat|scp)$/i.test(file.name)||file.imageProfile==='ecg')return 'ecg';
 if(/\.(csv|xml)$/i.test(file.name)&&/ECG|MDC_ECG|\b(?:aVR|aVL|aVF|V[1-6])\b/i.test(file.text??''))return 'ecg';
 if(/\.(xlsx|csv)$/i.test(file.name))return 'laboratory';
 return 'general';
}
export function materialKey(file:CaseFile){return file.sha256||file.name;}
export function moduleHref(module:string,caseId:string){return `/${module}?case=${encodeURIComponent(caseId)}`;}
export async function restoreMaterial(file:CaseFile):Promise<File|null>{
 if(file.binary)return new File([Uint8Array.from(atob(file.binary),c=>c.charCodeAt(0))],file.name,{type:/\.(dcm|dicom)$/i.test(file.name)?'application/dicom':'application/octet-stream'});
 if(file.image){const blob=await fetch(file.image).then(r=>r.blob());return new File([blob],file.name,{type:blob.type});}
 if(file.text!==undefined)return new File([file.text],file.name,{type:'text/plain'});
 return null;
}
export async function storeOriginal(file:File):Promise<CaseFile>{
 if(file.size>64*1024*1024)throw Error('Исходный файл превышает 64 МБ. Сохраните оригинал на диске.');
 const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 return {name:file.name,bytes:bytes.length,sha256,binary:btoa(binary)};
}
