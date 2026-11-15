import type{SpeechProvider,TranscriptionResult}from'./speech-provider';
/** Adapter used only by the integrated application, never the source app. */
export class ConciliumOpenRouterSpeech implements SpeechProvider{
 readonly name='OpenRouter · Gemini 3.8 Flash';
 async transcribe(audioData:ArrayBuffer,mimeType='audio/wav'):Promise<TranscriptionResult>{
  const key=process.env.OPENROUTER_API_KEY;if(!key)throw Error('OPENROUTER_API_KEY is not configured');
  if(audioData.byteLength>32*1024*1024)throw Error('Для расшифровки через OpenRouter разделите запись на файлы до 32 МБ.');
  const subtype=mimeType.split(';')[0].split('/')[1];const format=({mpeg:'mp3','x-wav':'wav',mp4:'m4a'} as Record<string,string>)[subtype]??subtype;
  if(!['wav','mp3','m4a','ogg','aac','flac','webm'].includes(format))throw Error('Unsupported audio format');
  const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model:'google/gemini-3.8-flash',max_tokens:12000,temperature:0,messages:[{role:'system',content:'Transcribe only the spoken words in their original language. Preserve numbers, units, medication names and negations. Do not summarize or invent speech. Output only the transcript.'},{role:'user',content:[{type:'input_audio',input_audio:{data:Buffer.from(audioData).toString('base64'),format}}]}]}),signal:AbortSignal.timeout(180000)});
  const data=await response.json();const text=data.choices?.[0]?.message?.content?.trim();
  if(!response.ok||data.error||data.choices?.[0]?.finish_reason!=='stop'||!text)throw Error('OpenRouter did not return a complete transcript');
  return {text,duration:0,...(typeof data.usage?.cost==='number'?{costUsd:data.usage.cost}:{})};
 }
}
