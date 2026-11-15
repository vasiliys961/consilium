import assert from "node:assert/strict";
import test from "node:test";
import { inspectPhoto, parseTiff } from "./tiff.ts";

function u16(value: number, little: boolean) {
  return little ? [value & 255, value >> 8] : [value >> 8, value & 255];
}

function u32(value: number, little: boolean) {
  const bytes = [value >>> 24, (value >> 16) & 255, (value >> 8) & 255, value & 255];
  return little ? bytes.reverse() : bytes;
}

function tiff(options: { little?: boolean; compression?: number; photometric?: number; samples?: number; pixels: number[]; extra?: boolean; tile?: boolean }) {
  const little = options.little !== false;
  const samples = options.samples ?? 1;
  const width = samples === 3 ? options.pixels.length / 3 : 2;
  const height = samples === 3 ? 1 : 2;
  const caption = [...Buffer.from("IVANOV")];
  const records: Array<{ tag: number; type: number; values: number[] }> = [
    { tag: 256, type: 4, values: [width] },
    { tag: 257, type: 4, values: [height] },
    { tag: 258, type: 3, values: Array.from({ length: samples }, () => 8) },
    { tag: 259, type: 3, values: [options.compression ?? 1] },
    { tag: 262, type: 3, values: [options.photometric ?? 1] },
    { tag: 270, type: 2, values: caption },
    { tag: 273, type: 4, values: [0] },
    { tag: 277, type: 3, values: [samples] },
    { tag: 278, type: 4, values: [height] },
    { tag: 279, type: 4, values: [options.pixels.length] },
  ];
  if (options.tile) records.push({ tag: 322, type: 4, values: [16] });
  records.sort((left, right) => left.tag - right.tag);
  const ifdStart = 8;
  const payloadAt = ifdStart + 2 + records.length * 12 + 4;
  const external: number[] = [];
  const valueAt = records.map((record) => {
    const size = record.type === 2 || record.type === 1 ? 1 : record.type === 3 ? 2 : 4;
    if (size * record.values.length <= 4) return null;
    const at = payloadAt + external.length;
    for (const value of record.values) external.push(...(record.type === 3 ? u16(value, little) : [value & 255]));
    return at;
  });
  const pixelAt = payloadAt + external.length;
  const strip = records.find((record) => record.tag === 273);
  if (strip) strip.values = [pixelAt];
  const body = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42, little), ...u32(ifdStart, little), ...u16(records.length, little)];
  records.forEach((record, index) => {
    const size = record.type === 2 || record.type === 1 ? 1 : record.type === 3 ? 2 : 4;
    const inline = record.type === 2
      ? record.values
      : record.values.flatMap((value) => (record.type === 3 ? u16(value, little) : u32(value, little)));
    const packed = size * record.values.length <= 4 ? inline : u32(valueAt[index] ?? 0, little);
    while (packed.length < 4) packed.push(0);
    body.push(...u16(record.tag, little), ...u16(record.type, little), ...u32(record.values.length, little), ...packed.slice(0, 4));
  });
  body.push(...u32(options.extra ? pixelAt + options.pixels.length + caption.length : 0, little), ...external, ...options.pixels, ...caption);
  return new Uint8Array(body);
}

test("an uncompressed TIFF opens and a caption is not read", () => {
  const gray = parseTiff(tiff({ pixels: [0, 255, 128, 64] }));
  assert.equal(gray.width, 2);
  assert.equal(gray.height, 2);
  assert.deepEqual([...gray.pixels.slice(0, 4)], [0, 0, 0, 255]);
  assert.deepEqual([...gray.pixels.slice(4, 8)], [255, 255, 255, 255]);
  assert.equal(gray.extra, false);
  assert.equal(JSON.stringify(gray).includes("IVANOV"), false);
  const rgb = parseTiff(tiff({ little: false, samples: 3, photometric: 2, pixels: [255, 0, 0, 0, 255, 0] }));
  assert.deepEqual([...rgb.pixels.slice(0, 4)], [255, 0, 0, 255]);
  assert.equal(rgb.width, 2);
  const extra = parseTiff(tiff({ pixels: [0, 255, 128, 64], extra: true }));
  assert.equal(extra.extra, true);
  assert.equal(extra.pixels.length, 16);
  assert.throws(() => parseTiff(tiff({ pixels: [0, 255, 128, 64], compression: 5 })));
  assert.throws(() => parseTiff(tiff({ pixels: [0, 255, 128, 64], tile: true })));
});

test("HEIC stays closed and a TIFF reaches a frame only after it is opened", () => {
  assert.match(inspectPhoto({ name: "phone.heic" }, "ru")?.reason ?? "", /HEIC не открывается/);
  assert.match(inspectPhoto({ name: "scan.tiff" }, "en")?.reason ?? "", /not opened/);
  assert.equal(inspectPhoto({ name: "scan.tif", image: "data:image/png;base64,aaaa" }), null);
  assert.equal(inspectPhoto({ name: "note.pdf" }), null);
  assert.equal(inspectPhoto({name:"phone.heic",image:"data:image/jpeg;base64,aaaa"}),null);
});
