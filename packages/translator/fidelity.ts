import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Locale } from "../../lib/locale.ts";

/** Compares a source utterance with a finished translation. It does not rewrite the source. */

export type FidelityCode = "dose" | "number" | "negation" | "term" | "drug";

export interface FidelityFinding {
  severity: "critical" | "important";
  code: FidelityCode;
  detail: string;
}

export interface FidelityReport {
  source: string;
  findings: FidelityFinding[];
}

const DOSE_UNITS: Record<string, string> = {
  мг: "mg",
  mg: "mg",
  мкг: "mcg",
  mcg: "mcg",
  мл: "ml",
  ml: "ml",
  г: "g",
  g: "g",
};

const WORDS: Record<string, string> = {
  один: "1",
  одна: "1",
  one: "1",
  два: "2",
  две: "2",
  two: "2",
  twice: "2",
  три: "3",
  three: "3",
  thrice: "3",
  четыре: "4",
  four: "4",
  пять: "5",
  five: "5",
  шесть: "6",
  six: "6",
  семь: "7",
  seven: "7",
  восемь: "8",
  eight: "8",
  девять: "9",
  nine: "9",
  десять: "10",
  ten: "10",
};

const DRUG_CATEGORIES = new Set(["drugs", "medicines"]);
const TERM_CATEGORIES = new Set(["terms", "symptoms", "diagnoses", "examinations", "anatomy", "care"]);

interface GlossaryRow {
  id: string;
  forms: string[];
}

let glossaryCache: { drugs: GlossaryRow[]; terms: GlossaryRow[] } | null = null;

function glossary() {
  if (glossaryCache) return glossaryCache;
  const file = JSON.parse(readFileSync(join(process.cwd(), "packages", "translator", "glossary.json"), "utf8")) as {
    entries: Array<{ id: string; category: string; terms: Record<string, string> }>;
  };
  const drugs: GlossaryRow[] = [];
  const terms: GlossaryRow[] = [];
  for (const entry of file.entries) {
    const forms = [...new Set(Object.values(entry.terms).map((form) => form.trim()).filter((form) => normalize(form).length > 2))];
    if (!forms.length) continue;
    const row = { id: entry.id, forms };
    if (DRUG_CATEGORIES.has(entry.category)) drugs.push(row);
    else if (TERM_CATEGORIES.has(entry.category)) terms.push(row);
  }
  glossaryCache = { drugs, terms };
  return glossaryCache;
}

const NEGATION = ["никогда", "отрицает", "без", "не было", "не", "нет", "never", "denies", "denied", "without", "not", "no"];

interface Amount {
  value: string;
  unit: string | null;
}

function normalize(text: string) {
  return text.toLowerCase().replace(/ё/g, "е").replace(/(\d),(\d)/g, "$1.$2");
}

function canon(token: string) {
  const word = WORDS[normalize(token)];
  if (word) return word;
  const parsed = Number(token);
  if (!Number.isFinite(parsed)) return "";
  return String(Math.round(parsed * 1000) / 1000);
}

function amounts(text: string): Amount[] {
  const normalized = normalize(text);
  const found: Amount[] = [];
  const taken: Array<[number, number]> = [];
  const claim = (start: number, end: number, value: string, unit: string | null) => {
    if (!value || taken.some(([from, to]) => start < to && end > from)) return;
    taken.push([start, end]);
    found.push({ value, unit });
  };
  const dose = /(\d+(?:\.\d+)?)\s*(мкг|мг|мл|mcg|mg|ml|г|g)(?=$|[^\p{L}\p{N}])/giu;
  for (const match of normalized.matchAll(dose)) {
    const start = match.index ?? 0;
    claim(start, start + match[0].length, canon(match[1] ?? ""), DOSE_UNITS[normalize(match[2] ?? "")] ?? null);
  }
  const words = Object.keys(WORDS).sort((left, right) => right.length - left.length).join("|");
  const bare = new RegExp(`(?:${words}|\\d+(?:\\.\\d+)?)`, "giu");
  for (const match of normalized.matchAll(bare)) {
    const start = match.index ?? 0;
    claim(start, start + match[0].length, canon(match[0]), null);
  }
  return found;
}

function hasForm(text: string, form: string) {
  const normalized = normalize(text);
  const needle = normalize(form);
  if (needle.length <= 3) return new RegExp(`(?:^|[^\\p{L}\\p{N}])${needle}(?=$|[^\\p{L}\\p{N}])`, "iu").test(normalized);
  return normalized.includes(needle);
}

function present(text: string, forms: readonly string[]) {
  return forms.some((form) => hasForm(text, form));
}

function negated(text: string) {
  const normalized = normalize(text);
  return NEGATION.some((cue) => hasForm(normalized, cue));
}

export function checkFidelity(source: string, translation: string): FidelityReport {
  const findings: FidelityFinding[] = [];
  const left = amounts(source);
  const right = amounts(translation);
  const used = new Set<number>();
  for (const item of left) {
    const index = right.findIndex((other, position) => !used.has(position) && other.value === item.value && other.unit === item.unit);
    if (index >= 0) {
      used.add(index);
      continue;
    }
    findings.push({
      severity: "critical",
      code: item.unit ? "dose" : "number",
      detail: item.unit ? `${item.value} ${item.unit}` : item.value,
    });
  }
  const book = glossary();
  const anchor = [...book.drugs, ...book.terms].some((entry) => present(source, entry.forms) || present(translation, entry.forms));
  if (anchor && negated(source) !== negated(translation)) {
    findings.push({ severity: "critical", code: "negation", detail: negated(source) ? "dropped" : "added" });
  }
  for (const drug of book.drugs) {
    const inSource = present(source, drug.forms);
    const inTranslation = present(translation, drug.forms);
    if (inSource && !inTranslation) findings.push({ severity: "critical", code: "drug", detail: `dropped:${drug.id}` });
    if (!inSource && inTranslation) findings.push({ severity: "critical", code: "drug", detail: `invented:${drug.id}` });
  }
  for (const term of book.terms) {
    if (present(source, term.forms) && !present(translation, term.forms)) {
      findings.push({ severity: "important", code: "term", detail: term.id });
    }
  }
  return { source, findings };
}

export function targetLanguage(source: string, locale: Locale, audience: "screen" | "patient"): Locale {
  if (audience === "patient") return /[а-яё]/i.test(source) ? "en" : "ru";
  return locale;
}
