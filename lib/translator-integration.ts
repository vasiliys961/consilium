import{openRouterRuntime}from'./provider-runtime.ts';
import {isPreviewInstance,localOrigin,localPorts} from './local-ports.ts';
import {spawn,type ChildProcess} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {parseEnv} from 'node:util';

export const TRANSLATOR_ORIGIN=localOrigin('translator');
const moduleHome=()=>resolve(process.cwd(),'integrations/translator');
let child:ChildProcess|undefined;

export async function translatorStatus(){
  const installed=existsSync(resolve(moduleHome(),'node_modules/next/dist/bin/next'));
  try{
    const response=await fetch(`${TRANSLATOR_ORIGIN}/api/concilium/health`,{cache:'no-store',signal:AbortSignal.timeout(1500)});
    const status=await response.json();
    if(status.module==='medical-translator'&&status.bridge===1)return {installed,running:true,ready:status.ready===true,origin:TRANSLATOR_ORIGIN};
  }catch{}
  return {installed,running:false,ready:false,origin:TRANSLATOR_ORIGIN};
}

export function startTranslator(){
  const directory=moduleHome(),next=resolve(directory,'node_modules/next/dist/bin/next');
  if(!existsSync(next))return false;
  if(child&&!child.killed&&child.exitCode===null)return true;
  let sourceEnv:Record<string,string|undefined>={};
  const source=process.env.TRANSLATOR_SOURCE_HOME||resolve(homedir(),'Desktop/medical-translator');
  if(!isPreviewInstance())try{sourceEnv=parseEnv(readFileSync(resolve(source,'.env.local'),'utf8'));}catch{}
  if(sourceEnv.TRANSLATOR_ACCESS_USERS) {
    // Match Next dotenv expansion for escaped dollar signs in bcrypt hashes.
    sourceEnv.TRANSLATOR_ACCESS_USERS=sourceEnv.TRANSLATOR_ACCESS_USERS.replace(/\\\$/g,'$');
  }
  const built=existsSync(resolve(directory,'.next/BUILD_ID'));
  child=spawn(process.execPath,[next,built?'start':'dev','--hostname','127.0.0.1','--port',String(localPorts().translator)],{
    cwd:directory,
    env:{...openRouterRuntime({...sourceEnv,...process.env}),NODE_ENV:built?'production':'development',CONCILIUM_TRANSLATOR:'1',NEXT_TELEMETRY_DISABLED:'1'},
    stdio:'ignore',
  });
  child.on('error',()=>{child=undefined;});
  child.unref();
  return true;
}
