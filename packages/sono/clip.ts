import { scorePlane, type PlaneSample } from "../skin/quality.ts";

/** A phone or computer clip yields one sharp frame. A printed number is copied. A measurement is not invented. */

const SHARP = 0.45;
const QUALITY = 0.75;
const MEASURE = /[\d]+(?:[.,]\d+)?\s*(?:mm|cm|ml|%|bpm|hz|mhz|db|мм|см|мл)\b/gi;
const SIDE =
  /\b(?:left|right)\b|слева|справа|левый|левая|левое|левом|левую|правый|правая|правое|правом|правую/gi;
const ORGANS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: "thyroid", pattern: /thyroid|щитовид/gi },
  { id: "liver", pattern: /liver|печен/gi },
  { id: "kidney", pattern: /kidney|почк/gi },
  { id: "lung", pattern: /lung|лёгк|легк/gi },
  { id: "heart", pattern: /heart|cardiac|сердц/gi },
  { id: "bladder", pattern: /bladder|мочев/gi },
  { id: "spleen", pattern: /spleen|селез[её]н/gi },
];

export interface ClipNote {
  taken: number;
}

export interface ClipFinding {
  status: "read" | "not_assessed";
  taken: number;
  quality: number | null;
  reason: string;
}

export function clipGate(plane: PlaneSample | null | undefined): { quality: number | null; readable: boolean } {
  if (!plane) return { quality: null, readable: false };
  const score = scorePlane(plane);
  return { quality: score.quality, readable: score.sharpness >= SHARP && score.quality >= QUALITY };
}

export function clipReason(taken: number, readable: boolean, locale: "en" | "ru"): string {
  if (taken <= 0) {
    return locale === "ru"
      ? "Кадры из ролика не снялись. Надпись не прочитана."
      : "Frames were not taken from the clip. No printed line was read.";
  }
  if (!readable) {
    return locale === "ru"
      ? "Кадры ролика сняты. Ни один не достаточно резкий, чтобы его читать."
      : "Frames were taken from the clip. None is sharp enough to read.";
  }
  return locale === "ru"
    ? "Из ролика снят один резкий кадр. Напечатанное число копируется. Размер не выдумывается."
    : "One sharp frame was taken from the clip. A printed number is copied. No measurement is invented.";
}

export function clipWithheldReason(locale: "en" | "ru"): string {
  return locale === "ru"
    ? "Кадр ролика остался на месте. Вшитый текст проверить нельзя."
    : "The clip frame stayed local. The burned-in text could not be checked.";
}

export function readClip(
  file: { name?: string; plane?: PlaneSample; clip?: ClipNote },
  locale: "en" | "ru" = "en",
): ClipFinding | null {
  const name = (file.name ?? "").toLowerCase();
  if (![".mp4", ".mov", ".avi"].some((ext) => name.endsWith(ext)) || !file.clip) return null;
  const taken = Number.isInteger(file.clip.taken) && file.clip.taken > 0 ? Math.min(file.clip.taken, 3) : 0;
  const gate = taken > 0 ? clipGate(file.plane) : { quality: null, readable: false };
  return {
    status: gate.readable ? "read" : "not_assessed",
    taken,
    quality: gate.quality,
    reason: clipReason(taken, gate.readable, locale),
  };
}

export function printedLines(words: ReadonlyArray<{ text: string; y: number; height: number }>): string[] {
  const sorted = [...words].sort((left, right) => left.y - right.y);
  const lines: Array<typeof sorted> = [];
  for (const word of sorted) {
    const line = lines.at(-1);
    const previous = line?.[0];
    const far =
      !line ||
      !previous ||
      Math.abs(word.y + word.height / 2 - (previous.y + previous.height / 2)) > Math.max(word.height, previous.height) * 0.6;
    if (far) lines.push([word]);
    else line.push(word);
  }
  const kept: string[] = [];
  for (const line of lines) {
    const text = line.map((word) => word.text).join(" ");
    for (const measure of text.match(MEASURE) ?? []) {
      const clean = measure.replace(/\s+/g, " ").trim();
      if (clean && !kept.includes(clean)) kept.push(clean);
    }
  }
  return kept.slice(0, 8);
}

export function clipLine(value: string, source: string): string {
  let text = value.replace(MEASURE, "").replace(SIDE, "");
  const expected = ORGANS.find((organ) => new RegExp(organ.pattern.source, "i").test(source));
  if (expected) {
    for (const organ of ORGANS) {
      if (organ.id === expected.id) continue;
      text = text.replace(new RegExp(organ.pattern.source, "gi"), "");
    }
  }
  return text.replace(/\s+/g, " ").replace(/\s+([,.;])/g, "$1").trim();
}
