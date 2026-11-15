import type { EcgLead, EcgTrace } from "./inspect.ts";
import { readDicomWave } from "./wave.ts";

const LEADS = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"] as const;

const ALIASES: Record<string, EcgLead> = {
  I: "I",
  II: "II",
  III: "III",
  AVR: "aVR",
  AVL: "aVL",
  AVF: "aVF",
  V1: "V1",
  V2: "V2",
  V3: "V3",
  V4: "V4",
  V5: "V5",
  V6: "V6",
};

const SCP_LEADS: Record<number, EcgLead> = {
  1: "I",
  2: "II",
  3: "V1",
  4: "V2",
  5: "V3",
  6: "V4",
  7: "V5",
  8: "V6",
  61: "III",
  62: "aVR",
  63: "aVL",
  64: "aVF",
};

const HUFFMAN: Record<string, number> = {
  "1:0": 0,
  "3:4": 1,
  "3:5": -1,
  "4:12": 2,
  "4:13": -2,
  "5:28": 3,
  "5:29": -3,
  "6:60": 4,
  "6:61": -4,
  "7:124": 5,
  "7:125": -5,
  "8:252": 6,
  "8:253": -6,
  "9:508": 7,
  "9:509": -7,
  "10:1020": 8,
  "10:1021": -8,
  "10:1022": 511,
  "10:1023": 1023,
};

export type OpenCode =
  | "empty"
  | "edf"
  | "edf-header"
  | "edf-range"
  | "edf-short"
  | "edf-none"
  | "edf-rate"
  | "mat"
  | "mat-v73"
  | "mat-compressed"
  | "mat-shape"
  | "mat-rate"
  | "scp"
  | "scp-huffman"
  | "scp-private"
  | "scp-sections"
  | "scp-leads"
  | "scp-reference"
  | "scp-lead"
  | "scp-rhythm"
  | "scp-bimodal"
  | "scp-encoding"
  | "scp-scale"
  | "scp-odd"
  | "scp-short"
  | "missing"
  | "rate";

export function bytesFromBase64(value: string): Uint8Array | null {
  const raw = value.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  if (!raw || raw.length > 2_000_000) return null;
  try {
    const binary = atob(raw);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export function traceBinary(name: string, binary: string): EcgTrace | null {
  const bytes = bytesFromBase64(binary);
  if (!bytes) return null;
  const opened = openEcgBytes(name, bytes);
  return opened.ok ? opened.trace : null;
}

export function openEcgBytes(name: string, bytes: Uint8Array): { ok: true; trace: EcgTrace } | { ok: false; code: OpenCode } {
  const lower = name.toLowerCase();
  if (lower.endsWith(".dcm") || lower.endsWith(".dicom")) {
    const wave = readDicomWave(bytes);
    return wave.kind === "curve" ? { ok: true, trace: wave.trace } : { ok: false, code: "empty" };
  }
  const read = lower.endsWith(".edf") ? readEdf(bytes) : lower.endsWith(".mat") ? readMat(bytes) : lower.endsWith(".scp") ? readScp(bytes) : { ok: false as const, code: "empty" as const };
  if (!read.ok) return read;
  return assemble(read.leads, read.rate);
}

function leadOf(raw: string): EcgLead | null {
  return ALIASES[raw.toUpperCase().replace(/[^A-Z0-9]/g, "")] ?? null;
}

function assemble(named: Map<EcgLead, number[]>, rate: number): { ok: true; trace: EcgTrace } | { ok: false; code: OpenCode } {
  if (!Number.isFinite(rate) || rate <= 0) return { ok: false, code: "rate" };
  const columns = new Map(named);
  if (columns.has("I") && columns.has("II")) {
    const first = columns.get("I") ?? [];
    const second = columns.get("II") ?? [];
    const derived: Record<string, number[]> = {
      III: second.map((value, index) => value - (first[index] ?? 0)),
      aVR: second.map((value, index) => -((first[index] ?? 0) + value) / 2),
      aVL: second.map((value, index) => (first[index] ?? 0) - value / 2),
      aVF: second.map((value, index) => value - (first[index] ?? 0) / 2),
    };
    for (const lead of ["III", "aVR", "aVL", "aVF"] as const) {
      if (!columns.has(lead)) columns.set(lead, derived[lead] ?? []);
    }
  }
  const missing = LEADS.filter((lead) => !columns.has(lead));
  if (missing.length) return { ok: false, code: "missing" };
  const width = columns.get("I")?.length ?? 0;
  if (!width || LEADS.some((lead) => (columns.get(lead)?.length ?? 0) !== width)) return { ok: false, code: "missing" };
  if (LEADS.some((lead) => columns.get(lead)?.some((value) => !Number.isFinite(value)))) return { ok: false, code: "missing" };
  return {
    ok: true,
    trace: { samplingRate: rate, leads: Object.fromEntries(columns) as Record<EcgLead, number[]> },
  };
}

function field(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length)).trim();
}

function readEdf(bytes: Uint8Array): { ok: true; leads: Map<EcgLead, number[]>; rate: number } | { ok: false; code: OpenCode } {
  if (bytes.length < 256 || field(bytes, 0, 8) !== "0") return { ok: false, code: "edf" };
  const headerBytes = Number(field(bytes, 184, 8));
  const records = Number(field(bytes, 236, 8));
  const recordSeconds = Number(field(bytes, 244, 8));
  const signals = Number(field(bytes, 252, 4));
  if (!Number.isFinite(headerBytes) || !Number.isFinite(records) || !Number.isFinite(recordSeconds) || !Number.isFinite(signals)) {
    return { ok: false, code: "edf-header" };
  }
  if (signals <= 0 || records <= 0 || recordSeconds <= 0 || headerBytes < 256) return { ok: false, code: "edf-header" };
  let cursor = 256;
  const take = (width: number) => {
    const cells = Array.from({ length: signals }, (_, index) => field(bytes, cursor + index * width, width));
    cursor += signals * width;
    return cells;
  };
  const labels = take(16);
  take(80);
  take(8);
  const physicalMin = take(8).map(Number);
  const physicalMax = take(8).map(Number);
  const digitalMin = take(8).map(Number);
  const digitalMax = take(8).map(Number);
  take(80);
  const perRecord = take(8).map((value) => Number(value));
  if (cursor > headerBytes || bytes.length < headerBytes) return { ok: false, code: "edf-header" };
  const recordWidth = perRecord.reduce((sum, count) => sum + count, 0);
  if (bytes.length < headerBytes + records * recordWidth * 2) return { ok: false, code: "edf-short" };
  const named = new Map<EcgLead, number[]>();
  const rates: number[] = [];
  let offset = headerBytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let record = 0; record < records; record += 1) {
    for (let index = 0; index < signals; index += 1) {
      const count = perRecord[index] ?? 0;
      const label = labels[index] ?? "";
      const start = offset;
      offset += count * 2;
      if (label.toLowerCase().includes("annotation")) continue;
      const span = (digitalMax[index] ?? 0) - (digitalMin[index] ?? 0);
      if (span === 0) return { ok: false, code: "edf-range" };
      const lead = leadOf(label);
      if (!lead) continue;
      const column = named.get(lead) ?? [];
      for (let sample = 0; sample < count; sample += 1) {
        const digital = view.getInt16(start + sample * 2, true);
        column.push(((digital - (digitalMin[index] ?? 0)) / span) * ((physicalMax[index] ?? 0) - (physicalMin[index] ?? 0)) + (physicalMin[index] ?? 0));
      }
      named.set(lead, column);
      rates.push(count / recordSeconds);
    }
  }
  if (!named.size) return { ok: false, code: "edf-none" };
  const rate = rates[0] ?? 0;
  if (rates.some((item) => Math.abs(item - rate) > 1e-6)) return { ok: false, code: "edf-rate" };
  return { ok: true, leads: named, rate };
}

function readMat(bytes: Uint8Array): { ok: true; leads: Map<EcgLead, number[]>; rate: number } | { ok: false; code: OpenCode } {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x48 && bytes[2] === 0x44 && bytes[3] === 0x46) return { ok: false, code: "mat-v73" };
  if (bytes.length < 128) return { ok: false, code: "mat" };
  const endian = String.fromCharCode(bytes[126] ?? 0, bytes[127] ?? 0);
  if (endian !== "IM" && endian !== "MI") return { ok: false, code: "mat" };
  const little = endian === "IM";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let rate: number | null = null;
  const matrices: number[][][] = [];
  let cursor = 128;
  while (cursor + 8 <= bytes.length) {
    const tag = readTag(view, cursor, little);
    if (!tag) return { ok: false, code: "mat" };
    if (tag.type === 15) return { ok: false, code: "mat-compressed" };
    if (tag.type === 14) {
      const matrix = readMatrix(view, tag.data, tag.data + tag.size, little);
      if (!matrix.ok) return matrix;
      if (matrix.kind === "rate") rate = matrix.rate;
      if (matrix.kind === "grid" && (matrix.grid.length === 12 || matrix.grid[0]?.length === 12)) matrices.push(matrix.grid);
    }
    cursor = tag.next;
  }
  const grid = matrices.find((item) => item.length === 12 || item[0]?.length === 12);
  if (!grid || matrices.length !== 1) return { ok: false, code: "mat-shape" };
  const rows = grid.length === 12 ? grid : Array.from({ length: 12 }, (_, row) => grid.map((column) => column[row] ?? Number.NaN));
  if (rows.length !== 12 || rows.some((row) => row.length !== rows[0]?.length)) return { ok: false, code: "mat-shape" };
  if (!rate || rate <= 0) return { ok: false, code: "mat-rate" };
  const leads = new Map<EcgLead, number[]>(LEADS.map((lead, index) => [lead, rows[index] ?? []]));
  return { ok: true, leads, rate };
}

function readTag(view: DataView, offset: number, little: boolean) {
  if (offset + 8 > view.byteLength) return null;
  const word = view.getUint32(offset, little);
  const small = (word >> 16) !== 0;
  if (small) {
    return { type: word & 0xffff, size: word >> 16, data: offset + 4, next: offset + 8 };
  }
  const size = view.getUint32(offset + 4, little);
  const next = offset + 8 + size + ((8 - (size % 8)) % 8);
  if (next > view.byteLength) return null;
  return { type: word, size, data: offset + 8, next };
}

function readMatrix(
  view: DataView,
  start: number,
  end: number,
  little: boolean,
): { ok: true; kind: "rate"; rate: number } | { ok: true; kind: "grid"; grid: number[][] } | { ok: false; code: OpenCode } {
  let cursor = start;
  const parts: Array<{ type: number; data: number; size: number }> = [];
  while (cursor + 8 <= end) {
    const tag = readTag(view, cursor, little);
    if (!tag || tag.next > end + 7) break;
    parts.push(tag);
    cursor = tag.next;
  }
  if (parts.length < 4) return { ok: true, kind: "grid", grid: [] };
  const dims = ints(view, parts[1]?.data ?? 0, parts[1]?.size ?? 0, little);
  const name = String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + (parts[2]?.data ?? 0), parts[2]?.size ?? 0)).toLowerCase();
  const values = numbers(view, parts[3]?.type ?? 0, parts[3]?.data ?? 0, parts[3]?.size ?? 0, little);
  if (["fs", "freq", "frequency", "samplingrate", "samplerate"].includes(name) && values.length === 1) {
    return { ok: true, kind: "rate", rate: values[0] ?? 0 };
  }
  if (dims.length !== 2 || !dims[0] || !dims[1] || values.length !== dims[0] * dims[1]) return { ok: true, kind: "grid", grid: [] };
  const grid = Array.from({ length: dims[0] }, (_, row) => Array.from({ length: dims[1] }, (_, column) => values[row + dims[0] * column] ?? Number.NaN));
  return { ok: true, kind: "grid", grid };
}

function ints(view: DataView, offset: number, size: number, little: boolean) {
  const values: number[] = [];
  for (let cursor = 0; cursor + 4 <= size; cursor += 4) values.push(view.getInt32(offset + cursor, little));
  return values;
}

function numbers(view: DataView, type: number, offset: number, size: number, little: boolean) {
  const values: number[] = [];
  const width = type === 9 ? 8 : type === 7 || type === 6 || type === 5 ? 4 : type === 4 || type === 3 ? 2 : 1;
  for (let cursor = 0; cursor + width <= size; cursor += width) {
    if (type === 9) values.push(view.getFloat64(offset + cursor, little));
    else if (type === 7) values.push(view.getFloat32(offset + cursor, little));
    else if (type === 6) values.push(view.getUint32(offset + cursor, little));
    else if (type === 5) values.push(view.getInt32(offset + cursor, little));
    else if (type === 4) values.push(view.getUint16(offset + cursor, little));
    else if (type === 3) values.push(view.getInt16(offset + cursor, little));
    else if (type === 2) values.push(view.getUint8(offset + cursor));
    else if (type === 1) values.push(view.getInt8(offset + cursor));
  }
  return values;
}

function readScp(bytes: Uint8Array): { ok: true; leads: Map<EcgLead, number[]>; rate: number } | { ok: false; code: OpenCode } {
  if (bytes.length < 32) return { ok: false, code: "scp" };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = view.getUint32(2, true);
  if (size && size !== bytes.length) return { ok: false, code: "scp" };
  const header = sectionHeader(view, 6);
  if (!header || header.id !== 0) return { ok: false, code: "scp" };
  const pointers = new Map<number, { length: number; index: number }>();
  let cursor = 22;
  const end = 6 + header.length;
  while (cursor + 10 <= end) {
    pointers.set(view.getUint16(cursor, true), { length: view.getUint32(cursor + 2, true), index: view.getUint32(cursor + 6, true) });
    cursor += 10;
  }
  let huffman = false;
  const table = pointers.get(2);
  if (table && table.length > 0) {
    if (table.length <= 16) return { ok: false, code: "scp-huffman" };
    const tableId = view.getUint16(table.index - 1 + 16, true);
    if (tableId !== 19999) return { ok: false, code: "scp-private" };
    huffman = true;
  }
  const leadsPointer = pointers.get(3);
  const rhythmPointer = pointers.get(6);
  if (!leadsPointer || leadsPointer.length <= 0 || !rhythmPointer || rhythmPointer.length <= 0) return { ok: false, code: "scp-sections" };
  const leads = scpLeads(view, leadsPointer.index - 1);
  if (!leads.ok) return leads;
  const rhythm = scpRhythm(view, rhythmPointer.index - 1, leads.names.length, huffman, leads.counts);
  if (!rhythm.ok) return rhythm;
  const named = new Map<EcgLead, number[]>();
  leads.names.forEach((lead, index) => named.set(lead, rhythm.columns[index] ?? []));
  return { ok: true, leads: named, rate: rhythm.rate };
}

function sectionHeader(view: DataView, offset: number) {
  if (offset + 16 > view.byteLength) return null;
  const length = view.getUint32(offset + 4, true);
  if (length < 16 || offset + length > view.byteLength) return null;
  return { id: view.getUint16(offset + 2, true), length };
}

function scpLeads(view: DataView, offset: number): { ok: true; names: EcgLead[]; counts: number[] } | { ok: false; code: OpenCode } {
  const header = sectionHeader(view, offset);
  if (!header || header.id !== 3) return { ok: false, code: "scp-leads" };
  const count = view.getUint8(offset + 16);
  const flags = view.getUint8(offset + 17);
  if (flags & 0x02) return { ok: false, code: "scp-reference" };
  const names: EcgLead[] = [];
  const counts: number[] = [];
  let cursor = offset + 18;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 9 > view.byteLength) return { ok: false, code: "scp-lead" };
    const start = view.getUint32(cursor, true);
    const stop = view.getUint32(cursor + 4, true);
    const lead = SCP_LEADS[view.getUint8(cursor + 8)];
    if (!lead) return { ok: false, code: "scp-lead" };
    names.push(lead);
    counts.push(stop >= start ? stop - start + 1 : 0);
    cursor += 9;
  }
  return { ok: true, names, counts };
}

function scpRhythm(
  view: DataView,
  offset: number,
  leadCount: number,
  huffman: boolean,
  counts: number[],
): { ok: true; columns: number[][]; rate: number } | { ok: false; code: OpenCode } {
  const header = sectionHeader(view, offset);
  if (!header || header.id !== 6) return { ok: false, code: "scp-rhythm" };
  let cursor = offset + 16;
  const avm = view.getUint16(cursor, true);
  const interval = view.getUint16(cursor + 2, true);
  const encoding = view.getUint8(cursor + 4);
  const bimodal = view.getUint8(cursor + 5);
  cursor += 6;
  if (bimodal !== 0) return { ok: false, code: "scp-bimodal" };
  if (!huffman && encoding !== 0) return { ok: false, code: "scp-encoding" };
  if (huffman && encoding !== 0 && encoding !== 1 && encoding !== 2) return { ok: false, code: "scp-encoding" };
  if (avm <= 0 || interval <= 0) return { ok: false, code: "scp-scale" };
  const widths: number[] = [];
  for (let index = 0; index < leadCount; index += 1) {
    widths.push(view.getUint16(cursor, true));
    cursor += 2;
  }
  const columns: number[][] = [];
  for (let index = 0; index < widths.length; index += 1) {
    const width = widths[index] ?? 0;
    if (!huffman && width % 2) return { ok: false, code: "scp-odd" };
    const blob = new Uint8Array(view.buffer, view.byteOffset + cursor, width);
    cursor += width;
    let decoded: number[];
    if (huffman) {
      const codes = huffmanCodes(blob);
      decoded = encoding === 2 ? secondDifference(codes) : encoding === 1 ? firstDifference(codes) : codes;
      const needed = (counts[index] ?? 0) > 0 ? counts[index] ?? decoded.length : decoded.length;
      if (decoded.length < needed) return { ok: false, code: "scp-short" };
      decoded = decoded.slice(0, needed);
    } else {
      decoded = [];
      const samples = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
      for (let sample = 0; sample < width; sample += 2) decoded.push(samples.getInt16(sample, true));
    }
    columns.push(decoded.map((value) => value * (avm / 1_000_000)));
  }
  return { ok: true, columns, rate: 1_000_000 / interval };
}

export function huffmanCodes(data: Uint8Array) {
  let prefix = 0;
  let size = 0;
  let pending = 0;
  let bits = "";
  const values: number[] = [];
  for (const byte of data) {
    for (const mask of [128, 64, 32, 16, 8, 4, 2, 1]) {
      const bit = byte & mask ? 1 : 0;
      if (pending) {
        bits += bit ? "1" : "0";
        pending -= 1;
        if (pending === 0) {
          let number = Number.parseInt(bits, 2);
          if (bits.length === 8 && number >= 128) number -= 256;
          if (bits.length === 16 && number >= 32768) number -= 65536;
          values.push(number);
          bits = "";
          prefix = 0;
          size = 0;
        }
        continue;
      }
      prefix = (prefix << 1) | bit;
      size += 1;
      const symbol = HUFFMAN[`${size}:${prefix}`];
      if (symbol === undefined) continue;
      if (symbol === 511) pending = 8;
      else if (symbol === 1023) pending = 16;
      else {
        values.push(symbol);
        prefix = 0;
        size = 0;
      }
    }
  }
  return values;
}

function firstDifference(codes: number[]) {
  const restored: number[] = [];
  for (const code of codes) restored.push((restored.at(-1) ?? 0) + (restored.length ? code : code));
  if (codes.length) restored[0] = codes[0] ?? 0;
  return restored;
}

function secondDifference(codes: number[]) {
  let previous: number | null = null;
  let first: number | null = null;
  const restored: number[] = [];
  for (const code of codes) {
    if (previous === null) {
      previous = code;
      restored.push(code);
      continue;
    }
    if (first === null) {
      first = code - previous;
      previous = code;
      restored.push(code);
      continue;
    }
    first += code;
    previous += first;
    restored.push(previous);
  }
  return restored;
}
