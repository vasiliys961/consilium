"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useMemo, useRef, useState } from "react";
import type { DicomSeries } from "../lib/dicom-series";
import { fullCtGeometry, prepareFullCtStream } from "../lib/full-ct-stream";
import { createFullCtReader } from "../lib/full-ct-decoder";
import { checkFullCtWorker, runFullCt, closeFullCt, fullCtReport, type FullCtTicket } from "../lib/full-ct-worker";
import { acquireBrowserCompute } from "../lib/browser-compute-slot";
export default function FullCtPanel({ series, files, enabled, onBusy, onResult }: {
    series: DicomSeries;
    files: File[];
    enabled: boolean;
    onBusy: (busy: boolean) => void;
    onResult: (ticket: FullCtTicket | null) => void;
}) {
    const __ui = useUiTranslator();
    const [endpoint, setEndpoint] = useState("http://127.0.0.1:8765");
    const [token, setToken] = useState(""), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false);
    const [status, setStatus] = useState(""), [error, setError] = useState(""), [result, setResult] = useState<FullCtTicket | null>(null);
    const active = useRef<AbortController | null>(null), owned = useRef<FullCtTicket | null>(null), generation = useRef(0);
    const callbacks = useRef({ onBusy, onResult });
    callbacks.current = { onBusy, onResult };
    const clear = async () => {
        const previous = owned.current;
        if (!previous)
            return;
        callbacks.current.onResult(null);
        setBusy(true);
        setError("");
        try {
            await closeFullCt(previous);
            if (owned.current === previous) {
                owned.current = null;
                setResult(null);
                setStatus("Полное задание удалено.");
            }
        }
        catch {
            setError("Не удалось подтвердить удаление. Проверьте связь с worker и повторите удаление; TTL продолжает действовать.");
        }
        finally {
            setBusy(false);
        }
    };
    useEffect(() => {
        const revision = ++generation.current;
        setConfirmed(false);
        setError("");
        setStatus("");
        setResult(null);
        const onExit = () => {
            ++generation.current;
            active.current?.abort();
            const previous = owned.current;
            owned.current = null;
            if (previous)
                void closeFullCt(previous).catch(() => { });
        };
        window.addEventListener("pagehide", onExit);
        return () => {
            window.removeEventListener("pagehide", onExit);
            if (generation.current === revision)
                ++generation.current;
            active.current?.abort();
            const previous = owned.current;
            owned.current = null;
            if (previous)
                void closeFullCt(previous).catch(() => { });
            callbacks.current.onResult(null);
        };
    }, [series]);
    const unsupported = useMemo(() => {
        try {
            fullCtGeometry(series);
            return "";
        }
        catch (e) {
            return e instanceof Error ? e.message : "Геометрия полной КТ не поддерживается.";
        }
    }, [series]);
    if (series.modality !== "CT")
        return null;
    const run = async () => {
        if (busy || !enabled || unsupported || !confirmed || owned.current || files.length !== series.members.length)
            return;
        const revision = generation.current, controller = new AbortController();
        active.current = controller;
        setBusy(true);
        callbacks.current.onBusy(true);
        setError("");
        setStatus("Проверка локального worker…");
        let release: (() => void) | undefined;
        try {
            release = acquireBrowserCompute("local-r231");
            const session = { endpoint, token };
            await checkFullCtWorker(session, controller.signal);
            const read = await createFullCtReader(files);
            const packet = await prepareFullCtStream(series, read, controller.signal, n => {
                if (revision === generation.current)
                    setStatus(`Проверка и SHA полной КТ: ${n}/${series.members.length}`);
            });
            const ticket = await runFullCt(session, packet, controller.signal, text => {
                if (revision === generation.current)
                    setStatus(text);
            });
            if (revision !== generation.current || controller.signal.aborted) {
                await closeFullCt(ticket);
                return;
            }
            owned.current = ticket;
            setResult(ticket);
            callbacks.current.onResult(ticket);
            setStatus("Полная загруженная серия обработана. Выберите фрагмент для просмотра маски в MPR.");
        }
        catch (e) {
            if (revision === generation.current)
                setError(controller.signal.aborted ? "Задание отменено; результат не подтверждён." : e instanceof Error ? e.message : "Ошибка полной КТ.");
        }
        finally {
            release?.();
            if (active.current === controller)
                active.current = null;
            setBusy(false);
            callbacks.current.onBusy(false);
        }
    };
    const download = () => {
        if (!result)
            return;
        const url = URL.createObjectURL(new Blob([JSON.stringify(fullCtReport(result), null, 2)], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = "opus-full-ct-evidence.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 400);
    };
    return <details className="ora-ct-slab" aria-label={__ui("\u041F\u043E\u043B\u043D\u0430\u044F \u041A\u0422 \u0447\u0435\u0440\u0435\u0437 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 R231")}><summary><LocalizedUi value={"\u041F\u043E\u043B\u043D\u0430\u044F \u041A\u0422 \u00B7 \u043F\u043E\u0442\u043E\u043A\u043E\u0432\u044B\u0439 R231"}/></summary>
    <p><LocalizedUi value={series.members.length}/><LocalizedUi value={"\u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u043E\u0432. \u0414\u0435\u043A\u043E\u0434\u0438\u0440\u0443\u0435\u0442\u0441\u044F \u043E\u0434\u0438\u043D \u0441\u0440\u0435\u0437 \u0437\u0430 \u0440\u0430\u0437; \u043F\u043E\u043B\u043D\u0430\u044F \u043C\u0430\u0441\u043A\u0430 \u043E\u0441\u0442\u0430\u0451\u0442\u0441\u044F \u043D\u0430 \u0434\u0438\u0441\u043A\u0435 worker, \u0432 MPR \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D."}/></p>
    <p><LocalizedUi value={"\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u0440\u0435\u0436\u0438\u043C \u0434\u043B\u044F \u043E\u0442\u043A\u0440\u044B\u0442\u043E\u0439 \u041A\u0422 \u0433\u0440\u0443\u0434\u043D\u043E\u0439 \u043A\u043B\u0435\u0442\u043A\u0438. \u042D\u0442\u043E \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0430 \u0432\u0441\u0435\u0445 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u0445 \u043A\u0430\u0434\u0440\u043E\u0432, \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u043F\u043E\u043B\u043D\u043E\u0442\u044B \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F \u0438\u043B\u0438 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u0438."}/></p>
    <LocalizedUi value={unsupported && <p role="status"><LocalizedUi value={"\u041F\u043E\u043B\u043D\u044B\u0439 \u043F\u043E\u0442\u043E\u043A \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D:"}/><LocalizedUi value={unsupported}/></p>}/>
    <label><LocalizedUi value={"\u0410\u0434\u0440\u0435\u0441 \u043F\u043E\u043B\u043D\u043E\u0433\u043E \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0433\u043E worker"}/><input aria-label={__ui("\u0410\u0434\u0440\u0435\u0441 \u043F\u043E\u043B\u043D\u043E\u0433\u043E \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0433\u043E worker")} value={endpoint} disabled={busy || !!result} onChange={e => setEndpoint(e.target.value)}/></label>
    <label><LocalizedUi value={"\u0422\u043E\u043A\u0435\u043D \u043F\u043E\u043B\u043D\u043E\u0433\u043E \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0437\u0430\u0434\u0430\u043D\u0438\u044F"}/><input aria-label={__ui("\u0422\u043E\u043A\u0435\u043D \u043F\u043E\u043B\u043D\u043E\u0433\u043E \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0437\u0430\u0434\u0430\u043D\u0438\u044F")} type="password" autoComplete="off" value={token} disabled={busy || !!result} onChange={e => setToken(e.target.value)}/></label>
    <label><input type="checkbox" checked={confirmed} disabled={busy || !!result} onChange={e => setConfirmed(e.target.checked)}/><LocalizedUi value={"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E \u043E\u0442\u043A\u0440\u044B\u0442\u0443\u044E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0443\u044E \u041A\u0422 \u0433\u0440\u0443\u0434\u043D\u043E\u0439 \u043A\u043B\u0435\u0442\u043A\u0438 \u0432 HU, \u0431\u0435\u0437 \u0440\u0435\u0430\u043B\u044C\u043D\u044B\u0445 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u043E\u0432."}/></label>
    <button type="button" disabled={!enabled || !!unsupported || busy || !confirmed || !token || !!result} onClick={() => void run()}><LocalizedUi value={"\u041E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C \u0432\u0441\u044E \u041A\u0422 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E"}/></button>
    <LocalizedUi value={!enabled && <p><LocalizedUi value={"\u0417\u0430\u043F\u0443\u0441\u043A \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0438\u0437 2D. \u0412\u0435\u0440\u043D\u0438\u0442\u0435\u0441\u044C \u0438\u0437 MPR, \u0447\u0442\u043E\u0431\u044B \u043E\u0441\u0432\u043E\u0431\u043E\u0434\u0438\u0442\u044C \u043E\u0431\u044A\u0451\u043C."}/></p>}/>
    <LocalizedUi value={busy && <button type="button" onClick={() => active.current?.abort()}><LocalizedUi value={"\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u043F\u043E\u043B\u043D\u0443\u044E \u041A\u0422"}/></button>}/>
    <LocalizedUi value={status && <p role="status"><LocalizedUi value={status}/></p>}/><LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
    <LocalizedUi value={result && <><p>R231 · <LocalizedUi value={result.request.frameCount}/><LocalizedUi value={"\u043A\u0430\u0434\u0440\u043E\u0432 \u00B7 \u043F\u0438\u043A \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0430"}/><LocalizedUi value={result.metrics.peakRssMiB.toFixed(1)}/><LocalizedUi value={"\u041C\u0438\u0411. \u042D\u0442\u043E RSS \u043C\u043E\u0434\u0435\u043B\u0438, \u043D\u0435 \u0441\u0443\u043C\u043C\u0430\u0440\u043D\u0430\u044F \u043F\u0430\u043C\u044F\u0442\u044C Mac."}/></p><button type="button" onClick={download}><LocalizedUi value={"\u0421\u043A\u0430\u0447\u0430\u0442\u044C Evidence \u043F\u043E\u043B\u043D\u043E\u0439 \u041A\u0422"}/></button>
      <button type="button" disabled={busy} onClick={() => void clear()}><LocalizedUi value={"\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u043E\u043B\u043D\u043E\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u0435 \u0438 \u043C\u0430\u0441\u043A\u0443"}/></button>
      <p><LocalizedUi value={"\u0417\u0430\u0434\u0430\u043D\u0438\u0435 \u0445\u0440\u0430\u043D\u0438\u0442\u0441\u044F \u0434\u043E \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u044F, \u0441\u043C\u0435\u043D\u044B \u0441\u0435\u0440\u0438\u0438/\u0437\u0430\u043A\u0440\u044B\u0442\u0438\u044F \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B \u0438\u043B\u0438 TTL worker (30 \u043C\u0438\u043D\u0443\u0442 \u043E\u0442 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F)."}/></p></>}/>
  </details>;
}
