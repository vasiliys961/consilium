/** ACMG-AMP 2015 combining table. PM2 stays supporting. A class is shown only when a rule matches. */

export type AcmgClass =
  | "pathogenic"
  | "likely_pathogenic"
  | "uncertain_significance"
  | "likely_benign"
  | "benign";

type Bucket = "vs" | "strong" | "moderate" | "supporting" | "stand_alone" | "benign_strong" | "benign_supporting";

interface Criterion {
  code: string;
  bucket: Bucket;
}

interface Rule {
  id: string;
  classification: AcmgClass;
  vs?: number;
  strong?: number;
  moderate?: number;
  supporting?: number;
  stand_alone?: number;
  benign_strong?: number;
  benign_supporting?: number;
}

const PATHOGENIC: Rule[] = [
  { id: "P1a", classification: "pathogenic", vs: 1, strong: 1 },
  { id: "P1b", classification: "pathogenic", vs: 1, moderate: 2 },
  { id: "P1c", classification: "pathogenic", vs: 1, moderate: 1, supporting: 1 },
  { id: "P1d", classification: "pathogenic", vs: 1, supporting: 2 },
  { id: "P2", classification: "pathogenic", strong: 2 },
  { id: "P3a", classification: "pathogenic", strong: 1, moderate: 3 },
  { id: "P3b", classification: "pathogenic", strong: 1, moderate: 2, supporting: 2 },
  { id: "P3c", classification: "pathogenic", strong: 1, moderate: 1, supporting: 4 },
];

const LIKELY_PATHOGENIC: Rule[] = [
  { id: "LP1", classification: "likely_pathogenic", vs: 1, moderate: 1 },
  { id: "LP2", classification: "likely_pathogenic", strong: 1, moderate: 1 },
  { id: "LP3", classification: "likely_pathogenic", strong: 1, supporting: 2 },
  { id: "LP4", classification: "likely_pathogenic", moderate: 3 },
  { id: "LP5", classification: "likely_pathogenic", moderate: 2, supporting: 2 },
  { id: "LP6", classification: "likely_pathogenic", moderate: 1, supporting: 4 },
];

const BENIGN: Rule[] = [
  { id: "B1", classification: "benign", stand_alone: 1 },
  { id: "B2", classification: "benign", benign_strong: 2 },
];

const LIKELY_BENIGN: Rule[] = [
  { id: "LB1", classification: "likely_benign", benign_strong: 1, benign_supporting: 1 },
  { id: "LB2", classification: "likely_benign", benign_supporting: 2 },
];

const CATALOG: Record<string, Bucket> = {
  PVS1: "vs",
  PS1: "strong",
  PS2: "strong",
  PS3: "strong",
  PS4: "strong",
  PM1: "moderate",
  PM3: "moderate",
  PM4: "moderate",
  PM5: "moderate",
  PM6: "moderate",
  PM2: "supporting",
  PP1: "supporting",
  PP2: "supporting",
  PP3: "supporting",
  PP4: "supporting",
  PP5: "supporting",
  BA1: "stand_alone",
  BS1: "benign_strong",
  BS2: "benign_strong",
  BS3: "benign_strong",
  BS4: "benign_strong",
  BP1: "benign_supporting",
  BP2: "benign_supporting",
  BP3: "benign_supporting",
  BP4: "benign_supporting",
  BP5: "benign_supporting",
  BP6: "benign_supporting",
  BP7: "benign_supporting",
};

const LABELS: Record<AcmgClass, { en: string; ru: string }> = {
  pathogenic: { en: "Pathogenic", ru: "Патогенный" },
  likely_pathogenic: { en: "Likely pathogenic", ru: "Вероятно патогенный" },
  uncertain_significance: { en: "Uncertain significance", ru: "Неопределённое значение" },
  likely_benign: { en: "Likely benign", ru: "Вероятно доброкачественный" },
  benign: { en: "Benign", ru: "Доброкачественный" },
};

export interface AcmgCall {
  classification: AcmgClass;
  label: string;
  ruleId: string;
  criteria: string[];
}

function say(locale: "en" | "ru", en: string, ru: string) {
  return locale === "ru" ? ru : en;
}

function normalize(code: string) {
  const token = code.trim().toUpperCase().replace(/[\s_-]/g, "");
  if (token === "PM2SUPPORTING") return "PM2";
  return token;
}

export function combineAcmg(codes: readonly string[], locale: "en" | "ru" = "en"): AcmgCall {
  const seen = new Set<string>();
  const counts: Record<Bucket, number> = {
    vs: 0,
    strong: 0,
    moderate: 0,
    supporting: 0,
    stand_alone: 0,
    benign_strong: 0,
    benign_supporting: 0,
  };
  const criteria: string[] = [];
  for (const code of codes) {
    const name = normalize(code);
    if (!CATALOG[name]) throw new Error(`unknown ACMG criterion: ${code}`);
    if (seen.has(name)) throw new Error(`duplicate ACMG criterion: ${name}`);
    seen.add(name);
    criteria.push(name);
    counts[CATALOG[name]] += 1;
  }
  const pathogenic = [...PATHOGENIC, ...LIKELY_PATHOGENIC].find((rule) => matches(rule, counts));
  const benign = [...BENIGN, ...LIKELY_BENIGN].find((rule) => matches(rule, counts));
  if (pathogenic && benign) {
    return call("uncertain_significance", "VUS-conflict", criteria, locale);
  }
  if (pathogenic) return call(pathogenic.classification, pathogenic.id, criteria, locale);
  if (benign) return call(benign.classification, benign.id, criteria, locale);
  return call("uncertain_significance", "VUS-unmet", criteria, locale);
}

function matches(rule: Rule, counts: Record<Bucket, number>) {
  return (
    counts.vs >= (rule.vs ?? 0) &&
    counts.strong >= (rule.strong ?? 0) &&
    counts.moderate >= (rule.moderate ?? 0) &&
    counts.supporting >= (rule.supporting ?? 0) &&
    counts.stand_alone >= (rule.stand_alone ?? 0) &&
    counts.benign_strong >= (rule.benign_strong ?? 0) &&
    counts.benign_supporting >= (rule.benign_supporting ?? 0)
  );
}

function call(classification: AcmgClass, ruleId: string, criteria: string[], locale: "en" | "ru"): AcmgCall {
  return { classification, label: LABELS[classification][locale], ruleId, criteria };
}

export function criteriaError(error: unknown, locale: "en" | "ru") {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("duplicate")) {
    return say(locale, "A criterion was repeated, so no class was assigned.", "Критерий повторён, поэтому класс не присвоен.");
  }
  return say(locale, "A criterion is not in the ACMG table, so no class was assigned.", "Критерия нет в таблице ACMG, поэтому класс не присвоен.");
}

export interface Passport {
  gene: string | null;
  callable: boolean;
  proposed: string | null;
}

/** A diplotype is kept only when the passport is callable and a call was supplied. Nothing is invented. */
export function assignDiplotype(passport: Passport): { gene: string | null; diplotype: string | null } {
  const proposed = passport.proposed?.trim() ?? "";
  if (!passport.callable || !proposed) return { gene: passport.gene, diplotype: null };
  return { gene: passport.gene, diplotype: proposed };
}
