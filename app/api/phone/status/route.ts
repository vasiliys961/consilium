import {phoneDeliveryStatus} from '@/packages/phone/bridge';
export const runtime='nodejs';

/** No clinical files or content returned, only receipt state for authorized token. */
export async function POST(request:Request){
 const body=await request.json().catch(()=>null);
 const token=typeof body?.token==='string'?body.token.trim():'';
 const id=typeof body?.id==='number'?body.id:NaN;
 const state=phoneDeliveryStatus(token,id);
 if(state===null)return Response.json({status:'expired'},{status:404,headers:{'cache-control':'no-store'}});
 if(state==='unknown')return Response.json({status:state},{status:404,headers:{'cache-control':'no-store'}});
 return Response.json({status:state},{headers:{'cache-control':'no-store'}});
}
