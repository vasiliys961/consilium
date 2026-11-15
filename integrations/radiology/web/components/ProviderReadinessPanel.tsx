"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useState } from "react";
import type { AiProvider } from "../lib/ai-gateway";
import SyntheticResearchPanel from "./SyntheticResearchPanel";
import type { CatalogModel, ProviderReadinessReport, RoleCheck, } from "../lib/provider-readiness";
type Props = {
    provider: AiProvider;
    selectedVision: string;
    selectedClinical: string;
};
function outcome(label: string, role: RoleCheck) {
    if (!role.configured)
        return label + ": серверная модель не настроена";
    if (role.inCatalogue === null)
        return label + ": каталог не проверен";
    if (!role.inCatalogue)
        return label + ": ID не найден в текущем каталоге";
    if (!role.matchingModality)
        return label + ": нужная модальность не заявлена";
    return label + ": ID и заявленная модальность найдены";
}
function ModelList({ title, models }: {
    title: string;
    models: readonly CatalogModel[];
}) {
    const __ui = useUiTranslator();
    if (!models.length)
        return null;
    return <details className="ora-provider-model-list">
    <summary><LocalizedUi value={title}/> (<LocalizedUi value={models.length}/>)</summary>
    <ul><LocalizedUi value={models.map(model => <li key={model.id}>
      <strong><LocalizedUi value={model.name}/></strong>
      <code><LocalizedUi value={model.id}/></code>
    </li>)}/></ul>
  </details>;
}
/** Read-only UI: never passes the DICOM study, selected file or clinical context. */
export default function ProviderReadinessPanel({ provider, selectedVision, selectedClinical, }: Props) {
    const __ui = useUiTranslator();
    const [result, setResult] = useState<ProviderReadinessReport | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        setResult(null);
        setError("");
        setBusy(false);
    }, [provider]);
    const check = async () => {
        setBusy(true);
        setError("");
        setResult(null);
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 15000);
            let response: Response;
            try {
                response = await fetch("/api/ai/provider-readiness?provider=" + encodeURIComponent(provider), { method: "GET", cache: "no-store", signal: controller.signal });
            }
            finally {
                clearTimeout(timer);
            }
            if (!response.ok)
                throw new Error("status " + response.status);
            const body: unknown = await response.json();
            if (!body || typeof body !== "object" ||
                (body as {
                    schema?: unknown;
                }).schema !== "opus-provider-readiness/v1" ||
                (body as {
                    provider?: unknown;
                }).provider !== provider)
                throw new Error("Unexpected diagnostic report");
            setResult(body as ProviderReadinessReport);
        }
        catch {
            setError("Диагностика недоступна. Она работает только на localhost в npm run dev. " +
                "Проверьте интернет, серверный ключ и повторите попытку.");
        }
        finally {
            setBusy(false);
        }
    };
    return <section className="ora-provider-panel" aria-label={__ui("\u0414\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0430 AI-\u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430")}>
    <div className="ora-v17-heading">
      <strong><LocalizedUi value={"\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F AI-\u0448\u043B\u044E\u0437\u0430"}/></strong>
      <span><LocalizedUi value={"v1.8 \u00B7 \u0431\u0435\u0437 \u0434\u0430\u043D\u043D\u044B\u0445 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u043E\u0432"}/></span>
    </div>
    <p><LocalizedUi value={"\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u043C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0441\u0435\u0440\u0432\u0435\u0440 \u0438 \u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u043C\u043E\u0434\u0435\u043B\u0435\u0439. \u0421\u043D\u0438\u043C\u043A\u0438 \u0438 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442 \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u044E\u0442\u0441\u044F. \u041A\u043B\u044E\u0447 \u043D\u0435 \u0440\u0430\u0441\u043A\u0440\u044B\u0432\u0430\u0435\u0442\u0441\u044F \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435, \u043D\u043E \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0441\u0430\u043C\u043E\u043C\u0443 \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0443 \u0432 \u0441\u0435\u0440\u0432\u0435\u0440\u043D\u043E\u043C \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438."}/></p>
    <button type="button" className="ora-provider-check" disabled={busy} onClick={() => { void check(); }}>
      <LocalizedUi value={busy ? "Проверяем…" : "Проверить " + (provider === "openrouter" ? "OpenRouter" : "Polza")}/>
    </button>
    <LocalizedUi value={error && <p className="ora-provider-error" role="alert"><LocalizedUi value={error}/></p>}/>
    <LocalizedUi value={result && result.provider === provider && <div className="ora-provider-results" aria-live="polite">
      <div className="ora-provider-status-row">
        <strong><LocalizedUi value={"\u0421\u0435\u0440\u0432\u0435\u0440\u043D\u044B\u0439 \u043A\u043B\u044E\u0447"}/></strong>
        <span className={result.keyConfigured ? "ora-provider-good" : "ora-provider-warn"}>
          <LocalizedUi value={result.keyConfigured ? "Настроен (значение скрыто)" : "Не найден"}/>
        </span>
      </div>
      <div className="ora-provider-status-row">
        <strong><LocalizedUi value={"\u041A\u0430\u0442\u0430\u043B\u043E\u0433 \u043C\u043E\u0434\u0435\u043B\u0435\u0439"}/></strong>
        <span className={result.catalogStatus === "verified-response" ?
                "ora-provider-good" : "ora-provider-warn"}>
          <LocalizedUi value={result.catalogStatus === "verified-response" ? "Получен" :
                result.catalogStatus === "not-supported" ? "Polza: не проверяется" :
                    result.catalogStatus === "unavailable" ? "Недоступен" : "Проверка отключена"}/>
        </span>
      </div>
      <details><summary><LocalizedUi value={"\u0421\u0435\u0440\u0432\u0435\u0440\u043D\u044B\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043F\u0440\u0435\u0436\u043D\u0435\u0433\u043E API"}/></summary><ul className="ora-provider-role-checks">
        <li><LocalizedUi value={outcome("Vision", result.vision)}/>
          <LocalizedUi value={result.vision.modelId && <code><LocalizedUi value={result.vision.modelId}/></code>}/></li>
        <li><LocalizedUi value={outcome("Клиническая модель", result.clinical)}/>
          <LocalizedUi value={result.clinical.modelId && <code><LocalizedUi value={result.clinical.modelId}/></code>}/></li>
      </ul></details>
      <p className="ora-provider-config-note"><LocalizedUi value={"\u0412\u044B\u0431\u0440\u0430\u043D\u043E \u0432 \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0435: Vision"}/><code><LocalizedUi value={selectedVision}/></code><LocalizedUi value={", \u043E\u0446\u0435\u043D\u0449\u0438\u043A \u0438 \u0441\u0438\u043D\u0442\u0435\u0437"}/><code><LocalizedUi value={selectedClinical}/></code><LocalizedUi value={". \u0421\u0438\u043D\u0442\u0435\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043F\u0440\u043E\u0431\u0430 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442 \u0438\u043C\u0435\u043D\u043D\u043E \u044D\u0442\u0443 \u0441\u0432\u044F\u0437\u043A\u0443 \u0438 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u0448\u043B\u044E\u0437."}/></p>
      <ModelList title={__ui("\u0412\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435 Vision-\u043C\u043E\u0434\u0435\u043B\u0438 \u0432 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0435")} models={result.suggestions.vision}/>
      <ModelList title={__ui("\u0412\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435 \u043E\u0446\u0435\u043D\u0449\u0438\u043A\u0438 \u0432 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0435")} models={result.suggestions.clinical}/>
      <LocalizedUi value={result.notes.map((note, i) => <p key={i} className="ora-provider-note"><LocalizedUi value={note}/></p>)}/>
      <p className="ora-provider-safety"><LocalizedUi value={"\u0420\u0435\u0430\u043B\u044C\u043D\u044B\u0439 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0441\u043A\u0438\u0439 AI-\u0430\u043D\u0430\u043B\u0438\u0437: \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D. \u042D\u0442\u0430 \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0430 \u043D\u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0430\u0435\u0442 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0443 \u0441\u043D\u0438\u043C\u043A\u043E\u0432 \u0438 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0443\u044E \u043F\u0440\u0438\u0433\u043E\u0434\u043D\u043E\u0441\u0442\u044C \u043C\u043E\u0434\u0435\u043B\u0435\u0439."}/></p>
      <SyntheticResearchPanel diagnostic={result} selectedVision={selectedVision} selectedClinical={selectedClinical}/>
    </div>}/>
  </section>;
}
