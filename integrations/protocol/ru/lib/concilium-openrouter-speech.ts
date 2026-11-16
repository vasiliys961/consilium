import type{SpeechProvider,TranscriptionResult}from'./speech-provider';
import {transcribeAmbientOpenRouter,AMBIENT_PRIMARY_STT} from './concilium-openrouter-stt';
/** Concilium adapter: completed audio via OpenRouter /audio/transcriptions. */
export class ConciliumOpenRouterSpeech implements SpeechProvider{
 readonly name='OpenRouter STT · '+AMBIENT_PRIMARY_STT;
 async transcribe(audioData:ArrayBuffer,mimeType='audio/webm'):Promise<TranscriptionResult>{
  const result=await transcribeAmbientOpenRouter(audioData,mimeType,'ru');
  return {text:result.text,duration:result.duration,...(result.costUsd!==undefined?{costUsd:result.costUsd}:{})};
 }
}
