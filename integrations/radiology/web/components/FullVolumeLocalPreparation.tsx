"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useMemo, useRef, useState } from "react";
import type { DicomSeries } from "../lib/dicom-series";
import type { SanitizedDetectorBundle } from "../lib/detector-consilium-evidence";
import { planOriginalVolumeSource, prepareOriginalVolumeBatches } from "../lib/vision-volume-source";
import { appendGeminiVolumeReceipt, volumeLedger, canPayForNextBatch, makeSafeVolumeOpusInput, type LocalVolumeReceipt } from "../lib/full-volume-receipts";
import type { VolumeGeminiBatchResult } from "../lib/approved-volume-batch-review";
import type { FullVolumeOpusResult } from "../lib/full-volume-opus-synthesis";
import type { AutoVolumePacket } from "../lib/auto-volume-research-packet";
type Stage = "idle" | "preparing" | "gemini" | "detectors" | "opus" | "completed" | "unavailable" | "interrupted";
type DetectorStage = "idle" | "running" | "completed" | "vision-only" | "cancelled";
export default function FullVolumeLocalPreparation({ series, files, flaggedIndex, onOpenSlice, autoStart = false, showAdminControls = false, detectorStage = "idle", detectorEvidence = null, }: {
    series: DicomSeries;
    files: ReadonlyMap<string, File>;
    flaggedIndex: number | null;
    onOpenSlice: (fileId: string) => void;
    autoStart?: boolean;
    showAdminControls?: boolean;
    detectorStage?: DetectorStage;
    detectorEvidence?: SanitizedDetectorBundle | null;
}) {
    const __ui = useUiTranslator();
    const [stage, setStage] = useState<Stage>("idle");
    const [notice, setNotice] = useState("После запуска исследования результаты появятся здесь.");
    const [progress, setProgress] = useState(0);
    const [report, setReport] = useState<FullVolumeOpusResult | null>(null);
    const [editable, setEditable] = useState("");
    const [sessionReady, setSessionReady] = useState<boolean | null>(null);
    const [connectionReason, setConnectionReason] = useState("");
    function connectionMessage(status: unknown): string {
        if (status === "missing-provider")
            return "Анализ не выполнен: сервер не нашёл ключ OpenRouter.";
        if (status === "not-approved")
            return "Облачный анализ публичных исследований не разрешён в настройках сервера.";
        if (status === "not-development")
            return "Облачный анализ доступен только на локальном исследовательском сервере.";
        return "Нет подключения к Gemini и Opus. Проверьте состояние на странице «Техническая панель».";
    }
    const [adminToken, setAdminToken] = useState("");
    const [adminIssue, setAdminIssue] = useState("");
    const [checkingConnection, setCheckingConnection] = useState(false);
    const ctl = useRef<AbortController | null>(null);
    const started = useRef(false);
    const detectorStageRef = useRef(detectorStage);
    const detectorEvidenceRef = useRef(detectorEvidence);
    useEffect(() => { detectorStageRef.current = detectorStage; detectorEvidenceRef.current = detectorEvidence; }, [detectorStage, detectorEvidence]);
    const budget = 0.50;
    const plan = useMemo(() => {
        try {
            return planOriginalVolumeSource(series, { maxGeminiUSD: budget,
                flaggedIndices: flaggedIndex === null ? [] : [flaggedIndex] });
        }
        catch {
            return null;
        }
    }, [series, flaggedIndex]);
    useEffect(() => { return () => ctl.current?.abort(); }, []);
    useEffect(() => {
        let active = true;
        void fetch("/api/ai/volume-operator-session", { cache: "no-store", credentials: "same-origin" })
            .then(async (r) => r.ok ? await r.json() : null)
            .then(d => {
            if (active) {
                setSessionReady(d?.workstationConnected === true);
                setConnectionReason(connectionMessage(d?.status));
            }
        })
            .catch(() => {
            if (active) {
                setSessionReady(false);
                setConnectionReason("Сервер проверки подключения не отвечает.");
            }
        });
        return () => { active = false; };
    }, []);
    async function retryConnection() {
        // Doctor-initiated recovery after the workstation administrator configures
        // this local research endpoint. Never start a paid call merely on a timer.
        if (checkingConnection || stage !== "unavailable")
            return;
        setCheckingConnection(true);
        try {
            const r = await fetch("/api/ai/volume-operator-session", {
                cache: "no-store", credentials: "same-origin",
            });
            const data = r.ok ? await r.json() : null;
            if (data?.workstationConnected === true) {
                started.current = false;
                setSessionReady(true);
                setNotice("Подключение установлено. Начинаем анализ исследования…");
            }
            else {
                setConnectionReason(connectionMessage(data?.status));
                setNotice(connectionMessage(data?.status));
            }
        }
        catch {
            setNotice("Анализ не выполнен: локальный сервис недоступен.");
        }
        finally {
            setCheckingConnection(false);
        }
    }
    async function connectAdmin() {
        setAdminIssue("");
        const r = await fetch("/api/ai/volume-operator-session", {
            method: "POST", cache: "no-store", credentials: "same-origin",
            headers: { "X-Opus-Local-Operator-Token": adminToken },
        }).catch(() => null);
        setAdminToken("");
        if (!r?.ok) {
            setAdminIssue("Рабочее место не подключено. Проверьте настройки сервера.");
            return;
        }
        setSessionReady(true);
        setAdminIssue("Рабочее место готово к анализу.");
    }
    async function execute(signal: AbortSignal) {
        if (!plan)
            throw Error("Геометрия томографического ряда не подтверждена");
        let receipts: LocalVolumeReceipt[] = [];
        for await (const batch of prepareOriginalVolumeBatches(series, files, {
            signal, maxGeminiUSD: budget,
            flaggedIndices: flaggedIndex === null ? [] : [flaggedIndex],
        })) {
            if (signal.aborted)
                throw Error("Анализ отменён");
            setStage("preparing");
            setNotice("Подготавливаются изображения для анализа…");
            // OCR outputs must correspond to the exact final PNG, without remaining text.
            if (batch.privacy.unresolved !== 0 ||
                batch.privacy.frames.some(f => batch.privacy.ocr[f.frameId]?.sha256 !== f.sha256 ||
                    batch.privacy.ocr[f.frameId].regions.length !== 0))
                throw Error("На изображении остались надписи; передача остановлена");
            if (!canPayForNextBatch(plan.budget, plan.batches, receipts))
                throw Error("Достигнут заданный предел расходов онлайн-анализа");
            const packet: AutoVolumePacket = {
                schema: "opus-public-volume-auto-ocr/v1",
                modality: series.modality as "CT" | "MR",
                frames: batch.privacy.frames.map(f => ({
                    frameId: f.frameId, pngBase64: f.pngBase64, sha256: f.sha256,
                    ocrSha256: batch.privacy.ocr[f.frameId].sha256, ocrClear: true,
                })),
            };
            setStage("gemini");
            setNotice("Gemini изучает изображения исследования…");
            const response = await fetch("/api/ai/approved-volume-gemini-batch", {
                method: "POST", cache: "no-store", credentials: "same-origin", signal,
                headers: { "Content-Type": "application/json", "X-Opus-Auto-Public-Volume": "1" },
                body: JSON.stringify({
                    packet, acknowledgeClinicianLawfulDisclosure: true,
                    acknowledgeProviderHealthDataTerms: true,
                    acknowledgeAutomaticOCRAndNoPerFramePhysicianReview: true,
                    acknowledgeOnePaidGeminiBatch: true,
                }),
            });
            if (!response.ok)
                throw Error("Анализ изображений временно недоступен (" + response.status + ")");
            const answer = await response.json() as VolumeGeminiBatchResult;
            if (answer.modality !== series.modality)
                throw Error("Несоответствие исследуемого ряда");
            receipts = appendGeminiVolumeReceipt(receipts, plan.batches, batch.batchIndex, answer);
            setProgress(volumeLedger(plan.budget, plan.batches, receipts).processedOverviewFrames);
        }
        const ledger = volumeLedger(plan.budget, plan.batches, receipts);
        if (!ledger.completedFullOverview || receipts.length !== plan.batches.length)
            throw Error("Не весь томографический ряд удалось оценить");
        setStage("detectors");
        setNotice("Сопоставляем результаты визуального анализа и детекторов…");
        // Gemini was started independently of local models. Never block indefinitely
        // on a hanging CPU/GPU detector worker.
        const began = Date.now();
        while (!signal.aborted && detectorStageRef.current === "running" && Date.now() - began < 30000)
            await new Promise<void>(r => setTimeout(r, 250));
        if (signal.aborted)
            throw Error("Анализ отменён");
        const state = detectorStageRef.current === "completed" ? "completed" :
            detectorStageRef.current === "running" ? "timeout" : "unavailable";
        const safe = makeSafeVolumeOpusInput(series.modality as "CT" | "MR", plan.budget, plan.batches, receipts, detectorEvidenceRef.current, state);
        setStage("opus");
        setNotice("Claude Opus объединяет результаты и составляет заключение…");
        const final = await fetch("/api/ai/complete-volume-opus", {
            method: "POST", cache: "no-store", credentials: "same-origin", signal,
            headers: { "Content-Type": "application/json", "X-Opus-Auto-Public-Volume": "1" },
            body: JSON.stringify(safe),
        });
        if (!final.ok)
            throw Error("Формирование заключения недоступно (" + final.status + ")");
        const output = await final.json() as FullVolumeOpusResult;
        if (output.schema !== "opus-full-volume-radiologist/v1" ||
            output.modality !== series.modality ||
            output.overviewReviewed !== plan.sourceFrames.length ||
            !output.physicianSignatureRequired ||
            typeof output.finalReport !== "string" || output.finalReport.length < 180)
            throw Error("Сервер не подтвердил структуру заключения");
        setReport(output);
        setEditable(output.finalReport);
        setStage("completed");
        setNotice("Описание и заключение готовы для проверки врачом.");
    }
    useEffect(() => {
        if (!autoStart || !plan || started.current)
            return;
        if (sessionReady === null)
            return;
        started.current = true;
        const controller = new AbortController();
        ctl.current = controller;
        if (!sessionReady) {
            setStage("unavailable");
            setNotice(connectionReason || "Анализ не выполнен: облачный сервис недоступен.");
            return;
        }
        void execute(controller.signal).catch(e => {
            if (controller.signal.aborted)
                return;
            setStage("interrupted");
            setNotice(e instanceof Error ? e.message : "Автоматический анализ не завершён");
        });
        // Only the primary action can initiate automatic paid study-wide cloud analysis.
        // Once the operator session is resolved, a user-initiated primary analysis starts.
        // No subsequent admin reconnection silently restarts failed paid inference.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoStart, sessionReady]);
    function stop() {
        ctl.current?.abort();
        setStage("interrupted");
        setNotice("Анализ остановлен. Результат неполный; повторный платный запуск не выполняется.");
    }
    function download() {
        if (stage !== "completed" || !report || !editable.trim())
            return;
        const url = URL.createObjectURL(new Blob([editable.trim() + "\n"], {
            type: "text/plain;charset=utf-8"
        }));
        const a = document.createElement("a");
        a.href = url;
        a.download = "opus-radiology-report.txt";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    if (!plan)
        return <p role="status"><LocalizedUi value={"\u041F\u043E\u043B\u043D\u044B\u0439 \u0442\u043E\u043C\u043E\u0433\u0440\u0430\u0444\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0440\u044F\u0434 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0434\u043B\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0438. \u0421\u043D\u0438\u043C\u043A\u0438 \u043C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u0432\u0440\u0443\u0447\u043D\u0443\u044E."}/></p>;
    return <section aria-label={__ui("\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0430\u043D\u0430\u043B\u0438\u0437 \u0432\u0441\u0435\u0433\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F")}>
   <h4><LocalizedUi value={"\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0430\u043D\u0430\u043B\u0438\u0437\u0430 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F"}/></h4>
   <p role="status"><LocalizedUi value={notice}/></p>
   <LocalizedUi value={["preparing", "gemini", "detectors", "opus"].includes(stage) &&
            <p><LocalizedUi value={"\u0418\u0437\u0443\u0447\u0435\u043D\u043E"}/><LocalizedUi value={progress}/><LocalizedUi value={"\u0438\u0437"}/><LocalizedUi value={plan.sourceFrames.length}/><LocalizedUi value={"\u0441\u0440\u0435\u0437\u043E\u0432."}/><LocalizedUi value={stage === "opus" ? " Формируется протокол рентгенолога." : ""}/></p>}/>
   <LocalizedUi value={stage === "completed" && report && <>
     <h4><LocalizedUi value={"\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0438 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435"}/></h4>
     <p><LocalizedUi value={"\u041F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0435 \u0441\u043D\u0438\u043C\u043A\u0438 \u0438 \u043F\u0440\u0438 \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u043E\u0441\u0442\u0438 \u043E\u0442\u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u0443\u0439\u0442\u0435."}/></p>
     <textarea data-concilium-report="true" rows={18} style={{ width: "100%" }} value={editable} onChange={e => setEditable(e.target.value)}/>
     <button type="button" onClick={download}><LocalizedUi value={"\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435"}/></button>
   </>}/>
   <LocalizedUi value={["preparing", "gemini", "detectors", "opus"].includes(stage) &&
            <button type="button" onClick={stop}><LocalizedUi value={"\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0430\u043D\u0430\u043B\u0438\u0437"}/></button>}/>
   <LocalizedUi value={!autoStart && <p><LocalizedUi value={"\u0414\u043B\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0438 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u043E\u0431\u0449\u0443\u044E \u043A\u043D\u043E\u043F\u043A\u0443 \u00AB\u0410\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435\u00BB \u043D\u0430\u0434 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u043E\u043C \u0441\u043D\u0438\u043C\u043A\u043E\u0432."}/></p>}/>
   <LocalizedUi value={stage === "unavailable" && !showAdminControls && <button type="button" disabled={checkingConnection} onClick={() => void retryConnection()}>
       <LocalizedUi value={checkingConnection ? "Проверяем подключение…" : "Повторить анализ после подключения"}/>
     </button>}/>
   <LocalizedUi value={showAdminControls && sessionReady === false && <details>
     <summary><LocalizedUi value={"\u0410\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0443 \u00B7 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0440\u0430\u0431\u043E\u0447\u0435\u0433\u043E \u043C\u0435\u0441\u0442\u0430"}/></summary>
     <p><LocalizedUi value={"\u041E\u0434\u043D\u043E\u043A\u0440\u0430\u0442\u043D\u043E \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u0442\u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u0443\u044E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0443\u044E \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0443 \u043D\u0430 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u043C \u0441\u0435\u0440\u0432\u0435\u0440\u0435. \u0412\u0440\u0430\u0447 \u043D\u0435 \u0432\u0432\u043E\u0434\u0438\u0442 \u043A\u043B\u044E\u0447\u0438 \u0438\u043B\u0438 \u0430\u0434\u0440\u0435\u0441\u0430 \u043C\u043E\u0434\u0435\u043B\u0435\u0439."}/></p>
     <label><LocalizedUi value={"\u041A\u043E\u0434 \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430"}/><input type="password" value={adminToken} autoComplete="off" onChange={e => setAdminToken(e.target.value)}/></label>
     <button type="button" onClick={() => void connectAdmin()}><LocalizedUi value={"\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C"}/></button>
     <LocalizedUi value={adminIssue && <p role="status"><LocalizedUi value={adminIssue}/></p>}/>
   </details>}/>
   <LocalizedUi value={showAdminControls && <details><summary><LocalizedUi value={"\u041F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0435 \u0441\u0440\u0435\u0437\u044B"}/></summary>
     <LocalizedUi value={plan.sourceFrames.length}/><LocalizedUi value={"\u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0439. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0440\u0435\u0437 \u0432 \u043E\u043A\u043D\u0435 DICOM \u0438\u043B\u0438 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u0441\u043F\u0438\u0441\u043A\u0430 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0439."}/><button type="button" onClick={() => onOpenSlice(plan.sourceFrames[Math.floor(plan.sourceFrames.length / 2)].fileId)}><LocalizedUi value={"\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0441\u0440\u0435\u0434\u043D\u0438\u0439 \u0441\u0440\u0435\u0437"}/></button>
   </details>}/>
 </section>;
}
