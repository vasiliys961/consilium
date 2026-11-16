import {createVaultKey,checkVaultKey,seal,unseal,validMeta,type Sealed,type VaultMeta} from './vault-crypto.ts';
import type {ClinicalCase} from './casebook.ts';

type SealedCase={id:string;sealed:Sealed};
type StoredCase=ClinicalCase|SealedCase;
type Revision={id:'revision';value:string};
let session:{key:CryptoKey;check:string}|null=null;
const flushers=new Set<()=>Promise<void>>();

export function registerVaultFlush(fn:()=>Promise<void>){
 flushers.add(fn);
 return()=>{flushers.delete(fn);};
}
export async function flushVault(){for(const fn of flushers)await fn();}
export function lockVault(){session=null;}

export function vaultDatabase():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('concilium-casebook-v1',2);
  request.onupgradeneeded=()=>{
   const db=request.result;
   if(!db.objectStoreNames.contains('cases'))db.createObjectStore('cases',{keyPath:'id'});
   if(!db.objectStoreNames.contains('settings'))db.createObjectStore('settings',{keyPath:'id'});
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(Error('Закройте старые вкладки Concilium и повторите.'));
 });
}

function readRequest<T>(request:IDBRequest<T>):Promise<T>{
 return new Promise((resolve,reject)=>{
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
}

async function readMeta():Promise<VaultMeta|undefined>{
 const db=await vaultDatabase();
 try{return await readRequest(db.transaction('settings').objectStore('settings').get('vault'));}
 finally{db.close();}
}

async function readSnapshot(){
 const db=await vaultDatabase();
 try{
  const tx=db.transaction(['cases','settings']);
  const settings=tx.objectStore('settings');
  const [meta,revision,records]=await Promise.all([
   readRequest<VaultMeta|undefined>(settings.get('vault')),
   readRequest<Revision|undefined>(settings.get('revision')),
   readRequest<StoredCase[]>(tx.objectStore('cases').getAll()),
  ]);
  return {meta,revision:revision?.value,records};
 }finally{db.close();}
}

function unlockedKey(meta:VaultMeta){
 if(!session||session.check!==meta.check.data)throw Error('Хранилище заблокировано. Откройте его паролем.');
 return session.key;
}

export async function vaultStatus(){
 const meta=await readMeta();
 return {configured:Boolean(meta),open:Boolean(meta&&session?.check===meta.check.data)};
}

async function updateStorage(change:(tx:IDBTransaction,meta:VaultMeta|undefined,revision:string|undefined)=>void){
 const db=await vaultDatabase();
 try{
  await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction(['cases','settings'],'readwrite');
   const settings=tx.objectStore('settings');
   tx.oncomplete=()=>resolve();
   tx.onabort=()=>reject(tx.error??Error('Сохранение отменено.'));
   const request=settings.getAll() as IDBRequest<(VaultMeta|Revision)[]>;
   request.onsuccess=()=>{
    try{
     const meta=request.result.find(item=>item.id==='vault');
     const revision=request.result.find(item=>item.id==='revision')?.value;
     change(tx,meta,revision);
     settings.put({id:'revision',value:crypto.randomUUID()});
    }catch(error){tx.abort();reject(error);}
   };
  });
 }finally{db.close();}
}

async function commit(snapshot:Awaited<ReturnType<typeof readSnapshot>>,meta:VaultMeta,records:SealedCase[],active:CryptoKey){
 await updateStorage((tx,latestMeta,latestRevision)=>{
  // Encryption runs outside IndexedDB. Reject a stale snapshot so another tab's edits are preserved.
  if(latestRevision!==snapshot.revision||latestMeta?.check.data!==snapshot.meta?.check.data)
   throw Error('Случаи изменились в другой вкладке. Повторите действие.');
  if(latestMeta&&unlockedKey(latestMeta)!==active)throw Error('Хранилище заблокировано.');
  tx.objectStore('settings').put(meta);
  const cases=tx.objectStore('cases');
  for(const value of records)cases.put(value);
 });
}

async function readCase(record:StoredCase,active?:CryptoKey):Promise<ClinicalCase>{
 if('sealed' in record){
  if(!active)throw Error('Для зашифрованных случаев требуется пароль.');
  return unseal<ClinicalCase>(active,record.sealed,'case:'+record.id);
 }
 if(active)throw Error('Запись не зашифрована.');
 return record;
}

async function encryptCase(active:CryptoKey,value:ClinicalCase):Promise<SealedCase>{
 return {id:value.id,sealed:await seal(active,value,'case:'+value.id)};
}

export async function createLocalVault(password:string){
 await flushVault();
 const snapshot=await readSnapshot();
 if(snapshot.meta)throw Error('Хранилище уже существует.');
 const {key,meta}=await createVaultKey(password);
 const records=await Promise.all(snapshot.records.map(async value=>encryptCase(key,await readCase(value))));
 await commit(snapshot,meta,records,key);
 session={key,check:meta.check.data};
 // Browser-only storage persistence. The vault can also be tested in Node
 // without a navigator object; keys and records remain browser-local.
 if(typeof navigator!=='undefined')void navigator.storage?.persist?.().catch(()=>false);
}

export async function openLocalVault(password:string){
 const meta=await readMeta();
 if(!meta)throw Error('Сначала включите защиту хранилища.');
 session={key:await checkVaultKey(password,meta),check:meta.check.data};
}

export async function readVaultCases():Promise<ClinicalCase[]>{
 const {meta,records}=await readSnapshot();
 const active=meta?unlockedKey(meta):undefined;
 return Promise.all(records.map(value=>readCase(value,active)));
}

/** Decrypt one requested case, not the entire vault on each editor autosave. */
export async function readVaultCaseById(id:string):Promise<ClinicalCase|undefined>{
 const db=await vaultDatabase();
 try{
  const tx=db.transaction(['cases','settings']);
  const [meta,record]=await Promise.all([
   readRequest<VaultMeta|undefined>(tx.objectStore('settings').get('vault')),
   readRequest<StoredCase|undefined>(tx.objectStore('cases').get(id)),
  ]);
  return record?readCase(record,meta?unlockedKey(meta):undefined):undefined;
 }finally{db.close();}
}

export async function writeVaultCase(value:ClinicalCase,remove=false){
 const meta=await readMeta();
 const active=meta?unlockedKey(meta):undefined;
 const record=remove?null:active?await encryptCase(active,value):value;
 await updateStorage((tx,latestMeta)=>{
  if(latestMeta?.check.data!==meta?.check.data)
   throw Error('Защита хранилища изменилась. Откройте эту страницу заново.');
  if(latestMeta&&unlockedKey(latestMeta)!==active)throw Error('Хранилище заблокировано.');
  const store=tx.objectStore('cases');
  if(record)store.put(record);
  else store.delete(value.id);
 });
}

/** Import a single encrypted portable case without ever overwriting an existing ID.
 * IndexedDB.add rejects duplicates atomically, including races between tabs. */
export async function insertVaultCaseIfAbsent(value:ClinicalCase):Promise<void>{
 const meta=await readMeta();
 const active=meta?unlockedKey(meta):undefined;
 const record:StoredCase=active?await encryptCase(active,value):value;
 await updateStorage((tx,latestMeta)=>{
  if(latestMeta?.check.data!==meta?.check.data)
   throw Error('Режим защиты хранилища изменился. Откройте его снова.');
  if(latestMeta&&unlockedKey(latestMeta)!==active)
   throw Error('Хранилище заблокировано.');
  // Never use put(): add() aborts the whole transaction on a colliding ID.
  tx.objectStore('cases').add(record);
 });
}

export async function exportVault():Promise<string>{
 await flushVault();
 const {meta,records}=await readSnapshot();
 if(!meta)throw Error('Сначала включите защиту хранилища.');
 unlockedKey(meta);
 return JSON.stringify({schema:'concilium-encrypted-backup/v1',meta,records});
}

export async function restoreVault(text:string,password:string):Promise<number>{
 if(text.length>150_000_000)throw Error('Резервная копия превышает 150 МБ.');
 const backup=JSON.parse(text);
 if(backup?.schema!=='concilium-encrypted-backup/v1'||!validMeta(backup.meta)||!Array.isArray(backup.records)||backup.records.length>10000)
  throw Error('Неверный формат резервной копии.');
 const incomingKey=await checkVaultKey(password,backup.meta),values:ClinicalCase[]=[];
 for(const record of backup.records){
  if(typeof record?.id!=='string'||!record.sealed)throw Error('Повреждённая запись.');
  const value=await unseal<ClinicalCase>(incomingKey,record.sealed,'case:'+record.id);
  if(value.id!==record.id||!Array.isArray(value.files)||!Array.isArray(value.events)||!Array.isArray(value.analyses))
   throw Error('Повреждённый случай.');
  values.push(value);
 }
 await flushVault();
 const snapshot=await readSnapshot();
 const active=snapshot.meta?unlockedKey(snapshot.meta):incomingKey;
 const meta=snapshot.meta??backup.meta;
 const existing=new Set(snapshot.records.map(value=>value.id));
 // Merge without replacing an existing physician case, even if the backup repeats an ID.
 const records=await Promise.all(values.map(value=>{
  const id=existing.has(value.id)?crypto.randomUUID():value.id;
  existing.add(id);
  return encryptCase(active,{...value,id});
 }));
 const preserved=snapshot.meta?[]:await Promise.all(snapshot.records.map(async value=>encryptCase(active,await readCase(value))));
 await commit(snapshot,meta,[...preserved,...records],active);
 session={key:active,check:meta.check.data};
 return records.length;
}
