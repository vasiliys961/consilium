'use client';
import {LanguageSwitcher} from './language-switcher';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {useWorkspaceLanguage} from './workspace-language';
import {audioConsent} from '../../integrations/translator/lib/audio-consent';
import styles from './privacy.module.css';

type Status={installed:boolean;running:boolean;ready?:boolean;origin:string};

export function StandaloneTool({tool}:{tool:'protocol'|'translator'}){
  const {t,language}=useWorkspaceLanguage();
  const [edition,setEdition]=useState<'ru'|'en'>('ru');
  const [status,setStatus]=useState<Status|null>(null);
  const [starting,setStarting]=useState(false);
  const [failed,setFailed]=useState(false);
  const isProtocol=tool==='protocol';
  const endpoint=`/api/integrations/${tool}`;

  useEffect(()=>{if(isProtocol&&new URLSearchParams(location.search).get('edition')==='en')setEdition('en');},[isProtocol]);
  useEffect(()=>{
    let mounted=true;
    async function refresh(){
      try{
        const response=await fetch(isProtocol?'/api/integrations':endpoint,{cache:'no-store'});
        if(!response.ok)return;
        const data=await response.json();
        const next:Status=isProtocol?data.protocol[edition]:data;
        if(mounted){setStatus(next);if(next.running)setStarting(false);}
      }catch{}
    }
    void refresh();
    const timer=setInterval(refresh,2500);
    return()=>{mounted=false;clearInterval(timer);};
  },[endpoint,edition,isProtocol]);
  useEffect(()=>{
    if(!starting)return;
    const timer=setTimeout(()=>{setStarting(false);setFailed(true);},45000);
    return()=>clearTimeout(timer);
  },[starting]);

  async function start(){
    setStarting(true);setFailed(false);
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({edition})});
      if(!response.ok)throw Error('module');
    }catch{setStarting(false);setFailed(true);}
  }

  return <main className={styles.vault}>
    <Link href="/workspace">← {t('Клинические случаи')}</Link>
    <LanguageSwitcher/><h1>{t(isProtocol?'Протокол приёма · отдельное приложение':'Медицинский перевод')}</h1>
    {isProtocol?<>
      <label>{t('Версия приложения')}
        <select value={edition} disabled={starting} onChange={event=>{setEdition(event.target.value as 'ru'|'en');setStatus(null);setFailed(false);}}>
          <option value="ru">{t('Русский протокол · самостоятельное приложение')}</option>
          <option value="en">{t('Doctor Opus Global · 10 языков')}</option>
        </select>
      </label>
      <p>{t(edition==='ru'?'Полное самостоятельное русское приложение: шаблоны, голос, RAG, рецепты, взаимодействия и DOCX.':'Отдельный модуль Doctor Opus Global: рабочий диагностический черновик, дополнения врача и итоговая SOAP-запись. Собственные промпты, десять языков, стиль русского приложения.')}</p>
    </>:<p className={styles.warning}>{audioConsent[language].split(/[.。।]/,1)[0]}.</p>}
    {failed&&<p role="alert">{t('Не удалось запустить модуль.')}</p>}
    {status?.running?<p><a href={`${status.origin}${isProtocol?'/protocol':'/'}`} target="_blank" rel="noreferrer">{t('Открыть отдельным окном ↗')}</a></p>:<button disabled={starting||!status?.installed} onClick={()=>void start()}>{t(starting?'Запускаем исходное приложение…':!status?'Проверяем подключение':'Запустить модуль')}</button>}
    {status&&!status.installed&&<p>{t('Исходное приложение этой версии не установлено.')}</p>}
    {status?.running&&status.ready===false&&!isProtocol&&<p>{t('○ ИИ не подключён')}</p>}
  </main>;
}
