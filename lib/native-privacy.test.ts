import test from 'node:test';import assert from 'node:assert/strict';
import {prepareNativePayload,signNativePrivacy,nativePrivacyGuard,nativeAudioGuard} from '../integrations/protocol/ru/lib/concilium-privacy.ts';
test('native protocols require an approval bound to the exact payload before any provider call',async()=>{
 const body=prepareNativePayload({model:'openai/gpt-6.1-sol',rawText:'Patient name: John Smith; DOB: 1980-01-01; exam 2026-11-08, followup 2026-11-15. No pain. 50 mg.',ragExamples:['Иванов И.И.']}) as any;
 assert.equal(body.model,'openai/gpt-6.1-sol');for(const token of ['John Smith','Иванов','1980','2026'])assert.ok(!JSON.stringify(body).includes(token));assert.ok(body.rawText.includes('[day 7]'));assert.ok(body.rawText.includes('No pain. 50 mg.'));
 const token=signNativePrivacy(body);const request=(value:unknown,header?:string)=>new Request('http://127.0.0.1:3111/api/protocol',{method:'POST',headers:{'content-type':'application/json',...(header?{'x-concilium-privacy':header}:{})},body:JSON.stringify(value)});
 assert.equal((await nativePrivacyGuard(request(body)))?.status,428);assert.equal(await nativePrivacyGuard(request(body,token)),null);assert.equal((await nativePrivacyGuard(request({...body,rawText:'changed'},token)))?.status,428);
});
test('native audio requires separate consent bound to the actual recording bytes',async()=>{
 const form=new FormData();form.set('file',new File(['SYNTHETIC AUDIO ONLY'],'sample.wav',{type:'audio/wav'}));const request=new Request('http://127.0.0.1:3111/api/transcribe',{method:'POST',body:form});assert.equal((await nativeAudioGuard(request))?.status,428);
});

test('audio integrity hashes are never passed through identifier masking',()=>{const value={sha256:'8888888888888888888888888888888888888888888888888888888888888888',bytes:100,type:'audio/wav'};assert.deepEqual(prepareNativePayload(value),value);});
