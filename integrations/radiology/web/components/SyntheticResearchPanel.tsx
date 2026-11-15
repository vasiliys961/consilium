"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useRef, useState } from "react";
import type { ProviderReadinessReport } from "../lib/provider-readiness";
import type { SyntheticTrialResult } from "../lib/synthetic-live-research";
import type { SyntheticRegion } from "../lib/synthetic-vision-phantom";
import { useAnalysisSound } from "./AnalysisSoundProvider";
type Props = {
    diagnostic: ProviderReadinessReport;
    selectedVision: string;
    selectedClinical: string;
};
const REGIONS: {
    id: SyntheticRegion;
    label: string;
}[] = [
    { id: "head", label: "Голова" },
    { id: "chest", label: "Грудная клетка" },
    { id: "abdomen", label: "Живот" },
];
export default function SyntheticResearchPanel({ diagnostic, selectedVision: visionModel, selectedClinical: clinicalModel }: Props) {
    const __ui = useUiTranslator();
    const visionModels = diagnostic.suggestions.vision;
    const clinicalModels = diagnostic.suggestions.clinical;
    const available = visionModels.some(m => m.id === visionModel) && clinicalModels.some(m => m.id === clinicalModel);
    const gateway = diagnostic.provider === "polza" ? "Polza" : "OpenRouter";
    const [modality, setModality] = useState<"CT" | "MR">("CT");
    const [region, setRegion] = useState<SyntheticRegion>("chest");
    const [acknowledged, setAcknowledged] = useState(false);
    const [working, setWorking] = useState(false);
    const [result, setResult] = useState<SyntheticTrialResult | null>(null);
    const [error, setError] = useState("");
    const [expanded, setExpanded] = useState(false);
    const generation = useRef(0), active = useRef<AbortController | null>(null);
    const { enabled: chimeEnabled, armChime, completionChime } = useAnalysisSound();
    useEffect(() => {
        ++generation.current;
        setResult(null);
        setError("");
        setAcknowledged(false);
        return () => { ++generation.current; active.current?.abort(); };
    }, [visionModel, clinicalModel, modality, region, diagnostic.provider]);
    const run = async () => {
        if (working || !acknowledged || !available)
            return;
        if (chimeEnabled)
            void armChime();
        setWorking(true);
        setResult(null);
        setError("");
        const controller = new AbortController();
        active.current = controller;
        const version = generation.current;
        const timeout = setTimeout(() => controller.abort(), 265000);
        try {
            const response = await fetch("/api/ai/synthetic-demo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                cache: "no-store", signal: controller.signal,
                body: JSON.stringify({
                    provider: diagnostic.provider, modality, region, visionModel, clinicalModel,
                    acknowledgePaidSyntheticExperiment: true,
                }),
            });
            const payload: unknown = await response.json();
            if (version !== generation.current)
                return;
            if (!response.ok) {
                const message = payload && typeof payload === "object" &&
                    typeof (payload as {
                        error?: unknown;
                    }).error === "string" ?
                    String((payload as {
                        error: string;
                    }).error).slice(0, 240) :
                    "HTTP " + response.status;
                throw new Error(message);
            }
            if (!payload || typeof payload !== "object" ||
                (payload as {
                    schema?: unknown;
                }).schema !== "opus-synthetic-trial/v1" ||
                (payload as {
                    sample?: unknown;
                }).sample !== "non-patient-mathematical-phantom" ||
                (payload as {
                    patientDataSubmitted?: unknown;
                }).patientDataSubmitted !== false ||
                (payload as {
                    region?: unknown;
                }).region !== region ||
                (payload as {
                    remoteInferencePerformed?: unknown;
                }).remoteInferencePerformed !== true ||
                (payload as SyntheticTrialResult).result?.provider !== diagnostic.provider ||
                (payload as SyntheticTrialResult).result?.visionModel !== visionModel ||
                (payload as SyntheticTrialResult).result?.clinicalModel !== clinicalModel ||
                (payload as {
                    result?: {
                        clinicalStatus?: unknown;
                    };
                }).result?.clinicalStatus !==
                    "unverified_research_draft") {
                throw new Error("Ответ не соответствует исследовательскому контракту.");
            }
            setResult(payload as SyntheticTrialResult);
            void completionChime();
        }
        catch (err) {
            if (version === generation.current)
                setError(controller.signal.aborted ?
                    "Тест отменён или время ожидания истекло. Уже выполненные обращения могут быть оплачены." :
                    err instanceof Error ? err.message.slice(0, 280) : "Исследовательский вызов не удался.");
        }
        finally {
            clearTimeout(timeout);
            if (active.current === controller)
                active.current = null;
            setWorking(false);
        }
    };
    const download = () => {
        if (!result)
            return;
        const bytes = JSON.stringify(result, null, 2);
        const blob = new Blob([bytes], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "opus-synthetic-orchestra-" + modality.toLowerCase() + "-" + region + ".json";
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 400);
    };
    if (diagnostic.catalogStatus !== "verified-response" || !diagnostic.keyConfigured)
        return null;
    return <section className="ora-synthetic-demo" aria-label={`Эксперимент ${gateway} с искусственными изображениями`}>
    <div className="ora-v17-heading"><strong><LocalizedUi value={"\u041F\u0440\u043E\u0431\u043D\u044B\u0439 \u0430\u043D\u0430\u043B\u0438\u0437 \u0447\u0435\u0440\u0435\u0437 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u0435 AI-\u043C\u043E\u0434\u0435\u043B\u0438"}/></strong>
      <span><LocalizedUi value={"\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0441\u043A\u0443\u0441\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0435 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F"}/></span></div>
    <p className="ora-synthetic-lead"><LocalizedUi value={"5 \u0432\u044B\u0437\u043E\u0432\u043E\u0432"}/><LocalizedUi value={gateway}/><LocalizedUi value={": \u0442\u0440\u0438 \u0440\u043E\u043B\u0438 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 Vision-\u043C\u043E\u0434\u0435\u043B\u0438, \u0437\u0430\u0442\u0435\u043C \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043E\u0446\u0435\u043D\u0449\u0438\u043A \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442 \u043A\u0430\u0434\u0440\u044B \u0438 \u0433\u043E\u0442\u043E\u0432\u0438\u0442 \u0442\u0435\u043A\u0441\u0442\u043E\u0432\u044B\u0439 \u0441\u0438\u043D\u0442\u0435\u0437. \u041E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u044E\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043C\u0430\u0442\u0435\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0435 PNG-\u0444\u0430\u043D\u0442\u043E\u043C\u044B, \u0441\u043E\u0437\u0434\u0430\u043D\u043D\u044B\u0435 \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435. \u0417\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u0435 DICOM \u0438 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442 \u043D\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044E\u0442\u0441\u044F."}/></p>
    <div className="ora-synthetic-controls">
      <label htmlFor="ora-synthetic-region"><LocalizedUi value={"\u041E\u0431\u043B\u0430\u0441\u0442\u044C"}/><select id="ora-synthetic-region" value={region} disabled={working} onChange={event => setRegion(event.target.value as SyntheticRegion)}>
          <LocalizedUi value={REGIONS.map(x => <option key={x.id} value={x.id}><LocalizedUi value={x.label}/></option>)}/>
        </select>
      </label>
      <label htmlFor="ora-synthetic-modality"><LocalizedUi value={"\u0423\u0441\u043B\u043E\u0432\u043D\u0430\u044F \u043C\u043E\u0434\u0430\u043B\u044C\u043D\u043E\u0441\u0442\u044C"}/><select id="ora-synthetic-modality" value={modality} disabled={working} onChange={event => setModality(event.target.value as "CT" | "MR")}>
          <option value="CT"><LocalizedUi value={"\u041A\u0422 \u2014 \u0441\u0445\u0435\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F"}/></option>
          <option value="MR"><LocalizedUi value={"\u041C\u0420\u0422 \u2014 \u0441\u0445\u0435\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F"}/></option>
        </select>
      </label>
      <p>Vision: <code><LocalizedUi value={visionModel}/></code><LocalizedUi value={". \u041E\u0446\u0435\u043D\u0449\u0438\u043A \u0438 \u0441\u0438\u043D\u0442\u0435\u0437:"}/><code><LocalizedUi value={clinicalModel}/></code><LocalizedUi value={". \u0412\u044B\u0431\u043E\u0440 \u043C\u043E\u0434\u0435\u043B\u0435\u0439 \u2014 \u0432 AI-\u043E\u0440\u043A\u0435\u0441\u0442\u0440\u0435 \u0432\u044B\u0448\u0435."}/></p>
    </div>
    <LocalizedUi value={!available && <p role="status"><LocalizedUi value={"\u0412\u044B\u0431\u0440\u0430\u043D\u043D\u0430\u044F \u0441\u0432\u044F\u0437\u043A\u0430 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u0432 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u043E\u043C \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0435"}/><LocalizedUi value={gateway}/><LocalizedUi value={"\u0438\u043B\u0438 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u0438 \u0442\u0435\u043A\u0441\u0442. \u0417\u0430\u043F\u0443\u0441\u043A \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D. \u0414\u0440\u0443\u0433\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043D\u0435 \u0432\u044B\u0431\u0438\u0440\u0430\u0435\u0442\u0441\u044F."}/></p>}/>
    <div className="ora-synthetic-preview" aria-label={__ui("\u0422\u043E\u0447\u043D\u044B\u0435 \u0441\u0438\u043D\u0442\u0435\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u0434\u043B\u044F AI")}>
      <LocalizedUi value={[0, 1].map(index => <figure key={index}>
        <img alt={"Математический фантом " + (index + 1) + ", " + region + ", не DICOM"} src={"/api/ai/synthetic-demo/preview?region=" + region +
                "&modality=" + modality + "&frame=" + index}/>
        <figcaption><LocalizedUi value={"\u0418\u0441\u043A\u0443\u0441\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439 \u043A\u0430\u0434\u0440"}/><LocalizedUi value={index + 1}/>/2 · 96×96</figcaption>
      </figure>)}/>
    </div>
    <p className="ora-synthetic-warning"><LocalizedUi value={"\u042D\u0442\u043E \u043F\u043B\u0430\u0442\u043D\u044B\u0439 \u044D\u043A\u0441\u043F\u0435\u0440\u0438\u043C\u0435\u043D\u0442:"}/><LocalizedUi value={gateway}/><LocalizedUi value={"\u043C\u043E\u0436\u0435\u0442 \u0441\u043F\u0438\u0441\u0430\u0442\u044C \u0441\u0440\u0435\u0434\u0441\u0442\u0432\u0430 \u0437\u0430 5 \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0439, \u0432\u043A\u043B\u044E\u0447\u0430\u044F \u043D\u0435\u0443\u0434\u0430\u0447\u043D\u044B\u0435. \u041F\u043E\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0435 \u043A\u0430\u0442\u0430\u043B\u043E\u0436\u043D\u044B\u0435 \u043C\u043E\u0434\u0435\u043B\u0438 \u043C\u043E\u0433\u0443\u0442 \u0431\u044B\u0442\u044C \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B \u043D\u0430 \u0432\u0430\u0448\u0435\u043C \u0442\u0430\u0440\u0438\u0444\u0435. \u0423\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0435 \u043B\u0438\u043C\u0438\u0442 \u0440\u0430\u0441\u0445\u043E\u0434\u043E\u0432 \u0443 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u0448\u043B\u044E\u0437\u0430."}/></p>
    <label className="ora-synthetic-accept" htmlFor="ora-synthetic-cost-ack">
      <input id="ora-synthetic-cost-ack" type="checkbox" checked={acknowledged} disabled={working} onChange={e => setAcknowledged(e.target.checked)}/><LocalizedUi value={"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E \u043F\u043B\u0430\u0442\u043D\u044B\u0439 \u0442\u0435\u0441\u0442 \u0438\u0441\u043A\u043B\u044E\u0447\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u043D\u0430 \u0438\u0441\u043A\u0443\u0441\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0445 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F\u0445."}/></label>
    <button type="button" className="ora-synthetic-run" disabled={working || !acknowledged || !available} onClick={() => { void run(); }}>
      <LocalizedUi value={working ? "Модели анализируют фантомы… до 4 минут" :
            `Запустить реальный ${gateway}-тест`}/>
    </button>
    <LocalizedUi value={working && <button type="button" onClick={() => active.current?.abort()}><LocalizedUi value={"\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0442\u0435\u0441\u0442"}/></button>}/>
    <LocalizedUi value={working && <p role="status" className="ora-synthetic-status"><LocalizedUi value={"\u0417\u0430\u043F\u0440\u043E\u0441 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D. \u041D\u0435 \u0437\u0430\u043A\u0440\u044B\u0432\u0430\u0439\u0442\u0435 \u0432\u043A\u043B\u0430\u0434\u043A\u0443. \u041F\u043E\u0432\u0442\u043E\u0440\u043D\u044B\u0439 \u0437\u0430\u043F\u0443\u0441\u043A \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D. \u0415\u0441\u043B\u0438 \u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435 \u043E\u0431\u043E\u0440\u0432\u0451\u0442\u0441\u044F, \u0440\u0430\u043D\u0435\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043D\u044B\u0435 \u0432\u044B\u0437\u043E\u0432\u044B \u043C\u043E\u0433\u0443\u0442 \u0431\u044B\u0442\u044C \u043E\u043F\u043B\u0430\u0447\u0435\u043D\u044B."}/></p>}/>
    <LocalizedUi value={error && <p role="alert" className="ora-provider-error"><LocalizedUi value={"\u0422\u0435\u0441\u0442 \u043D\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D:"}/><LocalizedUi value={error}/><LocalizedUi value={". \u00AB\u0414\u0437\u0438\u043D\u044C\u00BB \u043D\u0435 \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0438\u0442\u0441\u044F \u043F\u0440\u0438 \u043E\u0448\u0438\u0431\u043A\u0435."}/></p>}/>
    <LocalizedUi value={result && <div className="ora-synthetic-result" aria-live="polite">
      <div className="ora-synthetic-complete"><strong><LocalizedUi value={"\u2713 \u041E\u0440\u043A\u0435\u0441\u0442\u0440 \u043E\u0442\u0432\u0435\u0442\u0438\u043B"}/></strong>
        <span><LocalizedUi value={"5 \u044D\u0442\u0430\u043F\u043E\u0432 \u00B7"}/><LocalizedUi value={result.region}/> · <LocalizedUi value={result.result.modality}/></span></div>
      <p className="ora-synthetic-warning"><LocalizedUi value={"\u041D\u0415 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435. \u041C\u043E\u0434\u0435\u043B\u0438 \u0441\u043C\u043E\u0442\u0440\u0435\u043B\u0438 \u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0444\u0430\u043D\u0442\u043E\u043C\u044B 96\u00D796 \u043F\u0438\u043A\u0441\u0435\u043B\u0435\u0439, \u043D\u0435 \u043C\u0435\u0434\u0438\u0446\u0438\u043D\u0441\u043A\u0438\u0435 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F."}/></p>
      <div className="ora-synthetic-metrics">
        <div><b><LocalizedUi value={result.result.roleResponses.length}/></b><small><LocalizedUi value={"Vision-\u0440\u043E\u043B\u0438"}/></small></div>
        <div><b><LocalizedUi value={result.result.evidence.findings.length}/></b><small><LocalizedUi value={"\u041D\u0430\u0431\u043B\u044E\u0434\u0435\u043D\u0438\u044F (\u043D\u0435\u0432\u0435\u0440\u0438\u0444.)"}/></small></div>
        <div><b><LocalizedUi value={result.result.critic.needsRecheck.length}/></b><small><LocalizedUi value={"\u041F\u043E\u0432\u0442\u043E\u0440\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430"}/></small></div>
      </div>
      <h3><LocalizedUi value={"\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u0442\u0435\u043A\u0441\u0442"}/></h3>
      <p><LocalizedUi value={result.result.clinicalDraft.summary}/></p>
      <LocalizedUi value={result.result.clinicalDraft.limitations.length > 0 && <ul><LocalizedUi value={result.result.clinicalDraft.limitations.map((item, i) => <li key={i}><LocalizedUi value={item}/></li>)}/></ul>}/>
      <button type="button" className="ora-synthetic-secondary" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
        <LocalizedUi value={expanded ? "Скрыть ответы агентов" : "Показать ответы агентов и доказательства"}/>
      </button>
      <LocalizedUi value={expanded && <div className="ora-synthetic-details">
        <LocalizedUi value={result.result.roleResponses.map(role => <div key={role.role}>
          <strong><LocalizedUi value={role.role}/><LocalizedUi value={"\u00B7 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u043E"}/><LocalizedUi value={role.reviewedImageIds.length}/><LocalizedUi value={"\u043A\u0430\u0434\u0440\u043E\u0432"}/></strong>
          <LocalizedUi value={role.observations.map(item => <p key={item.id}>
            <LocalizedUi value={item.anatomy}/>: <LocalizedUi value={item.sign}/><LocalizedUi value={"\u00B7 \u043D\u0435\u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0451\u043D\u043D\u043E\u0441\u0442\u044C:"}/><LocalizedUi value={item.uncertainty}/>
          </p>)}/>
          <LocalizedUi value={role.limitations.map((note, i) => <small key={i}><LocalizedUi value={note}/></small>)}/>
        </div>)}/>
        <div><strong><LocalizedUi value={"\u041A\u0440\u0438\u0442\u0438\u043A \u00B7"}/><LocalizedUi value={result.result.clinicalModel}/></strong>
          <p><LocalizedUi value={"\u041F\u0440\u043E\u0442\u0438\u0432\u043E\u0440\u0435\u0447\u0438\u044F:"}/><LocalizedUi value={result.result.critic.conflicts.join(", ") || "Не указаны"}/></p>
          <LocalizedUi value={result.result.critic.limitations.map((note, i) => <small key={i}><LocalizedUi value={note}/></small>)}/>
        </div>
        <div><strong><LocalizedUi value={"Evidence JSON \u00B7 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u043A\u0430\u0436\u0434\u043E\u0433\u043E \u043D\u0430\u0431\u043B\u044E\u0434\u0435\u043D\u0438\u044F"}/></strong>
          <LocalizedUi value={result.result.evidence.findings.map(f => <p key={f.findingId}>
            <LocalizedUi value={f.findingId}/>: <LocalizedUi value={f.status}/>, SOP=<LocalizedUi value={f.source.sopInstanceUid ?? "не задан"}/>
          </p>)}/>
        </div>
      </div>}/>
      <button type="button" className="ora-synthetic-secondary" onClick={download}><LocalizedUi value={"\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 JSON"}/></button>
      <p className="ora-synthetic-note"><LocalizedUi value={"\u0412 \u043E\u0442\u0432\u0435\u0442\u0435 \u043D\u0435\u0442 \u043F\u0438\u043A\u0441\u0435\u043B\u0435\u0439 \u0438 API-\u043A\u043B\u044E\u0447\u0430. \u041C\u043E\u0434\u0435\u043B\u0438 \u043C\u043E\u0433\u0443\u0442 \u0433\u0430\u043B\u043B\u044E\u0446\u0438\u043D\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0434\u0430\u0436\u0435 \u043D\u0430 \u043C\u0430\u0442\u0435\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0445 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F\u0445. \u041F\u0430\u0446\u0438\u0435\u043D\u0442\u0441\u043A\u0438\u0439 AI \u043F\u043E\u043A\u0430 \u043E\u0442\u043A\u043B\u044E\u0447\u0451\u043D."}/></p>
    </div>}/>
    <p className="ora-synthetic-note"><LocalizedUi value={"\u0420\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u043D\u0430 localhost \u0432 \u0440\u0435\u0436\u0438\u043C\u0435 npm run dev. \u041F\u0435\u0440\u0435\u0445\u043E\u0434 \u043D\u0430 \u0440\u0435\u0430\u043B\u044C\u043D\u044B\u0439 DICOM-\u043F\u043E\u0442\u043E\u043A \u043F\u043E\u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u043E\u0431\u0435\u0437\u043B\u0438\u0447\u0438\u0432\u0430\u043D\u0438\u044F, \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438, \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u044F \u0438 \u043F\u0440\u043E\u0438\u0441\u0445\u043E\u0436\u0434\u0435\u043D\u0438\u044F \u043A\u0430\u0436\u0434\u043E\u0433\u043E \u043F\u0438\u043A\u0441\u0435\u043B\u044F."}/></p>
  </section>;
}
