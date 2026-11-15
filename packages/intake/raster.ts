import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import type { PixelBox } from "./burned.ts";

export type Raster = {
  width: number;
  height: number;
  data: Uint8Array;
  kind: "jpeg" | "png";
};

export function decodeDataUrl(dataUrl: string): Raster | null {
  const match = /^data:image\/(jpeg|png);base64,([a-z0-9+/]+={0,2})$/i.exec(dataUrl);
  if (!match?.[2]) return null;
  try {
    const bytes = Buffer.from(match[2], "base64");
    if (match[1]?.toLowerCase() === "png") {
      if(bytes.length<24||bytes.readUInt32BE(16)*bytes.readUInt32BE(20)>16_000_000)return null;
      const png = PNG.sync.read(bytes);
      return { width: png.width, height: png.height, data: png.data, kind: "png" };
    }
    const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB:128, maxResolutionInMP:16 });
    return { width: decoded.width, height: decoded.height, data: decoded.data, kind: "jpeg" };
  } catch {
    return null;
  }
}

export function paintBoxes(data: Uint8Array, width: number, height: number, boxes: PixelBox[]) {
  const next = new Uint8Array(data);
  for (const box of boxes) {
    const x0 = Math.max(0, Math.floor(box.x));
    const y0 = Math.max(0, Math.floor(box.y));
    const x1 = Math.min(width, Math.ceil(box.x + box.width));
    const y1 = Math.min(height, Math.ceil(box.y + box.height));
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const index = (y * width + x) * 4;
        next[index] = 0;
        next[index + 1] = 0;
        next[index + 2] = 0;
        next[index + 3] = 255;
      }
    }
  }
  return next;
}

export function encodeDataUrl(raster: Raster) {
  if (raster.kind === "jpeg") {
    const encoded = jpeg.encode({ data: raster.data, width: raster.width, height: raster.height }, 90);
    return `data:image/jpeg;base64,${Buffer.from(encoded.data).toString("base64")}`;
  }
  const png = new PNG({ width: raster.width, height: raster.height });
  png.data = Buffer.from(raster.data);
  return `data:image/png;base64,${PNG.sync.write(png).toString("base64")}`;
}
