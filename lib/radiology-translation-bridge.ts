import type {WorkspaceLanguage} from './workspace-i18n.ts';
export function requestRadiologyTranslation(target:Window,origin:string,session:string,text:string,language:WorkspaceLanguage):Promise<string>{
 if(!text.trim()||text.length>16000)return Promise.reject(Error('translation_size'));
 const requestId=crypto.randomUUID();
 return new Promise((resolve,reject)=>{
  const finish=(error?:Error,result?:string)=>{clearTimeout(timer);window.removeEventListener('message',receive);if(error)reject(error);else resolve(result!);};
  const receive=(event:MessageEvent)=>{
   const v=event.data;
   if(event.origin!==origin||event.source!==target||v?.type!=='concilium.report-translation'||v.session!==session||v.requestId!==requestId||v.language!==language)return;
   if(typeof v.text==='string'&&v.text.trim()&&v.text.length<=16000)finish(undefined,v.text);
   else finish(Error('translation_failed'));
  };
  const timer=setTimeout(()=>finish(Error('translation_timeout')),285000);
  window.addEventListener('message',receive);
  try{target.postMessage({type:'concilium.translate-report',session,requestId,text,language},origin);}catch{finish(Error('translation_failed'));}
 });
}
