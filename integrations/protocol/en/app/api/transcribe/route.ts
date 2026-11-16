import {nativeAudioGuard} from '@/lib/concilium-privacy';
import {NextRequest,NextResponse} from 'next/server';
import {AssemblyAIProvider} from '@/lib/assemblyai';
import {calculateAudioTranscriptionCost} from '@/lib/cost-calculator';
import {getRequestLocale} from '@/lib/i18n/server';
import {resolveAssemblyAiLanguage} from '@/lib/i18n/stt-language';
import {transcribeAmbientOpenRouter,ambientModelSelection} from '@/lib/concilium-openrouter-stt';
export const runtime='nodejs';
const openRouterOnly=()=>process.env.CONCILIUM_OPENROUTER_ONLY==='1';
export async function POST(request:NextRequest){
 const privacyError=await nativeAudioGuard(request);if(privacyError)return privacyError;
 const port=process.env.NEXT_PUBLIC_CONCILIUM_PREVIEW==='1'?'3212':'3112';
 if(![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(request.headers.get('origin')??''))
  return NextResponse.json({success:false,error:'Local protocol origin required'},{status:403});
 const useOpenRouter=openRouterOnly();
 if(useOpenRouter&&!process.env.OPENROUTER_API_KEY)
  return NextResponse.json({success:false,error:'OPENROUTER_API_KEY is not configured in this local installation'},{status:503});
 if(!useOpenRouter&&!process.env.ASSEMBLYAI_API_KEY)
  return NextResponse.json({success:false,error:'AssemblyAI is not configured in the standalone installation'},{status:503});
 const runId=crypto.randomUUID(),started=Date.now();
 try{
  const form=await request.formData(),file=form.get('file');
  if(!(file instanceof File)||!file.size||file.size>(useOpenRouter?24:100)*1024*1024)
   return NextResponse.json({success:false,error:`Audio file required; maximum ${useOpenRouter?24:100} MB`},{status:400});
  const language=resolveAssemblyAiLanguage(String(form.get('language')||''),await getRequestLocale());
  const model=useOpenRouter?ambientModelSelection()[0]:'assemblyai/speech';
  console.info('CONCILIUM_MODEL '+JSON.stringify({event:'model.started',runId,model,provider:useOpenRouter?'openrouter':'assemblyai'}));
  if(useOpenRouter){
   const result=await transcribeAmbientOpenRouter(await file.arrayBuffer(),file.type||'audio/webm',language);
   const costUnits=result.costUsd===undefined?null:result.costUsd*100;
   console.info('CONCILIUM_MODEL '+JSON.stringify({event:'model.responded',runId,model:result.model,provider:'openrouter',durationMs:Date.now()-started,usageAvailable:costUnits!==null,costUsd:result.costUsd??null}));
   return NextResponse.json({success:true,transcript:result.text,duration:result.duration,cost:costUnits,costKnown:costUnits!==null,provider:'openrouter',model:result.model,speakerAssignment:'unverified',acousticSpeakerLabels:result.speakerLabels});
  }
  const provider=new AssemblyAIProvider(language);
  const result=await provider.transcribe(await file.arrayBuffer(),file.type||'audio/webm');
  console.info('CONCILIUM_MODEL '+JSON.stringify({event:'model.responded',runId,model,provider:'assemblyai',durationMs:Date.now()-started,usageAvailable:false}));
  return NextResponse.json({success:true,transcript:result.text,duration:result.duration,cost:calculateAudioTranscriptionCost(result.duration),costKnown:false,provider:provider.name,model,speakerAssignment:'unverified'});
 }catch(error){
  console.warn('CONCILIUM_MODEL '+JSON.stringify({event:'model.failed',runId,durationMs:Date.now()-started}));
  return NextResponse.json({success:false,error:error instanceof Error?error.message:'Audio transcription failed'},{status:502});
 }
}
