import assert from "node:assert/strict";
import test from "node:test";
import { checkFidelity, targetLanguage } from "./fidelity.ts";
import { interpretSpeech } from "./speech.ts";

test('an explicitly selected patient language is used for a non-Russian source', async () => {
 let called = false;
 const result = await interpretSpeech({ OPENROUTER_API_KEY: 'test' }, {text:'Dolor abdominal desde ayer.',locale:'en',audience:'patient',target:'en'}, async (_url, init) => {
  called = true;
  const request=JSON.parse(String(init?.body));
  assert.match(request.messages[0].content,/into English/);
  return Response.json({choices:[{message:{content:'Abdominal pain since yesterday.'},finish_reason:'stop'}]});
 });
 assert.equal(called,true);
 assert.equal(result?.target,'en');
 assert.match(result?.translation??'',/Abdominal pain/);
});

test("a changed dose is marked and the source stays", () => {
  const source = "Я принимаю метопролол 50 мг два раза в день.";
  const report = checkFidelity(source, "I take metoprolol 500 mg twice a day.");
  assert.equal(report.source, source);
  assert.equal(report.findings.some((finding) => finding.code === "dose" && finding.detail === "50 mg"), true);
});

test("a faithful dose and a kept negation pass", () => {
  const dose = checkFidelity("Я принимаю метопролол 50 мг два раза в день.", "I take metoprolol 50 mg twice a day.");
  const allergy = checkFidelity(
    "У меня никогда не было аллергии на пенициллин.",
    "I have never had an allergy to penicillin.",
  );
  assert.deepEqual(dose.findings, []);
  assert.deepEqual(allergy.findings, []);
});

test("a dropped negation, drug, or term is marked", () => {
  const negation = checkFidelity("У меня никогда не было аллергии на пенициллин.", "I have an allergy to penicillin.");
  const drug = checkFidelity("Я принимаю метопролол 50 мг.", "I take 50 mg.");
  const term = checkFidelity("Одышка появилась два часа назад.", "It started two hours ago.");
  assert.equal(negation.findings.some((finding) => finding.code === "negation"), true);
  assert.equal(drug.findings.some((finding) => finding.code === "drug"), true);
  assert.equal(term.findings.some((finding) => finding.code === "term"), true);
  const extra = checkFidelity("Я принимаю метформин 500 мг.", "I take 500 mg.");
  assert.equal(extra.findings.some((finding) => finding.code === "drug" && finding.detail === "dropped:metformin"), true);
});

test("the interpreter keeps the source when the translation changes a number", async () => {
  const secret = "secret-polza-key";
  const result = await interpretSpeech(
    { OPENROUTER_API_KEY: secret  },
    { text: "Метопролол 50 мг.", locale: "ru", audience: "patient" },
    async () => new Response(JSON.stringify({
      choices: [{ message: { content: "Metoprolol 500 mg." } }],
      usage: { prompt_tokens: 20, completion_tokens: 8 },
    })),
  );
  assert.equal(result?.source, "Метопролол 50 мг.");
  assert.equal(result?.translation, "Metoprolol 500 mg.");
  assert.equal(result?.findings.some((finding) => finding.code === "dose"), true);
  assert.equal(result?.model, "google/gemini-4-argon");
  assert.equal(targetLanguage("Метопролол 50 мг.", "ru", "patient"), "en");
  assert.equal(JSON.stringify(result).includes(secret), false);
});
