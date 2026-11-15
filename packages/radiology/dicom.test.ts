import assert from "node:assert/strict";
import test from "node:test";
import { dicomLabel, measureSpan, parseDicom } from "./dicom.ts";

test("an uncompressed monochrome frame opens and a patient name is not read", () => {
  const frame = parseDicom(synthetic());
  assert.equal(frame.window.width, 2);
  assert.equal(frame.window.height, 2);
  assert.equal(frame.pixels.length, 16);
  assert.equal(JSON.stringify(frame.window).includes("IVANOV"), false);
  const narrow = parseDicom(synthetic({ center: 1024, width: 1 }));
  assert.equal(narrow.pixels[0], 0);
  assert.equal(narrow.pixels[8], 255);
  assert.throws(() => parseDicom(synthetic({ syntax: "1.2.840.10008.1.2.4.90" })));
  assert.throws(() => parseDicom(new Uint8Array(150)));
  const sized = parseDicom(synthetic({ spacing: "0.5\\0.5" }));
  assert.deepEqual(measureSpan({ x: 0, y: 0 }, { x: 1.5, y: 0 }, sized.window, sized.window.spacing), { pixels: 1.5, millimetres: 0.75 });
  assert.equal(measureSpan({ x: 0, y: 0 }, { x: 1.5, y: 0 }, frame.window, null)?.millimetres, null);
  assert.equal(parseDicom(synthetic({ spacing: "9\\9" })).window.spacing, null);
  assert.equal(measureSpan({ x: -1, y: 0 }, { x: 1, y: 0 }, frame.window, null), null);
  const ultrasound = dicomLabel(synthetic({ modality: "US" }));
  assert.deepEqual(ultrasound, { modality: "US", frames: 1 });
  assert.deepEqual(dicomLabel(synthetic({ modality: "US", frames: 2 })), { modality: "US", frames: 2 });
  assert.equal(dicomLabel(synthetic()), null);
  assert.equal(JSON.stringify(ultrasound).includes("IVANOV"), false);
  assert.equal(parseDicom(synthetic({ modality: "US" })).pixels.length, 16);
});

function synthetic(options: { syntax?: string; center?: number; width?: number; spacing?: string; modality?: string; frames?: number } = {}) {
  const parts: number[] = Array.from({ length: 128 }, () => 0);
  parts.push(...Buffer.from("DICM"));
  const add = (group: number, element: number, vr: string, payload: Buffer) => {
    const length = payload.length + (payload.length % 2);
    const long = vr === "OW" || vr === "UI" && false;
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
  add(0x0002, 0x0010, "UI", Buffer.from(options.syntax ?? "1.2.840.10008.1.2.1"));
  add(0x0010, 0x0010, "PN", Buffer.from("IVANOV"));
  if (options.modality) add(0x0008, 0x0060, "CS", Buffer.from(options.modality));
  add(0x0028, 0x0002, "US", us(1));
  add(0x0028, 0x0004, "CS", Buffer.from("MONOCHROME2"));
  if (options.spacing) add(0x0028, 0x0030, "DS", Buffer.from(options.spacing));
  if (options.center !== undefined) add(0x0028, 0x1050, "DS", Buffer.from(String(options.center)));
  if (options.width !== undefined) add(0x0028, 0x1051, "DS", Buffer.from(String(options.width)));
  add(0x0028, 0x0010, "US", us(2));
  add(0x0028, 0x0011, "US", us(2));
  add(0x0028, 0x0100, "US", us(16));
  add(0x0028, 0x0101, "US", us(12));
  add(0x0028, 0x0103, "US", us(0));
  if (options.frames) add(0x0028, 0x0008, "IS", Buffer.from(String(options.frames)));
  const pixels = Buffer.alloc(8);
  [0, 1024, 2048, 4095].forEach((value, index) => pixels.writeUInt16LE(value, index * 2));
  add(0x7fe0, 0x0010, "OW", pixels);
  return Uint8Array.from(parts);
}
