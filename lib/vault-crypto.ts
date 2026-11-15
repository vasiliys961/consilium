/** Web Crypto only. Neither passwords nor derived keys are persisted. */
export type Sealed = {iv:string; data:string};
export type VaultMeta = {id:'vault';version:1;salt:string;iterations:600000;check:Sealed};
const encoder=new TextEncoder();
export function toBase64(bytes:Uint8Array):string {let raw='';for(let i=0;i<bytes.length;i+=32768)raw+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(raw);}
export function fromBase64(text:string):Uint8Array<ArrayBuffer> {return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}
export async function deriveVaultKey(password:string,salt:string):Promise<CryptoKey>{
 const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:fromBase64(salt),iterations:600000},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function seal(key:CryptoKey,value:unknown,binding:string):Promise<Sealed>{
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(binding)},key,encoder.encode(JSON.stringify(value)));
 return {iv:toBase64(iv),data:toBase64(new Uint8Array(data))};
}
export async function unseal<T>(key:CryptoKey,value:Sealed,binding:string):Promise<T>{
 const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(value.iv),additionalData:encoder.encode(binding)},key,fromBase64(value.data));
 return JSON.parse(new TextDecoder().decode(bytes));
}
export function validMeta(value:unknown):value is VaultMeta {const v=value as VaultMeta;return Boolean(v&&v.id==='vault'&&v.version===1&&v.iterations===600000&&typeof v.salt==='string'&&fromBase64(v.salt).length===16&&v.check&&typeof v.check.iv==='string'&&typeof v.check.data==='string');}
export async function createVaultKey(password:string):Promise<{key:CryptoKey;meta:VaultMeta}>{
 if(password.length<12)throw new Error('Используйте пароль длиной не менее 12 символов.');
 const salt=toBase64(crypto.getRandomValues(new Uint8Array(16))),key=await deriveVaultKey(password,salt);
 return {key,meta:{id:'vault',version:1,salt,iterations:600000,check:await seal(key,{purpose:'concilium-local-vault-v1'},'vault-check')}};
}
export async function checkVaultKey(password:string,meta:VaultMeta):Promise<CryptoKey>{
 if(!validMeta(meta))throw Error('Неподдерживаемое хранилище.');
 const key=await deriveVaultKey(password,meta.salt),check=await unseal<{purpose:string}>(key,meta.check,'vault-check');
 if(check.purpose!=='concilium-local-vault-v1')throw Error('Неверный пароль.');return key;
}
