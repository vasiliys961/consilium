import test from 'node:test';
import assert from 'node:assert/strict';
import {runConsilium,CONSILIUM_ROLES} from './consilium.ts';

test('C13: council synthesis receives real model-role specialty labels, not invented physician opinions',async()=>{
 const payloads:{model:string;system:string;packet:string}[]=[];
 const voices=await runConsilium({OPENROUTER_API_KEY:'synthetic'},{
  locale:'ru',note:'ФП, одышка, кашель, СКФ 45. Проверить лечение.',draft:'Черновик врача, без подтверждения.',citations:[],
  record:'ECGFounder provisional classifier: AF. Radiology report: bilateral opacities; coverage unknown.',
  modalities:['ecg','radiology'],
 },async(_url,init)=>{
  const body=JSON.parse(String(init?.body));payloads.push({model:body.model,system:body.messages[0].content,packet:body.messages[1].content});
  return Response.json({choices:[{message:{content:JSON.stringify({text:'Synthetic clinically uncertain note',source:null})}}]});
 });
 assert.equal(payloads.length,5);
 assert.equal(voices.length,CONSILIUM_ROLES.length);
 assert.deepEqual(voices.map(x=>x.id),CONSILIUM_ROLES.map(x=>x.id));
 const common=payloads[0].packet;
 assert.match(common,/hypothesis = cardiology/);
 assert.match(common,/testChooser = pulmonology/);
 assert.match(common,/not five independent clinicians/);
 assert.match(common,/ECGFounder score/);
 assert.match(common,/histopathology image-reading is not an additional independent specialist vote/);
 const final=payloads.find(x=>x.system.startsWith('Synthesize the four'))!;
 assert.match(final.packet,/hypothesis \[AI clinical perspective: cardiology; NOT a human specialist vote\]/);
 assert.match(final.packet,/testChooser \[AI clinical perspective: pulmonology; NOT a human specialist vote\]/);
 assert.match(final.packet,/challenger \[AI clinical perspective: multidisciplinary critic; NOT a human specialist vote\]/);
 assert.match(final.packet,/stewardship \[AI clinical perspective: medication safety; NOT a human specialist vote\]/);
 assert.ok(!final.packet.includes('Medical board has verified'));
});
test('C13: a missing council voice is clearly missing even after adaptive labeling',async()=>{
 const all:string[]=[];
 const result=await runConsilium({OPENROUTER_API_KEY:'synthetic'},{
  locale:'en',note:'Generic fatigue',draft:'Provisional',citations:[],modalities:[],
 },async(_url,init)=>{
  const body=JSON.parse(String(init?.body));const sys=String(body.messages[0].content);
  all.push(String(body.messages[1].content));
  if(sys.startsWith('You are the critic'))return Response.json({error:'Unavailable'},{status:503});
  return Response.json({choices:[{message:{content:JSON.stringify({text:'Synthetic output',source:null})}}]});
 });
 assert.equal(result.length,5);
 assert.equal(result.find(v=>v.id==='challenger')?.status,'not_assessed');
 assert.match(all.at(-1)??'',/challenger \[AI clinical perspective: multidisciplinary critic\]: NOT ASSESSED/);
 assert.match(all.at(-1)??'',/hypothesis = internal medicine; testChooser = internal medicine/);
});
