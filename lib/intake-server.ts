import {textFromVcfGzip} from '../packages/genomics/vcf.ts';
import type { CaseFile } from './conductor.ts';
import { bytesFromBase64 } from '../packages/ecg/open.ts';
import { textFromPdf } from '../packages/docs/pdf.ts';
import { renderPdfPages, extractPdfText, ocrScannedPdf } from '../packages/docs/pdf-pages.ts';
import { parseTiff } from "../packages/radiology/tiff.ts";
import { parseDicom } from '../packages/radiology/dicom.ts';
import { encodeDataUrl } from '../packages/intake/raster.ts';
import { catalogZip } from '../packages/intake/zip.ts';
export async function prepareServerFiles(files:readonly CaseFile[]):Promise<CaseFile[]> {
 const prepared:CaseFile[]=[];
 for(const file of files) {
  const lower=file.name.toLowerCase();const bytes=file.binary?bytesFromBase64(file.binary):null;
  if(file.frames?.length){prepared.push({...file,frames:undefined,image:undefined,clip:undefined,plane:undefined,intakeNote:`Выбраны ${Math.min(file.frames.length,3)} кадра видео. Это выборочный обзор, не анализ всей видеопоследовательности и не измерение функции.`});prepared.push(...file.frames.slice(0,3).map((frame,i)=>({name:`${file.name}/frame-${i+1}-at-${frame.time.toFixed(2)}s.jpg`,image:frame.image,parent:file.name,clientId:file.clientId,imageProfile:file.imageProfile})));continue;}
  if(/\.(tif|tiff)$/.test(lower)&&bytes&&!file.image){try{const decoded=parseTiff(bytes);prepared.push({...file,image:encodeDataUrl({width:decoded.width,height:decoded.height,data:new Uint8Array(decoded.pixels),kind:'jpeg'}),intakeNote:'Открыт один кадр TIFF; другие страницы не оценены.'});continue;}catch{prepared.push({...file,intakeNote:'TIFF не декодирован. Сжатый или многокадровый вариант может не поддерживаться.'});continue;}}
  if(lower.endsWith('.vcf.gz')&&bytes&&!file.text){const text=await textFromVcfGzip(bytes);prepared.push({...file,...(text?{text}:{intakeNote:'VCF.GZ не распакован: повреждённый файл или превышен предел извлечения.'})});continue;}
  if(lower.endsWith('.zip') && bytes) {
   const entries=catalogZip(bytes,'full');let total=0;let expanded=0;
   for(const entry of entries.slice(0,40)) {
    if(total+entry.bytes>12_000_000)break;
    total+=entry.bytes;const data=await entry.open(4_000_000);if(!data)continue;
    // Nested archives remain explicit unsupported artifacts, never recursively expanded.
    const name=`${file.name}/${entry.name}`;const ext=entry.name.toLowerCase();
    const member:CaseFile={name,bytes:data.length,clientId:file.clientId,imageProfile:file.imageProfile};
    if(/\.(png|jpe?g)$/.test(ext))member.image=`data:image/${ext.endsWith('.png')?'png':'jpeg'};base64,${Buffer.from(data).toString('base64')}`;
    else if(/\.(txt|csv|json|xml|vcf)$/.test(ext))member.text=new TextDecoder().decode(data);
    else member.binary=Buffer.from(data).toString('base64');
    const children=/\.zip$/.test(ext)?[member]:await prepareServerFiles([member]);prepared.push(...children);expanded++;
   }
   prepared.push({...file,intakeNote:`Архив: раскрыто ${expanded} из ${entries.length} записей; предел 40 файлов и 12 МБ распакованных данных. Нераскрытые записи не оценивались.`});continue;
  }
  if(lower.endsWith('.pdf') && bytes) {
   const scanner=/^scan-/i.test(file.name)||new TextDecoder().decode(bytes.slice(0,100)).includes('Concilium Scanner');
   const text=await extractPdfText(bytes).catch(()=>null) || file.text || await textFromPdf(bytes).catch(()=>null) || (scanner?await ocrScannedPdf(bytes).catch(()=>null):null);
   if(scanner&&!text?.trim()){prepared.push({...file,binary:undefined,text:undefined,intakeNote:'OCR сканера не выполнен. Передача документа заблокирована; добавьте проверенный текст или повторите сканирование.'});continue;}
   if(scanner&&text?.trim()){prepared.push({...file,text,intakeNote:'Документ сканера: локальный OCR. Проверьте распознавание чисел, единиц и отрицаний. Исходные страницы не передаются модели.'});continue;}
   // ECG PDF may have header text but still needs the tracing pixels.
   if((!text?.trim()||/ecg|ekg|экг/i.test(lower)) && !/^# doctor-opus-pdf-closed/.test(text??'')) {
    const pages=await renderPdfPages(bytes);
    if(pages.length){prepared.push({...file,...(text?{text}:{}),intakeNote:`Визуально подготовлены первые ${pages.length} страницы PDF (предел 3). Остальные страницы не оценивались.`});prepared.push(...pages.map(page=>({name:`${file.name}/page-${page.page}.jpg`,image:page.image,bytes:0,parent:file.name,clientId:file.clientId,imageProfile:file.imageProfile})));continue;}
   }
   prepared.push({...file,...(text?{text}:{}),...(!text?.trim()?{intakeNote:'Текст PDF не извлечён; локальный рендер страниц недоступен или файл не открылся.'}:{})});continue;
  }
  if(/\.(dcm|dicom)$/.test(lower) && bytes && !file.image) {
   try {const decoded=parseDicom(bytes);const image=encodeDataUrl({width:decoded.window.width,height:decoded.window.height,data:new Uint8Array(decoded.pixels),kind:'jpeg'});prepared.push({...file,image,intakeNote:'Один несжатый кадр DICOM. Другие срезы и окна не оценивались.'});continue;}catch{/* Digital waveforms and unsupported DICOM stay with their specialized adapters. */}
  }
  prepared.push(file);
 }
 return prepared;
}
