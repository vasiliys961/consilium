import assert from "node:assert/strict";
import test from "node:test";
import { assessTracing, dropUnclearedClasses, guardStatements, networkObservation, networkStatements } from "./founder.ts";

const leads = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"];

function tenSeconds() {
  const row = leads.map(() => "0").join(",");
  return ["sampling_rate,500", leads.join(","), ...Array.from({ length: 5000 }, () => row)].join("\n");
}

test("a class below the bar is not asserted and a foreign rhythm is removed", async () => {
  const assessment = await assessTracing(
    { name: "strip.csv", text: tenSeconds() },
    "ru",
    {
      names: ["SINUS RHYTHM", "ATRIAL FIBRILLATION"],
      run: async () => JSON.stringify({ ok: true, scores: [{ label: "SINUS RHYTHM", score: 0.91 }, { label: "ATRIAL FIBRILLATION", score: 0.22 }] }),
    },
  );
  assert.equal(assessment?.cleared.length, 1);
  assert.equal(assessment?.cleared[0]?.label, "SINUS RHYTHM");
  const lines = networkStatements(assessment!, "ru");
  assert.match(lines[0]?.text ?? "", /SINUS RHYTHM 0\.91/);
  assert.equal(/0\.22/.test(lines[0]?.text ?? ""), false);
  const guarded = guardStatements(
    [
      ...lines,
      {
        text: "Фибрилляция предсердий. Назначить антикоагулянт. SINUS RHYTHM 0.99.",
        source: null,
        memory: true,
        action: "information",
        held: false,
      },
    ],
    assessment!,
  );
  const modelLine = guarded.find((item) => item.source === null);
  assert.equal(/фибрилляц/i.test(modelLine?.text ?? ""), false);
  assert.equal(/0\.99/.test(modelLine?.text ?? ""), false);
  assert.match(modelLine?.text ?? "", /SINUS RHYTHM/);
  assert.match(guarded[0]?.text ?? "", /0\.91/);
});

test("a short recording never reaches the network", async () => {
  let called = false;
  const assessment = await assessTracing(
    { name: "strip.csv", text: ["sampling_rate,500", leads.join(","), leads.map(() => "0").join(",")].join("\n") },
    "ru",
    { run: async () => { called = true; return null; } },
  );
  assert.equal(called, false);
  assert.equal(assessment?.status, "not_assessed");
  assert.match(networkStatements(assessment!, "ru")[0]?.text ?? "", /10 секунд/);
  assert.equal(dropUnclearedClasses("Есть atrial fibrillation.", ["ATRIAL FIBRILLATION"], []), "Есть.");
});

test('digital measurements reach the report even when classifier weights are unavailable', async () => {
 const measured = await assessTracing({name:'strip.csv',text:tenSeconds()},'en',{
  names:[],run:async()=>JSON.stringify({ok:false,code:'weights',measurements:{available:true,method:'Synthetic delineation',lines:[{name:'HR',value:'60 bpm'}],description:'Synthetic tracing',note:'Check fiducials'}}),
 });
 assert.equal(measured?.status,'not_assessed');
 assert.equal(measured?.measurements?.lines[0].value,'60 bpm');
 assert.match(networkObservation(measured!),/HR: 60 bpm/);
 assert.match(networkObservation(measured!),/No detector class is confirmed/);
});

test("a short aECG does not reach the network", async () => {
  const leads = ["I", "II", "V1", "V2", "V3", "V4", "V5", "V6"];
  const sequences = leads
    .map((lead) => `<sequence><code code="MDC_ECG_LEAD_${lead}"/><digits>1000 3000</digits><scale value="1" unit="uV"/></sequence>`)
    .join("");
  let called = false;
  const assessment = await assessTracing(
    { name: "device.xml", text: `<ecg><increment value="0.002" unit="s"/>${sequences}</ecg>` },
    "ru",
    { run: async () => { called = true; return null; } },
  );
  assert.equal(called, false);
  assert.equal(assessment?.status, "not_assessed");
  assert.match(assessment?.reason ?? "", /10 секунд/);
});

