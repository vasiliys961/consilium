import assert from "node:assert/strict";
import test from "node:test";
import { conduct } from "./conductor.ts";

const secret = "secret-polza-key";

test("a single document stays on the light path and never calls a model", () => {
  const result = conduct({
    text: "Shortness of breath on exertion",
    files: [{ name: "note.pdf" }],
    locale: "en",
    env: { POLZA_API_KEY: secret, OPENROUTER_API_KEY: "secret-openrouter" },
  });

  assert.equal(result.path, "light");
  assert.equal(result.gateway.provider, "openrouter");
  assert.equal(result.gateway.called, false);
  assert.equal(result.cost.totalUsd, 0);
  assert.deepEqual(
    result.cost.steps.map((step) => step.id),
    ["intake", "draft"],
  );
  assert.equal(result.cost.steps[0]?.usd, 0);
  assert.equal(result.cost.steps[1]?.status, "planned");
  assert.equal(result.ledger[0]?.status, "not_assessed");
  assert.equal(result.ledger[0]?.modality, "document");
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.match(result.draft.summary, /no model was called/i);
});

test("two modalities make a complex case", () => {
  const result = conduct({
    files: [{ name: "strip.csv" }, { name: "chest.dcm" }],
    locale: "en",
  });

  assert.equal(result.path, "complex");
  assert.deepEqual(
    result.ledger.map((entry) => entry.modality),
    ["ecg", "radiology"],
  );
});

test("a dose question is complex even with one file", () => {
  const result = conduct({
    text: "What dose of amiodarone is suggested?",
    files: [{ name: "ecg.csv" }],
  });

  assert.equal(result.path, "complex");
});

test("the consilium request is complex", () => {
  const result = conduct({ text: "Review this note", consilium: true });
  assert.equal(result.path, "complex");
});

test("russian draft follows the screen language", () => {
  const result = conduct({
    text: "Одышка",
    files: [{ name: "note.pdf" }],
    locale: "ru",
  });

  assert.equal(result.locale, "ru");
  assert.match(result.draft.summary, /модель не вызывалась/i);
});

test("fallback gateway is OpenRouter when Polza is absent", () => {
  const result = conduct({
    text: "Cough",
    env: { OPENROUTER_API_KEY: "secret-openrouter" },
  });

  assert.equal(result.gateway.provider, "openrouter");
  assert.equal(result.gateway.called, false);
});

test("a file hash is kept and an unknown format stays on the list", () => {
  const hash = "a".repeat(64);
  const result = conduct({
    files: [
      { name: "strip.csv", sha256: hash, bytes: 1200 },
      { name: "device.zqecg", sha256: "b".repeat(64), bytes: 40 },
      { name: "studies.zip", bytes: 9000 },
    ],
  });

  assert.equal(result.ledger[0]?.sha256, hash);
  assert.equal(result.ledger[0]?.bytes, 1200);
  assert.equal(result.ledger[1]?.modality, "ecg");
  assert.equal(result.ledger[1]?.status, "refused");
  assert.equal(result.ledger[2]?.modality, "archive");
  assert.deepEqual(result.unassessed, ["strip.csv", "device.zqecg", "studies.zip"]);
  assert.equal(result.path, "light");
});

test("an ECG sheet is listed as ECG and a chest photo stays a radiograph", () => {
  const result = conduct({
    files: [{ name: "ecg-sheet.png" }, { name: "chest.png" }, { name: "note.pdf" }],
    locale: "ru",
  });
  assert.equal(result.ledger[0]?.modality, "ecg");
  assert.equal(result.ledger[0]?.status, "not_assessed");
  assert.equal(result.ledger[0]?.samples, null);
  assert.match(result.ledger[0]?.reason ?? "", /Класс не утверждается/);
  assert.equal(result.ledger[1]?.modality, "radiology");
  assert.equal(result.ledger[2]?.modality, "document");
  assert.equal(JSON.stringify(result.ledger[0]).includes("0.91"), false);
});

test("a laboratory table stays beside an ECG and the copied value is not rewritten", () => {
  const result = conduct({
    files: [
      { name: "strip.csv", text: "sampling_rate,500\nI,II\n0,0\n" },
      { name: "labs.csv", text: "analyte,value,unit\nGlucose,5.6,mmol/L\n" },
    ],
    locale: "en",
  });
  assert.equal(result.path, "complex");
  assert.equal(result.ledger[0]?.modality, "ecg");
  assert.equal(result.ledger[1]?.modality, "document");
  assert.equal(result.ledger[1]?.status, "read");
  assert.equal(result.ledger[1]?.labs?.rows[0]?.value, "5.6");
  assert.equal(JSON.stringify(result.ledger[1]).includes("9.9"), false);
});

test("a document body stays beside the laboratory table and the ECG", () => {
  const result = conduct({
    files: [
      { name: "strip.csv", text: "sampling_rate,500\nI,II\n0,0\n" },
      { name: "labs.csv", text: "analyte,value,unit\nGlucose,5.6,mmol/L\n" },
      { name: "letter.docx", text: "Выписан домой.\n\nГлюкоза 5,6 ммоль/л." },
    ],
    locale: "ru",
  });
  assert.equal(result.path, "complex");
  assert.equal(result.ledger[2]?.modality, "document");
  assert.equal(result.ledger[2]?.status, "read");
  assert.deepEqual(result.ledger[2]?.prose?.paragraphs, ["Выписан домой.", "Глюкоза 5,6 ммоль/л."]);
  assert.equal(JSON.stringify(result.ledger[2]).includes("9,9"), false);
  assert.match(conduct({ files: [{ name: "note.pdf" }] }).ledger[0]?.reason ?? "", /was not found/i);
});

test("a text PDF stays beside the laboratory and an ECG sheet does not give a rate", () => {
  const result = conduct({
    files: [
      { name: "ЭКГ.pdf", text: "Heart rate 80" },
      { name: "note.pdf", text: "Glucose 5,6 mmol/L\nDischarged home." },
      { name: "labs.csv", text: "analyte,value,unit\nGlucose,5.6,mmol/L\n" },
    ],
    locale: "en",
  });
  assert.equal(result.path, "complex");
  assert.equal(result.ledger[0]?.modality, "ecg");
  assert.equal(result.ledger[0]?.prose, null);
  assert.match(result.ledger[0]?.reason ?? "", /No class is asserted/);
  assert.equal(JSON.stringify(result.ledger[0]).includes("80"), false);
  assert.deepEqual(result.ledger[1]?.prose?.paragraphs, ["Glucose 5,6 mmol/L", "Discharged home."]);
});

test("a phone HEIC stays closed and an opened TIFF is a frame", () => {
  const result = conduct({
    files: [
      { name: "phone.heic" },
      { name: "scan.tif" },
      { name: "film.tif", image: "data:image/png;base64,aaaa" },
      { name: "lead-ecg.heic" },
    ],
    locale: "ru",
  });
  assert.equal(result.ledger[0]?.modality, "radiology");
  assert.equal(result.ledger[0]?.frameId, null);
  assert.match(result.ledger[0]?.reason ?? "", /HEIC не открывается/);
  assert.match(result.ledger[1]?.reason ?? "", /TIFF не открывается/);
  assert.equal(result.ledger[1]?.frameId, null);
  assert.equal(result.ledger[2]?.frameId, "frame-1");
  assert.equal(result.ledger[3]?.modality, "ecg");
  assert.match(result.ledger[3]?.reason ?? "", /Класс не утверждается/);
  assert.equal(JSON.stringify(result).includes("IVANOV"), false);
});

test("a DICOM zip stays one series and opens one frame", () => {
  const opened = conduct({
    locale: "ru",
    files: [{ name: "chest.zip", series: { total: 12, opened: true }, image: "data:image/png;base64,aaaa" }],
  });
  assert.equal(opened.ledger[0]?.modality, "radiology");
  assert.equal(opened.ledger[0]?.frameId, "frame-1");
  assert.match(opened.ledger[0]?.reason ?? "", /один кадр/);
  assert.match(opened.ledger[0]?.reason ?? "", /12/);
  assert.equal(JSON.stringify(opened).includes("IVANOV"), false);
  const closed = conduct({
    locale: "en",
    files: [{ name: "chest.zip", series: { total: 4, opened: false } }],
  });
  assert.equal(closed.ledger[0]?.frameId, null);
  assert.match(closed.ledger[0]?.reason ?? "", /did not open/);
  assert.equal(closed.ledger.length, 1);
});

test("an ultrasound DICOM still is not a radiograph and a cine loop stays closed", () => {
  const still = conduct({
    locale: "ru",
    files: [{ name: "bladder.dcm", loop: "still", image: "data:image/png;base64,aaaa" }],
  });
  assert.equal(still.ledger[0]?.modality, "ultrasound");
  assert.equal(still.ledger[0]?.frameId, null);
  assert.match(still.ledger[0]?.reason ?? "", /размер не считается/);
  assert.deepEqual(still.ledger[0]?.reading?.missingViews, ["Поперечный срез", "Продольный срез"]);
  assert.equal(JSON.stringify(still).includes("IVANOV"), false);
  const cine = conduct({ locale: "en", files: [{ name: "sweep.dcm", loop: "cine" }] });
  assert.equal(cine.ledger[0]?.modality, "ultrasound");
  assert.equal(cine.ledger[0]?.frameId, null);
  assert.match(cine.ledger[0]?.reason ?? "", /not opened/);
  assert.equal(cine.ledger[0]?.reading, null);
});

test("a sharp clip frame can be read and a closed clip stays unread", () => {
  const gray: number[] = [];
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) gray.push((x + y) % 2 === 0 ? 0.15 : 0.75);
  }
  const plane = { width: 320, height: 240, sampleWidth: 16, sampleHeight: 16, gray, saturation: 0.1 };
  const open = conduct({ locale: "ru", files: [{ name: "bladder.mp4", clip: { taken: 2 }, plane }] });
  assert.equal(open.ledger[0]?.modality, "ultrasound");
  assert.equal(open.ledger[0]?.status, "read");
  assert.equal(open.ledger[0]?.frameId, null);
  assert.match(open.ledger[0]?.reason ?? "", /не выдумывается/);
  assert.equal(open.ledger[0]?.reading?.protocolId, "bladder");
  const closed = conduct({ locale: "en", files: [{ name: "sweep.avi", clip: { taken: 0 } }] });
  assert.equal(closed.ledger[0]?.status, "not_assessed");
  assert.match(closed.ledger[0]?.reason ?? "", /not taken/);
});

test("a voice recording stays on the light path beside a document", () => {
  const hash = "c".repeat(64);
  const result = conduct({
    files: [
      { name: "note.pdf", bytes: 10 },
      { name: "visit.m4a", sha256: hash, bytes: 80 },
    ],
    locale: "ru",
  });
  assert.equal(result.path, "light");
  assert.equal(result.ledger[1]?.modality, "audio");
  assert.equal(result.ledger[1]?.sha256, hash);
  assert.equal(result.ledger[1]?.samples, null);
  assert.match(result.ledger[1]?.reason ?? "", /Запись остаётся в случае/);
  assert.equal(result.gateway.called, false);
});

test("a WFDB pair stays listed and the waveform stays closed", () => {
  const result = conduct({
    files: [{ name: "record.hea" }, { name: "record.dat" }, { name: "other.hea" }],
    locale: "ru",
  });
  assert.equal(result.path, "light");
  assert.equal(result.ledger[0]?.status, "not_assessed");
  assert.equal(result.ledger[1]?.status, "not_assessed");
  assert.match(result.ledger[0]?.reason ?? "", /Волна/);
  assert.equal(result.ledger[0]?.samples, null);
  assert.equal(result.ledger[2]?.status, "refused");
  assert.equal(JSON.stringify(result).includes("0.9"), false);
});

test("a csv tracing is read without copying the samples into the case", () => {
  const result = conduct({
    files: [{
      name: "strip.csv",
      text: "sampling_rate,250\nI,II,V1,V2,V3,V4,V5,V6\n0.2,0.9,0,0,0,0,0,0\n",
    }],
    locale: "ru",
  });
  assert.equal(result.ledger[0]?.status, "read");
  assert.equal(result.ledger[0]?.samplingRate, 250);
  assert.equal(result.unassessed.includes("strip.csv"), false);
  assert.equal(JSON.stringify(result).includes("0.9"), false);
});

test("an aECG is a tracing and a report xml stays a document", () => {
  const leads = ["I", "II", "V1", "V2", "V3", "V4", "V5", "V6"];
  const sequences = leads
    .map((lead) => `<sequence><code code="MDC_ECG_LEAD_${lead}"/><digits>1000 3000</digits><scale value="1" unit="uV"/></sequence>`)
    .join("");
  const result = conduct({
    files: [
      { name: "device.xml", text: `<ecg><increment value="0.002" unit="s"/>${sequences}</ecg>` },
      { name: "note.xml", text: "<report>Синусовый ритм.</report>" },
    ],
    locale: "ru",
  });
  assert.deepEqual(
    result.ledger.map((entry) => entry.modality),
    ["ecg", "document"],
  );
  assert.equal(result.ledger[0]?.status, "read");
  assert.equal(result.ledger[0]?.samples, 2);
  assert.equal(JSON.stringify(result).includes("3000"), false);
});

test("a biopsy pdf stays a document and a weak derm frame is not read", () => {
  const result = conduct({
    files: [
      { name: "biopsy.pdf" },
      { name: "history.pdf" },
      { name: "mole-derm.png" },
      { name: "bladder.mp4" },
    ],
    locale: "en",
  });
  assert.deepEqual(
    result.ledger.map((entry) => entry.modality),
    ["document", "document", "dermatology", "ultrasound"],
  );
  assert.equal(result.ledger[2]?.status, "not_assessed");
  assert.equal(result.ledger[2]?.reading?.window, "dermoscopy");
  assert.equal(result.ledger[3]?.reading?.protocolId, "bladder");
  assert.deepEqual(result.ledger[3]?.reading?.missingViews, ["Transverse", "Longitudinal"]);
  assert.equal(result.path, "complex");
});

test("a genetics PDF conclusion is copied and does not receive an ACMG class", () => {
  const written = conduct({
    files: [{ name: "genetic-report.pdf", text: "CYP2C19 c.681G>A.\nWritten class: pathogenic." }],
    locale: "ru",
  });
  assert.equal(written.ledger[0]?.modality, "genetics");
  assert.equal(written.ledger[0]?.genetics?.acmg, null);
  assert.equal(written.ledger[0]?.genetics?.diplotype, null);
  assert.match(written.ledger[0]?.reason ?? "", /не присвоен/);
  assert.deepEqual(written.ledger[0]?.prose?.paragraphs, ["CYP2C19 c.681G>A.", "Written class: pathogenic."]);
  assert.equal(written.gateway.called, false);

  const discharge = conduct({
    files: [{ name: "заключение.pdf", text: "Выписан домой." }],
    locale: "ru",
  });
  assert.equal(discharge.ledger[0]?.modality, "document");
  assert.equal(discharge.ledger[0]?.genetics, null);

  const unread = conduct({ files: [{ name: "genetic-report.pdf" }] });
  assert.equal(unread.ledger[0]?.modality, "document");
});

test("a compressed VCF stays genetics and an unopened archive assigns no class", () => {
  const opened = conduct({
    files: [{
      name: "panel.vcf.gz",
      text: "##fileformat=VCFv4.2\n##doctor-opus-acmg=PM2\n##doctor-opus-gene=CYP2C19\n",
    }],
  });
  assert.equal(opened.ledger[0]?.modality, "genetics");
  assert.equal(opened.ledger[0]?.genetics?.acmg?.classification, "uncertain_significance");
  assert.equal(opened.ledger[0]?.genetics?.diplotype, null);

  const closed = conduct({ files: [{ name: "panel.vcf.gz" }], locale: "ru" });
  assert.equal(closed.ledger[0]?.modality, "genetics");
  assert.match(closed.ledger[0]?.reason ?? "", /не открылся/);
  assert.equal(closed.ledger[0]?.genetics?.acmg, null);
});

test("a VCF with only PM2 stays uncertain and does not receive a default diplotype", () => {
  const result = conduct({
    files: [{
      name: "panel.vcf",
      text: "##doctor-opus-acmg=PM2\n##doctor-opus-gene=CYP2C19\n##doctor-opus-diplotype=*1/*1\n",
    }],
  });
  assert.equal(result.ledger[0]?.modality, "genetics");
  assert.equal(result.ledger[0]?.genetics?.acmg?.classification, "uncertain_significance");
  assert.equal(result.ledger[0]?.genetics?.diplotype, null);
  assert.equal(JSON.stringify(result).includes("likely_pathogenic"), false);
  assert.equal(JSON.stringify(result).includes("*1/*1"), false);
});

test("an attachment name is echoed and nothing is retained by default", () => {
  const result = conduct({
    text: "Ready draft",
    attachment: "protocol",
    retain: false,
  });

  assert.equal(result.attachment, "protocol");
  assert.equal(result.retained, false);
});
