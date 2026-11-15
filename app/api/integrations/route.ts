import {integrationStatus} from '@/lib/local-integrations';
export const dynamic='force-dynamic';
export async function GET(){return Response.json(await integrationStatus(),{headers:{'Cache-Control':'no-store'}});}
