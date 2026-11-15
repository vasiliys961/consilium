import {validDrugName,drugNameCandidates,resolveDrugName} from '@/lib/drug-name';
import { normalizeDrugQuery, searchDrugLabels } from '@/lib/drug-labels';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const {port} = new URL(request.url);
  const allowed = ['127.0.0.1', 'localhost', '[::1]'].map(host => `http://${host}:${port}`);
  const origin = request.headers.get('origin');
  if (origin && !allowed.includes(origin)) return Response.json({error:'origin'}, {status:403});

  try {
    const raw = await request.text();
    if (raw.length > 600) return Response.json({error:'invalid_drug_query'}, {status:400});
    const value = JSON.parse(raw);
    if (!validDrugName(value?.name)) {
      return Response.json({error:'invalid_drug_query'}, {status:400});
    }
    let labels:Awaited<ReturnType<typeof searchDrugLabels>>=[];let resolvedName='';
    for(const name of drugNameCandidates(value.name)){labels=await searchDrugLabels(name,fetch,request.signal);resolvedName=name;if(labels.length)break;}
    if(!labels.length&&!request.signal.aborted){const name=await resolveDrugName(value.name,process.env,request.signal);if(name&&name!==resolvedName){resolvedName=name;labels=await searchDrugLabels(name,fetch,request.signal);}}
    return Response.json({labels,resolvedName}, {headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({error:'invalid_drug_query'}, {status:400});
    return Response.json({error:'drug_labels_unavailable'}, {status:503});
  }
}
