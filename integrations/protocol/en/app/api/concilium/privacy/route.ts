import {prepareNativePayload,signNativePrivacy} from '@/lib/concilium-privacy';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const port=new URL(request.url).port,origin=request.headers.get('origin');if(origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(origin))return Response.json({error:'origin'},{status:403});
 const raw=await request.text();if(raw.length>1000000)return Response.json({error:'size'},{status:413});
 try{const body=JSON.parse(raw),payload=body.consent===true?body.payload:prepareNativePayload(body.payload);return Response.json({payload,...(body.consent===true?{token:signNativePrivacy(payload)}:{})},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'input'},{status:400});}
}
