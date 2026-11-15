import assert from "node:assert/strict";
import test from "node:test";
import { assignFrames, runDetector } from "./frames.ts";

test("the first four images receive frame ids and the fifth stays unnumbered", () => {
  const frames = assignFrames(["a.jpg", "b.dcm", "c.png", "d.gif", "e.webp", "note.pdf"]);
  assert.deepEqual(
    frames.map((frame) => frame?.id ?? null),
    ["frame-1", "frame-2", "frame-3", "frame-4", null, null],
  );
  assert.match(frames[4]?.reason ?? "", /four frames/);
  assert.equal(frames[5], null);
});

test("a detector that misses the deadline is not assessed and does not block the caller", async () => {
  const started = Date.now();
  const result = await runDetector(() => new Promise((resolve) => setTimeout(() => resolve("late"), 80)), 20);
  assert.deepEqual(result, { status: "not_assessed", reason: "deadline" });
  assert.equal(Date.now() - started < 70, true);
});
