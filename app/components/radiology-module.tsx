'use client';
import{CaseConnections}from'./case-connections';
import{materialRoute,materialKey,restoreMaterial,storeOriginal}from'@/lib/material-routing';
import{catalogZip}from'@/packages/intake/zip';
import {LanguageSwitcher} from '@/app/components/language-switcher';
import {redactText} from '@/packages/intake/redact';
import {useEffect,useRef,useState} from 'react';
import {readCases,persistRadiologyMaterials,persistRadiologyReport,caseContext,caseTitle,createRadiologyCase,type ClinicalCase} from '@/lib/casebook';
import {radiologyDescriptionLanguage,radiologyReportMessage} from '@/lib/radiology-bridge';
import {localOrigin} from '@/lib/local-ports';
import {useWorkspaceLanguage} from '@/app/components/workspace-language';
import {WORKSPACE_LANGUAGES,type WorkspaceLanguage} from '@/lib/workspace-i18n';
import {requestRadiologyTranslation} from '@/lib/radiology-translation-bridge';
import {prepareRadiologyCaseSave,type RadiologyReportSource} from '@/lib/radiology-case-save';
import {radiologyAnalysisNotice,type RadiologyAnalysisStatus} from '@/lib/radiology-analysis-status';
import {retainRadiologyViewer} from '@/lib/radiology-viewer-lifecycle';
const EMPTY_FILES:File[]=[];
type RadiologyStatus={running:boolean;installed:boolean;readiness:'ready'|'bridge_source_missing'|'bridge_dependencies_missing';analysis?:RadiologyAnalysisStatus;standaloneUrl:string|null};
function radiologyStartupNotice(reason:string):string{
 if(reason==='bridge_dependencies_missing')return 'Встроенный Radiology не подготовлен в Preview. Исходный Opus Radiology на Mac может при этом работать отдельно. Для интеграции нужна установка зависимостей только отдельной копии на 3210.';
 if(reason==='bridge_source_missing')return 'В этой копии Doctor Opus отсутствует мост Radiology. Оригинальное приложение не повреждено.';
 if(reason==='module_start_failed')return 'Встроенный Radiology не запустился. Проверьте локальный журнал Preview. Не переустанавливайте исходную Radiology.';
 return 'Не удалось подключить встроенный Radiology. Исследования и материалы случая сохранены.';
}
export default function RadiologyModule({initialCaseId='',incomingFiles=EMPTY_FILES,embedded=false,onSaved}:{initialCaseId?:string;incomingFiles?:File[];embedded?:boolean;onSaved?:(id:string)=>void}={}){
 const {t,language,setLanguage}=useWorkspaceLanguage(),frame=useRef<HTMLIFrameElement>(null);const [cases,setCases]=useState<ClinicalCase[]>([]),[selected,setSelected]=useState(''),[session,setSession]=useState(''),[ready,setReady]=useState(false),[starting,setStarting]=useState(false),[report,setReport]=useState(''),[notice,setNotice]=useState('');
  const originals=useRef<File[]>([]),originalWrite=useRef(Promise.resolve()),nonce=useRef(''),expectedBindings=useRef<Record<string,number>>({}),completedBindings=useRef<string[]>([]),startAttempted=useRef(false);
 const [translations,setTranslations]=useState<Record<string,string>>({});
 useEffect(()=>{const controller=new AbortController();setTranslations({});fetch('/api/interface-copy?locale='+encodeURIComponent(language),{signal:controller.signal}).then(response=>response.ok?response.json():{}).then(value=>{if(!controller.signal.aborted)setTranslations(value);}).catch(()=>{});return()=>controller.abort();},[language]);
 const [wideView,setWideView]=useState(false);
 const [bridgeStatus,setBridgeStatus]=useState<RadiologyStatus|null>(null);
 useEffect(()=>{document.cookie='concilium-ui-language='+encodeURIComponent(language)+'; path=/; SameSite=Strict';},[language]);
 const [analyzing,setAnalyzing]=useState(false);
 const [originalReport,setOriginalReport]=useState(''),[reportLanguage,setReportLanguage]=useState<WorkspaceLanguage>(language);
 const reportSource=useRef<RadiologyReportSource|null>(null),saving=useRef(false),activeSession=useRef('');
 activeSession.current=session;
 const [originalsBlocked,setOriginalsBlocked]=useState(false);
 const current=cases.find(c=>c.id===selected),source=localOrigin('radiology');
 useEffect(()=>{
  let active=true;setSession(crypto.randomUUID());setSelected('');setReport('');setOriginalReport('');setAnalyzing(false);
  originals.current=[];completedBindings.current=[];expectedBindings.current={};reportSource.current=null;
  void readCases().then(values=>{
   if(!active)return;setCases(values);
   const id=initialCaseId||new URLSearchParams(location.search).get('case');
   if(id&&values.some(c=>c.id===id)){
    setSelected(id);const saved=values.find(c=>c.id===id)?.moduleReports?.[0];
    if(saved){setReport(saved.text);setReportLanguage(radiologyDescriptionLanguage(saved.text,language));reportSource.current={files:[],confirmed:saved.fileKeys.slice()};}
   }
  });
  return()=>{active=false;};
 },[initialCaseId]);
 useEffect(()=>{let active=true;const check=async()=>{try{const value=await fetch('/api/integrations').then(r=>r.json());if(active){setBridgeStatus(value.radiology as RadiologyStatus);setReady(opened=>retainRadiologyViewer(opened,value.radiology.running));if(value.radiology.running)setStarting(false);else if(value.radiology.installed&&!startAttempted.current){startAttempted.current=true;void start();}}}catch{}};void check();const timer=setInterval(check,2000);return()=>{active=false;clearInterval(timer);};},[]);
 async function deliverMaterials(){
  const bindings=new Map<File,string>();let files=incomingFiles.length?incomingFiles:originals.current;
  if(!files.length&&current){files=(await Promise.all(current.files.filter(f=>materialRoute(f)==='radiology'||f.image&&f.imageProfile!=='ecg').map(async source=>{const file=await restoreMaterial(source);if(file)bindings.set(file,materialKey(source));return file;}))).filter((f):f is File=>f!==null);}
  const expanded:File[]=[],sourceKeys:string[]=[];let size=0;expectedBindings.current={};
  for(const file of files){if(!bindings.has(file)&&current){const raw=await storeOriginal(file);const source=current.files.find(f=>f.sha256===raw.sha256);if(source)bindings.set(file,materialKey(source));}const sourceKey=bindings.get(file)??'';if(/\.zip$/i.test(file.name)){for(const entry of catalogZip(new Uint8Array(await file.arrayBuffer()))){if(!/\.(dcm|dicom)$/i.test(entry.name))continue;const bytes=await entry.open(8*1024*1024);if(!bytes)throw Error('DICOM из архива не открыт: '+entry.name);expanded.push(new File([new Uint8Array(bytes)],entry.name,{type:'application/dicom'}));sourceKeys.push(sourceKey);if(sourceKey)expectedBindings.current[sourceKey]=(expectedBindings.current[sourceKey]??0)+1;size+=bytes.length;}}else{expanded.push(file);sourceKeys.push(sourceKey);if(sourceKey)expectedBindings.current[sourceKey]=(expectedBindings.current[sourceKey]??0)+1;size+=file.size;}}
  const hashes=new Set<string>();for(let i=0;i<expanded.length;i++){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await expanded[i].arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');if(hashes.has(hash)){expanded.splice(i,1);sourceKeys.splice(i,1);i--;}else hashes.add(hash);}size=expanded.reduce((n,f)=>n+f.size,0);expectedBindings.current={};sourceKeys.forEach(key=>{if(key)expectedBindings.current[key]=(expectedBindings.current[key]??0)+1;});
  if(size>64*1024*1024)throw Error('Передача исходных материалов ограничена 64 МБ. Откройте большую серию непосредственно в радиомодуле.');
  if(!expanded.length)return;originals.current=expanded;nonce.current=session+':'+expanded.map(f=>f.name+':'+f.size).join('|');frame.current?.contentWindow?.postMessage({type:'concilium.materials',session,nonce:nonce.current,files:expanded,sourceKeys},source);
 }
 async function attachOriginals(id:string,files:File[]){if(!files.length)return;const materials=await Promise.all(files.map(async file=>({...await storeOriginal(file),processingModule:'radiology' as const})));await persistRadiologyMaterials(id,materials);}
 async function prepareSave(text:string){
  const study={text,currentFiles:originals.current.slice(),reportSource:reportSource.current??{files:originals.current.slice(),confirmed:completedBindings.current.slice()},caseFiles:current?.files??[]};
  await originalWrite.current;
  return prepareRadiologyCaseSave(study);
 }
 async function saveReport(id:string,text:string){
   const study=await prepareSave(text);
   if(study.materials.length)await persistRadiologyMaterials(id,study.materials);
   if(study.report)await persistRadiologyReport(id,study.report);
   setCases(await readCases());setNotice(study.report?.fileKeys.length?'Описание и связанные материалы сохранены в случае.':'Описание сохранено в случае. Привязка исходного файла не подтверждена; проверьте исследование.');
   window.dispatchEvent(new CustomEvent('concilium-case-updated'));onSaved?.(id);
 }
 async function createFromMaterials(open=false,text=report){
  const study=await prepareSave(text);
  const value=await createRadiologyCase(study.materials,study.report);
  setCases(await readCases());setSelected(value.id);
  if(!embedded)window.history.replaceState(window.history.state,'','/radiology?case='+value.id);
  window.dispatchEvent(new CustomEvent('concilium-case-updated'));onSaved?.(value.id);
  setNotice(originalsBlocked?'Случай создан с описанием. Оригиналы большой серии остаются на диске.':'Случай создан. Можно добавить жалобы, анамнез и другие материалы.');
  if(open&&!embedded)window.location.assign('/workspace?case='+encodeURIComponent(value.id));
  return value.id;
 }
 async function createCase(){
  if(saving.current)return;saving.current=true;setAnalyzing(true);setNotice('');
  try{await createFromMaterials(true);}catch(e){setNotice(e instanceof Error?e.message:'Не удалось создать случай. Описание осталось в Radiology.');}
  finally{saving.current=false;setAnalyzing(false);}
 }
 function sendContext(){frame.current?.contentWindow?.postMessage({type:'concilium.context',session,text:current?redactText(caseContext(current)).text:'',language,translations,wideView,copy:{title:t('Opus Radiology'),question:t('Вопрос и клинический контекст'),transfer:t('Сохранить описание в случай'),empty:t('Разбор ещё не выполнен'),sent:t('Описание передано. В выбранном случае оно сохраняется автоматически.'),local:t('Локальный режим'),study:t('Исследование'),load:t('Загрузить DICOM'),files:t('Выбрать DICOM-файлы'),folder:t('Выбрать папку DICOM'),projection:t('Добавить одну проекцию'),analyze:t('Анализировать исследование'),running:t('Идёт анализ исследования…'),tooLong:t('Описание слишком длинное для передачи.')}},source);}
 useEffect(()=>{const receive=(event:MessageEvent)=>{if(event.origin!==source||event.source!==frame.current?.contentWindow)return;if(event.data?.type==='concilium.save-report'&&event.data.session===session){if(report.trim())void save();else setNotice('Разбор ещё не выполнен');}if(event.data?.type==='concilium.viewer-layout'&&event.data.session===session&&typeof event.data.wideView==='boolean')setWideView(event.data.wideView);if(event.data?.type==='concilium.ready'&&event.data.session===session){sendContext();void deliverMaterials().catch(e=>setNotice(e.message));}if(event.data?.type==='concilium.materials-too-large'&&event.data.session===session){setOriginalsBlocked(true);setNotice('Серия превышает 64 МБ: сохраните оригиналы на диске. Для переноса в случай доступно описание исследования.');}if(event.data?.type==='concilium.materials-export'&&event.data.session===session&&Array.isArray(event.data.files)&&event.data.files.every((f:unknown)=>f instanceof File)&&event.data.files.reduce((n:number,f:File)=>n+f.size,0)<=64*1024*1024){setOriginalsBlocked(false);originals.current=event.data.files;const counts:Record<string,number>={};if(Array.isArray(event.data.sourceKeys))for(const key of event.data.sourceKeys){if(typeof key==='string'&&expectedBindings.current[key])counts[key]=(counts[key]??0)+1;}completedBindings.current=Object.keys(counts).filter(key=>counts[key]===expectedBindings.current[key]);if(selected)originalWrite.current=originalWrite.current.then(()=>attachOriginals(selected,event.data.files)).catch(e=>setNotice(e.message));}const text=radiologyReportMessage(event.data,session);if(text){reportSource.current={files:originals.current.slice(),confirmed:completedBindings.current.slice()};setOriginalReport('');setReportLanguage(WORKSPACE_LANGUAGES.some(item=>item.code===event.data.language)?event.data.language:radiologyDescriptionLanguage(text,language));setReport(text);requestAnimationFrame(()=>document.getElementById('radiology-returned-description')?.scrollIntoView({block:'center',behavior:'smooth'}));if(event.data.saveRequested===true)void save(text);else if(selected)void saveReport(selected,text).catch(e=>setNotice(e.message));else setNotice('Описание получено. Создайте случай из материалов или выберите существующий.');}};window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[session,current,language,t,translations,wideView,report]);
 useEffect(()=>{if(ready&&session){sendContext();void deliverMaterials().catch(e=>setNotice(e.message));}},[ready,current,session,language,t,translations,wideView]);
 function selectCase(id:string){
  setSelected(id);const saved=cases.find(value=>value.id===id)?.moduleReports?.[0];
  setReport(saved?.text??'');setReportLanguage(radiologyDescriptionLanguage(saved?.text??'',language));setOriginalReport('');
  reportSource.current=saved?{files:[],confirmed:saved.fileKeys.slice()}:null;
  originals.current=[];completedBindings.current=[];expectedBindings.current={};setNotice('');setSession(crypto.randomUUID());
 }
 function resizeViewer(value:boolean){setWideView(value);frame.current?.contentWindow?.postMessage({type:'concilium.layout',session,wideView:value},source);}
 useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')resizeViewer(false);};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[session]);
 useEffect(()=>{if(!wideView)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous;};},[wideView]);
 async function start(){
 setStarting(true);setNotice('');
 try{
  const response=await fetch('/api/integrations/radiology',{method:'POST'});
  const status=await response.json().catch(()=>({error:'module_start_failed'}));
  if(!response.ok)throw Error(status.error??'module_start_failed');
 }catch(error){setStarting(false);setNotice(radiologyStartupNotice(error instanceof Error?error.message:'module_start_failed'));}
}
 async function save(text=report){
  if(saving.current||!text.trim())return;saving.current=true;setAnalyzing(true);setNotice('');
  try{if(selected){await saveReport(selected,text);if(!embedded)window.location.assign('/workspace?case='+encodeURIComponent(selected));}else await createFromMaterials(true,text);}
  catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить описание. Текст остался в Radiology.');}
  finally{saving.current=false;setAnalyzing(false);}
 }
 async function translateReport(){
  if(reportLanguage===language||!frame.current?.contentWindow)return;
  const original=report,studySession=session;
  setAnalyzing(true);setNotice('');
  try{
   const translated=await requestRadiologyTranslation(frame.current.contentWindow,source,studySession,original,language);
   if(activeSession.current!==studySession)return;
   setOriginalReport(previous=>previous||original);setReport(translated);setReportLanguage(language);
  }catch{if(activeSession.current===studySession)setNotice('Не удалось перевести описание. Исходный текст сохранён.');}
  finally{setAnalyzing(false);}
 }
 return <main className="module-page" style={{padding:24,fontSize:17,lineHeight:1.7}}><a href={selected?`/workspace?case=${encodeURIComponent(selected)}`:'/workspace'}>← {t('Клинические случаи')}</a><h1>Opus Radiology · {t('КТ, МРТ и рентгенография')}</h1><p>{t('Загрузите DICOM или снимок, просмотрите исследование и получите описание с заключением. Результат можно обсудить и сохранить в клиническом случае.')}</p><CaseConnections/><LanguageSwitcher disabled={analyzing}/><button disabled={analyzing} onClick={()=>void createCase()}>{t('Создать случай из материалов')}</button><label>{t('Сохранение результата')}<select disabled={analyzing} value={selected} onChange={e=>selectCase(e.target.value)}><option value="">{t('Работать отдельно')}</option>{cases.map(c=><option key={c.id} value={c.id}>{caseTitle(c,c.id.slice(0,8))}</option>)}</select></label><p className="module-hint">{t('Работайте отдельно или выберите случай: его данные станут контекстом исследования, а результат можно будет сохранить в его истории.')}</p><p>{t('Смена случая начинает новое исследование. Перед сменой передайте и сохраните подготовленное описание.')}</p>{!ready&&<section style={{border:'1px solid #bfd4c8',background:'#f4f8f3',padding:16,borderRadius:10,marginBlock:16}}>
  {bridgeStatus?.readiness==='bridge_dependencies_missing'&&<p role="status">Встроенный модуль на 3210 ещё не подготовлен. Ваша исходная локальная Radiology при этом остаётся независимой и не изменяется.</p>}
  {bridgeStatus?.readiness==='bridge_dependencies_missing'&&<p>Подготовка только отдельного Preview: остановите Preview 3207 и выполните <code>npm run setup:radiology:preview</code> в <code>~/Documents/Consilium-Preview</code>. Установка отдельная и может потребовать значительного места на диске.</p>}
  {bridgeStatus?.readiness==='bridge_source_missing'&&<p role="status">Встроенный модуль отсутствует в этой копии. Обновите Preview, не меняя исходный Radiology.</p>}
  <button disabled={starting||bridgeStatus?.readiness==='bridge_dependencies_missing'||bridgeStatus?.readiness==='bridge_source_missing'} onClick={()=>void start()}>{starting?t('Запускаем локальный модуль…'):t('Открыть модуль Opus Radiology')}</button>
  {bridgeStatus?.standaloneUrl&&<p><a href={bridgeStatus.standaloneUrl} target="_blank" rel="noopener noreferrer">Открыть исходный Radiology отдельно</a><small style={{display:'block'}}>Открывается отдельно: данные случая автоматически не передаются.</small></p>}
  <details><summary>Почему модуль не открывается?</summary><p>Doctor Opus Preview использует собственную копию на порту 3210. Работающая оригинальная Radiology на Mac не означает, что подготовлен этот встроенный мост. Исходное приложение не удалено и не обновляется.</p></details>
 </section>}{notice&&<p role="status">{t(notice)}</p>}{ready&&bridgeStatus?.analysis&&bridgeStatus.analysis!=='ready'&&<section role="status" style={{border:'1px solid #d3ded7',padding:16,borderRadius:10,marginBlock:16}}><p>{t(radiologyAnalysisNotice(bridgeStatus.analysis))}</p><details><summary>{t('Подключение анализа · для администратора')}</summary><p>{t('Эта проверка не отправляет снимки и не включает платные вызовы.')}</p><a href={`${source}/technical`} target="_blank" rel="noopener noreferrer">{t('Открыть параметры подключения')}</a></details></section>}{ready&&session&&<><button type="button" onClick={()=>resizeViewer(!wideView)} style={wideView?{position:'fixed',right:18,top:8,zIndex:10001}:{marginBottom:12}}>{t(wideView?'Свернуть изображение · Esc':'На весь экран · панель вниз')}</button><iframe key={session} ref={frame} title="Opus Radiology" allowFullScreen src={`${source}/viewer?conciliumSession=${session}`} style={wideView?{position:'fixed',inset:0,width:'100vw',height:'100dvh',border:0,zIndex:10000,background:'#edf3f6'}:{width:'100%',height:'80vh',minHeight:650,border:'1px solid #c5d6ca',borderRadius:10}}/></>}{(report||ready)&&<section><h2>{t('Описание из Opus Radiology')}</h2><textarea id="radiology-returned-description" lang={reportLanguage} dir={reportLanguage==='ar'?'rtl':'ltr'} rows={12} disabled={analyzing} value={report} onChange={e=>setReport(e.target.value)}/><div style={{display:'flex',gap:12,flexWrap:'wrap'}}>{report.trim()&&reportLanguage!==language&&<button disabled={analyzing} onClick={()=>void translateReport()}>{t(analyzing?'Переводим описание…':'Перевести описание')}</button>}<button disabled={analyzing||!report.trim()} onClick={()=>void save()}>{t(selected?'Сохранить описание в случай':'Создать случай из снимка и описания')}</button><button disabled={analyzing||!report} onClick={()=>{setReport('');setOriginalReport('');reportSource.current=null;setNotice('');}}>{t('Очистить результаты')}</button></div>{originalReport&&<details><summary>{t('Исходное описание')}</summary><p dir="auto" style={{whiteSpace:'pre-wrap'}}>{originalReport}</p></details>}</section>}</main>;
}
