'use client';
import {LOCALES} from '@/lib/locale';
import {useWorkspaceLanguage} from './workspace-language';
export function LanguageSwitcher({disabled=false,onChange}:{disabled?:boolean;onChange?:(language:import('@/lib/workspace-i18n').WorkspaceLanguage)=>void}){
 const {language,setLanguage}=useWorkspaceLanguage();
 return <div className="lang module-languages" role="group" aria-label="Language">
  {LOCALES.filter(item=>item.code!=='ms').map(item=><button key={item.code} type="button" title={item.name} disabled={disabled} aria-pressed={language===item.code} onClick={()=>{(onChange??setLanguage)(item.code);}}>{item.label}</button>)}
 </div>;
}
