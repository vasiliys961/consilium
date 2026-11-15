import {profileModality} from "../packages/medical-images/profiles.ts";
import { inspectEcg } from "../packages/ecg/inspect.ts";
import { inspectLab, type LabFinding } from "../packages/labs/table.ts";
import { inspectProse, type ProseFinding } from "../packages/docs/prose.ts";
import { copiedConclusion, inspectGenomics, isGeneticsConclusion, type GenomicsFinding } from "../packages/genomics/inspect.ts";
import { assignFrames } from "../packages/radiology/frames.ts";
import { inspectPhoto } from "../packages/radiology/tiff.ts";
import { readSeries } from "../packages/radiology/series.ts";
import { judgeSkin, type PlaneSample } from "../packages/skin/quality.ts";
import { isUltrasoundName, openProtocol, type SonoOrder } from "../packages/sono/protocol.ts";
import { readLoop } from "../packages/sono/loop.ts";
import { readClip, type ClipFinding, type ClipNote } from "../packages/sono/clip.ts";
import { creditsFor, planCost, totalUsd, type CostStep } from "./cost.ts";
import type { ConsiliumVoice } from "./consilium.ts";
import type { SpecialistReading } from "../packages/specialists/read.ts";
import type { Interpretation } from "../packages/translator/speech.ts";
import type { VisitNote } from "../packages/protocol/note.ts";
import type { DraftStatement } from "./draft.ts";
import { localCitations, type Citation, type LocalShelfNote } from "./literature.ts";
import { moduleLocale, parseLocale, type Locale } from "./locale.ts";
import { text } from "./messages.ts";
import type { DrugLabelReview, DrugLabelSelection } from './drug-labels.ts';

export type { CostStep };

export type Modality =
  | "ecg"
  | "radiology"
  | "ultrasound"
  | "dermatology"
  | "histology"
  | "genetics"
  | "document"
  | "audio"
  | "archive"
  | "unknown";

export type GatewayProvider = "polza" | "openrouter" | "unconfigured";

export interface CaseFile {
  processingModule?:'radiology';
  librarySource?: {documentId:string;chunkId:string;title:string;page:number};
  clientId?: string;
  imageProfile?:import("../packages/medical-images/profiles.ts").ImageProfile;
  frames?: Array<{time:number;image:string}>;
  audio?: string;
  parent?: string;
  intakeNote?: string;
  name: string;
  sha256?: string;
  bytes?: number;
  image?: string;
  text?: string;
  binary?: string;
  plane?: PlaneSample;
  masks?: { x: number; y: number; width: number; height: number }[];
  series?: { total: number; opened: boolean };
  loop?: "still" | "cine" | "unread";
  clip?: ClipNote;
}

export interface PixelCover {
  source: string;
  boxes: { x: number; y: number; width: number; height: number }[];
  withheld: boolean;
}

export interface CaseReading {
  window: "dermoscopy" | "histology" | "ultrasound";
  quality: number | null;
  stain: string | null;
  magnification: null;
  scale: "absent";
  checklist: string[];
  protocolId: string | null;
  protocolTitle: string | null;
  missingViews: string[];
}

export interface ConductInput {
  drugLabels?: DrugLabelSelection[];
  imageProfile?:import("../packages/medical-images/profiles.ts").ImageProfile;
  text?: string;
  task?: import("./case-plan.ts").CaseTask;
  files?: CaseFile[];
  locale?: Locale;
  sourceLocale?: Locale;
  consilium?: boolean;
  secondOpinion?:boolean;
  attachment?: string | null;
  retain?: boolean;
  shelf?: LocalShelfNote[];
  referenceFiles?: CaseFile[];
  externalSearch?: boolean;
  speech?: { text?: string; audio?: string; audience?: "screen" | "patient"; target?: Locale };
  equipment?: { name?: string; specialty?: string };
  caseId?: string;
  deadlineMs?: number;
  draft?: { summary?: string };
  env?: Record<string, string | undefined>;
}

export interface LedgerEntry {
  clientId?: string;
  source: string;
  modality: Modality;
  status: "not_assessed" | "read" | "refused";
  reason: string | null;
  frameId: string | null;
  leads: string[];
  samples: number | null;
  samplingRate: number | null;
  sha256: string | null;
  bytes: number | null;
  reading: CaseReading | null;
  genetics: GenomicsFinding | null;
  labs: LabFinding | null;
  prose: ProseFinding | null;
  printed?: string[];
}

export interface CaseResult {
  medicationReview?: DrugLabelReview;
  validationWarnings?: string[];
  retrieval?: {localDocuments:number;passages:number;externalSearch:boolean};
  task?: import("./case-plan.ts").CaseTask;
  visualReadings?: import("../packages/vision/comprehend.ts").FrameAccount[];
  clinicalDraft?: "generated" | "unavailable";
  path: "light" | "complex";
  locale: Locale;
  draft: { status: "unsigned"; summary: string; statements: DraftStatement[]; report?: import("./clinical-report.ts").ClinicalReport; studyReports?: import('./study-report.ts').StudyReport[] };
  voices: ConsiliumVoice[];
  readings: SpecialistReading[];
  interpretation: Interpretation | null;
  ledger: LedgerEntry[];
  unassessed: string[];
  citations: Citation[];
  cost: { usageComplete?:boolean; billingComplete?:boolean; totalUsd: number; credits: number; steps: CostStep[]; calls?: Array<{model:string;inputTokens:number;outputTokens:number;durationMs:number;status:"received"|"truncated"|"failed";usageAvailable?:boolean;usd:number;billingSource?:'openrouter'|'estimate'}> };
  gateway: { provider: GatewayProvider; called: boolean };
  attachment: string | null;
  retained: boolean;
  id: string | null;
  visit: VisitNote | null;
  redactions: number;
  pixelCovers: PixelCover[];
}

const COMPLEX_TEXT =
  /dose|urgent|contraindicat|compare|comparison|доз|срочн|противопоказ|сравн/i;

export function modalityOf(name: string): Modality {
  const lower = name.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
  if ([".csv", ".edf", ".mat", ".scp"].includes(ext)) return "ecg";
  if ([".dcm", ".dicom"].includes(ext)) return "radiology";
  if ([".mp4", ".mov", ".avi"].includes(ext)) return "ultrasound";
  if ([".pdf", ".doc", ".docx", ".txt", ".md", ".xlsx", ".xls", ".json", ".xml"].includes(ext)) return "document";
  if (ext === ".zip") return "archive";
  if ([".wav", ".mp3", ".m4a", ".ogg", ".aac", ".flac"].includes(ext)) return "audio";
  if (lower.endsWith(".vcf.gz") || ext === ".vcf") return "genetics";
  if (isUltrasoundName(lower)) return "ultrasound";
  if (lower.includes("derm")) return "dermatology";
  if (/histo|histopath|histology|slide|wsi/.test(lower)) return "histology";
  if (lower.includes("biops") && [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif", ".tif", ".tiff", ".dcm", ".dicom"].includes(ext)) {
    return "histology";
  }
  if ([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif", ".tif", ".tiff", ".dcm", ".dicom"].includes(ext)) {
    return "radiology";
  }
  return "unknown";
}

function readingOf(skin: ReturnType<typeof judgeSkin>, order: SonoOrder | null, clip: ClipFinding | null): CaseReading | null {
  if (skin) {
    return {
      window: skin.window,
      quality: skin.quality,
      stain: skin.stain,
      magnification: null,
      scale: "absent",
      checklist: skin.checklist,
      protocolId: null,
      protocolTitle: null,
      missingViews: [],
    };
  }
  if (!order) return null;
  return {
    window: "ultrasound",
    quality: clip?.quality ?? null,
      stain: null,
      magnification: null,
      scale: "absent",
      checklist: [],
      protocolId: order.id,
    protocolTitle: order.title,
    missingViews: order.missing,
  };
}

export function gatewayOf(env: Record<string, string | undefined> | undefined): GatewayProvider {
  if (env?.OPENROUTER_API_KEY) return "openrouter";
  return "unconfigured";
}

function summary(locale: Locale, files: CaseFile[]): string {
  const copy = text(locale);
  const names = files.map((file) => file.name).join(", ");
  return names ? `${copy.unsigned} ${copy.files}: ${names}.` : copy.unsigned;
}

function pairWfdb(ledger: LedgerEntry[], locale: "en" | "ru"): LedgerEntry[] {
  const stems = new Map<string, { hea?: number; dat?: number }>();
  ledger.forEach((entry, index) => {
    const lower = entry.source.toLowerCase();
    const stem = lower.replace(/\.(hea|dat)$/, "");
    if (!lower.endsWith(".hea") && !lower.endsWith(".dat")) return;
    const slot = stems.get(stem) ?? {};
    if (lower.endsWith(".hea")) slot.hea = index;
    else slot.dat = index;
    stems.set(stem, slot);
  });
  const paired = ledger.map((entry) => ({ ...entry }));
  const reason = locale === "ru"
    ? "Пара WFDB в списке. Волна в этой копии не открывается."
    : "The WFDB pair is listed. The waveform is not opened in this copy.";
  for (const slot of stems.values()) {
    if (slot.hea == null || slot.dat == null) continue;
    for (const index of [slot.hea, slot.dat]) {
      paired[index] = { ...paired[index], modality: "ecg", status: "not_assessed", reason, leads: [], samples: null, samplingRate: null };
    }
  }
  return paired;
}

function fileHash(value: string | undefined): string | null {
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) return null;
  return value.toLowerCase();
}

export function conduct(input: ConductInput): CaseResult {
  const locale = parseLocale(input.locale);
  const modules = moduleLocale(locale);
  const files = input.files ?? [];
  const prepared = files.map((file) => {
    const forced=file.image&&file.imageProfile&&file.imageProfile!=="auto"?profileModality(file.imageProfile):null;
    const ecg = forced&&forced!=="ecg"?null:inspectEcg(file, modules);
    const labs = ecg||forced ? null : inspectLab(file, modules);
    const prose = ecg || labs || forced ? null : inspectProse(file, modules);
    const photo = ecg ? null : inspectPhoto(file, modules);
    const series = ecg || labs || prose || photo ? null : readSeries(file, modules);
    const loop = ecg || labs || prose || photo || series ? null : readLoop(file, modules);
    const conclusion = Boolean(prose?.paragraphs.length) && isGeneticsConclusion(file.name);
    const modality = forced??(ecg ? "ecg" : labs ? "document" : conclusion ? "genetics" : prose ? "document" : series ? "radiology" : loop ? "ultrasound" : file.imageProfile&&file.imageProfile!=="auto"?profileModality(file.imageProfile):modalityOf(file.name));
    const skin = (modality === "dermatology" || modality === "histology") && !photo ? judgeSkin({...file,name:file.imageProfile==='dermatoscopy'?`derm-${file.name}`:(file.imageProfile==='histology'||file.imageProfile==='blood-smear')?`histo-${file.name}`:file.name}, modules) : null;
    const order = modality === "ultrasound" && loop?.kind !== "cine" && loop?.kind !== "unread" ? openProtocol(file.name, modules) : null;
    const clip = modality === "ultrasound" && !loop ? readClip(file, modules) : null;
    const genomics = conclusion ? copiedConclusion(modules) : modality === "genetics" ? inspectGenomics(file, modules) : null;
    return { file, ecg, modality, skin, order, genomics, labs, prose, photo, series, loop, clip };
  });
  const frames = assignFrames(
    prepared.map((item) => {
      if (item.series) return item.series.opened ? "series.dcm" : "skip";
      return item.modality === "radiology" && !item.photo ? item.file.name : "skip";
    }),
    modules,
  );
  const ledger: LedgerEntry[] = prepared.map((item, index) => {
    const frame = item.modality === "radiology" ? frames[index] : null;
    return {
      source: item.file.name,
      ...(item.file.clientId && /^[a-f0-9-]{36}$/i.test(item.file.clientId) ? {clientId:item.file.clientId} : {}),
      modality: item.modality,
      status: item.ecg?.status ?? item.labs?.status ?? item.prose?.status ?? item.photo?.status ?? item.skin?.status ?? item.genomics?.status ?? item.clip?.status ?? "not_assessed",
      reason: item.modality === "audio"
        ? text(locale).recording
        : item.genomics && item.prose?.paragraphs.length
          ? [item.genomics.reason, item.prose.reason].filter(Boolean).join(" ")
          : item.ecg?.reason ?? item.labs?.reason ?? item.prose?.reason ?? item.photo?.reason ?? item.series?.reason ?? (item.loop && item.loop.kind !== "still" ? item.loop.reason : null) ?? item.skin?.reason ?? item.genomics?.reason ?? item.clip?.reason ?? item.order?.reason ?? frame?.reason ?? null,
      frameId: frame?.id ?? null,
      leads: item.ecg?.leads ?? [],
      samples: item.ecg?.samples ?? null,
      samplingRate: item.ecg?.samplingRate ?? null,
      sha256: fileHash(item.file.sha256),
      bytes: Number.isFinite(item.file.bytes) && (item.file.bytes ?? 0) >= 0 ? Math.floor(item.file.bytes ?? 0) : null,
      reading: readingOf(item.skin, item.order, item.clip),
      genetics: item.genomics,
      labs: item.labs,
      prose: item.prose,
    };
  });
  const paired = pairWfdb(ledger, modules);
  const modalities = new Set(
    paired
      .map((entry) => entry.modality)
      .filter((modality) => modality !== "unknown" && modality !== "archive" && modality !== "audio"),
  );
  const complex =
    input.consilium === true ||
    COMPLEX_TEXT.test(input.text ?? "") ||
    modalities.size >= 2;
  const path = complex ? "complex" : "light";
  const steps: CostStep[] = planCost(path, paired.map((entry) => entry.modality));

  return {
    path,
    locale,
    draft: { status: "unsigned", summary: summary(locale, files), statements: [] },
    voices: [],
    readings: [],
    interpretation: null,
    ledger: paired,
    unassessed: paired.filter((entry) => entry.status !== "read").map((entry) => entry.source),
    citations: localCitations(input.shelf, new Date().toISOString().slice(0, 10)),
    cost: { totalUsd: totalUsd(steps), credits: creditsFor(totalUsd(steps)), steps },
    gateway: { provider: gatewayOf(input.env), called: false },
    attachment: input.attachment ?? null,
    retained: input.retain === true,
    id: null,
    visit: null,
    redactions: 0,
    pixelCovers: [],
  };
}
