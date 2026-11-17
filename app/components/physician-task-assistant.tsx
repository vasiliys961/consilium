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
import {suggestClinicalDestination} from '@/lib/copilot-clinical-routing';
import {copilotText,copilotToolTitle,copilotToolReason,copilotWorkflowMessage} from '@/lib/copilot-i18n';
import {useWorkspaceLanguage} from './workspace-language';
import {copilotModuleReadiness,type CopilotIntegrationSnapshot as IntegrationSnapshot} from '@/lib/copilot-module-readiness';

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
 const {language}=useWorkspaceLanguage();
  const ct=(value:string)=>copilotText(language,value);
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
 const selectedSpecialty=suggestClinicalDestination(request);
 const workflow=copilotWorkflowMessage(language,displayedPlan,{
  specialty:displayedPlan.steps[0]?.tool==='specialist'?(selectedSpecialty?.label??'Терапия'):undefined,
  urgent:Boolean(selectedSpecialty?.urgentHint),
 });
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
 // Health checks can start child dev servers and cause latency on an 8 GB Mac.
 // Defer them until the physician actually requests a route.
 const routeRequested=Boolean(request.trim());
 useEffect(()=>{
  if(!routeRequested)return;
  let active=true;
  const controller=new AbortController();
  const timer=setTimeout(()=>{
   fetch('/api/integrations',{cache:'no-store',signal:controller.signal}).then(response=>{
    if(!response.ok)throw Error('status');
    return response.json() as Promise<IntegrationSnapshot>;
   }).then(value=>{if(active){setIntegration(value);setHealthError(false)}})
    .catch(()=>{if(active&&!controller.signal.aborted){setIntegration(null);setHealthError(true)}});
  },250);
  return()=>{active=false;clearTimeout(timer);controller.abort()};
 },[request]);
 useEffect(()=>{
  if(request.trim())requestAnimationFrame(()=>
   document.getElementById('opus-copilot-result')?.scrollIntoView({block:'nearest',behavior:'smooth'}));
 },[request]);

 function availability(tool:PhysicianTool):{allowed:boolean;hint:string;visible:boolean}{
  const status=copilotModuleReadiness(tool,language,integration,healthError);
  return {allowed:status.allowed,hint:status.text,visible:status.visible};
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
 function propose(value:string){const localized=ct(value);setText(localized);setRequest(localized);setAgentReply(null);setAgentError('');}

 function openTool(tool:PhysicianTool,question:string,manualSpecialist=false){
  const {allowed,hint}=availability(tool);
  if(!allowed){setAgentError(hint);return}
  if(tool==='specialist'){
   // A navigation command like "Открой специалиста" is not a clinical question.
   // Prefer the doctor's last actual question; never auto-send it to a model.
   const isOnlyCommand=copilotRequestedOpen(question)==='specialist';
   const lastQuestion=[...dialogue].reverse().find(turn=>turn.role==='physician'&&!copilotRequestedOpen(turn.text))?.text
    ??(!copilotRequestedOpen(request)?request:'');
   const draft=isOnlyCommand?lastQuestion:question;
   const target=manualSpecialist?null:suggestClinicalDestination(draft);
   if(draft.trim()&&!storeCopilotConsultDraft(draft,Date.now(),{specialty:target?.specialty,caseId})){
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
  const local=planPhysicianTask(utterance);
  // Clinical complaints go to actual specialists; capability questions are
  // free and immediate. Neither requires a separate paid navigation answer.
  if(local.intent==='help'||suggestClinicalDestination(utterance)){
   setRequest(utterance);setAgentReply(null);setAgentError('');setText('');
   return;
  }
  // Show a useful route immediately, even when the provider is slow or fails.
  setRequest(utterance);setAgentReply(null);
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
 return <section id="doctor-opus-assistant" aria-label={ct('Opus Copilot — помощник врача')} style={{padding:'16px 18px',margin:'12px 0 20px',background:'#f6faf7',border:'1px solid #bfd2c6',borderRadius:12,scrollMarginTop:24}}>
  <h2 style={{marginTop:0}}>{ct('Opus Copilot')} <small style={{fontSize:13,fontWeight:400}}>{ct('Помощник по приложению')}</small></h2>
  {!copilotEnabled?<div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
   <p style={{margin:'5px 0'}}><strong>{ct('Нужен Opus Copilot?')}</strong> {ct('Подскажет, куда перейти и как выполнить задачу. Короткий ответ обычно стоит доли цента.')}</p>
   <button type="button" disabled={!prefLoaded} onClick={()=>enableCopilot(true)}>{ct('Включить помощника')}</button>
   <span style={{fontSize:12,color:'#56675d'}}>{ct('Необязательно. Приложение работает и без него.')}</span>
  </div>:<div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
   <span role="status" style={{fontSize:13}}>{ct('Opus Copilot включён — вопросы обрабатываются через внешнюю ИИ-модель.')}</span>
   <button type="button" onClick={()=>enableCopilot(false)} disabled={agentBusy}>{ct('Отключить Copilot')}</button>
  </div>}
  {caseId&&<p style={{fontSize:12,color:'#56675d'}}>{ct('Выбран клинический случай')} · {caseId.slice(0,8)}{caseClosed?' · '+ct('Случай завершён'):''}</p>}
  <form onSubmit={submit} style={{marginTop:12}}>
   <label htmlFor="opus-physician-task">{ct('Что хотите сделать?')}</label>
   <textarea id="opus-physician-task" rows={2} maxLength={4000} value={text} disabled={agentBusy} onChange={event=>setText(event.target.value)} placeholder={ct('Например: покажи, где начать разбор случая')} style={{display:'block',width:'100%',boxSizing:'border-box',margin:'6px 0 10px'}}/>
   <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
    <button type="submit" disabled={agentBusy||!text.trim()}>{agentBusy?ct('Отвечает…'):copilotEnabled?ct('Спросить Copilot'):ct('Найти инструмент')}</button>
    {dialogue.length>0&&<button type="button" disabled={agentBusy} onClick={resetDialogue}>{ct('Новый разговор')}</button>}
    {voiceAvailable&&<button type="button" disabled={agentBusy} onClick={toggleVoice}>{voiceListening?ct('Остановить микрофон'):ct('Ввести голосом')}</button>}
   </div>
   {voiceAvailable&&<label style={{display:'flex',alignItems:'start',gap:6,fontSize:12,marginTop:8}}>
    <input type="checkbox" checked={voiceConsent} onChange={event=>{setVoiceConsent(event.target.checked);if(!event.target.checked)voiceRef.current?.stop()}}/>
    {ct('Разрешаю голосовой ввод. Распознавание может выполняться службой браузера. Вопрос перед отправкой можно исправить.')}
   </label>}
   {voiceError&&<p role="status" style={{fontSize:12,color:'#8a2b17'}}>{ct(voiceError)}</p>}
  </form>
  {agentBusy&&<p role="status" style={{fontSize:12,color:'#456a53'}}>{ct('Подбираю инструменты…')}</p>}
  {agentError&&<p role="alert" style={{fontSize:12,color:'#8a2b17'}}>{ct(agentError)} {ct('Маршрут доступен ниже.')}</p>}
  {dialogue.length>0&&<details style={{marginTop:10}}><summary>{ct('История разговора')} · {dialogue.length}</summary>
   <div style={{maxHeight:200,overflowY:'auto',padding:8}}>
    {dialogue.map((turn,index)=><p key={index} dir="auto" style={{whiteSpace:'pre-wrap',margin:'6px 0'}}><strong>{turn.role==='physician'?ct('Врач'):ct('Copilot')}:</strong> {turn.text}</p>)}
   </div>
  </details>}
  {agentReply?.usedModel&&<details style={{marginTop:8,fontSize:12,color:'#52665b'}}><summary>{ct('Сведения о модели и расходах')}</summary>
   <p>{ct('Модель')}: {agentReply.model??'—'} · {ct('Расчётная стоимость')}: {agentReply.estimatedUsd===null?ct('нет данных'):'$'+agentReply.estimatedUsd.toFixed(5)}.</p>
  </details>}
  <div aria-label={ct('Примеры задач и возможности')} style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:8,marginTop:14}}>
   <button type="button" onClick={()=>propose('Что умеет Doctor Opus?')} style={{border:'1px solid #6c9981',background:'#e8f4ed',padding:'8px 12px',borderRadius:8,fontWeight:600}}>{ct('Показать возможности')}</button>
   <details><summary>{ct('Примеры задач')}</summary>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>{examples.map(example=><button type="button" key={example} onClick={()=>propose(example)}>{ct(example)}</button>)}</div>
   </details>
  </div>
  {(request.trim()||agentReply)&&<section id="opus-copilot-result" aria-label={ct('Предлагаемый маршрут')} aria-live="polite" style={{marginTop:12}}>
   {agentReply?.message?<p dir="auto" style={{whiteSpace:'pre-line'}}>{agentReply.message}</p>:<div>
      <p lang="en">{workflow.english}</p>
      {workflow.localized&&<p lang={language} dir="auto" style={{marginTop:4}}>{workflow.localized}</p>}
     </div>}
   {agentReply?.question&&<p dir="auto" style={{fontWeight:600}}>{agentReply.question}</p>}
   {displayedPlan.steps.length>0&&(displayedPlan.intent==='help'
    ? <ul style={{margin:'10px 0',paddingLeft:20}}>
      {displayedPlan.steps.map(step=>{
       const {allowed,hint,visible}=availability(step.tool);
       return <li key={step.tool} style={{marginBottom:7}}>
        <button type="button" disabled={!allowed} title={hint} onClick={()=>openTool(step.tool,request)}
         style={{border:'1px solid #9bb6a7',borderRadius:6,padding:'4px 8px',background:'#fff',marginRight:8}}>
         {copilotToolTitle(language,step.tool)}{step.tool==='specialist'&&suggestClinicalDestination(request)?' · '+ct(suggestClinicalDestination(request)!.label):''}</button>
        <span style={{fontSize:13}}>{copilotToolReason(language,step.tool)}</span>
        {visible&&<small style={{display:'block',color:allowed?'#56675d':'#8a2b17',marginTop:3}}>{hint}</small>}
       </li>;
      })}
     </ul>
    : <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      {displayedPlan.steps.map(step=>{
       const {allowed,hint,visible}=availability(step.tool);
       return <span key={step.tool} style={{display:'inline-flex',flexDirection:'column',gap:3,maxWidth:250}}>
        <button type="button" disabled={!allowed} title={hint} onClick={()=>openTool(step.tool,request)}
         style={{padding:'8px 12px',borderRadius:8,border:'1px solid #9bb6a7',background:'#fff'}}>
         {copilotToolTitle(language,step.tool)}{step.tool==='specialist'&&suggestClinicalDestination(request)?' · '+ct(suggestClinicalDestination(request)!.label):''}
        </button>
        {visible&&<small style={{fontSize:11,color:allowed?'#56675d':'#8a2b17'}}>{hint}</small>}
       </span>;
      })}
     </div>
   )}
   {displayedPlan.steps.some(step=>step.tool==='clinical')&&!displayedPlan.steps.some(step=>step.tool==='specialist')&&<button type="button" onClick={()=>openTool('specialist',request)}
      style={{marginTop:8,border:'1px solid #9bb6a7',padding:'7px 10px',borderRadius:8}}>
      {ct('Обсудить со специалистом')}
   </button>}
   {displayedPlan.steps.some(step=>step.tool==='specialist')&&displayedPlan.intent!=='help'&&
    <button type="button" onClick={()=>openTool('specialist',request,true)}
      style={{marginTop:8,marginLeft:8,border:'1px solid #9bb6a7',padding:'7px 10px',borderRadius:8,background:'#fff'}}>
      {ct('Выбрать специальность самостоятельно')}
    </button>}
  </section>}
 </section>;
}
