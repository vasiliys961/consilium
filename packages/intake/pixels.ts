import { imageDataUrl } from "../../lib/draft.ts";
import { phiBoxes, type PixelBox, type WordBox } from "./burned.ts";
import { recognizeWords } from "./ocr.ts";
import { decodeDataUrl, encodeDataUrl, paintBoxes, type Raster } from "./raster.ts";

export type PixelCover = {
  source: string;
  boxes: PixelBox[];
  withheld: boolean;
  words: WordBox[] | null;
};

type FrameFile = {
  name: string;
  image: string | null;
  masks?: PixelBox[];
};

const RISKY = new Set(["radiology", "ultrasound", "ecg", "dermatology", "histology", "unknown"]);

export function riskyFrame(modality: string | undefined) {
  return RISKY.has(modality ?? "");
}

function bytesOf(dataUrl: string) {
  const match = /^data:image\/(jpeg|png);base64,([a-z0-9+/]+={0,2})$/i.exec(dataUrl);
  if (!match?.[2]) return null;
  return { bytes: Buffer.from(match[2], "base64"), ext: match[1]?.toLowerCase() === "png" ? "png" as const : "jpg" as const };
}

export async function coverFiles<T extends FrameFile>(
  files: T[],
  modalityOf: (name: string) => string | undefined,
  read: (bytes: Buffer, ext: "png" | "jpg") => Promise<WordBox[] | null> = recognizeWords,
): Promise<{ files: T[]; covers: PixelCover[]; removed: number }> {
  const covers: PixelCover[] = [];
  let removed = 0;
  const next: T[] = [];
  for (const file of files) {
    if (!file.image) {
      next.push(file);
      continue;
    }
    const risky = riskyFrame(modalityOf(file.name));
    const decoded = decodeDataUrl(file.image);
    const packed = bytesOf(file.image);
    if (!decoded || !packed) {
      covers.push({ source: file.name, boxes: [], withheld: risky, words: null });
      next.push(risky ? { ...file, image: null } : file);
      continue;
    }
    const words = await read(packed.bytes, packed.ext);
    if (!words) {
      covers.push({ source: file.name, boxes: [], withheld: risky, words: null });
      next.push(risky ? { ...file, image: null } : file);
      continue;
    }
    const boxes = phiBoxes(words, decoded.width, decoded.height, file.masks ?? []);
    removed += boxes.length;
    if (!boxes.length) {
      covers.push({ source: file.name, boxes, withheld: false, words });
      next.push(file);
      continue;
    }
    const painted = paintRaster(decoded, boxes);
    if (!painted) {
      covers.push({ source: file.name, boxes, withheld: true, words });
      next.push({ ...file, image: null });
      continue;
    }
    covers.push({ source: file.name, boxes, withheld: false, words });
    next.push({ ...file, image: painted });
  }
  return { files: next, covers, removed };
}

function paintRaster(raster: Raster, boxes: PixelBox[]) {
  const data = paintBoxes(raster.data, raster.width, raster.height, boxes);
  const encoded = encodeDataUrl({ ...raster, data });
  return imageDataUrl(encoded);
}
