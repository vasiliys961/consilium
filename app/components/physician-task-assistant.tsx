'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {readCases,caseSignature} from '@/lib/casebook';
import {readVaultCaseById} from '@/lib/local-vault';
import {localCaseCommand,matchingLocalCases,copilotCaseContext,withoutCaseIdentity} from '@/lib/copilot-case-context';
import {copilotExecutablePlan,executeCopilotTask,type CopilotStepReceipt,type CopilotPendingResult} from '@/lib/copilot-execution';
import {prepareChatSend,reviewBeforeSending} from '@/lib/privacy-client';
import {copilotNeedsPrivacyReview} from '@/lib/copilot-privacy';
import {cleanChatText} from '@/lib/privacy-chat';
import {storeCopilotConsultDraft} from '@/lib/copilot-consult-handoff';
import type {PhysicianAgentResult} from '@/lib/physician-agent';
import {planPhysicianTask,physicianTaskHref,copilotRequestedOpen,physicianToolSteps,type PhysicianTool} from '@/lib/physician-task-router';
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

/** Existing navigation plus a bounded controller of existing clinical APIs. Copilot never diagnoses. */
export function PhysicianTaskAssistant({caseId,caseClosed=false,hasClinicalResult=false,onClinical,beforeExecute,onCaseSaved,onOpenCase}:{
 caseId?:string;caseClosed?:boolean;hasClinicalResult?:boolean;onOpenCase?:(id:string)=>Promise<void>;onClinical?:(task:string)=>void;beforeExecute?:()=>Promise<void>;onCaseSaved?:(id:string)=>Promise<void>;
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
 const [capabilitiesOpen,setCapabilitiesOpen]=useState(false);
 const [executionSteps,setExecutionSteps]=useState<CopilotStepReceipt[]>([]);
 const [executionBusy,setExecutionBusy]=useState(false);
 const [executionFinished,setExecutionFinished]=useState(false);
 const [pendingResult,setPendingResult]=useState<CopilotPendingResult|null>(null);
 const plannedContext=useRef<{caseId:string;signature:string}|null>(null);
 const [caseMatches,setCaseMatches]=useState<Array<{id:string;label:string}>>([]);
 const [integration,setIntegration]=useState<IntegrationSnapshot|null>(null);
 const [healthError,setHealthError]=useState(false);
 const [voiceAvailable,setVoiceAvailable]=useState(false);
 const [voiceListening,setVoiceListening]=useState(false);
 const [voiceError,setVoiceError]=useState('');
 const requestController=useRef<AbortController|null>(null);
 const voiceRef=useRef<VoiceRecognition|null>(null);

 const plan=planPhysicianTask(request);
 const requestedPlan=agentReply?.plan??plan;
 const executable=caseId?copilotExecutablePlan(requestedPlan,hasClinicalResult):null;
 const displayedPlan=executable?{...requestedPlan,steps:physicianToolSteps(executable)}:requestedPlan;
 const selectedSpecialty=suggestClinicalDestination(request);
 const workflow=copilotWorkflowMessage(language,displayedPlan,{
  specialty:displayedPlan.steps[0]?.tool==='specialist'?(selectedSpecialty?.label??'Терапия'):undefined,
  urgent:Boolean(selectedSpecialty?.urgentHint),
 });
 useEffect(()=>{
  if(typeof window==='undefined')return;
  try{setCopilotEnabled(window.localStorage.getItem(COPILOT_PREF)!=='no');}catch{}
  setPrefLoaded(true);
  const native=window as VoiceWindow;
  setVoiceAvailable(Boolean(native.SpeechRecognition||native.webkitSpeechRecognition));
 },[]);
 useEffect(()=>{
  requestController.current?.abort();requestController.current=null;
  voiceRef.current?.stop();voiceRef.current=null;
  setVoiceListening(false);
  setDialogue([]);setAgentReply(null);setText('');setRequest('');setAgentBusy(false);setAgentError('');setExecutionSteps([]);setExecutionBusy(false);setExecutionFinished(false);setCaseMatches([]);setCapabilitiesOpen(false);setPendingResult(null);plannedContext.current=null;
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
 function propose(value:string){const localized=ct(value);setText(localized);setRequest(localized);setAgentReply(null);setAgentError('');setExecutionFinished(false);plannedContext.current=null;}

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
  if(!utterance||agentBusy||executionBusy)return;
  setExecutionFinished(false);setExecutionSteps([]);plannedContext.current=null;
  setCaseMatches([]);
  const patient=localCaseCommand(utterance);
  if(patient!==null){
   const matches=matchingLocalCases(patient,await readCases());
   if(matches.length===1){if(onOpenCase)await onOpenCase(matches[0].id);else router.push('/workspace?case='+encodeURIComponent(matches[0].id));return;}
   setCaseMatches(matches.slice(0,8).map(value=>({id:value.id,label:value.privatePatient?.name||value.title||String(value.number??value.id.slice(0,8))})));
   setAgentError(matches.length?'Выберите случай':'Уточните имя или номер случая');return;
  }
  const direct=copilotRequestedOpen(utterance);
  if(direct){openTool(direct,utterance);return}
  const local=planPhysicianTask(utterance);
  // Clinical complaints go to actual specialists; capability questions are
  // free and immediate. Neither requires a separate paid navigation answer.
  if(local.intent==='help'||local.intent==='welcome'&&!local.steps.length||suggestClinicalDestination(utterance)&&!/(?:затем|потом|протокол|сравн|учти|then|protocol|compare)/i.test(utterance)){
   if(local.intent==='help')setCapabilitiesOpen(true);
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
   if(caseId)await beforeExecute?.();
   const current=caseId?await readVaultCaseById(caseId):null;
   if(current)plannedContext.current={caseId:current.id,signature:caseSignature(current)};
   const safeTranscript=current?withoutCaseIdentity(transcript,current):cleanChatText(transcript).text;
   const outgoing={text:safeTranscript+(current?'\n\n[CASE_CONTEXT]\n'+copilotCaseContext(current):''),locale:language,externalSearch:false};
   // For ordinary app navigation: silent LOCAL redaction + HMAC ticket, no pop-up.
   // For identifiers: use the existing full physician privacy review dialog.
   const reviewed=copilotNeedsPrivacyReview(cleanChatText(current?withoutCaseIdentity(utterance,current):utterance).text)
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
 async function executePlan(){
  if(!caseId||executionBusy||caseClosed||requestController.current)return;
  const controller=new AbortController();requestController.current=controller;
  setExecutionBusy(true);setAgentError('');setExecutionFinished(false);setExecutionSteps([]);
  try{
   await beforeExecute?.();
   const current=await readVaultCaseById(caseId);
   if(!current)throw Error('Случай не найден');
   if(plannedContext.current&&(plannedContext.current.caseId!==caseId||plannedContext.current.signature!==caseSignature(current)))throw Error('Данные случая изменились. Обновите план.');
   const steps=copilotExecutablePlan(displayedPlan,current.analyses[0]?.result.clinicalDraft==='generated'&&current.analyses[0]?.inputSignature===caseSignature(current));
   if(!steps)throw Error('Этот маршрут продолжите в профильном модуле.');
   await executeCopilotTask({caseId,signature:caseSignature(current),question:request,steps,locale:language,signal:controller.signal,
    onStep:receipt=>setExecutionSteps(previous=>[...previous.filter(value=>value.tool!==receipt.tool),receipt]),onPendingResult:setPendingResult});
   if(controller.signal.aborted)return;
   await onCaseSaved?.(caseId);setExecutionFinished(true);
  }catch(error){if(!controller.signal.aborted)setAgentError(error instanceof Error?error.message:'Задача не завершена');}
  finally{if(requestController.current===controller){requestController.current=null;setExecutionBusy(false);}}
 }
 function toggleCapabilities(){
  if(capabilitiesOpen){setCapabilitiesOpen(false);if(displayedPlan.intent==='help'){setRequest('');setAgentReply(null);}}
  else{setCapabilitiesOpen(true);propose('Что умеет Doctor Opus?');}
 }
 function resetDialogue(){
  requestController.current?.abort();requestController.current=null;
  setAgentBusy(false);setDialogue([]);setAgentReply(null);setAgentError('');setText('');setRequest('');
 }
 return <section id="doctor-opus-assistant" aria-label={ct('Opus Copilot — помощник врача')} style={{padding:'16px 18px',margin:'12px 0 20px',background:'#f6faf7',border:'1px solid #bfd2c6',borderRadius:12,scrollMarginTop:24}}>
  <h2 style={{marginTop:0}}>{ct('Opus Copilot')} <small style={{fontSize:13,fontWeight:400}}>{ct('Помощник по приложению')}</small></h2>
  <details style={{fontSize:12}}><summary>{ct('Настройки помощника')}</summary><button type="button" disabled={!prefLoaded||agentBusy||executionBusy} onClick={()=>enableCopilot(!copilotEnabled)}>{ct(copilotEnabled?'Отключить Copilot':'Включить помощника')}</button></details>
  {caseId&&<p style={{fontSize:12,color:'#56675d'}}>{ct('Выбран клинический случай')} · {caseId.slice(0,8)}{caseClosed?' · '+ct('Случай завершён'):''}</p>}
  <form onSubmit={submit} style={{marginTop:12}}>
   <label htmlFor="opus-physician-task">{ct('Что хотите сделать?')}</label>
   <textarea id="opus-physician-task" rows={2} maxLength={4000} value={text} disabled={agentBusy||executionBusy} onChange={event=>setText(event.target.value)} placeholder={ct('Например: покажи, где начать разбор случая')} style={{display:'block',width:'100%',boxSizing:'border-box',margin:'6px 0 10px'}}/>
   <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
    <button type="submit" disabled={agentBusy||executionBusy||!text.trim()}>{agentBusy?ct('Отвечает…'):copilotEnabled?ct('Спросить Copilot'):ct('Найти инструмент')}</button>
    {dialogue.length>0&&<button type="button" disabled={agentBusy||executionBusy} onClick={resetDialogue}>{ct('Новый разговор')}</button>}
    {voiceAvailable&&<button type="button" disabled={agentBusy||executionBusy} onClick={toggleVoice}>{voiceListening?ct('Остановить микрофон'):ct('Ввести голосом')}</button>}
   </div>
   {voiceError&&<p role="status" style={{fontSize:12,color:'#8a2b17'}}>{ct(voiceError)}</p>}
  </form>
  {agentBusy&&<p role="status" style={{fontSize:12,color:'#456a53'}}>{ct('Подбираю инструменты…')}</p>}
  {caseMatches.length>0&&<div>{caseMatches.map(value=><button type="button" key={value.id} onClick={()=>{if(onOpenCase)void onOpenCase(value.id);else router.push('/workspace?case='+encodeURIComponent(value.id));}}>{value.label}</button>)}</div>}
  {agentError&&<p role="alert" style={{fontSize:12,color:'#8a2b17'}}>{ct(agentError)} {ct('Маршрут доступен ниже.')}</p>}
  {dialogue.length>0&&<details style={{marginTop:10}}><summary>{ct('История разговора')} · {dialogue.length}</summary>
   <div style={{maxHeight:200,overflowY:'auto',padding:8}}>
    {dialogue.map((turn,index)=><p key={index} dir="auto" style={{whiteSpace:'pre-wrap',margin:'6px 0'}}><strong>{turn.role==='physician'?ct('Врач'):ct('Copilot')}:</strong> {turn.text}</p>)}
   </div>
  </details>}
  {pendingResult&&<details open><summary>{ct('Полученный результат ещё не сохранён')}</summary><p style={{whiteSpace:'pre-wrap'}}>{pendingResult.analysis?.result.draft.summary??pendingResult.document?.sections.map(section=>section.title+'\n'+section.text).join('\n\n')}</p></details>}
  {agentReply?.usedModel&&<details style={{marginTop:8,fontSize:12,color:'#52665b'}}><summary>{ct('Сведения о модели и расходах')}</summary>
   <p>{ct('Модель')}: {agentReply.model??'—'} · {ct(agentReply.billedUsd===undefined?'Расчётная стоимость':'По квитанции OpenRouter')}: {agentReply.billedUsd!==undefined?'$'+agentReply.billedUsd.toFixed(6):agentReply.estimatedUsd===null?ct('нет данных'):'$'+agentReply.estimatedUsd.toFixed(5)}.</p>
  </details>}
  <div aria-label={ct('Примеры задач и возможности')} style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:8,marginTop:14}}>
   <button type="button" aria-expanded={capabilitiesOpen} disabled={executionBusy||agentBusy} onClick={toggleCapabilities} style={{border:'1px solid #6c9981',background:'#e8f4ed',padding:'8px 12px',borderRadius:8,fontWeight:600}}>{ct('Показать возможности')}</button>
   <details><summary>{ct('Примеры задач')}</summary>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>{examples.map(example=><button type="button" key={example} disabled={executionBusy||agentBusy} onClick={()=>propose(example)}>{ct(example)}</button>)}</div>
   </details>
  </div>
  {(request.trim()||agentReply)&&(displayedPlan.intent!=='help'||capabilitiesOpen)&&<section id="opus-copilot-result" aria-label={ct('Предлагаемый маршрут')} aria-live="polite" style={{marginTop:12}}>
   {agentReply?.message?<p dir="auto" style={{whiteSpace:'pre-line'}}>{agentReply.message}</p>:<div>
      <p lang="en">{workflow.english}</p>
      {workflow.localized&&<p lang={language} dir="auto" style={{marginTop:4}}>{workflow.localized}</p>}
     </div>}
   {agentReply?.question&&<p dir="auto" style={{fontWeight:600}}>{agentReply.question}</p>}
   {caseId&&!caseClosed&&displayedPlan.intent==='route'&&copilotExecutablePlan(displayedPlan,hasClinicalResult)&&!agentReply?.question&&<div>
    <button type="button" disabled={agentBusy||executionBusy||executionFinished} onClick={()=>void executePlan()}>{ct(executionBusy?'Выполняем задачу…':executionFinished?'Результаты сохранены':'Выполнить план')}</button>
    {executionSteps.map(step=><p key={step.tool}>{copilotToolTitle(language,step.tool)} · {ct(step.status==='completed'?'Готово':'Выполняется…')}</p>)}
   </div>}
   {displayedPlan.steps.length>0&&(displayedPlan.intent==='help'
    ? <ul style={{margin:'10px 0',paddingLeft:20}}>
      {displayedPlan.steps.map(step=>{
       const {allowed,hint,visible}=availability(step.tool);
       return <li key={step.tool} style={{marginBottom:7}}>
        <button type="button" disabled={!allowed||executionBusy} title={hint} onClick={()=>openTool(step.tool,request)}
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
        <button type="button" disabled={!allowed||executionBusy} title={hint} onClick={()=>openTool(step.tool,request)}
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
