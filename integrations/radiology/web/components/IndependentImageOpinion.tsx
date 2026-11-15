'use client';
import {useEffect,useRef,useState} from 'react';
import type {SanitizedModelReview} from '../lib/sanitized-cloud-review';
import {LocalizedUi} from './ConciliumBridge';
export function IndependentImageOpinion({result,payload,headers,onResult}:{result:SanitizedModelReview;payload:Record<string,unknown>|null;headers?:Record<string,string>;onResult:(value:SanitizedModelReview)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const active=useRef<AbortController|null>(null);
 useEffect(()=>()=>active.current?.abort(),[]);
 async function request(){if(!payload||busy)return;const c=new AbortController();active.current=c;setBusy(true);setError('');
  try{const response=await fetch('/api/ai/deidentified-openrouter-review',{method:'POST',credentials:'same-origin',signal:c.signal,headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({...payload,secondOpinion:true})});const body=await response.json();
   if(!response.ok)throw Error(body.error??'Не удалось получить второе мнение. Основное заключение сохранено.');
   if(body.schema!=='opus-sanitized-cloud-pilot/v1'||body.primaryModel!==result.primaryModel||JSON.stringify(body.sourceFrames)!==JSON.stringify(result.sourceFrames))throw Error('Изображения второго мнения не совпали с основным разбором.');
   onResult(body);
  }catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'Ошибка второго мнения');}finally{if(!c.signal.aborted)setBusy(false);}
 }
 const opinion=result.results.find(r=>r.reviewer==='opus');
 return <section aria-label="Второе мнение по изображениям"><p><LocalizedUi value="Основной читатель: Argon. Opus смотрит изображения независимо, без заключения Argon."/></p>
  {!opinion&&<button type="button" disabled={busy||!payload} onClick={()=>void request()}><LocalizedUi value={busy?'Opus проверяет изображения…':'Второе мнение Opus'}/></button>}
  {error&&<p role="alert">{error}</p>}
  {result.secondOpinion?.status==='unavailable'&&<p role="status"><LocalizedUi value="Второе мнение не получено. Основное заключение сохранено."/></p>}
  {opinion&&<><textarea hidden readOnly data-concilium-report="true" value={"НЕЗАВИСИМОЕ ВТОРОЕ МНЕНИЕ OPUS (окончательное решение врача):\n"+opinion.review.observations.map(o=>o.imageId+": "+o.anatomy+" — "+o.sign+". "+o.uncertainty).join("\n")}/><h3><LocalizedUi value="Независимое второе мнение Opus"/></h3><p><LocalizedUi value="Сопоставьте с основным заключением. Окончательное решение принимает врач."/></p>{opinion.review.observations.map(o=><p key={o.id}>{o.imageId}: {o.anatomy} — {o.sign}. {o.uncertainty}</p>)}</>}
 </section>;
}
