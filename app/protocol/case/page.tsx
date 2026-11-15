'use client';
import {LanguageSwitcher} from '@/app/components/language-switcher';
import {preferredInterfaceLanguage} from '@/lib/interface-language';
import {registerVaultFlush} from '@/lib/local-vault';
import {useEffect,useRef,useState} from 'react';
import {caseTitle,readCases,persistCase,protocolSource,type ClinicalCase} from '@/lib/casebook';
import {protocolDocumentMessage,nativeProtocolText,protocolForEdition,shouldSwitchProtocolLanguage,type ProtocolEdition} from '@/lib/protocol-bridge';
import {useWorkspaceLanguage} from '@/app/components/workspace-language';
import {WORKSPACE_LANGUAGES,type WorkspaceLanguage} from '@/lib/workspace-i18n';
type Status={installed:boolean;running:boolean;origin:string};
type Editions=Record<ProtocolEdition,Status>;
export default function OriginalProtocolModule(){
 const {t,language,setLanguage}=useWorkspaceLanguage();const frame=useRef<HTMLIFrameElement>(null),attempted=useRef(new Set<ProtocolEdition>()),deliveredSession=useRef('');
 const [cases,setCases]=useState<ClinicalCase[]>([]),[casesLoaded,setCasesLoaded]=useState(false),[selected,setSelected]=useState(''),[edition,setEdition]=useState<ProtocolEdition>('ru'),[session,setSession]=useState(''),[status,setStatus]=useState<Editions|null>(null),[linked,setLinked]=useState(false),[hasLoaded,setHasLoaded]=useState(false),[busy,setBusy]=useState(false),[starting,setStarting]=useState(false),[notice,setNotice]=useState('');
 const [documentLanguage,setDocumentLanguage]=useState<WorkspaceLanguage>('en');
 const sessionDrafts=useRef<Record<string,{source:string;text:string;state?:Record<string,string>}>>({});
 const [initialLanguage,setInitialLanguage]=useState<WorkspaceLanguage>('en');
 const current=cases.find(c=>c.id===selected),source=current?protocolSource(current):'',savedDocument=protocolForEdition(current?.protocols,edition),scratch=current?.protocolScratch?.[edition],savedProtocol=scratch?.text??nativeProtocolText(savedDocument),active=status?.[edition],origin=active?.origin??`http://127.0.0.1:${edition==='ru'?3111:3112}`;
 useEffect(()=>{
  setSession(crypto.randomUUID());
  const params=new URLSearchParams(location.search);
  const requested=WORKSPACE_LANGUAGES.find(item=>item.code===params.get('locale'))?.code??preferredInterfaceLanguage(localStorage.getItem('concilium-ui-language'),navigator.languages); 
  const preferred=params.get('edition')??(requested==='ru'?'ru':'en');
  setEdition(preferred==='ru'?'ru':'en');
  setLanguage(preferred==='ru'?'ru':requested==='ru'?'en':requested);
  setDocumentLanguage(preferred==='ru'?'ru':requested==='ru'?'en':requested);setInitialLanguage(preferred==='ru'?'ru':requested==='ru'?'en':requested);
  readCases().then(values=>{setCases(values);const id=params.get('case');if(id&&values.some(c=>c.id===id))setSelected(id);setCasesLoaded(true);}).catch(()=>{setCasesLoaded(true);setNotice('Не удалось открыть список случаев.');});
 },[]);
 useEffect(()=>{let alive=true;const check=async()=>{try{const response=await fetch('/api/integrations',{cache:'no-store'});if(!response.ok)return;const value=await response.json();if(alive&&value.protocol)setStatus(value.protocol);}catch{}};void check();const timer=setInterval(check,2500);return()=>{alive=false;clearInterval(timer);};},[]);
 async function start(){setStarting(true);setNotice('');try{const response=await fetch('/api/integrations/protocol',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({edition})});if(!response.ok){setStarting(false);setNotice(t('Не удалось запустить приложение протокола.'));}}catch{setStarting(false);setNotice(t('Не удалось запустить приложение протокола.'));}}
 useEffect(()=>{if(active?.running){setStarting(false);setHasLoaded(true);}if(active?.installed&&!active.running&&!attempted.current.has(edition)){attempted.current.add(edition);void start();}},[active?.installed,active?.running,edition,session]);
 useEffect(()=>{if(!starting)return;const timer=setTimeout(()=>{setStarting(false);setNotice(t('Запуск занимает больше обычного. Можно повторить попытку.'));},45000);return()=>clearTimeout(timer);},[starting,t]);
 useEffect(()=>{if(!linked||!session||!casesLoaded||deliveredSession.current===session)return;deliveredSession.current=session;frame.current?.contentWindow?.postMessage({type:'concilium.protocol.context',session,text:source,savedSource:sessionDrafts.current[`${selected}:${edition}`]?.source??scratch?.source??savedDocument?.sourceSnapshot,protocol:sessionDrafts.current[`${selected}:${edition}`]?.text??savedProtocol,state:sessionDrafts.current[`${selected}:${edition}`]?.state??scratch?.state??savedDocument?.nativeState,format:sessionDrafts.current[`${selected}:${edition}`]?'reasoning-draft':scratch?'reasoning-draft':savedDocument?.format,locale:savedDocument?.locale},origin);},[linked,session,source,savedProtocol,savedDocument,scratch,origin,casesLoaded]);
 useEffect(()=>{const receive=(event:MessageEvent)=>{
  if(event.origin!==origin||event.source!==frame.current?.contentWindow||event.data?.session!==session)return;
  if(event.data.type==='concilium.protocol.ready'){setLinked(true);if(edition==='en')frame.current?.contentWindow?.postMessage({type:'concilium.protocol.locale',session,locale:documentLanguage},origin);return;}
  if(event.data.type==='concilium.protocol.locale.active')return;
  if(event.data.type==='concilium.protocol.state'){setBusy(event.data.busy===true);return;}
  const document=protocolDocumentMessage(event.data,session,edition);if(!document)return;
  if(!selected){setNotice(t('Выберите случай перед передачей протокола.'));return;}
  void readCases().then(async values=>{const value=values.find(c=>c.id===selected);if(!value){setNotice(t('Случай не найден. Протокол остаётся в отдельном приложении.'));return;}const updated={...value,updated:new Date().toISOString(),protocolScratch:{...value.protocolScratch,[edition]:undefined},protocols:[document,...(value.protocols??[]).filter(p=>p.id!==document.id)]};await persistCase(updated);setCases(old=>old.map(c=>c.id===updated.id?updated:c));setNotice(t('Протокол сохранён в случае.'));}).catch(()=>setNotice(t('Не удалось сохранить протокол. Текст остаётся в отдельном приложении.')));
 };window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[origin,session,selected,edition,documentLanguage,t,language,setLanguage]);
 useEffect(()=>registerVaultFlush(async()=>{
  if(!linked||!frame.current?.contentWindow)return;
  const snapshot=await new Promise<{source:string;text:string;state?:Record<string,string>}>((resolve,reject)=>{
   const timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(Error('Не удалось сохранить черновик модуля перед блокировкой.'));},3000);
   function receive(event:MessageEvent){if(event.source!==frame.current?.contentWindow||event.origin!==origin||event.data?.session!==session||event.data?.type!=='concilium.protocol.snapshot')return;const value=event.data;if(typeof value.source!=='string'||typeof value.text!=='string'||value.source.length+value.text.length>200000)return;clearTimeout(timer);window.removeEventListener('message',receive);resolve({source:value.source,text:value.text,...(value.state&&typeof value.state==='object'&&Object.values(value.state).every(s=>typeof s==='string')&&JSON.stringify(value.state).length<=200000?{state:value.state}:{})});}
   window.addEventListener('message',receive);frame.current!.contentWindow!.postMessage({type:'concilium.protocol.snapshot.request',session},origin);
  });
  if(!snapshot.source.trim()&&!snapshot.text.trim())return;
  if(!selected)throw Error('Выберите случай и сохраните черновик перед блокировкой.');
  const values=await readCases(),value=values.find(c=>c.id===selected);if(!value)throw Error('Случай не найден.');await persistCase({...value,protocolScratch:{...value.protocolScratch,[edition]:{...snapshot,at:new Date().toISOString()}}});
 }),[linked,origin,session,selected,edition]);
 async function changeLanguage(next:WorkspaceLanguage){
  const nextEdition=next==='ru'?'ru':'en';
  if(busy||!shouldSwitchProtocolLanguage(next,language,edition,documentLanguage))return;
  if(nextEdition!==edition&&linked&&frame.current?.contentWindow){
   await new Promise<void>(resolve=>{
    const finish=()=>{window.removeEventListener('message',receive);clearTimeout(timer);resolve();};
    const receive=(event:MessageEvent)=>{if(event.source!==frame.current?.contentWindow||event.origin!==origin||event.data?.session!==session||event.data?.type!=='concilium.protocol.snapshot')return;const value=event.data;if(typeof value.source==='string'&&typeof value.text==='string'&&value.source.length+value.text.length<=200000)sessionDrafts.current[`${selected}:${edition}`]={source:value.source,text:value.text,...(value.state&&typeof value.state==='object'?{state:value.state}:{})};finish();};
    const timer=setTimeout(finish,1200);window.addEventListener('message',receive);frame.current!.contentWindow!.postMessage({type:'concilium.protocol.snapshot.request',session},origin);
   });
  }
  setDocumentLanguage(next);setLanguage(next);
  if(nextEdition!==edition){setEdition(nextEdition);setStarting(false);resetSession(next);}
  else if(edition==='en')frame.current?.contentWindow?.postMessage({type:'concilium.protocol.locale',session,locale:next},origin);
 }
 function resetSession(nextLanguage:WorkspaceLanguage=documentLanguage){setInitialLanguage(nextLanguage);setHasLoaded(false);setSession(crypto.randomUUID());setLinked(false);setBusy(false);setNotice('');}
 return <main className="module-page" style={{padding:20,fontSize:18,lineHeight:1.7}}><nav style={{display:'flex',gap:20,flexWrap:'wrap'}}><a href="/workspace">← {t('Клинические случаи')}</a><a href={`/protocol/structured${selected?'?case='+encodeURIComponent(selected):''}`}>{t('Краткий редактор Concilium')}</a></nav><h1>{t('Протокол приёма · отдельное приложение')}</h1><p>{edition==='ru'?t('Создайте протокол приёма по шаблону: введите текст или продиктуйте, проверьте и скачайте DOCX.'):t('Составьте клинический черновик, дополните его и подготовьте итоговую запись SOAP на выбранном языке.')}</p><LanguageSwitcher disabled={busy} onChange={next=>void changeLanguage(next)}/><div style={{display:'flex',gap:18,flexWrap:'wrap',alignItems:'start'}}><section><strong>{t('Версия приложения')}</strong><div className="genetic-actions">{(['ru','en'] as const).map(value=><button key={value} type="button" disabled={busy} aria-pressed={edition===value} onClick={()=>void changeLanguage(value==='ru'?'ru':language==='ru'?'en':language)}>{t(value==='ru'?'Русский протокол · самостоятельное приложение':'Doctor Opus Global · 10 языков')}</button>)}</div><p><strong>{t('Язык протокола')}: {edition==='ru'?'RU':documentLanguage.toUpperCase()}</strong></p></section><label>{t('Сохранение результата')}<select value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);resetSession();}}><option value="">{t('Работать отдельно')}</option>{cases.map(c=><option key={c.id} value={c.id}>{caseTitle(c,c.id.slice(0,8))}</option>)}</select></label></div><p className="module-hint">{t('Работайте отдельно или выберите случай: его данные станут контекстом исследования, а результат можно будет сохранить в его истории.')}</p><p>{t('Проверьте протокол в приложении ниже и нажмите его кнопку сохранения в Concilium. Смена случая или версии начинает новый сеанс; сначала сохраните свою работу.')}</p>{!selected&&<p>{t('Без выбранного случая можно работать отдельно и скачивать документы. Для сохранения в Concilium выберите случай.')}</p>}{notice&&<p role="status" style={{background:'#e9f2e7',padding:14}}>{t(notice)}</p>}{!active?.running&&<p>{!status?t('Проверяем подключение'):starting?t('Запускаем исходное приложение…'):active?.installed?<button onClick={()=>void start()}>{t('Открыть приложение протокола')}</button>:t('Исходное приложение этой версии не установлено.')}</p>}{(active?.running||hasLoaded)&&session&&<><p><a href={`${origin}/protocol?protocolLocale=${edition==='ru'?'ru':documentLanguage}`} target="_blank" rel="noreferrer">{t('Открыть отдельным окном ↗')}</a></p><iframe key={session} ref={frame} title={t('Исходное приложение протокола')} src={`${origin}/protocol?conciliumSession=${session}&protocolLocale=${edition==='ru'?'ru':initialLanguage}&conciliumOrigin=${encodeURIComponent(typeof window!=='undefined'?window.location.origin:'http://127.0.0.1:3107')}`} allow="microphone" style={{width:'100%',height:'90vh',minHeight:900,border:'1px solid #c9bba8',borderRadius:6,background:'#e7e0d4'}}/></>}</main>;
}
