import {getRequestLocale} from '@/lib/i18n/server';
import {ambientModelSelection} from '@/lib/concilium-openrouter-stt';
export const dynamic='force-dynamic';
export async function GET(){
 const openrouterOnly=process.env.CONCILIUM_OPENROUTER_ONLY==='1';
 const configured=openrouterOnly?Boolean(process.env.OPENROUTER_API_KEY):Boolean(process.env.ASSEMBLYAI_API_KEY);
 return Response.json({
  module:'native-protocol',edition:process.env.CONCILIUM_PROTOCOL_EDITION||'en',bridge:1,
  openrouterOnly,assemblyAi:!openrouterOnly&&Boolean(process.env.ASSEMBLYAI_API_KEY),
  speechConfigured:configured,speechProvider:openrouterOnly?'openrouter':'assemblyai',
  speechModel:openrouterOnly?ambientModelSelection()[0]:'assemblyai/speech',
  locale:await getRequestLocale()
 },{headers:{'Cache-Control':'no-store'}});
}
