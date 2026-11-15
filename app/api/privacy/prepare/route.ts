import {validCaseInput} from '@/lib/input-validation';
import {parseLocale} from '@/lib/locale';
import {preparePrivacy} from '@/lib/privacy-prepare';
import {signPrivacy} from '@/lib/privacy-ticket';
import {CHAT_TEXT_PURPOSE,cleanChatText} from '@/lib/privacy-chat';
import {REVIEW_LIMIT} from '@/lib/specialist-options';
export const dynamic='force-dynamic';export const maxDuration=120;
export async function POST(request:Request){
 if(!['127.0.0.1','localhost','[::1]'].includes(new URL(request.url).hostname))return Response.json({error:'local_processor_required'},{status:403});
 const port=new URL(request.url).port,host=request.headers.get('host'),origin=request.headers.get('origin');if(host&&!['127.0.0.1:'+port,'localhost:'+port,'[::1]:'+port].includes(host))return Response.json({error:'local_processor_required'},{status:403});if(origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port,'http://[::1]:'+port].includes(origin))return Response.json({error:'origin'},{status:403});
 const raw=await request.text();if(raw.length>15_000_000)return Response.json({error:'size'},{status:413});
 try{
  const value=JSON.parse(raw);
  if(!validCaseInput(value.body))return Response.json({error:'input'},{status:400});
  if(value.purpose===CHAT_TEXT_PURPOSE){
   const {text,locale,sourceLocale,externalSearch}=value.body;
   if(value.consent!==true||!text?.trim()||text.length>REVIEW_LIMIT)return Response.json({error:'input'},{status:400});
   const cleaned=cleanChatText(text);
   const body={text:cleaned.text,locale:parseLocale(locale),...(sourceLocale?{sourceLocale}:{}),externalSearch:externalSearch===true,retain:false};
   return Response.json({body,token:signPrivacy({purpose:CHAT_TEXT_PURPOSE,body})},{headers:{'Cache-Control':'no-store'}});
  }
  const result=await preparePrivacy(value.body,{finalize:value.finalize===true,allowAudio:value.allowAudio===true});
  if(value.finalize===true)result.token=signPrivacy(result.body);
  return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'privacy_preparation_failed'},{status:422});}
}
