import { redactText } from "./redact.ts";

export type WordBox = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PixelBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const KEEP = new Set([
  "l", "r", "lt", "rt", "left", "right", "ap", "pa", "lat", "portable", "ob", "od", "os",
  "mi", "tis", "tib", "gn", "fr", "dr", "ef", "hr", "lv", "rv", "ra", "la", "ao", "ivc",
  "bpm", "mm", "cm", "ml", "mg", "hz", "mhz", "db", "fps", "kvp", "mas", "kv",
  "ge", "philips", "siemens", "toshiba", "canon", "samsung", "mindray", "sonosite", "logiq",
  "liver", "kidney", "heart", "lung", "thyroid", "bladder", "chest", "head", "abdomen",
  "spleen", "aorta", "uterus", "ovary", "prostate", "breast", "gallbladder", "ventricle",
  "atrium", "transverse", "longitudinal", "sagittal", "coronal", "axial",
  "patient", "name", "fio", "dob", "age", "sex", "male", "female", "id", "mrn", "date",
  "time", "hospital", "clinic", "medical", "centre", "center", "department", "ultrasound",
  "radiology", "study", "series", "image", "frame", "gain", "depth", "freq", "frequency",
  "probe", "convex", "linear", "cardiac", "abdominal", "vascular", "obstetric",
]);

export const PIXEL_CAUTION =
  "Solid black rectangles are identifier redactions. They are not anatomy, a device, a measurement, or a lesion. Do not describe them. Measurements and the unmarked field stay as they are.";

function measurement(text: string) {
  const compact = text.trim();
  if (/^(?:ef|hr|lv|rv|mi|tis|tib|gn|dr|fr)\s*[\d.]+(?:\s*(?:mm|cm|%|db|mhz|hz))?$/i.test(compact)) return true;
  if (/^[\d.,]+\s*(?:mm|cm|ml|mg|%|bpm|hz|mhz|db|мм|см|мл|мг)?$/i.test(compact)) return true;
  if (/^(?:l|r|lt|rt|left|right|ap|pa|lat|portable)$/i.test(compact)) return true;
  return false;
}

function linesOf(words: WordBox[]) {
  const sorted = [...words].sort((left, right) => left.y - right.y || left.x - right.x);
  const lines: WordBox[][] = [];
  for (const word of sorted) {
    const line = lines.at(-1);
    const previous = line?.[0];
    const far =
      !line ||
      !previous ||
      Math.abs(word.y + word.height / 2 - (previous.y + previous.height / 2)) >
        Math.max(word.height, previous.height) * 0.6;
    if (far) lines.push([word]);
    else line.push(word);
  }
  return lines;
}

function union(words: WordBox[]): PixelBox {
  const x = Math.min(...words.map((word) => word.x));
  const y = Math.min(...words.map((word) => word.y));
  const right = Math.max(...words.map((word) => word.x + word.width));
  const bottom = Math.max(...words.map((word) => word.y + word.height));
  return { x, y, width: right - x, height: bottom - y };
}

function bannerName(word: WordBox) {
  const token = word.text.replace(/[^A-Za-zА-Яа-яЁё]/g, "");
  if (token.length < 4) return false;
  if (KEEP.has(token.toLowerCase())) return false;
  if (!/^[A-Za-zА-Яа-яЁё-]+$/.test(token)) return false;
  return /^[A-ZА-ЯЁ]/.test(token);
}

function pad(box: PixelBox, width: number, height: number): PixelBox {
  const margin = 4;
  const x = Math.max(0, Math.floor(box.x - margin));
  const y = Math.max(0, Math.floor(box.y - margin));
  const right = Math.min(width, Math.ceil(box.x + box.width + margin));
  const bottom = Math.min(height, Math.ceil(box.y + box.height + margin));
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

export function phiBoxes(words: WordBox[], width: number, height: number, extra: PixelBox[] = []): PixelBox[] {
  const chosen: PixelBox[] = [];
  for (const line of linesOf(words)) {
    const text = line.map((word) => word.text).join(" ");
    if (measurement(text)) continue;
    const center = line.reduce((sum, word) => sum + word.y + word.height / 2, 0) / line.length;
    const banner = center < height * 0.22 || center > height * 0.78;
    if (redactText(text).removed > 0) {
      const marked = line.filter((word) => redactText(word.text).removed > 0);
      const hits = marked.length ? marked : line.filter((word) => !measurement(word.text));
      if (hits.length) chosen.push(union(hits));
      continue;
    }
    if (!banner) continue;
    const names = line.filter(bannerName);
    if (names.length) chosen.push(union(names));
  }
  return [...chosen, ...extra].map((box) => pad(box, width, height)).filter((box) => box.width > 0 && box.height > 0);
}

export function parseTsv(tsv: string): WordBox[] {
  const words: WordBox[] = [];
  for (const row of tsv.split(/\n/).slice(1)) {
    const parts = row.split("\t");
    if (parts.length < 12 || parts[0] !== "5") continue;
    const confidence = Number(parts[10]);
    const text = parts.slice(11).join("\t").trim();
    if (!text || !Number.isFinite(confidence) || confidence < 40) continue;
    const x = Number(parts[6]);
    const y = Number(parts[7]);
    const width = Number(parts[8]);
    const height = Number(parts[9]);
    if (![x, y, width, height].every((value) => Number.isFinite(value) && value >= 0)) continue;
    words.push({ text, x, y, width, height });
  }
  return words;
}
