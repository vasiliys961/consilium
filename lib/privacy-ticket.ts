import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
const globalState=globalThis as typeof globalThis&{__conciliumPrivacySecret?:string};
export function privacySecret(){return process.env.CONCILIUM_PRIVACY_SECRET??(globalState.__conciliumPrivacySecret??=randomBytes(32).toString('hex'));}
function digest(body:unknown){return createHash('sha256').update(JSON.stringify(body)).digest('hex');}
export function signPrivacy(body:unknown,now=Date.now()):string{const value=`${now}.${digest(body)}`;return value+'.'+createHmac('sha256',privacySecret()).update(value).digest('hex');}
export function verifyPrivacy(body:unknown,token:unknown,now=Date.now()):boolean{
 if(typeof token!=='string')return false;const [stamp,hash,mac,...extra]=token.split('.');if(extra.length||!/^\d{13}$/.test(stamp??'')||!/^[a-f0-9]{64}$/.test(hash??'')||!/^[a-f0-9]{64}$/.test(mac??''))return false;
 const age=now-Number(stamp);if(age<0||age>15*60*1000||hash!==digest(body))return false;
 const expected=createHmac('sha256',privacySecret()).update(stamp+'.'+hash).digest();return timingSafeEqual(expected,Buffer.from(mac,'hex'));
}
