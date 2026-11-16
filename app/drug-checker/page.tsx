'use client';

import Link from 'next/link';
import {useRef,useState} from 'react';
import {DrugInteractionChecker} from '@/app/components/drug-interaction-checker';
import {LanguageSwitcher} from '@/app/components/language-switcher';
import {useWorkspaceLanguage} from '@/app/components/workspace-language';
import {reviewBeforeSending} from '@/lib/privacy-client';
import type {MedicationContext} from '@/lib/drug-interaction-rules';
import type {QuickMedicationReport} from '@/lib/medication-review';

type Details={stopped:string;alternatives:string;context:MedicationContext};
type Result={report:QuickMedicationReport;model:string;estimatedUsd:number|null;evidence:'not_source_verified';inputTokens:number;outputTokens:number};

export default function StandaloneDrugChecker(){
 const {t,language}=useWorkspaceLanguage();
 const [current,setCurrent]=useState(''),[proposed,setProposed]=useState(''),[context,setContext]=useState('');
 const [result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const abort=useRef<AbortController|null>(null);
 function invalidate(){setResult(null);setNotice('');}
 async function review(active:string,next:string,details:Details){
  const request=new AbortController();abort.current=request;setBusy(true);invalidate();
  setNotice(t('Выполняется один краткий ИИ-разбор…'));
  try{
   // Keep all original names and roles intact; do not gate unknown medicines through a fixed dictionary.
   const text=JSON.stringify({
    current:active,proposed:next,stopped:details.stopped,
    alternatives:details.alternatives.split(/[\n;|]/).map(x=>x.trim()).filter(Boolean),
    clinicalContext:context,
    egfr:details.context.egfr??null,potassium:details.context.potassium??null,
    decompensatedCirrhosis:details.context.decompensatedCirrhosis===true,
    severeHepaticImpairment:details.context.severeHepaticImpairment===true,
   });
   const reviewed=await reviewBeforeSending({task:'management',locale:language,sourceLocale:language,retain:false,externalSearch:false,text});
   request.signal.throwIfAborted();
   const response=await fetch('/api/medications/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(reviewed),signal:request.signal});
   if(!response.ok)throw Error(t('ИИ-проверка не выполнена. Препараты не признаны совместимыми.'));
   const data=await response.json() as Result;
   if(data.evidence!=='not_source_verified'||!data.report)throw Error(t('Ответ модели не прошёл проверку формата.'));
   setResult(data);setNotice('');
  }catch(error){setNotice(request.signal.aborted?t('Проверка остановлена.'):error instanceof Error?error.message:t('Проверка не выполнена.'));}
  finally{setBusy(false);}
 }
 return <main className="module-page" style={{maxWidth:1100,margin:'auto',padding:28,fontSize:18,lineHeight:1.6}}>
  <Link href="/workspace">← {t('Клинические случаи')}</Link><LanguageSwitcher/>
  <h1>{t('Проверка лекарственных взаимодействий')}</h1>
  <p>{t('Введите любое количество препаратов на любом языке. Локальные правила проверяются бесплатно. Для более широкого предварительного анализа можно запустить один недорогой ИИ-запрос.')}</p>
  <label>{t('Клинический контекст (необязательно)')}<textarea rows={3} disabled={busy} maxLength={3500} value={context} onChange={e=>{setContext(e.target.value);invalidate();}} placeholder={t('Возраст, диагнозы, функция почек, печени, аллергии, ЭКГ, дозировки — только известные сведения')}/></label>
  <DrugInteractionChecker current={current} proposed={proposed}
   onCurrentChange={value=>{setCurrent(value);invalidate();}}
   onProposedChange={value=>{setProposed(value);invalidate();}}
   onDetailsChange={invalidate}
   onReview={(active,next,details)=>void review(active,next,details)}
   disabled={busy}/>
  {busy&&<button type="button" onClick={()=>abort.current?.abort()}>{t('Остановить проверку')}</button>}
  {notice&&<p role="status">{notice}</p>}
  {result&&<section aria-label={t('Результат предварительной проверки')}>
   <h2>{t('Предварительная ИИ-проверка')}</h2>
   <p><strong>{t('Источники не проверялись автоматически. Это не подтверждение совместимости или отсутствия взаимодействий.')}</strong></p>
   <p>{result.report.summary}</p>
   {result.report.interactions.map((finding,index)=><article key={index} style={{marginBottom:18}}>
    <h3>{finding.drugs.join(' + ')}</h3>
    <p><strong>{t(finding.severity==='contraindicated'?'Возможно противопоказанное сочетание':finding.severity==='high'?'Высокий потенциальный риск':finding.severity==='monitor'?'Нужен мониторинг':'Требуется уточнение')}</strong></p>
    <p>{finding.mechanism}</p><p>{t('Что сделать врачу:')} {finding.action}</p><p>{t('Что контролировать:')} {finding.monitoring}</p>
   </article>)}
   {result.report.interactions.length===0&&<p>{t('Модель не выделила значимых сочетаний. Это не означает, что они исключены.')}</p>}
   {result.report.questions.length>0&&<><h3>{t('Вопросы, влияющие на решение')}</h3><ul>{result.report.questions.map((x,i)=><li key={i}>{x}</li>)}</ul></>}
   {result.report.limits.length>0&&<><h3>{t('Ограничения')}</h3><ul>{result.report.limits.map((x,i)=><li key={i}>{x}</li>)}</ul></>}
   <p><small>{t('Модель:')} {result.model}. {result.estimatedUsd!==null?t('Оценка стоимости (не квитанция): $')+result.estimatedUsd.toFixed(4):t('Стоимость не определена по токенам')}.</small></p>
  </section>}
  <p><a href="https://dailymed.nlm.nih.gov/dailymed/" target="_blank" rel="noreferrer">DailyMed ↗</a>{' · '}<a href="https://www.drugs.com/drug_interactions.html" target="_blank" rel="noreferrer">Drugs.com ↗</a></p>
 </main>;
}
