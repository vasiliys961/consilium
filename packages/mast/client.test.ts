import assert from "node:assert/strict";
import test from "node:test";
import { submitCase } from "./client.ts";

test("the MAST client uses the case address and does not retain the case", async () => {
  let url = "";
  let sent = "";
  const result = await submitCase(
    "http://127.0.0.1:3456",
    { text: "chest pain", locale: "en", deadlineMs: 900_000 },
    (async (input, init) => {
      url = String(input);
      sent = String(init?.body);
      return new Response(JSON.stringify({ draft: { summary: "Unsigned draft." }, unassessed: [], cost: { totalUsd: 0 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  );
  assert.equal(url, "http://127.0.0.1:3456/api/v1/cases");
  const body = JSON.parse(sent) as { retain: boolean; deadlineMs: number };
  assert.equal(body.retain, false);
  assert.equal(body.deadlineMs, 300_000);
  assert.equal(sent.includes("pza_"), false);
  assert.equal(sent.includes("sk-or-v1-"), false);
  assert.equal(result.status, 200);
  assert.equal(result.body.draft.summary, "Unsigned draft.");
});
