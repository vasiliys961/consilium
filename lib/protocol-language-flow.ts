import {WORKSPACE_LANGUAGES,type WorkspaceLanguage} from './workspace-i18n.ts';

const SUPPORTED=new Set<string>(WORKSPACE_LANGUAGES.map(item=>item.code));
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function protocolLanguages(value:readonly string[]):WorkspaceLanguage[]{
 const languages:WorkspaceLanguage[]=[];
 for(const item of value)if(SUPPORTED.has(item)&&!languages.includes(item as WorkspaceLanguage))languages.push(item as WorkspaceLanguage);
 return languages;
}

export function protocolLanguageHref(caseId:string,selected:readonly string[]):string{
 if(!UUID.test(caseId))throw Error('invalid_case_id');
 const languages=protocolLanguages(selected);
 if(!languages.length)throw Error('select_protocol_language');
 const query=new URLSearchParams({case:caseId,locale:languages[0]});
 if(languages.length>1)query.set('locales',languages.join(','));
 return '/protocol/case?'+query.toString();
}

export function protocolLanguagePlan(search:URLSearchParams):WorkspaceLanguage[]{
 const locale=search.get('locale');
 const raw=search.get('locales');
 const values=raw?.split(',')??[];
 const selection=protocolLanguages(locale?[locale,...values]:values);
 return selection.length?selection:['ru'];
}
