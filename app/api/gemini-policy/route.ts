import{geminiPolicy}from'@/lib/gemini-pricing';
import{GEMINI_COOKIE}from'@/lib/gemini-policy';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 return Response.json(await geminiPolicy(process.env,request.headers.get('cookie')),{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
 const origin=request.headers.get('origin'),host=request.headers.get('host');
 // Next may reconstruct request.url with localhost even when the browser used
 // 127.0.0.1. Compare the actual browser origin to the HTTP Host instead.
 if(!host||!origin||!['http://'+host,'https://'+host].includes(origin))return Response.json({error:'origin'},{status:403});
 let body;try{body=await request.json();}catch{return Response.json({error:'input'},{status:400});}
 if(body?.model!=='argon'&&body?.model!=='flash')return Response.json({error:'model'},{status:400});
 const policy=await geminiPolicy(process.env,request.headers.get('cookie'));
 if(body.model==='argon'&&body.revision!==policy.revision)return Response.json({error:'price_changed',policy},{status:409});
 const cookie=`${GEMINI_COOKIE}=${body.model}.${policy.revision}`;
 const updated=await geminiPolicy(process.env,cookie);
 return Response.json(updated,{headers:{'Cache-Control':'no-store','Set-Cookie':`${cookie}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict`}});
}
