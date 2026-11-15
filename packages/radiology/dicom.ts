/** Uncompressed single-frame monochrome DICOM. Patient tags are not read. */

const LONG_VR = new Set(["OB", "OD", "OF", "OL", "OV", "OW", "SQ", "UC", "UR", "UT", "UN"]);
const EXPLICIT_LE = "1.2.840.10008.1.2.1";
const IMPLICIT_LE = "1.2.840.10008.1.2";
const MAX_PIXELS = 2048 * 2048;

export interface DicomWindow {
  width: number;
  height: number;
  center: number | null;
  widthWindow: number | null;
  spacing: [number, number] | null;
}

export function parseDicom(bytes: Uint8Array): { window: DicomWindow; pixels: Uint8ClampedArray } {
  if (bytes.length < 132 || ascii(bytes, 128, 4) !== "DICM") throw new Error("dicom");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 132;
  let explicit = true;
  let meta = true;
  let syntax = "";
  let width = 0;
  let height = 0;
  let bitsAllocated = 0;
  let bitsStored = 0;
  let highBit: number | null = null;
  let photometric = "";
  let signed = false;
  let samples = 1;
  let frames = 1;
  let slope = 1;
  let intercept = 0;
  let center: number | null = null;
  let widthWindow: number | null = null;
  let spacing: [number, number] | null = null;
  let pixelOffset = -1;
  let pixelLength = 0;

  while (offset + 8 <= bytes.length) {
    const group = view.getUint16(offset, true);
    const element = view.getUint16(offset + 2, true);
    if (meta && group !== 0x0002) {
      meta = false;
      if (syntax !== EXPLICIT_LE && syntax !== IMPLICIT_LE) throw new Error("dicom");
      explicit = syntax === EXPLICIT_LE;
    }
    let length = 0;
    let value = 0;
    if (explicit) {
      const vr = ascii(bytes, offset + 4, 2);
      if (LONG_VR.has(vr)) {
        if (offset + 12 > bytes.length) throw new Error("dicom");
        length = view.getUint32(offset + 8, true);
        value = offset + 12;
      } else {
        length = view.getUint16(offset + 6, true);
        value = offset + 8;
      }
    } else {
      length = view.getUint32(offset + 4, true);
      value = offset + 8;
    }
    if (length === 0xffffffff || value + length > bytes.length) throw new Error("dicom");
    const tag = group * 65536 + element;
    if (tag === 0x00020010) syntax = ascii(bytes, value, length);
    if (tag === 0x00280002 && length >= 2) samples = view.getUint16(value, true);
    if (tag === 0x00280004) photometric = ascii(bytes, value, length);
    if (tag === 0x00280008) frames = Number.parseInt(ascii(bytes, value, length), 10);
    if (tag === 0x00280010 && length >= 2) height = view.getUint16(value, true);
    if (tag === 0x00280011 && length >= 2) width = view.getUint16(value, true);
    if (tag === 0x00280100 && length >= 2) bitsAllocated = view.getUint16(value, true);
    if (tag === 0x00280101 && length >= 2) bitsStored = view.getUint16(value, true);
    if (tag === 0x00280102 && length >= 2) highBit = view.getUint16(value, true);
    if (tag === 0x00280103 && length >= 2) signed = view.getUint16(value, true) === 1;
    if (tag === 0x00280030) spacing = spacingOf(ascii(bytes, value, length));
    if (tag === 0x00281050) center = numberOf(ascii(bytes, value, length));
    if (tag === 0x00281051) widthWindow = numberOf(ascii(bytes, value, length));
    if (tag === 0x00281052) intercept = numberOf(ascii(bytes, value, length)) ?? 0;
    if (tag === 0x00281053) slope = numberOf(ascii(bytes, value, length)) ?? 1;
    if (tag === 0x7fe00010) {
      pixelOffset = value;
      pixelLength = length;
      break;
    }
    offset = value + length;
  }

  if (pixelOffset < 0) throw new Error("dicom");
  if (samples !== 1 || frames !== 1 || (photometric !== "MONOCHROME1" && photometric !== "MONOCHROME2")) throw new Error("dicom");
  if (!width || !height || width * height > MAX_PIXELS) throw new Error("dicom");
  if (bitsAllocated !== 8 && bitsAllocated !== 16) throw new Error("dicom");
  if (!bitsStored) bitsStored = bitsAllocated;
  if (bitsStored < 1 || bitsStored > bitsAllocated) throw new Error("dicom");
  highBit ??= bitsStored - 1;
  if (highBit >= bitsAllocated || highBit + 1 < bitsStored) throw new Error("dicom");
  if (pixelLength < width * height * (bitsAllocated / 8)) throw new Error("dicom");

  const pixels = render(view, {
    width,
    height,
    bitsAllocated,
    bitsStored,
    highBit,
    signed,
    slope,
    intercept,
    inverse: photometric === "MONOCHROME1",
    pixelOffset,
    center,
    widthWindow,
  });
  return { window: { width, height, center, widthWindow, spacing }, pixels };
}

export function dicomLabel(bytes: Uint8Array): { modality: string; frames: number } | null {
  try {
    if (bytes.length < 132 || ascii(bytes, 128, 4) !== "DICM") return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 132;
    let explicit = true;
    let meta = true;
    let syntax = "";
    let modality = "";
    let frames = 1;
    while (offset + 8 <= bytes.length) {
      const group = view.getUint16(offset, true);
      const element = view.getUint16(offset + 2, true);
      if (meta && group !== 0x0002) {
        meta = false;
        if (syntax !== EXPLICIT_LE && syntax !== IMPLICIT_LE) return modality ? { modality, frames } : null;
        explicit = syntax === EXPLICIT_LE;
      }
      let length = 0;
      let value = 0;
      if (explicit) {
        const vr = ascii(bytes, offset + 4, 2);
        if (LONG_VR.has(vr)) {
          if (offset + 12 > bytes.length) return null;
          length = view.getUint32(offset + 8, true);
          value = offset + 12;
        } else {
          length = view.getUint16(offset + 6, true);
          value = offset + 8;
        }
      } else {
        length = view.getUint32(offset + 4, true);
        value = offset + 8;
      }
      if (length === 0xffffffff || value + length > bytes.length) return modality ? { modality, frames } : null;
      const tag = group * 65536 + element;
      if (tag === 0x00020010) syntax = ascii(bytes, value, length);
      if (tag === 0x00080060) modality = ascii(bytes, value, length).toUpperCase();
      if (tag === 0x00280008) {
        const parsed = Number.parseInt(ascii(bytes, value, length), 10);
        if (Number.isFinite(parsed) && parsed > 0) frames = parsed;
      }
      if (tag === 0x7fe00010) break;
      offset = value + length;
    }
    return modality ? { modality, frames } : null;
  } catch {
    return null;
  }
}

function spacingOf(text: string): [number, number] | null {
  const [row, column] = text.split("\\").map((part) => Number.parseFloat(part.trim()));
  if (row === undefined || column === undefined || !Number.isFinite(row) || !Number.isFinite(column)) return null;
  if (row < 0.1 || row > 5 || column < 0.1 || column > 5) return null;
  return [row, column];
}

export function measureSpan(
  start: { x: number; y: number },
  end: { x: number; y: number },
  size: { width: number; height: number },
  spacing: [number, number] | null,
): { pixels: number; millimetres: number | null } | null {
  for (const point of [start, end]) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x >= size.width || point.y >= size.height) return null;
  }
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const pixels = Math.hypot(dx, dy);
  if (!Number.isFinite(pixels) || pixels < 0.5) return null;
  const millimetres = spacing ? Math.round(Math.hypot(dx * spacing[1], dy * spacing[0]) * 100) / 100 : null;
  return {
    pixels: Math.round(pixels * 100) / 100,
    millimetres: millimetres !== null && millimetres >= 0.1 && millimetres <= 2500 ? millimetres : null,
  };
}

function numberOf(text: string) {
  const value = Number.parseFloat(text.split("\\")[0] ?? "");
  return Number.isFinite(value) ? value : null;
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  let text = "";
  for (let index = offset; index < offset + length && index < bytes.length; index += 1) text += String.fromCharCode(bytes[index] ?? 0);
  return text.replace(/\0/g, "").trim();
}

function render(
  view: DataView,
  frame: {
    width: number;
    height: number;
    bitsAllocated: number;
    bitsStored: number;
    highBit: number;
    signed: boolean;
    slope: number;
    intercept: number;
    inverse: boolean;
    pixelOffset: number;
    center: number | null;
    widthWindow: number | null;
  },
) {
  const size = frame.width * frame.height;
  const modulus = 2 ** frame.bitsStored;
  const signBit = modulus / 2;
  const shift = 2 ** (frame.highBit + 1 - frame.bitsStored);
  let min = Infinity;
  let max = -Infinity;
  const values = new Float32Array(size);
  for (let index = 0; index < size; index += 1) {
    const at = frame.pixelOffset + index * (frame.bitsAllocated / 8);
    let raw = frame.bitsAllocated === 8 ? view.getUint8(at) : view.getUint16(at, true);
    raw = Math.floor(raw / shift) % modulus;
    if (frame.signed && raw >= signBit) raw -= modulus;
    const value = raw * frame.slope + frame.intercept;
    values[index] = value;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  let low = min;
  let high = max;
  if (frame.center !== null && frame.widthWindow !== null && frame.widthWindow >= 1) {
    low = frame.center - 0.5 - (frame.widthWindow - 1) / 2;
    high = frame.center - 0.5 + (frame.widthWindow - 1) / 2;
  }
  const output = new Uint8ClampedArray(size * 4);
  for (let index = 0; index < size; index += 1) {
    const sample = values[index] ?? 0;
    const scaled = high <= low
      ? (frame.center !== null && sample > frame.center - 0.5 ? 255 : 0)
      : Math.round(Math.max(0, Math.min(255, ((sample - low) / (high - low)) * 255)));
    const grey = frame.inverse ? 255 - scaled : scaled;
    const pixel = index * 4;
    output[pixel] = grey;
    output[pixel + 1] = grey;
    output[pixel + 2] = grey;
    output[pixel + 3] = 255;
  }
  return output;
}
