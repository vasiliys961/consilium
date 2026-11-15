"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useState } from "react";
import { buildEvidenceReport } from "../lib/evidence-report";
import type { SegmentationEvidence } from "../lib/segmentation-evidence";
import type { LlmMeasurements } from "../lib/evidence-reconciliation";
import type { Point3 } from "../lib/segmentation-mask";
export default function EvidenceReportDownload({ evidence, llm, onSampleMask, hasUnsavedReviewerNote = false }: {
    evidence: SegmentationEvidence;
    llm?: LlmMeasurements | null;
    onSampleMask?: (point: Point3) => number | null;
    hasUnsavedReviewerNote?: boolean;
}) {
    const __ui = useUiTranslator();
    const [error, setError] = useState("");
    const download = () => {
        try {
            const html = buildEvidenceReport(evidence, { llm, sampleMask: onSampleMask, generatedAt: new Date().toISOString() });
            const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = `opus-${evidence.source.requestId}.${llm ? "comparison" : "evidence"}.report.html`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setError("");
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось создать отчёт Evidence.");
        }
    };
    return <div className="ora-report-export">
    <button type="button" disabled={hasUnsavedReviewerNote} onClick={download}><LocalizedUi value={llm ? "Скачать отчёт с сопоставлением HTML" : "Скачать отчёт Evidence HTML"}/></button>
    <small><LocalizedUi value={"\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0444\u0430\u0439\u043B \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E; \u043F\u0435\u0447\u0430\u0442\u044C \u0438\u043B\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 PDF \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B \u0447\u0435\u0440\u0435\u0437 \u043C\u0435\u043D\u044E \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430. \u041E\u0442\u0447\u0451\u0442 \u2014 \u043D\u0435\u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043D\u044B\u0439 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A."}/></small>
    <LocalizedUi value={error && <p role="alert" className="ora-evidence-error"><LocalizedUi value={error}/></p>}/>
  </div>;
}
