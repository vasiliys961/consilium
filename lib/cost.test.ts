import assert from "node:assert/strict";
import test from "node:test";
import { CONSILIUM_ROLES } from "./consilium.ts";
import { creditsFor, MODELS, planCost, priceUsd } from "./cost.ts";
import { conduct } from "./conductor.ts";

test("sol, opus, gemini and sonnet use the maternal prices", () => {
  assert.equal(priceUsd(MODELS.sol, 1_000_000, 500_000), 7);
  assert.equal(priceUsd(MODELS.opus, 1_000_000, 1_000_000), 24);
  assert.equal(priceUsd(MODELS.hydrogen, 1_000_000, 1_000_000), 9);
  assert.equal(priceUsd(MODELS.flash, 1_000_000, 1_000_000), 4.5);
  assert.equal(priceUsd(MODELS.sonnet, 1_000_000, 1_000_000), 18);
  assert.equal(priceUsd("other/model", 1_000_000, 1_000_000), 6);
  assert.equal(priceUsd(MODELS.sol, -10, Number.NaN), 0);
  assert.equal(creditsFor(7), 700);
  assert.equal(creditsFor(0.03), 3);
  assert.equal(creditsFor(0), 0);
  assert.equal(creditsFor(Number.NaN), 0);
});

test("a light document plans intake and an Opus draft at zero dollars", () => {
  const steps = planCost("light", ["document"]);
  assert.deepEqual(
    steps.map((step) => step.id),
    ["intake", "draft"],
  );
  assert.equal(steps[1]?.model, MODELS.opus);
  assert.equal(steps[1]?.status, "planned");
  assert.equal(steps.every((step) => step.usd === 0 && step.durationMs === 0), true);
});

test("pixels add a gemini frame and a complex case adds opus", () => {
  const light = planCost("light", ["radiology"]);
  const complex = planCost("complex", ["ecg"]);
  assert.deepEqual(
    light.map((step) => step.model),
    [null, MODELS.pro, MODELS.opus],
  );
  assert.deepEqual(
    complex.map((step) => step.id),
    ["intake", "draft", "hypothesis", "testChooser", "challenger", "stewardship", "checklist"],
  );
  assert.equal(complex.find((step) => step.id === "challenger")?.model, MODELS.opus);
  assert.equal(complex.find((step) => step.id === "testChooser")?.model, MODELS.sol);
});

test("consilium roles use more than one model and keep a critic", () => {
  const planned = planCost("complex", []).filter((step) => step.id !== "intake" && step.id !== "draft");
  assert.equal(new Set(CONSILIUM_ROLES.map((role) => role.model)).size > 1, true);
  assert.equal(CONSILIUM_ROLES.find((role) => role.critic)?.id, "challenger");
  assert.deepEqual(
    planned.map((step) => step.model),
    CONSILIUM_ROLES.map((role) => role.model),
  );
});

test("opening a case writes the planned tape and still does not call a model", () => {
  const image = conduct({ files: [{ name: "chest.jpg" }] });
  const dose = conduct({ text: "dose of amiodarone", files: [{ name: "strip.csv" }] });

  assert.deepEqual(
    image.cost.steps.map((step) => step.id),
    ["intake", "frame", "draft"],
  );
  assert.deepEqual(
    dose.cost.steps.map((step) => step.id),
    ["intake", "draft", "hypothesis", "testChooser", "challenger", "stewardship", "checklist"],
  );
  assert.equal(image.cost.totalUsd, 0);
  assert.equal(dose.gateway.called, false);
});
