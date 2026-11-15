import assert from "node:assert/strict";
import test from "node:test";
import { copyRecommendation, cpicStatement, loadSnapshot, namedDrug, panelGene, phenotypeOf, type CpicSnapshot } from "./cpic.ts";

const snapshot: CpicSnapshot = {
  phenotypes: { CYP2C19: { diplotypes: { "*1/*1": { phenotype: "Normal Metabolizer", activity_score: null } } } },
  drugs: {
    clopidogrel: [
      {
        lookup: [{ CYP2C19: "Normal Metabolizer" }],
        strength: "Strong",
        text: "If considering clopidogrel, use at standard dose (75 mg/day)",
        guideline_id: "PA166104948",
      },
      {
        lookup: [{ CYP2C19: "Poor Metabolizer" }],
        strength: "Strong",
        text: "Avoid clopidogrel.",
        guideline_id: "PA-OTHER",
      },
    ],
  },
};

test("a named drug copies the CPIC sentence for the passport phenotype", () => {
  assert.equal(namedDrug("Назначить клопидогрел 75 мг", ["clopidogrel"]), "clopidogrel");
  assert.equal(phenotypeOf(snapshot, "CYP2C19", "*1/*1")?.phenotype, "Normal Metabolizer");
  const copied = copyRecommendation(snapshot, { gene: "CYP2C19", diplotype: "*1/*1", note: "клопидогрел" });
  assert.equal(copied?.text, "If considering clopidogrel, use at standard dose (75 mg/day)");
  assert.equal(copyRecommendation(snapshot, { gene: "CYP2C19", diplotype: "*1/*1", note: "аспирин" }), null);
  const line = cpicStatement(snapshot, { gene: "CYP2C19", diplotype: "*1/*1", note: "clopidogrel" }, "ru");
  assert.equal(line?.source, "cpic:PA166104948");
  assert.equal(line?.memory, false);
  assert.equal(line?.action, "only-if");
  assert.match(line?.text ?? "", /75 mg/);
});

test("the copied panel and snapshot answer BRCA1 and clopidogrel", () => {
  assert.equal(panelGene("BRCA1")?.phenotype, "Hereditary breast and/or ovarian cancer");
  const live = loadSnapshot();
  const copied = copyRecommendation(live, { gene: "CYP2C19", diplotype: "*1/*1", note: "clopidogrel" });
  assert.equal(copied?.strength, "Strong");
  assert.match(copied?.text ?? "", /75 mg\/day/);
});
