import{openRouterRuntime}from'./provider-runtime.ts';
import {isPreviewInstance,localOrigin,localPorts} from './local-ports.ts';
import {protocolStatus} from './protocol-integration.ts';
import {radiologyTelemetry} from './radiology-telemetry.ts';
import {writeTerminalEvent} from './telemetry.ts';
import {spawn,type ChildProcess} from 'node:child_process';
import {parseEnv} from 'node:util';
import {homedir} from 'node:os';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {founderReadiness} from '../packages/ecg/founder.ts';
const home=()=>resolve(process.cwd(),'integrations/radiology/web');
export const RADIOLOGY_ORIGIN=localOrigin('radiology');
let child:ChildProcess|undefined;
export async function radiologyHealth(){try{const response=await fetch(`${RADIOLOGY_ORIGIN}/api/concilium/health`,{signal:AbortSignal.timeout(1200),cache:'no-store'});const data=await response.json();return data.module==='opus-radiology'&&data.bridge===1&&data.openrouterOnly===true;}catch{return false;}}
/** The bundled bridge has its own Next.js dependencies. A working original
 * standalone Opus Radiology checkout is NOT proof that the Preview bridge
 * has installed dependencies; neither installation should be modified here.
 */
export type RadiologyReadiness='ready'|'bridge_source_missing'|'bridge_dependencies_missing';
export function radiologyReadiness():RadiologyReadiness{
 if(!existsSync(resolve(home(),'app/viewer/page.tsx')))return 'bridge_source_missing';
 if(!existsSync(resolve(home(),'node_modules/next/dist/bin/next')))return 'bridge_dependencies_missing';
 return 'ready';
}
export function radiologyInstalled(){return radiologyReadiness()==='ready';}
/** Optional standalone escape hatch, configured only by the physician/admin.
 * No case context, DICOM, consent tokens or identifiers are transferred.
 * Must be explicit and loopback. A standalone app may not support the bridge.
 */
export function radiologyStandaloneUrl():string|null{
 const value=process.env.RADIOLOGY_STANDALONE_URL?.trim();
 if(!value)return null;
 try{
  const url=new URL(value);
  if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!url.port||url.username||url.password||url.search||url.hash||url.pathname!=='/')return null;
  if(!/^[0-9]{2,5}$/.test(url.port))return null;
  const port=Number(url.port);
  if(port<1024||port>65535||Object.values(localPorts()).includes(port))return null;
  return url.origin;
 }catch{return null;}
}
export function startRadiology(){if(!radiologyInstalled())return false;if(child&&!child.killed&&child.exitCode===null)return true;
 let originalEnv:Record<string,string|undefined>={};if(!isPreviewInstance()){const envPath=resolve(process.env.RADIOLOGY_SOURCE_HOME||resolve(homedir(),'Desktop/opus-radiology-ai-github'),'web/.env.local');try{if(existsSync(envPath))originalEnv=parseEnv(readFileSync(envPath,'utf8'));}catch{}}
 child=spawn(process.execPath,[resolve(home(),'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port',String(localPorts().radiology)],{cwd:home(),env:{...openRouterRuntime({...originalEnv,...process.env}),NODE_ENV:'development',CONCILIUM_INTEGRATION:'1',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','ignore']});let pending='';child.stdout?.on('data',chunk=>{pending+=String(chunk);if(pending.length>16000)pending=pending.slice(-16000);const lines=pending.split('\n');pending=lines.pop()??'';for(const line of lines){const event=radiologyTelemetry(line);if(event)writeTerminalEvent(event);}});child.on('error',()=>{child=undefined;});child.unref();return true;}
export async function integrationStatus(){const [running,protocol]=await Promise.all([radiologyHealth(),protocolStatus()]);return {protocol,ecg:{available:founderReadiness().available},radiology:{installed:radiologyInstalled(),running,origin:RADIOLOGY_ORIGIN,readiness:radiologyReadiness(),standaloneUrl:radiologyStandaloneUrl()}};}
