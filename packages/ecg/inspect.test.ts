import assert from "node:assert/strict";
import test from "node:test";
import { assessTracing } from "./founder.ts";
import { ecgImageStaysLocal, inspectEcg, isEcgSheet, leadPath, receiveFromPhone, sheetCaution, traceCsv, traceScale, traceXml } from "./inspect.ts";
import { huffmanCodes, traceBinary } from "./open.ts";

const csv = [
  "sampling_rate,500",
  "I,II,V1,V2,V3,V4,V5,V6",
  "0.1,0.2,0,0,0,0,0,0",
  "0.1,0.4,0,0,0,0,0,0",
].join("\n");

test("a twelve-lead CSV is read and the raw samples stay out of the result", () => {
  const finding = inspectEcg({ name: "strip.csv", text: csv }, "en");
  assert.equal(finding?.status, "read");
  assert.equal(finding?.samples, 2);
  assert.equal(finding?.samplingRate, 500);
  assert.equal(finding?.leads.includes("aVR"), true);
  assert.equal(JSON.stringify(finding).includes("0.4"), false);
  const trace = traceCsv(csv);
  assert.equal(trace?.samplingRate, 500);
  assert.equal(trace?.leads.aVR[1], -0.25);
  assert.equal(JSON.stringify(finding).includes("-0.25"), false);
  const scale = traceScale(trace?.leads ?? {});
  const path = leadPath(trace?.leads.II ?? [], 100, 40, scale.min, scale.max);
  assert.equal(path.length, 2);
  assert.equal((path[1]?.[1] ?? 0) < (path[0]?.[1] ?? 0), true);
  assert.equal(traceCsv("glucose,5.6\n1,2"), null);
});

test("an ECG sheet stays a picture and does not become samples", () => {
  const sheet = inspectEcg({ name: "ecg-sheet.png" }, "ru");
  assert.equal(sheet?.status, "not_assessed");
  assert.equal(sheet?.samples, null);
  assert.equal(sheet?.samplingRate, null);
  assert.equal(sheet?.leads.length, 0);
  assert.match(sheet?.reason ?? "", /Отсчёты не прочитаны/);
  assert.match(sheet?.reason ?? "", /Класс не утверждается/);
  assert.match(inspectEcg({ name: "ЭКГ.pdf" }, "en")?.reason ?? "", /No class is asserted/);
  assert.equal(inspectEcg({ name: "folder/ekg-photo.jpeg" })?.status, "not_assessed");
  assert.equal(isEcgSheet("lead-ecg.heic"), true);
  assert.equal(inspectEcg({ name: "chest.png" }), null);
  assert.equal(inspectEcg({ name: "myecg.png" }), null);
  assert.equal(inspectEcg({ name: "note.pdf" }), null);
  assert.equal(inspectEcg({ name: "bedside.ecg" })?.status, "refused");
  assert.equal(ecgImageStaysLocal({ modality: "ecg", status: "not_assessed" }), false);
  assert.equal(ecgImageStaysLocal({ modality: "ecg", status: "read" }), false);
  assert.equal(ecgImageStaysLocal({ modality: "radiology", status: "not_assessed" }), false);
  assert.match(sheetCaution([{ source: "ecg-sheet.png", modality: "ecg" }], "en") ?? "", /visual evidence/);
  assert.equal(sheetCaution([{ source: "chest.png", modality: "radiology" }], "en"), null);
});

test("closed ECG layouts are refused and a phone file does not start analysis", () => {
  assert.equal(inspectEcg({ name: "device.zqecg" }, "ru")?.status, "refused");
  assert.match(inspectEcg({ name: "bedside.ecg" })?.reason ?? "", /Contec/);
  assert.match(inspectEcg({ name: "record.hea" })?.reason ?? "", /WFDB/);
  assert.equal(inspectEcg({ name: "export.xml", text: "<RestingECG>MUSE</RestingECG>" })?.status, "refused");
  assert.deepEqual(receiveFromPhone("strip.csv"), { name: "strip.csv", started: false });
  assert.equal(inspectEcg({ name: "night.edf" })?.status, "not_assessed");
});

test("EDF, MATLAB 5, and uncompressed SCP open without putting samples in the result", () => {
  const leads = ["I", "II", "V1", "V2", "V3", "V4", "V5", "V6"];
  const edf = base64Of(edfBytes(Object.fromEntries(leads.map((lead) => [lead, [7, 9]]))));
  const opened = inspectEcg({ name: "night.edf", binary: edf }, "ru");
  assert.equal(opened?.status, "read");
  assert.equal(opened?.samplingRate, 500);
  assert.equal(opened?.samples, 2);
  assert.equal(JSON.stringify(opened).includes("9"), false);
  assert.ok(Math.abs((traceBinary("night.edf", edf)?.leads.aVR[1] ?? 0) + 9) < 1e-9);

  const mat = base64Of(matBytes());
  const matlab = inspectEcg({ name: "beat.mat", binary: mat });
  assert.equal(matlab?.status, "read");
  assert.equal(matlab?.samplingRate, 250);
  assert.equal(JSON.stringify(matlab).includes("3.25"), false);
  assert.equal(traceBinary("beat.mat", mat)?.leads.I[1], 3.25);
  assert.equal(inspectEcg({ name: "beat.mat", binary: base64Of(new Uint8Array([0x89, 0x48, 0x44, 0x46])) })?.status, "refused");

  const scp = base64Of(scpBytes([2000, 4000]));
  const rhythm = inspectEcg({ name: "rest.scp", binary: scp }, "ru");
  assert.equal(rhythm?.status, "read");
  assert.equal(rhythm?.samplingRate, 500);
  assert.equal(JSON.stringify(rhythm).includes("4000"), false);
  assert.equal(traceBinary("rest.scp", scp)?.leads.I[1], 4);
  const packed = inspectEcg({ name: "packed.scp", binary: base64Of(scpBytes([2000, 4000], true)) }, "ru");
  assert.equal(packed?.status, "refused");
  assert.match(packed?.reason ?? "", /Хаффмана/);
  assert.deepEqual(huffmanCodes(new Uint8Array([0x4b])), [0, 1, -1]);
});

test("an aECG with open digits is read and a compressed Philips file stays closed", () => {
  const leads = ["I", "II", "V1", "V2", "V3", "V4", "V5", "V6"];
  const rhythm = "1000 3000 5000";
  const sequences = [
    `<sequence><code code="MDC_ECG_LEAD_I"/><digits>100 100</digits><scale value="1" unit="uV"/></sequence>`,
    ...leads.map(
      (lead) => `<sequence><code code="MDC_ECG_LEAD_${lead}"/><digits>${rhythm}</digits><scale value="1" unit="uV"/></sequence>`,
    ),
  ].join("");
  const xml = `<ecg><increment value="0.002" unit="s"/>${sequences}</ecg>`;
  const finding = inspectEcg({ name: "device.xml", text: xml }, "ru");
  assert.equal(finding?.status, "read");
  assert.equal(finding?.samplingRate, 500);
  assert.equal(finding?.samples, 3);
  assert.equal(JSON.stringify(finding).includes("5000"), false);
  assert.equal(traceXml(xml)?.leads.I[2], 5);
  assert.ok(Math.abs((traceXml(xml)?.leads.aVR[0] ?? 0) + 1) < 1e-9);
  assert.equal(inspectEcg({ name: "note.xml", text: "<report><text>Синусовый ритм.</text></report>" }), null);
  const philips = inspectEcg({ name: "page.xml", text: "<restingecg><parsedwaveforms compression=\"xli\">AAAA</parsedwaveforms></restingecg>" }, "ru");
  assert.equal(philips?.status, "refused");
  assert.match(philips?.reason ?? "", /сжат/);
  assert.equal(traceXml("<ecg><!DOCTYPE ecg [<!ENTITY xxe SYSTEM \"file:///secret\">]></ecg>"), null);
});

test("a 16-bit DICOM waveform is read and a radiograph stays a radiograph", async () => {
  const wave = base64Of(waveBytes());
  const finding = inspectEcg({ name: "rhythm.dcm", binary: wave }, "ru");
  assert.equal(finding?.status, "read");
  assert.equal(finding?.samplingRate, 500);
  assert.equal(finding?.samples, 2);
  assert.equal(JSON.stringify(finding).includes("4000"), false);
  assert.equal(JSON.stringify(finding).includes("IVANOV"), false);
  const trace = traceBinary("rhythm.dcm", wave);
  assert.equal(trace?.leads.I[1], 4);
  assert.ok(Math.abs((trace?.leads.aVR[1] ?? 0) + 4) < 1e-9);
  assert.equal(JSON.stringify(trace).includes("IVANOV"), false);
  assert.equal(inspectEcg({ name: "chest.dcm", binary: base64Of(imageBytes()) }), null);
  assert.equal(inspectEcg({ name: "rhythm.dcm" }), null);
  const coarse = inspectEcg({ name: "rhythm.dcm", binary: base64Of(waveBytes(8)) }, "ru");
  assert.equal(coarse?.status, "refused");
  assert.match(coarse?.reason ?? "", /16/);
  let called = false;
  const assessment = await assessTracing({ name: "rhythm.dcm", binary: wave }, "ru", {
    run: async () => {
      called = true;
      return null;
    },
  });
  assert.equal(called, false);
  assert.match(assessment?.reason ?? "", /10 секунд/);
});

function base64Of(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function ascii(text: string, width: number) {
  const raw = new Uint8Array(width);
  for (let index = 0; index < width; index += 1) raw[index] = index < text.length ? text.charCodeAt(index) : 32;
  return raw;
}

function edfBytes(values: Record<string, number[]>) {
  const labels = Object.keys(values);
  const count = values[labels[0] ?? ""]?.length ?? 0;
  const headerBytes = 256 + labels.length * 256;
  const head = new Uint8Array(256);
  const put = (at: number, text: string, width: number) => head.set(ascii(text, width), at);
  put(0, "0", 8);
  put(184, String(headerBytes), 8);
  put(236, "1", 8);
  put(244, (count / 500).toFixed(3), 8);
  put(252, String(labels.length), 4);
  const signal = new Uint8Array(labels.length * 256);
  let cursor = 0;
  const writeRow = (width: number, textFor: (label: string, index: number) => string) => {
    labels.forEach((label, index) => {
      signal.set(ascii(textFor(label, index), width), cursor);
      cursor += width;
    });
  };
  writeRow(16, (label) => label);
  writeRow(80, () => "");
  writeRow(8, () => "mV");
  writeRow(8, () => "-100");
  writeRow(8, () => "100");
  writeRow(8, () => "-100");
  writeRow(8, () => "100");
  writeRow(80, () => "");
  writeRow(8, () => String(count));
  writeRow(32, () => "");
  const data = new Uint8Array(labels.length * count * 2);
  const view = new DataView(data.buffer);
  let sampleAt = 0;
  for (const label of labels) {
    for (const sample of values[label] ?? []) {
      view.setInt16(sampleAt, sample, true);
      sampleAt += 2;
    }
  }
  return joinBytes([head, signal, data]);
}

function joinBytes(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

function tag(type: number, data: Uint8Array) {
  const pad = (8 - (data.length % 8)) % 8;
  const out = new Uint8Array(8 + data.length + pad);
  const view = new DataView(out.buffer);
  view.setUint32(0, type, true);
  view.setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

function matBytes() {
  const header = new Uint8Array(128);
  header[124] = 0;
  header[125] = 1;
  header[126] = 0x49;
  header[127] = 0x4d;
  const values = new Float64Array(24);
  values[0] = 1.5;
  values[12] = 3.25;
  const body = new Uint8Array(values.buffer);
  const flags = new Uint8Array(8);
  new DataView(flags.buffer).setUint32(4, 6, true);
  const dims = new Uint8Array(8);
  const dimView = new DataView(dims.buffer);
  dimView.setInt32(0, 12, true);
  dimView.setInt32(4, 2, true);
  const matrix = tag(14, joinBytes([
    tag(6, flags),
    tag(5, dims),
    tag(1, new Uint8Array([118, 97, 108])),
    tag(9, body.slice()),
  ]));
  const rate = new Uint8Array(8);
  new DataView(rate.buffer).setFloat64(0, 250, true);
  const scalar = tag(14, joinBytes([
    tag(6, flags.slice()),
    tag(5, (() => { const one = new Uint8Array(8); new DataView(one.buffer).setInt32(0, 1, true); new DataView(one.buffer).setInt32(4, 1, true); return one; })()),
    tag(1, new Uint8Array([102, 115])),
    tag(9, rate),
  ]));
  return joinBytes([header, matrix, scalar]);
}

function waveBytes(bits = 16) {
  const leads = ["I", "II", "V1", "V2", "V3", "V4", "V5", "V6"];
  const samples = [2000, 4000];
  const data = Buffer.alloc(leads.length * samples.length * 2);
  samples.forEach((sample, sampleIndex) => {
    leads.forEach((_, leadIndex) => {
      const value = leadIndex < 2 ? sample : 0;
      data.writeInt16LE(value, (sampleIndex * leads.length + leadIndex) * 2);
    });
  });
  const channels = leads.map((lead) => item(Buffer.concat([
    element(0x003a, 0x0203, "SH", Buffer.from(lead.padEnd(2, " "))),
    element(0x003a, 0x0210, "DS", Buffer.from("1 ")),
    sequence(0x003a, 0x0211, [item(element(0x0008, 0x0100, "SH", Buffer.from("uV")))]),
  ])));
  const body = Buffer.concat([
    element(0x003a, 0x0005, "US", uint16(leads.length)),
    element(0x003a, 0x0010, "UL", uint32(samples.length)),
    element(0x003a, 0x001a, "DS", Buffer.from("500 ")),
    sequence(0x003a, 0x0200, channels),
    element(0x5400, 0x1004, "US", uint16(bits)),
    element(0x5400, 0x1010, "OW", data),
  ]);
  return fileBytes(Buffer.concat([
    element(0x0002, 0x0010, "UI", Buffer.from("1.2.840.10008.1.2.1\0")),
    element(0x0010, 0x0010, "PN", Buffer.from("IVANOV ")),
    sequence(0x5400, 0x0100, [item(body)]),
  ]));
}

function imageBytes() {
  return fileBytes(Buffer.concat([
    element(0x0002, 0x0010, "UI", Buffer.from("1.2.840.10008.1.2.1\0")),
    element(0x0010, 0x0010, "PN", Buffer.from("IVANOV ")),
    element(0x7fe0, 0x0010, "OW", Buffer.alloc(8)),
  ]));
}

function fileBytes(payload: Buffer) {
  return Uint8Array.from(Buffer.concat([Buffer.alloc(128), Buffer.from("DICM"), payload]));
}

function element(group: number, tag: number, vr: string, payload: Buffer) {
  const even = payload.length + (payload.length % 2);
  const long = ["OB", "OW", "SQ", "UN"].includes(vr);
  const head = Buffer.alloc(long ? 12 : 8);
  head.writeUInt16LE(group, 0);
  head.writeUInt16LE(tag, 2);
  head.write(vr, 4, "ascii");
  if (long) head.writeUInt32LE(even, 8);
  else head.writeUInt16LE(even, 6);
  return Buffer.concat([head, payload, Buffer.alloc(even - payload.length)]);
}

function item(payload: Buffer) {
  const head = Buffer.alloc(8);
  head.writeUInt16LE(0xfffe, 0);
  head.writeUInt16LE(0xe000, 2);
  head.writeUInt32LE(payload.length, 4);
  return Buffer.concat([head, payload]);
}

function sequence(group: number, tag: number, items: Buffer[]) {
  return element(group, tag, "SQ", Buffer.concat(items));
}

function uint16(value: number) {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
}

function uint32(value: number) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

function scpBytes(column: number[], huffman = false) {
  const leadIds = [1, 2, 3, 4, 5, 6, 7, 8];
  const leadBody = new Uint8Array(2 + leadIds.length * 9);
  const leadView = new DataView(leadBody.buffer);
  leadView.setUint8(0, leadIds.length);
  leadIds.forEach((lead, index) => {
    const at = 2 + index * 9;
    leadView.setUint32(at, 1, true);
    leadView.setUint32(at + 4, column.length, true);
    leadView.setUint8(at + 8, lead);
  });
  const rhythm = new Uint8Array(6 + leadIds.length * 2 + leadIds.length * column.length * 2);
  const rhythmView = new DataView(rhythm.buffer);
  rhythmView.setUint16(0, 1000, true);
  rhythmView.setUint16(2, 2000, true);
  leadIds.forEach((_, index) => rhythmView.setUint16(6 + index * 2, column.length * 2, true));
  let at = 6 + leadIds.length * 2;
  for (let index = 0; index < leadIds.length; index += 1) {
    for (const sample of column) {
      rhythmView.setInt16(at, sample, true);
      at += 2;
    }
  }
  const section = (id: number, body: Uint8Array) => {
    const out = new Uint8Array(16 + body.length);
    const view = new DataView(out.buffer);
    view.setUint16(2, id, true);
    view.setUint32(4, out.length, true);
    view.setUint8(8, 20);
    view.setUint8(9, 20);
    out.set(body, 16);
    return out;
  };
  const section3 = section(3, leadBody);
  const section6 = section(6, rhythm);
  const section0Length = 16 + 12 * 10;
  const section3At = 6 + section0Length;
  const section6At = section3At + section3.length;
  const pointers = new Uint8Array(12 * 10);
  const pointerView = new DataView(pointers.buffer);
  const locations = new Map<number, [number, number]>([
    [0, [section0Length, 6 + 1]],
    [3, [section3.length, section3At + 1]],
    [6, [section6.length, section6At + 1]],
  ]);
  if (huffman) locations.set(2, [16, section6At + section6.length + 1]);
  for (let id = 0; id < 12; id += 1) {
    const [length, index] = locations.get(id) ?? [0, 0];
    pointerView.setUint16(id * 10, id, true);
    pointerView.setUint32(id * 10 + 2, length, true);
    pointerView.setUint32(id * 10 + 6, index, true);
  }
  const body = joinBytes([section(0, pointers), section3, section6]);
  const file = new Uint8Array(6 + body.length);
  new DataView(file.buffer).setUint32(2, file.length, true);
  file.set(body, 6);
  return file;
}

test("numbered ECG photos select the visual ECG path without fabricating waveform samples", () => {
 for (const name of ["ecg2.png", "ekg12.jpg", "ЭКГ2.png", "ecg-001.png"]) {
  assert.equal(isEcgSheet(name),true);assert.equal(inspectEcg({name})?.samples,null);
 }
});
