import type { GenomicsFinding } from "./inspect.ts";

const SEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const SUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";

const RU: Record<string, string> = {
  pathogenic: "патогенный",
  "likely pathogenic": "вероятно патогенный",
  "uncertain significance": "неопределённое значение",
  "likely benign": "вероятно доброкачественный",
  benign: "доброкачественный",
  "conflicting interpretations of pathogenicity": "противоречивые оценки",
};

export interface ClinvarNote {
  status: "found" | "absent" | "unavailable";
  significance: string | null;
  stars: number | null;
  conflict: boolean;
  line: string;
}

function say(locale: "en" | "ru", en: string, ru: string) {
  return locale === "ru" ? ru : en;
}

export function clinvarTerm(text: string, gene: string | null) {
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const [chrom, pos, id] = line.split("\t");
    const name = (id ?? "").trim();
    if (/^rs\d+$/i.test(name)) return name;
    const contig = (chrom ?? "").replace(/^chr/i, "");
    const position = Number(pos);
    if (gene && contig && Number.isInteger(position)) return `${gene}[gene] AND ${contig}[chr] AND ${position}[chrpos38]`;
    return null;
  }
  return null;
}

function starsOf(review: string, description: string) {
  const text = review.toLowerCase();
  const conflict = (text.includes("conflict") && !text.includes("no conflict")) || description.toLowerCase().includes("conflict");
  if (text.includes("practice guideline")) return { stars: 4, conflict };
  if (text.includes("expert panel")) return { stars: 3, conflict };
  if (text.includes("multiple submitters") && text.includes("no conflict")) return { stars: 2, conflict };
  if (text.includes("single submitter") || text.includes("conflicting")) return { stars: 1, conflict };
  if (text.includes("no assertion") || text.includes("no classification")) return { stars: 0, conflict };
  return { stars: null, conflict };
}

function lineOf(locale: "en" | "ru", note: Omit<ClinvarNote, "line">, klass: string) {
  if (note.status === "absent") {
    return say(locale, "ClinVar has no record. That is not evidence for or against the class.", "В ClinVar записи нет. Это не довод за класс и не довод против.");
  }
  if (note.status !== "found") {
    return say(locale, "ClinVar did not answer. The class is unchanged.", "ClinVar не ответил. Класс не меняется.");
  }
  const opinion = (locale === "ru" ? RU[(note.significance ?? "").toLowerCase()] : note.significance) || note.significance || say(locale, "an unstated opinion", "оценка без формулировки");
  const stars = note.stars === null
    ? say(locale, "stars not stated", "звёзды не указаны")
    : say(locale, `${note.stars} of 4 stars`, `${note.stars} из 4 звёзд`);
  const conflict = note.conflict ? say(locale, " The ClinVar opinions disagree.", " Мнения в ClinVar расходятся.") : "";
  const kept = klass || say(locale, "not assigned", "не присвоен");
  return say(
    locale,
    `ClinVar leans toward "${opinion}", ${stars}.${conflict} That line does not change our class, which stays "${kept}".`,
    `ClinVar склоняется к «${opinion}», ${stars}.${conflict} Чужую строку в наш класс не переношу: у нас по-прежнему «${kept}».`,
  );
}

export function readClinvar(payload: { ids?: string[]; summary?: unknown }, locale: "en" | "ru", klass: string): ClinvarNote {
  const ids = payload.ids ?? [];
  if (!ids.length) return finish(locale, { status: "absent", significance: null, stars: null, conflict: false }, klass);
  const result = payload.summary && typeof payload.summary === "object" ? payload.summary as { result?: Record<string, unknown> } : {};
  const item = (result.result?.[ids[0] ?? ""] ?? {}) as {
    germline_classification?: { description?: string; review_status?: string };
    clinical_significance?: { description?: string; review_status?: string };
  };
  const description = item.germline_classification?.description || item.clinical_significance?.description || null;
  const review = item.germline_classification?.review_status || item.clinical_significance?.review_status || "";
  const stars = starsOf(review, description ?? "");
  return finish(locale, { status: "found", significance: description, stars: stars.stars, conflict: stars.conflict }, klass);
}

function finish(locale: "en" | "ru", note: Omit<ClinvarNote, "line">, klass: string): ClinvarNote {
  return { ...note, line: lineOf(locale, note, klass) };
}

async function ncbi(url: string, params: Record<string, string>, fetchImpl: typeof fetch) {
  const query = new URLSearchParams(params);
  const key = process.env.NCBI_API_KEY?.trim();
  if (key) query.set("api_key", key);
  const response = await fetchImpl(`${url}?${query}`, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) return null;
  return response.json() as Promise<unknown>;
}

export async function lookupClinvar(term: string, locale: "en" | "ru", klass: string, fetchImpl: typeof fetch = fetch): Promise<ClinvarNote> {
  const search = await ncbi(SEARCH, { db: "clinvar", term, retmode: "json", retmax: "1" }, fetchImpl).catch(() => null);
  const ids = search && typeof search === "object" ? ((search as { esearchresult?: { idlist?: string[] } }).esearchresult?.idlist ?? []) : null;
  if (!ids) return finish(locale, { status: "unavailable", significance: null, stars: null, conflict: false }, klass);
  if (!ids.length) return readClinvar({ ids }, locale, klass);
  const summary = await ncbi(SUMMARY, { db: "clinvar", id: ids[0] ?? "", retmode: "json" }, fetchImpl).catch(() => null);
  if (!summary) return finish(locale, { status: "unavailable", significance: null, stars: null, conflict: false }, klass);
  return readClinvar({ ids, summary }, locale, klass);
}

export async function applyClinvar(finding: GenomicsFinding, text: string, locale: "en" | "ru", fetchImpl: typeof fetch = fetch): Promise<GenomicsFinding> {
  const term = clinvarTerm(text, finding.gene);
  if (!term) return { ...finding, clinvar: null };
  const clinvar = await lookupClinvar(term, locale, finding.acmg?.label ?? "", fetchImpl).catch(() =>
    finish(locale, { status: "unavailable", significance: null, stars: null, conflict: false }, finding.acmg?.label ?? ""),
  );
  return { ...finding, acmg: finding.acmg, clinvar };
}
