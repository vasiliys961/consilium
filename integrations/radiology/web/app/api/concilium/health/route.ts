export function GET(){return Response.json({module:'opus-radiology',bridge:1,openrouterOnly:process.env.CONCILIUM_OPENROUTER_ONLY==='1'});}
