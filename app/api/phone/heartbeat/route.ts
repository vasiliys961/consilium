import {touchPhoneSession} from '@/packages/phone/bridge';
export const runtime='nodejs';
export async function POST(request:Request){
 const body=await request.json().catch(()=>null);if(typeof body?.token!=='string'||!touchPhoneSession(body.token))return Response.json({connected:false},{status:404});
 return Response.json({connected:true},{headers:{'cache-control':'no-store'}});
}
