import {startRadiology,radiologyHealth,radiologyReadiness} from '@/lib/local-integrations';
import {allowedAppOrigin} from '@/lib/local-ports';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 if(!allowedAppOrigin(request.headers.get('origin')))return Response.json({error:'origin'},{status:403});
 if(await radiologyHealth())return Response.json({running:true});
 const readiness=radiologyReadiness();
 if(readiness!=='ready')return Response.json({error:readiness},{status:503});
 return startRadiology()?Response.json({starting:true},{status:202}):Response.json({error:'module_start_failed'},{status:503});
}
