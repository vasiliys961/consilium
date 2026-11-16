import assert from "node:assert/strict";
import test from "node:test";
import { CONSILIUM_ROLES, readVoice, runConsilium } from "./consilium.ts";
import { MODELS } from "./cost.ts";

test("a critic sentence without a listed source stays model memory", () => {
  const spoken = readVoice(
    JSON.stringify({ text: "The obvious diagnosis is overestimated.", source: "pmid:1" }),
    new Set(["pmid:42263157"]),
  );
  assert.equal(spoken?.memory, true);
  assert.match(spoken?.text ?? "", /overestimated/);
});

test('a completed consilium opinion is not silently cut at 700 characters',()=>{
 const text='Synthetic completed opinion. '.repeat(70)+'Final safety conclusion.';
 const result=readVoice(JSON.stringify({text,source:null}),new Set());
 assert.equal(result?.text,text);assert.match(result!.text,/Final safety conclusion\.$/);
});

test("roles keep their own models and a silent critic does not stop the others", async () => {
  const models: string[] = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ content: string }> };
    models.push(body.model);
    const task = body.messages[0]?.content ?? "";
    if (task.startsWith("You are the critic")) return new Response("down", { status: 503 });
    return Response.json({
      choices: [{ message: { content: JSON.stringify({ text: task.slice(0, 40), source: null }) } }],
      usage: { prompt_tokens: 12, completion_tokens: 6 },
    });
  };

  const voices = await runConsilium(
    { OPENROUTER_API_KEY: "secret-polza-key"  },
    { note: "Chest pain", locale: "en", draft: "Unsigned.", citations: [] },
    fetchImpl,
  );

  assert.deepEqual(
    voices.map((voice) => voice.id),
    CONSILIUM_ROLES.map((role) => role.id),
  );
  assert.equal(voices.find((voice) => voice.id === "hypothesis")?.model, MODELS.pro);
  assert.equal(voices.find((voice) => voice.id === "testChooser")?.model, MODELS.sol);
  assert.equal(voices.find((voice) => voice.id === "challenger")?.status, "not_assessed");
  assert.equal(voices.find((voice) => voice.id === "checklist")?.status, "done");
  assert.equal(models.includes(MODELS.opus), true);
  assert.equal(models.includes(MODELS.sonnet), true);
  assert.equal(JSON.stringify(voices).includes("secret-polza-key"), false);
});

test("the consilium hears a copied laboratory value beside the rest of the record", async () => {
  let heard = "";
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
    heard += body.messages.map((message) => message.content).join("\n");
    return Response.json({
      choices: [{ message: { content: JSON.stringify({ text: "Noted.", source: null }) } }],
      usage: { prompt_tokens: 3, completion_tokens: 2 },
    });
  };
  await runConsilium(
    { OPENROUTER_API_KEY: "secret-polza-key"  },
    {
      note: "Chest pain",
      locale: "en",
      draft: "Unsigned.",
      citations: [],
      record: "ECG network: SINUS RHYTHM 0.91\nlabs.csv: Glucose 5.6 mmol/L",
    },
    fetchImpl,
  );
  assert.match(heard, /Glucose 5\.6/);
  assert.match(heard, /SINUS RHYTHM 0\.91/);
  assert.equal(heard.includes("secret-polza-key"), false);
});

 test('consilium switches only after a confirmed Argon price increase', async()=>{
 const {consiliumHypothesisModel,GEMINI_ARGON,GEMINI_FLASH}=await import('./gemini-policy.ts');
 assert.equal(consiliumHypothesisModel({reviewActive:false,priceIncreased:true}),GEMINI_ARGON);
 assert.equal(consiliumHypothesisModel({reviewActive:true,priceIncreased:false}),GEMINI_ARGON);
 assert.equal(consiliumHypothesisModel({reviewActive:true,priceIncreased:true}),GEMINI_FLASH);
 const models:string[]=[];
 await runConsilium({OPENROUTER_API_KEY:'test',GEMINI_MODEL:MODELS.flash},{note:'Synthetic',locale:'en',draft:'',citations:[]},async(_url,init)=>{
 models.push(JSON.parse(String(init?.body)).model);
 return Response.json({choices:[{message:{content:JSON.stringify({text:'Synthetic opinion',source:null})}}]});
 });
 assert.equal(models[0],GEMINI_ARGON);
 assert.ok(models.includes(MODELS.sol));
 });

test('confirmed December price rise sends hypothesis to Flash through OpenRouter',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-12-02T12:00:00Z')});
 try{
  const models:string[]=[];
  const voices=await runConsilium({OPENROUTER_API_KEY:'synthetic-december',GEMINI_MODEL:MODELS.flash},{note:'Synthetic case',locale:'en',draft:'',citations:[]},async(url,init)=>{
   assert.match(String(url),/^https:\/\/openrouter.ai\//);
   if(String(url).endsWith('/models'))return Response.json({data:[{id:MODELS.pro,pricing:{prompt:'0.000004',completion:'0.00002'}},{id:MODELS.flash,pricing:{prompt:'0.00000075',completion:'0.00000375'}}]});
   models.push(JSON.parse(String(init?.body)).model);
   return Response.json({choices:[{message:{content:JSON.stringify({text:'Synthetic opinion',source:null})}}]});
  });
  assert.equal(models[0],'google/gemini-3.8-flash');
  assert.equal(voices.find(voice=>voice.id==='hypothesis')?.model,'google/gemini-3.8-flash');
  assert.ok(!models.includes('google/gemini-3.1-pro-preview'));
 }finally{t.mock.timers.reset();}
});

test('duplicate identical evidence is sent only once per role without dropping a unique excerpt',async()=>{
 const excerpts:string[]=[];
 const input={note:'Synthetic clinical uncertainty',locale:'en' as const,draft:'Uncertain diagnosis',citations:[
  {title:'QA synthetic evidence',pmid:'123',excerpt:'Synthetic unique evidence A'},
  {title:'QA synthetic evidence',pmid:'123',excerpt:'Synthetic unique evidence A'},
  {title:'QA synthetic evidence B',pmid:'456',excerpt:'Synthetic unique evidence B'},
 ] as unknown as Parameters<typeof runConsilium>[1]['citations']};
 const result=await runConsilium({OPENROUTER_API_KEY:'test'},input,async(_url,init)=>{
  const req=JSON.parse(String(init?.body));const prompt=String(req.messages?.[1]?.content??'');
  excerpts.push(prompt);
  return Response.json({choices:[{message:{content:JSON.stringify({text:'Synthetic safe opinion',source:null})}}]});
 });
 assert.equal(excerpts.length,5);
 for(const prompt of excerpts){
  assert.equal(prompt.split('Synthetic unique evidence A').length-1,1);
  assert.equal(prompt.split('Synthetic unique evidence B').length-1,1);
  assert.match(prompt,/Synthetic clinical uncertainty/);
 }
 assert.equal(result.filter(item=>item.status==='done').length,5);
});
