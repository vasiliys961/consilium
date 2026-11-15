"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useState } from "react";
import { localLungFacts, type LocalLungReview, type LocalLungFacts } from "../lib/local-lung-review";
import type { SegmentationEvidence } from "../lib/segmentation-evidence";
/** Optional LOCAL text-only model critique; never touches DICOM pixels or APIs. */
export default function LocalLungLlmReview({ evidence }: {
    evidence: SegmentationEvidence;
}) {
    const __ui = useUiTranslator();
    const [models, setModels] = useState<string[]>([]);
    const [model, setModel] = useState("");
    const [accepted, setAccepted] = useState(false);
    const [review, setReview] = useState<LocalLungReview | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    let facts: LocalLungFacts | null = null;
    try {
        facts = localLungFacts(evidence);
    }
    catch {
        facts = null;
    }
    const [checking, setChecking] = useState(false);
    async function checkModels() {
        if (!facts || checking)
            return;
        setChecking(true);
        setError("");
        setReview(null);
        setModels([]);
        setModel("");
        try {
            const response = await fetch("/api/ai/local-lung-review", { cache: "no-store" });
            if (!response.ok)
                throw Error("Локальная LM Studio не обнаружена");
            const value = await response.json() as {
                models: {
                    id: string;
                }[];
            };
            const ids = value.models.map(x => x.id);
            setModels(ids);
            setModel(ids[0] ?? "");
            if (!ids.length)
                throw Error("В LM Studio нет доступных моделей");
        }
        catch {
            setError("Запустите сервер LM Studio на 127.0.0.1:1234 и загрузите текстовую модель. Облачные LLM не вызываются.");
        }
        finally {
            setChecking(false);
        }
    }
    if (!facts)
        return null;
    async function ask() {
        if (!facts || !model || !accepted || busy)
            return;
        setBusy(true);
        setError("");
        setReview(null);
        try {
            const response = await fetch("/api/ai/local-lung-review", { method: "POST", cache: "no-store",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ facts, modelId: model, acknowledgeLocalInference: true }) });
            const value: unknown = await response.json();
            if (!response.ok)
                throw Error((value as {
                    error?: string;
                }).error ?? "Локальная модель недоступна");
            const checked = value as {
                schema: string;
                review: LocalLungReview;
                patientPixelsSent: false;
                externalProvidersCalled: false;
            };
            if (checked.schema !== "opus-local-lung-review-response/v1" ||
                checked.patientPixelsSent !== false || checked.externalProvidersCalled !== false)
                throw Error("Недоверенный ответ локальной модели");
            setReview(checked.review);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Ошибка локальной LLM");
        }
        finally {
            setBusy(false);
        }
    }
    return <details className="ora-evidence-draft">
  <summary><LocalizedUi value={"\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u0430\u044F LLM \u00B7 \u043A\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043C\u0430\u0441\u043A\u0438 R231 (\u0431\u0435\u0437 \u043E\u0431\u043B\u0430\u043A\u0430)"}/></summary>
  <p><LocalizedUi value={"\u0422\u043E\u043B\u044C\u043A\u043E \u0430\u0433\u0440\u0435\u0433\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u043E\u0431\u044A\u0451\u043C\u044B \u043C\u0430\u0441\u043E\u043A \u043F\u0440\u0430\u0432\u043E\u0433\u043E \u0438 \u043B\u0435\u0432\u043E\u0433\u043E \u043B\u0451\u0433\u043A\u043E\u0433\u043E \u0438 \u0447\u0438\u0441\u043B\u043E \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u043E\u0432 \u043D\u0430\u043F\u0440\u0430\u0432\u043B\u044F\u044E\u0442\u0441\u044F \u0432 LM Studio \u043F\u043E 127.0.0.1. \u041D\u0435\u0442 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0439, UID, SHA, \u0438\u043C\u0451\u043D \u0444\u0430\u0439\u043B\u043E\u0432 \u0438\u043B\u0438 \u0437\u0430\u043C\u0435\u0442\u043E\u043A \u0432\u0440\u0430\u0447\u0430. \u041C\u043E\u0434\u0435\u043B\u044C \u043D\u0435 \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u0440\u0443\u0435\u0442 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u044E \u0438 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u043F\u043E\u043B\u043D\u043E\u0442\u0443 \u041A\u0422."}/></p>
  <p><LocalizedUi value={"R231: \u043F\u0440\u0430\u0432\u0430\u044F \u043C\u0435\u0442\u043A\u0430"}/><LocalizedUi value={facts.rightLungMaskMl.toFixed(1)}/><LocalizedUi value={"\u043C\u043B \u00B7 \u043B\u0435\u0432\u0430\u044F"}/><LocalizedUi value={facts.leftLungMaskMl.toFixed(1)}/><LocalizedUi value={"\u043C\u043B \u00B7"}/><LocalizedUi value={facts.frameCount}/><LocalizedUi value={"\u0441\u0440\u0435\u0437\u043E\u0432. \u041E\u0431\u044A\u0451\u043C\u044B \u043C\u043E\u0433\u0443\u0442 \u0431\u044B\u0442\u044C \u0447\u0430\u0441\u0442\u0438\u0447\u043D\u044B\u043C\u0438."}/></p>
  <div className="ora-evidence-actions"><button type="button" disabled={checking || busy} onClick={() => void checkModels()}><LocalizedUi value={checking ? "Проверяем LM Studio…" : "Проверить доступные локальные модели"}/></button></div>
  <label><LocalizedUi value={"\u0417\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u0430\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C"}/><select value={model} onChange={e => { setModel(e.target.value); setReview(null); }} disabled={busy}>
    <LocalizedUi value={models.map(id => <option key={id} value={id}><LocalizedUi value={id}/></option>)}/>
  </select></label>
  <label><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} disabled={busy}/><LocalizedUi value={"\u042F \u0440\u0430\u0437\u0440\u0435\u0448\u0430\u044E \u043F\u0435\u0440\u0435\u0434\u0430\u0442\u044C \u043E\u0431\u0435\u0437\u043B\u0438\u0447\u0435\u043D\u043D\u044B\u0435 \u0447\u0438\u0441\u043B\u043E\u0432\u044B\u0435 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u043C\u0443 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0443 LM Studio \u0438 \u043F\u043E\u043D\u0438\u043C\u0430\u044E \u0440\u0438\u0441\u043A \u043F\u043E\u0432\u044B\u0448\u0435\u043D\u043D\u043E\u0433\u043E \u0440\u0430\u0441\u0445\u043E\u0434\u0430 RAM."}/></label>
  <div className="ora-evidence-actions"><button type="button" disabled={!model || !accepted || busy} onClick={() => void ask()}>
    <LocalizedUi value={busy ? "Работает локальная модель…" : "Критически оценить маску через LM Studio"}/></button></div>
  <LocalizedUi value={error && <p role="alert" className="ora-evidence-error"><LocalizedUi value={error}/></p>}/>
  <LocalizedUi value={review && <div role="status">
    <p><strong><LocalizedUi value={"\u041D\u0435\u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0439 LLM-\u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A:"}/></strong> <LocalizedUi value={review.summary}/></p>
    <b><LocalizedUi value={"\u0427\u0442\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0432\u0440\u0430\u0447\u0443:"}/></b><ul><LocalizedUi value={review.qualityQuestions.map((x, i) => <li key={i}><LocalizedUi value={x}/></li>)}/></ul>
    <b><LocalizedUi value={"\u041E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u044F:"}/></b><ul><LocalizedUi value={review.limitations.map((x, i) => <li key={i}><LocalizedUi value={x}/></li>)}/></ul>
    <small><LocalizedUi value={"\u0412\u044B\u0432\u043E\u0434\u044B LLM \u043D\u0435 \u044F\u0432\u043B\u044F\u044E\u0442\u0441\u044F \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u043C\u0438 \u0438 \u043D\u0435 \u0434\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u044E\u0442 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u0437\u0430\u0431\u043E\u043B\u0435\u0432\u0430\u043D\u0438\u044F."}/></small>
  </div>}/>
 </details>;
}
