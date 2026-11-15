import {validCaseInput} from '@/lib/input-validation';
import {verifyPrivacy} from '@/lib/privacy-ticket';
import {parseLocale} from '@/lib/locale';
import {reviewGuidelines} from '@/lib/guideline-review';

export const dynamic='force-dynamic';
export const maxDuration=120;

export async function POST(request:Request){
 const url=new URL(request.url);
 const port=url.port,host=request.headers.get('host'),origin=request.headers.get('origin');
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)
  ||!host||!['127.0.0.1','localhost','[::1]'].some(name=>host===name+':'+port)
  ||origin!=='http://'+host)return Response.json({error:'origin'},{status:403});
 const raw=await request.text();
 if(raw.length>20000)return Response.json({error:'size'},{status:413});
 let body:unknown;
 try{body=JSON.parse(raw);}catch{return Response.json({error:'json'},{status:400});}
 if(!validCaseInput(body))return Response.json({error:'invalid'},{status:400});
 const {privacy,...reviewed}=body as Record<string,unknown>&{privacy?:{consent?:boolean;token?:string}};
 if(!privacy?.consent||!verifyPrivacy(reviewed,privacy.token))return Response.json({error:'privacy_review_required'},{status:428});
 const text=reviewed.text;
 if(typeof text!=='string'||text.length>14000)return Response.json({error:'invalid_text'},{status:422});
 let input:unknown;
 try{input=JSON.parse(text);}catch{return Response.json({error:'expected_structured_request'},{status:422});}
 if(!input||typeof input!=='object'||Array.isArray(input))return Response.json({error:'invalid_guideline_request'},{status:422});
 const args=input as Record<string,unknown>;
 if(typeof args.topic!=='string'||typeof args.context!=='string'||args.topic.length<4||args.topic.length>350||args.context.length>9000)return Response.json({error:'invalid_guideline_request'},{status:422});
 try{
  const result=await reviewGuidelines({topic:args.topic,context:args.context,locale:parseLocale(reviewed.locale)},{
   OPENROUTER_API_KEY:process.env.OPENROUTER_API_KEY,
  },fetch);
  return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch{
  return Response.json({error:'guideline_review_failed'},{status:502});
 }
}
