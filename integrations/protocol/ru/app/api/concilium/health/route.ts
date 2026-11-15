export const dynamic='force-dynamic';
export function GET(){return Response.json({module:'native-protocol',edition:process.env.CONCILIUM_PROTOCOL_EDITION||'ru',bridge:1,openrouterOnly:process.env.CONCILIUM_OPENROUTER_ONLY==='1'});}
