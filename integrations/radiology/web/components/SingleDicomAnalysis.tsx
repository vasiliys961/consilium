"use client";
import {useEffect,useRef,useState} from 'react';
import {LocalizedUi} from './ConciliumBridge';
import StudyPrivacyReview from './StudyPrivacyReview';
import type {DicomSeries} from '../lib/dicom-series';
import type {VisionPrivacyPacket} from '../lib/vision-privacy';
import {MAX_PRIVACY_PIXELS} from '../lib/vision-privacy';
import {decodeDicomPreview} from '../lib/dicom-lite';
import type {SanitizedModelReview} from '../lib/sanitized-cloud-review';
import {reviewedConnectionReady,reviewedConnectionNotice} from '../lib/reviewed-connection-notice';

/** Existing primary reader, one reviewed DICOM image, one paid request.
 * No overview pass, budget/model forms, additional reader, or synthesis call.
 */
export default function SingleDicomAnalysis({series,files,onOpenSlice}:{series:DicomSeries;files:ReadonlyMap<string,File>;onOpenSlice:(id:string)=>void}){
 const [report,setReport]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const attempted=useRef(false),delivered=useRef(false),controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 useEffect(()=>{if(report&&!delivered.current){delivered.current=true;window.dispatchEvent(new Event('concilium.report-ready'));}},[report]);
 async function prepare(_index:number,signal:AbortSignal){
  if(series.members.length!==1||!['CT','MR'].includes(series.modality))throw Error('Нужно одно изображение КТ или МРТ.');
  const file=files.get(series.members[0].id);
  if(!file||file.size>6*1024*1024)throw Error('Исходное изображение недоступно или превышает безопасный размер.');
  signal.throwIfAborted();
  try{return [(await decodeDicomPreview(file,{maxPixels:MAX_PRIVACY_PIXELS})).url];}
  catch{const {decodeCornerstoneVisionPreview}=await import('../lib/cornerstone-vision-preview');return [await decodeCornerstoneVisionPreview(file,MAX_PRIVACY_PIXELS,signal)];}
 }
 async function analyze(packets:VisionPrivacyPacket[]){
  if(attempted.current)return;
  if(packets.length!==1||packets[0].frames.length!==1)throw Error('Разрешено одно проверенное изображение.');
  const c=new AbortController();controller.current=c;setBusy(true);setNotice('');
  let failure='Описание не получено. Повторный платный запрос автоматически не выполняется.';
  try{
   const probe=await fetch('/api/ai/deidentified-openrouter-review',{cache:'no-store',credentials:'same-origin',signal:c.signal});
   const ready=probe.ok?await probe.json():null;
   if(!reviewedConnectionReady(ready)){failure=reviewedConnectionNotice(ready);throw Error(failure);}
   attempted.current=true;
   const response=await fetch('/api/ai/deidentified-openrouter-review',{method:'POST',credentials:'same-origin',signal:c.signal,
    headers:{'Content-Type':'application/json'},body:JSON.stringify({packet:packets[0],singleReader:true,
     acknowledgeClinicianLawfulDisclosure:true,acknowledgeProviderHealthDataTerms:true,
     acknowledgePixelIdentityReviewed:true,acknowledgeOnePaidCall:true})});
   if(!response.ok)throw Error('Описание не получено. Повторный платный запрос автоматически не выполняется.');
   const result=await response.json() as SanitizedModelReview;c.signal.throwIfAborted();
   if(result.callsAttempted!==1||result.results.length!==1||result.results[0].review.reviewedImageIds.length!==1||
    !result.opusSynthesis?.summary?.trim()||result.sourceFrames?.[0]?.reviewedPixelSha256!==packets[0].frames[0].sha256)
    throw Error('Не удалось подтвердить описание именно этого изображения. Повторной оплаты нет.');
   setReport('Оценено одно представленное изображение. Полное исследование не оценивалось.\n\n'+result.opusSynthesis.summary);
  }catch{if(!c.signal.aborted){setNotice(failure);throw Error(failure);}}
  finally{if(!c.signal.aborted)setBusy(false);}
 }
 return <section className="reviewed-study">
  <h2><LocalizedUi value={"Описание изображения"}/></h2>
  {!report&&<StudyPrivacyReview compact count={1} modality={series.modality as 'CT'|'MR'} load={prepare} onReady={analyze}
   onOpenSlice={onOpenSlice} sourceIds={[[series.members[0].id]]} sourceNumbers={[[1]]} canRelease={true}
   sendLabel="Подтверждаю · получить описание (платно)"/>}
  {busy&&<p role="status"><LocalizedUi value={"Формируется описание изображения…"}/></p>}
  {notice&&<p role="alert"><LocalizedUi value={notice}/></p>}
  {report&&<label><LocalizedUi value={"Предварительное заключение · проверьте и отредактируйте"}/><textarea data-concilium-report="true" rows={18} style={{width:'100%'}} value={report} onChange={e=>setReport(e.target.value)}/></label>}
 </section>;
}
