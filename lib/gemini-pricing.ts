import{createHash}from'node:crypto';
import{GEMINI_ARGON,GEMINI_FLASH,GEMINI_BASELINES,resolveGeminiPolicy,type GeminiPrice,type GeminiRate}from'./gemini-policy.ts';
type Env=Record<string,string|undefined>;
let cache:{signature:string;expires:number;checkedAt:string;prices:GeminiPrice[];revision:string}|undefined;
let pending:{signature:string;promise:Promise<NonNullable<typeof cache>>}|undefined;
export function parseGeminiRate(model:unknown,provider:'polza'|'openrouter'):GeminiRate|null{
 if(!model||typeof model!=='object')return null;
 const data=model as {pricing?:Record<string,unknown>;top_provider?:{pricing?:Record<string,unknown>}};
 const p=provider==='polza'?data.top_provider?.pricing:data.pricing;
 if(!p)return null;
 const input=Number(provider==='polza'?p.prompt_per_million:p.prompt)* (provider==='polza'?1:1e6);
 const output=Number(provider==='polza'?p.completion_per_million:p.completion)*(provider==='polza'?1:1e6);
 if(!Number.isFinite(input)||!Number.isFinite(output)||input<=0||output<=0)return null;
 return {input,output,currency:provider==='polza'?'RUB':'USD'};
}
export async function geminiPolicy(env:Env,cookie:string|null,options:{now?:number;fetch?:typeof fetch}={}){
 const now=options.now??Date.now(),fetcher=options.fetch??fetch;
 const endpoints=[['openrouter',env.OPENROUTER_API_KEY]].filter((x):x is ['polza'|'openrouter',string]=>Boolean(x[1]));
 // Hash only; no credential appears in responses, logs or cache files.
 const signature=createHash('sha256').update(JSON.stringify(endpoints)).digest('hex');
 async function refresh(){
  const prices=await Promise.all(endpoints.map(async([provider,key]):Promise<GeminiPrice>=>{
   const blank={provider,argon:null,flash:null,baseline:GEMINI_BASELINES[provider]};
   try{const response=await fetcher(`https://${provider==='polza'?'polza.ai':'openrouter.ai'}/api/v1/models`,{headers:{authorization:`Bearer ${key}`},signal:AbortSignal.timeout(12000),cache:'no-store'});
    if(!response.ok)return blank;const data=await response.json();if(!Array.isArray(data.data))return blank;
    return {provider,baseline:GEMINI_BASELINES[provider],argon:parseGeminiRate(data.data.find((m:{id?:string})=>m.id===GEMINI_ARGON),provider),flash:parseGeminiRate(data.data.find((m:{id?:string})=>m.id===GEMINI_FLASH),provider)};
   }catch{return blank;}
  }));
  // Keep consent stable across small RUB exchange-rate movements. A new
  // substantial tariff tier (including the announced doubling) asks again.
  const tiers=prices.map(p=>({provider:p.provider,available:Boolean(p.argon&&p.flash),input:p.argon?Math.round(Math.log2(p.argon.input/p.baseline.input)*2):null,output:p.argon?Math.round(Math.log2(p.argon.output/p.baseline.output)*2):null}));
  const checkedAt=new Date(now).toISOString(),revision=createHash('sha256').update(JSON.stringify({visionPolicy:'quality-first-argon-v3',review:now>=Date.parse('2026-12-01T00:00:00Z'),tiers})).digest('hex').slice(0,16);
  // Never reuse a pre-December cache across the announced review boundary.
  const boundary=Date.parse('2026-12-01T00:00:00Z');
  const ttl=prices.length&&prices.every(x=>x.argon&&x.flash)?6*3600000:60000;
  return {signature,expires:Math.min(now+ttl,now<boundary?boundary:Infinity),checkedAt,prices,revision};
 }
 if(!cache||cache.signature!==signature||cache.expires<=now){
  if(!pending||pending.signature!==signature){const promise=refresh();pending={signature,promise};}
  const active=pending;try{cache=await active.promise;}finally{if(pending===active)pending=undefined;}
 }
 return resolveGeminiPolicy(cache.prices,cache.checkedAt,cache.revision,cookie,now);
}
export async function geminiRequestEnv(request:Request){
 const env={POLZA_API_KEY:process.env.POLZA_API_KEY,OPENROUTER_API_KEY:process.env.OPENROUTER_API_KEY};
 const policy=await geminiPolicy(env,request.headers.get('cookie'));
 if(policy.needsChoice)return {response:Response.json({error:'gemini_choice_required',policy},{status:428}),env:null};
 return {response:null,env:{...env,GEMINI_MODEL:policy.selected==='flash'?GEMINI_FLASH:GEMINI_ARGON}};
}
