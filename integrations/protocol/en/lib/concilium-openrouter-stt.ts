/**
 * Concilium-only offline ambient transcription via the existing OpenRouter key.
 * This API accepts completed audio files, not a realtime stream.
 * Never send audio before the signed per-file nativeAudioGuard approval.
 */
export const AMBIENT_PRIMARY_STT='microsoft/mai-transcribe-2';
export const AMBIENT_FALLBACK_STT='openai/whisper-large-v3-turbo';
export const AMBIENT_STT_MODELS=[AMBIENT_PRIMARY_STT,AMBIENT_FALLBACK_STT] as const;
export type AmbientSttModel=typeof AMBIENT_STT_MODELS[number];
export interface AmbientSttResult {
 text:string;
 duration:number;
 costUsd?:number;
 model:string;
 /** Speaker labels supplied by STT are acoustic IDs, NOT verified doctor/patient roles. */
 speakerLabels:boolean;
}
function audioFormat(mime:string):string{
 const format=mime.split(';')[0].trim().toLowerCase();
 const map:Record<string,string>={
  'audio/webm':'webm','audio/ogg':'ogg','audio/opus':'ogg','audio/wav':'wav','audio/x-wav':'wav',
  'audio/mp4':'m4a','audio/x-m4a':'m4a','audio/m4a':'m4a','audio/mpeg':'mp3','audio/mp3':'mp3',
  'audio/flac':'flac','audio/x-flac':'flac','audio/aac':'aac'
 };
 const value=map[format];if(!value)throw Error('Unsupported audio format; use WAV, WebM, Ogg, MP3, M4A, FLAC or AAC.');
 return value;
}
function speakerText(response:any):{text:string;speakerLabels:boolean}{
 const segments=Array.isArray(response?.segments)?response.segments:Array.isArray(response?.utterances)?response.utterances:[];
 const withSpeakers=segments.some((segment:any)=>segment?.speaker!==undefined||segment?.speaker_id!==undefined);
 if(withSpeakers){
  const lines=segments.map((segment:any)=>{
   const spoken=String(segment?.text??'').trim();if(!spoken)return '';
   const speaker=segment?.speaker??segment?.speaker_id;
   return speaker===undefined?spoken:`Speaker ${String(speaker).slice(0,16)}: ${spoken}`;
  }).filter(Boolean);
  if(lines.length)return {text:lines.join('\n'),speakerLabels:true};
 }
 const text=String(response?.text??'').trim();
 return {text,speakerLabels:false};
}
export function ambientModelSelection(env:NodeJS.ProcessEnv=process.env):AmbientSttModel[]{
 const selected=env.CONCILIUM_AMBIENT_STT_MODEL?.trim()||AMBIENT_PRIMARY_STT;
 if(!AMBIENT_STT_MODELS.includes(selected as AmbientSttModel))throw Error('Unsupported CONCILIUM_AMBIENT_STT_MODEL; use the approved OpenRouter STT model list.');
 return [selected as AmbientSttModel,...AMBIENT_STT_MODELS.filter(model=>model!==selected)];
}
export async function transcribeAmbientOpenRouter(audio:ArrayBuffer,mime:string,language?:string):Promise<AmbientSttResult>{
 const key=process.env.OPENROUTER_API_KEY?.trim();if(!key)throw Error('OPENROUTER_API_KEY is not configured');
 if(audio.byteLength===0||audio.byteLength>24*1024*1024)throw Error('Audio must be 1 byte to 24 MB. Split longer recordings into smaller files.');
 const format=audioFormat(mime);
 const lang=language?.trim().toLowerCase()||undefined;
 if(lang&&!/^[a-z]{2}$/.test(lang))throw Error('Invalid transcription language');
 const endpoint=(process.env.OPENROUTER_BASE_URL?.trim()||'https://openrouter.ai/api/v1').replace(/\/+$/,'')+'/audio/transcriptions';
 const encoded=Buffer.from(audio).toString('base64');
 for(const [index,model] of ambientModelSelection().entries()){
  const isMai=model===AMBIENT_PRIMARY_STT;
  const body={
   model,input_audio:{data:encoded,format},...(lang?{language:lang}:{}),
   response_format:isMai?'verbose_json':'json',
   ...(isMai?{provider:{options:{azure:{diarization:{enabled:true},enhancedMode:{modelOptions:{transcribeStyle:'verbatim'}}}}}}:{})
  };
  let response:Response;
  try{
   response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(65000)});
  }catch{throw Error('OpenRouter transcription connection failed; retry manually to avoid duplicate billing.');}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   // No automatic retry on timeouts, rate limits or server errors: the earlier
   // request might have been billed despite the failure.
   if(index===0&&[400,404,422].includes(response.status))continue;
   throw Error(`OpenRouter STT failed (HTTP ${response.status}) for ${model}.`);
  }
  const transcript=speakerText(data);if(!transcript.text)throw Error('OpenRouter returned an empty transcript; review the recording before retrying.');
  const duration=Number(data?.usage?.seconds??data?.duration??0);
  const price=Number(data?.usage?.cost);
  return {text:transcript.text,duration:Number.isFinite(duration)&&duration>0?duration:0,...(Number.isFinite(price)&&price>=0?{costUsd:price}:{}),model,speakerLabels:transcript.speakerLabels};
 }
 throw Error('No compatible OpenRouter STT model available.');
}
