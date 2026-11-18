"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import SingleDicomAnalysis from './SingleDicomAnalysis';
import { useEffect, useMemo, useRef, useState } from "react";
import type { DicomSeries } from "../lib/dicom-series";
import { planVisionFrameSamples, MAX_VISION_SAMPLE_FRAMES, type VisionFramePlan } from "../lib/vision-frame-plan";
import { useAnalysisSound } from "./AnalysisSoundProvider";
import { routeDicomConsilium } from "../lib/dicom-consilium-routing";
import { routeUniversalCtMrVision } from "../lib/universal-ct-mr-vision-route";
import { dispatchDicomDetectors, type DetectorDispatch } from "../lib/dicom-detector-dispatch";
import { createLocalDetectorReview } from "../lib/local-detector-physician-review";
import { installedDetectorRegistry, type InstalledIchRuntime, type InstalledIanpanRuntime } from "../lib/installed-detector-registry";
import { checkPublicIchWorker, runPublicIchWorker, IANPAN_MODEL_ID, IANPAN_MODEL_REVISION } from "../lib/public-ich-worker";
import { planBudgetedVisionReview } from "../lib/vision-budget-plan";
import { createVisionBatches, accountReportedVisionUsage } from "../lib/vision-batch-ledger";
import { decodeDicomPreview } from "../lib/dicom-lite";
import { MAX_PRIVACY_PIXELS } from "../lib/vision-privacy";
import VisionPrivacyPreparation from "./VisionPrivacyPreparation";
import FullVolumeLocalPreparation from "./FullVolumeLocalPreparation";
import ReviewedSeriesAnalysis from "./ReviewedSeriesAnalysis";
import PlainImageAnalysis from "./PlainImageAnalysis";
import type { SanitizedDetectorBundle } from "../lib/detector-consilium-evidence";
import type { ClnVerifiedLocalEvidence } from "../lib/cln-physician-local-review";
import { createClnFrameRelativeEvidence, type ClnFrameRelativeEvidence } from "../lib/cln-frame-relative-evidence";
import { sameSeriesR231Facts, type CapturedLocalSpecialist } from "../lib/same-series-r231-cloud-evidence";
import { sameSeriesLaa950ForReview, type CapturedLocalLaa950 } from "../lib/same-series-laa950-review";
export default function VisionFramePlanningPanel({ series, comparisonSeries = series, activeSeriesKey, fileById, onOpenSlice, onInspectFinding, capturedSpecialist, capturedLaa950, ichRuntime, publicResearchAuthorized = false, originalDetectorEvidence = null, clnVerifiedLocal = null, fromPrimaryAnalysis = false, primaryActionAvailable = false, primaryAnalysisStage = "idle", researchMode = false, }: {
    series: readonly DicomSeries[];
    comparisonSeries?: readonly DicomSeries[];
    activeSeriesKey: string | null;
    fileById: ReadonlyMap<string, File>;
    onOpenSlice: (fileId: string) => void;
    onInspectFinding?: (fileId: string, window: {
        width: number;
        center: number;
    } | null) => void;
    capturedSpecialist?: CapturedLocalSpecialist | null;
    capturedLaa950?: CapturedLocalLaa950 | null;
    /** Present only when a verified local ICH worker is really connected. */
    ichRuntime?: InstalledIchRuntime | null;
    publicResearchAuthorized?: boolean;
    originalDetectorEvidence?: SanitizedDetectorBundle | null;
    clnVerifiedLocal?: ClnVerifiedLocalEvidence | null;
    fromPrimaryAnalysis?: boolean;
    primaryActionAvailable?: boolean;
    researchMode?: boolean;
    primaryAnalysisStage?: "idle" | "running" | "completed" | "vision-only" | "cancelled";
}) {
    const __ui = useUiTranslator();
    const [requested, setRequested] = useState(4);
    const [extraOpened, setExtraOpened] = useState(false);
    // Editing the sampled frame count must invalidate privacy approval until the
    // physician explicitly generates the new source-bound plan.
    const previousRequested = useRef(requested);
    const [targetFrame, setTargetFrame] = useState("");
    const [report, setReport] = useState<VisionFramePlan | null>(null);
    const [notice, setNotice] = useState("");
    const [detectorResult, setDetectorResult] = useState<DetectorDispatch | null>(null);
    const [detectorBusy, setDetectorBusy] = useState(false);
    const detectorController = useRef<AbortController | null>(null);
    const [unifiedStarted, setUnifiedStarted] = useState(false);
    const [ichEndpoint, setIchEndpoint] = useState("http://127.0.0.1:8766");
    const [ichToken, setIchToken] = useState("");
    const [ichResearchConfirmed, setIchResearchConfirmed] = useState(false);
    const [ichWorkerReady, setIchWorkerReady] = useState(false);
    const [ichWorkerNotice, setIchWorkerNotice] = useState("");
    const [thumbnails, setThumbnails] = useState<Record<string, {
        url?: string;
        error?: string;
    }>>({});
    const { completionChime } = useAnalysisSound();
    let specialistFacts = null, specialistWarning = "";
    if (capturedSpecialist) {
        try {
            const selected = series.find(s => s.key === activeSeriesKey);
            specialistFacts = sameSeriesR231Facts(selected, capturedSpecialist);
        }
        catch {
            specialistWarning = "Результат CPU R231 не совпадает с текущей DICOM-серией. Численные данные не будут переданы.";
        }
    }
    let localLaa950 = null, laaWarning = "";
    if (capturedLaa950) {
        try {
            localLaa950 = sameSeriesLaa950ForReview(series.find(x => x.key === activeSeriesKey), capturedSpecialist, capturedLaa950);
        }
        catch {
            laaWarning = "Показатель LAA−950 не совпадает с текущей КТ и маской R231; не использовать.";
        }
    }
    const session = { endpoint: ichEndpoint, token: ichToken };
    const liveIanpanRuntime: InstalledIanpanRuntime | null = ichWorkerReady && ichResearchConfirmed ? {
        ready: true, modelId: IANPAN_MODEL_ID, modelRevision: IANPAN_MODEL_REVISION,
        dataPolicy: "public-reference-only",
        run: (s, signal) => runPublicIchWorker(session, s, fileById, signal ?? new AbortController().signal, setIchWorkerNotice),
    } : null;
    const registered = installedDetectorRegistry({
        capturedSpecialist, capturedLaa950, ichRuntime, publicResearchAuthorized: publicResearchAuthorized || ichResearchConfirmed,
        ianpanRuntime: liveIanpanRuntime,
    });
    const sourceBoundCln = useMemo(() => {
        const selected = series.find(s => s.key === activeSeriesKey);
        if (!selected || selected.modality !== "CT" || !clnVerifiedLocal ||
            clnVerifiedLocal.dimensions[2] !== selected.members.length ||
            !/^[a-f0-9]{64}$/.test(clnVerifiedLocal.sourceNiftiSha256) ||
            clnVerifiedLocal.candidates.length > 20 ||
            clnVerifiedLocal.candidates.some(c => !Number.isSafeInteger(c.sliceIndex) ||
                c.sliceIndex < 0 || c.sliceIndex >= selected.members.length ||
                selected.members[c.sliceIndex].metadata.sopInstanceUid !== c.sopInstanceUid))
            return null;
        return clnVerifiedLocal;
    }, [series, activeSeriesKey, clnVerifiedLocal]);
    const choice = useMemo(() => {
        // Include up to two distinct source-verified lesion centers in the same
        // four-frame budget. Gemini receives original source pixels independently,
        // never the CLN model's labels or provisional diagnosis.
        return planVisionFrameSamples(series, activeSeriesKey, requested, sourceBoundCln?.candidates.map(c => c.sliceIndex) ?? null);
    }, [series, activeSeriesKey, requested, sourceBoundCln]);
    let clnSpatial: ClnFrameRelativeEvidence | null = null;
    if (sourceBoundCln?.candidates.length && report?.status === "ready-for-local-preview" &&
        report.seriesKey === activeSeriesKey && report.frames.length <= 4) {
        try {
            const selected = series.find(s => s.key === activeSeriesKey)!;
            const frames = report.frames.map((frame, i) => ({
                frameId: "frame-" + (i + 1),
                sourceAxialIndex: selected.members.findIndex(m => m.id === frame.fileId && m.metadata.sopInstanceUid === frame.sopInstanceUid),
            }));
            if (frames.some(f => f.sourceAxialIndex < 0))
                throw Error("CLN source slice missing");
            clnSpatial = createClnFrameRelativeEvidence({
                sourceImageSha256: sourceBoundCln.sourceNiftiSha256,
                detectorSourceImageSha256: sourceBoundCln.sourceNiftiSha256,
                imageDimensions: sourceBoundCln.dimensions,
                reviewedFrames: frames, alignment: "source-dicom-pixel-to-png",
                nativeCandidates: sourceBoundCln.candidates.map(c => ({
                    componentId: c.componentId, sourceVoxelCentroidIJK: c.sourceVoxelCentroidIJK,
                    candidateVolumeMl: c.candidateVolumeMl,
                })),
            });
        }
        catch {
            clnSpatial = null;
        }
    }
    const consilium = useMemo(() => routeDicomConsilium(series.find(s => s.key === activeSeriesKey) ?? null), [series, activeSeriesKey]);
    const universal = useMemo(() => routeUniversalCtMrVision(series.find(s => s.key === activeSeriesKey) ?? null), [series, activeSeriesKey]);
    const fullVolumeCost = useMemo(() => {
        if (choice.status !== "ready-for-local-preview" || !choice.seriesKey)
            return null;
        const selected = series.find(s => s.key === choice.seriesKey);
        if (!selected || !selected.members.length)
            return null;
        const index = targetFrame.trim() === "" ? null : Number(targetFrame) - 1;
        if (index !== null && (!Number.isSafeInteger(index) || index < 0 || index >= selected.members.length))
            return null;
        try {
            return planBudgetedVisionReview({ frameCount: selected.members.length,
                flaggedIndices: index === null ? [] : [index] });
        }
        catch {
            return null;
        }
    }, [choice, series, targetFrame]);
    const batchPreview = useMemo(() => {
        if (!fullVolumeCost)
            return null;
        const batches = createVisionBatches(fullVolumeCost);
        return { batches, ledger: accountReportedVisionUsage(fullVolumeCost, batches, []) };
    }, [fullVolumeCost]);
    useEffect(() => {
        // Prevent a previous patient/study result from arriving after source change.
        detectorController.current?.abort();
        setDetectorBusy(false);
        setIchWorkerReady(false);
        setIchWorkerNotice("");
        // Selection changes must invalidate old source pixels AND prepare the
        // new eligible preview in the SAME reset effect. A one-shot ref was unsafe
        // under React Strict Mode: the second effect replay cleared the preview,
        // but its ref then blocked the second automatic preparation.
        // A requested frame-count change, unlike a Strict Mode effect replay,
        // must discard the old privacy review until the new plan is confirmed.
        const frameCountChanged = previousRequested.current !== requested;
        previousRequested.current = requested;
        setReport(!frameCountChanged && activeSeriesKey && universal.status === "eligible_for_authorization" &&
            choice.status === "ready-for-local-preview" ? choice : null);
        setDetectorResult(null);
        setUnifiedStarted(false);
        setNotice("");
        setThumbnails({});
    }, [series, activeSeriesKey, requested, universal, choice]);
    useEffect(() => {
        if (!report)
            return;
        if (!researchMode && fromPrimaryAnalysis)
            return; // Full-series UI owns its one bounded group.
        let cancelled = false;
        const previewController = new AbortController();
        setThumbnails({});
        const render = async () => {
            // Serial bounded decoding: never hold four full DICOM pixel arrays on M1.
            for (const frame of report.frames) {
                if (cancelled)
                    return;
                const file = fileById.get(frame.fileId);
                let preview: {
                    url?: string;
                    error?: string;
                };
                if (!file)
                    preview = { error: "Исходный файл отсутствует." };
                else if (file.size > 6 * 1024 * 1024)
                    preview = { error: "Локальная миниатюра ограничена размером 6 МиБ; откройте срез в Cornerstone." };
                else {
                    try {
                        const result = await decodeDicomPreview(file, { maxPixels: MAX_PRIVACY_PIXELS });
                        preview = { url: result.url };
                    }
                    catch {
                        try {
                            const { decodeCornerstoneVisionPreview } = await import('../lib/cornerstone-vision-preview');
                            preview = { url: await decodeCornerstoneVisionPreview(file, MAX_PRIVACY_PIXELS, previewController.signal) };
                        }
                        catch {
                            preview = { error: "Не удалось подготовить этот срез для анализа. Просмотр снимков доступен, но заключение по этому кадру не сформировано." };
                        }
                    }
                }
                if (cancelled)
                    return;
                setThumbnails(previous => ({ ...previous, [frame.fileId]: preview }));
            }
        };
        void render();
        return () => { cancelled = true; previewController.abort(); };
    }, [report, fileById, researchMode, fromPrimaryAnalysis]);
    const startUnified = () => {
        const selected = series.find(s => s.key === activeSeriesKey) ?? null;
        if (!selected || universal.status !== "eligible_for_authorization")
            return;
        detectorController.current?.abort();
        const controller = new AbortController();
        detectorController.current = controller;
        setUnifiedStarted(true);
        setReport(choice.status === "ready-for-local-preview" ? choice : null);
        setDetectorResult(null);
        setDetectorBusy(true);
        setIchWorkerReady(false);
        setIchWorkerNotice("");
        const sessionSnapshot = { endpoint: ichEndpoint, token: ichToken };
        void (async () => {
            let checkedRuntime: InstalledIanpanRuntime | null = null;
            let reason = "";
            // One existing launch: an optional authentic model runs only if the
            // curator's exact public DICOM bytes are installed on a trusted worker.
            if (ichResearchConfirmed && ichToken && selected.modality === "CT" &&
                selected.members.every(m => m.metadata.bodyRegion === "HEAD")) {
                try {
                    setIchWorkerNotice("Проверяем оригинальные ICH-веса на изолированном worker...");
                    await checkPublicIchWorker(sessionSnapshot, controller.signal);
                    if (controller.signal.aborted)
                        return;
                    checkedRuntime = {
                        ready: true, modelId: IANPAN_MODEL_ID, modelRevision: IANPAN_MODEL_REVISION,
                        dataPolicy: "public-reference-only",
                        run: async (s, signal) => {
                            try {
                                return await runPublicIchWorker(sessionSnapshot, s, fileById, signal ?? controller.signal, setIchWorkerNotice);
                            }
                            catch (error) {
                                if (!controller.signal.aborted)
                                    setIchWorkerNotice("ICH worker отказал: " + (error instanceof Error ? error.message : "инференс недоступен"));
                                throw error;
                            }
                        },
                    };
                    setIchWorkerReady(true);
                }
                catch (error) {
                    if (controller.signal.aborted)
                        return;
                    reason = error instanceof Error ? error.message : "ICH worker недоступен.";
                    setIchWorkerNotice("ICH не запущен: " + reason);
                }
            }
            const actual = installedDetectorRegistry({
                capturedSpecialist, capturedLaa950, ichRuntime,
                publicResearchAuthorized: publicResearchAuthorized || ichResearchConfirmed,
                ianpanRuntime: checkedRuntime,
            });
            const result = await dispatchDicomDetectors(selected, actual.executors, controller.signal);
            if (controller.signal.aborted)
                return;
            setDetectorResult(result);
            if (reason)
                setNotice("Локальная часть: " + reason + " Другие совместимые исполнители проверены.");
        })()
            .catch(() => {
            if (!controller.signal.aborted)
                setNotice("Локальный этап не завершился. Отсутствие Evidence не исключает патологию.");
        })
            .finally(() => {
            if (!controller.signal.aborted)
                setDetectorBusy(false);
        });
        setNotice("Единый маршрут запущен: проверяем локальные модели; разрешённые Gemini/Opus требуют отдельного обезличивания и подтверждения.");
    };
    const exportLocalDetectorReview = () => {
        const selected = series.find(s => s.key === activeSeriesKey) ?? null;
        if (!selected || !detectorResult || detectorBusy) {
            setNotice("Нет завершённого локального исследования для врачебного экспорта.");
            return;
        }
        try {
            const report = createLocalDetectorReview(selected, detectorResult, new Date().toISOString());
            const json = JSON.stringify(report, null, 2);
            if (new TextEncoder().encode(json).byteLength > 2 * 1024 * 1024)
                throw Error("Export exceeds 2 MiB");
            const objectUrl = URL.createObjectURL(new Blob([json], { type: "application/json" }));
            try {
                const link = document.createElement("a");
                link.href = objectUrl;
                link.download = "opus-local-detector-physician-draft.json";
                document.body.appendChild(link);
                link.click();
                link.remove();
            }
            finally {
                window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
            }
            setNotice("Исследовательский черновик сохранён локально. В нём содержатся исходные DICOM UID; не загружайте файл в публичные сервисы.");
        }
        catch {
            setNotice("Источник или происхождение модели изменились: экспорт локального заключения запрещён.");
        }
    };
    const prepare = () => {
        if (choice.status === "blocked") {
            setNotice("Локальный план не составлен: " + choice.blockers.join(" "));
            setReport(null);
            return;
        }
        setReport(choice);
        setNotice("Локальная подготовка завершена. Изображения НЕ анализировались AI и не отправлялись в облако.");
        void completionChime(); // sound only after successful preparation and explicit opt-in
    };
    const stablePrivacyPreviews = useMemo(() => report?.frames.map(f => thumbnails[f.fileId]?.url) ?? [], [report, thumbnails]);
    const extraView = <section className="ora-vision-plan" aria-label={__ui("\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0430\u043D\u0430\u043B\u0438\u0437 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u043A\u0430\u0434\u0440\u043E\u0432")}>
    <div className="ora-vision-plan-head">
      <div><h2><LocalizedUi value={"\u0410\u043D\u0430\u043B\u0438\u0437 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0445 \u043A\u0430\u0434\u0440\u043E\u0432"}/></h2>
        <p><LocalizedUi value={"\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0439 \u2192 Gemini \u2192 Opus \u2192 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435"}/></p></div>
    </div>
    <p className="ora-vision-plan-lead"><LocalizedUi value={"\u041F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0433\u043E\u0442\u043E\u0432\u0438\u0442 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435 \u0441\u0440\u0435\u0437\u044B \u0434\u043B\u044F \u0430\u043D\u0430\u043B\u0438\u0437\u0430. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u043D\u0438\u0436\u0435, \u043F\u0440\u0438 \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u043E\u0441\u0442\u0438 \u0441\u043A\u0440\u043E\u0439\u0442\u0435 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0438 \u0440\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u0435 \u0437\u0430\u043F\u0443\u0441\u043A. \u0414\u043E \u0432\u0430\u0448\u0435\u0433\u043E \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u0438\u044F \u0441\u043D\u0438\u043C\u043A\u0438 \u043E\u0441\u0442\u0430\u044E\u0442\u0441\u044F \u043D\u0430 \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440\u0435."}/></p>
    <LocalizedUi value={!primaryActionAvailable && <div className="ora-vision-plan-controls">
      <label htmlFor="ora-frame-count"><LocalizedUi value={"\u041A\u0430\u0434\u0440\u043E\u0432 \u0432 \u0432\u044B\u0431\u043E\u0440\u043A\u0435"}/><select id="ora-frame-count" value={requested} onChange={e => setRequested(Number(e.target.value))}>
          <LocalizedUi value={Array.from({ length: MAX_VISION_SAMPLE_FRAMES - 1 }, (_, i) => i + 2).map(n => <option key={n} value={n}><LocalizedUi value={n}/></option>)}/>
        </select>
      </label>
      <button type="button" onClick={prepare} disabled={choice.status !== "ready-for-local-preview"}><LocalizedUi value={"\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u043B\u0430\u043D"}/></button>
    </div>}/>
    <LocalizedUi value={!fromPrimaryAnalysis && !primaryActionAvailable && <div className="ora-vision-budget-preview" aria-label={__ui("\u0415\u0434\u0438\u043D\u044B\u0439 \u0437\u0430\u043F\u0443\u0441\u043A \u041A\u0422 \u041C\u0420\u0422")}>
      <strong><LocalizedUi value={"\u0415\u0434\u0438\u043D\u044B\u0439 \u0430\u043D\u0430\u043B\u0438\u0437 \u00B7 \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440\u044B + Gemini + Opus"}/></strong>
      <p><LocalizedUi value={"\u041E\u0434\u043D\u0430 \u0442\u043E\u0447\u043A\u0430 \u0432\u0445\u043E\u0434\u0430: \u0437\u0430\u043F\u0443\u0441\u043A \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0445 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0445 \u043C\u043E\u0434\u0435\u043B\u0435\u0439, \u0437\u0430\u0442\u0435\u043C \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043A\u043E\u043F\u0438\u0439 \u0438 \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u044B\u0439 \u0432\u044B\u0437\u043E\u0432 Gemini + Opus \u0432 \u044D\u0442\u043E\u0439 \u0436\u0435 \u043F\u0430\u043D\u0435\u043B\u0438."}/></p>
      <button type="button" disabled={detectorBusy || universal.status !== "eligible_for_authorization"} onClick={startUnified}>
        <LocalizedUi value={detectorBusy ? "Запускаем локальный этап…" : "Запустить единый анализ КТ/МРТ"}/>
      </button>
      <LocalizedUi value={unifiedStarted && <p role="status"><LocalizedUi value={"\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u044D\u0442\u0430\u043F \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D \u0438\u043B\u0438 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F. \u0414\u043B\u044F \u043E\u0431\u043B\u0430\u0447\u043D\u043E\u0433\u043E \u044D\u0442\u0430\u043F\u0430 \u043D\u0438\u0436\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 OCR, \u0441\u043D\u0438\u043C\u043A\u0438 \u0438 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u0438\u044F \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430; \u0431\u0435\u0437 \u044D\u0442\u043E\u0433\u043E \u0430\u043D\u0430\u043B\u0438\u0437 \u043C\u043E\u0434\u0435\u043B\u0435\u0439 \u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F. \u0427\u0430\u0441\u0442\u0438\u0447\u043D\u0430\u044F \u0432\u044B\u0431\u043E\u0440\u043A\u0430 \u043D\u0435 \u0440\u0430\u0432\u043D\u0430 \u043E\u0446\u0435\u043D\u043A\u0435 \u0432\u0441\u0435\u0439 \u0441\u0435\u0440\u0438\u0438."}/></p>}/>
      <details>
        <summary><LocalizedUi value={"\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u00B7 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u0439 ICH-\u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440 \u043D\u0430 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u043E\u043C Linux worker"}/></summary>
        <p><LocalizedUi value={"\u0422\u043E\u043B\u044C\u043A\u043E \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u0430\u044F \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u0430\u044F \u041A\u0422, \u0437\u0430\u0440\u0430\u043D\u0435\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u0430\u044F \u043D\u0430 worker. \u0412 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435 \u0432\u044B\u0447\u0438\u0441\u043B\u044F\u044E\u0442\u0441\u044F SHA-256 \u0444\u0430\u0439\u043B\u043E\u0432; \u0441\u0430\u043C\u0438 DICOM-\u043F\u0438\u043A\u0441\u0435\u043B\u0438 \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u044E\u0442\u0441\u044F. \u041D\u0435 \u043F\u043E\u0434\u0445\u043E\u0434\u0438\u0442 \u0434\u043B\u044F \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0439 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u043E\u0432."}/></p>
        <label><LocalizedUi value={"\u0410\u0434\u0440\u0435\u0441 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0433\u043E SSH-\u0442\u0443\u043D\u043D\u0435\u043B\u044F ICH worker"}/><input type="text" value={ichEndpoint} disabled={detectorBusy} onChange={e => { setIchEndpoint(e.target.value); setIchWorkerReady(false); }}/>
        </label>
        <label><LocalizedUi value={"\u0421\u0435\u0441\u0441\u0438\u043E\u043D\u043D\u044B\u0439 \u0442\u043E\u043A\u0435\u043D ICH worker"}/><input type="password" autoComplete="off" value={ichToken} disabled={detectorBusy} onChange={e => { setIchToken(e.target.value); setIchWorkerReady(false); }}/>
        </label>
        <label><input type="checkbox" checked={ichResearchConfirmed} disabled={detectorBusy} onChange={e => { setIchResearchConfirmed(e.target.checked); setIchWorkerReady(false); }}/><LocalizedUi value={"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E: \u044D\u0442\u043E \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u0430\u044F \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u0430\u044F \u041A\u0422, \u0442\u043E\u0447\u043D\u043E \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u044E\u0449\u0430\u044F \u0441 \u043F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u043C\u0438 \u0434\u0430\u043D\u043D\u044B\u043C\u0438 worker; \u043D\u0435 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0441\u043A\u043E\u0435 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435."}/></label>
        <LocalizedUi value={ichWorkerNotice && <p role="status"><LocalizedUi value={ichWorkerNotice}/></p>}/>
        <p><LocalizedUi value={"\u0417\u0430\u043F\u0443\u0441\u043A ICH \u043D\u0435 \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0432\u0442\u043E\u0440\u043E\u0439 \u043A\u043D\u043E\u043F\u043A\u0438: \u043F\u043E\u0441\u043B\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043E\u043D \u0432\u0445\u043E\u0434\u0438\u0442 \u0432 \u00AB\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0435\u0434\u0438\u043D\u044B\u0439 \u0430\u043D\u0430\u043B\u0438\u0437 \u041A\u0422/\u041C\u0420\u0422\u00BB \u0432\u044B\u0448\u0435."}/></p>
      </details>
    </div>}/>
    <LocalizedUi value={fromPrimaryAnalysis && <div role="status" aria-label={__ui("\u042D\u0442\u0430\u043F\u044B \u0435\u0434\u0438\u043D\u043E\u0433\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F")}>
      <strong><LocalizedUi value={"\u041E\u0434\u0438\u043D \u0437\u0430\u043F\u0443\u0441\u043A \u00B7 \u0434\u0432\u0430 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u044B\u0445 \u043F\u0443\u0442\u0438"}/></strong>
      <ol>
        <li><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0435 DICOM \u0438 \u0441\u0435\u0440\u0438\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u044B"}/></li>
        <li><LocalizedUi value={primaryAnalysisStage === "running" ? "Оригинальные детекторы выполняются…" :
                primaryAnalysisStage === "completed" ? "Запуск диагностических детекторов завершён" :
                    primaryAnalysisStage === "vision-only" ? "Совместимый оригинальный детектор не назначен — доступен независимый Vision" :
                        primaryAnalysisStage === "cancelled" ? "Детекторы отменены" : "Ожидание запуска детекторов"}/></li>
        <li><LocalizedUi value={"\u041A\u0430\u0434\u0440\u044B Vision \u043F\u043E\u0434\u0433\u043E\u0442\u0430\u0432\u043B\u0438\u0432\u0430\u044E\u0442\u0441\u044F \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E \u0438 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E, OCR \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u2014 \u0432\u0440\u0430\u0447\u0443 \u043E\u0441\u0442\u0430\u0451\u0442\u0441\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F"}/></li>
        <li><LocalizedUi value={"\u041F\u043E\u0441\u043B\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440\u043E\u0432 \u0438 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u0438\u044F \u0432\u0440\u0430\u0447\u0430 Gemini \u0438 Opus \u0441\u0444\u043E\u0440\u043C\u0438\u0440\u0443\u044E\u0442 \u0435\u0434\u0438\u043D\u043E\u0435 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 TXT"}/></li>
      </ol>
      <LocalizedUi value={primaryAnalysisStage === "running" && <p><LocalizedUi value={"\u041F\u043E\u043A\u0430 \u043C\u043E\u0434\u0435\u043B\u044C \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442, \u043C\u043E\u0436\u043D\u043E \u043E\u0441\u043C\u0430\u0442\u0440\u0438\u0432\u0430\u0442\u044C \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F; \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0430 Gemini/Opus \u043E\u0442\u043A\u0440\u043E\u0435\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0435\u0451 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F."}/></p>}/>
    </div>}/>
    <div className="ora-vision-budget-preview" role="status" aria-label={__ui("\u0423\u043D\u0438\u0432\u0435\u0440\u0441\u0430\u043B\u044C\u043D\u044B\u0439 \u0430\u043D\u0430\u043B\u0438\u0437 \u041A\u0422 \u0438 \u041C\u0420\u0422")}>
      <strong><LocalizedUi value={"Gemini + Opus \u00B7 \u0443\u043D\u0438\u0432\u0435\u0440\u0441\u0430\u043B\u044C\u043D\u044B\u0439 \u0430\u043D\u0430\u043B\u0438\u0437"}/><LocalizedUi value={universal.modality === "CT" ? "КТ" : universal.modality === "MR" ? "МРТ" : "DICOM"}/></strong>
      <p><LocalizedUi value={universal.reason}/></p>
      <p><LocalizedUi value={"\u0423\u043D\u0438\u0432\u0435\u0440\u0441\u0430\u043B\u044C\u043D\u044B\u0439 \u043C\u0430\u0440\u0448\u0440\u0443\u0442 \u043D\u0435 \u0437\u0430\u0432\u0438\u0441\u0438\u0442 \u043E\u0442 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044B\u0445 \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440\u043E\u0432. \u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 \u043A\u0430\u0434\u0440\u043E\u0432 \u0438 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u0438\u0435 \u043E\u0431\u043B\u0430\u0447\u043D\u043E\u0439 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u044E\u0442\u0441\u044F \u043D\u0438\u0436\u0435; \u0433\u043E\u0442\u043E\u0432\u043D\u043E\u0441\u0442\u044C \u043C\u0430\u0440\u0448\u0440\u0443\u0442\u0430 \u043D\u0435 \u043E\u0437\u043D\u0430\u0447\u0430\u0435\u0442, \u0447\u0442\u043E \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u0443\u0436\u0435 \u043F\u0440\u043E\u0430\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D\u044B."}/></p>
    </div>
    <details className="ora-vision-budget-preview" aria-label={__ui("\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u043C\u0430\u0440\u0448\u0440\u0443\u0442 \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u043A\u043E\u043D\u0441\u0438\u043B\u0438\u0443\u043C\u0430")}>
      <summary><LocalizedUi value={"\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u00B7 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0435 \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440\u044B \u0438 \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u0435 \u043D\u0430\u0445\u043E\u0434\u043A\u0438"}/></summary>
      <strong><LocalizedUi value={"\u0414\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043A\u043E\u043D\u0441\u0438\u043B\u0438\u0443\u043C \u00B7 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043C\u0430\u0440\u0448\u0440\u0443\u0442"}/></strong>
      <LocalizedUi value={consilium.status === "ready" ? <>
        <p><LocalizedUi value={"\u0412\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435 \u0441\u043F\u0435\u0446\u0438\u0430\u043B\u0438\u0441\u0442\u044B Gemini:"}/><LocalizedUi value={consilium.specialists.join(", ")}/>.</p>
        <p><LocalizedUi value={"\u0414\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u043D\u0430\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F-\u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u044B:"}/><LocalizedUi value={consilium.detectorTargets.join(", ")}/>.</p>
        <p><LocalizedUi value={"Claude Opus \u0441\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u044B\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440\u043E\u0432 \u0438 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u044B\u0445 \u0441\u043F\u0435\u0446\u0438\u0430\u043B\u0438\u0441\u0442\u043E\u0432 \u043F\u043E\u0441\u043B\u0435 \u0438\u0445 \u0444\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F."}/></p>
        <p><LocalizedUi value={"\u0421\u0442\u0430\u0442\u0443\u0441: \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043E"}/><LocalizedUi value={registered.executors.length}/><LocalizedUi value={"\u0440\u0435\u0430\u043B\u044C\u043D\u043E \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0445 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0445 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u0439. \u0417\u0430\u043F\u0443\u0441\u043A \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F \u0435\u0434\u0438\u043D\u043E\u0439 \u043A\u043D\u043E\u043F\u043A\u043E\u0439 \u0432\u044B\u0448\u0435, \u0431\u0435\u0437 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438 DICOM \u0432 \u043E\u0431\u043B\u0430\u043A\u043E."}/></p>
        <LocalizedUi value={registered.unavailable.filter(item => consilium.detectorTargets.includes(item.target)).map(item => <p key={item.target} role="status"><LocalizedUi value={item.target}/>: <LocalizedUi value={item.reason}/></p>)}/>
        <LocalizedUi value={detectorResult && <div role="status">
          <p><LocalizedUi value={"\u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0445 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u0439:"}/><LocalizedUi value={detectorResult.executed.length}/><LocalizedUi value={"; \u0438\u0437 \u043D\u0438\u0445 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0445 \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440\u043E\u0432:"}/><LocalizedUi value={detectorResult.executed.filter(target => target !== "lung-low-attenuation-quantification").length}/><LocalizedUi value={". \u041F\u043E\u043B\u0443\u0447\u0435\u043D\u043E Evidence:"}/><LocalizedUi value={detectorResult.evidence.length}/>.</p>
          <p><LocalizedUi value={"\u041D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E \u0438\u043B\u0438 \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u043D\u0430\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0439:"}/><LocalizedUi value={detectorResult.blocked.length}/>.</p>
          <LocalizedUi value={detectorResult.blocked.map(item => <p key={item.target}><LocalizedUi value={item.target}/>: <LocalizedUi value={item.reason === "No registered executable model" ? "исполнитель с проверенными весами пока не подключён" : item.reason}/></p>)}/>
          <LocalizedUi value={detectorResult.evidence.flatMap(e => e.warnings).map((warning, i) => <p key={i}><LocalizedUi value={warning}/></p>)}/>
          <LocalizedUi value={detectorResult.evidence.flatMap(e => e.findings).map((finding, i) => {
                    const source = series.find(s => s.key === activeSeriesKey)?.members.find(m => m.metadata.seriesUid === finding.source.seriesUid &&
                        m.metadata.sopInstanceUid === finding.source.sopInstanceUid);
                    return <p key={finding.findingId + "-" + i}>
              <strong><LocalizedUi value={finding.anatomy}/>: <LocalizedUi value={finding.sign}/></strong><LocalizedUi value={"\u00B7 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442, \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u0432\u0440\u0430\u0447\u0430."}/><LocalizedUi value={source ? <button type="button" onClick={() => onOpenSlice(source.id)}><LocalizedUi value={"\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439 DICOM-\u0441\u0440\u0435\u0437"}/></button> :
                            " Исходный DICOM-срез недоступен; навигация заблокирована."}/>
            </p>;
                })}/>

          <p><LocalizedUi value={"\u041D\u0435\u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043D\u044B\u0439 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0432\u0440\u0430\u0447\u0435\u0431\u043D\u044B\u0439 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u0442 \u0444\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0438, \u043D\u0435\u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0435 \u043D\u0430\u0445\u043E\u0434\u043A\u0438, \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0435 \u043C\u043E\u0434\u0435\u043B\u0438 \u0438 \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u044B \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 DICOM. \u041E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0438\u0437 \u043F\u0443\u0441\u0442\u043E\u0433\u043E \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430 \u043D\u0435 \u0444\u043E\u0440\u043C\u0438\u0440\u0443\u0435\u0442\u0441\u044F."}/></p>
          <button type="button" onClick={exportLocalDetectorReview} disabled={detectorBusy}><LocalizedUi value={"\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0432\u0440\u0430\u0447\u0435\u0431\u043D\u044B\u0439 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A Evidence"}/></button>
          <p><LocalizedUi value={"\u0424\u0430\u0439\u043B \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0435 SOP UID \u0438 \u043F\u0440\u0435\u0434\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0432\u0440\u0430\u0447\u0435\u0431\u043D\u043E\u0433\u043E \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430. \u0412 \u043E\u0431\u043B\u0430\u043A\u043E \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F."}/></p>
          <p><LocalizedUi value={"R231/LAA\u2212950 \u2014 \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C, \u043D\u0435 \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440 \u044D\u043C\u0444\u0438\u0437\u0435\u043C\u044B. \u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u043E\u0432 \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u044E. \u0418\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u043D\u0438\u043A\u0443\u0434\u0430 \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u0432\u0430\u043B\u0438\u0441\u044C."}/></p>
        </div>}/>
      </> : <p role="status"><LocalizedUi value={consilium.reason}/></p>}/>
    </details>
    <details className="ora-vision-budget-preview" aria-label={__ui("\u0411\u044E\u0434\u0436\u0435\u0442 \u043F\u043E\u043B\u043D\u043E\u0433\u043E \u043E\u0431\u0437\u043E\u0440\u0430 Gemini")}>
      <summary><LocalizedUi value={"\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u00B7 \u0440\u0430\u0441\u0447\u0451\u0442 \u043F\u043E\u043B\u043D\u043E\u0433\u043E \u043E\u0431\u0437\u043E\u0440\u0430 (\u043D\u0435 \u0437\u0430\u043F\u0443\u0449\u0435\u043D)"}/></summary>
      <strong><LocalizedUi value={"\u0414\u0432\u0443\u0445\u044D\u0442\u0430\u043F\u043D\u044B\u0439 \u043E\u0431\u0437\u043E\u0440 \u0432\u0441\u0435\u0439 \u0441\u0435\u0440\u0438\u0438 \u2014 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0440\u0430\u0441\u0447\u0451\u0442"}/></strong>
      <p><LocalizedUi value={"\u041E\u0442\u0434\u0435\u043B\u044C\u043D\u043E \u043E\u0442 \u0432\u044B\u0431\u043E\u0440\u043A\u0438 2\u20134 \u043A\u0430\u0434\u0440\u043E\u0432 \u0440\u0430\u0441\u0441\u0447\u0438\u0442\u044B\u0432\u0430\u0435\u043C \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u043A\u0430\u0436\u0434\u043E\u0433\u043E \u0441\u0440\u0435\u0437\u0430 \u0432 \u043D\u0438\u0437\u043A\u043E\u043C \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u0438\u0438 \u0438 \u0432\u044B\u0431\u043E\u0440\u043E\u0447\u043D\u044B\u0439 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u044B\u0439 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u0441\u043E\u0441\u0435\u0434\u043D\u0438\u0445 \u043A\u0430\u0434\u0440\u043E\u0432 \u0432 \u0432\u044B\u0441\u043E\u043A\u043E\u043C \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u0438\u0438."}/></p>
      <label htmlFor="ora-target-frame"><LocalizedUi value={"\u041F\u043E\u0434\u043E\u0437\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0441\u0440\u0435\u0437 (\u043D\u043E\u043C\u0435\u0440 \u043E\u0442 1, \u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)"}/><input id="ora-target-frame" type="number" min="1" step="1" value={targetFrame} onChange={e => setTargetFrame(e.target.value)} placeholder={__ui("\u041F\u043E\u043A\u0430 \u043D\u0435 \u043E\u0442\u043C\u0435\u0447\u0435\u043D")}/>
      </label>
      <LocalizedUi value={fullVolumeCost ? <>
        <p><LocalizedUi value={"\u041F\u043B\u0430\u043D:"}/><LocalizedUi value={fullVolumeCost.overviewIndices.length}/><LocalizedUi value={"\u043A\u0430\u0434\u0440\u043E\u0432 \u043E\u0431\u0437\u043E\u0440\u043D\u043E,"}/><LocalizedUi value={fullVolumeCost.targetedIndices.length}/><LocalizedUi value={"\u043A\u0430\u0434\u0440\u043E\u0432 \u043F\u0440\u0438\u0446\u0435\u043B\u044C\u043D\u043E."}/></p>
        <LocalizedUi value={batchPreview && <p><LocalizedUi value={"\u041F\u0430\u043A\u0435\u0442\u043E\u0432 \u043F\u043E 12 \u0441\u0440\u0435\u0437\u043E\u0432:"}/><LocalizedUi value={batchPreview.batches.length}/><LocalizedUi value={". \u0424\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u043E:"}/><LocalizedUi value={batchPreview.ledger.processedOverviewFrames}/><LocalizedUi value={"\u0438\u0437"}/><LocalizedUi value={batchPreview.ledger.plannedFrames}/><LocalizedUi value={". \u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0439 \u0440\u0430\u0441\u0445\u043E\u0434 API:"}/><LocalizedUi value={batchPreview.ledger.totalUSD.toFixed(3)}/><LocalizedUi value={"USD (\u0432\u044B\u0437\u043E\u0432\u043E\u0432 \u043F\u043E\u043A\u0430 \u043D\u0435 \u0431\u044B\u043B\u043E)."}/></p>}/>
        <p><LocalizedUi value={"\u041F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u0441\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C Gemini:"}/><strong>
          $<LocalizedUi value={fullVolumeCost.estimatedGeminiUSD.toFixed(3)}/></strong><LocalizedUi value={"\u0437\u0430 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435 (\u0442\u0430\u0440\u0438\u0444 \u0438 \u0447\u0438\u0441\u043B\u043E \u0442\u043E\u043A\u0435\u043D\u043E\u0432 \u2014 \u043D\u0430\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0435\u043C\u044B\u0435 \u043F\u0440\u0435\u0434\u043F\u043E\u043B\u043E\u0436\u0435\u043D\u0438\u044F, \u043D\u0435 \u0441\u0447\u0451\u0442 \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430)."}/></p>
        <LocalizedUi value={fullVolumeCost.requiresExplicitBudgetApproval ?
                <p role="status"><LocalizedUi value={"\u0412\u044B\u0448\u0435 \u043F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u043F\u043E\u0440\u043E\u0433\u0430 $"}/><LocalizedUi value={fullVolumeCost.maxGeminiUSD.toFixed(2)}/><LocalizedUi value={". \u0414\u043B\u044F \u0431\u0443\u0434\u0443\u0449\u0435\u0433\u043E \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0430 \u043F\u043E\u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u0438\u0435 \u0440\u0430\u0441\u0445\u043E\u0434\u043E\u0432."}/></p> :
                <p><LocalizedUi value={"\u041D\u0438\u0436\u0435 \u043E\u0440\u0438\u0435\u043D\u0442\u0438\u0440\u043E\u0432\u043E\u0447\u043D\u043E\u0433\u043E \u043F\u043E\u0440\u043E\u0433\u0430 $"}/><LocalizedUi value={fullVolumeCost.maxGeminiUSD.toFixed(2)}/>.</p>}/>
        <p><LocalizedUi value={"\u041E\u0431\u0437\u043E\u0440 \u0432\u0441\u0435\u0445 \u0441\u0440\u0435\u0437\u043E\u0432 \u043F\u043E\u043A\u0430"}/><strong><LocalizedUi value={"\u0442\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D"}/></strong><LocalizedUi value={". \u0418\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u043D\u0435 \u0434\u0435\u043A\u043E\u0434\u0438\u0440\u043E\u0432\u0430\u043B\u0438\u0441\u044C \u0434\u043B\u044F \u043F\u043E\u043B\u043D\u043E\u0433\u043E \u043E\u0431\u0437\u043E\u0440\u0430, AI \u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u043B\u0441\u044F, \u043E\u0431\u043B\u0430\u0447\u043D\u0430\u044F \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0430 \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u0430. \u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043E\u0442\u043C\u0435\u0442\u043E\u043A \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u044E."}/></p>
      </> : <p role="status"><LocalizedUi value={"\u041F\u043B\u0430\u043D \u043F\u043E\u043B\u043D\u043E\u0433\u043E \u043E\u0431\u0437\u043E\u0440\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D: \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 DICOM-\u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u044E \u0438 \u043D\u043E\u043C\u0435\u0440 \u043F\u043E\u0434\u043E\u0437\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u0441\u0440\u0435\u0437\u0430."}/></p>}/>
    </details>
    <LocalizedUi value={choice.status === "blocked" && <div className="ora-vision-plan-blocked" role="status">
      <strong><LocalizedUi value={"\u041F\u043B\u0430\u043D \u043F\u043E\u043A\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D"}/></strong>
      <LocalizedUi value={choice.blockers.map((reason, i) => <p key={i}><LocalizedUi value={reason}/></p>)}/>
    </div>}/>
    <LocalizedUi value={notice && <p className="ora-vision-plan-notice" role="status"><LocalizedUi value={notice}/></p>}/>
    <LocalizedUi value={report && <div className="ora-vision-plan-result">
      <strong><LocalizedUi value={"\u0413\u043E\u0442\u043E\u0432 \u0441\u043F\u0438\u0441\u043E\u043A \u0438\u0437"}/><LocalizedUi value={report.frames.length}/><LocalizedUi value={"\u043A\u0430\u0434\u0440\u043E\u0432"}/></strong>
      <div className="ora-vision-plan-list">
        <LocalizedUi value={report.frames.map((frame, index) => <div key={frame.sopInstanceUid + "/" + frame.frameIndex}>
          <div><b><LocalizedUi value={"\u041A\u0430\u0434\u0440"}/><LocalizedUi value={index + 1}/></b>
            <span><LocalizedUi value={"\u0421\u0440\u0435\u0437"}/><LocalizedUi value={frame.ordinal}/><LocalizedUi value={"\u0438\u0437"}/><LocalizedUi value={frame.totalFrames}/></span></div>
          <small><LocalizedUi value={"\u041F\u043E\u0437\u0438\u0446\u0438\u044F \u043F\u043E \u043D\u043E\u0440\u043C\u0430\u043B\u0438:"}/><LocalizedUi value={frame.slicePositionMm === null ? "неизвестна" :
                    frame.slicePositionMm.toFixed(2) + " мм"}/></small>
          <LocalizedUi value={thumbnails[frame.fileId]?.url ?
                    <img className="ora-vision-plan-thumbnail" src={thumbnails[frame.fileId].url} alt={"Локальный предпросмотр DICOM, кадр " + (index + 1)}/> :
                    <div className="ora-vision-plan-thumb-placeholder">
              <LocalizedUi value={thumbnails[frame.fileId]?.error ?? "Готовим миниатюру локально…"}/>
            </div>}/>
          <button type="button" onClick={() => onOpenSlice(frame.fileId)}><LocalizedUi value={"\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0441\u0440\u0435\u0437 Vision \u0432 DICOM"}/></button>
        </div>)}/>
      </div>
      <p><LocalizedUi value={"\u041E\u0445\u0432\u0430\u0442: \u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0435 \u043A\u0430\u0434\u0440\u044B. \u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F, \u0434\u0438\u0430\u0433\u043D\u043E\u0437\u044B \u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0439 \u044D\u0442\u0438\u043C \u043F\u043B\u0430\u043D\u043E\u043C \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u044E\u0442\u0441\u044F."}/></p>
      <p><LocalizedUi value={"\u041F\u0435\u0440\u0435\u0434 \u0437\u0430\u043F\u0443\u0441\u043A\u043E\u043C \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043A\u0430\u0434\u0440\u044B \u043D\u0438\u0436\u0435 \u0438 \u0440\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u0435 \u0438\u0445 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0443 Gemini \u0438 Opus. \u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0435 DICOM \u043E\u0441\u0442\u0430\u044E\u0442\u0441\u044F \u043D\u0430 \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440\u0435."}/></p>
      <LocalizedUi value={specialistFacts && <p role="status"><LocalizedUi value={"\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 R231: \u043F\u0440\u0430\u0432\u0430\u044F \u043C\u0430\u0441\u043A\u0430"}/><LocalizedUi value={specialistFacts.rightLungMaskMl.toFixed(1)}/><LocalizedUi value={"\u043C\u043B, \u043B\u0435\u0432\u0430\u044F"}/><LocalizedUi value={specialistFacts.leftLungMaskMl.toFixed(1)}/><LocalizedUi value={"\u043C\u043B. \u042D\u0442\u043E \u0441\u0435\u0433\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u044F \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0438, \u043D\u0435 \u0434\u0435\u0442\u0435\u043A\u0446\u0438\u044F \u0437\u0430\u0431\u043E\u043B\u0435\u0432\u0430\u043D\u0438\u044F. \u0427\u0438\u0441\u043B\u0430 \u043C\u043E\u0436\u043D\u043E \u043F\u0435\u0440\u0435\u0434\u0430\u0442\u044C \u0432 \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0430\u043D\u0430\u043B\u0438\u0437 \u0432\u043C\u0435\u0441\u0442\u0435 \u0441 \u043A\u0430\u0434\u0440\u0430\u043C\u0438 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E \u044F\u0432\u043D\u043E\u043C\u0443 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u0438\u044E."}/></p>}/>
      <LocalizedUi value={specialistWarning && <p role="status"><LocalizedUi value={specialistWarning}/></p>}/>
      <LocalizedUi value={localLaa950 && <p role="status"><LocalizedUi value={"\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 LAA\u2212950 \u0434\u043B\u044F \u044D\u0442\u043E\u0439 \u041A\u0422:"}/><LocalizedUi value={localLaa950.lowAttenuationPctOfSampledMask.toFixed(2)}/><LocalizedUi value={"% \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u0438 (\u0441\u043F\u0440\u0430\u0432\u0430"}/><LocalizedUi value={localLaa950.rightLungPct.toFixed(2)}/><LocalizedUi value={"%, \u0441\u043B\u0435\u0432\u0430"}/><LocalizedUi value={localLaa950.leftLungPct.toFixed(2)}/><LocalizedUi value={"%). \u0422\u043E\u043B\u044C\u043A\u043E \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442: \u044D\u0442\u0438 \u0446\u0438\u0444\u0440\u044B \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u044E\u0442\u0441\u044F \u0432 OpenRouter \u0438 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E\u0442 \u0434\u0438\u0430\u0433\u043D\u043E\u0437 \u044D\u043C\u0444\u0438\u0437\u0435\u043C\u044B."}/></p>}/>
      <LocalizedUi value={laaWarning && <p role="status"><LocalizedUi value={laaWarning}/></p>}/>
      <LocalizedUi value={report.frames.some(f => thumbnails[f.fileId]?.error) && <p role="alert"><LocalizedUi value={"\u0410\u043D\u0430\u043B\u0438\u0437 \u0435\u0449\u0451 \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D: \u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C \u043E\u0434\u0438\u043D \u0438\u043B\u0438 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u043E\u0432. \u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 \u043A\u043E\u043F\u0438\u0439 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430, \u043F\u043E\u043A\u0430 \u044D\u0442\u0438 \u043A\u0430\u0434\u0440\u044B \u043D\u0435 \u0434\u0435\u043A\u043E\u0434\u0438\u0440\u043E\u0432\u0430\u043D\u044B. \u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0435 \u0441\u043D\u0438\u043C\u043A\u0438 \u043C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0441\u043C\u0430\u0442\u0440\u0438\u0432\u0430\u0442\u044C \u0432\u044B\u0448\u0435."}/></p>}/>
      <VisionPrivacyPreparation autoStartAfterDetectors={fromPrimaryAnalysis} primaryAnalysisStage={primaryAnalysisStage} originalDetectorEvidence={originalDetectorEvidence} frameRelativeClnEvidence={clnSpatial} key={JSON.stringify(report.frames.map(f => f.fileId)) + requested} previews={stablePrivacyPreviews} modality={series.find(s => s.key === report.seriesKey)?.modality ?? ""} specialistFacts={specialistFacts} localLaa950={localLaa950} specialistLocalBinding={specialistFacts && capturedSpecialist ?
                capturedSpecialist.evidence.source.inputSha256 + ":" + capturedSpecialist.evidence.mask.sha256 : ""} originalLocalFileIds={report.frames.map(f => f.fileId)} onOpenOriginalSlice={onOpenSlice}/>
    </div>}/>

    <p className="ora-vision-plan-footnote"><LocalizedUi value={"\u041E\u0442\u0431\u0438\u0440\u0430\u0435\u043C \u043F\u043E \u0440\u0430\u0432\u043D\u043E\u043C\u0435\u0440\u043D\u044B\u043C \u0438\u043D\u0434\u0435\u043A\u0441\u0430\u043C \u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u0447\u0435\u0441\u043A\u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u043E\u0439 \u0441\u0435\u0440\u0438\u0438, \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044F \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0435 SOPInstanceUID \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E. \u0412\u044B\u0431\u043E\u0440\u043A\u0430 \u043D\u0435 \u0433\u0430\u0440\u0430\u043D\u0442\u0438\u0440\u0443\u0435\u0442 \u043E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u0438\u044F \u043E\u0447\u0430\u0433\u043E\u0432 \u043C\u0435\u0436\u0434\u0443 \u0441\u0440\u0435\u0437\u0430\u043C\u0438."}/></p>
  </section>;
    const selected = series.find(s => s.key === choice.seriesKey);
    if (!researchMode && fromPrimaryAnalysis && selected && selected.members.length===1 && ['CT','MR'].includes(selected.modality))
        return <SingleDicomAnalysis key={'single-'+selected.key} series={selected} files={fileById} onOpenSlice={onOpenSlice}/>;
    if (!researchMode && fromPrimaryAnalysis && selected && ["CR", "DX"].includes(selected.modality))
        return <PlainImageAnalysis key={"plain-" + selected.key} series={selected} files={fileById} autoStart/>;
    if (!researchMode && fromPrimaryAnalysis && selected && ["CT", "MR"].includes(selected.modality))
        return <ReviewedSeriesAnalysis key={"reviewed-series-" + selected.key} series={selected} allSeries={comparisonSeries} clnVerifiedLocal={clnVerifiedLocal} files={fileById} onOpenSlice={onOpenSlice} onInspectFinding={onInspectFinding} detectorStage={primaryAnalysisStage} detectorEvidence={originalDetectorEvidence}/>;
    // Ordinary studies use exact-copy OCR/redaction, physician review and an
    // explicit transfer decision. Never send them through public-only auto OCR.
    if (!researchMode || !fromPrimaryAnalysis || !selected || !fullVolumeCost)
        return extraView;
    return <section className="ora-vision-plan" aria-label={__ui("\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0430\u043D\u0430\u043B\u0438\u0437 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F")}>
    <FullVolumeLocalPreparation key={"study-" + selected.key} series={selected} files={fileById} flaggedIndex={targetFrame.trim() ? Number(targetFrame) - 1 : null} autoStart={true} showAdminControls={researchMode} detectorStage={primaryAnalysisStage} detectorEvidence={originalDetectorEvidence} onOpenSlice={onOpenSlice}/>
    <LocalizedUi value={researchMode && <details>
      <summary onClick={() => setExtraOpened(true)}><LocalizedUi value={"\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u00B7 \u0430\u043D\u0430\u043B\u0438\u0437 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u043E\u0432"}/></summary>
      <LocalizedUi value={extraOpened && extraView}/>
    </details>}/>
  </section>;
}
