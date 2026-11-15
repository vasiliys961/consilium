"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useRef, useState } from "react";
import type { AiProvider } from "../lib/ai-gateway";
import type { DualPublicModelReview } from "../lib/dual-public-detector-review";
type Case = {
    caseId: string;
    title: string;
    modelNames: string[];
    factCount: number;
    clinicalValidation: false;
};
export default function DualPublicDetectorReview() {
    const __ui = useUiTranslator();
    const [cases, setCases] = useState<Case[]>([]);
    const [choice, setChoice] = useState("lung-nodule");
    const [provider, setProvider] = useState<AiProvider>("openrouter");
    const [enabled, setEnabled] = useState(false);
    const [consent, setConsent] = useState(false);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<DualPublicModelReview | null>(null);
    const active = useRef<AbortController | null>(null);
    useEffect(() => {
        let live = true;
        void fetch("/api/ai/dual-public-detector-review", { cache: "no-store" }).then(async (r) => {
            if (!r.ok)
                throw Error("Недоступно");
            const v: unknown = await r.json();
            if (!v || typeof v !== "object" || (v as {
                schema?: unknown;
            }).schema !== "opus-dual-public-detector-index/v1")
                throw Error();
            const data = v as {
                cases: Case[];
                enabled: boolean;
                patientStudyAccepted: false;
            };
            if (data.patientStudyAccepted !== false || !Array.isArray(data.cases) || data.cases.length !== 3)
                throw Error();
            if (live) {
                setCases(data.cases);
                setEnabled(data.enabled);
            }
        }).catch(() => {
            if (live)
                setError("Локальный исследовательский AI-маршрут пока недоступен.");
        });
        return () => { live = false; active.current?.abort(); };
    }, []);
    const submit = async () => {
        if (!consent || !enabled || busy)
            return;
        const ctl = new AbortController();
        active.current = ctl;
        setBusy(true);
        setResult(null);
        setError("");
        try {
            const response = await fetch("/api/ai/dual-public-detector-review", {
                method: "POST", cache: "no-store", signal: ctl.signal,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ caseId: choice, provider, acknowledgePaidPublicResearch: true }),
            });
            const data: unknown = await response.json();
            if (!response.ok)
                throw Error((data as {
                    error?: string;
                }).error ?? "Сервер недоступен");
            const review = data as DualPublicModelReview;
            if (review.schema !== "opus-dual-public-detector-review/v1" ||
                review.patientDataTransmitted !== false || review.originalCTImagesTransmitted !== false ||
                review.newModelInferencePerformed !== false || review.physicianReviewRequired !== true ||
                review.source.caseId !== choice || review.provider !== provider ||
                review.reviews.length !== 2 || review.reviews[0].reviewer !== "gemini" ||
                review.reviews[1].reviewer !== "opus" ||
                review.clinicalStatus !== "unverified_research_draft")
                throw Error("Неподтверждённый ответ моделей");
            setResult(review);
        }
        catch (e) {
            setError(ctl.signal.aborted ? "Проверка прервана; уже начатые вызовы могут быть оплачены." :
                e instanceof Error ? e.message : "Ошибка облачной проверки");
        }
        finally {
            setBusy(false);
            active.current = null;
        }
    };
    return <section className="cs-geometry" aria-label={__ui("Gemini \u0438 Opus \u0430\u043D\u0430\u043B\u0438\u0437 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u0445 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u043E\u0432 CPU-\u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440\u043E\u0432")} style={{ marginTop: 20, padding: 16 }}>
    <h2><LocalizedUi value={"Gemini + Opus \u00B7 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u0430\u044F \u043E\u0446\u0435\u043D\u043A\u0430 \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440\u043E\u0432"}/></h2>
    <p><LocalizedUi value={"\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u044B"}/><strong><LocalizedUi value={"\u0443\u0436\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043D\u044B\u0435 \u043F\u0440\u0435\u0434\u043E\u0431\u0443\u0447\u0435\u043D\u043D\u044B\u0435 CPU-\u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440\u044B"}/></strong><LocalizedUi value={"\u043D\u0430 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u0445 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0445 \u041A\u0422: MONAI RetinaNet (\u043B\u0451\u0433\u043E\u0447\u043D\u044B\u0435 \u0443\u0437\u043B\u044B), \u043C\u043E\u0434\u0435\u043B\u0438 \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u0439 \u0438 TotalSegmentator (\u0432\u044B\u043F\u043E\u0442). \u041E\u0431\u0435 LLM \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E \u043F\u043E\u043B\u0443\u0447\u0430\u044E\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0447\u0438\u0441\u043B\u043E\u0432\u044B\u0435 \u0444\u0430\u043A\u0442\u044B \u0438 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u044F. \u041D\u043E\u0432\u044B\u0435 \u0441\u043D\u0438\u043C\u043A\u0438, DICOM, \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0438 \u0441\u0432\u043E\u0431\u043E\u0434\u043D\u044B\u0439 \u0442\u0435\u043A\u0441\u0442 \u043D\u0435 \u043F\u0440\u0438\u043D\u0438\u043C\u0430\u044E\u0442\u0441\u044F."}/></p>
    <p role="status"><LocalizedUi value={"\u042D\u0442\u043E \u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0449\u0438\u0439 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u043C\u043E\u0441\u0442,"}/><strong><LocalizedUi value={"\u043D\u0435 \u0430\u043D\u0430\u043B\u0438\u0437 \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0430"}/></strong><LocalizedUi value={". \u0414\u043B\u044F \u0431\u0443\u0434\u0443\u0449\u0438\u0445 \u043E\u0431\u0435\u0437\u043B\u0438\u0447\u0435\u043D\u043D\u044B\u0445 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0441\u043A\u0438\u0445 \u043A\u0430\u0434\u0440\u043E\u0432 \u043D\u0443\u0436\u0435\u043D \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u0441\u0435\u0440\u0432\u0435\u0440\u043D\u044B\u0439 \u0434\u043E\u043F\u0443\u0441\u043A."}/></p>
    <LocalizedUi value={cases.length > 0 && <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <label><LocalizedUi value={"\u041F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0435 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435"}/><select disabled={busy} value={choice} onChange={e => { setChoice(e.target.value); setResult(null); setConsent(false); }}>
          <LocalizedUi value={cases.map(c => <option key={c.caseId} value={c.caseId}><LocalizedUi value={c.title}/></option>)}/>
        </select></label>
        <label><LocalizedUi value={"AI-\u0448\u043B\u044E\u0437"}/><select disabled={busy} value={provider} onChange={e => {
                setProvider(e.target.value as AiProvider);
                setResult(null);
                setConsent(false);
            }}>
          <option value="openrouter">OpenRouter</option>
        </select></label>
      </div>
      <p><LocalizedUi value={"\u0412\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u0441\u043B\u0443\u0447\u0430\u0439:"}/><LocalizedUi value={cases.find(c => c.caseId === choice)?.factCount}/><LocalizedUi value={"\u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u043C\u044B\u0445 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u0444\u0430\u043A\u0442\u043E\u0432, \u0431\u0435\u0437 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u041A\u0422."}/></p>
      <label><input type="checkbox" disabled={busy || !enabled} checked={consent} onChange={e => setConsent(e.target.checked)}/><LocalizedUi value={"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E \u043F\u043B\u0430\u0442\u043D\u044B\u0435 \u0434\u0432\u0430 \u0437\u0430\u043F\u0440\u043E\u0441\u0430 Gemini \u0438 Opus \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E \u0434\u0430\u043D\u043D\u044B\u043C \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0433\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F."}/></label>
      <div className="ora-evidence-actions">
        <button type="button" disabled={busy || !consent || !enabled} onClick={() => void submit()}>
          <LocalizedUi value={busy ? "Независимая оценка двух моделей…" : "Сравнить Gemini и Opus"}/>
        </button>
        <LocalizedUi value={busy && <button type="button" onClick={() => active.current?.abort()}><LocalizedUi value={"\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C"}/></button>}/>
      </div>
    </>}/>
    <LocalizedUi value={!enabled && <p><LocalizedUi value={"\u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0430 \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u0430. \u0414\u043B\u044F \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u043E\u0433\u043E \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0433\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440 \u043D\u0430 localhost \u043C\u043E\u0436\u0435\u0442 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C"}/><code>RADIOLOGY_ENABLE_DUAL_PUBLIC_DETECTOR_LLM=1</code><LocalizedUi value={"\u0438 \u043A\u043B\u044E\u0447 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u0448\u043B\u044E\u0437\u0430."}/></p>}/>
    <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
    <LocalizedUi value={result && <div aria-live="polite">
      <p><strong><LocalizedUi value={"\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442: \u0434\u0432\u0430 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u044B\u0445 \u043D\u0435\u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0445 LLM-\u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A\u0430."}/></strong><LocalizedUi value={"\u0421\u043E\u0433\u043B\u0430\u0441\u0438\u0435 \u043C\u043E\u0434\u0435\u043B\u0435\u0439 \u043D\u0435 \u0434\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442 \u0437\u0430\u0431\u043E\u043B\u0435\u0432\u0430\u043D\u0438\u0435, \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u0443\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u044F \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u044E."}/></p>
      <div style={{ display: "grid", gap: 12 }}>
        <LocalizedUi value={result.reviews.map(r => <article key={r.reviewer} style={{ border: "1px solid #8c9b95", borderRadius: 10, padding: 12 }}>
          <h3><LocalizedUi value={r.reviewer === "gemini" ? "Gemini" : "Opus"}/> · <LocalizedUi value={r.model}/></h3>
          <p><LocalizedUi value={r.review.summary}/></p>
          <strong><LocalizedUi value={"\u041F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u0444\u0430\u043A\u0442\u043E\u0432"}/></strong>
          <ul><LocalizedUi value={r.review.rankedFacts.map(f => <li key={f.factId}>
            <code><LocalizedUi value={f.factId}/></code> · <LocalizedUi value={f.priority}/> — <LocalizedUi value={f.reason}/></li>)}/></ul>
          <strong><LocalizedUi value={"\u0412\u043E\u043F\u0440\u043E\u0441\u044B \u0432\u0440\u0430\u0447\u0443"}/></strong>
          <ul><LocalizedUi value={r.review.unresolvedQuestions.map((q, i) => <li key={i}><LocalizedUi value={q}/></li>)}/></ul>
        </article>)}/>
      </div>
      <h3><LocalizedUi value={"\u0420\u0430\u0441\u0445\u043E\u0436\u0434\u0435\u043D\u0438\u044F \u043E\u0446\u0435\u043D\u043A\u0438"}/></h3>
      <LocalizedUi value={result.priorityConflicts.length === 0 ? <p><LocalizedUi value={"\u0420\u0430\u0437\u043D\u044B\u0435 \u043F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442\u044B \u0434\u043B\u044F \u043E\u0431\u0449\u0438\u0445 \u043E\u0442\u043C\u0435\u0447\u0435\u043D\u043D\u044B\u0445 \u0444\u0430\u043A\u0442\u043E\u0432 \u043D\u0435 \u043E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u044B. \u042D\u0442\u043E \u043D\u0435 \u0441\u0432\u0438\u0434\u0435\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0443\u0435\u0442 \u043E \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u043C \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u0438."}/></p> :
                <ul><LocalizedUi value={result.priorityConflicts.map(x => <li key={x.factId}><LocalizedUi value={x.factId}/>: Gemini — <LocalizedUi value={x.geminiPriority}/>,
          Opus — <LocalizedUi value={x.opusPriority}/><LocalizedUi value={". \u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0432\u0440\u0430\u0447\u0435\u0431\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430."}/></li>)}/></ul>}/>
      <p><LocalizedUi value={"\u041D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u0438 \u043F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442\u0430 \u0443 \u043E\u0431\u0435\u0438\u0445 \u043C\u043E\u0434\u0435\u043B\u0435\u0439:"}/><LocalizedUi value={result.notCrossValidated.join(", ") || "нет"}/><LocalizedUi value={". \u042D\u0442\u0438 \u0444\u0430\u043A\u0442\u044B \u043D\u0435 \u0441\u0447\u0438\u0442\u0430\u044E\u0442\u0441\u044F \u043E\u0442\u0432\u0435\u0440\u0433\u043D\u0443\u0442\u044B\u043C\u0438."}/></p>
    </div>}/>
  </section>;
}
