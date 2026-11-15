import test from 'node:test';import assert from 'node:assert/strict';
import {imageReviewRoute,IMAGE_MODELS} from './routing.ts';
import {comprehendFrames} from '../vision/comprehend.ts';
test('profile routing separates ultrasound/blood, retinal, and general image readers',()=>{
 for(const profile of['ultrasound','blood-smear'])assert.equal(imageReviewRoute(profile).primary,IMAGE_MODELS.terra);
 const retina=imageReviewRoute('retinal');assert.equal(retina.primary,IMAGE_MODELS.opus);assert.equal(retina.secondary,IMAGE_MODELS.argon);
 for(const profile of['histology','dermatoscopy','wound','endoscopy','mammography','ecg','xray'])assert.equal(imageReviewRoute(profile).primary,IMAGE_MODELS.argon);
 assert.equal(imageReviewRoute('ecg').mode,'independent');assert.equal(imageReviewRoute('histology').mode,'informed');
});
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
test('a doubtful retinal image sends original pixels and primary JSON to a DIFFERENT second model',async()=>{
 const requests:Record<string,unknown>[]=[];
 const result=await comprehendFrames({OPENROUTER_API_KEY:'synthetic'},{locale:'en',note:'Describe this study',frames:[{name:'image.png',image,imageProfile:'retinal'}]},async(_url,init)=>{
  const body=JSON.parse(String(init?.body));requests.push(body);assert.ok(JSON.stringify(body.messages).includes(image));
  if(requests.length===2)assert.match(JSON.stringify(body.messages),/FIRST_READER_JSON_MARKER/);
  return Response.json({usage:{prompt_tokens:100,completion_tokens:50},choices:[{finish_reason:'stop',message:{content:JSON.stringify({kind:'other',status:'read',seen:['visible structures'],reading:requests.length===1?'FIRST_READER_JSON_MARKER':'Second assessment',scale:false,marker:false,needsSecondOpinion:requests.length===1,materialConflicts:[]})}}]});
 });
 assert.deepEqual(requests.map(r=>r.model),[IMAGE_MODELS.opus,IMAGE_MODELS.argon]);assert.equal(result.accounts[0].secondOpinion?.mode,'informed');assert.equal(result.primaryUsage[0].model,IMAGE_MODELS.opus);assert.equal(result.reviewUsage[0].model,IMAGE_MODELS.argon);
});
test('normal-confidence mixed profiles call only their own primary models and keep usage separate',async()=>{
 const models:string[]=[];const result=await comprehendFrames({OPENROUTER_API_KEY:'synthetic'},{locale:'en',note:'Describe',frames:[{name:'one.png',image,imageProfile:'retinal'},{name:'two.png',image,imageProfile:'endoscopy'}]},async(_url,init)=>{
  const body=JSON.parse(String(init?.body));models.push(body.model);return Response.json({usage:{prompt_tokens:10,completion_tokens:20},choices:[{finish_reason:'stop',message:{content:JSON.stringify({seen:['Visible structures'],reading:'Primary description',scale:false,marker:false,needsSecondOpinion:false,materialConflicts:[]})}}]});
 });assert.deepEqual(models,[IMAGE_MODELS.opus,IMAGE_MODELS.argon]);assert.equal(result.reviewUsage.length,0);assert.equal(result.primaryUsage.length,2);
});
