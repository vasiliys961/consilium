import assert from "node:assert/strict";
import test from "node:test";
import { assignDiplotype, combineAcmg } from "./acmg.ts";
import { inspectGenomics } from "./inspect.ts";

test("one PM2 stays uncertain and does not become likely pathogenic", () => {
  const call = combineAcmg(["PM2"]);
  assert.equal(call.classification, "uncertain_significance");
  assert.equal(call.ruleId, "VUS-unmet");
  assert.equal(call.criteria[0], "PM2");
  assert.equal(JSON.stringify(call).includes("likely_pathogenic"), false);
});

test("the combining table assigns a class only when the rule is met", () => {
  assert.equal(combineAcmg(["PVS1", "PS1"]).ruleId, "P1a");
  assert.equal(combineAcmg(["PVS1", "PS1"]).classification, "pathogenic");
  assert.equal(combineAcmg(["PVS1", "PM1"]).ruleId, "LP1");
  assert.equal(combineAcmg(["BA1", "PVS1", "PS1"]).ruleId, "VUS-conflict");
  assert.equal(combineAcmg(["BA1"]).classification, "benign");
  assert.throws(() => combineAcmg(["PM2", "NOT_A_CODE"]));
  assert.throws(() => combineAcmg(["PM2", "PM2"]));
});

test("a diplotype is kept only from a callable passport", () => {
  assert.equal(assignDiplotype({ gene: "CYP2C19", callable: false, proposed: "*1/*1" }).diplotype, null);
  assert.equal(assignDiplotype({ gene: "CYP2C19", callable: true, proposed: "" }).diplotype, null);
  assert.equal(assignDiplotype({ gene: "CYP2C19", callable: true, proposed: "*2/*38" }).diplotype, "*2/*38");
});

test("a VCF without criteria shows no class and does not invent a star allele", () => {
  const empty = inspectGenomics({
    name: "panel.vcf",
    text: "##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\n",
  });
  const supplied = inspectGenomics({
    name: "panel.vcf",
    text: "##doctor-opus-acmg=PM2\n##doctor-opus-gene=CYP2C19\n##doctor-opus-diplotype=*1/*1\n",
  });
  const called = inspectGenomics({
    name: "panel.vcf",
    text: "##doctor-opus-acmg=PVS1,PS1\n##doctor-opus-gene=CYP2C19\n##doctor-opus-callable=yes\n##doctor-opus-diplotype=*2/*38\n",
  }, "ru");
  assert.equal(empty?.acmg, null);
  assert.equal(empty?.diplotype, null);
  assert.equal(supplied?.acmg?.classification, "uncertain_significance");
  assert.equal(supplied?.diplotype, null);
  assert.equal(called?.acmg?.label, "Патогенный");
  assert.equal(called?.diplotype, "*2/*38");
  assert.equal(JSON.stringify(supplied).includes("likely_pathogenic"), false);
});
