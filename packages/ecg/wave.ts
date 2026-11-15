import type { EcgLead, EcgTrace } from "./inspect.ts";

const LEADS = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"] as const;
const EXPLICIT_LE = "1.2.840.10008.1.2.1";
const IMPLICIT_LE = "1.2.840.10008.1.2";
const LONG_VR = new Set(["OB", "OD", "OF", "OL", "OV", "OW", "SQ", "UC", "UR", "UT", "UN"]);
const SEQUENCES = new Set([0x54000100, 0x003a0200, 0x003a0208, 0x003a0211]);

const ALIASES: Record<string, EcgLead> = {
  I: "I",
  ECGI: "I",
  LEADI: "I",
  MLI: "I",
  MDCECGLEADI: "I",
  II: "II",
  ECGII: "II",
  LEADII: "II",
  MLII: "II",
  MDCECGLEADII: "II",
  III: "III",
  ECGIII: "III",
  LEADIII: "III",
  MLIII: "III",
  MDCECGLEADIII: "III",
  AVR: "aVR",
  ECGAVR: "aVR",
  MDCECGLEADAVR: "aVR",
  AVL: "aVL",
  ECGAVL: "aVL",
  MDCECGLEADAVL: "aVL",
  AVF: "aVF",
  ECGAVF: "aVF",
  MDCECGLEADAVF: "aVF",
  V1: "V1",
  ECGV1: "V1",
  MDCECGLEADV1: "V1",
  V2: "V2",
  ECGV2: "V2",
  MDCECGLEADV2: "V2",
  V3: "V3",
  ECGV3: "V3",
  MDCECGLEADV3: "V3",
  V4: "V4",
  ECGV4: "V4",
  MDCECGLEADV4: "V4",
  V5: "V5",
  ECGV5: "V5",
  MDCECGLEADV5: "V5",
  V6: "V6",
  ECGV6: "V6",
  MDCECGLEADV6: "V6",
};

export type WaveCode = "bits" | "length" | "lead" | "repeated" | "width" | "missing" | "closed";

export type WaveRead =
  | { kind: "curve"; trace: EcgTrace }
  | { kind: "closed"; code: WaveCode }
  | { kind: "none" };

interface Tag {
  tag: number;
  value: Uint8Array;
  items: Tag[][];
}

function leadOf(raw: string): EcgLead | null {
  return ALIASES[raw.toUpperCase().replace(/[^A-Z0-9]/g, "")] ?? null;
}

function textOf(value: Uint8Array) {
  return String.fromCharCode(...value).replace(/\0/g, "").trim();
}

function numberOf(value: Uint8Array) {
  const parsed = Number.parseFloat(textOf(value).split("\\")[0] ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  let text = "";
  for (let index = 0; index < length && start + index < bytes.length; index += 1) text += String.fromCharCode(bytes[start + index] ?? 0);
  return text;
}

function readItems(bytes: Uint8Array, explicit: boolean): Tag[][] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const items: Tag[][] = [];
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    const group = view.getUint16(offset, true);
    const element = view.getUint16(offset + 2, true);
    if (group === 0xfffe && element === 0xe0dd) break;
    if (group !== 0xfffe || element !== 0xe000) break;
    const length = view.getUint32(offset + 4, true);
    if (length === 0xffffffff) {
      const nested = readTags(bytes, offset + 8, bytes.length, explicit);
      items.push(nested.tags);
      offset = nested.offset;
      continue;
    }
    const end = offset + 8 + length;
    if (end > bytes.length) break;
    items.push(readTags(bytes, offset + 8, end, explicit).tags);
    offset = end;
  }
  return items;
}

function readTags(bytes: Uint8Array, start: number, end: number, explicit: boolean, limit = Number.POSITIVE_INFINITY) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tags: Tag[] = [];
  let offset = start;
  while (offset + 8 <= end && tags.length < limit) {
    const group = view.getUint16(offset, true);
    const element = view.getUint16(offset + 2, true);
    if (group === 0xfffe && (element === 0xe00d || element === 0xe0dd)) return { tags, offset: offset + 8 };
    const tag = group * 65536 + element;
    let length = 0;
    let value = offset;
    let sequence = false;
    if (explicit) {
      const vr = ascii(bytes, offset + 4, 2);
      sequence = vr === "SQ";
      if (LONG_VR.has(vr)) {
        if (offset + 12 > end) break;
        length = view.getUint32(offset + 8, true);
        value = offset + 12;
      } else {
        length = view.getUint16(offset + 6, true);
        value = offset + 8;
      }
    } else {
      sequence = SEQUENCES.has(tag);
      length = view.getUint32(offset + 4, true);
      value = offset + 8;
    }
    if (length === 0xffffffff) {
      if (!sequence) break;
      const nested = readItems(bytes.subarray(value), explicit);
      const consumed = readSequenceEnd(bytes, value);
      tags.push({ tag, value: bytes.subarray(value, consumed), items: nested });
      offset = consumed;
      continue;
    }
    if (value + length > end) break;
    const slice = bytes.subarray(value, value + length);
    tags.push({ tag, value: slice, items: sequence ? readItems(slice, explicit) : [] });
    offset = value + length;
  }
  return { tags, offset };
}

function readSequenceEnd(bytes: Uint8Array, start: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = start;
  while (offset + 8 <= bytes.length) {
    const group = view.getUint16(offset, true);
    const element = view.getUint16(offset + 2, true);
    const length = view.getUint32(offset + 4, true);
    if (group === 0xfffe && element === 0xe0dd) return offset + 8;
    if (length === 0xffffffff) {
      offset = readSequenceEnd(bytes, offset + 8);
      continue;
    }
    offset += 8 + length;
  }
  return bytes.length;
}

function dataset(bytes: Uint8Array): { tags: Tag[]; syntax: string } | null {
  if (bytes.length < 132 || ascii(bytes, 128, 4) !== "DICM") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tags: Tag[] = [];
  let offset = 132;
  let explicit = true;
  let meta = true;
  let syntax = "";
  while (offset + 8 <= bytes.length) {
    const group = view.getUint16(offset, true);
    if (meta && group !== 0x0002) {
      meta = false;
      explicit = syntax !== IMPLICIT_LE;
      if (syntax && syntax !== EXPLICIT_LE && syntax !== IMPLICIT_LE) return { tags, syntax };
    }
    const read = readTags(bytes, offset, bytes.length, explicit, 1);
    const next = read.tags[0];
    if (!next || read.offset <= offset) break;
    if (next.tag === 0x00020010) syntax = textOf(next.value);
    tags.push(next);
    offset = read.offset;
  }
  return { tags, syntax };
}

function tagOf(tags: Tag[], tag: number) {
  return tags.find((item) => item.tag === tag) ?? null;
}

function unitFactor(tags: Tag[]) {
  const sequence = tagOf(tags, 0x003a0211);
  const words: string[] = [];
  for (const item of sequence?.items ?? []) {
    const code = tagOf(item, 0x00080100);
    const meaning = tagOf(item, 0x00080104);
    if (code) words.push(textOf(code.value));
    if (meaning) words.push(textOf(meaning.value));
  }
  const key = words.join(" ").toLowerCase().replaceAll("µ", "u").replaceAll("μ", "u");
  if (/\buv\b|microvolt/.test(key)) return 0.001;
  if (/\bmv\b|millivolt/.test(key)) return 1;
  if (/\bv\b|volt/.test(key)) return 1000;
  return 1;
}

function channelLead(item: Tag[], index: number) {
  const label = tagOf(item, 0x003a0203);
  const source = tagOf(item, 0x003a0208);
  const meaning = source?.items.flatMap((row) => row.filter((tag) => tag.tag === 0x00080104))[0];
  const raw = (label ? textOf(label.value) : "") || (meaning ? textOf(meaning.value) : "") || LEADS[index] || "";
  return leadOf(raw);
}

export function readDicomWave(bytes: Uint8Array): WaveRead {
  const parsed = dataset(bytes);
  if (!parsed) return { kind: "none" };
  if (parsed.syntax && parsed.syntax !== EXPLICIT_LE && parsed.syntax !== IMPLICIT_LE) return { kind: "none" };
  const sequence = tagOf(parsed.tags, 0x54000100);
  if (!sequence) return { kind: "none" };
  const item = sequence.items[0];
  if (!item) return { kind: "closed", code: "closed" };
  const channels = tagOf(item, 0x003a0005);
  const count = tagOf(item, 0x003a0010);
  const frequency = tagOf(item, 0x003a001a);
  const bits = tagOf(item, 0x54001004);
  const data = tagOf(item, 0x54001010);
  const definitions = tagOf(item, 0x003a0200);
  const channelCount = channels && channels.value.length >= 2 ? new DataView(channels.value.buffer, channels.value.byteOffset, channels.value.byteLength).getUint16(0, true) : 0;
  const sampleCount = count && count.value.length >= 4 ? new DataView(count.value.buffer, count.value.byteOffset, count.value.byteLength).getUint32(0, true) : 0;
  const allocated = bits && bits.value.length >= 2 ? new DataView(bits.value.buffer, bits.value.byteOffset, bits.value.byteLength).getUint16(0, true) : 0;
  const rate = frequency ? numberOf(frequency.value) : null;
  if (!channelCount || !sampleCount || !data || !definitions) return { kind: "closed", code: "closed" };
  if (allocated !== 16) return { kind: "closed", code: "bits" };
  if (definitions.items.length !== channelCount) return { kind: "closed", code: "length" };
  if (data.value.length < channelCount * sampleCount * 2) return { kind: "closed", code: "length" };
  const view = new DataView(data.value.buffer, data.value.byteOffset, data.value.byteLength);
  const columns = new Map<EcgLead, number[]>();
  for (let index = 0; index < channelCount; index += 1) {
    const definition = definitions.items[index] ?? [];
    const lead = channelLead(definition, index);
    if (!lead) return { kind: "closed", code: "lead" };
    if (columns.has(lead)) return { kind: "closed", code: "repeated" };
    const sensitivity = numberOf(tagOf(definition, 0x003a0210)?.value ?? new Uint8Array()) ?? 1;
    const correction = numberOf(tagOf(definition, 0x003a0212)?.value ?? new Uint8Array()) ?? 1;
    const baseline = numberOf(tagOf(definition, 0x003a0213)?.value ?? new Uint8Array()) ?? 0;
    const factor = unitFactor(definition);
    const samples: number[] = [];
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const raw = view.getInt16((sample * channelCount + index) * 2, true);
      samples.push((raw - baseline) * sensitivity * correction * factor);
    }
    columns.set(lead, samples);
  }
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
  if (LEADS.some((lead) => !columns.has(lead))) return { kind: "closed", code: "missing" };
  const width = columns.get("I")?.length ?? 0;
  if (!width || LEADS.some((lead) => (columns.get(lead)?.length ?? 0) !== width)) return { kind: "closed", code: "width" };
  return {
    kind: "curve",
    trace: { samplingRate: rate && rate > 0 ? rate : null, leads: Object.fromEntries(columns) as Record<EcgLead, number[]> },
  };
}

export function traceDicom(bytes: Uint8Array): EcgTrace | null {
  const opened = readDicomWave(bytes);
  return opened.kind === "curve" ? opened.trace : null;
}
