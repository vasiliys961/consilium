'use client';

import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {registerVaultFlush} from '@/lib/local-vault';
import {requestedProtocol} from '@/lib/c11-module-overview';
import {useEffect,useRef,useState} from 'react';
import {requestStreamedJson,type AnalysisProgressEvent} from '@/lib/analysis-stream';
import {AnalysisProgress} from '@/app/components/analysis-progress';
import {readCases,persistStructuredProtocol,persistStructuredProtocolDraft,caseContext,type ClinicalCase} from '@/lib/casebook';
import {PROTOCOL_KINDS,protocolText,type ProtocolDocument,type ProtocolKind,type ProtocolPresentation} from '@/packages/protocol/document';
import type {ProtocolGenerationMode} from '@/packages/protocol/generate';
import {completedProtocolSourceId,savedStructuredProtocol,structuredProtocolDraftKey} from '@/lib/protocol-two-mode';
import {completedClinicalEvidence,originalClinicalDocument,independentProtocolSource} from '@/lib/protocol-print';
import {protocolLanguagePlan} from '@/lib/protocol-language-flow';
import {WORKSPACE_LANGUAGES,type WorkspaceLanguage} from '@/lib/workspace-i18n';
import {downloadDocx} from '@/lib/download-docx';
import {useWorkspaceLanguage} from '@/app/components/workspace-language';

export default function ProtocolModule(){
 const {t,language}=useWorkspaceLanguage();
 const router=useRouter();
 const [draftDirty,setDraftDirty]=useState(false),[draftError,setDraftError]=useState(false),[saving,setSaving]=useState(false);
 const [openedDocumentId,setOpenedDocumentId]=useState('');
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
 function originalFor(value:ClinicalCase|undefined,language:WorkspaceLanguage){
  if(!value)return null;
  const currentId=completedProtocolSourceId(value.analyses);
  return savedStructuredProtocol(value.protocols,'encounter',language,'from-analysis',currentId,'original-analysis')??originalClinicalDocument(value,language);
 }

 const draftKey=structuredProtocolDraftKey(kind,locale,mode,presentation,completedId,openedDocumentId);
 const pending=useRef<{caseId:string;key:string;source:string;document:ProtocolDocument|null}|null>(null);
 pending.current=id&&draftDirty?{caseId:id,key:draftKey,source,document}:null;
 const persisted=useRef('');
 const flushDraft=async()=>{
  const snapshot=pending.current;if(!snapshot)return;
  const signature=JSON.stringify(snapshot);if(signature===persisted.current)return;
  const value=await persistStructuredProtocolDraft(snapshot.caseId,snapshot.key,{source:snapshot.source,document:snapshot.document,at:new Date().toISOString()});
  persisted.current=signature;
  setCases(old=>old.map(item=>item.id===value.id?value:item));setDraftError(false);
 };
 const flushRef=useRef(flushDraft);flushRef.current=flushDraft;
 useEffect(()=>registerVaultFlush(()=>flushRef.current()),[]);
 useEffect(()=>{
  if(!draftDirty||!id||busy||saving)return;
  const timer=setTimeout(()=>void flushRef.current().catch(()=>setDraftError(true)),300);
  return()=>clearTimeout(timer);
 },[source,document,draftDirty,id,draftKey,busy,saving]);
 useEffect(()=>{
  const guard=(event:BeforeUnloadEvent)=>{if(pending.current&&JSON.stringify(pending.current)!==persisted.current){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',guard);
  return()=>{window.removeEventListener('beforeunload',guard);void flushRef.current().catch(()=>{});};
 },[]);
 async function preserveDraft(){
  if(!id&&draftDirty)return window.confirm(ui('Документ не привязан к случаю. Перейти без сохранения?','This note is not linked to a case. Leave without saving?'));
  try{await flushRef.current();if(pending.current&&JSON.stringify(pending.current)!==persisted.current)throw Error('draft_changed');return true;}
  catch{setDraftError(true);return false;}
 }
 function restoreEditor(value:ClinicalCase|undefined,nextKind:ProtocolKind,nextLocale:WorkspaceLanguage,nextMode:Exclude<ProtocolGenerationMode,'from-protocol'>,nextPresentation:ProtocolPresentation,fallback:ProtocolDocument|null,nextSource:string,documentId=''){
  const key=structuredProtocolDraftKey(nextKind,nextLocale,nextMode,nextPresentation,completedProtocolSourceId(value?.analyses),documentId);
  const draft=value?.structuredProtocolDrafts?.[key];
  setSource(draft?.source??nextSource);setDocument(draft?draft.document:fallback);
  setDraftDirty(Boolean(draft));setDraftError(false);setNotice('');setCost(null);setProgress([]);setPreview('');
 }

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
   const requestedId=params.get('document');
   const requested=requestedId?requestedProtocol(value.protocols,requestedId,preferred):undefined;
   if(requestedId&&!requested){setNotice(ui('Сохранённый документ не найден в этом случае и языке.','The saved document was not found in this case and language.'));setId(value.id);return;}
   const ready=completedProtocolSourceId(value.analyses);
   const initialMode:Exclude<ProtocolGenerationMode,'from-protocol'>=requested?.generationMode==='from-analysis'?'from-analysis':requested?'standalone':ready?'from-analysis':'standalone';
   const initialPresentation:ProtocolPresentation=requested?.presentation??(ready?'original-analysis':'formal');
   const initialKind=requested?.kind??'encounter';
   setId(value.id);setMode(initialMode);setPresentation(initialPresentation);setKind(initialKind);setOpenedDocumentId(params.get('draftOrigin')??requested?.id??'');
   restoreEditor(value,initialKind,preferred,initialMode,initialPresentation,
    requested??(ready?originalFor(value,preferred):savedStructuredProtocol(value.protocols,'encounter',preferred,initialMode,ready,initialPresentation)??null),
    requested?.sourceSnapshot??(ready?completedClinicalEvidence(value)??'':caseContext(value)),params.get('draftOrigin')??requested?.id);

  }).catch(()=>setNotice('Не удалось прочитать сохранённые клинические случаи.'));
 },[]);

 async function changeCase(nextId:string){
  if(!(await preserveDraft()))return;
  const value=cases.find(item=>item.id===nextId),ready=completedProtocolSourceId(value?.analyses);
  const nextMode=ready?'from-analysis':'standalone',nextPresentation=ready?'original-analysis':'formal';
  setId(nextId);setMode(nextMode);setPresentation(nextPresentation);setOpenedDocumentId('');
  restoreEditor(value,kind,locale,nextMode,nextPresentation,value&&ready?originalFor(value,locale):savedStructuredProtocol(value?.protocols,kind,locale,nextMode,ready,nextPresentation)??null,value?(ready?completedClinicalEvidence(value)??'':caseContext(value)):'');
  const url=new URL(location.href);url.searchParams.delete('document');url.searchParams.delete('draftOrigin');
  if(nextId)url.searchParams.set('case',nextId);else url.searchParams.delete('case');history.replaceState(history.state,'',url.pathname+url.search);
 }
 function clearDocumentLink(){const url=new URL(location.href);url.searchParams.delete('document');url.searchParams.delete('draftOrigin');history.replaceState(history.state,'',url.pathname+url.search);}
 async function changeMode(next:Exclude<ProtocolGenerationMode,'from-protocol'>){
  if((next==='from-analysis'&&!canFormat)||!(await preserveDraft()))return;
  const nextPresentation=next==='from-analysis'?'original-analysis':'formal';
  setMode(next);setPresentation(nextPresentation);setOpenedDocumentId('');clearDocumentLink();
  restoreEditor(current,kind,locale,next,nextPresentation,current&&next==='from-analysis'?originalFor(current,locale):savedStructuredProtocol(current?.protocols,kind,locale,next,completedId,nextPresentation)??null,current?(next==='from-analysis'?completedClinicalEvidence(current)??'':caseContext(current)):'');
 }
 async function changeKind(next:ProtocolKind){
  if(!(await preserveDraft()))return;
  const nextPresentation=next==='encounter'?presentation:'formal';
  setKind(next);setPresentation(nextPresentation);setOpenedDocumentId('');clearDocumentLink();
  restoreEditor(current,next,locale,mode,nextPresentation,current&&nextPresentation==='original-analysis'?originalFor(current,locale):savedStructuredProtocol(current?.protocols,next,locale,mode,completedId,nextPresentation)??null,source);
 }
 async function changeLocale(next:WorkspaceLanguage){
  if(!(await preserveDraft()))return;
  setLocale(next);
  const selected=openedDocumentId?requestedProtocol(current?.protocols,openedDocumentId,next):undefined;
  restoreEditor(current,kind,next,mode,presentation,selected??(current&&presentation==='original-analysis'?originalFor(current,next):savedStructuredProtocol(current?.protocols,kind,next,mode,completedId,presentation,independent?.id)??null),selected?.sourceSnapshot??source,openedDocumentId);
  const url=new URL(location.href);url.searchParams.set('locale',next);url.searchParams.delete('document');url.searchParams.delete('draftOrigin');
  if(selected)url.searchParams.set('document',selected.id);else if(openedDocumentId)url.searchParams.set('draftOrigin',openedDocumentId);
  history.replaceState(history.state,'',url.pathname+url.search);
 }
 async function changePresentation(next:ProtocolPresentation){
  if((next==='original-analysis'&&!canFormat)||(kind!=='encounter'&&next!=='formal')||!(await preserveDraft()))return;
  setPresentation(next);setOpenedDocumentId('');clearDocumentLink();
  restoreEditor(current,kind,locale,mode,next,current&&next==='original-analysis'?originalFor(current,locale):savedStructuredProtocol(current?.protocols,kind,locale,mode,completedId,next,independent?.id)??null,source);
 }
 async function generate(forceStrong=false){
  if(busy||presentation==='original-analysis'||!source.trim()||(mode==='from-analysis'&&!completedId))return;
  const formattingSavedSol=mode==='standalone'&&!forceStrong&&usingSavedSol&&independent;
  const actualMode:ProtocolGenerationMode=formattingSavedSol?'from-protocol':mode;
  const actualSource=formattingSavedSol?protocolText(independent):source;
  if(!(await preserveDraft()))return;
  setBusy(true);setNotice('');setProgress([]);setPreview('');
  try{
   const value=await requestStreamedJson<{document:ProtocolDocument;cost:number;usageComplete?:boolean}>('/api/protocol',{
    kind,source:actualSource,locale,mode:actualMode,presentation,
    ...(mode==='from-analysis'&&completedId?{sourceAnalysisId:completedId}:{}),
    ...(formattingSavedSol?{sourceProtocolId:independent.id}:{})
   },{onProgress:event=>setProgress(old=>[...old.slice(-20),event]),onPreview:setPreview});
   if(!value?.document?.sections?.length)throw Error('empty_protocol');
   setDocument(value.document);setDraftDirty(true);setCost(value.cost);setUsageComplete(value.usageComplete!==false);
   setNotice(ui('Черновик готов. Проверьте и отредактируйте перед сохранением.','Draft ready. Review and edit before saving.'));
  }catch{
   setNotice(ui('Протокол не сформирован. Исходные сведения сохранены; повторный платный запрос не запускался автоматически.','Protocol generation failed. Source text is kept; no automatic paid retry was initiated.'));
  }finally{setBusy(false);}
 }
 async function save(){
  if(!document||!id||busy||saving)return;
  if(!(await preserveDraft()))return;
  setSaving(true);
  try{
   const updated=await persistStructuredProtocol(id,document,draftKey);
   pending.current=null;setDraftDirty(false);
   setCases(old=>old.map(item=>item.id===id?updated:item));
   setNotice(ui('Протокол сохранён в клиническом случае.','Protocol saved in the clinical case.'));
  }catch{setNotice(ui('Не удалось сохранить протокол. Скачайте DOCX, не закрывая страницу.','Could not save protocol. Download DOCX before leaving this page.'));}
  finally{setSaving(false);}
 }

 return <main onClickCapture={event=>{const link=(event.target as HTMLElement).closest('a');if(!link||event.defaultPrevented||link.target==='_blank')return;const url=new URL(link.href,location.href);if(url.origin!==location.origin)return;event.preventDefault();event.stopPropagation();if(busy||saving)return;void preserveDraft().then(ok=>{if(ok)router.push(url.pathname+url.search)});}} className="module-page" style={{maxWidth:1080,margin:'auto',padding:28,fontSize:17,lineHeight:1.65}}>
  <Link href={id?'/workspace?case='+encodeURIComponent(id):'/workspace'}>← {t('Клинические случаи')}</Link>
  <h1>{t('Протокол осмотра и заключение исследования')}</h1>
  <p>{ui('Единый редактор Doctor Opus: два режима подготовки редактируемого медицинского документа.','Doctor Opus protocol editor: two routes to a physician-editable medical note.')}</p>
  <label>{t('Клинический случай')}
   <select disabled={busy||saving} value={id} onChange={event=>changeCase(event.target.value)}>
    <option value="">{t('Без привязки к случаю')}</option>
    {cases.map(item=><option key={item.id} value={item.id}>{item.title||item.id.slice(0,8)}</option>)}
   </select>
  </label>
  <fieldset disabled={busy||saving} style={{border:'1px solid #bcc8c0',borderRadius:8,padding:14,margin:'12px 0'}}>
   <legend><strong>{ui('Режим формирования','Generation mode')}</strong></legend>
   <label style={{display:'block',marginBottom:8}}>
    <input type="radio" name="protocol-mode" checked={mode==='from-analysis'} disabled={!canFormat} onChange={()=>changeMode('from-analysis')}/>
    <strong> {ui('Из готового клинического разбора','From completed clinical analysis')}</strong>
   </label>
   <p style={{marginTop:0}}>{ui('Только оформление сохранённых выводов, включая диагноз и лечебную тактику. Без повторного консилиума и новых назначений.','Formatting only: preserve the saved diagnosis and treatment discussion. No repeat clinical reasoning or new prescriptions.')}</p>
   <label style={{display:'block',marginBottom:8}}>
    <input type="radio" name="protocol-mode" checked={mode==='standalone'} onChange={()=>changeMode('standalone')}/>
    <strong> {ui('Самостоятельный протокол','Independent protocol')}</strong>
   </label>
   <p style={{marginTop:0}}>{ui('Для врача без завершённого разбора: самостоятельная клиническая оценка перед оформлением документа.','When no completed analysis exists: a capable model assesses the supplied information and drafts the note.')}</p>
   {current&&!canFormat&&<small>{ui('Последний клинический разбор не завершён. Доступен самостоятельный режим.','The latest analysis is incomplete. Only the independent route is available.')}</small>}
  </fieldset>
  <label>{t('Вид протокола')}
   <select disabled={busy||saving} value={kind} onChange={event=>changeKind(event.target.value as ProtocolKind)}>
    {PROTOCOL_KINDS.map(([key,title])=><option key={key} value={key}>{t(title)}</option>)}
   </select>
  </label>
  <label>{ui('Вид документа для просмотра и печати','Document layout for reading and printing')}
   <select disabled={busy||saving} value={presentation} onChange={event=>changePresentation(event.target.value as ProtocolPresentation)}>
    <option value="original-analysis" disabled={!canFormat||kind!=='encounter'}>{ui('1. Исходный клинический разбор · бесплатно','1. Original clinical reasoning · free')}</option>
    <option value="narrative" disabled={!['encounter','cardiology'].includes(kind)}>{ui('2. Экспертное клиническое заключение','2. Narrative expert conclusion')}</option>
    <option value="formal">{ui('3. Формальный протокол осмотра','3. Formal encounter protocol')}</option>
    <option value="soap" disabled={!['encounter','cardiology'].includes(kind)}>{ui('3а. Краткий SOAP · формат протокола','3a. Compact SOAP note')}</option>
   </select>
  </label>
  <p><small>{presentation==='original-analysis'
   ?ui('Исходный разбор отображается и печатается без нового модельного запроса. Перевод на другой язык без модели не выполняется.','Original clinical output is displayed and printable without a model call; language selection does not translate it.')
   :ui('Оформление изменяет только представление документа, не диагностические выводы или утверждённые назначения.','Formatting changes presentation only, not clinical findings or accepted treatment.')}</small></p>
  <label>{ui('Язык протокола','Protocol language')}
   <select disabled={busy||saving} value={locale} onChange={event=>changeLocale(event.target.value as WorkspaceLanguage)}>
    {WORKSPACE_LANGUAGES.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}
   </select>
  </label>
  {plannedLanguages.length>1&&<section aria-label={ui('Выбранные языки протокола','Selected protocol languages')} style={{margin:'12px 0'}}>
   <strong>{ui('Отдельные языковые версии:','Separate language versions:')}</strong>
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    {plannedLanguages.map(code=><button key={code} type="button" disabled={busy||saving} aria-pressed={locale===code} onClick={()=>changeLocale(code)}>
     {WORKSPACE_LANGUAGES.find(item=>item.code===code)?.name}
     {' · '}{savedStructuredProtocol(current?.protocols,kind,code,mode,completedId,presentation,independent?.id)?ui('сохранён','saved'):ui('не создан','not created')}
    </button>)}
   </div>
  </section>}
  <label>{t('Исходные сведения и решение врача')}
   <textarea disabled={busy||saving} rows={12} maxLength={100000} value={source} onChange={event=>{setSource(event.target.value);setDraftDirty(true)}}
    placeholder={ui('Жалобы, анамнез, исследования, диагноз или готовый клинический разбор.','Clinical findings, history, investigations, diagnosis, or completed analysis.')}/>
  </label>
  <p><small>{mode==='from-analysis'
   ?ui('Сведения загружены из сохранённого разбора. Gemini Flash только оформляет текст. Диагноз и лечебные рекомендации не пересчитываются.','Saved clinical findings are loaded. Gemini Flash reformats the text without re-evaluating diagnosis or therapy.')
   :ui('GPT-6.1 Sol самостоятельно разбирает предоставленные сведения. Отсутствующие данные не считаются нормальными.','GPT-6.1 Sol assesses the supplied information; missing clinical facts are never presumed normal.')}
   {' '}{ui('Перед отправкой текст проходит проверку обезличивания. Изменение языка не вызывает модель.','Data is reviewed for privacy before sending. Changing language does not call a model.')}</small></p>
  {presentation==='original-analysis'?<p><strong>{ui('Исходный документ готов бесплатно — его уже можно редактировать, печатать и сохранять.','Original note is ready for free: review, print or save it now.')}</strong></p>:<>
   <button disabled={busy||!source.trim()||(mode==='from-analysis'&&!completedId)} onClick={()=>void generate()}>
    {busy?ui('Оформляем документ…','Preparing note…'):mode==='from-analysis'?ui('Оформить сохранённый разбор','Format saved clinical analysis'):usingSavedSol?ui('Переоформить ранее сохранённый Sol','Reformat saved Sol note'):ui('Составить самостоятельный протокол','Generate independent protocol')}
   </button>
   {usingSavedSol&&<><p><small>{ui('Для нового формата используется уже сохранённый результат GPT-6.1 Sol. Повторный дорогой анализ не нужен.','The saved GPT-6.1 Sol note is reused for this layout; no repeat expensive reasoning.')}</small></p>
   <button type="button" disabled={busy||!source.trim()} onClick={()=>void generate(true)}>{ui('Повторно проанализировать новые данные','Analyze new evidence again')}</button></>}
  </>}
  {busy&&<AnalysisProgress events={progress} preview={preview}/>}
  {!usageComplete&&<p>{t('Не все модели передали данные о токенах; расчётная стоимость неполная.')}</p>}
  <details><summary>{ui('Служебные сведения и расходы','Service details and costs')}</summary><p>{model}</p>
  {cost!==null&&<p>{t('Расчётная стоимость')}: {'$'+cost.toFixed(6)} · {model} ({ui('оценка, не квитанция','estimate, not a receipt')})</p>}
  </details>
  {draftError&&<p role="alert">{ui('Не удалось сохранить черновик. Останьтесь в редакторе и скачайте DOCX перед закрытием.','The draft could not be saved. Stay in the editor and download DOCX before leaving.')}</p>}
  {notice&&<p role="status">{notice}</p>}
  {document&&!busy&&<section aria-label={ui('Редактируемый протокол','Editable protocol')}>
   <h2>{presentation==='original-analysis'?ui('Исходный разбор · без переформулирования','Original clinical analysis · unchanged'):t('Черновик · проверьте и отредактируйте')}</h2>
   <small>{WORKSPACE_LANGUAGES.find(item=>item.code===document.locale)?.name??document.locale} · {document.presentation==='original-analysis'?ui('Без модельных запросов','No model calls'):document.generationMode==='from-analysis'||document.generationMode==='from-protocol'?ui('Оформление готового текста','Formatting completed text'):ui('Самостоятельный протокол','Independent protocol')}</small>
   {document.sections.map((part,i)=><label key={part.id}>{part.title}
    <textarea disabled={saving} rows={5} value={part.text} onChange={event=>{setDraftDirty(true);setDocument(old=>old&&({...old,edited:true,sections:old.sections.map((value,index)=>index===i?{...value,text:event.target.value}:value)}))}}/>
   </label>)}
   <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
    <button disabled={!id||saving} onClick={()=>void save()}>{t('Сохранить протокол в случай')}</button>
    <button type="button" onClick={()=>window.print()}>{ui('Печать / сохранить PDF','Print / save PDF')}</button>
    <button onClick={()=>void downloadDocx(t('Протокол осмотра'),protocolText(document),document.locale).catch(()=>setNotice(t('Не удалось создать DOCX')))}>{t('Бланк DOCX')}</button>
   </div>
   <article id="opus-clinical-print-sheet" style={{display:'none'}}>
    <h1>{document.presentation==='original-analysis'?ui('КЛИНИЧЕСКИЙ РАЗБОР','CLINICAL REVIEW'):document.presentation==='narrative'?ui('ЭКСПЕРТНОЕ КЛИНИЧЕСКОЕ ЗАКЛЮЧЕНИЕ','EXPERT CLINICAL CONCLUSION'):document.presentation==='soap'?'SOAP':ui('ПРОТОКОЛ ОСМОТРА','CLINICAL ENCOUNTER NOTE')}</h1>
    <p>{ui('Дата подготовки','Prepared')}: {new Date(document.created).toLocaleDateString(document.locale)}. {ui('Рабочий черновик для проверки лечащим врачом','Working draft for physician review')}.</p>
    {document.sections.map(part=><section key={part.id}><h2>{part.title}</h2><p>{part.text}</p></section>)}
    <p>{ui('Не является подписанным медицинским документом. Решения и назначения утверждаются врачом отдельно.','Unsigned draft. Clinical decisions and prescriptions require physician approval.')}</p>
   </article>
  </section>}
  <style>{'@media print { @page { size: A4; margin: 15mm; } body * { visibility: hidden !important; } #opus-clinical-print-sheet, #opus-clinical-print-sheet * { visibility: visible !important; } #opus-clinical-print-sheet { display: block !important; position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; max-width: 100% !important; font-family: Georgia, serif !important; font-size: 11pt !important; line-height: 1.45 !important; color: black !important; } #opus-clinical-print-sheet h1 { font-size: 16pt; text-align: center; margin-bottom: 12pt; } #opus-clinical-print-sheet h2 { font-size: 12pt; margin-top: 12pt; margin-bottom: 3pt; } #opus-clinical-print-sheet p { white-space: pre-wrap; margin: 0 0 7pt; } #opus-clinical-print-sheet section { break-inside: avoid-page; } }'}</style>
  <p><Link href={id?'/protocol/case?case='+encodeURIComponent(id)+'&locale='+encodeURIComponent(locale):'/protocol/case?locale='+encodeURIComponent(locale)}>{ui('Расширенный самостоятельный модуль протоколов (если установлен)','Advanced independent protocol application (if installed)')}</Link></p>
 </main>;
}
