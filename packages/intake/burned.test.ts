import assert from "node:assert/strict";
import test from "node:test";
import { parseTsv, phiBoxes } from "./burned.ts";
import { paintBoxes } from "./raster.ts";

test("a banner name is covered and the measurement in the field is kept", () => {
  const boxes = phiBoxes(
    [
      { text: "ИВАНОВ", x: 8, y: 6, width: 80, height: 16 },
      { text: "EF", x: 120, y: 180, width: 20, height: 14 },
      { text: "55%", x: 144, y: 180, width: 36, height: 14 },
      { text: "LEFT", x: 8, y: 360, width: 40, height: 14 },
    ],
    400,
    400,
  );
  assert.equal(boxes.length, 1);
  assert.ok(boxes[0] && boxes[0].y < 40);
  assert.ok(boxes[0].x < 20);
});

test("a full name inside the field is covered and a dose line is not", () => {
  const boxes = phiBoxes(
    [
      { text: "Иванов", x: 40, y: 160, width: 70, height: 16 },
      { text: "Иван", x: 116, y: 160, width: 40, height: 16 },
      { text: "Иванович", x: 162, y: 160, width: 90, height: 16 },
      { text: "50", x: 40, y: 200, width: 20, height: 14 },
      { text: "мм", x: 64, y: 200, width: 24, height: 14 },
    ],
    400,
    400,
  );
  assert.equal(boxes.length, 1);
  assert.ok(boxes[0] && boxes[0].y > 140 && boxes[0].y < 180);
});

test("black paint covers the identifier and leaves the field pixel", () => {
  const data = new Uint8Array(8 * 8 * 4).fill(200);
  const painted = paintBoxes(data, 8, 8, [{ x: 0, y: 0, width: 2, height: 2 }]);
  assert.equal(painted[0], 0);
  assert.equal(painted[(4 * 8 + 4) * 4], 200);
});

test("an OCR row becomes a word box", () => {
  const words = parseTsv(
    "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n5\t1\t1\t1\t1\t1\t10\t12\t40\t14\t88\tИВАНОВ\n5\t1\t1\t1\t1\t2\t60\t12\t20\t14\t10\txx\n",
  );
  assert.equal(words.length, 1);
  assert.equal(words[0]?.text, "ИВАНОВ");
});
