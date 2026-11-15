import {startTranslator,translatorStatus} from '@/lib/translator-integration';
export const dynamic='force-dynamic';

export async function GET(){return Response.json(await translatorStatus());}

export async function POST(request:Request){
  if(!['http://127.0.0.1:3107','http://localhost:3107'].includes(request.headers.get('origin')??''))return Response.json({error:'origin'},{status:403});
  const status=await translatorStatus();
  if(status.running)return Response.json(status);
  return startTranslator()?Response.json({starting:true},{status:202}):Response.json({error:'module_missing'},{status:503});
}
