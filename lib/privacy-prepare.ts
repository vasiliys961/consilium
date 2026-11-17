import {relativeDateCleaner} from './privacy-dates.ts';
/** Local preparation only: no model, literature or transcription requests. */
import {prepareServerFiles} from './intake-server.ts';
import {withDocuments,withSpreadsheets,withVcf} from './extract-files.ts';
import {normalizeFiles} from './module-catalog.ts';
import {redactText,redactDocument} from '../packages/intake/redact.ts';
import {coverFiles} from '../packages/intake/pixels.ts';
import {decodeDataUrl,encodeDataUrl,paintBoxes} from '../packages/intake/raster.ts';
import {traceBinary,bytesFromBase64} from '../packages/ecg/open.ts';
import {traceCsv,traceXml,type EcgTrace} from '../packages/ecg/inspect.ts';
import {traceDicom} from '../packages/ecg/wave.ts';
import type {ConductInput,CaseFile} from './conductor.ts';
import type {PrivacyPrepared} from './privacy-types.ts';
import type {WordBox} from '../packages/intake/burned.ts';
import {safeReferenceUrl} from './literature.ts';
function traceText(trace:EcgTrace){const leads=Object.entries(trace.leads).filter(([,v])=>v.length);const length=Math.min(...leads.map(([,v])=>v.length));return [(trace.samplingRate?`sampling_rate,${trace.samplingRate}\n`: '')+leads.map(([k])=>k).join(','),...Array.from({length},(_,i)=>leads.map(([,v])=>v[i]).join(','))].join('\n');}
function profileName(file:CaseFile){const name=file.name.toLowerCase();if(/ecg|ekg|экг/.test(name))return 'ecg';if(/hist|гист/.test(name))return 'histology';if(/derm|skin|дерм/.test(name))return 'dermatology';if(/sono|ultra|узи/.test(name))return 'ultrasound';if(/mamm|мамм/.test(name))return 'mammography';return file.imageProfile&&file.imageProfile!=='auto'?file.imageProfile:'material';}
export async function preparePrivacy(input:ConductInput,options:{readWords?:(bytes:Buffer,ext:'png'|'jpg')=>Promise<WordBox[]|null>;finalize?:boolean;allowAudio?:boolean}={}):Promise<PrivacyPrepared>{
 const dates=relativeDateCleaner();let removed=0;const warnings:string[]=[],excluded:string[]=[],manualImages:Array<CaseFile&{reference?:boolean}>=[];let audioAvailable=Boolean(input.speech?.audio);const clean=(value:string)=>{if(options.finalize)return value;const result=redactText(dates.clean(value));removed+=result.removed;return result.text;};
 const note=clean(input.text??'');
 async function files(source:CaseFile[]|undefined,reference=false):Promise<CaseFile[]>{
  const expanded=options.finalize?(source??[]):await withVcf(await withDocuments(await withSpreadsheets(await prepareServerFiles(normalizeFiles(source??[]))),true));
  const drafts:CaseFile[]=[];
  for(let index=0;index<expanded.length;index++){
   const file=expanded[index];let text=file.text,image=file.image;const extension=file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]??'txt';
   let trace:EcgTrace|null=null;
   if(!options.finalize){if(file.binary)trace=traceBinary(file.name,file.binary);if(!trace&&file.binary&&/\.(dcm|dicom)$/i.test(file.name)){const bytes=bytesFromBase64(file.binary);if(bytes)trace=traceDicom(bytes);}if(!trace&&text&&extension==='xml')trace=traceXml(text);if(!trace&&text&&extension==='csv')trace=traceCsv(text);}
   if(trace)text=traceText(trace);
   const label=reference?'reference':trace?'ecg':/\/frame-\d+-at-/i.test(file.name)?'video-frame':profileName(file),name=options.finalize&&/^[a-z0-9-]+\.[a-z0-9]+$/.test(file.name)?file.name:`${label}-${file.clientId&&/^[a-f0-9-]{36}$/i.test(file.clientId)?file.clientId:index+1}.${trace?'csv':extension==='gz'&&/vcf/i.test(file.name)?'vcf':extension}`;
   if(file.audio){audioAvailable=true;if(!options.allowAudio)warnings.push('Аудиозапись исключена: удалить произнесённые данные до внешней расшифровки автоматически нельзя. Добавьте проверенный текст или отдельно разрешите передачу исходного аудио.');}
   if(text!==undefined){const cleaned=trace||options.finalize?{text,removed:0}:redactDocument(name,reference?text:dates.clean(text));text=cleaned.text??undefined;removed+=cleaned.removed;}
   if(image&&options.finalize){const raster=decodeDataUrl(image);if(!raster){excluded.push(name);continue;}image=encodeDataUrl({...raster,data:paintBoxes(raster.data,raster.width,raster.height,file.masks??[])});}
   if(!text?.trim()&&!image&&!(file.audio&&options.allowAudio)){excluded.push(name);continue;}
   drafts.push({name,...(reference&&file.librarySource?{librarySource:{documentId:file.librarySource.documentId,chunkId:file.librarySource.chunkId,title:clean(file.librarySource.title),page:file.librarySource.page}}:{}),...(file.clientId&&/^[a-f0-9-]{36}$/i.test(file.clientId)?{clientId:file.clientId}:{}),...(text!==undefined?{text}:{}),...(image?{image}:{}),...(file.audio&&options.allowAudio?{audio:file.audio}:{}),...(file.imageProfile?{imageProfile:file.imageProfile}:{}),...(!options.finalize&&file.masks?{masks:file.masks}:{}),...(file.intakeNote?{intakeNote:clean(file.intakeNote)}:{})});
  }
  if(options.finalize)return drafts;
  // Always check every image. OCR failure withholds the frame, irrespective of modality.
  const covered=await coverFiles(drafts.map(f=>({...f,image:f.image??null})),()=> 'unknown',options.readWords);removed+=covered.removed;
  for(const cover of covered.covers)if(cover.withheld){excluded.push(cover.source);const original=drafts.find(f=>f.name===cover.source),raster=original?.image?decodeDataUrl(original.image):null;if(original&&raster)manualImages.push({...original,image:encodeDataUrl(raster),masks:original.masks??[],reference});warnings.push('Изображение исключено: локальная проверка надписей не выполнена. Его можно проверить и закрыть вручную ниже.');}
  // Decode and re-encode even clean images: never retain original EXIF/PNG metadata.
  return covered.files.flatMap<CaseFile>(file=>{if(!file.image)return file.text?.trim()||file.audio?[{...file,image:undefined}]:[];const raster=decodeDataUrl(file.image);return raster?[{...file,image:encodeDataUrl(raster),masks:undefined}]:[];});
 }
 const patientFiles=await files(input.files),referenceFiles=await files(input.referenceFiles,true);
 const speechText=input.speech?.text?clean(input.speech.text):undefined;
 const body:ConductInput={text:note,files:patientFiles,referenceFiles,locale:input.locale,...(input.sourceLocale?{sourceLocale:input.sourceLocale}:{}),consilium:input.consilium===true,...(input.consilium===true&&input.councilSpecialty?{councilSpecialty:input.councilSpecialty}:{}),councilFallback:input.consilium===true&&input.councilFallback===true,secondOpinion:input.secondOpinion===true,externalSearch:input.externalSearch!==false,retain:false,...(input.task?{task:input.task}:{}),...(input.imageProfile?{imageProfile:input.imageProfile}:{}),...(input.caseId&&/^[a-f0-9-]{36}$/i.test(input.caseId)?{caseId:input.caseId}:{}),...(speechText||input.speech?.audio&&options.allowAudio?{speech:{...(speechText?{text:speechText}:{}),...(input.speech?.audio&&options.allowAudio?{audio:input.speech.audio}:{}),audience:input.speech?.audience==='patient'?'patient':'screen',...(input.speech?.target?{target:input.speech.target}:{})}}:{})};
 if(input.shelf?.length)body.shelf=input.shelf.map(item=>({title:clean(item.title??''),edition:clean(item.edition??''),chapter:clean(item.chapter??''),page:clean(item.page??''),...(item.url&&safeReferenceUrl(item.url)?{url:safeReferenceUrl(item.url)!}:{})}));
 if(input.drugLabels?.length)body.drugLabels=input.drugLabels.map(item=>({setId:item.setId,title:item.title}));
 if(audioAvailable)warnings.push('Исходная аудиозапись может содержать персональные данные. По умолчанию она не отправляется.');
 if(dates.count())warnings.push('Точные даты заменены относительными днями одной временной шкалы. Проверьте возраст, сроки и интервалы по оригиналу.');
 return {body,removed:removed+dates.count(),warnings:[...new Set(warnings)],excluded,audioAvailable,manualImages};
}
