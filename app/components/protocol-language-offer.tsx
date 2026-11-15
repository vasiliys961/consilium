'use client';

import {useEffect,useRef,useState} from 'react';
import {WORKSPACE_LANGUAGES,type WorkspaceLanguage} from '@/lib/workspace-i18n';
import {useWorkspaceLanguage} from './workspace-language';

type Mode='ru'|'en'|'multi';

/** Opens ONLY the existing protocol module. No LLM call is made by this chooser. */
export function ProtocolLanguageOffer({onChoose,onDismiss,disabled=false}:{
 onChoose:(languages:WorkspaceLanguage[])=>void;
 onDismiss:()=>void;
 disabled?:boolean;
}){
 const {t}=useWorkspaceLanguage();
 const [mode,setMode]=useState<Mode>('ru');
 const [selected,setSelected]=useState<WorkspaceLanguage[]>(['ru','en']);
 const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{heading.current?.focus();},[]);
 function toggle(code:WorkspaceLanguage){
  setSelected(old=>old.includes(code)?old.filter(item=>item!==code):[...old,code]);
 }
 const languages=mode==='multi'?selected:mode==='en'?['en' as const]:['ru' as const];
 return <section role="dialog" aria-modal="false" aria-labelledby="protocol-language-offer-title" style={{border:'1px solid var(--border, #aac0b4)',borderRadius:10,padding:18,margin:'18px 0',background:'var(--surface, transparent)'}}>
  <h3 id="protocol-language-offer-title" ref={heading} tabIndex={-1} style={{marginTop:0}}>{t('Разбор завершён. Оформить протокол?')}</h3>
  <p>{t('Клинический разбор уже сохранён. Выбор языка откроет существующий модуль протокола с данными случая — повторного консилиума не будет.')}</p>
  <div role="group" aria-label={t('Выбор языка протокола')} style={{display:'flex',flexWrap:'wrap',gap:12}}>
   <label><input type="radio" name="protocol-output-mode" checked={mode==='ru'} disabled={disabled} onChange={()=>setMode('ru')}/>{t('Русский')}</label>
   <label><input type="radio" name="protocol-output-mode" checked={mode==='en'} disabled={disabled} onChange={()=>setMode('en')}/>English</label>
   <label><input type="radio" name="protocol-output-mode" checked={mode==='multi'} disabled={disabled} onChange={()=>setMode('multi')}/>{t('Другие языки / несколько версий')}</label>
  </div>
  {mode==='multi'&&<fieldset style={{margin:'12px 0'}}><legend>{t('Выберите языки отдельных версий протокола')}</legend><div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
   {WORKSPACE_LANGUAGES.map(item=><label key={item.code}><input type="checkbox" disabled={disabled} checked={selected.includes(item.code)} onChange={()=>toggle(item.code)}/>{item.name}</label>)}
  </div></fieldset>}
  <p><small>{t('Формирование текста в модуле может потребовать отдельного модельного запроса. Переключение языка само по себе платный анализ не запускает; клинические выводы не переводятся незаметно.')}</small></p>
  <div style={{display:'flex',flexWrap:'wrap',gap:12}}>
   <button type="button" disabled={disabled||!languages.length} onClick={()=>onChoose([...languages])}>{t('Перейти к оформлению протокола')}</button>
   <button type="button" disabled={disabled} onClick={onDismiss}>{t('Пока продолжить работу со случаем')}</button>
  </div>
 </section>;
}
