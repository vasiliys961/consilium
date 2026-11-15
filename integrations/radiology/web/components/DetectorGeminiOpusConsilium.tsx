"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useMemo, useRef, useState } from "react";
import { assembleSanitizedDetectorBundle, type DetectorRuntimeSnapshot, type SanitizedDetectorBundle } from "../lib/detector-consilium-evidence";
import type { NumericConsiliumResult } from "../lib/detector-gemini-opus-numeric";
import type { AiProvider } from "../lib/ai-gateway";
export default function DetectorGeminiOpusConsilium({ snapshot, onBundleReady }: {
    snapshot: DetectorRuntimeSnapshot;
    onBundleReady?: (bundle: SanitizedDetectorBundle) => void;
}) {
    const __ui = useUiTranslator();
    const [provider, setProvider] = useState<AiProvider>("openrouter");
    const [consent, setConsent] = useState(false), [paid, setPaid] = useState(false);
    const [working, setWorking] = useState(false), [error, setError] = useState("");
    const [review, setReview] = useState<NumericConsiliumResult | null>(null), [draft, setDraft] = useState("");
    const controller = useRef<AbortController | null>(null);
    const result = useMemo(() => {
        try {
            return { data: assembleSanitizedDetectorBundle(snapshot), error: "" };
        }
        catch (e) {
            return { data: null, error: e instanceof Error ? e.message : "Не исследовано" };
        }
    }, [snapshot.modality, snapshot.region, snapshot.nativeSourceSha256, snapshot.nodules,
        snapshot.cln, snapshot.lungscape, snapshot.effusion, snapshot.pe, snapshot.nodes, snapshot.abdomen,
        snapshot.ich, snapshot.wmh, snapshot.brain]);
    const stamp = JSON.stringify(result.data);
    useEffect(() => {
        if (result.data)
            onBundleReady?.(result.data);
    }, [stamp]);
    useEffect(() => {
        controller.current?.abort();
        setWorking(false);
        setError("");
        setReview(null);
        setDraft("");
        setConsent(false);
        setPaid(false);
        return () => controller.current?.abort();
    }, [stamp]);
    const data = result.data;
    if (!data)
        return <section className="cs-geometry"><h3>Gemini → Opus</h3>
  <p><LocalizedUi value={"\u041D\u0435\u0442 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043D\u043E\u0433\u043E \u043E\u0431\u0449\u0435\u0433\u043E \u043F\u0430\u043A\u0435\u0442\u0430:"}/><LocalizedUi value={result.error}/></p></section>;
    const completed = data.facts.filter(f => f.status === "completed");
    async function analyze() {
        if (!consent || !paid || working || !data)
            return;
        controller.current?.abort();
        const ctrl = new AbortController();
        controller.current = ctrl;
        setWorking(true);
        setError("");
        setReview(null);
        setDraft("");
        try {
            const res = await fetch("/api/ai/detector-consilium", { method: "POST", signal: ctrl.signal,
                headers: { "Content-Type": "application/json" }, cache: "no-store", credentials: "same-origin",
                body: JSON.stringify({ schema: "opus-authorized-detector-consilium-request/v1",
                    provider, bundle: data, acknowledgeAuthorizedDeidentifiedNumericEvidence: true,
                    acknowledgeExternalPaidCalls: true }) });
            const result: unknown = await res.json();
            if (!res.ok)
                throw Error("Сервис не настроен или недоступен (HTTP " + res.status + ").");
            if (!result || typeof result !== "object")
                throw Error("Неверный ответ.");
            const v = result as NumericConsiliumResult;
            if (v.schema !== "opus-numeric-detector-consilium/v1" ||
                v.clinicalStatus !== "unverified_research_draft" ||
                v.pixelReviewPerformed !== false || v.sourceIdentifiersSubmitted !== false ||
                v.clinicalValidation !== false || v.provider !== provider ||
                typeof v.opus?.summary !== "string" || !Array.isArray(v.opus.limitations) ||
                !Array.isArray(v.gemini?.reviewedTasks) ||
                v.gemini.reviewedTasks.length !== completed.length ||
                !v.gemini.reviewedTasks.every(t => completed.some(f => f.task === t)))
                throw Error("Модель не подтвердила состав исходных задач.");
            if (ctrl.signal.aborted)
                return;
            setReview(v);
            setDraft(v.opus.summary);
        }
        catch (e) {
            if (!ctrl.signal.aborted)
                setError(e instanceof Error ? e.message : "Ошибка Gemini/Opus");
        }
        finally {
            if (!ctrl.signal.aborted)
                setWorking(false);
        }
    }
    function exportDraft() {
        if (!review || !draft.trim() || draft.length > 6000)
            return;
        const payload = { schema: "opus-unsigned-numeric-physician-draft/v1",
            modality: data?.modality, region: data?.region, facts: data?.facts,
            gemini: review.gemini, opusModel: review.opusModel,
            editableUnsignedReport: draft, limitations: review.opus.limitations,
            patientPixelsSubmitted: false, sourceIdentifiersSubmitted: false,
            clinicalValidation: false, physicianReviewed: false };
        const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = "opus-consilium-unsigned.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return <section className="cs-geometry" aria-label={__ui("\u0427\u0438\u0441\u043B\u043E\u0432\u043E\u0439 \u043A\u043E\u043D\u0441\u0438\u043B\u0438\u0443\u043C Gemini \u0438 Opus")}>
  <h3><LocalizedUi value={"\u0415\u0434\u0438\u043D\u044B\u0439 \u043A\u043E\u043D\u0441\u0438\u043B\u0438\u0443\u043C \u00B7 Gemini \u2192 Claude Opus"}/></h3>
  <p><LocalizedUi value={"\u041F\u0435\u0440\u0435\u0434\u0430\u044E\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0431\u0435\u0437\u043B\u0438\u0447\u0435\u043D\u043D\u044B\u0435 \u0447\u0438\u0441\u043B\u0430 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043D\u044B\u0445 \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440\u043E\u0432, \u0431\u0435\u0437 DICOM, \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0439, UID, \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 SHA \u0438\u043B\u0438 \u0438\u0441\u0442\u043E\u0440\u0438\u0438 \u0431\u043E\u043B\u0435\u0437\u043D\u0438. \u042D\u0442\u043E \u043D\u0435 Gemini Vision \u0438 \u043D\u0435 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F."}/></p>
  <p><LocalizedUi value={"\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E \u043C\u043E\u0434\u0435\u043B\u0435\u0439:"}/><LocalizedUi value={completed.length}/><LocalizedUi value={"\u0438\u0437"}/><LocalizedUi value={data.facts.length}/><LocalizedUi value={"\u0437\u0430\u0434\u0430\u0447."}/></p>
  <details><summary><LocalizedUi value={"\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u0435\u0440\u0435\u0434\u0430\u0432\u0430\u0435\u043C\u044B\u0435 \u0447\u0438\u0441\u043B\u043E\u0432\u044B\u0435 \u0444\u0430\u043A\u0442\u044B"}/></summary>
   <LocalizedUi value={data.facts.map(f => <p key={f.task}><LocalizedUi value={f.task}/>: <LocalizedUi value={f.status === "completed"
                ? ("кандидатов " + f.candidateCount + ", объём " + (f.candidateVolumeMl ?? "не измерен"))
                : "не исследовано"}/></p>)}/>
  </details>
  <label><LocalizedUi value={"\u041F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440"}/><select value={provider} disabled={working} onChange={e => { setProvider(e.target.value as AiProvider); setReview(null); }}>
   <option value="openrouter">OpenRouter</option>
  </select></label>
  <label><input type="checkbox" checked={consent} disabled={working} onChange={e => setConsent(e.target.checked)}/><LocalizedUi value={"\u042F \u0443\u043F\u043E\u043B\u043D\u043E\u043C\u043E\u0447\u0435\u043D \u043F\u0435\u0440\u0435\u0434\u0430\u0442\u044C \u044D\u0442\u0438 \u043E\u0431\u0435\u0437\u043B\u0438\u0447\u0435\u043D\u043D\u044B\u0435 \u0447\u0438\u0441\u043B\u043E\u0432\u044B\u0435 \u0444\u0430\u043A\u0442\u044B \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0443."}/></label>
  <label><input type="checkbox" checked={paid} disabled={working} onChange={e => setPaid(e.target.checked)}/><LocalizedUi value={"\u0420\u0430\u0437\u0440\u0435\u0448\u0430\u044E \u0434\u0432\u0430 \u043F\u043B\u0430\u0442\u043D\u044B\u0445 \u0437\u0430\u043F\u0440\u043E\u0441\u0430: Gemini, \u0437\u0430\u0442\u0435\u043C Opus."}/></label>
  <button type="button" disabled={!consent || !paid || working} onClick={() => void analyze()}>
   <LocalizedUi value={working ? "Анализируем…" : "Составить предварительный Gemini → Opus черновик"}/>
  </button>
  <LocalizedUi value={working && <button type="button" onClick={() => { controller.current?.abort(); setWorking(false); setError("Запрос отменён врачом."); }}><LocalizedUi value={"\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C"}/></button>}/>
  <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
  <LocalizedUi value={review && <div role="status">
   <h4><LocalizedUi value={"Gemini \u00B7 \u0437\u0430\u0434\u0430\u043D\u0438\u044F \u0434\u043B\u044F \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0439 \u043E\u0446\u0435\u043D\u043A\u0438"}/></h4>
   <p><LocalizedUi value={review.gemini.priorityTasks.join(", ") || "Приоритеты не указаны"}/></p>
   <LocalizedUi value={review.gemini.uncertainties.map((s, i) => <p key={i}><LocalizedUi value={s}/></p>)}/>
   <h4><LocalizedUi value={"Opus \u00B7 \u043D\u0435\u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043D\u044B\u0439 \u043F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u043E\u0442\u0447\u0451\u0442"}/></h4>
   <textarea data-concilium-report="true" rows={7} maxLength={6000} value={draft} onChange={e => setDraft(e.target.value)}/>
   <LocalizedUi value={review.opus.limitations.map((s, i) => <p key={i}><LocalizedUi value={s}/></p>)}/>
   <button type="button" disabled={!draft.trim()} onClick={exportDraft}><LocalizedUi value={"\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A JSON"}/></button>
   <p><LocalizedUi value={"\u041E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0434\u0438\u0430\u0433\u043D\u043E\u0437 \u043D\u0435 \u0434\u043E\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F. \u0412\u0441\u0435 \u043D\u0430\u0445\u043E\u0434\u043A\u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0442\u0441\u044F \u0432\u0440\u0430\u0447\u043E\u043C \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u0430\u0445."}/></p>
  </div>}/>
 </section>;
}
