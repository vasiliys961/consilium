import assert from "node:assert/strict";
import test from "node:test";
import { applyClinvar, clinvarTerm, readClinvar } from "./clinvar.ts";
import { inspectGenomics } from "./inspect.ts";

const vcf = ["##doctor-opus-acmg=PM2", "##doctor-opus-gene=CYP2C19", ["10", "94775367", "rs12769205", "A", "G"].join("\t")].join("\n");

test("a ClinVar line does not change the ACMG class", async () => {
  assert.equal(clinvarTerm(vcf, "CYP2C19"), "rs12769205");
  const found = readClinvar({
    ids: ["9"],
    summary: { result: { "9": { germline_classification: { description: "Benign", review_status: "reviewed by expert panel" } } } },
  }, "ru", "Неопределённое значение");
  assert.equal(found.stars, 3);
  assert.match(found.line, /доброкачественный/);
  assert.match(found.line, /Неопределённое значение/);
  const finding = inspectGenomics({ name: "panel.vcf", text: vcf }, "ru");
  assert.ok(finding?.acmg);
  const absent = await applyClinvar(finding, vcf, "ru", async (url) => {
    if (String(url).includes("esearch")) return Response.json({ esearchresult: { idlist: [] } });
    return Response.json({});
  });
  assert.equal(absent.acmg?.ruleId, finding.acmg.ruleId);
  assert.equal(absent.acmg?.criteria.join(","), finding.acmg.criteria.join(","));
  assert.match(absent.clinvar?.line ?? "", /записи нет/);
  const down = await applyClinvar(finding, vcf, "ru", async () => {
    throw new Error("down");
  });
  assert.equal(down.acmg?.ruleId, "VUS-unmet");
  assert.match(down.clinvar?.line ?? "", /не ответил/);
});
