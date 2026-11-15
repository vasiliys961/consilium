import{openRouterRuntime}from'./provider-runtime.ts';
import {localOrigin,localPorts} from './local-ports.ts';
import {spawn,type ChildProcess} from 'node:child_process';
import {parseEnv} from 'node:util';
import {homedir} from 'node:os';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {radiologyTelemetry} from './radiology-telemetry.ts';
import {writeTerminalEvent} from './telemetry.ts';
import type {ProtocolEdition} from './protocol-bridge.ts';
const children=new Map<ProtocolEdition,ChildProcess>();
const home=(edition:ProtocolEdition)=>resolve(process.cwd(),'integrations/protocol',edition);
export const protocolOrigin=(edition:ProtocolEdition)=>localOrigin(edition==='ru'?'protocolRu':'protocolEn');
export function protocolInstalled(edition:ProtocolEdition){return existsSync(resolve(home(edition),'app/protocol/page.tsx'))&&existsSync(resolve(home(edition),'node_modules/next/dist/bin/next'));}
export async function protocolHealth(edition:ProtocolEdition){try{const response=await fetch(`${protocolOrigin(edition)}/api/concilium/health`,{signal:AbortSignal.timeout(1500),cache:'no-store'});const result=await response.json();return result.module==='native-protocol'&&result.edition===edition&&result.bridge===1&&result.openrouterOnly===true;}catch{return false;}}
export async function protocolStatus(){const [ru,en]=await Promise.all((['ru','en'] as const).map(async edition=>({installed:protocolInstalled(edition),running:await protocolHealth(edition),origin:protocolOrigin(edition)})));return {ru,en};}
export function startProtocol(edition:ProtocolEdition){
 if(!protocolInstalled(edition))return false;const existing=children.get(edition);if(existing&&!existing.killed&&existing.exitCode===null&&existing.signalCode===null)return true;
 const original=process.env[edition==='ru'?'PROTOCOL_RU_SOURCE_HOME':'PROTOCOL_EN_SOURCE_HOME']||resolve(homedir(),'Desktop',edition==='ru'?'протокол осмотра':'протокол осмотра англ');
 let originalEnv:Record<string,string|undefined>={};try{originalEnv=parseEnv(readFileSync(resolve(original,'.env.local'),'utf8'));}catch{}
 const runtimeEnv=openRouterRuntime({...originalEnv,...process.env});
 const built=existsSync(resolve(home(edition),'.next/BUILD_ID'));
 const child=spawn(process.execPath,[resolve(home(edition),'node_modules/next/dist/bin/next'),built?'start':'dev','--hostname','127.0.0.1','--port',String(edition==='ru'?localPorts().protocolRu:localPorts().protocolEn)],{cwd:home(edition),env:{...runtimeEnv,NODE_ENV:built?'production':'development',CONCILIUM_PROTOCOL_EDITION:edition,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','ignore']});
 children.set(edition,child);let pending='';child.stdout?.on('data',data=>{pending+=String(data);if(pending.length>16000)pending=pending.slice(-16000);const lines=pending.split('\n');pending=lines.pop()??'';for(const line of lines){const event=radiologyTelemetry(line,edition==='ru'?'protocol-ru':'protocol-en');if(event)writeTerminalEvent(event);}});child.on('error',()=>{if(children.get(edition)===child)children.delete(edition);});child.on('exit',()=>{if(children.get(edition)===child)children.delete(edition);});child.unref();return true;
}
