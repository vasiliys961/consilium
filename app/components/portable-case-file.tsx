'use client';
import {useEffect,useRef,useState} from 'react';
import {useWorkspaceLanguage} from '@/app/components/workspace-language';
import {createPortableCaseFile,restorePortableCaseFile,PortableCaseCollisionError,PORTABLE_CASE_EXTENSION} from '@/lib/portable-case-file';

const MAX_ARCHIVE_SIZE=110*1024*1024;
export function PortableCaseExport({caseId,beforeExport}:{caseId:string;beforeExport:()=>Promise<boolean>}){
 const {t}=useWorkspaceLanguage();
 const [opened,setOpened]=useState(false),[password,setPassword]=useState(''),[repeat,setRepeat]=useState('');
 const [busy,setBusy]=useState(false),[status,setStatus]=useState('');
 const [prepared,setPrepared]=useState<{url:string;filename:string}|null>(null);
 const urlRef=useRef<string|null>(null);
 useEffect(()=>()=>{if(urlRef.current)URL.revokeObjectURL(urlRef.current);},[]);
 async function exportOne(){
  if(password.length<12){setStatus(t('Пароль должен содержать не менее 12 символов.'));return;}
  if(password!==repeat){setStatus(t('Пароли не совпадают.'));return;}
  setBusy(true);setStatus('');
  try{
   if(!(await beforeExport())){setStatus(t('Не удалось сохранить последние изменения случая. Архив не создан.'));return;}
   const text=await createPortableCaseFile(caseId,password);
   if(urlRef.current)URL.revokeObjectURL(urlRef.current);
   const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
   const filename=`case-${caseId.slice(0,8)}${PORTABLE_CASE_EXTENSION}`;
   urlRef.current=url;setPrepared({url,filename});
   setPassword('');setRepeat('');
   const a=document.createElement('a');a.href=url;a.download=filename;a.click();
   setStatus(t('Зашифрованный файл случая готов. Если скачивание заблокировано, нажмите ссылку ниже. Пароль нельзя восстановить.'));
  }catch(error){setStatus(error instanceof Error?error.message:t('Не удалось создать файл случая.'));}
  finally{setBusy(false);}
 }
 return <details open={opened} onToggle={event=>setOpened(event.currentTarget.open)}>
  <summary>{t('Перенести случай · зашифрованный файл')}</summary>
  <p>{t('Файл содержит исходные материалы, историю анализов, ссылки и решения врача, включая локальные данные пациента. Сохраните его только в защищённом месте; он не отправляется на сервер.')}</p>
  <label>{t('Пароль файла (не менее 12 символов)')}<input type="password" autoComplete="new-password" minLength={12} disabled={busy} value={password} onChange={event=>setPassword(event.target.value)}/></label>
  <label>{t('Повторить пароль')}<input type="password" autoComplete="new-password" minLength={12} disabled={busy} value={repeat} onChange={event=>setRepeat(event.target.value)}/></label>
  <p><button type="button" disabled={busy||password.length<12||password!==repeat} onClick={()=>void exportOne()}>{t(busy?'Шифруем случай…':'Сохранить зашифрованный случай')}</button></p>
  {status&&<p role="status">{status}</p>}
  {prepared&&<p><a href={prepared.url} download={prepared.filename}>{t('Скачать подготовленный файл случая')}</a></p>}
 </details>;
}
export function PortableCaseImport({onImported}:{onImported:(id:string)=>Promise<void>}){
 const {t}=useWorkspaceLanguage();
 const [open,setOpen]=useState(false),[file,setFile]=useState<File|null>(null),[password,setPassword]=useState('');
 const [busy,setBusy]=useState(false),[status,setStatus]=useState('');
 async function importOne(){
  if(!file||!password){setStatus(t('Выберите зашифрованный файл и введите его пароль.'));return;}
  if(file.size>MAX_ARCHIVE_SIZE){setStatus(t('Файл слишком большой. Максимум 110 МБ.'));return;}
  setBusy(true);setStatus('');
  try{
   const text=await file.text();
   let result;
   try{result=await restorePortableCaseFile(text,password);}
   catch(error){
    if(!(error instanceof PortableCaseCollisionError))throw error;
    if(!window.confirm(t('Случай с таким кодом уже сохранён. Создать отдельную копию? Существующий случай не изменится.'))) {
     setStatus(t('Восстановление отменено, сохранённый случай не изменён.'));return;
    }
    result=await restorePortableCaseFile(text,password,'copy');
   }
   setPassword('');setFile(null);
   await onImported(result.id);
   setStatus(result.copied?t('Создана отдельная копия без замены существующего случая.') : t('Случай восстановлен вместе с материалами и историей. Откройте его в списке.'));
  }catch(error){setStatus(error instanceof Error?error.message:t('Не удалось открыть файл случая.'));}
  finally{setBusy(false);}
 }
 return <details open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary>{t('Восстановить случай из файла')}</summary>
  <p>{t('Для переноса или резервной копии выберите ранее сохранённый файл .doctor-opus-case и его пароль. Случай из корзины восстанавливается в списке без пароля.')}</p>
  <label>{t('Файл случая')}<input type="file" accept={PORTABLE_CASE_EXTENSION} disabled={busy} onChange={event=>{setFile(event.target.files?.[0]??null);setStatus('');}}/></label>
  <label>{t('Пароль файла')}<input type="password" autoComplete="current-password" disabled={busy} value={password} onChange={event=>setPassword(event.target.value)}/></label>
  <p><button type="button" disabled={busy||!file||!password} onClick={()=>void importOne()}>{t(busy?'Проверяем и восстанавливаем…':'Восстановить случай')}</button></p>
  {status&&<p role="status">{status}</p>}
 </details>;
}
