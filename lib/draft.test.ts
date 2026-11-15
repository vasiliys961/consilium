import assert from "node:assert/strict";
import test from "node:test";
import { imageDataUrl, readDraft, settleAction } from "./draft.ts";

test("a sentence without a listed source is model memory", () => {
  const allowed = new Set(["pmid:42263157"]);
  const draft = readDraft(
    JSON.stringify({
      summary: "Unsigned draft.",
      statements: [
        { text: "The guideline discusses atrial fibrillation.", source: "pmid:42263157" },
        { text: "Give 200 mg daily.", source: "pmid:999" },
      ],
    }),
    allowed,
  );
  assert.equal(draft?.statements[0]?.memory, false);
  assert.equal(draft?.statements[1]?.memory, true);
  assert.equal(draft?.statements[1]?.source, null);
  assert.equal(draft?.statements[1]?.action, "information");
  assert.equal(draft?.statements[1]?.held, true);
  assert.equal(draft?.statements[0]?.action, "information");
  assert.equal(draft?.statements[0]?.held, false);
});

test("an order stands only on a guideline key, and a condition stays a condition", () => {
  const cited = settleAction({ text: "Start apixaban.", source: "pmid:42263157", memory: false });
  assert.equal(cited.action, "now");
  assert.equal(cited.held, false);
  const fromFile = settleAction({ text: "Start heparin.", source: "file:chest.png", memory: false });
  assert.equal(fromFile.action, "information");
  assert.equal(fromFile.held, true);
  const condition = settleAction({
    text: "Если пролактинома подтверждена, начать каберголин.",
    source: "pmid:42263157",
    memory: false,
  });
  assert.equal(condition.action, "only-if");
  assert.equal(condition.held, false);
  const avoid = settleAction({ text: "Не назначать третиноин.", source: null, memory: true });
  assert.equal(avoid.action, "avoid");
  const defer = settleAction({ text: "Defer the repeat scan.", source: null, memory: true });
  assert.equal(defer.action, "defer");
});

test("only a small image data url is accepted", () => {
  assert.equal(imageDataUrl("https://example.test/a.jpg"), null);
  assert.equal(imageDataUrl("data:text/html;base64,aaaa"), null);
  assert.equal(imageDataUrl("data:image/png;base64,aaaa"), "data:image/png;base64,aaaa");
});
