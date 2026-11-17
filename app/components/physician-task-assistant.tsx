'use client';
import {useEffect,useRef,useState} from 'react';
import {reviewBeforeSending,prepareChatSend} from '@/lib/privacy-client';
import {copilotNeedsPrivacyReview} from '@/lib/copilot-privacy';
import type {PhysicianAgentResult} from '@/lib/physician-agent';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {planPhysicianTask,physicianTaskHref,copilotRequestedOpen,type PhysicianTool} from '@/lib/physician-task-router';
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
 const router=useRouter();
 const [text,setText]=useState('');
 const [request,setRequest]=useState('');
 const [agentReply,setAgentReply]=useState<PhysicianAgentResult|null>(null);
 const [dialogue,setDialogue]=useState<Array<{role:'physician'|'assistant';text:string}>>([]);
 const [agentBusy,setAgentBusy]=useState(false);
 const [agentError,setAgentError]=useState('');
 const requestController=useRef<AbortController|null>(null);
 const [integration,setIntegration]=useState<IntegrationSnapshot|null>(null);
 const [healthError,setHealthError]=useState(false);
 const plan=planPhysicianTask(request);
 const displayedPlan=agentReply?.plan??plan;
 useEffect(()=>{
  requestController.current?.abort();requestController.current=null;
  setDialogue([]);setAgentReply(null);setRequest('');setText('');setAgentBusy(false);setAgentError('');
 },[caseId]);
 useEffect(()=>()=>requestController.current?.abort(),[]);

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
 function propose(value:string){setText(value);setRequest(value);setAgentReply(null);setAgentError('');}
 async function askAi(){
  const utterance=text.trim();
  if(!utterance||agentBusy)return;
  // A catalogue question and explicit "open module" instruction are both
  // local navigation tasks. Do not spend API credits or ask for consent.
  const local=planPhysicianTask(utterance);
  if(local.intent==='help'){
   setRequest(utterance);setAgentReply(null);setAgentError('');setText('');
   return;
  }
  const openTool=copilotRequestedOpen(utterance);
  if(openTool){
   const {allowed}=availability(openTool);
   if(allowed){
    router.push(physicianTaskHref(openTool,caseId,language));
    return;
   }
   setRequest(utterance);setAgentReply(null);setAgentError('');setText('');
   return;
  }
  setAgentBusy(true);setAgentError('');
  const controller=new AbortController();requestController.current=controller;
  try{
   // Show the native physician privacy review BEFORE any external model call.
   // No patient files or saved case are read; only the manually entered conversation.
   const turns=[...dialogue.slice(-4),{role:'physician' as const,text:utterance}];
   const transcript=turns.map(turn=>
    `[${turn.role==='physician'?'PHYSICIAN':'ASSISTANT'}]\n${turn.text.slice(0,1100)}`).join('\n\n').slice(-7600);
   // Identifiers trigger the full review. Anonymous questions get local
   // redaction and short-lived signed approval, without a repeated modal.
   const reviewed=copilotNeedsPrivacyReview(transcript)
    ? await reviewBeforeSending({text:transcript,locale:language,externalSearch:false})
    : await prepareChatSend({text:transcript,locale:language,externalSearch:false},controller.signal);
   if(controller.signal.aborted)return;
   const response=await fetch('/api/physician-agent',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({reviewed}),signal:controller.signal,
   });
   const value=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(
    response.status===429?'Повторите немного позже.':
    response.status===428?'Этот текст нужно проверить перед отправкой.':
    'Ответ пока не получен. Ниже — доступный маршрут.'
   );
   if(typeof value?.message!=='string'||!value?.plan||!Array.isArray(value.plan.steps))
    throw Error('Не удалось получить корректный ответ помощника.');
   const answer=value as PhysicianAgentResult;
   const responseText=[answer.message,answer.question].filter(Boolean).join('\n\n');
   setDialogue([...turns,{role:'assistant' as const,text:responseText}].slice(-6));
   setAgentReply(answer);setRequest(utterance);setText('');
  }catch(error){
   if(!controller.signal.aborted){
    setAgentError(error instanceof Error?error.message:'Ответ пока не получен.');
    setRequest(utterance);setAgentReply(null);
   }
  }finally{if(requestController.current===controller){requestController.current=null;setAgentBusy(false);}}
 }
 function resetAi(){requestController.current?.abort();setDialogue([]);setAgentReply(null);setAgentError('');setText('');setRequest('');}
 return <section id="doctor-opus-assistant" aria-label={t('Opus Copilot — помощник врача')} style={{padding:'22px 24px',margin:'12px 0 20px',background:'#f6faf7',border:'1px solid #bfd2c6',borderRadius:12,scrollMarginTop:24}}>
  <h2 style={{marginTop:0}}>{t('Opus Copilot')} <small style={{fontWeight:400,fontSize:13}}>{t('Помощник врача')}</small></h2>
  <p>{t('Опишите задачу. Подскажу следующий шаг и помогу открыть нужный инструмент.')}</p>
  {caseId?<p><small>{t('Выбран случай')} · {caseId.slice(0,8)}{caseClosed?' · '+t('Случай завершён, для новых результатов верните его в работу.'):''}</small></p>
   :<p><Link href="/workspace?new=1">{t('Создать случай, чтобы сохранить результаты')}</Link> · {t('Для сохранения результата нужен случай.')}</p>}
  <form onSubmit={event=>{event.preventDefault();if(text.trim()){setRequest(text.trim());setAgentReply(null);setAgentError('');}}}>
   <label htmlFor="opus-physician-task">{t('Что требуется сделать?')}</label>
   <textarea id="opus-physician-task" rows={3} maxLength={4000} value={text} disabled={agentBusy} onChange={event=>setText(event.target.value)} placeholder={t('Например: есть КТ и ЭКГ, нужен комплексный разбор и протокол')} style={{display:'block',width:'100%',boxSizing:'border-box',margin:'6px 0 10px'}}/>
   <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
    <button type="submit" disabled={agentBusy||!text.trim()}>{t('Предложить шаги')}</button>
    <button type="button" disabled={agentBusy||!text.trim()} onClick={()=>void askAi()} style={{background:'#174a35',color:'#fff',borderRadius:8,padding:'8px 12px'}}>
     {agentBusy?t('Opus Copilot готовит ответ…'):t('Спросить Opus Copilot')}
    </button>
    {dialogue.length>0&&<button type="button" disabled={agentBusy} onClick={resetAi}>{t('Новый разговор')}</button>}
   </div>
   <p style={{fontSize:12,marginTop:8,color:'#52665b'}}>{t('Вопросы без идентификаторов обрабатываются без дополнительного окна. При персональных данных предложу их проверить. Для диалога используется внешний ИИ; файлы случая не загружаются.')}</p>
  </form>
  {dialogue.length>0&&<section aria-label={t('Диалог с Opus Copilot')} aria-live="polite" style={{margin:'14px 0',maxHeight:280,overflowY:'auto',background:'#fff',border:'1px solid #cbd8d0',borderRadius:9,padding:12}}>
    {dialogue.map((turn,index)=><p key={index} style={{whiteSpace:'pre-wrap',margin:'8px 0'}}><strong>{turn.role==='physician'?t('Врач'):t('Opus Copilot')}:</strong> {turn.text}</p>)}
  </section>}
  {agentError&&<p role="alert" style={{color:'#8a2b17'}}>{t(agentError)}</p>}
  {agentReply&&<details style={{fontSize:12,color:'#52665b',marginTop:10}}>
    <summary>{t('Сведения о работе помощника')}</summary>
    {agentReply.usedModel
      ? <p>{t('Модель')}: {agentReply.model??t('Не указана')} · {agentReply.estimatedUsd!==null?t('Оценка стоимости')+': $'+agentReply.estimatedUsd.toFixed(5):t('Стоимость неизвестна')}</p>
      : <p>{t('Маршрут составлен локально.')}{agentReply.warning==='key_not_configured'?t(' В этой копии Preview нет доступного ключа ИИ.'):agentReply.warning?' '+t('Модель не дала корректный ответ.'):''}</p>}
  </details>}
  <div aria-label={t('Примеры задач и возможности')} style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:8,marginTop:14}}>
    <strong style={{width:'100%',fontSize:14}}>{t('С чего начать?')}</strong>
    {examples.map(example=><button type="button" key={example} onClick={()=>propose(example)} style={{textAlign:'left',border:'1px solid #b0c8b9',background:'#fff',padding:'8px 12px',borderRadius:8}}>{t(example)}</button>)}
    <button type="button" onClick={()=>propose('Что умеет Doctor Opus?')} style={{border:'1px solid #6c9981',background:'#e8f4ed',padding:'8px 12px',borderRadius:8}}>{t('Показать все возможности')}</button>
  </div>
  {(request.trim()||agentReply)&&<section aria-label={t('План работы')} style={{marginTop:16}}>
   <h3>{t('Предлагаемый маршрут')}</h3>
   {!agentReply&&<p>{t(plan.message)}</p>}
   {displayedPlan.steps.length>0&&<ol style={{paddingLeft:22}}>
    {displayedPlan.steps.map(step=>{
     const {allowed,hint}=availability(step.tool);
     const href=physicianTaskHref(step.tool,caseId,language);
     const isClinical=step.tool==='clinical';
     return <li key={step.tool} style={{marginBottom:14}}>
      <strong>{t(step.title)}</strong><div style={{marginTop:6}}>
      {isClinical&&caseId&&onClinical?
       <button type="button" disabled={caseClosed} onClick={()=>onClinical(request)}>{t('Передать задачу')}</button>:
       allowed?<Link href={href}>{t('Открыть')}</Link>:
       <span role="status">{t('Пока недоступен')}</span>}
      </div>
      <details style={{fontSize:12,marginTop:5}}><summary>{t('Подробнее')}</summary><p>{t(step.reason)}</p><p>{t(hint)}</p></details>
     </li>;
    })}
   </ol>}
 
  </section>}
 </section>;
}
