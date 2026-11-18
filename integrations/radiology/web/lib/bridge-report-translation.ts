import {RADIOLOGY_REPORT_LANGUAGES,type RadiologyReportLanguage} from './report-language.ts';
import {reviewedConnectionReady} from './reviewed-connection-notice.ts';
type TranslationRequest={type:'concilium.translate-report';session:string;requestId:string;text:string;language:RadiologyReportLanguage};
export function validBridgeTranslation(value:unknown,session:string):value is TranslationRequest{
 if(!value||typeof value!=='object')return false;
 const v=value as TranslationRequest;
 return Object.keys(v).sort().join(',')==='language,requestId,session,text,type'&&v.type==='concilium.translate-report'&&v.session===session&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v.requestId)&&
  typeof v.text==='string'&&v.text.trim().length>0&&v.text.length<=16000&&Object.hasOwn(RADIOLOGY_REPORT_LANGUAGES,v.language);
}
/** Reuse the reviewed text-only follow-up, never the clinical interpreter or image reader. */
export async function translateBridgeReport(value:TranslationRequest,fetchImpl:typeof fetch=fetch,signal?:AbortSignal):Promise<string>{
 if(!validBridgeTranslation(value,value.session))throw Error('invalid_translation');
 const probe=await fetchImpl('/api/ai/deidentified-openrouter-review',{cache:'no-store',credentials:'same-origin',signal});
 if(!probe.ok||!reviewedConnectionReady(await probe.json()))throw Error('translation_unavailable');
 const response=await fetchImpl('/api/ai/complete-volume-opus',{method:'POST',credentials:'same-origin',signal,
  headers:{'Content-Type':'application/json','X-Opus-Reviewed-Volume':'1'},
  body:JSON.stringify({mode:'translate',report:value.text,outputLanguage:value.language,coverage:'As stated in the supplied report',clinicalContext:'',question:'',history:[],acknowledgeReviewedText:true})});
 if(!response.ok)throw Error('translation_failed');
 const result=await response.json();
 if(typeof result?.text!=='string'||!result.text.trim()||result.text.length>16000)throw Error('translation_failed');
 return result.text;
}
