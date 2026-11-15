import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import test from "node:test";
import { textFromDocx } from "./docx.ts";
import { inspectProse, proseStatements, readProse, scrubProseText } from "./prose.ts";

function u16(value: number) {
  return [value & 255, (value >> 8) & 255];
}

function u32(value: number) {
  return [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >> 24) & 255];
}

function storedZip(entries: Array<{ name: string; data: Uint8Array; method?: number; compressed?: Uint8Array }>) {
  const parts: number[][] = [];
  const directory: number[][] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = [...new TextEncoder().encode(entry.name)];
    const method = entry.method ?? 0;
    const payload = [...(entry.compressed ?? entry.data)];
    const local = [
      0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, method, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ...u32(payload.length), ...u32(entry.data.length), ...u16(name.length), 0, 0, ...name, ...payload,
    ];
    directory.push([
      0x50, 0x4b, 0x01, 0x02, 20, 0, 20, 0, 0, 0, method, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ...u32(payload.length), ...u32(entry.data.length), ...u16(name.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ...u32(offset), ...name,
    ]);
    parts.push(local);
    offset += local.length;
  }
  const central = directory.flat();
  const end = [
    0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, ...u16(entries.length), ...u16(entries.length),
    ...u32(central.length), ...u32(offset), 0, 0,
  ];
  return new Uint8Array([...parts.flat(), ...central, ...end]);
}

test("a document body is copied and a header, a deletion, and a fallback are not", async () => {
  const document = new TextEncoder().encode(
    "<w:document><w:body><w:p><w:r><w:t>Глюкоза 5,6</w:t></w:r></w:p><w:p><w:r><w:del><w:r><w:delText>Глюкоза 9,9</w:delText></w:r></w:del><w:t>Выписан домой.</w:t></w:r></w:p><w:p><w:r><mc:AlternateContent><mc:Choice><w:t>остаётся</w:t></mc:Choice><mc:Fallback><w:t>скрыто</w:t></mc:Fallback></mc:AlternateContent></w:r></w:p></w:body></w:document>",
  );
  const header = new TextEncoder().encode("<w:hdr><w:p><w:r><w:t>Иванов</w:t></w:r></w:p></w:hdr>");
  const text = await textFromDocx(storedZip([
    { name: "word/document.xml", data: document, method: 8, compressed: deflateRawSync(document) },
    { name: "word/header1.xml", data: header },
  ]));
  const prose = readProse(text ?? "", ".docx", "ru");
  assert.deepEqual(prose.paragraphs, ["Глюкоза 5,6", "Выписан домой.", "остаётся"]);
  assert.match(prose.reason ?? "", /Колонтитулы не копировались/);
  assert.equal((text ?? "").includes("9,9"), false);
  assert.equal((text ?? "").includes("Иванов"), false);
  assert.equal((text ?? "").includes("скрыто"), false);
});

test("plain text, xml text, and json stay as written", () => {
  const note = inspectProse({ name: "letter.txt", text: "Выписан домой.\nГлюкоза 5,6" }, "ru");
  assert.deepEqual(note?.paragraphs, ["Выписан домой.", "Глюкоза 5,6"]);
  const xml = inspectProse({ name: "note.xml", text: "<report id=\"9.9\"><text>Глюкоза 5,6</text></report>" }, "en");
  assert.deepEqual(xml?.paragraphs, ["Глюкоза 5,6"]);
  assert.equal(JSON.stringify(xml).includes("9.9"), false);
  const json = inspectProse({ name: "panel.json", text: "{\"glucose\":5.6}" });
  assert.equal(json?.paragraphs[0], "{\"glucose\":5.6}");
});

test("a copied sentence cannot become an order and an invented number is dropped", () => {
  const statement = proseStatements([{ source: "letter.docx", paragraphs: ["Start aspirin 100 mg."] }])[0];
  assert.equal(statement?.source, "file:letter.docx");
  assert.equal(statement?.held, true);
  assert.equal(statement?.action, "information");
  const kept = scrubProseText("Glucose is 10 and elevated. Sinus rhythm remains.", ["Glucose is 5,6 mmol/L. Discharged home."]);
  assert.equal(kept, "Sinus rhythm remains.");
  assert.equal(kept.includes("10"), false);
});

test("the seventeenth line is not copied, and closed formats stay closed", () => {
  const lines = Array.from({ length: 17 }, (_, index) => `Line ${index + 1}`);
  const prose = readProse(lines.join("\n"), ".txt", "en");
  assert.equal(prose.paragraphs.includes("Line 17"), false);
  assert.match(prose.reason ?? "", /first part/i);
  assert.equal(inspectProse({ name: "old.doc" }, "ru")?.status, "refused");
  assert.match(inspectProse({ name: "note.pdf" }, "ru")?.reason ?? "", /не найден/);
  assert.equal(inspectProse({ name: "ЭКГ.pdf", text: "Heart rate 80" }), null);
  assert.equal(inspectProse({ name: "strip.csv", text: "I,II\n0,0\n" }), null);
});
