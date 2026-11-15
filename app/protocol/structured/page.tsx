'use client';

import Link from 'next/link';
import {useEffect,useState} from 'react';
import {requestStreamedJson,type AnalysisProgressEvent} from '@/lib/analysis-stream';
import {AnalysisProgress} from '@/app/components/analysis-progress';
import {readCases,persistCase,caseContext,type ClinicalCase} from '@/lib/casebook';
import {PROTOCOL_KINDS,protocolText,type ProtocolDocument,type ProtocolKind,type ProtocolPresentation} from '@/packages/protocol/document';
import type {ProtocolGenerationMode} from '@/packages/protocol/generate';
import {completedProtocolSourceId,savedStructuredProtocol} from '@/lib/protocol-two-mode';
import {completedClinicalEvidence,originalClinicalDocument,independentProtocolSource} from '@/lib/protocol-print';
import {protocolLanguagePlan} from '@/lib/protocol-language-flow';
import {WORKSPACE_LANGUAGES,type WorkspaceLanguage} from '@/lib/workspace-i18n';
import {downloadDocx} from '@/lib/download-docx';
import {useWorkspaceLanguage} from '@/app/components/workspace-language';

export default function ProtocolModule(){
 const {t,language}=useWorkspaceLanguage();
 const [progress,setProgress]=useState<AnalysisProgressEvent[]>([]);
 const [preview,setPreview]=useState('');
 const [cases,setCases]=useState<ClinicalCase[]>([]);
 const [id,setId]=useState('');
 const [kind,setKind]=useState<ProtocolKind>('encounter');
 const [locale,setLocale]=useState<WorkspaceLanguage>('ru');
 const [plannedLanguages,setPlannedLanguages]=useState<WorkspaceLanguage[]>([]);
 const [mode,setMode]=useState<Exclude<ProtocolGenerationMode,'from-protocol'>>('standalone');
 const [presentation,setPresentation]=useState<ProtocolPresentation>('formal');
 const [source,setSource]=useState('');
 const [document,setDocument]=useState<ProtocolDocument|null>(null);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [cost,setCost]=useState<number|null>(null);
 const [usageComplete,setUsageComplete]=useState(true);
 const current=cases.find(item=>item.id===id);
 const completedId=completedProtocolSourceId(current?.analyses);
 const canFormat=Boolean(completedId);
 const independent=current?independentProtocolSource(current,kind):undefined;
 const usingSavedSol=mode==='standalone'&&presentation!=='original-analysis'&&Boolean(independent)&&(independent?.locale!==locale||(independent?.presentation??'formal')!==presentation);
 const model=presentation==='original-analysis'?'Без модели':mode==='from-analysis'||usingSavedSol?'Gemini Flash':'GPT-6.1 Sol';
 const ui=(ru:string,en:string)=>language==='ru'?ru:en;

 useEffect(()=>{
  const params=new URLSearchParams(location.search);
  const choices=protocolLanguagePlan(params);
  const requested=WORKSPACE_LANGUAGES.find(value=>value.code===params.get('locale'))?.code;
  let preferred:WorkspaceLanguage=requested??'ru';
  if(!requested&&!params.has('locale'))try{
   const saved=localStorage.getItem('concilium-answer-language');
   preferred=WORKSPACE_LANGUAGES.find(value=>value.code===saved)?.code??'ru';
  }catch{}
  setLocale(preferred);
  if(params.has('locales'))setPlannedLanguages(choices);
  void readCases().then(values=>{
   setCases(values);
   const value=values.find(item=>item.id===params.get('case'));
   if(!value)return;
   const ready=completedProtocolSourceId(value.analyses);
   const initialMode:ProtocolGenerationMode=ready?'from-analysis':'standalone';
   setId(value.id);setMode(initialMode);
   const initialPresentation:ProtocolPresentation=ready?'original-analysis':'formal';
   setPresentation(initialPresentation);
   setSource(ready?completedClinicalEvidence(value)??'':caseContext(value));
   setDocument(ready?originalClinicalDocument(value,preferred):savedStructuredProtocol(value.protocols,'encounter',preferred,initialMode,ready,initialPresentation)??null);
  }).catch(()=>setNotice('Не удалось прочитать сохранённые клинические случаи.'));
 },[]);

 function isSavedDraft(){
  return !document||Boolean(current?.protocols?.some(saved=>saved.id===document.id&&JSON.stringify(saved.sections)===JSON.stringify(document.sections)));
 }
 function discardAllowed(){
  return isSavedDraft()||window.confirm(ui('Есть несохранённый протокол. Продолжить без сохранения его изменений?','You have an unsaved protocol. Discard these changes?'));
 }
 function resetResult(next:ProtocolDocument|null){
  setDocument(next);setCost(null);setNotice('');setProgress([]);setPreview('');
 }
 function changeCase(nextId:string){
  if(!discardAllowed())return;
  const value=cases.find(item=>item.id===nextId);
  const ready=completedProtocolSourceId(value?.analyses);
  const nextMode:ProtocolGenerationMode=ready?'from-analysis':'standalone';
  const nextPresentation:ProtocolPresentation=ready?'original-analysis':'formal';
  setId(nextId);setMode(nextMode);setPresentation(nextPresentation);
  setSource(value?(ready?completedClinicalEvidence(value)??'':caseContext(value)):'');
  resetResult(value&&ready?originalClinicalDocument(value,locale):savedStructuredProtocol(value?.protocols,kind,locale,nextMode,ready,nextPresentation)??null);
  const url=new URL(location.href);
  if(nextId)url.searchParams.set('case',nextId);else url.searchParams.delete('case');
  history.replaceState(history.state,'',url.pathname+url.search);
 }
 function changeMode(next:Exclude<ProtocolGenerationMode,'from-protocol'>){
  if((next==='from-analysis'&&!canFormat)||!discardAllowed())return;
  setMode(next);
  const nextPresentation:ProtocolPresentation=next==='from-analysis'?'original-analysis':'formal';
  setPresentation(nextPresentation);
  if(current)setSource(next==='from-analysis'?completedClinicalEvidence(current)??'':caseContext(current));
  resetResult(current&&next==='from-analysis'?originalClinicalDocument(current,locale):savedStructuredProtocol(current?.protocols,kind,locale,next,completedId,nextPresentation)??null);
 }
 function changeKind(next:ProtocolKind){
  if(!discardAllowed())return;
  const nextPresentation:ProtocolPresentation=['encounter','cardiology'].includes(next)?presentation:'formal';
  setKind(next);setPresentation(nextPresentation);
  resetResult(savedStructuredProtocol(current?.protocols,next,locale,mode,completedId,nextPresentation)??null);
 }
 function changeLocale(next:WorkspaceLanguage){
  if(!discardAllowed())return;
  setLocale(next);
  resetResult(current&&presentation==='original-analysis'?originalClinicalDocument(current,next):savedStructuredProtocol(current?.protocols,kind,next,mode,completedId,presentation,independent?.id)??null);
  const url=new URL(location.href);url.searchParams.set('locale',next);
  history.replaceState(history.state,'',url.pathname+url.search);
 }
 function changePresentation(next:ProtocolPresentation){
  if((next==='original-analysis'&&!canFormat)||(!['encounter','cardiology'].includes(kind)&&next!=='formal')||!discardAllowed())return;
  setPresentation(next);
  resetResult(current&&next==='original-analysis'?originalClinicalDocument(current,locale):savedStructuredProtocol(current?.protocols,kind,locale,mode,completedId,next,independent?.id)??null);
 }
 async function generate(forceStrong=false){
  if(busy||presentation==='original-analysis'||!source.trim()||(mode==='from-analysis'&&!completedId))return;
  const formattingSavedSol=mode==='standalone'&&!forceStrong&&usingSavedSol&&independent;
  const actualMode:ProtocolGenerationMode=formattingSavedSol?'from-protocol':mode;
  const actualSource=formattingSavedSol?protocolText(independent):source;
  setBusy(true);setNotice('');setProgress([]);setPreview('');
  try{
   const value=await requestStreamedJson<{document:ProtocolDocument;cost:number;usageComplete?:boolean}>('/api/protocol',{
    kind,source:actualSource,locale,mode:actualMode,presentation,
    ...(mode==='from-analysis'&&completedId?{sourceAnalysisId:completedId}:{}),
    ...(formattingSavedSol?{sourceProtocolId:independent.id}:{})
   },{onProgress:event=>setProgress(old=>[...old.slice(-20),event]),onPreview:setPreview});
   if(!value?.document?.sections?.length)throw Error('empty_protocol');
   setDocument(value.document);setCost(value.cost);setUsageComplete(value.usageComplete!==false);
   setNotice(ui('Черновик готов. Проверьте и отредактируйте перед сохранением.','Draft ready. Review and edit before saving.'));
  }catch{
   setNotice(ui('Протокол не сформирован. Исходные сведения сохранены; повторный платный запрос не запускался автоматически.','Protocol generation failed. Source text is kept; no automatic paid retry was initiated.'));
  }finally{setBusy(false);}
 }
 async function save(){
  if(!document||!id||busy)return;
  try{
   const value=(await readCases()).find(item=>item.id===id);
   if(!value)throw Error('case_not_found');
   const updated={...value,updated:new Date().toISOString(),protocols:[document,...(value.protocols??[]).filter(p=>p.id!==document.id)]};
   await persistCase(updated);
   setCases(old=>old.map(item=>item.id===id?updated:item));
   setNotice(ui('Протокол сохранён в клиническом случае.','Protocol saved in the clinical case.'));
  }catch{setNotice(ui('Не удалось сохранить протокол. Скачайте DOCX, не закрывая страницу.','Could not save protocol. Download DOCX before leaving this page.'));}
 }

 return <main className="module-page" style={{maxWidth:1080,margin:'auto',padding:28,fontSize:17,lineHeight:1.65}}>
  <Link href={id?'/workspace?case='+encodeURIComponent(id):'/workspace'}>← {t('Клинические случаи')}</Link>
  <h1>{t('Протокол осмотра и заключение исследования')}</h1>
  <p>{ui('Единый редактор Doctor Opus: два режима подготовки редактируемого медицинского документа.','Doctor Opus protocol editor: two routes to a physician-editable medical note.')}</p>
  <label>{t('Клинический случай')}
   <select disabled={busy} value={id} onChange={event=>changeCase(event.target.value)}>
    <option value="">{t('Без привязки к случаю')}</option>
    {cases.map(item=><option key={item.id} value={item.id}>{item.title||item.id.slice(0,8)}</option>)}
   </select>
  </label>
  <fieldset disabled={busy} style={{border:'1px solid #bcc8c0',borderRadius:8,padding:14,margin:'12px 0'}}>
   <legend><strong>{ui('Режим формирования','Generation mode')}</strong></legend>
   <label style={{display:'block',marginBottom:8}}>
    <input type="radio" name="protocol-mode" checked={mode==='from-analysis'} disabled={!canFormat} onChange={()=>changeMode('from-analysis')}/>
    <strong> {ui('Из готового клинического разбора','From completed clinical analysis')} · Gemini Flash</strong>
   </label>
   <p style={{marginTop:0}}>{ui('Только оформление сохранённых выводов, включая диагноз и лечебную тактику. Без повторного консилиума и новых назначений.','Formatting only: preserve the saved diagnosis and treatment discussion. No repeat clinical reasoning or new prescriptions.')}</p>
   <label style={{display:'block',marginBottom:8}}>
    <input type="radio" name="protocol-mode" checked={mode==='standalone'} onChange={()=>changeMode('standalone')}/>
    <strong> {ui('Самостоятельный протокол','Independent protocol')} · GPT-6.1 Sol</strong>
   </label>
   <p style={{marginTop:0}}>{ui('Для врача без завершённого разбора: самостоятельная клиническая оценка перед оформлением документа.','When no completed analysis exists: a capable model assesses the supplied information and drafts the note.')}</p>
   {current&&!canFormat&&<small>{ui('Последний клинический разбор не завершён. Доступен самостоятельный режим.','The latest analysis is incomplete. Only the independent route is available.')}</small>}
  </fieldset>
  <label>{t('Вид протокола')}
   <select disabled={busy} value={kind} onChange={event=>changeKind(event.target.value as ProtocolKind)}>
    {PROTOCOL_KINDS.map(([key,title])=><option key={key} value={key}>{t(title)}</option>)}
   </select>
  </label>
  <label>{ui('Язык протокола','Protocol language')}
   <select disabled={busy} value={locale} onChange={event=>changeLocale(event.target.value as WorkspaceLanguage)}>
    {WORKSPACE_LANGUAGES.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}
   </select>
  </label>
  {plannedLanguages.length>1&&<section aria-label={ui('Выбранные языки протокола','Selected protocol languages')} style={{margin:'12px 0'}}>
   <strong>{ui('Отдельные языковые версии:','Separate language versions:')}</strong>
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    {plannedLanguages.map(code=><button key={code} type="button" disabled={busy} aria-pressed={locale===code} onClick={()=>changeLocale(code)}>
     {WORKSPACE_LANGUAGES.find(item=>item.code===code)?.name}
     {' · '}{savedStructuredProtocol(current?.protocols,kind,code,mode,completedId)?ui('сохранён','saved'):ui('не создан','not created')}
    </button>)}
   </div>
  </section>}
  <label>{t('Исходные сведения и решение врача')}
   <textarea disabled={busy} rows={12} maxLength={100000} value={source} onChange={event=>setSource(event.target.value)}
    placeholder={ui('Жалобы, анамнез, исследования, диагноз или готовый клинический разбор.','Clinical findings, history, investigations, diagnosis, or completed analysis.')}/>
  </label>
  <p><small>{mode==='from-analysis'
   ?ui('Сведения загружены из сохранённого разбора. Gemini Flash только оформляет текст. Диагноз и лечебные рекомендации не пересчитываются.','Saved clinical findings are loaded. Gemini Flash reformats the text without re-evaluating diagnosis or therapy.')
   :ui('GPT-6.1 Sol самостоятельно разбирает предоставленные сведения. Отсутствующие данные не считаются нормальными.','GPT-6.1 Sol assesses the supplied information; missing clinical facts are never presumed normal.')}
   {' '}{ui('Перед отправкой текст проходит проверку обезличивания. Изменение языка не вызывает модель.','Data is reviewed for privacy before sending. Changing language does not call a model.')}</small></p>
  <button disabled={busy||!source.trim()||(mode==='from-analysis'&&!completedId)} onClick={()=>void generate()}>
   {busy?ui('Оформляем протокол…','Generating protocol…'):mode==='from-analysis'?ui('Оформить готовый разбор','Format completed analysis')+' · Gemini Flash':ui('Составить самостоятельный протокол','Draft independent protocol')+' · GPT-6.1 Sol'}
  </button>
  {busy&&<AnalysisProgress events={progress} preview={preview}/>}
  {!usageComplete&&<p>{t('Не все модели передали данные о токенах; расчётная стоимость неполная.')}</p>}
  {cost!==null&&<p>{t('Расчётная стоимость')}: {'$'+cost.toFixed(6)} · {model} ({ui('оценка, не квитанция','estimate, not a receipt')})</p>}
  {notice&&<p role="status">{notice}</p>}
  {document&&!busy&&<section aria-label={ui('Редактируемый протокол','Editable protocol')}>
   <h2>{t('Черновик · проверьте и отредактируйте')}</h2>
   <small>{WORKSPACE_LANGUAGES.find(item=>item.code===document.locale)?.name??document.locale} · {document.generationMode==='from-analysis'?ui('Оформление готового разбора','Formatting completed analysis'):ui('Самостоятельный протокол','Independent protocol')}</small>
   {document.sections.map((part,i)=><label key={part.id}>{part.title}
    <textarea rows={5} value={part.text} onChange={event=>setDocument(old=>old&&({...old,edited:true,sections:old.sections.map((value,index)=>index===i?{...value,text:event.target.value}:value)}))}/>
   </label>)}
   <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
    <button disabled={!id} onClick={()=>void save()}>{t('Сохранить протокол в случай')}</button>
    <button onClick={()=>void downloadDocx(t('Протокол осмотра'),protocolText(document),document.locale).catch(()=>setNotice(t('Не удалось создать DOCX')))}>{t('Бланк DOCX')}</button>
   </div>
  </section>}
  <p><Link href={id?'/protocol/case?case='+encodeURIComponent(id)+'&locale='+encodeURIComponent(locale):'/protocol/case?locale='+encodeURIComponent(locale)}>{ui('Расширенный самостоятельный модуль протоколов (если установлен)','Advanced independent protocol application (if installed)')}</Link></p>
 </main>;
}
