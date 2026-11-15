import {WORKSPACE_LANGUAGES,type WorkspaceLanguage} from './workspace-i18n.ts';
export function interfaceLanguage(value:unknown):WorkspaceLanguage|null {
 if(typeof value!=='string')return null;
 const exact=WORKSPACE_LANGUAGES.find(item=>item.code.toLowerCase()===value.toLowerCase());
 if(exact)return exact.code;
 const base=value.toLowerCase().split('-')[0];
 if(base==='pt')return 'pt-BR';if(base==='zh')return 'zh-CN';
 return WORKSPACE_LANGUAGES.find(item=>item.code===base)?.code??null;
}
export function preferredInterfaceLanguage(saved:unknown,languages:readonly string[]):WorkspaceLanguage {
 return interfaceLanguage(saved)??languages.map(interfaceLanguage).find(Boolean)??'en';
}
