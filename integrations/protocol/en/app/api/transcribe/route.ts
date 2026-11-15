import {nativeAudioGuard} from '@/lib/concilium-privacy';
/** Local Concilium adapter using the original Global AssemblyAI language/diarization implementation. */
import {NextRequest,NextResponse} from 'next/server';
import {AssemblyAIProvider} from '@/lib/assemblyai';
import {calculateAudioTranscriptionCost} from '@/lib/cost-calculator';
import {getRequestLocale} from '@/lib/i18n/server';
import {resolveAssemblyAiLanguage} from '@/lib/i18n/stt-language';
export async function POST(request:NextRequest){
  const privacyError=await nativeAudioGuard(request);if(privacyError)return privacyError;
 if(!['http://127.0.0.1:3112','http://localhost:3112'].includes(request.headers.get('origin')??''))return NextResponse.json({success:false,error:'Local origin required'},{status:403});
 if(!process.env.ASSEMBLYAI_API_KEY)return NextResponse.json({success:false,error:'AssemblyAI is not configured in the local installation'},{status:503});
 const runId=crypto.randomUUID(),started=Date.now();let called=false;const receipt=(event:string,fields:Record<string,unknown>={})=>console.log('CONCILIUM_MODEL '+JSON.stringify({event,runId,model:'assemblyai/speech',provider:'assemblyai',...fields}));
 try{const form=await request.formData(),file=form.get('file');if(!(file instanceof File)||!file.size||file.size>100*1024*1024)return NextResponse.json({success:false,error:'Audio file required; maximum 100 MB'},{status:400});
 called=true;receipt('model.started');
 const language=resolveAssemblyAiLanguage(String(form.get('language')||''),await getRequestLocale());const provider=new AssemblyAIProvider(language);const {text,duration}=await provider.transcribe(await file.arrayBuffer(),file.type||'audio/webm');receipt('model.responded',{httpStatus:200,durationMs:Date.now()-started,usageAvailable:false});return NextResponse.json({success:true,transcript:text,duration,cost:calculateAudioTranscriptionCost(duration),provider:provider.name});
 }catch{if(called)receipt('model.failed',{durationMs:Date.now()-started});return NextResponse.json({success:false,error:'Audio transcription failed'},{status:502});}
}
