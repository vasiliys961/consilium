'use client';
import {useCallback,useEffect,useState} from 'react';
import {workspaceText,type WorkspaceLanguage} from '@/lib/workspace-i18n';
import {interfaceLanguage,preferredInterfaceLanguage} from '@/lib/interface-language';
export function useWorkspaceLanguage(){
 const [language,setLanguage]=useState<WorkspaceLanguage>('ru');
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  let saved:string|null=null;try{saved=localStorage.getItem('concilium-ui-language');}catch{}
  const next=preferredInterfaceLanguage(saved,navigator.languages??[navigator.language]);
  setLanguage(next);setReady(true);
  const listener=(event:Event)=>{const code=interfaceLanguage((event as CustomEvent).detail);if(code)setLanguage(code);};
  const storage=(event:StorageEvent)=>{if(event.key==='concilium-ui-language'){const code=interfaceLanguage(event.newValue);if(code)setLanguage(code);}};
  window.addEventListener('concilium-language',listener);window.addEventListener('storage',storage);
  return()=>{window.removeEventListener('concilium-language',listener);window.removeEventListener('storage',storage);};
 },[]);
 useEffect(()=>{if(ready){document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';}},[language,ready]);
 const choose=useCallback((next:WorkspaceLanguage)=>{const code=interfaceLanguage(next);if(!code)return;try{localStorage.setItem('concilium-ui-language',code);}catch{}setLanguage(code);window.dispatchEvent(new CustomEvent('concilium-language',{detail:code}));},[]);
 const t=useCallback((value:string)=>workspaceText(language,value),[language]);
 return {language,setLanguage:choose,t,ready};
}
