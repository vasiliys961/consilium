import {relativeDateCleaner} from './concilium-dates.ts';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {redactText} from './concilium-redact.ts';
const state=globalThis as typeof globalThis&{__protocolPrivacySecret?:string};
function secret(){return state.__protocolPrivacySecret??=randomBytes(32).toString('hex');}
function hash(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
export function prepareNativePayload(value:unknown):unknown{const dates=relativeDateCleaner();const clean=(value:unknown):unknown=>{
 if(typeof value==='string')return redactText(dates.clean(value)).text;
 if(Array.isArray(value))return value.map(clean);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,['model','provider','locale','language','templateId','mode','format','type','sha256'].includes(key)?item:clean(item)]));
 return value;
 };return clean(value);
}
export function signNativePrivacy(value:unknown){const text=Date.now()+'.'+hash(value);return text+'.'+createHmac('sha256',secret()).update(text).digest('hex');}
function verify(value:unknown,token:string|null){if(!token)return false;const [time,digest,mac,...extra]=token.split('.');if(extra.length||!/^\d{13}$/.test(time??'')||!/^[a-f0-9]{64}$/.test(mac??'')||Date.now()-Number(time)>900000||Date.now()<Number(time)||hash(value)!==digest)return false;return timingSafeEqual(Buffer.from(mac,'hex'),createHmac('sha256',secret()).update(time+'.'+digest).digest());}
export async function nativePrivacyGuard(request:Request):Promise<Response|null>{
 try{const body=await request.clone().json();if(verify(body,request.headers.get('x-concilium-privacy')))return null;}catch{}
 return Response.json({success:false,error:'Требуется проверка персональных данных и согласие врача. / Physician privacy review and consent required.'},{status:428});
}
export async function audioDescriptor(request:Request){const form=await request.clone().formData(),file=form.get('file');if(!(file instanceof File))throw Error('file');return {sha256:createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex'),bytes:file.size,type:file.type};}
export async function nativeAudioGuard(request:Request):Promise<Response|null>{try{if(verify(await audioDescriptor(request),request.headers.get('x-concilium-privacy-audio')))return null;}catch{}return Response.json({success:false,error:'Требуется отдельное согласие на передачу исходного аудио. / Explicit raw audio consent required.'},{status:428});}
