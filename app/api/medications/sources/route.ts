import {discoverMedicationLabels} from '@/lib/medication-review';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const {port}=new URL(request.url),host=request.headers.get('host');
 if(!host||!['127.0.0.1','localhost','[::1]'].some(name=>host===`${name}:${port}`)||request.headers.get('origin')!==`http://${host}`)return Response.json({error:'origin'},{status:403});
 const raw=await request.text();if(raw.length>5000)return Response.json({error:'size'},{status:413});
 try{const data=JSON.parse(raw);if(typeof data.names!=='string'||data.names.length>3000)return Response.json({error:'names'},{status:400});return Response.json(await discoverMedicationLabels(data.names,fetch,request.signal));}
 catch{return Response.json({error:'sources'},{status:503});}
}
