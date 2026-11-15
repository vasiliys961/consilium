import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import test from "node:test";
import { unpackZip } from "./zip.ts";

function u16(value: number) {
  return [value & 255, (value >> 8) & 255];
}

function u32(value: number) {
  return [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >> 24) & 255];
}

function storedZip(entries: Array<{ name: string; data: Uint8Array; method?: number; compressed?: Uint8Array; flags?: number }>) {
  const parts: number[][] = [];
  const directory: number[][] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = [...new TextEncoder().encode(entry.name)];
    const method = entry.method ?? 0;
    const payload = [...(entry.compressed ?? entry.data)];
    const local = [
      0x50, 0x4b, 0x03, 0x04, 20, 0, ...(u16(entry.flags ?? 0)), method, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ...u32(payload.length), ...u32(entry.data.length), ...u16(name.length), 0, 0, ...name, ...payload,
    ];
    directory.push([
      0x50, 0x4b, 0x01, 0x02, 20, 0, 20, 0, ...(u16(entry.flags ?? 0)), method, 0, 0, 0, 0, 0, 0, 0, 0, 0,
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

test("a zip lists the files inside and drops a path that climbs out", async () => {
  const note = new TextEncoder().encode("hello");
  const csv = new TextEncoder().encode("I,II\n0.2,0.2\n");
  const members = await unpackZip(storedZip([
    { name: "folder/", data: new Uint8Array() },
    { name: "series/note.txt", data: note },
    { name: "../secret.csv", data: csv },
  ]));
  assert.deepEqual(members.map((member) => member.name), ["note.txt", "secret.csv"]);
  assert.equal(new TextDecoder().decode(members[0]?.data ?? new Uint8Array()), "hello");
  assert.equal(members[1]?.bytes, csv.length);
});

test("a deflated member opens and an encrypted member stays listed without bytes", async () => {
  const plain = new TextEncoder().encode("metoprolol 50 mg");
  const members = await unpackZip(storedZip([
    { name: "note.txt", data: plain, method: 8, compressed: deflateRawSync(plain) },
    { name: "sealed.dcm", data: plain, flags: 1 },
  ]));
  assert.equal(new TextDecoder().decode(members[0]?.data ?? new Uint8Array()), "metoprolol 50 mg");
  assert.equal(members[1]?.name, "sealed.dcm");
  assert.equal(members[1]?.data, null);
});
