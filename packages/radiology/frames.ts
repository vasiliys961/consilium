const FRAME_EXT = new Set([".heic", ".heif", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".dcm", ".dicom", ".tif", ".tiff"]);

export interface FrameSlot {
  id: string | null;
  reason: string | null;
}

export function frameExtension(name: string) {
  const base = name.toLowerCase().split(/[/\\]/).pop() ?? "";
  return base.includes(".") ? base.slice(base.lastIndexOf(".")) : "";
}

export function assignFrames(names: string[], locale: "en" | "ru" = "en"): Array<FrameSlot | null> {
  let numbered = 0;
  return names.map((name) => {
    if (!FRAME_EXT.has(frameExtension(name))) return null;
    numbered += 1;
    if (numbered > 4) {
      return {
        id: null,
        reason: locale === "ru" ? "Номер получают только четыре кадра." : "Only four frames are numbered.",
      };
    }
    return {
      id: `frame-${numbered}`,
      reason: locale === "ru" ? "Детектор не установлен." : "Detector is not installed.",
    };
  });
}

export const DETECTOR_DEADLINE_MS = 8000;

export async function runDetector<T>(
  work: () => Promise<T>,
  deadlineMs = DETECTOR_DEADLINE_MS,
): Promise<{ status: "done"; value: T } | { status: "not_assessed"; reason: "deadline" }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work().then((value) => ({ status: "done" as const, value })),
      new Promise<{ status: "not_assessed"; reason: "deadline" }>((resolve) => {
        timer = setTimeout(() => resolve({ status: "not_assessed", reason: "deadline" }), deadlineMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
