import {getRequestLocale} from '@/lib/i18n/server';
export const dynamic='force-dynamic';
export async function GET(){return Response.json({module:'native-protocol',edition:process.env.CONCILIUM_PROTOCOL_EDITION||'en',bridge:1,openrouterOnly:process.env.CONCILIUM_OPENROUTER_ONLY==='1',assemblyAi:Boolean(process.env.ASSEMBLYAI_API_KEY),locale:await getRequestLocale()});}
