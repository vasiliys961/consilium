'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {prepareChatSend,reviewBeforeSending} from '@/lib/privacy-client';
import {copilotNeedsPrivacyReview} from '@/lib/copilot-privacy';
import {cleanChatText} from '@/lib/privacy-chat';
import {storeCopilotConsultDraft} from '@/lib/copilot-consult-handoff';
import type {PhysicianAgentResult} from '@/lib/physician-agent';
import {planPhysicianTask,physicianTaskHref,copilotRequestedOpen,type PhysicianTool} from '@/lib/physician-task-router';
import {useWorkspaceLanguage} from './workspace-language';

type IntegrationSnapshot={
 radiology?:{installed:boolean;running:boolean};
 ecg?:{available:boolean};
 protocol?:{ru?:{installed:boolean;running:boolean};en?:{installed:boolean;running:boolean}};
};
type VoiceResult={results:ArrayLike<ArrayLike<{transcript:string}>>};
type VoiceRecognition={
 lang:string;interimResults:boolean;continuous:boolean;
 onresult:((event:VoiceResult)=>void)|null;
 onerror:(()=>void)|null;onend:(()=>void)|null;
 start:()=>void;stop:()=>void;
};
type VoiceWindow=Window & {SpeechRecognition?:new()=>VoiceRecognition;webkitSpeechRecognition?:new()=>VoiceRecognition};
type DialogueTurn={role:'physician'|'assistant';text:string};

const COPILOT_PREF='doctor-opus-copilot-enabled-v1';
const examples=[
 'У пациента кашель и одышка. Куда перейти для разбора?',
 'Проверить взаимодействия лекарств и ограничения при сниженной СКФ.',
 'Записать приём и подготовить черновик протокола.',
];
const safeError=(code:string)=>{
 if(code==='busy')return 'Помощник занят. Повторите вопрос позже.';
 if(code==='privacy_review_required')return 'Проверьте передаваемые данные.';
 if(code==='key_not_configured')return 'В этой установке не настроен доступ к модели.';
 if(code==='payment_required')return 'Недостаточно средств или доступ к модели ограничен.';
 if(code==='provider_error')return 'Не удалось связаться с моделью.';
 if(code==='truncated'||code==='invalid_response')return 'Модель не смогла подготовить ответ.';
 return 'Помощник сейчас недоступен.';
};

/** Navigation only. Clinical inference, audio upload and case edits stay in their own modules. */
export function PhysicianTaskAssistant({caseId,caseClosed=false,onClinical}:{
 caseId?:string;caseClosed?:boolean;onClinical?:(task:string)=>void;
}){
 const {t,language}=useWorkspaceLanguage();
 const router=useRouter();
 const [text,setText]=useState('');
 const [request,setRequest]=useState('');
 const [agentReply,setAgentReply]=useState<PhysicianAgentResult|null>(null);
 const [dialogue,setDialogue]=useState<DialogueTurn[]>([]);
 const [agentBusy,setAgentBusy]=useState(false);
 const [agentError,setAgentError]=useState('');
 const [copilotEnabled,setCopilotEnabled]=useState(false);
 const [prefLoaded,setPrefLoaded]=useState(false);
 const [integration,setIntegration]=useState<IntegrationSnapshot|null>(null);
 const [healthError,setHealthError]=useState(false);
 const [voiceAvailable,setVoiceAvailable]=useState(false);
 const [voiceConsent,setVoiceConsent]=useState(false);
 const [voiceListening,setVoiceListening]=useState(false);
 const [voiceError,setVoiceError]=useState('');
 const requestController=useRef<AbortController|null>(null);
 const voiceRef=useRef<VoiceRecognition|null>(null);

 const plan=planPhysicianTask(request);
 const displayedPlan=agentReply?.plan??plan;
 useEffect(()=>{
  if(typeof window==='undefined')return;
  try{setCopilotEnabled(window.localStorage.getItem(COPILOT_PREF)==='yes');}catch{}
  setPrefLoaded(true);
  const native=window as VoiceWindow;
  setVoiceAvailable(Boolean(native.SpeechRecognition||native.webkitSpeechRecognition));
 },[]);
 useEffect(()=>{
  requestController.current?.abort();requestController.current=null;
  voiceRef.current?.stop();voiceRef.current=null;
  setVoiceListening(false);
  setDialogue([]);setAgentReply(null);setText('');setRequest('');setAgentBusy(false);setAgentError('');
 },[caseId]);
 useEffect(()=>()=>{requestController.current?.abort();voiceRef.current?.stop();},[]);
 useEffect(()=>{
  let active=true;
  fetch('/api/integrations',{cache:'no-store'}).then(response=>{
   if(!response.ok)throw Error('status');
   return response.json() as Promise<IntegrationSnapshot>;
  }).then(value=>{if(active)setIntegration(value)}).catch(()=>{if(active)setHealthError(true)});
  return()=>{active=false};
 },[]);

 function availability(tool:PhysicianTool):{allowed:boolean;hint:string}{
  if(!integration)return {allowed:true,hint:healthError?'Наличие инструмента будет проверено при открытии.':'Проверяем подключение.'};
  if(tool==='radiology'){
   if(integration.radiology?.installed===false)return {allowed:false,hint:'Radiology не установлена в этой копии.'};
   return {allowed:true,hint:integration.radiology?.running?'Radiology доступна.':'Проверим Radiology при открытии.'};
  }
  if(tool==='ambient'||tool==='protocol'){
   const edition=language==='ru'?'ru':'en';
   const status=integration.protocol?.[edition];
   if(status?.installed===false)return {allowed:false,hint:'Редактор протокола не установлен.'};
   return {allowed:true,hint:status?.running?'Редактор доступен.':'Проверим редактор при открытии.'};
  }
  if(tool==='ecg'&&integration.ecg?.available===false)
   return {allowed:true,hint:'Модуль ЭКГ покажет доступные варианты анализа.'};
  return {allowed:true,hint:''};
 }
 function enableCopilot(value:boolean){
  setCopilotEnabled(value);
  requestController.current?.abort();requestController.current=null;
  setAgentBusy(false);
  setAgentReply(null);
  setAgentError('');
  setDialogue([]);
  try{window.localStorage.setItem(COPILOT_PREF,value?'yes':'no')}catch{}
 }
 function propose(value:string){setText(value);setRequest(value);setAgentReply(null);setAgentError('');}

 function openTool(tool:PhysicianTool,question:string){
  const {allowed,hint}=availability(tool);
  if(!allowed){setAgentError(hint);return}
  if(tool==='specialist'){
   // A navigation command like "Открой специалиста" is not a clinical question.
   // Prefer the doctor's last actual question; never auto-send it to a model.
   const isOnlyCommand=copilotRequestedOpen(question)==='specialist';
   const lastQuestion=[...dialogue].reverse().find(turn=>turn.role==='physician'&&!copilotRequestedOpen(turn.text))?.text??'';
   const draft=isOnlyCommand?lastQuestion:question;
   if(draft.trim()&&!storeCopilotConsultDraft(draft)){
    setAgentError('Не удалось передать вопрос. Откройте специалиста и введите его вручную.');
    return;
   }
   router.push('/consult');return;
  }
  if(tool==='clinical'&&caseId&&onClinical){
   if(caseClosed){setAgentError('Случай завершён. Верните его в работу или создайте новый.');return}
   onClinical(question);return;
  }
  router.push(physicianTaskHref(tool,caseId,language));
 }
 function toggleVoice(){
  if(voiceListening){voiceRef.current?.stop();setVoiceListening(false);return}
  if(!voiceConsent){setVoiceError('Сначала разрешите голосовой ввод.');return}
  if(typeof window==='undefined')return;
  const browser=window as VoiceWindow;
  const Recognition=browser.SpeechRecognition||browser.webkitSpeechRecognition;
  if(!Recognition){setVoiceError('Этот браузер не поддерживает голосовой ввод.');return}
  const instance=new Recognition();
  instance.lang=language;instance.continuous=false;instance.interimResults=false;
  instance.onresult=event=>{
   const phrase=Array.from(event.results).map(result=>result[0]?.transcript??'').join(' ').trim();
   if(phrase)setText(previous=>previous?previous.trim()+' '+phrase:phrase);
  };
  instance.onerror=()=>{setVoiceListening(false);setVoiceError('Голос не распознан. Можно ввести вопрос текстом.');};
  instance.onend=()=>{setVoiceListening(false);voiceRef.current=null};
  voiceRef.current=instance;
  setVoiceError('');
  try{instance.start();setVoiceListening(true)}
  catch{setVoiceListening(false);voiceRef.current=null;setVoiceError('Микрофон недоступен.')}
 }

 async function askAi(){
  const utterance=text.trim();
  if(!utterance||agentBusy)return;
  const direct=copilotRequestedOpen(utterance);
  if(direct){openTool(direct,utterance);return}
  setAgentBusy(true);setAgentError('');
  const controller=new AbortController();
  requestController.current=controller;
  try{
   const turns:DialogueTurn[]=[...dialogue.slice(-14),{role:'physician',text:utterance}];
   // The model sees a bounded recent dialogue, never saved case files.
   const transcript=turns.map(turn=>
    '['+(turn.role==='physician'?'PHYSICIAN':'ASSISTANT')+']\n'+turn.text.slice(0,1000)).join('\n\n').slice(-7800);
   const outgoing={text:transcript,locale:language,externalSearch:false};
   // For ordinary app navigation: silent LOCAL redaction + HMAC ticket, no pop-up.
   // For identifiers: use the existing full physician privacy review dialog.
   const reviewed=copilotNeedsPrivacyReview(utterance)
    ?await reviewBeforeSending(outgoing)
    :await prepareChatSend(outgoing,controller.signal);
   if(controller.signal.aborted)return;
   const response=await fetch('/api/physician-agent',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({reviewed}),signal:controller.signal,
   });
   const value=await response.json().catch(()=>({}));
   if(!response.ok){
    setAgentError(safeError(String(value?.error??'agent_failed')));
    setRequest(utterance);setAgentReply(null);return;
   }
   if(typeof value?.message!=='string'||!value?.plan||!Array.isArray(value.plan.steps))
    throw Error('invalid_response');
   const answer=value as PhysicianAgentResult;
   if(!answer.usedModel)setAgentError(safeError(answer.warning??'model_unavailable'));
   const reply=[answer.message,answer.question].filter(Boolean).join('\n\n');
   // Retain only sanitized turns, so past identifiers do not trigger a new
   // review dialog on every unrelated follow-up.
   const safeTurns:DialogueTurn[]=[...dialogue.slice(-14),{role:'physician',text:cleanChatText(utterance).text}];
   setDialogue([...safeTurns,{role:'assistant' as const,text:cleanChatText(reply).text}].slice(-14));
   setAgentReply(answer);setRequest(utterance);setText('');
  }catch(error){
   if(!controller.signal.aborted){
    setAgentError(error instanceof Error&&error.message==='invalid_response'
     ?'Модель вернула некорректный ответ. Можно выбрать инструмент вручную.'
     :'Вопрос не отправлен. Можно воспользоваться списком возможностей.');
    setRequest(utterance);setAgentReply(null);
   }
  }finally{
   if(requestController.current===controller){requestController.current=null;setAgentBusy(false)}
  }
 }

 function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const phrase=text.trim();
  if(!phrase)return;
  if(copilotEnabled){void askAi();return}
  const direct=copilotRequestedOpen(phrase);
  if(direct){openTool(direct,phrase);return}
  setRequest(phrase);setAgentReply(null);setAgentError('');
 }
 function resetDialogue(){
  requestController.current?.abort();requestController.current=null;
  setAgentBusy(false);setDialogue([]);setAgentReply(null);setAgentError('');setText('');setRequest('');
 }
 return <section id="doctor-opus-assistant" aria-label={t('Opus Copilot — помощник врача')} style={{padding:'16px 18px',margin:'12px 0 20px',background:'#f6faf7',border:'1px solid #bfd2c6',borderRadius:12,scrollMarginTop:24}}>
  <h2 style={{marginTop:0}}>{t('Opus Copilot')} <small style={{fontSize:13,fontWeight:400}}>{t('Помощник по приложению')}</small></h2>
  {!copilotEnabled?<div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
   <p style={{margin:'5px 0'}}><strong>{t('Нужен Opus Copilot?')}</strong> {t('Подскажет, куда перейти и как выполнить задачу. Короткий ответ обычно стоит доли цента.')}</p>
   <button type="button" disabled={!prefLoaded} onClick={()=>enableCopilot(true)}>{t('Включить помощника')}</button>
   <span style={{fontSize:12,color:'#56675d'}}>{t('Необязательно. Приложение работает и без него.')}</span>
  </div>:<div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
   <span role="status" style={{fontSize:13}}>{t('Opus Copilot включён — вопросы обрабатываются через внешнюю ИИ-модель.')}</span>
   <button type="button" onClick={()=>enableCopilot(false)} disabled={agentBusy}>{t('Отключить Copilot')}</button>
  </div>}
  {caseId&&<p style={{fontSize:12,color:'#56675d'}}>{t('Выбран клинический случай')} · {caseId.slice(0,8)}{caseClosed?' · '+t('Случай завершён'):''}</p>}
  <form onSubmit={submit} style={{marginTop:12}}>
   <label htmlFor="opus-physician-task">{t('Что хотите сделать?')}</label>
   <textarea id="opus-physician-task" rows={2} maxLength={4000} value={text} disabled={agentBusy} onChange={event=>setText(event.target.value)} placeholder={t('Например: покажи, где начать разбор случая')} style={{display:'block',width:'100%',boxSizing:'border-box',margin:'6px 0 10px'}}/>
   <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
    <button type="submit" disabled={agentBusy||!text.trim()}>{agentBusy?t('Отвечает…'):copilotEnabled?t('Спросить Copilot'):t('Найти инструмент')}</button>
    {dialogue.length>0&&<button type="button" disabled={agentBusy} onClick={resetDialogue}>{t('Новый разговор')}</button>}
    {voiceAvailable&&<button type="button" disabled={agentBusy} onClick={toggleVoice}>{voiceListening?t('Остановить микрофон'):t('Ввести голосом')}</button>}
   </div>
   {voiceAvailable&&<label style={{display:'flex',alignItems:'start',gap:6,fontSize:12,marginTop:8}}>
    <input type="checkbox" checked={voiceConsent} onChange={event=>{setVoiceConsent(event.target.checked);if(!event.target.checked)voiceRef.current?.stop()}}/>
    {t('Разрешаю голосовой ввод. Распознавание может выполняться службой браузера. Вопрос перед отправкой можно исправить.')}
   </label>}
   {voiceError&&<p role="status" style={{fontSize:12,color:'#8a2b17'}}>{t(voiceError)}</p>}
  </form>
  {agentError&&<p role="status" style={{fontSize:12,color:'#8a2b17'}}>{t(agentError)} {t('Вы можете открыть нужный модуль ниже.')}</p>}
  {dialogue.length>0&&<details style={{marginTop:10}}><summary>{t('История разговора')} · {dialogue.length}</summary>
   <div style={{maxHeight:200,overflowY:'auto',padding:8}}>
    {dialogue.map((turn,index)=><p key={index} dir="auto" style={{whiteSpace:'pre-wrap',margin:'6px 0'}}><strong>{turn.role==='physician'?t('Врач'):t('Copilot')}:</strong> {turn.text}</p>)}
   </div>
  </details>}
  {agentReply?.usedModel&&<details style={{marginTop:8,fontSize:12,color:'#52665b'}}><summary>{t('Сведения о модели и расходах')}</summary>
   <p>{t('Модель')}: {agentReply.model??'—'} · {t('Расчётная стоимость')}: {agentReply.estimatedUsd===null?t('нет данных'):'$'+agentReply.estimatedUsd.toFixed(5)}.</p>
  </details>}
  <div aria-label={t('Примеры задач и возможности')} style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:8,marginTop:14}}>
   <button type="button" onClick={()=>propose('Что умеет Doctor Opus?')} style={{border:'1px solid #6c9981',background:'#e8f4ed',padding:'8px 12px',borderRadius:8,fontWeight:600}}>{t('Показать возможности')}</button>
   <details><summary>{t('Примеры задач')}</summary>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>{examples.map(example=><button type="button" key={example} onClick={()=>propose(example)}>{t(example)}</button>)}</div>
   </details>
  </div>
  {(request.trim()||agentReply)&&<section aria-label={t('Предлагаемый маршрут')} style={{marginTop:12}}>
   {agentReply?.message?<p dir="auto">{agentReply.message}</p>:<p>{t(displayedPlan.message)}</p>}
   {agentReply?.question&&<p dir="auto" style={{fontWeight:600}}>{agentReply.question}</p>}
   {displayedPlan.steps.length>0&&(displayedPlan.intent==='help'
    ? <ul style={{margin:'10px 0',paddingLeft:20}}>
      {displayedPlan.steps.map(step=>{
       const {allowed,hint}=availability(step.tool);
       return <li key={step.tool} style={{marginBottom:7}}>
        <button type="button" disabled={!allowed} title={hint} onClick={()=>openTool(step.tool,request)}
         style={{border:'1px solid #9bb6a7',borderRadius:6,padding:'4px 8px',background:'#fff',marginRight:8}}>
         {t(step.title)}</button>
        <span style={{fontSize:13}}>{t(step.reason)}</span>
       </li>;
      })}
     </ul>
    : <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      {displayedPlan.steps.map(step=>{
       const {allowed,hint}=availability(step.tool);
       return <button key={step.tool} type="button" disabled={!allowed} title={hint} onClick={()=>openTool(step.tool,request)}
        style={{padding:'8px 12px',borderRadius:8,border:'1px solid #9bb6a7',background:'#fff'}}>
        {t(step.title)}
       </button>;
      })}
     </div>
   )}
   {displayedPlan.steps.some(step=>step.tool==='clinical')&&<button type="button" onClick={()=>openTool('specialist',request)}
      style={{marginTop:8,border:'1px solid #9bb6a7',padding:'7px 10px',borderRadius:8}}>
      {t('Обсудить со специалистом')}
   </button>}
  </section>}
 </section>;
}
