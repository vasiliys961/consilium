import {withSpreadsheets,withVcf,withDocuments} from './extract-files.ts';
import {decodeDataUrl} from "../packages/intake/raster.ts";
import {samplePlane} from "../packages/skin/plane.ts";
import {collectChatStream,previewText} from "./analysis-stream.ts";
import {enrichGenomicReview,genomicRecord} from "../packages/genomics/review.ts";
import {terminalEvent,writeTerminalEvent,type RunEvent} from "./telemetry.ts";
import { attachEquipment } from "../packages/attachments/attach.ts";
import { consiliumFocus, runConsilium } from "./consilium.ts";
import { conduct, gatewayOf, type CaseResult, type CaseFile, type ConductInput } from "./conductor.ts";
import { MODELS,creditsFor, priceUsd, totalUsd, chargeForCall, type CostStep, type CostCallStage } from "./cost.ts";
import { guardGeneratedClinicalText } from "./clinical-integrity.ts";
import { imageDataUrl, settleAction, writeLightDraft } from "./draft.ts";
import { GENETIC_CONSULTATION_INSTRUCTION } from '../packages/genomics/clinical-context.ts';
import { geneticsCaution } from "../packages/genomics/inspect.ts";
import { applyClinvar } from "../packages/genomics/clinvar.ts";
import { applyFrequency } from "../packages/genomics/frequency.ts";
import { cpicStatement, loadSnapshot } from "../packages/genomics/cpic.ts";
import { PIXEL_CAUTION } from "../packages/intake/burned.ts";
import { coverFiles } from "../packages/intake/pixels.ts";
import { redactDocument as automaticRedactDocument, redactText as automaticRedactText } from "../packages/intake/redact.ts";
import { hearClip, speechSource } from "../packages/translator/hear.ts";
import { interpretSpeech } from "../packages/translator/speech.ts";
import { writeSpecialistReadings } from "../packages/specialists/read.ts";
import { comprehendFrames, statementsOf } from "../packages/vision/comprehend.ts";
import { assessTracing, networkObservation, networkStatements } from "../packages/ecg/founder.ts";
import { ecgModuleEvidence } from './module-evidence.ts';
import { isEcgSheet, sheetCaution } from "../packages/ecg/inspect.ts";
import { bytesFromBase64 } from "../packages/ecg/open.ts";
import { inspectPhoto } from "../packages/radiology/tiff.ts";
import { labRecord, labStatements } from "../packages/labs/table.ts";
import { labTextFromXlsx } from "../packages/labs/xlsx.ts";
import { proseRecord, proseStatements } from "../packages/docs/prose.ts";
import { textFromDocx } from "../packages/docs/docx.ts";
import { textFromPdf } from "../packages/docs/pdf.ts";
import { textFromVcfGzip } from "../packages/genomics/vcf.ts";
import { modelFrameNames, skinCaution } from "../packages/skin/quality.ts";
import { clipWithheldReason, printedLines } from "../packages/sono/clip.ts";
import { planSearchTopics, translateForSearch } from "./gateway.ts";
import { gatherCitations, orderCitations, type TranslationUsage } from "./literature.ts";
import { parseLocale } from "./locale.ts";


import { retrievePassages, passageCitations } from "./local-rag.ts";
import { drugLabelCitations, reviewDrugLabels } from './drug-labels.ts';
import { checkProposedMedications, reportedMedications } from './drug-interaction-rules.ts';
import { extractPdfText } from "../packages/docs/pdf-pages.ts";
import { prepareServerFiles } from "./intake-server.ts";
import { normalizeFiles, evidenceIndex } from "./module-catalog.ts";
import { planCase, searchTopic } from "./case-plan.ts";
import { reconcileEvidence } from "./evidence-state.ts";
import type { WordBox } from "../packages/intake/burned.ts";
export interface AnalysisDependencies {
  reviewed?:boolean;
  onEvent?: (event:RunEvent)=>void;
  runId?: string;
  streaming?:boolean;
  onPreview?:(text:string)=>void;
  signal?: AbortSignal;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  readWords?: (bytes: Buffer, ext: "png" | "jpg") => Promise<WordBox[] | null>;
}

function settle(
  steps: CostStep[],
  id: CostStep["id"],
  usage: { model: string; inputTokens: number; outputTokens: number; durationMs: number } | null,
): CostStep[] {
  if (!usage) return steps;
  if(!steps.some(step=>step.id===id))return [...steps,{id,model:usage.model,status:"done",inputTokens:usage.inputTokens,outputTokens:usage.outputTokens,durationMs:usage.durationMs,usd:priceUsd(usage.model,usage.inputTokens,usage.outputTokens)}];
  return steps.map((step) =>
    step.id === id
      ? {
          ...step,
          model: usage.model,
          status: "done",
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          durationMs: Math.max(0, Math.round(usage.durationMs) || 0),
          usd: priceUsd(usage.model, usage.inputTokens, usage.outputTokens),
        }
      : step,
  );
}

function withTranslation(steps: CostStep[], usage: TranslationUsage | null): CostStep[] {
  if (!usage) return steps;
  const translation: CostStep = {
    id: "translate",
    model: usage.model,
    status: "done",
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    durationMs: Math.max(0, Math.round(usage.durationMs) || 0),
    usd: priceUsd(usage.model, usage.inputTokens, usage.outputTokens),
  };
  return [steps[0], translation, ...steps.slice(1)].filter((step): step is CostStep => step !== undefined);
}

function geneticsLine(entry: { source: string; genetics: { acmg: { label: string } | null; diplotype: string | null; phenotype: string | null; frequency: { af: number | null } | null; clinvar: { line: string } | null } | null }) {
  const item = entry.genetics;
  if (!item) return "";
  const parts = [item.acmg?.label, item.diplotype, item.phenotype, item.frequency?.af != null ? `gnomAD ${item.frequency.af}` : "", item.clinvar?.line].filter(Boolean);
  return parts.length ? `Genetics ${entry.source}: ${parts.join("; ")}` : "";
}

export async function analyzeCase(body: ConductInput, deps: AnalysisDependencies = {}): Promise<CaseResult> {
  const redactText=deps.reviewed?(value:string)=>({text:value,removed:0}):automaticRedactText;
  const redactDocument=deps.reviewed?(_name:string,value:string|null)=>({text:value,removed:0}):automaticRedactDocument;
  const env = {
    POLZA_API_KEY: process.env.POLZA_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    ...deps.env,
  };
  const startedAt=Date.now();
  const runId=deps.runId??crypto.randomUUID();
  const emit=(event:string,fields:Record<string,unknown>={})=>{const value=terminalEvent(runId,event,fields);if(deps.onEvent)deps.onEvent(value);else if(!deps.fetch)writeTerminalEvent(value);};
  emit("run.started",{files:body.files?.length??0,referenceFiles:body.referenceFiles?.length??0,requestedTask:body.task??"auto"});
  const transport = deps.fetch ?? fetch;
  const modelCalls: NonNullable<CaseResult["cost"]["calls"]> = [];
  const fetchImpl = async (input: Parameters<typeof fetch>[0],init?:RequestInit,stage?:CostCallStage):Promise<Response> => {
    const started=Date.now();const isModel=String(input).includes("/chat/completions");
    const request=isModel?JSON.parse(String(init?.body??"{}")):{};
    const provider=String(input).includes("polza.ai")?"polza":"openrouter";
    if(isModel){emit("model.started",{model:request.model,provider,stage:stage??"unclassified"});if(deps.streaming)deps.onPreview?.("");}
    let response:Response;
    try{response=await transport(input,{...init,...(isModel?{body:JSON.stringify({...request,usage:{include:true},...(deps.streaming?{stream:true,stream_options:{include_usage:true}}:{})})}:{}),signal:deps.signal ? AbortSignal.any([deps.signal,...(init?.signal ? [init.signal] : [])]) : init?.signal});
      if(isModel&&deps.streaming){let last=0;response=await collectChatStream(response,raw=>{const value=previewText(raw);if(Date.now()-last>100&&value){last=Date.now();deps.onPreview?.(value);}});}}
    catch(error){if(isModel)emit("model.failed",{model:request.model,provider,durationMs:Date.now()-started,reason:error instanceof Error?error.name:"transport_error"});throw error;}
    if(String(input).includes("/chat/completions")){

      const data=await response.clone().json().catch(()=>null);
      const usageAvailable=typeof data?.usage?.prompt_tokens==="number"&&typeof data?.usage?.completion_tokens==="number";
      const inputTokens=Number(data?.usage?.prompt_tokens)||0,outputTokens=Number(data?.usage?.completion_tokens)||0;
      const charged=chargeForCall(String(data?.model??request.model??"unknown"),data?.usage);
      emit("model.responded",{model:request.model,provider,stage:stage??"unclassified",httpStatus:response.status,finishReason:data?.choices?.[0]?.finish_reason??null,usageAvailable,inputTokens,outputTokens,durationMs:Date.now()-started,estimatedUsd:priceUsd(String(request.model),inputTokens,outputTokens),...(charged.source==="openrouter"?{billedUsd:charged.usd}:{})});
      modelCalls.push({model:String(data?.model??request.model??"unknown"),stage,inputTokens,outputTokens,durationMs:Date.now()-started,
        status:!response.ok||data?.error||data?.choices?.[0]?.finish_reason==='error'?"failed":data?.choices?.[0]?.finish_reason==="length"?"truncated":"received",
        usageAvailable,usd:charged.usd,billingSource:charged.source});
    }
    return response;
  };
  const stageFetch = (stage:CostCallStage):typeof fetch => (input,init) => fetchImpl(input,init,stage);
  const sheetFiles = await withVcf(await withDocuments(await withSpreadsheets(await prepareServerFiles(normalizeFiles((body.files ?? []).map(file=>({...file,...(!file.imageProfile&&body.imageProfile?{imageProfile:body.imageProfile}:{})})))))));
  for(const file of sheetFiles??[]){if(file.image&&!file.plane){const raster=decodeDataUrl(file.image);if(raster)file.plane=samplePlane(raster);}}
  emit("stage.completed",{stage:"intake",files:sheetFiles?.length??0});
  const result = conduct({
    text: body.text,
    files: sheetFiles,
    locale: body.locale,
    consilium: body.consilium,
    attachment: body.attachment,
    retain: body.retain,
    shelf: body.shelf,
    env,
  });

  const cleanedNote = redactText(body.text ?? "");
  const typedSpeech = body.speech?.text ?? "";
  const audioFile=sheetFiles?.find(file=>file.audio);
  const speechAudio=body.speech?.audio ?? audioFile?.audio;
  const heard = typedSpeech.trim() || !speechAudio
    ? null
    : await hearClip(env, speechAudio!,stageFetch("speech")).catch(() => null);
  const cleanedSpeech = (heard?automaticRedactText:redactText)(speechSource(typedSpeech, heard?.text ?? null));
  let redactions = cleanedNote.removed + cleanedSpeech.removed;
  const note = [cleanedNote.text.trim(), cleanedSpeech.text.trim() ? `Visit transcript: ${cleanedSpeech.text.trim()}` : ""].filter(Boolean).join("\n\n");
  const plan = planCase(note, sheetFiles ?? [], body.task);
  emit("run.planned",{task:plan.task,files:sheetFiles?.length??0,consilium:body.consilium===true});
  let citations = result.citations;
  let steps = result.cost.steps;
  let draft = result.draft;
  let clinicalDraft: "generated" | "unavailable" = "unavailable";
  let voices = result.voices;
  let called = false;
  const prepared = (sheetFiles ?? []).map((file) => {
    const signal = result.ledger.some((entry) => entry.source === file.name && entry.modality === "ecg");
    const document = signal ? { text: file.text ?? null, removed: 0 } : redactDocument(file.name, file.text ?? null);
    redactions += document.removed;
    return {
      name: file.name,
      imageProfile:file.imageProfile,
      image: imageDataUrl(file.image),
      text: document.text,
      masks: file.masks,
    };
  });
  const frequencyPromise = Promise.all(
    result.ledger.map(async (entry) => {
      const file = prepared.find((item) => item.name === entry.source);
      if (entry.modality !== "genetics" || !entry.genetics || !file?.text) return entry;
      if(entry.genetics.review)return {...entry,genetics:await enrichGenomicReview(entry.genetics,result.locale==="ru"?"ru":"en",stageFetch("genetics"),body.externalSearch!==false)};
      const genetics = await applyFrequency(entry.genetics, file.text, result.locale === "ru" ? "ru" : "en");
      return { ...entry, genetics: await applyClinvar(genetics, file.text, result.locale === "ru" ? "ru" : "en") };
    }),
  );
  const tracingPromise = (() => {
    const file = (sheetFiles ?? []).find((item) => {
      const entry = result.ledger.find((row) => row.source === item.name);
      return entry?.modality === "ecg" && item.name && (item.text || item.binary);
    });
    if(!file?.name)return Promise.resolve(null);
    const started=Date.now();emit('module.started',{module:'ECGFounder',provider:'local'});
    return assessTracing({name:file.name,text:file.text,binary:file.binary},result.locale).then(value=>{emit('module.completed',{module:'ECGFounder',provider:'local',status:value?.status??'not_assessed',durationMs:Date.now()-started,estimatedUsd:0});return value;});
  })();
  let ledger = await frequencyPromise;
  ledger = ledger.map((entry) => {
    const paragraphs = entry.prose?.paragraphs ?? [];
    if (!paragraphs.length || !entry.prose) return entry;
    const cleaned = paragraphs.map((paragraph) => redactText(paragraph));
    redactions += cleaned.reduce((sum, item) => sum + item.removed, 0);
    return {
      ...entry,
      prose: { ...entry.prose, paragraphs: cleaned.map((item) => item.text).filter((item) => item.trim()) },
    };
  });
  const covered = await coverFiles(prepared, (name) => ledger.find((entry) => entry.source === name)?.modality, deps.readWords);
  const files = covered.files;
  const clipLocale = result.locale === "ru" ? "ru" : "en";
  ledger = ledger.map((entry) => {
    const cover = covered.covers.find((item) => item.source === entry.source);
    const lines = entry.modality === "ultrasound" ? printedLines(cover?.words ?? []) : [];
    const held = entry.modality === "ultrasound" && entry.status === "read" && Boolean(cover?.withheld);
    return {
      ...entry,
      ...(lines.length ? { printed: lines } : {}),
      ...(held ? { status: "not_assessed" as const, reason: clipWithheldReason(clipLocale) } : {}),
    };
  });
  const pixelCovers = covered.covers.map(({ words: _words, ...cover }) => cover);
  const pixelCaution = pixelCovers.some((cover) => cover.boxes.length > 0) ? PIXEL_CAUTION : "";
  emit('stage.started',{stage:'readings'});
  const specialist = await writeSpecialistReadings(env, {
    locale: result.locale,
    note,
    entries: ledger,
    files,
    caution: pixelCaution || null,secondOpinion:body.secondOpinion===true,
  }, stageFetch("imaging")).catch(() => ({ readings: [], inputTokens: 0, outputTokens: 0, durationMs: 0, model: null,reviewUsage:[],primaryUsage:[] }));
  let frameUsage = specialist.model
    ? { model: specialist.model, inputTokens: specialist.inputTokens, outputTokens: specialist.outputTokens, durationMs: specialist.durationMs }
    : null;

  const seenBySpecialist = new Set(specialist.readings.filter(reading => reading.status === "done").map((reading) => reading.source));
  const allowed = new Set(modelFrameNames(result.ledger, files.map((file) => file.name)));
  const pictured = files.flatMap((file) => {
    const entry = result.ledger.find((row) => row.source === file.name);
    if (!entry || entry.modality === "ultrasound" || inspectPhoto({ name: file.name, image: file.image ?? undefined })) return [];
    return file.image && file.name && allowed.has(file.name) && !seenBySpecialist.has(file.name)
      ? [{ name: file.name, image: file.image, modality: entry.modality,imageProfile:file.imageProfile }]
      : [];
  });
  const tracing = await tracingPromise;
  const eyeCaution = [
    skinCaution(ledger, result.locale === "ru" ? "ru" : "en"),
    geneticsCaution(ledger, result.locale === "ru" ? "ru" : "en"),
    ledger.some(entry=>entry.modality==="genetics")?GENETIC_CONSULTATION_INSTRUCTION:"",
    pixelCaution,
    "Use the actual completed file readings and preserve their limitations. Visual interpretations are provisional. Separately labeled calibrated-grid estimates may be reported as approximate, with their method and uncertainty. Digital module measurements must retain their method and units. Never claim that an unassessed file is normal.",
    tracing ? "Network scores belong only to the network observation. You may discuss clinical hypotheses supported by independent evidence, but never attribute them to a detector that did not report them." : "",
    sheetCaution(ledger, result.locale === "ru" ? "ru" : "en"),
  ]
    .filter(Boolean)
    .join(" ");
  const frame = pictured.length
    ? await comprehendFrames(env, { note, frames: pictured, locale: result.locale, caution: eyeCaution,secondOpinion:body.secondOpinion===true,evidenceContext:tracing?networkObservation(tracing):undefined }, stageFetch("imaging")).catch(() => null)
    : null;
  if (frame?.model) {
    frameUsage = {
      model: frameUsage?.model ?? frame.model,
      inputTokens: (frameUsage?.inputTokens ?? 0) + frame.inputTokens,
      outputTokens: (frameUsage?.outputTokens ?? 0) + frame.outputTokens,
      durationMs: (frameUsage?.durationMs ?? 0) + frame.durationMs,
    };
  }
  ledger = reconcileEvidence(ledger, { accounts: frame?.accounts ?? [], readings: specialist.readings, covers: pixelCovers,
    failures: frame?.failures ?? [], imageNames: prepared.filter(file => file.image).map(file => file.name) }, result.locale === "ru");
  ledger = ledger.map(entry => {
    if(entry.source===audioFile?.name)return {...entry,status:heard?.text?"read":"not_assessed",reason:heard?.text?"Голос расшифрован и включён в контекст случая.":"Расшифровка голоса не получена."};
    const original = sheetFiles?.find(file => file.name === entry.source);
    if (!original?.intakeNote) return entry;
    const children=ledger.filter(child=>sheetFiles?.some(file=>file.name===child.source && file.parent===entry.source));
    return {...entry, status: children.some(child=>child.status==="read")?"read":entry.status, reason:original.intakeNote};
  });
  emit("stage.completed",{stage:"readings",readFiles:ledger.filter(entry=>entry.status==="read").length,unassessedFiles:ledger.filter(entry=>entry.status!=="read").length});
  const labLocale = result.locale === "ru" ? "ru" : "en";
  const copiedLabs = ledger.flatMap((entry) => (entry.labs?.rows.length ? [{ source: entry.source, rows: entry.labs.rows }] : []));
  const labRows = copiedLabs.flatMap((entry) => entry.rows);
  const copiedProse = ledger.flatMap((entry) => (entry.prose?.paragraphs.length ? [{ source: entry.source, paragraphs: entry.prose.paragraphs }] : []));
  const proseParagraphs = copiedProse.flatMap((entry) => entry.paragraphs);
  const observation = [
    labRecord(copiedLabs, labLocale),
    tracing ? networkObservation(tracing) : "",
    ...ledger.map(geneticsLine),
    ...ledger.flatMap(entry=>entry.genetics?[redactText(genomicRecord(entry.genetics,entry.source)).text]:[]),
    proseRecord(copiedProse, labLocale),
    ...specialist.readings
      .filter((reading) => reading.status === "done")
      .map((reading) => `File ${reading.source}\nSeen: ${reading.items.map((item) => item.text).join("; ") || "none"}\nReading, unsigned: ${reading.text}`),
    ...ledger.flatMap((entry) =>
      entry.printed?.length ? [`Printed on ${entry.source}: ${entry.printed.join("; ")}. Copy these numbers exactly.`] : [],
    ),
    frame?.text ?? "",
    ...specialist.readings.filter(r=>r.secondOpinion).map(r=>`Second-reader image review for ${r.source}: ${JSON.stringify(r.secondOpinion)}. Preserve clinically material differences; no automatic winner.`),
    ...(sheetFiles ?? []).filter(file=>file.intakeNote).map(file=>`${file.name}: ${file.intakeNote}`),
  ]
    .filter(Boolean)
    .join("\n");
  // Reference documents never enter the patient observation ledger.
  const references = await withDocuments(await withSpreadsheets(body.referenceFiles), true);
  const passages = retrievePassages([note, observation].join("\n"), references ?? []);
  const localReferences = passageCitations(passages, new Date().toISOString().slice(0,10));
  const sourceLocale = body.sourceLocale;
  const subject = body.externalSearch === false ? null : searchTopic(note, observation, plan.task, plan.search, Boolean(sourceLocale));
  emit('stage.started',{stage:'sources'});
  const [gathered, medicationReview] = await Promise.all([
    subject ? gatherCitations(subject, {
      fetch: stageFetch("evidence"), now: new Date(), locale: result.locale, clinical: plan.task === 'management' || plan.task === 'evidence',
      translate: query => translateForSearch(env, query, stageFetch("evidence"), result.locale),
      ...(sourceLocale ? {
        sourceLocale,
        planTopics: (query: string) => planSearchTopics(env, query, sourceLocale, stageFetch("evidence")),
      } : {}),
    }).catch(() => ({citations: [], usage: null})) : {citations: [], usage: null},
    body.drugLabels?.length ? reviewDrugLabels(body.drugLabels, body.externalSearch !== false, stageFetch("evidence"), deps.signal) : undefined,
  ]);
  const medicationCitations = drugLabelCitations(medicationReview?.labels ?? [], new Date().toISOString().slice(0,10));
  const geneticCitations:import('./literature.ts').Citation[]=ledger.flatMap(entry=>(entry.genetics?.review?.variants??[]).flatMap(variant=>{
    const record=variant.clinvar;if(record?.status!=='matched'||!record.url)return [];
    return [{shelf:'genetics' as const,title:`ClinVar · ${record.title}`,url:record.url,retrieved:new Date().toISOString().slice(0,10),license:null,country:null,pmid:null,journal:'NCBI ClinVar',year:null,pdf:null,edition:null,chapter:null,page:null,excerpt:`Exact supplied allele: ${variant.id}. Germline classification: ${record.significance}; review status: ${record.reviewStatus}; last evaluated: ${record.evaluated}; conditions: ${record.conditions?.join('; ')}. This is the ClinVar assertion, not a new local ACMG classification.`}];
  }));
  const gatheredCitations = [...geneticCitations,...medicationCitations, ...gathered.citations, ...localReferences, ...result.citations];
  citations = sourceLocale ? gatheredCitations : orderCitations(gatheredCitations);
  emit("stage.completed",{stage:"sources",referenceFiles:references?.length??0,passages:passages.length,citations:citations.length,externalSearch:Boolean(subject)});
  steps = withTranslation(steps, gathered.usage);
  called = gathered.usage !== null;
  const visual = frame?.accounts ?? [];
  const visualReadable = visual.filter(account => account.status !== "unreadable");
  const hasOtherEvidence = copiedLabs.length > 0 || copiedProse.length > 0 || ledger.some(entry => entry.genetics && entry.status === "read") || specialist.readings.some(reading => reading.status === "done");
  const blockedInterpretation = plan.task === "interpret" && prepared.some(file => file.image) && !visualReadable.length && !hasOtherEvidence;
  const failedFiles = ledger.filter(entry => entry.status !== "read").map(entry => `${entry.source}: ${entry.reason}`).join("\n");
  if (blockedInterpretation) {
    draft = {status: "unsigned", summary: ledger.filter(entry => entry.status !== "read").map(entry => `${entry.source}: ${entry.reason}`).join("\n"), statements: []};
  } else if (plan.needsInput || (!note && !observation)) {
    draft = { status: "unsigned", summary: result.locale === "ru" ? "Добавьте клинический вопрос или материалы для разбора." : "Add a clinical question or materials to interpret.", statements: [] };
  } else if (note || observation || tracing?.cleared.length) {
    emit('stage.started',{stage:'synthesis'});
    const budgetMs = Math.max(1, Math.min(145000, (body.deadlineMs ?? 300000) - (Date.now() - startedAt) - 5000));
    const written = await writeLightDraft(env, {
      primaryModel:visualReadable.length||tracing?.status==='read'||specialist.readings.some(r=>r.status==='done')?([...new Set([...(frame?.primaryUsage??[]),...specialist.primaryUsage].map(u=>u.model))].length===1?[...(frame?.primaryUsage??[]),...specialist.primaryUsage][0].model:MODELS.pro):undefined,
      locale: result.locale,
      task: plan.task,
      budgetMs,
      signal: deps.signal,
      onFailure: (model, reason) => {
        emit('model.rejected', { model, reason, stage: 'synthesis' });
      },
      note: note || "Interpret the attached evidence.",
      citations,
      referenceImages:(references??[]).filter(file=>file.image&&file.librarySource).map(file=>({image:file.image!,key:`library:${file.librarySource!.documentId}:${file.librarySource!.chunkId}`,title:file.librarySource!.title,page:file.librarySource!.page})),
      files: ledger.filter(entry => entry.status === "read").map(entry => entry.source),
      observation: [observation, `Processing ledger (status is authoritative):\n${evidenceIndex(ledger)}`].filter(Boolean).join("\n\n"),
      caution: [eyeCaution, failedFiles ? `Files not assessed (never describe as normal):\n${failedFiles}` : "",
        medicationReview?.unavailable.length ? 'One or more selected medication labels could not be retrieved. Do not imply those labels were checked.' : '',
      ].filter(Boolean).join("\n"),
    }, stageFetch("synthesis")).catch(() => null);
    if (written) {
      if (plan.task === 'management' && written.report) {
        const currentMedications = reportedMedications(cleanedNote.text);
        for (const option of written.report.management) {
          const localInteractions = checkProposedMedications(currentMedications, option.medications ?? []);
          if (localInteractions.length) option.localInteractions = localInteractions;
        }
      }
      draft = { status: "unsigned", summary: written.summary, statements: written.statements, ...(written.report ? { report: written.report } : {}), ...(written.studyReports?.length ? { studyReports: written.studyReports } : {}) };
      clinicalDraft = "generated";
      steps = settle(steps, "draft", written);
      called = true;
      emit('stage.completed',{stage:'synthesis'});
    } else {
      const preserved = visualReadable.map(account => `${account.source}: ${account.reading}`).join("\n");
      draft = {status: "unsigned", summary: [preserved, result.locale === "ru" ? "Итоговый ответ не получен: модель не вернула завершённый структурированный результат. Повторите разбор. Доступные результаты обработки сохранены ниже." : "Final answer unavailable: the model did not return a valid complete result. Retry; available evidence is preserved below."].filter(Boolean).join("\n\n"), statements: []};
    }
  } else if (frame && frame.accounts.length) {
    const lines = statementsOf(frame.accounts, result.locale);
    draft = {
      status: "unsigned",
      summary: lines.map((line) => line.text).join(" "),
      statements: lines,
    };
  } else if (specialist.readings.some((reading) => reading.status === "done")) {
    const written = specialist.readings.filter((reading) => reading.status === "done");
    const lines = statementsOf(
      written.map((reading) => ({ source: reading.source, seen: reading.items.map((item) => item.text), reading: reading.text })),
      result.locale,
    );
    draft = {
      status: "unsigned",
      summary: lines.map((line) => line.text).join(" "),
      statements: lines,
    };
  }
  if (tracing) {
    // Detector output is an independent source, not a vocabulary filter on clinical reasoning.
    draft = {...draft, statements: [...networkStatements(tracing, result.locale), ...draft.statements]};
  }
  const passport = ledger.find((entry) => entry.genetics?.diplotype && entry.genetics.gene);
  const copied = cpicStatement(
    loadSnapshot(),
    { gene: passport?.genetics?.gene ?? null, diplotype: passport?.genetics?.diplotype ?? null, note },
    result.locale,
  );
  if (copied) {
    draft = { ...draft, statements: [...draft.statements, copied] };
  }
  const copiedPrint = ledger.flatMap((entry) =>
    (entry.printed ?? []).map((line) => settleAction({ text: line, source: `file:${entry.source}`, memory: false })),
  );
  if (copiedPrint.length) {
    const seenPrint = new Set(copiedPrint.map((item) => item.text));
    draft = {
      ...draft,
      statements: [...copiedPrint, ...draft.statements.filter((item) => !seenPrint.has(item.text))],
    };
  }
  const validationWarnings: string[] = [];
  if (labRows.length || proseParagraphs.length) {
    // Exact extracted facts remain separate. Never delete clinical sentences with a vocabulary/number regex.
    const official=[...labStatements(copiedLabs),...proseStatements(copiedProse)];
    const seen=new Set(official.map(item=>item.text));
    const checked=draft.statements.filter(item=>!seen.has(item.text)).map(item=>{
      if(!item.source?.startsWith("file:"))return item;
      const source=item.source.slice(5);const original=prepared.find(file=>file.name===source)?.text;
      if(!original)return item;
      const numbers=item.text.match(/\d+(?:[.,]\d+)?/g)??[];
      const allowed=new Set(original.match(/\d+(?:[.,]\d+)?/g)??[]);
      if(numbers.some(number=>!allowed.has(number))){validationWarnings.push(`${source}: числовое утверждение черновика не совпало с извлечённым текстом; проверьте оригинал.`);return {...item,held:true};}
      return item;
    });
    draft={...draft,statements:[...official,...checked]};
  }
  for(const usage of [...(frame?.reviewUsage??[]),...specialist.reviewUsage]){steps.push({id:"imageSecondOpinion",model:usage.model,status:"done",inputTokens:usage.inputTokens,outputTokens:usage.outputTokens,durationMs:usage.durationMs,usd:priceUsd(usage.model,usage.inputTokens,usage.outputTokens)});}
  if (frameUsage) {
    steps=steps.filter(step=>step.id!=='frame');
    const grouped=new Map<string,{inputTokens:number;outputTokens:number;durationMs:number}>();
    for(const usage of [...(frame?.primaryUsage??[]),...specialist.primaryUsage]){const prior=grouped.get(usage.model)??{inputTokens:0,outputTokens:0,durationMs:0};grouped.set(usage.model,{inputTokens:prior.inputTokens+usage.inputTokens,outputTokens:prior.outputTokens+usage.outputTokens,durationMs:prior.durationMs+usage.durationMs});}
    for(const [model,usage]of grouped)steps.push({id:'frame',model,status:'done',...usage,usd:priceUsd(model,usage.inputTokens,usage.outputTokens)});
    called = true;
  }

  const speech = cleanedSpeech.text.trim();
  if (heard?.model) {
    const hearing: CostStep = {
      id: "hear",
      model: heard.model,
      status: "done",
      inputTokens: heard.inputTokens,
      outputTokens: heard.outputTokens,
      durationMs: heard.durationMs,
      usd: priceUsd(heard.model, heard.inputTokens, heard.outputTokens),
    };
    steps = [steps[0], hearing, ...steps.slice(1)].filter((step): step is CostStep => step !== undefined);
    called = true;
  }
  const interpretation = speech && body.speech?.audience === "patient"
    ? await interpretSpeech(env, {
        text: speech,
        locale: result.locale,
        audience: body.speech?.audience,
        target: body.speech?.target,
      }, stageFetch("speech")).catch(() => null)
    : null;
  if (interpretation?.model) {
    const interpreter: CostStep = {
      id: "interpreter",
      model: interpretation.model,
      status: "done",
      inputTokens: interpretation.inputTokens,
      outputTokens: interpretation.outputTokens,
      durationMs: interpretation.durationMs,
      usd: priceUsd(interpretation.model, interpretation.inputTokens, interpretation.outputTokens),
    };
    steps = [steps[0], interpreter, ...steps.slice(1)].filter((step): step is CostStep => step !== undefined);
    called = true;
  }

  const checkedDraft=guardGeneratedClinicalText(draft,note);
  if(checkedDraft.changed){draft=checkedDraft.value;validationWarnings.push("В черновике утверждалась одышка в покое, хотя в исходных данных она не документирована. Формулировка заменена на неопределённую.");}

  if ((body.consilium === true || /консилиум|several opinions|second opinions/i.test(note)) && note && !blockedInterpretation && clinicalDraft === "generated") {
    emit('stage.started',{stage:'consilium'});
    const limit = AbortSignal.timeout(Math.max(1, Math.min(95000, (body.deadlineMs ?? 300000) - (Date.now() - startedAt) - 4000)));
    const councilFetch: typeof fetch = (url, init) => {
      limit.throwIfAborted();
      return fetchImpl(url, {...init, signal: AbortSignal.any([limit, ...(init?.signal ? [init.signal] : [])])}, "consilium");
    };
    const spoken = await runConsilium(env, {
      note,
      locale: result.locale,
      draft: draft.summary,
      report: draft.report,
      citations,
      record: observation || null,
      focus: consiliumFocus(note, ledger.filter(entry => entry.status === 'read').map(entry => entry.modality)),
    }, councilFetch).catch(() => []);
    const guarded = spoken.map(voice=>{const checked=guardGeneratedClinicalText(voice.text,note);if(checked.changed)validationWarnings.push(`Мнение ${voice.id}: утверждение об одышке в покое не подтверждено исходными данными.`);return {...voice,text:checked.value};});
    for (const voice of spoken) {
      if (voice.status === "done" && voice.model) {
        steps = settle(steps, voice.id, { ...voice, model: voice.model });
        called = true;
      }
    }
    voices = guarded;
    emit('stage.completed',{stage:'consilium'});
  }

  const id = body.caseId?.trim() || crypto.randomUUID();
  const equipmentName = body.equipment?.name ?? null;
  const attached = equipmentName
    ? attachEquipment({
        name: equipmentName,
        caseId: id,
        locale: result.locale,
        specialty: body.equipment?.specialty,
        draft: draft.summary,
        speech: interpretation?.source ?? speech,
      })
    : null;

  emit(deps.signal?.aborted?"run.aborted":"run.completed",{usageComplete:modelCalls.every(call=>call.usageAvailable!==false),durationMs:Date.now()-startedAt,task:plan.task,clinicalDraft,modelResponses:modelCalls.length,readFiles:ledger.filter(entry=>entry.status==="read").length,unassessedFiles:ledger.filter(entry=>entry.status!=="read").length,estimatedUsd:modelCalls.reduce((sum,call)=>sum+call.usd,0)});
  return {
    ...result,
    clinicalDraft,
    ...(medicationReview ? {medicationReview} : {}),
    validationWarnings,
    task: plan.task,
    retrieval: {localDocuments:references?.length ?? 0,passages:passages.length,externalSearch:Boolean(subject)},
    visualReadings: frame?.accounts ?? [],
    ledger,
    id,
    draft,
    voices,
    ...(tracing ? {ecgEvidence:ecgModuleEvidence(tracing,ledger.find(entry=>entry.source===tracing.source)?.sha256)} : {}),
    readings: specialist.readings,
    interpretation,
    citations,
    visit: attached?.visit ?? null,
    attachment: equipmentName ?? result.attachment,
    retained: result.retained,
    unassessed: [
      ...(attached && attached.status !== "read" && equipmentName ? [equipmentName] : []),
      ...ledger.filter(entry => entry.status !== "read").map(entry => entry.source),

    ],
    cost: { usageComplete:modelCalls.every(call=>call.usageAvailable!==false),billingComplete:modelCalls.length>0&&modelCalls.every(call=>call.billingSource==="openrouter"),totalUsd: modelCalls.length ? modelCalls.reduce((sum,call)=>sum+call.usd,0) : totalUsd(steps), credits: creditsFor(modelCalls.length ? modelCalls.reduce((sum,call)=>sum+call.usd,0) : totalUsd(steps)), steps, calls:modelCalls },
    gateway: { ...result.gateway, called:called || modelCalls.length>0 },
    redactions,
    pixelCovers,
  };
}

