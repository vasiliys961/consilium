"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useState } from "react";
import { sha256 } from "@noble/hashes/sha2.js";
import IchBloodReferenceReview from "./IchBloodReferenceReview";
import IchSecondModelComparison from "./IchSecondModelComparison";
import { parseIchAlternativeReport, ICH_CLASSES, ICH_CLASS_LABELS, type IchAlternativeClass, type IchAlternativeReport, } from "../lib/ianpan-ich-report";
import IchSourceNativeReview from "./IchSourceNativeReview";
import { groupIchResearchCandidateRegions } from "../lib/ianpan-ich-candidate-groups";
/**
 * Public-research JSON importer. Does not execute models or upload study data.
 * Original source image and anatomical registration are intentionally absent.
 */
export default function IanpanIchResearchResults() {
    const __ui = useUiTranslator();
    const [report, setReport] = useState<IchAlternativeReport | null>(null);
    const [loadingRealExample, setLoadingRealExample] = useState(false);
    const [error, setError] = useState("");
    const [minScore, setMinScore] = useState(0.5);
    const [type, setType] = useState<IchAlternativeClass | "all">("all");
    const [notes, setNotes] = useState("");
    const [originalModelSha, setOriginalModelSha] = useState<string | null>(null);
    const modelSha = (raw: string) => Array.from(sha256(new TextEncoder().encode(raw)), v => v.toString(16).padStart(2, "0")).join("");
    const spatialGroups = report ? groupIchResearchCandidateRegions(report) : null;
    const visible = (report?.candidates ?? []).filter(c => c.rawUncalibratedScore >= minScore && (type === "all" || c.class === type)).sort((a, b) => a.sliceIndexModelOrdered - b.sliceIndexModelOrdered ||
        b.rawUncalibratedScore - a.rawUncalibratedScore);
    return <section aria-label={__ui("\u0410\u043B\u044C\u0442\u0435\u0440\u043D\u0430\u0442\u0438\u0432\u043D\u044B\u0439 \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440 \u0432\u043D\u0443\u0442\u0440\u0438\u0447\u0435\u0440\u0435\u043F\u043D\u043E\u0433\u043E \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u044F")} style={{ padding: 14, border: "1px solid #688f81", borderRadius: 10, marginTop: 18 }}>
    <h3><LocalizedUi value={"\u041A\u0422 \u0433\u043E\u043B\u043E\u0432\u044B \u00B7 \u0430\u043B\u044C\u0442\u0435\u0440\u043D\u0430\u0442\u0438\u0432\u043D\u044B\u0439 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 ICH-\u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440"}/></h3>
    <p><LocalizedUi value={"\u0418\u043C\u043F\u043E\u0440\u0442 \u043A\u043B\u0430\u0441\u0441\u0438\u0444\u0438\u043A\u0430\u0446\u0438\u043E\u043D\u043D\u044B\u0445 \u043E\u0446\u0435\u043D\u043E\u043A \u0438 \u043E\u0431\u043B\u0430\u0441\u0442\u0435\u0439 \u043B\u043E\u043A\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u0438 \u043C\u043E\u0434\u0435\u043B\u0438"}/><strong> ianpan/ct-head-hemorrhage-detection</strong><LocalizedUi value={"\u043F\u043E\u0441\u043B\u0435 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0437\u0430\u043F\u0443\u0441\u043A\u0430 \u043D\u0430 \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u043E\u0439 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0439 \u041A\u0422 \u0441 \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u043E\u0439 \u0441\u0442\u0435\u043F\u0435\u043D\u044C\u044E \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 HU. \u041D\u0430 \u044D\u0442\u043E\u043C \u044D\u043A\u0440\u0430\u043D\u0435 \u0432\u044B\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u0435 \u043C\u043E\u0434\u0435\u043B\u0438 \u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F, \u043D\u0438\u043A\u0430\u043A\u0438\u0435 DICOM \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u044E\u0442\u0441\u044F."}/></p>
    <div style={{ padding: "10px 0" }}>
      <button type="button" disabled={loadingRealExample} onClick={async () => {
            setReport(null);
            setOriginalModelSha(null);
            setError("");
            setNotes("");
            setLoadingRealExample(true);
            try {
                const response = await fetch("/examples/ianpan-ich-real-figshare-run-38734338486.json", { cache: "no-store" });
                if (!response.ok)
                    throw Error("Настоящий публичный результат сейчас недоступен.");
                const originalText = await response.text();
                const checked = parseIchAlternativeReport(originalText);
                if (checked.source.niftiSha256 !== "0543a46065314468fe7ab18b9187277ae1affc4e7c864d0fd8ae608afa554a95" ||
                    checked.source.modelOrderedSliceCount !== 25 ||
                    checked.source.publishedFigshareHuLikeWithoutOriginalDicomRescaleAudit !== true ||
                    checked.source.sourceOriginalDicomHURescaleIndependentlyVerified !== false ||
                    checked.source.referenceLabelsOnlyPerihematomalEdema !== true ||
                    checked.candidates.length !== 14 ||
                    checked.seriesRawUncalibratedScores.intraparenchymal !== 0.989428 ||
                    checked.seriesRawUncalibratedScores.any !== 0.993365 ||
                    checked.externalExpertHemorrhageLocalizationComparisonPerformed !== false)
                    throw Error("Публичный результат не соответствует проверенному запуску и источнику.");
                setOriginalModelSha(modelSha(originalText));
                setReport(checked);
            }
            catch (e) {
                setError(e instanceof Error ? e.message : "Неверные исходные данные.");
            }
            finally {
                setLoadingRealExample(false);
            }
        }}>
        <LocalizedUi value={loadingRealExample ? "Проверка реальных находок…" : "Показать настоящий результат ICH · 25 срезов"}/>
      </button>
      <p><small><a href="https://github.com/vasiliys961/opus-radiology-ai/actions/runs/38734338486" target="_blank" rel="noopener noreferrer"><LocalizedUi value={"\u041F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u043C\u044B\u0439 \u0440\u0435\u0430\u043B\u044C\u043D\u044B\u0439 CPU-\u0437\u0430\u043F\u0443\u0441\u043A \u211638734338486"}/></a>
        <LocalizedUi value={" "}/><LocalizedUi value={"\u00B7 14 \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u00AB\u043A\u043B\u0430\u0441\u0441 \u00D7 \u0441\u0440\u0435\u0437\u00BB \u043D\u0430 7 \u0441\u0440\u0435\u0437\u0430\u0445, \u0430 \u041D\u0415 14 \u0433\u0435\u043C\u0430\u0442\u043E\u043C. \u042D\u0442\u043E \u043E\u0434\u043D\u0430 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u0430\u044F \u041A\u0422 \u0438\u0437 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u0434\u0430\u0442\u0430\u0441\u0435\u0442\u0430, \u043D\u0435 \u0430\u043D\u0430\u043B\u0438\u0437 \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0430. \u042D\u0442\u0430\u043B\u043E\u043D\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u0438 \u0433\u0435\u043C\u0430\u0442\u043E\u043C\u044B \u043D\u0435\u0442."}/></small></p>
    </div>
    <label><LocalizedUi value={"JSON-\u043E\u0442\u0447\u0451\u0442 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F \u043F\u0440\u0435\u0434\u043E\u0431\u0443\u0447\u0435\u043D\u043D\u043E\u0439 \u043C\u043E\u0434\u0435\u043B\u0438 (\u0434\u043E 2 \u041C\u0438\u0411)"}/><input type="file" accept=".json,application/json" onChange={async (e) => {
            const f = e.target.files?.[0];
            e.currentTarget.value = "";
            setReport(null);
            setOriginalModelSha(null);
            setError("");
            setNotes("");
            if (!f)
                return;
            try {
                if (f.size > 2 * 1024 * 1024)
                    throw Error("Слишком большой файл отчёта.");
                const originalText = await f.text();
                const checked = parseIchAlternativeReport(originalText);
                setOriginalModelSha(modelSha(originalText));
                setReport(checked);
            }
            catch (err) {
                setError(err instanceof Error ? err.message : "Неверный JSON-отчёт.");
            }
        }}/>
    </label>
    <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
    <LocalizedUi value={!report ? <p><small><LocalizedUi value={"\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0438\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u043E\u0433\u043E \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0435\u0433\u043E \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430. \u041F\u0443\u0441\u0442\u043E\u0439 \u044D\u043A\u0440\u0430\u043D \u043D\u0435 \u043E\u0437\u043D\u0430\u0447\u0430\u0435\u0442 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u044F."}/></small></p> : <div>
      <p role="alert"><strong><LocalizedUi value={"\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C, \u041D\u0415 \u0434\u0438\u0430\u0433\u043D\u043E\u0437."}/></strong><LocalizedUi value={"JSON \u043B\u0438\u0448\u044C \u0434\u0435\u043A\u043B\u0430\u0440\u0438\u0440\u0443\u0435\u0442 \u0437\u0430\u043F\u0443\u0441\u043A \u0432\u0435\u0441\u043E\u0432; \u043F\u043E\u0434\u043B\u0438\u043D\u043D\u043E\u0441\u0442\u044C \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F, \u0440\u0435\u0430\u043B\u044C\u043D\u0430\u044F HU-\u043A\u0430\u043B\u0438\u0431\u0440\u043E\u0432\u043A\u0430, \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0441\u0442\u044C \u043E\u0440\u0438\u0435\u043D\u0442\u0430\u0446\u0438\u0438 \u0438 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0435 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u0435 \u0437\u0434\u0435\u0441\u044C \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E\u0442\u0441\u044F. \u0414\u043B\u044F \u043D\u043E\u0432\u044B\u0445 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u043E\u0432 \u0432\u044B\u0447\u0438\u0441\u043B\u044F\u0435\u0442\u0441\u044F \u043F\u043E\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u043E\u0431\u043B\u0430\u0441\u0442\u0438 \u0432 \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u0430\u0445 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 NIfTI, \u043D\u043E \u0441\u0432\u044F\u0437\u044C \u0441 DICOM SOP \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u0441\u043F\u0435\u0446\u0438\u0430\u043B\u0438\u0441\u0442\u043E\u043C \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0442. \u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432 \u043D\u0435 \u043F\u043E\u0437\u0432\u043E\u043B\u044F\u0435\u0442 \u0438\u0441\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u0435."}/></p>
      <p><LocalizedUi value={"\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438: \u043F\u043E\u043B\u043D\u044B\u0439 SHA-256 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0439 NIfTI \u2014"}/><code><LocalizedUi value={report.source.niftiSha256}/></code><LocalizedUi value={". \u041C\u043E\u0434\u0435\u043B\u044C:"}/><LocalizedUi value={report.model.id}/> (<LocalizedUi value={report.model.revision}/><LocalizedUi value={"); \u0437\u0430\u044F\u0432\u043B\u0435\u043D\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C \u2014"}/><LocalizedUi value={report.runtime.executionDevice.toUpperCase()}/>, <LocalizedUi value={report.runtime.elapsedSeconds.toFixed(1)}/><LocalizedUi value={"\u0441. \u041C\u043E\u0434\u0435\u043B\u044C \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043B\u0430"}/><LocalizedUi value={report.source.modelOrderedSliceCount}/><LocalizedUi value={"\u0443\u043F\u043E\u0440\u044F\u0434\u043E\u0447\u0435\u043D\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u043E\u0432. \u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u043A"}/><strong><LocalizedUi value={"\u0434\u0440\u0443\u0433\u043E\u0439 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0439 \u041A\u0422"}/></strong><LocalizedUi value={", \u0430 \u043D\u0435 \u043A \u0442\u0435\u043A\u0443\u0449\u0435\u0439 DICOM-\u0441\u0435\u0440\u0438\u0438."}/></p>
      <LocalizedUi value={report.source.publishedFigshareHuLikeWithoutOriginalDicomRescaleAudit === true &&
                <p role="alert"><strong><LocalizedUi value={"\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A PHE-SICH-CT-IDS: HU \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u0430\u0432\u0434\u043E\u043F\u043E\u0434\u043E\u0431\u043D\u044B."}/></strong><LocalizedUi value={"\u041E\u0442\u043A\u0440\u044B\u0442\u0430\u044F \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F NIfTI \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F, \u0441\u043E\u0432\u043C\u0435\u0441\u0442\u0438\u043C\u044B\u0435 \u0441\u043E \u0448\u043A\u0430\u043B\u043E\u0439 HU, \u043D\u043E \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0435 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0435 DICOM RescaleSlope/Intercept \u043D\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u044B. \u041E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043D\u0430\u044F \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0430 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u043A \u043F\u0435\u0440\u0438\u0444\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u043C\u0443 \u043E\u0442\u0451\u043A\u0443, \u041D\u0415 \u043A \u0433\u0440\u0430\u043D\u0438\u0446\u0430\u043C \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u044F. \u0417\u0434\u0435\u0441\u044C \u043D\u0435\u0442 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F \u0442\u043E\u0447\u043D\u043E\u0433\u043E \u043E\u0447\u0430\u0433\u0430, \u043F\u043B\u043E\u0449\u0430\u0434\u0438, \u0433\u0435\u043C\u0430\u0442\u043E\u043C\u043D\u043E\u0433\u043E \u043E\u0431\u044A\u0451\u043C\u0430 \u0438\u043B\u0438 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0447\u0443\u0432\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u0438. \u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u043D\u0435\u0439\u0440\u043E\u0441\u0435\u0442\u0438 \u2014 \u043D\u0435\u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0435 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0435 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F."}/></p>}/>
      <h4><LocalizedUi value={"\u041E\u0446\u0435\u043D\u043A\u0438 \u0448\u0435\u0441\u0442\u0438 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0439 \u043D\u0430 \u0443\u0440\u043E\u0432\u043D\u0435 \u0441\u0435\u0440\u0438\u0438"}/></h4>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 8 }}>
        <LocalizedUi value={ICH_CLASSES.map(k => <div key={k} style={{ padding: 8, border: "1px solid #8b9b97", borderRadius: 6 }}>
          <strong><LocalizedUi value={ICH_CLASS_LABELS[k]}/></strong>
          <div><LocalizedUi value={report.seriesRawUncalibratedScores[k].toFixed(3)}/></div>
        </div>)}/>
      </div>
      <p><small><LocalizedUi value={"\u0427\u0438\u0441\u043B\u0430 \u2014 \u043D\u0435\u043A\u0430\u043B\u0438\u0431\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0432\u044B\u0445\u043E\u0434\u043D\u044B\u0435 \u043E\u0446\u0435\u043D\u043A\u0438 \u043D\u0435\u0439\u0440\u043E\u0441\u0435\u0442\u0438, \u041D\u0415 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0432\u0435\u0440\u043E\u044F\u0442\u043D\u043E\u0441\u0442\u044C \u0437\u0430\u0431\u043E\u043B\u0435\u0432\u0430\u043D\u0438\u044F \u0438 \u041D\u0415 \u0434\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u043E \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u043E\u0447\u0430\u0433\u0430."}/></small></p>
      <LocalizedUi value={spatialGroups && <section aria-label={__ui("\u041F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0435 \u0433\u0440\u0443\u043F\u043F\u044B \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0445 ICH-\u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432")} style={{ border: "1px solid #8b9b97", padding: 10, borderRadius: 8, margin: "12px 0" }}>
        <strong><LocalizedUi value={"\u041F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0435 \u0433\u0440\u0443\u043F\u043F\u044B \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432 \u2014 \u043D\u0435 \u043F\u043E\u0434\u0441\u0447\u0451\u0442 \u0433\u0435\u043C\u0430\u0442\u043E\u043C"}/></strong>
        <p role="status"><LocalizedUi value={spatialGroups.groups.length}/><LocalizedUi value={"\u0433\u0440\u0443\u043F\u043F \u043F\u043E \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u044E \u043B\u043E\u043A\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u0438 \u043D\u0430 \u0441\u043E\u0441\u0435\u0434\u043D\u0438\u0445 \u0441\u0440\u0435\u0437\u0430\u0445. \u041F\u043E\u0432\u0442\u043E\u0440\u044F\u044E\u0449\u0438\u0435\u0441\u044F \u043A\u0430\u043D\u0430\u043B\u044B \u00AB\u043B\u044E\u0431\u043E\u0435 \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u0435\u00BB:"}/><LocalizedUi value={" "}/><LocalizedUi value={spatialGroups.anyCategoryDuplicatesSuppressed}/><LocalizedUi value={"\u043D\u0435 \u0437\u0430\u0441\u0447\u0438\u0442\u0430\u043D\u044B \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E. \u041D\u0435\u043B\u043E\u043A\u0430\u043B\u0438\u0437\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u043A\u043B\u0430\u0441\u0441\u0438\u0444\u0438\u043A\u0430\u0446\u0438\u043E\u043D\u043D\u044B\u0445 \u0437\u0430\u043F\u0438\u0441\u0435\u0439:"}/><LocalizedUi value={" "}/><LocalizedUi value={spatialGroups.unlocalizedClassifierEntries}/>.</p>
        <p><small><LocalizedUi value={"\u0413\u0440\u0443\u043F\u043F\u044B \u0432\u044B\u0447\u0438\u0441\u043B\u0435\u043D\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u0438\u0437 \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u0440\u0430\u043C\u043E\u043A \u043D\u0430 \u0441\u043E\u0441\u0435\u0434\u043D\u0438\u0445 \u0441\u0440\u0435\u0437\u0430\u0445. \u042D\u0442\u043E \u041D\u0415 \u043A\u043E\u043D\u0442\u0443\u0440 \u0433\u0435\u043C\u0430\u0442\u043E\u043C\u044B, \u043D\u0435 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u0435 \u043E\u0431\u044A\u0451\u043C\u0430, \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u043E\u0435 \u0447\u0438\u0441\u043B\u043E \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0445 \u043E\u0447\u0430\u0433\u043E\u0432 \u0438 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u0434\u0438\u0430\u0433\u043D\u043E\u0437\u0430."}/></small></p>
        <LocalizedUi value={spatialGroups.groups.map(g => <div key={g.id} style={{ borderTop: "1px solid #8b9b97", padding: "8px 0" }}>
          <strong><LocalizedUi value={ICH_CLASS_LABELS[g.candidateClass]}/></strong>
          <div><LocalizedUi value={"\u0421\u0440\u0435\u0437\u044B \u043C\u043E\u0434\u0435\u043B\u0438"}/><LocalizedUi value={g.firstModelSliceZeroBased + 1}/>–<LocalizedUi value={g.lastModelSliceZeroBased + 1}/>
            <LocalizedUi value={" "}/>· <LocalizedUi value={g.modelSlicesWithRegions}/><LocalizedUi value={"\u0441\u0440\u0435\u0437\u043E\u0432 \u0441 \u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0439 \u043E\u0431\u043B\u0430\u0441\u0442\u044C\u044E"}/><LocalizedUi value={" "}/><LocalizedUi value={"\u00B7 \u043C\u0430\u043A\u0441\u0438\u043C\u0430\u043B\u044C\u043D\u0430\u044F \u043E\u0446\u0435\u043D\u043A\u0430"}/><LocalizedUi value={g.peakRawUncalibratedScore.toFixed(3)}/></div>
          <div><LocalizedUi value={"\u041E\u0445\u0432\u0430\u0442\u044B\u0432\u0430\u044E\u0449\u0430\u044F \u043E\u0431\u043B\u0430\u0441\u0442\u044C 512 \u00D7 512:"}/><LocalizedUi value={g.modelInputBoundingEnvelopeXY.join(" / ")}/></div>
          <LocalizedUi value={g.nativeNiftiBoundingEnvelopeXYZ && <div><LocalizedUi value={"\u0413\u0440\u0430\u043D\u0438\u0446\u044B \u043D\u0430\u0442\u0438\u0432\u043D\u044B\u0445 \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 NIfTI (XYZ):"}/><LocalizedUi value={" "}/><LocalizedUi value={g.nativeNiftiBoundingEnvelopeXYZ.join(" / ")}/><LocalizedUi value={". \u042D\u0442\u043E \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0438\u0432\u0430\u044E\u0449\u0430\u044F \u0440\u0430\u043C\u043A\u0430, \u043D\u0435 \u0433\u0435\u043C\u0430\u0442\u043E\u043C\u043D\u044B\u0439 \u043E\u0431\u044A\u0451\u043C."}/></div>}/>
          <button type="button" onClick={() => {
                        setType(g.candidateClass);
                        setMinScore(0.5);
                    }}><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u043E\u0441\u0440\u0435\u0437\u043E\u0432\u044B\u0435 \u0437\u0430\u043F\u0438\u0441\u0438 \u044D\u0442\u043E\u0439 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438"}/></button>
        </div>)}/>
      </section>}/>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
        <label><LocalizedUi value={"\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F"}/><select value={type} onChange={e => setType(e.target.value as IchAlternativeClass | "all")}>
          <option value="all"><LocalizedUi value={"\u0412\u0441\u0435 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438"}/></option>
          <LocalizedUi value={ICH_CLASSES.map(k => <option key={k} value={k}><LocalizedUi value={ICH_CLASS_LABELS[k]}/></option>)}/>
        </select></label>
        <label><LocalizedUi value={"\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u043F\u043E\u0440\u043E\u0433"}/><LocalizedUi value={minScore.toFixed(2)}/> <input type="range" min="0.5" max="1" step="0.05" value={minScore} onChange={e => setMinScore(Number(e.target.value))}/></label>
      </div>
      <p role="status"><LocalizedUi value={"\u041F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u043E"}/><LocalizedUi value={report.candidates.length}/><LocalizedUi value={"\u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u00AB\u043A\u043B\u0430\u0441\u0441 \u00D7 \u0441\u0440\u0435\u0437\u00BB (\u043D\u0435 \u0447\u0438\u0441\u043B\u043E \u0433\u0435\u043C\u0430\u0442\u043E\u043C), \u043F\u043E \u0444\u0438\u043B\u044C\u0442\u0440\u0443"}/><LocalizedUi value={visible.length}/><LocalizedUi value={". \u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u044B \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u044B \u0432\u0440\u0430\u0447\u043E\u043C."}/></p>
      <div style={{ maxHeight: 300, overflowY: "auto" }}>
        <LocalizedUi value={visible.map(c => <div key={c.sliceIndexModelOrdered + "/" + c.class} style={{ margin: "8px 0", padding: 8, borderBottom: "1px solid #8b9b97" }}>
          <strong><LocalizedUi value={ICH_CLASS_LABELS[c.class]}/></strong><LocalizedUi value={"\u00B7 \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u0441\u0440\u0435\u0437"}/><LocalizedUi value={" "}/><LocalizedUi value={c.sliceIndexModelOrdered + 1}/>/<LocalizedUi value={report.source.modelOrderedSliceCount}/>
          <LocalizedUi value={" "}/>· score <LocalizedUi value={c.rawUncalibratedScore.toFixed(3)}/>
          <div><LocalizedUi value={"\u041F\u043B\u043E\u0449\u0430\u0434\u044C \u043A\u0430\u0440\u0442\u044B \u043F\u0440\u0438 \u043F\u043E\u0440\u043E\u0433\u0435 0,5:"}/><LocalizedUi value={c.heatmapPositivePixelsAtPoint5}/>
            <LocalizedUi value={" "}/><LocalizedUi value={"\u043F\u0438\u043A\u0441\u0435\u043B\u0435\u0439 \u0438\u0437 \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u0445 512 \u00D7 512 (\u043D\u0435 \u043F\u043B\u043E\u0449\u0430\u0434\u044C \u043E\u0447\u0430\u0433\u0430 \u0432 \u043C\u043C\u00B2)."}/></div>
          <div><LocalizedUi value={c.modelInputBoundingBoxXY ?
                    `Рамка на предобработанном изображении: ${c.modelInputBoundingBoxXY.join(" / ")}` :
                    "Карты выше порога 0,5 нет; классификация сама по себе не локализует очаг."}/>
          </div>
          <LocalizedUi value={c.sourceVoxelProjection && <div style={{ marginTop: 6, padding: 7, border: "1px dashed #9b8298", borderRadius: 6 }}>
            <strong><LocalizedUi value={"\u0420\u0430\u0441\u0447\u0451\u0442\u043D\u0430\u044F \u043B\u043E\u043A\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 NIfTI (\u043D\u0435 \u0434\u0438\u0430\u0433\u043D\u043E\u0437)"}/></strong>
            <div><LocalizedUi value={"\u041D\u0430\u0442\u0438\u0432\u043D\u044B\u0435 \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u044B \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439 XYZ, \u0440\u0430\u043C\u043A\u0430:"}/><LocalizedUi value={" "}/>
              <LocalizedUi value={c.sourceVoxelProjection.boundingBoxNativeNiftiXYZ.join(" / ")}/></div>
            <div><LocalizedUi value={"\u0413\u0440\u0430\u043D\u0438\u0446\u044B \u0432 RAS, \u043C\u043C:"}/><LocalizedUi value={" "}/>
              <LocalizedUi value={c.sourceVoxelProjection.boundingBoxWorldRasMm.join(" / ")}/></div>
            <LocalizedUi value={c.sourceVoxelProjection.trimmedOutsideOriginalCT &&
                        <div><LocalizedUi value={"\u0427\u0430\u0441\u0442\u044C \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u043E\u0439 \u0440\u0430\u043C\u043A\u0438 \u043D\u0430\u0445\u043E\u0434\u0438\u0442\u0441\u044F \u0432\u043D\u0435 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E \u043F\u043E\u043B\u044F \u041A\u0422; \u043E\u0431\u043B\u0430\u0441\u0442\u044C \u043E\u0431\u0440\u0435\u0437\u0430\u043D\u0430."}/></div>}/>
            <small><LocalizedUi value={"\u0413\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u044F \u0440\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u043D\u0430 \u043E\u0431\u0440\u0430\u0442\u043D\u044B\u043C \u043F\u0440\u0435\u043E\u0431\u0440\u0430\u0437\u043E\u0432\u0430\u043D\u0438\u0435\u043C \u043E\u0440\u0438\u0435\u043D\u0442\u0430\u0446\u0438\u0438 LPS \u0438 \u0434\u043E\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F \u0434\u043E 512 \u00D7 512. \u041D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u0430\u044F \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0441\u043E\u0432\u043C\u0435\u0449\u0435\u043D\u0438\u044F \u0438 \u0441\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0441 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u043E\u0439 \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u044B."}/></small>
          </div>}/>
          <LocalizedUi value={c.sourceVoxelProjection === null && <small><LocalizedUi value={"\u041F\u0440\u043E\u0435\u043A\u0446\u0438\u044F \u043D\u0430 NIfTI \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442: \u043A\u0430\u0440\u0442\u0430 \u043F\u0443\u0441\u0442\u0430 \u043B\u0438\u0431\u043E \u0435\u0451 \u043E\u0431\u043B\u0430\u0441\u0442\u044C \u043B\u0435\u0436\u0438\u0442 \u0432 \u043F\u043E\u043B\u044F\u0445 \u0434\u043E\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F \u043C\u043E\u0434\u0435\u043B\u0438."}/></small>}/>
        </div>)}/>
      </div>
      <IchSourceNativeReview key={report.source.niftiSha256 + report.runtime.elapsedSeconds} report={report}/>
      <LocalizedUi value={originalModelSha && <IchSecondModelComparison key={"second-" + originalModelSha} first={report} originalFirstSha={originalModelSha}/>}/>
      <LocalizedUi value={originalModelSha && <IchBloodReferenceReview key={originalModelSha} model={report} originalModelReportSha256={originalModelSha}/>}/>
      <label style={{ display: "block", marginTop: 12 }}><LocalizedUi value={"\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 \u0432\u0440\u0430\u0447\u0430-\u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044F (\u043D\u0435 \u0443\u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u0435\u043D)"}/><textarea rows={2} maxLength={1500} value={notes} onChange={e => setNotes(e.target.value)} placeholder={__ui("\u0427\u0442\u043E \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u041A\u0422, \u0441\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0441 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u043E\u0439\u2026")} style={{ display: "block", width: "100%" }}/>
      </label>
      <button type="button" onClick={() => {
                // The export remains a research observation, not a signed patient record.
                const exportData = {
                    schema: "opus-ianpan-ich-local-unsigned-review/v1",
                    scope: "separate_public_research_study_only",
                    sourceNiftiSha256: report.source.niftiSha256,
                    modelId: report.model.id, modelRevision: report.model.revision,
                    candidateCount: report.candidates.length,
                    researchSpatialCandidateGroups: spatialGroups?.groups.length ?? 0,
                    spatialGroupsAreProvenHematomas: false,
                    reviewerNote: notes,
                    modelToSourceCoordinatesVerified: false,
                    sourceHUIndependentlyVerified: false,
                    publishedSourceHuOnlyPlausible: report.source.publishedFigshareHuLikeWithoutOriginalDicomRescaleAudit === true,
                    publishedReferenceOnlyPerihematomalEdema: report.source.referenceLabelsOnlyPerihematomalEdema === true,
                    patientDicomLinked: false,
                    automatedDiagnosis: false,
                    clinicalValidation: false,
                    absenceOfHemorrhageEstablished: false,
                };
                const url = URL.createObjectURL(new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" }));
                const a = document.createElement("a");
                a.href = url;
                a.download = "opus-ich-alternative-unsigned-research-review.json";
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}><LocalizedUi value={"\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u043D\u0435\u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043D\u0443\u044E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0443\u044E \u0437\u0430\u043C\u0435\u0442\u043A\u0443"}/></button><LocalizedUi value={" "}/>
      <button type="button" onClick={() => {
                setReport(null);
                setOriginalModelSha(null);
                setNotes("");
                setError("");
            }}><LocalizedUi value={"\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442"}/></button>
      <p><small><LocalizedUi value={"\u0412 \u043D\u043E\u0432\u044B\u0445 \u043E\u0442\u0447\u0451\u0442\u0430\u0445 \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u044B \u043E\u0431\u043B\u0430\u0441\u0442\u0435\u0439 \u0442\u0435\u043F\u0435\u0440\u044C \u0432\u044B\u0447\u0438\u0441\u043B\u044F\u044E\u0442\u0441\u044F \u0432 \u043D\u0430\u0442\u0438\u0432\u043D\u044B\u0445 \u0432\u043E\u043A\u0441\u0435\u043B\u044F\u0445 NIfTI \u043E\u0431\u0440\u0430\u0442\u043D\u044B\u043C \u043F\u0440\u0435\u043E\u0431\u0440\u0430\u0437\u043E\u0432\u0430\u043D\u0438\u0435\u043C \u0438\u0437 \u043C\u043E\u0434\u0435\u043B\u0438; \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0441\u0432\u044F\u0437\u0430\u043D SHA-256. \u042D\u0442\u043E \u043D\u0435 \u043E\u0442\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u043F\u0438\u043A\u0441\u0435\u043B\u0435\u0439, \u043D\u0435 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u0430\u044F \u0441\u0435\u0433\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u044F \u0438 \u043D\u0435 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u044F \u0441 DICOM. \u0414\u043B\u044F \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0438 \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C \u0432\u0440\u0430\u0447 \u0438 \u0432\u043D\u0435\u0448\u043D\u044F\u044F \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F."}/></small></p>
    </div>}/>
  </section>;
}
