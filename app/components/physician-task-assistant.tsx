'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {planPhysicianTask,physicianTaskHref,type PhysicianTool} from '@/lib/physician-task-router';
import {useWorkspaceLanguage} from './workspace-language';

type IntegrationSnapshot={
 radiology?:{installed:boolean;running:boolean};
 ecg?:{available:boolean};
 protocol?:{ru?:{installed:boolean;running:boolean};en?:{installed:boolean;running:boolean}};
};
const examples=[
 'У пациента одышка, есть КТ и ЭКГ. Нужен комплексный разбор и протокол.',
 'Проверить взаимодействия лекарств и ограничения при сниженной СКФ.',
 'Записать приём и подготовить черновик протокола.',
];

/** No autonomous actions or case upload. Existing modules receive only the case ID on an explicit click. */
export function PhysicianTaskAssistant({caseId,caseClosed=false,onClinical}:{
 caseId?:string;caseClosed?:boolean;onClinical?:(task:string)=>void;
}){
 const {t,language}=useWorkspaceLanguage();
 const [text,setText]=useState('');
 const [request,setRequest]=useState('');
 const [integration,setIntegration]=useState<IntegrationSnapshot|null>(null);
 const [healthError,setHealthError]=useState(false);
 const plan=planPhysicianTask(request);

 useEffect(()=>{
  let live=true;
  fetch('/api/integrations',{cache:'no-store'}).then(async response=>{
   if(!response.ok)throw Error('status');
   return response.json() as Promise<IntegrationSnapshot>;
  }).then(value=>{if(live)setIntegration(value);}).catch(()=>{if(live)setHealthError(true);});
  return ()=>{live=false;};
 },[]);

 function availability(tool:PhysicianTool):{allowed:boolean;hint:string}{
  if(!integration)return {allowed:true,hint:healthError?'Статус подключения не получен; инструмент проверит его при открытии.':'Проверяем установленный модуль.'};
  if(tool==='radiology'){
   if(integration.radiology?.installed===false)return {allowed:false,hint:'Radiology пока не установлена в этой копии Doctor Opus.'};
   return {allowed:true,hint:integration.radiology?.running?'Radiology запущена.':'Radiology установлена; при открытии будет проверен запуск.'};
  }
  if(tool==='ambient'||tool==='protocol'){
   const edition=language==='ru'?'ru':'en',status=integration.protocol?.[edition];
   if(status?.installed===false)return {allowed:false,hint:'Выбранная языковая версия протокола не установлена.'};
   return {allowed:true,hint:status?.running?'Редактор протокола запущен.':'Редактор проверит локальное подключение при открытии.'};
  }
  if(tool==='ecg'&&integration.ecg?.available===false)
   return {allowed:true,hint:'ECGFounder пока недоступен; модуль отдельно покажет доступные варианты анализа изображения.'};
  return {allowed:true,hint:'Наличие инструмента не означает выполненного анализа; результат нужно проверить и сохранить.'};
 }
 function propose(value:string){setText(value);setRequest(value);}
 return <section aria-label={t('Помощник Doctor Opus')} style={{padding:'16px 18px',margin:'16px 0',background:'#f6faf7',border:'1px solid #bfd2c6',borderRadius:12}}>
  <h2 style={{marginTop:0}}>{t('Чем Doctor Opus может вам помочь?')}</h2>
  <p>{t('Опишите задачу словами. Я предложу последовательность уже существующих инструментов и объясню их назначение. Ничего не запускается автоматически.')}</p>
  {caseId?<p><small>{t('Выбран случай')} · {caseId.slice(0,8)}{caseClosed?' · '+t('Случай завершён, для новых результатов верните его в работу.'):''}</small></p>
   :<p><Link href="/workspace?new=1">{t('Создать случай, чтобы сохранить результаты')}</Link> · {t('Без случая результаты не будут связаны общей историей.')}</p>}
  <form onSubmit={event=>{event.preventDefault();setRequest(text.trim());}}>
   <label htmlFor="opus-physician-task">{t('Что требуется сделать?')}</label>
   <textarea id="opus-physician-task" rows={3} maxLength={4000} value={text} onChange={event=>setText(event.target.value)} placeholder={t('Например: есть КТ и ЭКГ, нужен комплексный разбор и протокол')} style={{display:'block',width:'100%',boxSizing:'border-box',margin:'6px 0 10px'}}/>
   <button type="submit">{t('Предложить план')}</button>
  </form>
  <details style={{marginTop:12}}><summary>{t('Примеры задач и возможности')}</summary><div style={{display:'flex',flexDirection:'column',alignItems:'start',gap:8,marginTop:8}}>
    {examples.map(example=><button type="button" key={example} onClick={()=>propose(example)}>{t(example)}</button>)}
    <button type="button" onClick={()=>propose('Что умеет Doctor Opus?')}>{t('Показать возможности Doctor Opus')}</button>
  </div></details>
  {request.trim()&&<section aria-label={t('План работы')} style={{marginTop:16}}>
   <h3>{t('Предлагаемый маршрут')}</h3>
   <p>{t(plan.message)}</p>
   {plan.steps.length>0&&<ol style={{paddingLeft:22}}>
    {plan.steps.map(step=>{
     const {allowed,hint}=availability(step.tool);
     const href=physicianTaskHref(step.tool,caseId,language);
     const isClinical=step.tool==='clinical';
     return <li key={step.tool} style={{marginBottom:14}}>
      <strong>{t(step.title)}</strong><p style={{margin:'5px 0'}}>{t(step.reason)}</p>
      <small>{t(hint)}</small><div style={{marginTop:6}}>
      {isClinical&&caseId&&onClinical?
       <button type="button" disabled={caseClosed} onClick={()=>onClinical(request)}>{t('Перенести задачу в разбор случая')}</button>:
       allowed?<Link href={href}>{t('Открыть инструмент для этого шага')}</Link>:
       <span role="status">{t('Инструмент недоступен в текущей установке.')}</span>}
      </div>
     </li>;
    })}
   </ol>}
   <p><small>{t('Маршрут построен без LLM и без передачи текста на сервер. В каждом модуле анализ, облачная передача и стоимость подтверждаются отдельно. Для сохранения результата используйте выбранный случай.')}</small></p>
  </section>}
 </section>;
}
