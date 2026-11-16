import {phoneDeliveryStatus} from '@/packages/phone/bridge';
export const runtime='nodejs';

/** No clinical files or content returned, only receipt state for authorized token. */
export async function GET(request:Request){
 const url=new URL(request.url),token=url.searchParams.get('token')?.trim()??'';
 const id=Number(url.searchParams.get('id')??'');
 const state=phoneDeliveryStatus(token,id);
 if(state===null)return Response.json({status:'expired'},{status:404,headers:{'cache-control':'no-store'}});
 if(state==='unknown')return Response.json({status:state},{status:404,headers:{'cache-control':'no-store'}});
 return Response.json({status:state},{headers:{'cache-control':'no-store'}});
}
