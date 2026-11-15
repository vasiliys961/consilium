/** Technical gate for dermoscopy and histology. A passing score means the frame can be viewed. It does not assign a pattern, a grade, or a margin. */

const DERM_THRESHOLD = 0.75;
const HISTOLOGY_THRESHOLD = 0.85;
const DERM_SHORT_SIDE = 640;
const HISTOLOGY_SHORT_SIDE = 1024;
const MAX_SAMPLE = 64;

export interface PlaneSample {
  width: number;
  height: number;
  sampleWidth: number;
  sampleHeight: number;
  gray: number[];
  edge?: number[];
  saturation: number;
}

export interface SkinFinding {
  window: "dermoscopy" | "histology";
  status: "read" | "not_assessed";
  reason: string;
  quality: number | null;
  stain: string | null;
  magnification: null;
  scale: "absent";
  checklist: string[];
}

const STAINS = ["h&e", "pas", "giemsa", "trichrome", "masson", "ihc", "ki-67", "ki67"] as const;

function say(locale: "en" | "ru", en: string, ru: string) {
  return locale === "ru" ? ru : en;
}

function edgeVariance(edge: number[], width: number, height: number) {
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const lap = (edge[index - width] ?? 0) + (edge[index + width] ?? 0) + (edge[index - 1] ?? 0) + (edge[index + 1] ?? 0) - 4 * (edge[index] ?? 0);
      sum += lap;
      sumSq += lap * lap;
      count += 1;
    }
  }
  const mean = count === 0 ? 0 : sum / count;
  const variance = count === 0 ? 0 : Math.max(0, sumSq / count - mean * mean);
  return clamp01(variance / 0.02);
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function statedStain(name: string, text: string) {
  const haystack = `${name} ${text}`.toLowerCase();
  const found = STAINS.find((stain) => haystack.includes(stain));
  if (!found) return null;
  if (found === "ki67") return "Ki-67";
  if (found === "h&e") return "H&E";
  return found.toUpperCase();
}

export function isSkinName(name: string) {
  const base = name.toLowerCase().split(/[/\\]/).pop() ?? "";
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")) : "";
  if ([".pdf", ".doc", ".docx", ".txt", ".xml"].includes(ext)) return false;
  if (base.includes("derm")) return true;
  if (/histo|histopath|histology|slide|wsi/.test(base)) return true;
  return base.includes("biops") && [".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff", ".dcm", ".dicom"].includes(ext);
}

/** Laplacian sharpness, exposure and coverage. The scales match the ultrasound quality gate. */
export function scorePlane(plane: PlaneSample) {
  const width = plane.sampleWidth;
  const height = plane.sampleHeight;
  const gray = plane.gray;
  if (width < 3 || height < 3 || width > MAX_SAMPLE || height > MAX_SAMPLE || gray.length !== width * height) {
    return { sharpness: 0, brightness: 0, coverage: 0, quality: 0 };
  }
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const lap = (gray[index - width] ?? 0) + (gray[index + width] ?? 0) + (gray[index - 1] ?? 0) + (gray[index + 1] ?? 0) - 4 * (gray[index] ?? 0);
      sum += lap;
      sumSq += lap * lap;
      count += 1;
    }
  }
  const mean = count === 0 ? 0 : sum / count;
  const variance = count === 0 ? 0 : Math.max(0, sumSq / count - mean * mean);
  const lumaSharpness = clamp01(variance / 0.02);
  const edge = plane.edge;
  const edgeSharpness = edge && edge.length === gray.length ? edgeVariance(edge, width, height) : lumaSharpness;
  const sharpness = Math.max(lumaSharpness, edgeSharpness);
  let tissueSum = 0;
  let tissueCount = 0;
  let clipped = 0;
  let filled = 0;
  for (const value of gray) {
    if (value > 0.96) clipped += 1;
    if (value >= 0.04) {
      tissueSum += value;
      tissueCount += 1;
    }
    if (value >= 0.06 && value <= 0.98) filled += 1;
  }
  const tissueMean = tissueCount === 0 ? 0 : tissueSum / tissueCount;
  let exposure = tissueCount < gray.length * 0.05 ? 0 : 1;
  if (tissueMean < 0.18) exposure = tissueMean / 0.18;
  else if (tissueMean > 0.82) exposure = Math.max(0, (1 - tissueMean) / 0.18);
  const clipScore = 1 - Math.min(1, clipped / gray.length / 0.08);
  const brightness = clamp01(exposure * 0.75 + clipScore * 0.25);
  const coverage = gray.length === 0 ? 0 : clamp01(filled / gray.length);
  const quality = clamp01(sharpness * 0.35 + brightness * 0.25 + 1 * 0.25 + coverage * 0.15);
  return { sharpness, brightness, coverage, quality };
}

function histologyQuality(score: ReturnType<typeof scorePlane>, saturation: number) {
  return clamp01(score.sharpness * 0.5 + score.brightness * 0.2 + score.coverage * 0.15 + clamp01(saturation) * 0.15);
}

export function judgeSkin(
  file: { name: string; text?: string; plane?: PlaneSample },
  locale: "en" | "ru" = "en",
): SkinFinding | null {
  if (!isSkinName(file.name)) return null;
  const histology = !file.name.toLowerCase().includes("derm");
  const windowName: "histology" | "dermoscopy" = histology ? "histology" : "dermoscopy";
  const stain = statedStain(file.name, file.text ?? "");
  const checklist = histology
    ? ["architecture", "nuclei", ...(stain ? [] : ["stain"])]
    : ["pattern", "colors", "network", "vessels"];
  const base = { window: windowName, stain, magnification: null as null, scale: "absent" as const, checklist };
  const plane = file.plane;
  if (!plane) {
    return {
      ...base,
      status: "not_assessed",
      quality: null,
      reason: say(
        locale,
        "Pixels were not scored, so pattern, stain and magnification were not read.",
        "Пиксели не оценены, поэтому рисунок, окраска и увеличение не читались.",
      ),
    };
  }
  const shortSide = Math.min(plane.width, plane.height);
  const needed = histology ? HISTOLOGY_SHORT_SIDE : DERM_SHORT_SIDE;
  const score = scorePlane(plane);
  const saturation = clamp01(plane.saturation);
  const quality = histology ? histologyQuality(score, saturation) : score.quality;
  if (shortSide < needed) {
    return {
      ...base,
      status: "not_assessed",
      quality,
      reason: say(
        locale,
        `The short side is ${Math.floor(shortSide)} px. ${windowName === "histology" ? "Nuclear detail" : "A pigment network"} needs at least ${needed} px.`,
        `Короткая сторона ${Math.floor(shortSide)} пкс. ${windowName === "histology" ? "Ядрам" : "Пигментной сети"} нужно не меньше ${needed} пкс.`,
      ),
    };
  }
  if (saturation < (histology ? 0.12 : 0.08)) {
    return {
      ...base,
      status: "not_assessed",
      quality,
      reason: say(
        locale,
        histology ? "The stain colors are not separated, so the section was not read." : "The lesion colors are not separated, so the pattern was not read.",
        histology ? "Цвета окраски не разделены, срез не читался." : "Цвета очага не разделены, рисунок не читался.",
      ),
    };
  }
  const threshold = histology ? HISTOLOGY_THRESHOLD : DERM_THRESHOLD;
  const sharpEnough = histology ? score.sharpness >= 0.7 : score.sharpness >= 0.45;
  if (!sharpEnough || quality < threshold) {
    const blur = score.sharpness <= score.brightness && score.sharpness <= score.coverage;
    return {
      ...base,
      status: "not_assessed",
      quality,
      reason: say(
        locale,
        blur ? "The frame is not sharp enough to read." : "The frame is too dark, too bright, or too empty to read.",
        blur ? "Кадр недостаточно резкий, чтобы его читать." : "Кадр слишком тёмный, светлый или пустой, чтобы его читать.",
      ),
    };
  }
  return {
    ...base,
    status: "read",
    quality,
    reason: say(
      locale,
      histology
        ? "The section is sharp enough to view. Architecture, nuclei, grade, margins and magnification are not filled."
        : "The lesion is sharp enough to view. Pattern, colours, network, vessels and millimetres are not filled.",
      histology
        ? "Срез достаточно резкий для просмотра. Архитектура, ядра, степень, края и увеличение не заполнены."
        : "Очаг достаточно резкий для просмотра. Рисунок, цвета, сеть, сосуды и миллиметры не заполнены.",
    ),
  };
}

export function modelFrameNames(
  entries: ReadonlyArray<{ source: string; modality: string; status: string }>,
  names: readonly string[],
) {
  const blocked = new Set(
    entries
      .filter((entry) => (entry.modality === "dermatology" || entry.modality === "histology") && entry.status !== "read")
      .map((entry) => entry.source),
  );
  return names.filter((name) => !blocked.has(name));
}

export function skinCaution(entries: ReadonlyArray<{ modality: string; status: string }>, locale: "en" | "ru") {
  const readable = entries.some((entry) => (entry.modality === "dermatology" || entry.modality === "histology") && entry.status === "read");
  if (!readable) return null;
  return say(
    locale,
    "The skin or section frame passed a technical gate only. Do not assign ABCDE, a diagnosis, a grade, a mitotic count, invasion depth, a margin, or a magnification. Name a stain only if it is already written in the note.",
    "Кадр кожи или среза прошёл только технический порог. Не ставь ABCDE, диагноз, степень, число митозов, глубину инвазии, край и увеличение. Окраску называй только если она уже написана в заметке.",
  );
}
