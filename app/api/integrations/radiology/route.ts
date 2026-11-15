import {startRadiology,radiologyHealth} from '@/lib/local-integrations';
export const dynamic='force-dynamic';
export async function POST(request:Request){if(request.headers.get('origin')!=='http://127.0.0.1:3107')return Response.json({error:'origin'},{status:403});if(await radiologyHealth())return Response.json({running:true});return startRadiology()?Response.json({starting:true},{status:202}):Response.json({error:'module_missing'},{status:503});}
