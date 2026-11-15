import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import test from "node:test";
import { textFromPdf } from "./pdf.ts";
import { inspectProse } from "./prose.ts";

function latin1(text: string) {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 255;
  return bytes;
}

function concat(parts: Uint8Array[]) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function pdf(objects: Uint8Array[], trailer = "") {
  return concat([
    latin1("%PDF-1.4\n"),
    ...objects,
    latin1(`\ntrailer\n<< /Root 1 0 R ${trailer} >>\n%%EOF\n`),
  ]);
}

function stream(dict: string, body: string | Uint8Array) {
  const data = typeof body === "string" ? latin1(body) : body;
  return concat([
    latin1(`<< ${dict} /Length ${data.length} >>\nstream\n`),
    data,
    latin1("\nendstream\n"),
  ]);
}

test("open PDF text is copied and an image stream is not", async () => {
  const text = await textFromPdf(pdf([
    stream("", "BT (Glucose 5,6 mmol/L) Tj T* (Discharged home.) Tj ET"),
    stream("/Subtype /Image", "(Glucose 9.9) Tj"),
  ]));
  const prose = inspectProse({ name: "note.pdf", text: text ?? "" }, "en");
  assert.deepEqual(prose?.paragraphs, ["Glucose 5,6 mmol/L", "Discharged home."]);
  assert.equal((text ?? "").includes("9.9"), false);
});

test("a UTF-16 string stays as written and a kerning gap does not split the number", async () => {
  const hex = "FEFF0413043B044E043A043E0437043000200035002C0036";
  const text = await textFromPdf(pdf([
    stream("", `BT <${hex}> Tj [(5) -20 (,6)] TJ ET`),
  ]));
  assert.match(text ?? "", /Глюкоза 5,6/);
  assert.equal((text ?? "").includes("5 ,6"), false);
  assert.equal((text ?? "").includes("5  ,6"), false);
});

test("a flate stream opens and a closed PDF does not", async () => {
  const compressed = deflateSync(Buffer.from("BT (Glucose 5,6) Tj ET"));
  assert.match(await textFromPdf(pdf([stream("/Filter /FlateDecode", compressed)])) ?? "", /Glucose 5,6/);
  const locked = await textFromPdf(pdf([
    stream("", "BT (Glucose 5,6) Tj ET"),
  ], "/Encrypt 9 0 R"));
  assert.match(locked ?? "", /encrypt/);
  assert.equal((locked ?? "").includes("5,6"), false);
  const font = await textFromPdf(pdf([stream("", "BT <00010002> Tj ET")]));
  assert.match(font ?? "", /font/);
  assert.equal(inspectProse({ name: "note.pdf", text: font ?? "" }, "ru")?.paragraphs.length, 0);
  assert.match(inspectProse({ name: "note.pdf", text: font ?? "" }, "ru")?.reason ?? "", /Шрифтовая карта/);
});
