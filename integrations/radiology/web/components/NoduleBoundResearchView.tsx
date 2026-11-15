"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useMemo, useRef, useState } from "react";
import { executeRealNodule } from "../lib/live-nodule-worker";
import type { WorkerSession } from "../lib/local-worker";
import { createNodulePhysicianReview, type ReaderNoduleDecision } from "../lib/monai-nodule-physician-review";
import { readNoduleNiftiHeader, parseBoundNoduleReport, verifyNoduleSource, readNoduleAxial, type NoduleNativeSource, type BoundNoduleReport } from "../lib/live-nodule-report";
/** A real NIfTI CT + the EXACT same-source completed pretrained MONAI report.
 * All file reading, SHA, rendering and candidate selection stay browser-local.
 */
export default function NoduleBoundResearchView({ initialSource = null, initialAutoSession = null, initialCompletedReport = null }: {
    initialSource?: File | null;
    initialAutoSession?: WorkerSession | null;
    initialCompletedReport?: BoundNoduleReport | null;
}) {
    const __ui = useUiTranslator();
    const [source, setSource] = useState<File | null>(null);
    const [reportFile, setReportFile] = useState<File | null>(null);
    const [ready, setReady] = useState<{
        source: NoduleNativeSource;
        report: BoundNoduleReport;
    } | null>(null);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [slice, setSlice] = useState(0);
    const [score, setScore] = useState(0.5);
    const [windowPreset, setWindowPreset] = useState<"lung" | "soft" | "bone">("lung");
    const [showMarks, setShowMarks] = useState(true);
    const [workerEndpoint, setWorkerEndpoint] = useState("http://127.0.0.1:8768");
    const [workerToken, setWorkerToken] = useState("");
    const [publicConfirmed, setPublicConfirmed] = useState(false);
    const [readerDecisions, setReaderDecisions] = useState<Record<number, ReaderNoduleDecision>>({});
    const canvas = useRef<HTMLCanvasElement | null>(null);
    const serial = useRef(0), controller = useRef<AbortController | null>(null);
    useEffect(() => () => { serial.current++; controller.current?.abort(); }, []);
    const reset = () => { serial.current++; controller.current?.abort(); setBusy(false); setReady(null); setReaderDecisions({}); setError(""); setStatus(""); };
    useEffect(() => {
        reset();
        setSource(initialSource);
        setReportFile(null);
        setPublicConfirmed(false);
        // Initial source is controlled by parent current open file, so stale findings
        // must disappear as soon as source changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialSource]);
    // Source and token are explicitly supplied by the physician from the DICOM action.
    // Do not persist the token or trigger inference for manually opened NIfTI.
    useEffect(() => {
        if (!initialSource || !initialAutoSession || initialCompletedReport)
            return;
        const version = ++serial.current;
        controller.current?.abort();
        const ctrl = new AbortController();
        controller.current = ctrl;
        setWorkerEndpoint(initialAutoSession.endpoint);
        setWorkerToken(initialAutoSession.token);
        setPublicConfirmed(true);
        setBusy(true);
        setReady(null);
        setReaderDecisions({});
        setError("");
        setStatus("Прямой запуск оригинальной MONAI RetinaNet из открытого DICOM...");
        void executeRealNodule(initialAutoSession, initialSource, ctrl.signal, message => {
            if (!ctrl.signal.aborted && version === serial.current)
                setStatus(message);
        }).then(result => {
            if (ctrl.signal.aborted || version !== serial.current)
                return;
            setReady(result);
            setSlice(0);
            setStatus("MONAI завершил инференс: исследовательские кандидаты доступны врачу.");
        }).catch(error => {
            if (!ctrl.signal.aborted && version === serial.current)
                setError(error instanceof Error ? error.message : "Прямой инференс MONAI не завершён.");
        }).finally(() => {
            if (version === serial.current)
                setBusy(false);
        });
        return () => { ctrl.abort(); };
    }, [initialSource, initialAutoSession, initialCompletedReport]);
    // Reuse one already completed inference: returning to detailed review MUST NOT
    // rerun MONAI, trigger another worker upload, or change the source identity.
    useEffect(() => {
        if (!initialSource || !initialCompletedReport)
            return;
        const version = ++serial.current;
        controller.current?.abort();
        const ctrl = new AbortController();
        controller.current = ctrl;
        setBusy(true);
        setReady(null);
        setReaderDecisions({});
        setError("");
        setStatus("Проверяем исходный SHA-256 без повторного запуска модели...");
        void (async () => {
            const src = await readNoduleNiftiHeader(initialSource);
            const checked = parseBoundNoduleReport(JSON.stringify(initialCompletedReport), src);
            await verifyNoduleSource(initialSource, checked.source.sha256, ctrl.signal);
            if (version !== serial.current || ctrl.signal.aborted)
                return;
            setReady({ source: src, report: checked });
            setSlice(0);
            setStatus("Тот же результат MONAI открыт без повторного инференса.");
        })().catch(e => {
            if (version === serial.current && !ctrl.signal.aborted)
                setError(e instanceof Error ? e.message : "Не удалось подтвердить исходную модель.");
        }).finally(() => {
            if (version === serial.current)
                setBusy(false);
        });
        return () => ctrl.abort();
    }, [initialSource, initialCompletedReport]);
    const candidates = useMemo(() => ready?.report.candidates.filter(c => c.score >= score && c.nativeVoxelIndexHypothesis)
        .sort((a, b) => b.score - a.score) ?? [], [ready, score]);
    async function open() {
        if (!source || !reportFile || busy)
            return;
        const revision = ++serial.current;
        controller.current?.abort();
        const active = new AbortController();
        controller.current = active;
        setBusy(true);
        setError("");
        setReady(null);
        setReaderDecisions({});
        setStatus("Проверка NIfTI и отчёта…");
        try {
            if (reportFile.size > 1024 * 1024)
                throw Error("JSON отчёта MONAI слишком большой.");
            const header = await readNoduleNiftiHeader(source);
            const result = parseBoundNoduleReport(await reportFile.text(), header);
            await verifyNoduleSource(source, result.source.sha256, active.signal);
            if (revision !== serial.current || active.signal.aborted)
                return;
            setSlice(0);
            setReady({ source: header, report: result });
            setStatus("Оригинальная КТ и JSON модели связаны по SHA-256 и физической сетке. Координаты — исследовательские кандидаты, требующие ручной проверки.");
        }
        catch (e) {
            if (revision === serial.current)
                setError(e instanceof Error ? e.message : "Не удалось проверить источник.");
        }
        finally {
            if (revision === serial.current)
                setBusy(false);
        }
    }
    async function runWorker() {
        if (!source || !publicConfirmed || !workerToken || busy)
            return;
        const version = ++serial.current;
        controller.current?.abort();
        const ctrl = new AbortController();
        controller.current = ctrl;
        setBusy(true);
        setError("");
        setReady(null);
        setReaderDecisions({});
        setStatus("Проверяем подлинный checkpoint MONAI...");
        try {
            const result = await executeRealNodule({ endpoint: workerEndpoint, token: workerToken }, source, ctrl.signal, setStatus);
            if (ctrl.signal.aborted || version !== serial.current)
                return;
            setReady(result);
            setSlice(0);
            setStatus("Оригинальный MONAI RetinaNet выполнен. Кандидаты доступны в просмотре КТ.");
        }
        catch (e) {
            if (!ctrl.signal.aborted && version === serial.current)
                setError(e instanceof Error ? e.message : "MONAI не смог выполнить настоящий инференс.");
        }
        finally {
            if (version === serial.current)
                setBusy(false);
        }
    }
    function setAssessment(index: number, decision: ReaderNoduleDecision | null) {
        setReaderDecisions(old => {
            const next = { ...old };
            if (decision === null)
                delete next[index];
            else
                next[index] = decision;
            return next;
        });
    }
    function exportReviewedCandidates() {
        if (!ready)
            return;
        try {
            const doc = createNodulePhysicianReview(ready.report, ready.source, readerDecisions, new Date().toISOString());
            const content = JSON.stringify(doc, null, 2);
            const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
            try {
                const link = document.createElement("a");
                link.href = url;
                link.download = "opus-monai-reader-nodule-candidates.json";
                document.body.appendChild(link);
                link.click();
                link.remove();
            }
            finally {
                window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
            setStatus("Оценка кандидатов сохранена локально. Она не является подписанным клиническим заключением.");
        }
        catch (error) {
            setError(error instanceof Error ? error.message : "Не удалось сохранить врачебную оценку.");
        }
    }
    useEffect(() => {
        if (!ready || !source || !canvas.current)
            return;
        let cancelled = false;
        const header = ready.source;
        const limits = windowPreset === "lung" ? { center: -600, width: 1500 } :
            windowPreset === "soft" ? { center: 50, width: 400 } : { center: 400, width: 1800 };
        readNoduleAxial(source, header, slice).then(pixels => {
            if (cancelled || !canvas.current)
                return;
            const w = header.dimensions[0], h = header.dimensions[1];
            const rgba = new Uint8ClampedArray(w * h * 4);
            const bottom = limits.center - limits.width / 2;
            for (let i = 0; i < pixels.length; i++) {
                const intensity = pixels[i];
                const value = Math.max(0, Math.min(255, Math.round((intensity - bottom) / limits.width * 255)));
                const p = i * 4;
                rgba[p] = value;
                rgba[p + 1] = value;
                rgba[p + 2] = value;
                rgba[p + 3] = 255;
            }
            const c = canvas.current;
            c.width = w;
            c.height = h;
            const ctx = c.getContext("2d", { alpha: false });
            if (!ctx)
                return;
            ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
            if (showMarks)
                for (const model of candidates) {
                    const center = model.nativeVoxelIndexHypothesis!;
                    const zUnit = Math.hypot(header.affineLps[2], header.affineLps[6], header.affineLps[10]);
                    if (Math.abs(center[2] - slice) * zUnit > model.extentModelMm[2] / 2 + zUnit)
                        continue;
                    const x = center[0], y = center[1];
                    // Original geometry, not display zoom: scale reported model mm by
                    // native NIfTI pixel pitch. Research box remains a candidate.
                    const dx = Math.hypot(header.affineLps[0], header.affineLps[4], header.affineLps[8]);
                    const dy = Math.hypot(header.affineLps[1], header.affineLps[5], header.affineLps[9]);
                    const rx = Math.max(3, Math.min(120, model.extentModelMm[0] / (2 * dx)));
                    const ry = Math.max(3, Math.min(120, model.extentModelMm[1] / (2 * dy)));
                    ctx.beginPath();
                    ctx.ellipse(x, y, rx, ry, 0, 0, 2 * Math.PI);
                    ctx.strokeStyle = "#ff734e";
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(x - 9, y);
                    ctx.lineTo(x + 9, y);
                    ctx.moveTo(x, y - 9);
                    ctx.lineTo(x, y + 9);
                    ctx.stroke();
                    ctx.font = "bold 12px sans-serif";
                    ctx.fillStyle = "#fff";
                    ctx.fillText(String(model.index + 1), x + 11, y - 10);
                }
        }).catch(e => {
            if (!cancelled)
                setError(e instanceof Error ? e.message : "Ошибка отрисовки исходного среза.");
        });
        return () => { cancelled = true; };
    }, [ready, source, slice, windowPreset, candidates, showMarks]);
    return <section className="cs-nodule-bound" aria-label={__ui("\u0416\u0438\u0432\u043E\u0439 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A NIfTI \u00B7 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u0435 MONAI \u043D\u0430\u0445\u043E\u0434\u043A\u0438")}>
  <div className="cs-intro"><div><div className="cs-kicker">PATHOLOGY DETECTION / VERIFIED SOURCE</div>
    <h1><LocalizedUi value={"\u0423\u0437\u043B\u044B \u043B\u0451\u0433\u043A\u0438\u0445 \u00B7 MONAI"}/></h1>
    <p><LocalizedUi value={"\u041D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u0439 \u043E\u0431\u0443\u0447\u0435\u043D\u043D\u044B\u0439 RetinaNet 0.6.9 \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u043E\u0439 \u041A\u0422. \u041E\u0431\u0440\u0430\u0431\u0430\u0442\u044B\u0432\u0430\u0435\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u043C CPU-\u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u043C, \u0437\u0434\u0435\u0441\u044C \u0432\u0438\u0437\u0443\u0430\u043B\u0438\u0437\u0438\u0440\u0443\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0439 \u043A \u0438\u0441\u0445\u043E\u0434\u043D\u0438\u043A\u0443 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442."}/></p>
  </div><span className="cs-watermark"><LocalizedUi value={"\u041D\u0415 \u0414\u041B\u042F \u041A\u041B\u0418\u041D\u0418\u0427\u0415\u0421\u041A\u041E\u0419 \u0414\u0418\u0410\u0413\u041D\u041E\u0421\u0422\u0418\u041A\u0418"}/></span></div>
  <div className="cs-nodule-controls">
    <label><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u041A\u0422 \u0438\u0437 Opus \u00B7"}/><code>.nii</code><LocalizedUi value={"(\u043D\u0435 ZIP)"}/><input type="file" accept=".nii" onChange={e => { reset(); setSource(e.target.files?.[0] ?? null); e.target.value = ""; }}/>
    </label>
    <details open>
      <summary><LocalizedUi value={"\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0443\u044E MONAI RetinaNet \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u041A\u0422"}/></summary>
      <p><LocalizedUi value={"\u0418\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C \u0430\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u0443\u0435\u0442 \u0437\u0430\u0440\u0430\u043D\u0435\u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u0443\u044E \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u0443\u044E \u041A\u0422, \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u0443\u044E \u043D\u0430 \u0447\u0430\u0441\u0442\u043D\u043E\u043C Linux-worker. \u0418\u0437 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430 \u043F\u0435\u0440\u0435\u0434\u0430\u0451\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E SHA-256 \u043E\u0442\u043A\u0440\u044B\u0442\u043E\u0433\u043E NIfTI, \u0430 \u043D\u0435 \u043F\u0438\u043A\u0441\u0435\u043B\u0438."}/></p>
      <label><LocalizedUi value={"\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0430\u0434\u0440\u0435\u0441 MONAI worker"}/><input type="text" value={workerEndpoint} disabled={busy} onChange={e => setWorkerEndpoint(e.target.value)}/>
      </label>
      <label><LocalizedUi value={"\u0422\u043E\u043A\u0435\u043D \u0441\u0435\u0441\u0441\u0438\u0438 worker"}/><input type="password" autoComplete="off" value={workerToken} disabled={busy} onChange={e => setWorkerToken(e.target.value)}/>
      </label>
      <label><input type="checkbox" checked={publicConfirmed} disabled={busy} onChange={e => setPublicConfirmed(e.target.checked)}/><LocalizedUi value={"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E: \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0435, \u0437\u0430\u043A\u043E\u043D\u043D\u043E \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u043E\u0435 \u0438 \u043F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E \u043E\u0431\u0435\u0437\u043B\u0438\u0447\u0435\u043D\u043E \u0438 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u043E \u0434\u043B\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438 worker; \u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0441\u043A\u0438\u043C \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435\u043C."}/></label>
      <button type="button" disabled={!source || !workerToken || !publicConfirmed || busy} onClick={() => void runWorker()}>
        <LocalizedUi value={busy ? "Выполняем инференс…" : "Анализировать эту КТ настоящим MONAI"}/>
      </button>
      <LocalizedUi value={busy && <button type="button" onClick={() => reset()}><LocalizedUi value={"\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0430\u043D\u0430\u043B\u0438\u0437"}/></button>}/>
    </details>
    <details>
      <summary><LocalizedUi value={"\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u00B7 \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0443\u0436\u0435 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u043D\u044B\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 (.json)"}/></summary>
    <label><LocalizedUi value={"\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 MONAI, \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0439 \u043F\u043E \u0442\u0435\u043A\u0443\u0449\u0435\u043C\u0443 \u0438\u0441\u0445\u043E\u0434\u043D\u0438\u043A\u0443 \u00B7"}/><code>.json</code>
      <input type="file" accept=".json,application/json" onChange={e => { reset(); setReportFile(e.target.files?.[0] ?? null); e.target.value = ""; }}/>
    </label>
    <button type="button" disabled={!source || !reportFile || busy} onClick={() => void open()}>
      <LocalizedUi value={busy ? "Проверка исходного SHA-256…" : "Открыть находки на исходной КТ"}/>
    </button>
    </details>
    <p><LocalizedUi value={"\u0414\u043B\u044F \u043F\u0435\u0440\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0443\u0441\u043A\u0430 \u043D\u0443\u0436\u043D\u0430 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u0430\u044F \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C MONAI \u043D\u0430 \u0438\u0437\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u043E\u043C Linux CPU."}/><a href="https://github.com/vasiliys961/opus-radiology-ai/blob/main/docs/MONAI_BOUND_NODULE_CT.md" target="_blank" rel="noreferrer"><LocalizedUi value={"\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430 \u043F\u043E\u0434\u043B\u0438\u043D\u043D\u043E\u0433\u043E \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440\u0430"}/></a>.</p>
    <p><LocalizedUi value={"\u041D\u0438\u043A\u0430\u043A\u0430\u044F \u041A\u0422 \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u0451\u0442\u0441\u044F \u0432 ChatGPT, OpenRouter, Polza \u0438\u043B\u0438 GitHub. \u041F\u0440\u0438 \u0432\u044B\u0431\u043E\u0440\u0435 \u043D\u043E\u0432\u043E\u0433\u043E \u043F\u0440\u0438\u0432\u0430\u0442\u043D\u043E\u0433\u043E worker \u041A\u0422 \u043F\u0435\u0440\u0435\u0434\u0430\u0451\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043D\u0430 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 Linux-worker. \u042D\u0442\u0430 \u043F\u0430\u043D\u0435\u043B\u044C \u041D\u0415 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442 MONAI \u043D\u0430 Mac \u0438 \u043D\u0435 \u043F\u0440\u0435\u0432\u0440\u0430\u0449\u0430\u0435\u0442 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 JSON \u0432 \u0434\u0438\u0430\u0433\u043D\u043E\u0437."}/></p>
  </div>
  <LocalizedUi value={error && <p role="alert" className="cs-nodule-error"><LocalizedUi value={error}/></p>}/>
  <LocalizedUi value={status && <p role="status" className="cs-message"><LocalizedUi value={status}/></p>}/>
  <LocalizedUi value={ready && <>
    <div className="cs-nodule-stats">
      <b>MONAI RetinaNet</b> · <LocalizedUi value={ready.report.candidates.length}/><LocalizedUi value={"\u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432 \u043D\u0430 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u043E\u0439 \u041A\u0422."}/><span><LocalizedUi value={"\u0412\u0435\u0441\u043E\u0432\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C SHA:"}/><LocalizedUi value={ready.report.model.weightsSha256.slice(0, 16)}/>…</span>
      <span><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u0438\u043A"}/><LocalizedUi value={ready.source.dimensions.join("×")}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439 \u00B7"}/><LocalizedUi value={ready.report.execution.seconds.toFixed(1)}/><LocalizedUi value={"\u0441 CPU."}/></span>
    </div>
    <div className="cs-nodule-view">
      <div className="cs-nodule-image">
        <canvas ref={canvas} style={{ width: "100%", maxWidth: 640, imageRendering: "pixelated" }} aria-label={__ui("\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u0438\u043D\u0434\u0435\u043A\u0441\u043D\u044B\u0439 \u0430\u043A\u0441\u0438\u0430\u043B\u044C\u043D\u044B\u0439 \u0441\u0440\u0435\u0437 \u041A\u0422 \u0441 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u043C\u0438 \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u0430\u043C\u0438 MONAI")}/>
        <small><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439 NIfTI, \u043F\u043B\u043E\u0441\u043A\u043E\u0441\u0442\u044C \u0438\u043D\u0434\u0435\u043A\u0441\u043D\u043E\u0439 \u0441\u0435\u0442\u043A\u0438 i/j. \u041E\u0440\u0438\u0435\u043D\u0442\u0430\u0446\u0438\u044F \u043D\u0435 \u0443\u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u0435\u043D\u0430 \u043A\u0430\u043A \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0440\u0430\u0434\u0438\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0430\u043A\u0441\u0438\u0430\u043B\u044C\u043D\u0430\u044F."}/></small>
      </div>
      <aside className="cs-nodule-list">
        <h3><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u044B \u00B7 \u043D\u0435 \u0434\u0438\u0430\u0433\u043D\u043E\u0437"}/></h3>
        <label><LocalizedUi value={"\u041F\u043E\u0440\u043E\u0433 score \u043C\u043E\u0434\u0435\u043B\u0438"}/><LocalizedUi value={score.toFixed(2)}/>
          <input type="range" min={0} max={1} step={0.05} value={score} onChange={e => setScore(+e.target.value)}/>
        </label>
        <label><LocalizedUi value={"\u041E\u043A\u043D\u043E"}/><select value={windowPreset} onChange={e => setWindowPreset(e.target.value as "lung" | "soft" | "bone")}>
          <option value="lung"><LocalizedUi value={"\u041B\u0451\u0433\u043E\u0447\u043D\u043E\u0435"}/></option><option value="soft"><LocalizedUi value={"\u041C\u044F\u0433\u043A\u0438\u0435 \u0442\u043A\u0430\u043D\u0438"}/></option><option value="bone"><LocalizedUi value={"\u041A\u043E\u0441\u0442\u043D\u043E\u0435"}/></option>
        </select></label>
        <label><input type="checkbox" checked={showMarks} onChange={e => setShowMarks(e.target.checked)}/><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u044B \u043C\u043E\u0434\u0435\u043B\u0438"}/></label>
        <label><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u0441\u0440\u0435\u0437"}/><LocalizedUi value={slice + 1}/> / <LocalizedUi value={ready.source.dimensions[2]}/>
          <input type="range" min={0} max={ready.source.dimensions[2] - 1} step={1} value={slice} onChange={e => setSlice(+e.target.value)}/>
        </label>
        <div className="cs-nodule-candidates">
          <LocalizedUi value={candidates.map(c => <div key={c.index} style={{ padding: "8px 0", borderBottom: "1px solid #64748b" }}>
            <button type="button" onClick={() => setSlice(Math.max(0, Math.min(ready.source.dimensions[2] - 1, Math.round(c.nativeVoxelIndexHypothesis![2]))))}>
              <b>#<LocalizedUi value={c.index + 1}/> · score <LocalizedUi value={c.score.toFixed(3)}/></b>
              <span><LocalizedUi value={"\u0421\u0440\u0435\u0437"}/><LocalizedUi value={Math.round(c.nativeVoxelIndexHypothesis![2]) + 1}/><LocalizedUi value={"\u00B7 \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u0439 box"}/><LocalizedUi value={c.extentModelMm.map(n => n.toFixed(1)).join("×")}/><LocalizedUi value={"\u043C\u043C"}/></span>
              <small><LocalizedUi value={"\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u0441\u0440\u0435\u0437 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0430"}/></small>
            </button>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              <button type="button" aria-pressed={readerDecisions[c.index] === "suspicious_on_review"} onClick={() => setAssessment(c.index, "suspicious_on_review")}><LocalizedUi value={"\u041F\u043E\u0434\u043E\u0437\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u00B7 \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C"}/></button>
              <button type="button" aria-pressed={readerDecisions[c.index] === "dismissed_on_review"} onClick={() => setAssessment(c.index, "dismissed_on_review")}><LocalizedUi value={"\u041E\u0442\u043A\u043B\u043E\u043D\u0438\u0442\u044C \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0430"}/></button>
              <LocalizedUi value={readerDecisions[c.index] && <button type="button" onClick={() => setAssessment(c.index, null)}><LocalizedUi value={"\u0421\u043D\u044F\u0442\u044C \u043E\u0446\u0435\u043D\u043A\u0443"}/></button>}/>
            </div>
          </div>)}/>
        </div>
        <LocalizedUi value={!candidates.length && <p><LocalizedUi value={"\u041F\u0440\u0438 \u0434\u0430\u043D\u043D\u043E\u043C \u043F\u043E\u0440\u043E\u0433\u0435 \u043D\u0435\u0442 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432 \u0441 \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u0430\u043C\u0438 \u0432\u043D\u0443\u0442\u0440\u0438 \u0441\u0435\u0442\u043A\u0438. \u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0439 \u041D\u0415 \u0434\u043E\u043A\u0430\u0437\u0430\u043D\u043E."}/></p>}/>
      </aside>
    </div>
    <div className="cs-nodule-stats" role="status"><LocalizedUi value={"\u0412\u0440\u0430\u0447\u0435\u0431\u043D\u044B\u0439 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432: \u043F\u043E\u0434\u043E\u0437\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0445 \u2014"}/><LocalizedUi value={Object.values(readerDecisions).filter(v => v === "suspicious_on_review").length}/><LocalizedUi value={"; \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u043E \u2014"}/><LocalizedUi value={Object.values(readerDecisions).filter(v => v === "dismissed_on_review").length}/><LocalizedUi value={"; \u0431\u0435\u0437 \u043E\u0446\u0435\u043D\u043A\u0438 \u2014"}/><LocalizedUi value={ready.report.candidates.length - Object.values(readerDecisions).length}/>.
    </div>
    <button type="button" onClick={exportReviewedCandidates}><LocalizedUi value={"\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043E\u0446\u0435\u043D\u043A\u0443 \u043D\u0430\u0445\u043E\u0434\u043E\u043A \u0432\u0440\u0430\u0447\u0430 (JSON)"}/></button>
    <p><small><LocalizedUi value={"\u041E\u0446\u0435\u043D\u043A\u0430 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043A \u043E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u043C \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0430\u043C \u0438 \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043D\u0443\u044E \u043C\u043E\u0434\u0435\u043B\u044C\u044E \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u044E. \u041E\u0442\u0447\u0451\u0442 \u043E\u0441\u0442\u0430\u0451\u0442\u0441\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u043C."}/></small></p>
    <p role="note" className="cs-bottom-note"><LocalizedUi value={"\u041E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0441\u043E\u0432\u043F\u0430\u043B\u0438 \u043F\u043E SHA \u0438 NIfTI-\u0430\u0444\u0444\u0438\u043D\u043D\u043E\u0439 \u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u0438. \u041E\u0434\u043D\u0430\u043A\u043E MONAI world \u2192 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0435 \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u044B \u043F\u043E\u043A\u0430 \u043D\u0435 \u043F\u0440\u043E\u0448\u043B\u0438 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0435 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u043E\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435; \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u043D\u0435 \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D\u044B \u043A DICOM SOP. \u041C\u043E\u0434\u0435\u043B\u044C \u043D\u0435 \u0432\u0430\u043B\u0438\u0434\u0438\u0440\u043E\u0432\u0430\u043D\u0430 \u0432\u043D\u0435\u0448\u043D\u0435\u0439 FROC, \u0447\u0443\u0432\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C\u044E \u0438 \u0441\u043F\u0435\u0446\u0438\u0444\u0438\u0447\u043D\u043E\u0441\u0442\u044C\u044E. \u0412\u0440\u0430\u0447 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u043A\u0430\u0436\u0434\u0443\u044E \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u0443\u044E \u043D\u0430\u0445\u043E\u0434\u043A\u0443."}/></p>
    <button type="button" className="cs-clear" onClick={() => { reset(); setSource(null); setReportFile(null); }}><LocalizedUi value={"\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0438 \u043E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435"}/></button>
  </>}/>
 </section>;
}
