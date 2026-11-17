import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeWav} from '../packages/translator/wav.ts';
import {transcribeSpecialistVoice,SPECIALIST_STT_MODEL,SPECIALIST_STT_USD_PER_SECOND} from './specialist-voice-stt.ts';
import {readFileSync} from 'node:fs';

function sample(seconds=1):string{
 const bytes=encodeWav(new Float32Array(16000*seconds),16000);
 return Buffer.from(bytes).toString('base64');
}

test('C13: Whisper STT has one request with dedicated OpenRouter endpoint and honest billed cost',async()=>{
 let calls=0;
 const transcript=await transcribeSpecialistVoice({OPENROUTER_API_KEY:'synthetic'},sample(1),async(url,init)=>{
  calls++;
  assert.equal(String(url),'https://openrouter.ai/api/v1/audio/transcriptions');
  assert.equal(new Headers(init?.headers).get('authorization'),'Bearer synthetic');
  const req=JSON.parse(String(init?.body));
  assert.equal(req.model,SPECIALIST_STT_MODEL);
  assert.equal(req.input_audio.format,'wav');
  assert.ok(req.input_audio.data.startsWith('UklGR'));
  assert.equal(req.response_format,'json');
  return Response.json({text:'Patient denies dyspnea. Metoprolol 50 mg.',usage:{seconds:1,cost:0.0000025}});
 });
 assert.equal(calls,1);
 assert.equal(transcript?.text,'Patient denies dyspnea. Metoprolol 50 mg.');
 assert.equal(transcript?.sttCost,0.0000025);
 assert.equal(transcript?.sttBillingSource,'openrouter');
 assert.equal(transcript?.seconds,1);
});

test('C13: missing billed amount is clearly estimated, not labelled actual, and does not start extra LLM',async()=>{
 const result=await transcribeSpecialistVoice({OPENROUTER_API_KEY:'synthetic'},sample(2),async()=>Response.json({text:'Synthetic cough.'}));
 assert.equal(result?.sttCost,2*SPECIALIST_STT_USD_PER_SECOND);
 assert.equal(result?.sttBillingSource,'estimate');
 assert.equal(result?.model,'openai/whisper-large-v3-turbo');
});

test('C13: rejects missing API key, unsafe endpoint, too long and truncated clips without network',async()=>{
 let calls=0;
 const noNetwork:typeof fetch=async()=>{calls++;throw Error('unexpected request')};
 assert.equal(await transcribeSpecialistVoice({},sample(),noNetwork),null);
 assert.equal(await transcribeSpecialistVoice({OPENROUTER_API_KEY:'synthetic',OPENROUTER_BASE_URL:'http://evil.example/api'},sample(),noNetwork),null);
 assert.equal(await transcribeSpecialistVoice({OPENROUTER_API_KEY:'synthetic'},'not-wav',noNetwork),null);
 assert.equal(await transcribeSpecialistVoice({OPENROUTER_API_KEY:'synthetic'},sample(21),noNetwork),null);
 assert.equal(calls,0);
});

test('C13: do not retry transcription on provider error or fake zero cost on failure',async()=>{
 let calls=0;
 await assert.rejects(
  ()=>transcribeSpecialistVoice({OPENROUTER_API_KEY:'synthetic'},sample(),async()=>{calls++;return Response.json({error:'failed'},{status:502})}),
  /STT unsuccessful/
 );
 assert.equal(calls,1);
});

test('C13: UI separates STT charge from specialist LLM answer and retains physician edit control',()=>{
 const server=readFileSync('app/api/specialist-chat/route.ts','utf8');
 const ui=readFileSync('app/consult/page.tsx','utf8');
 assert.match(server,/transcribeSpecialistVoice/);
 assert.doesNotMatch(server,/hearClip\(/);
 assert.match(ui,/sttCost/);
 assert.match(ui,/sttBillingSource/);
 assert.match(ui,/specialist-stt-cost/);
 assert.match(ui,/value=\{question\}/);
 assert.match(ui,/onChange=\{event =>/);
});
