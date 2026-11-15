import assert from "node:assert/strict";
import test from "node:test";
import { openDicomSeries, readSeries } from "./series.ts";

test("a DICOM zip opens one frame and does not read the patient name", async () => {
  const opened = await openDicomSeries(store([
    { name: "a.dcm", data: synthetic([0, 1024, 2048, 4095]) },
    { name: "b.dcm", data: synthetic([4095, 4095, 4095, 4095], 1024, 1) },
  ]));
  assert.equal(opened?.opened, true);
  if (!opened?.opened) return;
  assert.equal(opened.total, 2);
  assert.equal(opened.pixels.length, 16);
  assert.equal(opened.pixels[0], 0);
  assert.equal(JSON.stringify(opened).includes("IVANOV"), false);

  const skipped = await openDicomSeries(store([
    { name: "bad.dcm", data: Uint8Array.from([1, 2, 3, 4]) },
    { name: "ok.dcm", data: synthetic([4095, 4095, 4095, 4095], 1024, 1) },
  ]));
  assert.equal(skipped?.opened, true);
  if (!skipped?.opened) return;
  assert.equal(skipped.pixels[0], 255);
  assert.equal(await openDicomSeries(store([{ name: "only.dcm", data: synthetic([0, 0, 0, 0]) }, { name: "note.txt", data: Uint8Array.of(1) }])), null);
  assert.equal(await openDicomSeries(store([
    { name: "a.dcm", data: synthetic([0, 0, 0, 0], undefined, undefined, "US") },
    { name: "b.dcm", data: synthetic([0, 0, 0, 0], undefined, undefined, "US") },
  ])), null);
  assert.equal(readSeries({ name: "note.zip" }, "ru"), null);
  assert.match(readSeries({ name: "chest.zip", series: { total: 3, opened: true } }, "ru")?.reason ?? "", /один кадр/);
  assert.match(readSeries({ name: "chest.zip", series: { total: 3, opened: false } }, "en")?.reason ?? "", /did not open/);
});

function synthetic(values: number[], center?: number, width?: number, modality?: string) {
  const parts: number[] = Array.from({ length: 128 }, () => 0);
  parts.push(...Buffer.from("DICM"));
  const add = (group: number, element: number, vr: string, payload: Buffer) => {
    const length = payload.length + (payload.length % 2);
    const long = vr === "OW";
    const head = Buffer.alloc(long ? 12 : 8);
    head.writeUInt16LE(group, 0);
    head.writeUInt16LE(element, 2);
    head.write(vr, 4, "ascii");
    if (long) head.writeUInt32LE(length, 8);
    else head.writeUInt16LE(length, 6);
    parts.push(...head, ...payload, ...(length > payload.length ? [0] : []));
  };
  const us = (value: number) => {
    const bytes = Buffer.alloc(2);
    bytes.writeUInt16LE(value);
    return bytes;
  };
  add(0x0002, 0x0010, "UI", Buffer.from("1.2.840.10008.1.2.1"));
  add(0x0010, 0x0010, "PN", Buffer.from("IVANOV"));
  if (modality) add(0x0008, 0x0060, "CS", Buffer.from(modality));
  add(0x0028, 0x0002, "US", us(1));
  add(0x0028, 0x0004, "CS", Buffer.from("MONOCHROME2"));
  if (center !== undefined) add(0x0028, 0x1050, "DS", Buffer.from(String(center)));
  if (width !== undefined) add(0x0028, 0x1051, "DS", Buffer.from(String(width)));
  add(0x0028, 0x0010, "US", us(2));
  add(0x0028, 0x0011, "US", us(2));
  add(0x0028, 0x0100, "US", us(16));
  add(0x0028, 0x0101, "US", us(12));
  add(0x0028, 0x0103, "US", us(0));
  const pixels = Buffer.alloc(8);
  values.forEach((value, index) => pixels.writeUInt16LE(value, index * 2));
  add(0x7fe0, 0x0010, "OW", pixels);
  return Uint8Array.from(parts);
}

function store(files: { name: string; data: Uint8Array }[]) {
  const parts: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.set(name, 30);
    parts.push(local, Buffer.from(file.data));
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length + file.data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  return Uint8Array.from(Buffer.concat([...parts, ...centrals, eocd]));
}
