/** Uncompressed 8-bit TIFF. File captions are not read. */

const MAX_PIXELS = 2048 * 2048;

export interface TiffImage {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  extra: boolean;
}

export function parseTiff(bytes: Uint8Array): TiffImage {
  if (bytes.length < 16) throw new Error("tiff");
  const order = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0);
  const little = order === "II";
  if (!little && order !== "MM") throw new Error("tiff");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(2, little) !== 42) throw new Error("tiff");
  const first = view.getUint32(4, little);
  const directory = readDirectory(view, little, first);
  if (directory.fields.get(322) || directory.fields.get(323)) throw new Error("tiff");
  if ((directory.fields.get(259)?.[0] ?? 1) !== 1) throw new Error("tiff");
  if ((directory.fields.get(317)?.[0] ?? 1) !== 1) throw new Error("tiff");
  if ((directory.fields.get(284)?.[0] ?? 1) !== 1) throw new Error("tiff");
  const width = directory.fields.get(256)?.[0] ?? 0;
  const height = directory.fields.get(257)?.[0] ?? 0;
  const samples = directory.fields.get(277)?.[0] ?? 1;
  const photometric = directory.fields.get(262)?.[0] ?? 1;
  const bits = directory.fields.get(258) ?? [8];
  if (width < 1 || height < 1 || width * height > MAX_PIXELS) throw new Error("tiff");
  if (![1, 3].includes(samples) || bits.length !== samples || bits.some((bit) => bit !== 8)) throw new Error("tiff");
  if (samples === 1 && photometric !== 0 && photometric !== 1) throw new Error("tiff");
  if (samples === 3 && photometric !== 2) throw new Error("tiff");
  const offsets = directory.fields.get(273);
  const counts = directory.fields.get(279);
  if (!offsets?.length || !counts || counts.length !== offsets.length) throw new Error("tiff");
  const rowsPerStrip = directory.fields.get(278)?.[0] || height;
  const pixels = new Uint8ClampedArray(width * height * 4);
  let row = 0;
  for (let strip = 0; strip < offsets.length && row < height; strip += 1) {
    const rows = Math.min(rowsPerStrip, height - row);
    const start = offsets[strip] ?? 0;
    const count = counts[strip] ?? 0;
    if (count < rows * width * samples || start + count > bytes.length) throw new Error("tiff");
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const source = start + (y * width + x) * samples;
        const target = ((row + y) * width + x) * 4;
        if (samples === 1) {
          const sample = bytes[source] ?? 0;
          const value = photometric === 0 ? 255 - sample : sample;
          pixels[target] = value;
          pixels[target + 1] = value;
          pixels[target + 2] = value;
        } else {
          pixels[target] = bytes[source] ?? 0;
          pixels[target + 1] = bytes[source + 1] ?? 0;
          pixels[target + 2] = bytes[source + 2] ?? 0;
        }
        pixels[target + 3] = 255;
      }
    }
    row += rows;
  }
  if (row !== height) throw new Error("tiff");
  return { width, height, pixels, extra: directory.next !== 0 };
}

function readDirectory(view: DataView, little: boolean, offset: number) {
  if (offset + 2 > view.byteLength) throw new Error("tiff");
  const count = view.getUint16(offset, little);
  if (count > 64 || offset + 2 + count * 12 + 4 > view.byteLength) throw new Error("tiff");
  const fields = new Map<number, number[]>();
  for (let index = 0; index < count; index += 1) {
    const entry = offset + 2 + index * 12;
    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const length = view.getUint32(entry + 4, little);
    const size = type === 1 ? 1 : type === 3 ? 2 : type === 4 ? 4 : 0;
    if (!size || length > 4096) continue;
    const total = size * length;
    const start = total <= 4 ? entry + 8 : view.getUint32(entry + 8, little);
    if (start < 0 || start + total > view.byteLength) throw new Error("tiff");
    const values: number[] = [];
    for (let value = 0; value < length; value += 1) {
      const at = start + value * size;
      if (type === 1) values.push(view.getUint8(at));
      else if (type === 3) values.push(view.getUint16(at, little));
      else values.push(view.getUint32(at, little));
    }
    fields.set(tag, values);
  }
  return { fields, next: view.getUint32(offset + 2 + count * 12, little) };
}

export function closedPhotoReason(kind: "heic" | "tiff", locale: "en" | "ru") {
  if (kind === "heic") {
    return locale === "ru"
      ? "HEIC не открывается. Снимок остаётся в списке."
      : "HEIC is not opened. The photo stays in the list.";
  }
  return locale === "ru"
    ? "Этот TIFF не открывается. Сжатый и плиточный снимок остаётся закрытым."
    : "This TIFF is not opened. A compressed or tiled image stays closed.";
}

export function extraTiffReason(locale: "en" | "ru") {
  return locale === "ru" ? "Открыт только первый кадр TIFF." : "Only the first TIFF image was opened.";
}

function extension(name: string) {
  const base = name.toLowerCase().split(/[/\\]/).pop() ?? "";
  return base.includes(".") ? base.slice(base.lastIndexOf(".")) : "";
}

export function inspectPhoto(
  file: { name: string; image?: string | null },
  locale: "en" | "ru" = "en",
): { status: "not_assessed"; reason: string } | null {
  const ext = extension(file.name);
  if (ext === ".heic" || ext === ".heif") {if (typeof file.image === "string" && /^data:image\/(png|jpeg);base64,/i.test(file.image)) return null;return { status: "not_assessed", reason: closedPhotoReason("heic", locale) };}
  if (ext !== ".tif" && ext !== ".tiff") return null;
  if (typeof file.image === "string" && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(file.image)) return null;
  return { status: "not_assessed", reason: closedPhotoReason("tiff", locale) };
}
