import {verifyPrivacy} from '@/lib/privacy-ticket';
import {validCaseInput} from '@/lib/input-validation';
import {WORKSPACE_LANGUAGES} from '@/lib/workspace-i18n';
import type {WorkspaceLanguage} from '@/lib/workspace-i18n';
import {isGuidelineMode,searchClinicalGuidelines} from '@/lib/parent-guideline-search';

export const dynamic='force-dynamic';
export const maxDuration=180;
/**
 * Original-style thematic clinical guidance, unlike the case-bound
 * clinical RAG path. All user text passed to OpenRouter must have undergone
 * the existing local privacy review. No new authentication/billing stack.
 */
export async function POST(request:Request){
 const url=new URL(request.url),port=url.port;
 const host=request.headers.get('host'),origin=request.headers.get('origin');
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)
  ||!host||!['127.0.0.1','localhost','[::1]'].some(name=>host===name+':'+port)
  ||origin!=='http://'+host)return Response.json({error:'local_origin_required'},{status:403});
 const raw=await request.text();
 if(raw.length>22000)return Response.json({error:'size'},{status:413});
 let value:unknown;
 try{value=JSON.parse(raw);}catch{return Response.json({error:'invalid_json'},{status:400});}
 if(!value||typeof value!=='object'||Array.isArray(value))return Response.json({error:'input'},{status:400});
 const supplied=value as Record<string,unknown>;
 const {modelMode,specialty,privacy,...input}=supplied;
 if(!validCaseInput(input)||typeof input.text!=='string'
  ||!isGuidelineMode(modelMode)
  ||!WORKSPACE_LANGUAGES.some(item=>item.code===input.locale)
  ||!(specialty===undefined||typeof specialty==='string'&&specialty.length<=100))
  return Response.json({error:'input'},{status:400});
 const approval=privacy as {consent?:unknown;token?:unknown}|undefined;
 if(approval?.consent!==true||!verifyPrivacy(input,approval.token))
  return Response.json({error:'privacy_review_required'},{status:428});
 const query=input.text.trim();
 if(query.length<3||query.length>550)return Response.json({error:'topic_required'},{status:422});
 if(!process.env.OPENROUTER_API_KEY)return Response.json({error:'openrouter_not_configured'},{status:503});
 try{
  const result=await searchClinicalGuidelines({
   query,specialty:typeof specialty==='string'?specialty:'',mode:modelMode,locale:input.locale as WorkspaceLanguage
  },{OPENROUTER_API_KEY:process.env.OPENROUTER_API_KEY},fetch);
  return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  const reason=error instanceof Error?error.message:'guideline_service_unavailable';
  const allowed=['guideline_provider_error','guideline_invalid_response','guideline_truncated','guideline_payment_required','guideline_unavailable','guideline_schema_rejected'];
  return Response.json({error:allowed.includes(reason)?reason:'guideline_service_unavailable'}, {status:reason==='guideline_payment_required'?402:502});
 }
}
