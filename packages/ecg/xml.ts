import type { EcgLead, EcgTrace } from "./inspect.ts";

const LEADS = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"] as const;

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

export type XmlCode = "philips" | "entity" | "unknown" | "repeated" | "width" | "missing" | "nan" | "bad";

export type XmlRead =
  | { kind: "curve"; trace: EcgTrace }
  | { kind: "closed"; code: XmlCode }
  | { kind: "document" };

interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  text: string;
  children: XmlNode[];
}

function leadOf(raw: string): EcgLead | null {
  return ALIASES[raw.toUpperCase().replace(/[^A-Z0-9]/g, "")] ?? null;
}

function localName(raw: string) {
  const colon = raw.lastIndexOf(":");
  return (colon >= 0 ? raw.slice(colon + 1) : raw).toLowerCase();
}

function codePoint(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) return "";
  return String.fromCodePoint(value);
}

function decode(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => codePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, digits: string) => codePoint(Number(digits)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attributes(source: string) {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    const key = match[1];
    if (!key || attrs[key] !== undefined) continue;
    attrs[key] = decode(match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function treeOf(source: string): XmlNode | "entity" | null {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) return "entity";
  const root: XmlNode = { name: "#root", attrs: {}, text: "", children: [] };
  const stack = [root];
  const pattern = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<\/([^\s>]+)\s*>|<([^\s/>]+)([^>]*?)(\/?)>|([^<]+)/g;
  for (const match of source.matchAll(pattern)) {
    const current = stack.at(-1);
    if (!current) return null;
    if (match[1] !== undefined) {
      if (current.children.length === 0) current.text += decode(match[1]);
      continue;
    }
    if (match[2]) {
      const name = localName(match[2]);
      let found = false;
      while (stack.length > 1) {
        const closed = stack.pop();
        if (closed?.name === name) {
          found = true;
          break;
        }
      }
      if (!found) return null;
      continue;
    }
    if (match[3]) {
      const node: XmlNode = { name: localName(match[3]), attrs: attributes(match[4] ?? ""), text: "", children: [] };
      current.children.push(node);
      if (match[5] !== "/") stack.push(node);
      continue;
    }
    if (match[6] && current.children.length === 0) current.text += decode(match[6]);
  }
  return stack.length === 1 ? root : null;
}

function walk(node: XmlNode, visit: (node: XmlNode) => void) {
  visit(node);
  for (const child of node.children) walk(child, visit);
}

function numbersOf(text: string): number[] | "nan" | null {
  const parts = text.replace(/,/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const values = parts.map(Number);
  if (values.some((value) => !Number.isFinite(value))) return "nan";
  return values;
}

function microvolt(unit: string) {
  return unit.toLowerCase().replaceAll("µ", "u").replaceAll("μ", "u") === "uv";
}

function sequenceOf(node: XmlNode): { lead: string; values: number[] } | XmlCode | null {
  let lead = node.attrs.name || node.attrs.code || node.attrs.lead || "";
  let digits: string | null = null;
  let scale = 1;
  let unit = "uv";
  walk(node, (child) => {
    if (child.name === "code" && child.attrs.code) lead = child.attrs.code;
    if ((child.name === "digits" || child.name === "samples") && child.text.trim()) digits = child.text;
    if (child.name === "scale" && child.attrs.value) {
      const value = Number(child.attrs.value);
      if (!Number.isFinite(value)) return;
      scale = value;
      unit = (child.attrs.unit || unit).toLowerCase();
    }
  });
  const text = digits ?? (node.text.trim() ? node.text : "");
  if (!lead || !text.trim()) return null;
  const values = numbersOf(text);
  if (values === "nan") return "nan";
  if (!values) return null;
  const scaled = microvolt(unit) ? values.map((value) => (value * scale) / 1000) : unit === "mv" ? values.map((value) => value * scale) : values;
  return { lead, values: scaled };
}

function rateOf(root: XmlNode): number | null | "bad" {
  let increment: number | null = null;
  let declared: number | null = null;
  let broken = false;
  walk(root, (node) => {
    if (broken || (increment !== null && declared !== null)) return;
    if (increment === null && node.name === "increment" && node.attrs.value !== undefined) {
      const value = Number(node.attrs.value);
      if (!Number.isFinite(value)) broken = true;
      else increment = (node.attrs.unit || "s").toLowerCase() === "ms" ? value / 1000 : value;
    }
    if (declared === null && (node.attrs.samplingRate || node.attrs.sampleRate || node.attrs.frequency)) {
      const value = Number(node.attrs.samplingRate || node.attrs.sampleRate || node.attrs.frequency);
      if (!Number.isFinite(value)) broken = true;
      else declared = value;
    }
  });
  if (broken) return "bad";
  if (declared !== null && declared > 0) return declared;
  if (increment !== null && increment > 0) return 1 / increment;
  return null;
}

export function readEcgXml(text: string): XmlRead {
  const parsed = treeOf(text);
  if (parsed === "entity") return { kind: "closed", code: "entity" };
  if (!parsed) return { kind: "document" };
  const named = new Map<string, number[]>();
  let failure: XmlCode | null = null;
  walk(parsed, (node) => {
    if (failure || !["sequence", "lead", "channel"].includes(node.name)) return;
    const series = sequenceOf(node);
    if (typeof series === "string") {
      failure = series;
      return;
    }
    if (!series) return;
    const current = named.get(series.lead);
    if (!current || series.values.length > current.length) named.set(series.lead, series.values);
  });
  if (failure) return { kind: "closed", code: failure };
  if (named.size === 0) return /parsedwaveforms/i.test(text) ? { kind: "closed", code: "philips" } : { kind: "document" };
  const columns = new Map<EcgLead, number[]>();
  for (const [raw, values] of named) {
    const lead = leadOf(raw);
    if (!lead) return { kind: "closed", code: "unknown" };
    if (columns.has(lead)) return { kind: "closed", code: "repeated" };
    columns.set(lead, values);
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
  const rate = rateOf(parsed);
  if (rate === "bad") return { kind: "closed", code: "bad" };
  return {
    kind: "curve",
    trace: { samplingRate: rate, leads: Object.fromEntries(columns) as Record<EcgLead, number[]> },
  };
}

export function traceXml(text: string): EcgTrace | null {
  const parsed = readEcgXml(text);
  return parsed.kind === "curve" ? parsed.trace : null;
}
