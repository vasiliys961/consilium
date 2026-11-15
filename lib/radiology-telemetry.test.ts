import test from 'node:test';import assert from 'node:assert/strict';import {radiologyTelemetry} from './radiology-telemetry.ts';
test('native radiology receipts enter the shared log without arbitrary fields or text',()=>{
 const event=radiologyTelemetry('CONCILIUM_MODEL '+JSON.stringify({runId:'12345678-1234-1234-1234-123456789abc',event:'model.responded',model:'google/gemini-3.8-flash',provider:'polza',inputTokens:100,outputTokens:10,usageAvailable:true,httpStatus:200,finishReason:'stop',patient:'NEVER_LOG',messages:['NEVER_LOG']}));assert.ok(event);assert.equal(event.module,'opus-radiology');assert.ok(!JSON.stringify(event).includes('NEVER_LOG'));assert.equal(event.estimatedUsd,0.000113);assert.equal(radiologyTelemetry('arbitrary child output'),null);
});
