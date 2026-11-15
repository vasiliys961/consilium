import { catalogZip } from "../intake/zip.ts";
import { dicomLabel, parseDicom, type DicomWindow } from "./dicom.ts";

const SLICE_LIMIT = 8_000_000;

export interface OpenedSeries {
  total: number;
  opened: true;
  window: DicomWindow;
  pixels: Uint8ClampedArray;
}

export interface ClosedSeries {
  total: number;
  opened: false;
}

export function seriesReason(total: number, opened: boolean, locale: "en" | "ru"): string {
  if (!opened) {
    return locale === "ru"
      ? "Серия DICOM не открылась. Сжатый и многокадровый снимок остаётся закрытым."
      : "This DICOM series did not open. A compressed or multi-frame image stays closed.";
  }
  return locale === "ru"
    ? `Из серии открыт один кадр. В архиве ${total}.`
    : `One frame from the series was opened. The archive holds ${total}.`;
}

export function readSeries(
  file: { name?: string; series?: { total?: number; opened?: boolean } | null },
  locale: "en" | "ru" = "en",
): { total: number; opened: boolean; reason: string } | null {
  if (!file.name?.toLowerCase().endsWith(".zip") || !file.series) return null;
  const total = file.series.total;
  if (typeof total !== "number" || !Number.isInteger(total) || (total ?? 0) < 2 || (total ?? 0) > 200) return null;
  if (typeof file.series.opened !== "boolean") return null;
  return { total, opened: file.series.opened, reason: seriesReason(total, file.series.opened, locale) };
}

export async function openDicomSeries(bytes: Uint8Array): Promise<OpenedSeries | ClosedSeries | null> {
  const entries = catalogZip(bytes);
  if (!entries.length) return null;
  const slices = entries.filter((entry) => /\.(dcm|dicom)$/i.test(entry.name));
  if (slices.length < 2 || slices.length !== entries.length) return null;
  for (const slice of slices) {
    const data = await slice.open(SLICE_LIMIT);
    if (!data) continue;
    try {
      const parsed = parseDicom(data);
      if (dicomLabel(data)?.modality === "US") return null;
      return { total: slices.length, opened: true, window: parsed.window, pixels: parsed.pixels };
    } catch {
      continue;
    }
  }
  return { total: slices.length, opened: false };
}
