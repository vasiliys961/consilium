"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useState } from "react";
type Impression = {
    schema: string;
    researchONFHScore: number;
    researchAboveThreshold: boolean;
    preliminaryClinicalImpression: string;
    clinicalRecommendations: string;
    limitations: string[];
    analyzedSliceCount: number;
    diagnosisConfirmed: false;
};
export default function LocalOnfhResearch() {
    const __ui = useUiTranslator();
    const [available, setAvailable] = useState(false);
    const [checking, setChecking] = useState(true);
    const [readiness, setReadiness] = useState("");
    const [files, setFiles] = useState<File[]>([]);
    const [ack, setAck] = useState(false);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<Impression | null>(null);
    const [error, setError] = useState("");
    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/research/onfh-local", { cache: "no-store", signal: controller.signal })
            .then(r => r.ok ? r.json() : null)
            .then(v => {
            if (!controller.signal.aborted) {
                setAvailable(v?.available === true);
                setReadiness(v?.note ?? "");
            }
        })
            .catch(() => {
            if (!controller.signal.aborted)
                setReadiness("Не удалось проверить локальную модель.");
        })
            .finally(() => {
            if (!controller.signal.aborted)
                setChecking(false);
        });
        return () => controller.abort();
    }, []);
    async function run() {
        if (!available || busy || files.length < 2 || !ack)
            return;
        setBusy(true);
        setError("");
        setResult(null);
        const body = new FormData();
        body.set("acknowledged", "research-only");
        files.forEach(file => body.append("slices", file));
        try {
            const response = await fetch("/api/research/onfh-local", { method: "POST", body, cache: "no-store" });
            const data: unknown = await response.json();
            if (!response.ok)
                throw Error((data as {
                    error?: string;
                }).error ?? "Local inference failed");
            const v = data as Impression;
            if (v.schema !== "opus-onfh-local-preliminary-impression/v1" ||
                typeof v.researchONFHScore !== "number" || !Array.isArray(v.limitations) ||
                v.diagnosisConfirmed !== false)
                throw Error("Invalid ONFH research report");
            setResult(v);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Ошибка локального анализа");
        }
        finally {
            setBusy(false);
        }
    }
    return <section className="cl-panel" aria-label={__ui("ONFH \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u0438\u043D\u0444\u0435\u0440\u0435\u043D\u0441")}>
   <h2><LocalizedUi value={"\u041E\u0441\u0442\u0435\u043E\u043D\u0435\u043A\u0440\u043E\u0437 \u0433\u043E\u043B\u043E\u0432\u043A\u0438 \u0431\u0435\u0434\u0440\u0435\u043D\u043D\u043E\u0439 \u043A\u043E\u0441\u0442\u0438 \u2014 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u041C\u0420\u0422-\u0430\u043D\u0430\u043B\u0438\u0437"}/></h2>
   <p><LocalizedUi value={"\u041E\u0431\u0443\u0447\u0435\u043D\u043D\u0430\u044F \u043D\u0430 JLU-ONFH \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C. \u0422\u043E\u043B\u044C\u043A\u043E \u043F\u0430\u043F\u043A\u0430 \u0441 PNG-\u0441\u0440\u0435\u0437\u0430\u043C\u0438 \u043E\u0434\u043D\u043E\u0439 \u041C\u0420\u0422-\u0441\u0435\u0440\u0438\u0438. \u041D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u044E\u0442\u0441\u044F DICOM, \u041A\u0422, NIfTI, \u0441\u043C\u0435\u0448\u0430\u043D\u043D\u044B\u0435 \u043F\u043E\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u0438. \u0424\u0430\u0439\u043B\u044B \u043E\u0431\u0440\u0430\u0431\u0430\u0442\u044B\u0432\u0430\u044E\u0442\u0441\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u043C \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u043E\u043C Python \u043D\u0430 \u0432\u0430\u0448\u0435\u043C \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440\u0435, \u0431\u0435\u0437 \u043E\u0431\u043B\u0430\u0447\u043D\u044B\u0445 LLM."}/></p>
   <LocalizedUi value={checking && <p role="status"><LocalizedUi value={"\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 ONFH: \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0432\u0435\u0441\u043E\u0432 \u0438 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0445 \u0431\u0438\u0431\u043B\u0438\u043E\u0442\u0435\u043A\u2026"}/></p>}/>
   <LocalizedUi value={!checking && !available && <p role="status"><LocalizedUi value={readiness || "Модель временно недоступна."}/></p>}/>
   <LocalizedUi value={!checking && available && <p role="status"><LocalizedUi value={"\u041C\u043E\u0434\u0435\u043B\u044C \u0433\u043E\u0442\u043E\u0432\u0430. \u0412\u0435\u0441\u0430 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u044B \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u044B \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438."}/></p>}/>
   <label><LocalizedUi value={"\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u041C\u0420\u0422-\u0441\u0440\u0435\u0437\u044B PNG (2\u2013300)"}/><input aria-label={__ui("\u041C\u0420\u0422 PNG-\u0441\u0440\u0435\u0437\u044B \u0434\u043B\u044F ONFH")} type="file" accept=".png,image/png" multiple disabled={busy || !available} onChange={e => {
            setFiles(Array.from(e.target.files ?? []));
            setResult(null);
            setAck(false);
        }}/>
   </label>
   <p><LocalizedUi value={files.length}/><LocalizedUi value={"\u0441\u0440\u0435\u0437\u043E\u0432 \u0432\u044B\u0431\u0440\u0430\u043D\u043E."}/></p>
   <label><input type="checkbox" checked={ack} disabled={busy} onChange={e => setAck(e.target.checked)}/><LocalizedUi value={"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u043E\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u0435\u043D\u0438\u0435: \u043F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u043E\u0446\u0435\u043D\u043A\u0430 \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442 ONFH, \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u0435\u0442 \u0441\u0442\u0430\u0434\u0438\u044E ARCO \u0438 \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u043F\u0435\u0440\u0435\u0441\u043C\u043E\u0442\u0440\u0430 \u0432\u0440\u0430\u0447\u043E\u043C."}/></label>
   <p><button type="button" disabled={!available || !ack || busy || files.length < 2 || files.length > 300} onClick={() => void run()}><LocalizedUi value={busy ? "Локальный анализ…" : "Получить предварительное заключение ONFH"}/></button></p>
   <LocalizedUi value={error && <p className="cl-error" role="alert"><LocalizedUi value={error}/></p>}/>
   <LocalizedUi value={result && <div className="cl-case" aria-live="polite">
     <h3><LocalizedUi value={"\u041F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 AI"}/></h3>
     <p><strong><LocalizedUi value={result.preliminaryClinicalImpression}/></strong></p>
     <p><LocalizedUi value={"\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C ONFH:"}/><LocalizedUi value={result.researchONFHScore.toFixed(4)}/><LocalizedUi value={"(\u043D\u0435 \u043A\u0430\u043B\u0438\u0431\u0440\u043E\u0432\u0430\u043D\u043D\u0430\u044F \u0432\u0435\u0440\u043E\u044F\u0442\u043D\u043E\u0441\u0442\u044C \u0437\u0430\u0431\u043E\u043B\u0435\u0432\u0430\u043D\u0438\u044F). \u0421\u0440\u0435\u0437\u043E\u0432:"}/><LocalizedUi value={result.analyzedSliceCount}/>.</p>
     <p><LocalizedUi value={result.clinicalRecommendations}/></p>
     <strong><LocalizedUi value={"\u041E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u044F:"}/></strong><ul><LocalizedUi value={result.limitations.map((x, i) => <li key={i}><LocalizedUi value={x}/></li>)}/></ul>
     <button type="button" onClick={() => {
                const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "opus-onfh-preliminary-report.json";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 500);
            }}><LocalizedUi value={"\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u043F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 JSON-\u043E\u0442\u0447\u0451\u0442"}/></button>
   </div>}/>
 </section>;
}
