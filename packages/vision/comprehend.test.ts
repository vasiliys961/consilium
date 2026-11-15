import assert from "node:assert/strict";
import test from "node:test";
import { accountFrame, frameWindow, observationOf, statementsOf } from "./comprehend.ts";

test("a frame without a scale or a marker loses millimetres and side", () => {
  const account = accountFrame(
    '{"seen":["PA chest","12 mm nodule on the left"],"reading":"The left base is consistent with a small effusion, 12 mm.","scale":false,"marker":false}',
    "chest.png",
  );
  assert.equal(account?.seen.includes("12 mm nodule on the left"), false);
  assert.equal(account?.seen.includes("PA chest"), true);
  assert.equal(account?.reading.includes("12"), false);
  assert.equal(/left/i.test(account?.reading ?? ""), false);
  assert.match(account?.reading ?? "", /effusion/);
});

test("a printed marker and a ruler keep the side and the measurement", () => {
  const account = accountFrame(
    '{"seen":["marker L","scale 10 mm"],"reading":"The marked left side shows a 10 mm dense focus.","scale":true,"marker":true}',
    "chest.png",
  );
  assert.match(account?.seen.join(" ") ?? "", /marker L/);
  assert.match(account?.reading ?? "", /left/);
  assert.match(account?.reading ?? "", /10 mm/);
});

test("a filename is a hint and does not erase anatomy actually reported by the reader", () => {
  const account = accountFrame(
    '{"seen":["a gland"],"reading":"The liver is enlarged.","scale":false,"marker":false}',
    "thyroid-us.png",
    "ru",
  );
  assert.match(account?.reading ?? "", /liver/);
  assert.equal(frameWindow("thyroid-us.png", "ultrasound"), "ultrasound");
  assert.equal(frameWindow("chest.png", "radiology"), "radiograph");
});

test("the seen line can be cited and the reading stays unsigned", () => {
  const account = accountFrame('{"seen":["frontal chest"],"reading":"Consistent with a clear field.","scale":false,"marker":false}', "chest.png");
  assert.ok(account);
  const lines = statementsOf([account], "ru");
  assert.equal(lines[0]?.source, "file:chest.png");
  assert.equal(lines[0]?.memory, false);
  assert.equal(lines[1]?.memory, true);
  assert.match(lines[1]?.text ?? "", /Осмысление без подписи/);
  assert.match(observationOf([account]), /Status: read/);
});

test("partial JSON and unstructured text are not clinical readings",()=>{
 assert.equal(accountFrame('{"seen":["QRS"],"reading":"cut off','ecg2.png'),null);
 assert.equal(accountFrame('a broken free-text response','image.png'),null);
});
test("ECG laterality terminology is preserved and long interpretations do not silently lose their ending",()=>{
 const reading='Right bundle branch morphology. '+ 'Visible findings. '.repeat(50)+'Final conclusion.';
 const account=accountFrame(JSON.stringify({seen:['Right bundle branch morphology'],reading,kind:'tracing',status:'read'}),'ecg2.png');
 assert.match(account?.reading??'',/Right bundle/);assert.match(account?.reading??'',/Final conclusion\.$/);
});

test('unverified numeric ECG rate estimates are excluded rather than presented as measurements',()=>{
 const result=accountFrame(JSON.stringify({kind:'tracing',status:'read',seen:['Regular P/QRS pattern','Rate 60-65 bpm'],reading:'Regular rhythm. Rate 60-65 bpm. Narrow QRS.',limitations:[]}), 'ecg2.png','en');
 assert.ok(result);assert.equal(result.seen.some(line=>line.includes('60')),false);assert.equal(result.reading.includes('60'),false);assert.match(result.limitations?.join(' ')??'',/not verified/);
});

test('medical image reader stays Argon after price increase even with a Flash environment choice',async()=>{
 const {comprehendFrames}=await import('./comprehend.ts');
 const {GEMINI_FLASH,GEMINI_ARGON,resolveGeminiPolicy,GEMINI_BASELINES}=await import('../../lib/gemini-policy.ts');
 const policy=resolveGeminiPolicy([{provider:'openrouter',baseline:GEMINI_BASELINES.openrouter,argon:{input:4,output:20,currency:'USD'},flash:{input:.75,output:3.75,currency:'USD'}}],'','1234567890abcdef',null,Date.parse('2026-12-02T00:00:00Z'));
 assert.equal(policy.selected,'argon');assert.equal(policy.needsChoice,false);
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
 let calls=0;
 const result=await comprehendFrames({OPENROUTER_API_KEY:'synthetic',GEMINI_MODEL:GEMINI_FLASH},{locale:'en',note:'Synthetic test',frames:[{name:'synthetic.png',image,modality:'radiology'}]},async(url,init)=>{
  calls++;assert.match(String(url),/^https:\/\/openrouter.ai\//);
  const body=JSON.parse(String(init?.body));assert.equal(body.model,GEMINI_ARGON);assert.ok(JSON.stringify(body.messages).includes(image));
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({seen:['Synthetic frame'],reading:'Synthetic reading',scale:false,marker:false})}}]});
 });
 assert.equal(calls,1);assert.equal(result.model,GEMINI_ARGON);assert.equal(result.accounts.length,1);
});

test('Opus gets original pixels and no Argon conclusion only when a material conflict exists',async()=>{
 const {comprehendFrames}=await import('./comprehend.ts');
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
 const calls:string[]=[];
 const result=await comprehendFrames({OPENROUTER_API_KEY:'synthetic'},{locale:'en',note:'Read ECG',frames:[{name:'ecg.png',image,modality:'ecg'}]},async(_url,init)=>{
  const b=JSON.parse(String(init?.body));calls.push(b.model);
  assert.ok(JSON.stringify(b.messages).includes(image));
  if(b.model.includes('opus'))assert.ok(!JSON.stringify(b.messages).includes('ARGON_PRIVATE_DIAGNOSIS'));
  return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{finish_reason:'stop',message:{content:JSON.stringify({seen:['Visible QRS'],reading:b.model.includes('opus')?'Independent assessment':'ARGON_PRIVATE_DIAGNOSIS',materialConflicts:b.model.includes('opus')?[]:['Conduction differs from supplied tracing measurement'],scale:true,marker:true})}}]});
 });
 assert.deepEqual(calls,['google/gemini-4-argon','anthropic/claude-opus-5.5']);assert.equal(result.accounts[0].secondOpinion?.status,'completed');assert.equal(result.reviewUsage[0].model,'anthropic/claude-opus-5.5');
});
