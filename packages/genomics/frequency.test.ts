import assert from "node:assert/strict";
import test from "node:test";
import { applyFrequency, firstVariant, interpretFrequency } from "./frequency.ts";
import { inspectGenomics } from "./inspect.ts";

const vcf = [
  "##fileformat=VCFv4.2",
  ["10", "94775367", "rs12769205", "A", "G", ".", ".", ".", "GT", "0/1"].join("\t"),
].join("\n");

test("a missed lookup adds no criterion and one PM2 stays uncertain", async () => {
  assert.equal(firstVariant(vcf)?.id, "10-94775367-A-G");
  assert.equal(interpretFrequency({ errors: [{ message: "Variant not found" }] }).criterion, "PM2");
  assert.equal(interpretFrequency({ data: { variant: null }, errors: [{ message: "timeout" }] }).criterion, null);
  assert.equal(interpretFrequency({ data: { variant: { joint: { ac: 8, an: 100 } } } }).criterion, "BA1");
  const finding = inspectGenomics({ name: "panel.vcf", text: vcf });
  assert.ok(finding);
  const missed = await applyFrequency(finding, vcf, "ru", async () => {
    throw new Error("down");
  });
  assert.equal(missed.acmg, null);
  assert.equal(missed.frequency?.criterion, null);
  const absent = await applyFrequency(finding, vcf, "ru", async () => Response.json({ errors: [{ message: "Variant not found" }] }));
  assert.equal(absent.acmg?.classification, "uncertain_significance");
  assert.equal(absent.acmg?.ruleId, "VUS-unmet");
  assert.equal(absent.acmg?.criteria.includes("PM2"), true);
  assert.equal(JSON.stringify(absent.acmg).includes("likely_pathogenic"), false);
});
