"use client";
import {imageModelLabel} from "@/packages/medical-images/routing";
import RadiologyModule from './radiology-module';
import{CaseConnections}from'./case-connections';
import{materialRoute,materialKey,restoreMaterial,storeOriginal}from'@/lib/material-routing';
import { CitationContent, fullTextAnchor } from "@/app/components/citation-content";
import { StudyReports } from './study-reports';
import { studyReportsText } from '@/lib/study-report';
import { LanguageSwitcher } from './language-switcher';
import { SourceSuggestions } from './source-suggestions';
import { EcgGridRuler } from './ecg-grid-ruler';
import type { VisualEcgMeasurement } from '@/packages/ecg/visual-measure';
import { reviewBeforeSending } from '@/lib/privacy-client';
import Link from 'next/link';
import{useRouter}from'next/navigation';
import {GeneticExtraction} from "@/app/components/genetic-extraction";
import {UltrasoundCapture} from './ultrasound-capture';
import {ImageProfileSelect} from "@/app/components/image-profile";
import type {ImageProfile} from "@/packages/medical-images/profiles";
import {AnalysisProgress} from '@/app/components/analysis-progress';
import {requestAnalysis,requestStreamedJson,type AnalysisProgressEvent} from '@/lib/analysis-stream';
import {ReferenceInstructions} from '@/app/components/product-guide';
import {PhysicianHelp,CaseTabHint} from "@/app/components/physician-help";
import {downloadDocx} from "@/lib/download-docx";
import {summarizeModelCosts} from '@/lib/cost-audit';

import { prepareFile } from "@/lib/case-intake";
import {prepareImage,prepareVideo} from "@/lib/media-intake";
import { workflowGuide } from "@/lib/workflow-guide";
import { WorkflowGuideView } from "@/app/components/workflow-guide";
import {useWorkspaceLanguage} from "@/app/components/workspace-language";
import { GenomicReviewView } from "@/app/components/genomic-review";
import {MedicationReviewView} from './drug-label-picker';
import { ClinicalReportView } from "@/app/components/clinical-report";
import { useEffect, useMemo, useRef, useState } from "react";
import { readCases, persistCase, caseAnalysisInput, caseSignature, caseContext, caseTitle, openNewCase, type ClinicalCase } from "@/lib/casebook";
import type { CaseTask } from "@/lib/case-plan";
import type { CaseResult } from "@/lib/conductor";
import type { ActionTag } from "@/lib/draft";
import type { PixelBox } from "@/packages/intake/burned";
import { direction, LOCALES, moduleLocale, type Locale } from "@/lib/locale";
import { text } from "@/lib/messages";
import { unpackZip } from "@/packages/intake/zip";
import { isSkinName, scorePlane, type PlaneSample } from "@/packages/skin/quality";
import { ECG_LAYOUT, inspectEcg, isEcgSheet, leadPath, traceCsv, traceScale, traceXml, type EcgTrace } from "@/packages/ecg/inspect";
import { inspectLab, labLine } from "@/packages/labs/table";
import { labTextFromXlsx } from "@/packages/labs/xlsx";
import { inspectProse } from "@/packages/docs/prose";
import { textFromDocx } from "@/packages/docs/docx";
import { textFromPdf } from "@/packages/docs/pdf";
import { textFromVcfGzip } from "@/packages/genomics/vcf";
import { measureSpan, dicomLabel, parseDicom } from "@/packages/radiology/dicom";
import { closedPhotoReason, extraTiffReason, parseTiff } from "@/packages/radiology/tiff";
import { openDicomSeries, seriesReason } from "@/packages/radiology/series";
import { openProtocol } from "@/packages/sono/protocol";
import { clipGate, clipReason } from "@/packages/sono/clip";
import { loopReason } from "@/packages/sono/loop";
import { traceBinary } from "@/packages/ecg/open";
import { traceDicom } from "@/packages/ecg/wave";
import { downsample, hearReason, hearWindow, wavBase64, wavDurationSeconds } from "@/packages/translator/wav";

type LocalFile = {
  processingModule?:'radiology';
  original?:File;
  frames?: Array<{time:number;image:string}>;
  id: string;
  name: string;
  bytes: number;
  sha256: string;
  url: string;
  image: boolean;
  imageData: string | null;
  dicomWindow: string | null;
  dicomClosed: boolean;
  photoClosed: "heic" | "tiff" | null;
  tiffExtra: boolean;
  series: { total: number; opened: boolean } | null;
  loop: "still" | "cine" | "unread" | null;
  spacing: [number, number] | null;
  text: string | null;
  binary: string | null;
  pdf: boolean;
  video: boolean;
  audio: boolean;
  plane: PlaneSample | null;
  clip: { taken: number; image: string | null; plane: PlaneSample | null } | null;
  voice: { seconds: number; audio: string | null } | null;
};

function actionLabel(copy: ReturnType<typeof text>, action: ActionTag) {
  if (action === "now") return copy.actionNow;
  if (action === "only-if") return copy.actionOnlyIf;
  if (action === "avoid") return copy.actionAvoid;
  if (action === "defer") return copy.actionDefer;
  return copy.actionInformation;
}

function spread(values: number[]) {
  let sum = 0;
  for (const value of values) sum += value;
  const mean = values.length === 0 ? 0 : sum / values.length;
  let total = 0;
  for (const value of values) total += (value - mean) * (value - mean);
  return values.length === 0 ? 0 : total / values.length;
}

async function planeOf(file: File): Promise<PlaneSample | null> {
  if (!file.type.startsWith("image/") || !isSkinName(file.name)) return null;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  const crop = 64;
  const sampleWidth = Math.min(crop, bitmap.width);
  const sampleHeight = Math.min(crop, bitmap.height);
  const originX = Math.max(0, Math.floor((bitmap.width - sampleWidth) / 2));
  const originY = Math.max(0, Math.floor((bitmap.height - sampleHeight) / 2));
  const canvas = document.createElement("canvas");
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    return null;
  }
  context.drawImage(bitmap, originX, originY, sampleWidth, sampleHeight, 0, 0, sampleWidth, sampleHeight);
  const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const gray: number[] = [];
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];
  let saturation = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = (pixels[index] ?? 0) / 255;
    const green = (pixels[index + 1] ?? 0) / 255;
    const blue = (pixels[index + 2] ?? 0) / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    reds.push(red);
    greens.push(green);
    blues.push(blue);
    gray.push(0.2126 * red + 0.7152 * green + 0.0722 * blue);
    saturation += max === 0 ? 0 : (max - min) / max;
  }
  const sample = {
    width: bitmap.width,
    height: bitmap.height,
    sampleWidth,
    sampleHeight,
    gray,
    edge: [reds, greens, blues].sort((left, right) => spread(right) - spread(left))[0] ?? gray,
    saturation: saturation / (pixels.length / 4),
  };
  bitmap.close();
  return sample;
}

function planeFromCanvas(canvas: HTMLCanvasElement, width: number, height: number): PlaneSample | null {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || canvas.width < 3 || canvas.height < 3) return null;
  const sampleWidth = Math.min(64, canvas.width);
  const sampleHeight = Math.min(64, canvas.height);
  const originX = Math.max(0, Math.floor((canvas.width - sampleWidth) / 2));
  const originY = Math.max(0, Math.floor((canvas.height - sampleHeight) / 2));
  const pixels = context.getImageData(originX, originY, sampleWidth, sampleHeight).data;
  const gray: number[] = [];
  let saturation = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = (pixels[index] ?? 0) / 255;
    const green = (pixels[index + 1] ?? 0) / 255;
    const blue = (pixels[index + 2] ?? 0) / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    gray.push(0.2126 * red + 0.7152 * green + 0.0722 * blue);
    saturation += max === 0 ? 0 : (max - min) / max;
  }
  return { width, height, sampleWidth, sampleHeight, gray, saturation: saturation / (pixels.length / 4) };
}

async function sampleClip(file: File): Promise<{ taken: number; image: string | null; plane: PlaneSample | null }> {
  const empty = { taken: 0, image: null, plane: null };
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("slow")), 4000);
      video.onloadeddata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("closed"));
      };
    });
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const marks = duration > 0.2 ? [0.15, 0.5, 0.85].map((part) => Math.min(duration * part, Math.max(0, duration - 0.05))) : [0];
    const frames: { image: string; plane: PlaneSample; quality: number }[] = [];
    for (const at of marks) {
      if (duration > 0) {
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, 700);
          video.onseeked = () => {
            window.clearTimeout(timer);
            resolve();
          };
          video.currentTime = at;
        });
      }
      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      if (!sourceWidth || !sourceHeight) continue;
      const scale = Math.min(1, 480 / Math.max(sourceWidth, sourceHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL("image/jpeg", 0.72);
      const plane = planeFromCanvas(canvas, sourceWidth, sourceHeight);
      if (!plane || image.length > 1_500_000) continue;
      frames.push({ image, plane, quality: scorePlane(plane).quality });
    }
    if (!frames.length) return empty;
    frames.sort((left, right) => right.quality - left.quality);
    const best = frames[0];
    if (!best) return empty;
    return { taken: frames.length, image: clipGate(best.plane).readable ? best.image : null, plane: best.plane };
  } catch {
    return empty;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

async function hearFile(file: File): Promise<{ seconds: number; audio: string | null } | null> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData((await file.arrayBuffer()).slice(0));
    const seconds = decoded.duration;
    if (hearWindow(seconds) !== "short") return { seconds, audio: null };
    const frames = Math.min(decoded.length, Math.floor(decoded.sampleRate * 20));
    const mixed = new Float32Array(frames);
    const channels = decoded.numberOfChannels;
    for (let channel = 0; channel < channels; channel += 1) {
      const data = decoded.getChannelData(channel);
      for (let index = 0; index < frames; index += 1) mixed[index] += (data[index] ?? 0) / channels;
    }
    const audio = wavBase64(downsample(mixed, decoded.sampleRate, 16000), 16000);
    return { seconds, audio: hearWindow(wavDurationSeconds(audio)) === "short" ? audio : null };
  } catch {
    return null;
  } finally {
    await context.close();
  }
}

function dicomPreview(bytes: Uint8Array) {
  try {
    const parsed = parseDicom(bytes);
    const canvas = document.createElement("canvas");
    canvas.width = parsed.window.width;
    canvas.height = parsed.window.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const image = context.createImageData(canvas.width, canvas.height);
    image.data.set(parsed.pixels);
    context.putImageData(image, 0, 0);
    const url = canvas.toDataURL("image/png");
    const windowText = parsed.window.center !== null && parsed.window.widthWindow !== null
      ? `${parsed.window.center} / ${parsed.window.widthWindow}`
      : "";
    return { url, imageData: url.length <= 1_500_000 ? url : null, window: windowText || null, spacing: parsed.window.spacing };
  } catch {
    return null;
  }
}

function seriesFrame(series: { window: { width: number; height: number; center: number | null; widthWindow: number | null; spacing: [number, number] | null }; pixels: Uint8ClampedArray }) {
  const canvas = document.createElement("canvas");
  canvas.width = series.window.width;
  canvas.height = series.window.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(canvas.width, canvas.height);
  image.data.set(series.pixels);
  context.putImageData(image, 0, 0);
  const url = canvas.toDataURL("image/png");
  const windowText = series.window.center !== null && series.window.widthWindow !== null
    ? `${series.window.center} / ${series.window.widthWindow}`
    : "";
  return { url, imageData: url.length <= 1_500_000 ? url : null, window: windowText || null, spacing: series.window.spacing };
}

function tiffPreview(bytes: Uint8Array) {
  try {
    const parsed = parseTiff(bytes);
    const canvas = document.createElement("canvas");
    canvas.width = parsed.width;
    canvas.height = parsed.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const image = context.createImageData(canvas.width, canvas.height);
    image.data.set(parsed.pixels);
    context.putImageData(image, 0, 0);
    const url = canvas.toDataURL("image/png");
    return { url, imageData: url.length <= 1_500_000 ? url : null, extra: parsed.extra };
  } catch {
    return null;
  }
}

function dataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function modalityLabel(copy: ReturnType<typeof text>, modality: string): string {
  if (modality === "ecg") return copy.windowEcg;
  if (modality === "radiology") return copy.windowRadiograph;
  if (modality === "ultrasound") return copy.windowUltrasound;
  if (modality === "dermatology") return copy.windowDermoscopy;
  if (modality === "histology") return copy.windowHistology;
  if (modality === "genetics") return copy.kindGenetics;
  if (modality === "document") return copy.kindDocument;
  if (modality === "audio") return copy.kindAudio;
  if (modality === "archive") return copy.kindArchive;
  return copy.kindUnknown;
}

function viewerWindow(name: string | undefined, modality: string | undefined, reading: string | undefined) {
  if (reading) return reading;
  if (modality === "dermatology") return "dermoscopy";
  if (modality === "histology") return "histology";
  if (modality === "ultrasound") return "ultrasound";
  if (modality === "document") return "document";
  if (!name) return "plain";
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || lower.endsWith(".docx") || lower.endsWith(".txt") || lower.endsWith(".json")) return "document";
  if (lower.includes("derm")) return "dermoscopy";
  if (/histo|slide|wsi|biops/.test(lower)) return "histology";
  if (/\.(mp4|mov|avi)$/.test(lower) || /ultrasound|sono|efast/.test(lower)) return "ultrasound";
  if (/\.(dcm|dicom|tif|tiff|heic|heif)$/.test(lower)) return "radiology";
  return "plain";
}

function findingLabel(copy: ReturnType<typeof text>, code: string) {
  if (code === "dose") return copy.findingDose;
  if (code === "number") return copy.findingNumber;
  if (code === "negation") return copy.findingNegation;
  if (code === "term") return copy.findingTerm;
  if (code === "drug") return copy.findingDrug;
  return code;
}

function checklistLabel(copy: ReturnType<typeof text>, item: string) {
  if (item === "pattern") return copy.pattern;
  if (item === "colors") return copy.colors;
  if (item === "network") return copy.network;
  if (item === "vessels") return copy.vessels;
  if (item === "architecture") return copy.architecture;
  if (item === "nuclei") return copy.nuclei;
  if (item === "stain") return copy.stain;
  return item;
}

function frameLabel(result: CaseResult | null, name: string) {
  const frameId = result?.ledger.find((entry) => entry.source === name)?.frameId;
  return frameId ? ` · ${frameId}` : "";
}

function imagePoint(image: HTMLImageElement, clientX: number, clientY: number) {
  const rect = image.getBoundingClientRect();
  if (!image.naturalWidth || !image.naturalHeight) return null;
  const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  const offsetX = rect.left + (rect.width - drawnWidth) / 2;
  const offsetY = rect.top + (rect.height - drawnHeight) / 2;
  const x = (clientX - offsetX) / scale;
  const y = (clientY - offsetY) / scale;
  if (x < 0 || y < 0 || x > image.naturalWidth || y > image.naturalHeight) return null;
  return { x, y };
}

function drawInk(canvas: HTMLCanvasElement, image: HTMLImageElement, boxes: PixelBox[]) {
  const rect = image.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
  canvas.style.left = `${image.offsetLeft}px`;
  canvas.style.top = `${image.offsetTop}px`;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  const context = canvas.getContext("2d");
  if (!context || !image.naturalWidth) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
  const offsetX = (rect.width - image.naturalWidth * scale) / 2;
  const offsetY = (rect.height - image.naturalHeight * scale) / 2;
  context.fillStyle = "black";
  for (const box of boxes) {
    context.fillRect(offsetX + box.x * scale, offsetY + box.y * scale, box.width * scale, box.height * scale);
  }
}

function drawEcg(canvas: HTMLCanvasElement, trace: EcgTrace) {
  const width = 960;
  const height = 620;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = "#f3f7f4";
  context.fillRect(0, 0, width, height);
  const cellWidth = width / 4;
  const cellHeight = height / 3;
  context.strokeStyle = "#d3e6dc";
  context.lineWidth = 1;
  for (let column = 1; column < 4; column += 1) {
    context.beginPath();
    context.moveTo(column * cellWidth, 0);
    context.lineTo(column * cellWidth, height);
    context.stroke();
  }
  for (let row = 1; row < 3; row += 1) {
    context.beginPath();
    context.moveTo(0, row * cellHeight);
    context.lineTo(width, row * cellHeight);
    context.stroke();
  }
  const scale = traceScale(trace.leads);
  context.fillStyle = "#1c3d32";
  context.font = "18px Iowan Old Style, Palatino, serif";
  context.strokeStyle = "#1c3d32";
  context.lineWidth = 1.5;
  ECG_LAYOUT.forEach((row, rowIndex) => {
    row.forEach((lead, columnIndex) => {
      const originX = columnIndex * cellWidth + 16;
      const originY = rowIndex * cellHeight + 12;
      context.fillText(lead, originX, originY + 16);
      const points = leadPath(trace.leads[lead], cellWidth - 36, cellHeight - 48, scale.min, scale.max);
      context.beginPath();
      points.forEach(([x, y], index) => {
        const pointX = originX + x;
        const pointY = originY + 28 + y;
        if (index === 0) context.moveTo(pointX, pointY);
        else context.lineTo(pointX, pointY);
      });
      context.stroke();
    });
  });
}

function money(usd: number) {
  if (usd === 0) return "0.00";
  return usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2);
}

function wantsOpinions(text: string) {
  return /consilium|several opinions|несколько мнений|консилиум|несколько врачей/i.test(text);
}

function base64Of(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

const seenPhoneFiles = new Set<string>();

type QrEncoder = (
  value: string,
  options: { margin: number; width: number; errorCorrectionLevel: "M" },
) => Promise<string>;

function fileFromDataUrl(name: string, dataUrl: string): File | null {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) return null;
  const binary = atob(match[2].replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([new Uint8Array(bytes)], name, { type: match[1] });
}

async function sha256Of(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function AnalysisWorkbench({fixedProfile}:{fixedProfile?:ImageProfile}) {
  const router=useRouter();
  const [helpOpen,setHelpOpen]=useState(false);
  const [imageProfile,setImageProfile]=useState<ImageProfile>(fixedProfile??"auto");
  const [progress,setProgress]=useState<AnalysisProgressEvent[]>([]);const [preview,setPreview]=useState("");
  const {t,language,setLanguage}=useWorkspaceLanguage();

  const [casebook, setCasebook] = useState<ClinicalCase[]>([]);
  const [linkedCase, setLinkedCase] = useState("");
  const [radiologyOpen,setRadiologyOpen]=useState(false);
  const importedCase=useRef('');
  const [bridgeNotice, setBridgeNotice] = useState("");
  useEffect(()=>{void readCases().then(async values=>{setCasebook(values);const id=new URLSearchParams(location.search).get('case');const value=values.find(c=>c.id===id);if(!value||importedCase.current===id)return;importedCase.current=id!;setLinkedCase(value.id);setNote(value.stationDraft?.note??caseContext(value));setReferenceFiles(value.library??[]);const loaded=(await Promise.all(value.files.map(restoreMaterial))).filter((f):f is File=>f!==null);if(loaded.length){const transfer=new DataTransfer();loaded.forEach(f=>transfer.items.add(f));await addFiles(transfer.files);setFiles(previous=>previous.map(file=>{const source=value.files.find(f=>f.name===file.name);return source?{...file,sha256:source.sha256??file.sha256,processingModule:source.processingModule,imageData:source.image??file.imageData}:file;}));}}).catch(()=>setBridgeNotice('Локальные случаи недоступны.'));},[]);
  async function exportMaterials(){return Promise.all(files.map(async file=>{const original=file.original&&(/\.(dcm|dicom|zip)$/i.test(file.name))?await storeOriginal(file.original):null;return {...(original??{}),name:file.name,bytes:file.bytes,sha256:file.sha256,...(file.processingModule?{processingModule:file.processingModule}:{}),...(file.text?{text:file.text}:{}),...(file.imageData?{image:file.imageData}:{}),...(file.binary?{binary:file.binary}:{}),...(file.frames?.length?{frames:file.frames}:{}),imageProfile,...(imageMeasurements[file.id]?.length?{intakeNote:imageMeasurements[file.id].map(item=>`${item.metric}: ${item.value} ${item.unit}; ${item.basis}`).join('\n')}:{})};}));}
  async function saveStationSnapshot(){if(!linkedCase)return;const materials=await exportMaterials();const fresh=(await readCases()).find(c=>c.id===linkedCase);if(!fresh)return;if(fresh.status==='closed')throw Error('Верните случай в работу перед добавлением материалов.');await persistCase({...fresh,updated:new Date().toISOString(),stationDraft:{note,imageProfile},files:[...fresh.files,...materials.filter(f=>!fresh.files.some(old=>materialKey(old)===materialKey(f)))]});window.dispatchEvent(new CustomEvent('concilium-case-updated'));}
  async function createFromMaterials(){try{const value=await openNewCase(await readCases());await persistCase({...value,context:note,files:await exportMaterials()});setLinkedCase(value.id);setCasebook(await readCases());window.history.replaceState(window.history.state,'',location.pathname+'?case='+value.id);if(result)await saveToCasebook(value.id);setBridgeNotice('Случай создан. Материалы сохранены; можно добавить жалобы, анамнез и вопросы.');}catch(e){setBridgeNotice(e instanceof Error?e.message:'Не удалось создать случай.');}}

  async function saveToCasebook(targetId=linkedCase) {
    if (!result || !targetId) return;
    try {
      const fresh = (await readCases()).find(item => item.id === targetId);
      if (!fresh) throw new Error("Случай не найден");
      const now = new Date().toISOString();
      const known = new Set(fresh.files.map(file => file.sha256));
      const updated = { ...fresh, updated: now,
        files:[...fresh.files,...(await exportMaterials()).filter(file=>!known.has(file.sha256))],
      };
      updated.files = updated.files.map(file => {
        const local = files.find(item => item.sha256 === file.sha256);
        const measured = local ? imageMeasurements[local.id] : undefined;
        return measured?.length ? { ...file, intakeNote: measured.map(item=>`${item.metric}: ${item.value} ${item.unit}; ${item.basis}`).join('\n') } : file;
      });
      const prepared = caseAnalysisInput(updated);
      await persistCase({ ...updated, analyses: [{ id: crypto.randomUUID(), at: now, context: note, inputSignature:caseSignature(updated),materialsKey:prepared.materialsKey,visualEvidence:prepared.visualEvidence(result.visualReadings),result }, ...fresh.analyses] });
      setBridgeNotice('Разбор и материалы сохранены в случае. Можно продолжить обсуждение в клиническом случае.');
    } catch { setBridgeNotice("Не удалось сохранить разбор в случае. Проверьте локальное хранилище."); }
  }
  const [referenceFiles,setReferenceFiles]=useState<import("@/lib/conductor").CaseFile[]>([]);
  const [libraryNotice,setLibraryNotice]=useState("");
  const [task, setTask] = useState<CaseTask | "auto">("auto");
  const locale:Locale=language;
  const [note, setNote] = useState("");
  const [shelf, setShelf] = useState({ title: "", edition: "", chapter: "", page: "", url: "" });
  const [speech, setSpeech] = useState("");
  const [clip, setClip] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [patientLanguage, setPatientLanguage] = useState<Locale>('en');
  const [hearError, setHearError] = useState(false);
  const [caseError, setCaseError] = useState(false);
  const [caseErrorMessage,setCaseErrorMessage]=useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [forPatient, setForPatient] = useState(false);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [consilium, setConsilium] = useState(false);
  const [imageSecondOpinion,setImageSecondOpinion]=useState(false);
  const [result, setResult] = useState<CaseResult | null>(null);
  const [history, setHistory] = useState<CaseResult[]>([]);
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [brush, setBrush] = useState(false);
  const [ruler, setRuler] = useState(false);
  const [rulerMark, setRulerMark] = useState<{ id: string; text: string } | null>(null);
  const rulerStart = useRef<{ x: number; y: number } | null>(null);
  const [masks, setMasks] = useState<Record<string, PixelBox[]>>({});
  const [imageMeasurements, setImageMeasurements] = useState<Record<string, VisualEcgMeasurement[]>>({});
  const [phoneToken, setPhoneToken] = useState<string | null>(null);
  const [phoneLink, setPhoneLink] = useState<{ url: string; qr: string } | null>(null);
  const [phoneOrigin,setPhoneOrigin]=useState<string|null>(null);
  const [phoneHint,setPhoneHint]=useState("");
  const [phoneError, setPhoneError] = useState(false);
  const addFilesRef = useRef<(list: FileList | null) => Promise<void>>(async () => {});
  const listenRef = useRef<(() => void) | null>(null);
  const frameRef = useRef<HTMLImageElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const brushStroke = useRef<{ id: string; x: number; y: number } | null>(null);
  const maskUndo = useRef<Record<string, number[]>>({});
  const ecgRef = useRef<HTMLCanvasElement>(null);
  const copy = text(locale);
  const costAudit = result ? summarizeModelCosts(result.cost) : null;

  useEffect(() => () => listenRef.current?.(), []);



  useEffect(() => {
    if (!phoneToken) return;
    const url = `${phoneOrigin ?? window.location.origin}/phone/send#token=${encodeURIComponent(phoneToken)}&locale=${encodeURIComponent(locale)}`;
    let cancelled = false;
    void import("qrcode")
      .then((loaded) => {
        const candidate = loaded as { toDataURL?: QrEncoder; default?: { toDataURL?: QrEncoder } };
        const encode = candidate.toDataURL ?? candidate.default?.toDataURL;
        if (!encode) throw new Error("qr");
        return encode(url, { margin: 1, width: 220, errorCorrectionLevel: "M" });
      })
      .then((qr) => {
        if (!cancelled) setPhoneLink({ url, qr });
      })
      .catch(() => {
        if (!cancelled) setPhoneError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [phoneToken, locale, phoneOrigin]);

  useEffect(() => {
    if (!phoneToken) return;
    let stopped = false;
    let since = 0;
    let pulling = false;
    const pull = async () => {
      if (stopped || pulling) return;
      pulling = true;
      try {
        const response = await fetch(`/api/phone/events?token=${encodeURIComponent(phoneToken)}&since=${since}`);
        const body = (await response.json()) as { files?: { id: number; name: string; dataUrl: string }[] };
        if (stopped || !response.ok || !body.files?.length) return;
        const incoming: File[] = [];
        for (const item of body.files) {
          if (item.id > since) since = item.id;
          const key = `${phoneToken}:${item.id}`;
          if (seenPhoneFiles.has(key)) continue;
          const file = fileFromDataUrl(item.name, item.dataUrl);
          if (!file) continue;
          seenPhoneFiles.add(key);
          incoming.push(file);
        }
        if (incoming.length) {
          const list = new DataTransfer();
          for (const file of incoming) list.items.add(file);
          await addFilesRef.current(list.files);
        }
      } catch {
        // The next poll asks again.
      } finally {
        pulling = false;
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), 2000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [phoneToken]);
  useEffect(()=>{if(!linkedCase||analyzing)return;const timer=setTimeout(()=>{void saveStationSnapshot().catch(()=>setBridgeNotice('Автосохранение материалов не удалось. Сохраните файлы перед переходом.'));},350);return()=>clearTimeout(timer);},[linkedCase,files,note,imageProfile]);
  const selected = files.find((file) => file.id === selectedId) ?? null;
  const ecgTrace = useMemo(() => {
    const name = selected?.name.toLowerCase() ?? "";
    if (selected?.text && name.endsWith(".csv")) return traceCsv(selected.text);
    if (selected?.text && name.endsWith(".xml")) return traceXml(selected.text);
    if (selected?.binary && [".edf", ".mat", ".scp", ".dcm", ".dicom"].some((ext) => name.endsWith(ext))) return traceBinary(selected.name, selected.binary);
    return null;
  }, [selected?.binary, selected?.name, selected?.text]);
  const selectedEntry = result?.ledger.find(entry => selected && (entry.clientId === selected.id || entry.source === selected.name)) ?? null;
  const labFinding = selectedEntry?.labs
    ? selectedEntry.labs
    : selected?.text
      ? inspectLab({ name: selected.name, text: selected.text }, moduleLocale(locale))
      : null;
  const proseFinding = selectedEntry?.prose
    ? selectedEntry.prose
    : selected
      ? inspectProse({ name: selected.name, text: selected.text ?? undefined }, moduleLocale(locale))
      : null;
  const sheetReason = selectedEntry?.status === "read" ? null : selected && isEcgSheet(selected.name)
    ? inspectEcg({ name: selected.name }, moduleLocale(locale))?.reason ?? null
    : null;
  const windowName = ecgTrace || sheetReason
    ? "ecg"
    : selected?.loop || selected?.video
      ? "ultrasound"
      : selected?.series
        ? "radiology"
        : viewerWindow(selected?.name, selectedEntry?.modality, selectedEntry?.reading?.window);
  const previewOrder = selected && !selectedEntry && (selected.video || selected.loop === "still")
    ? openProtocol(selected.name, moduleLocale(locale))
    : null;

  useEffect(() => {
    const canvas = ecgRef.current;
    if (!canvas || !ecgTrace) return;
    drawEcg(canvas, ecgTrace);
  }, [ecgTrace]);
  const qualityText = selectedEntry?.reading?.quality == null ? "" : selectedEntry.reading.quality.toFixed(2);
  const specialist = result?.readings.find((item) => item.source === selected?.name) ?? null;
  const writtenIds = new Set(specialist?.items.map((item) => item.id) ?? []);
  const checklist = (selectedEntry?.reading?.checklist ?? [])
    .filter((item) => !writtenIds.has(item))
    .map((item) => checklistLabel(copy, item))
    .join(", ");
  const missingViews = selectedEntry?.reading?.missingViews.join(", ") ?? "";

  async function describe(file: File): Promise<LocalFile> {
    const lower = file.name.toLowerCase();
    const textLike = [".csv", ".vcf", ".txt", ".xml", ".json"].some((ext) => lower.endsWith(ext));
    const signal = [".edf", ".mat", ".scp"].some((ext) => lower.endsWith(ext));
    const dicom = lower.endsWith(".dcm") || lower.endsWith(".dicom");
    const spreadsheet = lower.endsWith(".xlsx") && file.size <= 1_500_000 ? await labTextFromXlsx(new Uint8Array(await file.arrayBuffer())).catch(() => null) : null;
    const documentText = lower.endsWith(".docx") && file.size <= 1_500_000 ? await textFromDocx(new Uint8Array(await file.arrayBuffer())).catch(() => null) : null;
    const pdfText = lower.endsWith(".pdf") && !isEcgSheet(file.name) && file.size <= 1_500_000 ? await textFromPdf(new Uint8Array(await file.arrayBuffer())).catch(() => null) : null;
    const vcfText = lower.endsWith(".vcf.gz") && file.size <= 1_500_000 ? await textFromVcfGzip(new Uint8Array(await file.arrayBuffer())).catch(() => null) : null;
    const dicomBytes = dicom && file.size <= 8_000_000 ? new Uint8Array(await file.arrayBuffer()) : null;
    const tiffBytes = (lower.endsWith(".tif") || lower.endsWith(".tiff")) && file.size <= 8_000_000 ? new Uint8Array(await file.arrayBuffer()) : null;
    const heic = lower.endsWith(".heic") || lower.endsWith(".heif");
    const label = dicomBytes ? dicomLabel(dicomBytes) : null;
    const ultrasound = label?.modality === "US";
    const cine = ultrasound && (label?.frames ?? 1) > 1;
    const preview = dicomBytes && !cine ? dicomPreview(dicomBytes) : null;
    const loop = !ultrasound ? null : cine ? "cine" : preview ? "still" : "unread";
    const tiff = tiffBytes ? tiffPreview(tiffBytes) : null;
    const wave = dicomBytes && !preview && !ultrasound && file.size <= 1_500_000 ? traceDicom(dicomBytes) : null;
    const closedLoop = loop === "cine" || loop === "unread";
    const video = [".mp4", ".mov", ".avi"].some((ext) => lower.endsWith(ext));
    const audio = [".wav", ".mp3", ".m4a", ".ogg", ".aac", ".flac"].some((ext) => lower.endsWith(ext));
    const clip = video ? await sampleClip(file) : null;
    const frames=video?await prepareVideo(file).catch(()=>[]):undefined;
    const voice = audio ? await hearFile(file) : null;
    return {
      id: crypto.randomUUID(),
      original:file,
      name: file.name,
      bytes: file.size,
      sha256: await sha256Of(file),
      url: closedLoop ? "" : preview?.url ?? tiff?.url ?? URL.createObjectURL(file),
      image: closedLoop ? false : preview ? true : tiff ? true : heic ? false : file.type.startsWith("image/"),
      imageData: closedLoop ? null : preview?.imageData ?? tiff?.imageData ?? clip?.image ?? (file.type.startsWith("image/") && file.size <= 8_000_000 ? await prepareImage(file).catch(()=>null) : null),
      dicomWindow: loop ? null : preview?.window ?? null,
      dicomClosed: dicom && !ultrasound && !preview && !wave,
      photoClosed: heic ? "heic" : tiffBytes && !tiff ? "tiff" : null,
      tiffExtra: tiff?.extra ?? false,
      series: null,
      loop,
      clip,
      frames,
      voice,
      spacing: loop ? null : preview?.spacing ?? null,
      text: spreadsheet
        ?? documentText
        ?? pdfText
        ?? vcfText
        ?? (file.size <= (lower.endsWith(".xml") ? 1_500_000 : 200_000) && (textLike || file.type.startsWith("text/") || file.type.includes("csv") || file.type.includes("xml"))
          ? await file.text()
          : null),
      binary: (signal || lower.endsWith(".pdf")) && file.size <= 8_000_000
        ? base64Of(new Uint8Array(await file.arrayBuffer()))
        : wave && dicomBytes
          ? base64Of(dicomBytes)
          : null,
      pdf: file.type === "application/pdf" || lower.endsWith(".pdf"),
      video,
      audio,
      plane: clip?.plane ?? (await planeOf(file)),
    };
  }

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const incoming: LocalFile[] = [];
    for (const file of Array.from(list)) {
      if (file.name.toLowerCase().endsWith(".zip")) {
        const packed = new Uint8Array(await file.arrayBuffer());
        const series = await openDicomSeries(packed).catch(() => null);
        if (series) {
          const frame = series.opened ? seriesFrame(series) : null;
          incoming.push({
            id: crypto.randomUUID(),
            original:file,
            name: file.name,
            bytes: file.size,
            sha256: await sha256Of(file),
            url: frame?.url ?? "",
            image: Boolean(frame),
            imageData: frame?.imageData ?? null,
            dicomWindow: frame?.window ?? null,
            dicomClosed: false,
            photoClosed: null,
            tiffExtra: false,
            series: { total: series.total, opened: Boolean(frame) },
            loop: null,
            clip: null,
            spacing: frame?.spacing ?? null,
            text: null,
            binary: null,
            pdf: false,
            video: false,
            audio: false,
            plane: null,
            voice: null,
          });
          continue;
        }
        const members = await unpackZip(packed).catch(() => []);
        if (members.length) {
          for (const member of members) {
            incoming.push(member.data ? await describe(new File([new Uint8Array(member.data)], member.name)) : {
              id: crypto.randomUUID(),
              name: member.name,
              bytes: member.bytes,
              sha256: "",
              url: "",
              image: false,
              imageData: null,
              dicomWindow: null,
              dicomClosed: false,
              photoClosed: null,
              tiffExtra: false,
              series: null,
              loop: null,
              clip: null,
              spacing: null,
              text: null,
              binary: null,
              pdf: member.name.toLowerCase().endsWith(".pdf"),
              video: false,
              audio: [".wav", ".mp3", ".m4a", ".ogg", ".aac", ".flac"].some((ext) => member.name.toLowerCase().endsWith(ext)),
              plane: null,
              voice: null,
            });
          }
          continue;
        }
      }
      incoming.push(await describe(file));
    }
    setFiles((current) => [...current, ...incoming]);
    setSelectedId((current) => current ?? incoming[0]?.id ?? null);
  }
  addFilesRef.current = addFiles;

  async function openPhone() {
    setPhoneError(false);
    try {
      const response = await fetch("/api/phone/session", { method: "POST" });
      const body = (await response.json()) as { token?: string; phoneOrigin?: string | null; connectionHint?: string | null };
      if (!response.ok || !body.token) throw new Error("phone");
      setPhoneToken(body.token);
      setPhoneOrigin(body.phoneOrigin ?? null);setPhoneHint(body.connectionHint ?? "Телефон и компьютер должны быть в одной Wi-Fi сети. Через локальный HTTP используйте выбор фото/видео/аудиофайла; запись микрофоном требует HTTPS.");
    } catch {
      setPhoneError(true);
    }
  }

  async function toggleListen() {
    if (listenRef.current) {
      listenRef.current();
      return;
    }
    setHearError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silent = context.createGain();
      silent.gain.value = 0;
      const chunks: Float32Array[] = [];
      let samples = 0;
      let stopped = false;
      const rate = context.sampleRate;
      const finish = () => {
        if (stopped) return;
        stopped = true;
        processor.disconnect();
        source.disconnect();
        silent.disconnect();
        stream.getTracks().forEach((track) => track.stop());
        void context.close();
        listenRef.current = null;
        setListening(false);
        const merged = new Float32Array(samples);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        const audio = wavBase64(downsample(merged, rate, 16000), 16000);
        if ((wavDurationSeconds(audio) ?? 0) >= 0.2) setClip(audio);
      };
      processor.onaudioprocess = (event) => {
        const data = new Float32Array(event.inputBuffer.getChannelData(0));
        chunks.push(data);
        samples += data.length;
        if (samples >= rate * 20) finish();
      };
      source.connect(processor);
      processor.connect(silent);
      silent.connect(context.destination);
      listenRef.current = finish;
      setListening(true);
      setClip(null);
    } catch {
      setHearError(true);
      setListening(false);
    }
  }

  async function transcribeRecording() {
    if (!clip || transcribing || analyzing) return;
    setTranscribing(true);setHearError(false);
    try {
      const reviewed = await reviewBeforeSending({ speech: { audio: clip }, locale, externalSearch: false }, 'chat-audio');
      const reply = await requestStreamedJson<{text:string}>('/api/specialist-chat', { intent: 'transcribe', reviewed });
      setSpeech(reply.text);
    } catch { setHearError(true); }
    finally { setTranscribing(false); }
  }

  const isRadiologyFile=(file:LocalFile)=>Boolean(casebook.find(c=>c.id===linkedCase)?.moduleReports?.some(r=>r.fileKeys.includes(file.sha256)))||file.processingModule==='radiology'||Boolean(file.series)||(['xray','ct','mri'].includes(imageProfile)&&file.image)||(!file.loop&&materialRoute({name:file.name,binary:file.binary??undefined,text:file.text??undefined})==='radiology');
  async function openCase() {
    if (analyzing || transcribing) return;
    const dicom=files.filter(isRadiologyFile);
    const savedCase=casebook.find(c=>c.id===linkedCase);
    if(dicom.length&&(!savedCase||caseAnalysisInput(savedCase).pendingModules.length)){setRadiologyOpen(true);setBridgeNotice('DICOM передан в Opus Radiology. Запустите анализ исследования и верните результат в случай.');return;}
    setAnalyzing(true);setProgress([]);setPreview("");
    setCaseError(false);setCaseErrorMessage("");
    const askOpinions = consilium || wantsOpinions(note);
    if (askOpinions) setConsilium(true);
    const audience: "patient"|"screen" = forPatient ? "patient" : "screen";
    const fileAudio = selected?.voice?.audio ?? files.find((item) => item.voice?.audio)?.voice?.audio ?? null;
    const spoken = speech.trim()
      ? { text: speech, audience, ...(forPatient ? { target: patientLanguage } : {}) }
      : clip
        ? { audio: clip, audience, ...(forPatient ? { target: patientLanguage } : {}) }
        : fileAudio
          ? { audio: fileAudio, audience }
          : null;
    let body:CaseResult;
    const previous = history[0];
    const priorContext = previous?.clinicalDraft === 'generated' ? `\n\nPrevious unsigned discussion. Reconcile with the current question and files, including new or removed material. Do not treat prior hypotheses as verified evidence.\n${previous.draft.summary.slice(0, 2500)}\n${JSON.stringify(previous.draft.studyReports ?? []).slice(0, 7000)}` : '';
    try{body=await requestAnalysis({
          text: note + priorContext+(savedCase?'\n\n'+caseContext(savedCase):''),imageProfile,
          referenceFiles,
          drugLabels:casebook.find(item=>item.id===linkedCase)?.drugLabels,
          ...(task !== "auto" ? {task} : {}),
          files: files.filter(file=>!isRadiologyFile(file)).map(({ id, name, sha256, bytes, imageData, text, binary, plane, series, loop, frames, clip: sampled }) => ({
            clientId: id,
            name,
            sha256,
            bytes,
            ...(frames?.length?{frames}:{}),
            ...(imageData ? { image: imageData } : {}),
            ...(text ? { text } : {}),
            ...(binary ? { binary } : {}),
            ...(sampled?.plane ? { plane: sampled.plane } : plane ? { plane } : {}),
            ...(series ? { series } : {}),
            ...(loop ? { loop } : {}),
            ...(sampled ? { clip: { taken: sampled.taken } } : {}),
            ...(masks[id]?.length ? { masks: masks[id] } : {}),
            ...(imageMeasurements[id]?.length ? { intakeNote: imageMeasurements[id].map(item=>`${item.metric}: ${item.value} ${item.unit}; ${item.basis}`).join('\n') } : {}),
          })),
          locale,
          sourceLocale: language,
          consilium: askOpinions,secondOpinion:imageSecondOpinion,
          retain: false,
          ...(shelf.title.trim() || shelf.url.trim()
            ? {
                shelf: [
                  {
                    title: shelf.title.trim() || shelf.url.trim(),
                    edition: shelf.edition.trim(),
                    chapter: shelf.chapter.trim(),
                    page: shelf.page.trim(),
                    ...(shelf.url.trim() ? { url: shelf.url.trim() } : {}),
                  },
                ],
              }
            : {}),
          ...(spoken ? { speech: spoken } : {}),
        },{onProgress:event=>setProgress(old=>[...old.slice(-20),event]),onPreview:setPreview});if(!body.draft||!body.gateway)throw new Error('Сервис не вернул завершённый результат.');}
    catch(error){setPreview('');setCaseError(true);setCaseErrorMessage(error instanceof Error?error.message:'Разбор не выполнен.');setAnalyzing(false);return;}
    setCaseError(false);
    setResult(body);
    setHistory(current => [body, ...current].slice(0, 8));setRevision(0);
    setAnalyzing(false);
    setClip(null);
    if (!speech.trim() && body.interpretation?.source) setSpeech(body.interpretation.source);
  }

  async function attachProtocol() {
    if (!result) return;
    const response = await fetch("/api/v1/cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        locale,
        retain: false,
        caseId: result.id,
        equipment: { name: "protocol", specialty: "general" },
        draft: { summary: result.draft.summary },
        ...(speech.trim() ? { speech: { text: speech } } : {}),
      }),
    });
    const body = (await response.json()) as { visit: CaseResult["visit"]; attachment: string | null };
    setResult((current) => (current ? { ...current, visit: body.visit, attachment: body.attachment } : current));
  }

  async function downloadVisit() {
    if (!result?.visit) return;
    try{await downloadDocx(copy.visitTitle,result.visit.text,locale);}catch{setCaseError(true);setCaseErrorMessage("DOCX export failed");}
  }

  const namesRemoved = (result?.redactions ?? 0) > 0;
  const pixelLine = (result?.pixelCovers ?? []).some((cover) => cover.boxes.length > 0);
  const pixelHeld = (result?.pixelCovers ?? []).some((cover) => cover.withheld);
  const serverBoxes = result?.pixelCovers.find((cover) => cover.source === selectedEntry?.source || cover.source === selected?.name)?.boxes ?? [];
  const inkBoxes = [...serverBoxes, ...(selected ? masks[selected.id] ?? [] : [])];

  function paintAt(event: React.PointerEvent<HTMLCanvasElement>, begin = false) {
    if (!brush || analyzing || !selected || !frameRef.current || !inkRef.current) return;
    const image = frameRef.current;
    const point = imagePoint(image, event.clientX, event.clientY);
    if (!point) return;
    const previous = begin ? point : brushStroke.current;
    if (!previous || (!begin && brushStroke.current?.id !== selected.id)) return;
    if (begin) {
      event.currentTarget.setPointerCapture(event.pointerId);
      maskUndo.current[selected.id] = [...(maskUndo.current[selected.id] ?? []), (masks[selected.id] ?? []).length];
    }
    const radius = Math.max(12, Math.min(image.naturalWidth, image.naturalHeight) * 0.025);
    const count = Math.min(200, Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / radius)));
    const boxes = Array.from({length:count}, (_, i) => {
      const left = previous.x + (point.x - previous.x) * (i + 1) / count - radius;
      const top = previous.y + (point.y - previous.y) * (i + 1) / count - radius;
      const x = Math.max(0, left), y = Math.max(0, top);
      return { x, y, width: Math.min(image.naturalWidth, left + radius * 2) - x, height: Math.min(image.naturalHeight, top + radius * 2) - y };
    });
    drawInk(inkRef.current, image, [...inkBoxes, ...boxes]);
    setMasks(current => ({...current, [selected.id]: [...(current[selected.id] ?? []), ...boxes]}));
    brushStroke.current = {id:selected.id,...point};
  }

  useEffect(() => {
    const image = frameRef.current;
    const canvas = inkRef.current;
    if (!image || !canvas) return;
    const draw = () => drawInk(canvas, image, inkBoxes);
    if (image.complete) draw();
    image.addEventListener("load", draw);
    const observer = new ResizeObserver(draw);observer.observe(image);
    return () => { image.removeEventListener("load", draw);observer.disconnect(); };
  }, [inkBoxes, selected?.url]);

  return (
    <main className="case">
      <header className="bar">
        <p className="logo">{fixedProfile==='ecg'?t("ЭКГ"):copy.product}</p><button type="button" onClick={()=>setHelpOpen(true)}>ⓘ {t("Инструкция для врача")}</button>
        <span role="status">{analyzing && <span className="analysis-running">{t('Выполняется разбор…')}</span>}</span>
        <Link href={linkedCase?`/workspace?case=${encodeURIComponent(linkedCase)}`:'/workspace'} onClick={event=>{if(linkedCase){event.preventDefault();void saveStationSnapshot().then(()=>router.push('/workspace?case='+encodeURIComponent(linkedCase))).catch(()=>setBridgeNotice('Сохранение не удалось. Останьтесь в станции.'));}}}>← {t("Клинические случаи")}</Link>
        <label>{t("Сохранение результата")} <select disabled={analyzing} value={linkedCase} onChange={event => {
          const id = event.target.value; setLinkedCase(id);
          const saved = casebook.find(item => item.id === id);
          if (saved) {setNote(caseContext(saved));setReferenceFiles(saved.library??[]);}
          window.history.replaceState(window.history.state,'',location.pathname+(id?'?case='+encodeURIComponent(id):''));
          setBridgeNotice(t(saved?"Контекст перенесён. Материалы исследования загрузите в станции. Готовый разбор можно сохранить в выбранном случае.":"Работайте отдельно или выберите случай: его данные станут контекстом исследования, а результат можно будет сохранить в его истории."));
        }}><option value="">{t("Работать отдельно")}</option>{casebook.map(item => <option key={item.id} value={item.id}>{caseTitle(item,item.id.slice(0,8))}</option>)}</select></label>
        <button disabled={!result || !linkedCase} onClick={() => void saveToCasebook()}>{t("Сохранить разбор в случае")}</button>
        <button disabled={analyzing} onClick={()=>void createFromMaterials()}>{t('Создать случай из материалов')}</button><CaseConnections/>{bridgeNotice && <p role="status">{bridgeNotice}</p>}
        <LanguageSwitcher disabled={analyzing}/>
      </header>
      {radiologyOpen&&<section style={{gridColumn:'1 / -1'}}><button onClick={()=>setRadiologyOpen(false)}>{t('Вернуться к станции')}</button><RadiologyModule embedded initialCaseId={linkedCase} incomingFiles={files.filter(isRadiologyFile).flatMap(f=>f.original?[f.original]:[])} onSaved={id=>{setLinkedCase(id);window.history.replaceState(window.history.state,'',location.pathname+'?case='+encodeURIComponent(id));void readCases().then(values=>{setCasebook(values);const c=values.find(c=>c.id===id);if(c)setNote(caseContext(c));});}}/></section>}<section className="studies" aria-labelledby="studies-title">
        <h1 id="studies-title">{fixedProfile==='ecg'?t('1. Добавьте ЭКГ'):t("1. Добавьте исследования")}</h1>
        <p className="quiet">{fixedProfile==='ecg'?t('Фото ЭКГ или цифровая запись. Выписку и анализы можно добавить как контекст.'):copy.bringHint}</p>
        <label className="file">
          {copy.addFiles}
          <input
            type="file"
            disabled={analyzing}
            multiple
            onChange={(event) => {
              void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        <label className="file">
          {copy.addFolder}
          <input
            type="file"
            disabled={analyzing}
            multiple
            // The folder attribute is the native directory picker.
            {...{ webkitdirectory: "", directory: "" }}
            onChange={(event) => {
              void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        {fixedProfile==='ultrasound'&&<UltrasoundCapture disabled={analyzing} onFrame={file=>{const transfer=new DataTransfer();transfer.items.add(file);return addFiles(transfer.files);}}/>}
        <button type="button" className="file" onClick={() => void openPhone()}>{copy.phone}</button>
        <details className="station-extra"><summary>{t('Передать с телефона')}</summary><p className="quiet">{copy.phonePlain}</p></details>
        {phoneError ? <p className="quiet">{copy.phoneFailed}</p> : null}{phoneHint && <p className="quiet">{phoneHint}</p>}
        {phoneLink ? (
          <div className="phone">
            <img src={phoneLink.qr} alt={copy.phoneHint} width={220} height={220} />
            <p className="quiet">{copy.phoneHint}</p>
            <a href={phoneLink.url}>{phoneLink.url}</a>
          </div>
        ) : null}
        {files.length === 0 ? <p className="quiet">{copy.empty}</p> : null}
        <ul>
          {files.map((file) => (
            <li key={file.id}>
              <button type="button" aria-pressed={selectedId === file.id} onClick={() => setSelectedId(file.id)}>
                {file.name}
                {frameLabel(result, file.name)}
              </button>
              <button type="button" disabled={analyzing} aria-label={`${t('Удалить')} ${file.name}`} onClick={()=>{setFiles(current=>current.filter(item=>item.id!==file.id));if(selectedId===file.id)setSelectedId(null);}}>{t('Удалить')}</button>
            </li>
          ))}
        </ul>
      </section>
      <section className="viewer" data-window={windowName} aria-labelledby="viewer-title">
        <CaseTabHint text="Начните с вопроса ниже. Если нужно разобрать исследование, добавьте файл слева. Затем нажмите «Разобрать случай»; ответ появится справа. Рекомендации, заметка об источнике и запись речи необязательны."/>
        <h2>{t("2. Задайте вопрос и запустите разбор")}</h2>
        <fieldset className="action" aria-label={t("Ваш вопрос к материалам")}>
          <label>{t("Задача врача")}<select value={task} disabled={analyzing} onChange={event=>setTask(event.target.value as CaseTask | "auto")}><option value="auto">{t("Определить по вопросу")}</option><option value="interpret">{t("Разобрать материалы")}</option><option value="clinical">{t("Диагностический разбор")}</option><option value="management">{t("Лечебная тактика")}</option><option value="evidence">{t("Поиск доказательств")}</option></select></label>
          {fixedProfile==='ecg'?<p className="quiet">{t("ЭКГ")} · {t("Цифровые записи и изображения")}</p>:<ImageProfileSelect value={imageProfile} onChange={setImageProfile} disabled={analyzing}/>}<p className="quiet">{t("Напишите, что нужно выяснить. Например: «Опишите изменения на этой ЭКГ» или «Сопоставьте жалобы и результаты анализов». Можно оставить автоматический выбор задачи.")}</p>
          <label>
            {copy.note}
            <textarea disabled={analyzing} value={note} onChange={(event) => setNote(event.target.value)} rows={5} placeholder={t("Что вы хотите узнать по этому случаю?")} />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={consilium}
              onChange={(event) => setConsilium(event.target.checked)}
            />
            {copy.consilium}
          </label>
          <label className="check"><input type="checkbox" checked={imageSecondOpinion} disabled={analyzing} onChange={e=>setImageSecondOpinion(e.target.checked)}/>{t("Второе мнение по исходным изображениям")}</label>
          <button className="open" type="button" disabled={analyzing || transcribing || (!note.trim() && !files.length && !speech.trim() && !clip)} onClick={()=>void openCase()}>{analyzing ? (t("Разбираем материалы…")) : t("✳ Разобрать случай")}</button>
          <p className="quiet">{t("Результат появится в правой колонке. Перед запуском удалите из вопроса и файлов данные, позволяющие узнать пациента.")}</p>
          {caseError ? <p role="alert">{copy.caseFailed} {caseErrorMessage}</p> : null}
        </fieldset>
        {result && !analyzing && <section className="case-summary" aria-label={t('Краткий итог')}>
          <h3>{t('Краткий итог')}</h3><p>{result.draft.summary}</p>
          {result.draft.report?.tactics?.nextStep && <p><strong>{t('Следующий шаг')}</strong> {result.draft.report.tactics.nextStep}</p>}
        </section>}
        <details className="station-extra"><summary>{t("Как это работает")}</summary><WorkflowGuideView guide={workflowGuide({context:note,files:files.map(file=>({name:file.name})),result:result??undefined,busy:analyzing})} onHelp={()=>setHelpOpen(true)} onAction={target=>{
          const selector=target==='materials'?'.studies':target==='context'?'.action textarea':'.draft';
          document.querySelector(selector)?.scrollIntoView({behavior:'smooth'});
        }}/></details>
        <details className="station-extra" ><summary>{t("Рекомендации и статьи · необязательно")}</summary><ReferenceInstructions expanded station/>
          <p>{t('Для большой книги используйте «Личную библиотеку». Подобранные страницы, таблицы и изображения можно проверить перед разбором.')}</p>
          <label className="file">{t("Добавить руководство или статью")}<input disabled={analyzing} type="file" multiple accept=".pdf,.docx,.txt,.md" onChange={async event=>{const selected=Array.from(event.target.files??[]);event.target.value="";try{const prepared=await Promise.all(selected.map(prepareFile));setReferenceFiles(old=>[...old,...prepared]);setLibraryNotice("");}catch(error){setLibraryNotice(error instanceof Error?error.message:"Library upload failed");}}}/></label>
          {referenceFiles.map((file,index)=><p key={`${file.name}-${index}`}>{file.name} <button disabled={analyzing} onClick={()=>setReferenceFiles(old=>old.filter((_,i)=>i!==index))}>{t("Удалить")}</button></p>)}{libraryNotice&&<p role="status">{libraryNotice}</p>}
        </details>
        <SourceSuggestions profile={imageProfile === 'auto' ? labFinding?.rows.length ? 'labs' : selectedEntry?.modality ?? 'auto' : imageProfile} onChoose={source=>setShelf(current=>({...current,...source}))}/>
        <h2 id="viewer-title">{t("Просмотр выбранного исследования")}</h2>{selected?.text&&<GeneticExtraction file={{name:selected.name,text:selected.text}}/>}
        {selectedEntry ? (
          <details className="station-extra"><summary>{t('Данные файла')}</summary><p className="quiet">
            {modalityLabel(copy, selectedEntry.modality)}
            {selectedEntry.sha256 ? ` · ${selectedEntry.sha256}` : ""}
          </p></details>
        ) : null}
        {windowName === "dermoscopy" || windowName === "histology" || windowName === "ultrasound" || windowName === "ecg" || windowName === "radiology" ? (
          <p className="window-name">
            {windowName === "dermoscopy"
              ? copy.windowDermoscopy
              : windowName === "histology"
                ? copy.windowHistology
                : windowName === "ultrasound"
                  ? copy.windowUltrasound
                  : windowName === "radiology"
                    ? copy.windowRadiograph
                    : copy.windowEcg}
            {ecgTrace?.samplingRate ? ` · ${ecgTrace.samplingRate} Hz` : ""}
            {selected?.dicomWindow ? ` · ${selected.dicomWindow}` : ""}
          </p>
        ) : null}
        {selected?.dicomClosed ? <p>{copy.dicomClosed}</p> : null}
        {selected?.series ? <p>{seriesReason(selected.series.total, selected.series.opened, moduleLocale(locale))}</p> : null}
        {selected?.loop && selected.loop !== "still" ? <p>{loopReason(selected.loop, moduleLocale(locale))}</p> : null}
        {selected?.clip ? (
          <p>{clipReason(selected.clip.taken, clipGate(selected.clip.plane).readable, moduleLocale(locale))}</p>
        ) : previewOrder ? (
          <p>{previewOrder.reason}</p>
        ) : null}
        {selected?.voice && hearWindow(selected.voice.seconds) !== "closed" ? (
          <p>{hearReason(hearWindow(selected.voice.seconds) === "long" ? "long" : "short", moduleLocale(locale))}</p>
        ) : null}
        {selected?.photoClosed ? <p>{closedPhotoReason(selected.photoClosed, moduleLocale(locale))}</p> : null}
        {selected?.tiffExtra ? <p>{extraTiffReason(moduleLocale(locale))}</p> : null}
        {sheetReason ? <p>{sheetReason}</p> : null}
        {labFinding?.reason && labFinding.reason !== selectedEntry?.reason ? <p>{labFinding.reason}</p> : null}
        {proseFinding?.reason && proseFinding.reason !== selectedEntry?.reason ? <p>{proseFinding.reason}</p> : null}
        <div className={`stage${brush && selected?.image ? " brush" : ""}${ruler && selected?.image ? " ruler" : ""}`}>
          {ecgTrace ? (
            <canvas ref={ecgRef} className="ecg" role="img" aria-label={copy.windowEcg} />
          ) : selected?.image ? (
            <>
              <img ref={frameRef} src={selected.url} alt={selected.name} />
              <canvas
                ref={inkRef}
                className="ink"
                onPointerDown={(event) => {
                  const image = frameRef.current;
                  if (!image || !selected) return;
                  const point = imagePoint(image, event.clientX, event.clientY);
                  if (!point) return;
                  if (ruler) {
                    const start = rulerStart.current;
                    if (!start) {
                      rulerStart.current = point;
                      setRulerMark(null);
                      return;
                    }
                    const span = measureSpan(start, point, { width: image.naturalWidth, height: image.naturalHeight }, selected.spacing);
                    rulerStart.current = null;
                    if (!span) return;
                    setRulerMark({ id: selected.id, text: span.millimetres === null ? `${span.pixels} px` : `${span.millimetres} mm` });
                    return;
                  }
                  if (!brush) return;
                  paintAt(event, true);
                }}
                onPointerMove={event=>{if(brushStroke.current)paintAt(event);}}
                onPointerUp={()=>{brushStroke.current=null;}}
                onPointerCancel={()=>{brushStroke.current=null;}}
                aria-label={t('Закрашивание персональных данных')}
              />
            </>
          ) : selected?.video ? (
            <>
              {selected.clip?.image ? <img src={selected.clip.image} alt="" /> : null}
              <video src={selected.url} controls />
            </>
          ) : selected?.audio && selected.url ? (
            <audio src={selected.url} controls />
          ) : labFinding && labFinding.rows.length ? (
            <ul>
              {labFinding.rows.map((row, index) => (
                <li key={`${row.name}-${index}`}>{labLine(row)}</li>
              ))}
            </ul>
          ) : proseFinding && proseFinding.paragraphs.length && !selected?.pdf ? (
            <div>
              {proseFinding.paragraphs.map((paragraph, index) => (
                <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
              ))}
            </div>
          ) : selected?.pdf ? (
            <>
              {proseFinding?.paragraphs.map((paragraph, index) => (
                <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
              ))}
              <iframe title={selected.name} src={selected.url} />
            </>
          ) : (
            <p>{selected?.name ?? t("После загрузки нажмите название файла слева — здесь откроется его просмотр.")}</p>
          )}
        </div>
        {selected?.image ? (
          <button className="open" type="button" disabled={analyzing} aria-pressed={brush} onClick={() => {setRuler(false);setBrush((current) => !current);}}>
            {copy.brush}
          </button>
        ) : null}
        {selected?.image && <><p className="quiet">{t('Нажмите «Кисть» и проведите по имени, дате или коду. Чёрные области будут закрыты в отправляемой копии.')}</p>
          {!!masks[selected.id]?.length && <button type="button" disabled={analyzing} onClick={()=>{
            const starts=maskUndo.current[selected.id]??[];const count=starts.pop()??0;
            setMasks(current=>({...current,[selected.id]:current[selected.id].slice(0,count)}));
          }}>{t('Отменить последнее закрашивание')}</button>}</>}
        {selected?.image && !selected.loop && (/\.(dcm|dicom)$/i.test(selected.name) || selected.series?.opened) && !selected.dicomClosed ? (
          <button
            className="open"
            type="button"
            aria-pressed={ruler}
            onClick={() => {
              rulerStart.current = null;
              setBrush(false);
              setRuler((current) => !current);
            }}
          >
            {copy.ruler}
          </button>
        ) : null}
        {selected?.image && (imageProfile==='ecg'||windowName==='ecg') && !analyzing && <>
          <EcgGridRuler key={selected.id} src={selected.url} onApply={values=>setImageMeasurements(current=>({...current,[selected.id]:values}))}/>
          {imageMeasurements[selected.id]?.length ? <ul>{imageMeasurements[selected.id].map(item=><li key={item.metric}>{item.metric} · {item.value} {item.unit} · {item.lead}</li>)}</ul> : null}
          {result?.visualReadings?.find(account=>account.source===selectedEntry?.source)?.measurements?.length ? <details className="station-extra"><summary>{t('Оценки по сетке — проверить')}</summary>
            <p>{t('Это предварительный подсчёт клеток. Для протокола подтвердите значения линейкой на изображении.')}</p>
            <ul>{result.visualReadings.find(account=>account.source===selectedEntry?.source)!.measurements!.map(item=><li key={item.metric}>{item.metric} ≈ {item.value} {item.unit} · {item.lead}</li>)}</ul>
          </details> : null}
        </>}
        {rulerMark && rulerMark.id === selected?.id ? <p>{rulerMark.text}</p> : null}
        {qualityText ? <p>{copy.quality}: {qualityText}</p> : null}
        {specialist ? (
          <p>
            {specialist.specialty === "dermoscopy" ? copy.windowDermoscopy : copy.windowHistology}
            {" · "}
            {specialist.status === "done" ? specialist.text : copy.unassessed}
          </p>
        ) : null}
        {specialist?.items.map((item) => (
          <p key={item.id}>
            {checklistLabel(copy, item.id)}
            {": "}
            {item.text}
          </p>
        ))}
        {selectedEntry?.reading?.stain ? <p>{copy.stain}: {selectedEntry.reading.stain}</p> : null}
        {checklist ? <p>{copy.unfilled}: {checklist}</p> : null}
        {selectedEntry?.reading?.protocolTitle || previewOrder ? <p>{copy.scanOrder}: {selectedEntry?.reading?.protocolTitle ?? previewOrder?.title}</p> : null}
        {selectedEntry?.printed?.length ? <p>{selectedEntry.printed.join(", ")}</p> : null}
        {missingViews || previewOrder ? <p>{missingViews || previewOrder?.missing.join(", ")}</p> : null}
        {selectedEntry?.genetics?.acmg ? (
          <p>
            {selectedEntry.genetics.acmg.label}
            {" · "}
            {selectedEntry.genetics.acmg.ruleId}
            {" · "}
            {selectedEntry.genetics.acmg.criteria.join(" ")}
            {selectedEntry.genetics.frequency?.af != null ? ` · gnomAD ${selectedEntry.genetics.frequency.af}` : ""}
          </p>
        ) : null}
        {selectedEntry?.genetics?.clinvar?.line ? <p>{selectedEntry.genetics.clinvar.line}</p> : null}
        {selectedEntry?.genetics?.diplotype ? (
          <p>
            {selectedEntry.genetics.gene}
            {" · "}
            {selectedEntry.genetics.diplotype}
            {selectedEntry.genetics.phenotype ? ` · ${selectedEntry.genetics.phenotype}` : ""}
          </p>
        ) : null}
        {selectedEntry?.genetics?.panel ? (
          <p>
            {selectedEntry.genetics.panel.symbol}
            {" · "}
            {selectedEntry.genetics.panel.phenotype}
          </p>
        ) : null}
        {selectedEntry?.reason && selectedEntry.reason !== sheetReason ? <p>{selectedEntry.reason}</p> : null}
        {selectedEntry && selectedEntry.leads.length > 0 ? (
          <p>
            {selectedEntry.leads.join(" ")}
            {" · "}
            {selectedEntry.samples}
          </p>
        ) : null}
        <details className="station-extra"><summary>{t("Заметка об источнике · необязательно")}</summary>
          <p className="quiet">{t("Эти поля добавляют в результат только название, издание и страницу источника. Чтобы приложение использовало содержание книги или статьи, загрузите файл в раздел рекомендаций выше.")}</p><div className="station-fields">
        <label>{t('Ссылка на источник')}<input type="url" maxLength={2000} placeholder="https://…" value={shelf.url} onChange={event=>setShelf(current=>({...current,url:event.target.value}))}/></label>
        <label>
          {copy.shelfTitle}
          <input type="text" maxLength={180} value={shelf.title} onChange={(event) => setShelf((current) => ({ ...current, title: event.target.value }))} />
        </label>
        <label>
          {copy.shelfEdition}
          <input type="text" maxLength={40} value={shelf.edition} onChange={(event) => setShelf((current) => ({ ...current, edition: event.target.value }))} />
        </label>
        <label>
          {copy.shelfChapter}
          <input type="text" maxLength={80} value={shelf.chapter} onChange={(event) => setShelf((current) => ({ ...current, chapter: event.target.value }))} />
        </label>
        <label>
          {copy.shelfPage}
          <input type="text" maxLength={20} value={shelf.page} onChange={(event) => setShelf((current) => ({ ...current, page: event.target.value }))} />
        </label>
        </div></details>
        <details className="station-extra"><summary>{t("Текст или голос с приёма · необязательно")}</summary>
          <p className="quiet">{t("Введите текст или запишите короткую фразу. При запуске разбора она войдёт в контекст случая. Если нужен перевод для пациента, отметьте «Для пациента».")}</p>
          <p className="quiet">{t("Запись микрофоном работает на localhost или HTTPS. Если запись недоступна, вставьте текст вручную.")}</p>
        <label>
          {copy.interpreterInput}
          <textarea disabled={analyzing} value={speech} onChange={(event) => setSpeech(event.target.value)} rows={4} />
        </label>
        <button className="open" type="button" onClick={toggleListen}>
          {listening ? copy.listening : copy.listen}
        </button>
        {clip && <div className="recorded-audio"><p role="status">{t('Запись готова. Прослушайте или расшифруйте её.')}</p><audio controls src={`data:audio/wav;base64,${clip}`}/>
          <button type="button" disabled={analyzing||transcribing} onClick={()=>void transcribeRecording()}>{t(transcribing?'Расшифровываем запись…':'Расшифровать запись')}</button></div>}
        {hearError ? <p>{copy.hearFailed}</p> : null}
        <label className="check">
          <input
            type="checkbox"
            checked={forPatient}
            onChange={(event) => setForPatient(event.target.checked)}
          />
          {copy.forPatient}
        </label>
        <p className="quiet">{t('Этот флажок включает перевод записанной фразы для пациента. Выберите язык перевода ниже.')}</p>
        {forPatient&&<label>{t('Язык перевода для пациента')}<select value={patientLanguage} onChange={event=>setPatientLanguage(event.target.value as Locale)}>{LOCALES.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}</select></label>}
        </details>
      </section>
      <aside className="draft" aria-labelledby="draft-title">
        <h2 id="draft-title">{t("3. Прочитайте результат")}</h2>{analyzing&&<AnalysisProgress events={progress} preview={preview}/>}
        {!analyzing&&result&&<button type="button" onClick={()=>{setResult(null);setHistory([]);setPreview('');setProgress([]);}}>{t('Очистить результаты')}</button>}
        {history.length>1&&<label>{t('Версия разбора')}<select value={revision} disabled={analyzing} onChange={event=>{const index=Number(event.target.value);setRevision(index);setResult(history[index]);}}>{history.map((item,index)=><option key={index} value={index}>{history.length-index}</option>)}</select></label>}
        {result && !analyzing ? (
          <>
            {namesRemoved ? <p>{copy.redacted}</p> : null}
            {pixelLine ? <p>{copy.pixels}</p> : null}
            {pixelHeld ? <p>{copy.pixelsHeld}</p> : null}
            <StudyReports reports={result.draft.studyReports}/>
            <h3>{t('Ответ на вопрос врача')}</h3><p style={{whiteSpace: "pre-wrap"}}>{result.draft.summary}</p>
            {result.validationWarnings?.map((warning,i)=><p role="alert" key={i}>{warning}</p>)}
            {result.visualReadings?.map(account => <div key={account.source}>
              {account.secondOpinion&&<section><h4>{t('Второе мнение')} · {imageModelLabel(account.secondOpinion.model??'')} · {account.source}</h4>{account.secondOpinion.mode==='informed'&&<small>{t('Проверка с учётом первого ответа')}</small>}<p>{account.secondOpinion.status==='completed'?account.secondOpinion.reading:t('Второе мнение не получено. Основное заключение сохранено.')}</p></section>}
              {account.technical?.length ? <details><summary>{t("Параметры записи")} · {account.source}</summary><p>{account.technical.join("; ")}</p></details> : null}
            </div>)}
{result.readings?.filter(r=>r.secondOpinion).map(r=><section key={'opinion-'+r.source}><h4>{t('Второе мнение')} · {imageModelLabel(r.secondOpinion?.model??'')} · {r.source}</h4>{r.secondOpinion?.mode==='informed'&&<small>{t('Проверка с учётом первого ответа')}</small>}<p>{r.secondOpinion?.status==='completed'?r.secondOpinion.text:t('Второе мнение не получено. Основное заключение сохранено.')}</p></section>)}
            {result.ledger.filter(entry=>entry.genetics?.review).map(entry=><GenomicReviewView key={entry.source} finding={entry.genetics!}/>)}
            {result.draft.report && <ClinicalReportView report={result.draft.report} citations={result.citations}/>}
            {result.medicationReview&&<MedicationReviewView review={result.medicationReview}/>}
            {result.interpretation && forPatient ? (
              <>
                <p>
                  {copy.interpreterSource}
                  {": "}
                  {result.interpretation.source}
                </p>
                <p>
                  {copy.interpreter}
                  {": "}
                  {result.interpretation.translation ?? copy.unassessed}
                </p>
                {result.interpretation.findings.map((finding, index) => (
                  <p key={`${finding.code}-${index}`} className="disagreement">
                    {findingLabel(copy, finding.code)}
                    {": "}
                    {finding.detail}
                  </p>
                ))}
              </>
            ) : null}
            {result.voices.some((voice) => voice.id === "challenger" && voice.text) ? (
              <p className="disagreement">
                {copy.disagreement}: {result.voices.find((voice) => voice.id === "challenger")?.text}
              </p>
            ) : null}
            {result.voices.length > 0 ? (
              <details><summary>{t('Консилиум: отдельные мнения')}</summary><ul className="tape">
                {result.voices.map((voice) => (
                  <li key={voice.id}>
                    {copy[voice.id]}
                    {" · "}
                    {voice.status === "not_assessed" ? copy.unassessed : voice.text}
                    {voice.memory ? ` · ${copy.memory}` : ""}
                  </li>
                ))}
              </ul></details>
            ) : null}
            {result.draft.statements.length > 0 ? (
              <details><summary>{t('На чём основан разбор')}</summary><ul className="tape">
                {result.draft.statements.map((statement, index) => (
                  <li key={`${statement.source ?? "memory"}-${index}`} className={statement.held ? "disagreement" : undefined}>
                    {actionLabel(copy, statement.action)}
                    {" · "}
                    {statement.text}
                    {" · "}
                    {fullTextAnchor(statement.source)
                      ? <a href={`#${statement.source}`}>{t("Фрагмент полного текста")}</a>
                      : statement.memory ? copy.memory : statement.source}
                    {statement.held ? ` · ${copy.orderHeld}` : ""}
                  </li>
                ))}
              </ul></details>
            ) : null}
            {result.visit && !result.draft.studyReports?.length ? <p className="visit">{result.visit.text}</p> : null}
            {result.draft.studyReports?.length ? <button type="button" className="open" onClick={()=>void downloadDocx(fixedProfile==='ecg'?t('Заключение ЭКГ'):t('Описание исследования'),studyReportsText(result.draft.studyReports!,t('Заключение')),locale)}>{t('Скачать описание DOCX')}</button> : result.visit ? (
              <button type="button" className="open" onClick={downloadVisit}>
                {copy.protocolDownload}
              </button>
            ) : result.clinicalDraft === 'generated' ? (
              <button type="button" className="open" onClick={attachProtocol}>
                {copy.protocol}
              </button>
            ) : null}
            <details><summary>{t("Обработка и стоимость")}</summary><p>
              {result.cost.usageComplete===false&&t('Не все модели передали данные о токенах; расчётная стоимость неполная.')}
              {result.cost.billingComplete===true ? t('По начислениям OpenRouter, полученным в ответах моделей. ') : t('Расчётная сумма: не все ответы содержали фактическое начисление OpenRouter. Проверьте OpenRouter Activity. ')}
              {copy.cost}: ${money(result.cost.totalUsd)}
              {" · "}
              {money(result.cost.credits)}
              {" "}
              {copy.credits}
            </p>
            <p>{t("Разбивка по этапам рассчитана по тарифам и может отличаться от фактической суммы выше.")}</p>
            {costAudit?.rows.length ? <><p>{t("Ответы моделей по этапам. Это метаданные запросов; тексты пациентов и ответы здесь не сохраняются дополнительно.")}</p><ul className="tape">{costAudit.rows.map(row=><li key={row.stage+":"+row.model}>{t("Этап")}: {row.stage} · {row.model} · {t("Ответы")}: {row.calls} ({t("получено")} {row.received}, {t("обрезано")} {row.truncated}, {t("ошибка")} {row.failed}) · {t("Токены")}: {row.inputTokens} → {row.outputTokens} · {t("Начисление OpenRouter")}: ${money(row.billedUsd)} · {t("Оценка")}: ${money(row.estimatedUsd)} · {row.durationMs} ms</li>)}</ul><p>{t("Из полученных ответов: фактическая стоимость")}: ${money(costAudit.rows.reduce((sum,row)=>sum+row.billedUsd,0))}; {t("расчётная часть")}: ${money(costAudit.rows.reduce((sum,row)=>sum+row.estimatedUsd,0))}. {t("Ответы без данных о токенах")}: {costAudit.missingUsageResponses}.</p>{costAudit.differenceUsd!==0&&<p role="status">{t("Сумма сохранённого анализа отличается от суммы зарегистрированных ответов")}: ${money(costAudit.differenceUsd)}. {t("Проверьте журналы и OpenRouter Activity.")}</p>}<p>{t("Запросы, завершившиеся сетевым отказом без ответа провайдера, могут не иметь данных о начислении. Окончательную сверку выполняйте с OpenRouter Activity.")}</p></> : <p>{t("Для этого результата детализация ответов моделей недоступна; разбивку по фактическим начислениям проверить невозможно.")}</p>}
            <ul className="tape">
              {result.cost.steps.map((step,index) => (
                <li key={step.id+":"+step.model+":"+index}>
                  {step.id==="imageSecondOpinion"?t("Второе мнение"):copy[step.id === "draft" ? "draftModel" : step.id]}
                  {" · "}
                  {step.model ?? copy.noModel}
                  {" · "}
                  {step.status === "planned" ? copy.planned : copy.recorded}
                  {" · "}
                  {step.inputTokens}
                  {" → "}
                  {step.outputTokens}
                  {" · $"}
                  {money(step.usd)}
                  {" · "}
                  {step.durationMs}
                  {" ms"}
                </li>
              ))}
            </ul>
            </details>
            {result.citations.length > 0 ? (
              <div className="sources">
                <h3>{t("Источники для проверки")}</h3>
                {result.citations.map((card) => (
                  <article key={`${card.shelf}-${card.pmid ?? card.url ?? card.title}`}>
                    <p>
                      {card.shelf === "genetics" ? "ClinVar" : card.shelf === "drug" ? "openFDA · SPL" : card.shelf === "world"
                        ? copy.shelfWorld
                        : card.shelf === "russia"
                          ? copy.shelfRussia
                          : card.shelf === "europepmc"
                            ? copy.shelfEurope
                            : card.excerpt ? t("Документы") : t("Заметка об источнике · необязательно")}
                      {card.country ? ` · ${card.country}` : ""}
                    </p>
                    <p>
                      {card.url ? (
                        <a href={card.url} rel="noreferrer">{card.title}</a>
                      ) : (
                        card.title
                      )}
                    </p>
                    {[card.journal, card.year, card.pmid ? `PMID ${card.pmid}` : null].filter(Boolean).length > 0 ? (
                      <p>
                        {[card.journal, card.year, card.pmid ? `PMID ${card.pmid}` : null].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                    {card.edition || card.chapter || card.page ? (
                      <p>{[card.edition, card.chapter, card.page].filter(Boolean).join(" · ")}</p>
                    ) : null}
                    <CitationContent anchor citation={card} />
                    <p>
                      {copy.retrieved} {card.retrieved}
                      {card.license === "open access" ? ` · ${copy.openAccess}` : ""}
                      {card.pdf ? (
                        <>
                          {" · "}
                          <a href={card.pdf} rel="noreferrer">PDF</a>
                        </>
                      ) : null}
                    </p>
                  </article>
                ))}
              </div>
            ) : null}
            {result.unassessed.length > 0 ? (
              <p>
                {copy.unassessed}: {result.unassessed.map(name => `${name} — ${result.ledger.find(entry => entry.source === name)?.reason || copy.unassessed}`).join("; ")}
              </p>
            ) : null}
          </>
        ) : (
          <p className="quiet">{t("Здесь появится ответ после нажатия «Разобрать случай». Пока разбор не запущен, заполнять этот раздел не нужно.")}</p>
        )}
      </aside>
    <PhysicianHelp open={helpOpen} onClose={()=>setHelpOpen(false)}/></main>
  );
}
