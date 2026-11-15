'use client';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE_NAME, type Locale } from './config.ts';
let activeLocale:Locale|null=null;
export function getClientLocale():Locale{
 if(activeLocale)return activeLocale;if(typeof document==='undefined')return DEFAULT_LOCALE;
 try{const value=document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(LOCALE_COOKIE_NAME+'='))?.split('=')[1];if(isLocale(value))return value;}catch{}
 try{const value=localStorage.getItem('opus-protocol-locale');if(isLocale(value))return value;}catch{}
 return DEFAULT_LOCALE;
}
/** Keep the active preference even when a browser restricts iframe storage/cookies. */
export function setClientLocale(locale:Locale){
 activeLocale=locale;try{document.cookie=`${LOCALE_COOKIE_NAME}=${locale}; Path=/; SameSite=Strict`;}catch{}try{localStorage.setItem('opus-protocol-locale',locale);}catch{}
}
