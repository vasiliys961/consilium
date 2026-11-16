import {converseWithPhysician,parsePhysicianAgentRequest} from '@/lib/physician-agent';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;

/** Local installation only. At most one cheap assistant call concurrently, 12/min.
 * Unlike a full chat service, this endpoint does not persist messages.
 * The browser keeps the editable conversation in memory.
 */
let active=0;
const recent:number[]=[];
export async function POST(request:Request){
 const url=new URL(request.url),host=request.headers.get('host'),origin=request.headers.get('origin');
 const allowed=['127.0.0.1','localhost','[::1]'].map(name=>`${name}:${url.port}`);
 if(!host||!allowed.includes(host)||origin!==`http://${host}`||!['127.0.0.1','localhost','[::1]'].includes(url.hostname))
  return Response.json({error:'local_only'},{status:403,headers:{'Cache-Control':'no-store'}});
 if(!request.headers.get('content-type')?.startsWith('application/json'))
  return Response.json({error:'invalid_format'},{status:415});
 const raw=await request.text();
 if(raw.length>16_000)return Response.json({error:'size'},{status:413});
 let parsed:unknown;
 try{parsed=JSON.parse(raw)}catch{return Response.json({error:'invalid_json'},{status:400})}
 const checked=parsePhysicianAgentRequest(parsed);
 if('error'in checked)return Response.json({error:checked.error},{status:checked.status});
 const now=Date.now();while(recent.length&&recent[0]<now-60_000)recent.shift();
 if(active>=1||recent.length>=12)return Response.json({error:'busy',retryManually:true},{status:429,headers:{'Cache-Control':'no-store'}});
 recent.push(now);active++;
 try{
  // One OpenRouter call, never run any module, no app state mutation.
  const value=await converseWithPhysician(checked,process.env,fetch,request.signal);
  return Response.json(value,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch{
  return Response.json({error:'agent_failed'},{status:502,headers:{'Cache-Control':'no-store'}});
 }finally{active--}
}
