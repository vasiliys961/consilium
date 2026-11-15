import assert from "node:assert/strict";
import test from "node:test";
import { SONO_QUALITY_THRESHOLD, isUltrasoundName, openProtocol } from "./protocol.ts";

test("a bladder loop keeps both views and does not invent a volume", () => {
  const order = openProtocol("bladder.mp4", "en");
  assert.equal(order.id, "bladder");
  assert.deepEqual(order.missing, ["Transverse", "Longitudinal"]);
  assert.equal(order.completeness, 0);
  assert.equal(order.scale, "absent");
  assert.equal(order.threshold, SONO_QUALITY_THRESHOLD);
  assert.match(order.reason, /no measurement/i);
  assert.equal(JSON.stringify(order).includes("ml"), false);
});

test("an unnamed loop uses the abdominal order and a report stays out of the scanner", () => {
  const order = openProtocol("sweep.mov", "ru");
  assert.equal(order.id, "abdomen");
  assert.equal(order.missing[0], "Печень");
  assert.equal(order.missing.includes("Селезёнка"), true);
  assert.equal(isUltrasoundName("ultrasound-report.pdf"), false);
  assert.equal(isUltrasoundName("sweep.mov"), true);
});
