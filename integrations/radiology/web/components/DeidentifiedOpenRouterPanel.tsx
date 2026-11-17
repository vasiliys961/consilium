"use client";
import {IndependentImageOpinion} from "./IndependentImageOpinion";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useCallback, useEffect, useRef, useState } from "react";
import type { VisionPrivacyPacket } from "../lib/vision-privacy";
import { canSubmitCombinedVisionReview } from "../lib/primary-analysis-stage";
import { validateOpusIntegratedSynthesis, type SanitizedModelReview } from "../lib/sanitized-cloud-review";
import { MAX_RADIOLOGIST_REPORT_CHARS } from "../lib/senior-radiologist-report";
import { validateClnFrameRelativeEvidence, type ClnFrameRelativeEvidence } from "../lib/cln-frame-relative-evidence";
import { buildLocalDualReviewDraft, findingReviewKey, type LocalObservationAssessment } from "../lib/local-dual-vision-physician-draft";
import type { LocalLungFacts } from "../lib/local-lung-review";
import type { LocalSameSeriesLaa950 } from "../lib/same-series-laa950-review";
import { validateSanitizedDetectorBundle, type SanitizedDetectorBundle } from "../lib/detector-consilium-evidence";
import { bindLocalSanitizedReview, sourceFileForObservation, perFrameModelCoverage } from "../lib/local-cloud-source-navigation";
import { toSafeXrvScores, type OriginalXrvCxrResult } from "../lib/xrv-original-cxr";
import { validateLateDetectorReconciliation, type LateDetectorReconciliation } from "../lib/late-detector-opus-reconcile";
type Props = {
    enabledByLocalChecks: boolean;
    autoConnect?: boolean;
    primaryAnalysisStage?: "idle" | "running" | "completed" | "vision-only" | "cancelled";
    exactReviewedHashes: readonly {
        imageId: string;
        sha256: string;
    }[];
    prepareReviewedPacket: () => VisionPrivacyPacket;
    specialistFacts?: LocalLungFacts | null;
    originalDetectorEvidence?: SanitizedDetectorBundle | null;
    frameRelativeClnEvidence?: ClnFrameRelativeEvidence | null;
    originalCxrEvidence?: OriginalXrvCxrResult | null;
    localLaa950?: LocalSameSeriesLaa950 | null;
    specialistLocalBinding?: string;
    originalLocalFileIds: readonly string[];
    onOpenOriginalSlice: (localFileId: string) => void;
};
type Ready = {
    schema: string;
    enabled: boolean;
    workstationConnected?: boolean;
    configurationStatus?: string;
    productionPatientCloudRelease: false;
};
export default function DeidentifiedOpenRouterPanel({ enabledByLocalChecks, autoConnect = false, primaryAnalysisStage = "idle", exactReviewedHashes, prepareReviewedPacket, originalLocalFileIds, onOpenOriginalSlice, specialistFacts, specialistLocalBinding, localLaa950, originalDetectorEvidence = null, frameRelativeClnEvidence = null, originalCxrEvidence = null, }: Props) {
    const __ui = useUiTranslator();
    const [server, setServer] = useState<Ready | null>(null), [token, setToken] = useState("");
    const [working, setWorking] = useState(false), [error, setError] = useState("");
    const [readinessNote, setReadinessNote] = useState("");
    const [includeSpecialist, setIncludeSpecialist] = useState(false);
    const [includeDetectors, setIncludeDetectors] = useState(true);
    const [includeCxr, setIncludeCxr] = useState(true);
    const requestPayload=useRef<Record<string,unknown>|null>(null);
    const [result, setResult] = useState<SanitizedModelReview | null>(null);
    const [decisions, setDecisions] = useState<Record<string, LocalObservationAssessment>>({});
    const [clinicalSynthesis, setClinicalSynthesis] = useState("");
    const [integratedDraft, setIntegratedDraft] = useState("");
    const [draftError, setDraftError] = useState("");
    const [lateReview, setLateReview] = useState<LateDetectorReconciliation | null>(null);
    const [lateDraft, setLateDraft] = useState("");
    const [lateWorking, setLateWorking] = useState(false), [lateConsent, setLateConsent] = useState(false);
    const ctl = useRef<AbortController | null>(null);
    const reportSection = useRef<HTMLElement | null>(null);
    useEffect(() => {
        if (!result?.opusSynthesis)
            return;
        reportSection.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        reportSection.current?.focus({ preventScroll: true });
    }, [result]);
    const readinessCtl = useRef<AbortController | null>(null);
    const [checkingServer, setCheckingServer] = useState(false);
    const modelPathSettled = canSubmitCombinedVisionReview(primaryAnalysisStage);
    // The primary Analyze click may connect this preapproved workstation, but
    // merely opening files never probes providers or sends images.
    useEffect(() => () => { ctl.current?.abort(); readinessCtl.current?.abort(); }, []);
    // Restart/cancellation of the local path invalidates an in-flight remote
    // interpretation. A stale report must never surface against new DICOM.
    useEffect(() => {
        if (!modelPathSettled) {
            ctl.current?.abort();
            
            setResult(null);
            setIntegratedDraft("");
        }
    }, [modelPathSettled]);
    useEffect(() => { setResult(null); setIncludeSpecialist(false); setDecisions({}); setClinicalSynthesis(""); setIntegratedDraft(""); }, [specialistLocalBinding]);
    // A real CLN/nnU-Net may finish AFTER an already paid Vision review.
    // Preserve Gemini/Opus observations and physician decisions; revoke permission
    // before any new external call, and invalidate only prior late reconciliation.
    useEffect(() => {
        setIncludeDetectors(true);
        
        setLateReview(null);
        setLateDraft("");
        setLateConsent(false);
    }, [originalDetectorEvidence]);
    useEffect(() => { setResult(null); setIncludeCxr(true);  setDecisions({}); setClinicalSynthesis(""); setIntegratedDraft(""); }, [originalCxrEvidence]);
    const checkReadiness = useCallback(async (parentSignal?: AbortSignal) => {
        readinessCtl.current?.abort();
        const controller = new AbortController();
        readinessCtl.current = controller;
        const cancelled = AbortSignal.any([controller.signal, ...(parentSignal ? [parentSignal] : [])]);
        if (cancelled.aborted)
            return;
        setCheckingServer(true);
        setReadinessNote("");
        setError("");
        setServer(null);
        try {
            const r = await fetch("/api/ai/deidentified-openrouter-review", {
                cache: "no-store", credentials: "same-origin",
                signal: AbortSignal.any([cancelled, AbortSignal.timeout(8000)]),
            });
            if (!r.ok)
                throw Error();
            const x = await r.json() as Ready;
            if (x.schema !== "opus-deidentified-openrouter-pilot-readiness/v1" ||
                typeof x.enabled !== "boolean" || typeof x.workstationConnected !== "boolean" ||
                (!x.enabled && x.workstationConnected) || x.productionPatientCloudRelease !== false)
                throw Error();
            if (cancelled.aborted)
                return;
            setServer(x);
            if (!x.enabled)
                setReadinessNote(x.configurationStatus === "missing-provider" ?
                    "Gemini и Opus не подключены: на локальном сервере отсутствует ключ провайдера." :
                    x.configurationStatus === "not-approved" ?
                        "Передача обезличенных кадров не разрешена в настройках рабочего места. Локальная обработка продолжается." :
                        "Рабочее место ещё не настроено для подключения Gemini и Opus.");
        }
        catch {
            if (!cancelled.aborted)
                setReadinessNote("Не удалось проверить подключение Gemini и Opus. Повторите проверку; изображения не отправлялись.");
        }
        finally {
            if (!cancelled.aborted)
                setCheckingServer(false);
        }
    }, []);
    useEffect(() => {
        if (!autoConnect)
            return;
        const controller = new AbortController();
        void checkReadiness(controller.signal);
        return () => controller.abort();
    }, [autoConnect, checkReadiness]);
    async function send() {
        if (working || lateWorking || !enabledByLocalChecks || !modelPathSettled)
            return;
        setError("");
        setResult(null);
        setDecisions({});
        setClinicalSynthesis("");
        setIntegratedDraft("");
        setDraftError("");
        setWorking(true);
        setLateReview(null);
        setLateDraft("");
        setLateConsent(false);
        const controller = new AbortController();
        ctl.current = controller;
        try {
            // One approved physician action verifies server readiness and then
            // performs the two paid calls; opening the study never sends images.
            // Reconnect once during the physician's explicit paid SEND action.
            // This GET never sends pixels and never triggers a provider charge.
            const probe = await fetch("/api/ai/deidentified-openrouter-review", {
                method: "GET", cache: "no-store", signal: controller.signal, credentials: "same-origin",
            });
            if (!probe.ok) throw Error("OpenRouter недоступен на локальном сервере.");
            const ready = await probe.json() as Ready;
            if (ready.schema !== "opus-deidentified-openrouter-pilot-readiness/v1" ||
                ready.productionPatientCloudRelease !== false || ready.enabled !== true)
                throw Error("OpenRouter не разрешён настройками локального исследовательского сервера.");
            setServer(ready);
            if (!ready.workstationConnected && token.length < 24)
                throw Error("Рабочее место не подключено. Проверьте однократное разрешение Preview.");
            const packet = prepareReviewedPacket(); // local exact copy + signed action journal check
            if (packet.frames.some((f, i) => f.frameId !== exactReviewedHashes[i]?.imageId ||
                f.sha256 !== exactReviewedHashes[i]?.sha256))
                throw Error("Проверенная копия изменилась: повторите проверку.");
            const sentSpecialist = includeSpecialist && specialistFacts ? specialistFacts : null;
            const sentDetectors = (primaryAnalysisStage !== "idle" || includeDetectors) && originalDetectorEvidence ?
                originalDetectorEvidence : null;
            const sentCxr = includeCxr && originalCxrEvidence ? toSafeXrvScores(originalCxrEvidence) : null;
            if (sentCxr && packet.frames.some(f => f.modality !== "CR" && f.modality !== "DX"))
                throw Error("XRV scores can only be reviewed with CR/DX images.");
            if (sentDetectors && (!validateSanitizedDetectorBundle(sentDetectors) ||
                !sentDetectors.facts.some(f => f.status === "completed") ||
                sentDetectors.modality !== packet.frames[0]?.modality))
                throw Error("Пакет патологических детекторов не соответствует проверенным кадрам.");
            const sentSpatial = sentDetectors && frameRelativeClnEvidence ? frameRelativeClnEvidence : null;
            if (sentSpatial && (!validateClnFrameRelativeEvidence(sentSpatial, packet.frames.map(f => f.frameId)) ||
                !sentDetectors?.facts.some(f => f.task === "lung_tumor" && f.status === "completed")))
                throw Error("Локальная CLN-привязка к текущим DICOM-кадрам не подтверждена.");
            requestPayload.current={ packet, acknowledgeClinicianLawfulDisclosure: true,
                    acknowledgeProviderHealthDataTerms: true, acknowledgePixelIdentityReviewed: true,
                    acknowledgeTwoPaidCalls: true,
                    ...(sentSpecialist ? { specialistFacts: sentSpecialist } : {}),
                    ...(sentDetectors ? { detectorEvidence: sentDetectors } : {}),
                    ...(sentSpatial ? { frameRelativeClnEvidence: sentSpatial } : {}),
                    ...(sentCxr ? { cxrModelEvidence: sentCxr } : {}) };
            const response = await fetch("/api/ai/deidentified-openrouter-review", {
                method: "POST", cache: "no-store", signal: controller.signal, credentials: "same-origin",
                headers: { "Content-Type": "application/json", "X-Opus-Local-Operator-Token": token },
                body: JSON.stringify(requestPayload.current),
            });
            const body: unknown = await response.json();
            if (controller.signal.aborted)
                return;
            if (!response.ok)
                throw Error((body as {
                    error?: string;
                }).error ?? "OpenRouter недоступен");
            const doc = body as SanitizedModelReview;
            if (doc.schema !== "opus-sanitized-cloud-pilot/v1" || (doc.results.length < 1 || doc.results.length > 2) ||
                doc.results[0].reviewer !== "gemini" || (doc.results.length===2 && doc.results[1].reviewer !== "opus") ||
                doc.originalDicomSent !== false || doc.sourceDicomIdentifiersSent !== false ||
                doc.researchOnly !== true || doc.deidentificationIndependentlyCertified !== false ||
                doc.sourceFrames.length !== exactReviewedHashes.length ||
                doc.sourceFrames.some((f, i) => f.imageId !== exactReviewedHashes[i].imageId ||
                    f.reviewedPixelSha256 !== exactReviewedHashes[i].sha256))
                throw Error("Неверный паспорт облачного ответа.");
            if (sentSpecialist &&
                (!doc.specialistEvidence ||
                    doc.specialistEvidence.model !== "lungmask-R231" ||
                    doc.specialistEvidence.frameCount !== sentSpecialist.frameCount ||
                    doc.specialistEvidence.rightLungMaskMl !== sentSpecialist.rightLungMaskMl ||
                    doc.specialistEvidence.leftLungMaskMl !== sentSpecialist.leftLungMaskMl ||
                    doc.specialistEvidence.clinicalProvenanceServerVerified !== false ||
                    doc.specialistEvidence.findingOfPathologyEstablished !== false))
                throw Error("Источник численных данных R231 не подтверждён.");
            if (!sentSpecialist && doc.specialistEvidence)
                throw Error("Непредусмотренные данные модели в ответе.");
            if (sentDetectors) {
                if (!doc.detectorEvidence ||
                    JSON.stringify(doc.detectorEvidence) !== JSON.stringify(sentDetectors))
                    throw Error("Поставщик AI не вернул тот же обезличенный пакет детекторов.");
            }
            else if (doc.detectorEvidence)
                throw Error("Модель получила незапрошенные сведения детекторов.");
            if (sentSpatial) {
                if (!doc.frameRelativeClnEvidence ||
                    JSON.stringify(doc.frameRelativeClnEvidence) !== JSON.stringify(sentSpatial))
                    throw Error("Opus не подтвердил пространственную CLN-привязку.");
            }
            else if (doc.frameRelativeClnEvidence)
                throw Error("Получены непредусмотренные координаты CLN.");
            if (sentCxr) {
                if (!doc.cxrModelEvidence || JSON.stringify(doc.cxrModelEvidence) !== JSON.stringify(sentCxr))
                    throw Error("Оценки TorchXRayVision не совпадают с разрешённым набором.");
            }
            else if (doc.cxrModelEvidence)
                throw Error("Незапрошенные оценки TorchXRayVision.");
            const comparedTasks = doc.detectorEvidence?.facts.filter(f => f.status === "completed")
                .map(f => f.task) ?? [];
            if (doc.clnTumorEvidence && !comparedTasks.includes("lung_tumor"))
                comparedTasks.push("lung_tumor");
            if (!validateOpusIntegratedSynthesis(doc.opusSynthesis, comparedTasks))
                throw Error("Opus не предоставил проверяемый объединённый JSON Gemini и детекторов.");
            // An unbound or changed source makes ALL clinical navigation unavailable.
            bindLocalSanitizedReview(doc, exactReviewedHashes.map(f => ({ imageId: f.imageId, reviewedPixelSha256: f.sha256 })), originalLocalFileIds);
            setResult(doc);
            setIntegratedDraft(doc.opusSynthesis!.summary);
            setToken("");
        }
        catch (e) {
            setError(controller.signal.aborted ?
                "Запрос отменён. Уже начатые обращения могут быть оплачены." :
                e instanceof Error ? e.message : "Ошибка анализа проверенных срезов");
        }
        finally {
            setWorking(false);
            ctl.current = null;
        }
    }
    const lateEvidenceReady = !!result && !!originalDetectorEvidence &&
        validateSanitizedDetectorBundle(originalDetectorEvidence) &&
        originalDetectorEvidence.modality === result.modality &&
        originalDetectorEvidence.facts.some(f => f.status === "completed") &&
        JSON.stringify(originalDetectorEvidence) !== JSON.stringify(result.detectorEvidence);
    const validLateReview = lateReview && originalDetectorEvidence && result &&
        validateLateDetectorReconciliation(lateReview, originalDetectorEvidence, result.sourceFrames.map(f => f.imageId)) ? lateReview : null;
    async function reconcileLate() {
        if (!lateEvidenceReady || !lateConsent || working || lateWorking ||
            token.length < 24 || !result || !originalDetectorEvidence || !enabledByLocalChecks)
            return;
        setLateWorking(true);
        setError("");
        setDraftError("");
        const ctrl = new AbortController();
        ctl.current = ctrl;
        try {
            // Check original private DICOM ↔ reviewed exact PNG before the new request.
            // The server passes only text and bounded numeric facts to ONE Opus call.
            bindLocalSanitizedReview(result, exactReviewedHashes.map(f => ({ imageId: f.imageId, reviewedPixelSha256: f.sha256 })), originalLocalFileIds);
            const res = await fetch("/api/ai/vision-detector-reconcile", {
                method: "POST", cache: "no-store", credentials: "same-origin", signal: ctrl.signal,
                headers: { "Content-Type": "application/json", "X-Opus-Local-Operator-Token": token },
                body: JSON.stringify({
                    schema: "opus-authorized-late-detector-reconciliation-request/v1",
                    priorReview: result, detectorEvidence: originalDetectorEvidence,
                    acknowledgeSinglePaidOpusCall: true, acknowledgeLawfulNumericDisclosure: true,
                }),
            });
            const output: unknown = await res.json();
            if (!res.ok)
                throw Error("Согласование Opus не выполнено (HTTP " + res.status + ")");
            if (!validateLateDetectorReconciliation(output, originalDetectorEvidence, result.sourceFrames.map(f => f.imageId)))
                throw Error("Opus returned an unbound detector report");
            if (ctrl.signal.aborted)
                return;
            setLateReview(output);
            setLateDraft(output.draft.summary);
            setLateConsent(false);
            setToken("");
        }
        catch (e) {
            if (!ctrl.signal.aborted)
                setError(e instanceof Error ? e.message : "Ошибка позднего согласования Opus");
        }
        finally {
            setLateWorking(false);
            if (ctl.current === ctrl)
                ctl.current = null;
        }
    }
    const downloadRadiologistText = () => {
        if (!result?.opusSynthesis)
            return;
        try {
            // Do not export a stale interpretation for changed/unbound DICOM frames.
            bindLocalSanitizedReview(result, exactReviewedHashes.map(f => ({ imageId: f.imageId, reviewedPixelSha256: f.sha256 })), originalLocalFileIds);
            const draft = validLateReview ? lateDraft : integratedDraft;
            if (!draft.trim() || draft.length > MAX_RADIOLOGIST_REPORT_CHARS)
                throw Error("empty_report");
            const blob = new Blob([draft.trim() + (result.results.find(r=>r.reviewer==="opus")?"\n\nНЕЗАВИСИМОЕ ВТОРОЕ МНЕНИЕ OPUS:\n"+result.results.find(r=>r.reviewer==="opus")!.review.observations.map(o=>o.imageId+": "+o.anatomy+" — "+o.sign+". "+o.uncertainty).join("\n"):"") + "\n"], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "opus-preliminary-radiologist-report.txt";
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setDraftError("");
        }
        catch {
            setDraftError("Исходный срез изменён или текст заключения пуст. Сохранение запрещено.");
        }
    };
    const downloadLocalReview = () => {
        if (!result)
            return;
        try {
            const doc = buildLocalDualReviewDraft(result, exactReviewedHashes.map(f => ({ imageId: f.imageId, reviewedPixelSha256: f.sha256 })), originalLocalFileIds, decisions, clinicalSynthesis);
            const payload = validLateReview ? {
                ...doc, schema: "opus-local-dual-vision-detector-physician-draft/v1",
                lateDetectorReconciliation: {
                    provider: "openrouter", opusModel: validLateReview.opusModel,
                    numericFacts: validLateReview.detectorEvidence.facts,
                    editableUnsignedDraft: lateDraft,
                    limitations: validLateReview.draft.limitations,
                    imagePixelsResent: false, originalDicomSent: false,
                    clinicianSigned: false, clinicalValidation: false,
                },
            } : doc;
            const finalPayload = result.opusSynthesis ? {
                ...payload,
                integratedOpusReport: {
                    ...result.opusSynthesis, editableUnsignedDraft: integratedDraft,
                    sourcePixelSHA256: doc.provenance.sourceImagePixelSHA256,
                    physicianSigned: false,
                },
            } : payload;
            const blob = new Blob([JSON.stringify(finalPayload, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = validLateReview ? "opus-local-gemini-opus-detector-review.json" : "opus-local-gemini-opus-physician-review.json";
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setDraftError("");
        }
        catch {
            setDraftError("Сверка потеряла исходную серию или содержит неподтверждённое наблюдение. Экспорт запрещён.");
        }
    };
    return <section className="ora-evidence-draft" aria-label={__ui("Отправка проверенных обезличенных CT/MR кадров в OpenRouter")}>
    <h4><LocalizedUi value={"Анализ изображений · Argon; Opus при необходимости"}/></h4>
    <p role="status"><strong><LocalizedUi value={originalDetectorEvidence?.facts.some(f => f.status === "completed") ?
            "Режим: детекторы + AI." : "Режим: AI по кадрам без результатов детекторов."}/></strong>
      <LocalizedUi value={originalDetectorEvidence?.facts.some(f => f.status === "completed") ?
            " Выполненные результаты детекторов будут учтены в заключении." :
            " Gemini и Opus могут анализировать кадры самостоятельно. Невыполненные задачи детекторов не считаются отрицательными результатами."}/></p>
    <p><LocalizedUi value={"Argon описывает проверенные кадры и составляет редактируемое заключение. При существенном расхождении Opus независимо смотрит эти изображения. Охват — только показанные кадры."}/></p>
    <LocalizedUi value={checkingServer && <p role="status"><LocalizedUi value={"Проверяем подключение Gemini и Opus…"}/></p>}/>
    <LocalizedUi value={!server?.workstationConnected && <div>
      <button type="button" disabled={working || checkingServer} onClick={() => void checkReadiness()}>
        <LocalizedUi value={autoConnect ? "Повторить проверку подключения" : "Подключить Gemini и Opus"}/>
      </button>
    </div>}/>
    <LocalizedUi value={server?.workstationConnected && <p role="status"><LocalizedUi value={"Локальное рабочее место подключено. Передача снимков начнётся только после проверки кадров и вашего разрешения ниже."}/></p>}/>
    <LocalizedUi value={!checkingServer && !server?.enabled && <details><summary><LocalizedUi value={"Администратору · настройка подключения"}/></summary><p><LocalizedUi value={"Нужны"}/><code> RADIOLOGY_ENABLE_DEIDENTIFIED_OPENROUTER_PILOT=1</code>,
      <code> RADIOLOGY_OPENROUTER_HEALTH_DATA_APPROVED=1</code>,
      <code> OPENROUTER_API_KEY</code><LocalizedUi value={"и"}/><code> RADIOLOGY_LOCAL_RESEARCH_OPERATOR_TOKEN</code><LocalizedUi value={"(24+ символов). либо настроенный локальный сеанс проверенных кадров. Включать только после проверки прав передачи медицинских данных провайдеру."}/></p></details>}/>
    <LocalizedUi value={primaryAnalysisStage === "running" && <p role="status"><LocalizedUi value={"Ожидаем завершения оригинальных детекторов. Независимые PNG готовятся параллельно, но запрос Gemini → Opus откроется только после локального этапа, чтобы сохранить все модельные результаты."}/></p>}/>
    <LocalizedUi value={primaryAnalysisStage === "cancelled" && <p role="alert"><LocalizedUi value={"Анализ детекторов отменён. Перезапустите исследование для согласованного заключения."}/></p>}/>
    <LocalizedUi value={!enabledByLocalChecks && <p role="status"><LocalizedUi value={"Сначала подтвердите выше, что вы просмотрели все кадры и персональных данных на них нет. Если идёт подготовка, дождитесь её завершения."}/></p>}/>
    <details><summary><LocalizedUi value={"Дополнительно · пароль оператора"}/></summary>
    <label><LocalizedUi value={"Локальный пароль оператора"}/><input type="password" value={token} autoComplete="off" maxLength={512} disabled={working} onChange={e => setToken(e.target.value)} placeholder={__ui("Только локальный сервер")}/></label>
    </details>
    <p role="note"><LocalizedUi value={"Нажатие кнопки подтверждает разрешение врача передать проверенные обезличенные кадры в OpenRouter и выполнить платный анализ. Повторная галочка не требуется."}/></p>
    <LocalizedUi value={specialistFacts && <label><input type="checkbox" disabled={working} checked={includeSpecialist} onChange={e => { setIncludeSpecialist(e.target.checked); setResult(null); }}/><LocalizedUi value={"Дополнительно передать обеим LLM только измерения из локального R231 той же КТ: правая маска"}/><LocalizedUi value={specialistFacts.rightLungMaskMl.toFixed(1)}/><LocalizedUi value={"мл, левая"}/><LocalizedUi value={specialistFacts.leftLungMaskMl.toFixed(1)}/><LocalizedUi value={"мл,"}/><LocalizedUi value={specialistFacts.frameCount}/><LocalizedUi value={"срезов. Маска, UID и путь исходных DICOM не передаются. Модель R231 размечает лёгкие, но не детектирует патологию."}/></label>}/>
    <LocalizedUi value={originalCxrEvidence && <label><input type="checkbox" checked={includeCxr} disabled={working} onChange={e => { setIncludeCxr(e.target.checked); setResult(null); }}/><LocalizedUi value={"Разрешаю передать шесть некалиброванных показателей TorchXRayVision только Claude Opus ПОСЛЕ независимого разбора рентгенограммы Gemini Vision. Это не диагноз и не вероятность заболевания."}/></label>}/>
    <LocalizedUi value={originalDetectorEvidence && validateSanitizedDetectorBundle(originalDetectorEvidence) && primaryAnalysisStage !== "idle" &&
            <p role="status"><LocalizedUi value={"Оригинальные детекторы текущего исследования будут переданы Claude Opus автоматически после независимого просмотра исходных кадров Gemini. Результаты детекторов не раскрываются Gemini до её первого ответа."}/></p>}/>
    <LocalizedUi value={originalDetectorEvidence && validateSanitizedDetectorBundle(originalDetectorEvidence) && primaryAnalysisStage === "idle" &&
            <label><input type="checkbox" disabled={working} checked={includeDetectors} onChange={e => {
                    setIncludeDetectors(e.target.checked);
                    setResult(null);
                }}/><LocalizedUi value={"Дополнительно передать Gemini Vision и Opus ТОЛЬКО числовые модельные находки текущей DICOM-серии: завершено"}/><LocalizedUi value={originalDetectorEvidence.facts.filter(f => f.status === "completed").length}/><LocalizedUi value={"из"}/><LocalizedUi value={originalDetectorEvidence.facts.length}/><LocalizedUi value={"задач. Исходные UID, SHA, координаты и сами маски не передаются."}/></label>}/>
    <div className="ora-evidence-actions">
      <button type="button" disabled={working || lateWorking || !enabledByLocalChecks || !modelPathSettled } onClick={() => void send()}><LocalizedUi value={working ? "Gemini → Opus анализируют кадры…" :
            "Отправить проверенные кадры в анализ (платно)"}/></button>
      <LocalizedUi value={working && <button type="button" onClick={() => ctl.current?.abort()}><LocalizedUi value={"Отменить"}/></button>}/>
    </div>
    <LocalizedUi value={readinessNote && <p role="status"><LocalizedUi value={readinessNote}/></p>}/>
    <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
    <LocalizedUi value={result && <div aria-live="polite">
      <p><strong><LocalizedUi value={"Ответ моделей получен."}/></strong><LocalizedUi value={"Это черновые визуальные наблюдения по отдельным срезам, не полноценный анализ исследования и не диагноз. Врач сверяет их с исходным DICOM локально."}/></p>
      <IndependentImageOpinion result={result} payload={requestPayload.current} headers={{"X-Opus-Local-Operator-Token":token}} onResult={setResult}/>
      <LocalizedUi value={result.opusSynthesis && <section ref={reportSection} tabIndex={-1} aria-label={__ui("Основное заключение Argon")} className="ora-reviewer-note">
        <h4><LocalizedUi value={"Готовое описание и заключение · редактирование и сохранение TXT"}/></h4>
        <p><LocalizedUi value={"Argon описал выбранные изображения с учётом выполненных детекторов. Охват ограничен выборкой. Второе мнение Opus показано отдельно, если оно запрошено."}/></p>
        <label><LocalizedUi value={"Редактируемое описание и заключение рентгенолога"}/><textarea data-concilium-report="true" rows={14} maxLength={MAX_RADIOLOGIST_REPORT_CHARS} value={integratedDraft} onChange={e => setIntegratedDraft(e.target.value)}/>
        </label>
        <button type="button" onClick={downloadRadiologistText}><LocalizedUi value={"Скачать заключение рентгенолога TXT"}/></button>
        <p><LocalizedUi value={"Машинный JSON остаётся внутренним протоколом аудита; для врача основным результатом является текст выше."}/></p>
        <details><summary><LocalizedUi value={"Техническая сверка с детекторами"}/></summary>
        <LocalizedUi value={result.opusSynthesis.comparisons.map(entry => <p key={entry.task}>
          <strong><LocalizedUi value={entry.task}/></strong>: <LocalizedUi value={entry.assessment === "compatible" ? "согласуется в доступных кадрах" :
                        entry.assessment === "discordant" ? "расхождение" : "недостаточно данных для сопоставления"}/>.
          <LocalizedUi value={" "}/><LocalizedUi value={entry.reason}/>
        </p>)}/>
        <LocalizedUi value={result.opusSynthesis.conflicts.map((x, i) => <p key={i}><LocalizedUi value={"Расхождение:"}/><LocalizedUi value={x}/></p>)}/>
        <LocalizedUi value={result.opusSynthesis.limitations.map((x, i) => <p key={i}><LocalizedUi value={"Ограничение:"}/><LocalizedUi value={x}/></p>)}/>
        </details>
      </section>}/>
      <LocalizedUi value={lateEvidenceReady && <section aria-label={__ui("Позднее согласование детекторов с Opus")} className="ora-reviewer-note">
        <h4><LocalizedUi value={"Детектор завершился после Vision · согласовать с Claude Opus"}/></h4>
        <p><LocalizedUi value={"Новые оригинальные числовые находки по текущей серии: завершено"}/><LocalizedUi value={originalDetectorEvidence!.facts.filter(f => f.status === "completed").length}/><LocalizedUi value={"из"}/><LocalizedUi value={originalDetectorEvidence!.facts.length}/><LocalizedUi value={"задач. Ранее оплаченные результаты Gemini и Opus и решения врача сохранены. Дополнительный вызов не повторяет Gemini и не отправляет изображения."}/></p>
        <label><input type="checkbox" checked={lateConsent} disabled={lateWorking || working} onChange={e => setLateConsent(e.target.checked)}/><LocalizedUi value={"Разрешаю передать проверенные обезличенные текстовые наблюдения и новые числовые факты одному вызову Argon. Подтверждаю право передачи и оплату одного дополнительного запроса."}/></label>
        <button type="button" disabled={!lateConsent || lateWorking || working ||
                    !enabledByLocalChecks || token.length < 24} onClick={() => void reconcileLate()}>
          <LocalizedUi value={lateWorking ? "Argon сопоставляет находки…" : "Сопоставить новые результаты детекторов (Argon, без PNG)"}/>
        </button>
        <LocalizedUi value={lateWorking && <button type="button" onClick={() => ctl.current?.abort()}><LocalizedUi value={"Отменить Opus"}/></button>}/>
        <LocalizedUi value={validLateReview && <div role="status">
          <h4><LocalizedUi value={"Opus · общий предварительный отчёт для врача"}/></h4>
          <textarea rows={14} maxLength={6000} value={lateDraft} onChange={e => setLateDraft(e.target.value)}/>
          <LocalizedUi value={validLateReview.draft.limitations.map((t, i) => <p key={i}><LocalizedUi value={t}/></p>)}/>
          <p><LocalizedUi value={"Отчёт сохраняется с первоначальными наблюдениями и решениями врача через кнопку локального экспорта ниже."}/></p>
        </div>}/>
      </section>}/>
      <h4><LocalizedUi value={"Покадровое сопоставление · без голосования моделей"}/></h4>
      <p><LocalizedUi value={"Числа ниже — количество текстовых наблюдений, не вероятность заболевания и не доказательство согласия Gemini и Opus."}/></p>
      <ul><LocalizedUi value={perFrameModelCoverage(result).map(row => <li key={row.imageId}><LocalizedUi value={"Кадр"}/><LocalizedUi value={row.imageId}/>: Gemini — <LocalizedUi value={row.geminiFindings}/>; Opus — <LocalizedUi value={result.results.some(r=>r.reviewer==='opus')?row.opusFindings:'не вызывался'}/>.
        <button type="button" onClick={() => {
                    try {
                        const id = sourceFileForObservation(result, exactReviewedHashes.map(f => ({ imageId: f.imageId, reviewedPixelSha256: f.sha256 })), originalLocalFileIds, row.imageId);
                        onOpenOriginalSlice(id);
                        setError("");
                    }
                    catch {
                        setError("Срез больше не совпадает с проверенным исходным DICOM. Повторите локальную привязку.");
                    }
                }}><LocalizedUi value={"Открыть исходный DICOM-срез"}/></button>
      </li>)}/></ul>
      <LocalizedUi value={result.cxrModelEvidence && <section aria-label={__ui("Независимый CXR Gemini Vision и выводы TorchXRayVision")}>
        <h4><LocalizedUi value={"Argon и результаты TorchXRayVision"}/></h4>
        <p><LocalizedUi value={"Argon получил изображение и шесть некалиброванных оценок детектора. Второе мнение Opus, если вызвано, не получает заключение Argon."}/></p>
        <LocalizedUi value={Object.entries(result.cxrModelEvidence.labels).map(([k, v]) => <p key={k}><LocalizedUi value={k}/>: <LocalizedUi value={v.toFixed(4)}/><LocalizedUi value={"(некалиброванный балл)"}/></p>)}/>
      </section>}/>
      <LocalizedUi value={result.detectorEvidence && <section aria-label={__ui("Числовые находки реальных моделей той же КТ/МРТ")}>
        <h4><LocalizedUi value={"Реальные детекторы · тот же исходный DICOM"}/></h4>
        <p><LocalizedUi value={"Gemini Vision и Claude Opus получили только ограниченные числовые сведения. Модельное совпадение не доказывает клиническую точность."}/></p>
        <LocalizedUi value={result.detectorEvidence.facts.map(f => <p key={f.task}>
          <LocalizedUi value={f.task}/>: <LocalizedUi value={f.status === "completed" ?
                        "модельных кандидатов " + f.candidateCount : "не исследовано"}/>
        </p>)}/>
      </section>}/>
      <LocalizedUi value={result.specialistEvidence && <section aria-label={__ui("Объединённые локальные данные R231 и Gemini Opus")}>
        <h4><LocalizedUi value={"Локальный CPU-детектор · Lungmask R231"}/></h4>
        <p><LocalizedUi value={"Объёмы сегментации той же выбранной КТ: справа"}/><LocalizedUi value={result.specialistEvidence.rightLungMaskMl.toFixed(1)}/><LocalizedUi value={"мл, слева"}/><LocalizedUi value={result.specialistEvidence.leftLungMaskMl.toFixed(1)}/><LocalizedUi value={"мл,"}/><LocalizedUi value={result.specialistEvidence.frameCount}/><LocalizedUi value={"срезов."}/></p>
        <p><LocalizedUi value={"Маски — анатомические, не очаги болезни. Подлинность происхождения чисел дополнительно не проверялась сервером OpenRouter; сопоставление с исходной КТ сделано локально."}/></p>
      </section>}/>
      <LocalizedUi value={localLaa950 && <section aria-label={__ui("Локальная HU-денситометрия того же CT без облака")}>
        <h4><LocalizedUi value={"LAA−950 · отдельное локальное измерение текущей КТ"}/></h4>
        <p><LocalizedUi value={"Внутри обработанного фрагмента маски R231: всего"}/><LocalizedUi value={localLaa950.lowAttenuationPctOfSampledMask.toFixed(2)}/><LocalizedUi value={"%, справа"}/><LocalizedUi value={localLaa950.rightLungPct.toFixed(2)}/><LocalizedUi value={"%, слева"}/><LocalizedUi value={localLaa950.leftLungPct.toFixed(2)}/><LocalizedUi value={"% вокселей ≤−950 HU."}/></p>
        <p><LocalizedUi value={"Этот показатель вычислен только на CPU и"}/><strong><LocalizedUi value={"не направлялся Gemini или Opus"}/></strong><LocalizedUi value={". Это не независимое подтверждение LLM и не диагноз эмфиземы или ХОБЛ. Точная калибровка декодера и полнота лёгких ещё не доказаны."}/></p>
      </section>}/>
      <LocalizedUi value={result.results.map(r => <article key={r.reviewer} style={{ border: "1px solid #8c9b95", padding: 12, borderRadius: 8, marginTop: 8 }}>
        <h4><LocalizedUi value={r.reviewer === "gemini" ? "Argon" : "Opus — второе мнение"}/> — <LocalizedUi value={r.model}/></h4>
        <p><LocalizedUi value={"Изучено кадров:"}/><LocalizedUi value={r.review.reviewedImageIds.join(", ")}/></p>
        <LocalizedUi value={r.review.observations.length ? <ul><LocalizedUi value={r.review.observations.map(o => <li key={o.id}>
          <strong><LocalizedUi value={o.imageId}/> · <LocalizedUi value={o.anatomy}/>:</strong> <LocalizedUi value={o.sign}/>
          <small><LocalizedUi value={"· Ограничение:"}/><LocalizedUi value={o.uncertainty}/></small>
          <div className="ora-evidence-actions">
            <LocalizedUi value={(["needs_original_source_recheck", "rejected_by_local_reviewer"] as const).map(choice => <button type="button" key={choice} aria-pressed={decisions[findingReviewKey(r.reviewer, o.imageId, o.id)]?.decision === choice} onClick={() => {
                                const key = findingReviewKey(r.reviewer, o.imageId, o.id);
                                setDecisions(prev => ({ ...prev, [key]: { decision: choice, note: prev[key]?.note ?? "" } }));
                            }}>
                <LocalizedUi value={choice === "needs_original_source_recheck" ? "На перепроверку" : "Отклонить локально"}/>
              </button>)}/>
          </div>
          <label><LocalizedUi value={"Локальная заметка врача ·"}/><LocalizedUi value={o.imageId}/>
            <textarea rows={2} maxLength={500} value={decisions[findingReviewKey(r.reviewer, o.imageId, o.id)]?.note ?? ""} onChange={e => {
                            const key = findingReviewKey(r.reviewer, o.imageId, o.id);
                            setDecisions(prev => ({ ...prev, [key]: {
                                    decision: prev[key]?.decision ?? "unreviewed", note: e.target.value,
                                } }));
                        }}/>
          </label>
          <button type="button" onClick={() => {
                            try {
                                const id = sourceFileForObservation(result, exactReviewedHashes.map(f => ({ imageId: f.imageId, reviewedPixelSha256: f.sha256 })), originalLocalFileIds, o.imageId);
                                onOpenOriginalSlice(id);
                                setError("");
                            }
                            catch {
                                setError("Источник наблюдения изменился или не найден. Переход заблокирован.");
                            }
                        }}><LocalizedUi value={"Показать исходный срез"}/></button>
        </li>)}/></ul> :
                    <p><LocalizedUi value={"Наблюдений нет; это не исключает патологию."}/></p>}/>
        <ul><LocalizedUi value={r.review.limitations.map((t, i) => <li key={i}><LocalizedUi value={t}/></li>)}/></ul>
      </article>)}/>
      <section className="ora-reviewer-note" aria-label={__ui("Локальная врачебная сверка Gemini Opus и R231")}>
        <h4><LocalizedUi value={"Врачебная сверка наблюдений и детектора · локально"}/></h4>
        <p><LocalizedUi value={"Отметки относятся только к наблюдениям отдельных срезов. Выводы Gemini и Opus не голосуют за диагноз. Врачебные записи остаются в браузере и могут содержать чувствительные данные."}/></p>
        <label><LocalizedUi value={"Рабочий синтез врача (необязательно)"}/><textarea rows={3} maxLength={4000} value={clinicalSynthesis} onChange={e => setClinicalSynthesis(e.target.value)}/>
        </label>
        <button type="button" onClick={downloadLocalReview}><LocalizedUi value={"Скачать локальный неподписанный протокол сверки JSON"}/></button>
        <LocalizedUi value={draftError && <p role="alert"><LocalizedUi value={draftError}/></p>}/>
        <small><LocalizedUi value={"Протокол не содержит исходные UID, имена файлов, пиксели или DICOM, но текст наблюдений и врачебных заметок может быть медицинской тайной. Храните его локально; данные не направляются LLM повторно."}/></small>
      </section>
      <p><LocalizedUi value={"Разные выводы двух моделей не усредняются. Исходные фреймы и привязка к DICOM не покидают браузер. Проверка врачом обязательна."}/></p>
    </div>}/>
  </section>;
}
