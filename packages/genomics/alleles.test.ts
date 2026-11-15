import assert from "node:assert/strict";
import test from "node:test";
import { diplotypeFromBases, matchDiplotype } from "./alleles.ts";
import { inspectGenomics } from "./inspect.ts";
import { loadSnapshot, type CpicSnapshot } from "./cpic.ts";

const pair: CpicSnapshot = {
  genes: {
    G: {
      variants: [
        { chrom: "1", pos: 10, ref: "A" },
        { chrom: "1", pos: 20, ref: "C" },
      ],
      alleles: [
        { name: "*1", bases: ["A", "C"] },
        { name: "*2", bases: ["G", "C"] },
      ],
    },
  },
};

test("one pair of bases becomes one diplotype", () => {
  assert.equal(matchDiplotype(pair.genes?.G?.alleles ?? [], [["A", "A"], ["C", "C"]]), "*1/*1");
  assert.equal(matchDiplotype(pair.genes?.G?.alleles ?? [], [["A", "G"], ["C", "C"]]), "*1/*2");
  const tied: CpicSnapshot = {
    genes: { G: { variants: [{ chrom: "1", pos: 10, ref: "A" }], alleles: [{ name: "*1", bases: ["A"] }, { name: "*8", bases: ["A"] }] } },
  };
  assert.equal(diplotypeFromBases(tied, "G", row("1", 10, "A", "A", "0/0")), null);
});

test("a missing defining site is not reference and does not invent *1/*1", () => {
  const partial = ["##doctor-opus-gene=G", "##doctor-opus-callable=yes", "##doctor-opus-diplotype=*1/*1", row("1", 10, "A", "G", "1/1")].join("\n");
  assert.equal(diplotypeFromBases(pair, "G", partial), undefined);
  const complete = ["##doctor-opus-gene=CYP2C19", "##doctor-opus-callable=yes", "##doctor-opus-diplotype=*1/*1", ...referenceRows()].join("\n");
  const called = inspectGenomics({ name: "panel.vcf", text: complete });
  assert.equal(called?.diplotype, "*38/*38");
  assert.notEqual(String(called?.diplotype), "*1/*1");
});

function row(chrom: string, pos: number, ref: string, alt: string, call: string) {
  return [chrom, pos, ".", ref, alt, ".", ".", ".", "GT", call].join("\t");
}

function referenceRows() {
  const gene = loadSnapshot()?.genes?.CYP2C19;
  return (gene?.variants ?? []).map((variant) => row(variant.chrom, variant.pos, variant.ref, variant.ref, "0/0"));
}
