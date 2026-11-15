"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useRef, useState } from "react";
import { checkLocalWorker, runLocalR231, type WorkerMetrics } from "../lib/local-worker";
import type { AnalysisStream } from "../lib/analysis-stream";
import type { SegmentationResult } from "../lib/analysis-package";
import type { LabelMask } from "../lib/segmentation-mask";
import type { SegmentationEvidence } from "../lib/segmentation-evidence";
import { acquireBrowserCompute } from "../lib/browser-compute-slot";
export default function LocalLungmaskPanel({ ready, onPrepare, onResult, onBusy }: {
    ready: boolean;
    onPrepare: (signal: AbortSignal) => Promise<AnalysisStream>;
    onResult: (mask: LabelMask, result: SegmentationResult, evidence: SegmentationEvidence) => void;
    onBusy: (busy: boolean) => void;
}) {
    const __ui = useUiTranslator();
    const [endpoint, setEndpoint] = useState("http://127.0.0.1:8765");
    const [token, setToken] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [metrics, setMetrics] = useState<WorkerMetrics | null>(null);
    const [profile, setProfile] = useState<"safe" | "balanced" | undefined>();
    const active = useRef<AbortController | null>(null);
    const callbacks = useRef({ onPrepare, onResult, onBusy });
    callbacks.current = { onPrepare, onResult, onBusy };
    useEffect(() => () => { active.current?.abort(); }, []);
    useEffect(() => {
        if (!ready) {
            active.current?.abort();
            setStatus("");
            setMetrics(null);
        }
    }, [ready]);
    const run = async () => {
        const controller = new AbortController();
        active.current = controller;
        setBusy(true);
        callbacks.current.onBusy(true);
        setError("");
        setMetrics(null);
        setProfile(undefined);
        const session = { endpoint, token };
        let release: (() => void) | undefined;
        try {
            release = acquireBrowserCompute("local-r231");
            setStatus("Проверка локальной модели…");
            setProfile(await checkLocalWorker(session, controller.signal));
            setStatus("Проверка скалярных данных выбранной серии…");
            const packet = await callbacks.current.onPrepare(controller.signal);
            const output = await runLocalR231(session, packet, controller.signal, setStatus);
            if (controller.signal.aborted)
                return;
            callbacks.current.onResult(output.mask, output.result, output.evidence);
            setMetrics(output.metrics);
            setStatus("Правое и левое лёгкое выделены цветом. Проверьте границы на аксиальных, корональных и сагиттальных срезах.");
        }
        catch (cause) {
            if (controller.signal.aborted)
                setStatus("Ожидание отменено; запрос удаления отправлен worker. При потере связи файлы удаляются по TTL.");
            else {
                setStatus("");
                setError(cause instanceof Error ? cause.message : "Локальное задание не выполнено.");
            }
        }
        finally {
            release?.();
            if (active.current === controller) {
                active.current = null;
                setBusy(false);
                callbacks.current.onBusy(false);
            }
        }
    };
    return <details className="ora-local-lungmask">
    <summary><LocalizedUi value={"\u0412\u044B\u0434\u0435\u043B\u0438\u0442\u044C \u043F\u0440\u0430\u0432\u043E\u0435 \u0438 \u043B\u0435\u0432\u043E\u0435 \u043B\u0451\u0433\u043A\u043E\u0435 \u043D\u0430 \u041A\u0422"}/></summary>
    <p><LocalizedUi value={"\u041C\u043E\u0434\u0435\u043B\u044C Lungmask R231 \u0432\u044B\u0434\u0435\u043B\u044F\u0435\u0442 \u043B\u0451\u0433\u043A\u0438\u0435 \u0446\u0432\u0435\u0442\u043E\u043C \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u0430\u0445 \u0438 \u043F\u043E\u0437\u0432\u043E\u043B\u044F\u0435\u0442 \u043E\u0446\u0435\u043D\u0438\u0442\u044C \u043E\u0431\u044A\u0451\u043C \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u043D\u043E\u0439 \u043E\u0431\u043B\u0430\u0441\u0442\u0438. \u041E\u043D\u0430 \u043D\u0435 \u0438\u0449\u0435\u0442 \u0443\u0437\u043B\u044B \u0438\u043B\u0438 \u043E\u043F\u0443\u0445\u043E\u043B\u0438 \u0438 \u043D\u0435 \u0444\u043E\u0440\u043C\u0438\u0440\u0443\u0435\u0442 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435. \u041E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0430 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F \u043D\u0430 \u044D\u0442\u043E\u043C \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440\u0435, \u0431\u0435\u0437 \u043E\u0431\u043B\u0430\u0447\u043D\u044B\u0445 \u043C\u043E\u0434\u0435\u043B\u0435\u0439."}/></p>
    <p><LocalizedUi value={"\u041E\u0431\u0440\u0430\u0431\u0430\u0442\u044B\u0432\u0430\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u0430\u044F \u0441\u0435\u0440\u0438\u044F \u0438\u043B\u0438 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442. \u041F\u0440\u0438 \u043D\u0435\u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0449\u0435\u0439 \u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u0438 \u0438\u043B\u0438 \u043D\u0435\u0445\u0432\u0430\u0442\u043A\u0435 \u043F\u0430\u043C\u044F\u0442\u0438 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0430 \u043D\u0435 \u043D\u0430\u0447\u043D\u0451\u0442\u0441\u044F. \u0413\u0440\u0430\u043D\u0438\u0446\u044B \u043B\u0451\u0433\u043A\u0438\u0445 \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0432\u0440\u0430\u0447\u0443."}/></p>
    <LocalizedUi value={profile && <p><LocalizedUi value={"\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E worker:"}/><LocalizedUi value={profile === "safe" ? "Safe Mode · 1 поток" : "Balanced · 2 потока"}/>.</p>}/>
    <p><LocalizedUi value={"\u0415\u0441\u043B\u0438 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0430\u044F \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0430 \u0435\u0449\u0451 \u043D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0430, \u044D\u0442\u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0437\u0430\u043F\u043E\u043B\u043D\u044F\u0435\u0442 \u0441\u043F\u0435\u0446\u0438\u0430\u043B\u0438\u0441\u0442 \u043F\u043E \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0435."}/><a href="https://github.com/vasiliys961/opus-radiology-ai/blob/main/docs/LOCAL_LUNGMASK_WORKER.md" target="_blank" rel="noreferrer"><LocalizedUi value={"\u0418\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044F \u0434\u043B\u044F \u0441\u043F\u0435\u0446\u0438\u0430\u043B\u0438\u0441\u0442\u0430"}/></a></p>
    <label><LocalizedUi value={"\u0410\u0434\u0440\u0435\u0441 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u043B\u0443\u0436\u0431\u044B \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0438"}/><input aria-label={__ui("\u0410\u0434\u0440\u0435\u0441 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0433\u043E worker")} value={endpoint} disabled={busy} onChange={e => setEndpoint(e.target.value)}/></label>
    <label><LocalizedUi value={"\u041A\u043E\u0434 \u0434\u043E\u0441\u0442\u0443\u043F\u0430 \u043A \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u043B\u0443\u0436\u0431\u0435"}/><input aria-label={__ui("\u0422\u043E\u043A\u0435\u043D \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0433\u043E worker")} type="password" autoComplete="off" value={token} disabled={busy} onChange={e => setToken(e.target.value)}/></label>
    <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)}/><LocalizedUi value={"\u042D\u0442\u043E \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u0430\u044F \u043E\u0442\u043A\u0440\u044B\u0442\u0430\u044F \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0430\u044F \u041A\u0422 \u0433\u0440\u0443\u0434\u043D\u043E\u0439 \u043A\u043B\u0435\u0442\u043A\u0438; \u043F\u043E\u043B\u043D\u044B\u0439 \u043F\u043E\u043F\u0435\u0440\u0435\u0447\u043D\u044B\u0439 \u0441\u0440\u0435\u0437 \u0438 HU \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u044B. \u041D\u0435 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0430."}/></label>
    <div className="ora-mask-actions">
      <button type="button" disabled={!ready || busy || !confirmed || !token} onClick={() => void run()}><LocalizedUi value={"\u0421\u0435\u0433\u043C\u0435\u043D\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043B\u0451\u0433\u043A\u0438\u0435 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E"}/></button>
      <LocalizedUi value={error && <button type="button" disabled={!ready || busy || !confirmed || !token} onClick={() => void run()}><LocalizedUi value={"\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C R231"}/></button>}/>
      <LocalizedUi value={busy && <button type="button" onClick={() => active.current?.abort()}><LocalizedUi value={"\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C R231"}/></button>}/>
    </div>
    <LocalizedUi value={status && <p role="status"><LocalizedUi value={status}/></p>}/>
    <LocalizedUi value={error && <p className="ora-local-worker-error ora-package-error" role="alert"><LocalizedUi value={error}/></p>}/>
    <LocalizedUi value={metrics && <p className="ora-local-worker-metrics"><LocalizedUi value={"\u0418\u0437\u043C\u0435\u0440\u0435\u043D\u043E \u043D\u0430"}/><LocalizedUi value={metrics.platform}/> / <LocalizedUi value={metrics.machine}/><LocalizedUi value={": \u0438\u043D\u0444\u0435\u0440\u0435\u043D\u0441"}/><LocalizedUi value={metrics.inferenceSeconds.toFixed(2)}/><LocalizedUi value={"\u0441; \u0430\u0434\u0430\u043F\u0442\u0435\u0440"}/><LocalizedUi value={metrics.totalSeconds.toFixed(2)}/><LocalizedUi value={"\u0441; \u043F\u0438\u043A RSS"}/><LocalizedUi value={metrics.peakRssMiB.toFixed(1)}/><LocalizedUi value={"\u041C\u0438\u0411. CPU, batch 1. \u042D\u0442\u0438 \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u0438 \u043E\u0442\u043D\u043E\u0441\u044F\u0442\u0441\u044F \u043A \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0443 \u043C\u043E\u0434\u0435\u043B\u0438; \u043F\u0430\u043C\u044F\u0442\u044C \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430 \u0438\u0437\u043C\u0435\u0440\u044F\u0435\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E."}/></p>}/>
    <LocalizedUi value={metrics?.preflight && <p><LocalizedUi value={"Preflight \u043F\u0435\u0440\u0435\u0434 \u0438\u043D\u0444\u0435\u0440\u0435\u043D\u0441\u043E\u043C: \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E"}/><LocalizedUi value={(metrics.preflight.availableRamBytes / 1024 ** 3).toFixed(2)}/><LocalizedUi value={"\u0413\u0438\u0411 RAM, \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F"}/><LocalizedUi value={(metrics.preflight.requiredRamBytes / 1024 ** 3).toFixed(2)}/><LocalizedUi value={"\u0413\u0438\u0411. Guard:"}/><LocalizedUi value={metrics.guardDecision}/>.</p>}/>
    <small><LocalizedUi value={"\u0422\u043E\u043A\u0435\u043D \u0445\u0440\u0430\u043D\u0438\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0432 \u043F\u0430\u043C\u044F\u0442\u0438 \u0432\u043A\u043B\u0430\u0434\u043A\u0438. \u0414\u0430\u043D\u043D\u044B\u0435 \u0438\u0434\u0443\u0442 \u043F\u0440\u044F\u043C\u043E \u043D\u0430 127.0.0.1; \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0435 \u0444\u0430\u0439\u043B\u044B \u0443\u0434\u0430\u043B\u044F\u044E\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u044F, \u043E\u0442\u043C\u0435\u043D\u044B \u0438\u043B\u0438 TTL. \u041E\u0431\u043B\u0430\u0447\u043D\u044B\u0439 patient gate \u043E\u0441\u0442\u0430\u0451\u0442\u0441\u044F \u0437\u0430\u043A\u0440\u044B\u0442. \u041F\u043E\u043B\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u043E\u0432 \u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u044B \u0435\u0449\u0451 \u043D\u0435 \u0434\u043E\u043F\u0443\u0449\u0435\u043D\u044B."}/></small>
  </details>;
}
