import { createServer, type Server } from 'node:http';
import { networkInterfaces } from 'node:os';
import {localPorts} from '../../lib/local-ports.ts';
const RELAY_PORT=localPorts().phone;
const state=globalThis as typeof globalThis & {__conciliumRelay?:{server:Server;origin:string}};
function privateAddress(){
 const all=networkInterfaces();const ordered=Object.entries(all).sort(([a],[b])=>Number(!a.startsWith('en'))-Number(!b.startsWith('en')));
 for(const [,addresses]of ordered)for(const item of addresses??[])if(item.family==='IPv4'&&!item.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address))return item.address;
 return null;
}
/** A restricted LAN entrance: only the upload page, static assets and token-protected upload; never physician API or case data. */
export async function ensurePhoneRelay(backendPort:number):Promise<{url:string|null;reason:string|null}>{
 const address=privateAddress();if(!address)return {url:null,reason:'Нет доступного адреса локальной сети. Подключите компьютер и телефон к одной Wi-Fi сети.'};
 const origin=`http://127.0.0.1:${backendPort}`;
 if(state.__conciliumRelay){return state.__conciliumRelay.origin===origin?{url:`http://${address}:${RELAY_PORT}`,reason:null}:{url:null,reason:'Порт передачи уже связан с другим запуском приложения.'};}
 const server=createServer(async(req,res)=>{
  try{
   const path=new URL(req.url??'/',origin);
   const allowed=(req.method==='GET'&&(path.pathname==='/phone/send'||path.pathname.startsWith('/_next/static/')))||(req.method==='POST'&&['/api/phone/upload','/api/phone/heartbeat','/api/phone/status'].includes(path.pathname));
   if(!allowed){res.writeHead(404);res.end();return;}
   let body:Buffer|undefined;
   if(req.method==='POST'){const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>11_000_000){res.writeHead(413);res.end();return;}chunks.push(chunk);}body=Buffer.concat(chunks);}
   const response=await fetch(`${origin}${path.pathname}${path.search}`,{method:req.method,headers:body?{'content-type':'application/json'}:{},body:body?.toString("utf8"),signal:AbortSignal.timeout(30000),redirect:'error'});
   res.writeHead(response.status,{'content-type':response.headers.get('content-type')??'application/octet-stream','cache-control':'no-store','referrer-policy':'no-referrer'});
   res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(502);res.end('Phone transfer unavailable');}
 });
 try{await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(RELAY_PORT,'0.0.0.0',()=>resolve());});server.unref();state.__conciliumRelay={server,origin};return {url:`http://${address}:${RELAY_PORT}`,reason:null};}
 catch{return {url:null,reason:'Не удалось открыть ограниченный порт передачи 3108. Проверьте, не занят ли он другим приложением.'};}
}
