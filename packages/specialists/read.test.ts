import assert from "node:assert/strict";
import test from "node:test";
import { readSpecialistText, specialistJobs, writeSpecialistReadings } from "./read.ts";

const image = "data:image/png;base64,aaaa";

test("only a frame that passed the quality gate is shown to its specialist", () => {
  const jobs = specialistJobs(
    [
      { source: "mole-derm.png", modality: "dermatology", status: "read" },
      { source: "soft-derm.png", modality: "dermatology", status: "not_assessed" },
      { source: "section-slide.png", modality: "histology", status: "read" },
    ],
    [
      { name: "mole-derm.png", image },
      { name: "soft-derm.png", image },
      { name: "section-slide.png", image },
    ],
  );
  assert.deepEqual(jobs.map((job) => [job.name, job.specialty]), [
    ["mole-derm.png", "dermoscopy"],
    ["section-slide.png", "histology"],
  ]);
});

test("a specialist paragraph keeps only the items of that specialty", () => {
  const note = readSpecialistText(
    '{"text":"Reticular brown network.","items":[{"id":"pattern","text":"reticular","assessed":true},{"id":"grade","text":"G2","assessed":true},{"id":"vessels","text":"","assessed":true}]}',
    "dermoscopy",
  );
  assert.equal(note?.text, "Reticular brown network.");
  assert.deepEqual(note?.items, [{ id: "pattern", text: "reticular" }]);
});

test("the dermoscopy specialist is Gemini and a weak frame is not sent", async () => {
  const secret = "secret-polza-key";
  const bodies: string[] = [];
  const fetchImpl: typeof fetch = async (_url, init) => {
    bodies.push(String(init?.body ?? ""));
    const asked = JSON.parse(String(init?.body)) as { messages?: Array<{ content?: string }> };
    const system = asked.messages?.[0]?.content ?? "";
    const content = String(system).includes("histopathology")
      ? '{"text":"Glandular architecture is visible.","items":[{"id":"architecture","text":"glandular","assessed":true}]}'
      : '{"text":"A brown reticular network is visible.","items":[{"id":"network","text":"brown reticular network","assessed":true}]}';
    return new Response(JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 12, completion_tokens: 18 },
    }));
  };
  const result = await writeSpecialistReadings(
    { OPENROUTER_API_KEY: secret  },
    {
      locale: "en",
      note: "Lesion on the back",
      entries: [
        { source: "mole-derm.png", modality: "dermatology", status: "read" },
        { source: "soft-derm.png", modality: "dermatology", status: "not_assessed" },
        { source: "section-slide.png", modality: "histology", status: "read" },
      ],
      files: [
        { name: "mole-derm.png", image },
        { name: "soft-derm.png", image },
        { name: "section-slide.png", image },
      ],
    },
    fetchImpl,
  );
  assert.equal(bodies.length, 2);
  assert.equal(bodies.some((body) => body.includes("soft-derm.png")), false);
  assert.equal(bodies[0]?.includes("google/gemini-4-argon"), true);
  assert.equal(bodies[0]?.includes("dermoscopy specialist"), true);
  assert.equal(bodies[1]?.includes("histopathology specialist"), true);
  assert.equal(result.readings[0]?.items[0]?.text, "brown reticular network");
  assert.equal(result.readings[1]?.specialty, "histology");
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(result).includes("G2"), false);
});

test("an ultrasound clip keeps the echo and drops an invented measurement", () => {
  const jobs = specialistJobs(
    [{ source: "bladder.mp4", modality: "ultrasound", status: "read" }],
    [{ name: "bladder.mp4", image }],
  );
  assert.deepEqual(jobs.map((job) => job.specialty), ["ultrasound"]);
  const note = readSpecialistText(
    '{"text":"The bladder echo is uniform and the liver measures 4.2 cm.","items":[{"id":"echo","text":"uniform echo","assessed":true},{"id":"label","text":"4.2 cm","assessed":true}]}',
    "ultrasound",
    "bladder.mp4",
  );
  assert.match(note?.text ?? "", /bladder/i);
  assert.equal(note?.text.includes("4.2"), false);
  assert.equal(note?.text.toLowerCase().includes("liver"), false);
  assert.deepEqual(note?.items.map((item) => item.text), ["uniform echo"]);
});

test('specialty images keep Argon primary and send their own JSON and image to Opus only on request',async()=>{
 const models:string[]=[];
 const result=await writeSpecialistReadings({OPENROUTER_API_KEY:'synthetic',GEMINI_MODEL:'google/gemini-3.8-flash'},
 {locale:'en',note:'Describe the image',secondOpinion:true,entries:[{source:'mole-derm.png',modality:'dermatology',status:'read'}],files:[{name:'mole-derm.png',image}]},async(_url,init)=>{
  const body=JSON.parse(String(init?.body));models.push(body.model);assert.ok(JSON.stringify(body.messages).includes(image));if(body.model.includes('opus'))assert.ok(JSON.stringify(body.messages).includes('ARGON_PRIVATE_RESULT'));else assert.ok(!JSON.stringify(body.messages).includes('ARGON_PRIVATE_RESULT'));
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({text:body.model.includes('opus')?'Independent reticular network':'ARGON_PRIVATE_RESULT',items:[{id:'network',text:'Reticular network',assessed:true}],materialConflicts:[]})}}],usage:{prompt_tokens:10,completion_tokens:20}});
 });
 assert.deepEqual(models,['google/gemini-4-argon','anthropic/claude-opus-5.5']);assert.equal(result.readings[0].secondOpinion?.status,'completed');assert.equal(result.reviewUsage[0].model,'anthropic/claude-opus-5.5');
});
