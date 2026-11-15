/** Sixteen-bit mono WAV. The browser records into this shape before the gateway sees it. */

export const HEAR_MIN_SECONDS = 0.2;
export const HEAR_MAX_SECONDS = 20;

export function hearWindow(seconds: number | null): "short" | "long" | "closed" {
  if (seconds === null || !Number.isFinite(seconds) || seconds < HEAR_MIN_SECONDS) return "closed";
  if (seconds > HEAR_MAX_SECONDS) return "long";
  return "short";
}

export function hearReason(kind: "short" | "long", locale: "en" | "ru"): string {
  if (kind === "long") {
    return locale === "ru"
      ? "Запись длиннее 20 секунд. Она звучит в просмотре и к модели не уходит."
      : "The recording is longer than 20 seconds. It plays in the viewer and is not sent to the model.";
  }
  return locale === "ru"
    ? "Короткая запись будет расшифрована при открытии случая. Числа в ней остаются как сказаны."
    : "The short recording is transcribed when the case is opened. Numbers stay as spoken.";
}

export function hearMissReason(locale: "en" | "ru"): string {
  return locale === "ru"
    ? "Запись короче 0,2 секунды и не сохранена."
    : "The recording is shorter than 0.2 seconds and was not kept.";
}

export function downsample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate <= toRate) return samples;
  const ratio = fromRate / toRate;
  const length = Math.floor(samples.length / ratio);
  const out = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(samples.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let cursor = start; cursor < end; cursor += 1) sum += samples[cursor] ?? 0;
    out[index] = sum / Math.max(1, end - start);
  }
  return out;
}

export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const mark = (at: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(at + index, value.charCodeAt(index));
  };
  mark(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  mark(8, "WAVE");
  mark(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  mark(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((value, index) => {
    const clamped = Math.max(-1, Math.min(1, value));
    view.setInt16(44 + index * 2, Math.round(clamped * 0x7fff), true);
  });
  return bytes;
}

export function wavBase64(samples: Float32Array, sampleRate: number): string {
  const bytes = encodeWav(samples, sampleRate);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export function wavDurationSeconds(audio: string): number | null {
  const raw = audio.replace(/^data:audio\/wav;base64,/, "").replace(/\s/g, "");
  if (!raw || raw.length > 1_200_000) return null;
  let bytes: Uint8Array;
  try {
    const binary = atob(raw);
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
  if (bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const label = (at: number) => String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));
  if (label(0) !== "RIFF" || label(8) !== "WAVE" || label(36) !== "data") return null;
  const channels = view.getUint16(22, true);
  const rate = view.getUint32(24, true);
  const bits = view.getUint16(34, true);
  const data = view.getUint32(40, true);
  if (channels !== 1 || bits !== 16 || rate < 8000 || rate > 16000 || data > bytes.length - 44) return null;
  return data / (rate * 2);
}
