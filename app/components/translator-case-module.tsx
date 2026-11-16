'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {caseTitle,persistTranslationNote,readCases,type ClinicalCase} from '@/lib/casebook';
import {translationTransferMessage} from '@/lib/translator-case-bridge';
import {localOrigin} from '@/lib/local-ports';
import {useWorkspaceLanguage} from './workspace-language';
type TranslatorStatus={installed:boolean;running:boolean;ready:boolean;origin:string};
const origin=localOrigin('translator');

export default function TranslatorCaseModule(){
 const {t}=useWorkspaceLanguage();
 const frame=useRef<HTMLIFrameElement>(null),attempted=useRef(false);
 const [cases,setCases]=useState<ClinicalCase[]>([]),[selected,setSelected]=useState(''),[session,setSession]=useState(''),
 [status,setStatus]=useState<TranslatorStatus|null>(null),[starting,setStarting]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>{
  setSession(crypto.randomUUID());
  readCases().then(values=>{
   setCases(values);
   const id=new URLSearchParams(location.search).get('case');
   if(id&&values.some(value=>value.id===id))setSelected(id);
  }).catch(()=>setNotice('Для сохранения перевода откройте защищённое хранилище в клинических случаях.'));
 },[]);
 useEffect(()=>{
  let alive=true;
  async function check(){
   try{
    const r=await fetch('/api/integrations/translator',{cache:'no-store'});
    if(!r.ok)throw Error('status');
    const value:TranslatorStatus=await r.json();
    if(!alive)return;
    setStatus(value);
    if(value.running)setStarting(false);
    else if(value.installed&&!attempted.current){
     attempted.current=true;
     void start();
    }
   }catch{if(alive)setNotice(t('Медицинский переводчик пока недоступен. Клинический случай сохранён.'));}
  }
  void check();const timer=setInterval(check,2500);
  return()=>{alive=false;clearInterval(timer);};
 },[t]);
 async function start(){
  setStarting(true);setNotice('');
  try{
   const r=await fetch('/api/integrations/translator',{method:'POST'});
   if(!r.ok)throw Error('module');
  }catch{setStarting(false);setNotice(t('Переводчик не удалось открыть. История случая не изменена.'));}
 }
 useEffect(()=>{
  const receive=(event:MessageEvent)=>{
   if(event.origin!==origin||event.source!==frame.current?.contentWindow||!selected||!session)return;
   const transfer=translationTransferMessage(event.data,session);
   if(!transfer)return;
   const id=selected,replyOrigin=origin,source=frame.current.contentWindow;
   void persistTranslationNote(id,transfer).then(()=>{
    setNotice(t('Перевод добавлен к выбранному случаю как непроверенная запись разговора.'));
    window.dispatchEvent(new CustomEvent('concilium-case-updated'));
    source.postMessage({type:'concilium.translator.saved',session,id:transfer.id,ok:true},replyOrigin);
   }).catch(error=>{
    const message=error instanceof Error?error.message:t('Не удалось сохранить перевод.');
    setNotice(message);
    source.postMessage({type:'concilium.translator.saved',session,id:transfer.id,ok:false,error:message},replyOrigin);
   });
  };
  window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);
 },[selected,session,t]);
 const childOrigin=status?.origin===origin?status.origin:origin;
 return <main className="module-page" style={{padding:22,fontSize:17,lineHeight:1.6}}>
  <nav><Link href={selected?`/workspace?case=${encodeURIComponent(selected)}`:'/workspace'}>← {t('Клинические случаи')}</Link></nav>
  <h1>{t('Медицинский перевод')}</h1>
  <p>{t('Переводчик открывается по запросу. Микрофон и платный голосовой сеанс включаются только после отдельного согласия. Для сохранения разговора в историю врача нажмите кнопку передачи перевода.')}</p>
  <label>{t('Клинический случай')}
   <select value={selected} onChange={e=>{
    if(selected&&!window.confirm(t('При смене случая несохранённый перевод останется только в переводчике текущего сеанса. Продолжить?')))return;
    const id=e.target.value;setSelected(id);setSession(crypto.randomUUID());setNotice('');
    const url=new URL(location.href);if(id)url.searchParams.set('case',id);else url.searchParams.delete('case');
    history.replaceState(history.state,'',url.pathname+url.search);
   }}>
    <option value="">{t('Работать отдельно — не сохранять в случай')}</option>
    {cases.map(value=><option key={value.id} value={value.id}>{caseTitle(value,value.id.slice(0,8))}</option>)}
   </select>
  </label>
  {selected&&<p>{t('В переводчик не отправляется анамнез, имя пациента или материалы случая. Сохраняются только законченные фрагменты разговора, которые врач явно выбрал для передачи. Запись требует проверки доз и отрицаний.')}</p>}
  {notice&&<p role="status">{notice}</p>}
  {status?.running&&session?<iframe ref={frame} key={session} title={t('Медицинский переводчик')} src={childOrigin+(selected?`/?conciliumSession=${encodeURIComponent(session)}`:'/')} allow="microphone; autoplay" style={{width:'100%',height:'90vh',minHeight:820,border:'1px solid #c9bba8',borderRadius:8}}/>:
   <section>
    <p>{starting?t('Открываем переводчик…'):status?.installed?t('Подключаем медицинский переводчик…'):t('Модуль переводчика ещё не подготовлен на этом компьютере.')}</p>
    {status?.installed&&!starting&&<button type="button" onClick={()=>void start()}>{t('Повторить открытие переводчика')}</button>}
   </section>
  }
  {status?.running&&status.ready===false&&<p role="status">{t('Переводчик открыт, но голосовой сервис пока недоступен. Для работы требуется предварительно подготовленный доступ.')}</p>}
 </main>;
}
