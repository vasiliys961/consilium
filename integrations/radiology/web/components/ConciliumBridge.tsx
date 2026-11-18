'use client';
import {conciliumSession} from '../lib/concilium-session';
import {conciliumParentOrigin} from '../lib/concilium-parent-origin';
import {makeUiTranslator} from '../lib/ui-locale';
import {validBridgeTranslation,translateBridgeReport} from '../lib/bridge-report-translation';
import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
const defaults={title:'Opus Radiology в составе Concilium',question:'Вопрос и контекст выбранного случая',transfer:'Передать описание и заключение в случай',empty:'Сначала получите описание или заключение в модуле.',sent:'Результат передан в Concilium. Сохраните его в случае.',local:'Локальный режим',study:'Исследование',load:'Загрузить DICOM',files:'Выбрать DICOM-файлы',folder:'Выбрать папку DICOM',projection:'Добавить одну проекцию',analyze:'Анализировать исследование',running:'Идёт анализ исследования…',tooLong:'Описание слишком длинное для передачи.'};
const UiLocale=createContext<(value:string)=>string>(value=>value);
export function useUiTranslator(){return useContext(UiLocale);}
export function LocalizedUi({value}:{value:ReactNode}){const translate=useUiTranslator();return typeof value==='string'?translate(value):value;}
const ViewerLayout=createContext({wide:false,setWide:(_wide:boolean)=>{}});
export function useViewerLayout(){return useContext(ViewerLayout);}
const ViewerCopy=createContext(defaults);
export function useConciliumViewerCopy(){return useContext(ViewerCopy);}
/** Local parent bridge. It never reads pixels, files, provider credentials or unmarked inputs. */
export default function ConciliumBridge({children,initialLanguage='ru',initialTranslations={}}:{children:ReactNode;initialLanguage?:string;initialTranslations?:Record<string,string>}){
 const [session,setSession]=useState(''),[context,setContext]=useState(''),[notice,setNotice]=useState('');
 const [wide,setWideState]=useState(false);
 const [copy,setCopy]=useState(defaults),[language,setLanguage]=useState(initialLanguage),[translations,setTranslations]=useState<Record<string,string>>(initialTranslations);
 const translate=useMemo(()=>makeUiTranslator(translations),[translations]);
 const origin=conciliumParentOrigin();
 useEffect(()=>{const saved=document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('concilium-ui-language='))?.split('=')[1];if(saved&&/^(?:ru|en|es|fr|ar|hi|pt-BR|id|tr|zh-CN)$/.test(decodeURIComponent(saved)))setLanguage(decodeURIComponent(saved));},[]);
 useEffect(()=>{document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';},[language]);
 useEffect(()=>{let stored:string|null=null;try{stored=sessionStorage.getItem('concilium.bridge.session');}catch{}const token=conciliumSession(location.search,stored);if(window.parent===window||!/^[-a-f0-9]{36}$/.test(token))return;setSession(token);try{sessionStorage.setItem('concilium.bridge.session',token);}catch{}
  const receive=(e:MessageEvent)=>{if(e.source!==window.parent||e.origin!==origin||e.data?.session!==token||!['concilium.context','concilium.layout'].includes(e.data?.type))return;
   if(typeof e.data.wideView==='boolean')setWideState(e.data.wideView);
   if(e.data.type==='concilium.layout')return;
   if(typeof e.data.text==='string'&&e.data.text.length<=60000)setContext(e.data.text);
   const incoming=e.data.copy;
   if(incoming&&Object.keys(defaults).every(key=>typeof incoming[key]==='string'&&incoming[key].length<=300))setCopy(incoming);
   if(e.data.translations&&typeof e.data.translations==='object'&&Object.keys(e.data.translations).length<=5000&&Object.entries(e.data.translations).every(([key,value])=>key.length<=3000&&typeof value==='string'&&value.length<=6000)){if(e.data.language==='ru'||Object.keys(e.data.translations).length)setTranslations(e.data.translations);}
   if(typeof e.data.language==='string'&&/^(?:ru|en|es|fr|ar|hi|pt-BR|id|tr|zh-CN)$/.test(e.data.language)){setLanguage(e.data.language);document.cookie='concilium-ui-language='+encodeURIComponent(e.data.language)+'; path=/; SameSite=Strict';document.documentElement.lang=e.data.language;document.documentElement.dir=e.data.language==='ar'?'rtl':'ltr';}
  };
  window.addEventListener('message',receive);window.parent.postMessage({type:'concilium.ready',session:token},origin);return()=>window.removeEventListener('message',receive);
 },[]);
 useEffect(()=>{const controller=new AbortController();if(language==='ru'){setTranslations({});return;}fetch('/concilium-locales/'+encodeURIComponent(language)+'.json',{signal:controller.signal}).then(response=>{if(!response.ok)throw Error('catalog');return response.json();}).then(value=>{if(!controller.signal.aborted)setTranslations(value);}).catch(()=>{});return()=>controller.abort();},[language]);
 function setWide(value:boolean){setWideState(value);if(session)window.parent.postMessage({type:'concilium.viewer-layout',session,wideView:value},origin);}
 useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape'&&wide)setWide(false);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[wide,session]);
 useEffect(()=>{
  if(!session)return;
  const controller=new AbortController();let busy=false;
  const receive=(event:MessageEvent)=>{
   if(event.source!==window.parent||event.origin!==origin||!validBridgeTranslation(event.data,session))return;
   const request=event.data;
   const respond=(result:{text:string}|{error:string})=>{if(!controller.signal.aborted)window.parent.postMessage({type:'concilium.report-translation',session,requestId:request.requestId,language:request.language,...result},origin);};
   if(busy){respond({error:'translation_running'});return;}
   busy=true;
   void translateBridgeReport(request,fetch,controller.signal).then(text=>respond({text})).catch(()=>respond({error:'translation_failed'})).finally(()=>{busy=false;});
  };
  window.addEventListener('message',receive);
  return()=>{controller.abort();window.removeEventListener('message',receive);};
 },[session,origin]);
 function transfer(saveRequested=false){const fields=[...document.querySelectorAll<HTMLTextAreaElement>('textarea[data-concilium-report]')].filter(e=>e.value.trim());const reportLanguage=fields[0]?.dataset.conciliumReportLanguage??language;const outputs=fields.map(e=>e.value.trim());if(!outputs.length){setNotice(copy.empty);return;}const text=[...new Set(outputs)].join('\n\n');if(text.length>100000){setNotice(copy.tooLong);return;}window.parent.postMessage({type:'concilium.report',session,text,language:reportLanguage,...(saveRequested?{saveRequested:true}:{})},origin);setNotice(copy.sent);}
 useEffect(()=>{
  if(!session)return;
  const completed=()=>transfer();
  window.addEventListener('concilium.report-ready',completed);
  return()=>window.removeEventListener('concilium.report-ready',completed);
 },[session,copy,language]);
 return <ViewerLayout.Provider value={{wide,setWide}}><ViewerCopy.Provider value={copy}><UiLocale.Provider value={translate}>{session&&<section lang={language} dir={language==='ar'?'rtl':'ltr'} style={{padding:16,background:'#e8f4e9',color:'#18462d',fontSize:17,fontFamily:'system-ui,sans-serif',lineHeight:1.6,borderBottom:'1px solid #afc8b6'}} aria-label={copy.title}><strong>{copy.title}</strong>{context&&<details><summary>{copy.question}</summary><p style={{whiteSpace:'pre-wrap'}}>{context}</p></details>}<button type="button" style={{font:'inherit',padding:'9px 14px',background:'#2b6048',color:'#fff',border:0,borderRadius:6,cursor:'pointer'}} onClick={()=>transfer(true)}>{copy.transfer}</button>{notice&&<p role="status">{notice}</p>}</section>}{children}</UiLocale.Provider></ViewerCopy.Provider></ViewerLayout.Provider>;
}
