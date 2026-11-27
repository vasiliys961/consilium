import { isLabTable } from "../labs/table.ts";
import { bytesFromBase64, openEcgBytes, type OpenCode } from "./open.ts";
import { readDicomWave, type WaveCode } from "./wave.ts";
import { readEcgXml, type XmlCode } from "./xml.ts";

export { traceXml } from "./xml.ts";

export type EcgStatus = "read" | "refused" | "not_assessed";

export interface EcgFinding {
  status: EcgStatus;
  reason: string | null;
  leads: string[];
  samples: number | null;
  samplingRate: number | null;
}

const LEADS = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"] as const;

export type EcgLead = (typeof LEADS)[number];

export interface EcgTrace {
  samplingRate: number | null;
  leads: Record<EcgLead, number[]>;
}

export const ECG_LAYOUT: readonly (readonly EcgLead[])[] = [
  ["I", "aVR", "V1", "V4"],
  ["II", "aVL", "V2", "V5"],
  ["III", "aVF", "V3", "V6"],
];

const ALIASES: Record<string, (typeof LEADS)[number]> = {
  I: "I",
  II: "II",
  III: "III",
  AVR: "aVR",
  AVL: "aVL",
  AVF: "aVF",
  V1: "V1",
  V2: "V2",
  V3: "V3",
  V4: "V4",
  V5: "V5",
  V6: "V6",
};

function say(locale: "en" | "ru", en: string, ru: string) {
  return locale === "ru" ? ru : en;
}

function leadOf(raw: string): (typeof LEADS)[number] | null {
  const key = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return ALIASES[key] ?? null;
}

function finding(
  status: EcgStatus,
  reason: string | null,
  extra: Partial<EcgFinding> = {},
): EcgFinding {
  return { status, reason, leads: [], samples: null, samplingRate: null, ...extra };
}

const SHEET_EXT = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff", ".heic"]);

/** A paper or photo ECG is named ecg, ekg, or экг. The picture stays a picture. */
export function isEcgSheet(name: string) {
  const base = name.toLowerCase().split(/[/\\]/).pop() ?? "";
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")) : "";
  if (!SHEET_EXT.has(ext)) return false;
  return /(?:^|[^a-z0-9а-яё])(?:ecg|ekg|экг)(?=\d|[^a-z0-9а-яё]|$)/iu.test(base);
}

export function ecgImageStaysLocal(entry: { modality: string; status: string }) {
  return entry.modality === "ecg" && entry.status === "refused";
}

export function sheetCaution(
  entries: ReadonlyArray<{ source: string; modality: string }>,
  locale: "en" | "ru",
) {
  if (!entries.some((entry) => entry.modality === "ecg" && isEcgSheet(entry.source))) return null;
  return say(
    locale,
    "An ECG image is visual evidence, not digital waveform samples. Interpret visible rhythm and morphology as a provisional visual reading. Report rate or intervals only if reliably readable from printed values or measurable calibrated grid; otherwise say not measured. Do not claim ECGFounder or detector output from a photograph.",
    "Изображение ЭКГ — визуальные данные, не цифровой сигнал. Разбери видимый ритм и морфологию как предварительное визуальное заключение. Частоту и интервалы указывай только по читаемым значениям или надёжно измеримой калиброванной сетке; иначе — не измерено. Не выдавай визуальный разбор за результат ECGFounder.",
  );
}

export function receiveFromPhone(name: string) {
  return { name, started: false as const };
}

export function inspectEcg(
  file: { name: string; text?: string; binary?: string },
  locale: "en" | "ru" = "en",
): EcgFinding | null {
  const name = file.name.toLowerCase().split(/[/\\]/).pop() ?? "";
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  const text = file.text ?? "";
  if (isEcgSheet(file.name)) {
    return finding(
      "not_assessed",
      say(
        locale,
        "This is an ECG sheet. Samples were not read. No class is asserted.",
        "Это лист ЭКГ. Отсчёты не прочитаны. Класс не утверждается.",
      ),
    );
  }
  if (![".csv", ".edf", ".mat", ".scp", ".xml", ".hea", ".dat", ".ecg", ".zqecg", ".dcm", ".dicom"].includes(ext)) return null;
  if (ext === ".zqecg" || name.includes(".zqecg")) {
    return finding("refused", say(locale, "ZQECG has no open layout.", "У ZQECG нет открытой раскладки."));
  }
  if (ext === ".ecg") {
    return finding("refused", say(locale, "Contec ECG is not opened.", "Файл Contec не открывается."));
  }
  if (ext === ".hea" || ext === ".dat") {
    return finding(
      "refused",
      say(locale, "WFDB needs the .hea and .dat pair in one zip.", "WFDB нужна пара .hea и .dat в одном zip."),
    );
  }
  if (/muse|mindray|mortara/i.test(text)) {
    return finding(
      "refused",
      say(locale, "GE MUSE, Mindray, and Mortara XML are not opened.", "XML GE MUSE, Mindray и Mortara не открываются."),
    );
  }
  if ([".edf", ".mat", ".scp"].includes(ext)) return readBinary(file.binary, ext, locale);
  if (ext === ".dcm" || ext === ".dicom") return readWave(file.binary, locale);
  if (ext === ".xml") return readXml(text, locale);
  if (ext !== ".csv") return null;
  if (!text.trim()) {
    return finding(
      "not_assessed",
      say(locale, "The samples were not sent.", "Отсчёты не переданы."),
    );
  }
  if (isLabTable(text)) return null;
  return readCsv(text, locale);
}

type ParsedCsv =
  | { ok: true; samplingRate: number | null; leads: Record<EcgLead, number[]> }
  | { ok: false; code: "none" | "short" | "repeated" | "ragged" | "nan" | "missing" | "empty"; lead?: string; missing?: string };

function csvTimeRate(header: string[], rows: string[][]): number | null {
  const units = header.map(name => /^time[ _(\[]+(ms|s)[)\]]?$/i.exec(name)?.[1]?.toLowerCase());
  const index = units.findIndex(Boolean);
  if (index < 0 || units.filter(Boolean).length !== 1 || rows.length < 3) return null;
  const times = rows.map(row => row[index]?.trim() ? Number(row[index]) : NaN);
  const step = (times[times.length - 1] - times[0]) / (times.length - 1);
  if (!Number.isFinite(step) || step <= 0) return null;
  for (let i = 1; i < times.length; i++) {
    const delta = times[i] - times[i - 1];
    if (!Number.isFinite(delta) || Math.abs(delta - step) > step * 0.01) return null;
  }
  return (units[index] === "ms" ? 1000 : 1) / step;
}

function parseCsv(text: string): ParsedCsv {
  if (/\bnone\b/i.test(text)) return { ok: false, code: "none" };
  const rows = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.split(",").map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));
  if (rows.length < 2) return { ok: false, code: "short" };
  let samplingRate: number | null = null;
  let header = rows[0] ?? [];
  let data = rows.slice(1);
  if (leadOf(header[0] ?? "") === null && /sampling|hz/i.test(header[0] ?? "")) {
    const rate = Number(header[1]);
    samplingRate = Number.isFinite(rate) && rate > 0 ? rate : null;
    header = data[0] ?? [];
    data = data.slice(1);
  }
  if (header === rows[0]) samplingRate = csvTimeRate(header, data);
  const columns = new Map<EcgLead, number[]>();
  for (const name of header) {
    const lead = leadOf(name);
    if (!lead) continue;
    if (columns.has(lead)) return { ok: false, code: "repeated", lead };
    columns.set(lead, []);
  }
  const used = header.map((name) => leadOf(name));
  for (const row of data) {
    if (row.length !== header.length) return { ok: false, code: "ragged" };
    for (let index = 0; index < row.length; index += 1) {
      const lead = used[index];
      if (!lead) continue;
      const value = Number(row[index]);
      if (!Number.isFinite(value)) return { ok: false, code: "nan" };
      columns.get(lead)?.push(value);
    }
  }
  if (columns.has("I") && columns.has("II")) {
    const first = columns.get("I") ?? [];
    const second = columns.get("II") ?? [];
    const derived: Record<string, number[]> = {
      III: second.map((value, index) => value - (first[index] ?? 0)),
      aVR: second.map((value, index) => -((first[index] ?? 0) + value) / 2),
      aVL: second.map((value, index) => (first[index] ?? 0) - value / 2),
      aVF: second.map((value, index) => value - (first[index] ?? 0) / 2),
    };
    for (const lead of ["III", "aVR", "aVL", "aVF"] as const) {
      if (!columns.has(lead)) columns.set(lead, derived[lead] ?? []);
    }
  }
  const missing = LEADS.filter((lead) => !columns.has(lead));
  if (missing.length > 0 || columns.size === 0) return { ok: false, code: "missing", missing: missing.join(", ") };
  const samples = columns.get("I")?.length ?? 0;
  if (samples === 0) return { ok: false, code: "empty" };
  return { ok: true, samplingRate, leads: Object.fromEntries(columns) as Record<EcgLead, number[]> };
}

export function traceCsv(text: string): EcgTrace | null {
  const parsed = parseCsv(text);
  if (!parsed.ok) return null;
  return { samplingRate: parsed.samplingRate, leads: parsed.leads };
}

export function traceScale(leads: Record<string, number[]>) {
  let min = Infinity;
  let max = -Infinity;
  for (const values of Object.values(leads)) {
    for (const value of values) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  if (!Number.isFinite(min) || min === max) return { min: (Number.isFinite(min) ? min : 0) - 1, max: (Number.isFinite(max) ? max : 0) + 1 };
  const pad = (max - min) * 0.08;
  return { min: min - pad, max: max + pad };
}

export function leadPath(samples: number[], width: number, height: number, min: number, max: number) {
  const span = max - min || 1;
  const stride = Math.max(1, Math.ceil(samples.length / 500));
  const picked = samples.filter((_, index) => index % stride === 0);
  const step = picked.length <= 1 ? 0 : width / (picked.length - 1);
  return picked.map((value, index) => [index * step, height - ((value - min) / span) * height] as const);
}

function readXml(text: string, locale: "en" | "ru"): EcgFinding | null {
  const parsed = readEcgXml(text);
  if (parsed.kind === "document") return null;
  if (parsed.kind === "closed") return finding("refused", xmlReason(parsed.code, locale));
  const samples = parsed.trace.leads.I.length;
  const reason = parsed.trace.samplingRate
    ? null
    : say(locale, "The sampling rate is absent, so no rate was calculated.", "Частоты в файле нет, ритм не считался.");
  return finding("read", reason, { leads: [...LEADS], samples, samplingRate: parsed.trace.samplingRate });
}

function xmlReason(code: XmlCode, locale: "en" | "ru") {
  if (code === "philips") {
    return say(locale, "Philips XML keeps the curve compressed. This copy does not unpack it.", "Philips XML хранит кривую сжатой. Эта копия её не распаковывает.");
  }
  if (code === "entity") return say(locale, "This XML is not opened.", "Этот XML не открывается.");
  if (code === "unknown") return say(locale, "An XML lead is outside the twelve leads.", "В XML отведение вне двенадцати.");
  if (code === "repeated") return say(locale, "An XML lead is repeated.", "Отведение XML повторяется.");
  if (code === "width") return say(locale, "Each XML lead needs the same number of samples.", "В каждом отведении XML должно быть одно число отсчётов.");
  if (code === "nan") return say(locale, "An XML sample is not a number.", "В XML есть нечисловой отсчёт.");
  if (code === "missing") return say(locale, "The twelve leads are not all present.", "Двенадцати отведений нет.");
  return say(locale, "This ECG file did not open.", "Файл ЭКГ не открылся.");
}

function readWave(binary: string | undefined, locale: "en" | "ru"): EcgFinding | null {
  if (!binary) return null;
  const bytes = bytesFromBase64(binary);
  if (!bytes) return finding("not_assessed", say(locale, "The samples were not sent.", "Отсчёты не переданы."));
  const opened = readDicomWave(bytes);
  if (opened.kind === "none") return null;
  if (opened.kind === "closed") return finding("refused", waveReason(opened.code, locale));
  const samples = opened.trace.leads.I.length;
  const reason = opened.trace.samplingRate
    ? null
    : say(locale, "The sampling rate is absent, so no rate was calculated.", "Частоты в файле нет, ритм не считался.");
  return finding("read", reason, { leads: [...LEADS], samples, samplingRate: opened.trace.samplingRate });
}

function waveReason(code: WaveCode, locale: "en" | "ru") {
  if (code === "bits") return say(locale, "This DICOM waveform is not 16-bit.", "Кривая DICOM не в 16-битном отсчёте.");
  if (code === "length") return say(locale, "The DICOM waveform length does not match the header.", "Длина кривой DICOM не сходится с заголовком.");
  if (code === "lead") return say(locale, "A DICOM lead is outside the twelve leads.", "В DICOM отведение вне двенадцати.");
  if (code === "repeated") return say(locale, "A DICOM lead is repeated.", "Отведение DICOM повторяется.");
  if (code === "width") return say(locale, "Each DICOM lead needs the same number of samples.", "В каждом отведении DICOM должно быть одно число отсчётов.");
  if (code === "missing") return say(locale, "The twelve leads are not all present.", "Двенадцати отведений нет.");
  return say(locale, "This DICOM waveform did not open.", "Кривая DICOM не открылась.");
}

function readBinary(binary: string | undefined, ext: string, locale: "en" | "ru"): EcgFinding {
  const bytes = binary ? bytesFromBase64(binary) : null;
  if (!bytes) {
    return finding("not_assessed", say(locale, "The samples were not sent.", "Отсчёты не переданы."));
  }
  const opened = openEcgBytes(`file${ext}`, bytes);
  if (!opened.ok) return finding("refused", openReason(opened.code, locale));
  return finding("read", null, { leads: [...LEADS], samples: opened.trace.leads.I.length, samplingRate: opened.trace.samplingRate });
}

function openReason(code: OpenCode, locale: "en" | "ru") {
  if (code === "scp-huffman" || code === "scp-private") {
    return say(locale, "This SCP-ECG uses a Huffman table and is not unpacked.", "SCP-ECG сжат таблицей Хаффмана и не распаковывается.");
  }
  if (code === "mat-v73") return say(locale, "MATLAB v7.3 is not opened.", "MATLAB v7.3 не открывается.");
  if (code === "mat-compressed") return say(locale, "A compressed MATLAB file is not opened.", "Сжатый MATLAB не открывается.");
  if (code === "mat-rate" || code === "rate") return say(locale, "The sampling rate is absent.", "Частоты в файле нет.");
  if (code === "missing") return say(locale, "The twelve leads are not all present.", "Двенадцати отведений нет.");
  if (code === "edf-none") return say(locale, "The EDF has no ECG leads.", "В EDF нет отведений ЭКГ.");
  return say(locale, "This ECG file did not open.", "Файл ЭКГ не открылся.");
}

function readCsv(text: string, locale: "en" | "ru"): EcgFinding {
  const parsed = parseCsv(text);
  if (!parsed.ok) {
    if (parsed.code === "none") return finding("refused", say(locale, "A Contec CSV with empty cells is not opened.", "CSV Contec с пустыми ячейками не открывается."));
    if (parsed.code === "short") return finding("refused", say(locale, "The CSV has no sample row.", "В CSV нет строки отсчётов."));
    if (parsed.code === "repeated") return finding("refused", say(locale, `Lead ${parsed.lead} is repeated.`, `Отведение ${parsed.lead} повторяется.`));
    if (parsed.code === "ragged") return finding("refused", say(locale, "A CSV row has a different column count.", "В строке CSV другое число колонок."));
    if (parsed.code === "nan") return finding("refused", say(locale, "A CSV sample is not a number.", "В CSV есть нечисловой отсчёт."));
    if (parsed.code === "empty") return finding("refused", say(locale, "The CSV has no samples.", "В CSV нет отсчётов."));
    return finding("refused", say(locale, `Missing leads: ${parsed.missing}.`, `Не хватает отведений: ${parsed.missing}.`));
  }
  const samples = parsed.leads.I.length;
  const reason = parsed.samplingRate
    ? null
    : say(locale, "The sampling rate is absent, so no rate was calculated.", "Частоты в файле нет, ритм не считался.");
  return finding("read", reason, { leads: [...LEADS], samples, samplingRate: parsed.samplingRate });
}
