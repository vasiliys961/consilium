import{resolve}from'node:path';
/** Child-process-only settings; never writes original applications or .env files. */
export function openRouterRuntime(env:NodeJS.ProcessEnv,root=process.cwd()):NodeJS.ProcessEnv{
 const next:NodeJS.ProcessEnv={...env,CONCILIUM_OPENROUTER_ONLY:'1',POLZA_API_KEY:'',POLZA_BASE_URL:'',LLM_API_KEY:env.OPENROUTER_API_KEY??'',LLM_BASE_URL:'https://openrouter.ai/api/v1',OPENROUTER_BASE_URL:'https://openrouter.ai/api/v1'};
 for(const key of Object.keys(next))if(key.includes('POLZA'))next[key]='';
 const preload=resolve(root,'scripts/openrouter-only.cjs');
 next.NODE_OPTIONS=[env.NODE_OPTIONS,`--require ${JSON.stringify(preload)}`].filter(Boolean).join(' ');
 return next;
}
