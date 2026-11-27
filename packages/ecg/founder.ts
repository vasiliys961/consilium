import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { settleAction, type DraftStatement } from "../../lib/draft.ts";
import { moduleLocale, type Locale } from "../../lib/locale.ts";
import { inspectEcg, traceCsv, traceXml } from "./inspect.ts";
import { traceBinary } from "./open.ts";

export const NETWORK_BAR = 0.5;
const NETWORK_MS = 45_000;

export interface NetworkClass {
  label: string;
  score: number;
}

export interface TracingAssessment {
  measurements?: { method: string; description: string; lines: Array<{ name: string; value: string }>; note: string };
  source: string;
  status: "read" | "not_assessed";
  cleared: NetworkClass[];
  top: NetworkClass | null;
  names: string[];
  reason: string | null;
}

const ALIASES: ReadonlyArray<{ labels: string[]; pattern: RegExp }> = [
  { labels: ["ATRIAL FIBRILLATION"], pattern: /atrial fibrillation|фибрилляц\p{L}*\s+предсерд\p{L}*/giu },
  { labels: ["ATRIAL FLUTTER"], pattern: /atrial flutter|трепетан\p{L}*/giu },
  { labels: ["VENTRICULAR TACHYCARDIA"], pattern: /ventricular tachycardia|желудочков\p{L}*\s+тахикард\p{L}*/giu },
  { labels: ["SUPRAVENTRICULAR TACHYCARDIA"], pattern: /supraventricular tachycardia|наджелудочков\p{L}*\s+тахикард\p{L}*/giu },
  { labels: ["WIDE QRS TACHYCARDIA"], pattern: /wide qrs tachycardia|ширококомплексн\p{L}*\s+тахикард\p{L}*/giu },
  { labels: ["WITH COMPLETE HEART BLOCK"], pattern: /complete heart block|полн\p{L}*\s+(?:атриовентрикулярн\p{L}*\s+)?блокад\p{L}*/giu },
  { labels: ["SINUS RHYTHM", "NORMAL SINUS RHYTHM"], pattern: /sinus rhythm|синусов\p{L}*\s+ритм\p{L}*/giu },
];

function tidy(value: string) {
  return value.replace(/\s+/g, " ").replace(/\s+([,.;])/g, "$1").trim();
}

function phrase(label: string) {
  return new RegExp(`(?<![\\p{L}\\p{N}])${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "giu");
}

export function dropUnclearedClasses(text: string, names: string[], cleared: string[]) {
  const allowed = new Set(cleared.map((label) => label.toUpperCase()));
  let next = text;
  const holes: string[] = [];
  for (const label of [...allowed].sort((a, b) => b.length - a.length)) {
    next = next.replace(phrase(label), () => {
      holes.push(label);
      return `\u0000${holes.length - 1}\u0000`;
    });
  }
  for (const label of [...names].sort((a, b) => b.length - a.length)) {
    if (allowed.has(label.toUpperCase())) continue;
    next = next.replace(phrase(label), "");
  }
  for (const alias of ALIASES) {
    if (alias.labels.some((label) => allowed.has(label))) continue;
    alias.pattern.lastIndex = 0;
    next = next.replace(alias.pattern, "");
  }
  next = next.replace(/\u0000(\d+)\u0000/g, (_, index: string) => holes[Number(index)] ?? "");
  return tidy(next);
}

function say(locale: Locale, en: string, ru: string) {
  return moduleLocale(locale) === "ru" ? ru : en;
}

function line(locale: Locale, text: string, source: string) {
  return settleAction({ text: say(locale, text, text), source, memory: false });
}

export function networkStatements(assessment: TracingAssessment, locale: Locale): DraftStatement[] {
  const source = `module:${assessment.source}`;
  if (assessment.status !== "read") {
    const reason = assessment.reason ?? say(locale, "The ECG network did not assess the tracing.", "Сеть ЭКГ запись не оценила.");
    return [settleAction({ text: reason, source, memory: false })];
  }
  if (!assessment.cleared.length) {
    const top = assessment.top;
    const text = top
      ? say(
          locale,
          `The ECG network cleared no class at ${NETWORK_BAR}. Highest was ${top.label} ${top.score.toFixed(2)}. No class is asserted.`,
          `Сеть ЭКГ не провела класс через ${NETWORK_BAR}. Выше всех ${top.label} ${top.score.toFixed(2)}. Класс не утверждается.`,
        )
      : say(locale, "The ECG network cleared no class. No class is asserted.", "Сеть ЭКГ не провела класс. Класс не утверждается.");
    return [settleAction({ text, source, memory: false })];
  }
  return assessment.cleared.map((item) =>
    line(
      locale,
      say(
        locale,
        `ECG network: ${item.label} ${item.score.toFixed(2)}`,
        `Сеть ЭКГ: ${item.label} ${item.score.toFixed(2)}`,
      ),
      source,
    ),
  );
}

export function networkObservation(assessment: TracingAssessment) {
  const measurements = assessment.measurements ? `\nDigital ECG measurements (${assessment.measurements.method}):\n${assessment.measurements.description}\n${assessment.measurements.lines.map(row => `${row.name}: ${row.value}`).join('\n')}\nMeasurement limits: ${assessment.measurements.note}` : '';
  if (assessment.status !== "read") {
    return `ECG network ${assessment.source}: NOT ASSESSED. ${assessment.reason ?? 'The detector did not return a usable result.'} No detector class is confirmed; this does not imply a normal tracing.${measurements}`;
  }
  if (!assessment.cleared.length) {
    return `ECG network ${assessment.source}: no class cleared the threshold. No detector class is confirmed; this does not imply a normal tracing.${measurements}`;
  }
  const cleared = assessment.cleared.map((item) => `${item.label} ${item.score.toFixed(2)}`).join("; ");
  return `ECG network ${assessment.source}: cleared ${cleared}. Do not change a score. Do not name a class that is absent from this list.${measurements}`;
}

export function founderHome() {
  if(process.env.ECGFOUNDER_HOME)return resolve(process.env.ECGFOUNDER_HOME);
  const candidates=[join(process.cwd(),"..","ECG-opus"),join(homedir(),"Desktop","ECG-opus"),join(homedir(),"Desktop","ECG-opus-main-home")];
  return candidates.find(home=>existsSync(join(home,"ecg_engine","ecgfounder.py"))&&existsSync(join(home,"models","ecgfounder","12_lead_ECGFounder.pth")))??candidates[0];
}
export function founderReadiness(){const home=founderHome();return {available:existsSync(join(home,"ecg_engine","ecgfounder.py"))&&existsSync(founderPython(home))&&existsSync(process.env.ECGFOUNDER_WEIGHTS||join(home,"models","ecgfounder","12_lead_ECGFounder.pth")),home};}

function founderPython(home: string) {
  return process.env.ECGFOUNDER_PYTHON || join(home, ".venv", "bin", "python");
}

function runNetwork(home: string, stdin: string) {
  const python = founderPython(home);
  const script = join(process.cwd(), "packages", "ecg", "founder_run.py");
  return new Promise<string | null>((resolve) => {
    const child = spawn(python, [script], { stdio: ["pipe", "pipe", "ignore"] });
    let out = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, NETWORK_MS);
    child.stdout.on("data", (chunk) => {
      out += String(chunk);
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(JSON.stringify({ok:false,code:"runner"}));
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve(out.trim() || JSON.stringify({ok:false,code:"runtime"}));
    });
    child.stdin.on("error", () => { /* A failed or early-exiting runner closes its input. */ });
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

export async function assessTracing(
  file: { name: string; text?: string; binary?: string },
  locale: Locale,
  deps?: { run?: (home: string, stdin: string) => Promise<string | null>; names?: string[]; home?: string },
): Promise<TracingAssessment | null> {
  const lower = file.name.toLowerCase();
  const binaryName = [".edf", ".mat", ".scp", ".dcm", ".dicom"].some((ext) => lower.endsWith(ext));
  const xmlName = lower.endsWith(".xml");
  if (!lower.endsWith(".csv") && !binaryName && !xmlName) return null;
  const trace = binaryName ? (file.binary ? traceBinary(file.name, file.binary) : null) : xmlName ? traceXml(file.text ?? "") : traceCsv(file.text ?? "");
  const source = file.name;
  const names = deps?.names ?? [];
  if (!trace?.samplingRate) {
    return {
      source,
      status: "not_assessed",
      cleared: [],
      top: null,
      names,
      reason: !trace && lower.endsWith(".csv")
        ? inspectEcg(file, moduleLocale(locale) === "ru" ? "ru" : "en")?.reason ?? say(locale, "Cannot read this ECG table.", "Не удалось прочитать таблицу отведений ЭКГ.")
        : (binaryName || xmlName) && !trace
        ? say(locale, "The ECG file did not open, so the network was not run.", "Файл ЭКГ не открылся, сеть не запускалась.")
        : say(locale, "The sampling rate is absent, so the ECG network was not run.", "Частоты в файле нет, сеть ЭКГ не запускалась."),
    };
  }
  const seconds = trace.leads.I.length / trace.samplingRate;
  if (seconds < 8 || seconds > 12) {
    return {
      source,
      status: "not_assessed",
      cleared: [],
      top: null,
      names,
      reason: say(
        locale,
        "The ECG network reads a tracing of about 10 seconds. This recording was not assessed.",
        "Сеть ЭКГ читает запись около 10 секунд. Эта запись не оценена.",
      ),
    };
  }
  const home = deps?.home ?? founderHome();
  const taskNames = names.length ? names : await readFile(join(home, "ecg_engine", "ecgfounder_tasks.txt"), "utf8").then(
    (text) => text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
    () => [],
  );
  const payload = JSON.stringify({
    home,
    samplingRate: trace.samplingRate,
    leads: trace.leads,
  });
  const raw = await (deps?.run ?? runNetwork)(home, payload);
  if (!raw) {
    return {
      source,
      status: "not_assessed",
      cleared: [],
      top: null,
      names: taskNames,
      reason: say(locale, "The ECG network did not answer in time.", "Сеть ЭКГ не ответила вовремя."),
    };
  }
  let parsed: { ok?: boolean; code?: string; scores?: Array<{ label?: unknown; score?: unknown }>; measurements?: { available?: boolean; method?: string; description?: string; lines?: Array<{name?:unknown;value?:unknown}>; note?: string } };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    return {
      source,
      status: "not_assessed",
      cleared: [],
      top: null,
      names: taskNames,
      reason: say(locale, "The ECG network did not answer.", "Сеть ЭКГ не ответила."),
    };
  }
  const measured = parsed.measurements;
  const measurements = measured?.available === true && Array.isArray(measured.lines) ? {
    method: String(measured.method ?? '').slice(0, 180),
    description: String(measured.description ?? '').slice(0, 2200),
    note: String(measured.note ?? '').slice(0, 1800),
    lines: measured.lines.slice(0, 28).flatMap(row => typeof row?.name === 'string' && typeof row.value === 'string' ? [{ name: row.name.slice(0, 100), value: row.value.slice(0, 350) }] : []),
  } : undefined;
  if (!parsed.ok) {
    const reason =
      parsed.code === "runner"
        ? say(locale, "The local ECGFounder interpreter could not start.", "Не удалось запустить локальный интерпретатор ECGFounder.")
        : parsed.code === "runtime" || parsed.code === "error"
        ? say(locale, "ECGFounder failed while processing the recording.", "Ошибка исполнения ECGFounder при обработке записи.")
        : parsed.code === "weights"
        ? say(locale, "The ECG network weights were not found.", "Веса сети ЭКГ не найдены.")
        : parsed.code === "signal"
          ? say(locale, "The ECG network refused this tracing.", "Сеть ЭКГ эту запись не приняла.")
          : say(locale, "The ECG network is not installed.", "Сеть ЭКГ не установлена.");
    return { source, status: "not_assessed", cleared: [], top: null, names: taskNames, reason, ...(measurements ? { measurements } : {}) };
  }
  const scores = (parsed.scores ?? []).flatMap((item) => {
    if (typeof item.label !== "string" || typeof item.score !== "number" || !Number.isFinite(item.score)) return [];
    return [{ label: item.label.trim(), score: roundScore(item.score) }];
  });
  const top = scores[0] ?? null;
  const cleared = scores.filter((item) => item.score >= NETWORK_BAR).slice(0, 5);
  return { source, status: "read", cleared, top, names: taskNames, reason: null, ...(measurements ? { measurements } : {}) };
}

export function guardStatements(statements: DraftStatement[], assessment: TracingAssessment) {
  const cleared = assessment.cleared.map((item) => item.label);
  return statements.flatMap((statement) => {
    if (statement.source?.startsWith("module:")) return [statement];
    const text = dropUnclearedClasses(statement.text, assessment.names, cleared).replace(/\b0\.\d+\b/g, "");
    if (text.length < 2) return [];
    return [{ ...statement, text }];
  });
}
