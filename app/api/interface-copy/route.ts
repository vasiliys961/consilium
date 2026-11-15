import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {radiologyLanguage} from '@/lib/radiology-locale';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const locale=radiologyLanguage(new URL(request.url).searchParams.get('locale'));
 if(locale==='ru')return Response.json({});
 try{return Response.json(JSON.parse(await readFile(join(process.cwd(),'lib','radiology-locales',`${locale}.json`),'utf8')),{headers:{'Cache-Control':'public, max-age=300'}});}catch{return Response.json({},{status:503});}
}
