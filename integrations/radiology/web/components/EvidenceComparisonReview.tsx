"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useRef, useState } from "react";
import { COMPARISON_REASONS, MAX_LLM_MEASUREMENTS_BYTES, createLlmMeasurementTemplate, parseLlmMeasurements, reconcileEvidence, type LlmMeasurements } from "../lib/evidence-reconciliation";
import type { SegmentationEvidence } from "../lib/segmentation-evidence";
import type { Point3 } from "../lib/segmentation-mask";
import EvidenceReportDownload from "./EvidenceReportDownload";
export default function EvidenceComparisonReview({ evidence, onNavigate, onSampleMask, hasUnsavedReviewerNote = false }: {
    evidence: SegmentationEvidence;
    onNavigate: (point: Point3, labelId: number | null) => void;
    onSampleMask: (point: Point3) => number | null;
    hasUnsavedReviewerNote?: boolean;
}) {
    const __ui = useUiTranslator();
    const [llm, setLlm] = useState<LlmMeasurements | null>(null);
    const [error, setError] = useState("");
    const [navigationError, setNavigationError] = useState("");
    const importVersion = useRef(0);
    const comparison = llm ? reconcileEvidence(evidence, llm, onSampleMask) : null;
    const importFile = async (file?: File) => {
        const version = ++importVersion.current;
        if (!file)
            return;
        try {
            if (file.size > MAX_LLM_MEASUREMENTS_BYTES)
                throw new Error("JSON гипотез слишком большой (максимум 512 КБ).");
            const next = parseLlmMeasurements(await file.text());
            if (version !== importVersion.current)
                return;
            setLlm(next);
            setError("");
            setNavigationError("");
        }
        catch (e) {
            if (version === importVersion.current)
                setError(e instanceof Error ? e.message : "Не удалось прочитать гипотезы LLM.");
        }
    };
    const download = (value: unknown, suffix: string) => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `opus-${evidence.source.requestId}.${suffix}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return <section className="ora-evidence-comparison" aria-label={__ui("\u0421\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0441 \u0433\u0438\u043F\u043E\u0442\u0435\u0437\u0430\u043C\u0438 LLM")}>
    <h3><LocalizedUi value={"\u0421\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0441 \u0433\u0438\u043F\u043E\u0442\u0435\u0437\u0430\u043C\u0438 LLM"}/></h3>
    <p><LocalizedUi value={"\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0438\u043C\u043F\u043E\u0440\u0442 opus-llm-measurements/v1. \u0421\u0440\u0430\u0432\u043D\u0438\u0432\u0430\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0431\u044A\u0451\u043C \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u043E\u0439 \u043C\u0435\u0442\u043A\u0438 \u0432 \u0442\u0435\u0445 \u0436\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u0430\u0445. \u0424\u0430\u0439\u043B \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u0437\u0430\u043F\u0443\u0441\u043A LLM, \u0435\u0451 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0441\u0442\u044C \u0438\u043B\u0438 \u0437\u0430\u044F\u0432\u043B\u0435\u043D\u043D\u044B\u0439 \u043E\u0445\u0432\u0430\u0442."}/></p>
    <div className="ora-evidence-actions"><button type="button" disabled={!evidence.observations.length} onClick={() => download(createLlmMeasurementTemplate(evidence), "llm-template")}><LocalizedUi value={"\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0448\u0430\u0431\u043B\u043E\u043D \u0433\u0438\u043F\u043E\u0442\u0435\u0437"}/></button></div>
    <small><LocalizedUi value={"\u0428\u0430\u0431\u043B\u043E\u043D \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u043F\u0440\u0438\u0432\u044F\u0437\u043A\u0443, \u043F\u0443\u0441\u0442\u044B\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F \u0438 \u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u043E\u0445\u0432\u0430\u0442. \u041E\u043D \u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442 LLM. \u0425\u0440\u0430\u043D\u0438\u0442\u0435 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E: \u0437\u0430\u0449\u0438\u0442\u0430 \u0434\u043B\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0441\u043A\u0438\u0445 \u0434\u0430\u043D\u043D\u044B\u0445 \u0432\u043D\u0435\u0448\u043D\u0438\u043C \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430\u043C \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430."}/></small>
    <p><LocalizedUi value={"\u0414\u043B\u044F \u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0439 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u043C\u043E\u0436\u043D\u043E \u0443\u043A\u0430\u0437\u0430\u0442\u044C \u0442\u043E\u0447\u043A\u0443 LPS \u0432 \u043C\u043C \u0438 SHA \u0442\u0435\u043A\u0443\u0449\u0435\u0439 \u043C\u0430\u0441\u043A\u0438. \u041F\u043E\u043F\u0430\u0434\u0430\u043D\u0438\u0435 \u0432 \u043C\u0435\u0442\u043A\u0443 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u044E, \u0430 \u0444\u043E\u043D \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u0435\u0451."}/></p>
    <label><LocalizedUi value={"JSON \u0433\u0438\u043F\u043E\u0442\u0435\u0437 LLM"}/><input type="file" accept=".json,application/json" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ""; }}/></label>
    <LocalizedUi value={error && <p role="alert" className="ora-evidence-error"><LocalizedUi value={error}/><LocalizedUi value={"\u041F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0438\u0439 \u0438\u043C\u043F\u043E\u0440\u0442, \u0435\u0441\u043B\u0438 \u043E\u043D \u0431\u044B\u043B, \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D."}/></p>}/>
    <LocalizedUi value={navigationError && <p role="alert" className="ora-evidence-error"><LocalizedUi value={navigationError}/></p>}/>
    <LocalizedUi value={comparison && <>
      <p><LocalizedUi value={llm!.producer.provider}/> · <LocalizedUi value={llm!.producer.model}/><LocalizedUi value={"\u00B7 \u043F\u0440\u043E\u0438\u0441\u0445\u043E\u0436\u0434\u0435\u043D\u0438\u0435 \u043D\u0435 \u0443\u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u0435\u043D\u043E"}/></p>
      <ul className="ora-comparison-list"><LocalizedUi value={comparison.comparisons.map((c, i) => <li key={c.claimId}>
        <strong><LocalizedUi value={c.status === "not_comparable" ? "Нельзя сопоставить" : c.status === "numeric_match" ? "Числа совпадают" : "Числовое расхождение"}/><LocalizedUi value={"\u00B7 \u043D\u0443\u0436\u043D\u0430 \u0432\u0440\u0430\u0447\u0435\u0431\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430"}/></strong>
        <p><LocalizedUi value={llm!.claims[i].statement}/></p>
        <p><LocalizedUi value={"\u041C\u0435\u0442\u043A\u0430:"}/><LocalizedUi value={evidence.observations.find(o => o.observationId === c.observationId)?.labelName ?? "отсутствует"}/><LocalizedUi value={". \u041E\u0431\u044A\u0451\u043C \u043C\u0430\u0441\u043A\u0438:"}/><LocalizedUi value={c.specialistVolumeMl === null ? "нет" : `${c.specialistVolumeMl.toPrecision(6)} мл`}/>; LLM: <LocalizedUi value={c.llmVolumeMl === null ? "нет" : `${c.llmVolumeMl.toPrecision(6)} мл`}/>.
          <LocalizedUi value={c.deltaMl !== null && ` Разность LLM − маска: ${c.deltaMl.toPrecision(6)} мл.`}/></p>
        <LocalizedUi value={c.reasons.length > 0 && <ul><LocalizedUi value={c.reasons.map(reason => <li key={reason}><LocalizedUi value={COMPARISON_REASONS[reason]}/></li>)}/></ul>}/>
        <LocalizedUi value={c.spatial ? <div className="ora-llm-anchor">
          <p><LocalizedUi value={"\u0422\u043E\u0447\u043A\u0430 LLM:"}/><LocalizedUi value={llm!.claims[i].anchor!.pointLpsMm.join("; ")}/><LocalizedUi value={"\u00B7 LPS, \u043C\u043C."}/></p>
          <p><LocalizedUi value={c.spatial.status === "outside_volume" ? "За пределами объёма" : c.spatial.status === "not_bound" ? "Привязка точки не подтверждена" :
                        c.spatial.relation === "target_label" ? "В точке находится целевая метка маски" : c.spatial.relation === "background" ? "В точке фон маски — это не исключает патологию" :
                            c.spatial.relation === "different_label" ? `В точке другая метка маски: ${c.spatial.sampledLabelId}` : "Точка внутри объёма; метка не проверена"}/>.</p>
          <LocalizedUi value={c.spatial.reasons.map((reason, i) => <p key={i}><LocalizedUi value={reason}/></p>)}/>
          <button type="button" disabled={c.spatial.status !== "in_volume" || c.spatial.sampledLabelId === null} onClick={() => {
                        const point = c.spatial?.pointLpsMm;
                        if (!point)
                            return;
                        try {
                            onNavigate(point, c.spatial!.sampledLabelId || null);
                            setNavigationError("");
                        }
                        catch {
                            setNavigationError("Не удалось перейти к точке LLM: проверьте активную серию и маску.");
                        }
                    }}><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0442\u043E\u0447\u043A\u0443 LLM \u0432 MPR"}/></button>
        </div> : <p><LocalizedUi value={"\u041F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u0430\u044F \u0442\u043E\u0447\u043A\u0430 LLM \u043D\u0435 \u043F\u0440\u0435\u0434\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0430."}/></p>}/>
      </li>)}/></ul>
      <div className="ora-evidence-actions">
        <button type="button" disabled={hasUnsavedReviewerNote} onClick={() => download(comparison, "comparison")}><LocalizedUi value={"\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0441\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435 JSON"}/></button>
        <EvidenceReportDownload evidence={evidence} llm={llm} onSampleMask={onSampleMask} hasUnsavedReviewerNote={hasUnsavedReviewerNote}/>
        <button type="button" onClick={() => { ++importVersion.current; setLlm(null); setError(""); setNavigationError(""); }}><LocalizedUi value={"\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0433\u0438\u043F\u043E\u0442\u0435\u0437\u044B LLM"}/></button>
      </div>
      <small><LocalizedUi value={"\u0421\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0435 \u0447\u0438\u0441\u0435\u043B \u043D\u0435 \u0434\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u0435. \u041F\u043E\u0440\u043E\u0433 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0437\u043D\u0430\u0447\u0438\u043C\u043E\u0441\u0442\u0438 \u043D\u0435 \u0437\u0430\u0434\u0430\u043D. \u041E\u0431\u0430 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430 \u043E\u0441\u0442\u0430\u044E\u0442\u0441\u044F \u0432\u0438\u0434\u043D\u044B; \u0441\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u043D\u0435 \u043F\u043E\u0434\u043F\u0438\u0441\u044B\u0432\u0430\u0435\u0442 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435."}/></small>
    </>}/>
  </section>;
}
