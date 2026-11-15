import assert from "node:assert/strict";
import test from "node:test";
import { judgeSkin, modelFrameNames, scorePlane, type PlaneSample } from "./quality.ts";

function plane(width: number, height: number, fill: (x: number, y: number) => number, saturation: number): PlaneSample {
  const sampleWidth = 16;
  const sampleHeight = 16;
  const gray: number[] = [];
  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) gray.push(fill(x, y));
  }
  return { width, height, sampleWidth, sampleHeight, gray, saturation };
}

test("a sharp coloured lesion is viewable and still has an empty pattern checklist", () => {
  const finding = judgeSkin({
    name: "mole-derm.png",
    plane: plane(800, 800, (x, y) => ((x + y) % 2 === 0 ? 0.25 : 0.75), 0.3),
  });
  assert.equal(finding?.status, "read");
  assert.equal(finding?.window, "dermoscopy");
  assert.ok((finding?.quality ?? 0) >= 0.75);
  assert.equal(finding?.magnification, null);
  assert.equal(finding?.scale, "absent");
  assert.deepEqual(finding?.checklist, ["pattern", "colors", "network", "vessels"]);
  assert.equal(JSON.stringify(finding).toLowerCase().includes("melanoma"), false);
  assert.equal(/\d+(\.\d+)?\s*mm/.test(JSON.stringify(finding)), false);
});

test("a flat or tiny or grey frame is not read", () => {
  const flat = judgeSkin({
    name: "mole-derm.png",
    plane: plane(800, 800, () => 0.5, 0.3),
  });
  const tiny = judgeSkin({
    name: "mole-derm.png",
    plane: plane(200, 200, (x, y) => ((x + y) % 2 === 0 ? 0.25 : 0.75), 0.3),
  });
  const grey = judgeSkin({
    name: "mole-derm.png",
    plane: plane(800, 800, (x, y) => ((x + y) % 2 === 0 ? 0.25 : 0.75), 0.01),
  });
  assert.equal(flat?.status, "not_assessed");
  assert.equal(tiny?.status, "not_assessed");
  assert.match(tiny?.reason ?? "", /640/);
  assert.match(grey?.reason ?? "", /colors/i);
  assert.ok(scorePlane(plane(800, 800, (x, y) => ((x + y) % 2 === 0 ? 0.25 : 0.75), 0.3)).sharpness > scorePlane(plane(800, 800, () => 0.5, 0.3)).sharpness);
});

test("histology keeps a higher bar and does not invent a stain or a magnification", () => {
  const photo = judgeSkin({
    name: "section-slide.png",
    plane: plane(800, 800, (x, y) => ((x + y) % 2 === 0 ? 0.25 : 0.75), 0.4),
  });
  const section = judgeSkin({
    name: "section-slide.png",
    text: "Stain H&E",
    plane: plane(1400, 1200, (x, y) => ((x + y) % 2 === 0 ? 0.25 : 0.75), 0.4),
  });
  const washed = judgeSkin({
    name: "section-slide.png",
    plane: plane(1400, 1200, (x, y) => ((x + y) % 2 === 0 ? 0.25 : 0.75), 0.02),
  });
  assert.equal(photo?.status, "not_assessed");
  assert.match(photo?.reason ?? "", /1024/);
  assert.equal(section?.status, "read");
  assert.equal(section?.stain, "H&E");
  assert.equal(section?.magnification, null);
  assert.equal(section?.checklist.includes("stain"), false);
  assert.equal(washed?.status, "not_assessed");
  assert.equal(JSON.stringify(section).includes("G2"), false);
});

test("a skin frame that failed the gate is not sent to the model", () => {
  assert.deepEqual(
    modelFrameNames(
      [
        { source: "mole-derm.png", modality: "dermatology", status: "not_assessed" },
        { source: "section-slide.png", modality: "histology", status: "read" },
        { source: "chest.jpg", modality: "radiology", status: "not_assessed" },
      ],
      ["mole-derm.png", "section-slide.png", "chest.jpg"],
    ),
    ["section-slide.png", "chest.jpg"],
  );
});
