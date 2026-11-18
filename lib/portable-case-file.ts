import type {ClinicalCase} from './casebook.ts';
import {flushVault,readVaultCaseById,insertVaultCaseIfAbsent} from './local-vault.ts';
import {deriveVaultKey,seal,unseal,fromBase64,toBase64,type Sealed} from './vault-crypto.ts';

/** Local, password-encrypted *single case* file. Unlike the whole-vault backup it never replaces other cases. */
export const PORTABLE_CASE_EXTENSION='.doctor-opus-case';
const FORMAT='doctor-opus-single-case/v1';
const AAD='doctor-opus-single-case/v1:sealed';
const MAX_FILE_CHARS=110*1024*1024;
const MAX_PLAINTEXT_BYTES=64*1024*1024;
type CaseEnvelope={schema:typeof FORMAT; salt:string;sealed:Sealed};
type ProtectedPayload={schema:typeof FORMAT;value:ClinicalCase};
export class PortableCaseCollisionError extends Error{
 constructor(){super('Случай с таким кодом уже есть в этом браузере. Для сохранения обоих импортируйте отдельную копию.');this.name='PortableCaseCollisionError';}
}
function isRecord(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function isDate(value:unknown){return typeof value==='string'&&value.length>=10&&value.length<=50&&Number.isFinite(Date.parse(value));}
function validCase(value:unknown):value is ClinicalCase{
 if(!isRecord(value)||typeof value.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value.id)
 ||typeof value.title!=='string'||value.title.length>2000
 ||!isDate(value.created)||!isDate(value.updated)
 ||value.status!=='active'&&value.status!=='closed'
 ||typeof value.context!=='string'||typeof value.question!=='string'
 ||!Array.isArray(value.files)||value.files.length>400
 ||!Array.isArray(value.events)||value.events.length>3000
 ||!Array.isArray(value.analyses)||value.analyses.length>1500
 ||value.library!==undefined&&(!Array.isArray(value.library)||value.library.length>400)
 ||value.moduleReports!==undefined&&(!Array.isArray(value.moduleReports)||value.moduleReports.length>1500)
 ||value.protocols!==undefined&&(!Array.isArray(value.protocols)||value.protocols.length>250))
 return false;
 if(value.files.some(file=>!isRecord(file)||typeof file.name!=='string'||file.name.length>1000||
   file.sha256!==undefined&&(typeof file.sha256!=='string'||file.sha256.length>128)))return false;
 if(value.events.some(ev=>!isRecord(ev)||typeof ev.id!=='string'||typeof ev.text!=='string'||!isDate(ev.at)
   ||!['note','question','decision'].includes(String(ev.kind))))return false;
 if(value.analyses.some(a=>!isRecord(a)||typeof a.id!=='string'||!isDate(a.at)||typeof a.context!=='string'
   ||!isRecord(a.result)||!isRecord(a.result.draft)||!Array.isArray(a.result.citations)))return false;
 if(value.geneticsDraft!==undefined){
  const draft=value.geneticsDraft;
  if(!isRecord(draft)||typeof draft.context!=='string'||typeof draft.question!=='string'||typeof draft.focus!=='string'
   ||!Array.isArray(draft.files)||draft.files.length>400||draft.files.some(file=>!isRecord(file)||typeof file.name!=='string'||typeof file.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(file.sha256))
   ||!Array.isArray(draft.discussion)||draft.discussion.length>100||draft.discussion.some(turn=>!isRecord(turn)
    ||typeof turn.id!=='string'||!isDate(turn.at)||turn.caseId!==undefined&&turn.caseId!==value.id
    ||typeof turn.question!=='string'||typeof turn.clinicalContext!=='string'||typeof turn.filesKey!=='string'
    ||!isRecord(turn.result)||!isRecord(turn.result.draft)||!Array.isArray(turn.result.ledger)||!Array.isArray(turn.result.citations)))return false;
 }
 return true;
}
function decodeCaseFile(text:string):CaseEnvelope{
 if(text.length>MAX_FILE_CHARS||text.length<70)throw Error('Файл случая пустой или слишком большой (максимум 110 МБ).');
 let parsed:unknown;
 try{parsed=JSON.parse(text);}catch{throw Error('Невозможно прочитать файл случая.');}
 if(!isRecord(parsed)||parsed.schema!==FORMAT||typeof parsed.salt!=='string'||parsed.salt.length>80
 ||!isRecord(parsed.sealed)||typeof parsed.sealed.iv!=='string'||typeof parsed.sealed.data!=='string'
 ||parsed.sealed.data.length>MAX_FILE_CHARS)throw Error('Неподдерживаемый файл случая.');
 try{if(fromBase64(parsed.salt).length!==16||fromBase64(parsed.sealed.iv).length!==12)throw Error();}
 catch{throw Error('Некорректный формат шифрования файла случая.');}
 return parsed as CaseEnvelope;
}
export async function createPortableCaseFile(id:string,password:string):Promise<string>{
 if(password.length<12)throw Error('Нужен пароль не короче 12 символов.');
 await flushVault();
 const value=await readVaultCaseById(id);
 if(!value||value.deletedAt)throw Error('Случай не найден или находится в корзине.');
 if(!validCase(value))throw Error('Случай имеет несовместимый формат. Экспорт не выполнен.');
 const plain=JSON.stringify({schema:FORMAT,value} satisfies ProtectedPayload);
 if(new TextEncoder().encode(plain).byteLength>MAX_PLAINTEXT_BYTES)
  throw Error('Материалы случая больше 64 МБ. Для переноса используйте резервную копию хранилища.');
 const salt=toBase64(crypto.getRandomValues(new Uint8Array(16)));
 const key=await deriveVaultKey(password,salt);
 const sealed=await seal(key,{schema:FORMAT,value} satisfies ProtectedPayload,AAD);
 return JSON.stringify({schema:FORMAT,salt,sealed} satisfies CaseEnvelope);
}
export type PortableCaseRestore={id:string;originalId:string;copied:boolean;files:number;analyses:number;events:number};
export async function restorePortableCaseFile(text:string,password:string,collision:'reject'|'copy'='reject'):Promise<PortableCaseRestore>{
 if(!password)throw Error('Укажите пароль файла случая.');
 if(collision!=='reject'&&collision!=='copy')throw Error('Неизвестный режим восстановления.');
 const archive=decodeCaseFile(text);
 let decrypted:ProtectedPayload;
 try{
  const key=await deriveVaultKey(password,archive.salt);
  decrypted=await unseal<ProtectedPayload>(key,archive.sealed,AAD);
 }catch{throw Error('Неверный пароль или повреждённый файл случая.');}
 if(!isRecord(decrypted)||decrypted.schema!==FORMAT||!validCase(decrypted.value))throw Error('Содержимое случая повреждено или неподдерживаемо.');
 const originalId=decrypted.value.id;
 if(collision==='reject'&&await readVaultCaseById(originalId))throw new PortableCaseCollisionError();
 const newId=collision==='copy'?crypto.randomUUID():originalId;
 const value:ClinicalCase={...decrypted.value,id:newId,...(collision==='copy'?{number:undefined}:{}),deletedAt:undefined};
 // A copied case retains the same original material and historical input signatures.
 // Rebind only the verified local workspace owner, never reinterpret its results.
 if(collision==='copy'&&value.geneticsDraft)value.geneticsDraft={...value.geneticsDraft,
  discussion:value.geneticsDraft.discussion.map(turn=>turn.caseId?{...turn,caseId:newId}:turn)};
 // The source and clinical conclusions are preserved as historical data; attachments are NOT reinterpreted.
 try{await insertVaultCaseIfAbsent(value);}
 catch(error){
  if(error instanceof Error&&(error.name==='ConstraintError'||(error as Error & {cause?:{name?:string}}).cause?.name==='ConstraintError'))
   throw new PortableCaseCollisionError();
  throw error;
 }
 return {id:newId,originalId,copied:collision==='copy',files:value.files.length,analyses:value.analyses.length,events:value.events.length};
}
