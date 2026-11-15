import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import test from "node:test";
import { inspectEcg } from "../ecg/inspect.ts";
import { inspectLab, labLine, labRecord, readLabTable, scrubLabText } from "./table.ts";
import { labTextFromXlsx } from "./xlsx.ts";

const panel = [
  "показатель;результат;единица;референс",
  "Глюкоза;5,6;ммоль/л;3,9-6,1",
  "Калий;4,1;ммоль/л;",
  "Гемоглобин;;г/л;120-160",
].join("\n");

test("a laboratory table is copied as written and an empty cell stays empty", () => {
  const table = readLabTable(panel, "ru");
  assert.equal(table?.status, "read");
  assert.equal(table?.rows[0] && labLine(table.rows[0]), "Глюкоза 5,6 ммоль/л (3,9-6,1)");
  assert.equal(table?.rows[1]?.value, "4,1");
  assert.equal(table?.rows[2]?.value, "");
  assert.match(table?.reason ?? "", /Ноль не записан/);
  assert.equal(JSON.stringify(table).includes("5.6"), false);
  assert.equal(inspectEcg({ name: "labs.csv", text: panel }), null);
  assert.equal(inspectLab({ name: "labs.csv", text: panel }, "ru")?.rows.length, 3);
  assert.equal(readLabTable("I,II,V1\n1,2,3"), null);
  assert.equal(inspectLab({ name: "old.xls" }, "en")?.status, "refused");
});

test("a flag is copied and a changed number or an invented high mark is removed", () => {
  const marked = readLabTable("analyte,value,unit,flag\nCRP,8,mg/L,H", "en");
  assert.equal(marked?.rows[0] && labLine(marked.rows[0]), "CRP 8 mg/L H");
  const rows = readLabTable(panel, "en")?.rows ?? [];
  const mixed = "Глюкоза 10 is elevated. The tracing shows sinus rhythm. Глюкоза 5,6 stays with the ECG.";
  const scrubbed = scrubLabText(mixed, rows);
  assert.equal(scrubbed.includes("10"), false);
  assert.equal(scrubbed.includes("elevated"), false);
  assert.match(scrubbed, /sinus rhythm/);
  assert.match(scrubbed, /Глюкоза 5,6/);
  const record = labRecord([{ source: "labs.csv", rows }], "en");
  assert.match(record ?? "", /labs\.csv: Глюкоза 5,6/);
  assert.match(record ?? "", /rest of the case/);
});

test("a row past the copy limit is not invented into the result", () => {
  const lines = ["name,value", ...Array.from({ length: 101 }, (_, index) => `Row ${index},1`)];
  const table = readLabTable(lines.join("\n"), "en");
  assert.equal(table?.rows.length, 100);
  assert.equal(table?.rows.some((row) => row.name === "Row 100"), false);
  assert.match(table?.reason ?? "", /first 100/);
});

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

test("the first sheet of a spreadsheet is copied and a later sheet is not", async () => {
  const strings = new TextEncoder().encode(
    "<sst><si><t>analyte</t></si><si><t>value</t></si><si><t>unit</t></si><si><t>Glucose</t></si><si><t>mmol/L</t></si></sst>",
  );
  const first = new TextEncoder().encode(
    `<worksheet><sheetData><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="A2" t="s"><v>3</v></c><c r="B2"><v>5.6</v></c><c r="C2" t="s"><v>4</v></c></sheetData></worksheet>`,
  );
  const second = new TextEncoder().encode(`<worksheet><sheetData><c r="A1" t="inlineStr"><is><t>hidden</t></is></c></sheetData></worksheet>`);
  const text = await labTextFromXlsx(storedZip([
    { name: "xl/sharedStrings.xml", data: strings, method: 8, compressed: deflateRawSync(strings) },
    { name: "xl/worksheets/sheet1.xml", data: first },
    { name: "xl/worksheets/sheet2.xml", data: second },
  ]));
  const table = readLabTable(text ?? "", "en");
  assert.equal(table?.rows[0] && labLine(table.rows[0]), "Glucose 5.6 mmol/L");
  assert.match(table?.reason ?? "", /first sheet/i);
  assert.equal((text ?? "").includes("hidden"), false);
});
