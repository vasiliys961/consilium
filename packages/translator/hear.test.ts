import assert from "node:assert/strict";
import test from "node:test";
import { hearClip, speechSource } from "./hear.ts";
import { hearMissReason, hearReason, hearWindow, wavBase64, wavDurationSeconds } from "./wav.ts";

test("a typed phrase stays the source and a long clip is not sent", async () => {
  assert.equal(speechSource("  Метопролол 50 мг. ", "другая фраза"), "Метопролол 50 мг.");
  const long = wavBase64(new Float32Array(16000 * 21), 16000);
  assert.equal(wavDurationSeconds(long)! > 20, true);
  let called = false;
  const missed = await hearClip({ OPENROUTER_API_KEY: "secret-polza-key"  }, long, async () => {
    called = true;
    return new Response("no");
  });
  assert.equal(missed, null);
  assert.equal(called, false);
  assert.equal(hearWindow(21), "long");
  assert.equal(hearWindow(1), "short");
  assert.equal(hearWindow(0.1), "closed");
  assert.match(hearReason("long", "ru"), /к модели не уходит/);
  assert.match(hearReason("short", "en"), /Numbers stay as spoken/);
  assert.match(hearMissReason("ru"), /не сохранена/);
});

test("a short wav is transcribed and the key stays out of the result", async () => {
  const clip = wavBase64(new Float32Array(16000), 16000);
  assert.ok((wavDurationSeconds(clip) ?? 0) >= 0.2);
  const result = await hearClip({ OPENROUTER_API_KEY: "secret-polza-key"  }, clip, async (_url, init) => {
    const body = String(init?.body);
    assert.equal(body.includes("input_audio"), true);
    assert.equal(body.includes("secret-polza-key"), false);
    return new Response(JSON.stringify({
      choices: [{ message: { content: "Метопролол 50 мг." } }],
      usage: { prompt_tokens: 12, completion_tokens: 4 },
    }));
  });
  assert.equal(result?.text, "Метопролол 50 мг.");
  assert.equal(JSON.stringify(result).includes("secret-polza-key"), false);
  const empty = await hearClip({ OPENROUTER_API_KEY: "secret-polza-key"  }, clip, async () => new Response(JSON.stringify({
    choices: [{ message: { content: "" } }],
  })));
  assert.equal(empty, null);
});
