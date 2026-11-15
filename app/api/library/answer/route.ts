import {validCaseInput} from '@/lib/input-validation';
import {verifyPrivacy} from '@/lib/privacy-ticket';
import {answerLibrary} from '@/lib/library-answer';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const url=new URL(request.url),host=request.headers.get('host');
 if(!host||!['127.0.0.1','localhost','[::1]'].some(name=>host===`${name}:${url.port}`)||request.headers.get('origin')!==`http://${host}`)return Response.json({error:'origin'},{status:403});
 const raw=await request.text();if(raw.length>12000000)return Response.json({error:'size'},{status:413});
 let data;try{data=JSON.parse(raw);}catch{return Response.json({error:'json'},{status:400});}
 if(!validCaseInput(data))return Response.json({error:'invalid'},{status:400});
 const {privacy,...body}=data as typeof data & {privacy?:{consent?:boolean;token?:string}};
 if(!privacy?.consent||!verifyPrivacy(body,privacy.token))return Response.json({error:'privacy_review_required'},{status:428});
 if(!body.text?.trim()||!(body.referenceFiles??[]).some((file:{librarySource?:unknown;text?:string;image?:string})=>file.librarySource&&(file.text?.trim()||file.image)))return Response.json({error:'no_excerpts'},{status:400});
 try{return Response.json(await answerLibrary(body,{OPENROUTER_API_KEY:process.env.OPENROUTER_API_KEY}));}
 catch{return Response.json({error:'answer_failed'},{status:502});}
}
