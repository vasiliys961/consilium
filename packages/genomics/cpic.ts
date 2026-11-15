import { readFileSync } from "node:fs";
import { join } from "node:path";
import { settleAction, type DraftStatement } from "../../lib/draft.ts";
import { moduleLocale, type Locale } from "../../lib/locale.ts";

const ALIASES: Record<string, string> = {
  клопидогрел: "clopidogrel",
  варфарин: "warfarin",
  кодеин: "codeine",
  трамадол: "tramadol",
  азатиоприн: "azathioprine",
  меркаптопурин: "mercaptopurine",
  такролимус: "tacrolimus",
  симвастатин: "simvastatin",
  аторвастатин: "atorvastatin",
  фторурацил: "fluorouracil",
  капецитабин: "capecitabine",
  ивакафтор: "ivacaftor",
  эсциталопрам: "escitalopram",
  сертралин: "sertraline",
  вориконазол: "voriconazole",
  фенитоин: "phenytoin",
  омепразол: "omeprazole",
};

export interface CpicVariant {
  chrom: string;
  pos: number;
  ref: string;
}

export interface CpicAllele {
  name: string;
  bases: string[];
}

export interface CpicSnapshot {
  version?: string;
  phenotypes?: Record<string, { diplotypes?: Record<string, { phenotype?: string | null; activity_score?: string | null }> }>;
  drugs?: Record<string, CpicRow[]>;
  genes?: Record<string, { variants: CpicVariant[]; alleles: CpicAllele[] }>;
}

interface CpicRow {
  population?: string | null;
  lookup?: Array<Record<string, string>>;
  strength?: string;
  text?: string;
  guideline_id?: string;
}

export interface PanelGene {
  symbol: string;
  phenotype: string;
  report: string;
}

interface PanelFile {
  version: string;
  genes: PanelGene[];
}

let snapshotCache: CpicSnapshot | null | undefined;
let panelCache: PanelFile | null | undefined;

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export function loadSnapshot(): CpicSnapshot | null {
  if (snapshotCache !== undefined) return snapshotCache;
  const path = process.env.CPIC_SNAPSHOT || join(process.cwd(), "packages", "genomics", "cpic_snapshot.json");
  snapshotCache = readJson<CpicSnapshot>(path);
  return snapshotCache;
}

export function loadPanel(): PanelFile | null {
  if (panelCache !== undefined) return panelCache;
  panelCache = readJson<PanelFile>(join(process.cwd(), "packages", "genomics", "sf_v3_3.json"));
  return panelCache;
}

export function panelGene(symbol: string | null): PanelGene | null {
  if (!symbol) return null;
  const panel = loadPanel();
  return panel?.genes.find((gene) => gene.symbol.toUpperCase() === symbol.toUpperCase()) ?? null;
}

export function namedDrug(note: string, drugs: string[]) {
  const lower = note.toLowerCase();
  for (const [alias, name] of Object.entries(ALIASES)) {
    if (lower.includes(alias) && drugs.includes(name)) return name;
  }
  const ordered = [...drugs].sort((left, right) => right.length - left.length);
  for (const drug of ordered) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${drug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu");
    if (pattern.test(note)) return drug;
  }
  return null;
}

export function phenotypeOf(snapshot: CpicSnapshot | null, gene: string | null, diplotype: string | null) {
  if (!snapshot || !gene || !diplotype) return null;
  const row = snapshot.phenotypes?.[gene]?.diplotypes?.[diplotype];
  if (!row) return null;
  return { phenotype: row.phenotype ?? null, activityScore: row.activity_score ?? null };
}

function specificity(clause: Record<string, string>, gene: string, phenotype: string | null, score: string | null) {
  let matched = 0;
  for (const [key, expected] of Object.entries(clause)) {
    if (key !== gene) return null;
    if (expected === "Any Result") {
      if (!phenotype && !score) return null;
      continue;
    }
    if (expected === "No Result") return null;
    if (expected !== phenotype && expected !== score) return null;
    matched += 1;
  }
  return matched;
}

export function copyRecommendation(
  snapshot: CpicSnapshot | null,
  input: { gene: string | null; diplotype: string | null; note: string },
) {
  const phenotype = phenotypeOf(snapshot, input.gene, input.diplotype);
  if (!snapshot?.drugs || !input.gene || !input.diplotype || !phenotype?.phenotype) return null;
  const drug = namedDrug(input.note, Object.keys(snapshot.drugs));
  if (!drug) return null;
  const ranked: Array<{ specificity: number; text: string; strength: string; guidelineId: string }> = [];
  for (const row of snapshot.drugs[drug] ?? []) {
    if (!row.text || !row.strength || !row.guideline_id) continue;
    const scores = (row.lookup ?? []).flatMap((clause) => {
      const score = specificity(clause, input.gene as string, phenotype.phenotype, phenotype.activityScore);
      return score === null ? [] : [score];
    });
    if (!scores.length) continue;
    ranked.push({ specificity: Math.max(...scores), text: row.text, strength: row.strength, guidelineId: row.guideline_id });
  }
  if (!ranked.length) return null;
  const best = Math.max(...ranked.map((row) => row.specificity));
  const top = ranked.filter((row) => row.specificity === best);
  const texts = new Set(top.map((row) => row.text));
  const strengths = new Set(top.map((row) => row.strength));
  if (texts.size !== 1 || strengths.size !== 1) return null;
  return { drug, strength: top[0]?.strength ?? "", text: top[0]?.text ?? "", guidelineId: top[0]?.guidelineId ?? "", phenotype: phenotype.phenotype };
}

export function cpicStatement(
  snapshot: CpicSnapshot | null,
  input: { gene: string | null; diplotype: string | null; note: string },
  locale: Locale,
): DraftStatement | null {
  const copied = copyRecommendation(snapshot, input);
  if (!copied) return null;
  const label = moduleLocale(locale) === "ru" ? "CPIC" : "CPIC";
  return settleAction({
    text: `${label} ${copied.strength}: ${copied.text}`,
    source: `cpic:${copied.guidelineId}`,
    memory: false,
  });
}
