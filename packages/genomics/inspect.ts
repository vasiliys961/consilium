import {parseVcf,type VcfReview} from "./variants.ts";
import { assignDiplotype, combineAcmg, criteriaError, type AcmgCall } from "./acmg.ts";
import type { ClinvarNote } from "./clinvar.ts";
import type { FrequencyNote } from "./frequency.ts";
import { diplotypeFromBases } from "./alleles.ts";
import { loadSnapshot, panelGene, phenotypeOf, type PanelGene } from "./cpic.ts";

export interface GenomicsFinding {
  review?: VcfReview;
  status: "read" | "refused" | "not_assessed";
  reason: string | null;
  acmg: AcmgCall | null;
  gene: string | null;
  diplotype: string | null;
  panel: PanelGene | null;
  phenotype: string | null;
  frequency: FrequencyNote | null;
  clinvar: ClinvarNote | null;
}

function say(locale: "en" | "ru", en: string, ru: string) {
  return locale === "ru" ? ru : en;
}

function header(text: string, name: string) {
  const match = text.match(new RegExp(`^##doctor-opus-${name}=([^\\n\\r]+)$`, "im"));
  return match?.[1]?.trim() ?? "";
}

export function isGeneticsConclusion(name: string): boolean {
  const base = name.toLowerCase().split(/[/\\]/).pop() ?? "";
  if (!base.endsWith(".pdf")) return false;
  return /(?:^|[^a-z0-9а-яё])(?:ngs|acmg|genomics|genomic|genetics|genetic|генетическ\p{L}*|геном\p{L}*)(?![a-z0-9а-яё])/iu.test(base);
}

export function copiedConclusion(locale: "en" | "ru" = "en"): GenomicsFinding {
  return {
    status: "read",
    reason: say(
      locale,
      "The written conclusion was copied. No ACMG class was assigned from it.",
      "Письменное заключение скопировано. Класс ACMG из него не присвоен.",
    ),
    acmg: null,
    gene: null,
    diplotype: null,
    panel: null,
    phenotype: null,
    frequency: null,
    clinvar: null,
  };
}

export function inspectGenomics(
  file: { name: string; text?: string },
  locale: "en" | "ru" = "en",
): GenomicsFinding | null {
  const base = file.name.toLowerCase().split(/[/\\]/).pop() ?? "";
  const compressed = base.endsWith(".vcf.gz");
  if (!base.endsWith(".vcf") && !compressed) return null;
  const text = file.text ?? "";
  if (compressed && !text.trim()) {
    return {
      status: "not_assessed",
      reason: say(locale, "The compressed VCF did not open.", "Сжатый VCF не открылся."),
      acmg: null,
      gene: null,
      diplotype: null,
      panel: null,
      phenotype: null,
      frequency: null,
      clinvar: null,
    };
  }
  const review=parseVcf(text,locale);
  const rawCriteria = header(text, "acmg");
  const genes=[...new Set(review?.variants.map(v=>v.gene).filter(Boolean)??[])];
  const gene = header(text, "gene") || (genes.length===1?genes[0]:null) || null;
  const callable = header(text, "callable").toLowerCase() === "yes";
  const proposed = header(text, "diplotype");
  const fromBases = callable ? diplotypeFromBases(loadSnapshot(), gene, text) : undefined;
  const diplotype = fromBases !== undefined ? fromBases : assignDiplotype({ gene, callable, proposed: proposed || null }).diplotype;
  const panel = panelGene(gene);
  const phenotype = phenotypeOf(loadSnapshot(), gene, diplotype)?.phenotype ?? null;
  if (!rawCriteria && review) {
    return {status:"read",reason:locale==="ru"?`VCF прочитан: ${review.records} записей, ${review.variants.length} альтернативных аллелей для рассмотрения; сборка ${review.build}. Оценки приведены отдельно для каждого варианта.`:`VCF read: ${review.records} records, ${review.variants.length} alternate alleles for review; build ${review.build}. Each variant is assessed separately.`,
      acmg:review.variants.length===1?review.variants[0].acmg:null,gene,diplotype,panel,phenotype,frequency:null,clinvar:null,review};
  }
  if (!rawCriteria) {
    return {status:"not_assessed",reason:locale==="ru"?"VCF не содержит корректного заголовка #CHROM и таблицы вариантов.":"VCF has no valid #CHROM header and variant table.",acmg:null,gene,diplotype,panel,phenotype,frequency:null,clinvar:null};
  }
  try {
    const acmg = combineAcmg(rawCriteria.split(","), locale);
    return { status: "read", reason: null, acmg, gene, diplotype, panel, phenotype, frequency: null, clinvar: null, ...(review?{review}: {}) };
  } catch (error) {
    return { status: "refused", reason: criteriaError(error, locale), acmg: null, gene, diplotype: null, panel, phenotype: null, frequency: null, clinvar: null };
  }
}

export function geneticsCaution(
  entries: ReadonlyArray<{ modality: string; genetics: { acmg: { classification: string; label: string; ruleId: string } | null; diplotype: string | null; phenotype: string | null; review?: VcfReview; frequency: { af: number | null } | null; clinvar: { line: string } | null } | null }>,
  locale: "en" | "ru",
) {
  const rows = entries.filter((entry) => entry.modality === "genetics" && entry.genetics);
  if (rows.length === 0) return null;
  if(rows.some(entry=>entry.genetics?.review))return say(locale,"VCF reading and ACMG classification are separate. Use only the per-allele module classifications in the case record; never assign one class to the entire VCF or mistake missing criteria for an unreadable file. Embedded database annotations are not independently confirmed classifications.","Чтение VCF и классификация ACMG — разные этапы. Используй только результаты для отдельных аллелей из записи модуля; не присваивай один класс всему VCF и не считай отсутствие критериев ошибкой чтения. Встроенная аннотация базы не является независимо подтверждённой классификацией.");
  const fixed = rows.flatMap((entry) => {
    const parts = [];
    if (entry.genetics?.acmg) parts.push(`${entry.genetics.acmg.label} (${entry.genetics.acmg.ruleId})`);
    if (entry.genetics?.diplotype) parts.push(entry.genetics.diplotype);
    if (entry.genetics?.phenotype) parts.push(entry.genetics.phenotype);
    if (entry.genetics?.frequency?.af != null) parts.push(`gnomAD ${entry.genetics.frequency.af}`);
    if (entry.genetics?.clinvar?.line) parts.push(entry.genetics.clinvar.line);
    return parts;
  });
  if (fixed.length === 0) {
    return say(
      locale,
      "No ACMG class or diplotype was assigned. Do not invent one.",
      "Класс ACMG и диплотип не присвоены. Не выдумывай их.",
    );
  }
  return say(
    locale,
    `Keep these module results unchanged: ${fixed.join("; ")}.`,
    `Эти результаты модуля не меняй: ${fixed.join("; ")}.`,
  );
}
