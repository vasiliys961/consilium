import assert from "node:assert/strict";
import test from "node:test";
import { clipGate, clipLine, printedLines, readClip, type ClipNote } from "./clip.ts";
import type { PlaneSample } from "../skin/quality.ts";

function plane(fill: (x: number, y: number) => number): PlaneSample {
  const sampleWidth = 16;
  const sampleHeight = 16;
  const gray: number[] = [];
  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) gray.push(fill(x, y));
  }
  return { width: 320, height: 240, sampleWidth, sampleHeight, gray, saturation: 0.1 };
}

const sharp = plane((x, y) => ((x + y) % 2 === 0 ? 0.15 : 0.75));
const flat = plane(() => 0.5);

test("a clip without frames is not read and a sharp frame is", () => {
  const closed = readClip({ name: "bladder.mp4", clip: { taken: 0 } }, "ru");
  assert.equal(closed?.status, "not_assessed");
  assert.match(closed?.reason ?? "", /не снялись/);
  const weak = readClip({ name: "bladder.mp4", clip: { taken: 3 } satisfies ClipNote, plane: flat }, "en");
  assert.equal(weak?.status, "not_assessed");
  assert.match(weak?.reason ?? "", /sharp enough/);
  const open = readClip({ name: "sweep.mov", clip: { taken: 3 }, plane: sharp }, "ru");
  assert.equal(clipGate(sharp).readable, true);
  assert.equal(open?.status, "read");
  assert.match(open?.reason ?? "", /не выдумывается/);
  assert.equal(readClip({ name: "bladder.mp4" }, "en"), null);
  assert.equal(JSON.stringify(open).includes("IVANOV"), false);
});

test("a printed measurement is copied and a name is left out", () => {
  const lines = printedLines([
    { text: "IVANOV", y: 4, height: 10 },
    { text: "4.2", y: 40, height: 12 },
    { text: "cm", y: 40, height: 12 },
    { text: "liver", y: 80, height: 12 },
  ]);
  assert.deepEqual(lines, ["4.2 cm"]);
  assert.equal(lines.join(" ").includes("IVANOV"), false);
  const spoken = clipLine("The liver measures 4.2 cm on the right.", "bladder.mp4");
  assert.equal(spoken.includes("4.2"), false);
  assert.equal(spoken.toLowerCase().includes("liver"), false);
  assert.match(spoken, /bladder|measures/i);
});
