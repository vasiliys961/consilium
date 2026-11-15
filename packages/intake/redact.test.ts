import assert from "node:assert/strict";
import test from "node:test";
import { redactDocument, redactText } from "./redact.ts";

test("a name and a phone are removed and the dose stays", () => {
  const cleaned = redactText(
    "Пациент: Иванов Иван Иванович, тел. +7 916 123-45-67, метопролол 50 мг. ivan@example.com",
  );
  assert.equal(cleaned.text.includes("Иванов"), false);
  assert.equal(cleaned.text.includes("916"), false);
  assert.equal(cleaned.text.includes("ivan@example.com"), false);
  assert.match(cleaned.text, /метопролол 50 мг/);
  assert.ok(cleaned.removed >= 3);
});

test("lowercase inflected Russian names are masked without removing age or dose", () => {
  assert.deepEqual(redactText("Лечение СКВ. у сидорова александр сергеевича 30 лет. Метопролол 50 мг"), {
    text: "Лечение СКВ. у [name] 30 лет. Метопролол 50 мг",
    removed: 1,
  });
  assert.deepEqual(redactText("ФИО: смирновой анны петровны 42 года"), {
    text: "ФИО: [name] 42 года",
    removed: 1,
  });
});

test("initials, a calendar date and a policy number go, and the dose stays", () => {
  const cleaned = redactText("Иванов И.И., 05.11.1980, полис 1234567890123456, метопролол 50 мг. возраст 94 года.");
  assert.equal(cleaned.text.includes("Иванов"), false);
  assert.equal(cleaned.text.includes("05.11"), false);
  assert.match(cleaned.text, /\[date\] 1980/);
  assert.equal(cleaned.text.includes("1234567890123456"), false);
  assert.match(cleaned.text, /метопролол 50 мг/);
  assert.match(cleaned.text, /\[age\] 90\+/);
});

test("an age under ninety and a clinical sentence stay whole", () => {
  const cleaned = redactText("Одышка. Метопролол 50 мг два раза в день.");
  assert.equal(cleaned.removed, 0);
  assert.equal(cleaned.text, "Одышка. Метопролол 50 мг два раза в день.");
  assert.equal(redactText("возраст 54 года").text, "возраст 54 года");
});

test("a tracing keeps its samples", () => {
  const csv = "I,II\n0.2,0.9\n";
  const cleaned = redactDocument("strip.csv", csv);
  assert.equal(cleaned.text, csv);
  assert.equal(cleaned.removed, 0);
});

test('VCF privacy preparation preserves the canonical genome build and removes the original reference path',()=>{
 const source='##fileformat=VCFv4.2\n##reference=file:///Users/PatientName/private/hg38.fa\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tPatientName\n17\t43106487\trs28897672\tA\tC\t80\tPASS\tGENE=BRCA1\tGT\t0/1';
 const copy=redactDocument('test.vcf',source).text!;assert.match(copy,/##reference=GRCh38/);assert.equal(copy.includes('PatientName'),false);assert.equal(copy.includes('/Users/'),false);assert.match(copy,/43106487\trs28897672\tA\tC/);
 assert.match(redactDocument('test.vcf',source.replace('hg38.fa','hg19.fa')).text!,/##reference=GRCh37/);
});
