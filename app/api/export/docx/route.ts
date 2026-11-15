import {createProtocolDocx} from '@/packages/protocol/docx';
export async function POST(request:Request){
 const body=request.headers.get("content-type")?.includes("application/json")?await request.json().catch(()=>null):Object.fromEntries(await request.formData().catch(()=>new FormData()));
 if(!body||typeof body.text!=='string'||typeof body.title!=='string'||body.text.length>250000)return Response.json({error:'invalid_document'},{status:400});
 const bytes=createProtocolDocx({title:body.title,text:body.text,locale:typeof body.locale==='string'?body.locale:'ru'});
 return new Response(new Uint8Array(bytes),{headers:{'content-type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','content-disposition':'attachment; filename="clinical-note.docx"','cache-control':'no-store'}});
}
