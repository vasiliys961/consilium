import { combineAcmg } from "./acmg.ts";
import type { GenomicsFinding } from "./inspect.ts";

const QUERY = `query VariantFrequency($variantId: String!, $dataset: DatasetId!) {
  variant(variantId: $variantId, dataset: $dataset) {
    exome { ac an ac_hom }
    genome { ac an ac_hom }
    joint { ac an homozygote_count }
  }
}`;

const BA1_MIN_AF = 0.05;
const BS1_MIN_AF = 0.01;
const PM2_MAX_AF = 0.0001;

export interface FrequencyNote {
  status: "found" | "absent" | "unavailable";
  af: number | null;
  criterion: "BA1" | "BS1" | "PM2" | null;
}

type CountBlock = { ac?: number; an?: number } | null;

export function frequencyCriterion(record: { status: FrequencyNote["status"]; af: number | null }): FrequencyNote["criterion"] {
  if (record.status === "unavailable") return null;
  if (record.status === "absent") return "PM2";
  if (record.status !== "found" || record.af === null) return null;
  if (record.af > BA1_MIN_AF) return "BA1";
  if (record.af > BS1_MIN_AF) return "BS1";
  if (record.af < PM2_MAX_AF) return "PM2";
  return null;
}

export function interpretFrequency(payload: unknown): FrequencyNote {
  const body = payload && typeof payload === "object" ? payload as { data?: { variant?: unknown }; errors?: Array<{ message?: string }> } : {};
  const variant = body.data && typeof body.data === "object" ? body.data.variant : undefined;
  if (variant && typeof variant === "object") {
    const blocks = variant as { joint?: CountBlock; exome?: CountBlock; genome?: CountBlock };
    for (const block of [blocks.joint, blocks.exome, blocks.genome]) {
      if (!block || !block.an) continue;
      const ac = Number(block.ac);
      const an = Number(block.an);
      if (!Number.isFinite(ac) || !Number.isFinite(an) || an <= 0) continue;
      const af = ac / an;
      return { status: "found", af, criterion: frequencyCriterion({ status: "found", af }) };
    }
    return { status: "unavailable", af: null, criterion: null };
  }
  const missing = (body.errors ?? []).some((item) => (item.message ?? "").toLowerCase().includes("not found"));
  if (missing) return { status: "absent", af: null, criterion: "PM2" };
  return { status: "unavailable", af: null, criterion: null };
}

function contig(chrom: string) {
  const text = chrom.replace(/^chr/i, "");
  return text.toUpperCase() === "MT" ? "M" : text;
}

export function firstVariant(text: string) {
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const [chrom, pos, , ref, alt] = line.split("\t");
    if (!chrom || !pos || !ref || !alt || alt === "." || alt.includes(",")) return null;
    const position = Number(pos);
    if (!Number.isInteger(position)) return null;
    return { id: `${contig(chrom)}-${position}-${ref.trim().toUpperCase()}-${alt.trim().toUpperCase()}` };
  }
  return null;
}

export async function lookupFrequency(variantId: string, fetchImpl: typeof fetch = fetch): Promise<FrequencyNote> {
  const response = await fetchImpl("https://gnomad.broadinstitute.org/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { variantId, dataset: "gnomad_r4" } }),
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null);
  if (!response?.ok) return { status: "unavailable", af: null, criterion: null };
  const payload = await response.json().catch(() => null);
  return interpretFrequency(payload);
}

export async function applyFrequency(
  finding: GenomicsFinding,
  text: string,
  locale: "en" | "ru",
  fetchImpl: typeof fetch = fetch,
): Promise<GenomicsFinding> {
  const variant = firstVariant(text);
  if (!variant) return { ...finding, frequency: null };
  const frequency = await lookupFrequency(variant.id, fetchImpl).catch(() => ({ status: "unavailable" as const, af: null, criterion: null }));
  if (!frequency.criterion) return { ...finding, frequency };
  const codes = [...(finding.acmg?.criteria ?? [])];
  if (codes.includes(frequency.criterion)) return { ...finding, frequency };
  try {
    const acmg = combineAcmg([...codes, frequency.criterion], locale);
    return { ...finding, status: "read", reason: null, acmg, frequency };
  } catch {
    return { ...finding, frequency: { ...frequency, criterion: null } };
  }
}
