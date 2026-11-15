import test from 'node:test';import assert from 'node:assert/strict';
import {createVaultKey,checkVaultKey,seal,unseal} from './vault-crypto.ts';
test('password-based encrypted vault restores exactly and rejects wrong passwords, tampering and record swaps',async()=>{
 const password='Synthetic verification password only',value={name:'SYNTHETIC_PRIVATE_NAME',dates:['2026-11-08'],files:[{text:'private synthetic notes'}]};
 const {key,meta}=await createVaultKey(password),sealed=await seal(key,value,'case:A');
 assert.ok(!JSON.stringify({meta,sealed}).includes(value.name));assert.equal(key.extractable,false);
 const reopened=await checkVaultKey(password,meta);assert.deepEqual(await unseal(reopened,sealed,'case:A'),value);
 await assert.rejects(checkVaultKey('Wrong verification password',meta));await assert.rejects(unseal(reopened,sealed,'case:B'));
 const damaged={...sealed,data:sealed.data.slice(0,-5)+'AAAA='};await assert.rejects(unseal(reopened,damaged,'case:A'));
 const again=await seal(key,value,'case:A');assert.notEqual(again.iv,sealed.iv);assert.notEqual(again.data,sealed.data);
});
test('short passwords are rejected before a vault is created',async()=>{await assert.rejects(createVaultKey('short'));});
