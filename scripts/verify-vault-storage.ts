import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
if(!process.argv[2])throw Error('Pass the path to an isolated fake-indexeddb/build/esm/index.js installation. Never uses real browser data.');
const {indexedDB,IDBObjectStore}=await import(pathToFileURL(process.argv[2]).href);
import * as vault from '../lib/local-vault.ts';
import type {ClinicalCase} from '../lib/casebook.ts';
globalThis.indexedDB=indexedDB;
const legacy:ClinicalCase={id:'synthetic-case',title:'SYNTHETIC PRIVATE TITLE',context:'SYNTHETIC_PRIVATE_NOTE',question:'',files:[],events:[],analyses:[],created:'2026-11-08',updated:'2026-11-08',status:'active'};
const initial=await new Promise<any>((resolve,reject)=>{const r=indexedDB.open('concilium-casebook-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('cases',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
await new Promise<void>((resolve,reject)=>{const tx=initial.transaction('cases','readwrite');tx.objectStore('cases').put(legacy);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});initial.close();
const password='Synthetic storage test password only';
assert.deepEqual(await vault.vaultStatus(),{configured:false,open:false});
assert.deepEqual(await vault.readVaultCases(),[legacy]);
const draft={...legacy,id:'synthetic-draft',title:'Saved without a password'};
await vault.writeVaultCase(draft);
assert.deepEqual(await vault.readVaultCases(),[legacy,draft]);
await vault.writeVaultCase(draft,true);
assert.deepEqual(await vault.readVaultCases(),[legacy]);

// Pause key derivation to simulate another tab saving while protection is being enabled.
const derive=crypto.subtle.deriveKey.bind(crypto.subtle);
let resume!:()=>void,deriving!:()=>void;
const paused=new Promise<void>(resolve=>{resume=resolve;});
const started=new Promise<void>(resolve=>{deriving=resolve;});
crypto.subtle.deriveKey=async (...args)=>{deriving();await paused;return derive(...args);};
try{
 const enabling=vault.createLocalVault(password);
 const stale=assert.rejects(enabling,/изменились в другой вкладке/);
 await started;
 await vault.writeVaultCase(draft);
 resume();
 await stale;
 assert.deepEqual(await vault.readVaultCases(),[legacy,draft]);
}finally{resume();crypto.subtle.deriveKey=derive;}
await vault.writeVaultCase(draft,true);
const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args:any[]){if(this.name==='cases')throw new DOMException('Synthetic quota failure','QuotaExceededError');return put.apply(this,args);};
await assert.rejects(vault.createLocalVault(password));IDBObjectStore.prototype.put=put;
assert.equal((await vault.vaultStatus()).configured,false);
let db=await vault.vaultDatabase();let rows=await new Promise<any[]>(resolve=>{const r=db.transaction('cases').objectStore('cases').getAll();r.onsuccess=()=>resolve(r.result);});db.close();assert.equal(rows[0].context,legacy.context);
await vault.createLocalVault(password);assert.deepEqual(await vault.readVaultCases(),[legacy]);
db=await vault.vaultDatabase();rows=await new Promise<any[]>(resolve=>{const r=db.transaction('cases').objectStore('cases').getAll();r.onsuccess=()=>resolve(r.result);});db.close();assert.ok(!JSON.stringify(rows).includes('SYNTHETIC_PRIVATE'));assert.ok(rows[0].sealed);
const backup=await vault.exportVault();assert.ok(!backup.includes('SYNTHETIC_PRIVATE'));
vault.lockVault();await assert.rejects(vault.readVaultCases());await assert.rejects(vault.writeVaultCase(draft));await assert.rejects(vault.openLocalVault('wrong test password'));await vault.openLocalVault(password);
await assert.rejects(vault.restoreVault(backup,'wrong backup password'));assert.equal((await vault.readVaultCases()).length,1);
assert.equal(await vault.restoreVault(backup,password),1);assert.equal((await vault.readVaultCases()).length,2);
assert.equal((await vault.readVaultCases()).filter(c=>c.id===legacy.id).length,1);
console.log('PASS: password-free saves; concurrent migration retry; failed migration rollback; encrypted migration; locked access; password rejection; encrypted backup; verified restore; duplicate-safe merge. No real browser data changed.');
