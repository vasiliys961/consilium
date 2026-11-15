import {deflateSync} from 'node:zlib';
import test from 'node:test';import assert from 'node:assert/strict';
import {createPrivacyFrame,markPrivacyReview,buildVisionPrivacyPacket} from './vision-privacy.ts';
import {analyzeVolumeWithArgon,RADIOLOGY_ARGON,type ArgonVolumeResult} from './argon-volume-analysis.ts';
import {selectArgonVisualInput} from './opus-targeted-visual-review.ts';
import {bindLocalSanitizedReview,perFrameModelCoverage} from './local-cloud-source-navigation.ts';
import {reviewSanitizedSamples} from './sanitized-cloud-review.ts';
import type {SafeVolumeOpusInput} from './full-volume-receipts.ts';
function chunk(type:string,payload:Buffer){
 const tag=Buffer.from(type),len=Buffer.alloc(4),crc=Buffer.alloc(4);
 len.writeUInt32BE(payload.length);let c=0xffffffff;
 for(const b of Buffer.concat([tag,payload])){c^=b;
   for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}
 crc.writeUInt32BE((c^0xffffffff)>>>0);
 return Buffer.concat([len,tag,payload,crc]);
}
function makePng(seed=1){
 const h=Buffer.alloc(13);h.writeUInt32BE(2,0);h.writeUInt32BE(2,4);
 h[8]=8;h[9]=6;
 const raw=Buffer.from([0,1,2,3,255,4,5,6,255,0,7,8,9,255,10,11,12,255]);
 raw[1]=seed;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
  chunk("IHDR",h),chunk("IDAT",deflateSync(raw)),chunk("IEND",Buffer.alloc(0))]);
}

const png=makePng();
const packet=()=>buildVisionPrivacyPacket([markPrivacyReview(markPrivacyReview(createPrivacyFrame(png,'frame-1','CT'),'pixel',true),'visual',true)],crypto.randomUUID());
const report='ИССЛЕДОВАНИЕ: КТ.\nМЕТОДИКА: Просмотрена ограниченная подборка исходных изображений, полный объём этим читателем не оценивался.\nОПИСАНИЕ: ARGON_PRIVATE_FINDING.\nЗАКЛЮЧЕНИЕ: Требует проверки.\nРЕКОМЕНДАЦИИ: Сопоставление врачом.';
const study:SafeVolumeOpusInput={schema:'opus-volume-synthesis-request/v1',modality:'CT',plannedFrames:1,overviewReviewed:1,targetedReviewed:0,completedBatches:1,totalBatches:1,observations:[{sliceNumber:1,pass:'overview',anatomy:'test',sign:'FLASH_PRIVATE_FINDING',uncertainty:'test'}],limitations:[],detectorState:'unavailable',detectorEvidence:null,acknowledgePaidOpusSynthesis:true};
const reply=(data:unknown)=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(data)}}],usage:{prompt_tokens:120,completion_tokens:70}});
const blind={role:'observations',reviewedImageIds:['frame-1'],observations:[{id:'one',imageId:'frame-1',anatomy:'test',sign:'OPUS_INDEPENDENT',uncertainty:'test'}],limitations:[]};
test('volume: ordinary findings send Flash JSON and original pixels to Argon without paying Opus',async()=>{
 const result=await analyzeVolumeWithArgon({synthesis:study,visualReview:{packets:[packet()],sliceNumbers:[1]}},async req=>{assert.equal(req.model,RADIOLOGY_ARGON);assert.match(JSON.stringify(req.messages),/FLASH_PRIVATE_FINDING/);assert.match(JSON.stringify(req.messages),/image_url/);return reply({summary:report,limitations:[],materialConflicts:[]});});
 assert.equal(result.secondOpinion.status,'not_requested');assert.deepEqual(result.argonSliceNumbers,[1]);
});
test('volume: conflict triggers blind Opus; explicit second opinion reuses the saved primary',async()=>{
 let calls=0;let primary:ArgonVolumeResult|undefined;const payload={synthesis:study,visualReview:{packets:[packet()],sliceNumbers:[1]}};
 const result=await analyzeVolumeWithArgon(payload,async req=>{calls++;if(req.model===RADIOLOGY_ARGON)return reply({summary:report,limitations:[],materialConflicts:[{issue:'Different site',sliceNumbers:[1],verification:'Check pixels'}]});assert.match(JSON.stringify(req.messages),/image_url/);assert.doesNotMatch(JSON.stringify(req.messages),/ARGON_PRIVATE_FINDING|FLASH_PRIVATE_FINDING/);return reply(blind);},undefined,{onPrimary:value=>{primary=value;}});
 assert.equal(calls,2);assert.equal(result.secondOpinion.status,'completed');
 const second=await analyzeVolumeWithArgon({...payload,secondOpinion:true},async req=>{assert.notEqual(req.model,RADIOLOGY_ARGON);return reply(blind);},undefined,{primary});assert.equal(second.secondOpinion.reason,'physician');
});
test('second-reader failure preserves the primary; invalid source slice refuses all calls',async()=>{
 let calls=0;const payload={synthesis:study,visualReview:{packets:[packet()],sliceNumbers:[1]},secondOpinion:true};
 const result=await analyzeVolumeWithArgon(payload,async req=>{calls++;if(req.model!==RADIOLOGY_ARGON)throw Error('offline');return reply({summary:report,limitations:[],materialConflicts:[]});});assert.equal(calls,2);assert.match(result.finalReport,/ARGON_PRIVATE_FINDING/);assert.equal(result.secondOpinion.status,'unavailable');
 await assert.rejects(()=>analyzeVolumeWithArgon({...payload,visualReview:{packets:[packet()],sliceNumbers:[2]}},async()=>{throw Error('must not call');}));
});
test('selection includes controls without Flash findings, and a focal seed with its neighbors',()=>{
 const packets=Array.from({length:40},packet);const none=selectArgonVisualInput(packets,[]);assert.ok(none);for(const n of[1,14,27,40])assert.ok(none.sliceNumbers.includes(n));assert.ok(none.sliceNumbers.length<=16);
 const selected=selectArgonVisualInput(packets,[{batchIndex:0,usage:{inputTokens:1,outputTokens:1},findings:[],limitations:[],recheckIndices:[20]}]);assert.ok(selected?.sliceNumbers.includes(21));assert.ok(selected?.sliceNumbers.includes(20));assert.ok(selected?.sliceNumbers.includes(22));
});
test('single-image route pays Argon only, adds blind Opus only on material conflict',async()=>{
 for(const conflict of[false,true]){let calls=0;const result=await reviewSanitizedSamples(packet(),async req=>{calls++;if(req.model!==RADIOLOGY_ARGON){assert.doesNotMatch(JSON.stringify(req.messages),/ARGON_PRIVATE_FINDING/);return reply(blind);}return reply({...blind,opusSynthesis:{schema:'opus-integrated-gemini-detector-synthesis/v1',summary:report,comparisons:[],conflicts:conflict?['Material discrepancy']:[],limitations:[],sourceCoverage:'sampled_frames_only',clinicallyValidated:false}});},undefined,null,null,null,null,null,'ru',{});
 assert.equal(calls,conflict?2:1);assert.equal(result.primaryModel,RADIOLOGY_ARGON);assert.equal(result.results.length,conflict?2:1);assert.equal(bindLocalSanitizedReview(result,result.sourceFrames,['private-local-file']).size,1);assert.equal(perFrameModelCoverage(result).length,1);}
});
