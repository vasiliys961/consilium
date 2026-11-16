import {validCaseInput} from '@/lib/input-validation';
import {verifyPrivacy} from '@/lib/privacy-ticket';
import {medicationReview,quickMedicationReview} from '@/lib/medication-review';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const {port}=new URL(request.url),host=request.headers.get('host');
 if(!host||!['127.0.0.1','localhost','[::1]'].some(name=>host===`${name}:${port}`)||request.headers.get('origin')!==`http://${host}`)return Response.json({error:'origin'},{status:403});
 const raw=await request.text();if(raw.length>160000)return Response.json({error:'size'},{status:413});
 let data;try{data=JSON.parse(raw);}catch{return Response.json({error:'json'},{status:400});}
 if(!validCaseInput(data))return Response.json({error:'invalid'},{status:400});
 const {privacy,...body}=data as typeof data&{privacy?:{consent?:boolean;token?:string}};
 if(!privacy?.consent||!verifyPrivacy(body,privacy.token))return Response.json({error:'privacy_review_required'},{status:428});
 if(!body.text?.trim())return Response.json({error:'invalid_medication_list'},{status:422});
 try{
  const env={OPENROUTER_API_KEY:process.env.OPENROUTER_API_KEY,MEDICATION_CHECK_MODEL:process.env.MEDICATION_CHECK_MODEL};
  return Response.json(body.drugLabels?.length ? await medicationReview(body,env,fetch,request.signal) : await quickMedicationReview(body,env,fetch,request.signal));
 }
 catch(error){return Response.json({error:error instanceof Error?error.message:'review_failed'},{status:502});}
}
