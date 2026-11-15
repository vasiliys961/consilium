// Runtime boundary for THIS application and its child modules only.
// Does not edit source applications, credentials on disk, or global settings.
const state=Symbol.for('concilium.openrouter-only');
if(!globalThis[state]){
 globalThis[state]=true;
 process.env.CONCILIUM_OPENROUTER_ONLY='1';
 // Empty defined values prevent Next dotenv from reviving legacy credentials.
 for(const name of Object.keys(process.env))if(name.includes('POLZA'))process.env[name]='';
 process.env.POLZA_API_KEY='';process.env.POLZA_BASE_URL='';
 process.env.LLM_API_KEY=process.env.OPENROUTER_API_KEY||'';
 process.env.LLM_BASE_URL='https://openrouter.ai/api/v1';
 process.env.OPENROUTER_BASE_URL='https://openrouter.ai/api/v1';
 const original=globalThis.fetch;
 globalThis.fetch=async function(input,init){
  const value=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  let host='';try{host=new URL(value).hostname.toLowerCase();}catch{}
  if(host==='polza.ai'||host.endsWith('.polza.ai'))throw new Error('Polza is disabled in Concilium. Use OpenRouter.');
  return original.call(this,input,init);
 };
}
