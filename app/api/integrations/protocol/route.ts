import {startProtocol,protocolHealth} from '@/lib/protocol-integration';
import {allowedAppOrigin} from '@/lib/local-ports';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 if(!allowedAppOrigin(request.headers.get('origin')))return Response.json({error:'origin'},{status:403});
 let body:unknown;try{body=await request.json();}catch{return Response.json({error:'input'},{status:400});}
 const edition=(body as {edition?:unknown}|null)?.edition;if(edition!=='ru'&&edition!=='en')return Response.json({error:'edition'},{status:400});
 if(await protocolHealth(edition))return Response.json({running:true});
 return startProtocol(edition)?Response.json({starting:true},{status:202}):Response.json({error:'module_missing'},{status:503});
}
