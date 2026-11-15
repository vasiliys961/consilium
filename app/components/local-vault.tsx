'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {createLocalVault,openLocalVault,vaultStatus,lockVault,flushVault,exportVault,restoreVault} from '@/lib/local-vault';
import {usePathname} from 'next/navigation';
import {useWorkspaceLanguage} from './workspace-language';
import styles from './privacy.module.css';

const CaseStorageAvailable=createContext(false);
export function useCaseStorageAvailable(){return useContext(CaseStorageAvailable);}

export function LocalVault({children}:{children:ReactNode}){
 const {t}=useWorkspaceLanguage();
 const [state,setState]=useState<'loading'|'plain'|'locked'|'open'>('loading');
 const [password,setPassword]=useState(''),[repeat,setRepeat]=useState('');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [showSettings,setShowSettings]=useState(false),[settingPassword,setSettingPassword]=useState(false);
 const lastActivity=useRef(Date.now()),picker=useRef<HTMLInputElement>(null);
 const pathname=usePathname();
 const bypass=pathname.startsWith('/phone/send')||pathname==='/privacy/example';
 const available=state==='plain'||state==='open';

 useEffect(()=>{
  if(bypass)return;
  let active=true;
  vaultStatus().then(s=>{if(active)setState(s.open?'open':s.configured?'locked':'plain');})
   .catch(()=>{if(active)setError('Не удалось открыть локальное хранилище. Закройте старые вкладки и повторите.');});
  return()=>{active=false;};
 },[bypass]);

 const close=useCallback(async()=>{
  try{
   await flushVault();
   lockVault();
   setState('locked');
   setPassword('');
   setError('');
  }catch{setError('Не удалось сохранить изменения перед блокировкой. Экспортируйте случай.');}
 },[]);

 useEffect(()=>{
  if(state!=='open'||busy||bypass)return;
  lastActivity.current=Date.now();
  const touch=()=>{lastActivity.current=Date.now();};
  const activityEvents=['pointerdown','keydown','concilium-activity'];
  for(const type of activityEvents)window.addEventListener(type,touch);
  const integrationActivity=(event:MessageEvent)=>{
   if(['http://127.0.0.1:3111','http://127.0.0.1:3112','http://127.0.0.1:3110'].includes(event.origin)&&
     Array.from(document.querySelectorAll('iframe')).some(frame=>frame.contentWindow===event.source))touch();
  };
  window.addEventListener('message',integrationActivity);
  const timer=setInterval(()=>{if(Date.now()-lastActivity.current>15*60*1000)void close();},15000);
  return()=>{
   clearInterval(timer);
   window.removeEventListener('message',integrationActivity);
   for(const type of activityEvents)window.removeEventListener(type,touch);
  };
 },[state,busy,bypass,close]);

 function cancelSetup(){
  setPassword('');
  setRepeat('');
  setSettingPassword(false);
  setError('');
 }

 async function submitPassword(){
  if(state==='plain'&&password!==repeat){setError('Пароли не совпадают.');return;}
  setBusy(true);
  setError('');
  try{
   if(state==='plain')await createLocalVault(password);
   else await openLocalVault(password);
   cancelSetup();
   setState('open');
  }catch{
   setError(state==='plain'?'Не удалось включить защиту. Проверьте пароль, закройте другие вкладки и повторите.':'Не удалось открыть хранилище. Проверьте пароль.');
  }finally{setBusy(false);}
 }

 async function backup(){
  setBusy(true);
  setError('');
  try{
   const url=URL.createObjectURL(new Blob([await exportVault()],{type:'application/json'}));
   const a=document.createElement('a');
   a.href=url;
   a.download='concilium-backup-'+new Date().toISOString().slice(0,10)+'.concilium';
   a.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch{setError('Не удалось создать резервную копию.');}
  finally{setBusy(false);}
 }

 async function restore(file:File|undefined){
  if(!file)return;
  const pass=window.prompt(t('Введите пароль резервной копии. Он используется только на этом устройстве.'));
  if(!pass)return;
  setBusy(true);
  setError('');
  try{
   await restoreVault(await file.text(),pass);
   window.location.reload();
  }catch{setError('Не удалось восстановить копию: проверьте файл и его пароль.');}
  finally{setBusy(false);}
 }

 if(bypass)return children;
 const publicPage=['/','/protocol','/translator','/drug-labels','/consult'].includes(pathname);
 const passwordForm=<form onSubmit={event=>{event.preventDefault();void submitPassword();}}>
  <label>{t('Пароль хранилища')}<input type="password" autoComplete={state==='plain'?'new-password':'current-password'} minLength={12} required disabled={busy} value={password} onChange={event=>setPassword(event.target.value)}/></label>
  {state==='plain'&&<label>{t('Повторите пароль')}<input type="password" autoComplete="new-password" minLength={12} required disabled={busy} value={repeat} onChange={event=>setRepeat(event.target.value)}/></label>}
  <div className={styles.storageActions}>
   <button disabled={busy}>{t(busy?'Подождите…':state==='plain'?'Включить шифрование':'Открыть хранилище')}</button>
   {state==='plain'&&<button type="button" disabled={busy} onClick={cancelSetup}>{t('Отмена')}</button>}
  </div>
 </form>;

 return <CaseStorageAvailable.Provider value={available}>
  {available&&<>
   <div className={styles.storageBar}>
    <button aria-expanded={showSettings} aria-controls="case-storage-settings" disabled={busy} onClick={()=>{setShowSettings(!showSettings);if(showSettings)cancelSetup();}}>{t('Хранение случаев')}</button>
    <span>{t(state==='plain'?'Без пароля · в этом браузере':'🔒 Случаи хранятся зашифрованно в этом браузере')}</span>
   </div>
   {showSettings&&<section id="case-storage-settings" className={styles.info} aria-label={t('Хранение случаев')}>
    {state==='plain'?<>
     <p>{t('Без пароля случаи сохраняются в этом браузере без шифрования. Для пробной работы используйте обезличенные примеры.')}</p>
     {settingPassword?<div className={styles.storageForm}>
      <p>{t('Пароль от 12 символов. После включения сохранённые случаи будут зашифрованы. Забытый пароль восстановить нельзя.')}</p>
      {passwordForm}
     </div>:<button disabled={busy} onClick={()=>setSettingPassword(true)}>{t('Включить пароль')}</button>}
    </>:<>
     <p>{t('Забытый пароль восстановить нельзя. Защита действует для закрытого хранилища; на открытом компьютере данные доступны врачу. Блокировка — после 15 минут бездействия. Сохраняйте работу в отдельных модулях перед уходом.')}</p>
     <div className={styles.storageActions}>
      <button disabled={busy} onClick={()=>void backup()}>{t('Резервная копия')}</button>
      <button disabled={busy} onClick={()=>void close()}>{t('Заблокировать')}</button>
     </div>
    </>}
    <p>{t('Safari, Chrome и другие адреса приложения хранят случаи отдельно. Очистка данных браузера может удалить случаи.')}</p>
    {state==='plain'&&<p>{t('Восстановление зашифрованной копии также включает пароль.')}</p>}
    <button disabled={busy} onClick={()=>picker.current?.click()}>{t('Восстановить из файла')}</button>
    <input ref={picker} hidden type="file" accept=".concilium,application/json" onChange={event=>{void restore(event.target.files?.[0]);event.target.value='';}}/>
   </section>}
  </>}
  {state==='locked'&&!publicPage&&<main className={styles.vault}>
   <h1>{t('Открыть хранилище случаев')}</h1>
   <p>{t('Введите пароль этого браузера. Он не отправляется в интернет.')}</p>
   {passwordForm}
  </main>}
  {state==='loading'&&!publicPage&&!error&&<main className={styles.vault}><p>{t('Проверяем локальное хранилище…')}</p></main>}
  {error&&<p role="alert" className={styles.info}>{t(error)}</p>}
  {(available||publicPage)&&<div key="application">{children}</div>}
 </CaseStorageAvailable.Provider>;
}
