import type {Locale} from './i18n/config';
import en from './native-locales/en.json';
import es from './native-locales/es.json';import fr from './native-locales/fr.json';import ar from './native-locales/ar.json';import hi from './native-locales/hi.json';import pt from './native-locales/pt-BR.json';import id from './native-locales/id.json';import ms from './native-locales/ms.json';import tr from './native-locales/tr.json';import zh from './native-locales/zh-CN.json';
export const nativeCatalogs:Record<Locale,Record<string,string>>={en,es,fr,ar,hi,'pt-BR':pt,id,ms,tr,'zh-CN':zh};
export function nativeProtocolUi(locale:Locale,text:string){return nativeCatalogs[locale]?.[text]||text;}
export const NATIVE_LANGUAGES=[['en','English'],['es','Español'],['fr','Français'],['ar','العربية'],['hi','हिन्दी'],['pt-BR','Português'],['id','Bahasa Indonesia'],['ms','Bahasa Melayu'],['tr','Türkçe'],['zh-CN','简体中文']] as const;
