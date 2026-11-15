import { settleAction, type DraftStatement } from "../../lib/draft.ts";

export interface LabRow {
  name: string;
  value: string;
  unit: string | null;
  reference: string | null;
  flag: string | null;
}

export interface LabFinding {
  status: "read" | "refused" | "not_assessed";
  reason: string | null;
  rows: LabRow[];
}

const ROW_LIMIT = 100;
const LEADS = new Set(["i", "ii", "iii", "avr", "avl", "avf", "v1", "v2", "v3", "v4", "v5", "v6"]);
const NAME = new Set(["analyte", "test", "name", "parameter", "assay", "показатель", "анализ", "тест", "параметр", "наименование"]);
const VALUE = new Set(["value", "result", "результат", "значение"]);
const UNIT = new Set(["unit", "units", "единица", "единицы", "едизм", "единицаизмерения"]);
const REFERENCE = new Set(["reference", "ref", "range", "референс", "норма", "референсныезначения", "referenceinterval", "refrange"]);
const FLAG = new Set(["flag", "flags", "флаг", "отметка"]);
const JUDGED =
  /(?<![\p{L}\p{N}])(?:high|low|elevated|elevation|decreased|increased|increase|abnormal|normal|повышен\p{L}*|понижен\p{L}*|снижен\p{L}*|высок\p{L}*|низк\p{L}*|выше|ниже)(?![\p{L}\p{N}])/giu;

function say(locale: "en" | "ru", en: string, ru: string) {
  return locale === "ru" ? ru : en;
}

function token(cell: string) {
  return cell.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]/gi, "");
}

function delimiterOf(line: string) {
  const scored = [",", ";", "\t"].map((mark) => ({ mark, count: splitRow(line, mark).length }));
  return scored.sort((left, right) => right.count - left.count)[0]?.mark ?? ",";
}

function splitRow(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else quoted = false;
      } else current += char ?? "";
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      cells.push(current.trim());
      current = "";
    } else current += char ?? "";
  }
  cells.push(current.trim());
  return cells;
}

function rowsOf(text: string) {
  const source = text.replace(/^\uFEFF/, "").replace(/^# doctor-opus-extra-sheets=\d+\r?\n/, "");
  const lines = source.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter = delimiterOf(lines[0] ?? "");
  return lines.map((line) => splitRow(line, delimiter));
}

function extraSheets(text: string) {
  const match = /^# doctor-opus-extra-sheets=(\d+)/.exec(text.replace(/^\uFEFF/, ""));
  const count = Number(match?.[1] ?? 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function column(header: string[], names: Set<string>) {
  return header.findIndex((cell) => names.has(token(cell)));
}

function leadCount(header: string[]) {
  return header.filter((cell) => LEADS.has(token(cell))).length;
}

export function readLabTable(text: string, locale: "en" | "ru" = "en"): LabFinding | null {
  const headerRows = rowsOf(text);
  const header = headerRows[0] ?? [];
  if (column(header, NAME) < 0 || column(header, VALUE) < 0 || leadCount(header) >= 2) return null;
  const nameAt = column(header, NAME);
  const valueAt = column(header, VALUE);
  const unitAt = column(header, UNIT);
  const referenceAt = column(header, REFERENCE);
  const flagAt = column(header, FLAG);
  const body = headerRows.slice(1);
  if (!body.length) {
    return {
      status: "not_assessed",
      reason: say(locale, "The laboratory table has no result rows.", "В таблице лаборатории нет строк результата."),
      rows: [],
    };
  }
  if (body.some((row) => row.length !== header.length)) {
    return {
      status: "refused",
      reason: say(locale, "A laboratory row has a different column count. No value was copied.", "В строке лаборатории другое число колонок. Значение не скопировано."),
      rows: [],
    };
  }
  const blank = body.some((row) => (row[nameAt] ?? "").trim() && !(row[valueAt] ?? "").trim());
  const kept = body.slice(0, ROW_LIMIT);
  const rows = kept.flatMap((row) => {
    const name = row[nameAt] ?? "";
    if (!name) return [];
    const value = row[valueAt] ?? "";
    return [{
      name,
      value,
      unit: unitAt >= 0 && row[unitAt] ? row[unitAt] : null,
      reference: referenceAt >= 0 && row[referenceAt] ? row[referenceAt] : null,
      flag: flagAt >= 0 && row[flagAt] ? row[flagAt] : null,
    }];
  });
  const notes = [
    blank
      ? say(locale, "An empty result stays empty. No zero was written.", "Пустой результат остаётся пустым. Ноль не записан.")
      : "",
    body.length > ROW_LIMIT
      ? say(
          locale,
          `${body.length} rows were in the file. The first ${ROW_LIMIT} were copied.`,
          `В файле ${body.length} строк. Скопированы первые ${ROW_LIMIT}.`,
        )
      : "",
    extraSheets(text)
      ? say(
          locale,
          "Only the first sheet was copied.",
          "Скопирован только первый лист.",
        )
      : "",
  ].filter(Boolean);
  return { status: "read", reason: notes.join(" ") || null, rows };
}

export function isLabTable(text: string) {
  return readLabTable(text) !== null;
}

export function labLine(row: LabRow) {
  return [row.name, row.value, row.unit, row.reference ? `(${row.reference})` : "", row.flag].filter(Boolean).join(" ");
}

export function labStatements(
  entries: ReadonlyArray<{ source: string; rows: LabRow[] }>,
): DraftStatement[] {
  return entries.flatMap((entry) =>
    entry.rows.map((row) =>
      settleAction({ text: labLine(row), source: `file:${entry.source}`, memory: false }),
    ),
  );
}

export function labRecord(
  entries: ReadonlyArray<{ source: string; rows: LabRow[] }>,
  locale: "en" | "ru",
) {
  const blocks = entries.filter((entry) => entry.rows.length);
  if (!blocks.length) return null;
  const intro = say(
    locale,
    "Laboratory values are copied from the file and stay fixed beside the rest of the case. Do not change a number, a unit, or a reference. Do not call a row high or low unless that mark is copied.",
    "Лабораторные значения скопированы из файла и остаются рядом с остальными данными случая. Не меняй число, единицу и референс. Не называй строку высокой или низкой, если этой отметки нет в копии.",
  );
  const lines = blocks.flatMap((entry) => entry.rows.map((row) => `${entry.source}: ${labLine(row)}`));
  return [intro, ...lines].join("\n");
}

function numbersIn(text: string) {
  return text.match(/\d+(?:[.,]\d+)?/g) ?? [];
}

function mentions(text: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

export function scrubLabText(text: string, rows: readonly LabRow[]) {
  if (!rows.length || !text.trim()) return text;
  const parts = text.split(/(?<=[.!?])\s+/);
  const kept = parts.flatMap((part) => {
    const row = rows.find((item) => item.name && mentions(part, item.name));
    if (!row) return [part];
    const allowed = new Set(numbersIn([row.value, row.unit, row.reference, row.flag].filter(Boolean).join(" ")));
    if (numbersIn(part).some((token) => !allowed.has(token))) return [];
    const written = `${row.flag ?? ""} ${row.value}`;
    JUDGED.lastIndex = 0;
    const judged = JUDGED.test(written);
    JUDGED.lastIndex = 0;
    const next = (judged ? part : part.replace(JUDGED, "")).replace(/\s+/g, " ").replace(/\s+([,.;])/g, "$1").trim();
    return next.length > 1 ? [next] : [];
  });
  return kept.join(" ").trim();
}

export function inspectLab(
  file: { name: string; text?: string },
  locale: "en" | "ru" = "en",
): LabFinding | null {
  const base = file.name.toLowerCase().split(/[/\\]/).pop() ?? "";
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")) : "";
  if (ext === ".xls") {
    return {
      status: "refused",
      reason: say(locale, "Excel 97 is not opened.", "Excel 97 не открывается."),
      rows: [],
    };
  }
  if (ext !== ".csv" && ext !== ".xlsx") return null;
  const text = file.text ?? "";
  if (!text.trim()) {
    if (ext === ".csv") return null;
    return {
      status: "not_assessed",
      reason: say(locale, "The spreadsheet was not sent.", "Таблица не передана."),
      rows: [],
    };
  }
  const table = readLabTable(text, locale);
  if (table) return table;
  if (ext === ".csv") return null;
  return {
    status: "not_assessed",
    reason: say(locale, "This spreadsheet is not a laboratory table.", "Эта таблица не является таблицей лаборатории."),
    rows: [],
  };
}
