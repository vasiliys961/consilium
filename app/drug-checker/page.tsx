'use client';
import Link from 'next/link';
import {useRef,useState} from 'react';
import {DrugInteractionChecker} from '@/app/components/drug-interaction-checker';
import {DrugLabelPicker} from '@/app/components/drug-label-picker';
import {LanguageSwitcher} from '@/app/components/language-switcher';
import {useWorkspaceLanguage} from '@/app/components/workspace-language';
import {reviewBeforeSending} from '@/lib/privacy-client';
import type {DrugLabelSelection} from '@/lib/drug-labels';
import type {MedicationReport} from '@/lib/medication-review';
import type {Citation} from '@/lib/literature';
type Issue={name:string;suggestion:string|null;reason:string};
type Result={report:MedicationReport;citations:Citation[];model:string};
export default function StandaloneDrugChecker(){
 const {t,language}=useWorkspaceLanguage();
 const [current,setCurrent]=useState(''),[proposed,setProposed]=useState(''),[context,setContext]=useState('');
 const [labels,setLabels]=useState<DrugLabelSelection[]>([]),[result,setResult]=useState<Result>(),[issues,setIssues]=useState<Issue[]>([]);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');const abort=useRef<AbortController>();
 async function review(active:string,next:string,useSelected=false){
  const request=new AbortController();abort.current=request;setBusy(true);setProposed(next);setNotice(t('Получаем инструкции препаратов…'));setIssues([]);setResult(undefined);
  try{
   let selected=labels;
   if(!useSelected){
    const discovery=await fetch('/api/medications/sources',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({names:[active,next].filter(Boolean).join('\n')}),signal:request.signal});
    if(!discovery.ok)throw Error(t('Инструкции не получены. Проверка не выполнена; платная модель не вызвана.'));
    const found=await discovery.json() as {selections:DrugLabelSelection[];issues:Issue[]};
    setIssues(found.issues);
    if(found.issues.length){setNotice(t('Уточните названия или источники ниже. Платная модель не вызвана.'));return;}
    selected=found.selections;
   }
   if(!selected.length)throw Error(t('Инструкции не получены. Проверка не выполнена; платная модель не вызвана.'));
   setLabels(selected);
   const reviewed=await reviewBeforeSending({task:'management',locale:language,sourceLocale:language,retain:false,externalSearch:false,drugLabels:selected,text:`Current medications supplied by physician:\n${active}\nProposed additions:\n${next||'(none)'}\nClinical context supplied by physician (do not infer missing conditions):\n${context||'(not supplied)'}`});
   request.signal.throwIfAborted();setNotice(t('Проверяем сочетание по полученным инструкциям…'));
   const response=await fetch('/api/medications/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(reviewed),signal:request.signal});
   if(!response.ok){const body=await response.json();throw Error(t(body.error==='verified_labels_unavailable'?'Инструкции не получены. Проверка не выполнена; платная модель не вызвана.':'Не получен подтверждённый ответ по инструкциям. Проверка не завершена.'));}
   setResult(await response.json());setNotice('');
  }catch(error){setNotice(request.signal.aborted?t('Проверка остановлена.'):error instanceof Error?error.message:t('Проверка не выполнена.'));}
  finally{setBusy(false);}
 }
 function correct(issue:Issue){if(!issue.suggestion)return;setCurrent(value=>value.replace(issue.name,issue.suggestion!));setProposed(value=>value.replace(issue.name,issue.suggestion!));setIssues([]);setNotice('');}
 function source(key:string){return result?.citations.find(citation=>citation.passageId===key);}
 return <main className="module-page" style={{maxWidth:1100,margin:'auto',padding:28,fontSize:18,lineHeight:1.7}}>
  <Link href="/workspace">← {t('Клинические случаи')}</Link><LanguageSwitcher/>
  <h1>{t('Проверка лекарств и опасных сочетаний')}</h1>
  <p>{t('Самостоятельный модуль: введите список препаратов и предполагаемое назначение. Случай создавать не требуется.')}</p>
  <label>{t('Клинические уточнения для проверки')}<textarea disabled={busy} rows={3} value={context} onChange={event=>{setContext(event.target.value);setResult(undefined);}} placeholder={t('Возраст, функция почек и печени, беременность, аллергии, ЭКГ и другие важные сведения — если известны')}/></label>
  <DrugInteractionChecker current={current} onCurrentChange={value=>{setCurrent(value);setResult(undefined);setIssues([]);}} onReview={(active,next)=>void review(active,next)} onProposedChange={value=>{setProposed(value);setResult(undefined);setIssues([]);}} proposed={proposed} disabled={busy}/>
  {issues.map((issue,index)=><section key={index} role="alert"><strong>{issue.name}</strong><p>{t(issue.reason==='name'?'Название не подтверждено.':issue.reason==='unavailable'?'Сервис инструкций недоступен.':issue.reason==='too_many'||issue.reason==='limit'?'Для этой проверки выберите не более четырёх препаратов.':'Подходящая инструкция не найдена.')}</p>{issue.suggestion&&<button type="button" onClick={()=>correct(issue)}>{t('Подтвердить название:')} {issue.suggestion}</button>}</section>)}
  <details open={labels.length>0}><summary>{t('Инструкции FDA / DailyMed · добавить к проверке')}</summary><DrugLabelPicker selected={labels} onChange={value=>{setLabels(value);setResult(undefined);}} disabled={busy}/>{labels.length>0&&<button type="button" disabled={busy||!(current.trim()||proposed.trim())} onClick={()=>void review(current,proposed,true)}>{t('Проверить по выбранным инструкциям')}</button>}</details>
  {busy&&<button onClick={()=>abort.current?.abort()}>{t('Остановить проверку')}</button>}{notice&&<p role="status">{notice}</p>}
  {result&&<section><h2>{t('Результат проверки')}</h2>
   <h3>{t('Взаимодействие именно этого сочетания')}</h3><p>{t(result.report.pair.status==='listed'?'Указано в полученных инструкциях':result.report.pair.status==='not_listed'?'Не найдено в полученных инструкциях':'Не оценено')}</p><p>{result.report.pair.text}</p>
   {result.report.pair.sources.map(key=><p key={key}><a href={source(key)?.url??undefined} target="_blank" rel="noreferrer">{source(key)?.title} ↗</a></p>)}
   {result.report.risks.length>0&&<><h3>{t('Отдельные риски препаратов с учётом контекста')}</h3>{result.report.risks.map((risk,index)=><article key={index}><p>{risk.text}</p><details><summary><a href={source(risk.source)?.url??undefined} target="_blank" rel="noreferrer">{source(risk.source)?.title} ↗</a></summary><blockquote lang="en">{risk.quote}</blockquote></details></article>)}</>}
   {result.report.questions.length>0&&<><h3>{t('Вопросы, меняющие решение')}</h3><ul>{result.report.questions.map((question,index)=><li key={index}>{question}</li>)}</ul></>}
   {result.report.limits.length>0&&<ul>{result.report.limits.map((limit,index)=><li key={index}>{limit}</li>)}</ul>}
  </section>}
  <p><a href="https://www.drugs.com/drug_interactions.html" target="_blank" rel="noreferrer">Drugs.com Interaction Checker ↗</a>{' · '}<a href="https://dailymed.nlm.nih.gov/dailymed/" target="_blank" rel="noreferrer">DailyMed ↗</a></p>
 </main>;
}
