import {hearWindow,wavDurationSeconds} from '../packages/translator/wav.ts';

export const SPECIALIST_STT_MODEL='openai/whisper-large-v3-turbo';
/** OpenRouter published starting rate, 17 November 2026. Actual billing takes precedence. */
export const SPECIALIST_STT_USD_PER_SECOND=0.000003;

export interface SpecialistTranscript{
 text:string;model:typeof SPECIALIST_STT_MODEL;
 seconds:number;sttCost:number;sttBillingSource:'openrouter'|'estimate';
}
function estimate(seconds:number):number{
 return Math.round(seconds*SPECIALIST_STT_USD_PER_SECOND*1_000_000_000)/1_000_000_000;
}
/** One explicit transcription request with the existing signed audio consent.
 * No additional LLM/role model, no retry after transport errors or timeouts.
 */
export async function transcribeSpecialistVoice(
 env:Record<string,string|undefined>,wav:string,
 fetchImpl:typeof fetch=fetch,
):Promise<SpecialistTranscript|null>{
 const duration=wavDurationSeconds(wav);
 if(hearWindow(duration)!=='short'||duration===null)return null;
 const key=env.OPENROUTER_API_KEY?.trim();
 if(!key)return null; // no Polza fallback
 const base=(env.OPENROUTER_BASE_URL?.trim()||'https://openrouter.ai/api/v1').replace(/\/+$/,'');
 // Prevent a configurable endpoint from silently transmitting clinical audio
 // to a local HTTP or an arbitrary non-HTTPS server.
 if(!base.startsWith('https://'))return null;
 const data=wav.replace(/^data:audio\/wav;base64,/, '').replace(/\s/g,'');
 const response=await fetchImpl(base+'/audio/transcriptions',{
  method:'POST',
  headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
  body:JSON.stringify({model:SPECIALIST_STT_MODEL,input_audio:{data,format:'wav'},response_format:'json'}),
  signal:AbortSignal.timeout(65000),
 });
 if(!response.ok)throw Error('Specialist STT unsuccessful; do not retry automatically');
 const json=await response.json() as {text?:unknown;model?:unknown;usage?:{seconds?:unknown;cost?:unknown}};
 const text=typeof json.text==='string'?json.text.trim().slice(0,4000):'';
 if(!text)return null;
 const seconds=typeof json.usage?.seconds==='number'&&Number.isFinite(json.usage.seconds)&&json.usage.seconds>0?json.usage.seconds:duration;
 const billed=typeof json.usage?.cost==='number'&&Number.isFinite(json.usage.cost)&&json.usage.cost>=0?json.usage.cost:null;
 return {text,model:SPECIALIST_STT_MODEL,seconds,sttCost:billed??estimate(seconds),sttBillingSource:billed===null?'estimate':'openrouter'};
}
